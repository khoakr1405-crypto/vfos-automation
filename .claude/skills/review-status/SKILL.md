---
name: review-status
description: Chỉ dùng khi Operator gõ tay đúng lệnh `/review-status`. Đây là lệnh typed-invoke, KHÔNG auto-trigger. Báo cáo READ-ONLY trạng thái các job lane Product Review (đọc data/temp/vfos_jobs_registry.json + job_manifest.json). KHÔNG tự kích hoạt khi chỉ nói chung về "product review / review / status / job / QA / publish". Lane Entertainment KHÔNG thuộc lệnh này (đã có `/ent-status`).
---

# /review-status — Báo cáo trạng thái lane Product Review (READ-ONLY)

> **Bản chất**: lệnh gõ tay. Chỉ chạy khi Operator gõ đúng `/review-status`.
> KHÔNG tự kích hoạt khi Operator chỉ nói về product review / review / status / job / QA / publish.

## Purpose
Cho Operator xem nhanh trạng thái toàn bộ job **lane Product Review** trong một bảng, mà **không đụng gì tới pipeline**. Đây là cửa sổ quan sát, không phải cửa hành động. Lane Entertainment không thuộc phạm vi lệnh này — đã có `/ent-status`.

## Ghi chú về workflow (diễn đạt đúng, không định nghĩa lại)
Code nội bộ dùng **10-state machine** (định nghĩa ở `scripts/vfos-job-manager.ts`). `/review-status` chỉ **map state nội bộ vào khung hiển thị 5 bước của Operator** để dễ đọc — **không** định nghĩa lại Product Review workflow 5 bước, **không** thêm gate mới.

## Scope nguồn dữ liệu
- **Primary (bảng chính)**: `data/temp/vfos_jobs_registry.json` (39 entry — đúng nguồn `pnpm job:list` đọc).
- **Optional enrich (per-job, chỉ đọc thêm khi cần chi tiết)**:
  - `data/temp/jobs/<jobId>/job_manifest.json`
  - `data/temp/jobs/<jobId>/product_card.json`
  - `data/temp/jobs/<jobId>/final_video_qa_report.json`
  - `data/temp/jobs/<jobId>/render_manifest.json`
  - `data/temp/jobs/<jobId>/preview_artifact.json`
  - `data/temp/jobs/<jobId>/launch_check_report.json`
  - `data/temp/jobs/<jobId>/facebook_publish_status.json`
  - `data/temp/jobs/<jobId>/publish_audit_log.jsonl`

## Read-only tuyệt đối — HARD DENY
Trong lúc chạy `/review-status`, **CẤM**:
- ❌ Sửa / ghi / xoá bất kỳ file nào (chỉ `Read`/`Glob`, không `Edit`/`Write`).
- ❌ Chạy intake / production / render / QA mới / package.
- ❌ Publish / live / gọi Facebook API / TikTok API.
- ❌ Đụng `data/temp/ent/*` (Entertainment) — ngoài scope.
- ❌ Đổi Product Review workflow 5 bước / thêm gate mới.
- ❌ Đụng pipeline / render / BGM / blur / runtime / media / secret.
- ❌ `git add` / `git commit` / thao tác thay đổi git.
- ❌ Chạy script mutate (chỉ chấp nhận đọc; nếu dùng `pnpm job:list`/`job:status` thì chúng là read-only, nhưng ưu tiên đọc file trực tiếp).

Sau khi chạy, **`git status` phải sạch**. Nếu working tree bị bẩn do lệnh này → coi là FAIL, báo Operator, không commit.

## Quy tắc dữ liệu
1. **Bảng chính chỉ lấy từ registry** (39 entry). Mỗi entry có: `jobId`, `runId`, `state`, `productName`, `productCardPath`, `sourceVideoPath`, `captionedPreviewPath`, `operatorDecision`, `createdAt`, `updatedAt`.
2. Nếu phát hiện **thư mục job trong `data/temp/jobs/*` KHÔNG có trong registry** → chỉ liệt kê ở mục phụ **"Unregistered / test dirs"**, **KHÔNG** trộn vào bảng chính.
3. Field thiếu → ghi `—`. **Không bịa schema** nếu không thấy field thật.
4. File JSON hỏng/không parse được → ghi `PARSE_ERROR` cho dòng đó, **không** sửa file.
5. Enrich `qaStatus`/publish chỉ đọc thêm từ `job_manifest.json`/`facebook_publish_status.json` khi có; không có → `—`.

## Cách chạy (đúng trình tự)
1. `Read` `data/temp/vfos_jobs_registry.json` → lấy danh sách job (bảng chính).
2. Với mỗi job, suy **bước hiển thị (1–5)** từ `state` theo bảng mapping bên dưới.
3. (Optional) enrich `qaStatus` từ `job_manifest.json $.qaStatus`; publish từ `facebook_publish_status.json` (`state`, `facebook.permalinkUrl`, `publishVisibility`).
4. `Glob` `data/temp/jobs/*/` đối chiếu registry → gom job dir ngoài registry vào mục phụ.
5. Sắp bảng theo `updatedAt` mới→cũ (thiếu `updatedAt` → xếp cuối, ghi `—`).

## Mapping state nội bộ → khung 5 bước hiển thị
| Bước hiển thị | State nội bộ / tín hiệu |
|---|---|
| **1. Product selected/readiness** | `WAITING_FOR_SOURCE_VIDEO`, hoặc job có `product_card`/product readiness nhưng chưa có source sạch |
| **2. Source intake/clean** | `SOURCE_READY`, `READY_TO_RENDER`; `source.cleanlinessStatus`, `source.productionAllowed` |
| **3. Production/render/QA** | `qaStatus`, `final_video_qa_report.json`, render/script/voice artifacts |
| **4. Preview approve/reject** | `READY_FOR_OPERATOR_REVIEW`, `APPROVED`, `REJECTED`; `review.operatorDecision` |
| **5. Package/launch readiness** | `PACKAGED`, `PUBLISHED`; `launch_check_report.json`, `facebook_publish_status.json` (nếu có) |

> `REJECTED`/`FAILED` là nhánh rẽ terminal — ghi đúng state, map theo bước gần nhất (REJECTED→bước 4, FAILED→ghi state, không ép bước).

## Định dạng báo cáo
Bảng chính (registry), sắp `updatedAt` mới→cũ:

| jobId | state | bước | product | operatorDecision | qaStatus | publish | updatedAt |
|---|---|---|---|---|---|---|---|

- **product**: `productName` rút gọn.
- **publish**: chỉ hiện trạng thái THẬT — vd `PUBLISHED`, `UNCONFIRMED`, hoặc `permalinkUrl` nếu có. **KHÔNG** kết luận "live/public" nếu `publishVisibility = UNCONFIRMED`.
- Thiếu → `—`.

Cuối bảng:
- **Tổng job registry** (vd 39).
- **Đếm theo state** (vd `PUBLISHED: N · FAILED: N · READY_FOR_OPERATOR_REVIEW: N · …`).
- **Unregistered / test dirs** (nếu có): liệt kê tên dir, ghi rõ "không nằm trong registry".

## Không mở scope
- Không đề xuất "produce tiếp / QA lại / publish" trong cùng lần chạy — muốn hành động là lệnh khác.
- Không suy diễn state từ trí nhớ; chỉ báo đúng field đọc được. Thiếu → `—`, không bịa.
