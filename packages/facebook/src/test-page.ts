/**
 * Test Facebook Page connection via Meta Graph API.
 *
 * Calls GET /{page_id}?fields=id,name to verify:
 * 1. Token is valid (not expired)
 * 2. Token has page read permissions
 * 3. Page ID is correct
 */

import type { MetaClient, MetaApiError } from "./meta-client.js";

export interface PageInfo {
  id: string;
  name: string;
}

export interface PageConnectionResult {
  success: boolean;
  page?: PageInfo;
  error?: string;
  diagnosis?: string;
}

/**
 * Test the connection to a Facebook Page.
 * Returns a structured result with diagnosis on failure.
 */
export async function testPageConnection(client: MetaClient): Promise<PageConnectionResult> {
  const result = await client.get<PageInfo>(
    `/${client.pageId}`,
    { fields: "id,name" }
  );

  if (result.ok && result.data) {
    return {
      success: true,
      page: result.data,
    };
  }

  // Diagnose the error
  const error = result.error;
  if (!error) {
    return {
      success: false,
      error: `HTTP ${result.status}: Unknown error (no error body)`,
      diagnosis: "Unexpected response from Meta API. Check network connectivity.",
    };
  }

  return {
    success: false,
    error: `[${error.type}] ${error.message} (code: ${error.code})`,
    diagnosis: diagnoseError(error, result.status),
  };
}

/**
 * Provide actionable diagnosis for common Meta API errors.
 */
function diagnoseError(error: MetaApiError, httpStatus: number): string {
  // Token expired
  if (error.code === 190) {
    if (error.error_subcode === 463) {
      return (
        "TOKEN HẾT HẠN — Access token đã hết hạn.\n" +
        "  → Tạo token mới tại: https://developers.facebook.com/tools/explorer/\n" +
        "  → Cập nhật FACEBOOK_PAGE_ACCESS_TOKEN trong file .env"
      );
    }
    if (error.error_subcode === 467) {
      return (
        "TOKEN KHÔNG HỢP LỆ — Token đã bị vô hiệu hoá (revoked/invalidated).\n" +
        "  → Tạo token mới tại: https://developers.facebook.com/tools/explorer/\n" +
        "  → Cập nhật FACEBOOK_PAGE_ACCESS_TOKEN trong file .env"
      );
    }
    return (
      "TOKEN KHÔNG HỢP LỆ — Access token bị lỗi xác thực.\n" +
      "  → Kiểm tra token đã copy đầy đủ (không thiếu ký tự)\n" +
      "  → Tạo token mới tại: https://developers.facebook.com/tools/explorer/\n" +
      "  → Cập nhật FACEBOOK_PAGE_ACCESS_TOKEN trong file .env"
    );
  }

  // Permission errors
  if (error.code === 200 || error.code === 10) {
    return (
      "THIẾU QUYỀN — Token không có đủ quyền đọc Page.\n" +
      "  → Vào https://developers.facebook.com/tools/explorer/\n" +
      "  → Thêm permission: pages_show_list, pages_read_engagement\n" +
      "  → Tạo lại token và cập nhật .env"
    );
  }

  // Page not found
  if (error.code === 803 || httpStatus === 404) {
    return (
      "PAGE KHÔNG TÌM THẤY — Page ID không tồn tại hoặc token không có quyền truy cập.\n" +
      "  → Kiểm tra FACEBOOK_PAGE_ID trong .env có đúng không\n" +
      "  → Đảm bảo token có quyền truy cập Page này"
    );
  }

  // Rate limit
  if (error.code === 4 || error.code === 32 || httpStatus === 429) {
    return (
      "RATE LIMIT — Đã gửi quá nhiều request.\n" +
      "  → Chờ vài phút rồi thử lại"
    );
  }

  // Network error
  if (httpStatus === 0) {
    return (
      "LỖI MẠNG — Không thể kết nối đến Meta API.\n" +
      "  → Kiểm tra kết nối internet\n" +
      "  → Kiểm tra firewall/proxy có chặn graph.facebook.com không"
    );
  }

  // Generic fallback
  return (
    `Lỗi không xác định (HTTP ${httpStatus}, code ${error.code}).\n` +
    "  → Xem chi tiết lỗi ở trên\n" +
    "  → Tham khảo: https://developers.facebook.com/docs/graph-api/guides/error-handling/"
  );
}
