# Round 26 — yt_014 Pattern Promotion Audit

> **Loại tài liệu**: Audit report một lần — đi kèm Round 26 SKILL/architecture/state update.
> **Ngày**: 2026-05-27
> **Branch**: `master`
> **Scope**: promote successful patterns từ yt_014 Shopee-First pilot vào hệ thống chung (docs/skill). Audit thêm 3 untracked scripts chưa cover ở Round 26B. Quyết định: **Output A — Docs/Skill only** (không promote code helper trong Round 26).

---

## 1. Bối cảnh

yt_014 đã chứng minh end-to-end Shopee-First pilot thành công:
- Product Card → Source Match `MATCH_CONFIRMED`
- Script claim-safe → OpenAI subtitle viral rewrite (verified blocklist + fallback safe template)
- Voice + BGM mix → Final Reels 1080×1920 center-crop (`final_reels_v1/yt_014_final_reels_v1.mp4`)
- Overlay timing fix với micro-gap (b3/b4 transition — "ĐỂ BÀN40K GHÊ" artefact đã fix)
- `facebook_reels_publish_plan.json`: `publish_status="not_published"`, `needs_user_review=true`

Round 26 chuẩn hoá các pattern này thành **rule trong SKILL.md** để yt_015+ reuse mà KHÔNG cần re-derive từ chat history.

## 2. File audit (3 untracked chưa cover ở Round 26B)

| # | File | Loại | Hardcoded `yt_014`? | OpenAI key handling? | Promote? | Verdict |
|---|---|---|---|---|---|---|
| 1 | [packages/script-writer/scripts/final-render.ts](../../packages/script-writer/scripts/final-render.ts) | FFmpeg center-crop + drawtext burn-in helper | ✅ default `--video-id yt_014` + hardcode `production/batch_001` path + magic `crop=405:720:437:0` cho source 1280×720 + hardcode `b4 - 0.05` cho block transition + magic `y=450, y=1450` layout | n/a | ❌ | **scratch yt_014-specific — keep untracked. Round 27 refactor: nhận `--video-id`, `--source-width`, `--source-height`, `--micro-gap`, `--overlay-y`, `--subtitle-y` qua args; loại bỏ default yt_014; CLI typing strict; persist `final_render_report.json` với filtergraph log.** |
| 2 | [packages/script-writer/scripts/generate-subtitles.ts](../../packages/script-writer/scripts/generate-subtitles.ts) | OpenAI viral subtitle generator + claim-safety QC + fallback safe template | ✅ hardcode `production/batch_001/yt_014` path + hardcode `video_id: 'yt_014'` trong output JSON + hardcode `b3` fallback string | ✅ env load `OPENAI_API_KEY`, `console.log('API key present: yes (masked)')` — **safe pattern, không log value** | ❌ | **scratch yt_014-specific — keep untracked. Pattern logic GOOD (BANNED_PHRASES + VIRAL_KEYWORDS + runSubtitleQC + fallback) đã promote vào SKILL Section I expanded. Round 27 refactor: tách `BANNED_PHRASES`/`VIRAL_KEYWORDS` ra `packages/script-writer/src/subtitle-blocklist.ts`, expose function thuần nhận `video_id` + `script_data` + `product_card` + `config`. CLI script chỉ là thin wrapper.** |
| 3 | [packages/shopee/scripts/generate-subtitles.ts](../../packages/shopee/scripts/generate-subtitles.ts) | Duplicate gần như identical với #2 nhưng đặt nhầm package | ✅ tương tự #2, hardcode `yt_014` | ✅ tương tự — safe key handling | ❌ | **scratch yt_014-specific + WRONG PACKAGE — keep untracked. Subtitle workflow thuộc Script & Claim Safety Agent (`packages/script-writer/`), KHÔNG thuộc Shopee Product Agent. Round 27: xoá file này sau khi `packages/script-writer/scripts/generate-subtitles.ts` refactor xong.** |

**Tổng kết Round 26 audit (8 file shopee Round 26B + 3 file scope Round 26 = 11 file)**:
- **0/11** file đủ tiêu chuẩn promote nguyên xi (đều hardcode `yt_014` ở mức path/default/block-id/magic offset, vi phạm Round 26 mục IV.4 Hardening).
- **Quyết định**: Output A — Docs/Skill only. **0 code change**, chỉ SKILL.md + architecture + state doc + audit report.
- **Pattern logic đã promote** dưới dạng rule trong SKILL.md (Section I expanded + Section I2 mới + Section I3 mới).

