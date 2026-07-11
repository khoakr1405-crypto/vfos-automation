// Clean-source gate (extracted from scripts/review-video-orchestrator.ts —
// God-file anatomy N1). Behavior-preserving move: logic giữ nguyên; các object
// throw `{code, message}` nâng thành CleanSourceGateError (vẫn đọc được
// `.code`/`.message` y như cũ ở caller).

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { loadManifest } from './manifest-io.js';
import { getVideoDuration } from './media-probe.js';

/** Lỗi gate nguồn sạch — giữ contract `.code` + `.message` của orchestrator cũ. */
export class CleanSourceGateError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = 'CleanSourceGateError';
  }
}

interface CleanlinessReport {
  status?: string;
  framePaths?: string[];
}

/**
 * Verify + resolve clean source video đã được duyệt cho 1 job:
 * clean_source_video.mp4 tồn tại → report tồn tại → status 2 phía (report +
 * manifest) đều WATERMARK_NOT_DETECTED → frame paths (warn-only) → ffprobe đọc
 * được duration. Trả về absolute path; sai bất kỳ bước nào → throw có `.code`.
 */
export function resolveApprovedCleanSource(jobId: string): string {
  const manifest = loadManifest(jobId);
  if (!manifest) {
    throw new CleanSourceGateError('UNKNOWN_JOB', `Job ${jobId} does not exist.`);
  }

  // 1. Verify existence of clean_source_video.mp4
  const jobSourceDir = resolve(`runs/${jobId}/source`);
  const finalVideoPath = join(jobSourceDir, 'clean_source_video.mp4');
  const cleanlinessReportPath = join(jobSourceDir, 'source_cleanliness_report.json');

  if (!existsSync(finalVideoPath)) {
    throw new CleanSourceGateError(
      'CLEAN_SOURCE_VIDEO_NOT_FOUND',
      `runs/${jobId}/source/clean_source_video.mp4 does not exist.`,
    );
  }

  // 2. Verify existence of source_cleanliness_report.json
  if (!existsSync(cleanlinessReportPath)) {
    throw new CleanSourceGateError(
      'CLEANLINESS_REPORT_NOT_FOUND',
      `runs/${jobId}/source/source_cleanliness_report.json does not exist.`,
    );
  }

  // 3. Read existing report and check status
  let report: CleanlinessReport;
  try {
    report = JSON.parse(readFileSync(cleanlinessReportPath, 'utf8')) as CleanlinessReport;
  } catch {
    throw new CleanSourceGateError(
      'CLEANLINESS_REPORT_UNREADABLE',
      'Failed to parse cleanliness report.',
    );
  }

  const reportStatus = report.status || 'UNKNOWN_NEEDS_OPERATOR_REVIEW';
  const manifestStatus = manifest.source.cleanlinessStatus || 'NEEDS_REVIEW';

  if (reportStatus === 'UNKNOWN_NEEDS_OPERATOR_REVIEW' || manifestStatus === 'NEEDS_REVIEW') {
    throw new CleanSourceGateError(
      'CLEANLINESS_NOT_APPROVED',
      `Cleanliness check is pending Operator approval. Please run:\n  pnpm source:approve-cleanliness --job ${jobId} --status pass --notes "<operator notes>"`,
    );
  }

  if (reportStatus === 'WATERMARK_DETECTED' || manifestStatus === 'WATERMARK_DETECTED') {
    throw new CleanSourceGateError(
      'WATERMARK_DETECTED',
      'Cleanliness check failed! Watermark/logo detected. Please replace the source video or re-evaluate.',
    );
  }

  if (reportStatus !== 'WATERMARK_NOT_DETECTED' || manifestStatus !== 'WATERMARK_NOT_DETECTED') {
    throw new CleanSourceGateError(
      'SOURCE_NOT_READY',
      `Cleanliness is not approved (status: ${reportStatus ?? 'UNKNOWN'}).`,
    );
  }

  // 4. Validate frame paths if they exist
  const framePaths: string[] = report.framePaths || [];
  for (const fp of framePaths) {
    const fullFramePath = resolve(fp);
    if (!existsSync(fullFramePath)) {
      console.warn(`⚠️ [Warning] Extracted frame path is missing: ${fp}`);
    }
  }

  // 5. ffprobe verification
  const duration = getVideoDuration(finalVideoPath);
  if (duration <= 0) {
    throw new CleanSourceGateError(
      'FFPROBE_FAILED',
      'ffprobe failed to read duration for clean source video.',
    );
  }

  return finalVideoPath;
}
