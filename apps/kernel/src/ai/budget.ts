import type { Logger } from 'pino';
import { instruments } from '../telemetry/instruments.js';

export class BudgetExceededError extends Error {
  readonly spent_cents: number;
  readonly ceiling_cents: number;
  readonly tenant_id: string;
  constructor(tenant_id: string, spent_cents: number, ceiling_cents: number) {
    super(
      `budget exceeded for tenant ${tenant_id}: spent=${spent_cents}c, ceiling=${ceiling_cents}c`,
    );
    this.name = 'BudgetExceededError';
    this.tenant_id = tenant_id;
    this.spent_cents = spent_cents;
    this.ceiling_cents = ceiling_cents;
  }
}

interface TenantBudget {
  date: string;
  spent_cents: number;
  ceiling_cents: number;
  blocked: boolean;
  warned_80: boolean;
}

const WARN_AT = 0.8;

export class BudgetGuard {
  private readonly tenants = new Map<string, TenantBudget>();
  private readonly defaultCeilingCents: number;

  constructor(
    private readonly logger: Logger,
    opts: { defaultDailyCeilingUsd?: number } = {},
  ) {
    this.defaultCeilingCents = Math.ceil((opts.defaultDailyCeilingUsd ?? 5) * 100);
  }

  /**
   * Seed today's spend from a persisted source so a kernel restart
   * doesn't reset the daily ceiling tracking back to zero.
   */
  restoreToday(byTenant: ReadonlyMap<string, number>): void {
    for (const [tenant_id, cents] of byTenant) {
      const slot = this.slot(tenant_id);
      slot.spent_cents = cents;
      slot.blocked = slot.spent_cents >= slot.ceiling_cents;
      slot.warned_80 = slot.spent_cents > slot.ceiling_cents * WARN_AT;
    }
  }

  setCeiling(tenant_id: string, ceilingUsd: number): void {
    const slot = this.slot(tenant_id);
    slot.ceiling_cents = Math.ceil(ceilingUsd * 100);
    // A higher ceiling can unblock; a lower one re-enables block if exceeded.
    slot.blocked = slot.spent_cents >= slot.ceiling_cents;
  }

  /**
   * Hard-stop: throws BudgetExceededError if the tenant has already blown
   * its daily ceiling. Optionally check projected_cents for pre-flight
   * checks (e.g. estimated max LLM cost).
   */
  checkOrThrow(tenant_id: string, projected_cents = 0): void {
    const slot = this.slot(tenant_id);
    if (slot.blocked || slot.spent_cents + projected_cents > slot.ceiling_cents) {
      instruments().budget_blocks_total.add(1, { tenant_id });
      throw new BudgetExceededError(tenant_id, slot.spent_cents, slot.ceiling_cents);
    }
  }

  record(tenant_id: string, cost_cents: number): void {
    const slot = this.slot(tenant_id);
    slot.spent_cents += cost_cents;
    if (slot.spent_cents >= slot.ceiling_cents && !slot.blocked) {
      slot.blocked = true;
      instruments().budget_blocks_total.add(1, { tenant_id, event: 'crossed' });
      this.logger.error(
        { tenant_id, spent: slot.spent_cents, ceiling: slot.ceiling_cents },
        'budget.exceeded.hard_stop',
      );
    } else if (
      !slot.warned_80 &&
      slot.spent_cents > slot.ceiling_cents * WARN_AT
    ) {
      slot.warned_80 = true;
      this.logger.warn(
        { tenant_id, spent: slot.spent_cents, ceiling: slot.ceiling_cents },
        'budget.warn.80pct',
      );
    }
  }

  snapshot(tenant_id: string): Readonly<Omit<TenantBudget, 'warned_80'>> {
    const slot = this.slot(tenant_id);
    return {
      date: slot.date,
      spent_cents: slot.spent_cents,
      ceiling_cents: slot.ceiling_cents,
      blocked: slot.blocked,
    };
  }

  private slot(tenant_id: string): TenantBudget {
    const today = new Date().toISOString().slice(0, 10);
    const existing = this.tenants.get(tenant_id);
    if (existing && existing.date === today) return existing;
    const fresh: TenantBudget = {
      date: today,
      spent_cents: 0,
      ceiling_cents: existing?.ceiling_cents ?? this.defaultCeilingCents,
      blocked: false,
      warned_80: false,
    };
    this.tenants.set(tenant_id, fresh);
    return fresh;
  }
}
