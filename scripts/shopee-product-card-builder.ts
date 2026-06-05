/**
 * Shopee Product Card Builder Script — Round P25.
 *
 * Highly secure, offline-only data adapter.
 * Parses raw affiliate link extraction outputs, normalizes the properties into a compliant
 * selected_product_card.json schema for downstream pipeline ingestion, and synchronizes
 * verified entries in the central link registry database with zero external dependencies.
 *
 * Command: tsx scripts/shopee-product-card-builder.ts [--input <path>] [--output <path>]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import {
  maskUrlForLog,
  sanitizeProductImageUrl,
  sanitizeShopeeCanonicalUrl,
} from '../packages/shopee/src/url-sanitize.js';

const EXPECTED_OWNER = 'an_17376660568';
const REGISTRY_PATH = resolve('production/_commerce/shopee_link_registry.json');

const options = {
  input: { type: 'string' as const },
  output: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

async function main() {
  const inputPath = values.input || 'data/temp/shopee_affiliate_link_artifact.json';
  const outputPath = values.output || 'data/temp/selected_product_card.json';

  console.log('[CardBuilder] Initiating offline product card normalization...');
  console.log(`[CardBuilder] Input Artifact: ${inputPath}`);
  console.log(`[CardBuilder] Output Card Target: ${outputPath}`);

  // Step 1: Validate input artifact presence
  if (!existsSync(inputPath)) {
    console.warn(`[CardBuilder] HALTED: Input artifact does not exist at: ${inputPath}`);
    process.exit(1);
  }

  let rawArtifact: any = null;
  try {
    rawArtifact = JSON.parse(readFileSync(inputPath, 'utf8'));
  } catch (err: any) {
    console.error(`[CardBuilder] FATAL: Could not parse input JSON artifact: ${err.message}`);
    process.exit(1);
  }

  // Step 2: Validate extraction state status
  if (!rawArtifact || rawArtifact.status !== 'SUCCESS') {
    console.warn(
      `[CardBuilder] HALTED: Raw extraction state was not 'SUCCESS'. Target status: ${rawArtifact?.status || 'UNKNOWN'}`,
    );
    process.exit(0);
  }

  const { productName, shopid, itemid, shortLink, canonicalUrl, ownerVerified } = rawArtifact;

  // Step 3: Validate affiliate owner integrity parameters
  if (!ownerVerified) {
    console.warn('[CardBuilder] HALTED: Affiliate owner is not verified to match expected ID.');
    process.exit(1);
  }

  console.log(`[CardBuilder] Raw inputs validated! Product: "${productName}"`);

  // Sanitize the canonical deep-link: strip credential/session/signature query
  // params (credential_token, gads_t_sig, …) while keeping the public affiliate
  // tracking (utm_source/mmp_pid carry the owner). The Product Card only ever
  // stores the cleaned URL — never the raw credential-bearing link.
  const { cleanUrl: canonicalCleanUrl, strippedParams } = sanitizeShopeeCanonicalUrl(
    rawArtifact.canonicalCleanUrl || canonicalUrl,
  );
  if (strippedParams.length > 0) {
    console.log(
      `[CardBuilder] Stripped ${strippedParams.length} sensitive canonical param(s): ${strippedParams.join(', ')}`,
    );
  }
  console.log(`[CardBuilder] Canonical (masked): ${maskUrlForLog(canonicalCleanUrl)}`);

  // Step 4: Construct standard normalized Selected Product Card schema
  const productCard = {
    id: itemid || 'unknown_item',
    name: productName || 'Unnamed Product',
    shopId: shopid || 'unknown_shop',
    itemId: itemid || 'unknown_item',
    shortLink: shortLink || '',
    canonicalUrl: canonicalCleanUrl,
    canonicalCleanUrl,
    // NOTE: the names of stripped params are intentionally NOT stored on the
    // card (kept only in logs + the link artifact) so the pipeline-facing card
    // never contains a credential-shaped string.
    affiliateOwnerId: EXPECTED_OWNER,
    source: 'shopee_affiliate_cdp',
    validationStatus: 'VERIFIED',
    score: rawArtifact.score || 'unknown',
    scoringCriteria: rawArtifact.criteria || 'unknown',
    productImageUrl: sanitizeProductImageUrl(rawArtifact.productImageUrl) ?? null,
    createdAt: new Date().toISOString(),
  };

  // Ensure output directory buffer exists
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(productCard, null, 2), 'utf8');
  console.log(
    `[CardBuilder] Successfully exported normalized Selected Product Card to: ${outputPath}`,
  );

  // Step 5: Optionally update central Shopee link registry database
  try {
    if (existsSync(REGISTRY_PATH)) {
      const registryContent = readFileSync(REGISTRY_PATH, 'utf8');
      const registry = JSON.parse(registryContent);

      if (registry && Array.isArray(registry.entries)) {
        const isAlreadyRegistered = registry.entries.some(
          (entry: any) =>
            entry.short_link === shortLink ||
            (shopid && itemid && entry.shopid === shopid && entry.itemid === itemid),
        );

        if (!isAlreadyRegistered) {
          registry.entries.push({
            product_name: productName,
            shopid,
            itemid,
            short_link: shortLink,
            canonical_url: canonicalCleanUrl,
            affiliate_owner_id: EXPECTED_OWNER,
            affiliate_link_status: 'VERIFIED_FROM_LONG_LINK',
            source: 'cdp_browser_targeted_click',
            notes: 'Round P25 registered from card builder transformation pipeline',
            first_seen_at: new Date().toISOString(),
            last_seen_at: new Date().toISOString(),
            times_seen: 1,
          });

          registry.updated_at = new Date().toISOString();
          writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2), 'utf8');
          console.log('[CardBuilder] Successfully synchronized entry in central link registry.');
        } else {
          console.log('[CardBuilder] Entry already verified in link registry. Skipping sync.');
        }
      }
    }
  } catch (err: any) {
    console.warn(`[CardBuilder] WARNING: Failed to synchronize with link registry: ${err.message}`);
  }

  console.log('[CardBuilder] Transformation workflow completed successfully!');
  process.exit(0);
}

main().catch((e) => {
  console.error('[CardBuilder] FATAL unhandled rejection:', e);
  process.exit(1);
});
