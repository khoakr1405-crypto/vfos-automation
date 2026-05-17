# Production Execution Pack — Batch 001

> **Loại tài liệu**: Gói thực thi sản xuất (Execution Pack). Đây KHÔNG phải kế hoạch. Đây là checklist thao tác cụ thể để tạo ra 3 video Việt hóa đầu tiên.
> **Lưu ý quan trọng**: Script voice được viết dựa trên nội dung quan sát qua video gốc và Edit Brief. Trước khi thu voice, bạn BẮT BUỘC phải xem lại video gốc và điều chỉnh script cho khớp timing từng cảnh.

---

# VIDEO A: yt_004 — Top 3 Small Chinese Kitchen Gadgets

**Link gốc**: https://www.youtube.com/shorts/cwTIFh1TbhE
**Kiểu xử lý**: Thay voice hoàn toàn + text overlay Việt
**Thời lượng mục tiêu**: 30-40 giây

---

## A1. Download video gốc

```bash
yt-dlp -f "bestvideo[height<=1080]+bestaudio" --merge-output-format mp4 -o "yt_004_raw.mp4" "https://www.youtube.com/shorts/cwTIFh1TbhE"
```

- [ ] Chạy lệnh trên
- [ ] Xác nhận file `yt_004_raw.mp4` tồn tại và phát được
- [ ] Xem video từ đầu đến cuối, ghi chú thời gian xuất hiện từng sản phẩm

---

## A2. Voice Script tiếng Việt (FINAL)

**Paste đoạn sau vào ElevenLabs:**

> 3 đồ bếp Trung Quốc dưới 100 nghìn mà nhà nào cũng nên có!
>
> Số 1. Cây lau sàn xoay 360 độ. Vắt tự động, không cần cúi xuống vắt tay. Sàn nhà sạch bong trong 5 phút.
>
> Số 2. Dụng cụ tách lòng đỏ trứng. Chỉ cần bóp nhẹ là hút gọn lòng đỏ ra. Làm bánh siêu tiện.
>
> Số 3. Miếng chặn cửa chống kẹt tay. Dán một phát là xong, con nhỏ chạy chơi không sợ kẹp ngón nữa.
>
> Cả 3 món đều có trên Shopee, link ở bio nha. Rẻ lắm!

**⚠️ QUAN TRỌNG**: Sau khi xem video gốc, thay tên sản phẩm chính xác nếu khác. Script trên dựa trên quan sát metadata, có thể sai chi tiết.

---

## A3. Cài đặt ElevenLabs cho Video A

