"use strict";
// Invariants over the committed site/data (docs/release-maintenance.md §7.2, data-model §3.2).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const emit = require("../../pipeline/emit");
const version = require("../../site/lib/version");
const rank = require("../../site/lib/rank");
const { loadSite, SITE } = require("./helpers/load-site");

const DATA = path.join(SITE, "data", "forever");
const SECTIONS = ["meta", "items", "recipes", "mats", "sources", "rules", "roles", "reference"];
const files = {};
for (const s of SECTIONS) files[s] = fs.readFileSync(path.join(DATA, `${s}.js`), "utf8");
const { data } = loadSite();

test("each file defines only its own section and no other globals", () => {
  for (const s of SECTIONS) {
    const ctx = {};
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(files[s], ctx);
    assert.deepStrictEqual(Object.keys(ctx).sort(), ["FGP_DATA", "window"], s);
    assert.deepStrictEqual(Object.keys(ctx.FGP_DATA), [s]);
  }
});

test("header, line-3 contract, dataset and build keys, schema", () => {
  for (const s of SECTIONS) {
    assert.strictEqual(files[s].split("\n")[0], emit.HEADER, s);
    const v = emit.parse(files[s]).value;
    assert.strictEqual(v.dataset, data.meta.dataset, s);
    assert.strictEqual(v.build, data.meta.build, s);
  }
  assert.strictEqual(data.meta.schema, version.SUPPORTED_SCHEMA);
  assert.strictEqual(data.meta.dataset, version.DATASET);
  assert.ok(["beta", "live"].includes(data.meta.status));
});

test("meta.dataHash matches the files (nobody edited them by hand)", () => {
  assert.strictEqual(data.meta.dataHash, emit.dataHash(files));
});

test("items: IDs, levels, professions, finite numbers", () => {
  const profs = new Set(data.rules.professions.map((p) => p.name));
  const finite = (v, at) => {
    if (typeof v === "number") assert.ok(Number.isFinite(v), at);
    else if (v && typeof v === "object") for (const k of Object.keys(v)) finite(v[k], `${at}.${k}`);
  };
  for (const [id, it] of Object.entries(data.items.rows)) {
    assert.ok(/^[1-9]\d*$/.test(id), id);
    assert.ok(it.req >= 0 && it.req <= 60, `${id} req`);
    assert.ok(["ok", "unconfirmed", "unobtainable"].includes(it.avail), `${id} avail`);
    assert.ok(it.recipes.length > 0, `${id} recipes`);
    for (const r of it.recipes) assert.ok(profs.has(data.recipes.rows[r].prof), `${id} profession`);
    if (it.equipSkill) assert.ok(profs.has(it.equipSkill.prof), `${id} equip skill`);
    finite(it, id);
  }
});

test("recipes resolve: products, mats, sources never empty", () => {
  for (const [spell, r] of Object.entries(data.recipes.rows)) {
    if (r.kind === "gear") assert.ok(data.items.rows[r.item], `${spell} product`);
    else assert.ok(data.mats.rows[r.item], `${spell} intermediate product`);
    for (const [m, n] of r.mats) { assert.ok(data.mats.rows[m], `${spell} mat ${m}`); assert.ok(n > 0); }
    assert.ok((data.sources.rows[spell] || []).length > 0, `${spell} sources`);
  }
  for (const [id, m] of Object.entries(data.mats.rows)) for (const s of m.madeBy) assert.ok(data.recipes.rows[s], `${id} madeBy ${s}`);
});

test("size budgets: each file ≤ 2.5 MB, site ≤ 4 MB", () => {
  let total = 0;
  const walk = (dir) => {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f), st = fs.statSync(p);
      if (st.isDirectory()) walk(p); else total += st.size;
    }
  };
  for (const s of SECTIONS) assert.ok(Buffer.byteLength(files[s]) <= 2.5 * 1024 * 1024, s);
  walk(SITE);
  assert.ok(total <= 4 * 1024 * 1024, `site/ is ${total} bytes`);
});

test("every class and role has a candidate for every armor slot somewhere in 1–60", () => {
  const armorSlots = ["Head", "Shoulder", "Back", "Chest", "Wrist", "Hands", "Waist", "Legs", "Feet"];
  const all = data.rules.professions.filter((p) => p.kind === "crafting").map((p) => p.name);
  for (const [cls, c] of Object.entries(data.roles.classes)) {
    for (const r of c.roles) {
      // Two crafting professions per entry; together the two entries of the roster cover all six.
      const a = { id: "ra00001", cls, role: r.role, level: 60, professions: all.slice(0, 2).map((id) => ({ id, skill: null })), options: {} };
      const b = { id: "ra00002", cls: "Mage", role: "caster", level: 60, professions: all.slice(2, 4).map((id) => ({ id, skill: null })), options: {} };
      const cs = rank.candidates(data, { faction: "alliance", includeAH: true, entries: [a, b] }, a, {});
      for (const slot of armorSlots) assert.ok(cs.list.some((x) => x.item.slot === slot && x.places.slot), `${cls} ${r.role} ${slot}`);
    }
  }
});

test("site/lib: each module loads as a classic script and under require(), with the same API, no DOM or storage", () => {
  const names = { "version.js": "version", "lua-literal.js": "luaLiteral", "cbor.js": "cbor", "auctionator.js": "auctionator", "pricing.js": "pricing", "state.js": "state", "rank.js": "rank", "queue.js": "queue" };
  const dir = path.join(SITE, "lib");
  assert.deepStrictEqual(fs.readdirSync(dir).sort(), Object.keys(names).sort());
  for (const [file, name] of Object.entries(names)) {
    const src = fs.readFileSync(path.join(dir, file), "utf8");
    assert.ok(!/\b(document|localStorage|sessionStorage|fetch\(|setTimeout|setInterval)/.test(src) && !/^\s*(import|export)\s/m.test(src), `${file} touches the DOM, storage, timers or modules`);
    const ctx = { TextDecoder };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(src, ctx);
    assert.deepStrictEqual(Object.keys(ctx.FGP), [name], file);
    assert.deepStrictEqual(Object.keys(ctx.FGP[name]).sort(), Object.keys(require(path.join(dir, file))).sort(), file);
  }
});
