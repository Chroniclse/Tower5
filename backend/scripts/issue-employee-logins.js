// One-shot: create/reset a Cognito 'employee' login for EVERY existing employee
// (users table), using the password convention firstname+lastname (lowercase,
// no spaces). Prints an email/password table to hand out privately.
//
// Run AFTER `sam deploy` (needs the relaxed password policy live). Idempotent.
//
//   cd backend/scripts
//   npm install @aws-sdk/client-rds-data @aws-sdk/client-cognito-identity-provider  # (already installed if you ran migrate-region)
//   export REGION=us-west-2
//   export CLUSTER=$(aws cloudformation describe-stacks --stack-name nett --region us-west-2 --query "Stacks[0].Outputs[?OutputKey=='DbClusterArn'].OutputValue" --output text)
//   export SECRET=$(aws cloudformation describe-stacks --stack-name nett --region us-west-2 --query "Stacks[0].Outputs[?OutputKey=='DbSecretArn'].OutputValue" --output text)
//   export POOL=$(aws cloudformation describe-stacks --stack-name nett --region us-west-2 --query "Stacks[0].Outputs[?OutputKey=='UserPoolId'].OutputValue" --output text)
//   node issue-employee-logins.js
const { RDSDataClient, ExecuteStatementCommand } = require('@aws-sdk/client-rds-data');
const {
  CognitoIdentityProviderClient, AdminCreateUserCommand, AdminSetUserPasswordCommand,
} = require('@aws-sdk/client-cognito-identity-provider');

const REGION = process.env.REGION || 'us-west-2';
const DB = process.env.DB_NAME || 'tower5';
const { CLUSTER, SECRET, POOL } = process.env;
for (const [k, v] of Object.entries({ CLUSTER, SECRET, POOL })) {
  if (!v) { console.error(`Missing env ${k}`); process.exit(1); }
}

const rds = new RDSDataClient({ region: REGION });
const cog = new CognitoIdentityProviderClient({ region: REGION });

const password = (fname, lname) => `${fname || ''}${lname || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');

async function ensureLogin(email, tenantId, fname, lname) {
  const pw = password(fname, lname);
  if (pw.length < 6) return { email, skipped: `name too short ("${pw}")` };
  try {
    await cog.send(new AdminCreateUserCommand({
      UserPoolId: POOL, Username: email, MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:role', Value: 'employee' }, { Name: 'custom:tenant_id', Value: tenantId },
      ],
    }));
  } catch (e) {
    if (e.name !== 'UsernameExistsException') return { email, skipped: e.message };
  }
  try {
    await cog.send(new AdminSetUserPasswordCommand({ UserPoolId: POOL, Username: email, Password: pw, Permanent: true }));
  } catch (e) { return { email, skipped: e.message }; }
  return { email, password: pw };
}

(async () => {
  const res = await rds.send(new ExecuteStatementCommand({
    resourceArn: CLUSTER, secretArn: SECRET, database: DB, formatRecordsAs: 'JSON',
    sql: 'select distinct u.email, u.fname, u.lname, u.tenant_id from users u order by u.email',
  }));
  const users = JSON.parse(res.formattedRecords || '[]');
  console.log(`Found ${users.length} employees.\n`);
  const done = [], skipped = [];
  for (const u of users) {
    const r = await ensureLogin(u.email, u.tenant_id, u.fname, u.lname);
    if (r.password) { done.push(r); console.log(`✓ ${r.email}  →  ${r.password}`); }
    else { skipped.push(r); console.log(`✗ ${r.email}  —  ${r.skipped}`); }
  }
  console.log(`\nIssued ${done.length} login(s); ${skipped.length} skipped.`);
  if (skipped.length) console.log('Skipped need a manual password (Team → Issue login):', skipped.map((s) => s.email).join(', '));
})().catch((e) => { console.error(e); process.exit(1); });
