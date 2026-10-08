#!/bin/sh
# Everything CI runs (docs/release-maintenance.md §7.5, §10): the privacy check, then every node test.
#   tools/check.sh [privacy-check options]   e.g. --history, --range A..B, --no-private (see tools/privacy-check.js)
set -eu
cd "$(git rev-parse --show-toplevel)"
if [ -z "${CI:-}" ] && [ "$(git config --get core.hooksPath || true)" != .githooks ]; then
  echo "check: the privacy hooks are not enabled in this clone; run: git config core.hooksPath .githooks" >&2
fi
node tools/privacy-check.js "$@"
node --test tests/js/*.test.js
