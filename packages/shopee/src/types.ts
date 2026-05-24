/**
 * Shopee Session Fetcher v0 — types
 *
 * Schema for product candidates exported from Shopee Affiliate dashboard.
 * Field `unknown` = data not extractable (NEVER fabricated).
 *
 * Security: this schema contains ZERO authentication data. No cookies,
 * tokens, session IDs, CSRF tokens, or PII. Only public-visible product data.
 */

export type DataConfidence = "high" | "medium" | "low";

export interface ShopeeProductCandidate {
  /** Canonical Shopee VN URL (eg https://shopee.vn/<slug>/<shopid>/<itemid>) */
  shopee_product_url: string | "unknown";
  /** Short URL if available (eg https://s.shopee.vn/<code>) */
  short_url: string | "unknown";
  /** Product name from listing */
  product_name: string | "unknown";
  /** Price in VND (integer) */
  price_vnd: number | "unknown";
  /** Commission percent (eg "4%", "10%") */
  commission_pct: string | "unknown";
  /** Estimated commission VND (price * commission) */
  estimated_commission_vnd: number | "unknown";
  /** Sales count text (eg "5k+", "12.3k") */
  sales_count: string | "unknown";
  /** Average rating (eg 4.8). 0 = new listing with no reviews (NOT unknown). */
  rating: number | "unknown";
  /** Review count. 0 = new listing (NOT unknown). */
  review_count: number | "unknown";
  /** Shop name */
  shop_name: string | "unknown";
  /** Source URL the candidate was extracted from */
  source_page: string;
  /** Confidence — high (all key fields visible), medium (some unknown), low (mostly unknown) */
  data_confidence: DataConfidence;
  /** Free text describing extraction method, selector used, or fail reason */
  extraction_notes: string;
}

export interface ShopeeFetchManifest {
  /** ISO 8601 timestamp */
  created_at: string;
  /** Phần reference */
  phase_ref: string;
  /** Source page navigated to */
  source_page: string;
  /** How many candidates were attempted */
  candidates_attempted: number;
  /** How many candidates extracted successfully (at minimum product_name + url) */
  candidates_extracted: number;
  /** Did the page require login / captcha? */
  required_user_action: boolean;
  /** Free text notes */
  notes: string;
  /** Product candidates */
  candidates: ShopeeProductCandidate[];
}
