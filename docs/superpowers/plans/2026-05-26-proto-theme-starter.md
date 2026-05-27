# Proto-theme Starter — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `proto-theme`, a brand-free, batteries-included WordPress block-theme starter for Proto-Blocks development, as a local-only sibling of the OIT theme.

**Architecture:** Hybrid — author lean, `proto_`/`proto-`-prefixed PHP/CSS/JS/config; reuse OIT's proven vendored assets verbatim (GSAP/Lenis/Lottie libs, builder-canvas editor JS/CSS, intro JS + `intro.json`), generalized. Builder canvas is the default page template (`page.html`); TGMPA requires the support plugins.

**Tech Stack:** WordPress 6.9+ block theme, FSE templates (HTML), Proto-Blocks plugin (server-side Tailwind), TGM-Plugin-Activation, vanilla JS libs (GSAP, Lenis, Lottie).

**Paths:** Source theme = `wp-content/themes/optimizedit` (`$SRC`). Target = `wp-content/themes/proto-theme` (`$DST`). Both absolute under `…/optimizedit/app/public/wp-content/themes/`.

**Conventions for every "verify" step:** PHP files → `php -l <file>` (expect "No syntax errors"); JSON → `php -r 'echo json_decode(file_get_contents("x"))?"OK":"ERR";'`; JS → `node --check <file>`. The theme must never be committed to the OIT or Proto-Blocks repos (local-only). No Claude/Anthropic attribution anywhere.

---

## Task 1: Scaffold directory + theme.json

**Files:**
- Create: `$DST/theme.json`
- (dirs) `$DST/{inc,assets/editor,assets/img,assets/lottie,scripts,parts,templates,proto-blocks,.github/workflows,docs/superpowers/specs,docs/superpowers/plans}`

- [ ] **Step 1: Create the directory tree**

```bash
DST="…/wp-content/themes/proto-theme"
mkdir -p "$DST"/{inc,assets/editor,assets/img,assets/lottie,scripts,parts,templates,proto-blocks,.github/workflows}
# docs/ already exists (spec lives there)
```

- [ ] **Step 2: Write `theme.json`** (generic; no customTemplates — page.html/single.html/index.html cover everything)

```json
{
	"$schema": "https://schemas.wp.org/wp/6.9/theme.json",
	"version": 3,
	"settings": {
		"appearanceTools": true,
		"layout": { "contentSize": "720px", "wideSize": "1080px" },
		"spacing": { "units": [ "%", "px", "em", "rem", "vh", "vw" ] },
		"typography": {
			"fontFamilies": [
				{ "fontFamily": "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif", "name": "System", "slug": "system" },
				{ "fontFamily": "'Inter', ui-sans-serif, system-ui, sans-serif", "name": "Inter", "slug": "inter" }
			]
		},
		"useRootPaddingAwareAlignments": true
	},
	"templateParts": [
		{ "area": "header", "name": "header" },
		{ "area": "footer", "name": "footer" }
	]
}
```

- [ ] **Step 3: Verify** — `php -r 'echo json_decode(file_get_contents("'$DST'/theme.json"))?"OK\n":"ERR\n";'` → `OK`.

---

## Task 2: `style.css` (theme header + minimal generics)

**Files:** Create `$DST/style.css`

- [ ] **Step 1: Write `style.css`** — header + only the generic, brand-free rules worth keeping (intro overlay, Proto-Blocks list-marker restore inside scope, spacer block-gap fix). No `.oit-btn`, breadcrumb, or wordmark styles.

