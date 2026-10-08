# Critique of the design drafts

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: critic. Input: the shared brief and the seven drafts (`vision-scope.md`, `ui.md`, `data-model.md`,
`game-data-pipeline.md`, `roles-stat-weights.md`, `pricing-import.md`, `release-maintenance.md`). Spot checks were
run read-only against the prototype and the cached DB2 CSVs of build 1.60.1.70205; no network access.

**Overall verdict.** The drafts are strong on facts (the pipeline's counts reproduce: 1,281 live craft rows,
1,279 distinct items, 1,274 after the cosmetic drop, 376 BoP / 874 BoE / 23 none / 3 BoU, no BoE recipe item) and
weak on integration. They disagree on file names, globals, storage keys, the generator language, the path
algorithm and the price shapes, and none of them owns the questions that sit between areas: the crafter pace table,
the enchant-rule port, what "source unknown" means for availability, and how scarce recipe sources (Favor,
reputation, dungeon drops) affect the gear path. The UI's M1 depends on a default price list that the pricing draft
says must not exist at launch. All seven drafts pass the privacy grep for the banned strings (§4.4).

## 1. Contradictions between drafts

Each entry: topic · what A says · what B says · recommendation.

### 1.1 Generator language
- **A:** game-data-pipeline §12 and OQ1: Node (CommonJS, no dependencies), so the theorycraft scoring module runs
  unchanged in the build report ("top picks per role") and in golden tests; one runtime, one Auctionator decoder.
- **B:** release-maintenance §2.2 (`pipeline/` in Python ≥ 3.10), §7.3 (`unittest`), §8.1, OQ7: keep Python stdlib,
  because "rewriting a working, checked-against-tooltips pipeline before launch is risk for nothing".
- **Recommendation: Node.** Release's argument rests on a false premise. The prototype's generator can't be kept
  as it is. It has to be cut apart anyway: the personal constants go, enumeration is new, sources are re-derived, and
  pricing moves out. Either language means a port of the same ~600 lines, and that port is already checked against
  the prototype's 160 items (pipeline §12). Only Node lets the ranking review run without a second scoring
  implementation, and that review is the main defence against nonsense among 1,274 enumerated items. Consequence:
  release §7.3/§8.1/§8.5 switch to `node --test` and `node pipeline/...`, and Python leaves the toolchain.

### 1.2 One `game.js` vs per-section files; where data lives
- **A:** data-model §3.1: `data/forever/{meta,items,recipes,mats,sources,enchants,rules,reference,prices-default}.js`.
- **B:** release §2.2: `site/data/{game.js,texts.js,prices-default.js}`, and `game.js` contains "rankings".
- **Recommendation:** per-section files under `site/data/forever/`. The split by refresh cadence that release wants
  still holds, because prices stay a separate file. Release's stamp tool hashes each file, so more files cost
  nothing. **No rankings in the data** (pipeline §10; release §7.2's "ranked candidate" smoke test becomes a test
  over the browser ranking module run in Node).

### 1.3 Global names for data and modules
- data-model §3.2 and release §4: `window.FGP_DATA.<section>`. pricing §4: `window.GEAR_PRICES` in `data/prices.js`.
  roles §4.7: `window.GEAR_ROLES` in `roles.js`. release §7.1: lib modules as `root.EnchantRules`/`ctx.Rules`.
- **Recommendation:** one namespace for data, `window.FGP_DATA.{meta,items,recipes,mats,sources,enchants,rules,roles,
  reference,prices}`, and one for code, `window.FGP.{rank,pricing,auctionator,state,enchants}`. This lets
  release's `load-site.js` and the "defines only its own section" smoke test treat every file the same way.

### 1.4 Default price list: shape, file and global
- pricing §4: `rows: {id: [copper, day, qty]}`, `meta {format, build, scanDay, scanDate, entries}`.
- data-model §10: `{dataset, source, scanned, scope, copper: {id: copper}}`.
- release §6/§8.5: per item `{m, q}`, `meta.priceScan {date, region, items}`.
- **Recommendation:** pricing's shape (pricing owns it), and the imported set uses it too (pricing §6). Add
  `dataset` and `build` so the data-model's key check (§2) covers it. Leave `region` out unless lists for two
  regions ship (pricing OQ5).

### 1.5 Price precedence
- pricing §3.1: override > vendor > imported AH > default > craft (min(AH, craft) for intermediates).
- release §2.2 comment on `pricing.js`: "import > override > default > vendor".
- **Recommendation:** pricing's order. Release's order would let an imported price beat the user's own override and
  AH thread listings beat the vendor, which the prototype deliberately avoids.

### 1.6 Ship a default price list at launch?
- vision §6.1 and ui §14 M1 item 5: prices come from the shipped default list ("no import yet" in M1).
- pricing §4 and OQ3: never ship a beta scan for the live build (the tool refuses a `--build` mismatch). Ship none
  in the first live release, then add a list about a week after launch.
- release §8.6 (release day): "Keep `prices-default.js` from beta, clearly labelled, until a live scan exists."
  release §7.2 also requires every mat to have a default price or appear in `meta.unpriced`.
