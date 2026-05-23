#!/usr/bin/env tsx
/**
 * VFOS — Lấy Page Access Token từ User Access Token.
 *
 * Flow: User Access Token → GET /me/accounts → tìm Page → lấy Page Access Token.
 *
 * Usage: pnpm facebook:get-page-token
 *
 * Security: NEVER logs full tokens.
 */

import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { maskToken } from "../src/meta-client.js";

const TARGET_PAGE_ID = "1169116176282221";

// ── Load .env ───────────────────────────────────────────────────────────────

function loadEnvFile(): void {
  const envPath = resolve(import.meta.dirname ?? ".", "..", "..", "..", ".env");
  if (!existsSync(envPath)) {
    console.error("❌ File .env không tìm thấy.");
    process.exit(1);
  }
  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === "" || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// ── Types ───────────────────────────────────────────────────────────────────

interface PageAccount {
  id: string;
  name: string;
  access_token: string;
  category: string;
  tasks?: string[];
}

interface MeAccountsResponse {
  data?: PageAccount[];
  error?: { message: string; type: string; code: number };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("┌─────────────────────────────────────────────┐");
  console.log("│  VFOS — Get Page Access Token               │");
  console.log("└─────────────────────────────────────────────┘");
  console.log();

  loadEnvFile();

  const userToken = process.env["FACEBOOK_PAGE_ACCESS_TOKEN"];
  if (!userToken || userToken.trim() === "") {
    console.error("❌ FACEBOOK_PAGE_ACCESS_TOKEN chưa set trong .env");
    process.exit(1);
  }

  console.log("📋 Đang dùng token hiện tại (có thể là User Token):");
  console.log(`   Token: ${maskToken(userToken)}`);
  console.log();

  // Step 1: Verify token type
  console.log("🔍 Step 1: Kiểm tra loại token...");
  const debugRes = await fetch(
    `https://graph.facebook.com/v22.0/debug_token?input_token=${encodeURIComponent(userToken)}&access_token=${encodeURIComponent(userToken)}`,
    { headers: { "User-Agent": "VFOS/0.1.0" } }
  );
  const debugBody = (await debugRes.json()) as Record<string, unknown>;
  const debugData = (debugBody["data"] ?? {}) as Record<string, unknown>;

  if (debugData["type"]) {
    console.log(`   Token type: ${debugData["type"]}`);
    if (debugData["type"] === "PAGE") {
      console.log("   ✅ Đây đã là Page Access Token rồi!");
      console.log("   → Thử chạy lại: pnpm facebook:test-post");
      return;
    }
    if (debugData["type"] === "USER") {
      console.log("   ⚠️  Đây là User Access Token — cần exchange sang Page Token.");
    }
  }

  // Show scopes
  const scopes = debugData["scopes"];
  if (Array.isArray(scopes)) {
    console.log(`   Scopes: ${scopes.join(", ")}`);
  }
  console.log();

  // Step 2: Call /me/accounts
  console.log("🔍 Step 2: Gọi GET /me/accounts để lấy danh sách Pages...");
  console.log();

  const url = `https://graph.facebook.com/v22.0/me/accounts?fields=id,name,access_token,category,tasks&access_token=${encodeURIComponent(userToken)}`;
  const response = await fetch(url, {
    headers: { "User-Agent": "VFOS/0.1.0" },
  });
  const body = (await response.json()) as MeAccountsResponse;

  if (!response.ok || body.error) {
    const err = body.error;
    console.error("❌ Lỗi khi gọi /me/accounts:");
    console.error(`   ${err?.message ?? "Unknown error"} (code: ${err?.code ?? "?"})`);
    if (err?.code === 190) {
      console.error("   → Token hết hạn hoặc không hợp lệ. Tạo lại token mới.");
    }
    process.exit(1);
  }

  const pages = body.data ?? [];
  if (pages.length === 0) {
    console.error("❌ Không tìm thấy Page nào.");
    console.error("   → Kiểm tra token có đủ permission: pages_show_list");
    console.error("   → Kiểm tra bạn là admin của Page");
    process.exit(1);
  }

  // Step 3: List all pages
  console.log(`   Tìm thấy ${pages.length} Page(s):`);
  console.log();
  for (const page of pages) {
    const isTarget = page.id === TARGET_PAGE_ID;
    const marker = isTarget ? " ◀ TARGET" : "";
    console.log(`   ${isTarget ? "🎯" : "📄"} ${page.name}`);
    console.log(`      ID:       ${page.id}${marker}`);
    console.log(`      Category: ${page.category}`);
    console.log(`      Token:    ${maskToken(page.access_token)}`);
    if (page.tasks) {
      console.log(`      Tasks:    ${page.tasks.join(", ")}`);
    }
    console.log();
  }

  // Step 4: Find target page
  const targetPage = pages.find((p) => p.id === TARGET_PAGE_ID);

  if (!targetPage) {
    console.error(`❌ Không tìm thấy Page ID ${TARGET_PAGE_ID} trong danh sách.`);
    console.error("   → Kiểm tra bạn là admin của Page 'Review Nhà bạn'");
    console.error("   → Kiểm tra Page ID có đúng không");
    process.exit(1);
  }

  // Step 5: Output instructions
  console.log("═══════════════════════════════════════════════");
  console.log("✅ TÌM THẤY PAGE ACCESS TOKEN!");
  console.log("═══════════════════════════════════════════════");
  console.log();
  console.log(`   Page:  ${targetPage.name} (${targetPage.id})`);
  console.log(`   Token: ${maskToken(targetPage.access_token)}`);
  console.log();
  console.log("📋 HƯỚNG DẪN CẬP NHẬT:");
  console.log();
  console.log("   1. Mở file .env");
  console.log("   2. Tìm dòng FACEBOOK_PAGE_ACCESS_TOKEN=...");
  console.log("   3. Thay toàn bộ giá trị bằng Page Access Token bên dưới:");
  console.log();
  console.log("   ┌──────────────────────────────────────────┐");
  console.log(`   │ ${maskToken(targetPage.access_token).padEnd(40)} │`);
  console.log("   └──────────────────────────────────────────┘");
  console.log();

  // Write the token directly to avoid copy-paste errors
  const envPath = resolve(import.meta.dirname ?? ".", "..", "..", "..", ".env");
  const envContent = readFileSync(envPath, "utf-8");
  const oldToken = process.env["FACEBOOK_PAGE_ACCESS_TOKEN"] ?? "";
  const newEnvContent = envContent.replace(
    `FACEBOOK_PAGE_ACCESS_TOKEN=${oldToken}`,
    `FACEBOOK_PAGE_ACCESS_TOKEN=${targetPage.access_token}`
  );

  if (newEnvContent !== envContent) {
    const { writeFileSync } = await import("node:fs");
    writeFileSync(envPath, newEnvContent, "utf-8");
    console.log("   ✅ Đã tự động cập nhật .env với Page Access Token mới!");
    console.log();
  } else {
    console.log("   ⚠️  Không tự động thay được — hãy copy-paste thủ công.");
    console.log();
  }

  console.log("   4. Chạy test post:");
  console.log("      pnpm facebook:test-post");
  console.log();
}

main().catch((err: unknown) => {
  console.error("❌ Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
