/**
 * Node preload (`NODE_OPTIONS=--require`) for the conformance run.
 *
 * Redirects the upstream test server's `require('./helpers')` to
 * conformance/helpers.cjs — the transport port backed by
 * @blacklizard/inertia-express's core — without modifying a single file in
 * the inertiajs/inertia checkout. Every other module resolves normally.
 */
const Module = require('module')
const path = require('path')

const UPSTREAM_HELPERS = path.resolve(__dirname, 'inertia/tests/app/helpers.js')
const PORTED_HELPERS = path.resolve(__dirname, 'helpers.cjs')

const originalResolveFilename = Module._resolveFilename

/**
 * Swap the resolved path when (and only when) it lands on upstream helpers.js.
 * @param {string} request module specifier as written in the requiring file
 * @param {...unknown} rest parent module, isMain, options — passed through untouched
 * @returns {string} resolved filename
 */
Module._resolveFilename = function resolveFilenameWithHelpersSwap(request, ...rest) {
  const resolved = originalResolveFilename.call(this, request, ...rest)
  return resolved === UPSTREAM_HELPERS ? PORTED_HELPERS : resolved
}
