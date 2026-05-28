/**
 * Offline Helper Script — Simulates generating portrait vertical video visual metadata.
 *
 * Safe, offline, zero-dependency. Outputs the artifact required by VisualGuard.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    output: { type: 'string' },
    mode: { type: 'string', default: 'pass' },
  },
  allowPositionals: false,
  strict: true,
});

if (!values.output) {
  console.error('ERROR: Missing required argument "--output"');
  process.exit(1);
}

const mode = values.mode;
const outPath = values.output;

console.log(`[OfflineVisual] Creating visual metadata artifact. Mode: ${mode}, Path: ${outPath}`);

let metadata: any;

if (mode === 'visual-fail') {
  // Simulates a failed vertical portrait Reels video
  metadata = {
    videoId: 'demo_video_p10_fail',
    durationSec: 5, // Fails: too short (minimum is 8s)
    width: 1080,
    height: 1920,
    aspectRatio: '9:16',
    hasWatermark: true, // Fails: watermark detected
    hasVisibleBrandLogo: false,
    hasBlackFrames: false,
    hasFrozenFrames: false,
    safeForReviewProductLane: false,
  };
} else {
  // Simulates a perfect vertical portrait Reels video
  metadata = {
    videoId: 'demo_video_p10_pass',
    durationSec: 35, // Passes: between 8s and 60s
    width: 1080,
    height: 1920,
    aspectRatio: '9:16', // Passes: vertical aspect ratio
    hasWatermark: false, // Passes: clean copyright
    hasVisibleBrandLogo: false,
    hasBlackFrames: false,
    hasFrozenFrames: false,
    safeForReviewProductLane: true,
  };
}

try {
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(metadata, null, 2), 'utf8');
  console.log('[OfflineVisual] Successfully wrote visual metadata artifact JSON.');
  process.exit(0);
} catch (err: any) {
  console.error(`ERROR: Failed to write visual metadata artifact: ${err.message}`);
  process.exit(1);
}
