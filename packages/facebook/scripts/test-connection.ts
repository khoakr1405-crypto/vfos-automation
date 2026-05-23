#!/usr/bin/env tsx
/**
 * VFOS Facebook Connection Test
 *
 * Usage: pnpm facebook:test
 *
 * Tests that FACEBOOK_PAGE_ID and FACEBOOK_PAGE_ACCESS_TOKEN in .env
 * are valid and can read the target Facebook Page.
 *
 * Security:
 * - Reads tokens from .env only (never hardcoded)
 * - NEVER logs tokens to stdout/stderr
 * - Only shows masked token hints on error
 */

import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { createMetaClientFromEnv, maskToken } from "../src/meta-client.js";
import { testPageConnection } from "../src/test-page.js";

// ── Load .env manually (no dotenv dependency — keep it simple) ──────────────

function loadEnvFile(): void {
  // Walk up from packages/facebook/scripts/ to find workspace root .env
  const envPath = resolve(import.meta.dirname ?? ".", "..", "..", "..", ".env");

  if (!existsSync(envPath)) {
    console.error("❌ File .env không tìm thấy tại:", envPath);
    console.error("   → Copy .env.example thành .env rồi điền các biến Facebook.");
    process.exit(1);
  }

  const content = readFileSync(envPath, "utf-8");
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    // Skip empty lines and comments
    if (trimmed === "" || trimmed.startsWith("#")) continue;

    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;

    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();

    // Only set if not already in environment (env vars take precedence)
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("┌─────────────────────────────────────────────┐");
  console.log("│  VFOS — Facebook Page Connection Test       │");
  console.log("└─────────────────────────────────────────────┘");
  console.log();

  // 1. Load .env
  loadEnvFile();

  // 2. Create client (will throw if env vars missing)
  let client;
  try {
    client = createMetaClientFromEnv();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("❌", message);
    process.exit(1);
  }

  // 3. Show config summary (NEVER show token)
  const token = process.env["FACEBOOK_PAGE_ACCESS_TOKEN"] ?? "";
  console.log("📋 Config:");
  console.log(`   Page ID:      ${client.pageId}`);
  console.log(`   Token:        ${maskToken(token)}`);
  console.log(`   API version:  v22.0`);
  console.log();

  // 4. Test connection
  console.log("🔌 Testing connection to Meta Graph API...");
  console.log();

  const result = await testPageConnection(client);

  if (result.success && result.page) {
    console.log("✅ KẾT NỐI THÀNH CÔNG!");
    console.log();
    console.log("📄 Page Info:");
    console.log(`   ID:    ${result.page.id}`);
    console.log(`   Name:  ${result.page.name}`);
    console.log();
    console.log("🎯 Next steps:");
    console.log("   • Token hoạt động — có thể tiếp tục tích hợp Facebook Reels");
    console.log("   • Chưa đăng bài / upload video (chỉ test đọc Page)");
    console.log("   • Khi sẵn sàng publish: triển khai module facebook:publish");
  } else {
    console.error("❌ KẾT NỐI THẤT BẠI");
    console.error();
    console.error("🔍 Lỗi:", result.error);
    if (result.diagnosis) {
      console.error();
      console.error("💡 Chẩn đoán:");
      console.error(`   ${result.diagnosis.replace(/\n/g, "\n   ")}`);
    }
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  console.error("❌ Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
