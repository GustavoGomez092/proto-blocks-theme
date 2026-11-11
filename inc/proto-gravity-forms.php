<?php
/**
 * Gravity Forms + Taxi page transitions.
 *
 * Gravity Forms prints a `gform` bootstrap in the head, enqueues its runtime
 * (jQuery, gravityforms.js, the theme framework) with localized config, and
 * prints per-form inline init (the AJAX iframe handler, gform_post_render).
 * None of that runs on a Taxi swap unless marked, so this file tells the
 * reload rules in inc/proto-taxi.php how to treat it:
 *
 *  - every `gform_*` handle and its dependency chain is `once`: loaded the
 *    first time a form page is swapped in, then kept (re-running the runtime
 *    would bind every handler twice). Its localized data (gf_global,
 *    gform_theme_config with the submission nonce) re-runs each time.
 *  - the per-form inline scripts are stamped through Gravity Forms' own
 *    filters (gform_get_form_filter for the markup and its AJAX handler,
 *    gform_footer_init_scripts_filter for the footer init), and the head
 *    bootstrap is recognised by comparing it with the code the plugin
 *    prints (GFCommon::get_hooks_javascript_code), so no pattern has to
 *    track the plugin's minified source.
 *  - `gform.domLoaded`: the bootstrap only learns the DOM is ready from a
 *    DOMContentLoaded that never fires again after a swap, and
 *    gform.initializeOnLoaded() waits for it forever. The head shim below
 *    sets the flag when the document is already loaded.
 *
 * Inert unless Gravity Forms is active.
 */

function ofx_gf_taxi_active(): bool
{
    return function_exists('gravity_form')
        && function_exists('proto_taxi_is_enabled')
        && proto_taxi_is_enabled();
}

add_filter('proto_taxi_reload_rules', function (array $rules) {
    if (!function_exists('gravity_form')) {
        return $rules;
    }

    $rules[] = ['prefix' => 'gform_', 'mode' => 'once', 'deps' => true];
    $rules[] = ['handle' => 'wp-a11y', 'mode' => 'once', 'deps' => true]; // enqueued by GF for validation announcements

    return $rules;
});

/**
 * Stamp every <script> in a form's markup or footer init that is not marked yet.
 */
function ofx_gf_stamp_scripts($form_string)
{
    if (!is_string($form_string) || '' === $form_string || !ofx_gf_taxi_active()) {
        return $form_string;
    }

    $result = preg_replace('#<script(?![^>]*data-taxi-reload)#', '<script data-taxi-reload', $form_string);

    return $result ?? $form_string;
}
add_filter('gform_get_form_filter', 'ofx_gf_stamp_scripts', 20);

/**
 * The footer init re-runs on every visit to the form's page and binds its
 * handlers on `document`, which survives swaps; namespace them per form so
 * each run replaces the previous one instead of stacking. The strings are
 * Gravity Forms' own (GFFormDisplay::get_form_init_scripts); if a release
 * changes them the handlers simply stack again, nothing breaks.
 */
add_filter('gform_footer_init_scripts_filter', function ($form_string, $form) {
    if (!is_string($form_string) || !ofx_gf_taxi_active()) {
        return $form_string;
    }

    $ns = '.proto' . (int) ($form['id'] ?? 0);
    foreach (['gform_post_render', 'gform_post_conditional_logic'] as $event) {
        $form_string = str_replace(
            "jQuery(document).on('{$event}', function",
            "jQuery(document).off('{$event}{$ns}').on('{$event}{$ns}', function",
            $form_string
        );
    }

    return ofx_gf_stamp_scripts($form_string);
}, 20, 2);

/**
 * The head bootstrap is printed through wp_get_inline_script_tag() with the
 * contents of the plugin's gforms_hooks(.min).js; recognise it by that.
 */
add_filter('wp_inline_script_attributes', function ($attributes, $data) {
    if (!is_array($attributes) || isset($attributes['data-taxi-reload']) || !is_string($data) || '' === $data) {
        return $attributes;
    }
    if (!ofx_gf_taxi_active() || !class_exists('GFCommon') || !method_exists('GFCommon', 'get_hooks_javascript_code')) {
        return $attributes;
    }

    static $bootstrap = null;
    if (null === $bootstrap) {
        $bootstrap = (string) GFCommon::get_hooks_javascript_code(false);
    }

    // WordPress hands the filter the body as printed; compare ignoring the
    // surrounding whitespace the tag adds.
    if ('' !== $bootstrap && trim($data) === trim($bootstrap)) {
        $attributes['data-taxi-reload'] = true;
    }

    return $attributes;
}, 10, 2);

add_action('wp_head', function () {
    if (!ofx_gf_taxi_active()) {
        return;
    }

    // Runs after the bootstrap (wp_head default priority). On a full load the
    // document is still parsing, so this is a no-op and Gravity Forms' own
    // DOMContentLoaded listener sets the flag; re-run after a swap the
    // document is complete and the flag is set here.
    echo wp_get_inline_script_tag(
        "if(window.gform&&document.readyState!=='loading'){gform.domLoaded=true;}",
        ['data-taxi-reload' => true]
    );
}, 100);
