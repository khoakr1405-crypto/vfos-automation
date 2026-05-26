---
name: chay
description: Chạy VFOS Short-form Affiliate Factory v0 — pipeline yt-dlp → Script Writer → Voice Sync → BGM Mix → preview cho short-form video (15–90s, gadget/đồ gia dụng/đồ bếp) đăng Facebook Reels gắn Shopee Affiliate. (TikTok Shop là future lane — defer, không triển khai trong scope hiện tại). Kích hoạt khi user gõ /chay, /chay <URL video>, hoặc /chay <chỉ thị ngắn>.
---

# Skill: /chay

> **Skill ID**: `chay`
> **Tên logic**: VFOS Short-form Affiliate Production Factory v0
> **Kích hoạt**: User gõ `/chay` (hoặc `/chay <args>`) trong Claude Code
> **Ngôn ngữ**: Trả lời tiếng Việt, technical terms giữ tiếng Anh

---

## MÔ TẢ

`/chay` là nút khởi động **Con số 1 — VFOS Short-form Factory**.

Khi được gọi, agent phải tự hiểu:
- cần đọc Project Memory
- xác định mode từ args
- chạy đúng dây chuyền đã đóng gói, không hỏi lại những thứ đã rõ

Dây chuyền này phục vụ:
- Short-form video (15–90s, portrait 9:16)
- Content-led affiliate **Shopee VN** (TikTok Shop VN là **future lane**, defer — KHÔNG triển khai trong giai đoạn này)
- Ngách: gadget, đồ gia dụng, đồ bếp, satisfying practical content
- Platform target: **Facebook Reels** (TikTok Việt Nam là future lane, defer)

---

## LANE TYPES — Khung đa lane (KHÔNG mutually exclusive)

`/chay` hỗ trợ **3 framing active**, không một framing nào thay thế các framing khác. Ngoài ra có **future lane (defer)** không triển khai trong giai đoạn này.

| Lane | Khởi điểm | Trạng thái | Khi nào dùng |
|---|---|---|---|
| **Video-First / Content-First** | Tìm **video** trước, sau đó **match Shopee affiliate** nếu hợp bối cảnh | **ACTIVE** | Default cho MODE 1/2/3 — content kéo view là trụ chính, affiliate Shopee gắn mềm theo nội dung |
| **Shopee-First** | Chọn **sản phẩm Shopee VN** trước, sau đó **tìm video/demo tương đồng**, output đăng **Facebook Reels** | **ACTIVE (lane chính hiện tại)** | Khi muốn ưu tiên 1 SKU Shopee có hoa hồng/sales tốt, cần content có visual demo khớp đúng sản phẩm. Pipeline output: Facebook Reels + Shopee Affiliate |
| **Content-Led affiliate** (overlay) | Nội dung kéo view là chính, CTA/affiliate gắn mềm chỉ khi hợp bối cảnh | **ACTIVE (triết lý nền)** | Là **triết lý nền** áp dụng cho cả 2 lane trên — không phải lane riêng. Tránh quảng cáo thô (GUARD 7 R5). |
| **TikTok-Shop-First** (TikTok Video → TikTok Shop Affiliate) | Chọn sản phẩm **TikTok Shop** trước, output đăng **TikTok VN** | **FUTURE / DEFER** | **KHÔNG triển khai trong giai đoạn này** (chốt 2026-05-22 Phần 22). Lý do: ưu tiên 1 hướng Shopee + Facebook Reels trước để chứng minh hiệu quả. TikTok Shop tool/scraper/scoring sẽ thiết kế khi user mở lại scope. |

**Quan hệ giữa Lane và Mode**:
- MODE 1/2/3 (no-args/URL/text) chạy theo lane **Video-First** default.
- MODE 4 (Phần 22 pivot) chạy theo lane **Shopee-First**. Trigger `/chay product-first` (không kèm platform) → mặc định route sang Shopee-First trong giai đoạn này (do TikTok Shop defer).
- Cả 2 lane active luôn áp dụng triết lý Content-Led affiliate.
- **KHÔNG hỏi user "Shopee hay TikTok Shop"** trong giai đoạn này — TikTok Shop là future lane, mặc định Shopee.

Chi tiết Shopee-First Lane: xem section **"SHOPEE-FIRST LANE v0"** bên dưới.

---

## BƯỚC 0 — BẮT BUỘC MỖI LẦN CHẠY

Dù ở mode nào, agent phải làm ngay khi nhận `/chay`:

1. Đọc `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
2. Xác định "bước tiếp theo duy nhất" trong memory
3. **Chạy AUTO-RUN CONTROLLER v0** (section ngay bên dưới) để parse args + locked state matrix
4. Nếu controller resolve được `action_taken` rõ → thực hiện. Nếu không → fallback MODE ROUTING.
5. Báo ngắn theo REPORT FORMAT NGẮN (Auto-Run Controller).

---

## AUTO-RUN CONTROLLER v0 (Round 25 — 2026-05-26 Deterministic Routing Hardening)

> **Mục đích**: Giảm tối đa số prompt user phải gõ. `/chay` tự đọc state, tự suy next_agent, tự chạy nếu an toàn — KHÔNG hỏi A/B/C, KHÔNG retry vô hạn, KHÔNG chạy sai lane, KHÔNG publish thật.
>
> **Quan hệ với MODE ROUTING cũ**: Controller chạy TRƯỚC MODE ROUTING. Nếu controller resolve được action (DONE / SUSPENDED / FAIL / SUCCESS-with-next_agent) → dùng kết quả controller. Nếu controller fallthrough (eg input không match alias nào và không có state) → MODE ROUTING cũ vẫn áp dụng.
>
> **Trạng thái triển khai**: spec áp dụng cho monolithic `/chay`. KHÔNG implement code multi-agent trong vòng này (vẫn theo Phần 24 Agent Architecture v0). Controller là **kỷ luật parse args + đọc state** trong skill, không phải thêm code mới.

### A. Command Aliases (HARD ENUM)

| # | Command | Hành vi |
|---|---|---|
| 1 | `/chay` | Auto-detect active video + next_agent. Chạy nếu chỉ một bước hợp lệ và không bị lock. |
| 2 | `/chay status` | Báo trạng thái tổng thể. KHÔNG chạy agent. |
| 3 | `/chay <video_id>` | Tiếp tục video_id đó theo next_agent tự suy ra. |
| 4 | `/chay <video_id> status` | Báo trạng thái video_id đó. KHÔNG chạy. |
| 5 | `/chay plan` | Auto-detect active video + next_agent NHƯNG KHÔNG chạy agent. |
| 6 | `/chay <video_id> plan` | Báo next_agent dự kiến của video_id đó. KHÔNG chạy. |
| 7 | `/chay resume` | Resume `waiting_state` gần nhất nếu có và chưa timeout. |
| 8 | `/chay <video_id> resume` | Resume `waiting_state` của video_id đó nếu có và chưa timeout. |
| 9 | `/chay commit` | Chỉ commit artifact đã pass nếu Git & Artifact Agent rule (Phần 24 mục 6) cho phép. |
| 10 | `/chay stop` | Dừng sạch. KHÔNG chạy tiếp. |
| 11 | `/chay <video_id> --force-retry` | Cho phép retry agent FAILED. Phải ghi `retry_count` + không vượt retry budget. |
| 12 | `/chay <video_id> --reset` | Reset state của video_id chỉ khi an toàn. KHÔNG xóa artifact cũ — chỉ tạo run/state mới. |
| 13 | `/chay shopee <url>` | Cold start Shopee-First lane bằng Commerce Product Agent với link Shopee. |
| 14 | `/chay product <url>` | Alias `/chay shopee <url>` nếu URL là Shopee. |
| 15 | `/chay keywords "<keyword>"` | Cold start product discovery nếu chưa có URL. KHÔNG bịa product data. |

**HARD parse rule**:
- Nếu input KHÔNG match enum trên + không phải URL hợp lệ + không phải free text MODE 3 → trả về `status=FAIL`, `reason_code=ERR_AMBIGUOUS_NEXT_STEP`, KHÔNG đoán.
- `<video_id>` pattern: `yt_NNN` (3 digit hoặc nhiều hơn). Sai pattern → `ERR_AMBIGUOUS_NEXT_STEP`.
- Modifier flags (`--force-retry`, `--reset`) chỉ hợp lệ khi có `<video_id>` cụ thể.

### B. Active Video Priority (khi `/chay` không kèm video_id)

Thứ tự ưu tiên:

1. **`active_video_id` trong `TRANG_THAI_VFOS_HIEN_TAI.md`** (mục 7 "Bước tiếp theo duy nhất" — đọc tên `yt_NNN` đang trạng thái current). Nếu có và hợp lệ → dùng.
2. Nếu không có → scan `production/batch_001/yt_*/` tìm video_id mới nhất có artifact chưa DONE (ưu tiên file mtime gần nhất + `facebook_reels_publish_plan.json` thiếu hoặc `match_result.json` chưa SUCCESS).
3. Nếu **chỉ một candidate hợp lệ** → dùng candidate đó.
4. Nếu **nhiều candidate cùng hợp lệ** → FAIL:
   - `status = FAIL`
   - `reason_code = ERR_AMBIGUOUS_NEXT_STEP`
   - **KHÔNG hỏi A/B/C**. Chỉ báo danh sách candidate + yêu cầu `/chay <video_id>` cụ thể.

Nếu user nhập `/chay <video_id>` rõ ràng → dùng đúng video_id đó. **KHÔNG tự đổi sang video khác** dù memory ghi active là cái khác.

### C. Locked State Matrix (Deterministic Routing)

Controller PHẢI đọc report/state gần nhất theo thứ tự (dừng ngay khi tìm được):

1. `waiting_state.json` nếu có (suspended/pending operator)
2. Latest agent report JSON (per-run artifact)
3. `facebook_reels_publish_plan.json`
4. Final preview path / publish plan path
5. `demo_match/match_result.json`
6. Script/subtitle artifacts (`script_ai_v1_extended.json`, `subtitle_overlay_plan.json`)
7. `shopee_product_card.json` + `demo_match/match_search_plan.json`
8. `TRANG_THAI_VFOS_HIEN_TAI.md` fallback

Trạng thái routing bắt buộc:

| Latest status | Hành động Controller | reason_code |
|---|---|---|
| `SUCCESS` | Đọc `next_agent` trong contract. Nếu hợp lệ + không forbidden → chạy. Missing → suy từ Artifact Matrix. Vẫn không rõ → FAIL. | — / `ERR_NEXT_AGENT_MISSING` |
| `SUCCESS_MATCH_CONFIRMED` | Chuyển Script & Claim Safety Agent nếu chưa có script; có script → Audio & Assembly Agent. KHÔNG hỏi user. | — |
| `SUCCESS_MATCH_NEEDS_REVIEW` | `status=SUSPENDED` + `reason_code=ERR_USER_APPROVAL_REQUIRED`. KHÔNG chạy tiếp. Timeout 30 phút → `FAILED` + `ERR_SYS_EXIT_GATE_TIMEOUT`. | `ERR_USER_APPROVAL_REQUIRED` / `ERR_SYS_EXIT_GATE_TIMEOUT` |
| `SUSPENDED` | Kiểm `waiting_state` timestamp. Còn trong timeout → SUSPENDED + `"Use /chay <video_id> resume after resolving blocker"`. Quá 30 phút → FAILED + `ERR_SYS_EXIT_GATE_TIMEOUT`. KHÔNG chạy agent thường. | `ERR_SYS_EXIT_GATE_TIMEOUT` (nếu timeout) |
| `FAILED` | KHÔNG tự chạy lại agent cũ. `status=FAIL` + `reason_code=ERR_PREVIOUS_RUN_FAILED_LOCKED`. Chỉ unlock bằng `--force-retry` hoặc `--reset`. | `ERR_PREVIOUS_RUN_FAILED_LOCKED` |
| `publish_plan` tồn tại + `publish_status="not_published"` + `needs_user_review=true` + `final_video_path` tồn tại | `status=DONE_WAITING_USER_REVIEW`. KHÔNG render lại. KHÔNG publish. Báo `final_video_path` + manual review step. | — |
| `final_video_path` tồn tại NHƯNG publish_plan thiếu | `next_agent=Publish Plan & Policy Agent` (Facebook Publish Plan Agent). | — |
| `match_result` FAIL / `ERR_SOURCE_NOT_FOUND` | `status=FAIL`. KHÔNG tự search lại nếu không có `--force-retry`. Báo blocker. | `ERR_SOURCE_NOT_FOUND` |

### D. Artifact Matrix (fallback infer next_agent)

Khi không có latest status rõ, suy `next_agent` từ artifact present:

| Có | Chưa có | next_agent / status |
|---|---|---|
| `shopee_product_card.json` + `demo_match/match_search_plan.json` | `demo_match/match_result.json` | **Source Match Agent** (Demo Match Agent) |
| `match_result.json` (MATCH_CONFIRMED) | `script_ai_v1_extended.json` | **Script & Claim Safety Agent** (Script QC Agent) |
| `script_ai_v1_extended.json` + `subtitle_overlay_plan.json` | final preview / `voice_sync_manifest` | **Audio & Assembly Agent** (Voice/BGM/Render) |
| final preview | `facebook_reels_publish_plan.json` | **Publish Plan & Policy Agent** (Facebook Publish Plan Agent) |
| `facebook_reels_publish_plan.json` (`not_published` + `needs_user_review=true`) | — | `DONE_WAITING_USER_REVIEW` — không chạy thêm |
| `match_result` = FAIL | — | `FAIL_SOURCE_NOT_FOUND` — không tự retry nếu không `--force-retry` |
| `match_result` = SUSPENDED | — | `SUSPENDED` — cần resume/unblock |
| Final video path tồn tại + publish_plan trỏ đúng path | — | `DONE_WAITING_USER_REVIEW` — KHÔNG render lại |

### E. No Rerender Rule (HARD)

Nếu final video tồn tại VÀ `facebook_reels_publish_plan.json` trỏ đúng `final_video_path`:

- **KHÔNG** render lại
- **KHÔNG** chạy Audio & Assembly Agent lại
- **KHÔNG** sửa subtitle/script
- `status = DONE_WAITING_USER_REVIEW`

Chỉ rerender khi user gõ explicit:
- `/chay <video_id> rerender`
- `/chay <video_id> final-reels-render`
- Hoặc task explicit có chữ "rerender" / "render lại" / "render mới"

### F. Infinite Loop Prevention (HARD)

Nếu một agent đã FAILED ở run hiện tại, `/chay` thường **KHÔNG** được kích hoạt lại agent đó. Áp dụng cho mọi reason_code, đặc biệt:

- `ERR_SCR_MAJOR_TIMING_OVERFLOW`
- `ERR_SOURCE_NOT_FOUND`
- `ERR_SOURCE_DOWNLOAD_FAILED`
- `ERR_RENDER_QC`
- `ERR_OPENAI_API_KEY_MISSING`
- `ERR_VOICE_SYNC`
- `ERR_SHOPEE_THROTTLED`

Khi user gõ lại `/chay <video_id>` mà latest state FAILED:
- `status = FAIL`
- `reason_code = ERR_PREVIOUS_RUN_FAILED_LOCKED`
- `action_taken = none`
- `next_step_short = "Use --force-retry or --reset if operator intentionally wants retry."`

Retry CHỈ được phép khi:
1. User dùng `--force-retry`
2. `retry_count` chưa vượt `max_retry`
3. Blocker KHÔNG thuộc loại **hard forbidden**: secret leak, publish permission, auth required chưa resolved.

**Retry metadata bắt buộc** (ghi vào artifact retry log của run):
- `previous_failed_agent`
- `previous_reason_code`
- `retry_count`
- `retry_allowed: true/false`
- `force_retry_used: true/false`

Cấm: gọi API vô tội vạ, retry OpenAI/ElevenLabs/yt-dlp/ffmpeg vô hạn, spam network.

### G. Cold Start Logic

Khi KHÔNG có artifact/report nào trong:
- `production/_runs/<run_id>/` (SoT mới, Phần 24)
- HOẶC `production/batch_001/<video_id>/` (pre-migration)

Controller KHÔNG được báo "thiếu artifact" ngay. Phải phân biệt input:

1. **Có Shopee URL** (`/chay shopee <url>` / `/chay product <url>` / `/chay <video_id> shopee <url>`):
   → Cold Start Commerce Product Agent (Shopee Product Agent).
   → Link-first flow: resolve link → validate affiliate owner → create Product Card → 6-trục scoring.
   → `PRODUCT_SELECTED` → tạo `match_search_plan`.
   → Không đủ data → `PRODUCT_NEEDS_USER_REVIEW` / FAIL rõ.

2. **Có keyword** (`/chay keywords "<keyword>"`):
   → Product Discovery Mode.
   → KHÔNG bịa product data.
   → Không tìm được product đủ data → `FAIL` + `ERR_PRODUCT_DATA_INSUFFICIENT`.

3. **Không URL, không keyword, không active video**:
   → `status = FAIL`
   → `reason_code = ERR_COLD_START_INPUT_MISSING`
   → `action_taken = none`
   → `next_step_short = "Provide Shopee link using /chay shopee <url> or set active_video_id."`
   → **KHÔNG hỏi A/B/C**.

### G2. Path Resolution / Migration Compatibility (Round 25B hardening)

> **Lý do**: Phần 24 chốt SoT mới `production/_runs/<run_id>/` nhưng pipeline code chưa migrate. yt_005..yt_014 vẫn nằm ở `production/batch_001/<video_id>/`. Controller phải đọc cả 2 vùng, không được chỉ scan `batch_001`.

Orchestrator hỗ trợ ĐỒNG THỜI 2 vùng artifact:

1. **New Source of Truth namespace**: `production/_runs/<run_id>/`
2. **Legacy compatibility namespace**: `production/batch_001/<video_id>/`

Khi user nhập một trong:
- `/chay`
- `/chay <video_id>`
- `/chay status`
- `/chay <video_id> status`
- `/chay plan`
- `/chay <video_id> plan`

Controller PHẢI:

**A. Scan cả 2 vùng**:
- `production/_runs/<run_id>/`
- `production/batch_001/yt_*/`

KHÔNG được chỉ scan `batch_001`.

**B. Run registry / run_manifest ưu tiên**:
Nếu có run registry hoặc `run_manifest` trong `production/_runs/` → ưu tiên đọc state/report trong `_runs` trước.

**C. Fallback**:
Nếu không có `_runs` tương ứng → fallback đọc `production/batch_001/<video_id>/`.

**D. Cùng video_id ở cả 2 nơi**:
- `_runs` là SoT ưu tiên.
- `batch_001` chỉ là compatibility fallback hoặc media/output slot.
- KHÔNG merge mù quáng artifact từ 2 nơi nếu conflict.

**E. Conflict detection (HARD)**:
Nếu `_runs` state và `batch_001` artifact conflict (ví dụ `_runs` ghi FAILED nhưng `batch_001` có publish_plan SUCCESS):
- `status = FAIL`
- `reason_code = ERR_STATE_CONFLICT`
- `action_taken = none`
- Báo rõ path nào conflict.
- **KHÔNG hỏi user A/B/C**.

**F. Report luôn ghi rõ namespace mode**:
- `state_source_path`: path đọc state (eg `production/_runs/yt_014_20260526_141600/reports/latest.json` hoặc `production/batch_001/yt_014/facebook_reels_publish_plan.json`)
- `artifact_source_path`: path artifact upstream (Card, script, voice manifest…)
- `namespace_mode`: `runs_sot` | `batch_legacy` | `mixed_conflict`

Trạng thái namespace_mode:

| Mode | Khi nào |
|---|---|
| `runs_sot` | Đọc thành công từ `_runs/<run_id>/` |
| `batch_legacy` | `_runs` không có entry tương ứng → fallback `batch_001/<video_id>/` |
| `mixed_conflict` | Cả 2 nơi cùng có nhưng conflict → kèm `ERR_STATE_CONFLICT` |

### G3. Resume Timeout Semantics (Round 25B hardening)

> **Lý do**: Section C bảng "SUSPENDED" đã nói timeout 30 phút, nhưng chưa rõ `/chay resume` xử lý sao khi state đã quá hạn. Patch này khoá semantics: **resume KHÔNG có quyền vượt timeout**.

Khi user gọi `/chay resume` hoặc `/chay <video_id> resume`, Controller PHẢI:

1. **Tìm waiting_state gần nhất** (theo Locked State Matrix priority — `waiting_state.json` trong `_runs/<run_id>/` hoặc `batch_001/<video_id>/`).

2. **Kiểm timeout** theo thứ tự field:
   - `expires_at` (ISO 8601) nếu có
   - `timeout_minutes` nếu có (relative to `created_at`)
   - `created_at` + default timeout = **30 phút**

3. **Còn hạn** (`now < expires_at`):
   - Resume đúng `blocking_agent` hoặc `next_agent` đã ghi trong waiting_state.
   - `action_taken = resumed <agent>`.

4. **Quá hạn** (`now >= expires_at`):
   - **KHÔNG** resume.
   - **KHÔNG** tự reset.
   - **KHÔNG** tự force-retry.
   - `status = FAIL`
   - `reason_code = ERR_RESUME_EXPIRED_STATE` (nếu chưa được chuyển FAILED_TIMEOUT) hoặc `ERR_SYS_EXIT_GATE_TIMEOUT` (nếu state đã transition sang FAILED_TIMEOUT trước đó)
   - `action_taken = none`
   - `next_step_short = "Use /chay <video_id> --reset or explicit --force-retry after reviewing stale state."`

**Run đã FAILED_TIMEOUT** (waiting_state đã transition):
- `/chay <video_id> resume` PHẢI **từ chối khôi phục** → trả `ERR_SYS_EXIT_GATE_TIMEOUT`.
- Chỉ `/chay <video_id> --reset` mới tạo run/state mới (Section G — Cold Start path / new run_id).
- `--force-retry` chỉ được dùng nếu blocker đã được operator xử lý rõ (eg cookie refresh, API key set lại) và **KHÔNG** unlock một timeout state đã chết — vẫn cần `--reset` trước nếu muốn restart từ đầu.

### G4. Command Precedence / No Rerender Override Rule (Round 25B hardening)

> **Lý do**: Section E (No Rerender Rule) và Section A (`--force-retry` / `--reset` / `rerender`) cần thứ tự ưu tiên rõ ràng để không loophole: ví dụ user gõ `--force-retry` cho video đã DONE → không được tự rerender.

**Thứ tự ưu tiên lệnh (cao → thấp)**:

| Rank | Lệnh | Quyền |
|---|---|---|
| 1 | `/chay <video_id> --reset` | Explicit reset — tạo run/state mới, KHÔNG xoá artifact cũ. Bypass mọi lock. |
| 2 | `/chay <video_id> rerender` / `/chay <video_id> final-reels-render` / task có chữ "rerender" / "render lại" / "tạo lại final" | Explicit rerender — bypass No Rerender Rule. |
| 3 | `/chay <video_id> --force-retry` | Explicit force retry — chỉ retry agent FAILED. KHÔNG bypass No Rerender. |
| 4 | `/chay plan` / `/chay status` / `/chay <video_id> plan` / `/chay <video_id> status` | Read-only — không chạy agent, không sửa state. |
| 5 | `/chay` / `/chay <video_id>` | Normal auto-run — phụ thuộc Locked State Matrix. |

**No Rerender Rule mặc định** (đã có ở Section E, nhắc lại):
- `final_video_path` tồn tại + `facebook_reels_publish_plan.json` trỏ đúng final video → normal `/chay` (rank 5) KHÔNG được render lại → `status = DONE_WAITING_USER_REVIEW`.

**`--force-retry` KHÔNG tự động bypass No Rerender (HARD)**:
- `--force-retry` chỉ retry agent đang ở trạng thái FAILED trong run hiện tại.
- Nếu video đã `DONE_WAITING_USER_REVIEW` (final + publish_plan trỏ đúng), `--force-retry` PHẢI báo:
  - `status = FAIL`
  - `reason_code = ERR_FINAL_VIDEO_EXISTS_NO_RERENDER`
  - `action_taken = none`
  - `next_step_short = "Use explicit rerender or --reset if operator wants a new final video."`

**Chỉ các lệnh sau mới bypass No Rerender**:
- `/chay <video_id> rerender`
- `/chay <video_id> final-reels-render`
- `/chay <video_id> --reset` (qua đường tạo run mới)
- Prompt explicit yêu cầu render lại bằng chữ rõ ("rerender", "render lại", "tạo lại final")

Nếu controller phát hiện rerender command nhưng KHÔNG có rerender keyword + KHÔNG có `--reset`:
- `status = FAIL`
- `reason_code = ERR_RERENDER_REQUIRES_EXPLICIT_COMMAND`
- `next_step_short = "Send /chay <video_id> rerender or /chay <video_id> --reset to override."`

**Rerender behavior (HARD)**:
1. **KHÔNG xoá final cũ** — final_reels_v1, final_reels_v2 giữ nguyên trên disk làm history.
2. **Tạo version mới**: `v2_3`, `v3`, hoặc `run_id` mới (nếu chạy qua `_runs/`).
3. **Update `publish_plan`** CHỈ sau khi QC PASS.
4. **Nếu QC FAIL** → giữ `publish_plan` trỏ về bản final cũ đang pass. KHÔNG mất publish-ready state.

### H. Permission Boundary mặc định (Auto-Run Controller scope)

**Allowed**:
- Đọc artifact
- Chạy agent kế tiếp nếu trong scope của Locked State Matrix
- Tạo JSON/MD artifact trong video_id hiện tại
- Search / download / extract nếu agent tương ứng cần và không bị cấm rõ
- Render preview nếu Audio & Assembly Agent được `next_agent` rõ
- Dùng OpenAI API cho subtitle/script nếu `OPENAI_API_KEY` present VÀ task thuộc Script & Claim Safety Agent
- Dùng targeted browser click trong Commerce Product Agent NẾU user đã login thủ công và task cho phép

**Forbidden** (HARD — vi phạm = FAIL):
- KHÔNG publish Facebook thật
- KHÔNG gọi Facebook live publish API
- KHÔNG dùng Shopee/Facebook cookie nếu chưa được phép rõ
- KHÔNG nhập password / OTP
- KHÔNG lưu password vào `.env`
- KHÔNG in cookie / token / API key (kể cả masked > 12 char)
- KHÔNG `git clean` / `git reset --hard` / `git stash` / `git push --force`
- KHÔNG commit trừ khi lệnh là `/chay commit` HOẶC prompt user cho phép rõ (Phần 24 Git Agent rule)
- KHÔNG mở Con số 2
- KHÔNG đổi sản phẩm nếu current product đang active
- KHÔNG hỏi user A/B/C
- KHÔNG retry vô hạn
- KHÔNG random click tự do trên dashboard thật

### I. OpenAI Viral Content Style Policy (Script & Claim Safety Agent)

> **Áp dụng cho**: Script QC Agent (alias **Script & Claim Safety Agent** sau Round 25) khi viết voice script / caption / subtitle / overlay text. Bổ sung GUARD 7 R3/R5 — KHÔNG thay thế.

**Style mục tiêu** (viral nhưng claim-safe):
- Hài hước, vui tươi, dí dỏm
- Hơi bá đạo (cheeky), bắt trend nhẹ
- Câu ngắn dễ đọc trên Reels (3–7 từ / dòng subtitle)
- Nhiều keyword có khả năng viral nhưng KHÔNG spam
- Giữ chất review tự nhiên, KHÔNG quảng cáo thô

**Keyword strategy**:
- Dùng keyword sản phẩm thật (tên SKU, tính năng quan sát được)
- Dùng keyword ngữ cảnh VN: "góc học tập", "dân văn phòng", "mùa nóng", "gadget mini", "món lạ Shopee", "dưới 40k", "test thực tế"
- KHÔNG nhồi hashtag hoặc keyword vô nghĩa

**Hard claim-safety BLOCKLIST** (subtitle/script chứa = REJECT variant):

| Banned phrase | Lý do |
|---|---|
| "an toàn tuyệt đối" | absolute claim |
| "không bao giờ kẹt tóc / kẹt tay / bị kẹt" | absolute negative claim |
| "mát như điều hòa" | misleading comparison |
| "siêu mạnh nhất" / "tốt nhất" / "rẻ nhất" / "số 1" / "duy nhất" | banned absolute (đã có trong GUARD 7 R3) |
| "pin trâu cả ngày" | unverifiable spec |
| "thay thế điều hòa" | misleading product claim |
| "trị bệnh / làm đẹp / sức khỏe" (không có bằng chứng) | medical/health claim |

**OpenAI subtitle workflow (Script & Claim Safety Agent)**:
1. OpenAI tạo N variant (eg N=3..5).
2. Agent PHẢI scan từng variant với blocklist trên + GUARD 7 R3/R5.
3. Reject variant có claim rủi ro. **KHÔNG được ghi `"0 rejected"` nếu thực tế có variant rủi ro** — phải log đúng `rejected_count`.
4. Selected subtitle PHẢI ưu tiên observable facts ("không thấy cánh", "test bằng giấy", "để bàn gọn").
5. Nếu OpenAI tạo câu hay nhưng rủi ro → **reject, KHÔNG tự hợp thức hóa** bằng cách thêm "có thể" / "mình thấy" để né (đó là loophole).

**Ví dụ style tốt** (claim-safe + viral tone):
- "Ủa quạt gì mà không thấy cánh?"
- "Test bằng giấy cho khỏi nói điêu"
- "Không lộ cánh — nhìn hơi ảo nha"
- "Để bàn gọn ghê"
- "Dưới 40k mà có trò hay phết"

**Subtitle metadata bắt buộc ghi** (vào `subtitle_overlay_plan.json` hoặc artifact tương ứng):
```
{
  "variants_generated": <int>,
  "variants_rejected": <int>,
  "rejection_reasons": [{"variant_id": "...", "reason": "banned absolute: 'tốt nhất'"}, ...],
  "selected_variant_id": "...",
  "claim_safety_pass": true
}
```

### J. Report Format ngắn (Auto-Run Controller default output)

Mỗi lần `/chay` chạy xong CHỈ báo ngắn (8 field core + 3 path field Round 25B):

```
1.  detected_video_id        : yt_NNN
2.  state_source_path        : <path đọc state — eg production/_runs/<run_id>/reports/latest.json>
3.  artifact_source_path     : <path artifact upstream — eg production/batch_001/<video_id>/>
4.  namespace_mode           : runs_sot | batch_legacy | mixed_conflict
5.  detected_next_agent      : <agent name | none>
6.  action_taken             : ran <agent> | none | reported_only | resumed | committed | stopped
7.  status                   : SUCCESS | FAIL | SUSPENDED | DONE | DONE_WAITING_USER_REVIEW
8.  reason_code              : <code | null>
9.  output_artifacts         : [paths…]
10. next_step_short          : <one line>
11. git_status_summary       : clean | <N modified, M untracked>
```

**Ví dụ `/chay yt_014 plan`** (post-Round 25B):

```
detected_video_id        : yt_014
state_source_path        : production/batch_001/yt_014/facebook_reels_publish_plan.json
artifact_source_path     : production/batch_001/yt_014/
namespace_mode           : batch_legacy
detected_next_agent      : none
action_taken             : none
status                   : DONE_WAITING_USER_REVIEW
reason_code              : null
output_artifacts         : [production/batch_001/yt_014/final_reels_v1/yt_014_final_reels_v1.mp4,
                           production/batch_001/yt_014/facebook_reels_publish_plan.json]
