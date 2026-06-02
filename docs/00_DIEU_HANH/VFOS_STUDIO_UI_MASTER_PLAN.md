# VFOS Studio UI — Master Plan

> **Loại tài liệu**: Bản đồ UI tổng thể cho VFOS Studio — đã được Operator duyệt.
> Branch: `master`. UI Strategy 01 chốt ở `dc07090`. UI Strategy 02 chốt ở `ee19e1c`.
> Active lane duy nhất: **Review sản phẩm**.

---

## 0. Context — vì sao có plan này

UI Strategy 01 đã chốt: VFOS Studio có một **Operator Overview Dashboard** (dark dashboard, `apps/studio`, port 3002) cho 1 lane *Review sản phẩm*, với product-first queue, video job queue, preview trong job card, Approve/Reject tách khỏi Publish, channel suggestion, view/click analytics, warning CTR. Nhưng **toàn bộ dashboard ban đầu chạy bằng mock/fixture data** (hardcode trong component + `lib/mock-data.ts`), và chưa có tab nào nối với job/run thật.

Trong khi đó repo **đã có một hệ thống job thật đang chạy** (`scripts/vfos-job-manager.ts` + `runs/job_20260602_001..003`) với manifest, cleanliness gate, approve/reject command, product card + link registry có owner validation `an_17376660568`.

Master Plan này vẽ bản đồ UI tổng thể + lộ trình nối mock → real **an toàn, từng round nhỏ**, giữ nguyên khuôn đã chốt, không phá core pipeline, không mở multi-lane sớm. Hai quyết định nền đã chốt với Operator:
1. **Data access = Next.js App Router route handlers `/api/studio/*`** (đọc file runtime server-side, sanitize, trả JSON read-only).
2. **Round UI-02 = adapter map vào component hiện có** (giữ UI, thay `INITIAL_JOBS`/`INITIAL_PRODUCTS` bằng real data qua adapter; analytics giữ mock).

> **Cập nhật tiến độ**: Round UI-02 đã hoàn tất + commit `ee19e1c` (Operator Dashboard đọc job thật read-only qua `/api/studio/*`). Xem mục 11 (Roadmap) cho Phase tiếp theo.

---

## 1. Executive Summary

- VFOS Studio = trung tâm điều hành xưởng video affiliate theo lane, hiện chỉ làm chắc lane **Review sản phẩm**.
- UI shell + type contract đã tốt (`apps/studio/src/lib/types.ts` được viết như "data-shape contract" ổn định). Việc chính các round sau **không phải vẽ lại UI** mà là viết **adapter đọc job thật** map vào shape component đang có.
- Real data sẵn sàng nối **trước**: job state, cleanliness gate, captioned preview, final QA, approve/reject, product card + owner validation, publish readiness (package manifest).
- Giữ **mock**: view/click analytics, channel performance/CTR trend, cluster summary, weekly activity, multi-lane data, scaling recommendation — vì chưa có metrics thật.
- Thứ tự an toàn: **read-only trước → approve/reject có guard → build các tab chuyên sâu → lane pack → multi-lane** (chỉ khi blueprint vững).

---

## 2. UI North Star

> VFOS Studio là trung tâm điều hành sản xuất video affiliate theo lane/ngách, bắt đầu từ lane **Review sản phẩm**, dùng **một core blueprint ổn định** và mở rộng bằng **Lane Pack/config/adapter**, **không tạo pipeline riêng cho từng lane**.

Hệ quả ràng buộc lên UI:
- **Approve ≠ Publish.** Approve chỉ đẩy job vào Publish Queue; publish là gate riêng + flag riêng + thủ công.
- **Operator chọn video nguồn**, hệ thống KHÔNG tự chọn source video. Hệ thống chỉ tự chọn *sản phẩm* trong lane đã bật.
- Một video → một nền tảng chính.
- Analytics giai đoạn đầu = view/click theo kênh; yếu thì cảnh báo + gợi ý kiểm tra nguyên nhân, **không tự kết luận lane chết**.

---

## 3. Repo Survey Summary (read-only, đã khảo sát)

