// Employee-facing endpoints, authenticated solely by the magic-link token.
//   GET  /form?t=TOKEN   → who the form is for + the dropdown options for their role
//   POST /submit         → store one activity report, then burn the token
const { randomUUID } = require('crypto');
const { GetCommand, PutCommand } = require('@aws-sdk/lib-dynamodb');
const { doc, TABLES } = require('../shared/db');
const { json, parseBody } = require('../shared/http');
const { validateToken, consumeToken } = require('../shared/tokens');
const { getConfig, optionsForRole } = require('../shared/config');

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.resource || event.path || '';

  try {
    if (method === 'OPTIONS') return json(200, {});
    if (method === 'GET' && path.includes('/form')) return getForm(event);
    if (method === 'POST' && path.includes('/submit')) return submit(event);
    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal error' });
  }
};

async function getForm(event) {
  const token = (event.queryStringParameters || {}).t;
  const tok = await validateToken(token);
  if (!tok) return json(401, { error: 'This link is invalid, already used, or expired.' });

  const { Item: member } = await doc.send(new GetCommand({
    TableName: TABLES.members,
    Key: { memberId: tok.memberId },
  }));
  if (!member) return json(404, { error: 'Member not found.' });

  const config = await getConfig();
  const role = member.role || 'default';
  return json(200, {
    member: { name: `${member.fname} ${member.lname}`.trim(), firstName: member.fname, role },
    options: optionsForRole(config, role),
    example: (config.examples && (config.examples[role] || config.examples.default)) || '',
  });
}

async function submit(event) {
  const body = parseBody(event);
  const tok = await validateToken(body.token);
  if (!tok) return json(401, { error: 'This link is invalid, already used, or expired.' });

  const activities = Array.isArray(body.activities) ? body.activities : [];
  const cleaned = activities
    .map((a) => ({
      phase: a.phase || '',
      track: a.track || '',
      priority: a.priority || '',
      text: (a.text || '').trim(),
      link: (a.link || '').trim(),
    }))
    .filter((a) => a.text.length > 0);

  if (cleaned.length === 0) return json(400, { error: 'At least one activity with a description is required.' });

  const { Item: member } = await doc.send(new GetCommand({
    TableName: TABLES.members,
    Key: { memberId: tok.memberId },
  }));

  const submittedAt = new Date().toISOString();
  await doc.send(new PutCommand({
    TableName: TABLES.responses,
    Item: {
      memberId: tok.memberId,
      submittedAt,
      responseId: randomUUID(),
      name: member ? `${member.fname} ${member.lname}`.trim() : '',
      role: member ? member.role : '',
      dispatchId: tok.dispatchId || null,
      activityCount: cleaned.length,
      activities: cleaned,
    },
  }));

  await consumeToken(body.token);
  return json(200, { ok: true, recorded: cleaned.length });
}