next_step_short          : User review/manual publish.
git_status_summary       : clean
```

KHÔNG báo cáo dài trừ khi:
- `status = FAIL`
- `status = SUSPENDED`
- Security issue (cookie leak, secret in staging, publish API call attempted)
- User yêu cầu chi tiết (`/chay <video_id> status`)

Khi `status = DONE_WAITING_USER_REVIEW` báo thêm:
- `final_video_path`
- `caption_draft`
- `affiliate_link` (hoặc `"needs_user_input"`)
- `publish_status`
- `next_step_short = "User review/manual publish"`

### K. Reason Codes (canonical enum)

**SYSTEM**:
- `ERR_AMBIGUOUS_NEXT_STEP` — nhiều candidate cùng hợp lệ / args không match enum
- `ERR_COLD_START_INPUT_MISSING` — không URL, không keyword, không active video
- `ERR_NEXT_AGENT_MISSING` — latest SUCCESS nhưng contract thiếu `next_agent` + artifact matrix không suy ra được
- `ERR_PREVIOUS_RUN_FAILED_LOCKED` — agent FAILED ở run hiện tại, cần `--force-retry` / `--reset`
- `ERR_SYS_EXIT_GATE_TIMEOUT` — `waiting_state` quá 30 phút hoặc timeout_policy (state đã transition FAILED_TIMEOUT)
- `ERR_RESUME_EXPIRED_STATE` — resume gọi vào waiting_state đã quá hạn nhưng chưa transition FAILED_TIMEOUT (Round 25B)
- `ERR_RETRY_BUDGET_EXHAUSTED` — `retry_count` vượt `max_retry`
- `ERR_OPENAI_API_KEY_MISSING` — script/subtitle workflow cần key nhưng `OPENAI_API_KEY` không set
- `ERR_USER_APPROVAL_REQUIRED` — `MATCH_NEEDS_REVIEW` / publish review pending
- `ERR_STATE_CONFLICT` — `_runs` state và `batch_001` artifact mâu thuẫn (Round 25B path resolution)
- `ERR_RERENDER_REQUIRES_EXPLICIT_COMMAND` — rerender intent phát hiện nhưng thiếu lệnh explicit `rerender` / `final-reels-render` / `--reset` (Round 25B)

**SCRIPT**:
- `ERR_SCR_MAJOR_TIMING_OVERFLOW` — block budget overflow >2 từ ở CTA hoặc Voice Sync MAJOR sau remediation
- `ERR_SUBTITLE_CLAIM_RISK` — subtitle variant chứa banned claim (blocklist Section I)

**RENDER**:
- `ERR_FINAL_VIDEO_EXISTS_NO_RERENDER` — yêu cầu render nhưng final video đã tồn tại, cần lệnh rerender explicit
- `ERR_RENDER_QC_FAILED` — ffmpeg QC fail (streams / duration mismatch / clipping)

**COMMERCE**:
- `ERR_PRODUCT_DATA_INSUFFICIENT` — Discovery Mode không tìm được product đủ field
- `ERR_AFFILIATE_OWNER_MISMATCH` — affiliate link verify owner mismatch
- `ERR_AUTH_REQUIRED` — Shopee/Facebook auth chưa resolved
- `ERR_SOURCE_NOT_FOUND` — Demo Match không tìm được clip nguồn tương đồng
- `ERR_SOURCE_DOWNLOAD_FAILED` — yt-dlp / download fail
- `ERR_SHOPEE_THROTTLED` — Shopee API rate limit / 403

**COMMERCE — CDP Targeted Click (Round 26B)**:
- `ERR_CDP_BROWSER_NOT_FOUND` — CDP connect fail sau 3 retry tại 127.0.0.1:9222
- `ERR_CDP_TARGET_TAB_NOT_FOUND` — không tìm thấy tab `affiliate.shopee.vn/offer/product_offer`
- `ERR_LINK_BUTTON_NOT_FOUND` — không tìm thấy "Lấy link" button qua selector strategy
- `ERR_AMBIGUOUS_LINK_BUTTON` — nhiều button match, không scope được product card
- `ERR_MODAL_UNRECOGNIZED` — modal hiện ra nhưng không có URL Shopee
- `ERR_DUPLICATE_PRODUCT_LINK` — entry đã có trong registry (SKIPPED_DUPLICATE)

**COMMERCE — Link Registry (Round 26B)**:
- `ERR_LINK_REGISTRY_LOCK_TIMEOUT` — không acquire lock trong timeout
- `ERR_LINK_REGISTRY_STALE_LOCK` — lock cũ hơn `stale_lock_ms`
- `ERR_LINK_REGISTRY_WRITE_FAILED` — atomic rename / JSON sanity fail
- `ERR_LINK_REGISTRY_MISSING` — registry path không tồn tại khi cần read

### L. Self-Apply checklist (Controller chạy trước khi báo kết quả)

```
[ ] Đã parse args theo Command Aliases (Section A)? Args không match → ERR_AMBIGUOUS_NEXT_STEP?
[ ] Nếu /chay không args → đã xác định active_video_id (Section B) hoặc FAIL?
[ ] Đã đọc state theo Locked State Matrix (Section C) theo đúng thứ tự ưu tiên?
[ ] Đã scan CẢ production/_runs/ và production/batch_001/ (Section G2)? Conflict → ERR_STATE_CONFLICT, không hỏi A/B/C?
[ ] Đã ghi state_source_path + artifact_source_path + namespace_mode trong report (Section J)?
[ ] Nếu /chay resume → đã kiểm timeout (Section G3)? Quá hạn → ERR_RESUME_EXPIRED_STATE / ERR_SYS_EXIT_GATE_TIMEOUT, không tự reset?
[ ] Command precedence (Section G4) — --reset > rerender > --force-retry > plan/status > normal — có đúng thứ tự?
[ ] --force-retry trên video DONE_WAITING_USER_REVIEW → ERR_FINAL_VIDEO_EXISTS_NO_RERENDER, KHÔNG tự rerender?
[ ] Rerender intent thiếu lệnh explicit → ERR_RERENDER_REQUIRES_EXPLICIT_COMMAND?
[ ] Nếu rerender → tạo version mới (v2_3 / v3 / run_id mới), KHÔNG xoá final cũ?
[ ] Nếu FAILED ở run hiện tại → đã chặn bằng ERR_PREVIOUS_RUN_FAILED_LOCKED (Section F)?
[ ] Nếu final video + publish_plan tồn tại → đã trả DONE_WAITING_USER_REVIEW (Section E), KHÔNG rerender?
[ ] Nếu cold start không input → ERR_COLD_START_INPUT_MISSING (Section G), KHÔNG hỏi A/B/C?
[ ] Action_taken không vi phạm Permission Boundary (Section H)?
[ ] Nếu chạy Script & Claim Safety Agent → đã apply blocklist (Section I), log rejected_count thật?
[ ] Report 11 field ngắn (Section J — 8 core + 3 path) — không báo dài khi không cần?
[ ] reason_code (nếu có) thuộc canonical enum (Section K)?
[ ] Commit CHỈ khi /chay commit hoặc prompt rõ (Phần 24 mục 6) — KHÔNG tự commit "vì đã xong"?
```

---

## MODE ROUTING

### MODE 1 — `/chay` (không có args)

**Trigger**: User chỉ gõ `/chay`, không kèm URL hay yêu cầu.

**Hành động**:
1. Đọc memory → xác định bước tiếp theo duy nhất
2. Nếu bước đó thuộc phạm vi Short-form Factory (Script Writer, Voice Sync, BGM Mix, video mới):
   - Tự chạy bước đó, không hỏi lại
3. Nếu bước đó **ngoài** phạm vi Short-form Factory (publish, text overlay, watermark, longform, router...):
   - **Không tự ý làm**
   - Báo: "Bước tiếp theo trong memory là: [X]. `/chay` hiện đóng gói cho Short-form Factory — bước này nằm ngoài phạm vi. Bạn muốn tiếp tục theo mode nào?"

**Phạm vi Short-form Factory** (có thể tự chạy):
- Tìm/tải video nguồn mới
- Phân tích scene / tạo scene_input.json
- Chạy AI Script Writer
- Chạy Voice Sync
- Chạy BGM Mix
- QC + render preview

**AUTO-DECISION POLICY (no-args /chay) — v1**

Khi `/chay` được gọi không args VÀ Project Memory đã ghi next step rõ (ví dụ "chạy yt_008", "generalization test qua /chay", "không dùng lại yt_007"):

- **KHÔNG hỏi** user các câu sau:
  - "chọn mode nào"
  - "chọn ngách nào"
  - "chọn candidate nào"
- Tự quyết định toàn bộ:
  1. Chọn auto-source mode (≡ MODE 3) nếu memory không kèm URL cụ thể.
  2. Chọn lane/ngách theo Project Memory hoặc CHANNEL/LANE PROFILE bên dưới.
  3. Search candidate.
  4. **Chấm điểm candidate** trên 6 trục:
     - source quality (resolution, FPS, codec)
     - visual clarity (đủ sáng, sản phẩm rõ trong frame)
     - viral signal (view count, watch time, engagement nếu lấy được)
     - lane relevance (match đúng lane đang nhắm)
     - **GUARD 6 visual safety risk** (logo/brand/watermark, QR/mã vạch, biển số/PII)
     - affiliate / content-led suitability (sản phẩm phổ thông VN, có trên Shopee VN)
  5. Tự chọn candidate tốt nhất nếu đạt threshold.
  6. Nếu fail threshold → trigger AUTO-SOURCE RETRY POLICY (xem MODE 3), KHÔNG hỏi user ngay.

**CHỈ được hỏi user trong các trường hợp sau**:
- Sau 3 vòng auto-source retry vẫn không có candidate đạt threshold.
- Cần đổi chiến lược lớn (memory mâu thuẫn, không có lane khả thi).
- Rủi ro cao không thể tự xử lý (toàn bộ candidate đều fail visual safety và không repair sạch).
- Cần publish thật (publish vẫn ngoài scope `/chay`).
- Hành động destructive / config / security (sửa config, secret access, rm/reset, push --force).

---

### MODE 2 — `/chay <URL>`

**Trigger**: Args là một URL hợp lệ (http/https, YouTube, TikTok...).

**Hành động — chạy full pipeline từ URL đó**:
1. Audit URL: kiểm tra video có phù hợp không
   - Portrait hoặc có thể crop? Duration 15–90s?
   - Nếu không phù hợp: báo lý do, hỏi user có muốn tiếp tục không
2. Tải video với yt-dlp (format: best ≤1080p, mp4)
3. Đặt vào `production/batch_001/<video_id>/`
4. Chạy pipeline đầy đủ (xem WORKFLOW bên dưới)

---

### MODE 3 — `/chay <yêu cầu ngắn>` (HOẶC tự kích hoạt từ MODE 1 auto-decision)

**Trigger**:
- Args là text không phải URL (ví dụ: "tự tìm video mới", "tìm gadget bếp viral").
- HOẶC MODE 1 không args + memory ghi rõ next step là video mới → tự routing sang MODE 3.

**Hành động — Auto-source mode**:
1. Hiểu yêu cầu / đọc memory → xác định tiêu chí tìm kiếm + lane từ CHANNEL/LANE PROFILE.
2. Tìm candidate video phù hợp (YouTube Shorts, TikTok TQ, Douyin reup, etc.).
3. Đánh giá shortlist trên 6 trục (xem MODE 1 AUTO-DECISION POLICY chấm điểm).
4. **AUTO-SOURCE RETRY POLICY** — Nếu candidate fail GUARD 6 (visual safety) HOẶC không đạt source threshold (resolution thấp, blur, không portrait, off-topic lane, off-Shopee-VN):
   a. **KHÔNG hỏi user ngay.**
   b. Tự ghi reject reason vào báo cáo nội bộ.
   c. Đổi keyword / search strategy dựa trên lý do fail. Mapping mẫu:
      | Lý do fail | Keyword/strategy điều chỉnh |
      |---|---|
      | Tool công nghiệp / landscaping / outdoor work | indoor / home / organizer / household / kitchen |
      | Biển số xe / outdoor / street | tránh outdoor/street/car/landscaping, ưu tiên indoor demo |
      | Brand logo / watermark lớn không repair được | demo clean, "no logo", "no watermark", studio shot |
      | Không match Shopee VN | product phổ thông: organizer, kitchen gadget, cleaning indoor, home life-hack |
      | Lane drift (ngoài lane đang nhắm) | bám sát keyword lane: gadget bếp / đồ gia dụng / cleaning indoor / organizer |
   d. Search tiếp **tối đa 3 vòng** (1 initial + 2 retry).
   e. Mỗi vòng PHẢI dựa vào lý do fail vòng trước để cải thiện keyword, không retry cùng query.
   f. Sau 3 vòng vẫn không có candidate đạt threshold → mới trình shortlist + reject log cho user duyệt. Đây là exit hợp lệ duy nhất để hỏi user ở giai đoạn sourcing.
5. Nếu có ≥1 candidate đạt threshold → tải video tốt nhất và chạy pipeline đầy đủ (KHÔNG hỏi user xác nhận candidate).
6. Không giả vờ "đã xem" nếu không xem được thực sự — mô tả evidence thật (metadata, thumbnail, duration, visual keyframes).

---

### MODE 4 — `/chay shopee-first [<args>]` (Shopee-First Lane)

**Trigger** (tất cả route về Shopee-First trong giai đoạn này):
- `/chay shopee-first` — **auto Shopee product discovery**: agent tự tìm sản phẩm Shopee VN tiềm năng theo lane
- `/chay shopee-first <link Shopee>` — link sản phẩm cụ thể (user dán, skip discovery)
- `/chay product-first shopee` — đồng nghĩa với `/chay shopee-first`
- `/chay facebook shopee` — đồng nghĩa, nhấn mạnh Facebook Reels + Shopee
- `/chay làm video Facebook Reels gắn Shopee`
- `/chay product-first` — **route mặc định sang Shopee-First** (TikTok Shop defer ở Phần 22)
- `/chay tìm sản phẩm Shopee trước`
- `/chay chọn sản phẩm trước, video sau`
- `/chay chọn product trước, video sau`

**Hành động**: chuyển sang **Shopee-First Lane** — tìm sản phẩm Shopee VN trước, video/demo sau, output cho Facebook Reels + Shopee Affiliate. Workflow chi tiết: xem section **"SHOPEE-FIRST LANE v0"** + **"SHOPEE PRODUCT DISCOVERY MODE v0"** bên dưới.

**Tóm tắt thứ tự**:
1. **Auto Shopee product discovery** (no-link) HOẶC parse link Shopee user dán → chốt 1 sản phẩm candidate.
2. Tạo **Shopee Product Card** đầy đủ 10 field (xem schema bên dưới). Field unknown ghi `"unknown"`.
3. Tìm video/demo tương đồng từ TikTok / Douyin / AliExpress / Temu / YouTube / nguồn demo khác.
4. Chạy **SHOPEE PRODUCT MATCH GUARD** (xem GUARD 8) chấm 5 tiêu chí tương đồng.
5. Chỉ chạy pipeline (Script → Voice → BGM) nếu Decision = `MATCH_CONFIRMED`.
6. `MATCH_NEEDS_REVIEW` → trình user duyệt. `MISMATCH_REJECT` → tự tìm clip khác trong retry limit, hết retry mới hỏi user.
7. Output cuối: Facebook Reels-ready MP4 + Shopee Affiliate link trỏ về sản phẩm trong Card.

**Limitation phải báo rõ**: nếu không có quyền/truy cập lấy Shopee data trực tiếp (giá, hoa hồng, số bán, rating), **báo limitation cho user**, đề xuất user dán link sản phẩm Shopee. **KHÔNG bịa** giá / hoa hồng / số bán / review / rating / shop name.

**KHÔNG có MODE TikTok-Shop riêng trong giai đoạn này** — TikTok Shop là future lane, defer.

---

## CHANNEL / LANE PROFILE — KHÔNG HARD-CODE 1 NGÁCH

`/chay` KHÔNG hard-code đi một dạng review sản phẩm hay một ngách cố định. Mỗi kênh / nick (FB Reels, TikTok VN) sau này có thể có **bộ lane riêng**.

**Default lane set cho Con số 1 (configurable, không cố định toàn hệ thống)**:

| Lane | Mô tả |
|---|---|
| `lane_1` | Gadget bếp (slicer, peeler, máy thái rau, đồ bếp mini đa năng) |
| `lane_2` | Đồ gia dụng tiện lợi (gadget home, life hack, dụng cụ tiện ích) |
| `lane_3` | Cleaning / satisfying indoor (vệ sinh, tẩy rửa, satisfying clean) |
| `lane_4` | Organizer / space-saving (đồ thu gọn, lưu trữ thông minh) |

**Quy tắc**:
- Đây là **default lane set của Con số 1**, KHÔNG phải hardcode cho toàn hệ thống.
- Mỗi kênh / nick sau này có thể override bằng **Channel Profile riêng** (mỗi nick TikTok/FB có thể chuyên ngách khác — eg nick A chuyên gadget bếp, nick B chuyên cleaning indoor).
- `/chay` phải đọc Project Memory / Channel Profile để chọn lane:
  - Nếu memory ghi rõ lane cho video tiếp theo → dùng lane đó, **KHÔNG hỏi**.
  - Nếu memory không ghi → mặc định ưu tiên lane gần nhất đã chạy thành công, hoặc rotate `lane_1..lane_4` theo thứ tự.
- **KHÔNG hỏi user "chọn ngách nào"** nếu memory + lane profile đủ rõ. Đây là vi phạm AUTO-DECISION POLICY.

---

## SHOPEE-FIRST LANE v0

**Triết lý**: Đảo thứ tự — chốt **sản phẩm Shopee VN trước**, sau đó **đi tìm video/demo tương đồng**. Mục đích: ưu tiên 1 SKU có hoa hồng/sales tốt trên Shopee VN, đảm bảo affiliate target rõ ràng từ đầu. Output: short-form video đăng **Facebook Reels** gắn **Shopee Affiliate link**.

**Quan hệ với Video-First Lane**: là **lane song song active**, KHÔNG thay thế. Mặc định MODE 1/2/3 vẫn là Video-First. Chỉ kích hoạt Shopee-First khi user gọi MODE 4 (`/chay shopee-first ...` hoặc `/chay product-first ...`).

**Quan hệ với TikTok-Shop-First (future lane)**: TikTok Shop là **future lane defer** (chốt 2026-05-22 Phần 22). Trong giai đoạn này KHÔNG triển khai. Trigger chung `/chay product-first` → mặc định Shopee-First.

### SHOPEE PRODUCT CARD — Schema mở rộng + PERSIST HARD GATE

> **Agent boundary** (xem section **AGENT-READY RESPONSIBILITY BOUNDARIES** ở cuối): Card này thuộc trách nhiệm **Shopee Product Agent**. Mọi thao tác resolve link, fetch metadata, scoring, persist file phải gói gọn trong responsibility này để sau tách sub-agent không phải rewire.

Khi vào Shopee-First Lane, agent phải tạo **Shopee Product Card** và **PERSIST file** tại:
`production/batch_001/<video_id>/shopee_product_card.json`

**HARD PERSIST GATE (Phần 23 — bài học từ yt_011)**: trước khi rời PF-STEP 2 sang PF-STEP 3, file `shopee_product_card.json` PHẢI tồn tại trên disk. KHÔNG được để Product Card chỉ tồn tại trong chat / log / message. Bài học: ở yt_011 lần đầu Card chỉ ghi trong chat → phải fix sau commit (commit `791564f`). Quy tắc cố định: **chưa persist → KHÔNG đi tiếp**.

Nếu `video_id` chưa được cấp trước PF-STEP 2 (eg lane bắt đầu từ Discovery thuần): agent phải **assign video_id ngay đầu PF-STEP 2** (theo pattern `yt_NNN` tăng dần), tạo thư mục `production/batch_001/<video_id>/`, rồi persist Card vào đó. Cấm để Card "treo" không gắn `video_id`.

**Schema mở rộng** (hardening Phần 23 — tăng từ "10 field" cũ lên full schema có audit trail + decision trail):

| # | Field | Mô tả | Required? | Nếu không có data |
|---|---|---|---|---|
| 1 | `video_id` | Pattern `yt_NNN` — assign ngay PF-STEP 2 nếu chưa có | **bắt buộc** | — |
| 2 | `lane` | Cố định `"shopee_first"` | **bắt buộc** | — |
| 3 | `phase_ref` | Phần workflow đang chạy (eg `"Phần 22 Shopee-First Lane v0"`, `"Phần 23 Hardening v0"`) | **bắt buộc** | — |
| 4 | `created_at` | ISO 8601 timestamp khi persist card | **bắt buộc** | — |
| 5 | `shopee_product_url` | Canonical URL Shopee VN (eg `https://shopee.vn/<slug>/<shopid>/<itemid>`) | **bắt buộc** — nếu không có thì không lập card | — |
| 6 | `short_url_original` | Short link gốc dạng `https://s.shopee.vn/...` nếu user dán short link | **nếu có** | bỏ field hoặc `null` |
| 7 | `canonical_url` | URL sau khi resolve redirect (giống `shopee_product_url` nếu input đã canonical) | **nếu resolve được** | bỏ field hoặc `null` |
| 8 | `shopid` | Numeric shopid (extract từ canonical URL pattern `shopee.vn/<slug>/<shopid>/<itemid>`) | **nếu URL có dạng chuẩn** | bỏ field hoặc `null` |
| 9 | `itemid` | Numeric itemid (extract cùng pattern) | **nếu URL có dạng chuẩn** | bỏ field hoặc `null` |
| 10 | `product_name` | Tên sản phẩm chính thức (theo listing Shopee) | **bắt buộc** | — |
| 11 | `product_name_short` | Tên rút gọn để dùng trong report/script (eg `"Dụng cụ thái + tẩy lõi đa năng"`) | **nếu có ích** | bỏ field |
| 12 | `price_vnd` | Giá hiện tại (VNĐ, integer) | **nếu có** | ghi `"unknown"` — KHÔNG bịa |
| 13 | `commission_pct` | % hoa hồng Shopee Affiliate (eg `"4%"`) | **nếu có** | ghi `"unknown"` — KHÔNG bịa |
| 14 | `estimated_commission_vnd` | `price_vnd × commission_pct` nếu tính được | **nếu tính được** | bỏ field hoặc `"unknown"` |
| 15 | `sales_count` | Số lượng đã bán (eg `"5k+"`, `"12.3k"`) | **nếu có** | ghi `"unknown"` — KHÔNG bịa |
| 16 | `rating` | Rating trung bình (eg `4.8`); listing mới chưa có review ghi `0` (KHÔNG phải `"unknown"`) | **nếu có** | ghi `"unknown"` — KHÔNG bịa |
| 17 | `review_count` | Số lượng review (listing mới = `0`) | **nếu có** | ghi `"unknown"` — KHÔNG bịa |
| 18 | `shop_name` | Tên shop bán hàng trên Shopee | **nếu có** | ghi `"unknown"` — KHÔNG bịa |
| 19 | `why_worthwhile` | Lý do đáng làm — phải bao gồm 5 điểm: (a) giải quyết vấn đề gì, (b) ai có thể mua, (c) visual demo có dễ hiểu không, (d) có phù hợp content-led affiliate không, (e) có tiềm năng chuyển đổi Facebook Reels VN không. Có thể thêm CAVEAT nếu commission/sales thấp. | **bắt buộc** | — |
| 20 | `data_confidence` | Mức độ tin cậy data: `high` (lấy được full price/commission/sales/rating từ Shopee trực tiếp) / `medium` (lấy được ≥3 field thật, còn lại unknown) / `low` (≥3 field unknown, chủ yếu từ user paste / knowledge) | **bắt buộc** | — |
| 21 | `data_source_notes` | Ghi rõ từng field lấy từ đâu (user paste / dashboard / redirect resolve / unknown). Audit trail bắt buộc — không có note = không persist. | **bắt buộc** | — |
| 22 | `selection_scoring` | Object gồm `axes[]` (6 trục × `id/name/score/note`) + `total` + `max=18` + `threshold_pass=13` + `threshold_min_risk_axis=2`. **Bắt buộc cả khi user dán link sẵn** (không chỉ Discovery Mode) — Phần 23 hardening. | **bắt buộc** | — |
| 23 | `decision` | `PRODUCT_SELECTED` / `PRODUCT_NEEDS_USER_REVIEW` / `PRODUCT_REJECTED` (kết quả của Selection Scoring) | **bắt buộc** | — |
| 24 | `decision_note` | Giải thích ngắn lý do decision (đạt threshold gì, trục yếu, caveat) | **bắt buộc** | — |

