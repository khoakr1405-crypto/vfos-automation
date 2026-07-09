// Validation Engine (RFC §2.2–§2.4). Quét claim + ép word budget trên chuỗi ĐÃ
// chuẩn hoá — chống né bằng ký tự tàng hình + chống vỡ chuỗi tiếng Việt.
// KHÔNG gọi LLM ở đây (No-Go Phase 2). countWords tái dùng từ @vfos/script-writer.

import { countWords } from '@vfos/script-writer';
import { PATTERN_RULES, PHRASE_RULES } from './claim-blocklist.js';
import type { ClaimScanResult, ClaimViolation, SafetyVerdict, WordBudgetResult } from './types.js';

// Ký tự tàng hình cần xoá: ZWSP U+200B, ZWNJ U+200C, ZWJ U+200D, BOM/ZWNBSP U+FEFF.
// Dùng escape \uXXXX (KHÔNG chèn ký tự invisible literal vào source — chống footgun).
const ZERO_WIDTH = /\u200B|\u200C|\u200D|\uFEFF/g;
const NBSP = /\u00A0/g;

/**
 * Chuẩn hoá tiếng Việt trước khi quét (RFC §2.2) — THỨ TỰ BẮT BUỘC:
 *   1) NFC     — hợp nhất tổ hợp dấu (composed), khớp rule NFC.
 *   2) strip zero-width — chống né "tốt<zwsp>nhất".
 *   3) NBSP -> space, 4) collapse whitespace.
 *   5) lowercase (SAU NFC).
 */
export function normalizeVi(raw: string): { normalized: string; original: string } {
  const normalized = raw
    .normalize('NFC')
    .replace(ZERO_WIDTH, '')
    .replace(NBSP, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return { normalized, original: raw };
}

/**
 * Quét claim cấm. `index` = vị trí trên chuỗi ĐÃ normalized (đủ để Operator định
 * vị + `matched` cho ngữ cảnh). Verdict: hard->blocked, chỉ soft->safe_with_warnings,
 * sạch->safe.
 */
export function scanClaims(text: string): ClaimScanResult {
  const { normalized } = normalizeVi(text);
  const violations: ClaimViolation[] = [];

  // 1) PHRASE_RULES — literal .includes() (rule cũng NFC+lowercase để khớp).
  for (const rule of PHRASE_RULES) {
    const needle = rule.phrase.normalize('NFC').toLowerCase();
    if (!needle) continue;
    let from = normalized.indexOf(needle);
    while (from !== -1) {
      violations.push({
        ruleId: rule.id,
        matched: rule.phrase,
        severity: rule.severity,
        category: rule.category,
        index: from,
      });
      from = normalized.indexOf(needle, from + needle.length);
    }
  }

  // 2) PATTERN_RULES — regex có kiểm soát (chạy global để lấy mọi match + index).
  for (const rule of PATTERN_RULES) {
    const flags = rule.pattern.flags.includes('g') ? rule.pattern.flags : `${rule.pattern.flags}g`;
    const re = new RegExp(rule.pattern.source, flags);
    for (const m of normalized.matchAll(re)) {
      violations.push({
        ruleId: rule.id,
        matched: m[0],
        severity: rule.severity,
        category: rule.category,
        index: m.index ?? 0,
      });
    }
  }

  const hasHard = violations.some((v) => v.severity === 'hard');
  const hasSoft = violations.some((v) => v.severity === 'soft');
  const verdict: SafetyVerdict = hasHard ? 'blocked' : hasSoft ? 'safe_with_warnings' : 'safe';
  return { verdict, violations };
}

/**
 * Tách câu AN TOÀN (RFC §2.3): chỉ tách sau dấu kết câu `[.!?…]` + khoảng trắng +
 * ký tự kế là CHỮ HOA (`\p{Lu}`). Nhờ vậy KHÔNG vỡ "10.000đ" (dấu chấm không có
 * space sau) hay "T.P" (không có space). Dùng cho phụ đề/lời thoại.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+(?=\p{Lu})/u)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/**
 * Ép word budget cho từng dòng (phụ đề). Mặc định max = 12 từ/dòng (agent-spec
 * subtitle ≤ 12). Đếm bằng countWords của @vfos/script-writer (split `\s+`, KHÔNG
 * dùng `.length`). Trả 1 WordBudgetResult mỗi dòng — `withinLimit=false` là lỗi.
 */
export function enforceWordBudget(text: string, max = 12): WordBudgetResult[] {
  const lines = splitSentences(text);
  return lines.map((line, i) => {
    const count = countWords(line);
    return { unit: `line[${i}]`, count, max, withinLimit: count <= max };
  });
}
