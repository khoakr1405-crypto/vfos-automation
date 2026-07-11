// E1 — HOOK STYLE BANK (Entertainment / Fishing-Vlog lane).
// ---------------------------------------------------------------------------
// MỤC TIÊU: hook nghe như NGƯỜI THẬT dẫn chuyện, KHÔNG bị cảm giác máy chép 1 câu
// mẫu. Trước đây prompt nhét sẵn ví dụ "Con đầu đã vậy…" → GPT lặp y hệt nhiều job.
// Bank này cấp 6 NHÓM GIỌNG + xoay vòng style theo job (tránh job gần dùng trùng) +
// danh sách hook gần đây để né. VÍ DỤ trong bank chỉ MINH HOẠ GIỌNG — buộc viết MỚI
// bám footage thật, KHÔNG copy, KHÔNG bịa số/loài/thành tích, KHÔNG nói quá.
//
// Ràng buộc hook (caller 13 vẫn enforce): 8–13 từ · voice ≤1.5s · 1 câu trong 0–5s.
// Lịch sử lưu runtime: <data/temp/ent>/.hook_history.json (gitignored, KHÔNG commit).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface HookStyle {
  id: string;
  label: string;
  /** Chỉ dẫn GIỌNG cho nhóm này (đưa vào prompt). */
  guidance: string;
  /** Ví dụ MINH HOẠ giọng — KHÔNG để GPT chép, chỉ để bắt tông. */
  examples: string[];
}

// 6 nhóm theo yêu cầu Operator. Ví dụ bám lane câu cá/mực, trung thực (không số/loài bịa).
export const HOOK_STYLES: readonly HookStyle[] = [
  {
    id: 'bat_ngo',
    label: 'Bất ngờ',
    guidance:
      'Mở bằng sự BẤT NGỜ/không ngờ tới về cú vừa dính — như vừa thả đã ăn, hoặc cảnh hiện ra trước mắt khiến chính người câu sững lại. Tự nhiên, không kịch.',
    examples: [
      'Thề luôn, mới thả xuống mà nó đã dính ngay.',
      'Không ngờ vừa ra tới nơi đã có chuyện liền.',
    ],
  },
  {
    id: 'hoi_nguoi_xem',
    label: 'Hỏi người xem',
    guidance:
      'Đặt 1 CÂU HỎI kéo người xem vào cuộc (đoán xem, bạn từng thấy chưa, theo bạn thì…). Hỏi gọn, dẫn thẳng vào cảnh, không hỏi xàm.',
    examples: [
      'Đố bạn đoán con này lên là cỡ nào đấy?',
      'Bạn từng thấy ai kéo căng cần như vầy chưa?',
    ],
  },
  {
    id: 'persona',
    label: 'Persona / người kể',
    guidance:
      'Nhân vật TỰ DẪN: xưng tôi/anh, khẳng định chất riêng rút từ persona GỐC của video (vd đi câu giữa trưa, quen vùng nước này…). Gọi đúng vùng nước theo bối cảnh thật (biển/hồ/sông) — KHÔNG mặc định biển. Tự tin, lầy duyên, KHÔNG khoác lác thành tích bịa.',
    examples: [
      'Trưa nắng vầy mà tôi vẫn ra, có lý do cả.',
      'Khúc nước này tôi câu quen tay tới mức nào để coi.',
    ],
  },
  {
    id: 'hai_nhe',
    label: 'Hài nhẹ',
    guidance:
      'Tếu nhẹ, tự trào, một câu duyên khiến người xem bật cười khẽ. KHÔNG lố, KHÔNG cợt nhả vô duyên, vẫn bám cảnh thật.',
    examples: [
      'Con này lên còn nhanh hơn tôi kịp chỉnh máy.',
      'Đi câu kiểu này khéo về sớm hơn dự định mất.',
    ],
  },
  {
    id: 'cang_nhip',
    label: 'Căng nhịp',
    guidance:
      'Nhấn NHỊP GẤP, kéo căng ngay từ giây đầu — cần cong, dây rít, ghì tay. Câu dồn, tạo cảm giác sắp bùng, KHÔNG cường điệu quá đà.',
    examples: [
      'Cần cong gập xuống, phải ghì cho thật chắc tay.',
      'Dây rít một cái, biết ngay con này không vừa.',
    ],
  },
  {
    id: 'hua_hen',
    label: 'Hứa hẹn / payoff',
    guidance:
      'HỨA khúc sau đáng coi: con bự nhất chưa lên, cao trào còn ở cuối. Gợi tò mò để giữ chân tới hết, nhưng KHÔNG hứa điều không có trong clip.',
    examples: [
      'Coi tới cuối đi, con bự nhất còn chưa lên đâu.',
      'Mới mở màn nhiêu đó thôi, khúc sau mới đã.',
    ],
  },
] as const;

export interface HookHistoryEntry {
  jobId: string;
  styleId: string;
  hookText: string;
  at: string;
}

const HISTORY_BASENAME = '.hook_history.json';
const AVOID_LAST_K = 3; // né style của 3 job GẦN NHẤT (khác job hiện tại)
const HISTORY_MAX = 30; // giữ tối đa 30 entry gần nhất

