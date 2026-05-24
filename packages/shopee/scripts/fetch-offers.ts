#!/usr/bin/env tsx
/**
 * VFOS Shopee Session Fetcher v0 — fetch product candidates
 *
 * Usage:
 *   pnpm shopee:fetch
 *
 * Prereq:
 *   1. `pnpm shopee:login` first (saves .secrets/shopee_storage_state.json)
 *   2. Playwright installed (pnpm add -D playwright -F @vfos/shopee)
 *
 * What this does:
 *   1. Loads `.secrets/shopee_storage_state.json` (gitignored cookies/localStorage).
 *   2. Opens HEADLESS Chromium with that session.
 *   3. Navigates to `https://affiliate.shopee.vn/offer/shopee_offer`.
 *   4. Waits for product cards to render.
 *   5. Extracts up to 3 candidates (small N for v0 — verify pipeline first).
 *   6. Writes `production/_commerce/shopee_product_candidates.json` —
 *      ZERO cookies/tokens, only public product data.
 *
 * Security:
 *   - Output JSON contains NO cookie / NO token / NO session data.
 *   - Console logs print counts + URLs only — never cookie values.
 *   - If session is expired (page redirects to /login): script exits
 *     with `required_user_action: true` in manifest. User must re-run login.
 *   - HTML debug snapshot (if needed) saved to `.secrets/last_fetch_dom.html`
 *     which is gitignored — operator inspects manually.
 *
 * Selectors:
 *   See packages/shopee/src/extract.ts — OFFER_DASHBOARD_SELECTORS. These are
 *   placeholders; Shopee SPA DOM changes frequently. First real run may need
 *   recalibration via browser DevTools.
 */

import { resolve, dirname } from "node:path";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  OFFER_DASHBOARD_SELECTORS,
  parsePriceVnd,
  parseCommissionPct,
  estimateCommissionVnd,
  computeDataConfidence,
  emptyCandidate,
} from "../src/extract.js";
import type {
  ShopeeProductCandidate,
  ShopeeFetchManifest,
} from "../src/types.js";

const STORAGE_STATE_PATH = resolve(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "..",
  ".secrets",
  "shopee_storage_state.json"
);

const OUTPUT_PATH = resolve(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "..",
  "production",
  "_commerce",
  "shopee_product_candidates.json"
);

const DEBUG_DOM_PATH = resolve(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "..",
  ".secrets",
  "last_fetch_dom.html"
);

const OFFER_URL = "https://affiliate.shopee.vn/offer/shopee_offer";
const MAX_CANDIDATES = 3;
const PHASE_REF = "Shopee Session Fetcher v0 — 2026-05-24";

