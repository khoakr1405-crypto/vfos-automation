#!/usr/bin/env tsx
/// <reference lib="dom" />
/**
 * Shopee CDP Production Extraction CLI (Round 27 + 27B).
 *
 * Replaces the 6+ POC scratch scripts (`click-and-extract-links.ts`,
 * `cdp-extract.ts`, `get-one-link.ts`, etc.) with a single hardened CLI that
 * implements the Round 26B BROWSER_CDP_TARGETED_CLICK flow + Link Registry.
 *
 * Round 27B additions:
 *   - CDP Browser Bootstrap: auto-launches Cốc Cốc (only — never Chrome/Edge)
 *     with --remote-debugging-port=9222 when the port is not already listening.
 *   - CAPTCHA / login-wall human-assist guard: pauses extraction when
 *     verification screen is detected, waits for operator to resolve.
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

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { Browser, Page } from 'playwright';

import {
  CdpBootstrapError,
  bootstrapBrowser,
  clampCaptchaWaitSeconds,
  detectCaptchaGuard,
  waitForCaptchaResolution,
} from '../src/cdp-bootstrap.js';
import {
  type ParsedCliArgs,
  classifyResolvedLink,
  extractShopidItemid,
  parseCliValues,
  parseShortLinkFromModalText,
  resolveShortLink,
  shouldSkipPreClick,
} from '../src/cdp-extract-helpers.js';
import { type LinkRegistryConfig, appendRejected, upsertEntry } from '../src/link-registry.js';
import { sanitizeProductImageUrl } from '../src/url-sanitize.js';

// ── workspace + env ─────────────────────────────────────────────────────────

function findWorkspaceRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function loadEnv(rootDir: string): void {
  const envPath = join(rootDir, '.env');
  if (!existsSync(envPath)) return;
  const text = readFileSync(envPath, 'utf8');
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const val = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!(key in process.env)) process.env[key] = val;
  }
}

const HELP_TEXT = `Shopee CDP Production Extraction CLI (Round 27 + Round 27B bootstrap)

Usage:
  pnpm shopee:extract-links-cdp [options]

Options:
  --target-count=N           New valid links to extract           (default 1)
  --max-clicks=N             Safety ceiling for clicks            (default 5)
  --owner-id=an_<id>         Expected affiliate owner id          (env SHOPEE_AFFILIATE_OWNER_ID)
  --registry-path=PATH       Registry JSON path                   (default production/_commerce/shopee_link_registry.json)
  --cdp-endpoint=URL         CDP endpoint                         (default http://127.0.0.1:9222)
  --cdp-retries=N            Retry budget after bootstrap         (default 3)
  --captcha-wait-seconds=N   Human-assist wait when CAPTCHA seen  (default 20, range [10..60])
  --browser-path=PATH        Override browser exe                 (else VFOS_BROWSER_PATH then disk search)
  --browser-user-data-dir=P  Override profile dir                 (else VFOS_BROWSER_USER_DATA_DIR — required to launch)
  --no-auto-launch           Probe only — never spawn a browser
  --dry-run                  Log actions only — never write to registry
  --help                     Show this help and exit

Default mode is SINGLE-LINK: stop as soon as 1 new valid link is captured.
Batch mode (target_count > 1) only activates with an explicit --target-count flag.

Bootstrap behaviour (Round 27B):
  - If 127.0.0.1:9222 is already listening, the CLI attaches to that browser.
  - If not, it launches Cốc Cốc (only — never Chrome/Edge) with
    --remote-debugging-port=9222 and your existing profile
    (VFOS_BROWSER_USER_DATA_DIR). It NEVER spawns a blank profile and NEVER
    types your password / OTP / CAPTCHA.
  - When a CAPTCHA / login wall is detected on the page, the CLI pauses
    --captcha-wait-seconds and re-checks each second. Solve it in the browser
    yourself; the run continues automatically when the overlay clears.

Operator env (required for auto-launch):
  VFOS_BROWSER_USER_DATA_DIR  Path to your Cốc Cốc profile already
                              logged into Shopee Affiliate. Required because
                              we refuse to spawn a fresh profile and hit a
                              login wall on your behalf.

Operator env (optional):
  VFOS_BROWSER_PATH           Override the browser executable search.
  SHOPEE_AFFILIATE_OWNER_ID   Override affiliate owner id (an_<digits>).
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
  price_vnd: number | 'unknown';
  commission_pct: string | 'unknown';
  sales_count: string | 'unknown';
  /** RAW image URL captured from the card DOM; sanitised in Node before persist. */
  image_url?: string | null;
  score?: number;
  criteria?: string;
}

