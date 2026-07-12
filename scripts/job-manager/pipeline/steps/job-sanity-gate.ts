// H5 — GATE 0: --job sanity (verbatim move từ review-video-orchestrator dòng
// 953–968). UNKNOWN_JOB → exit 5; MISSING_JOB_SOURCE_VIDEO → exit 6.
// + Video-First intake (Trend Scout POV): PRODUCT_CARD_MISSING → exit 26 —
// job chưa gắn Product Card thì CẤM production (mandate Operator).

import type { PipelineContext } from '../context.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function jobSanityGate(ctx: PipelineContext): void {
  if (!ctx.jobId) return;
  const { jobId } = ctx;

  if (!ctx.jobManifest) {
    console.log(`🛑 UNKNOWN_JOB: ${jobId}`);
    console.log('Run `pnpm job:list` to see existing jobs.');
    writeStatusArtifact({ ...ctx.baseArtifact, state: 'UNKNOWN_JOB' });
    process.exit(5);
  }
  if (!ctx.jobManifest.source.productCardPath) {
    console.log('🛑 PRODUCT_CARD_MISSING');
    console.log(`Job ${jobId} được tạo video-first (Trend Scout) và CHƯA gắn Product Card.`);
    console.log('Production bị CHẶN cho tới khi gắn sản phẩm.');
    console.log('Operator action:');
    console.log(`  pnpm job:attach-product --job ${jobId} --from-product <card.json>`);
    writeStatusArtifact({ ...ctx.baseArtifact, state: 'PRODUCT_CARD_MISSING' });
    process.exit(26);
  }
  if (!ctx.jobSourceVideoPresent || !ctx.jobSourceVideoAbs) {
    console.log('🛑 MISSING_JOB_SOURCE_VIDEO');
    console.log(`Job ${jobId} has no attached source video.`);
    console.log('Operator action:');
    console.log(`  pnpm job:attach-source --job ${jobId} --file "C:\\path\\to\\video.mp4"`);
    writeStatusArtifact({ ...ctx.baseArtifact, state: 'MISSING_JOB_SOURCE_VIDEO' });
    process.exit(6);
  }
}
