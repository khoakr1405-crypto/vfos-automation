// E1 step 02 — ASR the Chinese source audio (whisper-1, segment timestamps).
// Reuses the OpenAI Whisper plumbing pattern from scripts/job-final-qa-gate.ts.
//   pnpm tsx scripts/ent-vlog/02-asr-zh.ts --id ent_squid_001
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import { transcribeZh } from './lib/openai.js';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug>');
    process.exit(1);
  }
  const dir = workDir(id);
  const metaPath = join(dir, 'source_meta.json');
  if (!existsSync(metaPath)) {
    console.error('🛑 source_meta.json missing — chạy 01-fetch-source trước.');
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { path: string; hasAudio?: boolean };
  if (meta.hasAudio === false) {
    console.error('🛑 NO_AUDIO_STREAM: video không có tiếng nói để bóc lời.');
    process.exit(2);
  }

  const apiKey = requireOpenAIKey();

  // Extract mono 16kHz mp3 (small, whisper-friendly, stays < 25MB limit).
  const audioPath = join(dir, 'source_audio_zh.mp3');
  console.log('[02] Extracting audio (mono 16kHz)…');
  const ex = spawnSync('ffmpeg', [
    '-y',
    '-i',
    meta.path,
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '-b:a',
    '64k',
    audioPath,
  ]);
  if (ex.status !== 0) {
    console.error(`🛑 AUDIO_EXTRACT_FAILED: ${ex.stderr?.toString().slice(-800)}`);
    process.exit(3);
  }

  console.log('[02] Calling whisper-1 (language=zh, segment timestamps)…');
  const asr = await transcribeZh(apiKey, audioPath);

  // Cleanup the temp audio (keep artifacts lean).
  try {
    if (existsSync(audioPath)) unlinkSync(audioPath);
  } catch {
    /* ignore */
  }

  const out = {
    videoId: id,
    language: asr.language,
    durationSec: asr.durationSec,
    segmentCount: asr.segments.length,
    fullText: asr.text,
    segments: asr.segments,
    transcribedAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, 'asr_zh.json'), JSON.stringify(out, null, 2));

  console.log('------------------------------------------------------');
  console.log(`[02] ✅ ASR done: ${asr.segments.length} đoạn, ${asr.text.length} ký tự Trung`);
  console.log(`     audio dur: ${asr.durationSec.toFixed(1)}s`);
  if (asr.segments.length === 0 || asr.text.length < 10) {
    console.log('     ⚠ Rất ít/không có lời nói — clip có thể chủ yếu nhạc nền/chữ trên màn.');
  } else {
    const preview = asr.segments.slice(0, 3).map((s) => `[${s.start.toFixed(0)}s] ${s.text}`);
    console.log('     preview:');
    for (const p of preview) console.log(`       ${p}`);
  }
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