> "10 core field" cũ (price/commission/sales/rating/review/shop/url/name/why/confidence) vẫn dùng được khi nói về phần business data. File persist phải gồm đủ schema mở rộng này.

**Quy tắc bịa (HARD)**: nếu không lấy được data trực tiếp (giá, hoa hồng, sales, rating, review, shop), **luôn ghi `"unknown"`**. Ngoại lệ: `rating = 0` + `review_count = 0` cho **listing mới chưa có review** là hợp lệ (không phải `"unknown"`) — phải note trong `data_source_notes`. Nếu ≥3 field trong (price/commission/sales/rating/review/shop) đều `unknown` → `data_confidence = "low"` + báo user, hỏi có dán thêm dữ liệu hay tiếp tục với data thiếu.

**Decision sau khi lập Card**:
- `data_confidence = high` → tiếp tục PF-STEP 3 không hỏi user.
- `data_confidence = medium` → tiếp tục PF-STEP 3, ghi note "medium confidence — X field unknown" vào báo cáo.
- `data_confidence = low` → **PHẢI hỏi user**: tiếp tục hay dán thêm data? Hoặc rerun discovery với candidate khác.

**Verify persist (HARD checklist sau PF-STEP 2)**:
- [ ] File `production/batch_001/<video_id>/shopee_product_card.json` tồn tại trên disk?
- [ ] JSON parse được, không trailing comma / syntax error?
- [ ] Có đủ field bắt buộc (1–5, 10, 19–24)?
- [ ] `decision` ∈ {`PRODUCT_SELECTED`, `PRODUCT_NEEDS_USER_REVIEW`, `PRODUCT_REJECTED`}?
- [ ] `selection_scoring.total` ≤ `selection_scoring.max` và `selection_scoring.axes.length == 6`?
- [ ] `data_source_notes` có giải thích nguồn field (không để rỗng)?

Nếu bất kỳ check fail → **không** chuyển sang PF-STEP 3.

### SHOPEE SESSION FETCHER v0 (Round 2C 2026-05-24) — Tooling cho Discovery Mode

> **Agent boundary**: thuộc trách nhiệm **Shopee Product Agent**. Tooling: package `@vfos/shopee`.

Khi user không có Shopee API public, Shopee Product Agent có thể dùng local browser session để fetch product candidates từ Shopee Affiliate dashboard. Đây là input cho Discovery Mode khi user gọi `/chay shopee-first` không kèm link.

**Flow operator-driven (KHÔNG auto trong `/chay`)**:

1. Operator chạy `pnpm shopee:login` 1 lần (mở headed browser, login Shopee Affiliate thủ công, hoàn thành captcha/2FA/OTP nếu có). Session lưu vào `.secrets/shopee_storage_state.json` (gitignored).
2. Operator chạy `pnpm shopee:fetch` (headless, load session, scrape ≤3 cards). Xuất `production/_commerce/shopee_product_candidates.json` — ZERO cookie/token, chỉ public product data.
3. `/chay shopee-first` (Discovery Mode) đọc `shopee_product_candidates.json` làm input candidate list cho Selection Scoring 6 trục.

**HARD RULE — `/chay` KHÔNG tự chạy session fetcher**:
- `/chay` TUYỆT ĐỐI KHÔNG tự chạy `pnpm shopee:login` (cần user login + captcha thủ công).
- `/chay` TUYỆT ĐỐI KHÔNG tự chạy `pnpm shopee:fetch` (cần user duyệt launch browser).
- `/chay` CHỈ đọc artifact `production/_commerce/shopee_product_candidates.json` nếu tồn tại; nếu không có → báo limitation + xin user chạy `pnpm shopee:login` + `pnpm shopee:fetch` thủ công.

**Security HARD**:
- `.secrets/` đã gitignored (cookie/session/storageState/HTML debug snapshot — không bao giờ commit).
- Artifact JSON `shopee_product_candidates.json` ZERO cookie/token.
- Script KHÔNG log cookie value, chỉ counts + URLs.
- Nếu session expire → script báo `required_user_action: true` + bảo user re-run login. KHÔNG bypass.

Xem chi tiết: [packages/shopee/README.md](../../../packages/shopee/README.md).

### SHOPEE CDP TARGETED-CLICK LINK EXTRACTION v0 (Round 26B — 2026-05-26) — **PRIMARY FLOW**

> **Agent boundary**: thuộc trách nhiệm **Shopee Product Agent (Commerce Product Agent)**. Đây là flow **CHÍNH** để lấy Shopee Affiliate link từ Round 26B trở đi. Mọi flow khác (`pnpm shopee:login` storage_state, HAR endpoint discovery, cookie fetcher, Shopee Open API GraphQL) đã chuyển sang **DEPRECATED / FALLBACK**.

**Lý do chọn CDP làm primary**:
- Không cần password / OTP / lưu cookie / storage state / HAR
- User tự login thủ công 1 lần trên Cốc Cốc/Chrome thật (đời sống session = đời sống browser)
- Agent attach Playwright qua CDP (`chromium.connectOverCDP`) vào browser đang chạy
- Tận dụng captcha + 2FA + anti-bot bypass tự nhiên (session sống)
- Verified: đã extract được short link thật từ modal `input.value` (Round 25/26 thực nghiệm)

**Operator pre-requisite** (một lần):
1. Mở Cốc Cốc/Chrome với `--remote-debugging-port=9222` (Cốc Cốc default đã enable port `9222` qua flag riêng).
2. Login Shopee Affiliate thủ công.
3. Mở tab `https://affiliate.shopee.vn/offer/product_offer` và để đó.

**Agent flow (BROWSER_CDP_TARGETED_CLICK)**:
```
1. Connect CDP localhost 127.0.0.1:9222 (max 3 retry).
2. Find tab: url.includes("affiliate.shopee.vn/offer/product_offer").
3. Read shopee_link_registry.json (load existing entries).
4. Scan DOM product cards (text/aria/scoped lookup — NO random CSS class dependency).
5. For each candidate product card:
   a. Check registry (shopid+itemid > canonical > short_link > name).
   b. Skip if duplicate (status=SKIPPED_DUPLICATE, reason=ERR_DUPLICATE_PRODUCT_LINK).
   c. Click "Lấy link" button INSIDE that card scope.
   d. Wait for modal (~3s).
   e. Extract URL from modal input.value (or scoped DOM text fallback).
   f. Close modal (Escape).
6. Resolve short link (HTTP HEAD redirect) → canonical URL.
7. validateShopeeAffiliateLink(canonical) → check owner == expected_affiliate_owner_id.
8. Upsert into registry via upsertEntry() under lock + atomic write.
9. Stop when target_count reached or max_clicks_per_batch hit.
```

