"use strict";
// The page's acceptance steps 1–6 (docs/roadmap.md §M1) as far as Node can run them: the app scripts load without
// a DOM, views render to HTML strings, actions run on fake elements. Event wiring, focus and drop are left to the
// browser check.
const test = require("node:test");
const assert = require("node:assert");
const { loadApp, memStorage, el, form, plain } = require("./helpers/load-app");
const fx = require("./helpers/auctionator-fixture");

const LINEN = 2589, WOOL = 2592;

// Replay the entry form the way the browser does: one change per control, then submit.
function addEntry(A, v, go) {
  A.acts.start(el({ "data-key": v.start || "one" }));
  const vals = {};
  for (const k of ["cls", "role", "level", "label", "prof0", "skill0", "spec0", "prof1", "skill1", "spec1"]) {
    if (v[k] === undefined) continue;
    vals[k] = v[k];
    A.changes.form({ name: k, form: form(vals) });
  }
  A.submits.entry(form(vals), { value: go || "show" });
  return A.selected();
}

function prof(A, spell) { return A.D.recipes.rows[spell].prof; }

test("boot: empty storage shows the onboarding empty state with Alliance preselected", () => {
  const { A } = loadApp();
  assert.deepStrictEqual(plain(A.problems), []);
  const h = A.viewHtml("gear");
  for (const id of ["start-one", "start-several", "start-example", "import-state-onb"]) assert.match(h, new RegExp(`id="${id}"`));
  assert.match(h, /id="faction-alliance"[^>]*checked/);
  assert.match(A.viewHtml("about"), /Your data/);
  assert.match(A.viewHtml("prices"), /Choose Auctionator file/);
});

