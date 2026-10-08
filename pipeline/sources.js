"use strict";
// Recipe sources (data-model §7, game-data-pipeline §9): derived from DB2, merged with curation/sources.json.

const C = require("./constants");
const { byId } = require("./enumerate");

const TRADEABLE = "Tradeable pattern: world drop or vendor; can also come from the AH";
const BOP_PATTERN = "BoP pattern: Favor, vendor, quest or dungeon drop";
const STUB = "The pattern item is not in this build's game data";

// Playable races and their side, from CharBaseInfo (race × class pairs) and ChrRaces.Alliance.
function playableRaces(T) {
  const races = byId(T.ChrRaces);
  const ids = [...new Set(T.CharBaseInfo.map((r) => +r.RaceID))].sort((a, b) => a - b);
  return ids.filter((id) => races.has(id)).map((id) => {
    const r = races.get(id);
    return { id, name: r.Name_lang, side: +r.Alliance === 0 ? "alliance" : "horde", bit: +r.PlayableRaceBit };
  });
}

// A faction's side: the playable races that can earn it (first race-mask slot naming the race, base above Hated).
function factionSide(f, races) {
  const can = [];
  for (const race of races) {
    let base = null;
    for (let k = 0; k < 4; k++) {
      const lo = +f[`ReputationRaceMasks${k}_0`] >>> 0, hi = +f[`ReputationRaceMasks${k}_1`] >>> 0;
      const hit = race.bit < 32 ? (lo >>> race.bit) & 1 : (hi >>> (race.bit - 32)) & 1;
      if (hit) { base = +f[`ReputationBase_${k}`]; break; }
    }
    if (base !== null && base > -42000) can.push(race.side);
  }
  const a = can.includes("alliance"), h = can.includes("horde");
  return a && h ? "both" : a ? "alliance" : h ? "horde" : "both";
}

function factions(T, ids) {
  const fac = byId(T.Faction), races = playableRaces(T);
  const out = {};
  for (const id of [...ids].sort((a, b) => a - b)) {
    const f = fac.get(id);
    out[id] = f ? { name: f.Name_lang, side: factionSide(f, races) } : { name: null, side: "both" };
  }
  return out;
}

// Derived source entries for one recipe. `pattern` is the choice from enumerate.choosePattern.
function derive(row, pattern, itemOrigin, sparse, factionOf) {
  if (+row.sla.AcquireMethod === 1) return [{ kind: "trainer", side: "both", certainty: "db", note: "Learned with the profession" }];
  if (!pattern) return [{ kind: "trainer", side: "both", certainty: "db" }];
  if (!pattern.chosen) {
    if (itemOrigin === "forever") return [{ kind: "trainer", side: "both", certainty: "db", note: "Pattern item not in the game data; Forever trainer recipe" }];
    return [{ kind: "unknown", text: STUB, side: "both", certainty: "db" }];
  }
  const out = [], seen = new Set();
  const ordered = [pattern.chosen, ...pattern.live.filter((p) => p !== pattern.chosen)];
  for (const pid of ordered) {
    const s = sparse.get(pid);
    let e;
    if (+s.MinFactionID > 0) {
      const rep = { faction: +s.MinFactionID, standing: C.STANDING[+s.MinReputation] || null };
      e = { kind: "vendor", rep, side: factionOf(rep.faction), certainty: "db" };
    } else if (+s.Bonding === 1) e = { kind: "unknown", text: BOP_PATTERN, side: "both", certainty: "db" };
    else e = { kind: "unknown", text: TRADEABLE, side: "both", certainty: "db" };
    const key = JSON.stringify(e);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...e, pattern: pid });
  }
  return out;
}

// Merge curated families: a family's entries replace the derived ones for every recipe of its items. Family-level
// cite and checked fill entries that carry none.
function merge(derived, items, families) {
  const out = new Map(derived);
  const curatedRecipes = new Set();
  for (const fam of families) {
    const entries = fam.sources.map((e) => {
      const x = { ...e };
      if (!x.cite && fam.cite) x.cite = fam.cite;
      if (!x.checked && fam.checked) x.checked = fam.checked;
      return x;
    });
    for (const id of fam.items) {
      const it = items.get(id);
      if (!it) continue;
      for (const spell of it.recipes) { out.set(spell, entries); curatedRecipes.add(spell); }
    }
  }
  return { rows: out, curatedRecipes };
}

module.exports = { derive, merge, factions, playableRaces, factionSide, TRADEABLE, BOP_PATTERN, STUB };
