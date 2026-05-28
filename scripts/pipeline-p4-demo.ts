/**
 * CLI Demo — Pipeline P4 Guard Runner & Script Guard.
 *
 * Simulates quality check integration in linear pipelines:
 * 1. Pass Mode: generates a conforming script JSON; Quality Guard validates successfully.
 * 2. Guard Fail Mode: generates a non-conforming/banned phrase JSON; Quality Guard halts execution.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import { ScriptGuard } from '../apps/kernel/src/pipeline/guards/script-guard.js';
import type { StepDefinition } from '../apps/kernel/src/pipeline/step-registry.js';

// Setup basic command arguments
const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'pass' },
  },
  allowPositionals: false,
  strict: true,
});

// Setup mock logger matching console formats
const logger = {
  info: (obj: any, msg: string) => console.log(`[INFO] ${msg}`, obj ? JSON.stringify(obj) : ''),
  debug: (obj: any, msg: string) => {},
  warn: (obj: any, msg: string) => console.warn(`[WARN] ${msg}`, obj ? JSON.stringify(obj) : ''),
  error: (obj: any, msg: string) => console.error(`[ERROR] ${msg}`, obj ? JSON.stringify(obj) : ''),
} as any;

async function runPassMode() {
  console.log('  ======================================================');
  console.log('  ✅   1. PASS MODE: CONFORMING SCRIPT                  ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const scriptGuard = new ScriptGuard({
    minCharacters: 20,
    bannedPhrases: ['scam product', 'fake link'],
  });
  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [scriptGuard],
  });

  const steps: StepDefinition[] = [
    {
      stepName: 'script:generate',
      command: 'node',
      args: [
        '-e',
        `"const fs = require('fs'); const path = require('path'); const dir = path.join('data', 'temp', 'pipeline-p4-demo'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'valid-script.json'), JSON.stringify({ script: 'Chào mừng các bạn đã đến với kênh review sản phẩm thông minh của VFOS. Hôm nay chúng tôi sẽ đánh giá chi tiết một sản phẩm cực hot!' })); console.log('Generated conforming script JSON.');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/pipeline-p4-demo/valid-script.json'],
      description: 'Generates valid script',
    },
    {
      stepName: 'voice:generate',
      command: 'node',
      args: [
        '-e',
        `"console.log('Simulating voice generation for conforming script...');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: [],
      description: 'Downstream Voice Step',
    },
  ];

  console.log('  Executing pipeline with high-quality conforming script...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p4_pass' });
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  console.log('  ======================================================\n');
}

async function runGuardFailMode() {
  console.log('  ======================================================');
  console.log('  ❌   2. GUARD FAIL MODE: BANNED/NON-CONFORMING SCRIPT ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const scriptGuard = new ScriptGuard({
    minCharacters: 20,
    bannedPhrases: ['scam product', 'fake link'],
  });
  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [scriptGuard],
  });

  const steps: StepDefinition[] = [
    {
      stepName: 'script:generate',
      command: 'node',
      args: [
        '-e',
        `"const fs = require('fs'); const path = require('path'); const dir = path.join('data', 'temp', 'pipeline-p4-demo'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'invalid-script.json'), JSON.stringify({ script: 'This is a scam product and a fake link' })); console.log('Generated non-conforming script JSON.');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/pipeline-p4-demo/invalid-script.json'],
      description: 'Generates invalid script containing banned words',
    },
    {
      stepName: 'voice:generate',
      command: 'node',
      args: [
        '-e',
        `"console.error('ERROR: Voice step should NEVER run when script fails Guard Gate!'); process.exit(1);"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: [],
      description: 'Downstream Voice Step',
    },
  ];

  console.log('  Executing pipeline with low-quality non-conforming script...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p4_fail' });
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total} (Should be 0/2 due to immediate halt)`);
  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log('  ======================================================\n');
}

async function main() {
  console.log('\n  ======================================================');
  console.log('  🛡️    VFOS P4 Guard Gates & Semantic Rules Demo       ');
  console.log('  ======================================================\n');

  const mode = values.mode;

  if (mode === 'pass') {
    await runPassMode();
  } else if (mode === 'guard-fail') {
    await runGuardFailMode();
  } else {
    console.error(`Unknown demo mode: ${mode}. Use "pass" or "guard-fail"`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
