# Task

Implement the first half of milestone M1 of forever-gear-planner: the Node data pipeline, the curation inputs,
the generated beta data set for build `1.60.1.70205`, the build report, the browser-side ranking and price
libraries, and their node tests. No DOM code in this session; the page (`site/index.html`, `site/app/`) is a
second brief that builds on reviewed data.

This is a public planner for crafted gear in WoW: Forever (levels 1–60). The maintainer reads the build report
to review the data before the page is built; a second session then implements the UI against the data and
`site/lib/` modules you produce, so stable shapes and a report a human can scan matter more than speed.

# Context (verified facts)

- Repo: this directory, git `main`, 3 commits, docs only. No remote. `core.hooksPath` is `.githooks`
  (pre-commit runs `tools/privacy-check.sh --staged`); the private denylist exists at
  `~/.config/forever-gear-planner/privacy-denylist.txt`, so the check runs in full mode.
- `docs/synthesis.md` is authoritative (decisions D1–D38, U1–U4) wherever a role document disagrees.
  `docs/roadmap.md` §M1 lists the files for all of M1; this brief takes the pipeline, curation, data, `site/lib/`
  and tests rows and leaves `site/index.html`, `site/style.css` and `site/app/*` to the next brief.
- Toolchain: Node v24.14.1 on WSL2 Ubuntu. CommonJS `.js`, zero dependencies, `node --test` (D1, D11). No
  Python.
- DB2 source: `https://wago.tools/db2/<Table>/csv?build=<build>`. wago.tools answers Python's default user agent
  with 403; curl works. Send a project User-Agent such as `forever-gear-planner/0.1 (+github)` from Node.
- The prototype's DB2 cache already holds every table of §2 of `docs/game-data-pipeline.md` for `1.60.1.70205`
  except `Faction`, `ChrClasses`, `ChrRaces`, `CharBaseInfo` and `ItemSetSpell`, at
  `~/.cache/wow-assistant/<Table>-1.60.1.70205.csv` (flat layout), plus the pinned Era/SoD reference tables
  `Item`, `ItemSparse`, `SkillLineAbility`, `SpellEffect`, `SpellName`, `SpellItemEnchantment`, `ItemEffect` for
  build `1.15.9.70003`. The planning numbers (1,274 items etc.) were measured on exactly these files. Seed the new
  cache layout `<cache>/db2/<build>/<Table>.csv` from them instead of refetching:

  ```sh
  for f in ~/.cache/wow-assistant/*-1.60.1.70205.csv ~/.cache/wow-assistant/*-1.15.9.70003.csv; do
    b=$(basename "$f" .csv); t=${b%-*}; v=${b##*-}
    mkdir -p "${FGP_CACHE:-$HOME/.cache/forever-gear-planner}/db2/$v" && cp -n "$f" "${FGP_CACHE:-$HOME/.cache/forever-gear-planner}/db2/$v/$t.csv"
  done
  ```

  Never read `~/.cache/wow-assistant/wowhead-forever-items.json` (D7: no Wowhead data in this repo).
- Measured facts to reproduce (game-data-pipeline §3–§5): 2,303 craft rows → 1,567 equippable → 1,281 with an
  ItemSparse row → 1,274 after the cosmetic drop; 131 intermediates, 356 mats; 86 recipes need a
  specialisation; 20 spells with more than one pattern; no recipe item is BoE. Per-profession bracket counts are
  in §4.2.
- Weapon rules (D14): `Flags_4 & 0x100` = caster weapon → DPS table × 0.743; guns → TwoHand table × 0.6;
  displayed min/max from DPS, speed and `DmgVariance`; DPS and speed to 2 decimals (D10). Apply as written; the
  three tooltip checks (Dreamstaff, Searing Golden Blade, one thrown weapon) have not been done. List those three
  items with their computed values in the report's "needs in-game check" section.
- Mail/plate proficiency gate stays at level 40 in `curation/rules.json` (S2 unverified; one edit later).
- Fixture values (game-data-pipeline §15): Fine Leather Boots armor 51, Agi 3, Sta 2; Glimmering Staff 32–49;
  Solid Iron Maul 43–66; Deadly Blunderbuss 15–28; Heavy Copper Maul 28–43; Greater Magic Wand 17.5 DPS.
