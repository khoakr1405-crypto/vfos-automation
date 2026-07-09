// Render-prep types (RFC §3 — stage render-prep). PURE types, không runtime.
// Layering: packages/ KHÔNG import scripts/ → EdgeWord được ĐỊNH NGHĨA LẠI ở đây
// (cùng shape với tts-provider.ts EdgeWord); CLI về sau tự adapt khi bơm word timing.

/** Ranh giới 1 từ do TTS trả về — thời gian tương đối so với đầu đoạn audio. */
export interface EdgeWord {
  text: string;
  offsetSec: number;
  durationSec: number;
}

/** 1 dòng phụ đề đã gắn thời gian (sẵn sàng xuất SRT/ASS hoặc feed Remotion). */
export interface SubtitleCue {
  index: number;
  text: string;
  startSec: number;
  endSec: number;
}

/**
 * Chất lượng khớp thời gian phụ đề trong render_plan:
 *   - 'perfect_match'        = Tầng A khớp từng từ (chính xác tuyệt đối).
 *   - 'proportional_fallback'= Tầng B chia theo tỉ lệ (TTS lệch số từ; timing xấp xỉ).
 */
export type SubtitleTiming = 'perfect_match' | 'proportional_fallback';

export interface RenderCanvas {
  width: number;
  height: number;
  fps: number;
}

export interface RenderVideoSource {
  path: string;
  trimStartSec: number;
  trimEndSec: number;
  /** 'cover' = fill khung 9:16 (crop), 'contain' = fit trọn (letterbox). */
  fit: 'cover' | 'contain';
}

export interface RenderAudio {
  voiceoverPath: string;
  voiceGainDb: number;
  /** null khi chưa chọn BGM (BGM là bước riêng, không bắt buộc ở render-prep). */
  bgmPath: string | null;
  bgmGainDb: number;
  duckUnderVoice: boolean;
}

export interface SubtitleStyle {
  font: string;
  sizePx: number;
  primary: string;
  outline: string;
  outlineWidth: number;
  position: string;
  maxWordsPerLine: number;
  safeAreaBottomPct: number;
}

export interface RenderOverlay {
  type: string;
  text: string;
  startSec: number;
  endSec: number;
}

export interface RenderOutput {
  path: string;
}

/** Manifest khai báo renderer-agnostic — cả FFmpeg lẫn Remotion đọc cùng 1 cue-list. */
export interface RenderPlan {
  renderPlanVersion: 'v1';
  jobId: string;
  canvas: RenderCanvas;
  durationSec: number;
  videoSource: RenderVideoSource;
  audio: RenderAudio;
  subtitles: SubtitleCue[];
  subtitleStyle: SubtitleStyle;
  /** Ghi nhận khớp-từng-từ hay đã rơi về chia-tỉ-lệ (downstream biết timing xấp xỉ). */
  subtitleTiming: SubtitleTiming;
  overlays: RenderOverlay[];
  output: RenderOutput;
}
