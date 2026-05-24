#!/usr/bin/env tsx
/**
 * VFOS Shopee Cookie Fetcher v0 — Product Item Discovery
 *
 * Uses the REAL Shopee Affiliate product offer endpoint discovered from
 * HAR analysis (Round 3A):
 *   GET https://affiliate.shopee.vn/api/v3/offer/product/list
 *
 * Unlike fetch-offers-cookie.ts (which returns category-level campaigns),
 * this fetches per-product affiliate offers with full item data:
 *   itemid, shopid, name, price_min/max, historical_sold, rating,
 *   commission_rate, long_link (affiliate URL with UTM).
 *
 * Usage:
 *   pnpm shopee:fetch-products
 *
 * Prereq:
 *   1. .secrets/shopee_cookie.txt with valid Shopee session cookie
 *   2. .secrets/ is gitignored
 *
 * Security:
 *   - Cookie read from file only — never from CLI/env/prompt
 *   - All errors/logs pass through secret-redaction
 *   - Output JSON validated secret-free before write
 *   - NEVER logs cookie / request headers
 */

import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { emptyCandidate, validateShopeeAffiliateLink } from "../src/extract.js";
import { redactSecrets, redactError, isSecretFree } from "../src/secret-redaction.js";
import type { ShopeeProductCandidate } from "../src/types.js";

// ─── Paths ───────────────────────────────────────────────────────────────────

const ROOT_DIR = resolve(import.meta.dirname ?? ".", "..", "..", "..");
const COOKIE_PATH = resolve(ROOT_DIR, ".secrets", "shopee_cookie.txt");
const OUTPUT_PATH = resolve(
  ROOT_DIR,
  "production",
  "_commerce",
  "shopee_product_candidates.json",
);

// ─── Constants ───────────────────────────────────────────────────────────────

const PRODUCT_LIST_URL = "https://affiliate.shopee.vn/api/v3/offer/product/list";
const REFERER_URL = "https://affiliate.shopee.vn/offer/product_offer";
const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 50;
const PHASE_REF = "Shopee Cookie Fetcher v0 (product-item) — 2026-05-24";

/**
 * Parse --limit=N CLI arg. Round 3D introduced this so operator can run
 * a low-limit smoke test (limit=5) before risking throttle at limit=20.
 * Clamps to [1, MAX_PAGE_LIMIT]. Falls back to DEFAULT_PAGE_LIMIT on
 * absent/invalid input — never crashes the run.
 */
function parsePageLimit(argv: string[]): number {
  for (const arg of argv) {
    const m = arg.match(/^--limit=(\d+)$/);
    if (m?.[1]) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n) && n > 0) {
        return Math.min(n, MAX_PAGE_LIMIT);
      }
    }
  }
  return DEFAULT_PAGE_LIMIT;
}

// Shopee returns prices as integer × 100000. e.g. 17556000000 = 175,560 VND.
const PRICE_DIVISOR = 100000;

// ─── Output Schema ───────────────────────────────────────────────────────────

