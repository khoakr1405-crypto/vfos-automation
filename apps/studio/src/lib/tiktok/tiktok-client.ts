/* =============================================================================
 * VFOS Studio — TikTok Display API read-only client (Real API 05C)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. Đọc access value từ env server-side, gọi TikTok Display API
 * READ-ONLY (/v2/video/list/). KHÔNG upload/publish/comment. KHÔNG log/trả
 * access value. Tài liệu chính thức: developers.tiktok.com (Display API v2).
 * ========================================================================== */

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';

/** Field công khai lấy từ /v2/video/list/ (theo official Video Object). */
export const TIKTOK_VIDEO_FIELDS = [
  'id',
  'create_time',
  'title',
  'share_url',
  'duration',
  'view_count',
  'like_count',
  'comment_count',
  'share_count',
] as const;

export interface TikTokVideo {
  id: string;
  create_time?: number;
  title?: string;
  share_url?: string;
  duration?: number;
  view_count?: number;
  like_count?: number;
  comment_count?: number;
  share_count?: number;
}

interface TikTokVideoListData {
  videos?: TikTokVideo[];
  cursor?: number;
  has_more?: boolean;
}

/** Lỗi đã sanitize — KHÔNG bao giờ chứa access value. */
export interface TikTokApiError {
  code: string;
  message: string;
  log_id?: string;
}

export interface TikTokApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: TikTokApiError;
}

export interface TikTokDisplayClient {
  /** Đọc danh sách video công khai của chính chủ tài khoản (read-only). */
  listVideos(opts?: {
    maxCount?: number;
    cursor?: number;
  }): Promise<TikTokApiResult<TikTokVideoListData>>;
}

/**
 * Tạo client Display API từ access value (đọc ở env server-side, KHÔNG log).
 * Read-only: chỉ POST /v2/video/list/ với Bearer header. Timeout nhẹ, no retry.
 */
export function createTikTokDisplayClient(config: { accessToken: string }): TikTokDisplayClient {
  const { accessToken } = config;

  return {
    async listVideos(opts = {}): Promise<TikTokApiResult<TikTokVideoListData>> {
      const maxCount = Math.min(Math.max(opts.maxCount ?? 20, 1), 20);
      const url = new URL(`${TIKTOK_API_BASE}/video/list/`);
      url.searchParams.set('fields', TIKTOK_VIDEO_FIELDS.join(','));

      const body: Record<string, number> = { max_count: maxCount };
      if (typeof opts.cursor === 'number') body.cursor = opts.cursor;

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      try {
        const response = await fetch(url.toString(), {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'User-Agent': 'VFOS/0.1.0',
          },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        const json = (await response.json().catch(() => ({}))) as {
          data?: TikTokVideoListData;
          error?: Partial<TikTokApiError>;
        };

        const err = json.error ?? {};
        const errCode = String(err.code ?? '');
        // TikTok v2 trả error.code === 'ok' khi thành công.
        const apiOk = response.ok && (errCode === '' || errCode === 'ok');

        if (!apiOk) {
          return {
            ok: false,
            status: response.status,
            error: {
              code: errCode || `http_${response.status}`,
              message: String(err.message ?? 'Lỗi không xác định từ TikTok API'),
              log_id: err.log_id ? String(err.log_id) : undefined,
            },
          };
        }

        return { ok: true, status: response.status, data: json.data ?? {} };
      } catch (e: unknown) {
        const aborted = e instanceof Error && e.name === 'AbortError';
        return {
          ok: false,
          status: 0,
          error: {
            code: aborted ? 'timeout' : 'network_error',
            message: aborted ? 'Hết thời gian chờ TikTok API.' : 'Lỗi mạng khi gọi TikTok API.',
          },
        };
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
