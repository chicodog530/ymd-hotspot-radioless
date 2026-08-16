'use strict';

const $ = id => document.getElementById(id);
const $$ = q => Array.from(document.querySelectorAll(q));
let state = null;
let configDoc = null;
let secretMode = null;
let dirty = false;
let lastHeardCollapsed = localStorage.getItem('ywd.lastheardCollapsed') === '1';
const CAL_SAMPLE_TARGET = 3;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[c]));

function toast(msg, bad = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(t._x);
  t._x = setTimeout(() => t.className = 'toast', 3300);
}

function ago(ts) {
  if (!ts) return '—';
  const s = Math.max(0, Math.floor(Date.now() / 1000 - ts));
  if (s < 60) return s + 's ago';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

function dur(v) { return v == null ? '—' : Number(v).toFixed(1) + 's'; }
function kv(k, v, cls = '') { return `<div class="row"><span>${esc(k)}</span><span class="${cls}">${esc(v)}</span></div>`; }
function tgLabel(x) { return `${x.talkgroup}${x.name ? ' · ' + x.name : ''}`; }
function fmtBytesMB(v) { return v == null ? '—' : Number(v).toFixed(1) + ' MB'; }
function ctlReady() { return !!state?.controls?.authenticated; }

function formatUptime(seconds) {
  let s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400); s %= 86400;
  const h = Math.floor(s / 3600); s %= 3600;
  const m = Math.floor(s / 60);
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function calibrationAggregates(tests) {
  const groups = new Map();
  (tests || []).forEach(x => {
    if (x?.ber_pct == null) return;
    const off = Number(x.rx_offset ?? 0);
    if (!Number.isFinite(off)) return;
    if (!groups.has(off)) groups.set(off, []);
    groups.get(off).push(x);
  });
  return Array.from(groups.entries()).map(([rx_offset, rows]) => {
    const bers = rows.map(x => Number(x.ber_pct)).filter(Number.isFinite);
    const rssis = rows.map(x => Number(x.rssi_dbm)).filter(Number.isFinite);
    const durations = rows.map(x => Number(x.duration_s)).filter(Number.isFinite);
    return {
      rx_offset,
      samples: rows.length,
      avg_ber: bers.length ? bers.reduce((a, b) => a + b, 0) / bers.length : null,
      best_ber: bers.length ? Math.min(...bers) : null,
      avg_rssi: rssis.length ? rssis.reduce((a, b) => a + b, 0) / rssis.length : null,
      avg_duration: durations.length ? durations.reduce((a, b) => a + b, 0) / durations.length : null,
    };
  }).sort((a, b) => a.rx_offset - b.rx_offset);
}

function calibrationRecommendation(tests) {
  const aggregates = calibrationAggregates(tests);
  const rank = rows => rows.slice().sort((a, b) =>
    (a.avg_ber ?? 999) - (b.avg_ber ?? 999) || b.samples - a.samples || Math.abs(a.rx_offset) - Math.abs(b.rx_offset)
  )[0] || null;
  return {
    aggregates,
    recommended: rank(aggregates.filter(x => x.samples >= CAL_SAMPLE_TARGET)),
    provisional: rank(aggregates),
  };
}

function ensureCalibrationTools() {
  const page = $('calibration');
  if (!page || $('calAggregateCard')) return;

  const record = $('recordCal');
  const adjustRow = record?.parentElement;
  if (adjustRow && !adjustRow.querySelector('[data-delta="-500"]')) {
    const neg = document.createElement('button');
    neg.className = 'btn ctl calAdj'; neg.dataset.delta = '-500'; neg.textContent = '-500';
    const pos = document.createElement('button');
    pos.className = 'btn ctl calAdj'; pos.dataset.delta = '500'; pos.textContent = '+500';
    adjustRow.prepend(neg); adjustRow.append(pos);
  }

  const rawRuns = $('calRows')?.closest('article.card');
  const card = document.createElement('article');
  card.className = 'card';
  card.id = 'calAggregateCard';
  card.innerHTML = `
    <div class="card-title title-row"><span>RX OFFSET SUMMARY</span><span class="hint">${CAL_SAMPLE_TARGET} samples/offset before recommendation</span></div>
    <div id="calSessionSummary" class="hint">No calibration session yet.</div>
    <div class="tablewrap"><table><thead><tr><th>OFFSET</th><th>SAMPLES</th><th>AVG BER</th><th>BEST BER</th><th>AVG RSSI</th></tr></thead><tbody id="calAggregateRows"></tbody></table></div>
    <div class="buttonrow wrap">
      <button class="btn primary ctl" id="calUseBest" disabled>USE BEST RX OFFSET</button>
      <button class="btn" id="calExportJson">EXPORT JSON</button>
      <button class="btn" id="calExportCsv">EXPORT CSV</button>
    </div>
    <p class="hint">The recommendation uses average BER, not one lucky packet. Applying it still requires an explicit confirmation.</p>`;
  if (rawRuns) page.insertBefore(card, rawRuns); else page.append(card);
}

function downloadText(filename, text, type) {
  const blob = new Blob([text], {type});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function exportCalibration(format) {
  const cal = state?.calibration || {tests: []};
  const tests = cal.tests || [];
  const rec = calibrationRecommendation(tests);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  if (format === 'json') {
    const payload = {
      ywd_hotspot_version: state?.build?.version || state?.version || 'unknown',
      branch: state?.build?.branch || 'unknown',
      commit: state?.build?.commit || 'unknown',
      update_channel: state?.build?.update_channel || state?.build?.branch || 'unknown',
      exported_at: new Date().toISOString(),
      session_started_at: cal.session_started_at || null,
      sample_target: CAL_SAMPLE_TARGET,
      baseline: cal.baseline || null,
      samples: tests,
      aggregates: rec.aggregates,
      recommended: rec.recommended,
      provisional: rec.provisional,
    };
    downloadText(`ywd-hotspot-calibration-${stamp}.json`, JSON.stringify(payload, null, 2) + '\n', 'application/json');
    toast('Calibration JSON exported');
    return;
  }
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const lines = ['time,rx_offset_hz,ber_pct,rssi_dbm,duration_s,source,destination'];
  tests.forEach(x => lines.push([x.time, x.rx_offset, x.ber_pct, x.rssi_dbm, x.duration_s, x.source, x.destination].map(q).join(',')));
  downloadText(`ywd-hotspot-calibration-${stamp}.csv`, lines.join('\n') + '\n', 'text/csv');
  toast('Calibration CSV exported');
}

async function useBestCalibration() {
  const tests = state?.calibration?.tests || [];
  const best = calibrationRecommendation(tests).recommended;
  if (!best) return toast(`Need ${CAL_SAMPLE_TARGET} samples at an offset before a recommendation is available`, true);
  const msg = `Use RX offset ${best.rx_offset} Hz?\n\n${best.samples} samples · ${best.avg_ber.toFixed(3)}% average BER.\n\nThis will save/apply the offset and restart the active RF stack.`;
  if (!confirm(msg)) return;
  try {
    await post('/api/config/save', {config: {radio: {rx_offset: best.rx_offset}}});
    await post('/api/config/apply', {});
    toast(`Recommended RX offset ${best.rx_offset} Hz applied`);
    setDirty(false);
    setTimeout(() => { getStatus(); loadConfig(true); }, 900);
  } catch (e) { toast(e.message, true); }
}

function setDirty(v) {
  dirty = !!v;
  const b = $('unsavedBadge');
  if (b) b.hidden = !dirty;
}

function setCtl() {
  const auth = ctlReady();
  const key = !!state?.brandmeister?.api_key_configured;
  $$('.ctl').forEach(b => b.disabled = !auth);
  ['dropQso', 'dropDyn', 'addTg'].forEach(id => $(id).disabled = !(auth && key));
  if ($('restoreBaseline')) $('restoreBaseline').disabled = !(auth && state?.calibration?.baseline);
  const best = calibrationRecommendation(state?.calibration?.tests || []).recommended;
  if ($('calUseBest')) $('calUseBest').disabled = !(auth && best);
  $('loginBtn').hidden = auth;
  $('logoutBtn').hidden = !auth;
  const configured = state?.controls?.auth_configured;
  $('controlState').textContent = !configured
    ? 'Controls locked: run sudo ywd-hotspotctl web-password'
    : auth ? 'Control mode unlocked for this browser session.' : 'Read-only mode. Unlock controls to make changes.';
}

function statusClass(v) {
  return v === 'active' || v === 'connected' ? 'good' : v === 'connecting' ? 'warn' : 'bad';
}

function applyHeardCollapse() {
  const body = $('heardBody');
  const btn = $('toggleHeard');
  const card = $('lastHeardCard');
  if (!body || !btn || !card) return;
  body.hidden = lastHeardCollapsed;
  card.classList.toggle('collapsed', lastHeardCollapsed);
  btn.setAttribute('aria-expanded', lastHeardCollapsed ? 'false' : 'true');
  $('heardChevron').textContent = lastHeardCollapsed ? '⌄' : '⌃';
}

function heardSummary(rows) {
  const lh = (rows || [])[0];
  if (!lh) return 'no calls captured';
  const src = (lh.source || {}).display || '?';
  const dst = lh.destination || {};
  return `${src} → ${dst.group ? 'TG ' : 'PC '}${dst.display || '?'} · ${ago(lh.started_at)}`;
}

function render(d) {
  state = d;
  const uptime = formatUptime(d.system.uptime_s);
  const build = d.build || {};
  const displayVersion = build.version || d.version;
  const buildBranch = build.branch || 'unknown';
  const buildCommit = build.commit_short || ((build.commit && build.commit !== 'unknown') ? String(build.commit).slice(0, 10) : 'unknown');
  const updateChannel = build.update_channel || buildBranch;
  $('version').textContent = `${displayVersion} · ${d.system.hostname || 'hotspot'} · UP ${uptime}`;
  $('buildMeta').textContent = `${buildBranch} @ ${buildCommit} · channel ${updateChannel} · ${build.source || 'unknown source'}${build.source_state ? ' · ' + build.source_state : ''}`;
  $('footerMeta').textContent = `YWD-Hotspot ${displayVersion} · ${buildBranch} @ ${buildCommit} · channel ${updateChannel} · ${d.system.hostname || 'hotspot'} · uptime ${uptime}`;
  if ($('aboutBuildRows')) {
    $('aboutBuildRows').innerHTML =
      kv('Version', displayVersion) +
      kv('Git branch / ref', buildBranch) +
      kv('Update channel', updateChannel) +
      kv('Git commit', build.commit || 'unknown') +
      kv('Commit date', build.commit_date || 'unknown') +
      kv('Source type', build.source || 'unknown') +
      kv('Source state', build.source_state || 'unknown') +
      kv('Installed at', build.installed_at || 'unknown') +
      kv('Host', d.system.hostname || 'unknown') +
      kv('Uptime', uptime);
  }
  setCtl();

  const rf = d.services.mmdvmhost === 'active';
  const bm = d.brandmeister.state === 'connected';
  const w = d.system.wifi || {};
  const temp = d.system.temp_c;
  const throttle = d.system.throttled || {};
  $('strip').innerHTML = `
    <span title="MMDVMHost service: ${esc(d.services.mmdvmhost)}"><i class="dot ${rf ? 'good' : 'bad'}"></i> RF ${rf ? 'READY' : 'DOWN'}</span>
    <span title="${esc(d.brandmeister.detail || 'BrandMeister link state')}"><i class="dot ${bm ? 'good' : d.brandmeister.state === 'connecting' ? 'warn' : 'bad'}"></i> BM ${esc((d.brandmeister.state || '').toUpperCase())}</span>
    <span title="SSID ${esc(w.ssid || 'unknown')} · RX errors ${esc(w.rx_errors ?? '—')} · TX errors ${esc(w.tx_errors ?? '—')}"><i class="dot ${w.connected ? 'good' : 'bad'}"></i> WIFI ${w.signal_dbm ?? '—'} dBm</span>
    <span title="Throttle/power: ${esc(throttle.raw || throttle.value || '0x0')}">TEMP ${temp ?? '—'}°C</span>`;

  const a = d.activity || {};
  const cur = a.current || {};
  const badge = $('activityBadge');
  const viz = $('signalViz');
  if (cur.active) {
    const rx = cur.direction === 'rx';
    badge.className = 'activity ' + (rx ? 'rx' : 'tx');
    badge.innerHTML = `<span class="bigdot"></span><span>${rx ? 'RX FROM RADIO' : 'TX TO RADIO'}</span>`;
    viz.className = 'signal-viz ' + (rx ? 'rx' : 'tx');
    const src = cur.source || {};
    const dst = cur.destination || {};
    $('activityWho').textContent = src.callsign && src.dmr_id ? `${src.callsign} · ${src.dmr_id}` : (src.display || 'unknown');
    $('activityDest').textContent = `→ ${dst.group ? 'TG ' : 'PRIVATE '}${dst.display || '?'}`;
    $('activityMetrics').innerHTML = `<span>slot ${cur.slot ?? '?'}</span><span>${ago(cur.started_at)}</span>`;
  } else {
    badge.className = 'activity idle';
    badge.innerHTML = '<span class="bigdot"></span><span>IDLE</span>';
    viz.className = 'signal-viz idle';
    const lh = (a.lastheard || [])[0];
    $('activityWho').textContent = lh
      ? `Last: ${(lh.source || {}).display || '?'} → ${(lh.destination || {}).group ? 'TG ' : ''}${(lh.destination || {}).display || '?'}`
      : 'Waiting for DMR traffic';
    $('activityDest').textContent = '';
    $('activityMetrics').innerHTML = lh
      ? `<span>${dur(lh.duration_s)}</span><span>BER ${lh.ber_pct ?? '—'}%</span><span>loss ${lh.packet_loss_pct ?? '—'}%</span><span>RSSI ${lh.rssi_dbm ?? '—'} dBm</span>`
      : '';
  }

  $('bmState').textContent = (d.brandmeister.state || '—').toUpperCase();
  $('bmState').className = statusClass(d.brandmeister.state);
  $('bmMaster').textContent = d.config.brandmeister.master || '—';

  const dyn = d.brandmeister.dynamic || [];
  const stat = d.brandmeister.static || [];
  $('dynamicTgs').innerHTML = dyn.length ? dyn.map(x => `<span class="pill dynamic">${esc(tgLabel(x))}</span>`).join('') : '<span class="hint">none</span>';
  $('staticTgsMini').innerHTML = stat.length ? stat.map(x => `<span class="pill">${esc(tgLabel(x))}</span>`).join('') : '<span class="hint">none</span>';
  $('staticTgs').innerHTML = stat.length ? stat.map(x => `<span class="pill">${esc(tgLabel(x))}${ctlReady() && d.brandmeister.api_key_configured ? ` <button data-del-tg="${Number(x.talkgroup)}">×</button>` : ''}</span>`).join('') : '<span class="hint">none</span>';
  $$('[data-del-tg]').forEach(b => b.onclick = () => {
    const tg = Number(b.dataset.delTg);
    if (confirm(`Remove static TG ${tg}?`)) action('/api/bm/static/remove', {talkgroup: tg}, `Static TG ${tg} removed`);
  });

  const heard = a.lastheard || [];
  $('heardSummary').textContent = heardSummary(heard);
  $('heardRows').innerHTML = heard.slice(0, 30).map(x => {
    const src = (x.source || {}).display || '?';
    const dst = x.destination || {};
    let q = `BER ${x.ber_pct ?? '—'}%`;
    if (x.packet_loss_pct != null) q += ` / loss ${x.packet_loss_pct}%`;
    else if (x.rssi_dbm != null) q += ` / ${x.rssi_dbm} dBm`;
    return `<tr><td>${esc(ago(x.started_at))}</td><td>${esc(x.path || '?')}</td><td>${esc(src)}</td><td>${dst.group ? 'TG ' : ''}${esc(dst.display || '?')}</td><td>${esc(dur(x.duration_s))}</td><td>${esc(q)}</td></tr>`;
  }).join('') || '<tr><td colspan="6">No DMR calls captured yet.</td></tr>';
  applyHeardCollapse();

  const r = d.config.radio || {};
  $('radioSummary').innerHTML = kv('Frequency', (Number(r.frequency_hz || 0) / 1e6).toFixed(6) + ' MHz') + kv('Color code', r.color_code) + kv('RX offset', `${r.rx_offset} Hz`) + kv('TX offset', `${r.tx_offset} Hz`);
  const mem = d.system.memory || {}, disk = d.system.disk || {};
  $('systemSummary').innerHTML = kv('Uptime', uptime) + kv('Temperature', (d.system.temp_c ?? '—') + ' °C') + kv('RAM', `${mem.used_mb ?? '—'} / ${mem.total_mb ?? '—'} MB`) + kv('Disk', `${disk.used_pct ?? '—'}% used`);
  $('configSummary').innerHTML = kv('Applied', d.pending.pending ? 'NO — CHANGES PENDING' : 'YES', d.pending.pending ? 'warntext2' : 'goodtext') + kv('Web port', d.config.web.port) + kv('RF autostart', d.config.maintenance.rf_autostart ? 'enabled' : 'disabled');
  $('pendingBadge').textContent = d.pending.pending ? 'CHANGES PENDING — NOT APPLIED' : 'CONFIG APPLIED';
  $('pendingBadge').className = 'badge ' + (d.pending.pending ? 'pending' : 'applied');
  $('hotspotPwStatus').textContent = d.config.brandmeister.password_configured ? 'configured' : 'missing';
  $('apiKeyStatus').textContent = d.brandmeister.api_key_configured ? 'configured' : 'missing';
  renderCalibration(d);
}

function renderCalibration(d) {
  const c = d.config.radio || {};
  const cal = d.calibration || {tests: []};
  const tests = cal.tests || [];
  const rec = calibrationRecommendation(tests);
  const best = rec.recommended;
  const provisional = rec.provisional;
  $('calRxOffset').textContent = `${c.rx_offset ?? 0} Hz`;
  $('calTxOffset').textContent = `${c.tx_offset ?? 0} Hz`;
  const last = (d.activity?.lastheard || []).find(x => (x.direction === 'rx' || x.path === 'RF RX') && x.ber_pct != null);
  $('calLastBer').textContent = last ? `${last.ber_pct}%${last.rssi_dbm != null ? ' · ' + last.rssi_dbm + ' dBm' : ''}` : '—';
  $('calBest').textContent = best
    ? `${best.rx_offset} Hz · ${best.avg_ber.toFixed(3)}% avg BER · ${best.samples} samples`
    : provisional ? `provisional ${provisional.rx_offset} Hz · ${provisional.avg_ber.toFixed(3)}% · ${provisional.samples}/${CAL_SAMPLE_TARGET} samples` : '—';
  const base = cal.baseline;
  $('baselineStatus').textContent = base?.radio
    ? `${base.time || 'saved'} · RX ${base.radio.rx_offset ?? 0} Hz · TX ${base.radio.tx_offset ?? 0} Hz · RX level ${base.radio.rx_level ?? '—'}% · TX level ${base.radio.tx_level ?? '—'}%`
    : 'none saved';
  if ($('restoreBaseline')) $('restoreBaseline').disabled = !(ctlReady() && base);
  if ($('calSessionSummary')) {
    const started = cal.session_started_at ? ago(cal.session_started_at) : 'not started';
    $('calSessionSummary').textContent = `Session ${started} · ${tests.length} sample${tests.length === 1 ? '' : 's'} · ${rec.aggregates.length} offset${rec.aggregates.length === 1 ? '' : 's'} tested · target ${CAL_SAMPLE_TARGET}/offset`;
  }
  if ($('calAggregateRows')) {
    $('calAggregateRows').innerHTML = rec.aggregates.map(x => `<tr class="${best && x.rx_offset === best.rx_offset ? 'bestrow' : ''}"><td>${esc(x.rx_offset)} Hz</td><td>${esc(x.samples)}/${CAL_SAMPLE_TARGET}</td><td>${x.avg_ber == null ? '—' : esc(x.avg_ber.toFixed(3)) + '%'}</td><td>${x.best_ber == null ? '—' : esc(x.best_ber.toFixed(3)) + '%'}</td><td>${x.avg_rssi == null ? '—' : esc(x.avg_rssi.toFixed(1)) + ' dBm'}</td></tr>`).join('') || '<tr><td colspan="5">Record repeated Parrot calls at each RX offset to build the comparison.</td></tr>';
  }
  if ($('calUseBest')) {
    $('calUseBest').disabled = !(ctlReady() && best);
    $('calUseBest').textContent = best ? `USE BEST RX OFFSET · ${best.rx_offset} Hz` : `USE BEST RX OFFSET · NEED ${CAL_SAMPLE_TARGET} SAMPLES`;
  }
  const bestTime = cal.best?.time;
  $('calRows').innerHTML = tests.map(x => `<tr class="${bestTime && x.time === bestTime ? 'bestrow' : ''}"><td>${esc(x.rx_offset)} Hz</td><td>${esc(x.ber_pct)}%</td><td>${esc(x.rssi_dbm ?? '—')} dBm</td><td>${esc(dur(x.duration_s))}</td><td>${esc(x.source || '—')}</td><td>${esc(x.destination || '—')}</td></tr>`).join('') || '<tr><td colspan="6">No calibration runs recorded yet.</td></tr>';
}

async function getStatus() {
  try {
    const r = await fetch('/api/status', {cache: 'no-store'});
    if (!r.ok) throw Error(`HTTP ${r.status}`);
    render(await r.json());
  } catch (e) {
    $('version').textContent = 'dashboard API unavailable';
    if ($('buildMeta')) $('buildMeta').textContent = 'source unavailable';
  }
}

async function post(path, obj = {}) {
  const r = await fetch(path, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(obj)});
  const d = await r.json().catch(() => ({error: `HTTP ${r.status}`}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  return d;
}

async function action(path, obj, msg) {
  try {
    const d = await post(path, obj);
    toast(msg);
    setTimeout(getStatus, 500);
    return d;
  } catch (e) {
    toast(e.message, true);
    throw e;
  }
}

function pathGet(o, path) { return path.split('.').reduce((a, k) => a?.[k], o); }
function pathSet(o, path, v) {
  const p = path.split('.'); let x = o;
  for (let i = 0; i < p.length - 1; i++) x = x[p[i]] ??= Object.create(null);
  x[p.at(-1)] = v;
}

async function loadConfig(force = false) {
  if (dirty && !force) return;
  try {
    const r = await fetch('/api/config', {cache: 'no-store'});
    const d = await r.json();
    configDoc = d.config;
    fillForm(d.config);
    renderHistory(d.history || []);
    renderAudit(d.audit || []);
    setDirty(false);
  } catch (e) { toast('Could not load configuration', true); }
}

function fillForm(c) {
  $$('[data-cfg]').forEach(el => {
    const v = pathGet(c, el.dataset.cfg);
    if (el.type === 'checkbox') el.checked = !!v; else el.value = v ?? '';
  });
  $('frequencyMhz').value = (Number(c.radio.frequency_hz) / 1e6).toFixed(6).replace(/0+$/, '').replace(/\.$/, '');
}

function formConfig() {
  const c = structuredClone(configDoc || state.config);
  $$('[data-cfg]').forEach(el => {
    const path = el.dataset.cfg, old = pathGet(c, path);
    let v = el.type === 'checkbox' ? el.checked : el.value;
    if (typeof old === 'number') v = Number(v);
    pathSet(c, path, v);
  });
  const mhz = Number($('frequencyMhz').value);
  if (!Number.isFinite(mhz) || mhz <= 0) throw Error('Frequency must be a valid MHz value');
  c.radio.frequency_hz = Math.round(mhz * 1e6);
  return c;
}

async function saveConfig(apply) {
  try {
    const c = formConfig();
    const s = await post('/api/config/save', {config: c});
    configDoc = c;
    setDirty(false);
    toast(s.changed?.length ? `Saved ${s.changed.length} change(s)` : 'No changes');
    if (apply) {
      const h = s.hints || {}, parts = [];
      if (h.rf) parts.push('RF/DMR stack');
      if (h.oled) parts.push('OLED');
      if (h.dashboard) parts.push('dashboard');
      if (h.journald) parts.push('journald');
      if (h.autostart) parts.push('boot policy');
      if (s.changed?.length && parts.length && !confirm(`Apply now? Affected: ${parts.join(', ')}.`)) {
        toast('Saved; changes remain pending'); getStatus(); return;
      }
      const a = await post('/api/config/apply', {});
      toast(a.changed?.length ? 'Configuration applied' : 'Configuration already applied');
      if (a.dashboard_restart_pending) {
        const port = a.new_port;
        toast(`Dashboard restarting${port ? ' on port ' + port : ''}…`);
        if (port && Number(port) !== Number(location.port || 80)) setTimeout(() => { location.href = `${location.protocol}//${location.hostname}:${port}/`; }, 4500);
      }
    }
    setTimeout(() => { getStatus(); loadConfig(true); }, 800);
  } catch (e) { toast(e.message, true); }
}

function renderHistory(rows) {
  $('historyRows').innerHTML = rows.length ? rows.map(x => `<div class="row"><span>${esc(x.time)}<br><small>${esc(x.reason)}</small></span><span>${esc((x.changed || []).slice(0, 3).join(', '))}<br>${ctlReady() ? `<button class="btn tiny" data-revert="${esc(x.id)}">REVERT + APPLY</button>` : ''}</span></div>`).join('') : '<div class="hint">No history snapshots yet.</div>';
  $$('[data-revert]').forEach(b => b.onclick = async () => {
    if (!confirm('Restore this saved configuration and apply it now?')) return;
    try {
      const z = await post('/api/config/revert', {id: b.dataset.revert, apply: true});
      toast('Configuration restored'); setDirty(false);
      if (z.apply?.dashboard_restart_pending && z.apply?.new_port) {
        const port = z.apply.new_port; toast(`Dashboard restarting on port ${port}…`);
        setTimeout(() => { location.href = `${location.protocol}//${location.hostname}:${port}/`; }, 4500);
      } else setTimeout(() => { getStatus(); loadConfig(true); }, 1200);
    } catch (e) { toast(e.message, true); }
  });
}

function renderAudit(rows) {
  $('auditRows').innerHTML = rows.length ? rows.slice(0, 30).map(x => `<div class="row"><span>${esc(x.time)}</span><span>${esc(x.action)}</span></div>`).join('') : '<div class="hint">No audit entries yet.</div>';
}

async function loadHealth() {
  try {
    const r = await fetch('/api/health', {cache: 'no-store'}), h = await r.json();
    const w = h.wifi || {}, m = h.memory || {}, d = h.disk || {}, t = h.throttled || {};
    $('healthRows').innerHTML = kv('Temperature', (h.temperature_c ?? '—') + ' °C') + kv('Load', (h.load || []).join(' / ')) + kv('RAM', `${m.used_mb ?? '—'} / ${m.total_mb ?? '—'} MB`) + kv('Swap used', fmtBytesMB(m.swap_used_mb)) + kv('Disk', `${d.used_pct ?? '—'}% · ${d.free_gb ?? '—'} GB free`) + kv('Wi-Fi', `${w.ssid || '—'} · ${w.signal_dbm ?? '—'} dBm`) + kv('Wi-Fi errors', `RX ${w.rx_errors ?? '—'} / TX ${w.tx_errors ?? '—'}`) + kv('Power/throttle', t.value === 0 ? '0x0 — clean' : t.raw || 'unavailable', t.value === 0 ? 'goodtext' : 'warntext2') + kv('Journal', h.journal_disk || '—') + kv('MMDVM restarts', h.services?.['ywd-mmdvmhost.service']?.restarts ?? '—') + kv('Gateway restarts', h.services?.['ywd-dmrgateway.service']?.restarts ?? '—') + kv('Dashboard restarts', h.services?.['ywd-dashboard.service']?.restarts ?? '—');
    const p = h.previous_boot || {};
    $('bootRows').innerHTML = kv('Boot ID', (h.boot_id || '').slice(0, 12)) + kv('Uptime', formatUptime(h.uptime_s)) + kv('Previous boot journal', p.available ? 'available' : 'not available', p.available ? 'goodtext' : 'warntext2') + kv('Previous shutdown', p.shutdown || 'unknown', p.shutdown === 'clean' ? 'goodtext' : p.shutdown === 'unknown' ? '' : 'warntext2');
    $('warningLog').textContent = (h.kernel_warnings || []).join('\n') || 'No matching kernel/hardware warnings in the last 6 hours.';
  } catch (e) { toast('Could not load health data', true); }
}

async function loadLogs() {
  try {
    const r = await fetch('/api/logs', {cache: 'no-store'}), d = await r.json();
    $('mmdvmLog').textContent = (d.mmdvm || []).join('\n');
    $('gwLog').textContent = (d.dmrgateway || []).join('\n');
    $('dashLog').textContent = (d.dashboard || []).join('\n');
  } catch (e) { toast('Could not load logs', true); }
}

function renderLocationResults(d) {
  const rows = d.results || [];
  $('locationAttribution').textContent = d.attribution ? `${d.attribution}${d.cached ? ' · cached result' : ''}` : '';
  $('locationResults').innerHTML = rows.length ? rows.map((x, i) => `<div class="location-result"><div><b>${esc(x.short_name || 'Location')}</b><span>${esc(x.display_name)}</span><small>${esc(x.latitude)}, ${esc(x.longitude)}</small></div><button class="btn tiny use-location" data-i="${i}">USE THIS</button></div>`).join('') : '<div class="hint">No matching approximate locations found. Try city + state or a ZIP/postal code.</div>';
  $$('.use-location').forEach(b => b.onclick = () => {
    const x = rows[Number(b.dataset.i)];
    if (!x) return;
    const lat = document.querySelector('[data-cfg="station.latitude"]');
    const lon = document.querySelector('[data-cfg="station.longitude"]');
    const loc = document.querySelector('[data-cfg="station.location"]');
    lat.value = x.latitude; lon.value = x.longitude;
    if (!loc.value.trim() || loc.value.trim().toLowerCase() === 'hotspot') loc.value = String(x.short_name || '').slice(0, 20);
    setDirty(true);
    toast(`Approximate location loaded: ${x.short_name || x.display_name}`);
  });
}

async function lookupLocation() {
  const q = $('locationQuery').value.trim();
  if (!q) return toast('Enter a city/state or ZIP/postal code', true);
  $('locationResults').innerHTML = '<div class="hint">Looking up approximate location…</div>';
  try { renderLocationResults(await post('/api/location/search', {query: q})); }
  catch (e) { $('locationResults').innerHTML = ''; toast(e.message, true); }
}

async function copyText(text) {
  if (navigator.clipboard && window.isSecureContext) {
    await navigator.clipboard.writeText(text); return;
  }
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.focus(); ta.select();
  const ok = document.execCommand('copy'); document.body.removeChild(ta);
  if (!ok) throw new Error('Browser blocked clipboard access; select the support summary and copy it manually.');
}

async function copySupportSummary() {
  try {
    const sr = await fetch('/api/status', {cache: 'no-store'}), s = await sr.json();
    const hr = await fetch('/api/health', {cache: 'no-store'}), h = await hr.json();
    const r = s.config?.radio || {}, w = h.wifi || {}, m = h.memory || {}, d = h.disk || {}, th = h.throttled || {};
    const calRec = calibrationRecommendation(s.calibration?.tests || []);
    const best = calRec.recommended || calRec.provisional;
    const lines = [
      `YWD-Hotspot ${s.build?.version || s.version}`,
      `Build: ${s.build?.branch || 'unknown'} @ ${s.build?.commit_short || String(s.build?.commit || 'unknown').slice(0, 10)} | channel ${s.build?.update_channel || s.build?.branch || 'unknown'} | ${s.build?.source || 'unknown'} / ${s.build?.source_state || 'unknown'}`,
      `Host: ${s.system?.hostname || 'unknown'} | Uptime: ${formatUptime(s.system?.uptime_s)}`,
      `Services: MMDVM=${s.services?.mmdvmhost} Gateway=${s.services?.dmrgateway} Dashboard=${s.services?.dashboard} Activity=${s.services?.activity} OLED=${s.services?.oled}`,
      `BrandMeister: ${s.brandmeister?.state} | Master: ${s.config?.brandmeister?.master || 'unknown'}`,
      `RF: ${(Number(r.frequency_hz || 0) / 1e6).toFixed(6)} MHz | CC${r.color_code} | RX/TX offset ${r.rx_offset}/${r.tx_offset} Hz | RX/TX level ${r.rx_level}/${r.tx_level}%`,
      `System: ${h.temperature_c ?? '—'} C | throttle ${th.raw || th.value || '0x0'} | RAM ${m.used_mb ?? '—'}/${m.total_mb ?? '—'} MB | disk ${d.used_pct ?? '—'}% used`,
      `Wi-Fi: ${w.ssid || '—'} | ${w.signal_dbm ?? '—'} dBm | errors RX ${w.rx_errors ?? '—'} TX ${w.tx_errors ?? '—'}`,
      `Config: ${s.pending?.pending ? 'PENDING CHANGES' : 'applied'} | RF autostart ${s.config?.maintenance?.rf_autostart ? 'enabled' : 'disabled'}`,
      `Calibration: ${best ? `${calRec.recommended ? 'recommended' : 'provisional'} RX ${best.rx_offset} Hz / ${best.avg_ber.toFixed(3)}% avg BER / ${best.samples} samples` : 'no recorded best'} | baseline ${s.calibration?.baseline ? 'saved' : 'not saved'}`
    ];
    const text = lines.join('\n');
    $('supportPreview').textContent = text;
    await copyText(text);
    toast('Support summary copied');
  } catch (e) { toast(e.message, true); }
}

$$('.tabs button').forEach(b => b.onclick = () => {
  const current = document.querySelector('.tabs button.on')?.dataset.tab;
  if (current === 'settings' && b.dataset.tab !== 'settings' && dirty) {
    if (!confirm('You have unsaved Settings edits. Leave Settings and discard those form edits?')) return;
    if (configDoc) fillForm(configDoc);
    setDirty(false);
  }
  $$('.tabs button').forEach(x => x.classList.remove('on'));
  $$('.page').forEach(x => x.classList.remove('on'));
  b.classList.add('on'); $(b.dataset.tab).classList.add('on');
  if (b.dataset.tab === 'settings') loadConfig();
  if (b.dataset.tab === 'diagnostics') { loadHealth(); loadConfig(true); }
  if (b.dataset.tab === 'logs') loadLogs();
});

$$('[data-cfg],#frequencyMhz').forEach(el => {
  el.addEventListener('input', () => setDirty(true));
  el.addEventListener('change', () => setDirty(true));
});
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });

$('toggleHeard').onclick = () => {
  lastHeardCollapsed = !lastHeardCollapsed;
  localStorage.setItem('ywd.lastheardCollapsed', lastHeardCollapsed ? '1' : '0');
  applyHeardCollapse();
};

$('loginBtn').onclick = () => { $('loginModal').classList.add('on'); $('loginPw').value = ''; setTimeout(() => $('loginPw').focus(), 50); };
$('doLogin').onclick = async () => { try { await post('/api/login', {password: $('loginPw').value}); $('loginModal').classList.remove('on'); toast('Control mode unlocked'); await getStatus(); loadConfig(true); } catch (e) { toast(e.message, true); } };
$('loginPw').onkeydown = e => { if (e.key === 'Enter') $('doLogin').click(); };
$('logoutBtn').onclick = async () => { await post('/api/logout'); toast('Control mode locked'); getStatus(); };
$$('[data-close]').forEach(b => b.onclick = () => $(b.dataset.close).classList.remove('on'));

$('dropQso').onclick = () => action('/api/bm/drop-qso', {}, 'Drop QSO sent');
$('dropDyn').onclick = () => confirm('Drop every dynamic/auto-static TG on this hotspot?') && action('/api/bm/drop-dynamic', {}, 'Dynamic talkgroups dropped');
$('addTg').onclick = () => { const tg = Number($('tgInput').value); if (!Number.isInteger(tg) || tg < 1) return toast('Enter a valid talkgroup', true); action('/api/bm/static/add', {talkgroup: tg}, `Static TG ${tg} added`); };

$('startRf').onclick = () => confirm('Start the RF + BrandMeister stack now?') && action('/api/runtime/rf-start', {}, 'RF stack started');
$('stopRf').onclick = () => confirm('Stop the RF + BrandMeister stack now?') && action('/api/runtime/rf-stop', {}, 'RF stack stopped');
$('restartRf').onclick = () => confirm('Restart the running RF stack?') && action('/api/runtime/rf-restart', {}, 'RF stack restarted');
$('restartOled').onclick = () => action('/api/runtime/restart-service', {service: 'oled'}, 'OLED restarted');
$('restartActivity').onclick = () => action('/api/runtime/restart-service', {service: 'activity'}, 'Activity collector restarted');
$('rebootPi').onclick = () => confirm('REBOOT THE RASPBERRY PI? The dashboard will disconnect for a while.') && action('/api/runtime/reboot', {}, 'Reboot scheduled');

$('saveConfig').onclick = () => saveConfig(false);
$('applyConfig').onclick = () => saveConfig(true);
$('modemDefaults').onclick = () => {
  const d = {rx_offset: 0, tx_offset: 0, rx_level: 50, tx_level: 50, rf_level: 100, jitter_ms: 360, call_hang_s: 3, tx_hang_s: 4, tx_invert: 1, rx_invert: 0};
  Object.entries(d).forEach(([k, v]) => { const el = document.querySelector(`[data-cfg="radio.${k}"]`); if (el) el.value = v; });
  setDirty(true); toast('Modem defaults loaded into the form — not saved yet');
};
$('lookupLocation').onclick = lookupLocation;
$('locationQuery').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); $('lookupLocation').click(); } };

