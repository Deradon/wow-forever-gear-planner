# tests/

`node --test tests/` runs everything; no packages. `tests/js/` holds the suites (formulas, enumeration counts,
determinism, curation schema, ranking rules, ranking oracle, Auctionator decoder, pricing, state, data smoke test,
static-site guards), `tests/fixtures/` small synthetic inputs. Fixtures are synthetic: never a real player's
Auctionator file. See docs/release-maintenance.md §7.
