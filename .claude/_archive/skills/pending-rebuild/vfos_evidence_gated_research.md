# Skill: VFOS_EVIDENCE_GATED_RESEARCH_SKILL

## 1. Mục tiêu tối cao
Ngăn Agent đưa dữ liệu chưa xác minh, suy đoán hoặc tự dựng vào bất kỳ quyết định nào của VFOS.

> **Nguyên tắc gốc**: Không có bằng chứng đủ mạnh → không được trình bày như sự thật.

Skill này là **cổng kiểm chứng thực chứng bắt buộc** cho mọi nhiệm vụ thu thập dữ liệu, nghiên cứu nguồn, tìm video, tìm trend, tìm sản phẩm, tìm đối thủ, hoặc tạo batch đầu vào cho các agent downstream.

## 2. Bối cảnh: Tại sao Skill này tồn tại
VFOS đã gặp lỗi nghiêm trọng trong quá trình chuẩn bị Market Validation 001:
- Agent tạo file `REAL_VIDEO_CANDIDATES_001.md` chứa 10 URL video YouTube/TikTok.
- Toàn bộ URL đều là **hallucinated** (tự dựng), không video nào tồn tại thật.
- Transcript, views, likes, shares cũng bị bịa để file trông có vẻ hoàn chỉnh.
- Nếu không bị người vận hành phát hiện kịp thời, dữ liệu giả này đã được nạp vào VOE, làm hỏng toàn bộ thí nghiệm Market Validation 001 và phá vỡ nguyên tắc "Data beats opinion" của dự án.

**Skill này được thiết kế để lỗi đó không bao giờ xảy ra lần nữa.**

## 3. Phạm vi áp dụng (Khi nào PHẢI kích hoạt)
Skill này **tự động áp dụng** cho mọi nhiệm vụ liên quan đến:
- Tìm URL video thật (YouTube, TikTok, Douyin, bất kỳ nền tảng nào)
- Tìm nguồn hàng, sản phẩm, link affiliate thật
- Tìm trend, case study, competitor
- Thu thập số liệu engagement (views, likes, shares, CTR)
- Trích transcript, caption, metadata từ nguồn ngoài
- Tạo candidate list phục vụ Market Validation
- Thu thập bất kỳ dữ liệu nào từ web để Agent khác hoặc Claude Code dùng tiếp

---

## 4. Bảy nguyên tắc bất khả xâm phạm

### Nguyên tắc 1: KHÔNG BỊA DỮ LIỆU
Tuyệt đối không được tự dựng:
- URL (bao gồm video ID, slug, path)
- Views, likes, shares, comment count
- Transcript hoặc caption
- Tên kênh, tên creator
- Tên sản phẩm cụ thể kèm giá
- Chỉ số thị trường, số liệu thống kê
- Lời trích dẫn, bằng chứng xác minh

**Nếu không lấy được → ghi rõ:**
- `unknown`
- `not_found`
- `needs_manual_verification`
- Hoặc nói thẳng: *"Chưa thể xác minh trong môi trường hiện tại."*

### Nguyên tắc 2: PHÂN CẤP TRẠNG THÁI BẰNG CHỨNG
Mỗi mục dữ liệu thu thập phải được gắn một trong các trạng thái:

| Trạng thái | Định nghĩa | Được dùng cho downstream? |
|---|---|---|
| `VERIFIED` | Đã mở/xác minh được nguồn cụ thể hoặc có bằng chứng trực tiếp đáng tin | ✅ Có |
| `PARTIALLY_VERIFIED` | Có bằng chứng gián tiếp, xác minh được một phần | ⚠️ Có kèm cảnh báo |
| `UNVERIFIED` | Chưa xác minh được; chỉ là ứng viên cần kiểm tra thêm | ❌ Không, trừ khi gắn nhãn rõ |
| `INVALID` | Link chết, nguồn sai, dữ liệu mâu thuẫn, không đáng tin | ❌ Tuyệt đối không |

### Nguyên tắc 3: PHẢI NÓI RÕ CÁCH XÁC MINH
Mỗi item quan trọng phải có:
- `verification_status`: Một trong 4 cấp trên.
- `verification_note`: Mô tả ngắn cách đã kiểm tra.
- `evidence_source`: Nguồn bằng chứng hoặc phương pháp kiểm tra.

Ví dụ đúng:
- *"URL mở được qua read_url_content, hiển thị đúng video dụng cụ cắt rau, title khớp."*
- *"Chỉ thấy bài tổng hợp trên blog đề cập sản phẩm, chưa mở được video gốc."*
- *"Không tìm được bằng chứng công khai xác nhận URL này tồn tại."*

### Nguyên tắc 4: KHÔNG BIẾN DỮ LIỆU CHƯA XÁC MINH THÀNH ĐẦU VÀO QUYẾT ĐỊNH
Nếu batch phục vụ bước downstream (VOE scoring, Revenue experiment, Market validation, ContentFactory planning), Skill phải **chặn bàn giao** nếu:
- Dữ liệu cốt lõi chưa đạt ngưỡng xác minh tối thiểu.
- Còn lẫn item `INVALID` hoặc `UNVERIFIED` mà không được gắn nhãn rõ ràng.