async function discoverProductCards(page: Page): Promise<ProductCard[]> {
  return page.evaluate(() => {
    // 1. Tìm tất cả các phần tử chứa text "lấy link"/"get link" (case-insensitive,
    //    giới hạn độ dài để né nút "Lấy link hàng loạt" / "Get link batch")
    const buttons = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
      const t = (el.textContent ?? '').trim().toLowerCase();

      if (!t.includes('lấy link') && !t.includes('get link')) return false;
      if (t.length > 15) return false; // Loại trừ nút "Lấy link hàng loạt"

      // Leaf-Node by substring: bỏ qua thẻ cha nếu có thẻ con bên trong
      // cũng chứa cùng cụm từ — chỉ lấy thẻ sâu nhất sát chữ thực tế.
      const hasChildWithSameText = Array.from(el.children).some((child) => {
        const ct = (child.textContent ?? '').trim().toLowerCase();
        return ct.includes('lấy link') || ct.includes('get link');
      });
      return !hasChildWithSameText;
    });

    // 2. Khôi phục tọa độ và bóc tách thông tin từ các nút tìm được
    return buttons.slice(0, 20).map((btn, idx) => {
      // Leo ngược lên trên (Climb up) để tìm khung bọc toàn bộ ô sản phẩm (Card Container)
      let card: Element | null = btn;
      for (let i = 0; i < 12 && card; i++) {
        // Ô sản phẩm chuẩn bắt buộc phải chứa ảnh thumbnail và có hiển thị giá tiền ₫
        if (card.querySelector('img') && card.textContent?.includes('₫')) {
          break;
        }
        card = card.parentElement;
      }

      // Tách lấy tên sản phẩm bằng cách cắt bỏ phần text từ ký tự ₫ trở đi
      const rawText = (card?.textContent ?? '').trim();
      const name = (rawText.match(/^[^₫]+/)?.[0] ?? '').trim().slice(0, 120);

      // Tìm link gốc của sản phẩm nếu có sẵn trên thẻ
      let href: string | null = null;
      const a = card?.querySelector<HTMLAnchorElement>(
        'a[href*="shopee.vn/"][href*="-i."], a[href*="shopee.vn/product/"], a[href*="s.shopee.vn"]',
      );
      if (a?.href) href = a.href;

      // Capture RAW image URL from the card thumbnail. SELF-CONTAINED in the
      // browser context — no closure over Node helpers (DOM-helper contract).
      // Sanitised later in Node via sanitizeProductImageUrl().
      let image_url: string | null = null;
      const imgEl = card?.querySelector('img');
      if (imgEl) {
        image_url =
          imgEl.currentSrc ||
          imgEl.getAttribute('src') ||
          imgEl.getAttribute('data-src') ||
          imgEl.getAttribute('data-original') ||
          null;
        if (!image_url) {
          const ss = imgEl.getAttribute('srcset');
          if (ss) image_url = ss.split(',')[0]?.trim().split(/\s+/)[0] ?? null;
        }
      }
      if (!image_url && card instanceof HTMLElement) {
        const m = (card.style.backgroundImage || '').match(/url\(["']?([^"')]+)["']?\)/);
        if (m) image_url = m[1] ?? null;
      }

      let price_vnd: number | 'unknown' = 'unknown';
      let commission_pct = 'unknown';
      let sales_count = 'unknown';

      if (card) {
        // Price: find text with ₫
        const priceMatch = card.textContent?.match(/₫\s*([\d.,\s]+)/);
        if (priceMatch?.[1]) {
          price_vnd = Number.parseInt(priceMatch[1].replace(/[.,\s]/g, ''), 10) || 'unknown';
        }

        // Commission Pct: find text containing %
        const pctMatches = card.textContent?.match(/(\d+(?:[.,]\d+)?)\s*%/g);
        if (pctMatches && pctMatches.length > 0) {
          commission_pct = pctMatches[0].trim();
        }

        // Sales count: find text with "đã bán" or "sold"
        const salesMatch = card.textContent?.match(
          /(?:đã bán|sold|đã\s+bán)\s*([\d.,\s]+[kK]?\+?)/i,
        );
        if (salesMatch?.[1]) {
          sales_count = salesMatch[1].trim();
        }
      }

      return { index: idx, name, href, price_vnd, commission_pct, sales_count, image_url };
    });
  });
}

async function clickGetLinkButton(page: Page, index: number): Promise<boolean> {
  try {
    return await page.evaluate((idx) => {
      // Đồng bộ tuyệt đối thuật toán tìm nút "Lấy link" sát chữ thực tế nhất
      // (case-insensitive + giới hạn độ dài, khớp với discoverProductCards)
      const buttons = Array.from(document.querySelectorAll<HTMLElement>('*')).filter((el) => {
        const t = (el.textContent ?? '').trim().toLowerCase();

        if (!t.includes('lấy link') && !t.includes('get link')) return false;
        if (t.length > 15) return false; // Loại trừ nút "Lấy link hàng loạt"

        const hasChildWithSameText = Array.from(el.children).some((child) => {
          const ct = (child.textContent ?? '').trim().toLowerCase();
          return ct.includes('lấy link') || ct.includes('get link');
        });
        return !hasChildWithSameText;
      });

      const targetBtn = buttons[idx];
      if (!targetBtn) return false;

      targetBtn.click();
      return true;
    }, index);
  } catch (err) {
    const msg = (err as Error).message;
    if (
      msg.includes('context was destroyed') ||
      msg.includes('navigation') ||
      msg.includes('navigating')
    ) {
      process.stdout.write(
        '  [CDP] Context destroyed during click, likely due to a navigation/redirect.\n',
      );
      return true; // Treat as click initiated, let outer loop handle page state
    }
    throw err;
  }
}

// biome-ignore lint/suspicious/noExplicitAny: returns raw evaluated page details
async function inspectModalDetails(page: Page): Promise<any> {
  return page.evaluate(() => {
    // biome-ignore lint/suspicious/noExplicitAny: accumulator object
    const details: any = {
      inputs: [],
      links: [],
      buttons: [],
      textSnippet: '',
    };

    // Grab inputs/textareas
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    );
    details.inputs = inputs.map((i) => ({
      tag: i.tagName,
      id: i.id,
      name: i.name,
      value: i.value,
    }));

    // Grab anchors
    const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    details.links = anchors
      .slice(0, 10)
      .map((a) => ({ text: a.textContent?.trim(), href: a.href }));

    // Grab buttons
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('button'));
    details.buttons = buttons.slice(0, 10).map((b) => b.textContent?.trim());

    // Grab modal-like elements text
    const modals = Array.from(
      document.querySelectorAll(
        '[class*="modal"], [class*="popup"], [class*="dialog"], [role="dialog"]',
      ),
    );
    details.textSnippet = modals.map((m) => m.textContent?.trim().slice(0, 300)).join(' | ');

    return details;
  });
}

