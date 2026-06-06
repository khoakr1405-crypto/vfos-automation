import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  containsSensitiveParams,
  isSensitiveParamName,
  maskUrlForLog,
  sanitizeProductImageUrl,
  sanitizeShopeeCanonicalUrl,
} from "../src/url-sanitize.ts";

const OWNER = "an_17376660568";
const RAW = `https://shopee.vn/opaanlp/1562527322/29487996439?__mobile__=1&credential_token=SECRETVALUE&exp_group=rollout&gads_t_sig=SIGVALUE&mmp_pid=${OWNER}&uls_trackid=abc&utm_campaign=c&utm_content=x&utm_medium=affiliates&utm_source=${OWNER}&utm_term=t`;

describe("isSensitiveParamName", () => {
  test("flags credential/session/signature names", () => {
    for (const n of ["credential_token", "gads_t_sig", "session_id", "auth", "cookie", "x_signature", "otp"]) {
      assert.equal(isSensitiveParamName(n), true, `${n} should be sensitive`);
    }
  });
  test("keeps public tracking names", () => {
    for (const n of ["utm_source", "utm_medium", "mmp_pid", "exp_group", "__mobile__", "uls_trackid"]) {
      assert.equal(isSensitiveParamName(n), false, `${n} should be public`);
    }
  });
});

describe("sanitizeShopeeCanonicalUrl", () => {
  test("strips credential_token + gads_t_sig, keeps tracking + owner", () => {
    const { cleanUrl, strippedParams, keptParams } = sanitizeShopeeCanonicalUrl(RAW);
    assert.deepEqual(strippedParams.sort(), ["credential_token", "gads_t_sig"]);
    assert.ok(!cleanUrl.includes("SECRETVALUE"));
    assert.ok(!cleanUrl.includes("SIGVALUE"));
    assert.ok(!cleanUrl.includes("credential_token"));
    assert.ok(cleanUrl.includes(OWNER)); // utm_source / mmp_pid survive
    assert.ok(keptParams.includes("utm_source"));
    assert.ok(keptParams.includes("mmp_pid"));
  });

  test("is idempotent and yields a clean URL", () => {
    const once = sanitizeShopeeCanonicalUrl(RAW).cleanUrl;
    const twice = sanitizeShopeeCanonicalUrl(once);
    assert.equal(twice.cleanUrl, once);
    assert.equal(twice.strippedParams.length, 0);
    assert.equal(containsSensitiveParams(once), false);
  });

  test("non-URL input returns unchanged with empty lists", () => {
    const r = sanitizeShopeeCanonicalUrl("not a url");
    assert.equal(r.cleanUrl, "not a url");
    assert.deepEqual(r.strippedParams, []);
  });
});

describe("containsSensitiveParams", () => {
  test("true for raw, false for sanitized", () => {
    assert.equal(containsSensitiveParams(RAW), true);
    assert.equal(containsSensitiveParams(sanitizeShopeeCanonicalUrl(RAW).cleanUrl), false);
  });
  test("does not flag a path segment that merely contains 'token'", () => {
    assert.equal(containsSensitiveParams("https://shopee.vn/token-store/1/2?utm_source=" + OWNER), false);
  });
});

describe("sanitizeProductImageUrl", () => {
  const CDN = "https://down-vn.img.susercontent.com/file/abc123";

  test("accepts a safe Shopee CDN image URL unchanged", () => {
    assert.equal(sanitizeProductImageUrl(CDN), CDN);
  });

  test("normalizes a protocol-relative CDN URL to https", () => {
    assert.equal(
      sanitizeProductImageUrl("//down-vn.img.susercontent.com/file/abc123"),
      CDN,
    );
  });

  test("rejects URLs carrying credential/tracking/signature substrings", () => {
    for (const bad of [
      `${CDN}?credential_token=x`,
      `${CDN}?mmp_pid=${OWNER}`,
      `${CDN}?gads_t_sig=sig`,
      `${CDN}?utm_source=${OWNER}`,
      `${CDN}?session=1`,
      "https://deo.shopeemobile.com/shopee/shopee-affiliate-live-vn/static/img/label_xtra_vn.ffa19363.svg",
      "https://example.com/logo.png",
      "https://example.com/badge.jpg",
      "https://example.com/icon.png",
    ]) {
      assert.equal(sanitizeProductImageUrl(bad), null, `${bad} should be rejected`);
    }
  });

  test("rejects non-http(s) and unparseable input", () => {
    assert.equal(sanitizeProductImageUrl("javascript:alert(1)"), null);
    assert.equal(sanitizeProductImageUrl("not a url"), null);
    assert.equal(sanitizeProductImageUrl("ftp://host/file/x"), null);
  });

  test("returns null for empty/null/undefined/non-string", () => {
    assert.equal(sanitizeProductImageUrl(""), null);
    assert.equal(sanitizeProductImageUrl("   "), null);
    assert.equal(sanitizeProductImageUrl(null), null);
    assert.equal(sanitizeProductImageUrl(undefined), null);
    assert.equal(sanitizeProductImageUrl(123), null);
  });
});

describe("maskUrlForLog", () => {
  test("keeps host+path, replaces query with param names only", () => {
    const masked = maskUrlForLog(RAW);
    assert.ok(masked.startsWith("https://shopee.vn/opaanlp/1562527322/29487996439?{"));
    assert.ok(!masked.includes("SECRETVALUE"));
    assert.ok(masked.includes("credential_token")); // name only, no value
  });
});
