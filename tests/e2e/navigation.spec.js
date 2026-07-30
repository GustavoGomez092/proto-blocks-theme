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
