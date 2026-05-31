/**
 * VFOS Job Lifecycle Dashboard & Operator Command Center — Round 49.
 *
 * Safe read-only lifecycle validator.
 * Reads registry and manifests, performs physical artifact existence and schema
 * checks, and outputs current progress status along with recommended next steps.
 *
 * Commands:
 *   pnpm job:dashboard
 *   pnpm job:dashboard --job <jobId> [--json] [--markdown]
 */

import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { parseArgs } from 'node:util';

const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';
const JOBS_DIR = 'data/temp/jobs';

interface JobRegistryEntry {
  jobId: string;
  runId: string;
  state: string;
  productName: string;
  productCardPath: string;
  sourceVideoPath: string;
  captionedPreviewPath: string;
  operatorDecision: string;
  createdAt: string;
  updatedAt: string;
}

interface JobRegistry {
  registryVersion: string;
  updatedAt: string;
  jobs: JobRegistryEntry[];
}

// Check if a path is absolute, if not resolve it relative to current working directory
function safeResolve(p: string | null | undefined): string | null {
  if (!p) return null;
  return resolve(p);
}

function loadRegistry(): JobRegistry {
  if (!existsSync(REGISTRY_PATH)) {
    return { registryVersion: 'v1', updatedAt: '', jobs: [] };
  }
  try {
    return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')) as JobRegistry;
  } catch {
    return { registryVersion: 'v1', updatedAt: '', jobs: [] };
  }
}

