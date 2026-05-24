#!/usr/bin/env tsx
/**
 * VFOS Shopee Cookie Fetcher v0 — HTTP-based product candidate extraction
 *
 * This script replaces the Playwright-based approach (which Shopee detects)
 * with plain HTTP requests using raw cookies from a local file.
 *
 * Usage:
 *   pnpm shopee:fetch-cookie
 *
 * Prereq:
 *   1. Create `.secrets/shopee_cookie.txt` containing your Shopee cookie string.
 *      (Get it from browser DevTools → Network → copy Cookie header value)
 *   2. File must NOT be committed — `.secrets/` is gitignored.
 *
 * What this does:
 *   1. Reads `.secrets/shopee_cookie.txt` (local-only, gitignored).
 *   2. Validates file exists + cookie appears non-empty (NEVER prints content).
 *   3. Sends HTTP GET to Shopee Affiliate offer API endpoints.
 *   4. If API returns product data → parses into candidates.
 *   5. If API returns HTML shell / captcha / 403 → reports blocker clearly.
 *   6. Writes `production/_commerce/shopee_product_candidates.json`
 *      (ZERO cookies/tokens — only public product data).
 *
 * Security:
 *   - Cookie read from file only — NEVER from CLI args, env vars, or prompt.
 *   - All errors/logs pass through secret-redaction before printing.
 *   - Output JSON is validated to contain NO secret markers.
 *   - Script does NOT bypass captcha / anti-bot. If blocked → STOP + report.
 *   - NO console.log of cookie values. NO logging of request headers.
 */

import { resolve, dirname } from "node:path";
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import {
  parsePriceVnd,
  parseCommissionPct,
  estimateCommissionVnd,
  computeDataConfidence,
  emptyCandidate,
} from "../src/extract.js";
import { redactSecrets, redactError, isSecretFree } from "../src/secret-redaction.js";
import type {
  ShopeeProductCandidate,
} from "../src/types.js";

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

const OFFER_PAGE_URL = "https://affiliate.shopee.vn/offer/shopee_offer";
const MAX_CANDIDATES = 10;
const PHASE_REF = "Shopee Cookie Fetcher v0 — 2026-05-24";

/**
 * Known Shopee Affiliate API endpoints (discovered from SPA network traffic).
 * We try these in order. If one works, we use its response.
 */
const API_ENDPOINTS = [
  // Shopee Affiliate offer list API (XHR from SPA)
  {
    name: "affiliate_offer_list",
    url: "https://affiliate.shopee.vn/api/v3/offer/shopee_offer/list",
    method: "POST" as const,
    body: JSON.stringify({
      page: 1,
      page_size: MAX_CANDIDATES,
      sort_type: 1,
      keyword: "",
    }),
    contentType: "application/json",
  },
  // Alternative: older V2 API
  {
    name: "affiliate_offer_list_v2",
    url: "https://affiliate.shopee.vn/api/v2/offer/shopee_offer/list",
    method: "POST" as const,
    body: JSON.stringify({
      page: 1,
      page_size: MAX_CANDIDATES,
      sort_type: 1,
    }),
    contentType: "application/json",
  },
  // Fallback: GET the offer page itself (will return HTML)
  {
    name: "affiliate_offer_page_html",
    url: OFFER_PAGE_URL,
    method: "GET" as const,
    body: undefined,
    contentType: undefined,
  },
] as const;

// ─── Output Schema ───────────────────────────────────────────────────────────

