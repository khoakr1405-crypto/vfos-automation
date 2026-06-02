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
        title="Nội dung gần đây"
        subtitle={`${RECENT_CONTENTS.length} job mới nhất (mock)`}
        no={4}
        accentClass="text-accent-violet"
        right={
          <Link href="/create">
            <Button variant="ghost" className="!py-1.5">
              Mở module <UtilIcon name="chevron" />
            </Button>
          </Link>
        }
      />
      <CardBody className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
            <tr className="border-b border-hairline">
              <th className="px-5 py-2.5 font-medium">Nội dung</th>
              <th className="px-3 py-2.5 font-medium">Ngách</th>
              <th className="px-3 py-2.5 font-medium">Nền tảng</th>
              <th className="px-3 py-2.5 font-medium">Thời lượng</th>
              <th className="px-3 py-2.5 font-medium">Trạng thái</th>
              <th className="px-5 py-2.5 text-right font-medium">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {RECENT_CONTENTS.map((c) => (
              <tr
                key={c.id}
                className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
              >
                <td className="px-5 py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-raised to-panel text-neutral-500">
                      <Icon name="render" width={15} height={15} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-neutral-100">{c.title}</p>
                      <p className="truncate font-mono text-[10px] text-neutral-600">
                        {c.id} · {c.product}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-3">
                  <LanePill laneId={c.laneId} />
                </td>
                <td className="px-3 py-3">
                  <PlatformPill platform={c.platform} />
                </td>
                <td className="px-3 py-3 font-mono text-neutral-300">{c.duration}</td>
                <td className="px-3 py-3">
                  <StatusBadge status={c.status} />
                </td>
                <td className="px-5 py-3 text-right">
                  <Link href={c.href}>
                    <Button variant="outline" className="!py-1">
                      Mở <UtilIcon name="chevron" width={12} height={12} />
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
