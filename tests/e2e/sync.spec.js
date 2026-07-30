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
  // which needs no bounding box. See tests/e2e/navigation.spec.js for the
  // alternative (giving the anchor textContent) used by the other specs.
  await page.evaluate(() => document.getElementById('proto-nav').click())
  await page.waitForFunction((h) => location.pathname === h, href)
  // The URL updates in beforeFetch, before the enter transition (and thus
  // NAVIGATE_END) runs. Wait for Taxi to finish transitioning so
  // NAVIGATE_END-driven effects (focus, proto:page-ready) have landed —
  // same pattern as tests/e2e/navigation.spec.js.
  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false
  )
}

test('body class is synced from the incoming document', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  const before = await page.evaluate(() => document.body.className)
  await navigate(page, '/taxi-test-b/')
  const after = await page.evaluate(() => document.body.className)
  expect(after).not.toBe(before)
  expect(after).toMatch(/page-id-\d+/)
})

test('proto:page-ready fires on load and on every navigation', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ready = []
    document.addEventListener('proto:page-ready', (e) => {
      window.__ready.push(e.detail.url)
    })
  })
  await page.goto('/taxi-test-a/')
  expect((await page.evaluate(() => window.__ready)).length).toBe(1)

  await navigate(page, '/taxi-test-b/')
  const urls = await page.evaluate(() => window.__ready)
  expect(urls.length).toBe(2)
  expect(urls[1]).toContain('/taxi-test-b/')
})

test('proto:page-leave fires with the outgoing container', async ({ page }) => {
  await page.addInitScript(() => {
    window.__left = 0
    document.addEventListener('proto:page-leave', (e) => {
      if (e.detail.container) window.__left++
    })
  })
  await page.goto('/taxi-test-a/')
  await navigate(page, '/taxi-test-b/')
  expect(await page.evaluate(() => window.__left)).toBe(1)
})

test('canonical link is synced', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await navigate(page, '/taxi-test-b/')
  const canonical = await page.evaluate(() =>
    document.querySelector('link[rel="canonical"]')?.href || '')
  test.skip(canonical === '', 'no canonical tag rendered (SEO plugin inactive)')
  expect(canonical).toContain('/taxi-test-b/')
})

test('focus moves to the new view after navigation', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await navigate(page, '/taxi-test-b/')
  const focused = await page.evaluate(() =>
    document.activeElement?.hasAttribute('data-taxi-view'))
  expect(focused).toBe(true)
})
