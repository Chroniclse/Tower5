// Thin PostgreSQL access layer over the RDS Data API (HTTPS — no VPC, no driver).
//
// query()  → { rows, raw }   rows are plain JS objects (via formatRecordsAs:JSON)
// rows()   → array of row objects
// one()    → first row or null
// transaction(fn) → runs fn(q) inside a Data API transaction; q(sql, params) → rows
//
// Params are named (`:name` in SQL). UUID/timestamp columns are cast in the SQL
// itself (e.g. `:id::uuid`, `now()`), so callers just pass strings/numbers.
const {
  RDSDataClient,
  ExecuteStatementCommand,
  BeginTransactionCommand,
  CommitTransactionCommand,
  RollbackTransactionCommand,
} = require('@aws-sdk/client-rds-data');

const rds = new RDSDataClient({});
const resourceArn = process.env.DB_CLUSTER_ARN;
const secretArn = process.env.DB_SECRET_ARN;
const database = process.env.DB_NAME;

// Convert a JS value into a Data API parameter value.
function toParam(name, value) {
  if (value === null || value === undefined) return { name, value: { isNull: true } };
  switch (typeof value) {
    case 'string':  return { name, value: { stringValue: value } };
    case 'boolean': return { name, value: { booleanValue: value } };
    case 'number':
      return Number.isInteger(value)
        ? { name, value: { longValue: value } }
        : { name, value: { doubleValue: value } };
    default:        return { name, value: { stringValue: String(value) } };
  }
}

const toParams = (obj = {}) => Object.entries(obj).map(([k, v]) => toParam(k, v));

async function query(sql, params = {}, opts = {}) {
  const res = await rds.send(new ExecuteStatementCommand({
    resourceArn,
    secretArn,
    database,
    sql,
    parameters: toParams(params),
    formatRecordsAs: 'JSON',
    ...(opts.transactionId ? { transactionId: opts.transactionId } : {}),
  }));
  const rows = res.formattedRecords ? JSON.parse(res.formattedRecords) : [];
  return { rows, raw: res };
}

const rows = async (sql, params, opts) => (await query(sql, params, opts)).rows;
const one = async (sql, params, opts) => {
  const r = await rows(sql, params, opts);
  return r[0] || null;
};

// Run a set of statements atomically. `fn` receives q(sql, params) → rows.
async function transaction(fn) {
  const { transactionId } = await rds.send(
    new BeginTransactionCommand({ resourceArn, secretArn, database })
  );
  try {
    const q = async (sql, params) => (await query(sql, params, { transactionId })).rows;
    const result = await fn(q);
    await rds.send(new CommitTransactionCommand({ resourceArn, secretArn, transactionId }));
    return result;
  } catch (err) {
    await rds.send(new RollbackTransactionCommand({ resourceArn, secretArn, transactionId }))
      .catch(() => {});
    throw err;
  }
}

module.exports = { query, rows, one, transaction };
