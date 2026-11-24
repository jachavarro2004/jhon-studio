#!/usr/bin/env bash
# tools/pack.sh <out-dir> — builds jhon-studio's release tarball from this repository:
#
#   <out-dir>/jhon-studio-<version>.tar.gz          what runs the studio, unpacked into a folder
#                                                   per version (README, "Install")
#   <out-dir>/jhon-studio-<version>.tar.gz.sha256   its sha256, in `sha256sum -c` form
#
# and prints the tarball's path. The version is src/version.ts's (bin/jhon-studio --version).
# The tarball holds bin, src, engine, templates, vendor, voice, fonts, plugin, LICENSE,
# README.md and CHANGELOG.md, as git sees them (tracked, or new and not ignored), at the top of
# the archive (no leading folder); no test, examples, docs, odd, tools or .github. The same files
# pack to the same bytes: sorted names, owner 0:0, every time the last commit's (or
# $SOURCE_DATE_EPOCH), gzip without a name or time. The release workflow runs it; so can you.
set -euo pipefail

if [ $# -ne 1 ] || [ -z "$1" ]; then
  echo "usage: tools/pack.sh <out-dir>" >&2
  exit 2
fi

root=$(cd "$(dirname "$0")/.." && pwd)
mkdir -p "$1"
out=$(cd "$1" && pwd -P)
cd "$root"

version=$(node --experimental-strip-types --no-warnings bin/jhon-studio --version)
name="jhon-studio-$version.tar.gz"
epoch=${SOURCE_DATE_EPOCH:-$(git log -1 --format=%ct)}

git ls-files -z --cached --others --exclude-standard -- \
    bin src engine templates vendor voice fonts plugin LICENSE README.md CHANGELOG.md \
  | while IFS= read -r -d '' f; do [ -f "$f" ] && printf '%s\0' "$f"; done \
  | LC_ALL=C sort -zu \
  | tar --create --file=- --format=gnu --owner=0 --group=0 --numeric-owner \
      --mtime="@$epoch" --mode='u+rw,go-w,a+rX' --no-recursion --null --files-from=- \
  | gzip -9n > "$out/$name"

if command -v sha256sum >/dev/null; then sum=$(sha256sum "$out/$name"); else sum=$(shasum -a 256 "$out/$name"); fi
printf '%s  %s\n' "${sum%% *}" "$name" > "$out/$name.sha256"
echo "$out/$name"
