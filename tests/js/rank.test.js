"use strict";
// Usability and availability rules of site/lib/rank.js on the committed data (roadmap M1 rank.test.js).
const test = require("node:test");
const assert = require("node:assert");
const { loadSite } = require("./helpers/load-site");

const { data, lib } = loadSite();
const rank = lib.rank;
const items = data.items.rows;
const byName = (name) => +Object.keys(items).find((id) => items[id].name === name);

function entry(id, cls, role, profs, extra) {
  return Object.assign({ id, cls, role, level: 30, professions: (profs || []).map((p) => (typeof p === "string" ? { id: p, skill: null } : p)), options: {} }, extra || {});
}
function roster(entries, extra) { return Object.assign({ faction: "alliance", includeAH: true, entries }, extra || {}); }
function cand(r, e, id, opts) { return rank.candidates(data, r, e, opts || {}).list.find((c) => c.id === id); }

// A BoP Tailoring piece and BoE pieces from several professions, picked from the data by their properties.
const bopTailoring = +Object.keys(items).find((id) => items[id].bind === "BoP" && items[id].type === "Cloth" && items[id].avail === "ok" && !items[id].classes &&
  data.recipes.rows[items[id].recipes[0]].prof === "Tailoring" && items[id].slot === "Hands");
const boeMail = byName("Green Iron Hauberk") || +Object.keys(items).find((id) => items[id].bind === "BoE" && items[id].type === "Mail" && items[id].avail === "ok");

test("BoP only for an entry with the profession; BoE via a roster crafter, else the AH", () => {
  const mage = entry("rmage01", "Mage", "caster", ["Tailoring", "Enchanting"]);
  const rogue = entry("rrogue1", "Rogue", "melee", []);
  const warrior = entry("rwarr01", "Warrior", "melee", ["Mining", "Blacksmithing"]);
  const r = roster([mage, warrior, rogue]);
  assert.ok(cand(r, mage, bopTailoring), "tailor gets the BoP piece");
  assert.strictEqual(cand(r, mage, bopTailoring).route.via, "self");
  const priest = entry("rpriest", "Priest", "caster", []);
  assert.strictEqual(cand(roster([priest, mage]), priest, bopTailoring), undefined, "no BoP for a non-crafter");
  const hunter = entry("rhunt01", "Hunter", "ranged", [], { level: 45 });
  const viaWarrior = cand(roster([hunter, warrior]), hunter, boeMail);
  assert.strictEqual(viaWarrior.route.via, "crafter");
  assert.strictEqual(viaWarrior.route.crafter, "rwarr01");
  assert.strictEqual(cand(roster([hunter]), hunter, boeMail).route.via, "ah");
  assert.strictEqual(cand(roster([hunter], { includeAH: false }), hunter, boeMail), undefined, "no AH, no crafter: not a candidate");
});

test("armor and weapon proficiency by class and level (mail and plate at 40, S2)", () => {
  const ew = (e) => rank.effectiveWeights(data.roles, e);
  const hunter = entry("rhunt01", "Hunter", "ranged");
  const mail = { itemClass: "armor", type: "Mail", slot: "Chest", inv: 5 }, plate = { itemClass: "armor", type: "Plate", slot: "Chest", inv: 5 };
  assert.strictEqual(rank.proficiencyLevel(mail, hunter, ew(hunter), data.rules, "slot"), 40);
  assert.strictEqual(rank.proficiencyLevel(plate, hunter, ew(hunter), data.rules, "slot"), null);
  const warrior = entry("rwarr01", "Warrior", "melee");
  assert.strictEqual(rank.proficiencyLevel(plate, warrior, ew(warrior), data.rules, "slot"), 40);
  const mage = entry("rmage01", "Mage", "caster");
  assert.strictEqual(rank.proficiencyLevel({ itemClass: "armor", type: "Leather", slot: "Chest", inv: 5 }, mage, ew(mage), data.rules, "slot"), null);
  assert.strictEqual(rank.proficiencyLevel({ itemClass: "armor", type: "Cloth", slot: "Back", inv: 16 }, warrior, ew(warrior), data.rules, "slot"), 1, "cloaks are cloth");
  const sword = { itemClass: "weapon", type: "Sword", slot: "One-Hand", inv: 13 };
  assert.strictEqual(rank.proficiencyLevel(sword, warrior, ew(warrior), data.rules, "off"), 20, "warrior dual wield at 20");
  assert.strictEqual(rank.proficiencyLevel(sword, entry("rrogue1", "Rogue", "melee"), ew(entry("rrogue1", "Rogue", "melee")), data.rules, "off"), 10);
  assert.strictEqual(rank.proficiencyLevel(sword, mage, ew(mage), data.rules, "off"), null, "no dual wield for mages");
  const shaman = entry("rsham01", "Shaman", "melee");
  assert.strictEqual(rank.proficiencyLevel({ itemClass: "weapon", type: "2H Axe", slot: "Two-Hand", inv: 17 }, shaman, ew(shaman), data.rules, "main"), 20, "twoHand option");
  const off = Object.assign({}, shaman, { options: { twoHand: false } });
  assert.strictEqual(rank.proficiencyLevel({ itemClass: "weapon", type: "2H Axe", slot: "Two-Hand", inv: 17 }, off, ew(off), data.rules, "main"), null);
  const idol = { itemClass: "armor", type: "Idol", slot: "Relic", inv: 28 };
  assert.strictEqual(rank.proficiencyLevel(idol, entry("rdrui01", "Druid", "caster"), ew(entry("rdrui01", "Druid", "caster")), data.rules, "ranged"), 1);
  assert.strictEqual(rank.proficiencyLevel(idol, shaman, ew(shaman), data.rules, "ranged"), null);
});

