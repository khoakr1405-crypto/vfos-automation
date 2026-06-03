# BÁO CÁO ĐÁNH GIÁ TRƯỚC / SAU TINH GỌN BỘ MÁY VFOS

> Phạm vi: chuỗi cleanup B1 → C → C2 → D1 → D2 → D3 → Docs Rewrite.
> Mốc tham chiếu: trước cleanup = `ae58084` (streamlined A-Z workflow); sau cleanup = `b2b3f05` (operator guide).
> Ngày: 2026-06-01. Repo: branch `master`, đồng bộ origin (0/0), working tree CLEAN.

---

## 1. Tóm tắt điều hành

Bộ máy VFOS đã chuyển từ trạng thái "workflow A-Z chạy được nhưng lẫn rất nhiều command demo/legacy" sang "đường vận hành chuẩn 2 command, các nhánh cũ bị gỡ hoặc quarantine, có operator guide chính thức khóa flow".

- **npm scripts: 76 → 61** (gỡ ròng 15 alias operator-facing).
- **Đường publish: 2 → 1** (gỡ `publish:facebook` run-based, chỉ còn `job:publish-facebook` job-based).
- **Shopee fallback: lẫn flow chính → quarantine** sang namespace `debug:shopee:*`.
- **Dead/scratch/runtime: dọn sạch** (4 debug script + scratch untracked + 3 thư mục runtime `batch_001`).
- **Docs: có guide chính thức** `HUONG_DAN_VAN_HANH_CHINH_THUC_VFOS.md` + banner trỏ trong file state.

---

## 2. Trước cleanup (mốc `ae58084`)

- **76 npm scripts** ở root — command thật lẫn demo/legacy/debug.
- Để ra 1 video, ngoài 2 command A-Z còn tồn tại hàng loạt đường thay thế gây nhiễu:
  - **Pipeline cũ P3–P10**: `pipeline:demo`, `pipeline:p3-demo` … `p10-demo`, `step:demo`, `offline-product-select`, `offline-visual-metadata` — đường sản xuất cũ song song với `job:*`.
  - **2 đường Shopee song song**: CDP official (`commerce:intake` → `extract-links-cdp`) **và** flow cookie/storage_state (`shopee:login`/`shopee:fetch`/`shopee:fetch-cookie`/`shopee:fetch-products`/`shopee:select`).
  - **2 đường publish song song**: `publish:facebook --run <runId>` (run-based, được `vfos:daily` dashboard chủ động recommend 7 chỗ) **và** `job:publish-facebook --job <jobId>` (job-based).
  - **Duplicate extractor/packager**: `shopee:extractor` (demo) vs extractor thật trong `commerce:intake`; `operator:review-pack` vs `job:package`.
  - **Dead debug Shopee**: `analyze-har`, `inspect-long-links`, `inspect-product-item`, `probe-product-offer` (0-reference).
  - **Scratch untracked** lẫn trong `git status`: nhiều CDP extractor thử nghiệm + `production/batch_001` runtime (mp3/mp4/jpg/manifest).
- **Rủi ro trước cleanup**:
  - Chạy nhầm command cũ (pipeline demo, shopee fetch) → bypass flow A-Z.
  - Publish nhầm đường run-based cũ thay vì job-based có safety gate.
  - Lấy link qua flow cookie/storage_state thay vì CDP official → lệch owner/canonical.
  - Khả năng nhầm browser (flow cũ headless Chromium vs CDP Cốc Cốc-only).
  - Commit/runtime leak: manifest runtime `production/**` + `.mkv` chưa được ignore.
  - Onboarding agent/Operator mới khó: không biết đâu là đường chính.

---

## 3. Sau cleanup (mốc `b2b3f05`)

- **61 npm scripts**, đường vận hành chính rút về **2 command A-Z** + ~8 lệnh điều hành/safety.
- **Operator thực tế chỉ cần**: `commerce:intake` (+flags) · `job:run-review` · `job:status`/`job:dashboard`/`job:source-inbox` · `job:approve`/`job:reject` · `job:package`/`job:launch-check`/`job:publish-facebook` · `vfos:sync-check`/`vfos:daily`.
- **Legacy command đã xử lý**:
  - Pipeline P3–P10 + step/offline demos: **gỡ alias** (C).
  - `shopee:extractor`, `operator:review-pack`: **gỡ** (C).
  - `publish:facebook`: **migrate** mọi recommendation sang job-based rồi **gỡ alias** (C2).
  - Shopee cookie/storage_state: **quarantine** → `debug:shopee:*` (D1), giữ file làm fallback theo policy.
