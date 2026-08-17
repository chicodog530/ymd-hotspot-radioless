'use strict';
(() => {
  let timer = null;
  const el = id => document.getElementById(id);
  const fmtAge = v => v == null ? '—' : `${Math.max(0, Number(v)).toFixed(1)}s`;
  const set = (id, value) => { const node = el(id); if (node) node.textContent = value ?? '—'; };

  function callText(call) {
    if (!call) return 'idle';
    const src = call.src_info || call.src_id || 'unknown';
    const dst = `${String(call.group || '').toLowerCase() === 'yes' ? 'TG ' : ''}${call.dst_id ?? 'unknown'}`;
    return `${src} → ${dst} · TS${call.slot ?? '?'} · ${call.source || '?'}`;
  }

  function render(id, data) {
    const bridge = data.bridge || {}, rssi = data.rssi || {}, ber = data.ber || {};
    set(`telemetryBridge-${id}`, bridge.online ? 'ONLINE' : String(bridge.status || 'OFFLINE').toUpperCase());
    set(`telemetryMode-${id}`, String(data.mode || 'idle').toUpperCase());
    set(`telemetryRssi-${id}`, rssi.value == null ? '—' : `${Number(rssi.value).toFixed(0)} dBm`);
    set(`telemetryBer-${id}`, ber.value == null ? '—' : `${Number(ber.value).toFixed(2)} %`);
    set(`telemetryCall-${id}`, callText(data.active_call));
    set(`telemetryAge-${id}`, fmtAge(data.last_payload_age_s));
    set(`telemetryMessages-${id}`, String(bridge.messages ?? 0));
  }

  async function poll() {
    if (document.hidden || !document.getElementById('plugins')?.classList.contains('on')) return;
    const panel = document.querySelector('[data-mmdvm-telemetry]');
    if (!panel) return;
    const id = panel.dataset.mmdvmTelemetry;
    try {
      const response = await fetch(`/api/plugins/telemetry?id=${encodeURIComponent(id)}`, {cache:'no-store', credentials:'same-origin'});
      if (!response.ok) return;
      const data = await response.json();
      render(id, data.telemetry || {});
    } catch (_) {}
  }

  function start() {
    if (timer) return;
    timer = setInterval(poll, 1000);
    poll();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
})();
