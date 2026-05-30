import { existsSync, mkdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { loadDotEnv } from '../packages/voice/src/load-env.js';
import { calculateNormalizedHash, extractCombinedVoiceText } from './job-artifact-freshness.js';

// Safe exit wrapper to prevent Windows libuv UV_HANDLE_CLOSING assertion crash in Node.js
const originalExit = process.exit;
process.exit = ((code?: number) => {
  setTimeout(() => {
    originalExit(code);
  }, 200);
}) as any;

const JOBS_ROOT = 'data/temp/jobs';
const REGISTRY_PATH = 'data/temp/vfos_jobs_registry.json';

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
    finalQaReportPath?: string | null;
  };
  state: string;
  review: {
    operatorDecision: 'PENDING' | 'APPROVED' | 'REJECTED';
    approvedAt: string | null;
    rejectedAt: string | null;
    notes: string | null;
  };
  safety: {
    facebookApiCalled: false;
    uploaded: false;
    published: false;
    requiresOperatorReview: true;
  };
  createdAt: string;
  updatedAt: string;
  lastError?: string | null;
  qaStatus?: 'PASS' | 'FAIL' | 'PENDING' | null;
}

function loadManifest(jobId: string): JobManifest | null {
  const path = resolve(JOBS_ROOT, jobId, 'job_manifest.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as JobManifest;
  } catch {
    return null;
  }
}

function saveManifest(manifest: JobManifest): void {
  const path = resolve(JOBS_ROOT, manifest.jobId, 'job_manifest.json');
  mkdirSync(dirname(path), { recursive: true });
  manifest.updatedAt = new Date().toISOString();
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}

function updateRegistryFromManifest(manifest: JobManifest): void {
  const path = resolve(REGISTRY_PATH);
  if (!existsSync(path)) return;
  try {
    const reg = JSON.parse(readFileSync(path, 'utf8'));
    const idx = reg.jobs.findIndex((j: any) => j.jobId === manifest.jobId);
    if (idx >= 0) {
      reg.jobs[idx].state = manifest.state;
      reg.jobs[idx].updatedAt = manifest.updatedAt;
      writeFileSync(path, `${JSON.stringify(reg, null, 2)}\n`, 'utf8');
    }
  } catch {}
}

function validateAudioStream(filePath: string): { success: boolean; error?: string; reason?: string; duration?: number } {
  if (!existsSync(filePath)) {
    return { success: false, error: 'FINAL_VIDEO_MISSING', reason: `File not found at: ${filePath}` };
  }

  const args = [
    '-v', 'error',
    '-show_entries', 'stream=index,codec_type,codec_name,duration',
    '-show_format',
    '-of', 'json',
    filePath
  ];

  const result = spawnSync('ffprobe', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    return {
      success: false,
      error: 'FFPROBE_FAILED',
      reason: `ffprobe exited with status ${result.status}. Stderr: ${result.stderr}`
    };
  }

  try {
    const data = JSON.parse(result.stdout || '{}');
    const streams = data.streams || [];
    const audioStream = streams.find((s: any) => s.codec_type === 'audio');

    if (!audioStream) {
      return { success: false, error: 'FINAL_VIDEO_AUDIO_MISSING', reason: 'No audio stream found in the final video.' };
    }

    const duration = parseFloat(audioStream.duration || data.format?.duration || '0');
    if (isNaN(duration) || duration <= 0) {
      return {
        success: false,
        error: 'INVALID_DURATION',
        reason: `Audio duration is invalid or zero: ${audioStream.duration || data.format?.duration}`
      };
    }

    return { success: true, duration };
  } catch (err: any) {
    return { success: false, error: 'PARSE_FAILED', reason: `Failed to parse ffprobe output: ${err.message}` };
  }
}

function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()?"'–\[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function computeOverlap(normalizedScript: string, normalizedTranscript: string): number {
  const scriptWords = normalizedScript.split(' ').filter(Boolean);
  const transcriptWords = normalizedTranscript.split(' ').filter(Boolean);
  
  if (scriptWords.length === 0) return 0;
  
  const transcriptSet = new Set(transcriptWords);
  let matches = 0;
  for (const word of scriptWords) {
    if (transcriptSet.has(word)) {
      matches++;
    }
  }
  
  return matches / scriptWords.length;
}

function checkVoiceCutoff(normalizedScript: string, normalizedTranscript: string): boolean {
  const scriptWords = normalizedScript.split(' ').filter(Boolean);
  const transcriptWords = normalizedTranscript.split(' ').filter(Boolean);
  
  if (scriptWords.length < 10) return false;
  
  // Get last 12 words of the script
  const endingWords = scriptWords.slice(-12);
  
  // Look at the last 20 words of the transcript
  const transcriptEnding = transcriptWords.slice(-20);
  const transcriptEndingSet = new Set(transcriptEnding);
  
  // Count matches
  let matches = 0;
  for (const word of endingWords) {
    if (transcriptEndingSet.has(word)) {
      matches++;
    }
  }
  
  // If less than 4 matches out of 12 ending words are found in the final section,
  // then the voice is likely cut off!
  return matches < 4;
}

