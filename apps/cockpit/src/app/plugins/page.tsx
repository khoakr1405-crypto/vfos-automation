import { OfflineBanner } from '@/components/offline-banner';
import { getPlugins } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PluginsPage() {
  try {
    const { plugins } = await getPlugins();
    const tenants = new Set(plugins.map((p) => p.tenant_id));
    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Plugins</h1>
          <p className="text-sm text-neutral-400">
            {plugins.length} agent instance(s) across {tenants.size} tenant(s). Each tenant gets a
            dedicated Agent instance; events are filtered by tenant_id on the bus.
          </p>
        </header>
        <div className="grid gap-3">
          {plugins.map((p) => (
            <div
              key={`${p.tenant_id}::${p.name}`}
              className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4"
            >
              <div className="flex items-baseline justify-between gap-4">
                <div className="font-mono text-base font-semibold text-neutral-100">{p.name}</div>
                <div className="font-mono text-xs text-neutral-500">v{p.version}</div>
              </div>
              <div className="mt-2 font-mono text-[11px] text-neutral-500">
                tenant <span className="text-neutral-300">{p.tenant_id}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {p.scopes.map((s) => (
                  <span
                    key={s}
                    className="rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 font-mono text-xs text-neutral-300"
                  >
                    {s}
                  </span>
                ))}
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
