/* =============================================================================
 * VFOS — TikTok OAuth helper (Phase 3, Content Posting) — DEV TOOL, server-side
 * -----------------------------------------------------------------------------
 * Lấy user access token có scope video.publish cho lane Giải trí đăng TikTok.
 * Operator TỰ đăng nhập + consent (No-Go #4: KHÔNG bypass login); helper chỉ:
 *   url      → dựng authorization URL (Login Kit) để Operator mở trình duyệt
 *   exchange → đổi ?code= (sau khi consent) → access_token/open_id/refresh_token
 *   refresh  → dùng refresh_token lấy access_token mới
 * Token được GHI THẲNG vào .env (gitignored), KHÔNG in ra log (chỉ in redacted).
 *
 * Yêu cầu .env có trước: TIKTOK_CLIENT_KEY, TIKTOK_CLIENT_SECRET, TIKTOK_REDIRECT_URI
 * (redirect phải khớp URI đã đăng ký trong app TikTok).
 *
 * Dùng:
 *   pnpm tiktok:oauth url
 *   pnpm tiktok:oauth exchange --code <code-từ-redirect>
 *   pnpm tiktok:oauth refresh
 * ========================================================================== */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const DEFAULT_SCOPE = 'video.publish';

/* ── Pure helpers (test được, không IO/mạng) ─────────────────────────────── */

/** Dựng authorization URL Login Kit v2. */
export function buildAuthUrl(opts: {
  clientKey: string;
  redirectUri: string;
  scope?: string;
  state?: string;
}): string {
  const u = new URL(AUTH_URL);
  u.searchParams.set('client_key', opts.clientKey);
  u.searchParams.set('scope', opts.scope ?? DEFAULT_SCOPE);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('redirect_uri', opts.redirectUri);
  u.searchParams.set('state', opts.state ?? 'vfos');
  return u.toString();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Upsert nhiều KEY=VALUE vào nội dung .env: thay dòng có sẵn (kể cả bị comment),
 * không có thì append. PURE — trả nội dung mới, không đụng fs.
 */
export function upsertEnvContent(content: string, kv: Record<string, string>): string {
  let out = content;
  for (const [k, v] of Object.entries(kv)) {
    const re = new RegExp(`^[ \\t]*#?[ \\t]*${escapeRegExp(k)}=.*$`, 'm');
    const line = `${k}=${v}`;
    out = re.test(out) ? out.replace(re, line) : `${out.replace(/[\r\n]*$/, '')}\n${line}\n`;
  }
  return out;
}

/** Che giá trị nhạy cảm khi in log — chỉ lộ độ dài. */
export function redact(value: string | undefined): string {
  return value ? `<len=${value.length}>` : '<absent>';
}

/* ── IO / network (không test live) ──────────────────────────────────────── */

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  open_id?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
}

function loadDotenv(envPath: string): void {
  if (!existsSync(envPath)) return;
  try {
    // Node 24: nạp .env vào process.env (không in giá trị).
    (process as unknown as { loadEnvFile: (p: string) => void }).loadEnvFile(envPath);
  } catch {
    /* .env lỗi định dạng — bỏ qua, các getter sẽ báo thiếu biến */
  }
}

function writeTokensToEnv(envPath: string, kv: Record<string, string>): void {
  const cur = existsSync(envPath) ? readFileSync(envPath, 'utf8') : '';
  writeFileSync(envPath, upsertEnvContent(cur, kv));
}

