# Release and maintenance

> Planning-phase role document (2026-10-08). Where it disagrees with [synthesis.md](synthesis.md), the synthesis
> wins; read the synthesis for what was decided and this document for the reasoning.

Role: release / infrastructure. Scope: the new repo's layout, how the page is served (GitHub Pages and
`file://`), tests and CI, how game data and default prices are regenerated, versioning, licensing options, the
privacy check, and the contributor workflow. Data shapes, the pipeline's algorithms, the UI and the price
import are other roles' documents; where this one depends on them, see "Assumptions about other areas".

Placeholders: `<repo>` is the undecided repo name, `<owner>` the GitHub account. The env-var prefix `FGP_`
("Forever Gear Planner") follows the name decision.

## 1. Summary

- The static site lives in **`site/`**. Design documents live in `docs/`. GitHub Pages is fed by an **Actions
  workflow** that uploads `site/` as the Pages artifact. Tests and the privacy check run in the same workflow and
  block a deploy that fails them.
- The page keeps the prototype's loading model: **classic `<script>` tags, relative paths, data as `.js` files
  that assign globals**. No ES modules, no `fetch`. Both are verified to break under `file://` (section 4).
- Generated data is committed under `site/data/` and written deterministically: one record per line, stable
  order, no wall-clock timestamps. Raw DB2 CSVs, the Wowhead cache and Auctionator files are never committed.
- Tests need **zero third-party packages**: `node --test` for browser logic and the data smoke test,
  `python3 -m unittest` for the generator, with small synthetic fixtures.
- The **privacy check** is a Node script with two rule sets. Generic rules (path shapes, account-folder shapes,
  e-mail addresses) are committed. A **private denylist** (names, IDs) stays outside the repo and comes in
  through a file path or a CI secret. Matches against private rules are never echoed. It runs as a pre-commit and
  pre-push hook and in CI, and it scans the whole history before the first push.
- Licensing: the recommendation is **MIT** for code and curation, plus a game-data and trademark notice. The user
  decides.

## 2. Repo layout

### 2.1 Where the site lives

GitHub Pages can publish from (a) the root of a branch, (b) `/docs` on a branch, or (c) an artifact uploaded by
a GitHub Actions workflow (any folder).

| Option | For | Against |
|---|---|---|
| Site at repo root, branch serving | No workflow; simplest Pages setting | Root mixes the page with `pipeline/`, `tests/` and `curation/`, and **everything** in the repo is published (docs, tests, tool scripts). Jekyll needs a `.nojekyll` file. Deploys on every push to the branch, with no gates. |
| Site in `/docs`, branch serving | No workflow | `docs/` is wanted for design documents; they would have to move to e.g. `design/`, which is unusual and confusing. Also no gates. |
| **Site in `site/`, Actions artifact** | Clean separation; only the page is published; tests and the privacy check gate every deploy; the stamped (cache-busted) copy is produced at deploy time and never committed; no Jekyll processing | Needs a workflow (about 40 lines) and Actions enabled on the repo |
| Site in `site/`, `gh-pages` branch pushed by a script | Works without Actions | A second branch to keep in sync; gates only run if the maintainer runs them locally |

**Choice: `site/` + Actions artifact.** There is no build step, so branch serving would technically work. The
workflow is still worth having because it is the only place where "tests pass and the privacy check is clean"
can be *enforced* before something goes live, and a public repo is exactly where a leak must not slip past a
skipped hook. The `gh-pages`-branch script stays documented as the fallback (section 5.4) in case Actions is
ever unwanted.

### 2.2 End-state tree

```
<repo>/
├── README.md                    what, status, use, import prices, privacy, data sources, develop, license
├── CHANGELOG.md                 Keep-a-Changelog style; "Data" subsection per release
├── LICENSE                      code + curation license (section 9)
├── NOTICE.md                    game-data / trademark / third-party notice (section 9)
├── .gitignore  .gitattributes
├── .githooks/
│   ├── pre-commit               privacy check on staged blobs (opt-in via core.hooksPath)
│   └── pre-push                 privacy check on the commits being pushed
├── .github/
│   ├── workflows/ci.yml         tests + privacy check on push / PR
│   ├── workflows/pages.yml      gates, then deploy site/ to Pages on tag v* or manual dispatch
│   ├── ISSUE_TEMPLATE/data-error.yml  price-import.yml  feature.yml  config.yml
│   └── pull_request_template.md
├── docs/                        design documents (vision-scope, data-model, pipeline, roles, pricing, ui,
│                                release-maintenance, roadmap, decisions); not published to Pages
├── site/                        the published page, served as-is (plus deploy-time stamps)
│   ├── index.html
│   ├── style.css
│   ├── favicon.svg              own artwork, no Blizzard assets
│   ├── lib/                     pure modules: no DOM, no storage; UMD-ish; loaded by <script> and require()
│   │   ├── rules.js             stat weights, ranking, enchant rules (successor of the prototype's enchant rules)
│   │   ├── auctionator.js       Lua string-literal parser + CBOR decoder (pricing role)
│   │   ├── pricing.js           price resolution: import > override > default > vendor
│   │   ├── state.js             state schema, migrations, export/import validation
│   │   └── version.js           APP_VERSION, SUPPORTED_SCHEMA
│   ├── app/                     DOM code: views, tooltips, onboarding (not loaded by unit tests)
│   │   └── *.js
│   └── data/                    GENERATED, committed, never hand-edited
│       ├── game.js              items, recipes, sources, enchants, rankings for one build
│       ├── texts.js             notes, consumables, bring-lists (from curation/)
│       └── prices-default.js    shipped default price list (from one AH scan)
├── pipeline/                    the generator (Python ≥ 3.10, standard library only)
│   ├── __main__.py              `python3 -m pipeline <command>`
│   ├── db2.py                   fetch + cache wago.tools CSVs by build
│   ├── items.py  recipes.py  stats.py  sources.py  rank.py
│   ├── emit.py                  deterministic writer for site/data/*.js
│   └── report.py                diff report against the committed data
├── curation/                    hand-maintained inputs, reviewed like code (JSON)
│   ├── README.md                schema of each file, review rules (section 11.2)
│   ├── overrides.json           per-item field overrides, each with reason + evidence
│   ├── exclude.json             items/recipes that exist in DB2 but not in the game (SoD leftovers etc.)
│   ├── sources.json             recipe sources the DB2 tables don't carry (vendors, factions, Favor)
│   ├── enchants.json  consumables.json  texts.json
│   └── schema/*.json            descriptions the curation tests validate against (hand-rolled validator)
├── tests/
│   ├── js/                      node --test files (*.test.js)
│   │   ├── helpers/load-site.js loads site/lib + site/data in a vm sandbox, in index.html order
│   │   ├── rules.test.js  auctionator.test.js  pricing.test.js  state.test.js
│   │   ├── smoke-data.test.js   invariants over the committed site/data
│   │   ├── site-static.test.js  file:// guards (no modules, no fetch, relative paths)
│   │   └── privacy-check.test.js
│   ├── pipeline/                unittest files (test_*.py)
│   └── fixtures/
│       ├── db2/                 tiny synthetic CSVs with real column headers
│       ├── auctionator/         synthetic saved-variables file (fake realm, fake items)
│       └── expected/            golden generator output for the fixtures
└── tools/
    ├── check.sh                 run every test + the privacy check (what CI runs)
    ├── privacy-check.mjs        section 10
    ├── stamp.mjs                cache-busting query strings (deploy time)
    ├── prices-default.mjs       Auctionator file -> site/data/prices-default.js (reuses site/lib/auctionator.js)
    └── publish-branch.sh        fallback deploy to a gh-pages branch
```

