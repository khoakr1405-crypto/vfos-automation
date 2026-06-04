# Hướng dẫn lập lịch báo cáo tuần tự động VFOS Growth OS

Tài liệu này hướng dẫn Operator cấu hình tự động hóa việc tạo **Weekly Growth Review Report** vào mỗi sáng thứ Hai hằng tuần bằng Windows Task Scheduler.

---

## 1. Mục tiêu tự động hóa
- **Thời gian chạy**: 08:00 sáng Thứ Hai hằng tuần.
- **Kết quả đầu ra**: Báo cáo tuần ở định dạng `.json` và `.md` được tự động ghi vào thư mục runtime:
  `data/growth/runtime/reports/weekly/`
- **Giao diện**: Các báo cáo này sẽ hiển thị tự động trong danh mục Lưu trữ (Archive) tại trang Analytics (`/analytics`) của VFOS Studio.
- **Ranh giới an toàn**: Không đẩy (push) báo cáo lên Git, không gọi Graph API của Facebook/TikTok nếu không cấu hình live, và không thực hiện phản hồi/upload tự động.

---

## 2. Điều kiện trước khi cài đặt
Trước khi cài đặt Task Scheduler, hãy đảm bảo:
1. Thư mục mã nguồn sạch (`git status` sạch và không có xung đột).
2. Các phụ thuộc được cài đặt đầy đủ (`pnpm install`).
3. Chạy thử nghiệm verify thành công:
   ```bash
   pnpm growth:weekly-report:verify
   ```
4. Nếu muốn lấy dữ liệu live từ Facebook API, hãy chắc chắn `.env` đã có cấu hình `FACEBOOK_PAGE_ACCESS_TOKEN` và `FACEBOOK_PAGE_ID`, đồng thời `META_MODE=live`. (Mặc định `META_MODE=mock` sẽ chạy an toàn với dữ liệu giả lập).

---

## 3. Lệnh chạy và kiểm tra thủ công

### Chạy thử nghiệm (Dry-run) - Không ghi file
```bash
pnpm growth:weekly-report --dry-run
```

### Chạy tạo báo cáo thật
```bash
pnpm growth:weekly-report
```

---

## 4. Các bước cấu hình Windows Task Scheduler thủ công

Hãy thực hiện các bước sau trên máy chủ / máy làm việc Windows của bạn:

1. **Mở Task Scheduler**:
   - Nhấn tổ hợp phím `Win + R`, nhập `taskschd.msc` và nhấn `Enter`.
2. **Tạo Task cơ bản**:
   - Ở cột **Actions** bên phải, chọn **Create Basic Task...**.
   - **Name**: `VFOS Weekly Growth Report Automation`.
   - **Description**: `Tự động tạo báo cáo đánh giá tăng trưởng tuần của VFOS vào mỗi thứ Hai lúc 08:00 sáng`.
   - Nhấn **Next**.
3. **Thiết lập Trigger**:
   - Chọn **Weekly**, nhấn **Next**.
   - **Start**: Chọn ngày thứ Hai gần nhất, giờ thiết lập là `08:00:00`.
   - **Recur every**: `1` weeks.
   - Tick chọn thứ Hai (**Monday**).
   - Nhấn **Next**.
4. **Thiết lập Action**:
   - Chọn **Start a program**, nhấn **Next**.
   - **Program/script**: Nhập `cmd.exe`.
   - **Add arguments (optional)**:
     ```text
     /c cd /d <DUONG_DAN_REPO_VFOS> && pnpm growth:weekly-report
     ```
     *(Lưu ý: Thay thế `<DUONG_DAN_REPO_VFOS>` bằng đường dẫn tuyệt đối đến thư mục chứa mã nguồn của bạn, ví dụ: `c:\Users\Admin\Desktop\vfos-automation`)*
   - **Start in (optional)**:
     ```text
     <DUONG_DAN_REPO_VFOS>
     ```
   - Nhấn **Next**.
5. **Hoàn tất**:
   - Xem lại tóm tắt cấu hình và nhấn **Finish**.

---

## 5. Kiểm tra và xác minh sau khi chạy
Sau khi Task Scheduler kích hoạt chạy lệnh:
1. Mở trình duyệt truy cập `http://localhost:3002/analytics`.
2. Xem mục **Weekly Growth Review Report**, kiểm tra xem tuần mới nhất đã xuất hiện trong danh sách **Archives** chưa.
3. Nhấp vào nút **Open Markdown** để xem nội dung báo cáo trực tiếp trên giao diện Studio.
4. Kiểm tra thư mục cục bộ xem có xuất hiện file JSON và MD không:
   - `data/growth/runtime/reports/weekly/<weekId>.json`
   - `data/growth/runtime/reports/weekly/<weekId>.md`

---

## 6. Hướng dẫn xử lý lỗi (Troubleshooting)

| Lỗi gặp phải | Nguyên nhân | Cách xử lý |
|---|---|---|
| **`pnpm` không phải là lệnh hợp lệ** | Biến môi trường Path của Windows thiếu đường dẫn tới thư mục cài đặt `pnpm` hoặc `node`. | Thay đổi Arguments trong Task Scheduler để gọi đường dẫn tuyệt đối của `pnpm.cmd`, ví dụ: `/c cd /d <REPO_PATH> && C:\Users\Admin\AppData\Roaming\npm\pnpm.cmd growth:weekly-report` |
| **Không tìm thấy thư mục Repo** | Đường dẫn trong arguments hoặc Start in bị sai. | Kiểm tra lại đường dẫn repo bằng cách chạy `cd /d <DUONG_DAN_REPO_VFOS>` trên Command Prompt thủ công để xác nhận. |
| **Báo cáo không được sinh ra** | Thư mục dữ liệu runtime bị khoá hoặc phân quyền ghi bị chặn. | Đảm bảo tài khoản Windows chạy Task Scheduler có quyền ghi (Write) vào thư mục repo. |
| **Bị đẩy lên Git khi commit** | Thư mục lưu trữ báo cáo chưa được thêm vào `.gitignore`. | Đảm bảo dòng `data/growth/runtime/` có mặt trong file `.gitignore` ở gốc dự án. |

---

## 7. Ranh giới an toàn và Bảo mật
- **Không tự động commit**: Báo cáo được tạo ra tại thư mục runtime cục bộ và không được phép đưa vào staging/commit.
- **Không in/log thông tin nhạy cảm**: Tuyệt đối không lưu trữ, in ra màn hình hoặc ghi log các giá trị token, access token hay client secret của Facebook/TikTok.
- **Chế độ Read-only**: Lịch chạy này chỉ thực hiện tải và phân tích dữ liệu hiệu suất của các video đã đăng, hoàn toàn không gửi bài đăng mới, không phản hồi bình luận live hay tương tác trực tiếp lên tài khoản.
