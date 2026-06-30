/* =============================================================================
 * VFOS — Entertainment story-engine flag + metadata surface — node:test.
 * - resolveMontageEngine: DEFENSIVE default 'story' (chỉ 'anchors' tường minh → anchors).
 * - readStorySummary: đọc story_arc.json ra { confidence, sourceType }, null khi không có.
 * KHÔNG render, KHÔNG publish, KHÔNG đụng pipeline / step 10/12/13/15 / anchors engine.
 *
 * Runner (studio dùng alias '@/' + biên CJS dưới tsx nên named-ESM-import không link
 * được → dùng DYNAMIC import + default namespace; cần TSX_TSCONFIG_PATH cho alias '@/'):
 *   TSX_TSCONFIG_PATH=apps/studio/tsconfig.json \
 *     npx tsx --test tests/entertainment-story-engine.test.ts
 * ========================================================================== */

import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { after, before, describe, test } from 'node:test';

type JobsMod = typeof import('../apps/studio/src/lib/entertainment/jobs.ts');
type PathsMod = typeof import('../apps/studio/src/lib/studio-data/paths.ts');
type ChannelsMod = typeof import('../apps/studio/src/lib/entertainment/channels.ts');

let resolveMontageEngine: JobsMod['resolveMontageEngine'];
let readStorySummary: JobsMod['readStorySummary'];
let jobStoryEngineFor: JobsMod['jobStoryEngineFor'];
let listChannelsForUi: JobsMod['listChannelsForUi'];
let resolveInsideRepo: PathsMod['resolveInsideRepo'];
let getChannel: ChannelsMod['getChannel'];

before(async () => {
  const j = (await import('../apps/studio/src/lib/entertainment/jobs.ts')) as JobsMod & {
    default?: JobsMod;
  };
  const p = (await import('../apps/studio/src/lib/studio-data/paths.ts')) as PathsMod & {
    default?: PathsMod;
  };
  const c = (await import('../apps/studio/src/lib/entertainment/channels.ts')) as ChannelsMod & {
    default?: ChannelsMod;
  };
  const jd = j.default ?? j;
  const pd = p.default ?? p;
  const cd = c.default ?? c;
  resolveMontageEngine = jd.resolveMontageEngine;
  readStorySummary = jd.readStorySummary;
  jobStoryEngineFor = jd.jobStoryEngineFor;
  listChannelsForUi = jd.listChannelsForUi;
  resolveInsideRepo = pd.resolveInsideRepo;
  getChannel = cd.getChannel;
});

describe('resolveMontageEngine — defensive default story', () => {
  test("storyEngine='anchors' → 'anchors' (chỉ trường hợp tường minh)", () => {
    assert.equal(resolveMontageEngine({ storyEngine: 'anchors' }), 'anchors');
  });

  test("storyEngine='story' → 'story'", () => {
    assert.equal(resolveMontageEngine({ storyEngine: 'story' }), 'story');
  });

  test('thiếu field (manifest cũ) → story (backward-compatible)', () => {
    assert.equal(resolveMontageEngine({}), 'story');
  });

  test('giá trị lạ / không hợp lệ → story (defensive)', () => {
    const weird = { storyEngine: 'STORY' } as unknown as Parameters<typeof resolveMontageEngine>[0];
    assert.equal(resolveMontageEngine(weird), 'story');
    const empty = { storyEngine: '' } as unknown as Parameters<typeof resolveMontageEngine>[0];
    assert.equal(resolveMontageEngine(empty), 'story');
  });
});

describe('readStorySummary — surface story_arc.json', () => {
  const JOB = 'ent_storyfix_test';
  function fixDir(): string {
    const d = resolveInsideRepo(`data/temp/ent/${JOB}`);
    if (!d) throw new Error('fixture path không resolve được trong repo');
    return d;
  }

  after(() => {
    rmSync(fixDir(), { recursive: true, force: true });
  });

  test('story_confidence + source_type → { confidence, sourceType }', () => {
    const dir = fixDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/story_arc.json`,
      JSON.stringify({ story_confidence: 'high', source_type: 'story' }),
    );
    assert.deepEqual(readStorySummary(JOB), { confidence: 'high', sourceType: 'story' });
  });

  test('giá trị khác (low/highlight) đọc đúng', () => {
    const dir = fixDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      `${dir}/story_arc.json`,
      JSON.stringify({ story_confidence: 'low', source_type: 'highlight' }),
    );
    assert.deepEqual(readStorySummary(JOB), { confidence: 'low', sourceType: 'highlight' });
  });

  test('không có story_arc.json → null (không làm bẩn manifest)', () => {
    const dir = fixDir();
    rmSync(`${dir}/story_arc.json`, { force: true });
    assert.equal(readStorySummary(JOB), null);
  });

  test('story_arc.json thiếu cả 2 field → null', () => {
    const dir = fixDir();
    mkdirSync(dir, { recursive: true });
    writeFileSync(`${dir}/story_arc.json`, JSON.stringify({ videoId: JOB }));
    assert.equal(readStorySummary(JOB), null);
  });

  test('jobId không hợp lệ → null (không path-traversal)', () => {
    assert.equal(readStorySummary('../evil'), null);
  });
});

describe('jobStoryEngineFor — per-channel copy (defensive default story)', () => {
  test("channel.storyEngine='anchors' → 'anchors'", () => {
    assert.equal(jobStoryEngineFor({ storyEngine: 'anchors' }), 'anchors');
  });

  test("channel.storyEngine='story' → 'story'", () => {
    assert.equal(jobStoryEngineFor({ storyEngine: 'story' }), 'story');
  });

  test('channel thiếu storyEngine → story', () => {
    assert.equal(jobStoryEngineFor({}), 'story');
  });

  test('channel null → story', () => {
    assert.equal(jobStoryEngineFor(null), 'story');
  });

  test('giá trị lạ / không hợp lệ → story (defensive)', () => {
    const weird = { storyEngine: 'STORY' } as unknown as Parameters<typeof jobStoryEngineFor>[0];
    assert.equal(jobStoryEngineFor(weird), 'story');
  });
});

describe('config thật — ch_fishing storyEngine', () => {
  test("getChannel('ch_fishing').storyEngine === 'story' (config + coerce)", () => {
    assert.equal(getChannel('ch_fishing')?.storyEngine, 'story');
  });

  test("listChannelsForUi surface storyEngine cho UI: ch_fishing === 'story'", () => {
    const ui = listChannelsForUi().find((c) => c.channelId === 'ch_fishing');
    assert.ok(ui, 'ch_fishing phải có trong listChannelsForUi');
    assert.equal(ui.storyEngine, 'story');
  });
});
