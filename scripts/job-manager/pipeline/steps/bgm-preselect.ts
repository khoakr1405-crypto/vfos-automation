// H10 — PRE-SELECT BGM (verbatim move từ review-video-orchestrator dòng
// 1235–1247; Round 53). Chọn BGM (sticky) TRƯỚC bước voice để bridge ElevenLabs
// đọc được mood và áp voice direction ngay take đầu. Policy enforcement vẫn nằm
// ở BGM Selection Gate (bgm-gate) phía sau.

import { selectBgmForJob } from '../../../job-bgm-selector.js';
import type { PipelineContext } from '../context.js';

export function bgmPreselect(ctx: PipelineContext): void {
  if (!ctx.jobId || !ctx.jobOutputDir) return;
  const pre = selectBgmForJob({ jobId: ctx.jobId, jobOutputDir: ctx.jobOutputDir });
  if (pre.status === 'OK' && pre.selection) {
    console.log(
      `🎵 BGM pre-selected for voice direction: ${pre.selection.trackId} (${pre.selection.mood})${pre.reused ? ' [sticky]' : ''}`,
    );
  }
}
