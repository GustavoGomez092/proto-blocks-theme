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
 * Extra script handles re-run on every navigation (legacy form of a rule).
 *
 * Kept for back-compat: each handle becomes a `rerun` rule without
 * dependencies. New code should use proto_taxi_reload_rules.
 */
function proto_taxi_reload_handles(): array
{
    return (array) apply_filters('proto_taxi_reload_handles', []);
}

/**
 * Script reload rules.
 *
 * Taxi swaps the page view without a document reload, so no script of the
 * fetched page runs unless its tag carries `data-taxi-reload`; the theme's
 * loader (scripts/proto-taxi.js, reloadScripts()) then executes the marked
 * tags in document order. Rules decide which enqueued handles are marked
 * and how:
 *
 *   ['prefix' => 'gform_']   every handle starting with the prefix
 *   ['handle' => 'my-lib']   one handle
 *   'mode' => 'rerun'        (default) the file is re-executed on every
 *                            navigation: block view.js IIFEs that set up
 *                            whatever is in the DOM.
 *   'mode' => 'once'         the file is loaded when no script with the
 *                            same src is in the document yet, then kept:
 *                            libraries that bind themselves once (jQuery,
 *                            a form plugin's runtime). Re-running those
 *                            would bind every handler twice.
 *   'deps' => true           (default) the handle's dependency chain gets
 *                            the same mode, so the library's own
 *                            dependencies (jQuery, wp-i18n) arrive with it.
 *
 * The inline tags WordPress prints for a marked handle (localized data,
 * before/after scripts, translations) are always re-run: they carry
 * per-page values such as nonces and the current page's config.
 *
 * Proto-Blocks registers every block's view.js as `proto-blocks-{name}`
 * (Registrar.php:185), so the built-in prefix rule covers all blocks. The
 * deny list wins over every rule, so a denied handle can never be marked.
 *
 * Example, a plugin whose runtime must survive a swap:
 *
 *   add_filter('proto_taxi_reload_rules', function (array $rules) {
 *       $rules[] = ['prefix' => 'gform_', 'mode' => 'once'];
 *       return $rules;
 *   });
 */
function proto_taxi_reload_rules(): array
{
    $rules = [
        ['prefix' => 'proto-blocks-', 'mode' => 'rerun', 'deps' => false],
    ];

    foreach (proto_taxi_reload_handles() as $handle) {
        $rules[] = ['handle' => (string) $handle, 'mode' => 'rerun', 'deps' => false];
    }

    return (array) apply_filters('proto_taxi_reload_rules', $rules);
}

/**
 * Substrings that mark an inline script printed outside the handle system
 * (through wp_get_inline_script_tag / wp_print_inline_script_tag) for
 * re-running on every navigation. A plugin that prints its bootstrap or
 * per-form init with those core functions (Gravity Forms does) is covered
 * by adding a distinctive piece of that code here.
 *
 * Scripts printed by a shortcode are not inline tags in this sense: stamp
 * those through `do_shortcode_tag` (see inc/proto-cookiebot.php).
 */
function proto_taxi_reload_inline_patterns(): array
{
    return array_values(array_filter((array) apply_filters('proto_taxi_reload_inline_patterns', []), 'is_string'));
}

/**
 * Reload mode per handle (`rerun` | `once`) for the scripts of this request,
 * rules and dependency chains resolved, deny list applied.
 *
 * Memoized on the size of the enqueue queue: handles enqueued while the
 * content renders (a form plugin enqueueing from its render callback) are
 * picked up by the footer print, where the map is rebuilt.
 */
