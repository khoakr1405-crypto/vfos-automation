#!/usr/bin/env tsx

/**
 * 🚫 DEPRECATED — Legacy Shopee cookie-HTTP API flow.
 *
 * Reads raw cookie from .secrets/shopee_cookie.txt and calls the internal
 * /api/v3/offer/campaign/list endpoint discovered from HAR analysis (Round 3A).
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
 * VFOS Shopee Cookie Fetcher v0 — HTTP-based campaign offer extraction
 *
 * Uses the REAL Shopee Affiliate API endpoint discovered from HAR analysis:
 *   GET https://affiliate.shopee.vn/api/v3/offer/campaign/list
 *
 * This replaces the Playwright-based approach (which Shopee detects) with
 * plain HTTP requests using raw cookies from a local file.
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
 *   3. Sends HTTP GET to real Shopee Affiliate campaign offer API.
 *   4. Parses data.list[] into campaign-level candidates.
 *   5. Writes `production/_commerce/shopee_product_candidates.json`
 *      (ZERO cookies/tokens — only public offer data).
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
import { emptyCandidate } from "../src/extract.js";
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

const OFFER_PAGE_URL = "https://affiliate.shopee.vn/offer/shopee_offer";
const PHASE_REF = "Shopee Cookie Fetcher v0 — 2026-05-24";

/**
 * Real Shopee Affiliate API endpoint — discovered from HAR network analysis.
 *
 * GET /api/v3/offer/campaign/list
 * Query params: sort_type, page_offset, page_limit, keyword
 * Response: { code, msg, data: { list[], page_offset, page_limit, has_more, total_count } }
 */
const CAMPAIGN_LIST_URL = "https://affiliate.shopee.vn/api/v3/offer/campaign/list";
const PAGE_LIMIT = 20;

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
  total_count?: number;
  has_more?: boolean;
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
    console.error("     1. Mở https://affiliate.shopee.vn trong Cốc Cốc");
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

  if (!raw.includes("=")) {
    console.error("❌ Cookie file có vẻ không hợp lệ (không chứa key=value pair).");
    console.error("   → Kiểm tra lại nội dung file.");
    process.exit(1);
  }

  // Log only metadata — NEVER the cookie itself
  safeLog(`📁 Cookie file loaded: ${COOKIE_PATH}`);
  safeLog(`   Length: ${raw.length} chars`);
  safeLog(`   Contains SPC_EC: ${raw.includes("SPC_EC") ? "yes" : "no"}`);
  safeLog(`   Contains csrftoken: ${raw.includes("csrftoken") ? "yes" : "no"}`);

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
 * Make an HTTP GET request to the campaign list API with cookie auth.
 * Returns { status, body, contentType }.
 * NEVER logs headers or cookie values.
 */
async function fetchCampaignList(
  cookieStr: string,
  csrfToken: string,
): Promise<{ status: number; body: string; contentType: string }> {
  const url = new URL(CAMPAIGN_LIST_URL);
  url.searchParams.set("sort_type", "1");
  url.searchParams.set("page_offset", "0");
  url.searchParams.set("page_limit", String(PAGE_LIMIT));
  url.searchParams.set("keyword", "");

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

  // Log endpoint (NO headers, NO cookie)
  safeLog(`   → GET ${url.toString()}`);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers,
    redirect: "manual",
  });

  const body = await response.text();
  const contentType = response.headers.get("content-type") ?? "";

  return { status: response.status, body, contentType };
}

/**
 * Convert a unix timestamp (seconds) to ISO string, or return "unknown".
 */
function unixToIso(ts: unknown): string | undefined {
  if (typeof ts === "number" && ts > 0) {
    return new Date(ts * 1000).toISOString();
  }
  return undefined;
}

/**
 * Parse the campaign list API response into ShopeeProductCandidate[].
 *
 * Response shape:
 *   { code, msg, data: { list[], page_offset, page_limit, has_more, total_count } }
 *
 * data.list[] fields:
 *   offer_name, offer_image, offer_type, campaign_id, campaign_link,
 *   period_start_time, period_end_time, commission_rate, long_link,
 *   collection_commission_info, trace
 */
