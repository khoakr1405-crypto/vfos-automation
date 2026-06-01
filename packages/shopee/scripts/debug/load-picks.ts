#!/usr/bin/env tsx
/**
 * VFOS Shopee Operator Manual Picks Loader v0
 *
 * Bypasses the Shopee Affiliate API entirely. Operator manually picks
 * 5–10 products via the Shopee Affiliate dashboard's "Tạo link tiếp thị"
 * UI, copies the wrapped affiliate URL + optional metadata into
 * `.secrets/shopee_picks.txt`, then runs:
 *
 *   pnpm shopee:picks
 *
 * Output: production/_commerce/shopee_product_candidates.json — same
 * schema as fetch-products-cookie.ts so select-products.ts and the rest
 * of the pipeline are unchanged.
 *
 * Trade-off vs the API fetcher:
 *   + zero throttle risk (no Shopee API calls)
 *   + zero account-ban risk (no anti-scrape headers / TLS spoofing)
 *   + operator filters by quality up front, not after-the-fact scoring
 *   – manual ~30s/product, no batching beyond what operator can paste
 *
 * Security: `.secrets/` is gitignored; this script reads from there but
 * never logs the raw file content. Output JSON validated secret-free.
 */

import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { emptyCandidate, validateShopeeAffiliateLink } from "../../src/extract.js";
import { isSecretFree, redactSecrets } from "../../src/secret-redaction.js";
import type { ShopeeProductCandidate } from "../../src/types.js";

const ROOT_DIR = resolve(import.meta.dirname ?? ".", "..", "..", "..", "..");
const PICKS_PATH = resolve(ROOT_DIR, ".secrets", "shopee_picks.txt");
const OUTPUT_PATH = resolve(
  ROOT_DIR,
  "production",
  "_commerce",
  "shopee_product_candidates.json",
);
const PHASE_REF = "Shopee Operator Manual Picks v0 — 2026-05-24";
const SOURCE_TAG = "shopee_operator_manual_picks";

const TEMPLATE = `# Shopee Manual Picks — paste 5–10 affiliate-wrapped products below.
#
# RULES:
#   - Lines starting with '#' are comments.
#   - Blocks are separated by one or more blank lines.
#   - Within a block, each line is "key: value".
#   - REQUIRED key: affiliate_url
#   - OPTIONAL keys: name, product_url, price_vnd, commission_pct,
#                    sales_count, rating, review_count, shop_name,
#                    image_url, notes
#
# To get affiliate_url:
#   1. https://affiliate.shopee.vn → "Công cụ tạo link"
#   2. Paste raw product URL (e.g. https://s.shopee.vn/xxxxx)
#   3. Click "Tạo link" → copy the long URL (contains gads_t_sig + utm_source=an_<id>)
#
# ─── EXAMPLE ─────────────────────────────────────────────────────────
# name: Dụng cụ thái và tẩy lõi trái cây 8 mảnh
# affiliate_url: https://shopee.vn/universal-link/product/1222870713/29157372461?gads_t_sig=...&utm_source=an_17376660568&utm_medium=affiliates
# product_url: https://s.shopee.vn/7Aae72iZ2a
# price_vnd: 95000
# commission_pct: 9%
# sales_count: 5k+
# rating: 4.8
# review_count: 1234
# shop_name: Bếp Tiện Lợi VN
# notes: từ FB ad chiều nay, demo có sẵn trên YouTube
# ─────────────────────────────────────────────────────────────────────
`;

interface PicksOutput {
  source: typeof SOURCE_TAG;
  created_at: string;
  phase_ref: string;
  picks_file: string;
  data_confidence: "high" | "medium" | "low";
  candidate_count: number;
  candidates: ShopeeProductCandidate[];
  parse_notes: string;
  contains_cookie: false;
}

type PickBlock = Record<string, string>;

function parsePicksFile(content: string): { blocks: PickBlock[]; warnings: string[] } {
  const warnings: string[] = [];
  const blocks: PickBlock[] = [];
  let current: PickBlock = {};
  let lineNo = 0;

  for (const rawLine of content.split(/\r?\n/)) {
    lineNo++;
    const line = rawLine.trim();
    if (line === "") {
      if (Object.keys(current).length > 0) {
        blocks.push(current);
        current = {};
      }
      continue;
    }
    if (line.startsWith("#")) continue;

    const colonIdx = line.indexOf(":");
    if (colonIdx <= 0) {
      warnings.push(`line ${lineNo}: skipped — no "key: value" structure`);
      continue;
    }
    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();
    if (key === "" || value === "") continue;
    current[key] = value;
  }
  if (Object.keys(current).length > 0) blocks.push(current);

  return { blocks, warnings };
}

