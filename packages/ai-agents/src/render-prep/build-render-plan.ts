// Render Plan Builder (RFC §3) — LOGIC THUẦN, không fs/API. Ráp RenderPlan chuẩn
// từ các đầu vào đã tính sẵn (subtitles đã khớp thời gian, đường dẫn asset).
// KHÔNG đọc/ghi file, KHÔNG probe media — chỉ dựng object.

import { MAX_SUBTITLE_WORDS } from '../script-claim-safety/subtitle-chunker.js';
import type { RenderCanvas, RenderPlan, SubtitleCue, SubtitleStyle } from './types.js';

const DEFAULT_CANVAS: RenderCanvas = { width: 1080, height: 1920, fps: 30 };

const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  font: 'Montserrat-SemiBold',
  sizePx: 54,
  primary: '#FFFFFF',
  outline: '#000000',
  outlineWidth: 3,
  position: 'lower-third',
  maxWordsPerLine: MAX_SUBTITLE_WORDS,
  safeAreaBottomPct: 12,
};

// Đường xuất mặc định: đặt preview.mp4 cạnh file audio (thay tên file cuối), tránh
// hardcode jobs-root trong package thuần.
function deriveOutputPath(audioPath: string): string {
  return audioPath.replace(/[^/\\]+$/, 'preview.mp4');
}

export function buildRenderPlan(
  jobId: string,
  durationSec: number,
  subtitles: SubtitleCue[],
  videoSourcePath: string,
  audioPath: string,
): RenderPlan {
  return {
    renderPlanVersion: 'v1',
    jobId,
    canvas: { ...DEFAULT_CANVAS },
    durationSec,
    videoSource: {
      path: videoSourcePath,
      trimStartSec: 0,
      trimEndSec: durationSec,
      fit: 'cover',
    },
    audio: {
      voiceoverPath: audioPath,
      voiceGainDb: 0,
      bgmPath: null,
      bgmGainDb: -18,
      duckUnderVoice: true,
    },
    subtitles,
    subtitleStyle: { ...DEFAULT_SUBTITLE_STYLE },
    overlays: [],
    output: { path: deriveOutputPath(audioPath) },
  };
}
