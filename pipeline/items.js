"use strict";
// Item records: stats, armor, weapon damage (game-data-pipeline §6), class limits, equip skill, effects, sets.

const C = require("./constants");
const { byId } = require("./enumerate");

const round2 = (x) => Math.round(x * 100 + 1e-9) / 100;
// Halves round away from zero, as the game's integer conversion does; the budget products are floats, so an
// exact .5 is rare (the report counts them).
function roundHalf(x, tally) {
  const r = Math.round(Math.abs(x)) * Math.sign(x);
  if (tally && Math.abs(Math.abs(x) % 1 - 0.5) < 1e-9) tally.halves++;
  return r === 0 ? 0 : r;
}

function tables(T) {
  const key = (rows, col) => byId(rows, col);
  return {
    rpp: byId(T.RandPropPoints),
    armorTotal: key(T.ItemArmorTotal, "ItemLevel"),
    armorQuality: byId(T.ItemArmorQuality),
    armorShield: key(T.ItemArmorShield, "ItemLevel"),
    armorLocation: byId(T.ArmorLocation),
    dmg: { one: key(T.ItemDamageOneHand, "ItemLevel"), two: key(T.ItemDamageTwoHand, "ItemLevel"), wand: key(T.ItemDamageWand, "ItemLevel") },
    effect: byId(T.ItemEffect),
    spellName: byId(T.SpellName),
    itemSet: byId(T.ItemSet),
  };
}

// Stats from the budget formula: round(RandPropPoints[ilvl][<quality>F_<slot>] × share / 10000).
function stats(s, inv, tb, tally) {
  const out = {}, ids = [];
  const q = +s.OverallQualityID, col = C.BUDGET_COL[q];
  const row = tb.rpp.get(+s.ItemLevel);
  for (let k = 0; k < 10; k++) {
    const id = +s[`StatModifier_bonusStat_${k}`], pct = +s[`StatPercentEditor_${k}`];
    if (id < 0 || pct === 0) continue;
    ids.push({ id, pct });
    if (!col || !row) continue;
    const v = roundHalf(+row[`${col}_${C.SLOTIDX[inv]}`] * pct / 10000, tally);
    if (v === 0) continue;
    const key = C.statKey(id);
    out[key] = (out[key] || 0) + v;
  }
  return { stats: out, ids };
}

// Armor: round(ItemArmorTotal[ilvl][type] × ArmorLocation[inv][type] × ItemArmorQuality[ilvl][quality]); robes count
// as chest; shields from ItemArmorShield.
function armor(type, inv, s, tb) {
  const ilvl = +s.ItemLevel, q = +s.OverallQualityID;
  if (type === "Shield") {
    const r = tb.armorShield.get(ilvl);
    return r ? roundHalf(+r[`Quality_${q}`]) : null;
  }
  const cols = C.ARMOR_COL[type];
  if (!cols) return null;
  const tot = tb.armorTotal.get(ilvl), loc = tb.armorLocation.get(inv === 20 ? 5 : inv), qual = tb.armorQuality.get(ilvl);
  if (!tot || !loc || !qual) return null;
  return roundHalf(+tot[cols[0]] * +loc[cols[1]] * +qual[`Qualitymod_${q}`]);
}

// Weapon damage (D14): table DPS by item level and quality; caster weapons (Flags_4 & 0x100) × 0.743; bows, guns,
// crossbows and thrown from the TwoHand table × 0.6; wands from the wand table. Displayed range from DPS, speed
// and DmgVariance; DPS reported as (min + max) / 2 / speed, as the game does.
function weapon(type, inv, s, tb) {
  const ilvl = +s.ItemLevel, q = +s.OverallQualityID;
  const speed = +s.ItemDelay / 1000;
  if (!speed) return null;
  let table = inv === 17 ? tb.dmg.two : tb.dmg.one, factor = 1, basis = "tables";
  if (type === "Wand") table = tb.dmg.wand;
  else if (["Bow", "Gun", "Crossbow", "Thrown"].includes(type)) { table = tb.dmg.two; factor = C.RANGED_FACTOR; basis = "ranged"; }
  else if (+s.Flags_4 & C.CASTER_FLAG) { factor = C.CASTER_FACTOR; basis = "caster"; }
  const row = table.get(ilvl);
  if (!row) return null;
  const dps = +row[`Quality_${q}`] * factor, v = +s.DmgVariance;
  const avg = dps * speed;
  const min = Math.floor(avg * (1 - v / 2) + 1e-9), max = Math.floor(avg * (1 + v / 2) + 0.5 + 1e-9);
  return { speed: round2(speed), min, max, dps: round2((min + max) / 2 / speed), basis };
}

