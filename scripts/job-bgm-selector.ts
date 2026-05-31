/**
 * VFOS Job-local BGM Selector — Round 51A.
 *
 * Restores the mandatory BGM rotation step that was missing from the
 * job-native render path (`pnpm chay:review --job <jobId>`). The renderer
 * (scripts/offline-render-video-demo.ts) already knows how to mix voice + BGM,
 * but it only does so when the render manifest carries a selected BGM track
 * whose audio file exists on disk. Prior to this round the orchestrator
 * hardcoded `assets.bgm = null`, so every job rendered voiceover-only.
 *
 * This module:
 *   - reads the BGM library metadata,
 *   - filters to tracks whose real audio file exists,
 *   - rotates by usage (lowest usageCount first, then never-used first),
 *   - writes a per-job bgm_selection_artifact.json,
 *   - increments usageCount + lastUsedAt so rotation advances.
 *
 * It performs NO network/API calls and NEVER generates audio. If the library
 * metadata exists but no real audio files are present it returns
 * BGM_LIBRARY_FILES_MISSING — the caller decides whether to fail (default) or
 * proceed under an explicit operator override.
 *
 * CLI (read-only inspection — does not mutate the library):
 *   pnpm bgm:check
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';

const DEFAULT_LIBRARY_PATH = 'production/_media/bgm_library.json';
const BGM_VOLUME_MULTIPLIER = 0.12;

// Round 52: BGM leads mood; voice is the lead instrument and must stay clear.
// Each mood group maps to a deterministic voice direction so the voiceover is
// generated to match the BGM bed (and so voice can be detected as stale when
// the BGM mood changes). clarityPriority is always true — voice over BGM.
export interface VoiceDirection {
  style: string;
  pace: string;
  energy: 'low' | 'medium' | 'high';
  delivery: string;
  clarityPriority: true;
}

const VOICE_DIRECTION_BY_MOOD: Record<string, VoiceDirection> = {
  upbeat_review: {
    style: 'vui tươi, sáng',
    pace: 'nhanh vừa',
    energy: 'high',
    delivery: 'energetic friendly, rõ lời',
    clarityPriority: true,
  },
  lofi_lifestyle: {
    style: 'mềm mại, tự nhiên',
    pace: 'vừa phải',
    energy: 'medium',
    delivery: 'calm warm, không buồn, rõ lời',
    clarityPriority: true,
  },
  funky_tiktok: {
    style: 'năng động, dí dỏm',
    pace: 'nhanh vừa',
    energy: 'high',
    delivery: 'playful punchy, rõ lời',
    clarityPriority: true,
  },
  clean_tech: {
    style: 'gọn, rõ, tự tin',
    pace: 'vừa',
    energy: 'medium',
    delivery: 'crisp modern confident, rõ lời',
    clarityPriority: true,
  },
};

const DEFAULT_VOICE_DIRECTION: VoiceDirection = {
  style: 'rõ ràng, tự nhiên',
  pace: 'vừa',
  energy: 'medium',
  delivery: 'neutral friendly, rõ lời',
  clarityPriority: true,
};

function voiceDirectionFor(mood: string): VoiceDirection {
  return VOICE_DIRECTION_BY_MOOD[mood] ?? DEFAULT_VOICE_DIRECTION;
}

/** Stable short hash of the voice direction — used for voice/BGM coupling. */
export function hashVoiceDirection(vd: VoiceDirection): string {
  return createHash('sha256').update(JSON.stringify(vd)).digest('hex').slice(0, 16);
}

interface BgmLibraryEntry {
  id?: string;
  trackId?: string;
  title?: string;
  fileName?: string;
  path?: string;
  localAudioPath?: string;
  mood?: string;
  useCase?: string;
  usageCount?: number;
  lastUsedAt?: string | null;
}

interface BgmLibrary {
  updated_at?: string;
  entries: BgmLibraryEntry[];
}

export interface BgmSelection {
  bgmArtifactVersion: 'v2';
  jobId: string;
  selected: true;
  trackId: string;
  title: string;
  mood: string;
  localAudioPath: string;
  volumeMultiplier: number;
  selectionPolicy: 'sticky_or_rotation';
  selectionReason: string;
  matchedMood: string;
  energyLevel: 'low' | 'medium' | 'high';
  voiceDirection: VoiceDirection;
  voiceDirectionHash: string;
  generatedAt: string;
}

