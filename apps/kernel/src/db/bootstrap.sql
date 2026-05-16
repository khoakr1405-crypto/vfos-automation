-- VFOS schema bootstrap (idempotent).
-- Re-runs on every kernel start; tables, role, and RLS policies are
-- reconciled, so cross-version upgrades work without manual migrations.

CREATE TABLE IF NOT EXISTS tenants (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug        TEXT NOT NULL UNIQUE,
  tier        TEXT NOT NULL DEFAULT 'solo',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tenant_quotas (
  tenant_id            UUID PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  videos_per_day       INT NOT NULL DEFAULT 30,
  budget_usd_per_day   NUMERIC(8,2) NOT NULL DEFAULT 5.00,
  accounts_max         INT NOT NULL DEFAULT 3,
  plugins_max          INT NOT NULL DEFAULT 10,
  syscalls_per_minute  INT NOT NULL DEFAULT 600,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- For databases bootstrapped on earlier schemas: add the rate-limit column
-- without breaking existing rows.
ALTER TABLE tenant_quotas
  ADD COLUMN IF NOT EXISTS syscalls_per_minute INT NOT NULL DEFAULT 600;

CREATE TABLE IF NOT EXISTS assets (
  asset_id    TEXT PRIMARY KEY,
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  hash        TEXT NOT NULL,
  mime        TEXT NOT NULL,
  size        BIGINT NOT NULL,
  tags        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS assets_hash_idx ON assets (tenant_id, hash);

CREATE TABLE IF NOT EXISTS api_tokens (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  hash          TEXT NOT NULL UNIQUE,
  scopes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at  TIMESTAMPTZ,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS api_tokens_hash_idx ON api_tokens (hash);
CREATE INDEX IF NOT EXISTS api_tokens_tenant_idx ON api_tokens (tenant_id);

CREATE TABLE IF NOT EXISTS platform_credentials (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform            TEXT NOT NULL,
  account_id          TEXT NOT NULL,
  handle              TEXT,
  access_token_enc    TEXT NOT NULL,
  refresh_token_enc   TEXT,
  expires_at          TIMESTAMPTZ,
  scopes              JSONB NOT NULL DEFAULT '[]'::jsonb,
  meta                JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at        TIMESTAMPTZ,
  revoked_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS platform_credentials_lookup_idx
  ON platform_credentials (tenant_id, platform, account_id);

CREATE TABLE IF NOT EXISTS oauth_states (
  state         TEXT PRIMARY KEY,
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform      TEXT NOT NULL,
  redirect_uri  TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS oauth_states_expires_idx ON oauth_states (expires_at);

CREATE TABLE IF NOT EXISTS users (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email           TEXT NOT NULL UNIQUE,
  password_hash   TEXT NOT NULL,
  tenant_id       UUID REFERENCES tenants(id) ON DELETE SET NULL,
  is_admin        INT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ,
  disabled_at     TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (email);
CREATE INDEX IF NOT EXISTS users_tenant_idx ON users (tenant_id);

CREATE TABLE IF NOT EXISTS user_invites (
  token         TEXT PRIMARY KEY,
  email         TEXT,
  tenant_id     UUID REFERENCES tenants(id) ON DELETE CASCADE,
  scopes        JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_admin      INT NOT NULL DEFAULT 0,
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at    TIMESTAMPTZ NOT NULL,
  consumed_at   TIMESTAMPTZ,
  consumed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  revoked_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS user_invites_expires_idx ON user_invites (expires_at);
CREATE INDEX IF NOT EXISTS user_invites_email_idx ON user_invites (email);

CREATE TABLE IF NOT EXISTS scheduled_pipelines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  cron_expr     TEXT NOT NULL,
  args          JSONB NOT NULL DEFAULT '{}'::jsonb,
  enabled       INT NOT NULL DEFAULT 1,
  next_run_at   TIMESTAMPTZ NOT NULL,
  last_run_at   TIMESTAMPTZ,
  last_status   TEXT,
  last_trace_id TEXT,
  last_error    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by    UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS scheduled_pipelines_next_idx
  ON scheduled_pipelines (enabled, next_run_at);

CREATE TABLE IF NOT EXISTS webhooks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  url             TEXT NOT NULL,
  secret_enc      TEXT NOT NULL,
  schemas         JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled         INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_called_at  TIMESTAMPTZ,
  last_status     INT,
  last_error      TEXT,
  delivered_count INT NOT NULL DEFAULT 0,
  failed_count    INT NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS webhooks_tenant_idx ON webhooks (tenant_id);
CREATE INDEX IF NOT EXISTS webhooks_enabled_idx ON webhooks (enabled);

CREATE TABLE IF NOT EXISTS audit_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID REFERENCES tenants(id) ON DELETE SET NULL,
  actor       TEXT NOT NULL,
  action      TEXT NOT NULL,
  target      TEXT,
  payload     JSONB NOT NULL DEFAULT '{}'::jsonb,
  status      TEXT NOT NULL,
  error       TEXT,
  trace_id    TEXT,
  duration_ms INT NOT NULL DEFAULT 0,
  at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS audit_log_tenant_idx ON audit_log (tenant_id, at);
CREATE INDEX IF NOT EXISTS audit_log_action_idx ON audit_log (action, at);
CREATE INDEX IF NOT EXISTS audit_log_at_idx     ON audit_log (at);

CREATE TABLE IF NOT EXISTS budget_alerts_daily (
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date           TEXT NOT NULL,
  level          TEXT NOT NULL,
  spent_cents    BIGINT NOT NULL,
  ceiling_cents  BIGINT NOT NULL,
  fired_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, date, level)
);

CREATE INDEX IF NOT EXISTS budget_alerts_daily_pk_idx
  ON budget_alerts_daily (tenant_id, date, level);

CREATE TABLE IF NOT EXISTS tenant_cost_daily (
  tenant_id   UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,
  cents       BIGINT NOT NULL DEFAULT 0,
  calls       INT NOT NULL DEFAULT 0,
  models      JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, date)
);

CREATE INDEX IF NOT EXISTS tenant_cost_daily_pk_idx ON tenant_cost_daily (tenant_id, date);
CREATE INDEX IF NOT EXISTS tenant_cost_daily_date_idx ON tenant_cost_daily (date);

CREATE TABLE IF NOT EXISTS tenant_keys (
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,
  api_key_enc  TEXT NOT NULL,
  label        TEXT,
  fingerprint  TEXT NOT NULL,
  last4        TEXT NOT NULL,
  meta         JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_used_at TIMESTAMPTZ,
  revoked_at   TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, provider)
);

CREATE INDEX IF NOT EXISTS tenant_keys_pk_idx ON tenant_keys (tenant_id, provider);

CREATE TABLE IF NOT EXISTS tenant_plugins (
  tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  plugin_name     TEXT NOT NULL,
  plugin_version  TEXT NOT NULL,
  enabled         INT NOT NULL DEFAULT 1,
  config          JSONB NOT NULL DEFAULT '{}'::jsonb,
  installed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, plugin_name)
);

CREATE INDEX IF NOT EXISTS tenant_plugins_pk_idx ON tenant_plugins (tenant_id, plugin_name);

-- Application role used for tenant-scoped queries.
-- The default Postgres role (or PGlite's superuser) BYPASSES RLS, so for
-- isolation we SET LOCAL ROLE vfos_app inside withTenant() transactions.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vfos_app') THEN
    CREATE ROLE vfos_app NOLOGIN NOBYPASSRLS;
  END IF;
END
$$;

GRANT USAGE ON SCHEMA public TO vfos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE assets TO vfos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenants TO vfos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tenant_quotas TO vfos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE platform_credentials TO vfos_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE oauth_states TO vfos_app;

ALTER TABLE assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_assets ON assets;
CREATE POLICY tenant_isolation_assets ON assets
  FOR ALL
  TO vfos_app
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

ALTER TABLE platform_credentials ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_platform_credentials ON platform_credentials;
CREATE POLICY tenant_isolation_platform_credentials ON platform_credentials
  FOR ALL
  TO vfos_app
  USING (tenant_id = current_setting('app.tenant_id', true)::uuid)
  WITH CHECK (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- tenants + tenant_quotas have no RLS: the control plane (default role)
-- needs to list/create/edit tenants regardless of session GUC. The vfos_app
-- role can read them too but only via explicit grants above.