async function main(): Promise<void> {
  console.log("┌────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Fetch Offer Candidates (HEADLESS) │");
  console.log("└────────────────────────────────────────────────┘");
  console.log();

  // Guard: storage state must exist
  if (!existsSync(STORAGE_STATE_PATH)) {
    console.error("❌ Session storage không tìm thấy:");
    console.error(`   ${STORAGE_STATE_PATH}`);
    console.error();
    console.error("   → Chạy `pnpm shopee:login` trước để login + save session.");
    process.exit(1);
  }
  console.log(`📁 Loading session từ: ${STORAGE_STATE_PATH}`);
  console.log();

  // Lazy import playwright
  let chromium: typeof import("playwright").chromium;
  try {
    const playwright = await import("playwright");
    chromium = playwright.chromium;
  } catch (err: unknown) {
    console.error("❌ Playwright chưa được cài.");
    console.error("   Để cài đặt:");
    console.error("     pnpm add -D playwright -F @vfos/shopee");
    console.error("     pnpm exec playwright install chromium");
    console.error();
    console.error("   Lý do:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  console.log("🌐 Mở headless Chromium với session đã save...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ storageState: STORAGE_STATE_PATH });
  const page = await context.newPage();

  let requiredUserAction = false;
  const candidates: ShopeeProductCandidate[] = [];
  let attempts = 0;
  let notes = "";

  try {
    console.log(`🔎 Đang điều hướng: ${OFFER_URL}`);
    await page.goto(OFFER_URL, { waitUntil: "domcontentloaded", timeout: 30000 });

    // Detect login redirect
    const currentUrl = page.url();
    if (currentUrl.includes("/login")) {
      requiredUserAction = true;
      notes = "Session expired or invalid — page redirected to /login. Re-run `pnpm shopee:login`.";
      console.warn("⚠️  Session đã hết hạn / không hợp lệ — Shopee redirect về /login.");
      console.warn("    → Chạy lại `pnpm shopee:login` để renew session.");
    } else {
      // Wait briefly for SPA to render product cards
      console.log("⏳ Chờ dashboard render (timeout 15s)...");
      const containerSelector = OFFER_DASHBOARD_SELECTORS.cardContainer.join(", ");
      try {
        await page.waitForSelector(containerSelector, { timeout: 15000 });
      } catch {
        notes = "No product card container matched any placeholder selector. DOM may have changed — operator must recalibrate OFFER_DASHBOARD_SELECTORS.";
        console.warn(`⚠️  ${notes}`);

        // Save debug HTML snapshot to .secrets/ (gitignored) for operator
        try {
          const html = await page.content();
          if (!existsSync(dirname(DEBUG_DOM_PATH))) {
            mkdirSync(dirname(DEBUG_DOM_PATH), { recursive: true });
          }
          writeFileSync(DEBUG_DOM_PATH, html, "utf-8");
          console.warn(`   📄 DOM snapshot saved (gitignored): ${DEBUG_DOM_PATH}`);
        } catch (dumpErr: unknown) {
          console.warn(
            "   Could not save DOM snapshot:",
            dumpErr instanceof Error ? dumpErr.message : String(dumpErr)
          );
        }
      }

      // Try to extract first MAX_CANDIDATES product cards
      const cards = await page.locator(containerSelector).all();
      attempts = Math.min(cards.length, MAX_CANDIDATES);
      console.log(`📊 Tìm thấy ${cards.length} card(s), sẽ trích xuất ${attempts}.`);

      for (let i = 0; i < attempts; i++) {
        const card = cards[i]!;
        const candidate = emptyCandidate(OFFER_URL, "extracted from offer dashboard");

        // Helper to try multiple selectors and return first text
        const tryText = async (selectors: readonly string[]): Promise<string | null> => {
          for (const sel of selectors) {
            try {
              const el = card.locator(sel).first();
              const count = await el.count();
              if (count > 0) {
                const text = (await el.textContent({ timeout: 2000 })) ?? "";
                if (text.trim() !== "") return text.trim();
              }
            } catch {
              // try next selector
            }
          }
          return null;
        };

        // Product URL
        for (const sel of OFFER_DASHBOARD_SELECTORS.productUrl) {
          try {
            const el = card.locator(sel).first();
            const count = await el.count();
            if (count > 0) {
              const href = await el.getAttribute("href", { timeout: 2000 });
              if (href && href.includes("shopee.vn")) {
                candidate.shopee_product_url = href.startsWith("http")
                  ? href
                  : `https://shopee.vn${href}`;
                break;
              }
            }
          } catch {
            // try next
          }
        }

        const name = await tryText(OFFER_DASHBOARD_SELECTORS.productName);
        if (name) candidate.product_name = name;

        const priceRaw = await tryText(OFFER_DASHBOARD_SELECTORS.price);
        candidate.price_vnd = parsePriceVnd(priceRaw);

        const pctRaw = await tryText(OFFER_DASHBOARD_SELECTORS.commissionPct);
        candidate.commission_pct = parseCommissionPct(pctRaw);

        candidate.estimated_commission_vnd = estimateCommissionVnd(
          candidate.price_vnd,
          candidate.commission_pct
        );

        const shop = await tryText(OFFER_DASHBOARD_SELECTORS.shopName);
        if (shop) candidate.shop_name = shop;

        const sales = await tryText(OFFER_DASHBOARD_SELECTORS.salesCount);
        if (sales) candidate.sales_count = sales;

        const rating = await tryText(OFFER_DASHBOARD_SELECTORS.rating);
        if (rating) {
          const m = rating.match(/(\d+(?:[.,]\d+)?)/);
          if (m) {
            const r = parseFloat(m[1]!.replace(",", "."));
            if (Number.isFinite(r) && r >= 0 && r <= 5) candidate.rating = r;
          }
        }

        const reviews = await tryText(OFFER_DASHBOARD_SELECTORS.reviewCount);
        if (reviews) {
          const m = reviews.match(/(\d+)/);
          if (m) {
            const c = parseInt(m[1] ?? "0", 10);
            if (Number.isFinite(c) && c >= 0) candidate.review_count = c;
          }
        }

        candidate.data_confidence = computeDataConfidence(candidate);

        const unknownCount = [
          candidate.product_name,
          candidate.price_vnd,
          candidate.commission_pct,
          candidate.sales_count,
          candidate.rating,
          candidate.review_count,
          candidate.shop_name,
        ].filter((v) => v === "unknown").length;
        candidate.extraction_notes = `selector-based extraction; ${unknownCount}/7 critical fields unknown`;

        candidates.push(candidate);
        // Log only counts + URL — NEVER any cookie / token / session value
        console.log(
          `  [${i + 1}/${attempts}] confidence=${candidate.data_confidence}, url=${
            candidate.shopee_product_url
          }`
        );
      }
    }
  } catch (err: unknown) {
    notes = `Fetch error: ${err instanceof Error ? err.message : String(err)}`;
    console.error("❌", notes);
  } finally {
    await browser.close();
  }

  // Write manifest — NO cookies, NO tokens, only public product data
  const manifest: ShopeeFetchManifest = {
    created_at: new Date().toISOString(),
    phase_ref: PHASE_REF,
    source_page: OFFER_URL,
    candidates_attempted: attempts,
    candidates_extracted: candidates.filter(
      (c) => c.product_name !== "unknown" && c.shopee_product_url !== "unknown"
    ).length,
    required_user_action: requiredUserAction,
    notes: notes || "OK",
    candidates,
  };

  if (!existsSync(dirname(OUTPUT_PATH))) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, "utf-8");

  console.log();
  console.log(`✅ Đã ghi artifact: ${OUTPUT_PATH}`);
  console.log(`   candidates_attempted: ${manifest.candidates_attempted}`);
  console.log(`   candidates_extracted: ${manifest.candidates_extracted}`);
  console.log(`   required_user_action: ${manifest.required_user_action}`);
  console.log();
  console.log("🛡️  Security check:");
  console.log("   • JSON output KHÔNG chứa cookie / token / session.");
  console.log("   • Log KHÔNG print cookie value, chỉ counts + URLs.");
  if (manifest.required_user_action) {
    console.log("   ⚠️  Session hết hạn — chạy `pnpm shopee:login` để renew.");
  }
}

main().catch((err: unknown) => {
  console.error("❌ Unexpected error:", err instanceof Error ? err.message : err);
  process.exit(1);
});