export interface BgmSelectResult {
  status: 'OK' | 'BGM_LIBRARY_FILES_MISSING' | 'BGM_LIBRARY_NOT_FOUND' | 'BGM_SELECTION_FAILED';
  libraryPath: string;
  libraryEntryCount: number;
  existingFileCount: number;
  selection?: BgmSelection;
  artifactPath?: string;
  reused?: boolean;
  reason?: string;
}

/** Resolve the on-disk audio path for a library entry (path or localAudioPath). */
function entryAudioPath(entry: BgmLibraryEntry): string | null {
  return entry.localAudioPath ?? entry.path ?? null;
}

/** Read-only library inspection — never mutates. */
export function inspectBgmLibrary(libraryPath = DEFAULT_LIBRARY_PATH): {
  found: boolean;
  libraryPath: string;
  entryCount: number;
  existingFileCount: number;
  existing: Array<{ trackId: string; path: string }>;
  missing: Array<{ trackId: string; path: string }>;
} {
  const abs = resolve(libraryPath);
  if (!existsSync(abs)) {
    return {
      found: false,
      libraryPath,
      entryCount: 0,
      existingFileCount: 0,
      existing: [],
      missing: [],
    };
  }
  const lib = JSON.parse(readFileSync(abs, 'utf8')) as BgmLibrary;
  const entries = Array.isArray(lib.entries) ? lib.entries : [];
  const existing: Array<{ trackId: string; path: string }> = [];
  const missing: Array<{ trackId: string; path: string }> = [];
  for (const e of entries) {
    const p = entryAudioPath(e);
    const trackId = e.trackId ?? e.id ?? '(unknown)';
    if (p && existsSync(resolve(p))) existing.push({ trackId, path: p });
    else missing.push({ trackId, path: p ?? '(no path)' });
  }
  return {
    found: true,
    libraryPath,
    entryCount: entries.length,
    existingFileCount: existing.length,
    existing,
    missing,
  };
}

/**
 * Select a BGM track for a job and persist the selection artifact.
 *
 * Rotation: among tracks whose audio file exists, pick the one with the lowest
 * usageCount (never-used `lastUsedAt === null` sorts first), tie-broken by
 * library order for determinism. The chosen track's usageCount is incremented
 * and lastUsedAt stamped so the next job rotates onward.
 */
