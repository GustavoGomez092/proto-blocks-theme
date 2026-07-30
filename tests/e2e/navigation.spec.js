const { test, expect } = require('@playwright/test')

test('in-content navigation swaps without a document request', async ({ page }) => {
  let documentRequests = 0
  page.on('request', (r) => { if (r.resourceType() === 'document') documentRequests++ })

  await page.goto('/taxi-test-a/')
  expect(documentRequests).toBe(1)

  await page.evaluate(() => { window.__sentinel = 'alive' })
  await page.evaluate(() => {
    const a = document.createElement('a')
    a.href = '/taxi-test-b/'
    a.textContent = 'to B'
    a.id = 'proto-test-link'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  })

  await page.click('#proto-test-link')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()

  expect(documentRequests).toBe(1)
  expect(await page.evaluate(() => window.__sentinel)).toBe('alive')
  expect(await page.title()).toContain('Taxi Test B')
})

test('a completed onEnter transition settles the view and unblocks the next navigation', async ({ page }) => {
  await page.goto('/taxi-test-a/')

  await page.evaluate(() => {
    const a = document.createElement('a')
    a.href = '/taxi-test-b/'
    a.textContent = 'to B'
    a.id = 'proto-test-link-ab'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  })
  await page.click('#proto-test-link-ab')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()

  // Taxi only clears `core.isTransitioning` once onEnter's `done()` resolves
  // (Renderer.afterFetch sets it false in the callback passed to
  // `renderer.enter().then()`). If a future edit dropped `done()` from
  // onEnter, this would hang forever and the test would time out here —
  // that is the point: it proves onEnter actually finished.
  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false,
    null,
    { timeout: 5000 }
  )

  // A half-finished GSAP tween (onEnter bailing before ever animating, or
  // completing without settling) would leave the view visibly off from its
  // rest state; assert it actually landed.
  const settled = await page.evaluate(() => {
    const main = document.querySelector('[data-taxi-view] main')
    const style = getComputedStyle(main)
    return { opacity: style.opacity, transform: style.transform }
  })
  expect(settled.opacity).toBe('1')
  expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(settled.transform)

  // The real proof: with `allowInterruption` at its default `false`, Taxi
  // refuses to start a second navigation while `isTransitioning` is true.
  // A second, independent navigation only succeeds if the first one's
  // onEnter actually resolved.
  await page.evaluate(() => {
    const a = document.createElement('a')
    a.href = '/taxi-test-a/'
    a.textContent = 'back to A'
    a.id = 'proto-test-link-ba'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  })
  await page.click('#proto-test-link-ba')
  await page.waitForFunction(() => location.pathname === '/taxi-test-a/', null, { timeout: 5000 })

  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toHaveCount(0)
  expect(await page.title()).toContain('Taxi Test A')
})

test('protoTaxi public API is exposed', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  const api = await page.evaluate(() => ({
    hasCore: typeof window.protoTaxi?.core === 'object',
    hasAdd: typeof window.protoTaxi?.addTransition === 'function',
    registers: (() => {
      window.protoTaxi.addTransition('custom', class extends window.taxi.Transition {})
      return typeof window.protoTaxi.core.transitions.custom === 'function'
    })(),
  }))
  expect(api).toEqual({ hasCore: true, hasAdd: true, registers: true })
})