interface ProductFetchOutput {
  source: "shopee_affiliate_product_cookie_fetcher";
  endpoint_used: string;
  created_at: string;
  phase_ref: string;
  data_confidence: "high" | "medium" | "low";
  candidate_count: number;
  candidates: ShopeeProductCandidate[];
  fetch_notes: string;
  contains_cookie: false;
  required_user_action: boolean;
  total_count?: number;
  has_more?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function safeLog(...args: unknown[]): void {
  console.log(...args.map((a) => (typeof a === "string" ? redactSecrets(a) : a)));
}

function safeError(...args: unknown[]): void {
  console.error(...args.map((a) => (typeof a === "string" ? redactSecrets(a) : a)));
}

function loadCookieFile(): string {
  if (!existsSync(COOKIE_PATH)) {
    console.error(`❌ Cookie file missing: ${COOKIE_PATH}`);
    console.error("   See packages/shopee/README.md for setup.");
    process.exit(1);
  }
  const raw = readFileSync(COOKIE_PATH, "utf-8");

  // Sanitize: cookie file may contain CRLF + multiple "Cookie:" headers
  // (e.g. user pasted multiple DevTools request blobs). Collapse to one
  // single-line "k=v; k=v" string by:
  //   1) split on any line break
  //   2) strip leading "Cookie:" / "cookie:" prefix on each line
  //   3) trim + drop empty lines
  //   4) join with "; " (the cookie pair separator)
  //   5) strip any remaining control chars (CR, LF, NUL, TAB) — these
  //      WILL crash Headers.append with "invalid header value"
  const merged = raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*cookie\s*:\s*/i, "").trim())
    .filter((line) => line.length > 0)
    .join("; ")
    .replace(/[\r\n\t\0]/g, "");

  if (merged.length === 0 || !merged.includes("=")) {
    console.error(`❌ Cookie file invalid (empty or no key=value): ${COOKIE_PATH}`);
    process.exit(1);
  }
  // De-dup: if the user pasted the same cookie blob twice, the joined
  // string contains duplicate keys — undici still accepts that but it
  // doubles the header weight. Keep first occurrence per key.
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const pair of merged.split(";")) {
    const trimmed = pair.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    if (seen.has(key)) continue;
    seen.add(key);
    dedup.push(trimmed);
  }
  const sanitized = dedup.join("; ");

  safeLog(`📁 Cookie loaded (raw ${raw.length} → sanitized ${sanitized.length} chars, ${seen.size} keys)`);
  return sanitized;
}

function extractCsrfToken(cookieStr: string): string {
  return cookieStr.match(/csrftoken=([^;\s]+)/)?.[1] ?? "";
}

