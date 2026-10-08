"use strict";
// Formula fixtures (game-data-pipeline §15) on the committed DB2 subset, and enumeration counts on the full cache.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const db2 = require("../../pipeline/db2");
const { generate } = require("../../pipeline/main");
const { enumerate } = require("../../pipeline/enumerate");
const emit = require("../../pipeline/emit");

const REPO = path.resolve(__dirname, "..", "..");
const BUILD = "1.60.1.70205";
const fixture = generate({ repo: REPO, cache: path.join(REPO, "tests", "fixtures"), build: BUILD, date: "2026-10-08", verify: false });
const item = (id) => fixture.sections.items.rows[id];

test("Fine Leather Boots: armor 51, Agi 3, Sta 2", () => {
  assert.strictEqual(item(2307).armor, 51);
  assert.deepStrictEqual(item(2307).stats, { Agi: 3, Sta: 2 });
});

test("weapon damage rules (D14)", () => {
  const w = (id) => item(id).weapon;
  assert.deepStrictEqual([w(249392).min, w(249392).max, w(249392).basis], [32, 49, "caster"], "Glimmering Staff");
  assert.deepStrictEqual([w(3851).min, w(3851).max, w(3851).basis], [43, 66, "caster"], "Solid Iron Maul");
  assert.deepStrictEqual([w(4369).min, w(4369).max, w(4369).basis], [15, 28, "ranged"], "Deadly Blunderbuss");
  assert.deepStrictEqual([w(6214).min, w(6214).max, w(6214).basis], [28, 43, "tables"], "Heavy Copper Maul");
  assert.strictEqual(w(11288).dps, 17.5, "Greater Magic Wand");
  assert.strictEqual(w(3851).dps, 15.57, "DPS from the range, 2 decimals (D10)");
});

test("weapon damage corrections from in-game tooltips (game-data-pipeline §6.3, 2026-10-08)", () => {
  const w = (id) => { const x = item(id).weapon; return [x.min, x.max, x.speed, x.dps, x.basis]; };
  assert.deepStrictEqual(w(12260), [14, 26, 1.4, 14.29, "caster"], "Searing Golden Blade: one-hand caster × 2/3");
  assert.deepStrictEqual(w(22383), [39, 73, 1.8, 31.11, "caster"], "Sageblade: one-hand caster × 2/3");
  assert.deepStrictEqual(w(285279), [15, 29, 2.2, 10, "thrown"], "Cracked Blacksmith Hammer: OneHand × 0.9");
  assert.deepStrictEqual(w(285280), [28, 53, 2.1, 19.29, "thrown"], "Mithril Blacksmith Hammer");
  assert.deepStrictEqual(w(285281), [49, 92, 2.2, 32.05, "thrown"], "Arcanite Blacksmith Hammer");
  assert.deepStrictEqual(w(285275), [2, 11, 2, 3.09, "curated"], "Satchel of Copper Bombs: curated override");
});

test("icons: listfile stem from Item.IconFileDataID, else the default appearance; mats too; listfile in meta.inputs", () => {
  assert.strictEqual(item(2307).icon, "inv_boots_06", "Item.IconFileDataID 132540");
  assert.strictEqual(item(250488).icon, "inv_chest_chain_07", "IconFileDataID 0: ItemModifiedAppearance → ItemAppearance");
  assert.strictEqual(fixture.sections.mats.rows[2318].icon, "inv_misc_leatherscrap_03", "Light Leather");
  assert.deepStrictEqual(Object.keys(fixture.sections.items.rows[2307]).slice(0, 2), ["name", "icon"]);
  assert.strictEqual(fixture.sections.meta.inputs.listfile.tag, "202610080338");
  assert.match(fixture.sections.meta.inputs.listfile.sha256, /^[0-9a-f]{64}$/);
});

test("equip skill, effects, mirror pair, stub pattern, curated flags, shields", () => {
  assert.deepStrictEqual(item(10501).equipSkill, { prof: "Engineering", rank: 220 });
  assert.strictEqual(item(10501).effects[0].on, "equip");
  assert.deepStrictEqual(item(10501).flags, ["noStats"]);
  assert.strictEqual(item(277054).mirror, 277046);
  assert.strictEqual(item(277046).mirror, 277054);
  const shirt = fixture.sections.recipes.rows[item(250488).recipes[0]];
  assert.strictEqual(shirt.pattern.stub, true);
  assert.strictEqual(shirt.skill.approx, true);
  assert.strictEqual(fixture.sections.sources.rows[item(250488).recipes[0]][0].kind, "trainer");
  assert.strictEqual(item(8211).avail, "unconfirmed");
  assert.deepStrictEqual(item(8211).flags, ["noStats", "randomStats"]);
  assert.strictEqual(item(22198).stats.Stat124, 5);
  assert.ok(item(22198).armor > 0, "shield armor from ItemArmorShield");
});

const cache = db2.cacheRoot();
const haveCache = fs.existsSync(db2.tablePath(cache, BUILD, "ItemSparse"));
const skip = !haveCache && "DB2 cache not found (run node pipeline/main.js fetch)";

test("enumeration funnel of the pinned build (game-data-pipeline §4.1)", { skip }, () => {
  const load = (b, t) => db2.loadBuild({ repo: REPO, cache, build: b, tables: t }).tables;
  const en = enumerate(load(BUILD, db2.TABLES), load(db2.REFERENCE_BUILD, db2.REFERENCE_TABLES));
  const f = en.funnel;
  assert.deepStrictEqual([f.craftRows, f.equippable, f.equippableItems, f.noSparse, f.inGame, f.inGameItems, f.items],
    [2303, 1567, 1564, 286, 1281, 1279, 1274]);
  // §4.2: per profession × bracket, by required level, the 1,281 rows before the cosmetic drop.
  const want = {
    Blacksmithing: [27, 44, 60, 48, 75, 94, 33], Leatherworking: [37, 53, 55, 55, 79, 135, 29], Tailoring: [36, 44, 52, 54, 61, 73, 19],
    Engineering: [41, 3, 3, 7, 8, 11, 7], Enchanting: [2, 1, 8, 3, 9, 7, 7], Alchemy: [0, 0, 0, 0, 1, 0, 0],
  };
  const names = { 164: "Blacksmithing", 165: "Leatherworking", 197: "Tailoring", 202: "Engineering", 333: "Enchanting", 171: "Alchemy" };
  const got = {};
  for (const p of Object.values(names)) got[p] = [0, 0, 0, 0, 0, 0, 0];
  for (const r of [...en.gear, ...en.cosmetic]) {
    const req = +en.sparse.get(r.item).RequiredLevel;
    got[names[r.line]][req >= 60 ? 6 : Math.floor(req / 10)]++;
  }
  assert.deepStrictEqual(got, want);
});

test("generated counts: mats, intermediates, specialisations", { skip }, () => {
  const meta = emit.parse(fs.readFileSync(path.join(REPO, "site", "data", "forever", "meta.js"), "utf8")).value;
  assert.strictEqual(meta.counts.items, 1274);
  assert.strictEqual(meta.counts.mats, 356);
  assert.strictEqual(meta.counts.intermediates, 131);
  assert.strictEqual(meta.counts.specGated, 86);
});
