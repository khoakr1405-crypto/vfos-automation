/**
 * VFOS Commerce Intake Orchestrator — Round P39.
 *
 * Safe command coordinator that coordinates existing isolated Shopee Agent tools:
 * 1. Shopee CDP Preflight Diagnostics
 * 2. Controlled Target Link Extraction
 * 3. Normalized Product Card Construction
 * 4. Compliance Auditing Gate
 *
 * Connection, extraction, and validation steps are completely isolated.
 * Does not replicate CDP page logic or selector click logic.
 *
 * Command: pnpm commerce:intake [--dry-run] [--confirm-targeted-click] [--run-review] [--output <path>]
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { CdpBootstrapError, bootstrapBrowser } from '../packages/shopee/src/cdp-bootstrap.js';
import { sanitizeShopeeCanonicalUrl } from '../packages/shopee/src/url-sanitize.js';

const AFFILIATE_OWNER_ID = 'an_17376660568';
const LINK_REGISTRY_PATH = 'production/_commerce/shopee_link_registry.json';

const options = {
  'dry-run': { type: 'boolean' as const, default: false },
  'confirm-targeted-click': { type: 'boolean' as const, default: false },
  'run-review': { type: 'boolean' as const, default: false },
  'create-job': { type: 'boolean' as const, default: false },
  output: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

interface RegistryEntryLite {
  product_name: string;
  shopid: string | null;
  itemid: string | null;
  short_link: string | null;
  canonical_url: string | null;
  affiliate_owner_id: string | null;
  last_seen_at?: string;
}

/** Return the most recently seen entry in the Shopee link registry, or null. */
function newestRegistryEntry(): RegistryEntryLite | null {
  const p = resolve(LINK_REGISTRY_PATH);
  if (!existsSync(p)) return null;
  try {
    const reg = JSON.parse(readFileSync(p, 'utf8')) as { entries?: RegistryEntryLite[] };
    if (!Array.isArray(reg.entries) || reg.entries.length === 0) return null;
    return [...reg.entries].sort((a, b) =>
      String(b.last_seen_at ?? '').localeCompare(String(a.last_seen_at ?? '')),
    )[0];
  } catch {
    return null;
  }
}