function parseIntegerVnd(raw: string | undefined): number | "unknown" {
  if (!raw) return "unknown";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits === "") return "unknown";
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n > 0 ? n : "unknown";
}

function parseRating(raw: string | undefined): number | "unknown" {
  if (!raw) return "unknown";
  const n = parseFloat(raw.replace(",", "."));
  if (!Number.isFinite(n) || n < 0 || n > 5) return "unknown";
  return Math.round(n * 100) / 100;
}

function parseCount(raw: string | undefined): number | "unknown" {
  if (!raw) return "unknown";
  const digits = raw.replace(/[^\d]/g, "");
  if (digits === "") return "unknown";
  const n = parseInt(digits, 10);
  return Number.isFinite(n) && n >= 0 ? n : "unknown";
}

function parseCommissionPct(raw: string | undefined): string | "unknown" {
  if (!raw) return "unknown";
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m?.[1]) return "unknown";
  return `${m[1].replace(",", ".")}%`;
}

function estimateCommissionVnd(
  price: number | "unknown",
  pct: string | "unknown",
): number | "unknown" {
  if (price === "unknown" || pct === "unknown") return "unknown";
  const m = pct.match(/^(\d+(?:\.\d+)?)%$/);
  if (!m?.[1]) return "unknown";
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  return Math.round((price * n) / 100);
}

function buildCandidate(block: PickBlock, blockIdx: number): ShopeeProductCandidate | null {
  const affiliateUrl = block["affiliate_url"];
  if (!affiliateUrl) {
    return null;
  }

  const c = emptyCandidate(
    "operator_manual_picks",
    `block ${blockIdx + 1} from .secrets/shopee_picks.txt`,
  );

  // Affiliate link verification (Round 3C)
  const check = validateShopeeAffiliateLink(affiliateUrl);
  c.affiliate_link_status = check.status;
  c.affiliate_link_notes = check.notes;
  c.affiliate_long_link = affiliateUrl;
  if (check.status === "VERIFIED_FROM_LONG_LINK" || check.status === "NEEDS_USER_REVIEW") {
    c.shopee_affiliate_url = affiliateUrl;
  }

  // Optional product_url (the raw / short URL operator started from)
  const productUrl = block["product_url"];
  if (productUrl) {
    c.shopee_product_url = productUrl;
    if (productUrl.startsWith("https://s.shopee.vn/")) c.short_url = productUrl;
  } else if (check.status === "VERIFIED_FROM_LONG_LINK") {
    // Derive canonical product_url from /universal-link/product/<shopid>/<itemid>
    try {
      const u = new URL(affiliateUrl);
      const m = u.pathname.match(/^\/universal-link\/product\/(\d+)\/(\d+)/);
      if (m) c.shopee_product_url = `https://shopee.vn/product/${m[1]}/${m[2]}`;
      if (m?.[2]) c.campaign_id = m[2];
    } catch {
      // ignore
    }
  }

  if (block["name"]) c.product_name = block["name"];
  c.price_vnd = parseIntegerVnd(block["price_vnd"]);
  c.commission_pct = parseCommissionPct(block["commission_pct"]);
  c.estimated_commission_vnd = estimateCommissionVnd(c.price_vnd, c.commission_pct);
  if (block["sales_count"]) c.sales_count = block["sales_count"];
  c.rating = parseRating(block["rating"]);
  c.review_count = parseCount(block["review_count"]);
  if (block["shop_name"]) c.shop_name = block["shop_name"];
  if (block["image_url"]) c.offer_image = block["image_url"];

  c.offer_type = "operator_pick";

  const unknowns = [
    c.product_name,
    c.price_vnd,
    c.commission_pct,
    c.sales_count,
    c.rating,
    c.review_count,
    c.shop_name,
  ].filter((v) => v === "unknown").length;
  c.data_confidence = unknowns <= 2 ? "high" : unknowns <= 4 ? "medium" : "low";

  const noteParts: string[] = [`operator-pick (block ${blockIdx + 1})`];
  if (block["notes"]) noteParts.push(`note: ${block["notes"]}`);
  noteParts.push(`affiliate=${check.status}`);
  noteParts.push(`${unknowns}/7 fields unknown`);
  c.extraction_notes = noteParts.join(" | ");

  return c;
}

