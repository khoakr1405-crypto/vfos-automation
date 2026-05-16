import { join } from 'node:path';
import { and, eq } from 'drizzle-orm';
import { tenant_plugins, tenant_quotas, tenants } from '@vfos/db';
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
import { buildHttp } from './http.js';
import { DriverRegistry } from './drivers/registry.js';
import { AnthropicDriver } from './drivers/anthropic.js';
import { MockLLMDriver } from './drivers/mock.js';
import { BudgetAlerter } from './ai/budget-alerter.js';
import { BudgetGuard } from './ai/budget.js';
import { CostLedger } from './ai/cost-ledger.js';
import { AIRouter } from './ai/router.js';
import { TenantDriverFactory } from './ai/tenant-driver-factory.js';
import { ensureAdminToken } from './auth/bootstrap.js';
import { ensureCredentialKey } from './auth/credential-key.js';
import { ConnectorRegistry } from './connectors/registry.js';
import { MetaConnector } from './connectors/meta.js';
import { TikTokConnector } from './connectors/tiktok.js';
import { RateLimiter } from './rate-limit.js';
import { OAuthRegistry } from './oauth/registry.js';
import { MockOAuthProvider } from './oauth/mock.js';
import { TikTokOAuthProvider } from './oauth/tiktok.js';
import { MetaOAuthProvider } from './oauth/meta.js';
import { createSchedulerLoop } from './scheduler/loop.js';
import { setupTelemetry, shutdownTelemetry } from './telemetry/setup.js';
import { WebhookDispatcher } from './webhooks/dispatcher.js';
import { registerPublishWorker } from './workers/publish.js';
import { registerRenderWorker } from './workers/render.js';
import { registerSchedulerWorker } from './workers/scheduler.js';

