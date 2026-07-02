/**
 * gemini-context-pack.ts — VFOS knowledge packer for Google AI (Gemini) Gems.
 *
 * Gom các doc "nguồn sự thật" của VFOS thành ≤ 7 file gọn để nạp vào 1 Gem
 * "VFOS Evaluator" (tối đa 10 knowledge file / Gem). Chỉ đọc file đã tracked
 * qua `git ls-files` ⇒ secrets/runtime/media (.env, .secrets/, data/, ...) KHÔNG
 * thể lọt. Output vào data/gemini-pack/ (đã gitignored) — không commit artifact.
 *
 * Dùng:
 *   pnpm gemini:pack                    # sinh README + 00..05
 *   pnpm gemini:pack -- --code apps/studio/src/lib   # thêm 06_CODE_SLICE (full source 1 vùng)
 *   pnpm gemini:pack -- --out <dir>     # đổi thư mục output
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SEP = '='.repeat(74);

interface PackGroup {
  outFile: string;
  title: string;
  upload: string; // hướng dẫn nạp vào đâu
  intro: string;
  sources: string[]; // path tương đối repo root
}

/** Allowlist docs tường minh — KHÔNG glob toàn repo. */
const GROUPS: PackGroup[] = [
  {
    outFile: '01_NORTH_STAR_STRATEGY.md',
    title: 'VFOS — North Star, Chiến lược & Luật nền',
    upload: 'Knowledge file #1',
    intro:
      'Nền tảng bắt buộc: sứ mệnh, đích thương mại, mô hình content-led, luật ràng buộc workflow, và bộ luật No-Go (CLAUDE.md). Mọi đánh giá phải soi qua đây trước tiên.',
    sources: [
      'docs/VFOS_NORTH_STAR.md',
      'docs/00_DIEU_HANH/VFOS_NORTH_STAR.md',
      'docs/VFOS_CONTENT_LED_AFFILIATE_STRATEGY.md',
      'docs/VFOS_WORKFLOW_INTEGRITY_STANDARD.md',
      'CLAUDE.md',
    ],
  },
  {
    outFile: '02_ARCHITECTURE_STANDARDS.md',
    title: 'VFOS — Chuẩn kiến trúc & Guardian',
    upload: 'Knowledge file #2',
    intro:
      'Chuẩn kiến trúc UI/workflow: Sidebar Guardian, Information Architecture (Affiliate Video OS), UI Architecture, UI Integration Guardrail, và ranh giới agent.',
    sources: [
      'docs/00_DIEU_HANH/VFOS_SIDEBAR_GUARDIAN_STANDARD.md',
      'docs/00_DIEU_HANH/VFOS_STUDIO_IA_AFFILIATE_VIDEO_OS_V1.md',
      'docs/00_DIEU_HANH/VFOS_UI_ARCHITECTURE_V1.md',
      'docs/00_DIEU_HANH/VFOS_UI_INTEGRATION_GUARDRAIL_V1.md',
      'docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md',
    ],
  },
  {
    outFile: '03_CURRENT_STATE.md',
    title: 'VFOS — Trạng thái hiện tại (nhật ký vận hành)',
    upload: 'Knowledge file #3',
    intro:
      'Nhật ký theo từng Phần/Round + commit hash, KHÔNG hoàn toàn theo thứ tự thời gian (cuối file có thể là ghi chú/appendix cũ). Trạng thái hiện tại = mục có SỐ Phần/Round LỚN NHẤT.',
    sources: ['docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md'],
  },
  {
    outFile: '04_LANE_PRODUCTION_SPECS.md',
    title: 'VFOS — Spec sản xuất theo lane',
    upload: 'Knowledge file #4',
    intro:
      'Blueprint sản xuất: lane Giải trí (Entertainment), chuẩn caption, storytelling layer, factory blueprint nhân bản lane, và master plan UI.',
    sources: [
      'docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_LANE_SPEC.md',
      'docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_CAPTION_STYLE_V1.md',
      'docs/00_DIEU_HANH/VFOS_ENTERTAINMENT_STORYTELLING_CONTENT_LAYER_V1.md',
      'docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md',
      'docs/00_DIEU_HANH/VFOS_STUDIO_UI_MASTER_PLAN.md',
    ],
  },
];

