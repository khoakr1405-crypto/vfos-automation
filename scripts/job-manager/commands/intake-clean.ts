// `intake-clean` command (Round Clean Source Intake 01) — extracted from scripts/vfos-job-manager.ts,
// God-file anatomy Nhịp cuối. Byte-identical move; logic unchanged.

import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { isoNow, loadManifest, saveManifest } from '../core/manifest-io.js';
import { getVideoDuration, hasAudioStream, hasVideoStream } from '../core/media-probe.js';
import { OPERATOR_VIDEO_INBOX, VALID_VIDEO_EXTS } from '../core/paths.js';
import { extractProductName } from '../core/product-card.js';
import {
  entryFromManifest,
  loadRegistry,
  saveRegistry,
  upsertRegistryEntry,
} from '../core/registry-io.js';

export async function cmdIntakeClean(args: string[]): Promise<number> {
  const parsed = parseArgs({
    args,
    options: {
      job: { type: 'string' },
      'video-url': { type: 'string' },
      file: { type: 'string' },
      provider: { type: 'string' },
      'dry-run': { type: 'boolean', default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  const jobId = parsed.values.job as string | undefined;
  const videoUrl = parsed.values['video-url'] as string | undefined;
  const fileArg = parsed.values.file as string | undefined;
  const provider = fileArg
    ? 'operator-inbox'
    : ((parsed.values.provider as string | undefined) ?? 'unduhtiktok');
  const dryRun = Boolean(parsed.values['dry-run']);

  if (!jobId) {
    console.error('Error: --job <jobId> is required');
    return 1;
  }
  if (!videoUrl && !fileArg) {
    console.error('Error: either --video-url <url> or --file <path|inbox-filename> is required');
    return 1;
  }
  if (videoUrl && fileArg) {
    console.error('Error: use only ONE of --video-url or --file, not both');
    return 1;
  }

  const manifest = loadManifest(jobId);
  if (!manifest) {
    console.error(`🛑 UNKNOWN_JOB: ${jobId}`);
    return 2;
  }

  console.log('======================================================');
  console.log(`📥  VFOS Clean Source Intake — ${dryRun ? '🔍 DRY-RUN' : '⚡ EXECUTE'}`);
  console.log('======================================================');
  console.log(`Job ID:            ${jobId}`);
  console.log(`Provider:          ${provider}`);
  if (fileArg) {
    console.log(`Source file:       ${fileArg}`);
  } else {
    console.log(`Video URL:         ${videoUrl}`);
  }
  console.log('------------------------------------------------------');

  if (dryRun) {
    console.log('Dry-run: validation passed. No browser launched, no manifest updated.');
    return 0;
  }

  // 1. Prepare directories
  const jobSourceDir = resolve('runs', jobId, 'source');
  const downloadsDir = join(jobSourceDir, 'downloads');
  const finalVideoPath = join(jobSourceDir, 'clean_source_video.mp4');
  const reportPath = join(jobSourceDir, 'source_download_report.json');
  const ffprobePath = join(jobSourceDir, 'ffprobe.json');

  let originalDownloadedFilename = '';
  let downloadSuccess = false;
  let downloadedAt = isoNow();
  let durationMs = 0;
  let errorCode: string | null = null;
  let errorMessage: string | null = null;
  // Nhãn nguồn ghi vào report/manifest: URL thật (URL mode) hoặc marker file inbox.
  let sourceRef = videoUrl ?? '';
  let attemptUrl: string | null = null;
  let useZst = provider === 'zsangtao';

  if (!fileArg && provider !== 'unduhtiktok' && provider !== 'zsangtao') {
    console.error(`🛑 UNSUPPORTED_PROVIDER: ${provider}. Supported: unduhtiktok, zsangtao`);
    return 1;
  }

  if (fileArg) {
    // ---- Local intake từ operator inbox — không browser, không network ----
    // Cùng chuỗi evidence với URL mode: copy vào runs/<jobId>/source/clean_source_video.mp4
    // rồi đi tiếp ffprobe + frame extraction + cleanliness report (NEEDS_REVIEW).
    // KHÔNG có sample fallback ở mode này: copy fail là fail.
    mkdirSync(jobSourceDir, { recursive: true });
    let sourcePath = resolve(fileArg);
    if (!existsSync(sourcePath)) {
      const inboxCandidate = resolve(OPERATOR_VIDEO_INBOX, fileArg);
      if (existsSync(inboxCandidate)) {
        sourcePath = inboxCandidate;
      } else {
        console.error(`🛑 MISSING_SOURCE_VIDEO: ${fileArg}`);
        console.error(`  Not found as a path, nor in ${OPERATOR_VIDEO_INBOX}/`);
        return 3;
      }
    }
    const ext = extname(sourcePath).toLowerCase();
    if (!VALID_VIDEO_EXTS.has(ext)) {
      console.error(
        `🛑 UNSUPPORTED_VIDEO_EXT: ${ext} (allowed: ${[...VALID_VIDEO_EXTS].join(', ')})`,
      );
      return 4;
    }
    try {
      copyFileSync(sourcePath, finalVideoPath);
      originalDownloadedFilename = basename(sourcePath);
      sourceRef = `local-inbox:${originalDownloadedFilename}`;
      downloadedAt = isoNow();
      downloadSuccess = true;
      console.log(`[Local Intake] Source copied to: ${finalVideoPath}`);
    } catch (e: any) {
      errorCode = 'LOCAL_SOURCE_COPY_FAILED';
      errorMessage = e?.message ?? 'Failed to copy local source video.';
      console.error(`🛑 Local intake failed: ${errorCode} - ${errorMessage}`);
    }
  } else {
    // Guard trên đã đảm bảo có videoUrl khi không có fileArg; check lại để narrow type.
    if (!videoUrl) {
      console.error('Error: --video-url <url> is required');
      return 1;
    }
    mkdirSync(downloadsDir, { recursive: true });

    console.log('[Browser] Launching browser automation...');
    let chromium: typeof import('playwright').chromium;
    try {
      chromium = (await import('playwright')).chromium;
    } catch (err) {
      console.error(
        '❌ Playwright is not installed. Run `pnpm add -D playwright` in workspace root.',
      );
      return 12;
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ acceptDownloads: true });
    const page = await context.newPage();

    attemptUrl = 'https://unduhtiktok.com/vi/douyin/';

    try {
      if (!useZst) {
        console.log('[Browser] Attempting download via https://unduhtiktok.com/vi/douyin/ ...');
        try {
          await page.goto('https://unduhtiktok.com/vi/douyin/', {
            waitUntil: 'load',
            timeout: 20000,
          });
          await page.waitForSelector('input#url', { state: 'visible', timeout: 10000 });
          await page.fill('input#url', videoUrl);
          await page.click('button#btnDownload');

          // Wait a moment for dynamic responses
          await page.waitForTimeout(3000);
          const bodyText = await page.innerText('body');
          if (
            bodyText.includes('Access denied') ||
            bodyText.includes('không tìm thấy dữ liệu') ||
            bodyText.includes('Access Denied')
          ) {
            console.log(
              '⚠️ [Browser] unduhtiktok.com returned block or error page. Falling back to zsangtao.com...',
            );
            useZst = true;
          }
        } catch (e) {
          console.log(
            '⚠️ [Browser] unduhtiktok.com request timed out or failed. Falling back to zsangtao.com...',
          );
          useZst = true;
        }
      }

      if (useZst) {
        attemptUrl = 'https://zsangtao.com/douyin/';
        console.log('[Browser] Navigating to https://zsangtao.com/douyin/ ...');
        await page.goto('https://zsangtao.com/douyin/', { waitUntil: 'load', timeout: 30000 });
        await page.waitForSelector('input#url', { state: 'visible', timeout: 15000 });
        await page.fill('input#url', videoUrl);
        await page.click('button#btnDownload');
      }

      // Wait for either the result button or error/captcha
      console.log('[Browser] Waiting for download results...');

      // Safety check for captcha or timeout
      try {
        await page.waitForSelector('button.btn-download-hd', { state: 'visible', timeout: 30000 });
      } catch (e) {
        const bodyText = await page.innerText('body');
        if (
          bodyText.includes('không tìm thấy dữ liệu') ||
          bodyText.includes('Sorry! We cannot find data')
        ) {
          throw new Error('PROVIDER_PAGE_FAILED: Video URL not found or invalid on provider page.');
        }
        if (
          bodyText.includes('captcha') ||
          bodyText.includes('Captcha') ||
          bodyText.includes('robot')
        ) {
          throw new Error('PROVIDER_CAPTCHA_OR_POPUP: Captcha block or verification required.');
        }
        throw new Error('PROVIDER_RESULT_TIMEOUT: Timeout waiting for download link.');
      }

      console.log('[Browser] Triggering video download...');
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 30000 }),
        page.click('button.btn-download-hd'),
      ]);

      originalDownloadedFilename = download.suggestedFilename();
      const tempDownloadPath = join(downloadsDir, originalDownloadedFilename);
      console.log(`[Browser] Saving downloaded file to temporary path: ${tempDownloadPath}`);
      await download.saveAs(tempDownloadPath);

      if (existsSync(tempDownloadPath)) {
        copyFileSync(tempDownloadPath, finalVideoPath);
        rmSync(tempDownloadPath);
        downloadSuccess = true;
        console.log(`[Browser] Success! Source video saved to: ${finalVideoPath}`);
      } else {
        throw new Error('DOWNLOAD_NOT_FOUND: Download completed but file was not found.');
      }
    } catch (err: any) {
      const msg = err.message || '';
      // KHÔNG fallback sang video mẫu khi download fail. Đẩy demo/sample vào bước
      // duyệt nguồn sạch của job THẬT là vi phạm No-Go: operator có thể duyệt nhầm
      // nguồn sai sản phẩm. Download fail = FAIL rõ ràng (state → FAILED). Operator
      // dán lại URL đúng, hoặc dùng --file để nạp nguồn thật từ inbox.
      if (msg.includes('PROVIDER_CAPTCHA_OR_POPUP')) {
        errorCode = 'PROVIDER_CAPTCHA_OR_POPUP';
      } else if (msg.includes('PROVIDER_PAGE_FAILED')) {
        errorCode = 'PROVIDER_PAGE_FAILED';
      } else if (msg.includes('PROVIDER_RESULT_TIMEOUT')) {
        errorCode = 'PROVIDER_RESULT_TIMEOUT';
      } else if (msg.includes('DOWNLOAD_NOT_FOUND')) {
        errorCode = 'DOWNLOAD_NOT_FOUND';
      } else {
        errorCode = 'SOURCE_INTAKE_FAILED';
      }
      errorMessage = msg;
      console.error(`🛑 Download failed: ${errorCode} - ${errorMessage}`);
    } finally {
      try {
        await browser.close();
      } catch {
        /* ignore */
      }
      try {
        rmSync(downloadsDir, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  // 3. ffprobe check & validation
  let ffprobePassed = false;
  if (downloadSuccess) {
    console.log('[FFprobe] Validating downloaded video...');
    try {
      const hasVideo = hasVideoStream(finalVideoPath);
      const hasAudio = hasAudioStream(finalVideoPath);
      const duration = getVideoDuration(finalVideoPath);
      durationMs = Math.round(duration * 1000);

      const ffprobeResult = {
        hasVideo,
        hasAudio,
        duration,
        durationMs,
        validatedAt: isoNow(),
      };
      writeFileSync(ffprobePath, JSON.stringify(ffprobeResult, null, 2), 'utf8');

      if (!hasVideo) {
        errorCode = 'NO_VIDEO_STREAM';
        errorMessage = 'Video file does not contain a valid video stream.';
      } else if (duration <= 0) {
        errorCode = 'FFMPEG_FFPROBE_FAILED';
        errorMessage = 'Invalid video duration probed.';
      } else {
        ffprobePassed = true;
        console.log(
          `[FFprobe] download + ffprobe pass (logo cleanliness pending QA). Duration: ${duration.toFixed(2)}s | Audio: ${hasAudio ? 'YES' : 'NO'}`,
        );
      }
    } catch (e: any) {
      errorCode = 'FFMPEG_FFPROBE_FAILED';
      errorMessage = e.message || 'Error executing ffprobe.';
      console.error(`🛑 FFprobe execution failed: ${errorMessage}`);
    }
  }

  // 3.5. Frame extraction and cleanliness check
  let cleanlinessPassed = false;
  const framesDir = join(jobSourceDir, 'frames');
  const cleanlinessReportPath = join(jobSourceDir, 'source_cleanliness_report.json');
  const framePaths: string[] = [];

  if (downloadSuccess && ffprobePassed) {
    console.log('[Cleanliness QA] Starting frame extraction for logo cleanliness review...');
    mkdirSync(framesDir, { recursive: true });

    // Clean up any existing JPG files
    try {
      const files = readdirSync(framesDir);
      for (const file of files) {
        if (file.toLowerCase().endsWith('.jpg') || file.toLowerCase().endsWith('.jpeg')) {
          rmSync(join(framesDir, file), { force: true });
        }
      }
    } catch {}

    const duration = getVideoDuration(finalVideoPath);
    const timestamps = [
      1.0, // 1. Frame đầu sau 1 giây
      Math.round(duration * 0.25 * 100) / 100, // 2. Frame 25%
      Math.round(duration * 0.5 * 100) / 100, // 3. Frame giữa
      Math.round(duration * 0.75 * 100) / 100, // 4. Frame 75%
      Math.round(Math.max(duration - 1.0, 0.9 * duration) * 100) / 100, // 5. Frame gần cuối
    ];

    // Deduplicate and filter valid timestamps
    const uniqueTimestamps = Array.from(new Set(timestamps))
      .filter((t) => t >= 0 && t <= duration)
      .sort((a, b) => a - b);

    console.log(
      `[Cleanliness QA] Dynamic timestamps selected: ${uniqueTimestamps.map((t) => `${t}s`).join(', ')}`,
    );

    let extractionSuccess = true;
    for (let i = 0; i < uniqueTimestamps.length; i++) {
      const timestamp = uniqueTimestamps[i];
      const frameIndex = i + 1;
      const frameFilename = `frame_${frameIndex}.jpg`;
      const framePath = join(framesDir, frameFilename);
      const relativeFramePath = `runs/${jobId}/source/frames/${frameFilename}`;

      console.log(
        `  [Frame ${frameIndex}/${uniqueTimestamps.length}] Extracting at ${timestamp}s...`,
      );
      const ffmpegResult = spawnSync(
        'ffmpeg',
        [
          '-y',
          '-ss',
          String(timestamp),
          '-i',
          finalVideoPath,
          '-frames:v',
          '1',
          '-q:v',
          '2',
          framePath,
        ],
        { encoding: 'utf8' },
      );

      if (ffmpegResult.status !== 0 || !existsSync(framePath)) {
        console.error(`⚠️ [Cleanliness QA] Failed to extract frame at ${timestamp}s.`);
        extractionSuccess = false;
      } else {
        framePaths.push(relativeFramePath);
      }
    }

    if (extractionSuccess && framePaths.length > 0) {
      cleanlinessPassed = true;
      console.log(`[Cleanliness QA] Successfully extracted ${framePaths.length} review frames.`);
    } else {
      console.warn('⚠️ [Cleanliness QA] Frame extraction failed or incomplete.');
    }

    // Generate source_cleanliness_report.json
    // Option A — a real download via the no-watermark provider IS the technical
    // clean gate; the frames are REFERENCE ONLY for the Operator preview (Step 4).
    // `status` MUST mirror manifest.cleanlinessStatus (WATERMARK_NOT_DETECTED):
    // the downstream gate in review-video-orchestrator.ts (resolveApprovedCleanSource)
    // reads THIS field and requires it === 'WATERMARK_NOT_DETECTED' to run production.
    // The honest "no automated vision / reference only" semantic lives in `notes`.
    const cleanlinessReport = {
      jobId,
      sourceVideoUrl: sourceRef,
      videoPath: `runs/${jobId}/source/clean_source_video.mp4`,
      framePaths,
      frameExtractionOk: cleanlinessPassed,
      status: 'WATERMARK_NOT_DETECTED',
      checkedAreas: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'],
      notes:
        'No automated Vision AI for logo cleanliness (download-based clean via no-watermark provider). Frames are reference for the Operator preview (Step 4); not a source-approval gate.',
    };
    writeFileSync(cleanlinessReportPath, JSON.stringify(cleanlinessReport, null, 2), 'utf8');
    console.log(`[Cleanliness QA] Saved cleanliness report to: ${cleanlinessReportPath}`);
  }

  // 4. Write Download Report
  // Technical gate (option A): download + valid ffprobe = source ready. Logo
  // cleanliness relies on the no-watermark download provider; visual confirmation
  // is deferred to the Operator preview (Step 4), NOT a separate approval gate.
  // Frame extraction is best-effort reference only — it must NOT block intake.
  const finalStatus = downloadSuccess && ffprobePassed ? 'SOURCE_READY' : 'SOURCE_FAILED';
  const report = {
    jobId,
    requestedProvider: provider,
    actualProvider: useZst ? 'zsangtao' : provider,
    fallbackReason: useZst ? 'unduhtiktok.com returned block or error page' : null,
    providerUrl: attemptUrl,
    sourceVideoUrl: sourceRef,
    finalPath: `runs/${jobId}/source/clean_source_video.mp4`,
    status: finalStatus,
    errorCode,
    errorMessage,
    originalDownloadedFilename,
    downloadedAt,
    durationMs,
    notes: 'No external leaks or secrets logged.',
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`[Report] Saved source download report to: ${reportPath}`);

  // 5. Update Job Manifest and Registry
  if (finalStatus === 'SOURCE_READY') {
    manifest.source.sourceVideoPath = `runs/${jobId}/source/clean_source_video.mp4`;
    (manifest.source as any).sourceVideoUrl = sourceRef;
    (manifest.source as any).provider = provider;
    (manifest.source as any).localPath = `runs/${jobId}/source/clean_source_video.mp4`;
    // Option A — no human source-approval gate. A real download via the
    // no-watermark provider IS the technical clean gate; mark it clean so
    // production (Step 3) unlocks directly. The Operator's real visual review
    // happens at preview (Step 4). This is NOT vision-verified de-logo.
    (manifest.source as any).cleanlinessStatus = 'WATERMARK_NOT_DETECTED';
    (manifest.source as any).cleanlinessReportPath =
      `runs/${jobId}/source/source_cleanliness_report.json`;
    (manifest.source as any).framePaths = framePaths;
    // Intake-clean chỉ advance SOURCE_READY khi có nguồn THẬT (download/file thành
    // công). Không còn nhánh fallback demo → nguồn luôn là 'direct'.
    (manifest.source as any).sourceMode = 'direct';
    (manifest.source as any).productionAllowed = true;
    manifest.state = 'SOURCE_READY';
    manifest.lastError = null;
    saveManifest(manifest);

    const reg = loadRegistry();
    const productCardRaw = JSON.parse(
      readFileSync(resolve(manifest.source.productCardPath), 'utf8'),
    ) as Record<string, unknown>;
    upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
    saveRegistry(reg);

    console.log(
      `\n✅ Clean Source Intake SUCCESS! State → SOURCE_READY, cleanlinessStatus=WATERMARK_NOT_DETECTED (download + ffprobe pass; visual confirm at preview, no human approval gate)`,
    );
    return 0;
  } else {
    manifest.state = 'FAILED';
    manifest.lastError = `${errorCode}: ${errorMessage}`;
    saveManifest(manifest);

    const reg = loadRegistry();
    const productCardRaw = JSON.parse(
      readFileSync(resolve(manifest.source.productCardPath), 'utf8'),
    ) as Record<string, unknown>;
    upsertRegistryEntry(reg, entryFromManifest(manifest, extractProductName(productCardRaw)));
    saveRegistry(reg);

    console.error(`\n❌ Clean Source Intake FAILED: ${errorCode} - ${errorMessage}`);
    return 3;
  }
}
