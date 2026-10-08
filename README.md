# forever-gear-planner

A planner for **crafted gear in WoW: Forever, levels 1–60**. Tell it which characters you play (class, role, level,
up to two professions), and it shows for each one which crafted pieces to make or buy at which level, who in your
roster can craft them, where the patterns come from, and what the materials cost at your Auction House.

**Status: M1 in progress: data and ranking library.** The generated beta data, the build report and the browser
libraries exist; the page itself is the next step of milestone M1 in [docs/roadmap.md](docs/roadmap.md). The plan is to go public during the Forever beta,
before the game launches on 2026-11-05, and to refresh the data for the live game right after launch.

## Who it is for

- Players leveling **several characters on one account** who craft for each other and mail BoE gear around.
- **Solo players** with one character, with or without crafting professions, who buy crafted BoE gear on the AH.
- Both factions, all nine classes. Desktop browsers. English game data.

## How the pieces fit

```
wago.tools DB2 exports ──▶ pipeline/ (Node) ──▶ site/data/forever/*.js ──┐
curation/*.json (sources, overrides, roles, rules) ──▶ pipeline/ ──────────┤
                                                                           ▼
your Auctionator file ──(file picker, stays in your browser)──▶ site/ (static page: index.html, lib/, app/)
                                                                           │
                                       your roster and progress ◀── localStorage, JSON export/import
```

- **Game data** is enumerated from the client's database tables for one build: every craftable piece of equipment
  up to level 60, with stats, armor, weapon damage, recipes, materials and derived recipe sources.
- **Curation** adds what the tables can't say (vendors, reputations, Favor patterns, exclusions) as reviewed JSON
  with citations.
- **Ranking** happens in the browser: each roster entry's role has stat weights, and the page picks a per-slot
  upgrade path for levels 1–60 from the pieces that entry can actually get.
- **Prices** come from your own Auctionator saved-variables file, read in the browser and never uploaded, plus
  manual overrides.
- The page is plain static files with no build step and no dependencies. It works from GitHub Pages and when opened
  straight from disk.

## Repository layout

| Path | What | Status |
|---|---|---|
| `docs/` | design documents, synthesis of decisions, roadmap | written |
| `site/` | the published page | `lib/` written; page in progress (M1) |
| `site/data/` | generated game data, never hand-edited | beta build 1.60.1.70205 |
| `pipeline/` | the data generator (Node, no dependencies) | written |
| `curation/` | hand-maintained inputs (JSON) | first version |
| `tests/` | `node --test` suites and synthetic fixtures | written |
| `tools/` | `check.sh`, `privacy-check.sh`, DB2 fixture cutter | written |
| `reports/`, `build-inputs/` | generator build reports and DB2 hash manifests | beta build 1.60.1.70205 |

Start with [docs/synthesis.md](docs/synthesis.md) for the decisions and [docs/roadmap.md](docs/roadmap.md) for
what comes next.

## Privacy

This repository must never contain personal data of its maintainers: character names, account identifiers, local
paths. `tools/privacy-check.sh` checks generic path patterns and a private denylist kept outside the repository.
Enable the pre-commit hook with `git config core.hooksPath .githooks`.

## License

Code, curation files and documentation: [MIT](LICENSE). Game data belongs to Blizzard Entertainment; see
[NOTICE.md](NOTICE.md).
