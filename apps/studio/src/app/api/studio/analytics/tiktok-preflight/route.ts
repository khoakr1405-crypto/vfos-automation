/* =============================================================================
 * VFOS Studio — TikTok API Preflight & Capability Test (Real API 05A)
 * -----------------------------------------------------------------------------
 * GET local-only. Kiểm tra cấu hình TikTok API trong env.
 * An toàn: Không trả về token/secret nhạy cảm, chỉ trả configured booleans.
 * ========================================================================== */

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

  // 1. Đọc cấu hình từ env (Chỉ kiểm tra sự tồn tại)
  const clientKey = (process.env.TIKTOK_CLIENT_KEY || '').trim();
  const clientSecret = (process.env.TIKTOK_CLIENT_SECRET || '').trim();
  const accessToken = (process.env.TIKTOK_ACCESS_TOKEN || '').trim();
  const openId = (process.env.TIKTOK_OPEN_ID || '').trim();
  const businessAccessToken = (process.env.TIKTOK_BUSINESS_ACCESS_TOKEN || '').trim();

  // Parse TIKTOK_MODE
  const rawMode = (process.env.TIKTOK_MODE || '').trim().toLowerCase();
  let mode: 'disabled' | 'mock' | 'display' | 'business' = 'disabled';
  if (rawMode === 'mock') mode = 'mock';
  if (rawMode === 'display') mode = 'display';
  if (rawMode === 'business') mode = 'business';

  const clientKeyConfigured = !!clientKey;
  const clientSecretConfigured = !!clientSecret;
  const accessConfigured = !!accessToken;
  const openIdConfigured = !!openId;
  const businessAccessConfigured = !!businessAccessToken;

  let capabilityStatus: 'not_run' | 'configured' | 'missing_config' | 'blocked' = 'not_run';
  const blockedReasons: string[] = [];

  // 2. Logic kiểm tra trạng thái capability
  if (mode === 'disabled') {
    capabilityStatus = 'blocked';
    blockedReasons.push('Chức năng TikTok API bị vô hiệu hóa (Chế độ vận hành = disabled).');
  } else if (mode === 'mock') {
    // Chế độ giả lập (Mock mode)
    if (!clientKeyConfigured || !clientSecretConfigured) {
      capabilityStatus = 'missing_config';
      if (!clientKeyConfigured) {
        blockedReasons.push('Thiếu Mã định danh App (App Key) trong cấu hình môi trường.');
      }
      if (!clientSecretConfigured) {
        blockedReasons.push(
          'Thiếu Giá trị riêng tư App (App Private Key) trong cấu hình môi trường.',
        );
      }
    } else {
      capabilityStatus = 'configured';
      blockedReasons.push('Hệ thống chạy ở chế độ giả lập (Mock). Cấu hình cơ bản hợp lệ.');
    }
  } else {
    // Mode display hoặc business (Chạy thật hoặc capability check thực tế)
    if (!clientKeyConfigured || !clientSecretConfigured) {
      capabilityStatus = 'missing_config';
      if (!clientKeyConfigured) {
        blockedReasons.push('Thiếu Mã định danh App (App Key) trong cấu hình môi trường.');
      }
      if (!clientSecretConfigured) {
        blockedReasons.push(
          'Thiếu Giá trị riêng tư App (App Private Key) trong cấu hình môi trường.',
        );
      }
    } else {
      // Trong round 05A chưa bắt buộc gọi API live, chỉ kiểm tra cấu hình bổ sung
      const hasAccess =
        mode === 'display' ? accessConfigured && openIdConfigured : businessAccessConfigured;
      if (!hasAccess) {
        capabilityStatus = 'blocked';
        if (mode === 'display') {
          blockedReasons.push(
            'Thiếu Giá trị xác thực truy cập hoặc Mã người dùng mở cho Display API.',
          );
        } else {
          blockedReasons.push('Thiếu Giá trị xác thực doanh nghiệp cho Business API.');
        }
      } else {
        capabilityStatus = 'configured';
      }
    }
  }

  return Response.json({
    mode,
    clientKeyConfigured,
    clientSecretConfigured,
    accessConfigured,
    openIdConfigured,
    businessAccessConfigured,
    capabilityStatus,
    blockedReasons,
    checkedAt: new Date().toISOString(),
  });
}
