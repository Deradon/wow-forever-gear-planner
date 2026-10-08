# pipeline/

The data generator: Node (CommonJS, no dependencies). Fetches DB2 tables from wago.tools for one build into a cache
outside the repo, enumerates craftable equipment up to level 60, computes stats, armor and weapon damage, merges
`curation/`, and writes `site/data/forever/*.js` plus a build report in `reports/`. Deterministic: the same
inputs give byte-identical output. See docs/game-data-pipeline.md and the M1 file list in docs/roadmap.md.
