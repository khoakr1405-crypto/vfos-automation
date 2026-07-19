import { spawnSync } from 'node:child_process';
// E1 step 18 — ENT-lane AI auto-approve gate (Phần 82).
//
// No-Go #3 relaxed by explicit Operator order: this replaces the human GATE 2 "Duyệt
// video" click on PASS. It ONLY writes data/temp/ent/<id>/auto_approve_report.json —
// ownership of ent_job.json stays with jobs.ts, which reads this report during
// getJobDetail reconcile and applies previewApproved only on PASS (and only if every
// approvePreview guard already holds). Because a non-PASS is NOT a pipeline failure (the
// video is rendered + reviewable by a human), this step ALWAYS exits 0 — never breaking
// the produce chain. VFOS_AUTO_APPROVE(_ENT)=off → no-op exit 0.
//   pnpm tsx scripts/ent-vlog/18-auto-approve.ts --id <ent_job_id>
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  AUTO_APPROVE_THRESHOLDS,
  type AutoApproveCheck,
  type AutoApproveReport,
  parseAutoApproveConfig,
  rollupVerdict,
  statusFromSoftScore,
  tokenOverlapSimilarity,
} from '../job-manager/core/auto-approve-core.js';
import {
  type FrameInfo,
  analyzeAudioHealth,
  extractFrames,
  frameToBase64,
  getVideoDurationSec,
  withOpenAiRetry,
} from '../job-manager/core/auto-approve-eval.js';
import { loadEnv, workDir } from './lib/env.js';
import { chatJson, chatVisionJson, transcribe } from './lib/openai.js';

const T = AUTO_APPROVE_THRESHOLDS;
const MODEL = 'gpt-4o';
const RENDER_CANDIDATES = ['montage_v2_short_ambient.mp4', 'montage_v2_short.mp4'];

interface VisionShape {
  overallScore?: unknown;
  hookFirst3s?: unknown;
  captionLegibility?: unknown;
  chineseTextDetected?: unknown;
  chineseReason?: unknown;
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
function buildTimestamps(d: number): number[] {
  const clamp = (t: number): number => Math.max(0.1, Math.min(d - 0.1, t));
  const raw = [
    0.2,
    1,
    2,
    3,
    ...Array.from({ length: 6 }, (_, i) => 3.5 + ((d - 6) * i) / 5),
    d - 1.5,
    d - 0.5,
  ];
  const uniq: number[] = [];
  for (const t of raw.map(clamp).sort((a, b) => a - b)) {
    const last = uniq[uniq.length - 1];
    if (last === undefined || t - last > 0.05) uniq.push(Number(t.toFixed(2)));
  }
  return uniq;
}

function readScriptText(dir: string): string {
  try {
    const j = JSON.parse(
      readFileSync(join(dir, 'montage_v2', 'montage_v2_script.json'), 'utf8'),
    ) as {
      beats?: Array<{ text?: unknown }>;
    };
    return (j.beats ?? [])
      .map((b) => (typeof b.text === 'string' ? b.text : ''))
      .join(' ')
      .trim();
  } catch {
    return '';
  }
}

async function main(): Promise<number> {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id || !/^ent_[a-z0-9_]+$/.test(id)) {
    console.error('Usage: --id <ent_slug>');
    return 0; // fail-open on bad-arg: never break the chain (nothing evaluated)
  }
  const cfg = parseAutoApproveConfig(process.env);
  if (!cfg.ent) {
    console.log('[18] VFOS_AUTO_APPROVE ent=off — auto-approve gate no-op.');
    return 0;
  }
  loadEnv();
  const apiKey = process.env.OPENAI_API_KEY ?? '';
  const dir = workDir(id);
  const outPath = join(dir, 'auto_approve_report.json');
  mkdirSync(dir, { recursive: true });

  const checks: AutoApproveCheck[] = [];
  let overallScore = Number.NaN;
  let framesAnalyzed: FrameInfo[] = [];
  let apiCalled = false;

