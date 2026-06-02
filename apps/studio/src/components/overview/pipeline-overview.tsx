import { OVERVIEW_PIPELINE } from '@/lib/mock-data';
import Link from 'next/link';
import { Badge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';

/** G. Pipeline Overview — số job mỗi stage, lộ bottleneck (loại trừ stage terminal). */
export function PipelineOverview() {
  const wip = OVERVIEW_PIPELINE.filter((s) => !s.terminal);
  const maxWip = Math.max(...wip.map((s) => s.count), 1);
  const bottleneck = wip.reduce((a, b) => (b.count > a.count ? b : a), wip[0]);

  return (
    <Card>
      <CardHeader
        title="Pipeline tổng quát"
        subtitle="Raw Visual → … → Published · số job mỗi stage"
        accentClass="text-accent-cyan"
        right={bottleneck && <Badge accent="amber">Bottleneck: {bottleneck.name}</Badge>}
      />
      <CardBody className="overflow-x-auto">
        <div className="flex min-w-[760px] items-end gap-1">
          {OVERVIEW_PIPELINE.map((stage, i) => {
            const isBottleneck = !stage.terminal && stage.count === maxWip;
            const barPct = stage.terminal ? 100 : Math.round((stage.count / maxWip) * 100);
            return (
              <div key={stage.name} className="flex flex-1 items-end gap-1">
                <Link
                  href={stage.href}
                  className="group flex flex-1 flex-col items-center gap-1.5"
                  title={`${stage.name}: ${stage.count} job`}
                >
                  <span
                    className={`text-xs font-semibold ${
                      isBottleneck
                        ? 'text-accent-amber'
                        : stage.terminal
                          ? 'text-accent-green'
                          : 'text-neutral-200'
                    }`}
                  >
                    {stage.count}
                  </span>
                  <div className="flex h-20 w-full items-end overflow-hidden rounded-md bg-raised/50">
                    <div
                      className={`w-full rounded-md transition-all ${
                        isBottleneck
                          ? 'bg-accent-amber'
                          : stage.terminal
                            ? 'bg-accent-green/70'
                            : 'bg-accent-cyan/60 group-hover:bg-accent-cyan'
                      }`}
                      style={{ height: `${Math.max(barPct, 8)}%` }}
                    />
                  </div>
                  <span className="text-center text-[10px] leading-tight text-neutral-500 group-hover:text-neutral-300">
                    {stage.name}
                  </span>
                </Link>
                {i < OVERVIEW_PIPELINE.length - 1 && (
                  <span className="pb-12 text-neutral-700">›</span>
                )}
              </div>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
