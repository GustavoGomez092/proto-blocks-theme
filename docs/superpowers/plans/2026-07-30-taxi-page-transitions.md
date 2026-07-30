# Taxi.js Page Transitions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Proto-theme SPA-style page transitions via `@unseenco/taxi`, with correct re-execution of Proto-Blocks block scripts on the incoming page, proven by a committed Playwright suite.

**Architecture:** Two vendored UMD files (`e.umd.js` → `window.E`, `taxi.umd.js` → `window.taxi`) are enqueued alongside the theme's existing animation libraries. `scripts/proto-taxi.js` boots a `Taxi.Core` against a `[data-taxi]` wrapper added to the three block templates, registers a GSAP fade transition, and synchronises everything Taxi does not (body class, head tags, nav active state, Lenis, ScrollTrigger, admin bar, focus). `inc/proto-taxi.php` stamps `data-taxi-reload` onto Proto-Blocks view scripts so Taxi's stock `reloadJsFilter` re-runs them.

**Tech Stack:** WordPress block theme (PHP 8.0+, WP 6.9+), `@unseenco/taxi` 1.9.1, `@unseenco/e` 2.5.0, GSAP 3.15 (already vendored), Lenis 1.1.13 (already vendored), Playwright (devDependency only).

## Global Constraints

- **No build step ships with the theme.** Vendored libraries are copied verbatim from npm `dist/`. Never bundle, minify, or transpile theme source.
- **Prefixes:** PHP functions/hooks `proto_`, script handles `proto-`, CSS/JS classes `proto-`, text domain `proto-theme`.
- **Versions:** `@unseenco/taxi` 1.9.1, `@unseenco/e` 2.5.0. Enqueue versions must match exactly.
- **Dev scaffolding never ships.** Every dev-only path (`package.json`, `playwright.config.js`, `tests/`, `node_modules`) gets `export-ignore` in `.gitattributes` and an entry in `.gitignore` where appropriate. The release zip is built with `git archive`.
- **No AI attribution in commit messages.** Plain `<type>(<scope>): <subject>` only.
- **Working directory:** `wp-content/themes/proto-theme` on branch `feat/taxi-page-transitions`.
- **Test site:** `https://cadco.local` (Local by Flywheel, self-signed cert → Playwright needs `ignoreHTTPSErrors: true`).
- **Taxi facts that the code depends on** (verified against v1.9.1 source):
  - `reloadJsFilter` default is `(element) => element.dataset.taxiReload !== undefined`; `reloadCssFilter` default is `() => true`.
  - `Core.loadScripts()` scans the **entire** fetched document, re-executes scripts whose `outerHTML` matches an existing one, appends new ones.
  - `Renderer.content` (`Renderer.js:13,40`) is the **live** DOM node. Cache-entry `.content` is a detached parse. Always read `payload.to.renderer.content`, never `payload.to.content`.
  - `Renderer.remove()` removes `wrapper.firstElementChild`, so during a transition `[data-taxi]` briefly holds **two** view children.
  - Per-link transition attribute is `data-transition` (`Core.js:422`).
  - Emitter is `window.E`; subscribe with `E.on('NAVIGATE_IN', fn)` (function-as-second-arg registers on the internal bus, `e.js:45-49`).
  - `core.transitions` is a plain object, so `core.transitions[name] = Class` registers a transition after construction.

---

## File Structure

**Create**

| Path | Responsibility |
|---|---|
| `scripts/e.umd.js` | Vendored `@unseenco/e` 2.5.0 `dist/e.umd.js`. Sets `window.E`. |
| `scripts/taxi.umd.js` | Vendored `@unseenco/taxi` 1.9.1 `dist/taxi.umd.js`. Sets `window.taxi`. |
| `scripts/proto-taxi.js` | Boot, config, fade transition, lifecycle sync, `window.protoTaxi` API. |
| `inc/proto-taxi.php` | `proto_taxi_enabled` gate, `data-taxi-reload` marking, `data-taxi-ignore` URL marking. |
| `proto-blocks/taxi-fixture-a/` | Test fixture block, present on both test pages. |
| `proto-blocks/taxi-fixture-b/` | Test fixture block, present only on page B. |
| `tests/e2e/*.spec.js` | Playwright specs. |
| `tests/fixtures/setup.sh` | Idempotent WP-CLI script creating the two test pages. |
| `playwright.config.js` | Playwright config. Dev only. |
| `package.json` | devDependencies only. Dev only. |

**Modify**

| Path | Change |
|---|---|
| `functions.php:6` | `require_once` for `inc/proto-taxi.php` |
| `functions.php:61-69` | Three new entries in the `$libs` map |
| `templates/index.html`, `templates/page.html`, `templates/single.html` | `[data-taxi]` / `[data-taxi-view]` wrapper around the `<main>` group |
| `style.css:38-49` | Page-shell selectors updated for the new wrapper depth; view stacking during transition |
| `README.md` | Page-transitions section |
| `.gitattributes` | `export-ignore` for dev scaffolding |
| `.gitignore` | `node_modules`, Playwright output |

---

### Task 1: Playwright harness and fixture blocks

Establishes the test rig **before** any Taxi code, so every later task is test-first. At the end of this task the suite passes against the current, un-transitioned theme.

**Files:**
- Create: `package.json`, `playwright.config.js`, `.gitignore` (modify), `.gitattributes` (modify)
- Create: `proto-blocks/taxi-fixture-a/view.js`, `proto-blocks/taxi-fixture-b/view.js`
- Create: `tests/fixtures/setup.sh`
- Test: `tests/e2e/fixtures.spec.js`

**Interfaces:**
- Consumes: nothing.
- Produces: test pages at `/taxi-test-a/` and `/taxi-test-b/`; global counters `window.__protoInitCount` (number) and `window.__protoInitLog` (array of strings) set by fixture `view.js`; npm script `npm test`.

- [ ] **Step 1: Activate the theme so the tests have something to run against**

```bash
cd "/Users/gustavogomez/Local Sites/cadco/app/public"
wp theme activate proto-theme
wp theme list --status=active
```

Expected: `proto-theme` listed as active.

- [ ] **Step 2: Scaffold the two fixture blocks**

```bash
cd "/Users/gustavogomez/Local Sites/cadco/app/public"
wp proto-blocks create taxi-fixture-a --title="Taxi Fixture A" --fields="heading:text" --dir=theme
wp proto-blocks create taxi-fixture-b --title="Taxi Fixture B" --fields="heading:text" --dir=theme
ls wp-content/themes/proto-theme/proto-blocks/taxi-fixture-a
```

Expected: `block.json`, `template.php` (and possibly `style.css`) in each directory. Block names are `proto-blocks/taxi-fixture-a` and `proto-blocks/taxi-fixture-b` (`includes/CLI/Commands.php:179`).

- [ ] **Step 3: Add a `view.js` to each fixture block**

The scaffolder does not create one. `Registrar.php:176-192` picks up `view.js` automatically and registers it as handle `proto-blocks-{name}`.

