# UI: views, flows and user state

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: product/UX. Companion document: `vision-scope.md` (personas, availability rules, scope).
Grounded in the prototype's UI code (`app.js`: `defaults`/`normalize`, `wearNow`, `slotPanel`, `viewCharacters`,
`viewQueue`, `viewFavor`, `viewEnchants`, `viewConsumables`, `viewNotes`, the tooltip and toast code) and its enchant
rules. Function names below refer to the prototype.

## 1. Design principles

1. **One question per view.** Gear: "what does this character wear, get and enchant next?" Queue: "what does this
   crafter make, and what do I buy?" Favor: "which pattern next?" The rest is reference.
2. **The plan is computed, the user only corrects it.** Users enter facts (class, role, level, professions, skill,
   what they have); the page derives the path. Corrections are "hide for this character" and "buy this one
   instead", not hand-built plans.
3. **Never show an item the character can't get.** Availability (vision §5) is a hard filter. Where crafting has
   nothing, say so ("crafting has no Head piece before 27") instead of padding.
4. **Offline by default, quiet by default.** No network request until the user opts in. No modal unless data would
   be lost.
5. **Keep the prototype's interaction grammar.** Its users (the original user first) already know: slot lanes, Next upgrades,
   Full plan, status select, ✕ to hide with Undo, keyboard shortcuts `1`–`n`, `/`, `[` `]`, `h`, `u`, `t`, `Esc`.

## 2. Navigation and the fate of the prototype's views

Header: brand, view tabs with number keys, search (`/`), faction badge (opens roster settings), settings menu
(theme, tooltips, icons, export, import, reset). The prototype put Export/Import/Reset/Tooltips/Icons/Theme as six
header buttons; they move into one settings menu because the header now also carries the roster.

| # | Public view | Prototype source | Survives | Changes | Dropped |
|---|---|---|---|---|---|
| 1 | **Gear** (per character) | `viewCharacters`, `slotPanel`, `wearNow`, `itemTable` | Cards with inline level input and core progress bar; filter bar (Core only, Hide done, Hide unobtainable, Show hidden); slot lanes with states; Next upgrades (L+1…L+5); Full plan grouped by level with "up to level"; hide/undo; enchant line per row | Cards show class, label, role, professions instead of name/race; lane track 1–60 instead of 1–30; "Crafter" column becomes **Get via** (self / roster crafter → mail / AH); status "crafted" becomes "in bags"; a "+ Add character" card | Plan notes per curated plan (replaced by per-item notes from curation overrides); the "binds to crafter" warning (such rows can no longer exist) |
| 2 | **Queue** | `viewQueue`, `queueRows` | Crafter selector; skill inputs; rows with recipe-learned box, skill colouring (craftable / soon / dim), "who needs it @level, now L" buttons that mark the piece made, Qty, Source, Each, Total; Shopping list with "within N levels"; Show hidden | Crafters = roster entries with a crafting profession, plus an **Auction House** pseudo-crafter (BoE pieces nobody in the roster makes); learned keyed by recipe spell ID; skill inputs write to the roster entry; mat rows show "roster gathers this" | Kits/consumables section keyed by named crafters (becomes profession-based) |
| 3 | **Favor** | `viewFavor` | Per-crafter panel, balance input, ordered list with running total, "can afford next", bought checkboxes, "How Merchant's Favor works" | Order and reason are computed, not curated `why` texts; vendor names per faction | — |
| 4 | **Enchants** | `viewEnchants` + the enchant column (`enchPlan`, `openEnchMenu`, `warnEquip`) | Reference table by slot (Forever vs Era effect, skill, mats, source); kits/spikes/scopes table; per-piece recommendation, menu, applied toggle, equip warning | Enchanters = roster entries with Enchanting; kit "crafter" shows the roster entry or "AH"; pre-mail kit route uses any roster entry at the kit's level | "Shopping lists by class" (hand-written for one household, levels 1–30) until rewritten per role |
| 5 | **Consumables** | `viewConsumables` | Full table with category and class filters | Bring lists per class **and role** and level band, with "made by" resolved to a roster entry, "self" (First Aid, Cooking), "class" (poisons) or "AH" | Bring lists that name characters |
| 6 | **Prices** (new) | — (the prototype only shows `meta.priceScan`) | — | Price source status, Auctionator import, overrides (pricing document) | — |
| 7 | **About** | `viewNotes` | Data panel (build, generated, price date, notes), open questions to check in game, What Forever changed, recipe sources with profession filter, vendors, storage status | Recipe sources and vendors filtered by the roster's faction (toggle to show both); "Your data" section (export/import/reset, orphaned entries, privacy statement) | Curated `skillTable` (replaced by a computed "crafter pace" panel in the Queue); "Plans" section (no plans any more); "Data check" moves behind `?debug` |

## 3. Onboarding

### 3.1 Empty state

Shown when the roster is empty (first visit, after Reset, or storage blocked). No tabs are hidden, but every view
other than About shows a one-line pointer back to this panel.

