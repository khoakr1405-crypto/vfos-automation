// Status artifact của review pipeline (extracted from review-video-orchestrator —
// God-file anatomy N2). Behavior-preserving move. Union OrchestratorState được
// MỞ RỘNG type-level để phủ đủ các state THẬT đang được ghi (bản cũ ghi vài state
// ngoài union qua `as any` / không typecheck) — zero runtime change.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

export const STATUS_ARTIFACT_PATH = 'data/temp/review_video_orchestrator_status.json';

export type OrchestratorState =
  | 'READY_FOR_OPERATOR_VIDEO_REVIEW'
  | 'MISSING_REAL_PRODUCT_VIDEO_FIXTURE'
  | 'MISSING_VOICEOVER_FIXTURE'
  | 'MISSING_JOB_SOURCE_VIDEO'
  | 'PRODUCT_CARD_MISSING'
  | 'UNKNOWN_JOB'
  | 'JOB_LOCAL_VOICE_NOT_IMPLEMENTED'
  | 'REAL_FIXTURE_NOT_USED'
  | 'VOICE_GENERATION_FAILED'
  | 'RENDER_FAILED'
  | 'CAPTION_FAILED'
  | 'DRY_RUN_PLAN_ONLY'
  | 'REVIEW_PREVIEW_AUDIO_MISSING'
  | 'CAPTIONED_PREVIEW_AUDIO_MISSING'
  | 'BGM_LIBRARY_FILES_MISSING'
  | 'BGM_MISSING_IN_MIX'
  | 'BGM_SELECTION_FAILED'
  | 'VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING'
  | 'VISION_FAILED'
  // Phần 77 — vision verdict gate: nguồn không dùng được (PRODUCT_NOT_VISIBLE…)
  | 'VISION_SOURCE_UNUSABLE'
  // Phần 78 — bước 0 Product-from-Video (lane video-first tự nhận dạng sản phẩm)
  | 'PRODUCT_FROM_VIDEO_REQUIRES_OPENAI'
  | 'MARKET_FIT_FAILED'
  | 'PRODUCT_FROM_VIDEO_FAILED'
  | 'SCRIPT_REQUIRED_BUT_CONFIRM_OPENAI_MISSING'
  | 'SCRIPT_GENERATION_FAILED'
  | 'BGM_VOICE_DIRECTION_STALE'
  | 'VOICE_DIRECTION_NOT_APPLIED'
  | 'DUPLICATE_OPENING_HOOK'
  | 'VOICE_REQUIRED_BUT_CONFIRM_ELEVENLABS_MISSING'
  | 'FINAL_QA_REQUIRED_BUT_CONFIRM_OPENAI_MISSING'
  | 'FINAL_QA_NOT_PASSING'
  // Phần 82 — cổng AI auto-approve (thay click duyệt tay ở nhánh PASS)
  | 'AUTO_APPROVED'
  | 'AUTO_APPROVE_REJECTED'
  | 'AUTO_APPROVE_NEEDS_HUMAN'
  // ---- Các state THẬT đã được ghi ở bản cũ nhưng thiếu trong union ----
  | 'MISSING_JOB_VOICEOVER'
  | 'SCRIPT_QUALITY_VALIDATION_FAILED'
  | 'STALE_JOB_VOICEOVER'
  | 'STALE_JOB_TIMING_ARTIFACT'
  | 'VOICE_LONGER_THAN_VIDEO'
  // ---- Mã lỗi clean-source gate (H2 ghi err.code làm state) ----
  | 'CLEAN_SOURCE_VIDEO_NOT_FOUND'
  | 'CLEANLINESS_REPORT_NOT_FOUND'
  | 'CLEANLINESS_REPORT_UNREADABLE'
  | 'CLEANLINESS_NOT_APPROVED'
  | 'WATERMARK_DETECTED'
  | 'SOURCE_NOT_READY'
  | 'FFPROBE_FAILED';

export interface StatusArtifact {
  statusVersion: 'v1';
  runId: string;
  jobId: string | null;
  state: OrchestratorState;
  videoFixturePresent: boolean;
  voiceFixturePresent: boolean;
  jobSourceVideoPresent: boolean | null;
  elevenLabsApiCalled: boolean;
  chayExecuted: boolean;
  captionExecuted: boolean;
  captionPreset: string;
  outputVideoPath: string | null;
  previewArtifact: {
    rendered: boolean;
    hasRealFixture: boolean;
    offlinePlaceholderOnly: boolean;
  } | null;
  safety: {
    facebookApiCalled: false;
    uploaded: false;
    published: false;
    operatorReviewRequired: true;
  };
  generatedAt: string;
}

export function writeStatusArtifact(artifact: StatusArtifact): void {
  const outPath = resolve(STATUS_ARTIFACT_PATH);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  console.log(`Status artifact: ${STATUS_ARTIFACT_PATH}`);
}