test("step 1: one Priest healer, level 12, no professions, ≤ 6 interactions → BoE path with source badges, no price", () => {
  const { A } = loadApp();
  // Interactions: (Alliance is preselected) 1 "I play one character", 2 Priest, 3 Healer, 4 level 12, 5 submit.
  let n = 0;
  A.acts.start(el({ "data-key": "one" })); n++;
  const vals = {};
  for (const [k, v] of [["cls", "Priest"], ["role", "healer"], ["level", "12"]]) { vals[k] = v; A.changes.form({ name: k, form: form(vals) }); n++; }
  A.submits.entry(form(vals), { value: "show" }); n++;
  assert.ok(n <= 6, `${n} interactions`);
  const e = A.selected();
  assert.deepStrictEqual(plain({ cls: e.cls, role: e.role, level: e.level, professions: e.professions }), { cls: "Priest", role: "healer", level: 12, professions: [] });
  assert.strictEqual(A.form, null, "straight to the Gear view");
  const m = A.gearModel(e);
  assert.ok(m.rows.length > 20, `${m.rows.length} rows`);
  for (const r of m.rows.concat(m.alternatives)) {
    assert.notStrictEqual(r.it.bind, "BoP", r.it.name);
    assert.strictEqual(r.route.via, "ah", r.it.name);
  }
  const h = A.viewHtml("gear");
  assert.match(h, /Next upgrades/);
  assert.match(h, /Full plan/);
  const cells = [...h.matchAll(/<td class="c-src">(.*?)<\/td>/g)].map((x) => x[1]);
  assert.ok(cells.length >= m.rows.length);
  for (const c of cells) assert.match(c, /class="badge b-/, "every row has a source badge");
  const ah = [...h.matchAll(/<td class="c-ah num">(.*?)<\/td>/g)].map((x) => x[1]);
  for (const c of ah) assert.match(c, />no price</, "no import → no price");
  assert.match(h, /AH · no price seen/);
});

test("step 2: example roster: BoP only for its crafter, Blacksmithing weapons for the Rogue via the Warrior", () => {
  const { A } = loadApp();
  A.acts.start(el({ "data-key": "example" }));
  const es = A.entries(), names = A.names();
  assert.deepStrictEqual(plain(es.map((e) => names[e.id])), ["Example Mage", "Example Warrior", "Example Rogue"]);
  const [mage, warrior, rogue] = es;
  let tailoringBoPOnMage = 0, rogueBS = 0;
  for (const e of es) {
    const m = A.gearModel(e), profs = e.professions.map((p) => p.id);
    for (const r of m.rows.concat(m.alternatives)) {
      if (r.it.bind !== "BoP") continue;
      const p = prof(A, r.route.recipe);
      assert.ok(profs.includes(p), `${names[e.id]} gets BoP ${r.it.name} (${p}) without the profession`);
      assert.strictEqual(r.route.via, "self");
      if (p === "Tailoring") { assert.strictEqual(e, mage); tailoringBoPOnMage++; }
    }
    if (e === rogue) {
      for (const r of m.rows) {
        if (r.group === "Weapons" && prof(A, r.route.recipe) === "Blacksmithing") {
          assert.strictEqual(r.route.via, "crafter");
          assert.strictEqual(r.route.crafter, warrior.id);
          rogueBS++;
        }
      }
    }
  }
  assert.ok(tailoringBoPOnMage > 0, "the Mage has Tailoring BoP pieces");
  assert.ok(rogueBS > 0, "the Rogue has Blacksmithing weapons");
  A.selectEntry(rogue.id);
  assert.match(A.viewHtml("gear"), /Example Warrior<\/span> → mail/);
  assert.match(A.banners().map((b) => b.html).join(" "), /Example roster/);
  A.acts["clear-example"]();
  assert.strictEqual(A.entries().length, 0);
});

test("step 3: level 45: source-unknown badges, the known-source switch removes them, Favor and reputation stay alternatives", () => {
  const { A } = loadApp();
  addEntry(A, { cls: "Warrior", role: "melee", level: "45", prof0: "Mining", prof1: "Blacksmithing", start: "several" });
  const e = A.selected();
  let m = A.gearModel(e);
  const unknown = m.rows.filter((r) => r.route.flags.includes("source unknown"));
  assert.ok(unknown.length > 0, "some candidates have no known source");
  assert.match(A.viewHtml("gear"), /class="badge b-unknown"[^>]*>source unknown/);
  for (const r of m.rows) assert.doesNotMatch(r.route.flags.join(" "), /needs (Favor|reputation|drop only)/, `${r.it.name} is scarce but a step`);
  const scarce = m.alternatives.filter((r) => /needs (Favor|reputation)/.test(r.why));
  assert.ok(scarce.some((r) => /Favor/.test(r.why)) && scarce.some((r) => /reputation/.test(r.why)), "Favor and reputation alternatives listed");
  // Marking a Favor pattern learned lifts its scarcity (D19).
  const fav = scarce.find((r) => /Favor/.test(r.why) && r.route.crafter);
  A.changes.learned(el({ "data-key": `${fav.route.crafter}:${fav.route.recipe}` }, { checked: true }));
  assert.ok(!A.gearModel(e).alternatives.some((r) => r.id === fav.id && /Favor/.test(r.why)));
  // Known sources only.
  A.changes.roster(el({ "data-key": "knownSourceOnly" }, { checked: true }));
  m = A.gearModel(e);
  for (const r of m.rows.concat(m.alternatives)) {
    assert.ok(!r.route.flags.includes("source unknown"), r.it.name);
    assert.notStrictEqual(A.sourcesFor(r.route.recipe).list[0].kind, "unknown", `${r.it.name}: badge leads with a known source`);
  }
  assert.doesNotMatch(A.viewHtml("gear"), /b-unknown/);
  assert.match(A.viewHtml("gear"), /id="roster-known"[^>]*checked/);
});

function auctionatorFile(realms) {
  const entry = (m, day, q) => new Map([["m", m], ["h", new Map([[String(day), m]])], ["l", []], ["a", new Map([[String(day), q]])]]);
  const out = {};
  for (const [label, rows] of Object.entries(realms)) out[label] = { format: "cbor", data: new Map([["version", 2], ...rows.map(([id, m, day, q]) => [String(id), entry(m, day, q)])]) };
  return fx.writeFile(out);
}

test("step 4: Auctionator import (picker and drop share importFile), ages, override wins, undo, redacted diagnostic", async () => {
  const { A, storage, FGP } = loadApp();
  addEntry(A, { cls: "Mage", role: "caster", level: "10", prof0: "Tailoring" });
  const today = A.today;
  // Two realms: a choice is offered, nothing is imported yet.
  const two = auctionatorFile({ "Realm Alpha": [[LINEN, 120, today - 1, 30]], "Realm Beta": [[LINEN, 200, today - 9, 2], [WOOL, 300, today - 9, 5]] });
  const file = { name: "Auctionator.lua", size: two.length, arrayBuffer: async () => two.buffer.slice(two.byteOffset, two.byteOffset + two.length) };
  A.readBytes = (f, cb) => f.arrayBuffer().then((b) => cb(null, new Uint8Array(b)));
  A.importFile(file);
  await new Promise((r) => setImmediate(r));
  assert.strictEqual(A.imp.phase, "read");
  assert.strictEqual(A.prices.imported, null);
  assert.match(A.viewHtml("prices"), /Which realm\?[\s\S]*Realm Alpha[\s\S]*Realm Beta/);
  A.changes.realm(el({}, { value: String(A.imp.result.realms.findIndex((r) => r.label === "Realm Beta")) }));
  A.acts["realm-use"]();
  assert.strictEqual(A.prices.imported.realm, "Realm Beta");
  assert.ok(storage.getItem(FGP.state.KEYS.prices));
  let p = A.pricer().price(LINEN);
  assert.deepStrictEqual(plain([p.source, p.copper, p.age, p.band, p.thin]), ["ah", 200, 9, "old", true]);
  assert.match(A.priceHtml(p), /9 days/);
  assert.match(A.viewHtml("prices"), /Realm Beta/);
  // A one-realm file imports directly; undo restores Realm Beta.
  A.importBytes(auctionatorFile({ "Realm Gamma": [[LINEN, 90, today, 40]] }), "Auctionator.lua");
  assert.strictEqual(A.prices.imported.realm, "Realm Gamma");
  assert.strictEqual(A.pricer().price(LINEN).age, 0);
  A.acts["price-undo"]();
  assert.strictEqual(A.prices.imported.realm, "Realm Beta");
  assert.strictEqual(JSON.parse(storage.getItem(FGP.state.KEYS.prices)).realm, "Realm Beta");
  // Undo of the first import leaves no prices.
  A.importBytes(auctionatorFile({ "Realm Gamma": [[LINEN, 90, today, 40]] }), "Auctionator.lua");
  A.undoImport();
  A.undoImport();
  assert.strictEqual(A.prices.imported.realm, "Realm Beta", "one undo slot");
  // Override wins over the imported price; clearing it brings the AH price back.
  A.submits.override(form({ item: "linen cloth", price: "1g 5s" }));
  p = A.pricer().price(LINEN);
  assert.deepStrictEqual(plain([p.source, p.copper]), ["override", 10500]);
  assert.match(A.viewHtml("prices"), /id="ov-clear-2589"/);
  A.submits.override(form({ item: "Wool Cloth", price: "1x" }));
  assert.match(A.imp.ovError, /Not a price/);
  A.acts["ov-clear"](el({ "data-key": String(LINEN) }));
  assert.strictEqual(A.pricer().price(LINEN).source, "ah");
  A.runUndo();
  assert.strictEqual(A.pricer().price(LINEN).source, "override", "undo restores the override");
  // Diagnostic: no realm name, no file name unless opted in.
  A.importBytes(two, "Auctionator.lua.bak");
  const red = A.diagnostic(false), full = A.diagnostic(true);
  assert.doesNotMatch(red, /Realm Alpha|Realm Beta|Auctionator\.lua/);
  assert.match(red, /2 realm keys \(names hidden\)/);
  assert.match(red, /format cbor/);
  assert.match(full, /Realm Alpha/);
  assert.match(full, /Auctionator\.lua\.bak/);
  // Errors are shown, not thrown.
  A.importBytes(new Uint8Array(Buffer.from("hello")), "x.lua");
  assert.match(A.viewHtml("prices"), /class="bad">This isn&#39;t a saved-variables file/);
});

test("step 5: hide and undo, the next-best piece takes its place; [ and ] switch entries; controls carry IDs", () => {
  const { A } = loadApp();
  A.acts.start(el({ "data-key": "example" }));
  const [mage, warrior] = A.entries();
  A.selectEntry(warrior.id);
  const m = A.gearModel(warrior), first = m.rows.find((r) => r.group === "Chest");
  A.acts.hide(el({ "data-key": first.key }));
  let after = A.gearModel(warrior);
  assert.ok(!after.rows.some((r) => r.id === first.id), "hidden piece left the path");
  assert.ok(after.rows.some((r) => r.group === "Chest" && r.from <= first.to && r.to >= first.from), "another Chest piece covers those levels");
  assert.strictEqual(after.hidden.length, 1);
  A.changes.showhidden(el({}, { checked: true }));
  assert.match(A.viewHtml("gear"), /data-act="unhide"/);
  assert.ok(A.runUndo(), "u undoes the hide");
  after = A.gearModel(warrior);
  assert.ok(after.rows.some((r) => r.id === first.id));
  A.cycleEntry(1);
  assert.strictEqual(A.selected().id, A.entries()[2].id);
  A.cycleEntry(1);
  assert.strictEqual(A.selected().id, mage.id);
  A.cycleEntry(-1);
  assert.strictEqual(A.selected().id, A.entries()[2].id);
  // Level change from the card input.
  A.inputs.level(el({ "data-key": mage.id }, { value: "33" }));
  assert.strictEqual(A.entry(mage.id).level, 33);
  // Every focusable control has a unique ID, so the render loop can restore focus.
  for (const view of ["gear", "prices", "about"]) {
    const h = A.viewHtml(view);
    const tags = [...h.matchAll(/<(button|input|select|textarea)\b[^>]*>|<div[^>]*role="button"[^>]*>/g)].map((x) => x[0]);
    const ids = tags.map((t) => (t.match(/\sid="([^"]+)"/) || [])[1]);
    tags.forEach((t, i) => assert.ok(ids[i], `${view}: control without id: ${t.slice(0, 80)}`));
    const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
    assert.deepStrictEqual(dup, [], `${view}: duplicate ids`);
  }
  A.acts["entry-add"]();
  const form = A.viewHtml("gear");
  assert.match(form, /id="f-cls-druid"/);
  const tags = [...form.matchAll(/<(button|input|select)\b[^>]*>/g)].map((x) => x[0]);
  for (const t of tags) assert.match(t, /\sid="/, t);
});

test("search, slot filter, core only and status: the tables follow, the lanes show what is in hand", () => {
  const { A } = loadApp();
  A.acts.start(el({ "data-key": "example" }));
  const e = A.selected(), m = A.gearModel(e);
  A.setQuery("boots");
  let rows = A.filterRows(m, m.rows);
  assert.ok(rows.length > 0 && rows.every((r) => r.group === "Feet" || /boots/i.test(r.it.name)), "search by name");
  A.setQuery("");
  A.acts.slot(el({ "data-key": "Chest" }));
  rows = A.filterRows(A.gearModel(e), A.gearModel(e).rows);
  assert.ok(rows.length > 0 && rows.every((r) => r.group === "Chest"));
  assert.match(A.viewHtml("gear"), /id="slot-chest"[^>]*aria-pressed="true"/);
  A.acts.slot(el({ "data-key": "Chest" }));
  assert.strictEqual(A.S.prefs.slot, "", "a second click clears the slot filter");
  A.changes.filter(el({ "data-key": "core" }, { checked: true }));
  assert.ok(A.filterRows(m, m.rows).every((r) => r.core));
  A.changes.filter(el({ "data-key": "core" }, { checked: false }));
  // Mark the current Chest piece equipped: the lane says so, and the piece is pinned in the path.
  const lane = A.gearModel(e).lanes.find((l) => l.group === "Chest" && l.cur);
  const id = lane.cur.items[0];
  A.changes.status(el({ "data-key": `${e.id}:${id}` }, { value: "equipped" }));
  const after = A.gearModel(e);
  assert.strictEqual(after.lanes.find((l) => l.group === "Chest").state, "equipped");
  assert.ok(after.rows.find((r) => r.id === id).status === "equipped");
  A.changes.filter(el({ "data-key": "hideDone" }, { checked: true }));
  assert.ok(!A.filterRows(after, after.rows).some((r) => r.id === id), "Hide done");
});

test("entry form: validation messages, edit and delete with undo", () => {
  const { A } = loadApp();
  A.acts.start(el({ "data-key": "several" }));
  const vals = { cls: "Paladin", level: "61", prof0: "Mining", prof1: "Mining", skill0: "400" };
  A.submits.entry(form(vals), { value: "show" });
  assert.deepStrictEqual(Object.keys(A.form.errors).sort(), ["level", "prof1", "skill0"]);
  assert.match(A.viewHtml("gear"), /aria-describedby="err-level"/);
  vals.level = "20"; vals.prof1 = "Blacksmithing"; vals.skill0 = "";
  A.submits.entry(form(vals), { value: "another" });
  assert.strictEqual(A.entries().length, 1);
  assert.strictEqual(A.form.added, 1);
  assert.match(A.viewHtml("gear"), /id="f-done"/);
  A.acts["form-done"]();
  const e = A.selected();
  A.acts["entry-edit"](el({ "data-key": e.id }));
  A.submits.entry(form({ level: "25", label: "Tank" }), { value: "save" });
  assert.deepStrictEqual(plain([A.entry(e.id).level, A.entry(e.id).label, A.entry(e.id).professions.map((p) => p.id)]), [25, "Tank", ["Mining", "Blacksmithing"]]);
  A.setItem(e.id, 2847, { status: "have" });
  A.deleteEntry(e.id);
  assert.strictEqual(A.entries().length, 0);
  assert.match(A.viewHtml("gear"), /id="start-one"/);
  A.runUndo();
  assert.strictEqual(A.entry(e.id).label, "Tank");
  assert.strictEqual(A.itemState(e.id, 2847).status, "have");
});

test("step 6: export → reset → import restores the same view; data-update banner on a build change", () => {
  const { A, storage, FGP } = loadApp();
  A.acts.start(el({ "data-key": "example" }));
  const rogue = A.entries()[2];
  A.selectEntry(rogue.id);
  const r = A.gearModel(rogue).rows[0];
  A.changes.status(el({ "data-key": r.key }, { value: "equipped" }));
  A.setOverride(LINEN, "50s");
  A.changes.filter(el({ "data-key": "core" }, { checked: true }));
  const before = A.viewHtml("gear");
  const file = JSON.stringify(A.exportObject(false));
  assert.doesNotMatch(file, /importedPrices/, "imported prices stay out unless asked (D37)");
  A.resetState();
  A.save();
  assert.match(A.viewHtml("gear"), /id="start-one"/);
  const read = A.readExport(file);
  assert.ok(read.ok);
  assert.strictEqual(read.summary.entries, 3);
  A.applyImport(read.obj);
  A.save();
  assert.strictEqual(A.viewHtml("gear"), before);
  assert.strictEqual(A.readExport("{").ok, false);
  assert.match(A.readExport('{"app":"other"}').error, /not exported by this planner/);
  // A stored state from another build shows the data-update banner, and dismissing it records the new build.
  const st = JSON.parse(storage.getItem(FGP.state.KEYS.state));
  st.seen.build = "1.60.0.69999";
  const next = loadApp({ storage: memStorage({ [FGP.state.KEYS.state]: JSON.stringify(st) }) });
  assert.match(next.A.banners().map((b) => b.html).join(" "), /Game data updated: build 1\.60\.0\.69999 → 1\.60\.1\.70205/);
  next.A.acts["dismiss-update"]();
  assert.strictEqual(next.A.S.seen.build, next.data.meta.build);
  assert.ok(!next.A.banners().some((b) => /Game data updated/.test(b.html)));
});

test("export with imported prices on request; import makes them the active set", () => {
  const { A } = loadApp();
  addEntry(A, { cls: "Rogue", level: "5" });
  A.importBytes(auctionatorFile({ R: [[LINEN, 77, A.today, 9]] }), "Auctionator.lua");
  const file = JSON.stringify(A.exportObject(true));
  const other = loadApp();
  other.A.applyImport(other.A.readExport(file).obj);
  assert.strictEqual(other.A.pricer().price(LINEN).copper, 77);
});

test("storage blocked and newer schema: banners, nothing saved over newer data", () => {
  const blocked = { getItem() { throw new Error("SecurityError"); }, setItem() { throw new Error("SecurityError"); }, removeItem() {} };
  const { A } = loadApp({ storage: blocked });
  assert.match(A.banners().map((b) => b.html).join(" "), /storage is blocked/);
  const newer = JSON.stringify({ app: "forever-gear-planner", schema: 99, roster: { entries: [] } });
  const s = memStorage({ "forever-gear-planner.state": newer });
  const n = loadApp({ storage: s });
  assert.ok(n.A.store.readOnly);
  n.A.acts.start(el({ "data-key": "example" }));
  assert.strictEqual(s.getItem("forever-gear-planner.state"), newer);
});

test("tooltip and About: offline tooltip with Get via and source, coverage table, no raw set-bonus spell names", () => {
  const { A, data } = loadApp();
  A.acts.start(el({ "data-key": "example" }));
  const id = A.gearModel(A.selected()).rows[0].id;
  const tip = A.tipHtml("item", String(id));
  assert.match(tip, /Get via/);
  assert.match(tip, /Source/);
  assert.match(tip, /wowhead\.com\/forever\/item=/);
  const setItem = Object.keys(data.items.rows).find((k) => data.items.rows[k].set);
  assert.doesNotMatch(A.tipHtml("item", setItem), /Item - /);
  assert.match(A.tipHtml("mat", String(LINEN)), /Linen Cloth/);
  const about = A.viewHtml("about");
  assert.match(about, /Recipe sources/);
  assert.match(about, /1–10/);
  const cov = A.coverage();
  assert.ok(cov.alliance[0].known > 0 && cov.alliance[0].total >= cov.alliance[0].known);
});

test("review fixes: escaped labels, undo expires with its toast, no save on a broken page, undo slot survives a failed write", () => {
  const { A, data, storage, FGP } = loadApp();
  addEntry(A, { cls: "Mage", level: "10", label: "<b>x</b>" });
  const h = A.viewHtml("gear");
  assert.doesNotMatch(h, /<b>x<\/b>/);
  assert.match(h, /&lt;b&gt;x&lt;\/b&gt;/);
  // An undo belongs to its toast: a later toast, a reset or an import ends it.
  const id = A.selected().id;
  A.deleteEntry(id);
  A.toast("something else");
  assert.strictEqual(A.runUndo(), false);
  assert.strictEqual(A.entries().length, 0);
  addEntry(A, { cls: "Rogue", level: "5" });
  A.deleteEntry(A.selected().id);
  A.resetState();
  assert.strictEqual(A.runUndo(), false);
  // A page that can't start never saves (the theme key would otherwise write empty defaults over real data).
  addEntry(A, { cls: "Rogue", level: "5" });
  A.save();
  const saved = storage.getItem(FGP.state.KEYS.state);
  A.init({ data: Object.assign({}, data, { meta: Object.assign({}, data.meta, { schema: 99 }) }), storage });
  assert.ok(A.problems.length);
  A.acts.theme();
  assert.strictEqual(storage.getItem(FGP.state.KEYS.state), saved);
  assert.match(A.viewHtml("gear"), /can.t start/);
  // Undo slot write rejected (quota): undo still restores the previous set, from memory.
  const s2 = memStorage();
  const real = s2.setItem;
  s2.setItem = (k, v) => { if (k === FGP.state.KEYS.pricesUndo) { const e = new Error("full"); e.name = "QuotaExceededError"; throw e; } real(k, v); };
  const b = loadApp({ storage: s2 }).A;
  b.importBytes(auctionatorFile({ One: [[LINEN, 11, b.today, 3]] }), "Auctionator.lua");
  b.importBytes(auctionatorFile({ Two: [[LINEN, 22, b.today, 3]] }), "Auctionator.lua");
  assert.ok(b.undoImport());
  assert.strictEqual(b.prices.imported.realm, "One");
  assert.match(b.banners().map((x) => x.html).join(" "), /storage is full/);
  // A file whose realms are all unusable offers no "Use these prices" button.
  b.importBytes(auctionatorFile({ Empty: [] , Empty2: [] }), "Auctionator.lua");
  assert.doesNotMatch(b.viewHtml("prices"), /id="realm-use"/);
});

// A location stub that records hash writes (Chrome logs a cross-origin error for them on file://host/ URLs).
function fakeLocation(protocol, hash) {
  const loc = { protocol, writes: [], _hash: hash || "" };
  Object.defineProperty(loc, "hash", { get: () => loc._hash, set: (v) => { loc.writes.push(v); loc._hash = "#" + String(v).replace(/^#/, ""); } });
  return loc;
}

test("views from file:// never touch location.hash; the view is kept in prefs and survives a reload", () => {
  const { A, ctx, storage } = loadApp();
  ctx.location = fakeLocation("file:", "");
  A.acts.start(el({ "data-key": "example" }));
  assert.strictEqual(A.currentView(), "gear");
  A.go("prices");
  assert.strictEqual(A.currentView(), "prices");
  A.acts.view(el({ "data-key": "about" }));
  assert.strictEqual(A.currentView(), "about");
  assert.deepStrictEqual(ctx.location.writes, [], "no hash writes on file://");
  assert.match(A.viewHtml(A.currentView()), /Your data/);
  // A stale or hand-typed hash is ignored on file://.
  ctx.location._hash = "#prices";
  assert.strictEqual(A.currentView(), "about");
  // Reset from About stays on About.
  A.resetState();
  assert.strictEqual(A.currentView(), "about");
  A.acts.start(el({ "data-key": "example" }));
  // Reload: the stored prefs bring the same view back.
  const next = loadApp({ storage });
  next.ctx.location = fakeLocation("file:", "");
  assert.strictEqual(next.A.currentView(), "about");
  // Saving a new entry from another view goes to Gear, still without a hash write.
  addEntry(next.A, { cls: "Rogue", level: "3" });
  assert.strictEqual(next.A.currentView(), "gear");
  assert.deepStrictEqual(next.ctx.location.writes, []);
});

test("views over http(s) route through the hash, and prefs.view follows it", () => {
  const { A, ctx } = loadApp();
  ctx.location = fakeLocation("https:", "#gear");
  A.acts.start(el({ "data-key": "example" }));
  A.go("prices");
  assert.deepStrictEqual(ctx.location.writes, ["prices"]);
  assert.strictEqual(A.currentView(), "prices");
  assert.strictEqual(A.S.prefs.view, "prices");
  ctx.location._hash = "#about";
  assert.strictEqual(A.currentView(), "about", "the URL wins over http(s), so links and bookmarks work");
  A.go("about");
  assert.deepStrictEqual(ctx.location.writes, ["prices"], "same hash: render, no second write");
  ctx.location._hash = "";
  assert.strictEqual(A.currentView(), "about", "no hash: the stored view");
});

test("icons: off by default with no image anywhere; the About switch turns them on in the Gear view and tooltips", () => {
  const { A } = loadApp();
  A.acts.start(el({ "data-key": "example" }));
  const id = String(A.gearModel(A.selected()).rows[0].id);
  const pages = () => ["gear", "queue", "prices", "about"].map((v) => A.viewHtml(v)).join("") + A.tipHtml("item", id) + A.tipHtml("mat", String(LINEN));
  assert.strictEqual(A.S.prefs.icons, false);
  assert.doesNotMatch(pages(), /<img\b|zamimg\.com\/images/, "icons off: no image markup, so no image request");
  const about = A.viewHtml("about");
  assert.match(about, /id="pref-icons" data-change="pref-icons">/, "the switch is unchecked");
  assert.match(about, /wow\.zamimg\.com/, "the About view discloses the image host");
  A.changes["pref-icons"]({ checked: true });
  assert.strictEqual(A.S.prefs.icons, true);
  const icon = new RegExp(`<img class="icon" src="https://wow\\.zamimg\\.com/images/wow/icons/small/${A.D.items.rows[id].icon}\\.jpg" alt="" width="18" height="18" loading="lazy" referrerpolicy="no-referrer">`);
  assert.match(A.viewHtml("gear"), icon);
  assert.match(A.tipHtml("item", id), icon);
  assert.match(A.tipHtml("mat", String(LINEN)), /icons\/small\/inv_fabric_linen_01\.jpg/);
  A.resetState();
  assert.strictEqual(A.S.prefs.icons, true, "Reset keeps the icon pref");
  A.changes["pref-icons"]({ checked: false });
  assert.doesNotMatch(pages(), /<img\b/);
});

// M2 acceptance (docs/briefs/2026-10-08-m2-queue.md, definition of done 9) as far as Node runs it.
test("M2 queue: crafters, Auction House, prices and owned mats, crafter choice, specialisation, export round trip", () => {
  const { A, FGP } = loadApp();
  assert.match(A.viewHtml("queue"), /id="q-to-gear"/, "no roster: a pointer to the Gear tab");
  A.acts.start(el({ "data-key": "example" }));
  const [mage, warrior, rogue] = A.entries();
  A.go("queue");
  assert.strictEqual(A.S.prefs.view, "queue");
  let h = A.viewHtml("queue");
  for (const id of [`qsel-${mage.id}`, `qsel-${warrior.id}`, "qsel-ah", "qsel-all"]) assert.match(h, new RegExp(`id="${id}"`));
  assert.doesNotMatch(h, new RegExp(`id="qsel-${rogue.id}"`), "no crafting profession, no crafter button");
  assert.match(h, new RegExp(`id="qsel-${mage.id}"[^>]*aria-pressed="true"`), "the first crafter is preselected");
  assert.strictEqual(A.currentView(), "queue");
  // Mage: Tailoring and Enchanting pieces with quantities, skill inputs with the estimate, pace and shopping list.
  const q = A.queueModel();
  const mageRows = FGP.queue.select(q, mage.id);
  assert.deepStrictEqual([...new Set(mageRows.map((r) => r.prof))].sort(), ["Enchanting", "Tailoring"]);
  for (const r of mageRows) assert.match(h, new RegExp(`id="qlrn-${mage.id}-${r.recipe}"`));
  assert.match(h, new RegExp(`id="qskill-${mage.id}-tailoring"[^>]*placeholder="~${FGP.rank.pace(A.D.roles, 20)}"`));
  assert.match(h, /<h2>Crafter pace<\/h2>[\s\S]*Tailoring:<\/strong> Example Mage reaches \d+ → needs \d+/);
  assert.match(h, /<h2>Shopping list<\/h2>[\s\S]*id="q-within"[^>]*value="5"/);
  assert.match(h, /Value of mats used[\s\S]*To buy/);
  assert.match(h, /Kits, enchants and consumables are not in the queue yet/);
  // Warrior: Blacksmithing, including the Rogue's weapons.
  A.acts.qsel(el({ "data-key": warrior.id, id: `qsel-${warrior.id}` }));
  h = A.viewHtml("queue");
  const war = FGP.queue.select(A.queueModel(), warrior.id);
  assert.ok(war.every((r) => r.prof === "Blacksmithing"));
  const rogueWeapon = war.find((r) => r.needs.some((n) => n.entry === rogue.id) && /One-Hand|Main Hand/.test(r.item.slot));
  assert.ok(rogueWeapon);
  assert.match(h, new RegExp(`id="qneed-${rogue.id}-${rogueWeapon.itemId}"`));
  // [ and ] cycle the crafter buttons in the Queue.
  A.cycleEntry(1);
  assert.strictEqual(A.S.prefs.queueSel, "ah");
  A.cycleEntry(1); A.cycleEntry(1);
  assert.strictEqual(A.S.prefs.queueSel, mage.id);
  // Auction House: the Rogue's BoE leather, no price before an import, "mark in bags" buttons, no learned boxes.
  A.acts.qsel(el({ "data-key": "ah", id: "qsel-ah" }));
  h = A.viewHtml("queue");
  const ah = FGP.queue.select(A.queueModel(), "ah"), leather = ah.find((r) => r.prof === "Leatherworking" && r.item.bind === "BoE" && r.needs.some((n) => n.entry === rogue.id));
  assert.ok(leather);
  assert.match(h, /<h2>Auction House<\/h2>/);
  assert.doesNotMatch(h, /id="qlrn-/);
  assert.match(h, new RegExp(`id="qneed-${rogue.id}-${leather.itemId}"[^>]*data-act="qmark"[^>]*data-via="ah"`));
  const leatherRow = h.slice(h.indexOf(`data-row="ah:${leather.itemId}"`));
  assert.match(leatherRow.slice(0, leatherRow.indexOf("</tr>")), />no price</);
  // Import the synthetic Auctionator file: the leather and the Mage's mats get prices.
  A.acts.qsel(el({ "data-key": mage.id, id: `qsel-${mage.id}` }));
  const before = FGP.queue.shoppingList(A.D, A.pricer(), FGP.queue.select(A.queueModel(), mage.id), A.S.roster, A.S.prices.owned);
  assert.ok(before.lines.length && before.unknown.length);
  const rows = before.lines.map((l) => [l.id, 100 + (l.id % 50), A.today, 12]).concat([[leather.itemId, 23456, A.today - 1, 3]]);
  A.importBytes(auctionatorFile({ "Realm Test": rows }), "Auctionator.lua");
  const priced = FGP.queue.shoppingList(A.D, A.pricer(), FGP.queue.select(A.queueModel(), mage.id), A.S.roster, A.S.prices.owned);
  assert.ok(priced.unknown.length < before.unknown.length);
  assert.ok(priced.value > 0 && priced.toBuy === priced.value);
  h = A.viewHtml("queue");
  assert.match(h, new RegExp(`id="q-value"><span class="coin`));
  const lAh = FGP.queue.select(A.queueModel(), "ah").find((r) => r.itemId === leather.itemId);
  assert.deepStrictEqual(plain([lAh.each.copper, lAh.each.source, lAh.each.age]), [23456, "ah", 1]);
  // Owned mats lower "To buy", not "Value of mats used".
  const mat = priced.lines.find((l) => l.unit && l.unit.source === "ah" && l.count > 1);
  A.changes.qown(el({ "data-key": String(mat.id) }, { value: String(mat.count - 1) }));
  assert.strictEqual(A.S.prices.owned[mat.id], mat.count - 1);
  const owned = FGP.queue.shoppingList(A.D, A.pricer(), FGP.queue.select(A.queueModel(), mage.id), A.S.roster, A.S.prices.owned);
  assert.strictEqual(owned.value, priced.value);
  assert.strictEqual(owned.toBuy, priced.toBuy - mat.unit.copper * (mat.count - 1));
  assert.match(A.viewHtml("queue"), new RegExp(`id="qown-${mat.id}"[^>]*value="${mat.count - 1}"`));
  // Within N levels: empty means every level.
  A.changes.qwithin(el({}, { value: "" }));
  assert.strictEqual(A.S.prefs.within, null);
  A.changes.qwithin(el({}, { value: "5" }));
  // Mark in bags from the Queue: status "have" via the crafter; the Gear view shows it and the need leaves the queue.
  const mr = FGP.queue.select(A.queueModel(), mage.id).find((r) => r.needs.some((n) => n.entry === mage.id));
  A.acts.qmark(el({ "data-key": `${mage.id}:${mr.itemId}`, "data-via": mage.id, id: `qneed-${mage.id}-${mr.itemId}` }));
  assert.deepStrictEqual(plain(A.itemState(mage.id, mr.itemId)), { status: "have", via: mage.id });
  assert.ok(!FGP.queue.select(A.queueModel(), mage.id).some((r) => r.itemId === mr.itemId && r.needs.some((n) => n.entry === mage.id)));
  A.runUndo();
  assert.deepStrictEqual(plain(A.itemState(mage.id, mr.itemId)), {});
  A.acts.qmark(el({ "data-key": `${mage.id}:${mr.itemId}`, "data-via": mage.id }));
  A.selectEntry(mage.id);
  assert.match(A.viewHtml("gear"), new RegExp(`id="st-[a-z]+-${mage.id}-${mr.itemId}"[^>]*>(?:(?!</select>).)*value="have" selected`));
  // Crafter choice: a BoE piece the Mage makes for the Rogue moves to the Auction House and back (Queue and Gear).
  const forRogue = FGP.queue.select(A.queueModel(), mage.id).find((r) => r.item.bind === "BoE" && r.needs.some((n) => n.entry === rogue.id));
  assert.ok(forRogue);
  assert.match(A.viewHtml("queue"), new RegExp(`id="qvia-${mage.id}-${forRogue.recipe}"`));
  A.changes.qvia(el({ "data-key": forRogue.key }, { value: "ah" }));
  assert.strictEqual(A.itemState(rogue.id, forRogue.itemId).via, "ah");
  assert.ok(FGP.queue.select(A.queueModel(), "ah").some((r) => r.itemId === forRogue.itemId && r.needs.some((n) => n.entry === rogue.id)));
  assert.ok(!FGP.queue.select(A.queueModel(), mage.id).some((r) => r.itemId === forRogue.itemId && r.needs.some((n) => n.entry === rogue.id)));
  A.selectEntry(rogue.id);
  const gh = A.viewHtml("gear");
  assert.match(gh, new RegExp(`id="via-[a-z]+-${rogue.id}-${forRogue.itemId}"[^>]*data-change="via"`));
  A.changes.via(el({ "data-key": `${rogue.id}:${forRogue.itemId}`, id: "x" }, { value: "" }));
  assert.strictEqual(A.itemState(rogue.id, forRogue.itemId).via, undefined, "back to recommended");
  assert.ok(FGP.queue.select(A.queueModel(), mage.id).some((r) => r.itemId === forRogue.itemId));
  A.changes.via(el({ "data-key": `${rogue.id}:${forRogue.itemId}`, id: "x" }, { value: "ah" }));
  // Export → reset → import restores the queue state (choice, owned, within, selection, marks).
  A.go("queue");
  const queueBefore = A.viewHtml("queue");
  const file = JSON.stringify(A.exportObject(false));
  A.resetState();
  assert.match(A.viewHtml("queue"), /id="q-to-gear"/);
  A.applyImport(A.readExport(file).obj);
  assert.strictEqual(A.viewHtml("queue"), queueBefore);
});

test("M2 specialisation: the select appears at level 40 or skill 200; an Armorsmith hides Weaponsmith recipes from its queue", () => {
  const { A, FGP } = loadApp();
  A.acts.start(el({ "data-key": "example" }));
  const warrior = A.entries()[1];
  A.editEntry(warrior.id);
  assert.doesNotMatch(A.formHtml(), /id="f-spec1"/, "level 14, no skill: no specialisation yet");
  const vals = { cls: "Warrior", role: "melee", level: "14", label: "Example Warrior", prof0: "Mining", skill0: "", prof1: "Blacksmithing", skill1: "" };
  vals.skill1 = "200";
  A.changes.form({ name: "skill1", form: form(vals) });
  assert.match(A.formHtml(), /id="f-spec1"/, "skill 200 shows it");
  assert.doesNotMatch(A.formHtml(), /id="f-spec0"/, "Mining has none");
  vals.skill1 = "";
  A.changes.form({ name: "skill1", form: form(vals) });
  assert.doesNotMatch(A.formHtml(), /id="f-spec1"/);
  vals.level = "45";
  A.changes.form({ name: "level", form: form(vals) });
  const fh = A.formHtml();
  assert.match(fh, /id="f-spec1"/, "level 45 shows it");
  for (const s of ["Armorsmith", "Weaponsmith", "Master Swordsmith"]) assert.match(fh, new RegExp(`<option value="${s}"`));
  vals.spec1 = "Armorsmith";
  A.changes.form({ name: "spec1", form: form(vals) });
  A.submits.entry(form(vals), { value: "save" });
  const w = A.entry(warrior.id);
  assert.deepStrictEqual(plain(w.professions[1]), { id: "Blacksmithing", skill: null, spec: "Armorsmith" });
  A.editEntry(warrior.id);
  assert.match(A.formHtml(), /<option value="Armorsmith" selected>/, "edit shows the stored spec");
  A.form = null;
  const rows = FGP.queue.select(A.queueModel(), warrior.id);
  const specOf = (r) => (A.D.recipes.rows[r.recipe].pattern || {}).spec;
  assert.ok(rows.some((r) => specOf(r) === "Armorsmith"), "Armorsmith recipes stay");
  for (const r of rows) {
    assert.ok(!["Weaponsmith", "Master Axesmith", "Master Hammersmith", "Master Swordsmith"].includes(specOf(r)), `${r.item.name} needs ${specOf(r)}`);
    if (specOf(r) === "Armorsmith") assert.ok(!r.flags.includes("needs Armorsmith"));
  }
  // The Weaponsmith pieces still reach their wearers through the Auction House, badged.
  const ahRows = FGP.queue.select(A.queueModel(), "ah").filter((r) => ["Weaponsmith", "Master Axesmith", "Master Hammersmith", "Master Swordsmith"].includes(specOf(r)));
  assert.ok(ahRows.length && ahRows.every((r) => r.flags.some((f) => /^needs (Weaponsmith|Master)/.test(f))));
  // Below 40 and below 200 the spec is not kept when the form is saved again.
  A.editEntry(warrior.id);
  const v2 = Object.assign({}, vals, { level: "30" });
  A.changes.form({ name: "level", form: form(v2) });
  A.submits.entry(form(v2), { value: "save" });
  assert.strictEqual(A.entry(warrior.id).professions[1].spec, null);
});
