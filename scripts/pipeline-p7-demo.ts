/**
 * CLI Demo — Pipeline P7 Plan Builder for Declarative Auto-Pipeline.
 *
 * Verifies declarative execution from pipeline_plan.json:
 * 1. Pass Mode: generates valid plan, selects product ID from candidates, matches successfully.
 * 2. Product Fail Mode: generates plan, matches product with 2/5 mismatch, halting execution.
 * 3. Invalid Plan Mode: generates plan with empty steps, rejected by Auto-Pipeline before executing steps.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import { ProductMatchGuard } from '../apps/kernel/src/pipeline/guards/product-match-guard.js';
import { ProductionMapper } from '../apps/kernel/src/pipeline/production-mapper.js';
import { PlanBuilder } from '../apps/kernel/src/pipeline/plan-builder.js';

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
const planBuilder = new PlanBuilder('.');

async function runPassMode() {
  console.log('  ======================================================');
  console.log('  ✅   1. PASS MODE: PLAN-BUILDER DYNAMIC PASS         ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard],
  });

  const runId = 'run_p7_pass_' + Date.now().toString().slice(-4);
  const subject = 'yt_016_p7_pass';
  const selectedProductCardPath = mapper.getProductCandidatesPath();
  const videoCandidateMetadataPath = mapper.getProductCandidatesPath(); // reuse clean fixture
  const outputDir = `data/temp/pipeline-p7-demo/${runId}`;

  // 1. Generate plan
  console.log('  [PlanBuilder] Constructing pipeline_plan.json dynamically...');
  const buildResult = planBuilder.buildPlan({
    runId,
    subject,
    selectedProductCardPath,
    videoCandidateMetadataPath,
    outputDir,
    mode: 'pass',
  });

  console.log(`  [PlanBuilder] Plan written to: ${buildResult.planPath}`);
  console.log(`  [PlanBuilder] Configured steps: ${buildResult.stepCount}`);

  // 2. Execute plan
  console.log('\n  [AutoPipeline] Loading and running pipeline plan declarative flow...');
  const result = await pipeline.executeFromPlan(buildResult.planPath);
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  console.log('  ======================================================\n');
}

async function runProductFailMode() {
  console.log('  ======================================================');
  console.log('  ❌   2. PRODUCT FAIL MODE: MISMATCH FROM PLAN          ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard],
  });

  const runId = 'run_p7_fail_' + Date.now().toString().slice(-4);
  const subject = 'yt_016_p7_prod_fail';
  const selectedProductCardPath = mapper.getProductCandidatesPath();
  const videoCandidateMetadataPath = mapper.getProductCandidatesPath();
  const outputDir = `data/temp/pipeline-p7-demo/${runId}`;

  // 1. Generate plan
  console.log('  [PlanBuilder] Constructing pipeline_plan.json dynamically...');
  const buildResult = planBuilder.buildPlan({
    runId,
    subject,
    selectedProductCardPath,
    videoCandidateMetadataPath,
    outputDir,
    mode: 'product-fail',
  });

  console.log(`  [PlanBuilder] Plan written to: ${buildResult.planPath}`);

  // 2. Execute plan
  console.log('\n  [AutoPipeline] Loading and running pipeline plan...');
  const result = await pipeline.executeFromPlan(buildResult.planPath);
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

async function runInvalidPlanMode() {
  console.log('  ======================================================');
  console.log('  🛑   3. INVALID PLAN MODE: REJECTED BEFORE RUNNING    ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard],
  });

  const runId = 'run_p7_invalid_' + Date.now().toString().slice(-4);
  const subject = 'yt_016_p7_invalid';
  const selectedProductCardPath = mapper.getProductCandidatesPath();
  const videoCandidateMetadataPath = mapper.getProductCandidatesPath();
  const outputDir = `data/temp/pipeline-p7-demo/${runId}`;

  // 1. Generate plan with empty steps
  console.log('  [PlanBuilder] Constructing invalid plan (empty steps)...');
  const buildResult = planBuilder.buildPlan({
    runId,
    subject,
    selectedProductCardPath,
    videoCandidateMetadataPath,
    outputDir,
    mode: 'invalid-plan',
  });

  console.log(`  [PlanBuilder] Plan written to: ${buildResult.planPath}`);

  // 2. Execute plan
  console.log('\n  [AutoPipeline] Loading plan to run...');
  const result = await pipeline.executeFromPlan(buildResult.planPath);
  runStore.flush();

  console.log('\n  Linear Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  if (result.error) {
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log('  ======================================================\n');
}

async function main() {
  console.log('\n  ======================================================');
  console.log('  🛡️    VFOS P7 Declarative Pipeline Plan Demo          ');
  console.log('  ======================================================\n');

  const mode = values.mode;

  if (mode === 'pass') {
    await runPassMode();
  } else if (mode === 'product-fail') {
    await runProductFailMode();
  } else if (mode === 'invalid-plan') {
    await runInvalidPlanMode();
  } else {
    console.error(`Unknown demo mode: ${mode}. Use "pass", "product-fail", or "invalid-plan"`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
