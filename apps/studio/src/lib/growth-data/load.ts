/* =============================================================================
 * VFOS Studio — Growth OS data adapter (READ-ONLY)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. KHÔNG import vào client.
 * Nguyên tắc (mirror studio-data/jobs.ts):
 *   - Mỗi loader never-throw: lỗi/thiếu file → trả [] (không crash).
 *   - KHÔNG side effect: không ghi file, không gọi command, không gọi API ngoài.
 *   - KHÔNG bao giờ đọc/lộ GIÁ TRỊ token — channel thật chỉ derive boolean
 *     HIỆN DIỆN của env (pageAccessConfigured).
 *
 * Nguồn dữ liệu (UI Architecture V1 Phase D):
 *   - Channels: config/channels.json (NGUỒN THẬT, commit được, không secret) —
 *     ưu tiên tuyệt đối khi có; fixture chỉ là fallback demo khi config trống.
 *     KHÔNG trộn hai nguồn.
 *   - Các loader khác: vẫn fixtures (sẽ nâng dần theo phase).
 * ========================================================================== */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { growthFixturesDir } from './paths';
import { readApiRuntimeStore } from './runtime-store';
import type {
  AffiliateCtaPlan,
  Channel,
  CommentActionLog,
  CommentIntent,
  CommentItem,
  ContentAngle,
  CtaRoleMetric,
  GrowthRecommendation,
  GrowthSnapshot,
  LearningSignal,
  ManualPerformanceSnapshot,
  Niche,
  PerformanceMetric,
  PostingPlan,
  PublishedPost,
  ReplyTemplate,
} from './types';

