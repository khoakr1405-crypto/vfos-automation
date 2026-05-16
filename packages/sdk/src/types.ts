import type { Logger } from 'pino';

export interface KernelEvent<T = unknown> {
  event_id: string;
  trace_id: string;
  tenant_id: string;
  emitted_at: string;
  emitter: string;
  schema: string;
  payload: T;
  // Free-form provenance the bus passes through to subscribers. Used for
  // `{ replay: true, original_event_id, original_emitted_at }` on replayed
  // events so handlers can opt-out via `if (event.meta?.replay) return`.
  meta?: Record<string, unknown>;
}

export type SyscallHandler = (
  ctx: SyscallContext,
  args: unknown,
) => Promise<unknown>;

export interface SyscallContext {
  tenant_id: string;
  trace_id: string;
  caller: string;
  logger: Logger;
}

export interface AgentContext {
  tenant_id: string;
  trace_id: string;
  logger: Logger;
  config: ReadonlyMap<string, unknown>;
  secrets: Readonly<Record<string, string>>;
  syscall: <T = unknown>(name: string, args: unknown) => Promise<T>;
  emit: <T = unknown>(schema: string, payload: T) => Promise<void>;
  subscribe: <T = unknown>(
    schema: string,
    handler: (event: KernelEvent<T>) => Promise<void>,
  ) => void;
}

export interface AgentMeta {
  name: string;
  version: string;
  scopes: string[];
  schedule?: { cron?: string; intervalMs?: number };
  // Opt out of replayed events (events with `meta.replay === true`). When
  // true, the loader wraps every `ctx.subscribe` handler with a filter
  // that drops replays before they reach agent code. Use for handlers
  // that are not safe to invoke twice (renders, publishes, billable
  // LLM calls).
  ignore_replays?: boolean;
  // JSON Schema (subset) describing the per-tenant config object the
  // agent reads from ctx.config. The kernel uses this to validate
  // plugins.install / plugins.update_config payloads and to render a
  // typed form in the cockpit. Supported field types: number, integer,
  // string, boolean, with minimum/maximum/minLength/maxLength/enum and
  // default. Top-level must be `{ type: 'object', properties: {...} }`.
  configSchema?: AgentConfigSchema;
}

export interface AgentConfigSchema {
  type: 'object';
  properties: Record<string, AgentConfigField>;
  required?: string[];
}

export type AgentConfigField =
  | {
      type: 'number' | 'integer';
      minimum?: number;
      maximum?: number;
      default?: number;
      description?: string;
    }
  | {
      type: 'string';
      minLength?: number;
      maxLength?: number;
      enum?: readonly string[];
      default?: string;
      description?: string;
    }
  | {
      type: 'boolean';
      default?: boolean;
      description?: string;
    };
