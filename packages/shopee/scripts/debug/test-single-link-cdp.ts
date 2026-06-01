#!/usr/bin/env tsx
/**
 * Round 26 single-link CDP extraction test (scratch — keep untracked).
 *
 * Wired into link-registry.ts module (lock + atomic write + dedup).
 * Default target_count=1, max_clicks=5 safety ceiling.
 *
 * Stop conditions:
 *   - 1 new valid link extracted + upserted → STOP
 *   - max_clicks_per_batch hit → SUSPENDED
 *   - exhausted visible products → SUSPENDED
 */

import { chromium } from "playwright";
import { resolve } from "node:path";
import { validateShopeeAffiliateLink } from "../../src/extract.js";
import { upsertEntry, appendRejected, isDuplicate, type LinkRegistryConfig } from "../../src/link-registry.js";

const TARGET_COUNT = 1;
const MAX_CLICKS = 5;
const EXPECTED_OWNER = "an_17376660568";

const REGISTRY_PATH = resolve(
  import.meta.dirname ?? ".",
  "..", "..", "..", "..",
  "production", "_commerce", "shopee_link_registry.json",
);

const CONFIG: LinkRegistryConfig = {
  registry_path: REGISTRY_PATH,
  expected_owner_id: EXPECTED_OWNER,
  lock_timeout_ms: 5000,
  lock_retry_ms: 100,
  stale_lock_ms: 60_000,
};

async function resolveShortLink(shortUrl: string): Promise<string | null> {
  try {
    const head = await fetch(shortUrl, {
      method: "HEAD",
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
      },
    });
    const loc = head.headers.get("location");
    if (loc) return loc;
    const get = await fetch(shortUrl, { method: "GET" });
    return get.url;
  } catch (e) {
    console.error(`Resolve fail: ${(e as Error).message}`);
    return null;
  }
}

function extractShopidItemid(canonical: string): { shopid: string | null; itemid: string | null } {
  try {
    const u = new URL(canonical);
    const m1 = u.pathname.match(/\/[^/]+\/(\d+)\/(\d+)/);
    if (m1) return { shopid: m1[1], itemid: m1[2] };
    const m2 = u.pathname.match(/\/(?:opaanlp|product|universal-link\/product)\/(\d+)\/(\d+)/);
    if (m2) return { shopid: m2[1], itemid: m2[2] };
  } catch {}
  return { shopid: null, itemid: null };
}

