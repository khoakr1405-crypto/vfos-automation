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

  let gitSyncStatus: 'PASS' | 'WARN' | 'DIVERGED' | 'DIRTY' | 'BLOCKED' | 'UNKNOWN' = 'UNKNOWN';
  let gitSyncObj: any = null;
  const gitSyncPath = 'data/temp/vfos_git_sync_status.json';
  if (existsSync(gitSyncPath)) {
    try {
      gitSyncObj = JSON.parse(readFileSync(gitSyncPath, 'utf8'));
      gitSyncStatus = gitSyncObj.status || 'UNKNOWN';
    } catch {}
  }

  // Git handoff inference logic
  let recommendedGitCommand = 'pnpm vfos:sync-check';
  let gitReason = 'Git synchronization status is unknown. Initialize sync check.';
  let requiresManualOperatorAction = true;
  let untrackedLocalOnlyWarning = false;

  const ahead = gitSyncObj?.sync?.ahead || 0;
  const behind = gitSyncObj?.sync?.behind || 0;
  const hasUntracked = (gitSyncObj?.workingTree?.untrackedCount || 0) > 0;

  if (gitSyncStatus === 'PASS') {
    recommendedGitCommand = '';
    gitReason = 'Git sync is clean. Continue with normal VFOS workflow.';
    requiresManualOperatorAction = false;
    untrackedLocalOnlyWarning = false;
  } else if (gitSyncStatus === 'WARN') {
    if (ahead > 0) {
      recommendedGitCommand = 'pnpm vfos:sync-check --confirm-push --ack-untracked-local';
      gitReason = 'Local commits exist and should be pushed before switching machines.';
      untrackedLocalOnlyWarning = hasUntracked;
    } else if (behind > 0) {
      recommendedGitCommand = 'pnpm vfos:sync-check --confirm-pull --ack-untracked-local';
      gitReason = 'Remote has newer commits. Pull before continuing on this machine.';
      untrackedLocalOnlyWarning = hasUntracked;
    } else {
      recommendedGitCommand = 'pnpm vfos:sync-check';
      gitReason = 'Switch branch or review git parameters.';
      untrackedLocalOnlyWarning = false;
    }
  } else if (gitSyncStatus === 'DIRTY') {
    recommendedGitCommand = 'pnpm vfos:sync-check';
    gitReason = 'Review modified/untracked files before continuing.';
    untrackedLocalOnlyWarning = hasUntracked;
  } else if (gitSyncStatus === 'BLOCKED') {
    recommendedGitCommand = 'pnpm vfos:sync-check';
    gitReason = 'Sensitive/runtime staged risk must be resolved first.';
    untrackedLocalOnlyWarning = false;
  } else if (gitSyncStatus === 'DIVERGED') {
    recommendedGitCommand = 'pnpm vfos:sync-check';
    gitReason = 'Stop and resolve Git divergence manually.';
    untrackedLocalOnlyWarning = false;
  }

  const gitHandoff = {
    status: gitSyncStatus,
    recommendedCommand: recommendedGitCommand,
    reason: gitReason,
    requiresManualOperatorAction,
    dashboardExecutedAction: false,
    untrackedLocalOnlyWarning,
  };

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

  let facebookPublishStatusState: string = 'MISSING';
  const facebookPublishStatusPath = 'data/temp/facebook_publish_status.json';
  if (existsSync(facebookPublishStatusPath)) {
    try {
      const pubStatusObj = JSON.parse(readFileSync(facebookPublishStatusPath, 'utf8'));
      if (pubStatusObj && pubStatusObj.state) {
        facebookPublishStatusState = pubStatusObj.state;
      }
    } catch {}
  }

  let packageStatus: 'FOUND' | 'MISSING' = 'MISSING';
  const catalogPath = 'production/archive/catalog.json';
  if (existsSync(catalogPath)) {
    try {
      const catalogObj = JSON.parse(readFileSync(catalogPath, 'utf8'));
      if (catalogObj && Array.isArray(catalogObj.packages)) {
        const found = catalogObj.packages.find((p: any) => p.runId === runId);
        if (found) {
          packageStatus = 'FOUND';
        }
      }
    } catch {}
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
    if (facebookPublishStatusState === 'READY_FOR_MANUAL_PUBLISH_SUBMISSION') {
      publishAction = '🟢 Preflight publish report ready and verified. Open facebook_publish_report.md to review.';
    } else if (facebookPublishStatusState === 'BLOCKED_PENDING_OPERATOR_APPROVAL') {
      publishAction = '👉 Review pack ready! Run-based publish is deprecated — locate the jobId via "pnpm job:dashboard" / "pnpm job:status", then run: pnpm job:publish-facebook --job <jobId> --dry-run';
    } else if (facebookPublishStatusState === 'NOT_READY_FOR_PUBLISHING') {
      publishAction = '❌ Unified publishing validation failed. Resolve missing readiness fields.';
    } else {
      publishAction = '👉 Review pack ready! Run-based publish is deprecated — locate the jobId via "pnpm job:dashboard" / "pnpm job:status", then run: pnpm job:publish-facebook --job <jobId> --dry-run';
    }
  }

  // Final consolidated workflow advice
  let mainAdvice = 'Perform commerce diagnostics to kickstart daily intake workflow.';
  if (gitSyncStatus === 'BLOCKED') {
    mainAdvice = 'CRITICAL: Git Sync is BLOCKED by staged sensitive/runtime risks. Run pnpm vfos:sync-check to inspect.';
  } else if (gitSyncStatus === 'DIVERGED') {
    mainAdvice = 'CRITICAL: Git branches have DIVERGED. Please resolve conflicts manually before proceeding.';
  } else if (gitSyncStatus === 'WARN' && preflightStatus !== 'READY' && productCardStatus === 'MISSING') {
    mainAdvice = 'Git sync warning detected. It is highly recommended to sync git (push/pull) before daily workflows.';
  } else if (productCardStatus === 'MISSING') {
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
    if (facebookPublishStatusState === 'READY_FOR_MANUAL_PUBLISH_SUBMISSION') {
      mainAdvice = 'Preflight publish report ready and verified. Open facebook_publish_report.md to review.';
    } else {
      mainAdvice = 'Inspect latest video run in operator_review_pack.md. Run-based publish is deprecated — locate the jobId via "pnpm job:dashboard" / "pnpm job:status", then run: pnpm job:publish-facebook --job <jobId> --dry-run';
    }
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
      gitSyncStatus,
    },
    gitHandoff,
  };

  try {
    mkdirSync(dirname(statusOutputPath), { recursive: true });
    writeFileSync(statusOutputPath, JSON.stringify(dashboardStatus, null, 2), 'utf8');
  } catch {}

  // ======================================================
  // STAGE INFERENCE ENGINE
  // ======================================================
  type StageType = 
    | 'NO_PRODUCT_CARD'
    | 'COMMERCE_PREFLIGHT_READY'
    | 'PRODUCT_CARD_READY'
    | 'SHOPEE_AUDIT_FAILED'
    | 'VIDEO_PREVIEW_MISSING'
    | 'VIDEO_REVIEW_READY'
    | 'FINAL_OPERATOR_REVIEW'
    | 'PUBLISH_REQUEST_READY'
    | 'UNKNOWN';

  let lastCompletedStage: StageType = 'UNKNOWN';
  let nextStage: 'COMMERCE_PREFLIGHT' | 'COMMERCE_INTAKE' | 'VIDEO_PREVIEW_GENERATION' | 'FINAL_OPERATOR_REVIEW' | 'MANUAL_INSPECTION' | 'UNKNOWN' = 'UNKNOWN';

  if (productCardStatus === 'MISSING') {
    lastCompletedStage = 'NO_PRODUCT_CARD';
    if (preflightStatus === 'READY') {
      nextStage = 'COMMERCE_INTAKE';
    } else {
      nextStage = 'COMMERCE_PREFLIGHT';
    }
  } else if (auditStatus === 'FAIL') {
    lastCompletedStage = 'SHOPEE_AUDIT_FAILED';
    nextStage = 'COMMERCE_INTAKE';
  } else if (productCardStatus === 'FOUND' && auditStatus !== 'FAIL') {
    if (reviewPackStatus === 'MISSING') {
      lastCompletedStage = 'PRODUCT_CARD_READY';
      nextStage = 'VIDEO_PREVIEW_GENERATION';
    } else if (reviewPackStatus === 'READY_FOR_FINAL_OPERATOR_APPROVAL') {
      lastCompletedStage = 'VIDEO_REVIEW_READY';
      nextStage = 'FINAL_OPERATOR_REVIEW';
    }
  }
  if (publishRequestStatus === 'FOUND' || publishManifestStatus === 'FOUND') {
    lastCompletedStage = 'PUBLISH_REQUEST_READY';
    nextStage = 'MANUAL_INSPECTION';
  }

  // ======================================================
  // EXPORT OPERATOR DAILY RUNBOOK (data/temp/vfos_daily_runbook.md)
  // ======================================================
  const runbookPath = 'data/temp/vfos_daily_runbook.md';
  
  // Map recommended next CLI command dynamically
  let recommendedNextCommand = 'pnpm commerce:intake';
  let recommendedWhy = 'Preflight connection diagnostics is recommended prior to extraction workflows.';
  let expectedResult = 'CDP preflight diagnostic outputs connection and debug port ready status.';

  if (productCardStatus === 'MISSING') {
    if (preflightStatus === 'READY') {
      recommendedNextCommand = 'pnpm commerce:intake --confirm-targeted-click';
      recommendedWhy = 'CDP port 9222 connection is READY! Proceed to perform exactly 1 controlled link click and capture affiliate credentials.';
      expectedResult = 'Normalized Selected Product Card is extracted to data/temp/selected_product_card.json.';
    } else {
      recommendedNextCommand = 'pnpm commerce:intake';
      recommendedWhy = 'CDP debugging port connection is closed or not ready. Initialize preflight check to diagnose connection.';
      expectedResult = 'Diagnostic report is exported to data/temp/shopee_cdp_preflight_status.json.';
    }
  } else if (auditStatus === 'FAIL') {
    recommendedNextCommand = 'pnpm commerce:intake --confirm-targeted-click';
    recommendedWhy = 'Shopee link registry audit has failed. Please resolve duplication/owner issues or re-extract Product Card.';
    expectedResult = 'Fresh product card passes local audit gates.';
  } else if (reviewPackStatus === 'MISSING') {
    recommendedNextCommand = 'pnpm chay --offline';
    recommendedWhy = 'Shopee Product Card is audited and ready! Run localized preview generator pipeline to build review package.';
    expectedResult = 'Audio, script, and preview video rendering completed inside active run directory.';
  } else if (reviewPackStatus === 'READY_FOR_FINAL_OPERATOR_APPROVAL') {
    recommendedNextCommand = 'pnpm job:publish-facebook --job <jobId> --dry-run';
    recommendedWhy = 'Consolidated operator review pack is fully generated. Run-based publish is deprecated — locate the jobId via "pnpm job:dashboard" / "pnpm job:status" after manually inspecting the preview, then trigger the job-based publish readiness (dry-run). Live publish requires explicit --confirm-live-publish.';
    expectedResult = 'Job-based dry-run publish readiness report built; no live upload performed.';
  }

  // Override with sync checks when critical git warning or blocking staged artifacts exist
  if (gitSyncStatus === 'BLOCKED') {
    recommendedNextCommand = recommendedGitCommand;
    recommendedWhy = 'CRITICAL: Git Sync is BLOCKED due to staged sensitive/runtime risks. Run sync-check to resolve.';
    expectedResult = 'Operator unstages sensitive/runtime files to return workspace to a safe state.';
  } else if (gitSyncStatus === 'DIVERGED') {
    recommendedNextCommand = recommendedGitCommand;
    recommendedWhy = 'CRITICAL: Branch history has diverged between local and origin. Please resolve manually.';
    expectedResult = 'Workspace is synchronized with origin remote.';
  } else if (gitSyncStatus === 'WARN') {
    if (recommendedNextCommand === 'pnpm commerce:intake' || recommendedNextCommand === 'pnpm commerce:intake --confirm-targeted-click') {
      recommendedNextCommand = recommendedGitCommand;
      recommendedWhy = `Git Sync warning detected (Ahead/Behind). ${gitReason}`;
      expectedResult = 'Git sync-check reports clean and synchronized status.';
    }
  }

  const runbookMarkdown = `# VFOS Daily Workflow Runbook

> [!IMPORTANT]
> \`pnpm vfos:daily\` is a read-only dashboard. It does not click, upload, publish, or call live APIs.

## 1. Current Operational State
- Generated at: \`${new Date().toISOString()}\`
- Commerce Intake: \`${preflightStatus === 'READY' ? 'READY ✅' : preflightStatus === 'NOT_READY' ? 'NOT READY ❌' : 'UNKNOWN ⚪'}\`
- Product Card: \`${productCardStatus === 'FOUND' ? 'FOUND ✅' : 'MISSING ❌'}\`${cardObj ? ` ("${cardObj.name}")` : ''}
- Shopee Audit: \`${auditStatus === 'PASS' ? 'PASS ✅' : auditStatus === 'WARN' ? 'WARN ⚠️' : auditStatus === 'FAIL' ? 'FAIL ❌' : 'UNKNOWN ⚪'}\`
- Review Preview: \`${previewStatus === 'FOUND' ? 'FOUND ✅' : 'MISSING ❌'}\`
- Operator Review Pack: \`${reviewPackStatus === 'READY_FOR_FINAL_OPERATOR_APPROVAL' ? 'READY FOR APPROVAL ✅' : 'MISSING ❌'}\`
- Publish Readiness: \`${publishManifestStatus === 'FOUND' ? 'READY ✅' : 'PENDING ❌'}\`
- Git Sync Status: \`${gitSyncStatus === 'PASS' ? 'PASS ✅' : gitSyncStatus === 'WARN' ? 'WARN ⚠️' : gitSyncStatus === 'BLOCKED' ? 'BLOCKED ❌' : gitSyncStatus === 'DIRTY' ? 'DIRTY 🟡' : 'UNKNOWN ⚪'}\`

## 2. Recommended Next Action
- **Command**: \`${recommendedNextCommand}\`
- **Why this command**: ${recommendedWhy}
- **Expected result**: ${expectedResult}

## 3. Safety Preconditions
- Cốc Cốc (the only supported browser for the Shopee Affiliate flow) must be started with remote debugging enabled on port 9222 (\`--remote-debugging-port=9222\`).
- The browser must be actively navigated to the Shopee Affiliate Product Offer catalog tab.
- Absolutely **never** input passwords or bypass automated OTP prompts inside CDP automation.
- Do not bypass or manually click security overlay layers or CAPTCHA blockers when automated scripts are connected.

## 4. Step-by-Step Operator Workflow
1. Run \`pnpm vfos:daily\` to check active operational states.
2. If Product Card is missing, launch preflight checks and extract exactly 1 candidate card (\`pnpm commerce:intake --confirm-targeted-click\`).
3. Confirm that Shopee Affiliate link registry offline audit successfully passes.
4. Trigger the review video and preview renderer pipeline (\`pnpm chay --offline\`).
5. Open \`operator_review_pack.md\` to manually review the generated reel kịch bản, hashtag, and video preview.
6. Once manually approved, locate the jobId via \`pnpm job:dashboard\` / \`pnpm job:status\`, then trigger the publish dry-run (\`pnpm job:publish-facebook --job <jobId> --dry-run\`). Live publish requires an explicit \`--confirm-live-publish\`.

## 5. Strict Operational Boundaries
- Do not share \`.env\`, tokens, cookies, sessions, or browser storage.
- Do not publish automatically.
- Do not run live Facebook publishing without explicit final approval.
- Do not bypass Shopee login, OTP, CAPTCHA, or security prompts.
- Do not manually edit runtime artifacts unless you know exactly what you are doing.
- Do not commit files from \`data/temp/\`.
- Do not commit media files such as \`.mp4\`, \`.mp3\`, \`.wav\`, \`.m4a\`.

## 6. Useful Commands
- \`pnpm vfos:daily\` — Check central dashboard and export runbook
- \`pnpm vfos:daily --refresh-preflight\` — Diagnostic browser diagnostic connection refresh
- \`pnpm commerce:intake\` — Shopee preflight check
- \`pnpm commerce:intake --confirm-targeted-click\` — Controlled 1-link Shopee extraction click
- \`pnpm chay\` — Pipeline review run
- \`pnpm chay --offline\` — Pipeline review offline execution
- \`pnpm status -- --offline\` — Pipeline dashboard run status checks
- \`pnpm job:publish-facebook --job <jobId> --dry-run\` — Operator publish readiness (live upload needs explicit \`--confirm-live-publish\`)

## 7. Artifact Paths
- **vfos_daily_status.json**: \`${resolve(statusOutputPath)}\`
- **vfos_daily_runbook.md**: \`${resolve(runbookPath)}\`
- **selected_product_card.json**: \`${resolve(cardPath)}\`
- **operator_review_pack.md**: \`${packPath ? resolve(dirname(packPath), 'operator_review_pack.md') : 'MISSING'}\`
- **preview.mp4**: \`${packPath ? resolve(dirname(packPath), 'preview.mp4') : 'MISSING'}\`

## 8. Git Sync Handoff
- **Status**: ${gitSyncStatus}
- **Recommended command**:
  \`\`\`bash
  ${recommendedGitCommand || 'None'}
  \`\`\`
- **Reason**: ${gitReason}
- **Operator note**: This dashboard does not execute Git actions. Copy and run the command manually if appropriate.

> [!IMPORTANT]
> Untracked local files are not pushed to GitHub. If these files matter, intentionally add/commit them or back them up before switching machines.
`;

  try {
    writeFileSync(runbookPath, runbookMarkdown, 'utf8');
  } catch (err: any) {
    console.error(`[Dashboard] Failed to write daily runbook: ${err.message}`);
  }

  // ======================================================
  // EXPORT OPERATOR STATE CHECKPOINT (data/temp/vfos_operator_checkpoint.json & md)
  // ======================================================
  const checkpointJsonPath = 'data/temp/vfos_operator_checkpoint.json';
  const checkpointMdPath = 'data/temp/vfos_operator_checkpoint.md';

  const checkpointJson = {
    checkpointVersion: 'v1',
    generatedAt: new Date().toISOString(),
    source: 'pnpm vfos:daily',
    repo: {
      syncReminder: 'Before switching machines, commit/push on the old machine and pull latest on the new machine.',
      shouldCheckGitBeforeContinuing: true,
      gitSyncStatus
    },
    gitHandoff,
    session: {
      lastCompletedStage,
      nextStage,
      recommendedNextCommand,
      recommendedNextReason: recommendedWhy
    },
    commerce: {
      preflight: preflightStatus,
      productCard: productCardStatus,
      shopeeAudit: auditStatus,
      selectedProductCardPath: cardPath
    },
    review: {
      preview: previewStatus,
      previewPath: previewPath || null,
      operatorReviewPack: reviewPackStatus,
      operatorReviewPackPath: packPath || null,
      latestRunId: runId
    },
    publish: {
      publishManifest: publishManifestStatus,
      publishRequest: publishRequestStatus,
      facebookRoute: pageRouteStatus,
      reelsValidation: reelsValidationStatus,
      safeToAutoPublish: false
    },
    safety: {
      readOnlyCheckpoint: true,
      clickedBrowser: false,
      ranExtractor: false,
      ranChay: false,
      calledShopeeApi: false,
      calledFacebookApi: false,
      calledOpenAiApi: false,
      calledElevenLabsApi: false,
      published: false,
      uploaded: false,
      readEnv: false,
      tokensMasked: true
    },
    handover: {
      forSameMachine: [
        'Run pnpm vfos:daily to refresh dashboard and checkpoint.',
        'Follow recommendedNextCommand only after reviewing safety preconditions.'
      ],
      forDifferentMachine: [
        'On the old machine, ensure all intended code changes are committed and pushed.',
        'On the new machine, run git pull before continuing.',
        'Do not assume data/temp runtime artifacts exist on the new machine unless manually transferred.',
        'Never commit .env, cookies, sessions, tokens, media outputs, or data/temp artifacts.'
      ]
    }
  };

  try {
    writeFileSync(checkpointJsonPath, JSON.stringify(checkpointJson, null, 2), 'utf8');
  } catch (err: any) {
    console.error(`[Dashboard] Failed to write JSON checkpoint: ${err.message}`);
  }

  const checkpointMd = `# VFOS Operator Checkpoint

> [!IMPORTANT]
> This checkpoint is read-only. It does not click, extract, upload, publish, or call live APIs.

## 1. Session Summary
- Generated at: \`${checkpointJson.generatedAt}\`
- Last completed stage: \`${lastCompletedStage}\`
- Next stage: \`${nextStage}\`
- Recommended next command: \`${recommendedNextCommand}\`
- Reason: ${recommendedWhy}

## 2. Current State
| Area | Status | Artifact |
|---|---|---|
| Commerce Preflight | \`${preflightStatus}\` | \`${preflightPath}\` |
| Product Card | \`${productCardStatus}\` | \`${cardPath}\` |
| Shopee Audit | \`${auditStatus}\` | \`${auditPath}\` |
| Preview Video | \`${previewStatus}\` | \`${previewPath || 'MISSING'}\` |
| Operator Review Pack | \`${reviewPackStatus}\` | \`${packPath || 'MISSING'}\` |
| Publish Manifest | \`${publishManifestStatus}\` | \`${activeRunDir ? join(activeRunDir, 'publish_manifest.json') : 'MISSING'}\` |
| Git Sync Status | \`${gitSyncStatus}\` | \`data/temp/vfos_git_sync_status.json\` |

## 3. Safety Flags
- Browser clicked: false
- Extractor ran: false
- Facebook API called: false
- Published: false
- Uploaded: false
- Read \`.env\`: false

## 4. Handover Notes
### Same machine
- Run \`pnpm vfos:daily\` before continuing.
- Follow the recommended next command only after reviewing safety preconditions.

### Switching machines
- Commit/push intended code changes on the old machine.
- On the new machine, run \`git pull\` first.
- Runtime artifacts in \`data/temp\` may not exist on the new machine.
- Never commit \`.env\`, cookies, tokens, sessions, media outputs, or runtime artifacts.

## 5. Recommended Next Step
\`\`\`bash
${recommendedNextCommand}
\`\`\`

## 6. Strict Boundaries
* Do not auto-publish.
* Do not bypass Shopee login, OTP, or CAPTCHA.
* Do not run extractor without explicit targeted-click confirmation.
* Do not run live publish without explicit final approval.

## 7. Git Sync Handoff
- **Status**: ${gitSyncStatus}
- **Recommended command**:
  \`\`\`bash
  ${recommendedGitCommand || 'None'}
  \`\`\`
- **Reason**: ${gitReason}
- **Operator note**: This dashboard does not execute Git actions. Copy and run the command manually if appropriate.

> [!IMPORTANT]
> Untracked local files are not pushed to GitHub. If these files matter, intentionally add/commit them or back them up before switching machines.
`;

  try {
    writeFileSync(checkpointMdPath, checkpointMd, 'utf8');
  } catch (err: any) {
    console.error(`[Dashboard] Failed to write Markdown checkpoint: ${err.message}`);
  }

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
  if (facebookPublishStatusState !== 'MISSING') {
    console.log(`- Publish Status:    ${facebookPublishStatusState === 'READY_FOR_MANUAL_PUBLISH_SUBMISSION' ? 'READY FOR SUBMISSION 🟢' : facebookPublishStatusState === 'BLOCKED_PENDING_OPERATOR_APPROVAL' ? 'PENDING APPROVAL 🟡' : 'NOT READY 🔴'}`);
  }
  console.log(`- Production Pack:   ${packageStatus === 'FOUND' ? 'PACKED 🟢' : 'MISSING ⚪'}`);
  console.log(`- Next Step:         ${publishAction}`);

  const registryPath = 'data/temp/vfos_jobs_registry.json';
  if (existsSync(registryPath)) {
    try {
      const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
      if (reg && Array.isArray(reg.jobs) && reg.jobs.length > 0) {
        console.log('\n[3.5] Active Jobs Registry Status');
        for (const job of reg.jobs) {
          const checkPath = `data/temp/jobs/${job.jobId}/launch_check_report.json`;
          let launchStatus = 'PENDING ⚪';
          if (existsSync(checkPath)) {
            try {
              const rep = JSON.parse(readFileSync(checkPath, 'utf8'));
              launchStatus = rep.decision === 'READY_FOR_OPERATOR_GO_DECISION' ? 'READY 🟢' : 'NO_GO 🔴';
            } catch {}
          }
          console.log(`- Job: ${job.jobId} | State: ${job.state} | Review: ${job.operatorDecision} | Pre-live: ${launchStatus}`);
        }
      }
    } catch {}
  }

  console.log('\n[4] Safety Lock Status');
  console.log('- Browser clicked:     false 🔒');
  console.log('- Facebook API called: false 🔒');
  console.log('- Auto-Publish:        false 🔒');
  console.log('- Read-only:           true  🔒');
  console.log(`- Git Sync Status:     ${gitSyncStatus === 'PASS' ? 'PASS 🟢' : gitSyncStatus === 'WARN' ? 'WARN 🟡' : gitSyncStatus === 'BLOCKED' ? 'BLOCKED 🔴' : gitSyncStatus === 'DIRTY' ? 'DIRTY 🟡' : 'UNKNOWN ⚪'}`);

  if (gitSyncStatus === 'BLOCKED') {
    console.log('\n======================================================');
    console.log('🚫 Git Sync Requires Attention');
    console.log('======================================================');
    console.log('Status:              BLOCKED 🔴');
    console.log(`Recommended command:\n${recommendedGitCommand}`);
    console.log(`\nReason:\n${gitReason}`);
    console.log('======================================================');
  } else if (gitSyncStatus === 'DIVERGED') {
    console.log('\n======================================================');
    console.log('🚫 Git Sync Requires Attention');
    console.log('======================================================');
    console.log('Status:              DIVERGED 🔴');
    console.log(`Recommended command:\n${recommendedGitCommand}`);
    console.log(`\nReason:\n${gitReason}`);
    console.log('======================================================');
  } else {
    console.log('\n======================================================');
    console.log('🧭 Git Sync Handoff');
    console.log('======================================================');
    console.log(`Status:              ${gitSyncStatus === 'PASS' ? 'PASS 🟢' : gitSyncStatus + ' 🟡'}`);
    console.log(`Recommended command:\n${recommendedGitCommand || 'None'}`);
    console.log(`\nReason:\n${gitReason}`);
    if (untrackedLocalOnlyWarning) {
      console.log('\nWarning:\nUntracked local files will NOT be pushed to GitHub.');
    }
    console.log('======================================================');
  }

  console.log('\n======================================================');
  console.log('💡 RECOMMENDED NEXT OPERATOR ACTION:');
  console.log(mainAdvice);
  console.log('------------------------------------------------------');
  console.log(`Runbook exported:\n${runbookPath}`);
  console.log(`\nCheckpoint exported:\n${checkpointJsonPath}\n${checkpointMdPath}`);
  console.log(`\nLast completed stage:\n${lastCompletedStage}`);
  console.log(`\nNext stage:\n${nextStage}`);
  console.log(`\nRecommended next command:\n${recommendedNextCommand}`);
  console.log('======================================================\n');

  process.exit(0);
}

main().catch((err) => {
  console.error('[Dashboard] FATAL unexpected dashboard coordinator error:', err);
  process.exit(1);
});
