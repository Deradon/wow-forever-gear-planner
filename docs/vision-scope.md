# Vision and scope

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: product/UX. Companion document: `ui.md` (views, flows, user-state model).
Status: draft for synthesis. Everything here is a proposal unless it is listed as decided in the shared brief.

## 1. One-line pitch

A static web page that tells a WoW: Forever player, for each of their characters and every level from 1 to 60,
which **crafted** piece to wear in each slot, who in their roster can make it (or that it has to be bought on the
Auction House), what it costs, and what each crafter has to make next. It works offline and keeps nothing outside the
player's browser.

## 2. Who the user is

Three kinds of user, all Forever players levelling 1–60 on English clients. The tool has to serve all three with one
model: the second and third are just smaller cases of the first.

| Persona | Roster | What they want from the tool | What changes for them |
|---|---|---|---|
| **A. Alt household** | 2–10 characters on one account and realm, one faction. One or more crafters, alts with no professions. | "Which alt needs what next, who crafts it, what mats do I buy, in which order do my crafters skill?" | BoE gear flows between roster entries by mail; the crafting queue and the mat list are the main value. This is the prototype's user. |
| **B. Solo buyer** | One character, no crafting profession (maybe gathering ones). | "Which crafted greens and blues are worth buying on the AH at my level, and for how much?" | Only BoE crafted items qualify. The plan is a shopping list by level with AH prices. No queue, no Favor. |
| **C. Solo crafter** | One character with one or two crafting professions. | "What can I make for myself, which BoP set pieces are worth Favor, what do I buy for the slots my profession can't fill?" | BoP items of their own profession open up; everything else is BoE from the AH. |

Not a target user: a gold-maker crafting for the AH (see non-goals), a raider planning endgame drops, a theorycrafter
comparing specs to the decimal.

Usage pattern assumed for the design: the page is open on a second monitor or a browser tab while playing, checked at
each level-up or trip to the AH/mailbox, edited in short bursts (bump a level, mark an item made or equipped). Desktop
only; the original user never uses it on a phone (see `ui.md` §11).

## 3. The problem

Forever reworked crafting: retuned skill ranges, new stat types (Spell Power, per-school damage), about 860 new
recipes, new BoP rare sets sold for **Merchant's Favor** (scarce, about three crates by level 20 on beta), and recipe
sources that differ by faction. Classic-era guides are wrong for it, and no existing tool answers "for my set of
characters, what crafted gear do I make or buy at each level?" The prototype answers it for one hand-curated
household up to level 30. Players without the original user's exact household get nothing from it.

Concretely the tool removes these chores:

1. Finding the crafted upgrade per slot at the current level, and the next one coming up (with stats, not names).
2. Knowing which pieces a character can actually obtain: BoP pieces only from its own profession, BoE pieces from a
   roster crafter by mail or from the AH.
3. Merging all alts' needs into one to-do list per crafter, with a mat shopping list and costs.
4. Spending scarce Merchant's Favor on the patterns that buy the most for the roster.
5. Knowing which enchant or armor kit is worth putting on a piece that will be replaced in a few levels, and doing it
   before the piece binds.

## 4. From "one household of named characters" to "a roster of classes"

The prototype bakes one account into the data: eight named characters with race, gender and professions; a crafter
table mapping professions to those characters; plans that name who they are `for` and `only`; a single named
enchanter; a household list for the pre-mail kit route; state keyed `"<character key>:<itemId>"`. All recommendations
are curated per name.

The public model keeps every rule but moves the people out of the data and into the user's browser:

