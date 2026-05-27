/**
 * Pure helpers for the Shopee CDP production extraction CLI (Round 27).
 *
 * Split out of `scripts/extract-links-cdp.ts` so the units that can be tested
 * without a real browser (URL parsing, dedup pre-check, reject mapping, short-link
 * resolver with injectable fetcher) live here.
 *
 * Security: no helper logs cookies/tokens/headers. Short-link resolver only
 * reads the `location` response header — it never reads or persists request
 * headers from the browser context.
 */

import { isDuplicate, type LinkRegistryEntry } from "./link-registry.js";
import { validateShopeeAffiliateLink } from "./extract.js";
import type { AffiliateLinkStatus } from "./types.js";

export interface ShopidItemid {
  shopid: string | null;
  itemid: string | null;
}

/**
 * Extract `shopid` and `itemid` from a Shopee canonical URL.
 *
 * Shopee uses three path shapes we care about:
 *   - `/<slug>-i.<shopid>.<itemid>` — public product detail page
 *   - `/<slug>/<shopid>/<itemid>`   — universal-link affiliate path
 *   - `/opaanlp/<shopid>/<itemid>`  — mobile deep-link from short URL
 *
 * Returns nulls if the URL doesn't match any shape.
 */
export function extractShopidItemid(canonical: string | null): ShopidItemid {
  if (!canonical) return { shopid: null, itemid: null };
  let u: URL;
  try {
    u = new URL(canonical);
  } catch {
    return { shopid: null, itemid: null };
  }

  const dashed = u.pathname.match(/-i\.(\d+)\.(\d+)/);
  if (dashed) return { shopid: dashed[1]!, itemid: dashed[2]! };

  const opaanlp = u.pathname.match(
    /\/(?:opaanlp|universal-link\/product|product)\/(\d+)\/(\d+)/,
  );
  if (opaanlp) return { shopid: opaanlp[1]!, itemid: opaanlp[2]! };

  const generic = u.pathname.match(/\/[^/]+\/(\d+)\/(\d+)(?:\/|$)/);
  if (generic) return { shopid: generic[1]!, itemid: generic[2]! };

  return { shopid: null, itemid: null };
}

/**
 * Minimal interface of `globalThis.fetch` we depend on. Lets tests inject a
 * stub without pulling DOM/undici types.
 */
export type FetchLike = (
  url: string,
  init?: { method?: string; redirect?: "manual" | "follow"; headers?: Record<string, string> },
) => Promise<{
  headers: { get(name: string): string | null };
  url: string;
}>;

/**
 * Resolve a Shopee short URL (`s.shopee.vn/<code>`) to its canonical URL.
 *
 * Strategy:
 *   1. HEAD with `redirect: "manual"` — read `Location` header.
 *   2. If no Location, fall back to GET and read final `.url` (after following redirects).
 *
 * Never reads or logs request/response cookies or auth headers.
 */
export async function resolveShortLink(
  shortUrl: string,
  fetcher: FetchLike,
): Promise<string | null> {
  try {
    const head = await fetcher(shortUrl, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      },
    });
    const loc = head.headers.get("location");
    if (loc) return loc;
    const get = await fetcher(shortUrl, { method: "GET" });
    return get.url || null;
  } catch {
    return null;
  }
}

/**
 * Result of the pre-click dedup check. Used by the CLI to decide whether to
 * click a product card or skip it.
 *
 * `match_field` records which dedup key triggered the skip — useful for
 * operator-facing logs ("skipped by shopid+itemid" vs "skipped by name").
 */
export interface PreClickDedupResult {
  skip: boolean;
  match_field: "shopid_itemid" | "canonical_url" | "short_link" | "product_name" | null;
}

/**
 * Decide whether to skip clicking this product card based on the registry.
 *
 * Checks in HARD priority order (matches `findExistingEntry`):
 *   1. shopid+itemid (strongest signal)
 *   2. canonical_url normalized
 *   3. short_link
 *   4. product_name normalized
 *
 * A field is only checked if the probe provides a value for it — we don't want
 * "all null cards" to collide.
 */
