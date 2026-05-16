import { z } from 'zod';
import type { CostLedger } from '../ai/cost-ledger.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface CostsSyscallDeps {
  ledger: CostLedger;
}

const SummaryInput = z.object({
  days: z.number().int().min(1).max(180).default(30),
});

const TopInput = z.object({
  limit: z.number().int().min(1).max(100).default(25),
});

export function makeCostsSyscalls(deps: CostsSyscallDeps): readonly SyscallSpec[] {
  const summary: SyscallSpec = {
    name: 'costs.summary',
    description: 'Per-day LLM cost history for the caller tenant (most-recent first).',
    requiredScope: 'tenant.read',
    handler: async (ctx, raw) => {
      const args = SummaryInput.parse(raw);
      const rows = await deps.ledger.summary(ctx.tenant_id, args.days);
      const total_cents = rows.reduce((s, r) => s + r.cents, 0);
      const total_calls = rows.reduce((s, r) => s + r.calls, 0);
      return { rows, total_cents, total_calls, days: args.days };
    },
  };

  const topToday: SyscallSpec = {
    name: 'costs.top_today',
    description: 'Top tenants by LLM spend today — admin scope (cross-tenant view).',
    requiredScope: 'tenant.admin',
    handler: async (_ctx, raw) => {
      const args = TopInput.parse(raw);
      const rows = await deps.ledger.topToday(args.limit);
      const total_cents = rows.reduce((s, r) => s + r.cents, 0);
      return { rows, total_cents, date: new Date().toISOString().slice(0, 10) };
    },
  };

  return [summary, topToday];
}