function proto_taxi_reload_map(): array
{
    global $wp_scripts;

    static $map = [];
    static $signature = null;

    if (!$wp_scripts instanceof WP_Scripts) {
        return [];
    }

    $queue = array_values(array_unique(array_merge((array) $wp_scripts->queue, (array) $wp_scripts->done)));
    $sig   = md5(implode(',', $queue));
    if ($signature === $sig) {
        return $map;
    }

    $signature = $sig;
    $map       = [];
    $denied    = proto_taxi_denied_handles();
    $onceOnly  = proto_taxi_once_only_handles();
    $rules     = proto_taxi_reload_rules();

    $skip = static function (string $handle) use ($denied): bool {
        // Core registers a block.json `viewScript` as `{block}-view-script`
        // next to Proto-Blocks' own `proto-blocks-{name}` handle for the same
        // file; only the latter is re-run, or the file would execute twice
        // per navigation.
        return in_array($handle, $denied, true) || str_ends_with($handle, '-view-script');
    };

    $match = static function (string $handle) use ($rules): ?array {
        foreach ($rules as $rule) {
            if (!is_array($rule)) {
                continue;
            }
            if (isset($rule['handle']) && $rule['handle'] === $handle) {
                return $rule;
            }
            if (isset($rule['prefix']) && $rule['prefix'] !== '' && str_starts_with($handle, (string) $rule['prefix'])) {
                return $rule;
            }
        }
        return null;
    };

    // Conflicts resolve to `once`: a library that must load once for one
    // rule must load once for everyone, or its handlers are bound twice.
    $set = static function (string $handle, string $mode) use (&$map, $onceOnly): bool {
        if (in_array($handle, $onceOnly, true)) {
            $mode = 'once';
        }
        $current = $map[$handle] ?? null;
        if ($current === $mode || $current === 'once') {
            return false;
        }
        $map[$handle] = $mode;
        return true;
    };

    $walk = static function (string $handle, string $mode) use (&$walk, $set, $skip, $wp_scripts): void {
        if ($skip($handle) || !$set($handle, $mode)) {
            return;
        }
        $registered = $wp_scripts->registered[$handle] ?? null;
        foreach ($registered ? (array) $registered->deps : [] as $dep) {
            $walk((string) $dep, $mode);
        }
    };

    foreach ($queue as $handle) {
        $rule = $match((string) $handle);
        if (!$rule || $skip((string) $handle)) {
            continue;
        }
        $mode = (($rule['mode'] ?? 'rerun') === 'once') ? 'once' : 'rerun';
        if ($rule['deps'] ?? true) {
            $walk((string) $handle, $mode);
        } else {
            $set((string) $handle, $mode);
        }
    }

    return $map;
}

/**
 * Handles that are never re-executed on a navigation whatever rule reaches
 * them: a second jQuery instance orphans every handler and plugin bound to
 * the first. A rule naming them, directly or through a dependency chain,
 * gets `once`.
 */
