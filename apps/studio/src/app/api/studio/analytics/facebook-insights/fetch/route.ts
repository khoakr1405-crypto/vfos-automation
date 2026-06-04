/* =============================================================================
 * VFOS Studio — Facebook Insights Read-only Fetch API (Real API 02B)
 * -----------------------------------------------------------------------------
 * POST local-only. Fetch dữ liệu từ Facebook Graph API cho PublishedPosts,
 * map về ApiPerformanceSnapshot và lưu trữ vào runtime file (gitignored).
 * An toàn: không log/trả token, không mutate Facebook, kiểm soát mock/live.
 * ========================================================================== */

import { loadPublishedPosts } from '@/lib/growth-data/load';
import {
  apiRuntimePathConfigured,
  appendApiPerformanceSnapshots,
} from '@/lib/growth-data/runtime-store';
import type { ApiPerformanceSnapshot } from '@/lib/growth-data/types';
import { createMetaClient } from '@vfos/facebook';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** Chỉ cho phép request từ local dev (host header). Chặn dùng từ xa. */
function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

interface FacebookBasicPostResponse {
  id: string;
  shares?: {
    count: number;
  };
  comments?: {
    summary?: {
      total_count: number;
    };
  };
  reactions?: {
    summary?: {
      total_count: number;
    };
  };
}

