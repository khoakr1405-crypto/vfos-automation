import { eq } from 'drizzle-orm';
import type { Logger } from 'pino';
import { tenant_quotas } from '@vfos/db';
import type { DbHandle } from './db/client.js';

export class RateLimitError extends Error {
  readonly retryAfterMs: number;
  constructor(message: string, retryAfterMs: number) {
    super(message);
    this.name = 'RateLimitError';
    this.retryAfterMs = retryAfterMs;
  }
}

interface Bucket {
  // Token bucket: tokens accrue at `capacity / 60` per second up to capacity.
  tokens: number;
  lastRefill: number;
}

interface Capacity {
  perMinute: number;
  fetchedAt: number;
}

const DEFAULT_PER_MINUTE = 600;
const CAPACITY_TTL_MS = 60_000;
// Reasonable hard ceiling so a wildly large quota doesn't allow a single burst
// to overwhelm the kernel. Daily-budget enforcement is a separate guard.
const MAX_PER_MINUTE = 10_000;

export class RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  private readonly capacityCache = new Map<string, Capacity>();
  private readonly defaultPerMinute: number;

  constructor(
    private readonly db: DbHandle,
    private readonly logger: Logger,
    opts: { defaultPerMinute?: number } = {},
  ) {
    this.defaultPerMinute = Math.min(
      MAX_PER_MINUTE,
      Math.max(1, opts.defaultPerMinute ?? DEFAULT_PER_MINUTE),
    );
  }

  /**
   * Test-only / admin: explicitly seed a capacity (skips DB lookup for this tenant).
   */
  setCapacity(tenant_id: string, perMinute: number): void {
    this.capacityCache.set(tenant_id, {
      perMinute: Math.min(MAX_PER_MINUTE, Math.max(1, perMinute)),
      fetchedAt: Date.now(),
    });
  }

  async checkOrThrow(tenant_id: string): Promise<void> {
    const capacity = await this.capacityFor(tenant_id);
    const now = Date.now();
    const bucket = this.bucketFor(tenant_id, capacity);
    // Refill: tokens accrue continuously based on time since last touch.
    const elapsed = now - bucket.lastRefill;
    const refillPerMs = capacity / 60_000;
    bucket.tokens = Math.min(capacity, bucket.tokens + elapsed * refillPerMs);
    bucket.lastRefill = now;
    if (bucket.tokens < 1) {
      const deficitMs = Math.ceil((1 - bucket.tokens) / refillPerMs);
      throw new RateLimitError(
        `rate limit exceeded for tenant ${tenant_id} (${capacity}/min); retry in ${deficitMs}ms`,
        deficitMs,
      );
    }
    bucket.tokens -= 1;
  }

  snapshot(tenant_id: string): { capacity_per_minute: number; tokens: number } {
    const cached = this.capacityCache.get(tenant_id);
    const capacity = cached?.perMinute ?? this.defaultPerMinute;
    const bucket = this.buckets.get(tenant_id);
    return {
      capacity_per_minute: capacity,
      tokens: Math.max(0, bucket?.tokens ?? capacity),
    };
  }

  private bucketFor(tenant_id: string, capacity: number): Bucket {
    const existing = this.buckets.get(tenant_id);
    if (existing) return existing;
    const fresh: Bucket = { tokens: capacity, lastRefill: Date.now() };
    this.buckets.set(tenant_id, fresh);
    return fresh;
  }

  private async capacityFor(tenant_id: string): Promise<number> {
    const cached = this.capacityCache.get(tenant_id);
    if (cached && Date.now() - cached.fetchedAt < CAPACITY_TTL_MS) {
      return cached.perMinute;
    }
    try {
      const rows = await this.db
        .select({ syscalls_per_minute: tenant_quotas.syscalls_per_minute })
        .from(tenant_quotas)
        .where(eq(tenant_quotas.tenant_id, tenant_id))
        .limit(1);
      const fromDb = rows[0]?.syscalls_per_minute;
      const perMinute = Math.min(
        MAX_PER_MINUTE,
        Math.max(1, fromDb ?? this.defaultPerMinute),
      );
      this.capacityCache.set(tenant_id, { perMinute, fetchedAt: Date.now() });
      return perMinute;
    } catch (err) {
      this.logger.warn({ err, tenant_id }, 'ratelimit.capacity_lookup_failed');
      return this.defaultPerMinute;
    }
  }
}
