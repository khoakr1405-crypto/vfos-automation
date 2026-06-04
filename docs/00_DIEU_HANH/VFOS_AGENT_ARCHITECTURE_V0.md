# VFOS AGENT ARCHITECTURE v0

> **Loại tài liệu**: Spec kiến trúc — định nghĩa boundary giữa các agent của VFOS Short-form Affiliate Factory.
> **Trạng thái**: v0 — SPEC ONLY. **KHÔNG** triển khai code multi-agent trong vòng này. `/chay` vẫn chạy monolithic.
> **Ngày chốt v0**: 2026-05-26
> **Tham chiếu nguồn**:
> - `CLAUDE.md` + `docs/VFOS_NORTH_STAR.md`
> - `.claude/skills/chay/SKILL.md` — section "AGENT-READY RESPONSIBILITY BOUNDARIES (Phần 23)"
> - `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` — Phần 23 + Round 2A/2B/2C + Round 3A/3C

---

## 1. Mục đích của tài liệu này

`/chay` hiện đang chạy như **monolithic agent** — một skill duy nhất gánh toàn bộ pipeline: Shopee discovery → Demo match → Script QC → Voice/BGM → Publish plan → Git commit.

Document này chốt **biên giới giữa các agent** để 3 điều:

1. **Khi split agent thật**, không phải rewire logic — chỉ dịch SKILL section sang agent file.
2. **Khi vẫn chạy monolithic**, `/chay` phải tự kỷ luật theo boundary này (đọc/ghi đúng artifact, không cross-write).
3. **Khi commit/push artifact**, có một agent duy nhất chịu trách nhiệm (Git & Artifact Agent), KHÔNG để mỗi step tự commit lung tung.

**KHÔNG phải mục đích**:
- Không phải mở scope code multi-agent ngay.
- Không phải refactor pipeline code (`packages/script-writer/`, `packages/voice/`, `packages/shopee/`, `packages/facebook/`).
- Không phải migrate artifact hiện có sang path mới (xem mục 5 — migration là spec, chưa thực thi).

---

## 2. Quan hệ với /chay hiện tại

| Lớp | Hiện tại | v0 spec |
|---|---|---|
| Skill `/chay` | Monolithic | Vẫn monolithic — gánh logic của cả 5 agent |
| Agent files (`.claude/agents/*.md`) | Chỉ có `researcher` + `reviewer` | KHÔNG tạo agent file mới trong v0 |
| Artifact path | `production/batch_001/<video_id>/...` | **Source of truth mới**: `production/_runs/<run_id>/...` (xem mục 5) |
| Commit/push | Mọi step có thể commit | **CHỈ Git & Artifact Agent commit/push** + **CHỈ khi prompt cho phép** (xem mục 6) |

`/chay` trong vòng này vẫn được phép gánh nhiều responsibility cùng lúc, nhưng:
- Phải đọc/ghi đúng artifact theo boundary mục 4.
- Phải tôn trọng SoT path mục 5.
- Phải tôn trọng Git Agent rule mục 6.

---

## 3. Danh sách agent v0

5 agent — 4 đã spec ở Phần 23 (SKILL.md) + 1 thêm trong v0 (Git & Artifact Agent).

