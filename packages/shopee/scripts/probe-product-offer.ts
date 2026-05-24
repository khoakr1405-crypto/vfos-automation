#!/usr/bin/env tsx
/**
 * VFOS Shopee — Product Offer Probe (one-shot)
 *
 * Probes `https://affiliate.shopee.vn/offer/product_offer` with the existing
 * cookie at .secrets/shopee_cookie.txt and reports:
 *   - HTTP status + content type + body size
 *   - Whether response is HTML SPA shell or JSON/data
 *   - If HTML: extract any embedded JSON state (eg __NEXT_DATA__, __INITIAL_STATE__)
 *   - If HTML: list any XHR endpoint URLs referenced in script tags
 *   - If JSON: dump top-level keys + first data sample (redacted)
 *
 * Does NOT write artifacts. stdout only. NEVER prints cookie/header.
 *
 * Usage:
 *   pnpm exec tsx packages/shopee/scripts/probe-product-offer.ts
 */

import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { redactSecrets, isSecretFree } from "../src/secret-redaction.js";

const ROOT = resolve(import.meta.dirname ?? ".", "..", "..", "..");
const COOKIE_PATH = resolve(ROOT, ".secrets", "shopee_cookie.txt");
const TARGET_URL = "https://affiliate.shopee.vn/offer/product_offer";

function loadCookie(): string {
  if (!existsSync(COOKIE_PATH)) {
    console.error(`❌ Cookie file missing: ${COOKIE_PATH}`);
    console.error("   → Run cookie setup first (see packages/shopee/README.md)");
    process.exit(1);
  }
  const raw = readFileSync(COOKIE_PATH, "utf-8").trim();
  if (raw.length === 0) {
    console.error("❌ Cookie file is empty.");
    process.exit(1);
  }
  return raw;
}

function safeHeaderSummary(headers: Headers): string {
  // Print only safe response headers — never request headers
  const safe: string[] = [];
  for (const key of ["content-type", "content-length", "x-frame-options", "cache-control"]) {
    const v = headers.get(key);
    if (v) safe.push(`${key}: ${v}`);
  }
  const setCookieCount = [...headers.entries()].filter(([k]) => k.toLowerCase() === "set-cookie").length;
  if (setCookieCount > 0) safe.push(`set-cookie: [REDACTED, ${setCookieCount} cookie(s)]`);
  return safe.join(" | ");
}

/**
 * Find embedded JSON state in HTML. Common patterns:
 *   <script id="__NEXT_DATA__" type="application/json">{...}</script>
 *   window.__INITIAL_STATE__ = {...};
 *   window.__PRELOADED_STATE__ = {...};
 */
function extractEmbeddedJson(html: string): Array<{ pattern: string; size: number; topKeys: string[] }> {
  const results: Array<{ pattern: string; size: number; topKeys: string[] }> = [];

  const patterns: Array<{ name: string; re: RegExp }> = [
    {
      name: '<script id="__NEXT_DATA__">',
      re: /<script[^>]*id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    },
    {
      name: "window.__INITIAL_STATE__",
      re: /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});\s*(?:<\/script>|window\.)/,
    },
    {
      name: "window.__PRELOADED_STATE__",
      re: /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});\s*(?:<\/script>|window\.)/,
    },
    {
      name: 'window.__APOLLO_STATE__',
      re: /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});\s*(?:<\/script>|window\.)/,
    },
  ];

  for (const p of patterns) {
    const m = html.match(p.re);
    if (m?.[1]) {
      const raw = m[1].trim();
      try {
        const parsed = JSON.parse(raw);
        const topKeys = parsed && typeof parsed === "object" ? Object.keys(parsed).slice(0, 20) : [];
        results.push({ pattern: p.name, size: raw.length, topKeys });
      } catch {
        results.push({ pattern: p.name, size: raw.length, topKeys: ["(JSON parse failed)"] });
      }
    }
  }

  return results;
}

/**
 * Extract any `/api/...` or `/marketing-services/...` URL references from HTML.
 * Returns unique sorted list of API path candidates.
 */
function extractApiReferences(html: string): string[] {
  const apiPathRe = /["'`](\/(?:api|marketing-services)\/[a-zA-Z0-9_\/.\-]+)["'`]/g;
  const found = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = apiPathRe.exec(html)) !== null) {
    if (m[1]) found.add(m[1]);
  }
  return [...found].sort();
}

