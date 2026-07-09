# RFC: Thức tỉnh "Script Claim & Safety Agent"

> **Loại tài liệu**: Integration Plan / Bản vẽ thi công (design-only).
> **Trạng thái**: `DRAFT` — chờ Operator nghiệm thu. **KHÔNG có 1 dòng code thực thi nào trong round tạo RFC này.**
> **Ngày lập**: 2026-07-09
> **Tác giả**: Architectural Integrity Guardian (khảo sát read-only 3 khu vực lõi).
> **Đặc vụ mục tiêu**: [`.claude/agents/script-claim-safety-agent.md`](../.claude/agents/script-claim-safety-agent.md)
> **Tham chiếu nguồn khảo sát**:
> - [`scripts/job-manager/commands/script.ts`](../scripts/job-manager/commands/script.ts) — 703 dòng (luồng tạo script hiện tại)
> - [`scripts/job-manager/core/product-card.ts`](../scripts/job-manager/core/product-card.ts) — reader dữ liệu vào
> - [`scripts/job-manager/core/validation.ts`](../scripts/job-manager/core/validation.ts) — `validateScript` hiện tại
> - [`packages/script-writer/src/quality-guard.ts`](../packages/script-writer/src/quality-guard.ts) — hạ tầng tái dùng (`countWords`, banned-list mechanism)

---

## §0. Bối cảnh, Hiện trạng & North Star

### 0.1 Vì sao làm bây giờ
Khung Multi-Agent đã dựng (5 file định nghĩa trong `.claude/agents/`). Trọng tâm hiện tại là **đẩy mạnh sản xuất video**. Nút thắt: script được tạo bằng LLM nhưng **chưa có lớp claim-safety thực thi** — rủi ro đăng nội dung phóng đại/claim y tế → **kênh bị gậy → mất doanh thu**. Đây chính là điểm North Star: script an toàn = kênh sống = affiliate ra tiền bền vững.

### 0.2 Hiện trạng đã khảo sát (7 phát hiện)

