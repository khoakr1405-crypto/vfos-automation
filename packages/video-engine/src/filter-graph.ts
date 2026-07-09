// filter-graph (RFC §3) — LOGIC THUẦN, KHÔNG fs/child_process. Ánh xạ RenderPlan →
// chuỗi ffmpeg `filter_complex` + danh sách inputs + cờ encode. Test bằng string
// assertion, không cần chạy ffmpeg.

import type {
  BuildOptions,
  FfmpegInput,
  FfmpegPlan,
  FilterGraph,
  RenderAudioInput,
  RenderCanvas,
  RenderPlanInput,
  VideoFit,
} from './types.js';

// Công thức ducking tái dùng nguyên từ lane Giải trí (ent-vlog/15-audio-ambient-full.ts:168).
const DUCK_PARAMS = 'threshold=0.06:ratio=6:attack=15:release=350';
const DEFAULT_ASS_FILE = 'render_subs.ass';

// Bộ cờ encode chuẩn repo (kinetic-caption-renderer/offline-render-video-demo).
const VIDEO_ENCODE = ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'medium', '-crf', '20'];
const AUDIO_ENCODE = ['-c:a', 'aac'];

/** dB → hệ số tuyến tính cho filter `volume=`. 0dB→'1', −18dB→'0.1259'. */
export function dbToLinear(db: number): string {
  if (db === 0) return '1';
  return String(Number((10 ** (db / 20)).toFixed(4)));
}

function buildVideoChain(
  canvas: RenderCanvas,
  fit: VideoFit,
  hasSubtitles: boolean,
  assFileName: string,
): { chain: string; outLabel: string } {
  const { width: w, height: h, fps } = canvas;
  const scaleCrop =
    fit === 'contain'
      ? `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2:color=black`
      : `scale=${w}:${h}:force_original_aspect_ratio=increase,crop=${w}:${h}`;
  const base = `[0:v]${scaleCrop},setsar=1,fps=${fps}[base]`;
  if (!hasSubtitles) return { chain: base, outLabel: '[base]' };
  return { chain: `${base};[base]subtitles=${assFileName}[vout]`, outLabel: '[vout]' };
}

function buildAudioChain(audio: RenderAudioInput): { chain: string; outLabel: string } {
  const vg = dbToLinear(audio.voiceGainDb);

  // Voice-only: chưa có BGM.
  if (audio.bgmPath === null) {
    return { chain: `[1:a]volume=${vg}[aout]`, outLabel: '[aout]' };
  }

  const bg = dbToLinear(audio.bgmGainDb);

  // Có BGM + ducking: giọng đọc là key dìm nhạc nền (sidechaincompress).
  if (audio.duckUnderVoice) {
    const chain = [
      `[1:a]volume=${vg},asplit=2[vkey][vmix]`,
      `[2:a]volume=${bg}[bgm]`,
      `[bgm][vkey]sidechaincompress=${DUCK_PARAMS}[bgmduck]`,
      '[bgmduck][vmix]amix=inputs=2:normalize=0:dropout_transition=0[aout]',
    ].join(';');
    return { chain, outLabel: '[aout]' };
  }

  // Có BGM nhưng trộn tĩnh (không duck) — mẫu packages/voice/scripts/bgm-mix.ts.
  const chain = [
    `[1:a]volume=${vg}[vo]`,
    `[2:a]volume=${bg}[bgm]`,
    '[vo][bgm]amix=inputs=2:duration=first:normalize=0[aout]',
  ].join(';');
  return { chain, outLabel: '[aout]' };
}

/** Dựng graph THUẦN (chỉ chuỗi filter + nhãn map). Không ráp lệnh, không I/O. */
export function buildFilterGraph(
  plan: RenderPlanInput,
  assFileName: string = DEFAULT_ASS_FILE,
): FilterGraph {
  const hasSubtitles = plan.subtitles.length > 0;
  const video = buildVideoChain(plan.canvas, plan.videoSource.fit, hasSubtitles, assFileName);
  const audio = buildAudioChain(plan.audio);
  return {
    filterComplex: `${video.chain};${audio.chain}`,
    videoMap: video.outLabel,
    audioMap: audio.outLabel,
  };
}

/** Ráp bản kế hoạch ffmpeg đầy đủ (inputs + filter + encode + output). Vẫn THUẦN. */
export function buildFfmpegPlan(plan: RenderPlanInput, opts: BuildOptions = {}): FfmpegPlan {
  const assFileName = opts.assFileName ?? DEFAULT_ASS_FILE;
  const hasSubtitles = plan.subtitles.length > 0;
  const graph = buildFilterGraph(plan, assFileName);

  const inputs: FfmpegInput[] = [
    { path: plan.videoSource.path },
    { path: plan.audio.voiceoverPath },
  ];
  if (plan.audio.bgmPath !== null) inputs.push({ path: plan.audio.bgmPath });

  const encodeArgs = [
    ...VIDEO_ENCODE,
    ...AUDIO_ENCODE,
    '-r',
    String(plan.canvas.fps),
    '-t',
    plan.durationSec.toFixed(3),
    '-movflags',
    '+faststart',
    '-y',
  ];

  return {
    inputs,
    filterComplex: graph.filterComplex,
    maps: [graph.videoMap, graph.audioMap],
    encodeArgs,
    outputPath: plan.output.path,
    durationSec: plan.durationSec,
    assFileName,
    hasSubtitles,
  };
}