async function fetchProductList(
  cookieStr: string,
  csrfToken: string,
  pageOffset: number,
  pageLimit: number,
): Promise<{ status: number; body: string; contentType: string }> {
  const url = new URL(PRODUCT_LIST_URL);
  url.searchParams.set("list_type", "0");
  url.searchParams.set("sort_type", "1");
  url.searchParams.set("page_offset", String(pageOffset));
  url.searchParams.set("page_limit", String(pageLimit));
  url.searchParams.set("client_type", "1");

  const headers: Record<string, string> = {
    Cookie: cookieStr,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br, zstd",
    Referer: REFERER_URL,
    Origin: "https://affiliate.shopee.vn",
    // Browser fingerprint headers — Shopee anti-scrape rejects requests
    // missing these (HTTP 403 with error 90309999 on rapid retries even
    // when cookie is valid).
    "sec-ch-ua": '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "x-requested-with": "XMLHttpRequest",
  };
  if (csrfToken) headers["X-CSRFToken"] = csrfToken;

  safeLog(`   → GET ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    redirect: "manual",
  });

  return {
    status: response.status,
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
  };
}

// Shopee item schema notes:
//   - prices stored as integer × 100000 (5 implied decimals)
//   - 0 = unknown; e.g. price_min "0" means actual unknown, but most items have value
function divPrice(raw: unknown): number | "unknown" {
  if (raw === undefined || raw === null) return "unknown";
  const str = String(raw).trim();
  if (str === "" || str === "0") return "unknown";
  const n = Number(str);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  return Math.round(n / PRICE_DIVISOR);
}

function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const v = obj[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const v = obj[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

/**
 * Map one raw Shopee item to ShopeeProductCandidate.
 * Outer fields: item_id, long_link, product_link, *_commission_rate.
 * Inner (batch_item_for_item_card_full): name, prices, sold, rating, image.
 */
function mapItem(item: Record<string, unknown>): ShopeeProductCandidate {
  const c = emptyCandidate(REFERER_URL, "product-item-level Shopee Affiliate offer");

  const batch = (item["batch_item_for_item_card_full"] as Record<string, unknown> | undefined) ?? {};

  // URLs (outer)
  const longLink = getString(item, "long_link");
  const productLink = getString(item, "product_link");
  if (productLink) c.shopee_product_url = productLink;
  if (longLink) c.affiliate_long_link = longLink;

  // Affiliate link verification (Round 3C)
  const linkCheck = validateShopeeAffiliateLink(longLink ?? null);
  c.affiliate_link_status = linkCheck.status;
  c.affiliate_link_notes = linkCheck.notes;
  if (linkCheck.status === "VERIFIED_FROM_LONG_LINK" && longLink) {
    c.shopee_affiliate_url = longLink;
  } else if (linkCheck.status === "NEEDS_USER_REVIEW" && longLink) {
    // Operator may still choose to use it manually after review.
    c.shopee_affiliate_url = longLink;
  }
  // FAILED / NEEDS_CUSTOM_LINK → shopee_affiliate_url stays "unknown".

  // IDs
  const itemid = getString(item, "item_id") ?? getString(batch, "itemid");
  if (itemid) c.campaign_id = itemid; // reuse field — itemid serves as discovery primary key

  // Product name (inner)
  const name = getString(batch, "name");
  if (name) c.product_name = name;

  // Price (inner, divide by 100000)
  c.price_vnd = divPrice(batch["price_min"] ?? batch["price"]);

  // Commission (outer)
  // Prefer default_commission_rate (already formatted "9%")
  const commission =
    getString(item, "default_commission_rate") ??
    getString(item, "seller_commission_rate") ??
    getString(item, "max_commission_rate");
  if (commission && commission !== "0%") c.commission_pct = commission;

  // Estimated commission
  if (typeof c.price_vnd === "number" && typeof c.commission_pct === "string") {
    const pctMatch = c.commission_pct.match(/^(\d+(?:\.\d+)?)%$/);
    const pctNum = pctMatch?.[1] ? parseFloat(pctMatch[1]) : 0;
    if (pctNum > 0) c.estimated_commission_vnd = Math.round((c.price_vnd * pctNum) / 100);
  }

  // Sales (inner) — prefer historical_sold_text for display ("5k+"), fallback to historical_sold number
  const soldText = getString(batch, "historical_sold_text");
  const soldNum = getNumber(batch, "historical_sold") ?? getNumber(batch, "sold");
  if (soldText) c.sales_count = soldText;
  else if (typeof soldNum === "number" && soldNum > 0) c.sales_count = String(soldNum);

  // Rating (inner) — item_rating.rating_star + cmt_count
  const rating = batch["item_rating"];
  if (rating && typeof rating === "object") {
    const r = rating as Record<string, unknown>;
    const star = getNumber(r, "rating_star");
    if (typeof star === "number" && star >= 0 && star <= 5) {
      c.rating = Math.round(star * 100) / 100; // 2 decimals
    }
  }
  const cmtCount = getNumber(batch, "cmt_count");
  if (typeof cmtCount === "number" && cmtCount >= 0) c.review_count = cmtCount;

  // shop_name — NOT present in item; remains "unknown"
  // (only shopid is available; resolving shop_name needs a separate API call)

  // Image (inner)
  const image = getString(batch, "image");
  if (image) {
    // Shopee CDN base
    c.offer_image = `https://down-vn.img.susercontent.com/file/${image}`;
  }

  // Period (inner ctime)
  const ctime = getNumber(batch, "ctime");
  if (ctime && ctime > 0) c.period_start = new Date(ctime * 1000).toISOString();

  // Confidence
  const unknownCount = [
    c.product_name,
    c.price_vnd,
    c.commission_pct,
    c.sales_count,
    c.rating,
    c.review_count,
  ].filter((v) => v === "unknown").length;
  c.data_confidence = unknownCount <= 1 ? "high" : unknownCount <= 3 ? "medium" : "low";

  c.extraction_notes = `product-item from /api/v3/offer/product/list. shop_name=unknown (not in item schema). ${unknownCount}/6 critical fields unknown.`;

  c.offer_type = "product_item";

  return c;
}

interface ParsedList {
  candidates: ShopeeProductCandidate[];
  totalCount: number;
  hasMore: boolean;
  error: string | null;
}

