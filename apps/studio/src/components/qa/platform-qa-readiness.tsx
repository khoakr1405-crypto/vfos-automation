import { PLATFORM_LABEL, type QaJob } from '@/lib/mock-data';
import { PlatformPill, QaStatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

/** G. Platform QA Readiness — readiness từng nền tảng (Facebook/TikTok/YouTube). */
export function PlatformQaReadiness({ job }: { job: QaJob }) {
  return (
    <Card>
      <CardHeader
        title="Platform QA Readiness"
        subtitle="Sẵn sàng theo nền tảng — chi tiết publish ở /publish"
        accentClass="text-accent-cyan"
      />
      <CardBody className="grid gap-3 lg:grid-cols-3">
        {job.platforms.map((p) => {
          const checks: { label: string; ok: boolean }[] = [
            { label: 'Package', ok: p.packageReady },
            { label: 'Caption/copy', ok: p.captionReady },
            { label: 'Thumbnail', ok: p.thumbnailReady },
            { label: 'Safe area 9:16', ok: p.safeAreaOk },
          ];
          return (
            <div key={p.platform} className="rounded-xl border border-hairline bg-raised/40 p-3.5">
              <div className="mb-2.5 flex items-center justify-between">
                <PlatformPill platform={p.platform} />
                <QaStatusBadge status={p.status} />
              </div>
              <p className="mb-2 text-[10px] text-neutral-600">{PLATFORM_LABEL[p.platform]}</p>
              <ul className="space-y-1.5">
                {checks.map((c) => (
                  <li key={c.label} className="flex items-center gap-2 text-[11px]">
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                        c.ok
                          ? 'bg-accent-green/20 text-accent-green'
                          : 'bg-accent-rose/20 text-accent-rose'
                      }`}
                    >
                      <UtilIcon name={c.ok ? 'check' : 'x'} width={10} height={10} />
                    </span>
                    <span className={c.ok ? 'text-neutral-300' : 'text-neutral-400'}>
                      {c.label}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
