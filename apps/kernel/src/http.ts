import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { ulid } from 'ulid';
import type { Logger } from 'pino';
import type { BudgetGuard } from './ai/budget.js';
import { createToken, revokeToken, type AuthContext, validateToken } from './auth/tokens.js';
import {
  createUser,
  findUserByEmail,
  userCount,
  verifyUserCredentials,
} from './auth/users.js';
import { consumeInvite, getInviteByToken } from './auth/invites.js';
import { BudgetExceededError } from './ai/budget.js';
import { RateLimitError } from './rate-limit.js';
import type { EventBus } from './bus/types.js';
import type { ConnectorRegistry } from './connectors/registry.js';
import type { PlatformName } from './connectors/types.js';
import type { DbHandle } from './db/client.js';
import type { DriverRegistry } from './drivers/registry.js';
import type { OAuthRegistry } from './oauth/registry.js';
import { consumeOAuthState, createOAuthState } from './oauth/state.js';
import type { PluginLoader } from './plugin-loader.js';
import type { JobQueue } from './queue/types.js';
import type { SyscallRegistry } from './syscall-registry.js';
import { getMetricsText, getRecentSpans } from './telemetry/setup.js';

interface BuildOpts {
  logger: Logger;
  bus: EventBus;
  syscalls: SyscallRegistry;
  plugins: PluginLoader;
  drivers: DriverRegistry;
  queue: JobQueue;
  budget: BudgetGuard;
  db: DbHandle;
  connectors: ConnectorRegistry;
  oauth: OAuthRegistry;
  publicOrigin: string;
  cockpitOrigin: string;
  defaultTenantId: string;
}

const InvokeBody = z.object({
  name: z.string().min(1),
  args: z.unknown(),
  // body.scopes is kept for backward-compat with the smoke client, but
  // when an authenticated request hits this endpoint the token's scopes
  // win — body.scopes is ignored.
  scopes: z.array(z.string()).optional(),
});

const KNOWN_QUEUES = [
  'vfos.render',
  'vfos.publish',
  'vfos.attribution',
  'vfos.scheduler',
] as const;
const PUBLIC_PREFIXES = [
  '/healthz',
  '/metrics',
  '/v1/auth/signup',
  '/v1/auth/login',
  '/v1/auth/bootstrap-status',
];
const PUBLIC_PATH_PATTERNS: RegExp[] = [
  /^\/v1\/oauth\/[^/]+\/callback$/,
  /^\/v1\/auth\/invite\/[^/]+$/,
  /^\/v1\/auth\/invite\/[^/]+\/accept$/,
];

const TENANT_USER_SCOPES = [
  'fs.read',
  'fs.write',
  'ai.complete',
  'queue.read',
  'queue.write',
  'tenant.read',
  'publish.write',
];

const SignupBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
  tenant_slug: z.string().min(1).max(80).optional(),
});

const LoginBody = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(200),
});

const InviteAcceptBody = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(200),
});

declare module 'fastify' {
  interface FastifyRequest {
    authCtx?: AuthContext;
  }
}

function isPublic(url: string): boolean {
  const path = url.split('?')[0] ?? url;
  if (PUBLIC_PREFIXES.some((p) => path === p)) return true;
  return PUBLIC_PATH_PATTERNS.some((r) => r.test(path));
}

function extractBearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization ?? req.headers.Authorization;
  if (typeof h !== 'string') return null;
  if (!h.toLowerCase().startsWith('bearer ')) return null;
  return h.slice(7).trim();
}