function effects(itemId, effectLinks, tb) {
  const out = [];
  for (const effId of effectLinks.get(itemId) || []) {
    const e = tb.effect.get(effId);
    if (!e) continue;
    const on = C.EFFECT_TRIGGER[+e.TriggerType];
    if (!on || +e.SpellID <= 0) continue;
    const sn = tb.spellName.get(+e.SpellID);
    out.push({ on, spell: +e.SpellID, text: sn ? sn.Name_lang : `Spell ${e.SpellID}` });
  }
  const order = { use: 0, equip: 1, hit: 2 };
  out.sort((a, b) => order[a.on] - order[b.on] || a.spell - b.spell);
  return out;
}

// Build one item record (key order is the emitted order; optional fields are left out when empty).
function buildItem(id, ctx) {
  const { en, tb, classes, profName, effectLinks, tally } = ctx;
  const it = en.item.get(id), s = en.sparse.get(id);
  const inv = +it.InventoryType;
  const itemClass = C.ITEM_CLASS[+it.ClassID];
  const type = itemClass === "armor" ? C.ARMOR[+it.SubclassID] : C.WEAPON[+it.SubclassID];
  const st = stats(s, inv, tb, tally);
  const rec = {
    name: s.Display_lang,
    quality: +s.OverallQualityID, ilvl: +s.ItemLevel, req: +s.RequiredLevel,
    inv, slot: C.SLOT[inv], itemClass, type: type || `Subclass${it.SubclassID}`,
    bind: C.BIND[+s.Bonding] || `Bind${s.Bonding}`,
  };
  if (itemClass === "armor") {
    const a = armor(type, inv, s, tb);
    if (a) rec.armor = a;
  }
  rec.stats = st.stats;
  if (itemClass === "weapon") {
    const w = weapon(type, inv, s, tb);
    if (w) rec.weapon = w;
  }
  const mask = +s.AllowableClass;
  if (mask > 0 && (mask & classes.all) !== classes.all) {
    const names = classes.list.filter((c) => mask & c.bit).map((c) => c.name);
    if (names.length) rec.classes = names;
  }
  if (+s.RequiredSkill > 0) rec.equipSkill = { prof: profName(+s.RequiredSkill), rank: +s.RequiredSkillRank };
  const eff = effects(id, effectLinks, tb);
  if (eff.length) rec.effects = eff;
  if (+s.ItemSet > 0) {
    const set = tb.itemSet.get(+s.ItemSet);
    rec.set = { id: +s.ItemSet, name: set ? set.Name_lang : null };
  }
  return { rec, statIds: st.ids, qualityModifier: +s.QualityModifier, flags4: +s.Flags_4 };
}

function buildSets(itemIds, T, tb) {
  const used = new Map();
  for (const id of itemIds) {
    const set = tb.itemSet.get(id);
    if (set) used.set(id, set);
  }
  const bonuses = new Map();
  for (const r of T.ItemSetSpell) {
    const sid = +r.ItemSetID;
    if (!used.has(sid)) continue;
    if (!bonuses.has(sid)) bonuses.set(sid, []);
    const sn = tb.spellName.get(+r.SpellID);
    bonuses.get(sid).push({ pieces: +r.Threshold, spell: +r.SpellID, text: sn ? sn.Name_lang : `Spell ${r.SpellID}` });
  }
  const out = {};
  for (const sid of [...used.keys()].sort((a, b) => a - b)) {
    const set = used.get(sid);
    const items = [];
    for (let k = 0; k < 17; k++) if (+set[`ItemID_${k}`] > 0) items.push(+set[`ItemID_${k}`]);
    const b = (bonuses.get(sid) || []).sort((x, y) => x.pieces - y.pieces || x.spell - y.spell);
    out[sid] = { name: set.Name_lang, items: items.sort((a, b2) => a - b2), bonuses: b };
  }
  return out;
}

module.exports = { tables, stats, armor, weapon, effects, buildItem, buildSets, round2, roundHalf };