The split between `site/lib/` (pure) and `site/app/` (DOM) is the one structural change against the prototype.
It makes "what the tests load" a folder rule instead of a per-file judgement.

### 2.3 Skeleton subset (planning phase, no app code)

```
<repo>/
├── README.md            status "planning"; how the pieces fit; links into docs/
├── CHANGELOG.md         "## [Unreleased]" only
├── LICENSE              or LICENSE-PENDING.md if the user hasn't decided (section 9)
├── .gitignore  .gitattributes
├── .githooks/pre-commit  .githooks/pre-push      (see open question 1)
├── docs/                all design documents + roadmap
├── site/README.md       "the published page; nothing here yet; see docs/ui.md"
├── site/data/README.md  "generated by pipeline/, never hand-edit; see docs/game-data-pipeline.md"
├── pipeline/README.md   "the generator; see docs/game-data-pipeline.md"
├── curation/README.md   "hand-maintained inputs and their review rules"
├── tests/README.md      "how tests are laid out and run" (sections 7.1–7.4)
└── tools/privacy-check.mjs + tools/README.md      (see open question 1)
```

Empty directories get a `README.md` that says what goes there, not a `.gitkeep`. A one-paragraph README costs
nothing and answers the question a `.gitkeep` raises. `.github/` is left out until a remote exists (milestone
"publish"), so nothing in the skeleton pretends to run.

## 3. Size budget

The prototype's files: `app.js` 142 KB, `data.js` 305 KB, `data-extra.js` 190 KB, `style.css` 37 KB, enchant rules
20 KB, `index.html` 2 KB, about 695 KB in total. Its 160 items take 141 KB of JSON (≈ 880 bytes per item including
mats and plan rows). A rough count over the cached Forever DB2 tables (Blacksmithing, Leatherworking,
Tailoring and Engineering spells whose create-item effect yields an equippable item with required level ≤ 60)
gives **about 1,270 items**. That count includes leftovers the pipeline will exclude. At the prototype's density
that is ≈ 1.1 MB of item JSON. GitHub Pages serves gzip, and this kind of JSON compresses 6–8×, so a first
visit transfers roughly 200–300 KB of data.

Budgets, enforced by `smoke-data.test.js` so growth is a conscious decision:

- each `site/data/*.js` ≤ 2.5 MB uncompressed;
- all of `site/` ≤ 4 MB uncompressed.

Data is split by refresh cadence (game build / price scan / texts). A price refresh then doesn't invalidate the
cached item data.

## 4. Loading model: works on Pages and from `file://`

Verified on 2026-10-08 with headless Chrome against a local test page:

- `<script src="data/d.js?v=abc123">` from `file://` **loads** (the query string is ignored for local files).
- `<script type="module">` importing `./data/m.js` from `file://` **does not run**. Chrome treats `file://`
  as an opaque origin, and module scripts need CORS.

Rules for everything under `site/`, checked by `site-static.test.js`:

1. Classic scripts only: no `type="module"`, no `import`/`export` statements, no Web Workers.
2. No `fetch()`/`XMLHttpRequest` for own files. Data arrives as `.js` files that assign onto one global
   namespace: `(window.FGP_DATA = window.FGP_DATA || {}).game = {...};`
3. All own references are relative without a leading slash (`lib/rules.js`, not `/lib/rules.js`). A
   project page lives under `https://<owner>.github.io/<repo>/`, so root-relative paths would point at the
   wrong place.
4. The only third-party requests are Wowhead's icons and tooltip script, and only if the user enables them
   (the UI role decides the defaults). The README lists every outgoing request.
5. `localStorage` keys are namespaced (`<repo>.v1`, not a generic `state`). **All project pages of one GitHub
   account share the origin `<owner>.github.io` and with it one `localStorage`.** In Chrome all `file://` pages
   share one storage too. A generic key would collide with other tools.

Offline use: the Pages workflow also attaches `site.zip` to the GitHub release of each tag. Users unzip it and
open `index.html`. A service worker is not an option: it doesn't register on `file://`, and it would add a
second cache-invalidation problem on Pages.

