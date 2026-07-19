#!/usr/bin/env tsx

/* =============================================================================
 * VFOS Product-from-Video (Phần 78 — bước 0 pipeline lane Review video-first)
 * -----------------------------------------------------------------------------
 * Job tạo từ video quét (Trend Scout) KHÔNG gắn card tồn kho nữa. Bước 0 này:
 *   frames từ clean source → gpt-4o-mini (1 call): nhận dạng SẢN PHẨM CHÍNH
 *   được review + chấm Market-Fit "loại sản phẩm có bán trên TikTok Shop VN?"
 *   → PASS: dựng card AUTO_MARKET_FIT (KHÔNG link) + attach vào job (reuse
 *     cmdAttachProduct — single writer). FAIL: manifest FAILED, exit 8.
 *
 * Khiên TỰ DUYỆT theo No-Go #8 — không nút UI, không dán link. Link TikTok Shop
 * thật thuộc khâu affiliate sau. Mặc định dry-run-an-toàn: cần --confirm-openai.
 *
 * Usage:
 *   npx tsx scripts/job-product-from-video.ts --job <jobId> --confirm-openai
 *   npx tsx scripts/job-product-from-video.ts --job <jobId> --dry-run
 *
 * Exit: 0 attached/no-op · 1 args · 2 confirm thiếu · 5 unknown job ·
 *       6 source gate · 7 frame extract · 8 MARKET_FIT_FAILED ·
 *       9 thiếu OPENAI_API_KEY · 10 API/parse fail
 * ========================================================================== */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../packages/voice/src/load-env.js';
import { cmdAttachProduct } from './job-manager/commands/attach-product.js';
import {
  type CleanSourceGateError,
  resolveApprovedCleanSource,
} from './job-manager/core/clean-source.js';
import { isoNow, loadManifest, saveManifest } from './job-manager/core/manifest-io.js';
import {
  MARKET_FIT_MIN_CONFIDENCE,
  assessMarketFit,
  buildAutoMarketFitCard,
  parseMarketFitSuggestion,
} from './job-manager/core/market-fit.js';
import { getVideoDuration } from './job-manager/core/media-probe.js';
import { updateRegistryFromManifest } from './job-manager/core/registry-io.js';

