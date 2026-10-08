"use strict";
// Static-page constraints (docs/roadmap.md §M1, synthesis D3, D4, D7): classic scripts in a fixed order, relative
// paths, no modules, no fetch, no external requests. The page must work from file:// with networking off. The one
// exception is the opt-in icon switch (D7 as amended 2026-10-08): one image host, used only behind prefs.icons.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { SITE } = require("./helpers/load-site");

const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const css = fs.readFileSync(path.join(SITE, "style.css"), "utf8");
const list = (dir) => fs.readdirSync(path.join(SITE, dir)).filter((f) => f.endsWith(".js")).map((f) => `${dir}/${f}`);
const codeFiles = [...list("lib"), ...list("app")];
const code = Object.fromEntries(codeFiles.map((f) => [f, fs.readFileSync(path.join(SITE, f), "utf8")]));
const srcs = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]*)"/g)].map((m) => m[1]);
const attrs = [...html.matchAll(/\s(?:src|href)="([^"]*)"/g)].map((m) => m[1]);

test("index.html: classic scripts only, every script and stylesheet relative and on disk", () => {
  assert.doesNotMatch(html, /type\s*=\s*["']?module/i);
  assert.doesNotMatch(html, /<script\b[^>]*\s(?:async|defer)\b/i, "scripts run in document order");
  for (const a of attrs) {
    if (a.startsWith("#")) continue;
    assert.doesNotMatch(a, /^(\/|[a-z]+:)/i, `not relative: ${a}`);
    assert.ok(fs.existsSync(path.join(SITE, a)), `missing: ${a}`);
  }
  assert.ok(attrs.includes("style.css"));
});

test("index.html: script order data → lib → app, every data, lib and app file referenced once", () => {
  const kind = (s) => s.split("/")[0];
  const order = srcs.map(kind);
  assert.deepStrictEqual(order, [...order].sort((a, b) => ["data", "lib", "app"].indexOf(a) - ["data", "lib", "app"].indexOf(b)));
  assert.strictEqual(new Set(srcs).size, srcs.length, "no script twice");
  const want = [...list("data/forever"), ...list("lib"), ...list("app")];
  assert.deepStrictEqual([...srcs].sort(), want.sort());
  assert.strictEqual(srcs[srcs.length - 1].startsWith("app/"), true);
  assert.strictEqual(srcs.indexOf("app/main.js"), srcs.findIndex((s) => s.startsWith("app/")), "main.js first of the app scripts");
});

test("index.html: a pre-paint theme script reads the state key before the stylesheet applies", () => {
  const head = html.slice(0, html.indexOf("</head>"));
  assert.match(head, /<script>[\s\S]*forever-gear-planner\.state[\s\S]*data-theme[\s\S]*<\/script>/);
});

test("no modules, fetch, workers, beacons, sockets or dynamic imports anywhere in site code", () => {
  const banned = [/\bfetch\s*\(/, /XMLHttpRequest/, /\bimport\s*\(\s*["'`]/, /^\s*import\s/m, /^\s*export\s/m, /new\s+Worker\b/,
    /sendBeacon/, /WebSocket/, /EventSource/, /createElement\(\s*["']script/, /createElement\(\s*["']img/, /<iframe\b/,
    /\.src\s*=/, /serviceWorker/, /new\s+Image\b/, /<(?:video|audio|source|object|embed)\b/];
  for (const [f, text] of Object.entries(code)) for (const re of banned) assert.doesNotMatch(text, re, `${f}: ${re}`);
  for (const [f, text] of Object.entries(code)) if (f !== "app/tooltip.js") assert.doesNotMatch(text, /<img\b/, `${f}: only the icon helper writes images`);
  assert.doesNotMatch(html, /<img\b/);
  for (const re of banned) assert.doesNotMatch(html.replace(/<script\b[^>]*\ssrc="[^"]*"><\/script>/g, ""), re, `index.html: ${re}`);
});

test("no external requests: CSS has no url() or @import; site code links only to Wowhead item pages", () => {
  assert.doesNotMatch(css, /url\s*\(/i);
  assert.doesNotMatch(css, /@import/i);
  assert.doesNotMatch(html, /https?:\/\//i);
  for (const f of list("lib")) assert.doesNotMatch(code[f], /https?:\/\//, f);
  for (const f of list("app")) {
    for (const m of code[f].matchAll(/https?:\/\/[^\s"'<>)]*/g)) {
      if (f === "app/tooltip.js" && m[0] === ICON_HOST) continue;
      assert.match(m[0], /^https:\/\/www\.wowhead\.com\/forever\/$|^https:\/\/www\.wowhead\.com\/forever\/item=$/, `${f}: ${m[0]}`);
    }
  }
});

// The icon host may appear once, as a constant, and be used only by A.icon, which returns nothing unless the
// visitor switched icons on; the image is lazy and sends no referrer.
const ICON_HOST = "https://wow.zamimg.com/images/wow/icons/small/";
test("icons: one host constant, used only by A.icon behind prefs.icons, lazy and without referrer", () => {
  const all = Object.values(code).join("\n");
  assert.strictEqual(all.split(ICON_HOST).length - 1, 1, "the host string occurs once");
  const tt = code["app/tooltip.js"];
  assert.ok(tt.includes(`var ICON_HOST = "${ICON_HOST}";`), "declared as a constant in tooltip.js");
  const fn = /A\.icon = function \(id\) \{\n([\s\S]*?)\n  \};/.exec(tt);
  assert.ok(fn, "A.icon defined in tooltip.js");
  assert.match(fn[1].split("\n")[0], /^\s*if \(A\.S\.prefs\.icons !== true\) return "";$/, "the pref check comes first");
  assert.strictEqual(tt.split("ICON_HOST").length - 1, 2, "ICON_HOST is declared and used once");
  assert.ok(fn[1].includes("ICON_HOST"), "the one use is inside A.icon");
  assert.strictEqual(tt.split("<img").length - 1, 1, "one image tag");
  assert.ok(fn[1].includes("<img"), "the image tag is inside A.icon");
  assert.match(fn[1], /loading="lazy"/);
  assert.match(fn[1], /referrerpolicy="no-referrer"/);
});

test("no root-relative URLs in the page, the stylesheet or the app code", () => {
  assert.doesNotMatch(html, /\s(?:src|href|action)="\/(?!\/)/);
  for (const [f, text] of Object.entries(code)) assert.doesNotMatch(text, /(?:src|href|action)=\\?["']\/(?!\/)/, f);
});

test("app scripts touch the DOM only after DOMContentLoaded and expose themselves under window.FGP.app", () => {
  for (const f of list("app")) {
    const text = code[f];
    assert.match(text, /^\(function \(root\) \{/m, `${f}: wrapped in the shared IIFE`);
    assert.match(text, /FGP\.app/, f);
  }
  assert.match(code["app/main.js"], /addEventListener\("DOMContentLoaded"/);
});
