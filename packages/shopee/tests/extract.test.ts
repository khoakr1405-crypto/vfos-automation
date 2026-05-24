import { test } from "node:test";
import assert from "node:assert/strict";
import { validateShopeeAffiliateLink } from "../src/extract.ts";

const TRACK_FULL =
  "gads_t_sig=sig123&utm_medium=affiliates&utm_source=an_17376660568&utm_campaign=id_x";

test("opaanlp + full tracking → VERIFIED_FROM_LONG_LINK", () => {
  const r = validateShopeeAffiliateLink(
    `https://shopee.vn/opaanlp/1632480189/42874449161?${TRACK_FULL}`,
  );
  assert.equal(r.status, "VERIFIED_FROM_LONG_LINK");
  assert.match(r.notes, /opaanlp deep-link/);
});

test("opaanlp missing gads_t_sig → NEEDS_USER_REVIEW", () => {
  const r = validateShopeeAffiliateLink(
    "https://shopee.vn/opaanlp/1632480189/42874449161?utm_medium=affiliates&utm_source=an_17376660568",
  );
  assert.equal(r.status, "NEEDS_USER_REVIEW");
  assert.match(r.notes, /gads_t_sig/);
});

test("opaanlp missing utm_medium=affiliates → NEEDS_USER_REVIEW", () => {
  const r = validateShopeeAffiliateLink(
    "https://shopee.vn/opaanlp/1632480189/42874449161?gads_t_sig=sig&utm_source=an_17376660568",
  );
  assert.equal(r.status, "NEEDS_USER_REVIEW");
  assert.match(r.notes, /utm_medium/);
});

test("opaanlp with mmp_pid only (no utm_source) → VERIFIED", () => {
  const r = validateShopeeAffiliateLink(
    "https://shopee.vn/opaanlp/1632480189/42874449161?gads_t_sig=sig&utm_medium=affiliates&mmp_pid=an_17376660568",
  );
  assert.equal(r.status, "VERIFIED_FROM_LONG_LINK");
  assert.match(r.notes, /mmp_pid=an_<id>/);
});

test("opaanlp with no affiliate id (neither utm_source nor mmp_pid) → NEEDS_USER_REVIEW", () => {
  const r = validateShopeeAffiliateLink(
    "https://shopee.vn/opaanlp/1632480189/42874449161?gads_t_sig=sig&utm_medium=affiliates",
  );
  assert.equal(r.status, "NEEDS_USER_REVIEW");
  assert.match(r.notes, /expected at least one as an_<id>/);
});

test("plain product URL without tracking → NEEDS_USER_REVIEW", () => {
  const r = validateShopeeAffiliateLink(
    "https://shopee.vn/product-name-i.1632480189.42874449161",
  );
  assert.equal(r.status, "NEEDS_USER_REVIEW");
  assert.match(r.notes, /path=/);
});

test("universal-link + full tracking → VERIFIED (regression)", () => {
  const r = validateShopeeAffiliateLink(
    `https://shopee.vn/universal-link/product/123/456?${TRACK_FULL}`,
  );
  assert.equal(r.status, "VERIFIED_FROM_LONG_LINK");
  assert.match(r.notes, /universal-link path/);
});

test("universal-link with only mmp_pid (no utm_source) → NEEDS_USER_REVIEW", () => {
  const r = validateShopeeAffiliateLink(
    "https://shopee.vn/universal-link/product/123/456?gads_t_sig=sig&utm_medium=affiliates&mmp_pid=an_17376660568",
  );
  assert.equal(r.status, "NEEDS_USER_REVIEW");
  assert.match(r.notes, /utm_source/);
});

test("empty link → FAILED", () => {
  const r = validateShopeeAffiliateLink("");
  assert.equal(r.status, "FAILED");
});

test("non-URL → FAILED", () => {
  const r = validateShopeeAffiliateLink("not a url");
  assert.equal(r.status, "FAILED");
});

test("non-shopee host with opaanlp shape → NEEDS_USER_REVIEW", () => {
  const r = validateShopeeAffiliateLink(
    `https://attacker.com/opaanlp/1/2?${TRACK_FULL}`,
  );
  assert.equal(r.status, "NEEDS_USER_REVIEW");
  assert.match(r.notes, /host=/);
});

test("real user short-link resolve fixture → VERIFIED", () => {
  const r = validateShopeeAffiliateLink(
    "https://shopee.vn/opaanlp/1632480189/42874449161?__mobile__=1&credential_token=REDACTED&gads_t_sig=REDACTED&mmp_pid=an_17376660568&utm_medium=affiliates&utm_source=an_17376660568&utm_campaign=id_jVoYPKciUR",
  );
  assert.equal(r.status, "VERIFIED_FROM_LONG_LINK");
});
