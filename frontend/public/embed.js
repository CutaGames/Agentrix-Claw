/**
 * Agentrix Pet Embed SDK — Phase 3 W1 WB-T3.4 / WB-T3.5.
 *
 * Site owners drop:
 *   <script src="https://agentrix.top/embed.js" data-pet-id="abc-123"
 *           data-width="320" data-height="320"></script>
 *
 * This script:
 *   1. Locates its own <script> tag (currentScript) to read attributes.
 *   2. Injects a sandboxed <iframe> rendering /embed/pet/:id.
 *   3. Listens for postMessage events from the iframe to auto-resize.
 *
 * Sandbox: allow-scripts allow-same-origin (no popups, no top navigation).
 * No external dependencies; vanilla ES5+; safe to load multiple times per page.
 */
(function () {
  'use strict';

  var ORIGIN =
    (typeof window !== 'undefined' && window.AGENTRIX_EMBED_ORIGIN) ||
    'https://agentrix.top';
  var DEFAULT_W = 320;
  var DEFAULT_H = 320;
  var SANDBOX = 'allow-scripts allow-same-origin allow-popups-to-escape-sandbox';

  function getCurrentScript() {
    if (document.currentScript) return document.currentScript;
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].getAttribute('data-pet-id')) return scripts[i];
    }
    return null;
  }

  function safeNum(v, def) {
    var n = parseInt(String(v || ''), 10);
    return isFinite(n) && n > 0 ? n : def;
  }

  function mountIframe(script) {
    var petId = script.getAttribute('data-pet-id');
    if (!petId) return;
    // Reject non-uuid-shaped ids defensively.
    if (!/^[a-zA-Z0-9._-]{3,128}$/.test(petId)) return;
    var w = safeNum(script.getAttribute('data-width'), DEFAULT_W);
    var h = safeNum(script.getAttribute('data-height'), DEFAULT_H);
    var theme = script.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';

    var iframe = document.createElement('iframe');
    iframe.src =
      ORIGIN + '/embed/pet/' + encodeURIComponent(petId) + '?theme=' + theme;
    iframe.setAttribute('sandbox', SANDBOX);
    iframe.setAttribute('loading', 'lazy');
    iframe.setAttribute('referrerpolicy', 'no-referrer');
    iframe.setAttribute('title', 'Agentrix Pet ' + petId);
    iframe.setAttribute('allowtransparency', 'true');
    iframe.style.border = '0';
    iframe.style.width = w + 'px';
    iframe.style.height = h + 'px';
    iframe.style.background = 'transparent';
    iframe.dataset.agentrixEmbed = '1';
    iframe.dataset.petId = petId;

    // Insert immediately after our script tag.
    if (script.parentNode) {
      script.parentNode.insertBefore(iframe, script.nextSibling);
    }

    // postMessage resize protocol.
    window.addEventListener('message', function (ev) {
      if (!ev || !ev.data || typeof ev.data !== 'object') return;
      if (ev.source !== iframe.contentWindow) return;
      if (ev.data.type !== 'agentrix:resize') return;
      var nw = safeNum(ev.data.width, w);
      var nh = safeNum(ev.data.height, h);
      iframe.style.width = nw + 'px';
      iframe.style.height = nh + 'px';
    });
  }

  function init() {
    var script = getCurrentScript();
    if (!script) return;
    if (script.dataset.agentrixMounted === '1') return; // idempotent
    script.dataset.agentrixMounted = '1';
    mountIframe(script);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