function parseProductList(body: string, pageLimit: number): ParsedList {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body);
  } catch {
    return { candidates: [], totalCount: 0, hasMore: false, error: "Response is not valid JSON" };
  }

  const code = json["code"];
  if (code !== 0 && code !== "0" && code !== undefined) {
    const msg = json["msg"] ?? json["message"] ?? "";
    return {
      candidates: [],
      totalCount: 0,
      hasMore: false,
      error: `API error code=${code}, msg=${redactSecrets(String(msg))}`,
    };
  }

  const data = json["data"] as Record<string, unknown> | undefined;
  if (!data) {
    return {
      candidates: [],
      totalCount: 0,
      hasMore: false,
      error: `No 'data' field. Top keys: ${Object.keys(json).join(", ")}`,
    };
  }

  const totalCount = typeof data["total_count"] === "number" ? data["total_count"] : 0;
  const pageOffset = typeof data["page_offset"] === "number" ? data["page_offset"] : 0;
  const respPageLimit = typeof data["page_limit"] === "number" ? data["page_limit"] : pageLimit;
  const hasMore = pageOffset + respPageLimit < totalCount;

  const list = data["list"];
  if (!Array.isArray(list)) {
    return {
      candidates: [],
      totalCount,
      hasMore,
      error: `'data.list' is not array. Keys: ${Object.keys(data).join(", ")}`,
    };
  }

  if (list.length === 0) {
    return { candidates: [], totalCount, hasMore, error: "data.list is empty" };
  }

  const candidates: ShopeeProductCandidate[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    candidates.push(mapItem(item as Record<string, unknown>));
  }
  return { candidates, totalCount, hasMore, error: null };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("┌──────────────────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Product Item Cookie Fetcher (Real API)        │");
  console.log("└──────────────────────────────────────────────────────────────┘");
  console.log();

  const pageLimit = parsePageLimit(process.argv.slice(2));

  const cookieStr = loadCookieFile();
  const csrfToken = extractCsrfToken(cookieStr);
  safeLog(`   csrftoken present: ${csrfToken ? "yes" : "no"}`);
  safeLog(`   page_limit: ${pageLimit}${pageLimit === DEFAULT_PAGE_LIMIT ? " (default)" : " (CLI override)"}`);
  console.log();

  let candidates: ShopeeProductCandidate[] = [];
  let requiredUserAction = false;
  let fetchNotes = "";
  let totalCount = 0;
  let hasMore = false;
  let endpointUsed = "none";

  safeLog("🔎 Calling Shopee Affiliate Product List API...");
  safeLog(`   Endpoint: GET /api/v3/offer/product/list`);
  console.log();

  try {
    const { status, body, contentType } = await fetchProductList(cookieStr, csrfToken, 0, pageLimit);
    safeLog(`   Status: ${status}    Content-Type: ${contentType}    Body length: ${body.length}`);

    if (status === 401 || status === 403) {
      requiredUserAction = true;
      const bodyPreview = body.length > 0 ? redactSecrets(body.slice(0, 256)) : "(empty body)";
      fetchNotes = `HTTP ${status} — cookie expired or invalid. Refresh .secrets/shopee_cookie.txt. Body: ${bodyPreview}`;
      safeLog(`   ⚠️  ${fetchNotes}`);
    } else if (status === 301 || status === 302) {
      requiredUserAction = true;
      fetchNotes = `HTTP ${status} redirect — session expired. Refresh cookie.`;
      safeLog(`   ⚠️  ${fetchNotes}`);
    } else if (status === 429) {
      requiredUserAction = true;
      fetchNotes = "Rate limited (429). Wait and retry.";
      safeLog(`   ⚠️  ${fetchNotes}`);
    } else if (status >= 500) {
      fetchNotes = `Server error HTTP ${status}. Retry later.`;
      safeLog(`   ⚠️  ${fetchNotes}`);
    } else if (status === 200 && (contentType.includes("json") || body.trimStart().startsWith("{"))) {
      const result = parseProductList(body, pageLimit);
      totalCount = result.totalCount;
      hasMore = result.hasMore;
      if (result.error) {
        fetchNotes = result.error;
        safeLog(`   ⚠️  ${result.error}`);
      }
      if (result.candidates.length > 0) {
        candidates = result.candidates;
        endpointUsed = "api/v3/offer/product/list";
        fetchNotes = `Extracted ${candidates.length} products (total_count=${totalCount}, has_more=${hasMore}).`;
        safeLog(`   ✅ ${fetchNotes}`);
      } else if (!result.error) {
        fetchNotes = "API OK but no products returned.";
      }
    } else if (status === 200) {
      const isLogin = body.includes("/login") || body.includes("đăng nhập");
      if (isLogin) {
        requiredUserAction = true;
        fetchNotes = "Login page returned (HTML). Cookie invalid.";
      } else {
        fetchNotes = "Unexpected HTML response (not JSON).";
      }
      safeLog(`   ⚠️  ${fetchNotes}`);
    } else {
      fetchNotes = `Unexpected HTTP ${status}.`;
      safeLog(`   ⚠️  ${fetchNotes}`);
    }
  } catch (err: unknown) {
    const safe = redactError(err);
    safeError(`   ❌ Fetch error: ${safe.message}`);
    fetchNotes = `Fetch error: ${safe.message}`;
  }

  const overallConfidence: "high" | "medium" | "low" =
    candidates.length >= 5
      ? "high"
      : candidates.length >= 1
        ? "medium"
        : "low";

  const output: ProductFetchOutput = {
    source: "shopee_affiliate_product_cookie_fetcher",
    endpoint_used: endpointUsed,
    created_at: new Date().toISOString(),
    phase_ref: PHASE_REF,
    data_confidence: overallConfidence,
    candidate_count: candidates.length,
    candidates,
    fetch_notes: fetchNotes || "OK",
    contains_cookie: false,
    required_user_action: requiredUserAction,
    total_count: totalCount,
    has_more: hasMore,
  };

  const outputJson = JSON.stringify(output, null, 2);
  if (!isSecretFree(outputJson)) {
    console.error("🛑 SECURITY GATE FAILED: Output JSON contains secret markers!");
    console.error("   Aborting write.");
    process.exit(1);
  }

  if (!existsSync(dirname(OUTPUT_PATH))) {
    mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  }
  // Never overwrite a good result with an empty/error result. Shopee
  // throttles affiliate API (error 90309999 on rapid retries) — a 403 from
  // a follow-up call would otherwise clobber the 20 products we just got.
  // The error log file keeps the latest failure visible without losing data.
  let overwrote = true;
  if (candidates.length === 0 && existsSync(OUTPUT_PATH)) {
    const errorLogPath = OUTPUT_PATH.replace(/\.json$/, ".last_error.json");
    writeFileSync(errorLogPath, `${outputJson}\n`, "utf-8");
    overwrote = false;
    console.log(`  ℹ️  Kept existing ${OUTPUT_PATH} (had data). Error logged: ${errorLogPath}`);
  } else {
    writeFileSync(OUTPUT_PATH, `${outputJson}\n`, "utf-8");
  }
  void overwrote;

  console.log();
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("  📊 FETCH RESULT");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`  Output:              ${OUTPUT_PATH}`);
  console.log(`  Endpoint used:       ${endpointUsed}`);
  console.log(`  Candidates found:    ${candidates.length}`);
  console.log(`  Total on server:     ${totalCount}`);
  console.log(`  Has more pages:      ${hasMore}`);
  console.log(`  Data confidence:     ${overallConfidence}`);
  console.log(`  User action needed:  ${requiredUserAction}`);
  console.log(`  Notes:               ${fetchNotes}`);
  console.log();

  if (candidates.length > 0) {
    console.log("  📦 Top 5 products (preview):");
    for (let i = 0; i < Math.min(5, candidates.length); i++) {
      const c = candidates[i]!;
      const name = typeof c.product_name === "string" ? c.product_name : String(c.product_name);
      const truncated = name.length > 70 ? `${name.slice(0, 70)}...` : name;
      console.log(`    [${i + 1}] ${truncated}`);
      console.log(`        price=${c.price_vnd} VND  commission=${c.commission_pct}  sales=${c.sales_count}  rating=${c.rating}/5  reviews=${c.review_count}`);
      console.log(`        confidence=${c.data_confidence}`);
    }
    console.log();
  }

  console.log("  🛡️  Security check:");
  console.log("     • Output JSON KHÔNG chứa cookie / token / session.");
  console.log(`     • isSecretFree(output): ${isSecretFree(outputJson) ? "✅ PASS" : "❌ FAIL"}`);
  if (requiredUserAction) {
    console.log();
    console.log("  ⚠️  ACTION REQUIRED: refresh .secrets/shopee_cookie.txt");
  }
  console.log();
}

main().catch((err: unknown) => {
  const safe = redactError(err);
  console.error("❌ Unexpected:", safe.message);
  process.exit(1);
});
