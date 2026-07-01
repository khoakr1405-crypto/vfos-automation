---
name: gate-check
description: Chỉ dùng khi Operator gõ đúng lệnh `/gate-check <jobId>`. Đây là lệnh typed-invoke, KHÔNG auto-trigger. Diagnostic READ-ONLY soi 1 job cụ thể đang kẹt gate nào (auto-detect lane theo prefix: job_* = Product Review, ent_* = Entertainment). KHÔNG tự kích hoạt khi chỉ nói chung về "gate / QA / failed / lỗi / kẹt job".
---

# /gate-check <jobId> — Soi gate của 1 job (READ-ONLY diagnostic)

> **Bản chất**: lệnh gõ tay có tham số. Chỉ chạy khi Operator gõ đúng `/gate-check <jobId>`.
> KHÔNG tự kích hoạt khi Operator chỉ nói về gate / QA / failed / lỗi / kẹt job.

## Purpose
Trả lời đúng 1 câu hỏi cho 1 job: **"job này đang kẹt ở gate nào, vì sao?"** — bằng cách đọc artifact gate thật, **không đụng gì tới pipeline**. Đây là cửa sổ chẩn đoán, không phải cửa hành động, và **tuyệt đối không mở khóa/bypass gate** (No-Go #1).

## Đầu vào & auto-detect lane
- **Thiếu `<jobId>`** → in **usage** (`/gate-check <jobId>`) và dừng. **KHÔNG** tự scan toàn repo.
- Prefix `job_*` → lane **Product Review**.
- Prefix `ent_*` → lane **Entertainment**.
- Prefix khác → **`UNSUPPORTED_JOB_ID_PREFIX`**, dừng.
- Job không tồn tại (thư mục/nguồn không có) → **`JOB_NOT_FOUND`**, dừng.
- **KHÔNG** trộn gate model 2 lane; **KHÔNG** làm cross-lane dashboard (đó là việc của `/review-status` + `/ent-status`).

## Read-only tuyệt đối — HARD DENY
Trong lúc chạy `/gate-check`, **CẤM**:
- ❌ Sửa / ghi / xoá bất kỳ file nào (chỉ `Read`/`Glob`, không `Edit`/`Write`).
- ❌ Chạy `job:qa` / intake / production / render / package.
- ❌ Publish / live / gọi Facebook API / TikTok API.
- ❌ Gọi bất kỳ gate function **mutate** nào; **KHÔNG** sửa `production-gates.ts` hay bất kỳ gate logic nào.
- ❌ Bypass / mở khóa / "duyệt hộ" gate.
- ❌ Đụng runtime / media / secret / session / cookie / registry để ghi.
- ❌ `git add` / `git commit` / thao tác thay đổi git.

Sau khi chạy, **`git status` phải sạch**. Nếu working tree bị bẩn do lệnh này → coi là FAIL, báo Operator, không commit.

## Nguồn dữ liệu theo lane (đọc đúng scope)
**Product Review (`job_*`)** — chỉ đọc trong `data/temp/jobs/<jobId>/`, artifact đọc **nếu tồn tại**:
`job_manifest.json`, `product_card.json`, `final_video_qa_report.json`, `render_manifest.json`, `preview_artifact.json`, `script_artifact.json`, `voice_artifact.json`, `bgm_mixing_report.json`, `launch_check_report.json`, `facebook_publish_status.json`, `publish_audit_log.jsonl`.

**Entertainment (`ent_*`)** — chỉ đọc `data/temp/ent/<jobId>/ent_job.json`.
- **KHÔNG** đọc `data/temp/jobs/` cho ent job; **KHÔNG** đọc Product Review artifact cho ent job.

## Quy tắc dữ liệu
- Artifact thiếu → **`MISSING`**, không tự tạo.
- Field thiếu → `—`.
- JSON hỏng/không parse → **`PARSE_ERROR`**, không sửa file.
- `lastError` / `error.code` / `violations` / `warnings` → in **verbatim**, không diễn giải quá tay.
- **Dữ liệu lệch** (vd `state=READY_FOR_OPERATOR_REVIEW` nhưng `lastError` vẫn còn) → **hiển thị CẢ HAI** và ghi `state/lastError mismatch observed`, **không** tự chọn bên đúng.
- Chỉ báo đúng field đọc được; không suy diễn từ trí nhớ.

## Định dạng output
```
Job: <jobId> | lane: <product-review|entertainment> | state: <state>

Gate checklist:
  [PASS|FAIL|BLOCK|PENDING|MISSING] <N>. <gate name>
     <field>=<value thật>
     ⛔ blocker/reason: <verbatim>   (chỉ khi BLOCK/FAIL)

→ Kết luận: <gate đầu tiên BLOCK/PENDING/MISSING = điểm kẹt chính>, hoặc READY/PASS nếu toàn PASS.
```
Nhãn: `PASS` (qua), `FAIL` (gate fail thật), `BLOCK` (kẹt do lỗi/blocker), `PENDING` (chờ quyết định người), `MISSING` (artifact chưa có).

### Product Review gates v1 (thứ tự)
1. **Product binding / readiness** — `product_card.json` tồn tại; owner nếu `canonicalUrl` chứa `an_17376660568`; product/card field (`id`/`name`/`shopId`/`itemId`/`shortLink`) nếu có.
2. **Source clean / production allowed** — `source.cleanlinessStatus`, `source.productionAllowed`; `source.provider`/`source.sourceVideoUrl` nếu có.
3. **Duration / render / QA** — `duration.durationMatchStatus`; `qaStatus`; `final_video_qa_report.json` (`status`/`checks`/`violations`/`warnings`) nếu có; render/script/voice/bgm artifact nếu có.
4. **Operator preview** — `review.operatorDecision`; `approvedAt`/`rejectedAt`/`notes` nếu có; `preview_artifact.json` (`requiresOperatorReview`/`readyForPublish`) nếu có.
5. **Launch / package / publish readiness** — `launch_check_report.json` (`decision`/`reasons`/`checklist`) nếu có; `facebook_publish_status.json` fields nếu có; `publishVisibility` giữ **nguyên văn**, **KHÔNG** kết luận live/public.

> Blocker Product Review nằm ở `job_manifest.json $.lastError` (vd `PROVIDER_PAGE_FAILED`, `PROVIDER_RESULT_TIMEOUT`, `SCRIPT_GENERATION_FAILED`).

### Entertainment gates v1 (thứ tự)
1. **Intake / blocker** — `state`; `error.code` nếu có (vd `DOWNLOAD_FAILED`).
2. **GATE1 script** — `reviewGates.scriptApproved`; `script.reviewStatus`.
3. **GATE2 preview / audio** — `reviewGates.previewApproved`; `audio.applied`; `package.audioPolicyApplied`.
4. **GATE3 render** — `render.verdict`.
5. **Final conclusion** — gate đầu tiên `BLOCK/PENDING/MISSING` là điểm kẹt chính; nếu toàn `PASS` → báo `READY/PASS` theo dữ liệu thật.

## Không mở scope
- Không đề xuất "sửa gate / QA lại / produce tiếp" trong cùng lần chạy — muốn hành động là lệnh khác.
- Không mở khóa gate, không bypass Product Binding / Production Gate (No-Go #1).
- Chỉ soi 1 job theo `<jobId>`; không auto-scan, không gom nhiều job.