### 3.1 Shopee Product Agent (Commerce Product Agent)
- **Responsibility**: Resolve link/short link Shopee, fetch metadata (giá / hoa hồng / sales / rating khi có quyền), persist Shopee Product Card đầy đủ 24 field, chấm 6-trục Product Selection Scoring, validate affiliate link (xem Round 3C). **Round 26B (2026-05-26)**: lấy link Shopee Affiliate qua `BROWSER_CDP_TARGETED_CLICK` flow (primary) + duy trì global dedupe registry với lock + atomic write. **Round 27B (2026-05-26)**: CDP flow có **controlled browser auto-launch** — Operator KHÔNG còn bắt buộc tự mở browser trước; hệ thống attach vào browser đang mở hoặc tự launch có kiểm soát bằng profile đã cấu hình.
- **Input**: URL Shopee canonical / `s.shopee.vn/...` short link / lane keyword (Discovery Mode) / CDP browser session. **Round 27B**: nếu CDP port `9222` đã mở → attach thẳng vào browser đang chạy; nếu chưa mở → **controlled auto-launch** Cốc Cốc (ưu tiên) bằng profile `VFOS_BROWSER_USER_DATA_DIR`. Operator KHÔNG bắt buộc tự mở browser trước — chỉ cần cấu hình 1 lần profile đã login Shopee Affiliate.
- **Output artifact**: `shopee_product_card.json` + `production/_commerce/shopee_link_registry.json` (global dedupe registry, schema v0.1.0 — Round 26B).
- **HARD GATE**: Card phải PERSIST trên disk trước khi pipeline sang Demo Match (Phần 23).
- **KHÔNG bịa**: giá / hoa hồng / sales / rating / review / shop_name — unknown ghi `"unknown"`, `data_confidence` phản ánh trung thực.
- **Round 26B HARD rules**:
  - `BROWSER_CDP_TARGETED_CLICK` là **PRIMARY** flow. Flow cũ (`shopee:login` storage_state / HAR / cookie fetcher / Shopee Open API) → **DEPRECATED / FALLBACK** — cần user explicit cho phép.
  - Mọi write registry phải qua `upsertEntry()` / `appendRejected()` (module [packages/shopee/src/link-registry.ts](../../packages/shopee/src/link-registry.ts)) với file lock + atomic rename + read-after-lock + merge-safe update.
  - Dedup key priority: `shopid+itemid` > `canonical_url` normalized > `short_link` > normalized `product_name`.
  - Selector strategy: text/aria > product-card scoped > stable data-* > controlled CSS fallback. **KHÔNG** random class hash / tọa độ click.
  - CDP connect fail (sau bootstrap) → `ERR_CDP_BROWSER_NOT_FOUND` (max 3 retry). KHÔNG tự fallback sang shopee:login / private API.
  - Target tab missing → `ERR_CDP_TARGET_TAB_NOT_FOUND`. Login/CAPTCHA/OTP wall → `SUSPENDED` (human-assist, user tự xử lý) — agent KHÔNG nhập password/OTP/CAPTCHA.
  - **`target_count = 1` default (Round 26 single-link policy)** — agent chỉ lấy 1 link mới hợp lệ mỗi lần, DỪNG ngay sau validate + upsert registry. Batch mode chỉ khi user yêu cầu rõ ("lấy N link" / "lấy N sản phẩm" / "tìm nhiều để so sánh") hoặc CLI `--target-count=N`.
  - `max_clicks_per_batch = 5` là **safety ceiling**, KHÔNG phải mục tiêu — chỉ chạm khi gặp duplicate liên tiếp. KHÔNG click setting/account/security/logout/payment/publish.
  - Owner validation: canonical URL `utm_source` / `mmp_pid` phải khớp `expected_affiliate_owner_id` (eg `an_17376660568`). Mismatch → `appendRejected`, không vào `entries`.
