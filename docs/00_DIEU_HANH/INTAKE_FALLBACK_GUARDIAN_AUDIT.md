# BÁO CÁO KIỂM TRA HỆ THỐNG PHÒNG THỦ INTAKE FALLBACK (PRODUCT REVIEW GUARDIAN)

Tài liệu này ghi nhận kết quả kiểm tra cuối cùng đối với hệ thống phòng thủ, ngăn chặn việc chạy sản xuất video thật hoặc đăng bài (publish) nhầm từ nguồn video fallback mẫu.

---

## 1. Kết Quả Kiểm Tra Theo Danh Sách Product Review Guardian

### 📋 Checklist & Kết quả chi tiết:

| STT | Yêu cầu kiểm tra | Trạng thái | Chi tiết kỹ thuật |
| :--- | :--- | :---: | :--- |
| **1** | Video mẫu fallback không bị gắn nhầm làm source thật của sản phẩm | **PASS** | Video template từ `job_20260602_003` được tải về thư mục cục bộ của job (`runs/${jobId}/source/clean_source_video.mp4`). Không làm thay đổi hay ô nhiễm `selected_product_card.json` ở Hành động 1. |
| **2** | UI hiển thị rõ trạng thái "Demo / Fallback Source" khi dùng nguồn fallback | **PASS** | - Hiển thị nhãn rose-accent **`Demo / Fallback Source`** cạnh tên job.<br>- Hiển thị hộp thông báo rose-accent cảnh báo rõ ở Bước 2 & Bước 3-7.<br>- Tự động đổi `lockReason` của Hành động 3 sang cảnh báo này. |
| **3** | Hệ thống chặn chạy production thật nếu nguồn là fallback | **PASS** | - **Frontend**: Ẩn các nút "Chạy sản xuất" và "Chạy thử".<br>- **Backend**: API `/run-production` kiểm tra qua `validateProductionReadiness`, ném lỗi `SOURCE_IS_FALLBACK` (blocker issue) và chặn thực thi (status 400/409). |
| **4** | Metadata của Job fallback được điền đầy đủ và chính xác | **PASS** | Ghi nhận trong manifest nguồn:<br>- `sourceMode: "fallback"`<br>- `sourceJobId: "job_20260602_003"`<br>- `productionAllowed: false`<br>- `warning: "Source intake failed; using sample fallback for review only"` |
| **5** | Hành động 2 & 3 chỉ được phép chạy khi khớp product, đã duyệt sạch, không fallback | **PASS** | - **Hành động 2**: Đã được bảo vệ ở cả UI và API bằng `validateProductionReadiness`.<br>- **Hành động 3**: Đã bổ sung `cardMatchesJob` vào điều kiện `jobApproved`. Thêm gate `not_fallback_source` và `product_matches_selected` vào API `/publish-facebook` (`evaluateLivePublishGates`). Đóng băng nút bấm và API khi có sai lệch/fallback. |
| **6** | UI hiển thị cảnh báo rõ ràng khi chưa có nguồn thật | **PASS** | Cảnh báo: *"Nguồn hiện tại là fallback mẫu, không được dùng để sản xuất video thật cho sản phẩm này."* xuất hiện trực quan tại khu vực duyệt nguồn sạch, khu vực sản xuất video, và phần khoá Hành động 3. |

---

## 2. Các File Đã Sửa Đổi (Modified Files)

### Source Code trong dự án:
- **`apps/studio/src/app/api/studio/jobs/[jobId]/approve/route.ts`**: Thêm guard chặn approve job nếu nguồn là fallback mẫu.
- **`apps/studio/src/app/lanes/product-review/page.tsx`**:
  - Gắn chặt `cardMatchesJob` vào điều kiện mở khoá `jobApproved`.
  - Hiển thị thông báo khoá (lock reason) động cho Hành động 3 khi nguồn là fallback hoặc lệch sản phẩm.
- **`apps/studio/src/lib/studio-data/jobs.ts`**: Thêm gate `not_fallback_source` và `product_matches_selected` vào bộ kiểm tra xuất bản `evaluateLivePublishGates`.
- **`scripts/job-launch-check.ts`**: Bổ sung `Check 10` (Is real source) để chặn lệnh launch-check nếu phát hiện video fallback mẫu (`SOURCE_IS_FALLBACK`).

---

## 3. Nhật Ký Lệnh Kiểm Tra Kỹ Thuật (Pre-commit Verification Logs)

- **Kiểm định kiểu dữ liệu (TypeScript Check)**:
  `pnpm --filter @vfos/studio typecheck` -> **Exit code 0** (Hợp lệ, không lỗi kiểu).
- **Kiểm định pre-live (Launch Check Command)**:
  `pnpm job:launch-check --job job_20260606_011` -> **Exit code 10** (Thất bại đúng thiết kế với lý do `SOURCE_IS_FALLBACK`).

---
*Báo cáo được lập tự động bởi Antigravity Agent phục vụ công tác giám sát vận hành VFOS.*
