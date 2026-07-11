// H9 — GATE 1: video source (verbatim move từ review-video-orchestrator dòng
// 1216–1233). Chỉ chạm được ở no-job mode (job mode đã xử ở sanity gate). Exit 2.

import type { PipelineContext } from '../context.js';
import { VIDEO_FIXTURE_PATH } from '../context.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function fixtureGate(ctx: PipelineContext): void {
  if (ctx.effectiveVideoPresent) return;
  // Only reachable in no-job mode here (job mode handled above).
  console.log('🛑 MISSING_REAL_PRODUCT_VIDEO_FIXTURE');
  console.log('');
  console.log('The real product video fixture is required before render.');
  console.log('Refusing to run `pnpm chay` against the placeholder testsrc');
  console.log('— that would generate a misleading preview and false approval.');
  console.log('');
  console.log('Operator action:');
  console.log(
    `  copy "C:\\Users\\Admin\\Downloads\\<your-video>.mp4" ${VIDEO_FIXTURE_PATH.replace(/\//g, '\\')}`,
  );
  console.log('Then rerun:');
  console.log('  pnpm chay:review');
  writeStatusArtifact({ ...ctx.baseArtifact, state: 'MISSING_REAL_PRODUCT_VIDEO_FIXTURE' });
  process.exit(2);
}
