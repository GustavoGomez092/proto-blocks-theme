/* Test fixture — records every execution so E2E specs can assert re-runs. */
(function () {
  'use strict';
  window.__protoInitCount = (window.__protoInitCount || 0) + 1;
  window.__protoInitLog = window.__protoInitLog || [];
  window.__protoInitLog.push('taxi-fixture-a');

  var roots = document.querySelectorAll('[data-proto-block="taxi-fixture-a"]');
  for (var i = 0; i < roots.length; i++) {
    roots[i].setAttribute('data-initialised', 'yes');
    roots[i].setAttribute('data-init-count', String(window.__protoInitCount));
  }
})();
