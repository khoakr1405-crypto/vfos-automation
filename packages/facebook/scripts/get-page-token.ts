#!/usr/bin/env tsx
/**
 * VFOS — Lấy Page Access Token DÀI HẠN từ token trong .env.
 *
 * Flow (Meta chuẩn, cần App ID + App Secret của app riêng):
 *   1. debug_token — xác định loại token hiện tại (USER/PAGE) + hạn.
 *   2. fb_exchange_token — đổi sang token DÀI HẠN (~60 ngày).
 *   3. Nếu là USER token: GET /me/accounts → Page token (loại này theo Meta docs
 *      KHÔNG hết hạn khi lấy từ long-lived user token).
 *   4. debug_token trên Page token MỚI — verify type=PAGE, đúng Page ID, hạn dài
 *      (bằng chứng thật, không suy đoán) TRƯỚC khi ghi .env.
 *   5. Tự cập nhật FACEBOOK_PAGE_ACCESS_TOKEN trong .env.
 *
 * Usage: pnpm facebook:get-page-token
 *   Trước khi chạy, .env cần:
 *     META_APP_ID / META_APP_SECRET  — developers.facebook.com → App → Settings → Basic
 *     FACEBOOK_PAGE_ACCESS_TOKEN     — token tươi từ Graph Explorer (User token,
 *                                      quyền pages_show_list + pages_manage_posts)
 *
 * Security: NEVER logs full tokens/secret. Exchange URL chứa secret — không bao
 * giờ in URL. Chỉ in maskToken + metadata (type/hạn/scopes).
 */

import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { maskToken } from '../src/meta-client.js';

// Workaround libuv race trên Windows khi exit ngay sau fetch (cùng pattern
// job-facebook-publish-command.ts): hoãn exit 200ms cho handle đóng sạch.
// HỆ QUẢ: mọi chỗ gọi process.exit PHẢI `return` ngay sau đó.
const originalExit = process.exit.bind(process);
process.exit = ((code?: number) => {
  setTimeout(() => originalExit(code), 200);
  return undefined as never;
}) as typeof process.exit;

const GRAPH_BASE = 'https://graph.facebook.com/v22.0';
const FALLBACK_PAGE_ID = '1169116176282221'; // "Review Nhà bạn" — dùng khi .env thiếu FACEBOOK_PAGE_ID

// ── Load .env ───────────────────────────────────────────────────────────────

function envPath(): string {
  return resolve(import.meta.dirname ?? '.', '..', '..', '..', '.env');
}

