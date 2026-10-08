"use strict";
// Build report reports/<build>.md (game-data-pipeline §14 step 3, roadmap M1): the maintainer's review surface.
// Deterministic: everything comes from the generated sections; the ranking is site/lib/rank.js, as on the page.

const { execFileSync } = require("child_process");
const emit = require("./emit");
const rank = require("../site/lib/rank");

// Planning measurements for build 1.60.1.70205 (game-data-pipeline §4), shown next to the computed counts.
const MEASURED = {
  "1.60.1.70205": { craftRows: 2303, equippable: 1567, noSparse: 286, inGame: 1281, items: 1274, mats: 356, intermediates: 131, specGated: 86 },
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

function funnel(g, build) {
  const f = g.info.funnel, c = g.sections.meta.counts, m = MEASURED[build] || {};
  const row = (label, v, key) => [label, n(v), m[key] === undefined ? "–" : n(m[key]) + (m[key] === v ? " ✓" : " ✗")];
  return table(["Step", "This build", "Planning measurement"], [
    row("Craft rows (profession spells with effect 24)", f.craftRows, "craftRows"),
    row("Equippable results (rows)", f.equippable, "equippable"),
    [`… without an ItemSparse row (R1: ${f.noSparseByOrigin.sod} SoD, ${f.noSparseByOrigin.forever} Forever-new, ${f.noSparseByOrigin.vanilla} vanilla)`, n(f.noSparse), m.noSparse === undefined ? "–" : n(m.noSparse) + (m.noSparse === f.noSparse ? " ✓" : " ✗")],
    row("In the game, required level ≤ 60 (rows)", f.inGame, "inGame"),
    ["Cosmetic items dropped (R2)", n(f.cosmeticItems), "5"],
    row("**Items shipped**", c.items, "items"),
    ["Gear recipes shipped", n(c.gearRecipes), "–"],
    ["Intermediate recipes shipped", n(c.intermediateRecipes), "–"],
    row("Mats (incl. intermediates' reagents)", c.mats, "mats"),
    row("Intermediates (mats with a recipe)", c.intermediates, "intermediates"),
    row("Gear recipes that need a specialisation", c.specGated, "specGated"),
    ["Gear recipes with curated sources", n(c.curatedRecipes), "–"],
    ["Faction mirror pairs (D17)", n(c.mirrorPairs), "–"],
  ]);
}

function professionTable(data) {
  const profs = ["Blacksmithing", "Leatherworking", "Tailoring", "Engineering", "Enchanting", "Alchemy"];
  const head = ["Profession", "0–9", "10–19", "20–29", "30–39", "40–49", "50–59", "60", "Total"];
  const rows = [], tot = new Array(8).fill(0);
  for (const p of profs) {
    const c = new Array(8).fill(0);
    for (const r of Object.values(data.recipes.rows)) {
      if (r.kind !== "gear" || r.prof !== p) continue;
      const req = data.items.rows[r.item].req;
      const b = req >= 60 ? 6 : Math.floor(req / 10);
      c[b]++; c[7]++;
    }
    c.forEach((v, i) => { tot[i] += v; });
    rows.push([p, ...c.map(n)]);
  }
  rows.push(["**All**", ...tot.map((v) => `**${n(v)}**`)]);
  return table(head, rows);
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
    `- Class-restricted items: ${n(items.filter((i) => i.classes).length)}; items with an equip skill: ${n(items.filter((i) => i.equipSkill).length)}; in item sets: ${n(items.filter((i) => i.set).length)} (${n(Object.keys(data.items.sets).length)} sets)`,
  ].join("\n");
}

function sourceTables(data) {
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

function diffAgainst(repo, tag, data) {
  const read = (section) => {
    try {
      return emit.parse(execFileSync("git", ["show", `${tag}:site/data/forever/${section}.js`], { cwd: repo, encoding: "utf8", maxBuffer: 64 << 20 })).value;
    } catch (e) { return null; }
  };
  const lines = [];
  for (const section of ["items", "recipes"]) {
    const old = read(section);
    if (!old) { lines.push(`- ${section}: not found at ${tag}`); continue; }
    const a = old.rows, b = data[section].rows;
    const removed = Object.keys(a).filter((k) => !(k in b)), added = Object.keys(b).filter((k) => !(k in a));
    const changed = [];
    for (const k of Object.keys(b)) {
      if (!(k in a)) continue;
      const fields = [...new Set([...Object.keys(a[k]), ...Object.keys(b[k])])].filter((f) => JSON.stringify(a[k][f]) !== JSON.stringify(b[k][f]));
      if (fields.length) changed.push(`${k}: ${fields.map((f) => `${f} ${JSON.stringify(a[k][f])} → ${JSON.stringify(b[k][f])}`).join("; ")}`);
    }
    lines.push(`- ${section}: ${removed.length} removed, ${added.length} added, ${changed.length} changed`);
    for (const k of removed) lines.push(`  - removed ${k}${a[k].name ? ` ${esc(a[k].name)}` : ""}`);
    for (const k of added) lines.push(`  - added ${k}${b[k].name ? ` ${esc(b[k].name)}` : ""}`);
    for (const c of changed.slice(0, 400)) lines.push(`  - ${esc(c)}`);
  }
  return lines.join("\n");
}

function report(g, o) {
  const data = JSON.parse(JSON.stringify(g.sections));
  const meta = data.meta;
  const out = [];
  out.push(`# Build report ${meta.build}`);
  out.push("");
  out.push(`Dataset \`${meta.dataset}\` (${meta.product}, ${meta.status}), generated ${meta.generated} by ${meta.generator}, schema ${meta.schema}. ` +
    `Data hash \`${meta.dataHash.slice(0, 16)}\`. Inputs: \`${meta.inputs.db2.manifest}\`, reference build \`${meta.inputs.reference.manifest}\`, ` +
    `curation (${meta.inputs.curation.files.length} files, \`${meta.inputs.curation.sha256.slice(0, 16)}\`).`);
  out.push("");
  out.push("Review order: blocking issues, counts, the needs-in-game-check list, then the ranking review per role.");
  out.push("");
  out.push("## 1. Blocking");
  out.push("");
  out.push(g.blocking.length ? g.blocking.map((b) => `- ${esc(b)}`).join("\n") : "None.");
  out.push("");
  out.push("## 2. Counts");
  out.push("");
  out.push(funnel(g, meta.build));
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
    out.push(`## 8. Diff against ${o.diffAgainst}`);
    out.push("");
    out.push(diffAgainst(o.repo, o.diffAgainst, data));
  }
  out.push("");
  return out.join("\n");
}

module.exports = { report, REVIEW, BRACKETS };
