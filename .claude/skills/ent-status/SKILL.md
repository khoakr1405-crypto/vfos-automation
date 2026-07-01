---
name: ent-status
description: Chỉ dùng khi Operator gõ tay đúng lệnh `/ent-status`. Đây là lệnh typed-invoke, KHÔNG auto-trigger. Báo cáo READ-ONLY trạng thái các job của lane Entertainment (đọc data/temp/ent/*/ent_job.json). Không auto-kích hoạt cho các câu nói chung về "lane giải trí", "entertainment", "câu cá", produce/render/publish.
---

# /ent-status — Báo cáo trạng thái lane Entertainment (READ-ONLY)

> **Bản chất**: lệnh gõ tay. Chỉ chạy khi Operator gõ đúng `/ent-status`.
> KHÔNG được tự kích hoạt khi Operator chỉ nói về lane giải trí, produce, render, hay đăng bài.

## Purpose
Cho Operator xem nhanh trạng thái toàn bộ job của lane Entertainment mà **không đụng gì tới pipeline**. Đây là cửa sổ quan sát, không phải cửa hành động.

## Scope (đọc đúng 1 nguồn)
- Đọc: `data/temp/ent/*/ent_job.json`
- Bỏ qua các thư mục phụ trợ không có `ent_job.json` (vd `_tts_cache/`, `_diag_*`, `_r15_fixture_*`).
- Không đọc/không cần bất kỳ nguồn nào khác (media, log, session, token, registry).

## Read-only tuyệt đối — HARD DENY
Trong lúc chạy `/ent-status`, **CẤM**:
- ❌ Sửa / ghi / xoá bất kỳ file nào (chỉ `Read`/`Glob`, không `Edit`/`Write`).
- ❌ Chạy `produce` / `render` / montage / bất kỳ bước pipeline nào.
- ❌ Gọi `publish` / live API / đăng TikTok / Facebook.
- ❌ Đụng workflow Product Review 5 bước, Shopee, BGM, blur/scrub, audio pipeline.
- ❌ `git add` / `git commit` / bất kỳ thao tác thay đổi git nào.
- ❌ Chạy script trong `scripts/` hay `apps/` làm thay đổi state.

Sau khi chạy, **`git status` phải sạch**. Nếu vì lý do gì working tree bị bẩn do lệnh này → coi là FAIL, báo Operator, không commit.

## Cách chạy (đúng trình tự)
1. Liệt kê job: `Glob` pattern `data/temp/ent/*/ent_job.json`.
2. Với mỗi file, `Read` và trích các trường **nếu có** (không có thì ghi `—`):
   - `jobId`
   - `state`
   - Channel binding: `channelId`, `accountId`, `channelNiche` (job cũ có thể thiếu → ghi `—`)
   - Gates: `reviewGates.scriptApproved`, `reviewGates.previewApproved`
   - Status phụ: `script.reviewStatus`, `render.verdict`, `render.previewReady`
   - `updatedAt` (để sắp xếp mới→cũ)
3. Nếu file JSON hỏng/không parse được → báo dòng đó là `PARSE_ERROR`, **không** cố sửa file.

## Định dạng báo cáo
Bảng gọn, 1 dòng/job, sắp xếp theo `updatedAt` mới→cũ:

| jobId | state | channel (channelId / accountId) | gates (script / preview) | render.verdict | reviewStatus |
|---|---|---|---|---|---|

Cuối bảng: tổng số job, và đếm nhanh theo `state` (vd `INTAKE_DONE: 3 · TIKTOK_POSTED: 1 · …`).

## Không mở scope
- Không đề xuất "sửa luôn" hay "produce tiếp" trong cùng lần chạy — nếu Operator muốn hành động, đó là lệnh khác.
- Không suy diễn state từ trí nhớ; chỉ báo đúng những gì đọc được từ file. Thiếu trường → `—`, không bịa.
