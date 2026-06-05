/**
 * Shopee Card-from-Registry — no-click Product Card bridge.
 *
 * Promotes an EXISTING verified entry in the Shopee link registry into the
 * Product Card pipeline WITHOUT any browser/CDP/live click. It lifts the
 * registry entry into the link-artifact shape the offline card builder reads,
 * then runs that builder.
 *
 *   registry entry  →  data/temp/shopee_affiliate_link_artifact.json
 *                   →  (shopee:builder)  →  data/temp/selected_product_card.json
 *
 * Selection:
 *   --short-link <url>   exact short_link match
 *   --itemid <id>        exact itemid match
 *   --newest             newest verified+owner-matching entry (also the default
 *                        when no selector is given)
 *   --no-build           write the link artifact only; skip the builder step
 *
 * Security HARD: never opens a browser, never clicks Shopee, never calls an API,
 * never resolves the link again, never writes the registry, never prints a raw
 * credential. The canonical deep-link is sanitised (credential_token / gads_t_sig
 * / token / session / signature params stripped) before it is persisted.
 *
 * Command: pnpm shopee:card-from-registry --short-link <url>
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  containsSensitiveParams,
  maskUrlForLog,
  sanitizeProductImageUrl,
  sanitizeShopeeCanonicalUrl,
} from '../packages/shopee/src/url-sanitize.js';

const EXPECTED_OWNER = 'an_17376660568';
const VERIFIED_STATUS = 'VERIFIED_FROM_LONG_LINK';
const REGISTRY_PATH = resolve('production/_commerce/shopee_link_registry.json');
const ARTIFACT_PATH = 'data/temp/shopee_affiliate_link_artifact.json';
const CARD_PATH = 'data/temp/selected_product_card.json';

interface RegistryEntry {
  product_name?: string;
  shopid?: string | null;
  itemid?: string | null;
  short_link?: string | null;
  canonical_url?: string | null;
  affiliate_owner_id?: string | null;
  affiliate_link_status?: string | null;
  score?: number | string;
  criteria?: string;
  product_image_url?: string | null;
  last_seen_at?: string;
}

function fail(message: string): never {
  console.error(`[CardFromRegistry] BLOCKED: ${message}`);
  process.exit(1);
}

function loadRegistry(): RegistryEntry[] {
  if (!existsSync(REGISTRY_PATH)) {
    fail(`registry not found at ${REGISTRY_PATH}`);
  }
  let parsed: { entries?: RegistryEntry[] };
  try {
    parsed = JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  } catch (err) {
    return fail(`could not parse registry JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed.entries) || parsed.entries.length === 0) {
    return fail('registry has no entries');
  }
  return parsed.entries;
}

function isVerifiedOwned(e: RegistryEntry): boolean {
  return e.affiliate_link_status === VERIFIED_STATUS && e.affiliate_owner_id === EXPECTED_OWNER;
}

function newestOf(entries: RegistryEntry[]): RegistryEntry | null {
  const verified = entries.filter(isVerifiedOwned);
  if (verified.length === 0) return null;
  return [...verified].sort((a, b) =>
    String(b.last_seen_at ?? '').localeCompare(String(a.last_seen_at ?? '')),
  )[0];
}

async function main() {
  const { values } = parseArgs({
    options: {
      'short-link': { type: 'string' },
      itemid: { type: 'string' },
      newest: { type: 'boolean', default: false },
      'no-build': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const shortLinkArg = (values['short-link'] as string | undefined)?.trim();
  const itemidArg = (values.itemid as string | undefined)?.trim();
  // --newest is the explicit alias of the default branch (no selector), so it
  // needs no dedicated variable; both fall through to newestOf() below.
  const skipBuild = !!values['no-build'];

  const entries = loadRegistry();

  // ── Select entry ──────────────────────────────────────────────────────────
  let entry: RegistryEntry | null = null;
  let selector = '';
  if (shortLinkArg) {
    selector = `short-link=${shortLinkArg}`;
    const norm = (s: string) => s.replace(/\/+$/, '');
    entry = entries.find((e) => e.short_link && norm(e.short_link) === norm(shortLinkArg)) ?? null;
  } else if (itemidArg) {
    selector = `itemid=${itemidArg}`;
    entry = entries.find((e) => String(e.itemid ?? '') === itemidArg) ?? null;
  } else {
    // No selector OR --newest → newest verified+owned entry.
    selector = 'newest';
    entry = newestOf(entries);
  }

  if (!entry) {
    fail(`no registry entry matched (${selector})`);
  }

  // ── Validate ──────────────────────────────────────────────────────────────
  if (entry.affiliate_link_status !== VERIFIED_STATUS) {
    fail(
      `entry not verified (status=${entry.affiliate_link_status ?? 'none'}, expected ${VERIFIED_STATUS})`,
    );
  }
  if (entry.affiliate_owner_id !== EXPECTED_OWNER) {
    fail(`owner mismatch (got ${entry.affiliate_owner_id ?? 'none'}, expected ${EXPECTED_OWNER})`);
  }
  for (const [field, val] of [
    ['product_name', entry.product_name],
    ['shopid', entry.shopid],
    ['itemid', entry.itemid],
    ['short_link', entry.short_link],
  ] as const) {
    if (!val) fail(`entry missing required field: ${field}`);
  }

  // ── Sanitise canonical → never persist a raw credential ──────────────────
  const { cleanUrl: canonicalCleanUrl, strippedParams } = sanitizeShopeeCanonicalUrl(
    entry.canonical_url,
  );
  if (containsSensitiveParams(canonicalCleanUrl)) {
    fail('sanitised canonical still contains sensitive params — refusing to write artifact');
  }

  console.log('[CardFromRegistry] Selected registry entry (no-click):');
  console.log(`  product   : ${entry.product_name}`);
  console.log(`  shopid/itemid: ${entry.shopid} / ${entry.itemid}`);
  console.log(`  short_link: ${entry.short_link}`);
  console.log(`  owner     : ${entry.affiliate_owner_id} (verified ✅)`);
  console.log(`  canonical : ${maskUrlForLog(canonicalCleanUrl)}`);
  if (strippedParams.length > 0) {
    console.log(`  stripped  : ${strippedParams.join(', ')}`);
  }

  // ── Write the builder input artifact ─────────────────────────────────────
  const artifact = {
    status: 'SUCCESS',
    productName: entry.product_name,
    shopid: entry.shopid,
    itemid: entry.itemid,
    shortLink: entry.short_link,
    canonicalUrl: canonicalCleanUrl,
    canonicalCleanUrl,
    canonicalStrippedParams: strippedParams,
    affiliateOwnerId: entry.affiliate_owner_id,
    ownerVerified: true,
    score: entry.score ?? 'unknown',
    criteria: entry.criteria ?? 'unknown',
    productImageUrl: sanitizeProductImageUrl(entry.product_image_url),
    source: 'card-from-registry (no-click)',
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true });
  writeFileSync(ARTIFACT_PATH, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`[CardFromRegistry] Wrote link artifact → ${ARTIFACT_PATH}`);

  if (skipBuild) {
    console.log('[CardFromRegistry] --no-build set: skipping product card builder.');
    console.log(`[CardFromRegistry] Next: pnpm shopee:builder  (reads ${ARTIFACT_PATH})`);
    process.exit(0);
  }

  // ── Run the offline card builder (no-click) ──────────────────────────────
  console.log('[CardFromRegistry] Running offline product card builder (pnpm shopee:builder)...');
  const builderRes = spawnSync('npx', ['tsx', 'scripts/shopee-product-card-builder.ts'], {
    shell: true,
    stdio: 'inherit',
  });

  if (builderRes.status !== 0 || !existsSync(CARD_PATH)) {
    fail(`builder did not produce ${CARD_PATH} (exit=${builderRes.status})`);
  }

  // Sanity: card matches the selected entry.
  try {
    const card = JSON.parse(readFileSync(CARD_PATH, 'utf8'));
    if (String(card.itemId) !== String(entry.itemid)) {
      fail(`built card itemId (${card.itemId}) does not match selected entry (${entry.itemid})`);
    }
    console.log('[CardFromRegistry] Product Card built ✅');
    console.log(`  card name : ${card.name}`);
    console.log(`  card item : ${card.shopId} / ${card.itemId}`);
    console.log(`  card owner: ${card.affiliateOwnerId}`);
    console.log(`  card path : ${CARD_PATH}`);
  } catch (err) {
    fail(`could not verify built card: ${(err as Error).message}`);
  }

  console.log('[CardFromRegistry] Done — no click, no browser, no live extraction.');
  process.exit(0);
}

main().catch((err) => {
  console.error('[CardFromRegistry] FATAL:', err);
  process.exit(1);
});
