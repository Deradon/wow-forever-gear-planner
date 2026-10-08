# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow semver, and data-only releases are patch releases (see docs/release-maintenance.md §6).

## [Unreleased]

## [0.2.0] - 2026-10-08

The crafting queue (roadmap M2): the Gear view tells each character what to wear, the Queue tells each crafter what
to make, in what order, and what to buy for it.

### Added
- **Queue** view (tab and key `2`; Prices and About move to `3` and `4`): crafter buttons for every roster entry with a
  crafting profession, then **Auction House** and **All**; `[` and `]` switch crafters. Skill inputs per profession
  (estimate shown as `~`), Core only, Show hidden.
- To craft: learned box per crafter and recipe spell, recipe skill with `!`/`~!`, item and slot, "for whom at which
  level" buttons that mark the piece in bags for that character (with Undo), quantity across the roster, source,
  cost each and total. BoP pieces appear only under their own crafter. The Auction House list shows the BoE pieces
  nobody in the roster crafts with price, source and scan date.
- Crafter pace: per profession the next three points "character X reaches level N → needs skill S".
- Shopping list per crafter and for All: mats through the intermediates the crafter makes, unit price with source and
  age, a **Have** column (owned mats), Need, the totals **Value of mats used** and **To buy** (owned mats lower only
  the cash), gathering roster members, a count of mats without a price; "only needed within N levels" (default 5).
- Per-item crafter choice on Gear and Queue rows that have more than one route (a roster crafter or the Auction
  House); it survives reloads and export/import, and is dropped when that crafter is deleted.
- Specialisations: a select in the character form for Blacksmithing, Leatherworking and Engineering from level 40 or
  skill 200. With a specialisation set, a recipe for another one is not made by that crafter (BoE pieces fall to
  another crafter or the Auction House) and its badge stays "needs <spec>"; Master specs count as Weaponsmith. With
  none set, nothing changes (D28).
- `tools/prices-default.js`: builds a default price list from one Auctionator scan for the game data's build (refuses
  another build and scans older than 14 days). No list ships until a live scan exists (U3); the page uses one when
  `index.html` loads it.
- `site/lib/queue.js` (pure queue model), `rank.routeOptions`, state prefs `queueSel`, `within`, `showHidden.queue`;
  the state stays at schema 1 and exports from v0.1.x import unchanged.

### Changed
- Build report diff section (`--diff-against`, game-data-pipeline §14 step 3): DB2 tables that changed; removed,
  changed field by field, and added items, recipes and mats (added ones grouped by profession and derived source);
  counts per profession and bracket old → new; R1 items that gained an ItemSparse row and stub patterns that became
  real. It also accepts a directory of generated data; the funnel compares against the baseline's counts.
- Generator: `build --status beta|live` and `--product <code>` set `meta.status` and `meta.product` (defaults `beta`,
  `wow_classic_beta`), so the live refresh needs no code edit.

### Data
- Release-day rehearsal on beta build 1.60.1.70245: its DB2 tables are byte-identical to 1.60.1.70205 (0 items or
  recipes added, removed or changed; no curation changes), so the shipped data stays at 1.60.1.70205. Record:
  `reports/1.60.1.70245.md`, `build-inputs/db2-1.60.1.70245.sha256`.

## [0.1.1] - 2026-10-08

### Fixed
- Upgrade path: a piece was dropped as "worn too briefly" because of a successor that was itself dropped later, so
  hiding an earlier piece could make it reappear (e.g. White Leather Jerkin for a feral Druid after hiding the
  Handstitched Leather Vest). The shorter-lived successor now goes first; 9 of 252 class/role/slot paths gain the
  piece they had lost, and the ranking oracle is unchanged (56/68).

## [0.1.0] - 2026-10-08

First public release, on WoW: Forever beta data, with a "Beta data" banner until the live refresh after the
2026-11-05 launch.

### Added
- Design documents in `docs/` (planning phase), roadmap, repository skeleton and privacy check.
- Data pipeline (`pipeline/`, Node): DB2 cache with hash manifest, enumeration of craftable equipment 1–60, stats,
  armor and weapon damage, recipes, derived and curated sources, deterministic emitter, build report.
- Curation inputs (`curation/*.json`) with a schema check.
- Browser libraries (`site/lib/`): ranking path rule, Auctionator reader (Lua literals, CBOR), price model, user state.
- M1 page (`site/index.html`, `style.css`, `app/`): onboarding (one character, several, example roster), entry form,
  Gear view (roster cards with inline level, slot lanes 1–60, next upgrades, full plan, alternatives for Favor,
  reputation and drop-only patterns, Get via, source badges, status, hide with undo, search, keyboard shortcuts),
  Prices (Auctionator file by picker or drop, realm choice, one undo slot, your own prices, redacted diagnostic),
  About (data freshness, source coverage per level band and faction, export, import, reset), offline item tooltips
  and Wowhead links. Works from `file://` with networking off; light and dark themes.
- `tests/js/site-static.test.js` (static-page constraints) and `site-app.test.js` (acceptance steps 1–6 in Node).
- Tests (`tests/js/`, `node --test`) and `tools/check.sh`.
- Opt-in item icons: a Display panel on About (theme, tooltips, icons) with a disclosure; with icons on, item links
  and tooltips show icons from Wowhead's image host (lazy, no referrer); with them off the page makes no image
  requests. The generator emits `icon` names from the wowdev community listfile.
- `tools/privacy-check.js` (Node): working-tree, `--staged`, `--message`, `--range` and `--history` modes, private
  denylist from a file, an environment variable or the CI secret, redacted private output; hooks `pre-commit`,
  `commit-msg` and `pre-push`.
- GitHub Actions: `ci.yml` (privacy gate and tests on pushes and pull requests) and `pages.yml` (deploy to GitHub
  Pages on `v*` tags with content-hash stamps from `tools/stamp.js`, release with the offline `site.zip`).
- Issue templates (data error, price import problem, feature request) and a pull request checklist.
- README sections: use it, price import, privacy, data sources and credits, develop, regenerate, contributing.

### Changed
- The beta banner names the build and the launch date.

### Removed
- `tools/privacy-check.sh`, replaced by the Node check.

### Data
- WoW: Forever **beta** build 1.60.1.70205 (product `wow_classic_beta`): 1,274 items, 1,394 recipes, 356 mats
  (`reports/1.60.1.70205.md`); data hash `e5bf2a5de069`.
- Weapon damage corrected from in-game tooltips (game-data-pipeline §6.3): one-hand caster weapons deal 2/3 of the
  one-hand table (two-hand casters keep 0.743), thrown weapons the one-hand table × 0.9 (guns, bows and crossbows
  keep two-hand × 0.6); the four bomb satchels carry curated damage from their tooltips.
- Icon names for all 1,274 items and 356 mats (community listfile 202610080338; items without an icon ID use their
  default appearance's icon, from `ItemModifiedAppearance` and `ItemAppearance`).
- Curation: recipe sources for 348 items in 68 families (levels 1–30 Alliance curated), 32 NPCs, 10 item entries
  (availability, random stats, satchel damage), 26 vendor and 135 gathered mats.