`proto-blocks/taxi-fixture-a/view.js`:

```js
/* Test fixture — records every execution so E2E specs can assert re-runs. */
(function () {
  'use strict';
  window.__protoInitCount = (window.__protoInitCount || 0) + 1;
  window.__protoInitLog = window.__protoInitLog || [];
  window.__protoInitLog.push('taxi-fixture-a');

  var roots = document.querySelectorAll('[data-proto-block="taxi-fixture-a"]');
  for (var i = 0; i < roots.length; i++) {
    roots[i].setAttribute('data-initialised', 'yes');
    roots[i].setAttribute('data-init-count', String(window.__protoInitCount));
  }
})();
```

`proto-blocks/taxi-fixture-b/view.js` — identical but with every `taxi-fixture-a` replaced by `taxi-fixture-b`, and pushing `'taxi-fixture-b'`:

```js
/* Test fixture — records every execution so E2E specs can assert re-runs. */
(function () {
  'use strict';
  window.__protoInitCount = (window.__protoInitCount || 0) + 1;
  window.__protoInitLog = window.__protoInitLog || [];
  window.__protoInitLog.push('taxi-fixture-b');

  var roots = document.querySelectorAll('[data-proto-block="taxi-fixture-b"]');
  for (var i = 0; i < roots.length; i++) {
    roots[i].setAttribute('data-initialised', 'yes');
    roots[i].setAttribute('data-init-count', String(window.__protoInitCount));
  }
})();
```

- [ ] **Step 4: Give each fixture template a stable hook**

Open `proto-blocks/taxi-fixture-a/template.php` and ensure the outermost element carries `data-proto-block="taxi-fixture-a"` and a heading rendering the block title. Replace the file contents with:

```php
<div class="proto-taxi-fixture" data-proto-block="taxi-fixture-a">
    <h2 data-proto-text="heading">Fixture A</h2>
</div>
```

Do the same for `taxi-fixture-b` with `taxi-fixture-b` / `Fixture B`.

- [ ] **Step 5: Write the test-page setup script**

`tests/fixtures/setup.sh`:

```bash
#!/usr/bin/env bash
# Creates (or refreshes) the two pages the Taxi E2E suite navigates between.
# Idempotent: safe to re-run.
set -euo pipefail

WP_PATH="${WP_PATH:-/Users/gustavogomez/Local Sites/cadco/app/public}"
wp() { command wp --path="$WP_PATH" "$@"; }

upsert_page() {
  local slug="$1" title="$2" content="$3"
  local id
  id="$(wp post list --post_type=page --name="$slug" --field=ID --format=ids)"
  if [ -n "$id" ]; then
    wp post update "$id" --post_title="$title" --post_content="$content" --post_status=publish >/dev/null
    echo "updated $slug (ID $id)"
  else
    wp post create --post_type=page --post_title="$title" --post_name="$slug" \
      --post_content="$content" --post_status=publish --porcelain
  fi
}

upsert_page "taxi-test-a" "Taxi Test A" \
  '<!-- wp:proto-blocks/taxi-fixture-a /--><!-- wp:paragraph --><p><a href="/cart/">Cart</a></p><!-- /wp:paragraph -->'

upsert_page "taxi-test-b" "Taxi Test B" \
  '<!-- wp:proto-blocks/taxi-fixture-a /--><!-- wp:proto-blocks/taxi-fixture-b /-->'
```

```bash
chmod +x tests/fixtures/setup.sh
./tests/fixtures/setup.sh
```

Expected: two IDs or "updated" lines. Page A holds fixture A only; page B holds both, which is what proves "a block that exists only on the target page loads".

- [ ] **Step 6: Add the dev-only package manifest**

`package.json`:

```json
{
  "name": "proto-theme-dev",
  "private": true,
  "description": "Development tooling for Proto-theme. Not shipped in the theme zip.",
  "scripts": {
    "test": "playwright test",
    "test:headed": "playwright test --headed",
    "fixtures": "./tests/fixtures/setup.sh"
  },
  "devDependencies": {
    "@playwright/test": "^1.49.0"
  }
}
```

```bash
npm install
npx playwright install chromium
```

- [ ] **Step 7: Add the Playwright config**

`playwright.config.js`:

```js
const { defineConfig, devices } = require('@playwright/test')

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: process.env.PROTO_BASE_URL || 'https://cadco.local',
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
```

- [ ] **Step 8: Write the failing fixture test**

`tests/e2e/fixtures.spec.js`:

```js
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
```

- [ ] **Step 9: Run the tests**

Run: `npm test`
Expected: **PASS**. This task's tests describe the pre-Taxi baseline; if they fail, the fixtures or block registration are wrong and must be fixed before continuing. Common cause: block script not enqueued because the block did not render — check `view-source:https://cadco.local/taxi-test-a/` for `proto-blocks-taxi-fixture-a`.

- [ ] **Step 10: Exclude dev scaffolding from the release zip**

Append to `.gitattributes`:

```
/package.json        export-ignore
/package-lock.json   export-ignore
/playwright.config.js export-ignore
/tests               export-ignore
```

Append to `.gitignore`:

```
node_modules/
test-results/
playwright-report/
```

- [ ] **Step 11: Verify the zip stays clean**

```bash
git add -A && git stash -u --keep-index >/dev/null 2>&1 || true
git archive --format=tar HEAD | tar t | grep -E 'package.json|playwright|tests/' || echo "CLEAN: no dev files in archive"
git stash pop >/dev/null 2>&1 || true
```

Expected: `CLEAN: no dev files in archive`.

- [ ] **Step 12: Commit**

```bash
git add package.json package-lock.json playwright.config.js tests .gitattributes .gitignore proto-blocks/taxi-fixture-a proto-blocks/taxi-fixture-b
git commit -m "test: add Playwright harness and Taxi fixture blocks"
```

---

### Task 2: Vendor and enqueue the Taxi libraries

**Files:**
- Create: `scripts/e.umd.js`, `scripts/taxi.umd.js`
- Modify: `functions.php:61-69`
- Test: `tests/e2e/taxi-boot.spec.js`

**Interfaces:**
- Consumes: Task 1's harness.
- Produces: `window.E` (emitter with `.on(event, fn)` / `.emit()`), `window.taxi` (`{ Core, Renderer, Transition }`), script handles `proto-taxi-e`, `proto-taxi`, `proto-taxi-init`.

- [ ] **Step 1: Write the failing test**

`tests/e2e/taxi-boot.spec.js`:

```js
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/taxi-boot.spec.js`
Expected: FAIL — `hasE: false, hasCore: false`.

- [ ] **Step 3: Vendor the two dist files**

```bash
cd /tmp && rm -rf taxi-vendor && mkdir taxi-vendor && cd taxi-vendor
npm pack @unseenco/taxi@1.9.1 && npm pack @unseenco/e@2.5.0
mkdir -p taxi e && tar xzf unseenco-taxi-1.9.1.tgz -C taxi && tar xzf unseenco-e-2.5.0.tgz -C e
THEME="/Users/gustavogomez/Local Sites/cadco/app/public/wp-content/themes/proto-theme"
cp taxi/package/dist/taxi.umd.js "$THEME/scripts/taxi.umd.js"
cp e/package/dist/e.umd.js "$THEME/scripts/e.umd.js"
```

