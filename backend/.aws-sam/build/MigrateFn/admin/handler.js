// Admin endpoints. Protected at the API Gateway layer by an API key (x-api-key).
//   GET/POST          /admin/members         → list / add team members
//   DELETE            /admin/members/{id}     → remove a member
//   GET/PUT           /admin/config           → read / replace dropdown config
//   POST              /admin/dispatch         → send forms now
//   GET               /admin/export           → download all responses as CSV
const { randomUUID } = require('crypto');
const { ScanCommand, PutCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');
const { doc, TABLES } = require('../shared/db');
const { json, csv, parseBody } = require('../shared/http');
const { getConfig, putConfig } = require('../shared/config');
const { dispatch } = require('../shared/dispatch');

exports.handler = async (event) => {
  const method = event.httpMethod;
  const path = event.resource || event.path || '';

  try {
    if (method === 'OPTIONS') return json(200, {});

    if (path.endsWith('/members') && method === 'GET') return listMembers();
    if (path.endsWith('/members') && method === 'POST') return addMember(event);
    if (path.includes('/members/') && method === 'DELETE') return removeMember(event);

    if (path.endsWith('/config') && method === 'GET') return json(200, await getConfig());
    if (path.endsWith('/config') && method === 'PUT') return json(200, await putConfig(parseBody(event)));

    if (path.endsWith('/dispatch') && method === 'POST') return json(200, await dispatch(parseBody(event)));

    if (path.endsWith('/export') && method === 'GET') return exportCsv();

    return json(404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return json(500, { error: 'Internal error' });
  }
};

async function listMembers() {
  const { Items = [] } = await doc.send(new ScanCommand({ TableName: TABLES.members }));
  Items.sort((a, b) => (a.fname || '').localeCompare(b.fname || ''));
  return json(200, { members: Items });
}

async function addMember(event) {
  const b = parseBody(event);
  if (!b.fname || !b.email) return json(400, { error: 'First name and email are required.' });
  const member = {
    memberId: randomUUID(),
    fname: b.fname.trim(),
    lname: (b.lname || '').trim(),
    email: b.email.trim(),
    phone: (b.phone || '').trim(),
    role: b.role || 'Director',
    status: b.status || 'active',
    createdAt: new Date().toISOString(),
  };
  await doc.send(new PutCommand({ TableName: TABLES.members, Item: member }));
  return json(201, { member });
}

async function removeMember(event) {
  const id = (event.pathParameters || {}).id;
  if (!id) return json(400, { error: 'Missing member id.' });
  await doc.send(new DeleteCommand({ TableName: TABLES.members, Key: { memberId: id } }));
  return json(200, { ok: true, removed: id });
}

// Flatten every response into one CSV row per activity — the "clean spreadsheet".
function csvCell(v) {
  const s = String(v == null ? '' : v).replace(/"/g, '""');
  return `"${s}"`;
}

async function exportCsv() {
  const { Items = [] } = await doc.send(new ScanCommand({ TableName: TABLES.responses }));
  const header = ['submittedAt', 'memberId', 'name', 'role', 'activityNo', 'phase', 'track', 'priority', 'activity', 'link', 'responseId'];
  const rows = [header.map(csvCell).join(',')];

  Items.sort((a, b) => (b.submittedAt || '').localeCompare(a.submittedAt || ''));
  for (const r of Items) {
    (r.activities || []).forEach((a, i) => {
      rows.push([
        r.submittedAt, r.memberId, r.name, r.role, i + 1,
        a.phase, a.track, a.priority, a.text, a.link, r.responseId,
      ].map(csvCell).join(','));
    });
  }
  return csv(`nett-responses-${new Date().toISOString().slice(0, 10)}.csv`, rows.join('\n'));
}
