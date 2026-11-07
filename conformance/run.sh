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
# Env:    INERTIA_REF  upstream tag/commit/branch to test against (default: pinned release)
set -euo pipefail

PKG="${1:-vue3}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CONF="$ROOT/conformance"
INERTIA="$CONF/inertia"

# Pinned to an upstream RELEASE so the conformance claim names the client
# version users actually install. Tags are mutable, commits are not, so the
# tag's commit is recorded too and asserted after fetch. Bump both together.
# Override with INERTIA_REF=master (or any ref) to test against something else;
# the sha assert is skipped for overrides.
INERTIA_TAG="v3.11.0"
INERTIA_TAG_SHA="f3125577a9e5a5a8bcdecffefc2e6577282f7868"
INERTIA_REF="${INERTIA_REF:-$INERTIA_TAG}"
EXPECT_SHA=""
[ "$INERTIA_REF" = "$INERTIA_TAG" ] && EXPECT_SHA="$INERTIA_TAG_SHA"

# 1. Build the adapter — the ported helpers import its core dist, so a stale
#    build would silently test old code.
echo "==> Building @blacklizard/inertia-express"
( cd "$ROOT" && pnpm --filter "@blacklizard/inertia-express" build )

# 2. Put the upstream checkout at the wanted ref (shallow, exact commit).
#    Re-fetches whenever the checkout is not already at the pinned commit, so a
#    pin bump takes effect without `rm -rf`; a non-pinned override always
#    re-fetches because branches move.
if [ ! -d "$INERTIA/.git" ]; then
  rm -rf "$INERTIA"
  mkdir -p "$INERTIA"
  git -C "$INERTIA" init -q
  git -C "$INERTIA" remote add origin https://github.com/inertiajs/inertia.git
fi
if [ -z "$EXPECT_SHA" ] || [ "$(git -C "$INERTIA" rev-parse HEAD 2>/dev/null || true)" != "$EXPECT_SHA" ]; then
  echo "==> Fetching inertiajs/inertia @ $INERTIA_REF"
  git -C "$INERTIA" fetch --depth 1 -q origin "$INERTIA_REF"
  git -C "$INERTIA" checkout -q --force FETCH_HEAD
fi
if [ -n "$EXPECT_SHA" ] && [ "$(git -C "$INERTIA" rev-parse HEAD)" != "$EXPECT_SHA" ]; then
  echo "!! $INERTIA_REF resolved to $(git -C "$INERTIA" rev-parse HEAD), expected $EXPECT_SHA — tag moved?" >&2
  exit 1
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
# Excluded: reference server applies partial-except one-directionally; we follow Laravel (HOW-IT-WORKS §9).
( cd "$INERTIA" && PACKAGE="$PKG" NODE_OPTIONS="--require $CONF/preload.cjs" node playwright.js --reporter=line --retries=2 --grep-invert "preserves rescued child props when that child path is excluded from reload" )
