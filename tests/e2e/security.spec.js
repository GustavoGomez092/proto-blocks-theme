const { test, expect } = require('@playwright/test')

// Security behaviour of the Taxi integration (scripts/proto-taxi.js):
//
//   - a fetched document is stripped of <noscript> before Taxi reads it, the
//     view is moved in as nodes (no outerHTML -> innerHTML round trip), and
//     stylesheets inside <noscript> are never promoted;
//   - action links (nonce in the URL, add-to-cart, ?action=, nofollow, ...)
//     are neither prefetched on hover/focus nor transitioned;
//   - an unknown data-transition falls back to the default instead of
//     leaving core.isTransitioning stuck, and a watchdog unsticks it anyway.

async function addLink(page, href, id, attrs = {}) {
  await page.evaluate(({ href, id, attrs }) => {
    const a = document.createElement('a')
    a.href = href
    a.id = id
    a.textContent = id
    Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v))
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, { href, id, attrs })
}

// In-page click, as in sync.spec.js / resilience.spec.js: no pointer needed.
async function clickAndSettle(page, id, pathname, timeout = 10000) {
  await page.evaluate((id) => document.getElementById(id).click(), id)
  await page.waitForFunction((p) => location.pathname === p, pathname, { timeout })
  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false,
    null,
    { timeout }
  )
}

// Markup a lazy-load plugin or a no-JS fallback could legitimately put in a
// page. All of it is inert on a full load: <noscript> is raw text when
// scripting is on. The first block carries a plain onerror plus a <style>,
// the second the escaped-attribute differential from the audit (what core's
// esc_attr() does to an alt text of `"></noscript><img ... onerror=...>`),
// the third the RCDATA-text variant.
const NOSCRIPT_PAYLOAD = [
  '<div id="noscript-probe">',
  '<noscript><img src="/x-plain" onerror="window.__noscriptRan = (window.__noscriptRan || 0) + 1">',
  '<style id="noscript-style">body{outline:9px solid red}</style></noscript>',
  '<noscript><img src="/x-alt" alt="&quot;&gt;&lt;/noscript&gt;&lt;img src=/x-break onerror=alert(1)&gt;"></noscript>',
  '<noscript><textarea>&lt;/noscript&gt;&lt;img src=/x-rcdata onerror=alert(2)&gt;</textarea></noscript>',
  '</div>'
].join('')

test('noscript content in a fetched page never executes or styles the live document', async ({ page }) => {
  const dialogs = []
  page.on('dialog', (d) => { dialogs.push(d.message()); d.dismiss().catch(() => {}) })
  const probeRequests = []
  page.on('request', (r) => { if (/\/x-(plain|alt|break|rcdata)\b/.test(r.url())) probeRequests.push(r.url()) })

  // Serve page B with the payload injected at the top of the view, for the
  // full load and for Taxi's fetch alike (the route sees both).
  await page.route((url) => url.pathname === '/taxi-test-b/', async (route) => {
    const response = await route.fetch()
    const body = (await response.text())
      .replace(/(<[^>]*\bdata-taxi-view\b[^>]*>)/, '$1' + NOSCRIPT_PAYLOAD)
    // Rebuilt rather than forwarded: the origin may have gzipped the
    // response, and route.fetch() hands back the decoded text.
    await route.fulfill({ status: response.status(), contentType: 'text/html; charset=utf-8', body })
  })

  await page.goto('/taxi-test-a/')
  await addLink(page, '/taxi-test-b/', 'to-b')

  // Hover first so the prefetch path is exercised, then click so the
  // navigation is served from that cache entry.
  await page.hover('#to-b')
  await page.waitForFunction(() => {
    const core = window.protoTaxi && window.protoTaxi.core
    return core && core.cache.has(new URL('/taxi-test-b/', location.href).href)
  })
  await clickAndSettle(page, 'to-b', '/taxi-test-b/')
  await page.waitForTimeout(400) // room for any onerror to fire

  const state = await page.evaluate(() => {
    const entry = window.protoTaxi.core.cache.get(location.href)
    return {
      ran: window.__noscriptRan,
      probeRendered: !!document.getElementById('noscript-probe'),
      noscriptInView: document.querySelectorAll('[data-taxi-view] noscript').length,
      promotedStyle: !!document.getElementById('noscript-style'),
      looseImgs: document.querySelectorAll('img[src*="/x-"]').length,
      cachedNoscript: entry ? entry.page.querySelectorAll('noscript').length : null,
      cachedStyleIds: entry ? entry.styles.map((s) => s.id).filter(Boolean) : null,
      outline: getComputedStyle(document.body).outlineWidth,
    }
  })

  expect(state.probeRendered).toBe(true)          // the view itself did arrive
  expect(state.ran).toBeUndefined()               // no onerror ran
  expect(dialogs).toEqual([])                     // no alert()
  expect(probeRequests).toEqual([])               // no <img> was ever created
  expect(state.looseImgs).toBe(0)
  expect(state.noscriptInView).toBe(0)            // stripped, not merely inert
  expect(state.promotedStyle).toBe(false)         // noscript <style> not promoted
  expect(state.outline).toBe('0px')
  expect(state.cachedNoscript).toBe(0)
  expect(state.cachedStyleIds).not.toContain('noscript-style')
})

