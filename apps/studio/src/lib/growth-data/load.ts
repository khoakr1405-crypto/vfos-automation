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

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveInsideRepo } from '@/lib/studio-data/paths';
import { growthFixturesDir } from './paths';
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

export function loadContentAngles(): ContentAngle[] {
  return loadArray<ContentAngle>('content-angles.json');
}

export function loadPostingPlans(): PostingPlan[] {
  return loadArray<PostingPlan>('posting-plans.json');
}

export function loadPublishedPosts(): PublishedPost[] {
  return loadArray<PublishedPost>('published-posts.json');
}

export function loadPerformanceMetrics(): PerformanceMetric[] {
  return loadArray<PerformanceMetric>('performance-metrics.json');
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

export function loadCtaRoleMetrics(): CtaRoleMetric[] {
  return loadArray<CtaRoleMetric>('cta-role-metrics.json');
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