## 3. Pattern promoted vào SKILL.md

| # | Pattern (verified yt_014) | Promoted vào |
|---|---|---|
| A | **Final Reels Render 9:16 center-crop** | Section I2 mới — Audio & Assembly Agent — Final Reels Render Pattern v0: target 1080×1920, no blurred padding layout, decision matrix theo source ratio, helper PHẢI nhận `source_width/height` dynamic, QC checklist (width/height/duration/clipping/streams). |
| B | **Overlay/Subtitle Timing Anti-Overlap + Layout Zones** | Section I3 mới — Overlay/Subtitle Timing Anti-Overlap Rule v0: micro-gap default 0.05s ([0.03, 0.08] range), constant top-of-file `DEFAULT_SUBTITLE_MICRO_GAP_SECONDS = 0.05` HOẶC CLI arg (HARD — không hardcode ẩn). Layout zones: overlay y≈450 top, subtitle y≈1450 bottom, action zone y∈[600,1350] không drawtext, Reels UI safe zone y∈[200,1700]. Filtergraph pattern + QC review tại block transitions. |
| C | **OpenAI Viral Subtitle Workflow expanded** | Section I expanded — bổ sung blocklist 16 banned phrases (synced yt_014 generate-subtitles.ts), 11 viral keyword VN context, `subtitle_overlay_plan.json` schema mở rộng (selected/rejected/all_variants/style_profile/model/generated_at), fallback safe template policy (manual pre-approved khi mọi variant reject, KHÔNG bịa PASS, KHÔNG hợp thức bằng "có thể"/"mình thấy"). |
| D | **Claim Safety blocklist (banned phrases)** | Section I expanded blocklist + GUARD 7 R3 cross-ref + HARD CONSTRAINTS Round 26 (3 bullet OpenAI Subtitle). |
| E | **Publish Plan pattern** (`not_published` + `needs_user_review=true`) | Đã có sẵn từ Phần 23 (FACEBOOK REELS + SHOPEE PUBLISH PLAN v0). Round 26 verify đủ — không cần thêm rule mới. |
| F | **Shopee Commerce targeted-click** | Đã chốt ở Round 26B (Section "SHOPEE CDP TARGETED-CLICK LINK EXTRACTION v0"). Round 26 verify đủ — không cần thêm rule mới. |

## 4. Hardcoded path verification

**Trong helper promoted**: 0 file code được promote trong Round 26 → 0 hardcoded path issue.

**Trong docs SKILL.md**: nhắc `production/batch_001/yt_014/final_reels_v1/yt_014_final_reels_v1.mp4` là **VÍ DỤ output path post-yt_014 verified** (block code ví dụ Section I2 + Section J Auto-Run Controller example). Đây là docs ví dụ minh hoạ, KHÔNG phải hardcoded trong code logic. Phần code/CLI mặc định trong helper future PHẢI dùng `<video_id>` / `<run_id>` placeholder.

**Trong 11 untracked scripts** (đã verify Round 26 + 26B audit):
- Tất cả đều hardcode `production/batch_001/yt_014/...` hoặc `yt_014` default → **giữ untracked, không promote**.

## 5. Micro-gap constant/config verification

**Trong helper promoted**: N/A (không promote code).

**Trong docs SKILL.md Section I3 (Overlay Timing Anti-Overlap Rule)**: rule HARD ghi rõ:
- Constant top-of-file: `const DEFAULT_SUBTITLE_MICRO_GAP_SECONDS = 0.05;`
- HOẶC CLI/function arg: `--micro-gap 0.05` / `microGapSeconds: number`
- CẤM hardcode `0.05` / `0.03` / `0.08` ẩn rải rác trong logic
- Đổi giá trị → đổi MỘT điểm duy nhất

**Trong scratch script `final-render.ts`**: hiện tại có hardcode `end - 0.05` ẩn cho `block_id === 'b4'`. Đây là một lý do **không promote** — Round 27 refactor phải fix.

## 6. Scratch / deprecated / unsafe file handling

Tổng cộng **22 untracked files** trong repo hiện tại:

