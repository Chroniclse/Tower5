// Magic-link token lifecycle against the `survey_token` table.
// A token is one-time (burned on submit) and time-limited (expires_at).
const { randomUUID } = require('crypto');
const { one } = require('./sql');

const TTL_HOURS = Number(process.env.TOKEN_TTL_HOURS || 36);

// Issue a one-time token for a project-user (a user on a project) within a tenant.
async function issueToken(projectUserMappingId, tenantId) {
  const token = randomUUID().replace(/-/g, '');
  await one(
    `insert into survey_token (tenant_id, project_user_mapping_uuid, token, expires_at)
     values (:tenant_id::uuid, :pum::uuid, :token, now() + make_interval(hours => :ttl::int))
     returning id`,
    { tenant_id: tenantId, pum: projectUserMappingId, token, ttl: TTL_HOURS }
  );
  return token;
}

// Return the token + its project-user/tenant context if valid (exists, unused,
// unexpired), else null.
async function validateToken(token) {
  if (!token) return null;
  return one(
    `select st.id            as token_id,
            st.token,
            st.expires_at,
            pum.id           as project_user_mapping_id,
            pum.tenant_id    as tenant_id,
            pum.user_uuid    as user_id,
            pum.project_uuid as project_id
     from survey_token st
     join project_user_mapping pum on pum.id = st.project_user_mapping_uuid
     where st.token = :token
       and st.used_at is null
       and (st.expires_at is null or st.expires_at > now())`,
    { token }
  );
}

// Mark a token consumed so the link can't be reused.
async function consumeToken(token, q) {
  const run = q || one;
  await run(`update survey_token set used_at = now() where token = :token returning id`, { token });
}

module.exports = { issueToken, validateToken, consumeToken };
