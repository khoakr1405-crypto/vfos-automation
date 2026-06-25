/* =============================================================================
 * VFOS Studio — TikTok multi-account token store (multi-channel R1) — SERVER ONLY
 * -----------------------------------------------------------------------------
 * Resolve token TikTok THEO accountId (1 kênh = 1 account). Token đọc từ
 *   data/secure/tiktok_accounts.json  (gitignored, KHÔNG commit, KHÔNG log)
 * keyed theo accountId: { openId, accessToken, refreshToken?, expiresAt?, username? }.
 *
 * Backward-compat: account legacy `tt_fishing_main` (account đầu, đang ở .env)
 * đọc từ process.env nếu store chưa có entry → không phải dời token ngay ở R1.
 *
 * AN TOÀN: getAccountTokens() chỉ dùng NỘI BỘ để build client; KHÔNG bao giờ
 * trả token ra route/UI/log. UI chỉ dùng getAccountHealth() (boolean + thời điểm).
 * ========================================================================== */

import { existsSync, readFileSync } from 'node:fs';
import { resolveInsideRepo } from '@/lib/studio-data/paths';

const STORE_REL = 'data/secure/tiktok_accounts.json';

/** Account legacy đọc từ .env (account #1) → tên biến env tương ứng. */
const ENV_BACKED: Record<string, { token: string; openId: string; refresh: string }> = {
  tt_fishing_main: {
    token: 'TIKTOK_ACCESS_TOKEN',
    openId: 'TIKTOK_OPEN_ID',
    refresh: 'TIKTOK_REFRESH_TOKEN',
  },
};

export interface AccountTokens {
  openId: string;
  accessToken: string;
  refreshToken?: string;
  /** ISO; nếu có và đã quá hạn → coi token hết hạn. */
  expiresAt?: string;
  username?: string;
}

/** Trạng thái token cho UI — KHÔNG chứa token. */
export interface AccountHealth {
  accountId: string;
  configured: boolean;
  expired: boolean;
  expiresAt?: string;
}

function readStore(): Record<string, AccountTokens> {
  const p = resolveInsideRepo(STORE_REL);
  if (!p || !existsSync(p)) return {};
  try {
    const raw = JSON.parse(readFileSync(p, 'utf8')) as Record<string, Partial<AccountTokens>>;
    const out: Record<string, AccountTokens> = {};
    for (const [id, v] of Object.entries(raw)) {
      if (v && typeof v.accessToken === 'string' && v.accessToken.trim()) {
        out[id] = {
          openId: String(v.openId ?? '').trim(),
          accessToken: v.accessToken.trim(),
          refreshToken: v.refreshToken ? String(v.refreshToken).trim() : undefined,
          expiresAt: v.expiresAt ? String(v.expiresAt) : undefined,
          username: v.username ? String(v.username).trim() : undefined,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

/** NỘI BỘ — resolve token cho 1 account (store trước, .env legacy sau). */
export function getAccountTokens(accountId: string): AccountTokens | null {
  if (!accountId) return null;
  const store = readStore();
  if (store[accountId]?.accessToken) return store[accountId] ?? null;

  const env = ENV_BACKED[accountId];
  if (env) {
    const accessToken = (process.env[env.token] ?? '').trim();
    const openId = (process.env[env.openId] ?? '').trim();
    if (accessToken && openId) {
      const refreshToken = (process.env[env.refresh] ?? '').trim();
      return { openId, accessToken, refreshToken: refreshToken || undefined };
    }
  }
  return null;
}

/** Token đã hết hạn theo expiresAt (nếu có). Không có expiresAt → coi chưa hết. */
export function isAccountTokenExpired(accountId: string): boolean {
  const t = getAccountTokens(accountId);
  if (!t?.expiresAt) return false;
  const at = Date.parse(t.expiresAt);
  return Number.isFinite(at) && at < Date.now();
}

/** Trạng thái cho UI — KHÔNG token. */
export function getAccountHealth(accountId: string): AccountHealth {
  const t = getAccountTokens(accountId);
  if (!t) return { accountId, configured: false, expired: false };
  return { accountId, configured: true, expired: isAccountTokenExpired(accountId), expiresAt: t.expiresAt };
}

export function accountConfigured(accountId: string): boolean {
  return getAccountTokens(accountId) !== null;
}
