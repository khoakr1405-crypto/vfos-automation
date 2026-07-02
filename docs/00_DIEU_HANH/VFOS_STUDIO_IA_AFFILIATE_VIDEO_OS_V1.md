# VFOS STUDIO IA — AFFILIATE VIDEO OPERATING SYSTEM V1

> **Loại doc**: Kiến trúc thông tin (IA) chính thức của VFOS Studio.
> **Trạng thái**: Operator chốt reframe 2026-07-02 — **Phase 0 (ghi nhận quyết định), CHƯA code UI**.
> **Nguồn gốc**: GitHub UI Benchmark (28 repo, star verified) → Concept C (Hybrid Command Center + Video Factory) → reframe theo định nghĩa mới của Operator.
> **Quan hệ doc cũ**: Doc này **KẾ THỪA và MỞ RỘNG** `VFOS_UI_ARCHITECTURE_V1.md` (2026-06-12). Nó **SUPERSEDE riêng phần scope của Tổng quan** (xem §7 Mâu thuẫn), giữ nguyên mọi luật an toàn còn lại. Vẫn dưới `VFOS_NORTH_STAR.md` và `VFOS_SIDEBAR_GUARDIAN_STANDARD.md`.

---

## 1. Định nghĩa VFOS (chốt mới 2026-07-02)

**VFOS = Affiliate Video Operating System** — hệ thống *vận hành sản xuất video affiliate*, không phải admin dashboard chung, không phải nền tảng AI automation chung.

Hướng UI chính thức: **Concept C — Hybrid Command Center + Video Factory**.
Hai bề mặt cấp cao nhất, ranh giới cứng:

```
VFOS Studio = Affiliate Video Operating System
│
├── ① DASHBOARD (Trung tâm điều hành) ── READ-ONLY · report ≠ make
│     Trung tâm quản lý · kiểm soát · thống kê · báo cáo kết quả ·
│     affiliate performance · doanh số · lợi nhuận · việc Operator cần làm
│     → Surface DUY NHẤT được có KPI doanh thu/affiliate/hiệu suất (real-only)
│     → KHÔNG nút produce/render/package/publish; chỉ LINK vào Lane để hành động
│
└── ② LANE NỘI DUNG (Xưởng sản xuất) ── MAKE · đa nội dung/đa kênh/đa nền tảng
      Chỉ phục vụ: tạo video · xử lý nguồn · production · preview · đóng gói ·
      đăng/hướng dẫn đăng đa nền tảng · workflow theo lane/kênh/ngách
      → Surface DUY NHẤT được có action sản xuất + publish (gated per-job, no-auto)
      → KHÔNG dashboard/KPI/rollup/báo cáo panel
```

**Nguyên tắc bất biến:** Dashboard *báo cáo & định hướng*; Lane *sản xuất & đăng*.
- Revenue/affiliate reporting **thuộc Dashboard**.
- Produce/render/package/publish **thuộc Lane**.
- Ranh giới cưỡng chế bằng luật Grafana (nav L1–L3; bước sản xuất L4+ nằm inline trong lane, không lên nav) + n8n save-vs-publish (READY ≠ auto-publish).

---

## 2. Vì sao Dashboard được mở rộng (hoà giải "no BI on Overview")

Benchmark cũ khuyến nghị "không đưa BI/chart lên Overview" — lệnh đó nhắm vào **BI phù phiếm** trên một workflow console.

Với **Affiliate Video OS**, doanh số/affiliate **chính là kết quả vận hành** (stage *performance learning* của North Star: M3 click → M4 đơn → M5 doanh thu → M6 scale). Nó **quyết định sản xuất video/sản phẩm gì tiếp theo**, nên thuộc về Dashboard như **operational performance intelligence**, không phải trang trí.

