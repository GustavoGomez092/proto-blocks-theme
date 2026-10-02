/**
 * Page-transition curtain.
 *
 * Taxi fades the outgoing view out and appends the incoming one only once the
 * fetch resolves. Between those two moments the document holds no view at all,
 * so a navigation started before the hover prefetch finished shows an empty
 * page until the server answers. The curtain covers that window.
 *
 * It wipes closed on proto:page-leave, holds for as long as the fetch takes,
 * and wipes open on proto:page-ready. The theme's own fade still runs
 * underneath; it is simply no longer visible.
 *
 * The element lives on <body>, outside [data-taxi], so the view swap never
 * removes it. Settings come from PHP (inc/proto-curtain.php); see
 * docs/page-transitions.md.
 */
(function () {
	'use strict';

	var S = window.protoCurtainSettings || {};

	var PANELS          = Math.max(1, parseInt(S.panels, 10) || 5);
	var COLOR           = S.color || '#000000';
	var MARK            = S.mark || '';
	var MARK_WIDTH      = S.markWidth || 'min(180px, 38vw)';
	var COVER_DURATION  = num(S.coverDuration, 0.24);
	var COVER_STAGGER   = num(S.coverStagger, 0.026);
	var REVEAL_DURATION = num(S.revealDuration, 0.5);
	var REVEAL_STAGGER  = num(S.revealStagger, 0.06);
	var FAILSAFE_MS     = parseInt(S.failsafe, 10) || 8000;
	var SKIP_PREFETCHED = S.skipPrefetched !== false;
	var HOLD_OUTGOING   = S.holdOutgoing !== false;

	var HOLD_CLASS = 'proto-curtain-holding';

	function num(v, fallback) {
		var n = parseFloat(v);
		return isNaN(n) ? fallback : n;
	}

	var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');

	var target   = null;   // where the pending navigation is headed
	var root     = null;
	var panels   = [];
	var mark     = null;
	var held     = null;   // the outgoing container pinned opaque
	var covering = null;   // resolves when the cover animation has finished
	var failsafe = null;

	/*
	 * A prefetched page needs no curtain.
	 *
	 * Taxi caches a page on link hover, keyed by absolute URL, and the entry
	 * only appears once the prefetch has *resolved* — an in-flight one reads as
	 * a miss. So cache.has() answers exactly the question worth asking: is this
	 * navigation going to wait for the network at all?
	 *
	 * The destination is not carried on the page-leave event, so it is taken
	 * from the click that started the navigation, falling back to the address
	 * bar for history moves. Anything unresolvable counts as a miss and gets
	 * the curtain: a needless curtain is a far smaller fault than a blank page.
	 */
	function isPrefetched(url) {
		if (!SKIP_PREFETCHED || !url) { return false; }

		try {
			var cache = window.protoTaxi && window.protoTaxi.core && window.protoTaxi.core.cache;

			return !!(cache && typeof cache.has === 'function' && cache.has(url));
		} catch (err) {
			return false;
		}
	}

	document.addEventListener('click', function (e) {
		var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;

		if (a && a.href) { target = a.href; }
	}, true);

	/* Back and forward never fire a click; by then the address bar already
	   holds the destination. */
	window.addEventListener('popstate', function () { target = window.location.href; });

	/* Pinning the outgoing view opaque has to beat the inline style the fade
	   writes, which only !important does. */
	function injectHoldRule() {
		if (!HOLD_OUTGOING || document.getElementById('proto-curtain-hold')) { return; }

		var style = document.createElement('style');
		style.id = 'proto-curtain-hold';
		style.textContent = '.' + HOLD_CLASS + ',.' + HOLD_CLASS + ' main{opacity:1!important}';
		document.head.appendChild(style);
	}

	/**
	 * Adopt a server-rendered curtain (the `firstLoad` setting) or build one.
	 */
	function build() {
		if (root) { return root; }

		var initial = document.querySelector('[data-proto-curtain-initial]');

		if (initial) {
			root   = initial;
			panels = Array.prototype.slice.call(root.querySelectorAll('div > div'));
			mark   = root.querySelector('img');
			root.style.visibility = 'visible';
			return root;
		}

		root = document.createElement('div');
		root.className = 'proto-curtain';
		root.setAttribute('aria-hidden', 'true');
		root.style.cssText = [
			'position:fixed', 'inset:0', 'z-index:2147483000',
			'pointer-events:none', 'visibility:hidden'
		].join(';');

		var rail = document.createElement('div');
		rail.style.cssText = 'position:absolute;inset:0;display:flex';

		for (var i = 0; i < PANELS; i++) {
			var panel = document.createElement('div');

			/* scaleY with a switched origin gives the wipe without animating
			   layout: closing grows each panel down from the top, opening
			   shrinks it away to the bottom, so the two halves read as one
			   continuous movement rather than a bounce. */
			panel.style.cssText = [
				'flex:1 1 0%',
				'background:' + COLOR,
				'transform:scaleY(0)',
				'transform-origin:top',
				'will-change:transform'
			].join(';');

			rail.appendChild(panel);
			panels.push(panel);
		}

		root.appendChild(rail);

		if (MARK) {
			mark = document.createElement('img');
			mark.src = MARK;
			mark.alt = '';
			mark.setAttribute('aria-hidden', 'true');
			mark.style.cssText = [
				'position:absolute', 'top:50%', 'left:50%',
				'width:' + MARK_WIDTH, 'height:auto',
				'transform:translate(-50%,-50%)', 'opacity:0', 'will-change:opacity'
			].join(';');
			root.appendChild(mark);
		}

		document.body.appendChild(root);

		return root;
	}

	function show() {
		build().style.visibility = 'visible';
		root.style.pointerEvents = 'auto';
	}

	function hide() {
		if (!root) { return; }
		root.style.visibility = 'hidden';
		root.style.pointerEvents = 'none';
	}

	function release() {
		if (held) { held.classList.remove(HOLD_CLASS); held = null; }
	}

	function clearFailsafe() {
		if (failsafe) { window.clearTimeout(failsafe); failsafe = null; }
	}

	function cover(e) {
		var dest = target;

		target = null;

		if (isPrefetched(dest)) { return Promise.resolve(); }

		injectHoldRule();
		build();
		show();

		/* Pin the view on its way out so it stays solid behind the closing
		   panels instead of dissolving in front of them. The fade's own tween
		   is left alone to run and fire its onComplete — that callback is what
		   lets the navigation proceed, so cancelling it would stall the site. */
		if (HOLD_OUTGOING) {
			var container = (e && e.detail && e.detail.container)
				|| document.querySelector('[data-taxi-view]');

			if (container && container.classList) {
				held = container;
				held.classList.add(HOLD_CLASS);
			}
		}

		var gsap = window.gsap;

		clearFailsafe();
		failsafe = window.setTimeout(function () {
			console.warn('[proto-curtain] no page-ready within ' + FAILSAFE_MS + 'ms; opening anyway');
			reveal();
		}, FAILSAFE_MS);

		if (!gsap || (reduced && reduced.matches)) {
			panels.forEach(function (p) { p.style.transformOrigin = 'top'; p.style.transform = 'scaleY(1)'; });
			if (mark) { mark.style.opacity = '1'; }
			covering = Promise.resolve();
			return covering;
		}

		covering = new Promise(function (resolve) {
			gsap.killTweensOf(panels);
			if (mark) { gsap.killTweensOf(mark); }

			gsap.set(panels, { transformOrigin: 'top' });

			var tl = gsap.timeline({ onComplete: resolve });

			tl.fromTo(
				panels,
				{ scaleY: 0 },
				{ scaleY: 1, duration: COVER_DURATION, ease: 'power3.in', stagger: COVER_STAGGER }
			);

			/* The mark arrives once the panels are down, so it is never seen
			   sitting on a half-covered page. */
			if (mark) {
				tl.to(mark, { opacity: 1, duration: 0.25, ease: 'power2.out' }, '>-0.05');
			}
		});

		return covering;
	}

	function reveal() {
		if (!root) { return; }

		clearFailsafe();

		/* A fast response can land before the cover has finished. Opening from
		   a half-closed curtain looks like a glitch, so the reveal always waits
		   for the close to complete first. */
		var ready = covering || Promise.resolve();

		ready.then(function () {
			var gsap = window.gsap;

			if (!gsap || (reduced && reduced.matches)) {
				panels.forEach(function (p) { p.style.transform = 'scaleY(0)'; });
				if (mark) { mark.style.opacity = '0'; }
				hide();
				release();
				return;
			}

			gsap.killTweensOf(panels);
			if (mark) { gsap.killTweensOf(mark); }

			var tl = gsap.timeline({ onComplete: function () { hide(); release(); } });

			if (mark) {
				tl.to(mark, { opacity: 0, duration: 0.2, ease: 'power2.in' });
			}

			gsap.set(panels, { transformOrigin: 'bottom' });
			tl.to(
				panels,
				{ scaleY: 0, duration: REVEAL_DURATION, ease: 'power3.inOut', stagger: REVEAL_STAGGER },
				mark ? '>-0.05' : 0
			);
		});
	}

	document.addEventListener('proto:page-leave', cover);

	document.addEventListener('proto:page-ready', function () {
		/* page-ready also fires on the very first load. With `firstLoad` on
		   there is a server-rendered curtain waiting to be opened; without it
		   there is nothing to open. */
		var initial = document.querySelector('[data-proto-curtain-initial]');

		if (initial && !root) {
			build();
			covering = Promise.resolve();
			reveal();
			return;
		}

		if (root && root.style.visibility === 'visible') { reveal(); }
	});

	/* Restoring from the back/forward cache re-shows the document as it was
	   left. If that was mid-navigation, the curtain is still closed. */
	window.addEventListener('pageshow', function (e) {
		if (e.persisted) { reveal(); }
	});
})();
