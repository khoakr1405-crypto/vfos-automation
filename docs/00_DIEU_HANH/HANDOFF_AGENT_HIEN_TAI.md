# VFOS — Agent Handoff Hiện Tại

> Cập nhật: 2026-06-05 | ĐỌC FILE NÀY ĐẦU PHIÊN, trước khi làm bất cứ việc gì.
> Lịch sử đầy đủ: `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
> Tự kiểm tra trước khi tin file này: `git status -s` · `git log --oneline -8` · `git status -sb`

## 1. Git / Repo State
- Branch: `master`
- Remote HEAD: `origin/master = eda358a`
- Local sync: 0 ahead / 0 behind (đồng bộ với remote)
- Working tree: clean (không có file chưa commit khi handoff được ghi)
- Dev server: Studio dev chạy trên port 3002 (chạy bằng `pnpm studio:dev:clean`). Trạng thái dev server KHÔNG bền giữa các phiên — nếu mở phiên mới mà `/products` không lên, chạy lại `pnpm studio:dev:clean`.

## 2. Latest Completed Milestones
- `c4cb729` — Auto-Pilot Priority 3: cleanup orphaned single-link CDP POC.
- `e17fa6a` — Shopee no-click command: `pnpm shopee:card-from-registry` (registry → Product Card, không click/không browser).
- `bd607c2` — Studio UI: section "Shopee Affiliate Registry" trong `/products` (promote link verified → Product Card qua UI).
- `eda358a` — Studio clean dev restart guard: `pnpm studio:dev:clean` (dập gốc lỗi stale `.next` "Cannot find module './801.js'").
- (Đã verify run-time 2 lần) `/products` HTTP 200, không còn lỗi `801.js`, registry API 200, BABYJOY Product Card đúng.

## 3. Current Runtime State
- Studio: `apps/studio` (Next.js 15, port 3002). `/products` 200, section "Shopee Affiliate Registry" visible.
- Current Product Card: `data/temp/selected_product_card.json` = **BABYJOY**.
  - product: `Sơ Sinh Có Đỡ Cổ Đa Năng… Đai Địu Em Bé Đi Xe Máy BABYJOY`
  - shortLink: `https://s.shopee.vn/AUrNlhXRAX`
  - owner: `an_17376660568` (khớp owner bắt buộc)
  - shopid / itemid: `1604253006 / 55404091903`
  - score: 7, status: `VERIFIED_FROM_LONG_LINK`
- Shopee Registry: `production/_commerce/shopee_link_registry.json` — 9 entries, 9 verified, expectedOwner `an_17376660568`. Latest shortLink = `https://s.shopee.vn/AUrNlhXRAX`.
- Runtime files: `data/temp/*` và link registry là **runtime, gitignored, KHÔNG commit**. Đừng giả định chúng có trong git.
- Notes: GET `/api/studio/commerce/shopee-registry` đã được kiểm secret-leak = 0 (không lộ credential_token/cookie/session/canonical).

## 4. Do Not Repeat
- Không lấy lại link Shopee nếu chưa cần (link BABYJOY đã có và verified).
- Không promote link khác nếu đang giữ BABYJOY Product Card (trừ khi Operator yêu cầu đổi).
- Không chạy `pnpm chay` khi chưa xác nhận Product Card đúng.
- Không tạo job/video nếu Operator chưa duyệt.
- Không build khi dev server còn sống; dùng `pnpm studio:dev:clean --no-start` trước khi build.
- Không sửa `.env` hoặc commit `.env`.
- Không click Shopee / login / CAPTCHA / OTP.

## 5. Next Recommended Step
- Continuity (round này) xong → bước tiếp đề xuất: BABYJOY Product Card → Create Job / Video — **chỉ sau khi Operator duyệt**.
- Hoặc nếu Operator muốn xem UI: mở `http://localhost:3002/products` (chạy `pnpm studio:dev:clean` nếu chưa lên).
- Hoặc thử promote một link verified khác qua UI (no-click) để xác nhận luồng.

## 6. Commands / Operational Notes
- Mở Studio sạch (kill 3002 + wipe `.next` + start dev):
  `pnpm studio:dev:clean`
- Trước khi build (tắt dev, không start, rồi build):
  `pnpm studio:dev:clean --no-start`
  `pnpm --filter @vfos/studio build`
- Xem trước hành động clean, không đụng gì:
  `pnpm studio:dev:clean --dry-run`
- Promote registry link → Product Card (no-click, no-browser):
  `pnpm shopee:card-from-registry --short-link https://s.shopee.vn/AUrNlhXRAX`
- KHÔNG chạy live extraction (`pnpm shopee:extract-links-cdp`) trừ khi Operator nói rõ.

## 7. Handoff Rules for Next Agent
- Bắt đầu mỗi phiên bằng việc đọc file này.
- Chạy `git status` / `git log` trước khi làm việc.
- Nếu docs và git mâu thuẫn → DỪNG, báo Operator (tin git, không tin docs).
- Không giả định runtime files (`data/temp/*`, registry) đã được commit.
- Mỗi vòng làm việc lớn xong: cập nhật file này (ghi đè, giữ ngắn) song song với `TRANG_THAI_VFOS_HIEN_TAI.md`.
