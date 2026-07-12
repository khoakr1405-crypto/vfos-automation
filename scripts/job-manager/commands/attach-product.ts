// `attach-product` command — Video-First intake (Trend Scout POV). Gắn Product
// Card vào job đã tạo từ URL video (WAITING_FOR_PRODUCT). Sau khi gắn: job vào
// lại luồng chuẩn (WAITING_FOR_SOURCE_VIDEO → intake → production).
// Exit: 0 OK · 1 args · 2 missing/invalid card · 3 unknown job · 4 job đã có card.

import { copyFileSync, existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import { JOBS_ROOT } from '../core/paths.js';
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

export function cmdAttachProduct(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'from-product': { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const fromProduct = parsed.values['from-product'] as string | undefined;
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!jobId || !fromProduct) {
    console.error('Usage: pnpm job:attach-product --job <jobId> --from-product <card.json>');
    return 1;
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

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 3;
  }
  if (manifest.source.productCardPath) {
    console.error(`🛑 PRODUCT_ALREADY_ATTACHED: job ${jobId} đã có Product Card.`);
    console.error(`   Card hiện tại: ${manifest.source.productCardPath}`);
    return 4;
  }

  const productName = extractProductName(productCardRaw);
  const productId = extractProductId(productCardRaw);
  const chineseSearchName = extractChineseSearchName(productCardRaw);
  // Job video-first đang WAITING_FOR_PRODUCT → về luồng chuẩn. Job ở state khác
  // (hiếm — card null do dữ liệu tay) giữ nguyên state, chỉ bổ sung card.
  const nextState = manifest.state === 'WAITING_FOR_PRODUCT' ? 'WAITING_FOR_SOURCE_VIDEO' : null;

  console.log('======================================================');
  console.log(`🔗  VFOS Job Manager — attach-product  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`From product card: ${fromProduct}`);
  console.log(`Product name:      ${productName ?? '(unknown)'}`);
  console.log(`Product ID:        ${productId ?? '(unknown)'}`);
  console.log(`Tên tìm kiếm Trung: ${chineseSearchName ?? '(chưa có)'}`);
  console.log(`State:             ${manifest.state} → ${nextState ?? manifest.state}`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no card copied, no manifest written, no registry update.');
    return 0;
  }

  const jobDir = resolve(JOBS_ROOT, jobId);
  const productCardDest = join(jobDir, 'product_card.json');
  copyFileSync(productCardPath, productCardDest);

  manifest.source.productCardPath = `${JOBS_ROOT}/${jobId}/product_card.json`;
  manifest.productId = productId;
  manifest.chineseSearchName = chineseSearchName;
  if (nextState) manifest.state = nextState;
  manifest.updatedAt = isoNow();
  saveManifest(manifest);

  const reg = loadRegistry();
  upsertRegistryEntry(reg, entryFromManifest(manifest, productName));
  saveRegistry(reg);

  console.log('✅ Product Card attached.');
  console.log(`Card:              ${JOBS_ROOT}/${jobId}/product_card.json`);
  console.log('');
  console.log('Next step (Operator):');
  console.log('  Intake nguồn video (Action 2) hoặc: pnpm job:attach-source --job', jobId);
  return 0;
}
