import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { upsertEntry, type LinkRegistryConfig } from "../src/link-registry.ts";
import {
  classifyResolvedLink,
  extractShopidItemid,
  parseCliValues,
  resolveShortLink,
  shouldSkipPreClick,
} from "../src/cdp-extract-helpers.ts";

const OWNER = "an_17376660568";
const SHORT = "https://s.shopee.vn/9fI1rVFybA";
const CANONICAL =
  `https://shopee.vn/opaanlp/1820797160/55110800126?gads_t_sig=x&utm_medium=affiliates&utm_source=${OWNER}`;

function freshConfig(): { dir: string; config: LinkRegistryConfig } {
  const dir = mkdtempSync(join(tmpdir(), "vfos-cdp-cli-"));
  return {
    dir,
    config: {
      registry_path: join(dir, "shopee_link_registry.json"),
      expected_owner_id: OWNER,
      lock_timeout_ms: 2000,
      lock_retry_ms: 20,
      stale_lock_ms: 500,
    },
  };
}

describe("extractShopidItemid", () => {
  test("parses opaanlp deep-link path", () => {
    const r = extractShopidItemid(CANONICAL);
    assert.equal(r.shopid, "1820797160");
    assert.equal(r.itemid, "55110800126");
  });

  test("parses /<slug>-i.<shopid>.<itemid> product URL", () => {
    const r = extractShopidItemid("https://shopee.vn/Quat-Mini-i.123.456789");
    assert.equal(r.shopid, "123");
    assert.equal(r.itemid, "456789");
  });

  test("returns nulls for an unrelated URL", () => {
    const r = extractShopidItemid("https://example.com/foo");
    assert.equal(r.shopid, null);
    assert.equal(r.itemid, null);
  });

  test("returns nulls for null input", () => {
    const r = extractShopidItemid(null);
    assert.equal(r.shopid, null);
    assert.equal(r.itemid, null);
  });
});

describe("classifyResolvedLink", () => {
  test("VERIFIED + owner match → ACCEPT", () => {
    const out = classifyResolvedLink(CANONICAL, OWNER);
    assert.equal(out.kind, "ACCEPT");
    if (out.kind === "ACCEPT") {
      assert.equal(out.status, "VERIFIED_FROM_LONG_LINK");
    }
  });

  test("VERIFIED + owner mismatch → REJECT (ERR_AFFILIATE_OWNER_MISMATCH)", () => {
    const out = classifyResolvedLink(CANONICAL, "an_99999999999");
    assert.equal(out.kind, "REJECT");
    if (out.kind === "REJECT") {
      assert.equal(out.reason_code, "ERR_AFFILIATE_OWNER_MISMATCH");
    }
  });

  test("missing gads_t_sig → REVIEW", () => {
    const noSig = `https://shopee.vn/opaanlp/1/2?utm_medium=affiliates&utm_source=${OWNER}`;
    const out = classifyResolvedLink(noSig, OWNER);
    assert.equal(out.kind, "REVIEW");
  });

  test("null link → REJECT", () => {
    const out = classifyResolvedLink(null, OWNER);
    assert.equal(out.kind, "REJECT");
  });
});