function secret(mode, title, hint, confirmNeeded = true) {
  secretMode = mode; $('secretTitle').textContent = title; $('secretHint').textContent = hint;
  $('secretValue').value = ''; $('secretConfirm').value = ''; $('secretConfirm').hidden = !confirmNeeded;
  $('secretModal').classList.add('on'); setTimeout(() => $('secretValue').focus(), 50);
}
$('changeHotspotPw').onclick = () => secret('hotspot', 'CHANGE HOTSPOT SECURITY PASSWORD', 'This is the BrandMeister Hotspot Security password used by DMRGateway. Saving it applies/reconnects the RF network stack.', true);
$('changeApiKey').onclick = () => secret('api', 'CHANGE BRANDMEISTER API KEY', 'Stored only on the Pi. The browser never reads it back. Note: this dashboard is plain HTTP; use only on a trusted LAN.', false);
$('changeWebPw').onclick = () => secret('web', 'CHANGE WEB CONTROL PASSWORD', 'This replaces the local password used to unlock control mode.', true);
$('saveSecret').onclick = async () => {
  const v = $('secretValue').value, c = $('secretConfirm').value;
  if (secretMode !== 'api' && v !== c) return toast('Passwords do not match', true);
  try {
    if (secretMode === 'hotspot') await post('/api/secrets/hotspot-password', {password: v, apply: true});
    else if (secretMode === 'api') await post('/api/secrets/bm-api-key', {key: v});
    else if (secretMode === 'web') await post('/api/secrets/web-password', {password: v});
    $('secretModal').classList.remove('on'); toast('Credential updated'); getStatus();
  } catch (e) { toast(e.message, true); }
};

