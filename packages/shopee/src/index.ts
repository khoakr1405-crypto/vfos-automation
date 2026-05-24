/**
 * @vfos/shopee — Shopee Affiliate dashboard fetcher.
 *
 * v0 capability: load user's local browser session (Playwright storageState),
 * navigate to Shopee Affiliate offer dashboard, extract a small number of
 * product candidates, export to JSON artifact (no cookies/tokens included).
 *
 * Security:
 *   - Login session lives ONLY in .secrets/shopee_storage_state.json (gitignored)
 *   - NO cookie/token/session data ever written to repo or stdout/stderr
 *   - User must complete login + captcha manually in headed browser
 *   - First run = operator approval (NOT auto-triggered)
 *
 * Future scope (NOT v0):
 *   - Search by keyword (Discovery Mode for /chay Shopee-First Lane)
 *   - Affiliate link wrapping (UTM source attribution)
 *   - Periodic refresh + retry on session expiry
 */

export type {
  DataConfidence,
  ShopeeProductCandidate,
  ShopeeFetchManifest,
} from "./types.js";

export {
  parsePriceVnd,
  parseCommissionPct,
  estimateCommissionVnd,
  computeDataConfidence,
  emptyCandidate,
  OFFER_DASHBOARD_SELECTORS,
} from "./extract.js";