test("class restrictions from AllowableClass", () => {
  const id = +Object.keys(items).find((k) => items[k].classes && items[k].classes.length === 1 && items[k].classes[0] === "Druid" && items[k].avail === "ok");
  const druid = entry("rdrui01", "Druid", "caster", ["Enchanting", "Leatherworking"], { level: 60 });
  const mage = entry("rmage01", "Mage", "caster", ["Enchanting", "Leatherworking"], { level: 60 });
  assert.ok(cand(roster([druid]), druid, id));
  assert.strictEqual(cand(roster([mage]), mage, id), undefined);
});

test("faction: a source on the other side only is not available; a tradeable pattern always is", () => {
  const r = { kind: "gear", avail: "ok", pattern: { bind: "BoP" } };
  const horde = [{ kind: "vendor", npc: "x", side: "horde", certainty: "db" }];
  assert.strictEqual(rank.recipeOpen(r, horde, { faction: "alliance" }), false);
  assert.strictEqual(rank.recipeOpen(r, horde, { faction: "horde" }), true);
  assert.strictEqual(rank.recipeOpen({ kind: "gear", avail: "ok", pattern: { bind: "none" } }, horde, { faction: "alliance" }), true);
  const unknown = [{ kind: "unknown", side: "both", certainty: "db" }];
  assert.strictEqual(rank.recipeOpen(r, unknown, { faction: "alliance" }), true, "D18: unknown sources count as available");
  assert.strictEqual(rank.recipeOpen(r, unknown, { faction: "alliance", knownSourceOnly: true }), false);
});

test("equip skill (D26): missing profession or entered skill below the rank filters; estimated skill flags", () => {
  const goggles = byName("Catseye Ultra Goggles");
  const plain = entry("rmage01", "Mage", "caster", [], { level: 50 });
  assert.strictEqual(cand(roster([plain]), plain, goggles), undefined);
  const low = entry("rmage01", "Mage", "caster", [{ id: "Engineering", skill: 100 }], { level: 50 });
  assert.strictEqual(cand(roster([low]), low, goggles), undefined);
  const high = entry("rmage01", "Mage", "caster", [{ id: "Engineering", skill: 250 }], { level: 50 });
  assert.ok(cand(roster([high]), high, goggles));
  const est = entry("rmage01", "Mage", "caster", ["Engineering"], { level: 50 });
  assert.ok(cand(roster([est]), est, goggles), "estimated skill does not filter");
});

test("recipe skill flags (!, ~!) and specialisation badges never filter (D26, D28)", () => {
  const spec = +Object.keys(items).find((id) => items[id].avail === "ok" && data.recipes.rows[items[id].recipes[0]].pattern && data.recipes.rows[items[id].recipes[0]].pattern.spec === "Armorsmith");
  const smith = entry("rwarr01", "Warrior", "melee", [{ id: "Blacksmithing", skill: 10 }], { level: 60 });
  const c = cand(roster([smith]), smith, spec);
  assert.ok(c, "spec-gated recipe stays a candidate");
  assert.ok(c.route.flags.includes("!"));
  assert.ok(c.route.flags.includes("needs Armorsmith"));
  const est = entry("rwarr01", "Warrior", "melee", ["Blacksmithing"], { level: 60 });
  const recipe = data.recipes.rows[items[spec].recipes[0]];
  const flag = cand(roster([est]), est, spec).route.flags;
  assert.ok(rank.pace(data.roles, items[spec].req) < recipe.skill.learn ? flag.includes("~!") : !flag.includes("~!"));
});

