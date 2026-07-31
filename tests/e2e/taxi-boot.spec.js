const { test, expect } = require('@playwright/test')

test('taxi and its emitter are available as globals', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  const globals = await page.evaluate(() => ({
    hasE: typeof window.E === 'object' && typeof window.E.on === 'function',
    hasCore: typeof window.taxi?.Core === 'function',
    hasTransition: typeof window.taxi?.Transition === 'function',
  }))
  expect(globals).toEqual({ hasE: true, hasCore: true, hasTransition: true })
})
