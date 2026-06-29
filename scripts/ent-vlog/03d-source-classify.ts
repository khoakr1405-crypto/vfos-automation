// E1 step 03d — SOURCE CLASSIFIER + story_confidence (R1, READ-ONLY).
// Đọc asr_zh.json + catch_moments.json + source_meta.json (đã có) → ghi story_arc.json.
// KHÔNG render, KHÔNG gọi LLM, KHÔNG sửa montage/audio/pipeline. Deterministic.
//   pnpm tsx scripts/ent-vlog/03d-source-classify.ts --id ent_fishing_20260626_105048
import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { workDir } from './lib/env.js';
import { buildStoryArc } from './lib/story-arc.js';

function main(): void {
  const { values } = parseArgs({ options: { id: { type: 'string' } }, strict: true });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <ent_job_id>');
    process.exit(1);
  }
  const dir = workDir(id);
  for (const f of ['source_meta.json', 'asr_zh.json', 'catch_moments.json']) {
    if (!existsSync(join(dir, f))) {
      console.error(`🛑 MISSING ${f} — cần chạy analyze (02/03b) trước. Không bịa.`);
      process.exit(2);
    }
  }

  const arc = buildStoryArc(dir, id);
  const outPath = join(dir, 'story_arc.json');
  writeFileSync(outPath, JSON.stringify(arc, null, 2));

  const a = arc.metrics.asr;
  const v = arc.metrics.vision;
  console.log('======================================================');
  console.log(`[03d] ${id} — CLASSIFY (read-only, deterministic)`);
  console.log(`  source: ${arc.sourceDurationSec}s`);
  console.log('  --- ASR (số liệu neo) ---');
  console.log(`  speechRatio ${a.speechRatio} | charsPerMin ${a.charsPerMin} | segs ${a.segCount}`);
  console.log(
    `  persona(我) ${a.firstPersonCues} | narrative ${a.narrativeCues} | reaction ${a.reactionCues} | vocabDiv ${a.vocabDiversity}`,
  );
  console.log('  --- VISION ---');
  console.log(
    `  moments ${v.nMoments} | strong(≥8) ${v.nStrong} | maxScore ${v.maxScore} | clusters ${v.clusters.length} | maxGap ${v.maxGapSec}s`,
  );
  console.log('  --- KẾT QUẢ ---');
  console.log(`  story_confidence: ${arc.story_confidence.toUpperCase()}`);
  console.log(`     ${arc.confidenceReason}`);
  console.log(`  source_type: ${arc.source_type}`);
  console.log(`     ${arc.typeReason}`);
  if (arc.acts) {
    console.log('  --- ACTS đề xuất (bằng chứng từ catch + ASR) ---');
    for (const ac of arc.acts) {
      console.log(
        `  ${ac.role.padEnd(10)} [${ac.srcStart}-${ac.srcEnd}s] catch[${ac.catchTSecs.join(',') || '-'}] :: ${ac.asrEvidence.join(' / ').slice(0, 70)}`,
      );
    }
  }
  if (arc.split) {
    console.log('  --- SPLIT (read-only, CHƯA render) ---');
    console.log(`  seam @${arc.split.seamSec}s — ${arc.split.reason}`);
    console.log(
      `  part1 [0-${arc.split.part1.srcEnd}s] mini-climax@${arc.split.part1.miniClimaxTSec}s`,
    );
    console.log(
      `  part2 [${arc.split.part2.srcStart}-${arc.split.part2.srcEnd}s] climax@${arc.split.part2.climaxTSec}s`,
    );
  }
  console.log(`  → ${outPath}`);
  console.log('======================================================');
}

main();