### 3.1 Studio UI (`apps/studio`)
- Next.js `^15.x`, **App Router**, React 19, Tailwind 3, port **3002**. Script: `pnpm --filter @vfos/studio dev|build|typecheck`.
- Sitemap 11 trang (`src/lib/nav.ts` → `NAV_GROUPS`): `/`, `/channels`, `/products`, `/create`, `/raw-visual`, `/script`, `/render`, `/qa`, `/publish`, `/schedule`, `/analytics`.
- **Overview** = `app/page.tsx` → 9 component trong `components/overview/`: `overview-kpi-grid`, `operator-job-queue`, `attention-panel`, `product-queue`, `publish-readiness-mini`, `cluster-summary-cards`, `weekly-activity`, `pipeline-overview`, `mini-analytics-panel`.
- **Type contract** `lib/types.ts`: `LaneId = 'review' | 'cau-ca' | 'rua-xe'` (3 lane đã typed, chỉ `review` active), `Job`, `Product`, `QaJob`, `PublishContent`, `ClusterSummary`, `AttentionItem`, `PlatformReadiness`, `PipelineStageStat`... File comment ghi rõ: đây là contract ổn định cho cả mock lẫn backend thật.
- **Hai lớp type đang lệch nhau** (cần ý thức): `lib/types.ts` (canonical, gọn) vs **type inline trong component** (`OperationalJob` trong operator-job-queue.tsx, `ProductItem` trong product-queue.tsx, `ChannelAnalytics` trong mini-analytics-panel.tsx) — richer hơn và có hardcode `INITIAL_JOBS` / `INITIAL_PRODUCTS` / `ANALYTICS_DATA`.
- **Mock data**: `lib/mock-data.ts` + `lib/data/core.ts` + `lib/data/catalog.ts` + các mảng `INITIAL_*` inline.
- (Trước UI-02) **chưa có** `app/api/*`. Approve/Reject + "Tạo Job" chỉ là **client `useState` stub**.

### 3.2 Hệ thống job thật (`scripts/vfos-job-manager.ts`)
Owner toàn bộ vòng đời job. Subcommands (qua `package.json`): `job:create`, `source:intake-clean`, `source:approve-cleanliness`, `job:run-review`, `job:script`, `job:approve`, `job:reject`, `job:package`, `job:status`, `job:list`, `job:vision`, `job:qa`, `job:publish-facebook`.

**JobState (union thật)**:
`CREATED | WAITING_FOR_SOURCE_VIDEO | SOURCE_READY | READY_TO_RENDER | RENDERING | READY_FOR_OPERATOR_REVIEW | APPROVED | REJECTED | PACKAGED | FAILED`.

**Lưu trữ (3 gốc khác nhau — quan trọng cho loader)**:
- SoT manifest: `data/temp/jobs/<jobId>/job_manifest.json` *(gitignored — trong `data/`)*.
- Registry index (danh sách job): `data/temp/vfos_jobs_registry.json`.
- Clean source + cleanliness: `runs/<jobId>/source/` → `clean_source_video.mp4`, `ffprobe.json`, `source_download_report.json`, `source_cleanliness_report.json`, `frames/frame_N.jpg`.
- Package output: `production/archive/<jobId>/` → `package_manifest.json`, `publish_readiness_report.md`, `caption.txt`, `hashtags.txt`.
- Preview operator review: `data/temp/jobs/<jobId>/preview_with_captions_v2.mp4` (= `manifest.artifacts.captionedPreviewPath`).

**`JobManifest` schema** (rút gọn): `jobId, runId, productId, source{ productCardPath, sourceVideoPath, (cleanlinessStatus), (cleanlinessReportPath), (framePaths) }, artifacts{ scriptArtifactPath, voiceArtifactPath, bgmArtifactPath, previewVideoPath, captionedPreviewPath, finalQaReportPath, productionPackageManifestPath, publishReadinessPath }, state, review{ operatorDecision, approvedAt, rejectedAt, notes }, safety{ facebookApiCalled:false, uploaded:false, published:false, requiresOperatorReview:true }, qaStatus, lastError`.

**Cleanliness gate**: `manifest.source.cleanlinessStatus` ∈ `UNKNOWN_NEEDS_OPERATOR_REVIEW → NEEDS_REVIEW → WATERMARK_NOT_DETECTED (pass) | WATERMARK_DETECTED (fail)`. `run-review`/`script` **chặn cứng** nếu ≠ `WATERMARK_NOT_DETECTED` (exit 20). Vision tự động cho logo = `NOT_IMPLEMENTED` → operator duyệt frames thủ công.

