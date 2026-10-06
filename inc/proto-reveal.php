<?php
/**
 * Scroll-reveal support.
 *
 * The theme's position on reveal animations is one rule, and it is a rule
 * because every alternative has already been tried and has already shipped a
 * bug:
 *
 *   CSS hides. JavaScript only raises opacity.
 *
 * A block that animates its contents in puts the hidden state in its own
 * stylesheet, scoped so it stops applying once the block's script owns the
 * element. The script never hides anything itself: it animates opacity, and an
 * inline style beats a stylesheet rule, so the animation simply wins while it
 * runs. Nothing is handed back and forth, so there is nothing to race.
 *
 * Hiding in JavaScript instead always flashes, because a footer script runs
 * after the browser has painted. See docs/reveal-animations.md.
 *
 * The one thing the theme has to do centrally is below.
 */

/**
 * Whether the reveal guard script is loaded for this request.
 *
 * Only relevant with Taxi on: the leak it defends against is created by the
 * page merge, and without transitions there is no merge.
 */
function proto_reveal_guard_is_enabled(): bool
{
    if (! function_exists('proto_taxi_is_enabled') || ! proto_taxi_is_enabled()) {
        return false;
    }

    return (bool) apply_filters('proto_reveal_guard_enabled', true);
}

/**
 * Load the guard.
 *
 * Proto-Blocks prints a no-JS fallback inside <noscript> that forces every
 * not-yet-revealed element visible with !important. That is correct for readers
 * without JavaScript and inert for everyone else — until Taxi parses an
 * incoming page, which it does with scripting disabled. In that mode <noscript>
 * contents parse as real elements, so merging the new page promotes the
 * fallback into the live document, where its !important overrides both the
 * block's start state and its animation.
 *
 * The visible result is a section arriving at full opacity, being hidden, and
 * then animating in — on navigation only, which is why it survives every test
 * done with a full page load.
 *
 * Priority 5 so it is in the document before any block view script that might
 * depend on the start state holding.
 */
add_action('wp_enqueue_scripts', function (): void {
    if (! proto_reveal_guard_is_enabled()) {
        return;
    }

    $path = get_theme_file_path('assets/js/proto-reveal-guard.js');

    if (! file_exists($path)) {
        return;
    }

    wp_enqueue_script(
        'proto-reveal-guard',
        get_theme_file_uri('assets/js/proto-reveal-guard.js'),
        [],
        (string) filemtime($path),
        false
    );
}, 5);
