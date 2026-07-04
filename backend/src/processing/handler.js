// Processing service — transcribes recorded audio assets to text.
//   asset_type 'audio' → Amazon Transcribe (async; completion via EventBridge)
// ('file' and 'url' assets are just stored — they are NOT processed.)
//
// Invoked two ways:
//   1. Async by the Employee service after /submit:
//        { assets: [ { id, bucket, key, asset_type } ], tenant_id }
//   2. By an EventBridge "Transcribe Job State Change" rule when an audio job
//      finishes — we derive the asset id from the job name and read the output.
//
// Result text lands in digital_assets.extracted_text (+ processing_status).
const { TranscribeClient, StartTranscriptionJobCommand } = require('@aws-sdk/client-transcribe');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const { one } = require('../shared/sql');

const transcribe = new TranscribeClient({});
const s3 = new S3Client({});

const UPLOADS_KMS_KEY = process.env.UPLOADS_KMS_KEY_ID;

// file extension → Transcribe MediaFormat
const AUDIO_FORMAT = { mp3: 'mp3', m4a: 'mp4', mp4: 'mp4', wav: 'wav', flac: 'flac', ogg: 'ogg', amr: 'amr', webm: 'webm' };

async function setText(assetId, text, status) {
  await one(
    `update digital_assets set extracted_text = :t, processing_status = :s
     where id = :id::uuid returning id`,
    { t: text, s: status, id: assetId }
  );
}
async function setStatus(assetId, status) {
  await one(
    `update digital_assets set processing_status = :s where id = :id::uuid returning id`,
    { s: status, id: assetId }
  );
}

const streamToString = async (stream) => {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
};

// ── Audio: kick off an async Transcribe job. Output → transcripts/<id>.json ──
async function processAudio(a) {
  const ext = (a.key.split('.').pop() || '').toLowerCase();
  try {
    await transcribe.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: `tower5_${a.id}_${Date.now()}`, // asset id is split('_')[1]
      LanguageCode: 'en-US',
      MediaFormat: AUDIO_FORMAT[ext] || 'mp3',
      Media: { MediaFileUri: `s3://${a.bucket}/${a.key}` },
      OutputBucketName: a.bucket,
      OutputKey: `transcripts/${a.id}.json`,
      ...(UPLOADS_KMS_KEY ? { OutputEncryptionKMSKeyId: UPLOADS_KMS_KEY } : {}),
    }));
    await setStatus(a.id, 'processing');
  } catch (err) {
    console.error(`Transcribe start failed for asset ${a.id} (${a.key}):`, err.message);
    await setStatus(a.id, 'failed');
  }
}

// ── 2. Transcribe completion (EventBridge) → read output, store transcript ───
async function finalizeTranscription(detail) {
  const jobName = detail.TranscriptionJobName || '';
  if (!jobName.startsWith('tower5_')) return;          // not ours
  const assetId = jobName.split('_')[1];
  const status = detail.TranscriptionJobStatus;

  if (status !== 'COMPLETED') {
    await setStatus(assetId, 'failed');
    return;
  }
  // Transcribe wrote transcripts/<assetId>.json into the uploads bucket.
  const bucket = detail.OutputBucketName || process.env.UPLOADS_BUCKET;
  const key = `transcripts/${assetId}.json`;
  const body = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const json = JSON.parse(await streamToString(body.Body));
  const text = ((json.results && json.results.transcripts) || []).map((t) => t.transcript).join('\n');
  await setText(assetId, text, 'done');
}

exports.handler = async (event = {}) => {
  // EventBridge Transcribe completion
  if (event.source === 'aws.transcribe') {
    await finalizeTranscription(event.detail || {});
    return { ok: true, via: 'transcribe-event' };
  }

  // Async invoke from /submit — only audio assets are transcribed.
  const assets = (Array.isArray(event.assets) ? event.assets : []).filter((a) => a.asset_type === 'audio');
  for (const a of assets) await processAudio(a);
  return { ok: true, processed: assets.length };
};