| Prototype (data, by name) | Public tool (user state, by roster entry) |
|---|---|
| `CHARACTERS`: name, race, gender, class, professions, armor, role text, plan keys | Roster entry: generated ID, class, optional label, role, level, up to two primary professions (with optional skill) |
| `CRAFTERS`: profession → named character(s) | Derived at runtime: every roster entry with that profession |
| `CASTERS`, plan `for_`/`only` | Derived from class + role; candidates are ranked per role, not listed per person |
| Curated `PLANS` (item names per level, `core` flag, notes), levels 1–30 | Enumerated craftable equipment, levels 1–60, ranked per role; curation only as overrides and notes |
| `ENCHANTER`, `HOUSEHOLD` in the enchant rules | Every roster entry with Enchanting; the roster itself is the household |
| Faction: implicitly Alliance | Roster setting: Alliance or Horde |
| Per-character Favor buy order with hand-written "why" | Computed buy order per crafter entry with a generated reason |

What stays: the bind rules, the in-hand preference ("pieces already made beat new ones", the prototype's `wearNow`
scoring), the two-hander-vs-one-hand-plus-off-hand comparison, the enchant timing rules (enchant BoE before it binds,
kits are items), the "hide for this character" model, offline tooltips, export/import.

A roster entry is deliberately thin: no name, race, gender or realm. Names are what made the prototype personal; a
label is optional, free text, stays local, and is only ever displayed.

## 5. How the sourcing situation changes the recommendations

The central rule set. It decides which items are **candidates** for a roster entry at all; ranking by role then picks
among candidates. (Ranking itself belongs to the theorycraft and data documents.)

| Item | Wearer has the profession | Another roster entry has it (same faction) | Nobody in the roster has it |
|---|---|---|---|
| **BoP crafted** (e.g. the Silky/Flame cloth sets, Trapper's, Veteran's) | Candidate: "craft yourself". Recipe source matters: trainer, Favor (costs Favor), dungeon drop. | **Not a candidate.** It would bind to the crafter. (The prototype flags this case as "binds to crafter"; the public tool never offers it.) | Not a candidate. |
| **BoE crafted** | Candidate: "craft yourself". | Candidate: "Alt N crafts → mail". | Candidate: "buy on AH" (if a price is known, or flagged "no AH price seen"). |
| **Requires a profession to equip** (e.g. Engineering goggles) | Candidate if the wearer's skill suffices. | Not a candidate. | Not a candidate. |

Consequences per persona:

- **Alt household (A):** each alt's path mixes BoE pieces from roster crafters and (optionally) AH pieces for
  professions nobody has. Crafters additionally get their own BoP pieces. The queue merges all alts' needs per crafter.
  Mats can be priced as "opportunity cost" when the roster gathers them (same convention as the prototype).
