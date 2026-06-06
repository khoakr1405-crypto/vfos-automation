# VFOS Workflow Integrity Standard (Tiêu chuẩn Toàn vẹn Luồng Công việc)

Tài liệu này định nghĩa các nguyên tắc và tiêu chuẩn thiết kế kiến trúc để duy trì tính nhất quán và toàn vẹn của luồng dữ liệu (workflow integrity) trong toàn bộ nền tảng VFOS.

---

## 1. Bối cảnh & Nguyên tắc Tối thượng

VFOS là một hệ sinh thái điều phối nội dung đa kênh tự động phức tạp, gồm nhiều module (Commerce, Studio, Publishing, Comments, Analytics). Để tránh lỗi nghiêm trọng khi Operator thao tác (ví dụ: Chọn sản phẩm A ở bước 1 nhưng bước 2 lại chạy video sản xuất cho sản phẩm B), hệ thống áp dụng nguyên tắc tối thượng:

> **"Một workflow thật phải có một context duy nhất. Không hành động nào được thực thi chỉ vì hệ thống đang có sẵn dữ liệu. Mọi hành động chỉ được phép thực thi khi toàn bộ dữ liệu liên quan thuộc về cùng một Workflow Context."**

---

## 2. Các Quy luật Toàn vẹn (Workflow Integrity Laws)

### Luật A: Single Workflow Context (Ngữ cảnh luồng duy nhất)
* Mọi quy trình sản xuất video, kiểm tra chất lượng (QA), xuất bản, hay đo lường hiệu suất đều phải neo chặt vào một khóa định danh duy nhất. Hiện tại là `jobId`. Sau này có thể mở rộng thêm `workflowRunId`.
* Không sử dụng các trạng thái toàn cục mơ hồ (floating state) để kích hoạt các hành động sản xuất thật.

### Luật B: Entity Binding (Liên kết thực thể bắt buộc)
Mọi tài nguyên phát sinh trong luồng sản xuất phải được liên kết rõ ràng và đối chiếu chéo với `jobId` tương ứng:
* **Job ↔ Product Card**: Phải lưu snapshot của Product Card (`product_card.json`) trực tiếp trong thư mục runtime của job để bảo toàn thông tin sản phẩm tại thời điểm tạo.
* **Job ↔ Source Video**: Video nguồn và báo cáo tải về phải nằm dưới thư mục `runs/<jobId>/source/`.
* **Job ↔ Script / Voice / BGM / Rendered Video / QA Report**: Tất cả các tệp đầu ra của pipeline phải được ghi nhận đường dẫn tương đối trong tệp `job_manifest.json` của Job đó.

### Luật C: No Floating State (Không sử dụng trạng thái thả nổi)
* Nghiêm cấm việc dùng các hàm trả về "phần tử mới nhất" kiểu `getLatestProduct()`, `getLatestJob()`, `getLatestPreview()` để tự động gán dữ liệu cho các hành động thực thi sản xuất hoặc duyệt bài của Operator, trừ phi có sự đối chiếu định danh khớp 100%.
* Mọi hành động tương tác trong Command Center (Action 1, Action 2, Action 3) phải hiển thị rõ thông tin định danh Job hiện tại và trạng thái binding để Operator kiểm soát.

### Luật D: Mock Data Boundary (Ranh giới dữ liệu giả lập)
* Dữ liệu mock/catalog/demo chỉ được sử dụng cho mục đích hiển thị giao diện mẫu hoặc chạy chế độ phát triển thử nghiệm (được dán nhãn rõ ràng).
* Quy trình sản xuất thực tế (Production workflow) tuyệt đối không được đọc dữ liệu trực tiếp từ các thư viện dữ liệu giả (`mock-data.ts`, catalog chưa liên kết).

### Luật E: Server-side Gate (Chốt kiểm soát phía Máy chủ)
* Giao diện người dùng (UI) chỉ đóng vai trò hỗ trợ hiển thị cảnh báo và khoá nút bấm để hướng dẫn Operator.
* **Tất cả các API endpoint thực thi tác vụ (intake, approve, run-production, publish) bắt buộc phải tự thực hiện xác thực chéo ở phía server**. Nếu phát hiện lệch context hoặc thiếu liên kết, API phải trả về mã lỗi thích hợp (ví dụ: `409 PRODUCT_JOB_MISMATCH` hoặc `400 PRODUCT_BINDING_MISSING`) và chấm dứt xử lý ngay lập tức.

### Luật F: State Transition (Chuyển đổi trạng thái tuần tự)
Một Job phải đi qua tuần tự các trạng thái thiết kế, không nhảy cóc qua các chốt kiểm soát quan trọng:
1. `CREATED` (Mới tạo nháp từ Product Card)
2. `WAITING_FOR_SOURCE_VIDEO` (Chờ Operator cung cấp và lưu link video nguồn)
3. `SOURCE_READY` (Nguồn sạch đã tải về cục bộ và trích xuất khung hình thành công, chờ Operator đánh giá)
4. `SOURCE_APPROVED` / `WATERMARK_NOT_DETECTED` (Nguồn đã được Operator duyệt sạch qua UI)
5. `PRODUCTION_RUNNING` (Đang chạy pipeline sản xuất nền)
6. `READY_FOR_OPERATOR_REVIEW` (Sản xuất và chạy QA tự động xong, chờ duyệt thành phẩm)
7. `APPROVED` (Đã duyệt thành phẩm)
8. `PACKAGED` (Đóng gói hoàn tất)

### Luật G: Audit Trail (Nhật ký hành động)
Mọi hành động phê duyệt, từ chối, chạy sản xuất nền của Operator phải được lưu vết trong manifest hoặc báo cáo tương ứng dưới thư mục runtime của job, bao gồm:
* `jobId`
* `timestamp` (ISO format)
* `action` (Ví dụ: `OPERATOR_APPROVE_CLEANLINESS`, `RUN_PRODUCTION`)
* `notes` (Bắt buộc nhập lý do/ghi chú vận hành)

---

## 3. Cấu trúc Thư mục & Đường dẫn An toàn

Để ngăn chặn các lỗi bảo mật nâng quyền và ghi đè tệp ngoài ý muốn (path-traversal), mọi đường dẫn tệp tin phục vụ sản xuất phải được giải quyết (resolve) thông qua hàm an toàn:
* Chỉ chấp nhận các đường dẫn bắt đầu bằng `runs/<jobId>/` hoặc `data/temp/jobs/<jobId>/`.
* Tuyệt đối không nhận đường dẫn tệp tin tuyệt đối hoặc tự chọn từ phía client gửi lên API.
