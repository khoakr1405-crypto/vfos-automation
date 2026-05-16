import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { tenant_plugins } from '@vfos/db';
import type { AgentConfigSchema } from '@vfos/sdk';
import type { DbHandle } from '../db/client.js';
import type { PluginLoader } from '../plugin-loader.js';
import { validateConfig } from '../plugins/config-validator.js';
import type { SyscallSpec } from '../syscall-registry.js';

export interface PluginsSyscallDeps {
  db: DbHandle;
  loader: PluginLoader;
}

const InstallInput = z.object({
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()).optional(),
});

const UninstallInput = z.object({ name: z.string().min(1) });

const UpdateConfigInput = z.object({
  name: z.string().min(1),
  config: z.record(z.string(), z.unknown()),
});

interface CatalogRow {
  name: string;
  version: string;
  description: string;
  scopes: readonly string[];
  installed: boolean;
  enabled: boolean;
  loaded: boolean;
  installed_at: string | null;
  installed_version: string | null;
  config: Record<string, unknown>;
  configSchema?: AgentConfigSchema;
}

export function makePluginsSyscalls(deps: PluginsSyscallDeps): readonly SyscallSpec[] {
  /**
   * Marketplace catalog scoped to the caller tenant. Each tenant has its
   * own Agent instance — `loaded` reflects whether THIS tenant's instance
   * is currently running, not whether the plugin is loaded for anyone.
   */
  const listAvailable: SyscallSpec = {
    name: 'plugins.list_available',
    description: 'List installable plugins from the on-disk catalog joined with install state.',
    requiredScope: 'tenant.read',
    handler: async (ctx) => {
      const catalog = deps.loader.catalogList();
      const installs = await deps.db
        .select({
          name: tenant_plugins.plugin_name,
          version: tenant_plugins.plugin_version,
          enabled: tenant_plugins.enabled,
          installed_at: tenant_plugins.installed_at,
          config: tenant_plugins.config,
        })
        .from(tenant_plugins)
        .where(eq(tenant_plugins.tenant_id, ctx.tenant_id));
      const byName = new Map(installs.map((i) => [i.name, i]));
      const rows: CatalogRow[] = catalog.map((c) => {
        const inst = byName.get(c.name);
        return {
          name: c.name,
          version: c.version,
          description: c.description,
          scopes: c.scopes,
          installed: !!inst,
          enabled: inst?.enabled === 1,
          loaded: deps.loader.isLoaded(ctx.tenant_id, c.name),
          installed_at: inst?.installed_at ? new Date(inst.installed_at).toISOString() : null,
          installed_version: inst?.version ?? null,
          config: inst?.config ?? {},
          ...(c.configSchema ? { configSchema: c.configSchema } : {}),
        };
      });
      return { plugins: rows };
    },
  };

  const install: SyscallSpec = {
    name: 'plugins.install',
    description: 'Install a plugin for the caller tenant and hot-load a dedicated Agent instance.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = InstallInput.parse(raw);
      const catalog = deps.loader.catalogList().find((c) => c.name === args.name);
      if (!catalog) throw new Error(`plugin not in catalog: ${args.name}`);

      // Validate against the plugin's configSchema (when declared) so a
      // typo at install time doesn't silently break the agent at runtime.
      const validated = validateConfig(catalog.configSchema, args.config ?? {});
      if (!validated.ok) {
        throw new Error(`plugin config invalid: ${validated.errors.join('; ')}`);
      }

      await deps.db
        .insert(tenant_plugins)
        .values({
          tenant_id: ctx.tenant_id,
          plugin_name: args.name,
          plugin_version: catalog.version,
          enabled: 1,
          config: validated.cleaned,
        })
        .onConflictDoUpdate({
          target: [tenant_plugins.tenant_id, tenant_plugins.plugin_name],
          set: {
            plugin_version: catalog.version,
            enabled: 1,
            ...(args.config ? { config: validated.cleaned } : {}),
            updated_at: new Date(),
          },
        });

      await deps.loader.load(ctx.tenant_id, args.name);
      return {
        plugin: { name: args.name, version: catalog.version, scopes: catalog.scopes },
        tenant_id: ctx.tenant_id,
        loaded: true,
      };
    },
  };

  const uninstall: SyscallSpec = {
    name: 'plugins.uninstall',
    description: 'Disable + unload the caller-tenant Agent instance of a plugin.',
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = UninstallInput.parse(raw);
      const result = await deps.db
        .update(tenant_plugins)
        .set({ enabled: 0, updated_at: new Date() })
        .where(
          and(
            eq(tenant_plugins.tenant_id, ctx.tenant_id),
            eq(tenant_plugins.plugin_name, args.name),
          ),
        )
        .returning({ name: tenant_plugins.plugin_name });
      if (result.length === 0) throw new Error(`plugin not installed: ${args.name}`);
      const wasLoaded = deps.loader.isLoaded(ctx.tenant_id, args.name);
      if (wasLoaded) await deps.loader.unload(ctx.tenant_id, args.name);
      return { name: args.name, tenant_id: ctx.tenant_id, uninstalled: true, unloaded: wasLoaded };
    },
  };

  const updateConfig: SyscallSpec = {
    name: 'plugins.update_config',
    description: "Replace tenant_plugins.config for an installed plugin and hot-reload the agent so ctx.config picks up the new values.",
    requiredScope: 'tenant.admin',
    handler: async (ctx, raw) => {
      const args = UpdateConfigInput.parse(raw);
      const catalog = deps.loader.catalogList().find((c) => c.name === args.name);
      const validated = validateConfig(catalog?.configSchema, args.config);
      if (!validated.ok) {
        throw new Error(`plugin config invalid: ${validated.errors.join('; ')}`);
      }
      const result = await deps.db
        .update(tenant_plugins)
        .set({ config: validated.cleaned, updated_at: new Date() })
        .where(
          and(
            eq(tenant_plugins.tenant_id, ctx.tenant_id),
            eq(tenant_plugins.plugin_name, args.name),
          ),
        )
        .returning({ name: tenant_plugins.plugin_name, enabled: tenant_plugins.enabled });
      if (result.length === 0) throw new Error(`plugin not installed: ${args.name}`);
      // Only reload when the install row is enabled; otherwise the plugin
      // isn't running and the next install() will pick up the new config.
      let reloaded = false;
      if (result[0]!.enabled === 1) {
        await deps.loader.reload(ctx.tenant_id, args.name);
        reloaded = true;
      }
      return { name: args.name, tenant_id: ctx.tenant_id, config: validated.cleaned, reloaded };
    },
  };

  return [listAvailable, install, uninstall, updateConfig];
}
