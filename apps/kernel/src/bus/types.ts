import type { KernelEvent } from '@vfos/sdk';

export interface PublishParams<T> {
  schema: string;
  tenant_id: string;
  emitter: string;
  trace_id?: string;
  payload: T;
  meta?: Record<string, unknown>;
}

export type EventHandler<T = unknown> = (event: KernelEvent<T>) => Promise<void>;

export interface EventBus {
  readonly name: string;
  start(): Promise<void>;
  stop(): Promise<void>;
  publish<T>(params: PublishParams<T>): Promise<KernelEvent<T>>;
  subscribe<T = unknown>(schema: string, handler: EventHandler<T>): () => void;
  /**
   * Subscribe to every event regardless of schema. Used by the webhook
   * dispatcher so it can match against schema lists at delivery time
   * without having to re-attach when those lists change.
   */
  subscribeAll(handler: EventHandler): () => void;
  getRecentEvents(limit?: number): readonly KernelEvent[];
}