- **Round 27B HARD rules (controlled browser bootstrap)** — chỉ Commerce Product Agent Shopee CDP flow được tự `spawn` browser (module [packages/shopee/src/cdp-bootstrap.ts](../../packages/shopee/src/cdp-bootstrap.ts)):
  - Probe `127.0.0.1:9222` trước. Đã listening → attach vào browser đang chạy. Chưa → **controlled auto-launch** Cốc Cốc (ưu tiên; Chrome fallback) với `--remote-debugging-port=9222 --user-data-dir=<profile>`, spawn `{detached:true}`, KHÔNG đóng browser khi CLI exit.
  - `VFOS_BROWSER_USER_DATA_DIR` **BẮT BUỘC** cho auto-launch: phải trỏ profile Cốc Cốc/Chrome **đã login Shopee Affiliate**, KHÔNG trỏ profile trống/random (tránh login wall). Thiếu env (và không có `--browser-user-data-dir` override) → fail an toàn `ERR_CDP_USER_DATA_DIR_REQUIRED`, KHÔNG spawn profile trống.
  - `VFOS_BROWSER_PATH` **optional** — chỉ dùng khi không auto-detect được browser executable (else dò Cốc Cốc Program Files / `(x86)` / LOCALAPPDATA → Chrome).
  - Profile đang bị khoá (`SingletonLock` / `SingletonCookie` / `LockFile`) → `ERR_CDP_PROFILE_LOCKED`, KHÔNG xoá lock, KHÔNG spawn lần 2. Spawn lỗi / `--no-auto-launch` khi port đóng → `ERR_CDP_BROWSER_LAUNCH_FAILED`.
  - CAPTCHA / login-wall human-assist: phát hiện → cảnh báo + chờ `--captcha-wait-seconds` (default 20, range `[10, 60]`), poll DOM mỗi 1s. Quá hạn chưa giải → `SUSPENDED` + `ERR_CAPTCHA_TIMEOUT`. Agent **KHÔNG** nhập password/OTP/CAPTCHA. Auto-launch **KHÔNG** áp dụng cho Facebook / publish / payment / OTP.
  - **Targeted-click giữ nguyên**: không random click; `target_count` default 1; `max_clicks` safety ceiling 5; validate owner `an_17376660568`; login/OTP/CAPTCHA hoặc popup không rõ → `SUSPENDED`/`FAIL` an toàn kèm reason code.
  - Cold start tóm tắt: Operator cấu hình profile login **1 lần**; hệ thống attach vào browser đang mở **hoặc** controlled auto-launch bằng profile đó; nếu profile/session chưa login hoặc bị khoá → fail an toàn và báo reason.

### 3.2 Demo Match Agent
- **Responsibility**: Tìm video/demo tương đồng từ TikTok / Douyin / AliExpress / Temu / YouTube, chấm GUARD 8 Product Match (5 trục), retry candidate theo AUTO-SOURCE RETRY POLICY (max 3 vòng).
- **Input**: `shopee_product_card.json` (read-only).
- **Output artifact**: Match result + chosen video URL + bảng GUARD 8 — lưu chung trong report của run.
- **KHÔNG cross-write**: KHÔNG sửa `shopee_product_card.json`. Nếu cần thêm Shopee data → trả về Shopee Product Agent.
- **KHÔNG bait-and-switch**: clip sản phẩm A + affiliate link sản phẩm B = vi phạm trục 5 GUARD 8 + GUARD 7 R2.

### 3.3 Script QC Agent (alias **Script & Claim Safety Agent** sau Round 25)
- **Responsibility**: Chạy AI Script Writer (`packages/script-writer/`), validator, OPERATOR TRIM POLICY (Phần 23), enforce GUARD 1 + GUARD 7 R1/R3/R5 ở script layer. **Round 26**: OpenAI viral subtitle rewrite workflow (verified trên yt_014 quạt không cánh) + claim-safe blocklist scan + fallback safe template + persist `subtitle_overlay_plan.json` (schema mở rộng: `selected_variants`, `rejected_variants`, `all_variants`, `style_profile`).
- **Input**: `scene_input.json` (từ scene detection) + lane/context metadata + (Round 26) `script_ai_v1_extended.json` + Shopee Product Card.
- **Output artifact**: `script_ai_v1_extended.json` (+ optional `operator_trim` metadata block khi operator phải sửa tay) + (Round 26) `subtitle_overlay_plan.json`.
- **KHÔNG**: Không viết caption Facebook — caption là việc của Facebook Publish Plan Agent.
- **Round 26 HARD rules**:
  - OpenAI subtitle workflow phải log đúng `rejected_variants.length` — KHÔNG bịa "0 rejected".
  - Mọi variant reject cho 1 block → dùng pre-approved manual fallback template (observable facts), ghi `"Manual safety fallback — N variants rejected."` trong `claim_safety_check.details`. KHÔNG hợp thức hóa variant rủi ro.
  - Banned phrases blocklist (synced với SKILL.md Section I): `an toàn tuyệt đối`, `không bao giờ kẹt tóc`, `mát như điều hòa`, `siêu mạnh nhất`, `pin trâu cả ngày`, `tốt nhất`, `thay thế điều hòa`, claim sức khỏe/làm đẹp/y tế không bằng chứng.
  - Subtitle ≤ 12 từ. Overlay ≤ 5 từ.

