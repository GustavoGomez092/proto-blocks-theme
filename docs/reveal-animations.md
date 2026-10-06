# Scroll-reveal animations

## The rule

**CSS hides. JavaScript only raises opacity.**

It is a rule rather than a suggestion because the alternatives have all been
tried here, and each one shipped a bug before being backed out.

A block that animates its contents in puts the hidden state in its own
stylesheet, scoped so it stops applying once the block's script owns the
element:

```css
[data-proto-animate="manual"] [data-my-reveal] {
	opacity: 0;
	visibility: hidden;   /* alongside opacity: GSAP's autoAlpha sets both, and
	                         opacity alone leaves text selectable while invisible */
}
```

The script never hides anything. It animates opacity, and an inline style beats
a stylesheet rule, so the animation wins for as long as it runs:

```js
gsap.fromTo(els, { autoAlpha: 0 }, { autoAlpha: 1, stagger: 0.08 });
section.setAttribute('data-proto-animate', 'done');   // same tick
```

Nothing is handed back and forth, so there is nothing to race.

## Why not hide in JavaScript

Because it is always too late. A view script is a footer script, so the browser
has painted the section at full opacity before the script can touch it: the
reader sees the finished layout, it vanishes, then it animates in.

The plugin does not cover this and says so — its `reveal-runtime.css` carries
reduced-motion safety rules only, commented *"Blocks own their pending/done
visuals"*.

## Why not key the start state on something clever

A tempting variant is to hide unconditionally and lift the rule when the script
"takes over", keyed on an attribute the script sets. Do not. Every lift is a
handover, and a handover has a frame in it. Worse, `data-proto-animate` has two
authors — the plugin's reveal runtime force-reveals a `manual` section 1500ms
after it enters view, whatever the block's script is doing — so a rule keyed on
it lifts on a slow load and the flash comes back, intermittently and only with a
cold cache.

The scoped rule above has no such window: it stops applying at the same instant
the script's own inline styles start applying, because the script sets the
attribute in the same tick it starts the animation.

## The one thing the theme handles for you

Reveals that are correct on a full page load can still flash on a Taxi
navigation, through no fault of the block.

Proto-Blocks prints its no-JS fallback inside `<noscript>`:

```css
[data-proto-animate]:not([data-proto-animate="done"]) *
{ opacity:1!important; transform:none!important; visibility:visible!important }
```

Inert for anyone running JavaScript — except that Taxi parses the incoming page
with scripting disabled, and in that mode **`<noscript>` contents parse as real
elements**. Merging the parsed page promotes that `<style>` into the live
document, where its `!important` beats both the block's start state and the
inline styles its animation writes. Every not-yet-revealed section is forced
visible until its script marks it `done`.

[`assets/js/proto-reveal-guard.js`](../assets/js/proto-reveal-guard.js) removes
the promoted copy. It leaves the real `<noscript>` alone, so readers without
JavaScript still get their fallback.

Two details, each of which cost an attempt before landing:

- The promoted style is inserted into the **body**, not the head. A head-scoped
  observer never sees it.
- The merge happens during `NAVIGATE_IN`, long before `NAVIGATE_END`, so
  cleaning up on `proto:page-ready` runs about half a second after the damage.
  It has to be a `MutationObserver`.

### Hook

`proto_reveal_guard_enabled` — default `true`, and already `false` when page
transitions are off, since without a page merge there is nothing to leak.

```php
add_filter('proto_reveal_guard_enabled', '__return_false');
```

## Clean up on `proto:page-leave`

Taxi removes the outgoing view, but nothing you attached outside it goes with it.
`proto-taxi.js` kills the ScrollTriggers inside the leaving container, so the
live trigger count stays flat — that is the only thing it cleans up. Everything
else is yours.

Three things leak if you let them, all measured on a real site over six
navigations between two pages:

