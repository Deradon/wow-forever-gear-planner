# tools/

Maintenance scripts (CommonJS `.js`; see docs/synthesis.md D11).

- `check.sh`: everything CI will run: the privacy check and `node --test tests/js/*.test.js`.
- `privacy-check.sh`: fails on personal data in the repo. Generic path/e-mail rules are built in; the private
  denylist lives outside the repo (see the script header). `--staged` checks staged content (the pre-commit hook
  in `.githooks/`), `--generic-only` skips the denylist. Replaced by the Node check of
  docs/release-maintenance.md §10 before publishing (roadmap P1).
- `make-db2-fixture.js`: cuts `tests/fixtures/db2/` (the rows a dozen fixture items need) from the DB2 cache.

Later: `prices-default.js`, deploy helpers.