### 3.4 Facebook Publish Plan Agent
- **Responsibility**: Lập publish plan metadata cho Facebook Reels (caption draft, hashtags, CTA, schedule), enforce GUARD 7 R5 ở caption layer + GUARD 7 R2 product match check.
- **Input**: Preview MP4 path + `shopee_product_card.json` + GUARD 8 result.
- **Output artifact**: `facebook_reels_publish_plan.json` với `publish_status="not_published"` + `needs_user_review=true`.
- **TUYỆT ĐỐI KHÔNG**: gọi Graph API / `POST /{page_id}/feed` / `POST /{page_id}/videos` / `pnpm facebook:test-post` / `publishTextPost()` — publish luôn là manual operator step (Round 2A/2B).

### 3.4b Audio & Assembly (pipeline step, KHÔNG phải agent thứ 6 — Round 26 clarification)
Voice Sync (ElevenLabs TTS) + BGM Mix + Final Reels Render (STEP 9–11 trong WORKFLOW chính + `SKILL.md` Section I2 Final Reels Render Pattern + I3 Overlay Timing Anti-Overlap Rule) hiện thuộc monolithic `/chay`. Tương lai (roadmap v3+) có thể split thành agent file riêng nhưng **KHÔNG thuộc scope hardening hiện tại**. Auto-Run Controller Section C Locked State Matrix (Round 25) dùng tên `"Audio & Assembly Agent"` làm **next_agent label** cho deterministic routing — đây là pipeline step label, không phải agent file.

**Round 26 patterns đã chốt (verified yt_014 quạt không cánh T10)**:
- **Final Reels Render 9:16**: source 16:9 → center-crop 1080×1920 (`crop=405:720:437:0` cho source 1280×720; helper PHẢI nhận `source_width/height` dynamic). KHÔNG dùng blurred padding làm layout chính.
- **Overlay/Subtitle Timing Anti-Overlap**: micro-gap default 0.05s (range [0.03, 0.08]) tại block transitions `block_A.end == block_B.start`. Constant top-of-file `DEFAULT_SUBTITLE_MICRO_GAP_SECONDS = 0.05` HOẶC CLI arg — KHÔNG hardcode magic number ẩn trong logic.
- **Layout zones (1080×1920)**: overlay `y≈450` (top), subtitle `y≈1450` (bottom), action zone `y∈[600,1350]` (sản phẩm/tay/demo — TUYỆT ĐỐI không drawtext), Reels UI safe zone `y∈[200,1700]`.

### 3.5 Git & Artifact Agent (mới trong v0)
- **Responsibility**: Stage / commit / push code + docs + manifest + JSON artifact. Cập nhật `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` sau mỗi vòng lớn.
- **HARD RULE — chỉ commit/push khi prompt cho phép rõ ràng**:
  - Prompt user chứa cụm chỉ thị rõ: `"commit"`, `"push"`, `"commit + push"`, `"commit và push"`, `"commit với message ..."`, hoặc tương đương tiếng Việt rõ nghĩa.
  - Nếu prompt chứa commit message cụ thể → dùng đúng message đó, không tự đặt lại.
  - Nếu prompt KHÔNG nhắc commit → KHÔNG commit. Không có "tự động commit cuối turn".
