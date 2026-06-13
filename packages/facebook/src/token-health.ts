/**
 * @vfos/facebook — Page Access Token expiry health (PURE, no fs / no network).
 *
 * Mục đích (P4 Publish Safety): biết token Facebook Page còn hạn bao lâu để
 * publish preflight có thể (a) CHẶN live publish nếu token đã hết hạn, (b) CẢNH
 * BÁO nếu sắp hết hạn — TRƯỚC khi đụng upload. Hạn được CHỤP tại thời điểm
 * `facebook:get-page-token` verify token (debug_token trả `expires_at`), ghi ra
 * file runtime gitignored. Preflight chỉ ĐỌC FILE — KHÔNG gọi thêm Graph API.
 *
 * Truth rules:
 * - File meta CHỈ chứa expiry (unix sec) + pageId công khai + thời điểm verify.
 *   TUYỆT ĐỐI KHÔNG chứa giá trị token/secret.
 * - `expiresAt === 0` theo quy ước Graph = "không hết hạn" (Page token lấy từ
 *   long-lived user token) → trạng thái `never`, không cảnh báo.
 * - Module này PURE: nhận số, trả phân loại. Đọc/ghi file do script ngoài lo.
 */

/** Số ngày còn lại dưới mức này thì cảnh báo (không chặn). */
export const DEFAULT_TOKEN_WARN_DAYS = 7;

const MS_PER_DAY = 86_400_000;

/** Metadata sức khoẻ token — ghi runtime gitignored, KHÔNG chứa token. */
export interface TokenExpiryMeta {
  /** Public Page id (không phải secret). */
  pageId: string;
  /** Unix seconds. 0 = không hết hạn. <0 / thiếu = không rõ. */
  expiresAt: number;
  /** ISO của expiresAt (null nếu 0/không rõ). Tiện đọc cho người. */
  expiresAtIso: string | null;
  /** Thời điểm verify + ghi meta (ISO). */
  verifiedAt: string;
  /** Nguồn ghi (vd "get-page-token"). */
  source: string;
}

export type TokenExpiryStatus = 'expired' | 'expiring_soon' | 'healthy' | 'never' | 'unknown';

export interface TokenExpiryClassification {
  status: TokenExpiryStatus;
  /** Số ngày còn lại (làm tròn). null khi never/unknown. */
  daysLeft: number | null;
  expiresAtIso: string | null;
  /** Có nên chặn live publish không (chỉ true khi đã hết hạn). */
  block: boolean;
  /** Câu mô tả ngắn cho log/preflight. */
  message: string;
}

/**
 * Phân loại hạn token từ `expiresAt` (unix seconds).
 * PURE: không đọc file, không gọi mạng. `nowMs` truyền vào để test xác định.
 */
export function classifyTokenExpiry(
  expiresAt: number | null | undefined,
  nowMs: number,
  warnDays: number = DEFAULT_TOKEN_WARN_DAYS,
): TokenExpiryClassification {
  if (expiresAt === 0) {
    return {
      status: 'never',
      daysLeft: null,
      expiresAtIso: null,
      block: false,
      message: 'Token không hết hạn (long-lived Page token).',
    };
  }
  if (expiresAt == null || !Number.isFinite(expiresAt) || expiresAt < 0) {
    return {
      status: 'unknown',
      daysLeft: null,
      expiresAtIso: null,
      block: false,
      message: 'Chưa rõ hạn token — chạy `pnpm facebook:get-page-token` để verify + ghi lại hạn.',
    };
  }
  const expiresAtIso = new Date(expiresAt * 1000).toISOString();
  const msLeft = expiresAt * 1000 - nowMs;
  const daysLeft = Math.round(msLeft / MS_PER_DAY);
  if (msLeft <= 0) {
    return {
      status: 'expired',
      daysLeft,
      expiresAtIso,
      block: true,
      message: `Token ĐÃ HẾT HẠN (${expiresAtIso}). Chạy \`pnpm facebook:get-page-token\` để lấy token mới trước khi publish.`,
    };
  }
  if (msLeft < warnDays * MS_PER_DAY) {
    return {
      status: 'expiring_soon',
      daysLeft,
      expiresAtIso,
      block: false,
      message: `Token sắp hết hạn (~${daysLeft} ngày, ${expiresAtIso}). Cân nhắc refresh bằng \`pnpm facebook:get-page-token\`.`,
    };
  }
  return {
    status: 'healthy',
    daysLeft,
    expiresAtIso,
    block: false,
    message: `Token còn hạn ~${daysLeft} ngày (${expiresAtIso}).`,
  };
}

/** Dựng object meta để ghi file (PURE — caller lo ghi đĩa). KHÔNG nhận token. */
export function buildTokenExpiryMeta(
  pageId: string,
  expiresAt: number,
  verifiedAtIso: string,
  source: string,
): TokenExpiryMeta {
  return {
    pageId,
    expiresAt,
    expiresAtIso: expiresAt > 0 ? new Date(expiresAt * 1000).toISOString() : null,
    verifiedAt: verifiedAtIso,
    source,
  };
}

/** Parse + validate shape của meta đọc từ file. null nếu sai shape (never-throw caller). */
export function parseTokenExpiryMeta(raw: unknown): TokenExpiryMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.pageId !== 'string' || typeof o.expiresAt !== 'number') return null;
  return {
    pageId: o.pageId,
    expiresAt: o.expiresAt,
    expiresAtIso: typeof o.expiresAtIso === 'string' ? o.expiresAtIso : null,
    verifiedAt: typeof o.verifiedAt === 'string' ? o.verifiedAt : '',
    source: typeof o.source === 'string' ? o.source : 'unknown',
  };
}
