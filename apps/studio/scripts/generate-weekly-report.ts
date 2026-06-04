import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  loadAffiliateCtaPlans,
  loadChannels,
  loadPublishedPosts,
} from '../src/lib/growth-data/load';
import { resolveInsideRepo } from '../src/lib/growth-data/paths';
import { readApiRuntimeStore, readRuntimeStore } from '../src/lib/growth-data/runtime-store';

// KPI interface definitions
interface WeeklyGrowthReport {
  schemaVersion: 1;
  reportId: string;
  weekId: string;
  periodStart: string;
  periodEnd: string;
  generatedAt: string;
  dataConfidence: 'low' | 'medium' | 'high';
  dataSources: {
    facebookApiSnapshots: number;
    manualSnapshots: number;
    fixtureFallbackUsed: boolean;
  };
  kpi: {
    views: number;
    impressions: number;
    clicks: number;
    comments: number;
    reactions: number;
    shares: number;
    saves: number;
    conversions: number;
    ctr: number | null;
    conversionRate: number | null;
  };
  breakdowns: {
    byPlatform: Array<{
      platform: string;
      views: number;
      clicks: number;
      conversions: number;
      ctr: number | null;
      conversionRate: number | null;
    }>;
    byChannel: Array<{
      channelId: string;
      displayName: string;
      views: number;
      clicks: number;
      conversions: number;
      ctr: number | null;
      conversionRate: number | null;
    }>;
    byLane: Array<{
      lane: string;
      views: number;
      clicks: number;
      conversions: number;
      ctr: number | null;
      conversionRate: number | null;
    }>;
    byCtaRole: Array<{
      ctaRole: string;
      clicks: number;
      conversions: number;
      conversionRate: number | null;
    }>;
    byJob: Array<{
      jobId: string;
      views: number;
      clicks: number;
      conversions: number;
      ctr: number | null;
      conversionRate: number | null;
    }>;
  };
  winners: {
    topJob: { jobId: string; views: number; clicks: number; conversions: number } | null;
    topPlatform: string | null;
    topCtaRole: string | null;
    topChannel: { channelId: string; displayName: string } | null;
  };
  problems: Array<{
    type: string;
    severity: 'low' | 'medium' | 'high';
    message: string;
    suggestedFix: string;
  }>;
  decisions: Array<{
    type: 'scale' | 'fix' | 'watch' | 'collect_more_data';
    message: string;
    rationale: string;
  }>;
  actionPlan: string[];
}

// Rule Thresholds
const THRESHOLDS = {
  MIN_VIEWS_FOR_CTR: 500,
  MIN_CLICKS_FOR_CVR: 10,
  LOW_CTR: 0.01, // < 1% CTR is low
  GOOD_CTR: 0.03, // >= 3% CTR is good
  LOW_CVR: 0.02, // < 2% CVR is low
  GOOD_CVR: 0.05, // >= 5% CVR is good
  GOOD_VIEWS: 5000,
};