- **KHÔNG commit**:
  - Binary media (`.mp4`, `.mp3`, `.wav`, `.png` lớn) — đã có `.gitignore`.
  - Bất kỳ file nào trong `.secrets/` (cookie / storage state / session) — Round 2C.
  - HAR / DOM snapshot / raw paste có PII / token / SPC_EC / SPC_ST / csrftoken.
- **Trước commit**: verify staging không lẫn binary / secret bằng `git diff --cached --stat` + inspect path.
- **Sau commit**: cập nhật commit hash vào `TRANG_THAI_VFOS_HIEN_TAI.md` mục "Git / Remote status".

---

## 4. Boundary Rules (HARD)

Áp dụng cho cả monolithic `/chay` và phiên bản multi-agent tương lai.

1. **State sharing qua file artifact** (JSON trên disk), KHÔNG qua biến process / global / message bus toàn cục — phù hợp `.claude/rules/design.md`.
2. **Mỗi agent CHỈ ghi artifact của mình**. Đọc upstream artifact OK, ghi đè artifact downstream là vi phạm.
3. **KHÔNG overlap responsibility**:
   - Resolve Shopee link: chỉ Shopee Product Agent.
   - Caption draft: chỉ Facebook Publish Plan Agent.
   - Script writer + validator: chỉ Script QC Agent.
   - Commit/push: chỉ Git & Artifact Agent.
4. **Guard chéo (pipeline-level, không thuộc 1 agent cụ thể)**:
   - **GUARD 6 Visual Safety**: chạy ở STEP 4 (source check) + STEP 11 (final preview) — pipeline-level guard.
   - **GUARD 7 R2 product match**: enforce ở Publish layer.
   - **GUARD 7 R1/R3/R5 script-layer**: Script QC Agent.
   - **GUARD 7 R5 caption-layer**: Facebook Publish Plan Agent.
   - **GUARD 8**: input data field (5 trục về sản phẩm) từ Shopee Product Agent, match scoring (5 trục so với clip) từ Demo Match Agent.
5. **AUTO-DECISION POLICY** (Phần 16) áp dụng cho mọi agent: KHÔNG hỏi user khi memory + scoring đủ rõ.
6. **AUTO-SOURCE RETRY POLICY** (Phần 16): retry max 3 vòng với keyword cải thiện trước khi hỏi user.

---

## 5. Artifact Source of Truth (SoT)

### 5.1 Chốt path mới

**Source of truth cho mọi run mới (kể từ v0)**:

```
production/_runs/<run_id>/
```

`<run_id>` đề xuất format: `<video_id>_<YYYYMMDD>_<HHMMSS>` (UTC) hoặc `<video_id>_run_<n>`. Format chính xác chốt khi pipeline code thực sự migrate (ngoài scope vòng này).

### 5.2 Layout subdirectory đề xuất

```
production/_runs/<run_id>/
├── inputs/                  # video source URL log, scene_input.json
├── shopee/                  # shopee_product_card.json + raw paste (gitignore raw)
├── demo_match/              # match_result.json + GUARD 8 table + retry_log.json
├── script/                  # script_ai_v1.json, script_ai_v1_extended.json, operator_trim.json
├── voice/                   # voice_sync_manifest.json + blocks/*.mp3 (binary gitignored)
├── bgm/                     # bgm_mix_manifest.json + bgm raw (binary gitignored)
├── preview/                 # *_preview_vi.mp4 (binary gitignored)
├── publish/                 # facebook_reels_publish_plan.json
└── reports/                 # /chay report + GUARD logs (PASS / PASS_WITH_REPAIR / reject reason)
```

### 5.3 Tương thích với artifact hiện có

