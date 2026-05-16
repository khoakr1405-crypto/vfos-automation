import { readFile, readdir, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { ulid } from 'ulid';
import type { Logger } from 'pino';
import {
  Agent,
  type AgentConfigSchema,
  type AgentContext,
  type AgentMeta,
  type KernelEvent,
} from '@vfos/sdk';
import { tenant_plugins } from '@vfos/db';
import type { EventBus } from './bus/types.js';
import type { DbHandle } from './db/client.js';
import type { SyscallRegistry } from './syscall-registry.js';

export interface CatalogEntry {
  name: string;
  version: string;
  scopes: readonly string[];
  description: string;
  source_path: string;
  configSchema?: AgentConfigSchema;
}

interface LoadedPlugin {
  tenant_id: string;
  meta: AgentMeta;
  agent: Agent;
  ctx: AgentContext;
  description: string;
  // Per-instance subscriptions so unload can detach them — without this,
  // subscribers keep firing after the agent is gone and start receiving
  // events for the wrong tenant on the next install.
  unsubscribes: Array<() => void>;
}

function instanceKey(tenantId: string, name: string): string {
  return `${tenantId}::${name}`;
}

export class PluginLoader {
  // The catalog is the static list of installable plugins discovered on disk.
  // `loaded` holds plugins that have actually been instantiated, keyed by
  // (tenant_id, plugin_name) so multi-tenant installs each get their own
  // Agent instance with tenant-scoped emit + subscribe.
  private readonly catalog = new Map<string, CatalogEntry>();
  private readonly loaded = new Map<string, LoadedPlugin>();
  private pluginsRoot: string | null = null;

  constructor(
    private readonly logger: Logger,
    private readonly bus: EventBus,
    private readonly syscalls: SyscallRegistry,
    private readonly db: DbHandle,
  ) {}

  /**
   * Scan the plugins directory and build the install catalog. Does NOT
   * load any plugin — call `load(tenant_id, name)` to instantiate one.
   * Idempotent; re-scanning replaces the catalog.
   */
  async scan(dir: string): Promise<readonly CatalogEntry[]> {
    const absDir = resolve(dir);
    this.pluginsRoot = absDir;
    this.catalog.clear();

    let entries: string[];
    try {
      entries = await readdir(absDir);
    } catch (err) {
      this.logger.warn({ err, dir: absDir }, 'plugins.dir.missing');
      return [];
    }

    for (const entry of entries) {
      if (entry.startsWith('_') || entry.startsWith('.')) continue;
      const pluginRoot = join(absDir, entry);
      const s = await stat(pluginRoot).catch(() => null);
      if (!s?.isDirectory()) continue;
      try {
        const meta = await this.readManifest(pluginRoot);
        this.catalog.set(meta.name, meta);
      } catch (err) {
        this.logger.warn({ err, plugin: entry }, 'plugin.catalog.skip');
      }
    }
    this.logger.info({ count: this.catalog.size }, 'plugins.catalog.scanned');
    return [...this.catalog.values()];
  }

  private async readManifest(pluginRoot: string): Promise<CatalogEntry> {
    const pkgPath = join(pluginRoot, 'package.json');
    const pkgRaw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as {
      name: string;
      version?: string;
      description?: string;
      main?: string;
      exports?: Record<string, { import?: string }>;
    };
    const entryRel = pkg.main ?? pkg.exports?.['.']?.import ?? 'src/index.ts';
    const entryAbs = join(pluginRoot, entryRel);
    const mod = (await import(pathToFileURL(entryAbs).href)) as Record<string, unknown>;
    const AgentCtor = findAgentExport(mod);
    if (!AgentCtor) throw new Error(`plugin ${pkg.name} has no Agent export`);
    const probe = new AgentCtor();
    return {
      name: probe.meta.name,
      version: probe.meta.version,
      scopes: probe.meta.scopes,
      description: pkg.description ?? '',
      source_path: pluginRoot,
      ...(probe.meta.configSchema ? { configSchema: probe.meta.configSchema } : {}),
    };
  }

  catalogList(): readonly CatalogEntry[] {
    return [...this.catalog.values()];
  }

  isLoaded(tenantId: string, name: string): boolean {
    return this.loaded.has(instanceKey(tenantId, name));
  }

  async load(tenantId: string, name: string): Promise<LoadedPlugin> {
    const key = instanceKey(tenantId, name);
    const existing = this.loaded.get(key);
    if (existing) return existing;
    const entry = this.catalog.get(name);
    if (!entry) throw new Error(`plugin not in catalog: ${name}`);

    const pkgPath = join(entry.source_path, 'package.json');
    const pkgRaw = await readFile(pkgPath, 'utf8');
    const pkg = JSON.parse(pkgRaw) as {
      main?: string;
      exports?: Record<string, { import?: string }>;
    };
    const entryRel = pkg.main ?? pkg.exports?.['.']?.import ?? 'src/index.ts';
    const entryAbs = join(entry.source_path, entryRel);
    const mod = (await import(pathToFileURL(entryAbs).href)) as Record<string, unknown>;
    const AgentCtor = findAgentExport(mod);
    if (!AgentCtor) throw new Error(`plugin ${name} has no Agent export`);

    // Pull persisted per-tenant config so the agent's onLoad/run can read
    // it via ctx.config. Empty Map when no row / no config — agents must
    // provide their own defaults.
    const config = await this.loadConfig(tenantId, name);
    const agent = new AgentCtor();
    const unsubscribes: Array<() => void> = [];
    const ctx = this.makeContext(agent.meta, tenantId, unsubscribes, config);
    const loaded: LoadedPlugin = {
      tenant_id: tenantId,
      meta: agent.meta,
      agent,
      ctx,
      description: entry.description,
      unsubscribes,
    };
    this.loaded.set(key, loaded);
    await agent.onLoad(ctx);
    void agent.run(ctx).catch((err) => {
      this.logger.error({ err, plugin: name, tenant_id: tenantId }, 'plugin.run.crashed');
    });
    this.logger.info(
      {
        plugin: name,
        version: agent.meta.version,
        tenant_id: tenantId,
        config_keys: [...config.keys()],
      },
      'plugin.loaded',
    );
    return loaded;
  }

  /**
   * Stop the existing instance and load it again so the agent's onLoad
   * re-captures the new config. Used by plugins.update_config — the
   * cheapest way to push config without a hot-reload protocol.
   */
  async reload(tenantId: string, name: string): Promise<LoadedPlugin> {
    if (this.isLoaded(tenantId, name)) {
      await this.unload(tenantId, name);
    }
    return this.load(tenantId, name);
  }

  /**
   * Read the `tenant_plugins.config` row for this (tenant, plugin) into
   * a Map. Agents see a read-only snapshot — mutations don't write back.
   */
  configFor(tenantId: string, name: string): ReadonlyMap<string, unknown> | null {
    const loaded = this.loaded.get(instanceKey(tenantId, name));
    return loaded?.ctx.config ?? null;
  }

  private async loadConfig(tenantId: string, name: string): Promise<Map<string, unknown>> {
    const rows = await this.db
      .select({ config: tenant_plugins.config })
      .from(tenant_plugins)
      .where(
        and(eq(tenant_plugins.tenant_id, tenantId), eq(tenant_plugins.plugin_name, name)),
      )
      .limit(1);
    const cfg = rows[0]?.config ?? {};
    return new Map(Object.entries(cfg));
  }

  async unload(tenantId: string, name: string): Promise<void> {
    const key = instanceKey(tenantId, name);
    const p = this.loaded.get(key);
    if (!p) return;
    try {
      await p.agent.onUnload(p.ctx);
    } catch (err) {
      this.logger.error({ err, plugin: name, tenant_id: tenantId }, 'plugin.unload.failed');
    }
    for (const unsub of p.unsubscribes) {
      try {
        unsub();
      } catch (err) {
        this.logger.error({ err, plugin: name }, 'plugin.unsubscribe.failed');
      }
    }
    this.loaded.delete(key);
    this.logger.info({ plugin: name, tenant_id: tenantId }, 'plugin.unloaded');
  }

  async stopAll(): Promise<void> {
    for (const [key, p] of [...this.loaded.entries()]) {
      try {
        await p.agent.onUnload(p.ctx);
      } catch (err) {
        this.logger.error({ err, plugin: p.meta.name }, 'plugin.unload.failed');
      }
      for (const unsub of p.unsubscribes) {
        try {
          unsub();
        } catch {
          /* swallow during shutdown */
        }
      }
      this.loaded.delete(key);
    }
  }

  list(): readonly LoadedPlugin[] {
    return [...this.loaded.values()];
  }

  listForTenant(tenantId: string): readonly LoadedPlugin[] {
    return [...this.loaded.values()].filter((p) => p.tenant_id === tenantId);
  }

  pluginsDir(): string | null {
    return this.pluginsRoot;
  }

  private makeContext(
    meta: AgentMeta,
    tenantId: string,
    unsubscribes: Array<() => void>,
    config: ReadonlyMap<string, unknown>,
  ): AgentContext {
    const childLogger = this.logger.child({ plugin: meta.name, tenant_id: tenantId });
    return {
      tenant_id: tenantId,
      trace_id: ulid(),
      logger: childLogger,
      config,
      secrets: {},
      syscall: async <T>(name: string, args: unknown): Promise<T> =>
        this.syscalls.invoke<T>(
          name,
          {
            tenant_id: tenantId,
            trace_id: ulid(),
            caller: `${meta.name}@${meta.version}`,
            logger: childLogger,
          },
          args,
          meta.scopes,
        ),
      emit: async (schema, payload) => {
        await this.bus.publish({
          schema,
          tenant_id: tenantId,
          emitter: `${meta.name}@${meta.version}`,
          payload,
        });
      },
      // Each tenant's agent should only react to its own tenant's events.
      // Without this filter, a per-tenant agent would handle every event
      // on the bus and the per-tenant install state would be cosmetic.
      // Agents that opt out of replays (meta.ignore_replays = true) get
      // an additional filter dropping events with meta.replay === true.
      subscribe: <T>(schema: string, handler: (event: KernelEvent<T>) => Promise<void>) => {
        const dropReplays = meta.ignore_replays === true;
        const wrapped = async (event: KernelEvent<T>): Promise<void> => {
          if (event.tenant_id !== tenantId) return;
          if (dropReplays && event.meta?.replay === true) return;
          await handler(event);
        };
        const off = this.bus.subscribe<T>(schema, wrapped);
        unsubscribes.push(off);
      },
    };
  }
}

function findAgentExport(mod: Record<string, unknown>): (new () => Agent) | null {
  for (const value of Object.values(mod)) {
    if (typeof value === 'function' && Agent.isPrototypeOf(value)) {
      return value as new () => Agent;
    }
  }
  return null;
}
