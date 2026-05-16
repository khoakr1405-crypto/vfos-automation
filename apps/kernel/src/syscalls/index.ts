import type { CostLedger } from '../ai/cost-ledger.js';
import type { AIRouter } from '../ai/router.js';
import type { TenantDriverFactory } from '../ai/tenant-driver-factory.js';
import type { EventBus } from '../bus/types.js';
import type { ConnectorRegistry } from '../connectors/registry.js';
import type { DbHandle } from '../db/client.js';
import type { PluginLoader } from '../plugin-loader.js';
import type { JobQueue } from '../queue/types.js';
import type { RateLimiter } from '../rate-limit.js';
import type { BlobStore } from '../storage/blob.js';
import type { SyscallRegistry } from '../syscall-registry.js';
import type { WebhookDispatcher } from '../webhooks/dispatcher.js';
import { affiliateMatchSku } from './affiliate.js';
import { makeAiSyscalls } from './ai.js';
import { makeAuditSyscalls } from './audit.js';
import { makeComplianceSyscalls } from './compliance.js';
import { makeConnectorsSyscalls } from './connectors.js';
import { makeCostsSyscalls } from './costs.js';
import { makeEventsSyscalls } from './events.js';
import { makeFsSyscalls } from './fs.js';
import { makeInvitesSyscalls } from './invites.js';
import { makeKeysSyscalls } from './keys.js';
import { makePipelineSyscalls } from './pipeline.js';
import { makePluginsSyscalls } from './plugins.js';
import { makeSchedulerSyscalls } from './scheduler.js';
import { makeWebhooksSyscalls } from './webhooks.js';
import { makeQueueSyscalls } from './queue.js';
import { makeTenantSyscalls } from './tenant.js';
import { makeTokensSyscalls } from './tokens.js';
import { trendScore } from './trend.js';

export interface CoreSyscallCtx {
  router: AIRouter;
  queue: JobQueue;
  db: DbHandle;
  blob: BlobStore;
  bus: EventBus;
  connectors: ConnectorRegistry;
  credentialKey: string;
  rateLimiter?: RateLimiter;
  webhooks?: WebhookDispatcher;
  plugins?: PluginLoader;
  tenantDriverFactory?: TenantDriverFactory;
  costLedger?: CostLedger;
}

export function registerCoreSyscalls(registry: SyscallRegistry, ctx: CoreSyscallCtx): void {
  for (const spec of makeFsSyscalls({ db: ctx.db, blob: ctx.blob })) {
    registry.register(spec);
  }
  registry.register(trendScore);
  registry.register(affiliateMatchSku);
  for (const spec of makeAiSyscalls(ctx.router)) {
    registry.register(spec);
  }
  for (const spec of makeComplianceSyscalls(ctx.router)) {
    registry.register(spec);
  }
  for (const spec of makeQueueSyscalls(ctx.queue)) {
    registry.register(spec);
  }
  for (const spec of makeTenantSyscalls({
    db: ctx.db,
    ...(ctx.rateLimiter ? { rateLimiter: ctx.rateLimiter } : {}),
  })) {
    registry.register(spec);
  }
  for (const spec of makeTokensSyscalls({ db: ctx.db })) {
    registry.register(spec);
  }
  for (const spec of makeInvitesSyscalls({ db: ctx.db })) {
    registry.register(spec);
  }
  for (const spec of makeConnectorsSyscalls({
    db: ctx.db,
    bus: ctx.bus,
    connectors: ctx.connectors,
    credentialKey: ctx.credentialKey,
  })) {
    registry.register(spec);
  }
  for (const spec of makePipelineSyscalls({ syscalls: registry, bus: ctx.bus })) {
    registry.register(spec);
  }
  for (const spec of makeSchedulerSyscalls({ db: ctx.db })) {
    registry.register(spec);
  }
  if (ctx.webhooks) {
    for (const spec of makeWebhooksSyscalls({
      db: ctx.db,
      bus: ctx.bus,
      credentialKey: ctx.credentialKey,
      dispatcher: ctx.webhooks,
    })) {
      registry.register(spec);
    }
  }
  if (ctx.plugins) {
    for (const spec of makePluginsSyscalls({ db: ctx.db, loader: ctx.plugins })) {
      registry.register(spec);
    }
  }
  if (ctx.tenantDriverFactory) {
    for (const spec of makeKeysSyscalls({
      db: ctx.db,
      credentialKey: ctx.credentialKey,
      tenantDriverFactory: ctx.tenantDriverFactory,
    })) {
      registry.register(spec);
    }
  }
  if (ctx.costLedger) {
    for (const spec of makeCostsSyscalls({ ledger: ctx.costLedger })) {
      registry.register(spec);
    }
  }
  for (const spec of makeEventsSyscalls({ bus: ctx.bus })) {
    registry.register(spec);
  }
  for (const spec of makeAuditSyscalls({ db: ctx.db })) {
    registry.register(spec);
  }
}
