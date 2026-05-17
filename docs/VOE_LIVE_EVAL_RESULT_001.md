# VOE Live Eval — Run #001

**Ngày chạy:** 2026-05-17  
**Script:** `pnpm --filter @vfos/kernel voe:eval`  
**Model:** claude-sonnet-4-6 (qua Anthropic API thật)  
**Dataset:** `docs/VOE_TEST_DATASET_V1.md` — 10 cases

---

## Tóm tắt

| Chỉ số | Kết quả |
|---|---|
| Cases chạy | 10 |
| Match label | 9/10 |
| Mismatch | 1/10 (case_10) |
| Tổng chi phí | ~28¢ |
| Tổng thời gian | ~276s |

**Kết luận:** VOE v1 đã chứng minh luồng end-to-end thật hoạt động. Đủ điều kiện chuyển sang thí nghiệm với video thật nhỏ.

---

## Chi tiết từng case

| ID | Tên | Expected | Actual | Match |
|---|---|---|---|---|
| case_01 | Máy giặt tất/đồ lót mini | PROCEED | PROCEED | ✓ |
| case_02 | Chai xịt tẩy bẩn nhà bếp siêu tốc | PROCEED | PROCEED | ✓ |
| case_03 | Sạc dự phòng MagSafe từ tính | PROCEED | PROCEED | ✓ |
| case_04 | Mặt nạ lột mụn đầu đen | PROCEED | PROCEED | ✓ |
| case_05 | Dụng cụ gọt và bổ dứa siêu tốc | PROCEED | PROCEED | ✓ |
| case_06 | Tiểu phẩm hài chơi chữ địa phương | SKIP | SKIP | ✓ |
| case_07 | Hướng dẫn săn mã giảm giá Taobao | SKIP | SKIP | ✓ |
| case_08 | Máy làm mì tươi công nghiệp | SKIP | SKIP | ✓ |
| case_09 | Phân tích khoa học Retinol hàn lâm | SKIP | SKIP | ✓ |
| case_10 | Review bún ốc Liễu Châu | SKIP | **PROCEED** | ✗ BORDERLINE |

---

## Case_10 — Phân tích mismatch

**Input:** Douyin review bún ốc Liễu Châu, 2.1M views, engagement rate ~9.6%

**Label ban đầu:** SKIP — lý do vệ sinh ATTP + khó tìm link affiliate tương đương trên sàn VN.

**Model trả về:** PROCEED (score 72, confidence 78)

**Rationale của model:**
> Bún ốc Liễu Châu đã có độ nhận diện tốt tại VN nhờ trend ẩm thực TQ lan qua TikTok. Format "thử thách mùi nồng" phù hợp tâm lý tò mò gen Z. Sản phẩm có thể affiliate qua Shopee/Lazada VN vì mì gói bún ốc đang bán rộng rãi.

**Risks model nêu ra:**
- Tâm lý anti-Trung Quốc nếu lộ nguồn Douyin
- Nguồn hàng TQ bất ổn, link affiliate có thể đứt
- Copyright âm thanh gốc Douyin bị claim trên TikTok/Facebook VN
- Mô tả "mùi như rác" dễ phản cảm nếu dịch sát
- Cạnh tranh cao trong niche food review ẩm thực Trung

**Content Factory Handoff (đầy đủ):**
- **Angle:** Đóng khung thành "Người Việt lần đầu thử" — không re-upload thẳng, so sánh với bún ốc truyền thống VN
- **Edit:** Cắt còn 30-45s, giữ reaction mùi + cảnh ăn đầu, thêm packshot + link Shopee, thay toàn bộ âm thanh gốc tránh copyright
- **Voice:** Giọng nữ Nam Bộ, drama nhẹ khi tả mùi, hào hứng khi tả vị, từ lóng gen Z ("đỉnh của chóp", "nghiện không thoát")
- **Hook:** *"Món này mùi như... nhưng tại sao triệu người vẫn ghiền?"*

**Nhận định:** Lập luận của model có căn cứ thực tế — sản phẩm đóng gói đã xuất hiện trên Shopee VN. Đây là case **borderline thật sự**, không phải model fail. Label SKIP gốc có thể quá bảo thủ. Cần người review thủ công quyết định cuối.

---

## Kết luận & Bước tiếp theo

### VOE v1 đã chứng minh được:
- Luồng end-to-end thật: Douyin/TikTok metadata → AI evaluation → structured JSON output
- 9/10 cases khớp với phán đoán của affiliate strategist có kinh nghiệm
- Cost per evaluation: ~2-3¢ — hoàn toàn khả thi ở scale
- Latency: 20-35s per case — chấp nhận được cho batch offline processing

### Điều kiện tiếp theo đã đủ:
**→ Chuyển sang thí nghiệm video thật nhỏ:**
- Lấy 1-2 video từ Douyin/TikTok thật (không dùng sample URL)
- Chạy VOE evaluate với metadata thật
- Nếu PROCEED: chuyển sang content localization + đăng thử lên Facebook/TikTok VN
- Đo kết quả thật (views, click affiliate link, doanh thu nếu có)

### Cải tiến VOE cần xem xét (không ưu tiên ngay):
- Thêm flag `borderline: true` khi confidence < 80 và score 60-75
- Tinh chỉnh system prompt để nhấn mạnh rủi ro vệ sinh ATTP cho food niche
- Tích hợp kiểm tra thực tế link Shopee/Lazada trước khi PROCEED
