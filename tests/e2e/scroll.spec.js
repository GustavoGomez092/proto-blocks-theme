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

test('scroll resets to the top even when Lenis is stopped', async ({ page }) => {
  await page.goto('/taxi-test-b/')
  // See the identical wait in the test above: proto-intro.js locks Lenis
  // for ~1.1s on a fresh session, which would otherwise mask the effect
  // this test is isolating (our own explicit stop() call, below).
  await page.waitForFunction(() => !document.querySelector('.proto-intro'))
  await page.addStyleTag({ content: 'body { min-height: 3000px; }' })
  await page.evaluate(() => window.protoLenis?.resize())
  await page.evaluate(() => window.protoLenis?.scrollTo(400, { immediate: true }))
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

  // Lenis's own scrollTo() is a silent no-op while the instance is stopped
  // or locked (`if (!this.isStopped && !this.isLocked || force)` in
  // lenis.min.js). proto-init.js documents protoLenis.stop()/.start() as
  // the block-level scroll-lock API (for overlays, mobile nav, etc.), so a
  // navigation that happens while something still holds that lock must not
  // leave the incoming page stuck mid-scroll.
  await page.evaluate(() => window.protoLenis?.stop())

  await navigate(page, '/taxi-test-a/')
  await page.waitForTimeout(400)
  const y = await page.evaluate(() => window.scrollY)
  expect(y).toBeLessThan(20)
})

test('scroll reset happens during the swap, not before the outgoing view fades', async ({ page }) => {
  await page.goto('/taxi-test-b/')
  await page.waitForFunction(() => !document.querySelector('.proto-intro'))
  await page.addStyleTag({ content: 'body { min-height: 3000px; }' })
  await page.evaluate(() => window.protoLenis?.resize())
  await page.evaluate(() => window.protoLenis?.scrollTo(400, { immediate: true }))
  await page.waitForTimeout(200)
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(100)

  await page.evaluate((href) => {
    const a = document.createElement('a')
    a.href = href
    a.id = 'proto-nav'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, '/taxi-test-a/')
  await page.evaluate(() => document.getElementById('proto-nav').click())

  // onLeave's fade-out tween runs ~0.4s (duration: 0.4, ease: power2.inOut)
  // before the old view is torn down and onEnter — where the scroll reset
  // now lives — gets to run. Sample partway through that window: under the
  // pre-fix placement (the reset in the NAVIGATE_OUT handler, which fires
  // essentially at click time, before onLeave even starts animating) the
  // page would already be pinned to scrollY 0 here, visibly snapping to
  // the top while the outgoing content is still fully opaque.
  await page.waitForTimeout(150)
  const midY = await page.evaluate(() => window.scrollY)
  expect(midY).toBeGreaterThan(100)

  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false
  )
  const finalY = await page.evaluate(() => window.scrollY)
  expect(finalY).toBeLessThan(20)
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