- The role document `roles-stat-weights.md` §4.7 still names `window.GEAR_ROLES`; D4/D5 override it: roles are
  `curation/roles.json`, emitted as `site/data/forever/roles.js` setting `window.FGP_DATA.roles`.
- A validated Lua-literal + CBOR reader for Auctionator files exists outside this repo. It is not available to
  you; write `site/lib/lua-literal.js` and `site/lib/cbor.js` from `docs/pricing-import.md` §1.3–§2.5 and the
  RFC 8949 test vectors. The orchestrator can answer questions about the real file's shape.

# Orchestration

This brief was written by the session `forever-gear-planner-a4`, which stays running as orchestrator. Message it
with `SendMessage({to: "forever-gear-planner-a4", message: ...})`:

1. As soon as `pipeline/curation.js` fixes the validated shapes of `curation/sources.json`, `curation/npcs.json`
   and `tests/fixtures/oracle.json` (send the shapes or the file paths of the validators). The orchestrator
   produces those three files privately from the prototype (D30, D38) and tells you when they are in the working
   tree. Until then, ship empty arrays for `sources.json` and `npcs.json`, and make `tests/js/oracle.test.js` skip
   with a visible message when the fixture is absent.
2. When a decision in the docs is missing or contradicts measured data, and the synthesis does not settle it.
   State the options and your pick; continue with your pick unless the answer changes the shape of a shipped
   file.
3. When the definition of done is met, with the report path and the test summary.

Nobody else writes in this working tree. The orchestrator writes only the three files above.

Shapes the orchestrator relies on, taken from the docs; message before deviating:

- `sources.json`: array of family entries exactly as data-model §11.1 (`why`, `items`, `names`, `sources[]`
  with §7.1 kinds and common fields, `cite`, `checked`).
- `npcs.json`: records per data-model §7.2, keyed by slug.
- `oracle.json`: `{"dataset": "forever", "build": "1.60.1.70205", "rows": [{"cls": <class key from
  roles.json>, "role": <role key>, "level": <int>, "slot": <item slot string as in items.js>, "item": <item ID>}]}`,
  about 100 rows, no names. The test counts a row as reproduced when the item (or a `mirror` partner) is a core
  step covering that level in the path for that class, role and slot.

# Read these first

1. `docs/synthesis.md` — every decision; D1–D21 and D25–D27 govern this brief.
2. `docs/roadmap.md` §M1 — the file list, data to generate, and acceptance check 7 (the only one in scope here).
3. `docs/game-data-pipeline.md` — §2 tables, §3 enumeration, §5 rules R1–R8, §6 formulas, §7–§9 skill, mats,
   sources, §10 ranking interface, §13 caching and determinism, §15 tests.
4. `docs/data-model.md` — §3 file split and loading contract, §4–§7 record shapes, §9 rules, §11 curation inputs.
5. `docs/roles-stat-weights.md` — §2 usability, §3 roles, §4 weights and §4.7 JSON, §6 candidate filter, score,
   slot groups and path rule (D25 makes §6.4 authoritative, with unpriced pieces as tier "mid").
6. `docs/pricing-import.md` — §1–§3, §6–§8 for `lua-literal.js`, `cbor.js`, `auctionator.js`, `pricing.js`,
   `state.js` and their tests.
7. `docs/release-maintenance.md` §7–§8 — test layout and `tools/check.sh`.
8. `docs/critique.md` — only when a role document seems inconsistent; it lists the known contradictions.

# Known problems / dead ends

- `ItemSparse` has 19,226 rows and `Item` 31,822: an item without an ItemSparse row is not in the game (R1). Do
  not try to reconstruct such items.
- Loot, vendor and quest data are not in the client; "source unknown" is a legitimate derived result (D18).
- The `…Caster` damage tables are identical to the plain tables in this build; the 0.743 factor comes from
  `Flags_4`, not from a table.
- Six stat IDs ship as `Stat<ID>` (D16); any other unknown stat ID blocks the build.
- `SkillLineAbility.MinSkillLineRank` is 1 almost everywhere; recipe skill comes from the pattern's
  `RequiredSkillRank` or, for trainer recipes, from the yellow/grey ranks (`approx`, §7).

# Constraints

