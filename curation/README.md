# curation/

Hand-maintained inputs, reviewed like code, as JSON: `roles.json`, `rules.json`, `items.json`, `sources.json`,
`npcs.json`, `mats.json`, `reference.json` (later `enchants.json`, `consumables.json`). Entries are keyed by
item ID or by a family of item IDs and carry `why`, `cite` and `checked`. The generator validates them and
emits them into `site/data/`. Never copy content from private notes by hand; see docs/synthesis.md D38.