- **Recommendation:** pricing's rule (no beta prices against live data). Then **the UI's M1 has no prices at all on
  live data**, so move the Auctionator import and the manual overrides into M1 (both are small: about 90 + 45 + 90
  lines, and pricing §2 already validated a working reader against a real file). Release's smoke test has to allow
  "no default list" (meta.unpriced = all).

### 1.7 Max roles per class and the school select
- vision §8: at most three roles per class. roles §3.2: Druid has four (melee, caster, tank, healer).
- ui §3.2: school select for caster **and healer** roles, default "Any". roles §3.3/§4.3 and OQ8: school only for
  Mage, Warlock and Priest casters, per-class default (Frost/Shadow/Shadow) plus "Mixed". Druid and Shaman casters
  get fixed shares and healers fixed shares. The roles JSON stores values in lower case (`"frost"`), and the
  data-model §12 example uses `"Frost"`.
- **Recommendation:** roles' model. The role list comes from data with no fixed maximum. The school select appears
  only where `options.school` exists, with values in lower case. "Any" goes, because it has no defined weight.

### 1.8 Roster entry shape
- ui §10.2: `{id: "r4k9q2x", cls, label, role, school, level, professions: [{id, skill}], favor}`.
- data-model §12: `{id: "e1", class, label, role, options: {school | twoHand}, level, professions: [{name, skill,
  spec}]}`.
- roles Assumptions 2: also `weights` (sparse overrides) and `spec` per profession.
- **Recommendation:** ui's shape (it owns state) plus `options: {school?, twoHand?}`, `professions[].spec`, and
  later `weights`. Pick one key name each (`cls` vs `class`, `id` vs `name`) and make all docs follow it.

### 1.9 localStorage key names and namespacing
- ui §10.1: one key `foreverCraftedGear` with no version in the key, `schema` inside, backups
  `foreverCraftedGear.backup.<n>`.
- release §4 rule 5 and §6: `<repo>.v1`, "the state format has its own version in the storage key".
- pricing §6: `<app>.prices.v1` plus an undo-slot key.
- **Recommendation:** prefix = repo name (all three agree on that). Keys: `<repo>.state` (versioned inside, per UI's
  reasoning: no orphaned old keys), `<repo>.prices`, `<repo>.prices.undo`, `<repo>.backup.<schema>`. Write the
  rule once in the synthesis.

### 1.10 Manual overrides and owned mats in state
- ui §10.2: `prices.overrides: {"4339": 3200}` (plain copper). pricing §5.1: `{"2589": {"c": 1200, "set":
  "2026-10-08"}}`. pricing §5.2 adds `owned: {id: count}`, which ui's state schema does not contain.
- **Recommendation:** pricing's override object (the date lets the UI show its age). Add `prices.owned` to the
  schema, and put the "Have" column in the milestone that ships the Queue.

### 1.11 Where hand-maintained data lives
- data-model §3.1/§11: `rules.js` and `reference.js` hand-written in the shipped data folder. Curation lives in
  `curation/{sources,npcs,items,mats,enchants}.json`.
- roles §4.7: `roles.js`, hand-maintained, "the pipeline does not generate it".
- release §2.2/§8.3 and assumptions: **nothing** in `site/data/` is hand-edited (the smoke test recomputes
  `dataHash`). Curation lives in `curation/{overrides,exclude,sources,enchants,consumables,texts}.json`, and stat
  weights sit in `site/lib/rules.js`.
- **Recommendation:** every hand-maintained input lives as JSON in `curation/` (`roles.json`, `rules.json`,
  `reference.json`, `sources.json`, `npcs.json`, `items.json`, `mats.json`, `enchants.json`,
  `consumables.json`). The generator validates it and emits it into `site/data/forever/`. Code (ranking, enchant
  scoring) goes in `site/lib/`. Release's `exclude.json` merges into `items.json` (`avail: "unobtainable"`,
  `reason`). This keeps the "generated, never hand-edited, hash-checked" invariant and one schema-check path.

### 1.12 Curation entry fields
- data-model §11.1: `why`, `cite`, `checked`, `names`. release §7.4/§11.2: `reason`, `evidence`.
- **Recommendation:** data-model's fields. `cite` + `checked` say more than a free-text `evidence`. The schema test
  enforces `why`.

### 1.13 Who computes "vendor good" for mats
- data-model §6: a curated flag in `curation/mats.json`. The generator emits `vendor: {copper, stack}` from
  `BuyPrice / VendorStackCount`.
- pricing §3.1: "vendor good per game data → BuyPrice / VendorStackCount" (reads as if the browser computes it).
  Assumption 1 asks for a `vendor` field, and OQ6 wants a hand list.
- release: its curation list has no mats file at all.
- **Recommendation:** data-model's version. Curated flag, generator emits the copper, the browser only applies the
  precedence. Add `curation/mats.json` to release's layout.

### 1.14 The gear path algorithm and "core"
- ui §4.3: the best candidate per level, distinct bests form the path, and a step is "core" when it is best for ≥ 5
  levels.
