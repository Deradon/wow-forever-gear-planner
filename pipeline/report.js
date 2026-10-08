"use strict";
// Build report reports/<build>.md (game-data-pipeline §14 step 3, roadmap M1): the maintainer's review surface.
// Deterministic: everything comes from the generated sections; the ranking is site/lib/rank.js, as on the page.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const db2 = require("./db2");
const emit = require("./emit");
const rank = require("../site/lib/rank");

// Planning measurements for build 1.60.1.70205 (game-data-pipeline §4), shown next to the computed counts.
const MEASURED = {
  "1.60.1.70205": { craftRows: 2303, equippable: 1567, noSparse: 286, inGame: 1281, items: 1274, mats: 356, intermediates: 131, specGated: 86, cosmeticItems: 5 },
};

// Review rosters (D30: top picks per role and bracket). Professions follow roles-stat-weights §5.4.
const REVIEW = [
  { cls: "Warrior", role: "melee", professions: ["Mining", "Blacksmithing"] },
  { cls: "Mage", role: "caster", professions: ["Tailoring", "Enchanting"] },
  { cls: "Priest", role: "healer", professions: ["Tailoring", "Enchanting"] },
  { cls: "Hunter", role: "ranged", professions: ["Skinning", "Leatherworking"] },
  { cls: "Druid", role: "tank", professions: ["Skinning", "Leatherworking"] },
  { cls: "Rogue", role: "melee", professions: ["Skinning", "Leatherworking"] },
  { cls: "Paladin", role: "melee", professions: ["Mining", "Blacksmithing"] },
  { cls: "Shaman", role: "melee", professions: ["Skinning", "Leatherworking"] },
  { cls: "Warlock", role: "caster", professions: ["Tailoring", "Enchanting"] },
];
const BRACKETS = [[1, 9], [10, 19], [20, 29], [30, 39], [40, 49], [50, 59], [60, 60]];

const n = (x) => x.toLocaleString("en-US");
const esc = (s) => String(s).replace(/\|/g, "\\|");

function table(head, rows) {
  return [`| ${head.join(" | ")} |`, `|${head.map(() => "---").join("|")}|`, ...rows.map((r) => `| ${r.join(" | ")} |`)].join("\n");
}

// Index into BRACKETS; required level 0 counts with 1–9.
const bracketOf = (req) => (req >= 60 ? 6 : Math.floor(Math.max(0, req) / 10));

function itemLabel(data, id) {
  const it = data.items.rows[id];
  return `${esc(it.name)} (${id}, ${it.req})`;
}

// --- sections -------------------------------------------------------------------------------------------------

// Third column: the planning measurement for its build, else the baseline's meta.counts when diffing.
function funnel(g, build, baseMeta) {
  const f = g.info.funnel, c = g.sections.meta.counts;
  const m = MEASURED[build] || (baseMeta && baseMeta.counts) || {};
  const head = MEASURED[build] || !baseMeta ? "Planning measurement" : `Baseline ${baseMeta.build}`;
  const mark = (want, v) => (MEASURED[build] ? (want === v ? " ✓" : " ✗") : "");
  const row = (label, v, key) => [label, n(v), m[key] === undefined ? "–" : n(m[key]) + mark(m[key], v)];
  return table(["Step", "This build", head], [
    row("Craft rows (profession spells with effect 24)", f.craftRows, "craftRows"),
    row("Equippable results (rows)", f.equippable, "equippable"),
    [`… without an ItemSparse row (R1: ${f.noSparseByOrigin.sod} SoD, ${f.noSparseByOrigin.forever} Forever-new, ${f.noSparseByOrigin.vanilla} vanilla)`, n(f.noSparse), m.noSparse === undefined ? "–" : n(m.noSparse) + mark(m.noSparse, f.noSparse)],
    row("In the game, required level ≤ 60 (rows)", f.inGame, "inGame"),
    row("Cosmetic items dropped (R2)", f.cosmeticItems, "cosmeticItems"),
    row("**Items shipped**", c.items, "items"),
    row("Gear recipes shipped", c.gearRecipes, "gearRecipes"),
    row("Intermediate recipes shipped", c.intermediateRecipes, "intermediateRecipes"),
    row("Mats (incl. intermediates' reagents)", c.mats, "mats"),
    row("Intermediates (mats with a recipe)", c.intermediates, "intermediates"),
    row("Gear recipes that need a specialisation", c.specGated, "specGated"),
    row("Gear recipes with curated sources", c.curatedRecipes, "curatedRecipes"),
    row("Faction mirror pairs (D17)", c.mirrorPairs, "mirrorPairs"),
  ]);
}

