# tools/

Maintenance scripts (CommonJS `.js`; see docs/synthesis.md D11).

- `check.sh`: everything CI runs: the privacy check and `node --test tests/js/*.test.js`. Options go to the privacy
  check (`--history`, `--range A..B`, `--no-private`); warns when the hooks are not enabled.
- `privacy-check.js`: fails on personal data headed for the public repo (docs/release-maintenance.md §10). Generic
  path, account and e-mail rules are built in; the private denylist lives outside the repo. Modes: working tree
  (default), `--staged` (`.githooks/pre-commit`), `--message <file>` (`.githooks/commit-msg`), `--range A..B`
  and `--history` (`.githooks/pre-push`, CI). Private hits print as rule numbers only. Exit 0 clean, 1 findings,
  2 configuration error. Details in the script header.
- `stamp.js <dir>`: deploy-time cache busting: rewrites local `src=`/`href=` in `<dir>/index.html` to `?v=<hash>`
  (run by `.github/workflows/pages.yml` on the `_site` copy, never on `site/`).
- `make-db2-fixture.js`: cuts `tests/fixtures/db2/` (the rows a dozen fixture items need) from the DB2 cache.
- `prices-default.js <Auctionator.lua> --realm <key> --build <build> --date <YYYY-MM-DD>`: the default price list
  (docs/pricing-import.md §4) as `site/data/forever/prices-default.js` (gitignored). Refuses a build other than the
  game data's and a scan more than 14 days old (`--allow-old`); lists the realms when `--realm` is missing and the file
  has several. None ships before a live scan exists (U3). To ship one: drop the `.gitignore` line, add
  `<script src="data/forever/prices-default.js"></script>` after `reference.js` in `site/index.html`, run `check.sh`.
