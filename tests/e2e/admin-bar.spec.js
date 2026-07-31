const { test, expect } = require('@playwright/test')
const { execFileSync } = require('child_process')

const WP_PATH = process.env.WP_PATH || '/Users/gustavogomez/Local Sites/cadco/app/public'
const BASE = process.env.PROTO_BASE_URL || 'https://cadco.local'

/**
 * Mint a logged-in cookie straight from WordPress rather than driving wp-login.php.
 * Returns { name, value } for the LOGGED_IN_COOKIE, whose name embeds COOKIEHASH
 * and therefore differs per site.
 */
function authCookie() {
  // Two things this has to get right:
  //  - The cookie must be backed by a real session token. wp_validate_auth_cookie()
  //    checks the token against the user's stored sessions, so a cookie built with
  //    an empty token is rejected and the request silently stays logged out.
  //  - The payload is returned as JSON, not a delimited string. An auth cookie's
  //    own value is "username|expiration|token|hmac", so any '|'-delimited wrapper
  //    would be split apart by the value it is carrying.
  const php = `
    $u = get_users(['role' => 'administrator', 'number' => 1]);
    if (empty($u)) { echo json_encode(null); return; }
    $uid = $u[0]->ID;
    $exp = time() + 3600;
    $token = WP_Session_Tokens::get_instance($uid)->create($exp);
    echo json_encode([
      'name'  => LOGGED_IN_COOKIE,
      'value' => wp_generate_auth_cookie($uid, $exp, 'logged_in', $token),
    ]);
  `
  const out = execFileSync('wp', ['eval', php, '--path=' + WP_PATH], { encoding: 'utf8' }).trim()
  return JSON.parse(out)
}

/** Click an injected link and wait for the transition to fully settle. */
async function navigate(page, href) {
  await page.evaluate((href) => {
    const a = document.createElement('a')
    a.href = href
    a.id = 'proto-nav'
    a.textContent = href
    document.querySelector('[data-taxi-view] main').appendChild(a)
    document.getElementById('proto-nav').click()
  }, href)
  await page.waitForFunction(
    () => window.protoTaxi && window.protoTaxi.core.isTransitioning === false,
    null,
    { timeout: 5000 }
  )
}

test.describe('admin bar sync', () => {
  let context
  let page

  test.beforeAll(async ({ browser }) => {
    const cookie = authCookie()
    test.skip(!cookie, 'no administrator account on this site')

    context = await browser.newContext({
      baseURL: BASE,
      ignoreHTTPSErrors: true,
    })
    // Use the `url` form rather than domain/path: Playwright then derives the
    // domain, path and secure flag from the site URL itself, which matters on
    // an https origin.
    await context.addCookies([{ name: cookie.name, value: cookie.value, url: BASE }])
    page = await context.newPage()
  })

  test.afterAll(async () => {
    if (context) await context.close()
  })

  test('the Edit link follows the page being viewed', async () => {
    await page.goto('/taxi-test-a/')

    // Sanity: we really are logged in and the bar rendered.
    await expect(page.locator('#wpadminbar')).toHaveCount(1)

    const before = await page.evaluate(
      () => document.querySelector('#wp-admin-bar-edit a')?.getAttribute('href') || ''
    )
    expect(before).toMatch(/post=\d+/)

    await navigate(page, '/taxi-test-b/')

    const after = await page.evaluate(
      () => document.querySelector('#wp-admin-bar-edit a')?.getAttribute('href') || ''
    )
    expect(after).toMatch(/post=\d+/)
    // Different page => different post ID in the Edit link.
    expect(after).not.toBe(before)
  })

  test('an uneditable page hides the Edit node instead of destroying it', async () => {
    await page.goto('/taxi-test-a/')
    const editable = await page.evaluate(
      () => document.querySelector('#wp-admin-bar-edit a')?.getAttribute('href') || ''
    )
    expect(editable).toMatch(/post=\d+/)

    // A search results page has no editable object, so a hard load renders no
    // Edit node at all.
    await navigate(page, '/?s=taxi')

    const hidden = await page.evaluate(() => {
      const el = document.getElementById('wp-admin-bar-edit')
      return el ? { present: true, display: el.style.display } : { present: false }
    })
    // Still in the DOM (so it can come back), but not shown.
    expect(hidden).toEqual({ present: true, display: 'none' })

    // Returning to an editable page must restore it -- this is what removing
    // the node instead of hiding it would make impossible.
    await navigate(page, '/taxi-test-a/')

    const restored = await page.evaluate(() => {
      const el = document.getElementById('wp-admin-bar-edit')
      return {
        display: el ? el.style.display : null,
        href: el ? el.querySelector('a')?.getAttribute('href') || '' : null,
      }
    })
    expect(restored.display).toBe('')
    expect(restored.href).toBe(editable)
  })
})
