# Script reloading across page transitions

Taxi swaps only the `[data-taxi-view]` element. The header, footer, Lenis and
every script that already ran stay; nothing in the fetched page runs unless
its `<script>` tag carries `data-taxi-reload`. This document is the contract
for that attribute: who stamps it, what the loader does with it, and how to
make a third-party plugin's scripts (a form plugin, a map, a widget) survive
a swap without a full page load.

The pieces: `inc/proto-taxi.php` (which tags are stamped, server side),
`scripts/proto-taxi.js` (`reloadScripts()`, how they run, client side) and
`inc/proto-gravity-forms.php` (the first plugin integration, a worked
example).

## Two modes

| Tag | Mode | Meaning |
|---|---|---|
| `<script data-taxi-reload src=…>` | `rerun` | The file is executed again on every navigation. For code that sets up whatever is in the DOM now: a block's `view.js`. |
| `<script data-taxi-reload="once" src=…>` | `once` | The file is loaded when the document does not hold it yet, then kept. For libraries that bind themselves once: jQuery, a form plugin's runtime. Re-running those would bind every handler twice. |
| `<script data-taxi-reload>…</script>` | inline | Inline code always re-runs: localized data, a per-page nonce, a form's init. |

`once` is matched by WordPress's `{handle}-js` id first, then by `src`. The
same id with a different `src` means a deploy changed the file since this
document loaded; a document cannot hold two versions of a library, so the
page is loaded in full (console: `A library changed since this document
loaded`). ES modules are never re-run (the browser evaluates a module once
per URL): listen for `proto:page-ready` instead.

## Who stamps what (PHP)

### Enqueued handles: `proto_taxi_reload_rules`

A rule names a handle or a prefix, a mode, and whether the dependency chain
gets the same mode:

```php
add_filter('proto_taxi_reload_rules', function (array $rules) {
    $rules[] = ['prefix' => 'gform_', 'mode' => 'once', 'deps' => true];
    $rules[] = ['handle' => 'my-widget', 'mode' => 'rerun', 'deps' => false];
    return $rules;
});
```

