// PipelineContext — trạng thái dùng chung xuyên suốt các step của review pipeline
// (God-file anatomy N2/N4). Mọi biến cục bộ của main() cũ trở thành field ở đây;
// step nhận ctx, mutate ctx, side-effect + process.exit giữ nguyên như bản cũ.
//
// N4 — FIX DESYNC MANIFEST: bản cũ load manifest 1 LẦN đầu run; các subprocess
// (job:vision/job:script/voice:elevenlabs/caption…) ghi manifest MỚI xuống đĩa;
// mọi saveManifest sau đó của orchestrator ghi đè ngược bằng bản in-memory CŨ
// (root cause của SCRIPT_ARTIFACT_MISSING giả — comment dòng 1042 bản cũ).
// Fix: ctx.reloadManifest() đọc lại manifest từ đĩa — BẮT BUỘC gọi ngay sau khi
// bất kỳ subprocess nào chạy xong.

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AutoApproveVerdict } from '../core/auto-approve-core.js';
import { loadManifest } from '../core/manifest-io.js';
import { JOBS_ROOT } from '../core/paths.js';
import type { JobManifest } from '../core/types.js';
import type { StatusArtifact } from './status-artifact.js';

export const DEFAULT_RUN_ID = 'run_review_product_p9';
export const DEFAULT_CAPTION_PRESET = 'viral_review_v2';

// Round 51A: BGM là phần bắt buộc của khung render job; opt-out qua --allow-no-bgm.
export const BGM_REQUIRED_BY_DEFAULT = true;

export const VIDEO_FIXTURE_PATH = 'production/fixtures/sample_hero_video.mp4';
export const VOICE_FIXTURE_PATH = 'production/fixtures/sample_voiceover.mp3';

export interface BgmRenderAsset {
  selected: true;
  trackId: string;
  title: string;
  mood: string;
  localAudioPath: string;
  volumeMultiplier: number;
}

export interface PipelineFlags {
  runId: string;
  preset: string;
  jobId: string | null;
  dryRun: boolean;
  confirmOpenAi: boolean;
  confirmElevenLabs: boolean;
  allowNoBgm: boolean;
  skipScrubSubtitle: boolean;
  /** Override Operator-only (CLI, UI KHÔNG truyền): chạy tiếp dù vision phán
   * nguồn không dùng được. Mặc định false — gate chặn thật (Phần 77). */
  forceVisionUnusable: boolean;
  requestedVoice: 'female' | 'male' | null;
}

export interface PipelineContext extends PipelineFlags {
  // ---- shared fixture / run paths ----
  runDir: string;
  /** Output cuối kỳ vọng (job → captioned trong job dir; no-job → run dir). */
  expectedOutput: string;
  sharedVideoFixturePresent: boolean;
  voiceFixturePresent: boolean;

  // ---- job-local paths (null ở no-job mode) ----
  jobOutputDir: string | null;
  jobPreviewPath: string | null;
  jobCaptionedPath: string | null;
  jobRenderManifestPath: string | null;
  jobPreviewArtifactPath: string | null;
  jobCaptionPlanPath: string | null;
  jobAssPath: string | null;
  jobScriptPath: string | null;
  jobVoicePath: string | null;
  jobVoiceTimingPath: string | null;

  // ---- presence (mutable — script gate cập nhật scriptPresent) ----
  scriptPresent: boolean;
  jobVoicePresent: boolean;
  /** Set sau clean-source gate: job → jobSourceVideoPresent; no-job → fixture. */
  effectiveVideoPresent: boolean;
  effectiveVoicePresent: boolean;

  // ---- manifest state ----
  jobManifest: JobManifest | null;
  jobSourceVideoAbs: string | null;
  jobSourceVideoPresent: boolean | null;

  // ---- status artifact nền (dựng sau clean-source gate) ----
  baseArtifact: StatusArtifact;

  // ---- runtime progress flags (step mutate) ----
  elevenLabsApiCalled: boolean;
  chayExecuted: boolean;
  captionExecuted: boolean;
  bgmRequired: boolean;
  bgmRenderAsset: BgmRenderAsset | null;
  previewArtifact: StatusArtifact['previewArtifact'];
  outputExists: boolean;

  /** Phần 82 — verdict cổng AI auto-approve; null = gate off / chưa chạy (finalize
   *  giữ hành vi READY_FOR_OPERATOR_REVIEW như cũ). */
  autoApproveVerdict: AutoApproveVerdict | null;

  /** N4 — đồng bộ manifest từ đĩa lên memory (gọi sau MỌI subprocess). */
  reloadManifest(): void;
}

/**
 * Dựng context từ flags CLI — tương đương phần dẫn xuất path/presence của main()
 * cũ (H1, dòng 655–708). baseArtifact tạm khởi tạo rỗng-an-toàn; pipeline dựng
 * bản thật sau clean-source gate (đúng thứ tự bản cũ).
 */
