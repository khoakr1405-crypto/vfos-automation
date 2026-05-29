/**
 * Operator Review Pack Generator — Round P35.
 *
 * Aggregates all pipeline artifacts into a final operator review pack
 * (JSON + Markdown) for manual approval before any live publish action.
 *
 * Command: tsx scripts/operator-review-pack-demo.ts --outputDir <dir> [--mode <mode>]
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';

let values: any;
try {
  const parsed = parseArgs({
    options: {
      outputDir: { type: 'string' },
      mode: { type: 'string', default: 'local-preview' },
    },
    allowPositionals: false,
    strict: true,
  });
  values = parsed.values;
} catch (err: any) {
  console.error(`ERROR: Failed to parse arguments: ${err.message}`);
  process.exit(1);
}

if (!values.outputDir) {
  console.error('ERROR: Mandatory option "--outputDir <path>" is missing.');
  process.exit(1);
}

const outputDir = values.outputDir;
const mode = values.mode;

// Helper to safely read and parse JSON
function readJson(filePath: string): any | null {
  if (!existsSync(filePath)) return null;
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function main() {
  console.log('======================================================');
  console.log('🧾   VFOS Operator Review Pack Generator');
  console.log('======================================================');
  console.log(`[ReviewPack] Output directory: ${outputDir}`);
  console.log(`[ReviewPack] Mode: ${mode}`);

  // 1. Read all available pipeline artifacts
  const previewArtifact = readJson(join(outputDir, 'preview_artifact.json'));
  const scriptArtifact = readJson(join(outputDir, 'script_artifact.json'));
  const voiceArtifact = readJson(join(outputDir, 'voice_artifact.json'));
  const bgmArtifact = readJson(join(outputDir, 'bgm_selection_artifact.json'));
  const publishManifest = readJson(join(outputDir, 'publish_manifest.json'));
  const productMatch = readJson(join(outputDir, 'product_match_artifact.json'));
  const renderManifest = readJson(join(outputDir, 'render_manifest.json'));
  const approvalArtifact = readJson(join(outputDir, 'approval_artifact.json'));
  const runReport = readJson(join(outputDir, 'run_report.json'));

  // Also read the live product card if available
  const liveCard = readJson('data/temp/selected_product_card.json');

  // 2. Extract key fields safely
  const videoPath = previewArtifact?.actualPreviewPath || join(outputDir, 'preview.mp4');
  const captionDraft = scriptArtifact?.captionDraft || publishManifest?.captionDraft?.text || '';
  const hashtags = scriptArtifact?.hashtags || publishManifest?.captionDraft?.hashtags || [];
  const hook3s = scriptArtifact?.hook3s || '';
  const voiceover = scriptArtifact?.voiceover || '';

  const productName = liveCard?.name || productMatch?.selectedProduct?.title || 'Unknown product';
  const shortLink = liveCard?.shortLink || '';
  const canonicalUrl = liveCard?.canonicalUrl || '';
  const affiliateOwnerId = liveCard?.affiliateOwnerId || 'unknown';
  const ownerVerified = liveCard?.validationStatus === 'VERIFIED';

  const bgmTrackId = bgmArtifact?.trackId || renderManifest?.assets?.bgm?.trackId || '';
  const bgmTitle = bgmArtifact?.title || renderManifest?.assets?.bgm?.title || '';
  const bgmMixed = !!renderManifest?.assets?.bgm?.selected;

  const selectedPageName = publishManifest?.target?.pageName || 'Review Nhà bạn';
  const selectedPageIdMasked = publishManifest?.target?.pageId
    ? `****${String(publishManifest.target.pageId).slice(-4)}`
    : '****';
  const categoryRoute = publishManifest?.target?.postType || 'reel_or_video';

  // 3. Construct operator_review_pack.json
  const reviewPack = {
    reviewPackVersion: 'v1',
    state: 'READY_FOR_FINAL_OPERATOR_APPROVAL',
    run: {
      runId: runReport?.run?.runId || 'unknown',
      lane: runReport?.run?.lane || 'review_product',
      generatedAt: new Date().toISOString(),
    },
    preview: {
      previewArtifactPath: join(outputDir, 'preview_artifact.json'),
      videoPath,
      requiresOperatorReview: true,
      readyForPublish: false,
    },
    product: {
      source: 'shopee_affiliate_cdp',
      productName,
      shortLink,
      canonicalUrl,
      affiliateOwnerId,
      ownerVerified,
    },
    content: {
      scriptArtifactPath: join(outputDir, 'script_artifact.json'),
      hook3s,
      voiceover: voiceover.length > 120 ? voiceover.slice(0, 120) + '...' : voiceover,
      captionDraft,
      hashtags,
    },
    audio: {
      voiceArtifactPath: join(outputDir, 'voice_artifact.json'),
      bgmSelectionArtifactPath: join(outputDir, 'bgm_selection_artifact.json'),
      bgmTrackId,
      bgmTitle,
      bgmMixed,
    },
    facebook: {
      publishManifestPath: join(outputDir, 'publish_manifest.json'),
      selectedPageIdMasked,
      selectedPageName,
      categoryRoute,
    },
    validation: {
      approvalArtifactPath: join(outputDir, 'approval_artifact.json'),
      approvalStatus: approvalArtifact?.status || 'unknown',
      publishManifestPath: join(outputDir, 'publish_manifest.json'),
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      allowPublish: false,
      requiresFinalApproval: true,
      requiresExplicitUserApproval: true,
      tokensMasked: true,
    },
    operatorChecklist: [
      'Watch preview video fully.',
      'Check product and affiliate link are correct.',
      'Check caption and hashtags.',
      'Check selected Facebook page route.',
      'Only approve publish if everything is correct.',
    ],
    recommendedNextAction:
      'Operator must review the video and explicitly approve before any live publish step.',
  };

  // 4. Construct operator_review_pack.md
  const md = `# VFOS Operator Review Pack

> [!IMPORTANT]
> Do not publish automatically. Live publish requires explicit operator approval.

## Status
**READY_FOR_FINAL_OPERATOR_APPROVAL**

---

## Preview Video
- **Path**: \`${videoPath}\`
- **Required action**: Watch/test this video before publishing.

## Product
- **Product**: ${productName}
- **Shopee short link**: ${shortLink || 'N/A'}
- **Canonical URL**: ${canonicalUrl ? canonicalUrl.slice(0, 100) + '...' : 'N/A'}
- **Affiliate owner**: \`${affiliateOwnerId}\` ${ownerVerified ? '✅ VERIFIED' : '⚠️ UNVERIFIED'}

## Script
- **Hook (3s)**: ${hook3s || 'N/A'}

## Caption Draft
${captionDraft || 'N/A'}

## Hashtags
${hashtags.length > 0 ? hashtags.join(' ') : 'N/A'}

## BGM
- **Track**: ${bgmTitle || 'N/A'} (\`${bgmTrackId || 'none'}\`)
- **Mixed**: ${bgmMixed ? 'Yes' : 'No'}

## Facebook Route
- **Page**: ${selectedPageName}
- **Page ID (masked)**: ${selectedPageIdMasked}
- **Category**: ${categoryRoute}

## Publish Safety
| Check | Value |
|-------|-------|
| Facebook API called | ❌ false |
| Uploaded | ❌ false |
| Published | ❌ false |
| allowPublish | ❌ false |
| requiresFinalApproval | ✅ true |
| tokensMasked | ✅ true |

## Final Checklist
- [ ] I watched the preview video.
- [ ] Product matches the content.
- [ ] Affiliate link is correct.
- [ ] Caption is acceptable.
- [ ] Facebook page route is correct.
- [ ] I explicitly approve live publish.

---
*Generated at: ${reviewPack.run.generatedAt}*
`;

  // 5. Write both files
  const jsonPath = join(outputDir, 'operator_review_pack.json');
  const mdPath = join(outputDir, 'operator_review_pack.md');

  try {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(jsonPath, JSON.stringify(reviewPack, null, 2), 'utf8');
    writeFileSync(mdPath, md, 'utf8');

    console.log(`[ReviewPack] operator_review_pack.json written: ${jsonPath}`);
    console.log(`[ReviewPack] operator_review_pack.md   written: ${mdPath}`);
  } catch (err: any) {
    console.error(`ERROR: Failed to write review pack: ${err.message}`);
    process.exit(1);
  }

  // 6. CLI summary output
  console.log('\n======================================================');
  console.log('🧾 STATUS: READY_FOR_FINAL_OPERATOR_APPROVAL');
  console.log('======================================================');
  console.log(`Preview Video:    ${videoPath}`);
  console.log(`Review Pack:      ${mdPath}`);
  console.log(`Publish Manifest: ${join(outputDir, 'publish_manifest.json')}`);
  console.log('');
  console.log('Required Action:');
  console.log('Watch the preview video and approve manually before live publish.');
  console.log('');
  console.log('Safety:');
  console.log('Facebook API was NOT called.');
  console.log('Video was NOT uploaded.');
  console.log('Post was NOT published.');
  console.log('======================================================');

  process.exit(0);
}

main();
