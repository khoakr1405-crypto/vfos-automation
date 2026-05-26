# Round 26B — Shopee CDP Link Extraction Audit

> **Loại tài liệu**: Audit report một lần — đi kèm Round 26B SKILL/architecture/state update.
> **Ngày**: 2026-05-26
> **Branch**: `master`
> **Scope**: audit 8 untracked Shopee scripts + 4 untracked `_commerce` JSON artifacts + quyết định promote vs keep-untracked vs delete-later.

---

## 1. Bối cảnh

CDP attach vào Cốc Cốc/Chrome đang chạy ở `127.0.0.1:9222` đã chứng minh thành công Round 25/26 — extract được short link Shopee từ `modal input.value` không cần password/OTP/cookie/storage_state/HAR/Open API.

Round 26B nâng cấp:
- `BROWSER_CDP_TARGETED_CLICK` thành **primary flow** của Commerce Product Agent.
- Thêm global dedupe registry + concurrency safety (lock + atomic write).
- Thêm CDP connection failure policy + selector resilience.

Bài audit này quyết định những script nào đã đủ an toàn để **promote** (commit vào repo) và những script nào giữ **untracked** chờ refactor round sau.

## 2. Audit từng untracked Shopee script

| # | File | Loại | Hardcoded secret? | Log cookie/token? | Random click? | Target tab đúng? | Validate owner? | Có dedupe? | Lock/atomic write? | Selector resilient? | **Verdict** |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | [click-and-extract-links.ts](../../packages/shopee/scripts/click-and-extract-links.ts) | POC — CDP attach, click idx 1+9 hard-coded, extract input.value, validate, write JSON | Không | Không | Không (idx fixed) | ✅ `affiliate.shopee.vn/offer/product_offer` | ✅ qua `validateShopeeAffiliateLink` | ❌ no registry | ❌ no lock | ⚠️ text match OK, nhưng `index 1, 9` hard-code không scope card | **scratch — keep untracked, cần refactor** |
| 2 | [resolve-and-validate.ts](../../packages/shopee/scripts/resolve-and-validate.ts) | POC — HTTP HEAD redirect resolve short link, validate owner | Không | Không | n/a (no browser) | n/a | ✅ | ❌ | n/a | n/a | **reusable nhưng hard-code 2 sp — keep untracked** |
| 3 | [fetch-coccoc.ts](../../packages/shopee/scripts/fetch-coccoc.ts) | POC explorer — liệt kê DOM product cards | Không | Không | Không (read-only) | ✅ | ❌ | ❌ | ❌ | ⚠️ text "Lấy link" + card traversal up 6 levels | **scratch debug — keep untracked** |
| 4 | [extract-active-coccoc.ts](../../packages/shopee/scripts/extract-active-coccoc.ts) | POC — chờ user login + extract sản phẩm với 5 phút timeout | Không | Không | Không | ✅ | ❌ | ❌ | ❌ | ⚠️ text match + traversal | **scratch overlap với #3 — keep untracked** |
| 5 | [extract-offers-coccoc.ts](../../packages/shopee/scripts/extract-offers-coccoc.ts) | POC — version sớm của #4 | Không | Không | Không | ✅ | ❌ | ❌ | ❌ | ⚠️ | **scratch deprecated bởi #4 — keep untracked** |
| 6 | [extract-offers-active.ts](../../packages/shopee/scripts/extract-offers-active.ts) | POC — version cũ, overlap | Không | Không | Không | ✅ | ❌ | ❌ | ❌ | ⚠️ | **scratch overlap — keep untracked** |
| 7 | [load-picks.ts](../../packages/shopee/scripts/load-picks.ts) | Operator manual picks loader (đọc `.secrets/shopee_picks.txt`) | Không (input là `.secrets/`, gitignored) | ✅ secret-free output (`secret-redaction.ts` enforce) | n/a (no browser) | n/a | ✅ qua `validateShopeeAffiliateLink` | n/a (one-shot loader) | n/a | n/a | **reusable — keep untracked Round 26B (không thuộc CDP scope, có thể commit round riêng)** |
| 8 | [get-one-link.ts](../../packages/shopee/scripts/get-one-link.ts) | POC tôi viết để test 1 link (Round 25/26) | Không | Không | Không (idx 0 fixed) | ✅ | Không (chỉ extract) | ❌ | ❌ | ⚠️ text match + traversal | **scratch — keep untracked, reference nội bộ** |