- Privacy: the repo must never contain character names, account IDs, realm keys, local user paths or
  e-mail addresses. Run `tools/privacy-check.sh` before every commit (the hook does it); a failing check is a
  stop, not something to work around. Do not open `../../web/forever-gear/`, `../../tools/gear-data.py`,
  `../../tools/ah-prices.py` or `../../notes/`; the orchestrator ports what is needed from them (D38).
- Determinism: generation is a pure function of the cached CSVs, `curation/`, and `--date`. No wall-clock, no
  network during generation, LF endings, fixed key order, one record per line. The hash manifest
  `build-inputs/db2-1.60.1.70205.sha256` is written on first fetch and checked afterwards (`--accept-new-hashes`
  to update deliberately).
- Site data and libs are classic scripts for `file://`: no `type="module"`, no `fetch`, no `import`; `site/lib/`
  modules are UMD-style (attach to `window.FGP.<module>` in the browser, `module.exports` in Node) so the report
  and the tests run the same ranking code as the page (D3, D4).
- All hand-maintained inputs are JSON under `curation/` and are validated by `pipeline/curation.js`;
  `site/data/` is generated only (D5). Curation entries carry `why`, `cite`, `checked`, `names` (D6).
- Edit files in place with targeted replacements. Do not draft a file or section in a scratch file and
  reassemble it, and do not rewrite a whole file; the output tokens spent on edits are best minimized whenever
  that does not change the end result.
- Commit in coherent steps on `main` with the attribution line Claude Code gives you; do not add a remote or
  push (P1 re-authors history first, S7).

# Non-goals

- No `site/index.html`, `site/style.css`, `site/app/*`: the page is the next brief.
- No `enchants.js`, `prices-default.js`, consumables, Favor curation, specialisation select, weights editor,
  icons or Wowhead fetches (M2–M4, D7, D28, D29).
- No Node rewrite of `tools/privacy-check.sh` (P1) and no GitHub Actions workflows (P1).
- No edits to the design documents beyond adding a dated note under a decision you had to deviate from; the
  orchestrator updates the docs.
- No changes to the Era/SoD reference build pin `1.15.9.70003`.

# Definition of done

1. `node pipeline/main.js build --build 1.60.1.70205 --date <today>` runs offline from the seeded cache and
   writes `site/data/forever/{meta,items,recipes,mats,sources,rules,roles,reference}.js`,
   `reports/1.60.1.70205.md` and `build-inputs/db2-1.60.1.70205.sha256`; the five missing tables were fetched
   once and are in the manifest.
2. The report's funnel reproduces the measured counts (1,274 items, 356 mats, 86 spec-gated recipes), its
   blocking section is empty, and it shows the top 3 picks per role and 10-level bracket for at least Warrior
   melee, Mage caster, Priest healer, Hunter ranged and Druid tank, plus the "needs in-game check" list.
3. A second generator run on the same inputs produces no diff (`git status` clean after the rerun).
4. `site/lib/` holds `version.js`, `rank.js`, `lua-literal.js`, `cbor.js`, `auctionator.js`, `pricing.js`,
   `state.js`, each loadable in Node and as a classic script.
5. `tools/check.sh` is green: all `tests/js/*.test.js` from roadmap §M1 except `site-static.test.js` (no page yet),
   with `oracle.test.js` passing at ≥ 80 % once the fixture has arrived, and the privacy check clean.
6. `curation/` holds `roles.json`, `rules.json`, `items.json`, `mats.json`, `reference.json` with content, plus
   the orchestrator's `sources.json` and `npcs.json`; every file validates.
7. README status line updated from "planning" to "M1 in progress: data and ranking library", and the orchestrator
   has received the completion message.

# Expected cost

~150–250 assistant turns, ~10–20M tokens on opus. Per-turn context grows once the data files and the report
are in the tree; keep large generated files out of your reads (use the report and targeted `grep`/`sed -n`).
This is a statement of fact for the person launching the session, not a limit.

# Suggested first steps

- Read the four documents listed first, then seed the cache with the loop above and fetch the five missing
  tables; write the manifest.
- Build `csv.js`, `db2.js`, `constants.js`, `enumerate.js` first and stop at the funnel counts: they must match
  §4 before anything else is worth doing.
- Fix the curation validator shapes early and send them to the orchestrator so the private ports can run in
  parallel with `items.js`, `recipes.js`, `sources.js` and `emit.js`.
- Port the path rule (`rank.js`) before the report, since the report's top picks are its first review.
