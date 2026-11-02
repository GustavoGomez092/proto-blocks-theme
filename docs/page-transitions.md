# Page transitions: the curtain

Taxi swaps the page without a document reload. It fades the outgoing view out,
fetches the new one, and appends it when the response lands.

The problem is the order of those steps. Taxi prefetches a page when you hover
its link, but if you click before that prefetch has returned, the outgoing view
is removed and there is nothing to put in its place yet. The document holds no
view at all until the server answers, so the reader gets an empty page for the
length of the round trip. It reads as a broken site rather than a slow one.

The curtain covers that window. It wipes closed as the old view leaves, holds
for however long the fetch takes, and wipes open once the new view is in.

Files: [`inc/proto-curtain.php`](../inc/proto-curtain.php),
[`assets/js/proto-curtain.js`](../assets/js/proto-curtain.js).

## Hooks

### `proto_curtain_enabled`

Whether the curtain runs at all. Default `true`, and already `false` whenever
page transitions are off — without Taxi every navigation is a full document
load, the browser holds the old page until the new one is ready, and there is no
gap to cover.

```php
// No curtain on the shop, where every navigation is filtered and instant.
add_filter('proto_curtain_enabled', function (bool $on): bool {
    return is_shop() ? false : $on;
});
```

### `proto_curtain_settings`

Everything else. Returns an array merged over the defaults, so you only pass
what you are changing.

```php
add_filter('proto_curtain_settings', function (array $s): array {
    $s['color']     = '#000000';
    $s['mark']      = get_theme_file_uri('assets/img/logo-mark.svg');
    $s['firstLoad'] = true;

    return $s;
});
```

| Key | Default | What it does |
|---|---|---|
| `color` | `#000000` | Panel colour. One flat colour; the wipe does the work. |
| `panels` | `5` | How many panels wipe in sequence. |
| `mark` | `''` | Optional image centred on the closed curtain. Empty leaves it plain. |
| `markWidth` | `min(180px, 38vw)` | Any CSS width. |
| `coverDuration` | `0.24` | Seconds per panel, closing. |
| `coverStagger` | `0.026` | Seconds between panels, closing. |
| `revealDuration` | `0.5` | Seconds per panel, opening. |
| `revealStagger` | `0.06` | Seconds between panels, opening. |
| `failsafe` | `8000` | Milliseconds before the curtain opens regardless. |
| `skipPrefetched` | `true` | No curtain when the page is already cached. |
| `holdOutgoing` | `true` | Keep the outgoing view solid until the curtain is closed. |
| `firstLoad` | `false` | Also cover the very first page load. |

## Four things worth knowing before you change the timing

### Closing has a deadline; opening does not

The theme's transition calls Taxi's `done()` at 0.4s and the view is removed
immediately after. A cover still on its way down at that point shows the
removal through its own gaps — which is the blank page again, just striped.

The defaults close in `0.24 + 4 × 0.026 = 0.344s`, landing the curtain before
the view goes. Raise `coverDuration` or `coverStagger` and that guarantee is
yours to re-check. Opening has no such deadline, because the page underneath is
already complete, so it keeps slower and softer timing.

### Panels, not a slab

A single block dropping over the page reads as a stall. A stagger reads as
something deliberate happening. That matters most when the thing it is hiding
is a wait of unknown length, which is the whole point of the feature.

### A prefetched page gets no curtain

Taxi caches a page on link hover, keyed by absolute URL, and the entry appears
only once the prefetch has **resolved** — an in-flight one reads as a miss. So
`cache.has()` answers exactly the right question: is this navigation going to
wait for the network at all? When it is not, the swap is immediate, and covering
it would add half a second of theatre to a transition that had none.

The destination is not carried on the `proto:page-leave` event, so it is taken
from the click that started the navigation, falling back to the address bar for
history moves. Anything that cannot be resolved counts as a miss and gets the
curtain: a needless curtain is a far smaller fault than a blank page.

Set `skipPrefetched => false` to curtain every navigation for consistency.

### The outgoing view is held, not frozen

With `holdOutgoing` on, the leaving view is pinned opaque with an `!important`
rule for as long as the curtain is closing, so it stays solid behind the panels
instead of dissolving in front of them.

The fade's own tween is deliberately **left running**. Its `onComplete` is what
calls Taxi's `done()`, so cancelling the tween would stall navigation outright.
The fade still happens; it is simply not visible.

## `firstLoad`

Off by default, because this theme already ships an intro animation and two
things covering the same first paint fight each other. Turn it on and the
curtain is printed closed at `wp_body_open`, before anything else renders, and
opens on `proto:page-ready`.

