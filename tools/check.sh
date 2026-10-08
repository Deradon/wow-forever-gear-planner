#!/bin/sh
# Everything CI will run (docs/release-maintenance.md §7): the privacy check and every node test.
#   tools/check.sh [--generic-only]   (passes the flag on to the privacy check)
set -eu
cd "$(git rev-parse --show-toplevel)"
tools/privacy-check.sh "$@"
node --test tests/js/*.test.js
