# VFOS — Agent Handoff Hiện Tại

> Cập nhật: 2026-06-09 | ĐỌC FILE NÀY ĐẦU PHIÊN, trước khi làm bất cứ việc gì.
> Lịch sử đầy đủ: `docs/00_DIEU_HANH/TRANG_THAI_VFOS_HIEN_TAI.md`
> Tự kiểm tra trước khi tin file này: `git status -s` · `git log --oneline -8` · `git status -sb`

## 1. Git / Repo State
- Branch: `fix/shopee-modal-read` (CHƯA merge vào `master`, CHƯA push — local only)
- Local HEAD: `1d47226` (`feat(studio): wire product binding coherence + publish command center`)
- Working tree: **clean** (đã dọn xong toàn bộ uncommitted của các round trước, không còn file lửng lơ)
- 3 commit mới nhất round này (chưa push): `1d47226` (publish/binding wiring) ← `7fd4194` (docs guardian) ← `e2d6fd9` (Production Gate Standard).
- Dev server: Studio dev port 3002 (`pnpm studio:dev:clean`). KHÔNG bền giữa các phiên — nếu `/products` không lên, chạy lại lệnh đó.

## 2. Latest Completed Milestones
- `1d47226` — Wire `expectedProduct` xuyên Action 2 + publish (bindingStatus PASS/MISMATCH/MISSING, không default job đầu, default-deny server-side); Publish Command Center live-gate UI; chuyển type `PublishContent` từ mock-data → `lib/types.ts`.
- `7fd4194` — Docs: `VFOS_SIDEBAR_GUARDIAN_STANDARD.md` + `INTAKE_FALLBACK_GUARDIAN_AUDIT.md`; wire guardian standard vào protocol đọc đầu phiên (CLAUDE.md).
- `e2d6fd9` — **VFOS Production Gate Standard**: SSOT `apps/studio/src/lib/studio-data/production-gates.ts` gom 5 luật gate (primitives `isFallbackSource`/`compareProductBinding` default-deny/`isSourceApproved`/`isOwnerValid`/`resolveCleanSourceRel` + `evaluateProductionGates`). Rewire workflow-integrity + evaluateLivePublishGates + approve route (giữ parity). Vá lỗ hổng: `cmdRunReview`/`cmdScript` nay chặn fallback (Rule 5).
- `700aa36` — Intake fallback safeguard + production run blocker.
- `ccf3a3f` — Workflow integrity standard + guards trong Action 2.
- Trạng thái Production Gate Standard: **5/5 luật có code guard, SSOT studio = 1 bản**; scripts (`vfos-job-manager`/`job-launch-check`) mirror predicate canonical do workspace boundary. Typecheck @vfos/studio PASS; smoke test primitives 14/14 PASS.

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
- **[Product Image 04B]** Không chạy lại 04B-1 no-auth image spike: đã fail (Shopee SPA shell/anti-bot, không có `og:image`; `api/v4/item/get` no-auth trả 403).
- **[Product Image 04B]** Không dùng CDP re-attach chỉ để backfill ảnh BABYJOY (rủi ro chạm session thật; dedupe skip entry cũ; upsert không merge field).
- **[Product Image 04B]** BABYJOY cũ thiếu ảnh là ĐÚNG kỳ vọng → `/create` fallback "Chưa có ảnh sản phẩm". Sản phẩm MỚI sau Shopee extraction sẽ có `productImageUrl` nếu DOM card có image URL hợp lệ.

## 5. Next Recommended Step
- Branch `fix/shopee-modal-read` đã sạch + 3 commit mới CHƯA push. Quyết định Operator: **push / mở PR vào `master`** hay tiếp tục round nữa rồi mới push.
- (Tuỳ chọn, round sau) Rewire `run-production` / `publish-facebook` / `job-launch-check` sang dùng thẳng `evaluateProductionGates` với standardized keys — cần parity test riêng vì đổi reason codes. Hiện chỉ tầng primitives được dùng chung (đã đủ để hết drift trong studio).
- (Tuỳ chọn) Giảm 2 bản mirror predicate ở scripts: cân nhắc tách 1 module pure dùng chung được cho cả tsx scripts lẫn Next app.
- Nếu Operator muốn xem UI: `http://localhost:3002/lanes/product-review` (chạy `pnpm studio:dev:clean` nếu chưa lên).

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
