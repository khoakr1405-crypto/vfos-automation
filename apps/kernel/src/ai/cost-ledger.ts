import { and, desc, eq, gte, sql } from 'drizzle-orm';
import type { Logger } from 'pino';
import { tenant_cost_daily, tenants } from '@vfos/db';
import type { DbHandle } from '../db/client.js';

export interface CostSummaryRow {
  date: string;
  cents: number;
  calls: number;
  models: Record<string, number>;
}

export interface TopTenantRow {
  tenant_id: string;
  slug: string | null;
  cents: number;
  calls: number;
}

export interface CostLedgerDeps {
  db: DbHandle;
  logger: Logger;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export class CostLedger {
  constructor(private readonly deps: CostLedgerDeps) {}

  /**
   * Add a cost entry to the per-tenant daily bucket. Uses ON CONFLICT
   * with raw expressions for cents/calls so concurrent records from
   * different syscalls compose without read-modify-write races.
   */
  async record(tenantId: string, costCents: number, model: string): Promise<void> {
    if (costCents <= 0) return;
    const date = today();
    const seedModels: Record<string, number> = { [model]: costCents };
    try {
      await this.deps.db
        .insert(tenant_cost_daily)
        .values({
          tenant_id: tenantId,
          date,
          cents: costCents,
          calls: 1,
          models: seedModels,
        })
        .onConflictDoUpdate({
          target: [tenant_cost_daily.tenant_id, tenant_cost_daily.date],
          set: {
            cents: sql`${tenant_cost_daily.cents} + ${costCents}`,
            calls: sql`${tenant_cost_daily.calls} + 1`,
            // Merge {model: existing + delta} via jsonb_set into the
            // existing column. Wrapped in COALESCE so first-time models
            // start at 0.
            models: sql`jsonb_set(
              ${tenant_cost_daily.models},
              ARRAY[${model}],
              to_jsonb(COALESCE((${tenant_cost_daily.models}->>${model})::int, 0) + ${costCents})
            )`,
            updated_at: new Date(),
          },
        });
    } catch (err) {
      // Cost telemetry is best-effort — a DB hiccup must NOT propagate
      // back into the LLM call path. Log and move on.
      this.deps.logger.error(
        { err, tenant_id: tenantId, cost_cents: costCents, model },
        'cost_ledger.record_failed',
      );
    }
  }

  /**
   * Restore today's cents for every tenant — called at boot so the
   * in-memory BudgetGuard re-establishes its hard-stop behaviour after
   * a kernel restart.
   */
  async todayByTenant(): Promise<Map<string, number>> {
    const date = today();
    const rows = await this.deps.db
      .select({ tenant_id: tenant_cost_daily.tenant_id, cents: tenant_cost_daily.cents })
      .from(tenant_cost_daily)
      .where(eq(tenant_cost_daily.date, date));
    const out = new Map<string, number>();
    for (const r of rows) out.set(r.tenant_id, r.cents);
    return out;
  }

  /**
   * Per-tenant history (most-recent first). Caller scopes to its own
   * tenant_id via syscall ctx so RLS / authz isn't needed here.
   */
  async summary(tenantId: string, days = 30): Promise<readonly CostSummaryRow[]> {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const rows = await this.deps.db
      .select()
      .from(tenant_cost_daily)
      .where(and(eq(tenant_cost_daily.tenant_id, tenantId), gte(tenant_cost_daily.date, cutoff)))
      .orderBy(desc(tenant_cost_daily.date));
    return rows.map((r) => ({
      date: r.date,
      cents: r.cents,
      calls: r.calls,
      models: r.models,
    }));
  }

  /**
   * Top spenders today across all tenants — admin-only view.
   */
  async topToday(limit = 25): Promise<readonly TopTenantRow[]> {
    const date = today();
    const rows = await this.deps.db
      .select({
        tenant_id: tenant_cost_daily.tenant_id,
        slug: tenants.slug,
        cents: tenant_cost_daily.cents,
        calls: tenant_cost_daily.calls,
      })
      .from(tenant_cost_daily)
      .leftJoin(tenants, eq(tenants.id, tenant_cost_daily.tenant_id))
      .where(eq(tenant_cost_daily.date, date))
      .orderBy(desc(tenant_cost_daily.cents))
      .limit(limit);
    return rows;
  }
}
