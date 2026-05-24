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

/**
 * Status of the affiliate URL attached to a Shopee product candidate.
 *
 * - VERIFIED_FROM_LONG_LINK: long_link from /api/v3/offer/product/list passed
 *   validateShopeeAffiliateLink() — has /universal-link/ path, gads_t_sig,
 *   utm_medium=affiliates, utm_source=an_<affiliate_id>. Use as-is.
 * - GENERATED_BY_CUSTOM_LINK: link generated via Shopee Custom Link endpoint
 *   (not yet implemented as of Round 3C — long_link covers the v0 case).
 * - NEEDS_CUSTOM_LINK: long_link missing or partial; would need Custom Link
 *   endpoint to wrap.
 * - NEEDS_USER_REVIEW: link present but validation flagged ambiguity (e.g.
 *   non-universal-link path, missing utm). Operator must manually verify.
 * - FAILED: extraction failed entirely; no usable URL.
 */
export type AffiliateLinkStatus =
  | "VERIFIED_FROM_LONG_LINK"
  | "GENERATED_BY_CUSTOM_LINK"
  | "NEEDS_CUSTOM_LINK"
  | "NEEDS_USER_REVIEW"
  | "FAILED";

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

  // ─── Campaign-level fields (optional, from Shopee Affiliate offer API) ────
  /** Offer/campaign image URL */
  offer_image?: string;
  /** Full affiliate tracking link */
  affiliate_long_link?: string;
  /** Campaign ID from Shopee Affiliate */
  campaign_id?: string;
  /** Offer type (eg "shopee_offer", "shop_offer") */
  offer_type?: string;
  /** Campaign period start (ISO or unix timestamp) */
  period_start?: string;
  /** Campaign period end (ISO or unix timestamp) */
  period_end?: string;

  // ─── Affiliate link verification (Round 3C, 2026-05-24) ───────────────────
  /**
   * The affiliate URL to actually publish in Facebook/TikTok caption.
   * Equals `affiliate_long_link` when `affiliate_link_status === VERIFIED_FROM_LONG_LINK`.
   * "unknown" when no usable link could be derived.
   */
  shopee_affiliate_url: string | "unknown";
  /** Provenance + validation outcome for `shopee_affiliate_url`. */
  affiliate_link_status: AffiliateLinkStatus;
  /** Why the link landed in this status (which checks passed / failed). */
  affiliate_link_notes: string;
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
