# VFOS — Revenue Attribution & Ingestion Spec V1 (G2 / G4 / G1)

> **Trạng thái:** DESIGN SPEC (chưa code) · chốt 2026-07-03
> **Quan hệ doc:** Kế thừa `VFOS_STUDIO_IA_AFFILIATE_VIDEO_OS_V1.md` (§6 Gap, §8 Phase). Phủ **Phase 3 (real-only gating)** + thiết kế **Phase 4 (ingestion + job-bound attribution)**. **Phase 5 (chart tiền) chỉ sau khi có data thật.** Dưới `VFOS_NORTH_STAR.md` + No-Go rules (CLAUDE.md).
> **North Star:** đóng nốt stage cuối pipeline (publish → **performance learning**) — đo doanh thu affiliate thật per video/job để học tín hiệu thị trường. Không phải BI trang trí.

---

## 0. Vì sao spec này tồn tại

Phần 66 (`Revenue Feedback Loop V1`, commit `b281386`) đã nối số **manual** M3–M6 vào từng job/video đã đăng, với luật "chưa đo = `null`, KHÔNG bịa 0". Nhưng 3 gap còn hở, IA doc §6 tự chỉ ra:

- **G2** — `/analytics` còn trộn **mock (GROWTH FIXTURE)** với real → mọi tile tiền có nguy cơ hiện số giả (phạm No-Go #6).
- **G4** — doanh thu **chưa quy về jobId cố định server-side** (first-click, No-Go #7).
- **G1** — **chưa có ingestion doanh thu Shopee/TikTok Shop** → mọi chart Revenue rỗng hoặc buộc fake.

Spec này thiết kế cách bịt 3 gap bằng cách **tái dùng tối đa primitive đã có**, tối thiểu bề mặt mới, và code theo **6 slice nhỏ an toàn** ở các phiên sau.

---

## 1. Non-goals & guard (đọc trước)

| # | Ràng buộc | Áp dụng trong spec |
|---|---|---|
| No-Go #2 | Không chạy API thật nếu không cho phép | Shopee Affiliate connector round này chỉ **stub interface + `manual_csv`**; KHÔNG gọi API; path publish FB **không đụng** |
| No-Go #5 | Không commit runtime | Store mới nằm dưới `data/growth/runtime/` — đã gitignored bởi `.gitignore:33 (data/)` |
| No-Go #6 | Không bịa số / trộn mock với real | Money sections **không bao giờ** render fixture; attribution chỉ trên `source:'real'` |
| No-Go #7 | Không `latest`/`jobs[0]`/floating | Attribution neo `jobId` **tường minh**, resolver **exact-match**; không hàm "get latest post" |
| YAGNI (design.md) | Không refactor sớm | KHÔNG bóc 2 god-file (`product-review/page.tsx`, `vfos-job-manager.ts`); KHÔNG đụng script publish |

**Deliverable của round design:** chính tài liệu này. Code = các phiên sau, theo §5.

---

## 2. Nền tảng đã verify (tái dùng — KHÔNG xây lại)

Mọi mục dưới đây đã đối chiếu code thật (`verification_status: verified`).

| Primitive | Vị trí | Ghi chú |
|---|---|---|
| `GrowthDataSource = 'mock' \| 'real'` | `apps/studio/src/lib/growth-data/types.ts` | Type gốc phân biệt nguồn |
| Loader `{ data, source:'real'\|'fixture' }` | `growth-data/load.ts` — `loadChannelsWithSource` / `loadRealPublishedVideos` (~L210) / `loadNichesWithSource` | Pattern chuẩn, mirror cho loader mới |
| Loader **CHƯA** có source (rò mock) | `load.ts` — `loadPerformanceMetrics` / `loadCtaRoleMetrics` | Chỗ G2 phải bọc |
| `ManualPerformanceSnapshot{jobId, revenue?:VND, source}` | `types.ts` (~L273) | Đã có field revenue + jobId tường minh |
| `computeJobEvidenceSummary(jobId)` / `evidenceByJob()` | `studio-data/jobs.ts:469` / `:433` | Rollup M3–M6; null-không-bịa-0 |
| Runtime store + append atomic tmp→rename + dedupe idempotent | `growth-data/runtime-store.ts` | Copy pattern cho store mới |
| Manual save route (local-only guard + secret-scan + `resolveJobBinding`) | `api/studio/analytics/manual-performance/save/route.ts` | Mẫu để clone route import Shopee |
| `PublishedPost{jobId, facebookPostId, videoId, affiliateShortLink, publishedAt}` | `types.ts:106` | **Đã định nghĩa**, chưa có runtime writer |
| Publish writer (chain attribution đã ghi trên đĩa) | `scripts/job-facebook-publish-command.ts` → `facebook_publish_status.json` (postId/permalink/videoId) + `facebook_publish_result.json` (publishedAt + **affiliateLink**) | Keyed jobId → G4 chỉ cần **đọc**, không cần writer mới trong script |
| Publish route (hook append store) | `api/studio/jobs/[jobId]/publish-facebook/route.ts` | Nơi materialize `PublishedPost` sau success |
| `productBinding{shortLink,shopId,itemId}` + `compareProductBinding` default-deny + owner `an_17376660568` | `studio-data/production-gates.ts` | Link affiliate đã qua gate lúc publish |
| Job ID ổn định `job_YYYYMMDD_NNN` | `scripts/vfos-job-manager.ts` | Khóa attribution deterministic |

**Hệ quả quan trọng (thu hẹp G4):** chain `jobId → postId/permalink → affiliateLink → publishedAt` **đã nằm trên đĩa** sau mỗi publish. Nên **G4 = read-side resolver deterministic**, KHÔNG phải thêm writer vào script publish (god-file) — chỉ materialize 1 index runtime từ artifact đã có.

---

## 3. Thiết kế A — G2: gate mock + empty-state (Phase 3)

**Mục tiêu:** section chỉ render số khi `source==='real'`; ngược lại render empty-state "Chưa có số liệu thật". Section **tiền** (doanh thu/lợi nhuận) tuyệt đối không render fixture.

### A.1 Component tái dùng (CREATE)
`apps/studio/src/components/analytics/no-real-data.tsx`
```tsx
type NoRealDataProps = {
  metric: string;              // "Lượt xem theo ngách", "Doanh thu affiliate"…
  reason?: string;             // vì sao chưa có (vd "chưa có job PUBLISHED")
  kind?: 'metric' | 'money';   // 'money' = nói rõ chưa vẽ chart tiền tới khi có số thật
};
```
- `kind:'money'` render câu cứng: *"Chưa vẽ biểu đồ doanh thu/lợi nhuận cho tới khi có số liệu thật (No-Go #6)."*
- Không số, không chart, không `0` giả.

### A.2 Loader nâng source (EDIT `load.ts`)
- Thêm `loadPerformanceMetricsWithSource(): { rows: PerformanceMetric[]; source:'real'|'fixture' }` + `loadCtaRoleMetricsWithSource()` — **mirror** `loadRealPublishedVideos()` (real-first: đọc runtime/config thật → fallback fixture khi rỗng).
- Giữ `loadPerformanceMetrics()`/`loadCtaRoleMetrics()` cũ làm **wrapper mỏng** gọi `*WithSource().rows` — behavior-preserving, không vỡ caller khác.

### A.3 Bọc section ở `/analytics` (EDIT `app/analytics/page.tsx`)
- Mỗi section fixture (KPI grid, donut "Lượt xem theo ngách", platform bars, "CTA by role", "Top video" table): nếu `source!=='real'` → render `<NoRealData>` thay số.
- Per-video evidence section (đã real-first, `null`→"—") **giữ nguyên** — đây là output thật của Phần 66.
- Banner inline "GROWTH FIXTURE DATA" chỉ hiện khi dev-fixture flag ON. `MockBanner` (chỉ cảnh báo, không gate) giữ nguyên vai trò.

### A.4 Dev-fixture flag (giữ fixture cho dev, ẩn cho operator)
Env `VFOS_SHOW_FIXTURE_ANALYTICS` (server-read, **default OFF**):

| Trạng thái | flag OFF (operator, mặc định) | flag ON (dev) |
|---|---|---|
| Có real (`source:'real'`) | render số thật | render số thật |
| Không real, section thường | `<NoRealData kind="metric">` | fixture + badge MOCK |
| Không real, **section tiền** | `<NoRealData kind="money">` | **VẪN** `<NoRealData kind="money">` |

→ **Money sections không bao giờ render fixture, kể cả flag ON.** Lằn ranh cứng.

### A.5 Overview `/` (round sau, ghi để nhất quán)
Home hiện đã gỡ mock KPI. Khi round sau kéo revenue KPI lên home (theo IA mới), **bắt buộc** dùng cùng `<NoRealData>` + loader `*WithSource`/resolver §4 — không raw fixture loader. Round này **không đụng** `app/page.tsx`.

### A.6 Guard
- Empty-state short-circuit **trước** mọi `reduce` → chặn `NaN`/`reduce([])`.
- Money `kind:'money'` hard-code, độc lập flag → fixture không rò vào tile tiền.
- Flag default OFF → prod không lộ mock.

---

## 4. Thiết kế B — G4: job-bound attribution (read-side, deterministic)

**Quyết định:** phương án **light** — read-side resolver + materialize `PublishedPost` runtime record.
**Loại** phương án "thêm `jobId` vào `PerformanceMetric`": `PerformanceMetric` là fixture-only và bị gate ra ở §3 → gắn jobId vào đó = attribute mock (phạm No-Go #6).

### B.1 Runtime store (EDIT `runtime-store.ts`)
- `readPublishedPostsStore()` + `appendPublishedPosts()` → `data/growth/runtime/published-posts.json` (gitignored).
- Shape: `{ schemaVersion, updatedAt, posts: PublishedPost[] }`.
- `publishedPostId = pp_<jobId>` (convention đã dùng ở `loadRealPublishedVideos`). Append-only, **dedupe theo `publishedPostId`** (idempotent, copy `appendSnapshots`).

### B.2 Resolver thuần (CREATE `lib/growth-data/attribution.ts`)
```ts
resolvePublishedPost(jobId: string): PublishedPost | null
// 1) store lookup exact jobId  → 2) miss thì derive từ facebook_publish_status.json (never-throw)
attributeSnapshotToJob(s: ManualPerformanceSnapshot):
  { jobId; publishedPostId; facebookPostId; affiliateShortLink } | null
```
- **Deterministic:** snapshot đã mang `jobId` tường minh (set server-side ở save route qua `resolveJobBinding`). Resolver match `jobId===` chính xác.
- **KHÔNG** tồn tại code path `latest` / `jobs[0]` / date-sort-pick. Reject caller truyền id đã compute.

### B.3 Writer hook (EDIT publish route)
`api/studio/jobs/[jobId]/publish-facebook/route.ts`, nhánh **success**:
- Đọc `facebook_publish_status.json` + `facebook_publish_result.json` + `product_card.json` vừa ghi → dựng 1 `PublishedPost` → `appendPublishedPosts([...])`.
- Bọc `try/catch`: **store-write fail KHÔNG đổi HTTP 200 của publish** (publish đã thành công là sự thật ưu tiên).
- Chỉ id/permalink/shortLink **công khai**, không token/secret.
- Không đụng `scripts/job-facebook-publish-command.ts` (giữ money-path bất biến).

### B.4 Attribution chain
```
ManualPerformanceSnapshot.jobId (tường minh, server-side)
  → published-posts store lookup exact jobId
     → PublishedPost { facebookPostId, permalink(qua status), affiliateShortLink, publishedAt }
```
Mỗi M3–M6 backtrack về đúng 1 jobId vì snapshot literally lưu jobId; dedupe key `jobId+measuredAt+ctaRole` (đã có). Affiliate link trên record là link đã qua `compareProductBinding` default-deny lúc publish.

### B.5 Guard
| Rủi ro | Guard |
|---|---|
| Đọc artifact fail sau publish OK | Resolver fallback derive từ `facebook_publish_status.json`; store là index, không phải nguồn duy nhất; never-throw |
| Re-publish tạo dup | Dedupe `pp_<jobId>`, lần 2 no-op |
| Store-write couple publish response | try/catch cô lập; không log payload |
| Floating lọt vào | Không có hàm "get latest post"; resolver chỉ nhận jobId tường minh |

---

## 5-C. Thiết kế C — G1: Shopee revenue ingestion (structure trước, connector sau)

> **verification_status:** Shopee Affiliate API **hiện KHÔNG tồn tại trong repo** (đã grep xác nhận). Doanh thu hiện chỉ: manual gõ tay (`ManualPerformanceSnapshot.revenue`) + estimate tĩnh (`estimated_commission_vnd = price × %` trong `packages/shopee`). Round này thiết kế **cấu trúc nạp**, chưa gọi API.

### C.1 Entity mới (EDIT `types.ts`)
Chọn entity **riêng** `ShopeeRevenueSnapshot`, KHÔNG nhồi vào `ApiPerformanceSnapshot` (engagement-shaped: views/impressions/reactions) — Shopee là order/commission-shaped, ngữ nghĩa khác. Đúng lý do repo đã tách `ManualPerformanceSnapshot` khỏi `PerformanceMetric`.
```ts
export type ShopeeSource = 'manual_csv' | 'shopee_affiliate_api'; // api KHÔNG dùng round này
export type ShopeeIngestStatus = 'success' | 'partial' | 'unattributed';

export interface ShopeeRevenueSnapshot {
  snapshotId: string;                 // deterministic: jobId + periodEnd + orderRef
  jobId: string | null;               // attribution tường minh (No-Go #7). null = chưa map, KHÔNG đoán
  affiliateShortLink: string | null;  // join key về PublishedPost / product card
  shopId: string | null;
  itemId: string | null;
  periodStart: string;
  periodEnd: string;
  orderCount: number;
  conversions: number;                // đơn đã attribute
  gmv: number;                        // VND gross
  commission: number;                 // VND — đây là M5 revenue (thu nhập affiliate thật)
  currency: 'VND';
  source: ShopeeSource;
  ingestStatus: ShopeeIngestStatus;
  note?: string;
}
```

### C.2 Hai lớp
1. **Storage** (EDIT `runtime-store.ts`): `readShopeeRevenueStore()` + `appendShopeeRevenueSnapshots()` → `data/growth/runtime/shopee-revenue-snapshots.json` (gitignored), atomic + dedupe `snapshotId`.
2. **Adapter/connector** (CREATE `lib/growth-data/shopee/connector.ts`):
```ts
export interface ShopeeRevenueConnector {
  readonly source: ShopeeSource;
  ingest(input: unknown): Promise<{
    snapshots: ShopeeRevenueSnapshot[];
    rejected: Array<{ reason: string }>;
  }>;
}
```
- Deliverable = interface + **`ManualCsvShopeeConnector`** (pure: map 1 dòng CSV/paste → snapshot chuẩn hoá + validate; **no fs, no network**).
- `ShopeeAffiliateApiConnector` chỉ **khai báo stub**, KHÔNG implement (No-Go #2).
- Attribution trong connector: match CSV `affiliateShortLink`/`itemId` vào published-posts store (§4) để điền `jobId`; không khớp → `jobId:null, ingestStatus:'unattributed'` (không đoán).

### C.3 Merge vào evidence (EDIT `jobs.ts` `evidenceByJob()`)
Fold thêm Shopee snapshot theo jobId. **Precedence cho M5 revenue** khi 1 job có nhiều nguồn (tránh double-count cùng khoản hoa hồng):
```
shopee_affiliate_api  (API thật, khi có — tin cậy nhất)
  > manual_csv        (commission export từ platform)
  > manual            (operator gõ tay .revenue — ước lượng người, thấp nhất)
```
- **Không cộng dồn revenue across tier** — lấy nguồn precedence cao nhất hiện có cho job đó.
- Engagement (views/clicks/conversions) **giữ additive** post-level như hiện tại.
- Giữ null-không-bịa-0: job không có snapshot nào → summary vẫn `null`.

### C.4 Guard
| Rủi ro | Guard |
|---|---|
| Trộn commission thật + estimate → double-count | Precedence-pick, KHÔNG sum, cho field revenue (C.3) |
| CSV import lỡ gọi API | `manual_csv` connector pure; `shopee_affiliate_api` chỉ stub (No-Go #2) |
| Row chưa attribute thổi sai job | `jobId:null` + `unattributed`; merge bỏ qua row null-jobId |
| Secret rò từ CSV (email/UID đơn) | Reuse `findSensitiveTerms` trong import route; entity không field PII |

---

## 5. Thứ tự triển khai (slice nhỏ + an toàn trước)

Mỗi slice = 1 vòng code riêng ở phiên sau, self-review + typecheck trước khi sang slice kế.

| Slice | Nội dung | Acceptance |
|---|---|---|
| **1 — G2 gate** | `NoRealData` + `*WithSource` loaders + bọc analytics sections + dev flag. Không đổi data model | no-real + flag OFF ⇒ money+KPI hiện "Chưa có số liệu thật", **0 số fixture**, không NaN; per-video vẫn hiện video thật với "—". flag ON ⇒ fixture trở lại **trừ** money sections vẫn empty |
| **2 — G4 store+resolver** | `readPublishedPostsStore`/`appendPublishedPosts` + `attribution.ts` + derive-on-read fallback. Chưa đụng route | `resolvePublishedPost(jobId)` đúng postId/permalink/affiliateShortLink cho mọi job PUBLISHED (qua fallback); jobId lạ → `null`; **không** code path `latest`/sort |
| **3 — G4 writer hook** | Publish route nhánh success append `PublishedPost`, try/catch cô lập | sau publish success store có đúng 1 `pp_<jobId>`; re-publish no-op; ép store-write fail **không** đổi HTTP 200 |
| **4 — G1 schema+storage+connector** | `ShopeeRevenueSnapshot` + runtime store + connector interface + `ManualCsvShopeeConnector` pure. Không route, không API | `ingest(rows)` map chuẩn hoá; khớp shortLink có `jobId`, không khớp → `unattributed`; typecheck; **không** import network |
| **5 — G1 merge evidence** | Fold Shopee revenue vào `evidenceByJob()` với source precedence | job có Shopee `manual_csv` ⇒ revenue = giá trị đó (không manual estimate); job chỉ manual ⇒ giữ manual; job trống ⇒ `null`; engagement không đổi |
| **6 — (optional) Shopee import route** | `api/studio/analytics/shopee-revenue/import/route.ts` clone từ `manual-performance/save` | off-host 403; payload nhạy cảm reject; CSV hợp lệ append idempotent |

---

## 6. Verification (từng slice, đúng workflow.md)

- **Typecheck:** `pnpm --filter studio typecheck` sau mỗi slice, 0 lỗi.
- **UI slice 1:** mở `localhost:3002/analytics` bằng Chrome (không Cốc Cốc) — xác nhận empty-state hiện đúng khi không có real; bật `VFOS_SHOW_FIXTURE_ANALYTICS=1` xác nhận fixture trở lại **trừ** money.
- **Slice 2–3:** publish 1 job test → kiểm `data/growth/runtime/published-posts.json` có đúng 1 `pp_<jobId>`; re-publish → không thêm dòng; `resolvePublishedPost` trả đúng record; jobId lạ → null.
- **Slice 4–5:** unit `ManualCsvShopeeConnector.ingest` với 1 row khớp + 1 row không khớp; kiểm `evidenceByJob` precedence + null-không-bịa-0.
- **Git (No-Go #5):** stage **đích danh** file scope, không `git add -A`; confirm không có file `data/` runtime lọt vào staging.
- **Không auto-publish / không API thật** ở bất kỳ slice nào (No-Go #2/#3).

---

## 7. Bàn giao

Phiên sau bắt đầu ở **Slice 1 (G2 gate)** — an toàn nhất, không đổi data model, dọn ngay rủi ro No-Go #6 ở surface analytics. Sau khi Slice 1 PASS acceptance + Operator xem UI, mới sang Slice 2. Cập nhật `TRANG_THAI_VFOS_HIEN_TAI.md` (Phần mới) + commit hash sau mỗi slice chốt.
