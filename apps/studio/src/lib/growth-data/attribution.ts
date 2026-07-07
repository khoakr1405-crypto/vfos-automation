/* =============================================================================
 * VFOS Studio — Job-bound revenue attribution resolver (G4 — Revenue Attribution §4)
 * -----------------------------------------------------------------------------
 * SERVER ONLY (node:fs). Read-side, deterministic, never-throw.
 *
 * Nguyên tắc (No-Go #7 — không floating state):
 *   - Resolver CHỈ nhận jobId TƯỜNG MINH. KHÔNG tồn tại code path
 *     "latest post" / jobs[0] / date-sort-pick trong file này.
 *   - Chain attribution đã nằm TRÊN ĐĨA sau mỗi publish (status/result/card
 *     keyed theo jobId) → đây chỉ là lớp ĐỌC + index, KHÔNG writer mới trong
 *     script publish (god-file bất biến).
 *   - Chỉ dữ liệu CÔNG KHAI (postId/permalink/shortLink) — không token/secret/path.
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from './paths';
import { readPublishedPostsStore } from './runtime-store';
import type { ManualPerformanceSnapshot, PublishedPost } from './types';

const JOB_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Đọc JSON nhỏ trong thư mục job runtime, never-throw (mirror load.ts). */
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
 * Derive PublishedPost từ artifact publish đã có trên đĩa cho ĐÚNG 1 jobId:
 *   facebook_publish_status.json (postId/videoId/permalink/published/generatedAt)
 *   + product_card.json (shortLink/itemId) + job_manifest.json (channelId).
 * null nếu job chưa PUBLISHED thật. channelId '' = job legacy chưa gán kênh
 * (không đoán kênh). Fallback này giữ store chỉ là INDEX, không phải nguồn duy nhất.
 */
export function derivePublishedPostFromArtifacts(jobId: string): PublishedPost | null {
  if (!JOB_ID_RE.test(jobId)) return null;
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
  if (!status || status.state !== 'PUBLISHED' || !status.facebook?.published) return null;
  const postId = status.facebook?.postId ?? status.facebook?.videoId ?? null;
  if (!postId) return null;

  const card = readJobJson<{ shortLink?: string | null; itemId?: string | null }>(
    jobId,
    'product_card.json',
  );
  const manifest = readJobJson<{
    channelId?: string | null;
    createdAt?: string;
    updatedAt?: string;
  }>(jobId, 'job_manifest.json');

  return {
    publishedPostId: `pp_${jobId}`,
    jobId,
    channelId: manifest?.channelId ?? '',
    facebookPostId: String(postId),
    videoId: status.facebook?.videoId ?? null,
    productId: card?.itemId ?? null,
    affiliateShortLink: card?.shortLink ?? null,
    publishedAt: status.generatedAt ?? manifest?.updatedAt ?? manifest?.createdAt ?? '',
  };
}

/**
 * Resolve PublishedPost cho ĐÚNG 1 jobId tường minh (exact-match, deterministic):
 *   1) lookup store runtime (index) theo jobId chính xác;
 *   2) miss → derive từ artifact trên đĩa (never-throw).
 * jobId lạ / job chưa publish → null. KHÔNG nhận id đã compute/floating.
 */
export function resolvePublishedPost(jobId: string): PublishedPost | null {
  if (!JOB_ID_RE.test(jobId)) return null;
  const fromStore = readPublishedPostsStore().posts.find((p) => p.jobId === jobId) ?? null;
  if (fromStore) return fromStore;
  return derivePublishedPostFromArtifacts(jobId);
}

/**
 * Attribution 1 snapshot M3–M6 → đúng 1 job đã publish. Deterministic vì
 * snapshot literally mang jobId (đã set server-side ở save route qua
 * resolveJobBinding). Snapshot của job chưa publish → null (không đoán).
 */
export function attributeSnapshotToJob(s: ManualPerformanceSnapshot): {
  jobId: string;
  publishedPostId: string;
  facebookPostId: string;
  affiliateShortLink: string | null;
} | null {
  const post = resolvePublishedPost(s.jobId);
  if (!post) return null;
  return {
    jobId: post.jobId,
    publishedPostId: post.publishedPostId,
    facebookPostId: post.facebookPostId,
    affiliateShortLink: post.affiliateShortLink,
  };
}
