#!/usr/bin/env bash
#
# Official Inertia.js v3 conformance run.
#
# Clones inertiajs/inertia at a pinned commit and runs its Playwright suite
# unmodified. A Node preload (conformance/preload.cjs) redirects the test
# server's `require('./helpers')` to conformance/helpers.cjs — a transport port
# backed by @blacklizard/inertia-express's core — so not one byte of the
# upstream checkout is changed. See conformance/HOW-IT-WORKS.md.
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
INERTIA_REF="${INERTIA_REF:-ca14edecf73ece19aa9737f2681b046e09b39279}"

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

# 4. Guard the conformance claim: the upstream checkout must be pristine.
#    (pnpm install may touch the lockfile; nothing else is allowed to differ.)
if ! git -C "$INERTIA" diff --quiet -- . ':!pnpm-lock.yaml'; then
  echo "!! upstream checkout is modified — refusing to run a conformance claim against it" >&2
  git -C "$INERTIA" status --short >&2
  exit 1
fi

# 5. Browser binary (+ OS deps on CI) and run.
if [ -n "${CI:-}" ]; then
  ( cd "$INERTIA" && npx playwright install --with-deps chromium )
else
  ( cd "$INERTIA" && npx playwright install chromium )
fi
echo "==> Running conformance suite ($PKG)"
# NODE_OPTIONS flows playwright → pnpm serve → node server.js, where the
# preload swaps helpers. In the runner/worker processes it is a harmless no-op.
( cd "$INERTIA" && PACKAGE="$PKG" NODE_OPTIONS="--require $CONF/preload.cjs" node playwright.js --reporter=line --retries=2 )