function main(): void {
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Operator Manual Picks Loader v0               │");
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();

  if (!existsSync(PICKS_PATH)) {
    console.error(`❌ Picks file missing: ${PICKS_PATH}`);
    console.error();
    console.error("   Create the file (it's gitignored under .secrets/) with this content:");
    console.error();
    console.error(TEMPLATE);
    process.exit(1);
  }

  const content = readFileSync(PICKS_PATH, "utf-8");
  if (content.trim() === "" || !content.includes("affiliate_url:")) {
    console.error(`❌ Picks file empty or missing required key 'affiliate_url': ${PICKS_PATH}`);
    console.error("   Expected template:");
    console.error(TEMPLATE);
    process.exit(1);
  }

  const { blocks, warnings } = parsePicksFile(content);
  console.log(`📁 Parsed ${blocks.length} block(s) from ${PICKS_PATH}`);
  for (const w of warnings) console.log(`   ⚠️  ${redactSecrets(w)}`);
  console.log();

  const candidates: ShopeeProductCandidate[] = [];
  let skipped = 0;
  blocks.forEach((b, i) => {
    const c = buildCandidate(b, i);
    if (c) candidates.push(c);
    else {
      skipped++;
      console.log(`   ⚠️  Block ${i + 1} skipped — missing required key 'affiliate_url'`);
    }
  });

  const verified = candidates.filter((c) => c.affiliate_link_status === "VERIFIED_FROM_LONG_LINK").length;
  const needsReview = candidates.filter((c) => c.affiliate_link_status === "NEEDS_USER_REVIEW").length;
  const failed = candidates.filter((c) => c.affiliate_link_status === "FAILED").length;

  const overallConfidence: "high" | "medium" | "low" =
    candidates.length >= 5 && verified === candidates.length
      ? "high"
      : candidates.length >= 1
        ? "medium"
        : "low";

  const output: PicksOutput = {
    source: SOURCE_TAG,
    created_at: new Date().toISOString(),
    phase_ref: PHASE_REF,
    picks_file: PICKS_PATH,
    data_confidence: overallConfidence,
    candidate_count: candidates.length,
    candidates,
    parse_notes: `${blocks.length} block(s) read, ${candidates.length} accepted, ${skipped} skipped. Affiliate: ${verified} VERIFIED / ${needsReview} NEEDS_REVIEW / ${failed} FAILED.`,
    contains_cookie: false,
  };

  const outputJson = JSON.stringify(output, null, 2);
  if (!isSecretFree(outputJson)) {
    console.error("🛑 SECURITY GATE FAILED: Output JSON contains secret markers. Aborting.");
    process.exit(1);
  }

  if (!existsSync(dirname(OUTPUT_PATH))) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, `${outputJson}\n`, "utf-8");

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  📊 LOAD RESULT");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Output:           ${OUTPUT_PATH}`);
  console.log(`  Source:           ${SOURCE_TAG}`);
  console.log(`  Candidates:       ${candidates.length}`);
  console.log(`  Skipped blocks:   ${skipped}`);
  console.log(`  VERIFIED links:   ${verified}/${candidates.length}`);
  console.log(`  NEEDS_REVIEW:     ${needsReview}/${candidates.length}`);
  console.log(`  FAILED:           ${failed}/${candidates.length}`);
  console.log(`  Data confidence:  ${overallConfidence}`);
  console.log(`  Notes:            ${output.parse_notes}`);
  console.log();
  if (candidates.length > 0) {
    console.log("  📦 Candidates:");
    candidates.forEach((c, i) => {
      const name = typeof c.product_name === "string" ? c.product_name : String(c.product_name);
      const truncated = name.length > 70 ? `${name.slice(0, 70)}...` : name;
      const verifMark =
        c.affiliate_link_status === "VERIFIED_FROM_LONG_LINK"
          ? "✅"
          : c.affiliate_link_status === "NEEDS_USER_REVIEW"
            ? "⚠️ "
            : "❌";
      console.log(`    [${i + 1}] ${verifMark} ${truncated}`);
      console.log(`        price=${c.price_vnd}đ  commission=${c.commission_pct}  est=${c.estimated_commission_vnd}đ`);
      console.log(`        link_status=${c.affiliate_link_status}  confidence=${c.data_confidence}`);
    });
    console.log();
  }
  console.log("  🛡️  Security check:");
  console.log("     • Output JSON KHÔNG chứa cookie / token / session.");
  console.log(`     • isSecretFree(output): ${isSecretFree(outputJson) ? "✅ PASS" : "❌ FAIL"}`);
  console.log();
  console.log("  Next: pnpm shopee:select");
  console.log();
}

main();
