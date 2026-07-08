// Admin service. Protected at the API Gateway layer by an API key (x-api-key).
// Routed via a proxy resource: /admin/{proxy+}
//
//   GET    /admin/<resource>            → list   (optionally ?col=value filters)
//   POST   /admin/<resource>            → create
//   GET    /admin/<resource>/{id}       → get one
//   PUT    /admin/<resource>/{id}       → update
//   DELETE /admin/<resource>/{id}       → delete
//   POST   /admin/dispatch              → send survey links now
//   GET    /admin/export                → download submissions as CSV
//
// Tenant-scoped resources need a tenant: pass it as the `x-tenant-id` header
// (or ?tenant_id=…). SuperAdmin catalog + global-config resources are global.
const { json, csv, parseBody } = require('../shared/http');
const { rows, one, transaction } = require('../shared/sql');
const { makeCrud } = require('../shared/crud');
const { dispatch } = require('../shared/dispatch');
const { authContext, allowedProjectIds } = require('../shared/authz');
const {
  CognitoIdentityProviderClient, AdminCreateUserCommand,
  AdminSetUserPasswordCommand, AdminDeleteUserCommand,
} = require('@aws-sdk/client-cognito-identity-provider');
const { randomUUID } = require('crypto');

const cognito = new CognitoIdentityProviderClient({});
const USER_POOL_ID = process.env.USER_POOL_ID;

// Employee password convention: first + last name, lowercase, no spaces/punct.
// (Pool policy is relaxed to permit this; min length is Cognito's floor of 6.)
const employeePassword = (fname, lname) => `${fname || ''}${lname || ''}`.toLowerCase().replace(/[^a-z0-9]/g, '');

// Create (or reset) a Cognito 'employee' login for a team member and return the
// credentials so the admin can share them. Idempotent — safe to re-issue.
async function ensureEmployeeLogin(email, tenantId, fname, lname) {
  const password = employeePassword(fname, lname);
  if (password.length < 6) throw new Error(`Name too short for a password (needs 6+ chars): "${password}". Set one manually.`);
  try {
    await cognito.send(new AdminCreateUserCommand({
      UserPoolId: USER_POOL_ID, Username: email, MessageAction: 'SUPPRESS',
      UserAttributes: [
        { Name: 'email', Value: email }, { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:role', Value: 'employee' }, { Name: 'custom:tenant_id', Value: tenantId },
      ],
    }));
  } catch (e) {
    if (e.name !== 'UsernameExistsException') throw e; // already exists → just (re)set the password
  }
  await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: email, Password: password, Permanent: true }));
  return { email, password };
}

// resource path segment → CRUD definition
const RESOURCES = {
  // Tenancy + global catalog (SuperAdmin)
  tenants:    makeCrud({ table: 'tenants', columns: ['name', 'slug', 'is_active'] }),
  roles:      makeCrud({ table: 'roles', columns: ['role_name'] }),
  projects:   makeCrud({ table: 'projects', columns: ['project_details'] }),
  phases:     makeCrud({ table: 'project_phases', columns: ['phase_name'] }),
  tracks:     makeCrud({ table: 'project_tracks', columns: ['track_name'] }),
  junctures:  makeCrud({ table: 'project_priority_junctures', columns: ['juncture_name'] }),
  'project-roles': makeCrud({
    table: 'project_roles_mapping',
    columns: ['project_uuid', 'roles_uuid'], uuidCols: ['project_uuid', 'roles_uuid'],
  }),

  // Tenant-scoped
  users: makeCrud({ table: 'users', columns: ['email', 'fname', 'lname', 'phone'], tenantScoped: true }),
  'project-users': makeCrud({
    table: 'project_user_mapping', tenantScoped: true,
    columns: ['user_uuid', 'project_uuid'], uuidCols: ['user_uuid', 'project_uuid'],
  }),
  'user-roles': makeCrud({
    table: 'project_user_role_mapping', tenantScoped: true,
    columns: ['project_user_mapping_uuid', 'project_roles_mapping_uuid', 'is_deleted', 'deleted_at'],
    uuidCols: ['project_user_mapping_uuid', 'project_roles_mapping_uuid'],
    casts: { deleted_at: 'timestamptz' },
  }),
  'project-phases': makeCrud({
    table: 'project_phase_mapping', tenantScoped: true,
    columns: ['project_phases_uuid', 'project_uuid'], uuidCols: ['project_phases_uuid', 'project_uuid'],
  }),
  'project-tracks': makeCrud({
    table: 'project_track_mapping', tenantScoped: true,
    columns: ['project_tracks_uuid', 'project_uuid'], uuidCols: ['project_tracks_uuid', 'project_uuid'],
  }),
  'project-junctures': makeCrud({
    table: 'project_priority_juncture_mapping', tenantScoped: true,
    columns: ['project_junctures_uuid', 'project_uuid'], uuidCols: ['project_junctures_uuid', 'project_uuid'],
  }),
  'user-phases': makeCrud({
    table: 'user_phase_mapping', tenantScoped: true,
    columns: ['project_user_mapping_uuid', 'project_phase_mapping_uuid',
              'project_priority_juncture_mapping_uuid', 'project_track_mapping_uuid'],
    uuidCols: ['project_user_mapping_uuid', 'project_phase_mapping_uuid',
               'project_priority_juncture_mapping_uuid', 'project_track_mapping_uuid'],
  }),
  surveys: makeCrud({
    table: 'surveys', tenantScoped: true,
    columns: ['project_uuid', 'title', 'feedback_type', 'send_days', 'send_time', 'resend_time'], uuidCols: ['project_uuid'],
    casts: { feedback_type: 'survey_feedback_type', send_time: 'time', resend_time: 'time' },
  }),
  submissions: makeCrud({
    table: 'survey_form', tenantScoped: true,
    columns: ['survey_uuid', 'project_user_mapping_uuid', 'description', 'submitted_at'],
    uuidCols: ['survey_uuid', 'project_user_mapping_uuid'],
    casts: { submitted_at: 'timestamptz' },
  }),
  assets: makeCrud({
    table: 'digital_assets', tenantScoped: true,
    columns: ['survey_form_uuid', 'asset_type', 'bucket_name', 'bucket_id', 'file_name', 'url'],
    uuidCols: ['survey_form_uuid'],
    casts: { asset_type: 'digital_asset_type' },
  }),
};

