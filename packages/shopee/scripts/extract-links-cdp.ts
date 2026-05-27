#!/usr/bin/env tsx
/// <reference lib="dom" />
/**
 * Shopee CDP Production Extraction CLI (Round 27).
 *
 * Replaces the 6+ POC scratch scripts (`click-and-extract-links.ts`,
 * `cdp-extract.ts`, `get-one-link.ts`, etc.) with a single hardened CLI that
 * implements the Round 26B BROWSER_CDP_TARGETED_CLICK flow + Link Registry.
 *
 *   pnpm shopee:extract-links-cdp [--target-count=N] [--max-clicks=N] [--dry-run] [...]
 *
 * Default behaviour (HARD):
 *   - target_count = 1   — stop as soon as 1 NEW valid link is extracted.
 *   - max_clicks   = 5   — safety ceiling. NOT a goal. Triggered only when
 *                          duplicates force the loop to try the next product.
 *   - Batch mode (>1)    — ONLY when operator passes --target-count=N explicitly.
 *
 * Anti-stale-index (HARD):
 *   - DOM is re-queried fresh at the top of every iteration.
 *   - Index `n` passed to click is valid for THIS single click only.
 *   - After any click/modal/fail, the next loop iteration starts a new query.
 *
 * Modal handling (HARD):
 *   - After every click, verify the modal contains a Shopee URL.
 *   - Failure → appendRejected(reason_code=ERR_MODAL_UNRECOGNIZED), close
 *     modal (Escape), re-query DOM next iteration. Never cascade.
 *
 * Registry (HARD):
 *   - All writes go through `link-registry.ts` (file lock + atomic write).
 *   - Pre-click dedup via shouldSkipPreClick (best-effort, may use product_name).
 *   - Post-resolve dedup via shopid+itemid + canonical_url (mandatory).
 *   - Registry JSON at production/_commerce/shopee_link_registry.json is a
 *     RUNTIME ARTIFACT — never committed.
 *
 * Scope guard (HARD):
 *   - Never click setting/account/security/logout/payment/publish buttons.
 *   - Never random-click or coordinate-click.
 *   - Never auto-login / never input OTP / never read or log cookies/tokens.
 *   - Never call Facebook / Shopee private APIs / HAR endpoints.
 */

import { parseArgs } from "node:util";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Browser, Page } from "playwright";

import {
  upsertEntry,
  appendRejected,
  type LinkRegistryConfig,
} from "../src/link-registry.js";
import {
  classifyResolvedLink,
  extractShopidItemid,
  parseCliValues,
  resolveShortLink,
  shouldSkipPreClick,
  type ParsedCliArgs,
} from "../src/cdp-extract-helpers.js";

// ── workspace + env ─────────────────────────────────────────────────────────

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function loadEnv(rootDir: string): void {
  const envPath = join(rootDir, ".env");
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, "utf8");
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = val;
  }
}

const HELP_TEXT = `Shopee CDP Production Extraction CLI (Round 27)

Usage:
  pnpm shopee:extract-links-cdp [options]

Options:
  --target-count=N      New valid links to extract before stopping  (default 1)
  --max-clicks=N        Safety ceiling — never click more than this (default 5)
  --owner-id=an_<id>    Expected affiliate owner id                 (env SHOPEE_AFFILIATE_OWNER_ID)
  --registry-path=PATH  Registry JSON path                          (default production/_commerce/shopee_link_registry.json)
  --cdp-endpoint=URL    CDP endpoint                                (default http://127.0.0.1:9222)
  --cdp-retries=N       CDP connect retry count                     (default 3)
  --dry-run             Log actions only — never write to registry
  --help                Show this help and exit

Default mode is SINGLE-LINK: stop as soon as 1 new valid link is captured.
Batch mode (target_count > 1) only activates with an explicit --target-count flag.

Pre-requisites (one-time, operator):
  1. Launch Cốc Cốc/Chrome with --remote-debugging-port=9222
  2. Manually log in to Shopee Affiliate
  3. Open https://affiliate.shopee.vn/offer/product_offer in the logged-in browser
`;

// ── DOM helpers (run inside page.evaluate context) ──────────────────────────
//
// All DOM helpers below are passed to page.evaluate() — they execute in the
// browser, not Node. They MUST be self-contained (no closures over Node-side
// variables) and MUST NOT reference cookies, localStorage, or auth headers.

