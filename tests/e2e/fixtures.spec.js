const { test, expect } = require('@playwright/test')

test('page A renders fixture A and initialises it once', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await expect(page.locator('[data-proto-block="taxi-fixture-a"]')).toBeVisible()
  await expect(page.locator('[data-proto-block="taxi-fixture-a"]'))
    .toHaveAttribute('data-initialised', 'yes')
  expect(await page.evaluate(() => window.__protoInitCount)).toBe(1)
})

test('page B renders both fixtures', async ({ page }) => {
  await page.goto('/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-a"]')).toBeVisible()
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()
  expect(await page.evaluate(() => window.__protoInitLog)).toEqual(
    expect.arrayContaining(['taxi-fixture-a', 'taxi-fixture-b'])
  )
})
