// All kernel calls (server + client) flow through /api/kernel/[...path],
// which lives in this Next.js app. That handler injects the admin Bearer
// token, so kernel.ts itself stays auth-free and bundles cleanly into both
// the server and the browser. Server components need an absolute URL to
// hit their own Next.js process; client components use a relative path.
const IS_SERVER = typeof window === 'undefined';
const COCKPIT_ORIGIN = process.env.COCKPIT_ORIGIN ?? 'http://localhost:3001';
const BASE = IS_SERVER ? `${COCKPIT_ORIGIN}/api/kernel` : '/api/kernel';

export interface SyscallInfo {
  name: string;
  description: string;
  requiredScope: string;
}

export interface PluginInfo {
  name: string;
  version: string;
  scopes: readonly string[];
  tenant_id: string;
}

export interface DriverInfo {
  name: string;
  capabilities: readonly string[];
  models: readonly string[];
}

export interface QueueStat {
  queue: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
}

export interface KernelEvent<T = unknown> {
  event_id: string;
  trace_id: string;
  tenant_id: string;
  emitted_at: string;
  emitter: string;
  schema: string;
  payload: T;
  meta?: Record<string, unknown>;
}

export function replayEvent(event_id: string) {
  return callSyscall<{
    event_id: string;
    schema: string;
    original_event_id: string;
  }>('events.replay', { event_id }, ['tenant.admin']);
}

export interface BudgetSnapshot {
  date: string;
  spent_cents: number;
  ceiling_cents: number;
  blocked: boolean;
}

export interface BusInfo {
  name: string;
  queue: string;
}

async function kernelFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, { cache: 'no-store', ...init });
  if (!res.ok) throw new Error(`kernel ${path}: ${res.status}`);
  return (await res.json()) as T;
}

export function getSyscalls() {
  return kernelFetch<{ syscalls: SyscallInfo[] }>('/v1/syscalls');
}

export function getPlugins() {
  return kernelFetch<{ plugins: PluginInfo[] }>('/v1/plugins');
}

export function getDrivers() {
  return kernelFetch<{ drivers: DriverInfo[] }>('/v1/drivers');
}

export function getQueues() {
  return kernelFetch<{ queues: { name: string; stats: QueueStat | null }[] }>('/v1/queues');
}

export function getBus() {
  return kernelFetch<BusInfo>('/v1/bus');
}

export function getBudget() {
  return kernelFetch<BudgetSnapshot>('/v1/budget');
}

export interface TenantRow {
  id: string;
  slug: string;
  tier: string;
  created_at: string;
  videos_per_day: number | null;
  budget_usd_per_day: string | null;
  accounts_max: number | null;
  plugins_max: number | null;
  syscalls_per_minute: number | null;
}

export async function callSyscall<T>(
  name: string,
  args: unknown,
  scopes: string[] = [],
): Promise<T> {
  const res = await fetch(`${BASE}/v1/syscall`, {
    method: 'POST',
    cache: 'no-store',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, args, scopes }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`syscall ${name}: ${res.status} ${body}`);
  }
  const body = (await res.json()) as { ok: boolean; result?: T; error?: string };
  if (!body.ok) throw new Error(body.error ?? `syscall ${name} returned ok=false`);
  return body.result as T;
}

export function listTenants() {
  return callSyscall<{ tenants: TenantRow[] }>('tenant.list', {}, ['tenant.admin']);
}

export function createTenant(input: { slug: string; tier: string }) {
  return callSyscall<{ id: string; slug: string; tier: string }>(
    'tenant.create',
    input,
    ['tenant.admin'],
  );
}

export async function getMetricsText(): Promise<string> {
  const res = await fetch(`${BASE}/metrics`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`kernel /metrics: ${res.status}`);
  return res.text();
}

