const { test, expect } = require('@playwright/test')

async function linkTo(page, href, id) {
  await page.evaluate(({ href, id }) => {
    const a = document.createElement('a')
    a.href = href
    a.id = id
    a.textContent = href
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, { href, id })
}

test('a block present on both pages re-initialises after navigation', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  expect(await page.evaluate(() => window.__protoInitCount)).toBe(1)

  await linkTo(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-a"]')).toHaveAttribute('data-initialised', 'yes')

  const log = await page.evaluate(() => window.__protoInitLog)
  expect(log.filter(n => n === 'taxi-fixture-a').length).toBeGreaterThanOrEqual(2)
})

test('a block that exists only on the target page loads and initialises', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  expect(await page.evaluate(() => window.__protoInitLog)).not.toContain('taxi-fixture-b')

  await linkTo(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')

  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toHaveAttribute('data-initialised', 'yes')
  expect(await page.evaluate(() => window.__protoInitLog)).toContain('taxi-fixture-b')
})

test('back and forward restore the correct content and title', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await linkTo(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')

  // With `allowInterruption` at its default `false` (see navigation.spec.js),
  // Taxi's popstate handler refuses to start a second navigation while
  // `core.isTransitioning` is true and reverts the URL bar via pushState —
  // goBack() would otherwise be silently undone. Wait for the fade's onEnter
  // to settle first, exactly as the existing navigation spec does.
  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false,
    null,
    { timeout: 5000 }
  )

  await page.goBack()
  await page.waitForFunction(() => location.pathname === '/taxi-test-a/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toHaveCount(0)
  expect(await page.title()).toContain('Taxi Test A')

  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false,
    null,
    { timeout: 5000 }
  )

  await page.goForward()
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()
  expect(await page.title()).toContain('Taxi Test B')
})