const PROFS = ["Blacksmithing", "Leatherworking", "Tailoring", "Engineering", "Enchanting", "Alchemy"];
const BRACKET_HEAD = ["0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60"];

// Gear recipes per profession: 7 bracket counts and the total; the last row "All" sums them.
function professionCounts(data) {
  const out = {}, tot = new Array(8).fill(0);
  for (const p of PROFS) {
    const c = new Array(8).fill(0);
    for (const r of Object.values(data.recipes.rows)) {
      if (r.kind !== "gear" || r.prof !== p) continue;
      c[bracketOf(data.items.rows[r.item].req)]++; c[7]++;
    }
    c.forEach((v, i) => { tot[i] += v; });
    out[p] = c;
  }
  out.All = tot;
  return out;
}

// cell(profession, index) renders one count; the "All" row is bold.
function professionGrid(cell) {
  return table(["Profession", ...BRACKET_HEAD, "Total"],
    [...PROFS, "All"].map((p) => (p === "All" ? ["**All**", ...[...Array(8).keys()].map((i) => `**${cell(p, i)}**`)] : [p, ...[...Array(8).keys()].map((i) => cell(p, i))])));
}

function professionTable(data) {
  const c = professionCounts(data);
  return professionGrid((p, i) => n(c[p][i]));
}

function tally(values) {
  const m = {};
  for (const v of values) m[v] = (m[v] || 0) + 1;
  return Object.keys(m).sort().map((k) => `${k} ${n(m[k])}`).join(", ");
}

function overview(data) {
  const items = Object.values(data.items.rows);
  const flags = items.flatMap((i) => i.flags || []);
  return [
    `- Origin: ${tally(items.map((i) => i.origin))}`,
    `- Bind: ${tally(items.map((i) => i.bind))}`,
    `- Availability: ${tally(items.map((i) => i.avail))}`,
    `- Flags: ${tally(flags) || "none"}`,
    `- Item class: ${tally(items.map((i) => i.itemClass))}; armor types: ${tally(items.filter((i) => i.itemClass === "armor").map((i) => i.type))}`,
    `- Weapon damage basis: ${tally(items.filter((i) => i.weapon).map((i) => i.weapon.basis))}`,
    `- Icons (community listfile): items ${n(items.filter((i) => i.icon).length)} of ${n(items.length)}, mats ${n(Object.values(data.mats.rows).filter((m) => m.icon).length)} of ${n(Object.keys(data.mats.rows).length)}`,
    `- Class-restricted items: ${n(items.filter((i) => i.classes).length)}; items with an equip skill: ${n(items.filter((i) => i.equipSkill).length)}; in item sets: ${n(items.filter((i) => i.set).length)} (${n(Object.keys(data.items.sets).length)} sets)`,
  ].join("\n");
}

// Gear recipes per required-level bracket: curated, derived with a known source, derived source unknown.
function sourceCounts(data) {
  const kinds = {}, byBracket = BRACKETS.map(() => ({ curated: 0, derivedKnown: 0, unknown: 0 }));
  for (const [spell, r] of Object.entries(data.recipes.rows)) {
    if (r.kind !== "gear") continue;
    const src = data.sources.rows[spell] || [];
    const curated = src.some((e) => e.certainty !== "db");
    for (const e of src) {
      const k = `${e.kind}${e.rep ? " (reputation)" : ""} · ${e.certainty}`;
      kinds[k] = (kinds[k] || 0) + 1;
    }
    const b = byBracket[bracketOf(data.items.rows[r.item].req)];
    if (curated) b.curated++;
    else if (src.every((e) => e.kind === "unknown")) b.unknown++;
    else b.derivedKnown++;
  }
  return { kinds, byBracket };
}

