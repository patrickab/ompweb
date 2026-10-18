#!/usr/bin/env bash
# Serve omp-web from this checkout. Extra args go to the launcher, e.g. ./run.sh -p 30179 --no-open
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

# Reinstall when the lockfile changed, e.g. after a rebase onto upstream
[[ package-lock.json -nt node_modules/.package-lock.json ]] && npm ci

# Webpack's persistent cache misses module-replacement changes, it then resolves overrides stale
if [[ -f .next/BUILD_ID && -n "$(find next.config.ts custom/next.config.ts custom/overrides -newer .next/BUILD_ID -print -quit)" ]]; then
  rm -rf .next/cache
fi

# Rebuild when a source file is newer than the last build, or the framing origins changed:
# `next build` bakes response headers into .next, `next start` never re-reads them
framing_stamp=.next/cf-frame-ancestors
if [[ ! -f .next/BUILD_ID ]] \
  || [[ -n "$(find . \( -path ./.next -o -path ./node_modules -o -path ./.git \) -prune -o -type f -newer .next/BUILD_ID -print -quit)" ]] \
  || [[ "$(cat "$framing_stamp" 2>/dev/null)" != "${OMP_WEB_FRAME_ANCESTORS:-}" ]]; then
  npm run build
  printf '%s' "${OMP_WEB_FRAME_ANCESTORS:-}" >"$framing_stamp"
fi

exec node bin/omp-web.js "$@"
