import { SpanKind } from '@opentelemetry/api';
import { createHmac } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { eq, sql as drizzleSql } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { KernelEvent } from '@vfos/sdk';
import { webhooks } from '@vfos/db';
import type { EventBus } from '../bus/types.js';
import { decryptToken } from '../connectors/envelope.js';
import type { DbHandle } from '../db/client.js';
import { instruments } from '../telemetry/instruments.js';
import { withSpan } from '../telemetry/tracer.js';

const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [200, 800, 2400] as const;
const REQUEST_TIMEOUT_MS = 5000;
const WILDCARD = '*';

export interface WebhookDispatcherDeps {
  db: DbHandle;
  bus: EventBus;
  credentialKey: string;
  logger: Logger;
}

interface CachedWebhook {
  id: string;
  tenant_id: string;
  url: string;
  schemas: readonly string[];
}

export class WebhookDispatcher {
  // Snapshot of enabled webhooks loaded at boot + on `refresh()`. The Map key
  // is the webhook id, so create/update can splice in place without
  // re-fetching the whole table on every event.
  private readonly cache = new Map<string, CachedWebhook>();
  private unsubscribe: (() => void) | null = null;

  constructor(private readonly deps: WebhookDispatcherDeps) {}

  async start(): Promise<void> {
    await this.refresh();
    this.unsubscribe = this.deps.bus.subscribeAll(async (event) => {
      // Fire-and-forget per-webhook delivery so a slow receiver doesn't block
      // the bus from acking subsequent events.
      void this.handleEvent(event);
    });
    this.deps.logger.info({ webhooks: this.cache.size }, 'webhooks.dispatcher.start');
  }

  async stop(): Promise<void> {
    if (this.unsubscribe) {
      this.unsubscribe();
      this.unsubscribe = null;
    }
    this.cache.clear();
    this.deps.logger.info('webhooks.dispatcher.stop');
  }

  /**
   * Reload the enabled-webhook snapshot from the DB. Cheap (1 query, no joins)
   * — called on every create/update/delete syscall so changes apply
   * immediately without restarting the dispatcher.
   */
  async refresh(): Promise<void> {
    const rows = await this.deps.db
      .select({
        id: webhooks.id,
        tenant_id: webhooks.tenant_id,
        url: webhooks.url,
        schemas: webhooks.schemas,
        enabled: webhooks.enabled,
      })
      .from(webhooks);
    this.cache.clear();
    for (const r of rows) {
      if (r.enabled !== 1) continue;
      this.cache.set(r.id, {
        id: r.id,
        tenant_id: r.tenant_id,
        url: r.url,
        schemas: r.schemas ?? [],
      });
    }
  }

  size(): number {
    return this.cache.size;
  }

  private async handleEvent(event: KernelEvent): Promise<void> {
    if (this.cache.size === 0) return;
    for (const wh of this.cache.values()) {
      if (wh.tenant_id !== event.tenant_id) continue;
      const schemas = wh.schemas;
      if (schemas.length === 0) continue;
      if (!schemas.includes(WILDCARD) && !schemas.includes(event.schema)) continue;
      void this.deliver(wh, event);
    }
  }

  private async deliver(wh: CachedWebhook, event: KernelEvent): Promise<void> {
    // Fetch the latest secret + url from DB instead of cache to honour edits
    // mid-flight, and to avoid keeping plaintext secrets in process memory.
    const rows = await this.deps.db
      .select({ secret_enc: webhooks.secret_enc, url: webhooks.url })
      .from(webhooks)
      .where(eq(webhooks.id, wh.id))
      .limit(1);
    const row = rows[0];
    if (!row) return;
    let secret: string;
    try {
      secret = decryptToken(row.secret_enc, this.deps.credentialKey);
    } catch (err) {
      this.deps.logger.error({ err, webhook_id: wh.id }, 'webhooks.secret.decrypt_failed');
      await this.recordFailure(wh.id, 0, 'secret decrypt failed');
      return;
    }
    const body = JSON.stringify(event);
    const signature = createHmac('sha256', secret).update(body).digest('hex');

    await withSpan(
      `webhook.deliver ${event.schema}`,
      {
        kind: SpanKind.CLIENT,
        attributes: {
          'vfos.webhook.id': wh.id,
          'vfos.webhook.url': row.url,
          'vfos.event.schema': event.schema,
          'vfos.event.id': event.event_id,
          'vfos.tenant_id': wh.tenant_id,
        },
      },
      async (span) => {
        let attempt = 0;
        let lastError: string | null = null;
        let lastStatus: number | null = null;
        while (attempt < MAX_ATTEMPTS) {
          attempt += 1;
          try {
            const res = await fetch(row.url, {
              method: 'POST',
              signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
              headers: {
                'content-type': 'application/json',
                'user-agent': 'vfos-webhook/1.0',
                'x-vfos-event-id': event.event_id,
                'x-vfos-event-schema': event.schema,
                'x-vfos-signature': `sha256=${signature}`,
                'x-vfos-delivery-attempt': String(attempt),
              },
              body,
            });
            lastStatus = res.status;
            if (res.status >= 200 && res.status < 300) {
              span.setAttributes({
                'http.response.status_code': res.status,
                'vfos.webhook.attempt': attempt,
                'vfos.webhook.outcome': 'delivered',
              });
              instruments().webhook_deliveries_total.add(1, {
                outcome: 'delivered',
                schema: event.schema,
              });
              await this.recordSuccess(wh.id, res.status);
              return;
            }
            lastError = `HTTP ${res.status}`;
          } catch (err) {
            lastError = err instanceof Error ? err.message : String(err);
          }
          if (attempt < MAX_ATTEMPTS) {
            await sleep(BACKOFF_MS[attempt - 1] ?? 1000);
          }
        }
        span.setAttributes({
          'vfos.webhook.attempt': attempt,
          'vfos.webhook.outcome': 'failed',
          ...(lastStatus !== null ? { 'http.response.status_code': lastStatus } : {}),
        });
        instruments().webhook_deliveries_total.add(1, {
          outcome: 'failed',
          schema: event.schema,
        });
        await this.recordFailure(wh.id, lastStatus ?? 0, lastError ?? 'unknown');
      },
    );
  }

  private async recordSuccess(id: string, status: number): Promise<void> {
    await this.deps.db
      .update(webhooks)
      .set({
        last_called_at: new Date(),
        last_status: status,
        last_error: null,
        delivered_count: sqlIncr('delivered_count'),
      })
      .where(eq(webhooks.id, id));
  }

  private async recordFailure(id: string, status: number, error: string): Promise<void> {
    await this.deps.db
      .update(webhooks)
      .set({
        last_called_at: new Date(),
        last_status: status,
        last_error: error.slice(0, 500),
        failed_count: sqlIncr('failed_count'),
      })
      .where(eq(webhooks.id, id));
  }
}

// Drizzle-Postgres incremental update helper. PGlite supports the same
// `column + N` expression — we use the raw SQL escape hatch.
function sqlIncr(column: 'delivered_count' | 'failed_count') {
  return drizzleSql.raw(`${column} + 1`);
}
