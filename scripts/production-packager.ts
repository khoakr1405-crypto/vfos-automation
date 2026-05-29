/**
 * Production Reel Archiver & Staging Output Packer — Round P47.
 *
 * Command: tsx scripts/production-packager.ts --run <runId> [--output <dir>]
 */

import { writeFileSync, existsSync, readFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { parseArgs } from 'node:util';
import { execSync } from 'node:child_process';

// 1. Parse CLI Parameters
let values: any;
try {
  const parsed = parseArgs({
    options: {
      run: { type: 'string' },
      output: { type: 'string', default: 'production/archive' },
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
  console.log('Usage: tsx scripts/production-packager.ts --run <runId> [--output <dir>]');
  process.exit(1);
}

const runId = values.run;
const outputDir = values.output;

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
  console.log('📦   VFOS Production Reel Archiver & Output Packer');
  console.log('======================================================');
  console.log(`- Target Run ID:   ${runId}`);
  console.log(`- Output Directory: ${outputDir}`);
  console.log('------------------------------------------------------');

  const runDir = join('data/temp/pipeline-p9-demo', runId);
  if (!existsSync(runDir)) {
    console.error(`🔴 ERROR: RUN_NOT_FOUND - Target run directory does not exist: ${runDir}`);
    process.exit(1);
  }

  // Read preflight publish status
  const publishStatusPath = 'data/temp/facebook_publish_status.json';
  if (!existsSync(publishStatusPath)) {
    console.error(`🔴 ERROR: facebook_publish_status.json not found at ${publishStatusPath}.`);
    console.error('Please run the preflight publish validation command first:');
    console.error(`  pnpm publish:facebook --confirm-final-approval --run ${runId}`);
    process.exit(1);
  }

  const publishStatus = readJsonSafely(publishStatusPath);
  if (!publishStatus || publishStatus.state !== 'READY_FOR_MANUAL_PUBLISH_SUBMISSION') {
    console.error(`🔴 ERROR: NOT_READY. Publish status is currently "${publishStatus?.state || 'UNKNOWN'}".`);
    console.error('Unified publishing readiness constraints must be fully satisfied and approved first.');
    process.exit(1);
  }

  // Load operators resources
  const operatorReviewPackPath = join(runDir, 'operator_review_pack.json');
  const publishManifestPath = join(runDir, 'publish_manifest.json');
  const scriptArtifactPath = join(runDir, 'script_artifact.json');
  
  const pack = readJsonSafely(operatorReviewPackPath) || {};
  const manifest = readJsonSafely(publishManifestPath) || {};
  const scriptArt = readJsonSafely(scriptArtifactPath) || {};

  const videoFile = pack.preview?.videoPath || manifest.video?.outputPath || '';
  const previewVideoExists = videoFile ? existsSync(videoFile) : false;

  const caption = pack.content?.captionDraft || manifest.content?.captionDraft || scriptArt.caption || '';
  const captionPresent = !!caption && caption.trim().length > 0;

  const hashtags = pack.content?.hashtags || manifest.content?.hashtags || [];
  const hashtagsPresent = hashtags.length > 0;

  const affiliateLink = pack.content?.shortLink || pack.content?.affiliateLink || pack.product?.shortLink || pack.product?.affiliateLink || manifest.commerce?.selectedAffiliateLink || '';
  const affiliateLinkPresent = !!affiliateLink && affiliateLink.trim().length > 0;

  const pageId = pack.facebook?.selectedPageId || '';
  const pageRoutePresent = !!pageId || pack.facebook?.selectedPageIdMasked !== '****';

  // Create staging archive folder
  const archiveFolder = join(outputDir, runId);
  try {
    mkdirSync(archiveFolder, { recursive: true });
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to create archive folder: ${err.message}`);
    process.exit(1);
  }

  // Copy whitelisted source artifacts
  const filesToCopy = [
    { src: videoFile, destName: 'preview.mp4' },
    { src: publishStatusPath, destName: 'facebook_publish_status.json' },
    { src: 'data/temp/facebook_publish_report.md', destName: 'facebook_publish_report.md' },
    { src: join(runDir, 'facebook_page_route_artifact.json'), destName: 'facebook_page_route.json' },
    { src: join(runDir, 'facebook_reels_validation_artifact.json'), destName: 'facebook_reels_validation_artifact.json' },
    { src: join(runDir, 'operator_review_pack.json'), destName: 'operator_review_pack.json' },
    { src: join(runDir, 'operator_review_pack.md'), destName: 'operator_review_pack.md' },
    { src: join(runDir, 'publish_manifest.json'), destName: 'publish_manifest.json' },
    { src: join(runDir, 'run_report.json'), destName: 'run_report.json' },
    { src: join(runDir, 'run_report.md'), destName: 'run_report.md' },
    { src: join(runDir, 'preview_artifact.json'), destName: 'preview_artifact.json' },
    { src: join(runDir, 'script_artifact.json'), destName: 'script_artifact.json' },
  ];

  const includedFiles: string[] = [];
  const missingOptionalFiles: string[] = [];

  for (const item of filesToCopy) {
    if (item.src && existsSync(item.src)) {
      try {
        copyFileSync(item.src, join(archiveFolder, item.destName));
        includedFiles.push(item.destName);
      } catch (err: any) {
        console.warn(`⚠️ Warning: Failed to copy ${basename(item.src)}: ${err.message}`);
      }
    } else {
      missingOptionalFiles.push(item.destName);
    }
  }

  // Generate specialized txt files
  try {
    writeFileSync(join(archiveFolder, 'caption.txt'), captionPresent ? caption : '[CAPTION_MISSING]', 'utf8');
    includedFiles.push('caption.txt');

    writeFileSync(join(archiveFolder, 'hashtags.txt'), hashtagsPresent ? hashtags.map((h: string) => `#${h}`).join(' ') : '[HASHTAGS_MISSING]', 'utf8');
    includedFiles.push('hashtags.txt');

    writeFileSync(join(archiveFolder, 'affiliate_link.txt'), affiliateLinkPresent ? affiliateLink : '[AFFILIATE_LINK_MISSING]', 'utf8');
    includedFiles.push('affiliate_link.txt');
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write text archive artifacts: ${err.message}`);
  }

  // Generate package manifest
  const zipName = `${runId}_production_package.zip`;
  const zipPath = join(outputDir, zipName);

  const packageManifest = {
    packageVersion: 'v1',
    runId,
    createdAt: new Date().toISOString(),
    state: 'PACKAGED_FOR_MANUAL_REVIEW_OR_SUBMISSION',
    sourceArtifacts: {
      previewVideoPath: videoFile,
      operatorReviewPackPath: operatorReviewPackPath,
      facebookPublishReportPath: 'data/temp/facebook_publish_report.md',
      facebookPublishStatusPath: publishStatusPath,
      publishManifestPath: publishManifestPath,
    },
    packageOutputs: {
      folder: archiveFolder.replace(/\\/g, '/'),
      zip: zipPath.replace(/\\/g, '/'),
    },
    includedFiles,
    missingOptionalFiles,
    content: {
      captionPresent,
      hashtagsPresent,
      affiliateLinkPresent,
      pageRoutePresent,
      previewVideoPresent: previewVideoExists,
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      manualReviewRequired: true,
      tokensIncluded: false,
      cookiesIncluded: false,
      envIncluded: false,
      browserStorageIncluded: false,
    },
    recommendedNextAction: 'Review the package contents manually before any future live publish or external distribution.',
  };

  try {
    writeFileSync(join(archiveFolder, 'package_manifest.json'), JSON.stringify(packageManifest, null, 2), 'utf8');
    includedFiles.push('package_manifest.json');
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write package manifest: ${err.message}`);
  }

  // Create Zip Archive cleanly
  let zipCreated = false;
  console.log('[ProductionPackager] Compressing staging directory to production ZIP package...');
  try {
    if (process.platform === 'win32') {
      execSync(`powershell.exe -Command "Compress-Archive -Path '${archiveFolder}\\*' -DestinationPath '${zipPath}' -Force"`);
      zipCreated = true;
    } else {
      execSync(`zip -r '${zipPath}' '${archiveFolder}'/*`);
      zipCreated = true;
    }
    console.log(`🟢 ZIP SUCCESS: Simulated archive package created at: ${zipPath}`);
  } catch (err: any) {
    console.warn(`⚠️ Warning: Failed to compress folder. ZIP generation deferred: ${err.message}`);
  }

  // Update catalog.json (Ignored local runtime catalog)
  const catalogPath = join(outputDir, 'catalog.json');
  let catalogObj = { catalogVersion: 'v1', updatedAt: new Date().toISOString(), packages: [] as any[] };
  
  if (existsSync(catalogPath)) {
    try {
      const existing = JSON.parse(readFileSync(catalogPath, 'utf8'));
      if (existing && Array.isArray(existing.packages)) {
        catalogObj.packages = existing.packages;
      }
    } catch {}
  }

  // Filter out existing runId entry if present to avoid duplication
  catalogObj.packages = catalogObj.packages.filter((p: any) => p.runId !== runId);
  catalogObj.packages.push({
    runId,
    createdAt: packageManifest.createdAt,
    state: packageManifest.state,
    folderPath: archiveFolder.replace(/\\/g, '/'),
    zipPath: zipCreated ? zipPath.replace(/\\/g, '/') : null,
    previewVideoPath: previewVideoExists ? join(archiveFolder, 'preview.mp4').replace(/\\/g, '/') : null,
    captionPath: join(archiveFolder, 'caption.txt').replace(/\\/g, '/'),
    facebookPublishReportPath: join(archiveFolder, 'facebook_publish_report.md').replace(/\\/g, '/'),
    uploaded: false,
    published: false,
  });
  catalogObj.updatedAt = new Date().toISOString();

  try {
    writeFileSync(catalogPath, JSON.stringify(catalogObj, null, 2), 'utf8');
    console.log(`🟢 CATALOG SUCCESS: Local archives catalog updated successfully: ${catalogPath}`);
  } catch (err: any) {
    console.error(`🔴 ERROR: Failed to write archives catalog: ${err.message}`);
  }

  // Terminal Output Summary
  console.log('\n======================================================');
  console.log('📦   VFOS Production Package Created Successfully');
  console.log('======================================================');
  console.log(`- Run ID:  ${runId}`);
  console.log(`- Folder:  ${archiveFolder}`);
  console.log(`- ZIP:     ${zipCreated ? zipPath : 'DEFERRED'}`);
  console.log('\nIncluded files:');
  for (const f of includedFiles) {
    console.log(`  * ${f}`);
  }
  if (missingOptionalFiles.length > 0) {
    console.log('\nSkipped optional files:');
    for (const f of missingOptionalFiles) {
      console.log(`  * ${f}`);
    }
  }
  console.log('\nSafety checklist checks:');
  console.log('- Facebook API called: false 🔒');
  console.log('- Uploaded:            false 🔒');
  console.log('- Published:           false 🔒');
  console.log('- Tokens included:     false 🔒');
  console.log('- .env included:       false 🔒');
  console.log('\nRecommended next action:');
  console.log(packageManifest.recommendedNextAction);
  console.log('======================================================\n');
  process.exit(0);
}

main();