- roles §6.4: envelope, then a par-item baseline, then a minimum gain of 1 point / 8 %, then keep-for-N by spend
  tier (needs prices), then the later option. "Core" means ≥ 25 % gain and kept ≥ 5 levels, or the only candidate
  for ≥ 10 levels.
- **Recommendation:** roles owns the rule; ui's tooltip text ("best for Head 25–34") stays. But see risk §4.1.6:
  roles treats an unpriced piece as tier "keeper" (≥ 8 levels), so with no prices the path loses most short steps.
  Treat unpriced pieces as "mid".

### 1.15 Does recipe or equip skill gate candidates?
- ui §4.3 rule 4: skill shortfalls are flagged (`!`), never used to filter or move a level.
- roles §6.1 rule 4: `requiredSkill` must be reached "by ℓ, from the pace model or the entry's skill input". §5.2: a
  BoP candidate needs the wearer to reach the recipe skill in time.
- vision §5: "requires a profession to equip: candidate if the wearer's skill suffices".
- **Recommendation:** recipe skill is flagged, never filtered (ui). Equip skill (`equipSkill`, 56 items, 49 of them
  Engineering) is a hard game rule. It filters only when an entered skill is below the rank. With an estimated
  skill the item is shown with `~!`.

### 1.16 Wowhead snapshot: committed or not
- pipeline §13: a committed `build-inputs/wowhead-<build>.json` (extracted fields: icon name, damage, armor, stat
  and effect lines), used for icons, the build check, and as a DPS fallback (`basis: "wowhead"`).
- release §8.3: "Wowhead tooltip cache: not committed". Its `.gitignore` (§12) contains `wowhead-*.json`, which
  would silently ignore pipeline's file. release OQ4 proposes the community listfile for icon names.
- **Recommendation:** don't commit Wowhead-derived data. Take icon names from `Item.IconFileDataID` plus the
  community listfile. Keep the Wowhead tooltip check as a maintainer-local step whose output is a report. When a
  check proves a rule wrong, the fix lands as a curated override in `curation/items.json` with `cite: ["WH"]` and a
  date. That keeps the generator a pure function of committed inputs and keeps Wowhead's data out of the repo.

### 1.17 Report, hash manifest, folders
- pipeline §13/§14: commit `reports/<build>.md` and `build-inputs/db2-<build>.sha256`; tools under `tools/`.
- release §8.3: generator reports go in `tmp/` and are not committed; tools live under `pipeline/` and `tools/*.mjs`.
  pricing §7: `tools/build-prices.js`, `js/import/{lua-literal,cbor,auctionator}.js`, `js/prices.js`. release:
  `site/lib/{auctionator,pricing}.js`, `tools/prices-default.mjs`.
- **Recommendation:** commit the build report and the hash manifest. Both are small, contain no private data and are
  the review surface for release day. Code lives in `site/lib/` (pricing's three import files can stay three files
  there). Tools are CommonJS `.js` in `tools/`, which matches the UMD libs and pipeline §12. Drop `.mjs`.

### 1.18 Data `meta`
- data-model §2: `dataset`, `flavor`, `product`, `build`, `levels`, `skillCap`, `status`, `generated` (an input
  date), `generator`, `inputs`, `counts`, `notes`.
- release §6: `schema`, `build`, `dataHash`, `source`, and no `generated` (it calls the timestamp a diff source).
- ui §10.2/§10.6: `seen.generated` detects data updates, and the footer shows "data 2026-10-07".
- **Recommendation:** the union. `generated` stays, because it is an input date passed with `--date` and therefore
  deterministic, so release's objection doesn't apply. Add `schema` and `dataHash`. ui's `seen` compares `build` +
  `dataHash`.

### 1.19 Rounding
- pipeline §13: DPS and speed to 2 decimals (data-model example `18.41`). release §8.4: "DPS 1 decimal".
- **Recommendation:** 2 decimals. The derived DPS rule (pipeline §6.3) exists to match tooltips, which show 1
  decimal, and rounding the stored value to 1 decimal invites ±0.05 drift in the scores.

### 1.20 Item and mat counts used for sizing
- data-model: 1,274 items, 290 direct / 356 total mats, default list "~1,700 IDs".
- pricing §4: "1,302 craftable equipment pieces … 589 distinct reagents … ~2,400 IDs".
- release §3: "about 1,270 items".
- data-model is internally inconsistent: its §3.1 table says "~169 enchants + 28 items", its §8 says 179 spells +
  28 items ≈ 197 records, and pipeline §4.3 says 179.
- **Recommendation:** pipeline's funnel is authoritative (it reproduces, see the verdict above). Correct pricing §4
  and data-model §3.1.

### 1.21 Class/equip-skill counts
- roles §2.5: "about 40" crafted items need a profession skill to equip. data-model §4.2: 57. The spot check finds
  56 after the cosmetic drop (Engineering 49, Forever child lines 2941/2938 with 6, Alchemy 1).
