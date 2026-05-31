/**
 * VFOS Review Video Orchestrator — Round 35 / Round 37 / Round 38.
 *
 * Thin orchestration layer that wires together the existing commands:
 *   - pnpm voice:elevenlabs    (Round 33, ElevenLabs v3 bridge)
 *   - pnpm chay                (Round P21, manifest-driven render — no-job only)
 *   - offline-render-video     (Round 38, direct invocation — job mode)
 *   - pnpm caption:kinetic     (Round 34A/34B, ASS subtitle burn)
 *
 * Modes
 * -----
 *   pnpm chay:review
 *     Default (no-job) mode. Uses the shared fixtures:
 *       production/fixtures/sample_hero_video.mp4
 *       production/fixtures/sample_voiceover.mp3
 *     Renders via `pnpm chay` (full pipeline).
 *
 *   pnpm chay:review --job <jobId>
 *     Job mode (Round 38). Reads
 *       data/temp/jobs/<jobId>/job_manifest.json
 *     and renders directly into the job folder:
 *       data/temp/jobs/<jobId>/preview.mp4
 *       data/temp/jobs/<jobId>/preview_with_captions_v2.mp4
 *     Does NOT copy source to production/fixtures/ (no shared fixture bridge).
 *     Calls offline-render-video and caption:kinetic directly with
 *     job-specific input/output paths.
 *     Voice still comes from the shared voice fixture (per-job voice
 *     is intentionally out of scope and BLOCKED if --confirm-elevenlabs
 *     is combined with --job).
 *
 *   pnpm chay:review [--job <jobId>] --dry-run
 *     Prints the plan only — no API calls, no render, no caption,
 *     no manifest/registry mutation.
 *
 * Safety gates
 * ------------
 *   - never call ElevenLabs API without --confirm-elevenlabs
 *   - in --job mode, never call ElevenLabs (per-job voice not yet wired)
 *   - never render against the placeholder testsrc
 *   - never publish, upload, or click anything
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { calculateNormalizedHash, extractCombinedVoiceText } from './job-artifact-freshness.js';
import { selectBgmForJob } from './job-bgm-selector.js';

const DEFAULT_RUN_ID = 'run_review_product_p9';
const DEFAULT_CAPTION_PRESET = 'viral_review_v2';

// Round 51A: BGM is part of the mandatory job render framework. Job-local
// review videos must carry a BGM bed mixed under the voiceover unless the
// operator explicitly opts out with --allow-no-bgm.
const BGM_REQUIRED_BY_DEFAULT = true;
const BGM_VOLUME_MULTIPLIER = 0.12;

const VIDEO_FIXTURE_PATH = 'production/fixtures/sample_hero_video.mp4';
const VOICE_FIXTURE_PATH = 'production/fixtures/sample_voiceover.mp3';
const STATUS_ARTIFACT_PATH = 'data/temp/review_video_orchestrator_status.json';

const JOBS_ROOT = 'data/temp/jobs';
const JOBS_REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';

type OrchestratorState =
  | 'READY_FOR_OPERATOR_VIDEO_REVIEW'
  | 'MISSING_REAL_PRODUCT_VIDEO_FIXTURE'
  | 'MISSING_VOICEOVER_FIXTURE'
  | 'MISSING_JOB_SOURCE_VIDEO'
  | 'UNKNOWN_JOB'
  | 'JOB_LOCAL_VOICE_NOT_IMPLEMENTED'
  | 'REAL_FIXTURE_NOT_USED'
  | 'VOICE_GENERATION_FAILED'
  | 'RENDER_FAILED'
  | 'CAPTION_FAILED'
  | 'DRY_RUN_PLAN_ONLY'
  | 'REVIEW_PREVIEW_AUDIO_MISSING'
  | 'CAPTIONED_PREVIEW_AUDIO_MISSING'
  | 'BGM_LIBRARY_FILES_MISSING'
  | 'BGM_MISSING_IN_MIX'
  | 'BGM_SELECTION_FAILED'
  | 'VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING'
  | 'VISION_FAILED'
  | 'SCRIPT_REQUIRED_BUT_CONFIRM_OPENAI_MISSING'
  | 'SCRIPT_GENERATION_FAILED'
  | 'BGM_VOICE_DIRECTION_STALE'
  | 'VOICE_DIRECTION_NOT_APPLIED'
  | 'VOICE_REQUIRED_BUT_CONFIRM_ELEVENLABS_MISSING'
  | 'FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING'
  | 'FINAL_QA_NOT_PASSING';

interface StatusArtifact {
  statusVersion: 'v1';
  runId: string;
  jobId: string | null;
  state: OrchestratorState;
  videoFixturePresent: boolean;
  voiceFixturePresent: boolean;
  jobSourceVideoPresent: boolean | null;
  elevenLabsApiCalled: boolean;
  chayExecuted: boolean;
  captionExecuted: boolean;
  captionPreset: string;
  outputVideoPath: string | null;
  previewArtifact: {
    rendered: boolean;
    hasRealFixture: boolean;
    offlinePlaceholderOnly: boolean;
  } | null;
  safety: {
    facebookApiCalled: false;
    uploaded: false;
    published: false;
    operatorReviewRequired: true;
  };
  generatedAt: string;
}

interface JobManifest {
  jobVersion: 'v1';
  jobId: string;
  runId: string;
  productId: string | null;
  source: { productCardPath: string; sourceVideoPath: string | null };
  artifacts: {
    scriptArtifactPath: string | null;
    voiceArtifactPath: string | null;
    voiceTimingArtifactPath: string | null;
    bgmArtifactPath: string | null;
    previewVideoPath: string | null;
    captionedPreviewPath: string | null;
    operatorReviewPackPath: string | null;
    publishReadinessPath: string | null;
    videoVisualAnalysisPath?: string | null;
  };
  state: string;
  review: {
    operatorDecision: string;
    approvedAt: string | null;
    rejectedAt: string | null;
    notes: string | null;
  };
  safety: {
    facebookApiCalled: boolean;
    uploaded: boolean;
    published: boolean;
    requiresOperatorReview: boolean;
  };
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
  bgmPolicy?: 'BGM_REQUIRED' | 'ALLOW_NO_BGM_OPERATOR_OVERRIDE' | null;
  duration?: {
    sourceVideoDurationSec: number;
    voiceDurationSec: number;
    captionedPreviewDurationSec: number | null;
    durationMatchStatus: 'PASS' | 'FAIL';
  } | null;
}

interface Registry {
  registryVersion: 'v1';
  updatedAt: string;
  jobs: Array<{
    jobId: string;
    runId: string;
    state: string;
    productName: string | null;
    productCardPath: string;
    sourceVideoPath: string | null;
    captionedPreviewPath: string | null;
    operatorDecision: string;
    createdAt: string;
    updatedAt: string;
  }>;
}

function printHeader(title: string): void {
  console.log('======================================================');
  console.log(title);
  console.log('======================================================');
}

function printDivider(): void {
  console.log('------------------------------------------------------');
}

function writeStatusArtifact(artifact: StatusArtifact): void {
  const outPath = resolve(STATUS_ARTIFACT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`Status artifact: ${STATUS_ARTIFACT_PATH}`);
}

function runCommand(label: string, command: string, args: string[]): number {
  console.log(`\n>>> ${label}`);
  console.log(`>>> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  return result.status ?? 1;
}

function readPreviewArtifact(runId: string): StatusArtifact['previewArtifact'] {
  const path = resolve('data/temp/pipeline-p9-demo', runId, 'preview_artifact.json');
  return readPreviewArtifactFromPath(path);
}

function readPreviewArtifactFromPath(artifactPath: string): StatusArtifact['previewArtifact'] {
  if (!existsSync(artifactPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<string, unknown>;
    return {
      rendered: Boolean(raw.rendered),
      hasRealFixture: Boolean(raw.hasRealFixture),
      offlinePlaceholderOnly: Boolean(raw.offlinePlaceholderOnly),
    };
  } catch {
    return null;
  }
}

function jobManifestPath(jobId: string): string {
  return resolve(JOBS_ROOT, jobId, 'job_manifest.json');
}

function loadJobManifest(jobId: string): JobManifest | null {
  const path = jobManifestPath(jobId);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JobManifest;
  } catch {
    return null;
  }
}

function saveJobManifest(manifest: JobManifest): void {
  const path = jobManifestPath(manifest.jobId);
  mkdirSync(dirname(path), { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function loadRegistry(): Registry {
  const path = resolve(JOBS_REGISTRY_PATH);
  if (!existsSync(path))
    return { registryVersion: 'v1', updatedAt: new Date().toISOString(), jobs: [] };
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as Registry;
  } catch {
    return { registryVersion: 'v1', updatedAt: new Date().toISOString(), jobs: [] };
  }
}

function saveRegistry(reg: Registry): void {
  const path = resolve(JOBS_REGISTRY_PATH);
  mkdirSync(dirname(path), { recursive: true });
  reg.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
}

function updateRegistryFromManifest(manifest: JobManifest): void {
  const reg = loadRegistry();
  const idx = reg.jobs.findIndex((j) => j.jobId === manifest.jobId);
  if (idx < 0) return;
  reg.jobs[idx] = {
    ...reg.jobs[idx],
    state: manifest.state,
    sourceVideoPath: manifest.source.sourceVideoPath,
    captionedPreviewPath: manifest.artifacts.captionedPreviewPath,
    operatorDecision: manifest.review.operatorDecision,
    updatedAt: manifest.updatedAt,
  };
  saveRegistry(reg);
}

function getVideoDuration(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const args = [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'default=noprint_wrappers=1:nokey=1',
    filePath,
  ];
  const result = spawnSync('ffprobe', args, { encoding: 'utf8' });
  if (result.status === 0) {
    const val = Number.parseFloat(result.stdout.trim());
    if (!isNaN(val)) return val;
  }
  return 0;
}

function getVoiceDuration(filePath: string): number {
  return getVideoDuration(filePath);
}

interface ValidationResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    duplicateHookDetected: boolean;
    repeatedProductNameCount: number;
    tooLongForVideo: boolean;
    ngramRepetitionDetected: boolean;
    visionGrounded?: boolean;
  };
}

function validateScript(args: {
  voiceoverText: string;
  hook: string;
  productName: string;
  targetDurationSec: number;
  estimatedSpeechDurationSec: number;
  visionAnalysis?: any;
}): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const text = args.voiceoverText.trim();
  const textLower = text.toLowerCase();
  const hookLower = args.hook.trim().toLowerCase();
  const prodLower = args.productName.trim().toLowerCase();

  const words = text.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let duplicateHookDetected = false;
  let tooLongForVideo = false;
  let ngramRepetitionDetected = false;
  let visionGrounded = false;

  // 1. Duplicate hook validator:
  let hookOccurrences = 0;
  if (hookLower) {
    let pos = 0;
    while (true) {
      const idx = textLower.indexOf(hookLower, pos);
      if (idx === -1) break;
      hookOccurrences += 1;
      pos = idx + hookLower.length;
    }
  }
  if (hookOccurrences > 1) {
    duplicateHookDetected = true;
    errors.push(
      `Duplicate hook detected: "${args.hook}" appears ${hookOccurrences} times in voiceoverText.`,
    );
  }

  // 2. Product name repetition validator:
  let prodOccurrences = 0;
  if (prodLower) {
    let pos = 0;
    while (true) {
      const idx = textLower.indexOf(prodLower, pos);
      if (idx === -1) break;
      prodOccurrences += 1;
      pos = idx + prodLower.length;
    }
  }
  if (prodOccurrences > 2) {
    errors.push(
      `Product name "${args.productName}" appears ${prodOccurrences} times (max allowed: 2). Use a shorter name.`,
    );
  } else if (prodOccurrences > 1) {
    warnings.push(`Product name appears ${prodOccurrences} times. Keep it to 1-2 times.`);
  }

  // 3. N-gram repetition (4-6 words):
  const ngramSizes = [4, 5, 6];
  for (const size of ngramSizes) {
    if (words.length >= size) {
      const seen = new Set<string>();
      for (let i = 0; i <= words.length - size; i++) {
        const ngram = words
          .slice(i, i + size)
          .join(' ')
          .toLowerCase();
        if (seen.has(ngram)) {
          ngramRepetitionDetected = true;
          errors.push(`N-gram repetition detected (${size} words): "${ngram}"`);
          break;
        }
        seen.add(ngram);
      }
    }
    if (ngramRepetitionDetected) break;
  }

  // 4. Duration estimate:
  if (args.estimatedSpeechDurationSec > args.targetDurationSec) {
    tooLongForVideo = true;
    errors.push(
      `Script is too long for the video: estimated speech duration (${args.estimatedSpeechDurationSec.toFixed(1)}s) exceeds target duration (${args.targetDurationSec.toFixed(1)}s).`,
    );
  }

  // 5. Empty/too short:
  if (wordCount < 15) {
    errors.push(`Script is too short: got only ${wordCount} words (minimum required: 15).`);
  }

  // 6. Vision Grounding Rules (Round 42):
  if (args.visionAnalysis && args.visionAnalysis.analysis) {
    visionGrounded = true;
    const analysis = args.visionAnalysis.analysis;

    // 6a. Product visibility low -> Warning only (does not fail)
    if (analysis.mainProductVisible === false || (analysis.productConfidence ?? 1.0) < 0.5) {
      warnings.push(
        `LOW_PRODUCT_VISIBILITY: Main product visibility is low or confidence is under 50% (${(analysis.productConfidence ?? 1.0) * 100}%). Review source video.`,
      );
    }

    // 6b. Mismatch warnings check: if script mentions items in mismatchWarnings, add warning
    const mismatchWarnings = analysis.mismatchWarnings || [];
    const mismatchFound: string[] = [];
    for (const w of mismatchWarnings) {
      const wWords = w
        .toLowerCase()
        .split(/\s+/)
        .filter((x: string) => x.length > 2);
      if (wWords.length > 0) {
        const found = wWords.some((wd: string) => textLower.includes(wd));
        if (found) {
          mismatchFound.push(w);
        }
      }
    }
    if (mismatchFound.length > 0) {
      warnings.push(
        `Script mentions features flagged in video mismatch warnings: "${mismatchFound.join(', ')}".`,
      );
    }

    // 6c. Demonstrated features check: script should ideally mention at least some keyword from demonstratedFeatures
    const demonstratedFeatures = analysis.demonstratedFeatures || [];
    if (demonstratedFeatures.length > 0) {
      let matchedFeature = false;
      for (const feature of demonstratedFeatures) {
        const keywords = feature.toLowerCase().split(/[\s,]+/);
        const hasMatch = keywords.some((kw: string) => kw.length >= 3 && textLower.includes(kw));
        if (hasMatch) {
          matchedFeature = true;
          break;
        }
      }
      if (!matchedFeature) {
        warnings.push(
          `Script does not mention any demonstrated features from source video analysis: "${demonstratedFeatures.join(', ')}".`,
        );
      }
    }
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    metrics: {
      duplicateHookDetected,
      repeatedProductNameCount: prodOccurrences,
      tooLongForVideo,
      ngramRepetitionDetected,
      visionGrounded,
    },
  };
}

function validateAudioStream(filePath: string): {
  success: boolean;
  error?: string;
  reason?: string;
  duration?: number;
} {
  if (!existsSync(filePath)) {
    return { success: false, error: 'FILE_NOT_FOUND', reason: `File not found at: ${filePath}` };
  }

  const args = [
    '-v',
    'error',
    '-show_entries',
    'stream=index,codec_type,codec_name,duration',
    '-show_format',
    '-of',
    'json',
    filePath,
  ];

  const result = spawnSync('ffprobe', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    return {
      success: false,
      error: 'FFPROBE_FAILED',
      reason: `ffprobe exited with status ${result.status}. Stderr: ${result.stderr}`,
    };
  }

  try {
    const data = JSON.parse(result.stdout || '{}');
    const streams = data.streams || [];
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    if (!audioStream) {
      return {
        success: false,
        error: 'NO_AUDIO_STREAM',
        reason: 'No audio stream found in the file.',
      };
    }

    const duration = Number.parseFloat(audioStream.duration || data.format?.duration || '0');
    if (isNaN(duration) || duration <= 0) {
      return {
        success: false,
        error: 'INVALID_DURATION',
        reason: `Audio duration is invalid or zero: ${audioStream.duration || data.format?.duration}`,
      };
    }

    const codec = audioStream.codec_name;
    if (!codec || codec === 'unknown') {
      return {
        success: false,
        error: 'INVALID_CODEC',
        reason: `Audio codec is invalid or unknown: ${codec}`,
      };
    }

    return { success: true, duration };
  } catch (err: any) {
    return {
      success: false,
      error: 'PARSE_FAILED',
      reason: `Failed to parse ffprobe output: ${err.message}`,
    };
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      run: { type: 'string', default: DEFAULT_RUN_ID },
      preset: { type: 'string', default: DEFAULT_CAPTION_PRESET },
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'confirm-elevenlabs': { type: 'boolean', default: false },
      'confirm-openai': { type: 'boolean', default: false },
      'confirm-ai': { type: 'boolean', default: false },
      'allow-no-bgm': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values;

  const runId = values.run as string;
  const preset = values.preset as string;
  const jobId = (values.job as string | undefined) ?? null;
  const dryRun = Boolean(values['dry-run']);
  // --confirm-ai is the umbrella consent: it authorises OpenAI (vision/script/QA)
  // AND ElevenLabs (voice). Individual flags can also be passed explicitly.
  const confirmAi = Boolean(values['confirm-ai']);
  const confirmOpenAi = Boolean(values['confirm-openai']) || confirmAi;
  const confirmElevenLabs = Boolean(values['confirm-elevenlabs']) || confirmAi;
  const allowNoBgm = Boolean(values['allow-no-bgm']);

  const voiceFixturePresent = existsSync(resolve(VOICE_FIXTURE_PATH));

  const runDir = resolve('data/temp/pipeline-p9-demo', runId);
  const expectedOutputV2 = join(runDir, 'preview_with_captions_v2.mp4');
  const expectedOutputV1 = join(runDir, 'preview_with_captions.mp4');
  const expectedOutputShared = preset === 'viral_review_v2' ? expectedOutputV2 : expectedOutputV1;

  // Job-folder output paths (Round 38). Only used in job mode.
  const jobOutputDir = jobId ? resolve(JOBS_ROOT, jobId) : null;
  const jobPreviewPath = jobOutputDir ? join(jobOutputDir, 'preview.mp4') : null;
  const jobCaptionedPath = jobOutputDir
    ? join(jobOutputDir, `preview_with_captions${preset === 'viral_review_v2' ? '_v2' : ''}.mp4`)
    : null;
  const jobRenderManifestPath = jobOutputDir ? join(jobOutputDir, 'render_manifest.json') : null;
  const jobPreviewArtifactPath = jobOutputDir ? join(jobOutputDir, 'preview_artifact.json') : null;
  const jobCaptionPlanPath = jobOutputDir
    ? join(jobOutputDir, `kinetic_caption_plan${preset === 'viral_review_v2' ? '_v2' : ''}.json`)
    : null;
  const jobAssPath = jobOutputDir
    ? join(jobOutputDir, `kinetic_captions${preset === 'viral_review_v2' ? '_v2' : ''}.ass`)
    : null;

  // Job-local script/voice/timing (Round 39)
  const jobScriptPath = jobId ? resolve(JOBS_ROOT, jobId, 'script_artifact.json') : null;
  const jobVoicePath = jobId ? resolve(JOBS_ROOT, jobId, 'voiceover.mp3') : null;
  const jobVoiceTimingPath = jobId ? resolve(JOBS_ROOT, jobId, 'voice_timing_artifact.json') : null;

  const scriptPresent = jobScriptPath ? existsSync(jobScriptPath) : true;
  const jobVoicePresent =
    jobVoicePath && jobVoiceTimingPath
      ? existsSync(jobVoicePath) && existsSync(jobVoiceTimingPath)
      : false;

  const expectedOutput = jobId ? jobCaptionedPath! : expectedOutputShared;

  let jobManifest: JobManifest | null = null;
  let jobSourceVideoAbs: string | null = null;
  let jobSourceVideoPresent: boolean | null = null;

  if (jobId) {
    jobManifest = loadJobManifest(jobId);
    if (jobManifest) {
      const rel = jobManifest.source.sourceVideoPath;
      jobSourceVideoAbs = rel ? resolve(rel) : null;
      jobSourceVideoPresent = Boolean(jobSourceVideoAbs && existsSync(jobSourceVideoAbs));
    }
  }

  // In job mode the video source is the job's attached source, not the shared fixture.
  const sharedVideoFixturePresent = existsSync(resolve(VIDEO_FIXTURE_PATH));
  const effectiveVideoPresent = jobId ? Boolean(jobSourceVideoPresent) : sharedVideoFixturePresent;
  const effectiveVoicePresent = jobId ? jobVoicePresent : voiceFixturePresent;

  printHeader('🎬  VFOS Review Video Orchestrator');
  console.log(`Mode:                   ${jobId ? `JOB (${jobId})` : 'NO-JOB (shared fixtures)'}`);
  console.log(`Run ID:                 ${runId}`);
  console.log(`Caption preset:         ${preset}`);
  console.log(`Action:                 ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log(`Allow ElevenLabs API:   ${confirmElevenLabs ? '✅ YES' : '❌ NO (default safe)'}`);
  printDivider();
  if (jobId) {
    if (!jobManifest) {
      console.log(`Job manifest:           ${JOBS_ROOT}/${jobId}/job_manifest.json  ❌`);
    } else {
      console.log(`Job manifest:           ${JOBS_ROOT}/${jobId}/job_manifest.json  ✅`);
      console.log(`Job state (current):    ${jobManifest.state}`);
      console.log(
        `Job source video:       ${jobManifest.source.sourceVideoPath ?? '(none)'}  ${jobSourceVideoPresent ? '✅' : '❌'}`,
      );
      console.log(
        `Job script:             ${JOBS_ROOT}/${jobId}/script_artifact.json  ${scriptPresent ? '✅' : '❌'}`,
      );
      console.log(
        `Job voiceover:          ${JOBS_ROOT}/${jobId}/voiceover.mp3  ${jobVoicePresent ? '✅' : '❌'}`,
      );
    }
  } else {
    console.log(
      `Video fixture:          ${VIDEO_FIXTURE_PATH}  ${sharedVideoFixturePresent ? '✅' : '❌'}`,
    );
    console.log(
      `Voice fixture (shared): ${VOICE_FIXTURE_PATH}  ${voiceFixturePresent ? '✅' : '❌'}`,
    );
  }
  printDivider();

  const baseArtifact: StatusArtifact = {
    statusVersion: 'v1',
    runId,
    jobId,
    state: 'READY_FOR_OPERATOR_VIDEO_REVIEW',
    videoFixturePresent: sharedVideoFixturePresent,
    voiceFixturePresent: effectiveVoicePresent,
    jobSourceVideoPresent,
    elevenLabsApiCalled: false,
    chayExecuted: false,
    captionExecuted: false,
    captionPreset: preset,
    outputVideoPath: null,
    previewArtifact: null,
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      operatorReviewRequired: true,
    },
    generatedAt: new Date().toISOString(),
  };

  // ---------- DRY-RUN: print plan, touch nothing ----------
  if (dryRun) {
    console.log('UNIFIED PLAN (Round 52 — Vision→Script→BGM→Voice→Render→Caption→Guards→QA):');
    if (jobId) {
      const visionDryPresent = existsSync(join(JOBS_ROOT, jobId, 'video_visual_analysis.json'));
      const bgmFilesPresent =
        existsSync(resolve('production/fixtures/bgm')) &&
        existsSync(resolve('production/fixtures/bgm/bgm_001.mp3'));
      console.log(
        `  Confirm flags                  -> OpenAI=${confirmOpenAi ? 'YES' : 'NO'} | ElevenLabs=${confirmElevenLabs ? 'YES' : 'NO'}`,
      );
      console.log(
        `  0. Job manifest present?       -> ${jobManifest ? 'YES' : 'NO (UNKNOWN_JOB)'}`,
      );
      console.log(`  0. Job source video present?   -> ${jobSourceVideoPresent ? 'YES' : 'NO'}`);
      console.log(
        `  1. Vision present / will run?  -> ${visionDryPresent ? 'PRESENT' : confirmOpenAi ? 'WILL RUN (job:vision)' : 'BLOCK (needs --confirm-openai)'}`,
      );
      console.log(
        `  2. Script present / will run?  -> ${scriptPresent ? 'PRESENT' : confirmOpenAi ? 'WILL RUN (job:script)' : 'BLOCK (needs --confirm-openai)'}`,
      );
      console.log(
        `  3. BGM files / will select?    -> ${bgmFilesPresent ? 'WILL SELECT (mood→voiceDirection)' : 'BLOCK (BGM_LIBRARY_FILES_MISSING)'}`,
      );
      console.log(
        `  4. Voice present / coupling?   -> ${jobVoicePresent ? 'PRESENT (BGM-coupled check)' : confirmElevenLabs ? 'WILL RUN (voice:elevenlabs)' : 'BLOCK (needs --confirm-elevenlabs)'}`,
      );
      console.log(
        `  9. Final QA / STT?             -> ${confirmOpenAi ? 'WILL RUN (job:qa, must PASS)' : 'BLOCK (needs --confirm-openai)'}`,
      );
      console.log(`  Will publish?                  -> NO (never)`);
    } else {
      console.log(
        `  1. Shared video fixture?        -> ${sharedVideoFixturePresent ? 'PRESENT' : 'MISSING'}`,
      );
      console.log(
        `  3. Voice fixture (shared)?      -> ${voiceFixturePresent ? 'PRESENT' : 'MISSING'}`,
      );
    }

    const willCallVoice = jobId
      ? !jobVoicePresent && confirmElevenLabs
      : !voiceFixturePresent && confirmElevenLabs;
    const canProceed = effectiveVideoPresent && (effectiveVoicePresent || willCallVoice);

    console.log(`  4. Will use shared fixture bridge? -> NO (native job render — Round 38/39)`);
    console.log(`  5. Native job output dir?       -> ${jobOutputDir ?? 'N/A (no-job mode)'}`);
    console.log(
      `  6. Will call ElevenLabs API?    -> ${willCallVoice ? 'YES (authorized via --confirm-elevenlabs)' : 'NO'}`,
    );
    console.log(
      `  7. Will run pnpm chay?          -> ${!jobId && canProceed ? 'YES (no-job pipeline)' : 'NO'}`,
    );
    console.log(
      `  8. Will run offline-render-video? -> ${jobId && canProceed ? 'YES (direct, job mode)' : 'NO'}`,
    );
    console.log(
      `  9. Will run kinetic caption?    -> ${canProceed ? `YES (preset=${preset})` : 'NO'}`,
    );
    console.log(` 10. Will update job manifest?    -> ${canProceed && jobId ? 'YES' : 'NO'}`);
    console.log(
      ` 11. Expected preview path        -> ${jobId ? (jobPreviewPath ?? '?') : `${runDir}/preview.mp4`}`,
    );
    console.log(` 12. Expected captioned path       -> ${expectedOutput}`);

    if (jobId && !jobManifest) {
      console.log('\nBlocker: UNKNOWN_JOB');
      console.log(`  Action: pnpm job:list   then verify --job <jobId>`);
    } else if (jobId && !jobSourceVideoPresent) {
      console.log('\nBlocker: MISSING_JOB_SOURCE_VIDEO');
      console.log(`  Action: pnpm job:attach-source --job ${jobId} --file "<path-to-video>"`);
    } else if (jobId && !scriptPresent) {
      console.log('\nBlocker: MISSING_JOB_SCRIPT_ARTIFACT');
      console.log(`  Action: pnpm job:script --job ${jobId}`);
    } else if (!jobId && !sharedVideoFixturePresent) {
      console.log('\nBlocker: MISSING_REAL_PRODUCT_VIDEO_FIXTURE');
      console.log(`  Action: copy real product video to ${VIDEO_FIXTURE_PATH}`);
    }

    if (jobId && !jobVoicePresent && !confirmElevenLabs) {
      console.log('\nBlocker: MISSING_JOB_VOICEOVER');
      console.log('  Action: rerun with --confirm-elevenlabs to generate job-local voiceover');
      console.log(`          or run: pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);
    } else if (!jobId && !voiceFixturePresent && !confirmElevenLabs) {
      console.log('\nBlocker: MISSING_VOICEOVER_FIXTURE');
      console.log('  Action: rerun with --confirm-elevenlabs to generate shared voiceover');
      console.log(
        `          or run: pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`,
      );
    }
    printDivider();
    console.log('Dry-run complete. No commands executed, no files modified.');
    writeStatusArtifact({ ...baseArtifact, state: 'DRY_RUN_PLAN_ONLY' });
    process.exit(0);
  }

  // ---------- GATE 0: --job sanity ----------
  if (jobId) {
    if (!jobManifest) {
      console.log(`🛑 UNKNOWN_JOB: ${jobId}`);
      console.log('Run `pnpm job:list` to see existing jobs.');
      writeStatusArtifact({ ...baseArtifact, state: 'UNKNOWN_JOB' });
      process.exit(5);
    }
    if (!jobSourceVideoPresent || !jobSourceVideoAbs) {
      console.log(`🛑 MISSING_JOB_SOURCE_VIDEO`);
      console.log(`Job ${jobId} has no attached source video.`);
      console.log('Operator action:');
      console.log(`  pnpm job:attach-source --job ${jobId} --file "C:\\path\\to\\video.mp4"`);
      writeStatusArtifact({ ...baseArtifact, state: 'MISSING_JOB_SOURCE_VIDEO' });
      process.exit(6);
    }
    // ---------- STEP 1: Vision analysis (mandatory — Round 52) ----------
    // Vision is no longer an optional warning. The script must be grounded in a
    // real understanding of the source video.
    const visionArtPath = join(jobOutputDir!, 'video_visual_analysis.json');
    if (!existsSync(visionArtPath)) {
      if (confirmOpenAi) {
        const vStatus = runCommand('STEP 1 — OpenAI Vision analysis (job-native)', 'pnpm', [
          'job:vision',
          '--job',
          jobId,
          '--confirm-openai',
        ]);
        if (vStatus !== 0 || !existsSync(visionArtPath)) {
          console.log('🛑 VISION_FAILED');
          if (jobManifest) {
            jobManifest.state = 'FAILED';
            jobManifest.lastError = 'VISION_FAILED';
            saveJobManifest(jobManifest);
            updateRegistryFromManifest(jobManifest);
          }
          writeStatusArtifact({ ...baseArtifact, state: 'VISION_FAILED' });
          process.exit(20);
        }
      } else {
        console.log('🛑 VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING');
        console.log(`Job ${jobId} has no video_visual_analysis.json and OpenAI is not authorized.`);
        console.log('Operator action:');
        console.log(`  pnpm chay:review --job ${jobId} --confirm-openai`);
        console.log(`  (or: pnpm job:vision --job ${jobId} --confirm-openai)`);
        writeStatusArtifact({
          ...baseArtifact,
          state: 'VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING',
        });
        process.exit(19);
      }
    }

    // ---------- STEP 2: AI script (auto-run with consent — Round 52) ----------
    let scriptNowPresent = scriptPresent;
    if (!scriptNowPresent) {
      if (confirmOpenAi) {
        const sStatus = runCommand('STEP 2 — AI script (job-native)', 'pnpm', [
          'job:script',
          '--job',
          jobId,
          '--confirm-openai',
        ]);
        scriptNowPresent = existsSync(join(jobOutputDir!, 'script_artifact.json'));
        if (sStatus !== 0 || !scriptNowPresent) {
          console.log('🛑 SCRIPT_GENERATION_FAILED');
          if (jobManifest) {
            jobManifest.state = 'FAILED';
            jobManifest.lastError = 'SCRIPT_GENERATION_FAILED';
            saveJobManifest(jobManifest);
            updateRegistryFromManifest(jobManifest);
          }
          writeStatusArtifact({ ...baseArtifact, state: 'SCRIPT_GENERATION_FAILED' });
          process.exit(21);
        }
      } else {
        console.log('🛑 SCRIPT_REQUIRED_BUT_CONFIRM_OPENAI_MISSING');
        console.log(`Job ${jobId} has no script artifact and OpenAI is not authorized.`);
        console.log('Operator action:');
        console.log(`  pnpm chay:review --job ${jobId} --confirm-openai`);
        console.log(`  (or: pnpm job:script --job ${jobId} --confirm-openai)`);
        writeStatusArtifact({
          ...baseArtifact,
          state: 'SCRIPT_REQUIRED_BUT_CONFIRM_OPENAI_MISSING',
        });
        process.exit(8);
      }
    }

    // --- SCRIPT QUALITY GATE ---
    const scriptPath = join(jobOutputDir!, 'script_artifact.json');
    if (existsSync(scriptPath)) {
      try {
        const scriptData = JSON.parse(readFileSync(scriptPath, 'utf8'));
        if (scriptData.quality?.templateFallback) {
          console.log(
            '⚠️  [Safe Mode] Script is a template fallback (TEMPLATE_FALLBACK_NOT_FINAL).',
          );
        }

        const visionPath = join(jobOutputDir!, 'video_visual_analysis.json');
        let visionArtifact: any = null;
        if (existsSync(visionPath)) {
          try {
            visionArtifact = JSON.parse(readFileSync(visionPath, 'utf8'));
          } catch (e) {
            console.warn(`  ⚠️ Could not parse video_visual_analysis.json: ${(e as Error).message}`);
          }
        }

        // Warning: SCRIPT_NOT_VISION_GROUNDED (Round 42)
        if (visionArtifact && (!scriptData.visualContext || !scriptData.visualContext.used)) {
          console.warn(
            '⚠️  [Warning] SCRIPT_NOT_VISION_GROUNDED: Vision analysis exists but this script was not generated with vision grounding.',
          );
          console.warn('   Consider regenerating the script using:');
          console.warn(`     pnpm job:script --job ${jobId} --confirm-openai`);
        }

        let sourceVideoDurationSec = 30.58;
        if (jobSourceVideoAbs && existsSync(jobSourceVideoAbs)) {
          const dur = getVideoDuration(jobSourceVideoAbs);
          if (dur > 0) sourceVideoDurationSec = dur;
        }

        const validation = validateScript({
          voiceoverText: scriptData.voiceoverText,
          hook: scriptData.hook,
          productName: scriptData.productName,
          targetDurationSec: scriptData.targetDurationSec || sourceVideoDurationSec,
          estimatedSpeechDurationSec: scriptData.estimatedSpeechDurationSec || 26.5,
          visionAnalysis: visionArtifact,
        });

        if (!validation.passed) {
          console.error('🛑 SCRIPT_QUALITY_VALIDATION_FAILED');
          console.error('The existing script artifact failed the quality validator:');
          for (const err of validation.errors) {
            console.error(`  - ${err}`);
          }
          console.error('Please regenerate script with:');
          console.error(`  pnpm job:script --job ${jobId} --confirm-openai`);

          if (jobManifest) {
            jobManifest.state = 'FAILED';
            jobManifest.lastError = 'SCRIPT_QUALITY_VALIDATION_FAILED';
            saveJobManifest(jobManifest);
            updateRegistryFromManifest(jobManifest);
          }

          writeStatusArtifact({
            ...baseArtifact,
            state: 'SCRIPT_QUALITY_VALIDATION_FAILED' as any,
          });
          process.exit(11);
        } else {
          console.log('🟢 Script quality validation PASSED.');
          if (validation.warnings.length > 0) {
            console.log('Warnings during script quality validation:');
            for (const wrn of validation.warnings) {
              console.warn(`  ⚠️ ${wrn}`);
            }
          }
        }

        // --- FRESHNESS GATE (Round 43) ---
        const currentScriptText = extractCombinedVoiceText(scriptPath);
        if (currentScriptText) {
          const currentScriptHash = calculateNormalizedHash(currentScriptText);

          // 1. Check voice freshness
          const voiceArtPath = join(jobOutputDir!, 'voice_artifact.json');
          if (existsSync(voiceArtPath)) {
            try {
              const voiceArt = JSON.parse(readFileSync(voiceArtPath, 'utf8'));
              if (!voiceArt.scriptTextHash || voiceArt.scriptTextHash !== currentScriptHash) {
                console.error('\n🛑 STALE_JOB_VOICEOVER');
                console.error(
                  'The generated voiceover is stale or missing hash compared to the current script.',
                );
                console.error('Operator action:');
                console.error(`  pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);

                if (jobManifest) {
                  jobManifest.state = 'FAILED';
                  jobManifest.lastError = 'STALE_JOB_VOICEOVER';
                  saveJobManifest(jobManifest);
                  updateRegistryFromManifest(jobManifest);
                }

                writeStatusArtifact({ ...baseArtifact, state: 'STALE_JOB_VOICEOVER' as any });
                process.exit(12);
              }
            } catch (err: any) {
              console.warn(`  ⚠️ Could not validate voice freshness: ${err.message}`);
            }
          }

          // 2. Check timing freshness
          const timingArtPath = join(jobOutputDir!, 'voice_timing_artifact.json');
          if (existsSync(timingArtPath)) {
            try {
              const timingArt = JSON.parse(readFileSync(timingArtPath, 'utf8'));
              if (!timingArt.scriptTextHash || timingArt.scriptTextHash !== currentScriptHash) {
                console.error('\n🛑 STALE_JOB_TIMING_ARTIFACT');
                console.error(
                  'The voice timing artifact is stale or missing hash compared to the current script.',
                );
                console.error('Operator action:');
                console.error(`  pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);

                if (jobManifest) {
                  jobManifest.state = 'FAILED';
                  jobManifest.lastError = 'STALE_JOB_TIMING_ARTIFACT';
                  saveJobManifest(jobManifest);
                  updateRegistryFromManifest(jobManifest);
                }

                writeStatusArtifact({ ...baseArtifact, state: 'STALE_JOB_TIMING_ARTIFACT' as any });
                process.exit(13);
              }
            } catch (err: any) {
              console.warn(`  ⚠️ Could not validate timing freshness: ${err.message}`);
            }
          }
        }
      } catch (err: any) {
        console.error(`🛑 FAILED_TO_PARSE_SCRIPT_ARTIFACT: ${err.message}`);
        process.exit(12);
      }
    }
  }

  // ---------- GATE 1: video source (shared fixture or job source) ----------
  if (!effectiveVideoPresent) {
    // Only reachable in no-job mode here (job mode handled above).
    console.log('🛑 MISSING_REAL_PRODUCT_VIDEO_FIXTURE');
    console.log('');
    console.log('The real product video fixture is required before render.');
    console.log('Refusing to run `pnpm chay` against the placeholder testsrc');
    console.log('— that would generate a misleading preview and false approval.');
    console.log('');
    console.log('Operator action:');
    console.log(
      `  copy "C:\\Users\\Admin\\Downloads\\<your-video>.mp4" ${VIDEO_FIXTURE_PATH.replace(/\//g, '\\')}`,
    );
    console.log('Then rerun:');
    console.log('  pnpm chay:review');
    writeStatusArtifact({ ...baseArtifact, state: 'MISSING_REAL_PRODUCT_VIDEO_FIXTURE' });
    process.exit(2);
  }

  // ---------- PRE-SELECT BGM (Round 53) ----------
  // Select the BGM (sticky) BEFORE voice generation so the ElevenLabs bridge can
  // read the mood and apply the matching voice direction on the very first take.
  // Policy enforcement (missing files / --allow-no-bgm) still happens at the
  // BGM Selection Gate below; here we only ensure the artifact exists.
  if (jobId && jobOutputDir) {
    const pre = selectBgmForJob({ jobId, jobOutputDir });
    if (pre.status === 'OK' && pre.selection) {
      console.log(
        `🎵 BGM pre-selected for voice direction: ${pre.selection.trackId} (${pre.selection.mood})${pre.reused ? ' [sticky]' : ''}`,
      );
    }
  }

  // ---------- GATE 2: voiceover fixture (or ElevenLabs consent) ----------
  let elevenLabsApiCalled = false;
  if (!effectiveVoicePresent) {
    if (!confirmElevenLabs) {
      if (jobId) {
        console.log('🛑 MISSING_JOB_VOICEOVER');
        console.log('');
        console.log(
          'Job voiceover or timing artifact not present and ElevenLabs API not authorized.',
        );
        console.log('Operator action — either:');
        console.log(`  a) pnpm voice:elevenlabs --job ${jobId} --confirm-api-call`);
        console.log(`  b) pnpm chay:review --job ${jobId} --confirm-elevenlabs`);
        writeStatusArtifact({ ...baseArtifact, state: 'MISSING_JOB_VOICEOVER' });
      } else {
        console.log('🛑 MISSING_VOICEOVER_FIXTURE');
        console.log('');
        console.log('Voiceover fixture not present and ElevenLabs API not authorized.');
        console.log('Operator action — either:');
        console.log(`  a) pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`);
        console.log('  b) pnpm chay:review --confirm-elevenlabs');
        writeStatusArtifact({ ...baseArtifact, state: 'MISSING_VOICEOVER_FIXTURE' });
      }
      process.exit(3);
    }
    const voiceArgs = jobId
      ? ['voice:elevenlabs', '--job', jobId, '--confirm-api-call']
      : ['voice:elevenlabs', '--run', runId, '--confirm-api-call', '--sync-fixture'];

    const voiceStatus = runCommand(
      jobId
        ? 'STEP 1/3 — Generate job-local voiceover via ElevenLabs (authorized)'
        : 'STEP 1/3 — Generate voiceover via ElevenLabs (authorized)',
      'pnpm',
      voiceArgs,
    );
    if (voiceStatus !== 0) {
      console.log('🛑 VOICE_GENERATION_FAILED');
      writeStatusArtifact({ ...baseArtifact, state: 'VOICE_GENERATION_FAILED' });
      process.exit(voiceStatus);
    }
    elevenLabsApiCalled = true;
  } else {
    console.log(
      jobId
        ? 'STEP 1/3 — Job voiceover + timing artifacts present, skipping ElevenLabs call. ✅'
        : 'STEP 1/3 — Voiceover fixture present, skipping ElevenLabs call. ✅',
    );
  }

  // --- VOICE DURATION GATE ---
  if (jobId && jobSourceVideoAbs && existsSync(jobSourceVideoAbs)) {
    const sourceVideoDurationSec = getVideoDuration(jobSourceVideoAbs);
    const jobVoiceoverPath = join(jobOutputDir!, 'voiceover.mp3');
    let voiceDurationSec = 0;
    if (existsSync(jobVoiceoverPath)) {
      voiceDurationSec = getVoiceDuration(jobVoiceoverPath);
    }

    console.log('\n======================================================');
    console.log('⏱️  VFOS Duration Matching Gate');
    console.log('======================================================');
    console.log(`Source video duration: ${sourceVideoDurationSec.toFixed(2)}s`);
    console.log(`Voiceover duration:    ${voiceDurationSec.toFixed(2)}s`);

    const maxAllowedVoiceSec = sourceVideoDurationSec - 0.5;
    console.log(`Max allowed voice:     ${maxAllowedVoiceSec.toFixed(2)}s (video - 0.5s safety)`);

    let durationMatchStatus: 'PASS' | 'FAIL' = 'PASS';
    if (voiceDurationSec > maxAllowedVoiceSec) {
      durationMatchStatus = 'FAIL';
      console.log('🛑 FAIL: VOICE_LONGER_THAN_VIDEO');
      console.log(
        `Voice duration (${voiceDurationSec.toFixed(2)}s) exceeds max allowed (${maxAllowedVoiceSec.toFixed(2)}s).`,
      );
      console.log('To prevent cutting off speech at the end of render, rendering is BLOCKED.');

      if (jobManifest) {
        jobManifest.duration = {
          sourceVideoDurationSec,
          voiceDurationSec,
          captionedPreviewDurationSec: null,
          durationMatchStatus,
        };
        jobManifest.state = 'FAILED';
        jobManifest.lastError = 'VOICE_LONGER_THAN_VIDEO';
        saveJobManifest(jobManifest);
        updateRegistryFromManifest(jobManifest);
      }

      writeStatusArtifact({
        ...baseArtifact,
        elevenLabsApiCalled,
        chayExecuted: false,
        captionExecuted: false,
        state: 'VOICE_LONGER_THAN_VIDEO' as any,
      });
      process.exit(10);
    } else {
      console.log('🟢 PASS: Voiceover duration fits within source video duration.');
      if (jobManifest) {
        jobManifest.duration = {
          sourceVideoDurationSec,
          voiceDurationSec,
          captionedPreviewDurationSec: null,
          durationMatchStatus,
        };
        saveJobManifest(jobManifest);
        updateRegistryFromManifest(jobManifest);
      }
    }
    console.log('======================================================\n');
  }

  // ---------- STEP 1.5: BGM selection (Round 51A) ----------
  // BGM is part of the mandatory job render framework. Select a rotation track
  // and wire it into the render manifest so the renderer mixes voice + BGM.
  // bgmRequired drives the post-render guardrail below.
  let bgmRequired = false;
  let bgmRenderAsset: {
    selected: true;
    trackId: string;
    title: string;
    mood: string;
    localAudioPath: string;
    volumeMultiplier: number;
  } | null = null;

  if (jobId && jobOutputDir && jobManifest) {
    console.log('\n======================================================');
    console.log('🎵  VFOS BGM Selection Gate (Round 51A)');
    console.log('======================================================');
    const bgmResult = selectBgmForJob({ jobId, jobOutputDir });
    console.log(`BGM library:           ${bgmResult.libraryPath}`);
    console.log(`Declared tracks:       ${bgmResult.libraryEntryCount}`);
    console.log(`Real audio files:      ${bgmResult.existingFileCount}`);

    if (bgmResult.status === 'OK' && bgmResult.selection) {
      const sel = bgmResult.selection;
      console.log(
        `Selected track:        ${sel.trackId} — "${sel.title}" (${sel.mood})${bgmResult.reused ? ' [sticky reuse]' : ''}`,
      );
      console.log(`BGM file:              ${sel.localAudioPath}`);
      console.log(`Energy / mood:         ${sel.energyLevel} / ${sel.matchedMood}`);
      const vd = sel.voiceDirection;
      console.log(
        `Voice direction:       ${vd.style} | pace ${vd.pace} | ${vd.delivery} (clarity-first)`,
      );
      console.log(`BGM artifact:          ${bgmResult.artifactPath}`);
      bgmRequired = true;
      bgmRenderAsset = {
        selected: true,
        trackId: sel.trackId,
        title: sel.title,
        mood: sel.mood,
        localAudioPath: sel.localAudioPath,
        volumeMultiplier: sel.volumeMultiplier,
      };
      jobManifest.artifacts.bgmArtifactPath = `${JOBS_ROOT}/${jobId}/bgm_selection_artifact.json`;
      jobManifest.bgmPolicy = 'BGM_REQUIRED';
      saveJobManifest(jobManifest);

      // ---- Voice ↔ BGM coupling (Round 53) ----
      // BGM leads the mood; the voiceover must be generated WITH the matching
      // voice direction. The voice artifact records which direction it was made
      // for (voiceDirectionApplied + voiceDirectionHash). Coupling is fresh only
      // when the voice was direction-applied for the current BGM mood.
      const readVoiceCoupling = (): { applied: boolean; hash: string } => {
        const vp = join(jobOutputDir, 'voice_artifact.json');
        if (!existsSync(vp)) return { applied: false, hash: '' };
        try {
          const va = JSON.parse(readFileSync(vp, 'utf8'));
          return { applied: va.voiceDirectionApplied === true, hash: va.voiceDirectionHash ?? '' };
        } catch {
          return { applied: false, hash: '' };
        }
      };

      const vc = readVoiceCoupling();
      const directionFresh = vc.applied && vc.hash === sel.voiceDirectionHash;
      if (directionFresh) {
        console.log('Voice/BGM coupling:    fresh (voice direction matches current BGM mood). ✅');
      } else {
        const reason: 'VOICE_DIRECTION_NOT_APPLIED' | 'BGM_VOICE_DIRECTION_STALE' = vc.applied
          ? 'BGM_VOICE_DIRECTION_STALE'
          : 'VOICE_DIRECTION_NOT_APPLIED';
        console.log(`🛑 ${reason}`);
        console.log(
          vc.applied
            ? 'BGM mood changed since the voiceover was generated — voice direction no longer matches.'
            : 'The voiceover was not generated with BGM voice direction (legacy/plain voice).',
        );
        if (confirmElevenLabs) {
          const reStatus = runCommand(
            'STEP 4b — Regenerate voiceover with BGM voice direction',
            'pnpm',
            ['voice:elevenlabs', '--job', jobId, '--confirm-api-call'],
          );
          const after = readVoiceCoupling();
          if (reStatus !== 0 || !after.applied || after.hash !== sel.voiceDirectionHash) {
            console.log('🛑 VOICE_GENERATION_FAILED (direction not applied after regen)');
            jobManifest.state = 'FAILED';
            jobManifest.lastError = 'VOICE_GENERATION_FAILED';
            saveJobManifest(jobManifest);
            updateRegistryFromManifest(jobManifest);
            writeStatusArtifact({
              ...baseArtifact,
              elevenLabsApiCalled: true,
              state: 'VOICE_GENERATION_FAILED',
            });
            process.exit(14);
          }
          elevenLabsApiCalled = true;
          console.log('Voice/BGM coupling:    voice regenerated WITH BGM voice direction. ✅');
        } else {
          console.log('Operator action:');
          console.log(
            `  pnpm chay:review --job ${jobId} --confirm-elevenlabs   (regenerate voice)`,
          );
          console.log(
            `  or: pnpm chay:review --job ${jobId} --allow-no-bgm     (drop BGM intentionally)`,
          );
          jobManifest.state = 'FAILED';
          jobManifest.lastError = reason;
          saveJobManifest(jobManifest);
          updateRegistryFromManifest(jobManifest);
          writeStatusArtifact({ ...baseArtifact, elevenLabsApiCalled, state: reason });
          process.exit(15);
        }
      }
    } else {
      // No real BGM file available (library metadata may still exist).
      console.log(`🛑 ${bgmResult.status}`);
      if (bgmResult.reason) console.log(`Reason: ${bgmResult.reason}`);

      if (BGM_REQUIRED_BY_DEFAULT && !allowNoBgm) {
        console.log('Review video requires BGM by default. Rendering is BLOCKED to avoid');
        console.log('silently shipping a voiceover-only video.');
        console.log('Operator action:');
        console.log('  Add mp3 files to production/fixtures/bgm/ according to bgm_library.json,');
        console.log(`  or rerun with --allow-no-bgm to render voiceover-only intentionally.`);
        jobManifest.state = 'FAILED';
        jobManifest.lastError = 'BGM_LIBRARY_FILES_MISSING';
        jobManifest.bgmPolicy = 'BGM_REQUIRED';
        saveJobManifest(jobManifest);
        updateRegistryFromManifest(jobManifest);
        writeStatusArtifact({
          ...baseArtifact,
          elevenLabsApiCalled,
          chayExecuted: false,
          state: 'BGM_LIBRARY_FILES_MISSING',
        });
        process.exit(11);
      } else {
        console.log('⚠️  Operator override (--allow-no-bgm): rendering voiceover-only.');
        bgmRequired = false;
        bgmRenderAsset = null;
        jobManifest.bgmPolicy = 'ALLOW_NO_BGM_OPERATOR_OVERRIDE';
        saveJobManifest(jobManifest);
      }
    }
    console.log('======================================================\n');
  }

  // ---------- STEP 2: render preview ----------
  let chayExecuted = false;
  if (
    jobId &&
    jobSourceVideoAbs &&
    jobOutputDir &&
    jobRenderManifestPath &&
    jobPreviewArtifactPath &&
    jobPreviewPath
  ) {
    // ---- JOB MODE: direct offline-render-video into job folder (Round 38) ----
    mkdirSync(jobOutputDir, { recursive: true });

    // Write the render manifest for offline-render-video. assets.bgm is no
    // longer hardcoded to null — it reflects the Round 51A BGM selection so the
    // renderer mixes voice + BGM under the voiceover.
    const jobRenderManifest = {
      renderVersion: 'v1',
      jobId,
      runId,
      output: { expectedPreviewPath: jobPreviewPath },
      renderOptions: { estimatedDurationSec: 28, resolution: '1080x1920', aspectRatio: '9:16' },
      assets: { bgm: bgmRenderAsset },
      generatedAt: new Date().toISOString(),
    };
    writeFileSync(jobRenderManifestPath, `${JSON.stringify(jobRenderManifest, null, 2)}\n`, 'utf8');

    const renderArgs = [
      'tsx',
      'scripts/offline-render-video-demo.ts',
      '--render',
      jobRenderManifestPath,
      '--output',
      jobPreviewArtifactPath,
      '--mode',
      'local-preview',
      '--input-video',
      jobSourceVideoAbs,
      '--input-audio',
      jobVoicePath!,
    ];
    const renderStatus = runCommand(
      'STEP 2/3 — Render preview (job-native, no shared fixture bridge)',
      'npx',
      renderArgs,
    );
    if (renderStatus !== 0) {
      console.log('🛑 RENDER_FAILED');
      jobManifest!.state = 'FAILED';
      saveJobManifest(jobManifest!);
      updateRegistryFromManifest(jobManifest!);
      writeStatusArtifact({ ...baseArtifact, elevenLabsApiCalled, state: 'RENDER_FAILED' });
      process.exit(renderStatus);
    }
    chayExecuted = true;
  } else {
    // ---- NO-JOB MODE: use pnpm chay (full pipeline, unchanged) ----
    const chayStatus = runCommand('STEP 2/3 — Render preview via pnpm chay', 'pnpm', ['chay']);
    if (chayStatus !== 0) {
      console.log('🛑 RENDER_FAILED');
      writeStatusArtifact({ ...baseArtifact, elevenLabsApiCalled, state: 'RENDER_FAILED' });
      process.exit(chayStatus);
    }
    chayExecuted = true;
  }

  // Validate preview audio stream
  const previewPathToCheck = jobId ? jobPreviewPath! : join(runDir, 'preview.mp4');
  console.log(`\n🔍 [AudioGuard] Running audio stream check on preview: ${previewPathToCheck}...`);
  const previewAudioCheck = validateAudioStream(previewPathToCheck);
  if (!previewAudioCheck.success) {
    console.log(`🛑 Audio check failed: REVIEW_PREVIEW_AUDIO_MISSING`);
    console.log(`Reason: ${previewAudioCheck.reason || 'No audio stream or duration is 0'}`);
    console.log(`Suggestion: run the following command to diagnose the video:`);
    console.log(
      `  ffprobe -v error -show_entries stream=index,codec_type,codec_name,duration -show_format -of json "${previewPathToCheck}"`,
    );

    if (jobId && jobManifest) {
      jobManifest.state = 'FAILED';
      jobManifest.lastError = 'REVIEW_PREVIEW_AUDIO_MISSING';
      saveJobManifest(jobManifest);
      updateRegistryFromManifest(jobManifest);
    }

    writeStatusArtifact({
      ...baseArtifact,
      elevenLabsApiCalled,
      chayExecuted,
      state: 'REVIEW_PREVIEW_AUDIO_MISSING',
    });
    process.exit(9);
  } else {
    console.log(`✅ [AudioGuard] Preview audio stream OK.`);
  }

  // ---------- BGM MIX GUARDRAIL (Round 51A) ----------
  // ffprobe alone cannot prove BGM is present — amix collapses voice + BGM into
  // a single audio stream, so a voiceover-only video and a voice+BGM video both
  // show one audio stream. The guard therefore relies on the selection artifact
  // and the renderer's mix report (voiceIncluded + bgmIncluded) instead.
  if (jobId && jobOutputDir && bgmRequired) {
    console.log(`\n🔍 [BgmGuard] Verifying BGM was mixed under the voiceover...`);
    const bgmSelectionPath = join(jobOutputDir, 'bgm_selection_artifact.json');
    const bgmReportPath = join(jobOutputDir, 'bgm_mixing_report.json');
    const renderManifestAbs = join(jobOutputDir, 'render_manifest.json');

    let bgmGuardFail: string | null = null;
    if (!existsSync(bgmSelectionPath)) {
      bgmGuardFail = 'bgm_selection_artifact.json missing';
    } else if (!existsSync(bgmReportPath)) {
      bgmGuardFail = 'bgm_mixing_report.json missing (renderer fell back to voiceover-only)';
    } else {
      try {
        const manifestAsset = JSON.parse(readFileSync(renderManifestAbs, 'utf8'))?.assets?.bgm;
        if (!manifestAsset || manifestAsset.selected !== true) {
          bgmGuardFail = 'render_manifest.assets.bgm.selected is not true';
        } else {
          const report = JSON.parse(readFileSync(bgmReportPath, 'utf8'));
          if (report.voiceIncluded !== true || report.bgmIncluded !== true) {
            bgmGuardFail = `mix report flags not both true (voiceIncluded=${report.voiceIncluded}, bgmIncluded=${report.bgmIncluded})`;
          }
        }
      } catch (err) {
        bgmGuardFail = `could not parse BGM artifacts: ${(err as Error).message}`;
      }
    }

    if (bgmGuardFail) {
      console.log(`🛑 BGM_MISSING_IN_MIX`);
      console.log(`Reason: ${bgmGuardFail}`);
      console.log('BGM was required for this job but the rendered preview does not contain a');
      console.log('verified voice + BGM mix. Refusing to advance to operator review.');
      if (jobManifest) {
        jobManifest.state = 'FAILED';
        jobManifest.lastError = 'BGM_MISSING_IN_MIX';
        saveJobManifest(jobManifest);
        updateRegistryFromManifest(jobManifest);
      }
      writeStatusArtifact({
        ...baseArtifact,
        elevenLabsApiCalled,
        chayExecuted,
        state: 'BGM_MISSING_IN_MIX',
      });
      process.exit(12);
    }
    console.log(`✅ [BgmGuard] Voice + BGM mix verified (mix report present, flags OK).`);
  }

  // ---------- STEP 3: burn kinetic captions ----------
  let captionExecuted = false;
  if (jobId && jobPreviewPath && jobCaptionedPath && jobCaptionPlanPath && jobAssPath) {
    // ---- JOB MODE: direct caption:kinetic with job-local paths ----
    const captionArgs = ['caption:kinetic', '--job', jobId, '--preset', preset];
    const captionStatus = runCommand(
      'STEP 3/3 — Burn kinetic captions (job-native)',
      'pnpm',
      captionArgs,
    );
    if (captionStatus !== 0) {
      console.log('🛑 CAPTION_FAILED');
      jobManifest!.state = 'FAILED';
      saveJobManifest(jobManifest!);
      updateRegistryFromManifest(jobManifest!);
      writeStatusArtifact({
        ...baseArtifact,
        elevenLabsApiCalled,
        chayExecuted,
        state: 'CAPTION_FAILED',
      });
      process.exit(captionStatus);
    }
    captionExecuted = true;
  } else {
    // ---- NO-JOB MODE: use standard caption:kinetic (unchanged) ----
    const captionStatus = runCommand('STEP 3/3 — Burn kinetic captions', 'pnpm', [
      'caption:kinetic',
      '--run',
      runId,
      '--preset',
      preset,
    ]);
    if (captionStatus !== 0) {
      console.log('🛑 CAPTION_FAILED');
      writeStatusArtifact({
        ...baseArtifact,
        elevenLabsApiCalled,
        chayExecuted,
        state: 'CAPTION_FAILED',
      });
      process.exit(captionStatus);
    }
    captionExecuted = true;
  }

  // Validate captioned preview audio stream
  console.log(
    `\n🔍 [AudioGuard] Running audio stream check on captioned output: ${expectedOutput}...`,
  );
  const captionedAudioCheck = validateAudioStream(expectedOutput);
  if (!captionedAudioCheck.success) {
    console.log(`🛑 Audio check failed: CAPTIONED_PREVIEW_AUDIO_MISSING`);
    console.log(`Reason: ${captionedAudioCheck.reason || 'No audio stream or duration is 0'}`);
    console.log(`Suggestion: run the following command to diagnose the video:`);
    console.log(
      `  ffprobe -v error -show_entries stream=index,codec_type,codec_name,duration -show_format -of json "${expectedOutput}"`,
    );

    if (jobId && jobManifest) {
      jobManifest.state = 'FAILED';
      jobManifest.lastError = 'CAPTIONED_PREVIEW_AUDIO_MISSING';
      saveJobManifest(jobManifest);
      updateRegistryFromManifest(jobManifest);
    }

    writeStatusArtifact({
      ...baseArtifact,
      elevenLabsApiCalled,
      chayExecuted,
      captionExecuted,
      state: 'CAPTIONED_PREVIEW_AUDIO_MISSING',
    });
    process.exit(10);
  } else {
    console.log(`✅ [AudioGuard] Captioned output audio stream OK.`);
    if (jobId && jobManifest && jobManifest.duration) {
      jobManifest.duration.captionedPreviewDurationSec = captionedAudioCheck.duration || null;
      saveJobManifest(jobManifest);
    }
  }

  // Print successful guardrail check logs in the exact format requested
  console.log('\nAudio check:');
  console.log(`- preview.mp4: AUDIO PRESENT`);
  console.log(`- ${basename(expectedOutput)}: AUDIO PRESENT`);

  // ---------- VERIFY artifact reflects real fixture, not placeholder ----------
  let previewArtifact: StatusArtifact['previewArtifact'];
  if (jobId && jobPreviewArtifactPath) {
    // Job mode: read from job folder.
    previewArtifact = readPreviewArtifactFromPath(jobPreviewArtifactPath);
  } else {
    previewArtifact = readPreviewArtifact(runId);
  }
  const outputExists = existsSync(expectedOutput);

  if (
    !previewArtifact ||
    !previewArtifact.hasRealFixture ||
    previewArtifact.offlinePlaceholderOnly
  ) {
    console.log('🛑 REAL_FIXTURE_NOT_USED');
    console.log('Render completed but preview_artifact.json still indicates placeholder mode.');
    if (jobId) {
      console.log('Operator should verify that source video is a real product video.');
    } else {
      console.log(
        'Operator should verify that pipeline-run-manifest picked up sample_hero_video.mp4.',
      );
    }
    if (jobId && jobManifest) {
      jobManifest.state = 'FAILED';
      saveJobManifest(jobManifest);
      updateRegistryFromManifest(jobManifest);
    }
    writeStatusArtifact({
      ...baseArtifact,
      elevenLabsApiCalled,
      chayExecuted,
      captionExecuted,
      outputVideoPath: outputExists ? expectedOutput : null,
      previewArtifact,
      state: 'REAL_FIXTURE_NOT_USED',
    });
    process.exit(4);
  }

  // ---------- STEP 9: Final QA / STT (mandatory before READY — Round 52) ----------
  // Final QA is no longer a printed suggestion. The job cannot reach
  // READY_FOR_OPERATOR_REVIEW until STT QA confirms voice present, not cut off,
  // and transcript matching the script.
  if (jobId && jobManifest) {
    console.log('\n======================================================');
    console.log('🧪  VFOS Final QA / STT Gate (Round 52)');
    console.log('======================================================');
    if (!confirmOpenAi) {
      console.log('🛑 FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING');
      console.log('Final STT QA must pass before the video is offered for operator review.');
      console.log('Operator action:');
      console.log(`  pnpm chay:review --job ${jobId} --confirm-openai`);
      console.log(`  (or run standalone: pnpm job:qa --job ${jobId} --confirm-openai)`);
      jobManifest.lastError = 'FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING';
      saveJobManifest(jobManifest);
      writeStatusArtifact({
        ...baseArtifact,
        elevenLabsApiCalled,
        chayExecuted,
        captionExecuted,
        outputVideoPath: outputExists ? expectedOutput : null,
        state: 'FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING',
      });
      process.exit(22);
    }

    const qaStatusCode = runCommand('STEP 9 — Final QA / STT', 'pnpm', [
      'job:qa',
      '--job',
      jobId,
      '--confirm-openai',
    ]);
    const qaManifest = loadJobManifest(jobId);
    const qaPassed = qaStatusCode === 0 && qaManifest?.qaStatus === 'PASS';
    if (!qaPassed) {
      console.log('🛑 FINAL_QA_NOT_PASSING');
      console.log(`QA exit code: ${qaStatusCode}, qaStatus: ${qaManifest?.qaStatus ?? 'unknown'}`);
      if (qaManifest) {
        qaManifest.state = 'FAILED';
        qaManifest.lastError = 'FINAL_QA_NOT_PASSING';
        saveJobManifest(qaManifest);
        updateRegistryFromManifest(qaManifest);
      }
      writeStatusArtifact({
        ...baseArtifact,
        elevenLabsApiCalled,
        chayExecuted,
        captionExecuted,
        outputVideoPath: outputExists ? expectedOutput : null,
        state: 'FINAL_QA_NOT_PASSING',
      });
      process.exit(23);
    }
    console.log('✅ Final QA / STT PASSED.');
    // Reload manifest so downstream READY write keeps qa fields.
    if (qaManifest) jobManifest = qaManifest;
  }

  // ---------- SUCCESS ----------
  if (jobId && jobManifest) {
    // Job mode: paths point to job folder.
    const previewRel = `${JOBS_ROOT}/${jobId}/preview.mp4`;
    const captionedRel = `${JOBS_ROOT}/${jobId}/preview_with_captions${preset === 'viral_review_v2' ? '_v2' : ''}.mp4`;
    jobManifest.artifacts.previewVideoPath = previewRel;
    jobManifest.artifacts.captionedPreviewPath = captionedRel;
    jobManifest.state = 'READY_FOR_OPERATOR_REVIEW';
    saveJobManifest(jobManifest);
    updateRegistryFromManifest(jobManifest);
  }

  writeStatusArtifact({
    ...baseArtifact,
    elevenLabsApiCalled,
    chayExecuted,
    captionExecuted,
    outputVideoPath: outputExists ? expectedOutput : null,
    previewArtifact,
    state: 'READY_FOR_OPERATOR_VIDEO_REVIEW',
  });

  console.log('');
  printHeader('🎬 VFOS REVIEW VIDEO READY');
  if (jobId) console.log(`Job ID:           ${jobId}`);
  console.log(`Run ID:           ${runId}`);
  console.log(
    `Video source:     ${jobId && jobSourceVideoAbs ? jobSourceVideoAbs : VIDEO_FIXTURE_PATH}`,
  );
  console.log(`Voice source:     ${jobId ? jobVoicePath : VOICE_FIXTURE_PATH}`);
  console.log(`Caption preset:   ${preset}`);
  console.log(`Output:           ${expectedOutput}`);
  if (jobId) {
    console.log(`Job state:        READY_FOR_OPERATOR_REVIEW`);
    console.log(`Render mode:      NATIVE_JOB_FOLDER (no shared fixture bridge)`);
  }
  console.log('');
  console.log('Required action:');
  console.log('Operator must watch this video before publish readiness.');
  if (jobId) {
    console.log('Unified pipeline gates passed: Vision → Script → BGM → Voice(coupled) →');
    console.log('Render → Caption → AudioGuard → BgmGuard → Final QA/STT. ✅');
  }
  printDivider();
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled orchestrator error:', err);
  process.exit(1);
});
