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

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
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

/* ── Multi-account token store (Phần 79 — cầu token-ops cho account-store) ──
 * Lane Review đăng TikTok đọc token theo accountId từ
 * data/secure/tiktok_accounts.json (apps/studio/src/lib/tiktok/account-store).
 * `exchange/refresh --account <id>` ghi vào store này thay vì .env — token
 * account mới KHÔNG đè token legacy (.env = tt_fishing_main của lane ENT). */

export interface StoreAccountEntry {
  openId: string;
  accessToken: string;
  refreshToken?: string;
  /** ISO — account-store dùng để chặn token hết hạn trước khi đăng. */
  expiresAt?: string;
  username?: string;
}

/** Upsert 1 account vào nội dung store JSON. PURE — content sai định dạng → coi như rỗng. */
export function upsertAccountStoreContent(
  content: string,
  accountId: string,
  entry: StoreAccountEntry,
): string {
  let store: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      store = parsed as Record<string, unknown>;
    }
  } catch {
    /* store mới / hỏng → bắt đầu rỗng */
  }
  store[accountId] = {
    openId: entry.openId,
    accessToken: entry.accessToken,
    ...(entry.refreshToken ? { refreshToken: entry.refreshToken } : {}),
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    ...(entry.username ? { username: entry.username } : {}),
  };
  return `${JSON.stringify(store, null, 2)}\n`;
}