- roles §2.5 also lists class-restricted items without noting that a mask of 1535 means all classes. Only about 11
  really restrict (data-model's number is right).

### 1.22 "BoE recipe" wording
- vision §5: "unless it is a BoE recipe that can appear on the AH".
- pipeline §4.3/§9.1: no recipe item in the client is BoE. Tradeable means `Bonding` 0 ("none"), and the
  prototype's fallback mislabelled exactly this.
- **Recommendation:** use "tradeable pattern" everywhere, as data-model §7.1 does.

### 1.23 Milestone cuts
- ui §14: M1 Gear + default prices, M2 Queue + import, M3 Favor + enchant column, M4 Consumables.
- vision §6.1: v1 = everything (Queue, Favor, Enchants, Consumables, both factions, import), with no milestones.
- release Assumptions and §6: M0 skeleton + privacy, M1 first page, a "publish" milestone (CI, Pages), the
  release-day checklist, and 1.0.0 = "levels 1–60 for all nine classes with live data".
- pipeline §14: by 2026-11-01 the whole generator, report diff, golden picks and curation validation must be
  rehearsed. That presumes the M1 data pipeline is finished within about three weeks of today.
- pricing OQ3: no default list until about a week after launch.
- **Recommendation:** one plan, see §3 and Decision 1. Import moves to M1 and Queue stays M2. Publishing is not
  tied to 2026-11-05.

### 1.24 Smaller ones
- ui §9 status "Imported: …, realm X (Alliance)" against pricing §1.2: Forever's realm key has no faction suffix, so
  the page can't know the faction of a price set. Show the key only.
- `price()` return shape: vision §8 `{copper, source, date}`, pricing `{copper, source, day, qty, age, stale}`.
  Pricing's wins.
- Export of imported prices: ui §10.7 offers a checkbox, pricing OQ4 says no. Both default to off, so keep the
  checkbox.
- `mirror`: data-model groups by identical stats (32 groups, 68 items). roles §7 wants faction pairs only. The
  source `side` filter already removes the other faction's copy, so a mirror group that is not a faction pair would
  hide a legitimate alternative. Restrict `mirror` to pairs whose recipes have opposite `side`.

## 2. Gaps (milestone 1 needs a decision)

1. **Availability when the source is unknown.** By data-model §7.1 a recipe is available if one source has
   `side: "both"`, and the fallback `{kind: "unknown"}` has `side: "both"`. So all 427 BoP-pattern recipes with
   unknown source (pipeline §9.1), including 199 Forever-new ones at 31–60, count as available, silently. The
   drafts never decide this. **Proposal:** unknown sources count as available (otherwise 31–60 BoP sets vanish).
   Every such row shows a "source unknown" badge, and a roster setting "Only recipes with a known source" (off)
   lets cautious users filter them.
2. **What the page shows per `certainty`/`avail`.** Data-model has `certainty` ∈ {forever, vanilla, db, unknown}
   and `avail` ∈ {ok, unconfirmed, unobtainable}. ui's Source column (§4.2) knows only Trainer/Vendor/Favor/
   Reputation/Drop/Dungeon. Needed for M1: a badge vocabulary, e.g. "Trainer", "Trainer (from game data)",
   "Tradeable pattern: drop or vendor", "BoP pattern: source unknown", "Vanilla source, unconfirmed", each with a
   tooltip that cites the source. Also how "Hide unobtainable" treats `unconfirmed` (proposal: shown with a marker,
   never core).
3. **Scarce recipe sources and the path.** Vision §5 makes a BoP Favor pattern a plain "craft yourself"
   candidate. With ~3 Favor crates by level 20 (vision §3) and 30–120 Favor per pattern, the path would recommend
   six Favor pieces nobody can afford. The same goes for reputation (Honored) and dungeon-drop patterns.
   **Proposal:** a Favor, reputation or drop-only recipe can be core only once the crafter has marked it
   bought/learned. Until then it shows as an alternative step ("needs 30 Favor"). The Favor view then feeds the
   path instead of competing with it.
4. **Crafter pace table to 60, for six professions.** ui assumes theorycraft owns it. roles §Assumptions 5 says
   data/UI own it. data-model says theorycraft "may". The prototype's `PACE` covers three professions up to 30. It
   is needed for estimated skills (`~`), the `!` flags, equip-skill gating and the Queue. **Proposal:** theorycraft
   owns it in `curation/roles.json`. Derive a first version from recipe yellow/grey ranks by required level and
   label it heuristic.
5. **Par-item baseline data.** roles §6.4 step 2 needs `RandPropPoints[ℓ][Good][slot group]` in the page, and no
   data file carries it. **Proposal:** emit a 60 × 5 `budget` table in `rules`.
6. **Specialisations.** roles §5.3 needs a spec select (BS/LW/Eng, level ≥ 40 or skill ≥ 200), and data-model
   reads `pattern.spec` against `professions[].spec`. ui's form doesn't have it. M1 can do without it (gated outputs
   are req 47+ and almost all BoE). Then spec-gated recipes should count as craftable by any roster crafter of the
   profession and carry a "needs <spec>" badge.
7. **Enchants, kits and consumables for 1–60.** Data-model §8 generates enchant records from DB2 (good: effect,
   targets and mats come out mechanically), but the prototype's hand-maintained parts don't scale with it: the
   Era-effect comparison column (ui §2 row 4; derivable from the cached Era `SpellItemEnchantment`, but nobody says
   so), sources and notes for 31–60 enchants, kit sources, and consumables (159 hand entries, levels up to ~45, with
   `crafter` fields naming people). M1 doesn't need them. M3 needs an owner and a decision: derived only, with
   curation as overrides.
8. **The enchant-rule port.** The prototype's enchant rules (`ENCHANTER`, `HOUSEHOLD`, `PACE`, profiles, tiers) have
   to move to roster-based inputs and, per roles Assumption 6, to the new weights. No draft designs this port. It
   belongs to M3 but should have an owner now.
9. **Merchant's Favor beyond 30.** Only the ≤ 30 Alliance families are curated (3 vendors, 30 Favor). For 31–60 the
   notes give just the costs 60/90/120. Which patterns are Favor patterns is unknown, and so is the Horde vendors'
   stock. **Proposal:** the Favor view covers what is curated and says "Favor patterns above level 30 are not yet
   mapped".
10. **Icons without Wowhead hotlinks.** The icon names can come from the listfile (§1.16), but no draft says where
    the images come from if Wowhead's CDN is off-limits. Options: Wowhead CDN (opt-in, disclosed); Blizzard's own
    render CDN, which its armory uses (check the terms); none. M1: icons off, no request.
11. **Ranking calibration and acceptance.** roles OQ12 calibrates against the prototype's curated 1–30 plans. Those
    plans live in the private workspace and are keyed by character, so they can't be committed. Vision §7 has no
    ranking-quality criterion. **Proposal:** a one-time private comparison, then a committed, scrubbed oracle
    (`class, role, level, slot → itemId`, about 100 rows from the curated plans) as a golden test with a stated
    threshold, e.g. ≥ 80 % of curated core picks reproduced.
12. **Faction data.** The `Faction` DB2 table (the sides of the 9 reputation factions) isn't fetched yet
    (data-model §7.2), and there is no Horde vendor curation. M1 needs at least the faction sides. Otherwise the
    Alliance/Horde filter rests on prototype notes.
13. **How Horde and 31–60 thinness is told to the user.** Onboarding (ui §3.1) asks for the faction but never says
    that Horde sources are mostly unverified. Proposal: one line under the faction choice and a per-faction coverage
    figure on About (e.g. "sources confirmed for 41 % of recipes you can see").
14. **The redacted import diagnostic** that release §11.1 promises in the issue template isn't designed in pricing.
    It is small: format detected, number of realm keys, entries decoded, CBOR error offset, and no key names.
15. **Repo name.** It blocks the storage prefix, the env-var prefix (`FGP_`), the user agent string and the
    localStorage migration story. It needs a decision before M1 code.

## 3. Scope realism

**What is actually known per level band** (from pipeline §4 and §9; spot-checked):

| | 1–30 | 31–60 |
|---|---|---|
| Craft rows by req level | 522 (req ≤ 30) | 759 (59 %) |
| Stats / armor / DPS | formula-checked (256/256 stats, 132/132 armor, 18/18 melee) | same formulas, but resistances, sets, `QualityModifier` (23 items) and most caster/thrown DPS rules are unverified |
| Recipe sources | curated (Alliance), ~200 entries | only derived classes; 562 non-rep patterns plus 91 rep NPCs uncurated |
| Favor | 3 families, Alliance | costs only |
| Enchants/kits/consumables | hand-maintained | none |
| Ranking | weights unvalidated, but an oracle exists | no oracle |

Showing all 1,274 items with stats and ranking them over 1–60 is credible, because that part is mechanical and
formula-checked. Sources for 31–60 are not credible beyond "trainer" and "tradeable pattern". A stranger at level
45 will meet "BoP pattern: source unknown" on a large share of the candidates. That is acceptable if the page says
so, and not acceptable if it hides it.

**The UI's M1 cut** (ui §14: onboarding, form, Gear view, offline tooltips, default prices only, About, state
schema 1) has the right shape. It has three problems:
1. It relies on a default price list that won't exist on live data (§1.6). Without prices, the Mats/AH columns are
   empty and roles' spend tiers degrade. **Move import and overrides into M1.**
