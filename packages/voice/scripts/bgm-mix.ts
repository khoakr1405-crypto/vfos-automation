#!/usr/bin/env tsx
/**
 * BGM Mix v0 — mix instrumental background music with block-synced voice timeline.
 *
 * Usage:
 *   pnpm bgm:mix --source-video <mp4> --voice-timeline <mp3> --output-dir <dir> [options]
 *
 * Options:
 *   --source-video     Source video MP4 (required)
 *   --voice-timeline   Block-synced voice MP3 (required)
 *   --output-dir       Output directory (required)
 *   --video-id         Video ID for artifact naming (required)
 *   --bgm-file         Existing BGM instrumental MP3 (optional — generates if omitted)
 *   --bgm-volume       BGM volume multiplier 0.0–1.0, default 0.15 (≈ -16.5 dB)
 *   --bgm-fadein       Fade-in duration in seconds, default 1.5
 *   --bgm-fadeout      Fade-out duration in seconds, default 3.0
 *   --duration         Video duration in seconds (default: auto-detect from source-video)
 *   --skip-generate    Skip BGM generation even if no --bgm-file (fail instead)
 *   --bgm-prompt       Custom text prompt for ElevenLabs sound-generation (overrides default)
 *   --final-gain       Multiplier applied to the final mixed output (default 1.0). Use 1.3 for +30% loudness.
 *   --voice-gain       Multiplier applied to voice track before mixing (default 1.0). Use 1.2 for +20% voice.
 */

import { parseArgs } from 'node:util';
import { writeFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve, join, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadDotEnv } from '../src/load-env.js';

loadDotEnv();

// ── Args ─────────────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    'source-video':   { type: 'string' },
    'voice-timeline': { type: 'string' },
    'output-dir':     { type: 'string' },
    'video-id':       { type: 'string' },
    'bgm-file':       { type: 'string' },
    'bgm-volume':     { type: 'string', default: '0.15' },
    'bgm-fadein':     { type: 'string', default: '1.5' },
    'bgm-fadeout':    { type: 'string', default: '3.0' },
    duration:         { type: 'string' },
    'skip-generate':  { type: 'boolean', default: false },
    'bgm-prompt':     { type: 'string' },
    'final-gain':     { type: 'string', default: '1.0' },
    'voice-gain':     { type: 'string', default: '1.0' },
  },
  allowPositionals: false,
  strict: true,
});

if (!values['source-video'])   { console.error('Error: --source-video required');   process.exit(1); }
if (!values['voice-timeline']) { console.error('Error: --voice-timeline required'); process.exit(1); }
if (!values['output-dir'])     { console.error('Error: --output-dir required');     process.exit(1); }
if (!values['video-id'])       { console.error('Error: --video-id required');       process.exit(1); }

const sourceVideoPath   = resolve(values['source-video']!);
const voiceTimelinePath = resolve(values['voice-timeline']!);
const outputDir         = resolve(values['output-dir']!);
const videoId           = values['video-id']!;
const bgmVolume         = parseFloat(values['bgm-volume']!);
const bgmFadeIn         = parseFloat(values['bgm-fadein']!);
const bgmFadeOut        = parseFloat(values['bgm-fadeout']!);
const finalGain         = parseFloat(values['final-gain']!);
const voiceGain         = parseFloat(values['voice-gain']!);

if (!existsSync(sourceVideoPath))   { console.error(`Error: source video not found: ${sourceVideoPath}`);   process.exit(1); }
if (!existsSync(voiceTimelinePath)) { console.error(`Error: voice timeline not found: ${voiceTimelinePath}`); process.exit(1); }

await mkdir(outputDir, { recursive: true });

// ── Probe video duration ──────────────────────────────────────────────────────

function ffprobeJson(filePath: string): any {
  const r = spawnSync('ffprobe', ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath], { encoding: 'utf-8' });
  if (r.status !== 0) throw new Error(`ffprobe failed: ${r.stderr}`);
  return JSON.parse(r.stdout);
}

const videoDurationS = values.duration
  ? parseFloat(values.duration)
  : parseFloat(ffprobeJson(sourceVideoPath).format.duration);

console.log('');
console.log('── BGM Mix v0 ──────────────────────────────────────────────');
console.log(`  Video ID   : ${videoId}`);
console.log(`  Duration   : ${videoDurationS}s`);
console.log(`  BGM vol    : ${bgmVolume} (~${(20 * Math.log10(bgmVolume)).toFixed(1)} dBFS)`);
console.log(`  Voice gain : ${voiceGain}x (~${(20 * Math.log10(voiceGain)).toFixed(1)} dB)`);
console.log(`  Final gain : ${finalGain}x (~${(20 * Math.log10(finalGain)).toFixed(1)} dB)`);
console.log(`  Fade in/out: ${bgmFadeIn}s / ${bgmFadeOut}s`);
console.log(`  Output dir : ${outputDir}`);
console.log('');