```css
/*
Theme Name: Proto-theme
Theme URI:
Author:
Author URI:
Description: A batteries-included block-theme starter for Proto-Blocks development.
Requires at least: 6.9
Tested up to: 6.9
Requires PHP: 8.0
Version: 1.0.0
License: GNU General Public License v2 or later
License URI: http://www.gnu.org/licenses/gpl-2.0.html
Text Domain: proto-theme
Tags: block-theme, full-site-editing, proto-blocks
*/

/* Optional web font — swap or remove. */
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap");

/* ------------------------------------------------------------------------
   Intro overlay (once-per-session preloader). Markup is injected at
   wp_body_open by functions.php; play/fade logic in scripts/proto-intro.js.
   ------------------------------------------------------------------- */
.proto-intro {
  position: fixed;
  inset: 0;
  z-index: 999999;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #ffffff;
  transition: opacity 600ms ease;
}
.proto-intro.is-hidden { opacity: 0; pointer-events: none; }
.proto-intro__lottie { width: 200px; height: 200px; }
.proto-intro-skip .proto-intro { display: none !important; }

/* ------------------------------------------------------------------------
   Proto-Blocks: the scoped Tailwind preflight resets ol/ul markers inside
   .proto-blocks-scope. Restore them for the core List block, and stop
   Spacer blocks inheriting the flow block-gap margin (exact heights).
   ------------------------------------------------------------------- */
.proto-blocks-scope ol.wp-block-list,
.proto-blocks-scope ul.wp-block-list { margin: 0 0 1em; padding-left: 1.5em; }
.proto-blocks-scope ol.wp-block-list { list-style: decimal; }
.proto-blocks-scope ul.wp-block-list { list-style: disc; }
.is-layout-flow > .wp-block-spacer { margin-block-start: 0; margin-block-end: 0; }
```

- [ ] **Step 2: Verify** — `head -16 "$DST/style.css" | grep -E "Theme Name: Proto-theme|Text Domain: proto-theme"` returns both lines.

---

## Task 3: `tailwind-theme.css` (neutral placeholder tokens)

**Files:** Create `$DST/tailwind-theme.css`

- [ ] **Step 1: Write neutral, brand-free tokens** (read by Proto-Blocks Tailwind via `proto_blocks_theme_css_path`; this is the @theme token surface devs customize).

```css
/*
 * Proto-theme Tailwind tokens (Tailwind v4 @theme).
 * NEUTRAL placeholders — replace with your brand. Each --color-*, --font-*,
 * --text-*, --shadow-* becomes a utility (bg-ink, font-display, text-h2, …).
 */
@theme {
  /* Colors — grayscale ramp + one neutral accent placeholder. */
  --color-ink:       #111111;
  --color-gray-900:  #1a1a1a;
  --color-gray-700:  #3b3b3b;
  --color-gray-500:  #6b6b6b;
  --color-gray-300:  #c9c9c9;
  --color-gray-100:  #ededed;
  --color-paper:     #ffffff;
  --color-accent:    #2563eb; /* placeholder accent — change me */

  /* Fonts. */
  --font-sans:    "Inter", ui-sans-serif, system-ui, sans-serif;
  --font-display: "Inter", ui-sans-serif, system-ui, sans-serif;

  /* Type scale. */
  --text-h1: 48px;
  --text-h2: 36px;
  --text-h3: 28px;
  --text-body-lg: 20px;
  --text-body-md: 16px;
  --text-body-sm: 14px;

  /* Shadow. */
  --shadow-soft: 0 6px 16px rgba(0,0,0,0.08);
}
```

- [ ] **Step 2: Verify** — file exists, contains `@theme {` and no `#D1001D`/`Space Grotesk` (`! grep -qE "D1001D|Space Grotesk" "$DST/tailwind-theme.css" && echo CLEAN`).

---

## Task 4: Vendored scripts (copy libs verbatim, generalize theme JS)

**Files:**
- Copy: `$SRC/scripts/{gsap.min.js,ScrollTrigger.min.js,SplitText.min.js,lenis.min.js,lottie_light.min.js}` → `$DST/scripts/`
- Create: `$DST/scripts/proto-init.js` (from `oit-init.js`), `$DST/scripts/proto-intro.js` (from `oit-intro.js`)
- Do NOT copy `oit-nav-animation.js`.

- [ ] **Step 1: Copy the library files verbatim**

```bash
cp "$SRC"/scripts/{gsap.min.js,ScrollTrigger.min.js,SplitText.min.js,lenis.min.js,lottie_light.min.js} "$DST"/scripts/
```

- [ ] **Step 2: Create `proto-init.js` from `oit-init.js`, renaming class/identifier prefixes**

```bash
sed -e 's/oit-/proto-/g' -e 's/oit_/proto_/g' "$SRC/scripts/oit-init.js" > "$DST/scripts/proto-init.js"
```
Then open `$DST/scripts/proto-init.js` and confirm it only sets up Lenis smooth scroll (no OIT-specific selectors remain). If it references removed blocks, delete those branches.

- [ ] **Step 3: Create `proto-intro.js` from `oit-intro.js`, renaming prefixes**