2. It has no story for unknown sources or scarce sources (gaps 1–3). For persona C (a solo crafter) the Gear view
   is wrong without gap 3.
3. Its availability acceptance test ("Blacksmithing BoE weapons appear on the Rogue with Warrior → mail") is good,
   but M1 has no acceptance test for ranking quality (gap 11).

**The smallest honest M1 that works for a stranger:**
- Data: full enumeration 1–60, stats/armor/DPS with the `checked`/`basis` flags, derived sources for every recipe,
  the ≤ 30 Alliance curation ported (scrubbed), and the faction sides of the 9 reputation factions. Horde gets the
  derived sources plus the known mirrors, marked unverified.
- Ranking: roles' envelope + par baseline + minimum gain + core rule, with unpriced pieces as tier "mid"; Favor,
  reputation and drop patterns not core until marked bought (gap 3); effects and sets display-only.
- UI: ui §14 items 1–4, 6, 7, plus the source/certainty badges (gap 2), the "only known sources" switch, and the
  Prices panel with Auctionator import and overrides (pricing §2, §5.1). No Queue, Favor, enchants, consumables or
  owned mats yet.
- Honesty: About shows coverage numbers per band and faction, and every row shows its source certainty. The
  status banner reads "beta data" until the live refresh.

**Timing.** Today is 2026-10-08, launch is 2026-11-05: four weeks. The critical path is the pipeline (Node port,
enumeration, classification, report, curation port), not the UI. Pipeline §12's "1–2 days" covers only the formula
port. Enumeration, the R1–R8 classification, the report with golden picks, and the conversion of ~200 curated
entries into families are each several days. A realistic plan is M1 on beta data by about 2026-10-31, a live
refresh 2026-11-05..07, and public announcement after the live refresh plus a first live price scan. Don't promise
a public v1 on launch day. The original user keeps using the prototype for launch week.

