# Layout changes and the scroll runtime

The theme drives scrolling with Lenis and animates with GSAP ScrollTrigger. Both
cache the document's height, and neither tells the other when it changes. Left
alone, that has two visible consequences.

## The pin case, which the theme handles for you

A pinned section changes the document's height by design: ScrollTrigger inserts a
spacer the size of the pinned distance. That happens after Lenis has measured,
and Lenis is never told, so its idea of the scrollable length is short by the
whole pinned distance — and the end of the page cannot be reached at all.

Measured on a page with one pinned section: Lenis allowed 3728px of scrolling
where the document could scroll 6379. The footer was unreachable.

`inc/proto-layout.php` loads a script that re-measures Lenis on every
ScrollTrigger refresh, which covers this. Nothing is required of a block.

## The block case, which needs one line

A block that changes its own height has the same effect in miniature: a tab
panel swapping for one of a different size, an accordion opening, a filter
removing half a grid. Until the next window resize the page's scrollable length
is wrong and every trigger below the change is anchored to a position that no
longer exists.

After changing height, call:

```js
if (typeof window.protoLayoutChanged === 'function') {
    window.protoLayoutChanged();
}
```

Guard the call as above: a fork may have switched the sync off, and a block
should not assume the theme's scripts are present.

It is safe to call repeatedly — calls are coalesced — and safe when neither
library is loaded.

To react to it from elsewhere, listen for `proto:layout-changed` on `window`.
It fires after the re-measure, not before.

## What not to do

Both of these look obviously right and were tried first.

**Do not poll.** Re-applying on a timer while Lenis and the document disagree
feeds itself: `ScrollTrigger.refresh()` can bring lazy images into view, their
`load` events queue another refresh, and the two will lock the renderer.

**Do not observe `document.body` with a ResizeObserver.** A pin spacer changes
the body's height by design, so the observer fires throughout a pinned section
and the refreshes it triggers reset the scrub — in testing, the pinned element
stopped moving altogether.

## Order

If you ever write this yourself: refresh ScrollTrigger first and re-measure
Lenis a frame later. Refreshing re-creates spacers, so a Lenis measurement taken
before or during it reads a height the page is about to leave.

## Turning it off

```php
add_filter( 'proto_layout_sync_enabled', '__return_false' );
```

Worth knowing what you lose: a page with a pinned section will not scroll to its
end.