test('action links are not prefetched on hover or focus and do a full page load on click', async ({ page }) => {
  const actionHits = []
  page.on('request', (r) => {
    if (/_wpnonce=|add-to-cart=|[?&]action=|\/nofollow-probe\//.test(r.url())) actionHits.push(r.url())
  })

  await page.goto('/taxi-test-a/')
  await addLink(page, '/taxi-test-b/?_wpnonce=deadbeef', 'nonce')
  await addLink(page, '/taxi-test-b/?add-to-cart=12', 'cart')
  await addLink(page, '/taxi-test-b/?action=logout', 'action')
  await addLink(page, '/nofollow-probe/', 'nofollow', { rel: 'nofollow' })
  await addLink(page, '/taxi-test-b/', 'plain')

  for (const id of ['nonce', 'cart', 'action', 'nofollow']) {
    await page.hover('#' + id)
    await page.focus('#' + id)
  }
  await page.waitForTimeout(500)
  expect(actionHits).toEqual([])

  // The shared predicate agrees with the delegation selector.
  const verdicts = await page.evaluate(() =>
    ['nonce', 'cart', 'action', 'nofollow', 'plain']
      .map((id) => window.protoTaxi.isExcludedLink(document.getElementById(id))))
  expect(verdicts).toEqual([true, true, true, true, false])

  // Control: a plain link IS prefetched, so the silence above is meaningful.
  const prefetched = page.waitForRequest(
    (r) => new URL(r.url()).pathname === '/taxi-test-b/' && r.headers()['x-requested-with'] === 'Taxi',
    { timeout: 5000 }
  )
  await page.hover('#plain')
  await prefetched

  // Clicking the nonce link is a full page load, not a transition.
  await page.evaluate(() => { window.__sentinel = 'alive' })
  await page.click('#nonce')
  await page.waitForURL(/\/taxi-test-b\/\?_wpnonce=deadbeef/)
  expect(await page.evaluate(() => window.__sentinel)).toBeUndefined()
})

test('an unknown data-transition falls back to the default and does not block the next navigation', async ({ page }) => {
  const warnings = []
  page.on('console', (m) => { if (m.type() === 'warning') warnings.push(m.text()) })

  await page.goto('/taxi-test-a/')

  // Before the fix Taxi did `new undefined` inside its Promise executor:
  // the click was preventDefault()ed, the URL never changed, and
  // isTransitioning stayed true for the rest of the session.
  await addLink(page, '/taxi-test-b/', 'bad', { 'data-transition': 'does-not-exist' })
  await clickAndSettle(page, 'bad', '/taxi-test-b/', 5000)
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()

  // A prototype key resolves to Object/Function on a plain object lookup.
  await addLink(page, '/taxi-test-a/', 'ctor', { 'data-transition': 'constructor' })
  await clickAndSettle(page, 'ctor', '/taxi-test-a/', 5000)

  // And a plain navigation still works afterwards.
  await addLink(page, '/taxi-test-b/', 'plain')
  await clickAndSettle(page, 'plain', '/taxi-test-b/', 5000)

  expect(warnings.filter((w) => w.includes('Unknown transition')).length).toBe(2)
})

test('the watchdog releases a transition that never finishes', async ({ page }) => {
  // Shorten the watchdog for the test; the default is 10s.
  await page.addInitScript(() => { window.protoTaxiSettings = { watchdogMs: 1500 } })
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto('/taxi-test-a/')
  await page.evaluate(() => {
    window.protoTaxi.addTransition('stuck', class extends window.protoTaxi.Transition {
      onLeave() { /* never calls done() */ }
    })
  })
  await addLink(page, '/taxi-test-b/', 'stuck', { 'data-transition': 'stuck' })
  await page.evaluate(() => document.getElementById('stuck').click())
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.protoTaxi.core.isTransitioning)).toBe(true)

  await page.waitForFunction(
    () => window.protoTaxi.core.isTransitioning === false,
    null,
    { timeout: 4000 }
  )
  expect(errors.some((e) => e.includes('[proto-taxi]') && e.includes('did not finish'))).toBe(true)

  await addLink(page, '/taxi-test-b/', 'after')
  await clickAndSettle(page, 'after', '/taxi-test-b/', 5000)
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()
  expect(await page.evaluate(() => document.querySelectorAll('[data-taxi-view]').length)).toBe(1)
})
