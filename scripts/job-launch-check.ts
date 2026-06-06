/**
 * VFOS Pre-live Publish Rehearsal / Operator Go-No-Go Gate — Round 50.
 *
 * Safe read-only validation gate.
 * Validates job metadata, physical files, package artifacts, audio streams,
 * and outputs Go/No-Go status prior to manual live publish confirmation.
 *
 * Commands:
 *   pnpm job:launch-check --job <jobId> [--write-report]
 */

import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';
const JOBS_DIR = 'data/temp/jobs';
const ARCHIVE_ROOT = 'production/archive';

interface JobManifest {
  jobVersion: string;
  jobId: string;
  runId: string;
  productId: string;
  source: {
    productCardPath: string;
    sourceVideoPath: string;
  };
  artifacts: {
    scriptArtifactPath: string;
    voiceArtifactPath: string;
    voiceTimingArtifactPath: string;
    previewVideoPath: string;
    captionedPreviewPath: string;
    finalQaReportPath: string;
    productionPackageManifestPath: string;
    publishReadinessPath?: string;
  };
  state: string;
  review: {
    operatorDecision: string;
    approvedAt?: string;
    notes?: string;
  };
  safety: {
    facebookApiCalled: boolean;
    uploaded: boolean;
    published: boolean;
    requiresOperatorReview: boolean;
  };
}

// Helpers
function safeResolve(p: string | null | undefined): string | null {
  if (!p) return null;
  return resolve(p);
}

function readJsonFile(path: string | null): any | null {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Audio presence verification using ffprobe
function validateAudioStream(filePath: string): { success: boolean; error?: string; reason?: string; duration?: number } {
  if (!filePath || !existsSync(filePath)) {
    return { success: false, error: 'FILE_NOT_FOUND', reason: 'Video preview file not found.' };
  }

  const args = [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_type,codec_name,duration',
    '-show_format',
    '-of', 'json',
    filePath
  ];

  const result = spawnSync('ffprobe', args, { encoding: 'utf8', shell: true });
  if (result.status !== 0) {
    return {
      success: false,
      error: 'FFPROBE_FAILED',
      reason: `ffprobe exited with status ${result.status}. Stderr: ${result.stderr}`
    };
  }

  try {
    const data = JSON.parse(result.stdout || '{}');
    const streams = data.streams || [];
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    if (!audioStream) {
      return { success: false, error: 'NO_AUDIO_STREAM', reason: 'No audio stream found in the video.' };
    }

    const duration = parseFloat(audioStream.duration || data.format?.duration || '0');
    return { success: true, duration };
  } catch (err: any) {
    return { success: false, error: 'PARSE_FAILED', reason: `Failed to parse ffprobe output: ${err.message}` };
  }
}

function loadRegistry(): any {
  if (!existsSync(REGISTRY_PATH)) return { jobs: [] };
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8'));
  } catch {
    return { jobs: [] };
  }
}

