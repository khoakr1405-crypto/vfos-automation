import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const JOBS_ROOT = 'data/temp/jobs';

export interface SyncableManifest {
  jobId: string;
  artifacts?: Record<string, string | null | undefined> | null;
}

export function syncManifestArtifacts(manifest: SyncableManifest): void {
  if (!manifest) return;
  const jobId = manifest.jobId;
  if (!jobId) return;

  const jobDir = resolve(JOBS_ROOT, jobId);

  if (!manifest.artifacts) {
    manifest.artifacts = {
      scriptArtifactPath: null,
      voiceArtifactPath: null,
      voiceTimingArtifactPath: null,
      bgmArtifactPath: null,
      previewVideoPath: null,
      captionedPreviewPath: null,
      operatorReviewPackPath: null,
      publishReadinessPath: null,
    };
  }

  const artifacts = manifest.artifacts;

  const mapping = [
    { file: 'script_artifact.json', field: 'scriptArtifactPath' },
    { file: 'voice_artifact.json', field: 'voiceArtifactPath' },
    { file: 'voice_timing_artifact.json', field: 'voiceTimingArtifactPath' },
    { file: 'bgm_selection_artifact.json', field: 'bgmArtifactPath' },
    { file: 'preview.mp4', field: 'previewVideoPath' },
    { file: 'final_video_qa_report.json', field: 'finalQaReportPath' },
    { file: 'video_visual_analysis.json', field: 'videoVisualAnalysisPath' },
  ];

  for (const item of mapping) {
    if (existsSync(join(jobDir, item.file))) {
      artifacts[item.field] = `${JOBS_ROOT}/${jobId}/${item.file}`;
    }
  }

  // Handle captionedPreviewPath specifically (v2 has priority over v1)
  if (existsSync(join(jobDir, 'preview_with_captions_v2.mp4'))) {
    artifacts.captionedPreviewPath = `${JOBS_ROOT}/${jobId}/preview_with_captions_v2.mp4`;
  } else if (existsSync(join(jobDir, 'preview_with_captions.mp4'))) {
    artifacts.captionedPreviewPath = `${JOBS_ROOT}/${jobId}/preview_with_captions.mp4`;
  }
}