| What | Before | Why |
|---|---|---|
| `window` / `document` listeners | `resize` 11 → 27, `proto:page-ready` 4 → 7 | Block view scripts carry `data-taxi-reload`, so Taxi re-runs them and re-registers |
| Paused gsap timelines | 2 → 8, global children 10 → 31 | A timeline built standalone is not a trigger, so killing triggers never disposes it |
| ScrollTrigger resize listeners | 7 → 37 | See the note at the end |

The pattern is the same for all of them — dispose when your own container
leaves:

```js
document.addEventListener('proto:page-leave', function off(e) {
	var container = e && e.detail && e.detail.container;

	if (container && !container.contains(section)) return;   // not ours

	if (tl.scrollTrigger) tl.scrollTrigger.kill(false);
	tl.kill();
	window.removeEventListener('resize', onResize);
	document.removeEventListener('proto:page-leave', off);
});
```

Check the leaving container actually holds your element, or one block tears down
another's. And use `kill(false)` on a ScrollTrigger: a bare `kill()` reverts,
stripping the inline opacity a pre-reveal state depends on and popping the
section visible just as it starts to leave.

### A timeline with a trigger attached afterwards is still your problem

```js
var tl = gsap.timeline({ paused: true });   // not a ScrollTrigger
// …add tweens, then attach the trigger…
```

Building the timeline first and attaching the trigger after is often necessary —
passing `scrollTrigger` to the constructor takes hold of an empty timeline and
starts the tweens added next. But it means `killScrollTriggersIn()` cannot see
the timeline, because the timeline is not a trigger. Dispose it yourself.

If you are hunting one of these, attribute the allocation rather than guessing:
wrap `gsap.timeline` and record a stack frame per call. Two plausible fixes —
sweeping for tweens with detached targets, and killing `trigger.animation` —
both did nothing on the real case, because the objects accumulating were
timelines with no targets that no trigger referenced.

### What is not fixable from here

Live `window` resize listeners registered by `ScrollTrigger.min.js` still grow
across navigations, and the library releases none of them. Disposing your own
timelines removes the detached DOM those listeners were holding, which is the
part that matters; the listener count itself is inside the vendored library.

## Reveals stop working after a navigation

**Symptom.** Animations run on a full page load and never again. Navigate with
Taxi and the new page's sections are simply there, unanimated.

**Cause.** Binding to `DOMContentLoaded`. Taxi swaps the view without reloading
the document, so that event fires once per visit and never again. The plugin's
watchdog then force-reveals the new sections 1.5s after they enter view, which is
why the content appears at all — just without its animation.

**Fix.** Bind to `proto:page-ready`. `proto-taxi.js` dispatches it on the first
load *and* on every `NAVIGATE_END`, so block code has one contract:

```js
document.addEventListener('proto:page-ready', function (e) {
	setUpAll((e.detail && e.detail.container) || document);
});
```

Scope your query to `e.detail.container` — the incoming view — and guard so a
section is only ever set up once. Keep a `DOMContentLoaded` path as a fallback
for when Taxi is off and nothing dispatches the event; the guard makes both
firing harmless. The matching teardown event is `proto:page-leave`.

## Testing a reveal

Warm reloads hide all of this. Reproduce deliberately:

- **Navigate**, do not reload. The flash above is navigation-only.
- **Disable the cache**, so scripts are re-fetched and lose races they normally
  win.
- **Delay the view script** past 1500ms so the plugin's watchdog gets there
  first.

Trust a per-frame recorder over the eye:

```js
const f = [];
const tick = () => {
	const el = document.querySelector('[data-my-reveal]');
	if (el) f.push([Math.round(performance.now()), +getComputedStyle(el).opacity]);
	requestAnimationFrame(tick);
};
requestAnimationFrame(tick);
```

Any full-opacity frame before the first hidden one is a flash. When reading it
back, check which view the element belongs to: during a transition the outgoing
and incoming views can both be in the DOM, and a `querySelector` that grabs the
wrong one will tell you the bug is fixed when it is not.
