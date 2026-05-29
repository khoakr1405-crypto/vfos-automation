/**
 * Shopee Affiliate Link Audit & Registry Integrity Check — Round P37.
 *
 * Performs highly secure, offline-only validation of local affiliate link artifacts
 * and registry database state against strict ownership, format, and duplication checks.
 *
 * Command: tsx scripts/shopee-link-audit-demo.ts [--strict] [--output <path>]
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const EXPECTED_OWNER = 'an_17376660568';
const DEFAULT_REGISTRY_PATH = resolve('production/_commerce/shopee_link_registry.json');
const DEFAULT_ARTIFACT_PATH = 'data/temp/shopee_affiliate_link_artifact.json';
const DEFAULT_CARD_PATH = 'data/temp/selected_product_card.json';

// Parse CLI Options
let values: any;
try {
  const parsed = parseArgs({
    options: {
      strict: { type: 'boolean', default: false },
      output: { type: 'string', default: 'data/temp/shopee_link_audit_status.json' },
      // Support custom overrides for fixtures/testing
      artifactPath: { type: 'string', default: DEFAULT_ARTIFACT_PATH },
      cardPath: { type: 'string', default: DEFAULT_CARD_PATH },
      registryPath: { type: 'string', default: DEFAULT_REGISTRY_PATH },
    },
    allowPositionals: false,
    strict: true,
  });
  values = parsed.values;
} catch (err: any) {
  console.error(`ERROR: Failed to parse arguments: ${err.message}`);
  process.exit(1);
}

const strictMode = values.strict;
const outputPath = values.output;
const artifactPath = values.artifactPath;
const cardPath = values.cardPath;
const registryPath = values.registryPath;

// Helper to safely read and parse JSON
function readJson(filePath: string): any | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

// Check short link formats
function isValidShortLink(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname === 's.shopee.vn' || parsed.hostname === 'shope.ee';
  } catch {
    return url.includes('s.shopee.vn') || url.includes('shope.ee');
  }
}

// Check canonical URL domains
function isValidCanonicalUrl(url: string | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.hostname.endsWith('shopee.vn') || parsed.hostname.endsWith('shopee.com.vn');
  } catch {
    return url.includes('shopee.vn');
  }
}

// Check for unmasked token/cookie/session variables
function containsSensitiveParams(url: string | undefined): boolean {
  if (!url) return false;
  const lowercase = url.toLowerCase();
  return (
    lowercase.includes('cookie=') ||
    lowercase.includes('session=') ||
    lowercase.includes('token=') ||
    lowercase.includes('password=') ||
    lowercase.includes('auth=')
  );
}

function main() {
  console.log('======================================================');
  console.log('🔍   VFOS Shopee Affiliate Link & Registry Auditor');
  console.log('======================================================');
  console.log(`- Strict Mode:       ${strictMode ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`- Expected Owner:    "${EXPECTED_OWNER}"`);
  console.log('------------------------------------------------------');

  const artifact = readJson(artifactPath);
  const card = readJson(cardPath);
  const registry = readJson(registryPath);

  const hasArtifact = !!artifact;
  const hasCard = !!card;
  const hasRegistry = !!registry;

  const checkedArtifactsCount = (hasArtifact ? 1 : 0) + (hasCard ? 1 : 0) + (hasRegistry ? 1 : 0);

  const violations: string[] = [];
  const warnings: string[] = [];

  let status: 'PASS' | 'WARN' | 'FAIL' | 'NO_INPUT' = 'PASS';

  // 1. Missing Input Checks
  if (checkedArtifactsCount === 0) {
    status = 'NO_INPUT';
    const noInputReport = {
      auditVersion: 'v1',
      status,
      ownerExpected: EXPECTED_OWNER,
      summary: {
        checkedArtifacts: 0,
        linksChecked: 0,
        validLinks: 0,
        invalidLinks: 0,
        duplicateLinks: 0,
        ownerMismatches: 0,
      },
      checks: {
        affiliateLinkArtifact: { present: false, status: 'NO_INPUT' },
        selectedProductCard: { present: false, status: 'NO_INPUT' },
        registry: { present: false, status: 'NO_INPUT' },
      },
      violations: ['No Shopee affiliate link artifacts or registries found to audit.'],
      warnings: [],
      recommendedNextAction: 'Generate Shopee affiliate link artifacts first by running the extraction pipeline.',
      generatedAt: new Date().toISOString(),
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(noInputReport, null, 2), 'utf8');

    console.log('⚪ STATUS: NO_INPUT');
    console.log('No inputs detected to perform audit.');
    console.log(`Audit result written to: ${outputPath}`);
    console.log('======================================================\n');
    process.exit(0);
  }

  // Links checked counter & verification metrics
  let linksChecked = 0;
  let validLinks = 0;
  let invalidLinks = 0;
  let duplicateLinks = 0;
  let ownerMismatches = 0;

  // Initialize checks summary block
  const checksBlock: any = {
    affiliateLinkArtifact: { present: hasArtifact, status: 'PASS' },
    selectedProductCard: { present: hasCard, status: 'PASS' },
    registry: { present: hasRegistry, status: 'PASS' },
  };

  // ── AUDIT 1: Affiliate Link Artifact ───────────────────────────────────────
  if (hasArtifact) {
    console.log('[Audit] Inspecting shopee_affiliate_link_artifact.json...');
    const aCheck = checksBlock.affiliateLinkArtifact;

    const shortLink = artifact.shortLink || artifact.extractedLink;
    const canonical = artifact.canonicalUrl;
    const isSuccess = artifact.status === 'SUCCESS';

    if (!isSuccess) {
      warnings.push(`Link extraction status is not SUCCESS (found: ${artifact.status || 'null'}).`);
      aCheck.status = 'WARN';
    }

    if (shortLink) {
      linksChecked++;
      aCheck.shortLinkPresent = true;
      if (!isValidShortLink(shortLink)) {
        violations.push(`Link Artifact: Short link "${shortLink}" format domain is invalid.`);
        invalidLinks++;
        aCheck.status = 'FAIL';
      } else {
        validLinks++;
      }
    } else {
      aCheck.shortLinkPresent = false;
      if (isSuccess) {
        violations.push('Link Artifact: Status is SUCCESS but short link is missing.');
        aCheck.status = 'FAIL';
      }
    }

    if (canonical) {
      aCheck.canonicalUrlPresent = true;
      if (!isValidCanonicalUrl(canonical)) {
        violations.push(`Link Artifact: Canonical URL "${canonical}" has invalid Shopee domain.`);
        aCheck.status = 'FAIL';
      }
      if (containsSensitiveParams(canonical)) {
        violations.push('Link Artifact: Canonical URL contains potential unmasked credentials/session keys.');
        aCheck.status = 'FAIL';
      }

      // Check Owner ID in long URL tracking query parameters
      const urlHasCorrectOwner = canonical.includes(EXPECTED_OWNER);
      aCheck.ownerVerified = urlHasCorrectOwner;
      if (!urlHasCorrectOwner) {
        violations.push(`Link Artifact: Canonical URL tracking parameter mismatch. Expected owner "${EXPECTED_OWNER}" but long link did not contain it.`);
        ownerMismatches++;
        aCheck.status = 'FAIL';
      }
    } else {
      aCheck.canonicalUrlPresent = false;
      warnings.push('Link Artifact: Canonical URL is not present.');
      if (aCheck.status === 'PASS') aCheck.status = 'WARN';
    }
  }

  // ── AUDIT 2: Selected Product Card Consistency ─────────────────────────────
  if (hasCard) {
    console.log('[Audit] Inspecting selected_product_card.json...');
    const cCheck = checksBlock.selectedProductCard;

    cCheck.itemIdPresent = !!card.itemId;
    cCheck.shopIdPresent = !!card.shopId;

    if (!card.itemId || !card.shopId) {
      warnings.push('Product Card: Shop ID or Item ID is missing.');
      cCheck.status = 'WARN';
    }

    const cardOwner = card.affiliateOwnerId;
    cCheck.ownerVerified = cardOwner === EXPECTED_OWNER;
    if (cardOwner !== EXPECTED_OWNER) {
      violations.push(`Product Card: Owner ID mismatch. Found "${cardOwner || 'null'}", expected "${EXPECTED_OWNER}".`);
      ownerMismatches++;
      cCheck.status = 'FAIL';
    }

    // Check card properties against link artifact for strict consistency
    if (hasArtifact) {
      const artShort = artifact.shortLink || artifact.extractedLink;
      if (artShort && card.shortLink && artShort !== card.shortLink) {
        violations.push(`Product Card & Link Artifact: short link mismatch. Card: "${card.shortLink}", Link Artifact: "${artShort}"`);
        cCheck.status = 'FAIL';
      }
      if (artifact.canonicalUrl && card.canonicalUrl && artifact.canonicalUrl !== card.canonicalUrl) {
        violations.push('Product Card & Link Artifact: canonical URL mismatch.');
        cCheck.status = 'FAIL';
      }
      if (artifact.shopid && card.shopId && String(artifact.shopid) !== String(card.shopId)) {
        violations.push('Product Card & Link Artifact: shop ID mismatch.');
        cCheck.status = 'FAIL';
      }
      if (artifact.itemid && card.itemId && String(artifact.itemid) !== String(card.itemId)) {
        violations.push('Product Card & Link Artifact: item ID mismatch.');
        cCheck.status = 'FAIL';
      }
    }
  }

  // ── AUDIT 3: Global Registry Duplication & Integrity ─────────────────────────
  if (hasRegistry) {
    console.log('[Audit] Inspecting global shopee_link_registry.json...');
    const rCheck = checksBlock.registry;

    rCheck.duplicateShortLinks = [];
    rCheck.duplicateCanonicalUrls = [];
    rCheck.duplicateShopItemPairs = [];

    const entries = registry.entries || [];

    // Tracks for duplicate detection
    const shortLinkMap = new Map<string, any[]>();
    const canonicalMap = new Map<string, any[]>();
    const shopItemMap = new Map<string, any[]>();

    for (const entry of entries) {
      if (entry.short_link) {
        if (!shortLinkMap.has(entry.short_link)) shortLinkMap.set(entry.short_link, []);
        shortLinkMap.get(entry.short_link)!.push(entry);
      }
      if (entry.canonical_url) {
        if (!canonicalMap.has(entry.canonical_url)) canonicalMap.set(entry.canonical_url, []);
        canonicalMap.get(entry.canonical_url)!.push(entry);
      }
      if (entry.shopid && entry.itemid) {
        const key = `${entry.shopid}/${entry.itemid}`;
        if (!shopItemMap.has(key)) shopItemMap.set(key, []);
        shopItemMap.get(key)!.push(entry);
      }

      // Check each entry owner ID
      if (entry.affiliate_owner_id !== EXPECTED_OWNER) {
        violations.push(`Registry Entry Mismatch: Entry for "${entry.product_name || 'Unnamed'}" has owner "${entry.affiliate_owner_id}", expected "${EXPECTED_OWNER}".`);
        ownerMismatches++;
        rCheck.status = 'FAIL';
      }
    }

    // Process duplicate short links
    for (const [sLink, list] of shortLinkMap.entries()) {
      if (list.length > 1) {
        duplicateLinks++;
        rCheck.duplicateShortLinks.push(sLink);
        const names = list.map((e) => e.product_name);
        const uniqueNames = new Set(names);
        if (uniqueNames.size > 1) {
          violations.push(`Registry Conflict: Duplicate short link "${sLink}" maps to multiple products: ${JSON.stringify(Array.from(uniqueNames))}`);
          rCheck.status = 'FAIL';
        } else {
          warnings.push(`Registry Duplication: Duplicate short link "${sLink}" maps to same product: "${names[0]}".`);
          if (rCheck.status === 'PASS') rCheck.status = 'WARN';
        }
      }
    }

    // Process duplicate canonical URLs
    for (const [cLink, list] of canonicalMap.entries()) {
      if (list.length > 1) {
        rCheck.duplicateCanonicalUrls.push(cLink);
        const uniqueNames = new Set(list.map((e) => e.product_name));
        if (uniqueNames.size > 1) {
          violations.push(`Registry Conflict: Duplicate canonical URL maps to multiple products: ${JSON.stringify(Array.from(uniqueNames))}`);
          rCheck.status = 'FAIL';
        } else {
          warnings.push(`Registry Duplication: Duplicate canonical URL maps to same product.`);
          if (rCheck.status === 'PASS') rCheck.status = 'WARN';
        }
      }
    }

    // Process duplicate shop/item pairs
    for (const [pair, list] of shopItemMap.entries()) {
      if (list.length > 1) {
        rCheck.duplicateShopItemPairs.push(pair);
        const uniqueNames = new Set(list.map((e) => e.product_name));
        if (uniqueNames.size > 1) {
          violations.push(`Registry Conflict: Duplicate product shop/item pair "${pair}" maps to multiple products: ${JSON.stringify(Array.from(uniqueNames))}`);
          rCheck.status = 'FAIL';
        } else {
          warnings.push(`Registry Duplication: Duplicate product shop/item pair "${pair}" maps to same product.`);
          if (rCheck.status === 'PASS') rCheck.status = 'WARN';
        }
      }
    }
  } else {
    // Missing registry
    warnings.push('Registry: Global Shopee link registry database not found at path.');
    checksBlock.registry.status = 'WARN';
  }

  // ── DECIDE STATUS ─────────────────────────────────────────────────────────
  if (violations.length > 0) {
    status = 'FAIL';
  } else if (warnings.length > 0) {
    status = 'WARN';
  } else {
    status = 'PASS';
  }

  // Strict enforcement override
  if (strictMode && status === 'WARN') {
    status = 'FAIL';
    violations.push('Strict Mode Enforcement: Audit warnings promoted to FAIL status.');
  }

  // 4. Construct shopee_link_audit_status.json
  const auditReport = {
    auditVersion: 'v1',
    status,
    ownerExpected: EXPECTED_OWNER,
    summary: {
      checkedArtifacts: checkedArtifactsCount,
      linksChecked,
      validLinks,
      invalidLinks,
      duplicateLinks,
      ownerMismatches,
    },
    checks: checksBlock,
    violations,
    warnings,
    recommendedNextAction:
      status === 'FAIL'
        ? 'Do not use these Shopee link artifacts! Review violations and correct links.'
        : status === 'WARN'
          ? 'Shopee links are acceptable, but review duplication warnings or missing inputs.'
          : 'Shopee affiliate link artifacts are safe for review pipeline usage.',
    generatedAt: new Date().toISOString(),
  };

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(auditReport, null, 2), 'utf8');

    console.log(`\n======================================================`);
    if (status === 'PASS') {
      console.log('🟢 STATUS: PASS');
    } else if (status === 'WARN') {
      console.log('⚠️  STATUS: WARN');
    } else {
      console.log('🔴 STATUS: FAIL');
    }
    console.log('======================================================');
    console.log(`Artifacts Audited: ${checkedArtifactsCount}`);
    console.log(`Links Checked:     ${linksChecked}`);
    console.log(`Owner Mismatches:  ${ownerMismatches}`);
    console.log(`Duplicate Links:   ${duplicateLinks}`);
    console.log(`Audit report exported successfully to: ${outputPath}`);

    if (violations.length > 0) {
      console.log('\nViolations:');
      for (const v of violations) console.log(`  - ${v}`);
    }
    if (warnings.length > 0) {
      console.log('\nWarnings:');
      for (const w of warnings) console.log(`  - ${w}`);
    }
    console.log('======================================================\n');

    process.exit(status === 'FAIL' ? 1 : 0);
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write audit status report: ${err.message}`);
    process.exit(1);
  }
}

main();