Do **not** copy the `.map` files — they reference sources that are not shipped.

- [ ] **Step 4: Add the enqueue entries**

In `functions.php`, inside the `$libs` array (after the `'lenis'` entry, before `'init'`), add:

```php
        'taxi-e'         => ['file' => 'e.umd.js',      'version' => '2.5.0',  'deps' => []],
        'taxi'           => ['file' => 'taxi.umd.js',   'version' => '1.9.1',  'deps' => ['proto-taxi-e']],
```

and after the `'intro'` entry add:

```php
        'taxi-init'      => ['file' => 'proto-taxi.js', 'version' => '1.0.0',  'deps' => ['proto-taxi', 'proto-init']],
```

The loop skips files that do not exist (`functions.php:71-74`), so `proto-taxi.js` being absent until Task 5 is harmless.

- [ ] **Step 5: Run the test**

Run: `npx playwright test tests/e2e/taxi-boot.spec.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/e.umd.js scripts/taxi.umd.js functions.php tests/e2e/taxi-boot.spec.js
git commit -m "feat(taxi): vendor @unseenco/taxi 1.9.1 and enqueue it"
```

---

### Task 3: Template wrapper and page-shell CSS

Taxi requires `[data-taxi-view]` to be the sole child of `[data-taxi]`. Inserting those two divs moves `<main>` from being a child of `.wp-site-blocks` to a grandchild, which **breaks the existing `.wp-site-blocks > main` rules** (`style.css:38-49`). This task fixes both together.

`Renderer.remove()` removes `wrapper.firstElementChild`, so during a transition `[data-taxi]` holds two view children; they are stacked in a single CSS grid cell so the page does not jump.

**Files:**
- Modify: `templates/index.html`, `templates/page.html`, `templates/single.html`
- Modify: `style.css:33-49`
- Test: `tests/e2e/markup.spec.js`

**Interfaces:**
- Consumes: nothing.
- Produces: DOM structure `.wp-site-blocks > [data-taxi] > [data-taxi-view] > main` on every front-end template.

- [ ] **Step 1: Write the failing test**

`tests/e2e/markup.spec.js`:

```js
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/markup.spec.js`
Expected: FAIL — `{ wrapper: false }`.

- [ ] **Step 3: Wrap the main group in each template**

In `templates/page.html`, replace the whole `wp:group` block with:

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->

<div data-taxi>
	<div data-taxi-view>
		<!-- wp:group {"tagName":"main","align":"full","style":{"spacing":{"padding":{"top":"0","right":"0","bottom":"0","left":"0"},"margin":{"top":"0","bottom":"0"}}},"layout":{"type":"default"}} -->
		<main class="wp-block-group alignfull" style="margin-top:0;margin-bottom:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0">
			<!-- wp:post-content {"align":"full","layout":{"type":"default"}} /-->
		</main>
		<!-- /wp:group -->
	</div>
</div>

<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

Apply the same `<div data-taxi><div data-taxi-view>` … `</div></div>` wrapper around the existing `wp:group` in `templates/index.html` and `templates/single.html`, leaving those groups' own markup untouched.

- [ ] **Step 4: Update the page-shell CSS**

In `style.css`, replace the block at lines 33-49 with:

```css
.wp-site-blocks {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* The Taxi wrapper sits between .wp-site-blocks and <main>. It stretches like
   <main> used to, and stacks its children in one grid cell so the outgoing and
   incoming views overlap during a transition instead of stacking vertically. */
.wp-site-blocks > [data-taxi] {
  display: grid;
  grid-template-areas: "proto-taxi-view";
  flex: 1 0 auto;
  min-width: 0;
}
.wp-site-blocks > [data-taxi] > [data-taxi-view] {
  grid-area: proto-taxi-view;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wp-site-blocks > header,
.wp-site-blocks > footer,
.wp-site-blocks main {
  box-sizing: border-box;        /* keep padding inside the 1440 / 100% width */
  width: 100%;
  max-width: 1440px;
  margin-inline: auto;
  padding-inline: clamp(1rem, 4vw, 2.5rem); /* default side gutters */
}
.wp-site-blocks main {
  flex: 1 0 auto; /* take the leftover height */
}
```

- [ ] **Step 5: Run the test**

Run: `npx playwright test tests/e2e/markup.spec.js`
Expected: PASS on all four tests.

- [ ] **Step 6: Confirm raw HTML survives the block parser**

```bash
curl -sk https://cadco.local/taxi-test-a/ | grep -c 'data-taxi-view'
```

Expected: `1`. If `0`, WordPress stripped the raw HTML — stop and report; the fallback is to emit the wrapper from PHP via a `render_block` filter instead of template markup.

- [ ] **Step 7: Run the whole suite for regressions**

Run: `npm test`
Expected: all previous tests still PASS.

- [ ] **Step 8: Commit**

```bash
git add templates style.css tests/e2e/markup.spec.js
git commit -m "feat(taxi): add data-taxi wrapper to templates and adjust page shell"
```

---

### Task 4: PHP integration — enable gate, script marking, ignored URLs

**Files:**
- Create: `inc/proto-taxi.php`
- Modify: `functions.php:6`
- Test: `tests/e2e/php-integration.spec.js`

**Interfaces:**
- Consumes: nothing.
- Produces: PHP functions `proto_taxi_is_enabled(): bool`, `proto_taxi_reload_handles(): array`, `proto_taxi_ignore_urls(): array`; filters `proto_taxi_enabled`, `proto_taxi_reload_handles`, `proto_taxi_ignore_urls`; `data-taxi-reload` attribute on block view script tags; `data-taxi-ignore` on WooCommerce cart/checkout/my-account links.

- [ ] **Step 1: Write the failing test**

`tests/e2e/php-integration.spec.js`:

```js
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/php-integration.spec.js`
Expected: FAIL — `fixtureA: false`.

- [ ] **Step 3: Create `inc/proto-taxi.php`**