async function main() {
  const parsed = parseArgs({
    options: {
      job: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
      'confirm-openai': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });
  const values = parsed.values;

  const jobId = values.job as string | undefined;
  const dryRun = Boolean(values['dry-run']);
  const confirmOpenai = Boolean(values['confirm-openai']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    process.exit(1);
  }

  console.log('======================================================');
  console.log('🎯  VFOS STT/QA Final Video Verification Gate');
  console.log('======================================================');
  console.log(`Job ID:         ${jobId}`);
  console.log(`Confirm STT:    ${confirmOpenai ? '✅ YES' : '❌ NO'}`);
  console.log(`Mode:           ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('------------------------------------------------------');

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    process.exit(1);
  }

  const jobOutputDir = resolve(JOBS_ROOT, jobId);
  const videoV2Path = join(jobOutputDir, 'preview_with_captions_v2.mp4');
  const videoV1Path = join(jobOutputDir, 'preview_with_captions.mp4');
  let finalVideoPath = existsSync(videoV2Path) ? videoV2Path : videoV1Path;

  const videoFilePresent = existsSync(finalVideoPath);
  let audioStreamPresent = false;
  let audioDuration = 0;
  let videoCheckError = '';

  if (videoFilePresent) {
    const check = validateAudioStream(finalVideoPath);
    if (check.success) {
      audioStreamPresent = true;
      audioDuration = check.duration || 0;
    } else {
      videoCheckError = check.error || 'AUDIO_CHECK_FAILED';
      console.error(`🛑 ${videoCheckError}: ${check.reason}`);
    }
  } else {
    console.error(`🛑 FINAL_VIDEO_MISSING: Captioned video not found at: ${videoV2Path}`);
    videoCheckError = 'FINAL_VIDEO_MISSING';
  }

  const scriptPath = join(jobOutputDir, 'script_artifact.json');
  const scriptPresent = existsSync(scriptPath);
  let scriptText = '';
  let scriptTextHash = '';

  if (scriptPresent) {
    const combined = extractCombinedVoiceText(scriptPath);
    if (combined) {
      scriptText = combined;
      scriptTextHash = calculateNormalizedHash(combined);
    }
  }

  console.log(`Video present:  ${videoFilePresent ? '✅' : '❌'}`);
  console.log(`Audio present:  ${audioStreamPresent ? '✅' : '❌'}`);
  console.log(`Script present: ${scriptPresent ? '✅' : '❌'}`);
  if (videoFilePresent) {
    console.log(`Video path:     ${finalVideoPath}`);
    console.log(`Audio duration: ${audioDuration.toFixed(2)}s`);
  }
  console.log('------------------------------------------------------');

  const qaReportPath = join(jobOutputDir, 'final_video_qa_report.json');

  if (dryRun) {
    const dryRunReport = {
      qaVersion: 'v1',
      jobId,
      status: 'DRY_RUN_PLAN_ONLY',
      apiCalled: false,
      generatedAt: new Date().toISOString(),
      notes: 'Dry-run plan only. No STT API call. Pass --confirm-openai to execute.',
    };
    writeFileSync(qaReportPath, JSON.stringify(dryRunReport, null, 2) + '\n', 'utf8');
    console.log('DRY-RUN plan complete. No API calls made.');
    console.log(`Plan persisted: ${qaReportPath}`);
    process.exit(0);
  }

  // Handle immediate failures before STT
  if (!videoFilePresent) {
    manifest.state = 'FAILED';
    manifest.lastError = 'FINAL_VIDEO_MISSING';
    saveManifest(manifest);
    updateRegistryFromManifest(manifest);
    process.exit(2);
  }

  if (!audioStreamPresent) {
    manifest.state = 'FAILED';
    manifest.lastError = videoCheckError || 'FINAL_VIDEO_AUDIO_MISSING';
    saveManifest(manifest);
    updateRegistryFromManifest(manifest);
    process.exit(3);
  }

  if (!scriptPresent || !scriptText) {
    console.error('🛑 MISSING_SCRIPT_ARTIFACT: script_artifact.json not found or empty.');
    process.exit(4);
  }

  if (!confirmOpenai) {
    console.log('⚠️  OpenAI STT confirm flag missing. Refusing to call API.');
    console.log('To run live STT QA, execute with:');
    console.log(`  pnpm job:qa --job ${jobId} --confirm-openai`);
    process.exit(0);
  }

  loadDotEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    console.error('🛑 MISSING_OPENAI_CREDENTIALS');
    process.exit(1);
  }

  // 1. Extract audio track from video to temp mp3 file using FFmpeg
  const tempAudioPath = join(jobOutputDir, 'temp_qa_audio.mp3');
  console.log(`Extracting audio for transcription...`);
  const extractRes = spawnSync('ffmpeg', ['-y', '-i', finalVideoPath, '-q:a', '0', '-map', 'a', tempAudioPath]);
  if (extractRes.status !== 0) {
    console.error(`🛑 FAILED_TO_EXTRACT_AUDIO: ${extractRes.stderr?.toString()}`);
    process.exit(1);
  }

  let transcriptText = '';
  let apiCalled = false;

  try {
    console.log('Calling OpenAI Whisper Speech-to-Text API...');
    const fileBuffer = readFileSync(tempAudioPath);
    const blob = new Blob([fileBuffer], { type: 'audio/mp3' });
    const formData = new FormData();
    formData.append('file', blob, 'audio.mp3');
    formData.append('model', 'whisper-1');
    formData.append('language', 'vi');

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`🛑 OPENAI_API_FAILURE: HTTP ${response.status} — ${errorText}`);
      if (existsSync(tempAudioPath)) unlinkSync(tempAudioPath);
      process.exit(1);
    }

    const resJson: any = await response.json();
    transcriptText = (resJson.text || '').trim();
    apiCalled = true;
    console.log('OpenAI STT transcription retrieved successfully.');
  } catch (err: any) {
    console.error(`🛑 OPENAI_API_FAILURE: ${err.message}`);
    if (existsSync(tempAudioPath)) unlinkSync(tempAudioPath);
    process.exit(1);
  } finally {
    if (existsSync(tempAudioPath)) {
      try {
        unlinkSync(tempAudioPath);
      } catch {}
    }
  }

  // Perform QA Checks
  const normalizedScript = normalizeText(scriptText);
  const normalizedTranscript = normalizeText(transcriptText);

  const estimatedSimilarity = computeOverlap(normalizedScript, normalizedTranscript);
  const voiceLikelyCutOff = checkVoiceCutoff(normalizedScript, normalizedTranscript);
  const missingEndingDetected = voiceLikelyCutOff;
  const majorMismatchDetected = estimatedSimilarity < 0.70;

  const warnings: string[] = [];
  const violations: string[] = [];
  let status: 'PASS' | 'FAIL' = 'PASS';

  if (voiceLikelyCutOff) {
    status = 'FAIL';
    violations.push('VOICE_CUTOFF_DETECTED: Ending words of script not spoken at the end of audio.');
    console.error('🛑 VOICE_CUTOFF_DETECTED');
  }

  if (majorMismatchDetected) {
    status = 'FAIL';
    violations.push(`FINAL_AUDIO_SCRIPT_MISMATCH: Script text mismatch detected (Similarity = ${estimatedSimilarity.toFixed(2)}).`);
    console.error(`🛑 FINAL_AUDIO_SCRIPT_MISMATCH: Similarity = ${estimatedSimilarity.toFixed(2)}`);
  }

  const qaReport = {
    qaVersion: 'v1',
    jobId,
    inputVideoPath: finalVideoPath,
    scriptArtifactPath: scriptPath,
    expectedTextHash: scriptTextHash,
    transcript: {
      provider: 'openai',
      model: 'whisper-1',
      text: transcriptText,
      durationSec: audioDuration
    },
    checks: {
      videoFilePresent: true,
      audioStreamPresent: true,
      scriptPresent: true,
      transcriptPresent: true,
      estimatedSimilarity,
      missingEndingDetected,
      voiceLikelyCutOff,
      majorMismatchDetected
    },
    status,
    warnings,
    violations,
    apiCalled,
    generatedAt: new Date().toISOString()
  };

  writeFileSync(qaReportPath, JSON.stringify(qaReport, null, 2) + '\n', 'utf8');

  // Update job manifest and registry
  manifest.artifacts.finalQaReportPath = `data/temp/jobs/${jobId}/final_video_qa_report.json`;
  manifest.qaStatus = status;

  if (status === 'FAIL') {
    manifest.state = 'FAILED';
    manifest.lastError = voiceLikelyCutOff ? 'VOICE_CUTOFF_DETECTED' : 'FINAL_AUDIO_SCRIPT_MISMATCH';
  } else {
    // Keep standard state READY_FOR_OPERATOR_REVIEW, just mark qaStatus as PASS
    console.log('🟢 FINAL_VIDEO_QA_PASS');
  }

  saveManifest(manifest);
  updateRegistryFromManifest(manifest);

  console.log('------------------------------------------------------');
  console.log(`QA Status:      ${status}`);
  console.log(`Report path:    ${qaReportPath}`);
  console.log('======================================================');

  if (status === 'FAIL') {
    process.exit(voiceLikelyCutOff ? 6 : 5);
  } else {
    process.exit(0);
  }
}

main().catch((err) => {
  console.error(`Unexpected error: ${err.message}`);
  process.exit(1);
});
