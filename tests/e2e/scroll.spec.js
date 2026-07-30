const { test, expect } = require('@playwright/test')

async function navigate(page, href) {
  await page.evaluate((href) => {
    const a = document.createElement('a')
    a.href = href
    a.id = 'proto-nav'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, href)
  // The probe anchor has no text content, so it has a zero-size bounding
  // box and no clickable point: Playwright's pointer-based click (even with
  // force: true) cannot target it. Dispatch the click in-page instead,
  // which needs no bounding box. See tests/e2e/sync.spec.js for the same
  // documented workaround.
  await page.evaluate(() => document.getElementById('proto-nav').click())
  await page.waitForFunction((h) => location.pathname === h, href)
  // The URL updates in beforeFetch, before the enter transition (and thus
  // NAVIGATE_END) runs. Wait for Taxi to finish transitioning so
  // NAVIGATE_END-driven effects (scroll reset, ScrollTrigger refresh) have
  // landed — same pattern as tests/e2e/sync.spec.js.
  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false
  )
}

test('scroll resets to the top on navigation', async ({ page }) => {
  await page.goto('/taxi-test-b/')
  // proto-intro.js locks Lenis (lenis.stop()) for ~1.1s on the first
  // navigation of a fresh session, during which scrollTo() is a silent
  // no-op. Wait for the overlay to be removed before touching scroll.
  await page.waitForFunction(() => !document.querySelector('.proto-intro'))
  // The fixture pages render at exactly viewport height (no natural
  // overflow), so scrollTo(400) would have nowhere to go. Force extra
  // height in-page so there is real scroll distance to reset from.
  await page.addStyleTag({ content: 'body { min-height: 3000px; }' })
  await page.evaluate(() => window.protoLenis?.resize())
  await page.evaluate(() => window.protoLenis?.scrollTo(400, { immediate: true }))
  await page.waitForTimeout(200)
  // Sanity-check the precondition: if this ever reads back near 0, the
  // assertion below would pass vacuously instead of proving a reset.
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)
  await navigate(page, '/taxi-test-a/')
  await page.waitForTimeout(400)
  const y = await page.evaluate(() => window.scrollY)
  expect(y).toBeLessThan(20)
})

test('libraries are never re-executed', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__lenisRef = window.protoLenis })

  for (let i = 0; i < 5; i++) {
    await navigate(page, i % 2 === 0 ? '/taxi-test-b/' : '/taxi-test-a/')
  }

  const state = await page.evaluate(() => ({
    sameLenis: window.__lenisRef === window.protoLenis,
    lenisTags: document.querySelectorAll('script[src*="lenis"]').length,
    gsapTags: document.querySelectorAll('script[src*="gsap"]').length,
    taxiTags: document.querySelectorAll('script[src*="taxi.umd"]').length,
  }))

  expect(state).toEqual({ sameLenis: true, lenisTags: 1, gsapTags: 1, taxiTags: 1 })
})

// The fixture blocks (taxi-fixture-a / taxi-fixture-b) never create a
// ScrollTrigger of their own, so without this helper the test below would
// compare window.ScrollTrigger.getAll().length as 0 vs 0 on every run --
// a pass that holds regardless of whether the kill logic in NAVIGATE_OUT
// does anything at all. Attach one real trigger to the current view after
// every load/navigate so the targeted kill has something genuine to prove
// itself against: if a stale trigger survives, the count grows.
async function addTriggerToCurrentView(page) {
  await page.evaluate(() => {
    var main = document.querySelector('[data-taxi-view] main')
    window.ScrollTrigger.create({ trigger: main, start: 'top bottom', end: 'bottom top' })
  })
}

test('ScrollTriggers do not accumulate across repeat navigations', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  const has = await page.evaluate(() => typeof window.ScrollTrigger !== 'undefined')
  test.skip(!has, 'ScrollTrigger not loaded on this page')

  await addTriggerToCurrentView(page)

  await navigate(page, '/taxi-test-b/')
  await addTriggerToCurrentView(page)
  await navigate(page, '/taxi-test-a/')
  await addTriggerToCurrentView(page)
  const first = await page.evaluate(() => window.ScrollTrigger.getAll().length)

  await navigate(page, '/taxi-test-b/')
  await addTriggerToCurrentView(page)
  await navigate(page, '/taxi-test-a/')
  await addTriggerToCurrentView(page)
  const second = await page.evaluate(() => window.ScrollTrigger.getAll().length)

  // Guards against the vacuous 0-vs-0 case: this proves a trigger really
  // is alive and being counted before comparing the two rounds.
  expect(first).toBeGreaterThan(0)
  expect(second).toBe(first)
})
