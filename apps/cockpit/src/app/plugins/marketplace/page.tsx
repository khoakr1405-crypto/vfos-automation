import { OfflineBanner } from '@/components/offline-banner';
import { listAvailablePlugins } from '@/lib/kernel';
import { installPluginAction, uninstallPluginAction } from './actions';
import { ConfigForm } from './config-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function fmt(ts: string | null): string {
  if (!ts) return '—';
  return new Date(ts).toISOString().slice(0, 19).replace('T', ' ');
}

export default async function MarketplacePage() {
  try {
    const { plugins } = await listAvailablePlugins();
    const installedCount = plugins.filter((p) => p.installed && p.enabled).length;
    return (
      <div className="space-y-8">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Plugin marketplace</h1>
          <p className="text-sm text-neutral-400">
            {plugins.length} plugin(s) in catalog · {installedCount} installed for this tenant.
            Catalog is auto-discovered from <code className="font-mono text-amber-300">plugins/</code>{' '}
            — drop a new package directory there and restart the kernel to publish it.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {plugins.length === 0 && (
            <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-6 text-center text-sm text-neutral-500">
              No plugins found in the catalog.
            </div>
          )}
          {plugins.map((p) => (
            <div
              key={p.name}
              className="flex flex-col gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div>
                  <div className="font-mono text-base font-semibold text-neutral-100">
                    {p.name}
                  </div>
                  <div className="mt-0.5 font-mono text-xs text-neutral-500">v{p.version}</div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {p.installed && p.enabled ? (
                    <span className="rounded bg-emerald-700/40 px-2 py-0.5 font-mono text-[10px] uppercase text-emerald-200">
                      Installed
                    </span>
                  ) : p.installed ? (
                    <span className="rounded bg-amber-700/40 px-2 py-0.5 font-mono text-[10px] uppercase text-amber-200">
                      Disabled
                    </span>
                  ) : (
                    <span className="rounded bg-neutral-700/40 px-2 py-0.5 font-mono text-[10px] uppercase text-neutral-300">
                      Available
                    </span>
                  )}
                  {p.loaded && (
                    <span className="rounded bg-sky-700/40 px-2 py-0.5 font-mono text-[10px] uppercase text-sky-200">
                      Running
                    </span>
                  )}
                </div>
              </div>

              {p.description && (
                <p className="text-sm text-neutral-300">{p.description}</p>
              )}

              <div className="flex flex-wrap gap-1.5">
                {p.scopes.map((s) => (
                  <span
                    key={s}
                    className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 font-mono text-[11px] text-neutral-300"
                  >
                    {s}
                  </span>
                ))}
              </div>

              {p.installed && (
                <ConfigForm
                  name={p.name}
                  initialConfig={p.config}
                  {...(p.configSchema ? { schema: p.configSchema } : {})}
                />
              )}

              <div className="flex items-center justify-between border-t border-neutral-800 pt-3">
                <div className="font-mono text-[11px] text-neutral-500">
                  {p.installed
                    ? `installed ${fmt(p.installed_at)} · v${p.installed_version}`
                    : 'not installed'}
                </div>
                <div className="flex gap-2">
                  {p.installed && p.enabled ? (
                    <form action={uninstallPluginAction}>
                      <input type="hidden" name="name" value={p.name} />
                      <button
                        type="submit"
                        className="rounded bg-rose-800/60 px-3 py-1 text-xs uppercase text-rose-100 transition hover:bg-rose-700"
                      >
                        Uninstall
                      </button>
                    </form>
                  ) : (
                    <form action={installPluginAction}>
                      <input type="hidden" name="name" value={p.name} />
                      <button
                        type="submit"
                        className="rounded bg-emerald-600 px-3 py-1 text-xs font-medium uppercase text-white transition hover:bg-emerald-500"
                      >
                        {p.installed ? 'Re-enable' : 'Install'}
                      </button>
                    </form>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  } catch (err) {
    return <OfflineBanner error={err} />;
  }
}