const PERSONA = `# VFOS EVALUATOR — SYSTEM INSTRUCTIONS (dán vào ô "Instructions" của Gem)

Bạn là **VFOS Evaluator** — chuyên gia phản biện CHIẾN LƯỢC + KỸ THUẬT cho dự án VFOS của Operator. Bạn KHÔNG phải trợ lý AI-automation chung chung; đừng bao giờ trôi về tư vấn nền tảng generic.

## 0. VFOS là gì (phải thuộc)
VFOS = **Affiliate Video Operating System** cho thị trường Việt Nam. Chuỗi giá trị: tìm/nguồn video (reup TQ & nước ngoài) hoặc tự tạo → chọn → edit/transform/localize sang tiếng Việt → đăng **Facebook & TikTok** → gắn **link affiliate** (Shopee...) → học hiệu suất → ra doanh thu thật. Đích thương mại (North Star, KHÔNG phải cam kết): **100–200 triệu VND/tháng** từ affiliate video FB/TikTok VN.

## 1. PRIME DIRECTIVE
Mọi nhận định/đề xuất PHẢI soi qua 3 lăng kính, đúng thứ tự:
1. **North Star** — có đưa VFOS gần hơn tới: nguồn → chọn → reup/edit/localize → đăng FB/TikTok affiliate → học hiệu suất → ra tiền thật ở VN? Quan hệ mờ nhạt → HẠ ưu tiên, nói thẳng.
2. **3 Guardian** — Workflow Integrity, Product Review, Publish Safety (chi tiết ở knowledge file #2).
3. **9 No-Go rules** — trong CLAUDE.md (knowledge file #1). Đề xuất nào chạm No-Go → **CỜ ĐỎ**, nêu rõ chạm điều mấy.

## 2. CỜ ĐỎ tự động (bác bỏ hoặc cảnh báo mạnh)
- Biến VFOS thành nền tảng AI-automation generic, tách rời affiliate-video monetization.
- Ưu tiên infra / dashboard / abstraction / refactor mà không chứng minh phục vụ North Star.
- Bypass Product Binding / Production Gate; auto-publish khi Operator chưa duyệt; bypass login/CAPTCHA/OTP; dùng fallback/demo để approve nguồn sạch hoặc publish; lấy \`latest\`/\`jobs[0]\`/floating state làm source of truth.
- Đề xuất commit runtime / secrets / media / session / cookie.

## 3. CHỐNG BỊA (bắt buộc)
- CHỈ kết luận dựa trên nội dung knowledge file được nạp. KHÔNG bịa số liệu, commit hash, tên file, kết quả test, hay tính năng không có trong tài liệu.
- Thiếu dữ kiện → nói rõ "không đủ dữ kiện trong tài liệu", đừng đoán.
- Khi dẫn chứng, ghi nguồn: tên doc + mục (vd "theo VFOS_NORTH_STAR, phần Milestones").

## 4. ĐỊNH DẠNG TRẢ LỜI
- Tiếng Việt, giữ technical term tiếng Anh. Thẳng, không nịnh.
- Với mọi đánh giá lớn, trả theo 4 khối:
  **① Điểm mạnh · ② Rủi ro / Cờ đỏ · ③ Gap (thiếu gì) · ④ Khuyến nghị ưu tiên (bám North Star, có thứ tự)**.
- Operator đề xuất lệch North Star → phản biện, đừng gật theo.

## 5. BỘ LỌC QUYẾT ĐỊNH (chạy trước mỗi khuyến nghị)
"Việc này có đưa VFOS gần hơn tới việc tạo/biến reup thành affiliate content cho thị trường VN trên FB/TikTok, tăng khả năng có view và ra doanh thu thật không?" — nếu không rõ, đừng ưu tiên.

## 6. BẢN ĐỒ KNOWLEDGE FILE
- **#1 North Star & Chiến lược** — sứ mệnh, mô hình, luật nền (CLAUDE.md, 9 No-Go).
- **#2 Chuẩn kiến trúc** — Guardian, IA, UI, agent boundary.
- **#3 Trạng thái hiện tại** — nhật ký; MỚI NHẤT ở CUỐI file.
- **#4 Spec sản xuất** — theo từng lane.
- **#5 Code architecture digest** — cấu trúc monorepo + inventory (KHÔNG phải full source; muốn soi dòng-lệnh, Operator dùng Gemini Code Assist hoặc nạp file 06_CODE_SLICE).
`;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