export function createPipelineContext(flags: PipelineFlags): PipelineContext {
  const { runId, preset, jobId } = flags;

  const voiceFixturePresent = existsSync(resolve(VOICE_FIXTURE_PATH));
  const sharedVideoFixturePresent = existsSync(resolve(VIDEO_FIXTURE_PATH));

  const runDir = resolve('data/temp/pipeline-p9-demo', runId);
  const expectedOutputV2 = join(runDir, 'preview_with_captions_v2.mp4');
  const expectedOutputV1 = join(runDir, 'preview_with_captions.mp4');
  const expectedOutputShared = preset === 'viral_review_v2' ? expectedOutputV2 : expectedOutputV1;

  // Job-folder output paths (Round 38). Only used in job mode.
  const jobOutputDir = jobId ? resolve(JOBS_ROOT, jobId) : null;
  const jobPreviewPath = jobOutputDir ? join(jobOutputDir, 'preview.mp4') : null;
  const jobCaptionedPath = jobOutputDir
    ? join(jobOutputDir, `preview_with_captions${preset === 'viral_review_v2' ? '_v2' : ''}.mp4`)
    : null;
  const jobRenderManifestPath = jobOutputDir ? join(jobOutputDir, 'render_manifest.json') : null;
  const jobPreviewArtifactPath = jobOutputDir ? join(jobOutputDir, 'preview_artifact.json') : null;
  const jobCaptionPlanPath = jobOutputDir
    ? join(jobOutputDir, `kinetic_caption_plan${preset === 'viral_review_v2' ? '_v2' : ''}.json`)
    : null;
  const jobAssPath = jobOutputDir
    ? join(jobOutputDir, `kinetic_captions${preset === 'viral_review_v2' ? '_v2' : ''}.ass`)
    : null;

  // Job-local script/voice/timing (Round 39)
  const jobScriptPath = jobId ? resolve(JOBS_ROOT, jobId, 'script_artifact.json') : null;
  const jobVoicePath = jobId ? resolve(JOBS_ROOT, jobId, 'voiceover.mp3') : null;
  const jobVoiceTimingPath = jobId ? resolve(JOBS_ROOT, jobId, 'voice_timing_artifact.json') : null;

  const scriptPresent = jobScriptPath ? existsSync(jobScriptPath) : true;
  const jobVoicePresent =
    jobVoicePath && jobVoiceTimingPath
      ? existsSync(jobVoicePath) && existsSync(jobVoiceTimingPath)
      : false;

  const expectedOutput = jobId && jobCaptionedPath ? jobCaptionedPath : expectedOutputShared;

  const jobManifest = jobId ? loadManifest(jobId) : null;

  const ctx: PipelineContext = {
    ...flags,
    runDir,
    expectedOutput,
    sharedVideoFixturePresent,
    voiceFixturePresent,
    jobOutputDir,
    jobPreviewPath,
    jobCaptionedPath,
    jobRenderManifestPath,
    jobPreviewArtifactPath,
    jobCaptionPlanPath,
    jobAssPath,
    jobScriptPath,
    jobVoicePath,
    jobVoiceTimingPath,
    scriptPresent,
    jobVoicePresent,
    effectiveVideoPresent: false, // set thật sau clean-source gate (thứ tự bản cũ)
    effectiveVoicePresent: jobId ? jobVoicePresent : voiceFixturePresent,
    jobManifest,
    jobSourceVideoAbs: null,
    jobSourceVideoPresent: null,
    baseArtifact: buildBaseArtifact({
      runId,
      jobId,
      preset,
      videoFixturePresent: sharedVideoFixturePresent,
      voiceFixturePresent: jobId ? jobVoicePresent : voiceFixturePresent,
      jobSourceVideoPresent: null,
    }),
    elevenLabsApiCalled: false,
    chayExecuted: false,
    captionExecuted: false,
    bgmRequired: false,
    bgmRenderAsset: null,
    previewArtifact: null,
    outputExists: false,
    autoApproveVerdict: null,
    reloadManifest(): void {
      if (this.jobId) this.jobManifest = loadManifest(this.jobId);
    },
  };
  return ctx;
}

/** Dựng StatusArtifact nền (tương đương baseArtifact main() cũ, dòng 834–855). */
export function buildBaseArtifact(input: {
  runId: string;
  jobId: string | null;
  preset: string;
  videoFixturePresent: boolean;
  voiceFixturePresent: boolean;
  jobSourceVideoPresent: boolean | null;
}): StatusArtifact {
  return {
    statusVersion: 'v1',
    runId: input.runId,
    jobId: input.jobId,
    state: 'READY_FOR_OPERATOR_VIDEO_REVIEW',
    videoFixturePresent: input.videoFixturePresent,
    voiceFixturePresent: input.voiceFixturePresent,
    jobSourceVideoPresent: input.jobSourceVideoPresent,
    elevenLabsApiCalled: false,
    chayExecuted: false,
    captionExecuted: false,
    captionPreset: input.preset,
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
}