/** expiresAt ISO từ expires_in giây (thiếu/âm → undefined, store coi như không hạn). */
export function expiresAtFrom(nowMs: number, expiresInSec: number | undefined): string | undefined {
  if (!expiresInSec || !Number.isFinite(expiresInSec) || expiresInSec <= 0) return undefined;
  return new Date(nowMs + expiresInSec * 1000).toISOString();
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

const ACCOUNT_STORE_REL = 'data/secure/tiktok_accounts.json';

function writeTokensToStore(
  accountId: string,
  entry: StoreAccountEntry,
  baseDir: string = process.cwd(),
): string {
  const storePath = resolve(baseDir, ACCOUNT_STORE_REL);
  const cur = existsSync(storePath) ? readFileSync(storePath, 'utf8') : '';
  mkdirSync(dirname(storePath), { recursive: true });
  // Ghi ATOMIC (tmp→rename): tick auto-refresh ghi file token đa-account không người
  // canh; crash giữa lúc ghi thẳng sẽ cụt JSON → mất token MỌI account. rename nguyên tử.
  const tmp = `${storePath}.tmp`;
  writeFileSync(tmp, upsertAccountStoreContent(cur, accountId, entry));
  renameSync(tmp, storePath);
  return ACCOUNT_STORE_REL;
}

/** Đọc entry account từ store (cho refresh --account). null nếu chưa có. */
function readStoreEntry(
  accountId: string,
  baseDir: string = process.cwd(),
): StoreAccountEntry | null {
  const storePath = resolve(baseDir, ACCOUNT_STORE_REL);
  if (!existsSync(storePath)) return null;
  try {
    const store = JSON.parse(readFileSync(storePath, 'utf8')) as Record<
      string,
      Partial<StoreAccountEntry>
    >;
    const e = store[accountId];
    if (!e || typeof e.accessToken !== 'string') return null;
    return {
      openId: String(e.openId ?? ''),
      accessToken: e.accessToken,
      ...(e.refreshToken ? { refreshToken: String(e.refreshToken) } : {}),
      ...(e.expiresAt ? { expiresAt: String(e.expiresAt) } : {}),
      ...(e.username ? { username: String(e.username) } : {}),
    };
  } catch {
    return null;
  }
}

async function postForm(url: string, form: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  return (await res.json().catch(() => ({}))) as TokenResponse;
}

export interface RefreshResult {
  ok: boolean;
  accountId: string;
  /** ISO hạn mới (khi API trả expires_in). */
  expiresAt?: string;
  openId?: string;
  /** Mã lỗi ngắn: NO_REFRESH_TOKEN | REFRESH_REJECTED | <error TikTok>. */
  error?: string;
}

/**
 * Refresh access token 1 account từ refresh_token trong store — ROTATION-SAFE: ghi đè
 * refresh_token MỚI TikTok trả (giữ cũ nếu không trả) để chuỗi tự động không chết. Dùng
 * lại bởi CLI `refresh --account` LẪN máy tick (auto-refresh trong lock). KHÔNG log token.
 * baseDir = repo root (default cwd) để tick gọi được từ cwd bất kỳ. Fail-closed: thiếu/
 * chết refresh_token → ok:false (KHÔNG throw); lỗi MẠNG thì để caller bắt.
 */
export async function refreshAccountToken(
  accountId: string,
  creds: { clientKey: string; clientSecret: string },
  baseDir: string = process.cwd(),
): Promise<RefreshResult> {
  const entry = readStoreEntry(accountId, baseDir);
  if (!entry?.refreshToken) return { ok: false, accountId, error: 'NO_REFRESH_TOKEN' };
  const tok = await postForm(TOKEN_URL, {
    client_key: creds.clientKey,
    client_secret: creds.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: entry.refreshToken,
  });
  if (!tok.access_token) return { ok: false, accountId, error: tok.error || 'REFRESH_REJECTED' };
  const expiresAt = expiresAtFrom(Date.now(), tok.expires_in);
  writeTokensToStore(
    accountId,
    {
      openId: tok.open_id || entry.openId,
      accessToken: tok.access_token,
      ...(tok.refresh_token || entry.refreshToken
        ? { refreshToken: tok.refresh_token || entry.refreshToken }
        : {}),
      ...(expiresAt ? { expiresAt } : {}),
      ...(entry.username ? { username: entry.username } : {}),
    },
    baseDir,
  );
  return {
    ok: true,
    accountId,
    openId: tok.open_id || entry.openId,
    ...(expiresAt ? { expiresAt } : {}),
  };
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
      // Phần 79: ghi token vào account-store theo accountId (vd tt_review_main)
      // thay vì .env — token account mới KHÔNG đè token legacy lane ENT.
      account: { type: 'string' },
    },
    strict: false,
  });
  const accountId = typeof values.account === 'string' ? values.account.trim() : '';
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
    if (accountId) {
      // Phần 79 — ghi vào account-store, KHÔNG đụng token legacy trong .env.
      const rel = writeTokensToStore(accountId, {
        openId: tok.open_id,
        accessToken: tok.access_token,
        ...(tok.refresh_token ? { refreshToken: tok.refresh_token } : {}),
        ...(expiresAtFrom(Date.now(), tok.expires_in)
          ? { expiresAt: expiresAtFrom(Date.now(), tok.expires_in) as string }
          : {}),
      });
      console.log(`✅ Đã ghi token account "${accountId}" vào ${rel} (KHÔNG in giá trị):`);
      console.log(`   accessToken  ${redact(tok.access_token)}`);
      console.log(`   openId       ${redact(tok.open_id)}`);
      console.log(`   refreshToken ${redact(tok.refresh_token)}`);
      console.log(`   scope        ${tok.scope ?? '?'} | expires_in ${tok.expires_in ?? '?'}s`);
      if (!hasPublish) console.log('   ⚠ Token THIẾU scope video.publish — sẽ không đăng được.');
      console.log('   (.env legacy KHÔNG bị đụng — token lane ENT giữ nguyên.)');
      return;
    }
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
    // Phần 79 — refresh theo account-store khi có --account (không đụng .env).
    // Phần 82 — dùng lại hàm thuần refreshAccountToken (chung đường với máy tick).
    if (accountId) {
      const res = await refreshAccountToken(accountId, {
        clientKey: requireEnv('TIKTOK_CLIENT_KEY'),
        clientSecret: requireEnv('TIKTOK_CLIENT_SECRET'),
      });
      if (!res.ok) {
        if (res.error === 'NO_REFRESH_TOKEN') {
          console.error(
            `🛑 Account "${accountId}" chưa có refreshToken trong ${ACCOUNT_STORE_REL} — chạy exchange --account trước.`,
          );
          process.exit(2);
        }
        console.error(`🛑 Refresh thất bại: ${res.error ?? '?'}`);
        process.exit(1);
      }
      console.log(`✅ Đã refresh account "${accountId}" + ghi ${ACCOUNT_STORE_REL}:`);
      console.log(`   expiresAt ${res.expiresAt ?? '?'}`);
      return;
    }
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
    'Dùng: pnpm tiktok:oauth <url|exchange --code <code> [--account <id>]|refresh [--account <id>]> [--scope ...] [--env <path>]',
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