**Guardrail giữ ranh giới (không được nới):**
- Reporting trên Dashboard **READ-ONLY, không sinh action** — không chart nào bấm ra render/publish.
- **KHÔNG mock doanh thu/lợi nhuận.** Chưa có data thật thì **ẩn/empty-state ("chưa có số liệu thật")**, tuyệt đối không bịa số (No-Go #6).
- **KHÔNG đưa chart tiền lên Dashboard nếu chưa có data thật** (xem Phase 4 trước Phase 5).
- **KHÔNG nhét báo cáo/KPI vào Lane.** **KHÔNG nhét nút sản xuất vào Dashboard.**

---

## 3. DASHBOARD — 7 nhánh (tab bên trong Dashboard, KHÔNG phải 7 mục sidebar)

| # | Nhánh | Trả lời câu hỏi vận hành | Hiển thị (real-only) |
|---|---|---|---|
| 1 | **Kiểm soát & Sức khỏe hệ thống** | "Hệ thống chạy đúng không trước khi tin số?" | Trạng thái connector thật (FB token cấu hình? live-publish flag on/off? TikTok token khớp registry?), job đang chạy/queue, kênh active; severity band CRITICAL/WARNING/INFO |
| 2 | **Việc Operator cần làm** *(To-Do)* | "Ngay bây giờ Operator cần làm gì?" | Danh sách ưu tiên job BLOCKED / FAILED / MISSING / READY-chờ-duyệt / chờ-publish + blocker verbatim + nút mở gate-check drawer read-only + **đếm số** |
| 3 | **Hiệu suất Video/Kênh/Nền tảng** | "Ngách/kênh/nền tảng nào kéo view?" | Bảng per-kênh (TikTok account, FB Page): #video, view, view-rate, affiliate click, xếp hạng; toggle FB/TikTok/All; delta tuần/tháng |
| 4 | **Hiệu suất Affiliate** | "View → click → đơn ra sao?" | Funnel view→click→đơn theo product/video/kênh; attribution **job-bound**; CTA-by-role |
| 5 | **Doanh thu & Lợi nhuận** | "Kiếm được bao nhiêu, lời bao nhiêu?" | Doanh thu affiliate (chuẩn hoá MoM), chi phí sản xuất, lợi nhuận ròng; global date-range; MoM/YoY; break-down Shopee / TikTok Shop |
| 6 | **Sản phẩm tạo ra doanh thu** | "Reup/làm video sản phẩm nào tiếp?" | Bảng top-N sản phẩm sort revenue desc (toggle sort theo biên lợi nhuận): reach/clicks/sales/revenue/profit/ROI; deep-link về Shopee record |
| 7 | **Báo cáo Chiến dịch/Nội dung** | "Batch/đợt nào làm ra tiền?" | Campaign rows theo lane/niche/đợt, column-set switcher Traffic↔Revenue; annotation mốc publish trên chart doanh thu |

**Bố cục:** top-line nhánh 2,4,5,6 (To-Do + doanh thu/affiliate/sản phẩm) lên **home `/`**; drill sâu multi-tab (3–7) ở **`/analytics`** (Overview = điểm vào tín hiệu → route xuống tab báo cáo sâu). Mỗi widget load độc lập, error boundary per-panel (một nguồn chậm/hỏng không làm đơ cả Dashboard).

---

## 4. LANE NỘI DUNG — 7 bước sản xuất (inline stepper, đa nội dung/đa kênh/đa nền tảng)

| # | Bước | Vai trò | No-Go liên quan |
|---|---|---|---|
| 1 | **Chọn Ngách/Kênh** | Bind cứng channelId/accountId ngay từ lúc tạo job (Niche→Channel→Job) | #7 (không floating), G4/G7 (chống đăng nhầm account) |
| 2 | **Tải/Chọn nguồn + Clean** | Tạo job + tải source no-watermark + metadata + clean (delogo, scrub sub Trung) | #6 (không dùng demo source approve/publish) |
| 3 | **Sản xuất** | analyze → montage → script/transcreation → voice → BGM → render, chạy ngầm như 1 process; cổng kỹ thuật tự-report PASS/FAIL/MISSING | #8 (cổng kỹ thuật tự PASS/FAIL, KHÔNG nút duyệt tay giữa chừng) |
| 4 | **Xem trước & Duyệt** | CỔNG DUY NHẤT cho Operator; video chỉ hiện khi render xong hẳn; QA là bước con, không tách action riêng | #3, #8 (Operator duyệt kết quả cuối) |
| 5 | **Đóng gói** | Xuất final mp4 + caption + hashtag + affiliate link; đối chiếu Product Binding | #1 (Product Binding Gate) |
| 6 | **Đăng/Hướng dẫn đăng đa nền tảng** | FB gate cứng server-side; TikTok đóng gói + hướng dẫn đăng tay (roadmap API auto); per-platform caption/preview variant | #3 (no-auto-publish, chỉ chạy khi Operator bấm) |
| 7 | **Vòng lặp nhiều video** | Job xong → "Bắt đầu video mới"; job cũ nằm lại lịch sử (không xoá); reset per-job state | #7 (state per-job, không floating giữa các video) |

Multi-content/multi-channel/multi-platform = **bước 1 (chọn kênh) + bước 6 (đăng đa nền tảng)** — đều **trong Lane**, không phải Dashboard.

---

## 5. Mapping route hiện tại → IA mới

Nav hiện tại (đọc `apps/studio/src/lib/nav.ts`): 7 mục / 4 nhóm. Mapping:

| Route hiện tại | Vai trò cũ | → IA mới |
|---|---|---|
| `/` | Overview readiness-only | **① DASHBOARD home** — mở rộng: To-Do + top-line KPI doanh thu/affiliate/sản phẩm (**real-only**) + link drill `/analytics` |
| `/analytics` | Hiệu suất (mock + real sau banner) | **① DASHBOARD deep-report** — "Hiệu suất & Báo cáo", multi-tab (nhánh 3–7). **Quarantine fixture** |
| `/comments` | Bình luận & Mắt thần | Nhánh audience/engagement (giữ nhóm KẾT QUẢ, hoặc feed nhánh 3) |
| `/history` | Lịch sử & Evidence | KẾT QUẢ — evidence log read-only (giữ) |
| `/channels` | Ngách & Kênh | **CẤU TRÚC** — config Niche→Channel→Account (nguồn breakdown kênh/nền tảng) |
| `/lanes/product-review` | Lane review | **② LANE** — giữ nguyên (xưởng) |
| `/lanes/content` | Lane giải trí | **② LANE** — giữ nguyên |
| `/lanes/fishing-vlog`, `/lanes/car-vlog` | stub inactive | **② LANE tương lai** — kích hoạt theo niche (multi-content) |
| `/products` `/create` `/raw-visual` `/script` `/render` `/qa` | technical, không nav | **Giữ ẩn** — bước L4+ chạy trong lane, KHÔNG lên nav (luật Grafana; đúng vfos-command-center-skill) |
| `/publish` `/schedule` | mock, đã gỡ | Publish = **action trong Lane**; calendar/lịch = **Dashboard view read-only** (nếu làm), fire vẫn ở Lane |

**Sidebar đề xuất (nhóm) — gọn, KHÔNG nhét 7 nhánh Dashboard thành 7 mục:**
- **DASHBOARD**: `Tổng quan /` · `Hiệu suất & Báo cáo /analytics`
- **LANE NỘI DUNG (Xưởng)**: `Review Sản phẩm` · `Nội dung/Giải trí` (+ lane theo niche sau)
- **CẤU TRÚC**: `Ngách & Kênh /channels`
- **KẾT QUẢ/TƯƠNG TÁC**: `Lịch sử & Evidence /history` · `Bình luận & Mắt thần /comments`

7 nhánh Dashboard = **tab bên trong** Dashboard/Analytics → nav sạch, giữ luật L1–L3.

---

## 6. Gap hiện tại (đọc code xác nhận, không đoán)

| # | Gap | Mức | Ghi chú |
|---|---|:---:|---|
| G1 | **Chưa có ingestion affiliate revenue/commission tự động** | 🔴 | Repo có: FB Insights fetch (view/click, real), TikTok Insights fetch (read-only), **manual revenue entry** (`ManualPerformanceSnapshot.revenue` VND). KHÔNG có connector kéo click/đơn/hoa-hồng từ Shopee/TikTok Shop → mọi chart Revenue/Affiliate sẽ rỗng hoặc buộc fake (vi phạm No-Go #6). **Prerequisite #1.** |
| G2 | **`/analytics` còn trộn mock + real** | 🔴 | GROWTH FIXTURE (`ctaRoleMetrics`, `performance-metrics.json`) trộn với data thật sau banner. Kéo lên Overview thì banner không đủ — phải gate `source='real'` + contextual suppression, tách/bỏ fixture |
| G3 | **Chưa có Operator To-Do hợp nhất** | 🟠 | 3 panel (`OperatorJobQueue` + 2 status panel) rời rạc, không có "X job chờ duyệt / Y blocked" + đếm số ở đầu màn |
| G4 | **Chưa có job-bound revenue attribution** | 🟠 | Job đã bind theo Product Card (`findJobForCard`/`productBinding`) nhưng doanh thu chưa quy về jobId; cần first-click model **cố định server-side** (No-Go #7), không toggle end-user |
| G5 | **TikTok data còn mỏng** | 🟡 | Publish TikTok mới `SELF_ONLY` (app chưa audit), Insights read-only → performance nền tảng TikTok thiếu; phải nhãn rõ trạng thái connector, không tạo KPI khập khiễng |
| G6 | **UI Architecture V1 từng gỡ KPI khỏi Overview** | 🟡 | `VFOS_UI_ARCHITECTURE_V1.md` §1-A1 + §2 chốt Overview = readiness-only, KPI đẩy sang `/analytics`. Reframe này **đảo phần scope đó** → **quyết định mới cần ghi rõ** (xem §7) |

---

## 7. Mâu thuẫn với doc cũ + cách ghi rõ quyết định mới

**Doc bị chạm:** `docs/00_DIEU_HANH/VFOS_UI_ARCHITECTURE_V1.md` (Operator duyệt 2026-06-12).

**Điểm MÂU THUẪN (phải ghi rõ là quyết định mới):**
- V1 §1-A1: "Tổng quan ~70% component mock (KPI, attention, cluster, weekly, pipeline, readiness) → phải gỡ."
- V1 §2 sitemap: "Tổng quan — CHỈ data thật: job queue, product queue, CTA"; performance (M3–M6) nằm ở màn **`/analytics` riêng** (Phase E).
- → Reframe V1-này **nâng top-line performance/revenue/affiliate/To-Do lên Dashboard `/`**. Đây là **thay đổi scope của Tổng quan** so với quyết định 2026-06-12.

**Điểm KHÔNG mâu thuẫn (kế thừa, củng cố — không đổi):**
- V1 §6 + Sidebar Guardian: **không mock lẫn data thật**, không floating state, publish = cổng duyệt tay, API tự chặn → reframe **củng cố** (real-only tiles, quarantine fixture, attribution job-bound).
- V1 §3 vòng lặp 9 bước + reset-to-ready per-job → giữ nguyên (thành bước 7 của Lane).
- V1 lý do hoãn KPI ("khi có số liệu thật") → **được tôn trọng**: Phase 4 (data thật) đứng TRƯỚC Phase 5 (chart tiền).

**Cách ghi rõ quyết định mới (đề xuất):**
1. Doc này (`VFOS_STUDIO_IA_AFFILIATE_VIDEO_OS_V1.md`) là **IA chính thức hiện hành**; nó **supersede riêng phần Overview-scope** của `VFOS_UI_ARCHITECTURE_V1.md`, giữ nguyên phần còn lại.
2. **Đề xuất (chờ Operator duyệt, CHƯA làm):** thêm 1 dòng con trỏ ở đầu `VFOS_UI_ARCHITECTURE_V1.md`:
   > *"§1-A1 & §2 (Tổng quan = readiness-only): scope này được cập nhật bởi `VFOS_STUDIO_IA_AFFILIATE_VIDEO_OS_V1.md` (2026-07-02) — Tổng quan mở rộng thành Dashboard báo cáo kết quả (real-only). Các luật an toàn khác giữ nguyên."*
3. Cập nhật `TRANG_THAI_VFOS_HIEN_TAI.md` (Phần trạng thái) khi Operator chốt Phase 0.

*(Doc này chưa tự sửa V1 hay file trạng thái — chỉ đề xuất; sẽ làm sau khi Operator duyệt.)*

---

## 8. Phase đề xuất tiếp theo

**Thứ tự lõi:** IA/nav TRƯỚC (rẻ, gỡ cấu trúc) → To-Do → dọn real-only → ingestion data → mới đến chart revenue. **Không dựng chart tiền trước khi có data thật.**

| Phase | Nội dung | Cần data mới? | Chặn bởi |
|---|---|:---:|---|
| **0** | **Chốt reframe (doc này)** + cập nhật con trỏ V1 + Step Inventory (No-Go #9) | Không | — |
| **1** | **Reframe IA/nav**: đổi nhóm/nhãn sidebar, nâng `/analytics` thành "Hiệu suất & Báo cáo" first-class (khung 5 tab). Không đụng data | Không | Phase 0 |
| **2** | **Operator To-Do surface**: gom 3 panel + gate-check drawer thành 1 to-do có đếm số + severity band trên `/`. Dùng data job đã có | Không | Phase 1 |
| **3** | **Real-only gating + quarantine fixture**: mọi tile Overview chỉ nhận `source='real'`, contextual suppression khi rỗng, tách/bỏ GROWTH FIXTURE (dọn No-Go #6) | Không | Phase 1 |
| **4** | **Ingestion affiliate revenue + job-bound attribution**: connector/nhập-tay-có-cấu-trúc theo product+jobId, first-click cố định server. **Task data lớn nhất — prerequisite nhánh 4,5,6** | Có | Phase 3 |
| **5** | **Bật nhánh Revenue/Affiliate/Product report + top-line lên Overview** | Có | **Phase 4** |

**Task mới chính đáng (theo logic vận hành, không phải cho đẹp):**
- ✅ Ingestion affiliate revenue + job-bound attribution (prerequisite, không phải chart trước)
- ✅ Operator To-Do hợp nhất có đếm số
- ✅ Real-only gating + quarantine fixture
- ❌ KHÔNG: widget-canvas drag-drop · multi-tenant switcher · Cmd+K · Ask-AI query · bulk-payout · content-calendar drag-drop (cám dỗ kéo VFOS về "AI automation chung chung" — anti-goal North Star). Chỉ lấy pattern IA/status, không import cơ chế BI.

---

## 9. Ràng buộc an toàn (áp dụng mọi phase)

- **Không mock doanh thu/lợi nhuận**; chưa có data thật → empty-state/suppression, không bịa số (No-Go #6).
- **Không chart tiền trên Dashboard trước khi có data thật** (Phase 4 trước Phase 5).
- **Không báo cáo/KPI trong Lane**; **không nút sản xuất trên Dashboard** (report ≠ make).
- Không floating state (latest/jobs[0]) làm source of truth (No-Go #7).
- Publish luôn là cổng duyệt thủ công, gate server-side; READY ≠ posted (No-Go #3).
- Không bypass Product Binding Gate (No-Go #1); cổng kỹ thuật tự-report PASS/FAIL/MISSING (No-Go #8).
- UI guard chưa đủ — API phải tự chặn (Sidebar Guardian §Luật 5).
- Gom/hợp nhất workflow phải có Step Inventory 6 cột trước khi báo DONE (No-Go #9).
- Không đụng `.env`/token/secret/runtime/media/logs; stage đích danh, cấm `git add .`/`-A`.

---

## 10. Trạng thái Phase 0

- ✅ Ghi nhận: VFOS = Affiliate Video Operating System; Concept C giữ-lõi, Dashboard mở-rộng.
- ✅ Định nghĩa IA 2 mặt + 7 nhánh Dashboard + 7 bước Lane.
- ✅ Mapping route + gap + phase + mâu thuẫn V1 ghi rõ.
- ⏳ **CHƯA code UI · chưa sửa nav · chưa sửa analytics · chưa thêm chart · chưa đụng pipeline/runtime/secret · chưa commit.**
- ⏭️ Bước tiếp theo duy nhất: Operator duyệt doc này → mở **Phase 1 (IA/nav)**.
