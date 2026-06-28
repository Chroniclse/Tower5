-- ============================================================================
-- Tower5 — relational schema (PostgreSQL)
-- ============================================================================
-- Translated from "Tower5 Model Diagram - DB Structure".
--
-- Scoping legend from the diagram:
--   SuperAdmin   — global catalog/master data managed by the platform owner.
--                  Shared across all tenants. No tenant_id.
--   Tenant       — per-customer data. Carries tenant_id and is isolated per
--                  tenant (shared-schema, row-level multi-tenancy).
--   Global Config— platform-wide configuration (no tenant_id). See note on
--                  tenant_feedback / track_schedule below if you want these
--                  to be per-tenant instead.
--
-- Conventions applied across the board:
--   * uuid primary keys, defaulted with gen_random_uuid()
--   * created_at / updated_at audit columns on every table (updated_at is
--     maintained by a trigger)
--   * every foreign-key column is indexed
--   * tenant rows cascade-delete when their tenant is removed
--   * dimension/catalog references use ON DELETE RESTRICT so you can't orphan
--     tenant data by deleting a catalog row; project_uuid cascades because a
--     project owns its mappings
--
-- Run with:  psql "$DATABASE_URL" -f backend/db/schema.sql
-- ============================================================================

BEGIN;

-- gen_random_uuid() is core since PG13; pgcrypto kept for older servers.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Enumerated types (idempotent) ───────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE survey_feedback_type AS ENUM ('text', 'audio');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE TYPE digital_asset_type AS ENUM ('audio', 'file', 'url');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── updated_at trigger helper ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Tenants  (root of multi-tenancy — added; not in the diagram)
-- ============================================================================
CREATE TABLE IF NOT EXISTS tenants (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  slug        text NOT NULL UNIQUE,          -- url-safe tenant identifier
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- SuperAdmin catalog (global master data — no tenant_id)
-- ============================================================================
CREATE TABLE IF NOT EXISTS roles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name   text NOT NULL UNIQUE,          -- e.g. photographer, director
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS projects (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_details text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_phases (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phase_name  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_tracks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  track_name  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS project_priority_junctures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  juncture_name text NOT NULL UNIQUE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- SuperAdmin: which roles are valid on which project (global definition).
CREATE TABLE IF NOT EXISTS project_roles_mapping (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_uuid uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  roles_uuid   uuid NOT NULL REFERENCES roles(id)    ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (project_uuid, roles_uuid)
);
CREATE INDEX IF NOT EXISTS ix_project_roles_mapping_project ON project_roles_mapping (project_uuid);
CREATE INDEX IF NOT EXISTS ix_project_roles_mapping_role    ON project_roles_mapping (roles_uuid);

-- ============================================================================
-- Global Config (platform-wide — no tenant_id, per the diagram's yellow boxes)
-- NOTE: if these should be configurable per tenant, add
--       `tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE`
--       to each and a corresponding index.
-- ============================================================================

-- Survey send/resend cadence + frequency.
CREATE TABLE IF NOT EXISTS tenant_feedback (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_send   time,            -- time of day to send
  schedule_resend time,            -- time of day to resend
  send_frequency  text,            -- e.g. 'daily', 'weekly' (free-form in diagram)
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Per-track send/resend timing.
CREATE TABLE IF NOT EXISTS track_schedule (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_send   time,
  schedule_resend time,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- ============================================================================
-- Tenant data (carries tenant_id; isolated per customer)
-- ============================================================================

-- Tenant admin / user.
CREATE TABLE IF NOT EXISTS users (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  email       text NOT NULL,
  fname       text,
  lname       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)          -- email unique within a tenant
);
CREATE INDEX IF NOT EXISTS ix_users_tenant ON users (tenant_id);

-- A user assigned to a project, within a tenant.
CREATE TABLE IF NOT EXISTS project_user_mapping (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  user_uuid    uuid NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
  project_uuid uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_uuid, project_uuid)
);
CREATE INDEX IF NOT EXISTS ix_project_user_mapping_tenant  ON project_user_mapping (tenant_id);
CREATE INDEX IF NOT EXISTS ix_project_user_mapping_user    ON project_user_mapping (user_uuid);
CREATE INDEX IF NOT EXISTS ix_project_user_mapping_project ON project_user_mapping (project_uuid);

-- The role a project-user actually holds (tenant resolution of the SuperAdmin
-- project_roles_mapping). Soft-deletable.
CREATE TABLE IF NOT EXISTS project_user_role_mapping (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                   uuid NOT NULL REFERENCES tenants(id)               ON DELETE CASCADE,
  project_user_mapping_uuid   uuid NOT NULL REFERENCES project_user_mapping(id)  ON DELETE CASCADE,
  project_roles_mapping_uuid  uuid NOT NULL REFERENCES project_roles_mapping(id) ON DELETE RESTRICT,
  is_deleted                  boolean NOT NULL DEFAULT false,
  deleted_at                  timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pur_mapping_tenant ON project_user_role_mapping (tenant_id);
CREATE INDEX IF NOT EXISTS ix_pur_mapping_pum    ON project_user_role_mapping (project_user_mapping_uuid);
CREATE INDEX IF NOT EXISTS ix_pur_mapping_prm    ON project_user_role_mapping (project_roles_mapping_uuid);
-- one active (non-deleted) role assignment per user-role pair
CREATE UNIQUE INDEX IF NOT EXISTS uq_pur_mapping_active
  ON project_user_role_mapping (project_user_mapping_uuid, project_roles_mapping_uuid)
  WHERE is_deleted = false;

-- Tenant resolution of which phases apply to a project.
CREATE TABLE IF NOT EXISTS project_phase_mapping (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
  project_phases_uuid uuid NOT NULL REFERENCES project_phases(id) ON DELETE RESTRICT,
  project_uuid        uuid NOT NULL REFERENCES projects(id)       ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_phases_uuid, project_uuid)
);
CREATE INDEX IF NOT EXISTS ix_project_phase_mapping_tenant  ON project_phase_mapping (tenant_id);
CREATE INDEX IF NOT EXISTS ix_project_phase_mapping_phase   ON project_phase_mapping (project_phases_uuid);
CREATE INDEX IF NOT EXISTS ix_project_phase_mapping_project ON project_phase_mapping (project_uuid);

-- Tenant resolution of which tracks apply to a project.
CREATE TABLE IF NOT EXISTS project_track_mapping (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           uuid NOT NULL REFERENCES tenants(id)        ON DELETE CASCADE,
  project_tracks_uuid uuid NOT NULL REFERENCES project_tracks(id) ON DELETE RESTRICT,
  project_uuid        uuid NOT NULL REFERENCES projects(id)       ON DELETE CASCADE,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_tracks_uuid, project_uuid)
);
CREATE INDEX IF NOT EXISTS ix_project_track_mapping_tenant  ON project_track_mapping (tenant_id);
CREATE INDEX IF NOT EXISTS ix_project_track_mapping_track   ON project_track_mapping (project_tracks_uuid);
CREATE INDEX IF NOT EXISTS ix_project_track_mapping_project ON project_track_mapping (project_uuid);

-- Tenant resolution of which priority junctures apply to a project.
CREATE TABLE IF NOT EXISTS project_priority_juncture_mapping (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              uuid NOT NULL REFERENCES tenants(id)                    ON DELETE CASCADE,
  project_junctures_uuid uuid NOT NULL REFERENCES project_priority_junctures(id) ON DELETE RESTRICT,
  project_uuid           uuid NOT NULL REFERENCES projects(id)                   ON DELETE CASCADE,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, project_junctures_uuid, project_uuid)
);
CREATE INDEX IF NOT EXISTS ix_ppj_mapping_tenant   ON project_priority_juncture_mapping (tenant_id);
CREATE INDEX IF NOT EXISTS ix_ppj_mapping_juncture ON project_priority_juncture_mapping (project_junctures_uuid);
CREATE INDEX IF NOT EXISTS ix_ppj_mapping_project  ON project_priority_juncture_mapping (project_uuid);

-- The combination of (project-user, phase, juncture, track) that a survey
-- targets — the central fact row tying a user's participation together.
CREATE TABLE IF NOT EXISTS user_phase_mapping (
  id                                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                               uuid NOT NULL REFERENCES tenants(id)                          ON DELETE CASCADE,
  project_user_mapping_uuid               uuid NOT NULL REFERENCES project_user_mapping(id)             ON DELETE CASCADE,
  project_phase_mapping_uuid              uuid NOT NULL REFERENCES project_phase_mapping(id)            ON DELETE CASCADE,
  project_priority_juncture_mapping_uuid  uuid REFERENCES project_priority_juncture_mapping(id)         ON DELETE SET NULL,
  project_track_mapping_uuid              uuid REFERENCES project_track_mapping(id)                     ON DELETE SET NULL,
  created_at                              timestamptz NOT NULL DEFAULT now(),
  updated_at                              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_upm_tenant   ON user_phase_mapping (tenant_id);
CREATE INDEX IF NOT EXISTS ix_upm_pum      ON user_phase_mapping (project_user_mapping_uuid);
CREATE INDEX IF NOT EXISTS ix_upm_phase    ON user_phase_mapping (project_phase_mapping_uuid);
CREATE INDEX IF NOT EXISTS ix_upm_juncture ON user_phase_mapping (project_priority_juncture_mapping_uuid);
CREATE INDEX IF NOT EXISTS ix_upm_track    ON user_phase_mapping (project_track_mapping_uuid);

-- Magic-link token for a project-user to access their survey.
CREATE TABLE IF NOT EXISTS survey_token (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 uuid NOT NULL REFERENCES tenants(id)              ON DELETE CASCADE,
  project_user_mapping_uuid uuid NOT NULL REFERENCES project_user_mapping(id) ON DELETE CASCADE,
  token                     text NOT NULL UNIQUE,
  expires_at                timestamptz,
  used_at                   timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_survey_token_tenant ON survey_token (tenant_id);
CREATE INDEX IF NOT EXISTS ix_survey_token_pum    ON survey_token (project_user_mapping_uuid);

-- A survey instance tied to a user_phase_mapping.
CREATE TABLE IF NOT EXISTS surveys (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id               uuid NOT NULL REFERENCES tenants(id)            ON DELETE CASCADE,
  user_phase_mapping_uuid uuid NOT NULL REFERENCES user_phase_mapping(id) ON DELETE CASCADE,
  title                   text,
  feedback_type           survey_feedback_type NOT NULL DEFAULT 'text',
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_surveys_tenant ON surveys (tenant_id);
CREATE INDEX IF NOT EXISTS ix_surveys_upm    ON surveys (user_phase_mapping_uuid);

-- A submitted survey response.
CREATE TABLE IF NOT EXISTS survey_form (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    uuid NOT NULL REFERENCES tenants(id)  ON DELETE CASCADE,
  survey_uuid  uuid NOT NULL REFERENCES surveys(id)  ON DELETE CASCADE,
  description  text,
  submitted_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_survey_form_tenant ON survey_form (tenant_id);
CREATE INDEX IF NOT EXISTS ix_survey_form_survey ON survey_form (survey_uuid);

-- Files / audio / urls attached to a submitted form.
CREATE TABLE IF NOT EXISTS digital_assets (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id        uuid NOT NULL REFERENCES tenants(id)     ON DELETE CASCADE,
  survey_form_uuid uuid NOT NULL REFERENCES survey_form(id) ON DELETE CASCADE,
  asset_type       digital_asset_type NOT NULL,
  bucket_name      text,             -- required when asset_type in (audio,file)
  bucket_id        text,
  file_name        text,
  url              text,             -- required when asset_type = url
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  -- shape the row to the asset kind
  CONSTRAINT digital_assets_shape CHECK (
    (asset_type = 'url'  AND url IS NOT NULL) OR
    (asset_type IN ('audio','file') AND bucket_name IS NOT NULL)
  )
);
CREATE INDEX IF NOT EXISTS ix_digital_assets_tenant ON digital_assets (tenant_id);
CREATE INDEX IF NOT EXISTS ix_digital_assets_form   ON digital_assets (survey_form_uuid);

-- ============================================================================
-- Attach updated_at triggers to every table
-- ============================================================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants','roles','projects','project_phases','project_tracks',
    'project_priority_junctures','project_roles_mapping','tenant_feedback',
    'track_schedule','users','project_user_mapping','project_user_role_mapping',
    'project_phase_mapping','project_track_mapping',
    'project_priority_juncture_mapping','user_phase_mapping','survey_token',
    'surveys','survey_form','digital_assets'
  ]
  LOOP
    EXECUTE format(
      'CREATE OR REPLACE TRIGGER trg_%1$s_updated_at BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION set_updated_at();', t);
  END LOOP;
END;
$$;

COMMIT;

-- ============================================================================
-- OPTIONAL: row-level security for hard tenant isolation
-- ----------------------------------------------------------------------------
-- Enable, then in each request/connection run:
--     SET app.tenant_id = '<the-tenant-uuid>';
-- and queries automatically see only that tenant's rows.
--
-- DO $$
-- DECLARE t text;
-- BEGIN
--   FOREACH t IN ARRAY ARRAY[
--     'users','project_user_mapping','project_user_role_mapping',
--     'project_phase_mapping','project_track_mapping',
--     'project_priority_juncture_mapping','user_phase_mapping','survey_token',
--     'surveys','survey_form','digital_assets'
--   ]
--   LOOP
--     EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY;', t);
--     EXECUTE format(
--       'CREATE POLICY tenant_isolation ON %I
--          USING (tenant_id = current_setting(''app.tenant_id'')::uuid);', t);
--   END LOOP;
-- END;
-- $$;
-- ============================================================================
