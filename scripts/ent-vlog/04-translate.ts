// E1 step 04 — transcreate ONE clip (zh→vi, 2-pass) and emit the review gate.
// Writes clip_<n>_translation_vi.json (machine) + .md (operator review).
// HARD STOP: voice-over (step 05) must not run until the .md is approved.
//   pnpm tsx scripts/ent-vlog/04-translate.ts --id ent_squid_001 [--clip clip_1] [--context "..."]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { requireOpenAIKey, workDir } from './lib/env.js';
import type { AsrSegment } from './lib/openai.js';
import { type ClipSeg, transcreateClip } from './lib/transcreation.js';

function tc(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      id: { type: 'string' },
      clip: { type: 'string' },
      context: { type: 'string' },
    },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--clip clip_1] [--context "<bối cảnh>"]');
    process.exit(1);
  }
  const dir = workDir(id);
  const candPath = join(dir, 'clip_candidates.json');
  const asrPath = join(dir, 'asr_zh.json');
  if (!existsSync(candPath) || !existsSync(asrPath)) {
    console.error('🛑 Thiếu clip_candidates.json / asr_zh.json — chạy 02 + 03 trước.');
    process.exit(1);
  }

  const cand = JSON.parse(readFileSync(candPath, 'utf8')) as {
    clips: Array<{
      clipId: string;
      startSec: number;
      endSec: number;
      durationSec: number;
      reasonVi: string;
      score: number;
      segmentIds: number[];
    }>;
  };
  const asr = JSON.parse(readFileSync(asrPath, 'utf8')) as { segments: AsrSegment[] };
  const segById = new Map(asr.segments.map((s) => [s.id, s]));

  const targetClipId = values.clip ?? cand.clips[0]?.clipId;
  const clip = cand.clips.find((c) => c.clipId === targetClipId);
  if (!clip) {
    console.error(
      `🛑 Clip không tồn tại: ${targetClipId}. Có: ${cand.clips.map((c) => c.clipId).join(', ')}`,
    );
    process.exit(1);
  }

  const clipSegs: ClipSeg[] = clip.segmentIds
    .map((sid) => segById.get(sid))
    .filter((s): s is AsrSegment => !!s && s.text.length > 0)
    .map((s) => ({ id: s.id, start: s.start, end: s.end, zh: s.text }));

  if (clipSegs.length === 0) {
    console.error('🛑 Clip không có đoạn thoại để dịch.');
    process.exit(2);
  }

  const context = values.context ?? 'Vlog câu/săn mực trên biển (Biển Đông), giọng nam vui vẻ.';
  const apiKey = requireOpenAIKey();

  console.log(`[04] Transcreation 2-pass cho ${clip.clipId} (${clipSegs.length} đoạn)…`);
  const result = await transcreateClip(apiKey, { segments: clipSegs, contextVi: context });

  const jsonOut = {
    videoId: id,
    clipId: clip.clipId,
    startSec: clip.startSec,
    endSec: clip.endSec,
    durationSec: clip.durationSec,
    context,
    reviewStatus: 'PENDING_OPERATOR_REVIEW',
    notes: result.notes,
    segments: result.segments,
  };
  const jsonPath = join(dir, `${clip.clipId}_translation_vi.json`);
  writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2));

  // Human-readable review gate artifact.
  const md: string[] = [];
  md.push(`# Bản dịch để duyệt — ${clip.clipId}`);
  md.push('');
  md.push(`- Video: ${id}`);
  md.push(`- Đoạn: ${tc(clip.startSec)}–${tc(clip.endSec)} (${clip.durationSec.toFixed(0)}s)`);
  md.push(`- Lý do chọn: ${clip.reasonVi}`);
  md.push(`- Bối cảnh: ${context}`);
  md.push(`- Ghi chú biên tập: ${result.notes || '(không)'}`);
  md.push('');
  md.push('> ⛔ CỔNG DUYỆT: sửa trực tiếp field `vi` trong file JSON cùng tên nếu cần,');
  md.push('> rồi mới chạy bước lồng tiếng (05). CHƯA duyệt = CHƯA lồng tiếng.');
  md.push('');
  md.push('| Thời điểm | 中文 (gốc) | Tiếng Việt (đã biên tập) |');
  md.push('|---|---|---|');
  for (const s of result.segments) {
    const zh = s.zh.replace(/\|/g, '/');
    const vi = s.vi.replace(/\|/g, '/');
    md.push(`| ${tc(s.start)}–${tc(s.end)} | ${zh} | ${vi} |`);
  }
  md.push('');
  const mdPath = join(dir, `${clip.clipId}_translation_vi.md`);
  writeFileSync(mdPath, md.join('\n'));

  console.log('------------------------------------------------------');
  console.log(`[04] ✅ Bản dịch ${clip.clipId} đã xuất:`);
  console.log(`     JSON  : ${jsonPath}`);
  console.log(`     REVIEW: ${mdPath}`);
  console.log('');
  console.log('     ⛔ DỪNG Ở CỔNG DUYỆT BẢN DỊCH — chưa lồng tiếng.');
  console.log('     Operator xem .md, sửa field "vi" trong .json nếu cần, rồi duyệt bước 05.');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
