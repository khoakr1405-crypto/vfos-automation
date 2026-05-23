#!/usr/bin/env tsx
/**
 * VFOS Facebook Test Post — Đăng một bài text đơn giản lên Page.
 *
 * Usage: pnpm facebook:test-post
 *
 * Security:
 * - Reads tokens from .env only (never hardcoded)
 * - NEVER logs tokens to stdout/stderr
 * - Only shows masked token hints
 */

import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { maskToken } from "../src/meta-client.js";
import { publishTextPost } from "../src/post-page.js";

const TEST_MESSAGE =
  "VFOS test post — kiểm tra kết nối Facebook API thành công. Đây chỉ là bài test kỹ thuật.";

// ── Load .env manually ──────────────────────────────────────────────────────

function loadEnvFile(): void {
  const envPath = resolve(import.meta.dirname ?? ".", "..", "..", "..", ".env");

  if (!existsSync(envPath)) {
    console.error("❌ File .env không tìm thấy tại:", envPath);
    console.error("   → Copy .env.example thành .env rồi điền các biến Facebook.");
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

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("┌─────────────────────────────────────────────┐");
  console.log("│  VFOS — Facebook Test Post (Text Only)      │");
  console.log("└─────────────────────────────────────────────┘");
  console.log();

  // 1. Load .env
  loadEnvFile();

  const pageId = process.env["FACEBOOK_PAGE_ID"];
  const token = process.env["FACEBOOK_PAGE_ACCESS_TOKEN"];

  if (!pageId || pageId.trim() === "") {
    console.error("❌ FACEBOOK_PAGE_ID is not set in .env");
    process.exit(1);
  }
  if (!token || token.trim() === "") {
    console.error("❌ FACEBOOK_PAGE_ACCESS_TOKEN is not set in .env");
    process.exit(1);
  }

  // 2. Show config (NEVER show full token)
  console.log("📋 Config:");
  console.log(`   Page ID:  ${pageId}`);
  console.log(`   Token:    ${maskToken(token)}`);
  console.log();
  console.log("📝 Nội dung bài test:");
  console.log(`   "${TEST_MESSAGE}"`);
  console.log();

  // 3. Publish
  console.log("📤 Đang đăng bài lên Facebook Page...");
  console.log();

  const result = await publishTextPost(pageId.trim(), token.trim(), {
    message: TEST_MESSAGE,
  });

  if (result.success && result.postId) {
    console.log("✅ ĐĂNG BÀI THÀNH CÔNG!");
    console.log();
    console.log("📄 Post Info:");
    console.log(`   Post ID:  ${result.postId}`);
    console.log(`   URL:      https://www.facebook.com/${result.postId.replace("_", "/posts/")}`);
    console.log();
    console.log("🎯 Next steps:");
    console.log("   • Kiểm tra bài viết trên Facebook Page");
    console.log("   • Xoá bài test nếu không cần giữ");
    console.log("   • Khi sẵn sàng: triển khai Reels upload");
  } else {
    console.error("❌ ĐĂNG BÀI THẤT BẠI");
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
