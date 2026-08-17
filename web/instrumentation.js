'use strict';
(() => {
  const $i = id => document.getElementById(id);
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const escI = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Number(v) || 0));
  let peak = {value: null, until: 0};

  function setField(path, value) {
    const el = q(`[data-cfg="${path}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
  }

  function settingsHtml() {
    return `<article class="card display-instrument-settings" id="instrumentSettingsCard">
      <div class="card-title title-row"><span>LIVE DMR INSTRUMENTATION</span><span class="hint">browser-side · no extra polling</span></div>
      <p class="hint">Basic mode preserves the lightweight LIVE DMR card. Enhanced modes use only measurements the hotspot actually has; unavailable live RF measurements are labeled as sampling/pending rather than guessed.</p>
      <div class="instrument-presets buttonrow wrap">
        <button class="btn presetBtn" type="button" data-preset="basic">BASIC</button>
        <button class="btn presetBtn" type="button" data-preset="balanced">BALANCED</button>
        <button class="btn presetBtn" type="button" data-preset="instrument">INSTRUMENT</button>
        <button class="btn presetBtn" type="button" data-preset="maximum">MAXIMUM SHINY</button>
      </div>
      <div class="formgrid four">
        <div class="field check"><label><input data-cfg="display.instrumentation.enabled" type="checkbox"> ENHANCED INSTRUMENTATION</label></div>
        <div class="field"><label>PRESET</label><select data-cfg="display.instrumentation.preset"><option value="basic">Basic</option><option value="balanced">Balanced</option><option value="instrument">Instrument</option><option value="maximum">Maximum shiny</option><option value="custom">Custom</option></select></div>
        <div class="field"><label>ANIMATION</label><select data-cfg="display.instrumentation.animation"><option value="off">Off</option><option value="subtle">Subtle</option><option value="normal">Normal</option><option value="high">High</option></select></div>
        <div class="field"><label>RENDER RATE</label><select data-cfg="display.instrumentation.render_fps"><option value="5">Low power · 5 fps</option><option value="10">Balanced · 10 fps</option><option value="20">Smooth · 20 fps</option></select></div>
      </div>
      <details class="instrument-details"><summary>METER / TRACE CONFIGURATION</summary>
        <div class="formgrid four instrument-grid">
          <div class="field check"><label><input data-cfg="display.instrumentation.signal_meter" type="checkbox"> RSSI SIGNAL METER</label></div>
          <div class="field"><label>SIGNAL STYLE</label><select data-cfg="display.instrumentation.signal_style"><option value="segmented">Segmented</option><option value="smooth">Smooth</option></select></div>
          <div class="field"><label>SEGMENTS 6–24</label><input data-cfg="display.instrumentation.signal_segments" type="number" min="6" max="24"></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.peak_hold" type="checkbox"> PEAK HOLD</label></div>
          <div class="field"><label>RSSI MIN dBm</label><input data-cfg="display.instrumentation.rssi_min_dbm" type="number"></div>
          <div class="field"><label>RSSI MAX dBm</label><input data-cfg="display.instrumentation.rssi_max_dbm" type="number"></div>
          <div class="field"><label>PEAK HOLD ms</label><input data-cfg="display.instrumentation.peak_hold_ms" type="number" min="0" max="10000"></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.quality_meter" type="checkbox"> BER QUALITY METER</label></div>
          <div class="field"><label>BER EXCELLENT ≤ %</label><input data-cfg="display.instrumentation.ber_excellent" type="number" step="0.1"></div>
          <div class="field"><label>BER GOOD ≤ %</label><input data-cfg="display.instrumentation.ber_good" type="number" step="0.1"></div>
          <div class="field"><label>BER FAIR ≤ %</label><input data-cfg="display.instrumentation.ber_fair" type="number" step="0.1"></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.tx_meter" type="checkbox"> TX DRIVE METER</label></div>
          <div class="field"><label>POST-CALL MEASUREMENT HOLD sec</label><input data-cfg="display.instrumentation.measurement_hold_s" type="number" min="0" max="30"></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.history_rssi" type="checkbox"> RSSI HISTORY</label></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.history_ber" type="checkbox"> BER HISTORY</label></div>
          <div class="field"><label>HISTORY MODE</label><select data-cfg="display.instrumentation.history_mode"><option value="samples">Last samples</option><option value="time">Time window</option></select></div>
          <div class="field"><label>HISTORY SAMPLES</label><input data-cfg="display.instrumentation.history_samples" type="number" min="5" max="60"></div>
          <div class="field"><label>SAMPLE MAX AGE sec</label><input data-cfg="display.instrumentation.history_max_age_s" type="number" min="60" max="3600"></div>
          <div class="field"><label>TIME WINDOW sec</label><input data-cfg="display.instrumentation.history_seconds" type="number" min="10" max="600"></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.idle_animation" type="checkbox"> IDLE ANIMATION</label></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.live_status_strip" type="checkbox"> LIVE TOP STATUS</label></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.show_numeric_values" type="checkbox"> NUMERIC VALUES</label></div>
          <div class="field"><label>METER LABELS</label><select data-cfg="display.instrumentation.meter_labels"><option value="full">Full</option><option value="compact">Compact</option></select></div>
          <div class="field"><label>REDUCED MOTION</label><select data-cfg="display.instrumentation.reduced_motion"><option value="system">Follow system</option><option value="reduce">Force reduced</option><option value="full">Force full</option></select></div>
        </div>
      </details>
    </article>`;
  }

  function oledHtml() {
    return `<article class="card" id="oledRuntimeSettingsCard">
      <div class="card-title">OLED RUNTIME DISPLAY</div>
      <p class="hint">On YWD-Hotspot OS, ywd-headless-oled remains the sole SSD1306/I²C owner. These settings affect presentation only; the OLED process never controls RF or networking.</p>
      <div class="formgrid four">
        <div class="field"><label>RUNTIME MODE</label><select data-cfg="display.runtime_mode"><option value="basic">Basic · current layout</option><option value="enhanced">Enhanced · large callsign</option><option value="minimal">Minimal · RX/TX + call</option></select></div>
        <div class="field"><label>ROTATION</label><select data-cfg="display.rotation"><option value="0">Normal</option><option value="180">180° flipped</option></select></div>
        <div class="field check"><label><input data-cfg="display.large_callsign" type="checkbox"> LARGE CALLSIGN</label></div>
        <div class="field"><label>CALLSIGN SIZE</label><select data-cfg="display.callsign_size"><option value="auto">Auto fit</option><option value="normal">Normal</option><option value="large">Large</option><option value="huge">Huge when it fits</option></select></div>
        <div class="field check"><label><input data-cfg="display.show_talkgroup" type="checkbox"> SHOW DESTINATION</label></div>
        <div class="field"><label>TALKGROUP FORMAT</label><select data-cfg="display.talkgroup_format"><option value="number">Number</option><option value="name">Cached name</option><option value="name_number">Name + number</option></select></div>
        <div class="field check"><label><input data-cfg="display.show_slot" type="checkbox"> SHOW SLOT</label></div>
        <div class="field check"><label><input data-cfg="display.show_elapsed" type="checkbox"> SHOW ELAPSED</label></div>
        <div class="field check"><label><input data-cfg="display.show_ber" type="checkbox"> SHOW BER</label></div>
        <div class="field check"><label><input data-cfg="display.show_rssi" type="checkbox"> SHOW RSSI</label></div>
        <div class="field check"><label><input data-cfg="display.show_loss" type="checkbox"> SHOW PACKET LOSS</label></div>
        <div class="field"><label>POST-CALL HOLD sec</label><input data-cfg="display.post_call_hold_s" type="number" min="0" max="30"></div>
        <div class="field check"><label><input data-cfg="display.idle_cycle" type="checkbox"> CYCLE IDLE PAGES</label></div>
        <div class="field"><label>IDLE PAGE seconds</label><input data-cfg="display.idle_cycle_s" type="number" min="2" max="60"></div>
      </div>
    </article>`;
  }

  function ensureSettings() {
    if ($i('instrumentSettingsCard')) return;
    const settings = $i('settings');
    if (!settings) return;
    const policy = Array.from(settings.querySelectorAll('article.card')).find(x => x.textContent.includes('APPLIANCE POLICY'));
    if (policy) {
      policy.insertAdjacentHTML('beforebegin', oledHtml());
      policy.insertAdjacentHTML('beforebegin', settingsHtml());
    } else {
      settings.insertAdjacentHTML('beforeend', oledHtml() + settingsHtml());
    }
    bindSettings();
  }

  const PRESETS = {
    basic: {enabled:false, preset:'basic', animation:'off', render_fps:5, history_rssi:false, history_ber:false, peak_hold:false},
    balanced: {enabled:true, preset:'balanced', animation:'subtle', render_fps:10, signal_meter:true, quality_meter:true, tx_meter:true, measurement_hold_s:4, history_rssi:false, history_ber:false, peak_hold:true, live_status_strip:true},
    instrument: {enabled:true, preset:'instrument', animation:'normal', render_fps:10, signal_meter:true, quality_meter:true, tx_meter:true, measurement_hold_s:5, history_rssi:true, history_ber:true, history_mode:'samples', history_samples:20, history_max_age_s:900, peak_hold:true, live_status_strip:true},
    maximum: {enabled:true, preset:'maximum', animation:'high', render_fps:20, signal_meter:true, quality_meter:true, tx_meter:true, measurement_hold_s:6, history_rssi:true, history_ber:true, history_mode:'samples', history_samples:30, history_max_age_s:1200, peak_hold:true, idle_animation:true, live_status_strip:true, show_numeric_values:true}
  };

  function applyPreset(name) {
    const p = PRESETS[name]; if (!p) return;
    Object.entries(p).forEach(([k,v]) => setField(`display.instrumentation.${k}`, v));
    try { if (typeof setDirty === 'function') setDirty(true); } catch (_) {}
  }

  function bindSettings() {
    qa('.presetBtn').forEach(b => b.addEventListener('click', () => applyPreset(b.dataset.preset)));
    qa('[data-cfg^="display.instrumentation."]').forEach(el => el.addEventListener('change', () => {
      if (!el.dataset.cfg.endsWith('.preset')) setField('display.instrumentation.preset', el.dataset.cfg.endsWith('.enabled') && !el.checked ? 'basic' : 'custom');
    }));
    q('[data-cfg="display.instrumentation.preset"]')?.addEventListener('change', e => {
      if (PRESETS[e.target.value]) applyPreset(e.target.value);
    });
  }

  function ensurePanel() {
    const card = q('#status .live-card');
    if (!card || $i('instrumentPanel')) return;
    card.insertAdjacentHTML('beforeend', `<div id="instrumentPanel" class="instrument-panel" hidden>
      <div class="instrument-side signal-side"><div class="instrument-label" id="signalLabel">SIGNAL</div><div id="rssiMeter" class="segment-meter"></div><div id="rssiValue" class="instrument-value">— dBm</div><div id="rssiPeak" class="instrument-sub"></div></div>
      <div class="instrument-center"><div id="instrumentEnergy" class="instrument-energy idle"><span class="energy-ring r1"></span><span class="energy-ring r2"></span><span class="energy-ring r3"></span><span class="energy-core"><i></i></span></div><div id="instrumentMode" class="instrument-mode">IDLE</div><div id="instrumentWho" class="instrument-who">Waiting for DMR traffic</div><div id="instrumentDest" class="instrument-dest"></div></div>
      <div class="instrument-side quality-side"><div class="instrument-label" id="qualityLabel">QUALITY</div><div class="quality-meter"><div id="qualityFill" class="quality-fill" data-level="0"></div></div><div id="qualityValue" class="instrument-value">BER —</div><div id="qualityGrade" class="instrument-sub"></div></div>
      <div id="txDriveBlock" class="tx-drive" hidden><div><span>TX LEVEL</span><b id="txLevelValue">—%</b><i><em id="txLevelFill" data-level="0"></em></i></div><div><span>RF LEVEL</span><b id="rfLevelValue">—%</b><i><em id="rfLevelFill" data-level="0"></em></i></div></div>
      <div id="networkQualityBlock" class="network-quality" hidden><span>NETWORK QUALITY</span><b id="networkQualityValue">PENDING</b><small id="networkQualityDetail">Measured when the network transmission ends</small></div>
      <div class="instrument-history" id="instrumentHistory"><div id="rssiTraceRow"><span>RSSI</span><svg viewBox="0 0 240 34" preserveAspectRatio="none"><path id="rssiTrace" d=""></path></svg></div><div id="berTraceRow"><span>BER</span><svg viewBox="0 0 240 34" preserveAspectRatio="none"><path id="berTrace" d=""></path></svg></div></div>
      <div id="instrumentMetrics" class="instrument-metrics"></div>
    </div>`);
  }

  function pctLevel(value) {
    const p = clamp(value, 0, 100);
    return String(Math.round(p / 5) * 5);
  }

  function setLevel(el, pct) {
    if (el) el.dataset.level = pctLevel(pct == null ? 0 : pct);
  }

  function rssiPct(v, cfg) {
    if (v == null || !Number.isFinite(Number(v))) return null;
    return clamp((Number(v) - Number(cfg.rssi_min_dbm)) / (Number(cfg.rssi_max_dbm) - Number(cfg.rssi_min_dbm)) * 100, 0, 100);
  }

  function meter(el, pct, cfg) {
    if (!el) return;
    const n = clamp(cfg.signal_segments || 14, 6, 24);
    if (cfg.signal_style === 'smooth') {
      el.className = 'segment-meter smooth-meter';
      let span = el.querySelector('span');
      if (!span) { el.innerHTML = '<span data-level="0"></span>'; span = el.querySelector('span'); }
      setLevel(span, pct);
      return;
    }
    el.className = 'segment-meter';
    const on = pct == null ? 0 : Math.round(clamp(pct,0,100) / 100 * n);
    el.innerHTML = Array.from({length:n}, (_,i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');
  }

  function quality(ber, cfg) {
    if (ber == null || !Number.isFinite(Number(ber))) return {pct:null, grade:''};
    const b = Number(ber);
    const pct = clamp(100 - (b / Math.max(Number(cfg.ber_fair) * 2, 1)) * 100, 0, 100);
    const grade = b <= cfg.ber_excellent ? 'EXCELLENT' : b <= cfg.ber_good ? 'GOOD' : b <= cfg.ber_fair ? 'FAIR' : 'POOR';
    return {pct, grade};
  }

  function pathFrom(values, min, max, invert=false) {
    const nums = values.filter(v => v != null && Number.isFinite(Number(v))).map(Number);
    if (!nums.length) return '';
    return nums.map((v,i) => {
      let p = (v - min) / (max - min || 1); p = clamp(p,0,1); if (invert) p = 1-p;
      const x = nums.length === 1 ? 239 : i * 239 / (nums.length - 1), y = 31 - p * 28;
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function completedRows(d) {
    return (d.activity?.lastheard || []).filter(x => x && !x.active && x.ended_at);
  }

  function historyRows(d, cfg) {
    const rows = completedRows(d).filter(x => x.path === 'RF' && (x.rssi_dbm != null || x.ber_pct != null));
    if (cfg.history_mode === 'time') {
      const cutoff = Date.now()/1000 - Number(cfg.history_seconds || 60);
      return rows.filter(x => Number(x.ended_at || x.started_at || 0) >= cutoff).slice().reverse();
    }
    const cutoff = Date.now()/1000 - Number(cfg.history_max_age_s || 900);
    return rows.filter(x => Number(x.ended_at || x.started_at || 0) >= cutoff).slice(0, Number(cfg.history_samples || 20)).reverse();
  }

  function recentCompleted(d, direction, holdSeconds) {
    const now = Date.now()/1000;
    const row = completedRows(d).find(x => x.direction === direction);
    if (!row) return null;
    const ended = Number(row.ended_at || 0);
    return ended && now - ended <= Number(holdSeconds || 0) ? row : null;
  }

  function latestRf(d) {
    return completedRows(d).find(x => x.path === 'RF' && (x.rssi_dbm != null || x.ber_pct != null)) || null;
  }

  function latestNetwork(d) {
    return completedRows(d).find(x => x.path === 'NETWORK' && (x.packet_loss_pct != null || x.ber_pct != null)) || null;
  }

  function updatePeak(rssi, cfg) {
    const now = Date.now();
    if (!cfg.peak_hold || rssi == null) { peak = {value:null, until:0}; return null; }
    if (peak.value == null || Number(rssi) > Number(peak.value) || now > peak.until) {
      peak.value = Number(rssi); peak.until = now + Number(cfg.peak_hold_ms || 0);
    }
    if (now > peak.until) peak = {value:Number(rssi), until:now + Number(cfg.peak_hold_ms || 0)};
    return peak.value;
  }

  function updateStrip(cfg, cur) {
    if (!cfg.live_status_strip || !cur?.active) return;
    const first = $i('strip')?.querySelector('span'); if (!first) return;
    const rx = cur.direction === 'rx';
    const bits = [rx ? 'RX' : 'TX'];
    if (rx && cur.rssi_dbm != null) bits.push(`${cur.rssi_dbm} dBm`);
    if (cur.ber_pct != null) bits.push(`BER ${cur.ber_pct}%`);
    if (!rx && cur.destination?.display) bits.push(`${cur.destination.group ? 'TG ' : 'PC '}${cur.destination.display}`);
    first.innerHTML = `<i class="dot good"></i> ${escI(bits.join(' · '))}`;
  }

  function setMotionClasses(card, cfg) {
    const fps = [5,10,20].includes(Number(cfg.render_fps)) ? Number(cfg.render_fps) : 10;
    card.classList.remove('fps-5','fps-10','fps-20');
    card.classList.add(`fps-${fps}`);
    card.classList.toggle('instrument-reduced', cfg.reduced_motion === 'reduce' || (cfg.reduced_motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches));
    card.classList.toggle('instrument-no-idle', !cfg.idle_animation);
  }

  function renderRx(d, cfg, cur, completed) {
    const row = cur?.active ? cur : completed;
    const measured = !cur?.active && !!completed;
    const fallback = !row ? latestRf(d) : null;
    const sample = row || fallback || {};
    const rssi = sample.rssi_dbm;
    const ber = sample.ber_pct;
    const rp = rssiPct(rssi, cfg);
    meter($i('rssiMeter'), cfg.signal_meter ? rp : null, cfg);
    $i('signalLabel').textContent = measured ? 'SIGNAL · COMPLETE' : fallback ? 'LAST SIGNAL' : 'SIGNAL';
    $i('rssiValue').textContent = rssi != null && cfg.show_numeric_values ? `${rssi} dBm` : (cur?.active ? 'SAMPLING…' : '— dBm');
    const p = updatePeak(rssi, cfg);
    $i('rssiPeak').textContent = p != null ? `peak ${p} dBm` : (cur?.active ? 'measurement at end of call' : '');

    const qual = quality(ber, cfg);
    setLevel($i('qualityFill'), cfg.quality_meter && qual.pct != null ? qual.pct : 0);
    $i('qualityLabel').textContent = measured ? 'QUALITY · COMPLETE' : fallback ? 'LAST QUALITY' : 'QUALITY';
    $i('qualityValue').textContent = ber != null && cfg.show_numeric_values ? `BER ${Number(ber).toFixed(1)}%` : (cur?.active ? 'MEASURING…' : 'BER —');
    $i('qualityGrade').textContent = qual.grade || (cur?.active ? 'reported at end of call' : '');
    q('.signal-side').hidden = !cfg.signal_meter;
    q('.quality-side').hidden = !cfg.quality_meter;
    $i('txDriveBlock').hidden = true;
    $i('networkQualityBlock').hidden = true;
  }

  function renderTx(d, cfg, cur, completed) {
    q('.signal-side').hidden = true;
    q('.quality-side').hidden = true;
    const txb = $i('txDriveBlock'); txb.hidden = !cfg.tx_meter;
    const tl = Number(d.config?.radio?.tx_level ?? 0), rl = Number(d.config?.radio?.rf_level ?? 0);
    $i('txLevelValue').textContent = `${tl}%`; $i('rfLevelValue').textContent = `${rl}%`;
    setLevel($i('txLevelFill'), tl); setLevel($i('rfLevelFill'), rl);

    const net = completed || (cur?.active ? null : latestNetwork(d));
    const block = $i('networkQualityBlock'); block.hidden = false;
    if (net && (net.packet_loss_pct != null || net.ber_pct != null)) {
      const bits = [];
      if (net.packet_loss_pct != null) bits.push(`LOSS ${net.packet_loss_pct}%`);
      if (net.ber_pct != null) bits.push(`BER ${Number(net.ber_pct).toFixed(1)}%`);
      $i('networkQualityValue').textContent = bits.join(' · ');
      $i('networkQualityDetail').textContent = completed ? 'completed network → RF transmission' : 'last completed network transmission';
    } else {
      $i('networkQualityValue').textContent = 'PENDING';
      $i('networkQualityDetail').textContent = 'Measured when the network transmission ends';
    }
  }

  function render(d) {
    ensurePanel(); ensureSettings();
    const card = q('#status .live-card'), panel = $i('instrumentPanel');
    if (!card || !panel) return;
    const cfg = d.config?.display?.instrumentation || {};
    const enabled = !!cfg.enabled;
    card.classList.toggle('instrument-active', enabled);
    panel.hidden = !enabled;
    if (!enabled) return;

    setMotionClasses(card, cfg);
    const cur = d.activity?.current || {};
    const hold = Number(cfg.measurement_hold_s || 0);
    const active = !!cur.active;
    const activeRx = active && cur.direction === 'rx';
    const activeTx = active && cur.direction === 'tx';
    const heldRx = !active ? recentCompleted(d, 'rx', hold) : null;
    const heldTx = !active ? recentCompleted(d, 'tx', hold) : null;
    const mode = activeRx || heldRx ? 'rx' : activeTx || heldTx ? 'tx' : 'idle';
    panel.classList.remove('mode-rx','mode-tx','mode-idle'); panel.classList.add(`mode-${mode}`);

    if (mode === 'rx') renderRx(d, cfg, activeRx ? cur : null, heldRx);
    else if (mode === 'tx') renderTx(d, cfg, activeTx ? cur : null, heldTx);
    else renderRx(d, cfg, null, null);

    const event = active ? cur : (heldRx || heldTx || null);
    const src = event?.source?.callsign || event?.source?.display || (mode === 'idle' ? 'Waiting for DMR traffic' : 'UNKNOWN');
    const dst = event?.destination || {};
    const stateText = activeRx ? 'RX FROM RADIO' : activeTx ? 'TX TO RADIO' : heldRx ? 'RX COMPLETE' : heldTx ? 'TX COMPLETE' : 'IDLE';
    $i('instrumentMode').textContent = stateText;
    $i('instrumentWho').textContent = src;
    $i('instrumentDest').textContent = event && dst.display ? `→ ${dst.group ? 'TG ' : 'PC '}${dst.display}` : '';
    const energy = $i('instrumentEnergy');
    energy.className = `instrument-energy ${mode === 'rx' ? 'rx' : mode === 'tx' ? 'tx' : 'idle'} anim-${cfg.animation || 'normal'}`;

    const hist = historyRows(d, cfg);
    $i('rssiTraceRow').hidden = !cfg.history_rssi;
    $i('berTraceRow').hidden = !cfg.history_ber;
    $i('instrumentHistory').hidden = !(cfg.history_rssi || cfg.history_ber);
    if (cfg.history_rssi) $i('rssiTrace').setAttribute('d', pathFrom(hist.map(x=>x.rssi_dbm), Number(cfg.rssi_min_dbm), Number(cfg.rssi_max_dbm)));
    if (cfg.history_ber) $i('berTrace').setAttribute('d', pathFrom(hist.map(x=>x.ber_pct), 0, Math.max(Number(cfg.ber_fair)*2, 10), true));

    const metrics = [];
    if (event) metrics.push(`SLOT ${event.slot ?? '?'}`);
    if (event?.duration_s != null) metrics.push(`${Number(event.duration_s).toFixed(1)}s`);
    else if (active && event?.started_at) metrics.push(`${Math.max(0,Math.floor(Date.now()/1000-event.started_at))}s`);
    if (event?.packet_loss_pct != null) metrics.push(`LOSS ${event.packet_loss_pct}%`);
    if (!active && (heldRx || heldTx)) metrics.push(`HOLD ${Math.max(0, hold - Math.floor(Date.now()/1000-Number(event.ended_at || 0)))}s`);
    $i('instrumentMetrics').innerHTML = metrics.map(x=>`<span>${escI(x)}</span>`).join('');
    updateStrip(cfg, cur);
  }

  function init() { ensurePanel(); ensureSettings(); }

  window.YWDInstrumentation = {render, init};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
