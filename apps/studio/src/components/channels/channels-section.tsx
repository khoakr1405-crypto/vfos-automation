/* =============================================================================
 * VFOS Studio — Channels section (Round Growth 03, READ-ONLY)
 * -----------------------------------------------------------------------------
 * Presentational. Nhận Channel[] từ growth-data adapter (server component cha),
 * nhóm theo lane, render bảng kênh. KHÔNG fetch, KHÔNG token — pageAccess chỉ là
 * cờ boolean. Fallback rõ khi không có dữ liệu (không crash).
 * ========================================================================== */

import { Badge, LanePill, PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import type { Channel } from '@/lib/growth-data/types';
import { LANES, LANE_LABEL, type LaneId, type PlatformId } from '@/lib/mock-data';

const KNOWN_LANES = new Set<string>(LANES.map((l) => l.id));
const isLaneId = (lane: string): lane is LaneId => KNOWN_LANES.has(lane);

function AccessBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge accent="green">Đã cấu hình</Badge>
  ) : (
    <Badge accent="amber">Chưa cấu hình</Badge>
  );
}

export function ChannelsSection({ channels }: { channels: Channel[] }) {
  if (channels.length === 0) {
    return (
      <Card>
        <CardBody className="text-center text-xs text-neutral-500">
          Chưa có kênh nào trong Growth data.
        </CardBody>
      </Card>
    );
  }

  const groups = new Map<string, Channel[]>();
  for (const ch of channels) {
    const arr = groups.get(ch.lane) ?? [];
    arr.push(ch);
    groups.set(ch.lane, arr);
  }

  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([lane, rows]) => (
        <Card key={lane}>
          <CardHeader
            title={`Cụm kênh · ${isLaneId(lane) ? LANE_LABEL[lane] : lane}`}
            subtitle={`${rows.length} kênh`}
            right={
              isLaneId(lane) ? <LanePill laneId={lane} /> : <Badge accent="blue">{lane}</Badge>
            }
          />
          <CardBody className="!p-0">
            <table className="w-full text-left text-xs">
              <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                <tr className="border-b border-hairline">
                  <th className="px-5 py-2.5 font-medium">Kênh</th>
                  <th className="px-5 py-2.5 font-medium">Nền tảng</th>
                  <th className="px-5 py-2.5 font-medium">Trạng thái</th>
                  <th className="px-5 py-2.5 font-medium">Quy tắc đăng</th>
                  <th className="px-5 py-2.5 font-medium">Page access</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((ch) => (
                  <tr
                    key={ch.channelId}
                    className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                  >
                    <td className="px-5 py-3">
                      <div className="font-semibold text-neutral-100">{ch.displayName}</div>
                      <div className="text-[10px] text-neutral-500">
                        {ch.channelId} · pageId {ch.pageId}
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      <PlatformPill platform={ch.platform as PlatformId} />
                    </td>
                    <td className="px-5 py-3">
                      <StatusBadge status={ch.status} />
                    </td>
                    <td className="px-5 py-3 text-neutral-300">{ch.postingRule}</td>
                    <td className="px-5 py-3">
                      <AccessBadge configured={ch.pageAccessConfigured} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardBody>
        </Card>
      ))}
    </div>
  );
}