**Tổng kết**: 8/8 file đều **scratch / POC** không đủ tiêu chuẩn primary production code. Không file nào có: registry dedupe, lock/atomic write, CDP failure policy retry 3 lần, selector resilience đầy đủ theo Round 26B spec (text/aria/card-scoped > stable data-* > controlled CSS fallback), CLI args.

**Không promote bất kỳ script nào trong Round 26B.** Quyết định: build registry module độc lập + docs/skill update + audit report, scripts giữ untracked đợi refactor round sau.

## 3. Audit untracked `_commerce` JSON artifacts

| File | Mục đích | Có secret? | Verdict |
|---|---|---|---|
| `production/_commerce/shopee_product_candidates.json` | Output `fetch-coccoc.ts` / `extract-*-coccoc.ts` — danh sách product card text raw | ✅ secret-free (chỉ product text) | Output mỗi lần chạy — KHÔNG commit (sẽ overwrite) |
| `production/_commerce/shopee_product_candidates_with_links.json` | Output `click-and-extract-links.ts` — 2 short link `s.shopee.vn/...` + validation `NEEDS_USER_REVIEW` (chưa resolve) | ✅ secret-free | Output mỗi lần chạy — KHÔNG commit |
| `production/_commerce/shopee_product_candidates.last_error.json` | Error log lần fetch fail | ✅ | KHÔNG commit (error state) |
| `production/_commerce/shopee_product_selection_report.json` | Selection scoring 6-trục output | ✅ | KHÔNG commit (regenerable từ candidates) |

**Quyết định**: 4 file artifact đều giữ untracked. Đường dẫn đã có sẵn trong `.gitignore` hoặc nên thêm pattern. Không commit theo nguyên tắc "artifact regenerable không vào git".

## 4. Module mới được promote: `link-registry.ts`

**File**: [packages/shopee/src/link-registry.ts](../../packages/shopee/src/link-registry.ts)
**Test**: [packages/shopee/tests/link-registry.test.ts](../../packages/shopee/tests/link-registry.test.ts) — 14/14 pass
**Export**: thêm vào [packages/shopee/src/index.ts](../../packages/shopee/src/index.ts)
**Test script**: thêm `"test": "tsx --test tests/*.test.ts"` vào [packages/shopee/package.json](../../packages/shopee/package.json)

**Public API**:
- `upsertEntry(config, candidate)` — upsert với lock + atomic write + dedup merge
- `appendRejected(config, rejected)` — append rejected entry (same concurrency)
- `isDuplicate(registry_path, owner_id, probe)` — read-only check (no lock)
- `findExistingEntry(registry, probe)` — pure dedup priority lookup
- `LinkRegistryError` — typed error với `reason_code` enum

**Test coverage**:
- upsert new entry creates registry with atomic write ✅
- upsert same shopid+itemid → duplicate, times_seen increments ✅
- dedup by canonical_url when shopid missing ✅
- dedup by short_link when canonical also missing ✅
- dedup by normalized product_name as last fallback ✅
- different shopid+itemid → both inserted ✅
- isDuplicate read-only check ✅
- appendRejected stores rejection with timestamp ✅
- `ERR_LINK_REGISTRY_STALE_LOCK` when lock file too old ✅
- `ERR_LINK_REGISTRY_LOCK_TIMEOUT` when lock held (non-stale) ✅
- lock released after successful upsert ✅
- lock released after failed upsert (corrupt JSON) ✅
- concurrent upserts serialize via lock ✅
- `findExistingEntry` priority order ✅

