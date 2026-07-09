// `list` command (extracted from scripts/vfos-job-manager.ts — God-file anatomy
// Nhịp 2). Behavior-preserving verbatim move.

import { REGISTRY_PATH } from '../core/paths.js';
import { loadRegistry } from '../core/registry-io.js';

export function cmdList(_args: string[]): number {
  const reg = loadRegistry();
  console.log('======================================================');
  console.log(`📋  VFOS Job Registry — ${reg.jobs.length} job(s)`);
  console.log('======================================================');
  if (reg.jobs.length === 0) {
    console.log('(empty — create one with `pnpm job:create --from-product <path>`)');
    return 0;
  }

  const header = ['JOB ID', 'STATE', 'SRC', 'CAPTIONED', 'REVIEW', 'PRODUCT'];
  const rows = reg.jobs.map((j) => [
    j.jobId,
    j.state,
    j.sourceVideoPath ? '✅' : '❌',
    j.captionedPreviewPath ? '✅' : '❌',
    j.operatorDecision,
    j.productName ? j.productName.slice(0, 40) : '(unknown)',
  ]);

  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const fmt = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const row of rows) console.log(fmt(row));
  console.log('------------------------------------------------------');
  console.log(`Registry: ${REGISTRY_PATH}`);
  return 0;
}
