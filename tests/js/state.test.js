"use strict";
// User state schema 1 (docs/ui.md §10, D24, D34, D35, D37).
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const S = require("../../site/lib/state");
const { loadSite } = require("./helpers/load-site");

const { data } = loadSite();
const ctx = S.contextFrom(data);

const raw = () => ({
  schema: 1, app: "forever-gear-planner",
  seen: { build: "1.60.1.70205", generated: "2026-10-08" },
  roster: {
    faction: "alliance", includeAH: true,
    entries: [
      { id: "r4k9q2x", cls: "Mage", label: "Alt 1", role: "caster", level: 22, options: { school: "fire" },
        professions: [{ id: "Tailoring", skill: 130, spec: null }, { id: "Enchanting", skill: null }], favor: 40 },
      { id: "r0b7m3c", cls: "Warrior", label: "", role: "melee", level: 14,
        professions: [{ id: "Mining", skill: null }, { id: "Blacksmithing", skill: 70, spec: "Armorsmith" }], favor: 0 },
    ],
  },
  items: { "r4k9q2x:4312": { status: "equipped", enchant: { pick: "spell:7857", applied: true } }, "r4k9q2x:4316": { hidden: true }, "r0b7m3c:2857": { status: "have", via: "ah" } },
  recipes: { "r4k9q2x:8770": "learned" },
  prices: { overrides: { 4339: { c: 3200, set: "2026-10-08" } }, owned: { 2589: 40 } },
  prefs: { selected: "r4k9q2x", theme: "dark", filters: { core: true } },
});

test("storage keys (D35)", () => {
  assert.strictEqual(S.KEYS.state, "forever-gear-planner.state");
  assert.strictEqual(S.KEYS.prices, "forever-gear-planner.prices");
  assert.strictEqual(S.KEYS.pricesUndo, "forever-gear-planner.prices.undo");
  assert.strictEqual(S.KEYS.backup(1), "forever-gear-planner.backup.1");
});

test("a valid state survives normalize unchanged in substance", () => {
  const n = S.normalize(raw(), ctx);
  assert.strictEqual(n.roster.entries.length, 2);
  assert.deepStrictEqual(n.roster.entries[0].options, { school: "fire" });
  assert.deepStrictEqual(n.roster.entries[1].professions[1], { id: "Blacksmithing", skill: 70, spec: "Armorsmith" });
  assert.deepStrictEqual(n.items["r0b7m3c:2857"], { status: "have", via: "ah" });
  assert.deepStrictEqual(n.prices.overrides["4339"], { c: 3200, set: "2026-10-08" });
  assert.strictEqual(n.prefs.theme, "dark");
  assert.strictEqual(n.prefs.filters.hideUnob, true);
  assert.strictEqual(n.prefs.view, "gear", "default view");
  assert.strictEqual(S.normalize({ prefs: { view: "prices" } }, ctx).prefs.view, "prices");
  assert.strictEqual(S.normalize({ prefs: { view: "queue" } }, ctx).prefs.view, "queue");
  assert.strictEqual(S.normalize({ prefs: { view: "favor" } }, ctx).prefs.view, "gear", "unknown views fall back");
  assert.deepStrictEqual(S.normalize(n, ctx), n, "idempotent");
});

