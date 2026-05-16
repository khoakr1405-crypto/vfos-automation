import { OfflineBanner } from '@/components/offline-banner';
import { getDrivers, getBudget } from '@/lib/kernel';
import { AiLabForm } from './ai-lab-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function AiLabPage() {
  try {
    const [{ drivers }, budget] = await Promise.all([getDrivers(), getBudget()]);
    const hasAnthropic = drivers.some((d) => d.name === 'anthropic');
    const usagePct = budget.ceiling_cents > 0
      ? Math.min(100, (budget.spent_cents / budget.ceiling_cents) * 100)
      : 0;

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">AI Lab</h1>
          <p className="text-sm text-neutral-400">
            Diagnostic playground for the intent-routed AIRouter. Shows model, driver, cost,
            token usage, and cache hits per request.
          </p>
        </header>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
            <div className="text-xs uppercase tracking-wider text-neutral-400">Active drivers</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {drivers.map((d) => (
                <span
                  key={d.name}
                  className={`rounded border px-2 py-0.5 font-mono text-xs ${
                    d.name === 'anthropic'
                      ? 'border-emerald-700/60 bg-emerald-900/20 text-emerald-300'
                      : 'border-neutral-700/60 bg-neutral-900/60 text-neutral-300'
                  }`}
                >
                  {d.name}
                </span>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-neutral-500">
              {hasAnthropic
                ? 'Anthropic registered — real calls will hit the API.'
                : 'ANTHROPIC_API_KEY unset — falling back to mock driver (free, deterministic).'}
            </p>
          </div>

          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 md:col-span-2">
            <div className="text-xs uppercase tracking-wider text-neutral-400">
              Today&apos;s spend
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-mono text-2xl text-neutral-100">
                {(budget.spent_cents / 100).toFixed(2)}¢
              </span>
              <span className="text-xs text-neutral-500">
                of ${(budget.ceiling_cents / 100).toFixed(2)} daily ceiling
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded bg-neutral-800">
              <div
                className={`h-full ${
                  usagePct > 80 ? 'bg-rose-500' : usagePct > 50 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
          </div>
        </section>

        <AiLabForm />
      </div>
    );
  } catch (err) {
    return <OfflineBanner error={err} />;
  }
}
