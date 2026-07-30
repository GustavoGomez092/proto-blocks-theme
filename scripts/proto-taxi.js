/**
 * Proto-theme page transitions (Taxi.js).
 *
 * Boots a single Taxi Core against the [data-taxi] wrapper the templates
 * provide, registers a GSAP fade as the default transition, and exposes
 *   window.protoTaxi = { core, Transition, addTransition }
 *
 * Loaded as `proto-taxi-init` with `proto-taxi` and `proto-init` as deps, so
 * window.taxi and window.protoLenis are guaranteed to exist by the time this
 * file runs.
 */
(function () {
  'use strict';

  var taxi = window.taxi;
  if (!taxi || !taxi.Core) {
    return;
  }

  if (!document.querySelector('[data-taxi]')) {
    console.warn('[proto-taxi] No [data-taxi] wrapper found — page transitions are disabled. See the theme README.');
    return;
  }

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

  var LINKS = [
    'a[href]',
    ':not([target])',
    ':not([href^="#"])',
    ':not([data-taxi-ignore])',
    ':not([download])',
    ':not([href*="/wp-admin"])',
    ':not([href*="wp-login"])',
    ':not([href^="mailto:"])',
    ':not([href^="tel:"])',
    ':not(#wpadminbar a)',
    ':not(.add_to_cart_button)',
    ':not(.wc-block-components-product-button a)'
  ].join('');

  /**
   * The element the fade animates. The view wrapper is a grid cell used for
   * stacking, so animate the <main> inside it when there is one.
   */
  function animTarget(el) {
    if (!el) return null;
    return el.querySelector('main') || el;
  }

  var ProtoFade = class extends taxi.Transition {
    onLeave(props) {
      var el = animTarget(props.from);
      if (reduced.matches || !window.gsap || !el) {
        props.done();
        return;
      }
      window.gsap.to(el, {
        opacity: 0,
        y: -20,
        duration: 0.4,
        ease: 'power2.inOut',
        onComplete: props.done
      });
    }

    onEnter(props) {
      var el = animTarget(props.to);
      if (reduced.matches || !window.gsap || !el) {
        props.done();
        return;
      }
      window.gsap.fromTo(
        el,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.5, ease: 'power2.out', onComplete: props.done }
      );
    }
  };

  var core = new taxi.Core({
    links: LINKS,
    transitions: { default: ProtoFade }
    // reloadJsFilter is left at its default: only [data-taxi-reload] scripts
    // are re-run. inc/proto-taxi.php decides which tags carry it.
  });

  window.protoTaxi = {
    core: core,
    Transition: taxi.Transition,

    /**
     * Register a transition usable via <a data-transition="name">.
     *
     * @param {string} name
     * @param {Function} TransitionClass  extends window.taxi.Transition
     * @return {object} this, for chaining
     */
    addTransition: function (name, TransitionClass) {
      core.transitions[name] = TransitionClass;
      return this;
    }
  };
})();