function sourceTables(data) {
  const { kinds, byBracket } = sourceCounts(data);
  const t1 = table(["Source entry (kind · certainty)", "Gear recipes"], Object.keys(kinds).sort().map((k) => [k, n(kinds[k])]));
  const t2 = table(["Required level", "Curated", "Derived: trainer or reputation", "Derived: source unknown"],
    BRACKETS.map((b, i) => [b[0] === b[1] ? `${b[0]}` : `${b[0]}–${b[1]}`, n(byBracket[i].curated), n(byBracket[i].derivedKnown), n(byBracket[i].unknown)]));
  const factions = table(["Faction", "Side (from Faction race masks)"], Object.entries(data.sources.factions).map(([id, f]) => [`${esc(f.name)} (${id})`, f.side]));
  return `${t1}\n\n${t2}\n\nReputation factions on patterns and curated sources:\n\n${factions}`;
}

function needsCheck(data, g) {
  const items = data.items.rows;
  const byName = (name) => Object.keys(items).filter((id) => items[id].name === name);
  const w = (id) => { const x = items[id].weapon; return `${x.min}–${x.max}, speed ${x.speed}, ${x.dps} DPS (basis ${x.basis})`; };
  const lines = [];
  // Weapon rules checked against in-game tooltips on 2026-10-08 (game-data-pipeline §6.3): [name, expected range].
  for (const [name, want] of [["Dreamstaff", "62–93"], ["Searing Golden Blade", "14–26"], ["Sageblade", "39–73"],
    ["Cracked Blacksmith Hammer", "15–29"], ["Satchel of Copper Bombs", "2–11"]]) {
    for (const id of byName(name)) {
      const x = items[id].weapon, ok = `${x.min}–${x.max}` === want;
      lines.push(`- [${ok ? "x" : " "}] **${name}** (${id}): ${w(id)}. ${ok ? "Matches" : `Differs from`} the in-game tooltip (${want}, checked 2026-10-08).`);
    }
  }
  const thrown = Object.keys(items).filter((id) => items[id].type === "Thrown");
  lines.push(`- Thrown weapons: ${thrown.map((id) => `${esc(items[id].name)} (${id}) ${items[id].weapon.dps} DPS, ${items[id].weapon.basis}`).join(", ")}.`);
  lines.push("- [ ] **Mail and plate at level 40** (S2): `curation/rules.json` gates Mail for Hunter and Shaman and Plate for Warrior and Paladin at 40, as in vanilla. Check a level-39 Hunter or Warrior, or the trainer.");
  const qm = Object.keys(items).filter((id) => (items[id].flags || []).includes("qualityModifier"));
  lines.push(`- [ ] **QualityModifier** set on ${qm.length} items; whether it scales armor is unverified: ${qm.map((id) => `${esc(items[id].name)} (${id}${items[id].armor ? `, armor ${items[id].armor}` : ""})`).join(", ")}.`);
  lines.push(`- Stat values that landed exactly on .5 before rounding (rounded away from zero): ${g.info.halves}.`);
  return lines.join("\n");
}

function statsSection(data) {
  const lines = [];
  for (const u of data.rules.statsUnidentified) {
    const ids = Object.keys(data.items.rows).filter((id) => data.items.rows[id].stats[u.key] !== undefined);
    lines.push(`- \`${u.key}\`: ${ids.map((id) => `${esc(data.items.rows[id].name)} (${id}) ${data.items.rows[id].stats[u.key]}`).join(", ")}. ${u.why}`);
  }
  const neg = Object.keys(data.items.rows).filter((id) => (data.items.rows[id].flags || []).includes("negativeStat"));
  if (neg.length) lines.push(`- Negative stat shares kept for review: ${neg.map((id) => `${esc(data.items.rows[id].name)} (${id}) ${JSON.stringify(data.items.rows[id].stats)}`).join(", ")}.`);
  return lines.join("\n");
}

// --- ranking review -------------------------------------------------------------------------------------------

function reviewEntry(r) {
  return { id: "review", cls: r.cls, role: r.role, level: 1, professions: r.professions.map((id) => ({ id, skill: null })), options: {} };
}

function marks(c) {
  const m = [];
  if (c.item.bind === "BoP") m.push("BoP");
  if (c.route.scarce) m.push(c.route.flags.find((f) => f.startsWith("needs ") && /Favor|reputation|drop/.test(f)));
  if (c.route.unconfirmed) m.push("unconfirmed");
  if (c.route.flags.includes("source unknown")) m.push("src?");
  return m.length ? ` _${m.join(", ")}_` : "";
}

