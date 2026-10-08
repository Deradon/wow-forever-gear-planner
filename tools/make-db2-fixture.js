#!/usr/bin/env node
"use strict";
// Cut the DB2 fixture subset for tests/fixtures/db2/ from the cache: only the rows a handful of items need
// (their craft spells, patterns, mats, effects, budget and damage rows), with the real column headers.
//
//   node tools/make-db2-fixture.js [--cache <dir>]
//
// The item list is FIXTURE_ITEMS below; the output is deterministic. Re-run after changing the list.

const fs = require("fs");
const path = require("path");
const db2 = require("../pipeline/db2");
const { parseCsv } = require("../pipeline/csv");

const BUILD = "1.60.1.70205";
// Formula fixtures (game-data-pipeline §15) plus one example per rule the tests touch.
const FIXTURE_ITEMS = [
  2307,   // Fine Leather Boots: armor 51, Agi 3, Sta 2
  249392, // Glimmering Staff: caster weapon, 32–49
  3851,   // Solid Iron Maul: caster flag on a Stamina mace, 43–66
  4369,   // Deadly Blunderbuss: gun rule, 15–28
  6214,   // Heavy Copper Maul: tables, 28–43
  11288,  // Greater Magic Wand: wand table, 17.5 DPS
  10501,  // Catseye Ultra Goggles: equip skill, equip effect, no stats
  277054, 277046, // Azure / Cloudy Stormsewn Cowl: faction mirror pair
  250488, // Veteran's Chain Shirt: stub pattern on a Forever item (trainer)
  8211,   // Wild Leather Vest: curated unconfirmed
  22198,  // Jagged Obsidian Shield: shield armor, unidentified stat 124
];

const REPO = path.resolve(__dirname, "..");
const args = process.argv.slice(2);
const cache = db2.cacheRoot(args[0] === "--cache" ? args[1] : null);
const OUT = path.join(REPO, "tests", "fixtures", "db2");

function load(build, table) {
  const text = fs.readFileSync(db2.tablePath(cache, build, table), "utf8");
  const rows = parseCsv(text);
  return { header: rows[0], rows: rows.slice(1), text };
}

function csvField(v) { return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }

function write(build, table, t, keep) {
  const col = (name) => t.header.indexOf(name);
  const rows = t.rows.filter((r) => keep(r, col));
  const dir = path.join(OUT, build);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${table}.csv`), [t.header, ...rows].map((r) => r.map(csvField).join(",")).join("\n") + "\n");
  return rows;
}

const T = {};
for (const t of db2.TABLES) T[t] = load(BUILD, t);
const v = (t, r, name) => r[T[t].header.indexOf(name)];

const items = new Set(FIXTURE_ITEMS), spells = new Set(), mats = new Set(), patterns = new Set(), effects = new Set();
const lines = new Set([164, 165, 197, 202, 333, 171, 186, 185, 129]);
for (const r of T.SpellEffect.rows) if (v("SpellEffect", r, "Effect") === "24" && items.has(+v("SpellEffect", r, "EffectItemType"))) spells.add(+v("SpellEffect", r, "SpellID"));
for (const r of T.SpellReagents.rows) {
  if (!spells.has(+v("SpellReagents", r, "SpellID"))) continue;
  for (let k = 0; k < 8; k++) if (+v("SpellReagents", r, `Reagent_${k}`) > 0) mats.add(+v("SpellReagents", r, `Reagent_${k}`));
}
for (const r of T.ItemEffect.rows) if (spells.has(+v("ItemEffect", r, "SpellID")) && v("ItemEffect", r, "TriggerType") === "6") effects.add(+v("ItemEffect", r, "ID"));
for (const r of T.ItemXItemEffect.rows) {
  const id = +v("ItemXItemEffect", r, "ItemID"), eff = +v("ItemXItemEffect", r, "ItemEffectID");
  if (effects.has(eff)) patterns.add(id);
  if (items.has(id)) effects.add(eff);
}
const allItems = new Set([...items, ...mats, ...patterns]);
const sparse = T.ItemSparse.rows.filter((r) => allItems.has(+v("ItemSparse", r, "ID")));
const ilvls = new Set(sparse.map((r) => +v("ItemSparse", r, "ItemLevel")));
for (let l = 1; l <= 60; l++) ilvls.add(l);
const spellNames = new Set([...spells]);
for (const r of T.ItemEffect.rows) if (effects.has(+v("ItemEffect", r, "ID"))) spellNames.add(+v("ItemEffect", r, "SpellID"));
for (const r of sparse) if (+v("ItemSparse", r, "RequiredAbility") > 0) spellNames.add(+v("ItemSparse", r, "RequiredAbility"));
const factions = new Set(sparse.map((r) => +v("ItemSparse", r, "MinFactionID")).filter((x) => x > 0));
for (const f of [2740, 2758, 2787]) factions.add(f);

const id = (r, col) => +r[col("ID")];
const keepers = {
  SkillLine: (r, col) => lines.has(id(r, col)) || lines.has(+r[col("ParentSkillLineID")]),
  SkillLineAbility: (r, col) => spells.has(+r[col("Spell")]),
  SpellEffect: (r, col) => spells.has(+r[col("SpellID")]),
  SpellReagents: (r, col) => spells.has(+r[col("SpellID")]),
  SpellName: (r, col) => spellNames.has(id(r, col)),
  Item: (r, col) => allItems.has(id(r, col)),
  ItemSparse: (r, col) => allItems.has(id(r, col)),
  ItemEffect: (r, col) => effects.has(id(r, col)),
  ItemXItemEffect: (r, col) => effects.has(+r[col("ItemEffectID")]),
  RandPropPoints: (r, col) => ilvls.has(id(r, col)),
  ItemArmorTotal: (r, col) => ilvls.has(+r[col("ItemLevel")]),
  ItemArmorQuality: (r, col) => ilvls.has(id(r, col)),
  ItemArmorShield: (r, col) => ilvls.has(+r[col("ItemLevel")]),
  ItemDamageOneHand: (r, col) => ilvls.has(+r[col("ItemLevel")]),
  ItemDamageTwoHand: (r, col) => ilvls.has(+r[col("ItemLevel")]),
  ItemDamageWand: (r, col) => ilvls.has(+r[col("ItemLevel")]),
  ItemSet: () => false,
  ItemSetSpell: () => false,
  Faction: (r, col) => factions.has(id(r, col)),
};
for (const t of db2.TABLES) write(BUILD, t, T[t], keepers[t] || (() => true));
for (const t of db2.REFERENCE_TABLES) {
  const e = load(db2.REFERENCE_BUILD, t);
  write(db2.REFERENCE_BUILD, t, e, t === "SkillLineAbility" ? (r, col) => spells.has(+r[col("Spell")]) : (r, col) => allItems.has(id(r, col)));
}
process.stderr.write(`fixture: ${items.size} items, ${spells.size} spells, ${mats.size} mats, ${patterns.size} patterns → ${path.relative(REPO, OUT)}\n`);