async function main() {
  console.log("=== Round 26 single-link CDP test ===");
  console.log(`Registry: ${REGISTRY_PATH}`);
  console.log(`target_count=${TARGET_COUNT}, max_clicks=${MAX_CLICKS}`);

  const browser = await chromium.connectOverCDP("http://127.0.0.1:9222");
  const contexts = browser.contexts();
  let page = null;
  for (const ctx of contexts) {
    for (const p of ctx.pages()) {
      if (p.url().includes("affiliate.shopee.vn/offer/product_offer")) {
        page = p;
        break;
      }
    }
    if (page) break;
  }
  if (!page) {
    console.error("ERR_CDP_TARGET_TAB_NOT_FOUND");
    await browser.close();
    process.exit(2);
  }
  console.log(`Tab: ${page.url()}`);

  // List visible product cards (text + idx of "Lấy link" button)
  const products = await page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll("*")).filter((el) => {
      const t = (el.textContent || "").trim();
      return (t === "Lấy link" || t === "Get link") && el.children.length === 0;
    });
    return buttons.slice(0, 10).map((btn, idx) => {
      let card: Element | null = btn;
      for (let i = 0; i < 12 && card; i++) {
        const txt = (card.textContent || "").trim();
        if (txt.length > 30 && txt.length < 400) break;
        card = card.parentElement;
      }
      const name = ((card?.textContent || "").trim().match(/^[^₫]+/)?.[0] || "").trim().slice(0, 120);
      return { idx, name };
    });
  });

  console.log(`\nVisible products: ${products.length}`);
  for (const p of products) console.log(`  [${p.idx}] ${p.name.slice(0, 80)}`);

  let extracted = 0;
  let clicks = 0;
  let lastStatus: "SUCCESS" | "SUSPENDED" | "FAIL" = "FAIL";
  let lastReason = "";

  for (const product of products) {
    if (extracted >= TARGET_COUNT) {
      console.log(`\n>>> target_count=${TARGET_COUNT} reached. STOP.`);
      lastStatus = "SUCCESS";
      break;
    }
    if (clicks >= MAX_CLICKS) {
      console.log(`\n>>> max_clicks=${MAX_CLICKS} hit. STOP.`);
      lastStatus = "SUSPENDED";
      lastReason = "reached max_clicks_per_batch without target_count";
      break;
    }

    // Pre-click dedup by product_name (no shopid yet)
    if (isDuplicate(REGISTRY_PATH, EXPECTED_OWNER, { product_name: product.name })) {
      console.log(`\n[${product.idx}] SKIPPED_DUPLICATE (name match) — ${product.name.slice(0, 50)}`);
      continue;
    }

    console.log(`\n[${product.idx}] Clicking "Lấy link" — ${product.name.slice(0, 50)}…`);
    clicks++;

    const clicked = await page.evaluate((idx) => {
      const btns = Array.from(document.querySelectorAll("*")).filter((el) => {
        const t = (el.textContent || "").trim();
        return (t === "Lấy link" || t === "Get link") && el.children.length === 0;
      });
      const b = btns[idx] as HTMLElement | undefined;
      if (!b) return false;
      b.click();
      return true;
    }, product.idx);
    if (!clicked) {
      console.error(`  ERR_LINK_BUTTON_NOT_FOUND for idx ${product.idx}`);
      continue;
    }

    await page.waitForTimeout(2500);

    const shortLink = await page.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll("input, textarea")) as (HTMLInputElement | HTMLTextAreaElement)[];
      for (const i of inputs) {
        if (i.value && /^https?:\/\/(s\.)?shopee\.vn\//.test(i.value)) return i.value;
      }
      return null;
    });

    await page.keyboard.press("Escape");
    await page.waitForTimeout(800);

    if (!shortLink) {
      console.error("  ERR_MODAL_UNRECOGNIZED");
      continue;
    }
    console.log(`  short_link: ${shortLink}`);

    // Post-resolve dedup
    const canonical = await resolveShortLink(shortLink);
    console.log(`  canonical: ${canonical ?? "(resolve failed)"}`);

    const { shopid, itemid } = canonical ? extractShopidItemid(canonical) : { shopid: null, itemid: null };
    console.log(`  shopid/itemid: ${shopid}/${itemid}`);

    if (shopid && itemid && isDuplicate(REGISTRY_PATH, EXPECTED_OWNER, { shopid, itemid })) {
      console.log("  POST-RESOLVE DUPLICATE — skip, try next");
      continue;
    }

    const validation = validateShopeeAffiliateLink(canonical ?? shortLink);
    console.log(`  validation: ${validation.status} — ${validation.notes}`);

    // Round 3C policy: short link không có gads_t_sig → NEEDS_USER_REVIEW.
    // Vẫn upsert vào registry (đây là entry hợp lệ — operator wrap link sau ở Shopee Affiliate dashboard).
    // Owner mismatch → appendRejected. Validation FAILED → appendRejected.
    if (validation.status === "FAILED") {
      await appendRejected(CONFIG, {
        short_link: shortLink,
        canonical_url: canonical,
        reason_code: "ERR_AFFILIATE_OWNER_MISMATCH",
        notes: validation.notes,
      });
      console.log("  appendRejected (validation FAILED)");
      continue;
    }

    const upsert = await upsertEntry(CONFIG, {
      product_name: product.name,
      shopid,
      itemid,
      short_link: shortLink,
      canonical_url: canonical,
      affiliate_owner_id: validation.status === "VERIFIED_FROM_LONG_LINK" ? EXPECTED_OWNER : null,
      affiliate_link_status: validation.status,
      source: "cdp_browser_targeted_click",
      notes: `Round 26 single-link test — ${validation.notes}`,
    });

    console.log(`  upsert: inserted=${upsert.inserted} duplicate=${upsert.duplicate} times_seen=${upsert.entry.times_seen}`);

    if (upsert.inserted) {
      extracted++;
      console.log(`  ✓ NEW LINK extracted (${extracted}/${TARGET_COUNT})`);
    } else if (upsert.duplicate) {
      console.log("  duplicate counted, try next");
    }
  }

  if (extracted >= TARGET_COUNT) {
    lastStatus = "SUCCESS";
  } else if (lastStatus === "FAIL" && clicks === 0) {
    lastStatus = "SUSPENDED";
    lastReason = "exhausted visible products";
  } else if (lastStatus === "FAIL") {
    lastStatus = "SUSPENDED";
    lastReason = "exhausted visible products without target_count";
  }

  console.log(`\n=== RESULT ===`);
  console.log(`status: ${lastStatus}`);
  console.log(`extracted: ${extracted}/${TARGET_COUNT}`);
  console.log(`clicks: ${clicks}/${MAX_CLICKS}`);
  if (lastReason) console.log(`reason: ${lastReason}`);
  console.log(`registry: ${REGISTRY_PATH}`);

  await browser.close();
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
