'use client';

import type { PlatformId, PublishContent } from '@/lib/types';
import { LanePill, PublishStatusBadge, StatusBadge } from '../badge';
import { Card, CardBody, CardHeader } from '../card';
import { Icon } from '../icons';

const PLATFORM_ORDER: { id: PlatformId; short: string }[] = [
  { id: 'facebook', short: 'FB' },
  { id: 'tiktok', short: 'TikTok' },
  { id: 'youtube', short: 'YouTube' },
];

function latestSchedule(c: PublishContent): string {
  for (const { id } of PLATFORM_ORDER) {
    const at = c.platforms[id].scheduledAt;
    if (at) return at;
  }
  return '—';
}

/** B. Content Publish Queue — chọn 1 dòng để xem chi tiết publish bên dưới. */
export function PublishQueueTable({
  items,
  selectedId,
  onSelect,
}: {
  items: PublishContent[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <Card>
      <CardHeader
        title="Hàng đợi xuất bản"
        subtitle={`${items.length} nội dung · bấm để xem chi tiết publish`}
        no={9}
        accentClass="text-accent-green"
      />
      <CardBody className="!p-0 overflow-x-auto">
        <table className="w-full min-w-[860px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
            <tr className="border-b border-hairline">
              <th className="px-5 py-2.5 font-medium">Nội dung</th>
              <th className="px-3 py-2.5 font-medium">Ngách</th>
              <th className="px-3 py-2.5 font-medium">QA</th>
              <th className="px-3 py-2.5 font-medium">Duyệt</th>
              <th className="px-3 py-2.5 font-medium">Facebook</th>
              <th className="px-3 py-2.5 font-medium">TikTok</th>
              <th className="px-3 py-2.5 font-medium">YouTube</th>
              <th className="px-3 py-2.5 font-medium">Lịch gần nhất</th>
            </tr>
          </thead>
          <tbody>
            {/* Section 1: Hàng đợi xuất bản */}
            <tr className="bg-neutral-900/40 select-none">
              <td colSpan={8} className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-accent-green bg-accent-green/5 border-y border-hairline/40">
                Hàng đợi xuất bản (Sẵn sàng / Chờ đóng gói) — {items.filter(c => c.approved).length} nội dung
              </td>
            </tr>
            {items.filter(c => c.approved).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-neutral-500 italic">
                  Chưa có nội dung nào được phê duyệt.
                </td>
              </tr>
            ) : (
              items.filter(c => c.approved).map((c) => {
                const selected = c.id === selectedId;
                return (
                  <tr
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(c.id);
                      }
                    }}
                    tabIndex={0}
                    className={`cursor-pointer border-b border-hairline/60 last:border-0 transition focus:outline-none focus-visible:bg-raised/40 ${
                      selected ? 'bg-accent-green/10' : 'hover:bg-raised/30'
                    }`}
                  >
                    <td className={`px-5 py-3 ${selected ? 'border-l-2 border-l-accent-green' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-raised to-panel text-neutral-500">
                          <Icon name="publish" width={15} height={15} />
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
                      <StatusBadge status={c.qaPassed ? 'pass' : 'fail'} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={c.approved ? 'approved' : 'pending'} />
                    </td>
                    <td className="px-3 py-3">
                      <PublishStatusBadge status={c.platforms.facebook.status} />
                    </td>
                    <td className="px-3 py-3">
                      <PublishStatusBadge status={c.platforms.tiktok.status} />
                    </td>
                    <td className="px-3 py-3">
                      <PublishStatusBadge status={c.platforms.youtube.status} />
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-neutral-400">
                      {latestSchedule(c)}
                    </td>
                  </tr>
                );
              })
            )}

            {/* Section 2: Chờ Operator duyệt */}
            <tr className="bg-neutral-900/40 select-none">
              <td colSpan={8} className="px-5 py-2 text-[10px] font-bold uppercase tracking-wider text-accent-amber bg-accent-amber/5 border-y border-hairline/40">
                Chờ Operator duyệt — chưa vào Publish Queue — {items.filter(c => !c.approved).length} nội dung
              </td>
            </tr>
            {items.filter(c => !c.approved).length === 0 ? (
              <tr>
                <td colSpan={8} className="px-5 py-6 text-center text-neutral-500 italic">
                  Không có nội dung nào đang chờ duyệt.
                </td>
              </tr>
            ) : (
              items.filter(c => !c.approved).map((c) => {
                const selected = c.id === selectedId;
                return (
                  <tr
                    key={c.id}
                    onClick={() => onSelect(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onSelect(c.id);
                      }
                    }}
                    tabIndex={0}
                    className={`cursor-pointer border-b border-hairline/60 last:border-0 transition focus:outline-none focus-visible:bg-raised/40 ${
                      selected ? 'bg-accent-green/10' : 'hover:bg-raised/30'
                    }`}
                  >
                    <td className={`px-5 py-3 ${selected ? 'border-l-2 border-l-accent-green' : ''}`}>
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gradient-to-br from-raised to-panel text-neutral-500">
                          <Icon name="publish" width={15} height={15} />
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
                      <StatusBadge status={c.qaPassed ? 'pass' : 'fail'} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={c.approved ? 'approved' : 'pending'} />
                    </td>
                    <td className="px-3 py-3">
                      <PublishStatusBadge status={c.platforms.facebook.status} />
                    </td>
                    <td className="px-3 py-3">
                      <PublishStatusBadge status={c.platforms.tiktok.status} />
                    </td>
                    <td className="px-3 py-3">
                      <PublishStatusBadge status={c.platforms.youtube.status} />
                    </td>
                    <td className="px-3 py-3 font-mono text-[11px] text-neutral-400">
                      {latestSchedule(c)}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