// Resources a TENANT admin may read but only a SUPER admin may write
// (global building blocks + project creation + tenancy).
const SUPER_WRITE_ONLY = new Set([
  'tenants', 'roles', 'phases', 'tracks', 'junctures', 'projects',
]);

const forbidden = (msg) => { const e = new Error(msg); e.statusCode = 403; return e; };

// Tenant scope: a super admin may target any tenant via header/query; a tenant
// admin is pinned to their own claim.
function tenantOf(event, auth) {
  if (auth.isSuper) {
    const h = event.headers || {};
    const q = event.queryStringParameters || {};
    return h['x-tenant-id'] || h['X-Tenant-Id'] || q.tenant_id || auth.tenantId || null;
  }
  return auth.tenantId || null;
}

// Build the SQL predicate that limits a resource to a tenant admin's projects.
// `ids` is the allowed project-uuid array (never null here).
function projectScope(resource, ids) {
  if (!ids.length) return { sql: '1=0', params: {} };           // assigned to nothing
  const ph = ids.map((_, i) => `:sp${i}::uuid`).join(', ');
  const params = {};
  ids.forEach((v, i) => { params[`sp${i}`] = v; });
  const inProj = `in (${ph})`;
  switch (resource) {
    case 'projects':          return { sql: `id ${inProj}`, params };
    case 'project-users':
    case 'project-roles':
    case 'project-phases':
    case 'project-tracks':
    case 'project-junctures':  return { sql: `project_uuid ${inProj}`, params };
    case 'users':              return { sql: `id in (select user_uuid from project_user_mapping where project_uuid ${inProj})`, params };
    case 'user-phases':        return { sql: `project_user_mapping_uuid in (select id from project_user_mapping where project_uuid ${inProj})`, params };
    case 'user-roles':         return { sql: `project_user_mapping_uuid in (select id from project_user_mapping where project_uuid ${inProj})`, params };
    case 'surveys':            return { sql: `project_uuid ${inProj}`, params };
    case 'submissions':        return { sql: `survey_uuid in (select id from surveys where project_uuid ${inProj})`, params };
    case 'assets':             return { sql: `survey_form_uuid in (select sf.id from survey_form sf join surveys s on s.id = sf.survey_uuid join user_phase_mapping uphm on uphm.id = s.user_phase_mapping_uuid join project_user_mapping pum on pum.id = uphm.project_user_mapping_uuid where pum.project_uuid ${inProj})`, params };
    default:                   return null; // catalog / global config — readable unscoped
  }
}

// On create, verify the project the new row attaches to is in the admin's scope.
async function assertCreateInScope(resource, body, allowed) {
  const ok = (pid) => allowed.includes(pid);
  if (['project-users', 'project-roles', 'project-phases', 'project-tracks', 'project-junctures', 'surveys'].includes(resource)) {
    if (!ok(body.project_uuid)) throw forbidden('That project is outside your assigned projects.');
    return;
  }
  if (resource === 'user-phases') {
    const r = await one(`select project_uuid from project_user_mapping where id = :id::uuid`, { id: body.project_user_mapping_uuid });
    if (!r || !ok(r.project_uuid)) throw forbidden('That project is outside your assigned projects.');
    return;
  }
  // users / submissions / assets: tenant-scoped, no per-project create gate
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  try {
    if (method === 'OPTIONS') return json(200, {});
    const auth = authContext(event);
    // Employees get a Cognito login too, but ONLY for their personal log (a
    // separate service). They may not touch the admin console at all.
    if (auth.role === 'employee') return json(403, { error: 'Employees may only view their personal log.' });

    const proxy = (event.pathParameters && event.pathParameters.proxy) ||
      (event.path || '').replace(/^\/admin\/?/, '');
    const [resource, id] = proxy.split('/').filter(Boolean);

    // ── Identity / scope for the UI ──────────────────────────────────────────
    if (resource === 'me' && method === 'GET') return whoami(event, auth);

    // ── Admin management (super admin only) ──────────────────────────────────
    if (resource === 'admins') return handleAdmins(event, auth, method, id);

    const allowed = await allowedProjectIds(auth); // null = super (all)

    // ── Dispatch ─────────────────────────────────────────────────────────────
    if (resource === 'dispatch' && method === 'POST') {
      const body = parseBody(event);
      const tenantId = tenantOf(event, auth) || body.tenant_id;
      if (!tenantId) return json(400, { error: 'tenant_id is required' });
      if (allowed !== null && (!body.project_id || !allowed.includes(body.project_id))) {
        return json(403, { error: 'Pick one of your assigned projects to dispatch.' });
      }
      return json(200, await dispatch({ ...body, tenantId }));
    }

    // ── Export ───────────────────────────────────────────────────────────────
    if (resource === 'export' && method === 'GET') return exportCsv(event, auth, allowed);

    // ── Dashboard stats + filtered query explorer ────────────────────────────
    if (resource === 'stats' && method === 'GET') return statsHandler(event, auth, allowed);
    if (resource === 'query' && method === 'GET') return queryHandler(event, auth, allowed);

    // ── Team: add a member to a project + assign their options, atomically ────
    if (resource === 'team') return handleTeam(event, auth, allowed, method, id);

    // ── (Re)issue a member's employee login for their personal log ────────────
    if (resource === 'member-credentials' && method === 'POST') return handleMemberCredentials(event, auth, allowed);

    // ── Per-survey submission status (who submitted / who hasn't) ─────────────
    if (resource === 'survey-status' && method === 'GET') return surveyStatus(event, auth, allowed);

    // ── Per-role option templates (tenant) ───────────────────────────────────
    if (resource === 'role-templates') return handleRoleTemplates(event, auth, allowed, method, id);

    // ── Generic CRUD ─────────────────────────────────────────────────────────
    const repo = RESOURCES[resource];
    if (!repo) return json(404, { error: `Unknown resource: ${resource || '(none)'}` });

    const tenantId = tenantOf(event, auth);
    if (repo.tenantScoped && !tenantId) return json(400, { error: `${resource} is tenant-scoped — no tenant on the token.` });

    const isWrite = method !== 'GET';
    if (isWrite && !auth.isSuper && SUPER_WRITE_ONLY.has(resource)) {
      return json(403, { error: `Only a super admin can modify ${resource}.` });
    }
    const scope = allowed === null ? null : projectScope(resource, allowed);

    switch (method) {
      case 'GET':
        return id
          ? respond(await repo.get(tenantId, id, scope), 200, 404)
          : json(200, { [resource]: await repo.list(tenantId, event.queryStringParameters || {}, scope) });
      case 'POST': {
        const body = parseBody(event);
        if (allowed !== null) await assertCreateInScope(resource, body, allowed);
        return respond(await repo.create(tenantId, body), 201, 400);
      }
      case 'PUT':
      case 'PATCH':
        if (!id) return json(400, { error: 'id required in path' });
        return respond(await repo.update(tenantId, id, parseBody(event), scope), 200, 404);
      case 'DELETE':
        if (!id) return json(400, { error: 'id required in path' });
        if (CATALOG_CASCADE[resource]) return json(200, await cascadeDeleteCatalog(resource, id));
        return respond(await repo.remove(tenantId, id, scope), 200, 404);
      default:
        return json(405, { error: 'Method not allowed' });
    }
  } catch (err) {
    if (err && err.statusCode) return json(err.statusCode, { error: err.message });
    console.error(err);
    return json(500, { error: err.message || 'Internal error' });
  }
};

