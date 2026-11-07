/**
 * Conformance transport port — replaces upstream `tests/app/helpers.js` at
 * require time (see preload.cjs); the upstream checkout is never modified.
 *
 * Page assembly is byte-for-byte identical to the upstream helpers.js; the only
 * change is that partial-reload filtering + prop evaluation runs through
 * @blacklizard/inertia-express's core `resolveProps` engine instead of the
 * suite's inline `processPartialProps`. This exercises the adapter's protocol
 * engine against the real Inertia client across the official Playwright specs.
 *
 * Diff against conformance/inertia/tests/app/helpers.js to see the change.
 */
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')

// Upstream checkout's test server dir — ssr.js and the built test-app html live there.
const APP_DIR = path.resolve(__dirname, 'inertia/tests/app')

const package = process.env.PACKAGE || 'vue3'

const ssr = require(path.join(APP_DIR, 'ssr'))

// @blacklizard/inertia-express core build (ESM). Imported lazily because this
// file is CommonJS; the promise is created once at module load.
const CORE_PATH = path.resolve(__dirname, '../packages/inertia-express/dist/core/index.js')
const corePromise = import(pathToFileURL(CORE_PATH).href)

// Audit trail: Playwright pipes the web server's stderr, so this line in the
// suite output is the proof that the swap happened in the server it spawned.
process.stderr.write(`[conformance] helpers swapped → ${__filename} (core: ${CORE_PATH})\n`)

const encodeBigInts = (value) => {
  if (typeof value === 'bigint') {
    return { $bigint: value.toString() }
  }

  if (Array.isArray(value)) {
    return value.map(encodeBigInts)
  }

  if (value !== null && typeof value === 'object' && value.constructor === Object) {
    return Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, encodeBigInts(nested)]))
  }

  return value
}

const buildPageData = (req, data) => {
  const page = encodeBigInts({
    component: req.path
      .slice(1)
      .split('/')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join('/')
      .split('-')
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(''),
    props: {},
    url: req.originalUrl,
    version: null,
    ...data,
  })

  // Stands in for the Laravel opt-in by flagging pages that carry markers. A
  // route can pass `preserveBigIntegers: false` to act like an app that builds
  // its own markers.
  if (page.preserveBigIntegers === undefined && JSON.stringify(page).includes('"$bigint"')) {
    page.preserveBigIntegers = true
  }

  return page
}

/**
 * Replacement for the upstream `processPartialProps`. Routes the page's props
 * through the adapter's `resolveProps`: function props stay BARE closures
 * (only arity-adapted — upstream routes author them as `(props) => …`), so
 * the engine must handle bare closures itself; partial-reload filtering
 * (including dotted-key matching) is applied by the engine.
 */
const processProps = async (req, data) => {
  const core = await corePromise

  const request = core.parseInertiaRequest({
    headers: req.headers,
    method: req.method,
    url: req.originalUrl,
  })

  const sourceProps = data.props || {}
  const wrapped = {}
  for (const [key, value] of Object.entries(sourceProps)) {
    wrapped[key] = typeof value === 'function' ? () => value(sourceProps) : value
  }

  const resolved = await core.resolveProps({
    props: wrapped,
    shared: {},
    component: data.component,
    request,
  })

  data.props = resolved.props
  return data
}

const applyDefaultNonce = (req, html) => {
  if (req.query.nonce !== 'default') {
    return html
  }

  return html.replace('<script>', '<script nonce="test-default-nonce">')
}

