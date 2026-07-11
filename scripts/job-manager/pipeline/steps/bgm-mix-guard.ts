// H16 — BGM MIX GUARDRAIL (verbatim move từ review-video-orchestrator dòng
// 1625–1677; Round 51A). ffprobe không phân biệt được amix voice-only vs
// voice+BGM → guard dựa trên selection artifact + mix report của renderer
// (voiceIncluded + bgmIncluded). Fail → exit 12.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function bgmMixGuard(ctx: PipelineContext): void {
  const { jobId, jobOutputDir } = ctx;
  if (!(jobId && jobOutputDir && ctx.bgmRequired)) return;

  console.log('\n🔍 [BgmGuard] Verifying BGM was mixed under the voiceover...');
  const bgmSelectionPath = join(jobOutputDir, 'bgm_selection_artifact.json');
  const bgmReportPath = join(jobOutputDir, 'bgm_mixing_report.json');
  const renderManifestAbs = join(jobOutputDir, 'render_manifest.json');

  let bgmGuardFail: string | null = null;
  if (!existsSync(bgmSelectionPath)) {
    bgmGuardFail = 'bgm_selection_artifact.json missing';
  } else if (!existsSync(bgmReportPath)) {
    bgmGuardFail = 'bgm_mixing_report.json missing (renderer fell back to voiceover-only)';
  } else {
    try {
      const renderManifest = JSON.parse(readFileSync(renderManifestAbs, 'utf8')) as {
        assets?: { bgm?: { selected?: boolean } | null };
      };
      const manifestAsset = renderManifest?.assets?.bgm;
      if (!manifestAsset || manifestAsset.selected !== true) {
        bgmGuardFail = 'render_manifest.assets.bgm.selected is not true';
      } else {
        const report = JSON.parse(readFileSync(bgmReportPath, 'utf8')) as {
          voiceIncluded?: boolean;
          bgmIncluded?: boolean;
        };
        if (report.voiceIncluded !== true || report.bgmIncluded !== true) {
          bgmGuardFail = `mix report flags not both true (voiceIncluded=${report.voiceIncluded}, bgmIncluded=${report.bgmIncluded})`;
        }
      }
    } catch (err) {
      bgmGuardFail = `could not parse BGM artifacts: ${(err as Error).message}`;
    }
  }

  if (bgmGuardFail) {
    console.log('🛑 BGM_MISSING_IN_MIX');
    console.log(`Reason: ${bgmGuardFail}`);
    console.log('BGM was required for this job but the rendered preview does not contain a');
    console.log('verified voice + BGM mix. Refusing to advance to operator review.');
    if (ctx.jobManifest) {
      ctx.jobManifest.state = 'FAILED';
      ctx.jobManifest.lastError = 'BGM_MISSING_IN_MIX';
      saveManifest(ctx.jobManifest);
      updateRegistryFromManifest(ctx.jobManifest);
    }
    writeStatusArtifact({
      ...ctx.baseArtifact,
      elevenLabsApiCalled: ctx.elevenLabsApiCalled,
      chayExecuted: ctx.chayExecuted,
      state: 'BGM_MISSING_IN_MIX',
    });
    process.exit(12);
  }
  console.log('✅ [BgmGuard] Voice + BGM mix verified (mix report present, flags OK).');
}
