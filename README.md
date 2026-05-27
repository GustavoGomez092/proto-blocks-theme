# Proto-theme

A batteries-included WordPress block-theme starter built for [Proto-Blocks](https://github.com/GustavoGomez092/Proto-Blocks) development. It ships with a clean, brand-free foundation: neutral Tailwind tokens, vendored animation libraries (GSAP, SplitText, Lottie, Lenis), a builder-canvas page editor, and CI deploy workflows for WP Engine.

Proto-theme is designed to be forked once per project. Swap the colors in `tailwind-theme.css`, drop your blocks into `proto-blocks/`, replace the intro animation and favicon, wire up the deploy workflows, and you have a production-ready block theme.

---

## Requirements

- WordPress 6.9+
- PHP 8.0+
- Proto-Blocks plugin (auto-prompted on activation via TGMPA)

---

## Activation and Required Plugins

When you activate Proto-theme, WordPress will display a **"Install Required Plugins"** notice at the top of the dashboard (powered by TGM Plugin Activation). Install all flagged plugins before building:

| Plugin | Source | Required |
|---|---|---|
| **Safe SVG** | WordPress.org | Yes |
| **Yoast SEO** | WordPress.org | Yes |
| **Yoast Duplicate Post** | WordPress.org | Yes |
| **Proto-Blocks** | GitHub (latest release) | Yes |
| **Wordfence Security** | WordPress.org | Recommended |

Click "Begin installing plugins", check all items, and choose "Install". After installation the notice will resolve automatically.

> **Note on Wordfence:** It is marked recommended rather than required. You can safely skip it during local development and install it only on staging/production environments.

---

## The Builder Canvas (Default Page Editor)

Proto-theme configures all **Pages** to use the builder canvas by default (`page.html`). This means:

- The default WordPress post-title input is **hidden from the editing canvas** so blocks fill the full viewport edge-to-edge.
- The page title is not gone — it is moved to the **"Page Title" panel** in the document sidebar (right side, under the "Summary" section). Edit it there; it continues to power the URL slug, navigation menus, browser tab, SEO title, and breadcrumbs.
- All other post types (posts, custom post types) are unaffected and render normally with a visible title.

If you want to disable the builder canvas for a specific page, open the page, go to the document sidebar, and switch its template to a different one.

---

## Scaffolding a Block

All custom blocks live in `proto-blocks/`. Each block is a folder containing at minimum a `block.json` and a `template.php`. Proto-Blocks discovers all folders in this directory automatically — no registration code needed.

**The fastest way to scaffold:**

```bash
wp proto-blocks create my-block --title="My Block" --fields="heading:text,body:wysiwyg"
```

This creates `proto-blocks/my-block/block.json` and `proto-blocks/my-block/template.php` with the declared fields pre-wired.

**Manual scaffold — minimum viable block:**

1. Create `proto-blocks/my-block/block.json` with a `protoBlocks` key defining fields and controls.
2. Create `proto-blocks/my-block/template.php` with PHP/HTML markup. Mark editable elements with `data-proto-field="fieldName"` attributes.
3. Save. The block appears in the "Proto Blocks" inserter category immediately (no build step).

If the block does not appear after saving, clear the Proto-Blocks template cache:

```bash
wp proto-blocks cache clear
```

For a complete field/control reference see the Proto-Blocks plugin documentation.

---

## Customizing Design Tokens

All Tailwind utility tokens are declared in `tailwind-theme.css` under a single `@theme {}` block. This file is read by Proto-Blocks' server-side Tailwind compiler — any token you define here becomes a Tailwind utility class available in every block.

The starter ships with a neutral grayscale ramp and one placeholder accent:

```css
--color-accent: #2563eb; /* placeholder accent — change me */
```

Replace these values with your brand colors. Token names become utility class suffixes: `--color-accent` → `bg-accent`, `text-accent`; `--font-display` → `font-display`; `--text-h1` → `text-h1`; and so on.

After editing `tailwind-theme.css`, reload any open editor tabs to pick up the new classes in block previews.

---

## Animation Globals

Proto-theme enqueues all animation libraries as self-hosted scripts and exposes them as window globals so blocks and inline scripts can use them without bundling:

| Global | Library | Version |
|---|---|---|
| `window.gsap` | GSAP Core | 3.15.0 |
| `window.SplitText` | GSAP SplitText | 3.15.0 |
| `window.ScrollTrigger` | GSAP ScrollTrigger | 3.15.0 |
| `window.lottie` | lottie-web (light) | 5.13.0 |
| `window.Lenis` | Lenis smooth scroll | 1.1.13 |

Lenis is initialized automatically by `scripts/proto-init.js` and exposed as `window.__protoLenis`. To pause smooth scroll during a transition (e.g., while a modal is open), call `window.__protoLenis.stop()` and `window.__protoLenis.start()`.

All library files live in `scripts/` and are versioned by their `filemtime`, so browsers bust the cache on update automatically.

---

## Intro Animation and Favicon

### Intro overlay

The intro overlay plays once per browser session and fades out before the page is visible. It is powered by `scripts/proto-intro.js` and reads a Lottie JSON file pointed to by the `data-lottie-url` attribute.

To swap the animation, replace `assets/lottie/intro.json` with your own Lottie file. The overlay dimensions are controlled by `.proto-intro__lottie` in `style.css` (default: 200×200 px).

To disable the intro entirely, remove the `wp_body_open` hook and the `wp_head` script in `functions.php` (the two blocks near the bottom of the file).

### Favicon

The theme registers a custom SVG favicon from `assets/img/favicon.svg`, bypassing the WordPress Customizer setting. Replace that file with your own SVG. The URL includes a `filemtime` cache-buster so browsers pick up changes immediately.

---

## Updating Proto-Blocks

Proto-theme automatically resolves the **latest Proto-Blocks release** at install time. The function `proto_protoblocks_zip_url()` in `inc/proto-required-plugins.php` calls the GitHub Releases API (`/releases/latest`) to fetch the current release's `.zip` download URL, then caches it in a 12-hour WordPress transient.

**How it works:**

1. On first load (or after the transient expires), the theme queries `https://api.github.com/repos/GustavoGomez092/Proto-Blocks/releases/latest`.
2. It extracts the first `.zip` asset URL from the response and stores it as the `proto_protoblocks_zip_url` transient (TTL: 12 hours).
3. TGMPA reads this URL as the plugin `source` when offering installation.
4. If the API is unreachable (rate limit, no network), the function returns a **pinned fallback URL** hard-coded in the file.

**Refreshing the cached URL** — if you need the latest release URL to resolve immediately (e.g., after a new Proto-Blocks release), delete the transient from the WordPress admin under Tools → Scheduled Tasks, or run:

```bash
wp transient delete proto_protoblocks_zip_url
```

The next page load will re-query the API and cache the new URL.

**Updating the pinned fallback** — open `inc/proto-required-plugins.php` and update the `$fallback` variable to the latest release zip URL:

```php
$fallback = 'https://github.com/GustavoGomez092/Proto-Blocks/releases/download/vX.Y.Z/proto-blocks-X.Y.Z.zip';
```

**Pinning a specific version** — to freeze the theme to a particular Proto-Blocks release (useful for stability on production), replace the `source` value in `proto_register_required_plugins()` with a direct, version-pinned URL:

```php
'source' => 'https://github.com/GustavoGomez092/Proto-Blocks/releases/download/v2.3.1/proto-blocks-2.3.1.zip',
```

With a hard-coded URL the `proto_protoblocks_zip_url()` resolver is bypassed entirely for that entry. Remove this pinning and restore `proto_protoblocks_zip_url()` to resume auto-resolution.

---

## Deploy Workflows (WP Engine)

Proto-theme ships two GitHub Actions workflows in `.github/workflows/`:

- `deploy-wpengine-development.yml` — triggers on every push to the `development` branch.
- `deploy-wpengine-production.yml` — **manual only** (`workflow_dispatch`); never auto-deploys to production.

Both workflows strip development files (`docs/`, `README.md`, `.gitignore`, `.git/`, `.github/`) before the rsync transfer, so the server receives only theme files.

### Setup steps

1. **Add the SSH key secret.** In your GitHub repository go to Settings → Secrets and variables → Actions and add a secret named `WPE_SSHG_KEY_PRIVATE` containing your WP Engine SSH gateway private key.

2. **Set the install names.** In each workflow file, replace the placeholder values:

   In `deploy-wpengine-development.yml`:
   ```yaml
   WPE_ENV: YOUR_DEV_INSTALL_NAME
   ```

   In `deploy-wpengine-production.yml`:
   ```yaml
   WPE_ENV: YOUR_PROD_INSTALL_NAME
   ```

   The install name is the short identifier for your WP Engine environment (the subdomain part of `*.wpengine.com`).

3. **Set the trigger branch.** The development workflow triggers on pushes to `development`. If your branch is named differently (e.g., `staging`), update the `branches:` value in the workflow file.

4. **Trigger a deployment.** Push to `development` to deploy to the dev environment. To deploy to production, go to Actions → "Deploy to WP Engine Production" → "Run workflow".
