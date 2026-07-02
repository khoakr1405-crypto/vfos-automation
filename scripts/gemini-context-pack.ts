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
 *   pnpm gemini:pack -- --merge         # thêm AISTUDIO_MERGED.md (dán 1 phát vào Google AI Studio)
 *   pnpm gemini:pack -- --out <dir>     # đổi thư mục output
 */

import { execFileSync } from 'node:child_process';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
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

const PERSONA = `# VFOS REVIEWER & STRATEGIST — SYSTEM INSTRUCTIONS

Bạn là cố vấn kỹ thuật + sản phẩm cấp cao cho dự án VFOS. Việc của bạn: **HIỂU sâu → REVIEW → ĐÁNH GIÁ tình trạng thật → CHỈ RA hướng định hình & phát triển tốt nhất.** Bạn KHÔNG phải người gác luật.

## 0. KHÔNG LÀM (quan trọng nhất)
- **KHÔNG** mở đầu bằng việc liệt kê/tuyên bố "tôi đã hiểu North Star / 9 No-Go / Guardian / trạng thái Phần...". Operator KHÔNG cần nghe tụng luật hay tóm tắt lại tài liệu. Đi thẳng vào đánh giá.
- **KHÔNG** ngồi chờ lệnh /goal một cách thụ động. Chủ động đánh giá và đề xuất hướng.
- **KHÔNG** khen suông, không nói vòng. Thẳng, ngắn, chỉ ra chỗ dở/rối trước.

## 1. VFOS là gì (để BẠN hiểu, KHÔNG để đọc lại cho Operator)
Hệ điều hành làm affiliate video cho thị trường VN: nguồn video (reup TQ/nước ngoài) hoặc tự tạo → localize tiếng Việt → đăng Facebook & TikTok → gắn link affiliate → ra doanh thu thật (đích 100–200tr/tháng, không phải cam kết).

## 2. VIỆC CHÍNH — 2 tầng
### Tầng A — Đánh giá TÌNH TRẠNG (health check)
Dự án đang **NGĂN NẮP hay LỘN XỘN**? Cho verdict rõ theo thang: **Ngăn nắp · Ổn nhưng có điểm rối · Lộn xộn** — kèm bằng chứng cụ thể. Soi:
- **Tổ chức code/monorepo** (apps/packages/scripts): mạch lạc hay chồng chéo; có vùng phình / god-file / bỏ hoang không (xem mục "TÍN HIỆU NGĂN NẮP" trong knowledge #5).
- **Docs & trạng thái**: spec có khớp thực tế không; có mâu thuẫn / lỗi thời không.
- **Mạch lạc workflow/lane**: luồng nguồn → localize → đăng → affiliate có liền mạch hay đứt gãy.
- **Nợ kỹ thuật & việc làm dở / trùng lặp / nửa vời.**
### Tầng B — Tìm HƯỚNG (định hình & phát triển)
Sau đánh giá, đề xuất **phương án phát triển tốt nhất** tiến tới affiliate-video ra tiền: lộ trình có ưu tiên (làm trước/sau), đánh đổi rõ, và **cái gì nên dừng / dọn**.

## 3. RÀNG BUỘC NGẦM (áp dụng IM LẶNG — chỉ nhắc khi cần)
North Star (affiliate video VN, FB/TikTok, ra tiền thật), 9 No-Go, 3 Guardian (Workflow Integrity, Product Review, Publish Safety) là bộ lọc bạn dùng NGẦM. Chỉ nêu đích danh MỘT luật khi một hiện trạng/đề xuất CỤ THỂ chạm vào nó (vd "cái này vướng No-Go #3: auto-publish"), nêu ngắn rồi thôi — TUYỆT ĐỐI không tụng cả bộ.

## 4. GROUNDED — không bịa
- Chỉ dựa trên tài liệu được nạp. Số liệu / commit / tên file / kết quả test phải có trong tài liệu; không có thì nói "tài liệu chưa đề cập", đừng chế. Dẫn nguồn ngắn khi nêu sự thật cụ thể.
- **Giới hạn dữ liệu:** bạn có **docs + digest kiến trúc (danh sách file + tín hiệu, KHÔNG phải full source)** → đánh giá tốt tổ chức/kiến trúc/chiến lược. Muốn soi **chất lượng code dòng-lệnh** (trùng lặp, dead code) thì cần Operator nạp thêm **slice source** (mục CODE SLICE). Khi chưa có, nói rõ "cần xem source vùng X" thay vì đoán.

## 5. GIỌNG & ĐỊNH DẠNG
Tiếng Việt, technical term giữ tiếng Anh. Thẳng, súc tích, KHÔNG preamble. Với đánh giá lớn trình theo:
**① Tình trạng (ngăn nắp/lộn xộn + vì sao) · ② Chỗ rối / nợ / mâu thuẫn · ③ Hướng đề xuất (ưu tiên, có thứ tự) · ④ Rủi ro / việc nên dừng.**
Nếu Operator hỏi 1 điểm cụ thể thì trả gọn đúng điểm đó, không nhồi cả 4 mục.
`;