test("M2 additions at schema 1: queue prefs, owned mats, spec and crafter choice; a v0.1.1 export loads unchanged", () => {
  const d = S.normalize({}, ctx).prefs;
  assert.deepStrictEqual([d.queueSel, d.within, d.showHidden.queue], [null, 5, false]);
  const r = raw();
  r.prefs = { queueSel: "r0b7m3c", within: null, showHidden: { gear: true, queue: true } };
  let n = S.normalize(r, ctx);
  assert.deepStrictEqual([n.prefs.queueSel, n.prefs.within, n.prefs.showHidden], ["r0b7m3c", null, { gear: true, queue: true }]);
  assert.deepStrictEqual(S.normalize(n, ctx), n, "idempotent");
  for (const [sel, want] of [["ah", "ah"], ["all", "all"], ["rzzzzzz", null], [7, null]]) assert.strictEqual(S.normalize({ prefs: { queueSel: sel } }, ctx).prefs.queueSel, want);
  for (const [w, want] of [["3", 3], [-2, 0], [99, 60], ["x", 5], [undefined, 5]]) assert.strictEqual(S.normalize({ prefs: { within: w } }, ctx).prefs.within, want);
  r.prices.owned = { 2589: 40, 2592: "12", 2: -1, x: 3, 4306: 0 };
  r.items["r4k9q2x:4316"] = { hidden: true, via: "r0b7m3c" };
  n = S.normalize(r, ctx);
  assert.deepStrictEqual(n.prices.owned, { 2589: 40, 2592: 12 });
  assert.deepStrictEqual(n.items["r4k9q2x:4316"], { hidden: true, via: "r0b7m3c" });
  const gone = S.removeEntry(n, "r0b7m3c");
  assert.deepStrictEqual([gone.items["r4k9q2x:4316"], gone.prefs.queueSel], [{ hidden: true }, null], "a removed crafter's choice and selection are cleared");
  // An export made by v0.1.1 (before the queue): imports at schema 1, every stored field kept, queue prefs defaulted.
  const old = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "fixtures", "state-v0.1.1-export.json"), "utf8"));
  assert.ok(S.validateImport(old).ok);
  const imp = S.importState(old, ctx).state;
  for (const k of ["roster", "items", "recipes", "seen"]) assert.deepStrictEqual(imp[k], old[k], k);
  assert.deepStrictEqual(imp.prices.overrides, old.prices.overrides);
  assert.deepStrictEqual([imp.prefs.queueSel, imp.prefs.within, imp.prefs.showHidden.queue], [null, 5, false]);
  assert.deepStrictEqual(imp.prefs.upTo, old.prefs.upTo);
});

test("normalize drops and clamps what it cannot trust", () => {
  const r = raw();
  r.roster.entries.push({ id: "bad id", cls: "Mage", role: "caster" }, { id: "r0b7m3c", cls: "Rogue", role: "melee" }, { id: "rdk0001", cls: "Death Knight", role: "tank" });
  r.roster.entries[0].level = 99;
  r.roster.entries[0].role = "tank";
  r.roster.entries[0].options.school = "shadow";
  r.roster.entries[0].professions.push({ id: "Mining" });
  r.roster.entries[1].professions[1].skill = 9000;
  r.roster.entries[1].professions[1].spec = "Gnomish Engineer";
  r.items["rzzzzzz:1"] = { status: "equipped" };
  r.items["r4k9q2x:5"] = { status: "worn", hidden: "yes" };
  r.recipes["r4k9q2x:9"] = "stolen";
  r.prices.overrides.abc = { c: 5 };
  r.prices.overrides[7] = { c: -1 };
  r.prices.owned[3] = 0;
  r.extra = "ignored";
  const n = S.normalize(r, ctx);
  assert.deepStrictEqual(n.roster.entries.map((e) => e.id), ["r4k9q2x", "r0b7m3c"]);
  const mage = n.roster.entries[0];
  assert.deepStrictEqual([mage.level, mage.role, mage.options.school, mage.professions.length], [60, "caster", undefined, 2]);
  assert.deepStrictEqual(n.roster.entries[1].professions[1], { id: "Blacksmithing", skill: 300, spec: null });
  assert.ok(!("rzzzzzz:1" in n.items) && !("r4k9q2x:5" in n.items));
  assert.ok(!("r4k9q2x:9" in n.recipes));
  assert.deepStrictEqual(Object.keys(n.prices.overrides), ["4339"]);
  assert.deepStrictEqual(n.prices.owned, { 2589: 40 });
  assert.ok(!("extra" in n));
});

