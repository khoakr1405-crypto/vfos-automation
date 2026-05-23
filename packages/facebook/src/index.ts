/**
 * @vfos/facebook — Facebook / Meta Graph API integration for VFOS.
 *
 * This module provides a lightweight client for interacting with
 * the Meta Graph API. Currently supports:
 * - Page connection test (read page id + name)
 *
 * Future (NOT implemented yet):
 * - Publishing Reels
 * - Uploading videos
 * - Reading insights
 *
 * Security rules:
 * - All tokens read from env vars, never hardcoded
 * - Tokens are NEVER logged to stdout/stderr
 * - .env is gitignored, never committed
 */

export { createMetaClient, type MetaClient } from "./meta-client.js";
export { testPageConnection, type PageInfo } from "./test-page.js";
export { publishTextPost, type TextPostRequest, type TextPostResult } from "./post-page.js";