function parseArgs(argv: string[]): { codePath?: string; outDir: string } {
  let codePath: string | undefined;
  let outDir = join(REPO_ROOT, 'data', 'gemini-pack');
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--code') codePath = argv[++i];
    else if (argv[i] === '--out') outDir = resolve(argv[++i] ?? outDir);
  }
  return { codePath, outDir };
}

function fileHeader(title: string, upload: string, snap: string): string {
  return `<!-- ${snap} -->
> **Nạp vào:** ${upload}
> _File dẫn xuất do scripts/gemini-context-pack.ts sinh — đừng sửa tay, chạy lại script khi repo đổi._

# ${title}

`;
}

/** Tự phát hiện mục "Phần N"/"Round N" lớn nhất để chỉ Gemini tới trạng thái mới nhất. */
function detectLatestSection(body: string): string | null {
  const nums = [...body.matchAll(/(?:Phần|Round)\s+(\d+)/g)].map((m) => Number(m[1]));
  if (!nums.length) return null;
  return `Phần ${Math.max(...nums)}`;
}

async function readSource(rel: string): Promise<string> {
  try {
    const body = await readFile(join(REPO_ROOT, rel), 'utf8');
    return `\n\n${SEP}\n== NGUỒN: ${rel}\n${SEP}\n\n${body.trimEnd()}\n`;
  } catch {
    console.warn(`  ⚠️  bỏ qua (không đọc được): ${rel}`);
    return `\n\n${SEP}\n== NGUỒN: ${rel}  [MISSING — không đọc được lúc sinh pack]\n${SEP}\n`;
  }
}

const TOP_AREAS = ['apps', 'packages', 'plugins', 'scripts', 'config', 'tests', 'tools'] as const;

function topSegment(p: string): string {
  const seg = p.split('/')[0];
  return (TOP_AREAS as readonly string[]).includes(seg) ? seg : '(root)';
}

async function buildCodeDigest(snap: string): Promise<string> {
  const tracked = git(['ls-files']).split('\n').filter(Boolean);
  const code = tracked.filter(
    (p) =>
      (TOP_AREAS as readonly string[]).includes(topSegment(p)) ||
      /^[^/]+\.(json|ts|js|mjs|cjs|yaml|yml)$/.test(p),
  );

  // Đếm theo top-level.
  const counts = new Map<string, number>();
  for (const p of code) counts.set(topSegment(p), (counts.get(topSegment(p)) ?? 0) + 1);
  const countTable = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| \`${k}\` | ${v} |`)
    .join('\n');

  // Manifest các sub-package (apps/*, packages/*, plugins/*).
  const pkgPaths = tracked.filter((p) => /^(apps|packages|plugins)\/[^/]+\/package\.json$/.test(p));
  const pkgBlocks: string[] = [];
  for (const pp of pkgPaths.sort()) {
    try {
      const raw = JSON.parse(await readFile(join(REPO_ROOT, pp), 'utf8')) as {
        name?: string;
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
      };
      const deps = Object.keys(raw.dependencies ?? {});
      const scripts = Object.keys(raw.scripts ?? {});
      pkgBlocks.push(
        `### \`${pp}\`\n- **name:** ${raw.name ?? '(n/a)'}\n- **scripts:** ${
          scripts.length ? scripts.join(', ') : '—'
        }\n- **deps:** ${deps.length ? deps.join(', ') : '—'}`,
      );
    } catch {
      pkgBlocks.push(`### \`${pp}\`\n- (không parse được)`);
    }
  }

  // Cây file tracked theo top-level.
  const treeBlocks: string[] = [];
  for (const area of [...TOP_AREAS, '(root)']) {
    const files = code.filter((p) => topSegment(p) === area).sort();
    if (!files.length) continue;
    treeBlocks.push(`### ${area} (${files.length} file)\n\`\`\`\n${files.join('\n')}\n\`\`\``);
  }

  const rootScripts = JSON.parse(await readFile(join(REPO_ROOT, 'package.json'), 'utf8')) as {
    scripts?: Record<string, string>;
  };
  const rootScriptLines = Object.entries(rootScripts.scripts ?? {})
    .map(([k, v]) => `- \`${k}\` → \`${v}\``)
    .join('\n');

  return `<!-- ${snap} -->
> **Nạp vào:** Knowledge file #5
> _Digest kiến trúc code (path-only inventory, KHÔNG phải full source). Chỉ liệt kê file đã tracked qua \`git ls-files\` — secrets/runtime/media không có ở đây._

# VFOS — Code Architecture Digest

## Stack
pnpm monorepo (ESM, Node ≥20, TypeScript strict). Frontend Next.js (apps/studio :3002, apps/cockpit :3001); backend Fastify (apps/kernel). Tooling: tsx, Biome, Playwright. Tích hợp: Anthropic/OpenAI SDK, ffmpeg, edge-tts/ElevenLabs, Demucs, PaddleOCR. Pipeline vận hành = ~90 CLI script trong scripts/.

## Tổng lượng file tracked theo vùng
| Vùng | Số file |
|---|---|
${countTable}

## Command surface (root package.json scripts)
${rootScriptLines}

## Sub-package manifests
${pkgBlocks.join('\n\n')}

## Inventory (path đầy đủ, đã tracked)
${treeBlocks.join('\n\n')}
`;
}