const respond = (row, okStatus, missStatus) =>
  row ? json(okStatus, row) : json(missStatus, { error: 'Not found' });

// Catalog items (phases/tracks/junctures) are referenced by project↔catalog
// mapping rows with ON DELETE RESTRICT, so a plain delete fails once anything
// uses them. Safe-delete cascades: drop the per-user options and role-template
// rows that point at the item (neither has an FK, so they must go manually),
// then the mappings (survey_form self-heals via SET NULL, user_phase_mapping
// via CASCADE), then the catalog row itself.
const CATALOG_CASCADE = {
  phases:    { mapTable: 'project_phase_mapping',             col: 'project_phases_uuid',    kind: 'phase',    catalog: 'project_phases' },
  tracks:    { mapTable: 'project_track_mapping',             col: 'project_tracks_uuid',    kind: 'track',    catalog: 'project_tracks' },
  junctures: { mapTable: 'project_priority_juncture_mapping', col: 'project_junctures_uuid', kind: 'juncture', catalog: 'project_priority_junctures' },
};

async function cascadeDeleteCatalog(resource, id) {
  const c = CATALOG_CASCADE[resource];
  await transaction(async (q) => {
    await q(`delete from user_option where kind = :k and mapping_uuid in (select id from ${c.mapTable} where ${c.col} = :id::uuid)`, { k: c.kind, id });
    if (resource !== 'phases') await q(`delete from role_template where kind = :k and catalog_uuid = :id::uuid`, { k: c.kind, id });
    await q(`delete from ${c.mapTable} where ${c.col} = :id::uuid`, { id });
    await q(`delete from ${c.catalog} where id = :id::uuid`, { id });
  });
  return { id, deleted: true };
}

// ── /admin/me — role + the projects this admin may act on ───────────────────
async function whoami(event, auth) {
  const allowed = await allowedProjectIds(auth);
  const tenantId = tenantOf(event, auth);
  let projects;
  if (allowed === null) {
    projects = await rows(`select id, project_details from projects order by created_at desc`);
  } else if (!allowed.length) {
    projects = [];
  } else {
    const ph = allowed.map((_, i) => `:p${i}::uuid`).join(', ');
    const params = {}; allowed.forEach((v, i) => { params[`p${i}`] = v; });
    projects = await rows(`select id, project_details from projects where id in (${ph})`, params);
  }
  return json(200, { email: auth.email, role: auth.role, isSuper: auth.isSuper, tenantId, projects });
}

