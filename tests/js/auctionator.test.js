"use strict";
// Lua-literal reader, CBOR decoder and Auctionator import on synthetic files (docs/pricing-import.md §8).
const test = require("node:test");
const assert = require("node:assert");
const lua = require("../../site/lib/lua-literal");
const cbor = require("../../site/lib/cbor");
const atr = require("../../site/lib/auctionator");
const fx = require("./helpers/auctionator-fixture");

const bytes = (s) => new Uint8Array(Buffer.from(s, "latin1"));
const hex = (h) => new Uint8Array(Buffer.from(h.replace(/\s+/g, ""), "hex"));
const one = (src) => lua.parseFile(bytes(src)).get("X");

// --- Lua literals ----------------------------------------------------------------------------------------------

test("lua: every byte 0–255 round-trips through Blizzard escaping", () => {
  const all = new Uint8Array(256).map((_, i) => i);
  const src = Buffer.concat([Buffer.from("X = "), Buffer.from(fx.luaString(all)), Buffer.from("\r\n")]);
  assert.deepStrictEqual([...lua.parseFile(new Uint8Array(src)).get("X")], [...all]);
});

test("lua: decimal escapes read up to three digits greedily", () => {
  assert.deepStrictEqual([...one('X = "\\0002"')], [0, 50], "\\000 then a digit");
  assert.deepStrictEqual([...one('X = "\\0"')], [0]);
  assert.deepStrictEqual([...one('X = "\\00"')], [0]);
  assert.deepStrictEqual([...one('X = "\\255"')], [255]);
  assert.throws(() => one('X = "\\256"'), /larger than 255/);
  assert.deepStrictEqual([...one("X = 'a\\'b\\n\\t\\\\'")], [97, 39, 98, 10, 9, 92]);
  assert.throws(() => one('X = "\\x41"'), /unsupported escape/);
});

test("lua: tables, positional fields, comments, CRLF, numbers, booleans, nil", () => {
  const v = one('X = {\r\n["a"] = 1, -- [1]\r\n[9] = -2.5e1;\r\nname = true,\r\n--[[ block\r\ncomment ]] "pos", { }, nil, false, 0x1F\r\n}');
  assert.strictEqual(v.get("a"), 1);
  assert.strictEqual(v.get("9"), -25);
  assert.strictEqual(v.get("name"), true);
  assert.deepStrictEqual([...v.get("1")], [...Buffer.from("pos")]);
  assert.ok(v.get("2") instanceof Map, "positional {} is field 2");
  assert.strictEqual(v.get("3"), null);
  assert.strictEqual(v.get("4"), false);
  assert.strictEqual(v.get("5"), 31);
  const w = one("X = {\n--[==[ long ]] still ]==]\n 7 }");
  assert.strictEqual(w.get("1"), 7);
});

test("lua: errors carry the byte offset", () => {
  assert.throws(() => one('X = "open'), (e) => e.name === "LuaError" && e.offset === 4);
  assert.throws(() => one("X = [[long]]"), /long strings are not supported at byte 4/);
  assert.throws(() => one("X = {1 2}"), /expected , or }/);
  assert.throws(() => lua.parseFile(bytes("X = 1 + 2")), /expected a global name at byte 6/);
  assert.throws(() => lua.parseFile(bytes("X 1")), /expected = after X/);
});

test("lua: an unexpected token in an unrelated global falls back to the price database line", () => {
  const src = 'OTHER = { f = function() end }\r\nAUCTIONATOR_PRICE_DATABASE = {\r\n["__dbversion"] = 8,\r\n}\r\n';
  const g = lua.readGlobal(bytes(src), "AUCTIONATOR_PRICE_DATABASE");
  assert.strictEqual(g.fallback, true);
  assert.strictEqual(g.value.get("__dbversion"), 8);
  assert.throws(() => lua.readGlobal(bytes("OTHER = function"), "AUCTIONATOR_PRICE_DATABASE"), /LuaError|unexpected/);
});

// --- CBOR ------------------------------------------------------------------------------------------------------

