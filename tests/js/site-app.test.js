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
  for (const k of ["cls", "role", "level", "label", "prof0", "skill0", "prof1", "skill1"]) {
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
  for (const r of m.rows.concat(m.alternatives)) assert.ok(!r.route.flags.includes("source unknown"), r.it.name);
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
