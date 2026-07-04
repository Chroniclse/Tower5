// Generic CRUD factory over a single table, used by the Admin service so each of
// the ~20 entities doesn't need hand-written list/get/create/update/remove.
//
// def = {
//   table:        'users',
//   columns:      ['email','fname','lname','phone'],   // writable, non-id columns
//   tenantScoped: true,        // adds/enforces tenant_id
//   uuidCols:     ['user_uuid','project_uuid'],         // columns cast to ::uuid
//   casts:        { feedback_type: 'survey_feedback_type' },  // other ::type casts
// }
//
// Casts matter because the Data API binds every string param as `text`, which
// Postgres won't implicitly coerce into uuid / enum / time / timestamptz columns.
const { randomUUID } = require('crypto');
const { rows, one } = require('./sql');

function makeCrud(def) {
  const { table, columns, tenantScoped = false } = def;
  const casts = { ...(def.casts || {}) };
  for (const c of def.uuidCols || []) casts[c] = 'uuid';
  const ph = (col) => (casts[col] ? `:${col}::${casts[col]}` : `:${col}`);

  // `scope` (optional) = { sql, params } extra predicate AND-ed into the WHERE,
  // used to constrain a tenant admin to their assigned projects.
  function applyScope(where, params, scope) {
    if (scope && scope.sql) { where.push(scope.sql); Object.assign(params, scope.params || {}); }
  }

  async function list(tenantId, filters = {}, scope = null) {
    const where = [];
    const params = {};
    if (tenantScoped) { where.push('tenant_id = :tenant_id::uuid'); params.tenant_id = tenantId; }
    // allow filtering by any writable column or *_uuid foreign key
    for (const [k, v] of Object.entries(filters)) {
      if (columns.includes(k)) { where.push(`${k} = ${ph(k)}`); params[k] = v; }
    }
    applyScope(where, params, scope);
    const sql = `select * from ${table}${where.length ? ' where ' + where.join(' and ') : ''} order by created_at desc`;
    return rows(sql, params);
  }

  async function get(tenantId, id, scope = null) {
    const where = ['id = :id::uuid'];
    const params = { id };
    if (tenantScoped) { where.push('tenant_id = :tenant_id::uuid'); params.tenant_id = tenantId; }
    applyScope(where, params, scope);
    return one(`select * from ${table} where ${where.join(' and ')}`, params);
  }

  async function create(tenantId, body) {
    const cols = ['id'];
    const vals = [':id::uuid'];
    const params = { id: randomUUID() };
    if (tenantScoped) { cols.push('tenant_id'); vals.push(':tenant_id::uuid'); params.tenant_id = tenantId; }
    for (const c of columns) {
      if (body[c] !== undefined) { cols.push(c); vals.push(ph(c)); params[c] = body[c]; }
    }
    const sql = `insert into ${table} (${cols.join(', ')}) values (${vals.join(', ')}) returning *`;
    return one(sql, params);
  }

  async function update(tenantId, id, body, scope = null) {
    const sets = [];
    const params = { id };
    for (const c of columns) {
      if (body[c] !== undefined) { sets.push(`${c} = ${ph(c)}`); params[c] = body[c]; }
    }
    if (!sets.length) return get(tenantId, id, scope);
    const where = ['id = :id::uuid'];
    if (tenantScoped) { where.push('tenant_id = :tenant_id::uuid'); params.tenant_id = tenantId; }
    applyScope(where, params, scope);
    return one(`update ${table} set ${sets.join(', ')} where ${where.join(' and ')} returning *`, params);
  }

  async function remove(tenantId, id, scope = null) {
    const where = ['id = :id::uuid'];
    const params = { id };
    if (tenantScoped) { where.push('tenant_id = :tenant_id::uuid'); params.tenant_id = tenantId; }
    applyScope(where, params, scope);
    return one(`delete from ${table} where ${where.join(' and ')} returning id`, params);
  }

  return { list, get, create, update, remove, tenantScoped, table };
}

module.exports = { makeCrud };
