// `package` command (Round 46) — extracted from scripts/vfos-job-manager.ts,
// God-file anatomy Nhịp cuối. Byte-identical move; logic unchanged.

import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { exists, isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import { hasAudioStream } from '../core/media-probe.js';
import { JOBS_ROOT } from '../core/paths.js';
import { extractProductName } from '../core/product-card.js';
import {
  entryFromManifest,
  loadRegistry,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';
import { readFinalQaStatus } from '../core/validation.js';

const PACKAGE_ROOT = 'production/archive'; // gitignored runtime output (see .gitignore)

export function cmdPackage(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  // Resolve the artifacts we will validate and (later) copy.
  const captionedRel = manifest.artifacts.captionedPreviewPath;
  const captionedAbs = captionedRel ? resolve(captionedRel) : null;
  const qaRel = manifest.artifacts.finalQaReportPath;
  const qaAbs = qaRel ? resolve(qaRel) : null;
  const scriptRel = manifest.artifacts.scriptArtifactPath;
  const scriptAbs = scriptRel ? resolve(scriptRel) : null;
  const voiceRel = manifest.artifacts.voiceArtifactPath;
  const voiceAbs = voiceRel ? resolve(voiceRel) : null;
  const visionRel = manifest.artifacts.videoVisualAnalysisPath ?? null;
  const visionAbs = visionRel ? resolve(visionRel) : null;
  const productCardAbs = manifest.source.productCardPath
    ? resolve(manifest.source.productCardPath)
    : null;

  const qaStatus = readFinalQaStatus(manifest);
  const audioPresent = captionedAbs ? hasAudioStream(captionedAbs) : false;

  // Gate evaluation — collected so --dry-run can print every check.
  const stateApproved = manifest.state === 'APPROVED';
  const decisionApproved = manifest.review.operatorDecision === 'APPROVED';
  const captionedPresent = Boolean(captionedAbs && existsSync(captionedAbs));
  const qaPresent = qaStatus !== 'MISSING';
  const qaPassed = qaStatus === 'PASS';
  const scriptPresent = Boolean(scriptAbs && existsSync(scriptAbs));
  const productCardPresent = Boolean(productCardAbs && existsSync(productCardAbs));
  const voicePresent = Boolean(voiceAbs && existsSync(voiceAbs));
  const notPublished = !manifest.safety.uploaded && !manifest.safety.published;

  const packageDir = resolve(PACKAGE_ROOT, jobId);
  const packageDirRel = `${PACKAGE_ROOT}/${jobId}`;
  const zipRel = `${PACKAGE_ROOT}/${jobId}/${jobId}_production_package.zip`;

  console.log('======================================================');
  console.log(`📦  VFOS Job Manager — package  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`State:             ${manifest.state}`);
  console.log(`Operator decision: ${manifest.review.operatorDecision}`);
  console.log('---- gates --------------------------------------------');
  console.log(`Job exists:        ✅`);
  console.log(`State APPROVED:     ${stateApproved ? '✅' : '❌'}`);
  console.log(`Decision APPROVED: ${decisionApproved ? '✅' : '❌'}`);
  console.log(`Captioned preview: ${captionedPresent ? '✅' : '❌'}  ${captionedRel ?? '(none)'}`);
  console.log(`Final QA present:  ${qaPresent ? '✅' : '❌'}`);
  console.log(`Final QA PASS:     ${qaPassed ? '✅' : '❌'}  (${qaStatus})`);
  console.log(`Script artifact:   ${scriptPresent ? '✅' : '❌'}`);
  console.log(`Product card:      ${productCardPresent ? '✅' : '❌'}`);
  console.log(`Voice artifact:    ${voicePresent ? '✅' : '❌'}`);
  console.log(`Video has audio:   ${audioPresent ? '✅' : '❌'}`);
  console.log(`Not published:     ${notPublished ? '✅' : '❌'}`);
  console.log('---- plan ---------------------------------------------');
  console.log(`Output folder:     ${packageDirRel}/`);
  console.log(`Zip:               ${zipRel}`);
  console.log(`Will call APIs:    false`);
  console.log(`Will publish:      false`);
  console.log(`Will mutate state: ${dryRun ? 'no (dry-run)' : 'yes → PACKAGED'}`);
  console.log('------------------------------------------------------');

  // First-failure gating with explicit error codes (section C).
  if (!stateApproved || !decisionApproved) {
    console.error(
      '🛑 JOB_NOT_APPROVED: job must be APPROVED with operatorDecision=APPROVED before packaging.',
    );
    return 3;
  }
  if (!captionedPresent) {
    console.error('🛑 CAPTIONED_PREVIEW_MISSING');
    return 4;
  }
  if (!qaPresent) {
    console.error('🛑 FINAL_QA_MISSING');
    console.error(`  Run: pnpm job:qa --job ${jobId} --confirm-openai`);
    return 5;
  }
  if (!qaPassed) {
    console.error('🛑 FINAL_QA_NOT_PASSING');
    return 6;
  }
  if (!productCardPresent) {
    console.error('🛑 PRODUCT_CARD_MISSING');
    return 7;
  }
  if (!scriptPresent) {
    console.error('🛑 SCRIPT_ARTIFACT_MISSING');
    return 8;
  }
  if (!voicePresent) {
    console.error('🛑 VOICE_ARTIFACT_MISSING');
    return 9;
  }
  if (!audioPresent) {
    console.error('🛑 FINAL_VIDEO_AUDIO_MISSING');
    return 10;
  }
  if (!notPublished) {
    console.error('🛑 JOB_ALREADY_PUBLISHED_OR_UPLOADED');
    return 11;
  }

  if (dryRun) {
    console.log('Dry-run: no files copied, no zip, no manifest mutation. (No publish, no API.)');
    return 0;
  }

  // ---- build package (all gates green) ----
  // Read content sources for caption/hashtags/affiliate link.
  const productCard = JSON.parse(readFileSync(productCardAbs as string, 'utf8')) as Record<
    string,
    unknown
  >;
  const scriptArtifact = JSON.parse(readFileSync(scriptAbs as string, 'utf8')) as Record<
    string,
    unknown
  >;
  const productName = extractProductName(productCard);

  const captionText =
    typeof scriptArtifact.captionDraft === 'string' ? scriptArtifact.captionDraft.trim() : '';
  const hashtags = Array.isArray(scriptArtifact.hashtags)
    ? (scriptArtifact.hashtags as unknown[]).filter((h) => typeof h === 'string')
    : [];
  const affiliateLink =
    (typeof productCard.shortLink === 'string' && productCard.shortLink.trim()) ||
    (typeof productCard.canonicalUrl === 'string' && productCard.canonicalUrl.trim()) ||
    '';

  mkdirSync(packageDir, { recursive: true });

  // Copy artifacts (only the secret-free job artifacts; never .env/token/cookie).
  const copyPairs: Array<[string | null, string]> = [
    [captionedAbs, basename(captionedAbs as string)],
    [productCardAbs as string, 'product_card.json'],
    [scriptAbs, 'script_artifact.json'],
    [voiceAbs, 'voice_artifact.json'],
    [visionAbs, 'video_visual_analysis.json'],
    [qaAbs, 'final_video_qa_report.json'],
    [resolve(JOBS_ROOT, jobId, 'job_manifest.json'), 'job_manifest.json'],
  ];
  const copied: string[] = [];
  for (const [src, destName] of copyPairs) {
    if (src && existsSync(src)) {
      copyFileSync(src, join(packageDir, destName));
      copied.push(destName);
    }
  }

  // Generate caption.txt + hashtags.txt
  writeFileSync(join(packageDir, 'caption.txt'), `${captionText}\n`, 'utf8');
  writeFileSync(join(packageDir, 'hashtags.txt'), `${hashtags.join(' ')}\n`, 'utf8');

  const now = isoNow();
  const captionPresent = captionText.length > 0;
  const hashtagsPresent = hashtags.length > 0;
  const affiliateLinkPresent = affiliateLink.length > 0;

  // publish_readiness_report.md
  const report = `# VFOS Job Publish Readiness Report

Job ID:            ${jobId}
Product:           ${productName ?? '(unknown)'}
State:             PACKAGED
Operator Decision: ${manifest.review.operatorDecision}
Final QA:          ${qaStatus}
Video:             ${basename(captionedAbs as string)} (audio: ${audioPresent ? 'present' : 'MISSING'})
Caption:           ${captionPresent ? 'present (caption.txt)' : 'MISSING'}
Hashtags:          ${hashtagsPresent ? hashtags.join(' ') : 'MISSING'}
Affiliate Link:    ${affiliateLinkPresent ? affiliateLink : 'MISSING'}

Safety:
- Facebook API called: false
- Uploaded: false
- Published: false
- Manual submission required: true

> ⚠️ This is NOT a live publish. No API upload was performed.
> Manual operator review/submission is required.

Required Operator Action:
- Watch the final video again if needed.
- Copy caption/hashtags from caption.txt / hashtags.txt.
- Manually submit, or run a future publish command ONLY after explicit approval.

Generated at: ${now}
`;
  writeFileSync(join(packageDir, 'publish_readiness_report.md'), report, 'utf8');

  // package_manifest.json
  const publishReadinessRel = `${packageDirRel}/publish_readiness_report.md`;
  const packageManifestRel = `${packageDirRel}/package_manifest.json`;
  const packageManifest = {
    packageVersion: 'v1',
    jobId,
    createdAt: now,
    state: 'PACKAGED_FOR_MANUAL_REVIEW_OR_SUBMISSION',
    sourceArtifacts: {
      jobManifestPath: `${JOBS_ROOT}/${jobId}/job_manifest.json`,
      productCardPath: manifest.source.productCardPath,
      scriptArtifactPath: scriptRel,
      captionedPreviewPath: captionedRel,
      finalQaReportPath: qaRel,
    },
    packageOutputs: {
      folder: packageDirRel,
      zip: zipRel,
    },
    content: {
      captionPresent,
      hashtagsPresent,
      affiliateLinkPresent,
      videoPresent: true,
      audioPresent,
      qaPassed: true,
      operatorApproved: true,
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      manualSubmissionRequired: true,
      tokensIncluded: false,
      cookiesIncluded: false,
      envIncluded: false,
    },
  };
  writeFileSync(
    join(packageDir, 'package_manifest.json'),
    `${JSON.stringify(packageManifest, null, 2)}\n`,
    'utf8',
  );

  // Optional zip (best-effort, *.zip is gitignored). Never fatal.
  let zipCreated = false;
  const zipAbs = join(packageDir, `${jobId}_production_package.zip`);
  if (process.platform === 'win32') {
    const z = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Compress-Archive -Path '${packageDir}\\*' -DestinationPath '${zipAbs}' -Force`,
      ],
      { encoding: 'utf8' },
    );
    zipCreated = z.status === 0 && existsSync(zipAbs);
  }

  // Mutate manifest + registry: APPROVED → PACKAGED. Never PUBLISHED.
  manifest.state = 'PACKAGED';
  manifest.artifacts.publishReadinessPath = publishReadinessRel;
  manifest.artifacts.productionPackageManifestPath = packageManifestRel;
  manifest.safety.facebookApiCalled = false;
  manifest.safety.uploaded = false;
  manifest.safety.published = false;
  saveManifest(manifest);

  const reg = loadRegistry();
  upsertRegistryEntry(reg, entryFromManifest(manifest, productName));
  saveRegistry(reg);

  console.log(`✅ Packaged ${copied.length + 3} files → ${packageDirRel}/`);
  console.log(`   Report:   ${publishReadinessRel}`);
  console.log(`   Manifest: ${packageManifestRel}`);
  console.log(`   Zip:      ${zipCreated ? zipRel : '(skipped / not created)'}`);
  console.log('   State → PACKAGED. No publish, no upload, no API. Manual submission required.');
  return 0;
}
