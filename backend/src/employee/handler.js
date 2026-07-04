// Employee / Survey service. Authenticated solely by the magic-link token
// (Token Validator is folded in here). Backed by Aurora (RDS) via the Data API.
//   GET  /form?t=TOKEN  → who the form is for + their survey(s) + project options
//   POST /submit        → store the submission (+ digital assets), burn the token
const { randomUUID } = require('crypto');
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');
const { TranscribeClient, StartTranscriptionJobCommand, GetTranscriptionJobCommand, DeleteTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { json, parseBody } = require('../shared/http');
const { rows, one, transaction } = require('../shared/sql');
const { validateToken, consumeToken } = require('../shared/tokens');

const s3 = new S3Client({});
const lambda = new LambdaClient({});
const transcribe = new TranscribeClient({});
const UPLOADS_BUCKET = process.env.UPLOADS_BUCKET;
const UPLOADS_KMS_KEY = process.env.UPLOADS_KMS_KEY_ID;
const PROCESSING_FN = process.env.PROCESSING_FN;
const UPLOAD_URL_TTL = 300; // seconds the presigned PUT URL stays valid

// file extension → Transcribe MediaFormat (browser recorders emit webm or mp4)
const TRANSCRIBE_FORMAT = { webm: 'webm', mp4: 'mp4', m4a: 'mp4', mp3: 'mp3', wav: 'wav', flac: 'flac', ogg: 'ogg', amr: 'amr' };

const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.resource || event.path || '';
  try {
    if (method === 'OPTIONS') return json(200, {});
    if (method === 'GET' && path.includes('/form')) return getForm(event);
    if (method === 'POST' && path.includes('/upload-url')) return uploadUrl(event);
    if (path.includes('/transcribe')) {
      if (method === 'POST') return transcribeStart(event);
      if (method === 'GET') return transcribeResult(event);
    }
    if (method === 'POST' && path.includes('/submit')) return submit(event);
    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal error' });
  }
};

// Mint a short-lived presigned PUT URL so the browser can upload an audio/file
// asset straight to S3. The returned bucket+key are then sent back in /submit.
async function uploadUrl(event) {
  const body = parseBody(event);
  const tok = await validateToken(body.token);
  if (!tok) return json(401, { error: 'This link is invalid, already used, or expired.' });

  const assetType = body.asset_type === 'audio' ? 'audio' : 'file';
  const safeName = (body.filename || 'upload.bin').replace(/[^\w.\-]/g, '_');
  const contentType = body.content_type || 'application/octet-stream';
  // partition by tenant + project-user so objects are easy to trace/clean up
  const key = `uploads/${tok.tenant_id}/${tok.project_user_mapping_id}/${randomUUID()}/${safeName}`;

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: UPLOADS_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_URL_TTL }
  );

  // The client PUTs the file to `url` with the SAME Content-Type, then passes
  // { asset_type, bucket_name: bucket, file_name: key } into /submit.
  return json(200, {
    url,
    bucket: UPLOADS_BUCKET,
    key,
    asset_type: assetType,
    contentType,
    expiresIn: UPLOAD_URL_TTL,
  });
}

// ── In-form dictation: transcribe a just-recorded clip so the text can be
//    dropped into the response box. POST starts the job, GET polls for it. ────
async function transcribeStart(event) {
  const body = parseBody(event);
  const tok = await validateToken(body.token);
  if (!tok) return json(401, { error: 'This link is invalid, already used, or expired.' });
  if (!body.bucket || !body.key) return json(400, { error: 'bucket and key are required' });

  const ticket = randomUUID();
  const ext = (body.key.split('.').pop() || '').toLowerCase();
  await transcribe.send(new StartTranscriptionJobCommand({
    TranscriptionJobName: `tower5form_${ticket}`,
    LanguageCode: 'en-US',
    MediaFormat: TRANSCRIBE_FORMAT[ext] || 'webm',
    Media: { MediaFileUri: `s3://${body.bucket}/${body.key}` },
    OutputBucketName: body.bucket,
    OutputKey: `transcripts/${ticket}.json`,
    ...(UPLOADS_KMS_KEY ? { OutputEncryptionKMSKeyId: UPLOADS_KMS_KEY } : {}),
  }));
  return json(200, { ticket });
}

