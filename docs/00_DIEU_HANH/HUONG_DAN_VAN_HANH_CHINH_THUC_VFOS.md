# HƯỚNG DẪN VẬN HÀNH CHÍNH THỨC VFOS

> **Loại tài liệu**: Operator Guide — đường dùng CHUẨN, khóa flow A-Z.
> **Phạm vi**: Đây là tài liệu operator-facing chính thức. Mọi command khác không liệt kê ở Mục 1–6 đều là **internal / debug / legacy** — không dùng hằng ngày.
> **Đọc cùng**: `CLAUDE.md` → `docs/VFOS_NORTH_STAR.md` → `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md` → file này.
> **Nguyên tắc vàng**: KHÔNG auto-publish · KHÔNG auto-approve · KHÔNG bypass CAPTCHA/OTP · Shopee Affiliate chỉ chạy trên **Cốc Cốc**.

---

## 0. Hai command A-Z (thuộc lòng 2 dòng này)

```bash
# (1) Lấy sản phẩm Shopee + tạo job
pnpm commerce:intake --confirm-targeted-click --create-job

# (2) Chạy review pipeline A-Z cho 1 video
pnpm job:run-review --job <jobId> --file "<video>.mp4" --confirm-ai
```

Toàn bộ phần còn lại của tài liệu chỉ là chi tiết của 2 dòng trên + bước duyệt/đóng gói/publish.

---

## 1. Lấy sản phẩm + tạo job (Commerce Intake)

```bash
pnpm commerce:intake --confirm-targeted-click --create-job
```

Điều kiện trước khi chạy:
- **Cốc Cốc** (trình duyệt duy nhất được hỗ trợ cho Shopee Affiliate) đang mở, đã đăng nhập affiliate, ở tab catalog Product Offer.
- Lệnh sẽ tự mở/đính kèm Cốc Cốc qua CDP port `9222`. Hỗ trợ UI English/Vietnamese, SPA hydration polling, scoring, dedup/next-product, modal extraction.
- Bắt buộc owner `an_17376660568` + canonical URL sanitation + audit PASS. Mismatch → **fail safe**, không bypass.

Kết quả: product card chuẩn hóa + (với `--create-job`) một `jobId` mới. Ghi lại `jobId` này.

Biến thể an toàn:
```bash
pnpm commerce:intake                          # chỉ preflight read-only (không click)
pnpm commerce:intake --confirm-targeted-click # extract thật, target_count=1, KHÔNG tạo job
```

---

## 2. Thả video nguồn vào inbox

Bỏ file video đã tải về vào **inbox chính thức**:

```
data/operator/video-downloads/
```

Liệt kê video đang có trong inbox:

```bash
pnpm job:source-inbox
```

`job:run-review --file "<video>.mp4"` sẽ tự tìm file theo đường dẫn trực tiếp **hoặc** trong inbox này.

---

## 3. Chạy review pipeline A-Z

```bash
pnpm job:run-review --job <jobId> --file "<video>.mp4" --confirm-ai
```

Pipeline tự chạy đầy đủ: attach source → OpenAI Vision → AI Script → BGM (0.40) → VoiceDirection → Render → Captions → AudioGuard → BgmGuard → Final QA/STT → kết thúc ở trạng thái `READY_FOR_OPERATOR_REVIEW`.

> `--confirm-ai` là cờ bắt buộc để xác nhận pipeline được phép gọi AI (OpenAI/ElevenLabs). Không có cờ này, pipeline dừng an toàn.

---

## 4. Operator xem video

```bat
start "" "data\temp\jobs\<jobId>\preview_with_captions_v2.mp4"
```

Xem trạng thái / vòng đời job bất kỳ lúc nào (read-only, không gọi API):

```bash
pnpm job:status   --job <jobId>
pnpm job:dashboard --job <jobId>
```

---

## 5. Duyệt (Approve) — thao tác thủ công của Operator

Chỉ approve **sau khi đã tự xem video**:

```bash
pnpm job:approve --job <jobId> --notes "Operator reviewed and approved."
```

Từ chối:

```bash
pnpm job:reject  --job <jobId> --notes "<lý do>"
```

> Hệ thống KHÔNG bao giờ tự approve. Approve là hành động người vận hành.

---

## 6. Đóng gói → Launch check → Dry-run publish

```bash
pnpm job:package        --job <jobId>
pnpm job:launch-check   --job <jobId>
pnpm job:publish-facebook --job <jobId> --dry-run
```

- `job:package` — đóng gói reel + metadata sau khi approved.
- `job:launch-check` — kiểm tra điều kiện trước publish (approved, packaged, QA PASS).
- `job:publish-facebook --dry-run` — **mặc định an toàn**: chỉ readiness/report, KHÔNG upload, KHÔNG gọi live Facebook.

---

## 7. Live publish — CHỈ khi explicit