/** File lịch sử nằm ở thư mục cha của job dir (data/temp/ent) → chia sẻ giữa job. */
function historyPath(workDirOfJob: string): string {
  return join(dirname(workDirOfJob), HISTORY_BASENAME);
}

export function readHookHistory(workDirOfJob: string): HookHistoryEntry[] {
  const p = historyPath(workDirOfJob);
  if (!existsSync(p)) return [];
  try {
    const arr = JSON.parse(readFileSync(p, 'utf8'));
    return Array.isArray(arr) ? (arr as HookHistoryEntry[]) : [];
  } catch {
    return [];
  }
}

export function appendHookHistory(workDirOfJob: string, entry: HookHistoryEntry): void {
  const hist = readHookHistory(workDirOfJob).filter((e) => e.jobId !== entry.jobId);
  hist.push(entry);
  const trimmed = hist.slice(-HISTORY_MAX);
  try {
    writeFileSync(historyPath(workDirOfJob), JSON.stringify(trimmed, null, 2));
  } catch {
    /* history phụ trợ — lỗi ghi không chặn pipeline */
  }
}

/** Hash số đơn giản, ổn định theo jobId (chọn style deterministic per-job). */
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

/**
 * Chọn 1 style cho job: LOẠI các style của K job KHÁC gần nhất (chống đụng job gần),
 * rồi chọn deterministic theo hash(jobId) trong tập còn lại → re-run cùng job ra cùng
 * style (ổn định), nhưng các job liền nhau ra style KHÁC nhau.
 */
export function pickHookStyle(jobId: string, history: HookHistoryEntry[]): HookStyle {
  const recentOther = history
    .filter((e) => e.jobId !== jobId)
    .slice(-AVOID_LAST_K)
    .map((e) => e.styleId);
  let pool = HOOK_STYLES.filter((s) => !recentOther.includes(s.id));
  if (pool.length === 0) pool = [...HOOK_STYLES];
  const chosen = pool[hashStr(jobId) % pool.length];
  if (!chosen) throw new Error('HOOK_STYLES rỗng — không thể chọn style hook.');
  return chosen;
}

// --- Chống lặp nội dung hook (mô-típ cũ + đụng hook job gần) ----------------

/** Mô-típ BỊ CẤM dùng lại (đã lặp nhiều job → nhàm/lộ máy). */
const BANNED_HOOK_RES: readonly RegExp[] = [/con đầu đã vậy/i, /khúc sau (còn|mới|chắc)/i];

/** Chuẩn hoá để so trùng: thường hoá, bỏ dấu câu, gộp khoảng trắng. */
function normHook(s: string): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/[.,!?…"'-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** N từ đầu (so mở câu trùng nhau). */
function firstWords(s: string, n: number): string {
  return normHook(s).split(' ').slice(0, n).join(' ');
}

/**
 * Hook bị coi là LẶP khi: dính mô-típ cấm, HOẶC trùng/na ná 1 hook gần đây (full
 * giống, hoặc 4 từ mở đầu giống). Caller dùng để FAIL gate + (nếu muốn) viết lại.
 */
export function isHookRepeat(
  text: string,
  history: HookHistoryEntry[],
  jobId: string,
): { repeat: boolean; reason: string } {
  for (const re of BANNED_HOOK_RES) {
    if (re.test(text)) return { repeat: true, reason: `dính mô-típ cấm ${re}` };
  }
  const norm = normHook(text);
  const head = firstWords(text, 4);
  for (const e of history) {
    if (e.jobId === jobId) continue;
    if (normHook(e.hookText) === norm) return { repeat: true, reason: `trùng hook job ${e.jobId}` };
    if (head && firstWords(e.hookText, 4) === head)
      return { repeat: true, reason: `mở đầu giống hook job ${e.jobId}` };
  }
  return { repeat: false, reason: '' };
}

/** Khối hướng dẫn style để chèn vào user-prompt của 13 (gồm avoid-list). */
export function buildHookStyleBlock(style: HookStyle, recentHooks: string[]): string {
  const avoid =
    recentHooks.length > 0
      ? `\n- HOOK GẦN ĐÂY (TUYỆT ĐỐI KHÔNG lặp lại/đặt na ná): ${recentHooks
          .map((h) => `"${h}"`)
          .join(' | ')}`
      : '';
  return [
    `HOOK COLD-OPEN — GIỌNG "${style.label}": ${style.guidance}`,
    `- Ví dụ GIỌNG (CHỈ để bắt tông, KHÔNG chép nguyên văn — viết câu MỚI bám đúng cảnh): ${style.examples
      .map((e) => `"${e}"`)
      .join(' | ')}`,
    '- 1 câu DUY NHẤT 8–13 từ, đặt t=0.5 (voice trước 1.5s), bám cảnh TO ở 0–5s đầu.',
    '- KHÔNG bịa số/loài/thành tích, KHÔNG nói quá, KHÔNG dùng lại mô-típ "con đầu đã vậy…".',
    avoid,
  ]
    .filter(Boolean)
    .join('\n');
}
