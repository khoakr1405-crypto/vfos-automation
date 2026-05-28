/**
 * CLI Demo — Pipeline P3 Retry Policy & Health Check.
 *
 * Runs workspace environment diagnostics and showcases pipeline error handling:
 * 1. Health Checker pre-flight scan.
 * 2. Step retry with automatic transient recovery on attempt 2.
 * 3. Fatal step non-retryable execution (immediate failure).
 */

import { existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import { HealthChecker } from '../apps/kernel/src/pipeline/health-checker.js';
import type { StepDefinition } from '../apps/kernel/src/pipeline/step-registry.js';
import { RetryPolicy } from '../apps/kernel/src/pipeline/retry-policy.js';

// Setup basic command arguments
const { values } = parseArgs({
  options: {
    mode: { type: 'string', default: 'all' },
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

async function runHealthCheck() {
  console.log('  ======================================================');
  console.log('  🩺   1. WORKSPACE HEALTH PRE-FLIGHT CHECK             ');
  console.log('  ======================================================');

  const checker = new HealthChecker(logger, '.');
  const report = await checker.runAll();

  console.log('\n  Health Diagnosis Report:');
  console.log(`  - Global Status: ${report.passed ? '✅ PASSED' : '❌ FAILED'}`);
  console.log('  ------------------------------------------------------');

  for (const check of report.checks) {
    const icon = check.status === 'pass' ? '✅' : check.status === 'warn' ? '⚠️' : '❌';
    console.log(`  ${icon} [${check.name}]`);
    console.log(`     Status:  ${check.status.toUpperCase()}`);
    console.log(`     Message: ${check.message}`);
    if (check.details) {
      console.log(`     Details: ${check.details}`);
    }
    console.log('');
  }
}

async function runRetrySuccessDemo() {
  console.log('  ======================================================');
  console.log('  🔄   2. RETRY POLICY SUCCESS DEMO (Transient Error)   ');
  console.log('  ======================================================');

  // Reset transient state file if it exists from a prior execution
  const stateFilePath = join('data', 'temp', 'pipeline-p3-demo', 'state.tmp');
  try {
    if (existsSync(stateFilePath)) unlinkSync(stateFilePath);
    const stateDir = dirname(stateFilePath);
    if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true });
  } catch {}

  const runStore = new RunStore(logger, { dataDir: './data' });
  const retryPolicy = new RetryPolicy({
    maxAttempts: 3,
    baseDelayMs: 1000,
    backoff: 'exponential',
  });
  const pipeline = new AutoPipeline({ logger, runStore, retryPolicy });

  // Define steps with dynamic transient failure simulation
  const steps: StepDefinition[] = [
    {
      stepName: 'demo:prepare',
      command: 'node',
      args: [
        '-e',
        `"const fs = require('fs'); const path = require('path'); const dir = path.join('data', 'temp', 'pipeline-p3-demo'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'prepare.txt'), 'prepare ok'); console.log('Prepare completed.');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/pipeline-p3-demo/prepare.txt'],
      description: 'Mock Prepare workspace',
    },
    {
      stepName: 'demo:voice-transient-fail',
      command: 'node',
      args: [
        '-e',
        `"const fs = require('fs'); const path = require('path'); const statePath = path.join('data', 'temp', 'pipeline-p3-demo', 'state.tmp'); if (!fs.existsSync(statePath)) { fs.writeFileSync(statePath, 'failedOnce'); console.error('transient failure: ElevenLabs API is temporarily overloaded.'); process.exit(999); } else { fs.writeFileSync(path.join('data', 'temp', 'pipeline-p3-demo', 'voice.json'), JSON.stringify({ ok: true })); console.log('Voice synthesized successfully on attempt 2!'); }"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/pipeline-p3-demo/voice.json'],
      description: 'Simulate transient voice synthesis failure on attempt 1, recovering on attempt 2.',
    },
  ];

  console.log('  Initiating multi-step transient retry workflow...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_transient' });
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Attempts count:   ${result.outcomes.length}`);
  console.log(`  - Steps:            ${result.steps_completed}/${result.steps_total}`);
  console.log('  ======================================================\n');
}

async function runFatalFailDemo() {
  console.log('  ======================================================');
  console.log('  🛑   3. FATAL FAIL DEMO (Non-Retryable Error)        ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const retryPolicy = new RetryPolicy({ maxAttempts: 3, baseDelayMs: 500 });
  const pipeline = new AutoPipeline({ logger, runStore, retryPolicy });

  const steps: StepDefinition[] = [
    {
      stepName: 'demo:prepare',
      command: 'node',
      args: [
        '-e',
        `"const fs = require('fs'); const path = require('path'); const dir = path.join('data', 'temp', 'pipeline-p3-demo'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'prepare.txt'), 'prepare ok');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/pipeline-p3-demo/prepare.txt'],
      description: 'Mock Prepare Workspace',
    },
    {
      stepName: 'demo:fatal-check',
      command: 'node',
      args: [
        '-e',
        `"console.error('Fatal error: missing file script_ai.json. Permission denied.'); process.exit(1);"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/pipeline-p3-demo/fatal-script.json'],
      description: 'Mock Fatal Non-Retryable Error',
    },
  ];

  console.log('  Initiating fatal non-retryable workflow...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_fatal' });
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Total Outcomes:   ${result.outcomes.length} (Should be 2 - no retries)`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log('  ======================================================\n');
}

async function main() {
  console.log('\n  ======================================================');
  console.log('  🛠️    VFOS P3 Diagnostics & Fault-Tolerance Demo      ');
  console.log('  ======================================================\n');

  const mode = values.mode;

  if (mode === 'all') {
    await runHealthCheck();
    await runRetrySuccessDemo();
    await runFatalFailDemo();
  } else if (mode === 'health') {
    await runHealthCheck();
  } else if (mode === 'retry-success') {
    await runRetrySuccessDemo();
  } else if (mode === 'fatal-fail') {
    await runFatalFailDemo();
  } else {
    console.error(`Unknown demo mode: ${mode}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
