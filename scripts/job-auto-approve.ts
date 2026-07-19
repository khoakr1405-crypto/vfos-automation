// job:auto-approve (Phần 82) — PR-lane AI auto-approve worker.
//
// No-Go #3 relaxed by explicit Operator order (2026-07-18/19): this worker replaces
// the human approve click on the PASS branch ONLY. It runs the perceptual checks a
// human used to do by eye (hook, first-frame, caption legibility, GUARD-8 visual
// product match, watermark/glitch, audio health, semantic taste), writes
// auto_approve_report.json, and exits 0 (PASS) / 24 (FAIL) / 25 (NEEDS_HUMAN). The
// pipeline step reads the report + verdict; finalize-step applies the approval only on
// PASS. Any API/parse/missing-input error degrades a check to NEEDS_HUMAN — the worker
// never lets an exception surface as PASS. VFOS_AUTO_APPROVE(_REVIEW)=off → no-op exit 0.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { chatJson, chatVisionJson } from './ent-vlog/lib/openai.js';
import {
  AUTO_APPROVE_THRESHOLDS,
  type AutoApproveCheck,
  type AutoApproveReport,
  parseAutoApproveConfig,
  rollupVerdict,
  statusFromBandedScore,
  statusFromSoftScore,
} from './job-manager/core/auto-approve-core.js';
import {
  type FrameInfo,
  analyzeAudioHealth,
  downloadImageToFile,
  extractFrames,
  frameToBase64,
  getVideoDurationSec,
  withOpenAiRetry,
} from './job-manager/core/auto-approve-eval.js';
import { loadManifest } from './job-manager/core/manifest-io.js';
import { JOBS_ROOT } from './job-manager/core/paths.js';

const T = AUTO_APPROVE_THRESHOLDS;
const MODEL = 'gpt-4o';

interface VisionAShape {
  overallScore?: unknown;
  hookFirst3s?: unknown;
  firstFrameOk?: unknown;
  firstFrameReason?: unknown;
  captionLegibility?: unknown;
  watermarkOrGlitch?: unknown;
  watermarkReason?: unknown;
  reasons?: unknown;
}
interface VisionBShape {
  matchScore?: unknown;
  reasons?: unknown;
}
interface TasteShape {
  status?: unknown;
  reasons?: unknown;
}