function git(args: string[]): string {
  return execFileSync('git', args, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 128 * 1024 * 1024,
  });
}

/** Đếm số dòng (tracked-only) chứa marker; git grep exit 1 khi không match → trả 0. */
function gitGrepLines(pattern: string): number {
  try {
    return git(['grep', '-I', '-E', pattern]).split('\n').filter(Boolean).length;
  } catch {
    return 0;
  }
}

function parseArgs(argv: string[]): { codePath?: string; outDir: string; mergeAll: boolean } {
  let codePath: string | undefined;
  let outDir = join(REPO_ROOT, 'data', 'gemini-pack');
  let mergeAll = false;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--code') codePath = argv[++i];
    else if (argv[i] === '--out') outDir = resolve(argv[++i] ?? outDir);
    else if (argv[i] === '--merge') mergeAll = true;
  }
  return { codePath, outDir, mergeAll };
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

  // TÍN HIỆU NGĂN NẮP — số liệu khách quan (tracked-only, stat lấy byte không đọc nội dung).
  const sized = await Promise.all(
    code.map(async (p) => ({
      p,
      kb: Math.round(((await stat(join(REPO_ROOT, p))).size / 1024) * 10) / 10,
    })),
  );
  sized.sort((a, b) => b.kb - a.kb);
  const biggest = sized
    .slice(0, 15)
    .map((f) => `| \`${f.p}\` | ${f.kb} |`)
    .join('\n');
  const godFiles = sized.filter((f) => f.kb > 30).length;
  const todo = gitGrepLines('TODO');
  const fixme = gitGrepLines('FIXME');
  const hack = gitGrepLines('HACK|XXX');

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

## TÍN HIỆU NGĂN NẮP (số liệu khách quan để đánh giá messy/tidy)
- **God-file candidates (>30KB):** ${godFiles} file — file càng to càng dễ là "god-file" khó bảo trì.
- **Script trong scripts/:** ${counts.get('scripts') ?? 0} — quá nhiều CLI rời rạc → coi chừng sprawl / trùng chức năng.
- **Nợ kỹ thuật (số dòng chứa marker, tracked-only):** TODO=${todo} · FIXME=${fixme} · HACK/XXX=${hack}.

### Top 15 file lớn nhất (byte → soi god-file)
| File | KB |
|---|---|
${biggest}

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

## Đánh giá tổng thể (Google AI Studio)
Gem dùng RAG nên yếu khi hỏi "tổng thể" (kéo không đủ 5 file). Muốn model thấy 100% nội dung 1 lần:
\`pnpm gemini:pack -- --merge\` → sinh \`AISTUDIO_MERGED.md\`. Vào aistudio.google.com, dán cả file vào
chat đầu (hoặc tách persona → System instructions), chọn **Pro + tư duy cao**. Dùng cho phiên khám sâu định kỳ.
Câu hỏi mở đầu gợi ý nằm ngay đầu file \`AISTUDIO_MERGED.md\` (mục "GỢI Ý CÂU HỎI MỞ ĐẦU").

## Lưu ý
- Đây là file dẫn xuất trong \`data/gemini-pack/\` (đã .gitignore) — KHÔNG commit.
- \`00_...PERSONA\` dán vào **Instructions**, KHÔNG upload làm knowledge (để dành slot).
`;
}

