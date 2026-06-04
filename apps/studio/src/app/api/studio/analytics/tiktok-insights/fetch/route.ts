/* =============================================================================
 * VFOS Studio — TikTok Insights Read-only Fetch API (Real API 05C)
 * -----------------------------------------------------------------------------
 * POST local-only. Đọc organic video metrics qua TikTok Display API
 * (/v2/video/list/), map về ApiPerformanceSnapshot (list-only, chưa map job)
 * và lưu runtime gitignored. An toàn: READ-ONLY, không upload/publish/comment,
 * không log/trả access value, disabled/mock KHÔNG gọi API và KHÔNG ghi runtime.
 * ========================================================================== */

import {
  apiRuntimePathConfigured,
  appendApiPerformanceSnapshots,
} from '@/lib/growth-data/runtime-store';
import type { ApiPerformanceSnapshot } from '@/lib/growth-data/types';
import { createTikTokDisplayClient } from '@/lib/tiktok/tiktok-client';

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);
/** Trần an toàn số video đọc 1 lần (read-only, không fetch hàng loạt vô hạn). */
const MAX_VIDEOS = 20;

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host);
}

interface FetchResponse {
  ok: boolean;
  mode: 'disabled' | 'mock' | 'display' | 'business';
  attemptedCount: number;
  savedCount: number;
  successCount: number;
  partialCount: number;
  blockedCount: number;
  failedCount: number;
  unmappedCount: number;
  runtimeTargetConfigured: boolean;
  messages: string[];
  checkedAt: string;
}

function baseResponse(
  mode: FetchResponse['mode'],
  runtimeTargetConfigured: boolean,
): FetchResponse {
  return {
    ok: true,
    mode,
    attemptedCount: 0,
    savedCount: 0,
    successCount: 0,
    partialCount: 0,
    blockedCount: 0,
    failedCount: 0,
    unmappedCount: 0,
    runtimeTargetConfigured,
    messages: [],
    checkedAt: new Date().toISOString(),
  };
}

export async function POST(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json(
      { ok: false, code: 'NOT_LOCAL', message: 'Chỉ cho phép fetch từ local dev.' },
      { status: 403 },
    );
  }

  const rawMode = (process.env.TIKTOK_MODE || '').trim().toLowerCase();
  let mode: FetchResponse['mode'] = 'disabled';
  if (rawMode === 'mock') mode = 'mock';
  if (rawMode === 'display') mode = 'display';
  if (rawMode === 'business') mode = 'business';

  const runtimeTargetConfigured = apiRuntimePathConfigured();
  const res = baseResponse(mode, runtimeTargetConfigured);

  // disabled/mock: KHÔNG gọi API, KHÔNG ghi runtime.
  if (mode === 'disabled' || mode === 'mock') {
    res.messages.push(
      mode === 'disabled'
        ? 'Chế độ vận hành = disabled — không gọi TikTok API, không ghi snapshot.'
        : 'Chế độ giả lập (mock) — không gọi TikTok API, không ghi snapshot.',
    );
    return Response.json(res);
  }

  // 05C chỉ hỗ trợ Display API. Business để round sau.
  if (mode === 'business') {
    res.messages.push('Business API ngoài phạm vi 05C. Vui lòng dùng TIKTOK_MODE=display.');
    return Response.json(res);
  }

  // mode === 'display'
  const accessToken = (process.env.TIKTOK_ACCESS_TOKEN || '').trim();
  const openId = (process.env.TIKTOK_OPEN_ID || '').trim();
  if (!accessToken || !openId) {
    res.blockedCount = 1;
    if (!accessToken) {
      res.messages.push('Thiếu Giá trị xác thực truy cập (access) trong cấu hình môi trường.');
    }
    if (!openId) {
      res.messages.push('Thiếu Mã người dùng mở (open id) trong cấu hình môi trường.');
    }
    return Response.json(res);
  }

  const client = createTikTokDisplayClient({ accessToken });
  const listResult = await client.listVideos({ maxCount: MAX_VIDEOS });

  if (!listResult.ok || !listResult.data) {
    const err = listResult.error;
    // Phân loại: lỗi xác thực/quyền → blocked; còn lại → failed. KHÔNG lộ access value.
    const isAuth =
      listResult.status === 401 ||
      listResult.status === 403 ||
      (err?.code ?? '').includes('token') ||
      (err?.code ?? '').includes('scope') ||
      (err?.code ?? '').includes('access');
    if (isAuth) {
      res.blockedCount = 1;
      res.messages.push(
        `Bị chặn xác thực/quyền TikTok Display API [${err?.code ?? 'unknown'}]. Kiểm tra access còn hạn và scope video.list đã được duyệt.`,
      );
    } else {
      res.failedCount = 1;
      res.messages.push(
        `Lỗi gọi TikTok Display API [${err?.code ?? 'unknown'}]: ${err?.message ?? ''}`,
      );
    }
    return Response.json(res);
  }

  const videos = (listResult.data.videos ?? []).slice(0, MAX_VIDEOS);
  res.attemptedCount = videos.length;

  if (videos.length === 0) {
    res.messages.push('TikTok Display API không trả về video nào cho tài khoản này.');
    return Response.json(res);
  }

  const now = new Date();
  const nowIso = now.toISOString();
  // Period key theo GIỜ → tránh spam snapshot khi refetch nhiều lần trong cùng giờ.
  const periodKey = nowIso.slice(0, 13).replace(/[-:T]/g, '');

  const snapshots: ApiPerformanceSnapshot[] = videos.map((v) => {
    const views = typeof v.view_count === 'number' ? v.view_count : null;
    const reactions = typeof v.like_count === 'number' ? v.like_count : null;
    const comments = typeof v.comment_count === 'number' ? v.comment_count : null;
    const shares = typeof v.share_count === 'number' ? v.share_count : null;
    const createdIso =
      typeof v.create_time === 'number' ? new Date(v.create_time * 1000).toISOString() : nowIso;

    res.successCount += 1;
    res.unmappedCount += 1; // list-only: chưa map về jobId

    return {
      snapshotId: `tiktok_api_${v.id}_${periodKey}`,
      platform: 'tiktok',
      jobId: null,
      publishedPostId: null,
      facebookPostId: null,
      tiktokVideoId: v.id,
      platformPostId: v.id,
      channelId: null,
      measuredAt: nowIso,
      periodStart: createdIso,
      periodEnd: nowIso,
      views,
      impressions: null,
      clicks: null,
      comments,
      reactions,
      shares,
      saves: null,
      conversions: null,
      source: 'tiktok_api',
      fetchStatus: 'success',
      rawMetricAvailability: {
        views: views !== null,
        impressions: false,
        clicks: false,
        comments: comments !== null,
        reactions: reactions !== null,
        shares: shares !== null,
        saves: false,
        conversions: false,
      },
    };
  });

  const writeResult = appendApiPerformanceSnapshots(snapshots);
  if (writeResult.ok) {
    res.savedCount = writeResult.savedCount;
    if (writeResult.duplicateIds.length > 0) {
      res.messages.push(
        `${writeResult.duplicateIds.length} snapshot trùng trong giờ này đã bỏ qua (dedupe).`,
      );
    }
  } else {
    res.messages.push('Không ghi được snapshot vào runtime store.');
  }
  res.messages.push(
    'TikTok Display API read-only: chỉ có views/reactions/comments/shares. Clicks/conversions KHÔNG khả dụng — cần manual import / Shopee.',
  );

  return Response.json(res);
}
