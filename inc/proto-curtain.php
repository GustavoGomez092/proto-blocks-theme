<?php
/**
 * Page-transition curtain.
 *
 * Taxi fades the outgoing view out and appends the incoming one only once the
 * fetch resolves. Between those two moments the document holds no view at all,
 * so a navigation started before the hover prefetch finished leaves an empty
 * page on screen until the server answers — which reads as a broken site rather
 * than a loading one.
 *
 * The curtain covers that window: it wipes closed as the old view leaves, holds
 * for however long the fetch takes, and wipes open once the new view is in.
 *
 * Everything here is opt-out and configurable; see docs/page-transitions.md.
 */

/**
 * Whether the curtain is active for this request.
 *
 * Off without Taxi: a full document load keeps the old page on screen until the
 * new one is ready, so there is no gap to cover.
 */
function proto_curtain_is_enabled(): bool
{
    if (! function_exists('proto_taxi_is_enabled') || ! proto_taxi_is_enabled()) {
        return false;
    }

    return (bool) apply_filters('proto_curtain_enabled', true);
}

/**
 * Curtain settings, merged over the defaults.
 *
 * Timing note on `coverDuration` / `coverStagger`: closing has a deadline.
 * Taxi's transition calls done() at 0.4s and the view is removed immediately
 * after, so a cover still on its way down at that point shows the removal
 * through its own gaps. The defaults total 0.24 + 4 × 0.026 = 0.344s, which
 * lands the curtain before the view goes. Raise them and that guarantee is
 * yours to re-check. Opening has no such deadline — the page underneath is
 * already complete — so it keeps slower, softer timing.
 *
 * @return array<string, mixed>
 */
function proto_curtain_settings(): array
{
    $defaults = [
        // Panel colour. One flat colour; the wipe does the work.
        'color' => '#000000',

        // Panels wipe in sequence rather than as one slab: a stagger reads as
        // deliberate where a block reads as a stall, which matters when what it
        // hides is a wait of unknown length.
        'panels' => 5,

        // Optional image centred on the closed curtain (a logo or mark). Empty
        // leaves the curtain plain.
        'mark' => '',
        'markWidth' => 'min(180px, 38vw)',

        'coverDuration'  => 0.24,
        'coverStagger'   => 0.026,
        'revealDuration' => 0.5,
        'revealStagger'  => 0.06,

        // A navigation that dies after the curtain closes would leave the site
        // behind an opaque panel for good — strictly worse than the blank page
        // this replaces. After this many ms the curtain opens regardless.
        'failsafe' => 8000,

        // A prefetched page needs no curtain: the swap is immediate, and
        // covering it adds half a second of theatre to a transition that had
        // none. See docs/page-transitions.md for how the cache is read.
        'skipPrefetched' => true,

        // Hold the outgoing view opaque until the curtain is fully closed, so
        // it never dissolves in front of the panels.
        'holdOutgoing' => true,

        // Also cover the very first page load, lifting once the page is ready.
        // Off by default: the theme already ships an intro animation, and two
        // things covering the same first paint fight each other.
        'firstLoad' => false,
    ];

    $settings = apply_filters('proto_curtain_settings', $defaults);

    return is_array($settings) ? array_merge($defaults, $settings) : $defaults;
}

/**
 * Enqueue the curtain and hand it its settings.
 *
 * GSAP is a soft dependency: without it the script still covers and uncovers,
 * just instantly. A missing library degrades to a plain curtain rather than to
 * no curtain at all.
 */
add_action('wp_enqueue_scripts', function (): void {
    if (! proto_curtain_is_enabled()) {
        return;
    }

    $path = get_theme_file_path('assets/js/proto-curtain.js');

    if (! file_exists($path)) {
        return;
    }

    $deps = wp_script_is('proto-gsap', 'registered') ? ['proto-gsap'] : [];

    wp_enqueue_script(
        'proto-curtain',
        get_theme_file_uri('assets/js/proto-curtain.js'),
        $deps,
        (string) filemtime($path),
        true
    );

    wp_localize_script('proto-curtain', 'protoCurtainSettings', proto_curtain_settings());
}, 20);

/**
 * Paint the curtain closed before anything else renders, for `firstLoad`.
 *
 * This has to be markup rather than a JS call: proto-curtain.js is a footer
 * script, so by the time it could build a curtain the page it is meant to be
 * hiding has already been painted. Printed at wp_body_open it is the first
 * thing in the body, closed, and the script adopts it and opens it on ready.
 */
add_action('wp_body_open', function (): void {
    if (! proto_curtain_is_enabled()) {
        return;
    }

    $settings = proto_curtain_settings();

    if (empty($settings['firstLoad'])) {
        return;
    }

    $panels = max(1, (int) $settings['panels']);
    $color  = (string) $settings['color'];
    $mark   = (string) $settings['mark'];
    ?>
<div class="proto-curtain" data-proto-curtain-initial aria-hidden="true"
     style="position:fixed;inset:0;z-index:2147483000;pointer-events:auto">
    <div style="position:absolute;inset:0;display:flex">
        <?php for ($i = 0; $i < $panels; $i++) : ?>
            <div style="flex:1 1 0%;background:<?php echo esc_attr($color); ?>;transform:scaleY(1);transform-origin:top"></div>
        <?php endfor; ?>
    </div>
    <?php if ($mark !== '') : ?>
        <img src="<?php echo esc_url($mark); ?>" alt="" aria-hidden="true"
             style="position:absolute;top:50%;left:50%;width:<?php echo esc_attr((string) $settings['markWidth']); ?>;height:auto;transform:translate(-50%,-50%)" />
    <?php endif; ?>
</div>
    <?php
}, 1);
