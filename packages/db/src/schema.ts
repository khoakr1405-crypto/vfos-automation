import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

export const tenants = pgTable('tenants', {
  id: uuid('id').primaryKey().defaultRandom(),
  slug: text('slug').notNull().unique(),
  tier: text('tier').notNull().default('solo'),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const tenant_quotas = pgTable('tenant_quotas', {
  tenant_id: uuid('tenant_id')
    .primaryKey()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  videos_per_day: integer('videos_per_day').notNull().default(30),
  budget_usd_per_day: numeric('budget_usd_per_day', { precision: 8, scale: 2 })
    .notNull()
    .default('5.00'),
  accounts_max: integer('accounts_max').notNull().default(3),
  plugins_max: integer('plugins_max').notNull().default(10),
  syscalls_per_minute: integer('syscalls_per_minute').notNull().default(600),
  updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const assets = pgTable(
  'assets',
  {
    asset_id: text('asset_id').primaryKey(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    hash: text('hash').notNull(),
    mime: text('mime').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    tags: jsonb('tags').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('assets_hash_idx').on(t.tenant_id, t.hash)],
);

export const api_tokens = pgTable('api_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  hash: text('hash').notNull().unique(),
  scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
});

export const user_invites = pgTable('user_invites', {
  token: text('token').primaryKey(),
  email: text('email'),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'cascade' }),
  scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  is_admin: integer('is_admin').notNull().default(0),
  created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
  consumed_by: uuid('consumed_by').references(() => users.id, { onDelete: 'set null' }),
  revoked_at: timestamp('revoked_at', { withTimezone: true }),
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  password_hash: text('password_hash').notNull(),
  tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
  is_admin: integer('is_admin').notNull().default(0),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  last_login_at: timestamp('last_login_at', { withTimezone: true }),
  disabled_at: timestamp('disabled_at', { withTimezone: true }),
});

export const oauth_states = pgTable('oauth_states', {
  state: text('state').primaryKey(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  platform: text('platform').notNull(),
  redirect_uri: text('redirect_uri').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expires_at: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumed_at: timestamp('consumed_at', { withTimezone: true }),
});

export const webhooks = pgTable('webhooks', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenant_id: uuid('tenant_id')
    .notNull()
    .references(() => tenants.id, { onDelete: 'cascade' }),
  url: text('url').notNull(),
  secret_enc: text('secret_enc').notNull(),
  schemas: jsonb('schemas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  enabled: integer('enabled').notNull().default(1),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  last_called_at: timestamp('last_called_at', { withTimezone: true }),
  last_status: integer('last_status'),
  last_error: text('last_error'),
  delivered_count: integer('delivered_count').notNull().default(0),
  failed_count: integer('failed_count').notNull().default(0),
});

export const scheduled_pipelines = pgTable(
  'scheduled_pipelines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    cron_expr: text('cron_expr').notNull(),
    args: jsonb('args').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    enabled: integer('enabled').notNull().default(1),
    next_run_at: timestamp('next_run_at', { withTimezone: true }).notNull(),
    last_run_at: timestamp('last_run_at', { withTimezone: true }),
    last_status: text('last_status'),
    last_trace_id: text('last_trace_id'),
    last_error: text('last_error'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    created_by: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  },
  (t) => [index('scheduled_pipelines_next_idx').on(t.enabled, t.next_run_at)],
);

export const audit_log = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // tenant_id is nullable because some admin syscalls (e.g. tokens.create
    // for a brand-new tenant) run with the admin-token context where
    // caller tenant is null.
    tenant_id: uuid('tenant_id').references(() => tenants.id, { onDelete: 'set null' }),
    actor: text('actor').notNull(),
    action: text('action').notNull(),
    target: text('target'),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    status: text('status').notNull(),
    error: text('error'),
    trace_id: text('trace_id'),
    duration_ms: integer('duration_ms').notNull().default(0),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('audit_log_tenant_idx').on(t.tenant_id, t.at),
    index('audit_log_action_idx').on(t.action, t.at),
    index('audit_log_at_idx').on(t.at),
  ],
);

export const budget_alerts_daily = pgTable(
  'budget_alerts_daily',
  {
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    date: text('date').notNull(),
    // 'warn_80' fires once when daily spend crosses 80% of ceiling.
    // 'exceeded' fires once when daily spend crosses 100%.
    level: text('level').notNull(),
    spent_cents: bigint('spent_cents', { mode: 'number' }).notNull(),
    ceiling_cents: bigint('ceiling_cents', { mode: 'number' }).notNull(),
    fired_at: timestamp('fired_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('budget_alerts_daily_pk_idx').on(t.tenant_id, t.date, t.level)],
);

export const tenant_cost_daily = pgTable(
  'tenant_cost_daily',
  {
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    // Stored as 'YYYY-MM-DD' UTC — text not date so PGlite and Postgres
    // round-trip identically without timezone surprises.
    date: text('date').notNull(),
    cents: bigint('cents', { mode: 'number' }).notNull().default(0),
    calls: integer('calls').notNull().default(0),
    // {model: cents} breakdown — useful when one tenant burns budget on
    // Opus while another stays on Haiku.
    models: jsonb('models').$type<Record<string, number>>().notNull().default(sql`'{}'::jsonb`),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tenant_cost_daily_pk_idx').on(t.tenant_id, t.date)],
);

export const tenant_keys = pgTable(
  'tenant_keys',
  {
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    provider: text('provider').notNull(),
    api_key_enc: text('api_key_enc').notNull(),
    label: text('label'),
    fingerprint: text('fingerprint').notNull(),
    last4: text('last4').notNull(),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('tenant_keys_pk_idx').on(t.tenant_id, t.provider)],
);

export const tenant_plugins = pgTable(
  'tenant_plugins',
  {
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    plugin_name: text('plugin_name').notNull(),
    plugin_version: text('plugin_version').notNull(),
    enabled: integer('enabled').notNull().default(1),
    config: jsonb('config').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    installed_at: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('tenant_plugins_pk_idx').on(t.tenant_id, t.plugin_name)],
);

export const platform_credentials = pgTable(
  'platform_credentials',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenant_id: uuid('tenant_id')
      .notNull()
      .references(() => tenants.id, { onDelete: 'cascade' }),
    platform: text('platform').notNull(),
    account_id: text('account_id').notNull(),
    handle: text('handle'),
    access_token_enc: text('access_token_enc').notNull(),
    refresh_token_enc: text('refresh_token_enc'),
    expires_at: timestamp('expires_at', { withTimezone: true }),
    scopes: jsonb('scopes').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    meta: jsonb('meta').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    last_used_at: timestamp('last_used_at', { withTimezone: true }),
    revoked_at: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [index('platform_credentials_lookup_idx').on(t.tenant_id, t.platform, t.account_id)],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantQuota = typeof tenant_quotas.$inferSelect;
export type NewTenantQuota = typeof tenant_quotas.$inferInsert;
export type Asset = typeof assets.$inferSelect;
export type NewAsset = typeof assets.$inferInsert;
export type ApiToken = typeof api_tokens.$inferSelect;
export type NewApiToken = typeof api_tokens.$inferInsert;
export type PlatformCredential = typeof platform_credentials.$inferSelect;
export type NewPlatformCredential = typeof platform_credentials.$inferInsert;
export type OAuthState = typeof oauth_states.$inferSelect;
export type NewOAuthState = typeof oauth_states.$inferInsert;
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserInvite = typeof user_invites.$inferSelect;
export type NewUserInvite = typeof user_invites.$inferInsert;
export type ScheduledPipeline = typeof scheduled_pipelines.$inferSelect;
export type NewScheduledPipeline = typeof scheduled_pipelines.$inferInsert;
export type Webhook = typeof webhooks.$inferSelect;
export type NewWebhook = typeof webhooks.$inferInsert;
export type TenantPlugin = typeof tenant_plugins.$inferSelect;
export type NewTenantPlugin = typeof tenant_plugins.$inferInsert;
export type TenantKey = typeof tenant_keys.$inferSelect;
export type NewTenantKey = typeof tenant_keys.$inferInsert;
export type TenantCostDaily = typeof tenant_cost_daily.$inferSelect;
export type NewTenantCostDaily = typeof tenant_cost_daily.$inferInsert;
export type BudgetAlertDaily = typeof budget_alerts_daily.$inferSelect;
export type NewBudgetAlertDaily = typeof budget_alerts_daily.$inferInsert;
export type AuditLog = typeof audit_log.$inferSelect;
export type NewAuditLog = typeof audit_log.$inferInsert;