## 4. Risks

### 4.1 Data correctness
1. **Caster-weapon DPS rule:** 2 tooltip samples for 0x300, none for 0x500, 0x100-only or thrown (pipeline §6.3).
   Five items use the verified rule, two the guessed one, seven thrown items have no rule. Pipeline's own OQ2 (fetch
   three tooltips) costs minutes. Do it before M1.
2. **Armor gates:** mail/plate at 40 is [V] (roles §2.1). Forever's Retail-style "Armor Proficiency" spell hints at
   earlier access. If that is wrong, every Hunter/Shaman/Warrior/Paladin path from 1–39 changes. This is the single
   biggest visible risk. One in-game check before release.
3. **Unknown stat IDs** (83, 90, 112, 113, 124, 132 on 8 items) and stat 124's conflict with the enchant mapping:
   pipeline blocks the build on new ones. That is good, but the six known ones ship at weight 0, which is fine for
   profession-skill items. Stat 124 on the Obsidian pieces needs a decision.
4. **`QualityModifier`** on 23 items (armor unverified) and **Wild Leather** random stats: flagged, but the ranking
   must exclude `unconfirmed` items from core, or one wrong armor value tops a slot.
5. **Weights are heuristics** with several [V] constants (1 DPS = 14 AP, rating per percent from one data point,
   feral weapon term 0). The weapon term dominates melee scores (roles §4.5: 1 DPS ≈ 10 Str), so any DPS error
   becomes a ranking error. The golden picks in the build report are the right defence. Make the oracle (gap 11)
   part of CI.
6. **Unpriced = "keeper"** (roles Assumption 4) prunes every step shorter than 8 levels when no prices exist, which
   is exactly the live-launch state. Use "mid".
7. **Mirror merging** beyond faction pairs could hide valid items (§1.24).

### 4.2 Release-day timing (2026-11-05)
- The live product code on wago.tools and the live install folder name (needed in the import help) are unknown
  (pipeline OQ9, pricing OQ1, release §8.6).
- wago.tools may re-export hotfixed tables. The hash manifest catches that, but every re-export costs a review cycle.
- Wowhead may lag. That doesn't matter if Wowhead is no longer a data input (§1.16).
- Launch-week AH prices are chaotic, so no default list until ~day 7 (pricing OQ3). The M1 import makes this
  harmless.
- The generator-language debate (§1.1) costs days if it isn't settled in the synthesis.
- A content-phase model is unknown (pipeline OQ5): R1 items may become real later, and the diff report catches them.

### 4.3 Legal
- **Blizzard game data** in a public repo: common practice for fan tools. release §9's notice is adequate. Don't
  commit raw DB2 CSVs (all drafts agree).
- **Wowhead:** a committed extract of tooltip data (pipeline §13) is the riskiest item. Icon hotlinks and the
  opt-in tooltip script are what Wowhead offers for embedding, but hotlinking the image CDN directly is unverified
  (release OQ4). Recommendation in §1.16.
- **AllTheThings** as a curation seed (pipeline §9.4, OQ3): its license must be checked before any of its data,
  even reviewed, lands in an MIT-licensed `curation/`. Per-entry `cite` helps but doesn't settle it.
- **MIT for curation** that cites third-party sites: facts are generally fine, but database rights (EU) exist.
  Say in `NOTICE.md` that curation records facts with citations, not copied text.

### 4.4 Privacy
All seven drafts were checked with a case-insensitive grep against the maintainer's private denylist (character
names, account identifiers, local paths and tool names) and against generic path shapes: **no hits.** The few
places where wording was personal in tone or hinted at the maintainer's own setup were neutralised before the
drafts were committed here. Remaining points:

- The example roster in vision-scope.md and ui.md (a Mage with Tailoring and Enchanting, a Warrior with Mining and
  Blacksmithing, a Rogue without professions) is a common alt setup; keep it generic.