async function extractShortLinkFromModal(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const SHOPEE_RE_G = /https?:\/\/(?:[a-zA-Z0-9-]+\.)*shopee\.vn\/[^\s'"]+/g;

    const urls: string[] = [];

    // 1. Check all inputs and textareas
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    );
    for (const i of inputs) {
      if (i.value) {
        const matches = i.value.match(SHOPEE_RE_G);
        if (matches) {
          for (const m of matches) {
            const clean = m.trim().replace(/['"()]$/, '');
            if (clean && !urls.includes(clean)) {
              urls.push(clean);
            }
          }
        }
      }
    }

    // 2. Check all links (anchor tags) inside any visible modal
    const modalContainers = Array.from(
      document.querySelectorAll(
        '[class*="modal"], [class*="popup"], [class*="dialog"], [role="dialog"], .shopee-popup__container',
      ),
    );
    for (const mc of modalContainers) {
      const anchors = Array.from(mc.querySelectorAll<HTMLAnchorElement>('a[href]'));
      for (const a of anchors) {
        if (a.href) {
          const matches = a.href.match(SHOPEE_RE_G);
          if (matches) {
            for (const m of matches) {
              const clean = m.trim().replace(/['"()]$/, '');
              if (clean && !urls.includes(clean)) {
                urls.push(clean);
              }
            }
          }
        }
      }
    }

    // Fallback: Check all anchors on the page
    const allAnchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'));
    for (const a of allAnchors) {
      if (a.href) {
        const matches = a.href.match(SHOPEE_RE_G);
        if (matches) {
          for (const m of matches) {
            const clean = m.trim().replace(/['"()]$/, '');
            if (clean && !urls.includes(clean)) {
              urls.push(clean);
            }
          }
        }
      }
    }

    // 3. Search text content of modal elements
    for (const mc of modalContainers) {
      const txt = mc.textContent || '';
      const matches = txt.match(SHOPEE_RE_G);
      if (matches) {
        for (const m of matches) {
          const clean = m.trim().replace(/['"()]$/, '');
          if (clean && !urls.includes(clean)) {
            urls.push(clean);
          }
        }
      }
    }

    // 4. Fallback: Search the entire body text
    if (document.body) {
      const txt = document.body.textContent || '';
      const matches = txt.match(SHOPEE_RE_G);
      if (matches) {
        for (const m of matches) {
          const clean = m.trim().replace(/['"()]$/, '');
          if (clean && !urls.includes(clean)) {
            urls.push(clean);
          }
        }
      }
    }

    if (urls.length === 0) return null;

    // Pre-calculate scores and sort inline using Bubble Sort to be 100% immune to __name
    const urlScores: { url: string; score: number }[] = [];
    for (const urlStr of urls) {
      let score = 0;
      try {
        const u = new URL(urlStr);
        if (u.hostname === 'help.shopee.vn' || u.hostname.startsWith('help.')) {
          score = -100;
        } else if (u.hostname === 'partner.shopee.vn' || u.hostname.startsWith('partner.')) {
          score = -90;
        } else {
          if (u.hostname === 's.shopee.vn') {
            score += 1000;
          }
          if (
            u.searchParams.has('utm_source') &&
            /^an_\d+$/.test(u.searchParams.get('utm_source') || '')
          ) {
            score += 500;
          }
          if (
            u.searchParams.has('mmp_pid') &&
            /^an_\d+$/.test(u.searchParams.get('mmp_pid') || '')
          ) {
            score += 500;
          }
          if (u.hostname === 'shopee.vn' || u.hostname.endsWith('.shopee.vn')) {
            if (u.pathname.includes('/opaanlp/') || u.pathname.includes('/universal-link/')) {
              score += 200;
            } else if (u.pathname.includes('-i.') || u.pathname.includes('/product/')) {
              score += 100;
            } else {
              score += 50;
            }
          }
        }
      } catch {
        if (urlStr.includes('s.shopee.vn')) {
          score += 1000;
        }
        if (urlStr.includes('utm_source=an_') || urlStr.includes('mmp_pid=an_')) {
          score += 500;
        }
      }
      urlScores.push({ url: urlStr, score });
    }

    // Bubble sort descending
    for (let i = 0; i < urlScores.length - 1; i++) {
      for (let j = 0; j < urlScores.length - 1 - i; j++) {
        if (urlScores[j].score < urlScores[j + 1].score) {
          const temp = urlScores[j];
          urlScores[j] = urlScores[j + 1];
          urlScores[j + 1] = temp;
        }
      }
    }

    return urlScores[0] ? urlScores[0].url : null;
  });
}

/**
 * Collect raw text that may contain the generated short link, from the Shopee
 * "Link Hoa hồng Sản phẩm" modal. SELF-CONTAINED browser helper (DOM-helper
 * contract): reads textarea/input `.value`, modal-container textContent, anchor
 * hrefs, and the body text as a last resort. Never touches cookies/storage.
 * Returns one joined string; the Node side parses the short link out of it.
 */
async function collectModalLinkText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const parts: string[] = [];

    // 1. textarea / input values — Shopee renders the short link in a readonly
    //    field next to the "Sao chép Link" button.
    for (const el of Array.from(
      document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea'),
    )) {
      if (el.value) parts.push(el.value);
    }

    // 2. Modal/dialog containers: textContent + any anchor hrefs inside them.
    const modals = Array.from(
      document.querySelectorAll(
        '[class*="modal"], [class*="popup"], [class*="dialog"], [role="dialog"], .shopee-popup__container',
      ),
    );
    for (const m of modals) {
      parts.push(m.textContent ?? '');
      for (const a of Array.from(m.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
        parts.push(a.href);
      }
    }

    // 3. Page anchors + body text fallback (in case the modal markup is detached).
    for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
      parts.push(a.href);
    }
    if (document.body) parts.push(document.body.textContent ?? '');

    return parts.join('\n');
  });
}

/**
 * Read the generated short link from the Shopee modal, POLLING until it appears.
 *
 * Root-cause fix: Shopee opens the "Link Hoa hồng Sản phẩm" modal first and
 * generates the `s.shopee.vn/<code>` short link asynchronously a moment later.
 * A single read right after the click often hits the modal before the link is
 * ready → ERR_MODAL_UNRECOGNIZED even though the operator sees the link a beat
 * later. So we re-read every `pollMs` until a clean short link shows up or we
 * hit `timeoutMs`.
 *
 * Reads DOM directly (textarea/input/textContent) — never the clipboard, never
 * clicks "Sao chép Link". Falls back to the broader scorer only at the deadline.
 */
async function readShortLinkFromShopeeModal(
  page: Page,
  opts: { timeoutMs: number; pollMs: number },
): Promise<string | null> {
  const deadline = Date.now() + opts.timeoutMs;
  let polls = 0;
  while (Date.now() < deadline) {
    polls++;
    try {
      const text = await collectModalLinkText(page);
      const short = parseShortLinkFromModalText(text);
      if (short) {
        process.stdout.write(`  modal short link found after ${polls} poll(s)\n`);
        return short;
      }
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('context was destroyed') || msg.includes('navigation')) {
        process.stdout.write('  [CDP] Context destroyed during modal polling.\n');
        return null;
      }
      throw err;
    }
    await page.waitForTimeout(opts.pollMs);
  }
  // Deadline reached — last-ditch try via the broader scorer (may surface a
  // canonical link), so a present-but-non-short link is still better than null.
  process.stdout.write(`  modal poll exhausted after ${polls} poll(s) — trying scorer fallback\n`);
  try {
    return await extractShortLinkFromModal(page);
  } catch {
    return null;
  }
}

async function closeModal(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.waitForTimeout(800);
}

function scoreCard(card: ProductCard): { score: number; criteria: string } {
  let score = 0;
  const criteriaParts: string[] = [];

  // 1. Commission Score
  if (card.commission_pct && card.commission_pct !== 'unknown') {
    const pctVal = Number.parseFloat(card.commission_pct.replace('%', ''));
    if (Number.isFinite(pctVal)) {
      if (pctVal >= 15) {
        score += 4;
        criteriaParts.push(`commission_high(${pctVal}%)`);
      } else if (pctVal >= 10) {
        score += 3;
        criteriaParts.push(`commission_mid(${pctVal}%)`);
      } else if (pctVal >= 5) {
        score += 2;
        criteriaParts.push(`commission_low(${pctVal}%)`);
      } else if (pctVal >= 2) {
        score += 1;
        criteriaParts.push(`commission_min(${pctVal}%)`);
      } else {
        criteriaParts.push(`commission_negligible(${pctVal}%)`);
      }
    }
  } else {
    criteriaParts.push('commission_unknown');
  }

  // 2. Price Sweet Spot (20k - 200k VN sweet spot)
  if (card.price_vnd && card.price_vnd !== 'unknown' && typeof card.price_vnd === 'number') {
    const p = card.price_vnd;
    if (p >= 20000 && p <= 200000) {
      score += 3;
      criteriaParts.push(`price_sweet(${p}đ)`);
    } else if (p >= 5000 && p <= 500000) {
      score += 2;
      criteriaParts.push(`price_acceptable(${p}đ)`);
    } else if (p >= 1000 && p <= 1000000) {
      score += 1;
      criteriaParts.push(`price_edge(${p}đ)`);
    } else {
      criteriaParts.push(`price_outside_band(${p}đ)`);
    }
  } else {
    criteriaParts.push('price_unknown');
  }

  // 3. Sales Count (Social Proof)
  if (card.sales_count && card.sales_count !== 'unknown') {
    const sc = card.sales_count.toLowerCase();
    if (sc.includes('k')) {
      score += 3;
      criteriaParts.push(`sales_excellent(${card.sales_count})`);
    } else {
      const num = Number.parseInt(sc.replace(/[^\d]/g, ''), 10);
      if (Number.isFinite(num)) {
        if (num >= 100) {
          score += 2;
          criteriaParts.push(`sales_moderate(${num})`);
        } else if (num >= 10) {
          score += 1;
          criteriaParts.push(`sales_minimal(${num})`);
        } else {
          criteriaParts.push(`sales_poor(${num})`);
        }
      } else {
        criteriaParts.push(`sales_format_unrecognized(${card.sales_count})`);
      }
    }
  } else {
    criteriaParts.push('sales_unknown');
  }

  return { score, criteria: criteriaParts.join(', ') };
}

// ── main ────────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms));
}

/**
 * Emit the machine-readable result marker for an EARLY exit (before the
 * extraction loop). Keeps the Studio API on one parse contract for every exit
 * path. Carries only non-secret fields.
 */
function emitEarlyResult(
  status: 'SUSPENDED' | 'FAIL',
  stage: string,
  reasonCode: string,
  reason?: string,
): void {
  process.stdout.write(`\nVFOS_RESULT ${JSON.stringify({ status, stage, reasonCode, reason })}\n`);
}

async function main(): Promise<number> {
  const rawArgs = parseArgs({
    options: {
      'target-count': { type: 'string' },
      'max-clicks': { type: 'string' },
      'owner-id': { type: 'string' },
      'registry-path': { type: 'string' },
      'cdp-endpoint': { type: 'string' },
      'cdp-retries': { type: 'string' },
      'captcha-wait-seconds': { type: 'string' },
      'browser-path': { type: 'string' },
      'browser-user-data-dir': { type: 'string' },
      'no-auto-launch': { type: 'boolean', default: false },
      'dry-run': { type: 'boolean', default: false },
      help: { type: 'boolean', default: false },
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
      owner: process.env.SHOPEE_AFFILIATE_OWNER_ID ?? 'an_17376660568',
      registry_path: resolve(workspaceRoot, 'production', '_commerce', 'shopee_link_registry.json'),
    });
  } catch (e) {
    process.stderr.write(`ERR_INVALID_ARGS: ${(e as Error).message}\n`);
    emitEarlyResult('FAIL', 'cli_exit', 'ERR_INVALID_ARGS');
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

  process.stdout.write('=== Shopee CDP Extraction (Round 27 + 27B bootstrap) ===\n');
  process.stdout.write(`  target_count        : ${cli.target_count}\n`);
  process.stdout.write(`  max_clicks          : ${cli.max_clicks} (safety ceiling)\n`);
  process.stdout.write(`  owner_id            : ${cli.expected_owner}\n`);
  process.stdout.write(`  registry            : ${cli.registry_path}\n`);
  process.stdout.write(`  cdp_endpoint        : ${cli.cdp_endpoint}\n`);
  process.stdout.write(`  cdp_retries         : ${cli.cdp_retries}\n`);
  process.stdout.write(`  captcha_wait_seconds: ${cli.captcha_wait_seconds}\n`);
  process.stdout.write(`  no_auto_launch      : ${cli.no_auto_launch}\n`);
  process.stdout.write(`  dry_run             : ${cli.dry_run}\n\n`);

  // ── CDP bootstrap (Round 27B) — probe port, auto-launch if needed ────────

  const endpointUrl = new URL(cli.cdp_endpoint);
  const cdpPort = Number.parseInt(endpointUrl.port, 10) || 9222;
  const cdpHost = endpointUrl.hostname || '127.0.0.1';
  const bootstrapLogPath = resolve(workspaceRoot, 'production', '_commerce', 'cdp_bootstrap.log');

  let bootstrappedNewBrowser = false;
  try {
    const bootstrap = await bootstrapBrowser({
      host: cdpHost,
      port: cdpPort,
      no_auto_launch: cli.no_auto_launch,
      use_default_user_data_dir: true,
      ...(cli.browser_path ? { browser_path_override: cli.browser_path } : {}),
      ...(cli.browser_user_data_dir ? { user_data_dir_override: cli.browser_user_data_dir } : {}),
      log_path: bootstrapLogPath,
    });
    process.stdout.write(`  bootstrap_status    : ${bootstrap.status}\n`);
    if (bootstrap.status === 'launched') {
      bootstrappedNewBrowser = true;
      process.stdout.write(`  browser_path        : ${bootstrap.browser_path}\n`);
      process.stdout.write(`  user_data_dir       : ${bootstrap.user_data_dir}\n`);
      process.stdout.write(`  waited_after_launch : ${bootstrap.waited_ms_after_launch}ms\n`);
    }
    process.stdout.write('\n');
  } catch (e) {
    const reasonCode =
      e instanceof CdpBootstrapError ? e.reason_code : 'ERR_CDP_BROWSER_LAUNCH_FAILED';
    if (e instanceof CdpBootstrapError) {
      process.stderr.write(`${e.reason_code}\n  ${e.message}\n`);
    } else {
      process.stderr.write(`ERR_CDP_BROWSER_LAUNCH_FAILED\n  ${(e as Error).message}\n`);
    }
    emitEarlyResult('FAIL', 'bootstrap', reasonCode);
    return 2;
  }

  // ── CDP connect (post-bootstrap, port is verified open) ───────────────────

  let chromium: typeof import('playwright').chromium;
  try {
    chromium = (await import('playwright')).chromium;
  } catch {
    process.stderr.write('ERR_PLAYWRIGHT_NOT_INSTALLED\n  Install with: pnpm add -D playwright\n');
    emitEarlyResult('FAIL', 'cdp_connect', 'ERR_PLAYWRIGHT_NOT_INSTALLED');
    return 2;
  }

  // If bootstrap actually launched a new browser, the port has already been
  // verified — collapse Playwright retries to 1 to avoid the 3×30s default
  // timeout when something else goes wrong.
  const effectiveRetries = bootstrappedNewBrowser ? 1 : cli.cdp_retries;
  let browser: Browser | null = null;
  for (let attempt = 1; attempt <= effectiveRetries; attempt++) {
    try {
      process.stdout.write(`  CDP connect attempt ${attempt}/${effectiveRetries}…\n`);
      browser = await chromium.connectOverCDP(cli.cdp_endpoint);
      process.stdout.write('  CDP connected.\n');
      break;
    } catch (e) {
      process.stderr.write(`  CDP connect failed: ${(e as Error).message.slice(0, 100)}\n`);
      if (attempt === effectiveRetries) {
        process.stderr.write(
          'ERR_CDP_BROWSER_NOT_FOUND\n  Bootstrap reported port open but Playwright still cannot attach.\n',
        );
        emitEarlyResult('FAIL', 'cdp_connect', 'ERR_CDP_BROWSER_NOT_FOUND');
        return 2;
      }
      await sleep(2000);
    }
  }

  if (!browser) {
    emitEarlyResult('FAIL', 'cdp_connect', 'ERR_CDP_BROWSER_NOT_FOUND');
    return 2;
  }

  // ── locate target tab ─────────────────────────────────────────────────────

  let page: Page | null = null;
  for (const ctx of browser.contexts()) {
    for (const p of ctx.pages()) {
      const url = p.url();
      if (
        url.includes('affiliate.shopee.vn') ||
        url.includes('verify.shopee.vn') ||
        url.includes('shopee.vn/security') ||
        url.includes('buyer/login') ||
        url.includes('shopee.vn/account/login')
      ) {
        page = p;
        break;
      }
    }
    if (page) break;
  }
  if (!page) {
    process.stderr.write(
      'ERR_CDP_TARGET_TAB_NOT_FOUND\n  Open https://affiliate.shopee.vn/offer/product_offer in the logged-in browser.\n',
    );
    emitEarlyResult('SUSPENDED', 'locate_tab', 'ERR_CDP_TARGET_TAB_NOT_FOUND');
    await browser.close();
    return 2;
  }
  process.stdout.write(`  Target tab: ${page.url().slice(0, 80)}\n`);

  // ── CAPTCHA / login-wall human-assist guard (Round 27B) ──────────────────

  const initialDetection = await detectCaptchaGuard(page);
  if (initialDetection.detected) {
    process.stdout.write(
      `\n⚠️  VFOS WARNING: phát hiện CAPTCHA/Login/Xác minh — signals=[${initialDetection.signals.join(', ')}]\n` +
        `   Hệ thống tạm dừng chờ tối đa ${cli.captcha_wait_seconds}s. Hãy giải thủ công trên cửa sổ browser.\n`,
    );
    const wait = await waitForCaptchaResolution(page, {
      waitSeconds: cli.captcha_wait_seconds,
      pollIntervalMs: 1000,
      onTick: ({ secondsElapsed, secondsRemaining, detection }) => {
        if (detection.detected && secondsElapsed > 0 && secondsElapsed % 5 === 0) {
          process.stdout.write(
            `   captcha guard: elapsed=${secondsElapsed}s remaining=${secondsRemaining}s\n`,
          );
        }
      },
    });
    if (!wait.cleared) {
      process.stderr.write(
        `\n${wait.reason_code}\n  Captcha/login overlay still present after ${wait.waited_seconds}s.\n  Resolve in browser manually then rerun.\n`,
      );
      emitEarlyResult(
        'SUSPENDED',
        'captcha',
        wait.reason_code,
        `Xác minh CAPTCHA/Login chưa được giải sau ${wait.waited_seconds}s.`,
      );
      await browser.close();
      return 2;
    }
    process.stdout.write(`   captcha guard cleared after ${wait.waited_seconds}s — continuing.\n`);
  }

  // Ensure page navigates to target offer catalog page if not there yet
  if (!page.url().includes('offer/product_offer')) {
    process.stdout.write(
      '  [CDP] Navigating tab to active Shopee Affiliate Product Offer catalog...\n',
    );
    await page.goto('https://affiliate.shopee.vn/offer/product_offer');
    await page.waitForTimeout(3000);
  }
  process.stdout.write('\n');

  // ── extraction loop ───────────────────────────────────────────────────────

  let extracted = 0;
  let clicks = 0;
  let consecutivePostResolveDuplicates = 0;
  const attemptedNames = new Set<string>();
  let finalStatus: 'SUCCESS' | 'SUSPENDED' | 'FAIL' = 'FAIL';
  let finalReason = '';
  // Stage = where the run ended; reasonCode = machine-readable cause. Both feed
  // the VFOS_RESULT marker so the Studio API can show the operator an accurate,
  // sanitized failure stage instead of a generic "Trích xuất link thất bại".
  let finalStage:
    | 'discover'
    | 'click'
    | 'modal_read'
    | 'resolve'
    | 'owner_validate'
    | 'registry_write'
    | 'done' = 'discover';
  let finalReasonCode: string | null = null;
  // Data of the winning link (only set on a real insert) — surfaced to the UI.
  let winning: {
    shortLink: string;
    productName: string;
    shopid: string | null;
    itemid: string | null;
    ownerVerified: boolean;
    inserted: boolean;
    duplicate: boolean;
    productImageCaptured: boolean;
  } | null = null;

  while (extracted < cli.target_count && clicks < cli.max_clicks) {
    process.stdout.write(
      `── iter (extracted=${extracted}/${cli.target_count}, clicks=${clicks}/${cli.max_clicks}) ──\n`,
    );

    // SPA Hydration Wait — đợi React render danh sách sản phẩm xong trước khi scan DOM.
    // Predicate khớp filter của discoverProductCards (case-insensitive + length<15)
    // để tránh false-positive với button "Lấy link hàng loạt".
    try {
      process.stdout.write('  [CDP] Chờ danh sách sản phẩm hiển thị (SPA Hydration)...\n');
      await page.waitForFunction(
        () => {
          const els = Array.from(document.querySelectorAll('*'));
          return els.some((el) => {
            const t = (el.textContent ?? '').trim().toLowerCase();
            return (t.includes('lấy link') || t.includes('get link')) && t.length < 15;
          });
        },
        { timeout: 15000 },
      );
    } catch {
      process.stdout.write('  [CDP] Timeout chờ sản phẩm, tiến hành scan trực tiếp...\n');
    }

    const cards = await discoverProductCards(page);
    process.stdout.write(`  visible cards: ${cards.length}\n`);
    if (cards.length === 0) {
      finalStatus = 'SUSPENDED';
      finalStage = 'discover';
      finalReasonCode = 'NO_PRODUCT_CARDS';
      finalReason = 'no visible product cards';
      break;
    }

    // Evaluate and score all visible non-duplicate cards
    const candidates: ProductCard[] = [];
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

      const evaluation = scoreCard(card);
      card.score = evaluation.score;
      card.criteria = evaluation.criteria;
      candidates.push(card);
    }

    if (candidates.length === 0) {
      finalStatus = 'SUSPENDED';
      finalStage = 'discover';
      finalReasonCode = 'ALL_CARDS_EXHAUSTED';
      finalReason = 'all visible cards exhausted (attempted or pre-click duplicates)';
      break;
    }

    // Sort candidates by score descending
    candidates.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    process.stdout.write('  Scored candidates:\n');
    for (const cand of candidates) {
      process.stdout.write(
        `    - [${cand.index}] score=${cand.score}/10 | name=${cand.name.slice(0, 45)}... | price=${cand.price_vnd}đ | comm=${cand.commission_pct} | sales=${cand.sales_count} | criteria: ${cand.criteria}\n`,
      );
    }

    const target = candidates[0];
    if (!target) {
      finalStatus = 'SUSPENDED';
      finalStage = 'discover';
      finalReasonCode = 'NO_CANDIDATE_SELECTED';
      finalReason = 'no valid candidate selected';
      break;
    }

    // Skip card if its quality score is below the minimum acceptable threshold
    const minAcceptableScore = 2;
    if ((target.score ?? 0) < minAcceptableScore) {
      process.stdout.write(
        `  ⚠️ Best candidate [${target.index}] has score=${target.score} < threshold=${minAcceptableScore}. Skipping iteration.\n`,
      );
      attemptedNames.add(target.name);
      continue;
    }

    process.stdout.write(
      `  Selected [${target.index}] score=${target.score}/10 — click "Lấy link" — ${target.name.slice(0, 60)}\n`,
    );
    attemptedNames.add(target.name);
    clicks++;

    finalStage = 'click';
    let clicked = false;
    try {
      clicked = await clickGetLinkButton(page, target.index);
    } catch (err) {
      process.stderr.write(`  Error during clickGetLinkButton: ${(err as Error).message}\n`);
    }

    // Check if the click triggered a CAPTCHA / login verification screen immediately
    const postClickCaptcha = await detectCaptchaGuard(page);
    if (postClickCaptcha.detected) {
      process.stdout.write(
        `\n⚠️  VFOS WARNING: phát hiện CAPTCHA/Login/Xác minh sau khi click — signals=[${postClickCaptcha.signals.join(', ')}]\n` +
          `   Hệ thống tạm dừng chờ tối đa ${cli.captcha_wait_seconds}s. Hãy giải thủ công trên cửa sổ browser.\n`,
      );
      const wait = await waitForCaptchaResolution(page, {
        waitSeconds: cli.captcha_wait_seconds,
        pollIntervalMs: 1000,
        onTick: ({ secondsElapsed, secondsRemaining, detection }) => {
          if (detection.detected && secondsElapsed > 0 && secondsElapsed % 5 === 0) {
            process.stdout.write(
              `   captcha guard: elapsed=${secondsElapsed}s remaining=${secondsRemaining}s\n`,
            );
          }
        },
      });
      if (!wait.cleared) {
        process.stderr.write(
          `\n${wait.reason_code}\n  Captcha/login overlay still present after ${wait.waited_seconds}s.\n  Resolve in browser manually.\n`,
        );
        finalStatus = 'SUSPENDED';
        finalStage = 'click';
        finalReasonCode = wait.reason_code;
        finalReason = `Xác minh CAPTCHA/Login chưa được giải sau ${wait.waited_seconds}s.`;
        break;
      }
      process.stdout.write(
        `   captcha guard cleared after ${wait.waited_seconds}s — continuing.\n`,
      );

      // Navigate/return to catalog page if not there yet
      if (!page.url().includes('offer/product_offer')) {
        process.stdout.write('  [CDP] Returning to offer catalog page...\n');
        await page.goto('https://affiliate.shopee.vn/offer/product_offer');
        await page.waitForTimeout(3000);
      }
      continue; // Restart loop to try discovery again now that captcha is solved
    }

    if (!clicked) {
      finalReasonCode = 'ERR_LINK_BUTTON_NOT_FOUND';
      process.stderr.write(`  ERR_LINK_BUTTON_NOT_FOUND for index ${target.index}\n`);
      continue;
    }

    // Small settle wait so the modal mounts, then POLL for the async short link.
    // The single fixed-wait read was the root cause of false ERR_MODAL_UNRECOGNIZED.
    finalStage = 'modal_read';
    await page.waitForTimeout(1000);
    const shortLink = await readShortLinkFromShopeeModal(page, { timeoutMs: 9000, pollMs: 600 });

    if (!shortLink) {
      finalReasonCode = 'ERR_MODAL_UNRECOGNIZED';
      process.stderr.write('  ERR_MODAL_UNRECOGNIZED — no Shopee URL in modal\n');
      // biome-ignore lint/suspicious/noExplicitAny: details from page inspection
      let details: any = null;
      try {
        details = await inspectModalDetails(page);
        process.stderr.write(`  [Inspection Details]: ${JSON.stringify(details, null, 2)}\n`);
      } catch {
        process.stderr.write('  [Inspection Details]: Failed to inspect modal\n');
      }

      if (cli.dry_run) {
        process.stdout.write('  [dry-run] would appendRejected ERR_MODAL_UNRECOGNIZED\n');
      } else {
        await appendRejected(registryConfig, {
          short_link: null,
          canonical_url: null,
          reason_code: 'ERR_MODAL_UNRECOGNIZED',
          notes: `modal missing Shopee URL for: ${target.name.slice(0, 80)}${details ? ` | inspect: ${JSON.stringify(details).slice(0, 200)}` : ''}`,
        });
        process.stdout.write('  appendRejected (ERR_MODAL_UNRECOGNIZED)\n');
      }
      try {
        await closeModal(page);
      } catch {}
      continue;
    }

    process.stdout.write(`  short_link: ${shortLink}\n`);
    await closeModal(page);

    finalStage = 'resolve';
    const canonical = await resolveShortLink(shortLink, fetch);
    process.stdout.write(`  canonical : ${canonical ?? '(resolve failed)'}\n`);

    const { shopid, itemid } = extractShopidItemid(canonical);
    process.stdout.write(`  ids       : ${shopid ?? 'null'} / ${itemid ?? 'null'}\n`);

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
        finalStatus = 'SUSPENDED';
        finalStage = 'registry_write';
        finalReasonCode = 'POST_RESOLVE_DUPLICATE';
        finalReason = '3 consecutive post-resolve duplicates';
        break;
      }
      continue;
    }
    consecutivePostResolveDuplicates = 0;

    finalStage = 'owner_validate';
    const outcome = classifyResolvedLink(canonical, cli.expected_owner);
    process.stdout.write(`  validation: ${outcome.kind} — ${outcome.notes}\n`);

    if (outcome.kind !== 'ACCEPT') {
      const reasonCode =
        outcome.kind === 'REJECT' ? outcome.reason_code : 'ERR_AFFILIATE_OWNER_MISMATCH';
      finalReasonCode = reasonCode;
      if (cli.dry_run) {
        process.stdout.write(`  [dry-run] would appendRejected ${reasonCode}\n`);
      } else {
        await appendRejected(registryConfig, {
          short_link: shortLink,
          canonical_url: canonical,
          reason_code: reasonCode,
          notes: outcome.notes,
        });
        process.stdout.write(`  appendRejected (${reasonCode})\n`);
      }
      continue;
    }

    const linkStatus = outcome.status;
    const verifiedOwner = outcome.kind === 'ACCEPT' ? cli.expected_owner : null;

    if (cli.dry_run) {
      process.stdout.write(
        `  [dry-run] would upsert ${target.name.slice(0, 50)} (${linkStatus})\n`,
      );
      extracted++;
      process.stdout.write(`  ✓ [dry-run] counted (${extracted}/${cli.target_count})\n`);
      continue;
    }

    finalStage = 'registry_write';
    const sanitizedImage = sanitizeProductImageUrl(target.image_url) ?? null;
    const upsert = await upsertEntry(registryConfig, {
      product_name: target.name,
      shopid,
      itemid,
      short_link: shortLink,
      canonical_url: canonical,
      affiliate_owner_id: verifiedOwner,
      affiliate_link_status: linkStatus,
      source: 'cdp_browser_targeted_click',
      notes: `score: ${target.score}/10 | criteria: ${target.criteria} | round_27 cli — ${outcome.notes}`,
      // Sanitised at Node boundary — never persist a credential/tracking URL.
      product_image_url: sanitizedImage,
      // Extra fields for downstream coordinate parsing
      score: target.score,
      criteria: target.criteria,
      // biome-ignore lint/suspicious/noExplicitAny: type safety bypass for custom attributes
    } as any);
    process.stdout.write(
      `  upsert: inserted=${upsert.inserted} duplicate=${upsert.duplicate} times_seen=${upsert.entry.times_seen}\n`,
    );
    if (upsert.inserted) {
      extracted++;
      finalStage = 'done';
      winning = {
        shortLink,
        productName: target.name,
        shopid,
        itemid,
        ownerVerified: outcome.kind === 'ACCEPT',
        inserted: upsert.inserted,
        duplicate: upsert.duplicate,
        productImageCaptured: !!sanitizedImage,
      };
      process.stdout.write(`  ✓ NEW LINK (${extracted}/${cli.target_count})\n`);
    } else {
      process.stdout.write('  duplicate (race with concurrent writer) — try next\n');
    }
  }

  if (extracted >= cli.target_count) {
    finalStatus = 'SUCCESS';
    finalStage = 'done';
    finalReasonCode = null;
  } else if (finalStatus === 'FAIL') {
    if (clicks === 0) {
      finalStatus = 'SUSPENDED';
      finalReasonCode = finalReasonCode ?? 'NO_CLICKABLE_PRODUCTS';
      finalReason = 'no clickable products';
    } else if (clicks >= cli.max_clicks) {
      finalStatus = 'SUSPENDED';
      finalReasonCode = finalReasonCode ?? 'MAX_CLICKS_EXHAUSTED';
      finalReason = `reached max_clicks=${cli.max_clicks} without reaching target_count`;
    } else {
      finalStatus = 'SUSPENDED';
      finalReasonCode = finalReasonCode ?? 'EXHAUSTED_VISIBLE_PRODUCTS';
      finalReason = finalReason || 'exhausted visible products';
    }
  }

  process.stdout.write('\n=== RESULT ===\n');
  process.stdout.write(`  status    : ${finalStatus}\n`);
  process.stdout.write(`  stage     : ${finalStage}\n`);
  if (finalReasonCode) process.stdout.write(`  reasonCode: ${finalReasonCode}\n`);
  process.stdout.write(`  extracted : ${extracted}/${cli.target_count}\n`);
  process.stdout.write(`  clicks    : ${clicks}/${cli.max_clicks}\n`);
  if (finalReason) process.stdout.write(`  reason    : ${finalReason}\n`);
  process.stdout.write(`  registry  : ${cli.registry_path}\n`);
  process.stdout.write(`  dry_run   : ${cli.dry_run}\n`);

  // Machine-readable result marker — the single source of truth for the Studio
  // API. Carries ONLY non-secret, operator-safe fields (no canonical/credential
  // URL, no cookies/tokens/paths). Parsed by shopee-extract-one-link/route.ts.
  const resultMarker = {
    status: finalStatus,
    stage: finalStage,
    reasonCode: finalReasonCode,
    extracted,
    targetCount: cli.target_count,
    clicks,
    maxClicks: cli.max_clicks,
    dryRun: cli.dry_run,
    ...(winning
      ? {
          shortLink: winning.shortLink,
          productName: winning.productName,
          shopid: winning.shopid,
          itemid: winning.itemid,
          ownerVerified: winning.ownerVerified,
          inserted: winning.inserted,
          duplicate: winning.duplicate,
          productImageCaptured: winning.productImageCaptured,
        }
      : {}),
  };
  process.stdout.write(`\nVFOS_RESULT ${JSON.stringify(resultMarker)}\n`);

  await browser.close();
  return finalStatus === 'SUCCESS' ? 0 : 1;
}

main()
  .then((code) => process.exit(code))
  .catch((e) => {
    process.stderr.write(`FATAL: ${(e as Error).message}\n`);
    process.exit(1);
  });
