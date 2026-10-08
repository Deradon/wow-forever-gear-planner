# Roadmap

Status 2026-10-08: M0 done, M1 next. Decisions referenced as `U1`–`U4` and `D1`–`D38` are in
[synthesis.md](synthesis.md); where a role document disagrees with the synthesis, the synthesis wins.

Dates are targets, not promises. The fixed external date is the WoW: Forever launch, **2026-11-05 00:00 CET**.
The planner goes **public during the beta** (U4), so P1 must land before that date.

```
M0 skeleton ─▶ M1 first usable page ─▶ P1 publish (beta) ─▶ M1.1 live refresh ─▶ M2 queue ─▶ M3 favor+enchants ─▶ M4 consumables+curation
 2026-10-08      target 10-22             target 10-27         11-05..07
```

## M0 — skeleton and design (done)

- Repo, README, LICENSE (MIT), NOTICE, `.gitignore`, `.gitattributes`, CHANGELOG.
- `docs/`: the role documents, the critique, the synthesis, this roadmap.
- Empty structure with a README per directory (`site/`, `site/data/`, `pipeline/`, `curation/`, `tests/`,
  `tools/`), `tools/privacy-check.sh` and an opt-in pre-commit hook (`.githooks/`).

## M1 — first usable page on beta data

**Goal:** a stranger opens `site/index.html` from disk (or a local static server), builds a roster, and gets a
ranked crafted-gear path for levels 1–60 per roster entry, with honest source information and prices from their
own Auctionator file. Beta build `1.60.1.70205`.

### Decide before starting (from the open questions)

- Run the three missing DPS tooltip checks (D14) and fetch `Faction`, `ChrClasses`, `ChrRaces`, `CharBaseInfo`
  for the build (D20).
- Mail/plate gate (S2): keep 40 unless the maintainer has checked it in game.

### Files to create

Pipeline (Node ≥ 20, CommonJS, zero dependencies; D1, D11):

| File | Purpose | Ported from (prototype generator) |
|---|---|---|
| `pipeline/main.js` | CLI: `node pipeline/main.js build --build <b> --date <YYYY-MM-DD> [--cache <dir>] [--diff-against <tag>]` | — |
| `pipeline/csv.js` | RFC 4180 CSV reader (~40 lines) | — |
| `pipeline/db2.js` | fetch tables from wago.tools with a project User-Agent, cache under `$FGP_CACHE` or the user cache dir, write/verify `build-inputs/db2-<build>.sha256` | the table loader |
| `pipeline/constants.js` | `STAT`, `SLOTIDX`, `QUALITY`, `SLOT`, `ARMOR`, `WEAPON`, `BIND`, `ARMOR_COL`, profession IDs | constants block |
| `pipeline/enumerate.js` | SkillLineAbility + SpellEffect 24 → craft rows; leftover rules R1–R8 (game-data-pipeline §3, §5) | `GameData.__init__` indexes |
| `pipeline/items.js` | stats, armor (incl. shields), weapon damage with the D14 rules, `avail`, `flags`, faction-pair `mirror` (D17) | `stats`, `armor`, `weapon`, `damage`, `describe` |
| `pipeline/recipes.js` | recipe records: spell, profession, skill (+ `approx`), mats, output count, pattern item, `pattern.spec` | `craft_cost` (mats only, no prices) |
| `pipeline/sources.js` | derived sources (trainer / tradeable pattern / BoP pattern / reputation from pattern columns) merged with `curation/sources.json`; `side`, `certainty` | `source` (with the BoE-pattern bug fixed) |
| `pipeline/curation.js` | load + validate `curation/*.json` (hand-rolled schema check; `why`/`cite`/`checked`/`names`, D6) | — |
| `pipeline/emit.js` | deterministic writer for `site/data/forever/*.js`: `window.FGP_DATA.<section> = …`, one record per line, fixed key order, `dataHash` | `fmt` |
| `pipeline/report.js` | `reports/<build>.md`: counts funnel, blocking issues, unknown stats, top 3 picks per role × 10-level bracket (runs `site/lib/rank.js`), diff vs a tag | — |

Curation (JSON, hand-maintained, D5):

- `curation/roles.json` — classes, roles, defaults, weights, school shares, pace table to 60 (D22, D23, D27), from
  roles-stat-weights §3–§4.7.