```
+--------------------------------------------------------------------------------------------------------+
| ◆ Forever Crafted Gear   Gear 1  Queue 2  Favor 3  Enchants 4  Consumables 5  Prices 6  About 7         |
|                                                                    [Search … ( / )]   [⚙ Settings]     |
+--------------------------------------------------------------------------------------------------------+
|                                                                                                        |
|   Plan crafted gear for WoW: Forever, levels 1–60.                                                     |
|   Tell the planner which characters you level. It works out, per slot and level, which crafted         |
|   piece to make or buy, who in your roster can make it, and what it costs.                             |
|   Everything stays in this browser. Data: build 1.60.1.x (beta), prices from 2026-10-07.               |
|                                                                                                        |
|   Faction   (•) Alliance   ( ) Horde                                                                   |
|             Recipe vendors, Merchant's Favor vendors and the Auction House differ by faction,          |
|             and mail only reaches characters of the same faction.                                      |
|                                                                                                        |
|   ┌──────────────────────────────┐  ┌──────────────────────────────┐  ┌──────────────────────────┐     |
|   │  I play one character        │  │  I level several characters  │  │  Show me an example      │     |
|   │  Buy crafted gear on the AH, │  │  Crafters make gear for alts │  │  A 3-character roster    │     |
|   │  or craft for myself.        │  │  and mail it.                │  │  you can edit or clear.  │     |
|   └──────────────────────────────┘  └──────────────────────────────┘  └──────────────────────────┘     |
|                                                                                                        |
|   Have a saved file?  [Import planner file…]                                                           |
+--------------------------------------------------------------------------------------------------------+
```

- **"I play one character"** opens the entry form once, with the professions block collapsed behind "This character
  has professions (optional)". Submit goes straight to the Gear view. This is the single-character, no-professions
  path: four inputs (class, role, level, faction) and one button.
- **"I level several characters"** opens the same form with professions expanded and a second submit button "Add and
  add another". After the second entry the form offers "Done" as primary.
- **"Show me an example"** loads a generic roster (Mage Tailoring+Enchanting level 20, Warrior Mining+Blacksmithing
  level 14, Rogue level 9 without professions, all labelled "Example") and shows a dismissible banner "Example roster:
  edit or [Clear example]". It exists so a visitor understands the tool before typing anything.
