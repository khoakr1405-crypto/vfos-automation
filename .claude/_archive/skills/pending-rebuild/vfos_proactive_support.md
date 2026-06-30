# Skill: VFOS_PROACTIVE_SUPPORT_SKILL

## 1. Mục tiêu (Goal)
Tự động đánh giá trạng thái hiện tại của dự án VFOS và chủ động đề xuất hoặc khởi tạo 1-2 tài liệu/công việc hỗ trợ CÓ GIÁ TRỊ NHẤT. Mục đích là giúp dự án tiến nhanh hơn hoặc giảm rủi ro lệch hướng mà không cần người dùng phải chỉ định từng tiểu tiết.

## 2. Phạm vi hoạt động (Scope)
Chỉ thực hiện các công việc liên quan đến tài liệu và phân tích hỗ trợ, bao gồm:
- Tài liệu định hướng (Docs)
- Checklist kiểm tra
- Rubric đánh giá (Evaluation rubric)
- Template review
- Bảng tiêu chí ra quyết định
- Implementation brief cho coder
- Handoff note chuyển giao giữa các session/agent

## 3. Nguyên tắc BẮT BUỘC (Strict Rules)
1. **KHÔNG SỬA CODE**: Tuyệt đối không chạm vào mã nguồn hệ thống.
2. **KHÔNG MỞ RỘNG SCOPE**: Không tự ý vẽ ra module lớn hoặc tính năng mới nếu chưa nằm trong lộ trình (Roadmap) cấp bách.
3. **KHÔNG TẠO RÁC**: Phải quét qua các thư mục tài liệu hiện tại (như `docs/`, `.claude/`) để đảm bảo không tạo tài liệu trùng lặp.
4. **TÍNH THỰC DỤNG**: Chỉ tập trung vào thứ giúp gỡ rối hoặc tăng tốc cho bước kỹ thuật/kinh doanh NGAY HIỆN TẠI.
5. **SELF-CHECK (Bắt buộc trước khi tạo)**: Phải tự vấn 3 câu hỏi:
   - Tài liệu này có thực sự cần thiết và giải quyết được vấn đề hiện tại không?
   - Nội dung này đã tồn tại ở file nào khác chưa?
   - Nó có giúp Claude Code hoặc con người vận hành ra quyết định dễ dàng/chính xác hơn không?
6. **BIẾT NÓI "KHÔNG"**: Nếu sau khi Self-Check thấy không có gì thực sự mang lại giá trị cao, bắt buộc phải trả lời: *"Chưa cần tạo thêm tài liệu lúc này. Hệ thống documentation đã đủ để tiến hành bước tiếp theo."* Tuyệt đối không sinh nội dung cho có.

## 4. Định dạng Output (Expected Output)
Mỗi lần Skill được gọi, Agent phải trả về cấu trúc sau:

1. **[Trạng thái dự án]**: Tóm tắt ngắn gọn Agent đang hiểu hệ thống VFOS đang kẹt/đang chờ ở bước nào.
2. **[Đề xuất]**: Liệt kê 1-2 việc hỗ trợ đáng làm nhất lúc này.
3. **[Thực thi]**: (Nếu Self-Check đạt) -> Trình bày luôn nội dung tài liệu/bảng biểu hoàn chỉnh.
4. **[Lý do]**: Trả lời ngắn gọn vì sao tài liệu vừa tạo lại cực kỳ hữu ích cho bước tiếp theo.
5. **[Bước tiếp theo]**: Đề xuất hành động thực tiễn (Actionable next step).
