#!/usr/bin/env node
"use strict";
// CLI of the data generator.
//
//   node pipeline/main.js fetch --build <b> [--cache <dir>] [--accept-new-hashes]
//       download missing DB2 tables (the only network step) and record their hashes in build-inputs/
//   node pipeline/main.js build --build <b> --date <YYYY-MM-DD> [--cache <dir>] [--out <dir>]
//                               [--report <file>] [--diff-against <git tag>] [--accept-new-hashes]
//       generate site/data/forever/*.js and reports/<b>.md from the cache and curation/ (offline)

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db2 = require("./db2");
const C = require("./constants");
const curation = require("./curation");
const emit = require("./emit");
const { enumerate, itemOrigin, spellOrigin, byId } = require("./enumerate");
const itemsLib = require("./items");
const { buildRecipes, reagents } = require("./recipes");
const sourcesLib = require("./sources");

const REPO = path.resolve(__dirname, "..");
const DATASET = "forever";
const PRODUCT = "wow_classic_beta";

const ITEM_KEYS = ["name", "quality", "ilvl", "req", "inv", "slot", "itemClass", "type", "bind", "armor", "stats", "weapon",
  "classes", "equipSkill", "effects", "set", "mirror", "recipes", "origin", "avail", "reason", "flags", "note", "effectScore"];
const FLAG_ORDER = ["sodSuspect", "noStats", "randomStats", "unknownStat", "negativeStat", "qualityModifier"];

function ordered(obj, keys) {
  const out = {};
  for (const k of keys) if (obj[k] !== undefined) out[k] = obj[k];
  return out;
}

function sha256Files(dir, names) {
  const h = crypto.createHash("sha256");
  for (const n of names) h.update(`${n}\n`).update(fs.readFileSync(path.join(dir, n)));
  return h.digest("hex");
}

