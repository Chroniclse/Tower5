// One-off cross-region data migration: copies the Aurora data + Cognito admins
// from the us-east-2 "nett" stack into the us-west-2 "nett" stack, via the RDS
// Data API (no VPC/psql needed). Idempotent — safe to re-run (ON CONFLICT DO
// NOTHING). Run AFTER the west stack is deployed + schema-migrated.
//
//   cd backend/scripts
//   npm install @aws-sdk/client-rds-data @aws-sdk/client-cognito-identity-provider
//   # export the env vars (see README block the assistant gave you), then:
//   node migrate-region.js
const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const {
  CognitoIdentityProviderClient, ListUsersCommand, AdminCreateUserCommand, AdminSetUserPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const DB = process.env.DB_NAME || 'tower5';
const TEMP_PW = process.env.TEMP_PASSWORD || 'Tower5pass1';
const E = { region: process.env.EAST_REGION || 'us-east-2', cluster: process.env.EAST_CLUSTER, secret: process.env.EAST_SECRET, pool: process.env.EAST_POOL };
const W = { region: process.env.WEST_REGION || 'us-west-2', cluster: process.env.WEST_CLUSTER, secret: process.env.WEST_SECRET, pool: process.env.WEST_POOL };

for (const [k, v] of Object.entries({ EAST_CLUSTER: E.cluster, EAST_SECRET: E.secret, WEST_CLUSTER: W.cluster, WEST_SECRET: W.secret })) {
  if (!v) { console.error(`Missing env ${k}`); process.exit(1); }
}

const east = new RDSDataClient({ region: E.region });
const west = new RDSDataClient({ region: W.region });

// FK-safe order: parents before children.
const TABLES = [
  'tenants', 'roles', 'projects', 'project_phases', 'project_tracks', 'project_priority_junctures',
  'tenant_feedback', 'track_schedule', 'project_roles_mapping', 'users', 'project_user_mapping',
  'project_phase_mapping', 'project_track_mapping', 'project_priority_juncture_mapping',
  'project_user_role_mapping', 'user_phase_mapping', 'user_option', 'role_template',
  'survey_token', 'surveys', 'survey_form', 'digital_assets', 'admin_project_mapping',
];

// Clear west's throwaway bootstrap rows so east's UUIDs land cleanly. WEST ONLY.
// Skip with SKIP_WIPE=1 if you deliberately want a merge instead of a replica.
async function wipeWest() {
  if (process.env.SKIP_WIPE) { console.log('WIPE: skipped (SKIP_WIPE set)'); return; }
  await west.send(new ExecuteStatementCommand({
    resourceArn: W.cluster, secretArn: W.secret, database: DB,
    sql: `truncate ${TABLES.join(', ')} restart identity cascade`,
  }));
  console.log('WIPE: west data tables truncated');
}

const field = (f) => {
  if (!f || f.isNull) return { isNull: true };
  if ('stringValue' in f) return { stringValue: f.stringValue };
  if ('longValue' in f) return { longValue: f.longValue };
  if ('booleanValue' in f) return { booleanValue: f.booleanValue };
  if ('doubleValue' in f) return { doubleValue: f.doubleValue };
  if ('blobValue' in f) return { blobValue: f.blobValue };
  return { isNull: true };
};

async function copyTable(t) {
  let res;
  try {
    res = await east.send(new ExecuteStatementCommand({
      resourceArn: E.cluster, secretArn: E.secret, database: DB,
      sql: `select * from ${t}`, includeResultMetadata: true,
    }));
  } catch (e) {
    if (/does not exist/.test(e.message)) { console.log(`${t}: skip (absent on source)`); return; }
    throw e;
  }
  const rows = res.records || [];
  const meta = res.columnMetadata || [];
  if (!rows.length) { console.log(`${t}: 0 rows`); return; }
  const cols = meta.map((c) => `"${c.name}"`).join(', ');
  // cast each placeholder to its source column type so uuid/enum/time/timestamptz bind correctly
  const casts = meta.map((c) => c.typeName);
  let n = 0;
  for (const row of rows) {
    const parameters = row.map((f, i) => ({ name: `p${i}`, value: field(f) }));
    const ph = casts.map((tn, i) => `:p${i}::${tn}`).join(', ');
    await west.send(new ExecuteStatementCommand({
      resourceArn: W.cluster, secretArn: W.secret, database: DB,
      sql: `insert into ${t} (${cols}) values (${ph}) on conflict do nothing`, parameters,
    }));
    n++;
  }
  console.log(`${t}: copied ${n}`);
}

async function copyCognito() {
  if (!E.pool || !W.pool) { console.log('Cognito: skipped (set EAST_POOL / WEST_POOL to include admins).'); return; }
  const cogE = new CognitoIdentityProviderClient({ region: E.region });
  const cogW = new CognitoIdentityProviderClient({ region: W.region });
  const users = [];
  let token;
  do {
    const r = await cogE.send(new ListUsersCommand({ UserPoolId: E.pool, PaginationToken: token }));
    users.push(...(r.Users || [])); token = r.PaginationToken;
  } while (token);

  for (const u of users) {
    const a = {}; (u.Attributes || []).forEach((x) => { a[x.Name] = x.Value; });
    const email = a.email; if (!email) continue;
    try {
      const created = await cogW.send(new AdminCreateUserCommand({
        UserPoolId: W.pool, Username: email, MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:role', Value: a['custom:role'] || 'tenant_admin' },
          { Name: 'custom:tenant_id', Value: a['custom:tenant_id'] || '' },
        ],
      }));
      const newSub = (created.User.Attributes.find((x) => x.Name === 'sub') || {}).Value;
      await cogW.send(new AdminSetUserPasswordCommand({ UserPoolId: W.pool, Username: email, Password: TEMP_PW, Permanent: true }));
      // the copied admin_project_mapping rows reference the OLD sub — re-key by email to the new sub
      await west.send(new ExecuteStatementCommand({
        resourceArn: W.cluster, secretArn: W.secret, database: DB,
        sql: 'update admin_project_mapping set admin_sub = :s where admin_email = :e',
        parameters: [{ name: 's', value: { stringValue: newSub } }, { name: 'e', value: { stringValue: email } }],
      }));
      console.log(`cognito: ${email} (${a['custom:role'] || 'tenant_admin'}) -> ${newSub}`);
    } catch (e) { console.log(`cognito ${email}: ${e.message}`); }
  }
}

(async () => {
  console.log(`Copying Aurora data ${E.region} -> ${W.region} ...`);
  await wipeWest();
  for (const t of TABLES) {
    try { await copyTable(t); }
    catch (e) { console.log(`${t}: ERROR ${e.message}`); }
  }
  console.log('Copying Cognito admins ...');
  await copyCognito();
  console.log(`\nDone. Admin logins were recreated with password: ${TEMP_PW}`);
})().catch((e) => { console.error(e); process.exit(1); });