function parseCampaignList(
  body: string,
): {
  candidates: ShopeeProductCandidate[];
  totalCount: number;
  hasMore: boolean;
  error: string | null;
} {
  let json: Record<string, unknown>;
  try {
    json = JSON.parse(body);
  } catch {
    return { candidates: [], totalCount: 0, hasMore: false, error: "Response is not valid JSON" };
  }

  // Check API status code
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
      error: `No 'data' field in response. Top keys: ${Object.keys(json).join(", ")}`,
    };
  }

  const totalCount = typeof data["total_count"] === "number" ? data["total_count"] : 0;
  const hasMore = data["has_more"] === true;

  const list = data["list"];
  if (!Array.isArray(list) || list.length === 0) {
    return {
      candidates: [],
      totalCount,
      hasMore,
      error: list === undefined
        ? `No 'list' field in data. Available keys: ${Object.keys(data).join(", ")}`
        : "data.list is empty",
    };
  }

  safeLog(`   📦 Found ${list.length} campaigns (total_count=${totalCount}, has_more=${hasMore})`);

  const candidates: ShopeeProductCandidate[] = [];

  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;

    const c = emptyCandidate(OFFER_PAGE_URL, "campaign-level Shopee Affiliate offer, not product item detail");

    // offer_name → product_name
    if (typeof rec["offer_name"] === "string" && rec["offer_name"]) {
      c.product_name = (rec["offer_name"] as string).trim();
    }

    // campaign_link → shopee_product_url
    if (typeof rec["campaign_link"] === "string" && rec["campaign_link"]) {
      c.shopee_product_url = rec["campaign_link"] as string;
    }

    // short_url stays unknown (not available at campaign level)

    // commission_rate → commission_pct
    const commRate = rec["commission_rate"];
    if (typeof commRate === "number") {
      // API may return 0.04 for 4%, or 4 for 4%, or 400 for 4%
      let pct: number;
      if (commRate > 100) {
        // Likely basis points or permyriad (e.g. 400 = 4%)
        pct = commRate / 100;
      } else if (commRate <= 1) {
        // Decimal fraction (e.g. 0.04 = 4%)
        pct = commRate * 100;
      } else {
        // Already percent (e.g. 4 = 4%)
        pct = commRate;
      }
      c.commission_pct = `${Math.round(pct * 100) / 100}%`;
    } else if (typeof commRate === "string" && commRate) {
      // Try to parse "4%" style
      const m = commRate.match(/(\d+(?:[.,]\d+)?)\s*%?/);
      if (m) c.commission_pct = `${m[1]?.replace(",", ".")}%`;
    }

    // price_vnd = unknown (campaign level, not product)
    // estimated_commission_vnd = unknown (no price)
    // sales_count = unknown
    // rating = unknown
    // review_count = unknown
    // shop_name = unknown

    // Campaign-specific optional fields
    if (typeof rec["offer_image"] === "string" && rec["offer_image"]) {
      c.offer_image = rec["offer_image"] as string;
    }

    if (typeof rec["long_link"] === "string" && rec["long_link"]) {
      c.affiliate_long_link = rec["long_link"] as string;
    }

    if (rec["campaign_id"] !== undefined && rec["campaign_id"] !== null) {
      c.campaign_id = String(rec["campaign_id"]);
    }

    if (typeof rec["offer_type"] === "string") {
      c.offer_type = rec["offer_type"] as string;
    } else if (typeof rec["offer_type"] === "number") {
      c.offer_type = String(rec["offer_type"]);
    }

    c.period_start = unixToIso(rec["period_start_time"]);
    c.period_end = unixToIso(rec["period_end_time"]);

    // Confidence: campaign-level data with offer_name + campaign_link + commission = medium
    // We don't have price/sales/rating/review/shop, so computeDataConfidence would say "low"
    // But campaign data IS valid and useful, so override to "medium"
    c.data_confidence = (c.product_name !== "unknown" && c.commission_pct !== "unknown")
      ? "medium"
      : "low";

    candidates.push(c);
  }

  return { candidates, totalCount, hasMore, error: null };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("┌──────────────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Cookie Fetcher v0 (Real Campaign API)    │");
  console.log("└──────────────────────────────────────────────────────────┘");
  console.log();

  // 1. Load cookie
  const cookieStr = loadCookieFile();
  const csrfToken = extractCsrfToken(cookieStr);
  safeLog(`   Has csrftoken for X-CSRFToken header: ${csrfToken ? "yes" : "no"}`);
  console.log();

  // 2. Fetch campaign list from real API
  let candidates: ShopeeProductCandidate[] = [];
  let endpointUsed = "none";
  let requiredUserAction = false;
  let fetchNotes = "";
  let totalCount = 0;
  let hasMore = false;

  safeLog("🔎 Calling Shopee Affiliate Campaign List API...");
  safeLog(`   Endpoint: GET /api/v3/offer/campaign/list`);
  console.log();

  try {
    const { status, body, contentType } = await fetchCampaignList(cookieStr, csrfToken);

    safeLog(`   Status: ${status}`);
    safeLog(`   Content-Type: ${contentType}`);
    safeLog(`   Body length: ${body.length} chars`);

    // Auth failure checks
    if (status === 401 || status === 403) {
      safeLog("   ⚠️  Auth failed (401/403) — cookie expired or invalid.");
      requiredUserAction = true;
      fetchNotes = `HTTP ${status} — cookie expired or invalid. Refresh cookie in .secrets/shopee_cookie.txt.`;
    } else if (status === 302 || status === 301) {
      safeLog("   ⚠️  Redirect detected — likely login wall.");
      requiredUserAction = true;
      fetchNotes = `HTTP ${status} redirect — session expired. Refresh cookie.`;
    } else if (status === 429) {
      safeLog("   ⚠️  Rate limited (429) — STOPPING. Do NOT spam.");
      requiredUserAction = true;
      fetchNotes = "Rate limited (429). Wait and retry later.";
    } else if (status >= 500) {
      safeLog(`   ⚠️  Server error (${status}).`);
      fetchNotes = `Server error HTTP ${status}. Try again later.`;
    } else if (status === 200) {
      // Parse response
      if (contentType.includes("json") || body.trimStart().startsWith("{")) {
        const result = parseCampaignList(body);
        totalCount = result.totalCount;
        hasMore = result.hasMore;

        if (result.error) {
          safeLog(`   ⚠️  Parse issue: ${result.error}`);
          fetchNotes = result.error;
        }

        if (result.candidates.length > 0) {
          candidates = result.candidates;
          endpointUsed = "api/v3/offer/campaign/list";
          fetchNotes = `Successfully extracted ${candidates.length} campaign offers (total_count=${totalCount}, has_more=${hasMore}).`;
          safeLog(`   ✅ Extracted ${candidates.length} campaign offers!`);
        } else if (!result.error) {
          fetchNotes = "API returned OK but no campaigns in list.";
        }
      } else if (contentType.includes("html") || body.trimStart().startsWith("<")) {
        const isLogin = body.includes("/login") || body.includes("đăng nhập");
        const isCaptcha = body.includes("captcha") || body.includes("CAPTCHA");
        if (isCaptcha) {
          requiredUserAction = true;
          fetchNotes = "Captcha detected. Cannot bypass. Refresh session manually.";
          safeLog("   ⚠️  Captcha detected — STOPPING.");
        } else if (isLogin) {
          requiredUserAction = true;
          fetchNotes = "Login page returned. Cookie invalid or expired.";
          safeLog("   ⚠️  Login page — session expired.");
        } else {
          fetchNotes = "HTML response instead of JSON. Endpoint may have changed.";
          safeLog("   ⚠️  Unexpected HTML response.");
        }
      }
    } else {
      fetchNotes = `Unexpected HTTP ${status}.`;
      safeLog(`   ⚠️  Unexpected status: ${status}`);
    }
  } catch (err: unknown) {
    const safeErr = redactError(err);
    safeError(`   ❌ Fetch error: ${safeErr.message}`);
    fetchNotes = `Fetch error: ${safeErr.message}`;
  }

  // 3. Build output
  const overallConfidence: "high" | "medium" | "low" =
    candidates.length >= 3
      ? "medium"   // campaign-level = medium at best (no product detail)
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
    fetch_notes: fetchNotes || "No data returned.",
    contains_cookie: false,
    endpoint_used: endpointUsed,
    required_user_action: requiredUserAction,
    total_count: totalCount,
    has_more: hasMore,
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
  console.log(`  Total on server:    ${totalCount}`);
  console.log(`  Has more pages:     ${hasMore}`);
  console.log(`  Data confidence:    ${overallConfidence}`);
  console.log(`  User action needed: ${requiredUserAction}`);
  console.log(`  Notes:              ${fetchNotes}`);
  console.log();

  if (candidates.length > 0) {
    console.log("  📦 Campaign Offers:");
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      console.log(`    [${i + 1}] ${c.product_name}`);
      console.log(`        Commission: ${c.commission_pct}`);
      console.log(`        Campaign link: ${c.shopee_product_url}`);
      if (c.campaign_id) console.log(`        Campaign ID: ${c.campaign_id}`);
      if (c.offer_type) console.log(`        Offer type: ${c.offer_type}`);
      if (c.period_start && c.period_end) {
        console.log(`        Period: ${c.period_start} → ${c.period_end}`);
      }
      console.log(`        Confidence: ${c.data_confidence}`);
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