export interface ApiTokenRow {
  id: string;
  tenant_id: string | null;
  name: string;
  scopes: readonly string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function listApiTokens(tenant_id?: string | null) {
  const args: Record<string, unknown> = { include_revoked: false };
  if (tenant_id !== undefined) args.tenant_id = tenant_id;
  return callSyscall<{ tokens: ApiTokenRow[] }>('tokens.list', args, []);
}

export function createApiToken(input: {
  tenant_id: string | null;
  name: string;
  scopes: string[];
}) {
  return callSyscall<{
    id: string;
    raw_token: string;
    tenant_id: string | null;
    name: string;
    scopes: string[];
  }>('tokens.create', input, []);
}

export function revokeApiToken(id: string) {
  return callSyscall<{ id: string; revoked: boolean }>('tokens.revoke', { id }, []);
}

export interface TraceSummary {
  trace_id: string;
  spans: number;
  root_name: string;
  start_unix_ms: number;
  duration_ms: number;
  status: 'OK' | 'ERROR' | 'UNSET';
}

export interface SpanDetail {
  span_id: string;
  parent_span_id: string | null;
  name: string;
  kind: number;
  start_unix_ms: number;
  duration_ms: number;
  status: number;
  attributes: Record<string, unknown>;
}

export function listTraces(limit = 50) {
  return kernelFetch<{ traces: TraceSummary[] }>(`/v1/traces?limit=${limit}`);
}

export function getTrace(trace_id: string) {
  return kernelFetch<{ trace_id: string; spans: SpanDetail[] }>(
    `/v1/traces/${trace_id}`,
  );
}

export function getEvents(opts: { limit?: number; schema?: string } = {}) {
  const params = new URLSearchParams();
  if (opts.limit) params.set('limit', String(opts.limit));
  if (opts.schema) params.set('schema', opts.schema);
  const qs = params.toString();
  return kernelFetch<{ events: KernelEvent[] }>(`/v1/events${qs ? `?${qs}` : ''}`);
}

export interface ConnectorInfo {
  platform: string;
  mode: 'mock' | 'live';
}

export interface OAuthProviderInfo {
  platform: string;
  mode: 'mock' | 'live';
}

export function getConnectors() {
  return kernelFetch<{ connectors: ConnectorInfo[] }>('/v1/connectors');
}

export function getOAuthProviders() {
  return kernelFetch<{ providers: OAuthProviderInfo[] }>('/v1/oauth/providers');
}

export type LLMIntent =
  | 'editorial_rewrite'
  | 'caption_hook'
  | 'classify_niche'
  | 'policy_check'
  | 'tool_loop';

export interface AiTestResult {
  intent: LLMIntent;
  route: {
    driver: string;
    model: string;
    max_tokens: number;
    cache_system: boolean;
    driver_available: boolean;
  };
  model: string;
  text: string;
  json: unknown;
  usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number };
  cost_cents: number;
  latency_ms: number;
  cache_enabled: boolean;
}

export function runAiTest(input: {
  intent: LLMIntent;
  system: string;
  user: string;
  schema?: Record<string, unknown>;
}) {
  return callSyscall<AiTestResult>('ai.test', input, ['tenant.admin']);
}

export interface InviteRow {
  token: string;
  email: string | null;
  tenant_id: string | null;
  scopes: readonly string[];
  is_admin: boolean;
  created_by: string | null;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  consumed_by: string | null;
  revoked_at: string | null;
}

export function listInvites(include_consumed = false) {
  return callSyscall<{ invites: InviteRow[] }>('auth.invite.list', { include_consumed }, [
    'tenant.admin',
  ]);
}

export function createInvite(input: {
  email?: string;
  tenant_id?: string | null;
  scopes?: string[];
  is_admin?: boolean;
  ttl_hours?: number;
}) {
  return callSyscall<{ invite: InviteRow }>('auth.invite.create', input, ['tenant.admin']);
}

export function revokeInvite(token: string) {
  return callSyscall<{ token: string; revoked: boolean }>(
    'auth.invite.revoke',
    { token },
    ['tenant.admin'],
  );
}

export interface PipelineStep {
  name: string;
  status: 'ok' | 'failed' | 'skipped';
  ms: number;
  output?: Record<string, unknown>;
  error?: string;
}

export interface PublishSummary {
  platform: 'tiktok' | 'facebook';
  status: 'published' | 'skipped' | 'failed';
  account_id?: string;
  publish_id?: string;
  url?: string;
  error?: string;
}

export interface PipelineResult {
  trace_id: string;
  total_ms: number;
  final:
    | 'published'
    | 'partial'
    | 'rejected_compliance'
    | 'no_connector'
    | 'render_timeout'
    | 'failed';
  reason?: string;
  steps: PipelineStep[];
  publishes?: PublishSummary[];
}

export function runPipeline(input: {
  source_url?: string;
  views_per_hour?: number;
  engagement_rate?: number;
  niche_hint?: string;
  transcript?: string;
  target_platform?: 'tiktok' | 'facebook';
  target_platforms?: ('tiktok' | 'facebook')[];
  caption?: string;
  privacy?: 'public' | 'unlisted' | 'private';
}) {
  return callSyscall<PipelineResult>('pipeline.run', input, ['tenant.admin']);
}

