// OpenAI caller — di trú từ scripts/job-manager/commands/script.ts:
//   - rate-limit helpers + constants (L271, L295–356)
//   - request builder + fetch + 429-wait-loop (L370–420)
//   - 5xx transient backoff formula (L453)
//   - content extraction (L478–484)
// Zero behavior change: thuật toán/hằng số/thứ tự giữ nguyên; chỉ thêm type cho
// package strict (any → typed response). Vòng lặp attempt + validation-retry là
// việc điều phối của agent.ts (Phase 2), KHÔNG nằm ở caller này.

import type { OpenAiChatOptions, OpenAiChatResponse, OpenAiErrorBody } from './types.js';

const OPENAI_CHAT_URL = 'https://api.openai.com/v1/chat/completions';

// --- Retry policy cho OpenAI 429 (đặc biệt token TPM) -------------------
// TPM reset theo PHÚT, nên dù server báo reset nhỏ (vd "292ms") bucket vẫn
// có thể đầy cả phút (Vision vừa đốt token ảnh). => sàn chờ LEO THANG
// 15s→30s→60s→75s để chắc chắn vượt cửa sổ TPM; chỉ ưu tiên gợi ý server khi
// gợi ý đó LỚN hơn sàn. Trần mỗi lần 75s, trần tổng 180s — rõ ràng, hữu hạn.
export const MAX_RATE_LIMIT_WAITS = 5;
export const MAX_PER_WAIT_MS = 75_000;
export const MAX_TOTAL_RATE_LIMIT_WAIT_MS = 180_000;

export const sleep = (ms: number): Promise<void> => new Promise<void>((r) => setTimeout(r, ms));

// Parse chuỗi duration kiểu OpenAI: "292ms", "1.5s", "1m30s", "6m0s" → ms.
export function parseResetDuration(v: string | null): number | null {
  if (!v) return null;
  let ms = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let m: RegExpExecArray | null = re.exec(v.trim());
  while (m !== null) {
    const num = m[1];
    const unit = m[2];
    if (num !== undefined && unit !== undefined) {
      matched = true;
      const n = Number.parseFloat(num);
      if (unit === 'ms') ms += n;
      else if (unit === 's') ms += n * 1000;
      else if (unit === 'm') ms += n * 60_000;
      else ms += n * 3_600_000;
    }
    m = re.exec(v.trim());
  }
  return matched ? Math.round(ms) : null;
}

// Parse message body kiểu "Please try again in 1m30s" / "try again in 292ms".
export function parseTryAgainMessage(msg: string | null): number | null {
  if (!msg) return null;
  const m = /try again in\s+([0-9.]+\s*(?:ms|h|m|s)(?:\s*[0-9.]+\s*(?:ms|h|m|s))*)/i.exec(msg);
  return m ? parseResetDuration(m[1] ?? null) : null;
}

// Sàn leo thang theo lần: 15s, 30s, 60s, 75s, 75s (cap MAX_PER_WAIT_MS).
export function escalatingFloorMs(n: number): number {
  return Math.min(15_000 * 2 ** (n - 1), MAX_PER_WAIT_MS);
}

// Gợi ý chờ từ server: retry-after header > x-ratelimit-reset-* header >
// message body "try again in Xs". null nếu không có nguồn nào.
export function serverSuggestedMs(headers: Headers, bodyMsg: string | null): number | null {
  const retryAfter = headers.get('retry-after');
  if (retryAfter && Number.isFinite(Number(retryAfter))) return Number(retryAfter) * 1000;
  const hdr =
    parseResetDuration(headers.get('x-ratelimit-reset-tokens')) ??
    parseResetDuration(headers.get('x-ratelimit-reset-requests'));
  if (hdr !== null) return hdr;
  return parseTryAgainMessage(bodyMsg);
}