```bash
pnpm job:publish-facebook --job <jobId> --confirm-live-publish
```

- Đây là lệnh **duy nhất** thực sự upload lên Facebook.
- Chỉ chạy khi đã: approved + packaged + QA PASS + launch-check OK + Operator chủ động muốn publish.
- Safety locks (`uploaded` / `published` / `apiCalled`) mặc định `false`; chỉ chuyển khi lệnh live này được gọi có chủ đích.

---

## 8. Ranh giới an toàn (bắt buộc tuân thủ)

- **KHÔNG auto-publish**: mặc định luôn `--dry-run`. Live cần `--confirm-live-publish` rõ ràng.
- **KHÔNG auto-approve**: approve/reject là thao tác người.
- **KHÔNG bypass CAPTCHA/OTP/login**: gặp CAPTCHA → Operator tự xử lý trong Cốc Cốc; script không vượt rào bảo mật.
- **Shopee Affiliate = Cốc Cốc-only** (không Chrome/Edge). Flow chính thức là CDP targeted-click.
- **KHÔNG đụng** `.env`, token, cookie, session, browser profile.
- **KHÔNG commit** runtime/video/mp3/`data/temp/`/manifest runtime. Media trong `production/**` đã được `.gitignore`.
- Trước/sau khi rời máy: `pnpm vfos:sync-check` để kiểm tra git sync + sensitive/runtime guard.

---

## 9. Lệnh KHÔNG dùng hằng ngày (internal / debug / legacy)

| Nhóm | Lệnh | Ghi chú |
|---|---|---|
| **Internal core** | `pnpm chay:review` | Lõi của `job:run-review`. Operator **ưu tiên `job:run-review`**, không gọi trực tiếp. |
| **Debug Shopee fallback** | `pnpm debug:shopee:login` / `debug:shopee:fetch` / `debug:shopee:fetch-cookie` / `debug:shopee:fetch-products` / `debug:shopee:select` | Flow storage_state/cookie **DEPRECATED**, chỉ khi CDP không khả dụng + Operator explicit. Thay thế chính thức: `commerce:intake`. |
| **Package-level Shopee** | `pnpm --filter @vfos/shopee shopee:login` / `shopee:fetch` / `shopee:fetch-cookie` | Fallback nội bộ package, không phải đường vận hành chính. |
| **Legacy publish — ĐỪNG DÙNG** | ~~`pnpm publish:facebook --run <runId>`~~ | Đã gỡ. Dùng `pnpm job:publish-facebook --job <jobId> --dry-run`. |

> Bất kỳ tài liệu/round-log cũ nào còn nhắc `publish:facebook`, `shopee:login`, `shopee:fetch`, `pipeline:pN-demo` → là **legacy historical reference**, không phải đường dùng hiện tại.

---

## 10. Lỗi thường gặp & xử lý

| Lỗi | Xử lý |
|---|---|
| **OpenAI 429** (rate limit) | Chờ vài phút rồi retry bước script: `pnpm job:script --job <jobId> --confirm-openai`. Không spam retry. |
| **CAPTCHA / OTP trên Shopee** | Operator tự xử lý trong **Cốc Cốc**. Script KHÔNG bypass. Xong thì chạy lại `commerce:intake`. |
| **Audit fail (owner / canonical URL)** | KHÔNG bypass. Sửa ở khâu intake/sanitize (owner phải là `an_17376660568`, URL phải sạch credential) rồi extract lại. |
| **CDP browser not found** | Mở Cốc Cốc với `--remote-debugging-port=9222`, vào tab Shopee Affiliate, chạy lại `commerce:intake`. KHÔNG tự fallback sang `debug:shopee:login`. |
| **Facebook token hết hạn (OAuthException 190)** | Đổi sang Page token DÀI HẠN: lấy User token tươi từ Graph Explorer (app riêng, quyền `pages_show_list` + `pages_manage_posts`) → dán vào `FACEBOOK_PAGE_ACCESS_TOKEN` trong `.env` → chạy `pnpm facebook:get-page-token` (cần `META_APP_ID`/`META_APP_SECRET` trong `.env`). Script exchange dài hạn + verify `debug_token` + tự ghi `.env`. Kiểm tra cuối: `pnpm facebook:test`. |

---

## 11. Tổng kết một vòng chuẩn

```text
commerce:intake --confirm-targeted-click --create-job   → jobId
       ↓ (thả video vào data/operator/video-downloads/)
job:run-review --job <jobId> --file "<video>.mp4" --confirm-ai
       ↓ (xem preview_with_captions_v2.mp4)
job:approve --job <jobId> --notes "..."
       ↓
job:package → job:launch-check → job:publish-facebook --dry-run
       ↓ (chỉ khi chủ động muốn lên sóng)
job:publish-facebook --job <jobId> --confirm-live-publish
```