async function transcribeResult(event) {
  const q = event.queryStringParameters || {};
  const tok = await validateToken(q.t || q.token);
  if (!tok) return json(401, { error: 'This link is invalid, already used, or expired.' });
  if (!q.ticket) return json(400, { error: 'ticket is required' });

  let job;
  try {
    const r = await transcribe.send(new GetTranscriptionJobCommand({ TranscriptionJobName: `tower5form_${q.ticket}` }));
    job = r.TranscriptionJob;
  } catch {
    return json(404, { error: 'Unknown transcription ticket' });
  }
  const status = job && job.TranscriptionJobStatus;
  if (status === 'FAILED') { await cleanupTranscription(q.ticket, job); return json(200, { status: 'failed' }); }
  if (status !== 'COMPLETED') return json(200, { status: 'processing' });

  const obj = await s3.send(new GetObjectCommand({ Bucket: UPLOADS_BUCKET, Key: `transcripts/${q.ticket}.json` }));
  const data = JSON.parse(await streamToString(obj.Body));
  const text = ((data.results && data.results.transcripts) || []).map((t) => t.transcript).join('\n');

  // The audio was only a means to the transcript — drop it, the transcript JSON,
  // and the Transcribe job now that we've extracted the text.
  await cleanupTranscription(q.ticket, job);
  return json(200, { status: 'done', text });
}

// Best-effort cleanup of dictation artifacts (never blocks the response).
async function cleanupTranscription(ticket, job) {
  const tasks = [];
  const uri = job && job.Media && job.Media.MediaFileUri;
  if (uri && uri.startsWith('s3://')) {
    const rest = uri.slice(5);
    const i = rest.indexOf('/');
    if (i > 0) tasks.push(s3.send(new DeleteObjectCommand({ Bucket: rest.slice(0, i), Key: rest.slice(i + 1) })));
  }
  tasks.push(s3.send(new DeleteObjectCommand({ Bucket: UPLOADS_BUCKET, Key: `transcripts/${ticket}.json` })));
  tasks.push(transcribe.send(new DeleteTranscriptionJobCommand({ TranscriptionJobName: `tower5form_${ticket}` })));
  await Promise.allSettled(tasks);
}

// Surveys for the project this token belongs to (surveys are project-level).
async function surveysForProject(projectId) {
  return rows(
    `select id as survey_id, title, feedback_type
     from surveys
     where project_uuid = :p::uuid
     order by created_at desc`,
    { p: projectId }
  );
}

// The catalog options available on a project (phases/tracks/priority junctures),
// resolved from the per-project mapping tables — the form's dropdowns.
// The options THIS user was assigned by their tenant admin (a subset of the
// catalog). Each option is { id: <project_*_mapping id stored on the
// submission>, name }, grouped into phase / track / priority(=juncture).
async function optionsForUser(pumId) {
  const r = await rows(
    `select uo.kind, uo.mapping_uuid as id,
            coalesce(ph.phase_name, tr.track_name, jc.juncture_name) as name
       from user_option uo
       left join project_phase_mapping pm on pm.id = uo.mapping_uuid
       left join project_phases ph on ph.id = pm.project_phases_uuid
       left join project_track_mapping tm on tm.id = uo.mapping_uuid
       left join project_tracks tr on tr.id = tm.project_tracks_uuid
       left join project_priority_juncture_mapping jm on jm.id = uo.mapping_uuid
       left join project_priority_junctures jc on jc.id = jm.project_junctures_uuid
      where uo.project_user_mapping_uuid = :pum::uuid
      order by name`,
    { pum: pumId }
  );
  const out = { phase: [], track: [], priority: [] };
  for (const x of r) {
    const key = x.kind === 'juncture' ? 'priority' : x.kind;
    if (out[key]) out[key].push({ id: x.id, name: x.name });
  }
  return out;
}

// The example shown for the employee's role on this project ("see example for
// your role"). Returns '' until per-role examples are configured (Stage 3).
async function exampleForUser(projectUserMappingId) {
  const r = await one(
    `select e.example_text
       from project_user_role_mapping purm
       join project_roles_mapping prm on prm.id = purm.project_roles_mapping_uuid
       join role_examples e on e.role_uuid = prm.roles_uuid
      where purm.project_user_mapping_uuid = :pum::uuid and coalesce(purm.is_deleted,false) = false
      order by e.created_at desc limit 1`,
    { pum: projectUserMappingId }
  ).catch(() => null); // role_examples table may not exist yet
  return (r && r.example_text) || '';
}

