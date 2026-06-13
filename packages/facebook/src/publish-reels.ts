/**
 * Publish a video as a Reel to a Facebook Page via the Reels Publishing API.
 *
 * 3-phase flow + MANDATORY Graph readback verify:
 *   1. start  — POST /{page_id}/video_reels (upload_phase=start) → video_id + upload_url
 *   2. upload — POST rupload.facebook.com/video-upload/{ver}/{video_id} (binary, OAuth header)
 *   3. finish — POST /{page_id}/video_reels (upload_phase=finish, video_state=PUBLISHED)
 *   4. poll   — GET /{video_id}?fields=status until ready/complete (capped)
 *   5. verify — GET /{video_id}?fields=id,permalink_url — REQUIRED before success
 *
 * Truth rules (hậu quả sự cố fake publish 2026-06-11):
 * - KHÔNG có mock-success: META_MODE !== 'live' → fail rõ ràng, không trả id giả.
 * - `success: true` CHỈ khi readback verify trả về id + permalink_url thật từ Graph.
 * - `uploadAccepted: true` từ thời điểm finish phase được Facebook chấp nhận —
 *   caller dùng cờ này để khóa double-publish khi verify fail/timeout.
 * - Token chỉ đi qua Authorization header / form body. KHÔNG bao giờ log.
 *
 * Truth rule bổ sung (sự cố visibility 2026-06-11, reel 1028983246151885):
 * - Graph readback xanh (published=true, privacy=EVERYONE, publish_status=published)
 *   KHÔNG chứng minh nick ngoài xem được — distribution hold phía Facebook không
 *   expose qua API. Vì vậy `success`/`verified` CHỈ có nghĩa API publish confirmed;
 *   `publicVisibilityConfirmed` luôn `false` ở layer này — chỉ Operator xác nhận
 *   bằng tài khoản ngoài mới được nâng lên PUBLIC_CONFIRMED ở layer workflow.
 */

import { readFileSync, statSync } from 'node:fs';

const GRAPH_VERSION = 'v22.0';
const GRAPH_BASE = `https://graph.facebook.com/${GRAPH_VERSION}`;
const RUPLOAD_BASE = `https://rupload.facebook.com/video-upload/${GRAPH_VERSION}`;

export type ReelPublishPhase =
  | 'mode_gate'
  | 'precheck'
  | 'start'
  | 'upload'
  | 'finish'
  | 'processing'
  | 'verify'
  | 'done';

export interface ReelPublishOptions {
  /** Absolute path to the final MP4 (9:16, 3–90s). */
  videoFilePath: string;
  /** Reel description (caption + affiliate link + hashtags). */
  description: string;
  /** Poll interval while Facebook processes the video. Default 10s. */
  pollIntervalMs?: number;
  /** Max total time to wait for processing before giving up. Default 240s. */
  maxPollMs?: number;
}

/** Trạng thái hiển thị công khai — chỉ Operator/nick ngoài mới confirm được. */
export type PublishVisibility = 'UNCONFIRMED' | 'PUBLIC_CONFIRMED' | 'NOT_PUBLIC';

export interface ReelPublishResult {
  /**
   * True ONLY when the reel is published AND verified via Graph readback.
   * Semantic = API publish confirmed. KHÔNG bao hàm public visibility.
   */
  success: boolean;
  /** Phase reached (on success: "done") or phase that failed. */
  phase: ReelPublishPhase;
  /** True once Facebook accepted the finish phase — video may exist on the Page. */
  uploadAccepted: boolean;
  /** True only when readback verify returned real id + permalink. */
  verified: boolean;
  /** Alias semantic rõ của `verified`: Graph xác nhận object đã publish ở mức API. */
  apiPublishConfirmed: boolean;
  /** LUÔN false ở layer uploader — API không chứng minh được nick ngoài xem được. */
  publicVisibilityConfirmed: boolean;
  /** UNCONFIRMED khi publish API xong; nâng cấp PUBLIC_CONFIRMED là việc của Operator. */
  publishVisibility?: PublishVisibility;
  videoId?: string;
  permalinkUrl?: string;
  /** Evidence readback mở rộng (optional — thiếu không làm fail verify). */
  readbackPublished?: boolean;
  readbackPrivacy?: string;
  readbackPublishStatus?: string;
  error?: string;
  diagnosis?: string;
}

interface GraphErrorBody {
  message: string;
  type: string;
  code: number;
}

function parseGraphError(body: Record<string, unknown>): GraphErrorBody {
  const fbError = (body.error ?? {}) as Record<string, unknown>;
  return {
    message: String(fbError.message ?? 'Unknown error'),
    type: String(fbError.type ?? 'UnknownError'),
    code: Number(fbError.code ?? 0),
  };
}

