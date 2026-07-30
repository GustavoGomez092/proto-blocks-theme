const { test, expect } = require('@playwright/test')

for (const path of ['/taxi-test-a/', '/', '/hello-world/']) {
  test(`taxi wrapper structure is correct on ${path}`, async ({ page }) => {
    await page.goto(path)
    const shape = await page.evaluate(() => {
      const wrapper = document.querySelector('[data-taxi]')
      if (!wrapper) return { wrapper: false }
      return {
        wrapper: true,
        parentIsSiteBlocks: wrapper.parentElement.classList.contains('wp-site-blocks'),
        childCount: wrapper.children.length,
        childIsView: wrapper.firstElementChild.hasAttribute('data-taxi-view'),
        viewHasMain: !!wrapper.firstElementChild.querySelector('main'),
        headerOutside: !wrapper.querySelector('header'),
        footerOutside: !wrapper.querySelector('footer'),
      }
    })
    expect(shape).toEqual({
      wrapper: true,
      parentIsSiteBlocks: true,
      childCount: 1,
      childIsView: true,
      viewHasMain: true,
      headerOutside: true,
      footerOutside: true,
    })
  })
}

test('page shell layout survives the extra wrapper depth', async ({ page }) => {
  await page.setViewportSize({ width: 1800, height: 900 })
  await page.goto('/taxi-test-a/')
  const box = await page.locator('main').boundingBox()
  expect(box.width).toBeLessThanOrEqual(1440)
  const fills = await page.evaluate(() => {
    const blocks = document.querySelector('.wp-site-blocks')
    return blocks.getBoundingClientRect().height >= window.innerHeight - 1
  })
  expect(fills).toBe(true)
})
