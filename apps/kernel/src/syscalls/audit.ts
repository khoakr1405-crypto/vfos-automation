import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { z } from 'zod';
import { audit_log } from '@vfos/db';
import type { DbHandle } from '../db/client.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface AuditSyscallDeps {
  db: DbHandle;
}

const ListInput = z.object({
  limit: z.number().int().min(1).max(500).default(100),
  action: z.string().optional(),
  status: z.enum(['ok', 'error']).optional(),
  // Caller can scope to a specific tenant when they're admin; tenant
  // tokens always get filtered to their own tenant_id below.
  tenant_id: z.string().uuid().nullable().optional(),
  since: z.string().datetime().optional(),
});

const SummaryInput = z.object({
  hours: z.number().int().min(1).max(24 * 30).default(24),
});

interface AuditRow {
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

function toRow(r: typeof audit_log.$inferSelect): AuditRow {
  return {
    id: r.id,
    tenant_id: r.tenant_id,
    actor: r.actor,
    action: r.action,
    target: r.target,
    payload: r.payload,
    status: r.status,
    error: r.error,
    trace_id: r.trace_id,
    duration_ms: r.duration_ms,
    at: r.at.toISOString(),
  };
}

export function makeAuditSyscalls(deps: AuditSyscallDeps): readonly SyscallSpec[] {
  const list: SyscallSpec = {
    name: 'audit.list',
    description: 'Recent audit_log entries, filterable by action/status/tenant/time.',
    requiredScope: 'tenant.read',
    handler: async (ctx, raw) => {
      const args = ListInput.parse(raw);
      const filters = [];
      // Tenant tokens see only their own audit trail. Admin tokens (no
      // tenant_id in ctx) can override via args.tenant_id.
      if (ctx.tenant_id) {
        filters.push(eq(audit_log.tenant_id, ctx.tenant_id));
      } else if (args.tenant_id === null) {
        filters.push(isNull(audit_log.tenant_id));
      } else if (typeof args.tenant_id === 'string') {
        filters.push(eq(audit_log.tenant_id, args.tenant_id));
      }
      if (args.action) filters.push(eq(audit_log.action, args.action));
      if (args.status) filters.push(eq(audit_log.status, args.status));
      if (args.since) filters.push(gte(audit_log.at, new Date(args.since)));
      const rows = await deps.db
        .select()
        .from(audit_log)
        .where(filters.length ? and(...filters) : undefined)
        .orderBy(desc(audit_log.at))
        .limit(args.limit);
      return { rows: rows.map(toRow), filtered: filters.length > 0 };
    },
  };

  const summary: SyscallSpec = {
    name: 'audit.summary',
    description: 'Count audit entries by action over the last N hours (tenant-scoped).',
    requiredScope: 'tenant.read',
    handler: async (ctx, raw) => {
      const args = SummaryInput.parse(raw);
      const since = new Date(Date.now() - args.hours * 3600 * 1000);
      const filters = [gte(audit_log.at, since), lte(audit_log.at, new Date())];
      if (ctx.tenant_id) filters.push(eq(audit_log.tenant_id, ctx.tenant_id));
      const rows = await deps.db
        .select({
          action: audit_log.action,
          status: audit_log.status,
          n: sql<number>`COUNT(*)`,
        })
        .from(audit_log)
        .where(and(...filters))
        .groupBy(audit_log.action, audit_log.status)
        .orderBy(desc(sql`COUNT(*)`));
      return {
        hours: args.hours,
        rows: rows.map((r) => ({
          action: r.action,
          status: r.status,
          // PG returns count as string in jsonb; coerce here.
          n: Number(r.n),
        })),
      };
    },
  };

  return [list, summary];
}
