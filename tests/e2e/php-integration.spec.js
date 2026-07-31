const { test, expect } = require('@playwright/test')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const WP_PATH = process.env.WP_PATH || '/Users/gustavogomez/Local Sites/cadco/app/public'
const wpCli = (args) => execFileSync('wp', [...args, '--path=' + WP_PATH], { encoding: 'utf8' }).trim()

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

test('an ignore URL without a trailing slash still cannot prefix-collide (exercises the anchor)', async ({ page }) => {
  // On this install wc_get_page_id('cart') -> get_permalink() -> wp_parse_url() resolves to
  // "/cart/" WITH a trailing slash (the site runs /%postname%/ permalinks), which alone already
  // stops "/cart" from colliding with "/cart-accessories/" — so the test above does not actually
  // exercise the right-edge anchor added to proto_taxi_mark_ignored_links(). The anchor exists to
  // protect permalink structures without a trailing slash (e.g. /%postname%), which this install
  // doesn't use. Inject a slash-less URL via the public proto_taxi_ignore_urls filter (a temporary
  // mu-plugin, removed in `finally`) and a temporary page (deleted in `finally`) to prove the
  // anchor holds even without a trailing slash doing the work for it.
  const muPluginPath = path.join(WP_PATH, 'wp-content/mu-plugins/proto-taxi-test-anchor.php')
  fs.mkdirSync(path.dirname(muPluginPath), { recursive: true })
  fs.writeFileSync(muPluginPath, `<?php
add_filter('proto_taxi_ignore_urls', function ($urls) {
    $urls[] = home_url('/cart-test-noslash');
    return $urls;
});
`)

  let pageId = null
  try {
    pageId = wpCli([
      'post', 'create',
      '--post_type=page',
      '--post_title=Taxi Anchor Test',
      '--post_status=publish',
      '--post_content=<!-- wp:paragraph --><p><a href="/cart-test-noslash">Exact</a> <a href="/cart-test-noslash-decoy/">Decoy</a></p><!-- /wp:paragraph -->',
      '--porcelain',
    ])

    await page.goto(`/?page_id=${pageId}`)
    const marks = await page.evaluate(() => {
      const get = (href) => {
        const a = [...document.querySelectorAll('a')].find(el => el.getAttribute('href') === href)
        return a ? a.hasAttribute('data-taxi-ignore') : null
      }
      return {
        exact: get('/cart-test-noslash'),
        decoy: get('/cart-test-noslash-decoy/'),
      }
    })
    expect(marks).toEqual({ exact: true, decoy: false })
  } finally {
    if (pageId) {
      wpCli(['post', 'delete', pageId, '--force'])
    }
    fs.unlinkSync(muPluginPath)
  }
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
    // Core always fires this filter with three arguments (tag, handle, src).
    // Passing only two makes any plugin callback that declares $src as required
    // fatal with ArgumentCountError -- Wordfence Login Security's
    // _tagVueScriptAsModule() is one, and it is among the plugins TGMPA installs.
    $result = apply_filters('script_loader_tag', $tag, 'proto-blocks-test-handle', 'https://example.test/view.js');
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