export async function buildHttp(opts: BuildOpts): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  app.addHook('onSend', async (_req, reply) => {
    reply.header('access-control-allow-origin', '*');
    reply.header(
      'access-control-allow-headers',
      'content-type, x-tenant-id, authorization',
    );
  });

  app.addHook('preHandler', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    if (isPublic(req.url)) return;
    const raw = extractBearer(req);
    if (!raw) {
      reply.code(401);
      reply.send({ ok: false, error: 'missing bearer token' });
      return reply;
    }
    const ctx = await validateToken(opts.db, raw);
    if (!ctx) {
      reply.code(401);
      reply.send({ ok: false, error: 'invalid or revoked token' });
      return reply;
    }
    req.authCtx = ctx;
    return undefined;
  });

  app.get('/healthz', async () => ({ status: 'ok', ts: new Date().toISOString() }));

  // ---- Auth (users + sessions) ----
  // The first POST /v1/auth/signup that hits a system with zero users becomes
  // the platform admin (scope='*', tenant_id=null). After that, /signup
  // returns 409 — additional users must be invited via /v1/auth/invite (TBD)
  // or minted by an admin token via the existing tokens.create syscall.

  app.get('/v1/auth/bootstrap-status', async () => {
    const n = await userCount(opts.db);
    return { users: n, signup_allowed: n === 0 };
  });

  app.post('/v1/auth/signup', async (req, reply) => {
    const body = SignupBody.parse(req.body);
    const existingCount = await userCount(opts.db);
    if (existingCount > 0) {
      reply.code(409);
      return { ok: false, error: 'signup disabled: a user already exists' };
    }
    const existingByEmail = await findUserByEmail(opts.db, body.email);
    if (existingByEmail) {
      reply.code(409);
      return { ok: false, error: 'email already registered' };
    }
    // First user: pin to default tenant but mark is_admin so they can manage
    // tenants/tokens via tenant.admin scope.
    const tenant_id = opts.defaultTenantId;
    const user = await createUser(opts.db, {
      email: body.email,
      password: body.password,
      tenant_id,
      is_admin: true,
    });
    const session = await createToken(opts.db, {
      tenant_id: null,
      name: `session:${user.email}:${ulid().slice(-8)}`,
      scopes: ['*'],
    });
    return {
      ok: true,
      user: { id: user.id, email: user.email, tenant_id: user.tenant_id, is_admin: user.is_admin },
      token: session.raw_token,
      token_id: session.id,
    };
  });

  app.post('/v1/auth/login', async (req, reply) => {
    const body = LoginBody.parse(req.body);
    const user = await verifyUserCredentials(opts.db, body.email, body.password);
    if (!user) {
      reply.code(401);
      return { ok: false, error: 'invalid email or password' };
    }
    const scopes = user.is_admin ? ['*'] : TENANT_USER_SCOPES;
    const session = await createToken(opts.db, {
      tenant_id: user.is_admin ? null : user.tenant_id,
      name: `session:${user.email}:${ulid().slice(-8)}`,
      scopes,
    });
    return {
      ok: true,
      user: { id: user.id, email: user.email, tenant_id: user.tenant_id, is_admin: user.is_admin },
      token: session.raw_token,
      token_id: session.id,
    };
  });

  app.get('/v1/auth/me', async (req, reply) => {
    if (!req.authCtx) {
      reply.code(401);
      return { ok: false, error: 'unauthenticated' };
    }
    return {
      ok: true,
      token_id: req.authCtx.token_id,
      tenant_id: req.authCtx.tenant_id,
      scopes: req.authCtx.scopes,
      is_admin: req.authCtx.is_admin,
    };
  });

  app.post('/v1/auth/logout', async (req, reply) => {
    if (!req.authCtx) {
      reply.code(401);
      return { ok: false, error: 'unauthenticated' };
    }
    const ok = await revokeToken(opts.db, req.authCtx.token_id);
    return { ok };
  });

  // ---- Invites (public verify + accept) ----
  // Both endpoints are public; the invite token itself is the credential.

  app.get('/v1/auth/invite/:token', async (req, reply) => {
    const { token } = req.params as { token: string };
    const inv = await getInviteByToken(opts.db, token);
    if (!inv || inv.revoked_at) {
      reply.code(404);
      return { ok: false, error: 'invite not found or revoked' };
    }
    if (inv.consumed_at) {
      reply.code(409);
      return { ok: false, error: 'invite already used' };
    }
    if (inv.expires_at.getTime() < Date.now()) {
      reply.code(410);
      return { ok: false, error: 'invite expired' };
    }
    return {
      ok: true,
      invite: {
        email: inv.email,
        tenant_id: inv.tenant_id,
        scopes: inv.scopes,
        is_admin: inv.is_admin,
        expires_at: inv.expires_at,
      },
    };
  });

  app.post('/v1/auth/invite/:token/accept', async (req, reply) => {
    const { token } = req.params as { token: string };
    const body = InviteAcceptBody.parse(req.body);
    const inv = await getInviteByToken(opts.db, token);
    if (!inv || inv.revoked_at || inv.consumed_at) {
      reply.code(404);
      return { ok: false, error: 'invite not found, revoked, or already used' };
    }
    if (inv.expires_at.getTime() < Date.now()) {
      reply.code(410);
      return { ok: false, error: 'invite expired' };
    }
    // If invite pinned an email, enforce match (case-insensitive).
    if (inv.email && inv.email.toLowerCase() !== body.email.toLowerCase()) {
      reply.code(403);
      return { ok: false, error: 'email does not match invite' };
    }
    const existing = await findUserByEmail(opts.db, body.email);
    if (existing) {
      reply.code(409);
      return { ok: false, error: 'email already registered' };
    }
    const user = await createUser(opts.db, {
      email: body.email,
      password: body.password,
      tenant_id: inv.tenant_id ?? opts.defaultTenantId,
      is_admin: inv.is_admin,
    });
    const consumed = await consumeInvite(opts.db, token, user.id);
    if (!consumed) {
      // Race: someone else consumed it between getInviteByToken and the
      // atomic update. Refuse the signup (we already created the user, so
      // a retry would 409 — that's intentional, the user can /login now).
      reply.code(409);
      return { ok: false, error: 'invite consumed concurrently' };
    }
    const scopes = inv.is_admin ? ['*'] : [...inv.scopes];
    const session = await createToken(opts.db, {
      tenant_id: inv.is_admin ? null : user.tenant_id,
      name: `session:${user.email}:${ulid().slice(-8)}`,
      scopes,
    });
    return {
      ok: true,
      user: { id: user.id, email: user.email, tenant_id: user.tenant_id, is_admin: user.is_admin },
      token: session.raw_token,
      token_id: session.id,
    };
  });

  app.get('/metrics', async (_req, reply) => {
    const text = await getMetricsText();
    reply.header('content-type', 'text/plain; version=0.0.4; charset=utf-8');
    return text;
  });

  app.get('/v1/syscalls', async () => ({
    syscalls: opts.syscalls.list().map((s) => ({
      name: s.name,
      description: s.description,
      requiredScope: s.requiredScope,
    })),
  }));

  app.get('/v1/plugins', async (req) => {
    // Admin tokens (tenant_id=null) see every loaded instance; tenant
    // tokens see only their tenant's agents — same shape both ways.
    const ctx = req.authCtx;
    const all = ctx?.tenant_id ? opts.plugins.listForTenant(ctx.tenant_id) : opts.plugins.list();
    return {
      plugins: all.map((p) => ({
        name: p.meta.name,
        version: p.meta.version,
        scopes: p.meta.scopes,
        tenant_id: p.tenant_id,
      })),
    };
  });

  app.get('/v1/drivers', async () => ({
    drivers: opts.drivers.list().map((d) => ({
      name: d.name,
      capabilities: d.capabilities,
      models: Object.keys(d.pricing),
    })),
  }));

  app.get('/v1/connectors', async () => ({
    connectors: opts.connectors.list().map((c) => ({
      platform: c.platform,
      mode: c.mode,
    })),
  }));

  app.get('/v1/oauth/providers', async () => ({
    providers: opts.oauth.list().map((p) => ({
      platform: p.platform,
      mode: p.mode,
    })),
  }));

  // Authenticated: caller's tenant_id is pinned into the state row,
  // returned authorize_url is for the browser to redirect to.
  app.post('/v1/oauth/:platform/start', async (req, reply) => {
    const auth = req.authCtx;
    if (!auth) {
      reply.code(401);
      return { ok: false, error: 'unauthenticated' };
    }
    const params = req.params as { platform: string };
    if (!opts.oauth.has(params.platform as PlatformName)) {
      reply.code(404);
      return { ok: false, error: `oauth provider not registered: ${params.platform}` };
    }
    const provider = opts.oauth.get(params.platform as PlatformName);
    const tenantId = auth.is_admin
      ? (req.headers['x-tenant-id'] as string | undefined) ??
        auth.tenant_id ??
        opts.defaultTenantId
      : auth.tenant_id ?? opts.defaultTenantId;
    const redirect_uri = `${opts.publicOrigin}/v1/oauth/${provider.platform}/callback`;
    const { state, expires_at } = await createOAuthState(opts.db, {
      tenant_id: tenantId,
      platform: provider.platform,
      redirect_uri,
    });
    const authorize_url = provider.authorizeUrl({ state, redirect_uri });
    return {
      ok: true,
      authorize_url,
      state,
      expires_at: expires_at.toISOString(),
      mode: provider.mode,
    };
  });

  // PUBLIC endpoint: OAuth provider redirects the browser here with
  // ?code & ?state. We verify the state row (single-use, expiring) to
  // recover the originating tenant_id, then exchange code → token and
  // store via the connectors.link syscall. Browser is bounced to cockpit.
  app.get('/v1/oauth/:platform/callback', async (req, reply) => {
    const params = req.params as { platform: string };
    const q = req.query as { code?: string; state?: string; error?: string };
    const platform = params.platform as PlatformName;
    const failRedirect = (reason: string): string =>
      `${opts.cockpitOrigin}/connectors?status=failed&platform=${encodeURIComponent(platform)}&reason=${encodeURIComponent(reason)}`;
    if (q.error) {
      reply.redirect(failRedirect(q.error));
      return;
    }
    if (!q.code || !q.state) {
      reply.redirect(failRedirect('missing_code_or_state'));
      return;
    }
    if (!opts.oauth.has(platform)) {
      reply.redirect(failRedirect('unknown_platform'));
      return;
    }
    const verified = await consumeOAuthState(opts.db, q.state, platform);
    if (!verified) {
      reply.redirect(failRedirect('invalid_or_expired_state'));
      return;
    }
    try {
      const provider = opts.oauth.get(platform);
      const exchanged = await provider.exchangeCode(q.code, verified.redirect_uri);
      // Link via syscall so we go through the same RLS + encryption path
      // the cockpit form uses. Synthesize a syscall ctx scoped to the
      // tenant the state row was created for.
      await opts.syscalls.invoke(
        'connectors.link',
        {
          tenant_id: verified.tenant_id,
          trace_id: q.state.slice(0, 16),
          caller: `oauth:${platform}/callback`,
          logger: opts.logger,
        },
        {
          platform,
          account_id: exchanged.account_id,
          ...(exchanged.handle !== undefined ? { handle: exchanged.handle } : {}),
          access_token: exchanged.access_token,
          ...(exchanged.refresh_token !== undefined
            ? { refresh_token: exchanged.refresh_token }
            : {}),
          ...(exchanged.expires_at !== undefined
            ? { expires_at: exchanged.expires_at.toISOString() }
            : {}),
          scopes: exchanged.scopes,
          meta: { ...(exchanged.meta ?? {}), via: 'oauth', provider_mode: provider.mode },
        },
        ['tenant.admin'],
      );
      reply.redirect(
        `${opts.cockpitOrigin}/connectors?status=linked&platform=${encodeURIComponent(platform)}&account=${encodeURIComponent(exchanged.account_id)}`,
      );
      return;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      opts.logger.error({ err: msg, platform }, 'oauth.callback.err');
      reply.redirect(failRedirect(msg.slice(0, 120)));
      return;
    }
  });

  app.get('/v1/bus', async () => ({
    name: opts.bus.name,
    queue: opts.queue.name,
  }));

  app.get('/v1/queues', async () => {
    const stats = await Promise.all(
      KNOWN_QUEUES.map((q) => opts.queue.stats(q).catch(() => null)),
    );
    return {
      queues: KNOWN_QUEUES.map((name, i) => ({
        name,
        stats: stats[i],
      })),
    };
  });

  app.get('/v1/budget', async (req) => {
    const tenantId =
      req.authCtx?.tenant_id ??
      (req.headers['x-tenant-id'] as string | undefined) ??
      opts.defaultTenantId;
    return opts.budget.snapshot(tenantId);
  });

  app.get('/v1/events', async (req) => {
    const q = req.query as { limit?: string; schema?: string };
    const limit = Math.min(Number(q.limit ?? '50'), 500);
    let events = opts.bus.getRecentEvents(500);
    if (q.schema) events = events.filter((e) => e.schema === q.schema);
    return { events: events.slice(-limit).reverse() };
  });

  app.get('/v1/traces', async (req) => {
    const q = req.query as { limit?: string };
    const limit = Math.min(Number(q.limit ?? '50'), 200);
    const spans = getRecentSpans();
    const byTrace = new Map<
      string,
      {
        trace_id: string;
        spans: number;
        root_name: string | null;
        start_ns: bigint;
        end_ns: bigint;
        status: number;
      }
    >();
    for (const s of spans) {
      const traceId = s.spanContext().traceId;
      const startNs = BigInt(s.startTime[0]) * 1_000_000_000n + BigInt(s.startTime[1]);
      const endNs = BigInt(s.endTime[0]) * 1_000_000_000n + BigInt(s.endTime[1]);
      const existing = byTrace.get(traceId);
      if (!existing) {
        byTrace.set(traceId, {
          trace_id: traceId,
          spans: 1,
          root_name: s.parentSpanId ? null : s.name,
          start_ns: startNs,
          end_ns: endNs,
          status: s.status.code,
        });
      } else {
        existing.spans += 1;
        if (startNs < existing.start_ns) existing.start_ns = startNs;
        if (endNs > existing.end_ns) existing.end_ns = endNs;
        if (!existing.root_name && !s.parentSpanId) existing.root_name = s.name;
        if (s.status.code > existing.status) existing.status = s.status.code;
      }
    }
    const summaries = [...byTrace.values()]
      .sort((a, b) => Number(b.start_ns - a.start_ns))
      .slice(0, limit)
      .map((t) => ({
        trace_id: t.trace_id,
        spans: t.spans,
        root_name: t.root_name ?? '(orphan)',
        start_unix_ms: Number(t.start_ns / 1_000_000n),
        duration_ms: Number((t.end_ns - t.start_ns) / 1_000_000n),
        status: t.status === 2 ? 'ERROR' : t.status === 1 ? 'OK' : 'UNSET',
      }));
    return { traces: summaries };
  });

  app.get('/v1/traces/:trace_id', async (req, reply) => {
    const { trace_id } = req.params as { trace_id: string };
    const spans = getRecentSpans().filter((s) => s.spanContext().traceId === trace_id);
    if (spans.length === 0) {
      reply.code(404);
      return { ok: false, error: 'trace not found' };
    }
    return {
      trace_id,
      spans: spans.map((s) => {
        const startNs = BigInt(s.startTime[0]) * 1_000_000_000n + BigInt(s.startTime[1]);
        const endNs = BigInt(s.endTime[0]) * 1_000_000_000n + BigInt(s.endTime[1]);
        return {
          span_id: s.spanContext().spanId,
          parent_span_id: s.parentSpanId ?? null,
          name: s.name,
          kind: s.kind,
          start_unix_ms: Number(startNs / 1_000_000n),
          duration_ms: Number((endNs - startNs) / 1_000_000n),
          status: s.status.code,
          attributes: s.attributes,
        };
      }),
    };
  });

  app.get('/v1/whoami', async (req) => {
    if (!req.authCtx) return { ok: false };
    return {
      ok: true,
      token_id: req.authCtx.token_id,
      tenant_id: req.authCtx.tenant_id,
      scopes: req.authCtx.scopes,
      is_admin: req.authCtx.is_admin,
    };
  });

  app.post('/v1/syscall', async (req, reply) => {
    const body = InvokeBody.parse(req.body);
    const auth = req.authCtx;
    if (!auth) {
      reply.code(401);
      return { ok: false, error: 'unauthenticated' };
    }
    // Admin tokens (tenant_id null + '*' scope) may impersonate any tenant
    // via x-tenant-id header. Tenant-scoped tokens are pinned to their tenant.
    const tenantId = auth.is_admin
      ? (req.headers['x-tenant-id'] as string | undefined) ??
        auth.tenant_id ??
        opts.defaultTenantId
      : auth.tenant_id ?? opts.defaultTenantId;
    const scopes = auth.scopes;
    try {
      const result = await opts.syscalls.invoke(
        body.name,
        {
          tenant_id: tenantId,
          trace_id: ulid(),
          caller: `http:${auth.token_id}`,
          logger: opts.logger,
        },
        body.args,
        scopes,
      );
      return { ok: true, result };
    } catch (err) {
      if (err instanceof RateLimitError) {
        reply.code(429);
        reply.header('retry-after', Math.ceil(err.retryAfterMs / 1000).toString());
        return { ok: false, error: err.message, retry_after_ms: err.retryAfterMs };
      }
      if (err instanceof BudgetExceededError) {
        reply.code(402);
        return {
          ok: false,
          error: err.message,
          spent_cents: err.spent_cents,
          ceiling_cents: err.ceiling_cents,
        };
      }
      reply.code(400);
      return { ok: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  return app;
}