**Approve gate** (`cmdApprove`): state phải `READY_FOR_OPERATOR_REVIEW` + captioned preview tồn tại trên đĩa + **final QA đọc từ chính `finalQaReportPath` (status==='PASS')**, không tin manifest mirror. **Reject**: bắt buộc `--notes`, cấm reject khi `PACKAGED`. **Cả hai đều KHÔNG publish.**

### 3.3 Product / Affiliate
- Product card: `production/_commerce/selected_products/*_shopee_product_card.json` (+ `production/_runs/<run>/shopee/`, `production/batch_001/yt_*/`); và **bản copy trong job dir** `data/temp/jobs/<id>/product_card.json` (shape CDP: `{ id, name, shopId, itemId, shortLink, canonicalUrl, affiliateOwnerId, validationStatus, score }`).
- Link registry: `production/_commerce/shopee_link_registry.json` — schema `LinkRegistry` (`packages/shopee/src/link-registry.ts`): `expected_affiliate_owner_id`, `entries[]`, `rejected[]`.
- **Owner `an_17376660568`** = `expected_owner_id`, được url-sanitize (`packages/shopee/src/url-sanitize.ts`) coi là attribution công khai an toàn.
- ⚠️ **SECURITY**: `production/_commerce/*.json` + job product card có canonical URL **chứa `credential_token`/`utm_source`/`mmp_pid` (SENSITIVE)**. Mọi route trả product/link ra UI **phải sanitize** — UI-02 chọn cách an toàn nhất: **không expose URL nào**, chỉ owner id + cờ valid.

### 3.4 Lane config / Channel / Analytics
- **Lane config: CHƯA TỒN TẠI.** Không có thư mục `lanes/`, không có `lane.config.json`. "Lane" chỉ là union type `LaneId` hardcode trong UI + concept ngầm trong pipeline.
- **Channel/Analytics: 100% MOCK.** Không có metrics thật, không có click tracking, không có view collector.
- **Publish**: `job:publish-facebook` tồn tại nhưng mặc định ở mức **readiness/report**, cần `--confirm-final-approval`; trạng thái idle: `facebook_api_called/uploaded/published = false`. Không có live API trong flow thường.

---

## 4. Sitemap / Tab Structure (chuẩn hóa thành 7 phòng ban)

Giữ 11 route hiện có, nhưng **nhóm lại theo 7 phòng ban vận hành** (IA mục tiêu). Tên route giữ nguyên để không phá nav/build đã chốt.

| # | Phòng ban | Route hiện có | Vai trò quyết định |
|---|---|---|---|
| 1 | **Operator Overview** | `/` | Hôm nay cần làm gì: job chờ duyệt, job lỗi, queue, readiness, warning |
| 2 | **Lane / Ngách** | `/channels` (phần lane) | Quản lý lane kiếm tiền; hiện chỉ Review sản phẩm |
| 3 | **Products / Affiliate** | `/products` | Sản phẩm + link + owner validation `an_17376660568` |
| 4 | **Video Jobs / Xưởng SX** | gộp `/create`+`/raw-visual`+`/script`+`/render`+`/qa` → **1 tab workflow A–Z** | Một video job nhìn được từ source → QA → preview → approve, không nhảy 5 màn |
| 5 | **Channels / Accounts** | `/channels` (phần kênh) | Kênh/tài khoản đăng; account là publish target, không phải trung tâm |
| 6 | **Publish Queue / Lịch** | `/publish` + `/schedule` | Approved → queue → gate → published; dry-run/live tách bạch |
| 7 | **Analytics / Hiệu suất** | `/analytics` | View/click/CTR theo kênh + warning + suggested checks |

> Nguyên tắc IA: **Video Jobs là 1 workflow A–Z trong 1 tab** (list + detail panel), không xé nhỏ thành nhiều tab rời. Các route `/create /raw-visual /script /render /qa` hiện tại sẽ dần hợp nhất về tab Video Jobs ở Phase 4 (không xóa vội, chuyển từ từ).

---

## 5. Per-tab Plan

### 5.1 Operator Overview (`/`)
- **Giữ nguyên**: layout, KPI grid, attention panel, cluster cards, weekly activity, pipeline overview, mini-analytics (mock).
- **Nối thật** (đã làm UI-02): `operator-job-queue` (job chờ duyệt + lỗi), `product-queue` (sản phẩm + owner). `publish-readiness-mini` đếm theo package manifest — để phase sau.
- Dữ liệu cần: số job hôm nay theo state, job `READY_FOR_OPERATOR_REVIEW`, job `FAILED` + `lastError`, product candidate, readiness count.

