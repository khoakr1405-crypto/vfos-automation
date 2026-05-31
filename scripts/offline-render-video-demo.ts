import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';

const options = {
  render: { type: 'string' as const },
  output: { type: 'string' as const },
  mode: { type: 'string' as const },
  'input-video': { type: 'string' as const },
  'input-audio': { type: 'string' as const },
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
  let hasRealFixture = false;
  let requiresOperatorFixtureReview = false;

  const estimatedDuration = renderMeta.renderOptions?.estimatedDurationSec || 28;
  const fadeOutStart = Math.max(0.5, estimatedDuration - 2.0);

  if (mode === 'local-preview') {
    const cliInputVideo = values['input-video'] as string | undefined;
    const cliInputAudio = values['input-audio'] as string | undefined;

    const manifestInputPath = 'apps/kernel/config/manifests/media_input_manifest.json';
    let inputVideoPath = '';
    let inputAudioPath = '';
    let hasFixtureFiles = false;

    if (cliInputVideo) {
      // CLI override — skip manifest lookup entirely.
      inputVideoPath = cliInputVideo;
      inputAudioPath = cliInputAudio || '';
      hasFixtureFiles = inputVideoPath && existsSync(inputVideoPath) ? true : false;
      console.log(`[OfflineRenderVideo] Using CLI-provided input paths (manifest bypassed).`);
    } else if (existsSync(manifestInputPath)) {
      try {
        const mediaInput = JSON.parse(readFileSync(manifestInputPath, 'utf8'));
        inputVideoPath = mediaInput.inputVideoPath || '';
        inputAudioPath = mediaInput.inputAudioPath || '';

        if (inputVideoPath && existsSync(inputVideoPath)) {
          hasFixtureFiles = true;
        }
      } catch (err) {
        console.warn(`[OfflineRenderVideo] Warning: Failed to parse media input manifest: ${err}`);
      }
    }

    if (hasFixtureFiles) {
      console.log(`[OfflineRenderVideo] Real media fixtures found! Composing from:`);
      console.log(`- Video: ${inputVideoPath}`);
      if (inputAudioPath && existsSync(inputAudioPath)) {
        console.log(`- Audio: ${inputAudioPath}`);
      }

      // Check BGM selected and present
      const bgmMeta = renderMeta.assets?.bgm;
      const hasBgmFile = bgmMeta?.selected && bgmMeta.localAudioPath && existsSync(bgmMeta.localAudioPath);

      const ffmpegArgs = ['-y', '-i', inputVideoPath];
      if (inputAudioPath && existsSync(inputAudioPath)) {
        ffmpegArgs.push('-i', inputAudioPath);
      }

      if (hasBgmFile) {
        console.log(`[OfflineRenderVideo] Integrating BGM track: "${bgmMeta.title}" at: ${bgmMeta.localAudioPath}`);
        ffmpegArgs.push('-i', bgmMeta.localAudioPath);

        // Mix voiceover (input 1) and BGM (input 2) with fade-in/out and peak limiter
        const filterComplex = `[2:a]volume=0.12,afade=t=in:st=0:d=1.5,afade=t=out:st=${fadeOutStart}:d=2.0[bgm];[1:a][bgm]amix=inputs=2:duration=first,alimiter=level_in=1:level_out=0.9:limit=0.85:attack=5:release=50[a]`;
        
        ffmpegArgs.push(
          '-filter_complex',
          filterComplex,
          '-map',
          '0:v',
          '-map',
          '[a]',
          '-c:v',
          'libx264',
          '-pix_fmt',
          'yuv420p',
          '-c:a',
          'aac',
          '-shortest',
        );

        // Save BGM mixing report (Round 51A schema). The top-level
        // voiceIncluded/bgmIncluded flags are what the orchestrator's BgmGuard
        // checks, since ffprobe cannot distinguish a post-amix single stream.
        const audioMixingReport = {
          bgmMixingVersion: 'v1',
          jobId: renderMeta.jobId ?? null,
          voicePath: inputAudioPath,
          bgmPath: bgmMeta.localAudioPath,
          outputPath: actualPreviewPath,
          bgmVolumeMultiplier: 0.12,
          voiceIncluded: Boolean(inputAudioPath && existsSync(inputAudioPath)),
          bgmIncluded: true,
          ffmpegMixMode: 'amix',
          trackId: bgmMeta.trackId,
          title: bgmMeta.title,
          mood: bgmMeta.mood,
          mixParameters: {
            bgmVolumeMultiplier: 0.12,
            bgmVolumeDb: "-18dB",
            fadeInSec: 1.5,
            fadeOutSec: 2.0,
            fadeOutStartSec: fadeOutStart,
            limiterLevelIn: 1.0,
            limiterLevelOut: 0.9,
            limiterLimit: 0.85
          },
          generatedAt: new Date().toISOString()
        };
        try {
          writeFileSync(join(outputDir, 'bgm_mixing_report.json'), JSON.stringify(audioMixingReport, null, 2), 'utf8');
          console.log(`[OfflineRenderVideo] Audio quality mixing statistics written successfully.`);
        } catch (err) {
          console.warn(`[OfflineRenderVideo] Warning: Failed to write audio quality report: ${err}`);
        }
      } else {
        if (bgmMeta?.selected) {
          console.warn(
            `[OfflineRenderVideo] WARNING: BGM track "${bgmMeta.title}" audio file is missing at "${bgmMeta.localAudioPath}". Falling back to voiceover-only mix.`,
          );
        }
        if (inputAudioPath && existsSync(inputAudioPath)) {
          ffmpegArgs.push(
            '-map', '0:v:0',
            '-map', '1:a:0',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-c:a', 'aac',
            '-shortest'
          );
        } else {
          ffmpegArgs.push('-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an');
        }
      }
      ffmpegArgs.push(actualPreviewPath);

      console.log(`[OfflineRenderVideo] Running FFMPEG command: ffmpeg ${ffmpegArgs.join(' ')}`);
      const result = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf-8' });

      if (result.status !== 0) {
        console.error('ERROR: FFMPEG composition of local fixtures failed:');
        console.error(result.stderr);
        const errorArtifact = {
          previewId: 'preview_run_review_product_p9',
          renderManifestPath: renderPath,
          status: 'NEEDS_RENDER_ENGINE',
          rendered: false,
          notes: 'FFmpeg execution failed during local fixture composition.',
          offlineMode: mode,
          generatedAt: new Date().toISOString(),
        };
        writeFileSync(outputPath, JSON.stringify(errorArtifact, null, 2), 'utf8');
        process.exit(1);
      }

      console.log(
        `[OfflineRenderVideo] Successfully composed video from real local fixtures: ${actualPreviewPath}`,
      );
      rendered = true;
      localPreviewOnly = true;
      offlinePlaceholderOnly = false;
      hasRealFixture = true;
      status = 'local_preview_rendered';
      notes =
        'Local preview video composed from real local fixtures. Do not publish automatically.';
    } else {
      console.log(
        `[OfflineRenderVideo] [INFO] Media fixture files missing (e.g. "${inputVideoPath}"). Falling back to programmatic testsrc composition but marking requiresOperatorFixtureReview: true.`,
      );
      const ffmpegArgs = [
        '-y',
        '-f',
        'lavfi',
        '-i',
        'testsrc=size=1080x1920:rate=30',
        '-t',
        '5',
        '-c:v',
        'libx264',
        actualPreviewPath,
      ];

      const result = spawnSync('ffmpeg', ffmpegArgs, { encoding: 'utf-8' });

      if (result.status !== 0) {
        console.error('ERROR: FFMPEG fallback execution failed:');
        console.error(result.stderr);
        const errorArtifact = {
          previewId: 'preview_run_review_product_p9',
          renderManifestPath: renderPath,
          status: 'NEEDS_RENDER_ENGINE',
          rendered: false,
          notes: 'FFmpeg fallback execution failed during local preview render.',
          offlineMode: mode,
          generatedAt: new Date().toISOString(),
        };
        writeFileSync(outputPath, JSON.stringify(errorArtifact, null, 2), 'utf8');
        process.exit(1);
      }

      console.log(
        `[OfflineRenderVideo] Successfully rendered fallback preview video file: ${actualPreviewPath}`,
      );
      rendered = true;
      localPreviewOnly = true;
      offlinePlaceholderOnly = false;
      requiresOperatorFixtureReview = true;
      status = 'local_preview_rendered';
      notes =
        'Local preview video rendered using programmatic testsrc due to missing local fixtures. Please place fixture files to render real assets.';
    }
  }

  // Formulate the preview artifact
  const previewArtifact = {
    previewId: 'preview_run_review_product_p9',
    renderManifestPath: renderPath,
    expectedPreviewPath: expectedPreviewPath,
    actualPreviewPath: actualPreviewPath,
    durationSec:
      mode === 'local-preview' ? 5 : renderMeta.renderOptions?.estimatedDurationSec || 28,
    resolution: renderMeta.renderOptions?.resolution || '1080x1920',
    aspectRatio: renderMeta.renderOptions?.aspectRatio || '9:16',
    status: status,
    rendered: rendered,
    localPreviewOnly: localPreviewOnly,
    offlinePlaceholderOnly: offlinePlaceholderOnly,
    requiresOperatorReview: true,
    readyForPublish: false,
    hasRealFixture: hasRealFixture,
    requiresOperatorFixtureReview: requiresOperatorFixtureReview,
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
