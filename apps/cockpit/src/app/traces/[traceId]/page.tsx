import Link from 'next/link';
import { OfflineBanner } from '@/components/offline-banner';
import { getTrace, type SpanDetail } from '@/lib/kernel';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

const SPAN_KIND_NAME: Record<number, string> = {
  0: 'INTERNAL',
  1: 'SERVER',
  2: 'CLIENT',
  3: 'PRODUCER',
  4: 'CONSUMER',
};

interface TreeNode {
  span: SpanDetail;
  children: TreeNode[];
}

function buildTree(spans: SpanDetail[]): TreeNode[] {
  const byId = new Map<string, TreeNode>();
  for (const s of spans) byId.set(s.span_id, { span: s, children: [] });
  const roots: TreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.span.parent_span_id ? byId.get(node.span.parent_span_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sortByStart = (a: TreeNode, b: TreeNode): number =>
    a.span.start_unix_ms - b.span.start_unix_ms;
  const visit = (n: TreeNode): void => {
    n.children.sort(sortByStart);
    for (const c of n.children) visit(c);
  };
  roots.sort(sortByStart);
  for (const r of roots) visit(r);
  return roots;
}

function renderNode(
  node: TreeNode,
  depth: number,
  traceStart: number,
  traceDuration: number,
): React.ReactElement[] {
  const offsetMs = node.span.start_unix_ms - traceStart;
  const offsetPct = traceDuration > 0 ? (offsetMs / traceDuration) * 100 : 0;
  const widthPct = traceDuration > 0 ? (node.span.duration_ms / traceDuration) * 100 : 0;
  const kind = SPAN_KIND_NAME[node.span.kind] ?? '?';
  const out: React.ReactElement[] = [
    <li key={node.span.span_id} className="grid grid-cols-12 gap-3 px-3 py-1.5 text-xs">
      <span
        className="col-span-4 truncate font-mono text-neutral-200"
        style={{ paddingLeft: `${depth * 14}px` }}
      >
        {depth > 0 && <span className="text-neutral-600">↳ </span>}
        {node.span.name}
      </span>
      <span className="col-span-1 font-mono text-neutral-500">{kind}</span>
      <span className="col-span-1 text-right font-mono text-neutral-400">
        +{offsetMs}ms
      </span>
      <span className="col-span-1 text-right font-mono text-neutral-300">
        {node.span.duration_ms}ms
      </span>
      <span className="col-span-5">
        <div className="relative h-2 w-full overflow-hidden rounded bg-neutral-900">
          <div
            className="absolute h-full bg-sky-500/60"
            style={{ left: `${offsetPct}%`, width: `${Math.max(0.5, widthPct)}%` }}
          />
        </div>
      </span>
    </li>,
  ];
  for (const c of node.children) {
    out.push(...renderNode(c, depth + 1, traceStart, traceDuration));
  }
  return out;
}

export default async function TraceDetailPage({
  params,
}: {
  params: Promise<{ traceId: string }>;
}) {
  const { traceId } = await params;
  try {
    const { trace_id, spans } = await getTrace(traceId);
    if (spans.length === 0) {
      return (
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm">
          Trace <code className="font-mono">{trace_id}</code> not found or already evicted.
        </div>
      );
    }
    const traceStart = Math.min(...spans.map((s) => s.start_unix_ms));
    const traceEnd = Math.max(...spans.map((s) => s.start_unix_ms + s.duration_ms));
    const traceDuration = traceEnd - traceStart;
    const tree = buildTree(spans);

    return (
      <div className="space-y-6">
        <header>
          <Link href="/traces" className="text-sm text-sky-400 hover:text-sky-300">
            ← all traces
          </Link>
          <h1 className="mt-1 font-mono text-xl font-semibold text-neutral-100">{trace_id}</h1>
          <p className="text-sm text-neutral-400">
            {spans.length} span(s), total duration {traceDuration} ms
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
            Span tree
          </h2>
          <div className="overflow-hidden rounded-lg border border-neutral-800">
            <div className="grid grid-cols-12 gap-3 border-b border-neutral-800 bg-neutral-900/60 px-3 py-1.5 text-[10px] uppercase tracking-wider text-neutral-400">
              <span className="col-span-4">name</span>
              <span className="col-span-1">kind</span>
              <span className="col-span-1 text-right">offset</span>
              <span className="col-span-1 text-right">duration</span>
              <span className="col-span-5">waterfall</span>
            </div>
            <ul className="divide-y divide-neutral-800/70">
              {tree.flatMap((root) => renderNode(root, 0, traceStart, traceDuration))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-xs font-medium uppercase tracking-wider text-neutral-400">
            Span attributes
          </h2>
          <div className="space-y-2">
            {spans.map((s) => (
              <details key={s.span_id} className="rounded border border-neutral-800 bg-neutral-900/40">
                <summary className="cursor-pointer px-3 py-2 font-mono text-xs text-neutral-200">
                  {s.name}{' '}
                  <span className="text-neutral-500">
                    ({s.span_id.slice(0, 8)})
                  </span>
                </summary>
                <pre className="overflow-x-auto px-3 pb-3 text-[11px] text-neutral-400">
                  {JSON.stringify(s.attributes, null, 2)}
                </pre>
              </details>
            ))}
          </div>
        </section>
      </div>
    );
  } catch (err) {
    return <OfflineBanner error={err} />;
  }
}
