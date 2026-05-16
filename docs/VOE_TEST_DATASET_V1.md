# VOE v1 Manual Evaluation Dataset

> **Lưu ý**: Đây là bộ dữ liệu đánh giá thủ công (manual evaluation dataset) dành cho Video Opportunity Evaluator (VOE) v1. Nó dùng để kiểm chứng định tính khả năng suy luận (rationale) và chấm điểm (score) của AI có sát với tư duy làm affiliate tại Việt Nam hay không. Đây **không phải** là unit test deterministic (vì AI có thể trả về câu chữ khác nhau trong mỗi lần chạy, nhưng verdict và xu hướng điểm số phải nhất quán).

---

### 🟢 5 MẪU KỲ VỌNG "PROCEED" (Tiềm năng Affiliate Cao)

**1. Máy giặt tất/đồ lót mini (Gia dụng tiện ích)**
*   **Expected Verdict**: `PROCEED`
*   **Lý do**: Giải quyết đúng nỗi đau (lười giặt đồ nhỏ), tính trực quan cao (thấy rõ trước/sau), sản phẩm giá rẻ dễ chốt đơn bốc đồng trên Shopee/TikTok Shop VN.
```json
{
  "source_url": "https://douyin.com/video/12345_washing",
  "platform": "douyin",
  "niche": "gia dụng thông minh",
  "metadata": {
    "title": "神器！便携式迷你洗衣机",
    "description": "Không còn phải giặt tay đồ lót nữa. Máy giặt mini gấp gọn tiện lợi mang đi du lịch.",
    "transcript": "Mỗi ngày về nhà mệt mỏi, không muốn giặt tất? Nhìn đây, chỉ cần thả vào, bật nút, 5 phút sau sạch bong.",
    "tags": ["miniwashingmachine", "homegadget", "lazylife"]
  },
  "engagement": {
    "views": 2500000,
    "likes": 120000,
    "shares": 15000
  }
}
```

**2. Chai xịt tẩy bẩn nhà bếp siêu tốc (Vệ sinh nhà cửa)**
*   **Expected Verdict**: `PROCEED`
*   **Lý do**: Nội dung "satisfying" (tẩy rửa sướng mắt) có độ viral cực cao, dễ lồng tiếng giật gân, link affiliate mặt hàng này luôn có hoa hồng tốt.
```json
{
  "source_url": "https://tiktok.com/@cleaningsatis/video/999",
  "platform": "tiktok",
  "niche": "vệ sinh nhà cửa",
  "metadata": {
    "title": "Magic Kitchen Cleaner Spray #cleantok",
    "description": "Xóa bay vết dầu mỡ 10 năm tuổi trên chảo chỉ với 1 lần xịt.",
    "transcript": "Cái chảo này tôi định vứt đi rồi. Nhưng xem này, xịt lên, đợi 30 giây... lau nhẹ một cái. Tuyệt vời!",
    "tags": ["cleantok", "satisfying", "kitchenhack"]
  },
  "engagement": {
    "views": 5000000,
    "likes": 850000,
    "shares": 60000
  }
}
```

**3. Sạc dự phòng không dây hít từ tính (Gadget công nghệ)**
*   **Expected Verdict**: `PROCEED`
*   **Lý do**: Cộng đồng dùng iPhone tại VN lớn, sản phẩm hot trend, review trực quan không cần hiểu ngôn ngữ gốc cũng thấy được công năng.
```json
{
  "source_url": "https://douyin.com/video/magsafe_power",
  "platform": "douyin",
  "niche": "gadget nhỏ",
  "metadata": {
    "title": "磁吸充电宝，出门必带",
    "description": "Sạc dự phòng Magsafe nhỏ gọn, hít cực chặt, không lo dây dợ lằng nhằng.",
    "transcript": "Ra đường quên mang cáp sạc? Cục sạc này hít một phát là sạc ngay. Lắc mạnh cũng không rơi.",
    "tags": ["iphone", "powerbank", "techreview"]
  },
  "engagement": {
    "views": 1800000,
    "likes": 95000,
    "shares": 8000
  }
}
```

