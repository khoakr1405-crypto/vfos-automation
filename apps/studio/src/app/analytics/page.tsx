import { LanePill, PlatformPill } from '@/components/badge';
import { Card, CardBody, CardHeader } from '@/components/card';
import { MockBanner } from '@/components/mock-banner';
import { PageHeader } from '@/components/page-header';
import { StatCard } from '@/components/stat-card';
import { Button } from '@/components/ui';
import {
  loadChannels,
  loadContentAngles,
  loadPerformanceMetrics,
  loadPublishedPosts,
} from '@/lib/growth-data/load';
import { LANES, LANE_LABEL, type PlatformId } from '@/lib/mock-data';
import { ACCENT_TEXT } from '@/lib/nav';
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