```php
<?php
/**
 * Taxi.js page-transition integration.
 *
 * Taxi's default reloadJsFilter only re-runs scripts carrying a
 * `data-taxi-reload` attribute. WordPress has no way to express that in
 * block markup, so the attribute is stamped onto the tag here, per handle.
 */

/**
 * Whether page transitions are active for this request.
 */
function proto_taxi_is_enabled(): bool
{
    if (is_admin() || wp_is_json_request()) {
        return false;
    }

    return (bool) apply_filters('proto_taxi_enabled', true);
}

/**
 * Script handles whose tags get `data-taxi-reload`.
 *
 * Proto-Blocks registers every block's view.js as `proto-blocks-{name}`
 * (Registrar.php:185), so the prefix covers all blocks. The deny list is
 * applied after, and wins.
 */
function proto_taxi_reload_handles(): array
{
    return (array) apply_filters('proto_taxi_reload_handles', []);
}

/**
 * Handles that must never be re-executed — re-running these would create a
 * second Lenis instance, a second RAF loop, or a second Taxi Core.
 */
function proto_taxi_denied_handles(): array
{
    return (array) apply_filters('proto_taxi_denied_handles', [
        'proto-gsap',
        'proto-split-text',
        'proto-scroll-trigger',
        'proto-lottie',
        'proto-lenis',
        'proto-taxi-e',
        'proto-taxi',
        'proto-taxi-init',
        'proto-init',
        'proto-intro',
    ]);
}

/**
 * URLs whose links opt out of Taxi navigation.
 */
function proto_taxi_ignore_urls(): array
{
    $urls = [];

    if (function_exists('wc_get_page_id')) {
        foreach (['cart', 'checkout', 'myaccount'] as $page) {
            $id = wc_get_page_id($page);
            if ($id && $id > 0) {
                $urls[] = get_permalink($id);
            }
        }
    }

    return array_values(array_filter((array) apply_filters('proto_taxi_ignore_urls', $urls)));
}

/**
 * Stamp `data-taxi-reload` on block view scripts.
 */
add_filter('script_loader_tag', function ($tag, $handle) {
    if (!proto_taxi_is_enabled()) {
        return $tag;
    }

    if (in_array($handle, proto_taxi_denied_handles(), true)) {
        return $tag;
    }

    $should = str_starts_with($handle, 'proto-blocks-')
        || in_array($handle, proto_taxi_reload_handles(), true);

    if (!$should || str_contains($tag, 'data-taxi-reload')) {
        return $tag;
    }

    // ES modules evaluate once per URL — re-appending will not re-run them.
    // Those blocks must use the proto:page-ready event instead.
    if (str_contains($tag, 'type="module"')) {
        return $tag;
    }

    return str_replace('<script ', '<script data-taxi-reload ', $tag);
}, 10, 2);

/**
 * Mark links to stateful WooCommerce pages so Taxi leaves them alone.
 *
 * render_block covers both post content and template-level blocks (the
 * navigation in the header), which is everything a block theme renders.
 */
add_filter('render_block', function ($content, $block) {
    return proto_taxi_mark_ignored_links($content);
}, 20, 2);

function proto_taxi_mark_ignored_links($content)
{
    if (!proto_taxi_is_enabled() || !is_string($content) || $content === '' || !str_contains($content, '<a ')) {
        return $content;
    }

    $urls = proto_taxi_ignore_urls();
    if (empty($urls)) {
        return $content;
    }

    foreach ($urls as $url) {
        $path = wp_parse_url($url, PHP_URL_PATH);
        if (!$path) {
            continue;
        }

        $content = preg_replace_callback(
            '#<a\s+([^>]*href=["\'][^"\']*' . preg_quote($path, '#') . '[^"\']*["\'][^>]*)>#i',
            static function ($m) {
                return str_contains($m[1], 'data-taxi-ignore')
                    ? $m[0]
                    : '<a ' . $m[1] . ' data-taxi-ignore>';
            },
            $content
        );
    }

    return $content;
}
```

- [ ] **Step 4: Require it from `functions.php`**

After line 6 (`require_once … proto-required-plugins.php;`) add:

```php
require_once get_stylesheet_directory() . '/inc/proto-taxi.php';
```

- [ ] **Step 5: Gate the enqueues on the enable filter**

In the `wp_enqueue_scripts` callback in `functions.php`, wrap the three new handles so they are skipped when disabled. Immediately before the `foreach ($libs as $handle => $lib)` loop insert:

```php
    if (!proto_taxi_is_enabled()) {
        unset($libs['taxi-e'], $libs['taxi'], $libs['taxi-init']);
    }
```

- [ ] **Step 6: Run the test**

Run: `npx playwright test tests/e2e/php-integration.spec.js`
Expected: PASS (the third test may report as skipped if WooCommerce renders no checkout link).

- [ ] **Step 7: Verify the disable filter works**

```bash
cd "/Users/gustavogomez/Local Sites/cadco/app/public"
wp eval 'add_filter("proto_taxi_enabled","__return_false"); var_dump(proto_taxi_is_enabled());'
```

Expected: `bool(false)`.

- [ ] **Step 8: Commit**

```bash
git add inc/proto-taxi.php functions.php tests/e2e/php-integration.spec.js
git commit -m "feat(taxi): mark block scripts for reload and gate integration behind a filter"
```

---

### Task 5: Boot Taxi with the fade transition

**Files:**
- Create: `scripts/proto-taxi.js`
- Test: `tests/e2e/navigation.spec.js`

**Interfaces:**
- Consumes: `window.taxi`, `window.E`, `window.gsap`, `window.protoLenis`, `[data-taxi]` wrapper.
- Produces: `window.protoTaxi = { core, Transition, addTransition(name, Class) }`.

- [ ] **Step 1: Write the failing test**

`tests/e2e/navigation.spec.js`:

```js
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
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/navigation.spec.js`
Expected: FAIL — `documentRequests` becomes 2 (full page load) and `__sentinel` is `undefined`.

- [ ] **Step 3: Create `scripts/proto-taxi.js`**

```js
/**
 * Proto-theme page transitions (Taxi.js).
 *
 * Boots a single Taxi Core against the [data-taxi] wrapper the templates
 * provide, registers a GSAP fade as the default transition, and exposes
 *   window.protoTaxi = { core, Transition, addTransition }
 *
 * Loaded as `proto-taxi-init` with `proto-taxi` and `proto-init` as deps, so
 * window.taxi and window.protoLenis are guaranteed to exist by the time this
 * file runs.
 */
(function () {
  'use strict';

  var taxi = window.taxi;
  if (!taxi || !taxi.Core) {
    return;
  }

  if (!document.querySelector('[data-taxi]')) {
    console.warn('[proto-taxi] No [data-taxi] wrapper found — page transitions are disabled. See the theme README.');
    return;
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var LINKS = [
    'a[href]',
    ':not([target])',
    ':not([href^="#"])',
    ':not([data-taxi-ignore])',
    ':not([download])',
    ':not([href*="/wp-admin"])',
    ':not([href*="wp-login"])',
    ':not([href^="mailto:"])',
    ':not([href^="tel:"])',
    ':not(#wpadminbar a)',
    ':not(.add_to_cart_button)',
    ':not(.wc-block-components-product-button a)'
  ].join('');

  /**
   * The element the fade animates. The view wrapper is a grid cell used for
   * stacking, so animate the <main> inside it when there is one.
   */
  function animTarget(el) {
    if (!el) return null;
    return el.querySelector('main') || el;
  }

  var ProtoFade = class extends taxi.Transition {
    onLeave(props) {
      var el = animTarget(props.from);
      if (reduced.matches || !window.gsap || !el) {
        props.done();
        return;
      }
      window.gsap.to(el, {
        opacity: 0,
        y: -20,
        duration: 0.4,
        ease: 'power2.inOut',
        onComplete: props.done
      });
    }

    onEnter(props) {
      var el = animTarget(props.to);
      if (reduced.matches || !window.gsap || !el) {
        props.done();
        return;
      }
      window.gsap.fromTo(
        el,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', onComplete: props.done }
      );
    }
  };

  var core = new taxi.Core({
    links: LINKS,
    transitions: { default: ProtoFade }
    // reloadJsFilter is left at its default: only [data-taxi-reload] scripts
    // are re-run. inc/proto-taxi.php decides which tags carry it.
  });

  window.protoTaxi = {
    core: core,
    Transition: taxi.Transition,

    /**
     * Register a transition usable via <a data-transition="name">.
     *
     * @param {string} name
     * @param {Function} TransitionClass  extends window.taxi.Transition
     * @return {object} this, for chaining
     */
    addTransition: function (name, TransitionClass) {
      core.transitions[name] = TransitionClass;
      return this;
    }
  };
})();
```