**4. Mặt nạ lột mụn đầu đen (Mỹ phẩm đơn giản)**
*   **Expected Verdict**: `PROCEED`
*   **Lý do**: Format "Before/After" hoặc zoom cận cảnh lột mụn kích thích thị giác mạnh, tệp khách hàng Gen Z và Gen Y VN rất dễ mua theo.
```json
{
  "source_url": "https://tiktok.com/@beautytips/video/skincare1",
  "platform": "tiktok",
  "niche": "mỹ phẩm đơn giản",
  "metadata": {
    "title": "Blackhead removal magic peel",
    "description": "Đánh bay mụn đầu đen vùng mũi chỉ sau 15 phút.",
    "transcript": "Mũi đầy mụn đầu đen nhìn rất mất thẩm mỹ. Bôi lớp gel này lên, đắp giấy dán, đợi khô và... ái chà, nhìn đống mụn được rút ra này.",
    "tags": ["skincare", "blackhead", "peeloff"]
  },
  "engagement": {
    "views": 8000000,
    "likes": 1200000,
    "shares": 95000
  }
}
```

**5. Dụng cụ gọt và bổ dứa/thơm siêu tốc (Mẹo nhà bếp)**
*   **Expected Verdict**: `PROCEED`
*   **Lý do**: Đồ dùng nhà bếp thông minh luôn thu hút các bà nội trợ, giá nhập rẻ (bán dễ trên TikTok Shop), hình ảnh biểu diễn gọt dứa dễ hiểu, không cần vietsub vẫn hiểu.
```json
{
  "source_url": "https://douyin.com/video/pineapple_cutter",
  "platform": "douyin",
  "niche": "tiện ích nhà bếp",
  "metadata": {
    "title": "切菠萝神器，太方便了",
    "description": "Chỉ mất 10 giây để lấy sạch ruột dứa nguyên vòng.",
    "transcript": "Ăn dứa ngại nhất là khâu gọt mắt. Dùng cái lõi này, ấn xuống, xoay tròn, kéo lên. Xong! Vừa sạch vừa đẹp.",
    "tags": ["kitchenhack", "fruitcutter", "smarttools"]
  },
  "engagement": {
    "views": 3200000,
    "likes": 210000,
    "shares": 45000
  }
}
```

---

### 🔴 5 MẪU KỲ VỌNG "SKIP" (Rủi ro cao / Khó chuyển đổi)

**6. Tiểu phẩm hài chơi chữ địa phương (Lệch văn hóa)**
*   **Expected Verdict**: `SKIP`
*   **Lý do**: Nội dung phụ thuộc 100% vào ngữ cảnh và từ lóng của ngôn ngữ gốc. Dịch sang tiếng Việt sẽ mất "miếng hài". Không có sản phẩm vật lý để gắn link affiliate.
```json
{
  "source_url": "https://douyin.com/video/comedy_wordplay",
  "platform": "douyin",
  "niche": "giải trí/hài hước",
  "metadata": {
    "title": "谐音梗扣钱！",
    "description": "Tranh cãi hài hước giữa sếp và nhân viên.",
    "transcript": "Sếp bảo tôi đi mua 'Bao Tử' (Bánh bao), tôi lại mua 'Bao Tử' (Túi xách). Hai chữ đọc giống hệt nhau mà!",
    "tags": ["comedy", "office", "wordplay"]
  },
  "engagement": {
    "views": 10000000,
    "likes": 2000000,
    "shares": 300000
  }
}
```

