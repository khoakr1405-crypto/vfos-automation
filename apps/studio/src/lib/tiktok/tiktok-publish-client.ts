/* =============================================================================
 * VFOS Studio — TikTok Content Posting API client (Phase 3, entertainment lane)
 * -----------------------------------------------------------------------------
 * SERVER ONLY. ADDITIVE — KHÔNG sửa tiktok-client.ts (Display read-only) /
 * analytics / growth. Triển khai Content Posting API (Direct Post, FILE_UPLOAD):
 *   init  → POST /v2/post/publish/video/init/
 *   upload→ PUT  upload_url (single chunk)
 *   status→ POST /v2/post/publish/status/fetch/
 * Pure module: KHÔNG import alias @/ (để node:test nạp được). KHÔNG log/throw
 * access token. Round 1 chỉ dùng mock client trong test — real client KHÔNG được
 * gọi live (publish.ts còn chặn LIVE_NOT_ENABLED).
 * ========================================================================== */

import { readFileSync, statSync } from 'node:fs';

const TIKTOK_API_BASE = 'https://open.tiktokapis.com/v2';
/** Kích thước mỗi chunk khi upload nhiều phần (TikTok: 5MB–64MB/chunk; chunk cuối ôm dư). */
const CHUNK_SIZE_BYTES = 10 * 1024 * 1024;
const INIT_TIMEOUT_MS = 15_000;
const UPLOAD_TIMEOUT_MS = 120_000;
const STATUS_TIMEOUT_MS = 10_000;
const STATUS_POLL_MAX = 20;
const STATUS_POLL_INTERVAL_MS = 3_000;

export type TikTokPublishMode = 'mock' | 'display' | 'business';

export interface TikTokPublishInput {
  /** Đường dẫn tuyệt đối tới final mp4 đã duyệt. */
  videoPath: string;
  /** Caption cuối (đã gồm hook); hashtags nối vào title khi đăng. */
  caption: string;
  hashtags?: string[];
  /** Privacy của bài đăng — app chưa audit thường buộc SELF_ONLY. */
  privacyLevel?: 'SELF_ONLY' | 'PUBLIC_TO_EVERYONE' | 'MUTUAL_FOLLOW_FRIENDS';
}

/** Lỗi đã sanitize — KHÔNG bao giờ chứa access token. */
export interface TikTokPublishError {
  code: string;
  message: string;
  logId?: string;
}

export interface TikTokPublishResult {
  ok: boolean;
  mode: TikTokPublishMode;
  publishId?: string;
  postId?: string;
  shareUrl?: string;
  /** Trạng thái cuối từ status/fetch (PUBLISH_COMPLETE | FAILED | …). */
  publishStatus?: string;
  error?: TikTokPublishError;
}

export interface TikTokPublishClient {
  publishVideo(input: TikTokPublishInput): Promise<TikTokPublishResult>;
}

/** Nối caption + hashtag thành title TikTok (1 dòng). */
function buildTitle(caption: string, hashtags?: string[]): string {
  const tags = (hashtags ?? []).filter((h) => h.startsWith('#')).join(' ');
  return tags ? `${caption.trim()} ${tags}`.trim() : caption.trim();
}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; json: Record<string, unknown> }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    return { status: res.status, json };
  } finally {
    clearTimeout(timer);
  }
}

/** Bóc error TikTok v2 ({ error: { code, message, log_id } }) → sanitize. */
function parseTikTokError(json: Record<string, unknown>, httpStatus: number): TikTokPublishError {
  const err = (json.error ?? {}) as { code?: string; message?: string; log_id?: string };
  const code = String(err.code ?? `http_${httpStatus}`);
  const isAuth = /access_token|token|unauthorized|scope/i.test(`${code} ${err.message ?? ''}`);
  return {
    code: isAuth ? 'auth_expired' : code || `http_${httpStatus}`,
    message: String(err.message ?? 'Lỗi không xác định từ TikTok API.'),
    logId: err.log_id ? String(err.log_id) : undefined,
  };
}

/**
 * Real Content Posting client. accessToken truyền vào, KHÔNG log/echo. Round 1
 * KHÔNG chạy live (publish.ts chặn). Direct Post + FILE_UPLOAD single chunk.
 */
