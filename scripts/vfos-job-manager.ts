/**
 * VFOS Job Manager — pure CLI dispatcher (God-file anatomy hoàn tất 07/2026).
 * Toàn bộ logic lệnh: scripts/job-manager/commands/* · hạ tầng: scripts/job-manager/core/*.
 * Layering 1 chiều: dispatcher → commands → core. Không logic nghiệp vụ ở đây.
 */

import { cmdApproveCleanliness } from './job-manager/commands/approve-cleanliness.js';
import { cmdApprove } from './job-manager/commands/approve.js';
import { cmdAttachProduct } from './job-manager/commands/attach-product.js';
import { cmdAttachSource } from './job-manager/commands/attach-source.js';
import { cmdCreate } from './job-manager/commands/create.js';
import { cmdIntakeClean } from './job-manager/commands/intake-clean.js';
import { cmdList } from './job-manager/commands/list.js';
import { cmdPackage } from './job-manager/commands/package.js';
import { cmdReject } from './job-manager/commands/reject.js';
import { cmdRenderPlan } from './job-manager/commands/render-plan.js';
import { cmdRenderVideo } from './job-manager/commands/render-video.js';
import { cmdRunReview } from './job-manager/commands/run-review.js';
import { cmdScript } from './job-manager/commands/script.js';
import { cmdSourceInbox } from './job-manager/commands/source-inbox.js';
import { cmdStatus } from './job-manager/commands/status.js';

const COMMANDS: Record<string, (args: string[]) => number | Promise<number>> = {
  create: cmdCreate,
  'attach-product': cmdAttachProduct,
  'attach-source': cmdAttachSource,
  'source-inbox': cmdSourceInbox,
  'intake-clean': cmdIntakeClean,
  'approve-cleanliness': cmdApproveCleanliness,
  'run-review': cmdRunReview,
  script: cmdScript,
  'render-plan': cmdRenderPlan,
  'render-video': cmdRenderVideo,
  approve: cmdApprove,
  reject: cmdReject,
  package: cmdPackage,
  status: cmdStatus,
  list: cmdList,
};

const USAGE = `Usage:
  pnpm job:create        (--from-product <path> | --from-video-url <url>) [--channel <id>] [--batch <id>] [--dry-run]
  pnpm job:attach-product --job <jobId> --from-product <card.json> [--dry-run]
  pnpm job:attach-source --job <jobId> [--file <path|inbox-filename>] [--dry-run]
  pnpm job:source-inbox  [--job <jobId>]
  pnpm source:intake-clean --job <jobId> (--video-url "<url>" | --file "<path|inbox-filename>") [--provider unduhtiktok] [--dry-run]
  pnpm source:approve-cleanliness --job <jobId> --status pass|fail --notes "<notes>"
  pnpm job:run-review    --job <jobId> --file <path|inbox-filename> [--confirm-ai]
  pnpm job:script        --job <jobId> [--dry-run]
  pnpm job:render-plan   --job <jobId> [--confirm-tts] [--voice male|female] [--force] [--dry-run]
  pnpm job:render-video  --job <jobId> [--confirm-render] [--dry-run]
  pnpm job:approve       --job <jobId> [--notes "..."] [--dry-run]
  pnpm job:reject        --job <jobId> --notes "..." [--dry-run]
  pnpm job:package       --job <jobId> [--dry-run]
  pnpm job:status        --job <jobId>
  pnpm job:list`;

async function main(): Promise<number> {
  const [sub, ...rest] = process.argv.slice(2);
  const handler = sub ? COMMANDS[sub] : undefined;
  if (!handler) {
    console.error(USAGE);
    return 1;
  }
  return await handler(rest);
}

// Set exitCode and let the event loop drain naturally — process.exit() races
// async handle teardown on Windows (libuv UV_HANDLE_CLOSING) after HTTP fetch.
main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err) => {
    console.error(`Unhandled error: ${err?.message ?? err}`);
    process.exitCode = 1;
  });
