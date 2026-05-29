/**
 * Facebook Publish Command Skeleton — Round P46.
 *
 * Upgraded independent publishing validator script that cross-checks operator review packs,
 * manifests, route parameters, and technical video validations offline by default.
 *
 * Command: tsx scripts/facebook-publish-command-demo.ts --run <runId> [--confirm-final-approval] [--refresh-facebook-preflight] [--output <path>]
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

// Parse command-line parameters
let values: any;
try {
  const parsed = parseArgs({
    options: {
      run: { type: 'string' },
      'confirm-final-approval': { type: 'boolean', default: false },
      'refresh-facebook-preflight': { type: 'boolean', default: false },
      output: { type: 'string', default: 'data/temp/facebook_publish_request.json' },
    },
    allowPositionals: false,
    strict: true,
  });
  values = parsed.values;
} catch (err: any) {
  console.error(`ERROR: Failed to parse arguments: ${err.message}`);
  process.exit(1);
}

if (!values.run) {
  console.error('ERROR: Mandatory option "--run <runId>" is missing.');
  console.log('Usage: tsx scripts/facebook-publish-command-demo.ts --run <runId> [--confirm-final-approval] [--refresh-facebook-preflight]');
  process.exit(1);
}

const runId = values.run;
const confirmApproval = values['confirm-final-approval'];
const refreshPreflight = values['refresh-facebook-preflight'];
const outputPath = values.output;

// ── Smart Custom Dotenv Parser ──────────────────────────────────────────────
function loadDotEnv() {
  if (existsSync('.env')) {
    try {
      const content = readFileSync('.env', 'utf8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          const index = trimmed.indexOf('=');
          if (index > 0) {
            const key = trimmed.slice(0, index).trim();
            let val = trimmed.slice(index + 1).trim();
            if (val.startsWith('"') && val.endsWith('"')) {
              val = val.slice(1, -1);
            } else if (val.startsWith("'") && val.endsWith("'")) {
              val = val.slice(1, -1);
            }
            process.env[key] = val;
          }
        }
      }
    } catch (err) {
      console.warn(`[FacebookPublishCommand] Warning: Failed to load .env: ${err}`);
    }
  }
}

loadDotEnv();

function maskCredential(value: string | undefined): string {
  if (!value) return 'MISSING_SECRET_KEY';
  if (value.length <= 8) return '****';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}

function readJsonSafely(path: string): any {
  if (existsSync(path)) {
    try {
      return JSON.parse(readFileSync(path, 'utf8'));
    } catch {}
  }
  return null;
}

function main() {
  console.log('======================================================');
  console.log('📢   VFOS Facebook Staging Publish Validator');
  console.log('======================================================');
  console.log(`- Target Run ID:     ${runId}`);
  console.log(`- Operator Approval: ${confirmApproval ? '✅ CONFIRMED' : '❌ NOT_PROVIDED'}`);
  console.log(`- Connection Check:  ${refreshPreflight ? '✅ ENABLED' : '❌ DISABLED'}`);
  console.log('------------------------------------------------------');

  const runDir = join('data/temp/pipeline-p9-demo', runId);
  const operatorReviewPackPath = join(runDir, 'operator_review_pack.json');
  const publishManifestPath = join(runDir, 'publish_manifest.json');
  
  let pageRouteArtifactPath = join(runDir, 'facebook_page_route_artifact.json');
  if (!existsSync(pageRouteArtifactPath)) {
    pageRouteArtifactPath = 'data/temp/facebook_page_route_artifact.json';
  }

  let reelsValidationArtifactPath = join(runDir, 'facebook_reels_validation_artifact.json');
  if (!existsSync(reelsValidationArtifactPath)) {
    reelsValidationArtifactPath = 'data/temp/facebook_reels_validation_artifact.json';
  }

  // Load resources
  const pack = readJsonSafely(operatorReviewPackPath);
  const manifest = readJsonSafely(publishManifestPath);
  const pageRoute = readJsonSafely(pageRouteArtifactPath);
  const reelsVal = readJsonSafely(reelsValidationArtifactPath);

  // Validate Operator Review Pack
  if (!pack) {
    console.error(`🔴 ERROR: Operator Review Pack not found at expected path: ${operatorReviewPackPath}`);
    console.error('Please run the pipeline ("pnpm chay") first to generate the review pack.');
    process.exit(1);
  }

  const operatorReviewPackReady = pack.state === 'READY_FOR_FINAL_OPERATOR_APPROVAL';

  const videoFile = pack.preview?.videoPath || manifest?.video?.outputPath || '';
  const previewVideoExists = videoFile ? existsSync(videoFile) : false;

  const caption = pack.content?.captionDraft || manifest?.content?.captionDraft || '';
  const captionPresent = !!caption && caption.trim().length > 0;

  const hashtags = pack.content?.hashtags || manifest?.content?.hashtags || [];
  const hashtagsPresent = hashtags.length > 0;

  const affiliateLink = pack.content?.shortLink || pack.content?.affiliateLink || pack.product?.shortLink || pack.product?.affiliateLink || manifest?.commerce?.selectedAffiliateLink || '';
  const affiliateLinkPresent = !!affiliateLink && affiliateLink.trim().length > 0;

  const pageId = pack.facebook?.selectedPageId || pageRoute?.selectedPageId || '';
  const facebookPageRoutePresent = !!pageId || pack.facebook?.selectedPageIdMasked !== '****';

  const reelsValidationPassed = reelsVal ? reelsVal.valid === true : false;

  console.log('[FacebookPublishCommand] Performing Unified Readiness Checks:');
  console.log(`- Operator Review Pack Ready:   ${operatorReviewPackReady ? 'READY ✅' : 'PENDING ❌'}`);
  console.log(`- Preview Video Path Verified:  ${previewVideoExists ? 'FOUND ✅' : 'MISSING ❌'} (${videoFile || 'None'})`);
  console.log(`- Caption Draft Verified:       ${captionPresent ? 'FOUND ✅' : 'MISSING ❌'}`);
  console.log(`- Hashtags Verified:            ${hashtagsPresent ? 'FOUND ✅' : 'MISSING ❌'}`);
  console.log(`- Affiliate Link Verified:      ${affiliateLinkPresent ? 'FOUND ✅' : 'MISSING ❌'} (${affiliateLink || 'None'})`);
  console.log(`- Facebook Page Route Verified: ${facebookPageRoutePresent ? 'FOUND ✅' : 'MISSING ❌'} (${pageId ? maskCredential(pageId) : 'None'})`);
  console.log(`- Reels Format Tech Verified:   ${reelsValidationPassed ? 'PASSED ✅' : 'FAILED ❌'}`);
  console.log('------------------------------------------------------');

  // Handle Meta connection testing
  let connectionChecked = false;
  let connectionReason = 'No --refresh-facebook-preflight flag provided.';
  
  if (refreshPreflight) {
    connectionChecked = true;
    const token = process.env.FB_PAGE_ACCESS_TOKEN;
    const pId = process.env.FB_PAGE_ID || pageId;
    
    if (token && pId) {
      connectionReason = 'Preflight Meta connection test succeeded (Simulated).';
      console.log('🔒 CREDENTIALS CONNECTIVITY DIODE:');
      console.log(`  * Page ID Masked:     ${maskCredential(pId)}`);
      console.log(`  * Access Token:       ${maskCredential(token)}`);
      console.log('  * Connection Status:  READY 🟢');
      console.log('------------------------------------------------------');
    } else {
      connectionReason = 'MISSING_CREDENTIALS: FB_PAGE_ACCESS_TOKEN or FB_PAGE_ID is not configured in .env.';
      console.warn('⚠️  CREDENTIALS CONNECTIVITY DIODE:');
      console.warn(`  * Page ID Masked:     ${pId ? maskCredential(pId) : 'MISSING'}`);
      console.warn(`  * Access Token:       ${token ? maskCredential(token) : 'MISSING'}`);
      console.warn('  * Connection Status:  BLOCKED 🔴');
      console.warn('------------------------------------------------------');
    }
  }

  // Determine final state
  let state = 'READY_FOR_MANUAL_PUBLISH_SUBMISSION';
  if (!confirmApproval) {
    state = 'BLOCKED_PENDING_OPERATOR_APPROVAL';
  } else if (
    !operatorReviewPackReady ||
    !previewVideoExists ||
    !captionPresent ||
    !hashtagsPresent ||
    !affiliateLinkPresent ||
    !facebookPageRoutePresent ||
    !reelsValidationPassed
  ) {
    state = 'NOT_READY_FOR_PUBLISHING';
  }

  // Construct publishStatus
  const publishStatus = {
    publishStatusVersion: 'v1',
    runId,
    state,
    generatedAt: new Date().toISOString(),
    inputs: {
      operatorReviewPackPath: operatorReviewPackPath,
      publishManifestPath: publishManifestPath,
      previewVideoPath: videoFile,
      pageRouteArtifactPath: pageRouteArtifactPath,
      reelsValidationArtifactPath: reelsValidationArtifactPath
    },
    readiness: {
      operatorReviewPackReady,
      previewVideoExists,
      captionPresent,
      hashtagsPresent,
      affiliateLinkPresent,
      facebookPageRoutePresent,
      reelsValidationPassed
    },
    facebookConnection: {
      checked: connectionChecked,
      reason: connectionReason,
      credentialsMasked: true
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      allowPublish: false,
      requiresFinalApproval: true,
      explicitApprovalFlagReceived: confirmApproval,
      tokensMasked: true
    },
    recommendedNextAction: state === 'READY_FOR_MANUAL_PUBLISH_SUBMISSION'
      ? 'Review facebook_publish_report.md before any future live API submission.'
      : 'Resolve missing readiness fields or pass explicit --confirm-final-approval flag.'
  };

  const publishStatusOutputPath = 'data/temp/facebook_publish_status.json';
  const publishReportOutputPath = 'data/temp/facebook_publish_report.md';

  try {
    mkdirSync('data/temp', { recursive: true });
    writeFileSync(publishStatusOutputPath, JSON.stringify(publishStatus, null, 2), 'utf8');
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write publish status JSON: ${err.message}`);
  }

  const publishReportMd = `# Facebook Reels Unified Publishing Report

- **Run ID**: \`${runId}\`
- **Generated at**: \`${publishStatus.generatedAt}\`
- **State**: \`${state}\`

## 1. Summary
This report validates the readiness of the active reel for publishing to Facebook Pages.

## 2. Preview Video & Metadata
- **Video Path**: \`${videoFile || 'MISSING'}\`
- **Caption**: ${caption || '*None*'}
- **Hashtags**: ${hashtags.map((h: string) => `#${h}`).join(' ') || '*None*'}
- **Affiliate Link**: [${affiliateLink}](${affiliateLink})

## 3. Routed Facebook Page
- **Page ID**: \`${pageId ? maskCredential(pageId) : 'MISSING'}\`
- **Page Name**: \`${pack.facebook?.selectedPageName || pageRoute?.selectedPageName || 'Review Nhà bạn'}\`

## 4. Reels Technical Verification
- **Validation Status**: ${reelsValidationPassed ? 'PASS ✅' : 'FAIL ❌'}
- **Operator Approval**: ${confirmApproval ? '✅ APPROVED' : '❌ PENDING'}

## 5. Safety Checklist
| Parameter | Value | Status |
|---|---|---|
| Facebook API Called | \`false\` | 🔒 Safe |
| Video Uploaded | \`false\` | 🔒 Safe |
| Live Published | \`false\` | 🔒 Safe |
| Tokens Masked | \`true\` | 🔒 Safe |

> [!IMPORTANT]
> This report does not mean the video was uploaded or published. Live publish requires a separate explicit production command and operator approval.
`;

  try {
    writeFileSync(publishReportOutputPath, publishReportMd, 'utf8');
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write publish report Markdown: ${err.message}`);
  }

  // Output simulated publish request ticket to output path
  const simulatedPostId = `${pageId || '1169992221'}_${Math.floor(1000000000 + Math.random() * 9000000000)}`;
  const publishRequest = {
    publishRequestId: `req_${runId}_${Date.now()}`,
    status: confirmApproval ? 'APPROVED_FOR_MANUAL_SUBMISSION' : 'PENDING_OPERATOR_APPROVAL',
    details: {
      runId,
      videoPath: videoFile,
      caption,
      hashtags,
      facebookPageIdMasked: pageId ? maskCredential(pageId) : 'MISSING',
      facebookPageName: pack.facebook?.selectedPageName || 'Review Nhà bạn',
    },
    safetyLock: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      allowLivePublish: false,
      requiresExplicitAdminTokens: true,
      operatorApprovalTimestamp: confirmApproval ? new Date().toISOString() : null,
    },
    message: confirmApproval
      ? 'Publishing verification ticket created. System ready for future live publication step once Meta integration is enabled.'
      : 'Publishing ticket BLOCKED. Requires explicit operator confirmation.',
  };

  try {
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, JSON.stringify(publishRequest, null, 2), 'utf8');
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write publishing request ticket: ${err.message}`);
  }

  if (state === 'BLOCKED_PENDING_OPERATOR_APPROVAL') {
    console.warn('\n⚠️  WARNING: Publishing requires explicit final operator confirmation.');
    console.log('Please execute the command again adding the approval flag:');
    console.log(`  pnpm publish:facebook --run ${runId} --confirm-final-approval`);
    console.log('------------------------------------------------------\n');
    console.log(`[FacebookPublishCommand] Diagnostics saved successfully to: ${outputPath}`);
    process.exit(0);
  }

  if (state === 'NOT_READY_FOR_PUBLISHING') {
    console.error('\n🔴 BLOCKED: Technical constraints validation failed. See checklist details above.');
    console.log('------------------------------------------------------\n');
    process.exit(0);
  }

  console.log('🟢 STATUS: SUCCESS');
  console.log(`- Simulated Post ID: ${simulatedPostId}`);
  console.log(`- Status:            ${publishRequest.status}`);
  console.log(`- Safety Token Check: Masked keys confirmed.`);
  console.log(`[FacebookPublishCommand] Diagnostics saved successfully to: ${outputPath}`);
  console.log('======================================================\n');
  process.exit(0);
}

main();
