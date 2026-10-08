# tools/

Maintenance scripts (CommonJS `.js` from M1 on; see docs/synthesis.md D11).

- `privacy-check.sh` — fails on personal data in the repo. Generic path/e-mail rules are built in; the private
  denylist lives outside the repo (see the script header). `--staged` checks staged content (the pre-commit hook
  in `.githooks/`), `--generic-only` skips the denylist. Replaced by the Node check of
  docs/release-maintenance.md §10 before publishing (roadmap P1).

Planned for M1: `check.sh` (all tests plus the privacy check). Later: `prices-default.js`, deploy helpers.
