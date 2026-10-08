# Synthesis: decisions for forever-gear-planner

Status: planning, 2026-10-08. This document is **authoritative where the role documents disagree**. The role
documents are kept as written (with privacy edits only); read them for reasoning and detail, read this for what
was decided. Every decision below can be overruled by the maintainer: change the row, note the date, and update
the affected role document when it is next touched.

## 1. How the planning was done

One planning brief (the decisions below marked *planning*), then five role documents written in parallel, a
critic reviewing all five, and this synthesis. The maintainer answered four questions at the end (marked
*maintainer*).

| Document | Role | Answers |
|---|---|---|
| [vision-scope.md](vision-scope.md) | Product/UX | who it is for, scope, non-goals, success criteria |
| [ui.md](ui.md) | Product/UX | onboarding, views, user state, tooltips, M1 UX minimum |
| [data-model.md](data-model.md) | Game-data engineer | shipped data shapes, file split, roster model, curation |
| [game-data-pipeline.md](game-data-pipeline.md) | Game-data engineer | DB2 enumeration 1–60, formulas, sources, refresh |
| [roles-stat-weights.md](roles-stat-weights.md) | Theorycraft | classes, factions, roles, weights, usability, ranking |
| [pricing-import.md](pricing-import.md) | Pricing/import | Auctionator file import in the browser, price model, storage |
| [release-maintenance.md](release-maintenance.md) | Release/infra | repo layout, Pages, tests, regeneration, license, privacy check |
| [critique.md](critique.md) | Critic | 24 contradictions, 15 gaps, scope, risks, recommended decisions |
| [roadmap.md](roadmap.md) | Synthesis | milestones; M1 is the next implementation brief |

## 2. Fixed before the design phase (*planning*)

- WoW: Forever only, levels **1–60**, English item names. The data carries a build key (`dataset`, `build`,
  level range) so later ranges or flavors can slot in. No other flavor support now.
- A **roster of classes** replaces named characters: each entry is a class, an optional label, a role, a level and
  up to two primary professions.
- Craftable equipment is **enumerated from the game data (DB2)** and ranked per role; curation is reduced to
  overrides, sources and notes. The prototype's hand-written plans are not extended.
- Prices: **Auctionator file import in the browser** (Lua string literal + CBOR decoded in JS) plus manual
  overrides. A command-line-only price path and a companion addon are out for v1.
- Plain static files, no build step, no runtime dependencies; works on GitHub Pages and from `file://`.
- Wowhead may be read at build time, never at page load.

## 3. Decisions by the maintainer (2026-10-08)

| # | Question | Decision |
|---|---|---|
| U1 | Project and repo name | **forever-gear-planner**. Storage prefix `forever-gear-planner.`, env prefix `FGP_`, globals `FGP_DATA` / `FGP`. |
| U2 | License | **MIT** for code, curation and docs, plus `NOTICE.md` (game data and trademarks belong to Blizzard; credits for data sources). |
| U3 | Default price list | **No beta list against live data.** M1 relies on the in-browser import and overrides; a default list from a live scan comes later (M2). See open question S1 for the beta period. |
| U4 | Milestone 1 and going public | **Public during the Forever beta**, before the 2026-11-05 launch, with a clear "beta data" banner. The live refresh follows as a data release. This overrides the critic's "public only after the live refresh". |

## 4. Decisions taken in the synthesis

Format: topic · positions · decision · why. "Overrulable" applies to all of them.

### 4.1 Architecture and tooling

