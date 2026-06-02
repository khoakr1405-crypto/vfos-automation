import { PUBLISH_SCHEDULE_PREVIEW, type ScheduleBucket } from '@/lib/mock-data';
import Link from 'next/link';
import { PlatformPill, PublishStatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';
import { Button } from '../ui';

const BUCKETS: { id: ScheduleBucket; label: string }[] = [
  { id: 'today', label: 'Hôm nay' },
  { id: 'tomorrow', label: 'Ngày mai' },
  { id: 'week', label: 'Tuần này' },
];

/** F. Schedule Preview — lịch sắp đăng (hôm nay / ngày mai / tuần này). */
export function PublishSchedulePreview() {
  return (
    <Card>
      <CardHeader
        title="Lịch sắp đăng"
        subtitle="Xem nhanh — lịch đầy đủ ở Lịch đa nền tảng"
        accentClass="text-accent-amber"
        right={
          <Link href="/schedule">
            <Button variant="ghost" className="!py-1.5">
              Mở lịch <UtilIcon name="chevron" />
            </Button>
          </Link>
        }
      />
      <CardBody className="grid gap-4 lg:grid-cols-3">
        {BUCKETS.map((bucket) => {
          const items = PUBLISH_SCHEDULE_PREVIEW.filter((i) => i.bucket === bucket.id);
          return (
            <div key={bucket.id}>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
                {bucket.label} · {items.length}
              </p>
              <div className="space-y-2">
                {items.length === 0 && (
                  <p className="rounded-lg border border-dashed border-hairline px-3 py-2 text-[11px] text-neutral-600">
                    Không có lịch
                  </p>
                )}
                {items.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-hairline bg-raised/40 px-3 py-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] text-neutral-200">{item.time}</span>
                      <PublishStatusBadge status={item.status} />
                    </div>
                    <p className="mt-1.5 truncate text-xs text-neutral-200">{item.title}</p>
                    <div className="mt-1.5 flex items-center justify-between">
                      <PlatformPill platform={item.platform} />
                      <span className="text-[10px] text-neutral-600">{item.channel}</span>
                    </div>
                    <p className="mt-1 truncate font-mono text-[10px] text-neutral-600">
                      {item.packageFile}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </CardBody>
    </Card>
  );
}
