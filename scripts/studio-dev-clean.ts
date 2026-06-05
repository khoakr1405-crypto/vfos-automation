/**
 * VFOS Studio — clean dev restart guard.
 *
 * Fixes the recurring stale `.next` chunk error on the Studio app, e.g.:
 *   Runtime Error: Cannot find module './801.js'
 *   Require stack: apps/studio/.next/server/webpack-runtime.js ...
 *
 * Root cause: a `next dev` server stays alive (holding apps/studio/.next) while
 * a later `next build` — or a hot code update — rewrites that same `.next`. The
 * live dev server's webpack runtime then references chunk ids that no longer
 * match on disk. The cure is a clean restart, not a code change.
 *
 * This script: (1) kills ONLY the process holding port 3002, (2) deletes ONLY
 * apps/studio/.next, (3) starts a fresh `pnpm --filter @vfos/studio dev`.
 *
 * Flags:
 *   --dry-run    Print the actions; change nothing (safe to test).
 *   --no-start   Kill + clean only; do NOT start dev. Use this BEFORE running
 *                `pnpm --filter @vfos/studio build` so the build never collides
 *                with a live dev server.
 *
 * Safety: it removes exactly <repo>/apps/studio/.next (asserted inside the repo)
 * — never data/temp, runs/, production/, the link registry, or .env. It kills
 * only the PID(s) listening on port 3002, never a blanket node kill.
 *
 * Command: pnpm studio:dev:clean [--dry-run] [--no-start]
 */

import { execSync, spawnSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';

const PORT = 3002;

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml')) || existsSync(join(dir, 'pnpm-lock.yaml'))) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

/** PIDs listening on the given TCP port (Windows netstat / POSIX lsof). */
function pidsOnPort(port: number): number[] {
  const pids = new Set<number>();
  try {
    if (process.platform === 'win32') {
      const out = execSync('netstat -ano -p tcp', { encoding: 'utf8' });
      for (const line of out.split('\n')) {
        if (line.includes(`:${port} `) && /LISTENING/i.test(line)) {
          const m = line.trim().match(/(\d+)\s*$/);
          if (m) pids.add(Number(m[1]));
        }
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} -s tcp:LISTEN`, { encoding: 'utf8' });
      for (const l of out.split('\n')) {
        const n = Number(l.trim());
        if (n) pids.add(n);
      }
    }
  } catch {
    // No listener (or tool returned non-zero) → empty set.
  }
  return [...pids];
}

function killPid(pid: number, dryRun: boolean): void {
  if (dryRun) {
    console.log(`  [dry-run] would kill PID ${pid}`);
    return;
  }
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGKILL');
    }
    console.log(`  killed PID ${pid} (was holding port ${PORT})`);
  } catch (e) {
    console.warn(`  could not kill PID ${pid}: ${(e as Error).message}`);
  }
}

function main(): void {
  const argv = new Set(process.argv.slice(2));
  const dryRun = argv.has('--dry-run');
  const noStart = argv.has('--no-start');

  const root = resolve(findRepoRoot(resolve(process.cwd())));
  const nextDir = resolve(join(root, 'apps', 'studio', '.next'));

  // SAFETY GUARD: nextDir must sit INSIDE the repo and be exactly the
  // apps/studio/.next subtree — never the repo root or anything else.
  const relInsideRepo = sep + join('apps', 'studio', '.next');
  const isSafeTarget = nextDir.startsWith(root + sep) && nextDir === root + relInsideRepo;
  if (!isSafeTarget) {
    console.error('Refusing: .next path failed the safety check — aborting.');
    process.exit(1);
  }

  console.log(`VFOS Studio clean dev restart${dryRun ? ' (dry-run)' : ''}`);
  console.log(`  repo root : ${root}`);
  console.log(`  target    : ${nextDir}`);

  // 1) Free port 3002.
  const pids = pidsOnPort(PORT);
  if (pids.length === 0) {
    console.log(`  port ${PORT}: free`);
  } else {
    console.log(`  port ${PORT}: held by PID ${pids.join(', ')}`);
    for (const p of pids) killPid(p, dryRun);
  }

  // 2) Remove ONLY apps/studio/.next.
  if (existsSync(nextDir)) {
    if (dryRun) {
      console.log(`  [dry-run] would remove ${nextDir}`);
    } else {
      // maxRetries/retryDelay: on Windows a just-killed dev server may still
      // hold file handles on .next for a moment → rmSync can throw ENOTEMPTY/
      // EBUSY/EPERM. Node retries those errors with this option.
      rmSync(nextDir, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 });
      console.log('  removed apps/studio/.next');
    }
  } else {
    console.log('  .next: not present (nothing to remove)');
  }

  // 3) Start a fresh dev server (unless suppressed).
  if (noStart) {
    console.log('  --no-start: clean done, dev NOT started.');
    console.log('  Tip: run `pnpm --filter @vfos/studio build` now, then `pnpm studio:dev:clean`.');
    return;
  }
  if (dryRun) {
    console.log('  [dry-run] would start: pnpm --filter @vfos/studio dev');
    return;
  }
  console.log('  starting fresh dev server: pnpm --filter @vfos/studio dev');
  const res = spawnSync('pnpm', ['--filter', '@vfos/studio', 'dev'], {
    cwd: root,
    stdio: 'inherit',
    shell: true,
  });
  process.exit(res.status ?? 0);
}

main();
