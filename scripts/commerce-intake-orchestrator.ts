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

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const options = {
  'dry-run': { type: 'boolean' as const, default: false },
  'confirm-targeted-click': { type: 'boolean' as const, default: false },
  'run-review': { type: 'boolean' as const, default: false },
  output: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

async function main() {
  const confirmTargetedClick = !!values['confirm-targeted-click'];
  const isDryRun = !!values['dry-run'] || !confirmTargetedClick;
  const runReview = !!values['run-review'];
  const statusOutputPath = values.output || 'data/temp/commerce_intake_status.json';

  console.log('======================================================');
  console.log('📦   VFOS Commerce Product Intake Orchestrator');
  console.log('======================================================');
  console.log(`- Mode:              ${isDryRun ? '🔍 DRY-RUN (Preflight check only)' : '⚡ CONFIRMED EXTRACTION'}`);
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
    console.warn('- Ensure Cốc Cốc or Chrome is open with remote debugging port 9222 enabled:');
    console.warn('  `chrome.exe --remote-debugging-port=9222`');
    console.warn('- Navigate browser to active Shopee Affiliate Product Offer catalog:');
    console.warn('  https://affiliate.shopee.vn/offer/product_offer');
    console.warn('- Ensure no security block overlays (CAPTCHA or Login required) are present.');
    
    intakeStatus.status = 'SUSPENDED';
    intakeStatus.recommendedNextAction = 'Please open the browser on debugging port 9222 and navigate to Shopee Product Offer page.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(0);
  }

  console.log('\n[Intake] Preflight check PASSED 🟢 Browser connection active & ready.');

  // If in dry-run mode, report READY state and halt before extraction
  if (isDryRun) {
    console.log('------------------------------------------------------');
    console.log('👍 READY FOR TARGETED EXTRACTION!');
    console.log('To perform exactly 1 controlled click and generate the product card, re-run with:');
    console.log('👉  pnpm commerce:intake --confirm-targeted-click');
    console.log('------------------------------------------------------');

    intakeStatus.status = 'READY';
    intakeStatus.recommendedNextAction = 'Ready for targeted extraction. Re-run with --confirm-targeted-click to extract exactly 1 link.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(0);
  }

  // ======================================================
  // STEP 2: Controlled Shopee Link Extraction
  // ======================================================
  console.log('\n[Intake] Step 2: Running controlled Shopee link extraction agent...');
  const extractorRes = spawnSync('npx', ['tsx', 'scripts/shopee-link-extractor-demo.ts'], {
    shell: true,
    stdio: 'inherit',
  });

  let extractorSuccess = false;
  let extractorStatusStr = 'FAIL';
  if (existsSync(extractorStatusPath)) {
    try {
      const extractorContent = JSON.parse(readFileSync(extractorStatusPath, 'utf8'));
      extractorStatusStr = extractorContent.status;
      extractorSuccess = extractorStatusStr === 'SUCCESS';
      intakeStatus.steps.extractor.status = extractorStatusStr;
    } catch (err: any) {
      console.error(`[Intake] Error reading link extractor status artifact: ${err.message}`);
    }
  }

  if (!extractorSuccess) {
    console.warn(`\n⚠️  [Intake] Extraction agent completed without SUCCESS status: ${extractorStatusStr}`);
    
    intakeStatus.status = extractorStatusStr === 'SUSPENDED' ? 'SUSPENDED' : 'FAIL';
    intakeStatus.recommendedNextAction = 'Address extraction block (e.g. duplicates, CAPTCHA) or verify browser page state.';
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
    console.error('\n❌  [Intake] Shopee Affiliate Link Audit FAILED. Product Card is unsafe for pipeline ingestion!');
    
    intakeStatus.status = 'FAIL';
    intakeStatus.recommendedNextAction = 'Resolve audit safety/compliance warnings or owner ID tracking mismatch in extracted details.';
    writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');
    process.exit(0);
  }

  console.log(`\n[Intake] Shopee Affiliate Link Audit completed with status: ${auditStatusStr} 🟢`);
  intakeStatus.status = 'SUCCESS';
  intakeStatus.recommendedNextAction = 'Run pnpm chay to generate review preview after operator verifies the product card.';
  writeFileSync(statusOutputPath, JSON.stringify(intakeStatus, null, 2), 'utf8');

  // Load and display card summary for operator convenience
  try {
    const cardObj = JSON.parse(readFileSync(cardPath, 'utf8'));
    console.log('------------------------------------------------------');
    console.log('🎉 SUCCESS: SHOPEE PRODUCT INTAKE COMPLETED');
    console.log(`- Product Name:      ${cardObj.name}`);
    console.log(`- Short Link:        ${cardObj.shortLink}`);
    console.log(`- Resolved Owner ID: ${cardObj.affiliateOwnerId} (VERIFIED MATCH ✅)`);
    console.log(`- Output Card Path:  ${cardPath}`);
    console.log(`- Audit Status Path: ${auditStatusPath}`);
    console.log('------------------------------------------------------');
  } catch {}

  // ======================================================
  // STEP 5: Optional Human Review Pipeline Execution
  // ======================================================
  if (runReview) {
    console.log('\n[Intake] Step 5: Operator requested automatic Human Review Pipeline execution...');
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
