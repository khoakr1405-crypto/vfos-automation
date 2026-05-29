/**
 * VFOS Operator Daily Workflow Dashboard — Round P40.
 *
 * Safe read-only dashboard coordinator.
 * Reads and maps local filesystem artifacts into clear status markers and
 * actionable next-step operator instructions.
 *
 * Command: pnpm vfos:daily [--refresh-preflight] [--json] [--output <path>]
 */

import { writeFileSync, mkdirSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';

const options = {
  'refresh-preflight': { type: 'boolean' as const, default: false },
  json: { type: 'boolean' as const, default: false },
  output: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

// Helper: Recursively search a directory to find the latest folder containing a specific target file
function findLatestRunFolderWithFile(baseDir: string, targetFile: string): string | null {
  let latestFolder: string | null = null;
  let latestMtime = 0;

  function recurse(currentDir: string) {
    try {
      const items = readdirSync(currentDir);
      let foundFile = false;

      for (const item of items) {
        const fullPath = join(currentDir, item);
        let stat;
        try {
          stat = statSync(fullPath);
        } catch {
          continue;
        }

        if (stat.isDirectory()) {
          recurse(fullPath);
        } else if (item === targetFile) {
          foundFile = true;
        }
      }

      if (foundFile) {
        try {
          const stat = statSync(currentDir);
          if (stat.mtimeMs > latestMtime) {
            latestMtime = stat.mtimeMs;
            latestFolder = currentDir;
          }
        } catch {}
      }
    } catch {}
  }

  if (existsSync(baseDir)) {
    recurse(baseDir);
  }
  return latestFolder;
}

async function main() {
  const refreshPreflight = !!values['refresh-preflight'];
  const isJsonOnly = !!values['json'];
  const statusOutputPath = values.output || 'data/temp/vfos_daily_status.json';

  // Step 1: Optional refresh browser diagnostics
  if (refreshPreflight) {
    console.log('[Dashboard] Refreshing preflight diagnostics...');
    spawnSync('npx', ['tsx', 'scripts/shopee-cdp-preflight-demo.ts'], {
      shell: true,
      stdio: 'inherit',
    });
  }

  // Define paths to various artifacts
  const preflightPath = 'data/temp/shopee_cdp_preflight_status.json';
  const cardPath = 'data/temp/selected_product_card.json';
  const auditPath = 'data/temp/shopee_link_audit_status.json';
  const intakePath = 'data/temp/commerce_intake_status.json';

  // 1. COMMERCE SCANNING
  let preflightStatus: 'READY' | 'NOT_READY' | 'UNKNOWN' = 'UNKNOWN';
  if (existsSync(preflightPath)) {
    try {
      const preflight = JSON.parse(readFileSync(preflightPath, 'utf8'));
      preflightStatus = preflight.preflightPassed ? 'READY' : 'NOT_READY';
    } catch {}
  }

  let productCardStatus: 'FOUND' | 'MISSING' = 'MISSING';
  let cardObj: any = null;
  if (existsSync(cardPath)) {
    productCardStatus = 'FOUND';
    try {
      cardObj = JSON.parse(readFileSync(cardPath, 'utf8'));
    } catch {}
  }

  let auditStatus: 'PASS' | 'WARN' | 'FAIL' | 'NO_INPUT' | 'UNKNOWN' = 'UNKNOWN';
  if (existsSync(auditPath)) {
    try {
      const audit = JSON.parse(readFileSync(auditPath, 'utf8'));
      auditStatus = audit.status || 'UNKNOWN';
    } catch {}
  } else if (productCardStatus === 'MISSING') {
    auditStatus = 'NO_INPUT';
  }

  // 2. VIDEO REVIEW SCANNING
  // Scan for latest execution runs containing review pack or preview artifacts
  const latestPackDir = findLatestRunFolderWithFile('data/temp', 'operator_review_pack.json');
  const latestPreviewDir = findLatestRunFolderWithFile('data/temp', 'preview_artifact.json');
  
  const activeRunDir = latestPackDir || latestPreviewDir || null;
  let runId = 'unknown_run';
  if (activeRunDir) {
    const parts = activeRunDir.split(/[\\/]/);
    runId = parts[parts.length - 1] || 'unknown_run';
  }

  let previewStatus: 'FOUND' | 'MISSING' = 'MISSING';
  let previewPath = '';
  if (activeRunDir && existsSync(join(activeRunDir, 'preview_artifact.json'))) {
    previewStatus = 'FOUND';
    previewPath = join(activeRunDir, 'preview_artifact.json');
  }

  let reviewPackStatus: 'READY_FOR_FINAL_OPERATOR_APPROVAL' | 'MISSING' | 'UNKNOWN' = 'MISSING';
  let packPath = '';
  if (activeRunDir && existsSync(join(activeRunDir, 'operator_review_pack.json'))) {
    reviewPackStatus = 'READY_FOR_FINAL_OPERATOR_APPROVAL';
    packPath = join(activeRunDir, 'operator_review_pack.json');
  }

  // 3. PUBLISH READINESS SCANNING
  let publishManifestStatus: 'FOUND' | 'MISSING' = 'MISSING';
  if (activeRunDir && existsSync(join(activeRunDir, 'publish_manifest.json'))) {
    publishManifestStatus = 'FOUND';
  }

  let publishRequestStatus: 'FOUND' | 'MISSING' = 'MISSING';
  if (activeRunDir && existsSync(join(activeRunDir, 'facebook_publish_request.json'))) {
    publishRequestStatus = 'FOUND';
  } else if (existsSync('data/temp/facebook_publish_request.json')) {
    publishRequestStatus = 'FOUND';
  }

  let pageRouteStatus: 'FOUND' | 'MISSING' = 'MISSING';
  if (activeRunDir && existsSync(join(activeRunDir, 'facebook_page_route_artifact.json'))) {
    pageRouteStatus = 'FOUND';
  } else if (existsSync('data/temp/facebook_page_route_artifact.json')) {
    pageRouteStatus = 'FOUND';
  }

  let reelsValidationStatus: 'PASS' | 'WARN' | 'FAIL' | 'UNKNOWN' = 'UNKNOWN';
  const reelsValPath = activeRunDir ? join(activeRunDir, 'facebook_reels_validation_artifact.json') : '';
  const rootReelsValPath = 'data/temp/facebook_reels_validation_artifact.json';
  const activeReelsValPath = (activeRunDir && existsSync(reelsValPath)) ? reelsValPath : (existsSync(rootReelsValPath) ? rootReelsValPath : '');
  
  if (activeReelsValPath) {
    try {
      const val = JSON.parse(readFileSync(activeReelsValPath, 'utf8'));
      reelsValidationStatus = val.valid ? 'PASS' : 'FAIL';
    } catch {}
  }

  // ======================================================
  // RECOMMENDATIONS ENGINE
  // ======================================================
  let commerceAction = 'Preflight connection diagnostics unknown.';
  if (productCardStatus === 'MISSING') {
    if (preflightStatus === 'READY') {
      commerceAction = '👉 Ready for click extraction! Run: pnpm commerce:intake --confirm-targeted-click';
    } else {
      commerceAction = '👉 Start browser on debugging port 9222 and run: pnpm commerce:intake';
    }
  } else if (auditStatus === 'FAIL') {
    commerceAction = '❌ Audit FAILED! Fix duplicate shortlinks/registry or tracking owner mismatch prior to running pipeline.';
  } else {
    commerceAction = '🟢 Product card audited and safe for pipeline ingestion.';
  }

  let reviewAction = 'Complete preceding commerce steps first.';
  if (productCardStatus === 'FOUND' && auditStatus !== 'FAIL') {
    if (reviewPackStatus === 'MISSING') {
      reviewAction = '👉 Product card ready! Run preview pipeline generator: pnpm chay --offline';
    } else {
      reviewAction = '🎉 Operator review pack is READY! Please open operator_review_pack.md to inspect video and details.';
    }
  } else if (auditStatus === 'FAIL') {
    reviewAction = '❌ Pipeline blocked. Address product card audit failures first.';
  }

  let publishAction = 'Complete preceding video review steps before executing publish workflows.';
  if (reviewPackStatus === 'READY_FOR_FINAL_OPERATOR_APPROVAL') {
    publishAction = `👉 Review pack ready! After manual inspection, run: pnpm publish:facebook --confirm-final-approval --run ${runId}`;
  }

  // Final consolidated workflow advice
  let mainAdvice = 'Perform commerce diagnostics to kickstart daily intake workflow.';
  if (productCardStatus === 'MISSING') {
    if (preflightStatus === 'READY') {
      mainAdvice = 'Perform targeted extraction: pnpm commerce:intake --confirm-targeted-click';
    } else {
      mainAdvice = 'Startup Chrome debugging port and run: pnpm commerce:intake';
    }
  } else if (auditStatus === 'FAIL') {
    mainAdvice = 'Shopee link audit has failed. Review violations list and fix product card duplicates.';
  } else if (reviewPackStatus === 'MISSING') {
    mainAdvice = 'Execute preview video generator pipeline: pnpm chay --offline';
  } else if (reviewPackStatus === 'READY_FOR_FINAL_OPERATOR_APPROVAL') {
    mainAdvice = `Inspect latest video run in operator_review_pack.md. When ready, run: pnpm publish:facebook --confirm-final-approval --run ${runId}`;
  }

  // ======================================================
  // EXPORT SUMMARY JSON ARTIFACT
  // ======================================================
  const dashboardStatus = {
    dashboardVersion: 'v1',
    status: reviewPackStatus === 'READY_FOR_FINAL_OPERATOR_APPROVAL' ? 'READY_FOR_OPERATOR_ACTION' : 'PENDING_PIPELINE_FLOW',
    generatedAt: new Date().toISOString(),
    commerce: {
      preflight: preflightStatus,
      productCard: productCardStatus,
      audit: auditStatus,
      recommendedAction: commerceAction,
    },
    review: {
      preview: previewStatus,
      operatorReviewPack: reviewPackStatus,
      latestReviewPackPath: packPath || null,
      latestPreviewPath: previewPath || null,
      recommendedAction: reviewAction,
    },
    publish: {
      publishManifest: publishManifestStatus,
      publishRequest: publishRequestStatus,
      safeToAutoPublish: false,
      recommendedAction: publishAction,
    },
    safety: {
      readOnlyDashboard: true,
      clickedBrowser: false,
      calledShopeeApi: false,
      calledFacebookApi: false,
      published: false,
      uploaded: false,
      readEnv: false,
    },
  };

  try {
    mkdirSync(dirname(statusOutputPath), { recursive: true });
    writeFileSync(statusOutputPath, JSON.stringify(dashboardStatus, null, 2), 'utf8');
  } catch {}

  // ======================================================
  // OUTPUT PRESENTATION
  // ======================================================
  if (isJsonOnly) {
    console.log(JSON.stringify(dashboardStatus, null, 2));
    process.exit(0);
  }

  console.log('======================================================');
  console.log('🛡️   VFOS OPERATOR DAILY WORKFLOW DASHBOARD');
  console.log('======================================================');
  
  console.log('\n[1] Commerce Intake');
  console.log(`- Preflight:         ${preflightStatus === 'READY' ? 'READY 🟢' : preflightStatus === 'NOT_READY' ? 'NOT READY 🔴' : 'UNKNOWN ⚪'}`);
  console.log(`- Product Card:      ${productCardStatus === 'FOUND' ? 'FOUND 🟢' : 'MISSING ⚪'}`);
  if (cardObj) {
    console.log(`  * Active Product:  "${cardObj.name}"`);
    console.log(`  * Short Link:      ${cardObj.shortLink}`);
  }
  console.log(`- Shopee Audit:      ${auditStatus === 'PASS' ? 'PASS 🟢' : auditStatus === 'WARN' ? 'WARN ⚠️' : auditStatus === 'FAIL' ? 'FAIL 🔴' : auditStatus === 'NO_INPUT' ? 'NO INPUT ⚪' : 'UNKNOWN ⚪'}`);
  console.log(`- Next Step:         ${commerceAction}`);

  console.log('\n[2] Review Video');
  console.log(`- Preview:           ${previewStatus === 'FOUND' ? 'FOUND 🟢' : 'MISSING ⚪'}`);
  console.log(`- Review Pack:       ${reviewPackStatus === 'READY_FOR_FINAL_OPERATOR_APPROVAL' ? 'READY FOR APPROVAL 🟢' : 'MISSING ⚪'}`);
  if (packPath) {
    console.log(`  * Active Folder:   ${dirname(packPath)}`);
  }
  console.log(`- Next Step:         ${reviewAction}`);

  console.log('\n[3] Publish Readiness');
  console.log(`- Publish Manifest:  ${publishManifestStatus === 'FOUND' ? 'FOUND 🟢' : 'MISSING ⚪'}`);
  console.log(`- Page Route:        ${pageRouteStatus === 'FOUND' ? 'FOUND 🟢' : 'MISSING ⚪'}`);
  console.log(`- Reels Validation:  ${reelsValidationStatus === 'PASS' ? 'PASS 🟢' : reelsValidationStatus === 'FAIL' ? 'FAIL 🔴' : 'UNKNOWN ⚪'}`);
  console.log(`- Next Step:         ${publishAction}`);

  console.log('\n[4] Safety Lock Status');
  console.log('- Browser clicked:     false 🔒');
  console.log('- Facebook API called: false 🔒');
  console.log('- Auto-Publish:        false 🔒');
  console.log('- Read-only:           true  🔒');

  console.log('\n======================================================');
  console.log('💡 RECOMMENDED NEXT OPERATOR ACTION:');
  console.log(mainAdvice);
  console.log('======================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('[Dashboard] FATAL unexpected dashboard coordinator error:', err);
  process.exit(1);
});