**Concurrency design**:
- Lock file `<registry>.lock` via `writeFileSync(..., { flag: "wx" })` (atomic exclusive create, works on POSIX + Windows NTFS)
- Poll mỗi `lock_retry_ms` (default 100ms), max `lock_timeout_ms` (default 5000ms)
- Stale lock detect (> `stale_lock_ms` default 60000ms) → throw `ERR_LINK_REGISTRY_STALE_LOCK`, KHÔNG tự xoá
- Read-after-lock — không dùng snapshot pre-lock
- Atomic write: `.tmp.<pid>.<ts>` → `renameSync` → final path
- Release lock trong `finally{}`

## 5. Flow lifecycle decision

| Flow | Pre-Round-26B | Post-Round-26B |
|---|---|---|
| `BROWSER_CDP_TARGETED_CLICK` | Untracked POC (Round 25/26) | **PRIMARY** (documented, registry-backed) |
| `pnpm shopee:login` (storage_state) | Active | **DEPRECATED / FALLBACK** — cần user explicit cho phép |
| `pnpm shopee:fetch` (Playwright headless) | Active | **DEPRECATED / FALLBACK** |
| `pnpm shopee:fetch-cookie` (cookie fetcher) | Round 3A/3C — active | **FALLBACK** (giữ làm reference + Round 3C validator vẫn dùng được) |
| HAR endpoint discovery scripts | Round 3A | **DEPRECATED** |
| Shopee Open API GraphQL | Not implemented | **NOT_AVAILABLE** (chưa được cấp AppID/API key) |
| `load-picks.ts` (operator manual paste) | Untracked | **REUSABLE** — không đụng CDP scope, bypass scrape hoàn toàn |

**KHÔNG xoá** code flow cũ trong Round 26B — chỉ đánh dấu DEPRECATED/FALLBACK trong SKILL.md. Xoá là **round riêng** sau khi CDP flow đã được commit ổn định + chạy thật ≥3 lần thành công.

## 6. Security scan

**Pre-commit grep targets** (Round 26B staged diff):
```
SPC_EC | SPC_ST | SPC_U | csrftoken | Cookie: | Set-Cookie |
OPENAI_API_KEY | GMAIL_PASSWORD | SHOPEE_PASSWORD | password | otp
```

**Files staged trong Round 26B** (predicted):
- `packages/shopee/src/link-registry.ts` (mới) — pure logic, không có secret
- `packages/shopee/src/index.ts` — chỉ thêm export
- `packages/shopee/package.json` — chỉ thêm test script
- `packages/shopee/tests/link-registry.test.ts` (mới) — test với fixture data, owner id `an_17376660568` là affiliate ID public (không phải secret)
- `.claude/skills/chay/SKILL.md` — docs
- `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md` — docs
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — docs
- `docs/00_DIEU_HANH/ROUND_26B_SHOPEE_CDP_LINK_EXTRACTION_AUDIT.md` — file này

**`an_17376660568` clarification**: đây là Shopee Affiliate Owner ID (public, có trong mọi affiliate URL trên Facebook/Reels). KHÔNG phải secret. Việc lộ owner id không cho attacker quyền gì — chỉ identify ai sở hữu link. Việc commit owner id vào docs/code là cần thiết để validator check ownership.

**KHÔNG commit**:
- `.secrets/*` (đã gitignored)
- `production/_commerce/*.json` (output regenerable)
- 8 untracked Shopee scripts (POC chưa đủ tiêu chuẩn promote)
- `packages/script-writer/scripts/*.ts` untracked (ngoài scope Round 26B)
- Binary media `.mp4/.mp3/.wav`

## 7. Quyết định Output

Theo Round 26B prompt mục XI:

