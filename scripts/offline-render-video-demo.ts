import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

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
  const outputDir = dirname(outputPath);
  const actualPreviewPath = join(outputDir, 'preview.mp4');
  const expectedPreviewPath = renderMeta.output?.expectedPreviewPath || actualPreviewPath;

  let rendered = false;
  let localPreviewOnly = false;
  let offlinePlaceholderOnly = true;
  let status = 'placeholder';
  let notes = 'Offline placeholder only. No real video file was rendered.';

  if (mode === 'local-preview') {
    console.log(`[OfflineRenderVideo] Running FFMPEG to generate real local preview video...`);
    const ffmpegArgs = [
      '-y',
      '-f', 'lavfi',
      '-i', 'testsrc=size=1080x1920:rate=30',
      '-t', '5',
      '-c:v', 'libx264',
      actualPreviewPath
    ];

    const result = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf-8' });

    if (result.status !== 0) {
      console.error('ERROR: FFMPEG execution failed:');
      console.error(result.stderr);
      // Write failure metadata with status NEEDS_RENDER_ENGINE as required
      const errorArtifact = {
        previewId: 'preview_run_review_product_p9',
        renderManifestPath: renderPath,
        status: 'NEEDS_RENDER_ENGINE',
        rendered: false,
        notes: 'FFmpeg execution failed during local preview render.',
        offlineMode: mode,
        generatedAt: new Date().toISOString(),
      };
      writeFileSync(outputPath, JSON.stringify(errorArtifact, null, 2), 'utf8');
      process.exit(1);
    }

    console.log(`[OfflineRenderVideo] Successfully rendered local preview video file: ${actualPreviewPath}`);
    rendered = true;
    localPreviewOnly = true;
    offlinePlaceholderOnly = false;
    status = 'local_preview_rendered';
    notes = 'Local preview video rendered for operator review. Do not publish automatically.';
  }

  // Formulate the preview artifact
  const previewArtifact = {
    previewId: 'preview_run_review_product_p9',
    renderManifestPath: renderPath,
    expectedPreviewPath: expectedPreviewPath,
    actualPreviewPath: actualPreviewPath,
    durationSec: mode === 'local-preview' ? 5 : (renderMeta.renderOptions?.estimatedDurationSec || 28),
    resolution: renderMeta.renderOptions?.resolution || '1080x1920',
    aspectRatio: renderMeta.renderOptions?.aspectRatio || '9:16',
    status: status,
    rendered: rendered,
    localPreviewOnly: localPreviewOnly,
    offlinePlaceholderOnly: offlinePlaceholderOnly,
    requiresOperatorReview: true,
    readyForPublish: false,
    notes: notes,
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