test("specialisation gate (D28, roles §5.3): a set spec that does not cover excludes the crafter; Masters cover Weaponsmith", () => {
  const gated = (spec, bind) => +Object.keys(items).find((id) => items[id].avail === "ok" && items[id].bind === (bind || "BoE") && items[id].recipes.length === 1 &&
    (data.recipes.rows[items[id].recipes[0]].pattern || {}).spec === spec && rank.recipeOpen(data.recipes.rows[items[id].recipes[0]], data.sources.rows[items[id].recipes[0]] || [], roster([])));
  const armor = gated("Armorsmith"), weapon = gated("Weaponsmith");
  assert.ok(armor && weapon);
  const bs = (id, spec) => entry(id, "Warrior", "melee", [{ id: "Blacksmithing", skill: 300, spec }], { level: 60 });
  const wearer = entry("rhunt01", "Hunter", "ranged", [], { level: 60 });
  const opt = { allLearned: true };
  const routeOf = (r, id) => rank.route(id, items[id], wearer, r, data, opt);
  // Unset spec: craftable with the badge.
  let rt = routeOf(roster([wearer, bs("rsmith1", null)]), weapon);
  assert.deepStrictEqual([rt.via, rt.crafter, rt.flags.includes("needs Weaponsmith")], ["crafter", "rsmith1", true]);
  // Armorsmith: Weaponsmith recipes go to the AH (BoE), Armorsmith recipes stay, without the badge.
  rt = routeOf(roster([wearer, bs("rsmith1", "Armorsmith")]), weapon);
  assert.deepStrictEqual([rt.via, rt.crafter, rt.flags.includes("needs Weaponsmith")], ["ah", null, true]);
  assert.strictEqual(routeOf(roster([wearer, bs("rsmith1", "Armorsmith")], { includeAH: false }), weapon), null);
  rt = routeOf(roster([wearer, bs("rsmith1", "Armorsmith")]), armor);
  assert.deepStrictEqual([rt.via, rt.crafter, rt.flags.includes("needs Armorsmith")], ["crafter", "rsmith1", false]);
  // A Master Swordsmith is a Weaponsmith; a covering spec wins over an unset crafter earlier in the roster.
  rt = routeOf(roster([wearer, bs("rsmith1", null), bs("rsmith2", "Master Swordsmith")]), weapon);
  assert.deepStrictEqual([rt.crafter, rt.flags.includes("needs Weaponsmith")], ["rsmith2", false]);
  assert.ok(rank.specCovers("Master Axesmith", "Weaponsmith") && !rank.specCovers("Weaponsmith", "Master Axesmith") && !rank.specCovers("Armorsmith", "Weaponsmith"));
  // A BoP spec piece with a non-covering spec on its only crafter: no route.
  const bop = gated("Armorsmith", "BoP") || gated("Weaponsmith", "BoP") || gated("Master Swordsmith", "BoP") || gated("Master Axesmith", "BoP") || gated("Master Hammersmith", "BoP");
  if (bop) {
    const need = data.recipes.rows[items[bop].recipes[0]].pattern.spec, other = need === "Armorsmith" ? "Weaponsmith" : "Armorsmith";
    const me = Object.assign(bs("rsmith1", other), { cls: "Warrior" });
    assert.strictEqual(rank.route(bop, items[bop], me, roster([me]), data, opt), null);
    assert.strictEqual(rank.route(bop, items[bop], Object.assign(bs("rsmith1", null)), roster([bs("rsmith1", null)]), data, opt).via, "self");
  }
});

