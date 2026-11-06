const fs = require('fs')
const path = require('path')
const { test, expect } = require('@playwright/test')

/**
 * syncNavState() keeps aria-current="page" and core's current-menu-item
 * classes in step with the page being viewed, since the header and footer
 * template parts never re-render under Taxi.
 *
 * Self-contained: a two-page site on a fake origin is served through route
 * interception, with the theme's own e.umd.js, taxi.umd.js and
 * proto-taxi.js from scripts/. No WordPress install is needed.
 */

const ORIGIN = 'https://proto-nav-state.test'
const SCRIPTS = path.resolve(__dirname, '../../scripts')

function pageHtml(pathname) {
  const home = pathname === '/'
  // The server-rendered state WordPress produces: core marks its own
  // navigation items; the site-logo and site-title links are plain.
  const navItem = (href, label, current) =>
    `<li class="wp-block-navigation-item${current ? ' current-menu-item current_page_item' : ''}">` +
    `<a class="wp-block-navigation-item__content" href="${href}"${current ? ' aria-current="page"' : ''}>${label}</a></li>`
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${home ? 'Home' : 'About'}</title></head>
<body>
<header class="wp-block-template-part">
  <a id="logo" class="wp-block-site-logo-link" href="${ORIGIN}/">Logo</a>
  <a id="title" href="/">Site title</a>
  <nav class="wp-block-navigation" aria-label="Primary"><ul class="wp-block-navigation__container">
    ${navItem('/', 'Home', home)}
    ${navItem('/about/', 'About', !home)}
    ${navItem('/about/#team', 'Team', false)}
    ${navItem('https://sister.example/about/', 'Sister site', false)}
  </ul></nav>
</header>
<div data-taxi><div data-taxi-view><main><h1>${home ? 'Home' : 'About'}</h1><p>Content</p></main></div></div>
<footer class="wp-block-template-part">
  <a id="footer-home" href="/">Home</a>
  <a id="footer-about" href="/about">About</a>
  <a id="cookies" href="#cookie-settings">Cookie settings</a>
  <a id="mail" href="mailto:hello@example.com">Mail</a>
</footer>
<script src="/scripts/e.umd.js"></script>
<script>if(window.E&&window.E.__esModule&&window.E.default){window.E=window.E.default}</script>
<script src="/scripts/taxi.umd.js"></script>
<script src="/scripts/proto-taxi.js"></script>
</body></html>`
}

test.use({ baseURL: ORIGIN })

test.beforeEach(async ({ page }) => {
  await page.route(`${ORIGIN}/**`, (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/scripts/')) {
      const file = path.join(SCRIPTS, path.basename(url.pathname))
      return route.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(file, 'utf8') })
    }
    const pathname = url.pathname.replace(/\/+$/, '') || '/'
    if (pathname === '/' || pathname === '/about') {
      return route.fulfill({ contentType: 'text/html', body: pageHtml(pathname === '/' ? '/' : '/about/') })
    }
    return route.fulfill({ status: 404, contentType: 'text/html', body: '<h1>404</h1>' })
  })
})

async function navigateTo(page, selector, pathname) {
  await page.click(selector)
  await page.waitForFunction((p) => location.pathname.replace(/\/+$/, '') === p, pathname.replace(/\/+$/, ''))
  await page.waitForFunction(() => window.protoTaxi && window.protoTaxi.core.isTransitioning === false)
}

/** aria-current and current-menu-item for every header/footer link, keyed by id or href. */
function navState(page) {
  return page.evaluate(() => {
    const out = {}
    for (const a of document.querySelectorAll('header a[href], footer a[href]')) {
      out[a.id || a.getAttribute('href')] = {
        current: a.getAttribute('aria-current'),
        menuItem: a.classList.contains('current-menu-item'),
      }
    }
    return out
  })
}

test('a direct load marks the logo and footer links of the current page, never hash links', async ({ page }) => {
  await page.goto('/')
  const state = await navState(page)

  expect(state.logo).toEqual({ current: 'page', menuItem: false })
  expect(state.title).toEqual({ current: 'page', menuItem: false })
  expect(state['footer-home']).toEqual({ current: 'page', menuItem: false })
  expect(state['/']).toEqual({ current: 'page', menuItem: true })
  expect(state['/about/']).toEqual({ current: null, menuItem: false })
  expect(state['footer-about']).toEqual({ current: null, menuItem: false })
  expect(state['/about/#team']).toEqual({ current: null, menuItem: false })
  expect(state.cookies).toEqual({ current: null, menuItem: false })
  expect(state.mail).toEqual({ current: null, menuItem: false })
})

test('navigating to the home page moves aria-current onto the logo and footer links', async ({ page }) => {
  await page.goto('/about/')
  expect((await navState(page)).logo.current).toBeNull()

  await navigateTo(page, 'header .wp-block-navigation a[href="/"]', '/')
  const state = await navState(page)

  expect(state.logo).toEqual({ current: 'page', menuItem: false })
  expect(state.title).toEqual({ current: 'page', menuItem: false })
  expect(state['footer-home']).toEqual({ current: 'page', menuItem: false })
  expect(state['/']).toEqual({ current: 'page', menuItem: true })
  expect(state['/about/']).toEqual({ current: null, menuItem: false })
  expect(state['footer-about']).toEqual({ current: null, menuItem: false })
  expect(state.cookies.current).toBeNull()
  const li = await page.getAttribute('header .wp-block-navigation a[href="/"] >> xpath=..', 'class')
  expect(li).toContain('current-menu-item')
  expect(li).toContain('current_page_item')
})

test('navigating away clears the stale state and never marks hash or external links', async ({ page }) => {
  await page.goto('/')
  await navigateTo(page, '#footer-about', '/about/')
  const state = await navState(page)

  expect(state.logo).toEqual({ current: null, menuItem: false })
  expect(state.title).toEqual({ current: null, menuItem: false })
  expect(state['footer-home']).toEqual({ current: null, menuItem: false })
  expect(state['/']).toEqual({ current: null, menuItem: false })
  expect(state['/about/']).toEqual({ current: 'page', menuItem: true })
  expect(state['footer-about']).toEqual({ current: 'page', menuItem: false })
  // Same path as the page being viewed, but a fragment points inside a page, not at one.
  expect(state['/about/#team']).toEqual({ current: null, menuItem: false })
  // Same path on another origin.
  expect(state['https://sister.example/about/']).toEqual({ current: null, menuItem: false })
  expect(state.cookies.current).toBeNull()
  expect(state.mail.current).toBeNull()
})