- [ ] Vào [elevenlabs.io](https://elevenlabs.io)
- [ ] Chọn mục **Text to Speech**
- [ ] Chọn ngôn ngữ: **Vietnamese**
- [ ] Chọn giọng: Giọng nam, năng lượng cao (thử "Daniel" hoặc "Adam" với Vietnamese)
- [ ] Settings: Stability = 0.50 | Similarity = 0.75 | Style = 0.40
- [ ] Paste script ở mục A2
- [ ] Bấm **Generate**
- [ ] Nghe thử — kiểm tra:
  - [ ] Phát âm tiếng Việt tự nhiên?
  - [ ] Tốc độ vừa phải (không quá nhanh, không quá chậm)?
  - [ ] Tone hào hứng nhưng không phô?
- [ ] Download file → lưu thành `yt_004_voice.mp3`

---

## A4. Text Overlay (copy chính xác vào CapCut)

| Thứ tự | Thời điểm | Nội dung text | Font/Style |
|---|---|---|---|
| 1 | 0:00 - 0:03 | `TOP 3 ĐỒ BẾP TRUNG QUỐC 🔥` | Bold, trắng, viền đen, cỡ lớn, căn giữa trên |
| 2 | 0:00 - 0:03 | `DƯỚI 100K` | Bold, vàng, cỡ vừa, ngay dưới text 1 |
| 3 | 0:04 - 0:11 | `#1` | Bold, trắng, góc trái trên |
| 4 | 0:12 - 0:19 | `#2` | Bold, trắng, góc trái trên |
| 5 | 0:20 - 0:27 | `#3` | Bold, trắng, góc trái trên |
| 6 | 0:28 - 0:32 | `LINK SHOPEE Ở BIO 👇` | Bold, vàng, nhấp nháy, căn giữa dưới |

---

## A5. Thao tác CapCut — từng bước

- [ ] Mở CapCut Desktop → New Project → tỷ lệ 9:16
- [ ] Import `yt_004_raw.mp4` vào timeline
- [ ] **Cắt bỏ intro gốc** (nếu có đoạn giới thiệu kênh ở đầu)
- [ ] Click chuột phải vào video track → **Mute / Detach Audio** → **Xoá audio track gốc**
- [ ] Import `yt_004_voice.mp3` → kéo vào audio track
- [ ] **Căn chỉnh timeline**: Đảm bảo voice khớp với cảnh video:
  - "Số 1" phải trùng lúc sản phẩm 1 xuất hiện
  - "Số 2" phải trùng lúc sản phẩm 2 xuất hiện
  - "Số 3" phải trùng lúc sản phẩm 3 xuất hiện
- [ ] Nếu video dài hơn voice: cắt bớt video. Nếu voice dài hơn: nhanh nhịp voice hoặc cắt đoạn nghỉ
- [ ] **Thêm text overlay**: Theo bảng A4, thêm từng text layer đúng thời điểm
- [ ] **Thêm nhạc nền**: Audio → Music → chọn nhạc trending nhịp nhanh → giảm volume xuống ~15-20% (để voice rõ)
- [ ] **Xoá watermark gốc nếu có**: Dùng crop hoặc blur vùng watermark
- [ ] Xem lại từ đầu đến cuối
- [ ] Export: 1080x1920 | 30fps | Chất lượng cao

**Output**: `yt_004_final.mp4`

---

# VIDEO B: yt_002 — ASMR Amazon Kitchen Tool

**Link gốc**: https://www.youtube.com/shorts/cX4mjGihNB4
**Kiểu xử lý**: GIỮ audio gốc + chỉ thêm text overlay/subtitle Việt
**Thời lượng mục tiêu**: Giữ nguyên thời lượng gốc

---

## B1. Download video gốc

```bash
yt-dlp -f "bestvideo[height<=1080]+bestaudio" --merge-output-format mp4 -o "yt_002_raw.mp4" "https://www.youtube.com/shorts/cX4mjGihNB4"
```

- [ ] Chạy lệnh trên
- [ ] Xác nhận file `yt_002_raw.mp4` tồn tại
- [ ] Xem video — ghi chú: có voice gốc nói gì không, hay chỉ có nhạc nền?

---

## B2. Voice Script

**KHÔNG CẦN TẠO VOICE MỚI** cho video này.
- Giữ nguyên audio gốc (nhạc nền ASMR + tiếng sản phẩm).
- Localize hoàn toàn bằng text overlay.

---

## B3. ElevenLabs

**BỎ QUA** — Video này không dùng ElevenLabs.

---

## B4. Text Overlay (copy chính xác vào CapCut)

| Thứ tự | Thời điểm | Nội dung text | Font/Style |
|---|---|---|---|
| 1 | 0:00 - 0:03 | `ĐỒ BẾP AESTHETIC ✨` | Nhẹ nhàng, serif, trắng, cỡ vừa, căn giữa trên |
| 2 | 0:04 - 0:08 | `Cốc đong thông minh` | Light, trắng, cỡ nhỏ, góc dưới trái |
| 3 | 0:09 - 0:14 | `Thiết kế trong suốt` | Light, trắng, cỡ nhỏ, góc dưới trái |
| 4 | 0:09 - 0:14 | `Vạch chia rõ ràng` | Light, trắng, cỡ nhỏ, ngay dưới text 3 |
| 5 | 0:15 - 0:19 | `TIỆN + ĐẸP 💕` | Nhẹ nhàng, hồng nhạt, cỡ vừa, căn giữa |
| 6 | 0:20 - cuối | `SHOPEE CÓ BÁN 👇` | Light, trắng, cỡ vừa, căn giữa dưới |

**Subtitle lines bổ sung** (hiển thị dạng caption nhỏ góc dưới):

| Thời điểm | Subtitle |
|---|---|
| 0:01 | Nhìn cái cốc đong này xem |
| 0:05 | Thiết kế trong suốt, tay cầm chắc tay |
| 0:10 | Đong bột, đong sữa, đong nước sốt gì cũng chuẩn |
| 0:15 | Quan trọng là nó xinh lắm |
| 0:19 | Để trên kệ bếp nhìn cứ thích |
| 0:22 | Link ở bio nha! |

---

## B5. Thao tác CapCut — từng bước

- [ ] Mở CapCut Desktop → New Project → tỷ lệ 9:16
- [ ] Import `yt_002_raw.mp4` vào timeline
- [ ] **GIỮ NGUYÊN audio gốc** — Không mute, không detach
- [ ] **Thêm text overlay**: Theo bảng B4, từng text layer đúng thời điểm
- [ ] **Thêm subtitle lines**: Dùng chức năng Text → Manual Captions, nhập từng dòng theo bảng subtitle
- [ ] Style subtitle: Font nhẹ nhàng, cỡ nhỏ, nền mờ đen 50%, góc dưới
- [ ] **Xoá watermark gốc nếu có**: Crop hoặc blur
- [ ] **KHÔNG thêm nhạc nền mới** — giữ tone ASMR gốc
- [ ] Xem lại từ đầu đến cuối
- [ ] Export: 1080x1920 | 30fps | Chất lượng cao

**Output**: `yt_002_final.mp4`

---

# VIDEO C: yt_003 — Testing Kitchen Gadgets: Cup Slicer

**Link gốc**: https://www.youtube.com/shorts/tlWcjfZLIPU
**Kiểu xử lý**: Thay voice Việt hoàn toàn + text overlay Việt
**Thời lượng mục tiêu**: 20-25 giây

---

## C1. Download video gốc

```bash
yt-dlp -f "bestvideo[height<=1080]+bestaudio" --merge-output-format mp4 -o "yt_003_raw.mp4" "https://www.youtube.com/shorts/tlWcjfZLIPU"
```

- [ ] Chạy lệnh trên
- [ ] Xác nhận file `yt_003_raw.mp4` tồn tại
- [ ] Xem video — ghi chú thời điểm bắt đầu cắt lát và kết quả

---

## C2. Voice Script tiếng Việt (FINAL)

**Paste đoạn sau vào ElevenLabs:**

> Cái cốc cắt lát này có 50 nghìn trên Shopee, quảng cáo cắt siêu nhanh. Thật hay lừa đây?
>
> Thử nè. Cho cà chua vào... ấn xuống...
>
> Ủa... nó cắt thật này! Đều lát luôn!
>
> Thử tiếp dưa chuột... Ôi xong luôn rồi!
>
> Ok công nhận cái này xịn thật sự. Chỉ 50 nghìn thôi, link ở bio!

**⚠️ QUAN TRỌNG**: Xem video gốc trước. Nếu video demo loại rau/trái khác, thay tên cho đúng.

---

## C3. Cài đặt ElevenLabs cho Video C

- [ ] Vào [elevenlabs.io](https://elevenlabs.io)
- [ ] Chọn **Text to Speech** → Ngôn ngữ **Vietnamese**
- [ ] Chọn giọng: Giọng nam hoặc nữ vui vẻ (thử "Lily" hoặc "Aria" cho tone tếu nhẹ)
- [ ] Settings: Stability = 0.35 | Similarity = 0.70 | Style = 0.60 (tăng Style để có cảm xúc hơn)
- [ ] Paste script ở mục C2
- [ ] Bấm **Generate**
- [ ] Nghe thử — kiểm tra:
  - [ ] Có nghe vui vẻ, hào hứng không?
  - [ ] Phần "Ủa... nó cắt thật này!" có ngạc nhiên tự nhiên?
  - [ ] Tốc độ vừa phải (hơi nhanh nhưng vẫn nghe rõ)?
- [ ] Download → lưu thành `yt_003_voice.mp3`

---

## C4. Text Overlay (copy chính xác vào CapCut)

| Thứ tự | Thời điểm | Nội dung text | Font/Style |
|---|---|---|---|
| 1 | 0:00 - 0:03 | `XỊN HAY XẠO? 🤔` | Bold, trắng, viền đen, cỡ lớn, căn giữa |
| 2 | 0:04 - 0:06 | `THỬ NGAY!` | Bold, vàng, cỡ vừa, căn giữa |
| 3 | 0:07 - 0:10 | `🍅 Cà chua` | Light, trắng, góc dưới trái |
| 4 | 0:11 - 0:14 | `ĐỀU LÁT LUÔN! 😱` | Bold, xanh lá, cỡ vừa, căn giữa |
| 5 | 0:15 - 0:18 | `🥒 Dưa chuột` | Light, trắng, góc dưới trái |
| 6 | 0:19 - cuối | `XỊN THẬT ✅ CHỈ 50K` | Bold, vàng, cỡ lớn, căn giữa |
| 7 | 0:19 - cuối | `LINK Ở BIO 👇` | Bold, trắng, cỡ vừa, căn giữa dưới |

---

## C5. Thao tác CapCut — từng bước

- [ ] Mở CapCut Desktop → New Project → tỷ lệ 9:16
- [ ] Import `yt_003_raw.mp4` vào timeline
- [ ] **Cắt bỏ intro/outro Tasty** (logo BuzzFeed nếu có ở đầu hoặc cuối)
- [ ] Click chuột phải vào video track → **Mute / Detach Audio** → **Xoá audio track gốc**
- [ ] Import `yt_003_voice.mp3` → kéo vào audio track
- [ ] **Căn chỉnh timeline**:
  - "Thử nè" phải trùng lúc bắt đầu cho rau vào cốc
  - "Ủa... nó cắt thật" phải trùng lúc thành phẩm hiện ra
- [ ] **Thêm text overlay**: Theo bảng C4
- [ ] **Thêm sound effect** (optional): Audio → Sound Effects → tìm "ding" hoặc "success" → chèn vào lúc cắt thành công
- [ ] **Thêm nhạc nền**: Chọn nhạc vui, nhịp nhanh → giảm volume ~15%
- [ ] **Xoá logo Tasty/BuzzFeed**: Crop hoặc blur vùng logo
- [ ] Xem lại từ đầu đến cuối
- [ ] Export: 1080x1920 | 30fps | Chất lượng cao

**Output**: `yt_003_final.mp4`

---

# CHECKLIST QA TRƯỚC KHI ĐĂNG (Áp dụng cho cả 3 video)

## Kiểm tra kỹ thuật
- [ ] Video xuất đúng tỷ lệ 9:16 (1080x1920)?
- [ ] Thời lượng dưới 60 giây?
- [ ] Không bị pixelated hoặc mờ?
- [ ] Âm thanh voice rõ ràng, không bị rè?
- [ ] Nhạc nền không lấn át voice?

## Kiểm tra nội dung
- [ ] Không còn text tiếng nước ngoài nào trên video?
- [ ] Không còn watermark/logo kênh gốc?
- [ ] Voice tiếng Việt nghe tự nhiên, không bị robot quá?
- [ ] Text overlay không bị che mất phần quan trọng của video?
- [ ] Hook 3 giây đầu đủ thu hút (tự hỏi: nếu đang lướt TikTok, mình có dừng lại xem không)?

## Kiểm tra affiliate
- [ ] Đã chuẩn bị link affiliate Shopee/TikTok Shop cho sản phẩm tương ứng?
- [ ] Link affiliate đã test — bấm vào đúng trang sản phẩm?
- [ ] Bio kênh đã cập nhật link?
- [ ] CTA cuối video có nhắc "link ở bio"?

## Kiểm tra trước khi bấm Đăng
- [ ] Caption bài đăng đã viết (kèm hashtag)?
- [ ] Đã chọn cover/thumbnail hấp dẫn?
- [ ] Đã chọn đúng kênh test để đăng?
- [ ] Đã ghi thông tin vào `VOE_LIVE_TEST_TRACKER_TEMPLATE.md`?

---

# SAU KHI ĐĂNG

- [ ] Ghi ngày giờ đăng vào Tracker
- [ ] Đặt nhắc nhở kiểm tra sau **24 giờ**: ghi Views
- [ ] Đặt nhắc nhở kiểm tra sau **72 giờ**: ghi Views + Watch Time + Affiliate Clicks
- [ ] Điền cột "Kết luận / Bài học" cho từng video
- [ ] Nếu có video đạt tín hiệu tích cực → kích hoạt `VFOS_REVENUE_EXPERIMENT_STRATEGIST_SKILL` để đánh giá GO/NO-GO cho ContentFactory v0
