// Dispatch orchestration, shared by the Admin endpoint and the Scheduler.
// Owns the RDS work — pick the audience, issue a magic-link token per
// project-user, build each personal link — then hands the resolved message
// batch to the Notification service via an async Lambda invoke. It does NOT
// send email/SMS itself; that's the Notification service's job.
const { rows } = require('./sql');
const { issueToken } = require('./tokens');
const { LambdaClient, InvokeCommand } = require('@aws-sdk/client-lambda');

const lambda = new LambdaClient({});
const NOTIFICATION_FN = process.env.NOTIFICATION_FN;
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');

// audience: 'all' | 'nonresponders'. surveyId (optional): restrict to that
// survey's targeted audience — but only if the survey actually has audience
// rows; otherwise it's the whole team (back-compat).
async function pickRecipients({ tenantId, projectId, audience, surveyId }) {
  const params = { tenant_id: tenantId };
  let sql = `
    select pum.id as pum_id, pum.tenant_id, u.email, u.fname, u.lname, u.phone
    from project_user_mapping pum
    join users u on u.id = pum.user_uuid
    where pum.tenant_id = :tenant_id::uuid`;
  if (projectId) {
    sql += ` and pum.project_uuid = :project_id::uuid`;
    params.project_id = projectId;
  }
  if (surveyId) {
    sql += `
      and ( not exists (select 1 from survey_audience sa where sa.survey_uuid = :survey_id::uuid)
            or pum.id in (select sa.target_uuid from survey_audience sa where sa.survey_uuid = :survey_id::uuid and sa.target_type = 'member')
            or exists (select 1 from survey_audience sa where sa.survey_uuid = :survey_id::uuid and sa.target_type = 'role'
                        and ( sa.target_uuid = pum.role_uuid
                              or sa.target_uuid in (select prm.roles_uuid from project_user_role_mapping purm
                                                      join project_roles_mapping prm on prm.id = purm.project_roles_mapping_uuid
                                                     where purm.project_user_mapping_uuid = pum.id and purm.is_deleted = false))) )`;
    params.survey_id = surveyId;
  }
  if (audience === 'nonresponders') {
    sql += `
      and pum.id not in (
        select uphm.project_user_mapping_uuid
        from user_phase_mapping uphm
        join surveys s      on s.user_phase_mapping_uuid = uphm.id
        join survey_form sf on sf.survey_uuid = s.id
        where sf.submitted_at::date = now()::date)`;
  }
  return rows(sql, params);
}

// Resolve recipients + tokens, then queue them with the Notification service.
async function dispatch({ tenantId, projectId, audience = 'all', channel = 'both', note = '', reason = 'admin', surveyId } = {}) {
  if (!tenantId) throw new Error('dispatch requires a tenantId');

  const recipients = await pickRecipients({ tenantId, projectId, audience, surveyId });

  const messages = [];
  for (const r of recipients) {
    const token = await issueToken(r.pum_id, r.tenant_id);
    messages.push({
      email: r.email,
      phone: r.phone,
      fname: r.fname,
      lname: r.lname,
      link: `${APP_BASE_URL}/nett-form.html?t=${token}`,
    });
  }

  let queued = 0;
  if (messages.length && NOTIFICATION_FN) {
    await lambda.send(new InvokeCommand({
      FunctionName: NOTIFICATION_FN,
      InvocationType: 'Event', // async — fire and forget; Notification does the sending
      Payload: Buffer.from(JSON.stringify({ channel, note, reason, messages })),
    }));
    queued = messages.length;
  }

  return {
    tenantId,
    projectId: projectId || null,
    audience,
    channel,
    recipients: recipients.length,
    queued,
  };
}

// Bi-weekly "review your log & reflect" reminder. Unlike a survey dispatch this
// needs no token — it points people at the Cognito-authed personal-log page.
// One email per person (deduped by email); email channel only.
async function dispatchReflection({ tenantId, projectId } = {}) {
  if (!tenantId) throw new Error('dispatchReflection requires a tenantId');
  const recipients = await pickRecipients({ tenantId, projectId, audience: 'all' });
  const link = `${APP_BASE_URL}/nett-log.html`;
  const seen = new Set();
  const messages = [];
  for (const r of recipients) {
    if (!r.email || seen.has(r.email)) continue;
    seen.add(r.email);
    messages.push({ email: r.email, phone: r.phone, fname: r.fname, lname: r.lname, link });
  }
  let queued = 0;
  if (messages.length && NOTIFICATION_FN) {
    await lambda.send(new InvokeCommand({
      FunctionName: NOTIFICATION_FN,
      InvocationType: 'Event',
      Payload: Buffer.from(JSON.stringify({ channel: 'email', reason: 'reflection', kind: 'reflection', messages })),
    }));
    queued = messages.length;
  }
  return { tenantId, recipients: messages.length, queued };
}

module.exports = { dispatch, dispatchReflection };
