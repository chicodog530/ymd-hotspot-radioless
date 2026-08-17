'use strict';
(() => {
  let timer = null;
  const el = id => document.getElementById(id);
  const fmtAge = v => v == null ? '—' : `${Math.max(0, Number(v)).toFixed(1)}s`;
  const set = (id, value) => { const node = el(id); if (node) node.textContent = value ?? '—'; };

  function directionText(value) {
    if (value === 'rf_to_network') return 'RF → NET';
    if (value === 'network_to_rf') return 'NET → RF';
    return value || '?';
  }

  function destination(session) {
    if (!session) return 'unknown';
    return `${session.group === true ? 'TG ' : ''}${session.dst_id ?? 'unknown'}`;
  }

  function sessionText(session) {
    if (!session) return 'idle';
    const src = session.src_info || session.src_id || 'unknown';
    return `${src} → ${destination(session)} · TS${session.slot ?? '?'} · ${directionText(session.direction || session.source)}`;
  }

  function lastSessionText(session) {
    if (!session) return 'none';
    const metrics = session.metrics || {};
    const bits = [sessionText(session), String(session.result || session.state || 'unknown').toUpperCase()];
    if (metrics.duration_s != null) bits.push(`${Number(metrics.duration_s).toFixed(1)}s`);
    if (metrics.ber_pct != null) bits.push(`BER ${Number(metrics.ber_pct).toFixed(1)}%`);
    if (metrics.packet_loss_pct != null) bits.push(`LOSS ${Number(metrics.packet_loss_pct).toFixed(0)}%`);
    if (metrics.rssi_dbm?.avg != null) bits.push(`RSSI avg ${Number(metrics.rssi_dbm.avg).toFixed(0)} dBm`);
    if (session.correlation === 'orphan') bits.push('ORPHAN');
    return bits.join(' · ');
  }

  function ensureSessionRows(id) {
    const call = el(`telemetryCall-${id}`);
    if (!call) return;
    const label = call.parentElement?.querySelector('span');
    if (label) label.textContent = 'Active session';
    if (el(`telemetryLastSession-${id}`)) return;
    const row = document.createElement('div');
    row.className = 'plugin-telemetry-call';
    const span = document.createElement('span');
    span.textContent = 'Last session';
    const value = document.createElement('b');
    value.id = `telemetryLastSession-${id}`;
    value.textContent = 'none';
    row.append(span, value);
    call.parentElement?.insertAdjacentElement('afterend', row);
  }

  function render(id, data) {
    const bridge = data.bridge || {}, rssi = data.rssi || {}, ber = data.ber || {};
    ensureSessionRows(id);
    set(`telemetryBridge-${id}`, bridge.online ? 'ONLINE' : String(bridge.status || 'OFFLINE').toUpperCase());
    set(`telemetryMode-${id}`, String(data.mode || 'idle').toUpperCase());
    set(`telemetryRssi-${id}`, rssi.value == null ? '—' : `${Number(rssi.value).toFixed(0)} dBm`);
    set(`telemetryBer-${id}`, ber.value == null ? '—' : `${Number(ber.value).toFixed(2)} %`);
    set(`telemetryCall-${id}`, sessionText(data.active_session || data.active_call));
    set(`telemetryLastSession-${id}`, lastSessionText(data.last_session));
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
