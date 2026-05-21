#!/usr/bin/env bash
#
# Official Inertia.js v3 conformance run.
#
# Clones inertiajs/inertia at a pinned commit, swaps its test server's protocol
# helpers for a transport port backed by @blacklizard/inertia-express's core,
# then runs the upstream Playwright suite against it. See conformance/HOW-IT-WORKS.md.
#
# Usage:  conformance/run.sh [vue3|react|svelte]
# Env:    INERTIA_REF  upstream commit/branch to test against (default: pinned)
set -euo pipefail

PKG="${1:-vue3}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/conformance"
INERTIA="$CONF/inertia"

# Pinned so every run tests the exact same upstream suite — reproducible CI.
# Override with INERTIA_REF=master to test against the latest upstream.
INERTIA_REF="${INERTIA_REF:-3a015228de09ba1838e08a22d24e5a6938cccc63}"

# 1. Build the adapter — the ported helpers import its core dist, so a stale
#    build would silently test old code.
echo "==> Building @blacklizard/inertia-express"
( cd "$ROOT" && pnpm --filter "@blacklizard/inertia-express" build )

# 2. Fetch the upstream suite at the pinned ref (shallow, exact commit).
if [ ! -d "$INERTIA/.git" ]; then
  echo "==> Fetching inertiajs/inertia @ $INERTIA_REF"
  rm -rf "$INERTIA"
  mkdir -p "$INERTIA"
  git -C "$INERTIA" init -q
  git -C "$INERTIA" remote add origin https://github.com/inertiajs/inertia.git
  git -C "$INERTIA" fetch --depth 1 -q origin "$INERTIA_REF"
  git -C "$INERTIA" checkout -q FETCH_HEAD
fi

# 3. Install + build the upstream monorepo and the framework test-app.
echo "==> Installing + building upstream ($PKG)"
( cd "$INERTIA" && pnpm install && pnpm build:all )
( cd "$INERTIA" && pnpm -r --filter "./packages/$PKG/test-app" build )

# 4. Apply the transport-port patch. Reset the working tree first so reruns
#    are idempotent (the patch always applies from a clean upstream baseline).
git -C "$INERTIA" checkout -- tests/app/helpers.js
git -C "$INERTIA" apply "$CONF/helpers.patch"

# 5. Browser binary (+ OS deps on CI) and run.
if [ -n "${CI:-}" ]; then
  ( cd "$INERTIA" && npx playwright install --with-deps chromium )
else
  ( cd "$INERTIA" && npx playwright install chromium )
fi
echo "==> Running conformance suite ($PKG)"
( cd "$INERTIA" && PACKAGE="$PKG" node playwright.js --reporter=line --retries=2 )
