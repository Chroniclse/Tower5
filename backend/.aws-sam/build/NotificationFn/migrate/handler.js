// One-shot schema migration runner.
//
// Applies db/schema.sql against the Aurora cluster using the RDS Data API
// (HTTPS — no VPC, no psql, no DB driver). The Data API runs ONE statement per
// call, so we split the file into statements (respecting dollar-quoted blocks
// and string literals) and run them inside a single Data API transaction.
//
// Invoked two ways:
//   * As a CloudFormation custom resource on `sam deploy` (auto-applies).
//   * Directly:  aws lambda invoke --function-name <MigrateFn> out.json
//
// The schema is idempotent (CREATE ... IF NOT EXISTS, guarded enums,
// CREATE OR REPLACE TRIGGER), so re-running on every deploy is safe.
const fs = require('fs');
const path = require('path');
const https = require('https');
const {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} = require('@aws-sdk/client-rds-data');

const rds = new RDSDataClient({});

// Split a SQL script into individual statements. Handles `--` line comments,
// `/* */` block comments, single-quoted strings (with '' escaping), and
// $tag$...$tag$ dollar-quoted blocks (function bodies / DO blocks), so the ';'
// inside them is never treated as a terminator.
function splitStatements(sql) {
  const stmts = [];
  let buf = '';
  let i = 0;
  const n = sql.length;
  while (i < n) {
    const ch = sql[i];
    const two = sql.slice(i, i + 2);

    if (two === '--') {                       // line comment → skip to EOL
      const nl = sql.indexOf('\n', i);
      i = nl === -1 ? n : nl;
      continue;
    }
    if (two === '/*') {                        // block comment → skip to */
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    if (ch === "'") {                          // single-quoted string literal
      buf += ch; i++;
      while (i < n) {
        buf += sql[i];
        if (sql[i] === "'") {
          if (sql[i + 1] === "'") { buf += sql[i + 1]; i += 2; continue; }
          i++; break;
        }
        i++;
      }
      continue;
    }
    const dollar = /^\$[A-Za-z0-9_]*\$/.exec(sql.slice(i));
    if (ch === '$' && dollar) {                // dollar-quoted block
      const tag = dollar[0];
      const end = sql.indexOf(tag, i + tag.length);
      const stop = end === -1 ? n : end + tag.length;
      buf += sql.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === ';') {                          // statement terminator
      const s = buf.trim();
      if (s) stmts.push(s);
      buf = '';
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  const tail = buf.trim();
  if (tail) stmts.push(tail);

  // The Data API manages the transaction itself; drop bare txn-control verbs.
  return stmts.filter((s) => !/^(begin|commit|end|start\s+transaction)\s*$/i.test(s));
}

async function migrate() {
  const resourceArn = process.env.DB_CLUSTER_ARN;
  const secretArn = process.env.DB_SECRET_ARN;
  const database = process.env.DB_NAME;
  if (!resourceArn || !secretArn || !database) {
    throw new Error('Missing DB_CLUSTER_ARN / DB_SECRET_ARN / DB_NAME env vars');
  }

  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  const statements = splitStatements(sql);

  const { transactionId } = await rds.send(
    new BeginTransactionCommand({ resourceArn, secretArn, database })
  );
  try {
    for (const statement of statements) {
      await rds.send(new ExecuteStatementCommand({
        resourceArn, secretArn, database, transactionId, sql: statement,
      }));
    }
    await rds.send(new CommitTransactionCommand({ resourceArn, secretArn, transactionId }));
  } catch (err) {
    await rds.send(new RollbackTransactionCommand({ resourceArn, secretArn, transactionId }))
      .catch(() => {});
    throw err;
  }
  console.log(`Applied ${statements.length} statements.`);
  return statements.length;
}

// Minimal CloudFormation custom-resource response (no cfn-response dependency).
function sendCfnResponse(event, context, status, data, reason) {
  return new Promise((resolve) => {
    const body = JSON.stringify({
      Status: status,
      Reason: reason || `See CloudWatch log stream: ${context.logStreamName}`,
      PhysicalResourceId: event.PhysicalResourceId || 'tower5-schema-migration',
      StackId: event.StackId,
      RequestId: event.RequestId,
      LogicalResourceId: event.LogicalResourceId,
      Data: data || {},
    });
    const url = new URL(event.ResponseURL);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'PUT',
        headers: { 'content-type': '', 'content-length': Buffer.byteLength(body) },
      },
      () => resolve()
    );
    req.on('error', () => resolve());
    req.write(body);
    req.end();
  });
}

exports.handler = async (event = {}, context = {}) => {
  const isCfn = typeof event.RequestType === 'string';

  // On stack delete we never drop data — just acknowledge.
  if (isCfn && event.RequestType === 'Delete') {
    await sendCfnResponse(event, context, 'SUCCESS', {}, 'Delete is a no-op');
    return;
  }

  try {
    const applied = await migrate();
    if (isCfn) await sendCfnResponse(event, context, 'SUCCESS', { applied: String(applied) });
    return { ok: true, applied };
  } catch (err) {
    console.error('Migration failed:', err);
    if (isCfn) {
      await sendCfnResponse(event, context, 'FAILED', {}, String((err && err.message) || err));
      return;
    }
    throw err;
  }
};