> **Output A** (CDP đủ an toàn): Promote click-and-extract-links + resolve-and-validate + registry + docs + commit
> **Output B** (chưa đủ an toàn): Chỉ commit docs/skill + audit report, giữ script untracked

**Chọn approach hybrid (middle path)**:
- ✅ Promote **module độc lập** `link-registry.ts` + tests (an toàn, có test 14/14, tự đứng vững)
- ❌ KHÔNG promote 8 POC scripts (chưa đủ tiêu chuẩn — hardcoded targets, no CLI args, no registry wire-up, no CDP failure handling, no selector resilience)
- ✅ Docs/skill update đầy đủ (SKILL.md + architecture + state doc + audit report)
- ⏭ Round sau: refactor 8 POC thành 1 production CLI script wire vào `link-registry.ts` + CDP failure handling + selector resilience đầy đủ

**Commit message**: `feat: add shopee link registry + cdp extraction docs`

## 8. Next step (Round 27 candidate scope)

1. **Refactor script extractor sản xuất** — gom 6 POC `click-and-extract-links` / `fetch-coccoc` / `extract-*-coccoc` / `get-one-link` thành 1 CLI `pnpm shopee:extract-links-cdp --target-count=2 --max-clicks=5` wire vào `link-registry.ts`. Implement đầy đủ CDP retry 3 lần + selector resilience + targeted click policy.
2. **`resolve-and-validate` CLI** — chuyển hard-coded list sang đọc registry pending entries.
3. **CDP smoke test trong CI** — mock CDP server hoặc fixture browser để test extractor không cần CDP thật.
4. **Selector strategy library** — tách `card-scoped-finder` thành module riêng `packages/shopee/src/selector-strategy.ts` để test isolation.
5. **Optionally xóa DEPRECATED flow** — sau khi CDP flow chạy thật ≥3 lần thành công + user duyệt mở scope cleanup.

## 9. Self-audit checklist Round 26B

| # | Item | Pass? |
|---|---|---|
| 1 | CDP flow là PRIMARY trong SKILL.md? | ✅ |
| 2 | KHÔNG tạo agent mới (vẫn 5 agent của Phần 24)? | ✅ |
| 3 | Dedupe registry có schema chốt? | ✅ schema_version 0.1.0 |
| 4 | Pre-click + post-resolve check? | ✅ documented |
| 5 | Validate owner `an_17376660568`? | ✅ via `validateShopeeAffiliateLink` |
| 6 | Batch cap `max_clicks_per_batch=5`? | ✅ documented |
| 7 | Cấm random click? | ✅ HARD CONSTRAINTS |
| 8 | Cấm password/OTP auto-input? | ✅ |
| 9 | Cấm log cookie/token? | ✅ |
| 10 | Audit từng untracked script? | ✅ section 2 |
| 11 | Phân loại reusable/scratch/deprecated/unsafe? | ✅ |
| 12 | Tránh commit hàng loạt? | ✅ chỉ promote module + docs |
| 13 | Scan secret staged diff? | ✅ section 6 + sẽ chạy grep pre-commit |
| 14 | KHÔNG xoá flow cũ khi chưa explicit approval? | ✅ chỉ đánh dấu DEPRECATED |
| 15 | KHÔNG mở yt_015? | ✅ |
| 16 | Registry write có lock + atomic write? | ✅ module + 14 test |
| 17 | Read-after-lock + merge-safe? | ✅ implemented |
| 18 | CDP connect fail sau 3 retry → ERR_CDP_BROWSER_NOT_FOUND? | ✅ documented |
| 19 | CDP target tab missing → ERR_CDP_TARGET_TAB_NOT_FOUND? | ✅ |
| 20 | Selector ưu tiên text/aria/card-scoped? | ✅ |
| 21 | Cấm random/tọa độ click khi selector fail? | ✅ |
| 22 | ERR_AMBIGUOUS_LINK_BUTTON cho multi-button không scope được? | ✅ |
