import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Logger } from 'pino';
import type { LLMDriver } from '@vfos/sdk';
import { tenant_keys } from '@vfos/db';
import { decryptToken } from '../connectors/envelope.js';
import type { DbHandle } from '../db/client.js';
import type { DriverRegistry } from '../drivers/registry.js';
import { AnthropicDriver } from '../drivers/anthropic.js';

interface CachedEntry {
  driver: LLMDriver;
  // Hash of the decrypted key — when the tenant rotates their key the
  // stored ciphertext changes and so does this hash, so we can detect
  // the change without re-instantiating on every call.
  key_hash: string;
}

export interface TenantDriverFactoryDeps {
  db: DbHandle;
  registry: DriverRegistry;
  credentialKey: string;
  logger: Logger;
}

export class TenantDriverFactory {
  private readonly cache = new Map<string, CachedEntry>();

  constructor(private readonly deps: TenantDriverFactoryDeps) {}

  /**
   * Return the driver instance that should service this (driver_name,
   * tenant_id) pair. Falls back to the global driver from the registry
   * when no tenant key is stored — keeps behaviour identical to v2.2 for
   * tenants that opted out of BYOK.
   */
  async resolve(driverName: string, tenantId: string): Promise<LLMDriver> {
    if (driverName !== 'anthropic') {
      return this.deps.registry.get(driverName);
    }
    const cacheKey = `${tenantId}::${driverName}`;
    const row = await this.lookup(tenantId, driverName);
    if (!row) {
      // Drop a cached tenant driver if the key was revoked / deleted.
      this.cache.delete(cacheKey);
      return this.deps.registry.get(driverName);
    }
    let plaintext: string;
    try {
      plaintext = decryptToken(row.api_key_enc, this.deps.credentialKey);
    } catch (err) {
      this.deps.logger.error(
        { err, tenant_id: tenantId, provider: driverName },
        'tenant_key.decrypt_failed',
      );
      this.cache.delete(cacheKey);
      return this.deps.registry.get(driverName);
    }
    const hash = createHash('sha256').update(plaintext).digest('hex');
    const cached = this.cache.get(cacheKey);
    if (cached && cached.key_hash === hash) return cached.driver;
    const driver = new AnthropicDriver(plaintext);
    this.cache.set(cacheKey, { driver, key_hash: hash });
    return driver;
  }

  /**
   * Drop any cached driver instance for this tenant — call after
   * `keys.set` or `keys.revoke` so the next resolve() rebuilds the
   * driver against the new ciphertext.
   */
  invalidate(tenantId: string, provider: string): void {
    this.cache.delete(`${tenantId}::${provider}`);
  }

  /**
   * Report whether the resolver currently uses a tenant-scoped driver
   * instance — used by the syscalls/test surface to assert per-tenant
   * routing took effect.
   */
  source(tenantId: string, driverName: string): 'tenant' | 'global' {
    return this.cache.has(`${tenantId}::${driverName}`) ? 'tenant' : 'global';
  }

  private async lookup(
    tenantId: string,
    provider: string,
  ): Promise<{ api_key_enc: string } | null> {
    const rows = await this.deps.db
      .select({ api_key_enc: tenant_keys.api_key_enc })
      .from(tenant_keys)
      .where(
        and(
          eq(tenant_keys.tenant_id, tenantId),
          eq(tenant_keys.provider, provider),
          isNull(tenant_keys.revoked_at),
        ),
      )
      .limit(1);
    return rows[0] ?? null;
  }
}
