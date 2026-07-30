const { test, expect } = require('@playwright/test')

test('block view scripts are marked for reload, libraries are not', async ({ page }) => {
  await page.goto('/taxi-test-b/')
  const marks = await page.evaluate(() => {
    const get = (needle) => {
      const el = [...document.querySelectorAll('script[src]')]
        .find(s => s.getAttribute('src').includes(needle))
      return el ? el.dataset.taxiReload !== undefined : null
    }
    return {
      fixtureA: get('taxi-fixture-a/view.js'),
      fixtureB: get('taxi-fixture-b/view.js'),
      gsap: get('gsap.min.js'),
      lenis: get('lenis.min.js'),
      init: get('proto-init.js'),
      taxiLib: get('taxi.umd.js'),
    }
  })
  expect(marks).toEqual({
    fixtureA: true,
    fixtureB: true,
    gsap: false,
    lenis: false,
    init: false,
    taxiLib: false,
  })
})

test('server-rendered links to ignored URLs are marked', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  // The fixture page content includes a real cart link (tests/fixtures/setup.sh).
  const links = page.locator('[data-taxi-view] a[href*="/cart"]')
  expect(await links.count()).toBeGreaterThan(0)
  const marked = await page.evaluate(() =>
    [...document.querySelectorAll('[data-taxi-view] a[href*="/cart"]')]
      .every(a => a.hasAttribute('data-taxi-ignore')))
  expect(marked).toBe(true)
})

test('server-rendered cart link is marked ignore', async ({ page }) => {
  await page.goto('/cart/')
  const hasWooLinks = await page.locator('a[href*="/checkout"]').count()
  test.skip(hasWooLinks === 0, 'no server-rendered checkout link on this page')
  const marked = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/checkout"]')]
      .every(a => a.hasAttribute('data-taxi-ignore')))
  expect(marked).toBe(true)
})