- `curation/rules.json` — armor/weapon usability and level gates, dual wield, relics, slot groups, stat labels,
  the 60 × 5 par `budget` table (D25).
- `curation/items.json` — exclusions and overrides by item family (`avail`, `why`, `cite`, `checked`).
- `curation/sources.json`, `curation/npcs.json` — recipe sources ≤ 30 (Alliance) ported from the prototype by a
  **private whitelist script** that runs outside this repo (D38); Horde mirrors marked unverified.
- `curation/mats.json` — vendor goods by item ID (D33).
- `curation/reference.json` — the "beta data" notice, coverage wording, data notes.

Site (classic scripts, no modules, no fetch, relative paths; D3, D4):

| File | Purpose |
|---|---|
| `site/index.html` | script order: `data/forever/*.js`, `lib/*.js`, `app/*.js`; pre-paint theme script |
| `site/style.css` | ported from the prototype (quality and class colours incl. Shaman, lanes, badges, themes) |
| `site/lib/version.js` | `APP_VERSION`, `SUPPORTED_SCHEMA` |
| `site/lib/rank.js` | candidate filter (usability, BoP only for crafters, equip skill, side, availability), score, path rule (D18, D19, D25, D26) |
| `site/lib/lua-literal.js`, `site/lib/cbor.js`, `site/lib/auctionator.js` | saved-variables reader, CBOR decoder, price-set builder (pricing-import §2; a validated prototype of the first two exists, ~130 lines) |
| `site/lib/pricing.js` | precedence override > vendor > AH > craft (D31), staleness bands, craft cost depth 4 |
| `site/lib/state.js` | schema 1, `defaults`/`normalize`/migrations, storage keys (D35), export/import validation |
| `site/app/main.js` | boot, data/schema check, render loop with focus restore, keyboard shortcuts |
| `site/app/onboarding.js` | empty state (one / several / example roster), faction, entry form |
| `site/app/gear.js` | Gear view: entry cards, slot lanes 1–60, next upgrades, full plan, filters, "Get via", status, hide + undo |
| `site/app/prices.js` | Prices panel: file picker + drop, realm choice, undo, overrides, redacted diagnostic |
| `site/app/about.js` | data freshness, coverage per band and faction, export/import/reset, storage status |
| `site/app/tooltip.js` | offline item tooltips; Wowhead links (no script, no icons; D7) |

Generated (committed): `site/data/forever/{meta,items,recipes,mats,sources,rules,roles,reference}.js`,
`reports/1.60.1.70205.md`, `build-inputs/db2-1.60.1.70205.sha256`. No `enchants.js` and no `prices-default.js` in M1.

Tests (`node --test`, no packages):

- `tests/js/csv.test.js`, `items.test.js` — formula fixtures (game-data-pipeline §15), enumeration counts.
- `tests/js/determinism.test.js` — two generator runs on the fixture subset are byte-identical.
- `tests/js/curation.test.js` — schema and reference integrity.
- `tests/js/rank.test.js` — usability and availability rules (BoP only on crafters, side filter, equip skill).
- `tests/js/oracle.test.js` — scrubbed fixture `tests/fixtures/oracle.json` (class, role, level, slot → item ID),
  **≥ 80 %** of core picks reproduced (D30). The fixture is produced privately from the prototype and contains no
  names.
- `tests/js/auctionator.test.js` — synthetic saved-variables files (Blizzard-style and LibCBOR-style CBOR), escapes,
  RFC 8949 vectors, error offsets.
- `tests/js/pricing.test.js`, `state.test.js` — precedence, staleness, normalize/migrate, export round trip.
- `tests/js/smoke-data.test.js` — every data file defines only its own section, dataset/build keys agree, size
  budgets (each file ≤ 2.5 MB, `site/` ≤ 4 MB), `dataHash` matches.
- `tests/js/site-static.test.js` — no `type="module"`, no `fetch(`, no root-relative URLs, no external requests.
- `tools/check.sh` — all of the above plus `tools/privacy-check.sh`.

### Data to generate

- Build `1.60.1.70205`, `meta.status = "beta"`, `--date` = the generation day.
- About 1,274 items, ~1,281 gear recipes plus intermediate recipes, ~356 mats (game-data-pipeline §4).
- A build report the maintainer reads: blocking section empty; top picks for at least Warrior (melee), Mage
  (caster), Priest (healer), Hunter (ranged), Druid (tank) in every 10-level bracket look sane.

