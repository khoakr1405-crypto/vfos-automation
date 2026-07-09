// `source-inbox` command (extracted from scripts/vfos-job-manager.ts — God-file
// anatomy Nhịp 2). Behavior-preserving verbatim move.

import { parseArgs } from 'node:util';
import { printInboxListing } from '../core/inbox.js';

export function cmdSourceInbox(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: { job: { type: 'string' } },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;

  console.log('======================================================');
  console.log('🎞️  VFOS Operator Video Source Inbox');
  console.log('======================================================');
  printInboxListing(jobId);
  return 0;
}