function loadArray<T>(file: string): T[] {
  const dir = growthFixturesDir();
  if (!dir) return [];
  try {
    const abs = join(dir, file);
    if (!existsSync(abs)) return [];
    const parsed: unknown = JSON.parse(readFileSync(abs, 'utf8'));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

/** Nạp .env root vào process.env (fill-missing-only) — cùng pattern loadStudioEnv
 * của studio-data/jobs.ts. Cần vì Next dev có thể chạy route ở worker chưa từng
 * import jobs.ts → process.env thiếu FACEBOOK_*. Server-only, không lộ giá trị. */
let rootEnvLoaded = false;
function ensureRootEnvLoaded(): void {
  if (rootEnvLoaded) return;
  rootEnvLoaded = true;
  try {
    const envPath = resolveInsideRepo('.env');
    if (!envPath || !existsSync(envPath)) return;
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index === -1) continue;
      const key = trimmed.substring(0, index).trim();
      let val = trimmed.substring(index + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.substring(1, val.length - 1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {
    /* never-throw */
  }
}

/** Kênh THẬT từ config/channels.json. pageAccessConfigured cho facebook derive
 * từ SỰ HIỆN DIỆN env FACEBOOK_PAGE_ID/FACEBOOK_PAGE_ACCESS_TOKEN khớp pageId —
 * boolean only, không bao giờ đọc giá trị token vào output. */
function loadRealChannels(): Channel[] {
  try {
    const abs = resolveInsideRepo('config/channels.json');
    if (!abs || !existsSync(abs)) return [];
    const parsed: unknown = JSON.parse(readFileSync(abs, 'utf8'));
    if (!Array.isArray(parsed)) return [];
    ensureRootEnvLoaded();
    const envPageId = (process.env.FACEBOOK_PAGE_ID ?? '').trim();
    const tokenPresent = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '').trim().length > 0;
    return (parsed as Channel[]).map((ch) =>
      ch.platform === 'facebook'
        ? { ...ch, pageAccessConfigured: tokenPresent && envPageId === ch.pageId }
        : ch,
    );
  } catch {
    return [];
  }
}

export function loadChannelsWithSource(): { channels: Channel[]; source: 'real' | 'fixture' } {
  const real = loadRealChannels();
  if (real.length > 0) return { channels: real, source: 'real' };
  return { channels: loadArray<Channel>('channels.json'), source: 'fixture' };
}

export function loadChannels(): Channel[] {
  return loadChannelsWithSource().channels;
}

/** Ngách THẬT từ config/niches.json (Niche → Channel → Job, North Star #3).
 * Real-first như channels; never-throw → []. Không secret, không side effect. */
function loadRealNiches(): Niche[] {
  try {
    const abs = resolveInsideRepo('config/niches.json');
    if (!abs || !existsSync(abs)) return [];
    const parsed: unknown = JSON.parse(readFileSync(abs, 'utf8'));
    return Array.isArray(parsed) ? (parsed as Niche[]) : [];
  } catch {
    return [];
  }
}

export function loadNichesWithSource(): { niches: Niche[]; source: 'real' | 'fixture' } {
  const real = loadRealNiches();
  if (real.length > 0) return { niches: real, source: 'real' };
  return { niches: loadArray<Niche>('niches.json'), source: 'fixture' };
}

/** Tập lane của các niche ĐANG HOẠT ĐỘNG (THẬT). Nguồn sự thật để lọc/validate
 * kênh theo ngách thay cho literal 'product-review'. Chỉ tính niche THẬT (fixture
 * không dùng cho workflow). Fallback {'product-review'} khi rỗng/thiếu →
 * behavior-preserving, không vỡ khi chưa có config/niches.json. */
export function activeNicheLanes(): Set<string> {
  const { niches, source } = loadNichesWithSource();
  const lanes =
    source === 'real' ? niches.filter((n) => n.status === 'active').map((n) => n.lane) : [];
  return lanes.length > 0 ? new Set(lanes) : new Set(['product-review']);
}

/** Map channelId → niche active (qua channel.lane). Dùng cho rollup evidence/job
 * theo ngách (Niche → Channel → Job). Chỉ tính channel THẬT + niche THẬT
 * (real-first); kênh/lane không khớp niche active → không có trong map. */
export function channelNicheMap(): Map<string, { nicheId: string; nicheDisplayName: string }> {
  const map = new Map<string, { nicheId: string; nicheDisplayName: string }>();
  const { channels, source: chSource } = loadChannelsWithSource();
  const { niches, source: nSource } = loadNichesWithSource();
  if (chSource !== 'real' || nSource !== 'real') return map;
  const actives = niches.filter((n) => n.status === 'active');
  for (const c of channels) {
    const niche = actives.find((n) => n.lane === c.lane);
    if (niche) map.set(c.channelId, { nicheId: niche.nicheId, nicheDisplayName: niche.displayName });
  }
  return map;
}

export function loadContentAngles(): ContentAngle[] {
  return loadArray<ContentAngle>('content-angles.json');
}

export function loadPostingPlans(): PostingPlan[] {
  return loadArray<PostingPlan>('posting-plans.json');
}

export function loadPublishedPosts(): PublishedPost[] {
  return loadArray<PublishedPost>('published-posts.json');
}

/**
 * 1 video đã đăng THẬT — đủ field cho bảng per-video ở Analytics (thumbnail + link
 * bài + link affiliate + số đo). Tách khỏi type PublishedPost (giữ type ổn định);
 * permalinkUrl/productName không nằm trong PublishedPost nên gom riêng ở đây.
 * Chỉ chứa dữ liệu CÔNG KHAI (postId/permalink/shortLink), KHÔNG token/secret/path.
 */
export interface PublishedVideoRow {
  jobId: string;
  publishedPostId: string;
  facebookPostId: string | null;
  videoId: string | null;
  permalinkUrl: string | null;
  affiliateShortLink: string | null;
  productName: string | null;
  publishedAt: string | null;
}

/** Đọc JSON nhỏ trong thư mục job runtime, never-throw. Server-only. */
function readJobJson<T>(jobId: string, file: string): T | null {
  const abs = resolveInsideRepo(`data/temp/jobs/${jobId}/${file}`);
  if (!abs || !existsSync(abs)) return null;
  try {
    return JSON.parse(readFileSync(abs, 'utf8')) as T;
  } catch {
    return null;
  }
}

/**
 * Inventory video đã đăng THẬT: scan data/temp/jobs/* lấy job có
 * facebook_publish_status.json state=PUBLISHED. Real-first; 0 job thật → fallback
 * fixture published-posts (demo, không permalink). Never-throw. KHÔNG lộ path/token.
 */
export function loadRealPublishedVideos(): { rows: PublishedVideoRow[]; source: 'real' | 'fixture' } {
  const jobsDir = resolveInsideRepo('data/temp/jobs');
  const rows: PublishedVideoRow[] = [];
  if (jobsDir && existsSync(jobsDir)) {
    let jobIds: string[] = [];
    try {
      jobIds = readdirSync(jobsDir, { withFileTypes: true })
        .filter((d) => d.isDirectory() && /^[A-Za-z0-9_-]+$/.test(d.name))
        .map((d) => d.name);
    } catch {
      jobIds = [];
    }
    for (const jobId of jobIds) {
      const status = readJobJson<{
        state?: string;
        generatedAt?: string;
        facebook?: {
          postId?: string | null;
          videoId?: string | null;
          permalinkUrl?: string | null;
          published?: boolean;
        } | null;
      }>(jobId, 'facebook_publish_status.json');
      if (!status || status.state !== 'PUBLISHED' || !status.facebook?.published) continue;
      const card = readJobJson<{ shortLink?: string | null; name?: string | null }>(
        jobId,
        'product_card.json',
      );
      const manifest = readJobJson<{ createdAt?: string; updatedAt?: string }>(
        jobId,
        'job_manifest.json',
      );
      rows.push({
        jobId,
        publishedPostId: `pp_${jobId}`,
        facebookPostId: status.facebook?.postId ?? null,
        videoId: status.facebook?.videoId ?? null,
        permalinkUrl: status.facebook?.permalinkUrl ?? null,
        affiliateShortLink: card?.shortLink ?? null,
        productName: card?.name ?? null,
        publishedAt: status.generatedAt ?? manifest?.updatedAt ?? manifest?.createdAt ?? null,
      });
    }
  }
  if (rows.length > 0) {
    rows.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
    return { rows, source: 'real' };
  }
  const fixtureRows: PublishedVideoRow[] = loadPublishedPosts().map((p) => ({
    jobId: p.jobId,
    publishedPostId: p.publishedPostId,
    facebookPostId: p.facebookPostId,
    videoId: p.videoId,
    permalinkUrl: null,
    affiliateShortLink: p.affiliateShortLink,
    productName: null,
    publishedAt: p.publishedAt,
  }));
  return { rows: fixtureRows, source: 'fixture' };
}

/**
 * Dev-fixture flag (G2 gate — Revenue Attribution §3 A.4). Server-read, default OFF:
 * Operator không bao giờ thấy fixture analytics trừ khi bật rõ
 * VFOS_SHOW_FIXTURE_ANALYTICS=true|1. Money sections KHÔNG theo flag này (No-Go #6).
 */
export function fixtureAnalyticsEnabled(): boolean {
  ensureRootEnvLoaded();
  const v = (process.env.VFOS_SHOW_FIXTURE_ANALYTICS ?? '').trim().toLowerCase();
  return v === 'true' || v === '1';
}

/**
 * PerformanceMetric THẬT từ api-performance-snapshots runtime store (Real API 02B/05C).
 * Chỉ nhận snapshot post-level attribute được về post/job tường minh (No-Go #7) và có
 * views+clicks đo thật — thiếu metric lõi thì BỎ dòng, KHÔNG bịa 0 (No-Go #6).
 * reactions/comments/shares null → 0 (chỉ understate, không phóng đại).
 */
function realPerformanceMetrics(): PerformanceMetric[] {
  const rows: PerformanceMetric[] = [];
  for (const s of readApiRuntimeStore().snapshots) {
    if (s.fetchStatus !== 'success' && s.fetchStatus !== 'partial') continue;
    if (s.ctaRole) continue;
    const publishedPostId = s.publishedPostId ?? (s.jobId ? `pp_${s.jobId}` : null);
    if (!publishedPostId) continue;
    if (s.views === null || s.clicks === null) continue;
    rows.push({
      metricId: `real_${s.snapshotId}`,
      publishedPostId,
      capturedAt: s.measuredAt,
      views: s.views,
      clicks: s.clicks,
      ctr: s.views > 0 ? (s.clicks / s.views) * 100 : 0,
      reactions: s.reactions ?? 0,
      commentsCount: s.comments ?? 0,
      shares: s.shares ?? 0,
      source: 'real',
    });
  }
  return rows;
}

/** G2 gate (§3 A.2): real-first mirror loadRealPublishedVideos — API store thật
 * trước, fixture chỉ là fallback demo khi chưa có dòng real nào. */
export function loadPerformanceMetricsWithSource(): {
  rows: PerformanceMetric[];
  source: 'real' | 'fixture';
} {
  const real = realPerformanceMetrics();
  if (real.length > 0) return { rows: real, source: 'real' };
  return { rows: loadArray<PerformanceMetric>('performance-metrics.json'), source: 'fixture' };
}

/** Wrapper mỏng behavior-preserving (caller cũ: loadGrowthSnapshot + smoke test). */
export function loadPerformanceMetrics(): PerformanceMetric[] {
  return loadPerformanceMetricsWithSource().rows;
}

export function loadCommentItems(): CommentItem[] {
  return loadArray<CommentItem>('comment-items.json');
}

export function loadCommentIntents(): CommentIntent[] {
  return loadArray<CommentIntent>('comment-intents.json');
}

export function loadReplyTemplates(): ReplyTemplate[] {
  return loadArray<ReplyTemplate>('reply-templates.json');
}

export function loadCommentActionLog(): CommentActionLog[] {
  return loadArray<CommentActionLog>('comment-action-log.json');
}

export function loadAffiliateCtaPlans(): AffiliateCtaPlan[] {
  return loadArray<AffiliateCtaPlan>('affiliate-cta-plans.json');
}

/** G2 gate (§3 A.2): CHƯA có nguồn thật role-level (per-link insights chưa ingest)
 * → source luôn 'fixture'. Khi có nguồn thật, thêm nhánh real-first ở đây
 * (mirror loadPerformanceMetricsWithSource). */
export function loadCtaRoleMetricsWithSource(): {
  rows: CtaRoleMetric[];
  source: 'real' | 'fixture';
} {
  return { rows: loadArray<CtaRoleMetric>('cta-role-metrics.json'), source: 'fixture' };
}

/** Wrapper mỏng behavior-preserving (caller cũ: loadGrowthSnapshot + smoke test). */
export function loadCtaRoleMetrics(): CtaRoleMetric[] {
  return loadCtaRoleMetricsWithSource().rows;
}

export function loadManualPerformanceSnapshots(): ManualPerformanceSnapshot[] {
  return loadArray<ManualPerformanceSnapshot>('manual-performance-snapshots.json');
}

export function loadLearningSignals(): LearningSignal[] {
  return loadArray<LearningSignal>('learning-signals.json');
}

export function loadGrowthRecommendations(): GrowthRecommendation[] {
  return loadArray<GrowthRecommendation>('growth-recommendations.json');
}

/** Gộp toàn bộ 14 entity thành 1 snapshot. source='mock' ở Growth 02. */
export function loadGrowthSnapshot(): GrowthSnapshot {
  return {
    source: 'mock',
    generatedAt: new Date().toISOString(),
    channels: loadChannels(),
    contentAngles: loadContentAngles(),
    postingPlans: loadPostingPlans(),
    publishedPosts: loadPublishedPosts(),
    performanceMetrics: loadPerformanceMetrics(),
    commentItems: loadCommentItems(),
    commentIntents: loadCommentIntents(),
    replyTemplates: loadReplyTemplates(),
    commentActionLog: loadCommentActionLog(),
    affiliateCtaPlans: loadAffiliateCtaPlans(),
    ctaRoleMetrics: loadCtaRoleMetrics(),
    manualPerformanceSnapshots: loadManualPerformanceSnapshots(),
    learningSignals: loadLearningSignals(),
    growthRecommendations: loadGrowthRecommendations(),
  };
}