// Simple helper to calculate ISO Week ID from Date
function getIsoWeekId(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = d.getUTCDay();
  const diff = 4 - (day === 0 ? 7 : day);
  d.setUTCDate(d.getUTCDate() + diff);
  const year = d.getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(weekNo).padStart(2, '0')}`;
}

// Get the Monday and Sunday Range of an ISO Week ID
function getIsoWeekRange(weekId: string): { start: Date; end: Date } {
  const match = weekId.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    throw new Error(`Định dạng tuần không hợp lệ: ${weekId}. Kì vọng YYYY-WNN`);
  }
  const year = Number.parseInt(match[1], 10);
  const week = Number.parseInt(match[2], 10);

  const jan4 = new Date(year, 0, 4, 12, 0, 0, 0);
  const day = jan4.getDay();
  const diffToThursday = 4 - (day === 0 ? 7 : day);
  const firstThursday = new Date(jan4.getTime() + diffToThursday * 86400000);
  const firstMonday = new Date(firstThursday.getTime() - 3 * 86400000);

  const startMonday = new Date(firstMonday.getTime() + (week - 1) * 7 * 86400000);
  startMonday.setHours(0, 0, 0, 0);

  const endSunday = new Date(startMonday.getTime() + 7 * 86400000 - 1);
  return { start: startMonday, end: endSunday };
}

// Resolve lane details helper
const cachedPosts = loadPublishedPosts();
const cachedChannels = loadChannels();
const cachedCtaPlans = loadAffiliateCtaPlans();

function getLaneForJob(jobId: string): string {
  const post = cachedPosts.find((p) => p.jobId === jobId);
  if (post) {
    const channel = cachedChannels.find((c) => c.channelId === post.channelId);
    if (channel) return channel.lane;
  }
  const plan = cachedCtaPlans.find((p) => p.jobId === jobId);
  if (plan) return plan.lane;
  return 'default';
}

function getChannelDisplayName(channelId: string | null): string {
  if (!channelId) return 'Không xác định';
  const ch = cachedChannels.find((c) => c.channelId === channelId);
  return ch ? ch.displayName : channelId;
}

// Deduplicated Snapshot shape
interface DeduplicatedSnapshot {
  jobId: string;
  publishedPostId: string | null;
  facebookPostId: string | null;
  channelId: string | null;
  platform: string;
  measuredAt: string;
  views: number | null;
  impressions: number | null;
  clicks: number | null;
  comments: number | null;
  reactions: number | null;
  shares: number | null;
  saves: number | null;
  conversions: number | null;
  ctaRole: string | null;
  source: string;
}

interface JobAggregate {
  jobId: string;
  platform: string;
  channelId: string | null;
  lane: string;
  views: number;
  impressions: number;
  clicks: number;
  comments: number;
  reactions: number;
  shares: number;
  saves: number;
  conversions: number;
}

function main(): number {
  // Parse CLI args
  const args = process.argv.slice(2);
  let weekId: string | null = null;
  let dryRun = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--week' && args[i + 1]) {
      weekId = args[i + 1];
      i++;
    } else if (args[i] === '--dry-run') {
      dryRun = true;
    }
  }

  // Calculate default week if not provided
  if (!weekId) {
    const now = new Date();
    const day = now.getDay();
    // Monday (1) runs previous week report
    if (day === 1) {
      const prev = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      weekId = getIsoWeekId(prev);
    } else {
      weekId = getIsoWeekId(now);
    }
  }

  const range = getIsoWeekRange(weekId);
  console.log(
    `Báo cáo tuần: ${weekId} (${range.start.toISOString().split('T')[0]} tới ${range.end.toISOString().split('T')[0]})`,
  );

  // Load manual & API runtime snapshots
  const allManual = readRuntimeStore().snapshots;
  const allApi = readApiRuntimeStore().snapshots;

  // Filter within range
  const manualSnapshots = allManual.filter((s) => {
    const d = new Date(s.measuredAt);
    return d >= range.start && d <= range.end;
  });

  const apiSnapshots = allApi.filter((s) => {
    const d = new Date(s.measuredAt);
    return d >= range.start && d <= range.end;
  });

  const totalRawCount = manualSnapshots.length + apiSnapshots.length;

  // Prepare standard shape
  const normalized: DeduplicatedSnapshot[] = [
    ...apiSnapshots.map((s) => ({
      jobId: s.jobId,
      publishedPostId: s.publishedPostId || null,
      facebookPostId: s.facebookPostId || null,
      channelId: s.channelId || null,
      platform: s.platform,
      measuredAt: s.measuredAt,
      views: s.views,
      impressions: s.impressions,
      clicks: s.clicks,
      comments: s.comments,
      reactions: s.reactions,
      shares: s.shares,
      saves: s.saves,
      conversions: s.conversions,
      ctaRole: s.ctaRole || null,
      source: s.source,
    })),
    ...manualSnapshots.map((s) => ({
      jobId: s.jobId,
      publishedPostId: s.publishedPostId || null,
      facebookPostId: s.facebookPostId || null,
      channelId: s.channelId || null,
      platform: s.platform,
      measuredAt: s.measuredAt,
      views: s.views,
      impressions: null,
      clicks: s.clicks,
      comments: s.comments,
      reactions: s.reactions,
      shares: s.shares,
      saves: null,
      conversions: s.conversions,
      ctaRole: s.ctaRole || null,
      source: s.source,
    })),
  ];

  // Deduplicate by (jobId, ctaRole, source) -> select latest measuredAt
  const latestMap = new Map<string, DeduplicatedSnapshot>();
  for (const s of normalized) {
    const key = `${s.jobId}__${s.ctaRole || 'post'}__${s.source}`;
    const existing = latestMap.get(key);
    if (!existing || new Date(s.measuredAt) > new Date(existing.measuredAt)) {
      latestMap.set(key, s);
    }
  }
  const deduped = Array.from(latestMap.values());

  // Aggregate by job
  const snapsByJob = new Map<string, DeduplicatedSnapshot[]>();
  for (const s of deduped) {
    const arr = snapsByJob.get(s.jobId) || [];
    arr.push(s);
    snapsByJob.set(s.jobId, arr);
  }

  const jobAggregates: JobAggregate[] = [];
  for (const [jobId, jobSnaps] of snapsByJob.entries()) {
    const firstSnap = jobSnaps[0];
    const platform = firstSnap.platform;
    let channelId = jobSnaps.find((s) => s.channelId !== null)?.channelId || null;
    if (!channelId) {
      const matchedPost = cachedPosts.find((p) => p.jobId === jobId);
      if (matchedPost) {
        channelId = matchedPost.channelId;
      }
    }
    const lane = getLaneForJob(jobId);

    // Find post-level snapshot with priority
    const postSnaps = jobSnaps.filter((s) => s.ctaRole === null);
    let bestPostSnap: DeduplicatedSnapshot | null = null;
    if (postSnaps.length > 0) {
      const priorities: Record<string, number> = {
        facebook_api: 4,
        manual_import: 3,
        manual: 2,
        fixture: 1,
      };
      postSnaps.sort((a, b) => (priorities[b.source] || 0) - (priorities[a.source] || 0));
      bestPostSnap = postSnaps[0];
    }

    const roleSnaps = jobSnaps.filter((s) => s.ctaRole !== null);

    let views = 0;
    let impressions = 0;
    let comments = 0;
    let reactions = 0;
    let shares = 0;
    let saves = 0;

    if (bestPostSnap) {
      views = bestPostSnap.views || 0;
      impressions = bestPostSnap.impressions || 0;
      comments = bestPostSnap.comments || 0;
      reactions = bestPostSnap.reactions || 0;
      shares = bestPostSnap.shares || 0;
      saves = bestPostSnap.saves || 0;
    } else {
      views = roleSnaps.reduce((acc, s) => acc + (s.views || 0), 0);
      impressions = roleSnaps.reduce((acc, s) => acc + (s.impressions || 0), 0);
      comments = roleSnaps.reduce((acc, s) => acc + (s.comments || 0), 0);
      reactions = roleSnaps.reduce((acc, s) => acc + (s.reactions || 0), 0);
      shares = roleSnaps.reduce((acc, s) => acc + (s.shares || 0), 0);
      saves = roleSnaps.reduce((acc, s) => acc + (s.saves || 0), 0);
    }

    let clicks = 0;
    let conversions = 0;
    if (roleSnaps.length > 0) {
      clicks = roleSnaps.reduce((acc, s) => acc + (s.clicks || 0), 0);
      conversions = roleSnaps.reduce((acc, s) => acc + (s.conversions || 0), 0);
    } else if (bestPostSnap) {
      clicks = bestPostSnap.clicks || 0;
      conversions = bestPostSnap.conversions || 0;
    }

    jobAggregates.push({
      jobId,
      platform,
      channelId,
      lane,
      views,
      impressions,
      clicks,
      comments,
      reactions,
      shares,
      saves,
      conversions,
    });
  }

  // Populate overall KPIs
  const kpi = {
    views: 0,
    impressions: 0,
    clicks: 0,
    comments: 0,
    reactions: 0,
    shares: 0,
    saves: 0,
    conversions: 0,
    ctr: null as number | null,
    conversionRate: null as number | null,
  };

  for (const job of jobAggregates) {
    kpi.views += job.views;
    kpi.impressions += job.impressions;
    kpi.clicks += job.clicks;
    kpi.comments += job.comments;
    kpi.reactions += job.reactions;
    kpi.shares += job.shares;
    kpi.saves += job.saves;
    kpi.conversions += job.conversions;
  }

  if (kpi.views > 0) {
    kpi.ctr = kpi.clicks / kpi.views;
  }
  if (kpi.clicks > 0) {
    kpi.conversionRate = kpi.conversions / kpi.clicks;
  }

  // Determine Data Confidence
  const facebookApiSnapshots = apiSnapshots.length;
  const manualSnapshotsCount = manualSnapshots.length;
  let dataConfidence: 'low' | 'medium' | 'high' = 'low';
  if (facebookApiSnapshots > 0 && manualSnapshotsCount > 0) {
    dataConfidence = 'high';
  } else if (facebookApiSnapshots > 0 || manualSnapshotsCount > 0) {
    dataConfidence = 'medium';
  }

  // Breakdowns
  const byPlatformMap = new Map<string, typeof kpi>();
  const byChannelMap = new Map<string, typeof kpi>();
  const byLaneMap = new Map<string, typeof kpi>();

  for (const job of jobAggregates) {
    // Platform
    const plat = byPlatformMap.get(job.platform) || { ...kpi, ctr: 0, conversionRate: 0 };
    plat.views += job.views;
    plat.impressions += job.impressions;
    plat.clicks += job.clicks;
    plat.conversions += job.conversions;
    byPlatformMap.set(job.platform, plat);

    // Channel
    if (job.channelId) {
      const chan = byChannelMap.get(job.channelId) || { ...kpi, ctr: 0, conversionRate: 0 };
      chan.views += job.views;
      chan.impressions += job.impressions;
      chan.clicks += job.clicks;
      chan.conversions += job.conversions;
      byChannelMap.set(job.channelId, chan);
    }

    // Lane
    const ln = byLaneMap.get(job.lane) || { ...kpi, ctr: 0, conversionRate: 0 };
    ln.views += job.views;
    ln.impressions += job.impressions;
    ln.clicks += job.clicks;
    ln.conversions += job.conversions;
    byLaneMap.set(job.lane, ln);
  }

  const byPlatform = Array.from(byPlatformMap.entries()).map(([platform, stats]) => ({
    platform,
    views: stats.views,
    clicks: stats.clicks,
    conversions: stats.conversions,
    ctr: stats.views > 0 ? stats.clicks / stats.views : null,
    conversionRate: stats.clicks > 0 ? stats.conversions / stats.clicks : null,
  }));

  const byChannel = Array.from(byChannelMap.entries()).map(([channelId, stats]) => ({
    channelId,
    displayName: getChannelDisplayName(channelId),
    views: stats.views,
    clicks: stats.clicks,
    conversions: stats.conversions,
    ctr: stats.views > 0 ? stats.clicks / stats.views : null,
    conversionRate: stats.clicks > 0 ? stats.conversions / stats.clicks : null,
  }));

  const byLane = Array.from(byLaneMap.entries()).map(([lane, stats]) => ({
    lane,
    views: stats.views,
    clicks: stats.clicks,
    conversions: stats.conversions,
    ctr: stats.views > 0 ? stats.clicks / stats.views : null,
    conversionRate: stats.clicks > 0 ? stats.conversions / stats.clicks : null,
  }));

  // byCtaRole (sum only from role-level snapshots)
  const byCtaRoleMap = new Map<string, { clicks: number; conversions: number }>();
  for (const s of deduped) {
    if (s.ctaRole) {
      const existing = byCtaRoleMap.get(s.ctaRole) || { clicks: 0, conversions: 0 };
      existing.clicks += s.clicks || 0;
      existing.conversions += s.conversions || 0;
      byCtaRoleMap.set(s.ctaRole, existing);
    }
  }
  const byCtaRole = Array.from(byCtaRoleMap.entries()).map(([ctaRole, stats]) => ({
    ctaRole,
    clicks: stats.clicks,
    conversions: stats.conversions,
    conversionRate: stats.clicks > 0 ? stats.conversions / stats.clicks : null,
  }));

  const byJob = jobAggregates.map((job) => ({
    jobId: job.jobId,
    views: job.views,
    clicks: job.clicks,
    conversions: job.conversions,
    ctr: job.views > 0 ? job.clicks / job.views : null,
    conversionRate: job.clicks > 0 ? job.conversions / job.clicks : null,
  }));

  // Winners Calculation
  const topJob =
    jobAggregates.length > 0
      ? [...jobAggregates].sort((a, b) => {
          if (b.conversions !== a.conversions) return b.conversions - a.conversions;
          if (b.clicks !== a.clicks) return b.clicks - a.clicks;
          return b.views - a.views;
        })[0]
      : null;

  const topJobRes =
    topJob && (topJob.conversions > 0 || topJob.clicks > 0 || topJob.views > 0)
      ? {
          jobId: topJob.jobId,
          views: topJob.views,
          clicks: topJob.clicks,
          conversions: topJob.conversions,
        }
      : null;

  const topPlatform =
    byPlatform.length > 0
      ? [...byPlatform].sort((a, b) => b.conversions - a.conversions)[0].platform
      : null;

  const topCtaRole =
    byCtaRole.length > 0
      ? [...byCtaRole].sort((a, b) => b.conversions - a.conversions)[0].ctaRole
      : null;

  const topChannelObj =
    byChannel.length > 0 ? [...byChannel].sort((a, b) => b.conversions - a.conversions)[0] : null;

  const topChannel = topChannelObj
    ? { channelId: topChannelObj.channelId, displayName: topChannelObj.displayName }
    : null;

  // Decisions and Problems Engine
  const problems: WeeklyGrowthReport['problems'] = [];
  const decisions: WeeklyGrowthReport['decisions'] = [];
  const actionPlan: string[] = [];

  let status = 'TRUNG BÌNH';

  if (totalRawCount === 0) {
    status = 'THIẾU DỮ LIỆU';
    problems.push({
      type: 'NO_DATA',
      severity: 'high',
      message: 'Không có dữ liệu hiệu suất (snapshots) nào cho tuần này.',
      suggestedFix:
        'Yêu cầu Operator thực hiện fetch Facebook metrics (Meta API) hoặc nhập dữ liệu thủ công (manual) trước khi đánh giá.',
    });
    decisions.push({
      type: 'collect_more_data',
      message: 'Yêu cầu thu thập thêm dữ liệu hiệu suất.',
      rationale:
        'Tổng số snapshots tìm thấy bằng 0. Không đủ dữ liệu tin cậy để đưa ra nhận định tăng/giảm.',
    });
    actionPlan.push(
      'Sử dụng chức năng "Fetch Facebook Metrics" từ trang Analytics hoặc điền số liệu nhập tay.',
    );
  } else {
    // Problem 1: Views cao, CTR thấp
    if (
      kpi.views >= THRESHOLDS.MIN_VIEWS_FOR_CTR &&
      kpi.ctr !== null &&
      kpi.ctr < THRESHOLDS.LOW_CTR
    ) {
      problems.push({
        type: 'HIGH_REACH_LOW_CTR',
        severity: 'medium',
        message: 'Nội dung kéo lượt xem tốt nhưng tỷ lệ nhấp link (CTR) rất thấp.',
        suggestedFix:
          'Tối ưu lại lời kêu gọi hành động (CTA): kiểm tra bình luận đã ghim (pinned comment), caption chứa link hoặc bố cục của Hub CTA.',
      });
      decisions.push({
        type: 'fix',
        message: 'Tập trung tối ưu CTA / Sửa caption & Pinned Comment.',
        rationale: `Lượt xem đạt ${kpi.views.toLocaleString()} nhưng CTR chỉ đạt ${(kpi.ctr * 100).toFixed(2)}%, thấp hơn ngưỡng tối thiểu ${THRESHOLDS.LOW_CTR * 100}%.`,
      });
      actionPlan.push(
        'Rà soát các bài đăng có views cao tuần này và sửa nội dung CTA ghim ở bình luận.',
      );
    }

    // Problem 2: Views thấp, CTR cao
    if (
      kpi.views > 0 &&
      kpi.views < THRESHOLDS.GOOD_VIEWS &&
      kpi.ctr !== null &&
      kpi.ctr >= THRESHOLDS.GOOD_CTR
    ) {
      problems.push({
        type: 'LOW_REACH_HIGH_CTR',
        severity: 'low',
        message: 'Tỷ lệ click tốt nhưng lượt tiếp cận (views) còn yếu.',
        suggestedFix:
          'Sản phẩm/CTA có sức hút tốt. Cần tập trung cải thiện hook 3 giây đầu tiên của video, tối ưu lịch đăng hoặc nguồn video.',
      });
      decisions.push({
        type: 'watch',
        message: 'Theo dõi chất lượng nội dung / Nâng cao lượt tiếp cận.',
        rationale: `CTR rất tốt đạt ${(kpi.ctr * 100).toFixed(2)}%, nhưng tổng lượt xem chỉ có ${kpi.views.toLocaleString()}, cho thấy tiềm năng chuyển đổi chưa được khai thác hết do thiếu reach.`,
      });
      actionPlan.push('Thử nghiệm các kịch bản hook mới và kiểm tra lại lịch đăng tải video.');
    }

    // Problem 3: Clicks cao, conversions thấp
    if (
      kpi.clicks >= THRESHOLDS.MIN_CLICKS_FOR_CVR &&
      kpi.conversionRate !== null &&
      kpi.conversionRate < THRESHOLDS.LOW_CVR
    ) {
      problems.push({
        type: 'HIGH_CLICKS_LOW_CONVERSION',
        severity: 'high',
        message: 'Khách nhấp link nhiều nhưng tỷ lệ mua hàng/chuyển đổi (CVR) rất thấp.',
        suggestedFix:
          'Kiểm tra lại sản phẩm trên sàn thương mại điện tử: giá bán có cạnh tranh không, mã giảm giá còn hiệu lực không hoặc link sản phẩm bị lỗi.',
      });
      decisions.push({
        type: 'fix',
        message: 'Kiểm tra và sửa lỗi link sản phẩm / Tối ưu giá bán sàn.',
        rationale: `Có ${kpi.clicks} lượt nhấp link nhưng tỷ lệ chuyển đổi mua hàng chỉ đạt ${(kpi.conversionRate * 100).toFixed(2)}% (thấp hơn ngưỡng ${THRESHOLDS.LOW_CVR * 100}%).`,
      });
      actionPlan.push(
        'Kiểm tra thủ công link liên kết Shopee của các bài đăng tốt nhất xem có bị lỗi hoặc sai mã affiliate không.',
      );
    }

    // Problem 4: Comments cao, clicks thấp
    if (kpi.comments > 10 && kpi.clicks < 5) {
      problems.push({
        type: 'HIGH_COMMENTS_LOW_CLICKS',
        severity: 'medium',
        message: 'Tương tác bình luận nhiều nhưng chưa dẫn tới lượt nhấp link.',
        suggestedFix:
          'Sử dụng Draft Reply Assistant để phản hồi nhanh các câu hỏi mua hàng bằng link affiliate một cách tự nhiên.',
      });
      decisions.push({
        type: 'fix',
        message: 'Khai thác tương tác bình luận bằng Reply CTA.',
        rationale: `Nhận được ${kpi.comments} bình luận nhưng chỉ thu về ${kpi.clicks} clicks. Việc trả lời bình luận có kèm link là cơ hội lớn bị bỏ lỡ.`,
      });
      actionPlan.push(
        'Sử dụng Draft Reply Assistant phản hồi bình luận hỏi mua hàng của khách hàng.',
      );
    }

    // Tốt toàn diện
    if (
      kpi.views >= THRESHOLDS.GOOD_VIEWS &&
      kpi.ctr !== null &&
      kpi.ctr >= THRESHOLDS.GOOD_CTR &&
      kpi.conversionRate !== null &&
      kpi.conversionRate >= THRESHOLDS.GOOD_CVR
    ) {
      status = 'TỐT';
      decisions.push({
        type: 'scale',
        message: 'Nhân bản cấu trúc góc nội dung và lane thành công.',
        rationale:
          'Các chỉ số chính (views, CTR, CVR) đều vượt ngưỡng kỳ vọng xuất sắc. Đề xuất scale quy mô.',
      });
      actionPlan.push(
        'Tiến hành sản xuất thêm video thuộc lane và sản phẩm đang có hiệu suất cao nhất.',
      );
    }

    if (decisions.length === 0) {
      status = 'TRUNG BÌNH';
      decisions.push({
        type: 'watch',
        message: 'Duy trì kế hoạch đăng hiện tại và tiếp tục theo dõi.',
        rationale:
          'Các chỉ số đạt mức trung bình ổn định, chưa xuất hiện dấu hiệu bất thường cần can thiệp gấp.',
      });
      actionPlan.push(
        'Tiếp tục đăng bài theo Posting Plan và thu thập thêm dữ liệu snapshots vào tuần tới.',
      );
    }
  }

  // Construct JSON report
  const report: WeeklyGrowthReport = {
    schemaVersion: 1,
    reportId: `wgr_${weekId}_${new Date().toISOString().replace(/[:.-]/g, '_')}`,
    weekId,
    periodStart: range.start.toISOString(),
    periodEnd: range.end.toISOString(),
    generatedAt: new Date().toISOString(),
    dataConfidence,
    dataSources: {
      facebookApiSnapshots,
      manualSnapshots: manualSnapshotsCount,
      fixtureFallbackUsed: false,
    },
    kpi,
    breakdowns: {
      byPlatform,
      byChannel,
      byLane,
      byCtaRole,
      byJob,
    },
    winners: {
      topJob: topJobRes,
      topPlatform,
      topCtaRole,
      topChannel,
    },
    problems,
    decisions,
    actionPlan,
  };

  // Generate Markdown report
  const mdContent = `# Weekly Growth Review Report — ${weekId}

