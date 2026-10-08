# tools/

Maintenance scripts (CommonJS `.js`; see docs/synthesis.md D11).

- `check.sh`: everything CI runs: the privacy check and `node --test tests/js/*.test.js`. Options go to the privacy
  check (`--history`, `--range A..B`, `--no-private`); warns when the hooks are not enabled.
- `privacy-check.js`: fails on personal data headed for the public repo (docs/release-maintenance.md §10). Generic
  path, account and e-mail rules are built in; the private denylist lives outside the repo. Modes: working tree
  (default), `--staged` (`.githooks/pre-commit`), `--message <file>` (`.githooks/commit-msg`), `--range A..B`
  and `--history` (`.githooks/pre-push`, CI). Private hits print as rule numbers only. Exit 0 clean, 1 findings,
  2 configuration error. Details in the script header.
- `make-db2-fixture.js`: cuts `tests/fixtures/db2/` (the rows a dozen fixture items need) from the DB2 cache.

Later: `prices-default.js`, deploy helpers.
