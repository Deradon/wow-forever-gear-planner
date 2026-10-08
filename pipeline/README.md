# pipeline/

The data generator: Node (CommonJS, no dependencies). Fetches DB2 tables from wago.tools for one build, and the
pinned wowdev community listfile (icon file names, 146 MB), into a cache outside the repo, enumerates craftable equipment up to level 60, computes stats, armor and weapon damage, merges
`curation/`, and writes `site/data/forever/*.js` plus a build report in `reports/`. Deterministic: the same
inputs give byte-identical output. See docs/game-data-pipeline.md and the M1 file list in docs/roadmap.md.

```sh
node pipeline/main.js fetch --build 1.60.1.70205                    # only network step; records hashes
node pipeline/main.js build --build 1.60.1.70205 --date 2026-10-08  # offline; data + reports/<build>.md
```

Options: `--cache <dir>` (else `$FGP_CACHE`, else `$XDG_CACHE_HOME/forever-gear-planner`, else
`~/.cache/forever-gear-planner`; layout `db2/<build>/<Table>.csv`, `listfile/<tag>/community-listfile.csv`),
`--accept-new-hashes` (update `build-inputs/db2-<build>.sha256` or `listfile-<tag>.sha256` deliberately after wago.tools re-exported a table), `--diff-against <git tag|dir>`
(adds a diff section to the report against the data at that tag or in a directory of generated `*.js`), `--out`, `--report`. The build exits non-zero when the report's blocking
section is not empty.

| File | Does |
|---|---|
| `main.js` | CLI, `generate()` (pure) and `build()` (writes) |
| `csv.js`, `db2.js` | RFC 4180 reader; cache, fetch, hash manifest |
| `icons.js` | community listfile: pinned tag, fetch, hash, streamed lookup of icon file names |
| `constants.js` | stat IDs, slots, types, binds, profession lines, damage factors, ID ranges |
| `enumerate.js` | craft rows, the funnel, pattern links and choice, origins |
| `items.js`, `recipes.js`, `sources.js` | item, recipe and source records |
| `curation.js` | schema and reference checks of `curation/*.json` |
| `emit.js`, `report.js` | data-file writer; build report (runs `site/lib/rank.js`) |
