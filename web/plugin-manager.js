'use strict';
(() => {
  let pluginState = null;

  const el = id => document.getElementById(id);
  const escp = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unlocked = () => !!el('logoutBtn') && !el('logoutBtn').hidden;
  const notify = (message, bad = false) => {
    try { if (typeof toast === 'function') return toast(message, bad); } catch (_) {}
    console[bad ? 'error' : 'log'](message);
  };

  async function jsonFetch(url, options = {}) {
    const response = await fetch(url, {credentials:'same-origin', cache:'no-store', ...options});
    let data = {};
    try { data = await response.json(); } catch (_) {}
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    return data;
  }

  async function post(url, body) {
    return jsonFetch(url, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body || {})});
  }

  async function confirmYwd(options) {
    if (typeof window.ywdConfirm !== 'function') {
      throw new Error('YWD confirmation UI is unavailable. Reload the dashboard and try again.');
    }
    return window.ywdConfirm(options);
  }

  function beginBusy(button, label) {
    if (!button) return () => {};
    const previous = button.textContent;
    button.dataset.pluginBusy = '1';
    button.disabled = true;
    button.classList.add('ywd-working');
    button.setAttribute('aria-busy', 'true');
    if (label) button.textContent = label;
    return () => {
      if (!button.isConnected) return;
      delete button.dataset.pluginBusy;
      button.classList.remove('ywd-working');
      button.removeAttribute('aria-busy');
      if (!label || button.textContent === label) button.textContent = previous;
    };
  }

  function formatUptime(seconds) {
    const total = Math.max(0, Math.floor(Number(seconds) || 0));
    const days = Math.floor(total / 86400);
    const hours = Math.floor((total % 86400) / 3600);
    const mins = Math.floor((total % 3600) / 60);
    return days ? `${days}d ${hours}h ${mins}m` : hours ? `${hours}h ${mins}m` : `${mins}m`;
  }

  function ensureUi() {
    if (el('plugins')) return;
    const nav = document.querySelector('.tabs');
    const aboutButton = nav?.querySelector('[data-tab="about"]');
    if (!nav || !aboutButton) return;

    const button = document.createElement('button');
    button.dataset.tab = 'plugins';
    button.textContent = 'PLUGINS';
    nav.insertBefore(button, aboutButton);

    const page = document.createElement('section');
    page.className = 'page';
    page.id = 'plugins';
    page.innerHTML = `
      <article class="card plugin-hero">
        <div>
          <div class="card-title">PLUGIN SUBSYSTEM</div>
          <div id="pluginSystemState" class="plugin-system-state disabled">DISABLED</div>
          <div id="pluginSystemMessage" class="hint">Plugin support is loading…</div>
          <div id="pluginSummary" class="plugin-summary"></div>
        </div>
        <div class="buttonrow wrap">
          <button class="btn primary" id="pluginSystemToggle" data-plugin-action="system-toggle">ENABLE PLUGIN SUPPORT</button>
        </div>
      </article>
      <div id="pluginMasterNotice" class="notice plugin-warning">When disabled, plugin packages remain installed but no plugin is active and plugin services are not permitted to run.</div>
      <article class="card">
        <div class="card-title title-row"><span>PLUGIN MANAGER</span><span class="hint">API v1 · declarative-only</span></div>
        <p class="plugin-api-note">The Plugin Manager is trusted YWD-Hotspot core. Plugin API v1 reads validated first-party manifests and configuration schemas only; plugin Python/JavaScript is not imported or executed.</p>
      </article>
      <div id="pluginCards" class="plugin-grid"><article class="card plugin-empty">Loading installed plugins…</article></div>`;
    const about = el('about');
    if (about?.parentElement) about.parentElement.insertBefore(page, about); else document.querySelector('main')?.append(page);

    button.onclick = () => {
      const current = document.querySelector('.tabs button.on')?.dataset.tab;
      try {
        if (current === 'settings' && typeof dirty !== 'undefined' && dirty) {
          if (!confirm('You have unsaved Settings edits. Leave Settings and discard those form edits?')) return;
          if (typeof configDoc !== 'undefined' && configDoc && typeof fillForm === 'function') fillForm(configDoc);
          if (typeof setDirty === 'function') setDirty(false);
        }
      } catch (_) {}
      document.querySelectorAll('.tabs button').forEach(x => x.classList.remove('on'));
      document.querySelectorAll('.page').forEach(x => x.classList.remove('on'));
      button.classList.add('on'); page.classList.add('on');
      loadPlugins();
    };

    page.addEventListener('click', handleClick);
  }

  function schemaField(plugin, field) {
    const id = escp(plugin.id), key = escp(field.key), value = plugin.config?.[field.key] ?? field.default ?? '';
    const common = `data-plugin-config="${id}" data-plugin-field="${key}" data-field-type="${escp(field.type)}"`;
    let control = '';
    if (field.type === 'boolean') {
      control = `<div class="field check"><label><input type="checkbox" ${common}${value ? ' checked' : ''}> ${escp(field.label)}</label></div>`;
    } else if (field.type === 'select') {
      const options = (field.options || []).map(option => `<option value="${escp(option)}"${String(value) === String(option) ? ' selected' : ''}>${escp(option)}</option>`).join('');
      control = `<div class="field"><label>${escp(field.label)}</label><select ${common}>${options}</select></div>`;
    } else {
      const type = field.type === 'integer' ? 'number' : 'text';
      const min = field.min != null ? ` min="${escp(field.min)}"` : '';
      const max = field.max != null ? ` max="${escp(field.max)}"` : '';
      const maxlength = field.max_length != null ? ` maxlength="${escp(field.max_length)}"` : '';
      control = `<div class="field"><label>${escp(field.label)}</label><input type="${type}" value="${escp(value)}" ${common}${min}${max}${maxlength}></div>`;
    }
    if (field.help) control += `<div class="plugin-help">${escp(field.help)}</div>`;
    return control;
  }

  function pluginCard(plugin, systemEnabled) {
    const good = plugin.health === 'active';
    const bad = plugin.health === 'error';
    const status = bad ? 'ERROR' : good ? 'ACTIVE' : 'DISABLED';
    const caps = (plugin.capabilities || []).map(cap => `<span class="plugin-cap">${escp(cap)}</span>`).join('') || '<span class="plugin-cap">no capabilities</span>';
    const fields = plugin.valid ? (plugin.schema?.fields || []).map(field => schemaField(plugin, field)).join('') : '';
    const data = plugin.data || {};
    const liveRows = plugin.effective_enabled ? [
      data.label ? `<div><span>Label</span><b>${escp(data.label)}</b></div>` : '',
      data.hostname ? `<div><span>Hostname</span><b>${escp(data.hostname)}</b></div>` : '',
      data.uptime_s != null ? `<div><span>Uptime</span><b>${escp(formatUptime(data.uptime_s))}</b></div>` : '',
      data.temperature_c != null ? `<div><span>Temperature</span><b>${escp(data.temperature_c)} °C</b></div>` : '',
      Array.isArray(data.load) ? `<div><span>Load</span><b>${escp(data.load.map(x => Number(x).toFixed(2)).join(' / '))}</b></div>` : '',
    ].filter(Boolean).join('') : '';
    const errorText = plugin.error || plugin.config_error || '';
    return `<article class="card plugin-card${good ? ' active' : ''}${bad ? ' error' : ''}" data-plugin-card="${escp(plugin.id)}">
      <div class="plugin-title">
        <div><h3>${escp(plugin.name)}</h3><small>${escp(plugin.id)} · v${escp(plugin.version)}</small></div>
        <span class="badge ${good ? 'applied' : bad ? 'pending' : ''}">${status}</span>
      </div>
      <p class="plugin-description">${escp(plugin.description || errorText || 'Plugin package could not be loaded.')}</p>
      <div class="plugin-meta">
        <div><span>Trust</span><b>${escp(plugin.trust || 'unknown')}</b></div>
        <div><span>Model</span><b>${escp(plugin.kind || 'invalid')}</b></div>
        <div><span>RF mode</span><b>${plugin.rf_mode ? 'YES' : 'NO'}</b></div>
        <div><span>Service</span><b>${escp(plugin.service || 'none')}</b></div>
      </div>
      <div class="plugin-caps">${caps}</div>
      ${errorText ? `<div class="notice plugin-warning">${escp(errorText)}</div>` : ''}
      ${liveRows ? `<div class="plugin-meta">${liveRows}</div>` : ''}
      <div class="buttonrow wrap">
        <button class="btn ${plugin.enabled ? 'danger' : 'good'}" data-plugin-action="plugin-toggle" data-plugin-id="${escp(plugin.id)}" data-enabled="${plugin.enabled ? '0' : '1'}"${!plugin.valid || !systemEnabled ? ' disabled' : ''}>${plugin.enabled ? 'DISABLE' : 'ENABLE'}</button>
        <button class="btn" data-plugin-action="plugin-test" data-plugin-id="${escp(plugin.id)}"${!plugin.effective_enabled ? ' disabled' : ''}>TEST</button>
      </div>
      <div id="pluginResult-${escp(plugin.id)}" class="plugin-result" hidden></div>
      ${plugin.valid ? `<details class="plugin-config"><summary>CONFIGURE</summary><div class="plugin-config-grid">${fields}</div><div class="buttonrow"><button class="btn primary" data-plugin-action="config-save" data-plugin-id="${escp(plugin.id)}">SAVE PLUGIN CONFIG</button></div></details>` : ''}
    </article>`;
  }

  function render(data) {
    pluginState = data;
    ensureUi();
    const system = data?.system || {enabled:false, installed:0, active_plugins:0, enabled_plugins:0, health:'disabled'};
    const stateEl = el('pluginSystemState');
    stateEl.textContent = system.enabled ? 'ENABLED' : 'DISABLED';
    stateEl.className = `plugin-system-state ${system.enabled ? 'good' : 'disabled'}`;
    el('pluginSystemMessage').textContent = system.enabled
      ? 'Plugin support is enabled. Only explicitly enabled, validated plugins may become active.'
      : 'Plugin runtime is off. Individual plugins are disabled and will not auto-reactivate when the subsystem is enabled again.';
    el('pluginSummary').innerHTML = `
      <span class="badge">API ${escp(data?.api ?? 1)}</span>
      <span class="badge">${escp(system.installed || 0)} INSTALLED</span>
      <span class="badge">${escp(system.enabled_plugins || 0)} ENABLED</span>
      <span class="badge">${escp(system.active_plugins || 0)} ACTIVE</span>
      <span class="badge">${escp(system.execution_model || 'declarative-only')}</span>`;
    const toggle = el('pluginSystemToggle');
    toggle.textContent = system.enabled ? 'DISABLE ALL PLUGINS' : 'ENABLE PLUGIN SUPPORT';
    toggle.className = `btn ${system.enabled ? 'danger' : 'primary'}`;
    toggle.dataset.enabled = system.enabled ? '0' : '1';
    toggle.disabled = !unlocked();
    const notice = el('pluginMasterNotice');
    notice.className = `notice ${system.enabled ? 'plugin-good' : 'plugin-warning'}`;
    notice.textContent = system.enabled
      ? 'Plugin subsystem active. Master disable stops/unloads active plugins, clears their activation state, and leaves core DMR operation alone.'
      : 'Plugin subsystem disabled. Plugin configuration is preserved, but every plugin activation state is OFF until explicitly enabled again.';
    const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
    el('pluginCards').innerHTML = plugins.length ? plugins.map(p => pluginCard(p, !!system.enabled)).join('') : '<article class="card plugin-empty">No plugin packages are installed.</article>';
    refreshControls();
  }

  function refreshControls() {
    const auth = unlocked();
    const systemEnabled = !!pluginState?.system?.enabled;
    const master = el('pluginSystemToggle');
    if (master) master.disabled = !auth || master.dataset.pluginBusy === '1';
    document.querySelectorAll('#plugins [data-plugin-action="plugin-toggle"]').forEach(button => {
      const plugin = (pluginState?.plugins || []).find(p => p.id === button.dataset.pluginId);
      button.disabled = button.dataset.pluginBusy === '1' || !auth || !systemEnabled || !plugin?.valid;
    });
    document.querySelectorAll('#plugins [data-plugin-action="plugin-test"]').forEach(button => {
      const plugin = (pluginState?.plugins || []).find(p => p.id === button.dataset.pluginId);
      button.disabled = button.dataset.pluginBusy === '1' || !auth || !systemEnabled || !plugin?.effective_enabled;
    });
    document.querySelectorAll('#plugins [data-plugin-action="config-save"]').forEach(button => {
      button.disabled = button.dataset.pluginBusy === '1' || !auth;
    });
  }

  async function loadPlugins() {
    try {
      const data = await jsonFetch('/api/plugins');
      render(data);
    } catch (error) {
      ensureUi();
      if (el('pluginCards')) el('pluginCards').innerHTML = `<article class="card plugin-empty badtext">${escp(error.message)}</article>`;
    }
  }

  function collectConfig(id) {
    const config = {};
    document.querySelectorAll(`#plugins [data-plugin-config="${id}"]`).forEach(input => {
      const key = input.dataset.pluginField;
      const type = input.dataset.fieldType;
      if (type === 'boolean') config[key] = !!input.checked;
      else if (type === 'integer') config[key] = Number(input.value);
      else config[key] = input.value;
    });
    return config;
  }

  async function handleClick(event) {
    const button = event.target.closest('[data-plugin-action]');
    if (!button || button.disabled) return;
    const action = button.dataset.pluginAction;
    const id = button.dataset.pluginId;
    let done = () => {};
    try {
      if (action === 'system-toggle') {
        const enabled = button.dataset.enabled === '1';
        if (!enabled) {
          const ok = await confirmYwd({
            title: 'DISABLE PLUGIN SUBSYSTEM',
            message: 'Disable the entire plugin subsystem?\n\nAll active plugins will be stopped/unloaded and individually disabled. Plugin configuration is preserved. Core DMR operation will remain untouched.',
            confirmText: 'DISABLE ALL',
            cancelText: 'CANCEL',
            tone: 'danger',
            kicker: 'YWD // PLUGINS'
          });
          if (!ok) return;
        }
        done = beginBusy(button, enabled ? 'ENABLING…' : 'DISABLING…');
        const data = await post('/api/plugins/system', {enabled});
        render(data.plugins_state);
        notify(enabled ? 'Plugin support enabled' : 'All plugins safely disabled');
      } else if (action === 'plugin-toggle') {
        const enabled = button.dataset.enabled === '1';
        const plugin = (pluginState?.plugins || []).find(p => p.id === id);
        if (!enabled) {
          const ok = await confirmYwd({
            title: 'DISABLE PLUGIN',
            message: `Disable ${plugin?.name || id}?\n\nIts configuration will be preserved, but it will remain off until explicitly enabled again.`,
            confirmText: 'DISABLE PLUGIN',
            cancelText: 'CANCEL',
            tone: 'danger',
            kicker: 'YWD // PLUGINS'
          });
          if (!ok) return;
        }
        done = beginBusy(button, enabled ? 'ENABLING…' : 'DISABLING…');
        const data = await post('/api/plugins/enable', {id, enabled});
        render(data.plugins_state);
        notify(`${id} ${enabled ? 'enabled' : 'disabled'}`);
      } else if (action === 'config-save') {
        done = beginBusy(button, 'SAVING…');
        const data = await post('/api/plugins/config', {id, config:collectConfig(id)});
        render(data.plugins_state);
        notify(`${id} configuration saved`);
      } else if (action === 'plugin-test') {
        done = beginBusy(button, 'TESTING…');
        const data = await post('/api/plugins/test', {id});
        if (data.plugins_state) render(data.plugins_state);
        const result = el(`pluginResult-${id}`);
        if (result) {
          result.hidden = false;
          result.className = 'plugin-result good';
          const lines = [data.message || 'Plugin test passed'];
          if (data.data?.hostname) lines.push(`Hostname: ${data.data.hostname}`);
          if (data.data?.uptime_s != null) lines.push(`Uptime: ${formatUptime(data.data.uptime_s)}`);
          if (data.data?.temperature_c != null) lines.push(`Temperature: ${data.data.temperature_c} °C`);
          if (Array.isArray(data.data?.load)) lines.push(`Load: ${data.data.load.map(x => Number(x).toFixed(2)).join(' / ')}`);
          result.textContent = lines.join('\n');
        }
        notify(`${id} test passed`);
      }
    } catch (error) {
      const result = id ? el(`pluginResult-${id}`) : null;
      if (result) { result.hidden = false; result.className = 'plugin-result bad'; result.textContent = error.message; }
      notify(error.message, true);
    } finally {
      done();
      refreshControls();
    }
  }

  function init() {
    ensureUi();
    loadPlugins();
    const logout = el('logoutBtn');
    if (logout) new MutationObserver(refreshControls).observe(logout, {attributes:true, attributeFilter:['hidden']});
    document.addEventListener('visibilitychange', () => { if (!document.hidden && el('plugins')?.classList.contains('on')) loadPlugins(); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
