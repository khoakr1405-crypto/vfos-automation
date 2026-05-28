/**
 * CLI Demo — Pipeline P10 Multi-Step Visual Guard Workflow.
 *
 * Verifies declarative execution of a 3-step pipeline loading review_product_run_manifest.json:
 * 1. Pass Mode: generates 3-step plan -> executes product selection (pass) -> visual check (pass) -> publish (completed).
 * 2. Product Fail Mode: product-match guard blocks execution immediately before visual check.
 * 3. Visual Fail Mode: product selection (pass) -> visual check fails (watermark block) -> publish blocked!
 * 4. Invalid Manifest Mode: PlanBuilder rejects structural manifest errors before starting.
 * 5. Unsafe Manifest Mode: Safety gate blocks manifest requesting live external operations.
 */

import { existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import { ProductMatchGuard } from '../apps/kernel/src/pipeline/guards/product-match-guard.js';
import { VisualGuard } from '../apps/kernel/src/pipeline/guards/visual-guard.js';
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

const planBuilder = new PlanBuilder('.');
const manifestPath = 'apps/kernel/config/manifests/review_product_run_manifest.json';

async function runPassMode() {
  console.log('  ======================================================');
  console.log('  ✅   1. PASS MODE: MULTI-STEP PIPELINE FULL SUCCESS    ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();
  const visualGuard = new VisualGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard, visualGuard],
  });

  console.log(`  [PlanBuilder] Loading Run Manifest: ${manifestPath}`);
  const buildResult = planBuilder.buildPlanFromManifest(manifestPath, { mode: 'pass' });

  console.log(`  [PlanBuilder] Config path loaded: ${buildResult.laneConfigPath}`);
  console.log(`  [PlanBuilder] Plan written to: ${buildResult.planPath}`);
  console.log(`  [PlanBuilder] Configured steps: ${buildResult.stepCount}`);

  // 2. Execute plan
  console.log('\n  [AutoPipeline] Loading and running 3-step declarative flow...');
  const result = await pipeline.executeFromPlan(buildResult.planPath);
  runStore.flush();

  console.log('\n  Multi-Step Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  console.log('  ======================================================\n');
}

async function runProductFailMode() {
  console.log('  ======================================================');
  console.log('  ❌   2. PRODUCT FAIL MODE: BLOCKED AT STEP 1           ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();
  const visualGuard = new VisualGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard, visualGuard],
  });

  console.log(`  [PlanBuilder] Loading Run Manifest: ${manifestPath}`);
  const buildResult = planBuilder.buildPlanFromManifest(manifestPath, { mode: 'product-fail' });

  console.log(`  [PlanBuilder] Plan written to: ${buildResult.planPath}`);

  // 2. Execute plan
  console.log('\n  [AutoPipeline] Executing plan...');
  const result = await pipeline.executeFromPlan(buildResult.planPath);
  runStore.flush();

  console.log('\n  Multi-Step Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log('  ======================================================\n');
}

async function runVisualFailMode() {
  console.log('  ======================================================');
  console.log('  ❌   3. VISUAL FAIL MODE: BLOCKED AT STEP 2            ');
  console.log('  ======================================================');

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();
  const visualGuard = new VisualGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard, visualGuard],
  });

  console.log(`  [PlanBuilder] Loading Run Manifest: ${manifestPath}`);
  // In visual-fail mode, step 1 (product-match) will pass, but step 2 (visual-check) will produce a watermarked artifact failing VisualGuard
  const buildResult = planBuilder.buildPlanFromManifest(manifestPath, { mode: 'visual-fail' });

  console.log(`  [PlanBuilder] Plan written to: ${buildResult.planPath}`);

  // 2. Execute plan
  console.log('\n  [AutoPipeline] Executing plan...');
  const result = await pipeline.executeFromPlan(buildResult.planPath);
  runStore.flush();

  console.log('\n  Multi-Step Pipeline Execution Results:');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log('  ======================================================\n');
}

async function runInvalidManifestMode() {
  console.log('  ======================================================');
  console.log('  🛑   4. INVALID MANIFEST MODE: REJECTED BEFORE RUN     ');
  console.log('  ======================================================');

  console.log('  [PlanBuilder] Simulating invalid run manifest compilation...');
  try {
    planBuilder.buildPlanFromManifest(manifestPath, {
      mode: 'invalid-manifest', // plan builder will throw an exception
    });
    console.error('ERROR: PlanBuilder failed to reject invalid manifest!');
    process.exit(1);
  } catch (err: any) {
    console.log(`  [PlanBuilder] Clean rejection success! Error reason: ${err.message}`);
  }
  console.log('  ======================================================\n');
}

async function runUnsafeManifestMode() {
  console.log('  ======================================================');
  console.log('  🛡️   5. UNSAFE MANIFEST MODE: BLOCKED BY SAFETY GATE  ');
  console.log('  ======================================================');

  console.log('  [PlanBuilder] Simulating unsafe run manifest compilation...');
  try {
    planBuilder.buildPlanFromManifest(manifestPath, {
      mode: 'unsafe-manifest', // safety gate will throw an exception
    });
    console.error('ERROR: PlanBuilder failed to block unsafe operations manifest!');
    process.exit(1);
  } catch (err: any) {
    console.log(`  [PlanBuilder] Clean safety block success! Reason: ${err.message}`);
  }
  console.log('  ======================================================\n');
}

async function main() {
  console.log('\n  ======================================================');
  console.log('  🛡️    VFOS P10 Multi-Step Declarative Pipeline Demo    ');
  console.log('  ======================================================\n');

  const mode = values.mode;

  if (mode === 'pass') {
    await runPassMode();
  } else if (mode === 'product-fail') {
    await runProductFailMode();
  } else if (mode === 'visual-fail') {
    await runVisualFailMode();
  } else if (mode === 'invalid-manifest') {
    await runInvalidManifestMode();
  } else if (mode === 'unsafe-manifest') {
    await runUnsafeManifestMode();
  } else {
    console.error(`Unknown demo mode: ${mode}. Use "pass", "product-fail", "visual-fail", "invalid-manifest", or "unsafe-manifest"`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
