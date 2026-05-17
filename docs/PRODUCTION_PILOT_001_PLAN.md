# PRODUCTION PILOT 001
## AI-Assisted Production cho 3 Video Đầu Tiên

> **Loại tài liệu**: Kế hoạch sản xuất pilot — Thực chiến, không sáo rỗng.
> **Mục tiêu**: Tạo ra 3 video Việt hóa từ batch VOE đầu tiên để đăng thử nghiệm thị trường, tối đa hóa việc AI/tool làm, giảm thao tác tay xuống mức thấp nhất có thể.
> **Nguyên tắc**: KHÔNG build code module lớn. KHÔNG auto-post. Dùng công cụ SaaS có sẵn.

---

## 1. Chiến lược sản xuất cho từng video

### Video A: yt_004 — Top 3 Small Chinese Kitchen Gadgets
| Thuộc tính | Chi tiết |
|---|---|
| **Nguồn** | @v3facts-0.7, 398K views |
| **Format gốc** | Listicle "Top 3", có voice Hindi + text Hindi, quay demo sản phẩm |
| **Chiến lược Việt hóa** | ✂️ **Cắt bỏ toàn bộ audio gốc + text gốc** → Thay voice Việt hoàn toàn + text overlay Việt mới |
| **Mức can thiệp** | **CAO** — Cần strip audio, lồng voice mới, thêm text overlay, thêm nhạc nền |
| **Lý do** | Voice Hindi không dùng được, nội dung visual đủ mạnh để đứng độc lập với voice Việt mới |

### Video B: yt_002 — ASMR Amazon Kitchen Tool
| Thuộc tính | Chi tiết |
|---|---|
| **Nguồn** | @KortneyandKarlee, 22M views |
| **Format gốc** | ASMR aesthetic, ít nói, nhạc nền nhẹ, focus vào visual sản phẩm |
| **Chiến lược Việt hóa** | 🎵 **Giữ nguyên video gốc** → Chỉ chèn text overlay tiếng Việt + thêm caption/subtitle Việt |
| **Mức can thiệp** | **THẤP** — Không cần thay voice (ASMR không cần dịch), chỉ thêm text |
| **Lý do** | Phong cách ASMR vốn không phụ thuộc ngôn ngữ. Thêm text Việt mềm + CTA là đủ |

### Video C: yt_003 — Testing Kitchen Gadgets: Cup Slicer
| Thuộc tính | Chi tiết |
|---|---|
| **Nguồn** | @buzzfeedtasty, 900K views |
| **Format gốc** | Test/review ngắn, có voice tiếng Anh, demo cắt lát |
| **Chiến lược Việt hóa** | 🎤 **Thay voice Việt hoàn toàn** → Lồng giọng AI tiếng Việt vui nhộn, giữ video gốc |
| **Mức can thiệp** | **TRUNG BÌNH** — Strip audio gốc, lồng voice Việt mới, thêm text overlay |
| **Lý do** | Format "Xịn hay Xạo" cần voice tiếng Việt để tạo kịch tính và kết nối cảm xúc |

---

## 2. Stack Công cụ AI/Edit cho Pilot

### Bảng phân công vai trò từng công cụ

| Bước | Công cụ | Vai trò cụ thể | Chi phí ước tính |
|---|---|---|---|
| **Viết script Việt** | **Claude API** (đã có) | Nhận Edit Brief → sinh script voice + text overlay hoàn chỉnh | $0 (đã có API key) |
| **Tạo voice AI tiếng Việt** | **ElevenLabs** | Từ script → sinh file audio `.mp3` giọng Việt tự nhiên | ~$5/tháng (Starter) hoặc Free tier |
| **Chèn subtitle + text overlay** | **CapCut** (miễn phí) | Auto-caption tiếng Việt + tuỳ chỉnh font/màu/animation | $0 |
| **Cắt ghép + render cuối** | **CapCut** (miễn phí) | Strip audio gốc, ghép voice mới, thêm nhạc, xuất file | $0 |
| **Tải video gốc** | **yt-dlp** (CLI miễn phí) | Download video YouTube không watermark | $0 |
| **Duyệt chất lượng** | **Con người** | Xem video final, kiểm tra sync, chỉnh nhỏ nếu cần | 5-10 phút/video |

