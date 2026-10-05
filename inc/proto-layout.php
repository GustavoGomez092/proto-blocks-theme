<?php
/**
 * Scroll-runtime layout sync.
 *
 * Lenis and ScrollTrigger each cache the document's height, and neither tells
 * the other when it changes. A pinned section changes it on every page that has
 * one — ScrollTrigger inserts a spacer the size of the pinned distance, after
 * Lenis has measured — which leaves Lenis short by that distance and the end of
 * the page unreachable. A block that resizes itself does the same in miniature.
 *
 * This loads the script that keeps the two in step. It also exposes
 * window.protoLayoutChanged() for a block that changes its own height; see
 * docs/layout-changes.md.
 *
 * Opt out with the proto_layout_sync_enabled filter.
 */

/**
 * Whether the layout sync is active for this request.
 *
 * There is nothing to keep in step without Lenis, and the script is inert then
 * anyway, but skipping the request saves the file.
 */
function proto_layout_sync_is_enabled(): bool
{
    return (bool) apply_filters('proto_layout_sync_enabled', true);
}

add_action('wp_enqueue_scripts', static function (): void {
    if (! proto_layout_sync_is_enabled()) {
        return;
    }

    $path = get_template_directory() . '/assets/js/proto-layout.js';

    if (! file_exists($path)) {
        return;
    }

    /*
     * Only depend on what is actually registered. A dependency on an
     * unregistered handle makes WordPress drop the script silently, and this
     * one is written to degrade to doing nothing rather than to disappear.
     */
    $deps = array_values(array_filter(
        ['proto-gsap', 'proto-scroll-trigger', 'proto-lenis', 'proto-init'],
        static fn (string $handle): bool => wp_script_is($handle, 'registered')
    ));

    wp_enqueue_script(
        'proto-layout',
        get_template_directory_uri() . '/assets/js/proto-layout.js',
        $deps,
        (string) filemtime($path),
        true
    );
}, 20);
