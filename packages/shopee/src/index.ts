/**
 * @vfos/shopee — Shopee Affiliate link extraction library.
 *
 * Current official flow (Round 26B+): CDP attach to user's existing browser
 * (Cốc Cốc / Chrome) + targeted-click on Shopee Affiliate dashboard. Operator
 * authorizes each click. No internal API calls, no cookie HTTP scraping,
 * no HAR replay, no storage_state reuse.
 *
 * Public surface exported here:
 *   - Types: ShopeeProductCandidate, ShopeeFetchManifest, DataConfidence
 *   - Extract helpers: parsePriceVnd, parseCommissionPct, etc.
 *   - Secret redaction: redactSecrets, redactError, isSecretFree
 *   - Link registry (Round 26B+): upsertEntry, isDuplicate, findExistingEntry
 *   - CDP extract helpers: extractShopidItemid, resolveShortLink, etc.
 *   - CDP bootstrap (Round 27B+): bootstrapBrowser, captcha guards, etc.
 *
 * Active CLI driver: packages/shopee/scripts/extract-links-cdp.ts
 * (`pnpm shopee:extract-links-cdp`) + the orchestrator chain
 * `pnpm commerce:intake` → preflight → extractor → builder → audit.
 *
 * DEPRECATED flows (kept as FALLBACK per SKILL.md Round 26B audit policy,
 * NOT auto-triggered): storage_state login (`shopee:login`/`shopee:fetch`),
 * cookie-HTTP API (`shopee:fetch-cookie`/`shopee:fetch-products`). Each legacy
 * script carries an in-file 🚫 DEPRECATED banner. (HAR/probe debug inspectors
 * removed in Round Cleanup B1 — superseded by CDP extract helpers.)
 *
 * Security (applies to ALL flows):
 *   - NO cookie/token/session data ever written to repo or stdout/stderr
 *   - All errors/logs pass through secret-redaction before printing
 *   - Operator authorizes browser actions; script never bypasses captcha/OTP
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

export {
  redactSecrets,
  redactError,
  isSecretFree,
} from "./secret-redaction.js";

export {
  LinkRegistryError,
  upsertEntry,
  appendRejected,
  isDuplicate,
  findExistingEntry,
} from "./link-registry.js";
export type {
  LinkRegistry,
  LinkRegistryConfig,
  LinkRegistryEntry,
  LinkRegistryRejected,
  LinkRegistryReasonCode,
  UpsertResult,
} from "./link-registry.js";

export {
  extractShopidItemid,
  resolveShortLink,
  shouldSkipPreClick,
  classifyResolvedLink,
  parseCliValues,
} from "./cdp-extract-helpers.js";
export type {
  ShopidItemid,
  FetchLike,
  PreClickDedupResult,
  ValidationOutcome,
  ParsedCliArgs,
} from "./cdp-extract-helpers.js";

export {
  CdpBootstrapError,
  bootstrapBrowser,
  resolveBrowserPath,
  resolveUserDataDir,
  detectProfileLock,
  expandEnvPath,
  detectCaptchaGuard,
  waitForCaptchaResolution,
  clampCaptchaWaitSeconds,
  DEFAULT_CAPTCHA_WAIT_SECONDS,
  MIN_CAPTCHA_WAIT_SECONDS,
  MAX_CAPTCHA_WAIT_SECONDS,
  DEFAULT_BROWSER_PATHS_WIN32,
  realDeps,
  realProbePort,
} from "./cdp-bootstrap.js";
export type {
  CdpBootstrapReasonCode,
  BootstrapResult,
  BootstrapConfig,
  BootstrapDeps,
  SpawnHandle,
  CaptchaPage,
  CaptchaDetection,
  CaptchaWaitOptions,
  CaptchaWaitResult,
} from "./cdp-bootstrap.js";
