"use strict";
// The crafting queue of site/lib/queue.js on the committed data (docs/ui.md §5, pricing-import.md §5.2).
const test = require("node:test");
const assert = require("node:assert");
const { loadSite } = require("./helpers/load-site");

const { data, lib } = loadSite();
const Q = lib.queue;
const plain = (v) => JSON.parse(JSON.stringify(v));

function E(id, cls, role, level, profs) {
  return { id, cls, role, level, professions: profs.map((p) => (typeof p === "string" ? { id: p, skill: null, spec: null } : p)), options: {} };
}
// The example roster of the page: Mage (Tailoring, Enchanting) 20, Warrior (Mining, Blacksmithing) 14, Rogue 9.
function setup(over) {
  over = over || {};
  const entries = over.entries || [E("rmage01", "Mage", "caster", 20, ["Tailoring", "Enchanting"]), E("rwarr01", "Warrior", "melee", 14, ["Mining", "Blacksmithing"]), E("rrog001", "Rogue", "melee", 9, [])];
  const roster = { faction: "alliance", includeAH: true, entries };
  const pricer = lib.pricing.createPricer(data, { overrides: over.overrides || {}, imported: over.imported || null }, { today: 2470 });
  const state = { items: over.items || {}, recipes: over.recipes || {} };
  const paths = {};
  for (const e of entries) {
    const hidden = {}, inHand = {};
    for (const [k, v] of Object.entries(state.items)) if (k.startsWith(e.id + ":")) { if (v.hidden) hidden[k.split(":")[1]] = true; if (v.status) inHand[k.split(":")[1]] = true; }
    paths[e.id] = lib.rank.path(data, roster, e, { hidden, inHand, costOf: pricer.costOf, via: (over.via || {})[e.id] });
  }
  const q = Q.build(data, roster, paths, state, Object.assign({ pricer, within: 5 }, over.opts || {}));
  return { roster, entries, pricer, paths, q, state };
}
const row = (q, name, crafter) => q.rows.find((r) => r.item.name === name && (!crafter || r.crafter === crafter));

test("rows: one per crafter and recipe spell; BoP only under its own crafter; the AH gets BoE pieces nobody crafts", () => {
  const { q } = setup();
  assert.deepStrictEqual(plain(q.crafters), ["rmage01", "rwarr01"]);
  const keys = new Set();
  for (const r of q.rows) {
    assert.ok(!keys.has(r.key), r.key);
    keys.add(r.key);
    if (r.crafter === "ah") { assert.notStrictEqual(r.item.bind, "BoP", r.item.name); continue; }
    assert.strictEqual(r.key, `${r.crafter}:${r.recipe}`);
    assert.ok(data.items.rows[r.itemId].recipes.includes(r.recipe));
    if (r.item.bind === "BoP") for (const n of r.needs) assert.strictEqual(n.entry, r.crafter, `${r.item.name} is BoP`);
  }
  const mageProfs = new Set(Q.select(q, "rmage01").map((r) => r.prof));
  assert.deepStrictEqual([...mageProfs].sort(), ["Enchanting", "Tailoring"]);
  // The Warrior makes the Rogue's Blacksmithing weapons; the Rogue's leather comes from the AH.
  assert.ok(Q.select(q, "rwarr01").some((r) => r.needs.some((n) => n.entry === "rrog001") && /One-Hand|Main Hand/.test(r.item.slot)));
  const ah = Q.select(q, "ah");
  assert.ok(ah.length > 10 && ah.every((r) => r.crafter === "ah" && r.learned === false));
  assert.ok(ah.some((r) => r.prof === "Leatherworking" && r.needs.some((n) => n.entry === "rrog001")));
  assert.strictEqual(Q.select(q, "all").length, q.rows.length);
  // Sorted by crafter (roster order, AH last), then recipe skill.
  const order = q.rows.map((r) => (r.crafter === "ah" ? 2 : q.crafters.indexOf(r.crafter)));
  assert.deepStrictEqual(plain(order), [...order].sort((a, b) => a - b));
  const mage = Q.select(q, "rmage01").map((r) => r.skill.learn);
  assert.deepStrictEqual(plain(mage), [...mage].sort((a, b) => a - b));
});