export function createTikTokPublishClient(config: {
  accessToken: string;
  mode: 'display' | 'business';
}): TikTokPublishClient {
  const { accessToken, mode } = config;
  const authHeaders = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'User-Agent': 'VFOS/0.1.0',
  };

  return {
    async publishVideo(input: TikTokPublishInput): Promise<TikTokPublishResult> {
      try {
        const size = statSync(input.videoPath).size;
        if (size <= 0) {
          return { ok: false, mode, error: { code: 'empty_video', message: 'File video rỗng.' } };
        }
        // Chunk plan: nhỏ → 1 chunk; lớn → 10MB/chunk, chunk CUỐI ôm phần dư.
        const totalChunkCount = Math.max(1, Math.floor(size / CHUNK_SIZE_BYTES));
        const chunkSize = totalChunkCount === 1 ? size : CHUNK_SIZE_BYTES;

        // 0) CREATOR INFO — bắt buộc trước Direct Post: lấy privacy_level_options
        const ci = await fetchJson(
          `${TIKTOK_API_BASE}/post/publish/creator_info/query/`,
          { method: 'POST', headers: authHeaders, body: '{}' },
          INIT_TIMEOUT_MS,
        );
        const ciData = (ci.json.data ?? {}) as { privacy_level_options?: string[] };
        const privacyOptions = ciData.privacy_level_options ?? [];
        if (ci.status >= 400 || privacyOptions.length === 0) {
          return { ok: false, mode, error: parseTikTokError(ci.json, ci.status) };
        }
        const wantedPrivacy = input.privacyLevel ?? 'SELF_ONLY';
        const privacyLevel = privacyOptions.includes(wantedPrivacy)
          ? wantedPrivacy
          : privacyOptions.includes('SELF_ONLY')
            ? 'SELF_ONLY'
            : privacyOptions[0];

        // 1) INIT
        const initBody = {
          post_info: {
            title: buildTitle(input.caption, input.hashtags),
            privacy_level: privacyLevel,
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
          },
          source_info: {
            source: 'FILE_UPLOAD',
            video_size: size,
            chunk_size: chunkSize,
            total_chunk_count: totalChunkCount,
          },
        };
        const init = await fetchJson(
          `${TIKTOK_API_BASE}/post/publish/video/init/`,
          { method: 'POST', headers: authHeaders, body: JSON.stringify(initBody) },
          INIT_TIMEOUT_MS,
        );
        const initData = (init.json.data ?? {}) as { publish_id?: string; upload_url?: string };
        if (!init.json || init.status >= 400 || !initData.publish_id || !initData.upload_url) {
          return { ok: false, mode, error: parseTikTokError(init.json, init.status) };
        }
        const publishId = initData.publish_id;

        // 2) UPLOAD — PUT từng chunk (Content-Range theo từng phần; chunk cuối tới hết file)
        const bytes = readFileSync(input.videoPath);
        let uploadStatus = 0;
        for (let i = 0; i < totalChunkCount; i++) {
          const start = i * chunkSize;
          const end = i === totalChunkCount - 1 ? size - 1 : start + chunkSize - 1;
          const part = bytes.subarray(start, end + 1);
          const upController = new AbortController();
          const upTimer = setTimeout(() => upController.abort(), UPLOAD_TIMEOUT_MS);
          try {
            const up = await fetch(initData.upload_url, {
              method: 'PUT',
              headers: {
                'Content-Type': 'video/mp4',
                'Content-Length': String(part.length),
                'Content-Range': `bytes ${start}-${end}/${size}`,
              },
              body: part,
              signal: upController.signal,
            });
            uploadStatus = up.status;
          } finally {
            clearTimeout(upTimer);
          }
          if (uploadStatus >= 400) break;
        }
        if (uploadStatus >= 400) {
          return {
            ok: false,
            mode,
            publishId,
            error: { code: `upload_http_${uploadStatus}`, message: 'Upload video thất bại.' },
          };
        }

        // 3) POLL STATUS
        for (let i = 0; i < STATUS_POLL_MAX; i++) {
          const st = await fetchJson(
            `${TIKTOK_API_BASE}/post/publish/status/fetch/`,
            {
              method: 'POST',
              headers: authHeaders,
              body: JSON.stringify({ publish_id: publishId }),
            },
            STATUS_TIMEOUT_MS,
          );
          const stData = (st.json.data ?? {}) as {
            status?: string;
            publicaly_available_post_id?: string[];
            share_url?: string;
          };
          const status = stData.status ?? 'PROCESSING';
          if (status === 'PUBLISH_COMPLETE') {
            const postId = stData.publicaly_available_post_id?.[0];
            return {
              ok: true,
              mode,
              publishId,
              postId,
              shareUrl: stData.share_url,
              publishStatus: status,
            };
          }
          if (status === 'FAILED') {
            return {
              ok: false,
              mode,
              publishId,
              publishStatus: status,
              error: parseTikTokError(st.json, st.status),
            };
          }
          await new Promise((r) => setTimeout(r, STATUS_POLL_INTERVAL_MS));
        }
        return {
          ok: false,
          mode,
          publishId,
          error: { code: 'status_timeout', message: 'TikTok xử lý quá lâu (timeout chờ status).' },
        };
      } catch (e: unknown) {
        const aborted = e instanceof Error && e.name === 'AbortError';
        return {
          ok: false,
          mode,
          error: {
            code: aborted ? 'timeout' : 'network_error',
            message: aborted ? 'Hết thời gian chờ TikTok API.' : 'Lỗi mạng khi gọi TikTok API.',
          },
        };
      }
    },
  };
}

/**
 * Mock client cho test/dev (TIKTOK_MODE=mock). KHÔNG gọi mạng. Deterministic:
 * mặc định trả PUBLISH_COMPLETE; truyền `fail` để mô phỏng lỗi API.
 */
export function createMockTikTokPublishClient(opts?: {
  fail?: TikTokPublishError;
  postId?: string;
  shareUrl?: string;
}): TikTokPublishClient {
  return {
    async publishVideo(_input: TikTokPublishInput): Promise<TikTokPublishResult> {
      if (opts?.fail) {
        return { ok: false, mode: 'mock', publishStatus: 'FAILED', error: opts.fail };
      }
      const ts = Date.now();
      return {
        ok: true,
        mode: 'mock',
        publishId: `mock_pub_${ts}`,
        postId: opts?.postId ?? `mock_post_${ts}`,
        shareUrl: opts?.shareUrl ?? `https://www.tiktok.com/@vfos_mock/video/${ts}`,
        publishStatus: 'PUBLISH_COMPLETE',
      };
    },
  };
}