- ui.md and release-maintenance.md name the prototype's files by file name (not by path). Harmless.
- **Future leak vectors** (the real risk): data-model §11.3 "copied with edits" of the prototype's hand-maintained
  extras. Those contain per-character fields on bring lists, `crafter` fields naming people on consumables and
  kits, and character-named Favor buy orders and plan intros in the prototype's generator. Porting its sources,
  Favor info and notes text also carries "household" wording. Port these by a script that keeps only whitelisted
  fields, never by copy-paste, and run the privacy check on the first commit.
- release §10.2: the generic `account-id` rule catches only numeric account folders. Older non-numeric account
  folder names belong in the private denylist. Set the commit author e-mail for this repo (e.g. GitHub's `noreply`
  address) before the first push (release OQ6), since the default author e-mail may be a personal address.

## 5. Per-doc quality

**vision-scope.md**
1. v1 scope (§6.1) lists every view and both factions without any data-readiness gate. Nothing says that 31–60
   sources, Favor above 30, Horde and consumables are unknown or thin.
2. The success criteria (§7) test availability, speed, offline use and privacy, but not recommendation quality or
   honesty about data certainty. Add the oracle threshold (gap 11) and "every row shows its source certainty".
3. §5 treats every recipe source as equal (gap 3), and the assumptions in §8 are stale (≤ 3 roles, "BoE recipe").

**ui.md**
1. §4.3's path algorithm and core rule contradict roles §6.4. ui should defer to roles and keep only the UX
   contract (pieces in hand win, the tooltip span).
2. The form lacks the spec select, the Shaman `twoHand` option and the role-specific school rules. It shows school
   for healers, defaulting to "Any" (§1.7).
3. M1 depends on a default price list that won't exist on live data (§1.6). It has no vocabulary for
   unknown/derived sources (gap 2).
4. §10.2's state schema lacks `owned`, `spec`, `options`, and pricing's override shape.

**data-model.md**
1. Hand-written `rules.js`/`reference.js` in the shipped data folder break release's "generated only" invariant
   (§1.11).
2. `unknown` sources default to `side: "both"` and so are silently available (gap 1). This is a product decision
   hidden in a data default.
3. Things the consumers need are missing: the `RandPropPoints` budget table for the par baseline, the pace table,
   and Era enchant effects.
4. Internal count inconsistency (169 vs 179 enchants). The faction sides come from notes, not DB2, and the family
   grouping heuristic (pipeline §9.4) is unvalidated.

**game-data-pipeline.md**
1. "Wowhead is a check, not a source" (§6.3) is contradicted by the mismatch fallback (`basis: "wowhead"`) and by
   committing the extract. Choose between the two (§1.16).
2. Effort is underestimated (§12: "1–2 days"). There is no estimate for enumeration, classification, the report
   and the curation port, although these decide whether the 2026-11-01 rehearsal (§14) is possible.
3. OQ2's three missing tooltips are cheap and blocking. They should be a task, not an open question.
4. The `Faction`, `ChrClasses`, `ChrRaces` and `CharBaseInfo` tables are listed but not fetched. Roles fetched
   three of them out-of-band, so the pipeline has to add them to its manifest.

**roles-stat-weights.md**
1. The weights are reasoned but unvalidated. The calibration oracle (OQ12) is private and the doc doesn't say how
   it becomes a public test (gap 11).
2. It proposes UI features (Advanced weights editor §4.6, spec select §5.3, profession hints §5.4) without
   priority. Mark them M2+ except the spec select.
3. Unpriced → "keeper" (Assumption 4) will distort the launch-week output (§4.1.6). The level-scaled spend caps are
   a guess for 31–60 (OQ13).
4. Small factual slips: "about 40" equip-skill items (it is 56), and 1535 masks listed as restrictions.

**pricing-import.md**
1. Item/reagent counts (1,302 / 589 / ~2,400) don't match the pipeline's funnel. Fix them before using them as size
   budgets.
2. It introduces owned mats ("Have" column) and the undo slot without a milestone. ui doesn't know about either.
3. It says nothing about the redacted diagnostic release promises, and nothing about how a price set relates to
   the roster's faction when the key carries none (ui shows "(Alliance)").
4. It is otherwise the most concrete draft (measured file shape, validated reader). Its parser and decoder should
   be the first code copied into the new repo.

**release-maintenance.md**
1. Several cross-area assumptions are wrong or stale: the Python generator, rankings in `game.js`, the
   `texts.js`/`game.js` split, the precedence comment (§1.5), keeping the beta price list for live (§1.6), the
   ignore rule that swallows pipeline's committed file (§1.16).
2. Smoke-test invariants (§7.2) need care. "Every class × role has a ranked candidate per armor slot" is false by
   design for Finger (no crafted rings exist in 1–60) and nearly so for Neck (1 item). "Every mat has a default
   price or is listed unpriced" couples game data to an optional price list.
3. Milestones are only an infrastructure track. It doesn't reconcile with ui §14 or pipeline §14.
4. Good: the privacy-check design (two rule sets, redacted CI output, history mode before the first push) and the
   `file://` verification. Adopt both as written.

## 6. Recommended decisions for the synthesis