test("cbor: RFC 8949 Appendix A vectors of the supported subset", () => {
  const cases = [
    ["00", 0], ["17", 23], ["1818", 24], ["18ff", 255], ["190100", 256], ["19ffff", 65535], ["1a00010000", 65536],
    ["1affffffff", 4294967295], ["1b0000000100000000", 4294967296], ["20", -1], ["3903e7", -1000],
    ["40", ""], ["6161", "a"], ["f4", false], ["f5", true], ["f6", null], ["f7", null],
    ["f93e00", 1.5], ["fa3fc00000", 1.5], ["fb3ff8000000000000", 1.5], ["f97c00", Infinity], ["f90001", 5.960464477539063e-8],
    ["c11a514b67b0", 1363896240],
  ];
  for (const [h, want] of cases) assert.strictEqual(cbor.decode(hex(h)), want, h);
  assert.deepStrictEqual(cbor.decode(hex("80")), []);
  assert.deepStrictEqual(cbor.decode(hex("8301820203820405")), [1, [2, 3], [4, 5]]);
  assert.deepStrictEqual([...cbor.decode(hex("a10102"))], [["1", 2]]);
  assert.deepStrictEqual([...cbor.decode(hex("a1616101"))], [["a", 1]]);
  assert.strictEqual(cbor.decode(hex("4401020304")), "\x01\x02\x03\x04");
  assert.strictEqual(cbor.decode(hex("62c3bc")), "ü");
});

test("cbor: rejections with offsets", () => {
  assert.throws(() => cbor.decode(hex("5f42010243030405ff")), /indefinite length not supported at byte 0/);
  assert.throws(() => cbor.decode(hex("1c")), /reserved/);
  assert.throws(() => cbor.decode(hex("1a0001")), /truncated at byte 0/);
  assert.throws(() => cbor.decode(hex("0000")), /trailing bytes after the root item at byte 1/);
  assert.throws(() => cbor.decode(hex("81".repeat(34) + "00")), /nested deeper/);
  assert.throws(() => cbor.decode(hex("1b0020000000000001")), /above 2\^53/);
  assert.throws(() => cbor.decode(hex("f8ff")), /unsupported simple value/);
  assert.throws(() => cbor.decode(hex("82 01")), /truncated at byte 2/);
});

// --- import ----------------------------------------------------------------------------------------------------

const TODAY = 2471;
const entry = (m, days) => {
  const h = new Map(), a = new Map();
  for (const [d, q] of days) { h.set(String(d), m + 10); a.set(String(d), q); }
  return new Map([["m", m], ["h", h.size ? h : []], ["l", []], ["a", a.size ? a : []]]);
};

test("import: two realms (CBOR and plain Lua table), skipped keys, version ignored", () => {
  const cborData = new Map([["version", 2], ["2589", entry(55, [[2469, 3], [2471, 7]])], ["g:12345:170", entry(1, [[2471, 1]])], ["p:39", entry(1, [[2471, 1]])], ["2592", entry(0, [[2471, 1]])]]);
  const tableData = new Map([["version", 2], ["2589", entry(60, [[2460, 1]])]]);
  const file = fx.writeFile({ "Realm Ünïcode": { format: "cbor", data: cborData }, "Other Realm": { format: "table", data: tableData } });
  const res = atr.readFile(file, { today: TODAY, isKnown: (id) => id === 2589 });
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.dbVersion, 8);
  const a = res.realms.find((r) => r.label === "Realm Ünïcode"), b = res.realms.find((r) => r.label === "Other Realm");
  assert.deepStrictEqual(a.rows, { 2589: [55, 2471, 7] });
  assert.deepStrictEqual(a.skipped, { nonNumeric: 2, invalid: 1 });
  assert.strictEqual(a.newestDay, 2471);
  assert.deepStrictEqual(b.rows, { 2589: [60, 2460, 1] });
  assert.strictEqual(atr.defaultRealm(res.realms).label, "Realm Ünïcode", "newest scan preselected");
  assert.strictEqual(atr.defaultRealm(res.realms, b.key).label, "Other Realm", "remembered key wins");
});

test("import: LibCBOR style (text strings, float64) decodes the same rows", () => {
  const data = new Map([["version", 2], ["2589", entry(55, [[2471, 4]])], ["2590", new Map([["m", 1.5], ["h", []], ["l", []], ["a", []]])]]);
  const res = atr.readFile(fx.writeFile({ R: { format: "libcbor", data } }, { lf: true }), { today: TODAY });
  assert.deepStrictEqual(res.realms[0].rows, { 2589: [55, 2471, 4] });
  assert.strictEqual(res.realms[0].skipped.invalid, 1, "non-integer price rejected");
});

