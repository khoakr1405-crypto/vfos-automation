#!/usr/bin/env tsx
/**
 * VFOS Shopee — HAR Analyzer (one-shot)
 *
 * Reads .secrets/shopee_product_offer.har and reports candidate product-item-level
 * Shopee Affiliate endpoints. NEVER prints cookie / token / header values.
 *
 * Usage:
 *   tsx packages/shopee/scripts/analyze-har.ts
 *
 * Output: stdout-only analysis report. Does NOT write any artifact.
 */

import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { redactSecrets } from "../src/secret-redaction.js";

const HAR_PATH = resolve(
  import.meta.dirname ?? ".",
  "..",
  "..",
  "..",
  ".secrets",
  "shopee_product_offer.har",
);

interface HarHeader {
  name: string;
  value: string;
}

interface HarQueryString {
  name: string;
  value: string;
}

interface HarPostData {
  mimeType?: string;
  text?: string;
}

interface HarRequest {
  method: string;
  url: string;
  headers: HarHeader[];
  queryString: HarQueryString[];
  postData?: HarPostData;
}

interface HarResponse {
  status: number;
  content?: {
    mimeType?: string;
    text?: string;
    size?: number;
  };
}

interface HarEntry {
  request: HarRequest;
  response: HarResponse;
}

const NOISE_PATTERNS = [
  /\/en\.json/,
  /\/vi\.json/,
  /\/version\.json/,
  /\/_bulk/,
  /\/web-performance/,
  /\/tracking/,
  /\.css(\?|$)/,
  /\.js(\?|$)/,
  /\.woff/,
  /\.svg(\?|$)/,
  /\.png(\?|$)/,
  /\.jpg(\?|$)/,
  /\.gif(\?|$)/,
  /\.ico(\?|$)/,
  /fonts\.googleapis/,
  /sentry/i,
  /datadog/i,
  /google-analytics/i,
  /googletagmanager/i,
  /\.html(\?|$)/,
  /\/login/,
  // Skip Shopee's own monitor/telemetry — POST bodies leak user IDs and internal tokens
  /monitor-report\./i,
  /\/api\/report/i,
  /\/api\/v3\/user\/(profile|status|check_program|permission)/i,
  /\/api\/v3\/config\//i,
  /\/api\/v3\/offer\/checkInAmsWhiteList/i,
  /\/api\/v1\/inbox_message/i,
];

const PRODUCT_ITEM_MARKERS = [
  "itemid",
  "shopid",
  "product_name",
  "item_name",
  "product_link",
  "item_link",
  "price_min",
  "price_max",
  "historical_sold",
  "commission_rate",
  "shop_name",
  // GraphQL camelCase variants
  "productId",
  "shopId",
  "productName",
  "itemName",
  "estCommission",
];

/**
 * Known endpoint classifications. Anything matched here is NOT a product
 * discovery endpoint — it's already understood and either:
 *   - already implemented (campaign-level)
 *   - known to be irrelevant (dashboard rank, profile, telemetry)
 *
 * GraphQL endpoints share a single URL path (`/api/v3/gql`) but are
 * distinguished by `operationName` in the POST body.
 */
type EndpointClassification =
  | "campaign_level_offer_endpoint"
  | "dashboard_product_rank_endpoint"
  | "dashboard_kpi_endpoint"
  | "user_profile_endpoint"
  | "config_endpoint"
  | "telemetry_endpoint"
  | "unclassified";

interface ClassifiedEndpoint {
  classification: EndpointClassification;
  note: string;
}

/**
 * Classify a Shopee Affiliate endpoint by URL + GraphQL operation name.
 * Returns the classification or `"unclassified"` if no known match.
 */
