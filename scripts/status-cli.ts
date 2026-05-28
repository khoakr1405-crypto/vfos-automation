/**
 * Status CLI — Terminal dashboard for VFOS pipeline runs.
 *
 * Two modes:
 * 1. Online: queries the kernel HTTP API at http://localhost:3000/api/runs
 * 2. Offline: reads the persisted runs.json directly from disk (fallback)
 *
 * Usage:
 *   pnpm status                  — list all runs (online → offline fallback)
 *   pnpm status -- --offline     — force offline mode (read JSON file)
 *   pnpm status -- --seed        — seed demo data via POST /api/runs/demo
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';

// ── CLI Args ─────────────────────────────────────────────────────────────

const { values } = parseArgs({
  options: {
    offline: { type: 'boolean', default: false },
    seed: { type: 'boolean', default: false },
    limit: { type: 'string', default: '20' },
    status: { type: 'string' },
  },
  allowPositionals: false,
  strict: true,
});

const KERNEL_URL = process.env.KERNEL_URL ?? 'http://localhost:3000';

// ── Types ────────────────────────────────────────────────────────────────

interface PipelineRun {
  run_id: string;
  lane: string;
  video_id: string | null;
  product_id: string | null;
  status: string;
  current_step: string | null;
  steps_completed: number;
  steps_total: number;
  started_at: string;
  updated_at: string;
  completed_at: string | null;
  error: string | null;
}

// ── Data Fetching ────────────────────────────────────────────────────────

async function fetchOnline(limit: number, status?: string): Promise<PipelineRun[] | null> {
  try {
    let url = `${KERNEL_URL}/api/runs?limit=${limit}`;
    if (status) url += `&status=${status}`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(3000) });
    if (!resp.ok) return null;
    const json = (await resp.json()) as { ok: boolean; runs: PipelineRun[] };
    return json.ok ? json.runs : null;
  } catch {
    return null;
  }
}

function fetchOffline(): PipelineRun[] {
  // Walk up from CWD to find workspace root (pnpm-workspace.yaml)
  let dir = process.cwd();
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) break;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  const runsPath = join(dir, 'data', 'pipeline', 'runs.json');
  try {
    if (!existsSync(runsPath)) return [];
    const raw = readFileSync(runsPath, 'utf8');
    return JSON.parse(raw) as PipelineRun[];
  } catch {
    return [];
  }
}

async function seedDemo(): Promise<void> {
  try {
    const resp = await fetch(`${KERNEL_URL}/api/runs/demo`, {
      method: 'POST',
      signal: AbortSignal.timeout(3000),
    });
    const json = (await resp.json()) as { ok: boolean; message: string; runs: string[] };
    if (json.ok) {
      console.log(`✅ ${json.message}`);
      console.log(`   Run IDs: ${json.runs.join(', ')}`);
    } else {
      console.error('❌ Failed to seed demo data');
    }
  } catch (err) {
    console.error('❌ Cannot reach kernel. Is `pnpm dev` running?');
  }
}

// ── Rendering ────────────────────────────────────────────────────────────

const STATUS_ICONS: Record<string, string> = {
  pending: '⏸️ ',
  running: '⏳',
  completed: '✅',
  failed: '❌',
  paused: '⏸️ ',
};

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length);
}

function renderTable(runs: PipelineRun[]): void {
  if (runs.length === 0) {
    console.log('\n  No pipeline runs found.\n');
    console.log('  Tip: Run `pnpm status -- --seed` to create demo data (requires kernel running).\n');
    return;
  }

  const COL = { id: 14, subject: 12, step: 18, progress: 10, status: 12, error: 40 };
  const HR = '─';

  console.log('');
  console.log(
    `  ${pad('Run ID', COL.id)} ${pad('Subject', COL.subject)} ${pad('Current Step', COL.step)} ${pad('Progress', COL.progress)} ${pad('Status', COL.status)} ${pad('Error', COL.error)}`,
  );
  console.log(
    `  ${HR.repeat(COL.id)} ${HR.repeat(COL.subject)} ${HR.repeat(COL.step)} ${HR.repeat(COL.progress)} ${HR.repeat(COL.status)} ${HR.repeat(COL.error)}`,
  );

  for (const run of runs) {
    const icon = STATUS_ICONS[run.status] ?? '? ';
    const subject = run.video_id ?? run.product_id ?? '—';
    const step = run.current_step ?? (run.status === 'completed' ? '(done)' : '—');
    const progress = `${run.steps_completed}/${run.steps_total}`;
    const shortId = run.run_id.slice(-10);
    const error = run.error ? run.error.slice(0, COL.error) : '';

    console.log(
      `  ${pad(shortId, COL.id)} ${pad(subject, COL.subject)} ${pad(step, COL.step)} ${pad(progress, COL.progress)} ${pad(`${icon} ${run.status}`, COL.status)} ${error}`,
    );
  }
  console.log('');
}

function renderSummary(runs: PipelineRun[]): void {
  const total = runs.length;
  const counts: Record<string, number> = {};
  for (const r of runs) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }
  const parts = Object.entries(counts)
    .map(([status, count]) => `${STATUS_ICONS[status] ?? ''} ${status}: ${count}`)
    .join('  │  ');
  console.log(`  Total: ${total}  │  ${parts}`);
  console.log('');
}

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('');
  console.log('  ╔══════════════════════════════════════╗');
  console.log('  ║     VFOS Pipeline Status Dashboard   ║');
  console.log('  ╚══════════════════════════════════════╝');

  if (values.seed) {
    await seedDemo();
    console.log('');
    // After seeding, show the table
  }

  const limit = Number(values.limit) || 20;
  let runs: PipelineRun[];
  let source: string;

  if (values.offline) {
    runs = fetchOffline();
    source = 'offline (data/pipeline/runs.json)';
  } else {
    const online = await fetchOnline(limit, values.status);
    if (online !== null) {
      runs = online;
      source = `online (${KERNEL_URL})`;
    } else {
      runs = fetchOffline();
      source = 'offline fallback (kernel unreachable)';
    }
  }

  console.log(`  Source: ${source}`);

  renderTable(runs);
  if (runs.length > 0) {
    renderSummary(runs);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