test("import: messages for missing, switched-off and unknown data", () => {
  assert.strictEqual(atr.readFile(bytes("this is not lua")).error.code, "not-lua");
  assert.strictEqual(atr.readFile(fx.writeFile({}, { db: false })).error.code, "no-database");
  assert.strictEqual(atr.readFile(fx.writeFile({}, { db: null })).error.code, "database-off");
  assert.strictEqual(atr.readFile(fx.writeFile({})).error.code, "no-realms");
  const v7 = atr.readFile(fx.writeFile({ R: { format: "cbor", data: new Map([["1", entry(5, [[TODAY, 1]])]]) } }, { dbVersion: 7 }), { today: TODAY });
  assert.ok(v7.ok && v7.warnings.some((w) => w.code === "version"));
  const unknown = atr.readFile(fx.writeFile({ R: { format: "cbor", data: new Map([["1", entry(5, [[TODAY, 1]])]]) } }), { today: TODAY, isKnown: () => false });
  assert.ok(unknown.warnings.some((w) => w.code === "unknown-items"));
  const old = atr.readFile(fx.writeFile({ R: { format: "cbor", data: new Map([["1", entry(5, [[TODAY - 30, 1]])]]) } }), { today: TODAY });
  assert.ok(old.warnings.some((w) => w.code === "old" && /30 days/.test(w.text)));
  const future = atr.readFile(fx.writeFile({ R: { format: "cbor", data: new Map([["1", entry(5, [[TODAY + 3, 1]])]]) } }), { today: TODAY });
  assert.ok(future.warnings.some((w) => w.code === "future"));
  const bak = atr.readFile(fx.writeFile({ R: { format: "cbor", data: new Map([["1", entry(5, [[TODAY, 1]])]]) } }), { fileName: "Auctionator.lua.bak" });
  assert.ok(bak.warnings.some((w) => w.code === "backup"));
});

test("import: a damaged realm is skipped, the others stay usable", () => {
  const good = fx.encodeBytes(new Map([["1", entry(5, [[TODAY, 1]])]]));
  const db = new Map([["__dbversion", 8], ["Good", good], ["Bad", good.subarray(0, good.length - 3)]]);
  const file = new Uint8Array(Buffer.concat([Buffer.from("AUCTIONATOR_PRICE_DATABASE = "), fx.luaValue(db, "\r\n"), Buffer.from("\r\n")]));
  const res = atr.readFile(file, { today: TODAY });
  assert.ok(res.ok);
  assert.ok(res.warnings.some((w) => w.code === "realm-damaged" && /truncated at byte/.test(w.text)));
  assert.strictEqual(res.realms.find((r) => r.label === "Bad").usable, false);
  assert.strictEqual(res.realms.find((r) => r.label === "Good").usable, true);
});

test("import: 500 random databases round-trip (seeded)", () => {
  const rand = fx.prng(20261008);
  for (let n = 0; n < 500; n++) {
    const realms = {}, expect = {};
    const count = 1 + Math.floor(rand() * 3);
    for (let k = 0; k < count; k++) {
      const size = rand() < 0.02 ? 5000 : Math.floor(rand() * 60);
      const r = fx.randomRealm(rand, size, 2400 + Math.floor(rand() * 100));
      const label = `Realm ${n}-${k}`;
      realms[label] = { format: rand() < 0.2 ? "table" : "cbor", data: r.data };
      expect[label] = r.expect;
    }
    const res = atr.readFile(fx.writeFile(realms, { lf: rand() < 0.5 }));
    assert.ok(res.ok, `db ${n}: ${res.error && res.error.text}`);
    for (const r of res.realms) assert.deepStrictEqual(r.rows, Object.fromEntries(Object.entries(expect[r.label]).map(([k, v]) => [k, v])), `db ${n} ${r.label}`);
  }
});

test("price sets: shape, filter, change summary, day numbers", () => {
  const res = atr.readFile(fx.writeFile({ R: { format: "cbor", data: new Map([["2589", entry(55, [[TODAY, 3]])], ["9", entry(7, [[TODAY, 1]])]]) } }), { today: TODAY });
  const set = atr.toPriceSet(res.realms[0], { dataset: "forever", build: "1.60.1.70205", fileName: "Auctionator.lua", importedAt: "2026-10-08T14:02" });
  assert.deepStrictEqual(Object.keys(set), ["format", "source", "dataset", "build", "realm", "fileName", "importedAt", "scanDay", "entries", "skipped", "rows"]);
  assert.strictEqual(set.scanDay, TODAY);
  const f = atr.filterRows(set, (id) => id === 2589);
  assert.deepStrictEqual(Object.keys(f.rows), ["2589"]);
  assert.strictEqual(f.entries, 1);
  assert.deepStrictEqual(atr.compareSets({ rows: { 1: [5], 2: [6] } }, { rows: { 1: [5], 2: [7], 3: [1] } }), { changed: 1, added: 1, removed: 0 });
  assert.strictEqual(atr.dayNumber(new Date(2026, 9, 7, 23, 59)), 2471);
  assert.strictEqual(atr.isoDay(2471), "2026-10-07");
});