| # | Topic | Positions | Decision |
|---|---|---|---|
| D1 | Generator language | Pipeline + critic: Node (CommonJS, zero deps). Release: keep Python stdlib, porting is risk. | **Node.** The prototype's generator has to be cut apart anyway (personal constants, new enumeration, prices move out), so both options are a port of ~600 lines. Only Node lets the build report and the golden tests run the browser's ranking module and the Auctionator decoder without a second implementation. Python leaves the toolchain. Release §7.3/§8 read as "node --test / node pipeline/…". |
| D2 | Site location and deploy | Release: `site/` + GitHub Actions artifact; fallback `gh-pages` branch script. | **Adopted.** `docs/` stays design documents only. Deploy on `v*` tags and manual dispatch (release OQ2). |
| D3 | Data files | Data-model: one file per section. Release: `game.js` + `texts.js` + prices. | **Per section** under `site/data/forever/` (`meta`, `items`, `recipes`, `mats`, `sources`, `enchants`, `rules`, `roles`, `reference`, later `prices-default`). Classic scripts assigning to `window.FGP_DATA.<section>`. **No rankings in the data**; ranking runs in the browser (and in Node for the report and tests). |
| D4 | Global names | `FGP_DATA`, `GEAR_PRICES`, `GEAR_ROLES`, `EnchantRules` in different drafts. | Data: `window.FGP_DATA.<section>`. Code: `window.FGP.<module>` from `site/lib/` (pure, UMD-style like the prototype's enchant rules). DOM code in `site/app/`. |
| D5 | Hand-maintained inputs | Data-model: `rules.js`/`reference.js` hand-written in the data folder. Roles: hand-maintained `roles.js`. Release: nothing in `site/data/` hand-edited. | **All hand-maintained inputs are JSON in `curation/`** (`roles.json`, `rules.json`, `reference.json`, `sources.json`, `npcs.json`, `items.json`, `mats.json`, later `enchants.json`, `consumables.json`). The generator validates and emits them. `site/data/` is generated only and hash-checked. Release's `exclude.json` folds into `items.json` (`avail`, `why`). |
| D6 | Curation entry fields | Data-model: `why`/`cite`/`checked`/`names`. Release: `reason`/`evidence`. | **Data-model's fields.** Curation is keyed by families of item IDs (one entry covers e.g. a pattern family). |
| D7 | Wowhead data | Pipeline: commit a Wowhead extract (icons, DPS check). Release + critic: don't commit it; icon names from the community listfile. | **No Wowhead-derived data in the repo.** Icon names come from `Item.IconFileDataID` plus the community listfile. The tooltip cross-check runs locally; a proven correction lands as a curated override with `cite` and date. Icons are off in M1 (no image requests). |
| D8 | Build artefacts committed | Pipeline: commit build report and DB2 hash manifest. Release: reports in `tmp/`. | **Commit** the build report (`reports/<build>.md`) and the DB2 hash manifest. Raw CSVs never. |
| D9 | Data `meta` | Union of data-model and release fields. | `dataset`, `flavor`, `product`, `build`, `levels`, `skillCap`, `status` (`beta`/`live`), `generated` (input date via `--date`, deterministic), `generator`, `inputs`, `counts`, `notes`, `schema`, `dataHash`. |
| D10 | Rounding | Pipeline: DPS 2 decimals. Release: 1. | **2 decimals** for DPS and speed. |
| D11 | Tools | `.mjs` vs CommonJS `.js`. | **CommonJS `.js`** everywhere (matches UMD libs and the pipeline). |
| D12 | Privacy check in the skeleton | Release OQ1: yes, it's tooling. Planning brief: skeleton ships no app code. | **Yes**, as a small POSIX shell script (`tools/privacy-check.sh`) plus an opt-in pre-commit hook. Generic path rules are committed; the private denylist lives outside the repo and the check fails if it's missing (unless run with `--generic-only`). Release §10's Node design is the target for M1 (adds commit-range and history modes). |

### 4.2 Game data

| # | Topic | Positions | Decision |
|---|---|---|---|
| D13 | Enumeration and leftovers | Pipeline: 1,281 craft rows → 1,274 shipped items via rules R1–R8. Critic: numbers reproduce. | **Adopted.** Pipeline's funnel is authoritative for sizing. Pricing's and data-model's other counts are superseded. |
| D14 | Weapon damage | Pipeline: `Flags_4` 0x100 = caster weapon, table × 0.743; guns TwoHand × 0.6; melee from (min+max)/2/speed. Few samples. | **Adopted as rules**, with the local Wowhead cross-check as safety net. Before M1 data ships: check tooltips for Dreamstaff (0x500), Searing Golden Blade (0x100 only) and one thrown weapon. |
| D15 | Unobtainable items | Data-model OQ1: ship with `avail` and `reason`. | **Ship them**, hidden by default, `unconfirmed` items shown with a marker and never "core". |
| D16 | Unknown stat IDs | Pipeline: block the build on new unknown IDs; six known ones ship as `Stat<ID>`. | **Adopted.** Stat 124 vs. the prototype's enchant mapping: resolve with tooltips before M3 (enchants). |
| D17 | Mirror groups | Data-model: group identical-stat items (32 groups). Roles/critic: faction pairs only. | **Faction pairs only** (recipes with opposite `side`). |
| D18 | Sources with unknown origin | Not decided by any draft (critic gap 1). | **Count as available**, with a "source unknown" badge, and a roster switch "Only recipes with a known source" (off by default). Hiding them would empty most 31–60 BoP sets. |
| D19 | Scarce recipe sources | Not decided (critic gap 3). | Favor, reputation and drop-only patterns appear as **non-core alternatives** ("needs 30 Favor") until the crafter marks them bought/learned. |
| D20 | Faction data | Critic gap 12. | Fetch `Faction`, `ChrClasses`, `ChrRaces`, `CharBaseInfo` in M1. Horde sources ship derived + mirrored, marked unverified; About shows coverage per faction. |
| D21 | Terminology | "BoE recipe" (vision) vs "tradeable pattern" (pipeline: no recipe item is BoE). | **"Tradeable pattern"** everywhere. |

### 4.3 Roles, ranking and roster

| # | Topic | Positions | Decision |
|---|---|---|---|
| D22 | Roles per class | Vision/UI: max 3. Roles: Druid has 4. | Roles come from `curation/roles.json`, **no fixed maximum**. |
| D23 | School select | UI: for casters and healers, default "Any". Roles: only Mage/Warlock/Priest casters, per-class default + "Mixed". | **Roles' model.** Values lower-case. "Any" dropped. |
| D24 | Roster entry shape | UI vs data-model vs roles. | UI's shape: `{id, cls, label, role, level, professions: [{id, skill, spec}], options: {school?, twoHand?}, favor}`; `weights` reserved for later. One faction per roster. Gathering professions selectable. |
| D25 | Path rule and "core" | UI: best per level, core = best ≥ 5 levels. Roles §6.4: envelope, par baseline, minimum gain, keep-for-N by spend tier. | **Roles owns the rule**; UI keeps the UX contract (pieces in hand win; "best for Head 25–34" tooltip). **Unpriced pieces count as tier "mid"**, not "keeper". `unconfirmed` items never core. The par baseline needs a 60 × 5 `budget` table emitted in `rules`. |
| D26 | Skill gates | UI: flag only. Roles: recipe skill must be reached. | **Recipe skill flags** (`!`), never filters. **Equip skill filters** only when an entered skill is below the rank; an estimated skill shows `~!`. |
| D27 | Crafter pace to 60 | Nobody owned it. | Theorycraft owns it in `curation/roles.json`; first version derived from recipe yellow/grey ranks by required level, labelled heuristic. |
| D28 | Specialisations | Roles: select at 40+/skill 200+. | **Not in M1.** Spec-gated recipes count as craftable by any crafter of the profession, with a "needs <spec>" badge. Select arrives with the Queue (M2). |
| D29 | Custom weights editor | Roles proposes "Advanced weights". | **Not in v1.** `weights` stays reserved in state. |
| D30 | Ranking quality gate | Critic gap 11. | A scrubbed oracle fixture (`class, role, level, slot → itemId`, ~100 rows derived from the prototype's curated 1–30 core picks, no names) as a golden test: **≥ 80 %** of core picks reproduced. 31–60 is reviewed via the build report's top picks. The fixture is produced by a private script outside this repo. |

### 4.4 Prices and state

| # | Topic | Positions | Decision |
|---|---|---|---|
| D31 | Price precedence | Pricing: override > vendor > imported AH > default > craft. Release comment: import > override > default > vendor. | **Pricing's order.** Intermediates at min(AH, craft), depth cap 4. |
| D32 | Price set shapes | Three shapes across drafts. | **Pricing's shape** for both imported and default sets, plus `dataset` and `build`. |
| D33 | Vendor goods | Data-model: curated flag in `curation/mats.json`, generator emits copper. | **Adopted.** |
| D34 | Overrides and owned mats | UI: plain copper. Pricing: `{c, set}` and `owned`. | **Pricing's override object**; `prices.owned` reserved in state, used from M2 (Queue). |
| D35 | Storage keys | UI: `foreverCraftedGear`; release: `<repo>.v1`; pricing: `<app>.prices.v1`. | `forever-gear-planner.state` (schema inside), `forever-gear-planner.prices`, `forever-gear-planner.prices.undo`, `forever-gear-planner.backup.<schema>`. No IndexedDB. |
| D36 | Realm display | UI shows faction with a realm. | Show the realm key only; Forever's keys carry no faction. |
| D37 | Export of imported prices | UI: checkbox. Pricing: no. | Checkbox, **off by default**. |
| D38 | Prototype extras | Data-model: "copied with edits". Critic: leak vector. | **Ported by a whitelist script** run privately, never by copy-paste. The script lives outside this repo. |

## 5. Milestones (summary; detail in [roadmap.md](roadmap.md))

- **M0** (2026-10-08, done with this commit series): skeleton, docs, privacy check.
- **M1** first usable page on beta data: full 1–60 enumeration, ranking, source/certainty badges, onboarding,
  Gear view, Auctionator import + overrides, export/import. Target **2026-10-22**.
- **P1** publish during the beta: GitHub remote, Actions (tests + privacy gate), Pages, `v0.1.0`, "beta data"
  banner. Target **2026-10-27**, no later than 2026-11-03.
- **M1.1** live refresh, 2026-11-05..07: new build, diff report, `v0.2.0`.
- **M2** Queue, shopping list, owned mats, crafter choice, specialisations, default price list from a live scan.
- **M3** Merchant's Favor (≤ 30 curated) and the enchant column with ported enchant rules.
- **M4** Consumables, reference texts, 31–60 source curation, Horde sources.

The public-during-beta decision (U4) shortens the critic's estimate by about ten days. What makes it feasible:
M1 ships no Queue, Favor, enchants or consumables; icons are off; prices come only from the user's import; Horde
and 31–60 sources are derived and badged rather than curated.

## 6. Open questions (after synthesis)

Each has a recommendation; answer in the roadmap's milestone where it becomes blocking.

- **S1. Beta price list during the beta?** U3 rules out beta prices *against live data*. While the page itself
  runs on beta data (P1 to 2026-11-05) a beta scan would match it. *Recommendation:* still none; the import is in
  M1 and an empty price column says honestly what's known. Revisit only if testers find the empty state confusing.
- **S2. Mail/plate at level 40?** Unverified for Forever (roles OQ1; Forever has a Retail-style armor proficiency
  spell). Single biggest visible ranking risk. *Recommendation:* in-game check before P1 (a level-40 Hunter or
  Warrior trainer, or the spell's tooltip); keep the gate in `curation/rules.json` so it's one edit.
- **S3. Wowhead and icon hotlinking terms.** *Recommendation:* icons off until the maintainer has read Wowhead's
  and Blizzard's terms; then one CDN, opt-in, disclosed.
- **S4. AllTheThings as a curation seed for 31–60 sources.** *Recommendation:* only after reading its license;
  until then cite public pages and in-game checks.
- **S5. Live product code and install folder name** for Forever on wago.tools and in the import help.
  *Recommendation:* check the week before 2026-11-05; both are one constant.
- **S6. Merchant's Favor account-wide or per character?** *Recommendation:* per crafter now, migrate if needed (M3).
- **S7. Commit author e-mail for the public repo.** *Recommendation:* before P1, set the repo's `user.email` to the
  GitHub `noreply` address and re-author the local history once (`git rebase --root --exec 'git commit --amend
  --reset-author --no-edit'`), then run the privacy check in history mode.
- **S8. Content phases.** Are the 69 Forever-new items without an ItemSparse row and the 51 stub-pattern recipes
  future content? *Recommendation:* exclude / mark `unconfirmed`; the release-day diff surfaces changes.

Role-document open questions not listed here are either answered by a row above or deferred to the milestone
that needs them (see the roadmap's per-milestone "decide before" lists).
