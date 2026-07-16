/**
 * VFOS Review Video Orchestrator — THIN ENTRYPOINT (God-file anatomy 07/2026:
 * 1938 dòng → pipeline module hoá tại scripts/job-manager/pipeline/).
 *
 * Toàn bộ logic trạm: scripts/job-manager/pipeline/steps/* · hạ tầng dùng chung:
 * scripts/job-manager/{core,pipeline}/*. File này CHỈ parse CLI args, dựng
 * PipelineContext và gọi runReviewPipeline. Exit code + output giữ nguyên 100%.
 *
 * Modes (không đổi):
 *   pnpm chay:review                       — no-job mode (shared fixtures, pnpm chay)
 *   pnpm chay:review --job <jobId>         — job mode (render thẳng vào job folder)
 *   pnpm chay:review [--job <id>] --dry-run — chỉ in kế hoạch, không chạy lệnh
 *
 * Safety gates (không đổi): không gọi ElevenLabs/OpenAI khi thiếu cờ confirm;
 * không render placeholder testsrc; không publish/upload/click bất cứ thứ gì.
 */

import { parseArgs } from 'node:util';
import {
  DEFAULT_CAPTION_PRESET,
  DEFAULT_RUN_ID,
  createPipelineContext,
} from './job-manager/pipeline/context.js';
import { runReviewPipeline } from './job-manager/pipeline/run-review-pipeline.js';

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      run: { type: 'string', default: DEFAULT_RUN_ID },
      preset: { type: 'string', default: DEFAULT_CAPTION_PRESET },
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'confirm-elevenlabs': { type: 'boolean', default: false },
      'confirm-openai': { type: 'boolean', default: false },
      'confirm-ai': { type: 'boolean', default: false },
      'allow-no-bgm': { type: 'boolean', default: false },
      // Source-subtitle scrub MẶC ĐỊNH BẬT cho job mới. Guard tắt: cờ này HOẶC
      // manifest scrubSourceSubtitle=false.
      'skip-scrub-subtitle': { type: 'boolean', default: false },
      // Operator-only: vượt vision verdict gate (VISION_SOURCE_UNUSABLE). UI
      // không bao giờ truyền cờ này — chỉ Operator gõ tay khi xác nhận vision sai.
      'force-vision-unusable': { type: 'boolean', default: false },
      // Voice picker: female=HoaiMy / male=NamMinh cho bước sinh voiceover.
      voice: { type: 'string' },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values;

  const requestedVoice =
    values.voice === 'female' || values.voice === 'male'
      ? (values.voice as 'female' | 'male')
      : null;

  // --confirm-ai is the umbrella consent: it authorises OpenAI (vision/script/QA)
  // AND ElevenLabs (voice). Individual flags can also be passed explicitly.
  const confirmAi = Boolean(values['confirm-ai']);

  const ctx = createPipelineContext({
    runId: values.run as string,
    preset: values.preset as string,
    jobId: (values.job as string | undefined) ?? null,
    dryRun: Boolean(values['dry-run']),
    confirmOpenAi: Boolean(values['confirm-openai']) || confirmAi,
    confirmElevenLabs: Boolean(values['confirm-elevenlabs']) || confirmAi,
    allowNoBgm: Boolean(values['allow-no-bgm']),
    skipScrubSubtitle: Boolean(values['skip-scrub-subtitle']),
    forceVisionUnusable: Boolean(values['force-vision-unusable']),
    requestedVoice,
  });

  runReviewPipeline(ctx);
}

main().catch((err) => {
  console.error('Unhandled orchestrator error:', err);
  process.exit(1);
});
