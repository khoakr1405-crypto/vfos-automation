// Shared approval mutation (Phần 82) — single source of truth for "mark a job
// APPROVED". Used by the manual `approve` command AND the auto-approve finalize path
// so both flip state + registry identically. Lives in core so neither the command
// tree nor the pipeline tree imports the other.

import { isoNow, saveManifest } from './manifest-io.js';
import {
  entryFromManifest,
  loadRegistry,
  productNameFromManifest,
  saveRegistry,
  upsertRegistryEntry,
} from './registry-io.js';
import type { JobManifest } from './types.js';

/**
 * Flip a manifest to APPROVED and upsert the registry — the exact mutation the manual
 * approve command has always performed. Gates (READY state, QA PASS, preview present)
 * are the caller's responsibility; this only writes the decision.
 */
export function applyApprovalMutation(manifest: JobManifest, notes: string | null): void {
  manifest.state = 'APPROVED';
  manifest.review = {
    operatorDecision: 'APPROVED',
    approvedAt: isoNow(),
    rejectedAt: null,
    notes,
  };
  saveManifest(manifest);

  const reg = loadRegistry();
  upsertRegistryEntry(reg, entryFromManifest(manifest, productNameFromManifest(manifest)));
  saveRegistry(reg);
}
