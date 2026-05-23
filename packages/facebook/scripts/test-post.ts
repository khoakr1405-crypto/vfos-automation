#!/usr/bin/env tsx
/**
 * VFOS Facebook Test Post — đăng một bài text test lên Page.
 *
 * Usage:
 *   pnpm facebook:test-post                       # MOCK (default — KHÔNG publish thật)
 *   pnpm facebook:test-post -- --dry-run          # MOCK (rõ ràng)
 *   META_MODE=live pnpm facebook:test-post -- --confirm-publish   # LIVE publish
 *
 * Safety gates (Round 2B 2026-05-24):
 *   1. Default MODE is `mock` — no Graph API call is made.
 *   2. LIVE publish requires ALL of:
 *      - `META_MODE=live` in env (.env or shell)
 *      - `--confirm-publish` CLI flag
 *      - `FACEBOOK_PAGE_ID` non-empty
 *      - `FACEBOOK_PAGE_ACCESS_TOKEN` non-empty
 *   3. Missing any of the above → script refuses to publish + exits safely.
 *   4. Tokens are NEVER logged. Only masked hints are shown.
 *
 * Why this exists: the script is intentionally idempotent and discoverable
 * — running `pnpm facebook:test-post` accidentally will NEVER publish.
 */

import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import { maskToken } from "../src/meta-client.js";
import { publishTextPost, resolvePublishMode } from "../src/post-page.js";

const TEST_MESSAGE =
  "VFOS test post — kiểm tra kết nối Facebook API thành công. Đây chỉ là bài test kỹ thuật.";

// ── Load .env manually ──────────────────────────────────────────────────────

function loadEnvFile(): void {
  const envPath = resolve(import.meta.dirname ?? ".", "..", "..", "..", ".env");

  if (!existsSync(envPath)) {
    // .env missing is OK in mock mode — we'll still default to mock and refuse live.
    console.warn("⚠️  File .env không tìm thấy tại:", envPath);
    console.warn("    → Script vẫn chạy được ở MOCK MODE (không publish thật).");
    console.warn("    → Để publish thật: copy .env.example thành .env + set META_MODE=live.");
    return;
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

// ── CLI flag parsing ────────────────────────────────────────────────────────

interface CliFlags {
  dryRun: boolean;
  confirmPublish: boolean;
}

function parseCliFlags(argv: string[]): CliFlags {
  return {
    dryRun: argv.includes("--dry-run"),
    confirmPublish: argv.includes("--confirm-publish"),
  };
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("┌─────────────────────────────────────────────┐");
  console.log("│  VFOS — Facebook Test Post (Text Only)      │");
  console.log("└─────────────────────────────────────────────┘");
  console.log();

  // 1. Load .env (warns if missing but does not exit — mock mode still works)
  loadEnvFile();

  // 2. Parse CLI flags + resolve mode from env
  const flags = parseCliFlags(process.argv.slice(2));
  const envMode = resolvePublishMode();

  // 3. Decide effective mode (HARD safety policy)
  //    LIVE requires ALL of: META_MODE=live + --confirm-publish + page id + token
  //    Anything else → MOCK
  const pageId = (process.env["FACEBOOK_PAGE_ID"] ?? "").trim();
  const token = (process.env["FACEBOOK_PAGE_ACCESS_TOKEN"] ?? "").trim();

  const liveRequested = envMode === "live" && flags.confirmPublish;
  const liveReady = liveRequested && pageId !== "" && token !== "";
  const effectiveMode: "mock" | "live" = liveReady ? "live" : "mock";

  // 4. Show config (NEVER show full token)
  console.log("📋 Config:");
  console.log(`   META_MODE (env):    ${envMode}`);
  console.log(`   --dry-run:          ${flags.dryRun ? "yes" : "no"}`);
  console.log(`   --confirm-publish:  ${flags.confirmPublish ? "yes" : "no"}`);
  console.log(`   Page ID:            ${pageId === "" ? "(empty)" : pageId}`);
  console.log(`   Token:              ${token === "" ? "(empty)" : maskToken(token)}`);
  console.log(`   → Effective mode:   ${effectiveMode.toUpperCase()}`);
  console.log();

  // 5. Explain why we landed in mock if user expected live
  if (envMode === "live" && !liveReady) {
    console.log("⚠️  LIVE publish was requested but blocked by safety gate.");
    if (!flags.confirmPublish) {
      console.log("    Missing CLI flag:    --confirm-publish");
    }
    if (pageId === "") {
      console.log("    Missing env:         FACEBOOK_PAGE_ID");
    }
    if (token === "") {
      console.log("    Missing env:         FACEBOOK_PAGE_ACCESS_TOKEN");
    }
    console.log("    → Falling back to MOCK MODE. No Facebook API call will be made.");
    console.log();
  }

  if (effectiveMode === "mock") {
    console.log("🛡️  MOCK MODE — no Facebook API call will be made.");
    console.log("    To publish for real, run ALL of the following:");
    console.log("      1) Set META_MODE=live in .env (or env)");
    console.log("      2) Set FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN in .env");
    console.log("      3) pass --confirm-publish CLI flag");
    console.log();
    // We still call publishTextPost — but its internal gate will short-circuit.
    // To guarantee no API call, also override env locally for the call.
    process.env["META_MODE"] = "mock";
  } else {
    console.log("🚨 LIVE MODE — about to publish to Facebook Page for real.");
    console.log("   This will create a public post. Make sure you intend this.");
    console.log();
  }

  console.log("📝 Nội dung bài test:");
  console.log(`   "${TEST_MESSAGE}"`);
  console.log();

  console.log(
    effectiveMode === "live"
      ? "📤 Đang đăng bài lên Facebook Page (LIVE)..."
      : "🧪 Đang chạy mock publish (no API call)..."
  );
  console.log();

  const result = await publishTextPost(pageId, token, { message: TEST_MESSAGE });

  if (result.mode === "mock") {
    console.log("✅ MOCK PUBLISH OK — không gọi Graph API thật.");
    console.log();
    console.log("📄 Mock result:");
    console.log(`   Post ID (mock):  ${result.postId}`);
    console.log(`   mode:            ${result.mode}`);
    console.log();
    console.log("🎯 Next steps:");
    console.log("   • Mock chỉ verify code path. KHÔNG có bài viết thật trên Page.");
    console.log("   • Khi sẵn sàng publish thật: xem instruction ở trên.");
    return;
  }

  if (result.success && result.postId) {
    console.log("✅ LIVE PUBLISH THÀNH CÔNG!");
    console.log();
    console.log("📄 Post Info:");
    console.log(`   Post ID:  ${result.postId}`);
    console.log(`   URL:      https://www.facebook.com/${result.postId.replace("_", "/posts/")}`);
    console.log(`   mode:     ${result.mode}`);
    console.log();
    console.log("🎯 Next steps:");
    console.log("   • Kiểm tra bài viết trên Facebook Page");
    console.log("   • Xoá bài test nếu không cần giữ");
  } else {
    console.error("❌ LIVE PUBLISH THẤT BẠI");
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
