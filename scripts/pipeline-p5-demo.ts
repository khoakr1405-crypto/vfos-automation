/**
 * CLI Demo — Pipeline P5 Quality Guards (Product Match & Visual Specs).
 *
 * Verifies Quality Gates for review product lane:
 * 1. Pass Mode: conforming metadata and 5/5 product match score.
 * 2. Product Fail Mode: mismatched axes halting execution.
 * 3. Visual Fail Mode: watermark or aspect ratio violations blocking progress.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import { ProductMatchGuard } from '../apps/kernel/src/pipeline/guards/product-match-guard.js';
import { VisualGuard } from '../apps/kernel/src/pipeline/guards/visual-guard.js';
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

const tempDir = join('data', 'temp', 'pipeline-p5-demo');
if (!existsSync(tempDir)) mkdirSync(tempDir, { recursive: true });

async function runPassMode() {
  console.log('  ======================================================');
  console.log('  ✅   1. PASS MODE: CONFORMING PRODUCT & VISUAL SPECS   ');
  console.log('  ======================================================');

  // Create conforming artifacts
  const productMatchPath = join(tempDir, 'product_match_pass.json');
  const visualMetadataPath = join(tempDir, 'visual_metadata_pass.json');

  writeFileSync(
    productMatchPath,
    JSON.stringify({
      shopeeProduct: {
        productId: 'demo_product_001',
        name: 'Dụng cụ cắt táo inox 12 lưỡi',
        category: 'kitchen_tool',
        formFactor: 'push_down_apple_slicer',
        useCase: 'cut_and_core_fruit',
        priceRange: 'under_100k',
      },
      videoCandidate: {
        sourceId: 'demo_video_001',
        detectedProductName: 'Dụng cụ cắt táo inox 12 lưỡi',
        detectedCategory: 'kitchen_tool',
        detectedFormFactor: 'push_down_apple_slicer',
        detectedUseCase: 'cut_and_core_fruit',
        visualContext: 'kitchen_demo',
      },
      matchAxes: {
        function: true,
        formFactor: true,
        usage: true,
        context: true,
        productNature: true,
      },
    }),
    'utf8',
  );

  writeFileSync(
    visualMetadataPath,
    JSON.stringify({
      videoId: 'demo_video_001',
      durationSec: 35,
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      hasWatermark: false,
      hasVisibleBrandLogo: false,
      hasBlackFrames: false,
      hasFrozenFrames: false,
      safeForReviewProductLane: true,
    }),
    'utf8',
  );

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();
  const visualGuard = new VisualGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard, visualGuard],
  });

  const steps: StepDefinition[] = [
    {
      stepName: 'demo:product-match',
      command: 'node',
      args: ['-e', `"console.log('Product matched successfully.');"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [productMatchPath],
      description: 'Mock Step Match',
    },
    {
      stepName: 'demo:visual-check',
      command: 'node',
      args: ['-e', `"console.log('Visual characteristics validated.');"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [visualMetadataPath],
      description: 'Mock Visual verification',
    },
    {
      stepName: 'demo:publish',
      command: 'node',
      args: ['-e', `"console.log('Simulating successful video publish step...');"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [],
      description: 'Downstream Publish Step',
    },
  ];

  console.log('  Executing pipeline with conforming specs...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p5_pass' });
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

  const productMatchPath = join(tempDir, 'product_match_fail.json');

  // Generate 2/5 product match score JSON (blocking violation)
  writeFileSync(
    productMatchPath,
    JSON.stringify({
      shopeeProduct: {
        productId: 'demo_product_001',
        name: 'Dụng cụ cắt táo inox 12 lưỡi',
        category: 'kitchen_tool',
      },
      videoCandidate: {
        sourceId: 'demo_video_001',
        detectedProductName: 'Bàn chải cọ bồn cầu',
        detectedCategory: 'bathroom_tool',
      },
      matchAxes: {
        function: false,
        formFactor: false,
        usage: false,
        context: true,
        productNature: true,
      },
    }),
    'utf8',
  );

  const runStore = new RunStore(logger, { dataDir: './data' });
  const productGuard = new ProductMatchGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [productGuard],
  });

  const steps: StepDefinition[] = [
    {
      stepName: 'demo:product-match',
      command: 'node',
      args: ['-e', `"console.log('Generating mismatched JSON.');"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [productMatchPath],
      description: 'Mock Step Match',
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

  console.log('  Executing pipeline with mismatched product...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p5_prod_fail' });
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

async function runVisualFailMode() {
  console.log('  ======================================================');
  console.log('  ❌   3. VISUAL FAIL MODE: WATERMARK DETECTED         ');
  console.log('  ======================================================');

  const visualMetadataPath = join(tempDir, 'visual_metadata_fail.json');

  // Generate visual JSON with watermark (blocking violation)
  writeFileSync(
    visualMetadataPath,
    JSON.stringify({
      videoId: 'demo_video_001',
      durationSec: 35,
      width: 1080,
      height: 1920,
      aspectRatio: '9:16',
      hasWatermark: true, // blocking trigger
      hasVisibleBrandLogo: false,
      hasBlackFrames: false,
      hasFrozenFrames: false,
      safeForReviewProductLane: false,
    }),
    'utf8',
  );

  const runStore = new RunStore(logger, { dataDir: './data' });
  const visualGuard = new VisualGuard();

  const pipeline = new AutoPipeline({
    logger,
    runStore,
    guards: [visualGuard],
  });

  const steps: StepDefinition[] = [
    {
      stepName: 'demo:visual-check',
      command: 'node',
      args: ['-e', `"console.log('Generating visual anomaly metadata.');"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [visualMetadataPath],
      description: 'Mock Visual check',
    },
    {
      stepName: 'demo:publish',
      command: 'node',
      args: ['-e', `"console.error('ERROR: This should never run when watermark is detected!'); process.exit(1);"`],
      cwd: '.',
      timeoutMs: 5000,
      expectedArtifacts: [],
      description: 'Downstream Publish Step',
    },
  ];

  console.log('  Executing pipeline with watermarked metadata...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_p5_vis_fail' });
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
  console.log('  🛡️    VFOS P5 Product Match & Visual Safety Demo      ');
  console.log('  ======================================================\n');

  const mode = values.mode;

  if (mode === 'pass') {
    await runPassMode();
  } else if (mode === 'product-fail') {
    await runProductFailMode();
  } else if (mode === 'visual-fail') {
    await runVisualFailMode();
  } else {
    console.error(`Unknown demo mode: ${mode}. Use "pass", "product-fail", or "visual-fail"`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
