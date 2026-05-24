#!/usr/bin/env tsx
/**
 * VFOS Shopee Product Selection v0
 *
 * Reads `production/_commerce/shopee_product_candidates.json` and produces
 * `production/_commerce/shopee_product_selection_report.json` with a
 * deterministic 6-axis score per candidate plus a winner decision.
 *
 * Six axes (each 0–3, total 0–17):
 *   1. demo_clarity            — proxy: rating × review_count
 *   2. shopee_affiliate_potential — proxy: estimated_commission_vnd
 *   3. visual_appeal           — proxy: has offer_image (0 or 2)
 *   4. vn_audience_fit         — proxy: VN mass-market price band
 *   5. source_demo_availability — conservative default 1 (operator must verify)
 *   6. risk_level              — inverse: shop unknown / low review = 0
 *
 * Winner selection:
 *   - Must be in top-N by total AND have affiliate_link_status ∈
 *     {VERIFIED_FROM_LONG_LINK, GENERATED_BY_CUSTOM_LINK}.
 *   - If best score < 10 OR no verified candidate → decision =
 *     PRODUCT_NEEDS_USER_REVIEW (no winner emitted).
 *   - If no candidates → decision = NO_CANDIDATES.
 *
 * Heuristic only — Shopee Product Agent (LLM) may override later.
 *
 * Usage:
 *   pnpm shopee:select
 */

import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { isSecretFree } from "../src/secret-redaction.js";
import type { ShopeeProductCandidate, AffiliateLinkStatus } from "../src/types.js";

const ROOT_DIR = resolve(import.meta.dirname ?? ".", "..", "..", "..");
const INPUT_PATH = resolve(ROOT_DIR, "production", "_commerce", "shopee_product_candidates.json");
const OUTPUT_PATH = resolve(ROOT_DIR, "production", "_commerce", "shopee_product_selection_report.json");

type AxisScore = { score: 0 | 1 | 2 | 3; note: string };

interface CandidateScore {
  rank: number;
  item_id: string | "unknown";
  product_name: string | "unknown";
  shopee_product_url: string | "unknown";
  shopee_affiliate_url: string | "unknown";
  affiliate_link_status: AffiliateLinkStatus;
  price_vnd: number | "unknown";
  commission_pct: string | "unknown";
  estimated_commission_vnd: number | "unknown";
  sales_count: string | "unknown";
  rating: number | "unknown";
  review_count: number | "unknown";
  shop_name: string | "unknown";
  axes: {
    demo_clarity: AxisScore;
    shopee_affiliate_potential: AxisScore;
    visual_appeal: AxisScore;
    vn_audience_fit: AxisScore;
    source_demo_availability: AxisScore;
    risk_level: AxisScore;
  };
  total: number;
  flags: string[];
}

interface SelectionReport {
  source: "shopee_product_selection_v0";
  created_at: string;
  phase_ref: string;
  input_file: string;
  candidates_evaluated: number;
  candidates_verified: number;
  decision: "PRODUCT_SELECTED" | "PRODUCT_NEEDS_USER_REVIEW" | "NO_CANDIDATES";
  decision_reason: string;
  winner: CandidateScore | null;
  top5: CandidateScore[];
  all_scored: CandidateScore[];
}

const MIN_WINNER_SCORE = 10;
const VERIFIED_STATUSES: AffiliateLinkStatus[] = ["VERIFIED_FROM_LONG_LINK", "GENERATED_BY_CUSTOM_LINK"];

function scoreDemoClarity(c: ShopeeProductCandidate): AxisScore {
  const reviews = typeof c.review_count === "number" ? c.review_count : 0;
  const rating = typeof c.rating === "number" ? c.rating : 0;
  if (reviews >= 1000 && rating >= 4.5) return { score: 3, note: `${reviews} reviews @ ${rating} — strong social proof` };
  if (reviews >= 100 && rating >= 4.3) return { score: 2, note: `${reviews} reviews @ ${rating}` };
  if (reviews >= 10) return { score: 1, note: `${reviews} reviews — modest sample` };
  return { score: 0, note: `${reviews} reviews — insufficient signal` };
}