function classifyEndpoint(
  url: string,
  graphqlOperation: string | null,
): ClassifiedEndpoint {
  // Campaign-level offer endpoint (already implemented in fetch-offers-cookie.ts)
  if (url.includes("/api/v3/offer/campaign/list")) {
    return {
      classification: "campaign_level_offer_endpoint",
      note: "Already implemented in fetch-offers-cookie.ts. Returns category-level offers (Fashion, Health, etc), not product-item detail.",
    };
  }

  // GraphQL: dashboard product rank (NOT a discovery endpoint)
  // operationName: itemSoldRankList → returns dashboard top-sold rankings
  // (empty for new affiliate accounts). Fields look product-level (productId,
  // shopId, productName, sales, estCommission) BUT this is user's own historical
  // performance, not a product search/discovery feed.
  if (graphqlOperation === "itemSoldRankList" || graphqlOperation === "productsRankList") {
    return {
      classification: "dashboard_product_rank_endpoint",
      note: "Dashboard product performance/ranking endpoint. Returns user's own historical top-sold + top-earning items (empty for new accounts). NOT a product discovery/search endpoint — cannot be used to generate affiliate candidates.",
    };
  }

  // Other GraphQL ops — classify case-by-case as discovered
  if (graphqlOperation === "isAffiliateHasNoImpressionCampaign") {
    return {
      classification: "user_profile_endpoint",
      note: "GraphQL: user impression-state check. No product data.",
    };
  }

  // User profile / status
  if (
    url.includes("/api/v3/user/") ||
    url.includes("/api/v1/inbox_message")
  ) {
    return { classification: "user_profile_endpoint", note: "User profile/status endpoint" };
  }

  // Dashboard KPI / metrics (latest_report_date, detail, etc.) — user's own
  // performance data only, not product discovery
  if (url.includes("/api/v3/dashboard/")) {
    return {
      classification: "dashboard_kpi_endpoint",
      note: "Dashboard KPI/metrics endpoint (clicks, orders, revenue per period). User's own data only, not product discovery.",
    };
  }

  // Config
  if (url.includes("/api/v3/config/") || url.includes("checkInAmsWhiteList")) {
    return { classification: "config_endpoint", note: "Config/feature-flag endpoint" };
  }

  // Telemetry
  if (url.includes("monitor-report.") || /\/api\/report/i.test(url)) {
    return { classification: "telemetry_endpoint", note: "Telemetry/monitor endpoint" };
  }

  return { classification: "unclassified", note: "Not in known endpoint table" };
}

/**
 * Try to extract `operationName` from a GraphQL POST body.
 * Returns null if body is not JSON or has no operationName.
 */
function extractGraphqlOperation(rawBody: string | undefined): string | null {
  if (!rawBody) return null;
  try {
    const parsed = JSON.parse(rawBody);
    if (parsed && typeof parsed === "object") {
      const op = (parsed as Record<string, unknown>)["operationName"];
      if (typeof op === "string" && op.length > 0) return op;
    }
  } catch {
    // not JSON
  }
  return null;
}

function isNoise(url: string): boolean {
  return NOISE_PATTERNS.some((p) => p.test(url));
}

function isAffiliateApi(url: string): boolean {
  return url.includes("affiliate.shopee.vn/api") || url.includes("affiliate.shopee.vn/marketing-services");
}

function countProductMarkers(body: string): { hits: string[]; sample: string } {
  const hits = PRODUCT_ITEM_MARKERS.filter((m) => body.includes(`"${m}"`));
  // Get a small sample of the body around the first marker hit
  let sample = "";
  if (hits.length > 0 && hits[0] !== undefined) {
    const idx = body.indexOf(`"${hits[0]}"`);
    if (idx >= 0) {
      const start = Math.max(0, idx - 50);
      const end = Math.min(body.length, idx + 200);
      sample = body.slice(start, end);
    }
  }
  return { hits, sample };
}

function extractTopLevelKeys(body: string): string[] {
  try {
    const parsed = JSON.parse(body);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return Object.keys(parsed as Record<string, unknown>);
    }
  } catch {
    // not JSON
  }
  return [];
}

