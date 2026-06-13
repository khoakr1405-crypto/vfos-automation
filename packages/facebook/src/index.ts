/**
 * @vfos/facebook — Facebook / Meta Graph API integration for VFOS.
 *
 * This module provides a lightweight client for interacting with
 * the Meta Graph API. Currently supports:
 * - Page connection test (read page id + name)
 * - Text post publish (POST /{page_id}/feed)
 * - Reels publish (3-phase upload + mandatory Graph readback verify)
 *
 * Future (NOT implemented yet):
 * - Reading insights
 *
 * Security rules:
 * - All tokens read from env vars, never hardcoded
 * - Tokens are NEVER logged to stdout/stderr
 * - .env is gitignored, never committed
 */

export { createMetaClient, type MetaClient } from "./meta-client.js";
export { testPageConnection, type PageInfo } from "./test-page.js";
export {
  publishTextPost,
  resolvePublishMode,
  type TextPostRequest,
  type TextPostResult,
  type PublishMode,
} from "./post-page.js";
export {
  publishReelToPage,
  verifyReelPublished,
  type ReelPublishOptions,
  type ReelPublishResult,
  type ReelPublishPhase,
  type PublishVisibility,
} from "./publish-reels.js";
export {
  classifyTokenExpiry,
  buildTokenExpiryMeta,
  parseTokenExpiryMeta,
  DEFAULT_TOKEN_WARN_DAYS,
  type TokenExpiryMeta,
  type TokenExpiryStatus,
  type TokenExpiryClassification,
} from "./token-health.js";