// ── /admin/admins — super admin manages tenant-admin logins + assignments ───
async function handleAdmins(event, auth, method, id) {
  if (!auth.isSuper) return json(403, { error: 'Super admin only.' });
  const tenantId = tenantOf(event, auth);
  if (!tenantId) return json(400, { error: 'No tenant on the token.' });

  if (method === 'GET') {
    const r = await rows(
      `select admin_sub, admin_email, project_uuid from admin_project_mapping where tenant_id = :t::uuid order by admin_email`,
      { t: tenantId });
    const map = {};
    for (const x of r) (map[x.admin_sub] || (map[x.admin_sub] = { sub: x.admin_sub, email: x.admin_email, projects: [] })).projects.push(x.project_uuid);
    return json(200, { admins: Object.values(map) });
  }

  if (method === 'POST') {
    const b = parseBody(event);
    if (!b.email || !b.password) return json(400, { error: 'email and password are required' });
    const projectIds = Array.isArray(b.project_ids) ? b.project_ids : [];
    let sub;
    try {
      const created = await cognito.send(new AdminCreateUserCommand({
        UserPoolId: USER_POOL_ID, Username: b.email, MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: b.email }, { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:role', Value: 'tenant_admin' }, { Name: 'custom:tenant_id', Value: tenantId },
        ],
      }));
      sub = (created.User.Attributes.find((a) => a.Name === 'sub') || {}).Value;
      await cognito.send(new AdminSetUserPasswordCommand({ UserPoolId: USER_POOL_ID, Username: b.email, Password: b.password, Permanent: true }));
    } catch (e) { return json(400, { error: e.message }); }
    for (const pid of projectIds) {
      await one(
        `insert into admin_project_mapping (tenant_id, admin_sub, admin_email, project_uuid)
         values (:t::uuid, :s, :e, :p::uuid) on conflict (admin_sub, project_uuid) do nothing returning id`,
        { t: tenantId, s: sub, e: b.email, p: pid });
    }
    return json(201, { sub, email: b.email, projects: projectIds });
  }

  if ((method === 'PUT' || method === 'PATCH') && id) {
    const b = parseBody(event);
    const projectIds = Array.isArray(b.project_ids) ? b.project_ids : [];
    const existing = await one(`select admin_email from admin_project_mapping where admin_sub = :s and tenant_id = :t::uuid limit 1`, { s: id, t: tenantId });
    const email = b.email || (existing && existing.admin_email) || null;
    await rows(`delete from admin_project_mapping where admin_sub = :s and tenant_id = :t::uuid`, { s: id, t: tenantId });
    for (const pid of projectIds) {
      await one(
        `insert into admin_project_mapping (tenant_id, admin_sub, admin_email, project_uuid)
         values (:t::uuid, :s, :e, :p::uuid) on conflict (admin_sub, project_uuid) do nothing returning id`,
        { t: tenantId, s: id, e: email, p: pid });
    }
    return json(200, { ok: true, sub: id, projects: projectIds });
  }

  if (method === 'DELETE' && id) {
    const r = await one(`select admin_email from admin_project_mapping where admin_sub = :s and tenant_id = :t::uuid limit 1`, { s: id, t: tenantId });
    await rows(`delete from admin_project_mapping where admin_sub = :s and tenant_id = :t::uuid`, { s: id, t: tenantId });
    if (r && r.admin_email) { try { await cognito.send(new AdminDeleteUserCommand({ UserPoolId: USER_POOL_ID, Username: r.admin_email })); } catch {} }
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
}

// ── /admin/team — tenant admin adds a member to their project and assigns
//    their phase/track/juncture options in one atomic step. ──────────────────
function teamProject(event, auth, allowed) {
  if (auth.isSuper) return (event.queryStringParameters || {}).project_id || null;
  return (allowed && allowed[0]) || null;   // a tenant admin's single project
}

const uniq = (a) => [...new Set(a)];

// The track/juncture catalog ids defined as a role's template for a project.
async function roleTemplate(tenantId, projectId, roleId) {
  if (!roleId) return { tracks: [], junctures: [] };
  const r = await rows(
    `select kind, catalog_uuid from role_template where tenant_id = :t::uuid and project_uuid = :p::uuid and role_uuid = :r::uuid`,
    { t: tenantId, p: projectId, r: roleId });
  const out = { tracks: [], junctures: [] };
  for (const x of r) { if (x.kind === 'track') out.tracks.push(x.catalog_uuid); else if (x.kind === 'juncture') out.junctures.push(x.catalog_uuid); }
  return out;
}

// Upsert the project_*_mapping for each catalog id, then attach it to the
// project-user via user_option. Runs inside a transaction `q`.
// A member can hold several roles. Accept either role_uuids[] or a single
// role_uuid (back-compat), de-duped.
const roleIdsOf = (b) => uniq((Array.isArray(b.role_uuids) ? b.role_uuids : (b.role_uuid ? [b.role_uuid] : [])).filter(Boolean));

// Union the template tracks/junctures across all of a member's roles.
async function roleTemplatesUnion(tenantId, projectId, roleIds) {
  const out = { tracks: [], junctures: [] };
  for (const r of roleIds) {
    const t = await roleTemplate(tenantId, projectId, r);
    out.tracks.push(...t.tracks); out.junctures.push(...t.junctures);
  }
  return { tracks: uniq(out.tracks), junctures: uniq(out.junctures) };
}

// Replace a member's role set: (project↔role mapping upsert) → (member↔role rows).
async function syncMemberRoles(q, tenantId, projectId, pumId, roleIds) {
  await q(`delete from project_user_role_mapping where project_user_mapping_uuid = :pum::uuid and tenant_id = :t::uuid`, { pum: pumId, t: tenantId });
  for (const roleId of roleIds) {
    const [prm] = await q(
      `insert into project_roles_mapping (project_uuid, roles_uuid) values (:p::uuid, :r::uuid)
       on conflict (project_uuid, roles_uuid) do update set project_uuid = excluded.project_uuid returning id`,
      { p: projectId, r: roleId });
    await q(`insert into project_user_role_mapping (tenant_id, project_user_mapping_uuid, project_roles_mapping_uuid)
             values (:t::uuid, :pum::uuid, :prm::uuid)`,
      { t: tenantId, pum: pumId, prm: prm.id });
  }
}

