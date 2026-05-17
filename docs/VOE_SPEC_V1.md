# Video Opportunity Evaluator (VOE) - Spec v1

## 1. Overview & Business Objective
*   **Tên Agent**: Video Opportunity Evaluator (VOE)
*   **Vai trò**: Bộ não đánh giá và chọn lọc đầu phễu (Selection Stage).
*   **Mục tiêu kinh doanh**: Giảm thiểu chi phí cơ hội bằng cách loại bỏ các video không có tiềm năng. Đánh giá dựa trên 2 trục: **View Potential** (Sức kéo traffic) và **Monetization Fit** (Khả năng ghép link affiliate hợp lý). Không chỉ xét các video có sản phẩm trực tiếp.
*   **Quan hệ với hệ thống**: VOE là bước đánh giá tiền đề. VOE **KHÔNG** trực tiếp chỉnh sửa video. Nếu kết quả là `PROCEED`, đầu ra của VOE sẽ đóng vai trò là "kim chỉ nam" chiến lược (Handoff) cho bước tiếp theo (ContentFactory Agent) để thực hiện biên tập.

## 2. Input Schema (VFOSEvaluateInput)
Đầu vào là các metadata thô thu thập được từ video gốc:
```json
{
  "source_url": "string (URL gốc của video)",
  "platform": "string (tiktok | douyin | youtube)",
  "niche": "string (ví dụ: gia dụng thông minh, mỹ phẩm, gadget)",
  "metadata": {
    "title": "string",
    "description": "string",
    "transcript": "string (nội dung lồng tiếng gốc nếu có)",
    "tags": ["string"]
  },
  "engagement": {
    "views": "number",
    "likes": "number",
    "shares": "number (optional)"
  }
}
```

## 3. Output Schema (VFOSEvaluateOutput)
Đầu ra được định dạng JSON chuẩn, cung cấp quyết định và hướng dẫn chi tiết cho ContentFactory:
```json
{
  "vi_evaluation": {
    "score": "number (0-100, đánh giá tổng quan mức độ phù hợp)",
    "confidence": "number (0-100, mức độ tự tin của AI vào đánh giá này)",
    "verdict": "PROCEED | SKIP",
    "rationale": "string (lý do cụ thể tại sao nên hoặc không nên làm video này tại VN)",
    "risks": ["string (các rủi ro tiềm ẩn: bản quyền, văn hóa, khó dịch thuật, không phù hợp thị hiếu...)"],
    "target_audience": "string (mô tả tệp khách hàng tiềm năng tại VN)",
    "affiliate_category": "string (ngành hàng/ngách sản phẩm nên gắn link affiliate)"
  },
  "content_factory_handoff": {
    "suggested_localization_angle": "string (hướng tiếp cận khi đưa về VN: review chân thực, hài hước, drama...)",
    "suggested_edit_direction": "string (gợi ý cắt ghép: cắt bỏ đoạn đầu dài dòng, zoom vào chi tiết sản phẩm...)",
    "suggested_voice_style": "string (kiểu giọng đọc: AI năng lượng cao, AI review nhẹ nhàng, giữ giọng gốc thêm vietsub...)",
    "suggested_hook_angle": "string (gợi ý câu hook mở đầu 3s đầu tiên để giữ chân viewer VN)"
  }
}
```

## 4. System Flow (Kernel + AI Router)
1.  **Trigger**: Client gọi Syscall `agents.voe.evaluate(input)`.
2.  **Auth & Limits**: Kernel kiểm tra quyền truy cập và cấu hình budget.
3.  **AI Router Execution**: Kernel gọi `ai.complete` qua **Anthropic Driver**. Model cụ thể (VD: Claude 3.5 Sonnet) sẽ được lấy từ cấu hình linh hoạt (Config / Environment Variables), **KHÔNG** hardcode, để dễ dàng nâng cấp/thay đổi về sau.
4.  **Audit Logging**: `AuditLogger` tự động lưu lại toàn bộ input và output vào bảng `audit_log` phục vụ truy vết và debug.
5.  **Response**: Trả kết quả JSON `VFOSEvaluateOutput` về cho Client.

## 5. Success Metrics (Tiêu chí đánh giá)
Để xác nhận VOE hoạt động hiệu quả, ta đo lường theo 2 khía cạnh:
*   **System Metrics (Đo lường kỹ thuật)**:
    *   **JSON parse success rate**: Tỷ lệ output parse thành công chuẩn JSON > 95%.
    *   **Latency & Token Cost**: Thời gian phản hồi và chi phí token nằm trong ngân sách cho phép.
*   **Empirical Validation (Thực nghiệm kinh doanh)**:
    *   **Selection Rate**: Nhóm video có `score` cao có thực sự được người dùng/editor ưu tiên chọn để edit nhiều hơn không?
    *   **Performance Correlation**: Khi đăng tải thử nghiệm thật, những video được VOE khuyên `PROCEED` có mang lại lượt view/click/affiliate signal tốt hơn hẳn so với những video chọn ngẫu nhiên hay không?

## 6. Scope Boundaries (Giới hạn triển khai cho v1)
Để đảm bảo triển khai nhanh, gọn và chứng minh được luồng hệ thống hoạt động, phiên bản triển khai này **CẦN TUÂN THỦ NGHIÊM NGẶT**:
*   **Chưa tải video**: Không xử lý download/stream file media.
*   **Chưa auto post**: Không kết nối API đăng bài lên MXH.
*   **Chưa dựng 3 agent lớn**: Chỉ tập trung hoàn thiện duy nhất VOE.
*   **Chưa làm storage/domain phức tạp**: Không thiết kế database schema riêng cho kết quả VOE; tạm thời tận dụng bảng `audit_log` và in kết quả trực tiếp ra UI/Console.
*   **Chưa xử lý render/cắt dựng**: VOE chỉ phân tích text và trả về chiến lược (Handoff), không sinh ra file video mới.

## 7. Planned v2 evolution for content-led affiliate
> **Lưu ý**: Đây là hướng nâng cấp cho phiên bản v2 tương lai, chưa phải thay đổi hợp đồng (contract) của v1 hiện tại.

Trong tương lai, để phục vụ chiến lược **Content-Led Affiliate** (kéo view trước, ghép sản phẩm sau), bộ não VOE sẽ được cấu trúc lại để đánh giá rõ ràng 2 trục độc lập. Output Schema v2 dự kiến sẽ thay thế/bổ sung các trường sau:
*   `view_potential_score`: Đánh giá sức kéo traffic/viral độc lập với yếu tố bán hàng.
*   `monetization_fit_score`: Đánh giá độ dễ gắn link affiliate vào bối cảnh/ngách của video.
*   `direct_affiliate_matches`: Sản phẩm xuất hiện trực tiếp trong video (nếu có).
*   `indirect_affiliate_matches`: Danh sách các sản phẩm có thể bán chéo (cross-sell) dựa trên bối cảnh hoặc đam mê của tệp người xem (Ví dụ: xem câu cá -> bán ghế dã ngoại).