- Built in: `['prefix' => 'proto-blocks-', 'mode' => 'rerun', 'deps' => false]`
  (Proto-Blocks registers every block's `view.js` as `proto-blocks-{name}`),
  plus one `rerun` rule per handle in the legacy `proto_taxi_reload_handles`.
- `deps` (default `true`) walks `$wp_scripts->registered[...]->deps`
  recursively, so a library arrives with its own dependencies (jQuery,
  `wp-i18n`).
- Conflicts resolve to `once`: a library that must load once for one rule
  loads once for everyone.
- `proto_taxi_once_only_handles` (`jquery`, `jquery-core`, `jquery-migrate`,
  `wp-polyfill`) can never become `rerun`, whatever rule reaches them.
- `proto_taxi_denied_handles` (the theme's own runtime: GSAP, Lenis, Taxi,
  the intro) are never stamped; the deny list wins over every rule.
- Handles ending in `-view-script` are skipped: core registers a
  `block.json` `viewScript` under that name next to Proto-Blocks' own handle
  for the same file, and only one copy should re-run.

For a covered handle the theme stamps the `<script src>` tag through
`script_loader_tag`, and the inline tags WordPress prints for it (localized
data `{handle}-js-extra`, `-js-before`, `-js-after`, `-js-translations`)
through `wp_inline_script_attributes`. Those inline tags always re-run.

### Inline scripts outside the handle system

Plugins also print raw `<script>` tags: a bootstrap on `wp_head`, per-form
init in the content or the footer. Three ways in, in order of preference:

1. **The plugin's own filter on that output.** Stamp `<script` tags that
   lack the attribute (Gravity Forms: `gform_get_form_filter`,
   `gform_footer_init_scripts_filter`; see `inc/proto-gravity-forms.php`).
   Stable API, survives plugin updates.
2. **`wp_inline_script_attributes` with a comparison against the plugin's
   own source of truth.** Gravity Forms prints its head bootstrap with
   `wp_get_inline_script_tag()`, so the filter sees the body and can compare
   it with `GFCommon::get_hooks_javascript_code(false)`.
3. **`proto_taxi_reload_inline_patterns`**: substrings of inline code
   printed through `wp_get_inline_script_tag` / `wp_print_inline_script_tag`.
   Last resort: it tracks the plugin's minified source and goes silent when
   that changes.

Scripts printed by a shortcode are stamped through `do_shortcode_tag`
(`inc/proto-cookiebot.php` does this for Cookiebot's declaration loader).

## What the loader does (JS)

`reloadScripts(page, url)` runs on Taxi's `NAVIGATE_IN`, once the new view is
in the DOM. Taxi's own loader is disabled (`reloadJsFilter` returns `false`)
so nothing runs twice.

1. **Hints first.** The moment a page's HTML arrives (`createCacheEntry`,
   which also runs for Taxi's hover/focus prefetch), every file a marked
   script needs gets a `<link rel="prefetch">` (hover) or `<link
   rel="preload" as="script">` (navigation), so downloads run in parallel
   with the transition.
2. **Document order.** Files are inserted with `async = false` (fetched in
   parallel, executed in order); an inline script waits for every file
   printed before it. Taxi's stock loader appended everything at once, and a
   dynamically inserted `<script src>` is async by default, so a chain such
   as jQuery → runtime → inline config → inline init ran in network order.
3. **One copy per slot.** A fetched tag replaces the identical live tag (the
   inert copy imported with the view, or the tag an earlier visit left),
   else the live tag with the same id outside the wrapper; otherwise it is
   appended to `<head>` or `<body>` where the fetched page had it. A clone
   remembers the markup it came from, so the DOM does not grow with visits.
4. **Clone hygiene.** `async` and `defer` are not copied (they describe
   parser behaviour), everything else is. A file that does not settle within
   10 s is skipped with a console warning and the chain continues.
5. **Hold.** The transition shows the new view only once the chain settled:
   `scriptsSettled()` (capped at 4 s) gates the fade-in, and the view is
   `inert` meanwhile, so an inline `onclick` cannot reach a global that is
   still loading. With reduced motion the view is kept hidden for the hold.
6. **Events.** `proto:scripts-ready` fires on `document` when the chain
   settled; `proto:page-ready` fires after it (Taxi's `NAVIGATE_END` waits
   for the same settle). Both carry `{ container, url }`.
7. **First document.** Taxi clones the first document when it boots, which is
   mid-parse when `proto-taxi.js` is not deferred; the clone is refreshed on
   `load` so back/forward to the landing page carries the scripts printed
   after the theme's own (a form plugin's footer init at `wp_footer` 999).

## Consent managers

A manager in auto-blocking mode (Cookiebot) watches for inserted `<script>`
elements, retypes them to `text/plain` and re-inserts its own copies, which
drops the in-order flag and the load handler the loader relies on. Clones
are therefore marked `data-cookieconsent="ignore"`, **unless** the tag they
replace was blocked by the manager on the full load (`type="text/plain"`
with a consent category): that one is cloned blocked, not awaited, and
`Cookiebot.runScripts()` is called after the chain so the manager activates
it according to the stored consent.

The policy that makes this legitimate: **rules only cover first-party and
functional scripts** (block scripts, a form runtime and its WordPress
dependencies). A consent-gated script must carry its own
`data-cookieconsent` category, which the loader preserves. Never add a rule
for an analytics or advertising handle.

## Writing scripts that re-run

A `rerun` file executes on every navigation in a document that persists.
Bind `document`/`window` listeners once behind a flag, or delegate; set up
the elements present now; clean up on `proto:page-leave`:

```js
(function () {
  if (window.__myBlockBound) return;
  window.__myBlockBound = true;
  document.addEventListener('click', function (e) { /* delegated */ }, true);
})();
```

A library whose init only runs at `DOMContentLoaded` needs a shim after a
swap (that event never fires again). Gravity Forms is the worked example:

- `inc/proto-gravity-forms.php` adds `['prefix' => 'gform_', 'mode' =>
  'once', 'deps' => true]` (and `wp-a11y`, which the plugin enqueues for
  validation announcements), stamps the per-form inline scripts through
  `gform_get_form_filter` and `gform_footer_init_scripts_filter`, recognises
  the head bootstrap by comparing it with `GFCommon::get_hooks_javascript_code()`,
  prints a one-line shim on `wp_head` that sets `gform.domLoaded` when the
  document is already loaded (otherwise `gform.initializeOnLoaded()` waits
  forever), and namespaces the footer init's `gform_post_render` handlers
  per form so repeated visits replace them instead of stacking.
- Verified flows: first Taxi visit to the form page, repeat visits,
  back/forward into a directly loaded form page, AJAX validation and
  confirmation, no duplicate libraries, no handler stacking.

## Limits

- ES modules (`viewScriptModule`, the Interactivity API) do not re-run.
- Inline scripts carrying a CSP nonce lose it when cloned (browsers blank
  the attribute); the theme ships no nonce CSP.
- A per-page value baked into a cached page (a nonce) is as old as the
  fetch; WordPress nonces last long enough for that not to matter.
- A page whose plugin cannot be made to work this way still has
  `proto_taxi_ignore_urls` (full loads for that route) and
  `data-taxi-ignore` on a link.

## Checking a page

- View source: every script that must run after a swap carries
  `data-taxi-reload` (bare or `"once"`); the libraries carry `"once"`.
- In the console after a navigation: no `[proto-taxi]` warnings; the
  globals exist at `proto:scripts-ready`.
- `document.querySelectorAll('script[data-taxi-reload]').length` stays
  flat across repeated visits to the same page.