interface FacebookInsightsResponse {
  data: Array<{
    name: string;
    values: Array<{
      value: number;
    }>;
  }>;
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép fetch từ local dev.' },
      { status: 403 },
    );
  }

  const pageId = (process.env.FACEBOOK_PAGE_ID || '').trim();
  const pageAccessToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  const metaMode = (process.env.META_MODE || '').trim().toLowerCase() === 'live' ? 'live' : 'mock';

  const pageIdConfigured = !!pageId;
  const pageAccessConfigured = !!pageAccessToken;
  const runtimeTargetConfigured = apiRuntimePathConfigured();

  const posts = loadPublishedPosts();
  // Lọc ra các bài đăng có facebookPostId hợp lệ (không phải N/A và có chứa ký tự phân tách '_')
  const validPosts = posts.filter(
    (p) => p.facebookPostId && p.facebookPostId !== 'N/A' && p.facebookPostId.includes('_'),
  );

  const attemptedCount = validPosts.length;
  let savedCount = 0;
  let successCount = 0;
  let partialCount = 0;
  let blockedCount = 0;
  let failedCount = 0;
  const blockedReasons: string[] = [];

  const snapshotsToSave: ApiPerformanceSnapshot[] = [];
  const now = new Date().toISOString();

  if (metaMode === 'mock') {
    return Response.json({
      ok: true,
      mode: 'mock',
      metaMode: 'mock',
      attemptedCount,
      savedCount: 0,
      successCount: 0,
      partialCount: 0,
      blockedCount: attemptedCount,
      failedCount: 0,
      message: 'Mock mode — không gọi Graph API, không ghi API snapshot',
      blockedReasons: ['Mock mode — không gọi Graph API, không ghi API snapshot'],
      runtimeTargetConfigured,
    });
  }

  // CHẾ ĐỘ CHẠY THẬT (LIVE)
  if (!pageIdConfigured || !pageAccessConfigured) {
    return Response.json({
      ok: false,
      metaMode,
      attemptedCount: 0,
      savedCount: 0,
      successCount: 0,
      partialCount: 0,
      blockedCount: attemptedCount,
      failedCount: 0,
      blockedReasons: ['Cấu hình môi trường thiếu ID hoặc Giá trị xác thực Page.'],
      runtimeTargetConfigured,
    });
  }

  const client = createMetaClient({ pageId, pageAccessToken });

  for (const post of validPosts) {
    const postId = post.facebookPostId;
    let fetchStatus: 'success' | 'partial' | 'blocked' | 'failed' = 'success';
    let blockedReason: string | undefined = undefined;

    const views: number | null = null;
    let impressions: number | null = null;
    const clicks: number | null = null;
    let comments: number | null = null;
    let reactions: number | null = null;
    let shares: number | null = null;
    const saves: number | null = null;
    const conversions: number | null = null;

    let basicOk = false;
    let insightsOk = false;

    try {
      // 1. Fetch basic post fields
      const basicResult = await client.get<FacebookBasicPostResponse>(`/${postId}`, {
        fields: 'id,shares,comments.summary(true),reactions.summary(true)',
      });

      if (!basicResult.ok) {
        const err = basicResult.error;
        fetchStatus = 'failed';
        if (err) {
          if (err.code === 200 || err.code === 10 || basicResult.status === 403) {
            fetchStatus = 'blocked';
            blockedReason = `Thiếu quyền đọc bài viết: [${err.type}] ${err.message}`;
          } else {
            blockedReason = `Lỗi đọc thông tin bài đăng: [${err.type}] ${err.message}`;
          }
        } else {
          blockedReason = `Lỗi HTTP ${basicResult.status} khi đọc thông tin cơ bản.`;
        }
      } else if (basicResult.data) {
        basicOk = true;
        shares = basicResult.data.shares?.count ?? 0;
        comments = basicResult.data.comments?.summary?.total_count ?? 0;
        reactions = basicResult.data.reactions?.summary?.total_count ?? 0;
      }

      // 2. Fetch insights (nếu phần basic thành công)
      if (basicOk) {
        const insightsResult = await client.get<FacebookInsightsResponse>(`/${postId}/insights`, {
          metric: 'post_impressions',
        });

        if (!insightsResult.ok) {
          const err = insightsResult.error;
          fetchStatus = 'partial'; // Vẫn giữ phần basic thành công
          if (err) {
            if (err.code === 200 || err.code === 10 || insightsResult.status === 403) {
              blockedReason = `Thiếu quyền read_insights: [${err.type}] ${err.message}`;
            } else {
              blockedReason = `Lỗi đọc Insights: [${err.type}] ${err.message}`;
            }
          } else {
            blockedReason = `Lỗi HTTP ${insightsResult.status} khi đọc Insights.`;
          }
        } else if (insightsResult.data) {
          insightsOk = true;
          // Phân giải metrics
          const impressionsMetric = insightsResult.data.data.find(
            (m) => m.name === 'post_impressions',
          );
          impressions = impressionsMetric?.values?.[0]?.value ?? 0;
        }
      }
    } catch (err) {
      fetchStatus = 'failed';
      const errorMsg = err instanceof Error ? err.message : String(err);
      blockedReason = `System exception during fetch: ${errorMsg}`;
    }

    // Thống kê đếm
    if (fetchStatus === 'success') {
      successCount++;
    } else if (fetchStatus === 'partial') {
      partialCount++;
    } else if (fetchStatus === 'blocked') {
      blockedCount++;
    } else {
      failedCount++;
    }

    if (blockedReason) {
      blockedReasons.push(`Bài đăng [${postId}]: ${blockedReason}`);
    }

    const snapshot: ApiPerformanceSnapshot = {
      snapshotId: `facebook_api_${postId}_${Date.now()}`,
      platform: 'facebook',
      jobId: post.jobId,
      publishedPostId: post.publishedPostId,
      facebookPostId: postId,
      channelId: post.channelId,
      measuredAt: now,
      periodStart: post.publishedAt,
      periodEnd: now,
      views,
      impressions,
      clicks,
      comments,
      reactions,
      shares,
      saves,
      conversions,
      source: 'facebook_api',
      fetchStatus,
      blockedReason,
      rawMetricAvailability: {
        views: false,
        impressions: insightsOk,
        clicks: false,
        comments: basicOk,
        reactions: basicOk,
        shares: basicOk,
        saves: false,
        conversions: false,
      },
    };
    snapshotsToSave.push(snapshot);
  }

  // Ghi snapshots vào file runtime
  if (snapshotsToSave.length > 0) {
    const writeResult = appendApiPerformanceSnapshots(snapshotsToSave);
    if (writeResult.ok) {
      savedCount = writeResult.savedCount;
    }
  }

  return Response.json({
    ok: true,
    metaMode,
    attemptedCount,
    savedCount,
    successCount,
    partialCount,
    blockedCount,
    failedCount,
    blockedReasons,
    runtimeTargetConfigured,
  });
}