export function shouldSkipPreClick(
  registryPath: string,
  expectedOwner: string,
  probe: Partial<LinkRegistryEntry>,
): PreClickDedupResult {
  if (probe.shopid && probe.itemid) {
    if (isDuplicate(registryPath, expectedOwner, { shopid: probe.shopid, itemid: probe.itemid })) {
      return { skip: true, match_field: "shopid_itemid" };
    }
  }
  if (probe.canonical_url) {
    if (isDuplicate(registryPath, expectedOwner, { canonical_url: probe.canonical_url })) {
      return { skip: true, match_field: "canonical_url" };
    }
  }
  if (probe.short_link) {
    if (isDuplicate(registryPath, expectedOwner, { short_link: probe.short_link })) {
      return { skip: true, match_field: "short_link" };
    }
  }
  if (probe.product_name) {
    if (isDuplicate(registryPath, expectedOwner, { product_name: probe.product_name })) {
      return { skip: true, match_field: "product_name" };
    }
  }
  return { skip: false, match_field: null };
}

/**
 * Outcome of post-resolve validation. Drives upsert vs appendRejected decision
 * inside the CLI loop. Reason codes follow the Round 26B canonical enum.
 */
export type ValidationOutcome =
  | { kind: "ACCEPT"; status: AffiliateLinkStatus; notes: string }
  | { kind: "REJECT"; reason_code: "ERR_AFFILIATE_OWNER_MISMATCH"; notes: string }
  | { kind: "REVIEW"; status: AffiliateLinkStatus; notes: string };

/**
 * Classify a resolved canonical URL against the expected owner.
 *
 * - `VERIFIED_FROM_LONG_LINK` + utm/mmp owner matches → ACCEPT
 * - `VERIFIED_FROM_LONG_LINK` + owner mismatch        → REJECT
 * - `NEEDS_USER_REVIEW`                                → REVIEW (upsert with NEEDS_USER_REVIEW status; do not reject)
 * - `FAILED`                                           → REJECT as owner mismatch with diagnostic notes
 */
export function classifyResolvedLink(
  link: string | null,
  expectedOwner: string,
): ValidationOutcome {
  const v = validateShopeeAffiliateLink(link);
  if (v.status === "VERIFIED_FROM_LONG_LINK") {
    if (!link) return { kind: "REJECT", reason_code: "ERR_AFFILIATE_OWNER_MISMATCH", notes: v.notes };
    const url = new URL(link);
    const owner = url.searchParams.get("utm_source") || url.searchParams.get("mmp_pid") || "";
    if (owner === expectedOwner) {
      return { kind: "ACCEPT", status: "VERIFIED_FROM_LONG_LINK", notes: v.notes };
    }
    return {
      kind: "REJECT",
      reason_code: "ERR_AFFILIATE_OWNER_MISMATCH",
      notes: `owner=${owner || "(none)"} expected=${expectedOwner}`,
    };
  }
  if (v.status === "NEEDS_USER_REVIEW") {
    return { kind: "REVIEW", status: "NEEDS_USER_REVIEW", notes: v.notes };
  }
  return { kind: "REJECT", reason_code: "ERR_AFFILIATE_OWNER_MISMATCH", notes: v.notes };
}

/**
 * Parse and validate the CLI args object produced by `parseArgs`. Throws on
 * invalid values so the CLI exits before connecting to CDP.
 */
export interface ParsedCliArgs {
  target_count: number;
  max_clicks: number;
  dry_run: boolean;
  cdp_endpoint: string;
  cdp_retries: number;
  expected_owner: string;
  registry_path: string;
}

export function parseCliValues(
  values: Record<string, string | boolean | undefined>,
  defaults: { owner: string; registry_path: string },
): ParsedCliArgs {
  const tc = parseInt(String(values["target-count"] ?? "1"), 10);
  const mc = parseInt(String(values["max-clicks"] ?? "5"), 10);
  const cr = parseInt(String(values["cdp-retries"] ?? "3"), 10);
  if (!Number.isFinite(tc) || tc < 1) throw new Error(`--target-count must be a positive integer (got ${tc})`);
  if (!Number.isFinite(mc) || mc < 1) throw new Error(`--max-clicks must be a positive integer (got ${mc})`);
  if (mc < tc) throw new Error(`--max-clicks (${mc}) must be >= --target-count (${tc})`);
  if (!Number.isFinite(cr) || cr < 1) throw new Error(`--cdp-retries must be a positive integer (got ${cr})`);

  const owner = (values["owner-id"] as string | undefined) ?? defaults.owner;
  if (!/^an_\d+$/.test(owner)) {
    throw new Error(`--owner-id must match an_<digits> (got ${owner})`);
  }

  return {
    target_count: tc,
    max_clicks: mc,
    dry_run: values["dry-run"] === true,
    cdp_endpoint: (values["cdp-endpoint"] as string | undefined) ?? "http://127.0.0.1:9222",
    cdp_retries: cr,
    expected_owner: owner,
    registry_path: (values["registry-path"] as string | undefined) ?? defaults.registry_path,
  };
}
