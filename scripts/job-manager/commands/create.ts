// `create` command (extracted from scripts/vfos-job-manager.ts — God-file anatomy
// Nhịp 3). Byte-identical move; logic unchanged.

import { copyFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { resolveChannelForCreate } from '../core/channels.js';
import { isoNow, nextJobId, saveManifest } from '../core/manifest-io.js';
import { JOBS_ROOT, OPERATOR_VIDEO_INBOX, REGISTRY_PATH } from '../core/paths.js';
import {
  extractChineseSearchName,
  extractProductId,
  extractProductName,
} from '../core/product-card.js';
import {
  entryFromManifest,
  loadRegistry,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';
import type { JobManifest } from '../core/types.js';

export function cmdCreate(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      'from-product': { type: 'string' },
      // Video-first (Trend Scout POV): tạo job từ URL video, gắn Product Card SAU
      // (job:attach-product). Loại trừ lẫn nhau với --from-product.
      'from-video-url': { type: 'string' },
      channel: { type: 'string' },
      batch: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const fromProduct = parsed.values['from-product'] as string | undefined;
  const fromVideoUrl = parsed.values['from-video-url'] as string | undefined;
  const explicitChannel = parsed.values.channel as string | undefined;
  const batchArg = parsed.values.batch as string | undefined;
  const dryRun = Boolean(parsed.values['dry-run']);

  if (fromProduct && fromVideoUrl) {
    console.error('Error: --from-product và --from-video-url loại trừ lẫn nhau — chọn 1.');
    return 1;
  }
  if (fromVideoUrl) return createFromVideoUrl(fromVideoUrl, explicitChannel, batchArg, dryRun);
  if (!fromProduct) {
    console.error('Error: --from-product <path> (hoặc --from-video-url <url>) is required');
    return 1;
  }

  // Batch cohort (#2 Phase B) — optional. Thiếu → null (hành vi cũ y hệt). Có thì
  // phải đúng định dạng id an toàn; KHÔNG phải gate, chỉ để gom batch ở Command Center.
  let batchId: string | null = null;
  if (batchArg != null && batchArg !== '') {
    if (!/^[A-Za-z0-9_-]+$/.test(batchArg)) {
      console.error('🛑 INVALID_BATCH_ID: chỉ cho phép [A-Za-z0-9_-].');
      return 2;
    }
    batchId = batchArg;
  }

  const productCardPath = resolve(fromProduct);
  if (!existsSync(productCardPath)) {
    console.error(`🛑 MISSING_PRODUCT_CARD: ${fromProduct}`);
    return 2;
  }

  let productCardRaw: Record<string, unknown>;
  try {
    productCardRaw = JSON.parse(readFileSync(productCardPath, 'utf8'));
  } catch (e) {
    console.error(`🛑 INVALID_PRODUCT_CARD_JSON: ${(e as Error).message}`);
    return 2;
  }

  const channelRes = resolveChannelForCreate(explicitChannel);
  if (!channelRes.ok) {
    console.error(`🛑 ${channelRes.error}`);
    return 2;
  }

  const reg = loadRegistry();
  const jobId = nextJobId(reg);
  const runId = `run_${jobId}`;
  const jobDir = resolve(JOBS_ROOT, jobId);
  const productCardDest = join(jobDir, 'product_card.json');

  const productName = extractProductName(productCardRaw);
  const productId = extractProductId(productCardRaw);
  const chineseSearchName = extractChineseSearchName(productCardRaw);

  console.log('======================================================');
  console.log(`📦  VFOS Job Manager — create  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`From product card: ${fromProduct}`);
  console.log(`Job ID:            ${jobId}`);
  console.log(`Run ID:            ${runId}`);
  console.log(`Product name:      ${productName ?? '(unknown)'}`);
  console.log(`Product ID:        ${productId ?? '(unknown)'}`);
  console.log(`Tên tìm kiếm Trung: ${chineseSearchName ?? '(chưa có)'}`);
  console.log(
    `Channel:           ${
      channelRes.channelId
        ? `${channelRes.channelId} (${channelRes.channelName ?? 'không rõ tên'})`
        : '(chưa gán kênh)'
    }`,
  );
  if (channelRes.warning) console.log(`⚠️  ${channelRes.warning}`);
  console.log(`Batch:             ${batchId ?? '(không thuộc batch)'}`);
  console.log(`Job dir:           ${JOBS_ROOT}/${jobId}/`);
  console.log('Initial state:     WAITING_FOR_SOURCE_VIDEO');
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no folder created, no manifest written, no registry update.');
    return 0;
  }

  mkdirSync(jobDir, { recursive: true });
  copyFileSync(productCardPath, productCardDest);

  const manifest: JobManifest = {
    jobVersion: 'v1',
    jobId,
    runId,
    productId,
    channelId: channelRes.channelId,
    batchId,
    chineseSearchName,
    source: {
      productCardPath: `${JOBS_ROOT}/${jobId}/product_card.json`,
      sourceVideoPath: null,
    },
    artifacts: {
      scriptArtifactPath: null,
      voiceArtifactPath: null,
      voiceTimingArtifactPath: null,
      bgmArtifactPath: null,
      previewVideoPath: null,
      captionedPreviewPath: null,
      operatorReviewPackPath: null,
      publishReadinessPath: null,
    },
    state: 'WAITING_FOR_SOURCE_VIDEO',
    review: {
      operatorDecision: 'PENDING',
      approvedAt: null,
      rejectedAt: null,
      notes: null,
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      requiresOperatorReview: true,
    },
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  saveManifest(manifest);

  upsertRegistryEntry(reg, entryFromManifest(manifest, productName));
  saveRegistry(reg);

  console.log('✅ Job created.');
  console.log(`Manifest:          ${JOBS_ROOT}/${jobId}/job_manifest.json`);
  console.log(`Registry:          ${REGISTRY_PATH}`);
  console.log('');
  console.log('Next step (Operator):');
  console.log(`  1. Drop the source video into: ${OPERATOR_VIDEO_INBOX}/`);
  console.log('  2. List it:    pnpm job:source-inbox');
  console.log(`  3. Attach it:  pnpm job:attach-source --job ${jobId} --file "<filename>.mp4"`);
  console.log(`     (a full path also works: --file "C:\\path\\to\\source-video.mp4")`);
  return 0;
}

/**
 * Video-first create (Trend Scout POV — Video-First intake). Job sinh từ URL
 * video Douyin/TikTok, CHƯA có Product Card: state WAITING_FOR_PRODUCT,
 * productCardPath = null. Production bị pipeline chặn (PRODUCT_CARD_MISSING)
 * cho tới khi `job:attach-product` gắn card thật.
 */
function createFromVideoUrl(
  rawUrl: string,
  explicitChannel: string | undefined,
  batchArg: string | undefined,
  dryRun: boolean,
): number {
  const sourceVideoUrl = rawUrl.trim();
  if (!/^https:\/\/[^\s"']+$/i.test(sourceVideoUrl)) {
    console.error('🛑 INVALID_VIDEO_URL: chỉ chấp nhận URL https hợp lệ (không dấu cách/quote).');
    return 2;
  }

  let batchId: string | null = null;
  if (batchArg != null && batchArg !== '') {
    if (!/^[A-Za-z0-9_-]+$/.test(batchArg)) {
      console.error('🛑 INVALID_BATCH_ID: chỉ cho phép [A-Za-z0-9_-].');
      return 2;
    }
    batchId = batchArg;
  }

  const channelRes = resolveChannelForCreate(explicitChannel);
  if (!channelRes.ok) {
    console.error(`🛑 ${channelRes.error}`);
    return 2;
  }

  const reg = loadRegistry();
  const jobId = nextJobId(reg);
  const runId = `run_${jobId}`;
  const jobDir = resolve(JOBS_ROOT, jobId);

  console.log('======================================================');
  console.log(
    `📦  VFOS Job Manager — create (VIDEO-FIRST)  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`,
  );
  console.log('======================================================');
  console.log(`Source video URL:  ${sourceVideoUrl}`);
  console.log(`Job ID:            ${jobId}`);
  console.log(`Run ID:            ${runId}`);
  console.log('Product Card:      (CHƯA CÓ — gắn sau bằng job:attach-product)');
  console.log(
    `Channel:           ${
      channelRes.channelId
        ? `${channelRes.channelId} (${channelRes.channelName ?? 'không rõ tên'})`
        : '(chưa gán kênh)'
    }`,
  );
  if (channelRes.warning) console.log(`⚠️  ${channelRes.warning}`);
  console.log(`Batch:             ${batchId ?? '(không thuộc batch)'}`);
  console.log(`Job dir:           ${JOBS_ROOT}/${jobId}/`);
  console.log('Initial state:     WAITING_FOR_PRODUCT');
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no folder created, no manifest written, no registry update.');
    return 0;
  }

  mkdirSync(jobDir, { recursive: true });

  const manifest: JobManifest = {
    jobVersion: 'v1',
    jobId,
    runId,
    productId: null,
    channelId: channelRes.channelId,
    batchId,
    chineseSearchName: null,
    source: {
      productCardPath: null,
      sourceVideoPath: null,
      sourceVideoUrl,
    },
    artifacts: {
      scriptArtifactPath: null,
      voiceArtifactPath: null,
      voiceTimingArtifactPath: null,
      bgmArtifactPath: null,
      previewVideoPath: null,
      captionedPreviewPath: null,
      operatorReviewPackPath: null,
      publishReadinessPath: null,
    },
    state: 'WAITING_FOR_PRODUCT',
    review: {
      operatorDecision: 'PENDING',
      approvedAt: null,
      rejectedAt: null,
      notes: null,
    },
    safety: {
      facebookApiCalled: false,
      uploaded: false,
      published: false,
      requiresOperatorReview: true,
    },
    createdAt: isoNow(),
    updatedAt: isoNow(),
  };
  saveManifest(manifest);

  upsertRegistryEntry(reg, entryFromManifest(manifest, null));
  saveRegistry(reg);

  console.log('✅ Job created (video-first).');
  console.log(`Manifest:          ${JOBS_ROOT}/${jobId}/job_manifest.json`);
  console.log(`Registry:          ${REGISTRY_PATH}`);
  console.log('');
  console.log('Next step (Operator):');
  console.log(
    `  1. Gắn sản phẩm:  pnpm job:attach-product --job ${jobId} --from-product <card.json>`,
  );
  console.log('  2. Sau đó intake nguồn video như luồng thường (Action 2 / attach-source).');
  console.log('  ⛔ Production BỊ CHẶN (PRODUCT_CARD_MISSING) khi chưa có Product Card.');
  return 0;
}
