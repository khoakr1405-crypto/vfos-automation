# @vfos/shopee

Shopee Affiliate link extraction library cho VFOS Shopee-First Lane.

> 🚫 **DEPRECATION NOTICE (Round 26B+)** — Flow `storageState login` + `cookie-HTTP API` + `HAR replay` mô tả ở phần cũ bên dưới đã **DEPRECATED**. Flow chính thức hiện tại là **CDP attach + targeted-click**. Phần "Setup / Usage" cũ giữ làm reference, không phải hướng dẫn vận hành.

> **Default behavior: an toàn**. Không cookie nào commit, không cookie nào log ra console. Mọi session/cookie sống ở `.secrets/` đã gitignored.

## Official flow hiện tại — CDP targeted-click (Round 26B+)

```text
pnpm commerce:intake                          # preflight read-only
pnpm commerce:intake --confirm-targeted-click # extractor chạy thật, target_count=1
```

Orchestrator spawn chuỗi:
- `pnpm shopee:preflight` — `scripts/shopee-cdp-preflight-demo.ts` (CDP probe port 9222)
- `packages/shopee/scripts/extract-links-cdp.ts` — extractor chính thức (targeted click, owner audit)
- `pnpm shopee:builder` — `scripts/shopee-product-card-builder.ts` (normalize product card)
- `pnpm shopee:audit` — `scripts/shopee-link-audit-demo.ts` (compliance gate)

Driver thuần CDP của package:
- `pnpm shopee:extract-links-cdp` — `packages/shopee/scripts/extract-links-cdp.ts` (Round 27 CLI)

Browser auto-launch (Round 27B): `packages/shopee/src/cdp-bootstrap.ts` tự spawn **Cốc Cốc** (chỉ Cốc Cốc — không Chrome/Edge) với `--remote-debugging-port=9222` khi port đóng + `VFOS_BROWSER_USER_DATA_DIR` đã set.

Affiliate owner bắt buộc: `an_17376660568`. Mọi link mismatch → fail safe.

## DEPRECATED flows — kept as FALLBACK (Round 26B audit policy)

> Quarantined to the `debug:*` namespace at workspace root (Round Cleanup D1)
> so they no longer sit next to the official `commerce:intake` flow. Files are
> kept as documented fallback; run only when CDP is unavailable + Operator explicit.

| Script / Command | Loại | Trạng thái |
|---|---|---|
| `pnpm debug:shopee:login` (`scripts/login-session.ts`) | storage_state login | DEPRECATED — chỉ khi CDP không khả dụng + Operator explicit |
| `pnpm debug:shopee:fetch` (`scripts/fetch-offers.ts`) | storage_state fetch | DEPRECATED — same |
| `pnpm debug:shopee:fetch-cookie` (`scripts/fetch-offers-cookie.ts`) | cookie HTTP API | DEPRECATED — same |
| `pnpm debug:shopee:fetch-products` (`scripts/fetch-products-cookie.ts`) | cookie HTTP API | DEPRECATED — same |
| `pnpm debug:shopee:select` (`scripts/select-products.ts`) | offline product select | DEPRECATED — same |

KHÔNG auto-trigger từ `/chay` hoặc `commerce:intake`. Mỗi file có in-file 🚫 banner.

## Cấu trúc

| File | Loại | Mô tả |
|---|---|---|
| [src/types.ts](src/types.ts) | Schema | `ShopeeProductCandidate` + `ShopeeFetchManifest` |
| [src/extract.ts](src/extract.ts) | Helpers | Selector list, parsePrice/Commission, confidence helper |
| [src/secret-redaction.ts](src/secret-redaction.ts) | Security | redactSecrets, redactError, isSecretFree |
| [src/link-registry.ts](src/link-registry.ts) | Registry | upsertEntry, isDuplicate, findExistingEntry (Round 26B) |
| [src/cdp-extract-helpers.ts](src/cdp-extract-helpers.ts) | CDP helpers | extractShopidItemid, resolveShortLink, parseCliValues |
| [src/cdp-bootstrap.ts](src/cdp-bootstrap.ts) | CDP boot | bootstrapBrowser, captcha guards (Round 27B) |
| [src/index.ts](src/index.ts) | Re-exports | Public API |
| [scripts/extract-links-cdp.ts](scripts/extract-links-cdp.ts) | `pnpm shopee:extract-links-cdp` | **ACTIVE** — CDP single-link extractor |
| [scripts/login-session.ts](scripts/login-session.ts) | `pnpm debug:shopee:login` | 🚫 DEPRECATED (fallback) |
| [scripts/fetch-offers.ts](scripts/fetch-offers.ts) | `pnpm debug:shopee:fetch` | 🚫 DEPRECATED (fallback) |
| [scripts/fetch-offers-cookie.ts](scripts/fetch-offers-cookie.ts) | `pnpm debug:shopee:fetch-cookie` | 🚫 DEPRECATED (fallback) |
| [scripts/fetch-products-cookie.ts](scripts/fetch-products-cookie.ts) | `pnpm debug:shopee:fetch-products` | 🚫 DEPRECATED (fallback) |

---

# Legacy reference (storage_state flow — DEPRECATED)

> Phần dưới đây giữ làm reference cho fallback storage_state flow. KHÔNG phải hướng dẫn vận hành chính thức.

## Tại sao tồn tại (lịch sử)

Shopee không có public API cho affiliate offer dashboard. Anonymous WebFetch return shell HTML (SPA). Internal v4 API trả 403 anti-bot. Cách realistic v0 (trước Round 26B): dùng login session thật của user trong browser headless qua Playwright, đọc DOM, export JSON. Đây là pattern **chậm nhưng chắc** mà user đã chốt 2026-05-22.

Sau Round 26B+, flow chính thức đã chuyển sang CDP attach (mô tả ở trên).

