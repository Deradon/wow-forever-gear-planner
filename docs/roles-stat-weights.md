# Roles, stat weights and usability rules

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: theorycraft. Scope: who can wear what in WoW: Forever (classes, factions, armor/weapon proficiencies,
profession-bound gear), the role set the UI offers, stat weights per role and class, weapon valuation, and the
ranking rule that turns weights into a per-slot upgrade path for levels 1–60.

**These are leveling heuristics, not raid sims.** They answer "is this crafted piece a worthwhile upgrade for a
level-N Frost Mage" well enough to rank a few dozen candidates per slot. They do not model talents, rotations, hit
caps, buffs, or boss fights, and they will be wrong in edge cases. Users can override them (§4.6).

## 0. Evidence and labels

Every class or stat claim carries one of these labels:

- **[DB]** read from Forever's DB2 tables, build 1.60.1.70205 (wago.tools CSV exports, the same tables the prototype's
  generator already uses). The table and the query are named next to the claim.
- **[DB-Era]** the same query run on Classic Era 1.15.9.70003 for comparison (shows what Forever changed).
- **[DB+]** `ChrClasses`, `ChrRaces` and `CharBaseInfo` for build 1.60.1.70205. These three tables were not in the
  prototype's cache. I fetched them once from wago.tools for this document (one small network check, 2026-10-08).
  The pipeline should add them to its table list.
- **[WH]** Wowhead's Forever tooltip text, from the tooltip cache the prototype's generator already holds.
- **[Note]** the prototype's research notes (crafted gear, recipe sources, enchants, consumables). These are beta
  observations from 2026-10-06/07.
- **[V]** vanilla knowledge, **unverified for Forever**.
- **[H]** heuristic or design choice made here, with its reasoning.

Forever is a beta. Nothing here is Blizzard-confirmed, and everything tagged [DB] needs a re-check against the
release build (2026-11-05).

## 1. Classes, races and factions

### 1.1 Both factions get all nine classes [DB+]

`CharBaseInfo` (race × class pairs) and `ChrRaces.Alliance` (0 = Alliance, 1 = Horde) give this:

| Faction | Race (ChrRaces ID) | Classes |
|---|---|---|
| Alliance | Human (1) | Warrior, Paladin, Hunter, Rogue, Priest, Mage, Warlock |
| Alliance | Dwarf (3) | Warrior, Paladin, Hunter, Rogue, Priest, **Shaman** |
| Alliance | Night Elf (4) | Warrior, Hunter, Rogue, Priest, Druid |
| Alliance | Gnome (7) | Warrior, Rogue, Priest, Mage, Warlock |
| Alliance | High Order Skyborne (95, new) | Warrior, Hunter, Rogue, Mage, Druid |
| Horde | Orc (2) | Warrior, Hunter, Rogue, Shaman, Mage, Warlock |
| Horde | Undead (5) | Warrior, **Paladin**, Rogue, Priest, Mage, Warlock |
| Horde | Tauren (6) | Warrior, Hunter, Shaman, Druid |
| Horde | Troll (8) | Warrior, Hunter, Rogue, Priest, Shaman, Mage, Warlock |
| Horde | Windshaper Skyborne (96, new) | Warrior, Hunter, Rogue, Shaman, Druid |

- **The vanilla rule (Paladin Alliance-only, Shaman Horde-only) does not hold in Forever.** Dwarf Shaman
  (`CharBaseInfo` row 905) and Undead Paladin (row 877) exist in the data. So do Human Hunter, Gnome Priest, Troll
  Warlock and Orc Mage, which are combinations from later expansions.
- Two new races, the Skyborne, appear once per faction. Their racial skill line is `SkillLine` 2980; their mount
  skill is "Galestrider Riding" (3011).
- Data rows can exist without being playable at launch. Check the character-creation screen at release (Open
  question 1).
- **Consequence for the planner:** class and faction are independent inputs. The class list does not depend on the
  faction, and Shaman and Paladin data has to cover both sides.
- **Race is not an input.** No crafted item in the data is race-restricted (`ItemSparse.AllowableRace` is -1 or 0
  on all crafted equipment). Racial weapon bonuses are too small for a leveling heuristic.

### 1.2 Class facts the weights use [DB+]

`ChrClasses` columns:

| Class | RolesMask (2 tank, 4 heal, 8 dps) | AP per Str | AP per Agi | RAP per Agi | HasRelicSlot | ArmorTypeMask |
|---|---|---|---|---|---|---|
| Warrior | 10: tank, dps | 2 | 0 | 2 | 0 | 127: cloth, leather, mail, plate, shield |
| Paladin | 14: tank, heal, dps | 2 | 0 | 0 | 1 | 2303: cloth, leather, mail, plate, shield, libram |
| Hunter | 8: dps | 1 | 1 | 2 | 0 | 47: cloth, leather, mail |
| Rogue | 8: dps | 1 | 1 | 2 | 0 | 39: cloth, leather |
| Priest | 12: heal, dps | 1 | 0 | 0 | 0 | 35: cloth |
| Shaman | 12: heal, dps | 2 | 0 | 0 | 1 | 2671: cloth, leather, mail, shield, totem |
| Mage | 8: dps | 1 | 0 | 0 | 0 | 35: cloth |
| Warlock | 8: dps | 1 | 0 | 0 | 0 | 35: cloth |
| Druid | 14: tank, heal, dps | 2 | 0 | 0 | 1 | 2343: cloth, leather, idol |

- **ArmorTypeMask** is a bitmask over armor subclass IDs: bit 0 misc (held-in-hand, cloaks, rings), bit 1 cloth,
  bit 2 leather, bit 3 mail, bit 4 plate, bit 6 shield, bit 7 libram, bit 8 idol, bit 9 totem. Bit 5 and bit 11 are
  set on several classes and have no items in this range; ignore them. The planner should **use this mask directly
  as the armor rule** rather than a hand-written table. It gives the final proficiency, not the level it is learned
  at (§2.1).
- The druid's AP-per-Agi of 0 is the caster form. In vanilla, Cat Form adds 1 AP per Agility [V]. The feral
  weights below assume that.
- RolesMask confirms the role sets in §3. The one exception is that Shaman has no tank role.

## 2. Item usability

### 2.1 Armor by class and level

| Class | Cloth | Leather | Mail | Plate | Shield | Relic |
|---|---|---|---|---|---|---|
| Warrior | 1 | 1 | 1 | **40** [V] | 1 | – |
| Paladin | 1 | 1 | 1 | **40** [V] | 1 | Libram |
| Hunter | 1 | 1 | **40** [V] | – | – | – |
| Shaman | 1 | 1 | **40** [V] | – | 1 [V] | Totem |
| Druid | 1 | 1 | – | – | – | Idol |
| Rogue | 1 | 1 | – | – | – | – |
| Priest, Mage, Warlock | 1 | – | – | – | – | – |

- Who gets which armor type in the end is [DB]: `ChrClasses.ArmorTypeMask` above, and the class masks on the
  `SkillLineAbility` rows for Mail (spell 8737: Warrior, Paladin, Hunter, Shaman), Plate Mail (750: Warrior,
  Paladin) and Shield (9116: Warrior, Paladin, Shaman).
- **The level-40 gates are [V].** The DB cannot confirm them: the Mail and Plate rows are identical in Forever and in
  Classic Era (`AcquireMethod` 2, no `SpellLevels` row), and in Era the trainer gates them at 40. Forever adds an
  "Armor Proficiency" tooltip spell (1293712, all classes, a dummy effect that lists the known armor types). It
  looks like Retail, where Hunters and Shamans start in mail. **Assumption: mail and plate come at 40, as in
  vanilla.** Verify in game before release (Open question 2). The rule is one number per class in the JSON, so a
  correction costs nothing.