1. **Milestones:** M0 = repo skeleton, privacy check and hooks, scrubbed docs (this week). M1 = Gear view on beta
   data with full 1–60 enumeration, the ranking, source/certainty badges, Auctionator import and overrides, state
   v1, export/import, target ~2026-10-31. M1.1 = live data refresh 2026-11-05..07. M2 = Queue, shopping list,
   owned mats, per-item crafter choice, default price list from a live scan. M3 = Favor (≤ 30 curated) and the
   enchant column with the ported enchant rules. M4 = Consumables, reference, 31–60 source curation. Public
   announcement after M1.1 plus a live price scan, not on launch day.
2. **Generator in Node** (CommonJS, zero dependencies). Tests are `node --test` only, and Python leaves the
   toolchain.
3. **Per-section data files** in `site/data/forever/`, all under `window.FGP_DATA.<section>`. Code under
   `window.FGP.<module>` in `site/lib/`. No rankings in the data.
4. **All hand-maintained inputs in `curation/*.json`** (including roles/weights, rules and reference text), emitted
   by the generator. `site/data/` is generated only and hash-checked.
5. **Curation fields** `why`/`cite`/`checked`/`names`. Curation keyed by families of item IDs.
6. **Wowhead is not a committed input.** Icon names come from `IconFileDataID` plus the listfile. The tooltip check
   is local, and its corrections become cited curation overrides.
7. **Prices:** pricing's shapes, its precedence (override > vendor > AH > default > craft), its override object,
   and `owned` in state. No beta price list against live data.
8. **Storage keys** `<repo>.state` (schema inside), `<repo>.prices`, `<repo>.prices.undo`, `<repo>.backup.<n>`.
9. **Roster entry:** ui's shape plus `options {school?, twoHand?}`, `professions[].spec`, and later `weights`.
   Roles come from data without a maximum, and the school select appears only where the class/role defines one.
10. **Path rule owned by theorycraft** (roles §6.4). Unpriced pieces are tier "mid". `unconfirmed` items are never
    core. Favor, reputation and drop-only recipes are core only once marked bought/learned.
11. **Unknown sources count as available**, with a badge and an "only known sources" switch (default off).
12. **Recipe skill flags, equip skill filters** (only on entered skill below rank; an estimate gives `~!`).
13. **Pace table** owned by theorycraft in `curation/roles.json`, first version derived from recipe ranks.
14. **`mirror` only for faction pairs** (opposite `side`).
15. **Before M1:** fetch the three missing DPS tooltips, the `Faction`/`ChrClasses`/`ChrRaces`/`CharBaseInfo`
    tables, and verify mail/plate at 40 in game.
16. **Ranking oracle:** scrubbed `class, role, level, slot → itemId` fixture from the curated 1–30 plans, as a CI
    golden test with a threshold.
17. **Prototype extras are ported by whitelist script**, never by copy-paste. The first commit runs the privacy
    check with the full private denylist.
18. **Commit** the build report and the DB2 hash manifest. DPS stored to 2 decimals. `meta` = data-model's fields
    plus `schema` and `dataHash`.

## Open questions

1. **Is a public launch on 2026-11-05 a goal, or is "M1 on beta data, public after the live refresh" acceptable?**
   *Recommendation:* the latter. Four weeks can't carry the pipeline, ranking and UI to a quality a stranger should
   see on day one, and beta data is about to be replaced anyway.
2. **Are unknown-source BoP recipes shown by default?** *Recommendation:* yes, badged, with an opt-in filter. Hiding
   them empties most 31–60 BoP sets.
3. **Do Favor, reputation and dungeon-drop recipes enter the path before the user owns them?** *Recommendation:* as
   non-core alternatives only, until marked bought/learned (gap 3).
4. **Node or Python for the generator?** *Recommendation:* Node (§1.1). Settle it in the synthesis, not during M1.
5. **Commit Wowhead-derived data?** *Recommendation:* no. Use the listfile for icons and turn check results into
   cited curation overrides.
6. **Where do item icons come from when enabled?** *Recommendation:* off in M1. Before enabling them, the maintainer
   reads Wowhead's and Blizzard's terms on image hotlinking and picks one CDN, disclosed in the README.
7. **May AllTheThings data seed curation?** *Recommendation:* only after reading its license. Until then, curation
   cites public pages and in-game checks only.
8. **Does the ranking need a quality gate in CI?** *Recommendation:* yes, the scrubbed oracle with ≥ 80 % of curated
   core picks reproduced for 1–30. Review 31–60 by the build report's top picks.
9. **Repo name?** *Recommendation:* decide before M1 code, avoiding "WoW"/"Warcraft" at the start (release §9). It
   fixes the storage prefix, env prefix and user agent.
10. **Roles' Advanced weights editor in v1?** *Recommendation:* no. Keep `weights` in the state schema and ship the
    editor in M2 or later if users ask.
11. **Specialisation select in M1?** *Recommendation:* no. Treat spec-gated recipes as craftable with a "needs
    <spec>" badge, and add the select in M2 together with the Queue.
12. **Who ports the enchant rules?** *Recommendation:* theorycraft, in M3, on top of the shared effective weights
    (roles Assumption 6).