## 1. Tóm tắt điều hành
- **Trạng thái tuần**: **${status}**
- **Độ tin cậy dữ liệu**: **${dataConfidence.toUpperCase()}**
- **Nhận định chung**: ${
    status === 'THIẾU DỮ LIỆU'
      ? 'Hệ thống hiện thiếu dữ liệu đo lường thực tế (snapshots). Cần bổ sung dữ liệu trước khi thực hiện đánh giá.'
      : decisions.map((d) => d.message).join(' ')
  }
- **Chi tiết nguồn**: API Snapshots: ${facebookApiSnapshots} | Manual Snapshots: ${manualSnapshotsCount}

## 2. KPI tuần
| Chỉ số | Giá trị |
|---|---|
| Lượt xem (Views) | ${kpi.views.toLocaleString()} |
| Lượt hiển thị (Impressions) | ${kpi.impressions.toLocaleString()} |
| Lượt nhấp (Clicks) | ${kpi.clicks.toLocaleString()} |
| Bình luận (Comments) | ${kpi.comments.toLocaleString()} |
| Tương tác (Reactions) | ${kpi.reactions.toLocaleString()} |
| Chia sẻ (Shares) | ${kpi.shares.toLocaleString()} |
| Lưu (Saves) | ${kpi.saves.toLocaleString()} |
| Chuyển đổi (Conversions) | ${kpi.conversions.toLocaleString()} |
| Tỷ lệ nhấp (CTR) | ${kpi.ctr !== null ? `${(kpi.ctr * 100).toFixed(2)}%` : 'N/A'} |
| Tỷ lệ chuyển đổi (CVR) | ${kpi.conversionRate !== null ? `${(kpi.conversionRate * 100).toFixed(2)}%` : 'N/A'} |