### Nguyên tắc 5: THÀ THIẾU CÒN HƠN SAI
- 3 item `VERIFIED` có giá trị hơn 10 item trông đẹp nhưng không kiểm chứng được.
- Nếu không thu đủ số lượng yêu cầu, Agent phải **báo thiếu thẳng thắn**, không được bịa thêm để đủ số.

### Nguyên tắc 6: ĐẶC BIỆT NGHIÊM NGẶT VỚI URL VIDEO
- Không được tự dựng video ID (YouTube, TikTok, Douyin).
- Không được coi URL là thật chỉ vì "trông hợp định dạng".
- Nếu chưa mở/xác minh được → đánh `UNVERIFIED`.
- Nếu URL sai/chết → đánh `INVALID`.
- Batch dùng cho Market Validation **chỉ nên chứa item `VERIFIED`** hoặc ghi rõ item nào cần người vận hành kiểm tra tay.

### Nguyên tắc 7: TRANSCRIPT VÀ METADATA PHẢI TRUNG THỰC
- Transcript chỉ được ghi là transcript thật nếu lấy trực tiếp từ nguồn hoặc có bằng chứng đáng tin.
- Nếu Agent chỉ suy đoán nội dung video → phải ghi là `content_summary`, **không được gọi là `transcript`**.
- Views/likes/shares nếu không thấy trực tiếp → ghi `unknown`.

---

## 5. Gate bàn giao bắt buộc (Pre-Handoff Checklist)
Trước khi báo "đã hoàn thành" bất kỳ nhiệm vụ thu thập dữ liệu nào, Agent **bắt buộc** phải tự chạy checklist sau:

- [ ] Có item nào là dữ liệu tự dựng không?
- [ ] Có URL nào chưa mở/xác minh mà lại trình bày như thật không?
- [ ] Có chỉ số nào đang là ước đoán nhưng bị viết như fact không?
- [ ] Có transcript nào không phải transcript thật không?
- [ ] Có batch nào downstream sẽ hiểu nhầm là "ready" dù chưa đủ bằng chứng không?

**Nếu có bất kỳ câu trả lời "CÓ" → Agent phải sửa trước khi bàn giao.**

---

## 6. Output format chuẩn
Mỗi lần áp dụng Skill, Agent phải báo cáo theo cấu trúc:

1. **Research Objective**: Nhiệm vụ nghiên cứu cụ thể.
2. **Evidence Standard Used**: Tiêu chuẩn xác minh đã áp dụng.
3. **Results Table**: Bảng kết quả với các cột:
   - Item
   - `verification_status`
   - `verification_note`
   - Missing fields
4. **What Is Verified**: Liệt kê các item đã xác minh được.
5. **What Is Unverified / Invalid**: Liệt kê các item chưa xác minh hoặc không hợp lệ.
6. **Can This Be Used Downstream?**: `YES` / `NO` / `YES WITH WARNINGS`
7. **Safe Next Step**: Bước tiếp theo an toàn.

---

## 7. Quy tắc quyết định downstream

| Tình huống | Quyết định |
|---|---|
| Dữ liệu dùng cho quyết định quan trọng, phần lớn `UNVERIFIED` | **KHÔNG** được chuyển giao downstream |
| Một số item `VERIFIED`, một số thiếu nhẹ | Có thể chuyển giao **một phần**, phải tách batch rõ ràng |
| Dữ liệu chỉ là ý tưởng sơ bộ, không phải đầu vào quyết định | Có thể trình bày, nhưng phải gắn nhãn `exploratory, not decision-ready` |

---

## 8. Anti-patterns (Lỗi phải tránh tuyệt đối)
- ❌ *"Tôi đã tìm thấy 10 video thật"* nhưng link chưa từng được mở.
- ❌ Dựng video ID để file nhìn đầy đủ.
- ❌ Tự viết transcript cho video chưa xem.
- ❌ Ghi engagement number không có nguồn.
- ❌ Nói *"dữ liệu sẵn sàng cho Market Validation"* khi thực tế vẫn là placeholder.
- ❌ Đặt `data_status: READY_FOR_VOE` cho item chưa xác minh URL.

## 9. Ví dụ output đúng
Một kết quả trung thực phải dám nói:

> *"Tôi chỉ xác minh được 4 video cụ thể có URL thật. 6 video còn lại chỉ là gợi ý chủ đề, chưa đủ điều kiện đưa vào Market Validation 001. Batch này CHƯA nên chuyển sang VOE scoring."*

> *"Trong môi trường hiện tại, tôi không có khả năng mở và xác minh URL video trên TikTok/Douyin. Tôi đề xuất người vận hành tự thu thập link thật và nạp vào hệ thống."*
