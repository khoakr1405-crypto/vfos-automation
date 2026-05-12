---
name: shop-amazon
description: Tìm sản phẩm Amazon, lấy link affiliate, kiểm tra giá / rating / review count, tổng hợp ra báo cáo so sánh. Kích hoạt khi user gõ /shop-amazon hoặc yêu cầu "tìm sản phẩm Amazon X", "so sánh tai nghe trên Amazon", "lấy link affiliate cho X".
---

# Skill: Shop Amazon (Affiliate)

## Mục tiêu

Tự động hóa workflow tra cứu sản phẩm Amazon + generate link affiliate + xuất báo cáo so sánh.

## Workflow

### 1. Parse yêu cầu

Input thường có dạng:
- "Tìm cho tôi <category> dưới $<price>"
- "So sánh top <N> sản phẩm <keyword>"
- "Lấy link affiliate cho ASIN <code>"

Trích xuất: `keyword`, `price_range`, `min_rating`, `top_n`, `asin_list`.

### 2. Search

- Dùng Amazon Product Advertising API (PA-API 5) nếu có credentials trong `.env`.
- Fallback: WebFetch trang search `https://www.amazon.com/s?k=<keyword>`.
- Lọc theo `price_range` và `min_rating` (default ≥ 4.0 sao, ≥ 100 reviews).

### 3. Generate affiliate link

Pattern: `https://www.amazon.com/dp/<ASIN>/?tag=<AFFILIATE_TAG>`

- `AFFILIATE_TAG` lấy từ `.env` (key: `AMAZON_AFFILIATE_TAG`)
- Validate ASIN format: `^[A-Z0-9]{10}$`

### 4. Output report

```markdown
## Top <N> sản phẩm: <keyword>

| # | Tên | Giá | Rating | Reviews | Link |
|---|---|---|---|---|---|
| 1 | ... | $... | 4.7★ | 2,143 | [Buy](aff-url) |
```

## Rules

- **Không bịa ASIN hoặc giá.** Nếu không fetch được, báo lỗi rõ ràng, không invent.
- **Disclose affiliate** — khi xuất report cho end-user, thêm dòng: `_(Links contain affiliate tag)_`.
- **Rate limit** — PA-API có quota; nếu hit limit, fallback sang WebFetch và báo user.
- **Tuân thủ Amazon ToS** — không scrape ồ ạt, respect `robots.txt`.

## Required env vars

```
AMAZON_AFFILIATE_TAG=yourtag-20
AMAZON_ACCESS_KEY=...      # optional, only for PA-API
AMAZON_SECRET_KEY=...      # optional
AMAZON_HOST=webservices.amazon.com
AMAZON_REGION=us-east-1
```