test("quantities across entries, pieces in hand and outgrown stretches leave the queue, core only", () => {
  const { q } = setup();
  for (const r of q.rows) assert.strictEqual(r.qty, r.needs.reduce((t, n) => t + n.count, 0));
  const multi = q.rows.find((r) => r.needs.length > 1);
  assert.ok(multi, "some piece is needed by two entries");
  const dual = q.rows.find((r) => r.needs.some((n) => n.count === 2));
  assert.ok(dual, "a dual-wielded weapon counts twice");
  // Mark one need in bags: it leaves the queue; the other entry's need stays.
  const n0 = multi.needs[0], other = multi.needs[1];
  const s2 = setup({ items: { [`${n0.entry}:${multi.itemId}`]: { status: "have" } } });
  const r2 = s2.q.rows.find((r) => r.itemId === multi.itemId && r.crafter === multi.crafter);
  assert.deepStrictEqual(plain(r2.needs.map((n) => n.entry)), [other.entry]);
  assert.strictEqual(r2.qty, multi.qty - n0.count);
  // No need from a stretch the entry has outgrown.
  const { paths, entries } = setup();
  for (const e of entries) for (const n of Q.entryNeeds(paths[e.id], e, {})) {
    const g = paths[e.id].groups.find((g) => g.steps.some((s) => s.items.includes(n.id) && s.to >= e.level));
    assert.ok(g, `${n.id} for ${e.id}`);
  }
  const core = setup({ opts: { core: true } }).q;
  assert.ok(core.rows.length < q.rows.length);
  for (const r of core.rows) for (const n of r.needs) assert.strictEqual(n.core, true);
});

test("within N levels marks the needs the shopping list counts; null means every level", () => {
  const { q } = setup();
  for (const r of q.rows) for (const n of r.needs) assert.strictEqual(n.inWindow, n.level <= n.now + 5);
  assert.ok(q.rows.some((r) => r.needs.some((n) => !n.inWindow)));
  const all = setup({ opts: { within: null } }).q;
  for (const r of all.rows) for (const n of r.needs) assert.strictEqual(n.inWindow, true);
  const zero = setup({ opts: { within: 0 } }).q;
  for (const r of zero.rows) for (const n of r.needs) assert.strictEqual(n.inWindow, n.level <= n.now);
});

test("learned per crafter and recipe spell; skill flags from the entered or estimated skill (D26)", () => {
  const { q } = setup();
  const r = Q.select(q, "rmage01")[0];
  assert.strictEqual(r.learned, false);
  const s = setup({ recipes: { [`rmage01:${r.recipe}`]: "learned" } });
  assert.strictEqual(s.q.rows.find((x) => x.key === r.key).learned, true);
  assert.strictEqual(s.q.rows.filter((x) => x.learned).length, 1, "keyed by crafter and spell, not by item");
  for (const x of Q.select(q, "rmage01")) {
    assert.strictEqual(x.has.estimated, true);
    assert.strictEqual(x.flag, x.has.skill < x.skill.learn ? "~!" : null);
  }
  const entered = setup({ entries: [E("rmage01", "Mage", "caster", 20, [{ id: "Tailoring", skill: 60, spec: null }])] }).q;
  const t = Q.select(entered, "rmage01");
  assert.ok(t.some((x) => x.flag === "!") && t.every((x) => x.flag === (60 < x.skill.learn ? "!" : null)));
});

test("crafter pace: per profession the next three rising skill needs above what the crafter has", () => {
  const { q, entries } = setup();
  const pace = Q.pace(data, q.rows, entries[0]);
  assert.deepStrictEqual(plain(pace.map((p) => p.prof)), ["Tailoring", "Enchanting"]);
  for (const p of pace) {
    assert.strictEqual(p.has.estimated, true);
    assert.strictEqual(p.has.skill, lib.rank.pace(data.roles, 20));
    assert.ok(p.points.length <= 3 && p.points.length > 0);
    for (let i = 0; i < p.points.length; i++) {
      assert.ok(p.points[i].skill > p.has.skill);
      if (i) assert.ok(p.points[i].skill > p.points[i - 1].skill, "rising");
    }
  }
  const ahead = setup({ entries: [E("rmage01", "Mage", "caster", 20, [{ id: "Tailoring", skill: 300, spec: null }])] });
  const p2 = Q.pace(data, ahead.q.rows, ahead.entries[0]);
  assert.deepStrictEqual(plain([p2[0].has, p2[0].points]), [{ skill: 300, estimated: false }, []]);
  assert.deepStrictEqual(plain(Q.pace(data, q.rows, entries[2])), [], "no crafting profession, no pace");
});

test("Auction House list: price with source and age; hidden pieces only with Show hidden", () => {
  const leather = Q.select(setup().q, "ah").find((r) => r.prof === "Leatherworking" && r.needs.some((n) => n.entry === "rrog001"));
  assert.strictEqual(leather.each, null, "no import, no price");
  const imported = { rows: { [leather.itemId]: [12345, 2468, 4] } };
  const r = setup({ imported }).q.rows.find((x) => x.key === leather.key);
  assert.deepStrictEqual(plain([r.each.copper, r.each.source, r.each.age, r.total]), [12345, "ah", 2, 12345 * r.qty]);
  const key = `rrog001:${leather.itemId}`;
  const hid = setup({ items: { [key]: { hidden: true } } });
  assert.ok(!hid.q.rows.some((x) => x.key === leather.key && x.needs.some((n) => n.entry === "rrog001")));
  assert.ok(hid.q.hiddenCount.ah >= 1);
  const shown = setup({ items: { [key]: { hidden: true } }, opts: { showHidden: true } });
  const h = shown.q.rows.find((x) => x.key === leather.key);
  assert.deepStrictEqual(plain(h.hiddenNeeds.map((n) => n.entry)), ["rrog001"]);
});