  const videoRel = RENDER_CANDIDATES.find((c) => existsSync(join(dir, c)));
  const videoAbs = videoRel ? join(dir, videoRel) : null;

  if (!apiKey) {
    checks.push({ key: 'consent', status: 'NEEDS_HUMAN', reasons: ['thiếu OPENAI_API_KEY'] });
  } else if (!videoAbs) {
    checks.push({
      key: 'input_video',
      status: 'NEEDS_HUMAN',
      reasons: ['không tìm thấy final video (ambient)'],
    });
  } else {
    const duration = getVideoDurationSec(videoAbs);
    if (duration <= 0) {
      checks.push({
        key: 'input_video',
        status: 'NEEDS_HUMAN',
        reasons: ['ffprobe không đọc được duration'],
      });
    } else {
      framesAnalyzed = extractFrames(
        videoAbs,
        buildTimestamps(duration),
        join(dir, 'auto_approve_frames'),
      );
      if (framesAnalyzed.length < 4) {
        checks.push({
          key: 'input_video',
          status: 'NEEDS_HUMAN',
          reasons: [`chỉ trích được ${framesAnalyzed.length} frame`],
        });
      } else {
        // ---- Vision: hook + caption legibility/localization + residual Chinese backstop ----
        try {
          apiCalled = true;
          const a = await withOpenAiRetry(
            () =>
              chatVisionJson<VisionShape>(apiKey, {
                model: MODEL,
                system:
                  'Bạn kiểm duyệt chất lượng video vlog giải trí tiếng Việt (dọc 9:16, reup Việt hóa từ nguồn Trung). Chỉ phán theo frame. Trả JSON: overallScore(0-10 "dám đăng không"), hookFirst3s(0-10), captionLegibility(0-10: phụ đề VIỆT dễ đọc, tự nhiên, đúng vùng an toàn), chineseTextDetected(bool: CÒN chữ Trung/title-card Trung trên MỌI frame — đây là backstop cho 17-hook-verify), chineseReason(string), reasons(mảng ngắn).',
                userText: 'Chấm chất lượng vlog từ các frame sau (kèm mốc giây).',
                images: framesAnalyzed.map((f) => ({
                  label: `${f.timestampSec}s`,
                  base64: frameToBase64(f.path),
                })),
              }),
            'ent-vision',
          );
          overallScore = num(a.overallScore);
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
            key: 'caption_legibility_localization',
            status: statusFromSoftScore(caption, T.captionLegibility),
            score: caption,
            threshold: T.captionLegibility,
            reasons: [],
          });
          checks.push({
            key: 'residual_chinese_text',
            status:
              a.chineseTextDetected === true
                ? 'FAIL'
                : a.chineseTextDetected === false
                  ? 'PASS'
                  : 'NEEDS_HUMAN',
            reasons:
              typeof a.chineseReason === 'string' && a.chineseReason ? [a.chineseReason] : [],
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            key: 'ent_vision',
            status: 'NEEDS_HUMAN',
            reasons: [`vision lỗi: ${msg.slice(0, 120)}`],
          });
        }

        // ---- Audio dead-air (local ffmpeg) ----
        try {
          const audio = analyzeAudioHealth(videoAbs);
          const reasons: string[] = [];
          let status: AutoApproveCheck['status'] = 'PASS';
          if (!audio.hasAudio) {
            status = 'FAIL';
            reasons.push('không có audio stream');
          } else if (audio.maxSilenceRunSec > T.deadAirMaxSec) {
            status = 'FAIL';
            reasons.push(`dead-air ${audio.maxSilenceRunSec.toFixed(1)}s (> ${T.deadAirMaxSec}s)`);
          }
          checks.push({ key: 'audio_deadair', status, reasons });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            key: 'audio_deadair',
            status: 'NEEDS_HUMAN',
            reasons: [`audio lỗi: ${msg.slice(0, 120)}`],
          });
        }

        const scriptText = readScriptText(dir);

        // ---- Voice vs script STT (whisper vi vs VN script) ----
        try {
          if (!scriptText) {
            checks.push({
              key: 'voice_vs_script_stt',
              status: 'NEEDS_HUMAN',
              reasons: ['thiếu script VN để đối chiếu'],
            });
          } else {
            const audioTmp = join(dir, 'auto_approve_audio.mp3');
            const ff = spawnSync(
              'ffmpeg',
              ['-y', '-i', videoAbs, '-vn', '-ar', '16000', '-ac', '1', audioTmp],
              { encoding: 'utf8' },
            );
            if (ff.status !== 0 || !existsSync(audioTmp)) {
              checks.push({
                key: 'voice_vs_script_stt',
                status: 'NEEDS_HUMAN',
                reasons: ['không tách được audio để STT'],
              });
            } else {
              apiCalled = true;
              const asr = await withOpenAiRetry(
                () => transcribe(apiKey, audioTmp, 'vi'),
                'ent-stt',
              );
              const overlap = tokenOverlapSimilarity(scriptText, asr.text);
              checks.push({
                key: 'voice_vs_script_stt',
                status: overlap >= T.sttOverlap ? 'PASS' : 'NEEDS_HUMAN',
                score: Number(overlap.toFixed(3)),
                threshold: T.sttOverlap,
                reasons:
                  overlap >= T.sttOverlap
                    ? []
                    : [
                        `giọng đọc khớp script ${(overlap * 100).toFixed(0)}% (< ${T.sttOverlap * 100}%)`,
                      ],
              });
            }
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          checks.push({
            key: 'voice_vs_script_stt',
            status: 'NEEDS_HUMAN',
            reasons: [`STT lỗi: ${msg.slice(0, 120)}`],
          });
        }

        // ---- Semantic taste (VN script) ----
        try {
          if (!scriptText) {
            checks.push({
              key: 'semantic_taste',
              status: 'NEEDS_HUMAN',
              reasons: ['thiếu script để soi taste'],
            });
          } else {
            apiCalled = true;
            const t = await withOpenAiRetry(
              () =>
                chatJson<TasteShape>(apiKey, {
                  model: MODEL,
                  system:
                    'Bạn duyệt "gu" cho vlog giải trí tiếng Việt (reup Việt hóa). Soi lời thoại VN: có phóng đại/gây hiểu lầm, giọng cringe/lệch tông, hay từ dễ dính policy nền tảng không. Trả JSON {status:"PASS"|"FAIL"|"NEEDS_HUMAN", reasons:[]}.',
                  user: `LỜI THOẠI VN:\n${scriptText.slice(0, 2500)}`,
                }),
              'ent-taste',
            );
            const st = t.status;
            checks.push({
              key: 'semantic_taste',
              status: st === 'PASS' || st === 'FAIL' || st === 'NEEDS_HUMAN' ? st : 'NEEDS_HUMAN',
              reasons: strArr(t.reasons),
            });
          }
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
  const report: AutoApproveReport = {
    reportVersion: 'v1',
    lane: 'ent',
    jobId: id,
    runId: 'ent_produce',
    verdict,
    overallScore: Number.isFinite(overallScore) ? overallScore : 0,
    checks,
    framesAnalyzed,
    model: MODEL,
    apiCalled,
    costEstimateUsd: apiCalled ? 0.029 : 0,
    approvedBy: 'auto_gate',
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`[18] AUTO-APPROVE (ent) verdict=${verdict} overall=${report.overallScore}`);
  for (const c of checks)
    console.log(
      `[18]   ${c.status.padEnd(11)} ${c.key}${c.score !== undefined ? ` (${c.score})` : ''}`,
    );
  console.log(`[18] Report: ${outPath}`);
  return 0; // always 0 — verdict lives in the report; reconcile applies it
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    // Fail-safe: even a crash must not break the produce chain. The absent/partial
    // report simply means the human GATE 2 stands (reconcile won't auto-approve).
    console.error(
      `[18] AUTO_APPROVE_ENT_CRASH: ${err instanceof Error ? err.message : String(err)}`,
    );
    process.exit(0);
  });
