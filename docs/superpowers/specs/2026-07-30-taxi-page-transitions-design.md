# Taxi.js page transitions for Proto-theme

**Date:** 2026-07-30
**Status:** Design approved; pending spec review → implementation plan.

## Overview

Add SPA-style page transitions to Proto-theme using
[`@unseenco/taxi`](https://taxi.js.org/) v1.9.1. Navigations swap the page's
main content in place instead of triggering a full document load: the header,
footer, Lenis scroll instance and intro overlay persist, and the incoming
content fades in.

**Goal:** a fork of Proto-theme gets working page transitions with no setup —
including correct re-execution of Proto-Blocks block scripts on the incoming
page — while remaining a build-free theme and staying safe on a WooCommerce
site.

## Constraints

| Constraint | Consequence |
|---|---|
| Theme has no build step (vendored minified libs + window globals) | Taxi ships as vendored UMD dists, not a bundled artifact |
| `data-taxi-view` must be the sole child of `data-taxi` | Templates need a raw-HTML wrapper; block markup cannot carry data attributes |
| Block markup cannot express data attributes | `data-taxi-reload` is stamped onto script tags in PHP, not in templates |
| Taxi's `loadScripts()` scans the **whole** fetched document | The reload filter must be selective, or vendored libs re-execute |
| WooCommerce is a realistic target for forks | Cart/checkout/my-account and add-to-cart links opt out by default |

## What Taxi already does

Verified against the v1.9.1 source, not just the docs:

- `Core.loadScripts()` (`src/Core.js:337`) re-executes scripts whose `outerHTML`
  matches one already in the document, and appends scripts that are new. This
  covers both "block exists only on the incoming page" and "re-run this block's
  `view.js`".
- `Core.loadStyles()` (`src/Core.js:362`) does the same for
  `link[rel="stylesheet"]` and inline `<style>`.
- `reloadCssFilter` defaults to `() => true` — stylesheets need no configuration.
- `reloadJsFilter` defaults to `(element) => element.dataset.taxiReload !== undefined`
  — **nothing re-runs until scripts are marked.**
- `Renderer.update()` (`src/Renderer.js:38`) sets `document.title`. Nothing else
  in the document outside the view is synced.
- `enablePrefetch` defaults to `true` (prefetch on `mouseenter`/`focus`).

## Approach — vendor the official UMD dists

Considered:

- **A. Vendor `e.umd.js` + `taxi.umd.js` verbatim from npm** — chosen.
- B. Bundle Taxi and its dependency into one custom IIFE with esbuild.
- C. ESM via `wp_enqueue_script_module`.

**A**, because it matches the theme's existing convention exactly (`SplitText.min.js`
already depends on `gsap.min.js` through the same global-plus-dependency
mechanism), produces no custom artifact that has to be re-verified against
upstream, and makes upgrades a two-file copy. Confirmed against the real
package files: `dist/e.umd.js` sets `self.E`; `dist/taxi.umd.js` reads `E` and
sets `self.taxi = { Core, Renderer, Transition }`.

B was rejected because a hand-rolled bundle cannot be diffed against upstream
and must be regenerated on every upgrade. C was rejected because it would make
Taxi the only library in the theme not following the vendored-global pattern.

## Enqueue chain

Appended to the existing `$libs` map in `functions.php`:

```php
'taxi-e'    => ['file' => 'e.umd.js',      'version' => '2.5.0', 'deps' => []],
'taxi'      => ['file' => 'taxi.umd.js',   'version' => '1.9.1', 'deps' => ['proto-taxi-e']],
'taxi-init' => ['file' => 'proto-taxi.js', 'version' => '1.0.0', 'deps' => ['proto-taxi', 'proto-init']],
```

`proto-taxi-init` depends on `proto-init` so `window.protoLenis` exists before
Taxi boots.

## Markup contract

