import { FacebookPreflightCard } from '@/components/analytics/facebook-preflight-card';
import { ManualInputPreview } from '@/components/analytics/manual-input-preview';
import { ManualPerformanceSection } from '@/components/analytics/manual-performance-section';
import { Badge, LanePill, PlatformPill } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui';
import { computeCtaReadiness } from '@/lib/growth-data/cta-readiness';
import {
  loadAffiliateCtaPlans,
  loadChannels,
  loadContentAngles,
  loadCtaRoleMetrics,
  loadManualPerformanceSnapshots,
  loadPerformanceMetrics,
  loadPublishedPosts,
} from '@/lib/growth-data/load';
import type { CtaReadiness, LinkRole } from '@/lib/growth-data/types';
import { LANES, LANE_LABEL, type PlatformId } from '@/lib/mock-data';
import { ACCENT_TEXT, type AccentKey } from '@/lib/nav';
import { loadJobById } from '@/lib/studio-data/jobs';

// Hex per accent for the conic-gradient donut (CSS gradients can't read Tailwind classes).
const ACCENT_HEX: Record<string, string> = {
  blue: '#3b82f6',
  cyan: '#22d3ee',
  amber: '#f59e0b',
  violet: '#8b5cf6',
  green: '#22c55e',
  rose: '#f43f5e',
};

function formatNumber(num: number): string {
  return new Intl.NumberFormat('vi-VN').format(num);
}

// Affiliate Hub 05 — CTA role display (mock analytics).
const CTA_ROLE_ORDER: LinkRole[] = ['HUB_NATIVE', 'CAPTION_LINK', 'PINNED_COMMENT', 'REPLY_LINK'];
const CTA_ROLE_META: Record<LinkRole, { label: string; note: string; accent: AccentKey }> = {
  HUB_NATIVE: {
    label: 'Hub Native CTA',
    note: 'Native/banner CTA khi Facebook Affiliate Hub khả dụng.',
    accent: 'green',
  },
  CAPTION_LINK: {
    label: 'Caption Link',
    note: 'Link phụ trong caption (fallback khi chưa có Hub).',
    accent: 'cyan',
  },
  PINNED_COMMENT: {
    label: 'Pinned Comment Link',
    note: 'Link phụ trong comment ghim.',
    accent: 'violet',
  },
  REPLY_LINK: {
    label: 'Reply CTA',
    note: 'Chỉ dùng khi Comment Intelligence cho phép (intent-gated).',
    accent: 'amber',
  },
};
const READINESS_ACCENT: Record<CtaReadiness, AccentKey> = {
  ready: 'green',
  partial: 'amber',
  blocked: 'rose',
};