- Wearing a lower armor type is always allowed. The prototype already plans leather pieces for warriors and cloth
  shoulders for hunters. There is no armor-specialisation bonus in vanilla [V]. The armor weight (§4.4) is what makes
  the higher type win when the stats are equal.
- Cloaks (armor subclass 1, InventoryType 16) count as cloth, so **every class wears every cloak**. The prototype
  confirms this in game ([Note]: "cloaks count as cloth").
- Neck, finger and trinket slots, and held-in-off-hand items (InventoryType 23, armor subclass 0 "misc"): every
  class [DB: bit 0 is set for all classes].

### 2.2 Weapons by class [DB]

Source: the `SkillLineAbility` class masks for the weapon-proficiency spells (skill category 6). The item subclass
maps to the skill line like this: Axe 0→44, 2H Axe 1→172, Bow 2→45, Gun 3→46, Mace 4→54, 2H Mace 5→160, Polearm
6→229, Sword 7→43, 2H Sword 8→55, Staff 10→136, Fist 13→473, Dagger 15→173, Thrown 16→176, Crossbow 18→226,
Wand 19→228.

| Class | 1H | 2H | Ranged slot | Off hand |
|---|---|---|---|---|
| Warrior | Axe, Mace, Sword, Dagger, Fist | 2H Axe, 2H Mace, 2H Sword, Polearm, Staff | Bow, Gun, Crossbow, Thrown | Shield; 1H weapon from 20 [V] |
| Paladin | Axe, Mace, Sword | 2H Axe, 2H Mace, 2H Sword, Polearm | Libram (relic) | Shield, held item |
| Hunter | Axe, Sword, Dagger, Fist | 2H Axe, 2H Sword, Polearm, Staff | Bow, Gun, Crossbow, Thrown | 1H weapon from 20 [V], held item |
| Rogue | **Axe (new)**, Mace, Sword, Dagger, Fist | – | Bow, Gun, Crossbow, Thrown | 1H weapon from 10 [V], held item |
| Priest | Mace, Dagger | Staff | Wand | Held item |
| Shaman | Axe, Mace, Dagger, Fist | Staff; 2H Axe, 2H Mace (talent, see below) | Totem (relic) | Shield, held item |
| Mage | Sword, Dagger | Staff | Wand | Held item |
| Warlock | Sword, Dagger | Staff | Wand | Held item |
| Druid | Mace, Dagger, Fist | Staff, 2H Mace, Polearm | Idol (relic) | Held item |

What changed against Classic Era, from a diff of the same query on 1.15.9 [DB-Era]:

- **Rogues can use one-handed axes in Forever.** The One-Handed Axes row (spell 196) gained the Rogue bit. Era has
  Warrior, Paladin, Hunter, Shaman.
- **Shaman dual wield: assume no.** The Shaman row for Dual Wield (674) changed its `AcquireMethod` from 0 in Era
  (that row came from a Season of Discovery rune) to 3 in Forever. In Retail's enum, 3 means "never learned". The
  only spell that teaches it (413031) is in the SoD ID range, and SoD runes are not learnable in Forever ([Note],
  priest spells). Open question 3.
- **Druid feral has a new "Feral Combat" weapon skill line** (`SkillLine` 3014, spell 1306742, proficiency
  effects 25/60, druid only). What it does to the value of a weapon in forms is unknown. Open question 5.
- **Druid polearms** are in both Era and Forever data, although vanilla 1.12 druids could not train them [V]. Trust
  the data.
- **Shaman two-handed axes and maces:** the class mask allows them. In vanilla they came from an Enhancement talent
  (spell 16269 "Two-Handed Axes and Maces", still in the data). Forever reworked talents (milestones at 11/16/21/31
  per [Note], priest spells), so the planner offers a per-entry option "2H axes and maces" for Shaman. It defaults
  to on from level 20 for the melee role (§3.3).
- Wands: Priest, Mage, Warlock only ("Shoot", 5019). Druids cannot use wands ([Note] and [DB]).
- Bows, guns and crossbows for Warriors and Rogues are a pulling tool: a stat stick in the ranged slot (§4.5).
- **Weapon skills must be trained** at a weapon master in vanilla [V], e.g. polearms, or guns for races that don't
  start with them. The planner assumes every type the class allows is trained, and lists the type on the row so the
  user sees it. No per-entry "trained weapons" input in v1.

### 2.3 Dual wield and off hand

- Dual Wield (674) class mask: Warrior, Hunter, Rogue [DB]. Learn levels: Rogue 10, Warrior 20, Hunter 20 [V]. The
  prototype uses Rogue/Warrior/Hunter, with Hunters at 20.
- A One-Hand item (InventoryType 13) fits the off hand only for a dual-wielder at or above that level. Main Hand
  items (21) never go in the off hand, and Off Hand weapons (22) only for dual-wielders.
- Shields (InventoryType 14, armor subclass 6): Warrior, Paladin, Shaman.
- Held-in-off-hand items (23): everyone. In practice only casters and healers value them.
- A two-hand item fills both hands. The ranking compares weapon **sets**, not slots (§6.3).

### 2.4 Relics [DB]

Forever has relics. `Item` has subclass 7 Libram (40 items), 8 Idol (45) and 9 Totem (47), all InventoryType 28.
They go in the ranged slot of Paladins, Druids and Shamans (`ChrClasses.HasRelicSlot`). The crafted ones up to 60
are all Enchanting and **BoP**, class-restricted by `ItemSparse.AllowableClass`:

| Item | ID | Class | Req | Effect |
|---|---|---|---|---|
| Tenets of the Silver Hand | 249397 | Paladin | 20 | (effect not read here) |
| Mystic Mushroom | 249396 | Druid | 20 | +5% Spirit [Note] |
| Polished Driftwood Icon | 249398 | Shaman | 20 | 8% mana regen while casting [Note] |
| Talons of Wrath | 249441 | Druid | 40 | (effect not read here) |

Only an **enchanter of that class** can use them. Relic effects are spell effects, not item stats, so stat weights
cannot score them (§6.5, effect overrides).

### 2.5 Other restrictions the candidate filter must apply [DB]

- **Class masks on items.** `ItemSparse.AllowableClass` AND the class bit (Warrior 1, Paladin 2, Hunter 4, Rogue 8,
  Priest 16, Shaman 64, Mage 128, Warlock 256, Druid 1024). Use bitwise AND, not equality: masks carry bits for
  classes Forever does not have. Examples among crafted items up to 60: Wolfshead Helm (32256 → Druid), Robe of the
  Archmage (31360 → Mage), Gloves of Spell Mastery (31632 → Priest, Mage, Warlock), the new Cloak of Earth and Sky
  (1088 → Druid, Shaman), and the four relics.
- **Profession skill to equip.** `ItemSparse.RequiredSkill`/`RequiredSkillRank`. Applies to about 40 crafted items
  up to 60, almost all Engineering (goggles, Goblin Rocket Helmet, Gnomish devices, the new Forever belts and
  goggles at 30 and 40), plus the Alchemist's Stone (Alchemy 275) and the new Mithril/Arcanite Blacksmith Hammers
  (Blacksmithing). These need the skill **to wear or use**, whatever
  their binding. So a BoE goggle is still only for an engineer.
- **Bind.** `ItemSparse.Bonding`: 1 BoP, 2 BoE, 3 bind-on-use, 0 none.