// Thời gian chờ trước khi thử lại sau 429 + nguồn (để log minh bạch).
export function rateLimitWaitMs(
  headers: Headers,
  bodyMsg: string | null,
  n: number,
): { ms: number; source: string } {
  const server = serverSuggestedMs(headers, bodyMsg);
  const floor = escalatingFloorMs(n);
  // Gợi ý server pad 1s để chắc chắn vượt mốc reset; rồi lấy max với sàn.
  const padded = server !== null ? server + 1000 : 0;
  const ms = Math.min(Math.max(padded, floor), MAX_PER_WAIT_MS);
  const source =
    server !== null
      ? `server~${Math.round(server / 1000)}s vs sàn ${Math.round(floor / 1000)}s`
      : `sàn leo thang ${Math.round(floor / 1000)}s (không có gợi ý server)`;
  return { ms, source };
}

// 5xx transient backoff (exponential theo attempt) — giữ nguyên công thức L453.
export function serverBackoffMs(attempt: number): number {
  return 1000 * 2 ** (attempt - 1);
}

export function buildChatRequest(prompt: string, opts: OpenAiChatOptions): RequestInit {
  return {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.apiKey}`,
      // Close the socket after response so the process can exit cleanly on
      // Windows (avoids a libuv keep-alive handle assertion on exit).
      Connection: 'close',
    },
    body: JSON.stringify({
      model: opts.model ?? 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'You are an AI assistant that only outputs JSON.' },
        { role: 'user', content: prompt },
      ],
      temperature: opts.temperature ?? 0.7,
    }),
  };
}

// Một lần gọi model: fetch + vòng chờ 429 (có trần mỗi lần + trần tổng). Trả
// Response cuối cùng (ok / non-ok) để agent phân loại (5xx backoff / parse).
export async function callChatCompletion(
  prompt: string,
  opts: OpenAiChatOptions,
): Promise<Response> {
  const request = buildChatRequest(prompt, opts);
  let response = await fetch(OPENAI_CHAT_URL, request);
  let rateLimitWaits = 0;
  let totalWaitedMs = 0;
  while (response.status === 429 && rateLimitWaits < MAX_RATE_LIMIT_WAITS) {
    // Đọc body (best-effort, qua clone() để không tiêu response gốc) lấy
    // message "try again in Xs" khi server không trả header reset.
    let bodyMsg: string | null = null;
    try {
      const peek = (await response.clone().json()) as OpenAiErrorBody;
      bodyMsg = peek?.error?.message ?? null;
    } catch {
      /* body không phải JSON → bỏ qua, dùng sàn leo thang */
    }
    const nextWait = rateLimitWaits + 1;
    const { ms: waitMs, source } = rateLimitWaitMs(response.headers, bodyMsg, nextWait);
    // Trần tổng: nếu chờ thêm sẽ vượt 180s → dừng retry, fail trung thực.
    if (totalWaitedMs + waitMs > MAX_TOTAL_RATE_LIMIT_WAIT_MS) {
      console.warn(
        `⚠️  OpenAI 429 — đã chờ tổng ~${Math.round(totalWaitedMs / 1000)}s, lần kế (${Math.round(waitMs / 1000)}s) sẽ vượt trần ${Math.round(MAX_TOTAL_RATE_LIMIT_WAIT_MS / 1000)}s → dừng retry.`,
      );
      break;
    }
    rateLimitWaits = nextWait;
    console.warn(
      `⚠️  OpenAI 429 rate limit (token TPM) — lần ${rateLimitWaits}/${MAX_RATE_LIMIT_WAITS}: chờ ${Math.round(waitMs / 1000)}s [${source}] (tổng đã chờ ~${Math.round(totalWaitedMs / 1000)}s)`,
    );
    await sleep(waitMs);
    totalWaitedMs += waitMs;
    response = await fetch(OPENAI_CHAT_URL, request);
  }
  return response;
}

// Trích content string từ response body đã parse — throw khi rỗng (L478–484).
export function extractContent(resObj: OpenAiChatResponse): string {
  const choice = resObj.choices?.[0];
  const contentStr = choice?.message?.content;
  if (!contentStr) {
    throw new Error('OpenAI returned empty message content.');
  }
  return contentStr.trim();
}