/** Gộp persona + toàn bộ knowledge thành 1 file full-context cho Google AI Studio. */
function buildMerged(snap: string, persona: string, parts: string[]): string {
  return `<!-- ${snap} -->
# VFOS — BẢN GỘP FULL-CONTEXT CHO GOOGLE AI STUDIO

> **Cách dùng (aistudio.google.com):**
> - **Cách A (khuyên):** copy khối "PERSONA / SYSTEM INSTRUCTIONS" → dán vào ô **System instructions**; copy khối "KIẾN THỨC #1–#5" → dán làm tin nhắn đầu.
> - **Cách B (nhanh, 1 phát):** dán TOÀN BỘ file này vào ô chat đầu tiên — model vẫn thấy 100% nội dung.
> - Model nên chọn: **Pro + mức tư duy cao**. Đây là **snapshot** — repo đổi thì chạy lại \`pnpm gemini:pack -- --merge\`.

## GỢI Ý CÂU HỎI MỞ ĐẦU (dán sau khi nạp context)
1. \`Dự án VFOS hiện đang NGĂN NẮP hay LỘN XỘN? Cho verdict + 3-5 bằng chứng cụ thể (trích nguồn). Đừng tụng luật, đi thẳng vào đánh giá.\`
2. \`Review tổng thể VFOS rồi đề xuất HƯỚNG phát triển tốt nhất tiến tới affiliate video ra tiền: ① tình trạng ② chỗ rối/nợ ③ lộ trình ưu tiên ④ việc nên dừng.\`
3. \`(sau khi nạp CODE SLICE 1 vùng) Soi code vùng này: có lộn xộn/trùng lặp/dead code không? Đề xuất dọn, trích file cụ thể.\`

${SEP}
== PERSONA / SYSTEM INSTRUCTIONS ==
${SEP}

${persona}

${SEP}
== KIẾN THỨC #1–#5 (TOÀN BỘ) ==
${SEP}
${parts.join('\n\n')}
`;
}

async function main(): Promise<void> {
  const { codePath, outDir, mergeAll } = parseArgs(process.argv.slice(2));
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']).trim();
  const head = git(['rev-parse', '--short', 'HEAD']).trim();
  const snap = `Snapshot: branch ${branch} · HEAD ${head} · ${new Date().toISOString()}`;

  await mkdir(outDir, { recursive: true });
  console.log(`\nVFOS → Gemini context pack\n${snap}\nOutput: ${outDir}\n`);

  const written: { name: string; kb: number; upload: string }[] = [];
  const mergeParts: string[] = [];
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
    const body = `${fileHeader(g.title, g.upload, snap)}${intro}\n${sources}`;
    await emit(g.outFile, body, g.upload);
    mergeParts.push(body);
  }

  // 05 code digest.
  console.log('• 05_CODE_ARCHITECTURE_DIGEST.md');
  const digest = await buildCodeDigest(snap);
  await emit('05_CODE_ARCHITECTURE_DIGEST.md', digest, 'Knowledge file #5');
  mergeParts.push(digest);

  // 06 code slice (tùy chọn).
  if (codePath) {
    console.log(`• 06 code slice: ${codePath}`);
    const slice = await buildCodeSlice(codePath, snap);
    await emit(slice.name, slice.body, 'Knowledge (slice)');
  }

  // Bản gộp full-context cho Google AI Studio (tùy chọn).
  if (mergeAll) {
    console.log('• AISTUDIO_MERGED.md');
    await emit('AISTUDIO_MERGED.md', buildMerged(snap, PERSONA, mergeParts), '→ AI Studio (dán 1 phát)');
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
  const merged = written.find((w) => w.name === 'AISTUDIO_MERGED.md');
  if (merged) {
    const mtok = Math.round((merged.kb * 1024) / 4 / 1000);
    console.log(
      `AI Studio: AISTUDIO_MERGED.md = ${merged.kb} KB · ~${mtok}K token (trùng nội dung 00-05, ĐỪNG cộng dồn vào Tổng).`,
    );
  }
  console.log(`\n➡  Đọc ${join(outDir, 'README_SETUP.md')} để dựng Gem (4 bước).\n`);
}

main().catch((err: unknown) => {
  console.error('gemini-context-pack FAILED:', err);
  process.exit(1);
});
