// Console/subprocess helpers của review pipeline (extracted from
// review-video-orchestrator — God-file anatomy N2). Behavior-preserving move.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { StatusArtifact } from './status-artifact.js';

export function printHeader(title: string): void {
  console.log('======================================================');
  console.log(title);
  console.log('======================================================');
}

export function printDivider(): void {
  console.log('------------------------------------------------------');
}

// GIỮ NGUYÊN shell:true (behavior-preserving — spawn `pnpm` .cmd trên Windows).
// Chuẩn hoá về shell:false + tsx-cli trực tiếp là LOGIC CHANGE → round hardening riêng.
export function runCommand(label: string, command: string, args: string[]): number {
  console.log(`\n>>> ${label}`);
  console.log(`>>> ${command} ${args.join(' ')}`);
  const result = spawnSync(command, args, { stdio: 'inherit', shell: true });
  return result.status ?? 1;
}

export function readPreviewArtifactFromPath(
  artifactPath: string,
): StatusArtifact['previewArtifact'] {
  if (!existsSync(artifactPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(artifactPath, 'utf8')) as Record<string, unknown>;
    return {
      rendered: Boolean(raw.rendered),
      hasRealFixture: Boolean(raw.hasRealFixture),
      offlinePlaceholderOnly: Boolean(raw.offlinePlaceholderOnly),
    };
  } catch {
    return null;
  }
}

export function readPreviewArtifact(runId: string): StatusArtifact['previewArtifact'] {
  const path = resolve('data/temp/pipeline-p9-demo', runId, 'preview_artifact.json');
  return readPreviewArtifactFromPath(path);
}
