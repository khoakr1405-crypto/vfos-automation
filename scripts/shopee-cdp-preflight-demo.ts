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
        'Could not connect to browser debug port 127.0.0.1:9222. Please ensure Cốc Cốc (the only supported browser for the Shopee Affiliate flow) is running with --remote-debugging-port=9222.',
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
      // NOTE: no named helper functions inside evaluate — esbuild (tsx) injects a
      // `__name(...)` wrapper for named/const-assigned functions which is undefined
      // in the serialized browser context. Visibility is checked inline below.

      // Find "Lấy link" or "Get link" leaf buttons — only present on the
      // authenticated affiliate catalog, so a strong "logged-in" signal.
      const buttons = Array.from(document.querySelectorAll('*')).filter((el) => {
        const text = (el.textContent || '').trim();
        return (text === 'Lấy link' || text === 'Get link') && el.children.length === 0;
      });

      // Product cards present on the catalog (positive authenticated signal).
      const productCardCount = document.querySelectorAll(
        '[class*="product-card"], [class*="offer-item"], [class*="product-item"], [data-sqe="item"]',
      ).length;

      // Account / avatar visible (best-effort positive signal).
      const accountVisible = !!document.querySelector(
        '[class*="avatar"], [class*="account"], [class*="user-info"], img[src*="avatar"]',
      );

      // Detect potential CAPTCHA verification overlays.
      const hasCaptchaClass = !!document.querySelector(
        '.shopee-captcha, .captcha-modal, iframe[src*="captcha"]',
      );
      const bodyText = document.body ? document.body.textContent || '' : '';
      const containsCaptchaKeywords =
        bodyText.includes('CAPTCHA') ||
        bodyText.includes('Mã xác minh') ||
        bodyText.includes('Xác minh bảo mật');

      // Detect a REAL login wall only: a *visible* login modal / login form, or a
      // redirect to a login URL. A stray `[href*="/login"]` link (footer, nav menu)
      // still exists on logged-in pages and must NOT count as a login requirement.
      const loginModal = document.querySelector(
        '.login-modal, .shopee-login, [class*="login-modal"], [class*="login-page"]',
      ) as HTMLElement | null;
      let visibleLoginModal = false;
      if (loginModal) {
        const s = window.getComputedStyle(loginModal);
        const r = loginModal.getBoundingClientRect();
        visibleLoginModal =
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          Number.parseFloat(s.opacity || '1') !== 0 &&
          r.width > 0 &&
          r.height > 0;
      }
      let visiblePasswordInput = false;
      for (const inp of Array.from(document.querySelectorAll('input[type="password"]'))) {
        const s = window.getComputedStyle(inp as HTMLElement);
        const r = (inp as HTMLElement).getBoundingClientRect();
        if (
          s.display !== 'none' &&
          s.visibility !== 'hidden' &&
          Number.parseFloat(s.opacity || '1') !== 0 &&
          r.width > 0 &&
          r.height > 0
        ) {
          visiblePasswordInput = true;
          break;
        }
      }
      const onLoginUrl =
        location.pathname.includes('/login') ||
        location.href.includes('/buyer/login') ||
        location.href.includes('/seller/login');
      const hasLoginWall = visibleLoginModal || visiblePasswordInput || onLoginUrl;

      // Payment / Tax banner — informational warning only, never a login block.
      const paymentTaxBanner =
        bodyText.includes('Thanh toán') ||
        bodyText.includes('Thuế') ||
        bodyText.includes('thuế') ||
        bodyText.includes('Payment') ||
        bodyText.includes('Tax information');

      return {
        getLinkButtonCount: buttons.length,
        productCardCount,
        accountVisible,
        hasCaptcha: hasCaptchaClass || containsCaptchaKeywords,
        hasLoginWall,
        paymentTaxBanner,
      };
    });

    // An authenticated catalog (Lấy link buttons present, or product cards + account
    // visible) must never be treated as a login wall — fixes the false positive where
    // a logged-in page with product cards still reported Login requirement: YES.
    const authenticatedCatalog =
      diagnostics.getLinkButtonCount > 0 ||
      (diagnostics.productCardCount > 0 && diagnostics.accountVisible);
    const loginRequired = diagnostics.hasLoginWall && !authenticatedCatalog;

    const preflightPassed =
      diagnostics.getLinkButtonCount > 0 && !diagnostics.hasCaptcha && !loginRequired;

    const successfulDiagnosticArtifact = {
      cdpConnected: true,
      shopeeTabFound: true,
      pageHydrated: diagnostics.getLinkButtonCount > 0,
      getLinkButtonPresent: diagnostics.getLinkButtonCount > 0,
      productCardsDetected: diagnostics.productCardCount > 0,
      productCardCount: diagnostics.productCardCount,
      accountVisible: diagnostics.accountVisible,
      authenticatedCatalog,
      obstaclesDetected: {
        captcha: diagnostics.hasCaptcha,
        loginRequired,
      },
      warnings: {
        paymentTaxBanner: diagnostics.paymentTaxBanner,
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
    console.log(`- Product cards: ${diagnostics.productCardCount} detected`);
    console.log(`- Account visible: ${diagnostics.accountVisible ? 'yes' : 'no'}`);
    console.log(`- Authenticated catalog: ${authenticatedCatalog ? 'yes' : 'no'}`);
    console.log(`- CAPTCHA obstacle: ${diagnostics.hasCaptcha ? 'YES (action blocked)' : 'no'}`);
    console.log(`- Login requirement: ${loginRequired ? 'YES (action blocked)' : 'no'}`);
    if (diagnostics.paymentTaxBanner) {
      console.log('- Payment/Tax banner: present (⚠️ warning only — does NOT block)');
    }
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
