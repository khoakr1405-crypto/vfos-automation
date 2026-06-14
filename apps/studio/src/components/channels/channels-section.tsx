/* =============================================================================
 * VFOS Studio — Channels section (Niche → Channel → Job, READ-ONLY)
 * -----------------------------------------------------------------------------
 * Presentational. Nhận Niche[] + Channel[] từ growth-data adapter (server cha),
 * gom theo NGÁCH (niche.lane khớp channel.lane), render bảng kênh dưới mỗi ngách.
 * KHÔNG fetch, KHÔNG token — pageAccess chỉ là cờ boolean. Fallback rõ khi không
 * có dữ liệu (không crash). Tên ngách lấy từ niche.displayName → hết lệch label.
 * ========================================================================== */

import { Badge, PlatformPill, StatusBadge } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import type { Channel, Niche } from '@/lib/growth-data/types';
import type { PlatformId } from '@/lib/mock-data';

function AccessBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <Badge accent="green">Đã cấu hình</Badge>
  ) : (
    <Badge accent="amber">Chưa cấu hình</Badge>
  );
}

function ChannelTable({ rows }: { rows: Channel[] }) {
  return (
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
  );
}

export function ChannelsSection({
  niches,
  channels,
}: {
  niches: Niche[];
  channels: Channel[];
}) {
  if (channels.length === 0) {
    return (
      <Card>
        <CardBody className="text-center text-xs text-neutral-500">
          Chưa có kênh nào trong Growth data.
        </CardBody>
      </Card>
    );
  }

  // Gom kênh theo NGÁCH: mỗi niche → các channel có lane khớp niche.lane.
  const lanesWithNiche = new Set(niches.map((n) => n.lane));
  const orphans = channels.filter((c) => !lanesWithNiche.has(c.lane));

  return (
    <div className="space-y-5">
      {niches.map((niche) => {
        const rows = channels.filter((c) => c.lane === niche.lane);
        return (
          <Card key={niche.nicheId}>
            <CardHeader
              title={`Ngách · ${niche.displayName}`}
              subtitle={`${rows.length} kênh · ${niche.platforms.join(', ') || '—'}`}
              right={
                <div className="flex items-center gap-2">
                  <StatusBadge status={niche.status} />
                  <Badge accent="blue">{niche.nicheId}</Badge>
                </div>
              }
            />
            {rows.length === 0 ? (
              <CardBody className="text-center text-xs text-neutral-500">
                Ngách chưa có kênh nào (lane {niche.lane}).
              </CardBody>
            ) : (
              <ChannelTable rows={rows} />
            )}
          </Card>
        );
      })}

      {orphans.length > 0 && (
        <Card key="__orphans__">
          <CardHeader
            title="Chưa gán ngách"
            subtitle={`${orphans.length} kênh — lane không khớp niche nào trong config/niches.json`}
            right={<Badge accent="amber">Cần gán</Badge>}
          />
          <ChannelTable rows={orphans} />
        </Card>
      )}
    </div>
  );
}