- **Dead/debug file**: xóa 4 Shopee HAR/probe 0-reference (B1).
- **Shopee fallback quarantine**: 5 root alias → `debug:shopee:*`; file giữ nguyên (banner 🚫 DEPRECATED + gate `.secrets` + Operator explicit).
- **Publish flow**: chỉ còn job-based; default `--dry-run`, live chỉ khi `--confirm-live-publish`; safety locks `uploaded/published/apiCalled=false`.
- **Runtime rác**: dọn scratch untracked (D2) + xóa 3 thư mục `production/batch_001` runtime (D3) + ignore `production/**/*.mkv`.
- **Operator Guide chính thức** (`b2b3f05`): khóa flow A-Z, ranh giới an toàn, danh sách internal/debug/legacy, lỗi thường gặp.
- **Repo**: CLEAN 🟢, đồng bộ origin 0/0, sync-guard Sensitive/Runtime PASS.

---

## 4. Bảng Before / After

| Hạng mục | Trước cleanup | Sau cleanup | Tác động |
|---|---|---|---|
| Số lệnh để tạo 1 video mới | 2 command thật **lẫn** nhiều đường cũ | **2 command A-Z** rõ ràng | Giảm nhầm lẫn |
| npm scripts (operator-facing) | **76** | **61** | −15 alias, gọn |
| Commerce Intake | Ổn định nhưng đứng cạnh flow cookie cũ | Đường Shopee **duy nhất** ở surface chính | Một nguồn sự thật |
| Review pipeline | Unified (job:*) + pipeline demo cũ song song | Chỉ `job:run-review` (bọc `chay:review`) | Một đường |
| Shopee browser flow | CDP Cốc Cốc + headless Chromium cũ | **Cốc Cốc-only CDP** ở surface chính | Nhất quán browser |
| Shopee fallback/cookie | Ngang hàng command chính (`shopee:*`) | **Quarantine `debug:shopee:*`** | Khó chạy nhầm |
| Product link validation | owner+canonical, nhưng có đường cũ né được | owner `an_17376660568`+sanitize, đường cũ đã hạ surface | Giữ chuẩn |
| Facebook publish flow | **2 đường** (run-based + job-based) | **1 đường job-based**, dry-run default | Hết publish nhầm |
| BGM/Voice/QA integration | Đã unified | Giữ nguyên (không đụng) | Ổn định |
| Runtime/untracked noise | Scratch + runtime batch lẫn git status | **Sạch** (CLEAN 🟢) | Dễ review diff |
| Docs/operator guide | Tản mác trong round-log | **Guide chính thức** + banner trỏ | Onboarding nhanh |
| Rủi ro chạy nhầm command | Cao | Thấp | ↓ đáng kể |
| Rủi ro publish nhầm | Trung-cao (2 đường) | Thấp (1 đường, gate) | ↓ |
| Rủi ro commit runtime/sensitive | Trung (manifest/.mkv leak) | Thấp (gitignore + guard PASS) | ↓ |
| Khả năng mở rộng batch | Khó (đường rối) | Tốt hơn (2 command lặp lại theo job) | Sẵn nền batch |

---

## 5. Timeline commit / mốc

| Commit / Round | Nội dung | Tác động |
|---|---|---|
| `074918d` | feat: unify VFOS job review pipeline | Nền pipeline A-Z |
| `a40d656` / `4ee800a` | BGM voice direction + BGM mix 0.40 từ artifact | Voice/BGM nhất quán |
| `b4ea2f6` / `2dc4a32` | wire official Shopee commerce intake + Cốc Cốc bootstrap | CDP official flow |
| `15c97b4` | auto-open Cốc Cốc trong commerce:intake | Bớt setup thủ công |
| `398f462` | recognize English Shopee affiliate catalog | English/Vietnamese UI detection |
| `0372ea7` | poll SPA hydration trong CDP preflight | Ổn định extraction |
| `9e14bd7` | sanitize Shopee canonical URL credentials | Bảo mật link |
| `0a58059` | preserve OpenAI script generation errors | Lỗi script rõ ràng |
| `ae58084` | **streamlined VFOS A-Z review workflow** | Mốc "trước cleanup" |
| `1ebad9f` (B1) | xóa dead VFOS debug scripts | −4 file dead |
| `768218d` (C) | gỡ duplicate/legacy commands | −14 alias |
| `7960804` (C2) | migrate legacy Facebook publish recommendations | Publish → job-based |
| `379c8ad` (D1) | quarantine legacy Shopee fallback → debug | Hạ surface fallback |
| `c1beb32` (D2) | clean up untracked scratch scripts | Sạch scratch |
| `b2b3f05` (Docs) | official VFOS operator guide | Khóa đường vận hành |
| (D3, no commit) | xóa 3 thư mục runtime `production/batch_001` | Sạch runtime |

