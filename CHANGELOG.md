# Changelog

All notable changes to this project are documented here. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versions follow semver, and data-only releases are patch releases (see docs/release-maintenance.md §6).

## [Unreleased]

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

### Data
- Forever beta build 1.60.1.70205: 1,274 items, 1,394 recipes, 356 mats (`reports/1.60.1.70205.md`).