The three templates wrap their `<main>` group in raw HTML. Header and footer
template parts stay outside the wrapper and therefore persist across
navigations:

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->
<div data-taxi>
  <div data-taxi-view>
    <!-- wp:group {"tagName":"main", …} --> … <!-- /wp:group -->
  </div>
</div>
<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

`data-taxi-view` is left empty, selecting Taxi's default renderer.

If `[data-taxi]` is missing (a project overrode a template without the
wrapper), `proto-taxi.js` logs a `console.warn` and does not boot — navigation
falls back to normal full page loads.

## Script marking

`inc/proto-taxi.php` stamps `data-taxi-reload` onto Proto-Blocks view scripts
via `script_loader_tag`; Taxi's stock `reloadJsFilter` is left at its default.

Marked by default: any handle prefixed `proto-blocks-`. Proto-Blocks registers
each block's `view.js` as `proto-blocks-{name}` (`includes/Blocks/Registrar.php:185`),
so this covers every block without enumerating them.

Never marked: the vendored libraries (`proto-gsap`, `proto-scroll-trigger`,
`proto-split-text`, `proto-lottie`, `proto-lenis`, `proto-taxi-e`, `proto-taxi`),
`proto-init`, `proto-intro`, `proto-taxi-init`, and anything served from
`wp-includes/`. The deny list is applied after the allow rule, so it wins.

**Caveat — `viewScriptModule`.** Blocks declaring `viewScriptModule` in
`block.json` are ES modules. A module is evaluated once per resolved URL, so
re-appending an identical `<script type="module">` tag does not re-run it.
Those blocks must use the `proto:page-ready` event for re-initialisation.
`proto-taxi.js` documents this and the theme does not mark module scripts.

Projects adjust the set with:

```php
add_filter('proto_taxi_reload_handles', fn($handles) => [...$handles, 'my-handle']);
```

Marking in PHP rather than filtering by path in JS keeps the decision visible in
page source and keeps it addressable per script handle.

## What the theme synchronises

On each navigation, `proto-taxi.js` does what Taxi does not. The incoming
`Document` is available on the `NAVIGATE_IN` payload as `to.page`.

| Concern | Behaviour |
|---|---|
| `<body class>` | Replaced from the incoming document |
| Head tags | `meta[name=description]`, `link[rel=canonical]`, `meta[property^="og:"]`, `meta[name^="twitter:"]` replaced from the incoming document so Yoast output stays correct |
| Nav active state | `current-menu-item`, `current_page_item` and `aria-current="page"` recomputed against the new URL, since the header never re-renders |
| Lenis | `scrollTo(0, { immediate: true })` on leave; `resize()` after enter |
| ScrollTrigger | Triggers whose element was inside the outgoing view are killed before removal; `ScrollTrigger.refresh()` after enter. Header/global triggers are left alone. |
| Admin bar | The `#wp-admin-bar-edit` node is replaced from the incoming document when logged in |
| Accessibility | Focus moves to the view container (`tabindex="-1"`); the new page title is announced through a polite live region |

### Lifecycle events

- `proto:page-ready` — fires on initial load **and** after every navigation,
  with `detail.container` (the `[data-taxi-view]` element) and `detail.url`.
  This is the contract for block scripts that need idempotent init.
- `proto:page-leave` — fires before the outgoing view is removed, with
  `detail.container`.

Both are dispatched on `document`.

## Transitions

Default is a GSAP fade using the already-vendored `window.gsap`:

- leave: `opacity 1 → 0`, `y 0 → -20`, ~0.4s
- enter: `opacity 0 → 1`, `y 20 → 0`, ~0.5s

`prefers-reduced-motion: reduce` short-circuits both to an instant swap.

Projects register their own without editing theme files:

```js
window.protoTaxi.addTransition('slide', class extends window.taxi.Transition {
  onLeave({ from, done }) { /* … */ done() }
  onEnter({ to, done })   { /* … */ done() }
})
```

```html
<a href="/about" data-transition="slide">About</a>
```