const JOBS_ROOT = 'data/temp/jobs';

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      job: { type: 'string' },
      'confirm-openai': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = values.job;
  const confirmOpenAi = Boolean(values['confirm-openai']);
  const dryRun = Boolean(values['dry-run']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    process.exit(1);
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    process.exit(5);
  }

  console.log('======================================================');
  console.log('🧭  VFOS Product-from-Video (bước 0 — identify + Market-Fit)');
  console.log('======================================================');
  console.log(`Job ID:   ${jobId}`);
  console.log(
    `Mode:     ${dryRun ? '🔍 DRY-RUN' : confirmOpenAi ? '⚡ LIVE OPENAI' : '❌ chưa confirm'}`,
  );

  // Idempotent: job đã có card (Shopee flow cũ / đã chạy bước 0 rồi) → no-op.
  if (manifest.source.productCardPath) {
    console.log(`✅ Job đã có Product Card (${manifest.source.productCardPath}) — bỏ qua bước 0.`);
    process.exit(0);
  }

  // Nguồn sạch đã duyệt (cùng gate với production — throw có .code khi chưa sẵn).
  let sourcePath: string;
  try {
    sourcePath = resolveApprovedCleanSource(jobId);
  } catch (e) {
    const err = e as CleanSourceGateError;
    console.error(`🛑 ${err.code ?? 'SOURCE_GATE_FAILED'}: ${err.message}`);
    process.exit(6);
  }

  const duration = getVideoDuration(sourcePath);
  if (duration <= 0) {
    console.error('🛑 FRAME_EXTRACTION_FAILED: ffprobe không đọc được duration.');
    process.exit(7);
  }

  // Frame timestamps (mirror job:vision): đủ phủ video, tối đa 6 frame.
  const timestamps: number[] = [];
  const numFrames = duration >= 10 ? 6 : 3;
  const step = (duration - 1.5) / (numFrames - 1);
  for (let i = 0; i < numFrames; i++) {
    timestamps.push(Number((0.5 + i * Math.max(step, 0)).toFixed(2)));
  }

  if (dryRun || !confirmOpenAi) {
    if (dryRun) {
      console.log(
        `Dry-run: sẽ trích ${numFrames} frame @ ${timestamps.join(', ')}s → 1 call gpt-4o-mini.`,
      );
      process.exit(0);
    }
    console.error('🛑 CONFIRM_OPENAI_REQUIRED: bước 0 cần --confirm-openai (1 call gpt-4o-mini).');
    process.exit(2);
  }

  loadDotEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.error('🛑 MISSING_OPENAI_CREDENTIALS: OPENAI_API_KEY chưa có trong môi trường.');
    process.exit(9);
  }

  // Trích frame vào thư mục riêng của bước 0 (sạch mỗi lần chạy).
  const jobDir = resolve(JOBS_ROOT, jobId);
  const framesDir = join(jobDir, 'product_id_frames');
  rmSync(framesDir, { recursive: true, force: true });
  mkdirSync(framesDir, { recursive: true });
  const framePaths: string[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const framePath = join(framesDir, `frame_${String(i + 1).padStart(2, '0')}.jpg`);
    const r = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-ss',
        String(timestamps[i]),
        '-i',
        sourcePath,
        '-frames:v',
        '1',
        '-q:v',
        '2',
        framePath,
      ],
      { encoding: 'utf8' },
    );
    if (r.status !== 0 || !existsSync(framePath)) {
      console.error(`🛑 FRAME_EXTRACTION_FAILED @ ${timestamps[i]}s`);
      process.exit(7);
    }
    framePaths.push(framePath);
  }
  console.log(`🟢 Đã trích ${framePaths.length} frame → product_id_frames/`);

  console.log('Calling OpenAI gpt-4o-mini (identify + market-fit, 1 call)...');
  let suggestionRaw: unknown;
  try {
    const imagesPayload = framePaths.map((p) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${readFileSync(p).toString('base64')}` },
    }));
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are a product identification AI for a Vietnamese affiliate video production system. You analyze frames from a short product-review video and identify the MAIN physical product being reviewed, then judge its e-commerce market fit for TikTok Shop Vietnam.',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Nhận dạng SẢN PHẨM CHÍNH được review/demo trong các frame này và chấm khả năng bán trên TikTok Shop Việt Nam. Trả về đúng JSON:
{
  "mainProductVisible": boolean (có thấy rõ 1 sản phẩm chính không),
  "productNameVi": string (tên sản phẩm TIẾNG VIỆT kiểu tên listing sàn TMĐT, 3-120 ký tự, ví dụ "Kệ gia vị nam châm dán tủ lạnh"),
  "keywords": [string] (3-6 từ khoá tiếng Việt để tìm sản phẩm này trên TikTok Shop),
  "chineseSearchName": string (tên tìm kiếm tiếng Trung của sản phẩm để tìm nguồn Douyin, "" nếu không chắc),
  "category": string (ngành hàng, ví dụ "đồ gia dụng nhà bếp"),
  "isPhysicalProduct": boolean (là sản phẩm vật lý bán lẻ được — KHÔNG phải dịch vụ/địa điểm/người/nội dung),
  "likelyOnTikTokShopVN": boolean (LOẠI sản phẩm này có phổ biến trên TikTok Shop / sàn TMĐT Việt Nam không),
  "confidence": float 0-1 (độ tin cậy tổng thể của nhận dạng + phán đoán),
  "reason": string (1 câu tiếng Việt giải thích vì sao fit hoặc không fit)
}
Nếu video có NHIỀU sản phẩm, chọn sản phẩm xuất hiện nhiều/được demo kỹ nhất làm sản phẩm chính.`,
              },
              ...imagesPayload,
            ],
          },
        ],
      }),
    });
    if (!response.ok) {
      throw new Error(`OpenAI HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    const resObj = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const contentStr = resObj.choices?.[0]?.message?.content;
    if (!contentStr) throw new Error('OpenAI trả về content rỗng.');
    suggestionRaw = JSON.parse(contentStr.trim());
  } catch (e) {
    console.error('🛑 OPENAI_API_FAILURE');
    console.error((e as Error).message);
    process.exit(10);
  }

  const suggestion = parseMarketFitSuggestion(suggestionRaw);
  if (!suggestion) {
    console.error('🛑 SUGGESTION_INVALID: JSON từ LLM sai shape (thiếu field bắt buộc).');
    console.error(JSON.stringify(suggestionRaw).slice(0, 400));
    process.exit(10);
  }
  const verdict = assessMarketFit(suggestion);

  // Artifact evidence — luôn ghi, kể cả FAIL (Operator soi được vì sao).
  const suggestionPath = join(jobDir, 'product_suggestion.json');
  writeFileSync(
    suggestionPath,
    `${JSON.stringify(
      {
        suggestionVersion: 'v1',
        jobId,
        sourceVideoPath: manifest.source.sourceVideoPath,
        frames: framePaths.map((p, i) => ({
          index: i + 1,
          timestampSec: timestamps[i],
          path: `${JOBS_ROOT}/${jobId}/product_id_frames/frame_${String(i + 1).padStart(2, '0')}.jpg`,
        })),
        suggestion,
        verdict,
        minConfidence: MARKET_FIT_MIN_CONFIDENCE,
        apiCalled: true,
        model: 'gpt-4o-mini',
        generatedAt: isoNow(),
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  console.log(`📄 Suggestion artifact: ${suggestionPath}`);
  console.log(`   Sản phẩm nhận dạng: ${suggestion.productNameVi}`);
  console.log(`   Market-fit:         ${verdict.pass ? '✅ PASS' : '🛑 FAIL'} — ${verdict.reason}`);

  if (!verdict.pass) {
    manifest.state = 'FAILED';
    manifest.lastError = `MARKET_FIT_FAILED: ${verdict.reason}`;
    saveManifest(manifest);
    updateRegistryFromManifest(manifest);
    console.error('🛑 MARKET_FIT_FAILED — không sản xuất video cho sản phẩm không bán được.');
    process.exit(8);
  }

  // PASS → card AUTO_MARKET_FIT (KHÔNG link) + attach qua đúng CLI single-writer.
  const card = buildAutoMarketFitCard(suggestion, verdict, jobId, isoNow());
  const cardRel = `${JOBS_ROOT}/${jobId}/auto_product_card.json`;
  writeFileSync(resolve(cardRel), `${JSON.stringify(card, null, 2)}\n`, 'utf8');
  const attachExit = cmdAttachProduct(['--job', jobId, '--from-product', cardRel]);
  if (attachExit !== 0) {
    console.error(`🛑 AUTO_ATTACH_FAILED (attach-product exit ${attachExit})`);
    process.exit(10);
  }
  console.log('✅ Bước 0 hoàn tất: sản phẩm nhận dạng từ video đã gắn vào job (AUTO_MARKET_FIT).');
}

main().catch((err) => {
  console.error(`Unhandled error: ${(err as Error).message}`);
  process.exit(10);
});
