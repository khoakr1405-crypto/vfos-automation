import type { Logger } from 'pino';
import { budget_alerts_daily } from '@vfos/db';
import type { EventBus } from '../bus/types.js';
import type { DbHandle } from '../db/client.js';

type AlertLevel = 'warn_80' | 'exceeded';

const WARN_AT = 0.8;

export interface BudgetAlerterDeps {
  db: DbHandle;
  bus: EventBus;
  logger: Logger;
}

export interface BudgetAlertPayload {
  tenant_id: string;
  date: string;
  spent_cents: number;
  ceiling_cents: number;
  pct: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class BudgetAlerter {
  constructor(private readonly deps: BudgetAlerterDeps) {}

  /**
   * Inspect a post-record snapshot — if the tenant just crossed an alert
   * threshold (and we haven't already fired that threshold today), insert
   * the dedupe row and publish a budget alert event. INSERT ON CONFLICT
   * guarantees idempotency across kernel restarts: if the row already
   * exists, no event is emitted.
   */
  async maybeFire(tenantId: string, spentCents: number, ceilingCents: number): Promise<void> {
    if (ceilingCents <= 0) return;
    const triggered: AlertLevel[] = [];
    if (spentCents >= ceilingCents) triggered.push('exceeded');
    else if (spentCents >= Math.floor(ceilingCents * WARN_AT)) triggered.push('warn_80');
    if (triggered.length === 0) return;

    for (const level of triggered) {
      try {
        const inserted = await this.deps.db
          .insert(budget_alerts_daily)
          .values({
            tenant_id: tenantId,
            date: today(),
            level,
            spent_cents: spentCents,
            ceiling_cents: ceilingCents,
          })
          .onConflictDoNothing()
          .returning({ level: budget_alerts_daily.level });
        if (inserted.length === 0) continue;
        const payload: BudgetAlertPayload = {
          tenant_id: tenantId,
          date: today(),
          spent_cents: spentCents,
          ceiling_cents: ceilingCents,
          pct: Math.round((spentCents / ceilingCents) * 100),
        };
        await this.deps.bus.publish({
          schema: level === 'exceeded' ? 'budget.exceeded.v1' : 'budget.warn.v1',
          tenant_id: tenantId,
          emitter: 'kernel:budget-alerter',
          payload,
        });
        this.deps.logger.warn(
          { tenant_id: tenantId, level, spent_cents: spentCents, ceiling_cents: ceilingCents },
          'budget.alert.fired',
        );
      } catch (err) {
        this.deps.logger.error(
          { err, tenant_id: tenantId, level },
          'budget.alert.fire_failed',
        );
      }
    }
  }
}