test("crafter choice (opts.via): an eligible crafter or the AH wins; an impossible choice falls back silently", () => {
  const mage = entry("rmage01", "Mage", "caster", ["Tailoring"]);
  const priest = entry("rpriest", "Priest", "caster", ["Tailoring"]);
  const warrior = entry("rwarr01", "Warrior", "melee", ["Blacksmithing"]);
  const rogue = entry("rrogue1", "Rogue", "melee", []);
  const r = roster([mage, priest, warrior, rogue]);
  const cloth = +Object.keys(items).find((id) => items[id].avail === "ok" && items[id].bind === "BoE" && items[id].type === "Cloth" && items[id].recipes.length === 1 &&
    data.recipes.rows[items[id].recipes[0]].prof === "Tailoring" && !data.recipes.rows[items[id].recipes[0]].pattern && items[id].req >= 10);
  const go = (e, via, extra) => rank.route(cloth, items[cloth], e, extra || r, data, { via: via ? { [cloth]: via } : undefined });
  assert.deepStrictEqual([go(rogue).via, go(rogue).crafter], ["crafter", "rmage01"], "recommended: first crafter in the roster");
  assert.deepStrictEqual([go(rogue, "rpriest").via, go(rogue, "rpriest").crafter], ["crafter", "rpriest"]);
  assert.strictEqual(go(rogue, "ah").via, "ah");
  assert.strictEqual(go(mage, "rpriest").crafter, "rpriest", "even over self");
  assert.strictEqual(go(priest, "rpriest").via, "self");
  assert.strictEqual(go(rogue, "rwarr01").crafter, "rmage01", "not a tailor: ignored");
  assert.strictEqual(go(rogue, "ah", roster([mage, rogue], { includeAH: false })).crafter, "rmage01", "AH switched off: ignored");
  const opts = rank.routeOptions(cloth, items[cloth], rogue, r, data);
  assert.deepStrictEqual([...opts].map((o) => o.via + ":" + o.crafter), ["crafter:rmage01", "crafter:rpriest", "ah:null"]);
  assert.deepStrictEqual([...rank.routeOptions(cloth, items[cloth], mage, r, data)].map((o) => o.via), ["self", "crafter", "ah"]);
  assert.deepStrictEqual([...rank.routeOptions(bopTailoring, items[bopTailoring], mage, r, data)].map((o) => o.via), ["self"], "BoP: one route, no choice");
  // The path honours it: the step's route carries the chosen crafter.
  const p = rank.path(data, r, rogue, { via: { [cloth]: "rpriest" } });
  for (const g of p.groups) for (const s of g.steps) if (s.routes[cloth]) assert.strictEqual(s.routes[cloth].crafter, "rpriest");
});

test("scarce patterns (D19) and unconfirmed pieces (D15) are alternatives, never core steps", () => {
  const favorSpell = Object.keys(data.sources.rows).find((s) => {
    const r = data.recipes.rows[s], it = items[r.item];
    return r.kind === "gear" && r.prof === "Tailoring" && it.type === "Cloth" && !it.classes && it.req <= 30 &&
      data.sources.rows[s].every((e) => e.kind === "favor") && data.sources.rows[s].some((e) => e.side === "alliance");
  });
  const favorItem = data.recipes.rows[favorSpell].item;
  const prof = data.recipes.rows[favorSpell].prof;
  const e = entry("rmage01", "Mage", "caster", [prof, "Enchanting"], { level: 30 });
  const r = roster([e]);
  const c = cand(r, e, favorItem);
  assert.ok(c.alt && c.route.scarce === "favor");
  const p = rank.path(data, r, e, {});
  const inMain = p.groups.some((g) => g.steps.some((s) => s.items.includes(favorItem)));
  assert.strictEqual(inMain, false);
  const learned = {};
  learned[`${e.id}:${favorSpell}`] = true;
  assert.strictEqual(cand(r, e, favorItem, { learned }).alt, false, "a learned pattern is a normal candidate");
  for (const g of p.groups) for (const s of g.steps) for (const id of s.items) assert.notStrictEqual(items[id].avail, "unconfirmed");
});

test("hidden items drop out; pieces in hand are pinned", () => {
  const e = entry("rmage01", "Mage", "caster", ["Tailoring", "Enchanting"]);
  const r = roster([e]);
  const p = rank.path(data, r, e, {});
  const step = p.groups.find((g) => g.id === "Chest").steps[0];
  const hidden = {};
  hidden[step.items[0]] = true;
  const p2 = rank.path(data, r, e, { hidden });
  assert.ok(!p2.groups.find((g) => g.id === "Chest").steps.some((s) => s.items.includes(step.items[0])));
  const weak = +Object.keys(items).find((id) => items[id].name === "Linen Boots");
  const inHand = {};
  inHand[weak] = true;
  const p3 = rank.path(data, r, e, { inHand });
  const s3 = p3.groups.find((g) => g.id === "Feet").steps.find((s) => s.items.includes(weak));
  assert.ok(s3 && s3.pinned, "a piece in hand stays in the path");
});