```bash
sed -e 's/oit-/proto-/g' -e 's/oit_/proto_/g' "$SRC/scripts/oit-intro.js" > "$DST/scripts/proto-intro.js"
```
Confirm it targets `.proto-intro` / `.proto-intro__lottie`, reads `data-lottie-url`, plays the Lottie (renderer `svg`), fades out (`.is-hidden`), and toggles Lenis via `window.__protoLenis` (or whatever `proto-init.js` exposes — keep the two files' handshake consistent; rename the global in BOTH if it was `window.__oitLenis`).

- [ ] **Step 4: Verify** — `for f in "$DST"/scripts/proto-*.js; do node --check "$f" && echo "$f ok"; done`; `! grep -rl "oit" "$DST"/scripts/proto-*.js && echo "no oit refs"`.

---

## Task 5: Builder-canvas editor assets (generalize to pages)

**Files:**
- Create: `$DST/assets/editor/builder-canvas.css` (from OIT, rename class)
- Create: `$DST/assets/editor/builder-canvas.js` (from OIT, generalize trigger)

- [ ] **Step 1: `builder-canvas.css`** — same rules, class `oit-builder-canvas` → `proto-builder-canvas`

```bash
sed 's/oit-builder-canvas/proto-builder-canvas/g' "$SRC/assets/editor/builder-canvas.css" > "$DST/assets/editor/builder-canvas.css"
```
Expected result:
```css
body.proto-builder-canvas .editor-visual-editor__post-title-wrapper,
body.proto-builder-canvas .wp-block-post-title,
body.proto-builder-canvas .editor-post-title,
body.proto-builder-canvas .editor-post-title__input {
	display: none !important;
}
```

- [ ] **Step 2: `builder-canvas.js`** — generalize: trigger on `postType === 'page'` only; body class `proto-builder-canvas`; panel name `proto-builder-canvas`, title "Page Title". Replace the OIT `BUILDER_TEMPLATE`/`BUILDER_POST_TYPES` logic.

Write `$DST/assets/editor/builder-canvas.js` (full file):

```javascript
/**
 * Proto-theme — builder canvas editor enhancement.
 *
 * Pages use the builder canvas (page.html) by default, so on any `page`
 * we hide WordPress's default post-title input from the canvas and add a
 * "Page Title" panel to the document sidebar. The title still lives in
 * the DB (slug, menus, breadcrumbs, SEO, browser tab keep working).
 */
( function () {
	var plugins = window.wp && window.wp.plugins;
	var components = window.wp && window.wp.components;
	var data = window.wp && window.wp.data;
	var element = window.wp && window.wp.element;
	var i18n = window.wp && window.wp.i18n;

	var PluginDocumentSettingPanel =
		( window.wp.editor && window.wp.editor.PluginDocumentSettingPanel ) ||
		( window.wp.editPost && window.wp.editPost.PluginDocumentSettingPanel );

	if ( ! plugins || ! components || ! data || ! element || ! i18n || ! PluginDocumentSettingPanel ) {
		return;
	}

	var registerPlugin = plugins.registerPlugin;
	var TextControl = components.TextControl;
	var useSelect = data.useSelect;
	var useDispatch = data.useDispatch;
	var el = element.createElement;
	var useEffect = element.useEffect;
	var __ = i18n.__;

	var BUILDER_POST_TYPES = [ 'page' ];
	var BODY_CLASS = 'proto-builder-canvas';

	function setClassOn( node, on ) {
		if ( node && node.classList ) { node.classList.toggle( BODY_CLASS, on ); }
	}
	function syncBodies( on ) {
		setClassOn( document.body, on );
		var iframe = document.querySelector( 'iframe[name="editor-canvas"]' );
		if ( ! iframe ) { return; }
		try { setClassOn( iframe.contentDocument && iframe.contentDocument.body, on ); } catch ( e ) {}
	}

	function ProtoBuilderCanvasPanel() {
		var state = useSelect( function ( select ) {
			var editor = select( 'core/editor' );
			return {
				title: editor.getEditedPostAttribute( 'title' ) || '',
				postType: editor.getCurrentPostType() || '',
			};
		}, [] );
		var editPost = useDispatch( 'core/editor' ).editPost;
		var isBuilder = BUILDER_POST_TYPES.indexOf( state.postType ) !== -1;

		useEffect( function () {
			syncBodies( isBuilder );
			if ( ! isBuilder ) { return undefined; }
			var observer = new MutationObserver( function () { syncBodies( true ); } );
			observer.observe( document.body, { childList: true, subtree: true } );
			return function () { observer.disconnect(); syncBodies( false ); };
		}, [ isBuilder ] );

		if ( ! isBuilder ) { return null; }

		return el(
			PluginDocumentSettingPanel,
			{ name: 'proto-builder-canvas', title: __( 'Page Title', 'proto-theme' ), className: 'proto-builder-canvas-panel' },
			el( TextControl, {
				label: __( 'Title', 'proto-theme' ),
				value: state.title,
				onChange: function ( next ) { editPost( { title: next } ); },
				help: __( 'Hidden from the canvas on pages. Still used for the slug, menus, browser tab, and SEO.', 'proto-theme' ),
			} )
		);
	}

	registerPlugin( 'proto-builder-canvas', { render: ProtoBuilderCanvasPanel } );
} )();
```

- [ ] **Step 3: Verify** — `node --check "$DST/assets/editor/builder-canvas.js"`; `grep -q "BUILDER_POST_TYPES = \[ 'page' \]" "$DST/assets/editor/builder-canvas.js" && echo ok`; `! grep -q "oit" "$DST/assets/editor/builder-canvas.js" && echo "no oit refs"`.

---

## Task 6: Templates + parts

**Files:**
- Create: `$DST/templates/{index.html,page.html,single.html}`
- Copy: `$SRC/parts/{header.html,footer.html}` → `$DST/parts/` (already generic; only fix the footer text)

- [ ] **Step 1: Copy + tidy parts**

```bash
cp "$SRC/parts/header.html" "$DST/parts/header.html"
cp "$SRC/parts/footer.html" "$DST/parts/footer.html"
```
Edit `$DST/parts/footer.html`: change the paragraph to a neutral `© <site title>` or leave "Proudly Powered by WordPress". No OIT references exist in either part.

- [ ] **Step 2: `page.html`** — the builder canvas, default for all pages

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->

<!-- wp:group {"tagName":"main","align":"full","style":{"spacing":{"padding":{"top":"0","right":"0","bottom":"0","left":"0"},"margin":{"top":"0","bottom":"0"}}},"layout":{"type":"default"}} -->
<main class="wp-block-group alignfull" style="margin-top:0;margin-bottom:0;padding-top:0;padding-right:0;padding-bottom:0;padding-left:0">
	<!-- wp:post-content {"align":"full","layout":{"type":"default"}} /-->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

- [ ] **Step 3: `single.html`** — generic single post WITH a rendered title (posts are not builder-canvas)

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->

<!-- wp:group {"tagName":"main","align":"full","layout":{"type":"constrained"}} -->
<main class="wp-block-group alignfull">
	<!-- wp:post-title {"level":1} /-->
	<!-- wp:post-content {"layout":{"type":"constrained"}} /-->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

- [ ] **Step 4: `index.html`** — required fallback (blog index)

```html
<!-- wp:template-part {"slug":"header","tagName":"header"} /-->

<!-- wp:group {"tagName":"main","align":"full","layout":{"type":"constrained"}} -->
<main class="wp-block-group alignfull">
	<!-- wp:query {"queryId":0,"query":{"perPage":10,"pages":0,"offset":0,"postType":"post","order":"desc","orderBy":"date","inherit":true}} -->
	<div class="wp-block-query">
		<!-- wp:post-template -->
			<!-- wp:post-title {"isLink":true,"level":2} /-->
			<!-- wp:post-excerpt /-->
		<!-- /wp:post-template -->
		<!-- wp:query-pagination -->
			<!-- wp:query-pagination-previous /-->
			<!-- wp:query-pagination-numbers /-->
			<!-- wp:query-pagination-next /-->
		<!-- /wp:query-pagination -->
	</div>
	<!-- /wp:query -->
</main>
<!-- /wp:group -->

<!-- wp:template-part {"slug":"footer","tagName":"footer"} /-->
```

- [ ] **Step 5: Verify** — all four files exist; `! grep -rl "oit\|oit_resource" "$DST/templates" "$DST/parts" && echo "no oit refs"`.

---

## Task 7: assets (favicon + intro animation)

**Files:**
- Create: `$DST/assets/img/favicon.svg` (generic placeholder)
- Copy: `$SRC/assets/lottie/intro.json` → `$DST/assets/lottie/intro.json`
- Do NOT copy circuit.svg/quote.svg/circuit.json.

- [ ] **Step 1: Generic favicon** — write `$DST/assets/img/favicon.svg`

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="6" fill="#111111"/><rect x="8" y="8" width="16" height="16" rx="3" fill="none" stroke="#ffffff" stroke-width="2"/></svg>
```

- [ ] **Step 2: Copy the intro animation (swappable default)**

```bash
cp "$SRC/assets/lottie/intro.json" "$DST/assets/lottie/intro.json"
```

- [ ] **Step 3: Verify** — both files exist; `php -r 'echo json_decode(file_get_contents("'$DST'/assets/lottie/intro.json"))?"json ok\n":"ERR\n";'`.

---

## Task 8: `functions.php` (lean, proto_-prefixed)

**Files:** Create `$DST/functions.php`

- [ ] **Step 1: Write `functions.php`** (full file)

```php
<?php
/**
 * Proto-theme functions.
 */

require_once get_stylesheet_directory() . '/inc/proto-required-plugins.php';

add_action('after_setup_theme', function () {
    register_nav_menus([
        'primary' => __('Primary Navigation', 'proto-theme'),
        'footer'  => __('Footer Navigation', 'proto-theme'),
    ]);
    add_editor_style('style.css');
});

// Proto-Blocks inserter category.
add_filter('proto_blocks_category_slug', fn() => 'proto');
add_filter('proto_blocks_category_title', fn() => __('Proto Blocks', 'proto-theme'));

// SVG favicon (theme-owned, survives Customizer changes).
add_action('wp_head', function () {
    $path = get_stylesheet_directory() . '/assets/img/favicon.svg';
    if (!file_exists($path)) { return; }
    printf(
        '<link rel="icon" type="image/svg+xml" href="%s?v=%s">' . "\n",
        esc_url(get_stylesheet_directory_uri() . '/assets/img/favicon.svg'),
        esc_attr(filemtime($path))
    );
}, 1);

// Theme stylesheet for front end AND the block-editor canvas iframe.
add_action('enqueue_block_assets', function () {
    $style = get_stylesheet_directory() . '/style.css';
    wp_enqueue_style('proto-theme', get_stylesheet_uri(), [], file_exists($style) ? filemtime($style) : false);
});

// Builder-canvas editor CSS (inside the iframe) — admin only.
add_action('enqueue_block_assets', function () {
    if (!is_admin()) { return; }
    $css = get_stylesheet_directory() . '/assets/editor/builder-canvas.css';
    if (!file_exists($css)) { return; }
    wp_enqueue_style('proto-builder-canvas', get_stylesheet_directory_uri() . '/assets/editor/builder-canvas.css', [], filemtime($css));
});

// Builder-canvas editor JS (outer chrome — sidebar Page Title panel).
add_action('enqueue_block_editor_assets', function () {
    $js = get_stylesheet_directory() . '/assets/editor/builder-canvas.js';
    if (!file_exists($js)) { return; }
    wp_enqueue_script(
        'proto-builder-canvas',
        get_stylesheet_directory_uri() . '/assets/editor/builder-canvas.js',
        ['wp-plugins', 'wp-edit-post', 'wp-editor', 'wp-components', 'wp-data', 'wp-element', 'wp-i18n'],
        filemtime($js),
        true
    );
});

// Front-end animation libraries (self-hosted; expose window globals).
add_action('wp_enqueue_scripts', function () {
    $dir = get_stylesheet_directory() . '/scripts';
    $url = get_stylesheet_directory_uri() . '/scripts';
    $libs = [
        'gsap'           => ['file' => 'gsap.min.js',          'version' => '3.15.0', 'deps' => []],
        'split-text'     => ['file' => 'SplitText.min.js',     'version' => '3.15.0', 'deps' => ['proto-gsap']],
        'scroll-trigger' => ['file' => 'ScrollTrigger.min.js', 'version' => '3.15.0', 'deps' => ['proto-gsap']],
        'lottie'         => ['file' => 'lottie_light.min.js',  'version' => '5.13.0', 'deps' => []],
        'lenis'          => ['file' => 'lenis.min.js',         'version' => '1.1.13', 'deps' => []],
        'init'           => ['file' => 'proto-init.js',        'version' => '1.0.0',  'deps' => ['proto-lenis']],
        'intro'          => ['file' => 'proto-intro.js',       'version' => '1.0.0',  'deps' => ['proto-init', 'proto-lottie']],
    ];
    foreach ($libs as $handle => $lib) {
        $path = $dir . '/' . $lib['file'];
        if (!file_exists($path)) { continue; }
        wp_enqueue_script('proto-' . $handle, $url . '/' . $lib['file'], $lib['deps'], $lib['version'] . '.' . filemtime($path), true);
    }
});

// Once-per-session intro overlay.
add_action('wp_head', function () {
    if (is_admin()) { return; }
    ?>
    <script>(function(){try{if(sessionStorage.getItem('protoIntroShown')==='true'){document.documentElement.classList.add('proto-intro-skip');}else{document.documentElement.classList.add('proto-intro-pending');}}catch(e){}})();</script>
    <noscript><style>.proto-intro{display:none !important;}</style></noscript>
    <?php
}, 1);

add_action('wp_body_open', function () {
    if (is_admin()) { return; }
    $path = get_stylesheet_directory() . '/assets/lottie/intro.json';
    $url  = get_stylesheet_directory_uri() . '/assets/lottie/intro.json';
    $attr = file_exists($path) ? ' data-lottie-url="' . esc_url($url) . '"' : '';
    ?>
    <div class="proto-intro"<?php echo $attr; ?> aria-hidden="true" role="presentation">
        <div class="proto-intro__lottie"></div>
    </div>
    <?php
});
```

- [ ] **Step 2: Verify** — `php -l "$DST/functions.php"`; `grep -c "proto-" "$DST/functions.php"`; `! grep -qE "oit|gravity|GFAPI|resources|oit_social" "$DST/functions.php" && echo "no oit/GF refs"`.

NOTE: `proto-intro.js` (Task 4) must read `sessionStorage('protoIntroShown')` and the `proto-intro-skip`/`proto-intro-pending` classes — confirm the sed rename produced those exact keys; if the OIT original used `introShown`, change it to `protoIntroShown` in proto-intro.js for consistency with the head script above.

---

## Task 9: TGMPA — library + required-plugins registration

**Files:**
- Create: `$DST/inc/class-tgm-plugin-activation.php` (downloaded)
- Create: `$DST/inc/proto-required-plugins.php`

- [ ] **Step 1: Download the TGMPA library (v2.6.1 stable)**

```bash
curl -fsSL "https://raw.githubusercontent.com/TGMPA/TGM-Plugin-Activation/2.6.1/class-tgm-plugin-activation.php" -o "$DST/inc/class-tgm-plugin-activation.php"
php -l "$DST/inc/class-tgm-plugin-activation.php"
```
Expected: "No syntax errors detected". (If the 2.6.1 tag 404s, fall back to the `develop` branch path and pin the commit.)

- [ ] **Step 2: Write `proto-required-plugins.php`** (full file)

```php
<?php
/**
 * Required / recommended plugins via TGM Plugin Activation.
 *
 * - Required (wp.org): Safe SVG, Yoast SEO, Duplicate Post.
 * - Required (GitHub): Proto-Blocks — the theme's reason for existing.
 * - Recommended (deactivatable while developing): Wordfence.
 */

defined('ABSPATH') || exit;

require_once get_stylesheet_directory() . '/inc/class-tgm-plugin-activation.php';

/**
 * Resolve the download URL of the LATEST Proto-Blocks release.
 *
 * Queries the GitHub Releases API for the newest published, non-prerelease
 * release (`/releases/latest`) and returns its first `.zip` asset's
 * download URL, so the theme always pulls the current version without anyone
 * hand-editing a version-pinned URL. The result is cached in a 12h transient
 * (GitHub's unauthenticated limit is 60 req/hr). On any failure it returns a
 * pinned fallback so installation still works offline / when rate-limited.
 */
function proto_protoblocks_zip_url(): string {
    $cached = get_transient('proto_protoblocks_zip_url');
    if (is_string($cached) && $cached !== '') {
        return $cached;
    }

    // Pinned fallback — only used if the API is unreachable. Refresh
    // occasionally (see README "Updating Proto-Blocks"); not urgent.
    $fallback = 'https://github.com/GustavoGomez092/Proto-Blocks/releases/download/v2.3.1/proto-blocks-2.3.1.zip';

    $res = wp_remote_get('https://api.github.com/repos/GustavoGomez092/Proto-Blocks/releases/latest', [
        'timeout' => 8,
        'headers' => [
            'Accept'     => 'application/vnd.github+json',
            'User-Agent' => 'proto-theme',
        ],
    ]);
    if (is_wp_error($res) || (int) wp_remote_retrieve_response_code($res) !== 200) {
        return $fallback;
    }

    $data = json_decode(wp_remote_retrieve_body($res), true);
    $url  = '';
    if (!empty($data['assets']) && is_array($data['assets'])) {
        foreach ($data['assets'] as $asset) {
            if (!empty($asset['name']) && substr($asset['name'], -4) === '.zip' && !empty($asset['browser_download_url'])) {
                $url = $asset['browser_download_url'];
                break;
            }
        }
    }
    if ($url === '') {
        return $fallback;
    }

    set_transient('proto_protoblocks_zip_url', $url, 12 * HOUR_IN_SECONDS);
    return $url;
}

add_action('tgmpa_register', 'proto_register_required_plugins');

function proto_register_required_plugins() {
    $plugins = [
        [
            'name'     => 'Safe SVG',
            'slug'     => 'safe-svg',
            'required' => true,
        ],
        [
            'name'     => 'Yoast SEO',
            'slug'     => 'wordpress-seo',
            'required' => true,
        ],
        [
            'name'     => 'Yoast Duplicate Post',
            'slug'     => 'duplicate-post',
            'required' => true,
        ],
        [
            // Not on wp.org — always fetched from the latest GitHub release
            // (URL resolved + cached by proto_protoblocks_zip_url()).
            'name'         => 'Proto-Blocks',
            'slug'         => 'proto-blocks',
            'source'       => proto_protoblocks_zip_url(),
            'required'     => true,
            'external_url' => 'https://github.com/GustavoGomez092/Proto-Blocks',
        ],
        [
            'name'     => 'Wordfence Security',
            'slug'     => 'wordfence',
            'required' => false, // suggested; can be deactivated while developing
        ],
    ];

    $config = [
        'id'           => 'proto-theme',
        'default_path' => '',
        'menu'         => 'proto-install-plugins',
        'parent_slug'  => 'themes.php',
        'capability'   => 'edit_theme_options',
        'has_notices'  => true,
        'dismissable'  => true,
        'is_automatic' => true, // activate after install
        'message'      => '',
    ];

    tgmpa($plugins, $config);
}
```

- [ ] **Step 3: Verify** — `php -l "$DST/inc/proto-required-plugins.php"`; `grep -c "'slug' *=> *'\(safe-svg\|wordpress-seo\|duplicate-post\|proto-blocks\|wordfence\)'" "$DST/inc/proto-required-plugins.php"` → `5`; `grep -q "function proto_protoblocks_zip_url" "$DST/inc/proto-required-plugins.php" && echo "resolver present"`.

- [ ] **Step 4 (optional sanity): the resolver returns a real zip URL** — confirm `/releases/latest` currently exposes a `.zip` asset: `curl -fsSL https://api.github.com/repos/GustavoGomez092/Proto-Blocks/releases/latest | grep -o '"browser_download_url": *"[^"]*\.zip"' | head -1`. (At authoring this was `proto-blocks-2.3.1.zip` under tag `v2.3.1`.)

---

## Task 10: `proto-blocks/` home + `.gitignore`

**Files:**
- Create: `$DST/proto-blocks/README.md`, `$DST/proto-blocks/.gitkeep`
- Create: `$DST/.gitignore`

- [ ] **Step 1: `proto-blocks/README.md`**

```markdown
# Blocks

Scaffold Proto-Blocks here, one folder per block (`block.json` + `template.php`).
See the Proto-Blocks plugin docs / WP-CLI: `wp proto-blocks create <name> …`.
This folder ships empty in the starter.
```

- [ ] **Step 2:** `touch "$DST/proto-blocks/.gitkeep"`

- [ ] **Step 3: `.gitignore`** (for when the theme becomes its own repo)

```
.DS_Store
*.log
node_modules/
```

- [ ] **Step 4: Verify** — files exist.

---

## Task 11: CI deploy templates (placeholders)

**Files:** Create `$DST/.github/workflows/{deploy-wpengine-development.yml,deploy-wpengine-production.yml}`

- [ ] **Step 1: Copy from OIT and re-point placeholders**

```bash
for f in deploy-wpengine-development.yml deploy-wpengine-production.yml; do
  sed -e 's#wp-content/themes/optimizedit#wp-content/themes/proto-theme#g' \
      -e 's#WPE_ENV: optimizeditdev#WPE_ENV: YOUR_DEV_INSTALL_NAME#g' \
      -e 's#WPE_ENV: optimizedit#WPE_ENV: YOUR_PROD_INSTALL_NAME#g' \
      "$SRC/.github/workflows/$f" > "$DST/.github/workflows/$f"
done
```

- [ ] **Step 2:** In each file, also generalize the cleanup `rm -rf docs README.md` block as-is (it already strips dev files). Confirm the production workflow keeps `workflow_dispatch` (manual) — do not auto-deploy.

- [ ] **Step 3: Verify** — `grep -l "YOUR_DEV_INSTALL_NAME" "$DST/.github/workflows/deploy-wpengine-development.yml"`; `grep -q "workflow_dispatch" "$DST/.github/workflows/deploy-wpengine-production.yml" && echo prod-manual`.

---

## Task 12: `README.md` + screenshot

**Files:** Create `$DST/README.md`; add `$DST/screenshot.png`

- [ ] **Step 1: Write `README.md`** covering: what Proto-theme is; activation → TGMPA plugin prompts (Safe SVG, Yoast, Duplicate Post, Proto-Blocks, optional Wordfence); the builder canvas as the default page editor + sidebar Page Title; scaffolding a block in `proto-blocks/`; customizing tokens in `tailwind-theme.css`; the animation globals (`window.gsap/SplitText/lottie/Lenis`); swapping `assets/lottie/intro.json` + `assets/img/favicon.svg`; **"Updating Proto-Blocks"** (the theme auto-pulls the latest release via `proto_protoblocks_zip_url()`; explain the 12h transient cache + how to refresh the pinned fallback or pin a specific `vX.Y.Z` to freeze a version); and wiring the deploy workflows (set `WPE_SSHG_KEY_PRIVATE` secret + install names). Full prose to be written at execution.

- [ ] **Step 2: Screenshot** — provide a neutral 1200×900 `screenshot.png` (placeholder solid card) or omit; WP shows a blank thumbnail if absent. Acceptable to skip.

- [ ] **Step 3: Verify** — `README.md` exists and mentions `proto-blocks`, `tailwind-theme.css`, and `Updating Proto-Blocks`.

---

## Task 13: Activation smoke test

- [ ] **Step 1: Lint sweep** — `find "$DST" -name '*.php' -exec php -l {} \;` all pass; `for f in $(find "$DST" -name '*.js'); do node --check "$f"; done` all pass; all `*.json` valid.

- [ ] **Step 2: No OIT/brand leakage** — `grep -rndI "oit\|optimizedit\|D1001D\|Space Grotesk\|gravity" "$DST" --include=*.php --include=*.js --include=*.css --include=*.json --include=*.html` returns nothing (ignore the vendored lib files and intro.json which may contain unrelated strings — scope the grep to authored files).

- [ ] **Step 3: Activate** — in wp-admin, switch the active theme to Proto-theme (or `wp theme activate proto-theme` if WP-CLI is reachable). Expect: no fatal; the TGMPA "Install Required Plugins" notice appears listing the 5 plugins.

- [ ] **Step 4: Editor check** — create a new Page: the canvas has no title field, the sidebar shows a "Page Title" panel, and the Proto-Blocks inserter category "Proto Blocks" is present (once the Proto-Blocks plugin is installed/active).

- [ ] **Step 5: Front-end check** — load the site: the intro overlay plays once then fades; `window.gsap`, `window.Lenis`, `window.lottie` are defined in the console.

---

## Self-Review (done while authoring)

- **Spec coverage:** identity (T1–T8), structure (T1), keep/strip (T2–T8), builder-canvas-default (T5,T6), scripts (T4,T8), tokens (T3), TGMPA incl. Proto-Blocks-from-GitHub (T9), CI templates (T11), README (T12), bare/no-demo (no seeding task). ✓
- **Placeholders:** the only intentional placeholders are `YOUR_*_INSTALL_NAME` (CI) and the accent color — both flagged for the user, not plan gaps.
- **Consistency:** handle prefix `proto-` and the intro sessionStorage key `protoIntroShown` are cross-referenced between `functions.php` (T8) and `proto-intro.js` (T4) with an explicit reconciliation note.
- **Risk:** Proto-Blocks versioned source URL must be maintained (called out in T9 + README).
