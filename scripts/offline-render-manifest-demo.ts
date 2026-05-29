/**
 * Offline Render Manifest Helper Script — Round P15 + P29 BGM Integration.
 *
 * Simulates the offline compilation of render metadata from intermediate artifacts.
 *
 * Command: tsx scripts/offline-render-manifest-demo.ts --visual <path> --script <path> --voice <path> [--bgm <path>] --output <path> [--mode <mode>]
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname } from 'node:path';
import { parseArgs } from 'node:util';

const options = {
  visual: { type: 'string' as const },
  script: { type: 'string' as const },
  voice: { type: 'string' as const },
  bgm: { type: 'string' as const },
  output: { type: 'string' as const },
  mode: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

function main() {
  const visualPath = values.visual;
  const scriptPath = values.script;
  const voicePath = values.voice;
  const bgmPath = values.bgm;
  const outputPath = values.output;
  const mode = values.mode || 'pass';

  if (!visualPath || !scriptPath || !voicePath || !outputPath) {
    console.error('ERROR: Missing required options: --visual, --script, --voice, --output are all required.');
    process.exit(1);
  }

  console.log(`[OfflineRenderManifest] Initiating step. Mode: "${mode}"`);

  // Handle simulated step failure
  if (mode === 'render-fail') {
    console.error('ERROR: Simulated offline render manifest step failure triggered.');
    process.exit(1);
  }

  // Verify that all input artifacts exist
  if (!existsSync(visualPath)) {
    console.error(`ERROR: Visual metadata artifact not found at: ${visualPath}`);
    process.exit(1);
  }
  if (!existsSync(scriptPath)) {
    console.error(`ERROR: Script artifact not found at: ${scriptPath}`);
    process.exit(1);
  }
  if (!existsSync(voicePath)) {
    console.error(`ERROR: Voice artifact not found at: ${voicePath}`);
    process.exit(1);
  }

  // Parse files to verify they are valid JSON
  let visualMeta: any;
  let scriptMeta: any;
  let voiceMeta: any;
  let bgmMeta: any = null;

  try {
    visualMeta = JSON.parse(readFileSync(visualPath, 'utf8'));
    scriptMeta = JSON.parse(readFileSync(scriptPath, 'utf8'));
    voiceMeta = JSON.parse(readFileSync(voicePath, 'utf8'));

    if (bgmPath && existsSync(bgmPath)) {
      bgmMeta = JSON.parse(readFileSync(bgmPath, 'utf8'));
      console.log(`[OfflineRenderManifest] Successfully integrated BGM track selection: "${bgmMeta.title}" [ID: ${bgmMeta.trackId}]`);
    }
  } catch (err: any) {
    console.error(`ERROR: Failed to parse input JSON files: ${err.message}`);
    process.exit(1);
  }

  // Formulate the render manifest placeholder
  const renderManifest = {
    renderId: 'render_run_review_product_p9',
    assets: {
      visualMetadataPath: visualPath,
      scriptSourcePath: scriptPath,
      voiceArtifactPath: voicePath,
      videoSourcePath: null,
      audioSourcePath: null,
      bgm: bgmMeta
        ? {
            selected: true,
            trackId: bgmMeta.trackId,
            title: bgmMeta.title,
            mood: bgmMeta.mood,
            localAudioPath: bgmMeta.localAudioPath,
            fileExists: bgmMeta.fileExists,
          }
        : { selected: false },
    },
    renderOptions: {
      resolution: '1080x1920',
      aspectRatio: '9:16',
      estimatedDurationSec: 28,
      renderPreset: 'fast-preview',
      subtitlesEnabled: true,
      burnCaptions: true,
      targetPlatform: 'facebook_reels_or_tiktok',
    },
    timeline: {
      timingBlocksSource: 'voice_artifact',
      blockCount: Array.isArray(voiceMeta.timeline?.blocks) ? voiceMeta.timeline.blocks.length : 4,
    },
    output: {
      expectedPreviewPath: `${dirname(outputPath)}/preview_placeholder.mp4`,
      rendered: false,
      offlinePlaceholderOnly: true,
    },
    offlineMode: mode,
    generatedAt: new Date().toISOString(),
  };

  try {
    writeFileSync(outputPath, JSON.stringify(renderManifest, null, 2), 'utf8');
    console.log(`[OfflineRenderManifest] Successfully compiled render manifest: ${outputPath}`);
    process.exit(0);
  } catch (err: any) {
    console.error(`ERROR: Failed to write render manifest to ${outputPath}: ${err.message}`);
    process.exit(1);
  }
}

main();
