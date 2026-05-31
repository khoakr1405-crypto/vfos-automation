#!/usr/bin/env tsx

/**
 * VFOS ElevenLabs v3 Voiceover Bridge — Round 33.
 *
 * Sinh voiceover tiếng Việt cho 1 run cụ thể bằng ElevenLabs v3 endpoint
 * /text-to-speech/{voice_id}/with-timestamps. Mặc định dry-run: chỉ in
 * plan, KHÔNG gọi API. Cần --confirm-api-call để thực sự gọi.
 *
 * Outputs trong data/temp/pipeline-p9-demo/<runId>/:
 *   - voiceover.mp3                    (audio decoded từ base64)
 *   - voice_timing_artifact.json       (alignment + normalized_alignment)
 *   - voice_artifact.json              (status + metadata, không chứa secret)
 *
 * Nếu --sync-fixture, copy voiceover.mp3 sang
 *   production/fixtures/sample_voiceover.mp3
 * để render-video-demo dùng làm voice fixture thật.
 *
 * Safety guards:
 *   - KHÔNG gọi API nếu thiếu --confirm-api-call.
 *   - KHÔNG đọc .env trong dry-run path.
 *   - KHÔNG log API key, KHÔNG log raw audio base64.
 *   - voiceIdMasked = '****' + last 4 chars.
 *   - Nếu thiếu credential → ghi MISSING_CREDENTIALS, exit 1 sạch.
 *   - Fallback model: eleven_v3 → eleven_flash_v2_5 → MODEL_NOT_AVAILABLE.
 *
 * Usage:
 *   pnpm voice:elevenlabs --run run_review_product_p9 --dry-run
 *   pnpm voice:elevenlabs --run run_review_product_p9 --confirm-api-call
 *   pnpm voice:elevenlabs --run run_review_product_p9 --confirm-api-call --sync-fixture
 *   pnpm voice:elevenlabs --job job_20260530_001 --dry-run          (Round 39)
 *   pnpm voice:elevenlabs --job job_20260530_001 --confirm-api-call (Round 39)
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../packages/voice/src/load-env.js';
import { buildTtsText, calculateNormalizedHash } from './job-artifact-freshness.js';

interface ScriptArtifact {
  hook?: string;
  hook3s?: string;
  voiceover?: string;
  voiceoverText?: string;
  captionDraft?: string;
  script?: string;
}

interface OperatorReviewPack {
  script?: { hook3s?: string; voiceover?: string };
  voiceover?: string;
  hook?: string;
}

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

interface WithTimestampsResponse {
  audio_base64: string;
  alignment: Alignment;
  normalized_alignment: Alignment;
}

const VOICE_TEXT_MIN_CHARS = 80;
const VOICE_TEXT_MIN_WORDS = 15;
const DEFAULT_MODEL = 'eleven_v3';
const FALLBACK_MODEL = 'eleven_flash_v2_5';
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1';
const FIXTURE_AUDIO_PATH = 'production/fixtures/sample_voiceover.mp3';

function maskVoiceId(voiceId: string): string {
  if (voiceId.length <= 4) return '****';
  return '****' + voiceId.slice(-4);
}

function resolveRunDir(runId: string): string {
  return resolve('data/temp/pipeline-p9-demo', runId);
}

function readScriptText(runDir: string): { text: string; source: string } | { error: string } {
  const scriptArtifactPath = join(runDir, 'script_artifact.json');
  if (existsSync(scriptArtifactPath)) {
    try {
      const raw = readFileSync(scriptArtifactPath, 'utf8');
      const artifact = JSON.parse(raw) as ScriptArtifact;
      // Round 56: dedupe-aware — never duplicate a hook that the voiceover
      // already contains. voiceover/voiceoverText is the source of truth.
      const hook = artifact.hook3s ?? artifact.hook ?? '';
      const voiceover = artifact.voiceover ?? artifact.voiceoverText ?? '';
      const combined = buildTtsText(hook, voiceover);
      if (combined) return { text: combined, source: 'script_artifact.json' };
    } catch (err) {
      return { error: `Failed to parse script_artifact.json: ${(err as Error).message}` };
    }
  }
  const reviewPackPath = join(runDir, 'operator_review_pack.json');
  if (existsSync(reviewPackPath)) {
    try {
      const raw = readFileSync(reviewPackPath, 'utf8');
      const pack = JSON.parse(raw) as OperatorReviewPack;
      const hook = pack.script?.hook3s ?? pack.hook ?? '';
      const voiceover = pack.script?.voiceover ?? pack.voiceover ?? '';
      const combined = buildTtsText(hook, voiceover);
      if (combined) return { text: combined, source: 'operator_review_pack.json' };
    } catch (err) {
      return { error: `Failed to parse operator_review_pack.json: ${(err as Error).message}` };
    }
  }
  return {
    error: 'No script_artifact.json or operator_review_pack.json found with voiceover text',
  };
}

function writeArtifact(path: string, body: object): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n', 'utf8');
}

function buildBaseArtifact(
  runId: string,
  model: string,
  textSource: string,
  textLength: number,
  textHash?: string,
) {
  return {
    voiceArtifactVersion: 'v4',
    runId,
    provider: 'elevenlabs',
    model,
    languageCode: 'vi',
    textSource,
    textLength,
    scriptTextHash: textHash ?? null,
    generatedAt: new Date().toISOString(),
  };
}

// Round 53: BGM leads mood → the voiceover is generated to match. We read the
// per-job BGM selection (written by job-bgm-selector) and map its mood to
// concrete ElevenLabs voice_settings. clarityPriority means voice stays
// intelligible: stability is kept moderate-high and style is capped.
interface VoiceSettings {
  stability: number;
  similarity_boost: number;
  style: number;
  use_speaker_boost: boolean;
}

interface BgmDirection {
  bgmTrackId: string;
  bgmMood: string;
  voiceDirectionHash: string;
  voiceDirection: Record<string, unknown>;
}

function readBgmDirection(workDir: string): BgmDirection | null {
  const p = join(workDir, 'bgm_selection_artifact.json');
  if (!existsSync(p)) return null;
  try {
    const sel = JSON.parse(readFileSync(p, 'utf8'));
    if (!sel?.voiceDirection || !sel?.voiceDirectionHash) return null;
    return {
      bgmTrackId: sel.trackId ?? 'unknown',
      bgmMood: sel.mood ?? 'unknown',
      voiceDirectionHash: sel.voiceDirectionHash,
      voiceDirection: sel.voiceDirection,
    };
  } catch {
    return null;
  }
}

const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  stability: 0.45,
  similarity_boost: 0.75,
  style: 0.35,
  use_speaker_boost: true,
};

function ttsSettingsForMood(mood: string): VoiceSettings {
  switch (mood) {
    case 'upbeat_review':
      return { stability: 0.4, similarity_boost: 0.75, style: 0.5, use_speaker_boost: true };
    case 'funky_tiktok':
      return { stability: 0.4, similarity_boost: 0.75, style: 0.55, use_speaker_boost: true };
    case 'lofi_lifestyle':
      return { stability: 0.55, similarity_boost: 0.78, style: 0.28, use_speaker_boost: true };
    case 'clean_tech':
      return { stability: 0.55, similarity_boost: 0.8, style: 0.3, use_speaker_boost: true };
    default:
      return DEFAULT_VOICE_SETTINGS;
  }
}

async function callElevenLabsWithTimestamps(args: {
  apiKey: string;
  voiceId: string;
  model: string;
  text: string;
  voiceSettings?: VoiceSettings;
}): Promise<
  { ok: true; data: WithTimestampsResponse } | { ok: false; status: number; reason: string }
> {
  const url = `${ELEVENLABS_BASE}/text-to-speech/${args.voiceId}/with-timestamps`;
  const body = {
    text: args.text,
    model_id: args.model,
    voice_settings: args.voiceSettings ?? DEFAULT_VOICE_SETTINGS,
  };
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'xi-api-key': args.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    return { ok: false, status: 0, reason: `network: ${(err as Error).message}` };
  }
  if (!response.ok) {
    let detail = '';
    try {
      detail = await response.text();
    } catch {}
    // Truncate detail to avoid spilling internals; never includes apiKey since
    // apiKey is only in request header, not response body.
    return {
      ok: false,
      status: response.status,
      reason: detail ? detail.slice(0, 400) : response.statusText,
    };
  }
  try {
    const data = (await response.json()) as WithTimestampsResponse;
    if (!data.audio_base64 || !data.alignment) {
      return {
        ok: false,
        status: response.status,
        reason: 'response missing audio_base64 or alignment',
      };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, status: response.status, reason: `json parse: ${(err as Error).message}` };
  }
}

function isModelUnsupportedError(status: number, reason: string): boolean {
  if (status === 422 || status === 400) {
    const lower = reason.toLowerCase();
    return (
      lower.includes('model') &&
      (lower.includes('not') || lower.includes('unsupported') || lower.includes('invalid'))
    );
  }
  return false;
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      run: { type: 'string' },
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'confirm-api-call': { type: 'boolean', default: false },
      'sync-fixture': { type: 'boolean', default: false },
      'allow-short-script': { type: 'boolean', default: false },
      model: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values;

  const jobId = (values.job as string | undefined) ?? null;
  const runId = jobId ? null : ((values.run as string | undefined) ?? null);

  if (!jobId && !runId) {
    console.error('Error: --run <runId> or --job <jobId> is required');
    process.exit(1);
  }

  // Resolve paths: job mode reads/writes in job folder; run mode in pipeline run dir.
  const JOBS_ROOT = 'data/temp/jobs';
  let workDir: string;
  let audioPath: string;
  let timingArtifactPath: string;
  let voiceArtifactPath: string;
  let effectiveRunId: string;

  // Job manifest for job mode updates.
  let jobManifest: Record<string, any> | null = null;

  if (jobId) {
    workDir = resolve(JOBS_ROOT, jobId);
    audioPath = join(workDir, 'voiceover.mp3');
    timingArtifactPath = join(workDir, 'voice_timing_artifact.json');
    voiceArtifactPath = join(workDir, 'voice_artifact.json');
    effectiveRunId = `run_${jobId}`;
    // Load job manifest.
    const manifestPath = join(workDir, 'job_manifest.json');
    if (!existsSync(manifestPath)) {
      console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
      console.error(`  Manifest not found: ${manifestPath}`);
      process.exit(5);
    }
    try {
      jobManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    } catch (err) {
      console.error(`🛑 INVALID_JOB_MANIFEST: ${(err as Error).message}`);
      process.exit(5);
    }
  } else {
    workDir = resolveRunDir(runId!);
    audioPath = join(workDir, 'voiceover.mp3');
    timingArtifactPath = join(workDir, 'voice_timing_artifact.json');
    voiceArtifactPath = join(workDir, 'voice_artifact.json');
    effectiveRunId = runId!;
  }

  const scriptRead = readScriptText(workDir);
  if ('error' in scriptRead) {
    if (jobId) {
      console.error(`🛑 MISSING_JOB_SCRIPT_ARTIFACT`);
      console.error(`  ${scriptRead.error}`);
      console.error(`  Generate first: pnpm job:script --job ${jobId}`);
    } else {
      console.error(`Error: ${scriptRead.error}`);
    }
    process.exit(1);
  }
  const { text: voiceText, source: textSource } = scriptRead;
  const wordCount = voiceText.split(/\s+/).filter(Boolean).length;
  const tooShort = voiceText.length < VOICE_TEXT_MIN_CHARS || wordCount < VOICE_TEXT_MIN_WORDS;

  const currentScriptHash = calculateNormalizedHash(voiceText);

  // Round 53: BGM-led voice direction. Read the per-job BGM selection so the
  // voiceover is generated to match its mood, and so freshness considers the
  // voice direction (not just the script text).
  const bgmDir = readBgmDirection(workDir);
  const ttsSettings = bgmDir ? ttsSettingsForMood(bgmDir.bgmMood) : DEFAULT_VOICE_SETTINGS;

  // Freshness check in dry-run/plan mode:
  let freshnessStatus = 'NO_EXISTING_VOICE';
  let existingHash = '';
  let existingDirectionHash = '';
  let existingDirectionApplied = false;
  if (existsSync(voiceArtifactPath)) {
    try {
      const existing = JSON.parse(readFileSync(voiceArtifactPath, 'utf8'));
      existingHash = existing.scriptTextHash || '';
      existingDirectionHash = existing.voiceDirectionHash || '';
      existingDirectionApplied = existing.voiceDirectionApplied === true;
      if (!existingHash) {
        freshnessStatus = '⚠️ LEGACY_NO_HASH';
      } else if (existingHash !== currentScriptHash) {
        freshnessStatus = '⚠️ STALE';
      } else if (bgmDir && !existingDirectionApplied) {
        freshnessStatus = '⚠️ LEGACY_NO_VOICE_DIRECTION';
      } else if (bgmDir && existingDirectionHash !== bgmDir.voiceDirectionHash) {
        freshnessStatus = '⚠️ STALE_VOICE_DIRECTION';
      } else {
        freshnessStatus = '🟢 FRESH';
      }
    } catch {
      freshnessStatus = '⚠️ UNREADABLE_EXISTING_VOICE';
    }
  }

  const requestedModel = values.model ?? DEFAULT_MODEL;
  const wantsLive = !!values['confirm-api-call'] && !values['dry-run'];

  console.log('======================================================');
  console.log('🎙️  VFOS ElevenLabs v3 Voiceover Bridge');
  console.log('======================================================');
  if (jobId) {
    console.log(`Job ID:         ${jobId}`);
  } else {
    console.log(`Run:            ${runId}`);
  }
  console.log(`Work dir:       ${workDir}`);
  console.log(`Text source:    ${textSource}`);
  console.log(`Text length:    ${voiceText.length} chars / ${wordCount} words`);
  console.log(`Text preview:   ${voiceText.slice(0, 100)}${voiceText.length > 100 ? '…' : ''}`);
  console.log(`Current Hash:   ${currentScriptHash}`);
  console.log(`Existing Hash:  ${existingHash || '(none)'}`);
  console.log(`Freshness:      ${freshnessStatus}`);
  if (bgmDir) {
    console.log(`BGM mood:       ${bgmDir.bgmMood} (track ${bgmDir.bgmTrackId})`);
    console.log(`Voice dir:      ${JSON.stringify(bgmDir.voiceDirection)}`);
    console.log(`Voice dir hash: ${bgmDir.voiceDirectionHash}`);
    console.log(`TTS settings:   ${JSON.stringify(ttsSettings)}`);
  } else {
    console.log('BGM mood:       (no bgm_selection_artifact — voice direction NOT applied)');
  }
  console.log(`Model request:  ${requestedModel}`);
  console.log(`Audio out:      ${audioPath}`);
  console.log(`Timing out:     ${timingArtifactPath}`);
  console.log(`Artifact out:   ${voiceArtifactPath}`);
  console.log(
    `Sync fixture:   ${values['sync-fixture'] ? `→ ${FIXTURE_AUDIO_PATH}` : 'NO (use --sync-fixture)'}`,
  );
  console.log(`Mode:           ${wantsLive ? '⚡ LIVE API' : '🔍 DRY-RUN'}`);
  console.log('------------------------------------------------------');

  if (tooShort && !values['allow-short-script']) {
    const artifact = {
      ...buildBaseArtifact(
        effectiveRunId,
        requestedModel,
        textSource,
        voiceText.length,
        currentScriptHash,
      ),
      status: 'SCRIPT_TEXT_TOO_SHORT',
      apiCalled: false,
      tokensLogged: false,
      notes: `Voice text under threshold (chars=${voiceText.length} / words=${wordCount}). Use --allow-short-script to override.`,
    };
    writeArtifact(voiceArtifactPath, artifact);
    console.error('SCRIPT_TEXT_TOO_SHORT — voice text below threshold. Refusing to call API.');
    console.error(`  Minimum: ${VOICE_TEXT_MIN_CHARS} chars / ${VOICE_TEXT_MIN_WORDS} words`);
    console.error(`  Got:     ${voiceText.length} chars / ${wordCount} words`);
    console.error('  Pass --allow-short-script to bypass.');
    process.exit(1);
  }

  if (!wantsLive) {
    const artifact = {
      ...buildBaseArtifact(
        effectiveRunId,
        requestedModel,
        textSource,
        voiceText.length,
        currentScriptHash,
      ),
      status: 'DRY_RUN_PLAN_ONLY',
      apiCalled: false,
      tokensLogged: false,
      audioPath,
      timingArtifactPath,
      freshnessStatus,
      fixtureSyncedPath: values['sync-fixture'] ? FIXTURE_AUDIO_PATH : null,
      notes: 'Dry-run plan only. No API call. Pass --confirm-api-call to generate audio.',
    };
    writeArtifact(voiceArtifactPath, artifact);
    console.log('DRY-RUN complete. No API call. No audio written.');
    console.log(`Plan persisted: ${voiceArtifactPath}`);
    process.exit(0);
  }

  // ── LIVE PATH ─────────────────────────────────────────────────────────
  // Only read .env when we actually need to call the API.
  loadDotEnv();
  const apiKey = process.env['ELEVENLABS_API_KEY'];
  const voiceId = process.env['ELEVENLABS_VOICE_ID'];

  if (!apiKey || !voiceId) {
    const missing: string[] = [];
    if (!apiKey) missing.push('ELEVENLABS_API_KEY');
    if (!voiceId) missing.push('ELEVENLABS_VOICE_ID');
    const artifact = {
      ...buildBaseArtifact(effectiveRunId, requestedModel, textSource, voiceText.length),
      status: 'MISSING_CREDENTIALS',
      apiCalled: false,
      tokensLogged: false,
      missing,
      notes: 'API key or voice id missing in env. Configure .env and retry.',
    };
    writeArtifact(voiceArtifactPath, artifact);
    console.error(`MISSING_CREDENTIALS — missing: ${missing.join(', ')}`);
    console.error('  No API call attempted. No key logged.');
    process.exit(1);
  }

  console.log(`Voice ID:       ${maskVoiceId(voiceId)}`);
  console.log('Calling ElevenLabs /text-to-speech/.../with-timestamps …');

  let result = await callElevenLabsWithTimestamps({
    apiKey,
    voiceId,
    model: requestedModel,
    text: voiceText,
    voiceSettings: ttsSettings,
  });
  let modelUsed = requestedModel;

  if (
    !result.ok &&
    isModelUnsupportedError(result.status, result.reason) &&
    requestedModel === DEFAULT_MODEL
  ) {
    console.warn(
      `Model ${requestedModel} not available for with-timestamps. Falling back to ${FALLBACK_MODEL}.`,
    );
    result = await callElevenLabsWithTimestamps({
      apiKey,
      voiceId,
      model: FALLBACK_MODEL,
      text: voiceText,
      voiceSettings: ttsSettings,
    });
    modelUsed = FALLBACK_MODEL;
  }

  if (!result.ok) {
    const status = isModelUnsupportedError(result.status, result.reason)
      ? 'MODEL_NOT_AVAILABLE'
      : 'API_ERROR';
    const artifact = {
      ...buildBaseArtifact(effectiveRunId, modelUsed, textSource, voiceText.length),
      status,
      apiCalled: true,
      tokensLogged: false,
      voiceIdMasked: maskVoiceId(voiceId),
      httpStatus: result.status,
      reasonExcerpt: result.reason.slice(0, 200),
      notes:
        status === 'MODEL_NOT_AVAILABLE'
          ? 'Both eleven_v3 and fallback failed model-availability check. Verify ElevenLabs account tier.'
          : 'ElevenLabs API call failed. See reasonExcerpt for redacted detail.',
    };
    writeArtifact(voiceArtifactPath, artifact);
    console.error(`${status} — HTTP ${result.status}`);
    console.error(`  reason: ${result.reason.slice(0, 200)}`);
    process.exit(1);
  }

  // Decode base64 → mp3 buffer.
  const audioBuffer = Buffer.from(result.data.audio_base64, 'base64');
  mkdirSync(dirname(audioPath), { recursive: true });
  writeFileSync(audioPath, audioBuffer);

  // Persist timing artifact for caption sync round.
  const timingArtifact = {
    timingVersion: 'v2',
    runId: effectiveRunId,
    provider: 'elevenlabs',
    model: modelUsed,
    alignmentType: 'character',
    scriptTextHash: currentScriptHash,
    voiceDirectionHash: bgmDir?.voiceDirectionHash ?? null,
    alignment: {
      characters: result.data.alignment.characters,
      characterStartTimesSeconds: result.data.alignment.character_start_times_seconds,
      characterEndTimesSeconds: result.data.alignment.character_end_times_seconds,
    },
    normalizedAlignment: {
      characters: result.data.normalized_alignment.characters,
      characterStartTimesSeconds: result.data.normalized_alignment.character_start_times_seconds,
      characterEndTimesSeconds: result.data.normalized_alignment.character_end_times_seconds,
    },
    captionReady: true,
    generatedAt: new Date().toISOString(),
    notes: 'Use this artifact for kinetic captions in a later round.',
  };
  writeArtifact(timingArtifactPath, timingArtifact);

  let fixtureSyncedPath: string | null = null;
  if (values['sync-fixture']) {
    mkdirSync(dirname(FIXTURE_AUDIO_PATH), { recursive: true });
    copyFileSync(audioPath, FIXTURE_AUDIO_PATH);
    fixtureSyncedPath = FIXTURE_AUDIO_PATH;
  }

  const voiceArtifact = {
    ...buildBaseArtifact(
      effectiveRunId,
      modelUsed,
      textSource,
      voiceText.length,
      currentScriptHash,
    ),
    voiceIdMasked: maskVoiceId(voiceId),
    status: 'SUCCESS',
    freshnessStatus: 'FRESH',
    // Round 53: record the BGM-led voice direction that shaped this voiceover.
    bgmTrackId: bgmDir?.bgmTrackId ?? null,
    bgmMood: bgmDir?.bgmMood ?? null,
    voiceDirectionHash: bgmDir?.voiceDirectionHash ?? null,
    voiceDirectionApplied: bgmDir != null,
    voiceDirection: bgmDir?.voiceDirection ?? null,
    ttsSettings: { model: modelUsed, ...ttsSettings },
    audioPath,
    timingArtifactPath,
    fixtureSyncedPath,
    audioBytes: audioBuffer.length,
    apiCalled: true,
    tokensLogged: false,
    notes:
      (modelUsed === requestedModel
        ? 'Voiceover generated successfully.'
        : `Voiceover generated using fallback model ${modelUsed} after ${requestedModel} unavailable.`) +
      (bgmDir
        ? ` Voice direction applied for BGM mood "${bgmDir.bgmMood}".`
        : ' No BGM selection found — voice direction NOT applied.'),
  };
  writeArtifact(voiceArtifactPath, voiceArtifact);

  if (jobId && jobManifest) {
    jobManifest.artifacts.voiceArtifactPath = `${JOBS_ROOT}/${jobId}/voice_artifact.json`;
    jobManifest.artifacts.voiceTimingArtifactPath = `${JOBS_ROOT}/${jobId}/voice_timing_artifact.json`;
    jobManifest.updatedAt = new Date().toISOString();
    const manifestPath = join(workDir, 'job_manifest.json');
    writeFileSync(manifestPath, JSON.stringify(jobManifest, null, 2) + '\n', 'utf8');

    // Also update vfos_jobs_registry.json so the CLI listing reflects the correct updated state!
    const registryPath = resolve('data/temp/vfos_jobs_registry.json');
    if (existsSync(registryPath)) {
      try {
        const reg = JSON.parse(readFileSync(registryPath, 'utf8'));
        const idx = reg.jobs.findIndex((j: any) => j.jobId === jobId);
        if (idx >= 0) {
          reg.jobs[idx].updatedAt = jobManifest.updatedAt;
          writeFileSync(registryPath, JSON.stringify(reg, null, 2) + '\n', 'utf8');
        }
      } catch {}
    }
  }

  console.log('SUCCESS — voiceover.mp3 + timing artifact written.');
  console.log(`  model used: ${modelUsed}`);
  console.log(`  audio bytes: ${audioBuffer.length}`);
  console.log(`  alignment chars: ${result.data.alignment.characters.length}`);
  if (fixtureSyncedPath) console.log(`  fixture synced: ${fixtureSyncedPath}`);
  console.log('======================================================');
}

main().catch((err) => {
  console.error(`Unexpected error: ${(err as Error).message}`);
  process.exit(1);
});
