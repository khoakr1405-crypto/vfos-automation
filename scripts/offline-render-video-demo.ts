/**
 * Offline Video Render Preview Placeholder Generator — Round P17.
 *
 * Simulates rendering a complete video output by constructing preview metadata.
 *
 * Command: tsx scripts/offline-render-video-demo.ts --render <path> --output <path> [--mode <mode>]
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';

const options = {
  render: { type: 'string' as const },
  output: { type: 'string' as const },
  mode: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

function main() {
  const renderPath = values.render;
  const outputPath = values.output;
  const mode = values.mode || 'pass';

  if (!renderPath || !outputPath) {
    console.error('ERROR: Missing required options: --render, --output are required.');
    process.exit(1);
  }

  console.log(`[OfflineRenderVideo] Initiating preview generation. Mode: "${mode}"`);

  // Handle preview-fail mode directly
  if (mode === 'preview-fail') {
    console.error('ERROR: Video Render failed during ffmpeg visual composition mock.');
    process.exit(1);
  }

  // Handle preceding fail modes
  if (['product-fail', 'visual-fail', 'script-fail', 'voice-fail', 'render-fail'].includes(mode)) {
    console.error(`ERROR: Preceding failure condition detected: mode "${mode}". Halting render.`);
    process.exit(1);
  }

  // Verify render manifest exists
  if (!existsSync(renderPath)) {
    console.error(`ERROR: Render manifest not found at: ${renderPath}`);
    process.exit(1);
  }

  // Parse file to verify valid JSON
  let renderMeta: any;
  try {
    renderMeta = JSON.parse(readFileSync(renderPath, 'utf8'));
  } catch (err: any) {
    console.error(`ERROR: Failed to parse render manifest JSON: ${err.message}`);
    process.exit(1);
  }

  // Determine path for expected video placeholder
  const expectedPreviewPath = renderMeta.output?.expectedPreviewPath || 'data/temp/preview_placeholder.mp4';

  // Formulate the preview artifact
  const previewArtifact = {
    previewId: 'preview_run_review_product_p9',
    renderManifestPath: renderPath,
    expectedPreviewPath: expectedPreviewPath,
    durationSec: renderMeta.renderOptions?.estimatedDurationSec || 28,
    resolution: renderMeta.renderOptions?.resolution || '1080x1920',
    aspectRatio: renderMeta.renderOptions?.aspectRatio || '9:16',
    status: 'placeholder',
    rendered: false,
    offlinePlaceholderOnly: true,
    requiresOperatorReview: true,
    readyForPublish: false,
    notes: 'Offline placeholder only. No real video file was rendered.',
    offlineMode: mode,
    generatedAt: new Date().toISOString(),
  };

  try {
    writeFileSync(outputPath, JSON.stringify(previewArtifact, null, 2), 'utf8');
    console.log(`[OfflineRenderVideo] Successfully rendered preview metadata: ${outputPath}`);
    process.exit(0);
  } catch (err: any) {
    console.error(`ERROR: Failed to write preview artifact to ${outputPath}: ${err.message}`);
    process.exit(1);
  }
}

main();
