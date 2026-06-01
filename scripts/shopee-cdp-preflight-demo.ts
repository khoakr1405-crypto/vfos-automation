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

    // Perform read-only DOM diagnostics. The Product Offer catalog hydrates
    // client-side, so an immediate evaluate can catch an empty shell mid-load
    // and false-block. We poll this (below) up to ~15s until the catalog is
    // recognised or a real obstacle appears. Read-only — no clicks/mutations.
    const evaluateDiagnostics = () => targetPage.evaluate(() => {
      // NOTE: no named helper functions inside evaluate — esbuild (tsx) injects a
      // `__name(...)` wrapper for named/const-assigned functions which is undefined
      // in the serialized browser context. Visibility is checked inline below.
      // NOTE: do NOT declare const/named arrow helpers inside evaluate — esbuild
      // wraps them in `__name(...)`, undefined in the browser context. Inline.
      const bodyText = document.body ? document.body.textContent || '' : '';

      // Per-card "Lấy link" / "Get link" leaf buttons (case-insensitive — the
      // English catalog renders "Get Link" with a capital L). Strong logged-in
      // signal, but NOT required: the batch button + catalog chrome below are
      // sufficient on their own.
      const getLinkButtonCount = Array.from(document.querySelectorAll('*')).filter((el) => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return (t === 'lấy link' || t === 'get link') && el.children.length === 0;
      }).length;

      // Catalog-level "Batch Get Link" / "Lấy link hàng loạt" button — only
      // rendered on the authenticated Product Offer catalog.
      const batchGetLinkPresent = Array.from(
        document.querySelectorAll('button, a, span, div'),
      ).some((el) => {
        const t = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
        return t === 'batch get link' || t === 'lấy link hàng loạt';
      });

      // Product cards present on the catalog (positive authenticated signal).
      const productCardCount = document.querySelectorAll(
        '[class*="product-card"], [class*="offer-item"], [class*="product-item"], [data-sqe="item"]',
      ).length;

      // Catalog chrome that only the authenticated Product Offer page renders
      // (English or Vietnamese): the section heading, the "N / M selected"
      // counter, and the product search box.
      const productOfferHeading = /product offer|sản phẩm đề xuất/i.test(bodyText);
      const selectedCounterPresent = /\d+\s*\/\s*\d+\s*(selected|đã chọn)/i.test(bodyText);
      const searchBoxPresent = !!document.querySelector(
        'input[placeholder*="Shopee"], input[placeholder*="Search for all"], input[placeholder*="Tìm"]',
      );

      // Account / avatar visible (best-effort positive signal; often misses the
      // top-bar account dropdown, so it must not be required).
      const accountVisible = !!document.querySelector(
        '[class*="avatar"], [class*="account"], [class*="user-info"], img[src*="avatar"]',
      );

      // Detect potential CAPTCHA verification overlays.
      const hasCaptchaClass = !!document.querySelector(
        '.shopee-captcha, .captcha-modal, iframe[src*="captcha"]',
      );
      const containsCaptchaKeywords =
        bodyText.includes('CAPTCHA') ||
        bodyText.includes('Mã xác minh') ||
        bodyText.includes('Xác minh bảo mật');

      // Login-wall components, returned separately so the gate can let an
      // accessible catalog override a soft/stray login-modal selector. A stray
      // `[href*="/login"]` link (footer, nav menu) still exists on logged-in
      // pages and must NOT count.
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

      // Payment / Tax banner — informational warning only, never a login block.
      const paymentTaxBanner =
        bodyText.includes('Thanh toán') ||
        bodyText.includes('Thuế') ||
        bodyText.includes('thuế') ||
        bodyText.includes('Payment') ||
        bodyText.includes('Tax information');

      return {
        getLinkButtonCount,
        batchGetLinkPresent,
        productCardCount,
        productOfferHeading,
        selectedCounterPresent,
        searchBoxPresent,
        accountVisible,
        hasCaptcha: hasCaptchaClass || containsCaptchaKeywords,
        visibleLoginModal,
        visiblePasswordInput,
        onLoginUrl,
        paymentTaxBanner,
      };
    });

    // Poll the diagnostics until the catalog hydrates or a real obstacle shows.
    //
    // authenticatedCatalog: an accessible catalog must never be treated as a
    // login wall. Recognise it from ANY strong signal set — including the
    // English UI where per-card "Get Link" leaf buttons and the avatar selector
    // are missed: the "Batch Get Link" button + product cards / the
    // "N / M selected" counter, or the Product Offer heading + search box.
    //
    // hardLoginWall: a real login page / visible password field always blocks
    // and is never overridden; a soft/stray login-modal selector only blocks
    // when the catalog is otherwise inaccessible.
    let diagnostics = await evaluateDiagnostics();
    let catalogChrome = false;
    let authenticatedCatalog = false;
    let hardLoginWall = false;
    let loginRequired = false;
    const hydrationDeadlineMs = Date.now() + 15_000;
    while (true) {
      catalogChrome =
        diagnostics.productOfferHeading ||
        diagnostics.selectedCounterPresent ||
        diagnostics.searchBoxPresent;
      authenticatedCatalog =
        diagnostics.getLinkButtonCount > 0 ||
        (diagnostics.batchGetLinkPresent &&
          (diagnostics.productCardCount > 0 || diagnostics.selectedCounterPresent)) ||
        (diagnostics.productCardCount > 0 && (diagnostics.accountVisible || catalogChrome)) ||
        (diagnostics.batchGetLinkPresent && catalogChrome);
      hardLoginWall = diagnostics.visiblePasswordInput || diagnostics.onLoginUrl;
      loginRequired =
        hardLoginWall || (diagnostics.visibleLoginModal && !authenticatedCatalog);

      // Decision reached once the catalog is recognised OR a real obstacle
      // (CAPTCHA / login wall) is present — otherwise wait for SPA hydration.
      const decided = authenticatedCatalog || diagnostics.hasCaptcha || loginRequired;
      if (decided || Date.now() >= hydrationDeadlineMs) break;
      console.log('[CDPPreflight] Catalog not hydrated yet — waiting for SPA render…');
      await new Promise((r) => setTimeout(r, 1000));
      diagnostics = await evaluateDiagnostics();
    }

    // Pass when the catalog is accessible and no CAPTCHA / login wall blocks it.
    // The per-card "Get link" leaf button is no longer mandatory.
    const preflightPassed = authenticatedCatalog && !diagnostics.hasCaptcha && !loginRequired;

    const successfulDiagnosticArtifact = {
      cdpConnected: true,
      shopeeTabFound: true,
      pageHydrated: authenticatedCatalog,
      getLinkButtonPresent: diagnostics.getLinkButtonCount > 0 || diagnostics.batchGetLinkPresent,
      getLinkButtonCount: diagnostics.getLinkButtonCount,
      batchGetLinkPresent: diagnostics.batchGetLinkPresent,
      productCardsDetected: diagnostics.productCardCount > 0,
      productCardCount: diagnostics.productCardCount,
      productOfferHeading: diagnostics.productOfferHeading,
      selectedCounterPresent: diagnostics.selectedCounterPresent,
      searchBoxPresent: diagnostics.searchBoxPresent,
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
    console.log(
      `- Get-link buttons: ${diagnostics.getLinkButtonCount} per-card${diagnostics.batchGetLinkPresent ? ' + Batch Get Link' : ''}`,
    );
    console.log(`- Product cards: ${diagnostics.productCardCount} detected`);
    console.log(
      `- Catalog chrome: heading=${diagnostics.productOfferHeading ? 'yes' : 'no'}, selectedCounter=${diagnostics.selectedCounterPresent ? 'yes' : 'no'}, search=${diagnostics.searchBoxPresent ? 'yes' : 'no'}`,
    );
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
