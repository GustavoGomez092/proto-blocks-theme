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

test('hash links still scroll without navigating', async ({ page }) => {
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
  await addLink(page, '/taxi-test-b/', 'to-b')

  const start = Date.now()
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()

  expect(Date.now() - start).toBeLessThan(2000)
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
