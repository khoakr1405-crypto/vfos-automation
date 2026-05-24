/**
 * Shopee Session Fetcher v0 — extraction helpers
 *
 * Selectors here are **placeholders** calibrated against Shopee Affiliate
 * dashboard (`https://affiliate.shopee.vn/offer/shopee_offer`) as of
 * 2026-05-24. Shopee SPA changes DOM frequently — calibration may need
 * adjustment on first real run (operator inspects DOM via DevTools).
 *
 * Security: this module reads ONLY visible DOM text content. It does NOT:
 *   - inspect request headers (which contain cookies)
 *   - inspect localStorage / sessionStorage (which may contain tokens)
 *   - log any extracted value other than counts + boolean status
 *   - return cookie/token/session data in any field
 */

import type { ShopeeProductCandidate, DataConfidence } from "./types.js";

/**
 * Parse a VND price string. Shopee dashboard typically renders prices as
 * "₫95.351" or "95.351đ" with dot as thousand-separator. Returns integer VND.
 */
export function parsePriceVnd(raw: string | null | undefined): number | "unknown" {
  if (!raw) return "unknown";
  // Strip currency symbols + whitespace, keep digits only
  const digits = raw.replace(/[^\d]/g, "");
  if (digits === "") return "unknown";
  const n = parseInt(digits, 10);
  if (!Number.isFinite(n) || n <= 0) return "unknown";
  return n;
}

/**
 * Parse a percent string like "4%", "10%", "12.5%". Returns "4%"/"10%" etc.
 * If raw is null/empty/malformed → "unknown".
 */
export function parseCommissionPct(raw: string | null | undefined): string | "unknown" {
  if (!raw) return "unknown";
  const m = raw.match(/(\d+(?:[.,]\d+)?)\s*%/);
  if (!m) return "unknown";
  return `${m[1]?.replace(",", ".")}%`;
}

/**
 * Compute estimated commission in VND from price + percent.
 * Returns "unknown" if either input is unknown or malformed.
 */
export function estimateCommissionVnd(
  price: number | "unknown",
  percent: string | "unknown"
): number | "unknown" {
  if (price === "unknown" || percent === "unknown") return "unknown";
  const m = percent.match(/^(\d+(?:\.\d+)?)%$/);
  if (!m) return "unknown";
  const pctNum = parseFloat(m[1] ?? "0");
  if (!Number.isFinite(pctNum) || pctNum <= 0) return "unknown";
  return Math.round((price * pctNum) / 100);
}

/**
 * Compute `data_confidence` from how many critical fields are unknown.
 * Critical fields: price, commission, sales_count, rating, review_count, shop_name.
 *   - 0–1 unknown → high
 *   - 2–3 unknown → medium
 *   - ≥4 unknown → low
 */
export function computeDataConfidence(
  candidate: Pick<
    ShopeeProductCandidate,
    "price_vnd" | "commission_pct" | "sales_count" | "rating" | "review_count" | "shop_name"
  >
): DataConfidence {
  const unknowns = [
    candidate.price_vnd,
    candidate.commission_pct,
    candidate.sales_count,
    candidate.rating,
    candidate.review_count,
    candidate.shop_name,
  ].filter((v) => v === "unknown").length;

  if (unknowns <= 1) return "high";
  if (unknowns <= 3) return "medium";
  return "low";
}

/**
 * Build an empty candidate skeleton. Use when extraction is partial.
 * All fields default to "unknown" so the caller fills in only what was found.
 */
export function emptyCandidate(sourcePage: string, notes: string): ShopeeProductCandidate {
  return {
    shopee_product_url: "unknown",
    short_url: "unknown",
    product_name: "unknown",
    price_vnd: "unknown",
    commission_pct: "unknown",
    estimated_commission_vnd: "unknown",
    sales_count: "unknown",
    rating: "unknown",
    review_count: "unknown",
    shop_name: "unknown",
    source_page: sourcePage,
    data_confidence: "low",
    extraction_notes: notes,
  };
}

/**
 * Placeholder selectors for Shopee Affiliate offer dashboard.
 * MUST be recalibrated on first real run — Shopee SPA changes DOM frequently.
 *
 * The fetch script tries each selector. If none match → save HTML snapshot
 * to `.secrets/last_fetch_dom.html` (gitignored) for operator to inspect.
 */
export const OFFER_DASHBOARD_SELECTORS = {
  /** Product card container (multiple per dashboard) */
  cardContainer: [
    '[data-testid*="product-card"]',
    'div.product-card',
    'div[class*="ProductCard"]',
    'a[href*="/shopee_offer/"]',
  ],
  /** Product name within card */
  productName: [
    '[data-testid*="product-name"]',
    'div.product-name',
    'span.product-name',
  ],
  /** Price within card */
  price: [
    '[data-testid*="price"]',
    'div.price',
    'span.price',
  ],
  /** Commission percent within card */
  commissionPct: [
    '[data-testid*="commission"]',
    'div.commission',
    'span.commission',
  ],
  /** Shop name within card */
  shopName: [
    '[data-testid*="shop-name"]',
    'div.shop-name',
    'span.shop-name',
  ],
  /** Sales count within card */
  salesCount: [
    '[data-testid*="sold"]',
    'div.sold-count',
    'span.sold-count',
  ],
  /** Rating within card */
  rating: [
    '[data-testid*="rating"]',
    'div.rating',
    'span.rating',
  ],
  /** Review count within card */
  reviewCount: [
    '[data-testid*="review-count"]',
    'div.review-count',
    'span.review-count',
  ],
  /** Product URL link within card */
  productUrl: [
    'a[href*="shopee.vn/"][href*="-i."]',
    'a[href*="shopee.vn/product/"]',
    'a.product-link',
  ],
} as const;