function scoreAffiliatePotential(c: ShopeeProductCandidate): AxisScore {
  const est = typeof c.estimated_commission_vnd === "number" ? c.estimated_commission_vnd : 0;
  if (est >= 10000) return { score: 3, note: `~${est.toLocaleString("vi-VN")}đ per sale` };
  if (est >= 5000) return { score: 2, note: `~${est.toLocaleString("vi-VN")}đ per sale` };
  if (est >= 1000) return { score: 1, note: `~${est.toLocaleString("vi-VN")}đ per sale` };
  return { score: 0, note: est > 0 ? `only ~${est}đ per sale` : "no commission estimate" };
}

function scoreVisualAppeal(c: ShopeeProductCandidate): AxisScore {
  if (c.offer_image && c.offer_image.startsWith("http")) {
    return { score: 2, note: "offer_image present (CDN)" };
  }
  return { score: 0, note: "no offer_image" };
}

function scoreVnAudienceFit(c: ShopeeProductCandidate): AxisScore {
  if (typeof c.price_vnd !== "number") return { score: 0, note: "price unknown" };
  const p = c.price_vnd;
  if (p >= 20000 && p <= 200000) return { score: 3, note: `${p.toLocaleString("vi-VN")}đ — VN mass-market sweet spot` };
  if (p >= 5000 && p <= 500000) return { score: 2, note: `${p.toLocaleString("vi-VN")}đ — acceptable VN range` };
  if (p >= 1000 && p <= 1000000) return { score: 1, note: `${p.toLocaleString("vi-VN")}đ — edge of VN affordability` };
  return { score: 0, note: `${p.toLocaleString("vi-VN")}đ — outside typical VN reup band` };
}

function scoreSourceDemoAvailability(_c: ShopeeProductCandidate): AxisScore {
  return { score: 1, note: "default — operator must verify YouTube/TikTok demo availability" };
}

function scoreRiskLevel(c: ShopeeProductCandidate): AxisScore {
  const reviews = typeof c.review_count === "number" ? c.review_count : 0;
  const rating = typeof c.rating === "number" ? c.rating : 0;
  const shopKnown = c.shop_name !== "unknown" && c.shop_name.length > 0;
  if (!shopKnown && reviews < 10) return { score: 0, note: "shop unknown + reviews < 10 — high risk" };
  if (rating > 0 && rating < 4.0) return { score: 1, note: `rating ${rating} < 4.0 — caution` };
  if (reviews > 5000 && rating >= 4.5) return { score: 3, note: `reviews ${reviews}, rating ${rating} — low risk` };
  return { score: 2, note: "acceptable risk profile" };
}

function flagsFor(c: ShopeeProductCandidate): string[] {
  const f: string[] = [];
  if (c.shop_name === "unknown") f.push("shop_name_unknown");
  if (c.review_count === "unknown" || (typeof c.review_count === "number" && c.review_count < 10)) f.push("low_reviews");
  if (typeof c.rating === "number" && c.rating > 0 && c.rating < 4.0) f.push("low_rating");
  if (c.affiliate_link_status !== "VERIFIED_FROM_LONG_LINK" && c.affiliate_link_status !== "GENERATED_BY_CUSTOM_LINK") {
    f.push("affiliate_link_not_verified");
  }
  return f;
}

function scoreCandidate(c: ShopeeProductCandidate, rank: number): CandidateScore {
  const axes = {
    demo_clarity: scoreDemoClarity(c),
    shopee_affiliate_potential: scoreAffiliatePotential(c),
    visual_appeal: scoreVisualAppeal(c),
    vn_audience_fit: scoreVnAudienceFit(c),
    source_demo_availability: scoreSourceDemoAvailability(c),
    risk_level: scoreRiskLevel(c),
  };
  const total = Object.values(axes).reduce((sum, a) => sum + a.score, 0);
  return {
    rank,
    item_id: c.campaign_id ?? "unknown",
    product_name: c.product_name,
    shopee_product_url: c.shopee_product_url,
    shopee_affiliate_url: c.shopee_affiliate_url,
    affiliate_link_status: c.affiliate_link_status,
    price_vnd: c.price_vnd,
    commission_pct: c.commission_pct,
    estimated_commission_vnd: c.estimated_commission_vnd,
    sales_count: c.sales_count,
    rating: c.rating,
    review_count: c.review_count,
    shop_name: c.shop_name,
    axes,
    total,
    flags: flagsFor(c),
  };
}

