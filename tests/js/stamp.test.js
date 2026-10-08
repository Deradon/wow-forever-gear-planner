"use strict";
// tools/stamp.js (docs/release-maintenance.md §5.3): content-hash stamps on the deploy copy of index.html.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { stamp } = require("../../tools/stamp");
const { SITE } = require("./helpers/load-site");

test("every local script and stylesheet gets ?v=<sha256 prefix>; anchors and absolute URLs stay", () => {
  const { html, stamped } = stamp(SITE);
  const plain = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
  const local = [...plain.matchAll(/\s(?:src|href)="([^"#]+)"/g)].map((m) => m[1]);
  assert.deepStrictEqual(stamped, local);
  const h = crypto.createHash("sha256").update(fs.readFileSync(path.join(SITE, "app/main.js"))).digest("hex").slice(0, 10);
  assert.ok(html.includes(`src="app/main.js?v=${h}"`));
  assert.ok(html.includes('href="#view"'), "in-page anchors untouched");
  assert.strictEqual(html.replace(/\?v=[0-9a-f]{10}/g, ""), plain, "only the stamps differ");
});

test("a missing referenced file fails the stamp", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fgp-stamp-"));
  fs.writeFileSync(path.join(dir, "index.html"), '<script src="gone.js"></script><a href="https://example.com/">x</a>');
  assert.throws(() => stamp(dir), /gone\.js/);
});