## 3. Roles

### 3.1 The fixed role set

The UI offers five user-facing roles, the IDs the product draft assumes. Internally, "melee" splits into two
weight profiles by class, so no user ever has to pick Strength vs Agility:

| Role ID (UI) | Label | Weight profile | Classes |
|---|---|---|---|
| `melee` | Melee | `melee-str` | Warrior, Paladin, Shaman, Druid (Cat) |
| `melee` | Melee | `melee-agi` | Rogue |
| `ranged` | Ranged | `ranged-agi` | Hunter |
| `caster` | Caster DPS | `caster` | Priest, Shaman, Mage, Warlock, Druid |
| `healer` | Healer | `healer` | Priest, Paladin, Shaman, Druid |
| `tank` | Tank | `tank` | Warrior, Paladin, Druid (Bear) |

### 3.2 Roles per class and defaults

| Class | Roles (first = default) | Options shown | Why this default [H] |
|---|---|---|---|
| Warrior | melee, tank | – | Arms/Fury 2H leveling |
| Paladin | melee, healer, tank | – | Ret leveling. Healers pick it themselves |
| Hunter | ranged | – | Only one role |
| Rogue | melee | – | Only one role |
| Priest | caster, healer | School: Shadow / Holy (caster) | Shadow is the usual leveling spec |
| Shaman | melee, caster, healer | 2H axes & maces (melee) | Enhancement leveling |
| Mage | caster | School: Frost / Fire / Arcane | Frost is the usual leveling spec |
| Warlock | caster | School: Shadow / Fire | Affliction/Shadow Bolt leveling |
| Druid | melee, caster, tank, healer | – | Cat leveling |

- **Druid has four roles.** The product draft assumes at most three per class. Allow four; the role list is data.
- The UI should make role a required pick when an entry is created. The default only preselects. A caster druid
  forced into Cat weights would get bad advice silently.
- **School instead of "Any".** The UI draft shows a school select defaulting to "Any". I recommend a per-class
  default school (Frost, Shadow, Shadow) with an explicit "Mixed" choice that splits the shares evenly. "Any" would
  either undervalue every school piece or overvalue all of them (Open question 8).

### 3.3 Class options

| Option | Classes | Values | Effect |
|---|---|---|---|
| `school` | Mage (caster), Warlock (caster), Priest (caster) | see §4.3 | School-damage shares |
| `twoHand` | Shaman (melee) | on/off, default on from 20 | Allows 2H Axe and 2H Mace |

Healer and tank roles have no options. Rogue dagger vs sword preference is not modelled in v1 (Open question 10).

## 4. Stat weights

### 4.1 Stat keys

These extend the prototype's STAT map in the generator. IDs are `ItemSparse.StatModifier_bonusStat_N`.