- [ ] **Step 4: Run the test**

Run: `npx playwright test tests/e2e/navigation.spec.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/proto-taxi.js tests/e2e/navigation.spec.js
git commit -m "feat(taxi): boot Taxi with a GSAP fade transition"
```

---

### Task 6: Prove block scripts re-execute

No new theme code is expected — Task 4 marked the scripts and Task 5 left `reloadJsFilter` at its default. This task exists to prove the mechanism and to catch it if it silently does nothing.

**Files:**
- Test: `tests/e2e/script-reload.spec.js`

**Interfaces:**
- Consumes: fixtures from Task 1, navigation from Task 5.
- Produces: nothing.

- [ ] **Step 1: Write the test**

`tests/e2e/script-reload.spec.js`:

```js
const { test, expect } = require('@playwright/test')

async function linkTo(page, href, id) {
  await page.evaluate(({ href, id }) => {
    const a = document.createElement('a')
    a.href = href
    a.id = id
    a.textContent = href
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, { href, id })
}

test('a block present on both pages re-initialises after navigation', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  expect(await page.evaluate(() => window.__protoInitCount)).toBe(1)

  await linkTo(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-a"]')).toHaveAttribute('data-initialised', 'yes')

  const log = await page.evaluate(() => window.__protoInitLog)
  expect(log.filter(n => n === 'taxi-fixture-a').length).toBeGreaterThanOrEqual(2)
})

test('a block that exists only on the target page loads and initialises', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  expect(await page.evaluate(() => window.__protoInitLog)).not.toContain('taxi-fixture-b')

  await linkTo(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')

  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toHaveAttribute('data-initialised', 'yes')
  expect(await page.evaluate(() => window.__protoInitLog)).toContain('taxi-fixture-b')
})

test('back and forward restore the correct content and title', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await linkTo(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')

  await page.goBack()
  await page.waitForFunction(() => location.pathname === '/taxi-test-a/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toHaveCount(0)
  expect(await page.title()).toContain('Taxi Test A')

  await page.goForward()
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()
  expect(await page.title()).toContain('Taxi Test B')
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/script-reload.spec.js`
Expected: PASS.

If the first test fails with the count stuck at 1, the `data-taxi-reload` attribute is not reaching the tag — re-check `view-source` for `data-taxi-reload` on the fixture script and confirm `proto_taxi_is_enabled()` is true on the front end.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/script-reload.spec.js
git commit -m "test(taxi): cover block script re-execution across navigations"
```

---

### Task 7: Synchronise what Taxi leaves behind

Taxi only sets `document.title`. This task adds body class, head tags, nav active state, admin bar, focus management, and the two public lifecycle events.

**Files:**
- Modify: `scripts/proto-taxi.js`
- Test: `tests/e2e/sync.spec.js`

**Interfaces:**
- Consumes: `window.E`, cache-entry payloads from `NAVIGATE_IN` / `NAVIGATE_OUT`.
- Produces: `document` events `proto:page-ready` (`detail: { container, url }`) and `proto:page-leave` (`detail: { container }`).

- [ ] **Step 1: Write the failing test**

`tests/e2e/sync.spec.js`:

```js
const { test, expect } = require('@playwright/test')

async function navigate(page, href) {
  await page.evaluate((href) => {
    const a = document.createElement('a')
    a.href = href
    a.id = 'proto-nav'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, href)
  await page.click('#proto-nav')
  await page.waitForFunction((h) => location.pathname === h, href)
}

test('body class is synced from the incoming document', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  const before = await page.evaluate(() => document.body.className)
  await navigate(page, '/taxi-test-b/')
  const after = await page.evaluate(() => document.body.className)
  expect(after).not.toBe(before)
  expect(after).toMatch(/page-id-\d+/)
})

test('proto:page-ready fires on load and on every navigation', async ({ page }) => {
  await page.addInitScript(() => {
    window.__ready = []
    document.addEventListener('proto:page-ready', (e) => {
      window.__ready.push(e.detail.url)
    })
  })
  await page.goto('/taxi-test-a/')
  expect((await page.evaluate(() => window.__ready)).length).toBe(1)

  await navigate(page, '/taxi-test-b/')
  const urls = await page.evaluate(() => window.__ready)
  expect(urls.length).toBe(2)
  expect(urls[1]).toContain('/taxi-test-b/')
})

test('proto:page-leave fires with the outgoing container', async ({ page }) => {
  await page.addInitScript(() => {
    window.__left = 0
    document.addEventListener('proto:page-leave', (e) => {
      if (e.detail.container) window.__left++
    })
  })
  await page.goto('/taxi-test-a/')
  await navigate(page, '/taxi-test-b/')
  expect(await page.evaluate(() => window.__left)).toBe(1)
})

test('canonical link is synced', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await navigate(page, '/taxi-test-b/')
  const canonical = await page.evaluate(() =>
    document.querySelector('link[rel="canonical"]')?.href || '')
  test.skip(canonical === '', 'no canonical tag rendered (SEO plugin inactive)')
  expect(canonical).toContain('/taxi-test-b/')
})

