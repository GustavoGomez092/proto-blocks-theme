# Proto-theme — batteries-included Proto-Blocks starter theme

**Date:** 2026-05-26
**Status:** Design approved; pending spec review → implementation plan.

## Overview

Create **Proto-theme**, a clean, reusable WordPress block-theme starter for
Proto-Blocks development, as a new folder beside the OIT theme
(`wp-content/themes/proto-theme/`). It is the OIT theme with every
brand-/project-specific component stripped, keeping only the proven
infrastructure (animation libs, intro screen, builder-canvas editor flow,
Tailwind-token plumbing) and adding TGM Plugin Activation to require the
plugins a Proto-Blocks build needs.

**Goal:** activate Proto-theme on a fresh install and immediately have a
working Proto-Blocks authoring environment — the builder canvas is the
default page editor, the required plugins are prompted for, the animation
stack is wired, and `proto-blocks/` is an empty, documented home for new
blocks.

## Identity / naming

| Aspect | Value |
|--------|-------|
| Folder / text-domain | `proto-theme` |
| PHP function/hook prefix | `proto_` |
| CSS / JS class prefix | `proto-` (e.g. `.proto-intro`) |
| Proto-Blocks category | slug `proto`, title "Proto Blocks" |
| Theme header name | "Proto-theme" |

## Approach — hybrid

Rewrite the PHP/config **lean and brand-free** (new `functions.php`,
`style.css`, `theme.json`, `tailwind-theme.css`) with the `proto_`/`proto-`
prefix, but **reuse the proven self-contained assets verbatim** (the GSAP /
Lenis / Lottie / ScrollTrigger / SplitText library files, the builder-canvas
editor JS+CSS, the intro JS + `intro.json`), generalized as needed. This
avoids dragging OIT cruft (fork-and-strip) while not re-deriving
battle-tested pieces (from-scratch).

## File structure

```
proto-theme/
├─ style.css            theme header + minimal generics (intro, list fix, spacer fix)
├─ theme.json           layout / appearanceTools / spacing units; system+Inter fonts; no custom templates
├─ tailwind-theme.css   NEUTRAL placeholder tokens (read by Proto-Blocks Tailwind)
├─ functions.php        lean, proto_-prefixed (see below)
├─ inc/
│   ├─ class-tgm-plugin-activation.php   TGMPA library (bundled, from TGMPA repo)
│   └─ proto-required-plugins.php        plugin registration (proto_register_required_plugins)
├─ assets/
│   ├─ editor/builder-canvas.css         hides post-title on the canvas (scoped class)
│   ├─ editor/builder-canvas.js          adds sidebar Page Title panel; triggers on pages
│   ├─ img/favicon.svg                   generic placeholder favicon
│   └─ lottie/intro.json                 default intro animation (swappable)
├─ scripts/
│   ├─ gsap.min.js  ScrollTrigger.min.js  SplitText.min.js
│   ├─ lenis.min.js  lottie_light.min.js
│   ├─ proto-init.js                      Lenis smooth-scroll setup (from oit-init.js)
│   └─ proto-intro.js                     intro preloader logic (from oit-intro.js)
├─ parts/  header.html  footer.html       kept as-is (already generic core blocks)
├─ templates/  index.html  page.html  single.html
├─ proto-blocks/  .gitkeep + README.md    empty; devs scaffold blocks here
├─ .github/workflows/  deploy-*.yml       WP Engine deploy templates w/ placeholders
└─ README.md
```

## Keep / generalize vs strip

**Keep + generalize (rename `oit` → `proto`):**
- `functions.php` skeleton: nav menus (`primary`, `footer`), `add_editor_style`,
  `proto_blocks_category_slug`→`proto` / `_title`→"Proto Blocks", SVG favicon,
  theme-stylesheet enqueue via `enqueue_block_assets` (front + editor iframe),
  builder-canvas editor asset enqueues, the scripts enqueue map, and the intro
  screen (`wp_head` sessionStorage check + `wp_body_open` `.proto-intro` markup).
- `assets/editor/builder-canvas.{css,js}` — generalized (see Builder canvas).
- `scripts/` libs + `proto-init.js` + `proto-intro.js`.
- `parts/header.html`, `parts/footer.html` — already generic; keep verbatim.
- `templates/index.html`, `single.html` — generic; keep.
- `style.css` generics: `.proto-intro` styles, the `.proto-blocks-scope ol/ul`
  list-marker restore, and the `.is-layout-flow > .wp-block-spacer` block-gap fix.
- `tailwind-theme.css` — keep the file (Proto-Blocks Tailwind reads it) with
  neutral tokens.

**Strip entirely:**
- All 34 `proto-blocks/*` blocks (empty the directory).
- `inc/oit-resources-cpt.php`, `inc/oit-post-template.php`, `inc/oit-header-partials.php`.
- `functions.php`: Gravity Forms options provider, `oit_social_icon()`.
- `templates/page-builder.html`, `page-full-width.html`, `single-oit_resource.html`.
- `assets/img/circuit.svg`, `quote.svg`; `assets/lottie/circuit.json`.
- `scripts/oit-nav-animation.js`.
- `style.css`: `.oit-btn*` utilities, breadcrumb/wordmark styles, `.single-post strong` brand rule.
- OIT brand tokens in `tailwind-theme.css` (replaced by neutral set).

## Builder canvas = default for pages

The builder canvas template becomes **`templates/page.html`** (header →
full-width `wp:post-content` → footer). Via the WP template hierarchy, every
`page` uses it by default — no manual template selection.

