// H2 — Clean-source gate + manifest trace surgery (verbatim move từ
// review-video-orchestrator dòng 706–794). Chạy TRƯỚC banner (giữ thứ tự cũ).
// Fail → manifest FAILED + registry + status artifact inline + exit 20.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CleanSourceGateError, resolveApprovedCleanSource } from '../../core/clean-source.js';
import { saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import type { OrchestratorState, StatusArtifact } from '../status-artifact.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function cleanSourceGate(ctx: PipelineContext): void {
  const { jobId, jobManifest } = ctx;
  if (!jobId || !jobManifest) return; // UNKNOWN_JOB xử ở sanity gate/dry-run (như cũ)

  try {
    const cleanSourcePath = resolveApprovedCleanSource(jobId);
    console.log(`✅ Approved clean source video verified: ${cleanSourcePath}`);

    // Update manifest fields to point to this clean source video
    const relativeSourcePath = `runs/${jobId}/source/clean_source_video.mp4`;
    jobManifest.source.sourceVideoPath = relativeSourcePath;
    jobManifest.source.localPath = relativeSourcePath;

    // Resolve actual and requested providers from source_download_report.json if exists
    let requestedProvider = jobManifest.source.provider ?? 'unduhtiktok';
    let actualProvider = requestedProvider;
    const jobSourceDir = resolve(`runs/${jobId}/source`);
    const downloadReportPath = join(jobSourceDir, 'source_download_report.json');
    if (existsSync(downloadReportPath)) {
      try {
        const dlReport = JSON.parse(readFileSync(downloadReportPath, 'utf8')) as {
          requestedProvider?: string;
          actualProvider?: string;
        };
        if (dlReport.requestedProvider) requestedProvider = dlReport.requestedProvider;
        if (dlReport.actualProvider) actualProvider = dlReport.actualProvider;
      } catch {
        // ignore
      }
    }

    // Trace update in manifest/status
    jobManifest.source.approvedSourceVideoPath = relativeSourcePath;
    jobManifest.source.sourceVideoPathUsedByPipeline = relativeSourcePath;
    jobManifest.source.requestedProvider = requestedProvider;
    jobManifest.source.actualProvider = actualProvider;
    jobManifest.source.sourceVideoProvider = actualProvider;
    jobManifest.source.cleanlinessReportPath = `runs/${jobId}/source/source_cleanliness_report.json`;
    jobManifest.source.sourceResolvedAt = new Date().toISOString();
    saveManifest(jobManifest);

    // Re-read to ensure consistency
    const rel = jobManifest.source.sourceVideoPath;
    ctx.jobSourceVideoAbs = rel ? resolve(rel) : null;
    ctx.jobSourceVideoPresent = Boolean(ctx.jobSourceVideoAbs && existsSync(ctx.jobSourceVideoAbs));
  } catch (err) {
    const code = err instanceof CleanSourceGateError ? err.code : undefined;
    const message = (err as Error).message;
    console.error('======================================================');
    console.error(`🛑 PIPELINE_GATE_BLOCKED: ${code ?? 'SOURCE_NOT_READY'}`);
    console.error(message);
    console.error('======================================================');

    jobManifest.state = 'FAILED';
    jobManifest.lastError = `${code}: ${message}`;
    saveManifest(jobManifest);
    updateRegistryFromManifest(jobManifest);

    // Write status report (inline — baseArtifact chưa dựng ở thời điểm này, như cũ)
    const failArtifact: StatusArtifact = {
      statusVersion: 'v1',
      runId: ctx.runId,
      jobId,
      state: (code as OrchestratorState) ?? 'MISSING_JOB_SOURCE_VIDEO',
      videoFixturePresent: false,
      voiceFixturePresent: false,
      jobSourceVideoPresent: false,
      elevenLabsApiCalled: false,
      chayExecuted: false,
      captionExecuted: false,
      captionPreset: ctx.preset,
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
    writeStatusArtifact(failArtifact);
    process.exit(20);
  }
}