function topPicks(data, r) {
  const entry = reviewEntry(r), roster = { faction: "alliance", includeAH: true, entries: [entry] };
  const cs = rank.candidates(data, roster, entry, {});
  const out = [];
  for (const group of data.rules.slotGroups) {
    const cells = BRACKETS.map(([lo, hi]) => {
      const list = [];
      for (const c of cs.list) {
        if (!group.slots.includes(c.item.slot)) continue;
        const place = c.places.main || c.places.ranged || c.places.slot || c.places.off;
        const from = place.from;
        if (from < (lo === 1 ? 0 : lo) || from > hi) continue;
        list.push({ c, s: place.score });
      }
      list.sort((a, b) => b.s - a.s || a.c.id - b.c.id);
      return list.slice(0, 3).map((x) => `${esc(x.c.item.name)} ${Math.max(1, x.c.item.req)} (${x.s.toFixed(1)})${marks(x.c)}`).join("<br>") || "–";
    });
    out.push([group.id, ...cells]);
  }
  return table(["Slot", ...BRACKETS.map(([a, b]) => (a === b ? `${a}` : `${a}–${b}`))], out);
}

function pathSummary(data, r) {
  const entry = reviewEntry(r), roster = { faction: "alliance", includeAH: true, entries: [entry] };
  const p = rank.path(data, roster, entry, {});
  const rows = p.groups.map((g) => {
    const steps = g.steps.map((s) => `${s.from}–${s.to} ${s.items.map((id) => esc(data.items.rows[id].name)).join(" + ")}${s.core ? " **core**" : ""}`).join("<br>") || "–";
    const alts = g.alternatives.map((a) => `${a.from}–${a.to} ${a.items.map((id) => esc(data.items.rows[id].name)).join(" + ")} (${a.why.join(", ")})`).join("<br>");
    return [g.id, steps, alts || ""];
  });
  return table(["Slot", "Path (levels, piece)", "Alternatives (D15, D19)"], rows);
}

// --- diff against a git tag -----------------------------------------------------------------------------------

// Baseline sections from a git tag (site/data/forever/<section>.js at the tag) or a directory of generated files.
const baselineDir = (ref) => (fs.existsSync(ref) && fs.statSync(ref).isDirectory() ? path.resolve(ref) : null);
// A directory is named by its last component only, so no local path lands in the report.
const baselineLabel = (ref) => (baselineDir(ref) ? `directory ${path.basename(baselineDir(ref))}` : ref);

function readBaseline(repo, ref, sections = ["meta", "items", "recipes", "mats", "sources"]) {
  const dir = baselineDir(ref);
  const read = (section) => {
    try {
      const text = dir ? fs.readFileSync(path.join(dir, `${section}.js`), "utf8")
        : execFileSync("git", ["show", `${ref}:site/data/forever/${section}.js`], { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "ignore"] });
      return emit.parse(text).value;
    } catch (e) { return null; }
  };
  const out = { label: baselineLabel(ref) };
  for (const s of sections) out[s] = read(s);
  return out;
}

const fmt = (v) => (v === undefined ? "–" : JSON.stringify(v));
const isMap = (v) => v && typeof v === "object" && !Array.isArray(v);

// Field-by-field differences; plain objects (stats, weapon, skill, pattern, set) one level deep.
function fieldDiff(a, b, prefix = "") {
  const out = [];
  for (const f of new Set([...Object.keys(a || {}), ...Object.keys(b || {})])) {
    const x = a ? a[f] : undefined, y = b ? b[f] : undefined;
    if (JSON.stringify(x) === JSON.stringify(y)) continue;
    if (!prefix && isMap(x) && isMap(y)) out.push(...fieldDiff(x, y, `${f}.`));
    else out.push(`${prefix}${f} ${fmt(x)} → ${fmt(y)}`);
  }
  return out;
}

// One source entry in a few words: kind, reputation or vendor, the unknown-source reason, certainty.
function srcLabel(e, factions) {
  const rep = e.rep ? ` ${(factions[e.rep.faction] || {}).name || `faction ${e.rep.faction}`}${e.rep.standing ? ` ${e.rep.standing}` : ""}` : "";
  const who = e.npc || e.where || e.quest || "";
  const why = e.kind === "unknown" && e.text ? ` (${e.text.split(/[:;]/)[0]})` : "";
  return `${e.kind}${rep}${who ? ` ${who}` : ""}${why} · ${e.certainty}`;
}
const srcLabels = (rows, spell, factions) => [...new Set((rows[spell] || []).map((e) => srcLabel(e, factions)))].join(" / ") || "no source";

