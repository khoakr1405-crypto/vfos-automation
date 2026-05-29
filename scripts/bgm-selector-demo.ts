/**
 * Background Music Selector Utility Script — Round P27.
 *
 * Implements a metadata-driven rotation manager. Lacks external dependencies.
 * Filters tracks from bgm_library.json based on mood constraints, selects the least-recently-used
 * track (using a round-robin algorithm), verifies local asset availability, and records selection.
 *
 * Command: tsx scripts/bgm-selector-demo.ts [--mood <string>] [--output <path>]
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';

const LIBRARY_PATH = resolve('production/_media/bgm_library.json');
const AUDIO_FIXTURES_DIR = resolve('production/fixtures/bgm');

const options = {
  mood: { type: 'string' as const },
  output: { type: 'string' as const },
};

const { values } = parseArgs({ options, strict: false });

async function main() {
  const requestedMood = values.mood?.toLowerCase() || '';
  const outputPath = values.output || 'data/temp/bgm_selection_artifact.json';

  console.log('[BGM] Initiating background music selection flow...');
  console.log(`[BGM] Requested Mood: ${requestedMood || 'ANY'}`);
  console.log(`[BGM] Output Artifact Target: ${outputPath}`);

  // Step 1: Validate library database presence
  if (!existsSync(LIBRARY_PATH)) {
    console.error(`[BGM] FATAL: BGM library database not found at: ${LIBRARY_PATH}`);
    process.exit(1);
  }

  let db: any = null;
  try {
    db = JSON.parse(readFileSync(LIBRARY_PATH, 'utf8'));
  } catch (err: any) {
    console.error(`[BGM] FATAL: Failed to parse library database: ${err.message}`);
    process.exit(1);
  }

  const entries: any[] = db?.entries || [];
  if (entries.length === 0) {
    console.error('[BGM] FATAL: Library has no track entries.');
    process.exit(1);
  }

  // Step 2: Filter candidate entries by requested mood if specified
  let candidates = requestedMood ? entries.filter((e: any) => e.mood === requestedMood) : entries;

  if (candidates.length === 0) {
    console.log(
      `[BGM] Warning: No tracks found matching mood "${requestedMood}". Falling back to entire library.`,
    );
    candidates = entries;
  }

  // Step 3: Implement smart round-robin sorting algorithm
  // Least recently used first (nulls are considered oldest), then sort by usageCount
  candidates.sort((a: any, b: any) => {
    if (a.lastUsedAt === null && b.lastUsedAt !== null) return -1;
    if (a.lastUsedAt !== null && b.lastUsedAt === null) return 1;
    if (a.lastUsedAt !== null && b.lastUsedAt !== null) {
      const timeA = new Date(a.lastUsedAt).getTime();
      const timeB = new Date(b.lastUsedAt).getTime();
      if (timeA !== timeB) return timeA - timeB;
    }
    return a.usageCount - b.usageCount;
  });

  const chosenTrack = candidates[0];
  console.log(
    `[BGM] Selected track: "${chosenTrack.title}" [ID: ${chosenTrack.trackId}] [Mood: ${chosenTrack.mood}]`,
  );

  // Step 4: Verify local media asset existence
  const localAudioPath = resolve(AUDIO_FIXTURES_DIR, chosenTrack.fileName);
  const fileExists = existsSync(localAudioPath);

  if (!fileExists) {
    console.warn(`[BGM] WARNING: Local BGM audio file is missing at: ${localAudioPath}`);
    console.warn('[BGM] Warning: Downstream composition will fall back to default fixture assets.');
  }

  // Step 5: Save update in central library database file
  chosenTrack.usageCount += 1;
  chosenTrack.lastUsedAt = new Date().toISOString();
  db.updated_at = new Date().toISOString();

  try {
    writeFileSync(LIBRARY_PATH, JSON.stringify(db, null, 2), 'utf8');
    console.log('[BGM] Successfully updated rotation statistics in central library database.');
  } catch (err: any) {
    console.warn(`[BGM] Warning: Failed to write back to database: ${err.message}`);
  }

  // Step 6: Write BGM selection artifact
  const artifact = {
    status: 'SELECTED',
    trackId: chosenTrack.trackId,
    title: chosenTrack.title,
    mood: chosenTrack.mood,
    fileName: chosenTrack.fileName,
    durationSec: chosenTrack.durationSec,
    localAudioPath,
    fileExists,
    generatedAt: new Date().toISOString(),
  };

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, JSON.stringify(artifact, null, 2), 'utf8');
  console.log(`[BGM] Selection artifact successfully written to: ${outputPath}`);
  process.exit(0);
}

main().catch((e) => {
  console.error('[BGM] FATAL unhandled rejection:', e);
  process.exit(1);
});