| # | Phát hiện | Bằng chứng |
|---|---|---|
| 1 | `cmdScript` **KHÔNG** enforce claim-safety. `validateScript` chỉ check **cấu trúc** (hook trùng, lặp tên SP >2, n-gram 4-6 từ, duration, ≥15 từ). Không có blocklist scan. | [validation.ts](../scripts/job-manager/core/validation.ts) toàn bộ; [script.ts:493](../scripts/job-manager/commands/script.ts#L493) |
| 2 | Chỉ có **1 câu nhắc mềm** trong prompt ("Không nói quá sự thật, không mang tính phản cảm") — không có cơ chế chặn. | [script.ts:244](../scripts/job-manager/commands/script.ts#L244) |
| 3 | **Template fallback đang chứa cụm rủi ro** `"lựa chọn đỉnh nhất"` — họ superlative bị agent-spec cấm ("tốt nhất"). | [script.ts:641](../scripts/job-manager/commands/script.ts#L641) |
| 4 | Prompt inline + OpenAI client (fetch, retry 429 leo thang 15/30/60/75s trần tổng 180s, 5xx backoff) **nhồi ~450 dòng thẳng trong command** — vi phạm "command chỉ điều phối". | [script.ts:186–535](../scripts/job-manager/commands/script.ts#L186) |
| 5 | Price extract **inline** trong command (`price`/`price_min`/`priceMin`), không nằm ở reader chung. `product-card.ts` chỉ có 3 reader (name/id/chineseSearchName). | [script.ts:102](../scripts/job-manager/commands/script.ts#L102); [product-card.ts](../scripts/job-manager/core/product-card.ts) |
| 6 | `@vfos/script-writer` **đã có hạ tầng tái dùng**: `countWords`, `BannedHit`, `HARD_BANNED_PHRASES` (12 cụm STYLE), `SOFT_BANNED`, `AD_COPY_PHRASES`, `QualityStatus pass/near_pass/fail`. Cơ chế quét = **mảng + lowercase + `.includes()`** (đã chạy production lane ent). | [quality-guard.ts:79,279,367](../packages/script-writer/src/quality-guard.ts#L279) |
| 7 | Exit-code contract của `script.ts` (1/2/3/4/5/6/7/20/21) được Studio API routes gọi qua **CLI spawn** → wiring KHÔNG được đổi nghĩa code cũ. | `apps/studio/.../run-command.ts`, các route `jobs/[jobId]/*` |

> **Phân biệt quan trọng** (đưa vào thiết kế §2): list của `script-writer` là **STYLE list** ("tuyệt vời", "vô cùng", "mua ngay"…) — chống văn AI sáo rỗng. Blocklist của agent-spec là **CLAIM list** ("an toàn tuyệt đối", "tốt nhất", "chữa bách bệnh", claim sức khỏe…) — chống rủi ro pháp lý/policy. **RFC giữ 2 list RIÊNG BIỆT, chỉ tái dùng CƠ CHẾ quét**, không trộn ngữ nghĩa.

### 0.3 No-Go áp dụng cho đặc vụ này
- **No-Go #2/#3**: agent KHÔNG tự chạy production/API thật. Chỉ chạy OpenAI khi cờ `--confirm-openai` (giữ nguyên hành vi hiện tại).
- **No-Go #8 (Operator Approval)**: agent **tự PASS/FAIL** bước claim-safety (gate kỹ thuật tự report), không biến thành nút duyệt tay giữa pipeline. Operator chỉ duyệt thành phẩm cuối.
- **Không bịa**: log `rejected_variants` trung thực từng biến thể bị loại — cấm ghi "0 rejected" khi có reject (đúng agent-spec).

---

## §1. Phase 1 — AI Generation Module (`packages/ai-agents/`)

### 1.1 Ràng buộc kiến trúc (bắt buộc)
- **Mọi logic LLM ra một package riêng** `packages/ai-agents/` (chưa tồn tại — verified `ls packages/` = db/facebook/script-writer/sdk/shopee/voice). **CẤM** nhồi logic LLM vào file command.
- **Layering 1 chiều**: `scripts/commands/script.ts` → `@vfos/ai-agents` → `@vfos/script-writer` (primitives). Package **KHÔNG** được import ngược vào `scripts/` (nên `validateScript` của core được truyền vào bằng **callback DI**, xem 1.3).

### 1.2 Cấu trúc thư mục đề xuất
```
packages/ai-agents/
├── package.json          # name @vfos/ai-agents; deps: @vfos/script-writer (workspace:*)
├── tsconfig.json         # extends chuẩn workspace, NodeNext, strict
├── src/
│   ├── index.ts          # public surface (re-export agent + types)
│   └── script-claim-safety/
│       ├── types.ts              # ScriptFacts, ScriptDraft, ClaimViolation, SafetyVerdict, AgentInput, AgentResult, RejectedVariant
│       ├── product-card-facts.ts # readScriptFacts(card) — gom name/shortName/price (di trú reader inline L102–110)
│       ├── prompt-builder.ts     # buildScriptPrompt(facts, durations, vision) → string (di trú prompt VI L186–261)
│       ├── openai-caller.ts      # callScriptModel(prompt, opts) — di trú fetch + retry 429/5xx (L271–475)
│       ├── claim-blocklist.ts    # DATA thuần: PHRASE_RULES[] + PATTERN_RULES[] (§2)
│       ├── validation-engine.ts  # scanClaims(), enforceWordBudget(), normalizeVi() (§2)
│       └── agent.ts              # generateSafeScript() — orchestrate generate→validate→retry≤3→safe-fallback
└── tests/                        # vitest, mirror src/ (claim-blocklist.test, validation-engine.test, product-card-facts.test)
```

### 1.3 Interface chính (chỉ chữ ký — KHÔNG implementation)

```ts
// types.ts (trích)
export interface ScriptFacts {
  productName: string;
  shortProductName?: string;
  priceLabel: string | null;   // "199K" | "45000" | null (đã format, KHÔNG bịa)
}

export interface AgentInput {
  facts: ScriptFacts;
  sourceVideoDurationSec: number;
  targetVoiceDurationSec: number;
  targetWordCount: number;
  visionArtifact?: unknown | null;         // giữ nguyên shape v3 hiện tại
  confirmAi: boolean;                      // gate No-Go #2 — false ⇒ safe-fallback ngay
  maxRetries?: number;                     // default 3
  // DI: agent KHÔNG import validateScript của scripts/core → nhận qua callback
  structuralValidate: (v: StructuralInput) => StructuralResult;
  openAiApiKey?: string;                   // resolve ở command (loadDotEnv), truyền vào
}

export type SafetyVerdict = 'safe' | 'safe_with_warnings' | 'blocked';

export interface RejectedVariant {
  attempt: number;
  reason: 'CLAIM_BLOCKED' | 'STRUCTURAL_FAIL' | 'WORD_BUDGET' | 'API_ERROR';
  violations: ClaimViolation[];
  errorDetail?: string;
}

export interface AgentResult {
  status: 'ok' | 'fallback' | 'blocked';   // ok=AI pass; fallback=template; blocked=không ghi được
  draft: ScriptDraft | null;               // shape khớp script_artifact v3
  safetyReport: SafetyReport;              // → claim_safety_report.json
  rejectedVariants: RejectedVariant[];     // TRUNG THỰC — log đủ, cấm "0 rejected" khi có
}

// agent.ts
export async function generateSafeScript(input: AgentInput): Promise<AgentResult>;
```

- **Model**: GIỮ `gpt-4o-mini` + OpenAI Chat Completions như hiện trạng. Đổi provider/model = round riêng, **ngoài scope RFC này**.
- **Reuse**: `openai-caller.ts` di trú nguyên văn cơ chế retry đã kiểm chứng (429 leo thang, 5xx backoff, persist error KHÔNG lộ API key) từ [script.ts:271–535](../scripts/job-manager/commands/script.ts#L271).

---

## §2. Phase 2 — Validation Engine

### 2.1 Quyết định: **HYBRID — mảng dữ liệu là chính, regex có kiểm soát là phụ**

**Lý do chọn mảng làm nền**: (a) khớp cơ chế `HARD_BANNED_PHRASES` đã chạy production ổn định; (b) Operator đọc/thêm/xoá được cụm cấm mà không cần biết regex; (c) regex trên **tiếng Việt có dấu** dễ sai escaping/unicode-class. Regex chỉ dùng cho **claim số** không thể liệt kê hết.

```ts
// claim-blocklist.ts (DATA thuần — Operator sửa được)
export interface PhraseRule { id: string; phrase: string; severity: 'hard' | 'soft'; category: ClaimCategory; note: string; }
export interface PatternRule { id: string; pattern: RegExp; severity: 'hard' | 'soft'; category: ClaimCategory; note: string; }

export const PHRASE_RULES: PhraseRule[] = [
  // superlative / tuyệt đối (agent-spec Section I)
  { id: 'superlative-tot-nhat', phrase: 'tốt nhất', severity: 'hard', category: 'superlative', note: 'không so sánh tuyệt đối' },
  { id: 'abs-safe',            phrase: 'an toàn tuyệt đối', severity: 'hard', category: 'absolute', note: '' },
  { id: 'sieu-manh-nhat',      phrase: 'siêu mạnh nhất', severity: 'hard', category: 'superlative', note: '' },
  { id: 'never-kep-toc',       phrase: 'không bao giờ kẹt tóc', severity: 'hard', category: 'absolute', note: '' },
  { id: 'mat-nhu-dieu-hoa',    phrase: 'mát như điều hòa', severity: 'hard', category: 'false-equiv', note: '' },
  { id: 'thay-the-dieu-hoa',   phrase: 'thay thế điều hòa', severity: 'hard', category: 'false-equiv', note: '' },
  { id: 'pin-trau-ca-ngay',    phrase: 'pin trâu cả ngày', severity: 'soft', category: 'exaggeration', note: '' },
  // health claim (agent-spec: claim sức khỏe/làm đẹp/y tế không bằng chứng)
  { id: 'chua-bach-benh',      phrase: 'chữa bách bệnh', severity: 'hard', category: 'health-claim', note: '' },
  { id: 'tri-dut-diem',        phrase: 'trị dứt điểm', severity: 'hard', category: 'health-claim', note: '' },
  // ... danh sách seed; Operator mở rộng
];

export const PATTERN_RULES: PatternRule[] = [
  { id: 'commit-percent', pattern: /cam\s*kết\s*\d+\s*%/, severity: 'hard', category: 'guarantee', note: '"cam kết 100%"' },
  { id: 'lose-weight',    pattern: /giảm\s*\d+\s*(kg|cân)/, severity: 'hard', category: 'health-claim', note: '' },
  { id: 'pct-effective',  pattern: /\d+\s*%\s*(an\s*toàn|hiệu\s*quả)/, severity: 'hard', category: 'guarantee', note: '' },
  { id: 'cure-absolute',  pattern: /(trị|chữa)\s+(dứt\s*điểm|khỏi\s*hẳn|bách\s*bệnh)/, severity: 'hard', category: 'health-claim', note: '' },
];
```

### 2.2 Pipeline chuẩn hoá **TRƯỚC** khi quét (chống né + chống vỡ tiếng Việt)
`normalizeVi(raw): { normalized, map }`:
1. `String.prototype.normalize('NFC')` — hợp nhất tổ hợp dấu (composed).
2. Strip zero-width: `U+200B` (ZWSP), `U+200C/D`, `U+FEFF` (BOM/ZWNBSP) — chống né "tốt​nhất".
3. NBSP `U+00A0` → space thường.
4. Collapse whitespace `\s+` → 1 space.
5. `toLowerCase()` (SAU NFC — thứ tự bắt buộc).

Quét `.includes()` / `PATTERN_RULES` trên **bản normalized**; report **vị trí trên bản gốc** (giữ `map` offset) để log dễ đọc cho Operator.

### 2.3 Bộ đếm từ ép giới hạn (agent-spec)
- **Tái dùng `countWords`** từ `@vfos/script-writer` ([quality-guard.ts:79](../packages/script-writer/src/quality-guard.ts#L79) — `trim().split(/\s+/).filter(Boolean).length`). **KHÔNG** dùng `.length` (UTF-16 surrogate làm sai số).
- `enforceWordBudget(unit, text, max)`:
  - `hook` ≤ **15** từ (khớp prompt hiện tại "hook 10-15 từ").
  - `subtitle` line ≤ **12** từ (agent-spec).
  - `overlay` ≤ **5** từ (agent-spec).
- **Scope thật thà**: artifact v3 hiện **chưa tách subtitle lines** — engine *expose* `enforceWordBudget` nhưng wiring đầu chỉ áp cho **hook** + **câu tách từ voiceover**. Sentence-split an toàn: tách theo `[.!?…]` + khoảng trắng + **lookahead chữ hoa** (không vỡ `10.000đ`, `T.P`). Áp cho subtitle/overlay thật khi caption stage nối sau (round riêng).

### 2.4 Verdict + vòng lặp
- `scanClaims(text) → { verdict, violations }`, `verdict ∈ {safe, safe_with_warnings, blocked}` (mirror `pass/near_pass/fail`).
- Hard hit → `blocked` → **retry** (≤3) kèm **feedback cụm cấm vào prompt** ("KHÔNG dùng: <phrase>...") + log `RejectedVariant`.
- Hết retry vẫn blocked, hoặc `confirmAi=false` → **safe fallback template** (bản viết lại, **BỎ "đỉnh nhất"**) + `templateFallback: true` + `rejectedVariants` đầy đủ.
- **Artifact mới additive**: `data/temp/jobs/<jobId>/claim_safety_report.json` (`{ verdict, violations, rejectedVariants, checkedAt, source }`). KHÔNG đụng `script_artifact.json` schema cũ, chỉ **thêm** block `quality.claimSafety`.

---

## §3. Phase 3 — Wiring Plan (cắt/nối `commands/script.ts`)

### 3.1 Bảng CẮT / GIỮ

| Vùng (dòng hiện tại) | Xử lý | Đích |
|---|---|---|
| parseArgs, 2 gate fallback/cleanliness (return 21/20), load manifest+card, ffprobe duration, load vision, dry-run print, GHI artifact+manifest | **GIỮ** — vai trò điều phối thuần | `script.ts` |
| Prompt inline [L186–261](../scripts/job-manager/commands/script.ts#L186) | **CẮT** | `prompt-builder.ts` |
| OpenAI fetch + retry 429/5xx machinery [L271–475](../scripts/job-manager/commands/script.ts#L271) | **CẮT** | `openai-caller.ts` |
| Price/name reader inline [L95–110](../scripts/job-manager/commands/script.ts#L95) | **CẮT** | `product-card-facts.ts` |
| Fallback template text [L630–686](../scripts/job-manager/commands/script.ts#L630) (kèm **safety-fix "đỉnh nhất"**) | **CẮT + FIX** | `agent.ts` (safe template) |

### 3.2 Điểm nối
`script.ts` sau khi bóc, đoạn tạo script gọi:
```ts
const result = await generateSafeScript({
  facts, sourceVideoDurationSec, targetVoiceDurationSec, targetWordCount,
  visionArtifact, confirmAi, openAiApiKey: process.env.OPENAI_API_KEY,
  structuralValidate: (v) => validateScript(v),   // DI — core cũ, giữ layering
});
// script.ts ghi script_artifact v3 (như cũ) + block quality.claimSafety + claim_safety_report.json
```
- **Exit code mới `8 = CLAIM_SAFETY_BLOCKED`** (chỉ khi Operator muốn hard-stop; mặc định vẫn safe-fallback như hành vi cũ). **Additive** — 1/2/3/4/5/6/7/20/21 **giữ nguyên nghĩa** (No-Go: Studio routes spawn CLI phụ thuộc code này).

### 3.3 Migration 4 nhịp nhỏ (kiểu god-file — an toàn cuốn chiếu)
| Nhịp | Nội dung | Verify |
|---|---|---|
| R1 | Dựng `@vfos/ai-agents` + di trú `openai-caller` + `prompt-builder` + `product-card-facts` (**zero behavior change**) | biome + `pnpm job:script --dry-run` khớp output cũ |
| R2 | `claim-blocklist` + `validation-engine` + vitest (test vàng: "cam kết 100%", "chữa bách bệnh", "tốt nhất", né ZWSP, NFD↔NFC, đếm từ hook 15/subtitle 12) | `pnpm --filter @vfos/ai-agents test` |
| R3 | Wire `generateSafeScript` vào `script.ts` (thêm claim gate + artifact) | dry-run + `--confirm-openai` trên 1 job THẬT (chờ Operator GO) |
| R4 | Safety-fix fallback "đỉnh nhất" + cập nhật agent-spec/state doc | review MERGE_OK |

Mỗi nhịp: `pnpm typecheck` (package) + `biome check` + `pnpm job:script --job <id> --dry-run`. Run thật `--confirm-openai` **luôn chờ Operator GO** (No-Go #2).

---

## §4. Risk Assessment — xử lý chuỗi tiếng Việt (String manipulation)

| # | Điểm vỡ | Hậu quả | Phòng tránh |
|---|---|---|---|
| R1 | **NFC vs NFD** (composed "ố" vs "o" + dấu) làm `.includes()` **trượt** | Cụm cấm lọt | `normalize('NFC')` cả text lẫn rule trước khi so |
| R2 | `toLowerCase()` **trước** NFC | So sánh sai | Bắt buộc thứ tự: NFC → strip → lower |
| R3 | Né bằng **zero-width** "tốt​nhất" (U+200B) — không thuộc `\s` | Vừa lọt blocklist vừa **đếm sai số từ** | Strip ZWSP/ZWNJ/ZWJ/BOM bắt buộc trong `normalizeVi` |
| R4 | Biến thể/phương ngữ "tốt nhứt", số viết chữ "một trăm phần trăm" | Literal list **KHÔNG bắt hết** | **Defense-in-depth**: prompt instruction + PATTERN_RULES + Operator review. RFC ghi rõ **giới hạn — không hứa bắt 100%** |
| R5 | Sentence-split vỡ với `10.000đ`, `T.P`, `v.v.` | Đếm từ sai / cắt nhầm câu | Split `[.!?…]` + **lookahead khoảng trắng + chữ hoa**; không split khi trước/sau là chữ số |
| R6 | Emoji/ký tự lạ lọt từ LLM | Vỡ layout / policy | Warning + option strip emoji (agent-spec: tránh emoji lời thoại) |
| R7 | Dùng `.length` đếm từ | Sai với ký tự ngoài BMP | **Chỉ** `countWords` (`split(/\s+/)`) |
| R8 | Regex tiếng Việt escaping sai (dấu, `\s` giữa âm tiết) | False negative/positive | Ưu tiên **literal array**; regex chỉ cho claim số, `\s*` linh hoạt, có unit test cho từng pattern |

---

## §5. Ngoài scope + Alternatives đã cân nhắc

**Ngoài scope round này:**
- KHÔNG đổi LLM provider/model (giữ gpt-4o-mini).
- KHÔNG đụng lane `ent`/`chay` hay `packages/script-writer` (chỉ tái dùng primitives qua dependency).
- KHÔNG viết caption Facebook (thuộc `facebook-publish-plan-agent`).
- KHÔNG tách subtitle/overlay lines thật (chờ caption stage — engine đã sẵn hàm).

**Alternatives loại bỏ:**
- *Nhét logic vào `packages/script-writer`* → **loại**: Operator chốt thư mục riêng; script-writer là scene-based writer cho lane khác. Chỉ mượn `countWords`/`BannedHit` qua dependency.
- *Regex-only blocklist* → **loại**: khó cho Operator bảo trì + rủi ro unicode tiếng Việt (R8).
- *Chặn hard 100% bằng máy* → **loại (bất khả)**: ngôn ngữ tự nhiên né được; chọn defense-in-depth + minh bạch giới hạn (R4).

---

## Phụ lục A — Exit code contract (giữ nguyên + thêm 8)
`1` arg/creds thiếu · `2` UNKNOWN_JOB · `3` product-card thiếu/hỏng · `4` MISSING_PRODUCT_NAME · `5` SOURCE_VIDEO_TOO_SHORT · `6` OPENAI_API_FAILURE · `7` SCRIPT_QUALITY_VALIDATION_FAILED · `20` cleanliness gate · `21` fallback-source gate · **`8` CLAIM_SAFETY_BLOCKED (mới, additive)**.

## Phụ lục B — Checklist nghiệm thu RFC → implementation
- [ ] Operator duyệt cấu trúc `packages/ai-agents/` + interface `generateSafeScript`.
- [ ] Operator duyệt PHRASE_RULES seed (đặc biệt "tốt nhất", health-claim) + PATTERN_RULES.
- [ ] Operator xác nhận safety-fix "đỉnh nhất" (R4/§3.1) là logic change có chủ đích.
- [ ] Operator GO cho từng nhịp R1→R4 (mỗi nhịp report + chờ duyệt, không tự chạy sang nhịp sau).
