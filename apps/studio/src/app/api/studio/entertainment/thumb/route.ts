/* =============================================================================
 * VFOS Studio — Entertainment thumbnail PROXY (E-UI-intake round)
 * -----------------------------------------------------------------------------
 * WHY: cover Douyin (*.douyinpic.com) chặn hotlink + signed-URL hết hạn → <img>
 * nạp trực tiếp cross-origin từ browser bị 403/expired, để lại ô trống. Route này
 * fetch server-side kèm referer douyin.com rồi stream bytes cùng-origin. Ảnh hết
 * hạn/lỗi → 502 để UI rơi về placeholder (không phá layout).
 *
 * SSRF guard: chỉ cho host thuộc CDN Douyin/TikTok (whitelist suffix) + https.
 * Local-only. KHÔNG cache credential. KHÔNG proxy URL tuỳ ý.
 * ========================================================================== */

export const dynamic = 'force-dynamic';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0']);

function isLocalRequest(req: Request): boolean {
  const host = (req.headers.get('host') ?? '').toLowerCase().split(':')[0];
  return LOCAL_HOSTS.has(host ?? '');
}

// Chỉ CDN ảnh của Douyin/TikTok (ByteDance). Chặn mọi host khác chống SSRF.
const ALLOWED_HOST_SUFFIXES = [
  '.douyinpic.com',
  '.pstatp.com',
  '.bytecdn.com',
  '.byteimg.com',
  '.ibyteimg.com',
  '.tiktokcdn.com',
  '.tiktokcdn-us.com',
  '.ttwstatic.com',
];

function isAllowedThumbUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  return ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s)) ? u : null;
}

export async function GET(req: Request) {
  if (!isLocalRequest(req)) {
    return Response.json({ ok: false, code: 'NOT_LOCAL' }, { status: 403 });
  }
  const raw = new URL(req.url).searchParams.get('u') ?? '';
  const target = isAllowedThumbUrl(raw);
  if (!target) {
    return Response.json({ ok: false, code: 'BAD_THUMB_URL' }, { status: 400 });
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        referer: 'https://www.douyin.com/',
        'user-agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
      },
      // Whitelist chỉ validate URL gốc. Redirect từ host CDN sang địa chỉ nội bộ
      // (169.254.169.254 / 127.0.0.1) sẽ vượt guard → chặn mọi redirect (SSRF).
      // Redirect hợp lệ hiếm với cover tĩnh; nếu có → 502 → UI rơi về placeholder.
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
    const ctype = upstream.headers.get('content-type') ?? '';
    if (!upstream.ok || !ctype.startsWith('image/')) {
      return Response.json({ ok: false, code: 'UPSTREAM_FAIL' }, { status: 502 });
    }
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        'content-type': ctype,
        // Cache ngắn phía browser: cover đổi ít trong 1 phiên, giảm request lặp.
        'cache-control': 'private, max-age=300',
      },
    });
  } catch {
    return Response.json({ ok: false, code: 'PROXY_ERROR' }, { status: 502 });
  }
}