function num(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN;
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** 12 timestamps: hook window (0.2/1/2/3) + 6 uniform middle + 2 in the last 2s. */
function buildTimestamps(d: number): number[] {
  const clamp = (t: number): number => Math.max(0.1, Math.min(d - 0.1, t));
  const hook = [0.2, 1, 2, 3];
  const midStart = 3.5;
  const midEnd = Math.max(midStart + 0.5, d - 2.5);
  const mid: number[] = [];
  for (let i = 0; i < 6; i++) mid.push(midStart + ((midEnd - midStart) * i) / 5);
  const end = [d - 1.5, d - 0.5];
  const all = [...hook, ...mid, ...end].map(clamp).sort((a, b) => a - b);
  const uniq: number[] = [];
  for (const t of all) {
    const last = uniq[uniq.length - 1];
    if (last === undefined || t - last > 0.05) uniq.push(Number(t.toFixed(2)));
  }
  return uniq;
}

function readJsonField(path: string, pick: (o: Record<string, unknown>) => string): string {
  try {
    const o = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
    return pick(o);
  } catch {
    return '';
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      job: { type: 'string' },
      lane: { type: 'string', default: 'review' },
      'confirm-openai': { type: 'boolean', default: false },
      'run-id': { type: 'string', default: 'auto_approve' },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = values.job as string | undefined;
  const runId = values['run-id'] as string;
  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const cfg = parseAutoApproveConfig(process.env);
  if (!cfg.review) {
    console.log('VFOS_AUTO_APPROVE review=off — auto-approve gate no-op.');
    return 0;
  }
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const jobDir = resolve(JOBS_ROOT, jobId);
  const outDir = join(jobDir, 'auto_approve');
  mkdirSync(outDir, { recursive: true });

  const checks: AutoApproveCheck[] = [];
  let overallScore = Number.NaN;
  let framesAnalyzed: FrameInfo[] = [];
  let apiCalled = false;

  const manifest = loadManifest(jobId);
  const captionedRel = manifest?.artifacts.captionedPreviewPath ?? null;
  const captionedAbs = captionedRel ? resolve(captionedRel) : null;

  // Fail-closed preconditions: no consent / no key / no video → NEEDS_HUMAN (never crash).
  if (!values['confirm-openai'] || !apiKey) {
    checks.push({
      key: 'consent',
      status: 'NEEDS_HUMAN',
      reasons: ['thiếu --confirm-openai hoặc OPENAI_API_KEY'],
    });
  } else if (!captionedAbs || !existsSync(captionedAbs)) {
    checks.push({
      key: 'input_video',
      status: 'NEEDS_HUMAN',
      reasons: ['không tìm thấy captioned final video'],
    });
  } else {
    // ---- Frame extraction ----
    const duration = getVideoDurationSec(captionedAbs);
    if (duration <= 0) {
      checks.push({
        key: 'input_video',
        status: 'NEEDS_HUMAN',
        reasons: ['ffprobe không đọc được duration'],
      });
    } else {
      framesAnalyzed = extractFrames(
        captionedAbs,
        buildTimestamps(duration),
        join(outDir, 'frames'),
      );
      if (framesAnalyzed.length < 4) {
        checks.push({
          key: 'input_video',
          status: 'NEEDS_HUMAN',
          reasons: [`chỉ trích được ${framesAnalyzed.length} frame`],
        });
      } else {
        const images = framesAnalyzed.map((f) => ({
          label: `${f.timestampSec}s`,
          base64: frameToBase64(f.path),
        }));

        // ---- Vision A: holistic + hook + first-frame + caption + watermark ----
        try {
          apiCalled = true;
          const a = await withOpenAiRetry(
            () =>
              chatVisionJson<VisionAShape>(apiKey, {
                model: MODEL,
                system:
                  'Bạn là người kiểm duyệt chất lượng KHẮT KHE cho video review sản phẩm affiliate tiếng Việt (dọc 9:16). Chỉ phán theo các frame được cung cấp (đã kèm mốc thời gian). Trả JSON: overallScore(0-10 "tôi có dám đăng không"), hookFirst3s(0-10 mấy frame đầu có hút không), firstFrameOk(bool: frame đầu KHÔNG đen/vỡ/viền đen, có chủ thể), firstFrameReason(string), captionLegibility(0-10: phụ đề dễ đọc, trong vùng an toàn, không che mặt/sản phẩm), watermarkOrGlitch(bool: còn watermark/logo nguồn, frame đơ/đen, lỗi hình), watermarkReason(string), reasons(mảng lý do ngắn).',
                userText: 'Chấm chất lượng video review từ các frame sau.',
                images,
              }),
            'visionA',
          );
          const overall = num(a.overallScore);
          overallScore = overall;
          const hook = num(a.hookFirst3s);
          const caption = num(a.captionLegibility);
          checks.push({
            key: 'hook_first3s',
            status: statusFromSoftScore(hook, T.hookFirst3s),
            score: hook,
            threshold: T.hookFirst3s,
            reasons: strArr(a.reasons),
          });
          checks.push({
            key: 'first_frame_quality',
            status:
              a.firstFrameOk === true ? 'PASS' : a.firstFrameOk === false ? 'FAIL' : 'NEEDS_HUMAN',
            reasons: typeof a.firstFrameReason === 'string' ? [a.firstFrameReason] : [],
          });
          checks.push({
            key: 'caption_legibility',
            status: statusFromSoftScore(caption, T.captionLegibility),
            score: caption,
            threshold: T.captionLegibility,
            reasons: [],
          });
          checks.push({
            key: 'visual_glitch_watermark',
            status:
              a.watermarkOrGlitch === true
                ? 'FAIL'
                : a.watermarkOrGlitch === false
                  ? 'PASS'
                  : 'NEEDS_HUMAN',
            reasons:
              typeof a.watermarkReason === 'string' && a.watermarkReason ? [a.watermarkReason] : [],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            key: 'vision_holistic',
            status: 'NEEDS_HUMAN',
            reasons: [`vision lỗi: ${msg.slice(0, 120)}`],
          });
        }

        // ---- Vision B: GUARD-8 visual product match (card image vs product frames) ----
        try {
          const cardPath = join(jobDir, 'product_card.json');
          const imgUrl = readJsonField(cardPath, (o) =>
            typeof o.productImageUrl === 'string' ? o.productImageUrl : '',
          );
          const refPath = join(outDir, 'product_ref.jpg');
          const gotRef = imgUrl ? await downloadImageToFile(imgUrl, refPath) : false;
          if (!gotRef) {
            checks.push({
              key: 'product_match_guard8_visual',
              status: 'NEEDS_HUMAN',
              reasons: ['không tải được ảnh sản phẩm từ card (productImageUrl)'],
            });
          } else {
            apiCalled = true;
            // 4 product-centric frames = middle slice of the extracted set.
            const midFrames = framesAnalyzed.slice(
              Math.floor(framesAnalyzed.length / 4),
              Math.floor(framesAnalyzed.length / 4) + 4,
            );
            const b = await withOpenAiRetry(
              () =>
                chatVisionJson<VisionBShape>(apiKey, {
                  model: MODEL,
                  system:
                    'So sánh ảnh REFERENCE (sản phẩm trên card affiliate) với các frame VIDEO. Có phải CÙNG một sản phẩm vật lý không (đối chiếu loại/hình dáng/màu/chất liệu)? Chống bait-and-switch. Trả JSON {matchScore: 0..1, reasons: []}. matchScore 1 = chắc chắn cùng sản phẩm, 0 = khác hẳn.',
                  userText: 'Frame đầu là REFERENCE (card), các frame sau là từ video.',
                  images: [
                    { label: 'REFERENCE', base64: frameToBase64(refPath) },
                    ...midFrames.map((f) => ({
                      label: `video ${f.timestampSec}s`,
                      base64: frameToBase64(f.path),
                    })),
                  ],
                }),
              'visionB',
            );
            const score = num(b.matchScore);
            checks.push({
              key: 'product_match_guard8_visual',
              status: statusFromBandedScore(score, T.productMatchPass, T.productMatchFail),
              score,
              threshold: T.productMatchPass,
              reasons: strArr(b.reasons),
            });
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            key: 'product_match_guard8_visual',
            status: 'NEEDS_HUMAN',
            reasons: [`match lỗi: ${msg.slice(0, 120)}`],
          });
        }

        // ---- Audio health (local ffmpeg, no API) ----
        try {
          const audio = analyzeAudioHealth(captionedAbs);
          const reasons: string[] = [];
          let status: AutoApproveCheck['status'] = 'PASS';
          if (!audio.hasAudio) {
            status = 'FAIL';
            reasons.push('không có audio stream');
          } else {
            if (audio.maxSilenceRunSec > T.deadAirMaxSec) {
              status = 'FAIL';
              reasons.push(
                `dead-air ${audio.maxSilenceRunSec.toFixed(1)}s (> ${T.deadAirMaxSec}s)`,
              );
            }
            if (audio.clipping) {
              status = status === 'FAIL' ? 'FAIL' : 'NEEDS_HUMAN';
              reasons.push(`clipping (max ${audio.maxVolumeDb} dB)`);
            }
          }
          checks.push({ key: 'audio_health', status, reasons });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            key: 'audio_health',
            status: 'NEEDS_HUMAN',
            reasons: [`audio lỗi: ${msg.slice(0, 120)}`],
          });
        }

        // ---- Semantic taste (text over final-QA transcript + captionDraft) ----
        try {
          const qaPath = join(jobDir, 'final_video_qa_report.json');
          const transcript = readJsonField(qaPath, (o) => {
            const t = o.transcript;
            return t &&
              typeof t === 'object' &&
              typeof (t as Record<string, unknown>).text === 'string'
              ? ((t as Record<string, unknown>).text as string)
              : '';
          });
          const caption = readJsonField(join(jobDir, 'script_artifact.json'), (o) =>
            typeof o.captionDraft === 'string' ? o.captionDraft : '',
          );
          apiCalled = true;
          const t = await withOpenAiRetry(
            () =>
              chatJson<TasteShape>(apiKey, {
                model: MODEL,
                system:
                  'Bạn duyệt "gu" cho video review affiliate tiếng Việt. Soi lời thoại (transcript) + caption: có tuyên bố phóng đại/gây hiểu lầm ngoài blocklist, giọng cringe/lệch tông, THIẾU CTA, hay từ dễ dính policy nền tảng không. Trả JSON {status: "PASS"|"FAIL"|"NEEDS_HUMAN", reasons: []}. FAIL nếu overclaim rõ/policy-risk; NEEDS_HUMAN nếu nghi ngờ.',
                user: `TRANSCRIPT:\n${transcript.slice(0, 2000)}\n\nCAPTION:\n${caption.slice(0, 500)}`,
              }),
            'taste',
          );
          const st = t.status;
          checks.push({
            key: 'semantic_taste',
            status: st === 'PASS' || st === 'FAIL' || st === 'NEEDS_HUMAN' ? st : 'NEEDS_HUMAN',
            reasons: strArr(t.reasons),
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            key: 'semantic_taste',
            status: 'NEEDS_HUMAN',
            reasons: [`taste lỗi: ${msg.slice(0, 120)}`],
          });
        }
      }
    }
  }

  const verdict = rollupVerdict(checks, overallScore);
  // Rough cost: 2 vision calls (12+5 low-detail imgs ≈ 85 tok each) + 1 text call.
  const costEstimateUsd = apiCalled ? 0.024 : 0;
  const report: AutoApproveReport = {
    reportVersion: 'v1',
    lane: 'review',
    jobId,
    runId,
    verdict,
    overallScore: Number.isFinite(overallScore) ? overallScore : 0,
    checks,
    framesAnalyzed,
    model: MODEL,
    apiCalled,
    costEstimateUsd,
    approvedBy: 'auto_gate',
    generatedAt: new Date().toISOString(),
  };
  const reportPath = join(outDir, 'auto_approve_report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

  console.log('======================================================');
  console.log(`🤖  AUTO-APPROVE (review) — ${jobId}`);
  console.log(`Verdict:      ${verdict}   overallScore=${report.overallScore}`);
  for (const c of checks)
    console.log(`  ${c.status.padEnd(11)} ${c.key}${c.score !== undefined ? ` (${c.score})` : ''}`);
  console.log(`Report:       ${reportPath}`);
  console.log('======================================================');

  return verdict === 'PASS' ? 0 : verdict === 'FAIL' ? 24 : 25;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(
      `🛑 AUTO_APPROVE_WORKER_CRASH: ${err instanceof Error ? err.message : String(err)}`,
    );
    // Fail-closed: a crash must never look like PASS. Exit 25 = NEEDS_HUMAN.
    process.exit(25);
  });
