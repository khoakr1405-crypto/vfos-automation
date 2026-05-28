/**
 * CLI Demo — Auto Pipeline linear dry-run.
 *
 * Simulates a multi-step pipeline executing clean dry-run child node
 * scripts that generate artifacts in `data/temp/auto-pipeline-demo/`.
 * Supports simulation of failure steps to verify pipeline stoppage.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { RunStore } from '../apps/kernel/src/pipeline/run-store.js';
import { AutoPipeline } from '../apps/kernel/src/pipeline/auto-pipeline.js';
import type { StepDefinition } from '../apps/kernel/src/pipeline/step-registry.js';

// Setup basic command arguments
const { values } = parseArgs({
  options: {
    'fail-at': { type: 'string' },
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

async function main() {
  console.log('\n  ======================================================');
  console.log('  ⚙️    VFOS P2 Auto-Pipeline Dry-Run Demo               ');
  console.log('  ======================================================\n');

  const failAtStep = values['fail-at'];
  if (failAtStep) {
    console.log(`  [Config] Pipeline will simulate failure at: ${failAtStep}\n`);
  }

  // Ensure workspace clean data dir is available
  const dataDir = './data';
  const runStore = new RunStore(logger, { dataDir });
  const pipeline = new AutoPipeline({ logger, runStore });

  // 1. Declare dry-run step configurations
  const steps: StepDefinition[] = [
    {
      stepName: 'demo:prepare',
      command: 'node',
      args: [
        '-e',
        `"const fs = require('fs'); const path = require('path'); const dir = path.join('data', 'temp', 'auto-pipeline-demo'); if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'prepare.txt'), 'prepare ok'); console.log('Prepare step finished successfully.');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/auto-pipeline-demo/prepare.txt'],
      description: 'Mock Prepare: set up directory workspace.',
    },
    {
      stepName: 'demo:write-script',
      command: 'node',
      args: [
        '-e',
        `"const fs = require('fs'); const path = require('path'); const dir = path.join('data', 'temp', 'auto-pipeline-demo'); fs.writeFileSync(path.join(dir, 'script.json'), JSON.stringify({ script: 'mock draft text' })); console.log('Script step finished successfully.');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/auto-pipeline-demo/script.json'],
      description: 'Mock Script Writer: generate JSON subtitles.',
    },
    {
      stepName: 'demo:write-voice',
      command: 'node',
      args: [
        '-e',
        failAtStep === 'demo:write-voice'
          ? `"console.error('Simulating ElevenLabs voice generation failure...'); process.exit(1);"`
          : `"const fs = require('fs'); const path = require('path'); const dir = path.join('data', 'temp', 'auto-pipeline-demo'); fs.writeFileSync(path.join(dir, 'voice.json'), JSON.stringify({ duration: 15.4 })); console.log('Voice step finished successfully.');"`,
      ],
      cwd: '.',
      timeoutMs: 10_000,
      expectedArtifacts: ['data/temp/auto-pipeline-demo/voice.json'],
      description: 'Mock Voice: synthesize voice metadata.',
    },
  ];

  // 2. Execute linear workflow orchestrator
  console.log('  [1/2] Initiating pipeline run...');
  const result = await pipeline.execute('review_product', steps, { video_id: 'yt_016_demo' });

  // 3. Print structured outcome
  console.log('\n  ======================================================');
  console.log('  📊   Pipeline Run Results');
  console.log('  ======================================================');
  console.log(`  - Run ID:           ${result.run_id}`);
  console.log(`  - Status:           ${result.status === 'completed' ? '✅ COMPLETED' : '❌ FAILED'}`);
  console.log(`  - Steps Total:      ${result.steps_total}`);
  console.log(`  - Steps Completed:  ${result.steps_completed}/${result.steps_total}`);
  if (result.failed_step) {
    console.log(`  - Failed Step:      ${result.failed_step}`);
    console.log(`  - Error Detail:     ${result.error}`);
  }
  console.log(`  - Duration:         ${result.durationMs}ms`);
  console.log('  ======================================================\n');

  // 4. Verify P0 RunStore Offline state integration
  console.log('  [2/2] Verifying P0 RunStore integration...');
  runStore.flush(); // Force immediate persistence before process exits
  const activeRun = runStore.get(result.run_id);
  if (activeRun) {
    console.log(`  - Status in Run Store: ${activeRun.status}`);
    console.log(`  - Progress in Run Store: ${activeRun.steps_completed}/${activeRun.steps_total}`);
    console.log('  - Artifacts Registered:');
    console.log(JSON.stringify(activeRun.artifacts, null, 4));
  } else {
    console.log('  ❌ Run not found in local RunStore!');
  }
  console.log('');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