### 5.2 Lane / Ngách (`/channels` phần lane)
- **Plan only** (chưa tạo lane mới). Hiển thị đúng 1 lane Review sản phẩm từ lane config (mục 7 — `Lane` type).
- Dữ liệu: laneId, label, status (testing/active/paused/scaling), product categories, allowed channels, script style, CTA style, source criteria, QA rules, analytics summary, lane warning.

### 5.3 Products / Affiliate (`/products`)
- **Nối thật**: đọc product card + link registry; map vào `ProductItem`/`Product`.
- Hiển thị: name, platform (Shopee Affiliate), owner validation (`affiliate_owner_id === 'an_17376660568'` → badge valid/invalid), commission, lane fit, status, job usage, source video status.
- **Không expose URL affiliate** ra client (chống leak credential_token).

### 5.4 Video Jobs / Xưởng SX (tab mới, Phase 4)
- List job (từ registry) + detail panel 1 job nhìn A–Z: product, affiliate link, source + clean source status, vision, script, voice, BGM, caption, render, final QA, preview, approve/reject, publish readiness, error, operator notes, timeline, artifact paths (debug).
- Mỗi bước đọc từ `manifest.artifacts.*` (có/không) + `qaStatus` + `cleanlinessStatus`.

### 5.5 Channels / Accounts (`/channels` phần kênh)
- 1–2 kênh thật (plan). Hiển thị: channel name, platform, linked lane, status, posting rule, risk, published videos, view/click/CTR (mock cho tới khi có metrics), recommendation logic.
- **Không login account thật.** Account = publish target node.

### 5.6 Publish Queue / Lịch (`/publish` + `/schedule`)
- Tách rõ: `READY_FOR_OPERATOR_REVIEW → Approve → APPROVED → Publish Queue → Publish Gate → PUBLISHED`.
- Hiển thị: jobId, preview, selected channel, platform, scheduled time, publish readiness (từ `package_manifest.json` + `publish_readiness_report.md`), gate status, publish error, **dry-run/live separation**, manual confirmation requirement.
- **Approve KHÔNG đăng thật.** UI phải làm rõ điều này bằng từ ngữ + 2 bước tách biệt.

### 5.7 Analytics / Hiệu suất (`/analytics`)
- Giai đoạn đầu: Views, Clicks, CTR, Trend, Warning (**mock**, tách rõ qua mock adapter).
- Khi yếu: chỉ cảnh báo + suggested checks (hook/CTA/product fit/source quality/channel fit/publish time/lane fit). Không kết luận lane chết.
- Sau này mở rộng: orders/revenue/conversion/ROI/by-lane/by-product (đợi data thật).

---

## 6. Component Architecture

| Nhóm component | Đã có? | File | Hành động | Tab dùng |
|---|---|---|---|---|
| Shared card / stat-card | ✅ | `components/card.tsx`, `stat-card.tsx` | Giữ | tất cả |
| Status badge | ✅ | `components/badge.tsx` | Giữ + mở rộng map state thật | overview, jobs, publish |
| Lane badge | ⚠️ phần | accent trong `nav.ts` | Tách `LaneBadge` nhỏ | lane, products, jobs |
| Product card/row | ✅ inline | `overview/product-queue.tsx` | Giữ JSX, thay data | products, overview |
| Affiliate validation badge | ✅ inline | `product-queue.tsx` (`ownerId`) | Tách thành component dùng lại | products, publish, qa |
| Pipeline gate checklist | ✅ phần | `overview/operator-job-queue.tsx` (`pipeline`) | Mở rộng map artifacts thật | jobs, qa |
| Job preview card (9:16) | ✅ | `operator-job-queue.tsx` | Giữ; cắm preview thật qua route media | jobs, overview, publish |
| Job error panel | ✅ inline (`errorLog`) | `operator-job-queue.tsx` | Map `lastError` thật | jobs, overview |
| Operator action buttons | ✅ stub | `operator-job-queue.tsx` | Wire POST có guard (Phase 3) | jobs, qa |
| Channel card / suggestion | ✅ | `mini-analytics-panel.tsx`, channels page | Giữ mock tới khi có metrics | channels, overview |
| Warning panel | ✅ | `overview/attention-panel.tsx` | Mock + 1 phần thật (job FAILED) | overview, analytics |
| Analytics table | ✅ | `mini-analytics-panel.tsx` | Giữ mock (tách mock adapter) | analytics, overview |
| Publish queue row / gate panel | ✅ | `/publish` (types `PublishContent`) | Map readiness thật | publish |
| Lane config card | ❌ | — | **Tạo mới** (Phase 9) | lane |
| Empty / loading / stale-data state | ⚠️ (UI-02 thêm cho job/product) | `operator-job-queue.tsx`, `product-queue.tsx` | Mở rộng cho các tab còn lại | tất cả tab nối thật |