async function postForm(url: string, form: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

function requireEnv(name: string): string {
  const v = (process.env[name] ?? '').trim();
  if (!v) {
    console.error(`🛑 Thiếu ${name} trong .env (điền trước khi chạy).`);
    process.exit(2);
  }
  return v;
}

async function main(): Promise<void> {
  const sub = process.argv[2];
  const { values } = parseArgs({
    args: process.argv.slice(3),
    options: {
      code: { type: 'string' },
      scope: { type: 'string' },
      env: { type: 'string' },
    },
    strict: false,
  });
  const envPath = resolve(process.cwd(), (values.env as string) || '.env');
  loadDotenv(envPath);

  if (sub === 'url') {
    const url = buildAuthUrl({
      clientKey: requireEnv('TIKTOK_CLIENT_KEY'),
      redirectUri: requireEnv('TIKTOK_REDIRECT_URI'),
      scope: (values.scope as string) || DEFAULT_SCOPE,
      state: `vfos_${Date.now()}`,
    });
    console.log('\n1) Mở URL này, ĐĂNG NHẬP + đồng ý quyền video.publish:');
    console.log(`\n${url}\n`);
    console.log('2) Sau khi consent, trình duyệt redirect về redirect_uri kèm ?code=...');
    console.log('3) Chạy: pnpm tiktok:oauth exchange --code <code-đó>\n');
    return;
  }

  if (sub === 'exchange') {
    const code = (values.code as string) || '';
    if (!code) {
      console.error('🛑 Thiếu --code <code-từ-redirect>.');
      process.exit(2);
    }
    const tok = await postForm(TOKEN_URL, {
      client_key: requireEnv('TIKTOK_CLIENT_KEY'),
      client_secret: requireEnv('TIKTOK_CLIENT_SECRET'),
      code,
      grant_type: 'authorization_code',
      redirect_uri: requireEnv('TIKTOK_REDIRECT_URI'),
    });
    if (!tok.access_token || !tok.open_id) {
      console.error(`🛑 Đổi token thất bại: ${tok.error ?? '?'} — ${tok.error_description ?? ''}`);
      process.exit(1);
    }
    if (!(tok.scope ?? '').includes('video.publish')) {
      console.error(
        `🛑 Token KHÔNG có scope video.publish (scope nhận: ${tok.scope ?? '?'}). Không đăng được — kiểm tra app/audit/sandbox.`,
      );
      // vẫn ghi để debug nhưng KHÔNG bật live
    }
    const hasPublish = (tok.scope ?? '').includes('video.publish');
    writeTokensToEnv(envPath, {
      TIKTOK_MODE: 'display',
      TIKTOK_ACCESS_TOKEN: tok.access_token,
      TIKTOK_OPEN_ID: tok.open_id,
      TIKTOK_REFRESH_TOKEN: tok.refresh_token ?? '',
      ...(hasPublish ? { TIKTOK_PUBLISH_LIVE: 'true' } : {}),
    });
    console.log('✅ Đã ghi token vào .env (KHÔNG in giá trị):');
    console.log(`   TIKTOK_ACCESS_TOKEN  ${redact(tok.access_token)}`);
    console.log(`   TIKTOK_OPEN_ID       ${redact(tok.open_id)}`);
    console.log(`   TIKTOK_REFRESH_TOKEN ${redact(tok.refresh_token)}`);
    console.log(`   scope                ${tok.scope ?? '?'}`);
    console.log(`   expires_in           ${tok.expires_in ?? '?'}s`);
    console.log(
      `   TIKTOK_MODE=display  TIKTOK_PUBLISH_LIVE=${hasPublish ? 'true' : '(CHƯA bật — thiếu scope)'}`,
    );
    return;
  }

  if (sub === 'refresh') {
    const tok = await postForm(TOKEN_URL, {
      client_key: requireEnv('TIKTOK_CLIENT_KEY'),
      client_secret: requireEnv('TIKTOK_CLIENT_SECRET'),
      grant_type: 'refresh_token',
      refresh_token: requireEnv('TIKTOK_REFRESH_TOKEN'),
    });
    if (!tok.access_token) {
      console.error(`🛑 Refresh thất bại: ${tok.error ?? '?'} — ${tok.error_description ?? ''}`);
      process.exit(1);
    }
    writeTokensToEnv(envPath, {
      TIKTOK_ACCESS_TOKEN: tok.access_token,
      ...(tok.refresh_token ? { TIKTOK_REFRESH_TOKEN: tok.refresh_token } : {}),
    });
    console.log('✅ Đã refresh + ghi .env:');
    console.log(
      `   TIKTOK_ACCESS_TOKEN ${redact(tok.access_token)} | expires_in ${tok.expires_in ?? '?'}s`,
    );
    return;
  }

  console.error(
    'Dùng: pnpm tiktok:oauth <url|exchange --code <code>|refresh> [--scope ...] [--env <path>]',
  );
  process.exit(2);
}

// Chỉ chạy main khi gọi trực tiếp (không chạy khi bị test import).
const invokedDirect = !!process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (invokedDirect) {
  main().catch((e) => {
    console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