async function main(): Promise<void> {
  console.log("┌──────────────────────────────────────────────────────────┐");
  console.log("│  VFOS Shopee — Product Offer Probe                       │");
  console.log("└──────────────────────────────────────────────────────────┘");
  console.log();

  const cookie = loadCookie();
  console.log(`📁 Cookie length: ${cookie.length} chars (value never printed)`);
  console.log(`🎯 Target: ${TARGET_URL}`);
  console.log();

  const response = await fetch(TARGET_URL, {
    method: "GET",
    headers: {
      Cookie: cookie,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "vi-VN,vi;q=0.9,en;q=0.8",
    },
    redirect: "manual",
  });

  console.log(`📡 Status: ${response.status} ${response.statusText}`);
  console.log(`   Headers (safe): ${safeHeaderSummary(response.headers)}`);

  if (response.status >= 300 && response.status < 400) {
    const loc = response.headers.get("location");
    console.log(`   ⚠️  Redirect → ${loc}`);
    if (loc?.includes("/login")) {
      console.log("   → Cookie expired/invalid. Refresh .secrets/shopee_cookie.txt.");
    }
    return;
  }

  const body = await response.text();
  const ctype = response.headers.get("content-type") ?? "";

  console.log(`   Body size: ${body.length} chars`);
  console.log();

  if (ctype.includes("json") || body.trimStart().startsWith("{")) {
    console.log("📦 Response is JSON.");
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      console.log(`   Top-level keys: ${Object.keys(parsed).join(", ")}`);
      const data = parsed["data"];
      if (data && typeof data === "object") {
        console.log(`   data keys: ${Object.keys(data as Record<string, unknown>).join(", ")}`);
      }
      // Print first 600 chars of body, redacted
      const sample = redactSecrets(body.slice(0, 600));
      console.log(`   Sample (redacted): ${sample}`);
    } catch (err) {
      console.log(`   ⚠️  JSON parse failed: ${err instanceof Error ? err.message : String(err)}`);
    }
    return;
  }

  if (ctype.includes("html") || body.trimStart().startsWith("<")) {
    console.log("📄 Response is HTML.");
    const isLogin =
      body.includes("/login") &&
      (body.includes("đăng nhập") || body.includes("Sign in") || body.includes("Đăng nhập"));
    if (isLogin) {
      console.log("   ⚠️  Looks like a login wall. Cookie may be expired.");
    }

    // Embedded JSON state
    const embedded = extractEmbeddedJson(body);
    if (embedded.length > 0) {
      console.log();
      console.log("   🔍 Embedded JSON state found:");
      for (const e of embedded) {
        console.log(`      • ${e.pattern}  size=${e.size}  top keys: ${e.topKeys.slice(0, 10).join(", ")}`);
      }
    } else {
      console.log("   No embedded JSON state (likely SPA shell — data loaded via XHR after page render).");
    }

    // API path references inside scripts
    const apiRefs = extractApiReferences(body);
    if (apiRefs.length > 0) {
      console.log();
      console.log(`   🔍 ${apiRefs.length} API path references in HTML (deduped):`);
      // Filter to interesting product/offer/recommend paths
      const interesting = apiRefs.filter((p) =>
        /(product|offer|recommend|search|item|shop)/i.test(p),
      );
      const others = apiRefs.filter((p) => !interesting.includes(p));
      if (interesting.length > 0) {
        console.log(`      Interesting (product/offer/recommend/search/item):`);
        for (const p of interesting.slice(0, 30)) console.log(`        ${p}`);
      }
      if (others.length > 0) {
        console.log(`      Other (${others.length} more): ${others.slice(0, 10).join(", ")}${others.length > 10 ? " ..." : ""}`);
      }
    }

    // Body sample (start of <body> if findable, else first 600 chars)
    const bodyTagIdx = body.indexOf("<body");
    const sampleStart = bodyTagIdx >= 0 ? bodyTagIdx : 0;
    const sample = redactSecrets(body.slice(sampleStart, sampleStart + 400));
    console.log();
    console.log(`   Body sample (redacted, 400 chars):`);
    console.log(`     ${sample.replace(/\n/g, " ")}`);
    return;
  }

  console.log(`📦 Unknown content type: ${ctype}`);
  const sample = redactSecrets(body.slice(0, 400));
  console.log(`   Sample (redacted): ${sample}`);
}

main().catch((err: unknown) => {
  console.error("❌ Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
});