function proto_taxi_once_only_handles(): array
{
    return (array) apply_filters('proto_taxi_once_only_handles', [
        'jquery',
        'jquery-core',
        'jquery-migrate',
        'wp-polyfill',
    ]);
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
 *
 * Memoized per request: proto_taxi_mark_ignored_links() runs on every
 * render_block call whose content contains a link, and render_block fires for
 * nested blocks too, so the same content is re-scanned at every nesting level.
 * Without this, wc_get_page_id() + get_permalink() would run several times per
 * block. The filter still runs once, so filter callbacks see no behaviour
 * change.
 */
function proto_taxi_ignore_urls(): array
{
    static $cache = null;

    if (null !== $cache) {
        return $cache;
    }

    $urls = [];

    if (function_exists('wc_get_page_id')) {
        // 'shop' renders through WooCommerce's own archive-product block
        // template, which this theme never wraps in [data-taxi-view] (see
        // the README's Page Transitions section) — it has no wrapper for
        // Taxi to swap, so its links must stay full page loads. It's also
        // the one plugin-supplied route linked from the default navigation,
        // which is why it's handled here instead of only documented.
        foreach (['cart', 'checkout', 'myaccount', 'shop'] as $page) {
            $id = wc_get_page_id($page);
            if ($id && $id > 0) {
                $urls[] = get_permalink($id);
            }
        }
    }

    $cache = array_values(array_filter((array) apply_filters('proto_taxi_ignore_urls', $urls)));

    return $cache;
}

/**
 * Stamp `data-taxi-reload` (rerun) or `data-taxi-reload="once"` on the
 * <script src> tag of every handle the reload map covers.
 */
add_filter('script_loader_tag', function ($tag, $handle) {
    if (!proto_taxi_is_enabled()) {
        return $tag;
    }

    $mode = proto_taxi_reload_map()[$handle] ?? null;
    if (null === $mode) {
        return $tag;
    }

    // ES modules evaluate once per resolved URL, so re-appending an identical
    // tag will not re-run them; those blocks must use proto:page-ready instead.
    //
    // In practice this is belt-and-braces: Proto-Blocks registers a block's
    // viewScriptModule through WordPress's Script Modules API, and
    // WP_Script_Modules::print_script_module() prints via wp_print_script_tag()
    // without ever firing script_loader_tag — so a module tag does not reach
    // this filter today. Kept for any handle registered the classic way with an
    // explicit type="module".
    if (str_contains($tag, 'type="module"')) {
        return $tag;
    }

    // $tag can contain more than one <script> element — translations,
    // wp_add_inline_script(), and wp_localize_script() all prepend/append
    // their own <script id="..."> tags around the one with the src
    // attribute (those are stamped through wp_inline_script_attributes
    // below), and every one of them matches a plain '<script '. Mark only
    // the tag that actually carries the src, and only if it is not marked.
    $attr   = 'once' === $mode ? 'data-taxi-reload="once"' : 'data-taxi-reload';
    $result = preg_replace('#<script(?=[^>]*\ssrc=)(?![^>]*data-taxi-reload)#', '<script ' . $attr, $tag, 1);

    // preg_replace() returns null on a PCRE failure (e.g. backtrack limit) —
    // fall back to the untouched tag rather than dropping the script.
    return $result ?? $tag;
}, 10, 2);

/**
 * Stamp `data-taxi-reload` on inline scripts: the localized data, before /
 * after and translation tags WordPress prints for a covered handle (their
 * id is `{handle}-js-{extra|before|after|translations}`), and any inline
 * script whose code matches a proto_taxi_reload_inline_patterns entry.
 * Inline code always re-runs: it carries the page's own values.
 */
add_filter('wp_inline_script_attributes', function ($attributes, $data) {
    if (!proto_taxi_is_enabled() || !is_array($attributes) || isset($attributes['data-taxi-reload'])) {
        return $attributes;
    }

    $id = isset($attributes['id']) ? (string) $attributes['id'] : '';
    if ('' !== $id && preg_match('/^(.+)-js-(?:extra|before|after|translations)$/', $id, $m)) {
        if (isset(proto_taxi_reload_map()[$m[1]])) {
            $attributes['data-taxi-reload'] = true;
        }
        return $attributes;
    }

    if (is_string($data) && '' !== $data) {
        foreach (proto_taxi_reload_inline_patterns() as $pattern) {
            if ('' !== $pattern && str_contains($data, $pattern)) {
                $attributes['data-taxi-reload'] = true;
                break;
            }
        }
    }

    return $attributes;
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
    // stripos, not str_contains: the regex below is case-insensitive, so a
    // case-sensitive guard would skip markup written <A HREF="...">.
    if (!proto_taxi_is_enabled() || !is_string($content) || $content === '' || stripos($content, '<a') === false) {
        return $content;
    }

    $urls = proto_taxi_ignore_urls();
    if (empty($urls)) {
        return $content;
    }

    foreach ($urls as $url) {
        $path = wp_parse_url($url, PHP_URL_PATH);
        // Plain permalinks resolve every WooCommerce page to "/" (the real
        // identity lives in the query string), and a bare "/" would
        // substring-match every internal href on the site. Skip it.
        $path = $path ? rtrim($path, '/') : '';
        if ($path === '') {
            continue;
        }

        // Anchor the right edge of the path so "/cart" cannot match
        // "/cart-accessories/" — after the path, only an optional trailing
        // slash followed by the closing quote, a query string, or a
        // fragment is allowed.
        $result = preg_replace_callback(
            '#<a\s+([^>]*href=["\'][^"\']*' . preg_quote($path, '#') . '(?:/)?(?=["\'?\#])[^"\']*["\'][^>]*)>#i',
            static function ($m) {
                return str_contains($m[1], 'data-taxi-ignore')
                    ? $m[0]
                    : '<a ' . $m[1] . ' data-taxi-ignore>';
            },
            $content
        );

        // preg_replace_callback() returns null on a PCRE failure (e.g.
        // backtrack limit) — fall back to the content as it stood before
        // this URL's pass rather than blanking the whole block.
        $content = $result ?? $content;
    }

    return $content;
}

/**
 * Expose the link-exclusion list and the transition watchdog to proto-taxi.js.
 *
 * The script ships with the same defaults, so this is only needed to extend
 * the list from a fork (`proto_taxi_ignore_href_patterns`). Links matching a
 * pattern are never prefetched on hover/focus and never transitioned: a
 * credentialed prefetch of `?_wpnonce=` or `?add-to-cart=` would otherwise
 * perform the action (log out, fill the cart) just by hovering the link.
 */
add_action('wp_enqueue_scripts', function () {
    if (!proto_taxi_is_enabled() || !wp_script_is('proto-taxi-init', 'enqueued')) {
        return;
    }

    $patterns = array_values(array_filter((array) apply_filters('proto_taxi_ignore_href_patterns', [
        '_wpnonce=', 'add-to-cart=', '?action=', '&action=', 'remove_item=', 'customer-logout', '/wp-admin', 'wp-login',
    ]), 'is_string'));

    $settings = [
        'ignoreHrefPatterns' => $patterns,
        'watchdogMs'         => max(1000, (int) apply_filters('proto_taxi_watchdog_ms', 10000)),
    ];

    wp_add_inline_script(
        'proto-taxi-init',
        'window.protoTaxiSettings = ' . wp_json_encode($settings, JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) . ';',
        'before'
    );
}, 20);