async function getForm(event) {
  const token = (event.queryStringParameters || {}).t;
  const tok = await validateToken(token);
  if (!tok) return json(401, { error: 'This link is invalid, already used, or expired.' });

  const user = await one(
    `select u.email, u.fname, u.lname, p.project_details
       from users u, projects p
      where u.id = :uid::uuid and p.id = :pid::uuid`,
    { uid: tok.user_id, pid: tok.project_id }
  );
  if (!user) return json(404, { error: 'User or project not found.' });

  const [surveys, options, example] = await Promise.all([
    surveysForProject(tok.project_id),
    optionsForUser(tok.project_user_mapping_id),
    exampleForUser(tok.project_user_mapping_id),
  ]);

  return json(200, {
    user: {
      name: `${user.fname || ''} ${user.lname || ''}`.trim(),
      firstName: user.fname,
      email: user.email,
    },
    project: { details: user.project_details },
    surveys,
    options,
    example,
  });
}

async function submit(event) {
  const body = parseBody(event);
  const tok = await validateToken(body.token);
  if (!tok) return json(401, { error: 'This link is invalid, already used, or expired.' });

  // Accept multiple activity reports. Back-compat: a single {description,assets}
  // is treated as one report.
  const rawReports = Array.isArray(body.reports)
    ? body.reports
    : [{ description: body.description, assets: body.assets }];
  const reports = rawReports
    .map((r) => ({
      description: (r.description || '').trim(),
      assets: Array.isArray(r.assets) ? r.assets : [],
      phase: r.project_phase_mapping_uuid || null,
      track: r.project_track_mapping_uuid || null,
      juncture: r.project_priority_juncture_mapping_uuid || null,
    }))
    .filter((r) => r.description);
  if (!reports.length) {
    return json(400, { error: 'At least one activity report with a description is required.' });
  }

  // Resolve which survey these reports belong to: the one passed, else latest.
  const available = await surveysForProject(tok.project_id);
  if (available.length === 0) return json(400, { error: 'No survey is assigned to you yet.' });
  const survey = body.survey_id
    ? available.find((s) => s.survey_id === body.survey_id)
    : available[0];
  if (!survey) return json(400, { error: 'Survey not found for this link.' });

  // Validate every attached asset up front.
  for (const r of reports) {
    for (const a of r.assets) {
      if (!['audio', 'file', 'url'].includes(a.asset_type)) {
        return json(400, { error: `Invalid asset_type: ${a.asset_type}` });
      }
      if (a.asset_type === 'url' && !a.url) return json(400, { error: 'url asset requires a url' });
      if (a.asset_type !== 'url' && !a.bucket_name) {
        return json(400, { error: `${a.asset_type} asset requires bucket_name` });
      }
    }
  }

  // One survey_form row per activity report, all in one transaction; burn once.
  const result = await transaction(async (q) => {
    const created = [];
    for (const r of reports) {
      const [form] = await q(
        `insert into survey_form
           (tenant_id, survey_uuid, project_user_mapping_uuid,
            project_phase_mapping_uuid, project_track_mapping_uuid, project_priority_juncture_mapping_uuid,
            description, submitted_at)
         values (:tenant_id::uuid, :survey::uuid, :pum::uuid,
                 :phase::uuid, :track::uuid, :juncture::uuid,
                 :description, now())
         returning id`,
        {
          tenant_id: tok.tenant_id, survey: survey.survey_id, pum: tok.project_user_mapping_id,
          phase: r.phase, track: r.track, juncture: r.juncture, description: r.description,
        }
      );
      for (const a of r.assets) {
        const [row] = await q(
          `insert into digital_assets
             (tenant_id, survey_form_uuid, asset_type, bucket_name, bucket_id, file_name, url, processing_status)
           values
             (:tenant_id::uuid, :form::uuid, :asset_type::digital_asset_type, :bucket_name, :bucket_id, :file_name, :url,
              case when :asset_type = 'audio' then 'pending' else null end)
           returning id`,
          {
            tenant_id: tok.tenant_id,
            form: form.id,
            asset_type: a.asset_type,
            bucket_name: a.bucket_name ?? null,
            bucket_id: a.bucket_id ?? null,
            file_name: a.file_name ?? null,
            url: a.url ?? null,
          }
        );
        created.push({ id: row.id, asset_type: a.asset_type, bucket: a.bucket_name, key: a.file_name });
      }
    }
    await consumeToken(body.token, q);
    return { created };
  });

  // Transcribe only recorded voice responses on an audio-feedback survey. File
  // uploads are stored as-is and never transcribed.
  const isVoiceSurvey = survey.feedback_type === 'audio';
  const processable = isVoiceSurvey
    ? result.created.filter((a) => a.asset_type === 'audio' && a.bucket && a.key)
    : [];
  if (PROCESSING_FN && processable.length) {
    await lambda.send(new InvokeCommand({
      FunctionName: PROCESSING_FN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ assets: processable, tenant_id: tok.tenant_id })),
    }));
  }

  return json(200, { ok: true, reports: reports.length, assets: result.created.length });
}