> Quy ước mới quan trọng: mọi tab nối thật **bắt buộc** có 3 trạng thái UI: **empty** (chưa có job), **loading** (đang fetch), **stale/error** (artifact cũ / file thiếu). UI-02 đã áp dụng cho job queue + product queue.

---

## 7. Data Model / UI Types (đề xuất)

Nguyên tắc: **mở rộng `lib/types.ts` contract**, không nhân bản type trong component. Round UI-02 tạm map vào type inline component (qua DTO ở `lib/studio-data/types.ts`), nhưng các type dưới là đích hợp nhất dần.

- **Lane**: `laneId, label, status('testing'|'active'|'paused'|'scaling'), productCategories[], allowedChannels[], scriptStyle, ctaStyle, sourceCriteria, qaRules[], analyticsSummary`.
- **Product**: `productId, name, platform, affiliateLink, affiliateOwnerId, ownerValidationStatus, commissionRate, laneFit, status('candidate'|'selected'|'used'|'paused'), relatedJobIds[]`.
- **AffiliateLink**: `linkId, platform, shortUrl, resolvedUrl(sanitized), ownerId, validationStatus, validatedAt, productId`.
- **VideoJob**: `jobId, laneId, productId, status(JobState thật), cleanlinessStatus, sourceStatus, scriptStatus, voiceStatus, bgmStatus, renderStatus, qaStatus, previewPath, error(lastError), publishReadiness, suggestedChannelId, operatorReviewStatus(operatorDecision)`.
- **PipelineGate**: `gateId, label, status('pass'|'fail'|'warn'|'pending'), artifactPath, error, updatedAt` — derive từ artifacts presence.
- **Channel**: `channelId, name, platform, laneIds[], status, postingRule, riskStatus, metrics`.
- **PublishTarget**: `targetId, jobId, channelId, platform, status, scheduledAt, gateStatus, dryRunStatus, liveStatus`.
- **Metric**: `entityType, entityId, channelId, views, clicks, ctr, trend, period` — **mock** giai đoạn này.
- **Warning**: `warningId, severity, entityType, entityId, message, suggestedChecks[], createdAt`.
- **OperatorAction**: `actionId, type, targetId, label, enabled, requiresConfirmation, reasonIfDisabled`.

**Mapping job state thật → UI badge** (single state field + sub-state từ artifacts, KHÔNG phải 12 state rời):

| Real (`manifest.state` + cờ phụ) | UI badge | Hiện preview? | Approve/Reject? | Hiện lỗi? | Publish readiness? |
|---|---|---|---|---|---|
| `WAITING_FOR_SOURCE_VIDEO` | Chờ Operator chọn nguồn | ❌ | ❌ | ❌ | ❌ |
| `SOURCE_READY` + cleanliness `NEEDS_REVIEW/UNKNOWN` | Chờ duyệt nguồn sạch (frames) | frames | ❌ (chỉ duyệt cleanliness) | ❌ | ❌ |
| `SOURCE_READY` + `WATERMARK_NOT_DETECTED` | Nguồn sạch · sẵn sàng render | ❌ | ❌ | ❌ | ❌ |
| `READY_TO_RENDER` / `RENDERING` | Đang sản xuất | ❌ | ❌ | ❌ | ❌ |
| `READY_FOR_OPERATOR_REVIEW` | **Chờ Operator duyệt** | ✅ captioned preview | ✅ (nếu QA PASS) | ❌ | một phần |
| `APPROVED` | Đã duyệt → Publish Queue | ✅ | ❌ | ❌ | ✅ |
| `PACKAGED` | Đã đóng gói, chờ publish thủ công | ✅ | ❌ | ❌ | ✅ (package manifest) |
| `REJECTED` | Đã từ chối (+ notes) | ✅ | ❌ | ❌ | ❌ |
| `FAILED` | Lỗi kỹ thuật | ❌ | ❌ | ✅ `lastError` | ❌ |
| *(PUBLISHED — chưa có state thật)* | Đã đăng (future) | — | — | — | — |

