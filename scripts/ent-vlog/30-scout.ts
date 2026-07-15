// Trend Scout CLI — tự động hóa quy trình "10 phút/ngày" tìm video Douyin sắp viral.
// ---------------------------------------------------------------------------
//   pnpm ent:scout --niche fishing [--keywords-file config/scout/fishing.json]
//     [--max-videos 50] [--age-min 30] [--age-max 360] [--max-keywords N]
//     [--headful] [--dump-raw]
//
// READ-ONLY discovery: KHÔNG tạo job, KHÔNG tải video, KHÔNG render/publish.
// Promote ứng viên → intake là thao tác tường minh của Operator (409 guard chặn trùng).
// Ghi DUY NHẤT vào data/temp/ent/scout/ (gitignored):
//   <runId>.json + <runId>.md  — snapshot tường minh có timestamp (source of truth)
//   scout_run.json             — run-state cho UI poll (mirror steps/produce.json)
//   raw/<runId>/*.json         — chỉ khi --dump-raw (gặt fixture)
//
// CAPTCHA → KHÔNG bypass: ghi partial snapshot + exit 2 + chỉ dẫn ent:douyin-login;
// chạy lại sau khi giải = resume tự nhiên (snapshot mới).
// VẬN HÀNH: 1 công cụ Douyin tại một thời điểm (chung profile với ent:fetch).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseArgs } from 'node:util';
import { closeScoutSession, openScoutSession, searchDouyinKeyword } from './lib/douyin-search.js';
import { findWorkspaceRoot } from './lib/env.js';
import {
  type KeywordItem,
  type ScoutConfig,
  type ScoutProductGate,
  type ScoutSnapshot,
  type ScoutSubNiche,
  buildCandidates,
  renderReportMd,
  resolveComboKeywords,
} from './lib/scout-core.js';
import { collectJobbedAwemeIds } from './lib/scout-jobs-index.js';

const NICHE_RE = /^[a-z0-9-]+$/;
const TOP_N_REPORT = 20;