async function main() {
  const confirmTargetedClick = !!values['confirm-targeted-click'];
  const isDryRun = !!values['dry-run'] || !confirmTargetedClick;
  const runReview = !!values['run-review'];
  const statusOutputPath = values.output || 'data/temp/commerce_intake_status.json';

  console.log('======================================================');
  console.log('📦   VFOS Commerce Product Intake Orchestrator');
  console.log('======================================================');
  console.log(
    `- Mode:              ${isDryRun ? '🔍 DRY-RUN (Preflight check only)' : '⚡ CONFIRMED EXTRACTION'}`,
  );
  console.log(`- Auto Run Review:   ${runReview ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log(`- Output Status:     ${statusOutputPath}`);
  console.log('------------------------------------------------------');

  // Initialize intake status structure
  const intakeStatus: any = {
    intakeVersion: 'v1',
    status: 'SUSPENDED',
    mode: isDryRun ? 'dry-run' : 'confirmed-targeted-click',
    steps: {
      preflight: {
        status: 'FAIL',
        artifactPath: 'data/temp/shopee_cdp_preflight_status.json',
      },
      extractor: {
        status: 'SKIPPED',
        artifactPath: 'data/temp/shopee_affiliate_link_artifact.json',
      },
      builder: {
        status: 'SKIPPED',
        artifactPath: 'data/temp/selected_product_card.json',
      },
      audit: {
        status: 'SKIPPED',
        artifactPath: 'data/temp/shopee_link_audit_status.json',
      },
    },
    targetCount: 1,
    affiliateOwnerExpected: 'an_17376660568',
    selectedProductCardPath: 'data/temp/selected_product_card.json',
    recommendedNextAction: 'Run pnpm commerce:intake to verify browser state prior to extraction.',
    generatedAt: new Date().toISOString(),
  };

  const preflightStatusPath = 'data/temp/shopee_cdp_preflight_status.json';
  const extractorStatusPath = 'data/temp/shopee_affiliate_link_artifact.json';
  const cardPath = 'data/temp/selected_product_card.json';
  const auditStatusPath = 'data/temp/shopee_link_audit_status.json';

  // Ensure output directory exists
  try {
    mkdirSync(dirname(statusOutputPath), { recursive: true });
  } catch {}

  // ======================================================
  // STEP 0: Cốc Cốc CDP Bootstrap (auto-open if port closed)
  // ======================================================
  // Cốc Cốc is the ONLY supported browser for the Shopee Affiliate flow.
  // bootstrapBrowser probes 127.0.0.1:9222 first: if Cốc Cốc is already running
  // it simply attaches (no relaunch); if the port is closed it auto-opens Cốc Cốc
  // using the operator's logged-in profile (VFOS_BROWSER_USER_DATA_DIR). It never
  // spawns a blank profile, never types credentials/OTP, never touches Chrome/Edge.
  console.log('\n[Intake] Step 0: Cốc Cốc CDP bootstrap (probe port 9222, auto-open if closed)...');
  try {
    // use_default_user_data_dir lets the bootstrap fall back to a VFOS-dedicated
    // Cốc Cốc profile when VFOS_BROWSER_USER_DATA_DIR is unset, so the browser
    // ALWAYS auto-opens — the operator never has to launch it by hand. It opens
    // straight at the Shopee Affiliate offer page (bootstrap default start_url).
    const boot = await bootstrapBrowser({
      host: '127.0.0.1',
      port: 9222,
      use_default_user_data_dir: true,
    });
    if (boot.status === 'launched') {
      console.log(
        `[Intake] Auto-opened Cốc Cốc (profile: ${boot.user_data_dir}) — waited ${boot.waited_ms_after_launch}ms for port.`,
      );
      console.log(
        '[Intake] If this is the first run in the VFOS profile, sign in to Shopee Affiliate once in the opened window; the session persists for later runs.',
      );
    } else {
      console.log('[Intake] Cốc Cốc already running on port 9222 — attaching (no relaunch).');
    }
  } catch (err: any) {
    // Only true environment faults reach here now (Cốc Cốc not installed, or the
    // chosen profile is locked by another open window). The browser still does
    // not require a manual debug-port launch in the normal case.
    const reason =
      err instanceof CdpBootstrapError ? `${err.reason_code}: ${err.message}` : err?.message;
    console.warn(`[Intake] Cốc Cốc auto-open could not complete — ${reason}`);
    if (err instanceof CdpBootstrapError && err.reason_code === 'ERR_CDP_PROFILE_LOCKED') {
      console.warn(
        '[Intake] The VFOS profile is in use by an open Cốc Cốc window. Close that window and re-run — no manual debug launch needed.',
      );
    } else if (err instanceof CdpBootstrapError && err.reason_code === 'ERR_CDP_BROWSER_NOT_FOUND_ON_DISK') {
      console.warn(
        '[Intake] Install Cốc Cốc, or set VFOS_BROWSER_PATH to its browser.exe, then re-run. (Cốc Cốc only — never Chrome/Edge.)',
      );
    }
  }

  // ======================================================
  // STEP 1: Shopee CDP Browser Preflight Diagnostics
  // ======================================================
  console.log('\n[Intake] Step 1: Initiating Shopee CDP browser preflight check...');
  const preflightRes = spawnSync('npx', ['tsx', 'scripts/shopee-cdp-preflight-demo.ts'], {
    shell: true,
    stdio: 'inherit',
  });

  let preflightPassed = false;
  if (existsSync(preflightStatusPath)) {
    try {
      const preflightContent = JSON.parse(readFileSync(preflightStatusPath, 'utf8'));
      preflightPassed = !!preflightContent.preflightPassed;
      intakeStatus.steps.preflight.status = preflightPassed ? 'PASS' : 'FAIL';
    } catch (err: any) {
      console.error(`[Intake] Error reading preflight status artifact: ${err.message}`);
    }
  }

  if (!preflightPassed) {
    console.warn('\n⚠️  [Intake] Preflight diagnostic check FAILED.');
    console.warn('- Cốc Cốc was auto-opened on debug port 9222 (no manual launch needed).');
    console.warn('- This usually means a one-time human step is pending IN THE OPEN WINDOW:');
    console.warn('    • Sign in to Shopee Affiliate (first run in the VFOS profile), or');
    console.warn('    • Clear a CAPTCHA / security verification overlay.');
    console.warn('- Complete it in the already-open Cốc Cốc window, then simply re-run:');
    console.warn('    pnpm commerce:intake');
    console.warn('- Target page (the bootstrap opens it for you):');
    console.warn('    https://affiliate.shopee.vn/offer/product_offer');

    intakeStatus.status = 'SUSPENDED';
    intakeStatus.recommendedNextAction =
      'Cốc Cốc is already open on port 9222. Complete the one-time Shopee login / CAPTCHA in that window, then re-run pnpm commerce:intake.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(0);
  }

  console.log('\n[Intake] Preflight check PASSED 🟢 Browser connection active & ready.');

  // If in dry-run mode, report READY state and halt before extraction
  if (isDryRun) {
    console.log('------------------------------------------------------');
    console.log('👍 READY FOR TARGETED EXTRACTION!');
    console.log(
      'To perform exactly 1 controlled click and generate the product card, re-run with:',
    );
    console.log('👉  pnpm commerce:intake --confirm-targeted-click');
    console.log('------------------------------------------------------');

    intakeStatus.status = 'READY';
    intakeStatus.recommendedNextAction =
      'Ready for targeted extraction. Re-run with --confirm-targeted-click to extract exactly 1 link.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(0);
  }

  // ======================================================
  // STEP 2: Controlled Shopee Link Extraction
  // ======================================================
  console.log(
    '\n[Intake] Step 2: Running controlled Shopee link extraction (dedup + next-product, target_count=1)...',
  );
  // Round 27 CDP extractor: bootstraps Cốc Cốc, performs a targeted click on each
  // visible product card's "Lấy link" button, and on a duplicate SKIPS to the next
  // valid product (max_clicks=5 safety ceiling — never random click). New links are
  // written to the link registry with affiliate-owner verification.
  const extractorRes = spawnSync(
    'npx',
    [
      'tsx',
      'packages/shopee/scripts/extract-links-cdp.ts',
      '--target-count',
      '1',
      '--max-clicks',
      '5',
      '--owner-id',
      AFFILIATE_OWNER_ID,
    ],
    { shell: true, stdio: 'inherit' },
  );

  // Exit 0 = a NEW non-duplicate link was extracted into the registry.
  // Exit 1 = SUSPENDED (all visible cards duplicate/exhausted, or no products).
  // Exit 2 = browser/CDP error.
  const extractorExit = extractorRes.status ?? 1;
  let extractorSuccess = extractorExit === 0;
  let extractorStatusStr =
    extractorExit === 0 ? 'SUCCESS' : extractorExit === 2 ? 'CDP_ERROR' : 'SUSPENDED';

  // On success, lift the newest registry entry into the link-artifact shape the
  // downstream card builder reads (data/temp/shopee_affiliate_link_artifact.json).
  if (extractorSuccess) {
    const entry = newestRegistryEntry();
    const ownerVerified = !!entry && entry.affiliate_owner_id === AFFILIATE_OWNER_ID;
    if (!entry || !ownerVerified) {
      extractorSuccess = false;
      extractorStatusStr = 'OWNER_MISMATCH';
      console.error(
        `\n❌  [Intake] Extracted link owner mismatch — expected ${AFFILIATE_OWNER_ID}, got ${entry?.affiliate_owner_id ?? '(none)'}.`,
      );
    } else {
      // Sanitize the canonical deep-link before persisting: strip
      // credential/session/signature params (credential_token, gads_t_sig, …)
      // and keep only public affiliate tracking. No raw credentials in artifacts.
      const { cleanUrl: canonicalCleanUrl, strippedParams } = sanitizeShopeeCanonicalUrl(
        entry.canonical_url,
      );
      writeFileSync(
        extractorStatusPath,
        JSON.stringify(
          {
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
            score: (entry as any).score || 'unknown',
            criteria: (entry as any).criteria || 'unknown',
            source: 'extract-links-cdp (registry)',
            generatedAt: new Date().toISOString(),
          },
          null,
          2,
        ),
        'utf8',
      );
      console.log(
        `[Intake] New link extracted: ${entry.short_link ?? entry.canonical_url} (owner ${entry.affiliate_owner_id} ✅)`,
      );
    }
  }
  intakeStatus.steps.extractor.status = extractorStatusStr;

  if (!extractorSuccess) {
    console.warn(`\n⚠️  [Intake] Extraction did not yield a new link: ${extractorStatusStr}`);
    intakeStatus.status = extractorStatusStr === 'CDP_ERROR' ? 'FAIL' : 'SUSPENDED';
    intakeStatus.recommendedNextAction =
      extractorStatusStr === 'SUSPENDED'
        ? 'All visible product cards were duplicates or exhausted. Scroll the Cốc Cốc catalog to surface unused products, then re-run with --confirm-targeted-click.'
        : extractorStatusStr === 'OWNER_MISMATCH'
          ? `Extracted link did not match required affiliate owner ${AFFILIATE_OWNER_ID}.`
          : 'Verify Cốc Cốc is open and logged in on the Shopee Affiliate Product Offer page.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(0);
  }

  console.log('\n[Intake] Extraction completed successfully! 🟢');

  // ======================================================
  // STEP 3: Normalized Selected Product Card Adapter Builder
  // ======================================================
  console.log('\n[Intake] Step 3: Running offline Product Card adapter builder...');
  const builderRes = spawnSync('npx', ['tsx', 'scripts/shopee-product-card-builder.ts'], {
    shell: true,
    stdio: 'inherit',
  });

  const cardBuilt = existsSync(cardPath) && builderRes.status === 0;
  intakeStatus.steps.builder.status = cardBuilt ? 'SUCCESS' : 'FAIL';

  if (!cardBuilt) {
    console.error('\n❌  [Intake] Product card builder adapter FAILED.');

    intakeStatus.status = 'FAIL';
    intakeStatus.recommendedNextAction = 'Review Card Builder scripts/logs for adapter errors.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(1);
  }

  console.log('\n[Intake] Normalized Selected Product Card created successfully! 🟢');

  // ======================================================
  // STEP 4: Compliance Auditing Gate
  // ======================================================
  console.log('\n[Intake] Step 4: Running Shopee link audit gate check...');
  const auditRes = spawnSync('npx', ['tsx', 'scripts/shopee-link-audit-demo.ts'], {
    shell: true,
    stdio: 'inherit',
  });

  let auditStatusStr = 'FAIL';
  if (existsSync(auditStatusPath)) {
    try {
      const auditContent = JSON.parse(readFileSync(auditStatusPath, 'utf8'));
      auditStatusStr = auditContent.status;
      intakeStatus.steps.audit.status = auditStatusStr;
    } catch (err: any) {
      console.error(`[Intake] Error reading Shopee audit status artifact: ${err.message}`);
    }
  }

  if (auditStatusStr === 'FAIL') {
    console.error(
      '\n❌  [Intake] Shopee Affiliate Link Audit FAILED. Product Card is unsafe for pipeline ingestion!',
    );

    intakeStatus.status = 'FAIL';
    intakeStatus.recommendedNextAction =
      'Resolve audit safety/compliance warnings or owner ID tracking mismatch in extracted details.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(0);
  }

  console.log(`\n[Intake] Shopee Affiliate Link Audit completed with status: ${auditStatusStr} 🟢`);
  intakeStatus.status = 'SUCCESS';
  intakeStatus.recommendedNextAction =
    'Run pnpm chay to generate review preview after operator verifies the product card.';
  writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');

  let jobCreated = false;
  let newJobId = '';

  const createJob = !!values['create-job'];
  if (createJob) {
    console.log('\n[Intake] --create-job option is active. Spawning job creation...');
    const createRes = spawnSync(
      'npx',
      ['tsx', 'scripts/vfos-job-manager.ts', 'create', '--from-product', cardPath],
      { shell: true, stdio: 'inherit' },
    );
    if (createRes.status === 0) {
      jobCreated = true;
      const regPath = resolve('data/temp/vfos_jobs_registry.json');
      if (existsSync(regPath)) {
        try {
          const reg = JSON.parse(readFileSync(regPath, 'utf8'));
          if (Array.isArray(reg.jobs) && reg.jobs.length > 0) {
            const sorted = [...reg.jobs].sort((a, b) =>
              String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')),
            );
            newJobId = sorted[0].jobId;
          }
        } catch {}
      }
    } else {
      console.error('❌ [Intake] Job creation failed.');
    }
  }

  // Load and display card summary for operator convenience
  try {
    const cardObj = JSON.parse(readFileSync(cardPath, 'utf8'));
    if (jobCreated && newJobId) {
      console.log('======================================================');
      console.log('🎉 SUCCESS: SHOPEE PRODUCT INTAKE + JOB CREATION COMPLETED');
      console.log('======================================================');
      console.log(`- Product Name:      ${cardObj.name}`);
      console.log(`- Score:             ${cardObj.score || 'N/A'}`);
      console.log(`- Commission:        ${cardObj.commissionRate || cardObj.commission || 'N/A'}`);
      console.log(`- Short Link:        ${cardObj.shortLink || 'N/A'}`);
      console.log(`- Resolved Owner ID: ${cardObj.affiliateOwnerId} (VERIFIED MATCH ✅)`);
      console.log(`- Job ID:            ${newJobId}`);
      console.log(`- Job Folder:        data/temp/jobs/${newJobId}/`);
      console.log(`- Video Inbox Path:  data/operator/video-downloads/`);
      console.log('------------------------------------------------------');
      console.log('✅ Product Card ready.');
      console.log(`✅ Job created: ${newJobId}`);
      console.log('State: WAITING_FOR_SOURCE_VIDEO\n');
      console.log('Drop source video into:\n  data/operator/video-downloads/\n');
      console.log('Then run:');
      console.log(`  pnpm job:run-review --job ${newJobId} --file "<video>.mp4" --confirm-ai`);
      console.log('======================================================');
    } else {
      console.log('------------------------------------------------------');
      console.log('🎉 SUCCESS: SHOPEE PRODUCT INTAKE COMPLETED');
      console.log(`- Product Name:      ${cardObj.name}`);
      console.log(`- Short Link:        ${cardObj.shortLink}`);
      console.log(`- Resolved Owner ID: ${cardObj.affiliateOwnerId} (VERIFIED MATCH ✅)`);
      console.log(`- Output Card Path:  ${cardPath}`);
      console.log(`- Audit Status Path: ${auditStatusPath}`);
      console.log('------------------------------------------------------');
    }
  } catch {}

  // ======================================================
  // STEP 5: Optional Human Review Pipeline Execution
  // ======================================================
  if (runReview) {
    console.log(
      '\n[Intake] Step 5: Operator requested automatic Human Review Pipeline execution...',
    );
    spawnSync('npx', ['tsx', 'scripts/chay.ts', '--offline'], {
      shell: true,
      stdio: 'inherit',
    });
  } else {
    console.log('\nReady for human review processing. To execute the preview generator, run:');
    console.log('👉  pnpm chay --offline');
  }

  console.log('\nIntake coordination finished successfully!\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('[Intake] FATAL unhandled coordinator error:', err);
  process.exit(1);
});