interface ProductCard {
  index: number;
  name: string;
  href: string | null;
}

async function discoverProductCards(page: Page): Promise<ProductCard[]> {
  return page.evaluate(() => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const t = (el.textContent ?? "").trim();
      return (t === "Lấy link" || t === "Get link") && el.children.length === 0;
    });

    return buttons.slice(0, 20).map((btn, idx) => {
      let card: Element | null = btn;
      for (let i = 0; i < 12 && card; i++) {
        const txt = (card.textContent ?? "").trim();
        if (txt.length > 30 && txt.length < 400) break;
        card = card.parentElement;
      }
      const rawText = (card?.textContent ?? "").trim();
      const name = (rawText.match(/^[^₫]+/)?.[0] ?? "").trim().slice(0, 120);

      let href: string | null = null;
      const a = card?.querySelector<HTMLAnchorElement>(
        'a[href*="shopee.vn/"][href*="-i."], a[href*="shopee.vn/product/"]',
      );
      if (a?.href) href = a.href;

      return { index: idx, name, href };
    });
  });
}

async function clickGetLinkButton(page: Page, n: number): Promise<boolean> {
  return page.evaluate((idx: number) => {
    const buttons = Array.from(document.querySelectorAll<HTMLElement>("*")).filter((el) => {
      const t = (el.textContent ?? "").trim();
      return (t === "Lấy link" || t === "Get link") && el.children.length === 0;
    });
    const b = buttons[idx];
    if (!b) return false;
    b.click();
    return true;
  }, n);
}

async function extractShortLinkFromModal(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const SHOPEE_RE = /^https?:\/\/(s\.)?shopee\.vn\//;
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"),
    );
    for (const i of inputs) {
      if (i.value && SHOPEE_RE.test(i.value)) return i.value;
    }
    return null;
  });
}

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);
}

// ── main ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