## 3. Breakdown hiệu suất

### Theo nền tảng (Platform)
| Nền tảng | Lượt xem | Lượt nhấp | Chuyển đổi | CTR | CVR |
|---|---|---|---|---|---|
${byPlatform.map((p) => `| ${p.platform} | ${p.views.toLocaleString()} | ${p.clicks.toLocaleString()} | ${p.conversions.toLocaleString()} | ${p.ctr !== null ? `${(p.ctr * 100).toFixed(2)}%` : 'N/A'} | ${p.conversionRate !== null ? `${(p.conversionRate * 100).toFixed(2)}%` : 'N/A'} |`).join('\n')}

### Theo Kênh (Channel)
| Tên hiển thị | ID Kênh | Lượt xem | Lượt nhấp | Chuyển đổi | CTR | CVR |
|---|---|---|---|---|---|---|
${byChannel.map((c) => `| ${c.displayName} | ${c.channelId} | ${c.views.toLocaleString()} | ${c.clicks.toLocaleString()} | ${c.conversions.toLocaleString()} | ${c.ctr !== null ? `${(c.ctr * 100).toFixed(2)}%` : 'N/A'} | ${c.conversionRate !== null ? `${(c.conversionRate * 100).toFixed(2)}%` : 'N/A'} |`).join('\n')}

