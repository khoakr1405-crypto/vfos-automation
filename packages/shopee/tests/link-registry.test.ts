import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  upsertEntry,
  appendRejected,
  isDuplicate,
  findExistingEntry,
  LinkRegistryError,
  type LinkRegistry,
  type LinkRegistryConfig,
} from "../src/link-registry.ts";

const OWNER = "an_17376660568";

function freshConfig(): { dir: string; config: LinkRegistryConfig } {
  const dir = mkdtempSync(join(tmpdir(), "vfos-registry-"));
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

function baseEntry(overrides: Record<string, unknown> = {}) {
  return {
    product_name: "Quạt Không Cánh Mini T10 Turbo USB",
    shopid: "1820797160",
    itemid: "55110800126",
    short_link: "https://s.shopee.vn/9fI1rVFybA",
    canonical_url:
      "https://shopee.vn/opaanlp/1820797160/55110800126?gads_t_sig=x&utm_medium=affiliates&utm_source=an_17376660568",
    affiliate_owner_id: OWNER,
    affiliate_link_status: "VERIFIED_FROM_LONG_LINK",
    source: "cdp_browser_targeted_click",
    notes: "",
    ...overrides,
  };
}

describe("link-registry", () => {
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

  test("upsert new entry creates registry file with atomic write", async () => {
    const r = await upsertEntry(config, baseEntry());
    assert.equal(r.inserted, true);
    assert.equal(r.duplicate, false);
    assert.equal(r.entry.times_seen, 1);
    assert.ok(existsSync(config.registry_path));
    const reg = JSON.parse(readFileSync(config.registry_path, "utf-8")) as LinkRegistry;
    assert.equal(reg.schema_version, "0.1.0");
    assert.equal(reg.entries.length, 1);
    assert.equal(reg.expected_affiliate_owner_id, OWNER);
  });

  test("upsert same shopid+itemid → duplicate, times_seen increments", async () => {
    await upsertEntry(config, baseEntry());
    const r2 = await upsertEntry(config, baseEntry({ notes: "second sighting" }));
    assert.equal(r2.inserted, false);
    assert.equal(r2.duplicate, true);
    assert.equal(r2.entry.times_seen, 2);
    const reg = JSON.parse(readFileSync(config.registry_path, "utf-8")) as LinkRegistry;
    assert.equal(reg.entries.length, 1);
  });

  test("dedup by canonical_url when shopid missing", async () => {
    await upsertEntry(config, baseEntry({ shopid: null, itemid: null }));
    const r2 = await upsertEntry(
      config,
      baseEntry({
        shopid: null,
        itemid: null,
        short_link: "https://s.shopee.vn/DIFFERENT",
      }),
    );
    assert.equal(r2.duplicate, true);
  });

  test("dedup by short_link when canonical also missing", async () => {
    await upsertEntry(
      config,
      baseEntry({ shopid: null, itemid: null, canonical_url: null }),
    );
    const r2 = await upsertEntry(
      config,
      baseEntry({
        shopid: null,
        itemid: null,
        canonical_url: null,
        product_name: "different name",
      }),
    );
    assert.equal(r2.duplicate, true);
  });

  test("dedup by normalized product_name as last fallback", async () => {
    await upsertEntry(
      config,
      baseEntry({ shopid: null, itemid: null, canonical_url: null, short_link: null }),
    );
    const r2 = await upsertEntry(
      config,
      baseEntry({
        shopid: null,
        itemid: null,
        canonical_url: null,
        short_link: null,
        product_name: "  QUẠT KHÔNG cánh MINI t10 turbo USB   ",
      }),
    );
    assert.equal(r2.duplicate, true);
  });

  test("different shopid+itemid → both inserted", async () => {
    await upsertEntry(config, baseEntry());
    await upsertEntry(
      config,
      baseEntry({
        shopid: "1234567890",
        itemid: "9876543210",
        short_link: "https://s.shopee.vn/AAA",
        canonical_url: "https://shopee.vn/opaanlp/1234567890/9876543210?utm_source=an_17376660568",
        product_name: "Another product",
      }),
    );
    const reg = JSON.parse(readFileSync(config.registry_path, "utf-8")) as LinkRegistry;
    assert.equal(reg.entries.length, 2);
  });

  test("isDuplicate read-only check (no lock)", async () => {
    assert.equal(isDuplicate(config.registry_path, OWNER, { shopid: "x", itemid: "y" }), false);
    await upsertEntry(config, baseEntry());
    assert.equal(
      isDuplicate(config.registry_path, OWNER, { shopid: "1820797160", itemid: "55110800126" }),
      true,
    );
  });

  test("appendRejected stores rejection with timestamp", async () => {
    await appendRejected(config, {
      short_link: "https://s.shopee.vn/BAD",
      canonical_url: null,
      reason_code: "ERR_AFFILIATE_OWNER_MISMATCH",
      notes: "owner=an_OTHER, expected an_17376660568",
    });
    const reg = JSON.parse(readFileSync(config.registry_path, "utf-8")) as LinkRegistry;
    assert.equal(reg.rejected.length, 1);
    assert.equal(reg.rejected[0].reason_code, "ERR_AFFILIATE_OWNER_MISMATCH");
    assert.ok(reg.rejected[0].seen_at.length > 0);
  });

  test("ERR_LINK_REGISTRY_STALE_LOCK when lock file is too old", async () => {
    const lock = `${config.registry_path}.lock`;
    writeFileSync(lock, "stale\n");
    const oneHourAgo = (Date.now() - 60 * 60 * 1000) / 1000;
    const { utimesSync } = await import("node:fs");
    utimesSync(lock, oneHourAgo, oneHourAgo);

    await assert.rejects(
      upsertEntry({ ...config, stale_lock_ms: 100 }, baseEntry()),
      (err: unknown) => {
        assert.ok(err instanceof LinkRegistryError);
        assert.equal(err.reason_code, "ERR_LINK_REGISTRY_STALE_LOCK");
        return true;
      },
    );
    rmSync(lock);
  });

  test("ERR_LINK_REGISTRY_LOCK_TIMEOUT when lock held by another (non-stale)", async () => {
    const lock = `${config.registry_path}.lock`;
    writeFileSync(lock, `99999\n${new Date().toISOString()}\n`);

    await assert.rejects(
      upsertEntry({ ...config, lock_timeout_ms: 200, stale_lock_ms: 60_000 }, baseEntry()),
      (err: unknown) => {
        assert.ok(err instanceof LinkRegistryError);
        assert.equal(err.reason_code, "ERR_LINK_REGISTRY_LOCK_TIMEOUT");
        return true;
      },
    );
    rmSync(lock);
  });

  test("lock is released after successful upsert", async () => {
    await upsertEntry(config, baseEntry());
    const lock = `${config.registry_path}.lock`;
    assert.equal(existsSync(lock), false);
  });

  test("lock is released after failed upsert (corrupt JSON)", async () => {
    writeFileSync(config.registry_path, "{ not valid json");
    await assert.rejects(upsertEntry(config, baseEntry()));
    const lock = `${config.registry_path}.lock`;
    assert.equal(existsSync(lock), false);
  });

  test("concurrent upserts serialize via lock", async () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      upsertEntry(
        config,
        baseEntry({
          shopid: `shop_${i}`,
          itemid: `item_${i}`,
          product_name: `Product ${i}`,
          short_link: `https://s.shopee.vn/CONC_${i}`,
          canonical_url: `https://shopee.vn/opaanlp/shop_${i}/item_${i}?utm_source=an_17376660568`,
        }),
      ),
    );
    const results = await Promise.all(tasks);
    assert.equal(results.length, 5);
    assert.ok(results.every((r) => r.inserted), `inserted flags: ${results.map((r) => r.inserted).join(",")}`);
    const reg = JSON.parse(readFileSync(config.registry_path, "utf-8")) as LinkRegistry;
    assert.equal(reg.entries.length, 5);
  });

  test("findExistingEntry priority: shopid+itemid > canonical > short_link > name", () => {
    const reg: LinkRegistry = {
      schema_version: "0.1.0",
      updated_at: "now",
      expected_affiliate_owner_id: OWNER,
      entries: [
        {
          ...baseEntry({ product_name: "by_id" }),
          first_seen_at: "x",
          last_seen_at: "x",
          times_seen: 1,
        },
      ],
      rejected: [],
    };
    const hit = findExistingEntry(reg, { shopid: "1820797160", itemid: "55110800126" });
    assert.equal(hit?.product_name, "by_id");
  });
});
