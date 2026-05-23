/**
 * Publish a text-only post to a Facebook Page via Meta Graph API.
 *
 * Endpoint: POST /{page_id}/feed
 * Docs: https://developers.facebook.com/docs/pages-api/posts
 *
 * Security: tokens are NEVER logged.
 */

export interface TextPostRequest {
  /** The text content of the post */
  message: string;
}

export interface TextPostResult {
  success: boolean;
  /** The ID of the created post (format: "pageId_postId") */
  postId?: string;
  error?: string;
  diagnosis?: string;
}

/**
 * Publish a text-only post to the configured Facebook Page.
 * Uses the page access token from the client config.
 */
export async function publishTextPost(
  pageId: string,
  pageAccessToken: string,
  request: TextPostRequest
): Promise<TextPostResult> {
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
      };
    }

    const postId = body["id"];
    if (typeof postId === "string") {
      return { success: true, postId };
    }

    return {
      success: false,
      error: "Response OK nhưng không có post ID trong body",
      diagnosis: "Unexpected API response format. Kiểm tra lại quyền publish.",
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