async function assignOptions(q, tenantId, projectId, pumId, sets) {
  const upsertMapping = async (table, fk, catId) => {
    const [r] = await q(
      `insert into ${table} (tenant_id, ${fk}, project_uuid) values (:t::uuid,:c::uuid,:p::uuid)
       on conflict (tenant_id, ${fk}, project_uuid) do update set project_uuid = excluded.project_uuid returning id`,
      { t: tenantId, c: catId, p: projectId });
    return r.id;
  };
  const add = async (kind, table, fk, catIds) => {
    for (const c of (catIds || [])) {
      const mid = await upsertMapping(table, fk, c);
      await q(`insert into user_option (tenant_id, project_user_mapping_uuid, kind, mapping_uuid)
               values (:t::uuid,:pum::uuid,:k,:m::uuid) on conflict (project_user_mapping_uuid, kind, mapping_uuid) do nothing`,
        { t: tenantId, pum: pumId, k: kind, m: mid });
    }
  };
  await add('phase', 'project_phase_mapping', 'project_phases_uuid', sets.phases);
  await add('track', 'project_track_mapping', 'project_tracks_uuid', sets.tracks);
  await add('juncture', 'project_priority_juncture_mapping', 'project_junctures_uuid', sets.junctures);
}

async function handleTeam(event, auth, allowed, method, id) {
  const tenantId = tenantOf(event, auth);
  if (!tenantId) return json(400, { error: 'No tenant on the token.' });

  if (method === 'GET') {
    const projectId = teamProject(event, auth, allowed);
    if (!projectId) return json(400, { error: 'No project in scope.' });
    const members = await rows(
      `select pum.id as pum_id, u.id as user_id, u.fname, u.lname, u.email, u.phone,
              pum.role_uuid, r.role_name
         from project_user_mapping pum join users u on u.id = pum.user_uuid
         left join roles r on r.id = pum.role_uuid
        where pum.tenant_id = :t::uuid and pum.project_uuid = :p::uuid
        order by u.fname, u.lname`, { t: tenantId, p: projectId });
    if (members.length) {
      const ids = members.map((m) => m.pum_id);
      const ph = ids.map((_, i) => `:o${i}::uuid`).join(', ');
      const op = { t: tenantId }; ids.forEach((v, i) => { op[`o${i}`] = v; });
      // include the catalog id (cat) so the edit UI can pre-check options
      const opts = await rows(
        `select uo.project_user_mapping_uuid as pum, uo.kind,
                coalesce(pf.phase_name, tk.track_name, jc.juncture_name) as name,
                coalesce(pm.project_phases_uuid, tm.project_tracks_uuid, jm.project_junctures_uuid) as cat
           from user_option uo
           left join project_phase_mapping pm on pm.id = uo.mapping_uuid
           left join project_phases pf on pf.id = pm.project_phases_uuid
           left join project_track_mapping tm on tm.id = uo.mapping_uuid
           left join project_tracks tk on tk.id = tm.project_tracks_uuid
           left join project_priority_juncture_mapping jm on jm.id = uo.mapping_uuid
           left join project_priority_junctures jc on jc.id = jm.project_junctures_uuid
          where uo.tenant_id = :t::uuid and uo.project_user_mapping_uuid in (${ph})`, op);
      const byPum = {};
      members.forEach((m) => { byPum[m.pum_id] = { phase: [], track: [], juncture: [] }; m.options = byPum[m.pum_id]; });
      for (const o of opts) { if (byPum[o.pum] && byPum[o.pum][o.kind]) byPum[o.pum][o.kind].push({ name: o.name, cat: o.cat }); }

      // Each member's role set (many-to-many via project_user_role_mapping).
      const roleRows = await rows(
        `select purm.project_user_mapping_uuid as pum, r.id as role_id, r.role_name
           from project_user_role_mapping purm
           join project_roles_mapping prm on prm.id = purm.project_roles_mapping_uuid
           join roles r on r.id = prm.roles_uuid
          where purm.tenant_id = :t::uuid and purm.is_deleted = false
            and purm.project_user_mapping_uuid in (${ph})`, op);
      const rolesByPum = {};
      members.forEach((m) => { m.roles = []; rolesByPum[m.pum_id] = m; });
      for (const rr of roleRows) { if (rolesByPum[rr.pum]) rolesByPum[rr.pum].roles.push({ id: rr.role_id, name: rr.role_name }); }
    }
    // Surveys are project-level, so every member is assigned the project's forms.
    const forms = await rows(
      `select id, title, feedback_type from surveys
        where tenant_id = :t::uuid and project_uuid = :p::uuid order by created_at desc`,
      { t: tenantId, p: projectId });
    return json(200, { team: members, forms });
  }

  if (method === 'POST') {
    const b = parseBody(event);
    const projectId = teamProject(event, auth, allowed) || b.project_id;
    if (!projectId) return json(400, { error: 'No project in scope.' });
    if (allowed !== null && !allowed.includes(projectId)) return json(403, { error: 'Project outside your scope.' });
    if (!b.email) return json(400, { error: 'Email is required.' });
    const roleIds = roleIdsOf(b);
    const tpl = await roleTemplatesUnion(tenantId, projectId, roleIds);
    const sets = { phases: b.phases || [], tracks: uniq([...(b.tracks || []), ...tpl.tracks]), junctures: uniq([...(b.junctures || []), ...tpl.junctures]) };
    const result = await transaction(async (q) => {
      const [u] = await q(`insert into users (tenant_id, email, fname, lname, phone) values (:t::uuid,:e,:f,:l,:p) returning id`,
        { t: tenantId, e: b.email, f: b.fname || null, l: b.lname || null, p: b.phone || null });
      const [pum] = await q(`insert into project_user_mapping (tenant_id, user_uuid, project_uuid, role_uuid) values (:t::uuid,:u::uuid,:p::uuid,:r::uuid) returning id`,
        { t: tenantId, u: u.id, p: projectId, r: roleIds[0] || null }); // role_uuid = primary role (back-compat/fallback)
      await assignOptions(q, tenantId, projectId, pum.id, sets);
      await syncMemberRoles(q, tenantId, projectId, pum.id, roleIds);
      return { user_id: u.id, pum_id: pum.id };
    });
    // Give the new member a Cognito login for their personal log.
    let login = null;
    try { login = await ensureEmployeeLogin(b.email, tenantId, b.fname, b.lname); } catch (e) { console.error('employee login:', e.message); }
    return json(201, { ...result, login });
  }

  // Reconfigure an existing member's options (replace the set).
  if ((method === 'PUT' || method === 'PATCH') && id) {
    const b = parseBody(event);
    const m = await one(`select project_uuid from project_user_mapping where id = :id::uuid and tenant_id = :t::uuid`, { id, t: tenantId });
    if (!m) return json(404, { error: 'Not found' });
    if (allowed !== null && !allowed.includes(m.project_uuid)) return json(403, { error: 'Outside your scope.' });
    const roleIds = roleIdsOf(b);
    const tpl = await roleTemplatesUnion(tenantId, m.project_uuid, roleIds);
    const sets = { phases: b.phases || [], tracks: uniq([...(b.tracks || []), ...tpl.tracks]), junctures: uniq([...(b.junctures || []), ...tpl.junctures]) };
    await transaction(async (q) => {
      await q(`update project_user_mapping set role_uuid = :r::uuid where id = :id::uuid and tenant_id = :t::uuid`, { r: roleIds[0] || null, id, t: tenantId });
      await q(`delete from user_option where project_user_mapping_uuid = :pum::uuid and tenant_id = :t::uuid`, { pum: id, t: tenantId });
      await assignOptions(q, tenantId, m.project_uuid, id, sets);
      await syncMemberRoles(q, tenantId, m.project_uuid, id, roleIds);
    });
    return json(200, { ok: true });
  }

  if (method === 'DELETE' && id) {
    const m = await one(`select user_uuid, project_uuid from project_user_mapping where id = :id::uuid and tenant_id = :t::uuid`, { id, t: tenantId });
    if (!m) return json(404, { error: 'Not found' });
    if (allowed !== null && !allowed.includes(m.project_uuid)) return json(403, { error: 'Outside your scope.' });
    await rows(`delete from project_user_mapping where id = :id::uuid and tenant_id = :t::uuid`, { id, t: tenantId });
    await rows(`delete from users where id = :u::uuid and tenant_id = :t::uuid`, { u: m.user_uuid, t: tenantId });
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
}

// ── /admin/survey-status — per-survey: which members submitted, which didn't.
//    Optional ?date=YYYY-MM-DD scopes "submitted" to one send/day; the response
//    also lists the distinct dates the survey has received submissions. ───────
async function surveyStatus(event, auth, allowed) {
  const tenantId = tenantOf(event, auth);
  const q = event.queryStringParameters || {};
  const sid = q.survey_id;
  if (!sid) return json(400, { error: 'survey_id is required' });
  const s = await one(`select project_uuid from surveys where id = :id::uuid and tenant_id = :t::uuid`, { id: sid, t: tenantId });
  if (!s) return json(404, { error: 'Survey not found' });
  if (allowed !== null && !allowed.includes(s.project_uuid)) return json(403, { error: 'Outside your scope.' });

  const params = { sid, t: tenantId, p: s.project_uuid };
  let dcond = '';
  if (q.date) { dcond = 'and sf.submitted_at::date = :d::date'; params.d = q.date; }

  const members = await rows(
    `select u.fname, u.lname, u.email,
            exists(select 1 from survey_form sf where sf.survey_uuid = :sid::uuid and sf.project_user_mapping_uuid = pum.id ${dcond}) as submitted,
            (select max(sf.submitted_at) from survey_form sf where sf.survey_uuid = :sid::uuid and sf.project_user_mapping_uuid = pum.id ${dcond}) as last_submitted
       from project_user_mapping pum join users u on u.id = pum.user_uuid
      where pum.tenant_id = :t::uuid and pum.project_uuid = :p::uuid
      order by u.fname, u.lname`, params);
  const dates = await rows(
    `select distinct sf.submitted_at::date::text as d from survey_form sf where sf.survey_uuid = :sid::uuid order by d desc`, { sid });
  const submitted = members.filter((m) => m.submitted).length;
  return json(200, { members, submitted, total: members.length, dates: dates.map((x) => x.d) });
}

// ── POST /admin/member-credentials { pum_id } — (re)issue an employee login ──
async function handleMemberCredentials(event, auth, allowed) {
  const tenantId = tenantOf(event, auth);
  if (!tenantId) return json(400, { error: 'No tenant on the token.' });
  const b = parseBody(event);
  const m = await one(
    `select u.email, u.fname, u.lname, pum.project_uuid from project_user_mapping pum join users u on u.id = pum.user_uuid
      where pum.id = :id::uuid and pum.tenant_id = :t::uuid`, { id: b.pum_id, t: tenantId });
  if (!m) return json(404, { error: 'Member not found.' });
  if (allowed !== null && !allowed.includes(m.project_uuid)) return json(403, { error: 'Outside your scope.' });
  try {
    const login = await ensureEmployeeLogin(m.email, tenantId, m.fname, m.lname);
    return json(200, { login });
  } catch (e) { return json(400, { error: e.message }); }
}

// ── /admin/role-templates — tenant admin sets per-role default tracks/junctures
async function handleRoleTemplates(event, auth, allowed, method, id) {
  const tenantId = tenantOf(event, auth);
  const projectId = teamProject(event, auth, allowed);
  if (!projectId) return json(400, { error: 'No project in scope.' });

  if (method === 'GET') {
    const r = await rows(`select role_uuid, kind, catalog_uuid from role_template where tenant_id = :t::uuid and project_uuid = :p::uuid`, { t: tenantId, p: projectId });
    const map = {};
    const ensure = (rid) => (map[rid] || (map[rid] = { role_uuid: rid, tracks: [], junctures: [], example: '' }));
    for (const x of r) { const m = ensure(x.role_uuid); (x.kind === 'track' ? m.tracks : m.junctures).push(x.catalog_uuid); }
    const ex = await rows(`select role_uuid, example_text from role_examples where tenant_id = :t::uuid and project_uuid = :p::uuid`, { t: tenantId, p: projectId });
    for (const x of ex) ensure(x.role_uuid).example = x.example_text || '';
    return json(200, { templates: Object.values(map) });
  }
  if ((method === 'PUT' || method === 'PATCH') && id) {   // id = role_uuid
    const b = parseBody(event);
    const tracks = Array.isArray(b.tracks) ? b.tracks : [];
    const junctures = Array.isArray(b.junctures) ? b.junctures : [];
    const example = typeof b.example === 'string' ? b.example.trim() : '';
    await transaction(async (qx) => {
      await qx(`delete from role_template where tenant_id = :t::uuid and project_uuid = :p::uuid and role_uuid = :r::uuid`, { t: tenantId, p: projectId, r: id });
      for (const c of tracks) await qx(`insert into role_template (tenant_id, project_uuid, role_uuid, kind, catalog_uuid) values (:t::uuid,:p::uuid,:r::uuid,'track',:c::uuid) on conflict (project_uuid, role_uuid, kind, catalog_uuid) do nothing`, { t: tenantId, p: projectId, r: id, c });
      for (const c of junctures) await qx(`insert into role_template (tenant_id, project_uuid, role_uuid, kind, catalog_uuid) values (:t::uuid,:p::uuid,:r::uuid,'juncture',:c::uuid) on conflict (project_uuid, role_uuid, kind, catalog_uuid) do nothing`, { t: tenantId, p: projectId, r: id, c });
      await qx(`delete from role_examples where tenant_id = :t::uuid and project_uuid = :p::uuid and role_uuid = :r::uuid`, { t: tenantId, p: projectId, r: id });
      if (example) await qx(`insert into role_examples (tenant_id, project_uuid, role_uuid, example_text) values (:t::uuid,:p::uuid,:r::uuid,:ex)`, { t: tenantId, p: projectId, r: id, ex: example });
    });
    return json(200, { ok: true });
  }
  return json(405, { error: 'Method not allowed' });
}

// Project-scope SQL fragment for a column. Returns a clause beginning with
// "and …" (or '' for a super admin, '1=0' guard for an admin with no projects).
function projIn(col, allowed, prefix) {
  if (allowed === null) return { clause: '', params: {} };
  if (!allowed.length) return { clause: 'and 1=0', params: {} };
  const ph = allowed.map((_, i) => `:${prefix}${i}::uuid`).join(', ');
  const params = {};
  allowed.forEach((v, i) => { params[`${prefix}${i}`] = v; });
  return { clause: `and ${col} in (${ph})`, params };
}

// ── GET /admin/stats — dashboard aggregates, scoped to the admin's projects ──
async function statsHandler(event, auth, allowed) {
  const tenantId = tenantOf(event, auth);
  if (!tenantId) return json(400, { error: 'No tenant on the token.' });
  // optional per-project filter (super admin viewing one project's analytics)
  const qp = (event.queryStringParameters || {}).project_id;
  if (qp) {
    if (allowed !== null && !allowed.includes(qp)) return json(403, { error: 'Project outside your scope.' });
    allowed = [qp];
  }
  const base = { t: tenantId };
  const sp = projIn('s.project_uuid', allowed, 'sp');     // survey / survey_form via survey
  const tp = projIn('pum.project_uuid', allowed, 'tp');   // tokens / mappings via project_user_mapping

  const scalar = async (sql, params) => Number((await one(sql, params) || {}).n || 0);

  const surveys = await scalar(`select count(*) n from surveys s where s.tenant_id = :t::uuid ${sp.clause}`, { ...base, ...sp.params });
  const sent = await scalar(`select count(*) n from survey_token st join project_user_mapping pum on pum.id = st.project_user_mapping_uuid where st.tenant_id = :t::uuid ${tp.clause}`, { ...base, ...tp.params });
  const used = await scalar(`select count(*) n from survey_token st join project_user_mapping pum on pum.id = st.project_user_mapping_uuid where st.tenant_id = :t::uuid and st.used_at is not null ${tp.clause}`, { ...base, ...tp.params });
  const responses = await scalar(`select count(*) n from survey_form sf join surveys s on s.id = sf.survey_uuid where sf.tenant_id = :t::uuid ${sp.clause}`, { ...base, ...sp.params });

  let projects, users;
  if (allowed === null) {
    projects = await scalar(`select count(*) n from projects`, {});
    users = await scalar(`select count(*) n from users where tenant_id = :t::uuid`, base);
  } else {
    projects = allowed.length;
    users = await scalar(`select count(distinct user_uuid) n from project_user_mapping pum where pum.tenant_id = :t::uuid ${tp.clause}`, { ...base, ...tp.params });
  }
  const responseRate = sent ? Math.round((used / sent) * 100) : 0;

  const series = await rows(
    `select to_char(sf.submitted_at::date,'YYYY-MM-DD') d, count(*) c
       from survey_form sf join surveys s on s.id = sf.survey_uuid
      where sf.tenant_id = :t::uuid and sf.submitted_at >= now() - interval '14 days' ${sp.clause}
      group by 1 order by 1`, { ...base, ...sp.params });
  const byProject = await rows(
    `select coalesce(p.project_details,'(none)') name, count(*) c
       from survey_form sf join surveys s on s.id = sf.survey_uuid
       left join projects p on p.id = s.project_uuid
      where sf.tenant_id = :t::uuid ${sp.clause} group by 1 order by c desc limit 8`, { ...base, ...sp.params });
  const byJuncture = await rows(
    `select coalesce(j.juncture_name,'(untagged)') name, count(*) c
       from survey_form sf join surveys s on s.id = sf.survey_uuid
       left join project_priority_juncture_mapping m on m.id = sf.project_priority_juncture_mapping_uuid
       left join project_priority_junctures j on j.id = m.project_junctures_uuid
      where sf.tenant_id = :t::uuid ${sp.clause} group by 1 order by c desc limit 8`, { ...base, ...sp.params });

  return json(200, { counts: { users, projects, surveys, sent, used, responses, responseRate }, series, byProject, byJuncture });
}

// ── GET /admin/query — filtered submissions explorer (safe, parameterized) ──
async function queryHandler(event, auth, allowed) {
  const tenantId = tenantOf(event, auth);
  if (!tenantId) return json(400, { error: 'No tenant on the token.' });
  const q = event.queryStringParameters || {};
  const params = { t: tenantId };
  const where = ['sf.tenant_id = :t::uuid'];

  const sp = projIn('s.project_uuid', allowed, 'sp');
  if (sp.clause) { where.push(sp.clause.replace(/^and /, '')); Object.assign(params, sp.params); }
  if (q.project_id) { where.push('s.project_uuid = :pid::uuid'); params.pid = q.project_id; }
  if (q.feedback_type) { where.push('s.feedback_type = :ft::survey_feedback_type'); params.ft = q.feedback_type; }
  if (q.juncture) { where.push('jn.juncture_name = :jn'); params.jn = q.juncture; }
  if (q.phase) { where.push('ph.phase_name = :phn'); params.phn = q.phase; }
  if (q.track) { where.push('tr.track_name = :trn'); params.trn = q.track; }
  if (q.member) { where.push("(u.email ilike :mem or coalesce(u.fname,'') || ' ' || coalesce(u.lname,'') ilike :mem)"); params.mem = `%${q.member}%`; }
  if (q.from) { where.push('sf.submitted_at >= :from::timestamptz'); params.from = q.from; }
  if (q.to) { where.push('sf.submitted_at <= :to::timestamptz'); params.to = q.to; }
  if (q.q) { where.push('sf.description ilike :search'); params.search = `%${q.q}%`; }
  const lim = Math.min(Number(q.limit) || 200, 1000);

  const out = await rows(
    `select sf.submitted_at, sf.description, s.feedback_type,
            u.email, u.fname, u.lname, p.project_details,
            jn.juncture_name as juncture, ph.phase_name as phase, tr.track_name as track
       from survey_form sf
       join surveys s on s.id = sf.survey_uuid
       left join project_user_mapping pum on pum.id = sf.project_user_mapping_uuid
       left join users u on u.id = pum.user_uuid
       left join projects p on p.id = s.project_uuid
       left join project_priority_juncture_mapping jm on jm.id = sf.project_priority_juncture_mapping_uuid
       left join project_priority_junctures jn on jn.id = jm.project_junctures_uuid
       left join project_phase_mapping phm on phm.id = sf.project_phase_mapping_uuid
       left join project_phases ph on ph.id = phm.project_phases_uuid
       left join project_track_mapping tm on tm.id = sf.project_track_mapping_uuid
       left join project_tracks tr on tr.id = tm.project_tracks_uuid
      where ${where.join(' and ')}
      order by sf.submitted_at desc limit ${lim}`, params);

  return json(200, { rows: out });
}

// ── CSV export of submissions (scoped to a tenant admin's projects) ─────────
const csvCell = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;

async function exportCsv(event, auth, allowed) {
  const tenantId = tenantOf(event, auth);
  if (!tenantId) return json(400, { error: 'No tenant on the token.' });

  const params = { tenant_id: tenantId };
  let projFilter = '';
  if (allowed !== null) {
    if (!allowed.length) return csv('tower5-submissions.csv', '');
    const ph = allowed.map((_, i) => `:sp${i}::uuid`).join(', ');
    allowed.forEach((v, i) => { params[`sp${i}`] = v; });
    projFilter = `and s.project_uuid in (${ph})`;
  }

  const recs = await rows(
    `select sf.submitted_at, sf.description,
            s.title as survey_title, s.feedback_type,
            u.email, u.fname, u.lname,
            p.project_details,
            (select count(*) from digital_assets da where da.survey_form_uuid = sf.id) as asset_count
       from survey_form sf
       join surveys s                 on s.id = sf.survey_uuid
       left join project_user_mapping pum on pum.id = sf.project_user_mapping_uuid
       left join users u              on u.id = pum.user_uuid
       left join projects p           on p.id = s.project_uuid
      where sf.tenant_id = :tenant_id::uuid ${projFilter}
      order by sf.submitted_at desc`,
    params
  );

  const header = ['submitted_at', 'email', 'name', 'project', 'survey_title', 'feedback_type', 'description', 'asset_count'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of recs) {
    lines.push([
      r.submitted_at, r.email, `${r.fname || ''} ${r.lname || ''}`.trim(),
      r.project_details, r.survey_title, r.feedback_type, r.description, r.asset_count,
    ].map(csvCell).join(','));
  }
  return csv(`tower5-submissions-${new Date().toISOString().slice(0, 10)}.csv`, lines.join('\n'));
}