- **Faction** defaults to Alliance (the only side the prototype's research covers so far), is asked once here, and
  later lives in roster settings (header badge). Changing it later re-filters sources, warns that Favor balances and
  recipe checkmarks may no longer apply, and keeps all state.

### 3.2 Entry form (add and edit)

The same form serves add (inline in onboarding, or a side panel from the "+ Add character" card) and edit (side panel
from a card's Edit button). It is a real `<form>` with `<fieldset>`/`<legend>` groups.

```
┌ Add a character ───────────────────────────────────────────────────────────────┐
│ Class      [Druid] [Hunter] [Mage] [Paladin] [Priest]                          │
│            [Rogue] [Shaman] [Warlock] [Warrior]          (radio group, colours │
│                                                           + text labels)       │
│ Role       (•) Caster: Spell Power, Intellect                                  │
│            ( ) Healer: Healing, Intellect, Spirit                              │
│            School  [Any ▾]  (Frost, Fire, Arcane, Shadow …; casters only)      │
│ Level      [ 1 ]  (1–60)                                                       │
│ ▾ Professions (optional, up to two)                                            │
│   1 [Tailoring     ▾]  skill [   ]  empty = estimated from level (~)           │
│   2 [Enchanting    ▾]  skill [   ]                                             │
│ Label      [            ]  optional, e.g. "Main", "Alt 2". Stays in this       │
│                            browser and in files you export.                    │
│                                                                                │
│ [Add and show plan]   [Add and add another]                       [Cancel]     │
│ (edit mode: [Save]  [Delete character…]  [Cancel])                             │
└────────────────────────────────────────────────────────────────────────────────┘
```

Rules:

- Class first; the role list depends on it (theorycraft data). Default role = the class's first listed role. The
  school select appears only for caster/healer roles and defaults to "Any".
- Profession options: "None", the six crafting professions the prototype's generator already knows
  (Alchemy, Blacksmithing, Enchanting, Engineering, Leatherworking, Tailoring) plus the gathering ones (Herbalism,
  Mining, Skinning). Secondary professions (Cooking, First Aid, Fishing) are not asked: every character can have them
  and the consumables view treats them as "self", as the prototype's `crafterLabel("self")` does. The same profession
  twice is rejected with an inline message.
- Skill: optional, 0 to the data's skill cap (300 for 1–60). Empty means "estimated from level" and is shown with
  `~` everywhere, like the prototype's assumed skill (`PACE` in its enchant rules).
- Label: optional, max 24 characters, plain text, always escaped. Display name = label, else class; duplicates get a
  suffix ("Warrior", "Warrior 2"). The label is never used as a key.
- Validation messages sit under the field and are linked with `aria-describedby`; the submit button is never
  disabled silently.
- Delete asks in a `<dialog>`: "Delete Alt 2 (Warrior 14)? This removes 23 tracked items, 4 enchant picks and 6
  recipe marks." After deletion an Undo toast stays for 6 s (the prototype's toast-with-action pattern).

### 3.3 Roster settings

Opened from the faction badge in the header: Faction; "Include AH purchases" (default on); "Prefer roster crafting
over AH" (default on). Each with one line of explanation. Changing a setting re-renders immediately; nothing is
deleted.

## 4. Gear view (main view)

### 4.1 Layout

```
+----------------------------------------------------------------------------------------------------------------+
| ◆ Forever Crafted Gear  Gear 1 Queue 2 Favor 3 Enchants 4 Consumables 5 Prices 6 About 7                       |
|                                                       [Search items, mats… ( / )]  [Alliance ▾]  [⚙]          |
+----------------------------------------------------------------------------------------------------------------+
| ┌ Alt 1 · Mage ──────────┐ ┌ Warrior ─────────────┐ ┌ Rogue ───────────────┐ ┌ Priest ────────────┐ ┌──────┐ |
| │ Lvl [22]  Caster·Frost │ │ Lvl [14]  Melee      │ │ Lvl [9]  Melee       │ │ Lvl [12]  Healer   │ │  +   │ |
| │ Tail 130 · Ench ~110   │ │ Mining · BS 70       │ │ no professions       │ │ Herb · Alch ~60    │ │ Add  │ |
| │ 7/11 core ███████░░░░  │ │ 4/9 core ████░░░░░   │ │ 1/8 core █░░░░░░░    │ │ 3/10 core ███░░░░  │ │      │ |
| │ 2 soon          [Edit] │ │                [Edit]│ │ 3 soon        [Edit] │ │             [Edit] │ └──────┘ |
| └────────────────────────┘ └──────────────────────┘ └──────────────────────┘ └────────────────────┘          |
|                                                                                                                |
| Alt 1  Level 22 Mage · Caster (Frost) · Cloth · Tailoring 130, Enchanting ~110                                 |
| [ ] Core only  [ ] Hide done  [x] Hide unobtainable  [ ] Show hidden (2)            [✦ Enchants: on]           |
|                                                                                                                |
| Slots      ● worn  ● in bags  ● get now  ● upgrade ready  ○ empty   ◆ core                 [All slots]         |
| Head       ○ empty until 25          |1····5····10···15···20··▲·25···30···35···40···45···50···55···60|         |
|                                       markers:                       ◆25      ◆35        ◆48                    |
| Shoulder   ● Reinforced Woolen Shoulders 19   ◆17 ●19 ◆25 ...          next: Invoker's Mantle 25  Self         |
| Chest      ● Lesser Wizard's Robe 22  in bags ✦ Lesser Stats (todo)    next: Green Silk Armor 28  Self         |
| Hands      ● Silky Gloves 15 (BoP)    worn                              next: —                                |
| Main hand  ● Glimmering Staff … (two-hander)   Off hand: two-hander worn                                       |
| Wrist      ● Green Linen Bracers 7    worn ✦ Minor Intellect (applied)                                         |
| Not planned: Neck, Finger, Trinket                                                                             |
|                                                                                                                |
| Next upgrades  levels 23–27                                                                                    |
| Lvl | Item                         | Slot      | Stats            | Bind | Get via          | Mats | AH   | Status   |
| 24  | Azure Silk Hood         CORE | Head      | +8 Sta +10 Frost | BoE  | Self · Tail 130  | 32s  | 14s  | [to get▾]✕|
|     |  ✦ enchant: none fits                                                                                     |
| 25  | Invoker's Mantle        CORE | Shoulder  | +5 Int +7 SP     | BoE  | Self · Tail ~150!| 81s  | 95s  | [to get▾]✕|
|     |  recipe: world drop pattern (AH) · needs Tailoring 150, you have 130                                      |
|                                                                                                                |
| Full plan                                    up to level [   ]   41 of 58 entries shown                        |
| (grouped by level, "◂ current 22" marker, same columns)                                                        |
+----------------------------------------------------------------------------------------------------------------+
| Build 1.60.1.x (beta) · data 2026-10-07 · prices: default list 2026-10-07 · Keys: 1–7 views, / search, …       |
+----------------------------------------------------------------------------------------------------------------+
```

### 4.2 What each part shows

- **Cards** (prototype `viewCharacters` cards): display name, class colour bar, inline level input (debounced 250 ms
  as in the prototype's `input` handler), role (and school), professions with skill (`~` when estimated), core
  progress (core pieces equipped / planned up to level 60) and "N soon" (open upgrades within 5 levels). The selected
  card is `aria-pressed`. `[` and `]` cycle entries (prototype shortcut).
- **Detail header**: level, class, role, armor type (from class and level: mail/plate from 40 where it applies),
  professions.
- **Slot lanes** (prototype `slotPanel` + `wearNow`): one row per slot that has candidates; the track runs 1–60
  (prototype `TRACK_MAX = 30` becomes 60; ticks every 5; the current level is a ▲ marker). States keep the
  prototype's semantics with one rename: worn (equipped), in bags, **get now** (was "craft now": the best piece at this
  level isn't in hand; it may be crafted or bought), upgrade ready, empty, two-hander worn, not planned. The weapon
  logic (two-hander vs one-hand + off hand, dual wield for Rogue/Warrior/Hunter, and Shaman once the data says so)
  is kept from `wearNow`. Clicking a lane filters both tables to that slot (prototype `prefs.slot`).
- **Next upgrades**: entries with level in L+1…L+5, not done, after filters (prototype logic unchanged).
- **Full plan**: all entries grouped by level with "◂ current L"; "up to level" limits it (prototype `upTo`).
- **Columns**: Lvl · Item (CORE mark, note, enchant line) · Slot/type · Stats chips · Bind · **Get via** · Source
  (recipe source badge: Trainer, Vendor, Favor 30, Reputation, Drop, Dungeon) · Skill · Mats · AH · Status (+ ✕).
  Mats and AH both stay (as in the prototype); the one that applies to the route is bold, the other is context.
- **Get via** values (the availability rules of vision §5, rendered):
  - `Self · Tailoring 130` (wearer crafts; BoP or BoE).
  - `Alt 2 → mail` with the crafter's class colour (BoE, roster crafter).
  - `AH · 95s` or `AH · no price seen` (BoE, nobody in the roster crafts it, or the user chose "buy instead").
  - A `!` marker when the crafter's skill (entered or estimated) is below the recipe skill; the row's sub-line says
    "needs Tailoring 150, Alt 1 has 130".
  - Clicking the cell opens a small menu: the crafter choice if several roster entries have the profession, "Buy on
    AH instead", "Back to recommended". Stored as item state `via` (§10).
- **Status**: select with "to get / in bags / equipped" (prototype "needed / crafted / equipped"). Equipping a BoE
  piece whose planned enchant still has to be applied by another roster entry asks first (prototype `warnEquip`,
  generalised from its single named enchanter to "the roster's enchanter").
- **Hide** (✕, `h`): "not for this character", Undo toast (`u`). The next-best candidate takes the hidden piece's
  place in the path, so hide is also how a user says "I prefer the other one". The prototype's hidden list under Full
  plan and "Show hidden (N)" stay.

### 4.3 How the path is formed (UX contract for the ranking)

The prototype reads curated `plans` (`plansFor`, `buildEntries`). The public tool computes entries in the browser per
roster entry, because candidates depend on the roster:

1. Candidates for entry E = craftable equipment items that E's class can use at some level ≤ 60, that pass the
   availability rules (vision §5) for the current roster and settings, whose recipe the roster's faction can obtain
   (or whose BoE recipe can come from the AH), and that are not hidden for E.
2. For each slot and each level L = 1…60: best candidate with required level ≤ L by the role score (theorycraft).
3. The path for a slot is the sequence of distinct bests. A step is **core** when it stays best for at least 5 levels
   or until 60; shorter steps are optional (shown without the CORE mark, filtered out by "Core only"). This replaces
   the prototype's curated `core` flag with a rule the user can see in the tooltip ("best for Head 25–34").
4. Entry level = the item's required level. Skill shortfalls are shown (`!`), not used to move the level.
5. Pieces in hand win: as in `wearNow`'s `score`, an item marked "in bags" or "equipped" counts as worn even when a
   newly ranked item would score slightly higher; the newer one becomes "upgrade ready". So a data update or a
   settings change never silently replaces what the user already has.
6. Unobtainable recipes stay in the data but are filtered by "Hide unobtainable" (on by default, prototype default).

## 5. Queue view

```
Crafter  [Alt 1 · Tail/Ench] [Warrior · BS] [Priest · Alch] [Auction House] [All]
Tailoring skill [130]   Enchanting skill [   ] ~110            [ ] Core only [ ] Show hidden (1)

To craft · 9 recipes not yet in bags or equipped. Click a name to mark it in bags.
Lrn | Skill    | Item                      | For, at level                         | Qty | Source      | Each | Total
[x] | Tail 130 | Lesser Wizard's Robe Chest| [Alt 1 @22 now 22] [Priest @22 now 12]| 2   | Trainer     | 48s  | 96s
[ ] | Tail ~135| Silk Headband       Head  | [Priest @27 now 12]*                  | 1   | Trainer     | 50s  | 50s

Crafter pace  Tailoring: Priest reaches 27 → needs 135 · Alt 1 has 130
Shopping list   only needed within [5] levels of each character
Material        | Count | Unit | Price from     | Total  | Roster gathers
Bolt of Silk    | 6     | 32s  | craft (cheaper)| 1g92s  |
Frilled Lichen  | 4     | 65s  | AH 2026-10-07  | 2g60s  | Priest (Herbalism)
Total 4g52s · 1 material without a price
```

- Crafter buttons: every roster entry with at least one crafting profession, then **Auction House**, then **All**
  (prototype `crafterKeys` + "All crafters").
- **Auction House** lists BoE pieces routed to the AH: Item · For whom at which level · AH price · price source/date ·
  button "mark in bags". No mats, no learned box. For persona B this is the main to-do list.
- Rows, Qty, totals, "within N levels", Show hidden: prototype behaviour. "Who needs it" buttons mark the piece "in
  bags" for that character.
- Learned: per crafter and **recipe spell ID** (the prototype keyed by item ID and, for consumables, by name).
- **Crafter pace** (new, replaces the curated `skillTable` in Notes): per profession, the next three breakpoints
  "character X reaches level N → needs skill S", computed from the queue rows. Tells the crafter how far ahead to
  stay.
- Kits and consumables the crafter makes stay as a section, resolved by profession instead of a named crafter.

**M2 implementation notes (2026-10-08, `site/lib/queue.js`, `site/app/queue.js`), where this section left a choice
open:**

- Rows come from the main path steps of every entry (not the alternatives), one need per entry and item from the
  earliest stretch the entry has not outgrown (`to ≥ level`); pieces in bags or equipped leave the queue. A
  dual-wielded weapon counts twice. "Core only" is the Gear view's filter (one pref for both views).
- "Within N levels" (default 5, empty = every level) decides what the shopping list counts; names outside the window
  are dimmed in the To craft table, as in the prototype.
- Skill column: the recipe's skill with `!` (entered skill below) or `~!` (estimated below), estimated as the Gear
  view does (pace at the piece's required level). The skill inputs edit the roster entry's profession skill.
- Crafter pace: for each profession, the needs sorted by how soon the character reaches the level, then the
  running maximum of the recipe skill; the first three steps above the crafter's skill (entered, else `roles.pace`
  at the crafter's level) are shown, with "has S".
- Shopping list: an intermediate is expanded into its mats when the row's crafter has the intermediate's
  profession and crafting it is the cheaper (or only) price; otherwise the intermediate is bought as a line. Crafts
  round up to whole recipe outputs. "Value of mats used" and "To buy" per pricing §5.2.
- The crafter choice on a queue row applies to every character of that row; on a Gear row it applies to that
  character. Marking a piece in bags from the Queue stores `via` = the row's crafter (or `"ah"`).
- Kits, enchants and consumables are left out until their data exists (M3, M4); the view says so in one line.

## 6. Merchant's Favor view

It generalises cleanly: Favor patterns are recipes with a Favor cost, BoP to the buyer, and the buyer is a roster
crafter. One panel per roster entry with Tailoring, Leatherworking or Blacksmithing (and any other profession the data
lists Favor patterns for):

- Balance input (per entry, prototype `S.favor[ck]`), "Can afford next", running total, "spent so far".
- Buy order computed: for each Favor pattern the crafter can learn (faction vendor), value = Σ over roster entries
  that would wear the result (only the crafter for BoP results) of (score gain over the next-best candidate in that
  slot × levels the piece stays best) ÷ Favor cost. Generated reason replaces the curated `why`, e.g. "Head: no other
  crafted head until 27 (+18 score for 7 levels)".
- Bought checkbox = recipe state "bought" (§10); a learned recipe counts as bought.
- Vendor and turn-in info (the prototype's `favorInfo`) per faction: Three Corners, Redridge for the Alliance; the
  Durotar supply post for the Horde.
- Empty state for rosters without such a crafter: one sentence and a pointer to the About page's Favor explanation.

## 7. Enchants and kits

- The per-piece enchant line in the Gear view survives as it is (recommendation, menu with alternatives, "None
  (dismiss)", applied toggle, prep line with totals). The rules move from "one named enchanter + household list" to
  "roster entries with Enchanting" and "any roster entry at the kit's level" (pre-mail kit route).
- Without an enchanter in the roster: kits, spikes, scopes and attachments still show (they are items and can be
  bought); enchants show as a collapsed note "needs an enchanter (trade window)", off by default (vision Open
  question 5).
- The Enchants tab keeps the prototype's reference tables (by slot, Forever vs Era effect, skill, mats, source; kits
  table), with the crafter column showing a roster entry or "AH". The curated "Shopping lists by class" are dropped
  until someone writes them per role.

## 8. Consumables

Reference table with category and class filters (prototype), plus bring lists per class and role and level band. The
"made by" cell resolves to a roster entry, "self", "class" or "AH". Pre-filter: the selected entry's class. This view
depends on hand-maintained data that today covers levels 1–30 and one faction, so it is a late milestone.

## 9. Prices and About

- **Prices** (owned by the pricing document; UI expectations here): a status block ("Prices: default list from
  2026-10-07, 1,240 items" / "Imported: Auctionator file, realm X (Alliance), scanned 2026-11-06"), an **Import
  Auctionator file…** button (file picker; the Auctionator file lives in the game's saved-variables folder, and the
  page explains where in one line), a realm/faction picker when the file holds several, and an override table (item,
  your price, clear). Every price shown anywhere carries its source in its tooltip ("AH min buyout, scan 2026-11-06" /
  "vendor" / "craft (cheaper)" / "your override").
- **About**: data freshness first (build, data generated, price date, "beta data, nothing Blizzard-confirmed" until
  the live build is in), then what Forever changed, recipe sources and vendors (faction-filtered), open questions to
  check in game, Favor explanation, then **Your data**: storage status, export/import/reset, orphaned entries after a
  data update (§10.6), and the privacy statement "nothing leaves your browser unless you turn on Wowhead tooltips or
  icons".
- A thin **freshness banner** appears when the price date is older than 14 days or the data build differs from the
  last one the user saw (§10.6). Dismissible per build.

## 10. User-state model

### 10.1 Storage

- One `localStorage` key: **`foreverCraftedGear`** (final string follows the repo name). It must differ from the
  prototype's `foreverGearPlanner.v1`, because pages opened from `file://` can share one storage origin in some
  browsers, and the two formats are incompatible.
- The value is one JSON object with `schema` (integer, starts at 1). The key never changes; schema bumps migrate in
  place (§10.5). Rationale: one place to read, no orphaned old keys.
- Imported price scans may be large and are stored under their own key (pricing document); user overrides are part
  of the main state so that export carries them.
- Every read and write is wrapped in try/catch (prototype `load`/`save`); when storage fails, the banner says so and
  points to Export (prototype `renderBanner`).
- Another tab writing the key (`storage` event) reloads the state and re-renders, with a toast "Updated from another
  tab". Last write wins.

### 10.2 Shape (schema 1)

```json
{
  "schema": 1,
  "app": "forever-crafted-gear",
  "seen": { "build": "1.60.1.70205", "generated": "2026-10-07T08:16" },
  "roster": {
    "faction": "alliance",
    "includeAH": true,
    "preferRoster": true,
    "entries": [
      { "id": "r4k9q2x", "cls": "Mage", "label": "Alt 1", "role": "caster", "school": "frost", "level": 22,
        "professions": [ { "id": "Tailoring", "skill": 130 }, { "id": "Enchanting", "skill": null } ],
        "favor": 40 },
      { "id": "r0b7m3c", "cls": "Warrior", "label": "", "role": "melee", "school": null, "level": 14,
        "professions": [ { "id": "Mining", "skill": null }, { "id": "Blacksmithing", "skill": 70 } ],
        "favor": 0 }
    ]
  },
  "items": {
    "r4k9q2x:4312": { "status": "equipped", "enchant": { "pick": "spell:7857", "applied": true } },
    "r4k9q2x:4316": { "hidden": true },
    "r0b7m3c:2857": { "status": "have", "via": "ah" }
  },
  "recipes": {
    "r4k9q2x:8770": "learned",
    "r0b7m3c:1234567": "bought"
  },
  "prices": { "overrides": { "4339": 3200 } },
  "prefs": {
    "selected": "r4k9q2x", "theme": "auto", "tooltips": "planner", "icons": false,
    "filters": { "core": false, "hideDone": false, "hideUnob": true },
    "showHidden": { "gear": false, "queue": false },
    "slot": "", "upTo": { "r4k9q2x": 30 }, "showEnchants": true,
    "queueSel": "r4k9q2x", "within": "5",
    "enchSlot": "", "consCat": "", "consClass": "", "rsProf": "", "rsBothFactions": false,
    "dismissed": { "freshness": "1.60.1.70205", "example": false }
  }
}
```

(Item and spell IDs in the example are illustrative.)

### 10.3 Keys and IDs

- **Roster entry ID**: `"r"` + 6 random base-36 characters from `crypto.getRandomValues` (fallback `Math.random`),
  checked for collisions, never derived from the label or class. Validation regex `^r[0-9a-z]{6}$`. Entry order in
  the array is the display order.
- **Per-entry per-item state**: one map `items` keyed `"<entryId>:<itemId>"` (the prototype's `"<char>:<itemId>"`
  with an ID instead of a name). The prototype's separate `status`, `hidden` and `enchants` maps merge into one value
  object, so deleting an entry or cleaning orphans is one prefix scan:
  - `status`: absent = to get, `"have"` (in bags), `"equipped"`.
  - `hidden`: `true` or absent.
  - `via`: absent = recommended route, `"ah"`, or a crafter entry ID.
  - `enchant`: `{ pick: "spell:<id>" | "item:<id>" | "none", applied: true }`, same validation as the prototype's
    `normalize`.
  - An object with no fields left is deleted.
- **Per-crafter recipe state**: `recipes["<entryId>:<recipeSpellId>"]` = `"bought"` or `"learned"`. It merges the
  prototype's `learned` and `favorBought` (a bought Favor pattern is a recipe the crafter owns). Spell IDs, not item
  names, so consumable recipes no longer key by name (`"<char>:c:<name>"` in the prototype).
- **Favor balance**: on the roster entry (`favor`), see vision Open question 2.

### 10.4 Prefs

Carried over from the prototype's `prefs`: `selected`, `theme`, `tooltips`, `icons`, `filters`, `showHidden`
(renamed key `characters` → `gear`), `slot`, `upTo` (now keyed by entry ID), `showEnchants`, `within`, `enchSlot`,
`consCat`, `consClass`, `rsProf`. Moved: `skills` (now on the roster entry's profession), `queueCrafter` → `queueSel`.
Dropped: `bringClass` (bring lists follow the selected entry). New: `rsBothFactions`, `dismissed`.

### 10.5 Versioning and migration

- `load()`: parse → if `schema` > current: show a banner "saved by a newer version of this page; reload to update",
  work on a read-only copy and **do not save** (no clobbering). If `schema` < current: copy the raw string to
  `foreverCraftedGear.backup.<schema>`, run `migrate[n]` functions in order up to the current schema, then
  `normalize()`.
- `normalize()` keeps the prototype's approach: start from `defaults()`, copy only known keys, validate every map key
  with a regex and every value against its allowed set, clamp levels to 1–60 and skills to 0–cap, drop the rest. It
  runs on every load and every import, so a hand-edited or old file can't break rendering.
- Migrations are pure functions with node tests (one fixture file per schema).

### 10.6 When the data is regenerated (new build)

- `seen.build`/`seen.generated` are compared with the loaded data's `meta`. If they differ:
  1. Nothing is deleted. Item and recipe keys whose IDs are missing from the new data become **orphans**: not shown in
     the plan, listed in About → Your data with the item name if the user's export or the old data still knows it,
     else the ID, plus "Remove orphans".
  2. A banner: "Game data updated: build A → B. Your progress is kept. Recommendations may have changed; pieces you
     have stay in your plan. 3 tracked items are no longer in the data [show]." Dismiss updates `seen`.
  3. Because pieces in hand win (§4.3 rule 5), equipped and in-bag items never jump; only "to get" steps can change.
- Item IDs are stable across Forever builds in DB2, so a normal refresh (the 2026-11-05 live build) should produce
  few or no orphans; the mechanism exists for removed or replaced items.

### 10.7 Export and import

- **Export** (settings menu and About): downloads `forever-crafted-gear-YYYY-MM-DD.json` = the state plus
  `exported` (ISO time) and `dataBuild`. Imported price scans are excluded by default; a checkbox "include imported
  prices" adds them.
- **Import**: file picker → validate (`app` matches, `schema` ≤ current) → a `<dialog>` summarising the file
  ("4 characters, 61 tracked items, exported 2026-10-20, data build …") with **Replace current data** / Cancel. Then
  migrate + normalize. Merge is out of scope for v1. The prototype used `window.confirm`/`window.alert`; the dialog
  replaces them for accessibility and to show the summary.
- **Reset**: dialog "Delete all characters and progress? Export first if you want a backup." with an **Export
  first** button inside. Keeps theme, tooltip and icon prefs (prototype behaviour).

## 11. Tooltips and icons, offline-first

- Default tooltip source "planner": built from the shipped data (prototype `itemTip`, `matTip`), shown on hover,
  keyboard focus and tap, positioned in one fixed element (prototype `showTip`/`placeTip`). The planner block adds
  **Get via**, recipe source (faction-aware), skill, mats with prices and price sources, AH price, and "best for
  <slot> L1–L2".
- Every item name links to `https://www.wowhead.com/forever/item=<id>` (opens in a new tab; no request until
  clicked).
- **Wowhead tooltips** (opt-in, settings): loads Wowhead's tooltip script only when chosen (prototype `loadWowhead`),
  with a one-line note "loads a script from Wowhead; needs internet". Failure falls back to planner tooltips with a
  toast (prototype behaviour).
- **Icons** (opt-in, default off): `<img>` from Wowhead's image server using icon names shipped in the data; images
  that fail disappear (prototype error handler). No icons are bundled (Blizzard art, size).
- Our own tooltips for plan-specific things (enchant decisions, prep totals) stay ours in both modes (prototype
  rule).

## 12. Accessibility basics

- Every action reachable by keyboard; visible focus; focus restored after re-render by element ID (prototype
  `render`), and moved to a sensible neighbour after hide/unhide/delete (prototype `setHidden`/`nearbyIds`).
- Shortcuts are single keys only outside text inputs, listed in the footer and in a `?` help dialog; none override
  browser or screen-reader keys.
- No information by colour alone: class colours always come with the class name, quality colours with the item name,
  lane states with a text label in the legend and in the lane's accessible name, Get via with words, not only
  colour.
- Tables are real `<table>`s with `<th>`; segmented buttons use `aria-pressed`; the enchant menu keeps its
  `role="menu"` keyboard model (arrows, Home/End, Esc); tooltips are referenced with `aria-describedby` while
  visible; toasts are `role="status"` `aria-live="polite"`.
- Forms use `<label>`, `<fieldset>`/`<legend>`, inline errors with `aria-describedby`; dialogs use `<dialog>` with
  focus on the safe choice (prototype `confirmToast` puts focus on Cancel).
- Contrast: both themes (auto/light/dark, pre-paint theme script from the prototype) meet WCAG AA for text,
  including quality colours on the light theme (green/blue item names need darker light-theme variants).
- `prefers-reduced-motion` disables transitions.

## 13. Desktop-first

- Designed for 1920×1080 and usable down to 1280 px wide; the Gear view's lanes and tables are the widest element
  (11 columns at 1280 px with the prototype's column set).
- Below that, the prototype's existing breakpoints (1700, 1100, 760 px) keep working: cards wrap, tables scroll
  horizontally inside their wrappers, the header wraps. No mobile-specific layout, gestures or tests. The prototype's
  touch tooltip handling (first tap shows, second follows) stays because it costs nothing.

## 14. Milestone 1: the first usable page (UX minimum)

Must have:

1. Empty state with the three starts (one character / several / example) and the faction choice.
2. Entry form (add, edit, delete with Undo) with class, role (+ school), level, professions (+ optional skill),
   label; roster settings with faction and the two AH switches.
3. Gear view: cards with level input, slot lanes 1–60 with states, Next upgrades, Full plan, filters, Get via, status
   select, hide with Undo, search.
4. Planner tooltips (offline) and Wowhead links; Wowhead tooltips/icons may wait.
5. Prices from the shipped default list only (Mats and AH columns); no import yet.
6. About with data freshness and "Your data": export, import, reset, storage status.
7. State model of §10 at schema 1 (with `normalize`, export/import, data-update banner); migration code can be the
   empty chain.

Can wait: Queue (M2, with the Auctionator import), Favor and the enchant column (M3), Consumables (M4), Wowhead
tooltips and icons, crafter pace, orphan cleanup UI (the banner alone is enough in M1).

Acceptance from the UX side:

- A fresh browser, Alliance, "I play one character", Priest healer level 12, no professions: the Gear view lists only
  BoE crafted pieces, each with an AH price or "no AH price seen", within 6 interactions.
- The example roster: Tailoring BoP pieces appear only on the Mage; Blacksmithing BoE weapons appear on the Rogue
  with "Warrior → mail" (or the Warrior's label); no row anywhere shows a BoP piece for a non-crafter.
- Keyboard only: add an entry, change its level, hide a piece and undo, switch entries with `[` `]`.
- Export → Reset → Import restores the same view.
- Opened from `file://` with networking off: all of the above works, no failed requests in the console.

## 15. Code to copy from the prototype (UI side)

Copy and adapt (they are tested in daily use and carry hard-won details):

- Helpers: `esc`, `money`, `moneyText`, `num`, `arr`.
- Tooltip system: `itemTip`, `matTip`, `ttFrame`, `showTip`, `placeTip`, the pointer/focus/touch/scroll handlers,
  `loadWowhead`.
- Slot logic: `slotsOf`, `isTwoHand`, `wearNow` (with entries from §4.3 instead of plans), `slotPanel` (track 60),
  `charProgress`.
- Tables and controls: `itemTable` (Crafter column → Get via), `filterBar`, `statChips`, `bindBadge`,
  `sourceBadge`, `skillText`, `costCell`, `statusSelect`, `hideButton`.
- Interaction: `toast`, `confirmToast`, `setHidden` + `nearbyIds`, the render-with-focus-restore loop, keyboard
  shortcuts, the enchant menu (`openEnchMenu`, `setEnchant`, `toggleApplied`, `warnEquip`) in M3.
- State: the `defaults` → `normalize` → `load`/`save` pattern, export/import plumbing, the pre-paint theme script.
- Styles: class and quality colours, lanes, badges, tables, themes; add Shaman colour.

Do not copy: `charName`, `crafterLabel`, `crafterHay` (name-based), `HOUSE_MATS` and the household tooltip lines,
`plansFor`/`buildEntries` (curated plans), `dataCheck` (rewrite for the new data), `viewFavor`'s data source, the
`skillTable` and Plans sections of `viewNotes`.

## 16. Assumptions about other areas

- **Data model**: data provides per item `id, name, quality, ilvl, req, slot, inv, type, bind, stats, dps, speed,
  damage, armor, icon, profession, skill, mats, source` as the prototype's items do, plus `recipeSpell` (for recipe
  state keys), `reqProfession` (equip requirement, e.g. goggles), `classes` (if restricted), and recipe sources with
  `faction` (`alliance` / `horde` / `both`) and `favor` cost. Consumables and kits carry recipe spell IDs and a
  profession instead of a crafter name. `meta` keeps `build`, `generated`, `priceScan`, `notes`, and adds
  `skillCap`.
- **Theorycraft**: role IDs per class with labels and one-line descriptions for the form; optional `school` for
  caster/healer roles; stat weights; armor proficiency by level; dual-wield and weapon rules per class; an assumed
  skill-by-level pace for every crafting profession up to 60 (extends the prototype's `PACE`).
- **Ranking**: the browser can compute per-slot paths for 10 entries within the time budget in vision §7; the
  pipeline may ship precomputed role scores. "Core" = best for ≥ 5 levels is acceptable to the theorycraft role or
  will be replaced by its rule.
- **Pricing**: exposes `price(itemId)` with source and date; stores imported scans under its own key; keeps user
  overrides in the main state's `prices.overrides` (copper); defines the realm/faction picker.
- **Release**: the page is plain static files; a `?debug` query enables the data-check panel; node tests cover the
  availability function, path computation and migrations.

## 17. Open questions

1. **Faction-specific class restrictions in Forever?** *Recommendation:* data-driven; grey out with a reason, don't
   hide (same as vision Open question 3).
2. **Per-item crafter choice in v1?** When two roster entries share a profession, v1 picks the one with the highest
   (entered or estimated) skill, then the higher level, then roster order. *Recommendation:* ship the `via` field and
   menu in M2 with the Queue, where the choice matters; M1 uses the automatic pick only.
3. **"Core" rule: 5 levels?** *Recommendation:* start with "best for ≥ 5 levels or until 60" and expose the span in
   the tooltip; let the theorycraft role tune the number.
4. **Should the lane track show 1–60 always or zoom around the current level?** 60 levels on ~900 px is 15 px per
   level, enough for markers. *Recommendation:* full 1–60 in v1; revisit only if markers overlap badly in real data.
5. **Include imported price scans in export by default?** *Recommendation:* no; they are large and re-importable.
   Overrides are always included.
6. **Merge on import (combine two files)?** *Recommendation:* no for v1; Replace only, with a summary dialog.
7. **Show enchants when the roster has no enchanter?** *Recommendation:* kits always, enchants as a collapsed
   optional note (vision Open question 5).
8. **localStorage key name.** *Recommendation:* derive from the final repo name, never `foreverGearPlanner.*`.

## 18. Decisions taken here

- Seven tabs: Gear, Queue, Favor, Enchants, Consumables, Prices, About; settings in one menu.
- Onboarding has three starts (one character / several / example roster) and asks the faction up front.
- Status values "to get / in bags / equipped" (stored as absent / `have` / `equipped`).
- "Crafter" column becomes "Get via"; Mats and AH columns both stay, the applicable one bold.
- Hide is the only "prefer the other one" mechanism; no pinning in v1.
- Entry level = required level; skill shortfalls are flagged, not used to shift levels.
- Pieces in hand win over newly ranked ones (from the prototype's `wearNow` scoring).
- One storage key with a `schema` number; migrations in place with a raw backup; newer-schema data opens read-only.
- Per-item state is one object per `"<entryId>:<itemId>"`; recipes (learned + Favor bought) in one map keyed by
  recipe spell ID.
- Data updates never delete user state; orphans are listed and removable.
- Queue gains an "Auction House" pseudo-crafter; curated `skillTable` becomes a computed crafter-pace panel.
- `window.confirm`/`alert` are replaced by `<dialog>`s.