- **Solo buyer (B):** only BoE crafted items. Every step shows its AH price; the slot lanes become a buy schedule. The
  queue view becomes an AH shopping list. Favor does not apply. Enchants show as optional ("needs an enchanter",
  e.g. via the trade window's "will not be bound" slot), armor kits as buyable items.
- **Solo crafter (C):** their profession's BoP and BoE pieces plus BoE pieces from the AH for the rest. The Favor view
  ranks patterns for this one character.

Two roster-wide switches tune this (both defaults chosen to be useful for persona A, both visible in onboarding):

- **"Include AH purchases"** (default on). Off = "only what my roster crafts": slots nobody can fill show as gaps,
  the way the prototype shows them. Useful for players who want self-sufficiency.
- **"Prefer roster crafting over AH"** (default on). When a roster crafter can make a BoE piece, the plan routes it
  to them even if the AH is cheaper; the AH price is shown as the alternative in the tooltip. Per-item override:
  "buy this one instead" (see `ui.md`, item state `via`).

Faction matters because recipe sources differ by faction (vendor recipes, Favor vendors at Three Corners for the
Alliance and at the Durotar supply post for the Horde, reputation patterns such as Kirin Tor vs Earthen Ring), because
mail only reaches same-faction characters on the same realm, and because AH prices are per faction (whether Forever
has a cross-faction AH is still unknown). A recipe the roster's faction cannot get is not a candidate unless it is a
BoE recipe that can appear on the AH.

## 6. Scope

### 6.1 In scope for v1 (the public release)

- WoW: Forever only, levels 1–60, English item names, data tied to one build key (decided before the design phase).
- All nine classes, both factions (Shaman and Horde data are new compared to the prototype).
- Roster of 1–10 entries: class, optional label, role, level, up to two primary professions with optional skill,
  roster-wide faction.
- Per-entry gear path by level and slot (wear now, next upgrades, full plan), with status (to get / in bags /
  equipped), hide per entry, availability routing as in §5.
- Crafting queue per crafter entry plus an "Auction House" pseudo-crafter, with mat shopping list, recipe-learned
  checkmarks and costs.
- Merchant's Favor buy order per crafter entry with a balance.
- Enchant/armor-kit recommendation per planned piece (the prototype's enchant column), with enchanters taken from the
  roster.
- Prices: shipped default price list, Auctionator file import in the browser, manual overrides (decided before the design phase;
  details in the pricing document).
- Consumables reference, filtered by the roster's classes and professions.
- About/notes page: build, data generation date, price date, beta caveats, recipe sources and vendors per faction.
- Offline-first tooltips; Wowhead tooltips and icons as an opt-in online extra.
- JSON export/import of the user state; schema versioning and migration.

### 6.2 Later (roadmap candidates, not v1)

- Several rosters (e.g. one per faction or realm) with a switcher.
- "What if" for professions: "if Alt 3 took Leatherworking, these pieces open up" (profession advisor).
- Per-item crafter choice when two roster entries share a profession (v1 picks automatically, see `ui.md`).
- Companion addon that exports levels, professions, skills and prices from the game (ruled out for v1 before the design phase).
- Non-crafted gear: quest rewards and dungeon drops as competing options in a slot.
- Shareable read-only link (roster encoded in the URL fragment).
- Other flavors or level ranges via the build key.
- Localised item names.

### 6.3 Non-goals

- **Not a gold-making tool.** No profit per craft or per hour, no "what to sell" lists.
- **Not a full gear planner.** Quest rewards, dungeon and world drops, PvP gear, set bonuses and BiS lists are out.
  The tool says "crafting has nothing here" rather than guessing what drops.
- **Not a simulator.** Role stat weights rank pieces; there is no DPS/HPS simulation and no talent input.
- **No accounts, no server, no analytics, no tracking.** All user data lives in the browser and in files the user
  exports.
- **No mobile layout.** It must not break on a narrow window (tables scroll), nothing more.
- **No in-game addon in v1** and no reading of game files other than the user-chosen Auctionator file.
- **No importer for the prototype's state format.** The prototype keys state by character name; mapping that to
  roster IDs is a one-off the original user can do privately if wanted (Open question 6).
- **No live data from the web at page load.** Wowhead calls happen only after the user opts in.

## 7. Success criteria

Release-blocking (checked before v1 is announced):

1. **First answer in under a minute.** From an empty browser, a new user can add one entry (class, role, level) and
   see the crafted piece to wear or buy per slot at that level in ≤ 60 s and ≤ 6 interactions after the page loads.
2. **Correct availability.** For a test roster (Mage Tailoring+Enchanting, Warrior Mining+Blacksmithing, Rogue without
   professions, Alliance), no BoP piece ever appears for an entry without that profession, every BoE piece of a
   roster profession shows the roster crafter, and every other BoE piece shows "AH". Covered by node tests on the
   availability function.
3. **Works offline and from `file://`.** With the network disabled, every view renders, tooltips work, and the
   browser's network panel shows zero requests beyond the page's own files while Wowhead tooltips and icons are off.
4. **State survives.** Reload keeps everything. Export → reset → import restores an identical state (byte-equal JSON
   after normalisation). A data update to a new build keeps all statuses for items that still exist and reports the
   rest.
5. **Fast enough.** First render ≤ 300 ms and re-render after a status change ≤ 100 ms with 10 roster entries on a
   mid-range desktop (the path computation runs in the browser, see `ui.md` §4).
6. **Accessible basics.** Every control reachable and operable by keyboard; no information carried by colour alone;
   axe/Lighthouse accessibility audit with no serious violations.
7. **Nothing personal.** The privacy grep defined by the release document finds nothing in the repo or the shipped
   data.

Post-release signals (soft, no telemetry): issues/feedback mention specific item recommendations rather than "how do
I use this"; the original user retires the prototype for their own household.

## 8. Assumptions about other areas

- **Data model / pipeline:** the shipped data contains every craftable equipment item with required level ≤ 60 (not
  per-person plans), each with bind type, profession and recipe skill, "requires profession to equip" where it
  applies, armor/weapon type, allowed classes if restricted, and recipe sources tagged with a faction
  (`alliance` / `horde` / `both`) and a kind (trainer, vendor, Favor with cost, reputation with standing, drop, dungeon,
  unobtainable). Items keep their DB2 item IDs across builds.
- **Theorycraft:** a fixed list of role IDs per class (assumed: `tank`, `healer`, `melee`, `ranged`, `caster`; at
  most three per class), each with stat weights, plus an optional spell-school preference for casters (Forever has
  per-school damage stats and per-school BoP cloth sets). Armor proficiency by level (mail at 40 for Hunter/Shaman,
  plate at 40 for Warrior/Paladin) is provided as data.
- **Ranking:** the per-slot path is computed in the browser from candidates and role weights, because candidates
  depend on the user's roster (§5). The pipeline may precompute per-role scores per item to keep this cheap.
- **Pricing:** prices are per realm and faction; the pricing document decides storage and how a user picks the
  realm/faction key from an Auctionator file. The UI only needs `price(itemId) → {copper, source, date} | null`.
- **Release:** the page ships as plain static files, no build step, no runtime dependencies (brief default).

## 9. Open questions

1. **Faction per roster or per entry?** A household on one realm is one faction for mail purposes, but a player may
   mix factions on a normal realm. *Recommendation:* one faction per roster in v1 (it fixes mail routes, recipe
   sources and the AH in one place); several rosters later (§6.2).
2. **Is Merchant's Favor account-wide?** Unknown on beta. *Recommendation:* store a balance per crafter entry (as the
   prototype does); if it turns out account-wide, migrate to one roster balance (sum of entries) in a schema bump.
3. **Do class/faction restrictions exist in Forever (Shaman Horde-only, Paladin Alliance-only)?** *Recommendation:*
   drive it from data; if restricted, the class picker greys out with a reason, never silently hides.
4. **Should AH purchases be on by default?** *Recommendation:* yes. Personas B and C have nothing else; persona A
   can switch it off in one click and still sees the AH price as context.
5. **Enchants for rosters without an enchanter:** show them at all? *Recommendation:* show armor kits and other
   item-based enhancements always (they are buyable), show enchants as optional "needs an enchanter" notes, collapsed
   by default.
6. **Prototype-state importer for the original user?** *Recommendation:* no, not in the public repo. If the original user wants their
   statuses carried over, a throwaway local script maps names to the new roster IDs.
7. **Hard cap on roster size?** *Recommendation:* soft limit of 10 (one realm's worth of characters in Classic
   clients); the UI is designed for that many cards, the code does not hard-fail beyond it.
8. **Include gathering professions?** They are primary professions and use up one of the two slots, but craft
   nothing. *Recommendation:* yes, selectable (Herbalism, Mining, Skinning), used only to price their mats at
   opportunity cost and to show "your roster gathers this" in the mat list.

## 10. Decisions taken here

- Three personas, one model: solo users are a roster of one; there is no separate "simple mode".
- A roster entry has no name, race, gender or realm; the label is optional display text.
- Availability is a hard filter (BoP only for the wearer's own profession; BoE from roster or AH; "requires
  profession to equip" only for the wearer), ranking is a separate step.
- Two roster-wide switches: "Include AH purchases" (default on), "Prefer roster crafting over AH" (default on).
- Faction is a roster setting in v1.
- Non-crafted gear, gold-making and simulation are non-goals.
- No telemetry; offline by default; Wowhead integration only on opt-in.
