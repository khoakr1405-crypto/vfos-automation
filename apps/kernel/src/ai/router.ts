import { SpanKind } from '@opentelemetry/api';
import type { Logger } from 'pino';
import type {
  LLMCompletionResponse,
  LLMIntent,
} from '@vfos/sdk';
import type { DriverRegistry } from '../drivers/registry.js';
import { instruments } from '../telemetry/instruments.js';
import { withSpan } from '../telemetry/tracer.js';
import type { BudgetAlerter } from './budget-alerter.js';
import type { BudgetGuard } from './budget.js';
import type { CostLedger } from './cost-ledger.js';
import type { TenantDriverFactory } from './tenant-driver-factory.js';

interface Route {
  driver: string;
  model: string;
  max_tokens: number;
  cache_system: boolean;
}

const DEFAULT_ROUTE_TABLE: Readonly<Record<LLMIntent, Route>> = {
  editorial_rewrite: {
    driver: 'anthropic',
    model: 'claude-opus-4-7',
    max_tokens: 1500,
    cache_system: true,
  },
  caption_hook: {
    driver: 'anthropic',
    model: 'claude-sonnet-4-6',
    max_tokens: 300,
    cache_system: true,
  },
  classify_niche: {
    driver: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 150,
    cache_system: true,
  },
  policy_check: {
    driver: 'anthropic',
    model: 'claude-opus-4-7',
    max_tokens: 600,
    cache_system: true,
  },
  tool_loop: {
    driver: 'anthropic',
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 800,
    cache_system: true,
  },
};

export interface RunRequest {
  intent: LLMIntent;
  system: string;
  user: string;
  tenant_id: string;
  json_schema?: Record<string, unknown>;
}

export class AIRouter {
  private readonly routeTable: Readonly<Record<LLMIntent, Route>>;
  private tenantFactory: TenantDriverFactory | null = null;
  private costLedger: CostLedger | null = null;
  private alerter: BudgetAlerter | null = null;

  constructor(
    private readonly registry: DriverRegistry,
    private readonly budget: BudgetGuard,
    private readonly logger: Logger,
    opts: {
      fallbackDriver?: string;
      routeOverrides?: Partial<Record<LLMIntent, Partial<Route>>>;
    } = {},
  ) {
    const merged: Record<LLMIntent, Route> = { ...DEFAULT_ROUTE_TABLE };
    for (const [intent, override] of Object.entries(opts.routeOverrides ?? {})) {
      const key = intent as LLMIntent;
      merged[key] = { ...merged[key], ...override };
    }
    if (opts.fallbackDriver) {
      for (const key of Object.keys(merged) as LLMIntent[]) {
        if (!this.registry.has(merged[key].driver)) {
          this.logger.warn(
            { intent: key, missing: merged[key].driver, fallback: opts.fallbackDriver },
            'router.driver.fallback',
          );
          merged[key] = { ...merged[key], driver: opts.fallbackDriver };
        }
      }
    }
    this.routeTable = merged;
  }

  routeFor(intent: LLMIntent): Readonly<Route> {
    return this.routeTable[intent];
  }

  hasDriver(name: string): boolean {
    return this.registry.has(name);
  }

  setTenantFactory(factory: TenantDriverFactory): void {
    this.tenantFactory = factory;
  }

  setCostLedger(ledger: CostLedger): void {
    this.costLedger = ledger;
  }

  setBudgetAlerter(alerter: BudgetAlerter): void {
    this.alerter = alerter;
  }

  /**
   * Resolve the driver instance for this (driver_name, tenant) pair —
   * exposed so syscalls + smoke can verify per-tenant routing without
   * having to actually fire a chat completion.
   */
  async driverFor(driverName: string, tenantId: string) {
    if (this.tenantFactory) return this.tenantFactory.resolve(driverName, tenantId);
    return this.registry.get(driverName);
  }

  async run(req: RunRequest): Promise<LLMCompletionResponse> {
    const route = this.routeTable[req.intent];
    this.budget.checkOrThrow(req.tenant_id);
    const driver = this.tenantFactory
      ? await this.tenantFactory.resolve(route.driver, req.tenant_id)
      : this.registry.get(route.driver);
    const start = performance.now();
    const reqOpts = {
      model: route.model,
      system: req.system,
      user: req.user,
      cache_system: route.cache_system,
      max_tokens: route.max_tokens,
      ...(req.json_schema ? { json_schema: req.json_schema } : {}),
    };
    const m = instruments();
    return withSpan(
      `llm.${req.intent}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'gen_ai.system': driver.name,
          'gen_ai.request.model': route.model,
          'gen_ai.request.intent': req.intent,
          'gen_ai.request.max_tokens': route.max_tokens,
          'gen_ai.request.cache_enabled': route.cache_system,
          'vfos.tenant_id': req.tenant_id,
          'vfos.llm.key_source':
            this.tenantFactory?.source(req.tenant_id, route.driver) ?? 'global',
        },
      },
      async (span) => {
        try {
          const res = await driver.complete(reqOpts);
          this.budget.record(req.tenant_id, res.cost_cents);
          // Persist for the per-tenant cost dashboard; fire-and-forget
          // so the LLM response isn't blocked on a DB write.
          if (this.costLedger) {
            void this.costLedger.record(req.tenant_id, res.cost_cents, res.model);
          }
          if (this.alerter) {
            const snap = this.budget.snapshot(req.tenant_id);
            void this.alerter.maybeFire(req.tenant_id, snap.spent_cents, snap.ceiling_cents);
          }
          span.setAttributes({
            'gen_ai.response.model': res.model,
            'gen_ai.usage.input_tokens': res.usage.input_tokens,
            'gen_ai.usage.cached_input_tokens': res.usage.cached_input_tokens,
            'gen_ai.usage.output_tokens': res.usage.output_tokens,
            'gen_ai.cost_cents': res.cost_cents,
          });
          const tags = { driver: driver.name, model: route.model, intent: req.intent };
          m.llm_calls_total.add(1, { ...tags, status: 'ok' });
          m.llm_tokens_total.add(res.usage.input_tokens, { ...tags, kind: 'input' });
          m.llm_tokens_total.add(res.usage.cached_input_tokens, { ...tags, kind: 'cached_input' });
          m.llm_tokens_total.add(res.usage.output_tokens, { ...tags, kind: 'output' });
          m.llm_cost_cents_total.add(res.cost_cents, { driver: driver.name, model: route.model });
          this.logger.debug(
            {
              intent: req.intent,
              driver: driver.name,
              model: route.model,
              tenant: req.tenant_id,
              cost_cents: res.cost_cents,
              ms: Math.round(performance.now() - start),
            },
            'router.ok',
          );
          return res;
        } catch (err) {
          m.llm_calls_total.add(1, {
            driver: driver.name,
            model: route.model,
            intent: req.intent,
            status: 'error',
          });
          this.logger.error(
            { err, intent: req.intent, driver: driver.name, tenant: req.tenant_id },
            'router.err',
          );
          throw err;
        }
      },
    );
  }
}
