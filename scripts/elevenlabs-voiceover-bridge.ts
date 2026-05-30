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
 */

import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../packages/voice/src/load-env.js';

interface ScriptArtifact {
  hook3s?: string;
  voiceover?: string;
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
      const hook = (artifact.hook3s ?? '').trim();
      const voiceover = (artifact.voiceover ?? '').trim();
      const combined = [hook, voiceover].filter(Boolean).join(' ').trim();
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
      const hook = (pack.script?.hook3s ?? pack.hook ?? '').trim();
      const voiceover = (pack.script?.voiceover ?? pack.voiceover ?? '').trim();
      const combined = [hook, voiceover].filter(Boolean).join(' ').trim();
      if (combined) return { text: combined, source: 'operator_review_pack.json' };
    } catch (err) {
      return { error: `Failed to parse operator_review_pack.json: ${(err as Error).message}` };
    }
  }
  return { error: 'No script_artifact.json or operator_review_pack.json found with voiceover text' };
}

function writeArtifact(path: string, body: object): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(body, null, 2) + '\n', 'utf8');
}

function buildBaseArtifact(runId: string, model: string, textSource: string, textLength: number) {
  return {
    voiceArtifactVersion: 'v2',
    runId,
    provider: 'elevenlabs',
    model,
    languageCode: 'vi',
    textSource,
    textLength,
    generatedAt: new Date().toISOString(),
  };
}

async function callElevenLabsWithTimestamps(args: {
  apiKey: string;
  voiceId: string;
  model: string;
  text: string;
}): Promise<{ ok: true; data: WithTimestampsResponse } | { ok: false; status: number; reason: string }> {
  const url = `${ELEVENLABS_BASE}/text-to-speech/${args.voiceId}/with-timestamps`;
  const body = {
    text: args.text,
    model_id: args.model,
    voice_settings: {
      stability: 0.45,
      similarity_boost: 0.75,
      style: 0.35,
      use_speaker_boost: true,
    },
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
      return { ok: false, status: response.status, reason: 'response missing audio_base64 or alignment' };
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

  const runId = values.run;
  if (!runId) {
    console.error('Error: --run <runId> is required');
    process.exit(1);
  }

  const runDir = resolveRunDir(runId);
  const scriptRead = readScriptText(runDir);
  if ('error' in scriptRead) {
    console.error(`Error: ${scriptRead.error}`);
    process.exit(1);
  }
  const { text: voiceText, source: textSource } = scriptRead;
  const wordCount = voiceText.split(/\s+/).filter(Boolean).length;
  const tooShort = voiceText.length < VOICE_TEXT_MIN_CHARS || wordCount < VOICE_TEXT_MIN_WORDS;

  const audioPath = join(runDir, 'voiceover.mp3');
  const timingArtifactPath = join(runDir, 'voice_timing_artifact.json');
  const voiceArtifactPath = join(runDir, 'voice_artifact.json');

  const requestedModel = values.model ?? DEFAULT_MODEL;
  const wantsLive = !!values['confirm-api-call'] && !values['dry-run'];

  console.log('======================================================');
  console.log('🎙️  VFOS ElevenLabs v3 Voiceover Bridge');
  console.log('======================================================');
  console.log(`Run:            ${runId}`);
  console.log(`Run dir:        ${runDir}`);
  console.log(`Text source:    ${textSource}`);
  console.log(`Text length:    ${voiceText.length} chars / ${wordCount} words`);
  console.log(`Text preview:   ${voiceText.slice(0, 100)}${voiceText.length > 100 ? '…' : ''}`);
  console.log(`Model request:  ${requestedModel}`);
  console.log(`Audio out:      ${audioPath}`);
  console.log(`Timing out:     ${timingArtifactPath}`);
  console.log(`Artifact out:   ${voiceArtifactPath}`);
  console.log(`Sync fixture:   ${values['sync-fixture'] ? `→ ${FIXTURE_AUDIO_PATH}` : 'NO (use --sync-fixture)'}`);
  console.log(`Mode:           ${wantsLive ? '⚡ LIVE API' : '🔍 DRY-RUN'}`);
  console.log('------------------------------------------------------');

  if (tooShort && !values['allow-short-script']) {
    const artifact = {
      ...buildBaseArtifact(runId, requestedModel, textSource, voiceText.length),
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
      ...buildBaseArtifact(runId, requestedModel, textSource, voiceText.length),
      status: 'DRY_RUN_PLAN_ONLY',
      apiCalled: false,
      tokensLogged: false,
      audioPath,
      timingArtifactPath,
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
      ...buildBaseArtifact(runId, requestedModel, textSource, voiceText.length),
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
  });
  let modelUsed = requestedModel;

  if (!result.ok && isModelUnsupportedError(result.status, result.reason) && requestedModel === DEFAULT_MODEL) {
    console.warn(
      `Model ${requestedModel} not available for with-timestamps. Falling back to ${FALLBACK_MODEL}.`,
    );
    result = await callElevenLabsWithTimestamps({
      apiKey,
      voiceId,
      model: FALLBACK_MODEL,
      text: voiceText,
    });
    modelUsed = FALLBACK_MODEL;
  }

  if (!result.ok) {
    const status =
      isModelUnsupportedError(result.status, result.reason) ? 'MODEL_NOT_AVAILABLE' : 'API_ERROR';
    const artifact = {
      ...buildBaseArtifact(runId, modelUsed, textSource, voiceText.length),
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
    timingVersion: 'v1',
    runId,
    provider: 'elevenlabs',
    model: modelUsed,
    alignmentType: 'character',
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
    ...buildBaseArtifact(runId, modelUsed, textSource, voiceText.length),
    voiceIdMasked: maskVoiceId(voiceId),
    status: 'SUCCESS',
    audioPath,
    timingArtifactPath,
    fixtureSyncedPath,
    audioBytes: audioBuffer.length,
    apiCalled: true,
    tokensLogged: false,
    notes:
      modelUsed === requestedModel
        ? 'Voiceover generated successfully.'
        : `Voiceover generated using fallback model ${modelUsed} after ${requestedModel} unavailable.`,
  };
  writeArtifact(voiceArtifactPath, voiceArtifact);

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