> Lưu ý thật: `SCRIPT_READY/VOICE_READY/BGM_READY/RENDERED/QA_PASS` **không phải job state riêng** — chúng được suy ra từ `manifest.artifacts.*` có/không + `qaStatus`. UI map qua **PipelineGate checklist**, không qua badge state (UI-02 đã áp dụng: downstream artifact implies upstream done).

---

## 8. Mock → Real Data Migration Plan

### 8.1 Giữ mock tạm thời (tách rõ qua mock adapter)
view/click analytics, channel performance/CTR trend, cluster summary cards, weekly activity, pipeline-overview counts tổng, scaling recommendation, multi-lane data.

### 8.2 Nối thật trước (ưu tiên)
job state + cleanliness status (registry + manifest) — **DONE UI-02**; captioned preview path — **DONE UI-02**; final QA status (đọc `finalQaReportPath`) — **DONE UI-02**; approve/reject decision (Phase 3); product card + link registry + owner validation — **DONE UI-02 (owner only, không URL)**; publish readiness (package manifest) (phase sau).

### 8.3 Đợi backend/API sau
real TikTok/Facebook analytics, real click tracking (cần redirect/tracking service), real revenue/orders, real account health.

### 8.4 Tuyệt đối KHÔNG gọi trong giai đoạn này
Facebook/TikTok live API, Shopee API trả phí / cần login, OpenAI/ElevenLabs trong UI, bất kỳ API có token/secret. UI **đọc artifact đã sinh sẵn**, không tự chạy pipeline tốn tiền.

---

## 9. Real Data Source Survey (đọc được ngay vs cần adapter)

| Nguồn | Path | Đọc ngay? | Map vào | Field thiếu |
|---|---|---|---|---|
| Job list | `data/temp/vfos_jobs_registry.json` | ✅ | VideoJob list | thiếu laneId, suggestedChannel |
| Job manifest | `data/temp/jobs/<id>/job_manifest.json` | ✅ | VideoJob detail + gates | thiếu laneId, publishReadiness tổng hợp |
| Cleanliness | `runs/<id>/source/source_cleanliness_report.json` | ✅ | cleanliness badge + frames | — |
| Download report | `runs/<id>/source/source_download_report.json` | ✅ | source status | — |
| Final QA | path trong `manifest.artifacts.finalQaReportPath` | ✅ (nếu tồn tại) | qaStatus | một số job chưa có |
| Preview | `manifest.artifacts.captionedPreviewPath` (mp4) | ✅ (serve qua media route) | preview card | binary — không commit |
| ffprobe (duration) | `runs/<id>/source/ffprobe.json` | ✅ | duration | — |
| Package | `production/archive/<id>/package_manifest.json` | ✅ (nếu PACKAGED) | publish readiness | — |
| Product card | `data/temp/jobs/<id>/product_card.json` | ✅ **chỉ owner, không URL** | Product/Affiliate | thiếu price/commission sạch |
| Link registry | `production/_commerce/shopee_link_registry.json` | ✅ **sau sanitize** | owner validation | — |
| Lane config | *(chưa có)* | ❌ | Lane | **toàn bộ** — cần tạo (Phase 9) |
| Metrics | *(chưa có)* | ❌ | Metric | **toàn bộ** — giữ mock |

**Cần adapter/loader**: ✅ — vì 3 gốc lưu trữ khác nhau (`data/temp/jobs`, `runs/`, `production/_commerce`) + cần sanitize. Module `apps/studio/src/lib/studio-data/` gom lại (UI-02).

**Tránh đọc runtime quá nặng**: chỉ đọc JSON manifest/report (nhỏ); **không** đọc/giải mã video trong loader. Liệt kê job qua **registry** (1 file), không scan đệ quy `runs/`. Preview stream qua media route hỗ trợ HTTP Range.

**Fallback khi file thiếu**: route trả `null` field + UI render **empty/stale state**, không throw.

---

## 10. Studio API / Loader Boundary (đã chốt: Next route handlers)

Đặt dưới `apps/studio/src/app/api/studio/`. **Read-only trước**, side-effect sau + guard.