test('focus moves to the new view after navigation', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await navigate(page, '/taxi-test-b/')
  const focused = await page.evaluate(() =>
    document.activeElement?.hasAttribute('data-taxi-view'))
  expect(focused).toBe(true)
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/sync.spec.js`
Expected: FAIL — no `proto:page-ready` events, body class unchanged.

- [ ] **Step 3: Add the sync layer to `scripts/proto-taxi.js`**

Insert immediately before the closing `})();`, after the `window.protoTaxi = { … };` assignment:

```js
  /* ----------------------------------------------------------------------
     Everything below is what Taxi does NOT do. Taxi sets document.title
     (Renderer.js:38) and nothing else outside the swapped view.
     ------------------------------------------------------------------- */

  var E = window.E;

  function liveView() {
    return document.querySelector('[data-taxi-view]');
  }

  function dispatch(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  /** Copy <body class> from the fetched document. */
  function syncBodyClass(page) {
    if (page && page.body) {
      document.body.className = page.body.className;
    }
  }

  /**
   * Replace the head tags that describe the page. Yoast and friends emit
   * these per-URL, so a stale set would report the wrong page to crawlers
   * and share sheets.
   */
  var HEAD_SELECTORS = [
    'meta[name="description"]',
    'link[rel="canonical"]',
    'meta[property^="og:"]',
    'meta[name^="twitter:"]'
  ].join(',');

  function syncHead(page) {
    if (!page || !page.head) return;

    var current = document.head.querySelectorAll(HEAD_SELECTORS);
    for (var i = 0; i < current.length; i++) {
      current[i].remove();
    }

    var incoming = page.head.querySelectorAll(HEAD_SELECTORS);
    for (var n = 0; n < incoming.length; n++) {
      document.head.appendChild(incoming[n].cloneNode(true));
    }
  }

  /**
   * The header template part never re-renders, so WordPress's
   * current-menu-item classes would stay pinned to the first page loaded.
   */
  function syncNavState(url) {
    var here = new URL(url, window.location.href).pathname.replace(/\/+$/, '');
    var links = document.querySelectorAll('.wp-block-navigation a[href]');

    for (var i = 0; i < links.length; i++) {
      var link = links[i];
      var parent = link.parentElement;
      var there;

      try {
        there = new URL(link.href, window.location.href).pathname.replace(/\/+$/, '');
      } catch (err) {
        continue;
      }

      var isCurrent = there === here;

      link.classList.toggle('current-menu-item', isCurrent);
      if (isCurrent) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }

      if (parent && parent.classList.contains('wp-block-navigation-item')) {
        parent.classList.toggle('current-menu-item', isCurrent);
        parent.classList.toggle('current_page_item', isCurrent);
      }
    }
  }

  /** Keep the admin bar's "Edit" link pointing at the page being viewed. */
  function syncAdminBar(page) {
    var current = document.getElementById('wp-admin-bar-edit');
    if (!current || !page) return;

    var incoming = page.getElementById
      ? page.getElementById('wp-admin-bar-edit')
      : page.querySelector('#wp-admin-bar-edit');

    if (incoming) {
      current.replaceWith(incoming.cloneNode(true));
    } else {
      current.remove();
    }
  }

  /**
   * Announce the new page and move focus into it, so a swap is not silent
   * for screen-reader and keyboard users.
   */
  var announcer = null;

  function announce(title) {
    if (!announcer) {
      announcer = document.createElement('div');
      announcer.className = 'proto-taxi-announcer';
      announcer.setAttribute('aria-live', 'polite');
      announcer.setAttribute('aria-atomic', 'true');
      document.body.appendChild(announcer);
    }
    announcer.textContent = title;
  }

  function focusView(container) {
    if (!container) return;
    container.setAttribute('tabindex', '-1');
    container.focus({ preventScroll: true });
  }

  E.on('NAVIGATE_OUT', function (payload) {
    var container = payload && payload.from && payload.from.renderer
      ? payload.from.renderer.content
      : liveView();

    dispatch('proto:page-leave', { container: container });
  });

  E.on('NAVIGATE_IN', function (payload) {
    if (!payload || !payload.to) return;

    var page = payload.to.page;
    syncBodyClass(page);
    syncHead(page);
    syncAdminBar(page);
    syncNavState(payload.to.finalUrl || window.location.href);
  });

  E.on('NAVIGATE_END', function (payload) {
    var container = payload && payload.to && payload.to.renderer
      ? payload.to.renderer.content
      : liveView();

    focusView(container);
    announce(document.title);

    dispatch('proto:page-ready', {
      container: container,
      url: window.location.href
    });
  });

  /* The initial page load gets the same event, so block code has exactly one
     contract to write against. */
  function readyOnLoad() {
    dispatch('proto:page-ready', {
      container: liveView(),
      url: window.location.href
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', readyOnLoad);
  } else {
    readyOnLoad();
  }
```

- [ ] **Step 4: Add the announcer style**

Append to `style.css`:

```css
/* Visually hidden live region announcing Taxi navigations. */
.proto-taxi-announcer {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0 0 0 0);
  clip-path: inset(50%);
  white-space: nowrap;
  border: 0;
}
[data-taxi-view]:focus { outline: none; }
```

- [ ] **Step 5: Run the test**

Run: `npx playwright test tests/e2e/sync.spec.js`
Expected: PASS.

- [ ] **Step 6: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add scripts/proto-taxi.js style.css tests/e2e/sync.spec.js
git commit -m "feat(taxi): sync body class, head tags, nav state, admin bar and focus"
```

---

### Task 8: Lenis and ScrollTrigger hygiene

Without this, every navigation leaves the page scrolled where the last one ended and accumulates dead ScrollTriggers pointing at removed DOM.

**Files:**
- Modify: `scripts/proto-taxi.js`
- Test: `tests/e2e/scroll.spec.js`

**Interfaces:**
- Consumes: `window.protoLenis` (from `proto-init.js`), `window.ScrollTrigger`.
- Produces: nothing new; extends existing handlers.

- [ ] **Step 1: Write the failing test**

`tests/e2e/scroll.spec.js`:

```js
const { test, expect } = require('@playwright/test')

async function navigate(page, href) {
  await page.evaluate((href) => {
    const a = document.createElement('a')
    a.href = href
    a.id = 'proto-nav'
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, href)
  await page.click('#proto-nav')
  await page.waitForFunction((h) => location.pathname === h, href)
}

test('scroll resets to the top on navigation', async ({ page }) => {
  await page.goto('/taxi-test-b/')
  await page.evaluate(() => window.protoLenis?.scrollTo(400, { immediate: true }))
  await page.waitForTimeout(200)
  await navigate(page, '/taxi-test-a/')
  await page.waitForTimeout(400)
  const y = await page.evaluate(() => window.scrollY)
  expect(y).toBeLessThan(20)
})

test('libraries are never re-executed', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__lenisRef = window.protoLenis })

  for (let i = 0; i < 5; i++) {
    await navigate(page, i % 2 === 0 ? '/taxi-test-b/' : '/taxi-test-a/')
  }

  const state = await page.evaluate(() => ({
    sameLenis: window.__lenisRef === window.protoLenis,
    lenisTags: document.querySelectorAll('script[src*="lenis"]').length,
    gsapTags: document.querySelectorAll('script[src*="gsap"]').length,
    taxiTags: document.querySelectorAll('script[src*="taxi.umd"]').length,
  }))

  expect(state).toEqual({ sameLenis: true, lenisTags: 1, gsapTags: 1, taxiTags: 1 })
})

test('ScrollTriggers do not accumulate across repeat navigations', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  const has = await page.evaluate(() => typeof window.ScrollTrigger !== 'undefined')
  test.skip(!has, 'ScrollTrigger not loaded on this page')

  await navigate(page, '/taxi-test-b/')
  await navigate(page, '/taxi-test-a/')
  const first = await page.evaluate(() => window.ScrollTrigger.getAll().length)

  await navigate(page, '/taxi-test-b/')
  await navigate(page, '/taxi-test-a/')
  const second = await page.evaluate(() => window.ScrollTrigger.getAll().length)

  expect(second).toBe(first)
})
```

- [ ] **Step 2: Run it to confirm it fails**

Run: `npx playwright test tests/e2e/scroll.spec.js`
Expected: FAIL on the scroll-reset test (page stays scrolled).

- [ ] **Step 3: Add the scroll handling**

In `scripts/proto-taxi.js`, add these helpers just above the `E.on('NAVIGATE_OUT', …)` registration:

```js
  /**
   * Kill only the ScrollTriggers whose trigger element lived inside the view
   * being removed. Triggers created by the persistent header/footer survive.
   */
  function killScrollTriggersIn(container) {
    if (!window.ScrollTrigger || !container) return;

    var all = window.ScrollTrigger.getAll();
    for (var i = 0; i < all.length; i++) {
      var trigger = all[i].trigger || all[i].vars.trigger;
      if (trigger && container.contains(trigger)) {
        all[i].kill();
      }
    }
  }
```

Then extend the existing `NAVIGATE_OUT` handler body so it reads:

```js
  E.on('NAVIGATE_OUT', function (payload) {
    var container = payload && payload.from && payload.from.renderer
      ? payload.from.renderer.content
      : liveView();

    killScrollTriggersIn(container);

    if (window.protoLenis) {
      window.protoLenis.scrollTo(0, { immediate: true });
    } else {
      window.scrollTo(0, 0);
    }

    dispatch('proto:page-leave', { container: container });
  });
```

And extend the `NAVIGATE_END` handler, adding this immediately before the `dispatch('proto:page-ready', …)` call:

```js
    /* The new content changed the document height; both libraries cache it. */
    if (window.protoLenis && typeof window.protoLenis.resize === 'function') {
      window.protoLenis.resize();
    }
    if (window.ScrollTrigger) {
      window.ScrollTrigger.refresh();
    }
```

- [ ] **Step 4: Run the test**

Run: `npx playwright test tests/e2e/scroll.spec.js`
Expected: PASS.

- [ ] **Step 5: Run the full suite**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/proto-taxi.js tests/e2e/scroll.spec.js
git commit -m "feat(taxi): reset scroll and keep ScrollTrigger clean across navigations"
```

---

### Task 9: Exclusions, reduced motion, and a clean console

**Files:**
- Test: `tests/e2e/exclusions.spec.js`

**Interfaces:**
- Consumes: link selector from Task 5, ignore marking from Task 4.
- Produces: nothing.

- [ ] **Step 1: Write the test**

`tests/e2e/exclusions.spec.js`:

```js
const { test, expect } = require('@playwright/test')

async function addLink(page, href, id, attrs = {}) {
  await page.evaluate(({ href, id, attrs }) => {
    const a = document.createElement('a')
    a.href = href
    a.id = id
    a.textContent = id
    Object.entries(attrs).forEach(([k, v]) => a.setAttribute(k, v))
    document.querySelector('[data-taxi-view] main').appendChild(a)
  }, { href, id, attrs })
}

test('wp-admin links do a full page load', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__sentinel = 'alive' })
  await addLink(page, '/wp-admin/', 'to-admin')
  await Promise.all([page.waitForLoadState('load'), page.click('#to-admin')])
  expect(await page.evaluate(() => window.__sentinel)).toBeUndefined()
})

