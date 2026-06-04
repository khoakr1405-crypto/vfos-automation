/* =============================================================================
 * VFOS Studio — Posting Plan table (Round Growth 04, READ-ONLY)
 * -----------------------------------------------------------------------------
 * Presentational. Nhận PostingPlan[] + Channel[] + PublishedPost[] từ growth-data
 * adapter (server component cha). Render lịch đăng theo thời gian: kênh, ngách,
 * nền tảng, job, bài đã đăng, trạng thái. KHÔNG fetch, KHÔNG auto-publish,
 * KHÔNG token. Fallback rõ khi rỗng (không crash).
 * ========================================================================== */

import { Badge, LanePill, PlatformPill } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import type { CtaReadinessSummary } from '@/lib/growth-data/cta-readiness';
import type { Channel, PostingPlan, PublishedPost } from '@/lib/growth-data/types';
import { LANES, type LaneId, type PlatformId } from '@/lib/mock-data';
import type { AccentKey } from '@/lib/nav';
import { CtaScheduleCell, NoCtaPlanCell } from './cta-status';

const KNOWN_LANES = new Set<string>(LANES.map((l) => l.id));
const isLaneId = (lane: string): lane is LaneId => KNOWN_LANES.has(lane);

const PLAN_STATUS: Record<string, { label: string; accent: AccentKey }> = {
  planned: { label: 'Đã lên lịch', accent: 'blue' },
  posted: { label: 'Đã đăng', accent: 'green' },
  skipped: { label: 'Bỏ qua', accent: 'rose' },
};

function PlanStatusBadge({ status }: { status: string }) {
  const meta = PLAN_STATUS[status] ?? { label: status, accent: 'amber' as AccentKey };
  return <Badge accent={meta.accent}>{meta.label}</Badge>;
}

/** Format ISO slotTime theo UTC (deterministic, không phụ thuộc TZ server). */
function formatSlot(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} · ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

export function PostingPlanSection({
  plans,
  channels,
  publishedPosts,
  ctaByJobId,
}: {
  plans: PostingPlan[];
  channels: Channel[];
  publishedPosts: PublishedPost[];
  /** jobId → CTA readiness summary (Hub 06). Thiếu plan → ô "Chưa có plan". */
  ctaByJobId: Map<string, CtaReadinessSummary>;
}) {
  if (plans.length === 0) {
    return (
      <Card>
        <CardBody className="text-center text-xs text-neutral-500">
          Chưa có lịch đăng nào trong Growth data.
        </CardBody>
      </Card>
    );
  }

  const channelById = new Map(channels.map((c) => [c.channelId, c]));
  const postByJobId = new Map(publishedPosts.map((p) => [p.jobId, p]));
  const sorted = [...plans].sort((a, b) => a.slotTime.localeCompare(b.slotTime));
  const count = (status: string) => plans.filter((p) => p.status === status).length;

  return (
    <Card>
      <CardHeader
        title="Lịch đăng / Posting Plan"
        subtitle={`${count('planned')} đã lên lịch · ${count('posted')} đã đăng · ${count('skipped')} bỏ qua`}
      />
      <CardBody className="overflow-x-auto !p-0">
        <table className="w-full min-w-[940px] text-left text-xs">
          <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
            <tr className="border-b border-hairline">
              <th className="px-5 py-2.5 font-medium">Thời gian (UTC)</th>
              <th className="px-5 py-2.5 font-medium">Kênh</th>
              <th className="px-5 py-2.5 font-medium">Ngách</th>
              <th className="px-5 py-2.5 font-medium">Nền tảng</th>
              <th className="px-5 py-2.5 font-medium">Job</th>
              <th className="px-5 py-2.5 font-medium">Bài đã đăng</th>
              <th className="px-5 py-2.5 font-medium">Trạng thái</th>
              <th className="px-5 py-2.5 font-medium">CTA Readiness</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((plan) => {
              const ch = channelById.get(plan.channelId);
              const post = plan.jobId ? postByJobId.get(plan.jobId) : undefined;
              const cta = plan.jobId ? ctaByJobId.get(plan.jobId) : undefined;
              return (
                <tr
                  key={plan.planId}
                  className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                >
                  <td className="px-5 py-3 font-semibold text-neutral-100">
                    {formatSlot(plan.slotTime)}
                  </td>
                  <td className="px-5 py-3 text-neutral-300">
                    {ch ? ch.displayName : plan.channelId}
                  </td>
                  <td className="px-5 py-3">
                    {ch && isLaneId(ch.lane) ? (
                      <LanePill laneId={ch.lane} />
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <PlatformPill platform={plan.platform as PlatformId} />
                  </td>
                  <td className="px-5 py-3">
                    {plan.jobId ? (
                      <span className="text-neutral-300">{plan.jobId}</span>
                    ) : (
                      <span className="text-neutral-600">Chưa gắn job</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    {post ? (
                      <span className="text-neutral-300">
                        {post.publishedPostId}
                        <span className="text-[10px] text-neutral-600">
                          {' '}
                          · fb {post.facebookPostId}
                        </span>
                      </span>
                    ) : (
                      <span className="text-neutral-600">Chưa publish</span>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <PlanStatusBadge status={plan.status} />
                  </td>
                  <td className="px-5 py-3 align-top">
                    {cta ? <CtaScheduleCell summary={cta} /> : <NoCtaPlanCell />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardBody>
    </Card>
  );
}