function loadManifest(jobId: string): any | null {
  const manifestPath = join(JOBS_DIR, jobId, 'job_manifest.json');
  if (!existsSync(manifestPath)) return null;
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

// Helper: safe JSON parsing
function readJsonFile(path: string | null): any | null {
  if (!path || !existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// Deduce next recommended command based on the complete lifecycle rules
function inferRecommendedCommand(jobId: string, audit: any): { command: string; reason: string; expected: string; warning?: string } {
  // 1. CREATED / WAITING_FOR_SOURCE_VIDEO
  if (!audit.sourceVideo.exists) {
    return {
      command: `pnpm job:attach-source --job ${jobId} --file "data/temp/source_video.mp4"`,
      reason: 'No source video is currently attached to this job.',
      expected: 'Links the candidate source video path in the job manifest.',
    };
  }

  // 2. READY_TO_RENDER but no vision
  if (!audit.vision.exists) {
    return {
      command: `pnpm job:vision --job ${jobId} --confirm-openai`,
      reason: 'Video source is attached, but OpenAI vision analysis has not been performed.',
      expected: 'Generates detailed scene timeline description and visual metrics.',
    };
  }

  // 3. Vision present but script missing or not grounded
  if (!audit.script.exists || !audit.script.visionGrounded) {
    return {
      command: `pnpm job:script --job ${jobId} --confirm-openai`,
      reason: 'OpenAI vision analysis is ready, but the generation script is missing or not grounded.',
      expected: 'Drafts structured audio-visual narrative layout utilizing vision inputs.',
    };
  }

  // 4. Script fresh but voice/timing missing
  if (!audit.voice.exists || !audit.voiceTiming.exists) {
    return {
      command: `pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`,
      reason: 'Generation script is complete, but ElevenLabs voiceover stream and timestamp maps are missing.',
      expected: 'Downloads high-quality speech segment and extracts word timings.',
    };
  }

  // 5. Voice/timing ready but preview missing
  if (!audit.previewVideo.exists) {
    return {
      command: `pnpm chay:review --job ${jobId}`,
      reason: 'Voice narration and speech timing artifacts are ready. Render the preview.',
      expected: 'Assembles timing sequences and renders offline draft review video.',
    };
  }

  // 6. Preview ready but Final QA report missing
  if (!audit.finalQa.exists) {
    return {
      command: `pnpm job:qa --job ${jobId} --confirm-openai`,
      reason: 'Rendered video preview exists, but final STT alignment QA verification is pending.',
      expected: 'Transcribes preview audio and audits structural alignment limits.',
    };
  }

  // 7. Final QA FAIL
  if (audit.finalQa.exists && audit.finalQa.status !== 'PASS') {
    return {
      command: 'N/A (BLOCKED)',
      reason: 'CRITICAL: Final video alignment QA verification has FAILED. Review issues.',
      expected: 'Please check the final QA report artifact and resolve violations.',
      warning: `🛑 QA ALIGNMENT FAILURE: Similarity score is low or mismatch detected in final_video_qa_report.json.`,
    };
  }

  // 8. Final QA PASS and operatorDecision PENDING
  if (audit.review.operatorDecision === 'PENDING') {
    return {
      command: `pnpm job:approve --job ${jobId} --notes "Operator reviewed and approved."`,
      reason: 'QA verification has passed, but the job is waiting for Operator approval.',
      expected: 'Signs job review block and transitions state to APPROVED.',
    };
  }

  // 9. REJECTED by operator
  if (audit.review.operatorDecision === 'REJECTED') {
    return {
      command: 'N/A (REJECTED)',
      reason: `Job has been explicitly rejected by Operator (Notes: "${audit.review.notes ?? 'None'}").`,
      expected: 'Address operator review concerns and re-generate review pack.',
    };
  }

  // 10. APPROVED but not PACKAGED
  if (audit.review.operatorDecision === 'APPROVED' && audit.state !== 'PACKAGED' && audit.state !== 'PUBLISHED') {
    return {
      command: `pnpm job:package --job ${jobId}`,
      reason: 'Job has been approved by the Operator but has not yet been packaged.',
      expected: 'Assembles manifest logs, scripts, and exports production packages.',
    };
  }

  // 11. PACKAGED
  if (audit.state === 'PACKAGED') {
    return {
      command: `pnpm job:launch-check --job ${jobId}`,
      reason: 'Job is packaged. Run the pre-live launch rehearsal checklist to verify all gates.',
      expected: 'Performs physical file, package, audio stream, and safety gate verification.',
      warning: `💡 EXPLICIT LIVE ACTION ONLY:\n   To publish live reels to Facebook, run:\n   pnpm job:publish-facebook --job ${jobId} --confirm-live-publish`,
    };
  }

  // 12. PUBLISHED
  if (audit.state === 'PUBLISHED') {
    return {
      command: 'None (ARCHIVED)',
      reason: 'Job lifecycle is successfully completed.',
      expected: 'Reels video has been fully published. No further action needed.',
    };
  }

  return {
    command: 'pnpm job:dashboard',
    reason: 'Undertermined lifecycle state. Please inspect job manifests.',
    expected: 'Re-runs diagnostic audits.',
  };
}

// Perform deep artifact-checking on a single job
function auditJob(jobId: string, manifest: any) {
  const jobFolder = join(JOBS_DIR, jobId);

  // 1. Product Card Audit
  const productCardPath = safeResolve(manifest.source?.productCardPath);
  const productCardExists = !!productCardPath && existsSync(productCardPath);
  const cardData = productCardExists ? readJsonFile(productCardPath) : null;
  const productName = cardData?.name ?? null;
  const affiliateLink = cardData?.shortLink ?? null;

  // 2. Source Video Audit
  const sourceVideoPath = safeResolve(manifest.source?.sourceVideoPath);
  const sourceVideoExists = !!sourceVideoPath && existsSync(sourceVideoPath);

  // 3. OpenAI Vision Audit
  const visionPath = safeResolve(manifest.artifacts?.videoVisualAnalysisPath);
  const visionExists = !!visionPath && existsSync(visionPath);
  const visionData = visionExists ? readJsonFile(visionPath) : null;
  const productVisible = visionData?.mainProductVisible ?? null;

  // 4. Script Audit
  const scriptPath = safeResolve(manifest.artifacts?.scriptArtifactPath);
  const scriptExists = !!scriptPath && existsSync(scriptPath);
  const scriptData = scriptExists ? readJsonFile(scriptPath) : null;
  const scriptVisionGrounded = scriptData?.quality?.visionGrounded ?? false;

  // 5. Voice Audit
  const voicePath = safeResolve(manifest.artifacts?.voiceArtifactPath);
  const voiceExists = !!voicePath && existsSync(voicePath);

  // 6. Voice Timing Audit
  const voiceTimingPath = safeResolve(manifest.artifacts?.voiceTimingArtifactPath);
  const voiceTimingExists = !!voiceTimingPath && existsSync(voiceTimingPath);

  // 7. Preview Video Audit
  const previewVideoPath = safeResolve(manifest.artifacts?.previewVideoPath);
  const previewVideoExists = !!previewVideoPath && existsSync(previewVideoPath);

  // 8. Captioned Preview Audit
  const captionedPath = safeResolve(manifest.artifacts?.captionedPreviewPath);
  const captionedExists = !!captionedPath && existsSync(captionedPath);

  // 9. Final QA Audit
  const qaPath = safeResolve(manifest.artifacts?.finalQaReportPath);
  const qaExists = !!qaPath && existsSync(qaPath);
  const qaData = qaExists ? readJsonFile(qaPath) : null;
  const qaStatus = qaData?.qaStatus ?? qaData?.status ?? 'MISSING';

  // 10. Operator Review Audit
  const operatorDecision = manifest.review?.operatorDecision ?? 'PENDING';
  const approvedAt = manifest.review?.approvedAt ?? null;
  const notes = manifest.review?.notes ?? null;

  // 11. Package Audit
  const packagePath = safeResolve(manifest.artifacts?.productionPackageManifestPath);
  const packageExists = !!packagePath && existsSync(packagePath);

  // 12. Facebook Publish Audit
  const facebookPreflightPath = join(jobFolder, 'facebook_preflight_status.json');
  const facebookPreflightExists = existsSync(facebookPreflightPath);
  const facebookPreflightData = facebookPreflightExists ? readJsonFile(facebookPreflightPath) : null;

  const facebookPublishPath = join(jobFolder, 'facebook_publish_status.json');
  const facebookPublishExists = existsSync(facebookPublishPath);
  const facebookPublishData = facebookPublishExists ? readJsonFile(facebookPublishPath) : null;

  const safetyApiCalled = manifest.safety?.facebookApiCalled ?? false;
  const safetyUploaded = manifest.safety?.uploaded ?? false;
  const safetyPublished = manifest.safety?.published ?? false;

  const auditObj = {
    jobId,
    state: manifest.state ?? 'UNKNOWN',
    productCard: {
      exists: productCardExists,
      name: productName,
      affiliateLink,
    },
    sourceVideo: {
      exists: sourceVideoExists,
      path: sourceVideoPath,
    },
    vision: {
      exists: visionExists,
      productVisible,
    },
    script: {
      exists: scriptExists,
      visionGrounded: scriptVisionGrounded,
    },
    voice: {
      exists: voiceExists,
    },
    voiceTiming: {
      exists: voiceTimingExists,
    },
    previewVideo: {
      exists: previewVideoExists,
    },
    captionedPreview: {
      exists: captionedExists,
    },
    finalQa: {
      exists: qaExists,
      status: qaStatus,
    },
    review: {
      operatorDecision,
      approvedAt,
      notes,
    },
    package: {
      exists: packageExists,
    },
    facebookPublish: {
      preflightPassed: facebookPreflightData?.preflightPassed ?? false,
      publishStatusExists: facebookPublishExists,
      apiCalled: safetyApiCalled,
      uploaded: safetyUploaded,
      published: safetyPublished,
      postId: facebookPublishData?.facebook?.postId ?? null,
      videoId: facebookPublishData?.facebook?.videoId ?? null,
    },
  };

  return auditObj;
}

function showFullDashboard(registry: JobRegistry) {
  console.log('======================================================');
  console.log('🎛️   VFOS JOB lifecycle COMMAND CENTER');
  console.log('======================================================');
  console.log(`Registry:          ${REGISTRY_PATH}`);
  console.log(`Total Jobs:        ${registry.jobs.length}`);
  console.log('------------------------------------------------------');

  if (registry.jobs.length === 0) {
    console.log('(No jobs registered in system registry)');
    console.log('======================================================');
    return;
  }

  const header = ['JOB ID', 'STATE', 'REVIEW', 'QA', 'PRODUCT NAME'];
  const rows = registry.jobs.map((job) => {
    const manifest = loadManifest(job.jobId);
    let operatorDecision = job.operatorDecision ?? 'PENDING';
    let qaStatus = 'MISSING';
    let state = job.state ?? 'UNKNOWN';

    if (manifest) {
      operatorDecision = manifest.review?.operatorDecision ?? operatorDecision;
      qaStatus = manifest.qaStatus ?? qaStatus;
      state = manifest.state ?? state;
    }

    const shortName = job.productName 
      ? (job.productName.length > 35 ? job.productName.slice(0, 32) + '...' : job.productName) 
      : '(unknown)';

    return [
      job.jobId,
      state,
      operatorDecision === 'APPROVED' ? 'APPROVED ✅' : operatorDecision === 'REJECTED' ? 'REJECTED ❌' : 'PENDING 🟡',
      qaStatus === 'PASS' ? 'PASS ✅' : qaStatus === 'FAIL' ? 'FAIL ❌' : 'MISSING ⚪',
      shortName,
    ];
  });

  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => r[i].length)),
  );
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) {
    console.log(fmt(row));
  }
  console.log('------------------------------------------------------');

  // Print next instructions for each job
  for (const job of registry.jobs) {
    const manifest = loadManifest(job.jobId);
    if (!manifest) continue;
    const audit = auditJob(job.jobId, manifest);
    const recommendation = inferRecommendedCommand(job.jobId, audit);
    console.log(`\n👉 RECOMMENDED NEXT COMMAND FOR ${job.jobId}:`);
    console.log(`   Command:  \x1b[36m${recommendation.command}\x1b[0m`);
    console.log(`   Reason:   ${recommendation.reason}`);
    if (recommendation.warning) {
      console.log(`   \x1b[33m${recommendation.warning}\x1b[0m`);
    }
  }
  console.log('======================================================\n');
}

