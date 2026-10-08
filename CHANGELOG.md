# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow semver, and data-only releases are patch releases (see docs/release-maintenance.md §6).

## [Unreleased]

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