| Route | Method | Phase | Side effect | Guard |
|---|---|---|---|---|
| `/api/studio/overview` | GET | 2 ✅ | read-only | — |
| `/api/studio/jobs` | GET | 2 ✅ | read-only | — |
| `/api/studio/jobs/:jobId` | GET | 2 ✅ | read-only | jobId regex |
| `/api/studio/jobs/:jobId/preview` | GET (media) | 2 ✅ | read-only stream | regex + resolveInsideRepo (chống traversal), Range |
| `/api/studio/products` | GET | 5 | read-only | **sanitize url** trước trả |
| `/api/studio/channels` | GET | 6 | read-only | — |
| `/api/studio/publish-queue` | GET | 7 | read-only | — |
| `/api/studio/analytics` | GET | 8 | read-only (mock) | đánh dấu `source:"mock"` |
| `/api/studio/jobs/:jobId/approve` | POST | 3 | **gọi `job:approve`** | state==READY_FOR_OPERATOR_REVIEW + QA PASS + confirm |
| `/api/studio/jobs/:jobId/reject` | POST | 3 | **gọi `job:reject`** | bắt buộc notes |

- **Side effect** = chỉ 2 POST approve/reject — gọi lại command thật (`scripts/vfos-job-manager.ts`), **không reimplement gate**.
- **Không có** route publish trong phase đầu.

---

## 11. Implementation Roadmap

Mỗi phase = 1 round nhỏ, commit riêng, browser review trước khi chốt.

| Phase | Mục tiêu | File/khu vực ảnh hưởng | Trạng thái |
|---|---|---|---|
| **1. Stabilize Overview** | UI-01 không rớt HTML thô khi reload; chuẩn hóa nhẹ | `app/page.tsx`, `lib/data/*` | ✅ gộp trong UI-01/UI-02 |
| **2. Wire job read-only** | route `/api/studio/*`; adapter; preview thật; analytics giữ mock | `app/api/studio/*`, `lib/studio-data/`, 3 component overview | ✅ **DONE — commit `ee19e1c`** |
| **3. Approve/Reject an toàn** | POST approve/reject gọi command thật + guard | `app/api/studio/jobs/:id/approve|reject`, action buttons | ⏭️ **Recommended next** |
| **4. Video Jobs tab** | tab workflow A–Z (list + detail) | `app/jobs/`, hợp nhất `/create /raw-visual /script /render /qa` | pending |
| **5. Products/Affiliate** | product card + link registry; owner validation; sanitize | `app/api/studio/products`, `/products` | pending |
| **6. Channels/Accounts** | 1–2 kênh; status/rule/risk; view/click (mock) | `/channels` | pending |
| **7. Publish Queue** | approved vs publish tách; gate; dry-run/live | `/publish`, `/schedule` | pending |
| **8. Analytics** | view/click/CTR + warning + suggested checks (mock adapter) | `/analytics` | pending |
| **9. Lane Pack** | lane config cho Review sản phẩm (read-only) | `lanes/review-san-pham/lane.config.json`, lane card | pending (cần Operator duyệt tạo file) |
| **10. Multi-lane cloning** | chỉ khi blueprint vững; clone bằng config, không pipeline riêng | lane config thứ 2 | pending (**chờ Operator quyết**) |

---

## 12. Safety / Guardrails

- ❌ Không live publish nếu chưa có approval/gate. ❌ Không login account thật. ❌ Không gọi API tốn tiền (FB/TikTok/Shopee paid/OpenAI/ElevenLabs) từ UI.
- ❌ Không commit runtime/video/mp3/screenshot. Binary đã gitignore — xác minh `runs/` + `data/` + `production/archive/` không bị stage.
- ❌ Không hardcode secrets/tokens/env. ✅ **Bắt buộc sanitize** product/link — UI-02 chọn không expose URL nào.
- ❌ Không sửa core pipeline (`scripts/vfos-job-manager.ts`, `packages/*`); UI **đọc artifact + gọi lại command có sẵn**, không reimplement gate.
- ❌ Không mở multi-lane sớm; ❌ không tạo pipeline riêng cho từng lane.
- ❌ Approve ≠ Publish. ❌ Không để UI ngụ ý hệ thống tự chọn video nguồn (Operator chọn).
- ❌ Không nhồi mọi chức năng vào 1 tab. ❌ Không xóa artifact/job/report. ❌ Không đổi affiliate owner/account.