const capped = (list, max = 400) => (list.length > max ? [...list.slice(0, max), `… ${n(list.length - max)} more`] : list);

// §14 step 3 items 2–6 against a baseline: removed, changed field by field, added by family with the derived
// source, counts old vs new, and new content (R1 items that gained an ItemSparse row, stub patterns that became real).
function diffAgainst(o, data) {
  const base = readBaseline(o.repo, o.diffAgainst);
  if (!base.items || !base.recipes) return `Baseline not readable: ${esc(base.label)} has no site/data/forever/items.js or recipes.js.`;
  const oldBuild = base.meta ? base.meta.build : "?";
  const A = { items: base.items.rows, recipes: base.recipes.rows, mats: (base.mats || { rows: {} }).rows, sources: (base.sources || { rows: {} }).rows };
  const B = { items: data.items.rows, recipes: data.recipes.rows, mats: data.mats.rows, sources: data.sources.rows };
  const factions = { ...((base.sources || {}).factions || {}), ...data.sources.factions };
  const nameOf = (rows, id) => (rows.items[id] || rows.mats[id] || {}).name || `item ${id}`;
  const recLabel = (rows, spell) => { const r = rows.recipes[spell]; return `${spell} ${esc(nameOf(rows, r.item))} (${r.prof}, ${r.kind})`; };
  const itLabel = (it, id) => `${esc(it.name)} (${id}, req ${it.req})`;
  const keys = {}, d = {};
  for (const s of ["items", "recipes", "mats"]) {
    const a = A[s], b = B[s];
    d[s] = { removed: Object.keys(a).filter((k) => !(k in b)), added: Object.keys(b).filter((k) => !(k in a)), changed: [] };
    for (const k of Object.keys(b)) {
      if (!(k in a)) continue;
      const f = fieldDiff(a[k], b[k]);
      if (s === "recipes") {
        const x = srcLabels(A.sources, k, factions), y = srcLabels(B.sources, k, factions);
        if (JSON.stringify(A.sources[k]) !== JSON.stringify(B.sources[k])) f.push(x === y ? `sources (details) ${x}` : `sources ${x} → ${y}`);
      }
      if (f.length) d[s].changed.push([k, f]);
    }
    keys[s] = Object.keys(b).length;
  }
  const out = [];
  out.push(`Baseline: ${esc(base.label)}, build ${oldBuild}${base.meta ? `, generated ${base.meta.generated}` : ""}.`);
  out.push("");

  // DB2 tables: compare the two hash manifests.
  const ma = db2.readManifest(db2.manifestPath(o.repo, oldBuild)), mb = db2.readManifest(db2.manifestPath(o.repo, data.meta.build));
  if (!ma.size || !mb.size) out.push(`- DB2 tables: no manifest for ${ma.size ? data.meta.build : oldBuild} in build-inputs/, not compared.`);
  else {
    const diffT = [...new Set([...ma.keys(), ...mb.keys()])].sort().filter((t) => ma.get(t) !== mb.get(t));
    out.push(diffT.length ? `- DB2 tables that differ from ${oldBuild}: ${diffT.join(", ")} (${mb.size - diffT.length} of ${mb.size} byte-identical).`
      : `- DB2 tables: all ${mb.size} byte-identical to ${oldBuild}; any change below comes from curation or the generator.`);
  }
  out.push("");
  out.push(table(["Section", `Baseline ${oldBuild}`, `This build ${data.meta.build}`, "Removed", "Added", "Changed"],
    ["items", "recipes", "mats"].map((s) => [s, n(Object.keys(A[s]).length), n(keys[s]), n(d[s].removed.length), n(d[s].added.length), n(d[s].changed.length)])));

  out.push("");
  out.push("### 8.1 Removed (each one breaks saved user state; the page reports them to users)");
  out.push("");
  const removed = [
    ...d.items.removed.map((k) => `- item ${itLabel(A.items[k], k)}`),
    ...d.recipes.removed.map((k) => `- recipe ${recLabel(A, k)}`),
    ...d.mats.removed.map((k) => `- mat ${esc(A.mats[k].name)} (${k})`),
  ];
  out.push(removed.join("\n") || "None.");

  out.push("");
  out.push("### 8.2 Changed, field by field");
  out.push("");
  const changed = [
    ...d.items.changed.map(([k, f]) => `- item ${itLabel(B.items[k], k)}: ${esc(f.join("; "))}`),
    ...d.recipes.changed.map(([k, f]) => `- recipe ${recLabel(B, k)}: ${esc(f.join("; "))}`),
    ...d.mats.changed.map(([k, f]) => `- mat ${esc(B.mats[k].name)} (${k}): ${esc(f.join("; "))}`),
  ];
  out.push(capped(changed).join("\n") || "None.");

  out.push("");
  out.push("### 8.3 Added, by profession and derived source");
  out.push("");
  const fam = new Map();
  const addTo = (key, line, sort) => { if (!fam.has(key)) fam.set(key, []); fam.get(key).push([sort, line]); };
  const addedItems = new Set(d.items.added);
  for (const k of d.items.added) {
    const it = B.items[k], first = B.recipes[it.recipes[0]];
    addTo(`${first ? first.prof : "?"} · ${srcLabels(B.sources, it.recipes[0], factions)}`,
      `${itLabel(it, k)}${it.origin !== "forever" ? ` ${it.origin}` : ""}${it.avail !== "ok" ? ` _${it.avail}_` : ""}`, [it.req, +k]);
  }
  for (const k of d.recipes.added) {
    const r = B.recipes[k];
    if (r.kind === "gear" && addedItems.has(String(r.item)) && B.items[r.item].recipes[0] === +k) continue;
    addTo(`${r.prof} · ${srcLabels(B.sources, k, factions)}`, `recipe ${recLabel(B, k)}`, [Infinity, +k]);
  }
  const famKeys = [...fam.keys()].sort();
  out.push(famKeys.map((key) => `- **${esc(key)}**: ${fam.get(key).sort((x, y) => x[0][0] - y[0][0] || x[0][1] - y[0][1]).map((x) => x[1]).join(", ")}`).join("\n") || "None.");
  if (d.mats.added.length) out.push(`- Mats: ${d.mats.added.map((k) => `${esc(B.mats[k].name)} (${k})`).join(", ")}`);

  out.push("");
  out.push(`### 8.4 Counts, baseline → this build`);
  out.push("");
  const oldData = { items: base.items, recipes: base.recipes, sources: base.sources || { rows: {} } };
  const pa = professionCounts(oldData), pb = professionCounts(data);
  const arrow = (x, y) => (x === y ? n(y) : `${n(x)} → ${n(y)}`);
  out.push("Gear recipes per profession and required-level bracket:");
  out.push("");
  out.push(professionGrid((p, i) => arrow(pa[p][i], pb[p][i])));
  out.push("");
  const sa = sourceCounts(oldData).byBracket, sb = sourceCounts(data).byBracket;
  out.push(table(["Required level", "Curated", "Derived: trainer or reputation", "Derived: source unknown"],
    BRACKETS.map((b, i) => [b[0] === b[1] ? `${b[0]}` : `${b[0]}–${b[1]}`, arrow(sa[i].curated, sb[i].curated), arrow(sa[i].derivedKnown, sb[i].derivedKnown), arrow(sa[i].unknown, sb[i].unknown)])));

  out.push("");
  out.push("### 8.5 New content (R1, R3)");
  out.push("");
  let r1;
  if (oldBuild === data.meta.build) r1 = `- R1: same build as the baseline, not checked.`;
  else {
    try {
      const sparse = new Set(db2.loadBuild({ repo: o.repo, cache: o.cache, build: oldBuild, tables: ["ItemSparse"], verify: o.verify !== false }).tables.ItemSparse.map((r) => r.ID));
      const gained = Object.keys(B.items).filter((k) => !sparse.has(k));
      r1 = `- Items without an ItemSparse row in ${oldBuild} that have one now (R1 becoming real): ${gained.map((k) => itLabel(B.items[k], k)).join(", ") || "none"}.`;
    } catch (e) {
      r1 = `- R1: not checked, the baseline build's ItemSparse is not readable (${esc(e.message.split(";")[0])}).`;
    }
  }
  out.push(r1);
  const stub = (r) => !!(r && r.pattern && r.pattern.stub);
  const both = Object.keys(B.recipes).filter((k) => k in A.recipes);
  const real = both.filter((k) => stub(A.recipes[k]) && B.recipes[k].pattern && !stub(B.recipes[k]));
  const lost = both.filter((k) => !stub(A.recipes[k]) && stub(B.recipes[k]));
  out.push(`- Stub patterns that became real (R3): ${real.map((k) => `${recLabel(B, k)} → ${esc(B.recipes[k].pattern.name)} (${B.recipes[k].pattern.id})`).join(", ") || "none"}.`);
  out.push(`- Real patterns that became stubs: ${lost.map((k) => recLabel(B, k)).join(", ") || "none"}.`);
  const avail = Object.keys(B.items).filter((k) => k in A.items && A.items[k].avail !== B.items[k].avail);
  out.push(`- Item availability changed: ${avail.map((k) => `${itLabel(B.items[k], k)} ${A.items[k].avail} → ${B.items[k].avail}`).join(", ") || "none"}.`);
  return out.join("\n");
}