const TEXT_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|css|scss|md|txt|yml|yaml|html|sql)$/i;

async function buildCodeSlice(
  codePath: string,
  snap: string,
): Promise<{ name: string; body: string }> {
  const files = git(['ls-files', codePath]).split('\n').filter(Boolean);
  const textFiles = files.filter((p) => TEXT_EXT.test(p));
  const skipped = files.length - textFiles.length;
  const parts: string[] = [];
  for (const f of textFiles.sort()) {
    const body = await readFile(join(REPO_ROOT, f), 'utf8');
    parts.push(`\n\n${SEP}\n== FILE: ${f}\n${SEP}\n\n${body.trimEnd()}\n`);
  }
  const safeName = codePath.replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '');
  const header = `<!-- ${snap} -->
> **Nạp vào:** Knowledge file (slice code theo yêu cầu) — hoặc dán vào Google AI Studio để soi sâu.
> _Full source của \`${codePath}\` (${textFiles.length} file text${
    skipped ? `, bỏ ${skipped} file binary/non-text` : ''
  }). Chỉ file đã tracked._

# VFOS — Code Slice: \`${codePath}\`
`;
  return { name: `06_CODE_SLICE_${safeName}.md`, body: header + parts.join('') };
}

function readme(snap: string, files: { name: string; kb: number }[]): string {
  const list = files.map((f) => `- \`${f.name}\` — ${f.kb} KB`).join('\n');
  return `# HƯỚNG DẪN NẠP VFOS VÀO GEMINI (Gem "VFOS Evaluator")

${snap}

## Các file trong pack này
${list}

## 4 bước dựng Gem (làm 1 lần)
1. Mở **gemini.google.com** → menu trái → **Gem** → **New Gem** (Tạo Gem mới).
2. Copy TOÀN BỘ nội dung \`00_VFOS_EVALUATOR_PERSONA.md\` → dán vào ô **Instructions**.
3. Ở phần **Knowledge**, **Upload 5 file**: \`01\`, \`02\`, \`03\`, \`04\`, \`05\`.
   (Gem cho tối đa 10 knowledge file — mình dùng 5, còn dư.)
4. Đặt tên Gem = **"VFOS Evaluator"** → **Save**. Xong: mở Gem này chat là Gemini đã "thuộc bài" VFOS.

## Khi repo thay đổi
Chạy lại: \`pnpm gemini:pack\` → re-upload các file knowledge đã đổi (thường là \`03_CURRENT_STATE.md\`).

## Muốn Gemini review CODE thật (dòng-lệnh)
- Cách bền: cài **Gemini Code Assist** (extension VS Code) trỏ thẳng repo — không cần bundle.
- Cách nhanh cho 1 vùng: \`pnpm gemini:pack -- --code apps/studio/src/lib\` → sinh \`06_CODE_SLICE_*.md\`, nạp vào Gem hoặc dán Google AI Studio.

## Lưu ý
- Đây là file dẫn xuất trong \`data/gemini-pack/\` (đã .gitignore) — KHÔNG commit.
- \`00_...PERSONA\` dán vào **Instructions**, KHÔNG upload làm knowledge (để dành slot).
`;
}