export interface ScheduleRow {
  id: string;
  tenant_id: string;
  name: string;
  cron_expr: string;
  args: Record<string, unknown>;
  enabled: boolean;
  next_run_at: string;
  last_run_at: string | null;
  last_status: string | null;
  last_trace_id: string | null;
  last_error: string | null;
  created_at: string;
}

export function listSchedules() {
  return callSyscall<{ schedules: ScheduleRow[] }>('scheduler.list', {}, ['tenant.read']);
}

export function createSchedule(input: {
  name: string;
  cron_expr: string;
  args?: Record<string, unknown>;
  enabled?: boolean;
}) {
  return callSyscall<{ schedule: ScheduleRow }>('scheduler.create', input, ['tenant.admin']);
}

export function updateSchedule(input: {
  id: string;
  cron_expr?: string;
  args?: Record<string, unknown>;
  enabled?: boolean;
}) {
  return callSyscall<{ schedule: ScheduleRow }>('scheduler.update', input, ['tenant.admin']);
}

export function deleteSchedule(id: string) {
  return callSyscall<{ id: string; deleted: boolean }>('scheduler.delete', { id }, [
    'tenant.admin',
  ]);
}

export function runScheduleNow(id: string) {
  return callSyscall<{ schedule: ScheduleRow; nudged: boolean }>(
    'scheduler.run_now',
    { id },
    ['tenant.admin'],
  );
}

export interface WebhookRow {
  id: string;
  tenant_id: string;
  url: string;
  schemas: readonly string[];
  enabled: boolean;
  created_at: string;
  last_called_at: string | null;
  last_status: number | null;
  last_error: string | null;
  delivered_count: number;
  failed_count: number;
}

export function listWebhooks() {
  return callSyscall<{ webhooks: WebhookRow[]; known_schemas: readonly string[] }>(
    'webhooks.list',
    {},
    ['tenant.read'],
  );
}

export function createWebhook(input: {
  url: string;
  schemas: string[];
  enabled?: boolean;
}) {
  return callSyscall<{
    webhook: WebhookRow;
    secret: string;
    known_schemas: readonly string[];
  }>('webhooks.create', input, ['tenant.admin']);
}

export function updateWebhook(input: {
  id: string;
  url?: string;
  schemas?: string[];
  enabled?: boolean;
}) {
  return callSyscall<{ webhook: WebhookRow }>('webhooks.update', input, ['tenant.admin']);
}

export function deleteWebhook(id: string) {
  return callSyscall<{ id: string; deleted: boolean }>('webhooks.delete', { id }, [
    'tenant.admin',
  ]);
}

export interface AuditRow {
  id: string;
  tenant_id: string | null;
  actor: string;
  action: string;
  target: string | null;
  payload: Record<string, unknown>;
  status: string;
  error: string | null;
  trace_id: string | null;
  duration_ms: number;
  at: string;
}

export function listAuditEntries(opts: {
  limit?: number;
  action?: string;
  status?: 'ok' | 'error';
  tenant_id?: string | null;
  since?: string;
} = {}) {
  return callSyscall<{ rows: AuditRow[]; filtered: boolean }>(
    'audit.list',
    opts,
    ['tenant.read'],
  );
}

export interface AuditSummaryRow {
  action: string;
  status: string;
  n: number;
}

export function getAuditSummary(hours = 24) {
  return callSyscall<{ hours: number; rows: AuditSummaryRow[] }>(
    'audit.summary',
    { hours },
    ['tenant.read'],
  );
}

export interface CostSummaryDay {
  date: string;
  cents: number;
  calls: number;
  models: Record<string, number>;
}

export function getCostSummary(days = 30) {
  return callSyscall<{
    rows: CostSummaryDay[];
    total_cents: number;
    total_calls: number;
    days: number;
  }>('costs.summary', { days }, ['tenant.read']);
}

export interface TopTenantRow {
  tenant_id: string;
  slug: string | null;
  cents: number;
  calls: number;
}

export function getTopTenantsToday(limit = 25) {
  return callSyscall<{ rows: TopTenantRow[]; total_cents: number; date: string }>(
    'costs.top_today',
    { limit },
    ['tenant.admin'],
  );
}

export interface TenantKeyRow {
  provider: string;
  label: string | null;
  last4: string;
  fingerprint: string;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  active: boolean;
}