async function main(): Promise<void> {
  setupTelemetry();
  const cfg = loadConfig();
  const logger = createLogger(cfg);
  logger.info(
    {
      cfg: {
        NODE_ENV: cfg.NODE_ENV,
        KERNEL_PORT: cfg.KERNEL_PORT,
        DATA_DIR: cfg.DATA_DIR,
        BUDGET_DAILY_USD: cfg.BUDGET_DAILY_USD,
        anthropic: cfg.ANTHROPIC_API_KEY ? 'enabled' : 'disabled',
        redis: cfg.REDIS_URL ? 'enabled' : 'disabled',
      },
    },
    'kernel.boot',
  );

  const dbCtx = await createDb(logger, { dataDir: cfg.DATA_DIR });
  await ensureDefaultTenant(dbCtx.db, cfg.TENANT_DEFAULT_ID, logger);
  await ensureAdminToken(dbCtx.db, cfg.DATA_DIR, logger);

  const blob = new BlobStore(logger, join(cfg.DATA_DIR, 'blobs'));
  await blob.start();

  const busOpts: { redisUrl?: string } = {};
  if (cfg.REDIS_URL) busOpts.redisUrl = cfg.REDIS_URL;
  const bus = await createBus(logger, busOpts);
  const queue = await createQueue(logger, busOpts);

  const drivers = new DriverRegistry(logger);
  if (cfg.ANTHROPIC_API_KEY) {
    drivers.register(new AnthropicDriver(cfg.ANTHROPIC_API_KEY));
  }
  drivers.register(new MockLLMDriver());

  const budget = new BudgetGuard(logger, { defaultDailyCeilingUsd: cfg.BUDGET_DAILY_USD });
  const costLedger = new CostLedger({ db: dbCtx.db, logger });
  // Reload today's per-tenant spend so the in-memory ceiling guard is
  // accurate after a restart — otherwise a tenant that already burned
  // their daily ceiling would get a fresh budget every time tsx-watch
  // bounces the kernel.
  const restoredToday = await costLedger.todayByTenant();
  budget.restoreToday(restoredToday);
  if (restoredToday.size > 0) {
    logger.info(
      { tenants: restoredToday.size },
      'budget.restored',
    );
  }
  const router = new AIRouter(drivers, budget, logger, {
    fallbackDriver: cfg.ANTHROPIC_API_KEY ? 'anthropic' : 'mock',
  });
  router.setCostLedger(costLedger);
  const budgetAlerter = new BudgetAlerter({ db: dbCtx.db, bus, logger });
  router.setBudgetAlerter(budgetAlerter);

  const connectors = new ConnectorRegistry(logger);
  connectors.register(new TikTokConnector(cfg.TIKTOK_MODE));
  connectors.register(new MetaConnector({ platform: 'facebook', mode: cfg.META_MODE }));

  const oauth = new OAuthRegistry(logger);
  if (cfg.TIKTOK_CLIENT_KEY && cfg.TIKTOK_CLIENT_SECRET) {
    oauth.register(new TikTokOAuthProvider(cfg.TIKTOK_CLIENT_KEY, cfg.TIKTOK_CLIENT_SECRET));
  } else {
    oauth.register(new MockOAuthProvider('tiktok'));
  }
  if (cfg.META_APP_ID && cfg.META_APP_SECRET) {
    oauth.register(new MetaOAuthProvider(cfg.META_APP_ID, cfg.META_APP_SECRET));
  } else {
    oauth.register(new MockOAuthProvider('facebook'));
  }

  const credKey = await ensureCredentialKey(cfg.DATA_DIR, logger);
  const credentialKey = credKey.key;

  const tenantDriverFactory = new TenantDriverFactory({
    db: dbCtx.db,
    registry: drivers,
    credentialKey,
    logger,
  });
  router.setTenantFactory(tenantDriverFactory);

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
  // Build the catalog before we register syscalls so `plugins.list_available`
  // returns the scanned set immediately. Loading actual instances happens
  // after registration so plugin `onLoad` can hit syscalls.
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

  const schedulerLoop = createSchedulerLoop(dbCtx.db, queue, logger);
  schedulerLoop.start();

  // First-run bootstrap: if no install rows exist for the default tenant,
  // auto-install every catalog entry so fresh `pnpm dev` keeps the same
  // out-of-the-box behaviour as before the marketplace existed.
  await bootstrapDefaultInstalls(dbCtx.db, plugins, cfg.TENANT_DEFAULT_ID, logger);
  await loadInstalledPlugins(dbCtx.db, plugins, logger);

  const app = await buildHttp({
    logger,
    bus,
    syscalls,
    plugins,
    drivers,
    queue,
    budget,
    db: dbCtx.db,
    connectors,
    oauth,
    publicOrigin: cfg.KERNEL_PUBLIC_ORIGIN,
    cockpitOrigin: cfg.COCKPIT_ORIGIN,
    defaultTenantId: cfg.TENANT_DEFAULT_ID,
  });

  await app.listen({ host: cfg.KERNEL_HOST, port: cfg.KERNEL_PORT });
  logger.info({ port: cfg.KERNEL_PORT, bus: bus.name, queue: queue.name }, 'kernel.ready');

  const shutdown = async (signal: string): Promise<void> => {
    logger.info({ signal }, 'kernel.shutdown');
    await schedulerLoop.stop();
    await webhookDispatcher.stop();
    await plugins.stopAll();
    await app.close();
    await queue.stop();
    await bus.stop();
    await dbCtx.shutdown();
    await shutdownTelemetry();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

async function bootstrapDefaultInstalls(
  db: Awaited<ReturnType<typeof createDb>>['db'],
  loader: PluginLoader,
  tenantId: string,
  logger: import('pino').Logger,
): Promise<void> {
  const existing = await db
    .select({ name: tenant_plugins.plugin_name })
    .from(tenant_plugins)
    .where(eq(tenant_plugins.tenant_id, tenantId));
  if (existing.length > 0) return;
  const catalog = loader.catalogList();
  if (catalog.length === 0) return;
  await db.insert(tenant_plugins).values(
    catalog.map((c) => ({
      tenant_id: tenantId,
      plugin_name: c.name,
      plugin_version: c.version,
      enabled: 1,
    })),
  );
  logger.info({ tenant_id: tenantId, installed: catalog.length }, 'plugins.bootstrap.installed');
}

async function loadInstalledPlugins(
  db: Awaited<ReturnType<typeof createDb>>['db'],
  loader: PluginLoader,
  logger: import('pino').Logger,
): Promise<void> {
  // Each (tenant, plugin) install gets its own Agent instance — same
  // process, separate bus filter, separate syscall caller identity.
  const rows = await db
    .select({ tenant_id: tenant_plugins.tenant_id, name: tenant_plugins.plugin_name })
    .from(tenant_plugins)
    .where(eq(tenant_plugins.enabled, 1));
  for (const r of rows) {
    try {
      await loader.load(r.tenant_id, r.name);
    } catch (err) {
      logger.warn(
        { err, plugin: r.name, tenant_id: r.tenant_id },
        'plugins.boot.load_failed',
      );
    }
  }
  logger.info({ instances: rows.length }, 'plugins.boot.loaded');
}

async function ensureDefaultTenant(
  db: Awaited<ReturnType<typeof createDb>>['db'],
  id: string,
  logger: { info: (obj: unknown, msg?: string) => void },
): Promise<void> {
  const existing = await db.select({ id: tenants.id }).from(tenants).where(eq(tenants.id, id)).limit(1);
  if (existing.length === 0) {
    await db.insert(tenants).values({ id, slug: 'default', tier: 'solo' });
    logger.info({ tenant_id: id }, 'kernel.default-tenant.created');
  }
  const quota = await db
    .select({ tenant_id: tenant_quotas.tenant_id })
    .from(tenant_quotas)
    .where(eq(tenant_quotas.tenant_id, id))
    .limit(1);
  if (quota.length === 0) {
    await db.insert(tenant_quotas).values({ tenant_id: id });
    logger.info({ tenant_id: id }, 'kernel.default-quota.created');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