function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'write-report': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const jobId = parsed.values.job as string | undefined;
  const writeReport = !!parsed.values['write-report'];

  if (!jobId) {
    console.error('🛑 ERROR: Missing required --job <jobId> argument.');
    process.exit(1);
  }

  const registry = loadRegistry();
  const jobExists = registry.jobs?.some((j: any) => j.jobId === jobId);
  if (!jobExists) {
    console.error(`🛑 UNKNOWN_JOB: Job directory or manifest missing for ${jobId}`);
    process.exit(2);
  }

  const manifestPath = join(JOBS_DIR, jobId, 'job_manifest.json');
  if (!existsSync(manifestPath)) {
    console.error(`🛑 UNKNOWN_JOB: Job directory or manifest missing for ${jobId}`);
    process.exit(2);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as JobManifest;

  // Let's execute pre-flight checklist
  const reasons: string[] = [];
  const checklist: { name: string; status: 'PASS' | 'FAIL'; detail: string }[] = [];

  // Check 1: State is PACKAGED
  const statePass = manifest.state === 'PACKAGED';
  checklist.push({
    name: 'Job is PACKAGED',
    status: statePass ? 'PASS' : 'FAIL',
    detail: `Current state: ${manifest.state}`,
  });
  if (!statePass) reasons.push('JOB_NOT_PACKAGED');

  // Check 2: Operator approved
  const approvedPass = manifest.review?.operatorDecision === 'APPROVED';
  checklist.push({
    name: 'Operator approved',
    status: approvedPass ? 'PASS' : 'FAIL',
    detail: `Decision: ${manifest.review?.operatorDecision ?? 'PENDING'}`,
  });
  if (!approvedPass) reasons.push('JOB_NOT_APPROVED');

  // Check 3: Final QA Pass
  const qaReportPath = safeResolve(manifest.artifacts?.finalQaReportPath);
  const qaReportExists = !!qaReportPath && existsSync(qaReportPath);
  const qaReportData = qaReportExists ? readJsonFile(qaReportPath) : null;
  const qaReportStatus = qaReportData?.qaStatus ?? qaReportData?.status ?? 'MISSING';
  const qaPass = qaReportStatus === 'PASS';
  checklist.push({
    name: 'Final QA PASS',
    status: qaPass ? 'PASS' : 'FAIL',
    detail: `Status: ${qaReportStatus}`,
  });
  if (!qaPass) reasons.push('FINAL_QA_NOT_PASSING');

  // Check 4: Captioned Preview Exists
  const captionedPath = safeResolve(manifest.artifacts?.captionedPreviewPath);
  const captionedExists = !!captionedPath && existsSync(captionedPath);
  checklist.push({
    name: 'Captioned preview exists',
    status: captionedExists ? 'PASS' : 'FAIL',
    detail: captionedExists ? 'Preview found.' : 'Video file missing.',
  });
  if (!captionedExists) reasons.push('VIDEO_MISSING');

  // Check 5: Audio Stream Presence
  let audioPass = false;
  let audioDetail = 'N/A';
  if (captionedExists && captionedPath) {
    const audioRes = validateAudioStream(captionedPath);
    audioPass = audioRes.success;
    audioDetail = audioRes.success ? `Audio duration: ${audioRes.duration?.toFixed(2)}s` : `Probe error: ${audioRes.reason}`;
  } else {
    audioDetail = 'Video preview is missing.';
  }
  checklist.push({
    name: 'Final video has audio',
    status: audioPass ? 'PASS' : 'FAIL',
    detail: audioDetail,
  });
  if (!audioPass) reasons.push('FINAL_VIDEO_AUDIO_MISSING');

  // Check 6: Affiliate Link
  const productCardPath = safeResolve(manifest.source?.productCardPath);
  const productCardData = productCardPath ? readJsonFile(productCardPath) : null;
  const affiliateLink = productCardData?.shortLink ?? null;
  const affiliatePass = !!affiliateLink;
  checklist.push({
    name: 'Affiliate link present',
    status: affiliatePass ? 'PASS' : 'FAIL',
    detail: affiliateLink ? `Link: ${affiliateLink}` : 'Missing affiliate shortLink.',
  });
  if (!affiliatePass) reasons.push('AFFILIATE_LINK_MISSING');

  // Check 7: Script caption & hashtags
  const scriptPath = safeResolve(manifest.artifacts?.scriptArtifactPath);
  const scriptData = scriptPath ? readJsonFile(scriptPath) : null;
  const caption = scriptData?.captionDraft ?? null;
  const hashtags = scriptData?.hashtags ?? [];
  const captionPass = !!caption;
  const hashtagsPass = Array.isArray(hashtags) && hashtags.length > 0;

  checklist.push({
    name: 'Caption present',
    status: captionPass ? 'PASS' : 'FAIL',
    detail: caption ? `Draft: "${caption}"` : 'Missing caption draft.',
  });
  checklist.push({
    name: 'Hashtags present',
    status: hashtagsPass ? 'PASS' : 'FAIL',
    detail: hashtagsPass ? `Tags: ${hashtags.join(', ')}` : 'Missing script hashtags.',
  });

  // Check 8: Package manifest
  const packagePath = safeResolve(manifest.artifacts?.productionPackageManifestPath);
  const packageExists = !!packagePath && existsSync(packagePath);
  checklist.push({
    name: 'Package manifest present',
    status: packageExists ? 'PASS' : 'FAIL',
    detail: packageExists ? 'package_manifest.json found.' : 'Package files missing.',
  });
  if (!packageExists) reasons.push('PACKAGE_MISSING');

  // Check 9: Safety locks check (must not be uploaded/published)
  const isAlreadyPublished = manifest.safety?.uploaded || manifest.safety?.published || manifest.safety?.facebookApiCalled;
  const safetyPass = !isAlreadyPublished;
  checklist.push({
    name: 'Safety locks are clean',
    status: safetyPass ? 'PASS' : 'FAIL',
    detail: safetyPass ? 'Clean. Ready for initial publish.' : 'Locks show already uploaded or published.',
  });
  if (isAlreadyPublished) reasons.push('ALREADY_UPLOADED_OR_PUBLISHED');
  
  // Check 10: Fallback source check
  const sourceMode = (manifest.source as any)?.sourceMode ?? null;
  const productionAllowed = (manifest.source as any)?.productionAllowed ?? null;
  const isFallback = sourceMode === 'fallback' || productionAllowed === false;
  checklist.push({
    name: 'Is real source (not fallback)',
    status: !isFallback ? 'PASS' : 'FAIL',
    detail: !isFallback ? 'Real source approved.' : 'Current source is fallback/demo video.',
  });
  if (isFallback) reasons.push('SOURCE_IS_FALLBACK');

  // Final Decision inference
  const allPass = checklist.every((c) => c.status === 'PASS');
  const decision = allPass ? 'READY_FOR_OPERATOR_GO_DECISION' : 'NO_GO';

  console.log('======================================================');
  console.log('🚦 VFOS PRE-LIVE GO/NO-GO CHECK');
  console.log('======================================================');
  console.log(`Job:               ${jobId}`);
  console.log(`Product:           ${productCardData?.name ?? '(unknown)'}`);
  console.log(`State:             ${manifest.state}`);
  console.log(`Operator Decision: ${manifest.review?.operatorDecision}`);
  console.log(`Final QA:          ${qaReportStatus}`);
  console.log(`Package:           ${packageExists ? 'READY' : 'PENDING'}`);
  console.log(`Published:         ${manifest.safety?.published ? 'true' : 'false'}`);
  console.log(`Uploaded:          ${manifest.safety?.uploaded ? 'true' : 'false'}`);
  console.log('------------------------------------------------------');
  console.log('Checks:');
  for (const check of checklist) {
    const icon = check.status === 'PASS' ? '🟢 [PASS]' : '🔴 [FAIL]';
    console.log(`${icon.padEnd(9)} ${check.name.padEnd(28)} : ${check.detail}`);
  }
  console.log('------------------------------------------------------');
  console.log('Decision:');
  if (decision === 'READY_FOR_OPERATOR_GO_DECISION') {
    console.log('\x1b[32mREADY_FOR_OPERATOR_GO_DECISION\x1b[0m');
    console.log('\nRecommended safe command:');
    console.log(`\x1b[36mpnpm job:publish-facebook --job ${jobId} --dry-run\x1b[0m`);
    console.log('\nExplicit live command, run only after Operator final confirmation:');
    console.log(`\x1b[31mpnpm job:publish-facebook --job ${jobId} --confirm-live-publish\x1b[0m`);
  } else {
    console.log('\x1b[31mNO_GO\x1b[0m');
    console.log('Blocking Reasons:');
    for (const r of reasons) {
      console.log(`  - ${r}`);
    }
    console.log('\nRecommended troubleshooting command:');
    if (reasons.includes('JOB_NOT_PACKAGED')) {
      console.log(`  pnpm job:package --job ${jobId}`);
    } else if (reasons.includes('JOB_NOT_APPROVED')) {
      console.log(`  pnpm job:approve --job ${jobId} --notes "Approved."`);
    } else if (reasons.includes('FINAL_QA_NOT_PASSING')) {
      console.log(`  pnpm job:qa --job ${jobId} --confirm-openai`);
    } else {
      console.log(`  pnpm job:dashboard --job ${jobId}`);
    }
  }
  console.log('======================================================\n');

  // If write-report flag is requested, write artifacts
  if (writeReport) {
    const reportDir = join(JOBS_DIR, jobId);
    mkdirSync(reportDir, { recursive: true });

    // Write JSON Report
    const reportJson = {
      reportVersion: 'v1',
      jobId,
      decision,
      reasons,
      checklist,
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(join(reportDir, 'launch_check_report.json'), JSON.stringify(reportJson, null, 2), 'utf8');

    // Write Markdown Report
    const reportMd = `# VFOS Pre-live Launch Check Report — ${jobId}

- **Decision**: \`${decision}\`
- **Product Name**: ${productCardData?.name ?? '(unknown)'}
- **Timestamp**: ${new Date().toISOString()}

## Checklist Results
${checklist.map((c) => `- **[${c.status}]** ${c.name} : ${c.detail}`).join('\n')}

${reasons.length > 0 ? `## Blocking Reasons\n${reasons.map((r) => `- \`${r}\``).join('\n')}` : ''}
`;
    writeFileSync(join(reportDir, 'launch_check_report.md'), reportMd, 'utf8');
    console.log(`[REPORT WRITTEN] Saved launch check reports to data/temp/jobs/${jobId}/`);
  }

  // Handle process exits gracefully
  if (decision === 'NO_GO') {
    process.exit(10);
  } else {
    process.exit(0);
  }
}

main();
