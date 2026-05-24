#!/usr/bin/env tsx
/**
 * One-shot inspector: dump first product item from HAR's
 * GET /api/v3/offer/product/list response.
 * NEVER prints cookies/headers.
 */
import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { redactSecrets } from "../src/secret-redaction.js";

const HAR = resolve(import.meta.dirname ?? ".", "..", "..", "..", ".secrets", "shopee_product_offer.har");

interface HarEntry {
  request: { method: string; url: string };
  response: { content?: { text?: string } };
}

const har = JSON.parse(readFileSync(HAR, "utf-8")) as { log: { entries: HarEntry[] } };

const entry = har.log.entries.find((e) =>
  e.request.url.includes("/api/v3/offer/product/list") && e.request.method === "GET",
);

if (!entry?.response.content?.text) {
  console.error("Endpoint not found in HAR.");
  process.exit(1);
}

const body = JSON.parse(entry.response.content.text) as Record<string, unknown>;
const data = body["data"] as Record<string, unknown>;
const list = data["list"] as Array<Record<string, unknown>>;

console.log(`Total items in response: ${list.length}`);
console.log(`Top-level data keys: ${Object.keys(data).join(", ")}`);
console.log();
console.log("=== First item (redacted) ===");
const firstItem = list[0];
console.log(redactSecrets(JSON.stringify(firstItem, null, 2)));
