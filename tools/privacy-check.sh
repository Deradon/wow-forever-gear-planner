#!/bin/sh
# Privacy check: fail if any file in the repo contains personal data of a maintainer.
#
#   tools/privacy-check.sh               all tracked and untracked (not ignored) files
#   tools/privacy-check.sh --staged      the staged versions of staged files (used by .githooks/pre-commit)
#   tools/privacy-check.sh --generic-only   skip the private denylist (CI without the secret, contributors)
#
# Two rule sets (docs/release-maintenance.md §10, docs/synthesis.md D12):
# - Generic rules below describe the *shape* of private data (home and drive paths, client account folders,
#   e-mail addresses). They are written so they don't match this file.
# - A private denylist (character names, account names, realm choices, ...) lives OUTSIDE the repo, one fixed
#   string per line, case-insensitive, '#' starts a comment. Location: $FGP_PRIVATE_DENYLIST, else
#   ${XDG_CONFIG_HOME:-~/.config}/forever-gear-planner/privacy-denylist.txt. Without it the check fails unless
#   --generic-only is given. Private hits are reported by rule number, never by their text.
set -eu

mode=all generic_only=0
for a in "$@"; do
  case "$a" in
    --staged) mode=staged ;;
    --generic-only) generic_only=1 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "unknown option: $a" >&2; exit 2 ;;
  esac
done

cd "$(git rev-parse --show-toplevel)"

# name<TAB>extended regex (case-insensitive)
GENERIC='linux-home	/hom[e]/[a-z0-9_]
mac-home	/User[s]/[A-Za-z0-9_]
windows-user-path	[a-z]:[\\/]+user[s][\\/]
wsl-drive-mount	/mn[t]/[a-z]/
client-account-folder	accoun[t][\\/][0-9]{4,}(#[0-9]+)?
saved-variables-account-path	accoun[t][\\/][^[:space:]<>\\/]+[\\/]savedvariable[s]
email-address	[a-z0-9._%+-]+@[a-z0-9-]+\.[a-z0-9.-]*[a-z]{2,}'

denylist=${FGP_PRIVATE_DENYLIST:-${XDG_CONFIG_HOME:-$HOME/.config}/forever-gear-planner/privacy-denylist.txt}
if [ "$generic_only" -eq 0 ] && [ ! -r "$denylist" ]; then
  echo "privacy-check: private denylist not found at $denylist" >&2
  echo "  create it (one string per line) or run with --generic-only" >&2
  exit 2
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

# Collect the content to scan as files under $tmp/scan, keeping repo-relative names.
if [ "$mode" = staged ]; then
  git diff --cached --name-only --diff-filter=ACMR | while IFS= read -r f; do
    mkdir -p "$tmp/scan/$(dirname "$f")"; git show ":$f" > "$tmp/scan/$f"
  done
else
  git ls-files -co --exclude-standard | while IFS= read -r f; do
    [ -f "$f" ] || continue
    mkdir -p "$tmp/scan/$(dirname "$f")"; cp "$f" "$tmp/scan/$f"
  done
fi
[ -d "$tmp/scan" ] || { echo "privacy-check: nothing to scan"; exit 0; }

fail=0
printf '%s\n' "$GENERIC" | while IFS='	' read -r name re; do
  if hits=$(cd "$tmp/scan" && grep -rnIiE -- "$re" . 2>/dev/null); then
    printf '%s\n' "$hits" | sed "s|^\./|privacy-check: [$name] |"
    touch "$tmp/fail"
  fi
done

if [ "$generic_only" -eq 0 ]; then
  n=0
  while IFS= read -r line || [ -n "$line" ]; do
    n=$((n + 1))
    case "$line" in ''|'#'*) continue ;; esac
    if files=$(cd "$tmp/scan" && grep -rlIiF -- "$line" . 2>/dev/null); then
      printf '%s\n' "$files" | sed "s|^\./|privacy-check: [private rule #$n] |"
      touch "$tmp/fail"
    fi
  done < "$denylist"
fi

if [ -e "$tmp/fail" ]; then
  echo "privacy-check: FAILED" >&2
  exit 1
fi
echo "privacy-check: clean ($mode$([ "$generic_only" -eq 1 ] && echo ', generic rules only'))"