function report(g, o) {
  const data = JSON.parse(JSON.stringify(g.sections));
  const meta = data.meta;
  const out = [];
  out.push(`# Build report ${meta.build}`);
  out.push("");
  out.push(`Dataset \`${meta.dataset}\` (${meta.product}, ${meta.status}), generated ${meta.generated} by ${meta.generator}, schema ${meta.schema}. ` +
    `Data hash \`${meta.dataHash.slice(0, 16)}\`. Inputs: \`${meta.inputs.db2.manifest}\`, reference build \`${meta.inputs.reference.manifest}\`, ` +
    `curation (${meta.inputs.curation.files.length} files, \`${meta.inputs.curation.sha256.slice(0, 16)}\`), listfile ${meta.inputs.listfile.tag} (\`${meta.inputs.listfile.sha256.slice(0, 16)}\`).`);
  out.push("");
  out.push(o && o.diffAgainst
    ? "Review order (game-data-pipeline §14 step 3): blocking issues (§1), the diff against the baseline (§8: removed, changed, added, counts, new content), then counts, the needs-in-game-check list and the ranking review per role."
    : "Review order: blocking issues, counts, the needs-in-game-check list, then the ranking review per role.");
  out.push("");
  out.push("## 1. Blocking");
  out.push("");
  out.push(g.blocking.length ? g.blocking.map((b) => `- ${esc(b)}`).join("\n") : "None.");
  out.push("");
  out.push("## 2. Counts");
  out.push("");
  out.push(funnel(g, meta.build, o && o.diffAgainst ? readBaseline(o.repo, o.diffAgainst, ["meta"]).meta : null));
  out.push("");
  out.push("Gear recipes per profession and required-level bracket (shipped rows, after the cosmetic drop):");
  out.push("");
  out.push(professionTable(data));
  out.push("");
  out.push(overview(data));
  out.push("");
  out.push("## 3. Needs in-game check");
  out.push("");
  out.push(needsCheck(data, g));
  out.push("");
  out.push("## 4. Unidentified stats (D16)");
  out.push("");
  out.push(statsSection(data));
  out.push("");
  out.push("## 5. Recipe sources");
  out.push("");
  out.push(sourceTables(data));
  out.push("");
  out.push("## 6. Warnings");
  out.push("");
  out.push(g.warnings.length ? g.warnings.map((w) => `- ${esc(w)}`).join("\n") : "None.");
  out.push("");
  out.push("## 7. Ranking review");
  out.push("");
  out.push("Run with `site/lib/rank.js` for an Alliance roster of one entry with the suggested professions " +
    "(roles-stat-weights §5.4), the AH included, no prices (every piece is spend tier \"mid\", D25) and no recipe marked learned. " +
    "Top picks: the three best-scoring candidates whose first usable level falls in the bracket (score in brackets; " +
    "BoP = own profession only, src? = source unknown). Path: the per-slot upgrade path of §6.4; scarce (Favor, reputation, " +
    "drop-only) and unconfirmed pieces appear only as alternatives.");
  for (const r of REVIEW) {
    out.push("");
    out.push(`### ${r.cls} ${r.role} (${r.professions.join(" + ")})`);
    out.push("");
    out.push(topPicks(data, r));
    out.push("");
    out.push(pathSummary(data, r));
  }
  if (o && o.diffAgainst) {
    out.push("");
    out.push(`## 8. Diff against ${baselineLabel(o.diffAgainst)}`);
    out.push("");
    out.push(diffAgainst(o, data));
  }
  out.push("");
  return out.join("\n");
}

module.exports = { report, REVIEW, BRACKETS };