Surface v0 cũ chỉ phục vụ:
- `/chay shopee-first` Discovery Mode (Shopee Product Agent boundary).
- Lấy 1–3 product candidates để chấm Selection Scoring + lập Shopee Product Card.

## Cấu trúc

| File | Loại | Mô tả |
|---|---|---|
| [src/types.ts](src/types.ts) | Schema | `ShopeeProductCandidate` + `ShopeeFetchManifest` |
| [src/extract.ts](src/extract.ts) | Helpers | Selector list, parsePrice/Commission, confidence helper |
| [src/index.ts](src/index.ts) | Re-exports | Public API |
| [scripts/login-session.ts](scripts/login-session.ts) | `pnpm shopee:login` | Headed browser, user login manual, save storageState |
| [scripts/fetch-offers.ts](scripts/fetch-offers.ts) | `pnpm shopee:fetch` | Headless, load storageState, scrape, export JSON |

## Setup (1 lần)

```bash
# Cài Playwright (chỉ workspace shopee — không nuốt cả monorepo)
pnpm add -D playwright -F @vfos/shopee

# Tải Chromium browser (~150MB)
pnpm exec playwright install chromium
```

Playwright là **devDependency optional**. Nếu không cài, script `pnpm shopee:login` / `pnpm shopee:fetch` sẽ fail với error message rõ ràng — không crash, không gọi API.

## Usage

```bash
# 1) Login + save session (1 lần, hoặc khi session expire)
pnpm shopee:login
#   → Mở browser headed.
#   → User login Shopee Affiliate manually (handle captcha / 2FA / OTP).
#   → Sau khi thấy dashboard → quay lại terminal, nhấn Enter.
#   → Session lưu vào .secrets/shopee_storage_state.json (gitignored).

# 2) Fetch product candidates (lặp lại được, dùng session đã save)
pnpm shopee:fetch
#   → Headless browser load session.
#   → Navigate to offer dashboard.
#   → Trích xuất tối đa 3 product cards.
#   → Ghi production/_commerce/shopee_product_candidates.json
#     (JSON này KHÔNG chứa cookie/token, chỉ public product data).
```

## Security model

**HARD rules**:

1. **Session local-only**. File `.secrets/shopee_storage_state.json` chứa Shopee cookies (SPC_EC, SPC_ST, SPC_U, csrftoken, shopee_webUnique_ccd, etc) — KHÔNG bao giờ commit. Đã gitignored qua `.gitignore` rule `.secrets/` + `*.storage_state.json`.

2. **No raw cookie paste**. Không paste cookie thẳng vào chat / repo / `.env`. Login flow chỉ qua headed browser bằng tay.

3. **No cookie log**. Script chỉ log:
   - counts (số candidates attempted/extracted)
   - URLs (canonical Shopee product URLs)
   - boolean status (session expired?)
   - error messages (không chứa cookie value)

   Script KHÔNG log:
   - cookie value của bất kỳ field nào (SPC_EC, SPC_ST, csrftoken, ...)
   - request header `Cookie`
   - localStorage / sessionStorage entries
   - storage state file content

4. **No bypass**. Nếu Shopee bắt captcha / OTP / 2FA → user handle thủ công trong headed browser. Script KHÔNG tự solve captcha, KHÔNG tự nhập OTP, KHÔNG bypass anti-bot.

5. **Artifact zero-cookie**. File `production/_commerce/shopee_product_candidates.json` chỉ chứa: URL, name, price, commission %, sales, rating, review, shop name, source page, confidence, notes. ZERO authentication data.

6. **Debug snapshot also gitignored**. Nếu selector fail, script lưu HTML snapshot vào `.secrets/last_fetch_dom.html` (gitignored) để operator inspect DOM thủ công. KHÔNG commit snapshot.

## Calibration (lần chạy đầu)

[src/extract.ts](src/extract.ts) chứa `OFFER_DASHBOARD_SELECTORS` — placeholders. Shopee SPA DOM thay đổi thường xuyên. Lần chạy đầu tiên:

1. Chạy `pnpm shopee:fetch`.
2. Nếu output JSON có `candidates_attempted: 0` + `notes` đề cập selector mismatch → mở `.secrets/last_fetch_dom.html` trong browser.
3. Inspect DOM, tìm selector thật cho product card / name / price / etc.
4. Update `OFFER_DASHBOARD_SELECTORS` trong `src/extract.ts`.
5. Chạy lại `pnpm shopee:fetch`.

## Integration với `/chay`

`@vfos/shopee` là tooling cho **Shopee Product Agent** boundary (xem `.claude/skills/chay/SKILL.md` section "AGENT-READY RESPONSIBILITY BOUNDARIES").

`/chay shopee-first` (Discovery Mode) có thể đọc `production/_commerce/shopee_product_candidates.json` để chấm Shopee Product Selection Scoring + lập Shopee Product Card. Tuy nhiên việc chạy `pnpm shopee:login` / `pnpm shopee:fetch` là **operator manual step** trước, không tự động.

`/chay` **TUYỆT ĐỐI KHÔNG** tự chạy:
- `pnpm shopee:login` (cần user login manual)
- `pnpm shopee:fetch` (cần user duyệt việc launch browser)

## Future scope (KHÔNG triển khai v0)

- Search by keyword: `https://affiliate.shopee.vn/offer/shopee_offer/search?keyword=...` để Discovery Mode tự tìm sản phẩm theo lane.
- Affiliate link wrapping: hiện affiliate URL phải copy thủ công từ dashboard. Tự động hoá cần thêm UI flow.
- Session refresh: hiện script chỉ detect expired session. Auto-refresh cần redesign.
- Multi-account: hiện 1 session 1 user. Multi-tenant cần redesign storage path.
