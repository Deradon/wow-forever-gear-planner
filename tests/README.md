# tests/

`tools/check.sh` runs everything (`node --test tests/js/*.test.js` plus the privacy check); no packages.
`tests/js/` holds the suites (CSV, formulas and enumeration counts, determinism, curation schema, ranking rules,
ranking oracle, Auctionator decoder, pricing, state, data smoke test, the static-page constraints in
`site-static.test.js`, the page's acceptance steps in `site-app.test.js`, the privacy check on synthetic data and
throwaway git repos in `privacy-check.test.js`, the deploy stamp in `stamp.test.js`) and `helpers/` (`load-site.js` runs
`site/data` and `site/lib` in one vm context as the page does; `load-app.js` adds `site/app` without a DOM, with an
in-memory storage and a fixed clock; `auctionator-fixture.js` writes synthetic saved-variables files).
`tests/fixtures/db2/` is a small cut of real DB2 rows, and `tests/fixtures/listfile/` the matching icon rows of the
community listfile (both from `tools/make-db2-fixture.js`), so the formula and determinism tests run without the cache; tests that need the full cache skip with a message when it is
missing. `tests/fixtures/oracle.json` is produced privately (D30) and holds no names. Fixtures are synthetic or game
data: never a real player's Auctionator file. See docs/release-maintenance.md §7.
