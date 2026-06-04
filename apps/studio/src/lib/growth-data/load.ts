/* =============================================================================
 * VFOS Studio — Growth OS mock data adapter (Round Growth 02, READ-ONLY)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Đọc mock fixtures (JSON) từ cây source. KHÔNG import vào client.
 * Nguyên tắc (mirror studio-data/jobs.ts):
 *   - Mỗi loader never-throw: lỗi/thiếu file → trả [] (không crash).
 *   - KHÔNG side effect: không ghi file, không gọi command, không gọi API.
 *   - KHÔNG đọc job thật / data/temp — Growth 02 chỉ đọc fixtures.
 *   - KHÔNG đọc .env / token.
 * Round sau (Growth 03+) sẽ thêm nguồn vận hành thật data/growth/ với cùng interface.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
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

export function loadChannels(): Channel[] {
  return loadArray<Channel>('channels.json');
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

export function loadLearningSignals(): LearningSignal[] {
  return loadArray<LearningSignal>('learning-signals.json');
}

export function loadGrowthRecommendations(): GrowthRecommendation[] {
  return loadArray<GrowthRecommendation>('growth-recommendations.json');
}

/** Gộp toàn bộ 11 entity thành 1 snapshot. source='mock' ở Growth 02. */
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
    learningSignals: loadLearningSignals(),
    growthRecommendations: loadGrowthRecommendations(),
  };
}