async function main(): Promise<number> {
  const rawArgs = parseArgs({
    options: {
      "target-count": { type: "string" },
      "max-clicks": { type: "string" },
      "owner-id": { type: "string" },
      "registry-path": { type: "string" },
      "cdp-endpoint": { type: "string" },
      "cdp-retries": { type: "string" },
      "dry-run": { type: "boolean", default: false },
      help: { type: "boolean", default: false },
    },
    allowPositionals: false,
    strict: true,
  });

  if (rawArgs.values.help) {
    process.stdout.write(HELP_TEXT);
    return 0;
  }

  const workspaceRoot = findWorkspaceRoot(process.cwd());
  loadEnv(workspaceRoot);

  let cli: ParsedCliArgs;
  try {
    cli = parseCliValues(rawArgs.values, {
      owner: process.env["SHOPEE_AFFILIATE_OWNER_ID"] ?? "an_17376660568",
      registry_path: resolve(workspaceRoot, "production", "_commerce", "shopee_link_registry.json"),
    });
  } catch (e) {
    process.stderr.write(`ERR_INVALID_ARGS: ${(e as Error).message}\n`);
    return 2;
  }

  const registryConfig: LinkRegistryConfig = {
    registry_path: cli.registry_path,
    expected_owner_id: cli.expected_owner,
    lock_timeout_ms: 5000,
    lock_retry_ms: 100,
    stale_lock_ms: 60_000,
  };
  if (!existsSync(dirname(registryConfig.registry_path))) {
    mkdirSync(dirname(registryConfig.registry_path), { recursive: true });
  }

  process.stdout.write("=== Shopee CDP Extraction (Round 27) ===\n");
  process.stdout.write(`  target_count : ${cli.target_count}\n`);
  process.stdout.write(`  max_clicks   : ${cli.max_clicks} (safety ceiling)\n`);
  process.stdout.write(`  owner_id     : ${cli.expected_owner}\n`);
  process.stdout.write(`  registry     : ${cli.registry_path}\n`);
  process.stdout.write(`  cdp_endpoint : ${cli.cdp_endpoint}\n`);
  process.stdout.write(`  cdp_retries  : ${cli.cdp_retries}\n`);
  process.stdout.write(`  dry_run      : ${cli.dry_run}\n\n`);

  // ── CDP connect ───────────────────────────────────────────────────────────

  let chromium: typeof import("playwright").chromium;
  try {
    chromium = (await import("playwright")).chromium;
  } catch {
    process.stderr.write("ERR_PLAYWRIGHT_NOT_INSTALLED\n  Install with: pnpm add -D playwright\n");
    return 2;
  }

  let browser: Browser | null = null;
  for (let attempt = 1; attempt <= cli.cdp_retries; attempt++) {
    try {
      process.stdout.write(`  CDP connect attempt ${attempt}/${cli.cdp_retries}…\n`);
      browser = await chromium.connectOverCDP(cli.cdp_endpoint);
      process.stdout.write("  CDP connected.\n");
      break;
    } catch (e) {
      process.stderr.write(`  CDP connect failed: ${(e as Error).message.slice(0, 100)}\n`);
      if (attempt === cli.cdp_retries) {
        process.stderr.write(
          "ERR_CDP_BROWSER_NOT_FOUND\n  Ensure Cốc Cốc/Chrome is running with --remote-debugging-port=9222.\n",
        );
        return 2;
      }
      await sleep(2000);
    }
  }

  if (!browser) return 2;

  // ── locate target tab ─────────────────────────────────────────────────────

  let page: Page | null = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      if (p.url().includes("affiliate.shopee.vn/offer/product_offer")) {
        page = p;
        break;
      }
    }
    if (page) break;
  }
  if (!page) {
    process.stderr.write(
      "ERR_CDP_TARGET_TAB_NOT_FOUND\n  Open https://affiliate.shopee.vn/offer/product_offer in the logged-in browser.\n",
    );
    await browser.close();
    return 2;
  }
  process.stdout.write(`  Target tab: ${page.url().slice(0, 80)}\n\n`);

  // ── extraction loop ───────────────────────────────────────────────────────

  let extracted = 0;
  let clicks = 0;
  let consecutivePostResolveDuplicates = 0;
  const attemptedNames = new Set<string>();
  let finalStatus: "SUCCESS" | "SUSPENDED" | "FAIL" = "FAIL";
  let finalReason = "";

  while (extracted < cli.target_count && clicks < cli.max_clicks) {
    process.stdout.write(
      `── iter (extracted=${extracted}/${cli.target_count}, clicks=${clicks}/${cli.max_clicks}) ──\n`,
    );

    const cards = await discoverProductCards(page);
    process.stdout.write(`  visible cards: ${cards.length}\n`);
    if (cards.length === 0) {
      finalStatus = "SUSPENDED";
      finalReason = "no visible product cards";
      break;
    }

    let target: ProductCard | null = null;
    for (const card of cards) {
      if (attemptedNames.has(card.name)) continue;

      const probeIds = card.href ? extractShopidItemid(card.href) : { shopid: null, itemid: null };
      const probe = {
        product_name: card.name,
        canonical_url: card.href,
        shopid: probeIds.shopid,
        itemid: probeIds.itemid,
      };
      const dedup = shouldSkipPreClick(cli.registry_path, cli.expected_owner, probe);
      if (dedup.skip) {
        process.stdout.write(
          `  [${card.index}] SKIPPED_DUPLICATE (${dedup.match_field}) — ${card.name.slice(0, 60)}\n`,
        );
        attemptedNames.add(card.name);
        continue;
      }
      target = card;
      break;
    }
    if (!target) {
      finalStatus = "SUSPENDED";
      finalReason = "all visible cards exhausted (attempted or pre-click duplicates)";
      break;
    }

    process.stdout.write(`  [${target.index}] click "Lấy link" — ${target.name.slice(0, 60)}\n`);
    attemptedNames.add(target.name);
    clicks++;

    const clicked = await clickGetLinkButton(page, target.index);
    if (!clicked) {
      process.stderr.write(`  ERR_LINK_BUTTON_NOT_FOUND for index ${target.index}\n`);
      continue;
    }

    await page.waitForTimeout(2500);

    const shortLink = await extractShortLinkFromModal(page);

    if (!shortLink) {
      process.stderr.write("  ERR_MODAL_UNRECOGNIZED — no Shopee URL in modal\n");
      if (cli.dry_run) {
        process.stdout.write("  [dry-run] would appendRejected ERR_MODAL_UNRECOGNIZED\n");
      } else {
        await appendRejected(registryConfig, {
          short_link: null,
          canonical_url: null,
          reason_code: "ERR_MODAL_UNRECOGNIZED",
          notes: `modal missing Shopee URL for: ${target.name.slice(0, 80)}`,
        });
        process.stdout.write("  appendRejected (ERR_MODAL_UNRECOGNIZED)\n");
      }
      await closeModal(page);
      continue;
    }

    process.stdout.write(`  short_link: ${shortLink}\n`);
    await closeModal(page);

    const canonical = await resolveShortLink(shortLink, fetch);
    process.stdout.write(`  canonical : ${canonical ?? "(resolve failed)"}\n`);

    const { shopid, itemid } = extractShopidItemid(canonical);
    process.stdout.write(`  ids       : ${shopid ?? "null"} / ${itemid ?? "null"}\n`);

    const postProbe = {
      shopid,
      itemid,
      canonical_url: canonical,
      short_link: shortLink,
      product_name: target.name,
    };
    const postDedup = shouldSkipPreClick(cli.registry_path, cli.expected_owner, postProbe);
    if (postDedup.skip) {
      process.stdout.write(`  POST-RESOLVE DUPLICATE (${postDedup.match_field}) — try next\n`);
      consecutivePostResolveDuplicates++;
      if (consecutivePostResolveDuplicates >= 3) {
        finalStatus = "SUSPENDED";
        finalReason = "3 consecutive post-resolve duplicates";
        break;
      }
      continue;
    }
    consecutivePostResolveDuplicates = 0;

    const outcome = classifyResolvedLink(canonical, cli.expected_owner);
    process.stdout.write(`  validation: ${outcome.kind} — ${outcome.notes}\n`);

    if (outcome.kind === "REJECT") {
      if (cli.dry_run) {
        process.stdout.write(`  [dry-run] would appendRejected ${outcome.reason_code}\n`);
      } else {
        await appendRejected(registryConfig, {
          short_link: shortLink,
          canonical_url: canonical,
          reason_code: outcome.reason_code,
          notes: outcome.notes,
        });
        process.stdout.write(`  appendRejected (${outcome.reason_code})\n`);
      }
      continue;
    }

    const linkStatus = outcome.status;
    const verifiedOwner = outcome.kind === "ACCEPT" ? cli.expected_owner : null;

    if (cli.dry_run) {
      process.stdout.write(
        `  [dry-run] would upsert ${target.name.slice(0, 50)} (${linkStatus})\n`,
      );
      extracted++;
      process.stdout.write(`  ✓ [dry-run] counted (${extracted}/${cli.target_count})\n`);
      continue;
    }

    const upsert = await upsertEntry(registryConfig, {
      product_name: target.name,
      shopid,
      itemid,
      short_link: shortLink,
      canonical_url: canonical,
      affiliate_owner_id: verifiedOwner,
      affiliate_link_status: linkStatus,
      source: "cdp_browser_targeted_click",
      notes: `round_27 cli — ${outcome.notes}`,
    });
    process.stdout.write(
      `  upsert: inserted=${upsert.inserted} duplicate=${upsert.duplicate} times_seen=${upsert.entry.times_seen}\n`,
    );
    if (upsert.inserted) {
      extracted++;
      process.stdout.write(`  ✓ NEW LINK (${extracted}/${cli.target_count})\n`);
    } else {
      process.stdout.write("  duplicate (race with concurrent writer) — try next\n");
    }
  }

  if (extracted >= cli.target_count) {
    finalStatus = "SUCCESS";
  } else if (finalStatus === "FAIL") {
    if (clicks === 0) {
      finalStatus = "SUSPENDED";
      finalReason = "no clickable products";
    } else if (clicks >= cli.max_clicks) {
      finalStatus = "SUSPENDED";
      finalReason = `reached max_clicks=${cli.max_clicks} without reaching target_count`;
    } else {
      finalStatus = "SUSPENDED";
      finalReason = finalReason || "exhausted visible products";
    }
  }

  process.stdout.write("\n=== RESULT ===\n");
  process.stdout.write(`  status    : ${finalStatus}\n`);
  process.stdout.write(`  extracted : ${extracted}/${cli.target_count}\n`);
  process.stdout.write(`  clicks    : ${clicks}/${cli.max_clicks}\n`);
  if (finalReason) process.stdout.write(`  reason    : ${finalReason}\n`);
  process.stdout.write(`  registry  : ${cli.registry_path}\n`);
  process.stdout.write(`  dry_run   : ${cli.dry_run}\n`);

  await browser.close();
  return finalStatus === "SUCCESS" ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`FATAL: ${(e as Error).message}\n`);
    process.exit(1);
  });
