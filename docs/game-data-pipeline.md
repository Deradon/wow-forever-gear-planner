# Game-data pipeline

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: game-data engineer. Companion document: `data-model.md` (the shapes this pipeline emits). Status: draft for
synthesis.

Every number below was measured with read-only queries over the DB2 CSVs of Forever beta build **1.60.1.70205**
(wago.tools exports, cached by the prototype) and, for origin checks, the Classic Era/SoD build 1.15.9.70003. Tooltip
cross-checks use the prototype's cache of 296 Wowhead Forever tooltips. "The prototype's generator" is the Python
script that writes the prototype's data file; function names refer to it.

## 1. Overview

```
wago.tools DB2 CSVs (pinned build)  ─┐
Era/SoD reference CSVs (pinned)     ─┤
Wowhead snapshot (icons, checks)    ─┼─► generator (Node, no deps) ─► data/forever/*.js   (shipped)
curation/*.json (reviewed)         ─┤                             └► reports/<build>.md (review: counts, warnings,
theorycraft scoring module (JS)     ─┘                                 picks per role, diff vs previous build)
```

The new part compared with the prototype is **enumeration**: instead of resolving ~160 hand-picked item names, the
generator takes every craft spell of the crafting professions, keeps the equippable results, and classifies them.
Curation shrinks to sources, overrides and notes. Ranking stays in the browser (§10).

## 2. DB2 tables

All from `https://wago.tools/db2/<Table>/csv?build=<build>`.

