/* =============================================================================
 * VFOS Studio — Content Angle board (Round Growth 03, READ-ONLY)
 * -----------------------------------------------------------------------------
 * Presentational. Nhận ContentAngle[] từ growth-data adapter. Render hook,
 * audience, lane, product affinity, status. Không fetch, không secret.
 * ========================================================================== */

import { Badge, LanePill } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import type { ContentAngle } from '@/lib/growth-data/types';
import { LANES, type LaneId } from '@/lib/mock-data';
import type { AccentKey } from '@/lib/nav';

const KNOWN_LANES = new Set<string>(LANES.map((l) => l.id));
const isLaneId = (lane: string): lane is LaneId => KNOWN_LANES.has(lane);

const ANGLE_STATUS: Record<string, { label: string; accent: AccentKey }> = {
  active: { label: 'Đang chạy', accent: 'green' },
  testing: { label: 'Đang test', accent: 'amber' },
  retired: { label: 'Ngừng', accent: 'rose' },
};

function AngleStatusBadge({ status }: { status: string }) {
  const meta = ANGLE_STATUS[status] ?? { label: status, accent: 'blue' as AccentKey };
  return <Badge accent={meta.accent}>{meta.label}</Badge>;
}

export function ContentAnglesSection({ angles }: { angles: ContentAngle[] }) {
  return (
    <Card>
      <CardHeader
        title="Content Angle Board"
        subtitle="Góc nội dung kéo view theo ngách — định hình hook/audience cho batch tới"
      />
      <CardBody>
        {angles.length === 0 ? (
          <p className="text-center text-xs text-neutral-500">
            Chưa có content angle nào trong Growth data.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {angles.map((a) => (
              <div
                key={a.angleId}
                className="space-y-2.5 rounded-xl border border-hairline bg-raised/20 p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-neutral-100">{a.name}</p>
                  <AngleStatusBadge status={a.status} />
                </div>
                <p className="text-xs italic text-neutral-400">“{a.hook}”</p>
                <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-neutral-500">
                  {isLaneId(a.lane) ? (
                    <LanePill laneId={a.lane} />
                  ) : (
                    <Badge accent="blue">{a.lane}</Badge>
                  )}
                  <span>· {a.audience}</span>
                </div>
                {a.productAffinity.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {a.productAffinity.map((p) => (
                      <span
                        key={p}
                        className="rounded-md border border-hairline bg-card px-1.5 py-0.5 text-[10px] text-neutral-400"
                      >
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
