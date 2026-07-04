// Admin authorization: who is calling and which projects they may touch.
//
// Roles (Cognito `custom:role` claim on the ID token):
//   superadmin   — full control over ALL projects.
//   tenant_admin — limited to the projects assigned in admin_project_mapping.
const { rows } = require('./sql');

// Claims injected by the API Gateway Cognito authorizer (ID token).
function authContext(event) {
  const c = (event.requestContext && event.requestContext.authorizer && event.requestContext.authorizer.claims) || {};
  return {
    sub: c.sub || null,
    email: c.email || null,
    role: c['custom:role'] || 'tenant_admin',
    tenantId: c['custom:tenant_id'] || null,
    isSuper: c['custom:role'] === 'superadmin',
  };
}

// Returns null for a super admin (= all projects), otherwise the array of
// project uuids this tenant admin is assigned to (possibly empty).
async function allowedProjectIds(auth) {
  if (auth.isSuper) return null;
  if (!auth.sub) return [];
  const r = await rows(
    `select project_uuid from admin_project_mapping where admin_sub = :sub`,
    { sub: auth.sub }
  );
  return r.map((x) => x.project_uuid);
}

module.exports = { authContext, allowedProjectIds };