function extractDataListPath(body: string): { hasDataList: boolean; firstItemKeys: string[]; itemCount: number } {
  try {
    const parsed = JSON.parse(body) as Record<string, unknown>;
    const data = parsed["data"] as Record<string, unknown> | undefined;
    if (!data) return { hasDataList: false, firstItemKeys: [], itemCount: 0 };
    const list = data["list"] ?? data["items"] ?? data["products"] ?? data["item_list"];
    if (Array.isArray(list) && list.length > 0) {
      const firstItem = list[0];
      const firstItemKeys =
        firstItem && typeof firstItem === "object"
          ? Object.keys(firstItem as Record<string, unknown>)
          : [];
      return { hasDataList: true, firstItemKeys, itemCount: list.length };
    }
  } catch {
    // not JSON
  }
  return { hasDataList: false, firstItemKeys: [], itemCount: 0 };
}

function safePathOnly(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function safeQueryParams(url: string): Array<{ key: string; value: string }> {
  try {
    const u = new URL(url);
    const params: Array<{ key: string; value: string }> = [];
    u.searchParams.forEach((value, key) => {
      // Redact suspicious values
      const isSecretLike =
        /^[A-Z0-9]{20,}$/i.test(value) || // long token-like
        /^[a-z0-9]{32,}$/i.test(value) || // long hex
        key.toLowerCase().includes("token") ||
        key.toLowerCase().includes("session");
      params.push({ key, value: isSecretLike ? "<redacted>" : value });
    });
    return params;
  } catch {
    return [];
  }
}

async function main(): Promise<void> {
  if (!existsSync(HAR_PATH)) {
    console.error(`❌ HAR not found: ${HAR_PATH}`);
    process.exit(1);
  }

  const harText = readFileSync(HAR_PATH, "utf-8");
  let har: { log: { entries: HarEntry[] } };
  try {
    har = JSON.parse(harText);
  } catch (err) {
    console.error("❌ HAR is not valid JSON:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  const entries = har.log.entries;
  console.log(`📊 HAR loaded: ${entries.length} total entries`);

  // Filter: affiliate.shopee.vn API + not noise
  const apiEntries = entries.filter(
    (e) => isAffiliateApi(e.request.url) && !isNoise(e.request.url),
  );
  console.log(`   After noise filter: ${apiEntries.length} affiliate API requests`);

  // Find candidates with product-item-level markers in RESPONSE
  type Candidate = {
    method: string;
    pathOnly: string;
    queryParams: Array<{ key: string; value: string }>;
    status: number;
    contentType: string;
    bodySize: number;
    markerHits: string[];
    topLevelKeys: string[];
    dataList: { hasDataList: boolean; firstItemKeys: string[]; itemCount: number };
    postDataMime?: string;
    postDataSample?: string;
    graphqlOperation: string | null;
    classification: EndpointClassification;
    classificationNote: string;
  };

  const candidates: Candidate[] = [];

  for (const e of apiEntries) {
    const body = e.response.content?.text ?? "";
    if (body === "") continue;

    const { hits } = countProductMarkers(body);
    // Include all entries — classification + summary make the filtering clear.
    // GraphQL responses with empty data arrays will have 0 markers but still
    // matter for endpoint discovery (e.g. itemSoldRankList).

    const dataList = extractDataListPath(body);
    const topLevelKeys = extractTopLevelKeys(body);

    const postDataMime = e.request.postData?.mimeType;
    const rawPost = e.request.postData?.text ?? "";
    // Extra redaction for POST body: mask any long numeric IDs (8+ digits), hex tokens
    // (32+ chars), and UUIDs that may leak through telemetry payloads
    let postDataSample: string | undefined;
    if (rawPost.length > 0) {
      let s = redactSecrets(rawPost.slice(0, 300));
      s = s.replace(/\b\d{8,}\b/g, "[NUM_ID]");
      s = s.replace(/\b[a-f0-9]{32,}\b/gi, "[HEX_TOKEN]");
      s = s.replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
        "[UUID]",
      );
      postDataSample = s;
    }

    const graphqlOperation = extractGraphqlOperation(rawPost);
    const { classification, note: classificationNote } = classifyEndpoint(
      e.request.url,
      graphqlOperation,
    );

    candidates.push({
      method: e.request.method,
      pathOnly: safePathOnly(e.request.url),
      queryParams: safeQueryParams(e.request.url),
      status: e.response.status,
      contentType: e.response.content?.mimeType ?? "",
      bodySize: e.response.content?.size ?? body.length,
      markerHits: hits,
      topLevelKeys,
      dataList,
      postDataMime,
      postDataSample,
      graphqlOperation,
      classification,
      classificationNote,
    });
  }

  console.log(`   Product-item-level candidates: ${candidates.length}`);
  console.log();

  // Sort by marker count (most data first) then by item count
  candidates.sort((a, b) => {
    const diff = b.markerHits.length - a.markerHits.length;
    if (diff !== 0) return diff;
    return b.dataList.itemCount - a.dataList.itemCount;
  });

  // Report top candidates
  const TOP_N = Math.min(candidates.length, 26);
  for (let i = 0; i < TOP_N; i++) {
    const c = candidates[i]!;
    console.log("═══════════════════════════════════════════════════════════");
    const opLabel = c.graphqlOperation ? `  [op=${c.graphqlOperation}]` : "";
    console.log(`#${i + 1}  ${c.method}  ${c.pathOnly}${opLabel}`);
    console.log(`    Classification: ${c.classification}`);
    console.log(`    Note:           ${c.classificationNote}`);
    console.log(`    Status: ${c.status}    Content-Type: ${c.contentType}    Size: ${c.bodySize}`);
    console.log(`    Markers hit (${c.markerHits.length}): ${c.markerHits.join(", ")}`);
    console.log(`    Top-level keys: ${c.topLevelKeys.join(", ")}`);
    console.log(`    data.list[]: hasList=${c.dataList.hasDataList}, itemCount=${c.dataList.itemCount}`);
    if (c.dataList.firstItemKeys.length > 0) {
      console.log(`    First item keys (${c.dataList.firstItemKeys.length}): ${c.dataList.firstItemKeys.join(", ")}`);
    }
    if (c.queryParams.length > 0) {
      console.log(`    Query params:`);
      for (const p of c.queryParams) {
        console.log(`      - ${p.key} = ${p.value}`);
      }
    }
    if (c.postDataMime) {
      console.log(`    POST body (${c.postDataMime}, redacted sample):`);
      console.log(`      ${c.postDataSample}`);
    }
    console.log();
  }

  // Summary: any unclassified endpoint with ≥2 markers is a candidate for product discovery
  const discoveryCandidates = candidates.filter(
    (c) => c.classification === "unclassified" && c.markerHits.length >= 2,
  );
  console.log("───────────────────────────────────────────────────────────");
  console.log(`📌 Summary:`);
  console.log(`   Total endpoints scanned: ${candidates.length}`);
  console.log(`   campaign_level_offer_endpoint:    ${candidates.filter((c) => c.classification === "campaign_level_offer_endpoint").length}  (already implemented)`);
  console.log(`   dashboard_product_rank_endpoint:  ${candidates.filter((c) => c.classification === "dashboard_product_rank_endpoint").length}  (NOT product discovery)`);
  console.log(`   dashboard_kpi_endpoint:           ${candidates.filter((c) => c.classification === "dashboard_kpi_endpoint").length}  (user own metrics)`);
  console.log(`   user_profile_endpoint:            ${candidates.filter((c) => c.classification === "user_profile_endpoint").length}`);
  console.log(`   config_endpoint:                  ${candidates.filter((c) => c.classification === "config_endpoint").length}`);
  console.log(`   telemetry_endpoint:               ${candidates.filter((c) => c.classification === "telemetry_endpoint").length}`);
  console.log(`   unclassified (≥2 markers):        ${discoveryCandidates.length}  ← potential product discovery`);
  console.log();
  if (discoveryCandidates.length === 0) {
    console.log(`   ⚠️  No product-discovery endpoint found in this HAR.`);
    console.log(`       Operator must capture HAR on a different page:`);
    console.log(`         • Generate-link / create-affiliate-link flow for 1 specific product`);
    console.log(`         • Search products in Shopee Affiliate (if UI exists)`);
    console.log(`         • /product, /recommend, /offer/product_offer pages (if exist)`);
  }

  console.log();
  console.log("🛡️  Security: no cookies/tokens/headers printed. Sample bodies redacted via secret-redaction helper.");
}

main().catch((err: unknown) => {
  console.error("❌ Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
