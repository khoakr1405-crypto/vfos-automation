// Self-contained .env loader for the entertainment-lane E1 CLI scripts.
// Mirrors packages/script-writer/src/load-env.ts logic but kept local so the
// scripts/ tree has no cross-package import dependency. Reads OPENAI_API_KEY
// from the workspace-root .env without printing the value anywhere.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

export function loadEnv(): void {
  const root = findWorkspaceRoot(process.cwd());
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const val = trimmed
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

export function requireOpenAIKey(): string {
  loadEnv();
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    console.error('🛑 MISSING_OPENAI_CREDENTIALS: OPENAI_API_KEY not set in .env');
    process.exit(1);
  }
  return key;
}

/** Resolve <repoRoot>/data/temp/ent/<id> work dir for a given clip-set id. */
export function workDir(id: string): string {
  const root = findWorkspaceRoot(process.cwd());
  return join(root, 'data', 'temp', 'ent', id);
}
