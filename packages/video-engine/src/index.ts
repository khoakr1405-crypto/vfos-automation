// @vfos/video-engine — public surface (RFC docs/RFC_VIDEO_RENDERER.md).
// R1: PURE core (filter-graph + ass-writer). R2 sẽ thêm ffmpeg-runner (I/O).

export type {
  BuildOptions,
  FfmpegInput,
  FfmpegPlan,
  FilterGraph,
  RenderAudioInput,
  RenderCanvas,
  RenderPlanInput,
  RenderResult,
  RenderVideoSourceInput,
  SubtitleCueInput,
  SubtitleStyleInput,
  VideoFit,
} from './types.js';
export { buildFfmpegPlan, buildFilterGraph, dbToLinear } from './filter-graph.js';
export { buildAss } from './ass-writer.js';
