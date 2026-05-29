/**
 * Shopee CDP Browser Preflight Diagnostic Script — Round P23.
 *
 * Highly secure, read-only Chrome DevTools Protocol preflight engine.
 * Connects strictly to 127.0.0.1:9222 to detect open targets, verify tab hydration,
 * and identify obstacles (CAPTCHA, Login) with ZERO mutations, ZERO clicks, and ZERO token logging.
 *
 * Command: tsx scripts/shopee-cdp-preflight-demo.ts [--output <path>]
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { chromium } from 'playwright';

const options = {
  output: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

async function main() {
  const outputPath = values.output || 'data/temp/shopee_cdp_preflight_status.json';

  console.log('[CDPPreflight] Initiating secure read-only browser preflight diagnostic...');
  console.log(`[CDPPreflight] Export Target: ${outputPath}`);

  // Ensure output directory exists
  try {
    mkdirSync(dirname(outputPath), { recursive: true });
  } catch (err) {}

  let browser: any = null;

  try {
    // Attempt CDP connection strictly on Localhost port 9222
    browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  } catch (err: any) {
    console.warn('[CDPPreflight] WARNING: Could not connect to browser on 127.0.0.1:9222.');
    console.warn(`[CDPPreflight] Reason: ${err.message}`);

    const connectionFailedArtifact = {
      cdpConnected: false,
      shopeeTabFound: false,
      pageHydrated: false,
      getLinkButtonPresent: false,
      obstaclesDetected: {
        captcha: false,
        loginRequired: false,
      },
      preflightPassed: false,
      error:
        'Could not connect to browser debug port 127.0.0.1:9222. Please ensure Cốc Cốc or Chrome is running with --remote-debugging-port=9222.',
      generatedAt: new Date().toISOString(),
    };

    writeFileSync(outputPath, JSON.stringify(connectionFailedArtifact, null, 2), 'utf8');
    console.log(
      `[CDPPreflight] Successfully exported connection failure diagnostic to: ${outputPath}`,
    );
    process.exit(0);
  }

  try {
    const contexts = browser.contexts();
    let targetPage: any = null;

    // Scan contexts and pages for Shopee Affiliate Product Offer target
    for (const ctx of contexts) {
      for (const p of ctx.pages()) {
        const url = p.url();
        if (url.includes('affiliate.shopee.vn/offer/product_offer')) {
          targetPage = p;
          break;
        }
      }
      if (targetPage) break;
    }

    if (!targetPage) {
      console.warn(
        '[CDPPreflight] WARNING: Active Shopee Affiliate Product Offer tab was not found.',
      );

      const tabNotFoundArtifact = {
        cdpConnected: true,
        shopeeTabFound: false,
        pageHydrated: false,
        getLinkButtonPresent: false,
        obstaclesDetected: {
          captcha: false,
          loginRequired: false,
        },
        preflightPassed: false,
        error:
          'Active Shopee Affiliate Product Offer page tab not found in active browser targets.',
        generatedAt: new Date().toISOString(),
      };

      writeFileSync(outputPath, JSON.stringify(tabNotFoundArtifact, null, 2), 'utf8');
      console.log(
        `[CDPPreflight] Successfully exported tab-not-found diagnostic to: ${outputPath}`,
      );
      await browser.close();
      process.exit(0);
    }

    console.log(
      `[CDPPreflight] Found active Shopee target tab: "${targetPage.url().slice(0, 70)}..."`,
    );

    // Perform read-only evaluations of target DOM structure
    const diagnostics = await targetPage.evaluate(() => {
      // Find "Lấy link" or "Get link" text buttons
      const buttons = Array.from(document.querySelectorAll('*')).filter((el) => {
        const text = (el.textContent || '').trim();
        return (text === 'Lấy link' || text === 'Get link') && el.children.length === 0;
      });

      // Detect potential CAPTCHA verification overlays
      const hasCaptchaClass = !!document.querySelector(
        '.shopee-captcha, .captcha-modal, iframe[src*="captcha"]',
      );
      const bodyText = document.body ? document.body.textContent || '' : '';
      const containsCaptchaKeywords =
        bodyText.includes('CAPTCHA') ||
        bodyText.includes('Mã xác minh') ||
        bodyText.includes('Xác minh bảo mật');

      // Detect active login requirement prompts
      const hasLoginPrompt = !!document.querySelector(
        '.login-modal, .shopee-login, [href*="/login"]',
      );

      return {
        getLinkButtonCount: buttons.length,
        hasCaptcha: hasCaptchaClass || containsCaptchaKeywords,
        hasLoginRequired: hasLoginPrompt,
      };
    });

    const preflightPassed =
      diagnostics.getLinkButtonCount > 0 &&
      !diagnostics.hasCaptcha &&
      !diagnostics.hasLoginRequired;

    const successfulDiagnosticArtifact = {
      cdpConnected: true,
      shopeeTabFound: true,
      pageHydrated: diagnostics.getLinkButtonCount > 0,
      getLinkButtonPresent: diagnostics.getLinkButtonCount > 0,
      obstaclesDetected: {
        captcha: diagnostics.hasCaptcha,
        loginRequired: diagnostics.hasLoginRequired,
      },
      preflightPassed,
      generatedAt: new Date().toISOString(),
    };

    writeFileSync(outputPath, JSON.stringify(successfulDiagnosticArtifact, null, 2), 'utf8');
    console.log(
      `[CDPPreflight] Diagnostics complete! Preflight Status: ${preflightPassed ? 'PASSED 🟢' : 'BLOCKED 🔴'}`,
    );
    console.log('- Connection: connected');
    console.log('- Tab target: found');
    console.log(`- Button presence: ${diagnostics.getLinkButtonCount > 0 ? 'found' : 'not found'}`);
    console.log(`- CAPTCHA obstacle: ${diagnostics.hasCaptcha ? 'YES (action blocked)' : 'no'}`);
    console.log(
      `- Login requirement: ${diagnostics.hasLoginRequired ? 'YES (action blocked)' : 'no'}`,
    );
    console.log(`[CDPPreflight] Exported diagnostics to: ${outputPath}`);

    await browser.close();
    process.exit(0);
  } catch (err: any) {
    console.error(`[CDPPreflight] FATAL: Unexpected diagnostic error: ${err.message}`);
    if (browser) {
      await browser.close();
    }
    process.exit(1);
  }
}

main().catch((e) => {
  console.error('[CDPPreflight] FATAL unhandled reject:', e);
  process.exit(1);
});
