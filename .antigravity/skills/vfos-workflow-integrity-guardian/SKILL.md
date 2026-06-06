# Skill: VFOS Workflow Integrity Guardian

Cẩm nang nghiệp vụ dành cho AI Agent hoạt động trên hệ sinh thái VFOS nhằm đảm bảo tính toàn vẹn của luồng công việc (Workflow Integrity).

---

## 1. Mục tiêu và Trách nhiệm

Bảo vệ hệ thống VFOS khỏi các lỗi không nhất quán dữ liệu giữa các bước vận hành của Operator (Action 1, Action 2, Action 3). Agent bắt buộc phải thực thi các nguyên tắc dưới đây mỗi khi chỉnh sửa UI hoặc viết API liên quan đến sản xuất/xuất bản.

---

## 2. Các Quy tắc Bắt buộc dành cho Agent

### 2.1. Kiểm tra Binding trước khi chạy sản xuất hoặc sửa code
* Luôn xác định thực thể đang thao tác thuộc về Job ID nào.
* Không tự ý liên kết UI hoặc API với dữ liệu toàn cục như "sản phẩm đang chọn hiện tại" (`selected_product_card.json`) nếu hành động đó là của một Job cụ thể.
* Đối chiếu chặt chẽ định danh sản phẩm (`shopId`, `itemId`, `shortLink`) giữa Product Card hoạt động và Product Card đã được lưu nháp (bind) vào Job manifest.

### 2.2. Không dùng Trạng thái Lơ lửng (Floating/Latest State) cho Tác vụ thật
* Cấm dùng logic lấy phần tử mới nhất từ Registry hoặc cơ sở dữ liệu mà không đối chiếu chính xác định danh (Job ID).
* Tách biệt rõ ràng phần hiển thị mẫu (catalog/mock data) với phần hiển thị tiến trình của Job thật.

### 2.3. Chốt kiểm soát phía Server (Server-side Guard) là bắt buộc
* Không bao giờ chỉ tin tưởng vào việc UI đã ẩn/khoá (disabled) nút bấm.
* Mọi API thực thi tác vụ quan trọng (chạy tải nguồn, phê duyệt nguồn, chạy sản xuất video, đăng bài) phải tự load manifest của Job từ phía server và kiểm tra chéo tính hợp lệ của dữ liệu đầu vào.
* API phải từ chối chạy và trả về lỗi chi tiết với mã phù hợp (ví dụ: `409 PRODUCT_JOB_MISMATCH`) nếu phát hiện dữ liệu không nhất quán.

### 2.4. Đảm bảo an toàn đường dẫn và thư mục (Path Safety)
* Không chấp nhận các tham số đường dẫn tệp tin tùy ý do client gửi lên.
* Server tự động giải quyết (resolve) đường dẫn dựa trên `jobId` đã được kiểm duyệt và định dạng an toàn (không chứa ký tự lạ chống lỗi path traversal).

### 2.5. Bảo toàn vệ sinh mã nguồn (Git Safety)
* Không bao giờ được phép commit các tệp tin tạm thời phát sinh trong quá trình chạy thử hoặc chạy thực tế:
  - Các thư mục runtime: `runs/`, `data/temp/jobs/`
  - Các tệp video/audio: `.mp4`, `.mp3`, `.jpg`, `.png`
  - Các tệp cấu hình môi trường: `.env`
  - Cookie, session, storage state của trình duyệt.

---

## 3. Quy trình tự kiểm tra (Self-Review Checklist)

Trước khi hoàn thành phiên làm việc và báo cáo Operator, Agent phải trả lời các câu hỏi:
1. API có tự động kiểm tra sự trùng khớp giữa Product Card của Job và Product Card đang chọn ở Action 1 chưa?
2. Nếu Operator cố tình gửi yêu cầu chạy sản xuất cho Job B khi đang chọn sản phẩm A ở giao diện, hệ thống có từ chối ngay lập tức và trả về mã lỗi `409` không?
3. UI hiển thị rõ mã Job hiện tại, sản phẩm của Job đó và trạng thái so khớp (`PASS`, `MISMATCH`, `MISSING`) chưa?
4. Đã chạy thử kiểm tra để chắc chắn không có tệp tin tạm nào lọt vào Git commit chưa?
