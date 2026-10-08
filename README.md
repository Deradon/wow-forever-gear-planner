# forever-gear-planner

A planner for **crafted gear in WoW: Forever, levels 1–60**. Tell it which characters you play (class, role, level,
up to two professions), and it shows for each one which crafted pieces to make or buy at which level, who in your
roster can craft them, where the patterns come from, and what the materials cost at your Auction House.

**Status: beta data (build 1.60.1.70205), v0.1.0.** The page works today: build a roster and get a ranked
crafted-gear path for levels 1–60 per character, with recipe source badges and prices from your own Auctionator
file. The data comes from the WoW: Forever beta client. Forever launches on 2026-11-05; the data will be refreshed
for the live game right after launch (roadmap M1.1), and the page says "Beta data" until then.

## Who it is for

- Players leveling **several characters on one account** who craft for each other and mail BoE gear around.
- **Solo players** with one character, with or without crafting professions, who buy crafted BoE gear on the AH.
- Both factions, all nine classes. Desktop browsers. English game data.

## Use it

- **Online:** <https://deradon.github.io/wow-forever-gear-planner/>
- **Offline:** download `site.zip` from the latest [release](https://github.com/Deradon/wow-forever-gear-planner/releases),
  unpack it anywhere and open `index.html`. No server and no network needed.
- **From a clone:** open `site/index.html` in the browser.

Start with "I play one character", "I play several" or the example roster. Your roster, progress and prices stay
in this browser; use **About → Export planner file** to move them to another browser or keep a backup.

## Import your Auction House prices

1. In game, scan at the Auction House with [Auctionator](https://www.curseforge.com/wow/addons/auctionator) (a full
   scan, or searches for your mats), then `/reload` or log out: the file is only written then.
2. In your WoW folder, open `_classic_beta_\WTF\Account\<your account folder>\SavedVariables\Auctionator.lua`
   (the folder name for the live game follows at launch).
3. On the **Prices** tab, pick that file or drop it on the page.

The page reads only the price database from the file (item, price, scan day) for the realm you choose. **The file
is read in your browser and never uploaded.** You can also type your own prices; they win over imported ones.

## Privacy

- Everything you enter stays in your browser's `localStorage`: roster, progress, your own prices, imported prices.
  There is no account, no server, no analytics and no tracking.
- Your Auctionator file is read locally. A planner export contains your roster labels and progress, and imported
  prices only if you tick the box.
- **Third-party requests:** none by default. Item names link to Wowhead; nothing is requested until you click a
  link. **Item icons are off by default.** If you switch them on (About → Display → show item icons), the page loads
  each icon from Wowhead's image host `wow.zamimg.com`, which then sees your IP address and browser like any
  website you visit. Switch them off and no image requests are made.

## Data sources and credits

- **Game data:** the WoW: Forever client's database tables, read from [wago.tools](https://wago.tools) exports at
  build time (build and table hashes in `build-inputs/`, the build report in `reports/`).
- **Icon names:** the [wowdev community listfile](https://github.com/wowdev/wow-listfile) (release pinned in
  `pipeline/icons.js`, hash in `build-inputs/`), joined with the icon IDs from the game data.
- **Icons:** loaded on request from [Wowhead](https://www.wowhead.com/forever/)'s image host when you switch them on.
  Item links point to Wowhead's Forever database, and its tooltips served as a cross-check for weapon damage.
- **Recipe sources:** curated from public sites and in-game checks; every entry cites its source (the list is on
  the About page and in `curation/reference.json`).
- Game data and trademarks belong to Blizzard Entertainment; see [NOTICE.md](NOTICE.md).

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
| `site/` | the published page | first usable page (M1) |
| `site/data/` | generated game data, never hand-edited | beta build 1.60.1.70205 |
| `pipeline/` | the data generator (Node, no dependencies) | written |
| `curation/` | hand-maintained inputs (JSON) | first version |
| `tests/` | `node --test` suites and synthetic fixtures | written |
| `tools/` | `check.sh`, `privacy-check.js`, `stamp.js`, DB2 fixture cutter | written |
| `.github/` | CI and Pages workflows, issue and PR templates | written |
| `reports/`, `build-inputs/` | generator build reports and DB2 hash manifests | beta build 1.60.1.70205 |

Start with [docs/synthesis.md](docs/synthesis.md) for the decisions and [docs/roadmap.md](docs/roadmap.md) for
what comes next.

## Develop

Requirements: Node 22 or newer (CI uses Node 24) and git. No packages, no build step.

```sh
tools/check.sh                          # privacy check and every node test (what CI runs)
git config core.hooksPath .githooks     # enable the privacy hooks in this clone (check.sh warns if not)
```

**Privacy check.** This repository must never contain personal data of its maintainers: character names, account
identifiers, local paths. `tools/privacy-check.js` checks generic rules (home and drive paths, account folders,
e-mail addresses; an `<angle-bracket>` placeholder never matches) plus a private denylist that lives outside the
repository. The hooks run it on staged files (`pre-commit`), the commit message (`commit-msg`) and every push
(`pre-push`: the pushed range, or the whole history for a new remote ref). Private matches are reported as
"private rule #n", never with their text.

Set up the denylist at `~/.config/forever-gear-planner/privacy-denylist.txt` (or point `--deny-file` or
`$FGP_PRIVACY_DENYLIST_FILE` at it), one rule per line, `#` for comments:

```
somename              plain: case-insensitive substring (the default; safest for names)
w:kip                 whole word only, for short names that occur inside ordinary words
re:\bab(?!cdef\b)\w+  regex: every word starting with "ab" except the login "abcdef" (negative lookahead)
```

Without a list the check fails (exit 2); `--no-private` runs the generic rules only and says so. Before a first
push to a new remote, run `node tools/privacy-check.js --history` (the pre-push hook enforces it). CI reads the list
from the repository secret `PRIVACY_DENYLIST` and runs `--history` on pushes and `--range` on pull requests.

**Releases.** A `v*` tag runs `.github/workflows/pages.yml`: CI, a stamped copy of `site/` deployed to GitHub
Pages, and a release with `site.zip` whose notes are the tag message (the CHANGELOG entry).

## Regenerate data

```sh
node pipeline/main.js fetch --build 1.60.1.70205                    # DB2 tables and the icon listfile into the cache
node pipeline/main.js build --build 1.60.1.70205 --date 2026-10-08  # offline: site/data/forever/*.js and reports/
```

The cache lives outside the repository (`~/.cache/forever-gear-planner`); raw tables are never committed. The build
is deterministic, so a second run leaves the tree clean. Work the report's blocking section until it is empty. The
release-day procedure is in [docs/game-data-pipeline.md](docs/game-data-pipeline.md) §14 and
[docs/release-maintenance.md](docs/release-maintenance.md) §8.6. Details: [pipeline/README.md](pipeline/README.md).

## Contributing

- **Issues:** [data error](https://github.com/Deradon/wow-forever-gear-planner/issues/new?template=data-error.yml)
  (a cropped in-game tooltip settles most cases), price import problem (**never attach your Auctionator file**; it
  contains character and realm names), feature request.
- **Curation** (`curation/*.json`): every entry says `why`, and `cite` plus `checked` when it asserts an outside
  fact or contradicts the game data. When three or more items need the same correction, the fix belongs in
  `pipeline/` with a test instead. Commit the regenerated `site/data/` and report with the curation change.
- Pull requests: `tools/check.sh` green, CHANGELOG "Unreleased" updated, screenshots with generic characters only.

## License and notice

Code, curation files and documentation: [MIT](LICENSE). forever-gear-planner is an unofficial fan project, not
affiliated with or endorsed by Blizzard Entertainment. Game data, names and trademarks belong to Blizzard
Entertainment; see [NOTICE.md](NOTICE.md) for the notice and the data credits.