`assets/editor/builder-canvas.js` is generalized: its trigger becomes
`getCurrentPostType() === 'page'` (drop the `oit_resource`/`page-builder`
checks). On pages it hides the canvas post-title (via the `.proto-builder-canvas`
body class + `builder-canvas.css`) and registers a sidebar **Page Title**
panel. Posts (`single.html`) render a normal title. No PHP is needed to "make
it default" — `page.html` is the default by hierarchy.

`theme.json` ships **no** `customTemplates` (page.html and single.html cover
pages and posts; `index.html` is the required fallback).

## Scripts

Enqueue map in `functions.php` (handles `proto-*`, footer, `filemtime` cache-bust):
`gsap` → `split-text`/`scroll-trigger` (dep gsap) → `lottie` (`lottie_light.min.js`)
→ `lenis` → `proto-init` (dep lenis) → `proto-intro` (dep proto-init + lottie).
Globals exposed: `window.gsap`, `window.SplitText`, `window.lottie`,
`window.Lenis`. The OIT nav animation is dropped.

## Tokens (`tailwind-theme.css`)

Neutral, brand-free, clearly "fill these in":
- Colors: a grayscale ramp (`--color-black #111`, grays, white) + one neutral
  accent placeholder.
- Fonts: `--font-sans` system stack + Inter; no brand display font.
- Type scale + spacing: a simple, conventional scale.
No OIT reds, Space Grotesk, or DM Sans.

## Plugins via TGMPA

Library bundled at `inc/class-tgm-plugin-activation.php` (from the TGMPA repo).
Registration in `inc/proto-required-plugins.php` hooked on `tgmpa_register`:

| Plugin | Slug | Source | Required? |
|--------|------|--------|-----------|
| Safe SVG | `safe-svg` | wp.org | **required** |
| Yoast SEO | `wordpress-seo` | wp.org | **required** |
| Duplicate Post | `duplicate-post` | wp.org | **required** |
| Proto-Blocks | `proto-blocks` | GitHub release zip (external `source`) | **required** |
| Wordfence Security | `wordfence` | wp.org | recommended (not required, deactivatable) |

**Proto-Blocks source — always the latest release (dynamic):** rather than
hardcoding a version-pinned zip URL (which would need manual bumping every
release), the theme resolves the download URL at runtime from the GitHub
Releases API and feeds it to TGMPA's `source`.

- Helper `proto_protoblocks_zip_url()` in `inc/proto-required-plugins.php`:
  1. Return a cached value from the `proto_protoblocks_zip_url` transient if set.
  2. Otherwise `wp_remote_get('https://api.github.com/repos/GustavoGomez092/Proto-Blocks/releases/latest')`
     with an `Accept: application/vnd.github+json` + `User-Agent` header.
     `/releases/latest` returns GitHub's newest **published, non-prerelease,
     non-draft** release (the versioned `vX.Y.Z` releases created by the
     plugin's `release.yml`), which is the genuinely-newest stable build —
     note this is AHEAD of the rolling `latest`-tag build, which lags one
     version.
  3. Pick the first `assets[]` entry whose `name` ends in `.zip`, take its
     `browser_download_url`, cache it in the transient for 12h, return it.
  4. On any failure (WP_Error, non-200, no zip asset, rate limit) return a
     **pinned fallback URL** so installation still works offline / when the
     GitHub API (60 req/hr unauthenticated) is unavailable. The transient cache
     means at most ~2 API calls/day.
- `proto_register_required_plugins()` sets the Proto-Blocks entry's
  `'source' => proto_protoblocks_zip_url()`.

Fallback URL kept current-ish in code (e.g. the latest known `vX.Y.Z` asset);
it is only used when the API can't be reached, so it never needs urgent
maintenance. (Current latest at authoring: `v2.3.1` →
`…/releases/download/v2.3.1/proto-blocks-2.3.1.zip`.)

TGMPA config: `is_automatic => true` (activate after install), menu under
Appearance, dismissable notice.

## CI templates

Include `deploy-wpengine-development.yml` and `deploy-wpengine-production.yml`
(production gated to `workflow_dispatch`) with obvious placeholders —
`WPE_ENV: YOUR_INSTALL_NAME`, `REMOTE_PATH: wp-content/themes/proto-theme`,
trigger branches — and a README section explaining the required secret and
how to wire them up. No build step (Tailwind compiles server-side via
Proto-Blocks).

## README

Covers: what the theme is, activation + TGMPA prompts, the required/recommended
plugins, how the builder canvas works (default page editor + sidebar title),
how to scaffold a block in `proto-blocks/`, where to customize tokens
(`tailwind-theme.css`), the animation globals available, swapping the intro
animation/favicon, and wiring the deploy workflows.

## Out of scope (YAGNI)

- No example/demo block (empty `proto-blocks/`).
- No demo content / front-page seeding on activation.
- No `page-full-width` alternate template.
- No Gravity Forms (and thus no GF options provider).

## Risks / notes

- **Proto-Blocks always-latest:** resolved dynamically from
  `/releases/latest` (cached 12h, pinned fallback) — no manual URL bumps. The
  trade-offs: relies on the GitHub API (mitigated by the cache + fallback), and
  tracks the latest **stable** versioned release. If a release ships a breaking
  change, every fresh install/prompt pulls it; pin the `source` to a specific
  `vX.Y.Z` asset (skip the helper) if you ever need to freeze a version.
- **README must document** updating/refreshing the fallback URL and the option
  to pin a specific version.
- TGMPA is unmaintained but still the de-facto standard; pin the bundled copy.
- The neutral tokens must still satisfy whatever utility classes a future block
  uses — the starter ships no blocks, so this is the dev's responsibility.
