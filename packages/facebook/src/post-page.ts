/**
 * Publish a text-only post to a Facebook Page via Meta Graph API.
 *
 * Endpoint: POST /{page_id}/feed
 * Docs: https://developers.facebook.com/docs/pages-api/posts
 *
 * Security:
 * - Tokens are NEVER logged.
 * - HARD safety gate: `META_MODE=mock` (default) returns a mock result WITHOUT
 *   calling the Graph API. Only `META_MODE=live` performs a real publish.
 *   The default is mock so accidental invocation does not publish to a real Page.
 */

export interface TextPostRequest {
  /** The text content of the post */
  message: string;
}

export type PublishMode = "mock" | "live";

export interface TextPostResult {
  success: boolean;
  /** The ID of the created post (format: "pageId_postId" for live, "mock_dry_run_<ts>" for mock) */
  postId?: string;
  error?: string;
  diagnosis?: string;
  /** Which mode the publish ran in. `"mock"` = no API call. `"live"` = real publish. */
  mode: PublishMode;
}

/**
 * Read META_MODE from env. Returns `"live"` only when explicitly set to `live`.
 * Anything else (unset, empty, mock, anything else) returns `"mock"` (safe default).
 */
export function resolvePublishMode(): PublishMode {
  const raw = (process.env["META_MODE"] ?? "").trim().toLowerCase();
  return raw === "live" ? "live" : "mock";
}

/**
 * Publish a text-only post to the configured Facebook Page.
 * Uses the page access token from the client config.
 *
 * HARD GATE: respects `META_MODE` from the environment.
 *   - `META_MODE=mock` (default, includes unset/empty/any non-"live" value):
 *     returns a mock result with `mode: "mock"`. NO Graph API call is made.
 *     `postId` will be `"mock_dry_run_<timestamp>"`.
 *   - `META_MODE=live`: performs the real publish. Caller MUST also have
 *     explicit operator confirmation (e.g. `--confirm-publish` in CLI scripts).
 */
export async function publishTextPost(
  pageId: string,
  pageAccessToken: string,
  request: TextPostRequest
): Promise<TextPostResult> {
  const mode = resolvePublishMode();

  if (mode === "mock") {
    return {
      success: true,
      postId: `mock_dry_run_${Date.now()}`,
      mode: "mock",
    };
  }

  const url = `https://graph.facebook.com/v22.0/${pageId}/feed`;

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "VFOS/0.1.0",
      },
      body: JSON.stringify({
        message: request.message,
        access_token: pageAccessToken,
      }),
    });

    const body = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      const fbError = (body["error"] ?? {}) as Record<string, unknown>;
      const errorMessage = String(fbError["message"] ?? "Unknown error");
      const errorCode = Number(fbError["code"] ?? 0);
      const errorType = String(fbError["type"] ?? "UnknownError");

      return {
        success: false,
        error: `[${errorType}] ${errorMessage} (code: ${errorCode})`,
        diagnosis: diagnosePostError(errorCode, response.status),
        mode: "live",
      };
    }

    const postId = body["id"];
    if (typeof postId === "string") {
      return { success: true, postId, mode: "live" };
    }

    return {
      success: false,
      error: "Response OK nhưng không có post ID trong body",
      diagnosis: "Unexpected API response format. Kiểm tra lại quyền publish.",
      mode: "live",
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      success: false,
      error: `Network error: ${message}`,
      diagnosis:
        "LỖI MẠNG — Không thể kết nối đến Meta API.\n" +
        "  → Kiểm tra kết nối internet\n" +
        "  → Kiểm tra firewall/proxy có chặn graph.facebook.com không",
      mode: "live",
    };
  }
}

function diagnosePostError(code: number, httpStatus: number): string {
  if (code === 190) {
    return (
      "TOKEN KHÔNG HỢP LỆ hoặc HẾT HẠN.\n" +
      "  → Tạo token mới tại: https://developers.facebook.com/tools/explorer/\n" +
      "  → Cập nhật FACEBOOK_PAGE_ACCESS_TOKEN trong .env"
    );
  }
  if (code === 200 || code === 10) {
    return (
      "THIẾU QUYỀN — Token cần thêm permission để đăng bài.\n" +
      "  → Vào https://developers.facebook.com/tools/explorer/\n" +
      "  → Thêm permission: pages_manage_posts, pages_read_engagement\n" +
      "  → Tạo lại token và cập nhật .env"
    );
  }
  if (code === 368) {
    return (
      "BỊ CHẶN — Page hoặc app bị hạn chế đăng bài.\n" +
      "  → Kiểm tra tình trạng Page trong Facebook Page Settings\n" +
      "  → Kiểm tra App Review status trong developers.facebook.com"
    );
  }
  if (code === 4 || code === 32 || httpStatus === 429) {
    return (
      "RATE LIMIT — Đã gửi quá nhiều request.\n" +
      "  → Chờ vài phút rồi thử lại"
    );
  }
  return (
    `Lỗi không xác định (HTTP ${httpStatus}, code ${code}).\n` +
    "  → Tham khảo: https://developers.facebook.com/docs/graph-api/guides/error-handling/"
  );
}
