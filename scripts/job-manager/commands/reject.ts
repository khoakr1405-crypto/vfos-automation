// `reject` command (extracted from scripts/vfos-job-manager.ts — God-file anatomy
// Nhịp 3). Byte-identical move; logic unchanged.

import { parseArgs } from 'node:util';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import {
  entryFromManifest,
  loadRegistry,
  productNameFromManifest,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';

export function cmdReject(args: string[]): number {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      notes: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const jobId = parsed.values.job as string | undefined;
  const notes = ((parsed.values.notes as string | undefined) ?? '').trim() || null;
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  // Reject must always carry an operator reason.
  if (!notes) {
    console.error('🛑 REJECT_NOTES_REQUIRED: --notes "<reason>" is required to reject a job.');
    return 3;
  }

  // A packaged/published job is a downstream terminal state; do not unwind it here.
  if (manifest.state === 'PACKAGED') {
    console.error(`🛑 INVALID_STATE_FOR_REJECT: job is ${manifest.state}; cannot reject.`);
    return 4;
  }

  console.log('======================================================');
  console.log(`⛔  VFOS Job Manager — reject  ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Current state:     ${manifest.state}`);
  console.log(`Notes:             ${notes}`);
  console.log(`New state:         REJECTED`);
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: no manifest mutation, no registry update. (Artifacts kept.)');
    return 0;
  }

  manifest.state = 'REJECTED';
  manifest.review = {
    operatorDecision: 'REJECTED',
    approvedAt: null,
    rejectedAt: isoNow(),
    notes,
  };
  saveManifest(manifest);

  const reg = loadRegistry();
  upsertRegistryEntry(reg, entryFromManifest(manifest, productNameFromManifest(manifest)));
  saveRegistry(reg);

  console.log('⛔ Job REJECTED. Artifacts kept (not deleted). No publish.');
  return 0;
}