test('data-taxi-ignore links do a full page load', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__sentinel = 'alive' })
  await addLink(page, '/taxi-test-b/', 'to-b-ignored', { 'data-taxi-ignore': '' })
  await Promise.all([page.waitForLoadState('load'), page.click('#to-b-ignored')])
  expect(await page.evaluate(() => window.__sentinel)).toBeUndefined()
})

test('hash links still scroll without navigating', async ({ page }) => {
  await page.goto('/taxi-test-a/')
  await page.evaluate(() => { window.__sentinel = 'alive' })
  await addLink(page, '#taxi-anchor', 'to-hash')
  await page.click('#to-hash')
  await page.waitForTimeout(300)
  expect(await page.evaluate(() => window.__sentinel)).toBe('alive')
})

test('reduced motion completes navigation without animation', async ({ browser }) => {
  const context = await browser.newContext({
    reducedMotion: 'reduce',
    ignoreHTTPSErrors: true,
    baseURL: process.env.PROTO_BASE_URL || 'https://cadco.local',
  })
  const page = await context.newPage()
  await page.goto('/taxi-test-a/')
  await addLink(page, '/taxi-test-b/', 'to-b')

  const start = Date.now()
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await expect(page.locator('[data-proto-block="taxi-fixture-b"]')).toBeVisible()

  expect(Date.now() - start).toBeLessThan(2000)
  const opacity = await page.evaluate(() =>
    getComputedStyle(document.querySelector('[data-taxi-view] main')).opacity)
  expect(Number(opacity)).toBe(1)
  await context.close()
})

test('no console errors across a navigation cycle', async ({ page }) => {
  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
  page.on('pageerror', (e) => errors.push(e.message))

  await page.goto('/taxi-test-a/')
  await addLink(page, '/taxi-test-b/', 'to-b')
  await page.click('#to-b')
  await page.waitForFunction(() => location.pathname === '/taxi-test-b/')
  await page.waitForTimeout(600)

  expect(errors).toEqual([])
})
```

- [ ] **Step 2: Run it**

Run: `npx playwright test tests/e2e/exclusions.spec.js`
Expected: PASS. If the hash test fails, the `:not([href^="#"])` clause in `LINKS` is being out-competed — verify `proto-init.js`'s delegated anchor handler still runs (it calls `preventDefault`, and Taxi's own handler checks `e.defaultPrevented`).

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/exclusions.spec.js
git commit -m "test(taxi): cover link exclusions, reduced motion and console cleanliness"
```

---

### Task 10: Documentation and final verification

**Files:**
- Modify: `README.md`
- Test: full suite

**Interfaces:**
- Consumes: everything.
- Produces: contributor-facing docs.

- [ ] **Step 1: Add the README section**

Insert after the "The Builder Canvas (Default Page Editor)" section:

````markdown
---

## Page Transitions (Taxi.js)