| ID | Key | Meaning | Seen on crafted equipment ≤ 60 [DB] |
|---|---|---|---|
| 3, 4, 5, 6, 7 | Agi, Str, Int, Spi, Sta | Primary stats | 223, 302, 370, 266, 755 items |
| 45 | SP | **Spell Power: damage and healing.** Tooltip: "Increases damage and healing done by magical spells and effects by up to N" ([WH], Green Woolen Vest) | 302 |
| 41 | Heal | Healing only. Truefaith Gloves "healing … up to 15" ([WH]; [DB] stat 41 = 15) | 121 |
| 42 | SpellDmg | Damage only, all schools ([WH] Truefaith "… and damage done by up to 5" = stat 42) | 123 |
| 84–89 | HolyDmg, FireDmg, NatureDmg, FrostDmg, ShadowDmg, ArcaneDmg | Damage of one school ([WH] Hands of Darkness "damage done by Shadow spells") | 17–36 each (Nature 4) |
| 38, 39 | AP, RAP | Attack power (melee + ranged), ranged attack power | 30, 6 |
| 31, 32 | Hit, Crit | Ratings. Moonsight Rifle's Hit 3 shows as "+0.3%" ([WH], req 24) | 27, 44 |
| 36, 37 | Haste, Expertise | Ratings, rare (3 and 8 items across all equipment ≤ 60) | – |
| 43, 46 | MP5, HP5 | Mana and health per 5 seconds | 4, – |
| 12, 13, 14, 15, 48 | Def, Dodge, Parry, Block, BlockValue | Tank stats. 15 may be block chance or value (verify) | 44, 11, 4, 3, – |
| 47 | SpellPen | Spell penetration | – |
| 50 | Armor | Bonus armor | 37 |
| 51–56 | FireRes, FrostRes, HolyRes, ShadowRes, NatureRes, ArcaneRes | Resistances (Retail enum, verify 53) | 62, 39, –, 35, 61, 18 |
| others | `Stat<ID>` | 83, 90, 112, 113, 124, 132 …: profession-skill bonuses and other one-offs (Herbalist's Gloves, Goblin Mining Helmet) | weight 0, shown raw |

The pipeline owns this mapping. These keys are what the weights JSON refers to. Item armor (from the armor tables)
and stat 50 both go into `Armor`.

### 4.2 Weights per profile

1.0 is one point of the profile's main stat. Rating stats marked * scale with level (§4.4).

| Stat | melee-str | melee-agi | ranged-agi | caster | healer | tank |
|---|---|---|---|---|---|---|
| Str | **1.0** | 0.55 | 0.05 | 0 | 0 | 0.5 |
| Agi | 0.6 | **1.0** | **1.0** | 0 | 0 | 0.6 |
| Sta | 0.6 | 0.6 | 0.6 | 0.5 | 0.5 | **1.0** |
| Int | 0 | 0 | 0.35 | 0.7 | 0.8 | 0 |
| Spi | 0.05 | 0.05 | 0.1 | 0.5 | 0.6 | 0.05 |
| AP | 0.5 | 0.55 | 0.1 | 0 | 0 | 0.25 |
| RAP | 0 | 0 | 0.5 | 0 | 0 | 0 |
| SP | 0 | 0 | 0 | **1.0** | **1.0** | 0 |
| SpellDmg | 0 | 0 | 0 | 1.0 | 0.2 | 0 |
| Heal | 0 | 0 | 0 | 0.05 | 0.8 | 0 |
| School (each) | 0 | 0 | 0 | share × 1.0 | share × 0.2 | 0 |
| MP5 | 0 | 0 | 0.6 | 1.2 | 1.5 | 0 |
| HP5 | 0.3 | 0.3 | 0.2 | 0.1 | 0.1 | 0.3 |
| Crit* | 1.0 | 1.0 | 1.0 | 0.4 | 0.4 | 0.2 |
| Hit* | 1.0 | 1.1 | 1.0 | 0.4 | 0 | 0.6 |
| Haste* | 0.8 | 0.8 | 0.6 | 0.6 | 0.6 | 0.3 |
| Expertise* | 0.8 | 0.8 | 0 | 0 | 0 | 0.6 |
| Def | 0.1 | 0.1 | 0.05 | 0 | 0 | 1.0 |
| Dodge, Parry | 0.3, 0.2 | 0.3, 0.2 | 0.2, 0 | 0 | 0 | 1.0, 0.9 |
| Block, BlockValue | 0 | 0 | 0 | 0 | 0 | 0.7, 0.3 |
| SpellPen | 0 | 0 | 0 | 0.1 | 0 | 0 |
| Armor (per point) | 0.02 | 0.02 | 0.02 | 0.015 | 0.015 | 0.05 |
| Resistances | 0 | 0 | 0 | 0 | 0 | 0 |

Per-class tweaks override single cells:

| Class / profile | Tweaks | Reason |
|---|---|---|
| Warrior melee-str | Spi 0 | Spirit is only out-of-combat health regen [V] |
| Paladin melee-str | Agi 0.5, Int 0.3, Spi 0.2, SP 0.3, HolyDmg 0.3, MP5 0.5, Crit 0.8 | Mana-limited. Seals and Exorcism scale with holy spell damage [V]. Golden Iron Destroyer (Str 11, SP 4) is itemised for this |
| Shaman melee-str | Agi 0.5, Int 0.3, Spi 0.1, SP 0.25, NatureDmg 0.15, FireDmg 0.1, FrostDmg 0.05, MP5 0.5 | Shocks and totems use spell power [V] |
| Druid melee-str (Cat) | Agi 0.9, Int 0.15, Spi 0.1 | Cat Form: 2 AP per Str [DB+], 1 AP per Agi plus crit [V]. Weapon term 0 (§4.5) |
| Druid tank (Bear) | Agi 0.8, Parry 0, Block 0, BlockValue 0, Def 0.5 | Bears can't parry or block [V]. Agility gives armor and dodge |
| Paladin tank | Int 0.2, SP 0.2, HolyDmg 0.2 | Holy threat [V] |
| Rogue melee-agi | (profile as is) | ChrClasses: 1 AP per Str and per Agi [DB+], so Str ≈ AP, Agi on top gives crit |
| Hunter ranged-agi | melee weapon term 0 | Melee weapons are stat sticks (§4.5) |
| Priest caster | SpellDmg 0.95, Heal 0.15, Spi 0.6 | Self-heals; Spirit Tap / Spirit regen [V] |
| Mage caster | Int 0.75, Spi 0.55 | Mana-hungry AoE leveling, good Spirit regen [V] |
| Warlock caster | Spi 0.25, Sta 0.7 | Life Tap turns health into mana; low Spirit regen [V] |
| Druid caster, Shaman caster | SpellDmg 0.95, Heal 0.15, Spi 0.5 / 0.3 | Self-heals |
| Paladin, Priest healer | HolyDmg share 1.0 (× 0.2) | Smite, Holy Fire, Exorcism, Holy Shock while soloing |
| Druid, Shaman healer | NatureDmg share 1.0 (× 0.2) | Wrath, Lightning Bolt while soloing |

How the numbers were chosen [H]:

- **melee-str:** Warrior and Paladin get 2 AP per Str [DB+], so AP = 0.5 Str. In vanilla, Agility gives crit
  (1% per ~20 Agi at 60 for warriors), 2 armor and dodge [V], so about 0.6. The prototype used Agi 0.7 for
  smiths.
- **melee-agi:** Rogues get 1 AP per Str and 1 per Agi [DB+]. Agility adds crit on top, so Str ≈ AP ≈ 0.55. The
  prototype's rogue Str was 0.7, a little high given the data.
- **ranged-agi:** Hunters get 2 RAP per Agi [DB+], so RAP = 0.5 Agi. The pet scales with the hunter's gear in
  Forever ([Note], hunter pets), which reinforces Agi and RAP. Int keeps the mana bar alive while leveling.
- **caster:** SP and SpellDmg are equal for pure DPS; SP's healing half is worth almost nothing to a Mage. Int at
  0.7 and Spi at 0.5 reflect that leveling is limited by mana and downtime, not by burst. MP5 works while
  casting, so 1 MP5 > 1 Spi [V]. The prototype used SP 1, Int 0.8, Spi 0.5, SpellDmg 0.9; the numbers here keep its
  shape.
- **healer:** a leveling healer also solos. SP (heal + damage) is the best stat. Heal-only stays at 0.8 because,
  in dungeons, the healing half is what counts. Damage-only drops to 0.2.
- **tank:** effective health first (Sta, Armor, Def, avoidance), threat second (Str, AP, Hit).

Example (caster, Frost Mage at 20): Silky Gloves (Int 3, Sta 4, Frost 7) = 2.25 + 2 + 5.95 = **10.2**. Gloves of
Meditation (Spi 7, SP 5) = 3.85 + 5 = 8.9. Heavy Woolen Gloves (Int 2, SP 2) = 3.5. For a Fire Mage the Silky
Gloves drop to 4.8. That matches the prototype's hand-made choice (a Frost BoP set for a Frost Mage).

### 4.3 School shares

The weight of a school-damage stat is `share(school) × weight(SpellDmg)` for the profile. Shares are the fraction of
the role's spell damage done in that school while leveling [V/H]:

| Class, option | Holy | Fire | Nature | Frost | Shadow | Arcane |
|---|---|---|---|---|---|---|
| Mage, Frost (default) | | 0.08 | | **0.85** | | 0.07 |
| Mage, Fire | | **0.85** | | 0.08 | | 0.07 |
| Mage, Arcane | | 0.15 | | 0.15 | | **0.7** |
| Warlock, Shadow (default) | | 0.2 | | | **0.8** | |
| Warlock, Fire | | **0.7** | | | 0.3 | |
| Priest caster, Shadow (default) | 0.2 | | | | **0.8** | |
| Priest caster, Holy | **0.7** | | | | 0.3 | |
| Druid caster | | | **0.6** | | | 0.4 |
| Shaman caster | | 0.2 | **0.75** | 0.05 | | |
| "Mixed" (any class) | even split over the class's schools | | | | | |

Forever's new BoP cloth comes in one family per school (Silky = Frost, Flame = Fire, Pearly = Arcane, Shadow,
Shining = Holy, Pristine = healing [Note]). The school share is what picks the right family for a roster entry.

### 4.4 Level scaling, armor and stamina

- **Ratings scale with level** [H]. One rating point is a fixed percentage (Hit 3 = 0.3% on a req-24 item [WH]; one
  data point, assumed constant). A percent of crit or hit is worth a percent of your damage, and your damage grows
  with level much faster than the damage one primary stat adds. Rough check for a warrior: at 10, 0.1% crit is
  about 0.1 Str of value; at 30 about 0.3; at 60 about 1.0. So the starred weights are multiplied by
  `max(0.25, L / 60)`, where L is the level the piece is worn from. Avoidance ratings (Dodge, Parry, Block) are
  not scaled: their value is relative to health, which scales too.