`window.protoTaxi` also exposes the `Core` instance as `.core` for
`navigateTo()`, `preload()` and cache control.

## Link scope

```
a[href]:not([target]):not([href^="#"]):not([data-taxi-ignore]):not([download])
  :not([href*="/wp-admin"]):not([href*="wp-login"]):not(#wpadminbar a)
  :not(.add_to_cart_button):not(.wc-block-components-product-button a)
```

In addition, `inc/proto-taxi.php` marks links to the WooCommerce cart, checkout
and my-account pages with `data-taxi-ignore`, resolved through:

```php
add_filter('proto_taxi_ignore_urls', fn($urls) => [...$urls, home_url('/booking')]);
```

Forms are untouched — the search form and WooCommerce forms submit with normal
full page loads.

Master switch:

```php
add_filter('proto_taxi_enabled', '__return_false');
```

Taxi is enabled on the front end by default and never boots in the block editor
or on admin screens.

## Error handling and fallbacks

- Missing `[data-taxi]` wrapper → `console.warn`, no boot, native navigation.
- `window.taxi` undefined (asset failed to load) → silent no-op, native navigation.
- `window.gsap` undefined → fade degrades to an instant swap rather than
  hanging on a transition that never calls `done()`.
- A fetch failure inside Taxi falls through to a real browser navigation to the
  requested URL.
- `allowInterruption` stays at its default `false`, so rapid clicking cannot
  interleave two transitions.

## Testing

`package.json` (devDependencies only) plus `tests/e2e/` and
`playwright.config.js`, all added to `.gitattributes` as `export-ignore` so the
release zip stays build-free.

Fixtures: two blocks scaffolded with `wp proto-blocks create`, each with a
`view.js` that increments `window.__protoInitCount` and writes into its own
root. That counter is the evidence for "items load correctly".

Assertions:

1. Clicking an in-content link issues no document-level navigation request.
2. A sentinel set on `window` before navigating survives the swap.
3. URL, `document.title` and `<body class>` all update.
4. The fixture block's init counter increments once per navigation, and the
   block's DOM is present and initialised on the incoming page.
5. A block that exists only on the target page loads and initialises.
6. Browser back/forward restores the correct content and title.
7. Links to wp-admin, cart and checkout perform full page loads.
8. Zero console errors across the whole run.
9. No library re-execution after five navigations, measured concretely:
   `window.protoLenis` is identity-stable against a reference captured on first
   load; `document.querySelectorAll('script[src*="lenis"]').length === 1`; and
   `ScrollTrigger.getAll().length` after repeatedly navigating A→B→A is equal to
   its value after the first visit to A.
10. With `prefers-reduced-motion: reduce`, navigation completes without
    animation.

## Files

**New**

```
scripts/e.umd.js         vendored @unseenco/e 2.5.0 (dist/e.umd.js)
scripts/taxi.umd.js      vendored @unseenco/taxi 1.9.1 (dist/taxi.umd.js)
scripts/proto-taxi.js    boot, config, fade transition, lifecycle sync, public API
inc/proto-taxi.php       enable filter, script marking, Woo/ignore-URL marking
playwright.config.js     dev only, export-ignore
package.json             devDependencies only, export-ignore
tests/e2e/taxi.spec.js   dev only, export-ignore
```

**Modified**

```
functions.php                       enqueue chain, require inc/proto-taxi.php
templates/index.html                data-taxi wrapper
templates/page.html                 data-taxi wrapper
templates/single.html               data-taxi wrapper
style.css                           transition base styles, reduced-motion rule
README.md                           usage, filters, block-script contract
.gitattributes                      export-ignore for the new dev scaffolding
```

## Out of scope

- Transitioning form submissions.
- Route-specific transitions via `addRoute()` — the API is reachable through
  `window.protoTaxi.core`, but the theme ships no route table.
- Making WooCommerce cart/checkout work through Taxi.
