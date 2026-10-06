/**
 * Reveal guard.
 *
 * Proto-Blocks prints a no-JS fallback inside <noscript>:
 *
 *   [data-proto-animate]:not([data-proto-animate="done"]) *
 *   { opacity:1!important; transform:none!important; visibility:visible!important }
 *
 * That is right for readers without JavaScript, and inert for everyone else —
 * until Taxi fetches a page. Taxi parses the incoming HTML with scripting
 * disabled, and in that mode <noscript> contents parse as real elements rather
 * than as text. Merging the parsed page then promotes that <style> into the
 * live document, where its !important beats both a block's start state and the
 * inline styles its animation writes.
 *
 * Every not-yet-revealed section is forced visible until its script marks it
 * "done": a section lands at full opacity, is hidden, then animates in. Only on
 * navigation, which is why a full page load never reproduces it.
 *
 * This removes the promoted stylesheet whenever it appears. Two details matter
 * and each one is easy to get wrong:
 *
 *   - It is inserted into the BODY, not the head. A head-scoped observer never
 *     sees it.
 *   - The merge happens during NAVIGATE_IN, long before NAVIGATE_END. Cleaning
 *     up on proto:page-ready runs about half a second after the damage is done,
 *     so it has to be an observer, not an event listener.
 *
 * Readers genuinely without JavaScript are unaffected: this never runs for
 * them, and their <noscript> still applies.
 */
(function () {
	'use strict';

	var SIGNATURE = '[data-proto-animate]:not([data-proto-animate="done"])';

	function isPromotedFallback(node) {
		if (!node || node.tagName !== 'STYLE') { return false; }

		/* A <style> still inside its <noscript> is the real fallback, left
		   alone. Only a promoted copy sits loose in the document. */
		if (node.closest && node.closest('noscript')) { return false; }

		var css = node.textContent || '';

		return css.indexOf(SIGNATURE) !== -1 && css.indexOf('!important') !== -1;
	}

	function drop(root) {
		if (isPromotedFallback(root)) { root.remove(); return; }

		if (!root || !root.querySelectorAll) { return; }

		Array.prototype.forEach.call(root.querySelectorAll('style'), function (style) {
			if (isPromotedFallback(style)) { style.remove(); }
		});
	}

	new MutationObserver(function (records) {
		for (var i = 0; i < records.length; i++) {
			var added = records[i].addedNodes;

			for (var j = 0; j < added.length; j++) { drop(added[j]); }
		}
	}).observe(document.documentElement, { childList: true, subtree: true });

	drop(document);
})();
