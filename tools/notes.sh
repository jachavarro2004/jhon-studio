#!/usr/bin/env bash
# tools/notes.sh <version> — prints CHANGELOG.md's section for <version> (`## [X.Y.Z]` or
# `## X.Y.Z`, up to the next `## ` heading), the release's notes; exits 1 when there is none.
# POSIX awk only (Ubuntu's default is mawk).
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "usage: tools/notes.sh <version>" >&2
  exit 2
fi

root=$(cd "$(dirname "$0")/.." && pwd)
notes=$(awk -v v="$1" '
  /^## / { if (on) exit; h=$0; sub(/^## \[?/, "", h); sub(/\].*$/, "", h); sub(/ .*$/, "", h); on = (h == v); next }
  on { print }
' "$root/CHANGELOG.md")

if [ -z "${notes//[[:space:]]/}" ]; then
  echo "notes.sh: CHANGELOG.md has no section ## [$1]" >&2
  exit 1
fi
printf '%s\n' "$notes"