function main(): void {
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Product Selection Scoring v0                  │");
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();

  if (!existsSync(INPUT_PATH)) {
    console.error(`❌ Input missing: ${INPUT_PATH}`);
    console.error("   Run `pnpm shopee:fetch-products` first.");
    process.exit(1);
  }

  const raw = readFileSync(INPUT_PATH, "utf-8");
  const fetchOutput = JSON.parse(raw) as { candidates: ShopeeProductCandidate[]; candidate_count: number };
  const candidates = fetchOutput.candidates ?? [];

  console.log(`📥 Loaded ${candidates.length} candidates from ${INPUT_PATH}`);
  console.log();

  if (candidates.length === 0) {
    const report: SelectionReport = {
      source: "shopee_product_selection_v0",
      created_at: new Date().toISOString(),
      phase_ref: "Round 3D Shopee Product Selection v0 — 2026-05-24",
      input_file: INPUT_PATH,
      candidates_evaluated: 0,
      candidates_verified: 0,
      decision: "NO_CANDIDATES",
      decision_reason: "Input file has 0 candidates. Likely Shopee fetch failed (403/throttle).",
      winner: null,
      top5: [],
      all_scored: [],
    };
    writeReport(report);
    return;
  }

  // Score + sort
  const scored = candidates.map((c, i) => scoreCandidate(c, i + 1));
  scored.sort((a, b) => b.total - a.total);
  // Re-rank by sorted order
  scored.forEach((c, i) => { c.rank = i + 1; });

  const verified = scored.filter((c) => VERIFIED_STATUSES.includes(c.affiliate_link_status));
  const top5 = scored.slice(0, 5);

  let decision: SelectionReport["decision"];
  let reason: string;
  let winner: CandidateScore | null = null;

  if (verified.length === 0) {
    decision = "PRODUCT_NEEDS_USER_REVIEW";
    reason = `0/${scored.length} candidates have a VERIFIED affiliate link. Operator must wrap a link manually.`;
  } else {
    const best = verified[0]!; // top-scoring verified
    if (best.total >= MIN_WINNER_SCORE) {
      decision = "PRODUCT_SELECTED";
      winner = best;
      reason = `Winner: top-scoring verified candidate (total=${best.total}/17 ≥ ${MIN_WINNER_SCORE}).`;
    } else {
      decision = "PRODUCT_NEEDS_USER_REVIEW";
      reason = `Best verified candidate scored ${best.total}/17 < ${MIN_WINNER_SCORE} threshold. Manual review required.`;
    }
  }

  const report: SelectionReport = {
    source: "shopee_product_selection_v0",
    created_at: new Date().toISOString(),
    phase_ref: "Round 3D Shopee Product Selection v0 — 2026-05-24",
    input_file: INPUT_PATH,
    candidates_evaluated: scored.length,
    candidates_verified: verified.length,
    decision,
    decision_reason: reason,
    winner,
    top5,
    all_scored: scored,
  };

  writeReport(report);

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  📊 SELECTION RESULT");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Candidates:       ${scored.length}`);
  console.log(`  Verified link:    ${verified.length}/${scored.length}`);
  console.log(`  Decision:         ${decision}`);
  console.log(`  Reason:           ${reason}`);
  console.log();
  console.log("  🥇 Top 5 by score:");
  for (const c of top5) {
    const name = typeof c.product_name === "string" ? c.product_name : String(c.product_name);
    const truncated = name.length > 60 ? `${name.slice(0, 60)}...` : name;
    const verifMark = VERIFIED_STATUSES.includes(c.affiliate_link_status) ? "✅" : "⚠️ ";
    console.log(`    #${c.rank} [${c.total}/17] ${verifMark}${truncated}`);
    console.log(`        price=${c.price_vnd} commission=${c.commission_pct} est=${c.estimated_commission_vnd}đ`);
    console.log(`        link_status=${c.affiliate_link_status}  flags=[${c.flags.join(", ") || "none"}]`);
  }
  console.log();
  if (winner) {
    console.log("  🏆 WINNER:");
    console.log(`     name: ${winner.product_name}`);
    console.log(`     url:  ${winner.shopee_affiliate_url}`);
    console.log(`     total: ${winner.total}/17`);
  } else {
    console.log("  🛑 NO WINNER selected. Operator review required.");
  }
}

function writeReport(report: SelectionReport): void {
  const json = JSON.stringify(report, null, 2);
  if (!isSecretFree(json)) {
    console.error("🛑 SECURITY GATE FAILED: Selection report contains secret markers. Aborting.");
    process.exit(1);
  }
  if (!existsSync(dirname(OUTPUT_PATH))) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, `${json}\n`, "utf-8");
  console.log(`📤 Wrote ${OUTPUT_PATH}`);
}

main();
