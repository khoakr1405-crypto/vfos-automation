/**
 * Shopee CDP Link Extractor Controlled Script — Round P24.
 *
 * Establishes a highly controlled link extraction pipeline.
 * Performs a single targeted click on the first visible product card's "Lấy link" button,
 * reads short link modal values, resolves redirect urls, and checks duplication and owner parameters.
 *
 * Command: tsx scripts/shopee-link-extractor-demo.ts [--output <path>]
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const EXPECTED_OWNER = 'an_17376660568';
const REGISTRY_PATH = resolve('production/_commerce/shopee_link_registry.json');

const options = {
  output: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

async function resolveShortLink(shortUrl: string): Promise<string | null> {
  try {
    const head = await fetch(shortUrl, {
      method: 'HEAD',
      redirect: 'manual',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      },
    });
    const loc = head.headers.get('location');
    if (loc) return loc;
    const get = await fetch(shortUrl, { method: 'GET' });
    return get.url;
  } catch (e: any) {
    console.error(`[LinkExtractor] Resolve fail: ${e.message}`);
    return null;
  }
}

function extractShopidItemid(canonical: string): { shopid: string | null; itemid: string | null } {
  try {
    const u = new URL(canonical);
    const m1 = u.pathname.match(/\/[^/]+\/(\d+)\/(\d+)/);
    if (m1) return { shopid: m1[1], itemid: m1[2] };
    const m2 = u.pathname.match(/\/(?:opaanlp|product|universal-link\/product)\/(\d+)\/(\d+)/);
    if (m2) return { shopid: m2[1], itemid: m2[2] };
  } catch {}
  return { shopid: null, itemid: null };
}

function isDuplicate(productName: string, shopid: string | null, itemid: string | null): boolean {
  try {
    const content = readFileSync(REGISTRY_PATH, 'utf8');
    const registry = JSON.parse(content);
    if (!registry || !Array.isArray(registry.entries)) return false;

    for (const entry of registry.entries) {
      if (entry.product_name === productName) return true;
      if (shopid && itemid && entry.shopid === shopid && entry.itemid === itemid) return true;
    }
  } catch (err) {}
  return false;
}

async function main() {
  const outputPath = values.output || 'data/temp/shopee_affiliate_link_artifact.json';

  console.log('[LinkExtractor] Initiating controlled link extraction pipeline...');
  console.log(`[LinkExtractor] Output Target: ${outputPath}`);

  // Step 1: Run P23 Preflight diagnostic check first
  console.log('[LinkExtractor] Step 1: Running Preflight connection check...');
  const preflight = spawnSync('npx', ['tsx', 'scripts/shopee-cdp-preflight-demo.ts'], {
    encoding: 'utf8',
  });

  // Read preflight status file
  let preflightPassed = false;
  try {
    const preflightContent = JSON.parse(
      readFileSync('data/temp/shopee_cdp_preflight_status.json', 'utf8'),
    );
    preflightPassed = !!preflightContent.preflightPassed;
  } catch (err) {
    preflightPassed = false;
  }

  if (!preflightPassed) {
    console.warn(
      '[LinkExtractor] HALTED: Preflight check did not pass. Action suspended to protect account.',
    );

    const haltedArtifact = {
      status: 'SUSPENDED',
      reason: 'PREFLIGHT_CHECK_FAILED',
      extractedLink: null,
      generatedAt: new Date().toISOString(),
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(haltedArtifact, null, 2), 'utf8');
    console.log(`[LinkExtractor] Exported suspension state to: ${outputPath}`);
    process.exit(0);
  }

  console.log('[LinkExtractor] Step 2: Preflight passed! Initiating CDP Browser connection...');
  let browser: any = null;

  try {
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
    const contexts = browser.contexts();
    let page: any = null;

    for (const ctx of contexts) {
      for (const p of ctx.pages()) {
        if (p.url().includes('affiliate.shopee.vn/offer/product_offer')) {
          page = p;
          break;
        }
      }
      if (page) break;
    }

    if (!page) {
      console.warn(
        '[LinkExtractor] Target Shopee Affiliate Offer page tab was closed after preflight.',
      );
      process.exit(1);
    }

    // Step 3: Read first visible product card (target_count = 1 ceiling)
    console.log('[LinkExtractor] Step 3: Inspecting visible product cards on page...');
    const products = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('*')).filter((el) => {
        const text = (el.textContent || '').trim();
        return (text === 'Lấy link' || text === 'Get link') && el.children.length === 0;
      });

      return buttons.slice(0, 1).map((btn, idx) => {
        let card: Element | null = btn;
        for (let i = 0; i < 12 && card; i++) {
          const txt = (card.textContent || '').trim();
          if (txt.length > 30 && txt.length < 400) break;
          card = card.parentElement;
        }
        const name = ((card?.textContent || '').trim().match(/^[^₫]+/)?.[0] || '')
          .trim()
          .slice(0, 120);
        return { idx, name };
      });
    });

    if (products.length === 0) {
      console.log('[LinkExtractor] No visible product cards found. Exiting.');
      const noProductsArtifact = {
        status: 'SUSPENDED',
        reason: 'NO_VISIBLE_PRODUCTS',
        extractedLink: null,
        generatedAt: new Date().toISOString(),
      };
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(noProductsArtifact, null, 2), 'utf8');
      await browser.close();
      process.exit(0);
    }

    const targetProduct = products[0];
    console.log(`[LinkExtractor] Identified target product: "${targetProduct.name}"`);

    // Step 4: Perform duplication check on target product name prior to click
    if (isDuplicate(targetProduct.name, null, null)) {
      console.warn(
        '[LinkExtractor] SKIPPED: Product is already registered as a duplicate in registry.',
      );
      const duplicateArtifact = {
        status: 'SKIPPED_DUPLICATE',
        reason: 'PRODUCT_NAME_DUPLICATE',
        productName: targetProduct.name,
        extractedLink: null,
        generatedAt: new Date().toISOString(),
      };
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(duplicateArtifact, null, 2), 'utf8');
      await browser.close();
      process.exit(0);
    }

    // Step 5: Perform targeted click to open link modal
    console.log('[LinkExtractor] Step 4: Performing controlled click on "Lấy link" button...');
    const clicked = await page.evaluate((idx: number) => {
      const btns = Array.from(document.querySelectorAll('*')).filter((el) => {
        const text = (el.textContent || '').trim();
        return (text === 'Lấy link' || text === 'Get link') && el.children.length === 0;
      });
      const btn = btns[idx] as HTMLElement | undefined;
      if (!btn) return false;
      btn.click();
      return true;
    }, targetProduct.idx);

    if (!clicked) {
      console.error('[LinkExtractor] Failed to click targeted button.');
      await browser.close();
      process.exit(1);
    }

    // Wait for the modal interface to fully render
    await page.waitForTimeout(2500);

    // Retrieve generated short link from the input element
    const shortLink = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, textarea')) as (
        | HTMLInputElement
        | HTMLTextAreaElement
      )[];
      for (const input of inputs) {
        if (input.value && /^https?:\/\/(s\.)?shopee\.vn\//.test(input.value)) {
          return input.value;
        }
      }
      return null;
    });

    // Close the modal cleanly
    await page.keyboard.press('Escape');
    await page.waitForTimeout(800);

    if (!shortLink) {
      console.warn(
        '[LinkExtractor] WARNING: Could not find generated short link input inside modal.',
      );
      await browser.close();
      process.exit(1);
    }

    console.log(`[LinkExtractor] Extracted Short Link: ${shortLink}`);

    // Step 6: Resolve canonical URL to fetch target queries and check owner ID
    console.log('[LinkExtractor] Step 5: Resolving short URL redirection...');
    const canonical = await resolveShortLink(shortLink);
    if (!canonical) {
      console.warn('[LinkExtractor] WARNING: Failed to resolve canonical redirect target.');
      await browser.close();
      process.exit(1);
    }

    console.log(`[LinkExtractor] Resolved Canonical: ${canonical}`);
    const { shopid, itemid } = extractShopidItemid(canonical);

    // Perform post-resolve duplicate check
    if (isDuplicate(targetProduct.name, shopid, itemid)) {
      console.warn(
        '[LinkExtractor] SKIPPED: Product shopid/itemid is already registered in registry.',
      );
      const duplicatePostArtifact = {
        status: 'SKIPPED_DUPLICATE',
        reason: 'PRODUCT_ID_DUPLICATE',
        productName: targetProduct.name,
        shopid,
        itemid,
        extractedLink: null,
        generatedAt: new Date().toISOString(),
      };
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(duplicatePostArtifact, null, 2), 'utf8');
      await browser.close();
      process.exit(0);
    }

    // Verify correct affiliate owner tracking ID parameters
    const canonicalUrl = new URL(canonical);
    const mmpPid = canonicalUrl.searchParams.get('mmp_pid');
    const utmSource = canonicalUrl.searchParams.get('utm_source');
    const ownerVerified = mmpPid === EXPECTED_OWNER || utmSource === EXPECTED_OWNER;

    if (!ownerVerified) {
      console.warn(
        `[LinkExtractor] WARNING: Owner mismatch! Expected ${EXPECTED_OWNER}, got mmp_pid=${mmpPid}, utm_source=${utmSource}`,
      );
      const mismatchArtifact = {
        status: 'FAILED_VALIDATION',
        reason: 'AFFILIATE_OWNER_MISMATCH',
        productName: targetProduct.name,
        shortLink,
        canonicalUrl: canonical,
        ownerVerified: false,
        generatedAt: new Date().toISOString(),
      };
      mkdirSync(dirname(outputPath), { recursive: true });
      writeFileSync(outputPath, JSON.stringify(mismatchArtifact, null, 2), 'utf8');
      await browser.close();
      process.exit(0);
    }

    // Export successful controlled link extraction details
    const successArtifact = {
      status: 'SUCCESS',
      productName: targetProduct.name,
      shopid,
      itemid,
      shortLink,
      canonicalUrl: canonical,
      ownerVerified: true,
      generatedAt: new Date().toISOString(),
    };

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(successArtifact, null, 2), 'utf8');
    console.log('[LinkExtractor] Controlled link extraction completed successfully!');
    console.log(`[LinkExtractor] Output artifact exported to: ${outputPath}`);

    await browser.close();
    process.exit(0);
  } catch (err: any) {
    console.error(`[LinkExtractor] FATAL: Unexpected extraction error: ${err.message}`);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[LinkExtractor] FATAL unhandled rejection:', e);
  process.exit(1);
});