function loadEnvFile(): boolean {
  const path = envPath();
  if (!existsSync(path)) {
    console.error('❌ File .env không tìm thấy.');
    return false;
  }
  const content = readFileSync(path, 'utf-8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    const eqIndex = trimmed.indexOf('=');
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
  return true;
}

// ── Graph helpers (token/secret chỉ nằm trong URL nội bộ — không bao giờ log) ──

interface GraphError {
  message: string;
  type: string;
  code: number;
}

function readGraphError(body: Record<string, unknown>): GraphError {
  const e = (body.error ?? {}) as Record<string, unknown>;
  return {
    message: String(e.message ?? 'Unknown error'),
    type: String(e.type ?? 'UnknownError'),
    code: Number(e.code ?? 0),
  };
}

async function graphGet(pathWithQuery: string): Promise<{
  ok: boolean;
  body: Record<string, unknown>;
  error?: GraphError;
}> {
  const response = await fetch(`${GRAPH_BASE}${pathWithQuery}`, {
    headers: { 'User-Agent': 'VFOS/0.1.0' },
  });
  const body = (await response.json()) as Record<string, unknown>;
  if (!response.ok || body.error) {
    return { ok: false, body, error: readGraphError(body) };
  }
  return { ok: true, body };
}

interface TokenDebugInfo {
  type: string;
  expiresAt: number; // unix seconds; 0 = không hết hạn
  isValid: boolean;
  profileId: string | null;
  scopes: string[];
}

type DebugTokenResult = { ok: true; info: TokenDebugInfo } | { ok: false; error: GraphError };

async function debugToken(inputToken: string, appToken: string): Promise<DebugTokenResult> {
  const res = await graphGet(
    `/debug_token?input_token=${encodeURIComponent(inputToken)}&access_token=${encodeURIComponent(appToken)}`,
  );
  if (!res.ok) return { ok: false, error: res.error as GraphError };
  const data = (res.body.data ?? {}) as Record<string, unknown>;
  return {
    ok: true,
    info: {
      type: String(data.type ?? 'UNKNOWN'),
      expiresAt: Number(data.expires_at ?? -1),
      isValid: data.is_valid === true,
      profileId: data.profile_id != null ? String(data.profile_id) : null,
      scopes: Array.isArray(data.scopes) ? data.scopes.map(String) : [],
    },
  };
}

function describeExpiry(expiresAt: number): string {
  if (expiresAt === 0) return 'KHÔNG hết hạn (never expires) ✅';
  if (expiresAt < 0) return 'không rõ';
  const ms = expiresAt * 1000 - Date.now();
  const days = ms / 86_400_000;
  const iso = new Date(expiresAt * 1000).toISOString();
  if (days >= 1) return `${iso} (~${Math.round(days)} ngày nữa)`;
  return `${iso} (~${Math.max(0, Math.round(ms / 3_600_000))} giờ nữa) ⚠️ NGẮN HẠN`;
}

// ── Types ───────────────────────────────────────────────────────────────────

interface PageAccount {
  id: string;
  name: string;
  access_token: string;
  category: string;
  tasks?: string[];
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('┌─────────────────────────────────────────────┐');
  console.log('│  VFOS — Get LONG-LIVED Page Access Token    │');
  console.log('└─────────────────────────────────────────────┘');
  console.log();

  if (!loadEnvFile()) {
    process.exit(1);
    return;
  }

  const appId = (process.env.META_APP_ID ?? '').trim();
  const appSecret = (process.env.META_APP_SECRET ?? '').trim();
  if (!appId || !appSecret) {
    console.error(
      '❌ Thiếu META_APP_ID / META_APP_SECRET trong .env — bắt buộc để đổi token dài hạn.',
    );
    console.error('   → Lấy tại: developers.facebook.com → chọn App riêng → Settings → Basic');
    console.error(
      "   → App ID hiện công khai; App Secret bấm 'Show'. Dán cả 2 vào .env rồi chạy lại.",
    );
    console.error(
      "   → LƯU Ý: app 'Graph API Explorer' mặc định của Meta KHÔNG dùng được (không có secret).",
    );
    process.exit(1);
    return;
  }
  const appToken = `${appId}|${appSecret}`;

  const inputToken = (process.env.FACEBOOK_PAGE_ACCESS_TOKEN ?? '').trim();
  if (!inputToken) {
    console.error('❌ FACEBOOK_PAGE_ACCESS_TOKEN chưa set trong .env');
    console.error('   → Dán token tươi từ Graph Explorer (User token của app riêng,');
    console.error('     quyền: pages_show_list, pages_read_engagement, pages_manage_posts).');
    process.exit(1);
    return;
  }

  const targetPageId = (process.env.FACEBOOK_PAGE_ID ?? '').trim() || FALLBACK_PAGE_ID;

  console.log(`📋 Token đầu vào: ${maskToken(inputToken)}`);
  console.log(`🎯 Page mục tiêu: ${targetPageId}`);
  console.log();

  // Step 1 — debug token đầu vào
  console.log('🔍 Step 1: Kiểm tra token hiện tại (debug_token)...');
  const inputRes = await debugToken(inputToken, appToken);
  if (!inputRes.ok) {
    const e = inputRes.error;
    console.error(`❌ debug_token lỗi: [${e.type}] ${e.message} (code: ${e.code})`);
    if (e.code === 190) {
      console.error(
        '   → Token hết hạn/không hợp lệ. Tạo token tươi từ Graph Explorer rồi dán vào .env.',
      );
    }
    console.error(
      '   → Nếu báo app không khớp: token phải được tạo từ ĐÚNG app có META_APP_ID ở trên.',
    );
    process.exit(1);
    return;
  }
  const inputInfo = inputRes.info;
  console.log(`   Type:   ${inputInfo.type} | Valid: ${inputInfo.isValid}`);
  console.log(`   Hạn:    ${describeExpiry(inputInfo.expiresAt)}`);
  if (inputInfo.scopes.length > 0) console.log(`   Scopes: ${inputInfo.scopes.join(', ')}`);
  if (!inputInfo.isValid) {
    console.error('❌ Token không còn hiệu lực — tạo token tươi từ Graph Explorer rồi chạy lại.');
    process.exit(1);
    return;
  }
  console.log();

  // Step 2 — fb_exchange_token → token DÀI HẠN (user ~60 ngày / page ~60 ngày)
  console.log('🔁 Step 2: Đổi sang token dài hạn (fb_exchange_token)...');
  const exch = await graphGet(
    `/oauth/access_token?grant_type=fb_exchange_token&client_id=${encodeURIComponent(appId)}` +
      `&client_secret=${encodeURIComponent(appSecret)}&fb_exchange_token=${encodeURIComponent(inputToken)}`,
  );
  if (!exch.ok) {
    const e = exch.error as GraphError;
    console.error(`❌ Exchange lỗi: [${e.type}] ${e.message} (code: ${e.code})`);
    console.error('   → Kiểm tra META_APP_ID/META_APP_SECRET đúng app đã tạo token.');
    process.exit(1);
    return;
  }
  const longLivedToken = String(exch.body.access_token ?? '');
  if (!longLivedToken) {
    console.error('❌ Exchange không trả access_token.');
    process.exit(1);
    return;
  }
  console.log(`   Token dài hạn: ${maskToken(longLivedToken)}`);
  console.log();

  // Step 3 — nếu là USER token: lấy Page token từ /me/accounts (không hết hạn).
  // Nếu đầu vào đã là PAGE token: bản exchange chính là page token dài hạn.
  let pageToken = longLivedToken;
  let pageName = '(giữ nguyên Page của token)';
  if (inputInfo.type === 'USER') {
    console.log('🔍 Step 3: USER token → GET /me/accounts để lấy Page token...');
    const accounts = await graphGet(
      `/me/accounts?fields=id,name,access_token,category,tasks&access_token=${encodeURIComponent(longLivedToken)}`,
    );
    if (!accounts.ok) {
      const e = accounts.error as GraphError;
      console.error(`❌ /me/accounts lỗi: [${e.type}] ${e.message} (code: ${e.code})`);
      console.error('   → Kiểm tra quyền pages_show_list + bạn là admin của Page.');
      process.exit(1);
      return;
    }
    const pages = (accounts.body.data ?? []) as PageAccount[];
    if (pages.length === 0) {
      console.error('❌ Không tìm thấy Page nào. Kiểm tra quyền pages_show_list + admin Page.');
      process.exit(1);
      return;
    }
    console.log(`   Tìm thấy ${pages.length} Page(s):`);
    for (const page of pages) {
      const marker = page.id === targetPageId ? ' ◀ TARGET 🎯' : '';
      console.log(
        `   - ${page.name} (${page.id})${marker} | token: ${maskToken(page.access_token)}`,
      );
    }
    const targetPage = pages.find((p) => p.id === targetPageId);
    if (!targetPage) {
      console.error(
        `❌ Không thấy Page ID ${targetPageId} trong danh sách — kiểm tra quyền admin.`,
      );
      process.exit(1);
      return;
    }
    pageToken = targetPage.access_token;
    pageName = targetPage.name;
    console.log();
  } else {
    console.log('ℹ️  Step 3: Đầu vào đã là PAGE token → dùng luôn bản exchange dài hạn.');
    console.log();
  }

  // Step 4 — VERIFY bằng chứng thật trước khi ghi: type PAGE + đúng Page ID + hạn dài.
  console.log('✅ Step 4: Verify Page token mới (debug_token)...');
  const pageRes = await debugToken(pageToken, appToken);
  if (!pageRes.ok) {
    const e = pageRes.error;
    console.error(`❌ Verify lỗi: [${e.type}] ${e.message} (code: ${e.code})`);
    process.exit(1);
    return;
  }
  const pageInfo = pageRes.info;
  console.log(`   Type:    ${pageInfo.type} | Valid: ${pageInfo.isValid}`);
  console.log(`   Page ID: ${pageInfo.profileId ?? '?'} | Page: ${pageName}`);
  console.log(`   Hạn:     ${describeExpiry(pageInfo.expiresAt)}`);
  console.log();
  if (pageInfo.type !== 'PAGE' || !pageInfo.isValid) {
    console.error('❌ Token mới không phải PAGE token hợp lệ — KHÔNG ghi .env.');
    process.exit(1);
    return;
  }
  if (pageInfo.profileId && pageInfo.profileId !== targetPageId) {
    console.error(
      `❌ Token thuộc Page ${pageInfo.profileId}, không khớp target ${targetPageId} — KHÔNG ghi .env.`,
    );
    process.exit(1);
    return;
  }
  // Hạn vẫn ngắn (<7 ngày) nghĩa là exchange không có tác dụng — fail rõ, không ghi đè im lặng.
  if (pageInfo.expiresAt > 0 && pageInfo.expiresAt * 1000 - Date.now() < 7 * 86_400_000) {
    console.error(
      '❌ Token mới vẫn NGẮN HẠN (<7 ngày) — exchange chưa đúng kỳ vọng, KHÔNG ghi .env.',
    );
    console.error('   → Kiểm tra app ở chế độ Live/Development và token tạo từ đúng app.');
    process.exit(1);
    return;
  }

  // Step 5 — ghi .env (thay đúng 1 giá trị, không in token đầy đủ)
  const path = envPath();
  const envContent = readFileSync(path, 'utf-8');
  const newEnvContent = envContent.replace(
    `FACEBOOK_PAGE_ACCESS_TOKEN=${inputToken}`,
    `FACEBOOK_PAGE_ACCESS_TOKEN=${pageToken}`,
  );
  if (newEnvContent !== envContent) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(path, newEnvContent, 'utf-8');
    console.log('═══════════════════════════════════════════════');
    console.log('✅ ĐÃ CẬP NHẬT .env VỚI PAGE TOKEN DÀI HẠN!');
    console.log('═══════════════════════════════════════════════');
    console.log(`   Token mới: ${maskToken(pageToken)}`);
    console.log(`   Hạn:       ${describeExpiry(pageInfo.expiresAt)}`);
  } else {
    console.log('⚠️  Không tự thay được dòng FACEBOOK_PAGE_ACCESS_TOKEN trong .env.');
    console.log('   → Mở .env và dán tay giá trị mới (token KHÔNG in ra đây vì lý do an toàn).');
    console.log('   → Chạy lại script sau khi sửa .env để verify.');
    process.exit(1);
    return;
  }
  console.log();
  console.log('   Bước kiểm tra cuối: pnpm facebook:test   (read-only, xác nhận token chạy)');
  console.log();
}

main().catch((err: unknown) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