// ── BGM source ────────────────────────────────────────────────────────────────

let bgmFilePath: string;

if (values['bgm-file']) {
  bgmFilePath = resolve(values['bgm-file']!);
  if (!existsSync(bgmFilePath)) {
    console.error(`Error: --bgm-file not found: ${bgmFilePath}`);
    process.exit(1);
  }
  console.log(`  BGM source : ${bgmFilePath} (provided)`);
} else if (values['skip-generate']) {
  console.error('Error: no --bgm-file provided and --skip-generate is set');
  process.exit(1);
} else {
  // Generate via ElevenLabs Sound Generation API
  const apiKey = process.env['ELEVENLABS_API_KEY'];
  if (!apiKey) {
    console.error('Error: ELEVENLABS_API_KEY not set — cannot generate BGM');
    console.error('  Either set the key or pass --bgm-file <path>');
    process.exit(1);
  }

  bgmFilePath = join(outputDir, `${videoId}_bgm_v1_generated.mp3`);
  const bgmPrompt = values['bgm-prompt'] ??
    'upbeat energetic light background music instrumental no vocals kitchen gadget review TikTok Reels style clean rhythm bright tone supports spoken narration';

  console.log('  Generating BGM via ElevenLabs Sound Generation API…');
  console.log(`  Prompt     : ${bgmPrompt.slice(0, 80)}${bgmPrompt.length > 80 ? '…' : ''}`);

  const body = JSON.stringify({ text: bgmPrompt, duration_seconds: 22, prompt_influence: 0.3 });
  const bodyFile = join(outputDir, '_bgm_body.json');
  await writeFile(bodyFile, body, 'utf-8');

  const curlResult = spawnSync('curl', [
    '-s', '-o', bgmFilePath,
    '-w', '%{http_code}',
    '-X', 'POST', 'https://api.elevenlabs.io/v1/sound-generation',
    '-H', `xi-api-key: ${apiKey}`,
    '-H', 'Content-Type: application/json',
    '--data-binary', `@${bodyFile}`,
  ], { encoding: 'utf-8' });

  const httpStatus = curlResult.stdout.trim();

  if (httpStatus !== '200' || !existsSync(bgmFilePath)) {
    console.error(`Error: BGM generation failed (HTTP ${httpStatus})`);
    if (existsSync(bgmFilePath)) {
      const errBody = await readFile(bgmFilePath, 'utf-8').catch(() => '(unreadable)');
      console.error(`  Response: ${errBody.slice(0, 200)}`);
    }
    process.exit(1);
  }

  const bgmProbe = ffprobeJson(bgmFilePath).format;
  console.log(`  BGM saved  : ${bgmFilePath}`);
  console.log(`  BGM probe  : ${parseFloat(bgmProbe.duration).toFixed(2)}s, ${Math.round(parseInt(bgmProbe.bit_rate) / 1000)}kb/s`);

  // Clean up temp body file
  const { unlink } = await import('node:fs/promises');
  await unlink(bodyFile).catch(() => {});
}

// ── Mix audio (voice + looped BGM) ───────────────────────────────────────────

const mixedAudioPath = join(outputDir, `${videoId}_voice_bgm_mixed.mp3`);
const fadeOutStart   = videoDurationS - bgmFadeOut;

console.log('');
process.stdout.write('  Mixing voice + BGM… ');

// filter_complex:
//   [0:a] → voice gain → [voice]
//   [1:a] → atrim/fade/volume → [bgm]
//   [voice][bgm] → amix normalize=0 → final gain → [out]
const filterComplex = [
  `[0:a]volume=${voiceGain}[voice]`,
  `[1:a]atrim=duration=${videoDurationS},afade=t=in:st=0:d=${bgmFadeIn},afade=t=out:st=${fadeOutStart}:d=${bgmFadeOut},volume=${bgmVolume}[bgm]`,
  `[voice][bgm]amix=inputs=2:duration=first:normalize=0,volume=${finalGain}[out]`,
].join(';');

const mixArgs = [
  '-y',
  '-i', voiceTimelinePath,
  '-stream_loop', '-1', '-i', bgmFilePath,
  '-filter_complex', filterComplex,
  '-map', '[out]',
  '-t', String(videoDurationS),
  '-ar', '44100',
  '-b:a', '128k',
  mixedAudioPath,
];

