"use strict";
// Recipe records (data-model §5): profession, skill, mats, pattern. Sources are in sources.js (pipeline/sources.js).

const C = require("./constants");
const { choosePattern, spellOrigin, byId } = require("./enumerate");

function reagents(row) {
  const out = [];
  if (!row) return out;
  for (let k = 0; k < 8; k++) {
    const id = +row[`Reagent_${k}`], n = +row[`ReagentCount_${k}`];
    if (id > 0 && n > 0) out.push([id, n]);
  }
  return out;
}

// Skill (§7): learn = the pattern's RequiredSkillRank; trainer recipes (no pattern, or a stub) use the yellow rank
// with approx; AcquireMethod 1 means "learned with the profession" (learn 1).
function skill(row, pattern, sparse) {
  const yellow = +row.sla.TrivialSkillLineRankLow, grey = +row.sla.TrivialSkillLineRankHigh;
  if (pattern && pattern.chosen) return { learn: +sparse.get(pattern.chosen).RequiredSkillRank, approx: false, yellow, grey };
  if (+row.sla.AcquireMethod === 1) return { learn: 1, approx: false, yellow, grey };
  return { learn: yellow, approx: true, yellow, grey };
}

function patternRecord(p, sparse, spellName) {
  if (!p) return null;
  if (!p.chosen) return { id: p.stub, name: null, bind: null, rep: null, spec: null, stub: true };
  const s = sparse.get(p.chosen);
  const rep = +s.MinFactionID > 0 ? { faction: +s.MinFactionID, standing: C.STANDING[+s.MinReputation] || null } : null;
  const ab = +s.RequiredAbility;
  const spec = ab > 0 ? (spellName.get(ab) ? spellName.get(ab).Name_lang : `Spell ${ab}`) : null;
  return { id: p.chosen, name: s.Display_lang, bind: C.BIND[+s.Bonding] || `Bind${s.Bonding}`, rep, spec };
}

// rows: craft rows to ship; kind per row via kindOf(row). Returns {rows: {spell: record}, patterns: {spell: choice}}.
function buildRecipes(rows, kindOf, ctx) {
  const { en, T, eraSpells, profName } = ctx;
  const reag = byId(T.SpellReagents, "SpellID");
  const spellName = byId(T.SpellName);
  const out = new Map(), choice = new Map(), collisions = [];
  for (const r of rows) {
    if (out.has(r.spell)) { if (out.get(r.spell).item !== r.item) collisions.push(r.spell); continue; }
    const p = choosePattern(r.spell, en.patterns, en.sparse);
    choice.set(r.spell, p);
    out.set(r.spell, {
      kind: kindOf(r),
      item: r.item, out: r.out,
      prof: profName(r.line),
      skill: skill(r, p, en.sparse),
      mats: reagents(reag.get(r.spell)),
      pattern: patternRecord(p, en.sparse, spellName),
      origin: spellOrigin(r.spell, eraSpells),
    });
  }
  return { rows: out, choice, collisions };
}

module.exports = { buildRecipes, reagents };