**Default tuning**:
- `target_count = 2` (số sản phẩm MỚI cần lấy mỗi lần)
- `max_clicks_per_batch = 5` (cap số click tối đa kể cả gặp duplicate)
- `expected_affiliate_owner_id = "an_17376660568"` (operator's affiliate id)

**Flow comparison (sau Round 26B)**:

| Flow | Status | Khi nào dùng |
|---|---|---|
| `BROWSER_CDP_TARGETED_CLICK` | **PRIMARY** | Default cho Commerce Product Agent từ Round 26B |
| `pnpm shopee:login` (storage_state) | **DEPRECATED / FALLBACK** | Chỉ dùng khi user explicit cho phép + CDP không khả dụng |
| HAR endpoint discovery | **DEPRECATED** | Round 3A artifact, không còn dùng làm primary |
| Cookie fetcher (`fetch-products-cookie.ts`) | **FALLBACK** | Giữ làm reference + Round 3C validator vẫn dùng được |
| Shopee Open API GraphQL | **NOT_AVAILABLE** | Chưa được cấp AppID/API key |
| `load-picks.ts` (operator manual paste) | **REUSABLE** | Khi user dán link sẵn — bypass scrape hoàn toàn |

**KHÔNG xoá code flow cũ trong Round 26B** — chỉ đánh dấu DEPRECATED. Xoá là round riêng sau khi CDP flow đã được commit ổn định + chạy thật ≥3 lần thành công.

### SHOPEE LINK REGISTRY v0 (Round 26B) — Global Dedupe + Atomic Write

> **Agent boundary**: Shopee Product Agent. Module code: [packages/shopee/src/link-registry.ts](../../../packages/shopee/src/link-registry.ts). Tests: [packages/shopee/tests/link-registry.test.ts](../../../packages/shopee/tests/link-registry.test.ts).

**Mục tiêu**: chống lấy trùng cùng sản phẩm/link. Mỗi short link extract được phải dedup theo registry global trước khi click + sau khi resolve.

**Path chính (global)**:
```
production/_commerce/shopee_link_registry.json
```

**Path scoped tương lai** (nếu cần per-video):
```
production/batch_001/<video_id>/commerce/shopee_link_registry.json
```

Mặc định Round 26B dùng **global registry** ở `_commerce/`.

**Schema bắt buộc** (`schema_version: "0.1.0"`):
```json
{
  "schema_version": "0.1.0",
  "updated_at": "ISO 8601",
  "expected_affiliate_owner_id": "an_17376660568",
  "entries": [
    {
      "product_name": "...",
      "shopid": "1820797160" | null,
      "itemid": "55110800126" | null,
      "short_link": "https://s.shopee.vn/..." | null,
      "canonical_url": "https://shopee.vn/opaanlp/.../...?gads_t_sig=..." | null,
      "affiliate_owner_id": "an_17376660568" | null,
      "affiliate_link_status": "VERIFIED_FROM_LONG_LINK" | "NEEDS_USER_REVIEW" | ...,
      "source": "cdp_browser_targeted_click",
      "first_seen_at": "ISO 8601",
      "last_seen_at": "ISO 8601",
      "times_seen": 1,
      "notes": "..."
    }
  ],
  "rejected": [
    {
      "short_link": "...",
      "canonical_url": "...",
      "reason_code": "ERR_AFFILIATE_OWNER_MISMATCH" | ...,
      "seen_at": "ISO 8601",
      "notes": "..."
    }
  ]
}
```

**Dedup key resolution (HARD priority order)**:
1. `shopid + itemid` (strongest signal — Shopee's own unique ID)
2. `canonical_url` normalized (host + pathname, drop query — gads_t_sig signature varies per request)
3. `short_link` (exact match)
4. Normalized `product_name` (fallback only when no ID/URL available)

**Pre-click check** (Commerce Product Agent flow):
1. Đọc DOM danh sách sản phẩm.
2. Nếu card có shopid/itemid/canonical → check registry trước khi click.
3. Skip nếu đã tồn tại → `status=SKIPPED_DUPLICATE`, `reason_code=ERR_DUPLICATE_PRODUCT_LINK`.
4. Nếu card không có id rõ → có thể click candidate, **sau khi resolve** check lại registry. Match sau resolve → mark duplicate, không dùng làm candidate mới.

**Owner validation** (sau khi resolve canonical URL):
- Match `expected_affiliate_owner_id` (eg `an_17376660568`) qua `utm_source=an_<id>` hoặc `mmp_pid=an_<id>` → upsert vào `entries`.
- Mismatch → `appendRejected` với `reason_code=ERR_AFFILIATE_OWNER_MISMATCH`. KHÔNG ghi vào `entries`.
- `validateShopeeAffiliateLink()` fail → `appendRejected` với reason rõ.

### REGISTRY CONCURRENCY SAFETY (Round 26B HARD)

`shopee_link_registry.json` là global registry dùng chung nhiều lane/run/video. Mọi update PHẢI tuân thủ:

**1. File locking**:
- Trước ghi: acquire lock file `production/_commerce/shopee_link_registry.json.lock` qua `writeFileSync(..., { flag: "wx" })` (atomic exclusive create).
- Nếu lock đang tồn tại → poll mỗi `lock_retry_ms` (default 100ms), tối đa `lock_timeout_ms` (default 5000ms).
- Hết timeout → throw `LinkRegistryError("ERR_LINK_REGISTRY_LOCK_TIMEOUT")`.

**2. Stale lock detection**:
- Nếu lock cũ hơn `stale_lock_ms` (default 60000ms = 60s) → throw `LinkRegistryError("ERR_LINK_REGISTRY_STALE_LOCK")`.
- **KHÔNG tự xoá stale lock** — owner process có thể vẫn đang chạy. Operator phải inspect + remove manually.

**3. Read-after-lock**:
- Sau khi acquire lock, **đọc lại registry mới nhất từ disk**. KHÔNG dùng snapshot đã đọc trước lock.

**4. Merge-safe update**:
- Gọi `findExistingEntry(registry, candidate)` theo priority dedup.
- Match → update `last_seen_at` + `times_seen++`, KHÔNG ghi đè entry cũ.
- Miss → append entry mới.
- KHÔNG bao giờ replace toàn bộ `entries[]` bằng dữ liệu stale.

**5. Atomic write**:
- Ghi ra `<registry>.tmp.<pid>.<timestamp>` cùng directory.
- Sanity-check JSON parse trước rename.
- `renameSync(tmp, registry)` — atomic trên POSIX + Windows NTFS.
- Fail → cleanup tmp + throw `ERR_LINK_REGISTRY_WRITE_FAILED`.

**6. Release lock**:
- LUÔN release trong `finally{}` — không leak.
- Best-effort `unlinkSync` (không throw từ release).

**Reason codes**:
- `ERR_LINK_REGISTRY_LOCK_TIMEOUT` — không acquire được trong timeout
- `ERR_LINK_REGISTRY_STALE_LOCK` — lock cũ hơn threshold
- `ERR_LINK_REGISTRY_WRITE_FAILED` — atomic rename / JSON sanity fail
- `ERR_LINK_REGISTRY_MISSING` — registry path không tồn tại khi cần read

**HARD RULE**: code script extract chỉ được promote vào primary flow khi đã wire vào `upsertEntry()` / `appendRejected()` module này. Không có lock + atomic write thì KHÔNG promote registry write code.

### CDP CONNECTION FAILURE POLICY (Round 26B)

CDP flow phụ thuộc browser user đang mở remote debugging tại `127.0.0.1:9222`.

| Scenario | Status | reason_code | next_step_short |
|---|---|---|---|
| Connect fail sau 3 retry | `FAIL` | `ERR_CDP_BROWSER_NOT_FOUND` | "Open Cốc Cốc/Chrome with --remote-debugging-port=9222 and open Shopee Affiliate Product Offer page." |
| Connect OK nhưng không tìm thấy tab `affiliate.shopee.vn/offer/product_offer` | `FAIL` | `ERR_CDP_TARGET_TAB_NOT_FOUND` | "Open https://affiliate.shopee.vn/offer/product_offer in the logged-in browser." |
| Tab tồn tại nhưng login wall / captcha | `SUSPENDED` | `ERR_AUTH_REQUIRED` | "User must login manually in the browser, then rerun." |

**KHÔNG fallback tự động sang**:
- Nhập password / OTP
- `shopee:login` / storage_state
- Cookie fetcher
- HAR flow
- Shopee private API

Operator phải quyết định fallback nào (nếu có) — agent **không tự**.

### SELECTOR RESILIENCE for Targeted Click (Round 26B)

Shopee Affiliate Dashboard DOM có thể đổi class name thường xuyên. Script **KHÔNG** được phụ thuộc hoàn toàn vào dynamic CSS class.

**Selector strategy (HARD priority order khi tìm "Lấy link" button)**:

1. **Text exact**: `button` với `textContent.trim() === "Lấy link"` hoặc `"Get link"`.
2. **Accessibility**: `role="button"` + `aria-label` chứa "Lấy link".
3. **Product-card scoped search**: xác định product card container (qua `product_name` text hoặc card layout marker như "Tỉ lệ hoa hồng"), chỉ tìm button **bên trong card đó**. KHÔNG click button ngoài card.
4. **Stable attributes**: `data-testid` / `data-*` nếu có và ổn định qua nhiều version.
5. **Controlled fallback CSS selector**: chỉ dùng nếu đã document rõ trong code comment. KHÔNG dùng random class/hash selector làm primary. KHÔNG click theo tọa độ (x, y) trừ khi user explicit approve.

**Failure**:

| Scenario | Status | reason_code |
|---|---|---|
| Không tìm thấy button sau mọi strategy | `FAIL` | `ERR_LINK_BUTTON_NOT_FOUND` |
| Tìm thấy nhiều button không map được product card | `FAIL` | `ERR_AMBIGUOUS_LINK_BUTTON` |
| Modal hiện ra nhưng không có URL Shopee nào trong DOM | `SUSPENDED` | `ERR_MODAL_UNRECOGNIZED` |

**Cấm**:
- Random click bừa
- Click setting / account / security / logout / payment / publish / post / send button
- Auto nhập password / OTP
- Click popup lạ không rõ ý nghĩa

### TARGETED CLICK POLICY (Round 26B — HARD)

**Allowed**:
- Attach CDP vào `127.0.0.1:9222`
- Chỉ thao tác trên tab `affiliate.shopee.vn/offer/product_offer`
- Scroll product list (limited)
- Read DOM product cards
- Click button "Lấy link" theo selector strategy trên (text/aria/card-scoped)
- Copy/extract link từ modal `input.value` hoặc scoped DOM text
- Close modal (Escape key)
- Resolve / validate link qua `validateShopeeAffiliateLink()`
- Write registry qua `upsertEntry()` / `appendRejected()`

**Forbidden**:
- Random click bất kỳ element nào không nằm trong card target
- Click setting / account / security / logout / payment / publish / post button
- Tự nhập password / OTP
- Lưu Gmail/Shopee password vào `.env`
- Log cookie / session / header / token (kể cả masked > 12 char)
- Batch quá `max_clicks_per_batch = 5` sản phẩm/lần
- Click popup lạ không rõ ý nghĩa
- Gọi Facebook API
- Publish

**Login/OTP gặp phải**:
- `status = SUSPENDED` (nếu modal login overlay) hoặc `FAIL` (nếu URL chuyển sang login wall)
- `reason_code = ERR_AUTH_REQUIRED`
- User tự login thủ công trong browser — agent không nhập credential.

### SHOPEE EXTRACTION REASON CODES (Round 26B canonical enum)

Bổ sung vào Section K (Auto-Run Controller Reason Codes):

**COMMERCE (Shopee CDP)**:
- `ERR_CDP_BROWSER_NOT_FOUND` — CDP connect fail sau 3 retry
- `ERR_CDP_TARGET_TAB_NOT_FOUND` — connect OK nhưng tab `affiliate.shopee.vn/offer/product_offer` không có
- `ERR_LINK_BUTTON_NOT_FOUND` — selector strategy không tìm thấy "Lấy link" button
- `ERR_AMBIGUOUS_LINK_BUTTON` — nhiều button match nhưng không scope được vào product card
- `ERR_MODAL_UNRECOGNIZED` — modal hiện ra nhưng không có URL Shopee trong DOM
- `ERR_DUPLICATE_PRODUCT_LINK` — entry đã tồn tại trong registry (status `SKIPPED_DUPLICATE`)
- `ERR_AFFILIATE_OWNER_MISMATCH` — canonical URL `utm_source` / `mmp_pid` không match `expected_affiliate_owner_id`

**COMMERCE (Registry)**:
- `ERR_LINK_REGISTRY_LOCK_TIMEOUT` — không acquire lock trong timeout
- `ERR_LINK_REGISTRY_STALE_LOCK` — lock cũ hơn `stale_lock_ms`
- `ERR_LINK_REGISTRY_WRITE_FAILED` — atomic rename / JSON sanity fail
- `ERR_LINK_REGISTRY_MISSING` — registry path không tồn tại khi cần read

(Đã có từ Round 25 nhưng tái sử dụng trong CDP scope: `ERR_AUTH_REQUIRED`.)

### SHOPEE SHORT LINK SUPPORT v0 (Phần 23) — Input hợp lệ

> **Agent boundary**: thuộc trách nhiệm **Shopee Product Agent**. Logic resolve link không được duplicate ở Demo Match Agent hay nơi khác — chỉ Product Agent biết cách parse URL Shopee.

Shopee short link dạng `https://s.shopee.vn/<code>` là **input hợp lệ** cho Shopee-First Lane. KHÔNG fail chỉ vì user lấy được short link mà không có canonical URL.

**Behavior bắt buộc khi nhận short link**:

1. **Resolve redirect** qua HTTP-level (eg `curl -sILk <short_url>`) để lấy canonical URL. Đây là layer HTTP, KHÔNG cần JS/SPA browser → không bị Shopee anti-bot chặn.
2. **Extract `shopid` + `itemid`** nếu canonical URL có pattern chuẩn:
   - `https://shopee.vn/<slug>/<shopid>/<itemid>` → shopid + itemid lấy được trực tiếp.
   - `https://shopee.vn/product/<shopid>/<itemid>` → format thay thế, cùng cách extract.
   - Format khác (search/category/voucher URL) → ghi `null` + note "URL không phải dạng product detail".
3. **Lưu vào Shopee Product Card**:
   - `short_url_original` = link gốc user dán
   - `canonical_url` = URL sau redirect resolve
   - `shopid`, `itemid` nếu parse được
   - `shopee_product_url` = canonical URL (đây là URL dùng cho affiliate target)
4. **Business fields (price/commission/sales/rating/review/shop)**: short link resolution **CHỈ** lấy được URL + shopid + itemid. KHÔNG lấy được business data trực tiếp (Shopee SPA + internal API v4 trả 403 anti-bot cho anonymous request). Khi đó:
   - Hỏi user dán manual từ Shopee Affiliate dashboard, HOẶC
   - Ghi `"unknown"` cho từng field không có data, set `data_confidence` phù hợp.
   - **KHÔNG bịa** giá / hoa hồng / sales / rating / review / shop.
5. **Decision flow short link**:
   - Resolve thành công + parse được shopid/itemid + user dán đủ business fields → tiếp tục PF-STEP 2 normal.
   - Resolve thành công + chỉ có URL (business fields unknown) → set `data_confidence = "medium"` hoặc `"low"`, báo user, hỏi có dán thêm hay đi tiếp với data thiếu.
   - Resolve fail (link sai / hết hạn / Shopee đổi pattern) → báo limitation, xin user paste URL canonical trực tiếp. KHÔNG bịa URL.

**Pattern resolve thực tế (yt_011 reference)**:
```
input:  https://s.shopee.vn/17RASU88W
↓ curl -sILk → HTTP 301
output: https://shopee.vn/opaanlp/1820797160/55110800126?...affiliate UTM
        shopid = 1820797160
        itemid = 55110800126
```

**HARD RULE — short link KHÔNG phải fail signal**:
Khi user chỉ có short link và agent resolve được → **đi tiếp**. Đây là input hợp lệ. Lý do user có short link mà không có canonical: Shopee app share button mặc định trả short link. Đây là use case thường gặp, KHÔNG phải dấu hiệu user data kém chất lượng.

### SHOPEE PRODUCT DISCOVERY MODE v0 — Auto tìm sản phẩm Shopee khi không có link

**Trigger**: MODE 4 được gọi **không kèm link Shopee** (`/chay shopee-first`, `/chay product-first` mặc định, `/chay tìm sản phẩm Shopee trước`, `/chay chọn sản phẩm trước, video sau`).

**Mục tiêu**: agent tự chọn 1 sản phẩm Shopee VN tiềm năng theo lane đang nhắm, lập Shopee Product Card, rồi mới sang PF-STEP 3 (tìm video/demo). KHÔNG bắt user phải dán link mỗi lần.

**Behavior bắt buộc**:

1. Đọc Project Memory + CHANNEL/LANE PROFILE để xác định lane đang chạy.
2. Tự tìm/chọn candidate sản phẩm Shopee VN phù hợp lane. Ưu tiên sản phẩm:
   - dễ demo bằng video (visual rõ, kết quả thấy được nhanh)
   - visual rõ (form factor đơn giản, không cần caption hiểu công dụng)
   - giá vừa phải (không quá rẻ → không đáng làm; không quá đắt → khó chuyển đổi VN)
   - có hoa hồng Shopee Affiliate ≥5% (nếu lấy được data thật từ Shopee Affiliate)
   - rating ≥4.5★ + ≥1k sales (nếu lấy được)
   - **KHÔNG** phải brand lớn khó xử lý (thương hiệu có legal team / IP risk)
   - **KHÔNG** thuộc ngành nhạy cảm / claim rủi ro (y tế, mỹ phẩm chức năng, thực phẩm chức năng, đồ điện tử cao cấp, thuốc)
   - dễ tìm video/demo tương đồng thật từ nguồn cho phép (TikTok / Douyin / AliExpress / Temu / YouTube)
3. Chấm từng candidate trên 6 trục **SHOPEE PRODUCT SELECTION SCORING** (xem bên dưới).
4. Nếu candidate đạt threshold (score đủ cao + không vào nhóm rủi ro) → **tạo Shopee Product Card đầy đủ 10 field** (data unknown ghi `"unknown"`, `data_confidence` phản ánh trung thực).
5. Nếu Card đủ dữ liệu tối thiểu (`shopee_product_url` + `product_name` + `why_worthwhile`) → tiếp tục PF-STEP 3 (tìm video/demo tương đồng).
6. Nếu thiếu link Shopee đáng tin cậy / agent không có quyền truy cập Shopee data → **dừng auto-discovery, báo limitation rõ ràng**: *"Không đủ quyền/data để tự lấy link Shopee VN đáng tin cậy. Cần user dán link hoặc cấp nguồn sản phẩm."* KHÔNG bịa link, KHÔNG bịa product.

**HARD RULE — limitation truy cập Shopee**:
Nếu agent không thể lấy URL Shopee VN thật (do Shopee chặn scraping / không có MCP integration / không có browser access live), thì **không được tạo Shopee Product Card hoàn chỉnh**. Phải báo limitation và xin user dán link Shopee.

### SHOPEE PRODUCT SELECTION SCORING — 6 trục chấm candidate sản phẩm

Mỗi candidate sản phẩm Shopee trong Discovery Mode được chấm trên 6 trục độc lập. Mỗi trục thang điểm 0–3 (0=fail, 1=yếu, 2=trung bình, 3=mạnh). Tổng max: 18.

| # | Trục | Câu hỏi đánh giá | Score 0 (fail) | Score 3 (strong) |
|---|---|---|---|---|
| 1 | **Demo clarity** | Nhìn video là hiểu công dụng không? | Cần caption / explainer dài mới hiểu | Tự nhìn 3s đầu hiểu ngay |
| 2 | **Shopee affiliate potential** | Giá / hoa hồng Shopee Affiliate / sales có đáng làm không? | Giá lẻ + hoa hồng <3% + ít sales | Giá vừa + hoa hồng ≥10% + ≥1k sales + rating ≥4.5★ |
| 3 | **Visual appeal cho Facebook Reels** | Có tạo được short-form Facebook Reels hấp dẫn không? | Sản phẩm không có visual demo (eg gói bột) | Có "trước/sau" rõ, satisfying motion |
| 4 | **Vietnam audience fit (Facebook Reels VN)** | Người xem Facebook Reels VN có dễ liên hệ không? | Sản phẩm chỉ phù hợp văn hoá khác (eg pickled fish, kimchi tool) | Đồ dùng phổ thông VN, gadget gia đình |
| 5 | **Source/demo availability** | Có dễ tìm video/demo tương đồng thật không? | Không có clip nào ngoài listing tĩnh | Nhiều clip TikTok/Douyin/AliExpress demo |
| 6 | **Risk level** | Có rủi ro claim / brand lớn / hàng nhạy cảm không? | Y tế / mỹ phẩm chức năng / brand A++ / thuốc | Đồ gia dụng phổ thông, không claim sức khoẻ |

**Threshold quyết định**:
- Tổng score ≥ **13/18** AND **không có trục nào = 0** AND trục 6 (risk) ≥ 2 → `PRODUCT_SELECTED`
- Tổng score 10–12 HOẶC có 1 trục = 0 (trừ trục 6) HOẶC trục 6 = 1 → `PRODUCT_NEEDS_USER_REVIEW`
- Tổng score < 10 HOẶC trục 6 = 0 (rủi ro cao) → `PRODUCT_REJECTED`

**Auto-decision rule trong Shopee Discovery**:
- Nếu **chỉ 1 candidate** đạt `PRODUCT_SELECTED` → tự chọn, không hỏi user.
- Nếu **≥2 candidates** đạt `PRODUCT_SELECTED` → tự chọn candidate có **tổng score cao nhất**. Tie-breaker: ưu tiên trục 1 (demo clarity) cao hơn, rồi trục 5 (source availability), rồi trục 2 (affiliate potential).
- Nếu **không có candidate** nào đạt `PRODUCT_SELECTED` → mở rộng search 1 vòng (đổi keyword theo lane), tối đa 3 vòng search (giống AUTO-SOURCE RETRY POLICY).
- Hết 3 vòng vẫn không có → trình shortlist (cao nhất tổng score) cho user duyệt + báo lý do reject.

**Phải hỏi user (Shopee Discovery Mode)**:
- Không lấy được link Shopee VN đáng tin cậy → báo limitation + xin user dán link.
- `data_confidence = low` (≥3 field unknown trong price/commission/sales/rating/review/shop) → báo cho user, hỏi có dán dữ liệu thêm hay tiếp tục với data thiếu.
- Tất cả candidates đều `PRODUCT_NEEDS_USER_REVIEW` (không có `SELECTED` rõ) → trình shortlist.
- Sản phẩm nằm trong nhóm rủi ro nhưng có tín hiệu tiềm năng (eg viral nhưng claim y tế) → hỏi user có làm tiếp với soft tone không.
- Cần publish thật (publish vẫn ngoài scope `/chay`).

### NGUỒN VIDEO/DEMO THAM KHẢO cho Shopee-First

Sau khi có Shopee Product Card, được phép tìm video/demo từ:

- TikTok (clip user-gen, demo organic)
- Douyin (clip TQ gốc)
- AliExpress (product page demo)
- Temu (product page demo)
- YouTube (Shorts + long-form demo)
- Nguồn demo sản phẩm khác phù hợp (Lazada, Shopee CN, brand official page)

**Đây chỉ là nguồn tham khảo video/demo** — KHÔNG phải nguồn để gắn affiliate. Affiliate luôn trỏ về `shopee_product_url` trong Shopee Product Card.

**Bắt buộc**: sản phẩm trong clip phải **tương đồng thật** với sản phẩm trong Shopee Product Card (xem GUARD 8 — Shopee Product Match Guard).

### WORKFLOW SHOPEE-FIRST (khác Video-First ở STEP 1–3)

```
PF-STEP 0   Đọc Project Memory + xác định mode (MODE 4 trigger từ args)
PF-STEP 1   Tìm/chốt sản phẩm Shopee VN
            → Nếu user dán link Shopee: parse link, lấy metadata trực tiếp.
            → Nếu không có link (auto discovery): chạy SHOPEE PRODUCT DISCOVERY MODE v0:
              1. Đọc lane từ CHANNEL/LANE PROFILE.
              2. Tìm candidate sản phẩm Shopee VN theo lane (loại brand lớn,
                 ngành nhạy cảm, claim rủi ro).
              3. Chấm SHOPEE PRODUCT SELECTION SCORING 6 trục → quyết định
                 PRODUCT_SELECTED / PRODUCT_NEEDS_USER_REVIEW / PRODUCT_REJECTED.
              4. Nếu PRODUCT_SELECTED → đi PF-STEP 2.
              5. Nếu PRODUCT_REJECTED / không có candidate đạt threshold:
                 retry search 1 vòng đổi keyword theo lane, max 3 vòng.
              6. Hết 3 vòng vẫn không có → trình shortlist + reject log cho user.
              7. Nếu KHÔNG có quyền lấy data Shopee trực tiếp → BÁO
                 LIMITATION ngay, đề xuất user dán link Shopee. KHÔNG bịa product.
PF-STEP 2   Lập Shopee Product Card (10 field). Lưu shopee_product_card.json.
            → Field unknown phải ghi rõ "unknown", không bịa.
            → data_confidence phản ánh trung thực: high/medium/low.
            → Nếu Discovery Mode: kèm Shopee Product Selection Scoring (6 trục
              + total) trong shopee_product_card.json để audit lý do chọn.
PF-STEP 3   Tìm video/demo tương đồng từ nguồn cho phép (TikTok / Douyin /
            AliExpress / Temu / YouTube / nguồn khác).
            → Ưu tiên clip demo sản phẩm thật, có visual rõ, duration 15-90s.
PF-STEP 4   Chạy SHOPEE PRODUCT MATCH GUARD (GUARD 8) chấm 5 tiêu chí tương đồng.
            → MATCH_CONFIRMED       → đi tiếp PF-STEP 5
            → MATCH_NEEDS_REVIEW    → trình user duyệt clip + product card
                                      trước khi đi tiếp
            → MISMATCH_REJECT       → tự tìm clip khác (retry limit 3 vòng
                                      giống AUTO-SOURCE RETRY POLICY). Hết
                                      retry → trình shortlist + reject log
                                      cho user.
PF-STEP 5   Tải video tốt nhất → tiếp tục WORKFLOW Short-Form Factory v0
            từ STEP 4 (phân tích keyframes) trở đi như Video-First Lane.
            → scene_input.json phải có thêm field "affiliate_target":
              {"platform": "shopee", "link": <shopee_product_url>,
               "product_name": <product_name>, "shop_name": <shop_name>}
              để Script Writer biết target sản phẩm chính xác (giúp R2
              product match ở GUARD 7 không sai khi script viết).
PF-STEP 6+  Phần còn lại giống Video-First (Script → Voice → BGM → QC →
            preview). Áp dụng GUARD 6 visual safety + GUARD 7 affiliate
            compliance như bình thường.
            → Output target: Facebook Reels MP4. Operator gắn Shopee
              Affiliate link ở bước publish (publish vẫn ngoài scope /chay).
```

### AUTO-DECISION POLICY trong Shopee-First

Khi user gọi MODE 4 (`/chay shopee-first`, `/chay product-first`, các trigger Shopee khác) và memory đã có lane rõ:

- **KHÔNG hỏi**:
  - Chọn sản phẩm Shopee candidate nào khi Discovery Mode đã có ≥1 candidate đạt `PRODUCT_SELECTED` (auto chọn theo tổng score cao nhất + tie-breaker).
  - Chọn nguồn tham khảo video nào (TikTok / Douyin / AliExpress / Temu / YouTube — agent tự chọn theo availability + visual fit).
  - Chọn clip candidate nào sau khi chấm Match Guard (nếu CONFIRMED — auto pick clip score cao nhất).
  - "Shopee hay TikTok Shop" — Phần 22 chốt Shopee là lane chính, TikTok Shop defer. KHÔNG hỏi platform.
- **PHẢI hỏi**:
  - Nếu agent không có quyền lấy product data trực tiếp từ Shopee → báo limitation + xin user dán link Shopee.
  - Shopee Discovery hết 3 vòng search vẫn không có `PRODUCT_SELECTED` → trình shortlist + reject log.
  - Tất cả candidates đều `PRODUCT_NEEDS_USER_REVIEW` (không có SELECTED rõ).
  - Sản phẩm thuộc nhóm rủi ro (trục 6 risk = 1) nhưng có tín hiệu tiềm năng — hỏi user có muốn làm tiếp với soft tone không.
  - Nếu Match Guard ra `MATCH_NEEDS_REVIEW` → trình clip cho user.
  - Nếu 3 vòng retry video vẫn `MISMATCH_REJECT` → trình shortlist clip.
  - Nếu `data_confidence = low` (≥3 field unknown trong price/commission/sales/rating/review/shop) → báo cho user biết, hỏi xem có muốn tiếp tục hay dán thêm dữ liệu.
  - Publish thật (publish vẫn ngoài scope `/chay`).

---

## WORKFLOW CHUẨN SHORT-FORM FACTORY V0

*Áp dụng cho MODE 2 và MODE 3, và MODE 1 khi bước tiếp theo là video mới.*

```
STEP 1   Đọc Project Memory
STEP 2   Xác định video_id (format: yt_NNN, pattern tăng dần)
STEP 3   Tải video nguồn
         → yt-dlp -f "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]"
         → Lưu: production/batch_001/<video_id>/<video_id>_source.mp4
STEP 4   Phân tích video thực tế
         → Trích keyframes: ffmpeg -vf "select='not(mod(n,150))',scale=300:-1" -vsync vfr frame_%03d.jpg
         → Mô tả từng keyframe dựa trên hình thật — KHÔNG hallucinate
         → Xác định scene timeline: sản phẩm gì, thời điểm nào, hook/CTA ở đâu
         → GUARD 6 Visual Safety pre-scan: ghi chú keyframe nào có watermark /
           logo brand nguồn / QR / mã vạch / biển số / PII. Đánh dấu vùng (top-right,
           center, frame range) để Repair Playbook xử lý ở STEP 11. Ưu tiên repair:
           blur/mosaic (1) → cover (2) → crop (3) → trim (4) → NEEDS_NEW_CANDIDATE (5).
STEP 5   Tạo scene_input.json
         → Đặt tại: production/batch_001/<video_id>/scene_input.json
         → Schema: video_id, content_goal, target_platform (tiktok|reels|shorts),
                   duration_target_s, tone, affiliate_angle, cta_style,
                   scene_timeline[] (window_start_s, window_end_s, scene_type, visual_summary, notes)
         → scene_type hợp lệ: HOOK | KITCHEN | FILLER | TRANSITION | CTA | OFF_TOPIC
         → Viết Latinized Vietnamese để tránh encoding error trong JSON
STEP 6   Chạy AI Script Writer (Block-Level Budget + Reconciliation v0)
         → pnpm script:generate --input production/batch_001/<video_id>/scene_input.json
         → Đọc output: script_ai_v1.json + script_ai_v1.txt + block_budget_violations
         → Quality report có thêm:
           • budget_mode = "duration" (target = duration × 2.8) HOẶC
             "timeline_aware" (target đã lùi xuống vì aggregate cap < duration target)
           • aggregate_block_cap: tổng cap của các block có voice (vật lý ceiling)
           • duration_based_target: số tham chiếu cũ
           • target_adjustment_reason: lý do target lùi xuống nếu mode=timeline_aware
         → Khi mode=timeline_aware: ĐỪNG hoang mang vì target nhỏ hơn cũ —
           timeline thật chỉ chứa được bấy nhiêu. Pipeline tiếp tục bình thường.
         → Quality status có 3 mức (đọc `quality_report.quality_status` trong JSON,
           hoặc exit code: 0=PASS/NEAR-PASS, 2=FAIL):
           • PASS       → đi tiếp STEP 7 bình thường
           • NEAR-PASS  → đi tiếp STEP 7 NHƯNG ghi vào REPORT TEMPLATE phần
             "Self-review" lý do near-pass (lấy từ `quality_report.near_pass_reason`).
             Không retry — near-pass đã được hệ thống phân loại là chấp nhận được.
           • FAIL       → đọc `quality_report.block_budget_violations`:
             - Nếu có MAJOR violation ở CTA hoặc block khác (>2 từ over cap):
               KHÔNG retry tự động. Đây là cảnh báo scene_input có window quá
               hẹp cho intent đó. Operator phải:
               (a) sửa scene_input.json: widen window của block bị vi phạm,
                   HOẶC giảm duration_target_s nếu tổng target không khả thi,
               (b) rồi rerun /chay từ STEP 5.
             - Nếu chỉ MINOR violations (≤2 từ over cap, intent ≠ CTA):
               Voice Sync overflow_minor envelope sẽ hấp thụ — pipeline tiếp tục.
             - Nếu fail vì lý do khác (banned phrase, hook/CTA mismatch):
               retry 1 lần. Nếu vẫn FAIL: báo user, dừng.
         → **OPERATOR TRIM POLICY (Phần 23 hardening — bài học yt_011)**:
           Nếu Script Writer output FAIL nhưng agent/operator sửa tay (trim
           câu thừa, rút block over-claim, xoá content không khớp visual) để
           đi tiếp pipeline, BẮT BUỘC ghi metadata block sau vào artifact
           `script_ai_v1_extended.json`:
             "operator_trim": {
               "operator_trim_applied": true,
               "original_quality_status": "fail" | "near-pass",
               "original_word_count": <int>,
               "trimmed_blocks": ["b2", "b4", ...],
               "post_trim_word_count": <int>,
               "post_trim_reason": "<lý do trim — eg block budget overflow,
                 over-claim ngoài visual, banned absolute phrase>",
               "post_trim_quality_status": "accepted_after_operator_trim"
                 | "rerun_pass" | "rerun_fail",
               "validator_rerun_status": "rerun_pass" | "rerun_fail"
                 | "not_available",
               "final_used_for_voice_sync": true,
               "validator_rerun_required_for_recommit": <bool>
             }
           → KHÔNG được để artifact giữ nguyên `quality_status: "fail"` stale
             gây hiểu nhầm script chưa xử lý.
           → Nếu có validator độc lập (eg `pnpm script:validate`): PHẢI re-run
             trên content đã trim → ghi `validator_rerun_status` thật.
           → Nếu KHÔNG có validator độc lập: KHÔNG bịa `PASS`. Phải ghi:
             `post_trim_quality_status: "accepted_after_operator_trim"` + giải
             thích evidence (eg Voice Sync pass 6/6 fit, block durations fit
             window, không còn banned phrase).
           → Final report PHẢI ghi đủ: original status / trim applied / lý do
             trim / trimmed blocks / post-trim status / validator status /
             artifact metadata persist chưa.
           → Operator trim CHỈ áp dụng khi vi phạm rõ ràng (over-claim ngoài
             visual, banned absolute, block over budget). KHÔNG dùng để "ép"
             script FAIL vì lý do khác (eg hook yếu, tone sai) đi tiếp.

STEP 7   Đánh giá script
         → Đọc script_ai_v1.txt toàn bộ — có tự nhiên không? Hook kéo view?
         → GUARD 7 R1: script có copy từng câu kiểu dịch cứng từ audio gốc
           không? Nếu có → viết lại trước khi sang Voice Sync.
         → GUARD 7 R3: script có chứa "tốt nhất / rẻ nhất / chính hãng 100% /
           cam kết / đảm bảo / số 1 / duy nhất" không? Nếu có → operator sửa
           thành soft claim trước khi sang Voice Sync.
         → GUARD 7 R5: tone là chia sẻ / trải nghiệm hay đang quảng cáo thô?
           CTA có soft không?
         → Không tô vẽ kết quả — nếu script kém thì nói thật
STEP 8   Voice config
         → VFOS dùng MỘT brand voice duy nhất: `ZqE9vIHPcrC35dZv0Svu` (Eleven v3).
           Lấy từ `ELEVENLABS_VOICE_ID` trong .env — KHÔNG truyền `--voice-id`.
         → KHÔNG random giọng, KHÔNG đổi giọng theo tone video. Một giọng cho mọi video.
         → Multi-preset `voice_01..voice_05` đã retire — KHÔNG dùng lại.
STEP 9   Chạy Block-based Voice Sync (Autonomy v0)
         → pnpm voice:sync --script-json production/batch_001/<video_id>/script_ai_v1_extended.json
                          --output-dir production/batch_001/<video_id>/voice_sync_v0
                          --speed 1.3
         → Voice Sync TỰ XỬ LÝ:
           1. SILENT block (intent=SILENT hoặc line trống) → tự skip, không TTS, không vào timeline.
              Operator KHÔNG cần xoá b8 SILENT khỏi script JSON trước khi chạy.
           2. MAJOR_OVERFLOW (>0.5s) → tự retry 1 lần ở speed +0.1 (cap 1.4):
              • remediated_to_fit / remediated_to_minor → pipeline đi tiếp
              • still_major → exit code 2, dừng pipeline có chủ đích
         → Exit code:
           • 0 → mọi block FIT / overflow_minor / skipped — đi tiếp STEP 10
           • 2 → còn MAJOR_OVERFLOW sau remediation. Đọc bảng QC để biết block nào.
                 Rút text trong script JSON cho block đó (drop câu cuối hoặc rút câu),
                 rồi rerun `pnpm voice:sync --only-blocks <id1>,<id2>`. Vẫn không tự ý đổi voice
                 hoặc nâng speed cap.
STEP 10  Chạy BGM Mix
         → BGM source mặc định: production/batch_001/yt_005/bgm/yt_005_bgm_v2_candidate_b.mp3
           (60s, "Light cheerful, bright piano, warm friendly" — đã validate yt_005 + yt_006)
         → Params đã chốt:
           --bgm-volume 0.0972  (≈ -20.2 dBFS)
           --voice-gain 1.716   (≈ +4.7 dB)
           --final-gain 1.3     (≈ +2.3 dB)
           --bgm-fadein 1.5
           --bgm-fadeout 3.0
         → pnpm bgm:mix --source-video production/batch_001/<video_id>/<video_id>_source.mp4
                        --voice-timeline production/batch_001/<video_id>/voice_sync_v0/<video_id>_voice_timeline.mp3
                        --output-dir production/batch_001/<video_id>/bgm_mix_v1
                        --video-id <video_id>
                        --bgm-file production/batch_001/yt_005/bgm/yt_005_bgm_v2_candidate_b.mp3
                        --bgm-volume 0.0972 --voice-gain 1.716 --final-gain 1.3
                        --bgm-fadein 1.5 --bgm-fadeout 3.0
STEP 11  QC kỹ thuật + GUARD 6 Visual Safety Detect → Repair → Re-QC → Decision
         → Streams: phải có 2 (video + audio)
         → Duration: video ≈ audio, không lệch >0.5s
         → Source audio leak: none detected
         → max_volume: không vượt -1 dBFS (no clipping)
         → GUARD 6 quét preview cuối (kết hợp pre-scan ở STEP 4):
           • Logo / brand / watermark
           • QR code / mã vạch / voucher code
           • Biển số xe / PII (số ĐT, email, địa chỉ, tên người, khuôn mặt)
           Nếu phát hiện: chạy Repair Playbook theo priority:
           1) blur/mosaic (ƯU TIÊN), 2) cover box/sticker, 3) crop nhẹ,
           4) trim đoạn, 5) NEEDS_NEW_CANDIDATE (trigger MODE 3 retry) /
           NEEDS_USER (sau retry exhausted).
           Sau repair → Re-QC trên output → gán Decision Status: PASS /
           PASS_WITH_REPAIR / NEEDS_NEW_CANDIDATE / NEEDS_USER.
           BẮT BUỘC ghi bảng "Detected issue → Repair action → Re-QC result"
           vào REPORT.
         → Ghi rõ từng chỉ số — không bỏ qua
STEP 12  Mở preview cho user
         → Start-Process <path>/bgm_mix_v1/<video_id>_voice_blocks_bgm_preview_vi.mp4
         → Báo đường dẫn file để user click nếu không tự mở được
STEP 12b (CHỈ Shopee-First Lane / MODE 4) — Lập FACEBOOK REELS PUBLISH PLAN
         → Sau khi preview đạt, BẮT BUỘC persist file:
           production/batch_001/<video_id>/facebook_reels_publish_plan.json
         → Schema xem section "FACEBOOK REELS + SHOPEE PUBLISH PLAN v0" bên dưới.
         → publish_status: "not_published" + needs_user_review: true (HARD).
         → KHÔNG auto publish trong scope /chay — đây chỉ là metadata chuẩn bị
           cho operator publish manual sau.
         → Nếu chưa có Shopee Affiliate URL cuối cùng: ghi
           shopee_affiliate_url: "needs_user_input".
STEP 13  SELF-REVIEW (xem checklist bên dưới)
STEP 14  Commit/push nếu đạt
         → Commit: script, manifest, scene_input, docs — KHÔNG commit binary (.mp3, .mp4)
         → Message: "feat: produce <video_id> — script+voice+bgm pilot"
STEP 15  Báo cáo cuối (xem REPORT TEMPLATE bên dưới)
```

---

## TIÊU CHÍ CHỌN VIDEO (dùng cho MODE 3 — auto-source)

Video phù hợp cho Short-form Factory khi:

| Tiêu chí | Yêu cầu |
|---|---|
| Duration | 15–90s (ưu tiên 30–60s) |
| Orientation | Portrait 9:16 (hoặc có thể crop) |
| Nội dung | Demo gadget / đồ gia dụng / đồ bếp — kết quả thấy được rõ ràng |
| Visual quality | Đủ sáng, không blur nặng, sản phẩm nằm trong frame rõ |
| Watermark | Không có watermark TikTok lớn đè lên sản phẩm (logo nhỏ góc OK) |
| Audio | Không quan trọng — sẽ bị thay bằng voice-over AI |
| Vibe | Satisfying demo, không cần diễn xuất — gadget tự "nói" |

Video không phù hợp:
- Quá dài (>90s)
- Landscape không crop được
- Sản phẩm mờ, không nhìn rõ kết quả
- Người diễn quá nhiều, khó reup
- Nội dung không phù hợp affiliate gadget/đồ gia dụng

---

## GUARD CHẤT LƯỢNG

```
GUARD 1 — Script quality (3 mức: PASS / NEAR-PASS / FAIL) + OPERATOR TRIM
  → PASS      → đi tiếp
  → NEAR-PASS → đi tiếp nhưng GHI vào report Self-review:
                  "Script Writer near-pass — {near_pass_reason}".
                Near-pass = (lệch word count nhỏ ≤6 từ ≤12% off target) HOẶC
                (≤2 minor block violations cap ≤2 từ ngoài CTA) — đều với mọi
                guard khác sạch. Không retry — đã được hệ thống chấp nhận.
  → FAIL      → KIỂM TRA `block_budget_violations`:
                - MAJOR (CTA over cap, hoặc non-CTA over >2 từ): KHÔNG retry tự
                  động. Đây là scene_input issue — operator sửa scene_input rồi rerun.
                - Lý do khác: retry 1 lần. Nếu vẫn FAIL: dừng + báo user.
  → Không dùng script FAIL chỉ để "xong pipeline".

  → **OPERATOR TRIM (Phần 23)** — nhánh ngoài retry tự động:
    Khi vi phạm là OVER-CLAIM ngoài visual / banned absolute / block over budget
    nhỏ và operator chọn sửa tay (thay vì rerun toàn bộ scene_input), BẮT BUỘC:
      (a) Ghi metadata `operator_trim` vào artifact script JSON (xem STEP 6
          OPERATOR TRIM POLICY để biết schema).
      (b) Re-run validator nếu có, ghi `validator_rerun_status` thật.
      (c) Nếu không có validator độc lập: dùng `accepted_after_operator_trim`
          + chứng cứ (Voice Sync pass, block fit) — KHÔNG bịa PASS.
      (d) Report PHẢI ghi rõ trim đã dùng để tránh tô vẽ.
    Operator trim KHÔNG được dùng để "lách" GUARD 1 khi script chất lượng kém
    về mặt content (hook yếu, tone sai, CTA cứng) — những lỗi đó phải sửa
    bằng rerun scene_input hoặc rewrite, không trim.

GUARD 2 — Video source quality
  → Nếu không có candidate đủ tốt (MODE 3): trình shortlist, xin user duyệt
  → Không chạy pipeline cho video quá tệ

GUARD 3 — Voice Sync Autonomy v0
  → SILENT block (intent=SILENT hoặc line=""): Voice Sync tự skip, không cần
    operator xoá khỏi script JSON. Manifest ghi `generation_status="skipped"`,
    `skip_reason="silent_intent" | "empty_line"`, `fit_status="skipped"`.
  → overflow_minor (≤0.5s): chấp nhận — log vào manifest
  → overflow_major (>0.5s): Voice Sync tự retry 1 lần ở speed +0.1 (cap 1.4):
    • outcome remediated_to_fit / remediated_to_minor → accept, đi tiếp
    • outcome still_major → exit code 2, dừng pipeline. Operator rút text trong
      script JSON cho block đó rồi `--only-blocks <id>` lại.
  → KHÔNG nâng speed cap quá 1.4 (giọng méo), KHÔNG auto-trim text (sync layer
    không biết câu nào core vs extender)

GUARD 4 — Audio QC
  → Nếu max_volume > -1 dBFS: clipping — điều chỉnh final-gain trước khi báo done

GUARD 5 — Kết quả 75–85% là đủ
  → Không tối ưu vô hạn
  → Đạt ngưỡng dùng được → ghi lại → đi tiếp

GUARD 6 — Visual Safety Detection v1 (LỚP 1 — đúng 3 nhóm)

  Phạm vi GUARD 6 LỚP 1 CHỈ là Visual Safety. KHÔNG dồn vào đây các thứ:
  affiliate mismatch, ad-copy risk, copy-risk, chọn mode/ngách/candidate.
  Những thứ đó nằm ở GUARD 7 (Affiliate & Content Compliance) và AUTO-DECISION
  POLICY (MODE 1).

  Detect 3 nhóm:
    1. Logo / brand / watermark (logo nguồn, TikTok-Douyin handle, brand TQ,
       sticker shop, channel name overlay)
    2. QR code / mã vạch / voucher code (in trên bao bì, in trên màn hình)
    3. Biển số xe / PII (số điện thoại, email, địa chỉ, tên người, biển số xe,
       khuôn mặt rõ của người không liên quan)

  Quy trình bắt buộc: Detect → Repair → Re-QC → Decision.
  KHÔNG reject candidate ngay khi detect. Luôn thử Repair Playbook trước.

  ── GUARD 6 REPAIR PLAYBOOK (priority cao xuống thấp) ──

  Repair priority:
    1. **Blur / mosaic vùng vi phạm** — ƯU TIÊN SỐ 1
       • Dùng cho: logo/brand/watermark, QR/mã vạch, biển số, PII, khuôn mặt.
       • Lý do: giữ nội dung chính tốt nhất, ít làm hỏng frame.
       • ffmpeg: `boxblur=20:5` cho vùng cố định (drawbox + crop + blur),
         hoặc `delogo=x=W-150:y=10:w=140:h=60` cho watermark cố định góc,
         hoặc enable=`'between(t,12,18)'` cho biển số xuất hiện theo frame.

    2. **Cover bằng box / sticker / text overlay**
       • Khi blur/mosaic nhìn xấu hoặc vùng vi phạm quá rõ.
       • ffmpeg: `drawbox=...:color=black@1.0:t=fill`, hoặc overlay PNG sticker
         (logo VFOS / decorative element).

    3. **Crop / zoom nhẹ**
       • CHỈ khi vùng vi phạm nằm sát mép (top/bottom/edge).
       • KHÔNG dùng nếu làm mất sản phẩm/chủ thể chính của frame.
       • Ưu tiên crop top/bottom với portrait 9:16 (cắt 100-150px sát mép).

    4. **Trim đoạn vi phạm**
       • CHỈ khi vi phạm nằm ở intro/outro/cuối video.
       • KHÔNG ảnh hưởng nội dung chính (sản phẩm/demo).

    5. **Fallback**:
       • `NEEDS_NEW_CANDIDATE` — vi phạm xuyên suốt video, không repair sạch
         được, hoặc repair làm video xấu rõ rệt → trigger AUTO-SOURCE RETRY
         POLICY (xem MODE 3 step 4).
       • `NEEDS_USER` — toàn bộ retry exhausted và không có lane khả thi, hoặc
         cần quyết định lớn ngoài scope tự động.

  ── DECISION STATUS (ghi vào báo cáo cuối) ──

  | Status | Ý nghĩa |
  |---|---|
  | `PASS` | Không detect vi phạm visual safety |
  | `PASS_WITH_REPAIR` | Detect vi phạm, repair sạch, re-QC OK |
  | `NEEDS_NEW_CANDIDATE` | Không repair được → trigger retry source |
  | `NEEDS_USER` | Cần user quyết định (sau retry exhausted) |

  ── BẢNG REPAIR BẮT BUỘC TRONG REPORT TEMPLATE ──

  | Detected issue | Repair action | Re-QC result |
  |---|---|---|
  | Ví dụ: Logo top-right frames 0-3s | boxblur top-right 200x100 | PASS_WITH_REPAIR |
  | Ví dụ: License plate frames 12-18 | mosaic plate region with enable='between(t,12,18)' | PASS_WITH_REPAIR |
  | Ví dụ: QR center product | drawbox cover + sticker | PASS_WITH_REPAIR |
  | Ví dụ: Logo covers product entirely | (cannot repair cleanly) | NEEDS_NEW_CANDIDATE |

GUARD 7 — Affiliate & Content Compliance (TÁCH KHỎI GUARD 6)
  Đây KHÔNG phải Visual Safety. Đây là content/affiliate compliance enforced ở
  Script layer + Publish layer. Operator-enforced ở STEP 7 (script review)
  và bước publish (ngoài /chay).

  → R1 — Anti-copy nguồn: KHÔNG copy y nguyên kịch bản / góc dựng / narration
         của video nguồn. Script phải có angle Việt Nam riêng (hook, nhịp, cụm
         từ địa phương). Nếu phát hiện script bám sát từng câu của audio gốc:
         viết lại trước khi sang Voice Sync.
  → R2 — Affiliate product match: affiliate link gắn ở bước publish PHẢI khớp
         đúng sản phẩm trong video (cùng SKU/model). KHÔNG video sản phẩm A gắn
         link sản phẩm B vì "hot hơn" — gây hiểu lầm + risk affiliate ban + risk
         pháp lý quảng cáo gian dối. `/chay` không tự chốt affiliate link
         (publish manual) — guard này nhắc operator ở bước publish.
  → R3 — Banned absolute claims trong script: tránh "tốt nhất", "rẻ nhất",
         "chính hãng 100%", "cam kết", "đảm bảo", "số 1", "duy nhất",
         "không thể tốt hơn", "rẻ nhất thị trường". Nếu Script Writer output
         có 1 trong các cụm này: operator sửa thành soft claim ("mình thấy ổn",
         "dùng được", "phù hợp với mình"). KHÔNG dùng làm hook hoặc CTA.
  → R5 — Soft tone: ưu tiên content kiểu chia sẻ / trải nghiệm / hữu ích
         ("Mình mua cái này về…", "thử dùng thấy…", "nhỏ mà tiện…"). TRÁNH
         quảng cáo thô ("mua ngay", "hàng có sẵn", "click link bio mua liền",
         "săn sale gấp"). CTA soft: "link bio nếu mọi người muốn xem",
         "có ở mô tả nhé".
  (R4 cũ đã ABSORBED vào GUARD 6 Visual Safety — không tồn tại độc lập nữa.)

GUARD 8 — SHOPEE PRODUCT MATCH GUARD (CHỈ áp dụng Shopee-First Lane, TÁCH KHỎI GUARD 6 + GUARD 7)
  Đây KHÔNG phải Visual Safety (GUARD 6) và KHÔNG phải Content Compliance (GUARD 7).
  Đây là guard chấm độ tương đồng giữa sản phẩm trong clip nguồn với sản phẩm
  trong Shopee Product Card. Mục đích: chặn bait-and-switch affiliate
  — KHÔNG cho clip sản phẩm A gắn link Shopee sản phẩm B chỉ vì "cùng ngành".

  Chỉ kích hoạt khi MODE 4 (Shopee-First Lane). MODE 1/2/3 (Video-First) KHÔNG
  chạy GUARD 8 — Video-First dùng GUARD 7 R2 ở Publish layer thay thế.

  (TikTok-Shop-First là future lane defer — không có GUARD 8 variant riêng
  trong giai đoạn này.)

  → Tiêu chí (5 trục, chấm độc lập, ALL phải đạt để CONFIRMED):
    1. **Công dụng tương đồng** — clip demo cùng chức năng với sản phẩm Shopee Card.
       Ví dụ: Card = "miếng lọc rác bồn rửa inox" → clip phải là miếng lọc/chặn
       rác bồn rửa. KHÔNG dùng clip "rổ lọc trà" dù cùng inox.
    2. **Hình dáng / thiết kế tương đồng** — visual sản phẩm trong clip giống
       hoặc gần giống sản phẩm Shopee Card. Material, form factor, kích thước
       relative phải match.
    3. **Cách dùng tương đồng** — thao tác dùng trong clip phù hợp cách dùng
       của sản phẩm Shopee Card. Ví dụ: Card = "khay chia ngăn kéo" → clip phải
       show chia ngăn trong drawer, KHÔNG show xếp tủ kệ.
    4. **Bối cảnh sử dụng tương đồng** — môi trường dùng (bếp, drawer, sink,
       phòng khách) khớp với context Shopee Card.
    5. **Không khác bản chất sản phẩm** — KHÔNG dùng clip tool công nghiệp
       cho sản phẩm gia dụng nhỏ. KHÔNG dùng clip nồi cơm công nghiệp cho
       nồi cơm mini home.

  → Decision Status (3 mức):
    • `MATCH_CONFIRMED`     — 5/5 tiêu chí đạt. Pipeline được phép chạy.
    • `MATCH_NEEDS_REVIEW`  — 4/5 đạt + 1 trục mơ hồ (eg hình dáng gần giống
                              nhưng khác màu/material biến thể). Trình user
                              duyệt clip + Shopee Product Card trước khi đi tiếp.
                              KHÔNG tự ý chạy pipeline.
    • `MISMATCH_REJECT`     — ≥2 trục fail HOẶC trục 5 (khác bản chất) fail.
                              Tự tìm clip khác trong retry limit 3 vòng.
                              Hết retry → trình shortlist + reject log cho
                              user, KHÔNG hỏi sau lần fail đầu.

  → Anti-bait-and-switch (HARD RULE):
    Shopee Affiliate link trong Shopee Product Card phải trỏ về **chính xác
    sản phẩm có trong clip demo**. KHÔNG được dùng clip sản phẩm A gắn link
    Shopee sản phẩm B chỉ vì A và B "cùng ngành" (eg cả 2 đều là organizer,
    hoặc cả 2 đều là đồ bếp). Đây là vi phạm Luật Quảng cáo VN + risk
    affiliate ban + giảm trust người xem.

  → Final report bắt buộc có bảng:
    | Tiêu chí | Shopee Card | Clip | Đạt? |
    |---|---|---|---|
    | 1. Công dụng | ... | ... | ✅/⚠️/❌ |
    | 2. Hình dáng | ... | ... | ✅/⚠️/❌ |
    | 3. Cách dùng | ... | ... | ✅/⚠️/❌ |
    | 4. Bối cảnh | ... | ... | ✅/⚠️/❌ |
    | 5. Bản chất | ... | ... | ✅/⚠️/❌ |
    | **Decision** | | | MATCH_CONFIRMED / NEEDS_REVIEW / MISMATCH_REJECT |
```

---

## FACEBOOK REELS + SHOPEE PUBLISH PLAN v0 (Phần 23)

> **Agent boundary**: thuộc trách nhiệm **Facebook Publish Plan Agent**. Sub-agent này CHỈ chuẩn bị metadata publish — KHÔNG gọi Facebook Graph API, KHÔNG đẩy video lên Reels. Auto-publish vẫn ngoài scope `/chay`.

**Mục tiêu**: sau khi preview MP4 đạt + GUARD 6/7/8 sạch, agent persist 1 file metadata mô tả "kế hoạch publish" để operator dùng tay khi đẩy lên Facebook Reels. KHÔNG auto publish.

**Path**: `production/batch_001/<video_id>/facebook_reels_publish_plan.json`

**Schema bắt buộc**:

| # | Field | Mô tả | Required? |
|---|---|---|---|
| 1 | `video_id` | `yt_NNN` | **bắt buộc** |
| 2 | `created_at` | ISO 8601 timestamp | **bắt buộc** |
| 3 | `phase_ref` | `"Phần 23 Publish Plan v0"` / `"Round 2A Publish Plan Audit v0"` / phần workflow đang chạy | **bắt buộc** |
| 4 | `platform` | Cố định `"facebook_reels"` | **bắt buộc** |
| 5 | `affiliate_platform` | Cố định `"shopee"` (Shopee-First Lane) | **bắt buộc** |
| 6 | `lane` | Cố định `"shopee_first"` (Round 2A) | **bắt buộc** |
| 7 | `product_card_path` | Relative path đến `shopee_product_card.json` (eg `"production/batch_001/yt_011/shopee_product_card.json"`) | **bắt buộc** |
| 8 | `final_video_path` | Relative path đến preview MP4 cuối (eg `"production/batch_001/yt_011/bgm_mix_v1/yt_011_voice_blocks_bgm_preview_vi.mp4"`) | **bắt buộc** |
| 9 | `caption_draft` | Caption Facebook Reels gợi ý (soft tone, gắn link bio convention). Operator sửa tay trước publish. | **bắt buộc** |
| 10 | `cta_text` | CTA cuối caption (eg `"Link ở phần mô tả nha"`) — phải soft, không banned absolute | **bắt buộc** |
| 11 | `shopee_affiliate_url` | URL Shopee Affiliate đã wrap (có UTM source) | **bắt buộc** — nếu chưa có ghi `"needs_user_input"` |
| 12 | `hashtags` | Mảng hashtag gợi ý cho VN audience (eg `["#dogiadung", "#dungcubep", "#meovat"]`). Tên field `hashtags` (Round 2A chuẩn hoá, thay tên cũ `hashtags_suggested`). | **bắt buộc** — có thể mảng rỗng `[]` |
| 13 | `publish_status` | Cố định `"not_published"` ở giai đoạn `/chay` | **bắt buộc** |
| 14 | `needs_user_review` | Cố định `true` — luôn cần operator duyệt trước publish | **bắt buộc** |
| 15 | `publish_blockers` | Mảng các điều kiện chưa đạt. **Round 2A default**: phải gồm tối thiểu `["user_review_required"]`; thêm `"shopee_affiliate_url_pending"` nếu chưa có URL. Mảng rỗng `[]` KHÔNG cho phép ở artifact `/chay` tạo ra (vì `needs_user_review=true` luôn imply `"user_review_required"`). | **bắt buộc** |
| 16 | `notes` | Ghi chú tự do cho operator (eg "Caption cần test 2 variants") | **nếu có ích** |

**HARD RULE — không auto-publish**:
- Agent KHÔNG được gọi Facebook Graph API / Facebook Page API / bất kỳ endpoint publish nào trong scope `/chay`.
- `publish_status` LUÔN ghi `"not_published"`.
- `needs_user_review` LUÔN `true`.
- Việc đẩy video thật lên Facebook Reels là **operator manual step** ngoài scope skill này.

**Khi ghi `shopee_affiliate_url = "needs_user_input"`**:
- `publish_blockers` PHẢI có `"shopee_affiliate_url_pending"`.
- Báo cáo cuối PHẢI nhắc operator phải vào Shopee Affiliate dashboard wrap link trước khi publish.

**Caption draft guideline (R5 soft tone — GUARD 7)**:
- Tone chia sẻ trải nghiệm, không quảng cáo thô.
- KHÔNG dùng "mua ngay", "săn sale", "click link bio mua liền".
- KHÔNG chứa banned absolute (tốt nhất / rẻ nhất / chính hãng 100% / cam kết / đảm bảo / số 1 / duy nhất).
- Có thể dùng pattern: "Mình thấy cái này tiện ghê — link ở phần mô tả nha."

**Default `publish_blockers` policy**:
- Khi `shopee_affiliate_url == "needs_user_input"` → `publish_blockers` PHẢI chứa `"shopee_affiliate_url_pending"`.
- Khi `needs_user_review == true` (luôn luôn ở `/chay` output) → `publish_blockers` PHẢI chứa `"user_review_required"`.
- Khi GUARD 8 đã `MATCH_CONFIRMED` nhưng publish plan vẫn cần operator duyệt caption → ghi thêm `"caption_review_required"`.
- Mảng rỗng `[]` CHỈ được dùng khi tất cả gate đã pass + operator đã verify (ngoài scope `/chay` tạo ra).

**Round 3C — Shopee affiliate link verification (2026-05-24)**:

Shopee Cookie Fetcher giờ trả về thêm 3 field cho mỗi candidate trong `shopee_product_candidates.json`:
- `shopee_affiliate_url`: URL thật để publish (nếu validated), hoặc `"unknown"`.
- `affiliate_link_status`: enum — `VERIFIED_FROM_LONG_LINK` | `GENERATED_BY_CUSTOM_LINK` | `NEEDS_CUSTOM_LINK` | `NEEDS_USER_REVIEW` | `FAILED`.
- `affiliate_link_notes`: lý do (validator output).

Quy tắc `VERIFIED_FROM_LONG_LINK`: `long_link` từ `/api/v3/offer/product/list` phải có ĐỦ: host `shopee.vn`, path `/universal-link/...`, query `gads_t_sig=...`, `utm_medium=affiliates`, `utm_source=an_<digits>`. Khớp đủ → link đã đủ tracking hoa hồng, dùng trực tiếp làm `shopee_affiliate_url`. Validator: [packages/shopee/src/extract.ts:validateShopeeAffiliateLink](packages/shopee/src/extract.ts).

**Publish Plan Agent mapping**:
- `affiliate_link_status ∈ {VERIFIED_FROM_LONG_LINK, GENERATED_BY_CUSTOM_LINK}` → copy thẳng `shopee_affiliate_url` vào field 11 của publish plan; KHÔNG ghi `"shopee_affiliate_url_pending"` vào `publish_blockers`.
- `affiliate_link_status ∈ {NEEDS_CUSTOM_LINK, NEEDS_USER_REVIEW, FAILED}` → ghi `shopee_affiliate_url = "needs_user_input"` (field 11) VÀ thêm `"shopee_affiliate_url_pending"` vào `publish_blockers`; quote `affiliate_link_notes` vào field `notes` cho operator.

**Example caption draft (yt_011 fruit slicer reference, soft tone hợp lệ)**:
```
Mình thử cái dụng cụ thái + tẩy lõi trái cây này, ấn xuống một cái là táo
ra mấy múi đều luôn — đỡ phải gọt từng miếng. Ai cần thì lát mình để link
Shopee ở phần mô tả nha.

#dogiadung #dungcubep #meovat
```
CTA hợp lệ:
- `"Link mình để ở phần mô tả nha."`
- `"Ai cần món này thì lát mình để link Shopee ở comment / mô tả."`

CTA KHÔNG hợp lệ (vi phạm R3/R5):
- `"Mua ngay link bio kẻo hết hàng!"`
- `"Cam kết rẻ nhất Shopee — săn sale gấp!"`

### Facebook package surface + safety (audit Round 2A — 2026-05-24)

**Hiện trạng `packages/facebook/` (commit `6cc2459`)** — đây là tham chiếu để `/chay` biết phần publish có gì sẵn, KHÔNG phải hướng dẫn gọi:

| File | Loại | Phạm vi an toàn |
|---|---|---|
| `src/meta-client.ts` | Generic Graph API client (GET-only) | An toàn — read-only, token never logged |
| `src/test-page.ts` | `testPageConnection()` → `GET /{page_id}` | An toàn — read-only |
| `src/post-page.ts` | `publishTextPost()` → `POST /{page_id}/feed` (text only) | ✅ **HARD GATE (Round 2B 2026-05-24)** — `META_MODE=mock` mặc định, KHÔNG gọi API thật trừ khi `META_MODE=live` |
| `scripts/test-connection.ts` (`pnpm facebook:test`) | Test đọc Page info | An toàn — không publish |
| `scripts/test-post.ts` (`pnpm facebook:test-post`) | Đăng 1 bài text test | ✅ **HARD GATE (Round 2B 2026-05-24)** — mặc định mock, real publish cần ALL: `META_MODE=live` + `--confirm-publish` + page id + token |
| `scripts/get-page-token.ts` (`pnpm facebook:get-page-token`) | Đổi User Token → Page Token | An toàn — read-only |
| `.env.example` | Template, `FACEBOOK_PAGE_ID=` + `FACEBOOK_PAGE_ACCESS_TOKEN=` rỗng | An toàn — không có secret thật commit |

**Reels upload code**: **CHƯA tồn tại**. `src/post-page.ts` chỉ làm text post. Việc upload video Reels là **future scope**, KHÔNG nằm trong `/chay`.

**HARD RULE — `/chay` integration với Facebook package**:
- `/chay` (mọi mode) **TUYỆT ĐỐI KHÔNG** gọi:
  - `pnpm facebook:test-post` (sẽ đăng thật)
  - `publishTextPost()` (sẽ đăng thật)
  - bất kỳ endpoint `POST /{page_id}/feed` hoặc `/{page_id}/videos` nào
  - Reels upload code (nếu sau này tồn tại) trong scope `/chay`
- `/chay` **CHỈ** tạo metadata file `facebook_reels_publish_plan.json`. Việc đẩy thật là **operator manual step** ngoài skill.
- `pnpm facebook:test` (read-only Page connection check) là **operator-only manual command** — `/chay` không tự chạy ngay cả khi safe, vì không cần thiết cho output pipeline.

**Risk gap đã fix (Round 2B 2026-05-24)**:
- `publishTextPost()` giờ có HARD GATE đọc `META_MODE`:
  - `META_MODE=mock` (default, bao gồm unset/empty/bất kỳ giá trị nào khác `live`) → return `{ success: true, postId: "mock_dry_run_<ts>", mode: "mock" }`. KHÔNG gọi Graph API.
  - `META_MODE=live` → real publish, return `{ ..., mode: "live" }`.
- `scripts/test-post.ts` giờ có thêm CLI gate. Real publish cần ĐỒNG THỜI 4 điều kiện:
  1. `META_MODE=live` trong env.
  2. CLI flag `--confirm-publish`.
  3. `FACEBOOK_PAGE_ID` non-empty.
  4. `FACEBOOK_PAGE_ACCESS_TOKEN` non-empty.
  Thiếu bất kỳ điều kiện nào → fallback MOCK + log lý do.
- Script luôn override `process.env.META_MODE = "mock"` trước khi gọi `publishTextPost` khi effective mode là mock — double guard.
- Tokens vẫn KHÔNG bao giờ log full, chỉ mask 8 đầu + 4 cuối.

Xem chi tiết: [packages/facebook/README.md](../../../packages/facebook/README.md).

---

## AGENT-READY RESPONSIBILITY BOUNDARIES (Phần 23 + Phần 24 Architecture v0)

> **Mục đích**: skill `/chay` hiện chạy như monolithic agent. Phần 23 đã thêm boundary cho 4 sub-agent. **Phần 24 (Agent Architecture v0, 2026-05-26)** chốt thêm **agent thứ 5 — Git & Artifact Agent** + **artifact source-of-truth mới `production/_runs/<run_id>/`**. KHÔNG triển khai code multi-agent trong vòng này — chỉ làm rõ responsibility trong SKILL/docs.
>
> **Spec đầy đủ**: `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md`. SKILL.md tóm tắt + bind ràng buộc trực tiếp vào `/chay`.

| Sub-agent (tương lai) | Responsibility | SKILL.md sections | Input | Output artifact |
|---|---|---|---|---|
| **Shopee Product Agent (Commerce Product Agent)** | Resolve link, fetch metadata Shopee, scoring 6 trục, persist Card. **Round 26B primary**: `BROWSER_CDP_TARGETED_CLICK` flow + global link registry dedupe + lock/atomic write. | `SHOPEE CDP TARGETED-CLICK LINK EXTRACTION v0` + `SHOPEE LINK REGISTRY v0` + `REGISTRY CONCURRENCY SAFETY` + `CDP CONNECTION FAILURE POLICY` + `SELECTOR RESILIENCE` + `TARGETED CLICK POLICY` + `SHOPEE PRODUCT CARD` + `SHOPEE SHORT LINK SUPPORT` + `SHOPEE PRODUCT DISCOVERY MODE` + `SHOPEE PRODUCT SELECTION SCORING` + GUARD 8 trục 1–5 input data | URL Shopee / short link / lane keyword / CDP browser session | `shopee_product_card.json` + `production/_commerce/shopee_link_registry.json` |
| **Demo Match Agent** | Tìm video/demo tương đồng, chấm GUARD 8 product match, retry candidate | `NGUỒN VIDEO/DEMO THAM KHẢO` + PF-STEP 3–4 + GUARD 8 (5 trục match) + AUTO-SOURCE RETRY POLICY | `shopee_product_card.json` | Match result + chosen video URL + GUARD 8 table |
| **Script QC Agent** | Run Script Writer, validator, OPERATOR TRIM POLICY, GUARD 1 + GUARD 7 R1/R3/R5 enforce | STEP 6 + STEP 7 + OPERATOR TRIM POLICY + GUARD 1 + GUARD 7 (R1/R3/R5 phần script layer) | `scene_input.json` | `script_ai_v1_extended.json` + (nếu cần) `operator_trim` metadata block |
| **Facebook Publish Plan Agent** | Lập publish plan metadata, draft caption + CTA, KHÔNG gọi Graph API | STEP 12b + `FACEBOOK REELS + SHOPEE PUBLISH PLAN v0` + GUARD 7 R5 (caption soft tone) | Preview MP4 + Card + GUARD 8 result | `facebook_reels_publish_plan.json` |
| **Git & Artifact Agent** (Phần 24) | Stage / commit / push code + docs + manifest + JSON artifact. Cập nhật `TRANG_THAI_VFOS_HIEN_TAI.md`. **CHỈ chạy khi prompt cho phép rõ ràng.** | `HARD CONSTRAINTS` (Phần 24 commit rule) + Mục 6 `VFOS_AGENT_ARCHITECTURE_V0.md` | Working tree state + commit chỉ thị từ prompt | Commit (+ optional push) + updated state doc |

**Boundary rules (HARD)**:
- Mỗi sub-agent **chỉ đọc/ghi artifact của mình + đọc artifact upstream**. KHÔNG cross-write.
- **State sharing qua file artifact** (JSON), KHÔNG qua biến process / message bus toàn cục — tương thích `.claude/rules/design.md`.
- **Artifact source of truth** (Phần 24): **`production/_runs/<run_id>/...`** cho mọi run mới sau khi pipeline migrate. Trước migration: `production/batch_001/<video_id>/...` vẫn dùng tạm. Report `/chay` phải ghi rõ SoT path thực tế đang ghi.
- KHÔNG có overlap responsibility:
  - Resolve Shopee link CHỈ Shopee Product Agent. Demo Match Agent đọc `shopee_product_card.json`, không gọi lại Shopee.
  - Script writer + validator CHỈ Script QC Agent. Facebook Publish Plan Agent đọc script + preview, không sửa script.
  - Caption draft CHỈ Facebook Publish Plan Agent. Script QC Agent KHÔNG viết caption.
  - **Commit/push CHỈ Git & Artifact Agent.** 4 agent kia KHÔNG được tự gọi `git commit` / `git push` từ flow của mình.
- Các Guard chéo:
  - GUARD 6 Visual Safety: chạy ở STEP 4 + STEP 11 — không thuộc 1 sub-agent cụ thể (pipeline-level guard).
  - GUARD 7 R2 product match: enforce ở Publish layer — Facebook Publish Plan Agent verify `product_card_path` khớp `final_video_path` trước khi mark ready.
  - GUARD 7 R1/R3/R5 script-layer: thuộc Script QC Agent.
  - GUARD 7 R5 caption-layer: thuộc Facebook Publish Plan Agent.
  - GUARD 8: input data field từ Shopee Product Agent (5 trục về sản phẩm Card), match scoring từ Demo Match Agent (5 trục match với clip).

**Git & Artifact Agent — Khi nào được commit/push** (Phần 24):
- **CHỈ** khi prompt user chứa chỉ thị rõ: `"commit"`, `"push"`, `"commit + push"`, `"commit và push"`, `"commit với message ..."`, `"đẩy lên git"`, hoặc `"tạo PR"`.
- Nếu prompt có commit message cụ thể → dùng đúng message đó, không tự đặt lại.
- Nếu prompt KHÔNG nhắc commit/push → tuyệt đối KHÔNG tự commit cuối turn "vì đã xong việc".
- Trước commit: chạy `git status` + `git diff --cached --stat`, verify không có binary (`.mp4`/`.mp3`/`.wav`) hay `.secrets/` lẫn trong staging.
- Sau commit: cập nhật commit hash vào mục 10 `TRANG_THAI_VFOS_HIEN_TAI.md`.

**Decision boundary** (sau Phần 23 + Phần 24):
- KHÔNG implement multi-agent code trong vòng này.
- KHÔNG tạo `.claude/agents/<name>.md` cho 5 sub-agent trong vòng này.
- KHÔNG migrate artifact `production/batch_001/<video_id>/` hiện có sang `production/_runs/<run_id>/` — pipeline code chưa sửa, migrate sớm sẽ orphan.
- Skill `/chay` vẫn chạy monolithic. Boundary chỉ là **kỷ luật viết SKILL** sao cho khi tách ra dễ.

---

## SELF-REVIEW CHECKLIST

Bắt buộc chạy trước khi báo "hoàn thành":

```
[ ] Video source: tải thành công, đúng format, đúng duration?
[ ] Keyframes: mô tả dựa trên hình thật, không hallucinate?
[ ] scene_input.json: schema hợp lệ, scene_type đúng enum?
[ ] Script Writer: PASS quality guard? Hook/CTA không cứng?
[ ] Voice Sync: tất cả blocks FIT / overflow_minor / skipped? Không có MAJOR sót lại?
[ ] BGM Mix: 2 streams? Không clipping? Không leak source audio?
[ ] Preview: đã mở và có thể play?
[ ] Binary media: KHÔNG nằm trong git commit?
[ ] Manifest JSON: ghi đủ params để reproduce?
[ ] Nếu phát hiện lỗi rõ ràng trong scope: đã sửa chưa?
[ ] Báo cáo: đủ thông tin audit, không tô vẽ?
[ ] GUARD 6 Visual Safety: detect xong 3 nhóm (logo/brand/watermark, QR/mã vạch, biển số/PII)?
[ ] GUARD 6 Repair: vi phạm đã chạy Repair Playbook (priority blur/mosaic số 1)?
[ ] GUARD 6 Decision Status: gán đúng PASS / PASS_WITH_REPAIR / NEEDS_NEW_CANDIDATE / NEEDS_USER?
[ ] GUARD 6 Report: bảng "Detected issue → Repair action → Re-QC result" đã ghi vào REPORT?
[ ] GUARD 7 R1 anti-copy: Script không copy y nguyên góc dựng / narration nguồn?
[ ] GUARD 7 R2 product match: Affiliate target khớp đúng sản phẩm trong video (nhắc bước publish)?
[ ] GUARD 7 R3 banned absolute: Script không chứa từ tuyệt đối (tốt nhất / rẻ nhất / chính hãng 100% / cam kết / đảm bảo / số 1 / duy nhất)?
[ ] GUARD 7 R5 soft tone: Chia sẻ / trải nghiệm, không quảng cáo thô?
[ ] AUTO-DECISION POLICY: KHÔNG hỏi user "chọn mode / chọn ngách / chọn candidate" khi memory đủ rõ?
[ ] AUTO-SOURCE RETRY: candidate fail thì retry tối đa 3 vòng với keyword cải thiện trước khi hỏi user?
[ ] (Shopee-First Lane only) Shopee Product Card có đủ schema mở rộng Phần 23 (24 field, bắt buộc 1–5 + 10 + 19–24)? Field unknown ghi "unknown", không bịa giá/hoa hồng/sales/rating/review/shop?
[ ] (Shopee-First Lane only) **Card đã PERSIST trên disk** tại `production/batch_001/<video_id>/shopee_product_card.json` TRƯỚC khi sang PF-STEP 3? File JSON parse được? (HARD GATE Phần 23)
[ ] (Shopee-First Lane only) `selection_scoring` đã chấm đủ 6 trục + `decision` + `decision_note` trong Card?
[ ] (Shopee-First Lane only) `data_source_notes` ghi rõ nguồn từng field (paste/dashboard/resolve/unknown)?
[ ] (Shopee-First Lane only) data_confidence (high/medium/low) phản ánh trung thực số field unknown?
[ ] (Shopee-First Lane only) Nếu input là short link `s.shopee.vn/...` → đã resolve canonical URL + lưu `short_url_original` + `canonical_url` + `shopid` + `itemid` vào Card?
[ ] (Shopee-First Lane only) GUARD 8 Shopee Product Match: 5/5 tiêu chí PASS = MATCH_CONFIRMED? Có bảng "Shopee Card | Clip | Đạt?" trong report?
[ ] (Shopee-First Lane only) Shopee Affiliate link trong Card khớp đúng sản phẩm trong clip (không bait-and-switch A→B)?
[ ] (Shopee-First Lane only) **Facebook Reels Publish Plan đã persist** tại `production/batch_001/<video_id>/facebook_reels_publish_plan.json`? `publish_status="not_published"` + `needs_user_review=true`? (Phần 23 hardening)
[ ] (Shopee-First Lane only) Publish Plan `publish_blockers` có tối thiểu `"user_review_required"`? Có `"shopee_affiliate_url_pending"` nếu URL chưa wrap? (Round 2A 2026-05-24)
[ ] (Shopee-First Lane only) Publish Plan schema dùng tên field chuẩn hoá `hashtags` (KHÔNG dùng tên cũ `hashtags_suggested`)? Có field `lane="shopee_first"`?
[ ] (Shopee-First Lane only) Publish Plan caption draft soft tone (R5), không banned absolute (R3)?
[ ] (Round 2A) `/chay` KHÔNG gọi `pnpm facebook:test-post` / `publishTextPost()` / bất kỳ endpoint `POST /{page_id}/feed` hoặc `/videos` nào? Publish luôn manual operator step?
[ ] (Operator trim — nếu áp dụng) Script artifact có metadata `operator_trim` đầy đủ (original_quality_status, post_trim_reason, trimmed_blocks, post_trim_quality_status, validator_rerun_status, final_used_for_voice_sync)? KHÔNG bịa PASS khi không có validator độc lập?
[ ] (Shopee Discovery Mode only) Shopee Product Selection Scoring đã chấm đủ 6 trục? Decision PRODUCT_SELECTED / PRODUCT_NEEDS_USER_REVIEW / PRODUCT_REJECTED rõ ràng?
[ ] (Shopee Discovery Mode only) Không bịa link Shopee/product/giá/hoa hồng/sales/rating? Nếu không có quyền lấy data Shopee trực tiếp → đã báo limitation rõ + xin user dán link Shopee?
[ ] (Shopee Discovery Mode only) Tự chọn candidate khi ≥1 PRODUCT_SELECTED rõ — KHÔNG hỏi user lựa chọn nhỏ khi memory + scoring đủ rõ?
[ ] (Lane scope) KHÔNG hỏi user "Shopee hay TikTok Shop" — TikTok Shop là future lane defer (Phần 22), mặc định Shopee?
[ ] (Round 25 Auto-Run Controller) Đã parse args theo Command Aliases (Section A)? Args không match → ERR_AMBIGUOUS_NEXT_STEP, không đoán?
[ ] (Round 25) Active video resolve theo priority B (memory → scan)? Nhiều candidate → FAIL ERR_AMBIGUOUS_NEXT_STEP, không hỏi A/B/C?
[ ] (Round 25 Locked State Matrix) Đã đọc state theo đúng thứ tự ưu tiên 1–8 (Section C)? Trạng thái match đúng deterministic table?
[ ] (Round 25 No Rerender) Final video + publish_plan tồn tại → trả DONE_WAITING_USER_REVIEW, không rerender trừ lệnh explicit?
[ ] (Round 25 Infinite Loop) Agent FAILED ở run hiện tại → block bằng ERR_PREVIOUS_RUN_FAILED_LOCKED? Chỉ unlock khi --force-retry / --reset?
[ ] (Round 25) retry_count, retry_allowed, force_retry_used đã ghi vào artifact retry log? Không vượt max_retry?
[ ] (Round 25 Cold Start) Không artifact + có URL Shopee → cold start Commerce Product Agent? Có keyword → Discovery Mode? Không gì → ERR_COLD_START_INPUT_MISSING?
[ ] (Round 25 Permission) Action không vi phạm Permission Boundary (Section H — no publish API, no cookie misuse, no force push, no commit ngoài /chay commit)?
[ ] (Round 25 Subtitle) Variants generated/rejected log đúng số thật? Selected variant pass blocklist Section I (banned absolute, medical claim, misleading)?
[ ] (Round 25 Report Format) Report ngắn 8 field khi SUCCESS/DONE? Báo dài chỉ khi FAIL/SUSPENDED/security/user yêu cầu chi tiết?
[ ] (Round 25 Reason Codes) reason_code thuộc canonical enum (Section K)? Không tự bịa code mới?
[ ] (Round 25B Path) Đã scan CẢ production/_runs/ và production/batch_001/?
[ ] (Round 25B Path) Nếu _runs và batch_001 conflict → ERR_STATE_CONFLICT (không hỏi A/B/C, không merge mù)?
[ ] (Round 25B Resume) Resume timeout từ chối run stale với ERR_RESUME_EXPIRED_STATE / ERR_SYS_EXIT_GATE_TIMEOUT?
[ ] (Round 25B Resume) /chay <video_id> resume bị chặn nếu FAILED_TIMEOUT — chỉ --reset mới tạo run mới?
[ ] (Round 25B Precedence) Command precedence đúng thứ tự: --reset > rerender > --force-retry > plan/status > normal?
[ ] (Round 25B Precedence) --force-retry trên video DONE → ERR_FINAL_VIDEO_EXISTS_NO_RERENDER (KHÔNG tự rerender)?
[ ] (Round 25B Rerender) Rerender explicit tạo version mới (v2_3 / v3 / run_id mới) + KHÔNG xoá final cũ? Update publish_plan chỉ sau QC PASS?
[ ] (Round 26B CDP) BROWSER_CDP_TARGETED_CLICK là primary flow Shopee link extraction? Flow cũ chỉ DEPRECATED/FALLBACK?
[ ] (Round 26B CDP) Connect CDP retry max 3 lần + ERR_CDP_BROWSER_NOT_FOUND nếu fail? Không tự nhập password/OTP?
[ ] (Round 26B CDP) Chỉ thao tác tab `affiliate.shopee.vn/offer/product_offer`? Tab không có → ERR_CDP_TARGET_TAB_NOT_FOUND?
[ ] (Round 26B Selector) Selector chiến lược ưu tiên text/aria/card-scoped > stable data-* > controlled CSS fallback? KHÔNG random class hash?
[ ] (Round 26B Selector) Button không tìm thấy → ERR_LINK_BUTTON_NOT_FOUND? Nhiều button không scope được → ERR_AMBIGUOUS_LINK_BUTTON?
[ ] (Round 26B Click Policy) Không click setting/account/security/logout/payment/publish/post? Không random click? max_clicks_per_batch ≤ 5?
[ ] (Round 26B Registry) Mọi write registry qua `upsertEntry()` / `appendRejected()` (lock + atomic write)? Không write trực tiếp?
[ ] (Round 26B Registry) Lock acquire/release đúng pattern (try/finally)? Read AFTER lock? Merge per-entry không replace bulk?
[ ] (Round 26B Registry) Stale lock → ERR_LINK_REGISTRY_STALE_LOCK báo operator, KHÔNG tự xoá?
[ ] (Round 26B Dedup) Dedup priority shopid+itemid > canonical > short_link > normalized name? Pre-click check + post-resolve recheck?
[ ] (Round 26B Owner) Validate `expected_affiliate_owner_id` = an_17376660568 trên `utm_source`/`mmp_pid`? Mismatch → appendRejected, không vào entries?
[ ] (Round 26B Audit) Không xoá flow cũ trong vòng này? Không commit hàng loạt untracked script chưa audit?
```

---

## HARD CONSTRAINTS

```
KHÔNG BAO GIỜ:
  × Commit binary media (.mp4, .mp3) — đã có .gitignore
  × Publish lên Facebook / TikTok
  × Echo đầy đủ API key ra terminal
  × Chạy pipeline cho nhiều video trong 1 lần /chay
  × Giả vờ "đã xem" video nếu không thật sự xem được
  × Tô vẽ kết quả chưa kiểm chứng
  × Mở rộng sang longform dubbing / vietsub
  × Build router đa loại video / Con số 2
  × Tự ý auto-publish
  × Copy y nguyên kịch bản / góc dựng từ video nguồn (vi phạm GUARD 7 R1)
  × Gắn affiliate link không khớp sản phẩm trong video (vi phạm GUARD 7 R2)
  × Để script đi qua Voice Sync khi còn từ tuyệt đối: tốt nhất / rẻ nhất /
    chính hãng 100% / cam kết / đảm bảo / số 1 / duy nhất (vi phạm GUARD 7 R3)
  × Để watermark / logo brand nguồn / QR / mã vạch / biển số / PII leak ra
    preview cuối (vi phạm GUARD 6 Visual Safety — luôn ưu tiên Repair Playbook
    blur/mosaic trước khi reject)
  × Viết CTA quảng cáo thô kiểu "mua ngay" / "săn sale gấp" (vi phạm GUARD 7 R5)
  × Hỏi user "chọn mode nào / chọn ngách nào / chọn candidate nào" khi Project
    Memory đã ghi next step rõ (vi phạm AUTO-DECISION POLICY)
  × Reject candidate fail GUARD 6 ngay mà không chạy Repair Playbook
    (blur/mosaic là ưu tiên số 1)
  × Hỏi user sau lần fail đầu tiên — phải retry MAX 3 vòng với keyword cải
    thiện trước (vi phạm AUTO-SOURCE RETRY POLICY)
  × Hard-code 1 ngách cố định cho /chay — phải đọc CHANNEL/LANE PROFILE
  × (Shopee-First Lane) Bịa giá / hoa hồng / sales / rating / review / shop_name
    trong Shopee Product Card — luôn ghi "unknown" nếu không lấy được data
    trực tiếp. data_confidence phải phản ánh trung thực (high/medium/low).
  × (Shopee-First Lane) Chạy pipeline khi GUARD 8 = MISMATCH_REJECT chưa
    qua retry — phải retry tìm clip khác, không bypass
  × (Shopee-First Lane) Dùng clip sản phẩm A gắn Shopee Affiliate sản phẩm
    B vì "cùng ngành" — đây là bait-and-switch, vi phạm GUARD 8 trục 5
    (khác bản chất) + GUARD 7 R2
  × (Shopee Discovery Mode) Bịa link Shopee / bịa product name khi không
    lấy được data thật — phải báo limitation + xin user dán link Shopee
  × (Shopee Discovery Mode) Chọn sản phẩm thuộc nhóm rủi ro (y tế / mỹ
    phẩm chức năng / brand lớn IP risk / thuốc) mà không hỏi user — trục 6
    (risk) thấp luôn phải trình user
  × (Shopee Discovery Mode) Bỏ qua SHOPEE PRODUCT SELECTION SCORING 6 trục,
    tự chọn candidate theo cảm tính — phải chấm scoring + log decision
  × (Shopee Discovery Mode) Hỏi user "chọn sản phẩm nào" khi ≥1 candidate
    đã đạt PRODUCT_SELECTED rõ — vi phạm AUTO-DECISION POLICY Shopee-First
  × Hỏi user "Shopee hay TikTok Shop" — TikTok Shop là future lane DEFER
    (Phần 22 pivot 2026-05-22). Mặc định Shopee. KHÔNG mở scope TikTok Shop
    nếu user không yêu cầu mở lại lane đó.
  × Triển khai tool/scraper/scoring TikTok Shop trong scope hiện tại —
    TikTok Shop là future lane, KHÔNG thiết kế sâu trong giai đoạn này
  × Coi Shopee-First Lane là replacement của Video-First — đây là LANE
    SONG SONG trong khung đa-lane, KHÔNG thay thế default MODE 1/2/3
  × (Shopee-First Lane — Phần 23) Để Shopee Product Card chỉ tồn tại trong
    chat / log / message — PHẢI persist file `shopee_product_card.json` trên
    disk TRƯỚC khi sang PF-STEP 3 (bài học yt_011)
  × (Shopee-First Lane — Phần 23) Fail Shopee short link `s.shopee.vn/...`
    chỉ vì user không có canonical URL — short link là input HỢP LỆ, phải
    resolve redirect rồi mới fail nếu thật sự không parse được
  × (Shopee-First Lane — Phần 23) Bịa shopid/itemid/canonical URL khi resolve
    fail — phải báo limitation + xin user paste canonical URL
  × (Phần 23 OPERATOR TRIM) Sửa tay script JSON/text mà KHÔNG ghi metadata
    `operator_trim` block — gây stale `quality_status: "fail"` hiểu nhầm
  × (Phần 23 OPERATOR TRIM) Bịa `post_trim_quality_status: "PASS"` khi không
    có validator độc lập — phải dùng `"accepted_after_operator_trim"` + ghi
    evidence thật (Voice Sync pass, block fit, không còn banned phrase)
  × (Phần 23 OPERATOR TRIM) Dùng trim để "lách" GUARD 1 khi vi phạm là content
    quality (hook yếu, tone sai, CTA cứng) — trim CHỈ áp dụng cho vi phạm
    rõ ràng (over-claim ngoài visual, banned absolute, block over budget nhỏ)
  × (Phần 23 PUBLISH PLAN) Tự gọi Facebook Graph API / Facebook Page API /
    bất kỳ endpoint publish nào trong scope `/chay` — publish luôn manual
    operator step
  × (Round 2A 2026-05-24) Tự chạy `pnpm facebook:test-post` trong scope
    `/chay` — kể cả sau Round 2B có HARD GATE, đây vẫn là operator-only
    manual command, KHÔNG dùng trong pipeline `/chay`.
  × (Round 2A 2026-05-24) Gọi `publishTextPost()` từ `@vfos/facebook` trong
    scope `/chay` — kể cả với `META_MODE=mock` (an toàn về API call), việc
    publish/dry-run vẫn là operator concern, không phải pipeline concern.
  × (Round 2B 2026-05-24) Đổi `META_MODE` sang `live` trong `.env` mà
    không có operator review thủ công — mặc định LUÔN là `mock`.
  × (Round 2B 2026-05-24) Pass `--confirm-publish` flag mà chưa có user
    duyệt thủ công cho từng publish — flag này KHÔNG được set tự động.
  × (Round 2C 2026-05-24) Tự chạy `pnpm shopee:login` trong scope `/chay` —
    script này mở headed browser + cần user login + captcha thủ công.
    Đây là operator-only manual command.
  × (Round 2C 2026-05-24) Tự chạy `pnpm shopee:fetch` trong scope `/chay` —
    script này dùng local browser session ở `.secrets/`, cần user duyệt
    launch browser. `/chay` CHỈ đọc artifact đã có, không tự fetch.
  × (Round 2C 2026-05-24) Paste raw cookie / SPC_EC / SPC_ST / csrftoken /
    storage state vào chat / `.env` / docs / artifact — session CHỈ ở
    `.secrets/` (gitignored).
  × (Round 2C 2026-05-24) Commit bất kỳ thứ gì trong `.secrets/` — đã
    gitignored, nhưng phải verify mỗi commit không có file `.storage_state.json`
    / `.session.json` / `.cookies.json` / DOM snapshot HTML.
  × (Round 2A 2026-05-24) Triển khai Reels upload code (`POST /{page_id}/videos`
    upload phase) trong scope `/chay` — Reels upload là future scope, cần
    user duyệt mở scope mới riêng.
  × (Phần 23 PUBLISH PLAN) Set `publish_status` khác `"not_published"` hoặc
    `needs_user_review` khác `true` trong artifact `/chay` tạo ra
  × (Phần 23 AGENT BOUNDARIES) Cross-write artifact của sub-agent khác —
    eg Demo Match Agent KHÔNG được sửa `shopee_product_card.json`, Facebook
    Publish Plan Agent KHÔNG được sửa `script_ai_v1_extended.json`
  × (Phần 24 AGENT ARCHITECTURE v0) Tự `git commit` / `git push` khi prompt
    user KHÔNG nhắc commit/push. Cuối turn không có chỉ thị commit →
    KHÔNG commit "vì đã xong việc". CHỈ Git & Artifact Agent commit, và
    CHỈ khi prompt cho phép rõ ràng (xem spec
    `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md` mục 6).
  × (Phần 24) Đổi commit message do user đưa — phải dùng đúng message,
    không tự "polish" hoặc thêm prefix.
  × (Phần 24) 4 sub-agent kia (Shopee Product / Demo Match / Script QC /
    Facebook Publish Plan) tự gọi `git commit` / `git push` từ flow của
    mình — commit/push CHỈ là việc của Git & Artifact Agent.
  × (Phần 24 SoT) Migrate artifact đang nằm trong `production/batch_001/
    <video_id>/` sang `production/_runs/<run_id>/` khi pipeline code chưa
    được sửa — migrate sớm sẽ orphan reference. Đợi vòng v1 migration
    user duyệt.
  × (Phần 24 SoT) Bỏ qua việc ghi rõ SoT path thực tế trong report khi
    `/chay` thật sự chạy — phải ghi "SoT path: `production/batch_001/
    <video_id>/` (pre-migration, Phần 24 spec sẽ chuyển `production/
    _runs/<run_id>/`)" để tracking minh bạch.
  × (Round 25 AUTO-RUN CONTROLLER) Hỏi user A/B/C khi nhiều candidate
    cùng hợp lệ — phải FAIL với `ERR_AMBIGUOUS_NEXT_STEP` + báo danh
    sách candidate, KHÔNG đoán.
  × (Round 25) Rerender khi final video đã tồn tại và publish_plan trỏ
    đúng path — phải trả `DONE_WAITING_USER_REVIEW`, chỉ rerender khi
    user gõ explicit `/chay <video_id> rerender` / `final-reels-render`.
  × (Round 25) Tự retry agent đã FAILED ở run hiện tại — phải block
    bằng `ERR_PREVIOUS_RUN_FAILED_LOCKED`, chỉ unlock bằng
    `--force-retry` hoặc `--reset`.
  × (Round 25) Retry vô hạn OpenAI / ElevenLabs / yt-dlp / ffmpeg /
    Shopee fetch — `retry_count` PHẢI ghi vào artifact, vượt
    `max_retry` → `ERR_RETRY_BUDGET_EXHAUSTED`.
  × (Round 25) Tự chuyển sang video_id khác khi user nhập
    `/chay <video_id>` cụ thể — phải dùng đúng video_id đó dù memory
    có ghi active là cái khác.
  × (Round 25) Report dài khi `status = SUCCESS` / `DONE` thường —
    chỉ 8 field ngắn (Auto-Run Controller Section J). Báo dài chỉ
    khi FAIL / SUSPENDED / security issue / user yêu cầu chi tiết.
  × (Round 25 Subtitle policy) Log `"0 rejected"` khi thực tế có
    variant chứa banned claim — phải log đúng `rejected_count` +
    `rejection_reasons`. KHÔNG hợp thức hóa variant rủi ro bằng cách
    thêm "có thể" / "mình thấy" để né (loophole, vi phạm GUARD 7 R3).
  × (Round 25 Cold start) Báo "thiếu artifact" ngay khi không có
    artifact trong `production/_runs/<run_id>/` hoặc
    `production/batch_001/<video_id>/` — phải phân biệt input
    (URL Shopee / keyword / không có gì) rồi trả reason_code đúng.
  × (Round 25B Path resolution) Chỉ scan `production/batch_001/` mà
    bỏ qua `production/_runs/<run_id>/` — phải scan CẢ 2 vùng, ưu
    tiên `_runs` làm SoT khi có. Conflict giữa 2 vùng → ERR_STATE_CONFLICT,
    KHÔNG merge mù quáng.
  × (Round 25B Path resolution) Bỏ ghi `state_source_path` /
    `artifact_source_path` / `namespace_mode` trong report — bắt buộc
    có 3 field để tracking minh bạch giai đoạn migration.
  × (Round 25B Resume) Resume một waiting_state đã quá timeout —
    `/chay resume` PHẢI từ chối với ERR_RESUME_EXPIRED_STATE hoặc
    ERR_SYS_EXIT_GATE_TIMEOUT. KHÔNG tự reset, KHÔNG tự force-retry
    để "cứu" state chết.
  × (Round 25B Resume) Resume run đã FAILED_TIMEOUT — chỉ `--reset`
    mới tạo run/state mới. `--force-retry` không unlock timeout state.
  × (Round 25B Command precedence) `--force-retry` bypass No Rerender
    Rule trên video DONE_WAITING_USER_REVIEW — PHẢI trả
    ERR_FINAL_VIDEO_EXISTS_NO_RERENDER. Chỉ `rerender` / `final-reels-render`
    / `--reset` / prompt explicit mới bypass.
  × (Round 25B Rerender) Xoá final cũ khi rerender — phải giữ history
    (v1, v2, v2_3, v3…). Update `publish_plan` CHỈ sau QC PASS;
    QC FAIL → giữ `publish_plan` trỏ về bản final cũ đang pass.
  × (Round 25B Rerender) Rerender ngầm khi user chỉ gõ `/chay <id>`
    hoặc `/chay <id> --force-retry` — thiếu chữ rõ "rerender" /
    "render lại" / "tạo lại final" / `final-reels-render` / `--reset`
    → ERR_RERENDER_REQUIRES_EXPLICIT_COMMAND.
  × (Round 26B CDP) Dùng flow nào khác CDP làm primary cho Shopee
    link extraction — `BROWSER_CDP_TARGETED_CLICK` là PRIMARY duy nhất.
    Flow cũ (`shopee:login` storage_state / HAR / cookie fetcher /
    Open API) chỉ là DEPRECATED / FALLBACK, cần user explicit cho phép.
  × (Round 26B CDP) Random click bất kỳ element nào ngoài product
    card target — phải scope vào card chứa product_name. Vi phạm =
    ERR_AMBIGUOUS_LINK_BUTTON hoặc cấm hoàn toàn.
  × (Round 26B CDP) Click setting / account / security / logout /
    payment / publish / post / send button — chỉ click "Lấy link"
    button trong scope card hợp lệ.
  × (Round 26B CDP) Tự nhập password / OTP / Gmail credential khi
    gặp login wall — status=SUSPENDED, reason=ERR_AUTH_REQUIRED,
    user tự login thủ công trong browser.
  × (Round 26B CDP) Lưu Gmail/Shopee password vào `.env` / chat /
    artifact / docs.
  × (Round 26B CDP) Log cookie / session / SPC_EC / SPC_ST /
    csrftoken / Cookie: / Set-Cookie / auth header / API key
    (kể cả masked đầy đủ > 12 char).
  × (Round 26B CDP) Click quá `max_clicks_per_batch = 5` sản phẩm
    trong 1 lần chạy — phải dừng kể cả khi gặp nhiều duplicate.
  × (Round 26B CDP) Fallback tự động sang shopee:login / cookie
    fetcher / HAR / Shopee private API khi CDP fail —
    ERR_CDP_BROWSER_NOT_FOUND / ERR_CDP_TARGET_TAB_NOT_FOUND báo
    operator, agent KHÔNG tự fallback.
  × (Round 26B Registry) Ghi registry KHÔNG qua module
    `link-registry.ts` (lock + atomic write) — write trực tiếp
    JSON là forbidden, race condition.
  × (Round 26B Registry) Đọc registry trước khi acquire lock rồi
    dùng snapshot đó để ghi sau — phải đọc lại AFTER lock.
  × (Round 26B Registry) Replace toàn bộ `entries[]` bằng dữ liệu
    stale — chỉ append / merge per-entry. Match dedup → update
    `times_seen++` + `last_seen_at`, không ghi đè entry cũ.
  × (Round 26B Registry) Tự xoá stale lock file — owner process
    có thể vẫn chạy. ERR_LINK_REGISTRY_STALE_LOCK → operator
    inspect + remove manually.
  × (Round 26B Selector) Dùng random CSS class / hash selector làm
    primary lookup — Shopee đổi class thường xuyên. Phải ưu tiên
    text/aria/card-scoped strategy.
  × (Round 26B Selector) Click theo tọa độ (x, y) trừ khi user
    explicit approve cho task cụ thể.
  × (Round 26B Audit) Xoá hàng loạt code flow cũ (shopee:login,
    fetch-offers-cookie, HAR scripts) trong Round 26B — chỉ đánh
    dấu DEPRECATED / FALLBACK trong docs/skill. Xoá là round
    riêng sau khi CDP flow chạy thật ≥3 lần ổn định.
  × (Round 26B Audit) Commit hàng loạt untracked scripts mà chưa
    audit từng file (safety / hardcoded secret / random click /
    selector dependency).

CHỈ LÀM TRONG SCOPE:
  ✓ 1 video mỗi lần /chay
  ✓ Short-form ≤90s, portrait 9:16
  ✓ Ngách gadget / đồ gia dụng / đồ bếp
  ✓ Kết quả cuối là preview MP4 local
  ✓ Commit code/docs/manifests — KHÔNG commit binary
```

---

## REPORT TEMPLATE

Sau khi hoàn thành, báo cáo theo format:

```
## /chay — Báo cáo

**Mode**: [1 / 2 (URL) / 3 (auto-source) / 4 (Shopee-First Lane)]
**Lane**: [Video-First / Shopee-First]  *(TikTok-Shop-First là future lane, defer)*
**Video ID**: [yt_NNN]
**Nguồn**: [URL hoặc "tự tìm từ yêu cầu: ..." hoặc "Shopee-First từ Shopee link: ..."]
**Affiliate target**: Shopee VN  *(default cho MODE 4; TikTok Shop defer)*
**Publish target**: Facebook Reels  *(default; TikTok VN defer)*

### Đã làm
- [ ] Tải video: [duration, resolution, format]
- [ ] Script Writer: [PASS/FAIL, word count, TTS estimate]
- [ ] Voice Sync: [N/N blocks FIT, overflow nếu có]
- [ ] BGM Mix: [max_vol dBFS, mean_vol dBFS, streams]
- [ ] Preview: [đã mở / path file]

### QC chính
| Chỉ số | Giá trị | Nhận xét |
|---|---|---|
| Streams | X | |
| Duration | Xs | |
| max_volume | -X dBFS | |
| Source audio leak | none / detected | |

### GUARD 6 Visual Safety (Detect → Repair → Re-QC → Decision)
| Detected issue | Repair action | Re-QC result |
|---|---|---|
| (eg Logo top-right frames 0-3s) | (eg boxblur top-right 200x100) | PASS_WITH_REPAIR |
| ... | ... | ... |

**Decision Status overall**: PASS / PASS_WITH_REPAIR / NEEDS_NEW_CANDIDATE / NEEDS_USER

### Auto-Source Retry log (nếu có dùng MODE 3 retry)
| Vòng | Keyword/strategy | Candidate ID | Reject reason | Action |
|---|---|---|---|---|
| 1 | (initial keyword) | (eg rVLy0F8_IfQ) | (eg outdoor landscaping + biển số) | retry vòng 2 |
| 2 | (keyword cải thiện) | ... | ... | retry vòng 3 / accepted / needs_user |
| 3 | ... | ... | ... | accepted / needs_user |

### Shopee Product Card (CHỈ Shopee-First Lane / MODE 4)
| Field | Giá trị |
|---|---|
| shopee_product_url | (URL Shopee VN) |
| product_name | ... |
| price_vnd | ... / unknown |
| commission_pct | ... / unknown |
| sales_count | ... / unknown |
| rating | ... / unknown |
| review_count | ... / unknown |
| shop_name | ... / unknown |
| why_worthwhile | (lý do gồm 5 điểm: vấn đề / ai mua / visual demo / hợp content-led / tiềm năng chuyển đổi Facebook Reels VN) |
| data_confidence | high / medium / low |

### Shopee Product Selection Scoring (CHỈ Shopee Discovery Mode — `/chay shopee-first` / `/chay product-first` không có link)
| # | Trục | Score (0–3) | Ghi chú |
|---|---|---|---|
| 1 | Demo clarity | X | ... |
| 2 | Shopee affiliate potential | X | ... |
| 3 | Visual appeal cho Facebook Reels | X | ... |
| 4 | Vietnam audience fit (Facebook Reels VN) | X | ... |
| 5 | Source/demo availability | X | ... |
| 6 | Risk level | X | ... |
| **Total** | | **XX / 18** | |

**Decision Product Selection**: PRODUCT_SELECTED / PRODUCT_NEEDS_USER_REVIEW / PRODUCT_REJECTED

### Shopee Product Discovery Retry log (CHỈ Shopee Discovery Mode nếu có retry)
| Vòng | Keyword/lane | Candidate count | Top score | Decision | Action |
|---|---|---|---|---|---|
| 1 | (initial) | N | XX/18 | (decision) | accepted / retry vòng 2 / needs_user |
| 2 | (keyword cải thiện) | ... | ... | ... | ... |
| 3 | ... | ... | ... | ... | ... |

### GUARD 8 Shopee Product Match (CHỈ Shopee-First Lane)
| Tiêu chí | Shopee Card | Clip | Đạt? |
|---|---|---|---|
| 1. Công dụng | ... | ... | ✅/⚠️/❌ |
| 2. Hình dáng / thiết kế | ... | ... | ✅/⚠️/❌ |
| 3. Cách dùng | ... | ... | ✅/⚠️/❌ |
| 4. Bối cảnh sử dụng | ... | ... | ✅/⚠️/❌ |
| 5. Bản chất sản phẩm | ... | ... | ✅/⚠️/❌ |

**Decision Status Shopee Product Match**: MATCH_CONFIRMED / MATCH_NEEDS_REVIEW / MISMATCH_REJECT

### Operator Trim (CHỈ nếu Script Writer FAIL → operator sửa tay — Phần 23 hardening)
| Field | Giá trị |
|---|---|
| operator_trim_applied | true / false |
| original_quality_status | fail / near-pass |
| original_word_count | X |
| trimmed_blocks | [b2, b4, ...] |
| post_trim_word_count | Y |
| post_trim_reason | (lý do trim ngắn) |
| post_trim_quality_status | accepted_after_operator_trim / rerun_pass / rerun_fail |
| validator_rerun_status | rerun_pass / rerun_fail / not_available |
| final_used_for_voice_sync | true / false |

### Facebook Reels Publish Plan (CHỈ Shopee-First Lane — Phần 23 + Round 2A chuẩn hoá)
| Field | Giá trị |
|---|---|
| platform | facebook_reels |
| affiliate_platform | shopee |
| lane | shopee_first |
| product_card_path | production/batch_001/<video_id>/shopee_product_card.json |
| final_video_path | production/batch_001/<video_id>/bgm_mix_v1/<video_id>_voice_blocks_bgm_preview_vi.mp4 |
| caption_draft | (caption gợi ý soft tone) |
| cta_text | (eg "Link mình để ở phần mô tả nha") |
| shopee_affiliate_url | (URL Shopee Affiliate đã wrap) hoặc "needs_user_input" |
| hashtags | ["#dogiadung", "#dungcubep", "#meovat"] hoặc [] |
| publish_status | not_published |
| needs_user_review | true |
| publish_blockers | ["user_review_required", ...] (luôn có ≥1 phần tử) |

### Self-review
[Lỗi tự phát hiện và sửa / Giới hạn còn lại]

### Git
[Commit hash + files committed / Lý do chưa commit]

### Giới hạn vòng này
[Những gì chưa hoàn hảo, chấp nhận ở 75–85%]
```

---

## TRIẾT LÝ VFOS (nhúng để không bị drift)

- **Content-led trước**: nội dung phải có khả năng kéo view trước khi gắn affiliate
- **Không biến video thành quảng cáo lộ liễu**: CTA phải soft ("link bio nhé", không ép mua)
- **Evidence-first**: mô tả video dựa trên hình thật — không bịa spec, không bịa số liệu sản phẩm
- **Làm từng phần chắc**: không rush nhiều bước cùng lúc
- **75–85% là đủ chốt**: không tối ưu vô hạn, đủ dùng thật → ghi lại → đi tiếp
- **Scale bằng blueprint**: không xây lại hệ thống từ đầu cho mỗi ngách mới

---

## THAM CHIẾU

- Pipeline code: `packages/script-writer/`, `packages/voice/`, `packages/shopee/`, `packages/facebook/`
- BGM source mặc định: `production/batch_001/yt_005/bgm/yt_005_bgm_v2_candidate_b.mp3`
- Voice resolver: `packages/voice/src/voice-presets.ts` (single brand voice, không còn multi-preset)
- Schema types: `packages/script-writer/src/types.ts`
- Blueprint nhân bản: `docs/00_DIEU_HANH/VFOS_SHORTFORM_FACTORY_BLUEPRINT_V0.md`
- **Agent Architecture v0**: `docs/00_DIEU_HANH/VFOS_AGENT_ARCHITECTURE_V0.md` (5 agent boundary + Git Agent commit rule + `production/_runs/<run_id>/` SoT)
- Project memory: `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
