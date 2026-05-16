import { OfflineBanner } from '@/components/offline-banner';
import { getSyscalls } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

function namespace(name: string): string {
  const dot = name.indexOf('.');
  return dot < 0 ? name : name.slice(0, dot);
}

export default async function SyscallsPage() {
  try {
    const { syscalls } = await getSyscalls();
    const groups = new Map<string, typeof syscalls>();
    for (const s of syscalls) {
      const ns = namespace(s.name);
      const list = groups.get(ns) ?? [];
      list.push(s);
      groups.set(ns, list);
    }
    const sorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Syscalls</h1>
          <p className="text-sm text-neutral-400">
            {syscalls.length} kernel syscall(s) across {groups.size} namespace(s).
          </p>
        </header>
        <div className="space-y-6">
          {sorted.map(([ns, list]) => (
            <div key={ns}>
              <div className="mb-2 font-mono text-xs uppercase tracking-wider text-emerald-400">
                {ns}.*
              </div>
              <div className="overflow-hidden rounded-lg border border-neutral-800">
                <table className="w-full text-sm">
                  <thead className="bg-neutral-900/60 text-left text-xs uppercase tracking-wider text-neutral-400">
                    <tr>
                      <th className="px-4 py-2">Name</th>
                      <th className="px-4 py-2">Scope</th>
                      <th className="px-4 py-2">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/70">
                    {list.map((s) => (
                      <tr key={s.name}>
                        <td className="px-4 py-2 font-mono text-neutral-200">{s.name}</td>
                        <td className="px-4 py-2 font-mono text-xs text-amber-300">
                          {s.requiredScope}
                        </td>
                        <td className="px-4 py-2 text-neutral-400">{s.description}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
