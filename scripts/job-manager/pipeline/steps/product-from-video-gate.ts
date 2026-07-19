// H5b — STEP 0: Product-from-Video gate (Phần 78 — kiến trúc lane Review
// video-first). Job tạo từ video quét KHÔNG mang card tồn kho; bước này tự
// nhận dạng sản phẩm chính trong video + chấm Market-Fit TikTok Shop VN
// (spawn scripts/job-product-from-video.ts, 1 call gpt-4o-mini) rồi tự attach
// card AUTO_MARKET_FIT. Khiên TỰ DUYỆT theo No-Go #8 — không nút UI.
//
// Job ĐÃ có card (flow Shopee cũ / đã chạy bước 0) → no-op, hành vi cũ nguyên
// vẹn. FAIL market-fit → exit 28 (CLI đã set manifest FAILED). Chạy TRƯỚC
// jobSanityGate — sanity giữ nguyên làm backstop PRODUCT_CARD_MISSING.

import { saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

export function productFromVideoGate(ctx: PipelineContext): void {
  if (!ctx.jobId || !ctx.jobOutputDir) return;
  const { jobId } = ctx;
  if (!ctx.jobManifest) return; // UNKNOWN_JOB → jobSanityGate xử đúng exit cũ
  if (ctx.jobManifest.source.productCardPath) return; // đã có card → flow cũ

  if (!ctx.confirmOpenAi) {
    console.log('🛑 PRODUCT_FROM_VIDEO_REQUIRES_OPENAI');
    console.log(`Job ${jobId} là video-first (chưa có Product Card) — bước 0 cần OpenAI`);
    console.log('để nhận dạng sản phẩm + chấm Market-Fit TikTok Shop.');
    console.log('Operator action:');
    console.log(`  pnpm chay:review --job ${jobId} --confirm-ai`);
    writeStatusArtifact({ ...ctx.baseArtifact, state: 'PRODUCT_FROM_VIDEO_REQUIRES_OPENAI' });
    process.exit(29);
  }

  const status = runCommand(
    'STEP 0 — Product-from-Video (nhận dạng sản phẩm + Market-Fit TikTok Shop)',
    'npx',
    ['tsx', 'scripts/job-product-from-video.ts', '--job', jobId, '--confirm-openai'],
  );
  ctx.reloadManifest(); // CLI vừa ghi manifest (card attach / FAILED)

  if (status === 8) {
    // CLI đã set manifest FAILED + lastError MARKET_FIT_FAILED + registry.
    console.log('🛑 MARKET_FIT_FAILED — sản phẩm trong video không bán được trên TikTok Shop VN.');
    console.log(`   Chi tiết: data/temp/jobs/${jobId}/product_suggestion.json`);
    writeStatusArtifact({ ...ctx.baseArtifact, state: 'MARKET_FIT_FAILED' });
    process.exit(28);
  }
  if (status !== 0 || !ctx.jobManifest?.source.productCardPath) {
    console.log(`🛑 PRODUCT_FROM_VIDEO_FAILED (exit ${status})`);
    if (ctx.jobManifest) {
      ctx.jobManifest.state = 'FAILED';
      ctx.jobManifest.lastError = `PRODUCT_FROM_VIDEO_FAILED: bước 0 exit ${status}`;
      saveManifest(ctx.jobManifest);
      updateRegistryFromManifest(ctx.jobManifest);
    }
    writeStatusArtifact({ ...ctx.baseArtifact, state: 'PRODUCT_FROM_VIDEO_FAILED' });
    process.exit(30);
  }

  console.log('✅ STEP 0 PASS — sản phẩm tự nhận dạng đã gắn vào job (AUTO_MARKET_FIT).');
}
