// H6 — STEP 1: Vision analysis gate (verbatim move từ review-video-orchestrator
// dòng 969–1004; Round 52 — vision bắt buộc). Thiếu artifact: có --confirm-openai
// → spawn job:vision; không → exit 19. Subprocess fail → exit 20.
// N4: reloadManifest() ngay sau subprocess (job:vision có thể ghi manifest).
//
// Phần 77 — VERDICT GATE (bài học job_20260715_002): trước đây gate chỉ đảm bảo
// artifact TỒN TẠI, không đọc kết luận → video sai sản phẩm (PRODUCT_NOT_VISIBLE,
// sourceVideoUsable=false) vẫn chạy hết script/voice/render tốn tiền. Giờ verdict
// được đọc ở CẢ 2 nhánh (artifact mới sinh lẫn có sẵn) và CHẶN THẬT (exit 27)
// TRƯỚC scriptGate. Override duy nhất: cờ CLI --force-vision-unusable (Operator
// gõ tay khi xác nhận vision phán sai; UI không bao giờ truyền).

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { saveManifest } from '../../core/manifest-io.js';
import { updateRegistryFromManifest } from '../../core/registry-io.js';
import type { PipelineContext } from '../context.js';
import { runCommand } from '../run-step.js';
import { writeStatusArtifact } from '../status-artifact.js';

interface VisionArtifactShape {
  analysis?: {
    productConfidence?: unknown;
    mainProductVisible?: unknown;
    mismatchWarnings?: unknown;
  };
  quality?: {
    sourceVideoUsable?: unknown;
    blockingIssues?: unknown;
  };
}

export function visionGate(ctx: PipelineContext): void {
  if (!ctx.jobId || !ctx.jobOutputDir) return;
  const { jobId } = ctx;

  const visionArtPath = join(ctx.jobOutputDir, 'video_visual_analysis.json');
  if (!existsSync(visionArtPath)) {
    if (ctx.confirmOpenAi) {
      const vStatus = runCommand('STEP 1 — OpenAI Vision analysis (job-native)', 'pnpm', [
        'job:vision',
        '--job',
        jobId,
        '--confirm-openai',
      ]);
      ctx.reloadManifest(); // N4 — subprocess vừa ghi đĩa, đồng bộ lên memory
      if (vStatus !== 0 || !existsSync(visionArtPath)) {
        console.log('🛑 VISION_FAILED');
        if (ctx.jobManifest) {
          ctx.jobManifest.state = 'FAILED';
          ctx.jobManifest.lastError = 'VISION_FAILED';
          saveManifest(ctx.jobManifest);
          updateRegistryFromManifest(ctx.jobManifest);
        }
        writeStatusArtifact({ ...ctx.baseArtifact, state: 'VISION_FAILED' });
        process.exit(20);
      }
    } else {
      console.log('🛑 VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING');
      console.log(`Job ${jobId} has no video_visual_analysis.json and OpenAI is not authorized.`);
      console.log('Operator action:');
      console.log(`  pnpm chay:review --job ${jobId} --confirm-openai`);
      console.log(`  (or: pnpm job:vision --job ${jobId} --confirm-openai)`);
      writeStatusArtifact({
        ...ctx.baseArtifact,
        state: 'VISION_REQUIRED_BUT_CONFIRM_OPENAI_MISSING',
      });
      process.exit(19);
    }
  }

  // ---- Phần 77: đọc VERDICT từ artifact (mới sinh HOẶC có sẵn từ run trước) ----
  let art: VisionArtifactShape;
  try {
    art = JSON.parse(readFileSync(visionArtPath, 'utf8')) as VisionArtifactShape;
  } catch {
    console.log('🛑 VISION_FAILED (video_visual_analysis.json không đọc được)');
    if (ctx.jobManifest) {
      ctx.jobManifest.state = 'FAILED';
      ctx.jobManifest.lastError = 'VISION_FAILED: artifact unreadable';
      saveManifest(ctx.jobManifest);
      updateRegistryFromManifest(ctx.jobManifest);
    }
    writeStatusArtifact({ ...ctx.baseArtifact, state: 'VISION_FAILED' });
    process.exit(20);
  }

  const quality = art.quality ?? {};
  const blockingIssues = Array.isArray(quality.blockingIssues)
    ? quality.blockingIssues.filter((v): v is string => typeof v === 'string')
    : [];
  // Calibration live-fire job_20260716_003 (Phần 78): CHỈ chặn theo
  // blockingIssues (verdict CỨNG — PRODUCT_NOT_VISIBLE khi confidence < 0.3).
  // sourceVideoUsable=false đơn thuần đến từ các signal MỀM ('Text overlap',
  // 'Watermark', 'Low light'…) vốn đã có khiên chuyên trách xử lý (density gate
  // + scrub/delogo + cleanliness) — từng chặn oan video khớp card 0.95 → giờ
  // chỉ CẢNH BÁO to rồi đi tiếp.
  if (blockingIssues.length === 0) {
    if (quality.sourceVideoUsable === false) {
      console.log(
        '⚠️ Vision: sourceVideoUsable=false do signal mềm — KHÔNG chặn (đã có scrub/cleanliness xử lý).',
      );
      const warns = Array.isArray(art.analysis?.mismatchWarnings)
        ? art.analysis.mismatchWarnings
        : [];
      for (const w of warns) if (typeof w === 'string') console.log(`   ⚠ ${w}`);
    }
    return; // vision PASS
  }

  const confidence =
    typeof art.analysis?.productConfidence === 'number' ? art.analysis.productConfidence : null;
  const mismatch = Array.isArray(art.analysis?.mismatchWarnings)
    ? art.analysis.mismatchWarnings.filter((v): v is string => typeof v === 'string')
    : [];
  const reason = blockingIssues.join(', ');

  if (ctx.forceVisionUnusable) {
    console.log('⚠️ VISION_SOURCE_UNUSABLE nhưng --force-vision-unusable ĐANG BẬT — chạy tiếp.');
    console.log(
      `   Lý do vision: ${reason}${confidence !== null ? ` (confidence ${confidence})` : ''}`,
    );
    console.log('   Operator chịu trách nhiệm kết quả — video có thể sai sản phẩm.');
    return;
  }

  console.log('🛑 VISION_SOURCE_UNUSABLE — nguồn không dùng được cho sản phẩm trên card.');
  console.log(`   Blocking:        ${reason}`);
  if (confidence !== null) console.log(`   productConfidence: ${confidence}`);
  for (const w of mismatch) console.log(`   ⚠ ${w}`);
  console.log('   Pipeline DỪNG TRƯỚC script/voice/render — chưa tốn API.');
  console.log('   Cách xử lý: gắn đúng Product Card có trong video, hoặc chọn video khác.');
  console.log('   Override (chỉ khi xác nhận vision sai): --force-vision-unusable');
  if (ctx.jobManifest) {
    ctx.jobManifest.state = 'FAILED';
    ctx.jobManifest.lastError = `VISION_SOURCE_UNUSABLE: ${reason}`;
    saveManifest(ctx.jobManifest);
    updateRegistryFromManifest(ctx.jobManifest);
  }
  writeStatusArtifact({ ...ctx.baseArtifact, state: 'VISION_SOURCE_UNUSABLE' });
  process.exit(27);
}