- **Armor** [H]: vanilla mitigation is `armor / (armor + 400 + 85 × attackerLevel)` [V]. At level 20 with ~500
  armor, one armor point is worth about 0.025 Stamina of effective health; at 60 with ~3000 armor, about 0.045.
  With Sta at 0.6, that is 0.015–0.027 per armor point. Keep **0.02** for physical profiles (the prototype's value),
  0.015 for casters (hit less often while leveling), **0.05** for tanks. Armor mostly decides cloth vs leather vs
  mail when the stats are equal. It is what makes a Hunter switch to mail at 40 and a caster Druid take leather
  over cloth ([Note]: "leather has more armor at the same stats").
- **Stamina** [H]: 0.5–0.6 for every damage profile. While leveling, health is downtime: a dead or drinking
  character earns no XP. Tanks 1.0. Warlocks 0.7 (Life Tap).
- **Resistances and Defense** stay 0 (Def 0.1) outside the tank profile. Leveling content doesn't need them.

### 4.5 Weapon valuation

The prototype's rule: **1 weapon DPS = 14 AP** (vanilla: AP / 14 = bonus DPS [V]), and a flat "+N damage" on a
weapon of speed s is worth N / s DPS. It pinned the 2H damage enchant at 2.5 points per +1. Generalised:

```
weaponTerm(item, slot) =
  melee main hand or 2H : DPS × 14 × w.AP  × mh    × (1 + speed × specials / 60)
  melee off-hand weapon : DPS × 14 × w.AP  × 0.5
  bow / gun / crossbow / thrown : DPS × 14 × w.RAP × ranged × (1 + speed × specials / 60)
  wand                  : DPS × wand
```

- `specials` is the number of instant attacks per minute that add weapon damage (in vanilla, abilities use the
  weapon's real speed, not a normalised one [V]). It makes slow weapons win for the classes that want them,
  without a separate speed rule. With +N damage per swing valued as `N / speed` DPS, the prototype's enchant
  scoring falls out of the same formula: for a 3.5-speed 2H warrior, 0.5 × 14 / 3.5 × (1 + 3.5 × 8 / 60) = 2.9 per
  point, close to the prototype's pinned 2.5.
- The off hand deals 50% damage [V]; no specials.

| Class / profile | mh | specials | ranged | wand | Notes |
|---|---|---|---|---|---|
| Warrior melee-str | 1.0 | 8 | 0.05 | – | Heroic Strike, Mortal Strike, Overpower, Slam [V] |
| Paladin melee-str | 1.0 | 4 | – | – | Seal procs favour slow weapons [V] |
| Shaman melee-str | 1.0 | 4 | – | – | Windfury, Stormstrike [V] |
| Rogue melee-agi | 1.0 | 10 | 0.05 | – | Sinister Strike / Backstab are main-hand only [V] |
| Druid melee-str, tank | **0** | – | – | – | Form attacks ignore the weapon [V]; weapon is a stat stick. Open question 5 |
| Hunter ranged-agi | **0** (melee) | – | 1.0 | – | specials 3 for the ranged weapon (Aimed, Multi-Shot); melee weapons are stat sticks |
| Warrior, Paladin tank | 0.5 | 4 | 0.05 (Warrior) | – | Threat, not damage |
| Priest caster/healer | 0 | – | – | **1.0** | Wanding finishes mobs; Shadow priests wand a lot [V] |
| Warlock caster | 0 | – | – | **1.0** | |
| Mage caster | 0 | – | – | **0.6** | Mages wand less |
| Every caster/healer | 0 | – | – | – | Melee weapons, staves, off-hands are stat sticks |

Scale check (warrior at 20–22): Bronze Battle Axe (18.4 DPS, 3.3, Str 10) = 128.8 × 1.44 + 10 = **196**. Bronze
Warhammer (16.8, 3.5, Str 6, Sta 6) = 117.6 × 1.47 + 9.6 = 182. One DPS is worth about 10 Str, so for melee the
weapon dominates the plan, as it should while leveling. A wand at 11 DPS for a priest is worth 11 SP.

- Weapon DPS must be the corrected DPS. The prototype overrides the damage tables with Wowhead's Forever tooltip,
  because some weapons (`ItemSparse.Flags_4` & 0x300) deal ~26% less than the tables say [Note].
- **1 DPS = 14 AP is [V]**. Forever runs on a Retail-based engine, where the divisor differs. Verify on a
  character sheet (Open question 4).

### 4.6 User overrides

**Recommendation: per roster entry, sparse overrides on top of the profile, behind an "Advanced" toggle.**

- Stored as `weights: {"Spi": 0.8}` on the roster entry. Only changed keys are saved, so a later data update to a
  profile still reaches every key the user didn't touch.
- The editor lists the profile's non-zero stats with their effective value (profile ⊕ class tweak ⊕ school ⊕
  override). Each row has a number field and a reset. A "Reset all" restores the profile.
- Why per entry, not per role: two Frost Mages on one roster are the same, but a Holy Paladin in dungeons and a
  Holy Paladin soloing are not. The override belongs to the character.
- Why not formulas or caps: they break the "first answer in a minute" goal and can't be explained in a tooltip.
- An imported Pawn-style string is a later option (Open question 9).
- Changing role or school keeps the overrides but shows a "custom weights" badge, so the user knows the result is
  not the default.

### 4.7 The JSON the app consumes

Shipped as a static script (`roles.js` setting `window.GEAR_ROLES`) so it works from `file://`, with no fetch. The
pipeline does not generate it; it is hand-maintained and versioned with the build key.

```json
{
  "schema": 1,
  "build": "1.60.1.70205",
  "levelScaled": ["Crit", "Hit", "Haste", "Expertise"],
  "levelScale": { "ref": 60, "floor": 0.25 },
  "apPerDps": 14,
  "offHandFactor": 0.5,
  "profiles": {
    "melee-str": {
      "weights": { "Str": 1, "Agi": 0.6, "Sta": 0.6, "Spi": 0.05, "AP": 0.5, "HP5": 0.3, "Crit": 1, "Hit": 1,
                   "Haste": 0.8, "Expertise": 0.8, "Def": 0.1, "Dodge": 0.3, "Parry": 0.2, "Armor": 0.02 },
      "weapon": { "mh": 1, "specials": 4, "ranged": 0, "wand": 0 }
    },
    "caster": {
      "weights": { "SP": 1, "SpellDmg": 1, "Heal": 0.05, "Int": 0.7, "Spi": 0.5, "Sta": 0.5, "MP5": 1.2,
                   "HP5": 0.1, "Crit": 0.4, "Hit": 0.4, "Haste": 0.6, "SpellPen": 0.1, "Armor": 0.015 },
      "schoolBase": "SpellDmg",
      "weapon": { "mh": 0, "ranged": 0, "wand": 0 }
    }
  },
  "roles": {
    "melee":  { "label": "Melee" },
    "ranged": { "label": "Ranged" },
    "caster": { "label": "Caster DPS" },
    "healer": { "label": "Healer" },
    "tank":   { "label": "Tank" }
  },
  "classes": {
    "Mage": {
      "id": 8, "bit": 128,
      "roles": [ { "role": "caster", "profile": "caster",
                   "tweaks": { "Int": 0.75, "Spi": 0.55 },
                   "weapon": { "wand": 0.6 },
                   "options": { "school": { "default": "frost", "choices": {
                     "frost":  { "FrostDmg": 0.85, "FireDmg": 0.08, "ArcaneDmg": 0.07 },
                     "fire":   { "FireDmg": 0.85, "FrostDmg": 0.08, "ArcaneDmg": 0.07 },
                     "arcane": { "ArcaneDmg": 0.7, "FireDmg": 0.15, "FrostDmg": 0.15 },
                     "mixed":  { "FrostDmg": 0.34, "FireDmg": 0.33, "ArcaneDmg": 0.33 } } } } } ],
      "armor": { "Cloth": 1 },
      "weapons": { "Sword": 1, "Dagger": 1, "Staff": 1, "Wand": 1 },
      "offHand": { "Held": 1 },
      "dualWield": null, "shield": null, "relic": null
    },
    "Hunter": {
      "id": 3, "bit": 4,
      "roles": [ { "role": "ranged", "profile": "ranged-agi", "weapon": { "mh": 0, "ranged": 1, "specials": 3 } } ],
      "armor": { "Cloth": 1, "Leather": 1, "Mail": 40 },
      "weapons": { "Axe": 1, "Sword": 1, "Dagger": 1, "Fist": 1, "2H Axe": 1, "2H Sword": 1, "Polearm": 1,
                   "Staff": 1, "Bow": 1, "Gun": 1, "Crossbow": 1, "Thrown": 1 },
      "offHand": { "Held": 1 },
      "dualWield": 20, "shield": null, "relic": null
    },
    "Shaman": {
      "id": 7, "bit": 64,
      "roles": [
        { "role": "melee", "profile": "melee-str",
          "tweaks": { "Agi": 0.5, "Int": 0.3, "Spi": 0.1, "SP": 0.25, "NatureDmg": 0.15, "FireDmg": 0.1,
                      "FrostDmg": 0.05, "MP5": 0.5 },
          "options": { "twoHand": { "default": true, "from": 20, "adds": ["2H Axe", "2H Mace"] } } },
        { "role": "caster", "profile": "caster", "tweaks": { "SpellDmg": 0.95, "Heal": 0.15, "Spi": 0.3 },
          "schools": { "NatureDmg": 0.75, "FireDmg": 0.2, "FrostDmg": 0.05 } },
        { "role": "healer", "profile": "healer", "schools": { "NatureDmg": 1 } } ],
      "armor": { "Cloth": 1, "Leather": 1, "Mail": 40 },
      "weapons": { "Axe": 1, "Mace": 1, "Dagger": 1, "Fist": 1, "Staff": 1 },
      "offHand": { "Held": 1, "Shield": 1 },
      "dualWield": null, "shield": 1, "relic": "Totem"
    }
  },
  "baseline": { "quality": 2, "ilvlOffset": 0, "efficiency": 0.5 },
  "worth": {
    "minGainAbs": 1.0, "minGainRel": 0.08,
    "tierCap": { "cheap": 1500, "mid": 5000 }, "tierScale": { "fromLevel": 20, "power": 2 },
    "keepMin": { "cheap": 3, "mid": 5, "keeper": 8 },
    "laterMax": 5, "horizon": 10, "planEnd": 60
  }
}
```

Rules for the consumer:

- **Effective weights** for an entry = `profiles[p].weights` ⊕ `classes[c].roles[r].tweaks` ⊕ school shares
  (each share × the profile's `schoolBase` weight; healer `schoolBase` is SpellDmg at 0.2) ⊕ `entry.weights`
  overrides. `⊕` means "later wins per key". Missing keys are 0.
- **Numbers in `armor`, `weapons`, `offHand`, `dualWield`, `shield`** are the level the proficiency starts. `null`
  means never. One number per fact makes the [V] level gates trivial to correct.
- The game IDs in `classes[].id` and `bit` are `ChrClasses.ID` and the `AllowableClass` bit, so the candidate
  filter can AND item masks directly.

## 5. Professions and profession-bound gear

### 5.1 Professions in Forever [DB]

Primary professions (`SkillLine` category 11): Alchemy, Blacksmithing, Enchanting, Engineering, Herbalism,
Leatherworking, Mining, Skinning, Tailoring. There is no Jewelcrafting or Inscription. Cooking, First Aid and
Fishing are secondary (category 9) and make no equipment.

### 5.2 BoP and skill-locked equipment, by profession [DB]

Crafted equipment = items created by a profession recipe spell (`SpellEffect` effect 24 for a spell in that
profession's `SkillLineAbility`), Item class 2/4, wearable slot. Counts by `Bonding`, grouped by required level:

| Profession | BoE (1–9 / 10s / 20s / 30s / 40s / 50s / 60) | BoP (10s / 20s / 30s / 40s / 50s / 60) | Wearer rule |
|---|---|---|---|
| Tailoring | 27 / 18 / 22 / 39 / 37 / 58 / 19 | 26 / 30 / 12 / 24 / 15 / – | BoP: tailor only |
| Leatherworking | 34 / 24 / 25 / 41 / 43 / 117 / 29 | 28 / 30 / 14 / 36 / 18 / – | BoP: leatherworker only |
| Blacksmithing | 24 / 19 / 35 / 37 / 54 / 74 / 33 | 24 / 25 / 11 / 21 / 20 / – | BoP: smith only |
| Engineering | 27 / 2 / 2 / 4 / 3 / 8 / 5 | 8 at 1–9, then 1 / 1 / 3 / 5 / 1 / 1 | BoP: engineer only. **Plus ~40 items that need Engineering skill to wear, BoE or not** (goggles, helmets, Gnomish devices) |
| Enchanting | 15 BoE (wands, rods) | – / 7 / – / 7 / 6 / 1 (staves, orbs, relics, Sigil) | BoP: enchanter only; relics also class-locked |
| Alchemy | – | Alchemist's Stone (45, Alchemy 275) | Alchemist only |

- **Forever adds BoP crafted gear at every level band**, not only at 60 as vanilla mostly did. These are the new
  per-school cloth families, Trapper's/Brawler's leather and Veteran's mail ([Note]). The rule "a BoP piece is a
  candidate only for a roster entry that has the profession" therefore matters from level 10 on.
- A BoP candidate also needs the wearer to reach the recipe skill in time. That is the crafter-pace question (§6.4,
  other role's area).

### 5.3 Specialisations [DB]

Recipe items (`Item` class 9) carry `ItemSparse.RequiredAbility`:

| Profession | Specialisations (spell IDs) | Gated recipes | Produced items: req level, bind |
|---|---|---|---|
| Blacksmithing | Armorsmith (9788), Weaponsmith (9787) → Master Swordsmith (17039), Master Axesmith (17041), Master Hammersmith (17040) | 25 Armorsmith, 5 Weaponsmith, 10 / 6 / 8 Master | 50–60, BoE except Corruption (BoP) |
| Leatherworking | Dragonscale (10656), Elemental (10658), Tribal (10660) | 20, 19, 22 | 47–60, BoE |
| Engineering | Gnomish Engineer (20219), Goblin Engineer (20222) | 4 and 2 recipe items (most Gnomish/Goblin devices are trainer-gated in vanilla, so the data undercounts) [V] | gadgets, mostly level 0 |
| Tailoring | **none** in Forever data (no Mooncloth/Shadoweave/Spellfire spells) | – | – |

Era has the same set with slightly more gated recipes (Armorsmith 33, Dragonscale 25, …) [DB-Era]. The prototype's
recipe note agrees: "Specialisations … are still in the client but unchanged and post-30".

**What the UI must ask:**

- Per roster entry with Blacksmithing, Leatherworking or Engineering, a specialisation select (`none` + the options
  above), and for Weaponsmiths the master choice. Show it only once the entry's level is ≥ 40 or its skill ≥ 200.
  That is where vanilla opens the specialisation quests [V], and every gated recipe in the data yields an item at
  req 47+.
- **Specialisation decides what a crafter can make, almost never who can wear it**: nearly all gated outputs are
  BoE, so a wearer without the spec still gets them from a roster crafter who has it, or from the AH.

### 5.4 Suggested professions per class (optional hints only) [H]

| Class | Suggestion | Why |
|---|---|---|
| Warrior, Paladin | Mining + Blacksmithing | Own BoP Veteran's mail from 12, 2H weapons, later plate |
| Hunter | Skinning + Leatherworking | BoP Trapper's leather from 12. Engineering (guns, scopes) is the alternative |
| Rogue | Skinning + Leatherworking | BoP Brawler's (Agi/Str/Sta) is only open to a leatherworker |
| Druid | Skinning + Leatherworking (Cat/Bear), Tailoring + Enchanting (caster) | Enchanting adds the druid-only idols (BoP) |
| Shaman | Skinning + Leatherworking | Leather until 40, then Elemental/Tribal mail. Enchanting adds the shaman totem |
| Priest, Mage, Warlock | Tailoring + Enchanting | BoP school cloth, enchanted wands, BoP staves and orbs at 25 |
| Anyone wanting a head slot early | Engineering | Goggles fill the head slot from the 20s but need Engineering to wear |

Present these as a hint under the profession select, never as a filter.

## 6. Ranking: from weights to a per-slot plan

### 6.1 Candidate filter (per roster entry e, level ℓ)

An item i is a candidate for e at ℓ if all of these hold:

1. `i.reqLevel ≤ ℓ`; for an item usable "later", see `laterMax`.
2. **Armor/weapon proficiency**: e's class has i's subclass with start level ≤ ℓ (§2.1, §2.2), including the
   option `twoHand` and the dual-wield level for one-hand items in the off hand.
3. `i.allowableClass & classBit ≠ 0` (or the mask is −1/0).
4. **Profession locks**: if i is BoP, e has i's profession. If i has `requiredSkill`, e has that profession (at
   that rank by ℓ, from the pace model or the entry's skill input).
5. **Faction**: at least one of i's sources is available to e's faction, or the item comes from the AH (§7).
6. Not hidden by the user.

### 6.2 Score

```
score(i | e, ℓ) = Σ_k  w_k(e) × levelScale_k(ℓ) × stat_k(i)
               + w_Armor(e) × armor(i)
               + weaponTerm(i | e, slot)              (§4.5)
               + effect(i)                            (curated, §6.5; default 0)
levelScale_k(ℓ) = max(floor, ℓ / ref) for k in levelScaled, else 1
```

The pipeline may precompute the role-independent parts (stats, armor, DPS, speed). Scores are computed in the
browser per entry, because overrides and options are per entry.

### 6.3 Slot groups

- One group per armor slot. Two finger slots and two trinket slots take the best two distinct items
  (unique-equipped).
- **Weapons as sets**: for each level, the best of {2H}, {MH + shield}, {MH + held}, {MH + off-hand weapon (if
  dual-wielding)}, {1H + 1H (dual wield)}. A set scores its parts. The off-hand weapon uses the 0.5 factor, and a
  shield adds its armor and Block stats (its armor weight is what makes tanks take one). This replaces the
  prototype's "the 2H weapon fills the off hand".
- Ranged slot: weapon, wand or relic by class.

### 6.4 The path: when an upgrade is worth it

The prototype's enchant rules already decide "worth it" by spend tier and how long a piece is kept. Applied to
items:

1. **Envelope.** For each slot group and each level ℓ from the entry's level to 60, take the best candidate by
   score. This gives a step function of "best available" pieces.
2. **Baseline.** Compare against a **par item**, not against an empty slot: a virtual green of item level ℓ with
   `efficiency × RandPropPoints[ℓ][Good][slot]` points spread over the profile's two best primary stats. 0.5 is a
   quest reward with mediocre stats. Levels where the best candidate does not beat par drop out. This removes the
   "+1 stat green at level 6" noise without a hand-written "below 10, skip" rule, because the par item rises with
   level just as quest rewards do. The prototype has no baseline (it compares crafted pieces only) and used its
   notes for this instead.
3. **Minimum gain.** Step from piece A to piece B only if `score(B) ≥ score(A) + max(minGainAbs, minGainRel ×
   score(A))` (1 point or 8%).
4. **Keep-for-N.** For each step, `kept = next step's level − this step's level` (∞ for the last). Spend tier by the
   piece's cost (mats at current prices, else AH value): cheap < `tierCap.cheap × m(ℓ)`, mid < `tierCap.mid ×
   m(ℓ)`, keeper above. A piece is worth it if `kept ≥ keepMin[tier]` (3 / 5 / 8 levels, the prototype's numbers).
   `m(ℓ) = max(1, (ℓ / 20)²)` scales the prototype's 15s / 50s caps (set for levels 1–30) to 1–60. At 40 that is
   60s / 2g; at 60, 1g35s / 4g50s. Remove failing steps, extend the predecessor's span, and repeat until nothing
   changes. Removing a step lengthens its neighbours' spans, so this converges.
5. **Later option.** A piece usable up to `laterMax` (5) levels ahead may displace the current choice when
   `score × span` over the next `horizon` (10) levels is higher. This is the prototype's `span()` rule, with
   `planEnd` 60 instead of 30.
6. **Core flag.** A step is "core" when its gain is ≥ 25% over the previous piece and it is kept ≥ 5 levels, or
   when it is the only candidate for the slot over ≥ 10 levels. Everything else is optional. The UI's "Core only"
   filter uses this.
7. **Tie-breaks:** higher score, then lower cost, then fewer distinct mats, then the item that needs no
   reputation or Favor.

All thresholds live in `worth` in the JSON, so tuning needs no code change.

**M1 implementation notes (2026-10-08, `site/lib/rank.js`), where this section left a choice open:**

- When keep-for-N fails, the step or its successor is dropped, whichever keeps more score × levels; banning is by
  the failing step's new items.
- The par item includes armor (heaviest wearable type) and weapon DPS: `baseline.dpsEfficiency` (0.9) and par speeds
  in `roles.json`.
- Core thresholds are `worth.coreGain`, `worth.coreKeep` and `worth.coreAlone`.
- Rule 5 drops A when `B.score × (horizon − d) > A.score × horizon`.
- Gadgets (no stats, an unscored use or equip effect, no weapon) are alternatives ("effect not scored"), never a
  step; a curated `effectScore` in `curation/items.json` puts one back.
- New parameter `dualWieldHit` (0.8): dual-wield white hits are scaled by the vanilla miss penalty. Without it
  Warriors levelled with two one-hand maces. Owner: theorycraft; tune with the rest of §4.5.

### 6.5 Things weights cannot see

- **Effects** (relic procs and %-effects, trinket uses, Engineering gadgets, "chance on hit" weapons): default 0, a
  badge "has an effect not scored", and an optional curated `effectScore` per item (points in the profile's main
  stat). For example, the prototype's notes value Mystic Mushroom (+5% Spirit) roughly; at 20 that is ~5 Spirit for
  a druid.
- **Set bonuses**: crafted sets exist from 39 (Stormcloth, Imperial Plate, Blessed Plate, Volcanic, Ironfeather,
  Stormshroud, the Dragonscale sets, Devilsaur, Bloodvine, …; `ItemSparse.ItemSet`). v1 shows the set and its
  bonus. It does not score it (Open question 11).
- **Speed for rogues' Backstab** (dagger required) and similar spec details: not modelled.

## 7. Faction-specific recipes and content

Items are almost never faction-restricted: among equipment and recipe items, only the two Favor-faction tabards
carry the Horde/Alliance flag (`ItemSparse.Flags_1` bits 0x1/0x2) [DB]. **Side is a property of the source, not of
the item.** What differs for the Horde:

| Content | Alliance | Horde | Evidence |
|---|---|---|---|
| Merchant's Favor recipe vendors | Azeroth Commerce Authority, Three Corners (Redridge) | Durotar Supply and Logistics, west of the Crossroads (Jim'bek, Pawani, Gor'mak) | [Note]; Horde stock unverified |
| Favor tabard | ACA tabard (Alliance flag) | DSL tabard (Horde flag) | [DB] |
| Level-30 reputation patterns | Kirin Tor (Dalaran, Alterac): **Azure** Stormsewn/Gustwoven/Skyforged | Earthen Ring (Mulgore): **Cloudy** versions | [Note] |
| Level 5–7 Nightclaw patterns | Azure and Cloudy, neutral vendor on Zephras Isle | same | [Note] |
| Limited-supply recipe vendors | City and zone vendors (e.g. Ironforge, Stormwind, Darnassus) | Different NPCs; some formulas sold Horde-side only (e.g. Lesser Intellect chest formula) | [Note], [V] |
| Trainer recipes | same | same | [V] |
| World-drop and dungeon patterns | same | same | [V] |
| Quest-reward recipes and items | faction quests (e.g. "Gearing Redridge", Ironforge) | Horde equivalents differ | [V] |
| Weapon-skill trainers | Alliance cities | Horde cities | [V] |

**Mirrored items:** the Azure and Cloudy pieces are different item IDs with **identical stats and shares** [DB:
e.g. Azure Stormsewn Cowl 277054 vs Cloudy Stormsewn Cowl 277046, both Int 6667 + Sta 6666, req 30]. The ranking
should treat such pairs as one candidate per faction. Otherwise an Alliance roster sees the Cloudy copy as an
unobtainable duplicate.

**What the planner must store per source** (data-model area): `side: "alliance" | "horde" | "both" | "unknown"`,
`kind` (trainer, vendor, limited vendor, reputation vendor, Favor vendor, drop, dungeon drop, world drop, quest),
`npc`, `zone`, `rep: {faction, standing}`, `cost: {copper | favor}`. Per item, an optional `mirror` group key
(same slot, subclass, stats, item level) so the filter can pick the faction's copy.

## Assumptions about other areas

1. **Data pipeline:** per item it provides stat keys as in §4.1 (extended map, unknown IDs kept as `Stat<ID>`),
   corrected weapon DPS and speed, armor, InventoryType, item class/subclass, `bind`, `reqLevel`,
   `allowableClass` (raw mask), `requiredSkill` + rank, `profession`, the recipe's `requiredAbility`
   (specialisation), `itemSet`, sources with `side`, and the mirror key. It adds `ChrClasses`, `ChrRaces` and
   `CharBaseInfo` to its table list to check §1 on each build.
2. **Data model:** a roster entry has `class`, `role`, `level`, `options` (`school`, `twoHand`), `professions`
   (up to two, each with optional `skill` and `spec`), optional `weights` overrides. The faction is per roster
   (product draft). Nothing here needs it per entry.
3. **UI:** the role list comes from `classes[c].roles`; school and twoHand selects appear per §3.3; the
   specialisation select appears per §5.3; an "Advanced weights" editor per §4.6; badges for "custom weights" and
   "effect not scored".
4. **Pricing:** `price(itemId)` and mat costs in copper feed the spend tier in §6.4. Without a price, the tier is
   "keeper", as in the prototype.
5. **Crafter pace** (skill reachable by level) is owned by the data/UI drafts. The ranking only reads "can e (or
   a roster crafter) make i by level ℓ".
6. **Enchant rules** keep their own scoring, but should switch to the same effective weights and to the weapon
   formula in §4.5. Then an item and its enchant are judged by one model.

## Open questions

1. **Are all CharBaseInfo pairs playable at launch** (Dwarf Shaman, Undead Paladin, the Skyborne races)?
   *Recommendation:* trust the data (no faction lock on any class); confirm on the character-creation screen on
   2026-11-05 and only then mention it in the About page.
2. **Mail and plate at 40?** The DB can't tell, and Forever's Retail-style "Armor Proficiency" spell hints they may
   be available earlier. *Recommendation:* ship 40 (vanilla) as data; verify in game with a low-level Hunter or
   Warrior (try to equip mail/plate, or check the trainer at 40); correcting it is one number per class.
3. **Shaman dual wield?** Data: "never learned" (AcquireMethod 3). *Recommendation:* no dual wield for Shaman;
   recheck the Enhancement talent tree (Trait tables) once, and add `dualWield` for Shaman if a talent grants it.
4. **Is 1 DPS still 14 AP in Forever?** *Recommendation:* keep `apPerDps: 14`; verify by equipping a +AP item and
   reading the character sheet's damage range.
5. **Feral Combat skill line:** does weapon DPS matter in Cat/Bear form? *Recommendation:* weapon term 0 for druid
   melee and tank until someone tests; if forms use weapon DPS, set `mh` to 1 for those profiles.
6. **Rating conversion:** is 10 points = 1% at every level? *Recommendation:* assume constant (one tooltip data
   point); check a second rating item at a different level; if ratings scale with level, drop the `levelScale`
   factor for them instead (the two effects roughly cancel).
7. **Does stat 31 (Hit) apply to spells?** Vanilla wording is melee/ranged. *Recommendation:* keep caster Hit at
   0.4 (half the melee value) and test with a spell-hit item.
8. **School "Any" (UI draft) vs per-class default + "Mixed" (this doc).** *Recommendation:* per-class default
   (Frost, Shadow, Shadow) with "Mixed" as an explicit choice; "Any" has no well-defined weight.
9. **Weight overrides beyond sparse per-entry numbers** (Pawn strings, shared presets)? *Recommendation:* not in
   v1; the JSON shape allows a later import.
10. **Rogue dagger vs sword/mace preference?** *Recommendation:* not in v1. The `specials` factor already makes slow
    main hands win, which suits Combat leveling; add a `mainHandType` option if users ask.
11. **Score set bonuses?** *Recommendation:* v1 shows them only; v2 adds a bonus once the plan holds ≥ N pieces of
    the set within the keep window.
12. **Par-item baseline efficiency (0.5)?** *Recommendation:* ship 0.5 and calibrate against the prototype's
    hand-curated 1–30 plans (the generated plan should reproduce most "core" picks; the curated plans are the test
    oracle).
13. **Spend tiers at higher levels:** is `(ℓ/20)²` right? *Recommendation:* ship it with a roster-level "budget"
    multiplier (½×, 1×, 2×, 4×); tune after release prices exist.
14. **Druid has four roles; the UI draft assumed at most three.** *Recommendation:* allow four (data-driven list).
15. **Horde Favor vendors' stock and Earthen Ring patterns:** same items as the Alliance side? *Recommendation:*
    assume the mirror and mark Horde sources "unverified" until someone checks in game.

## Decisions taken here

- Five UI roles (`melee`, `ranged`, `caster`, `healer`, `tank`) over six weight profiles; melee splits into
  Str/Agi by class, never by user choice.
- Defaults: Warrior melee, Paladin melee, Hunter ranged, Rogue melee, Priest caster (Shadow), Shaman melee (2H on),
  Mage caster (Frost), Warlock caster (Shadow), Druid melee (Cat).
- Armor rule comes from `ChrClasses.ArmorTypeMask`; level gates (mail/plate 40, dual wield 10/20/20) are vanilla
  values stored as data.
- Shaman: no dual wield; 2H axes and maces as an option. Rogue: 1H axes allowed (Forever change).
- Druid feral weapon term 0; Hunter melee weapon term 0; caster melee weapons and off-hands are stat sticks; wand
  DPS counts 1.0 SP (Priest, Warlock) / 0.6 (Mage).
- Weapon term = DPS × 14 × AP weight × (1 + speed × specials / 60), off hand × 0.5, replacing the prototype's
  pinned 2H constant.
- Offensive ratings scale with `max(0.25, level / 60)`; avoidance does not.
- Armor 0.02 per point for physical profiles, 0.015 casters, 0.05 tanks; Stamina 0.5–0.6 for damage roles.
- School-damage weight = class share × the profile's SpellDmg weight.
- Overrides are sparse per roster entry, behind "Advanced".
- Ranking compares against a par green (efficiency 0.5), needs +1 point or +8% to step, and keeps the prototype's
  spend tiers (3/5/8 levels) with level-scaled caps.
- Race is not an input; faction is per source, with Azure/Cloudy-style mirrors merged per faction.
- The specialisation select appears only for BS/LW/Eng at level 40+ or skill 200+.
- The weights file is a hand-maintained static script, versioned with the build key.
