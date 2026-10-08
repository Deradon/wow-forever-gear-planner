"use strict";
// Enumeration of craftable equipment (game-data-pipeline §3) and the generic leftover rules (§5).

const C = require("./constants");

function byId(rows, key = "ID") {
  const m = new Map();
  for (const r of rows) m.set(+r[key], r);
  return m;
}

// Child skill lines (2937–2948) map to their parent; the test lines 2933/2934 fall outside the whitelist.
function lineMap(skillLine) {
  const parent = new Map();
  for (const r of skillLine) parent.set(+r.ID, +r.ParentSkillLineID);
  return (id) => (parent.get(id) > 0 ? parent.get(id) : id);
}

function enumerate(T, era) {
  const top = lineMap(T.SkillLine);
  const item = byId(T.Item), sparse = byId(T.ItemSparse), eraItem = byId(era.Item);
  const lines = new Set([...C.GEAR_LINES, ...C.HELPER_LINES]);

  // Craft rows: every SkillLineAbility row of a profession line × every effect-24 effect of its spell.
  const create = new Map();
  for (const e of T.SpellEffect) {
    if (+e.Effect !== 24) continue;
    const s = +e.SpellID;
    if (!create.has(s)) create.set(s, []);
    create.get(s).push(e);
  }
  const craft = [];
  for (const a of T.SkillLineAbility) {
    const line = top(+a.SkillLine);
    if (!lines.has(line)) continue;
    for (const e of create.get(+a.Spell) || []) {
      craft.push({ spell: +a.Spell, item: +e.EffectItemType, out: Math.max(1, Math.round(+e.EffectBasePointsF)), line, sla: a });
    }
  }
  craft.sort((a, b) => a.spell - b.spell || a.item - b.item);

  const funnel = { craftRows: craft.length };
  const isGear = (r) => C.GEAR_LINES.includes(r.line);
  const equip = craft.filter((r) => {
    if (!isGear(r)) return false;
    const it = item.get(r.item);
    return it && (+it.ClassID === 2 || +it.ClassID === 4) && C.EQUIP_INV.has(+it.InventoryType);
  });
  funnel.equippable = equip.length;
  funnel.equippableItems = new Set(equip.map((r) => r.item)).size;
  const noSparse = equip.filter((r) => !sparse.has(r.item));
  funnel.noSparse = noSparse.length;
  const inGame = equip.filter((r) => sparse.has(r.item) && +sparse.get(r.item).RequiredLevel <= 60);
  funnel.inGame = inGame.length;
  funnel.inGameItems = new Set(inGame.map((r) => r.item)).size;
  const cosmetic = inGame.filter((r) => +item.get(r.item).ClassID === 4 && +item.get(r.item).SubclassID === 5);
  const gear = inGame.filter((r) => !cosmetic.includes(r));
  funnel.cosmeticItems = new Set(cosmetic.map((r) => r.item)).size;
  funnel.items = new Set(gear.map((r) => r.item)).size;
  funnel.gearRecipes = gear.length;

  // R1 rows by origin, for the report (items the diff should watch).
  const r1 = { vanilla: 0, sod: 0, forever: 0 };
  for (const r of noSparse) r1[itemOrigin(r.item, eraItem)]++;
  funnel.noSparseByOrigin = r1;

  // Pattern links: ItemEffect trigger 6 on a recipe item (ClassID 9), via ItemXItemEffect.
  const effect = byId(T.ItemEffect);
  const patterns = new Map();
  for (const x of T.ItemXItemEffect) {
    const e = effect.get(+x.ItemEffectID);
    if (!e || +e.TriggerType !== 6) continue;
    const it = item.get(+x.ItemID);
    if (!it || +it.ClassID !== 9) continue;
    const s = +e.SpellID;
    if (!patterns.has(s)) patterns.set(s, new Set());
    patterns.get(s).add(+x.ItemID);
  }

  // Makers of every item, from all profession lines (intermediates resolve through Mining, Cooking, First Aid).
  const makes = new Map();
  for (const r of craft) {
    if (!makes.has(r.item)) makes.set(r.item, []);
    makes.get(r.item).push(r);
  }

  return { top, item, sparse, eraItem, craft, gear, cosmetic, noSparse, funnel, patterns, makes };
}

// Pattern choice (§3 step 7): linked recipe items with an ItemSparse row, without " OLD" names, IDs outside the
// SoD range first, then the lowest ID. Returns {chosen, live, stub} where stub is the lowest linked ID when no
// linked pattern is live.
function choosePattern(spell, patterns, sparse) {
  const ids = [...(patterns.get(spell) || [])].sort((a, b) => a - b);
  if (!ids.length) return null;
  const live = ids.filter((i) => sparse.has(i) && !/ OLD$/.test(sparse.get(i).Display_lang));
  const sod = (i) => (i >= C.SOD_ITEM[0] && i <= C.SOD_ITEM[1] ? 1 : 0);
  live.sort((a, b) => sod(a) - sod(b) || a - b);
  return { chosen: live[0] || null, live, stub: live.length ? null : ids[0], linked: ids };
}

function itemOrigin(id, eraItem) {
  if (!eraItem.has(id)) return "forever";
  return id >= C.SOD_ITEM[0] && id <= C.SOD_ITEM[1] ? "sod" : "vanilla";
}

function spellOrigin(id, eraSpells) {
  if (!eraSpells.has(id)) return "forever";
  return id >= C.SOD_SPELL[0] && id <= C.SOD_SPELL[1] ? "sod" : "vanilla";
}

module.exports = { enumerate, choosePattern, itemOrigin, spellOrigin, byId };