test("acceptance 1: a level-12 Priest healer without professions gets only BoE pieces, each with a route", () => {
  const e = entry("rpriest", "Priest", "healer", [], { level: 12 });
  const p = rank.path(data, roster([e]), e, {});
  let n = 0;
  for (const g of p.groups) for (const s of g.steps) for (const id of s.items) {
    n++;
    assert.notStrictEqual(items[id].bind, "BoP", items[id].name);
    assert.strictEqual(s.routes[id].via, "ah");
  }
  assert.ok(n > 5);
});

test("acceptance 2: example roster routes", () => {
  const mage = entry("rmage01", "Mage", "caster", ["Tailoring", "Enchanting"]);
  const warrior = entry("rwarr01", "Warrior", "melee", ["Mining", "Blacksmithing"]);
  const rogue = entry("rrogue1", "Rogue", "melee", []);
  const r = roster([mage, warrior, rogue]);
  for (const who of [mage, warrior, rogue]) {
    const p = rank.path(data, r, who, {});
    for (const g of p.groups) for (const s of g.steps) for (const id of s.items) {
      if (items[id].bind !== "BoP") continue;
      assert.strictEqual(s.routes[id].via, "self", `${who.cls}: BoP ${items[id].name} only for its crafter`);
    }
  }
  const rp = rank.path(data, r, rogue, {});
  const bsWeapon = rp.groups.find((g) => g.id === "Weapons").steps.some((s) => s.items.some((id) => s.routes[id].via === "crafter" && s.routes[id].crafter === "rwarr01"));
  assert.ok(bsWeapon, "Blacksmithing BoE weapons reach the Rogue via the Warrior");
});

test("weights: school shares and the dual-wield hit factor", () => {
  const frost = rank.effectiveWeights(data.roles, entry("rmage01", "Mage", "caster"));
  const fire = rank.effectiveWeights(data.roles, entry("rmage01", "Mage", "caster", [], { options: { school: "fire" } }));
  assert.ok(frost.weights.FrostDmg > frost.weights.FireDmg);
  assert.ok(fire.weights.FireDmg > fire.weights.FrostDmg);
  assert.strictEqual(+frost.weights.FrostDmg.toFixed(4), 0.85);
  assert.strictEqual(rank.effectiveWeights(data.roles, entry("rmage01", "Mage", "caster", [], { weights: { Spi: 2 } })).weights.Spi, 2);
  // Warriors level with two-handers once the dual-wield miss penalty applies (roles.json dualWieldHit).
  const w = entry("rwarr01", "Warrior", "melee", ["Mining", "Blacksmithing"]);
  const steps = rank.path(data, roster([w]), w, { allLearned: true }).groups.find((g) => g.id === "Weapons").steps.filter((s) => s.from <= 45);
  assert.ok(steps.every((s) => s.items.length === 1 && items[s.items[0]].slot === "Two-Hand"));
});

test("the path is deterministic and steps do not overlap", () => {
  const e = entry("rhunt01", "Hunter", "ranged", ["Skinning", "Leatherworking"]);
  const a = JSON.stringify(rank.path(data, roster([e]), e, {})), b = JSON.stringify(rank.path(data, roster([e]), e, {}));
  assert.strictEqual(a, b);
  for (const g of JSON.parse(a).groups) for (let i = 1; i < g.steps.length; i++) assert.ok(g.steps[i].from > g.steps[i - 1].to);
});

// Keep-for-N bans are permanent, so a step must not be banned for a successor that is shorter-lived and goes in a
// later round itself. Seen as: hiding the Handstitched Leather Vest made the White Leather Jerkin appear.
test("keep-for-N drops the shorter-lived successor first; hiding an earlier piece doesn't reshuffle later ones", () => {
  const druid = entry("rdrui02", "Druid", "melee", [], { level: 16 });
  const chest = (hidden) => [...rank.path(data, roster([druid]), druid, { hidden }).groups.find((g) => g.id === "Chest").steps]
    .map((s) => `${s.from}:${items[s.items[0]].name}`).filter((x) => +x.split(":")[0] < 14);
  const vest = byName("Handstitched Leather Vest");
  assert.deepStrictEqual(chest({}), ["3:Handstitched Leather Vest", "8:White Leather Jerkin"]);
  assert.deepStrictEqual(chest({ [vest]: true }), ["8:White Leather Jerkin"]);
});