const mixResult = spawnSync('ffmpeg', mixArgs, { encoding: 'utf-8' });
if (mixResult.status !== 0) {
  console.error('FAILED');
  console.error(mixResult.stderr?.slice(-800));
  process.exit(1);
}
console.log('done');
console.log(`  Mixed audio: ${mixedAudioPath}`);

// ── Render preview MP4 ────────────────────────────────────────────────────────

const previewPath = join(outputDir, `${videoId}_voice_blocks_bgm_v1_preview_vi.mp4`);

process.stdout.write('  Rendering preview MP4… ');

const renderArgs = [
  '-y',
  '-i', sourceVideoPath,
  '-i', mixedAudioPath,
  '-map', '0:v',
  '-map', '1:a',
  '-c:v', 'copy',
  '-c:a', 'aac',
  '-b:a', '128k',
  '-shortest',
  previewPath,
];

const renderResult = spawnSync('ffmpeg', renderArgs, { encoding: 'utf-8' });
if (renderResult.status !== 0) {
  console.error('FAILED');
  console.error(renderResult.stderr?.slice(-800));
  process.exit(1);
}
console.log('done');
console.log(`  Preview    : ${previewPath}`);

// ── QC ───────────────────────────────────────────────────────────────────────

console.log('');
console.log('── QC ──────────────────────────────────────────────────────');

const previewProbe = ffprobeJson(previewPath);
const streams: any[] = previewProbe.streams;
const videoStream = streams.find((s: any) => s.codec_type === 'video');
const audioStream = streams.find((s: any) => s.codec_type === 'audio');

console.log(`  Streams    : ${streams.length} (video=${videoStream?.codec_name}, audio=${audioStream?.codec_name})`);
console.log(`  Duration   : video=${parseFloat(videoStream?.duration ?? '0').toFixed(2)}s, audio=${parseFloat(audioStream?.duration ?? '0').toFixed(2)}s`);
console.log(`  Resolution : ${videoStream?.width}x${videoStream?.height}`);

// Check for source audio stream (potential original audio leak)
const hasSourceAudio = previewProbe.format?.tags?.['ENCODER']?.includes?.('SoundHandler');
console.log(`  Source audio leak: ${hasSourceAudio ? 'DETECTED (check manually)' : 'none detected'}`);

// Volumedetect on the mixed audio
const volDetectResult = spawnSync('ffmpeg', [
  '-i', previewPath,
  '-af', 'volumedetect',
  '-vn', '-f', 'null', '-',
], { encoding: 'utf-8' });

const volLines = (volDetectResult.stderr ?? '')
  .split('\n')
  .filter(l => l.includes('volumedetect') || l.includes('mean_volume') || l.includes('max_volume'));
volLines.forEach(l => console.log(`  ${l.trim()}`));

// ── Write manifest ────────────────────────────────────────────────────────────

const manifest = {
  video_id:            videoId,
  generated_at:        new Date().toISOString(),
  source_video:        sourceVideoPath,
  voice_timeline:      voiceTimelinePath,
  bgm_source:          bgmFilePath,
  bgm_generated:       !values['bgm-file'],
  bgm_prompt:          values['bgm-file'] ? null : (values['bgm-prompt'] ?? 'default upbeat instrumental'),
  bgm_volume:          bgmVolume,
  bgm_volume_db:       parseFloat((20 * Math.log10(bgmVolume)).toFixed(1)),
  bgm_fadein_s:        bgmFadeIn,
  bgm_fadeout_s:       bgmFadeOut,
  voice_gain:          voiceGain,
  voice_gain_db:       parseFloat((20 * Math.log10(voiceGain)).toFixed(1)),
  final_gain:          finalGain,
  final_gain_db:       parseFloat((20 * Math.log10(finalGain)).toFixed(1)),
  video_duration_s:    videoDurationS,
  mixed_audio:         mixedAudioPath,
  preview_mp4:         previewPath,
  streams: {
    video: videoStream?.codec_name,
    audio: audioStream?.codec_name,
    video_duration_s: parseFloat(videoStream?.duration ?? '0'),
    audio_duration_s: parseFloat(audioStream?.duration ?? '0'),
  },
};

const manifestPath = join(outputDir, `${videoId}_bgm_mix_manifest.json`);
await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
console.log('');
console.log(`  Manifest   : ${manifestPath}`);
console.log('');
console.log('── Done ────────────────────────────────────────────────────');
console.log(`  Preview MP4 : ${previewPath}`);
console.log('');
