const { test, expect } = require('@playwright/test')

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

test('wp-admin links do a full page load', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__sentinel = 'alive' })
  await addLink(page, '/wp-admin/', 'to-admin')
  await Promise.all([page.waitForLoadState('load'), page.click('#to-admin')])
  expect(await page.evaluate(() => window.__sentinel)).toBeUndefined()
})

test('data-taxi-ignore links do a full page load', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__sentinel = 'alive' })
  await addLink(page, '/taxi-test-b/', 'to-b-ignored', { 'data-taxi-ignore': '' })
  await Promise.all([page.waitForLoadState('load'), page.click('#to-b-ignored')])
  expect(await page.evaluate(() => window.__sentinel)).toBeUndefined()
})

// This does NOT exercise the `:not([href^="#"])` clause in proto-taxi.js's
// LINKS selector: removing that clause was tried during review and this
// test still passed. Taxi's own vendored onClick (scripts/taxi.umd.js) has
// an independent, hardcoded no-op for same-page/hash-only href changes --
// it never calls preventDefault() or navigateTo() for them regardless of
// which elements the `links` selector attaches the delegated listener to.
// What this test does guard: a same-page hash click must never fall through
// to a full server-rendered page load -- e.g. a regression in proto-init.js's
// delegated Lenis anchor handler, or a behaviour change on a future Taxi
// upgrade.
test('same-page hash clicks never trigger a full page load', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__sentinel = 'alive' })
  await addLink(page, '#taxi-anchor', 'to-hash')
  await page.click('#to-hash')
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.__sentinel)).toBe('alive')
})

test('reduced motion completes navigation without animation', async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    ignoreHTTPSErrors: true,
    baseURL: process.env.PROTO_BASE_URL || 'https://cadco.local',
  })
  const page = await context.newPage()
  await page.goto('/taxi-test-a/')

  // A brand-new context always replays the once-per-session intro overlay
  // (scripts/proto-intro.js gates on sessionStorage, which starts empty).
  // It's a position:fixed, full-viewport, z-index:999999 layer driven by a
  // 75-frame @ 60fps Lottie (~1.25s) before it gets `.is-hidden` (opacity:0;
  // pointer-events:none). Starting the clock before it clears would measure
  // the intro animation, not the page transition, and eat most of the
  // budget below. Wait for it to clear first so the clock only measures the
  // navigation itself.
  await page.waitForFunction(() => {
    const intro = document.querySelector('.proto-intro')
    return !intro || intro.classList.contains('is-hidden')
  })

  await addLink(page, '/taxi-test-b/', 'to-b')

  const start = Date.now()
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()

  const elapsed = Date.now() - start
  console.log(`[reduced-motion] navigation took ${elapsed}ms (intro overlay excluded)`)
  // Under normal (non-reduced) motion, onLeave + onEnter tween for
  // ~0.4s + 0.5s = ~0.9s. reduced.matches makes both call done() straight
  // away, so this should land well under a second; 2s keeps headroom for a
  // slow CI runner without being loose enough to let the ~0.9s tween back in.
  expect(elapsed).toBeLessThan(2000)
  const opacity = await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-taxi-view] main')).opacity)
  expect(Number(opacity)).toBe(1)
  await context.close()
})

test('no console errors across a navigation cycle', async ({ page }) => {
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/taxi-test-a/')
  await addLink(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await page.waitForTimeout(600)

  expect(errors).toEqual([])
})