function fail(
  phase: ReelPublishPhase,
  error: string,
  extra: Partial<ReelPublishResult> = {},
): ReelPublishResult {
  return {
    success: false,
    phase,
    uploadAccepted: false,
    verified: false,
    apiPublishConfirmed: false,
    publicVisibilityConfirmed: false,
    error,
    ...extra,
  };
}

/** POST form-encoded to Graph API. Token in body, never in URL/log. */
async function postGraph(
  path: string,
  token: string,
  params: Record<string, string>,
  timeoutMs: number,
): Promise<{ ok: boolean; body: Record<string, unknown>; error?: GraphErrorBody }> {
  const form = new URLSearchParams({ ...params, access_token: token });
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'VFOS/0.1.0' },
    body: form.toString(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) return { ok: false, body, error: parseGraphError(body) };
  return { ok: true, body };
}

/** GET from Graph API. Token via Authorization header, never in URL/log. */
async function getGraph(
  path: string,
  token: string,
  timeoutMs: number,
): Promise<{ ok: boolean; body: Record<string, unknown>; error?: GraphErrorBody }> {
  const response = await fetch(`${GRAPH_BASE}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'VFOS/0.1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok) return { ok: false, body, error: parseGraphError(body) };
  return { ok: true, body };
}

function normalizePermalink(raw: string): string {
  if (raw.startsWith('/')) return `https://www.facebook.com${raw}`;
  return raw;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Re-verify một reel ĐÃ upload (uploaded=true) nhưng verify fail/timeout lần
 * trước — KHÔNG re-upload. Chỉ chạy phase 5 (Graph readback GET) trên videoId
 * đã có. READ-ONLY: 1 GET request, token qua Authorization header (không log).
 *
 * Dùng cho `--retry-verify`: khi finish phase đã được Facebook chấp nhận nhưng
 * verify trước đó fail (mạng/timeout/processing chưa xong), gọi lại để biết
 * video giờ đã publish chưa. success=true CHỈ khi readback trả id + permalink
 * thật (cùng truth rule với publishReelToPage). KHÔNG mock-success.
 */
export async function verifyReelPublished(
  pageAccessToken: string,
  videoId: string,
): Promise<ReelPublishResult> {
  const metaMode = (process.env.META_MODE ?? '').trim().toLowerCase();
  if (metaMode !== 'live') {
    return fail('mode_gate', `META_MODE_NOT_LIVE: META_MODE='${metaMode || 'unset'}' — verify bị chặn.`, {
      diagnosis: 'Set META_MODE=live để re-verify. KHÔNG có API call nào đã được thực hiện.',
    });
  }
  if (!videoId.trim()) {
    return fail('verify', 'VERIFY_NO_VIDEO_ID: thiếu videoId để re-verify.');
  }

  const accepted: Partial<ReelPublishResult> = { uploadAccepted: true, videoId };
  try {
    const verifyFields = encodeURIComponent(
      'id,permalink_url,published,privacy{value},status{publishing_phase}',
    );
    const verify = await getGraph(`/${videoId}?fields=${verifyFields}`, pageAccessToken, 30_000);
    if (!verify.ok) {
      return {
        ...fail(
          'verify',
          `VERIFY_FAILED: [${verify.error?.type}] ${verify.error?.message} (code: ${verify.error?.code})`,
        ),
        ...accepted,
        diagnosis: 'Readback vẫn fail. Kiểm tra Page thủ công trước khi thử lại.',
      } as ReelPublishResult;
    }
    const verifiedId = String(verify.body.id ?? '');
    const permalinkRaw = String(verify.body.permalink_url ?? '');
    if (!verifiedId || !permalinkRaw) {
      return {
        ...fail('verify', 'VERIFY_INCOMPLETE: Graph readback thiếu id hoặc permalink_url.'),
        ...accepted,
      } as ReelPublishResult;
    }
    const readbackPrivacy = (verify.body.privacy ?? {}) as Record<string, unknown>;
    const readbackStatus = (verify.body.status ?? {}) as Record<string, unknown>;
    const readbackPublishing = (readbackStatus.publishing_phase ?? {}) as Record<string, unknown>;
    return {
      success: true,
      phase: 'done',
      uploadAccepted: true,
      verified: true,
      apiPublishConfirmed: true,
      publicVisibilityConfirmed: false,
      publishVisibility: 'UNCONFIRMED',
      videoId: verifiedId,
      permalinkUrl: normalizePermalink(permalinkRaw),
      ...(typeof verify.body.published === 'boolean'
        ? { readbackPublished: verify.body.published }
        : {}),
      ...(readbackPrivacy.value ? { readbackPrivacy: String(readbackPrivacy.value) } : {}),
      ...(readbackPublishing.publish_status
        ? { readbackPublishStatus: String(readbackPublishing.publish_status) }
        : {}),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail('verify', `NETWORK_OR_RUNTIME_ERROR: ${message}`, {
      ...accepted,
      diagnosis: 'Lỗi mạng/timeout khi re-verify. Video đã upload trước đó vẫn còn — thử lại được.',
    });
  }
}

/**
 * Publish one reel to the Page. See module header for the truth rules.
 */
export async function publishReelToPage(
  pageId: string,
  pageAccessToken: string,
  options: ReelPublishOptions,
): Promise<ReelPublishResult> {
  const pollIntervalMs = options.pollIntervalMs ?? 10_000;
  const maxPollMs = options.maxPollMs ?? 240_000;

  // Mode gate (defense-in-depth, cùng chuẩn publishTextPost — nhưng KHÔNG mock-success).
  const metaMode = (process.env.META_MODE ?? '').trim().toLowerCase();
  if (metaMode !== 'live') {
    return fail(
      'mode_gate',
      `META_MODE_NOT_LIVE: META_MODE='${metaMode || 'unset'}' — live reel publish bị chặn.`,
      {
        diagnosis:
          'Set META_MODE=live trong .env và chạy lại với xác nhận Operator. KHÔNG có API call nào đã được thực hiện.',
      },
    );
  }

  // Precheck: file tồn tại, size > 0.
  let fileSize = 0;
  try {
    fileSize = statSync(options.videoFilePath).size;
  } catch {
    return fail('precheck', `VIDEO_FILE_NOT_FOUND: ${options.videoFilePath}`);
  }
  if (fileSize <= 0) {
    return fail('precheck', `VIDEO_FILE_EMPTY: ${options.videoFilePath}`);
  }

  // Phase tracking cho catch-all: lỗi runtime SAU finish vẫn phải báo đúng phase
  // và giữ uploadAccepted=true để caller khóa double-publish.
  let currentPhase: ReelPublishPhase = 'start';
  let acceptedVideoId: string | undefined;
  let uploadAcceptedFlag = false;

  try {
    // Phase 1 — start
    const start = await postGraph(
      `/${pageId}/video_reels`,
      pageAccessToken,
      { upload_phase: 'start' },
      30_000,
    );
    if (!start.ok) {
      return fail(
        'start',
        `[${start.error?.type}] ${start.error?.message} (code: ${start.error?.code})`,
      );
    }
    const videoId = String(start.body.video_id ?? '');
    if (!videoId) {
      return fail('start', 'START_NO_VIDEO_ID: Graph không trả video_id.');
    }

    // Phase 2 — binary upload (rupload host, OAuth header, offset 0 = single shot)
    currentPhase = 'upload';
    acceptedVideoId = videoId;
    const videoBuffer = readFileSync(options.videoFilePath);
    const uploadResponse = await fetch(`${RUPLOAD_BASE}/${videoId}`, {
      method: 'POST',
      headers: {
        Authorization: `OAuth ${pageAccessToken}`,
        offset: '0',
        file_size: String(fileSize),
        'Content-Type': 'application/octet-stream',
        'User-Agent': 'VFOS/0.1.0',
      },
      body: new Uint8Array(videoBuffer),
      signal: AbortSignal.timeout(180_000),
    });
    const uploadBody = (await uploadResponse.json().catch(() => ({}))) as Record<string, unknown>;
    if (!uploadResponse.ok || uploadBody.success !== true) {
      const err = parseGraphError(uploadBody);
      return fail(
        'upload',
        `UPLOAD_REJECTED (HTTP ${uploadResponse.status}): [${err.type}] ${err.message} (code: ${err.code})`,
        { videoId },
      );
    }

    // Phase 3 — finish (video_state=PUBLISHED ⇒ lên Page sau khi processing xong)
    currentPhase = 'finish';
    const finish = await postGraph(
      `/${pageId}/video_reels`,
      pageAccessToken,
      {
        upload_phase: 'finish',
        video_id: videoId,
        video_state: 'PUBLISHED',
        description: options.description,
      },
      30_000,
    );
    if (!finish.ok) {
      return fail(
        'finish',
        `[${finish.error?.type}] ${finish.error?.message} (code: ${finish.error?.code})`,
        { videoId },
      );
    }

    // Từ đây Facebook ĐÃ nhận video — mọi fail tiếp theo phải giữ uploadAccepted=true
    // để caller khóa double-publish.
    uploadAcceptedFlag = true;
    const accepted: Partial<ReelPublishResult> = { uploadAccepted: true, videoId };

    // Phase 4 — poll processing/publishing status (capped)
    currentPhase = 'processing';
    const deadline = Date.now() + maxPollMs;
    let lastStatus = 'unknown';
    while (Date.now() < deadline) {
      const statusRes = await getGraph(`/${videoId}?fields=status`, pageAccessToken, 30_000);
      if (statusRes.ok) {
        const status = (statusRes.body.status ?? {}) as Record<string, unknown>;
        const videoStatus = String(status.video_status ?? 'unknown');
        const publishing = (status.publishing_phase ?? {}) as Record<string, unknown>;
        const publishingStatus = String(publishing.status ?? 'unknown');
        lastStatus = `video_status=${videoStatus}, publishing=${publishingStatus}`;
        if (videoStatus === 'error' || publishingStatus === 'error') {
          return {
            ...fail('processing', `PROCESSING_ERROR: ${lastStatus}`),
            ...accepted,
            success: false,
            verified: false,
          } as ReelPublishResult;
        }
        if (videoStatus === 'ready' || publishingStatus === 'complete') break;
      }
      await sleep(pollIntervalMs);
    }
    if (Date.now() >= deadline) {
      return {
        ...fail(
          'processing',
          `PROCESSING_TIMEOUT sau ${Math.round(maxPollMs / 1000)}s (${lastStatus}). Video CÓ THỂ vẫn đang xử lý phía Facebook.`,
        ),
        ...accepted,
        success: false,
        verified: false,
        diagnosis:
          'Kiểm tra Page thủ công. KHÔNG đăng lại khi chưa xác nhận — safety lock uploaded=true phải được caller bật.',
      } as ReelPublishResult;
    }

    // Phase 5 — readback verify (BẮT BUỘC trước khi claim API publish).
    // Field mở rộng (published/privacy/publishing_phase) là EVIDENCE — vẫn chỉ
    // chứng minh mức API, KHÔNG chứng minh public visibility.
    currentPhase = 'verify';
    const verifyFields = encodeURIComponent(
      'id,permalink_url,published,privacy{value},status{publishing_phase}',
    );
    const verify = await getGraph(`/${videoId}?fields=${verifyFields}`, pageAccessToken, 30_000);
    if (!verify.ok) {
      return {
        ...fail(
          'verify',
          `VERIFY_FAILED: [${verify.error?.type}] ${verify.error?.message} (code: ${verify.error?.code})`,
        ),
        ...accepted,
        success: false,
        verified: false,
        diagnosis: 'Finish đã OK nhưng readback fail. Kiểm tra Page thủ công trước khi thử lại.',
      } as ReelPublishResult;
    }
    const verifiedId = String(verify.body.id ?? '');
    const permalinkRaw = String(verify.body.permalink_url ?? '');
    if (!verifiedId || !permalinkRaw) {
      return {
        ...fail('verify', 'VERIFY_INCOMPLETE: Graph readback thiếu id hoặc permalink_url.'),
        ...accepted,
        success: false,
        verified: false,
      } as ReelPublishResult;
    }

    // Evidence mở rộng — optional, thiếu field không làm fail verify.
    const readbackPrivacy = (verify.body.privacy ?? {}) as Record<string, unknown>;
    const readbackStatus = (verify.body.status ?? {}) as Record<string, unknown>;
    const readbackPublishing = (readbackStatus.publishing_phase ?? {}) as Record<string, unknown>;

    return {
      success: true,
      phase: 'done',
      uploadAccepted: true,
      verified: true,
      apiPublishConfirmed: true,
      // API readback KHÔNG chứng minh nick ngoài xem được (case 1028983246151885:
      // mọi field xanh nhưng public không thấy). Operator confirm mới nâng cấp.
      publicVisibilityConfirmed: false,
      publishVisibility: 'UNCONFIRMED',
      videoId: verifiedId,
      permalinkUrl: normalizePermalink(permalinkRaw),
      ...(typeof verify.body.published === 'boolean'
        ? { readbackPublished: verify.body.published }
        : {}),
      ...(readbackPrivacy.value ? { readbackPrivacy: String(readbackPrivacy.value) } : {}),
      ...(readbackPublishing.publish_status
        ? { readbackPublishStatus: String(readbackPublishing.publish_status) }
        : {}),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return fail(currentPhase, `NETWORK_OR_RUNTIME_ERROR: ${message}`, {
      uploadAccepted: uploadAcceptedFlag,
      ...(acceptedVideoId ? { videoId: acceptedVideoId } : {}),
      diagnosis: uploadAcceptedFlag
        ? 'Lỗi xảy ra SAU khi Facebook nhận video — kiểm tra Page thủ công trước khi thử lại (caller phải bật safety lock uploaded=true).'
        : 'Lỗi mạng/timeout trước khi video được Facebook chấp nhận. Manifest giữ nguyên, thử lại được.',
    });
  }
}
