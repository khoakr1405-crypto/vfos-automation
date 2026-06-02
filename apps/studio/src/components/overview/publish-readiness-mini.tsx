import { PUBLISH_READINESS } from '@/lib/mock-data';
import Link from 'next/link';
import { PlatformPill, StatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

/** E. Publish Readiness Matrix nhỏ — trạng thái sẵn sàng theo nền tảng, link /publish. */
export function PublishReadinessMini() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Sẵn sàng xuất bản"
        subtitle="Theo nền tảng — duyệt thủ công trước khi publish"
        no={9}
        accentClass="text-accent-green"
      />
      <CardBody className="flex-1 space-y-2">
        {PUBLISH_READINESS.map((row) => (
          <Link
            key={row.platform}
            href="/publish"
            className="block rounded-lg border border-hairline bg-raised/40 px-3 py-2.5 transition hover:bg-raised"
          >
            <div className="flex items-center justify-between">
              <PlatformPill platform={row.platform} />
              <StatusBadge status={row.status} />
            </div>
            <p className="mt-1.5 text-[11px] text-neutral-500">{row.note}</p>
          </Link>
        ))}
        <Link
          href="/publish"
          className="flex items-center justify-center gap-1 pt-1 text-[11px] font-medium text-neutral-400 transition hover:text-neutral-100"
        >
          Mở Xuất bản & Lịch <UtilIcon name="chevron" width={12} height={12} />
        </Link>
      </CardBody>
    </Card>
  );
}
