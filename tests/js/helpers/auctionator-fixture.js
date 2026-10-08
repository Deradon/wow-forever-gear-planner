"use strict";
// Synthetic Auctionator saved-variables files (docs/pricing-import.md §8): a CBOR encoder in Blizzard's style
// (byte strings, [] for empty tables, minimal-length integers) and in LibCBOR's style (text strings, float64),
// a Lua string escaper in Blizzard's style (\n \r \" \\ \000, every other byte raw) and a file writer.
// Never a real player's file.

function head(mt, n, out) {
  if (n < 24) out.push((mt << 5) | n);
  else if (n < 0x100) out.push((mt << 5) | 24, n);
  else if (n < 0x10000) out.push((mt << 5) | 25, n >> 8, n & 0xff);
  else if (n < 0x100000000) out.push((mt << 5) | 26, (n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  else {
    const hi = Math.floor(n / 0x100000000), lo = n >>> 0;
    out.push((mt << 5) | 27, (hi >>> 24) & 0xff, (hi >>> 16) & 0xff, (hi >>> 8) & 0xff, hi & 0xff, (lo >>> 24) & 0xff, (lo >>> 16) & 0xff, (lo >>> 8) & 0xff, lo & 0xff);
  }
}

// style: "blizzard" (strings as byte strings) or "libcbor" (text strings, non-integers as float64).
function encode(v, style, out) {
  out = out || [];
  if (v === null || v === undefined) out.push(0xf6);
  else if (v === true) out.push(0xf5);
  else if (v === false) out.push(0xf4);
  else if (typeof v === "number") {
    if (Number.isInteger(v)) { if (v >= 0) head(0, v, out); else head(1, -1 - v, out); }
    else {
      const b = Buffer.alloc(8);
      b.writeDoubleBE(v);
      out.push(0xfb, ...b);
    }
  } else if (typeof v === "string") {
    const b = Buffer.from(v, style === "libcbor" ? "utf8" : "latin1");
    head(style === "libcbor" ? 3 : 2, b.length, out);
    out.push(...b);
  } else if (Array.isArray(v)) { head(4, v.length, out); for (const x of v) encode(x, style, out); }
  else if (v instanceof Map || typeof v === "object") {
    const entries = v instanceof Map ? [...v.entries()] : Object.entries(v);
    if (!entries.length) { out.push(0x80); return out; }
    head(5, entries.length, out);
    for (const [k, x] of entries) { encode(String(k), style, out); encode(x, style, out); }
  }
  return out;
}

function encodeBytes(v, style) { return Uint8Array.from(encode(v, style || "blizzard")); }

// Blizzard's saved-variables string escaping: only \n \r \" \\ and \000; every other byte raw.
function luaString(bytes) {
  const out = [0x22];
  for (const c of bytes) {
    if (c === 10) out.push(0x5c, 0x6e);
    else if (c === 13) out.push(0x5c, 0x72);
    else if (c === 0x22) out.push(0x5c, 0x22);
    else if (c === 0x5c) out.push(0x5c, 0x5c);
    else if (c === 0) out.push(0x5c, 0x30, 0x30, 0x30);
    else out.push(c);
  }
  out.push(0x22);
  return out;
}

function luaValue(v, nl) {
  if (v === null) return Buffer.from("nil");
  if (typeof v === "boolean" || typeof v === "number") return Buffer.from(String(v));
  if (typeof v === "string") return Buffer.from(luaString(Buffer.from(v, "latin1")));
  if (v instanceof Uint8Array) return Buffer.from(luaString(v));
  const parts = [Buffer.from("{" + nl)];
  if (Array.isArray(v)) v.forEach((x, i) => parts.push(luaValue(x, nl), Buffer.from(`, -- [${i + 1}]${nl}`)));
  else {
    const entries = v instanceof Map ? [...v.entries()] : Object.entries(v);
    for (const [k, x] of entries) {
      const key = /^\d+$/.test(String(k)) ? Buffer.from(`[${k}]`) : Buffer.concat([Buffer.from("["), Buffer.from(luaString(Buffer.from(String(k), "utf8"))), Buffer.from("]")]);
      parts.push(key, Buffer.from(" = "), luaValue(x, nl), Buffer.from("," + nl));
    }
  }
  parts.push(Buffer.from("}"));
  return Buffer.concat(parts);
}

// A whole Auctionator.lua: the other globals around the price database, CRLF by default.
// realms: {label: {format: "cbor" | "libcbor" | "table", data: Map|object}}; db: null writes `= nil`.
function writeFile(realms, opts) {
  opts = opts || {};
  const nl = opts.lf ? "\n" : "\r\n";
  const parts = [];
  const stmt = (name, v) => parts.push(Buffer.from(`${name} = `), v, Buffer.from(nl));
  stmt("AUCTIONATOR_CONFIG", luaValue({ __dbversion: 1, show_selling_bag_info: true, undercut_percentage: 0.95, nested: { a: [1, 2, 3] } }, nl));
  stmt("AUCTIONATOR_SAVEDVARS", luaValue({ __dbversion: 6 }, nl));
  stmt("AUCTIONATOR_SHOPPING_LISTS", luaValue([{ name: "Mats", items: ["Linen Cloth", "Wool Cloth"] }], nl));
  if (opts.db === null) stmt("AUCTIONATOR_PRICE_DATABASE", Buffer.from("nil"));
  else if (opts.db !== false) {
    const db = new Map([["__dbversion", opts.dbVersion === undefined ? 8 : opts.dbVersion]]);
    for (const [label, r] of Object.entries(realms || {})) {
      if (r.format === "table") db.set(label, r.data);
      else db.set(label, encodeBytes(r.data, r.format === "libcbor" ? "libcbor" : "blizzard"));
    }
    stmt("AUCTIONATOR_PRICE_DATABASE", luaValue(db, nl));
  }
  stmt("AUCTIONATOR_POSTING_HISTORY", luaValue({}, nl));
  stmt("AUCTIONATOR_VENDOR_PRICE_CACHE", luaValue({ __dbversion: 1, 2589: 10 }, nl));
  if (opts.extra) parts.push(Buffer.from(opts.extra));
  return new Uint8Array(Buffer.concat(parts));
}

// Seeded PRNG (mulberry32) for the round-trip test.
function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// One Auctionator realm database with its expected rows {id: [m, lastDay, qty]}.
function randomRealm(rand, items, newestDay) {
  const data = new Map([["version", 2]]), expect = {};
  const used = new Set();
  for (let i = 0; i < items; i++) {
    let id;
    do { id = 1 + Math.floor(rand() * 300000); } while (used.has(id));
    used.add(id);
    const nd = Math.floor(rand() * 22), days = [];
    for (let d = 0; d < nd; d++) days.push(newestDay - Math.floor(rand() * 21));
    const uniq = [...new Set(days)].sort((a, b) => a - b);
    const m = 1 + Math.floor(rand() * 4294967295);
    const h = new Map(), a = new Map(), l = new Map();
    for (const d of uniq) {
      h.set(String(d), m + Math.floor(rand() * 1000));
      a.set(String(d), Math.floor(rand() * 500));
      if (rand() < 0.3) l.set(String(d), Math.max(1, m - 5));
    }
    data.set(String(id), new Map([["m", m], ["h", h.size ? h : []], ["l", l.size ? l : []], ["a", a.size ? a : []]]));
    const last = uniq.length ? uniq[uniq.length - 1] : null;
    expect[id] = [m, last, last === null ? null : a.get(String(last))];
  }
  return { data, expect };
}

module.exports = { encode, encodeBytes, luaString, luaValue, writeFile, prng, randomRealm };