## 5. GitHub Pages deployment

### 5.1 Trigger

Deploy on **tags `v*`** and on manual `workflow_dispatch`. Pushes to `main` alone don't deploy. Data
regenerations and half-finished views can then land on `main` without going live, and each live state matches a
CHANGELOG entry. The `github-pages` environment allows only the default branch by default, so a deployment rule
for tags `v*` has to be added in the repo settings once.

### 5.2 Workflow sketch

```yaml
# .github/workflows/pages.yml
name: pages
on:
  push: { tags: ["v*"] }
  workflow_dispatch:
permissions: { contents: write, pages: write, id-token: write }   # contents: release asset upload
concurrency: { group: pages, cancel-in-progress: false }
jobs:
  check:
    uses: ./.github/workflows/ci.yml          # ci.yml also declares `on: workflow_call`
    secrets: inherit
  build:
    needs: check
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 24 }
      - run: cp -r site _site && node tools/stamp.mjs _site
      - run: cd _site && zip -qr ../site.zip .
      - uses: actions/upload-pages-artifact@v3
        with: { path: _site }
      - if: startsWith(github.ref, 'refs/tags/')
        run: gh release create "$GITHUB_REF_NAME" site.zip --notes-from-tag
        env: { GH_TOKEN: "${{ github.token }}" }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages, url: "${{ steps.d.outputs.page_url }}" }
    steps:
      - id: d
        uses: actions/deploy-pages@v4
```

Pin the actions to their current major versions when the workflows are written. The versions above are the ones
known today.

### 5.3 Cache busting

GitHub Pages sends `Cache-Control: max-age=600` (10 minutes; check with `curl -I` after the first deploy). Without
busting, a returning visitor can run a new `index.html` against an old `app/*.js` or `data/game.js` for up to
10 minutes, or longer behind proxies.

- **`tools/stamp.mjs <dir>`** rewrites every local `src=`/`href=` in `<dir>/index.html` to
  `file.js?v=<first 10 hex chars of the file's SHA-256>`. Content hashes mean only changed files are
  re-downloaded. It runs **at deploy time on the copy** (`_site`), so the repo's `index.html` stays plain, no
  commit ever carries stamp churn, and stamps can't go stale. `file://` users don't need it.
- **Schema guard.** Every data file carries `meta.schema` (integer). `site/lib/version.js` declares
  `SUPPORTED_SCHEMA`. If they differ (an old cached app with new data, or the reverse), the app shows one banner,
  "The page was updated while open: reload (Ctrl+F5)", and renders nothing else. That covers the
  10-minute `index.html` window that stamps alone can't close.
- `index.html` itself isn't stamped. It is the entry point and is revalidated after 10 minutes.

### 5.4 Fallback without Actions

`tools/publish-branch.sh` runs `tools/check.sh` (tests + privacy), copies `site/` into a temporary worktree of
branch `gh-pages`, stamps it, adds `.nojekyll`, then commits and pushes. Pages is then set to "Deploy from a
branch: gh-pages /". It is documented and kept working, but not the default.

## 6. Versions

- **App:** semver in `site/lib/version.js` (`APP_VERSION`), git tag `vX.Y.Z`, CHANGELOG section. `0.x` until
  the page covers levels 1–60 for all nine classes with live data. That is `1.0.0`, plausibly shortly after
  2026-11-05.
  - minor: new view or feature, or a state schema migration;
  - patch: fixes, **data-only releases** (new build, price refresh, curation fixes).
- **Data:** every generated file's `meta` carries:
  ```json
  {"schema": 1, "build": "1.60.1.70205", "dataHash": "3f9c2a7e1b", "source": "wago.tools DB2 CSV",
   "priceScan": {"date": "2026-11-07", "region": "EU", "items": 2140}}
  ```
  `build` is the game build key the data model already plans for. `dataHash` is a SHA-256 prefix of the canonical
  JSON, computed by the generator (deterministic, so identical inputs give an identical hash). It replaces the
  prototype's `generated` timestamp, which made every regeneration a diff. `priceScan` only exists in
  `prices-default.js`.
- The footer shows `v0.6.1 · game data 1.60.1.70205 · default prices 2026-11-07 (EU)`. Data-error issues ask for
  this line.
- The state format has its own version in the storage key and export file (`<repo>.v1`). Migrations are the UI
  and data roles' concern. This document only requires that a migration is a minor release with a CHANGELOG
  note and a test with a fixture of the old format.

## 7. Tests

One command runs everything: `tools/check.sh`. It runs the privacy check, `node --test "tests/js/**/*.test.js"`
and `python3 -m unittest discover -s tests/pipeline -t .`. CI runs the same script. Requirements: Node ≥ 22 (glob
support in `--test`; v24 is the current LTS and what the prototype uses) and Python ≥ 3.10. No `npm install`, no
`pip install`.

### 7.1 Browser logic with `node --test`

The prototype's enchant rules use a UMD-ish wrapper so one file works as a classic browser script and as a
CommonJS module:

```js
(function (root) {
  "use strict";
  // ... pure functions, no DOM, no localStorage; callers pass a ctx object ...
  var api = { score: score, fits: fits /* ... */ };
  if (typeof module !== "undefined" && module.exports) module.exports = api;   // Node: require() returns api
  else root.EnchantRules = api;                                                  // browser: window.EnchantRules
})(this);
```