- `production/batch_001/<video_id>/...` (yt_005 → yt_011) **giữ làm read-only history** — không touch, không delete, không di chuyển.
- Pipeline code (`packages/`) **chưa được sửa** trong vòng này. Migration sang `_runs/` là spec, sẽ thực thi ở vòng sau khi user duyệt.
- Khi pipeline code chưa migrate: nếu `/chay` chạy thật → tiếp tục ghi vào `production/batch_001/<video_id>/` như cũ; report của `/chay` phải ghi rõ "SoT path: `production/batch_001/<video_id>/` (pre-migration, theo Phần 24 spec sẽ chuyển `production/_runs/<run_id>/`)".

### 5.4 Vì sao đổi sang `_runs/`?

- **Batch vs run**: `batch_001` ngầm định scope batch, gây nhầm lẫn khi cùng một video chạy lại sau hardening (ví dụ yt_011 Shopee-First test lại sau Phần 23). Run-id minh thị "lần chạy", có timestamp, không đụng lịch sử cũ.
- **Multi-agent ready**: mỗi agent ghi 1 subdirectory riêng → dễ thấy ai sửa gì khi split agent thật.
- **Git Agent dễ verify**: trước commit, scan `production/_runs/<run_id>/` chỉ tích JSON / manifest, reject binary.

---

## 6. Git & Artifact Agent — Quy tắc commit/push

### 6.1 Khi nào được commit/push

**CHỈ** khi prompt user chứa **chỉ thị commit/push rõ ràng**:

- "commit" / "push" / "commit + push" / "commit và push"
- "commit với message: ..." / "commit message: ..."
- "đẩy lên git" / "đưa lên git" (chỉ commit, không push trừ khi có "push")
- "tạo PR" → bao hàm commit + push branch

### 6.2 Khi nào KHÔNG được commit/push

- Prompt KHÔNG nhắc commit/push → mọi thay đổi local stay local.
- Prompt nói rõ "không commit" / "chưa commit" / "draft" / "thử" → tuyệt đối không commit.
- Cuối turn không có chỉ thị commit → KHÔNG tự động commit "vì đã xong việc".

### 6.3 Commit hygiene

- Branch: chỉ commit lên branch hiện tại (`master` mặc định). KHÔNG checkout / merge / rebase trừ khi user yêu cầu.
- Message: dùng đúng message user đưa. Nếu user chỉ nói "commit" mà không có message → đề xuất message ngắn imperative <70 ký tự, hỏi user xác nhận (đây là exception hỏi user hợp lệ).
- KHÔNG `--amend` / `--no-verify` / `--force` trừ khi user yêu cầu rõ.
- KHÔNG `git push --force` lên `master`.
- Trước commit: chạy `git status` + `git diff --cached --stat` để verify staging.

### 6.4 Artifact persist trước commit

Khi commit liên quan đến `/chay` run:
- Verify mọi JSON artifact (`shopee_product_card.json`, `script_ai_v1_extended.json`, `voice_sync_manifest.json`, `bgm_mix_manifest.json`, `facebook_reels_publish_plan.json`) **đã persist** đúng path trong `production/_runs/<run_id>/` (hoặc `production/batch_001/<video_id>/` trong giai đoạn pre-migration).
- Verify binary media (`.mp4`, `.mp3`) KHÔNG có trong staging — `.gitignore` đã cover, nhưng verify lại.
- Verify `.secrets/` / cookie / HAR / DOM snapshot KHÔNG có trong staging.

---

## 7. Input / Output Contract (v0)