### Tại sao CHƯA dùng HeyGen/Rask.ai cho pilot này?
- HeyGen mạnh nhất khi cần **lip-sync avatar** — 3 video pilot này không có talking head nên không cần.
- Rask.ai phù hợp cho **localize video dài** — video short 20-45s dùng CapCut + ElevenLabs nhanh hơn và rẻ hơn nhiều.
- Chi phí HeyGen Creator ($29/tháng) không đáng cho pilot 3 video. Để dành cho lúc scale.

---

## 3. Workflow sản xuất từng video

### Workflow chung (áp dụng cho Video A và C — cần voice Việt)

```
┌─────────────────────────────────────────────────────────────┐
│ BƯỚC 1: CHUẨN BỊ                                           │
│ Input:  Edit Brief từ MANUAL_EDIT_BRIEFS_BATCH_001.md       │
│ Tool:   yt-dlp                                              │
│ Action: Download video gốc (không watermark)                │
│ Output: File .mp4 gốc                                       │
│ Người:  Chạy 1 lệnh terminal (~1 phút)                     │
├─────────────────────────────────────────────────────────────┤
│ BƯỚC 2: SINH SCRIPT TIẾNG VIỆT                             │
│ Input:  Edit Brief (hook, voice style, CTA, góc localize)  │
│ Tool:   Claude API / Chat                                   │
│ Action: Prompt Claude viết script voice hoàn chỉnh          │
│ Output: Script text (~100-150 từ) + danh sách text overlay  │
│ Người:  Copy-paste prompt, đọc duyệt script (~3 phút)      │
├─────────────────────────────────────────────────────────────┤
│ BƯỚC 3: TẠO VOICE AI TIẾNG VIỆT                            │
│ Input:  Script text đã duyệt                                │
│ Tool:   ElevenLabs (Vietnamese voice)                       │
│ Action: Paste script → chọn giọng → Generate → Download    │
│ Output: File .mp3 voice tiếng Việt                          │
│ Người:  Paste + click + nghe thử + download (~3 phút)       │
├─────────────────────────────────────────────────────────────┤
│ BƯỚC 4: CẮT GHÉP + RENDER                                  │
│ Input:  Video gốc .mp4 + Voice .mp3 + Script text overlay   │
│ Tool:   CapCut Desktop (miễn phí)                           │
│ Action:                                                      │
│   4a. Import video gốc, mute audio gốc                      │
│   4b. Import voice .mp3, căn timeline                       │
│   4c. Thêm text overlay theo script (hook, giá, CTA)        │
│   4d. Thêm nhạc nền trending (thư viện CapCut)              │
│   4e. Export 1080x1920 (9:16)                               │
│ Output: File .mp4 final Việt hóa                            │
│ Người:  Thao tác CapCut (~10-15 phút)                       │
├─────────────────────────────────────────────────────────────┤
│ BƯỚC 5: REVIEW + ĐĂNG                                      │
│ Input:  Video .mp4 final                                    │
│ Tool:   TikTok / Facebook Reels (đăng tay)                  │
│ Action: Xem lại, viết caption, gắn link affiliate, đăng    │
│ Output: Bài đăng live trên kênh test                        │
│ Người:  Review + đăng (~5 phút)                             │
└─────────────────────────────────────────────────────────────┘
```

### Workflow Video B (ASMR — chỉ cần text, không cần voice)

```
Bước 1: Download video gốc (yt-dlp) .............. 1 phút
Bước 2: Claude sinh danh sách text overlay Việt ... 2 phút
Bước 3: [BỎ QUA - không cần voice]
Bước 4: CapCut: giữ audio gốc, thêm text overlay + 
         subtitle Việt (dùng Auto Caption) ........ 8 phút
Bước 5: Review + đăng ............................. 5 phút
```

---

## 4. Ước lượng công sức

### Thời gian thao tác tay cho từng video

| Video | Bước 1 | Bước 2 | Bước 3 | Bước 4 | Bước 5 | **Tổng** |
|---|---|---|---|---|---|---|
| **A** (Kitchen Gadgets - voice mới) | 1 phút | 3 phút | 3 phút | 15 phút | 5 phút | **~27 phút** |
| **B** (ASMR - chỉ text) | 1 phút | 2 phút | — | 8 phút | 5 phút | **~16 phút** |
| **C** (Cup Slicer - voice mới) | 1 phút | 3 phút | 3 phút | 12 phút | 5 phút | **~24 phút** |
| | | | | | **TỔNG 3 VIDEO** | **~67 phút** |

