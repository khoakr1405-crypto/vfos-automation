import { RECENT_CONTENTS } from '@/lib/mock-data';
import Link from 'next/link';
import { LanePill, PlatformPill, StatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { Icon, UtilIcon } from '../icons';
import { Button } from '../ui';

/** D. Job/Nội dung gần đây — bảng tóm tắt + hành động nhanh. */
export function RecentContentTable() {
  return (
    <Card>
      <CardHeader
        title="Công việc / Nội dung gần đây"
        subtitle={`${RECENT_CONTENTS.length} job vận hành mới nhất`}
        no={4}
        accentClass="text-accent-violet"
        right={
          <Link href="/create">
            <Button variant="ghost" className="!py-1.5">
              Xem tất cả <UtilIcon name="chevron" />
            </Button>
          </Link>
        }
      />
      <CardBody className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-neutral-600 bg-panel/30">
            <tr className="border-b border-hairline">
              <th className="px-5 py-3 font-medium">Nội dung</th>
              <th className="px-3 py-3 font-medium">Cụm kênh</th>
              <th className="px-3 py-3 font-medium">Nền tảng</th>
              <th className="px-3 py-3 font-medium">Thời lượng</th>
              <th className="px-3 py-3 font-medium">Trạng thái</th>
              <th className="px-5 py-3 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_CONTENTS.map((c) => (
              <tr
                key={c.id}
                className="border-b border-hairline/60 last:border-0 hover:bg-raised/30 transition-colors"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    {/* High-fidelity 9:16 Video Thumbnail Simulation */}
                    <div className="relative flex h-14 w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-950 border border-hairline/80 shadow-md">
                      <div className="absolute inset-0 bg-gradient-to-t from-neutral-950/80 via-transparent to-neutral-950/20" />
                      <div className="absolute inset-0 bg-gradient-to-tr from-accent-blue/30 via-accent-violet/10 to-accent-cyan/20" />
                      <div className="absolute bottom-1 left-1 flex items-center gap-0.5 scale-75 origin-bottom-left">
                        <UtilIcon
                          name="play"
                          width={8}
                          height={8}
                          className="text-white fill-white shrink-0"
                        />
                        <span className="font-mono text-[9px] font-bold text-white tracking-tighter">
                          00:45
                        </span>
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-100 text-[13px]">{c.title}</p>
                      <p className="truncate font-mono text-[10px] text-neutral-600 mt-0.5">
                        {c.id} · {c.product}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3.5">
                  <LanePill laneId={c.laneId} />
                </td>
                <td className="px-3 py-3.5">
                  <PlatformPill platform={c.platform} />
                </td>
                <td className="px-3 py-3.5 font-mono text-neutral-400">{c.duration}</td>
                <td className="px-3 py-3.5">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-5 py-3.5 text-right">
                  <Link href={c.href}>
                    <Button variant="outline" className="!py-1 px-2.5 text-[11px]">
                      Xem <UtilIcon name="chevron" width={10} height={10} />
                    </Button>
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
