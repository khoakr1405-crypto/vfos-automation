/**
 * CLI Demo — Pipeline P6 Wire First Production-Like Step Safely.
 *
 * Verifies production integration bridge safely offline:
 * 1. Pass Mode: selects product by ID from candidates list, matches video candidate successfully.
 * 2. Product Fail Mode: selects product but simulates 2/5 mismatch score, halting pipeline.
 * 3. Missing Input Mode: simulates non-existent files triggering fatal non-retryable step termination.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import { ProductMatchGuard } from '../apps/kernel/src/pipeline/guards/product-match-guard.js';
import { ProductionMapper } from '../apps/kernel/src/pipeline/production-mapper.js';
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

const mapper = new ProductionMapper('.');

async function runPassMode() {
  console.log('  ======================================================');
  console.log('  ✅   1. PASS MODE: REAL PRODUCT SELECTION & AXES PASS  ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard],
  });

  const runId = 'run_p6_pass_' + Date.now().toString().slice(-4);
  const candidatesPath = mapper.getProductCandidatesPath();
  const outArtifactPath = mapper.getProductMatchArtifactPath(runId);

  const steps: StepDefinition[] = [
    {
      stepName: 'demo:product-match',
      command: 'tsx',
      args: [
        'scripts/offline-product-select-demo.ts',
        '--candidatesFile',
        candidatesPath,
        '--outFile',
        outArtifactPath,
        '--productId',
        '2', // Select candidate 2 (Quạt cầm tay mini) by ID/Index
        '--forceMatchAxes',
        'all-pass',
      ],
      cwd: '.',
      timeoutMs: 15000,
      expectedArtifacts: [outArtifactPath],
      description: 'Production-like offline Shopee candidate selection',
    },
    {
      stepName: 'demo:publish',
      command: 'node',
      args: ['-e', `"console.log('Simulating video publish step after P6 select pass...');"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [],
      description: 'Downstream Publish Step',
    },
  ];

  console.log('  Executing pipeline with real offline product candidate list...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p6_pass' });
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  console.log('  ======================================================\n');
}

async function runProductFailMode() {
  console.log('  ======================================================');
  console.log('  ❌   2. PRODUCT FAIL MODE: MISMATCHED AXES             ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard],
  });

  const runId = 'run_p6_fail_' + Date.now().toString().slice(-4);
  const candidatesPath = mapper.getProductCandidatesPath();
  const outArtifactPath = mapper.getProductMatchArtifactPath(runId);

  const steps: StepDefinition[] = [
    {
      stepName: 'demo:product-match',
      command: 'tsx',
      args: [
        'scripts/offline-product-select-demo.ts',
        '--candidatesFile',
        candidatesPath,
        '--outFile',
        outArtifactPath,
        '--productId',
        '2', // Select candidate 2 (Quạt cầm tay mini)
        '--detectedProductName',
        '"Bông tắm lưới xơ mướp"', // Mismatched video detected info wrapped in quotes for shell safety
        '--forceMatchAxes',
        'blocking-fail', // 2/5 axes
      ],
      cwd: '.',
      timeoutMs: 15000,
      expectedArtifacts: [outArtifactPath],
      description: 'Production-like offline Shopee candidate selection',
    },
    {
      stepName: 'demo:publish',
      command: 'node',
      args: ['-e', `"console.error('ERROR: This should never run when product mismatch occurs!'); process.exit(1);"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [],
      description: 'Downstream Publish Step',
    },
  ];

  console.log('  Executing pipeline with mismatched product select...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p6_prod_fail' });
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log('  ======================================================\n');
}

async function runMissingInputMode() {
  console.log('  ======================================================');
  console.log('  🛑   3. MISSING INPUT MODE: FATAL STEP FAILURE         ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard],
  });

  const runId = 'run_p6_miss_' + Date.now().toString().slice(-4);
  const badCandidatesPath = 'production/_commerce/non-existent-file-path.json';
  const outArtifactPath = mapper.getProductMatchArtifactPath(runId);

  const steps: StepDefinition[] = [
    {
      stepName: 'demo:product-match',
      command: 'tsx',
      args: [
        'scripts/offline-product-select-demo.ts',
        '--candidatesFile',
        badCandidatesPath,
        '--outFile',
        outArtifactPath,
      ],
      cwd: '.',
      timeoutMs: 15000,
      expectedArtifacts: [outArtifactPath],
      description: 'Shopee select step with bad inputs',
    },
    {
      stepName: 'demo:publish',
      command: 'node',
      args: ['-e', `"console.error('ERROR: Downstream step should not run on fatal failures!'); process.exit(1);"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [],
      description: 'Downstream Publish Step',
    },
  ];

  console.log('  Executing pipeline with missing candidates file...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p6_missing' });
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log('  ======================================================\n');
}

async function main() {
  console.log('\n  ======================================================');
  console.log('  🛡️    VFOS P6 Production-Like Step Integration Demo   ');
  console.log('  ======================================================\n');

  const mode = values.mode;

  if (mode === 'pass') {
    await runPassMode();
  } else if (mode === 'product-fail') {
    await runProductFailMode();
  } else if (mode === 'missing-input') {
    await runMissingInputMode();
  } else {
    console.error(`Unknown demo mode: ${mode}. Use "pass", "product-fail", or "missing-input"`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
