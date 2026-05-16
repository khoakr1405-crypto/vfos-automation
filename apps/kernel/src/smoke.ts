import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { count, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import { assets, tenant_quotas, tenants } from '@vfos/db';
import { createToken, revokeToken, validateToken } from './auth/tokens.js';
import { createUser, userCount, verifyUserCredentials } from './auth/users.js';
import { hashPassword, verifyPassword } from './auth/passwords.js';
import { consumeInvite, createInvite, getInviteByToken, revokeInvite } from './auth/invites.js';
import { ensureCredentialKey } from './auth/credential-key.js';
import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { nextRunAt, parseCron, validateCron } from './scheduler/cron.js';
import { createSchedulerLoop } from './scheduler/loop.js';
import { registerSchedulerWorker } from './workers/scheduler.js';
import { withTenant } from './db/tenant-context.js';
import { loadConfig } from './config.js';
import { createLogger } from './logger.js';
import { createBus } from './bus/factory.js';
import { createQueue } from './queue/factory.js';
import { createDb } from './db/client.js';
import { BlobStore } from './storage/blob.js';
import { AuditLogger } from './audit.js';
import { SyscallRegistry } from './syscall-registry.js';
import { registerCoreSyscalls } from './syscalls/index.js';
import { PluginLoader } from './plugin-loader.js';
import { DriverRegistry } from './drivers/registry.js';
import { AnthropicDriver } from './drivers/anthropic.js';
import { MockLLMDriver } from './drivers/mock.js';
import { BudgetGuard } from './ai/budget.js';
import { AIRouter } from './ai/router.js';
import { BudgetAlerter } from './ai/budget-alerter.js';
import { CostLedger } from './ai/cost-ledger.js';
import { TenantDriverFactory } from './ai/tenant-driver-factory.js';
import { ConnectorRegistry } from './connectors/registry.js';
import { TikTokConnector } from './connectors/tiktok.js';
import { MetaConnector } from './connectors/meta.js';
import { BudgetExceededError } from './ai/budget.js';
import { RateLimiter, RateLimitError } from './rate-limit.js';
import { createServer as createHttpServer } from 'node:http';
import { createHmac } from 'node:crypto';
import { WebhookDispatcher } from './webhooks/dispatcher.js';
import { MockOAuthProvider } from './oauth/mock.js';
import { OAuthRegistry } from './oauth/registry.js';
import { consumeOAuthState, createOAuthState } from './oauth/state.js';
import {
  getMetricsText,
  getRecentSpans,
  setupTelemetry,
  shutdownTelemetry,
} from './telemetry/setup.js';
import { registerPublishWorker } from './workers/publish.js';
import { registerRenderWorker } from './workers/render.js';

async function main(): Promise<void> {
  process.env.LOG_LEVEL ??= 'info';
  // Use a smoke-specific data dir so we don't collide with `pnpm dev`.
  process.env.DATA_DIR ??= join(process.cwd(), '..', '..', 'data', 'smoke');
  setupTelemetry();
  const cfg = loadConfig();
  // Idempotency: wipe smoke state so every run starts clean.
  await rm(cfg.DATA_DIR, { recursive: true, force: true });
  const logger = createLogger(cfg);

  const dbCtx = await createDb(logger, { dataDir: cfg.DATA_DIR });
  const existingTenant = await dbCtx.db
    .select({ id: tenants.id })
    .from(tenants)
    .where(eq(tenants.id, cfg.TENANT_DEFAULT_ID))
    .limit(1);
  if (existingTenant.length === 0) {
    await dbCtx.db.insert(tenants).values({ id: cfg.TENANT_DEFAULT_ID, slug: 'default', tier: 'solo' });
    await dbCtx.db.insert(tenant_quotas).values({ tenant_id: cfg.TENANT_DEFAULT_ID });
  }

  const blob = new BlobStore(logger, join(cfg.DATA_DIR, 'blobs'));
  await blob.start();

  const busOpts: { redisUrl?: string } = {};
  if (cfg.REDIS_URL) busOpts.redisUrl = cfg.REDIS_URL;
  const bus = await createBus(logger, busOpts);
  const queue = await createQueue(logger, busOpts);

  const drivers = new DriverRegistry(logger);
  if (cfg.ANTHROPIC_API_KEY) drivers.register(new AnthropicDriver(cfg.ANTHROPIC_API_KEY));
  drivers.register(new MockLLMDriver());

  const budget = new BudgetGuard(logger, { defaultDailyCeilingUsd: cfg.BUDGET_DAILY_USD });
  const costLedger = new CostLedger({ db: dbCtx.db, logger });
  const router = new AIRouter(drivers, budget, logger, {
    fallbackDriver: cfg.ANTHROPIC_API_KEY ? 'anthropic' : 'mock',
  });
  router.setCostLedger(costLedger);
  const budgetAlerter = new BudgetAlerter({ db: dbCtx.db, bus, logger });
  router.setBudgetAlerter(budgetAlerter);
  const credentialKeyForFactory = 'smoke-test-fixed-key-do-not-use-in-prod';
  const tenantDriverFactory = new TenantDriverFactory({
    db: dbCtx.db,
    registry: drivers,
    credentialKey: credentialKeyForFactory,
    logger,
  });
  router.setTenantFactory(tenantDriverFactory);

  const connectors = new ConnectorRegistry(logger);
  connectors.register(new TikTokConnector('mock'));
  connectors.register(new MetaConnector({ platform: 'facebook', mode: 'mock' }));
  const oauthReg = new OAuthRegistry(logger);
  oauthReg.register(new MockOAuthProvider('tiktok'));
  oauthReg.register(new MockOAuthProvider('facebook'));
  const credentialKey = credentialKeyForFactory;

  const rateLimiter = new RateLimiter(dbCtx.db, logger);
  const webhookDispatcher = new WebhookDispatcher({
    db: dbCtx.db,
    bus,
    credentialKey,
    logger,
  });
  await webhookDispatcher.start();
  const syscalls = new SyscallRegistry(logger);
  syscalls.setRateLimiter(rateLimiter);
  syscalls.setAuditor(new AuditLogger(dbCtx.db, logger));
  const plugins = new PluginLoader(logger, bus, syscalls, dbCtx.db);
  await plugins.scan(cfg.PLUGINS_DIR);
  registerCoreSyscalls(syscalls, {
    router,
    queue,
    db: dbCtx.db,
    blob,
    bus,
    connectors,
    credentialKey,
    rateLimiter,
    webhooks: webhookDispatcher,
    plugins,
    tenantDriverFactory,
    costLedger,
  });
  await registerRenderWorker(queue, bus, logger);
  await registerPublishWorker(queue, bus, syscalls, logger, cfg.TENANT_DEFAULT_ID);
  await registerSchedulerWorker(queue, dbCtx.db, syscalls, logger);

  const assetsBefore =
    (
      await withTenant(dbCtx.db, cfg.TENANT_DEFAULT_ID, async (tx) =>
        tx.select({ n: count() }).from(assets),
      )
    )[0]?.n ?? 0;

  let trendsSeen = 0;
  let matchesSeen = 0;
  let nicheClassifiedSeen = 0;
  let rendersCompleted = 0;
  let publishesCompleted = 0;
  let publishesFailed = 0;
  const decisionTally: Record<string, number> = { PASS: 0, REJECT: 0, HUMAN_REVIEW: 0 };
  bus.subscribe('trend.discovered.v1', async () => {
    trendsSeen += 1;
  });
  bus.subscribe('affiliate.matched.v1', async () => {
    matchesSeen += 1;
  });
  bus.subscribe('niche.classified.v1', async () => {
    nicheClassifiedSeen += 1;
  });
  bus.subscribe<{ decision: string }>('compliance.decision.v1', async (event) => {
    decisionTally[event.payload.decision] = (decisionTally[event.payload.decision] ?? 0) + 1;
  });
  bus.subscribe('render.completed.v1', async () => {
    rendersCompleted += 1;
  });
  bus.subscribe('publish.completed.v1', async () => {
    publishesCompleted += 1;
  });
  bus.subscribe('publish.failed.v1', async () => {
    publishesFailed += 1;
  });

  // Seed install rows + hot-load through the marketplace syscall — this is
  // the same path the real boot uses via bootstrapDefaultInstalls.
  for (const entry of plugins.catalogList()) {
    await syscalls.invoke(
      'plugins.install',
      { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
      { name: entry.name },
      ['tenant.admin'],
    );
  }

  await sleep(3500);
  await plugins.stopAll();

  // Direct fs.put → fs.get roundtrip
  const putRes = await syscalls.invoke<{ asset_id: string; deduped: boolean; bytes: number }>(
    'fs.put',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { mime: 'text/plain', content: 'persistence-roundtrip-test', tags: ['smoke', 'roundtrip'] },
    ['fs.write'],
  );
  const getRes = await syscalls.invoke<{ content_base64: string; mime: string }>(
    'fs.get',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { asset_id: putRes.asset_id },
    ['fs.read'],
  );
  const roundtripContent = Buffer.from(getRes.content_base64, 'base64').toString('utf8');

  const assetsAfter =
    (
      await withTenant(dbCtx.db, cfg.TENANT_DEFAULT_ID, async (tx) =>
        tx.select({ n: count() }).from(assets),
      )
    )[0]?.n ?? 0;

  // ---- RLS isolation proof ----
  const TENANT_B_ID = '00000000-0000-0000-0000-00000000000b';
  await dbCtx.db
    .insert(tenants)
    .values({ id: TENANT_B_ID, slug: 'smoke-bravo', tier: 'pro' })
    .onConflictDoNothing();
  await dbCtx.db
    .insert(tenant_quotas)
    .values({ tenant_id: TENANT_B_ID, videos_per_day: 100 })
    .onConflictDoNothing();

  const aliceUnique = `alice-${ulid()}`;
  const bobUnique = `bob-${ulid()}`;
  await syscalls.invoke(
    'fs.put',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { mime: 'text/plain', content: aliceUnique, tags: ['rls-test', 'alice'] },
    ['fs.write'],
  );
  const bobPut = await syscalls.invoke<{ asset_id: string }>(
    'fs.put',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { mime: 'text/plain', content: bobUnique, tags: ['rls-test', 'bob'] },
    ['fs.write'],
  );

  const aliceVisible =
    (
      await withTenant(dbCtx.db, cfg.TENANT_DEFAULT_ID, async (tx) =>
        tx.select({ n: count() }).from(assets),
      )
    )[0]?.n ?? 0;
  const bobVisible =
    (
      await withTenant(dbCtx.db, TENANT_B_ID, async (tx) =>
        tx.select({ n: count() }).from(assets),
      )
    )[0]?.n ?? 0;
  const unscopedVisible = (await dbCtx.db.select({ n: count() }).from(assets))[0]?.n ?? 0;

  // Cross-tenant read attempt — Alice tries to read Bob's asset directly.
  let aliceLeakedBob = 0;
  try {
    const leak = await withTenant(dbCtx.db, cfg.TENANT_DEFAULT_ID, async (tx) =>
      tx.select().from(assets).where(eq(assets.asset_id, bobPut.asset_id)).limit(1),
    );
    aliceLeakedBob = leak.length;
  } catch {
    aliceLeakedBob = -1; // treat thrown as also-blocked
  }

  // Cross-tenant insert attempt — try to put a row claiming Bob's id while Alice context.
  let crossWriteRejected = false;
  try {
    await withTenant(dbCtx.db, cfg.TENANT_DEFAULT_ID, async (tx) => {
      await tx.insert(assets).values({
        asset_id: `ast_cross_${ulid()}`,
        tenant_id: TENANT_B_ID,
        hash: 'deadbeef'.repeat(8),
        mime: 'text/plain',
        size: 1,
        tags: ['rls-violation'],
      });
    });
  } catch {
    crossWriteRejected = true;
  }

  // ---- API token validation proof ----
  const adminTok = await createToken(dbCtx.db, {
    tenant_id: null,
    name: 'smoke-admin',
    scopes: ['*'],
  });
  const tenantTok = await createToken(dbCtx.db, {
    tenant_id: TENANT_B_ID,
    name: 'smoke-tenant',
    scopes: ['fs.read', 'fs.write'],
  });
  const adminCtx = await validateToken(dbCtx.db, adminTok.raw_token);
  const tenantCtx = await validateToken(dbCtx.db, tenantTok.raw_token);
  const fakeCtx = await validateToken(dbCtx.db, 'vfos_garbage_fake_token_xxx');
  await revokeToken(dbCtx.db, adminTok.id);
  const revokedCtx = await validateToken(dbCtx.db, adminTok.raw_token);

  const directAi = await syscalls.invoke<{ json: unknown; cost_cents: number; model: string }>(
    'ai.json',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      intent: 'classify_niche',
      system:
        'Classify a TikTok video into one of: audio_gadgets, skincare, home_kitchen, mobile_accessories, food_recipe, general.',
      user: 'review of the best wireless bluetooth earbuds for under fifty dollars',
      schema: {
        type: 'object',
        required: ['niche', 'confidence'],
        properties: { niche: { type: 'string' }, confidence: { type: 'number' } },
      },
    },
    ['ai.complete'],
  );

  // ---- ai.test admin syscall proof ----
  const aiTestRes = await syscalls.invoke<{
    intent: string;
    route: { driver: string; model: string; cache_system: boolean; driver_available: boolean };
    model: string;
    text: string;
    json: unknown;
    usage: { input_tokens: number; cached_input_tokens: number; output_tokens: number };
    cost_cents: number;
    latency_ms: number;
    cache_enabled: boolean;
  }>(
    'ai.test',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      intent: 'classify_niche',
      system:
        'Classify the video into one of: audio_gadgets, skincare, home_kitchen, mobile_accessories, food_recipe, general.',
      user: 'best bluetooth earbuds for highway noise',
      schema: {
        type: 'object',
        required: ['niche', 'confidence'],
        properties: { niche: { type: 'string' }, confidence: { type: 'number' } },
      },
    },
    ['tenant.admin'],
  );

  // ---- Platform connectors proof ----
  // Link two accounts (TikTok + Facebook), publish via direct syscall and via queue worker.
  const tiktokLink = await syscalls.invoke<{ credential: { id: string }; action: string }>(
    'connectors.link',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      platform: 'tiktok',
      account_id: 'smoke_tt_001',
      handle: '@smoke_tiktok',
      access_token: 'fake_tt_token_minimum_length_for_zod',
      scopes: ['video.publish', 'video.upload'],
    },
    ['tenant.admin'],
  );
  const fbLink = await syscalls.invoke<{ credential: { id: string }; action: string }>(
    'connectors.link',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      platform: 'facebook',
      account_id: '1000000000',
      handle: 'Smoke Test Page',
      access_token: 'fake_fb_page_token_long_enough',
      scopes: ['pages_manage_posts'],
    },
    ['tenant.admin'],
  );

  // Confirm list redacts secrets
  const credList = await syscalls.invoke<{
    credentials: { id: string; platform: string; account_id: string }[];
  }>(
    'connectors.list',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  const credListJson = JSON.stringify(credList);
  const credListLeaks = /fake_(tt|fb)_/.test(credListJson);

  // Direct publish.tiktok call
  const ttPublish = await syscalls.invoke<{ publish_id: string; status: string; platform: string }>(
    'publish.tiktok',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      account_id: 'smoke_tt_001',
      caption: 'wireless earbuds review #affiliate',
      hashtags: ['affiliate', 'review'],
      privacy: 'private',
      video_url: 'https://example.com/fake.mp4',
    },
    ['publish.write'],
  );

  // Enqueue a publish job — exercises the publish worker path
  const queuedPublish = await syscalls.invoke<{ id: string }>(
    'queue.enqueue',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      queue: 'vfos.publish',
      job_name: 'reel.publish',
      data: {
        platform: 'facebook',
        account_id: '1000000000',
        caption: 'reel from smoke test',
        privacy: 'private',
        video_url: 'https://example.com/fake.mp4',
      },
    },
    ['queue.write'],
  );
  await sleep(500);

  // Unlink one (negative test: subsequent publish must fail)
  await syscalls.invoke(
    'connectors.unlink',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { id: fbLink.credential.id },
    ['tenant.admin'],
  );
  let unlinkedPublishBlocked = false;
  try {
    await syscalls.invoke(
      'publish.facebook.reels',
      { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
      {
        account_id: '1000000000',
        caption: 'should fail',
        video_url: 'https://example.com/fake.mp4',
      },
      ['publish.write'],
    );
  } catch {
    unlinkedPublishBlocked = true;
  }

  // Cross-tenant: ensure tenant B cannot see tenant A's credentials
  const bobCredList = await syscalls.invoke<{ credentials: unknown[] }>(
    'connectors.list',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  const credentialsTenantIsolated = bobCredList.credentials.length === 0;

  // ---- Users + password auth proof ----
  const usersBefore = await userCount(dbCtx.db);
  const pwGood = 'correct-horse-battery-staple';
  const pwBad = 'wrong-password';
  const pwEnvelope = hashPassword(pwGood);
  const pwVerifyGood = verifyPassword(pwGood, pwEnvelope);
  const pwVerifyBad = verifyPassword(pwBad, pwEnvelope);
  const pwTampered = verifyPassword(pwGood, pwEnvelope.replace(/.{4}$/, 'aaaa'));

  const smokeUser = await createUser(dbCtx.db, {
    email: 'smoke@example.test',
    password: pwGood,
    tenant_id: cfg.TENANT_DEFAULT_ID,
    is_admin: true,
  });
  const loginGood = await verifyUserCredentials(dbCtx.db, 'SMOKE@example.test', pwGood);
  const loginBad = await verifyUserCredentials(dbCtx.db, 'smoke@example.test', pwBad);
  const loginUnknown = await verifyUserCredentials(dbCtx.db, 'ghost@example.test', pwGood);
  const usersAfter = await userCount(dbCtx.db);

  // ---- Invite flow proof ----
  // Mint two invites (one pinned-email + scopes, one admin no-email),
  // consume the first, revoke the second, then verify each branch.
  const inviteA = await createInvite(dbCtx.db, {
    email: 'invitee-a@example.test',
    tenant_id: cfg.TENANT_DEFAULT_ID,
    scopes: ['fs.read', 'ai.complete'],
    is_admin: false,
    created_by: null,
    ttl_ms: 60 * 60 * 1000,
  });
  const inviteB = await createInvite(dbCtx.db, {
    email: null,
    tenant_id: null,
    scopes: [],
    is_admin: true,
    created_by: null,
    ttl_ms: 60 * 60 * 1000,
  });
  const inviteExpired = await createInvite(dbCtx.db, {
    email: null,
    tenant_id: null,
    scopes: [],
    is_admin: false,
    created_by: null,
    ttl_ms: -1000, // already expired
  });

  const newUserA = await createUser(dbCtx.db, {
    email: 'invitee-a@example.test',
    password: 'invite-acceptance-pw',
    tenant_id: cfg.TENANT_DEFAULT_ID,
    is_admin: false,
  });
  const consumedA = await consumeInvite(dbCtx.db, inviteA.token, newUserA.id);
  const consumedAReplay = await consumeInvite(dbCtx.db, inviteA.token, newUserA.id);
  const revokedB = await revokeInvite(dbCtx.db, inviteB.token);
  // After revoke, consume should fail.
  const consumedBAfterRevoke = await consumeInvite(dbCtx.db, inviteB.token, newUserA.id);
  // Expired invite consume returns null.
  const consumedExpired = await consumeInvite(dbCtx.db, inviteExpired.token, newUserA.id);
  const tamperedFetch = await getInviteByToken(dbCtx.db, 'inv_tampered-zzz');

  // ---- OAuth mock flow proof ----
  // Simulate the dance: createState (acts as /v1/oauth/.../start), then
  // exchangeCode + link (acts as /v1/oauth/.../callback handler).
  const mockProvider = oauthReg.get('tiktok');
  const { state: oauthState } = await createOAuthState(dbCtx.db, {
    tenant_id: cfg.TENANT_DEFAULT_ID,
    platform: 'tiktok',
    redirect_uri: 'http://localhost:3000/v1/oauth/tiktok/callback',
  });
  const authorizeUrl = mockProvider.authorizeUrl({
    state: oauthState,
    redirect_uri: 'http://localhost:3000/v1/oauth/tiktok/callback',
  });
  // Parse the code out of the authorize_url that mock provider returned
  const parsedCode = new URL(authorizeUrl).searchParams.get('code') ?? '';
  const verified = await consumeOAuthState(dbCtx.db, oauthState, 'tiktok');
  const verifiedSecondAttempt = await consumeOAuthState(dbCtx.db, oauthState, 'tiktok');
  const tamperedVerified = await consumeOAuthState(dbCtx.db, 'tampered-state-zzz', 'tiktok');
  let oauthLinkedAccountId: string | null = null;
  if (verified && parsedCode) {
    const exchanged = await mockProvider.exchangeCode(parsedCode, verified.redirect_uri);
    const linkRes = await syscalls.invoke<{ credential: { account_id: string } }>(
      'connectors.link',
      {
        tenant_id: verified.tenant_id,
        trace_id: ulid(),
        caller: 'smoke:oauth-callback',
        logger,
      },
      {
        platform: 'tiktok',
        account_id: exchanged.account_id,
        ...(exchanged.handle !== undefined ? { handle: exchanged.handle } : {}),
        access_token: exchanged.access_token,
        ...(exchanged.refresh_token !== undefined ? { refresh_token: exchanged.refresh_token } : {}),
        ...(exchanged.expires_at !== undefined
          ? { expires_at: exchanged.expires_at.toISOString() }
          : {}),
        scopes: exchanged.scopes,
        meta: { ...(exchanged.meta ?? {}), via: 'oauth' },
      },
      ['tenant.admin'],
    );
    oauthLinkedAccountId = linkRes.credential.account_id;
  }

  // ---- Webhook outbound proof ----
  // Spin up a local HTTP receiver that records bodies + signatures, then
  // create a webhook pointing to it and emit synthetic events.
  interface Received {
    schema: string;
    body: string;
    signature: string;
    deliveryAttempt: number;
    eventId: string;
  }
  const received: Received[] = [];
  let failFirst = true;
  const receiver = createHttpServer((req, res) => {
    let buf = '';
    req.on('data', (c) => {
      buf += c.toString('utf8');
    });
    req.on('end', () => {
      const r: Received = {
        schema: String(req.headers['x-vfos-event-schema'] ?? ''),
        body: buf,
        signature: String(req.headers['x-vfos-signature'] ?? ''),
        deliveryAttempt: Number(req.headers['x-vfos-delivery-attempt'] ?? '0'),
        eventId: String(req.headers['x-vfos-event-id'] ?? ''),
      };
      received.push(r);
      // Fail the very first delivery attempt to exercise retry, then 2xx everything.
      if (failFirst && r.deliveryAttempt === 1) {
        failFirst = false;
        res.statusCode = 500;
        res.end('first delivery fails on purpose');
        return;
      }
      res.statusCode = 200;
      res.end('ok');
    });
  });
  await new Promise<void>((resolve) =>
    receiver.listen({ port: 0, host: '127.0.0.1' }, () => resolve()),
  );
  const addr = receiver.address();
  const receiverPort =
    typeof addr === 'object' && addr !== null ? addr.port : 0;
  const webhookCreate = await syscalls.invoke<{
    webhook: { id: string };
    secret: string;
  }>(
    'webhooks.create',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      url: `http://127.0.0.1:${receiverPort}/hook`,
      schemas: ['webhook.test.v1', 'render.completed.v1'],
      enabled: true,
    },
    ['tenant.admin'],
  );
  const webhookSecret = webhookCreate.secret;
  const webhookId = webhookCreate.webhook.id;

  // Synthetic test event via webhooks.test syscall
  await syscalls.invoke(
    'webhooks.test',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { id: webhookId },
    ['tenant.admin'],
  );
  // Direct bus.publish to exercise the wildcard path for a non-synthetic schema
  await bus.publish({
    schema: 'render.completed.v1',
    tenant_id: cfg.TENANT_DEFAULT_ID,
    emitter: 'smoke:webhook-test',
    payload: { synthetic: true, marker: 'smoke-webhook-render' },
  });
  // Allow retries (first attempt fails, 200ms backoff, then succeeds)
  await sleep(1500);

  // HMAC verification on every received body
  const hmacOk = received.every((r) => {
    if (!r.signature.startsWith('sha256=')) return false;
    const expected = createHmac('sha256', webhookSecret)
      .update(r.body)
      .digest('hex');
    return r.signature.slice('sha256='.length) === expected;
  });
  const retryObserved = received.filter((r) => r.deliveryAttempt > 1).length > 0;
  const webhookSchemasSeen = [...new Set(received.map((r) => r.schema))].sort();
  const webhookListAfter = await syscalls.invoke<{ webhooks: { id: string; delivered_count: number; failed_count: number }[] }>(
    'webhooks.list',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  const webhookCounts = webhookListAfter.webhooks.find((w) => w.id === webhookId);

  await new Promise<void>((resolve) => receiver.close(() => resolve()));

  // ---- Plugin marketplace proof ----
  // Verify list_available reports both shipped plugins as catalog entries,
  // then exercise uninstall/install to prove hot unload + reload works.
  const mpListBefore = await syscalls.invoke<{
    plugins: {
      name: string;
      installed: boolean;
      enabled: boolean;
      loaded: boolean;
    }[];
  }>(
    'plugins.list_available',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  const trendName = 'trend-scout-mock';
  // Stop the trend plugin so its onUnload runs and the agent goes silent.
  await syscalls.invoke(
    'plugins.uninstall',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendName },
    ['tenant.admin'],
  );
  const mpListAfterUninstall = await syscalls.invoke<{
    plugins: { name: string; enabled: boolean; loaded: boolean }[];
  }>(
    'plugins.list_available',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  await syscalls.invoke(
    'plugins.install',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendName },
    ['tenant.admin'],
  );
  const mpListAfterReinstall = await syscalls.invoke<{
    plugins: { name: string; enabled: boolean; loaded: boolean }[];
  }>(
    'plugins.list_available',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  const mpCatalogCount = mpListBefore.plugins.length;
  const mpTrendUninstalled =
    mpListAfterUninstall.plugins.find((p) => p.name === trendName)?.enabled === false &&
    mpListAfterUninstall.plugins.find((p) => p.name === trendName)?.loaded === false;
  const mpTrendReinstalled =
    mpListAfterReinstall.plugins.find((p) => p.name === trendName)?.enabled === true &&
    mpListAfterReinstall.plugins.find((p) => p.name === trendName)?.loaded === true;

  // ---- Per-tenant agent isolation proof ----
  // Install compliance-demo + trend-scout-mock for tenant B too — both
  // tenants now have dedicated Agent instances. Verify:
  //   1. The loader has separate (tenant, plugin) entries.
  //   2. ctx.subscribe filters by tenant_id: tenant B's compliance must
  //      ONLY react to tenant_id=B events, never to tenant_id=A.
  //   3. Uninstalling for B does not unload A.
  // Earlier `plugins.stopAll()` cleared the loaded map — make sure tenant
  // A's compliance is alive again before injecting synthetic A-tagged
  // events below.
  await syscalls.invoke(
    'plugins.install',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: 'compliance-demo' },
    ['tenant.admin'],
  );
  await syscalls.invoke(
    'plugins.install',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: 'compliance-demo' },
    ['tenant.admin'],
  );
  await syscalls.invoke(
    'plugins.install',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendName },
    ['tenant.admin'],
  );
  const aLoadedDuringIsolation = plugins.isLoaded(cfg.TENANT_DEFAULT_ID, trendName);
  const bLoadedDuringIsolation = plugins.isLoaded(TENANT_B_ID, trendName);
  const totalLoadedDuringIsolation = plugins.list().length;

  // Snapshot compliance decisions by tenant before injecting synthetic events.
  let compADecisions = 0;
  let compBDecisions = 0;
  const compIsoUnsub = bus.subscribe('compliance.decision.v1', async (ev) => {
    if (ev.tenant_id === cfg.TENANT_DEFAULT_ID) compADecisions += 1;
    else if (ev.tenant_id === TENANT_B_ID) compBDecisions += 1;
  });
  await sleep(200);
  const compABefore = compADecisions;
  const compBBefore = compBDecisions;

  // Two synthetic trends — one tagged A, one tagged B. If subscribe were
  // unfiltered both compliance instances would react to BOTH events; with
  // the per-tenant filter each instance reacts to its own event only.
  await bus.publish({
    schema: 'trend.discovered.v1',
    tenant_id: cfg.TENANT_DEFAULT_ID,
    emitter: 'smoke:isolation-A',
    payload: {
      asset_id: 'ast_iso_a',
      niche: 'skincare',
      region: 'KR',
      viral_score: 1.0,
      url: 'https://www.tiktok.com/@example/video/1002',
    },
  });
  await bus.publish({
    schema: 'trend.discovered.v1',
    tenant_id: TENANT_B_ID,
    emitter: 'smoke:isolation-B',
    payload: {
      asset_id: 'ast_iso_b',
      niche: 'skincare',
      region: 'KR',
      viral_score: 1.0,
      url: 'https://www.tiktok.com/@example/video/1002',
    },
  });
  await sleep(1500);
  const compADelta = compADecisions - compABefore;
  const compBDelta = compBDecisions - compBBefore;
  compIsoUnsub();

  await syscalls.invoke(
    'plugins.uninstall',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendName },
    ['tenant.admin'],
  );
  await syscalls.invoke(
    'plugins.uninstall',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: 'compliance-demo' },
    ['tenant.admin'],
  );
  const aLoadedAfterBUninstall = plugins.isLoaded(cfg.TENANT_DEFAULT_ID, trendName);
  const bLoadedAfterBUninstall = plugins.isLoaded(TENANT_B_ID, trendName);

  // ---- Budget alerter proof ----
  // Use a throwaway tenant + small ceiling so we can synthesise both
  // thresholds cheaply. Counters subscribe to budget.warn.v1 and
  // budget.exceeded.v1 — second call past each threshold should NOT
  // re-fire (INSERT ON CONFLICT idempotency).
  const TENANT_ALERT_ID = '00000000-0000-0000-0000-00000000a1e7';
  await dbCtx.db
    .insert(tenants)
    .values({ id: TENANT_ALERT_ID, slug: 'smoke-alert', tier: 'pro' })
    .onConflictDoNothing();
  await dbCtx.db
    .insert(tenant_quotas)
    .values({ tenant_id: TENANT_ALERT_ID, videos_per_day: 30 })
    .onConflictDoNothing();
  budget.setCeiling(TENANT_ALERT_ID, 1); // $1 = 100 cents

  let warnEvents = 0;
  let exceededEvents = 0;
  let warnPct: number | null = null;
  let exceededPct: number | null = null;
  const warnUnsub = bus.subscribe<{ pct: number; tenant_id: string }>(
    'budget.warn.v1',
    async (ev) => {
      if (ev.tenant_id === TENANT_ALERT_ID) {
        warnEvents += 1;
        warnPct = ev.payload.pct;
      }
    },
  );
  const exceededUnsub = bus.subscribe<{ pct: number; tenant_id: string }>(
    'budget.exceeded.v1',
    async (ev) => {
      if (ev.tenant_id === TENANT_ALERT_ID) {
        exceededEvents += 1;
        exceededPct = ev.payload.pct;
      }
    },
  );

  // Below warn threshold — no alerts.
  budget.record(TENANT_ALERT_ID, 50);
  await budgetAlerter.maybeFire(TENANT_ALERT_ID, 50, 100);

  // Cross 80% (cents=85, ceiling=100 → 85%) → warn fires once.
  budget.record(TENANT_ALERT_ID, 35);
  await budgetAlerter.maybeFire(TENANT_ALERT_ID, 85, 100);
  await budgetAlerter.maybeFire(TENANT_ALERT_ID, 85, 100); // dedup — must NOT re-fire
  const warnAfter80 = warnEvents;

  // Cross 100% → exceeded fires once.
  budget.record(TENANT_ALERT_ID, 20);
  await budgetAlerter.maybeFire(TENANT_ALERT_ID, 105, 100);
  await budgetAlerter.maybeFire(TENANT_ALERT_ID, 130, 100); // dedup — must NOT re-fire
  const exceededAfterCrossing = exceededEvents;

  warnUnsub();
  exceededUnsub();

  // ---- Plugin config flow proof ----
  // Install trend-scout-mock with a custom intervalMs, verify the loader
  // injected it into ctx.config, then update_config to a different value
  // and assert the reload picked up the change.
  const trendCfgName = 'trend-scout-mock';
  const TENANT_CFG_ID = '00000000-0000-0000-0000-00000000c0fe';
  await dbCtx.db
    .insert(tenants)
    .values({ id: TENANT_CFG_ID, slug: 'smoke-cfg', tier: 'pro' })
    .onConflictDoNothing();
  await dbCtx.db
    .insert(tenant_quotas)
    .values({ tenant_id: TENANT_CFG_ID, videos_per_day: 30 })
    .onConflictDoNothing();
  await syscalls.invoke(
    'plugins.install',
    { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendCfgName, config: { intervalMs: 250, sample_marker: 'install-time' } },
    ['tenant.admin'],
  );
  const cfgAfterInstall = plugins.configFor(TENANT_CFG_ID, trendCfgName);
  const cfgIntervalAfterInstall = cfgAfterInstall?.get('intervalMs');
  const cfgMarkerAfterInstall = cfgAfterInstall?.get('sample_marker');

  await syscalls.invoke(
    'plugins.update_config',
    { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendCfgName, config: { intervalMs: 750, sample_marker: 'update-time' } },
    ['tenant.admin'],
  );
  const cfgAfterUpdate = plugins.configFor(TENANT_CFG_ID, trendCfgName);
  const cfgIntervalAfterUpdate = cfgAfterUpdate?.get('intervalMs');
  const cfgMarkerAfterUpdate = cfgAfterUpdate?.get('sample_marker');

  // plugins.list_available should echo the latest config so the cockpit
  // can pre-fill the form.
  const cfgList = await syscalls.invoke<{
    plugins: {
      name: string;
      config: Record<string, unknown>;
      configSchema?: { properties?: Record<string, unknown> };
    }[];
  }>(
    'plugins.list_available',
    { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  const cfgListEntry = cfgList.plugins.find((p) => p.name === trendCfgName);
  const cfgListInterval = cfgListEntry?.config?.intervalMs;

  // configSchema must appear in list_available so the cockpit can render
  // a typed form. trend-scout-mock declares one with intervalMs (integer
  // min=50), region_filter (enum), sample_marker (string).
  const cfgSchemaPresent =
    cfgListEntry?.configSchema?.properties?.intervalMs !== undefined;

  // Negative validation cases — invalid payloads should throw.
  let badIntervalRejected = false;
  try {
    await syscalls.invoke(
      'plugins.update_config',
      { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
      { name: trendCfgName, config: { intervalMs: 10 } }, // below minimum=50
      ['tenant.admin'],
    );
  } catch (err) {
    if (err instanceof Error && />= 50/.test(err.message)) badIntervalRejected = true;
  }
  let badEnumRejected = false;
  try {
    await syscalls.invoke(
      'plugins.update_config',
      { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
      { name: trendCfgName, config: { region_filter: 'VN' } }, // not in enum
      ['tenant.admin'],
    );
  } catch (err) {
    if (err instanceof Error && /one of/.test(err.message)) badEnumRejected = true;
  }
  let badTypeRejected = false;
  try {
    await syscalls.invoke(
      'plugins.update_config',
      { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
      { name: trendCfgName, config: { intervalMs: 'not-a-number' } },
      ['tenant.admin'],
    );
  } catch (err) {
    if (err instanceof Error && /must be an integer/.test(err.message)) badTypeRejected = true;
  }

  // Valid update with defaults applied — region_filter default = ALL even
  // though we don't pass it explicitly when a different existing key updates.
  const validUpdate = await syscalls.invoke<{ config: Record<string, unknown> }>(
    'plugins.update_config',
    { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendCfgName, config: { intervalMs: 1500, region_filter: 'US' } },
    ['tenant.admin'],
  );
  const validUpdateInterval = validUpdate.config.intervalMs;
  const validUpdateRegion = validUpdate.config.region_filter;
  // Coercion: pass intervalMs as string "2000", expect number 2000 after.
  const coerced = await syscalls.invoke<{ config: Record<string, unknown> }>(
    'plugins.update_config',
    { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendCfgName, config: { intervalMs: '2000' as unknown as number } },
    ['tenant.admin'],
  );
  const coercedInterval = coerced.config.intervalMs;

  // Clean up so the cfg tenant doesn't leave a runaway agent behind.
  await syscalls.invoke(
    'plugins.uninstall',
    { tenant_id: TENANT_CFG_ID, trace_id: ulid(), caller: 'smoke', logger },
    { name: trendCfgName },
    ['tenant.admin'],
  );

  // ---- Audit log proof ----
  // The smoke has already driven hundreds of syscalls — audit_log should
  // contain rows for mutating calls (plugins.install, keys.set, …) but
  // NOT for read-only ones (plugins.list_available, costs.summary).
  // Trigger one secret-bearing mutation on a throwaway tenant so we
  // have a row to test the redactor against (independent of BYOK
  // assertions later that expect tenant A's keys.list to start empty).
  const TENANT_AUDIT_ID = '00000000-0000-0000-0000-0000000000ad';
  await dbCtx.db
    .insert(tenants)
    .values({ id: TENANT_AUDIT_ID, slug: 'smoke-audit', tier: 'pro' })
    .onConflictDoNothing();
  await dbCtx.db
    .insert(tenant_quotas)
    .values({ tenant_id: TENANT_AUDIT_ID, videos_per_day: 30 })
    .onConflictDoNothing();
  await syscalls.invoke(
    'keys.set',
    { tenant_id: TENANT_AUDIT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { provider: 'anthropic', api_key: 'sk-ant-audit-redact-fixture-1234', label: 'audit-fixture' },
    ['tenant.admin'],
  );

  // Use an admin context (empty tenant_id) so we can see audit rows
  // across all tenants.
  const auditList = await syscalls.invoke<{
    rows: { action: string; actor: string; status: string; payload: Record<string, unknown> }[];
  }>(
    'audit.list',
    { tenant_id: '', trace_id: ulid(), caller: 'smoke', logger },
    { limit: 500 },
    ['tenant.read'],
  );
  const auditActions = new Set(auditList.rows.map((r) => r.action));
  const auditHasInstall = auditActions.has('plugins.install');
  const auditHasKeysSet = auditActions.has('keys.set');
  const auditMissingList = !auditActions.has('plugins.list_available');
  const auditMissingCostsSummary = !auditActions.has('costs.summary');

  // Trigger a known failure and verify it lands as status='error'.
  let exceptedAuditError = false;
  try {
    await syscalls.invoke(
      'plugins.uninstall',
      { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
      { name: 'definitely-not-a-plugin' },
      ['tenant.admin'],
    );
  } catch {
    exceptedAuditError = true;
  }
  await sleep(50); // give the fire-and-forget audit insert time to land
  const auditListErr = await syscalls.invoke<{
    rows: { action: string; status: string; payload: Record<string, unknown> }[];
  }>(
    'audit.list',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { action: 'plugins.uninstall', status: 'error', limit: 5 },
    ['tenant.read'],
  );
  const auditErrCaptured = auditListErr.rows.some(
    (r) =>
      r.status === 'error' &&
      (r.payload as { name?: string }).name === 'definitely-not-a-plugin',
  );

  // Redaction proof — keys.set was called earlier; the recorded payload
  // must NOT contain the plaintext api_key.
  const auditKeysSet = auditList.rows.find((r) => r.action === 'keys.set');
  const redactedShape = auditKeysSet?.payload as
    | { api_key?: unknown; provider?: string }
    | undefined;
  const auditApiKeyRedacted =
    redactedShape !== undefined &&
    typeof redactedShape.api_key === 'string' &&
    redactedShape.api_key.startsWith('[redacted');

  // Summary syscall
  const auditSummary = await syscalls.invoke<{ rows: { action: string; n: number }[] }>(
    'audit.summary',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { hours: 24 },
    ['tenant.read'],
  );
  const auditSummaryHasInstall = auditSummary.rows.some((r) => r.action === 'plugins.install');

  // ---- Replay proof ----
  // Publish a tagged trend event, then call events.replay and assert the
  // returned event has meta.replay=true plus original_event_id pointing
  // back at the source. Also verify tenant scoping: tenant A cannot
  // replay a tenant-B-tagged event. Plus an ignore_replays opt-out
  // check: compliance-demo declares `ignore_replays: true`, so a
  // replayed trend must NOT retrigger its handler (no new
  // compliance.decision.v1 with the same asset_id).
  let decisionsForReplayAsset = 0;
  const replayAssetId = 'ast_replay_src';
  const decisionReplayUnsub = bus.subscribe<{ asset_id?: string }>(
    'compliance.decision.v1',
    async (ev) => {
      if (ev.payload?.asset_id === replayAssetId) decisionsForReplayAsset += 1;
    },
  );
  const replaySource = await bus.publish({
    schema: 'trend.discovered.v1',
    tenant_id: cfg.TENANT_DEFAULT_ID,
    emitter: 'smoke:replay-source',
    payload: {
      asset_id: replayAssetId,
      niche: 'audio_gadgets',
      region: 'US',
      viral_score: 0.5,
      url: 'https://www.tiktok.com/@example/video/1001',
    },
  });
  // Give compliance-demo time to react to the SOURCE event.
  await sleep(1500);
  const decisionsAfterSource = decisionsForReplayAsset;
  const replayResult = await syscalls.invoke<{
    event_id: string;
    schema: string;
    original_event_id: string;
  }>(
    'events.replay',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { event_id: replaySource.event_id },
    ['tenant.admin'],
  );
  const replayedEvent = bus.getRecentEvents(50).find((e) => e.event_id === replayResult.event_id);
  const replayMetaOk = replayedEvent?.meta?.replay === true;
  const replayOriginalIdMatch = replayedEvent?.meta?.original_event_id === replaySource.event_id;
  const replayEmitterPrefixed = replayedEvent?.emitter?.startsWith('replay:') ?? false;
  const replayDifferentId = replayResult.event_id !== replaySource.event_id;

  // Wait again for compliance-demo's reaction — opt-out means count
  // should NOT increase past the post-source value.
  await sleep(1500);
  const decisionsAfterReplay = decisionsForReplayAsset;
  decisionReplayUnsub();

  // Cross-tenant replay attempt — must fail.
  let crossTenantReplayBlocked = false;
  try {
    await syscalls.invoke(
      'events.replay',
      { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
      { event_id: replaySource.event_id },
      ['tenant.admin'],
    );
  } catch {
    crossTenantReplayBlocked = true;
  }

  // ---- Cost ledger proof ----
  // The pipeline + plugin agents already drove llm calls earlier; verify
  // those landed in tenant_cost_daily as a >0 cents row for the default
  // tenant. Then record a synthetic cost and assert the upsert merges
  // additively into both cents/calls/models breakdown.
  const costSummaryBefore = await syscalls.invoke<{ total_cents: number; total_calls: number }>(
    'costs.summary',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { days: 7 },
    ['tenant.read'],
  );
  await costLedger.record(cfg.TENANT_DEFAULT_ID, 42, 'claude-haiku-4-5-20251001');
  await costLedger.record(cfg.TENANT_DEFAULT_ID, 8, 'claude-haiku-4-5-20251001');
  await costLedger.record(TENANT_B_ID, 150, 'claude-opus-4-7');
  const costSummaryAfter = await syscalls.invoke<{
    total_cents: number;
    total_calls: number;
    rows: { date: string; cents: number; calls: number; models: Record<string, number> }[];
  }>(
    'costs.summary',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { days: 7 },
    ['tenant.read'],
  );
  const todayCostRow = costSummaryAfter.rows[0];
  const costDelta = costSummaryAfter.total_cents - costSummaryBefore.total_cents;
  const haikuCents = todayCostRow?.models['claude-haiku-4-5-20251001'] ?? 0;

  // Tenant B summary — must be a separate row, independent of A.
  const costSummaryB = await syscalls.invoke<{ total_cents: number; rows: { cents: number }[] }>(
    'costs.summary',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { days: 7 },
    ['tenant.read'],
  );

  // costs.top_today — admin view across tenants.
  const costTop = await syscalls.invoke<{
    rows: { tenant_id: string; cents: number; slug: string | null }[];
    total_cents: number;
  }>(
    'costs.top_today',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { limit: 10 },
    ['tenant.admin'],
  );
  const topHasA = costTop.rows.some((r) => r.tenant_id === cfg.TENANT_DEFAULT_ID);
  const topHasB = costTop.rows.some((r) => r.tenant_id === TENANT_B_ID);

  // Restart proof: a fresh BudgetGuard seeded from costLedger.todayByTenant()
  // must reflect the persisted spend, not zero.
  const restoredSnapshot = await costLedger.todayByTenant();
  const freshBudget = new BudgetGuard(logger, { defaultDailyCeilingUsd: cfg.BUDGET_DAILY_USD });
  freshBudget.restoreToday(restoredSnapshot);
  const restoredA = freshBudget.snapshot(cfg.TENANT_DEFAULT_ID).spent_cents;
  const restoredB = freshBudget.snapshot(TENANT_B_ID).spent_cents;

  // ---- BYOK (bring-your-own-key) proof ----
  // Before any tenant key is set, the factory cache should be empty for
  // tenant B (source=global). After keys.set, tenant B gets a dedicated
  // AnthropicDriver instance — different object identity from the global
  // when it exists. After keys.revoke, the cache invalidates back to
  // global. We register a stand-in global anthropic driver below if the
  // smoke is running without a real ANTHROPIC_API_KEY so the resolver
  // can fall back cleanly.
  if (!drivers.has('anthropic')) {
    drivers.register(new AnthropicDriver('sk-ant-smoke-global-placeholder'));
  }
  const byokGlobalAnthropic = await router.driverFor('anthropic', cfg.TENANT_DEFAULT_ID);
  const byokSourceABeforeSet = tenantDriverFactory.source(cfg.TENANT_DEFAULT_ID, 'anthropic');
  const byokTenantBeforeSet = await router.driverFor('anthropic', TENANT_B_ID);
  const fakeTenantKey = 'sk-ant-fake-byok-smoke-key-1234567890';
  await syscalls.invoke(
    'keys.set',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { provider: 'anthropic', api_key: fakeTenantKey, label: 'smoke B' },
    ['tenant.admin'],
  );
  const byokTenantAfterSet = await router.driverFor('anthropic', TENANT_B_ID);
  const byokSourceB = tenantDriverFactory.source(TENANT_B_ID, 'anthropic');
  const byokListAfterSet = await syscalls.invoke<{
    keys: { provider: string; last4: string; active: boolean; fingerprint: string }[];
  }>(
    'keys.list',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  // List for tenant A — should be empty (tenants only see their own keys).
  const byokListA = await syscalls.invoke<{ keys: unknown[] }>(
    'keys.list',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  // Plaintext must never leak through the redacted shape.
  const byokListJson = JSON.stringify(byokListAfterSet);
  const byokPlaintextLeak = byokListJson.includes(fakeTenantKey);
  // Revoke and re-resolve.
  await syscalls.invoke(
    'keys.revoke',
    { tenant_id: TENANT_B_ID, trace_id: ulid(), caller: 'smoke', logger },
    { provider: 'anthropic' },
    ['tenant.admin'],
  );
  const byokTenantAfterRevoke = await router.driverFor('anthropic', TENANT_B_ID);
  const byokSourceBAfterRevoke = tenantDriverFactory.source(TENANT_B_ID, 'anthropic');

  // ---- Cron parser + scheduler proof ----
  // Spec validations
  const cronEveryHour = parseCron('0 * * * *');
  const cronDailyNoon = parseCron('0 12 * * *');
  const cronWeekdayMorn = parseCron('30 9 * * 1-5');
  const cronList = parseCron('0 9,18 * * *');
  const cronStep = parseCron('*/15 * * * *');

  const refNow = new Date('2026-05-14T10:00:00Z');
  const nextHourly = nextRunAt(cronEveryHour, refNow); // 11:00 same day
  const nextNoon = nextRunAt(cronDailyNoon, refNow); // 12:00 same day
  const nextWeekday = nextRunAt(cronWeekdayMorn, new Date('2026-05-15T10:00:00Z')); // Sat → next Mon
  const nextList = nextRunAt(cronList, refNow); // 18:00 same day
  const nextStep = nextRunAt(cronStep, refNow); // 10:15

  let invalidCronRejected = false;
  try {
    validateCron('* * * * *  * extra');
  } catch {
    invalidCronRejected = true;
  }
  let outOfRangeRejected = false;
  try {
    parseCron('0 25 * * *');
  } catch {
    outOfRangeRejected = true;
  }

  // Live schedule via syscall + scheduler loop tick
  const schedRes = await syscalls.invoke<{ schedule: { id: string; cron_expr: string } }>(
    'scheduler.create',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      name: 'smoke-scheduled-pipeline',
      cron_expr: '0 9 * * *',
      args: { target_platform: 'tiktok', caption: 'smoke scheduled' },
      enabled: true,
    },
    ['tenant.admin'],
  );
  // Force run-now: pushes next_run_at to epoch so the next tick picks it up
  await syscalls.invoke(
    'scheduler.run_now',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    { id: schedRes.schedule.id },
    ['tenant.admin'],
  );
  const smokeLoop = createSchedulerLoop(dbCtx.db, queue, logger, { intervalMs: 60_000 });
  const tickFired = await smokeLoop.tickOnce();
  // Wait for the worker to drain the job + update last_status
  await sleep(800);
  const listAfter = await syscalls.invoke<{ schedules: { id: string; last_status: string | null }[] }>(
    'scheduler.list',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {},
    ['tenant.read'],
  );
  const smokeSched = listAfter.schedules.find((s) => s.id === schedRes.schedule.id);
  await smokeLoop.stop();

  // ---- Persistent credential key proof ----
  // Run ensureCredentialKey twice in an isolated subdir: first call generates,
  // second reuses the file. Then corrupt the file and verify it regenerates.
  const credKeyDir = join(cfg.DATA_DIR, 'credkey-test');
  await mkdir(credKeyDir, { recursive: true });
  // Ensure env doesn't shadow the file path during this section.
  const savedEnvKey = process.env.VFOS_CREDENTIAL_KEY;
  delete process.env.VFOS_CREDENTIAL_KEY;
  const credFirst = await ensureCredentialKey(credKeyDir, logger);
  const credSecond = await ensureCredentialKey(credKeyDir, logger);
  const credKeyPath = join(credKeyDir, 'credential-key.txt');
  const onDisk = (await readFile(credKeyPath, 'utf8')).trim();
  // Corrupt: write garbage shorter than MIN_KEY_CHARS (32)
  await writeFile(credKeyPath, 'short\n');
  const credAfterCorrupt = await ensureCredentialKey(credKeyDir, logger);
  // Env override wins
  process.env.VFOS_CREDENTIAL_KEY = 'a'.repeat(64);
  const credFromEnv = await ensureCredentialKey(credKeyDir, logger);
  // Restore env
  if (savedEnvKey !== undefined) process.env.VFOS_CREDENTIAL_KEY = savedEnvKey;
  else delete process.env.VFOS_CREDENTIAL_KEY;

  // ---- Rate limit proof ----
  // Use a private tenant + bucket so we don't poison the shared default
  // tenant's bucket for subsequent smoke steps.
  const RATE_TENANT = '00000000-0000-0000-0000-0000000000aa';
  await dbCtx.db
    .insert(tenants)
    .values({ id: RATE_TENANT, slug: 'smoke-ratelimit', tier: 'solo' })
    .onConflictDoNothing();
  await dbCtx.db
    .insert(tenant_quotas)
    .values({ tenant_id: RATE_TENANT, syscalls_per_minute: 60 })
    .onConflictDoNothing();
  rateLimiter.setCapacity(RATE_TENANT, 3);
  // 3 tokens initial. 4 rapid calls — the 4th must throw RateLimitError.
  let rateBurstSucceeded = 0;
  let rateBlocked = false;
  let rateRetryAfterMs = 0;
  for (let i = 0; i < 4; i += 1) {
    try {
      await syscalls.invoke(
        'trend.score',
        { tenant_id: RATE_TENANT, trace_id: ulid(), caller: 'smoke-rate', logger },
        {
          url: 'https://example.com/rate-test',
          views_per_hour: 1,
          engagement_rate: 0.01,
        },
        ['trend.score'],
      );
      rateBurstSucceeded += 1;
    } catch (err) {
      if (err instanceof RateLimitError) {
        rateBlocked = true;
        rateRetryAfterMs = err.retryAfterMs;
      }
    }
  }

  // ---- Budget hard-stop proof ----
  const BUDGET_TENANT = '00000000-0000-0000-0000-0000000000bb';
  await dbCtx.db
    .insert(tenants)
    .values({ id: BUDGET_TENANT, slug: 'smoke-budget', tier: 'solo' })
    .onConflictDoNothing();
  await dbCtx.db
    .insert(tenant_quotas)
    .values({ tenant_id: BUDGET_TENANT })
    .onConflictDoNothing();
  // Set tiny ceiling, then record over it.
  budget.setCeiling(BUDGET_TENANT, 0.01); // 1 cent
  let budgetBefore = budget.snapshot(BUDGET_TENANT);
  budget.record(BUDGET_TENANT, 5);
  let budgetAfter = budget.snapshot(BUDGET_TENANT);
  let budgetBlocked = false;
  try {
    budget.checkOrThrow(BUDGET_TENANT);
  } catch (err) {
    if (err instanceof BudgetExceededError) budgetBlocked = true;
  }
  // Raising ceiling un-blocks
  budget.setCeiling(BUDGET_TENANT, 100);
  const budgetUnblocked = !budget.snapshot(BUDGET_TENANT).blocked;

  // ---- Full pipeline demo proof ----
  // Re-link a facebook cred (the earlier smoke section unlinked it) so this
  // run can exercise the multi-platform fan-out path.
  await syscalls.invoke(
    'connectors.link',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      platform: 'facebook',
      account_id: '1000000000',
      handle: 'Smoke Test Page',
      access_token: 'fake_fb_token_for_fanout',
      scopes: ['pages_manage_posts'],
    },
    ['tenant.admin'],
  );

  // Backwards-compat: single target_platform still works.
  const pipelineSingle = await syscalls.invoke<{
    final: string;
    publishes?: { platform: string; status: string }[];
  }>(
    'pipeline.run',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      source_url: 'https://www.tiktok.com/@demo/video/8888',
      target_platform: 'tiktok',
      caption: 'pipeline smoke single 🎬',
    },
    ['tenant.admin'],
  );

  // Fan-out: both platforms in parallel.
  const pipelineRes = await syscalls.invoke<{
    trace_id: string;
    total_ms: number;
    final: string;
    reason?: string;
    steps: { name: string; status: string; ms: number }[];
    publishes?: { platform: string; status: string; account_id?: string }[];
  }>(
    'pipeline.run',
    { tenant_id: cfg.TENANT_DEFAULT_ID, trace_id: ulid(), caller: 'smoke', logger },
    {
      source_url: 'https://www.tiktok.com/@demo/video/9999',
      target_platforms: ['tiktok', 'facebook'],
      caption: 'pipeline smoke 🎬 #affiliate',
    },
    ['tenant.admin'],
  );
  const pipelineStepNames = pipelineRes.steps.map((s) => s.name);
  const pipelineFailedSteps = pipelineRes.steps.filter((s) => s.status === 'failed');
  const fanoutPlatforms = pipelineRes.publishes?.map((p) => p.platform).sort() ?? [];
  const fanoutPublishedCount = pipelineRes.publishes?.filter((p) => p.status === 'published').length ?? 0;

  const renderStats = await queue.stats('vfos.render');
  const publishStats = await queue.stats('vfos.publish');
  const budgetSnap = budget.snapshot(cfg.TENANT_DEFAULT_ID);
  const metricsText = await getMetricsText();
  const metricLines = metricsText.split('\n').filter((l) => l && !l.startsWith('#'));

  // Trace analysis: bucket spans by trace_id, find one with multiple
  // span names — proves cross-syscall causality propagation.
  const spans = getRecentSpans();
  const traceBuckets = new Map<string, Set<string>>();
  for (const s of spans) {
    const tid = s.spanContext().traceId;
    const set = traceBuckets.get(tid) ?? new Set<string>();
    set.add(s.name);
    traceBuckets.set(tid, set);
  }
  const tracesTotal = traceBuckets.size;
  let maxSpansPerTrace = 0;
  let maxSpansTraceId = '';
  for (const [tid, names] of traceBuckets) {
    if (names.size > maxSpansPerTrace) {
      maxSpansPerTrace = names.size;
      maxSpansTraceId = tid;
    }
  }
  const richestTraceNames = maxSpansTraceId
    ? [...(traceBuckets.get(maxSpansTraceId) ?? [])].sort()
    : [];

  logger.info(
    {
      plugins_loaded: plugins.list().length,
      syscalls_registered: syscalls.list().length,
      drivers_registered: drivers.list().map((d) => d.name),
      bus: bus.name,
      queue: queue.name,
      events_total: bus.getRecentEvents(500).length,
      trend_events: trendsSeen,
      match_events: matchesSeen,
      niche_events: nicheClassifiedSeen,
      compliance: decisionTally,
      render_completed_events: rendersCompleted,
      render_queue_stats: renderStats,
      publish_completed_events: publishesCompleted,
      publish_failed_events: publishesFailed,
      publish_queue_stats: publishStats,
      connectors: {
        tt_link_action: tiktokLink.action,
        fb_link_action: fbLink.action,
        cred_list_count: credList.credentials.length,
        cred_list_leaks_secret: credListLeaks,
        direct_publish_id: ttPublish.publish_id,
        direct_publish_status: ttPublish.status,
        queued_job_id: queuedPublish.id,
        unlinked_publish_blocked: unlinkedPublishBlocked,
        tenant_isolated: credentialsTenantIsolated,
      },
      oauth: {
        state_first_consume_ok: verified !== null,
        state_second_consume_blocked: verifiedSecondAttempt === null,
        tampered_state_rejected: tamperedVerified === null,
        linked_account_id: oauthLinkedAccountId,
        authorize_url_has_code: parsedCode.length > 0,
      },
      webhooks: {
        secret_prefix_ok: webhookSecret.startsWith('whsec_'),
        receiver_port: receiverPort,
        events_received: received.length,
        hmac_ok: hmacOk,
        retry_observed: retryObserved,
        schemas_seen: webhookSchemasSeen,
        delivered_count: webhookCounts?.delivered_count,
        failed_count: webhookCounts?.failed_count,
      },
      marketplace: {
        catalog_count: mpCatalogCount,
        trend_uninstalled: mpTrendUninstalled,
        trend_reinstalled: mpTrendReinstalled,
      },
      budget_alerter: {
        warn_events: warnAfter80,
        exceeded_events: exceededAfterCrossing,
        warn_pct: warnPct,
        exceeded_pct: exceededPct,
      },
      audit: {
        rows_captured: auditList.rows.length,
        actions_count: auditActions.size,
        has_plugins_install: auditHasInstall,
        has_keys_set: auditHasKeysSet,
        missing_list_available: auditMissingList,
        missing_costs_summary: auditMissingCostsSummary,
        api_key_redacted: auditApiKeyRedacted,
        error_captured: auditErrCaptured && exceptedAuditError,
        summary_has_install: auditSummaryHasInstall,
      },
      plugin_config: {
        install_interval: cfgIntervalAfterInstall,
        install_marker: cfgMarkerAfterInstall,
        update_interval: cfgIntervalAfterUpdate,
        update_marker: cfgMarkerAfterUpdate,
        list_interval: cfgListInterval,
        schema_exposed: cfgSchemaPresent,
        bad_interval_rejected: badIntervalRejected,
        bad_enum_rejected: badEnumRejected,
        bad_type_rejected: badTypeRejected,
        valid_update_interval: validUpdateInterval,
        valid_update_region: validUpdateRegion,
        coerced_interval: coercedInterval,
      },
      replay: {
        source_event_id: replaySource.event_id,
        replayed_event_id: replayResult.event_id,
        different_id: replayDifferentId,
        meta_replay_flag: replayMetaOk,
        original_id_match: replayOriginalIdMatch,
        emitter_prefixed: replayEmitterPrefixed,
        cross_tenant_blocked: crossTenantReplayBlocked,
        decisions_after_source: decisionsAfterSource,
        decisions_after_replay: decisionsAfterReplay,
        ignore_replays_holds: decisionsAfterReplay === decisionsAfterSource,
      },
      costs: {
        summary_a_before_cents: costSummaryBefore.total_cents,
        summary_a_after_cents: costSummaryAfter.total_cents,
        delta_a_cents: costDelta,
        haiku_cents_in_breakdown: haikuCents,
        today_calls_a: todayCostRow?.calls ?? 0,
        summary_b_cents: costSummaryB.total_cents,
        top_total_cents: costTop.total_cents,
        top_has_a: topHasA,
        top_has_b: topHasB,
        restored_a_cents: restoredA,
        restored_b_cents: restoredB,
      },
      byok: {
        before_set_source_a: byokSourceABeforeSet,
        before_set_same_as_global: byokTenantBeforeSet === byokGlobalAnthropic,
        after_set_source_b: byokSourceB,
        after_set_different_from_global: byokTenantAfterSet !== byokGlobalAnthropic,
        list_a_empty: byokListA.keys.length === 0,
        list_b_active: byokListAfterSet.keys.find((k) => k.provider === 'anthropic')?.active === true,
        list_b_last4: byokListAfterSet.keys.find((k) => k.provider === 'anthropic')?.last4,
        plaintext_leak: byokPlaintextLeak,
        after_revoke_source_b: byokSourceBAfterRevoke,
        after_revoke_same_as_global: byokTenantAfterRevoke === byokGlobalAnthropic,
      },
      tenant_isolation: {
        a_loaded_during: aLoadedDuringIsolation,
        b_loaded_during: bLoadedDuringIsolation,
        total_loaded_during: totalLoadedDuringIsolation,
        comp_a_delta: compADelta,
        comp_b_delta: compBDelta,
        a_loaded_after_b_uninstall: aLoadedAfterBUninstall,
        b_loaded_after_b_uninstall: bLoadedAfterBUninstall,
      },
      scheduler: {
        next_hourly_hour: nextHourly?.getUTCHours(),
        next_noon_hour: nextNoon?.getUTCHours(),
        next_weekday_day: nextWeekday?.getUTCDay(),
        next_list_hour: nextList?.getUTCHours(),
        next_step_minute: nextStep?.getUTCMinutes(),
        invalid_cron_rejected: invalidCronRejected,
        out_of_range_rejected: outOfRangeRejected,
        tick_fired: tickFired,
        last_status: smokeSched?.last_status,
      },
      credential_key: {
        first_source: credFirst.source,
        second_source: credSecond.source,
        stable_across_calls: credFirst.key === credSecond.key,
        file_matches_returned: onDisk === credFirst.key,
        regen_after_corrupt: credAfterCorrupt.source,
        env_overrides: credFromEnv.source === 'env',
      },
      rate_limit: {
        succeeded: rateBurstSucceeded,
        blocked: rateBlocked,
        retry_after_ms: rateRetryAfterMs,
      },
      budget_guard: {
        before_blocked: budgetBefore.blocked,
        after_blocked: budgetAfter.blocked,
        check_throws: budgetBlocked,
        unblock_works: budgetUnblocked,
      },
      pipeline: {
        final: pipelineRes.final,
        steps: pipelineStepNames,
        failed_count: pipelineFailedSteps.length,
        total_ms: pipelineRes.total_ms,
        trace_id: pipelineRes.trace_id,
        single_final: pipelineSingle.final,
        single_publishes: pipelineSingle.publishes,
        fanout_platforms: fanoutPlatforms,
        fanout_published_count: fanoutPublishedCount,
      },
      ai_test: {
        route_driver: aiTestRes.route.driver,
        route_model: aiTestRes.route.model,
        cache_enabled: aiTestRes.cache_enabled,
        latency_ms: aiTestRes.latency_ms,
        cost_cents: aiTestRes.cost_cents,
        has_json: aiTestRes.json !== null,
      },
      invites: {
        a_consumed: consumedA !== null,
        a_replay_blocked: consumedAReplay === null,
        b_revoked_ok: revokedB,
        b_consume_after_revoke_blocked: consumedBAfterRevoke === null,
        expired_blocked: consumedExpired === null,
        tampered_lookup_null: tamperedFetch === null,
      },
      users: {
        before: usersBefore,
        after: usersAfter,
        pw_verify_good: pwVerifyGood,
        pw_verify_bad: pwVerifyBad,
        pw_tampered: pwTampered,
        created_id: smokeUser.id,
        login_good: loginGood?.email,
        login_bad: loginBad,
        login_unknown: loginUnknown,
      },
      budget: budgetSnap,
      assets_before: assetsBefore,
      assets_after: assetsAfter,
      assets_persisted_in_run: assetsAfter - assetsBefore,
      roundtrip_match: roundtripContent === 'persistence-roundtrip-test',
      metrics_total_series: metricLines.length,
      metrics_has_syscall: metricsText.includes('vfos_syscall_total'),
      metrics_has_compliance: metricsText.includes('vfos_compliance_decision_total'),
      metrics_has_llm: metricsText.includes('vfos_llm_calls_total'),
      rls: {
        alice_visible: aliceVisible,
        bob_visible: bobVisible,
        unscoped_visible: unscopedVisible,
        alice_leaked_bob: aliceLeakedBob,
        cross_write_rejected: crossWriteRejected,
      },
      auth: {
        admin_validates: adminCtx?.is_admin === true,
        tenant_validates: tenantCtx?.tenant_id === TENANT_B_ID,
        tenant_scopes: tenantCtx?.scopes ?? [],
        fake_rejected: fakeCtx === null,
        revoked_rejected: revokedCtx === null,
      },
      tracing: {
        total_spans: spans.length,
        total_traces: tracesTotal,
        richest_trace_id: maxSpansTraceId,
        richest_span_kinds: richestTraceNames,
      },
    },
    'smoke.summary',
  );

  await webhookDispatcher.stop();
  await queue.stop();
  await bus.stop();
  await dbCtx.shutdown();
  await shutdownTelemetry();

  if (plugins.list().length === 0) {
    logger.error('smoke.fail: no plugin loaded');
    process.exit(2);
  }
  if (trendsSeen === 0) {
    logger.error('smoke.fail: no trend event observed');
    process.exit(3);
  }
  if (matchesSeen === 0) {
    logger.error('smoke.fail: no affiliate match observed');
    process.exit(4);
  }
  if (nicheClassifiedSeen === 0) {
    logger.error('smoke.fail: no niche classification observed');
    process.exit(5);
  }
  if (!directAi.json || typeof (directAi.json as { niche?: unknown }).niche !== 'string') {
    logger.error({ directAi }, 'smoke.fail: ai.json did not return parsed JSON');
    process.exit(6);
  }
  if ((decisionTally.PASS ?? 0) === 0) {
    logger.error({ decisionTally }, 'smoke.fail: no PASS decision observed');
    process.exit(7);
  }
  if ((decisionTally.REJECT ?? 0) === 0) {
    logger.error({ decisionTally }, 'smoke.fail: no REJECT decision observed');
    process.exit(8);
  }
  if (rendersCompleted === 0) {
    logger.error('smoke.fail: no render.completed.v1');
    process.exit(9);
  }
  if (rendersCompleted < (decisionTally.PASS ?? 0)) {
    logger.error(
      { rendersCompleted, passes: decisionTally.PASS },
      'smoke.fail: render completions < PASS decisions',
    );
    process.exit(10);
  }
  if (assetsAfter <= assetsBefore) {
    logger.error({ assetsBefore, assetsAfter }, 'smoke.fail: no assets persisted in DB');
    process.exit(11);
  }
  if (roundtripContent !== 'persistence-roundtrip-test') {
    logger.error({ roundtripContent }, 'smoke.fail: fs.put/fs.get roundtrip mismatch');
    process.exit(12);
  }
  if (
    !metricsText.includes('vfos_syscall_total') ||
    !metricsText.includes('vfos_compliance_decision_total') ||
    !metricsText.includes('vfos_llm_calls_total')
  ) {
    logger.error({ sample: metricsText.slice(0, 500) }, 'smoke.fail: metrics missing core series');
    process.exit(13);
  }
  if (aliceVisible === 0) {
    logger.error({ aliceVisible }, 'smoke.fail: alice cannot see her own assets (RLS too restrictive)');
    process.exit(14);
  }
  if (bobVisible === 0) {
    logger.error({ bobVisible }, 'smoke.fail: bob cannot see his own assets');
    process.exit(15);
  }
  // Note: in PGlite + production-superuser mode, the unscoped query bypasses RLS.
  // What matters is that visible counts DIFFER between tenants and the
  // unscoped (admin) query sees both sets together.
  if (unscopedVisible <= aliceVisible || unscopedVisible <= bobVisible) {
    logger.error(
      { unscopedVisible, aliceVisible, bobVisible },
      'smoke.fail: unscoped count should exceed either tenant-scoped count (proves RLS filtered)',
    );
    process.exit(16);
  }
  if (aliceLeakedBob > 0) {
    logger.error({ aliceLeakedBob }, 'smoke.fail: alice could read bob row (RLS isolation broken)');
    process.exit(17);
  }
  if (!crossWriteRejected) {
    logger.error('smoke.fail: cross-tenant insert was NOT rejected by RLS WITH CHECK');
    process.exit(18);
  }
  if (adminCtx?.is_admin !== true) {
    logger.error({ adminCtx }, 'smoke.fail: admin token did not validate as is_admin');
    process.exit(19);
  }
  if (tenantCtx?.tenant_id !== TENANT_B_ID) {
    logger.error({ tenantCtx }, 'smoke.fail: tenant token did not pin tenant_id');
    process.exit(20);
  }
  if (fakeCtx !== null) {
    logger.error({ fakeCtx }, 'smoke.fail: fake token validated (auth bypass)');
    process.exit(21);
  }
  if (revokedCtx !== null) {
    logger.error({ revokedCtx }, 'smoke.fail: revoked token still validates');
    process.exit(22);
  }
  if (spans.length === 0) {
    logger.error('smoke.fail: zero spans captured (tracing inactive)');
    process.exit(23);
  }
  // A real cross-syscall trace must contain bus.publish + bus.handle + syscall.*
  // — proves trace_id propagates through the in-memory bus.
  if (maxSpansPerTrace < 3) {
    logger.error(
      { maxSpansPerTrace, richestTraceNames },
      'smoke.fail: no trace has >= 3 distinct span names (propagation likely broken)',
    );
    process.exit(24);
  }
  const hasPublish = richestTraceNames.some((n) => n.startsWith('bus.publish'));
  const hasHandle = richestTraceNames.some((n) => n.startsWith('bus.handle'));
  const hasSyscall = richestTraceNames.some((n) => n.startsWith('syscall.'));
  if (!(hasPublish && hasHandle && hasSyscall)) {
    logger.error(
      { hasPublish, hasHandle, hasSyscall, richestTraceNames },
      'smoke.fail: richest trace missing bus.publish/bus.handle/syscall.* hierarchy',
    );
    process.exit(25);
  }
  if (tiktokLink.action !== 'created' || fbLink.action !== 'created') {
    logger.error({ tiktokLink, fbLink }, 'smoke.fail: connectors.link did not create credentials');
    process.exit(26);
  }
  if (credListLeaks) {
    logger.error({ sample: credListJson.slice(0, 200) }, 'smoke.fail: connectors.list leaked secret');
    process.exit(27);
  }
  if (ttPublish.status !== 'published' || !ttPublish.publish_id.startsWith('tt_')) {
    logger.error({ ttPublish }, 'smoke.fail: direct publish.tiktok did not return published mock id');
    process.exit(28);
  }
  if (publishesCompleted < 2) {
    logger.error(
      { publishesCompleted, publishesFailed },
      'smoke.fail: expected >=2 publish.completed.v1 events (direct + queue worker)',
    );
    process.exit(29);
  }
  if (!unlinkedPublishBlocked) {
    logger.error('smoke.fail: publish after unlink was NOT rejected');
    process.exit(30);
  }
  if (!credentialsTenantIsolated) {
    logger.error(
      { bobCredCount: bobCredList.credentials.length },
      'smoke.fail: tenant B saw tenant A credentials (RLS broken)',
    );
    process.exit(31);
  }
  if (!metricsText.includes('vfos_publish_total')) {
    logger.error('smoke.fail: vfos_publish_total metric missing');
    process.exit(32);
  }
  if (!verified) {
    logger.error('smoke.fail: oauth state consumption returned null on first try');
    process.exit(33);
  }
  if (verifiedSecondAttempt !== null) {
    logger.error('smoke.fail: oauth state was consumable twice (replay attack possible)');
    process.exit(34);
  }
  if (tamperedVerified !== null) {
    logger.error('smoke.fail: tampered oauth state was accepted');
    process.exit(35);
  }
  if (!oauthLinkedAccountId || !oauthLinkedAccountId.startsWith('mock_tiktok_')) {
    logger.error({ oauthLinkedAccountId }, 'smoke.fail: OAuth callback did not link a credential');
    process.exit(36);
  }
  if (!pwVerifyGood) {
    logger.error('smoke.fail: password verifier rejected correct password');
    process.exit(37);
  }
  if (pwVerifyBad) {
    logger.error('smoke.fail: password verifier accepted wrong password');
    process.exit(38);
  }
  if (pwTampered) {
    logger.error('smoke.fail: password verifier accepted tampered envelope');
    process.exit(39);
  }
  if (usersAfter !== usersBefore + 1) {
    logger.error({ usersBefore, usersAfter }, 'smoke.fail: createUser did not increment user count');
    process.exit(40);
  }
  if (loginGood?.email !== 'smoke@example.test') {
    logger.error({ loginGood }, 'smoke.fail: case-insensitive login did not return correct user');
    process.exit(41);
  }
  if (loginBad !== null) {
    logger.error('smoke.fail: login with bad password should return null');
    process.exit(42);
  }
  if (loginUnknown !== null) {
    logger.error('smoke.fail: login with unknown email should return null');
    process.exit(43);
  }
  if (!aiTestRes.route.driver || !aiTestRes.route.model) {
    logger.error({ aiTestRes }, 'smoke.fail: ai.test did not return route info');
    process.exit(44);
  }
  if (!aiTestRes.cache_enabled) {
    logger.error({ aiTestRes }, 'smoke.fail: ai.test classify_niche should have cache_enabled=true');
    process.exit(45);
  }
  if (aiTestRes.json === null) {
    logger.error({ aiTestRes }, 'smoke.fail: ai.test with JSON schema returned null json');
    process.exit(46);
  }
  if (typeof aiTestRes.latency_ms !== 'number' || aiTestRes.latency_ms < 0) {
    logger.error({ aiTestRes }, 'smoke.fail: ai.test latency_ms not measured');
    process.exit(47);
  }
  if (consumedA === null) {
    logger.error('smoke.fail: invite A could not be consumed on first try');
    process.exit(48);
  }
  if (consumedAReplay !== null) {
    logger.error('smoke.fail: invite A consumed twice (replay attack possible)');
    process.exit(49);
  }
  if (!revokedB) {
    logger.error('smoke.fail: invite B revoke returned false');
    process.exit(50);
  }
  if (consumedBAfterRevoke !== null) {
    logger.error('smoke.fail: revoked invite B was still consumable');
    process.exit(51);
  }
  if (consumedExpired !== null) {
    logger.error('smoke.fail: expired invite was still consumable');
    process.exit(52);
  }
  if (tamperedFetch !== null) {
    logger.error('smoke.fail: tampered invite token returned a row');
    process.exit(53);
  }
  if (pipelineRes.final !== 'published') {
    logger.error(
      { pipelineRes },
      `smoke.fail: pipeline did not reach 'published' (final=${pipelineRes.final})`,
    );
    process.exit(54);
  }
  if (pipelineFailedSteps.length > 0) {
    logger.error(
      { failed: pipelineFailedSteps },
      'smoke.fail: pipeline had failed steps',
    );
    process.exit(55);
  }
  const expectedSteps = [
    'trend.score',
    'ai.classify_niche',
    'fs.put',
    'compliance.gate',
    'queue.enqueue render',
    'await render.completed',
    'connectors.list',
    'publish.tiktok',
  ];
  const missingSteps = expectedSteps.filter((s) => !pipelineStepNames.includes(s));
  if (missingSteps.length > 0) {
    logger.error({ missingSteps, pipelineStepNames }, 'smoke.fail: pipeline missing steps');
    process.exit(56);
  }
  if (!pipelineRes.trace_id || pipelineRes.trace_id.length !== 32) {
    logger.error({ trace_id: pipelineRes.trace_id }, 'smoke.fail: pipeline trace_id missing/short');
    process.exit(57);
  }
  if (rateBurstSucceeded !== 3) {
    logger.error(
      { rateBurstSucceeded },
      'smoke.fail: rate limiter should allow exactly 3 calls before refusing',
    );
    process.exit(58);
  }
  if (!rateBlocked) {
    logger.error('smoke.fail: 4th call did not hit RateLimitError');
    process.exit(59);
  }
  if (rateRetryAfterMs <= 0) {
    logger.error({ rateRetryAfterMs }, 'smoke.fail: RateLimitError missing retry_after_ms');
    process.exit(60);
  }
  if (budgetBefore.blocked) {
    logger.error('smoke.fail: budget marked blocked before any spend');
    process.exit(61);
  }
  if (!budgetAfter.blocked) {
    logger.error('smoke.fail: budget not blocked after exceeding ceiling');
    process.exit(62);
  }
  if (!budgetBlocked) {
    logger.error('smoke.fail: BudgetExceededError not thrown on checkOrThrow');
    process.exit(63);
  }
  if (!budgetUnblocked) {
    logger.error('smoke.fail: raising ceiling did not unblock tenant');
    process.exit(64);
  }
  if (
    !metricsText.includes('vfos_ratelimit_blocks_total') ||
    !metricsText.includes('vfos_budget_blocks_total')
  ) {
    logger.error('smoke.fail: rate-limit / budget metrics missing');
    process.exit(65);
  }
  if (credFirst.source !== 'generated') {
    logger.error({ credFirst }, 'smoke.fail: first ensureCredentialKey did not generate');
    process.exit(66);
  }
  if (credSecond.source !== 'file' || credFirst.key !== credSecond.key) {
    logger.error(
      { credFirst, credSecond },
      'smoke.fail: second call did not reuse on-disk key',
    );
    process.exit(67);
  }
  if (onDisk !== credFirst.key) {
    logger.error('smoke.fail: on-disk file does not match returned key');
    process.exit(68);
  }
  if (credAfterCorrupt.source !== 'generated' || credAfterCorrupt.key === credFirst.key) {
    logger.error(
      { credAfterCorrupt },
      'smoke.fail: corrupted file should trigger regenerate to a NEW key',
    );
    process.exit(69);
  }
  if (credFromEnv.source !== 'env') {
    logger.error('smoke.fail: VFOS_CREDENTIAL_KEY env did not override file');
    process.exit(70);
  }
  if (mpCatalogCount < 2) {
    logger.error({ mpCatalogCount }, 'smoke.fail: marketplace catalog should list >=2 shipped plugins');
    process.exit(71);
  }
  if (!mpTrendUninstalled) {
    logger.error('smoke.fail: plugins.uninstall did not flip enabled=false + loaded=false');
    process.exit(72);
  }
  if (!mpTrendReinstalled) {
    logger.error('smoke.fail: plugins.install did not hot-reload after uninstall');
    process.exit(73);
  }
  if (!aLoadedDuringIsolation || !bLoadedDuringIsolation) {
    logger.error(
      { aLoadedDuringIsolation, bLoadedDuringIsolation },
      'smoke.fail: both tenants should have a loaded trend-scout instance',
    );
    process.exit(74);
  }
  if (compBDelta !== 1) {
    logger.error(
      { compBDelta, compADelta },
      'smoke.fail: tenant B compliance should react exactly once (its synthetic event) — filter leak',
    );
    process.exit(75);
  }
  if (compADelta < 1) {
    logger.error(
      { compADelta, compBDelta },
      'smoke.fail: tenant A compliance should have reacted to its synthetic event',
    );
    process.exit(77);
  }
  if (!aLoadedAfterBUninstall || bLoadedAfterBUninstall) {
    logger.error(
      { aLoadedAfterBUninstall, bLoadedAfterBUninstall },
      'smoke.fail: uninstalling for tenant B should leave A loaded, B unloaded',
    );
    process.exit(76);
  }
  if (byokSourceB !== 'tenant') {
    logger.error({ byokSourceB }, 'smoke.fail: keys.set should switch resolver to tenant source');
    process.exit(78);
  }
  if (byokTenantAfterSet === byokGlobalAnthropic) {
    logger.error('smoke.fail: tenant-scoped driver must NOT be the global instance after keys.set');
    process.exit(79);
  }
  if (byokListA.keys.length !== 0) {
    logger.error({ byokListA }, 'smoke.fail: tenant A should see zero keys (B set, not A)');
    process.exit(80);
  }
  if (byokPlaintextLeak) {
    logger.error('smoke.fail: keys.list leaked plaintext api_key');
    process.exit(81);
  }
  if (byokSourceBAfterRevoke !== 'global') {
    logger.error(
      { byokSourceBAfterRevoke },
      'smoke.fail: keys.revoke should drop tenant driver and fall back to global',
    );
    process.exit(82);
  }
  if (costDelta < 50) {
    logger.error(
      { costDelta, before: costSummaryBefore.total_cents, after: costSummaryAfter.total_cents },
      'smoke.fail: cost ledger should reflect the +50c synthetic records for tenant A',
    );
    process.exit(83);
  }
  if (haikuCents < 50) {
    logger.error(
      { haikuCents },
      'smoke.fail: model breakdown should track haiku cents from synthetic records',
    );
    process.exit(84);
  }
  if (costSummaryB.total_cents < 150) {
    logger.error(
      { b: costSummaryB.total_cents },
      'smoke.fail: tenant B cost summary should reflect the +150c synthetic record',
    );
    process.exit(85);
  }
  if (!topHasA || !topHasB) {
    logger.error(
      { topHasA, topHasB, rows: costTop.rows },
      'smoke.fail: costs.top_today should include both tenants A and B',
    );
    process.exit(86);
  }
  if (restoredA < 50 || restoredB < 150) {
    logger.error(
      { restoredA, restoredB },
      'smoke.fail: a fresh BudgetGuard restored from costLedger should match persisted spend',
    );
    process.exit(87);
  }
  if (!replayDifferentId || !replayMetaOk || !replayOriginalIdMatch || !replayEmitterPrefixed) {
    logger.error(
      { replayDifferentId, replayMetaOk, replayOriginalIdMatch, replayEmitterPrefixed },
      'smoke.fail: events.replay should mint new id, tag meta.replay=true, preserve original_event_id, prefix emitter',
    );
    process.exit(88);
  }
  if (!crossTenantReplayBlocked) {
    logger.error('smoke.fail: cross-tenant replay should be rejected — tenant scope leak');
    process.exit(89);
  }
  if (decisionsAfterSource < 1) {
    logger.error(
      { decisionsAfterSource },
      'smoke.fail: compliance-demo should react to the fresh trend.discovered.v1 source event',
    );
    process.exit(97);
  }
  if (decisionsAfterReplay !== decisionsAfterSource) {
    logger.error(
      { decisionsAfterSource, decisionsAfterReplay },
      'smoke.fail: ignore_replays=true should prevent compliance-demo from re-firing on replayed events',
    );
    process.exit(98);
  }
  if (cfgIntervalAfterInstall !== 250 || cfgMarkerAfterInstall !== 'install-time') {
    logger.error(
      { cfgIntervalAfterInstall, cfgMarkerAfterInstall },
      'smoke.fail: ctx.config should reflect install-time config',
    );
    process.exit(90);
  }
  if (cfgIntervalAfterUpdate !== 750 || cfgMarkerAfterUpdate !== 'update-time') {
    logger.error(
      { cfgIntervalAfterUpdate, cfgMarkerAfterUpdate },
      'smoke.fail: plugins.update_config should hot-reload with new ctx.config',
    );
    process.exit(91);
  }
  if (cfgListInterval !== 750) {
    logger.error(
      { cfgListInterval },
      'smoke.fail: plugins.list_available should echo the latest stored config',
    );
    process.exit(92);
  }
  if (!cfgSchemaPresent) {
    logger.error('smoke.fail: list_available should expose trend-scout-mock configSchema');
    process.exit(99);
  }
  if (!badIntervalRejected || !badEnumRejected || !badTypeRejected) {
    logger.error(
      { badIntervalRejected, badEnumRejected, badTypeRejected },
      'smoke.fail: validator should reject below-min / not-in-enum / wrong-type configs',
    );
    process.exit(100);
  }
  if (validUpdateInterval !== 1500 || validUpdateRegion !== 'US') {
    logger.error(
      { validUpdateInterval, validUpdateRegion },
      'smoke.fail: valid update_config did not store cleaned values',
    );
    process.exit(101);
  }
  if (coercedInterval !== 2000) {
    logger.error(
      { coercedInterval },
      'smoke.fail: string "2000" should coerce to number 2000 per integer schema',
    );
    process.exit(102);
  }
  if (!auditHasInstall || !auditHasKeysSet) {
    logger.error(
      { auditHasInstall, auditHasKeysSet },
      'smoke.fail: audit_log should contain rows for plugins.install + keys.set',
    );
    process.exit(103);
  }
  if (!auditMissingList || !auditMissingCostsSummary) {
    logger.error(
      { auditMissingList, auditMissingCostsSummary },
      'smoke.fail: read-only syscalls (list_available / costs.summary) must NOT be audited',
    );
    process.exit(104);
  }
  if (!auditApiKeyRedacted) {
    logger.error(
      { sample: auditKeysSet?.payload },
      'smoke.fail: keys.set audit payload must redact api_key plaintext',
    );
    process.exit(105);
  }
  if (!auditErrCaptured) {
    logger.error('smoke.fail: failed plugins.uninstall should land as status=error in audit_log');
    process.exit(106);
  }
  if (!auditSummaryHasInstall) {
    logger.error('smoke.fail: audit.summary should group plugins.install rows');
    process.exit(107);
  }
  if (warnAfter80 !== 1) {
    logger.error(
      { warnAfter80 },
      'smoke.fail: budget.warn.v1 should fire exactly once across the 80% threshold',
    );
    process.exit(93);
  }
  if (exceededAfterCrossing !== 1) {
    logger.error(
      { exceededAfterCrossing },
      'smoke.fail: budget.exceeded.v1 should fire exactly once across the 100% threshold',
    );
    process.exit(94);
  }
  if (warnPct === null || warnPct < 80 || warnPct >= 100) {
    logger.error({ warnPct }, 'smoke.fail: warn payload.pct should be in [80, 100)');
    process.exit(95);
  }
  if (exceededPct === null || exceededPct < 100) {
    logger.error({ exceededPct }, 'smoke.fail: exceeded payload.pct should be >= 100');
    process.exit(96);
  }
  logger.info('smoke.ok');
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
