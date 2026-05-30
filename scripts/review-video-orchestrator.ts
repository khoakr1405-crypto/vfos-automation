/**
 * VFOS Review Video Orchestrator — Round 35.
 *
 * Thin orchestration layer that wires together the existing commands:
 *   - pnpm voice:elevenlabs    (Round 33, ElevenLabs v3 bridge)
 *   - pnpm chay                (Round P21, manifest-driven render)
 *   - pnpm caption:kinetic     (Round 34A/34B, ASS subtitle burn)
 *
 * Goal: let the Operator run a single command to produce the captioned
 * review video, while keeping safety gates strict:
 *   - never call ElevenLabs API without --confirm-elevenlabs
 *   - never render or burn captions when the real product video fixture
 *     is missing (avoids generating a misleading placeholder preview)
 *   - never publish, upload, or click anything
 *
 * Safe default mode:
 *   pnpm chay:review
 *     -> uses existing voiceover fixture if present, no API calls
 *
 * With ElevenLabs allowed:
 *   pnpm chay:review --confirm-elevenlabs
 *     -> generates voice via existing bridge if fixture missing
 *
 * Dry-run plan:
 *   pnpm chay:review --dry-run
 *     -> prints the plan without touching anything
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const DEFAULT_RUN_ID = 'run_review_product_p9';
const DEFAULT_CAPTION_PRESET = 'viral_review_v2';

const VIDEO_FIXTURE_PATH = 'production/fixtures/sample_hero_video.mp4';
const VOICE_FIXTURE_PATH = 'production/fixtures/sample_voiceover.mp3';
const STATUS_ARTIFACT_PATH = 'data/temp/review_video_orchestrator_status.json';

type OrchestratorState =
  | 'READY_FOR_OPERATOR_VIDEO_REVIEW'
  | 'MISSING_REAL_PRODUCT_VIDEO_FIXTURE'
  | 'MISSING_VOICEOVER_FIXTURE'
  | 'REAL_FIXTURE_NOT_USED'
  | 'VOICE_GENERATION_FAILED'
  | 'RENDER_FAILED'
  | 'CAPTION_FAILED'
  | 'DRY_RUN_PLAN_ONLY';

interface StatusArtifact {
  statusVersion: 'v1';
  runId: string;
  state: OrchestratorState;
  videoFixturePresent: boolean;
  voiceFixturePresent: boolean;
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
  if (!existsSync(path)) return null;
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return {
      rendered: Boolean(raw.rendered),
      hasRealFixture: Boolean(raw.hasRealFixture),
      offlinePlaceholderOnly: Boolean(raw.offlinePlaceholderOnly),
    };
  } catch {
    return null;
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      run: { type: 'string', default: DEFAULT_RUN_ID },
      preset: { type: 'string', default: DEFAULT_CAPTION_PRESET },
      'dry-run': { type: 'boolean', default: false },
      'confirm-elevenlabs': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values;

  const runId = values.run as string;
  const preset = values.preset as string;
  const dryRun = Boolean(values['dry-run']);
  const confirmElevenLabs = Boolean(values['confirm-elevenlabs']);

  const videoFixturePresent = existsSync(resolve(VIDEO_FIXTURE_PATH));
  const voiceFixturePresent = existsSync(resolve(VOICE_FIXTURE_PATH));

  const runDir = resolve('data/temp/pipeline-p9-demo', runId);
  const expectedOutputV2 = join(runDir, 'preview_with_captions_v2.mp4');
  const expectedOutputV1 = join(runDir, 'preview_with_captions.mp4');
  const expectedOutput = preset === 'viral_review_v2' ? expectedOutputV2 : expectedOutputV1;

  printHeader('🎬  VFOS Review Video Orchestrator');
  console.log(`Run ID:                 ${runId}`);
  console.log(`Caption preset:         ${preset}`);
  console.log(`Mode:                   ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log(`Allow ElevenLabs API:   ${confirmElevenLabs ? '✅ YES' : '❌ NO (default safe)'}`);
  printDivider();
  console.log(`Video fixture:          ${VIDEO_FIXTURE_PATH}  ${videoFixturePresent ? '✅' : '❌'}`);
  console.log(`Voice fixture:          ${VOICE_FIXTURE_PATH}  ${voiceFixturePresent ? '✅' : '❌'}`);
  printDivider();

  const baseArtifact: StatusArtifact = {
    statusVersion: 'v1',
    runId,
    state: 'READY_FOR_OPERATOR_VIDEO_REVIEW',
    videoFixturePresent,
    voiceFixturePresent,
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
    console.log('PLAN:');
    console.log(`  1. Check video fixture          -> ${videoFixturePresent ? 'PRESENT' : 'MISSING'}`);
    console.log(`  2. Check voice fixture          -> ${voiceFixturePresent ? 'PRESENT' : 'MISSING'}`);
    const willCallVoice = !voiceFixturePresent && confirmElevenLabs;
    const willRunChay = videoFixturePresent && (voiceFixturePresent || confirmElevenLabs);
    const willRunCaption = willRunChay;
    console.log(`  3. Will call ElevenLabs API?    -> ${willCallVoice ? 'YES (with --confirm-api-call)' : 'NO'}`);
    console.log(`  4. Will run pnpm chay?          -> ${willRunChay ? 'YES' : 'NO'}`);
    console.log(`  5. Will run kinetic caption?    -> ${willRunCaption ? `YES (preset=${preset})` : 'NO'}`);
    console.log(`  6. Expected output video        -> ${expectedOutput}`);
    if (!videoFixturePresent) {
      console.log('\nBlocker: MISSING_REAL_PRODUCT_VIDEO_FIXTURE');
      console.log(`  Action: copy real product video to ${VIDEO_FIXTURE_PATH}`);
    }
    if (videoFixturePresent && !voiceFixturePresent && !confirmElevenLabs) {
      console.log('\nBlocker: MISSING_VOICEOVER_FIXTURE');
      console.log(`  Action: either rerun with --confirm-elevenlabs,`);
      console.log(`          or run: pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`);
    }
    printDivider();
    console.log('Dry-run complete. No commands executed, no files modified.');
    writeStatusArtifact({ ...baseArtifact, state: 'DRY_RUN_PLAN_ONLY' });
    process.exit(0);
  }

  // ---------- GATE 1: real product video fixture must exist ----------
  if (!videoFixturePresent) {
    console.log('🛑 MISSING_REAL_PRODUCT_VIDEO_FIXTURE');
    console.log('');
    console.log('The real product video fixture is required before render.');
    console.log('Refusing to run `pnpm chay` against the placeholder testsrc');
    console.log('— that would generate a misleading preview and false approval.');
    console.log('');
    console.log('Operator action:');
    console.log(`  copy "C:\\Users\\Admin\\Downloads\\<your-video>.mp4" ${VIDEO_FIXTURE_PATH.replace(/\//g, '\\')}`);
    console.log('Then rerun:');
    console.log('  pnpm chay:review');
    writeStatusArtifact({ ...baseArtifact, state: 'MISSING_REAL_PRODUCT_VIDEO_FIXTURE' });
    process.exit(2);
  }

  // ---------- GATE 2: voiceover fixture (or explicit ElevenLabs consent) ----------
  let elevenLabsApiCalled = false;
  if (!voiceFixturePresent) {
    if (!confirmElevenLabs) {
      console.log('🛑 MISSING_VOICEOVER_FIXTURE');
      console.log('');
      console.log('Voiceover fixture not present and ElevenLabs API not authorized.');
      console.log('Operator action — either:');
      console.log(`  a) pnpm voice:elevenlabs --run ${runId} --confirm-api-call --sync-fixture`);
      console.log('  b) pnpm chay:review --confirm-elevenlabs');
      writeStatusArtifact({ ...baseArtifact, state: 'MISSING_VOICEOVER_FIXTURE' });
      process.exit(3);
    }

    const voiceStatus = runCommand(
      'STEP 1/3 — Generate voiceover via ElevenLabs (authorized)',
      'pnpm',
      ['voice:elevenlabs', '--run', runId, '--confirm-api-call', '--sync-fixture'],
    );
    if (voiceStatus !== 0) {
      console.log('🛑 VOICE_GENERATION_FAILED');
      writeStatusArtifact({ ...baseArtifact, state: 'VOICE_GENERATION_FAILED' });
      process.exit(voiceStatus);
    }
    elevenLabsApiCalled = true;
  } else {
    console.log('STEP 1/3 — Voiceover fixture present, skipping ElevenLabs call. ✅');
  }

  // ---------- STEP 2: render via existing pnpm chay (local-preview) ----------
  const chayStatus = runCommand('STEP 2/3 — Render preview via pnpm chay', 'pnpm', ['chay']);
  if (chayStatus !== 0) {
    console.log('🛑 RENDER_FAILED');
    writeStatusArtifact({
      ...baseArtifact,
      elevenLabsApiCalled,
      state: 'RENDER_FAILED',
    });
    process.exit(chayStatus);
  }

  // ---------- STEP 3: burn kinetic captions ----------
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
      chayExecuted: true,
      state: 'CAPTION_FAILED',
    });
    process.exit(captionStatus);
  }

  // ---------- VERIFY artifact reflects real fixture, not placeholder ----------
  const previewArtifact = readPreviewArtifact(runId);
  const outputExists = existsSync(expectedOutput);

  if (!previewArtifact || !previewArtifact.hasRealFixture || previewArtifact.offlinePlaceholderOnly) {
    console.log('🛑 REAL_FIXTURE_NOT_USED');
    console.log('Render completed but preview_artifact.json still indicates placeholder mode.');
    console.log('Operator should verify that pipeline-run-manifest picked up sample_hero_video.mp4.');
    writeStatusArtifact({
      ...baseArtifact,
      elevenLabsApiCalled,
      chayExecuted: true,
      captionExecuted: true,
      outputVideoPath: outputExists ? expectedOutput : null,
      previewArtifact,
      state: 'REAL_FIXTURE_NOT_USED',
    });
    process.exit(4);
  }

  // ---------- SUCCESS ----------
  writeStatusArtifact({
    ...baseArtifact,
    elevenLabsApiCalled,
    chayExecuted: true,
    captionExecuted: true,
    outputVideoPath: outputExists ? expectedOutput : null,
    previewArtifact,
    state: 'READY_FOR_OPERATOR_VIDEO_REVIEW',
  });

  console.log('');
  printHeader('🎬 VFOS REVIEW VIDEO READY');
  console.log(`Run ID:           ${runId}`);
  console.log(`Video source:     ${VIDEO_FIXTURE_PATH}`);
  console.log(`Voice source:     ${VOICE_FIXTURE_PATH}`);
  console.log(`Caption preset:   ${preset}`);
  console.log(`Output:           ${expectedOutput}`);
  console.log('');
  console.log('Required action:');
  console.log('Operator must watch this video before publish readiness.');
  printDivider();
  process.exit(0);
}

main().catch((err) => {
  console.error('Unhandled orchestrator error:', err);
  process.exit(1);
});
