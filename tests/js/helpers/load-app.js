"use strict";
// Load the whole page (data, lib and app scripts in index.html order) in one vm context without a DOM, then
// FGP.app.init with an in-memory storage and a fixed clock. Views render to HTML strings; acts and changes take
// small fake elements. DOM wiring (events, focus, drop) is left to the browser check.

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { SITE } = require("./load-site");

function memStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    map: m,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

const html = fs.readFileSync(path.join(SITE, "index.html"), "utf8");
const ORDER = [...html.matchAll(/<script\b[^>]*\ssrc="([^"]+)"/g)].map((m) => m[1]);

// opts: {storage, now (Date), seed}. Returns {A, FGP, data, ctx, storage}.
function loadApp(opts) {
  opts = opts || {};
  const ctx = { TextDecoder, console, setTimeout, clearTimeout };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const rel of ORDER) vm.runInContext(fs.readFileSync(path.join(SITE, rel), "utf8"), ctx, { filename: rel });
  const storage = opts.storage || memStorage();
  const now = opts.now || new Date(2026, 9, 8, 12, 0);
  const A = ctx.FGP.app;
  A.init({ storage, now: () => now, random: seeded(opts.seed || 7) });
  return { A, FGP: ctx.FGP, data: ctx.FGP_DATA, ctx, storage };
}

// A fake element for acts/changes: data-* attributes, value, checked, name, form.
function el(attrs, props) {
  return Object.assign({ getAttribute: (k) => (attrs && k in attrs ? attrs[k] : null), id: (attrs && attrs.id) || "" }, props || {});
}

// A fake <form> whose elements.namedItem returns {value, checked} for the given values.
function form(values) {
  return {
    elements: { namedItem: (n) => (n in values ? { value: values[n] === true ? "on" : String(values[n]), checked: values[n] === true } : null) },
    querySelector: () => null,
  };
}

const plain = (v) => JSON.parse(JSON.stringify(v));

module.exports = { loadApp, memStorage, el, form, plain, ORDER };
