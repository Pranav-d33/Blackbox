import test from "node:test";
import assert from "node:assert/strict";
import { cacheControl, pickEncoding } from "../src/static";

test("hashed console assets are immutable, html always revalidates", () => {
  assert.match(cacheControl("console-assets/console-abc123.js"), /immutable/);
  assert.equal(cacheControl("index.html"), "no-cache");
  assert.equal(cacheControl("landing.js"), "no-cache");
  assert.equal(cacheControl("demo/mission.json"), "public, max-age=3600");
  assert.match(cacheControl("vendor/fonts/inter.woff2"), /max-age=86400/);
});

test("text is compressed with brotli when offered, gzip otherwise; images and tiny files are not", () => {
  assert.equal(pickEncoding("gzip, deflate, br", "text/javascript; charset=utf-8", 50_000), "br");
  assert.equal(pickEncoding("gzip", "application/json", 50_000), "gzip");
  assert.equal(pickEncoding(undefined, "text/css; charset=utf-8", 50_000), null);
  assert.equal(pickEncoding("br", "image/jpeg", 500_000), null);
  assert.equal(pickEncoding("br", "text/html; charset=utf-8", 300), null);
});
