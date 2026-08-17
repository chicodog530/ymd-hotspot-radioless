'use strict';
(() => {
  const $i = id => document.getElementById(id);
  const q = s => document.querySelector(s);
  const qa = s => Array.from(document.querySelectorAll(s));
  const escI = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let lastMode = null;

  function getPath(o, path) { return path.split('.').reduce((a,k) => a?.[k], o); }
  function setField(path, value) {
    const el = q(`[data-cfg="${path}"]`);
    if (!el) return;
    if (el.type === 'checkbox') el.checked = !!value; else el.value = value;
  }

  function settingsHtml() {
    return `<article class="card display-instrument-settings" id="instrumentSettingsCard">
      <div class="card-title title-row"><span>LIVE DMR INSTRUMENTATION</span><span class="hint">browser-side · no extra polling</span></div>
      <p class="hint">Basic mode preserves the current lightweight LIVE DMR card. Enhanced modes draw meters and traces in the browser from the same status payload already used by the dashboard.</p>
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
          <div class="field check"><label><input data-cfg="display.instrumentation.history_rssi" type="checkbox"> RSSI HISTORY</label></div>
          <div class="field check"><label><input data-cfg="display.instrumentation.history_ber" type="checkbox"> BER HISTORY</label></div>
          <div class="field"><label>HISTORY seconds</label><input data-cfg="display.instrumentation.history_seconds" type="number" min="10" max="180"></div>
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
    try {
      if (typeof fillForm === 'function' && (globalThis.configDoc || globalThis.state?.config)) fillForm(globalThis.configDoc || globalThis.state.config);
    } catch (_) {}
  }

  const PRESETS = {
    basic: {enabled:false, preset:'basic', animation:'off', render_fps:5, history_rssi:false, history_ber:false, peak_hold:false},
    balanced: {enabled:true, preset:'balanced', animation:'subtle', render_fps:10, signal_meter:true, quality_meter:true, tx_meter:true, history_rssi:false, history_ber:false, peak_hold:true, live_status_strip:true},
    instrument: {enabled:true, preset:'instrument', animation:'normal', render_fps:10, signal_meter:true, quality_meter:true, tx_meter:true, history_rssi:true, history_ber:true, peak_hold:true, live_status_strip:true},
    maximum: {enabled:true, preset:'maximum', animation:'high', render_fps:20, signal_meter:true, quality_meter:true, tx_meter:true, history_rssi:true, history_ber:true, peak_hold:true, idle_animation:true, live_status_strip:true, show_numeric_values:true}
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
      <div class="instrument-side signal-side"><div class="instrument-label">SIGNAL</div><div id="rssiMeter" class="segment-meter"></div><div id="rssiValue" class="instrument-value">— dBm</div><div id="rssiPeak" class="instrument-sub">peak —</div></div>
      <div class="instrument-center"><div id="instrumentEnergy" class="instrument-energy idle"><span class="energy-ring r1"></span><span class="energy-ring r2"></span><span class="energy-ring r3"></span><span class="energy-core"><i></i></span></div><div id="instrumentMode" class="instrument-mode">IDLE</div><div id="instrumentWho" class="instrument-who">Waiting for DMR traffic</div><div id="instrumentDest" class="instrument-dest"></div></div>
      <div class="instrument-side quality-side"><div class="instrument-label" id="qualityLabel">QUALITY</div><div class="quality-meter"><div id="qualityFill" class="quality-fill"></div></div><div id="qualityValue" class="instrument-value">BER —</div><div id="qualityGrade" class="instrument-sub">—</div></div>
      <div id="txDriveBlock" class="tx-drive" hidden><div><span>TX LEVEL</span><b id="txLevelValue">—%</b><i><em id="txLevelFill"></em></i></div><div><span>RF LEVEL</span><b id="rfLevelValue">—%</b><i><em id="rfLevelFill"></em></i></div></div>
      <div class="instrument-history" id="instrumentHistory"><div id="rssiTraceRow"><span>RSSI</span><svg viewBox="0 0 240 34" preserveAspectRatio="none"><path id="rssiTrace" d=""></path></svg></div><div id="berTraceRow"><span>BER</span><svg viewBox="0 0 240 34" preserveAspectRatio="none"><path id="berTrace" d=""></path></svg></div></div>
      <div id="instrumentMetrics" class="instrument-metrics"></div>
    </div>`);
  }

  function rssiPct(v, cfg) {
    if (v == null || !Number.isFinite(Number(v))) return null;
    return Math.max(0, Math.min(100, (Number(v) - cfg.rssi_min_dbm) / (cfg.rssi_max_dbm - cfg.rssi_min_dbm) * 100));
  }

  function meter(el, pct, cfg) {
    if (!el) return;
    const n = Math.max(6, Math.min(24, Number(cfg.signal_segments) || 14));
    if (cfg.signal_style === 'smooth') {
      el.className = 'segment-meter smooth-meter';
      el.innerHTML = `<span style="width:${pct == null ? 0 : pct}%"></span>`;
      return;
    }
    el.className = 'segment-meter';
    const on = pct == null ? 0 : Math.round(pct / 100 * n);
    el.innerHTML = Array.from({length:n}, (_,i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('');
  }

  function quality(ber, cfg) {
    if (ber == null || !Number.isFinite(Number(ber))) return {pct:null, grade:'—'};
    const b = Number(ber);
    const pct = Math.max(0, Math.min(100, 100 - (b / Math.max(cfg.ber_fair * 2, 1)) * 100));
    const grade = b <= cfg.ber_excellent ? 'EXCELLENT' : b <= cfg.ber_good ? 'GOOD' : b <= cfg.ber_fair ? 'FAIR' : 'POOR';
    return {pct, grade};
  }

  function pathFrom(values, min, max, invert=false) {
    const nums = values.filter(v => v != null && Number.isFinite(Number(v))).map(Number);
    if (!nums.length) return '';
    return nums.map((v,i) => {
      let p = (v - min) / (max - min || 1); p = Math.max(0, Math.min(1,p)); if (invert) p = 1-p;
      const x = nums.length === 1 ? 239 : i * 239 / (nums.length - 1), y = 31 - p * 28;
      return `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(' ');
  }

  function historyRows(d, cfg) {
    const now = Date.now()/1000, sec = Number(cfg.history_seconds)||30;
    return (d.activity?.lastheard || []).filter(x => x && x.started_at && now - Number(x.started_at) <= sec).slice().reverse();
  }

  function updateStrip(d, cfg, cur) {
    if (!cfg.live_status_strip) return;
    const first = $i('strip')?.querySelector('span'); if (!first) return;
    if (cur?.active) {
      const rx = cur.direction === 'rx';
      let bits = [rx ? 'RX' : 'TX'];
      if (rx && cur.rssi_dbm != null) bits.push(`${cur.rssi_dbm} dBm`);
      if (cur.ber_pct != null) bits.push(`BER ${cur.ber_pct}%`);
      if (!rx && cur.destination?.display) bits.push(`${cur.destination.group ? 'TG ' : 'PC '}${cur.destination.display}`);
      first.innerHTML = `<i class="dot good"></i> ${escI(bits.join(' · '))}`;
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
    if (!enabled) { lastMode = 'basic'; return; }

    const cur = d.activity?.current || {};
    const active = !!cur.active, rx = active && cur.direction === 'rx', tx = active && cur.direction === 'tx';
    const latestRf = (d.activity?.lastheard || []).find(x => x?.direction === 'rx' && x.rssi_dbm != null);
    const displayedRssi = cur.rssi_dbm != null ? cur.rssi_dbm : (!active ? latestRf?.rssi_dbm : null);
    const displayedBer = cur.ber_pct != null ? cur.ber_pct : (!active ? latestRf?.ber_pct : null);
    const rp = rssiPct(displayedRssi, cfg);
    meter($i('rssiMeter'), cfg.signal_meter ? rp : null, cfg);
    $i('rssiMeter').closest('.signal-side').hidden = !cfg.signal_meter;
    $i('rssiValue').textContent = cfg.show_numeric_values && displayedRssi != null ? `${displayedRssi} dBm` : (active && rx ? 'measuring…' : '— dBm');
    $i('rssiPeak').textContent = cfg.peak_hold && displayedRssi != null ? `peak ${displayedRssi} dBm` : '';

    const qual = quality(displayedBer, cfg);
    $i('qualityFill').style.height = `${cfg.quality_meter && qual.pct != null ? qual.pct : 0}%`;
    $i('qualityValue').textContent = cfg.show_numeric_values && displayedBer != null ? `BER ${Number(displayedBer).toFixed(1)}%` : (active && rx ? 'BER pending' : 'BER —');
    $i('qualityGrade').textContent = qual.grade;
    $i('qualityFill').closest('.quality-side').hidden = !cfg.quality_meter;

    const src = cur.source?.callsign || cur.source?.display || (active ? 'UNKNOWN' : 'Waiting for DMR traffic');
    const dst = cur.destination || {};
    $i('instrumentMode').textContent = active ? (rx ? 'RX FROM RADIO' : 'TX TO RADIO') : 'IDLE';
    $i('instrumentWho').textContent = src;
    $i('instrumentDest').textContent = active && dst.display ? `→ ${dst.group ? 'TG ' : 'PC '}${dst.display}` : '';
    const energy = $i('instrumentEnergy'); energy.className = `instrument-energy ${rx ? 'rx' : tx ? 'tx' : 'idle'} anim-${cfg.animation || 'normal'}`;
    card.classList.toggle('instrument-reduced', cfg.reduced_motion === 'reduce' || (cfg.reduced_motion === 'system' && matchMedia('(prefers-reduced-motion: reduce)').matches));
    card.classList.toggle('instrument-no-idle', !cfg.idle_animation);
    card.style.setProperty('--instrument-frame', `${Math.max(50, Math.round(1000 / (Number(cfg.render_fps)||10)))}ms`);

    const txb = $i('txDriveBlock'); txb.hidden = !(cfg.tx_meter && tx);
    if (!txb.hidden) {
      const tl = Number(d.config?.radio?.tx_level ?? 0), rl = Number(d.config?.radio?.rf_level ?? 0);
      $i('txLevelValue').textContent = `${tl}%`; $i('rfLevelValue').textContent = `${rl}%`;
      $i('txLevelFill').style.width = `${Math.max(0,Math.min(100,tl))}%`; $i('rfLevelFill').style.width = `${Math.max(0,Math.min(100,rl))}%`;
    }

    const hist = historyRows(d, cfg);
    $i('rssiTraceRow').hidden = !cfg.history_rssi; $i('berTraceRow').hidden = !cfg.history_ber;
    $i('instrumentHistory').hidden = !(cfg.history_rssi || cfg.history_ber);
    if (cfg.history_rssi) $i('rssiTrace').setAttribute('d', pathFrom(hist.map(x=>x.rssi_dbm), Number(cfg.rssi_min_dbm), Number(cfg.rssi_max_dbm)));
    if (cfg.history_ber) $i('berTrace').setAttribute('d', pathFrom(hist.map(x=>x.ber_pct), 0, Math.max(Number(cfg.ber_fair)*2, 10), true));

    const metrics = [];
    if (active) metrics.push(`SLOT ${cur.slot ?? '?'}`);
    if (cur.duration_s != null) metrics.push(`${Number(cur.duration_s).toFixed(1)}s`);
    else if (active && cur.started_at) metrics.push(`${Math.max(0,Math.floor(Date.now()/1000-cur.started_at))}s`);
    if (cur.packet_loss_pct != null) metrics.push(`LOSS ${cur.packet_loss_pct}%`);
    $i('instrumentMetrics').innerHTML = metrics.map(x=>`<span>${escI(x)}</span>`).join('');
    updateStrip(d, cfg, cur);
    lastMode = rx ? 'rx' : tx ? 'tx' : 'idle';
  }

  function init() {
    ensurePanel(); ensureSettings();
    try {
      if (typeof fillForm === 'function' && (globalThis.configDoc || globalThis.state?.config)) fillForm(globalThis.configDoc || globalThis.state.config);
    } catch (_) {}
  }

  window.YWDInstrumentation = {render, init};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
