// @vfos/video-engine — types (RFC docs/RFC_VIDEO_RENDERER.md §2). PURE, không runtime.
// Layering: KHÔNG import scripts/ hay @vfos/ai-agents → định nghĩa LẠI subset của
// RenderPlan mà renderer cần (structural typing: object RenderPlan thật vẫn khớp ở
// biên CLI). Cùng shape với @vfos/ai-agents RenderPlan để CLI bơm thẳng.

export type VideoFit = 'cover' | 'contain';

export interface RenderCanvas {
  width: number;
  height: number;
  fps: number;
}

export interface RenderVideoSourceInput {
  path: string;
  trimStartSec: number;
  trimEndSec: number;
  fit: VideoFit;
}

export interface RenderAudioInput {
  voiceoverPath: string;
  voiceGainDb: number;
  /** null = chưa chọn BGM → renderer chạy voice-only. */
  bgmPath: string | null;
  bgmGainDb: number;
  /** true = dùng sidechaincompress (giọng dìm nhạc); false = amix volume tĩnh. */
  duckUnderVoice: boolean;
}

export interface SubtitleCueInput {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
}

export interface SubtitleStyleInput {
  font: string;
  sizePx: number;
  /** '#RRGGBB'. */
  primary: string;
  /** '#RRGGBB'. */
  outline: string;
  outlineWidth: number;
  /** 'lower-third' | 'center' | 'top'. */
  position: string;
  maxWordsPerLine: number;
  safeAreaBottomPct: number;
}

/** Subset của @vfos/ai-agents RenderPlan mà cỗ máy render tiêu thụ. */
export interface RenderPlanInput {
  jobId: string;
  canvas: RenderCanvas;
  durationSec: number;
  videoSource: RenderVideoSourceInput;
  audio: RenderAudioInput;
  subtitles: SubtitleCueInput[];
  subtitleStyle: SubtitleStyleInput;
  output: { path: string };
}

/** 1 đầu vào `-i` cho ffmpeg. */
export interface FfmpegInput {
  path: string;
}

/** Kết quả dựng graph THUẦN — chưa ráp thành lệnh, dùng để test cú pháp filter. */
export interface FilterGraph {
  filterComplex: string;
  /** nhãn video ra: '[vout]' (có sub) hoặc '[base]' (không sub). */
  videoMap: string;
  /** nhãn audio ra: '[aout]'. */
  audioMap: string;
}

/** Bản kế hoạch ffmpeg hoàn chỉnh (runner R2 sẽ ráp thành argv + spawn). */
export interface FfmpegPlan {
  inputs: FfmpegInput[];
  filterComplex: string;
  /** ['[vout]','[aout]'] — thứ tự `-map`. */
  maps: string[];
  /** cờ encode (codec/preset/crf/-t/-r/-y…). */
  encodeArgs: string[];
  outputPath: string;
  durationSec: number;
  /** tên file .ass (runner ghi vào cwd, filter tham chiếu path tương đối). */
  assFileName: string;
  hasSubtitles: boolean;
}

export interface BuildOptions {
  /** Ghi đè tên file phụ đề .ass (mặc định 'render_subs.ass'). */
  assFileName?: string;
}

/** Kết quả render (contract cho runner R2 — R1 chỉ khai báo, chưa dựng). */
export interface RenderResult {
  ok: boolean;
  outputPath: string;
  exitCode: number;
  durationSec: number;
  subtitleTiming: 'perfect_match' | 'proportional_fallback';
  warnings: string[];
  stderrTail?: string;
}