module.exports = {
  package,
  render: async (req, res, data) => {
    data = buildPageData(req, data)

    if (data.component.startsWith('InfiniteScroll') && req.query.absolutePageUrl) {
      // Support absolute URL format for testing URL preservation
      const protocol = req.protocol
      const host = req.get('host')
      data.url = `${protocol}://${host}${req.originalUrl}`
    }

    data = await processProps(req, data)

    if (data.alwaysProps) {
      // To simulate Inertia::always() in the Laravel adapter...
      data.props = { ...data.props, ...data.alwaysProps }
      delete data.alwaysProps
    }

    if (req.get('X-Inertia')) {
      res.header('Vary', 'Accept')
      res.header('X-Inertia', true)
      return res.status(200).json(data)
    }

    const html = fs
      .readFileSync(path.resolve(APP_DIR, '../../packages/', package, 'test-app/dist/index.html'))
      .toString()
      .replace('{{ headAttribute }}', 'data-inertia')
      .replace("'{{ placeholder }}'", JSON.stringify(data))

    return res.status(200).send(applyDefaultNonce(req, html))
  },
  renderWithPlainTitle: async (req, res, data) => {
    data = buildPageData(req, data)
    data = await processProps(req, data)

    if (req.get('X-Inertia')) {
      res.header('Vary', 'Accept')
      res.header('X-Inertia', true)
      return res.status(200).json(data)
    }

    const html = fs
      .readFileSync(path.resolve(APP_DIR, '../../packages/', package, 'test-app/dist/index.html'))
      .toString()
      .replace(' {{ headAttribute }}', '')
      .replace("'{{ placeholder }}'", JSON.stringify(data))

    return res.status(200).send(applyDefaultNonce(req, html))
  },
  renderUnified: async (req, res, data) => {
    data = buildPageData(req, data)
    data = await processProps(req, data)

    if (req.get('X-Inertia')) {
      res.header('Vary', 'Accept')
      res.header('X-Inertia', true)
      return res.status(200).json(data)
    }

    const jsonData = JSON.stringify(data).replace(/\//g, '\\/').replace(/</g, '\\u003c')

    const html = fs
      .readFileSync(path.resolve(APP_DIR, '../../packages/', package, 'test-app/dist/index-unified.html'))
      .toString()
      .replace('{{ headAttribute }}', data.component === 'Head/Dataset' ? 'data-inertia' : 'inertia')
      .replace('{{ placeholder }}', jsonData)

    return res.status(200).send(applyDefaultNonce(req, html))
  },
  renderSSR: async (req, res, data) => {
    data = buildPageData(req, data)

    if (req.get('X-Inertia')) {
      res.header('Vary', 'Accept')
      res.header('X-Inertia', true)
      return res.status(200).json(data)
    }

    const ssrResult = await ssr.render(data)
    const htmlTemplate = fs
      .readFileSync(path.resolve(APP_DIR, '../../packages/', package, 'test-app/dist/index.html'))
      .toString()

    const headContent = ssrResult.head ? ssrResult.head.join('\n    ') : ''

    const html = htmlTemplate
      .replace('{{ headAttribute }}', 'data-inertia')
      .replace(/<script>\s*window\.initialPage = '{{ placeholder }}'\s*<\/script>/, headContent)
      .replace('<div id="app"></div>', ssrResult.body)

    return res.status(200).send(html)
  },
  renderSSRAuto: async (req, res, data) => {
    data = buildPageData(req, data)

    if (req.get('X-Inertia')) {
      res.header('Vary', 'Accept')
      res.header('X-Inertia', true)
      return res.status(200).json(data)
    }

    const ssrResult = await ssr.renderAuto(data)
    const htmlTemplate = fs
      .readFileSync(path.resolve(APP_DIR, '../../packages/', package, 'test-app/dist/index.html'))
      .toString()

    const headContent = ssrResult.head ? ssrResult.head.join('\n    ') : ''

    const html = htmlTemplate
      .replace('{{ headAttribute }}', 'inertia')
      .replace(/<script>\s*window\.initialPage = '{{ placeholder }}'\s*<\/script>/, headContent)
      .replace('<div id="app"></div>', ssrResult.body)

    return res.status(200).send(html)
  },
  renderAuto: async (req, res, data) => {
    data = buildPageData(req, data)
    data = await processProps(req, data)

    if (req.get('X-Inertia')) {
      res.header('Vary', 'Accept')
      res.header('X-Inertia', true)
      return res.status(200).json(data)
    }

    const jsonData = JSON.stringify(data).replace(/\//g, '\\/').replace(/</g, '\\u003c')

    const html = fs
      .readFileSync(path.resolve(APP_DIR, '../../packages/', package, 'test-app/dist/index-auto.html'))
      .toString()
      .replace('{{ headAttribute }}', data.component === 'Head/Dataset' ? 'data-inertia' : 'inertia')
      .replace('{{ placeholder }}', jsonData)

    return res.status(200).send(applyDefaultNonce(req, html))
  },
  location: (res, href, version) => {
    res.status(409).header('X-Inertia-Location', href)

    if (version) {
      res.header('X-Inertia-Version', version)
    }

    return res.send('')
  },
  redirect: (res, href) => res.status(409).header('X-Inertia-Redirect', href).send(''),
}
