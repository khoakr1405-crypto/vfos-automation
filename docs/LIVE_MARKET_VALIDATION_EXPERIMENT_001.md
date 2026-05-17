# Live Market Validation Experiment 001

## 1. Mục tiêu thí nghiệm
Chứng minh khả năng của Video Opportunity Evaluator (VOE) trong điều kiện thực tế. Xác nhận rằng những video nước ngoài được VOE đánh giá `PROCEED` (điểm cao) khi được Việt hóa thủ công sẽ thực sự thu hút lượt xem và tạo ra click affiliate tại thị trường Việt Nam.

## 2. Giả thuyết
Top 3-5 video có điểm `score > 80` từ VOE, khi được edit thủ công bám sát chính xác chiến lược `content_factory_handoff`, sẽ đạt được chỉ số giữ chân (watch time) đạt chuẩn và đem về những lượt click affiliate đầu tiên sau 48-72 giờ đăng tải.

## 3. Phạm vi (Scope)
- **Kênh thử nghiệm**: 1 tài khoản TikTok hoặc Facebook Reels (mới hoặc đang có sẵn) tại VN, có gắn bio link hoặc tính năng affiliate.
- **Niche ưu tiên**: Gia dụng thông minh, gadget, tiện ích nhà bếp (dễ ra quyết định mua, visual mạnh).
- **Quy mô**: Nhặt 10 video -> Chấm bằng VOE -> Chọn 3-5 video tốt nhất -> Đăng thực tế.

## 4. Cách chọn 10 video nguồn
- Lướt thủ công Douyin/TikTok nước ngoài (bằng người thật).
- Nhắm các video đang lên xu hướng hoặc có lượng tương tác tốt, nội dung biểu diễn trực quan.
- Sao chép URL và chuẩn bị metadata thô (Title, Description, Transcript).

## 5. Cách dùng VOE để chấm
- Gom metadata thành file JSON chuẩn `VFOSEvaluateInput`.
- Chạy script/CLI gọi Syscall `agents.voe.evaluate` (chạy qua Real Anthropic Driver) để lấy 10 kết quả đánh giá.

## 6. Tiêu chí chọn 3-5 video đem đi edit
- `verdict` bắt buộc là `PROCEED`.
- `score` nằm trong top cao nhất (ưu tiên > 80).
- `confidence` cao (> 85).
- `risks` thấp (không dính bản quyền nền tảng, có thể tìm được sản phẩm tương tự trên Shopee/TikTok Shop VN).

## 7. Quy trình Edit thủ công (Handoff-Driven)
Con người đóng vai trò là "ContentFactory chạy bằng cơm", tuân thủ nghiêm ngặt chỉ dẫn của AI:
- **Localization angle**: Chuyển ngữ theo đúng hướng AI gợi ý (hài hước, giật gân, review chân thực...).
- **Edit direction**: Cắt xén, zoom, đẩy nhịp điệu đúng như AI bảo.
- **Voice style**: Thu âm lồng tiếng (hoặc dùng TTS) chuẩn với style AI đề xuất.
- **Hook angle**: Bắt buộc 3 giây đầu tiên phải sử dụng câu Hook mà AI mớm cho.

## 8. Metric cần thu thập (sau 48-72h)
- Views (Lượt xem)
- Average Watch Time (Tỷ lệ giữ chân - rất quan trọng)
- Affiliate Link Clicks / Profile Clicks (Tín hiệu ra tiền)

## 9. Pass/Fail & Quyết định
- **PASS**: Có video cắn đề xuất (view cao hơn mức trung bình kênh test) VÀ có phát sinh Affiliate Click thật.
  -> *Quyết định: Niềm tin vào VOE được xác thực. Khóa System Prompt VOE, chuyển sang bước code ContentFactory Agent để bắt đầu tự động hóa khâu Edit.*
- **FAIL**: Cả loạt video đều lẹt đẹt, người xem lướt qua ngay 3s đầu, không có click.
  -> *Quyết định: Tuyệt đối dừng xây hệ thống tự động. Quay lại xem xét content bị lỗi ở đâu (do chọn video sai hay do localize sai) và tinh chỉnh lại bộ não VOE.*

## 10. Những việc TUYỆT ĐỐI CHƯA LÀM
- Không code TrendScout Agent (Cào video tự động).
- Không code ContentFactory Agent (Tự động cắt ghép/render video).
- Không code Publisher Agent (Tự động đăng bài).
