/**
 * Offline Publish Safety Manifest Generator — Round P19.
 *
 * Validates preceding approval status and outputs a secure publish metadata manifest.
 *
 * Command: tsx scripts/offline-publish-manifest-demo.ts --preview <path> --approval <path> [--report <path>] --output <path> [--mode <mode>]
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const options = {
  preview: { type: 'string' as const },
  approval: { type: 'string' as const },
  report: { type: 'string' as const },
  output: { type: 'string' as const },
  mode: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

function main() {
  const previewPath = values.preview;
  const approvalPath = values.approval;
  const reportPath = values.report;
  const outputPath = values.output;
  const mode = values.mode || 'pass';

  if (!previewPath || !approvalPath || !outputPath) {
    console.error('ERROR: Missing required options: --preview, --approval, --output are required.');
    process.exit(1);
  }

  console.log(`[PublishManifest] Initiating step. Mode: "${mode}"`);

  // 1. If preceding failure modes were invoked
  if (['product-fail', 'visual-fail', 'script-fail', 'voice-fail', 'render-fail', 'preview-fail'].includes(mode)) {
    console.error(`ERROR: Preceding failure condition detected: mode "${mode}". Halting publish manifest.`);
    process.exit(1);
  }

  // 2. Validate existence of input artifacts
  if (!existsSync(previewPath)) {
    console.error(`ERROR: Preview artifact not found at: ${previewPath}`);
    process.exit(1);
  }

  if (!existsSync(approvalPath)) {
    console.error(`ERROR: Approval artifact not found at: ${approvalPath}`);
    process.exit(1);
  }

  // 3. Parse and validate preview_artifact.json safety settings
  let previewMeta: any = null;
  try {
    previewMeta = JSON.parse(readFileSync(previewPath, 'utf8'));
  } catch (err: any) {
    console.error(`ERROR: Failed to parse preview artifact JSON: ${err.message}`);
    process.exit(1);
  }

  if (previewMeta.requiresOperatorReview !== true || previewMeta.readyForPublish !== false) {
    console.error('ERROR: Preview safety checks violated. Review is required and readyForPublish must be false.');
    process.exit(1);
  }

  // 4. Parse and validate approval_artifact.json status
  let approvalMeta: any = null;
  try {
    approvalMeta = JSON.parse(readFileSync(approvalPath, 'utf8'));
  } catch (err: any) {
    console.error(`ERROR: Failed to parse approval artifact JSON: ${err.message}`);
    process.exit(1);
  }

  if (approvalMeta.status !== 'approved') {
    console.error(`ERROR: Approval status is not approved: "${approvalMeta.status}". Halting.`);
    process.exit(1);
  }

  // 5. Handle publish-fail mode simulation
  if (mode === 'publish-fail') {
    console.error('ERROR: Publish simulation failed: Simulated downstream endpoint timeout.');
    process.exit(1);
  }

  // 6. Generate schema-compliant publish_manifest.json
  const publishId = `pub_${outputPath.split(/[\\/]/).reverse()[1] || 'run_id'}`;
  const generatedAt = new Date().toISOString();

  const publishManifest = {
    publishId,
    platform: 'facebook',
    target: {
      pageId: 'FACEBOOK_PAGE_ID_PLACEHOLDER',
      pageName: 'Review Nhà bạn',
      postType: 'reel_or_video',
    },
    sources: {
      previewArtifactPath: previewPath,
      approvalArtifactPath: approvalPath,
      runReportPath: reportPath || null,
      expectedPreviewPath: previewMeta.expectedPreviewPath || null,
    },
    captionDraft: {
      text: '[Caption Draft] Review sản phẩm gia dụng thông minh. Xem kỹ trước khi đăng.',
      hashtags: ['#review', '#giadungthongminh'],
      affiliateLinks: ['https://shope.ee/placeholder'],
    },
    safety: {
      allowPublish: false,
      requiresFinalApproval: true,
      operatorReviewState: 'READY_FOR_OPERATOR_REVIEW',
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      notes: 'Offline publish manifest only. Do not publish until operator explicitly approves.',
    },
    offlineMode: mode,
    generatedAt,
  };

  try {
    writeFileSync(outputPath, JSON.stringify(publishManifest, null, 2), 'utf8');
    console.log(`\n  [PublishManifest] Offline publish safety manifest generated at: ${outputPath}`);
    console.log('  [PublishManifest] allowPublish is false. Final approval is required. No Facebook API calls made.');
  } catch (err: any) {
    console.error(`ERROR: Failed to write publish manifest: ${err.message}`);
    process.exit(1);
  }
}

main();