function ts(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function fail(message: string): never {
  console.error(`🛑 ${message}`);
  process.exit(1);
}

// --- Config ------------------------------------------------------------------

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function strList(v: unknown): string[] {
  return Array.isArray(v)
    ? v.filter((k): k is string => typeof k === 'string' && k.trim() !== '')
    : [];
}

function parseSubNiches(v: unknown, path: string): ScoutSubNiche[] {
  if (!Array.isArray(v)) return [];
  const out: ScoutSubNiche[] = [];
  for (const raw of v) {
    const s = raw as Partial<ScoutSubNiche>;
    if (typeof s?.id !== 'string' || !/^[a-z0-9-]+$/.test(s.id)) {
      fail(`Config ${path}: subNiche có id không hợp lệ (chỉ [a-z0-9-]).`);
    }
    const productTerms = strList(s.productTerms);
    if (productTerms.length === 0)
      fail(`Config ${path}: subNiche "${s.id}" không có productTerms.`);
    out.push({ id: s.id, label: typeof s.label === 'string' ? s.label : s.id, productTerms });
  }
  return out;
}

function parseProductGate(v: unknown, path: string): ScoutProductGate | null {
  if (v == null) return null;
  const g = v as Partial<ScoutProductGate>;
  const productEvidence = strList(g.productEvidence);
  const strongProductActions = strList(g.strongProductActions);
  const garbageMarkers = strList(g.garbageMarkers);
  if (productEvidence.length === 0) {
    fail(
      `Config ${path}: productGate.productEvidence rỗng — gate vô nghĩa, bỏ block hoặc điền term.`,
    );
  }
  return { productEvidence, strongProductActions, garbageMarkers };
}

function loadScoutConfig(path: string): ScoutConfig {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (e) {
    fail(`Không đọc được config scout ${path}: ${e instanceof Error ? e.message : String(e)}`);
  }
  const c = raw as Partial<ScoutConfig> & { keywords?: unknown };
  const keywords = strList(c.keywords);
  const formats = strList(c.formats);
  const subNiches = parseSubNiches(c.subNiches, path);
  const productGate = parseProductGate(c.productGate, path);
  // KHÓA keyword thả nổi: schema combo (subNiches) và keywords phẳng loại trừ lẫn nhau.
  // Query hợp lệ của schema combo LUÔN là [format] + [productTerm] — không có đường tắt.
  if (subNiches.length > 0) {
    if (keywords.length > 0) {
      fail(
        `Config ${path}: CONFIG_CONFLICT — có cả subNiches lẫn keywords phẳng. Schema combo cấm keyword định dạng thả nổi; xóa mảng "keywords".`,
      );
    }
    if (formats.length === 0) fail(`Config ${path}: có subNiches nhưng thiếu formats.`);
  } else if (keywords.length === 0) {
    fail(`Config ${path} không có keywords.`);
  }
  const t = c.thresholds;
  if (
    !t ||
    !isNum(t.ageMinMinutes) ||
    !isNum(t.ageMaxMinutes) ||
    !isNum(t.refLikesPerMinute) ||
    !isNum(t.floorLikesPerMinute) ||
    !isNum(t.commentRatioRef) ||
    !isNum(t.commentBoostMax)
  ) {
    fail(`Config ${path} thiếu/hỏng thresholds.`);
  }
  const s = c.search;
  if (
    !s ||
    !isNum(s.targetPerKeyword) ||
    !isNum(s.scrollBudgetMs) ||
    !isNum(s.keywordDelayMsMin) ||
    !isNum(s.keywordDelayMsMax)
  ) {
    fail(`Config ${path} thiếu/hỏng search settings.`);
  }
  if (typeof c.niche !== 'string' || !NICHE_RE.test(c.niche)) {
    fail(`Config ${path} có niche không hợp lệ (chỉ [a-z0-9-]).`);
  }
  return {
    niche: c.niche,
    label: typeof c.label === 'string' ? c.label : c.niche,
    ...(typeof c.channelId === 'string' ? { channelId: c.channelId } : {}),
    keywords,
    ...(formats.length > 0 ? { formats } : {}),
    ...(subNiches.length > 0 ? { subNiches } : {}),
    ...(productGate ? { productGate } : {}),
    thresholds: t,
    search: s,
  };
}

// --- Run-state (UI poll) -------------------------------------------------------

interface ScoutRunState {
  state: 'running' | 'done' | 'captcha' | 'failed';
  pid: number;
  runId: string;
  niche: string;
  startedAt: string;
  finishedAt?: string;
  snapshotPath?: string;
  exitCode?: number;
  message?: string;
}

function writeRunState(scoutDir: string, s: ScoutRunState): void {
  try {
    writeFileSync(join(scoutDir, 'scout_run.json'), JSON.stringify(s, null, 2));
  } catch {
    /* run-state chỉ phục vụ UI poll — lỗi ghi không chặn scout */
  }
}

// --- Main ----------------------------------------------------------------------

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      niche: { type: 'string' },
      'sub-niche': { type: 'string' },
      'keywords-file': { type: 'string' },
      'max-videos': { type: 'string' },
      'age-min': { type: 'string' },
      'age-max': { type: 'string' },
      'max-keywords': { type: 'string' },
      headful: { type: 'boolean' },
      'dump-raw': { type: 'boolean' },
    },
    strict: true,
  });

  const niche = values.niche ?? '';
  if (!NICHE_RE.test(niche)) {
    fail(
      'Usage: pnpm ent:scout --niche <fishing|pov-review|...> [--sub-niche <id>] [--max-videos 50] [--headful]',
    );
  }
  const root = findWorkspaceRoot(process.cwd());
  const configPath = values['keywords-file']
    ? join(root, values['keywords-file'])
    : join(root, 'config', 'scout', `${niche}.json`);
  const config = loadScoutConfig(configPath);

  // Schema combo: BẮT BUỘC chọn ngách con — query luôn là [format] + [productTerm].
  let subNiche: ScoutSubNiche | null = null;
  if (config.subNiches && config.subNiches.length > 0) {
    const requested = values['sub-niche'] ?? '';
    subNiche = config.subNiches.find((s) => s.id === requested) ?? null;
    if (!subNiche) {
      const ids = config.subNiches.map((s) => s.id).join(' | ');
      fail(
        `SUB_NICHE_REQUIRED: niche "${niche}" dùng schema combo — chạy với --sub-niche <${ids}>.`,
      );
    }
  } else if (values['sub-niche']) {
    fail(`Config ${configPath} không có subNiches — bỏ cờ --sub-niche.`);
  }

  // Combo: query = [format] + [productTerm] của ngách con; phẳng: giữ nguyên hành vi cũ.
  const allKeywords = subNiche
    ? resolveComboKeywords(config.formats ?? [], subNiche)
    : config.keywords;
  if (allKeywords.length === 0) fail('Không resolve được keyword nào từ config.');

  // VOE gate: productTerms của ngách con được tính là bằng chứng sản phẩm hợp lệ.
  const gate: ScoutProductGate | null = config.productGate
    ? {
        ...config.productGate,
        productEvidence: [
          ...new Set([...config.productGate.productEvidence, ...(subNiche?.productTerms ?? [])]),
        ],
      }
    : null;

  const maxVideos = values['max-videos'] ? Number.parseInt(values['max-videos'], 10) : 50;
  const maxKeywords = values['max-keywords']
    ? Number.parseInt(values['max-keywords'], 10)
    : allKeywords.length;
  const headful = values.headful === true || process.env.DOUYIN_HEADFUL === '1';
  const thresholds = {
    ...config.thresholds,
    ...(values['age-min'] ? { ageMinMinutes: Number.parseInt(values['age-min'], 10) } : {}),
    ...(values['age-max'] ? { ageMaxMinutes: Number.parseInt(values['age-max'], 10) } : {}),
  };

  const scoutDir = join(root, 'data', 'temp', 'ent', 'scout');
  mkdirSync(scoutDir, { recursive: true });
  const startedAtDate = new Date();
  const startedAt = startedAtDate.toISOString();
  const runId = `scout_${niche}_${ts(startedAtDate)}`;
  const rawDir = join(scoutDir, 'raw', runId);
  if (values['dump-raw']) mkdirSync(rawDir, { recursive: true });

  const baseRunState: Omit<ScoutRunState, 'state'> = {
    pid: process.pid,
    runId,
    niche,
    startedAt,
  };
  writeRunState(scoutDir, { state: 'running', ...baseRunState });

  const keywords = allKeywords.slice(0, Math.max(maxKeywords, 1));
  console.log(
    `[scout] ${config.label} — ${keywords.length} keyword, cửa sổ ${thresholds.ageMinMinutes}–${thresholds.ageMaxMinutes} phút, headful=${headful}`,
  );
  if (subNiche) {
    console.log(`[scout] ngách con: ${subNiche.label} (${subNiche.id}) — query combo bắt buộc.`);
  }
  if (gate) {
    console.log(
      `[scout] VOE product gate BẬT — ${gate.productEvidence.length} evidence / ${gate.garbageMarkers.length} garbage marker.`,
    );
  }

  // Cờ alreadyJobbed: đối chiếu job đang sống (read-only, không network).
  const jobbedIds = collectJobbedAwemeIds(join(root, 'data', 'temp', 'ent'));

  const items: KeywordItem[] = [];
  const domOnlyIds: string[] = [];
  let keywordsCompleted = 0;
  let navFailures = 0;
  let captchaHit = false;
  let rawDumpCount = 0;

  const session = await openScoutSession(headful);
  try {
    for (const [i, keyword] of keywords.entries()) {
      console.log(`[scout] (${i + 1}/${keywords.length}) search "${keyword}" …`);
      const res = await searchDouyinKeyword(session, keyword, {
        targetCount: config.search.targetPerKeyword,
        scrollBudgetMs: config.search.scrollBudgetMs,
        headful,
        ...(values['dump-raw']
          ? {
              onRawBody: (body: unknown) => {
                rawDumpCount += 1;
                try {
                  writeFileSync(
                    join(rawDir, `kw${String(i + 1).padStart(2, '0')}_${rawDumpCount}.json`),
                    JSON.stringify(body, null, 2),
                  );
                } catch {
                  /* dump là tiện ích phụ */
                }
              },
            }
          : {}),
      });

      if (!res.ok) {
        if (res.code === 'CAPTCHA') {
          console.error(`[scout] 🛑 ${res.message}`);
          captchaHit = true;
          break;
        }
        if (res.code === 'NAV_FAILED') {
          console.error(`[scout] ⚠️ ${res.message} — bỏ keyword này, đi tiếp.`);
          navFailures += 1;
          continue;
        }
        console.log(`[scout] (không có kết quả cho "${keyword}")`);
        keywordsCompleted += 1;
        continue;
      }

      for (const item of res.items) items.push({ ...item, keyword });
      for (const id of res.domOnlyIds) {
        if (!domOnlyIds.includes(id)) domOnlyIds.push(id);
      }
      keywordsCompleted += 1;
      console.log(`[scout] "${keyword}" → ${res.items.length} item có số liệu`);

      // Jitter giữa các keyword — tuần tự cho giống người, tránh rate-limit.
      if (i < keywords.length - 1) {
        const { keywordDelayMsMin: lo, keywordDelayMsMax: hi } = config.search;
        const delay = lo + Math.floor(Math.random() * Math.max(hi - lo, 0));
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  } finally {
    await closeScoutSession(session);
  }

  const { candidates, rejected } = buildCandidates(items, Date.now(), thresholds, jobbedIds, gate);
  const capped = candidates.slice(0, Math.max(maxVideos, 1));

  const snapshot: ScoutSnapshot = {
    schemaVersion: 1,
    runId,
    niche,
    startedAt,
    finishedAt: new Date().toISOString(),
    keywords,
    keywordsCompleted,
    subNiche: subNiche ? { id: subNiche.id, label: subNiche.label } : null,
    productGateApplied: gate !== null,
    filters: {
      ageMinMinutes: thresholds.ageMinMinutes,
      ageMaxMinutes: thresholds.ageMaxMinutes,
      sortHint: 'newest',
    },
    thresholds,
    status: captchaHit ? 'PARTIAL_CAPTCHA' : navFailures > 0 ? 'PARTIAL_NAV_FAILED' : 'OK',
    rejectedCounts: rejected,
    domOnlyIds,
    candidates: capped,
  };

  const snapshotPath = join(scoutDir, `${runId}.json`);
  writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2));
  const report = renderReportMd(snapshot, TOP_N_REPORT);
  writeFileSync(join(scoutDir, `${runId}.md`), report);

  console.log(`\n${report}`);
  const relSnapshot = relative(root, snapshotPath).replaceAll('\\', '/');
  console.log(`[scout] snapshot: ${relSnapshot}`);

  const hardFail = keywordsCompleted === 0 && !captchaHit;
  const exitCode = captchaHit ? 2 : hardFail ? 1 : 0;
  writeRunState(scoutDir, {
    state: captchaHit ? 'captcha' : hardFail ? 'failed' : 'done',
    ...baseRunState,
    finishedAt: snapshot.finishedAt,
    snapshotPath: relSnapshot,
    exitCode,
    ...(captchaHit
      ? { message: 'Douyin chặn CAPTCHA — chạy "pnpm ent:douyin-login" rồi quét lại.' }
      : {}),
  });
  process.exit(exitCode);
}

main().catch((e) => {
  const message = e instanceof Error ? e.message : String(e);
  console.error(`🛑 SCOUT_FAILED: ${message}`);
  try {
    const root = findWorkspaceRoot(process.cwd());
    const scoutDir = join(root, 'data', 'temp', 'ent', 'scout');
    mkdirSync(scoutDir, { recursive: true });
    writeFileSync(
      join(scoutDir, 'scout_run.json'),
      JSON.stringify(
        {
          state: 'failed',
          pid: process.pid,
          runId: 'unknown',
          niche: 'unknown',
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          exitCode: 1,
          message: message.slice(0, 280),
        },
        null,
        2,
      ),
    );
  } catch {
    /* best-effort */
  }
  process.exit(1);
});
