// E1 step 20 — pipeline orchestrator (UI-facing). Runs a LOGICAL step of the
// entertainment lane as a SINGLE process so the Studio API can detach it and
// poll status. It does NOT fork engine logic — it only sequences the existing
// numbered CLI steps and records progress to data/temp/ent/<id>/steps/<step>.json.
//
//   analyze  = 02-asr-zh -> 03b-vision-anchor -> 03-clip-mine
//   montage  = 10-montage-v2
//   script   = 13-source-bound (--model)
//   render   = 12-voice-render -> 15-audio-ambient-full (audio policy đã chốt:
//              bỏ giọng Trung bằng Demucs no_vocals, GIỮ ambient biển/gió/nước)
//   produce  = analyze + 03c-coverage + montage + script + render (FULL → GATE 2)
//              (03c = chọn anchors từ catch_moments + GATE chặn thiếu cảnh ăn tiền)
//
// Isolation: writes only inside data/temp/ent/<id>/. No publish, no registry.
// CỔNG DUY NHẤT là Duyệt video (GATE 2): "produce" chạy nguyên chuỗi tới preview
// rồi DỪNG; KHÔNG có gate duyệt script giữa chừng (đã gộp). Video chỉ "xong" khi
// cả 12+15 hoàn tất nên UI không hiện preview lúc đang render.
//   pnpm tsx scripts/ent-vlog/20-pipeline.ts --id ent_squid_001 --step produce [--model gpt-5.5]
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { findWorkspaceRoot, workDir } from './lib/env.js';

type StepName = 'analyze' | 'montage' | 'script' | 'produce' | 'render';
const STEP_NAMES = new Set<StepName>(['analyze', 'montage', 'script', 'produce', 'render']);

interface SubSpec {
  name: string; // numbered script basename (no .ts)
  args: string[];
}
interface SubStatus {
  name: string;
  state: 'running' | 'done' | 'failed';
  startedAt: string;
  finishedAt?: string;
  ms?: number;
  exitCode?: number | null;
}
interface StepStatus {
  step: StepName;
  state: 'running' | 'done' | 'failed';
  pid: number; // để API phát hiện process chết (status treo 'running')
  startedAt: string;
  finishedAt?: string;
  subs: SubStatus[];
  error?: string;
}

function subsFor(step: StepName, model: string): SubSpec[] {
  const analyze: SubSpec[] = [
    { name: '02-asr-zh', args: [] },
    { name: '03b-vision-anchor', args: [] },
    { name: '03-clip-mine', args: [] },
  ];
  // coverage = chọn anchors từ catch_moments + GATE chặn khi thiếu cảnh ăn tiền.
  const coverage: SubSpec[] = [{ name: '03c-moneyshot-coverage', args: [] }];
  const montage: SubSpec[] = [{ name: '10-montage-v2', args: [] }];
  const script: SubSpec[] = [{ name: '13-source-bound', args: ['--model', model] }];
  // render = lồng tiếng/caption (12) + áp audio policy remove_speech_keep_ambient (15).
  const render: SubSpec[] = [
    { name: '12-voice-render', args: [] },
    { name: '15-audio-ambient-full', args: [] },
  ];
  if (step === 'analyze') return analyze;
  if (step === 'montage') return montage;
  if (step === 'script') return script;
  if (step === 'render') return render;
  // produce = FULL chain → GATE 2. Coverage chèn NGẦM giữa vision và montage.
  return [...analyze, ...coverage, ...montage, ...script, ...render];
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, step: { type: 'string' }, model: { type: 'string' } },
    strict: true,
  });
  const id = values.id;
  const step = (values.step ?? 'produce') as StepName;
  const model = values.model ?? 'gpt-5.5';
  if (!id || !/^ent_[a-z0-9_]+$/.test(id)) {
    console.error('Usage: --id <ent_slug> --step <analyze|montage|script|produce> [--model]');
    process.exit(1);
  }
  if (!STEP_NAMES.has(step)) {
    console.error(`Bad --step ${step}`);
    process.exit(1);
  }

  const root = findWorkspaceRoot(process.cwd());
  const tsxCli = join(root, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const dir = workDir(id);
  if (!existsSync(dir)) {
    console.error(`🛑 work dir missing: ${dir}`);
    process.exit(1);
  }
  const stepsDir = join(dir, 'steps');
  mkdirSync(stepsDir, { recursive: true });
  const statusPath = join(stepsDir, `${step}.json`);

  const status: StepStatus = {
    step,
    state: 'running',
    pid: process.pid,
    startedAt: new Date().toISOString(),
    subs: [],
  };
  const flush = () => writeFileSync(statusPath, JSON.stringify(status, null, 2));
  flush();

  const subs = subsFor(step, model);
  for (const spec of subs) {
    const sub: SubStatus = {
      name: spec.name,
      state: 'running',
      startedAt: new Date().toISOString(),
    };
    status.subs.push(sub);
    flush();
    const t0 = Date.now();
    console.log(`[20] ▶ ${spec.name} ${spec.args.join(' ')}`);
    const scriptRel = join('scripts', 'ent-vlog', `${spec.name}.ts`);
    const r = spawnSync(process.execPath, [tsxCli, scriptRel, '--id', id, ...spec.args], {
      cwd: root,
      encoding: 'utf8',
      env: { ...process.env },
      shell: false,
      stdio: 'inherit',
    });
    sub.ms = Date.now() - t0;
    sub.finishedAt = new Date().toISOString();
    sub.exitCode = r.status;
    if (r.status !== 0) {
      sub.state = 'failed';
      status.state = 'failed';
      status.error = `${spec.name} exit ${r.status ?? 'null'}${r.signal ? ` (${r.signal})` : ''}`;
      status.finishedAt = new Date().toISOString();
      flush();
      console.error(`🛑 [20] ${spec.name} thất bại (exit ${r.status ?? 'null'}). Dừng chuỗi.`);
      process.exit(1);
    }
    sub.state = 'done';
    flush();
    console.log(`[20] ✓ ${spec.name} (${(sub.ms / 1000).toFixed(1)}s)`);
  }

  status.state = 'done';
  status.finishedAt = new Date().toISOString();
  flush();
  console.log(`[20] ✅ step "${step}" xong — ${subs.length} bước con.`);
  if (step === 'produce' || step === 'render') {
    console.log('[20] ⛔ DỪNG ở GATE 2 — chờ Operator duyệt video trong UI.');
  } else if (step === 'script') {
    console.log('[20] (script lẻ — dùng cho debug; flow chính chạy "produce" full chain.)');
  }
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
