#!/usr/bin/env bash
# Serve omp-web from this checkout. Extra args go to the launcher, e.g. ./run.sh -p 30179 --no-open
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Reinstall when the lockfile changed, e.g. after a rebase onto upstream
[[ package-lock.json -nt node_modules/.package-lock.json ]] && npm ci

# Rebuild only when a source file is newer than the last build
if [[ ! -f .next/BUILD_ID ]] || [[ -n "$(find . \( -path ./.next -o -path ./node_modules -o -path ./.git \) -prune -o -type f -newer .next/BUILD_ID -print -quit)" ]]; then
  npm run build
fi

exec node bin/omp-web.js "$@"