| Loại | Count | Files | Action |
|---|---|---|---|
| Scratch yt_014-specific (script-writer) | 2 | `final-render.ts`, `generate-subtitles.ts` | **Keep untracked**. Round 27 refactor sang reusable helper. **Không xoá** trong Round 26. |
| Scratch yt_014-specific (shopee wrong package) | 1 | `generate-subtitles.ts` (in shopee package) | **Keep untracked**. Round 27 sẽ xóa sau khi script-writer/generate-subtitles refactor xong. **Không xoá** trong Round 26. |
| POC/scratch CDP shopee (audited Round 26B) | 8 | `click-and-extract-links.ts`, `resolve-and-validate.ts`, `fetch-coccoc.ts`, `extract-active-coccoc.ts`, `extract-offers-coccoc.ts`, `extract-offers-active.ts`, `load-picks.ts`, `get-one-link.ts` | **Keep untracked** (đã audit Round 26B). |
| Scratch download (yt_014 specific) | 1 | `download-and-verify-yt014.ts` | **Keep untracked**. Tên file đã chỉ rõ yt_014-specific. Operator có thể xoá thủ công sau Round 27. **Không xoá** trong Round 26. |
| Runtime output JSON | 4 | `production/_commerce/*.json` (4 file) | **Keep untracked** (regenerable output mỗi lần chạy, đã giải thích Round 26B). |
| Production media/sources untracked | 5+ | `production/batch_001/yt_005/voice_sync_v0_preset1/`, `yt_006/`, `yt_012/voice_sync_v0/`, `yt_014/demo_match/sources/` | **Keep untracked**. Binary media — không commit. |

**Quy tắc Round 26 Hardening (section IV)**: agent KHÔNG được tự ý xóa bằng rm/del/remove. Tất cả file scratch/deprecated/unsafe chỉ được ghi audit + giữ untracked. Round cleanup là round riêng do operator quyết định mở scope.

**Operator có thể tự xoá thủ công sau khi đọc audit này** (nếu muốn dọn workspace):
- `packages/script-writer/scripts/final-render.ts` (yt_014-specific, sẽ refactor Round 27)
- `packages/script-writer/scripts/generate-subtitles.ts` (yt_014-specific, sẽ refactor Round 27)
- `packages/shopee/scripts/generate-subtitles.ts` (wrong package + duplicate, sẽ xoá sau Round 27)
- `packages/shopee/scripts/download-and-verify-yt014.ts` (rõ yt_014-specific)
- `packages/shopee/scripts/get-one-link.ts` (POC 1-product test, đã có pattern Round 26B)

**KHÔNG nên xoá** trong giai đoạn này (vẫn còn giá trị reference cho Round 27 refactor):
- 6 POC Shopee CDP scripts còn lại — pattern source code cần đọc lại khi refactor sang CLI thật.

## 7. Security check (pre-commit grep targets)