// Generate every data section in memory. Pure function of the cached CSVs, curation/ and the date.
function generate(o) {
  const blocking = [], warnings = [];
  const curDir = o.curationDir || path.join(o.repo, "curation");
  const cur = curation.load(curDir);
  blocking.push(...cur.errors);
  const cd = cur.data;
  const load = (build, tables) => db2.loadBuild({ repo: o.repo, cache: o.cache, build, tables, acceptNewHashes: o.acceptNewHashes, verify: o.verify !== false });
  const main = load(o.build, db2.TABLES), ref = load(db2.REFERENCE_BUILD, db2.REFERENCE_TABLES);
  const T = main.tables, era = ref.tables;
  const en = enumerate(T, era);
  const eraSpells = new Set(era.SkillLineAbility.map((r) => +r.Spell));
  const skillLines = byId(T.SkillLine);
  const profName = (line) => C.PROFESSIONS[en.top(line)] || (skillLines.get(en.top(line)) || {}).DisplayName_lang || `Skill ${line}`;
  const classList = T.ChrClasses.map((r) => ({ name: r.Name_lang, id: +r.ID, bit: 1 << (+r.ID - 1) })).sort((a, b) => a.id - b.id);
  const classes = { list: classList, all: classList.reduce((m, c) => m | c.bit, 0) };

  // Recipes: shipped gear rows, then every maker of an intermediate reachable from their mats (§3 step 8).
  const gearSpells = new Set(en.gear.map((r) => r.spell));
  const gearItems = new Set(en.gear.map((r) => r.item));
  const reagentsOf = byId(T.SpellReagents, "SpellID");
  const matsOfSpell = (s) => reagents(reagentsOf.get(s));
  const matIds = new Set(), interRows = [], seenInter = new Set();
  const queue = [];
  for (const r of en.gear) for (const [m] of matsOfSpell(r.spell)) if (!matIds.has(m)) { matIds.add(m); queue.push(m); }
  while (queue.length) {
    const m = queue.shift();
    for (const r of en.makes.get(m) || []) {
      if (seenInter.has(r.spell) || gearSpells.has(r.spell)) continue;
      seenInter.add(r.spell);
      interRows.push(r);
      for (const [mm] of matsOfSpell(r.spell)) if (!matIds.has(mm)) { matIds.add(mm); queue.push(mm); }
    }
  }
  const rec = buildRecipes([...en.gear, ...interRows], (r) => (gearSpells.has(r.spell) ? "gear" : "intermediate"), { en, T, eraSpells, profName });
  for (const s of rec.collisions) blocking.push(`spell ${s} creates more than one item`);

  // Items.
  const tb = itemsLib.tables(T);
  const effectLinks = new Map();
  for (const x of T.ItemXItemEffect) {
    const id = +x.ItemID;
    if (!gearItems.has(id)) continue;
    if (!effectLinks.has(id)) effectLinks.set(id, []);
    effectLinks.get(id).push(+x.ItemEffectID);
  }
  const tally = { halves: 0 };
  const unidentified = new Map((cd.rules ? cd.rules.statsUnidentified : []).map((f) => [f.id, f]));
  const seenUnidentified = new Set();
  const recipesOf = new Map();
  for (const r of en.gear) {
    if (!recipesOf.has(r.item)) recipesOf.set(r.item, []);
    if (!recipesOf.get(r.item).includes(r.spell)) recipesOf.get(r.item).push(r.spell);
  }
  const items = new Map(), raw = new Map();
  for (const id of [...gearItems].sort((a, b) => a - b)) {
    const b = itemsLib.buildItem(id, { en, tb, classes, profName, effectLinks, tally });
    const it = b.rec;
    it.recipes = recipesOf.get(id).sort((x, y) => x - y);
    it.origin = itemOrigin(id, en.eraItem);
    const flags = new Set();
    if (it.quality >= 2 && !Object.keys(it.stats).length) flags.add("noStats");
    if (b.qualityModifier) flags.add("qualityModifier");
    for (const { id: sid, pct } of b.statIds) {
      if (pct < 0) flags.add("negativeStat");
      if (C.STAT[sid]) continue;
      if (unidentified.has(sid)) { flags.add("unknownStat"); seenUnidentified.add(sid); }
      else blocking.push(`unknown stat ID ${sid} on item ${id} (${it.name}): map it in pipeline/constants.js or list it in curation/rules.json statsUnidentified`);
    }
    if (it.itemClass === "weapon" && !it.weapon) blocking.push(`item ${id} (${it.name}): no weapon damage (missing table row or speed)`);
    if (it.itemClass === "armor" && C.ARMOR_COL[it.type] && !it.armor) blocking.push(`item ${id} (${it.name}): no armor value`);
    it.flags = flags;
    items.set(id, it);
    raw.set(id, b);
  }
  for (const sid of unidentified.keys()) if (!seenUnidentified.has(sid)) warnings.push(`curation/rules.json: unidentified stat ${sid} no longer occurs`);

  // Recipe availability: a stub pattern on a vanilla or SoD item is unconfirmed (R3).
  for (const [spell, r] of rec.rows) {
    const origin = items.has(r.item) ? items.get(r.item).origin : itemOrigin(r.item, en.eraItem);
    r.avail = r.pattern && r.pattern.stub && origin !== "forever" ? "unconfirmed" : "ok";
  }

  // Sources: derived per recipe, factions from DB2, then curated families.
  const sparse = en.sparse;
  const repFactions = new Set();
  for (const p of rec.choice.values()) for (const pid of (p && p.live) || []) if (+sparse.get(pid).MinFactionID > 0) repFactions.add(+sparse.get(pid).MinFactionID);
  for (const fam of cd.sources || []) for (const e of fam.sources) if (e.rep) repFactions.add(e.rep.faction);
  const factions = sourcesLib.factions(T, repFactions);
  const factionOf = (id) => (factions[id] ? factions[id].side : "both");
  const rowBySpell = new Map([...en.gear, ...interRows].map((r) => [r.spell, r]));
  const derived = new Map();
  for (const [spell, r] of rec.rows) {
    const origin = items.has(r.item) ? items.get(r.item).origin : itemOrigin(r.item, en.eraItem);
    derived.set(spell, sourcesLib.derive(rowBySpell.get(spell), rec.choice.get(spell), origin, sparse, factionOf));
  }
  const merged = sourcesLib.merge(derived, items, cd.sources || []);
  const srcRows = merged.rows;

  // Item availability and curation (R3, R4, R8; D15).
  const curatedItem = new Map();
  for (const fam of cd.items || []) for (const id of fam.items) curatedItem.set(id, fam);
  for (const [id, it] of items) {
    const recs = it.recipes.map((s) => rec.rows.get(s));
    it.avail = recs.every((r) => r.avail === "unconfirmed") ? "unconfirmed" : "ok";
    if (it.avail === "unconfirmed") it.reason = "The pattern item is not in this build's game data (later content or removed)";
    const allSrc = it.recipes.flatMap((s) => srcRows.get(s));
    if (allSrc.length && allSrc.every((e) => e.kind === "unobtainable")) { it.avail = "unobtainable"; it.reason = allSrc[0].reason; }
    if (it.origin === "sod" && !recs.some((r) => r.pattern && r.pattern.id >= C.FOREVER_ITEM_MIN)) {
      it.flags.add("sodSuspect");
      if (!curatedItem.has(id) || !curatedItem.get(id).avail) blocking.push(`item ${id} (${it.name}): SoD-range item without a Forever pattern needs a decision in curation/items.json (R4)`);
    }
    const fam = curatedItem.get(id);
    if (fam) {
      if (fam.avail) { it.avail = fam.avail; it.reason = fam.avail === "ok" ? undefined : fam.reason; }
      if (fam.note) it.note = fam.note;
      for (const f of fam.flags || []) it.flags.add(f);
      if (fam.effectScore !== undefined) it.effectScore = fam.effectScore;
    }
    if (it.flags.has("noStats") && !it.effects && !fam) warnings.push(`item ${id} (${it.name}): quality ${it.quality} without stats or effects needs a curation check (R8)`);
  }

  // Faction pairs (D17): identical slot, type, item level, required level, quality, bind and stat shares, one
  // available only to the Alliance and one only to the Horde.
  const sideOf = (it) => {
    const sides = new Set(it.recipes.flatMap((s) => srcRows.get(s)).map((e) => e.side));
    return sides.size === 1 ? [...sides][0] : "mixed";
  };
  const groups = new Map();
  for (const [id, it] of items) {
    const shares = raw.get(id).statIds.map((x) => `${x.id}:${x.pct}`).sort().join(",");
    const key = [it.slot, it.type, it.ilvl, it.req, it.quality, it.bind, shares].join("|");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(id);
  }
  let mirrorPairs = 0;
  for (const ids of groups.values()) {
    if (ids.length < 2) continue;
    const a = ids.filter((id) => sideOf(items.get(id)) === "alliance"), h = ids.filter((id) => sideOf(items.get(id)) === "horde");
    for (let k = 0; k < Math.min(a.length, h.length); k++) {
      items.get(a[k]).mirror = h[k];
      items.get(h[k]).mirror = a[k];
      mirrorPairs++;
    }
  }

  // Specialisations must be known to rules.json (the page's select lists them).
  const specs = new Map((cd.rules ? cd.rules.professions : []).map((p) => [p.name, new Set(p.specs || [])]));
  for (const [spell, r] of rec.rows) {
    if (r.pattern && r.pattern.spec && !(specs.get(r.prof) || new Set()).has(r.pattern.spec)) {
      blocking.push(`recipe ${spell}: specialisation "${r.pattern.spec}" is not listed for ${r.prof} in curation/rules.json`);
    }
  }

  // Mats.
  const vendor = new Set(), gathered = new Map();
  for (const fam of (cd.mats && cd.mats.vendor) || []) for (const id of fam.items) vendor.add(id);
  for (const fam of (cd.mats && cd.mats.gathered) || []) for (const id of fam.items) gathered.set(id, fam.prof);
  const madeBy = new Map();
  for (const [spell, r] of rec.rows) {
    if (!matIds.has(r.item)) continue;
    if (!madeBy.has(r.item)) madeBy.set(r.item, []);
    madeBy.get(r.item).push(spell);
  }
  const mats = {};
  for (const id of [...matIds].sort((a, b) => a - b)) {
    const s = sparse.get(id);
    if (!s) { blocking.push(`mat ${id} has no ItemSparse row`); continue; }
    let v = null;
    if (vendor.has(id)) {
      v = { copper: +s.BuyPrice, stack: Math.max(1, +s.VendorStackCount) };
      if (!v.copper) warnings.push(`mat ${id} (${s.Display_lang}) is curated as a vendor good but has no BuyPrice`);
    }
    mats[id] = {
      name: s.Display_lang, quality: +s.OverallQualityID, bind: C.BIND[+s.Bonding] || `Bind${s.Bonding}`,
      madeBy: (madeBy.get(id) || []).sort((a, b) => a - b), vendor: v, gathered: gathered.get(id) || null,
    };
  }

  // Curation references against the built data.
  const known = {
    items: new Map([...items].map(([id, it]) => [id, it.name])),
    mats: new Map(Object.entries(mats).map(([id, m]) => [+id, m.name])),
    factions: new Set(T.Faction.map((r) => +r.ID)),
  };
  const refs = curation.checkRefs(cd, known);
  blocking.push(...refs.errors);
  warnings.push(...refs.warnings);

  // Sections.
  const head = { dataset: DATASET, build: o.build };
  const itemRows = {};
  for (const [id, it] of items) {
    const flags = FLAG_ORDER.filter((f) => it.flags.has(f)).concat([...it.flags].filter((f) => !FLAG_ORDER.includes(f)).sort());
    it.flags = flags.length ? flags : undefined;
    itemRows[id] = ordered(it, ITEM_KEYS);
  }
  const recipeRows = {};
  for (const spell of [...rec.rows.keys()].sort((a, b) => a - b)) {
    const r = rec.rows.get(spell);
    recipeRows[spell] = ordered(r, ["kind", "item", "out", "prof", "skill", "mats", "pattern", "origin", "avail"]);
  }
  const sourceRows = {};
  for (const spell of [...srcRows.keys()].sort((a, b) => a - b)) sourceRows[spell] = srcRows.get(spell);
  const npcs = {};
  for (const slug of Object.keys(cd.npcs || {}).sort()) npcs[slug] = cd.npcs[slug];

  const rules = cd.rules || {};
  const roles = cd.roles || {};
  const q = (roles.baseline && roles.baseline.quality) || 2;
  const col = C.BUDGET_COL[q];
  const par = {};
  for (let lvl = 1; lvl <= 60; lvl++) {
    const rp = tb.rpp.get(lvl);
    const d = (t) => { const row = t.get(lvl); return row ? itemsLib.round2(+row[`Quality_${q}`]) : 0; };
    const at = tb.armorTotal.get(lvl), aq = tb.armorQuality.get(lvl);
    const armor = {};
    for (const t of Object.keys(C.ARMOR_COL)) armor[t] = at && aq ? itemsLib.round2(+at[C.ARMOR_COL[t][0]] * +aq[`Qualitymod_${q}`]) : 0;
    par[lvl] = { budget: rp ? [0, 1, 2, 3, 4].map((k) => +rp[`${col}_${k}`]) : [0, 0, 0, 0, 0], dps: [d(tb.dmg.one), d(tb.dmg.two), d(tb.dmg.wand)], armor };
  }
  // ArmorLocation modifiers per armor slot group, for the armor of the par item.
  const armorLocation = {};
  for (const [group, inv] of Object.entries({ Head: 1, Shoulder: 3, Back: 16, Chest: 5, Wrist: 9, Hands: 10, Waist: 6, Legs: 7, Feet: 8 })) {
    const loc = tb.armorLocation.get(inv);
    armorLocation[group] = {};
    for (const t of Object.keys(C.ARMOR_COL)) armorLocation[group][t] = loc ? +(+loc[C.ARMOR_COL[t][1]]).toFixed(4) : 0;
  }
  const statKeys = [...new Set([...Object.values(C.STAT), ...[...unidentified.keys()].map((id) => C.statKey(id))])];

  const sections = {
    items: { ...head, rows: itemRows, sets: itemsLib.buildSets(new Set([...items.values()].filter((i) => i.set).map((i) => i.set.id)), T, tb) },
    recipes: { ...head, rows: recipeRows },
    mats: { ...head, rows: mats },
    sources: { ...head, factions, npcs, rows: sourceRows },
    rules: { ...head, schema: rules.schema, classes: rules.classes, slotGroups: rules.slotGroups, statKeys, statLabels: rules.statLabels,
      statsUnidentified: (rules.statsUnidentified || []).map((f) => ({ id: f.id, key: C.statKey(f.id), why: f.why })),
      professions: rules.professions, armorLocation, par },
    roles: { ...head, ...roles },
    reference: { ...head, ...(cd.reference || {}) },
  };
  const lines = { items: ["rows", "sets"], recipes: ["rows"], mats: ["rows"], sources: ["factions", "npcs", "rows"], rules: ["par"], roles: [], reference: [] };
  const files = {};
  for (const [name, obj] of Object.entries(sections)) files[name] = emit.render(name, obj, { lines: lines[name], split: true });

  const counts = {
    items: Object.keys(itemRows).length,
    recipes: Object.keys(recipeRows).length,
    gearRecipes: Object.values(recipeRows).filter((r) => r.kind === "gear").length,
    intermediateRecipes: Object.values(recipeRows).filter((r) => r.kind === "intermediate").length,
    mats: Object.keys(mats).length,
    intermediates: Object.values(mats).filter((m) => m.madeBy.length).length,
    specGated: Object.values(recipeRows).filter((r) => r.kind === "gear" && r.pattern && r.pattern.spec).length,
    curatedRecipes: merged.curatedRecipes.size,
    mirrorPairs,
  };
  const curFiles = fs.readdirSync(curDir).filter((f) => f.endsWith(".json")).sort();
  const manifest = (b) => { const p = db2.manifestPath(o.repo, b); return fs.existsSync(p) ? crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex") : null; };
  const meta = {
    dataset: DATASET, flavor: "forever", product: PRODUCT, build: o.build, levels: [1, 60], skillCap: 300, locale: "enUS",
    status: "beta", generated: o.date, generator: C.GENERATOR, schema: C.SCHEMA,
    inputs: {
      db2: { manifest: `build-inputs/db2-${o.build}.sha256`, sha256: manifest(o.build) },
      reference: { manifest: `build-inputs/db2-${db2.REFERENCE_BUILD}.sha256`, sha256: manifest(db2.REFERENCE_BUILD) },
      curation: { files: curFiles, sha256: sha256Files(curDir, curFiles) },
    },
    counts,
    notes: (cd.reference && cd.reference.notes) || [],
    dataHash: emit.dataHash(files),
  };
  sections.meta = meta;
  files.meta = emit.render("meta", meta, { split: true });

  return {
    sections, files, blocking, warnings,
    info: { funnel: en.funnel, halves: tally.halves, hashes: main.hashes, curation: cd, interRows: interRows.length },
  };
}

// Generate, write site/data/<dataset>/*.js and the build report.
function build(o) {
  const g = generate(o);
  const out = o.out || path.join(o.repo, "site", "data", DATASET);
  fs.mkdirSync(out, { recursive: true });
  for (const [name, text] of Object.entries(g.files)) fs.writeFileSync(path.join(out, `${name}.js`), text);
  const reportFile = o.report || path.join(o.repo, "reports", `${o.build}.md`);
  const { report } = require("./report");
  fs.mkdirSync(path.dirname(reportFile), { recursive: true });
  fs.writeFileSync(reportFile, report(g, o));
  const f = g.info.funnel;
  const summary = `${o.build}: ${g.sections.meta.counts.items} items, ${g.sections.meta.counts.recipes} recipes, ` +
    `${g.sections.meta.counts.mats} mats (funnel ${f.craftRows} → ${f.equippable} → ${f.inGame} → ${f.items}); ` +
    `${g.blocking.length} blocking, ${g.warnings.length} warnings; report ${path.relative(o.repo, reportFile)}`;
  return { ...g, summary };
}

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) { out._.push(a); continue; }
    const key = a.slice(2);
    if (key === "accept-new-hashes") { out[key] = true; continue; }
    if (i + 1 >= argv.length) throw new Error(`--${key} needs a value`);
    out[key] = argv[++i];
  }
  return out;
}

