"use strict";
// Game constants for build 1.60.1.x (WoW: Forever). Display labels live in curation/rules.json.

// ItemSparse StatModifier_bonusStat_N → stat key (roles-stat-weights §4.1, data-model §9.3).
const STAT = {
  3: "Agi", 4: "Str", 5: "Int", 6: "Spi", 7: "Sta",
  12: "Def", 13: "Dodge", 14: "Parry", 15: "Block",
  31: "Hit", 32: "Crit", 36: "Haste", 37: "Expertise",
  38: "AP", 39: "RAP", 41: "Heal", 42: "SpellDmg", 43: "MP5", 45: "SP", 46: "HP5", 47: "SpellPen", 48: "BlockValue",
  50: "Armor",
  51: "FireRes", 52: "FrostRes", 53: "HolyRes", 54: "ShadowRes", 55: "NatureRes", 56: "ArcaneRes",
  84: "HolyDmg", 85: "FireDmg", 86: "NatureDmg", 87: "FrostDmg", 88: "ShadowDmg", 89: "ArcaneDmg",
};
// Stat IDs that occur but are not identified; they ship as Stat<ID> (D16). Any other unknown ID blocks the build.
// The list itself is curated in curation/rules.json (statsUnidentified); this is only the key format.
const statKey = (id) => STAT[id] || `Stat${id}`;

// RandPropPoints column index per InventoryType (stat budget slot group).
const SLOTIDX = {
  1: 0, 4: 0, 5: 0, 7: 0, 17: 0, 20: 0,
  3: 1, 6: 1, 8: 1, 10: 1, 12: 1,
  2: 2, 9: 2, 11: 2, 14: 2, 16: 2, 23: 2,
  13: 3, 21: 3, 22: 3,
  15: 4, 25: 4, 26: 4, 28: 4,
};
const BUDGET_COL = { 2: "GoodF", 3: "SuperiorF", 4: "EpicF" };

// Equippable inventory types (game-data-pipeline §3 step 3): no shirts (4), tabards (19), bags (18), ammo (24).
const EQUIP_INV = new Set([1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 20, 21, 22, 23, 25, 26, 28]);

// InventoryType → planner slot name (as shipped in items.js `slot`).
const SLOT = {
  1: "Head", 2: "Neck", 3: "Shoulder", 5: "Chest", 6: "Waist", 7: "Legs", 8: "Feet", 9: "Wrist", 10: "Hands",
  11: "Finger", 12: "Trinket", 13: "One-Hand", 14: "Off-hand", 15: "Ranged", 16: "Back", 17: "Two-Hand",
  20: "Chest", 21: "Main Hand", 22: "Off-hand", 23: "Off-hand", 25: "Ranged", 26: "Ranged", 28: "Relic",
};

const ITEM_CLASS = { 2: "weapon", 4: "armor" };
// Armor subclass → type. 5 (cosmetic) is dropped by the enumeration.
const ARMOR = { 0: "Misc", 1: "Cloth", 2: "Leather", 3: "Mail", 4: "Plate", 5: "Cosmetic", 6: "Shield", 7: "Libram", 8: "Idol", 9: "Totem" };
// Weapon subclass → type.
const WEAPON = {
  0: "Axe", 1: "2H Axe", 2: "Bow", 3: "Gun", 4: "Mace", 5: "2H Mace", 6: "Polearm", 7: "Sword", 8: "2H Sword",
  10: "Staff", 13: "Fist", 14: "Misc", 15: "Dagger", 16: "Thrown", 18: "Crossbow", 19: "Wand", 20: "Fishing Pole",
};
// Armor type → ItemArmorTotal column and ArmorLocation column.
const ARMOR_COL = { Cloth: ["Cloth", "Clothmodifier"], Leather: ["Leather", "Leathermodifier"], Mail: ["Mail", "Chainmodifier"], Plate: ["Plate", "Platemodifier"] };

const BIND = { 0: "none", 1: "BoP", 2: "BoE", 3: "BoU", 4: "Quest" };
const QUALITY = { 0: "Poor", 1: "Common", 2: "Uncommon", 3: "Rare", 4: "Epic", 5: "Legendary" };
const STANDING = { 0: "Hated", 1: "Hostile", 2: "Unfriendly", 3: "Neutral", 4: "Friendly", 5: "Honored", 6: "Revered", 7: "Exalted" };
const EFFECT_TRIGGER = { 0: "use", 1: "equip", 2: "hit" };

// Professions. Gear professions make equipment; helper lines only resolve intermediates (§3 step 1).
const PROFESSIONS = {
  164: "Blacksmithing", 165: "Leatherworking", 197: "Tailoring", 202: "Engineering", 333: "Enchanting", 171: "Alchemy",
  186: "Mining", 185: "Cooking", 129: "First Aid", 182: "Herbalism", 393: "Skinning",
};
const GEAR_LINES = [164, 165, 197, 202, 333, 171];
const HELPER_LINES = [186, 185, 129];

// Weapon damage rules (D14, game-data-pipeline §6.3).
const CASTER_FLAG = 0x100;          // ItemSparse.Flags_4: caster weapon
const CASTER_FACTOR = 0.743;        // two-hand caster weapons deal ~26% less than the tables
const CASTER_FACTOR_ONE_HAND = 2 / 3; // one-hand caster weapons (in-game tooltips, 2026-10-08)
const RANGED_FACTOR = 0.6;          // bows, guns, crossbows: TwoHand table × 0.6
const THROWN_FACTOR = 0.9;          // thrown: OneHand table × 0.9 (in-game tooltips, 2026-10-08)

// ID ranges for origin and leftover rules (§5 R4, R4e).
const SOD_ITEM = [190000, 244999];
const FOREVER_ITEM_MIN = 245000;
const SOD_SPELL = [400000, 1239999];

const SCHEMA = 1;
const GENERATOR = "fgp-pipeline 0.1.0";

module.exports = {
  STAT, statKey, SLOTIDX, BUDGET_COL, EQUIP_INV, SLOT, ITEM_CLASS, ARMOR, WEAPON, ARMOR_COL, BIND, QUALITY, STANDING,
  EFFECT_TRIGGER, PROFESSIONS, GEAR_LINES, HELPER_LINES, CASTER_FLAG, CASTER_FACTOR, CASTER_FACTOR_ONE_HAND, RANGED_FACTOR, THROWN_FACTOR, SOD_ITEM,
  FOREVER_ITEM_MIN, SOD_SPELL, SCHEMA, GENERATOR,
};
