# MEMORY.md — Index bộ nhớ dự án

> Đây là **project memory** (commit được, share team).
> Memory cá nhân cross-session của Claude nằm ở `C:\Users\Admin\.claude\projects\<hash>\memory\`.

## User
- **Trình duyệt vận hành**: Cốc Cốc (cho Shopee Affiliate CDP flow).
- **Quy trình tương tác**: Tự xử lý login, CAPTCHA, OTP thủ công trên trình duyệt.

## Feedback
- **Phong cách vận hành**: Làm từng phần chắc chắn, hoàn thiện đầy đủ rồi mới tiến hành lưu hoặc push lên Git.
- **Phê duyệt**: Tuyệt đối không tự động duyệt (auto-approve) hay tự động đăng tải (auto-publish) khi chưa có phê duyệt rõ ràng từ Operator.
- **Workflow tối giản**: Ưu tiên sử dụng các workflow tinh gọn đã được chuẩn hóa để tránh nhầm lẫn với các command cũ/legacy.

## Project
- **Mô tả dự án**: VFOS là hệ thống content-led affiliate / video automation.
- **Workflow vận hành chính**:
  1. Lấy thông tin sản phẩm và tạo job:
     ```bash
     pnpm commerce:intake --confirm-targeted-click --create-job
     ```
  2. Chạy review pipeline A-Z:
     ```bash
     pnpm job:run-review --job <jobId> --file "<video>.mp4" --confirm-ai
     ```
- **Quy tắc & Cấu hình Core**:
  - **Shopee Affiliate**: Cốc Cốc-only với CDP profile VFOS.
  - **Affiliate Owner bắt buộc**: `an_17376660568`.
  - **Bảo mật & Bypass**: Hệ thống không bypass login/CAPTCHA/OTP, Operator tự thực hiện.
  - **Inbox Video Nguồn**: `data/operator/video-downloads/`.
  - **Unified Review Pipeline**: Vision → Script → BGM → VoiceDirection → Render → Caption → AudioGuard → BgmGuard → Final QA.
  - **BGM Volume**: Mặc định `0.40`.
  - **Nguyên tắc an toàn**: Không tự động duyệt (No auto-approve), không tự động đăng (No auto-publish).
  - **Đăng bài (Facebook)**: Sử dụng lệnh `job:publish-facebook`. Mặc định chạy ở chế độ `--dry-run`, đăng thật chỉ khi truyền cờ `--confirm-live-publish`.
  - **Cấm commit**: Tuyệt đối không commit file runtime, video, mp3, thư mục `data/temp/`, file `.env`, token hoặc session.
- **Ghi chú Kỹ thuật (Project Notes)**:
  - **Facebook Live Publish Env**: Cần chính xác `FACEBOOK_PAGE_ID` và `FACEBOOK_PAGE_ACCESS_TOKEN`. Không yêu cầu các biến token phụ/legacy như `FACEBOOK_ACCESS_TOKEN`.
  - **Next.js Dev Server Env**: Cần load `.env` từ repo root một cách tường minh để tránh lệch trạng thái cấu hình với các CLI script.
- **Vai trò & Quy tắc Agent**:
  - **Vai trò**: Đóng vai trò chuyên gia tự động hóa AI, kiến trúc workflow/pipeline, prompt engineer và reviewer kỹ thuật cho VFOS.
  - **Nhiệm vụ chính**: Giúp Operator chuẩn hóa workflow, giảm số lượng lệnh vận hành, kiểm tra các chốt chặn an toàn (guardrail), viết prompt giao việc cho agent, kiểm định mã nguồn (audit code), phát hiện rủi ro và đề xuất cleanup/tối ưu hệ thống theo từng phần nhỏ.
  - **Nguyên tắc làm việc**: Thực hiện từng phần chắc chắn, không tự ý mở rộng phạm vi (scope) tùy tiện, không xóa/sửa/đăng tải (publish) nếu chưa có bằng chứng thực tế và phê duyệt rõ ràng từ Operator, luôn bảo vệ tính toàn vẹn của workflow A-Z chính.
  - **Nguyên tắc viết Prompt**: Khi viết prompt cho Claude hoặc các Agent khác, ưu tiên viết prompt dài, mô tả rõ bối cảnh, và bắt buộc có đầy đủ các mục: *Mục tiêu, Bối cảnh, Yêu cầu, Không làm, Security, Báo cáo*, kèm theo phần *SELF-REVIEW BẮT BUỘC*.
- **Định hướng Facebook Growth OS (Growth 06–08)**:
  - **Tư duy cốt lõi**: VFOS không phải bot spam link. Hệ thống đóng vai trò "Mắt thần bình luận" (Comment Intelligence) để giữ tương tác tự nhiên, bắt trend và chỉ chuyển hướng affiliate link khi đúng ngữ cảnh.
  - **Growth 06 (Comment Intelligence - Read-only)**:
    - Nhận diện đa chiều comment: intent bán hàng (`ASK_LINK`, `ASK_PRICE`, `ASK_WHERE_TO_BUY`, `QUESTION`, `JOKE`, `PRAISE`, `NEGATIVE_LIGHT`, `COMPLAINT`, `TREND_REACTION`, `SPAM`, `UNKNOWN`), cảm xúc/mood (`funny`, `curious`, `interested`, `skeptical`, `angry`, `neutral`), reply style đề xuất, conversion opportunity (`none`, `soft`, `medium`, `high`), `shouldIncludeLink` (boolean), và `riskLevel` (`low`, `medium`, `high`).
    - Hoạt động ở chế độ Read-only: Chưa trả lời thật, chưa auto-reply, chưa gọi Meta Graph API thật.
  - **Growth 07 (Draft Reply Assistant)**:
    - Gợi ý nháp câu trả lời vui vẻ, bắt trend vừa phải. Chỉ đề xuất link khi thực sự phù hợp (hỏi mua, hỏi giá, xin link). Operator duyệt thủ công rồi mới gửi.
  - **Growth 08 (Auto Reply Guarded)**:
    - Chỉ tự động reply với các intent cực kỳ an toàn. Tuyệt đối không auto-reply các bình luận chê, so sánh, complaint, hoặc nhạy cảm. Chế độ auto-reply mặc định tắt (OFF).


## Reference
- **Nguồn vận hành chuẩn**: Operator Guide chính thức là nguồn chuẩn; các tài liệu hoặc log cũ chỉ mang tính chất tham khảo lịch sử (historical reference).
- **Tài liệu hướng dẫn chính thức**: [HUONG_DAN_VAN_HANH_CHINH_THUC_VFOS.md](docs/00_DIEU_HANH/HUONG_DAN_VAN_HANH_CHINH_THUC_VFOS.md)
- **Báo cáo tinh gọn hệ thống**: [BAO_CAO_TRUOC_SAU_TINH_GON_VFOS.md](docs/00_DIEU_HANH/BAO_CAO_TRUOC_SAU_TINH_GON_VFOS.md)
- **Trạng thái hệ thống hiện tại**: [TRANG_THAI_VFOS_HIEN_TAI.md](docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md)
