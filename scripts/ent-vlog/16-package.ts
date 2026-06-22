// E1 step 16 — PACKAGE for manual posting (B8). Turns the APPROVED preview into
// a ready-to-post kit: final mp4 + caption (gpt-5.5, fallback template) +
// hashtags + a manual-posting checklist. NO auto-publish, no TikTok API, no
// affiliate link (kênh đang xây). Isolation: data/temp/ent only, no registry.
//   pnpm tsx scripts/ent-vlog/16-package.ts --id ent_squid_001 [--model gpt-5.5]
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { loadEnv, workDir } from './lib/env.js';
import { chatJson } from './lib/openai.js';

const FALLBACK_HASHTAGS = [
  '#cauca',
  '#caumuc',
  '#biendong',
  '#vlogcauca',
  '#giaitri',
  '#reupvietnam',
  '#xuhuong',
  '#fyp',
  '#viral',
  '#cauca_vietnam',
];
const FALLBACK_CAPTION = 'Ra biển câu mực, lên hàng là mê luôn 🎣';

const CAPTION_SYS = `Bạn viết CAPTION TikTok tiếng Việt cho video vlog câu mực/cá (reup, giải trí cho người Việt).
Giọng trẻ, vui, tò mò; KHÔNG phóng đại, KHÔNG hứa hẹn sai sự thật, KHÔNG khẳng định quá lời.
1 caption ngắn (≤ 140 ký tự), có hook đầu câu + tối đa 1 emoji nhẹ.
Kèm 8-12 hashtag tiếng Việt liên quan (câu cá/mực, biển, giải trí, xu hướng). Không hashtag tục.
Trả JSON: {"caption":"<1 dòng>","hashtags":["#...","#..."]}.`;

interface Beat {
  role: string;
  text: string;
}

async function buildCaption(
  beats: Beat[],
  model: string,
): Promise<{ caption: string; hashtags: string[]; source: 'gpt' | 'fallback' }> {
  loadEnv();
  const apiKey = process.env.OPENAI_API_KEY;
  const script = beats
    .map((b) => b.text)
    .filter(Boolean)
    .join(' ');
  if (!apiKey || script.length < 5) {
    return { caption: FALLBACK_CAPTION, hashtags: FALLBACK_HASHTAGS, source: 'fallback' };
  }
  try {
    const out = await chatJson<{ caption?: string; hashtags?: string[] }>(apiKey, {
      model,
      system: CAPTION_SYS,
      user: `Lời thuyết minh Việt của video (để hiểu nội dung):\n${script}`,
      temperature: 0.8,
    });
    const caption = (out.caption ?? '').trim();
    const hashtags = (out.hashtags ?? [])
      .map((h) => h.trim())
      .filter((h) => h.startsWith('#') && h.length > 1)
      .slice(0, 12);
    if (!caption || hashtags.length < 4) {
      return {
        caption: caption || FALLBACK_CAPTION,
        hashtags: hashtags.length >= 4 ? hashtags : FALLBACK_HASHTAGS,
        source: 'fallback',
      };
    }
    return { caption, hashtags, source: 'gpt' };
  } catch (e) {
    console.error(
      `⚠️ caption gpt lỗi → dùng fallback: ${e instanceof Error ? e.message : String(e)}`,
    );
    return { caption: FALLBACK_CAPTION, hashtags: FALLBACK_HASHTAGS, source: 'fallback' };
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: { id: { type: 'string' }, model: { type: 'string' } },
    strict: true,
  });
  const id = values.id;
  if (!id) {
    console.error('Usage: --id <slug> [--model gpt-5.5]');
    process.exit(1);
  }
  const model = values.model ?? 'gpt-5.5';
  const dir = workDir(id);
  const clipDir = join(dir, 'montage_v2');

  // E-UI-5 LOCK: CHỈ đóng gói bản ambient (audio policy đã áp THẬT). KHÔNG fallback
  // bản VO-only/short — không bao giờ gói bản chưa bỏ giọng Trung.
  const ambient = join(dir, 'montage_v2_short_ambient.mp4');
  if (!existsSync(ambient)) {
    console.error(
      '🛑 NO_AMBIENT — chưa có montage_v2_short_ambient.mp4 (audio policy chưa áp). Render lại trước khi đóng gói.',
    );
    process.exit(2);
  }
  const finalAbs = ambient;
  const finalRel = `data/temp/ent/${id}/montage_v2_short_ambient.mp4`;
  const audioApplied = true;

  const scriptJson = existsSync(join(clipDir, 'montage_v2_script.json'))
    ? (JSON.parse(readFileSync(join(clipDir, 'montage_v2_script.json'), 'utf8')) as {
        beats?: Beat[];
      })
    : { beats: [] };
  const beats = scriptJson.beats ?? [];

  console.log(`[16] Viết caption (${model}) + hashtag…`);
  const { caption, hashtags, source } = await buildCaption(beats, model);

  const postingNotes = [
    `Tải/đăng file: ${finalRel}`,
    'Đăng TAY trên TikTok — hệ thống KHÔNG tự đăng (chưa có TikTok API/duyệt).',
    'Dán caption + hashtag bên dưới (chỉnh lại nếu muốn).',
    'Khung giờ gợi ý: 11h–13h hoặc 19h–22h (giờ VN).',
    'Kiểm tra lại nội dung/bản quyền trước khi đăng.',
    'Affiliate link: CHƯA gắn (giai đoạn xây kênh) — thêm ở bước sau khi có view.',
  ];
  const pkg = {
    finalVideo: finalRel,
    audioPolicyApplied: audioApplied,
    caption,
    captionSource: source,
    hashtags,
    postingNotes,
    autoPublish: false,
    affiliate: 'none (channel-building phase)',
    generatedAt: new Date().toISOString(),
  };
  writeFileSync(join(clipDir, 'package.json'), JSON.stringify(pkg, null, 2));

  const md: string[] = [];
  md.push('# Package — hướng dẫn đăng TAY (KHÔNG auto-publish)');
  md.push('');
  md.push(
    `- Video: ${id} | file: ${finalRel} | audio policy ambient: ${audioApplied ? 'đã áp ✅' : 'CHƯA ⚠️'}`,
  );
  md.push(`- Caption (${source}):`);
  md.push('');
  md.push(`> ${caption}`);
  md.push('');
  md.push(`- Hashtag: ${hashtags.join(' ')}`);
  md.push('');
  md.push('## Checklist đăng tay');
  for (const n of postingNotes) md.push(`- [ ] ${n}`);
  writeFileSync(join(clipDir, 'package.md'), md.join('\n'));

  console.log('------------------------------------------------------');
  console.log(`[16] ✅ Đóng gói xong (caption: ${source}).`);
  console.log(`   FILE: ${finalRel}`);
  console.log(`   CAPTION: ${caption}`);
  console.log(`   HASHTAG: ${hashtags.join(' ')}`);
  console.log('   ⛔ Đăng TAY — không auto-publish, chưa gắn affiliate.');
  console.log('------------------------------------------------------');
}

main().catch((e) => {
  console.error(`🛑 ${e instanceof Error ? e.message : String(e)}`);
  process.exit(1);
});