In a browser, a classic script's top-level `this` is `window`, `module` is undefined, and the API lands on a
global. Under `require()`, `module.exports` exists and the API is exported (`this` is `module.exports` there,
but that branch doesn't use it). Every file in `site/lib/` follows this pattern and a `site/lib/` file may not
touch `document`, `window.localStorage` or timers. `site-static.test.js` greps for those. Cross-module
dependencies are passed in (`ctx`, or a `deps` argument) instead of read from globals, so tests can inject
fixtures.

Data files assign `window.FGP_DATA`. Tests don't fake a global `window` per file as the prototype's test does.
Instead `tests/js/helpers/load-site.js`:

1. reads `site/index.html` and extracts the `<script src>` list in order;
2. keeps the entries under `data/` and `lib/`;
3. runs each in **one** `vm` context whose global has `window` pointing to itself, the way the prototype's
   cloth-shuffle test runs a model in `vm.runInNewContext`;
4. returns `{ data: ctx.FGP_DATA, lib: {Rules: ctx.Rules, ...} }`.

That way the tests load exactly what the page loads, in the page's order. A script added to `index.html` but
broken in isolation fails the tests. Unit tests may also `require()` a lib module directly.

Pinning volatile inputs: tests that depend on prices pin them, as the prototype pins one enchant cost, or use
the synthetic price fixture. A price refresh must never turn the suite red.

### 7.2 Smoke test over the committed data (`smoke-data.test.js`)

These invariants run against the real `site/data/` on every CI run:

- every data file loads in the sandbox, defines only `FGP_DATA.<its section>` and no other globals;
- all files share the same `meta.schema` (= `SUPPORTED_SCHEMA`) and `meta.build`;
- `meta.dataHash` matches a recomputation (proof the file wasn't hand-edited);
- the first line is the "Generated by pipeline; do not edit" header;
- item IDs are unique positive integers; required levels are within 0–60; every recipe's product and every mat
  resolves to an item record; every item's profession is one of the known primaries;
- numbers are finite (no `NaN`/`Infinity`/`null` in numeric fields);
- every class × role in the roster model has at least one ranked candidate per armor slot somewhere in 1–60
  (the exact rule is the theorycraft role's; the test just asserts it is non-empty);
- every mat either has a default price, is a vendor good, or is listed in `meta.unpriced` (an explicit list,
  not a silent gap);
- size budgets from section 3.

### 7.3 Generator tests with `unittest`

Standard library `unittest`, no pytest dependency (contributors who like pytest can run it: it collects
unittest tests unchanged).

- **Fixtures:** `tests/fixtures/db2/<Table>.csv`. These are tiny, hand-written files with the real column headers
  and only the rows a test needs (typically 3–20). They're synthetic but shaped like the real tables. Where a
  quirk matters, a fixture copies the relevant real values (e.g. one weapon with ItemSparse `Flags_4` 0x300 and
  the damage-table case) and names the item ID in a comment column. Fixtures don't include whole tables.
- **Golden test:** `python3 -m pipeline generate --cache tests/fixtures/db2 --offline --out <tmp>` must equal
  `tests/fixtures/expected/*.js` byte for byte. `UPDATE_GOLDEN=1` rewrites the expected files. The diff is then
  reviewed in the PR like any other.
- **Determinism test:** generate twice into two temp dirs, assert identical bytes. Also run once with
  `PYTHONHASHSEED=random`.
- Unit tests for the formulas the prototype checks (stat budget, armor, DPS, skill approximation), each against values
  checked on in-game tooltips and cited in the test name.

### 7.4 Curation and privacy tests

- `tests/pipeline/test_curation.py` validates every `curation/*.json` against `curation/schema/*.json` with a
  small hand-rolled validator (types, required `reason`, IDs sorted, no duplicates). It also checks that
  every override targets an item that exists in the committed `game.js` build.
- `tests/js/privacy-check.test.js` builds a throwaway git repo in a temp dir and writes violating strings that
  are **assembled at runtime** (`"Saved" + "Variables"`) so the test file itself stays clean. It asserts
  findings, exit codes, the placeholder exemption, and that private-rule output is redacted.

### 7.5 CI

`ci.yml` on `push`, `pull_request` and `workflow_call`: checkout with `fetch-depth: 0` (the privacy check scans
history), setup-node 24, setup-python 3.10 (the floor; the newest Python also runs locally, so a second matrix
leg adds little), then `tools/check.sh`. The private denylist comes from the repo secret
`PRIVACY_DENYLIST` (section 10.4). CI never fetches from wago.tools or Wowhead: data regeneration is a
maintainer-local step whose output is reviewed as a diff.

## 8. Data regeneration

### 8.1 Tools

| Step | Tool | Third-party deps |
|---|---|---|
| Game data (`game.js`, `texts.js`) | `python3 -m pipeline` | none: `csv`, `json`, `hashlib`, `urllib.request` |
| Default prices (`prices-default.js`) | `node tools/prices-default.mjs <file>` | none: reuses `site/lib/auctionator.js` |
| Tests, privacy, stamps | Node, Python stdlib | none |

The prototype needs `lupa` and `cbor2` only to read the Auctionator file. The pricing role puts the Lua and CBOR
decoding in browser JS. If the default price list is built by a Node script that `require()`s that same
decoder, there is **one decoder** (tested once, used by page and tooling), and the Python generator drops both
packages and needs no venv at all. That only holds if the generator never reads the Auctionator file itself. Mat
costs for ranking are then computed from `prices-default.js`, which is read as JSON after stripping the
`window...=` prefix. Equivalently, the price-dependent part of ranking moves to the browser. That is the data
and pricing roles' call (see assumptions).

Fetching: the prototype shells out to `curl` because wago.tools answers Python's default user agent with 403. The
generator instead uses `urllib.request` with an explicit, descriptive user agent
(`<repo>-pipeline/<version> (+https://github.com/<owner>/<repo>)`). That is polite and more likely to be
accepted, but **unverified**: no network check was made for this document. `--fetcher curl` stays as a fallback.

### 8.2 Cache

- Location: `--cache <dir>` > `$FGP_CACHE_DIR` > `$XDG_CACHE_HOME/<repo>` > `~/.cache/<repo>`. On Windows,
  `%LOCALAPPDATA%\<repo>\cache`. Never inside the repo (and `.gitignore` covers `.cache/` in case).
- Layout: `db2/<Table>-<build>.csv`, `wowhead/items-<build>.json` (if the icon or DPS lookup stays on Wowhead).
  Files are keyed by build, so two builds coexist and an old one can be regenerated for comparison.
- `--offline` fails with the list of missing tables instead of fetching. Tests always run offline.
- Size today: ≈ 35 MB for two builds. `ItemSparse` alone is 5.3 MB per build.

### 8.3 What is committed

| Committed | Not committed |
|---|---|
| `site/data/*.js` (generated): Pages and `file://` need them, and their diffs are the review surface for data changes | Raw DB2 CSVs: about 35 MB per two builds, and wholesale copies of client tables |
| `curation/*.json` | Wowhead tooltip cache |
| `tests/fixtures/**` (synthetic) | Any Auctionator saved-variables file, real or redacted |
| | Generator warning reports (`tmp/`) |

`.gitattributes` marks `site/data/*.js linguist-generated=true`. GitHub then collapses those diffs by default and
leaves them out of the language statistics, while `report.py` gives the readable summary.

### 8.4 Determinism

So that a regeneration diff shows only what changed:

- records sorted by numeric ID; arrays with no natural order sorted by a stated key; never iterate a `set`;
- object keys in a fixed schema order (the emitter holds the order, as the prototype's `fmt` does);
- **one record per line** for items, recipes and enchants (the prototype's formatter does this already), so a
  changed item is a one-line diff;
- floats rounded at emit time to a fixed precision per field (stats integers, DPS 1 decimal, weights
  2 decimals);
- no wall-clock time in output: `dataHash` instead of `generated`; a date only where it is an input (price
  scan date);
- LF line endings, UTF-8, trailing newline (`.gitattributes`: `* text=auto eol=lf`);
- `python3 -m pipeline report` prints, against the committed files: items added/removed/changed (by field),
  overrides now equal to the computed value ("stale, remove"), overrides whose target is gone, and the
  biggest ranking shifts per class × role.

### 8.5 Commands

```
python3 -m pipeline fetch    --build 1.60.1.70205           # fill the cache (only network step)
python3 -m pipeline generate --build 1.60.1.70205           # write site/data/game.js + texts.js
python3 -m pipeline report                                  # summary vs. the committed data
node tools/prices-default.mjs <path to Auctionator.lua> --realm "<realm key>" --region EU --date 2026-11-07
tools/check.sh
```

The build key is also kept in `pipeline/config.json` (`{"build": "..."}`), so `--build` is optional and a
build change is a one-line, reviewable commit.

`prices-default.mjs` writes only item ID → `{m: min buyout, q: quantity}` plus `meta.priceScan`
(`date`, `region`, `items`). It never writes the realm name, any character, account or file path. Its input path
is a CLI argument and is never written anywhere.

### 8.6 Release-day checklist (Forever live, 2026-11-05 00:00 CET)

T-7 days
- [ ] Rehearse: run `fetch` + `generate` + `report` against the newest beta build, time it, fix anything flaky.
- [ ] Tag the last beta-data release; CHANGELOG notes "beta data".
- [ ] Pre-write the CHANGELOG entry and a banner text ("Live data from day 1; default prices are beta prices
      until the first live scan").
- [ ] Find out which wago.tools product/branch will carry the live Forever builds (the beta's product is
      `wow_classic_beta`; the live one is unknown).

Release day
- [ ] Identify the live build number on wago.tools and set it in `pipeline/config.json`.
- [ ] `fetch`, `generate`, `report`. Review the report: added/removed items, changed stats, stale overrides,
      and `exclude.json` entries that now exist in the game.
- [ ] Spot-check ≥ 10 items against in-game tooltips: one per crafting profession, including a weapon with the
      `Flags_4` DPS quirk and one level-50+ item.
- [ ] `tools/check.sh` green. Bump the version (patch or minor), update the CHANGELOG, tag, push. The workflow
      deploys.
- [ ] On the live page: hard reload, the footer shows the new build, run an Auctionator import with a fresh
      file, export/import of a saved state still works.
- [ ] Keep `prices-default.js` from beta, clearly labelled, until a live scan exists.

Day 2–7
- [ ] First live AH scan once the market has settled (a few days; day-1 prices are extreme). Run
      `prices-default.mjs` and ship a patch release.
- [ ] Triage data-error issues daily. Fix by pipeline rule where possible, by override otherwise.
- [ ] Watch wago.tools for hotfix builds. Regenerate when `report` shows relevant changes.

**Correction, 2026-10-08 (T-7 rehearsal done early, on beta build 1.60.1.70245; details in game-data-pipeline §14).**

- **Commands.** `python3 -m pipeline`, `pipeline/config.json` and `prices-default.mjs` do not exist; there is no
  `report` step. Use:
  - `node pipeline/main.js fetch --build <b>`;
  - `node pipeline/main.js build --build <b> --date <YYYY-MM-DD> --diff-against data-beta-1.60.1.70205`, which
    writes the data and `reports/<b>.md`;
  - `tools/check.sh`.

  The build number is a CLI argument and is recorded in `meta.build`, not in a config file. There is no default
  price list yet (M2).
- **Product.** The 1.60 builds are listed under both `wow_classic_beta` and `wow_cn_beta` on wago.tools. The 5.5.0
  rows hide them at the top of `wow_classic_beta`. The live product is still unknown (S5).
- **Timing.** Fetch 12–13 s, build 2 s, `tools/check.sh` 4 s. The review is the long part.
- **Rehearsal outcome.** 70245 is byte-identical to the shipped 70205, so nothing was released or tagged. The
  report is committed as the record, and the diff section was proven on 70124 → 70245 instead.
- **Release-day change.** `meta.status` is set in `pipeline/main.js`, so going live is a code change in that file,
  not a config edit.

## 9. Licensing options (the user decides)

**Code** (`site/`, `pipeline/`, `tools/`, tests):

- **MIT**: anyone may reuse, modify and relicense, including in closed tools, as long as the notice is kept.
  Shortest text, the most common choice for fan tools.
- **Apache-2.0**: like MIT plus an explicit patent grant and duties to keep a NOTICE file and mark changes.
  Heavier, and the patent grant is irrelevant for a hobby web tool.
- **GPL-3.0**: whoever distributes a modified version must publish it under GPL too. The page ships its JS
  source anyway, so the practical effect is mainly that nobody can build a closed derivative. It also blocks
  reuse in MIT-licensed projects. AGPL adds nothing here because the code runs in the visitor's browser.

**Recommendation: MIT** for code, curation files and docs alike, so there is one license for everything the
project authors itself.

**Game data** (`site/data/game.js` values such as item names, stats and recipes, and the DB2 tables they come
from): derived from Blizzard's game client. The project can't license them and must not claim to. `NOTICE.md`
and the README say:

> World of Warcraft and Blizzard Entertainment are trademarks or registered trademarks of Blizzard
> Entertainment, Inc. in the U.S. and/or other countries. This is an unofficial fan project, not affiliated with
> or endorsed by Blizzard. Game data is derived from the game client via wago.tools and remains the property of
> Blizzard Entertainment. The MIT license covers this project's own code and texts, not game data.

No Blizzard artwork (icons, logos, screenshots of game art) is committed. The favicon is the project's own
artwork. Prefer a project name that doesn't lead with "WoW"/"Warcraft" (e.g. "Forever Gear Planner"). Use
"for World of Warcraft: Forever" only descriptively.

**Default price list:** market observations from one AH scan (facts, no creative content). It ships under the
same notice. The README states that it is a snapshot without warranty.

**Wowhead:** the prototype hotlinks icons from Wowhead's image CDN and, on opt-in, loads Wowhead's
tooltip script. At build time it reads Wowhead's item tooltip JSON for icon names and DPS corrections. Wowhead
offers the tooltip script for embedding on other sites. Whether direct `<img>` hotlinks to the CDN and automated
reads of the tooltip JSON are within their terms is **unverified here** (not fetched, by instruction). Open
question 4. The alternative for icon names is the community listfile (icon FileDataID → file name), which
removes the build-time Wowhead dependency.

**wago.tools:** credited in the README ("Data sources") and the page footer ("Game data: wago.tools DB2
exports, build X"). Be a good citizen: cache by build, descriptive user agent, never fetch from CI.

## 10. Privacy check

### 10.1 Threat model

The repo is public, and it is developed next to private files that hold the maintainer's character names, account
folder numbers, local paths and sync setup. Leaks happen by copy-paste (prototype code, notes, generated data
whose `meta.notes` name characters), by tooling (a generator writing absolute paths into output, a test fixture
cut from a real saved-variables file), and by screenshots. **Git history is the hard part.** A leak removed in a
later commit stays public once pushed. The check therefore has to run *before* commits are made and over the
*whole history* before the first push.

### 10.2 Two rule sets

A denylist of names committed to a public repo would publish the names. So:

**Generic rules**, committed inside `tools/privacy-check.mjs`. They describe the *shape* of private data and are
safe to publish. Patterns are case-insensitive regexes, written here as they appear in the script:

| Rule | Pattern (regex) | Catches |
|---|---|---|
| unix-home | `/(home\|Users)/[^/\s<]+/` | absolute home paths on Linux and macOS |
| wsl-mount | `/m[n]t/[a-z]/` | Windows drives seen from WSL |
| wsl-unc | `\\\\wsl(\.localhost\|\$)\\` | WSL UNC paths |
| win-drive | `\b[A-Za-z]:\\[^\s\\<]+` | any absolute Windows path |
| wow-account | `W[T]F[/\\]Account[/\\][^/\\<\s]+` | the client's per-account folder |
| sv-folder | `Saved[V]ariables` | the client's saved-variables folder name |
| account-id | `\b\d{6,}#\d\b` | Battle.net account folder names |
| battletag | `\b[A-Za-z][A-Za-z0-9]{2,11}#\d{4,5}\b` | BattleTags |
| email | `[\w.+-]+@[\w-]+\.[\w.-]+` | e-mail addresses, except `noreply@…`, `*@users.noreply.github.com`, `*@example.(com\|org)` |

The bracketed letters (`W[T]F`, `m[n]t`, `Saved[V]ariables`) keep the script and this document from matching
themselves.

**Placeholder exemption:** a path match whose variable segment is an angle-bracket placeholder is allowed. The
page's import help has to tell users where Auctionator's file lives. It does so with
`…\Account\<ACCOUNT>\…\Auctionator.lua`, and no real path contains `<`. The patterns above exclude `<` from the
variable segment, so the placeholder form never matches.

**Allowlist** for generic false positives: `tools/privacy-allow.txt`, lines `<path glob> <rule id>
<reason>`. It is reviewed in PRs like code and applies **only to generic rules**.

**Private rules**: one pattern per line, kept **outside the repo**:

```
# comments and blank lines ignored
somename            plain = case-insensitive substring (default; safest for names)
w:shortname         whole word only (for short names that occur inside ordinary words)
re:\b1234\d+#1\b    regex
```

The maintainer puts in: every character first and last name (including planned release names), the account folder
number, the Windows user name, realm names they play on, and any other identifier they
consider private. The list never needs to be shared. Private rules can't be allowlisted. A false positive is fixed by
switching that line to `w:` or `re:`.

### 10.3 Where the private list comes from

Resolution order:

1. `--deny-file <path>`
2. `$FGP_PRIVACY_DENYLIST_FILE` (a path)
3. `$FGP_PRIVACY_DENYLIST` (the list's *content*, for CI secrets)
4. `$XDG_CONFIG_HOME/<repo>/privacy-denylist.txt` (default `~/.config/<repo>/…`; `%APPDATA%\<repo>\…` on
   Windows)

If none is found, the run **fails with exit 2** ("no private denylist; pass --no-private to run generic rules
only"). A missing list must never look like a clean pass. `--no-private` is explicit and prints a warning. CI
uses it only when the secret is absent, which is the case for PRs from forks.

### 10.4 Modes and output

```
node tools/privacy-check.mjs                  # tracked files in the working tree (default)
node tools/privacy-check.mjs --staged         # staged blobs (pre-commit)
node tools/privacy-check.mjs --range A..B     # blobs added in A..B + their commit messages (pre-push, PRs)
node tools/privacy-check.mjs --history        # every blob reachable from any ref, all commit and tag
                                              # messages, ref names (before the first push; CI on main)
```

- What is scanned: file contents and **file paths**. Binary files are scanned as raw bytes for ASCII matches,
  which catches PNG text chunks and names in embedded metadata. Commit author and committer fields are not
  scanned; they are the maintainer's choice (open question 6).
- Output for generic rules: `site/app/import.js:41: rule wow-account: "…\Account\NNNNNNNN#1\…"`.
- Output for private rules: `docs/ui.md:88: private rule #7`. **Neither the pattern nor the matched text is
  printed**, because CI logs of a public repo are public. Locally, `--show-private` prints the match for
  convenience.
- Exit codes: 0 clean, 1 findings, 2 configuration error.
- In CI, the secret `PRIVACY_DENYLIST` (multi-line, same format) is passed as `FGP_PRIVACY_DENYLIST`. The script
  reads it from the environment and never writes it to disk or prints it.

Why Node and not a `git grep -f` one-liner: it runs the same on Windows without WSL, redacts private matches,
supports the placeholder exemption and history mode, and has tests. For a quick manual look,
`git grep -i -F -f <denylist>` remains the equivalent.

### 10.5 Hooks

Hooks are committed in `.githooks/` and enabled per clone with `git config core.hooksPath .githooks`. The README
"Develop" section says so, and `tools/check.sh` warns when they are not enabled.

- `pre-commit`: `node tools/privacy-check.mjs --staged`
- `pre-push`: `node tools/privacy-check.mjs --range <remote sha>..<local sha>` for each pushed ref, or
  `--history` when the remote ref doesn't exist yet (first push).

Hooks can be skipped with `--no-verify`, so CI (`--history` on `main`, `--range` on PRs) is the backstop. CI
only runs after the push, though, so the **first push** must be preceded by a local `--history` run. This is a
README checklist item for the maintainer and the pre-push hook enforces it.

### 10.6 Rules for creating the repo

- `git init` fresh. Never clone, copy or `subtree split` from the private workspace. Its history contains
  everything the check guards against.
- Code copied from the prototype is pasted into new files and scrubbed before its first commit. The household
  constants and the character-keyed state are rewritten, not just renamed.
- Screenshots in `docs/` or the README use a generic roster ("Alt 1", "a Mage alt"). Images can't be grepped
  for names drawn as pixels, so the PR template has a checkbox for them.

## 11. Contributor and maintainer workflow

### 11.1 Issues

Issue templates, as YAML forms:

- **Data error**: item name or ID; what the planner shows; what the game shows; evidence (an in-game tooltip
  screenshot); the footer version line; faction and class if relevant. Label `data`.
- **Price import problem**: browser, Auctionator version, the error message the page shows. The template
  says in bold: **do not attach your Auctionator file**. It contains your character and realm names. The
  page's import shows a copyable, redacted diagnostic (format detected, realm keys counted not named, entries
  decoded). Pricing role, see assumptions.
- **Feature request**, and `config.yml` that disables blank issues and links to the docs.

### 11.2 Curation review

- Every `curation/*.json` entry carries `reason` (one sentence) and, for overrides that contradict DB2,
  `evidence` (issue number, or "tooltip, build X"). The schema test enforces `reason`.
- Prefer a pipeline rule over overrides: when three or more items need the same correction, the fix belongs in
  `pipeline/` with a test. Overrides are for genuine one-offs.
- `pipeline report` flags **stale overrides** (equal to the computed value) and **orphans** (target no longer in
  the build). Both are removed in the next data release.
- A curation PR includes the regenerated `site/data/` in the same commit, so the diff shows the effect, and the
  `report` summary goes in the PR description.
- The PR template checklist: `tools/check.sh` green; curation entries have reason/evidence; CHANGELOG
  "Unreleased" updated; screenshots use generic characters.

### 11.3 README sections

1. What it is (one paragraph, one screenshot) and **status** (planning / beta data / live data).
2. Use it: Pages link; offline zip; opening `index.html` from a local clone.
3. Import your AH prices: where the Auctionator file is (placeholder path), what is read, that **nothing leaves
   the browser**.
4. Privacy: what stays local (`localStorage`, imports), which third-party requests happen and when.
5. Data sources and credits: wago.tools, Wowhead (if used), the community listfile (if used).
6. Develop: requirements (Node ≥ 22, Python ≥ 3.10, no packages); `tools/check.sh`; enabling hooks; private
   denylist setup.
7. Regenerate data: commands from 8.5; link to the release checklist.
8. Contributing: issue types, curation rules.
9. License and the Blizzard notice.

### 11.4 CHANGELOG

Keep-a-Changelog format with `Added / Changed / Fixed / Removed` plus a **`Data`** subsection (game build,
price scan date, curation fixes with issue numbers). "Unreleased" is kept current in each PR. The release
commit renames it to the version and date, and the tag message repeats it, so the GitHub release notes come
from the tag.

## 12. `.gitignore`

```gitignore
# local environments and caches
.venv/
__pycache__/
*.pyc
node_modules/
.cache/
tmp/

# deploy outputs (built by the workflow or publish-branch.sh)
_site/
dist/
*.zip

# raw inputs: never committed (DB2 CSVs, Wowhead cache, Auctionator files)
*.csv
!tests/fixtures/**/*.csv
*.lua
!tests/fixtures/**/*.lua
wowhead-*.json

# a private denylist must live outside the repo; this catches a misplaced copy
*denylist*.txt
.env

# OS / editor
.DS_Store
Thumbs.db
desktop.ini
.idea/
.vscode/
```

`.gitattributes`:

```gitattributes
* text=auto eol=lf
site/data/*.js linguist-generated=true
*.png binary
```

## Assumptions about other areas

- **Data model / pipeline (game-data engineer):** generated output goes to `site/data/` as `.js` files that
  assign onto `window.FGP_DATA` and are split by refresh cadence (game build, prices, texts). Every file has
  `meta.schema`, `meta.build` and `meta.dataHash`. The generator stays in Python with **standard library
  only**. The hand-maintained parts of the prototype's data-extra file move into `curation/*.json` and are
  emitted by the generator, so *nothing* in `site/data/` is hand-edited. Curation format is JSON (Python 3.10 has
  no `tomllib`). If the pipeline role picks Node for the generator instead, sections 7.3 and 8.1 change, but the
  layout doesn't.
- **Pricing/import:** the Auctionator decoder lives in `site/lib/auctionator.js` as a pure UMD-ish module, so
  `tools/prices-default.mjs` can reuse it. The generator never reads Auctionator files. The import UI offers a
  redacted diagnostic for bug reports. The default price list stores region and date, not the realm name.
- **UI/UX:** the pure-vs-DOM split (`site/lib/` vs. `site/app/`); a footer line with app version, build and
  price date; a schema-mismatch banner; third-party requests (icons, tooltips) disclosed and switchable;
  `localStorage` key namespaced by repo name; export files carry the state version.
- **Theorycraft:** ranking logic is a pure function in `site/lib/rules.js` (or precomputed by the generator); the
  smoke test only asserts "non-empty candidates per class × role × armor slot", whose exact rule they define.
- **Roadmap:** an infrastructure track runs alongside: skeleton with privacy check and hooks (M0); `tools/check.sh`,
  `load-site.js` and the smoke test arrive with the first page (M1); remote, CI, Pages and issue templates in a
  "publish" milestone; the release-day checklist on 2026-11-05.

## Open questions

1. **Ship the privacy check and hooks in the skeleton, even though the skeleton has "no app code"?**
   Recommendation: yes. It is tooling, not app code, and the skeleton's own commits are the first ones that
   can leak. Without a scripted check, the pre-publication grep has to be done by hand. About 150 lines of Node plus its
   test.
2. **Deploy on tags only, or on every push to `main`?** Recommendation: tags (`v*`) plus manual dispatch.
   `main` can carry unreleased data, and each live state has a CHANGELOG entry.
3. **License.** Recommendation: MIT for code, curation and docs, with the Blizzard notice for game data.
   Apache-2.0 if a patent grant matters to the user (unlikely). GPL-3.0 only if preventing closed forks
   matters more than easy reuse.
4. **Wowhead usage.** Are direct icon hotlinks to Wowhead's CDN and the build-time reads of their tooltip JSON
   acceptable under their terms? Recommendation: the maintainer reads Wowhead's terms and tooltip page once
   before the first public deploy. Meanwhile, have the pipeline take icon names from the community listfile and
   keep Wowhead to the opt-in tooltip script plus CDN icons (disclosed, switchable). If the terms say no, drop
   icon hotlinks and show slot glyphs.
5. **Does the shipped default price list name its realm?** Recommendation: region and date only, no realm name.
   It reveals where the maintainer plays and says little to users on other realms anyway. Add a "your realm
   differs: import your own scan" hint.
6. **Commit author identity in a public repo.** Recommendation: the maintainer decides whether to commit with
   the GitHub `noreply` address in this repo (`git config user.email` per repo). The privacy check deliberately
   doesn't police author fields.
7. **Python vs. Node for the generator.** Recommendation: keep Python (port of the prototype's generator,
   stdlib only). One language would be tidier, but rewriting a working, checked-against-tooltips pipeline before
   launch is risk for nothing. Revisit after 1.0.
8. **Live product name on wago.tools for Forever** (`wow_classic_beta` today). Recommendation: check the week
   before 2026-11-05 and record it in `pipeline/config.json` next to the build key.
9. **Does wago.tools accept `urllib` with a custom user agent?** Not verified (no network calls were made for this
   document). Recommendation: test once during M1; keep `--fetcher curl` either way.

## Decisions taken here

- Site in `site/`, deployed as a GitHub Actions Pages artifact; `docs/` holds only design documents and is not
  published.
- `site/lib/` (pure, UMD-ish, tested in Node) vs. `site/app/` (DOM) split; tests load scripts in `index.html`
  order through one `vm` sandbox.
- Classic scripts and global-assigning data files only, relative paths, no modules, no `fetch`. Backed by a
  headless-Chrome check that modules fail and query-stamped scripts load under `file://`.
- Cache busting by content-hash query strings applied at deploy time (not committed), plus a `meta.schema` guard
  with a reload banner.
- Zero third-party dependencies for tests and tooling; Node ≥ 22, Python ≥ 3.10; `unittest`, not pytest.
- `dataHash` replaces the generation timestamp; one record per line; deterministic emit; generated files marked
  `linguist-generated`.
- Raw CSVs, Wowhead caches and Auctionator files are never committed; the cache lives in the XDG cache dir.
- Size budgets: 2.5 MB per data file, 4 MB for `site/`, enforced by the smoke test.
- Privacy check in Node with committed generic shape rules, a private denylist from outside the repo (file, env
  or CI secret), redacted output for private matches, a hard failure when no denylist is found, history mode
  before the first push, and opt-in hooks via `core.hooksPath`.
- Empty skeleton directories get a README, not a `.gitkeep`.
- Semver for the app with data-only releases as patches; Keep-a-Changelog with a `Data` subsection; tags
  produce GitHub releases with an offline `site.zip`.