function showJobDetail(jobId: string, audit: any, formatMd = false) {
  const recommendation = inferRecommendedCommand(jobId, audit);

  if (formatMd) {
    console.log(`# VFOS Job Diagnostic Audit — ${jobId}\n`);
    console.log(`- **State**: \`${audit.state}\``);
    console.log(`- **Product**: \`${audit.productCard.name ?? '(unknown)'}\``);
    console.log(`- **Operator Decision**: \`${audit.review.operatorDecision}\``);
    console.log(`- **Final QA**: \`${audit.finalQa.status}\``);
    console.log(`- **Source Video**: \`${audit.sourceVideo.exists ? 'PRESENT ✅' : 'MISSING ❌'}\``);
    console.log(`- **Vision Analysis**: \`${audit.vision.exists ? 'PRESENT ✅' : 'MISSING ❌'}\``);
    console.log(`- **Script Grounding**: \`${audit.script.visionGrounded ? 'GROUNDED ✅' : 'NOT GROUNDED ❌'}\``);
    console.log(`- **Voice Synthesis**: \`${audit.voice.exists ? 'PRESENT ✅' : 'MISSING ❌'}\``);
    console.log(`- **Voice Timing Map**: \`${audit.voiceTiming.exists ? 'PRESENT ✅' : 'MISSING ❌'}\``);
    console.log(`- **Draft Preview**: \`${audit.previewVideo.exists ? 'PRESENT ✅' : 'MISSING ❌'}\``);
    console.log(`- **Captioned Preview**: \`${audit.captionedPreview.exists ? 'PRESENT ✅' : 'MISSING ❌'}\``);
    console.log(`- **Production Package**: \`${audit.package.exists ? 'READY ✅' : 'PENDING ❌'}\``);
    console.log(`\n### Next Action\n- **Command**: \`${recommendation.command}\``);
    console.log(`- **Reason**: ${recommendation.reason}`);
    if (recommendation.warning) {
      console.log(`\n> [!WARNING]\n> ${recommendation.warning}`);
    }
    return;
  }

  console.log('======================================================');
  console.log(`🔬  VFOS JOB LIFECYCLE AUDIT — ${jobId}`);
  console.log('======================================================');
  console.log(`Product:           ${audit.productCard.name ?? '(unknown)'}`);
  console.log(`Affiliate Link:    ${audit.productCard.affiliateLink ?? '(none)'}`);
  console.log(`State:             ${audit.state}`);
  console.log(`Operator Decision: ${audit.review.operatorDecision} (Approved At: ${audit.review.approvedAt ?? 'N/A'})`);
  console.log(`QA Status:         ${audit.finalQa.status}`);
  console.log('------------------------------------------------------');
  console.log(`Source Video:      ${audit.sourceVideo.exists ? '✅ PRESENT' : '❌ MISSING'}`);
  console.log(`Vision Analysis:   ${audit.vision.exists ? '✅ PRESENT' : '❌ MISSING'} (Product Visible: ${audit.vision.productVisible !== null ? (audit.vision.productVisible ? 'Yes' : 'No') : 'N/A'})`);
  console.log(`Script Grounding:  ${audit.script.exists ? '✅ PRESENT' : '❌ MISSING'} (Vision Grounded: ${audit.script.visionGrounded ? 'Yes' : 'No'})`);
  console.log(`Voice & Timings:   Voice: ${audit.voice.exists ? '✅' : '❌'} | Timing Map: ${audit.voiceTiming.exists ? '✅' : '❌'}`);
  console.log(`Video Drafts:      Preview: ${audit.previewVideo.exists ? '✅' : '❌'} | Captioned: ${audit.captionedPreview.exists ? '✅' : '❌'}`);
  console.log(`Final QA:          ${audit.finalQa.exists ? '✅' : '❌'}`);
  console.log(`Production Pack:   ${audit.package.exists ? '✅ READY' : '❌ PENDING'}`);
  console.log('------------------------------------------------------');
  console.log(`Safety Locks:      Uploaded: ${audit.facebookPublish.uploaded ? '✅' : '❌'} | Published: ${audit.facebookPublish.published ? '✅' : '❌'} | API Called: ${audit.facebookPublish.apiCalled ? '✅' : '❌'}`);
  if (audit.facebookPublish.publishStatusExists) {
    console.log(`Facebook Status:   Post ID: ${audit.facebookPublish.postId ?? 'N/A'} | Video ID: ${audit.facebookPublish.videoId ?? 'N/A'}`);
  }
  console.log('======================================================');
  console.log('💡 RECOMMENDED NEXT OPERATOR ACTION:');
  console.log(`Command:  \x1b[36m${recommendation.command}\x1b[0m`);
  console.log(`Reason:   ${recommendation.reason}`);
  console.log(`Expected: ${recommendation.expected}`);
  if (recommendation.warning) {
    console.log(`\n\x1b[33m${recommendation.warning}\x1b[0m`);
  }
  console.log('======================================================\n');
}