// biome-ignore lint/style/noDefaultExport: Next.js page requires default export
export default function AnalyticsPage() {
  const metrics = loadPerformanceMetrics();
  const posts = loadPublishedPosts();
  const channels = loadChannels();
  const angles = loadContentAngles();

  // 1. KPI summary values
  const totalViews = metrics.reduce((sum, m) => sum + (m.views || 0), 0);
  const totalClicks = metrics.reduce((sum, m) => sum + (m.clicks || 0), 0);
  const overallCtr = totalViews > 0 ? (totalClicks / totalViews) * 100 : 0;
  const totalReactions = metrics.reduce((sum, m) => sum + (m.reactions || 0), 0);
  const totalComments = metrics.reduce((sum, m) => sum + (m.commentsCount || 0), 0);
  const totalShares = metrics.reduce((sum, m) => sum + (m.shares || 0), 0);
  const totalInteractions = totalReactions + totalComments + totalShares;

  const funnelKpis = [
    { label: 'Lượt xem', value: formatNumber(totalViews), accent: 'blue' as const },
    { label: 'Lượt click', value: formatNumber(totalClicks), accent: 'violet' as const },
    { label: 'CTR trung bình', value: `${overallCtr.toFixed(2)}%`, accent: 'cyan' as const },
    { label: 'Tổng tương tác', value: formatNumber(totalInteractions), accent: 'green' as const },
  ];

  // 2. Group views/clicks by lane
  const viewsByLane: Record<string, number> = {};
  const clicksByLane: Record<string, number> = {};
  let totalLaneViews = 0;

  for (const m of metrics) {
    const post = posts.find((p) => p.publishedPostId === m.publishedPostId);
    const channel = post ? channels.find((c) => c.channelId === post.channelId) : null;
    const rawLane = channel?.lane || 'review';
    const laneId: 'review' | 'cau-ca' | 'rua-xe' =
      rawLane === 'cau-ca' || rawLane === 'rua-xe' ? rawLane : 'review';

    viewsByLane[laneId] = (viewsByLane[laneId] || 0) + (m.views || 0);
    clicksByLane[laneId] = (clicksByLane[laneId] || 0) + (m.clicks || 0);
    totalLaneViews += m.views || 0;
  }

  const laneBreakdown = LANES.map((lane) => {
    const views = viewsByLane[lane.id] || 0;
    const clicks = clicksByLane[lane.id] || 0;
    const pct = totalLaneViews > 0 ? Math.round((views / totalLaneViews) * 100) : 0;
    return {
      laneId: lane.id,
      label: lane.label,
      accent: lane.accent,
      views,
      clicks,
      percent: pct,
    };
  });

  // Conic stops calculation
  let acc = 0;
  const stops = laneBreakdown
    .map((row) => {
      const hex = ACCENT_HEX[row.accent] || '#3b82f6';
      const start = acc;
      acc += row.percent;
      return `${hex} ${start}% ${acc}%`;
    })
    .join(', ');

  const gradientBg =
    stops && acc > 0 ? `conic-gradient(${stops})` : 'conic-gradient(#3b82f6 0% 100%)';

  // 3. Group views/clicks by platform
  const viewsByPlatform: Record<string, number> = {};
  const clicksByPlatform: Record<string, number> = {};
  let maxPlatformViews = 0;

  for (const m of metrics) {
    const post = posts.find((p) => p.publishedPostId === m.publishedPostId);
    const channel = post ? channels.find((c) => c.channelId === post.channelId) : null;
    const rawPlatform = channel?.platform || 'facebook';
    const platform: PlatformId =
      rawPlatform === 'tiktok' || rawPlatform === 'youtube' ? rawPlatform : 'facebook';
    viewsByPlatform[platform] = (viewsByPlatform[platform] || 0) + (m.views || 0);
    clicksByPlatform[platform] = (clicksByPlatform[platform] || 0) + (m.clicks || 0);
    if (viewsByPlatform[platform] > maxPlatformViews) {
      maxPlatformViews = viewsByPlatform[platform];
    }
  }

  const platformBreakdown = (
    [
      { id: 'facebook', label: 'Facebook Reels', accent: 'blue' as const },
      { id: 'tiktok', label: 'TikTok', accent: 'cyan' as const },
      { id: 'youtube', label: 'YouTube Shorts', accent: 'rose' as const },
    ] as const
  ).map((p) => {
    const views = viewsByPlatform[p.id] || 0;
    const clicks = clicksByPlatform[p.id] || 0;
    const ctr = views > 0 ? (clicks / views) * 100 : 0;
    const barPercent = maxPlatformViews > 0 ? Math.round((views / maxPlatformViews) * 100) : 0;
    return {
      ...p,
      views,
      clicks,
      ctr,
      barPercent,
    };
  });

  // 4. Detailed list
  const performanceDetails = metrics.map((m) => {
    const post = posts.find((p) => p.publishedPostId === m.publishedPostId);
    const channel = post ? channels.find((c) => c.channelId === post.channelId) : null;
    const realJob = post ? loadJobById(post.jobId) : null;
    const videoTitle =
      realJob?.product || realJob?.title || post?.videoId || post?.jobId || 'Video không rõ';

    const rawLane = channel?.lane || 'review';
    const laneId: 'review' | 'cau-ca' | 'rua-xe' =
      rawLane === 'cau-ca' || rawLane === 'rua-xe' ? rawLane : 'review';
    const rawPlatform = channel?.platform || 'facebook';
    const platform: PlatformId =
      rawPlatform === 'tiktok' || rawPlatform === 'youtube' ? rawPlatform : 'facebook';

    const ctrPercent = m.views > 0 ? (m.clicks / m.views) * 100 : 0;

    return {
      publishedPostId: m.publishedPostId,
      facebookPostId: post?.facebookPostId || 'N/A',
      videoTitle,
      laneId,
      platform,
      channelName: channel?.displayName || 'Kênh ẩn danh',
      views: m.views,
      clicks: m.clicks,
      ctr: ctrPercent,
      source: m.source,
    };
  });

  performanceDetails.sort((a, b) => b.views - a.views);

  // 5. CTA role breakdown (Affiliate Hub 05 — MOCK). Join role metrics ↔ CTA plan.
  const ctaRoleMetrics = loadCtaRoleMetrics();
  const ctaPlanByJobId = new Map(loadAffiliateCtaPlans().map((p) => [p.jobId, p]));

  const ctaRoleBreakdown = CTA_ROLE_ORDER.map((role) => {
    const recs = ctaRoleMetrics.filter((m) => m.role === role);
    const impressions = recs.reduce((s, m) => s + m.impressions, 0);
    const clicks = recs.reduce((s, m) => s + m.clicks, 0);
    const conversions = recs.reduce((s, m) => s + m.conversions, 0);
    const ctr = impressions > 0 ? (clicks / impressions) * 100 : 0;
    return { role, ...CTA_ROLE_META[role], impressions, clicks, conversions, ctr };
  });

  const ctaByJob = [...new Set(ctaRoleMetrics.map((m) => m.jobId))]
    .map((jobId) => {
      const recs = ctaRoleMetrics.filter((m) => m.jobId === jobId);
      const totalClicks = recs.reduce((s, m) => s + m.clicks, 0);
      const top = recs.reduce((best, m) => (m.clicks > best.clicks ? m : best), recs[0]);
      const plan = ctaPlanByJobId.get(jobId);
      const realJob = loadJobById(jobId);
      return {
        jobId,
        title: realJob?.product || realJob?.title || jobId,
        ctaMode: plan?.ctaMode ?? null,
        readiness: plan ? computeCtaReadiness(plan) : null,
        totalClicks,
        topRole: top ? CTA_ROLE_META[top.role].label : '—',
      };
    })
    .sort((a, b) => b.totalClicks - a.totalClicks);

  // 6. Manual performance input foundation (Real Analytics 01 — manual/import, read-only).
  const manualSnapshots = loadManualPerformanceSnapshots();
  const fixturePostIdByJob = new Map(posts.map((p) => [p.jobId, p.publishedPostId]));

  // 7. Known ids cho preview validate (Real Analytics 02A — chỉ cảnh báo match, không ghi).
  const knownJobIds = [...new Set([...posts.map((p) => p.jobId), ...ctaPlanByJobId.keys()])];
  const knownPostIds = posts.map((p) => p.publishedPostId);

  return (
    <div className="space-y-6">
      <MockBanner />

      <div className="flex items-center gap-2 rounded-xl border border-accent-cyan/30 bg-accent-cyan/10 px-3.5 py-2 text-[11px] text-accent-cyan">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-accent-cyan" />
        <span>
          <strong>GROWTH FIXTURE DATA · READ-ONLY.</strong> Số liệu bên dưới được tải từ tệp tin cấu
          hình giả lập (growth fixtures/mock seed) để tối ưu hóa hiển thị. Hệ thống chưa kết nối
          trực tiếp với Meta Graph API/Insights API thật.
        </span>
      </div>

      <PageHeader
        no={10}
        icon="analytics"
        accent="green"
        title="Hiệu suất / Analytics"
        description="View → click → chuyển đổi → doanh thu theo ngách và nền tảng. Học để tối ưu batch sau."
        actions={
          <>
            <Button variant="outline" className="!py-1.5">
              7 ngày
            </Button>
            <Button variant="ghost" className="!py-1.5">
              30 ngày
            </Button>
            <Button variant="ghost" className="!py-1.5">
              90 ngày
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {funnelKpis.map((k) => (
          <StatCard key={k.label} {...k} />
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Lượt xem theo ngách — donut */}
        <Card>
          <CardHeader
            title="Lượt xem theo ngách"
            subtitle="Tỷ trọng (growth fixture)"
            accentClass="text-accent-green"
          />
          <CardBody className="flex items-center gap-6">
            <div
              className="relative h-32 w-32 shrink-0 rounded-full"
              style={{ background: gradientBg }}
            >
              <div className="absolute inset-[14px] flex items-center justify-center rounded-full bg-card text-center">
                <div>
                  <p className="text-[10px] text-neutral-500">Tổng views</p>
                  <p className="text-sm font-semibold text-neutral-100">
                    {formatNumber(totalViews)}
                  </p>
                </div>
              </div>
            </div>
            <ul className="flex-1 space-y-2">
              {laneBreakdown.map((row) => {
                return (
                  <li key={row.laneId} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-sm bg-current"
                        style={{ color: ACCENT_HEX[row.accent ?? 'blue'] }}
                      />
                      <span className="text-neutral-300">{row.label}</span>
                    </span>
                    <span className={`font-semibold ${ACCENT_TEXT[row.accent ?? 'blue']}`}>
                      {row.percent}%
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>

        {/* Lượt xem theo nền tảng — bars */}
        <Card>
          <CardHeader
            title="Lượt xem theo nền tảng"
            subtitle="So sánh (growth fixture)"
            accentClass="text-accent-green"
          />
          <CardBody className="space-y-4 pt-5">
            {platformBreakdown.map((row) => (
              <div key={row.id}>
                <div className="mb-1.5 flex items-center justify-between">
                  <PlatformPill platform={row.id} />
                  <span className="text-xs font-semibold text-neutral-100">
                    {formatNumber(row.views)} views ({row.ctr.toFixed(2)}% CTR)
                  </span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-raised">
                  <div
                    className="h-full rounded-full bg-accent-green"
                    style={{ width: `${row.barPercent}%` }}
                  />
                </div>
              </div>
            ))}
          </CardBody>
        </Card>
      </div>

      {/* CTA Performance by Role — Mock (Affiliate Hub 05) */}
      <Card>
        <CardHeader
          title="CTA Performance by Role — Mock"
          subtitle="Hiệu quả theo vai trò CTA · dữ liệu giả lập (fixture), CHƯA phải số liệu Facebook/Shopee thật"
          accentClass="text-accent-amber"
          right={<Badge accent="amber">MOCK / READ-ONLY</Badge>}
        />
        <CardBody className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {ctaRoleBreakdown.map((r) => (
              <div key={r.role} className="rounded-xl border border-hairline bg-raised/40 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-neutral-100">{r.label}</p>
                  <Badge accent={r.accent}>{r.role}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-[10px] text-neutral-500">Clicks</p>
                    <p className="text-sm font-semibold text-neutral-100">
                      {formatNumber(r.clicks)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500">CTR</p>
                    <p className="text-sm font-semibold text-accent-green">{r.ctr.toFixed(2)}%</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-neutral-500">Conv.</p>
                    <p className="text-sm font-semibold text-neutral-100">
                      {formatNumber(r.conversions)}
                    </p>
                  </div>
                </div>
                <p className="mt-2.5 text-[10px] leading-relaxed text-neutral-500">{r.note}</p>
              </div>
            ))}
          </div>

          {/* Per-job CTA breakdown */}
          <div>
            <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
              Theo job/video (mock)
            </p>
            <div className="overflow-x-auto rounded-xl border border-hairline">
              <table className="w-full min-w-[640px] text-left text-xs">
                <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
                  <tr className="border-b border-hairline">
                    <th className="px-4 py-2.5 font-medium">Job / Sản phẩm</th>
                    <th className="px-4 py-2.5 font-medium">ctaMode</th>
                    <th className="px-4 py-2.5 font-medium">Readiness</th>
                    <th className="px-4 py-2.5 font-medium text-right">Tổng CTA clicks</th>
                    <th className="px-4 py-2.5 font-medium">Top role</th>
                  </tr>
                </thead>
                <tbody>
                  {ctaByJob.map((j) => (
                    <tr
                      key={j.jobId}
                      className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium text-neutral-100">{j.title}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-neutral-500">
                          {j.jobId}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-neutral-300">{j.ctaMode ?? '—'}</td>
                      <td className="px-4 py-3">
                        {j.readiness ? (
                          <Badge accent={READINESS_ACCENT[j.readiness]}>
                            {j.readiness.toUpperCase()}
                          </Badge>
                        ) : (
                          <span className="text-neutral-500">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-neutral-100">
                        {formatNumber(j.totalClicks)}
                      </td>
                      <td className="px-4 py-3 text-neutral-300">{j.topRole}</td>
                    </tr>
                  ))}
                  {ctaByJob.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-neutral-500">
                        Chưa có dữ liệu CTA role (mock)
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <p className="text-[10px] leading-relaxed text-neutral-500">
            <strong>Lưu ý chiến lược:</strong> số role mỗi video tùy <code>ctaMode</code> — review 1
            sản phẩm chỉ cần 1 Primary CTA hợp lệ; multi-touch mới dùng thêm link phụ. Analytics chỉ
            đo hiệu quả theo role, không ép spam nhiều link.
          </p>
        </CardBody>
      </Card>

      {/* Facebook Preflight Capability — Real API 02A */}
      <FacebookPreflightCard />

      {/* Manual Performance Input — Foundation (Real Analytics 01) */}
      <ManualPerformanceSection
        snapshots={manualSnapshots}
        fixtureMetrics={metrics}
        fixturePostIdByJob={fixturePostIdByJob}
      />

      {/* Manual Performance Input — Preview Only (Real Analytics 02A) */}
      <ManualInputPreview knownJobIds={knownJobIds} knownPostIds={knownPostIds} />

      {/* Top performers */}
      <Card>
        <CardHeader
          title="Top video hiệu quả"
          subtitle="Theo lượt xem (growth fixture)"
          accentClass="text-accent-green"
        />
        <CardBody className="!p-0">
          <table className="w-full text-left text-xs">
            <thead className="text-[10px] uppercase tracking-wider text-neutral-600">
              <tr className="border-b border-hairline">
                <th className="px-5 py-2.5 font-medium">Video / Bài viết</th>
                <th className="px-5 py-2.5 font-medium">Kênh</th>
                <th className="px-5 py-2.5 font-medium">Ngách</th>
                <th className="px-5 py-2.5 font-medium">Nền tảng</th>
                <th className="px-5 py-2.5 font-medium text-right">Lượt xem</th>
                <th className="px-5 py-2.5 font-medium text-right">Lượt click</th>
                <th className="px-5 py-2.5 font-medium text-right">CTR</th>
              </tr>
            </thead>
            <tbody>
              {performanceDetails.map((v) => (
                <tr
                  key={v.publishedPostId}
                  className="border-b border-hairline/60 last:border-0 hover:bg-raised/30"
                >
                  <td className="px-5 py-3 font-medium text-neutral-100">
                    <div>
                      <div>{v.videoTitle}</div>
                      <div className="text-[10px] text-neutral-500 font-mono mt-0.5">
                        Post ID: {v.facebookPostId}
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3 text-neutral-300">{v.channelName}</td>
                  <td className="px-5 py-3">
                    <LanePill laneId={v.laneId} />
                  </td>
                  <td className="px-5 py-3">
                    <PlatformPill platform={v.platform} />
                  </td>
                  <td className="px-5 py-3 text-right text-neutral-200">{formatNumber(v.views)}</td>
                  <td className="px-5 py-3 text-right text-neutral-200">
                    {formatNumber(v.clicks)}
                  </td>
                  <td className="px-5 py-3 text-right text-accent-green font-semibold">
                    {v.ctr.toFixed(2)}%
                  </td>
                </tr>
              ))}
              {performanceDetails.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-neutral-500">
                    Chưa có dữ liệu hiệu suất
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </CardBody>
      </Card>
    </div>
  );
}
