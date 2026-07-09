// Operator video inbox helpers (extracted from scripts/vfos-job-manager.ts —
// God-file anatomy Nhịp 1). Behavior-preserving verbatim move.

import { mkdirSync, readdirSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { OPERATOR_VIDEO_INBOX, VALID_VIDEO_EXTS } from './paths.js';

/** Ensure the operator video inbox exists; returns its absolute path. */
export function ensureOperatorInbox(): string {
  const abs = resolve(OPERATOR_VIDEO_INBOX);
  mkdirSync(abs, { recursive: true });
  return abs;
}

/** List video files currently in the operator inbox (sorted, newest first). */
export function listInboxVideos(): { name: string; sizeBytes: number; mtimeMs: number }[] {
  const abs = ensureOperatorInbox();
  let names: string[] = [];
  try {
    names = readdirSync(abs);
  } catch {
    return [];
  }
  const vids: { name: string; sizeBytes: number; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!VALID_VIDEO_EXTS.has(extname(name).toLowerCase())) continue;
    try {
      const st = statSync(join(abs, name));
      if (st.isFile()) vids.push({ name, sizeBytes: st.size, mtimeMs: st.mtimeMs });
    } catch {
      /* skip unreadable entries */
    }
  }
  return vids.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/** Print the inbox contents + how to attach. Never auto-attaches. */
export function printInboxListing(jobId?: string): void {
  const vids = listInboxVideos();
  console.log(`Operator video inbox: ${OPERATOR_VIDEO_INBOX}/`);
  if (vids.length === 0) {
    console.log('  (empty) — drop a .mp4/.mov/.webm/.m4v file here, then re-run.');
    return;
  }
  console.log(`  ${vids.length} video(s) found:`);
  for (let i = 0; i < vids.length; i++) {
    const v = vids[i];
    console.log(`   [${i + 1}] ${v.name}  (${(v.sizeBytes / 1_000_000).toFixed(2)} MB)`);
  }
  const j = jobId ?? '<jobId>';
  console.log('\nAttach the one you want (Operator chooses — never auto-attached):');
  for (const v of vids) {
    console.log(`  pnpm job:attach-source --job ${j} --file "${v.name}"`);
  }
}
