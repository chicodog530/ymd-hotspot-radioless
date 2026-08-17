'use strict';
(() => {
  function wire() {
    if (!window.YWDInstrumentation) return;
    if (typeof window.render === 'function' && !window.render.__ywdInstrumented) {
      const base = window.render;
      const wrapped = function(d) {
        base(d);
        try { window.YWDInstrumentation.render(d); } catch (e) { console.error('YWD instrumentation render failed', e); }
      };
      wrapped.__ywdInstrumented = true;
      window.render = wrapped;
    }
    // The instrumentation/settings scripts load after app-core. Refresh the
    // already-present status/config once so the new controls do not wait for the
    // next normal dashboard cycle. This is initialization only, not a poll loop.
    fetch('/api/status', {cache:'no-store'}).then(r => r.ok ? r.json() : null).then(d => {
      if (d) window.YWDInstrumentation.render(d);
    }).catch(() => {});
    fetch('/api/config', {cache:'no-store'}).then(r => r.ok ? r.json() : null).then(d => {
      if (d?.config && typeof window.fillForm === 'function') window.fillForm(d.config);
    }).catch(() => {});
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();
})();