---

## 13. Browser Review Protocol (sau mỗi UI round)

1. `git status` trước khi làm. 2. Kill dev server cũ nếu cần. 3. Xóa `.next` nếu nghi stale. 4. `pnpm --filter @vfos/studio dev` (sạch). 5. Mở `http://localhost:3002` đúng port. 6. Hard refresh. 7. Kiểm tra console/network. 8. Xác nhận dark dashboard, không HTML thô. 9. Soi từng section đúng mục tiêu round. 10. Screenshot/mô tả visual thật. 11. Báo cáo: URL + port + section đã kiểm + đạt/chưa đạt + screenshot + việc chuẩn hóa round sau.

---

## 14. Git Workflow

- **Trước round**: `git status`; `git log --oneline origin/master..HEAD`; xác nhận ahead/behind; đổi máy thì máy cũ commit/push, máy mới pull trước.
- **Trong round**: commit nhỏ theo scope; không trộn docs/runtime vào commit UI; không commit `.gemini/antigravity/brain`, screenshot tự sinh, video/mp3/output, `data/`, `runs/` binary, `production/_commerce` (sensitive).
- **Sau round**: typecheck → build → lint/format (biome) → browser review → báo cáo file sửa → **chỉ commit khi Operator duyệt** → push khi Operator yêu cầu/đồng bộ máy.
- Branch naming nếu tách: `feat/studio-ui-<n>-...`. Không force push master.

---

## 15. Risks / Open Questions

**Rủi ro kỹ thuật**:
- 3 gốc lưu trữ khác nhau → adapter phải hợp nhất cẩn thận; sai path → empty UI.
- `data/temp/jobs` gitignored → trên máy khác/clone sạch **không có job** → UI phải có empty state, không crash.
- `runs/` chứa binary + frames .jpg → cần xác minh gitignore để không commit nhầm.
- Sanitize sót → leak `credential_token` ra client. Phải test sanitize (UI-02: scan = 0).
- Two type layers lệch → nợ kỹ thuật nếu wire vội mà không hợp nhất dần.
- Preview là binary lớn → serve qua media route có Range, chống path traversal.

**Open questions (cần Operator chốt theo từng phase)**:
- Việc bắt buộc hỏi Operator trước: tạo lane config file (Phase 9), bất kỳ POST có side effect lần đầu, mọi thứ chạm publish.
- Khi nào nhân bản lane/kênh? → chỉ khi core blueprint chạy ổn không cần can thiệp tay lặp lại.
- Khi nào chuyển analytics view/click → orders/revenue? → khi có tracking/redirect service thật.
- Khi nào tích hợp publish thật? → sau khi Publish Queue + gate + dry-run vững (Phase 7) + Operator approval riêng.
- Channel thật đầu tiên là kênh nào? (chưa biết — cần Operator cung cấp).
- Click tracking lấy từ đâu? → chưa có; cần quyết định redirect service.
- API server riêng hay Next route handlers? → **đã chốt: Next route handlers**.

---

## 16. Recommended Next Round — **Phase 3: Approve/Reject an toàn**

Sau UI-02 (read-only), bước hợp lý kế tiếp là **wire Approve/Reject thật có guard** (Phase 3):
- POST `/api/studio/jobs/:jobId/approve` + `/reject` gọi lại command `scripts/vfos-job-manager.ts` (`job:approve` / `job:reject`), **không reimplement gate**.
- Approve chỉ khi `state === READY_FOR_OPERATOR_REVIEW` + final QA PASS (đọc `finalQaReportPath`) + xác nhận rõ.
- Reject **bắt buộc notes**.
- **Không publish thật.** Approve chỉ chuyển state → đẩy vào Publish Queue (gate riêng sau).
- Nút Approve/Reject (hiện disabled placeholder ở UI-02) sẽ được kích hoạt + confirm dialog.

> Chưa làm nếu Operator chưa ra lệnh.

---

## 17. Lịch sử thực thi

| Round | Commit | Nội dung |
|---|---|---|
| UI Strategy 01 | `dc07090` | Operator Overview Dashboard cho lane Review sản phẩm (UI shell, mock data) |
| UI Strategy 02 | `ee19e1c` | Wire Operator Dashboard với job thật read-only qua `/api/studio/*` (adapter + 4 GET route + preview media; analytics giữ mock; không side effect, không approve/reject thật, không publish) |