ensureCalibrationTools();
$$('.calAdj').forEach(b => b.onclick = async () => {
  if (!confirm(`Change RX offset by ${b.dataset.delta} Hz and restart the active RF stack?`)) return;
  try { const d = await post('/api/calibration/adjust', {which: 'rx', delta: Number(b.dataset.delta)}); toast(`RX offset now ${d.new_offset} Hz`); setTimeout(getStatus, 800); }
  catch (e) { toast(e.message, true); }
});
$$('.txAdj').forEach(b => b.onclick = async () => {
  if (!confirm(`Change TX offset by ${b.dataset.delta} Hz and restart the active RF stack?`)) return;
  try { const d = await post('/api/calibration/adjust', {which: 'tx', delta: Number(b.dataset.delta)}); toast(`TX offset now ${d.new_offset} Hz`); setTimeout(getStatus, 800); }
  catch (e) { toast(e.message, true); }
});
$('recordCal').onclick = async () => { try { await post('/api/calibration/record', {}); toast('Current RF BER recorded'); getStatus(); } catch (e) { toast(e.message, true); } };
$('resetCal').onclick = async () => { if (!confirm('Start a new calibration test? This clears the recorded calibration table but does not change RF settings.')) return; try { await post('/api/calibration/reset', {}); toast('New calibration test started'); getStatus(); } catch (e) { toast(e.message, true); } };
$('saveBaseline').onclick = async () => { try { await post('/api/calibration/baseline/save', {}); toast('Calibration baseline saved'); getStatus(); } catch (e) { toast(e.message, true); } };
$('restoreBaseline').onclick = async () => { if (!confirm('Restore the saved calibration baseline RF settings and apply them now?')) return; try { await post('/api/calibration/baseline/restore', {}); toast('Calibration baseline restored'); setTimeout(() => { getStatus(); loadConfig(true); }, 900); } catch (e) { toast(e.message, true); } };
$('calUseBest').onclick = useBestCalibration;
$('calExportJson').onclick = () => exportCalibration('json');
$('calExportCsv').onclick = () => exportCalibration('csv');

$('makeDiag').onclick = async () => { try { const d = await post('/api/diagnostics/create', {}); $('diagLink').innerHTML = ` <a class="btn" href="/api/diagnostics/${encodeURIComponent(d.filename)}">DOWNLOAD ${esc(d.filename)}</a>`; toast('Diagnostic bundle created'); } catch (e) { toast(e.message, true); } };
$('copySupport').onclick = copySupportSummary;
$('refreshLogs').onclick = loadLogs;

applyHeardCollapse();
getStatus();
loadConfig(true);
setInterval(getStatus, 2500);
