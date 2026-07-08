// PostgreSQL access layer using a direct connection (node-postgres) from inside
// the VPC. Credentials are read once from Secrets Manager; the connection pool
// is created per warm Lambda container and reused across invocations.
//
// Interface is unchanged from the previous RDS Data API layer, so handlers need
// no edits:
//   query(sql, params) → { rows, raw }
//   rows(sql, params)  → array of row objects
//   one(sql, params)   → first row or null
//   transaction(fn)    → runs fn(q) atomically; q(sql, params) → rows
//
// Params are still named (`:name` in SQL). They are rewritten to positional
// $1..$n here, leaving `::type` casts alone, so existing SQL is untouched.
const { Pool } = require('pg');
const { SecretsManagerClient, GetSecretValueCommand } = require('@aws-sdk/client-secrets-manager');

let poolPromise;
async function getPool() {
  if (!poolPromise) {
    poolPromise = (async () => {
      const sm = new SecretsManagerClient({});
      const res = await sm.send(new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN }));
      const creds = JSON.parse(res.SecretString); // { username, password, ... }
      return new Pool({
        host: process.env.DB_HOST,
        port: Number(process.env.DB_PORT || 5432),
        database: process.env.DB_NAME,
        user: creds.username,
        password: creds.password,
        max: Number(process.env.DB_POOL_MAX || 2),
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        ssl: { rejectUnauthorized: false }, // Aurora in-VPC; TLS on, cert not pinned
      });
    })().catch((e) => { poolPromise = undefined; throw e; });
  }
  return poolPromise;
}

// jsonb/object params get JSON-encoded (matches the old layer's string binding);
// Date and Buffer pass through to the pg driver untouched.
function normalize(v) {
  if (v === undefined) return null;
  if (v !== null && typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) return JSON.stringify(v);
  return v;
}

// Rewrite `:name` → `$n` (leaving `::type` casts alone) and collect values in
// binding order. A name used more than once reuses the same placeholder.
function build(sql, params = {}) {
  const values = [];
  const index = new Map();
  const text = sql.replace(/(?<!:):(?!:)([a-zA-Z_][a-zA-Z0-9_]*)/g, (_, name) => {
    if (!index.has(name)) { values.push(normalize(params[name])); index.set(name, values.length); }
    return `$${index.get(name)}`;
  });
  return { text, values };
}

async function query(sql, params = {}, client) {
  const { text, values } = build(sql, params);
  const runner = client || (await getPool());
  const res = await runner.query(text, values);
  return { rows: res.rows, raw: res };
}

const rows = async (sql, params, client) => (await query(sql, params, client)).rows;
const one = async (sql, params, client) => {
  const r = await rows(sql, params, client);
  return r[0] || null;
};

// Run a set of statements atomically on a single checked-out connection.
// `fn` receives q(sql, params) → rows.
async function transaction(fn) {
  const pool = await getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const q = async (sql, params) => (await query(sql, params, client)).rows;
    const result = await fn(q);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { query, rows, one, transaction };
