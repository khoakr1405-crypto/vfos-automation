/* =============================================================================
 * VFOS Studio — Facebook API Preflight & Capability Test (Real API 02A)
 * -----------------------------------------------------------------------------
 * GET local-only. Đọc env và kiểm tra kết nối/quyền Facebook Graph API.
 * An toàn: không log token, không trả token về client, chỉ trả boolean/status.
 * Mặc định META_MODE=mock (không gọi Graph API thật).
 * ========================================================================== */

import { loadPublishedPosts } from '@/lib/growth-data/load';
import { createMetaClient, testPageConnection } from '@vfos/facebook';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

/** Chỉ cho phép request từ local dev (host header). Chặn dùng từ xa. */
function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép preflight từ local dev.' },
      { status: 403 },
    );
  }

  const pageId = (process.env.FACEBOOK_PAGE_ID || '').trim();
  const pageAccessToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN || '').trim();
  const metaMode = (process.env.META_MODE || '').trim().toLowerCase() === 'live' ? 'live' : 'mock';

  const pageIdConfigured = !!pageId;
  const pageAccessConfigured = !!pageAccessToken;

  let pageConnectionStatus: 'not_run' | 'pass' | 'blocked' | 'failed' = 'not_run';
  let insightsCapabilityStatus: 'not_run' | 'pass' | 'partial' | 'blocked' | 'failed' = 'not_run';
  const blockedReasons: string[] = [];

  if (metaMode === 'mock') {
    blockedReasons.push('Hệ thống đang chạy ở chế độ MOCK (META_MODE != live).');
  } else {
    // META_MODE === 'live'
    if (!pageIdConfigured || !pageAccessConfigured) {
      pageConnectionStatus = 'blocked';
      insightsCapabilityStatus = 'blocked';
      if (!pageIdConfigured) {
        blockedReasons.push('Thiếu FACEBOOK_PAGE_ID trong cấu hình môi trường.');
      }
      if (!pageAccessConfigured) {
        blockedReasons.push(
          'Thiếu FACEBOOK_PAGE_ACCESS_TOKEN trong cấu hình môi trường (giá trị xác thực).',
        );
      }
    } else {
      try {
        const client = createMetaClient({ pageId, pageAccessToken });
        const connection = await testPageConnection(client);

        if (connection.success) {
          pageConnectionStatus = 'pass';

          // Connection passed, now check post insights capability on a sample post
          const posts = loadPublishedPosts();
          const samplePost = posts.find(
            (p) => p.facebookPostId && p.facebookPostId !== 'N/A' && p.facebookPostId.includes('_'),
          );

          if (!samplePost) {
            insightsCapabilityStatus = 'not_run';
            blockedReasons.push(
              'Không tìm thấy PublishedPost mẫu có facebookPostId hợp lệ để test capability.',
            );
          } else {
            const postId = samplePost.facebookPostId;

            // 1. Test basic post read
            const postResult = await client.get<{ id: string }>(`/${postId}`, { fields: 'id' });

            if (!postResult.ok) {
              const err = postResult.error;
              if (err) {
                if (err.code === 803 || err.code === 100 || postResult.status === 404) {
                  insightsCapabilityStatus = 'partial'; // Connection works, but fixture post not found
                  blockedReasons.push(
                    `Không tìm thấy bài đăng mẫu ID [${postId}] trên Facebook (có thể do ID giả lập).`,
                  );
                } else if (err.code === 200 || err.code === 10 || postResult.status === 403) {
                  insightsCapabilityStatus = 'blocked';
                  blockedReasons.push(`Thiếu quyền đọc bài viết: [${err.type}] ${err.message}`);
                } else {
                  insightsCapabilityStatus = 'failed';
                  blockedReasons.push(`Lỗi đọc bài đăng mẫu: [${err.type}] ${err.message}`);
                }
              } else {
                insightsCapabilityStatus = 'failed';
                blockedReasons.push(`Lỗi HTTP ${postResult.status} khi đọc bài đăng mẫu.`);
              }
            } else {
              // 2. Test insights read
              const insightsResult = await client.get<unknown>(`/${postId}/insights`, {
                metric: 'post_impressions',
              });

              if (insightsResult.ok) {
                insightsCapabilityStatus = 'pass';
              } else {
                const err = insightsResult.error;
                if (err) {
                  if (err.code === 200 || err.code === 10 || insightsResult.status === 403) {
                    insightsCapabilityStatus = 'blocked';
                    blockedReasons.push(`Thiếu quyền read_insights: [${err.type}] ${err.message}`);
                  } else {
                    insightsCapabilityStatus = 'failed';
                    blockedReasons.push(`Lỗi đọc Insights bài đăng: [${err.type}] ${err.message}`);
                  }
                } else {
                  insightsCapabilityStatus = 'failed';
                  blockedReasons.push(
                    `Lỗi HTTP ${insightsResult.status} khi đọc Insights bài đăng.`,
                  );
                }
              }
            }
          }
        } else {
          pageConnectionStatus = 'blocked';
          insightsCapabilityStatus = 'blocked';
          blockedReasons.push(connection.error || 'Kết nối Page thất bại.');
          if (connection.diagnosis) {
            blockedReasons.push(connection.diagnosis);
          }
        }
      } catch (err) {
        pageConnectionStatus = 'failed';
        insightsCapabilityStatus = 'failed';
        const errorMsg = err instanceof Error ? err.message : String(err);
        blockedReasons.push(`System error during preflight: ${errorMsg}`);
      }
    }
  }

  return Response.json({
    pageIdConfigured,
    pageAccessConfigured,
    metaMode,
    pageConnectionStatus,
    insightsCapabilityStatus,
    blockedReasons,
    checkedAt: new Date().toISOString(),
  });
}