export function selectBgmForJob(args: {
  jobId: string;
  jobOutputDir: string;
  libraryPath?: string;
  forceReselect?: boolean;
}): BgmSelectResult {
  const libraryPath = args.libraryPath ?? DEFAULT_LIBRARY_PATH;
  const absLibrary = resolve(libraryPath);
  const artifactPath = resolve(args.jobOutputDir, 'bgm_selection_artifact.json');

  if (!existsSync(absLibrary)) {
    return {
      status: 'BGM_LIBRARY_NOT_FOUND',
      libraryPath,
      libraryEntryCount: 0,
      existingFileCount: 0,
      reason: `BGM library metadata not found at ${libraryPath}.`,
    };
  }

  // Sticky per-job: reuse an existing valid selection so BGM (and therefore the
  // coupled voice direction) stays stable across re-runs. Only re-rotate when
  // forced or when no valid prior selection exists.
  if (!args.forceReselect && existsSync(artifactPath)) {
    try {
      const prior = JSON.parse(readFileSync(artifactPath, 'utf8')) as Partial<BgmSelection>;
      if (
        prior.selected &&
        prior.trackId &&
        prior.localAudioPath &&
        existsSync(resolve(prior.localAudioPath)) &&
        prior.voiceDirectionHash &&
        prior.bgmArtifactVersion === 'v2'
      ) {
        return {
          status: 'OK',
          libraryPath,
          libraryEntryCount: 0,
          existingFileCount: 1,
          selection: prior as BgmSelection,
          artifactPath,
          reused: true,
        };
      }
    } catch {
      // fall through to fresh selection
    }
  }

  const lib = JSON.parse(readFileSync(absLibrary, 'utf8')) as BgmLibrary;
  const entries = Array.isArray(lib.entries) ? lib.entries : [];

  const existing = entries
    .map((entry, index) => ({ entry, index, audioPath: entryAudioPath(entry) }))
    .filter((x) => x.audioPath && existsSync(resolve(x.audioPath)));

  if (existing.length === 0) {
    return {
      status: 'BGM_LIBRARY_FILES_MISSING',
      libraryPath,
      libraryEntryCount: entries.length,
      existingFileCount: 0,
      reason:
        `BGM library declares ${entries.length} track(s) but no real audio file exists on disk. ` +
        `Add mp3 files to production/fixtures/bgm/ according to ${libraryPath}.`,
    };
  }

  // Rotation: lowest usageCount first; never-used (null lastUsedAt) preferred.
  existing.sort((a, b) => {
    const ua = a.entry.usageCount ?? 0;
    const ub = b.entry.usageCount ?? 0;
    if (ua !== ub) return ua - ub;
    const na = a.entry.lastUsedAt == null ? 0 : 1;
    const nb = b.entry.lastUsedAt == null ? 0 : 1;
    if (na !== nb) return na - nb;
    return a.index - b.index;
  });

  const chosen = existing[0];
  const chosenEntry = chosen.entry;
  const trackId = chosenEntry.trackId ?? chosenEntry.id ?? 'bgm_unknown';
  const mood = chosenEntry.mood ?? 'unknown';
  const generatedAt = new Date().toISOString();
  const voiceDirection = voiceDirectionFor(mood);

  const selection: BgmSelection = {
    bgmArtifactVersion: 'v2',
    jobId: args.jobId,
    selected: true,
    trackId,
    title: chosenEntry.title ?? trackId,
    mood,
    localAudioPath: chosen.audioPath as string,
    volumeMultiplier: BGM_VOLUME_MULTIPLIER,
    selectionPolicy: 'sticky_or_rotation',
    selectionReason: `Rotation pick (lowest usageCount=${chosenEntry.usageCount ?? 0}) among ${existing.length} available track(s); mood "${mood}" drives the coupled voice direction.`,
    matchedMood: mood,
    energyLevel: voiceDirection.energy,
    voiceDirection,
    voiceDirectionHash: hashVoiceDirection(voiceDirection),
    generatedAt,
  };

  // Persist the selection artifact into the job folder.
  writeFileSync(artifactPath, `${JSON.stringify(selection, null, 2)}\n`, 'utf8');

  // Advance rotation: bump usageCount + lastUsedAt for the chosen track.
  chosenEntry.usageCount = (chosenEntry.usageCount ?? 0) + 1;
  chosenEntry.lastUsedAt = generatedAt;
  lib.updated_at = generatedAt;
  writeFileSync(absLibrary, `${JSON.stringify(lib, null, 2)}\n`, 'utf8');

  return {
    status: 'OK',
    libraryPath,
    libraryEntryCount: entries.length,
    existingFileCount: existing.length,
    selection,
    artifactPath,
  };
}

// ── CLI: read-only inspection (`pnpm bgm:check`) ──────────────────────────────
function isMain(): boolean {
  return process.argv[1]?.endsWith('job-bgm-selector.ts') ?? false;
}

if (isMain()) {
  const { values } = parseArgs({
    options: { check: { type: 'boolean', default: false }, library: { type: 'string' } },
    strict: false,
  });
  const libraryPath = (values.library as string | undefined) ?? DEFAULT_LIBRARY_PATH;
  const info = inspectBgmLibrary(libraryPath);

  console.log('── BGM Library Check (read-only) ─────────────────────────────');
  console.log(`Library path        : ${info.libraryPath}`);
  console.log(`Library found       : ${info.found ? 'YES' : 'NO'}`);
  console.log(`Declared tracks     : ${info.entryCount}`);
  console.log(`Real audio files    : ${info.existingFileCount}`);
  if (!info.found) {
    console.log('Result              : BGM_LIBRARY_NOT_FOUND');
    process.exit(0);
  }
  if (info.existingFileCount === 0) {
    console.log('Result              : BGM_LIBRARY_FILES_MISSING');
    console.log(
      'Action              : add mp3 files to production/fixtures/bgm/ per bgm_library.json',
    );
  } else {
    console.log('Result              : OK');
    console.log(`Existing tracks     : ${info.existing.map((e) => e.trackId).join(', ')}`);
  }
  process.exit(0);
}
