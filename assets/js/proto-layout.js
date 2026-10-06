/**
 * Keep the scroll runtime in step with the document.
 *
 * Lenis measures the document once and caches it. ScrollTrigger caches every
 * trigger's start and end against that measurement. Two things routinely
 * invalidate it, and neither library tells the other:
 *
 *   A pin changes the document's height by design. ScrollTrigger inserts a
 *   spacer the size of the pinned distance, after Lenis has measured. Lenis is
 *   never told, so on any page with a pinned section its idea of the scrollable
 *   length is short by the whole pinned distance and the end of the page cannot
 *   be reached at all. Measured on a page with one pinned section: Lenis allowed
 *   3728px where the document could scroll 6379, putting the footer out of
 *   reach entirely.
 *
 *   A block changing its own height does the same in miniature: a tab panel
 *   swapping for one of a different size, an accordion opening, a filter
 *   removing half a grid.
 *
 * The first is handled here for everybody. For the second, a block calls:
 *
 *     window.protoLayoutChanged();
 *
 * Safe to call when neither library is present, and safe to call repeatedly.
 *
 * Two other approaches were tried first and are recorded here because each
 * looked obviously right:
 *
 *   A timed retry loop, re-applying while Lenis and the document disagreed.
 *   ScrollTrigger.refresh() can bring lazy images into view; their load events
 *   queued another refresh, and the two fed each other until the renderer
 *   stopped responding.
 *
 *   A ResizeObserver on document.body, so no block had to announce anything.
 *   Pinning changes the body's height by design -- that is what a pin spacer is
 *   -- so the observer fired throughout a pinned section, and the refreshes it
 *   triggered reset the scrub until the pinned element stopped moving at all.
 */
(function () {
	'use strict';

	var queued = false;

	function realMax() {
		return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
	}

	function resizeLenis() {
		if (window.protoLenis && typeof window.protoLenis.resize === 'function') {
			window.protoLenis.resize();
		}
	}

	/**
	 * ScrollTrigger first, Lenis last.
	 *
	 * Refreshing re-creates pin spacers, so the document's height is in flux
	 * while it runs; a Lenis measurement taken before or during that reads a
	 * height the page is about to leave. The final measurement is a frame later
	 * so the browser has laid the refreshed page out before it is read.
	 */
	function apply() {
		if (window.ScrollTrigger && typeof window.ScrollTrigger.refresh === 'function') {
			window.ScrollTrigger.refresh();
		}

		requestAnimationFrame(function () {
			resizeLenis();
			window.dispatchEvent(new CustomEvent('proto:layout-changed'));
		});
	}

	function run() {
		queued = false;

		apply();

		/*
		 * Two checks, at fixed moments, then nothing. A single pass can read a
		 * layout that has not finished settling, and how long that takes varies
		 * with what changed. These are scheduled once per call and never
		 * reschedule themselves, so this cannot become the retry loop described
		 * above. A bare re-measure rather than another apply(): refreshing puts
		 * the height back in flux and measures the same wrong figure again.
		 */
		[300, 900].forEach(function (delay) {
			window.setTimeout(function () {
				if (window.protoLenis && Math.abs(window.protoLenis.limit - realMax()) > 2) {
					resizeLenis();
				}
			}, delay);
		});
	}

	/**
	 * Coalesce into the frame after next: a block usually changes several things
	 * at once, and a refresh re-measures every trigger on the page. Two frames
	 * rather than one because the first lets the browser lay the new height out
	 * and the second measures it.
	 */
	window.protoLayoutChanged = function () {
		if (queued) { return; }

		queued = true;

		requestAnimationFrame(function () {
			requestAnimationFrame(run);
		});
	};

	/**
	 * Re-measure on every ScrollTrigger refresh, whoever caused it.
	 *
	 * This is the pin case, and the reason a page with a pinned section could
	 * not be scrolled to its end. Lenis's own resize does not refresh
	 * ScrollTrigger, so this cannot feed back.
	 */
	function bindRefresh() {
		if (!window.ScrollTrigger || typeof window.ScrollTrigger.addEventListener !== 'function') {
			return false;
		}

		window.ScrollTrigger.addEventListener('refresh', resizeLenis);

		return true;
	}

	/* ScrollTrigger may load after this file -- block view scripts declare no
	   dependencies -- so try now and once more when the document is ready. */
	if (!bindRefresh()) {
		document.addEventListener('DOMContentLoaded', bindRefresh, { once: true });
	}

	/*
	 * A hidden tab does not run requestAnimationFrame, so a height change made
	 * while the tab is in the background is measured only on return. The queued
	 * frame does fire then, which covers a change this script was told about,
	 * but a block may also have resized without announcing it.
	 */
	document.addEventListener('visibilitychange', function () {
		if (!document.hidden) { resizeLenis(); }
	});

	/* One sync once everything has settled, for the pins created on load. */
	window.addEventListener('load', function () {
		window.setTimeout(resizeLenis, 300);
	});
})();
