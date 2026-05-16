import { OfflineBanner } from '@/components/offline-banner';
import { getConnectors, listConnectorCredentials } from '@/lib/kernel';
import { PipelineForm } from './pipeline-form';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default async function PipelinePage() {
  try {
    const [{ credentials }, { connectors }] = await Promise.all([
      listConnectorCredentials(),
      getConnectors(),
    ]);
    const hasTiktokCred = credentials.some(
      (c) => c.platform === 'tiktok' && c.revoked_at === null,
    );
    const hasFacebookCred = credentials.some(
      (c) => c.platform === 'facebook' && c.revoked_at === null,
    );

    return (
      <div className="space-y-6">
        <header>
          <h1 className="text-2xl font-semibold text-neutral-100">Pipeline</h1>
          <p className="text-sm text-neutral-400">
            One-shot end-to-end run: trend.score → ai.classify_niche → fs.put → compliance.gate →
            render queue → publish. All steps share a single trace, so the result links straight
            to the waterfall.
          </p>
        </header>

        {credentials.length === 0 && (
          <div className="rounded-lg border border-amber-700/60 bg-amber-900/20 p-3 text-sm text-amber-200">
            No platform credentials linked yet. The pipeline will stop after render with{' '}
            <code className="font-mono">final=no_connector</code>. Link one via{' '}
            <a href="/connectors" className="underline hover:text-amber-100">
              /connectors
            </a>{' '}
            to enable publishing.
          </div>
        )}

        <section className="flex flex-wrap gap-2 text-xs">
          {connectors.map((c) => (
            <span
              key={c.platform}
              className="rounded border border-neutral-800 bg-neutral-900/60 px-2 py-1 font-mono"
            >
              {c.platform} · publish={c.mode}
            </span>
          ))}
        </section>

        <PipelineForm hasTiktokCred={hasTiktokCred} hasFacebookCred={hasFacebookCred} />
      </div>
    );
  } catch (err) {
    return <OfflineBanner error={err} />;
  }
}