describe("shouldSkipPreClick", () => {
  let dir: string;
  let config: LinkRegistryConfig;

  beforeEach(() => {
    const f = freshConfig();
    dir = f.dir;
    config = f.config;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("returns skip=false when registry is empty", () => {
    const r = shouldSkipPreClick(config.registry_path, OWNER, {
      product_name: "anything",
    });
    assert.equal(r.skip, false);
    assert.equal(r.match_field, null);
  });

  test("returns skip=true with match_field=shopid_itemid after upsert", async () => {
    await upsertEntry(config, {
      product_name: "P1",
      shopid: "1820797160",
      itemid: "55110800126",
      short_link: SHORT,
      canonical_url: CANONICAL,
      affiliate_owner_id: OWNER,
      affiliate_link_status: "VERIFIED_FROM_LONG_LINK",
      source: "cdp_browser_targeted_click",
      notes: "",
    });
    const r = shouldSkipPreClick(config.registry_path, OWNER, {
      shopid: "1820797160",
      itemid: "55110800126",
    });
    assert.equal(r.skip, true);
    assert.equal(r.match_field, "shopid_itemid");
  });

  test("returns skip=true with match_field=product_name when only name probed", async () => {
    await upsertEntry(config, {
      product_name: "Quạt Không Cánh Mini T10",
      shopid: null,
      itemid: null,
      short_link: null,
      canonical_url: null,
      affiliate_owner_id: null,
      affiliate_link_status: "FAILED",
      source: "cdp_browser_targeted_click",
      notes: "",
    });
    const r = shouldSkipPreClick(config.registry_path, OWNER, {
      product_name: "  quạt KHÔNG cánh mini T10  ",
    });
    assert.equal(r.skip, true);
    assert.equal(r.match_field, "product_name");
  });
});

describe("rerun behaviour (dedupe via shopid+itemid)", () => {
  let dir: string;
  let config: LinkRegistryConfig;

  beforeEach(() => {
    const f = freshConfig();
    dir = f.dir;
    config = f.config;
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("first upsert inserts, second upsert with same shopid+itemid is duplicate", async () => {
    const entry = {
      product_name: "P1",
      shopid: "1820797160",
      itemid: "55110800126",
      short_link: SHORT,
      canonical_url: CANONICAL,
      affiliate_owner_id: OWNER,
      affiliate_link_status: "VERIFIED_FROM_LONG_LINK" as const,
      source: "cdp_browser_targeted_click",
      notes: "",
    };
    const r1 = await upsertEntry(config, entry);
    assert.equal(r1.inserted, true);
    const r2 = await upsertEntry(config, entry);
    assert.equal(r2.inserted, false);
    assert.equal(r2.duplicate, true);
    assert.equal(r2.entry.times_seen, 2);

    const persisted = JSON.parse(readFileSync(config.registry_path, "utf-8"));
    assert.equal(persisted.entries.length, 1);
  });
});

describe("resolveShortLink", () => {
  test("returns Location header from HEAD response when present", async () => {
    const fakeFetch = async () => ({
      headers: { get: (_n: string) => CANONICAL },
      url: SHORT,
    });
    const out = await resolveShortLink(SHORT, fakeFetch);
    assert.equal(out, CANONICAL);
  });

  test("falls back to GET .url when HEAD has no Location", async () => {
    let call = 0;
    const fakeFetch = async () => {
      call++;
      if (call === 1) return { headers: { get: () => null }, url: SHORT };
      return { headers: { get: () => null }, url: CANONICAL };
    };
    const out = await resolveShortLink(SHORT, fakeFetch);
    assert.equal(out, CANONICAL);
  });

  test("returns null on fetcher throw", async () => {
    const fakeFetch = async () => {
      throw new Error("network down");
    };
    const out = await resolveShortLink(SHORT, fakeFetch);
    assert.equal(out, null);
  });
});

describe("parseCliValues", () => {
  const defaults = { owner: OWNER, registry_path: "/tmp/reg.json" };

  test("defaults target_count=1 max_clicks=5 when flags omitted", () => {
    const cli = parseCliValues({}, defaults);
    assert.equal(cli.target_count, 1);
    assert.equal(cli.max_clicks, 5);
    assert.equal(cli.cdp_retries, 3);
    assert.equal(cli.dry_run, false);
    assert.equal(cli.expected_owner, OWNER);
  });

  test("accepts explicit batch mode --target-count=3", () => {
    const cli = parseCliValues({ "target-count": "3" }, defaults);
    assert.equal(cli.target_count, 3);
    assert.equal(cli.max_clicks, 5);
  });

  test("rejects max_clicks < target_count", () => {
    assert.throws(
      () => parseCliValues({ "target-count": "5", "max-clicks": "2" }, defaults),
      /max-clicks/,
    );
  });

  test("rejects invalid owner id format", () => {
    assert.throws(
      () => parseCliValues({ "owner-id": "not_an_owner" }, defaults),
      /owner-id/,
    );
  });

  test("rejects target-count < 1", () => {
    assert.throws(
      () => parseCliValues({ "target-count": "0" }, defaults),
      /target-count/,
    );
  });
});