### Theo Ngách / Luồng kịch bản (Lane)
| Ngách / Lane | Lượt xem | Lượt nhấp | Chuyển đổi | CTR | CVR |
|---|---|---|---|---|---|
${byLane.map((l) => `| ${l.lane} | ${l.views.toLocaleString()} | ${l.clicks.toLocaleString()} | ${l.conversions.toLocaleString()} | ${l.ctr !== null ? `${(l.ctr * 100).toFixed(2)}%` : 'N/A'} | ${l.conversionRate !== null ? `${(l.conversionRate * 100).toFixed(2)}%` : 'N/A'} |`).join('\n')}

### Theo vai trò CTA (CTA Role)
| Vai trò CTA | Lượt nhấp (Clicks) | Chuyển đổi (Conversions) | CVR |
|---|---|---|---|
${byCtaRole.map((r) => `| ${r.ctaRole} | ${r.clicks.toLocaleString()} | ${r.conversions.toLocaleString()} | ${r.conversionRate !== null ? `${(r.conversionRate * 100).toFixed(2)}%` : 'N/A'} |`).join('\n')}

### Theo Video / Job
| ID Job | Lượt xem | Lượt nhấp | Chuyển đổi | CTR | CVR |
|---|---|---|---|---|---|
${byJob.map((j) => `| ${j.jobId} | ${j.views.toLocaleString()} | ${j.clicks.toLocaleString()} | ${j.conversions.toLocaleString()} | ${j.ctr !== null ? `${(j.ctr * 100).toFixed(2)}%` : 'N/A'} | ${j.conversionRate !== null ? `${(j.conversionRate * 100).toFixed(2)}%` : 'N/A'} |`).join('\n')}