**Kết luận**: Khoảng **1 giờ 10 phút** thao tác tay để có 3 video pilot sẵn sàng đăng. Phần lớn thời gian là ở CapCut (bước 4).

### So sánh nếu edit thủ công truyền thống (không có AI hỗ trợ)
- Tự nghĩ script: +15 phút/video
- Tự thu âm voice hoặc tìm người đọc: +20 phút/video
- Tổng: ~150-180 phút cho 3 video

**AI-assisted tiết kiệm được ~50-60% thời gian so với thủ công.**

---

## 5. So sánh 3 lựa chọn

| Tiêu chí | Manual Edit truyền thống | AI-Assisted Pilot (đề xuất) | Build ContentFactory v0 |
|---|---|---|---|
| **Thời gian có video** | 3 giờ | **~1 giờ 10 phút** | 1-2 tuần code + debug |
| **Chi phí tool** | $0 | ~$0-5 | $0 (nhưng tốn dev time) |
| **Chất lượng kiểm soát** | Cao | Cao (human review) | Trung bình (cần test) |
| **Học được gì** | Quy trình thủ công | Quy trình + stack tool tối ưu | Kiến trúc code |
| **Scale sau này** | Khó | Dễ chuyển sang semi-auto | Dễ nhất (nếu format đúng) |
| **Rủi ro** | Thấp | Thấp | **Cao** (build trước khi validate) |
| **Phù hợp lúc này** | ⚠️ Được nhưng chậm | ✅ **Tối ưu nhất** | ❌ Quá sớm |

---

## 6. Decision Recommendation

### Tôi nên sản xuất 3 video này theo workflow nào?
> **AI-Assisted Production Pilot** — Dùng Claude viết script + ElevenLabs tạo voice + CapCut ghép. Tổng ~67 phút thao tác tay cho cả 3 video. Đây là con đường nhanh nhất để có video thật ra thị trường mà không cần code thêm bất kỳ dòng nào.

### Tool nào nên dùng trước?
1. **yt-dlp** — Download video gốc (cài 1 lần, dùng mãi)
2. **Claude** — Viết script Việt (đã có API)
3. **ElevenLabs Free/Starter** — Tạo voice tiếng Việt (đăng ký mất 2 phút)
4. **CapCut Desktop** — Ghép + render + text overlay (miễn phí, cài 1 lần)

### Tool nào CHƯA CẦN?
- ❌ HeyGen — Chưa cần lip-sync avatar
- ❌ Rask.ai — Chưa cần localize dài
- ❌ Runway — Chưa cần AI video generation
- ❌ Premiere Pro / DaVinci — CapCut đủ cho short-form
- ❌ ContentFactory code — Chưa validate format thắng

---

## 7. Checklist trước khi bắt đầu sản xuất

- [ ] Cài **yt-dlp** trên máy (`pip install yt-dlp` hoặc tải binary)
- [ ] Đăng ký **ElevenLabs** (Free tier hoặc Starter $5)
- [ ] Cài **CapCut Desktop** (miễn phí từ capcut.com)
- [ ] Tạo **kênh TikTok test** hoặc **Facebook Page test** (nếu chưa có)
- [ ] Chuẩn bị **link affiliate Shopee/TikTok Shop** cho 3 ngách sản phẩm tương ứng
- [ ] Mở `docs/MANUAL_EDIT_BRIEFS_BATCH_001.md` để tham chiếu khi viết script
- [ ] Mở `docs/VOE_LIVE_TEST_TRACKER_TEMPLATE.md` để ghi kết quả sau 48-72h

---

## 8. Mốc quyết định sau Pilot

| Signal | Quyết định |
|---|---|
| Ít nhất 1/3 video có view trên trung bình kênh + có affiliate click | → **GO**: Bắt đầu thiết kế ContentFactory v0 (Script + Voice generator) |
| View ổn nhưng chưa có click | → **TUNE**: Thử lại với CTA/hook khác, chưa build code |
| Cả 3 video đều flop | → **STOP**: Xem lại format, niche, hoặc cách localize trước khi code thêm bất cứ gì |