| Agent | Input artifact | Output artifact | Owner read-only refs |
|---|---|---|---|
| Shopee Product Agent | URL / short link / lane keyword | `shopee/shopee_product_card.json` | — |
| Demo Match Agent | `shopee/shopee_product_card.json` | `demo_match/match_result.json` + `demo_match/retry_log.json` | Shopee Card |
| Script QC Agent | `inputs/scene_input.json` + lane context | `script/script_ai_v1_extended.json` + (optional) `script/operator_trim.json` | Demo Match clip metadata (duration, blocks) |
| Facebook Publish Plan Agent | `preview/*_preview_vi.mp4` + Shopee Card + GUARD 8 | `publish/facebook_reels_publish_plan.json` | Script + Voice manifest |
| Git & Artifact Agent | Working tree state | Commit + (optional) push + updated `TRANG_THAI_VFOS_HIEN_TAI.md` | Tất cả artifact trên |

---

## 8. Decision boundary (v0 — KHÔNG triển khai)

- **KHÔNG** implement multi-agent code trong vòng này.
- **KHÔNG** tạo `.claude/agents/shopee-product-agent.md` / `demo-match-agent.md` / `script-qc-agent.md` / `facebook-publish-plan-agent.md` / `git-artifact-agent.md` trong vòng này.
- **KHÔNG** sửa pipeline code (`packages/script-writer/`, `packages/voice/`, `packages/shopee/`, `packages/facebook/`).
- **KHÔNG** migrate artifact hiện có sang `production/_runs/<run_id>/` — pipeline code chưa migrate, làm sớm sẽ orphan.
- **KHÔNG** mở scope Con số 2 hoặc TikTok Shop từ document này.

Document này chỉ định **kỷ luật viết / chạy** cho `/chay` hiện tại và lộ trình tách agent sau này.

---

## 9. Roadmap

| Phase | Phạm vi | Trigger |
|---|---|---|
| **v0 (vòng này)** | Spec boundary + SoT path + Git Agent rule | ĐÃ CHỐT 2026-05-26 |
| v1 | Pipeline code migrate ghi artifact sang `production/_runs/<run_id>/` (vẫn monolithic `/chay`) | User duyệt mở scope migration |
| v2 | Tách Shopee Product Agent ra `.claude/agents/shopee-product-agent.md` + adapter từ `/chay` | Sau khi v1 ổn định 1 vòng `/chay` end-to-end |
| v3 | Tách Demo Match Agent | Sau v2 |
| v4 | Tách Script QC Agent | Sau v3 |
| v5 | Tách Facebook Publish Plan Agent | Sau v4 |
| v6 | Tách Git & Artifact Agent thành agent file độc lập (hiện monolithic /chay vẫn gọi commit theo rule v0) | Sau v5 |

---

## 10. North Star alignment

Architecture **không** là goal. North Star là **tạo nội dung kéo view + ghép affiliate phù hợp cho thị trường Việt Nam trên Facebook/TikTok** (xem `docs/VFOS_NORTH_STAR.md`).

Lý do v0 được làm bây giờ:
- 6 video qua pipeline (yt_005..yt_007, yt_009, yt_010 Video-First + yt_011 Shopee-First) đã verify `/chay` monolithic chạy được.
- Hardening Phần 23 + Round 2A/2B/2C + Round 3A/3C đã tích lũy đủ rule để boundary cố định mà không sợ thay đổi.
- Spec sớm để khi user duyệt mở scope multi-agent thực sự, không phải rewire.

Lý do v0 **không** vội triển khai code:
- Hiện chưa có signal monolithic `/chay` chạm trần co dãn.
- Split agent quá sớm = abstraction premature, vi phạm `.claude/rules/design.md` ("3 dòng giống nhau OK hơn premature abstraction").
- Ưu tiên thật vẫn là **chạy thêm video thật + publish thật** để học tín hiệu view/click/conversion.

---

## 11. Trách nhiệm với document này

- Bất kỳ thay đổi agent boundary nào sau v0 → cập nhật document này trước, rồi mới sửa SKILL.md.
- Khi tách agent thật (v2+): tạo agent file `.claude/agents/<name>.md` reference về section tương ứng ở đây.
- Khi pipeline migrate sang `production/_runs/<run_id>/`: cập nhật mục 5.3 ghi rõ commit hash migration + ngày.