## 4. Winner tuần này
- **Video/job tốt nhất**: ${topJobRes ? `${topJobRes.jobId} (${topJobRes.views.toLocaleString()} views, ${topJobRes.conversions} conversions)` : 'Không có'}
- **Nền tảng tốt nhất**: ${topPlatform || 'Không có'}
- **Vai trò CTA tốt nhất**: ${topCtaRole || 'Không có'}
- **Kênh tốt nhất**: ${topChannel ? `${topChannel.displayName} (${topChannel.channelId})` : 'Không có'}

## 5. Vấn đề phát hiện
${
  problems.length === 0
    ? '- Không phát hiện vấn đề bất thường cần khắc phục gấp.'
    : problems
        .map(
          (p) =>
            `- **[${p.severity.toUpperCase()}] ${p.type}**: ${p.message} (Gợi ý: ${p.suggestedFix})`,
        )
        .join('\n')
}

## 6. Quyết định đề xuất
${decisions.map((d) => `- **[${d.type.toUpperCase()}]**: ${d.message} (Lý do: ${d.rationale})`).join('\n')}

## 7. Kế hoạch tuần tới (Action Plan)
${actionPlan.map((a, idx) => `${idx + 1}. ${a}`).join('\n')}
`;

  // Output response
  if (dryRun) {
    console.log('\n=== WEEKLY GROWTH REPORT GENERATION (DRY RUN) ===');
    console.log(`Week ID:          ${weekId}`);
    console.log(
      `Period:           ${range.start.toISOString().split('T')[0]} to ${range.end.toISOString().split('T')[0]}`,
    );
    console.log(`Confidence:       ${dataConfidence.toUpperCase()}`);
    console.log(`Total Views:      ${kpi.views.toLocaleString()}`);
    console.log(`Total Clicks:     ${kpi.clicks.toLocaleString()}`);
    console.log(`Total Conversions:${kpi.conversions.toLocaleString()}`);
    console.log(`CTR:              ${kpi.ctr !== null ? `${(kpi.ctr * 100).toFixed(2)}%` : 'N/A'}`);
    console.log(
      `CVR:              ${kpi.conversionRate !== null ? `${(kpi.conversionRate * 100).toFixed(2)}%` : 'N/A'}`,
    );
    console.log(`Decisions count:  ${decisions.length}`);
    console.log('[DRY RUN] Báo cáo được sinh trong memory thành công. Không ghi file ra đĩa.');
    return 0;
  }

  // Write file output
  const jsonRelPath = join('data', 'growth', 'runtime', 'reports', 'weekly', `${weekId}.json`);
  const mdRelPath = join('data', 'growth', 'runtime', 'reports', 'weekly', `${weekId}.md`);
  const jsonAbsPath = resolveInsideRepo(jsonRelPath);
  const mdAbsPath = resolveInsideRepo(mdRelPath);

  if (!jsonAbsPath || !mdAbsPath) {
    console.error('Lỗi định vị thư mục lưu trữ báo cáo.');
    return 1;
  }

  try {
    // Write JSON atomic
    mkdirSync(dirname(jsonAbsPath), { recursive: true });
    const tmpJson = `${jsonAbsPath}.tmp`;
    writeFileSync(tmpJson, JSON.stringify(report, null, 2), 'utf8');
    renameSync(tmpJson, jsonAbsPath);

    // Write MD atomic
    const tmpMd = `${mdAbsPath}.tmp`;
    writeFileSync(tmpMd, mdContent, 'utf8');
    renameSync(tmpMd, mdAbsPath);

    console.log('\n✅ Báo cáo tuần đã được tạo thành công:');
    console.log(`- JSON: ${jsonRelPath}`);
    console.log(`- Markdown: ${mdRelPath}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('Không thể ghi file báo cáo ra đĩa:', msg);
    return 1;
  }

  return 0;
}

import { renameSync } from 'node:fs';

process.exit(main());