**Staged diff Round 26 (predicted)**:
- `.claude/skills/chay/SKILL.md` — docs
- `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md` — docs
- `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — docs
- `docs/00_DIEU_HANH/ROUND_26_YT014_PATTERN_PROMOTION_AUDIT.md` — file này

**Grep targets**:
```
SPC_EC | SPC_ST | SPC_U | csrftoken | Cookie: | Set-Cookie |
OPENAI_API_KEY | GMAIL_PASSWORD | SHOPEE_PASSWORD | password | otp |
api_key=<value> | token=<value> | secret=<value>
```

Tất cả mention `OPENAI_API_KEY` / `password` / `otp` trong docs đều là **tên token** hoặc **nội dung policy cấm** (không phải value). `an_17376660568` là Shopee Affiliate Owner ID public (đã giải thích Round 26B). KHÔNG có actual secret value trong staged diff.

**KHÔNG commit**:
- 11 untracked scripts (đều scratch/POC chưa đủ tiêu chuẩn promote)
- 4 JSON artifacts `production/_commerce/*.json` (runtime output)
- 5+ untracked production media folders (binary)
- Bất kỳ file nào trong `.secrets/`, `.env`

## 8. Quyết định Output

Theo Round 26 prompt mục VI:

> **Output A** — Docs/Skill only: SKILL.md cập nhật pattern chung + VFOS_AGENT_ARCHITECTURE_V0.md cập nhật nếu cần + TRANG_THAI cập nhật Round 26 + audit report nếu cần. Không commit script untracked.

**Chọn Output A**. Lý do:
- 11/11 untracked files đều hardcode `yt_014` path/default/block-id/magic offset → vi phạm Round 26 Hardening mục IV.4.
- 3 file scope Round 26 (`final-render.ts`, 2× `generate-subtitles.ts`) đều chứa magic number `0.05` hardcode trong logic + hardcode block id `'b4'` → vi phạm Round 26 Hardening section III.B.
- Pattern logic (claim-safety blocklist, viral keyword, layout zones, micro-gap, OpenAI subtitle workflow, fallback safe template) đã được **promote vào SKILL.md dưới dạng rule có thể impl lại** trong Round 27.
- Output A an toàn hơn — không phá scripts đang dùng, không commit code chưa đủ tiêu chuẩn, không xóa scratch file.

**Commit message**: `docs: promote yt_014 successful patterns to shared pipeline`

## 9. Next step (Round 27 candidate scope)

1. **Refactor `final-render.ts`** thành reusable helper:
   - CLI args: `--video-id <yt_NNN>`, `--source-width <int>`, `--source-height <int>`, `--micro-gap <float>`, `--overlay-y <int>`, `--subtitle-y <int>`, `--target-width 1080`, `--target-height 1920`.
   - Loại bỏ default `yt_014`.
   - Loại bỏ magic `crop=405:720:437:0` — tính từ args.
   - Loại bỏ hardcode `end - 0.05` cho `b4` — generic anti-overlap loop với constant `DEFAULT_SUBTITLE_MICRO_GAP_SECONDS = 0.05`.
   - Persist `final_render_report.json` với filtergraph log + QC result.
2. **Refactor `generate-subtitles.ts`** (chỉ giữ trong `packages/script-writer/`):
   - Tách `BANNED_PHRASES` + `VIRAL_KEYWORDS` thành module `packages/script-writer/src/subtitle-blocklist.ts`.
   - Expose pure function `generateSubtitleVariants(video_id, script_data, product_card, config)`.
   - CLI thin wrapper nhận `--video-id`, `--model`, `--word-limit`, `--variants-per-block`.
   - Loại bỏ hardcode `'yt_014'`, `'b3'` fallback string.
   - Xoá `packages/shopee/scripts/generate-subtitles.ts` (wrong package duplicate).
3. **Tests cho `subtitle-blocklist.ts`** — unit test BANNED scan / fallback selection / fallback safe template trigger.
4. **Refactor `link-registry.ts` consumer** (Round 26B đã có module, cần CLI script wire vào): combine với refactored `click-and-extract-links` → 1 CLI `pnpm shopee:extract-links-cdp`.
5. **Optionally xoá scratch files** mà operator đã ký approval rõ.

## 10. Self-audit checklist Round 26

| # | Item | Pass? |
|---|---|---|
| 1 | KHÔNG chạy lại yt_014? | ✅ |
| 2 | KHÔNG mở yt_015? | ✅ |
| 3 | KHÔNG commit media binary? | ✅ (staged docs only) |
| 4 | KHÔNG add source/keyframes? | ✅ |
| 5 | Có audit script untracked? | ✅ section 2 (3 file Round 26 + 8 file Round 26B reference) |
| 6 | Phân biệt reusable / scratch / deprecated / unsafe? | ✅ section 6 table |
| 7 | Final render 9:16 pattern vào hệ thống chung? | ✅ SKILL.md Section I2 mới |
| 8 | Overlay anti-overlap rule vào hệ thống chung? | ✅ SKILL.md Section I3 mới |
| 9 | OpenAI viral subtitle + claim-safe workflow vào hệ thống chung? | ✅ SKILL.md Section I expanded |
| 10 | Shopee targeted-click trong Commerce Product Agent? | ✅ đã có Round 26B Section "SHOPEE CDP TARGETED-CLICK..." |
| 11 | Commerce Product Agent là owner của Shopee link extraction? | ✅ |
| 12 | KHÔNG tạo agent mới không cần? | ✅ Audio & Assembly = pipeline step (3.4b clarification) |
| 13 | Commit-only-when-prompted đúng? | ✅ commit message theo prompt mục VIII |
| 14 | Report ngắn và rõ? | ✅ format theo prompt mục VIII |
| 15 | Promote timing helper micro-gap constant/config/argument? | ✅ Section I3 HARD rule + HARD CONSTRAINTS Round 26 (Output A — không promote helper, nhưng rule đã chốt cho Round 27) |
| 16 | Grep loại bỏ hardcoded yt_014 path trong helper promoted? | ✅ 0 helper promoted, audit ghi rõ 11 file fail check |
| 17 | Reusable helper nhận video_id/run_id/path/config động? | ✅ rule HARD cho Round 27 (Output A) |
| 18 | Scratch/deprecated/unsafe giữ untracked + không xoá? | ✅ section 6 |
| 19 | Audit ghi rõ file nào operator có thể tự xoá thủ công sau? | ✅ section 6 (5 file đề xuất + 6 file giữ làm reference) |
| 20 | KHÔNG add hàng loạt untracked scripts? | ✅ 0 untracked script added |
