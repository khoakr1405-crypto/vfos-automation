#!/usr/bin/env tsx

/**
 * 🚫 DEPRECATED — Legacy Shopee storage_state login flow.
 *
 * Replaced by CDP targeted-click flow (Round 26B+):
 *   pnpm commerce:intake [--confirm-targeted-click]
 *   pnpm shopee:preflight / shopee:extractor / shopee:builder / shopee:audit
 *
 * Kept as FALLBACK per SKILL.md policy. Only run when Operator explicitly
 * authorizes AND the official CDP flow is unavailable. Do NOT auto-trigger
 * from /chay or commerce intake orchestrator.
 *
 * See: docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md Phần 22–23, SKILL.md
 * line ~1109 (Round 26B audit decision matrix).
 */

/**
 * VFOS Shopee Session Fetcher v0 — login + save storageState
 *
 * Usage:
 *   pnpm shopee:login
 *
 * What this does:
 *   1. Opens a HEADED Chromium window via Playwright.
 *   2. Navigates to https://affiliate.shopee.vn/login.
 *   3. User logs in MANUALLY (handles captcha / 2FA / OTP as needed).
 *   4. When user signals "logged in" (closes the prompt), saves the browser
 *      storage state (cookies + localStorage) to
 *      `.secrets/shopee_storage_state.json` (gitignored).
 *
 * Security:
 *   - The storageState file is the ONLY persistence point. Nothing is logged.
 *   - `.secrets/` is gitignored (verified via .gitignore line 16: `.secrets/`).
 *   - This script does NOT read, intercept, or log any cookie/token value.
 *     It only calls `context.storageState({ path })` — Playwright writes
 *     directly to disk via internal API; no Node-side cookie inspection.
 *   - If Shopee shows captcha/OTP, USER handles it. Script never bypasses.
 *
 * Setup:
 *   This script requires `playwright`. Install once (in workspace root):
 *     pnpm add -D playwright -F @vfos/shopee
 *     pnpm exec playwright install chromium
 *
 *   If `playwright` is not installed, the script will fail at import with
 *   a clear error message — no API call attempted.
 */

import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const STORAGE_STATE_PATH = resolve(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "..",
  ".secrets",
  "shopee_storage_state.json"
);

const LOGIN_URL = "https://affiliate.shopee.vn/login";
const OFFER_URL = "https://affiliate.shopee.vn/offer/shopee_offer";

async function main(): Promise<void> {
  console.log("┌────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Session Login (HEADED browser)  │");
  console.log("└────────────────────────────────────────────────┘");
  console.log();
  console.log("📁 Storage path (gitignored):");
  console.log(`   ${STORAGE_STATE_PATH}`);
  console.log();

  // Lazy import playwright — fail fast with clear message if not installed.
  let chromium: typeof import("playwright").chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch (err: unknown) {
    console.error("❌ Playwright chưa được cài.");
    console.error("   Để cài đặt (chỉ cần làm 1 lần):");
    console.error("     pnpm add -D playwright -F @vfos/shopee");
    console.error("     pnpm exec playwright install chromium");
    console.error();
    console.error("   Lý do error:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  // Ensure .secrets/ exists locally (gitignored, never committed)
  const secretsDir = dirname(STORAGE_STATE_PATH);
  if (!existsSync(secretsDir)) {
    mkdirSync(secretsDir, { recursive: true });
    console.log(`📂 Đã tạo thư mục .secrets/ (gitignored): ${secretsDir}`);
    console.log();
  }

  console.log("🌐 Đang mở browser headed...");
  console.log("   → Sau khi browser mở:");
  console.log("     1. Login Shopee Affiliate bằng tài khoản của bạn.");
  console.log("     2. Hoàn thành captcha / 2FA / OTP nếu có.");
  console.log("     3. Khi đã thấy Affiliate dashboard (sản phẩm hiện ra),");
  console.log("        quay lại terminal này và nhấn Enter để save session.");
  console.log();

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });

  // Wait for user to confirm login complete via stdin prompt
  const rl = createInterface({ input, output });
  await rl.question(
    "⏸  Sau khi đã login + thấy dashboard, nhấn Enter ở đây để save session... "
  );
  rl.close();

  // Quick navigation to offer page to verify session is alive
  console.log("🔎 Đang verify session bằng cách điều hướng tới offer dashboard...");
  try {
    await page.goto(OFFER_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
    const url = page.url();
    if (url.includes("/login")) {
      console.warn("⚠️  Có vẻ session chưa login thật — URL hiện tại vẫn là /login.");
      console.warn("    Vẫn save state để debug, nhưng fetch sau có thể fail.");
    } else {
      console.log("✅ Session có vẻ hợp lệ — đã vào offer dashboard.");
    }
  } catch (err: unknown) {
    console.warn(
      "⚠️  Verify nav fail:",
      err instanceof Error ? err.message : String(err)
    );
    console.warn("    Vẫn tiếp tục save state.");
  }

  // Save storage state (cookies + localStorage). NEVER read/log values here.
  await context.storageState({ path: STORAGE_STATE_PATH });

  await browser.close();

  console.log();
  console.log("✅ Session đã save vào:");
  console.log(`   ${STORAGE_STATE_PATH}`);
  console.log();
  console.log("🛡️  Security check:");
  console.log("   • File này CHỨA cookies/token Shopee — KHÔNG share, KHÔNG commit.");
  console.log("   • .secrets/ đã gitignored (.gitignore line: `.secrets/`).");
  console.log("   • Bước tiếp: pnpm shopee:fetch (đọc dashboard, xuất JSON candidates).");
  console.log();
}

main().catch((err: unknown) => {
  console.error("❌ Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