async function main(argv) {
  const args = parseArgs(argv);
  const cmd = args._[0];
  const log = (s) => process.stderr.write(s + "\n");
  if (!args.build) throw new Error("--build is required");
  const cache = db2.cacheRoot(args.cache);
  if (cmd === "fetch") {
    const opts = { repo: REPO, cache, acceptNewHashes: !!args["accept-new-hashes"], log };
    const a = await db2.fetchBuild({ ...opts, build: args.build, tables: db2.TABLES });
    const b = await db2.fetchBuild({ ...opts, build: db2.REFERENCE_BUILD, tables: db2.REFERENCE_TABLES });
    for (const c of a) log(`${args.build} ${c}`);
    for (const c of b) log(`${db2.REFERENCE_BUILD} ${c}`);
    return;
  }
  if (cmd === "build") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date || "")) throw new Error("--date YYYY-MM-DD is required");
    const res = build({
      repo: REPO, cache, build: args.build, date: args.date, acceptNewHashes: !!args["accept-new-hashes"],
      out: args.out ? path.resolve(args.out) : null, report: args.report ? path.resolve(args.report) : null,
      diffAgainst: args["diff-against"] || null, log,
    });
    log(res.summary);
    if (res.blocking.length) { process.exitCode = 1; }
    return;
  }
  throw new Error("usage: node pipeline/main.js fetch|build --build <build> [--date YYYY-MM-DD]");
}

if (require.main === module) {
  main(process.argv.slice(2)).catch((e) => {
    process.stderr.write(`error: ${e.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = { build, generate, parseArgs };