test("a crafter choice moves the piece between crafters", () => {
  const two = [E("rmage01", "Mage", "caster", 20, ["Tailoring"]), E("rprst01", "Priest", "healer", 18, ["Tailoring"]), E("rrog001", "Rogue", "melee", 9, [])];
  const base = setup({ entries: two }).q;
  const r = Q.select(base, "rmage01").find((x) => x.item.bind === "BoE" && x.needs.some((n) => n.entry !== "rmage01"));
  assert.ok(r);
  const n = r.needs.find((x) => x.entry !== "rmage01");
  const moved = setup({ entries: two, via: { [n.entry]: { [r.itemId]: "rprst01" } } }).q;
  assert.ok(Q.select(moved, "rprst01").some((x) => x.itemId === r.itemId && x.needs.some((m) => m.entry === n.entry)));
  assert.ok(!Q.select(moved, "rmage01").some((x) => x.itemId === r.itemId && x.needs.some((m) => m.entry === n.entry)));
  const toAh = setup({ entries: two, via: { [n.entry]: { [r.itemId]: "ah" } } }).q;
  assert.ok(Q.select(toAh, "ah").some((x) => x.itemId === r.itemId));
});

test("shopping list: mats through intermediates the crafter makes, owned mats lower To buy, never the value (§5.2)", () => {
  const { q, pricer, roster } = setup();
  const rows = Q.select(q, "rmage01");
  const sl = Q.shoppingList(data, pricer, rows, roster, {});
  assert.ok(sl.lines.length > 5);
  const names = sl.lines.map((l) => l.name);
  assert.deepStrictEqual(plain(names), [...names].sort());
  // Bolts are made by the tailor from cloth, so cloth is on the list and the bolt is not.
  const bolt = sl.lines.find((l) => /^Bolt of /.test(l.name)), cloth = sl.lines.find((l) => /^(Linen|Wool|Silk) Cloth$/.test(l.name));
  assert.strictEqual(bolt, undefined);
  assert.ok(cloth && cloth.through.length > 0);
  // Counts: only needs within the window.
  const inWin = rows.filter((r) => r.needs.some((n) => n.inWindow));
  assert.ok(inWin.length < rows.length);
  // Unpriced → unknown; with prices: value = Σ unit × count, To buy uses need = max(0, count − owned).
  const prices = { rows: {} };
  for (const l of sl.lines) prices.rows[l.id] = [100 + l.id % 7, 2470, 20];
  const s2 = setup({ imported: prices });
  const sl2 = Q.shoppingList(data, s2.pricer, Q.select(s2.q, "rmage01"), roster, {});
  assert.strictEqual(sl2.unknown.length, 0);
  const value = sl2.lines.reduce((t, l) => t + l.unit.copper * l.count, 0);
  assert.strictEqual(sl2.value, Math.round(value));
  assert.strictEqual(sl2.toBuy, sl2.value);
  const first = sl2.lines.find((l) => l.unit.source === "ah");
  const owned = { [first.id]: first.count - 1 };
  const sl3 = Q.shoppingList(data, s2.pricer, Q.select(s2.q, "rmage01"), roster, owned);
  assert.strictEqual(sl3.value, sl2.value, "value of mats used unchanged");
  assert.strictEqual(sl3.toBuy, sl2.toBuy - Math.round(first.unit.copper * (first.count - 1)));
  const l3 = sl3.lines.find((l) => l.id === first.id);
  assert.deepStrictEqual([l3.owned, l3.need], [first.count - 1, 1]);
  const over = Q.shoppingList(data, s2.pricer, Q.select(s2.q, "rmage01"), roster, { [first.id]: 9999 }).lines.find((l) => l.id === first.id);
  assert.strictEqual(over.need, 0);
  // Gathered mats name the roster entries with the gathering profession.
  const war = Q.shoppingList(data, pricer, Q.select(q, "rwarr01"), roster, {});
  const ore = war.lines.find((l) => l.gathered === "Mining");
  if (ore) assert.deepStrictEqual(plain(ore.gatheredBy), ["rwarr01"]);
  assert.ok(war.lines.some((l) => l.gatheredBy.length), "the Warrior mines something it needs");
  // All: the AH rows add no mats; every crafter's needs are in it.
  const all = Q.shoppingList(data, pricer, Q.select(q, "all"), roster, {});
  assert.ok(all.lines.length >= Math.max(sl.lines.length, war.lines.length));
  assert.deepStrictEqual(plain(Q.shoppingList(data, pricer, Q.select(q, "ah"), roster, {}).lines), []);
});