function main() {
  const args = process.argv.slice(2);
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      json: { type: 'boolean' },
      markdown: { type: 'boolean' },
    },
    allowPositionals: false,
    strict: true,
  });

  const jobId = parsed.values.job as string | undefined;
  const isJson = !!parsed.values.json;
  const isMarkdown = !!parsed.values.markdown;

  const registry = loadRegistry();

  if (jobId) {
    const jobExists = registry.jobs.some((j) => j.jobId === jobId);
    if (!jobExists) {
      console.error(`🛑 UNKNOWN_JOB: Job directory or manifest missing for ${jobId}`);
      process.exit(2);
    }

    const manifest = loadManifest(jobId);
    if (!manifest) {
      console.error(`🛑 UNKNOWN_JOB: Job directory or manifest missing for ${jobId}`);
      process.exit(2);
    }

    const audit = auditJob(jobId, manifest);

    if (isJson) {
      console.log(JSON.stringify(audit, null, 2));
      process.exit(0);
    }

    showJobDetail(jobId, audit, isMarkdown);
    process.exit(0);
  }

  if (isJson) {
    const list = registry.jobs.map((j) => {
      const manifest = loadManifest(j.jobId);
      return manifest ? auditJob(j.jobId, manifest) : null;
    }).filter(Boolean);
    console.log(JSON.stringify(list, null, 2));
    process.exit(0);
  }

  showFullDashboard(registry);
}

main();
