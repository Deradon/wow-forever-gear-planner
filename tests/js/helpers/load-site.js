"use strict";
// Load site/data and site/lib in one vm context, the way the page loads them (docs/release-maintenance.md §7.1):
// the <script src> order of site/index.html when it exists, else the M1 order below. Returns {data, lib, ctx}.

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SITE = path.resolve(__dirname, "..", "..", "..", "site");
const DEFAULT_ORDER = [
  "data/forever/meta.js", "data/forever/rules.js", "data/forever/roles.js", "data/forever/items.js",
  "data/forever/recipes.js", "data/forever/mats.js", "data/forever/sources.js", "data/forever/reference.js",
  "lib/version.js", "lib/lua-literal.js", "lib/cbor.js", "lib/auctionator.js", "lib/pricing.js", "lib/state.js", "lib/rank.js",
];

function scriptOrder() {
  const html = path.join(SITE, "index.html");
  if (!fs.existsSync(html)) return DEFAULT_ORDER;
  const srcs = [];
  const re = /<script[^>]*\ssrc="([^"]+)"/g;
  let m;
  const text = fs.readFileSync(html, "utf8");
  while ((m = re.exec(text))) srcs.push(m[1].replace(/\?.*$/, ""));
  return srcs.filter((s) => s.startsWith("data/") || s.startsWith("lib/"));
}

function loadSite(order) {
  const ctx = { TextDecoder, console };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const rel of order || scriptOrder()) {
    const file = path.join(SITE, rel);
    vm.runInContext(fs.readFileSync(file, "utf8"), ctx, { filename: file });
  }
  return { data: ctx.FGP_DATA, lib: ctx.FGP, ctx };
}

module.exports = { loadSite, scriptOrder, SITE, DEFAULT_ORDER };