| Table | Used for |
|---|---|
| `SkillLine` | Profession names and IDs; parent lines (Forever has unused child lines 2937–2948 and a "Test Profession [DNT]" pair 2933/2934). |
| `SkillLineAbility` | Craft spell ↔ profession; `TrivialSkillLineRankLow/High` (yellow/grey); `AcquireMethod` (1 = learned with the profession). `MinSkillLineRank` is 1 for nearly every recipe, so it is not a learn skill. |
| `SpellEffect` | Effect 24 (create item: `EffectItemType`, count `EffectBasePointsF`) is the only create-item effect on profession spells in this build; effect 53 (enchant item); auras of equip/proc spells. |
| `SpellReagents` | Mats (up to 8 per spell). Every gear recipe has a row. |
| `SpellName` | Enchant names, effect names. |
| `Item` | `ClassID`/`SubclassID` (armor or weapon type), `InventoryType`, `IconFileDataID`. 31,821 records (31,822 was the CSV line count; corrected 2026-10-08). |
| `ItemSparse` | Name, quality, item level, required level, bind, stat IDs and shares, `ItemDelay`, `DmgVariance`, `Flags_4`, `RequiredSkill(Rank)`, `AllowableClass`, `ItemSet`, `QualityModifier`; on patterns `RequiredSkillRank` (learn skill), `MinFactionID`/`MinReputation`, `Bonding`, `BuyPrice`/`VendorStackCount`. Only 19,224 records (19,226 was the CSV line count; corrected 2026-10-08): **an item without an ItemSparse row is not in the game.** |
| `ItemEffect` + `ItemXItemEffect` | Pattern → craft spell (`TriggerType` 6 on a `ClassID` 9 item); use (0), equip (1) and on-hit (2) spells; kit/scope use spells. |
| `RandPropPoints` | Stat budget per item level, quality and slot group. |
| `ItemArmorTotal`, `ArmorLocation`, `ItemArmorQuality`, `ItemArmorShield` | Armor. The prototype does not use `ItemArmorShield`; 3 crafted shields need it. |
| `ItemDamageOneHand`, `ItemDamageTwoHand`, `ItemDamageWand` | Weapon DPS by item level and quality. The `…Caster` variants are cached too but identical to the plain tables in this build, so they are not used. |
| `ItemModifiedAppearance`, `ItemAppearance` (new, 2026-10-08, P1) | Icon fallback: 522 of the 1,274 shipped items have `Item.IconFileDataID` 0; their icon is the default appearance's `DefaultIconFileDataID` (`ItemModifiedAppearance` row with the lowest `OrderIndex`). File names come from the community listfile (D7 as amended). |
| `ItemSet` (+ `ItemSetSpell`, new) | Set names and bonus spells (60 crafted items in 16 sets). |
| `SpellItemEnchantment`, `SpellEquippedItems` | Enchant effects and what an enchant fits (prototype `Enchants`). |
| `Faction` (new) | Reputation names and side, for the 9 factions on gear patterns. |
| `ChrClasses`, `ChrRaces`, `CharBaseInfo` (new, small) | Class IDs (bit positions in `AllowableClass`), race → faction (Forever adds the Skyborne race, skill line 2980), playable race/class pairs (the theorycraft draft's check). |
| Era/SoD build: `Item`, `ItemSparse`, `SkillLineAbility` | Origin classification: an ID that exists in the Era/SoD client is vanilla or SoD; one that does not is Forever-new. Pinned, never refreshed. |

Not used: loot, vendor and quest data do not exist in the client (server-side), so DB2 cannot say where a pattern
drops or who sells it (§9).

## 3. Enumeration algorithm

1. **Professions.** Crafting lines that make equipment: Blacksmithing 164, Leatherworking 165, Tailoring 197,
   Engineering 202, Enchanting 333, Alchemy 171. Mining 186, Cooking 185 and First Aid 129 are included only to
   resolve intermediates (bars, Engineering ingredients). Child lines 2937–2948 map to their parents; 2933/2934 are
   excluded by the whitelist. **There is no Jewelcrafting or Inscription skill line in this build.** Alchemy makes
   exactly one equippable item (Alchemist's Stone, trinket, level 45, BoP).
2. **Craft rows.** For every `SkillLineAbility` row of those lines, every `SpellEffect` with `Effect` 24 gives
   `(spell, item, count)`. 2,303 rows.
3. **Equippable.** `Item.ClassID` 2 (weapon) or 4 (armor) and `InventoryType` in {1, 2, 3, 5–17, 20–23, 25, 26, 28}
   (excludes shirts, tabards, bags, ammo). 1,567 rows, 1,564 distinct items.
4. **In the game.** ItemSparse row present. Drops 286 rows (§5, R1). 1,281 rows, 1,279 distinct items.
5. **Level.** `RequiredLevel` ≤ 60. Removes nothing in this build (the maximum is 60), but it is the guard for later
   datasets.
6. **Cosmetic.** Drop armor subclass 5 (Festival Dress/Suit, Green/Red Winter Clothes, Winter Boots). 1,274 items.
7. **Pattern choice.** Per spell, the linked recipe items with an ItemSparse row; drop names ending in " OLD"; prefer
   IDs outside the SoD range; then the lowest ID. 20 spells have more than one linked pattern.
8. **Intermediates.** Close over reagents that are themselves crafted (profession spells preferred, as the
   prototype's `makes` sorting does): 131 intermediates, 356 mats in total (M1 ships 118 intermediate recipes for them, 2026-10-08).
9. **Classify** each item and recipe (`origin`, `avail`, `flags`, derived sources) with the rules of §5 and §9, then
   merge curation (§11) and compute stats, armor and weapon damage (§6).
10. **Derived links.** Pattern `RequiredAbility` → `pattern.spec` (86 gear recipes need a specialisation); `mirror`
    groups for items with identical slot, type, item level, required level, quality, bind and stat shares (32
    groups, 68 items; the Azure/Cloudy faction pairs among them).

## 4. Measured counts (build 1.60.1.70205)

### 4.1 Funnel

| Step | Rows | Distinct items |
|---|---|---|
| Craft spells with effect 24 (all crafting lines) | 2,303 | — |
| Equippable results | 1,567 | 1,564 |
| … without ItemSparse row (dropped) | 286 | — |
| With ItemSparse, required level ≤ 60 | 1,281 | 1,279 |
| Shipped after dropping 5 cosmetic pieces | — | 1,274 |

### 4.2 Per profession and 10-level bracket (by required level; 1,281 rows, before the cosmetic drop)

| Profession | 0–9 | 10–19 | 20–29 | 30–39 | 40–49 | 50–59 | 60 | Total |
|---|---|---|---|---|---|---|---|---|
| Blacksmithing | 27 | 44 | 60 | 48 | 75 | 94 | 33 | 381 |
| Leatherworking | 37 | 53 | 55 | 55 | 79 | 135 | 29 | 443 |
| Tailoring | 36 | 44 | 52 | 54 | 61 | 73 | 19 | 339 |
| Engineering | 41 | 3 | 3 | 7 | 8 | 11 | 7 | 80 |
| Enchanting | 2 | 1 | 8 | 3 | 9 | 7 | 7 | 37 |
| Alchemy | 0 | 0 | 0 | 0 | 1 | 0 | 0 | 1 |
| **All** | 143 | 145 | 178 | 167 | 233 | 320 | 95 | **1,281** |

Engineering's 41 in 0–9 are items with required level 0 that are gated by Engineering skill instead (37 of the 43
level-0 items). Required level 31–60 holds 759 of the 1,281 rows (59%), so the half of the range the prototype never
curated is also the larger half.

### 4.3 Recipes, binds, stats

| Profession | Pattern linked | Trainer (no pattern) | BoP result | BoE result | No budgeted stats |
|---|---|---|---|---|---|
| Blacksmithing | 323 | 58 | 101 | 276 | 21 |
| Leatherworking | 390 | 53 | 126 | 313 | 17 |
| Tailoring | 278 | 61 | 107 | 220 | 15 |
| Engineering | 68 | 12 | 20 | 52 | 39 |
| Enchanting | 31 | 6 | 21 | 16 | 15 |
| Alchemy | 1 | 0 | 1 | 0 | 0 |
| **All** | **1,091** | **190** | **376** | **877** | **107** |

Remaining binds: 25 "none", 3 BoU. Of the 1,091 linked patterns, 1,004 have an ItemSparse row (87 are stubs, §5 R3);
155 of those require reputation. Across the whole client, recipe items are bound "none" (1,664) or BoP (1,032); **no
recipe item is BoE** (`Bonding` 2). See §9.1 for why that matters.

Other measured facts:

- Origin: 669 vanilla, 602 Forever-new, 10 in the SoD ID range (§5 R4).
- Armor types: cloth 373, leather 320, mail 270, plate 124; 131 weapons; 39 misc (29 trinkets, 4 held off-hands,
  3 belts, 2 robes, 1 neck); 14 relics (5 idols, 5 librams, 4 totems), 3 shields.
- Enchanting equipment: 11 wands, 4 staves and 4 off-hands (BoP), 14 relics, 3 "Heart of the Mountain" trinkets.
  Engineering: 25 trinkets, 24 head pieces, 12 guns, 7 belts, 4 thrown, plus a few singles.
- 57 items require a profession skill to equip (`RequiredSkill`); 11 are class-restricted by `AllowableClass`;
  86 patterns require a specialisation (`RequiredAbility`: Armorsmith 17, Weaponsmith 5, Master Sword/Hammer/Axesmith
  7/6/5, Dragonscale 11, Elemental 15, Tribal 19, Goblin Engineer 1).
- 60 items belong to 16 item sets (all level 40+).
- Mats: 290 distinct direct reagents, 356 including the intermediates' own reagents; 131 intermediates (Engineering
  47, Alchemy 35, Leatherworking 16, Mining 13, Tailoring 8, Blacksmithing 7, Enchanting 3, First Aid 2). Every gear
  recipe creates one item; no reagent lacks an ItemSparse row.
- Enchants: 179 enchanting spells with effect 53 (132 vanilla, 27 Forever-new, 20 in the SoD spell range) and 28
  enchant items (15 Leatherworking kits, 7 Engineering scopes, 6 Blacksmithing attachments). Three Engineering
  "Tinker" spells (Teleport, Nitro Boosts, Magnetic Displacement) are Forever-new and not covered by the prototype.

## 5. Leftovers, duplicates and test items: generic rules

The prototype handles these with skip lists (`ENCHANT_SKIP` with five SoD IDs; plan entries referenced by ID where
names collide). For 1,281 rows that does not scale. Rules, in order, with what each catches in this build:

| Rule | Signal | Catches | Action |
|---|---|---|---|
| R1 | Crafted item has no ItemSparse row | 286 rows: 209 SoD items, 69 Forever-new IDs (Grovekeeper, Justice, "of Glory", "of Conviction", Demonheart, Manaflare, Grimstitch, Wildstalker's and most Spiritcaller pieces), 8 vanilla (Goblin Radio, Gnomish Ham Radio, Smoking Heart of the Mountain, Demon Forged Breastplate, Rune Edge, Ironvine ×3) | Not shipped. The diff report lists any that gain a row in a later build (likely later content). |
| R2 | Armor subclass 5 (cosmetic) | 5 | Not shipped. |
| R3 | Pattern linked, but pattern has no ItemSparse row ("stub") | 87 gear recipes | Forever-new item (36: the trainer-taught Veteran's-family chain shirts/leggings/helms and leather armor/pants/helms, which the recipe-source note confirms; plus 3 Heart of the Mountain trinkets and Shining Mithril Helm) → source `trainer`, `certainty: "db"` until confirmed. Vanilla item (51) → `avail: "unconfirmed"`: Gnomish/Goblin specialization gear (its link points at SoD schematic stubs), later-phase vanilla patterns (Glacial/Polar/Icy Scale, Spitfire, Sandstalker, Bramblewood, Dreamscale, Obsidian belts, Onyxia Scale), and the items the notes already call unobtainable (Green Woolen Robe, Boots of Darkness, Ironforge Chain/Gauntlets, Rough Bronze Bracers). |
| R4 | Item ID in the SoD range (190,000–244,999) and present in the Era/SoD client | 10 rows, 9 items | If the recipe has a Forever-range pattern (≥ 245,000) → live (Idol of the Dream, Libram of Holy Alacrity, Totem of Thunder). Otherwise flag `sodSuspect` and require a curation decision: Phoenix Bindings (unobtainable per notes), Invoker's Mantle/Cord (live: patterns seen on the beta AH), Turtle Scale Gloves 217270 and Golden Scale Gauntlets 217273 (SoD duplicates of 8187/9366: hide), Greater Mystic Wand 217287 (made by the vanilla spell 14810 in Forever: live). |
| R4e | Same rule for enchanting spells (SoD spell range 400,000–1,239,999) | 20 spells | Live if a formula is Forever-range: 10 (Gloves Holy/Arcane Power with 2495xx formulas, eight off-hand/shield/bracer/cloak/2H enchants with 2743xx formulas). Suspect otherwise, 10: Dismantle, Retricutioner, Living Stats (already skipped by the prototype), Law of Nature, Bracer Spell Power/Agility (stub formulas only), the four "Grand …" weapon enchants. |
| R5 | Name markers | `[DNT]`, `Test`, `QA`, `zz`, `Deprecated`: **none** among candidates; one pattern named "… OLD" (4295) next to the real one (5974) | Pattern choice drops " OLD" (§3 step 7); the test skill line is excluded by the whitelist. |
| R6 | Duplicate display names | 4 pairs (data-model §4.4) | Never resolve by name; curation is by ID. |
| R7 | Several craft spells per item | 3 (Goblin Mortar 12716/13240, Greater Mystic Wand 14810/439134, Obsidian Reaver without ItemSparse) | Ship every live spell as a recipe; the item lists all. |
| R8 | No budgeted stats | 107: 69 with use/equip/on-hit effects, 23 white items (armor or DPS only), 14 greens/blues/epics with nothing | The 14 get `flags`: Wild Leather ×6 (vanilla random-suffix items; the suffix tables are not in DB2 → `randomStats`, `unconfirmed`), Spiritcaller ×4 (Forever epic set with an item-name description and a limit category, probably unfinished → `unconfirmed`), three Forever Engineering belts (Whimsical Waistwrap, Gizmo Girdle, Clanking Cord) and Gemmed Copper Gauntlets → curation check. |

What does **not** work as a signal: ItemSparse `Flags_0..3` (no deprecated marker among candidates; `Flags_2` is 0
everywhere), `AllowableRace` (−1 on every candidate and every pattern), `OppositeFactionItemID` (0 everywhere),
`SkillLineAbility.RaceMasks` (set on 2 of 2,623 rows), and pattern `BuyPrice` (993 of 1,004 patterns have one,
vendor-sold or not). "No live source" cannot be detected from DB2 at all; that is curation (§9).

## 6. Stats, armor and weapon damage

### 6.1 Stats (copy the prototype's `GameData.stats`)

`value = round(RandPropPoints[ilvl][<Good|Superior|Epic>F_<slotIndex>] × StatPercentEditor / 10000)`, slot index from
the prototype's `SLOTIDX`. Every candidate with stats has a budget row (0 misses). Checked against the 296 cached
tooltips: **256 of 256** primary-stat lines match exactly.

Changes when porting:

- Extend `STAT`: 51/52/54/55/56 are Fire/Frost/Shadow/Nature/Arcane resistance (215 occurrences, mostly level 50–60
  gear). Six IDs remain unidentified: 83 and 112/113/132 (Molten Heart of the Mountain, Herbalist's Gloves, Goblin
  Mining Helmet, Gnomish Universal Remote; probably profession skill bonuses), 90 (Huge Thorium Battleaxe), 124
  (Obsidian belts and shield; the prototype maps 124 to Spirit for enchants, which conflicts with vanilla's Nature
  resistance on these items). These six ship as `Stat<ID>` (weight 0, shown raw, as the theorycraft draft proposes)
  and stay on a known-unidentified list in curation; a **new** unmapped ID fails the build, so a release-day change
  cannot slip through as silently as the prototype's `stat83`.
- Keep negative shares (Fletcher's Gloves has Parry −25000) but flag them for review.
- Items with no quality budget (white) get no stats, as today.

### 6.2 Armor (copy `GameData.armor`, add shields)

`round(ItemArmorTotal[ilvl][type] × ArmorLocation[inv][typeModifier] × ItemArmorQuality[ilvl].Qualitymod_<q>)`,
robes as chest. Checked: **132 of 132** cached armor values match. Additions: shields from `ItemArmorShield` (3
crafted shields); `QualityModifier` is set on 23 crafted items (M1 measured 37 shipped items, 4 of them negative; the report lists them under "needs in-game check", 2026-10-08) (Dark Iron Mail 130, Onyxia Scale Breastplate 150,
Heavy Mithril Gauntlet 80, …) and none of them is in the tooltip cache, so whether and how it scales armor is
unverified: these 23 are in the Wowhead check set and flagged `qualityModifier` until it passes.

### 6.3 Weapon damage and the `Flags_4` problem

Base rule (copy `GameData.weapon` and `GameData.damage`): table DPS from `ItemDamageOneHand/TwoHand/Wand[ilvl]
.Quality_<q>`, speed `ItemDelay/1000`, range `[floor(avg × (1 − v/2)), floor(avg × (1 + v/2) + 0.5)]` with
`avg = dps × speed`, `v = DmgVariance`. **New:** report `dps = (min + max) / 2 / speed`, as the game does. That removes
the 1–2% gap the prototype saw between tables and tooltips (Copper Dagger: table 6.02, tooltip 5.88, derived 5.88).

Measured against the cached tooltips:

| Group | Crafted, 1–60 | Tooltip samples | Rule | Result |
|---|---|---|---|---|
| Melee, no flag | 93 (+1 misc: Arclight Spanner) | 18 | tables | 18/18 exact damage ranges |
| Wands | 11 | 4 | wand table | 4/4 exact DPS |
| `Flags_4` 0x300 (Solid Iron Maul, Glimmering Staff, Soulstaff, Radiant Staff, Sageblade) | 5 | 2 | table × f | f ∈ [0.7429, 0.7436] reproduces both ranges exactly (43–66, 32–49) |
| `Flags_4` 0x500 (Dreamstaff), 0x100 (Searing Golden Blade) | 2 | 0 | table × 0.743 (hypothesis) | unverified |
| Guns | 12 | 3 | **TwoHand** table × 0.6 | 3/3 exact (f ∈ [0.597, 0.601]; OneHand × 0.78 also fits) |
| Thrown (bomb satchels, smith hammers; Forever-new) | 7 | 0 | none known | unverified |
| Bows, crossbows | 0 | — | — | none craftable 1–60 |

What the flag is: across all 1,775 weapons in ItemSparse, bit 0x100 is set on 98 (0x300 on 77, 0x500 on 17, 0x100
alone on 4), and 86 of those carry Int/Spirit/spell stats (vs 150 of 1,677 unflagged). 0x500 is on healer weapons
(Benediction, Healer's Staff, Yaely's Mending Tool), 0x300 on caster DPS weapons. So 0x100 reads as "caster weapon"
and the ~26% cut (factor 0.743) as the caster-weapon DPS rule. Solid Iron Maul (Stamina only) carries it too, which
is why it surprised the prototype.

**Decision:** rules replace per-item tooltip fetches for DPS: `0x100 set → table × 0.743`, guns → TwoHand × 0.6,
everything else from the tables. Wowhead stays as a **build-time check**, not a data source: the snapshot step
(§13) already fetches every shipped item's tooltip for its icon, so the generator compares stats, armor and damage
for every item Wowhead has, and reports mismatches. A mismatch on a rule-based weapon (0x500, 0x100-only, thrown)
falls back to the Wowhead numbers with `basis: "wowhead"` and a report line, so one unverified rule can never ship a
wrong number silently. With only two samples per rule this is the honest middle: no 1,274 tooltip dependency, but no
blind trust either.

**D14 cross-check against Wowhead's Forever tooltips (2026-10-08, local check, nothing committed from Wowhead):**

| Item | Generated | Wowhead | Verdict |
|---|---|---|---|
| Dreamstaff (249454, `Flags_4` 0x500, two-hand) | 62–93, 2.40, 32.29 DPS | 62–93, 2.40, 32.29 DPS | caster factor 0.743 on the two-hand table confirmed |
| Searing Golden Blade (12260, `Flags_4` 0x100, one-hand) | 15–29, 1.40, 15.71 DPS | 14–26, 1.40, 14.29 DPS | **in-game tooltip confirms Wowhead**: one-hand caster weapons are OneHand table × 2/3, not × 0.743 |
| Sageblade (22383, one-hand caster, epic ilvl 64) | 43–81, 34.44 DPS | 39–73, 31.11 DPS | same: ×0.668 of the OneHand table |
| Glimmering Staff (249392), Solid Iron Maul (3851), two-hand caster | 32–49, 18.41 / 43–66, 15.57 | identical | two-hand caster factor 0.743 confirmed (with Dreamstaff) |
| Mithril Blunderbuss (10508, gun) | 36–68, 17.93 DPS | identical | gun rule (TwoHand × 0.6) confirmed at ilvl 41 |
| Cracked (285279), Mithril (285280), Arcanite (285281) Blacksmith Hammer, thrown | 13–25 8.64 / 24–46 16.67 / 43–80 27.95 | 15–29 10.00 / 28–53 19.29 / 49–92 32.05 | **in-game tooltip confirms Wowhead** (Cracked: 15–29, 2.20, 10 DPS): thrown hammers are OneHand table × 0.9, not the gun rule |
| Satchel of Copper/Bronze/Iron/Dark Iron Bombs (285275–285278, thrown) | 7.25 / 13.25 / 21.25 / 26.5 DPS | "2–10" 3.09 / "2–20" 5.45 / "2–31" 8.34 / "2–39" 10.35 | **in-game tooltip (copper): 2–11, 2.00, 3.1 DPS, plus "Equip: thrown attacks explode for 1 to 11 Fire damage"**, so Wowhead is right and no table ratio fits: the satchels carry part of their budget in the explosion. Ship them as curated overrides (`curation/items.json` weapon fix, cite WH + in-game, checked 2026-10-08) |

Wowhead derives its numbers from the same tables, so a mismatch alone is not proof; the in-game tooltip decides.
Macro, any character level: `/run local id=12260 C_Item.RequestLoadItemDataByID(id) C_Timer.After(2,function() local
t=C_TooltipInfo.GetItemByID(id) for _,l in ipairs(t.lines) do print(l.leftText or "", l.rightText or "") end end)`.
Corrections (planned for the first public build, P1): one-hand caster factor 2/3 (`pipeline/constants.js`; two-hand
stays 0.743), thrown = OneHand table × 0.9 (hammers; fixtures 285279 15–29, 285280 28–53, 285281 49–92), satchels
285275–285278 as curated weapon overrides (2–11, 2–20, 2–31, 2–39 at speed 2.00; the three higher ones from Wowhead).

### 6.4 Effects and sets

Use/equip/on-hit spells (`ItemEffect` trigger 0/1/2): 54 candidates have a use effect, 50 an equip effect, 25 an
on-hit effect. None of the equip spells is a plain stat aura (no aura 29/13/135/99/124, which the prototype's
`Enchants.aura_stats` parses for enchants); they are procs (aura 42), dummies, spell modifiers on relics (107/108),
detection, skill bonuses. So effects ship as text (`effects[].text`, from the Wowhead tooltip line, spell name as
fallback) and are not scored unless curation adds a `value`. Set bonuses ship as text from `ItemSet`/`ItemSetSpell`.

## 7. Recipe skill

Copy the prototype's rule: `learn = pattern.RequiredSkillRank`; trainer recipes (no pattern, or a stub) get
`learn = TrivialSkillLineRankLow` with `approx: true`. `MinSkillLineRank` is not usable (1 on almost every row; on
recipes with a real pattern it never equals the pattern's rank). `AcquireMethod` 1 (9 starter recipes) means "learned
with the profession": source `trainer`, learn 1.

## 8. Mats

Copy the reagent walk of `GameData.craft_cost` without the pricing: emit `[itemId, count]` pairs, and the `madeBy`
index for intermediates. Pricing (vendor, AH, "cheaper of AH and crafting it", depth ≤ 4) moves to the browser
(data-model §10). `VENDOR_MATS` becomes `curation/mats.json` keyed by ID, extended for 31–60 (Rune Thread is the most
used mat of all, 215 recipes).

## 9. Recipe sources

### 9.1 What DB2 tells

| Signal | Derived source | Count (gear recipes) |
|---|---|---|
| No pattern link | `trainer` (both sides) | 190 |
| Stub pattern on a Forever-new item | `trainer`, `certainty: "db"` | 36 |
| Pattern with `MinFactionID`/`MinReputation` | `vendor` with `rep` (faction, standing), side from `Faction`; NPC unknown | 155 (9 factions, data-model §7.2) |
| Pattern `Bonding` "none" | "tradeable pattern: world drop or vendor" (`drop`/`vendor`, `certainty: "db"`) | 422 |
| Pattern `Bonding` BoP, no reputation | "BoP pattern: Favor, vendor, quest or dungeon drop" (`unknown`) | 427 |
| Pattern `RequiredSkillRank` | learn skill | 1,004 |

The prototype's fallback (`GameData.source`) treats only a BoE (`Bonding` 2) pattern as a world drop and labels
everything else "BoP recipe item; source not identified". Because no pattern in this build is BoE, every uncurated
tradeable pattern (`Bonding` 0) was mislabelled as BoP. The new derivation uses "none" = tradeable.

By level and origin ("vanilla" = the ID exists in the Era/SoD client):

| Derived class | 1–30 vanilla | 1–30 new | 31–60 vanilla | 31–60 new |
|---|---|---|---|---|
| Trainer (no pattern) | 121 | 1 | 67 | 1 |
| Stub pattern | 17 | 32 | 34 | 4 |
| Reputation pattern | 0 | 64 | 65 | 26 |
| BoP pattern, no reputation | 19 | 140 | 69 | 199 |
| Tradeable pattern, no reputation | 88 | 40 | 199 | 95 |

### 9.2 What needs curation

Vendor NPC, price, stock limit and side; Merchant's Favor cost; quest; dungeon or zone; and every Forever-new BoP
pattern's source. Concretely for 31–60: 562 recipes with a non-reputation pattern (268 BoP, 294 tradeable) plus NPCs
for 91 reputation patterns.

### 9.3 Seed: the prototype's recipe-source note and `SOURCES`

The note covers required level ≤ 30 from the Alliance side: Favor families (Tailoring, Leatherworking,
Blacksmithing at Three Corners, 30 Favor each), Nightclaw Druids and Kirin Tor patterns, Granny Finespindle, limited
vanilla vendors, quest patterns, world and dungeon drops, and trainer/pattern conflicts; about 120 per-item entries
in the generator's `SOURCES` plus ~80 family rows in the note. Convert them to `curation/sources.json` families by item
ID, with the note's source keys as `cite`.

Gaps:

1. **Levels 31–60 entirely.** Vanilla patterns (199 tradeable, 69 BoP, 65 reputation in 31–60) can be seeded from
   vanilla knowledge with `certainty: "vanilla"` (the note found vanilla sources "Forever-consistent" for ≤ 30).
   Forever-new 31–60 patterns (199 BoP, 95 tradeable, 26 reputation) are unknown: the note only says higher Favor
   patterns cost 60/90/120 and that new Blacksmithing/Leatherworking patterns also drop in dungeons.
2. **Horde.** Only "Durotar Supply and Logistics, west of the Crossroads (Jim'bek / Pawani / Gor'mak)" as the Favor
   mirror and the Earthen Ring quartermaster (Sutara Plainstalker, Mulgore) for the Cloudy patterns. No Horde vendor
   pattern is curated; Horde-only formulas are marked unavailable rather than modelled.
3. **Engineering and Enchanting** are thin even ≤ 30 (Glimmering Staff and Orb formulas: seller not identified;
   Moonsight Rifle: source not checked).
4. **Conflicts** stay conflicts (Dark Leather Boots: Granny Finespindle vs trainer; Novice sashes: trainer per one
   site only). Model them as two sources with their certainty, not as a pick.

### 9.4 Cutting the curation work

- **Families.** Forever-new sets come in families that share a source. The 294 Forever-new 31–60 items with a
  non-reputation pattern fall into 87 groups by (profession, required level, pattern bind, pattern price), e.g. the
  Mender's/Skirmisher's/Skycaller's/Stalker's mail and leather pieces at levels 35–50 come in groups of 7–9. One
  curated family entry covers a group (data-model §11.1).
- **Machine-readable seed.** AllTheThings' Forever database (cited in the note) has per-recipe sources with NPCs,
  coordinates, costs and faction. Recommended as a build-time suggestion input: a script proposes family entries
  from it, a human reviews and commits them. Not shipped verbatim (license to be checked; open question 3).
- **Report-driven.** The build report counts gear recipes per source certainty and lists uncurated ones by level, so
  curation is done top-down by what users hit first (low levels, BoP sets).

## 10. Ranking: interface and where it runs

The pipeline emits facts per item (`slot`, `type`, `req`, `stats`, `armor`, `weapon`, `effects[].value`, `flags`,
`avail`, `bind`, `classes`, `equipSkill`) and per recipe (profession, skill, sources). It does **not** emit scores.

Scoring and the per-slot path run in the browser, in the theorycraft module (`score(item, roleId) → number`,
`weights(classId, roleId, item)`), because:

1. Candidates depend on the user's roster (BoP only for the crafter, faction, AH switch, professions), so the path
   must be computed in the browser anyway; scoring is the cheap part (1,274 items × ≤ 30 stat keys × at most ~25
   class/role pairs ≈ 1M multiply-adds, a few milliseconds).
2. Weights change during tuning and may become user-adjustable; precomputed scores would tie every weight change to a
   data regeneration and a 200 KB data diff.
3. The generator can **import the same module** (it is Node, §12) to write a review section into the build report:
   the top three crafted pieces per role, slot and 5-level step. That is the curation tool for catching nonsense
   (had the Solid Iron Maul's table DPS of 21.1 shipped instead of the real 15.6, it would top the two-hander list at
   level 26, which a reviewer spots at once).
   Golden tests snapshot the same table.

The only role-independent derived values the pipeline precomputes are the ones that need DB2: stats from budgets,
armor, weapon damage.

## 11. Curation and overrides

Layout and shapes in data-model §11. Pipeline rules:

- Curation files are JSON under `curation/`, schema-checked, reviewed in pull requests; each entry carries `why`,
  and `cite` + `checked` where it asserts a fact.
- Validation (fails the build): unknown item/spell IDs, an item in two source families, an NPC slug without a record,
  a source without `side`/`certainty`, a `names` entry that no longer matches its ID, a `sodSuspect` without a
  decision, a stat ID that is neither mapped nor on the known-unidentified list.
- Warnings (report only): gear recipes with only derived sources, by level; Wowhead check mismatches; items whose
  curated note mentions an item name that no longer resolves.
- Overrides are by ID, never by name; the report prints the name next to every ID so reviews stay readable.

## 12. Generator language: Node, not Python

The prototype's generator is Python with two non-stdlib dependencies (`lupa` for the Lua saved-variables file,
`cbor2` for Auctionator's price blob). The release draft proposes a stdlib-only Python generator, which works because
price decoding moves to JS. Both are dependency-free, so the choice turns on code sharing. For the new repo the
generator should be **Node (CommonJS, no dependencies)**:

- **Shared code with the page.** The theorycraft scoring module, `rules.js` and the stat-key tables are JS; the build
  report and golden tests run them unchanged. The browser-side Auctionator decoder (Lua string literal + CBOR, decided
  before the design phase) can produce the shipped default price list from a scan file, so there is one decoder instead of a
  Python one and a JS one.
- **One toolchain.** The page's tests already run with `node --test`; contributors install nothing else. No venv, no
  C extension (`lupa`).
- **Built-ins cover it.** `fetch` (with an explicit User-Agent; wago.tools answers Python's default agent with 403, so
  the prototype shells out to `curl`), `crypto` for the hash manifest, `fs`, `node:test`.
- **What Python would cost instead.** The build report's "top picks per role" and the golden-picks test need the
  ranking. In Python that means a second implementation of the theorycraft scoring and candidate filter, kept in
  sync by hand, or no ranking review at build time. That review is the main defence against nonsense in 1,274
  enumerated items.
- **Cost.** A ~40-line RFC 4180 CSV parser (quoted fields with commas occur in names and descriptions), tested by
  comparing row and field counts with Python's `csv` on every table once. Porting the ~600 relevant lines of the
  prototype's generator is 1–2 days; correctness check during the port: regenerate the prototype's 160 items and
  compare stats, armor, damage, skill and mats field by field.

**What to copy from the prototype's generator** (port to JS, same names where sensible):

| Copy | Change |
|---|---|
| Constants `STAT`, `SLOTIDX`, `QUALITY`, `SLOT`, `ARMOR`, `WEAPON`, `BIND`, `ARMOR_COL`, `ENCHANT_STAT`, `MOD_STAT`, `RES_MASK`, `RES_IDX`, `CREATURE`, `WEAPON_INV`, `INV_SLOT` | Extend `STAT` (§6.1); move display names to `rules.js`. |
| `GameData.__init__` indexes (`makes`, pattern link via `ItemEffect` trigger 6 + `ClassID` 9) | Profession whitelist + child-line mapping; pattern choice rule (§3 step 7). |
| `GameData.stats`, `.armor`, `.weapon`, `.damage`, `.describe` | Shields, caster/gun factors, derived DPS, `QualityModifier` flag, no personal fields. |
| `Enchants` (`aura_stats`, `sie_stats` with its name/number sanity check, `effect_text`, `targets`, `skill`, `enchanting`, `items`, `records`) | Caps raised to 60, `crafter` dropped, sources in the common format. |
| `wowhead_icons`, `wowhead_weapon` | Become the snapshot step and the check parser (§13). |
| `fmt` (one record per line) | Emit strict JSON with fixed key order. |
| `ENCHANT_SKIP`, `VENDOR_MATS`, `SOURCES`, `ENCHANT_SOURCES`, `FAVOR_INFO`, `META_NOTES` | Converted into `curation/` and `reference.js`, by ID, with household wording and character names removed. |

**Not copied:** `CHARACTERS`, `CRAFTERS`, `CASTERS`, `PLANS`, `FAVOR`, `SKILL_TABLE` (replaced by enumeration and the
roster), `unit_price`/`craft_cost` pricing (moves to the browser), the realm/saved-variables plumbing, and the
`source()` fallback (fixed in §9.1).

## 13. Caching, external fetches, determinism

- **DB2 cache:** `<cache>/db2/<build>/<Table>.csv` outside the repo, location as in the release draft (`--cache`, an
  environment variable, then the platform's user cache directory), about 30 MB per build for the ~25 tables. `tools/db2-fetch` downloads missing tables and writes `build-inputs/db2-<build>.sha256` (committed).
  The generator refuses CSVs whose hash differs from the manifest unless run with `--accept-new-hashes` (wago.tools
  can re-export a build when hotfixes land; that must be a deliberate update, not a silent drift).
- **Wowhead snapshot:** `tools/wowhead-sync` fetches `https://nether.wowhead.com/forever/tooltip/item/<id>` for
  every shipped item, mat and enchant item not yet in the snapshot (about 1,660 IDs the first time), sequentially at
  about one request per second with a User-Agent naming the project, so a cold run takes ~30 minutes and later runs
  only fetch new IDs. It stores **extracted fields only** (icon name, damage range, DPS, armor, primary-stat lines,
  effect lines) in `build-inputs/wowhead-<build>.json` (committed, ~150 KB), not Wowhead's tooltip HTML. Failed
  fetches are not stored (prototype behaviour), so they are retried.
- **Determinism:** the generator is a pure function of (CSV set with matching hashes, pinned Era reference CSVs,
  Wowhead snapshot, `curation/`, theorycraft module, `--date`). No wall-clock time, no network during generation,
  numeric key order, fixed per-record field order, fixed rounding (DPS and speed to 2 decimals), LF line endings. Two
  runs on the same inputs produce byte-identical files; a node test asserts it on a fixture subset.

## 14. Release-day refresh (2026-11-05)

Forever goes live 2026-11-05 00:00 CET. Data and price refreshes are separate; this is the data part.

**Before (by 2026-11-01):** run the whole procedure once against any newer beta build to prove the tooling; have the
build report's diff section working against a committed baseline (`data-beta-1.60.1.70205` tag).

**On release day:**

1. **Find the live build number** and product. The beta product is `wow_classic_beta`; the live product code is not
   known yet. Use wago.tools' build list (or the client's own build info file).
2. **Fetch:** `node tools/db2-fetch --build <live>` → `<cache>/db2/<live>/`, new hash manifest.
3. **Generate with a diff:** `node tools/gen --build <live> --date 2026-11-05 --diff-against data-beta-1.60.1.70205`
   writes `data/forever/*.js` and `reports/<live>.md`. Report sections, in review order:
   1. Blocking: unknown stat IDs, curation IDs that no longer exist, schema violations, new `sodSuspect` items.
   2. Removed items, recipes, enchants (each one breaks user-state keys; the page will report them to users).
   3. Changed items: old → new per field (`req`, `ilvl`, `quality`, `bind`, `stats`, `armor`, `weapon`, `slot`,
      `name`), changed recipes (`skill`, `mats`, pattern `bind`/`rep`, pattern gained or lost).
   4. Added items and recipes, grouped into families, with their derived source.
   5. Counts per profession × bracket, old vs new; derived-only source counts by level.
   6. Rows that gained an ItemSparse row (R1 items becoming real), stub patterns that became real.
4. **Wowhead:** `node tools/wowhead-sync --build <live>` for new and changed IDs. Wowhead may lag the launch by hours;
   if so, ship with rule values marked unchecked and re-run the check within 1–2 days.
5. **Curate** until step 3 has no blocking items; review the "top picks per role" diff for surprises.
6. **Test:** `node --test` (formulas against fixtures, data-file contract, dataset key consistency, determinism,
   curation validation, golden picks, the release role's privacy grep).
7. **Commit and deploy:** set `meta.status` to `"live"` and `meta.build` to the new build; one commit containing
   data, report, hash manifest and Wowhead snapshot ("Data: Forever live build X"); tag `data-<build>`; deploy.
8. **Follow-up:** re-run steps 2–3 after 3 and 7 days. A changed hash manifest for the same build means wago.tools
   re-exported hotfixed tables; a new build number repeats the whole procedure.

Prices: the shipped default price list stays marked as beta until live scans exist (pricing document).

**Correction, 2026-10-08 (M1.1 rehearsal on beta build 1.60.1.70245; record: `reports/1.60.1.70245.md`).** The
procedure above was planned before the pipeline existed. What holds now:

- **Commands.** There is no `tools/db2-fetch`, `tools/gen` or `tools/wowhead-sync`. Use
  `node pipeline/main.js fetch --build <b>`, then
  `node pipeline/main.js build --build <b> --date <YYYY-MM-DD> --diff-against data-beta-1.60.1.70205`. The build
  writes `site/data/forever/*.js` (not `data/forever/`) and `reports/<b>.md`; `--out <dir>` and `--report <file>`
  redirect them, for a dry run that leaves the shipped data alone. Step 4 does not exist: there is no Wowhead
  snapshot (D7), and the Wowhead cross-check is a local step whose results are not committed. Step 6 is
  `tools/check.sh`.
- **Product name (step 1).** wago.tools lists the 1.60 builds under both `wow_classic_beta` and `wow_cn_beta`.
  `/api/builds` sorts versions as strings, so the 5.5.0 entries come first in `wow_classic_beta` and hide the 1.60
  rows. List every 1.60 build with:
  `curl -s -A x https://wago.tools/api/builds | node -e 'const d=JSON.parse(require("fs").readFileSync(0));for(const[p,v]of Object.entries(d))for(const b of v)if(/^1\.60\./.test(b.version))console.log(p,b.version,b.created_at)'`.
  The live product code (S5) is still unknown. `meta.product` stays the client's `wow_classic_beta`.
- **What changed between beta builds.** 70245 (2026-10-06) and 70235 are byte-identical to 70205 in all 25 tables:
  the same hash manifest, and 12 further tables sampled (Spell, GlobalStrings, Map, …) are equal too. The DB2
  content last changed at 70170 (2026-10-01): 69876 → 70009 (= 70124) → 70170 (= 70205 = 70235 = 70245). wago
  honours `?build=` (an unknown build returns HTTP 400), so identical files are real. A new build number is
  therefore no evidence of new data. Step 3's diff section now opens with the DB2 tables that differ from the
  baseline build.
- **Step 3's report sections** are implemented in `pipeline/report.js` §8, in review order:
  1. removed items, recipes and mats;
  2. changes field by field (nested objects one level deep, sources as labels);
  3. added items and recipes grouped by profession and derived source;
  4. counts per profession × bracket and source counts per bracket, as old → new;
  5. R1 items that gained an ItemSparse row (read from the baseline build's cached ItemSparse), stub patterns
     that became real or the reverse, and availability changes.

  The funnel's third column shows the baseline's counts when the build has no planning measurement.
  `--diff-against` also takes a directory of generated `*.js`, so two builds can be compared without committing
  either. On a real change (70124 → 70245, from a scratch directory), the diff listed 14 changed tables but only
  11 items, 1 recipe and 1 mat with changes: binds `none`/`BoP` → `BoE` on bronze and iron smithing pieces and on
  Green Leather Armor, and the name "Alchemists' Stone" → "Alchemist's Stone".
- **Timing** (wall clock, WSL2, i5-12400F):
  - fetch of a new build: 12–13 s (25 tables, 14 MB, with the Era reference and the listfile already cached; a
    new listfile tag adds a 146 MB download);
  - build: 2 s (840 MB peak memory);
  - `tools/check.sh`: 4 s;
  - review: the agent read the 13-row 70124 diff in under a minute; reading the whole report (~460 lines) by hand
    takes longer and was not measured.

  So the launch-day data path is minutes. The time goes into curation of whatever the diff shows.
- **Fixed during the rehearsal:**
  - the diff section listed only IDs of items and recipes, without fields, families, counts or R1/R3, and capped
    silently at 400 rows; overflow is now printed as "… N more";
  - the funnel's comparison column was empty for every build except 70205;
  - `--diff-against` accepted only a git tag, and `git show` errors leaked to the terminal.

  Fetch and build were not flaky.
- **Release-day command.** `build` takes `--status beta|live` (default `beta`) and `--product <code>` (default
  `wow_classic_beta`); both are validated and written into `meta` only. So step 7 is a command line:
  `node pipeline/main.js build --build <live> --date 2026-11-05 --status live --product <S5 code> --diff-against
  data-beta-1.60.1.70205`, then the `data-<build>` and `v0.3.0` tags (0.2.0 went to M2; roadmap M1.1).
- **Still open for 2026-11-05:** S5, the live product code and build.

## 15. Tests the pipeline needs

- CSV parser: row/field counts per table equal the reference counts.
- Formula fixtures: Fine Leather Boots (armor 51, Agi 3, Sta 2), Glimmering Staff (32–49), Solid Iron Maul (43–66),
  Deadly Blunderbuss (15–28), Heavy Copper Maul (28–43), Greater Magic Wand (17.5 DPS).
- Enumeration counts on the pinned build (1,274 items; per-profession totals of §4.2), so an accidental filter change
  is caught.
- Data-file contract and dataset key (data-model §3.2), determinism, curation validation, golden picks.

## Assumptions about other areas

- **Theorycraft** provides a JS module usable from the page and from Node (UMD pattern, like the prototype's enchant
  rules) with role IDs, weights and `score(item, roleId)`, consuming the item fields of §10. It decides how to value
  weapon DPS, armor, resistances and effects; the pipeline only supplies numbers.
- **Pricing** owns the Auctionator decoder in JS; the generator may call it to build the default price list, but the
  price list is written by a separate command and never during game-data generation.
- **Release/infra** owns CI, the deploy and the repo layout (its draft: `site/data/`, `pipeline/`, `curation/`,
  `tests/`, cache outside the repo). This document's `tools/…` commands and `build-inputs/`/`reports/` folders map
  onto that layout (`pipeline/` instead of `tools/`). CI runs the tests without CSVs and never fetches; regeneration
  is run by the maintainer. Where the release draft assumes a Python generator, this document disagrees (§12, open
  question 1); everything else is compatible.
- **Product/UX** shows `avail: "unconfirmed"` items with a marker and hides `unobtainable` ones by default.

## Open questions

1. **Node or Python for the generator?** The release draft proposes stdlib Python. *Recommendation:* Node (§12):
   both are dependency-free, but only Node runs the theorycraft scoring unchanged in the build report and golden
   tests, and the whole repo then needs one runtime.
2. **Caster-weapon rule with two samples.** *Recommendation:* ship the 0.743 rule for bit 0x100 and the gun rule,
   with the Wowhead check as the safety net; before release, fetch tooltips for Dreamstaff (0x500), Searing Golden
   Blade (0x100 only) and one thrown item to settle the open cases.
3. **AllTheThings' Forever database as a source seed.** *Recommendation:* use it at build time to propose curation
   entries, after checking its license; never ship its data verbatim; keep `cite` on every entry.
4. **Commit the DB2 CSVs?** *Recommendation:* no (~30 MB per build, and they are re-downloadable); commit the hash
   manifest and the small Wowhead extract instead.
5. **R1/R3 items (no ItemSparse row, stub patterns of later-phase vanilla recipes):** future content or removed?
   *Recommendation:* exclude R1 and mark R3 vanilla `unconfirmed`; the release-day diff surfaces any that become
   real. Ask in the synthesis whether Forever has content phases at all.
6. **Unidentified stat IDs (83, 90, 112, 113, 124, 132) and stat 124's conflict with the enchant mapping.**
   *Recommendation:* block the build until each is mapped or explicitly ignored; resolve with tooltips of the 8
   affected items.
7. **`QualityModifier` on 23 items.** *Recommendation:* verify with their tooltips (all in the check set) before
   trusting their armor; until then flag them.
8. **Trainer learn skill is approximate** for 190 + 36 recipes. *Recommendation:* keep `approx: true` and the
   prototype's "~" display; curate exact values only where a source states them.
9. **Live product code and build discovery on 2026-11-05.** *Recommendation:* check wago.tools' product list the week
   before launch; keep the beta dataset folder name (`forever`) so user state carries over.
10. **Engineering "Tinker" spells** (3, Forever-new, enchant-like). *Recommendation:* add to the enchant records if
    they fit an equipment slot; otherwise leave for later.

## Decisions taken here

- Enumeration from `SkillLineAbility` + `SpellEffect` 24 for six crafting professions; Mining, Cooking, First Aid
  only for intermediates; no Jewelcrafting/Inscription (absent in this build).
- "No ItemSparse row" is the primary liveness filter; cosmetic subclass 5 is dropped; the rules R3–R8 classify the
  rest instead of skip lists.
- DPS: tables + rounding rule, `Flags_4` 0x100 → × 0.743, guns → TwoHand × 0.6; Wowhead is a check and icon source,
  not the DPS source.
- New stat IDs mapped (resistances); unknown IDs fail the build.
- Derived sources fix the prototype's pattern-bind bug ("none" = tradeable).
- Curation by ID in families; validation fails the build on dangling or duplicate keys.
- No scores in the data; the build report runs the theorycraft module for review.
- Generator in Node (CommonJS, zero dependencies); DB2 CSVs cached and hash-pinned, not committed; Wowhead extract
  committed.