test("load: empty, ok, corrupt, foreign, newer (read-only), older (migrated with a backup)", () => {
  assert.strictEqual(S.load(null, ctx).status, "empty");
  assert.strictEqual(S.load(S.serialize(S.normalize(raw(), ctx)), ctx).status, "ok");
  const bad = S.load("{not json", ctx);
  assert.strictEqual(bad.status, "corrupt");
  assert.strictEqual(bad.backup.text, "{not json");
  assert.strictEqual(S.load(JSON.stringify({ app: "other-app" }), ctx).status, "foreign");
  const newer = S.load(JSON.stringify({ ...raw(), schema: 2 }), ctx);
  assert.deepStrictEqual([newer.status, newer.readOnly], ["newer", true]);
  S.MIGRATIONS[0] = (v) => ({ ...v, schema: 1, roster: { entries: v.entries } });
  try {
    const old = S.load(JSON.stringify({ schema: 0, app: "forever-gear-planner", entries: raw().roster.entries }), ctx);
    assert.strictEqual(old.status, "migrated");
    assert.strictEqual(old.backup.key, "forever-gear-planner.backup.0");
    assert.strictEqual(old.state.roster.entries.length, 2);
  } finally { delete S.MIGRATIONS[0]; }
});

test("export → reset → import restores the same state (acceptance 6); prices only on request (D37)", () => {
  const st = S.normalize(raw(), ctx);
  const exp = S.exportState(st, { now: "2026-10-20T10:00:00Z", dataBuild: "1.60.1.70205" });
  assert.ok(!("importedPrices" in exp));
  const withPrices = S.exportState(st, { includePrices: true, priceSet: { format: 1, rows: {} } });
  assert.ok("importedPrices" in withPrices);
  const reset = S.reset(st);
  assert.strictEqual(reset.roster.entries.length, 0);
  assert.strictEqual(reset.prefs.theme, "dark", "reset keeps the theme");
  const v = S.validateImport(JSON.parse(JSON.stringify(exp)));
  assert.ok(v.ok);
  assert.deepStrictEqual([v.summary.entries, v.summary.items, v.summary.dataBuild], [2, 3, "1.60.1.70205"]);
  const back = S.importState(JSON.parse(JSON.stringify(exp)), ctx).state;
  assert.deepStrictEqual(back, st);
  assert.strictEqual(S.exportFileName("2026-10-20"), "forever-gear-planner-2026-10-20.json");
});

test("import validation errors", () => {
  assert.match(S.validateImport(null).error, /not a planner export/);
  assert.match(S.validateImport({ app: "x", schema: 1 }).error, /not exported by this planner/);
  assert.match(S.validateImport({ app: "forever-gear-planner", schema: 99 }).error, /newer version/);
  assert.throws(() => S.importState({ app: "forever-gear-planner" }, ctx), /schema/);
});

test("entry IDs, removing an entry, orphans, data change", () => {
  let i = 0;
  const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const id = S.newEntryId(() => seq[i++ % 6], []);
  assert.match(id, S.ENTRY_ID);
  const st = S.normalize(raw(), ctx);
  st.items["r4k9q2x:2857"] = { via: "r0b7m3c" };
  const removed = S.removeEntry(st, "r0b7m3c");
  assert.deepStrictEqual(removed.roster.entries.map((e) => e.id), ["r4k9q2x"]);
  assert.ok(!("r0b7m3c:2857" in removed.items) && !("r4k9q2x:2857" in removed.items));
  const o = S.orphans(S.normalize({ ...raw(), items: { "r4k9q2x:1": { hidden: true }, "r4k9q2x:2307": { hidden: true } } }, ctx), data);
  assert.deepStrictEqual(o.items, ["r4k9q2x:1"]);
  assert.strictEqual(S.dataChanged(st, data.meta), false);
  assert.strictEqual(S.dataChanged(S.defaults(), data.meta), true);
});
