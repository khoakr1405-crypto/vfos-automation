#!/usr/bin/env tsx

/**
 * 🚫 DEPRECATED — Legacy Shopee HAR-based long_link inspection utility.
 *
 * Reads .secrets/shopee_product_offer.har and reports long_link patterns.
 * Used during Round 3A endpoint discovery. Replaced by CDP targeted-click
 * flow (Round 26B+) — no HAR analysis in active path.
 *
 * Kept as REFERENCE-ONLY. Do NOT auto-trigger from /chay or commerce intake
 * orchestrator. Do NOT run unless Operator explicitly authorizes AND a fresh
 * HAR is provided.
 *
 * See: docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md Phần 22–23, SKILL.md
 * line ~1109 (Round 26B audit decision matrix).
 */

/**
 * Inspect long_link patterns across all 20 items in HAR's product list.
 * NEVER prints cookies. Output: pattern stats + 3 sample URLs (truncated).
 */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";

const HAR = resolve(import.meta.dirname ?? ".", "..", "..", "..", ".secrets", "shopee_product_offer.har");

interface HarEntry {
  request: { method: string; url: string };
  response: { content?: { text?: string } };
}

const har = JSON.parse(readFileSync(HAR, "utf-8")) as { log: { entries: HarEntry[] } };
const entry = har.log.entries.find((e) =>
  e.request.url.includes("/api/v3/offer/product/list") && e.request.method === "GET",
);

if (!entry?.response.content?.text) {
  console.error("Endpoint not found in HAR");
  process.exit(1);
}

const body = JSON.parse(entry.response.content.text) as Record<string, unknown>;
const data = body["data"] as Record<string, unknown>;
const list = data["list"] as Array<Record<string, unknown>>;

console.log(`Total items: ${list.length}`);
console.log();

let withLongLink = 0;
let withProductLink = 0;
let universalLinkCount = 0;
let utmSourceAffiliateCount = 0;
let gadsSigCount = 0;
const utmSources = new Set<string>();
const domains = new Set<string>();

for (const item of list) {
  const longLink = item["long_link"];
  const productLink = item["product_link"];
  if (typeof longLink === "string" && longLink.length > 0) {
    withLongLink++;
    try {
      const u = new URL(longLink);
      domains.add(u.hostname);
      if (u.pathname.startsWith("/universal-link/")) universalLinkCount++;
      const utmSource = u.searchParams.get("utm_source") ?? "";
      const utmMedium = u.searchParams.get("utm_medium") ?? "";
      if (utmMedium === "affiliates") utmSourceAffiliateCount++;
      // collect utm_source pattern (mask the numeric id)
      const masked = utmSource.replace(/an_\d+/, "an_<AFFID>");
      utmSources.add(masked);
      if (u.searchParams.has("gads_t_sig")) gadsSigCount++;
    } catch {
      // bad URL
    }
  }
  if (typeof productLink === "string" && productLink.length > 0) withProductLink++;
}

console.log("Long link presence:");
console.log(`   with long_link:    ${withLongLink}/${list.length}`);
console.log(`   with product_link: ${withProductLink}/${list.length}`);
console.log();
console.log("Long link patterns:");
console.log(`   /universal-link/ path:           ${universalLinkCount}/${withLongLink}`);
console.log(`   utm_medium=affiliates:           ${utmSourceAffiliateCount}/${withLongLink}`);
console.log(`   gads_t_sig param (tracking sig): ${gadsSigCount}/${withLongLink}`);
console.log(`   domains seen:                    ${[...domains].join(", ")}`);
console.log(`   utm_source patterns:             ${[...utmSources].join(" | ")}`);
console.log();
console.log("Sample long links (first 3, query params truncated to keep tokens out):");
let printed = 0;
for (const item of list) {
  if (printed >= 3) break;
  const longLink = item["long_link"];
  if (typeof longLink !== "string") continue;
  try {
    const u = new URL(longLink);
    // Show: origin + path + key params, but truncate signature
    const sigParam = u.searchParams.get("gads_t_sig") ?? "";
    const utmSource = u.searchParams.get("utm_source") ?? "";
    const utmMedium = u.searchParams.get("utm_medium") ?? "";
    const sigPreview = sigParam.length > 0 ? `${sigParam.slice(0, 12)}...(${sigParam.length} chars)` : "(none)";
    console.log(`   [${printed + 1}] ${u.origin}${u.pathname}`);
    console.log(`        gads_t_sig=${sigPreview}`);
    console.log(`        utm_source=${utmSource}  utm_medium=${utmMedium}`);
    printed++;
  } catch {
    // skip
  }
}

console.log();
console.log("Sample product_link (first 3):");
let p = 0;
for (const item of list) {
  if (p >= 3) break;
  const productLink = item["product_link"];
  if (typeof productLink !== "string") continue;
  console.log(`   [${p + 1}] ${productLink}`);
  p++;
}
