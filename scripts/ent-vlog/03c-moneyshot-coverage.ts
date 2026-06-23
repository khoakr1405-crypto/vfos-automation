// E1 step 03c — MONEY-SHOT coverage GATE. Đọc catch_moments.json (vision-anchor),
// chọn anchors TỪ cảnh ăn tiền thật (không hardcode), ghi:
//   - anchors.json  → 10-montage-v2 + 15-audio-ambient-full đọc CHUNG (sync video/audio)
//   - moneyshot_coverage_report.json → UI hiện "phát hiện X, dùng Y"
// FAIL (exit ≠ 0) nếu số cảnh ăn tiền dùng được < min → produce DỪNG, KHÔNG render
// /preview giả PASS. Chạy NGẦM trong nút "Sản xuất video" (không phơi UI riêng).
//   pnpm tsx scripts/ent-vlog/03c-moneyshot-coverage.ts --id ent_xxx [--min 3] [--max 6]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  type CatchMoment,
  DEFAULT_LEAD,
  DEFAULT_MAX_ANCHORS,
  DEFAULT_MIN_ANCHORS,
  DEFAULT_REACTION,
  STRONG_SCORE,
  deriveAnchors,
} from './lib/anchors.js';
import { workDir } from './lib/env.js';

function tc(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      min: { type: 'string' },
      max: { type: 'string' },
      lead: { type: 'string' },
      reaction: { type: 'string' },
    },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--min 3] [--max 6]');
    process.exit(1);
  }
  const min = values.min ? Math.max(1, Number(values.min)) : DEFAULT_MIN_ANCHORS;
  const max = values.max ? Math.max(1, Number(values.max)) : DEFAULT_MAX_ANCHORS;
  const lead = values.lead ? Number(values.lead) : DEFAULT_LEAD;
  const reaction = values.reaction ? Number(values.reaction) : DEFAULT_REACTION;

  const dir = workDir(id);
  const catchPath = join(dir, 'catch_moments.json');
  if (!existsSync(catchPath)) {
    console.error(
      '🛑 NO_CATCH_MOMENTS — chưa có catch_moments.json (chạy 03b-vision-anchor trước).',
    );
    process.exit(2);
  }
  const catchData = JSON.parse(readFileSync(catchPath, 'utf8')) as {
    threshold?: number;
    moments?: CatchMoment[];
  };
  const moments = catchData.moments ?? [];
  const { anchors, picked } = deriveAnchors(moments, { lead, reaction, max });
  const strong = moments.filter((m) => m.score >= STRONG_SCORE).length;
  const pass = anchors.length >= min;

  // anchors.json — hợp đồng dùng chung cho montage (10) + audio (15).
  writeFileSync(
    join(dir, 'anchors.json'),
    JSON.stringify(
      { anchors, lead, reaction, source: 'catch_moments', generatedAt: new Date().toISOString() },
      null,
      2,
    ),
  );

  // coverage report — luôn ghi (kể cả FAIL) để UI hiển thị lý do.
  const report = {
    detectedMoments: moments.length,
    strongMoments: strong,
    visionThreshold: catchData.threshold ?? null,
    usedAnchors: anchors.length,
    minRequired: min,
    maxAnchors: max,
    lead,
    reaction,
    pass,
    anchors: picked.map((p) => ({
      tSec: p.tSec,
      tc: tc(p.tSec),
      score: p.score,
      what: p.what ?? '',
    })),
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(dir, 'moneyshot_coverage_report.json'), JSON.stringify(report, null, 2));

  console.log('------------------------------------------------------');
  console.log(
    `[03c] Coverage: phát hiện ${moments.length} cảnh ăn tiền (rõ ${strong}), DÙNG ${anchors.length}.`,
  );
  for (const p of picked) console.log(`     ${tc(p.tSec)} | score ${p.score} | ${p.what ?? ''}`);
  if (!pass) {
    console.error(
      `🛑 MONEYSHOT_COVERAGE_FAIL — chỉ ${anchors.length} cảnh ăn tiền dùng được (< ${min}). Video nghèo cảnh ăn tiền — DỪNG, không render giả PASS.`,
    );
    process.exit(5);
  }
  console.log('[03c] ✅ Coverage PASS — anchors.json ghi xong (montage + audio dùng chung).');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