export function listTenantKeys() {
  return callSyscall<{ keys: TenantKeyRow[]; supported_providers: readonly string[] }>(
    'keys.list',
    {},
    ['tenant.read'],
  );
}

export function setTenantKey(input: { provider: string; api_key: string; label?: string }) {
  return callSyscall<{ key: TenantKeyRow }>('keys.set', input, ['tenant.admin']);
}

export function revokeTenantKey(provider: string) {
  return callSyscall<{ key: TenantKeyRow; revoked: boolean }>(
    'keys.revoke',
    { provider },
    ['tenant.admin'],
  );
}

export interface PluginConfigField {
  type: 'number' | 'integer' | 'string' | 'boolean';
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  enum?: readonly string[];
  default?: number | string | boolean;
  description?: string;
}

export interface PluginConfigSchema {
  type: 'object';
  properties: Record<string, PluginConfigField>;
  required?: readonly string[];
}

export interface MarketplacePluginRow {
  name: string;
  version: string;
  description: string;
  scopes: readonly string[];
  installed: boolean;
  enabled: boolean;
  loaded: boolean;
  installed_at: string | null;
  installed_version: string | null;
  config: Record<string, unknown>;
  configSchema?: PluginConfigSchema;
}

export function updatePluginConfig(input: { name: string; config: Record<string, unknown> }) {
  return callSyscall<{
    name: string;
    tenant_id: string;
    config: Record<string, unknown>;
    reloaded: boolean;
  }>('plugins.update_config', input, ['tenant.admin']);
}

export function listAvailablePlugins() {
  return callSyscall<{ plugins: MarketplacePluginRow[] }>(
    'plugins.list_available',
    {},
    ['tenant.read'],
  );
}

export function installPlugin(name: string) {
  return callSyscall<{
    plugin: { name: string; version: string; scopes: readonly string[] };
    tenant_id: string;
    loaded: boolean;
  }>('plugins.install', { name }, ['tenant.admin']);
}

export function uninstallPlugin(name: string) {
  return callSyscall<{ name: string; tenant_id: string; uninstalled: boolean; unloaded: boolean }>(
    'plugins.uninstall',
    { name },
    ['tenant.admin'],
  );
}

export function testWebhook(id: string) {
  return callSyscall<{ event_id: string; schema: string }>('webhooks.test', { id }, [
    'tenant.admin',
  ]);
}

export async function startOAuth(platform: string): Promise<{
  authorize_url: string;
  state: string;
  expires_at: string;
  mode: 'mock' | 'live';
}> {
  const res = await fetch(`${BASE}/v1/oauth/${encodeURIComponent(platform)}/start`, {
    method: 'POST',
    cache: 'no-store',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`oauth start ${platform}: ${res.status} ${body}`);
  }
  const data = (await res.json()) as {
    ok: boolean;
    authorize_url?: string;
    state?: string;
    expires_at?: string;
    mode?: 'mock' | 'live';
    error?: string;
  };
  if (!data.ok || !data.authorize_url) {
    throw new Error(data.error ?? `oauth start ${platform}: no authorize_url`);
  }
  return {
    authorize_url: data.authorize_url,
    state: data.state!,
    expires_at: data.expires_at!,
    mode: data.mode!,
  };
}

export interface PlatformCredentialRow {
  id: string;
  platform: string;
  account_id: string;
  handle: string | null;
  scopes: readonly string[];
  meta: Record<string, unknown>;
  has_refresh_token: boolean;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
}

export function listConnectorCredentials(opts: { platform?: string; include_revoked?: boolean } = {}) {
  const args: Record<string, unknown> = { include_revoked: opts.include_revoked ?? false };
  if (opts.platform) args.platform = opts.platform;
  return callSyscall<{ credentials: PlatformCredentialRow[] }>(
    'connectors.list',
    args,
    ['tenant.read'],
  );
}

export function linkConnector(input: {
  platform: string;
  account_id: string;
  handle?: string;
  access_token: string;
  refresh_token?: string;
  expires_at?: string;
  scopes?: string[];
  meta?: Record<string, unknown>;
}) {
  return callSyscall<{ credential: PlatformCredentialRow; action: 'created' | 'updated' }>(
    'connectors.link',
    input,
    ['tenant.admin'],
  );
}

export function unlinkConnector(id: string) {
  return callSyscall<{ id: string; revoked: boolean }>('connectors.unlink', { id }, [
    'tenant.admin',
  ]);
}