async function main(): Promise<void> {
  const { codePath, outDir } = parseArgs(process.argv.slice(2));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const head = git(['rev-parse', '--short', 'HEAD']).trim();
  const snap = `Snapshot: branch ${branch} · HEAD ${head} · ${new Date().toISOString()}`;

  await mkdir(outDir, { recursive: true });
  console.log(`\nVFOS → Gemini context pack\n${snap}\nOutput: ${outDir}\n`);

  const written: { name: string; kb: number; upload: string }[] = [];
  const emit = async (name: string, body: string, upload: string) => {
    await writeFile(join(outDir, name), body, 'utf8');
    written.push({
      name,
      kb: Math.round((Buffer.byteLength(body, 'utf8') / 1024) * 10) / 10,
      upload,
    });
  };

  // 00 persona.
  await emit('00_VFOS_EVALUATOR_PERSONA.md', `<!-- ${snap} -->\n${PERSONA}`, '→ ô Instructions');

  // 01..04 doc groups.
  for (const g of GROUPS) {
    console.log(`• ${g.outFile}`);
    let sources = '';
    for (const src of g.sources) sources += await readSource(src);
    let intro = g.intro;
    if (g.outFile.startsWith('03_')) {
      const latest = detectLatestSection(sources);
      if (latest) {
        intro += `\n\n> **Trạng thái MỚI NHẤT (tự phát hiện lúc sinh pack): mục lớn nhất = \`${latest}\`.** Tìm chuỗi \`${latest}\` trong file để đọc trạng thái hiện tại; ĐỪNG chỉ đọc dòng cuối.`;
      }
    }
    await emit(g.outFile, `${fileHeader(g.title, g.upload, snap)}${intro}\n${sources}`, g.upload);
  }

  // 05 code digest.
  console.log('• 05_CODE_ARCHITECTURE_DIGEST.md');
  await emit('05_CODE_ARCHITECTURE_DIGEST.md', await buildCodeDigest(snap), 'Knowledge file #5');

  // 06 code slice (tùy chọn).
  if (codePath) {
    console.log(`• 06 code slice: ${codePath}`);
    const slice = await buildCodeSlice(codePath, snap);
    await emit(slice.name, slice.body, 'Knowledge (slice)');
  }

  // README cuối (không upload).
  await emit(
    'README_SETUP.md',
    readme(
      snap,
      written.map((w) => ({ name: w.name, kb: w.kb })),
    ),
    '— (hướng dẫn cho người)',
  );

  // Summary.
  const totalKb = Math.round(written.reduce((s, w) => s + w.kb, 0) * 10) / 10;
  const est = Math.round((totalKb * 1024) / 4 / 1000);
  console.log(`\n${'-'.repeat(56)}`);
  console.log(`${'FILE'.padEnd(38)}${'KB'.padStart(8)}  NẠP VÀO`);
  for (const w of written)
    console.log(`${w.name.padEnd(38)}${String(w.kb).padStart(8)}  ${w.upload}`);
  console.log('-'.repeat(56));
  console.log(`Tổng: ${written.length} file · ${totalKb} KB · ~${est}K token ước lượng`);
  const knowledge = written.filter((w) => w.upload.startsWith('Knowledge'));
  console.log(`Knowledge file để upload: ${knowledge.length} (giới hạn Gem = 10) ✓`);
  for (const w of written) {
    if (w.kb > 1500)
      console.log(
        `  ⚠️  ${w.name} = ${w.kb} KB (lớn — vẫn OK với Gemini, để ý nếu dùng NotebookLM 500K từ/nguồn).`,
      );
  }
  console.log(`\n➡  Đọc ${join(outDir, 'README_SETUP.md')} để dựng Gem (4 bước).\n`);
}

main().catch((err: unknown) => {
  console.error('gemini-context-pack FAILED:', err);
  process.exit(1);
});