It has to be server-rendered markup rather than a JS call: `proto-curtain.js` is
a footer script, so by the time it could build a curtain the page it is meant to
be hiding has already been painted.

## When it cannot get stuck

A navigation that dies after the curtain closes would leave the site behind an
opaque panel for good — strictly worse than the blank page this replaces. That
is a real failure mode, not a hypothetical: `proto-taxi.js` documents how a
throwing listener rejects the `afterFetch` promise, so `NAVIGATE_END` — and
therefore `proto:page-ready` — never runs.

Three guards:

- **The failsafe.** After `failsafe` ms the curtain opens anyway and logs why.
- **Reveal waits for cover.** A fast response can land mid-close; opening from a
  half-closed curtain looks like a glitch, so the reveal always lets the close
  finish first.
- **Back/forward cache.** Restoring a page captured mid-navigation re-shows a
  closed curtain, so `pageshow` with `persisted` opens it.

Without GSAP the curtain still covers and uncovers, just instantly — a missing
library degrades to a plain curtain rather than to no curtain. Under
`prefers-reduced-motion` it covers and clears with no animation.

## Security

Taxi fetches the next page with the reader's cookies, parses it, and moves part
of it into the live document. `scripts/proto-taxi.js` puts three guards around
that, all at the integration layer; the vendored `taxi.umd.js` is untouched.

### What is stripped from a fetched document

Taxi parses responses with `DOMParser`, which runs with scripting *disabled*,
so the contents of every `<noscript>` come back as real elements rather than
the inert text a full load sees. Before Taxi reads anything out of the parsed
document — the view, the scripts to re-run, the stylesheets to carry over —
every `<noscript>` element is removed. Nothing is lost: by definition none of
it applies to a reader running this script.

The view is then moved into the page as nodes (`document.importNode`), not
through the stock renderer's `outerHTML` → `innerHTML` round trip, so the
markup is parsed exactly once, by the browser's own parser, the same way a full
load parses it. Stylesheets are carried over from anywhere in the fetched
document except inside `<noscript>` or `<template>`; they are not restricted to
`<head>` because WordPress prints stylesheets enqueued during render at
`wp_footer`.

`assets/js/proto-reveal-guard.js` removes a promoted no-JS fallback `<style>`
if one ever appears. With the strip above it should never fire; it stays as a
second line for a fork that swaps in its own Core or renderer.

### Which links are left alone

The following never start a transition and are never prefetched on hover or
focus. They navigate as plain links, with a full page load:

- `[data-taxi-ignore]`, `[download]`, `[target]`, `rel="nofollow"`,
  hash-only `href="#…"`, `mailto:` and `tel:`, links inside `#wpadminbar`,
  `.add_to_cart_button` and `.wc-block-components-product-button a`;
- any link whose URL contains `_wpnonce=`, `add-to-cart=`, `?action=`,
  `&action=`, `remove_item=`, `customer-logout`, `/wp-admin` or `wp-login`.

The URL list exists because WordPress protects state-changing GETs with a nonce
carried in the link itself. A hover prefetch of such a link is the action: it
sends the cookies and a valid nonce, so WooCommerce's "Log out" endpoint would
log the reader out the moment they mouse over or tab onto it.

The list is one array, `window.protoTaxi.ignoreHrefPatterns`, and one
predicate, `window.protoTaxi.isExcludedLink(anchor)`, consulted by both the
click intercept and the prefetch handler. Push to the array to exclude more at
runtime, or hand the whole list over from PHP:

```php
wp_localize_script('proto-taxi-init', 'protoTaxiSettings', [
    'ignoreHrefPatterns' => ['_wpnonce=', 'add-to-cart=', '?action=', '&action=', 'remove_item=', 'customer-logout', '/wp-admin', 'wp-login', 'my-plugin-action='],
]);
```

A localised array replaces the built-in list; a malformed one falls back to it.

### Opting a single link out

Add `data-taxi-ignore` to the anchor:

```html
<a href="/members/export/" data-taxi-ignore>Export my data</a>
```

Links to the WooCommerce cart, checkout, my-account and shop pages get the
attribute server-side (`proto_taxi_ignore_urls`).

### Unknown transitions and the watchdog

`<a data-transition="…">` naming a transition that was never registered uses
the default one; KSES allows `data-*` attributes for every role, so this is
content, not a developer error, and must not stall navigation. Independently,
a navigation that has not finished within 10 seconds (`protoTaxiSettings.watchdogMs`
to change it) has its transitioning state reset so later clicks work again; the
failure is logged.