---

## 6. Chấm điểm hiện trạng (1–10)

| Tiêu chí | Điểm | Lý do |
|---|---|---|
| Tính gọn gàng | **8.5** | 76→61 script, surface chính rút về 2 command; còn vài file impl giữ lại làm fallback. |
| Tính an toàn | **9** | Publish gate dry-run default, safety locks, owner/canonical, sync-guard PASS, không leak secret. |
| Tính dễ vận hành | **9** | Operator guide chính thức + 2 command + bảng lỗi thường gặp. |
| Tính khó chạy nhầm | **8** | Legacy đã gỡ/quarantine; còn `chay:review` và package-level `shopee:*` lộ ra nếu ai cố tìm. |
| Tính mở rộng batch | **6.5** | 2 command lặp theo job đã ổn, nhưng chưa có queue/batch manager thật. |
| Tính dễ bảo trì | **8** | Một đường publish, một đường intake, docs khóa; còn 1 file orphan self-help cần dọn. |
| Tính sẵn sàng publish thật | **8** | Job `job_20260601_002` đã `READY_FOR_OPERATOR_REVIEW`, Final QA PASS; mới cần approve→package→launch-check→dry-run→live. |

---

## 7. Những điểm còn tồn tại (không tô hồng)

1. **File orphan**: `scripts/facebook-publish-command-demo.ts` còn tồn tại (alias `publish:facebook` đã gỡ) và dòng 323 vẫn tự in `pnpm publish:facebook ...` — self-help lỗi thời, là ứng viên xóa round sau.
2. **Package-level Shopee fallback**: `packages/shopee/package.json` vẫn còn `shopee:login`/`shopee:fetch`/`shopee:fetch-cookie` (chạy qua `--filter`). Cố ý giữ làm fallback nhưng tạo namespace đôi với `debug:shopee:*` ở root.
3. **Docs lịch sử**: `TRANG_THAI_VFOS_HIEN_TAI.md` (và round-log `ROUND_26B`, `VFOS_AGENT_ARCHITECTURE_V0`) còn nhắc `publish:facebook`/`shopee:login`/`shopee:fetch` — đã gắn banner "legacy historical", chưa viết lại từng dòng.
4. **README prose package**: `packages/shopee/README.md` phần walkthrough (mục dưới) còn `pnpm shopee:*` ở dạng tutorial cũ.
5. **Batch chưa tự động hóa**: vẫn là 1 job/lần thủ công; chưa có queue cho nhiều video/ngày.
6. **Rủi ro còn lại**: rate-limit OpenAI/ElevenLabs khi chạy nhiều job; phụ thuộc Operator mở Cốc Cốc đúng tab cho CDP.

---

## 8. Đề xuất phase tiếp theo

1. **Chạy thật 1 job tới publish dry-run**: `job:approve` → `job:package` → `job:launch-check` → `job:publish-facebook --dry-run` cho `job_20260601_002` (đã READY) để chốt end-to-end.
2. **Batch test 3–5 video** bằng đúng 2 command A-Z, đo thời gian/độ ổn định mỗi job.
3. **Dọn nốt orphan**: xóa `facebook-publish-command-demo.ts` + đồng bộ README prose package sang `debug:shopee:*` (round cleanup nhỏ).
4. **Monitor rate-limit**: thêm log/retry-backoff rõ cho OpenAI 429 / ElevenLabs khi batch.
5. **Queue/batch manager** (nếu muốn scale): hàng đợi job để chạy nhiều video/ngày, gắn với North Star doanh thu affiliate.

---

## 9. Kết luận

VFOS đã đạt trạng thái **"gọn — an toàn — một đường chuẩn"**: surface vận hành rút về 2 command A-Z, một đường Shopee CDP (Cốc Cốc-only), một đường publish job-based có gate, repo sạch và đồng bộ, có operator guide chính thức khóa flow. Phần còn lại chủ yếu là dọn dư nhỏ (file orphan, docs lịch sử, README prose) và bước tiến hóa tiếp theo là **chạy thật + batch + chống rate-limit** — đúng hướng North Star: biến reup video thành affiliate content cho Facebook/TikTok VN. Hệ thống hiện đã đủ điều kiện để Operator vận hành thật mà ít rủi ro chạy nhầm.
