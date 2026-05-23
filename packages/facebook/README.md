# @vfos/facebook

Facebook / Meta Graph API integration cho VFOS.

> **Default behavior: MOCK / dry-run**. Publish thật yêu cầu nhiều gate đồng thời. Đọc kỹ section "Safety gate" trước khi chạy bất kỳ lệnh nào liên quan đến publish.

## Surface hiện tại

| Module | Loại | Mode mặc định |
|---|---|---|
| [src/meta-client.ts](src/meta-client.ts) | Generic GET-only Graph API client | Read-only |
| [src/test-page.ts](src/test-page.ts) | `testPageConnection()` → `GET /{page_id}` | Read-only |
| [src/post-page.ts](src/post-page.ts) | `publishTextPost()` → `POST /{page_id}/feed` | **MOCK** (chỉ chuyển LIVE khi `META_MODE=live`) |
| [scripts/test-connection.ts](scripts/test-connection.ts) (`pnpm facebook:test`) | Đọc Page info | Read-only |
| [scripts/test-post.ts](scripts/test-post.ts) (`pnpm facebook:test-post`) | Đăng text post test | **MOCK** mặc định |
| [scripts/get-page-token.ts](scripts/get-page-token.ts) (`pnpm facebook:get-page-token`) | User Token → Page Token | Read-only |

**Reels upload code**: CHƯA tồn tại. Future scope, cần user duyệt mở scope riêng.

## Safety gate (Round 2B 2026-05-24)

`publishTextPost()` có HARD GATE đọc `META_MODE` từ environment:

| `META_MODE` | Behavior |
|---|---|
| (unset) / `mock` / bất kỳ giá trị khác `live` | **Mock**: trả `{ success: true, postId: "mock_dry_run_<ts>", mode: "mock" }`. KHÔNG gọi Graph API. |
| `live` | Real publish (`POST /{page_id}/feed`). Trả `{ ..., mode: "live" }`. |

Mặc định ALWAYS là mock. Lý do: tránh trường hợp `.env` thiếu hoặc env var chưa set → publish nhầm.

## Live publish — 4 điều kiện đồng thời

Để `pnpm facebook:test-post` thực sự đăng bài, **TẤT CẢ** 4 điều kiện sau phải đúng:

1. `META_MODE=live` trong `.env` hoặc shell env.
2. CLI flag `--confirm-publish`.
3. `FACEBOOK_PAGE_ID` non-empty trong `.env`.
4. `FACEBOOK_PAGE_ACCESS_TOKEN` non-empty trong `.env`.

Thiếu bất kỳ điều kiện nào → script tự động fallback về MOCK MODE và in lý do.

## Usage

```bash
# 1) Mặc định mock — an toàn, không publish, không gọi API.
pnpm facebook:test-post

# 2) Mock rõ ràng (tương đương trên — flag chỉ để document intent).
pnpm facebook:test-post -- --dry-run

# 3) Live publish thật — CHỈ khi user chủ động review + xác nhận.
#    Cần .env có FACEBOOK_PAGE_ID + FACEBOOK_PAGE_ACCESS_TOKEN hợp lệ.
META_MODE=live pnpm facebook:test-post -- --confirm-publish
```

```bash
# Test đọc Page info (không publish):
pnpm facebook:test

# Đổi User Token → Page Token (read-only):
pnpm facebook:get-page-token
```

## Token safety

- `.env` được `.gitignore` — KHÔNG commit token thật.
- `.env.example` là template — empty `FACEBOOK_PAGE_ID=` + empty `FACEBOOK_PAGE_ACCESS_TOKEN=`.
- Token KHÔNG bao giờ log full ra stdout/stderr. Chỉ mask hint (8 ký tự đầu + 4 ký tự cuối) qua `maskToken()`.
- Permission tối thiểu khi tạo Page Access Token:
  - Read Page: `pages_show_list`, `pages_read_engagement`
  - Publish text post (future when needed): `pages_manage_posts`

## Integration với `/chay`

> `/chay` (Shopee-First Lane) **TUYỆT ĐỐI KHÔNG** gọi `publishTextPost()` hay bất kỳ endpoint publish nào. `/chay` chỉ lập metadata file `facebook_reels_publish_plan.json`. Việc đẩy bài/video thật lên Facebook Page là operator manual step ngoài skill.

Xem chi tiết: [.claude/skills/chay/SKILL.md](../../.claude/skills/chay/SKILL.md) — section "FACEBOOK REELS + SHOPEE PUBLISH PLAN v0".

## Future scope (KHÔNG triển khai trong giai đoạn này)

- Reels upload: `POST /{page_id}/videos` chunked upload phase. Cần thiết kế retry, progress tracking, upload session management. Phải có dedicated safety gate riêng (vd `META_REELS_MODE=mock`).
- Insights read: `GET /{page_id}/insights`. Read-only, an toàn nhưng chưa cần.
- Comment / reply automation: high risk auto-spam — KHÔNG triển khai cho đến khi user duyệt scope.
