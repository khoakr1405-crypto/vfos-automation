import { SpanKind } from '@opentelemetry/api';
import type { Logger } from 'pino';
import type { SyscallContext, SyscallHandler } from '@vfos/sdk';
import { type AuditLogger, extractTarget, redactArgs } from './audit.js';
import type { RateLimiter } from './rate-limit.js';
import { RateLimitError } from './rate-limit.js';
import { instruments } from './telemetry/instruments.js';
import { withSpan } from './telemetry/tracer.js';

export interface SyscallSpec {
  name: string;
  description: string;
  handler: SyscallHandler;
  requiredScope: string;
  // Mutating syscalls set this true so an audit_log row gets written
  // each invocation. Read-only syscalls (e.g. *.list, *.summary) leave
  // it false to keep the audit feed signal-rich.
  auditable?: boolean;
}

// Last segment of the syscall name determines whether a default opt-in
// to audit_log applies. Add new mutating verbs here when introducing
// new syscalls. Anything not in this set is treated as read-only.
const MUTATING_SUFFIXES = new Set([
  'create',
  'update',
  'delete',
  'install',
  'uninstall',
  'update_config',
  'set',
  'revoke',
  'link',
  'unlink',
  'replay',
  'test',
  'run_now',
  'quota.set',
  'enqueue',
  'put',
]);

function isMutating(name: string): boolean {
  const parts = name.split('.');
  // tenant.quota.set should match 'quota.set' too — check 2-segment tail.
  const last = parts[parts.length - 1] ?? '';
  const tail2 = parts.slice(-2).join('.');
  return MUTATING_SUFFIXES.has(last) || MUTATING_SUFFIXES.has(tail2);
}

export class SyscallRegistry {
  private readonly specs = new Map<string, SyscallSpec>();
  private rateLimiter: RateLimiter | null = null;
  private auditor: AuditLogger | null = null;

  constructor(private readonly logger: Logger) {}

  setRateLimiter(rl: RateLimiter | null): void {
    this.rateLimiter = rl;
  }

  setAuditor(auditor: AuditLogger | null): void {
    this.auditor = auditor;
  }

  register(spec: SyscallSpec): void {
    if (this.specs.has(spec.name)) {
      throw new Error(`syscall already registered: ${spec.name}`);
    }
    // Auto-mark mutating syscalls so each spec file doesn't have to
    // duplicate the flag. Read-only operations (e.g. *.list, *.summary,
    // *.get, *.list_available, *.top_today, *.bus, ai.test) stay
    // un-audited to keep the feed signal-rich.
    const final: SyscallSpec =
      spec.auditable === undefined
        ? { ...spec, auditable: isMutating(spec.name) }
        : spec;
    this.specs.set(spec.name, final);
    this.logger.info({ name: spec.name, auditable: final.auditable }, 'syscall.registered');
  }

  list(): readonly SyscallSpec[] {
    return [...this.specs.values()];
  }

  async invoke<T = unknown>(
    name: string,
    ctx: SyscallContext,
    args: unknown,
    callerScopes: readonly string[],
  ): Promise<T> {
    const spec = this.specs.get(name);
    if (!spec) throw new Error(`unknown syscall: ${name}`);
    if (!callerScopes.includes(spec.requiredScope) && !callerScopes.includes('*')) {
      throw new Error(
        `syscall denied: ${name} requires scope "${spec.requiredScope}", caller=${ctx.caller}`,
      );
    }
    const m = instruments();
    if (this.rateLimiter) {
      try {
        await this.rateLimiter.checkOrThrow(ctx.tenant_id);
      } catch (err) {
        if (err instanceof RateLimitError) {
          m.ratelimit_blocks_total.add(1, { tenant_id: ctx.tenant_id, syscall: name });
        }
        m.syscall_total.add(1, { name, status: 'rate_limited' });
        this.logger.warn(
          { name, tenant_id: ctx.tenant_id, caller: ctx.caller },
          'syscall.rate_limited',
        );
        throw err;
      }
    }
    const start = performance.now();
    return withSpan(
      `syscall.${name}`,
      {
        kind: SpanKind.INTERNAL,
        attributes: {
          'vfos.syscall.name': name,
          'vfos.tenant_id': ctx.tenant_id,
          'vfos.caller': ctx.caller,
          'vfos.scope.required': spec.requiredScope,
        },
      },
      async () => {
        try {
          const result = (await spec.handler(ctx, args)) as T;
          const ms = Math.round(performance.now() - start);
          m.syscall_total.add(1, { name, status: 'ok' });
          m.syscall_duration_ms.record(ms, { name });
          this.logger.debug({ name, caller: ctx.caller, ms }, 'syscall.ok');
          if (spec.auditable && this.auditor) {
            void this.auditor.record({
              tenant_id: ctx.tenant_id || null,
              actor: ctx.caller,
              action: name,
              target: extractTarget(args),
              payload: redactArgs(args),
              status: 'ok',
              error: null,
              trace_id: ctx.trace_id || null,
              duration_ms: ms,
            });
          }
          return result;
        } catch (err) {
          const ms = Math.round(performance.now() - start);
          m.syscall_total.add(1, { name, status: 'error' });
          m.syscall_duration_ms.record(ms, { name });
          this.logger.error({ err, name, caller: ctx.caller, ms }, 'syscall.err');
          if (spec.auditable && this.auditor) {
            void this.auditor.record({
              tenant_id: ctx.tenant_id || null,
              actor: ctx.caller,
              action: name,
              target: extractTarget(args),
              payload: redactArgs(args),
              status: 'error',
              error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
              trace_id: ctx.trace_id || null,
              duration_ms: ms,
            });
          }
          throw err;
        }
      },
    );
  }
}