### Acceptance check (first usable page)

Run in a fresh browser profile, page opened from `file://`, networking disabled:

1. Onboarding → Alliance → "I play one character" → Priest, healer, level 12, no professions. Within 6
   interactions the Gear view shows a ranked path with only BoE crafted pieces, each with a source badge, and
   "no price" where no import exists. No failed requests in the console.
2. Example roster (Mage with Tailoring + Enchanting, Warrior with Mining + Blacksmithing, Rogue without
   professions): Tailoring BoP pieces appear only on the Mage; Blacksmithing BoE weapons appear on the Rogue with
   "via Warrior → mail"; no row shows a BoP piece for a non-crafter.
3. A level-45 entry shows candidates with "source unknown" badges; switching on "Only recipes with a known
   source" removes them; a Favor or reputation pattern is listed as an alternative, not as a core step.
4. Import a synthetic Auctionator fixture through the file picker: prices appear with an age; a manual override
   wins over the imported price; undo restores the previous set.
5. Keyboard only: add an entry, change its level, hide a piece and undo, switch entries.
6. Export → Reset → Import restores the same view.
7. `tools/check.sh` is green (all tests, oracle ≥ 80 %, privacy check clean); a second generator run gives no diff.

## P1 — publish during the beta

Target 2026-10-27, latest 2026-11-03.

- Settle S3 (icons stay off unless the terms are read) and S7 (commit author e-mail: set `noreply`, re-author the
  local history, run the privacy check in history mode).
- Replace `tools/privacy-check.sh` with the Node check from release-maintenance §10 (staged / range / history
  modes, private denylist from file, env var or CI secret, private matches reported as "private rule #n").
- Create the GitHub repo, add the remote, push. Enable Actions: `ci.yml` (tests + privacy gate on push and PR),
  `pages.yml` (gates, cache-busting stamp, deploy `site/` on `v*` tags and manual dispatch).
- README: status "beta data", how to import prices, privacy statement (nothing is uploaded), data sources and
  NOTICE. Issue templates (data error, price import, feature).
- Tag `v0.1.0`. A visible banner: "Beta data (build 1.60.1.70205). Forever launches 2026-11-05; data will be
  refreshed."

## M1.1 — live refresh (2026-11-05..07)

Follow game-data-pipeline §14 with the D7 change (no Wowhead snapshot in the repo; the local cross-check only).

- Rehearse the procedure on any newer beta build by 2026-11-01 (tag the beta data `data-beta-1.60.1.70205`).
- Find the live product code and build (S5); fetch; generate with `--diff-against`; work the report until the
  blocking section is empty; review top picks; `meta.status = "live"`; tag `data-<build>` and `v0.2.0`.
- Update the import help with the live install folder name (S5).
- Re-run after 3 and 7 days.

## M2 — crafting queue and prices

- Queue view per profession across the roster, with an "Auction House" pseudo-crafter; shopping list with "To buy"
  and "Value of mats used"; owned mats (`prices.owned`, D34); per-item crafter choice; specialisation select (D28).
- Default price list from a live scan (U3): `tools/prices-default.js` reusing `site/lib/auctionator.js`, refuses a
  build mismatch, metadata scan date + build only.
- Decide: weights editor (D29) only if users ask.

## M3 — Merchant's Favor and enchants

- Favor view for the curated ≤ 30 patterns; "Favor patterns above level 30 are not yet mapped". S6 decided.
- `enchants.js` generated from DB2 (game-data-pipeline enchant port), enchant column on the Gear view, enchant
  rules ported to roster inputs and the shared weights (owner: theorycraft). Stat 124 mapping resolved (D16).

## M4 — consumables and curation depth

- Consumables and reference texts, derived with curation as overrides.
- 31–60 source curation and Horde sources (S4 decides whether AllTheThings may seed it); coverage figures on About
  rise as curation lands.

## Later (not scheduled)

- In-game export addon for levels, professions, skills and prices (ruled out for v1).
- Several rosters / per-entry faction.
- Icons from a CDN once S3 is settled.
- Other ranges or flavors through the build key.