Proto-theme ships [Taxi.js](https://taxi.js.org/) 1.9.1. Same-origin links swap
the page's `<main>` in place; the header, footer, Lenis scroll instance and
intro overlay persist. The default transition is a GSAP fade, and
`prefers-reduced-motion: reduce` makes it an instant swap.

### Markup requirement

Every front-end template must wrap its `<main>` group:

```html
<div data-taxi>
  <div data-taxi-view>
    <!-- wp:group {"tagName":"main", …} --> … <!-- /wp:group -->
  </div>
</div>
```

Header and footer template parts stay **outside** the wrapper. If the wrapper is
missing, transitions are disabled and a warning is logged to the console.

### Writing blocks that survive a swap

A block's `view.js` is re-executed automatically on every navigation — the theme
stamps `data-taxi-reload` onto any script whose handle starts with
`proto-blocks-`, and Taxi re-runs it. Plain IIFE blocks need no changes.

Two exceptions need the lifecycle event instead:

- blocks declaring `viewScriptModule` (ES modules evaluate once per URL and
  cannot be re-run)
- code that must react to a navigation without owning a block script

```js
document.addEventListener('proto:page-ready', (e) => {
  // fires on initial load AND after every navigation
  init(e.detail.container)   // the [data-taxi-view] element
})

document.addEventListener('proto:page-leave', (e) => {
  teardown(e.detail.container)
})
```

### Custom transitions

```js
window.protoTaxi.addTransition('slide', class extends window.taxi.Transition {
  onLeave({ from, done }) { /* animate out, then */ done() }
  onEnter({ to, done })   { /* animate in, then */  done() }
})
```

```html
<a href="/about" data-transition="slide">About</a>
```

`window.protoTaxi.core` is the Taxi `Core` instance, for `navigateTo()`,
`preload()`, `addRoute()` and cache control.

### Which links are intercepted

Same-origin links, excluding: `wp-admin`, `wp-login`, the admin bar, `mailto:`
and `tel:`, `[download]`, hash-only links, `[target]`, `[data-taxi-ignore]`, and
WooCommerce add-to-cart buttons. Links to the WooCommerce cart, checkout and
my-account pages are marked `data-taxi-ignore` server-side. Forms always submit
with a full page load.

### PHP filters

| Filter | Purpose |
|---|---|
| `proto_taxi_enabled` | Master switch. `add_filter('proto_taxi_enabled', '__return_false');` |
| `proto_taxi_reload_handles` | Extra script handles to mark `data-taxi-reload` |
| `proto_taxi_denied_handles` | Handles that must never be re-run |
| `proto_taxi_ignore_urls` | Extra URLs whose links opt out |

### Upgrading Taxi

```bash
npm pack @unseenco/taxi@<version> && npm pack @unseenco/e@<version>
# copy dist/taxi.umd.js and dist/e.umd.js into scripts/, then bump the
# 'version' values in the $libs map in functions.php
```

### Running the E2E suite

```bash
npm install && npx playwright install chromium
./tests/fixtures/setup.sh          # creates /taxi-test-a/ and /taxi-test-b/
npm test
```

Point at another site with `PROTO_BASE_URL=https://example.test npm test`.
````

- [ ] **Step 2: Run the complete suite**

Run: `npm test`
Expected: every spec PASS. Record the summary line.

- [ ] **Step 3: Verify the release zip is still build-free**

```bash
git archive --format=tar HEAD | tar t > /tmp/proto-archive.txt
grep -E 'package.json|playwright|tests/|node_modules|docs/' /tmp/proto-archive.txt || echo "CLEAN"
grep -E 'scripts/(taxi.umd|e.umd|proto-taxi).js|inc/proto-taxi.php' /tmp/proto-archive.txt
```

Expected: `CLEAN`, followed by the four shipped files listed.

- [ ] **Step 4: Confirm the theme still activates cleanly from scratch**

```bash
cd "/Users/gustavogomez/Local Sites/cadco/app/public"
wp theme activate twentytwentyfive && wp theme activate proto-theme
wp eval 'var_dump(proto_taxi_is_enabled());'
```

Expected: no PHP notices; `bool(false)` (CLI context is admin-ish) — the front-end check is the Playwright run in Step 2.

- [ ] **Step 5: Commit and push**

```bash
git add README.md
git commit -m "docs: document Taxi page transitions"
git push -u origin feat/taxi-page-transitions
```

- [ ] **Step 6: Open the pull request**

```bash
gh pr create --title "feat: Taxi.js page transitions" --body "$(cat <<'EOF'
## Summary

Adds SPA-style page transitions to Proto-theme using @unseenco/taxi 1.9.1,
vendored as UMD dists so the theme stays build-free.

- `[data-taxi]` / `[data-taxi-view]` wrapper added to the three templates, with
  the page-shell CSS updated for the new depth and the two views stacked in one
  grid cell during a transition
- Block `view.js` scripts re-execute on every navigation: the theme stamps
  `data-taxi-reload` on `proto-blocks-*` handles and Taxi's stock reload filter
  re-runs them. Vendored libraries are explicitly denied.
- Default GSAP fade, instant under `prefers-reduced-motion`, plus
  `window.protoTaxi.addTransition()` for per-project transitions
- Syncs what Taxi does not: body class, description/canonical/og/twitter tags,
  nav active state, admin bar edit link, focus and a polite announcement
- Scroll resets through Lenis; ScrollTriggers inside the outgoing view are killed
- New `proto:page-ready` / `proto:page-leave` events for blocks that cannot be
  re-executed (notably `viewScriptModule` ES modules)
- Off switch: `add_filter('proto_taxi_enabled', '__return_false');`

## Test plan

Playwright suite in `tests/e2e/` (dev-only, `export-ignore`d from the zip):

- no document request on in-content navigation; a `window` sentinel survives
- URL, title and body class update; back/forward restore content
- fixture block re-initialises per navigation; a block present only on the
  target page loads and initialises
- wp-admin, `data-taxi-ignore` and hash links behave natively
- one Lenis instance and no ScrollTrigger accumulation after five navigations
- zero console errors

Run with `./tests/fixtures/setup.sh && npm test`.
EOF
)"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| Vendor UMD dists, enqueue chain | 2 |
| Markup contract, wrapper, console warning | 3, 5 |
| Script marking, `proto_taxi_reload_handles`, deny list, `viewScriptModule` caveat | 4, 10 |
| Body class / head tags / nav state / admin bar / a11y | 7 |
| Lenis + ScrollTrigger | 8 |
| Lifecycle events | 7 |
| Fade default, reduced motion, `addTransition` | 5, 9 |
| Link scope, Woo exclusions, `proto_taxi_enabled` | 4, 5, 9 |
| Error handling and fallbacks | 5 (guards), 9 (console clean) |
| All 10 test assertions | 1, 5, 6, 7, 8, 9 |
| File list | matches the File Structure table |

**Additions beyond the spec**, both forced by facts found while planning:

1. `style.css` page-shell selectors must change — the spec did not anticipate that `[data-taxi]` breaks `.wp-site-blocks > main` (Task 3).
2. The two views overlap during a transition because `Renderer.remove()` runs after `onEnter`; handled with grid stacking rather than absolute positioning (Task 3).

**Type consistency:** `proto:page-ready` always carries `{ container, url }` and `proto:page-leave` always carries `{ container }` in Tasks 7 and 10. `addTransition(name, TransitionClass)` is identical in Tasks 5, 9 and 10. `window.__protoInitCount` / `window.__protoInitLog` are defined in Task 1 and used unchanged in Tasks 1 and 6. `killScrollTriggersIn(container)` is defined and called only in Task 8.

**Placeholder scan:** no TBD/TODO; every code step contains complete code; the two conditional branches (Task 3 Step 6, Task 6 Step 2) state the exact check, the expected value, and the specific fallback.