interface CookieFetchOutput {
  source: "shopee_affiliate_cookie_fetcher";
  created_at: string;
  phase_ref: string;
  data_confidence: "high" | "medium" | "low";
  candidate_count: number;
  candidates: ShopeeProductCandidate[];
  fetch_notes: string;
  contains_cookie: false;
  endpoint_used: string;
  required_user_action: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Safe log: redact any secrets that might leak through error messages. */
function safeLog(...args: unknown[]): void {
  const redacted = args.map((a) =>
    typeof a === "string" ? redactSecrets(a) : a,
  );
  console.log(...redacted);
}

function safeError(...args: unknown[]): void {
  const redacted = args.map((a) =>
    typeof a === "string" ? redactSecrets(a) : a,
  );
  console.error(...redacted);
}

/**
 * Read and validate cookie file.
 * Returns trimmed cookie string. NEVER logs the content.
 */
function loadCookieFile(): string {
  if (!existsSync(COOKIE_PATH)) {
    console.error("❌ Cookie file không tồn tại:");
    console.error(`   ${COOKIE_PATH}`);
    console.error();
    console.error("   → Tạo file này với nội dung cookie từ browser DevTools:");
    console.error("     1. Mở https://affiliate.shopee.vn trong Chrome/Edge");
    console.error("     2. Login tài khoản Shopee Affiliate");
    console.error("     3. Mở DevTools (F12) → Network tab");
    console.error("     4. Reload page, click bất kỳ XHR request nào");
    console.error("     5. Copy giá trị Cookie header (không bao gồm 'Cookie: ')");
    console.error(`     6. Paste vào file: .secrets/shopee_cookie.txt`);
    console.error();
    console.error("   ⚠️  KHÔNG commit file này. .secrets/ đã gitignored.");
    process.exit(1);
  }

  const raw = readFileSync(COOKIE_PATH, "utf-8").trim();

  if (raw.length === 0) {
    console.error("❌ Cookie file rỗng.");
    console.error(`   ${COOKIE_PATH}`);
    console.error("   → Paste cookie string vào file này.");
    process.exit(1);
  }

  // Basic sanity: cookie should contain at least one key=value pair
  if (!raw.includes("=")) {
    console.error("❌ Cookie file có vẻ không hợp lệ (không chứa key=value pair).");
    console.error("   → Kiểm tra lại nội dung file.");
    process.exit(1);
  }

  // Log only metadata — NEVER the cookie itself
  safeLog(`📁 Cookie file loaded: ${COOKIE_PATH}`);
  safeLog(`   Length: ${raw.length} chars`);
  safeLog(
    `   Contains SPC_EC: ${raw.includes("SPC_EC") ? "yes" : "no"}`,
  );
  safeLog(
    `   Contains csrftoken: ${raw.includes("csrftoken") ? "yes" : "no"}`,
  );

  return raw;
}

/**
 * Extract csrftoken from cookie string for X-CSRFToken header.
 * Returns empty string if not found. NEVER logs the value.
 */
function extractCsrfToken(cookieStr: string): string {
  const match = cookieStr.match(/csrftoken=([^;\s]+)/);
  return match?.[1] ?? "";
}

/**
 * Make an HTTP request with the cookie.
 * Returns { status, body, contentType }.
 * NEVER logs headers or cookie values.
 */
async function fetchWithCookie(
  endpoint: (typeof API_ENDPOINTS)[number],
  cookieStr: string,
  csrfToken: string,
): Promise<{ status: number; body: string; contentType: string }> {
  const headers: Record<string, string> = {
    Cookie: cookieStr,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
    Accept: "application/json, text/plain, */*",
    "Accept-Language": "vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7",
    Referer: OFFER_PAGE_URL,
    Origin: "https://affiliate.shopee.vn",
  };

  if (csrfToken) {
    headers["X-CSRFToken"] = csrfToken;
  }

  if (endpoint.contentType) {
    headers["Content-Type"] = endpoint.contentType;
  }

  // Log endpoint (NO headers, NO cookie)
  safeLog(`   → ${endpoint.method} ${endpoint.url}`);

  const fetchOptions: RequestInit = {
    method: endpoint.method,
    headers,
    redirect: "manual", // Don't follow redirects — detect login wall
  };

  if (endpoint.body) {
    fetchOptions.body = endpoint.body;
  }

  const response = await fetch(endpoint.url, fetchOptions);
  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  return {
    status: response.status,
    body,
    contentType,
  };
}

/**
 * Try to parse JSON API response into product candidates.
 * Returns array of candidates (may be empty).
 */
function parseApiResponse(body: string, endpointName: string): ShopeeProductCandidate[] {
  const candidates: ShopeeProductCandidate[] = [];

  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body);
  } catch {
    return candidates; // Not JSON — caller handles
  }

  // Shopee API typically wraps data in { code, data: { list: [...] } }
  // or { error, data: { offers: [...] } }
  const code = json["code"] ?? json["error"] ?? json["err_code"];
  if (code !== undefined && code !== 0 && code !== "0") {
    safeLog(`   ⚠️  API returned error code: ${code}`);
    const msg = json["message"] ?? json["msg"] ?? json["error_msg"];
    if (msg) safeLog(`   ⚠️  Message: ${redactSecrets(String(msg))}`);
    return candidates;
  }

  // Navigate to the list of items
  const data = json["data"] as Record<string, unknown> | undefined;
  if (!data) return candidates;

  // Try common shapes: data.list, data.offers, data.items, data.products
  const listKeys = ["list", "offers", "items", "products", "offer_list"];
  let items: unknown[] | null = null;
  for (const key of listKeys) {
    if (Array.isArray(data[key])) {
      items = data[key] as unknown[];
      safeLog(`   📦 Found ${items.length} items at data.${key}`);
      break;
    }
  }

  if (!items || items.length === 0) {
    // Maybe data itself is an array
    if (Array.isArray(data)) {
      items = data;
      safeLog(`   📦 Found ${items.length} items at data (array)`);
    } else {
      safeLog("   ⚠️  Could not locate items array in API response");
      safeLog(`   Available keys in data: ${Object.keys(data).join(", ")}`);
      return candidates;
    }
  }

  // Parse each item
  for (let i = 0; i < Math.min(items.length, MAX_CANDIDATES); i++) {
    const item = items[i] as Record<string, unknown> | undefined;
    if (!item || typeof item !== "object") continue;

    const c = emptyCandidate(OFFER_PAGE_URL, `API response from ${endpointName}`);

    // Product URL
    const itemId = item["item_id"] ?? item["itemid"] ?? item["product_id"];
    const shopId = item["shop_id"] ?? item["shopid"];
    if (itemId && shopId) {
      c.shopee_product_url = `https://shopee.vn/product/${shopId}/${itemId}`;
    } else if (typeof item["product_link"] === "string") {
      c.shopee_product_url = item["product_link"];
    } else if (typeof item["item_link"] === "string") {
      c.shopee_product_url = item["item_link"];
    }

    // Short URL
    if (typeof item["short_link"] === "string" && item["short_link"]) {
      c.short_url = item["short_link"];
    }

    // Product name
    const name =
      item["product_name"] ??
      item["item_name"] ??
      item["name"] ??
      item["title"];
    if (typeof name === "string" && name.trim()) {
      c.product_name = name.trim();
    }

    // Price
    const rawPrice =
      item["price"] ??
      item["item_price"] ??
      item["product_price"] ??
      item["price_min"];
    if (typeof rawPrice === "number") {
      // Shopee API often returns price in cents (x100000)
      c.price_vnd = rawPrice > 1_000_000_000 ? Math.round(rawPrice / 100000) : rawPrice;
    } else if (typeof rawPrice === "string") {
      c.price_vnd = parsePriceVnd(rawPrice);
    }

    // Commission
    const rawComm =
      item["commission_rate"] ??
      item["commission_pct"] ??
      item["commission"] ??
      item["com_rate"];
    if (typeof rawComm === "number") {
      // API may return 0.04 for 4%, or 4 for 4%
      const pct = rawComm < 1 ? rawComm * 100 : rawComm;
      c.commission_pct = `${pct}%`;
    } else if (typeof rawComm === "string") {
      c.commission_pct = parseCommissionPct(rawComm);
    }

    c.estimated_commission_vnd = estimateCommissionVnd(c.price_vnd, c.commission_pct);

    // Sales count
    const sales =
      item["sold"] ??
      item["sales"] ??
      item["historical_sold"] ??
      item["sold_count"];
    if (sales !== undefined && sales !== null) {
      c.sales_count = String(sales);
    }

    // Rating
    const rating =
      item["rating_star"] ??
      item["item_rating"] ??
      item["rating"];
    if (typeof rating === "number" && rating >= 0 && rating <= 5) {
      c.rating = Math.round(rating * 100) / 100;
    } else if (typeof rating === "object" && rating !== null) {
      // Sometimes rating is nested: { rating_star: 4.8, ... }
      const star = (rating as Record<string, unknown>)["rating_star"];
      if (typeof star === "number" && star >= 0 && star <= 5) {
        c.rating = Math.round(star * 100) / 100;
      }
    }

    // Review count
    const reviews =
      item["cmt_count"] ??
      item["review_count"] ??
      item["comment_count"];
    if (typeof reviews === "number" && reviews >= 0) {
      c.review_count = reviews;
    }

    // Shop name
    const shop =
      item["shop_name"] ??
      item["seller_name"];
    if (typeof shop === "string" && shop.trim()) {
      c.shop_name = shop.trim();
    }

    c.data_confidence = computeDataConfidence(c);
    const unknownCount = [
      c.product_name,
      c.price_vnd,
      c.commission_pct,
      c.sales_count,
      c.rating,
      c.review_count,
      c.shop_name,
    ].filter((v) => v === "unknown").length;
    c.extraction_notes = `API extraction (${endpointName}); ${unknownCount}/7 fields unknown`;

    candidates.push(c);
  }

  return candidates;
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("┌────────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Cookie Fetcher v0 (NO Playwright)  │");
  console.log("└────────────────────────────────────────────────────┘");
  console.log();

  // 1. Load cookie
  const cookieStr = loadCookieFile();
  const csrfToken = extractCsrfToken(cookieStr);
  safeLog(`   Has csrftoken for X-CSRFToken header: ${csrfToken ? "yes" : "no"}`);
  console.log();

  // 2. Try API endpoints
  let candidates: ShopeeProductCandidate[] = [];
  let endpointUsed = "none";
  let requiredUserAction = false;
  let fetchNotes = "";

  safeLog("🔎 Trying Shopee Affiliate API endpoints...");
  console.log();

  for (const endpoint of API_ENDPOINTS) {
    safeLog(`📡 Endpoint: ${endpoint.name}`);
    try {
      const { status, body, contentType } = await fetchWithCookie(
        endpoint,
        cookieStr,
        csrfToken,
      );
      safeLog(`   Status: ${status}`);
      safeLog(`   Content-Type: ${contentType}`);
      safeLog(`   Body length: ${body.length} chars`);

      // Check for auth failures
      if (status === 401 || status === 403) {
        safeLog("   ⚠️  Auth failed (401/403) — cookie expired or invalid.");
        requiredUserAction = true;
        fetchNotes = `Endpoint ${endpoint.name}: HTTP ${status} — cookie expired or invalid. User must refresh cookie.`;
        continue;
      }

      if (status === 302 || status === 301) {
        safeLog("   ⚠️  Redirect detected — likely login wall.");
        requiredUserAction = true;
        fetchNotes = `Endpoint ${endpoint.name}: HTTP ${status} redirect — session expired.`;
        continue;
      }

      if (status === 429) {
        safeLog("   ⚠️  Rate limited (429) — STOPPING to avoid ban.");
        requiredUserAction = true;
        fetchNotes = `Rate limited (429). Wait and retry later. Do NOT spam.`;
        break; // Don't try more endpoints
      }

      if (status >= 500) {
        safeLog(`   ⚠️  Server error (${status}) — try next endpoint.`);
        fetchNotes = `Endpoint ${endpoint.name}: HTTP ${status} server error.`;
        continue;
      }

      // Check if response is JSON vs HTML
      if (contentType.includes("json") || body.trimStart().startsWith("{")) {
        // Parse JSON response
        const parsed = parseApiResponse(body, endpoint.name);
        if (parsed.length > 0) {
          candidates = parsed;
          endpointUsed = endpoint.name;
          fetchNotes = `Successfully extracted ${parsed.length} candidates from ${endpoint.name}.`;
          safeLog(`   ✅ Extracted ${parsed.length} candidates!`);
          break; // Got data — stop
        } else {
          safeLog("   ⚠️  JSON response but no candidates extracted.");
          // Log structure for debugging (safe — no cookies in API response body)
          try {
            const jsonPreview = JSON.parse(body);
            const topKeys = Object.keys(jsonPreview).slice(0, 10);
            safeLog(`   Top-level keys: ${topKeys.join(", ")}`);
          } catch {
            // ignore parse errors for preview
          }
          fetchNotes = `Endpoint ${endpoint.name}: JSON response but could not locate product list. Structure may differ from expected schema.`;
        }
      } else if (contentType.includes("html") || body.trimStart().startsWith("<")) {
        // HTML response — could be SPA shell or login page
        const isLoginPage =
          body.includes("/login") ||
          body.includes("đăng nhập") ||
          body.includes("sign in");
        const isCaptcha =
          body.includes("captcha") || body.includes("CAPTCHA");

        if (isLoginPage) {
          safeLog("   ⚠️  HTML login page returned — session expired.");
          requiredUserAction = true;
          fetchNotes = `Endpoint ${endpoint.name}: HTML login page — cookie invalid or expired.`;
        } else if (isCaptcha) {
          safeLog("   ⚠️  Captcha page returned — STOPPING. Will NOT bypass.");
          requiredUserAction = true;
          fetchNotes = `Endpoint ${endpoint.name}: Captcha detected — cannot bypass. User must refresh session.`;
          break;
        } else {
          safeLog("   ℹ️  HTML response (SPA shell). This endpoint serves rendered page, not API data.");
          fetchNotes = `Endpoint ${endpoint.name}: Returns HTML SPA shell. Need to find XHR API endpoint from network traffic.`;
        }
      } else {
        safeLog(`   ℹ️  Unexpected content type: ${contentType}`);
        fetchNotes = `Endpoint ${endpoint.name}: Unexpected content type ${contentType}.`;
      }
    } catch (err: unknown) {
      const safeErr = redactError(err);
      safeError(`   ❌ Fetch error: ${safeErr.message}`);
      fetchNotes = `Endpoint ${endpoint.name}: Fetch error — ${safeErr.message}`;
    }

    console.log();
  }

  // 3. Build output
  const overallConfidence: "high" | "medium" | "low" =
    candidates.length >= 3
      ? "high"
      : candidates.length >= 1
        ? "medium"
        : "low";

  const output: CookieFetchOutput = {
    source: "shopee_affiliate_cookie_fetcher",
    created_at: new Date().toISOString(),
    phase_ref: PHASE_REF,
    data_confidence: overallConfidence,
    candidate_count: candidates.length,
    candidates,
    fetch_notes: fetchNotes || "No endpoint returned usable data.",
    contains_cookie: false,
    endpoint_used: endpointUsed,
    required_user_action: requiredUserAction,
  };

  // 4. Security gate: verify output JSON has NO secrets
  const outputJson = JSON.stringify(output, null, 2);
  if (!isSecretFree(outputJson)) {
    console.error("🛑 SECURITY GATE FAILED: Output JSON contains secret markers!");
    console.error("   Aborting write. This is a bug — please report.");
    process.exit(1);
  }

  // 5. Write output
  const outputDir = dirname(OUTPUT_PATH);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  writeFileSync(OUTPUT_PATH, `${outputJson}\n`, "utf-8");

  // 6. Report
  console.log();
  console.log("═══════════════════════════════════════════════════════");
  console.log("  📊 FETCH RESULT");
  console.log("═══════════════════════════════════════════════════════");
  console.log(`  Output:             ${OUTPUT_PATH}`);
  console.log(`  Endpoint used:      ${endpointUsed}`);
  console.log(`  Candidates found:   ${candidates.length}`);
  console.log(`  Data confidence:    ${overallConfidence}`);
  console.log(`  User action needed: ${requiredUserAction}`);
  console.log(`  Notes:              ${fetchNotes}`);
  console.log();

  if (candidates.length > 0) {
    console.log("  📦 Candidates:");
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      console.log(`    [${i + 1}] ${c.product_name}`);
      console.log(`        Price: ${c.price_vnd}, Commission: ${c.commission_pct}`);
      console.log(`        Confidence: ${c.data_confidence}`);
      console.log(`        URL: ${c.shopee_product_url}`);
    }
    console.log();
  }

  console.log("  🛡️  Security check:");
  console.log("     • Output JSON KHÔNG chứa cookie / token / session.");
  console.log("     • Log KHÔNG print cookie value, chỉ counts + metadata.");
  console.log(`     • isSecretFree(output): ${isSecretFree(outputJson) ? "✅ PASS" : "❌ FAIL"}`);

  if (requiredUserAction) {
    console.log();
    console.log("  ⚠️  ACTION REQUIRED:");
    console.log("     Cookie expired hoặc bị block.");
    console.log("     → Refresh cookie trong browser và cập nhật .secrets/shopee_cookie.txt");
  }

  console.log();
}

main().catch((err: unknown) => {
  const safeErr = redactError(err);
  console.error("❌ Unexpected error:", safeErr.message);
  process.exit(1);
});