**7. Hướng dẫn săn mã giảm giá ứng dụng nội địa (Không thể Affiliate)**
*   **Expected Verdict**: `SKIP`
*   **Lý do**: App không khả dụng hoặc không phổ biến ở VN, người dùng VN không có nhu cầu, không có cách nào kiếm tiền affiliate từ video này.
```json
{
  "source_url": "https://douyin.com/video/taobao_hack",
  "platform": "douyin",
  "niche": "mẹo vặt",
  "metadata": {
    "title": "淘宝内部隐藏优惠券怎么拿",
    "description": "Cách lấy mã giảm giá nội bộ 50% trên Taobao.",
    "transcript": "Các bạn mua hàng Taobao đừng ấn thanh toán vội. Bấm vào góc phải, copy link này, dán qua app X sẽ thấy mã giảm 50 tệ.",
    "tags": ["taobao", "coupon", "savingmoney"]
  },
  "engagement": {
    "views": 800000,
    "likes": 50000,
    "shares": 12000
  }
}
```

**8. Máy làm mì tươi tự động công nghiệp công suất lớn (Quá đắt/Ngách quá hẹp)**
*   **Expected Verdict**: `SKIP`
*   **Lý do**: Sản phẩm có giá trị quá lớn (hàng chục triệu đồng), tệp khách hàng là doanh nghiệp (B2B), không phù hợp để gắn link affiliate bán lẻ trên TikTok.
```json
{
  "source_url": "https://tiktok.com/@machinery/video/pastamaker",
  "platform": "tiktok",
  "niche": "thiết bị bếp công nghiệp",
  "metadata": {
    "title": "Industrial Pasta Machine 500kg/h",
    "description": "Dây chuyền sản xuất mì tươi công nghiệp hoàn toàn tự động.",
    "transcript": "Đổ 500kg bột vào đây, máy sẽ tự động trộn nước, nhào nặn và đùn ra hàng ngàn vắt mì mỗi giờ.",
    "tags": ["industrial", "pastamachine", "factory"]
  },
  "engagement": {
    "views": 450000,
    "likes": 15000,
    "shares": 1000
  }
}
```

**9. Phân tích thành phần hóa học của Retinol (Hàn lâm/Không có sản phẩm)**
*   **Expected Verdict**: `SKIP`
*   **Lý do**: Video dạng nói chay (talking head) giáo sư giảng bài. Quá khô khan, không show sản phẩm cụ thể để kích thích mua hàng. Thiếu tính giải trí của short-video.
```json
{
  "source_url": "https://youtube.com/shorts/retinol_science",
  "platform": "youtube",
  "niche": "chăm sóc da",
  "metadata": {
    "title": "The Science of Retinoids at Molecular Level",
    "description": "Cơ chế hoạt động của Retinol trên tế bào sừng.",
    "transcript": "Khi Retinol thâm nhập vào lớp biểu bì, nó sẽ liên kết với các thụ thể RAR và RXR, từ đó kích hoạt quá trình phiên mã gene...",
    "tags": ["dermatology", "science", "skincare"]
  },
  "engagement": {
    "views": 120000,
    "likes": 4000,
    "shares": 150
  }
}
```

**10. Review món bún ốc cay đặc sản Liễu Châu (Khó mua/Ship tại VN)**
*   **Expected Verdict**: `SKIP`
*   **Lý do**: Mặt hàng đồ ăn đặc sản nội địa Trung Quốc rất khó tìm được link affiliate tương đương hoặc chất lượng đảm bảo trên sàn VN. Vấn đề vệ sinh an toàn thực phẩm cũng là một rủi ro (risks) khi làm affiliate.
```json
{
  "source_url": "https://douyin.com/video/luosifen_review",
  "platform": "douyin",
  "niche": "review ẩm thực",
  "metadata": {
    "title": "地道柳州螺蛳粉，太臭太香了！",
    "description": "Thử thách ăn bún ốc Liễu Châu mùi cực nồng.",
    "transcript": "Mùi của nó thoang thoảng như mùi rác, nhưng ăn vào thì... wow, măng chua quá đỉnh, nước dùng cay xé lưỡi.",
    "tags": ["foodreview", "luosifen", "spicy"]
  },
  "engagement": {
    "views": 2100000,
    "likes": 180000,
    "shares": 22000
  }
}
```
