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
- Tests (`tests/js/`, `node --test`) and `tools/check.sh`.

### Data
- Forever beta build 1.60.1.70205: 1,274 items, 1,394 recipes, 356 mats (`reports/1.60.1.70205.md`).
