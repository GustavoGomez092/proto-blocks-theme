const { test, expect } = require('@playwright/test')

async function navigate(page, href) {
  await page.evaluate((href) => {
    const a = document.createElement('a')
    a.href = href
    a.id = 'proto-nav'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, href)
  // Same zero-size-anchor workaround documented in scroll.spec.js and
  // sync.spec.js: dispatch the click in-page rather than through
  // Playwright's pointer-based click.
  await page.evaluate(() => document.getElementById('proto-nav').click())
  await page.waitForFunction((h) => location.pathname === h, href)
  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false
  )
}

// This reproduces a real, documented trigger for Fix 4 -- not a synthetic
// one. The alternative trigger named in the fix ("an SVG <a> inside
// .wp-block-navigation makes link.href an SVGAnimatedString, so
// `new URL(link.href, …)` throws") was tried first and does NOT reproduce
// on this build/site: `new URL()` only throws "Invalid URL" for a non-string
// argument when the *base* URL is itself opaque (e.g. about:blank); against
// a normal https:// base, `new URL(svgAnimatedString, base)` silently
// resolves to a nonsense-but-valid URL instead of throwing. That was
// verified directly against this site before writing this test, which is
// why this file exercises the other trigger named in the fix instead.
test('a throwing sync handler (killScrollTriggersIn) does not brick navigation for the rest of the session', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  const hasST = await page.evaluate(() => typeof window.ScrollTrigger !== 'undefined')
  test.skip(!hasST, 'ScrollTrigger not loaded on this page')

  // A ScrollTrigger whose `trigger` selector matches no element leaves
  // `vars.trigger` as the original selector *string* -- ScrollTrigger never
  // resolves it to an Element because there is nothing to resolve it to.
  // killScrollTriggersIn() in scripts/proto-taxi.js runs
  // `container.contains(trigger)` for every live ScrollTrigger on
  // NAVIGATE_OUT; Node.prototype.contains() throws
  // `TypeError: ... parameter 1 is not of type 'Node'` when handed a
  // string (verified directly against this build -- see the fix report).
  // Before Fix 4, @unseenco/e's bus ran NAVIGATE_OUT listeners in a plain
  // forEach with no try/catch, so this would propagate out of E.emit
  // inside Taxi's beforeFetch/afterFetch Promise chain and brick every
  // navigation for the rest of the session.
  await page.evaluate(() => {
    window.ScrollTrigger.create({
      trigger: '.this-selector-matches-nothing-xyz',
      start: 'top bottom',
      end: 'bottom top',
    })
  })

  const consoleErrors = []
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()) })

  // The bogus ScrollTrigger is never killed (its "trigger" is a string, not
  // an element that could ever live inside a torn-down view), so the loop
  // reaches it and throws on every single navigation. Two independent
  // navigations prove the guard holds repeatedly, not just once: if the
  // first one's rejected promise had bricked things, isTransitioning would
  // stay stuck true and the second navigate() call would time out waiting
  // for it to clear.
  await navigate(page, '/taxi-test-b/')
  await navigate(page, '/taxi-test-a/')

  expect(await page.evaluate(() => location.pathname)).toBe('/taxi-test-a/')
  // The failure must be visible somewhere, not swallowed silently.
  expect(consoleErrors.filter((e) => e.includes('[proto-taxi]')).length).toBe(2)
})
