#!/usr/bin/env tsx

/**
 * VFOS OpenAI Vision Source Video Analyzer — Round 41.
 *
 * Phân tích video nguồn bằng OpenAI Vision (gpt-4o-mini).
 *
 * Mặc định dry-run: chỉ in plan, KHÔNG gọi API.
 * Cần --confirm-openai để thực sự gọi API.
 *
 * Usage:
 *   pnpm job:vision --job job_20260530_001 --dry-run
 *   pnpm job:vision --job job_20260530_001 --confirm-openai
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../packages/voice/src/load-env.js';

interface JobManifest {
  jobVersion: 'v1';
  jobId: string;
  runId: string;
  productId: string | null;
  source: {
    productCardPath: string;
    sourceVideoPath: string | null;
  };
  artifacts: {
    scriptArtifactPath: string | null;
    voiceArtifactPath: string | null;
    voiceTimingArtifactPath: string | null;
    bgmArtifactPath: string | null;
    previewVideoPath: string | null;
    captionedPreviewPath: string | null;
    operatorReviewPackPath: string | null;
    publishReadinessPath: string | null;
    videoVisualAnalysisPath?: string | null;
  };
  state: string;
  review: {
    operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvedAt: string | null;
    rejectedAt: string | null;
    notes: string | null;
  };
  safety: {
    facebookApiCalled: boolean;
    uploaded: boolean;
    published: boolean;
    requiresOperatorReview: boolean;
  };
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
}

interface RegistryEntry {
  jobId: string;
  runId: string;
  state: string;
  productName: string | null;
  productCardPath: string;
  sourceVideoPath: string | null;
  captionedPreviewPath: string | null;
  operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
  createdAt: string;
  updatedAt: string;
}

interface Registry {
  registryVersion: 'v1';
  updatedAt: string;
  jobs: RegistryEntry[];
}

const JOBS_ROOT = 'data/temp/jobs';
const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';

function isoNow(): string {
  return new Date().toISOString();
}

function loadRegistry(): Registry {
  const path = resolve(REGISTRY_PATH);
  if (!existsSync(path)) {
    return { registryVersion: 'v1', updatedAt: isoNow(), jobs: [] };
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Registry;
    if (!raw.registryVersion) raw.registryVersion = 'v1';
    if (!Array.isArray(raw.jobs)) raw.jobs = [];
    return raw;
  } catch {
    return { registryVersion: 'v1', updatedAt: isoNow(), jobs: [] };
  }
}

function saveRegistry(reg: Registry): void {
  const path = resolve(REGISTRY_PATH);
  mkdirSync(dirname(path), { recursive: true });
  reg.updatedAt = isoNow();
  writeFileSync(path, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
}

function loadJobManifest(jobId: string): JobManifest | null {
  const path = resolve(JOBS_ROOT, jobId, 'job_manifest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JobManifest;
  } catch {
    return null;
  }
}

function saveJobManifest(manifest: JobManifest): void {
  const path = resolve(JOBS_ROOT, manifest.jobId, 'job_manifest.json');
  mkdirSync(dirname(path), { recursive: true });
  manifest.updatedAt = isoNow();
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function updateRegistryFromManifest(manifest: JobManifest): void {
  const reg = loadRegistry();
  const idx = reg.jobs.findIndex((j) => j.jobId === manifest.jobId);
  if (idx < 0) return;
  reg.jobs[idx] = {
    ...reg.jobs[idx],
    state: manifest.state,
    sourceVideoPath: manifest.source.sourceVideoPath,
    captionedPreviewPath: manifest.artifacts.captionedPreviewPath,
    operatorDecision: manifest.review.operatorDecision,
    updatedAt: manifest.updatedAt,
  };
  saveRegistry(reg);
}

function getVideoDuration(filePath: string): number {
  if (!existsSync(filePath)) return 0;
  const args = [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    filePath
  ];
  const result = spawnSync('ffprobe', args, { encoding: 'utf8' });
  if (result.status === 0) {
    const val = parseFloat(result.stdout.trim());
    if (!isNaN(val)) return val;
  }
  return 0;
}

async function main(): Promise<void> {
  const parsed = parseArgs({
    options: {
      job: { type: 'string' },
      'confirm-openai': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const values = parsed.values;
  const jobId = values.job;
  const confirmOpenAi = !!values['confirm-openai'];
  const dryRun = !!values['dry-run'];

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    process.exit(1);
  }

  // 1. Load job manifest
  const manifest = loadJobManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB`);
    console.error(`Job ID "${jobId}" is not registered.`);
    process.exit(5);
  }

  // 2. Verify source video
  const relVideoPath = manifest.source.sourceVideoPath;
  const sourceVideoPath = relVideoPath ? resolve(relVideoPath) : null;
  if (!sourceVideoPath || !existsSync(sourceVideoPath)) {
    console.error(`🛑 MISSING_JOB_SOURCE_VIDEO`);
    console.error(`Source video file not found for job: ${jobId}`);
    process.exit(6);
  }

  // 3. Probe video duration
  const duration = getVideoDuration(sourceVideoPath);
  if (duration <= 0) {
    console.error(`🛑 FRAME_EXTRACTION_FAILED`);
    console.error(`Could not probe source video duration via ffprobe.`);
    process.exit(7);
  }

  console.log('======================================================');
  console.log('🎬  VFOS OpenAI Vision Video Analyzer');
  console.log('======================================================');
  console.log(`Job ID:          ${jobId}`);
  console.log(`Source Video:    ${relVideoPath}`);
  console.log(`Video Duration:  ${duration.toFixed(2)}s`);
  console.log(`Mode:            ${confirmOpenAi ? '⚡ LIVE OPENAI API' : '🔍 DRY-RUN / SAFE'}`);
  console.log('------------------------------------------------------');

  // 4. Select frame timestamps dynamically
  let timestamps: number[] = [];
  if (duration >= 30) {
    timestamps = [0.5, 3.0, 7.0, 12.0, 18.0, 24.0, parseFloat((duration - 1.0).toFixed(2))];
  } else if (duration >= 10) {
    const numFrames = 6;
    const step = (duration - 1.5) / (numFrames - 1);
    for (let i = 0; i < numFrames; i++) {
      timestamps.push(parseFloat((0.5 + i * step).toFixed(2)));
    }
  } else {
    const numFrames = 3;
    const step = (duration - 1.0) / (numFrames - 1);
    for (let i = 0; i < numFrames; i++) {
      timestamps.push(parseFloat((0.5 + i * step).toFixed(2)));
    }
  }

  console.log(`Spatially spacing ${timestamps.length} frame extraction timestamps:`);
  console.log(`  Timestamps: ${timestamps.map(t => `${t}s`).join(', ')}`);

  // 5. Extract JPEG frames using FFmpeg
  const jobOutputDir = resolve(JOBS_ROOT, jobId);
  const visionFramesDir = join(jobOutputDir, 'vision_frames');
  mkdirSync(visionFramesDir, { recursive: true });

  // Clean up any existing JPEG files in that folder so it's fresh
  try {
    const files = readdirSync(visionFramesDir);
    for (const file of files) {
      if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')) {
        unlinkSync(join(visionFramesDir, file));
      }
    }
  } catch {}

  const extractedFrames: Array<{ index: number; timestampSec: number; path: string }> = [];

  for (let i = 0; i < timestamps.length; i++) {
    const timestamp = timestamps[i];
    const frameIndex = i + 1;
    const filename = `frame_${String(frameIndex).padStart(3, '0')}.jpg`;
    const framePath = join(visionFramesDir, filename);

    console.log(`  [Frame ${frameIndex}/${timestamps.length}] Extracting at ${timestamp}s...`);
    const ffmpegResult = spawnSync('ffmpeg', [
      '-y',
      '-ss', String(timestamp),
      '-i', sourceVideoPath,
      '-frames:v', '1',
      '-q:v', '2',
      framePath
    ], { encoding: 'utf8' });

    if (ffmpegResult.status !== 0 || !existsSync(framePath)) {
      console.error(`🛑 FRAME_EXTRACTION_FAILED`);
      console.error(`FFmpeg failed to extract frame at ${timestamp}s. Status: ${ffmpegResult.status}`);
      process.exit(8);
    }

    extractedFrames.push({
      index: frameIndex,
      timestampSec: timestamp,
      path: framePath
    });
  }
  console.log(`🟢 Successfully extracted ${extractedFrames.length} JPEGs.`);
  console.log('------------------------------------------------------');

  const analysisPath = join(jobOutputDir, 'video_visual_analysis.json');

  // 6. Handle Dry Run or Safe mode placeholder
  if (dryRun || !confirmOpenAi) {
    console.log('⚠️  [Safe / Dry-Run Mode] No live OpenAI Vision calls authorized.');
    console.log(`Writing mock/plan placeholder to visual analysis artifact...`);

    const dryRunArtifact = {
      visualAnalysisVersion: 'v1',
      jobId,
      sourceVideoPath: relVideoPath,
      frames: extractedFrames.map(f => ({
        index: f.index,
        timestampSec: f.timestampSec,
        path: `data/temp/jobs/${jobId}/vision_frames/${basename(f.path)}`
      })),
      analysis: {
        mainProductVisible: true,
        productConfidence: 0.9,
        visibleScenes: ["Dry-run: Frame analysis placeholder"],
        keyVisualFeatures: ["Placeholder feature"],
        demonstratedFeatures: ["Placeholder features"],
        unsafeOrLowQualitySignals: [],
        captionSafeZones: {
          preferredTextRegion: "lower_third",
          avoidRegions: []
        },
        bestHookFrames: [1],
        scriptHints: ["Highlights features in dry run mode"],
        mismatchWarnings: []
      },
      quality: {
        sourceVideoUsable: true,
        needsOperatorReview: true,
        blockingIssues: [],
        warnings: ["Visual analysis written in dry-run/safe mode."]
      },
      apiCalled: false,
      model: 'dry-run-placeholder',
      generatedAt: isoNow()
    };

    writeFileSync(analysisPath, `${JSON.stringify(dryRunArtifact, null, 2)}\n`, 'utf8');

    // Update job manifest
    manifest.artifacts.videoVisualAnalysisPath = `data/temp/jobs/${jobId}/video_visual_analysis.json`;
    saveJobManifest(manifest);
    updateRegistryFromManifest(manifest);

    console.log(`✅ Artifact written to: ${analysisPath}`);
    console.log('======================================================');
    process.exit(0);
  }

  // 7. Live OpenAI Vision call validation
  loadDotEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey || !apiKey.trim()) {
    console.error(`🛑 MISSING_OPENAI_CREDENTIALS`);
    console.error(`OPENAI_API_KEY is not defined in environment.`);
    process.exit(9);
  }

  // Fetch product card details for prompt context
  let productName = 'Unknown Product';
  const relCardPath = manifest.source.productCardPath;
  if (relCardPath && existsSync(resolve(relCardPath))) {
    try {
      const card = JSON.parse(readFileSync(resolve(relCardPath), 'utf8'));
      productName = card.name || card.productName || card.title || productName;
    } catch {}
  }

  console.log(`Calling OpenAI Vision (gpt-4o-mini) to analyze ${extractedFrames.length} frames...`);

  try {
    const imagesPayload = extractedFrames.map((f) => {
      const base64Str = readFileSync(f.path).toString('base64');
      return {
        type: 'image_url',
        image_url: {
          url: `data:image/jpeg;base64,${base64Str}`
        }
      };
    });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: 'You are a professional video analyzer AI. You must analyze the provided frames from a product source video and return a JSON object with visual metadata and quality checks.'
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Analyze these representative frames from the product video. The product in question is: "${productName}".
Format the response strictly as a JSON object with the following fields:
{
  "mainProductVisible": boolean,
  "productConfidence": float (0.0 to 1.0),
  "visibleScenes": [string],
  "keyVisualFeatures": [string],
  "demonstratedFeatures": [string],
  "unsafeOrLowQualitySignals": [string] (e.g. blurry, shaky, low light, watermark, logo, text overlap),
  "captionSafeZones": {
    "preferredTextRegion": string (e.g. lower_third, upper_third, middle_center),
    "avoidRegions": [string]
  },
  "bestHookFrames": [integer] (1-indexed frame indexes that are most visually striking for hook scene),
  "scriptHints": [string] (ideas that the script generator should highlight based on actual video content),
  "mismatchWarnings": [string] (warnings if the product shown does not match the product name or card)
}`
              },
              ...imagesPayload
            ]
          }
        ],
        temperature: 0.2
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI Vision HTTP ${response.status}: ${detail}`);
    }

    const resObj = await response.json();
    const contentStr = resObj.choices?.[0]?.message?.content;
    if (!contentStr) {
      throw new Error('OpenAI Vision returned empty message content.');
    }

    const aiAnalysis = JSON.parse(contentStr.trim());
    console.log('🟢 OpenAI Vision analysis successfully generated.');

    // Build complete final artifact
    const finalArtifact = {
      visualAnalysisVersion: 'v1',
      jobId,
      sourceVideoPath: relVideoPath,
      frames: extractedFrames.map(f => ({
        index: f.index,
        timestampSec: f.timestampSec,
        path: `data/temp/jobs/${jobId}/vision_frames/${basename(f.path)}`
      })),
      analysis: aiAnalysis,
      quality: {
        sourceVideoUsable: (aiAnalysis.productConfidence || 0) > 0.5 && (aiAnalysis.unsafeOrLowQualitySignals || []).length < 3,
        needsOperatorReview: (aiAnalysis.unsafeOrLowQualitySignals || []).length > 0 || (aiAnalysis.mismatchWarnings || []).length > 0,
        blockingIssues: (aiAnalysis.productConfidence || 0) < 0.3 ? ['PRODUCT_NOT_VISIBLE'] : [],
        warnings: (aiAnalysis.unsafeOrLowQualitySignals || []).concat(aiAnalysis.mismatchWarnings || [])
      },
      apiCalled: true,
      model: 'gpt-4o-mini',
      generatedAt: isoNow()
    };

    writeFileSync(analysisPath, `${JSON.stringify(finalArtifact, null, 2)}\n`, 'utf8');

    // Update job manifest
    manifest.artifacts.videoVisualAnalysisPath = `data/temp/jobs/${jobId}/video_visual_analysis.json`;
    saveJobManifest(manifest);
    updateRegistryFromManifest(manifest);

    console.log(`✅ Visual analysis artifact written to: ${analysisPath}`);
    console.log('======================================================');

  } catch (err: any) {
    console.error('🛑 OPENAI_API_FAILURE');
    console.error(`Failed to analyze via OpenAI Vision: ${err.message}`);
    process.exit(6);
  }
}

main().catch(err => {
  console.error(`Unhandled error: ${err.message}`);
  process.exit(100);
});
