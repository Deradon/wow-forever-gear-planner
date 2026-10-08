# Data model

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: game-data engineer. Companion document: `game-data-pipeline.md` (how these files are generated, with the
measured counts behind every number here). Status: draft for synthesis.

All counts are measured on Forever beta build **1.60.1.70205** (DB2 CSVs from wago.tools). "The prototype" is the
existing private planner; "its generator" is the Python script that writes its data file.

## 1. Principles

1. **Game data, prices, curation and user state are four separate things.** Game data is generated from DB2 and
   only changes with a new build. Prices change with every Auctionator import and live in their own file and in the
   user's browser. Curation (sources, overrides, notes) is a small hand-reviewed input to the generator. User state
   (roster, statuses) never leaves the browser except by export.
2. **No people in the data.** The prototype's `characters`, `crafters`, `plans` (with `for`/`only`), `favor` (per
   named crafter) and every `crafter` field on enchants disappear. The data describes items, recipes and rules; the
   roster is user state (§12).
3. **Everything keyed by stable game IDs.** Items by item ID, recipes by craft spell ID, enchants by
   `"spell:<id>"`/`"item:<id>"` (the prototype's scheme). These IDs survive builds, so user state survives a data
   refresh. Names are never keys (four crafted item names are shared by two IDs in this build, §4.4).
4. **Plain JS files that assign plain JSON.** The page runs from `file://` and on GitHub Pages without a build step,
   so data ships as classic `<script>` files; the right-hand side of each assignment is strict JSON (§3.2).
5. **The data holds facts and derived numbers, not judgements.** Stats, armor, weapon damage, skill, binds, sources.
   Role scoring and the per-slot path are computed in the browser (see `game-data-pipeline.md` §10).

## 2. Dataset and build key

One dataset = one flavor + one build + one level range. Every data file carries the dataset key, and the page refuses
to mix files from different keys (protects against a half-updated deploy or a stale browser cache).

```json
// data/forever/meta.js  →  window.FGP_DATA.meta = { ... };
{
  "dataset": "forever",
  "flavor": "forever",
  "product": "wow_classic_beta",
  "build": "1.60.1.70205",
  "levels": [1, 60],
  "skillCap": 300,
  "locale": "enUS",
  "status": "beta",
  "generated": "2026-10-08",
  "generator": "gen 1.0.0",
  "inputs": {
    "db2": "sha256 manifest build-inputs/db2-1.60.1.70205.sha256",
    "wowhead": "build-inputs/wowhead-1.60.1.70205.json (2026-10-08)",
    "curation": "git tree hash of curation/"
  },
  "counts": { "items": 1274, "recipes": 1412, "mats": 356, "enchants": 197 },
  "notes": [
    "Beta data; nothing is Blizzard-confirmed.",
    "Stats are RandPropPoints[item level][quality][slot] x share / 10000, checked against 256 tooltip stat lines."
  ]
}
```

- `dataset` is the folder name and the key the page uses in its state (`state.dataset`). Later datasets
  (`forever-1-70`, `classic-era`) get their own folder; v1 ships exactly one.
- `status` is `"beta"` until the release-day refresh, then `"live"`. The UI shows a banner while it is `beta`.
- `generated` is the date passed to the generator (or taken from the newest input), never the wall clock, so a
  re-run on the same inputs is byte-identical (pipeline §13).
- `counts` is filled by the generator; the numbers above are this build's (recipes = 1,281 gear + ~131 intermediate; see pipeline §4).

## 3. Files, loading and sizes

### 3.1 File split

| File (in `data/forever/`) | Content | Records (this build) | Est. size raw | Owner |
|---|---|---|---|---|
| `meta.js` | §2 | 1 | 2 KB | generator |
| `items.js` | equipment (§4) | 1,274 items | ~220 KB | generator |
| `recipes.js` | gear recipes + intermediate recipes (§5) | ~1,281 gear + ~131 intermediate | ~280 KB | generator |
| `mats.js` | reagents and intermediates (§6) | 356 | ~35 KB | generator |
| `sources.js` | NPCs, factions, recipe sources (§7) | ~150 NPCs, 9+ factions, 1 source list per recipe | ~70 KB | generator (from curation) |
| `enchants.js` | enchants, kits, attachments, scopes (§8) | ~169 enchants + 28 items | ~110 KB | generator |
| `rules.js` | professions with specialisations, slots, stat labels (§9); class facts come from the theorycraft `roles.js` | small | ~4 KB | hand-written, reviewed |
| `reference.js` | consumables, Favor rules, "what changed in Forever", vendor notes (§11.3) | text | ~100 KB | hand-written |
| `prices-default.js` | shipped default prices (§10) | ~1,700 item IDs | ~30 KB | pricing tooling |

Total ≈ 850 KB raw, about 150 KB on the wire (GitHub Pages serves gzip; this JSON compresses 5–6×). Parsing an
850 KB object literal costs 10–20 ms on a desktop, well inside the 300 ms first-render budget in the vision document.

Sizes are measured, not guessed: a compact emit of the 1,279 candidate items with the shape in §4 is 218 KB
(170 B/record), the 1,281 gear recipes 237 KB (185 B/record, before the pattern object), the 290 direct mats 25 KB.
The prototype's items averaged 882 B because each record inlined its mats with names, icons and prices; normalising
mats and moving prices out is what keeps 8× more items under 1 MB.

Splitting by section (not by level bracket or profession) keeps the loader trivial and each generated file
reviewable in one diff. Every file is emitted **one record per line**, so a release-day `git diff` shows exactly
which items changed.

### 3.2 Loading from `file://`

`fetch()` and ES-module imports of JSON are blocked from `file://` in Chromium, so data is not `.json`. Each file is
a classic script:

```js
// Generated by the data pipeline. Do not edit; re-run the generator.
window.FGP_DATA = window.FGP_DATA || {};
window.FGP_DATA.items = {"dataset":"forever","build":"1.60.1.70205","rows":{
"2307":{"name":"Fine Leather Boots", ... },
"2315":{"name":"Dark Leather Boots", ... }
}};
```

Contract (checked by a node test): line 3 starts with `window.FGP_DATA.<section> = `, the rest up to the final `;`
parses with `JSON.parse`, and its `dataset`/`build` equal `meta.js`'s. Tools and tests can therefore read the files
without evaluating JS.

`index.html` lists the scripts statically in dependency-free order (`meta`, `rules`, `items`, `recipes`, `mats`,
`sources`, `enchants`, `reference`, `prices-default`, then the app). A future dataset switcher injects the other
folder's `<script>` tags with `document.createElement("script")`, which works from `file://`; v1 needs none of that.

## 4. Items (equipment)

### 4.1 Shape

`items.rows` maps item ID → record. Only equippable crafted items with required level ≤ 60 are shipped (1,274 in this
build after dropping 5 cosmetic pieces; pipeline §3).

Armor piece:

```json
"2307": {
  "name": "Fine Leather Boots",
  "quality": 2, "ilvl": 18, "req": 13,
  "inv": 8, "slot": "Feet", "itemClass": "armor", "type": "Leather",
  "bind": "BoE",
  "armor": 51,
  "stats": {"Agi": 3, "Sta": 2},
  "recipes": [2158],
  "origin": "vanilla",
  "avail": "ok"
}
```

Weapon (caster-flagged, rule-adjusted damage):

```json
"249392": {
  "name": "Glimmering Staff",
  "quality": 3, "ilvl": 30, "req": 25,
  "inv": 17, "slot": "Two-Hand", "itemClass": "weapon", "type": "Staff",
  "bind": "BoP",
  "stats": {"Int": 11, "Sta": 11},
  "weapon": {"speed": 2.2, "min": 32, "max": 49, "dps": 18.41, "basis": "caster", "checked": "wowhead"},
  "recipes": [1248703],
  "origin": "forever",
  "avail": "ok"
}
```

Profession-gated, class-restricted and effect-carrying items use optional fields:

```json
"10501": {
  "name": "Catseye Ultra Goggles", "quality": 2, "ilvl": 44, "req": 0,
  "inv": 1, "slot": "Head", "itemClass": "armor", "type": "Cloth", "bind": "BoE",
  "armor": 47, "stats": {},
  "equipSkill": {"prof": "Engineering", "rank": 220},
  "effects": [{"on": "equip", "spell": 12418, "text": "Stealth Detection 15"}],
  "flags": ["noStats"],
  "recipes": [12607], "origin": "vanilla", "avail": "ok"
}
```

(Real values of this build, armor from the armor formula; the effect text is the spell name until the generator
fills in tooltip wording.)

### 4.2 Fields

| Field | Type | From | Notes |
|---|---|---|---|
| `name` | string | ItemSparse `Display_lang` | English only (scope decision). |
| `quality` | 1–4 | `OverallQualityID` | 1 white, 2 green, 3 blue, 4 epic. |
| `ilvl`, `req` | int | `ItemLevel`, `RequiredLevel` | `req` may be 0 (43 items: 37 Engineering, which is skill-gated instead, 6 Tailoring, 1 Leatherworking). |
| `inv`, `slot` | int, string | `InventoryType` | `slot` uses the prototype's names (`Head`, `One-Hand`, `Two-Hand`, `Main Hand`, `Off-hand`, `Ranged`, `Relic`, …). |
| `itemClass`, `type` | string | Item `ClassID`/`SubclassID` | `type`: `Cloth`…`Plate`, `Shield`, `Misc`, `Idol`/`Libram`/`Totem`, or the weapon type (`2H Mace`, `Wand`, `Gun`, `Thrown`, …). |
| `bind` | `"BoP"`/`"BoE"`/`"BoU"`/`"none"` | `Bonding` | 376 BoP, 877 BoE, 25 none, 3 BoU in the 1,281 candidate rows. |
| `armor` | int or absent | armor tables (pipeline §6.2) | Absent on weapons, trinkets, rings. |
| `stats` | `{statKey: int}` | budget formula (pipeline §6.1) | Empty object when the item has no budgeted stats. Keys listed in §9.3. |
| `weapon` | object or absent | damage tables + rules (pipeline §6.3) | `basis`: `"tables"`, `"caster"`, `"ranged"`, `"wowhead"`; `checked`: `"wowhead"` when the build verified it against a tooltip. |
| `classes` | string[] or absent | `AllowableClass` | Only when it actually restricts (11 items: Wolfshead Helm, Robe of the Archmage, Cloak of Earth and Sky, four relics, …). Relic class limits also follow from `type`. |
| `equipSkill` | `{prof, rank}` or absent | `RequiredSkill`, `RequiredSkillRank` | 57 items; Forever child skill lines (2938, 2941) are mapped to their parent profession. |
| `effects` | `[{on, text, value?}]` or absent | item effect spells + Wowhead tooltip text | `on`: `use`/`equip`/`hit`. `value` is an optional curated stat map so a proc can be scored (§11). 69 of the stat-less items carry effects. |
| `mirror` | int or absent | derived | Group ID shared by items with identical slot, type, item level, required level, quality, bind and stat shares: 32 groups, 68 items, e.g. the Azure (Alliance) and Cloudy (Horde) reputation pieces. Lets the ranking treat a faction pair as one candidate (theorycraft §7). |
| `set` | `{id, name}` or absent | `ItemSet` | 60 items in 16 sets (Devilsaur, Volcanic, Bloodvine, Imperial Plate, …). Bonus text in `sets` (below). |
| `recipes` | int[] | — | Craft spell IDs that make it (2 shipped items have two: Goblin Mortar, Greater Mystic Wand; pipeline §5, R7). |
| `origin` | `"vanilla"`/`"forever"`/`"sod"` | ID present in the Era/SoD build or not | 669 / 602 / 10 of the 1,281 candidate rows. `"sod"` = an ID from the Season of Discovery range that Forever reuses. |
| `avail` | `"ok"`/`"unconfirmed"`/`"unobtainable"` | rules + curation | Candidate filtering uses it; the UI can still show the item with its reason. |
| `flags` | string[] or absent | rules + curation | `noStats`, `randomStats`, `sodSuspect`, `qualityModifier`, `unknownStat`. |
| `note` | string or absent | curation | Shown in tooltips and the plan. |
| `icon` | string or null | Wowhead snapshot | Icon file name; images load only when the user turns icons on. |

`sets` is a small sibling table in `items.js`: `{"<setId>": {"name": "...", "items": [ids], "bonuses": [{"pieces": 2,
"text": "..."}]}}`. Set bonuses are display-only in v1 (open question 6).

### 4.3 What is not in an item

Mats, cost, AH price, crafter, plan level, `core`, `favor` cost. Mats and the recipe skill live on the recipe (an item
can have two recipes); price and cost are computed in the browser from `prices` (§10); crafter and plan come from the
roster and the ranking.

### 4.4 Names are not unique

Four crafted names map to two IDs each in this build: Dark Leather Boots (2315 BoE green, 252425 BoP blue, both
Leatherworking), Radiant Gloves (12418, 254105), Turtle Scale Gloves (8187, 217270) and Golden Scale Gauntlets (9366,
217273). The last two pairs are SoD copies (pipeline §5). The prototype had to reference two of these by ID; the new
model never resolves by name.

## 5. Recipes

`recipes.rows` maps craft spell ID → record. Gear recipes and the recipes of intermediates (bars, bolts, cured
hides, dyes, Engineering parts) share the shape; `kind` tells them apart.

```json
"2158": {
  "kind": "gear",
  "item": 2307, "out": 1,
  "prof": "Leatherworking",
  "skill": {"learn": 65, "approx": false, "yellow": 95, "grey": 125},
  "mats": [[2318, 7], [2320, 2]],
  "pattern": {"id": 2406, "name": "Pattern: Fine Leather Boots", "bind": "none", "rep": null},
  "sources": [{"kind": "drop", "where": "world", "side": "both", "certainty": "vanilla"}],
  "origin": "vanilla"
}
```

A Forever trainer recipe with a stub pattern and a reputation recipe:

```json
"1252237": {
  "kind": "gear", "item": 250488, "out": 1, "prof": "Blacksmithing",
  "skill": {"learn": 85, "approx": true, "yellow": 85, "grey": 85},
  "mats": [[2841, 4], [3470, 2], [5498, 2]],
  "pattern": {"id": 251340, "name": null, "bind": null, "rep": null, "stub": true},
  "sources": [{"kind": "trainer", "side": "both", "certainty": "forever", "cite": ["ATT", "FC"]}],
  "origin": "forever"
}
"1301421": {
  "kind": "gear", "item": 276992, "out": 1, "prof": "Blacksmithing",
  "skill": {"learn": 60, "approx": false, "yellow": 65, "grey": 70},
  "mats": [[2840, 8], [2880, 1]],
  "pattern": {"id": 276928, "name": "Plans: Cloudy Skyforged Chainmail", "bind": "BoP",
              "rep": {"faction": 2758, "standing": "Honored"}},
  "sources": [{"kind": "vendor", "npc": "vayn-moongaze", "cost": {"copper": 1200},
               "rep": {"faction": 2758, "standing": "Honored"}, "side": "both", "certainty": "forever",
               "cite": ["ATT", "WT", "CWF"]}],
  "origin": "forever"
}
```

(Real records of this build: Fine Leather Boots, Veteran's Chain Shirt with its stub plan 251340, Cloudy Skyforged
Chainmail with its Nightclaw Druids Honored plan; prices and NPC from the prototype's recipe-source note.)

| Field | Notes |
|---|---|
| `kind` | `gear` or `intermediate`. |
| `item`, `out` | Crafted item and count per craft (`EffectBasePoints` of effect 24; 1 for every gear recipe, >1 for some intermediates). |
| `prof` | Parent profession name. Child skill lines (2937–2948) are unused by recipes in this build but mapped anyway. |
| `skill.learn` | The pattern's `RequiredSkillRank`; for trainer recipes the yellow rank with `approx: true` (prototype convention; the true learn rank is lower). |
| `skill.yellow`, `skill.grey` | `TrivialSkillLineRankLow/High`. |
| `mats` | `[[itemId, count], …]`, at most 8. Names and prices come from `mats.js` and `prices`. |
| `pattern` | `null` for trainer recipes without a recipe item (190 gear recipes). `stub: true` when a recipe item is linked but missing from ItemSparse (87 gear recipes; pipeline §5). `bind`: pattern bind (`BoP`/`none`); `rep`: reputation requirement from the pattern item; `spec`: specialisation from the pattern's `RequiredAbility` (86 gear recipes: Armorsmith 17, Weaponsmith 5, Master Sword/Hammer/Axesmith 7/6/5, Dragonscale 11, Elemental 15, Tribal 19, Goblin Engineer 1), as a name. |
| `sources` | One or more entries (§7). Never empty: the fallback is `{"kind": "unknown"}`. |
| `origin` | As on items, by spell ID. |

The roster's "recipe learned" checkmarks key on the spell ID.

## 6. Mats and intermediates

`mats.rows` maps item ID → record for every reagent of a shipped recipe, transitively (290 direct reagents, 356 with
the intermediates' own reagents; all have ItemSparse rows).

```json
"2318": {"name": "Light Leather", "quality": 1, "bind": "none", "madeBy": [2881], "vendor": null, "gathered": "Skinning"},
"2320": {"name": "Coarse Thread", "quality": 1, "bind": "none", "madeBy": [], "vendor": {"copper": 10, "stack": 1}, "gathered": null},
"2840": {"name": "Copper Bar", "quality": 1, "bind": "none", "madeBy": [2657], "vendor": null, "gathered": "Mining"}
```

- `bind`: so pricing can tell soulbound mats (no AH price possible) from tradeable ones.
- `madeBy`: recipe spell IDs that produce the mat (131 intermediates: 47 Engineering, 35 Alchemy, 16 Leatherworking,
  13 Mining, 8 Tailoring, 7 Blacksmithing, 3 Enchanting, 2 First Aid). Pricing uses it for "cheaper of AH and
  crafting it".
- `vendor`: present only for mats a vendor sells. DB2 has a `BuyPrice` for nearly every item, so "sold by a vendor"
  is **curated** (the prototype's `VENDOR_MATS` list of 25 names, extended for 31–60: Rune Thread, the dyes, fluxes,
  vials). The copper value comes from `BuyPrice / VendorStackCount`.
- `gathered`: curated gathering profession, used for the "your roster gathers this" opportunity-cost display
  (vision open question 8). About 60 entries.
- Recipe items (patterns) are not mats; their name and bind sit on the recipe (`pattern`). A BoE-tradeable pattern
  can still be priced from the AH by its ID (`pattern.id`).

## 7. Sources

### 7.1 Source entries

A source entry says how a crafter learns a recipe. Kinds, with what DB2 can and cannot say:

| `kind` | Extra fields | Side | From DB2? |
|---|---|---|---|
| `trainer` | `cost.copper?` | `both` | Yes: no recipe item, or a stub pattern on a Forever-new item (pipeline §9). |
| `vendor` | `npc`, `cost.copper`, `limited?`, `rep?` | from the NPC | Only `rep` (pattern `MinFactionID`/`MinReputation`). NPC, price, stock: curated. |
| `favor` | `npc`, `cost.favor` | from the NPC (Alliance: Three Corners, Redridge; Horde: Durotar supply post) | No. Curated per family (30 Favor ≤ level 30, 60/90/120 above). |
| `quest` | `quest` (name), `npc?` | curated | No. |
| `drop` | `where`: `"world"`, `"zone"`, `"dungeon"`; `zone?`, `instance?`, `bosses?` | `both` (instances and world drops are shared) | Only a hint: a tradeable (`bind: none`) pattern is a world drop or vendor item. |
| `unknown` | `text?` | `both` | Fallback. |
| `unobtainable` | `reason` | — | Curated (e.g. Phoenix Bindings, an SoD leftover). |

Common fields on every entry: `side` (`"alliance"`, `"horde"`, `"both"`), `certainty` (`"forever"` = confirmed on
Forever beta, `"vanilla"` = vanilla source assumed unchanged, `"db"` = derived from DB2 only, `"unknown"`), `cite`
(source keys such as `ATT`, `WH`, `CWF`, `ZK` from the prototype's recipe-source note), `checked` (date), `note`.

A recipe is **available to a roster** if at least one source has `side` `both` or the roster's faction, or if the
pattern is tradeable (`pattern.bind` = `none`) and so can come from the AH. BoP patterns from the other faction's
vendor are not available.

### 7.2 NPCs and factions

```json
// in sources.js
"npcs": {
  "vayn-moongaze": {"name": "Vayn Moongaze", "npcId": null, "zone": "Shadowgale Forest, Zephras Isle",
                    "coords": [63.8, 36.0], "side": "neutral",
                    "note": "Nightclaw Druids quartermaster. Whether non-Skyborne characters can reach the isle is disputed."},
  "mivin-shadowweave": {"name": "Mivin Shadowweave", "zone": "Three Corners, Redridge Mountains",
                        "coords": [10.0, 72.8], "side": "alliance", "role": "favor"}
},
"factions": {
  "2758": {"name": "Nightclaw Druids", "side": "both"},
  "2740": {"name": "Kirin Tor", "side": "alliance"},
  "2787": {"name": "Earthen Ring", "side": "horde"},
  "59":   {"name": "Thorium Brotherhood", "side": "both"},
  "609":  {"name": "Cenarion Circle", "side": "both"}
}
```

NPC keys are slugs (stable, readable in curation diffs); `npcId` is filled when known. Faction names and sides are
to be read from the `Faction` DB2 table (pipeline §2; not fetched yet, the sides above come from the prototype's
notes): this build has 155 reputation-gated gear
patterns across 9 factions (Nightclaw Druids 48, Cenarion Circle 30, Thorium Brotherhood 25, Zandalar 16, Timbermaw
10, Argent Dawn 9, Earthen Ring 8, Kirin Tor 8, Hydraxian Waterlords 1). The Earthen Ring/Kirin Tor pair is the
Horde/Alliance split of the "Cloudy"/"Azure" level-30 patterns.

### 7.3 Where sources come from

`sources.js` is generated: derived entries from DB2 (trainer, reputation, "tradeable pattern") merged with curated
entries from `curation/sources.json` (§11). A curated entry replaces the derived ones for that recipe. The generator's
report lists every gear recipe whose only source is `unknown` or `db`, so curation progress is measurable.

## 8. Enchants, kits, attachments, scopes

In scope (the prototype's Enchants view and per-piece enchant column are part of v1). The record shape is the
prototype's, minus the people:

```json
"spell:13626": {
  "kind": "enchant", "spell": 13626, "enchant": 847, "item": null,
  "name": "Minor Stats", "fullName": "Enchant Chest - Minor Stats",
  "target": {"slots": ["Chest"], "inv": [5, 20], "types": ["Cloth", "Leather", "Mail", "Plate"], "weapon": null},
  "stats": [["Str", 2], ["Agi", 2], ["Sta", 2], ["Int", 2], ["Spi", 2]],
  "proc": null, "effect": "All Stats +2",
  "profession": "Enchanting",
  "skill": {"yellow": 175, "grey": 215, "learn": null, "recipe": null},
  "req": null, "ilvlMin": null,
  "mats": [[10998, 1], [11083, 1], [11084, 1]],
  "sources": [{"kind": "trainer", "side": "both", "certainty": "forever"}],
  "isNew": false, "buffed": true, "note": null
}
```

Changes from the prototype: `crafter` removed (enchanters come from the roster), `mats` normalised to `[id, count]`
(names and prices from `mats.js`/`prices`), `cost`/`ah` removed (computed in the browser), `source` + `certainty` +
`available` replaced by the `sources` list of §7 (Horde-only formulas become `side: "horde"` instead of
`available: false`). `stats` stays a list of pairs because enchants can repeat a key (All Stats). The enchant rules'
tests keep working against this shape after a mechanical adapter change.

Range: the prototype capped enchants at skill 240 and kits/scopes at item level 45. For 1–60 the caps go: 179
enchanting spells (132 vanilla, 27 Forever-new, 20 in the SoD ID range: 10 with Forever formulas look live, 10 are
suspects, 3 of them already on the prototype's skip list) plus 28 enchant items (15 Leatherworking kits, 7
Engineering scopes, 6 Blacksmithing attachments), so about 197 records.

## 9. Rules (`rules.js`) and class facts

Hand-written, small, reviewed: facts the roster logic needs that DB2 does not express directly or that are cheaper to
state than to derive.

### 9.1 Classes: owned by the theorycraft file

Class facts (armor type by level, weapon types, dual wield, relic type, class mask bit, roles, playable sides) live in
the theorycraft role's hand-maintained `roles.js` (`classes[...]`), not here, so there is one class table. The data
model relies on it providing, per class: the `AllowableClass` bit (`1 << (id - 1)`: Warrior 1 … Druid 1024), armor
types with the level they are learned (Mail and Plate at 40 per vanilla, to be confirmed in Forever), trainable weapon
types using the item `type` names of §4.2, the relic `type`, and the sides the class is playable on.

### 9.2 Professions, slots, sides

- `professions`: the six crafting professions that make equipment in Forever (Blacksmithing, Leatherworking,
  Tailoring, Engineering, Enchanting, Alchemy) and the three gathering ones, with skill line IDs and, for
  Blacksmithing, Leatherworking and Engineering, their specialisations (the `pattern.spec` names). There is **no
  Jewelcrafting or Inscription** skill line in this build.
- `slots`: the planner's slot list (the prototype's `UI_SLOTS` plus `Neck`, `Finger`, `Trinket`, `Relic`) and the
  inventory-type → slot map.
- `statKeys`: display labels for every key of §9.3.

### 9.3 Stat keys

The prototype's keys, extended to every stat ID that occurs on a candidate item (the mapping is the pipeline's; the
keys match the theorycraft document's §4.1 table):

`Str Agi Sta Int Spi` · `SP Heal SpellDmg HolyDmg FireDmg NatureDmg FrostDmg ShadowDmg ArcaneDmg` · `AP RAP Hit Crit
MP5` · `Def Dodge Parry Block` · `Armor` (bonus armor, stat 50) · `FireRes FrostRes ShadowRes NatureRes ArcaneRes`
(stats 51, 52, 54, 55, 56; 215 occurrences, mostly 50–60 resistance gear). Six stat IDs (83, 90, 112, 113, 124, 132,
on 8 items) are not yet identified; they ship as `Stat<ID>` (weight 0, shown raw) and the build report lists them
(pipeline §6.1).

Role IDs and weights are **not** in `rules.js`; they belong to the theorycraft module.

## 10. Prices

Game data never contains prices. `prices-default.js` and every imported price list share one shape (my assumption;
the pricing document owns it):

```json
// window.FGP_DATA.prices = ...
{"dataset": "forever", "source": "auctionator", "scanned": "2026-10-07", "scope": "one realm, one faction",
 "copper": {"2318": 48, "2589": 35, "5972": 150}}
```

- Keyed by item ID, integer copper, minimum buyout. Covers mats, crafted gear and tradeable patterns.
- Vendor prices of curated vendor mats come from `mats.js` (`vendor.copper`), not from the price list, and win over
  the AH (prototype rule).
- An import replaces or overlays the price list in browser storage; it never touches `FGP_DATA` game sections.
- Recipe cost, "cheaper of AH and crafting it" for intermediates (depth ≤ 4, as in the prototype's `unit_price`) and
  per-item AH price are computed in the browser from `recipes`, `mats` and prices.

## 11. Curation, overrides and notes

### 11.1 Curation inputs (repo, not shipped as-is)

| File | Keyed by | Content | Expected size |
|---|---|---|---|
| `curation/sources.json` | **family** (list of crafted item IDs) | source entries (§7.1) for those items' recipes | ~300 families for 1–60 |
| `curation/npcs.json` | slug | NPC records (§7.2) | ~150 |
| `curation/items.json` | item ID | `avail`, `reason`, `note`, `flags`, `effects[].value`, stat or weapon fixes, stat-ID mappings | ~100 |
| `curation/mats.json` | item ID | vendor flag, gathering profession | ~100 |
| `curation/enchants.json` | `"spell:<id>"`/`"item:<id>"` | sources, notes, `isNew`/`buffed`, skip list | ~120 |

Format: JSON, validated against a schema by the tests (the release document's layout). What a reviewer needs from a
comment goes into fields: `why` (one line), `cite`, `checked`, and `names` (display names next to the IDs, checked by
the generator against the build so they cannot drift). Example:

```json
[
  {
    "why": "Forever Favor patterns, Tailoring, levels 12-25; ATT, CWF, ZK, W4E agree",
    "items": [250001, 250002, 250003],
    "names": ["Silky Boots", "Silky Gloves", "Silky Sash"],
    "sources": [
      {"kind": "favor", "npc": "mivin-shadowweave", "cost": {"favor": 30}, "side": "alliance", "certainty": "forever"},
      {"kind": "favor", "npc": "durotar-tailoring-favor", "cost": {"favor": 30}, "side": "horde", "certainty": "unknown"}
    ],
    "cite": ["ATT", "CWF", "ZK", "W4E"], "checked": "2026-10-06"
  }
]
```

(The item IDs in the example are placeholders; the shape is exact.)

Keyed by crafted item ID as decided before the design phase, but grouped: one family entry covers a pattern family (e.g. the
six Favor cloth schools × six slots), so one decision is one entry. The generator rejects an item that appears in two
families and lists IDs that no longer exist in the build (the prototype's "ENCHANT_SOURCES has no record" warning).

### 11.2 How curation reaches the page

The generator merges curation into the shipped sections and marks provenance: `sources[].certainty` and `cite` on
sources, `note`/`avail`/`flags` on items. The browser never loads `curation/`. Item notes ship as the item's `note`.

### 11.3 Reference text

The prototype's hand-maintained extra data (consumables, "what changed in Forever", Merchant's Favor rules, vendor
list, open questions) becomes `reference.js`. Copied with edits: every `crafter` field and household line removed,
`recipeSources`/`vendors` dropped (superseded by structured `sources.js`), consumables kept as a reference list.

## 12. The roster model the data must support

The roster is user state (product owns its UI and storage). Shape assumed here:

```json
{
  "faction": "alliance",
  "entries": [
    {"id": "e1", "label": "Alt 1", "class": "Mage", "role": "caster", "options": {"school": "Frost"}, "level": 24,
     "professions": [{"name": "Tailoring", "skill": 150}, {"name": "Enchanting", "skill": null}]},
    {"id": "e2", "class": "Warrior", "role": "melee", "options": {"twoHand": true}, "level": 48,
     "professions": [{"name": "Mining", "skill": null}, {"name": "Blacksmithing", "skill": 260, "spec": "Armorsmith"}]},
    {"id": "e3", "class": "Rogue", "role": "melee", "level": 30, "professions": []}
  ]
}
```

What each roster rule reads from the data:

| Rule | Data fields |
|---|---|
| Can wear | `items.req` ≤ level; `type` vs the class's armor (at that level) and weapon types (theorycraft `classes`); `classes`; relic `type`; `equipSkill` vs the entry's profession skill. |
| BoP only for the crafter | `items.bind` = `BoP` → the wearer needs `recipes[r].prof` among its professions. |
| BoE via roster or AH | `bind` = `BoE`/`none` → any roster entry with `prof`, else the AH (`prices`). |
| Crafter can learn it | `recipes.skill.learn` vs the entry's skill (or the pace table); `sources[].side` vs `faction`; `sources[].rep`; `pattern.bind`; `pattern.spec` vs the entry's specialisation. |
| Favor buy order | sources with `kind: "favor"` and `cost.favor`. |
| Enchants and kits | `enchants` records; enchanters are entries with Enchanting; kit `req` binds the applier, not the item (prototype finding, checked in game). |
| Role scoring | `stats`, `armor`, `weapon`, `effects[].value`, `slot`, `type`, `mirror` (the theorycraft module's input). |

User state references only `entry.id`, item IDs, recipe spell IDs and enchant keys, all stable across builds. After a
data update the app reports state keys whose item or recipe no longer exists (vision success criterion 4).

## Assumptions about other areas

- **Product/UX:** roster as in vision §4 and §12 above: faction per roster, entries with class, optional label, role,
  level, up to two primary professions with optional skill. Gathering professions are selectable (used only via
  `mats.gathered`). The UI hides `avail: "unobtainable"` items by default and shows `"unconfirmed"` with a marker.
- **Theorycraft:** owns role IDs, stat weights and the class table (`roles.js`, hand-maintained, §9.1) and a scoring
  module loadable by the page and by Node (`score(item, roleId) → number`), consuming the item fields listed in §12
  "Role scoring" and the stat keys of §9.3 (unknown IDs as `Stat<ID>`, as its §4.1 proposes). The theorycraft draft
  asks for raw `allowableClass` and `requiredSkill`; this model ships them decoded (`classes`, `equipSkill`), which
  carries the same information. It may also own the crafter pace table (the prototype's `PACE`), extended to 60.
- **UI:** the UI draft expects prototype-style flat item fields (`profession`, `skill`, `mats`, `source`, `dps`,
  `speed`, `damage`). Here they live on the recipe (`recipes[item.recipes[0]]`) and in `item.weapon`; a small
  accessor in the shared library (`primaryRecipe(item)`, `itemDps(item)`) bridges that without duplicating data.
  `recipeSpell` = `item.recipes[0]`; `reqProfession` = `equipSkill`; `skillCap` is in `meta`.
- **Pricing/import:** prices are a separate `{itemId: copper}` map per dataset (§10); the importer and the default
  list share that shape; vendor mat prices come from `mats.js`. The pricing draft asks for `vendor`, `bind` and
  intermediate recipes (`{mats, makes}`) per mat: provided as `mats.vendor`, `mats.bind`, and `mats.madeBy` →
  `recipes[...].mats`/`.out`.
- **Release/infra:** the release draft puts generated data in `site/data/` as `game.js` + `texts.js` +
  `prices-default.js` and the curation as schema-checked JSON. This document's per-section files map onto that
  directly (`site/data/forever/items.js` …, or concatenated into one `game.js` that assigns all sections); the choice
  does not affect any shape here. It also proposes a Python generator; see pipeline open question 1. The release
  draft lists "rankings" inside `game.js`; this model ships no rankings (pipeline §10).

## Open questions

1. **Ship `unobtainable` items at all?** *Recommendation:* yes, with `avail` and a `reason`, because users will
   search for vanilla items they remember (Boots of Darkness, Phoenix Bindings) and "not obtainable in Forever" is an
   answer. Items DB2 drops entirely (no ItemSparse row, 286 equippable crafts) are not shipped.
2. **Per-family vs per-item curation keys.** *Recommendation:* families as in §11.1; the planning decision "by item ID" holds
   because a family is a list of item IDs, and it cuts the 31–60 work from ~560 items to ~90 decisions for the
   Forever-new sets (pipeline §9.4).
3. **One faction per roster** (also vision open question 1). *Recommendation:* yes; source `side` filtering assumes
   it. A mixed-faction roster would need per-entry faction and per-entry mail routes.
4. **Horde Favor vendors:** names and stock are unknown (only "Durotar supply post, west of the Crossroads" is in the
   notes). *Recommendation:* ship Horde Favor sources as mirrors of the Alliance families with `certainty: "unknown"`
   until confirmed; flag them in the UI.
5. **Score effects?** 69 stat-less items carry use/equip/proc effects; 50 candidates have an equip spell, none of
   them a plain stat aura. *Recommendation:* display-only in v1; curated `effects[].value` for the handful that
   matter for levelling (e.g. Engineering trinkets are not worth scoring).
6. **Set bonuses** (60 items, 16 sets, all level 40+). *Recommendation:* ship membership and bonus text; do not score
   in v1; revisit when the 40–60 recommendations are reviewed.
7. **Icons.** *Recommendation:* store the icon file name per item (from the Wowhead snapshot); the page only loads
   images when the user opts in, so the data stays offline-safe.
8. **One `game.js` or one file per section?** *Recommendation:* per section (smaller diffs per file, tests load
   only what they need); one `game.js` is acceptable if the release role prefers a single cache-busted file. Price
   data stays separate either way.

## Decisions taken here

- Data files are classic scripts assigning strict JSON to `window.FGP_DATA.<section>`, one record per line, with
  the dataset/build key repeated in every file and checked by the page.
- Split by section (`items`, `recipes`, `mats`, `sources`, `enchants`, `rules`, `reference`, `prices-default`), not by
  level or profession.
- Items keyed by item ID, recipes by craft spell ID, NPCs by slug; names are never keys.
- Mats normalised out of recipes; prices and costs out of game data entirely.
- `avail` (`ok`/`unconfirmed`/`unobtainable`) and `origin` (`vanilla`/`forever`/`sod`) on every item; `certainty`
  and `side` on every source entry.
- Enchant records keep the prototype's shape minus `crafter`, `cost`, `ah`, with sources in the common format.
- Curation files are schema-checked JSON with `why`/`cite`/`checked`/`names` fields, grouped by family, merged at
  generation time.
- Class facts live in the theorycraft file; `rules.js` keeps professions (with specialisations), slots and stat
  labels.
- Items carry a derived `mirror` group (identical stats) for faction pairs; patterns carry `spec`.
