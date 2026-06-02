import { PUBLISH_READINESS } from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';
import Link from 'next/link';
import { PlatformPill } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { UtilIcon } from '../icons';

const PLATFORM_PROGRESS = {
  facebook: { percent: 80, accent: 'blue' },
  tiktok: { percent: 50, accent: 'cyan' },
  youtube: { percent: 30, accent: 'rose' },
} as const;

/** E. Publish Readiness Matrix nhỏ — trạng thái sẵn sàng theo nền tảng, link /publish. */
export function PublishReadinessMini() {
  return (
    <Card className="flex h-full flex-col">
      <CardHeader
        title="Sẵn sàng xuất bản"
        subtitle="Theo nền tảng — duyệt thủ công"
        no={9}
        accentClass="text-accent-green"
      />
      <CardBody className="flex-1 space-y-3.5">
        {PUBLISH_READINESS.map((row) => {
          const prog = PLATFORM_PROGRESS[row.platform] ?? { percent: 50, accent: 'blue' };
          return (
            <Link
              key={row.platform}
              href="/publish"
              className="block rounded-lg border border-hairline bg-raised/30 p-3.5 transition hover:border-neutral-700 hover:bg-raised/50"
            >
              <div className="flex items-center justify-between">
                <PlatformPill platform={row.platform} />
                <span className="text-xs font-bold text-neutral-100">
                  {row.count} video sẵn sàng
                </span>
              </div>
              <p className="mt-2 text-[11px] text-neutral-500 leading-snug">{row.note}</p>

              {/* Platform specific progress bar */}
              <div className="mt-3 space-y-1">
                <div className="flex items-center justify-between text-[9px] text-neutral-500">
                  <span>Tiến độ xuất bản</span>
                  <span className={`font-semibold ${ACCENT_TEXT[prog.accent]}`}>
                    {prog.percent}%
                  </span>
                </div>
                <div className="h-1 w-full bg-panel rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full bg-current ${ACCENT_TEXT[prog.accent]}`}
                    style={{ width: `${prog.percent}%` }}
                  />
                </div>
              </div>
            </Link>
          );
        })}
        <Link
          href="/publish"
          className="flex items-center justify-center gap-1 pt-1.5 text-[11px] font-medium text-neutral-400 transition hover:text-neutral-100"
        >
          Mở Xuất bản & Lịch <UtilIcon name="chevron" width={12} height={12} />
        </Link>
      </CardBody>
    </Card>
  );
}
