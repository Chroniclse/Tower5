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

// audience: 'all' | 'nonresponders'
async function pickRecipients({ tenantId, projectId, audience }) {
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
async function dispatch({ tenantId, projectId, audience = 'all', channel = 'both', note = '', reason = 'admin' } = {}) {
  if (!tenantId) throw new Error('dispatch requires a tenantId');

  const recipients = await pickRecipients({ tenantId, projectId, audience });

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

module.exports = { dispatch };
