const { test, expect } = require('@playwright/test')
const { execFileSync } = require('child_process')

const WP_PATH = process.env.WP_PATH || '/Users/gustavogomez/Local Sites/cadco/app/public'

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
  // Matched with a trailing slash so it cannot also pick up /cart-accessories/.
  const links = page.locator('[data-taxi-view] a[href*="/cart/"]')
  expect(await links.count()).toBeGreaterThan(0)
  const marked = await page.evaluate(() =>
    [...document.querySelectorAll('[data-taxi-view] a[href*="/cart/"]')]
      .every(a => a.hasAttribute('data-taxi-ignore')))
  expect(marked).toBe(true)
})

test('links that merely share a path prefix with an ignored URL are not marked', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  // The fixture page content also includes a /cart-accessories/ link (tests/fixtures/setup.sh)
  // — it must not be treated as the WooCommerce cart page just because it starts with "/cart".
  const links = page.locator('[data-taxi-view] a[href*="/cart-accessories"]')
  expect(await links.count()).toBeGreaterThan(0)
  const wronglyMarked = await page.evaluate(() =>
    [...document.querySelectorAll('[data-taxi-view] a[href*="/cart-accessories"]')]
      .some(a => a.hasAttribute('data-taxi-ignore')))
  expect(wronglyMarked).toBe(false)
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

test('script_loader_tag only marks the tag carrying src, not inline/translation sibling tags', () => {
  // No current proto-blocks-* handle uses wp_add_inline_script()/wp_set_script_translations(),
  // so this scenario is otherwise dormant in the fixtures. Exercise the real, already-registered
  // script_loader_tag filter directly with a synthetic $tag that reproduces what
  // WP_Scripts::do_item() emits when a handle has inline "before" data: multiple <script> tags,
  // only one of which carries the src attribute.
  const php = `
    $tag = '<script type="text/javascript" id="proto-blocks-test-handle-js-before">/* inline before */</script>' . "\\n" .
        '<script src="https://example.test/view.js" id="proto-blocks-test-handle-js"></script>' . "\\n";
    $result = apply_filters('script_loader_tag', $tag, 'proto-blocks-test-handle');
    echo json_encode(['result' => $result, 'count' => substr_count($result, 'data-taxi-reload')]);
  `
  const output = execFileSync('wp', ['eval', php, '--path=' + WP_PATH], { encoding: 'utf8' })
  const { result, count } = JSON.parse(output)
  const lines = result.split('\n').filter(Boolean)

  // Two sibling <script> tags went in; two must come out, untouched apart from the mark.
  expect(lines).toHaveLength(2)
  // Marked exactly once, total.
  expect(count).toBe(1)
  // The inline "before" tag (no src) must be untouched.
  expect(lines[0]).not.toContain('data-taxi-reload')
  // Only the tag with the src attribute is marked.
  expect(lines[1]).toMatch(/^<script data-taxi-reload src="https:\/\/example\.test\/view\.js"/)
})
