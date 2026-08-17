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
    if (typeof window.ywdConfirm !== 'function') throw new Error('YWD confirmation UI is unavailable. Reload the dashboard and try again.');
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
      <div id="pluginMasterNotice" class="notice plugin-warning">When disabled, plugin packages remain installed but no plugin is active.</div>
      <article class="card">
        <div class="card-title title-row"><span>PLUGIN MANAGER</span><span class="hint">API v1 · sandboxed service phase</span></div>
        <p class="plugin-api-note">The Plugin Manager is trusted YWD-Hotspot core. Declarative plugins remain data-only. Service plugins run only through the shared hardened YWD systemd template; plugin-supplied unit files, RF ownership, device access, and network sockets are not permitted in this phase.</p>
      </article>
      <div id="pluginCards" class="plugin-grid"><article class="card plugin-empty">Loading installed plugins…</article></div>`;
    const about = el('about');
    if (about?.parentElement) about.parentElement.insertBefore(page, about); else document.querySelector('main')?.append(page);

    button.onclick = async () => {
      const current = document.querySelector('.tabs button.on')?.dataset.tab;
      try {
        if (current === 'settings' && typeof dirty !== 'undefined' && dirty) {
          const ok = await confirmYwd({title:'LEAVE SETTINGS?',message:'You have unsaved Settings edits. Leave Settings and discard those form edits?',confirmText:'DISCARD + LEAVE',tone:'warn'});
          if (!ok) return;
          if (typeof configDoc !== 'undefined' && configDoc && typeof fillForm === 'function') fillForm(configDoc);
          if (typeof setDirty === 'function') setDirty(false);
        }
      } catch (_) { return; }
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
    if (field.type === 'boolean') control = `<div class="field check"><label><input type="checkbox" ${common}${value ? ' checked' : ''}> ${escp(field.label)}</label></div>`;
    else if (field.type === 'select') {
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

  function serviceRows(plugin) {
    if (!plugin.service) return '';
    const runtime = plugin.runtime || {};
    return `<div class="plugin-meta"><div><span>Runtime</span><b>${escp(runtime.state || 'unknown')}</b></div><div><span>Boot</span><b>${escp(runtime.boot || 'disabled')}</b></div></div>`;
  }

  function pluginCard(plugin, systemEnabled) {
    const good = plugin.health === 'active';
    const bad = plugin.health === 'error';
    const stopped = plugin.health === 'stopped';
    const status = bad ? 'ERROR' : good ? 'ACTIVE' : stopped ? 'STOPPED' : 'DISABLED';
    const caps = (plugin.capabilities || []).map(cap => `<span class="plugin-cap">${escp(cap)}</span>`).join('') || '<span class="plugin-cap">no capabilities</span>';
    const fields = plugin.valid ? (plugin.schema?.fields || []).map(field => schemaField(plugin, field)).join('') : '';
    const data = plugin.data || {};
    const liveRows = plugin.effective_enabled && !plugin.service ? [
      data.label ? `<div><span>Label</span><b>${escp(data.label)}</b></div>` : '',
      data.hostname ? `<div><span>Hostname</span><b>${escp(data.hostname)}</b></div>` : '',
      data.uptime_s != null ? `<div><span>Uptime</span><b>${escp(formatUptime(data.uptime_s))}</b></div>` : '',
      data.temperature_c != null ? `<div><span>Temperature</span><b>${escp(data.temperature_c)} °C</b></div>` : '',
      Array.isArray(data.load) ? `<div><span>Load</span><b>${escp(data.load.map(x => Number(x).toFixed(2)).join(' / '))}</b></div>` : '',
    ].filter(Boolean).join('') : '';
    const errorText = plugin.error || plugin.config_error || '';
    const serviceButtons = plugin.service ? `<div class="buttonrow wrap plugin-runtime-actions"><button class="btn good" data-plugin-action="service-start" data-plugin-id="${escp(plugin.id)}">START</button><button class="btn danger" data-plugin-action="service-stop" data-plugin-id="${escp(plugin.id)}">STOP RUNTIME</button><button class="btn" data-plugin-action="service-restart" data-plugin-id="${escp(plugin.id)}">RESTART</button><button class="btn" data-plugin-action="service-logs" data-plugin-id="${escp(plugin.id)}">LOGS</button></div>` : '';
    return `<article class="card plugin-card${good ? ' active' : ''}${bad ? ' error' : ''}" data-plugin-card="${escp(plugin.id)}">
      <div class="plugin-title"><div><h3>${escp(plugin.name)}</h3><small>${escp(plugin.id)} · v${escp(plugin.version)}</small></div><span class="badge ${good ? 'applied' : bad ? 'pending' : ''}">${status}</span></div>
      <p class="plugin-description">${escp(plugin.description || errorText || 'Plugin package could not be loaded.')}</p>
      <div class="plugin-meta"><div><span>Trust</span><b>${escp(plugin.trust || 'unknown')}</b></div><div><span>Model</span><b>${escp(plugin.kind || 'invalid')}</b></div><div><span>RF mode</span><b>${plugin.rf_mode ? 'YES' : 'NO'}</b></div><div><span>Service</span><b>${escp(plugin.service || 'none')}</b></div></div>
      ${serviceRows(plugin)}<div class="plugin-caps">${caps}</div>${errorText ? `<div class="notice plugin-warning">${escp(errorText)}</div>` : ''}${liveRows ? `<div class="plugin-meta">${liveRows}</div>` : ''}
      <div class="buttonrow wrap"><button class="btn ${plugin.enabled ? 'danger' : 'good'}" data-plugin-action="plugin-toggle" data-plugin-id="${escp(plugin.id)}" data-enabled="${plugin.enabled ? '0' : '1'}"${!plugin.valid || !systemEnabled ? ' disabled' : ''}>${plugin.enabled ? 'DISABLE' : 'ENABLE'}</button><button class="btn" data-plugin-action="plugin-test" data-plugin-id="${escp(plugin.id)}"${!plugin.effective_enabled || (plugin.service && plugin.health !== 'active') ? ' disabled' : ''}>TEST</button></div>
      ${serviceButtons}<div id="pluginResult-${escp(plugin.id)}" class="plugin-result" hidden></div>
      ${plugin.valid ? `<details class="plugin-config"><summary>CONFIGURE</summary><div class="plugin-config-grid">${fields}</div><div class="buttonrow"><button class="btn primary" data-plugin-action="config-save" data-plugin-id="${escp(plugin.id)}">SAVE PLUGIN CONFIG</button></div></details>` : ''}</article>`;
  }

  function render(data) {
    pluginState = data; ensureUi();
    const system = data?.system || {enabled:false, installed:0, active_plugins:0, enabled_plugins:0, health:'disabled'};
    const stateEl = el('pluginSystemState');
    stateEl.textContent = system.enabled ? 'ENABLED' : 'DISABLED';
    stateEl.className = `plugin-system-state ${system.enabled ? 'good' : 'disabled'}`;
    el('pluginSystemMessage').textContent = system.enabled ? 'Plugin support is enabled. Only explicitly enabled, validated plugins may become active.' : 'Plugin runtime is off. Individual plugins are disabled and will not auto-reactivate when the subsystem is enabled again.';
    el('pluginSummary').innerHTML = `<span class="badge">API ${escp(data?.api ?? 1)}</span><span class="badge">${escp(system.installed || 0)} INSTALLED</span><span class="badge">${escp(system.enabled_plugins || 0)} ENABLED</span><span class="badge">${escp(system.active_plugins || 0)} ACTIVE</span><span class="badge">${escp(system.execution_model || 'declarative-only')}</span>`;
    const toggle = el('pluginSystemToggle');
    toggle.textContent = system.enabled ? 'DISABLE ALL PLUGINS' : 'ENABLE PLUGIN SUPPORT'; toggle.className = `btn ${system.enabled ? 'danger' : 'primary'}`; toggle.dataset.enabled = system.enabled ? '0' : '1'; toggle.disabled = !unlocked();
    const notice = el('pluginMasterNotice');
    notice.className = `notice ${system.enabled ? 'plugin-good' : 'plugin-warning'}`;
    notice.textContent = system.enabled ? 'Plugin subsystem active. Master disable stops/unloads service plugins, clears all activation state, and leaves core DMR operation alone.' : 'Plugin subsystem disabled. Plugin configuration is preserved, but every plugin activation state is OFF until explicitly enabled again.';
    const plugins = Array.isArray(data?.plugins) ? data.plugins : [];
    el('pluginCards').innerHTML = plugins.length ? plugins.map(p => pluginCard(p, !!system.enabled)).join('') : '<article class="card plugin-empty">No plugin packages are installed.</article>';
    refreshControls();
  }

  function refreshControls() {
    const auth = unlocked(), systemEnabled = !!pluginState?.system?.enabled;
    const master = el('pluginSystemToggle'); if (master) master.disabled = !auth || master.dataset.pluginBusy === '1';
    document.querySelectorAll('#plugins [data-plugin-action="plugin-toggle"]').forEach(button => { const p=(pluginState?.plugins||[]).find(x=>x.id===button.dataset.pluginId); button.disabled=button.dataset.pluginBusy==='1'||!auth||!systemEnabled||!p?.valid; });
    document.querySelectorAll('#plugins [data-plugin-action="plugin-test"]').forEach(button => { const p=(pluginState?.plugins||[]).find(x=>x.id===button.dataset.pluginId); button.disabled=button.dataset.pluginBusy==='1'||!auth||!systemEnabled||!p?.effective_enabled||(!!p?.service&&p?.health!=='active'); });
    document.querySelectorAll('#plugins [data-plugin-action^="service-"]').forEach(button => { const p=(pluginState?.plugins||[]).find(x=>x.id===button.dataset.pluginId), runtime=p?.runtime?.state, action=button.dataset.pluginAction; let blocked=!auth||!systemEnabled||!p?.enabled||!p?.valid; if(action==='service-start'&&runtime==='active')blocked=true; if((action==='service-stop'||action==='service-restart')&&runtime!=='active')blocked=true; button.disabled=button.dataset.pluginBusy==='1'||blocked; });
    document.querySelectorAll('#plugins [data-plugin-action="config-save"]').forEach(button => { button.disabled=button.dataset.pluginBusy==='1'||!auth; });
  }

  async function loadPlugins() { try { render(await jsonFetch('/api/plugins')); } catch (error) { ensureUi(); if (el('pluginCards')) el('pluginCards').innerHTML=`<article class="card plugin-empty badtext">${escp(error.message)}</article>`; } }
  function collectConfig(id) { const config={}; document.querySelectorAll(`#plugins [data-plugin-config="${id}"]`).forEach(input=>{const key=input.dataset.pluginField,type=input.dataset.fieldType; if(type==='boolean')config[key]=!!input.checked; else if(type==='integer')config[key]=Number(input.value); else config[key]=input.value;}); return config; }
  function showResult(id,message,bad=false){const result=el(`pluginResult-${id}`);if(!result)return;result.hidden=false;result.className=`plugin-result ${bad?'bad':'good'}`;result.textContent=message;}

  async function runtimeAction(button,id,action){const labels={start:'STARTING…',stop:'STOPPING…',restart:'RESTARTING…'};if(action==='stop'){const ok=await confirmYwd({title:'STOP PLUGIN RUNTIME',message:'Stop this plugin service for the current runtime?\n\nThe plugin remains enabled and will start again at boot unless you DISABLE it.',confirmText:'STOP RUNTIME',tone:'warn',kicker:'YWD // PLUGINS'});if(!ok)return;}if(action==='restart'){const ok=await confirmYwd({title:'RESTART PLUGIN SERVICE',message:'Restart this sandboxed plugin service now? A brief interruption is expected.',confirmText:'RESTART',tone:'warn',kicker:'YWD // PLUGINS'});if(!ok)return;}const done=beginBusy(button,labels[action]||'WORKING…');try{const data=await post('/api/plugins/runtime',{id,action});render(data.plugins_state);notify(`${id} ${action} complete`);}finally{done();}}

  async function handleClick(event){const button=event.target.closest('[data-plugin-action]');if(!button||button.disabled)return;const action=button.dataset.pluginAction,id=button.dataset.pluginId;let done=()=>{};try{
    if(action==='system-toggle'){const enabled=button.dataset.enabled==='1';if(!enabled){const ok=await confirmYwd({title:'DISABLE PLUGIN SUBSYSTEM',message:'Disable the entire plugin subsystem?\n\nAll active service plugins will be stopped/unloaded and every plugin will be individually disabled. Plugin configuration is preserved. Core DMR operation will remain untouched.',confirmText:'DISABLE ALL',cancelText:'CANCEL',tone:'danger',kicker:'YWD // PLUGINS'});if(!ok)return;}done=beginBusy(button,enabled?'ENABLING…':'DISABLING…');const data=await post('/api/plugins/system',{enabled});render(data.plugins_state);notify(enabled?'Plugin support enabled':'All plugins safely disabled');}
    else if(action==='plugin-toggle'){const enabled=button.dataset.enabled==='1',plugin=(pluginState?.plugins||[]).find(p=>p.id===id);if(!enabled){const ok=await confirmYwd({title:'DISABLE PLUGIN',message:`Disable ${plugin?.name||id}?\n\nAny service runtime will be stopped and boot activation removed. Configuration will be preserved.`,confirmText:'DISABLE PLUGIN',cancelText:'CANCEL',tone:'danger',kicker:'YWD // PLUGINS'});if(!ok)return;}done=beginBusy(button,enabled?'ENABLING…':'DISABLING…');const data=await post('/api/plugins/enable',{id,enabled});render(data.plugins_state);notify(`${id} ${enabled?'enabled':'disabled'}`);}
    else if(action==='config-save'){done=beginBusy(button,'SAVING…');const data=await post('/api/plugins/config',{id,config:collectConfig(id)});render(data.plugins_state);notify(data.restart_required?`${id} config saved — restart service to apply`:`${id} configuration saved`);}
    else if(action==='plugin-test'){done=beginBusy(button,'TESTING…');const data=await post('/api/plugins/test',{id});if(data.plugins_state)render(data.plugins_state);const lines=[data.message||'Plugin test passed'];if(data.data?.hostname)lines.push(`Hostname: ${data.data.hostname}`);if(data.data?.uptime_s!=null)lines.push(`Uptime: ${formatUptime(data.data.uptime_s)}`);if(data.data?.temperature_c!=null)lines.push(`Temperature: ${data.data.temperature_c} °C`);if(Array.isArray(data.data?.load))lines.push(`Load: ${data.data.load.map(x=>Number(x).toFixed(2)).join(' / ')}`);if(data.data?.service)lines.push(`Service: ${data.data.service}`);if(data.data?.state)lines.push(`Runtime: ${data.data.state}`);if(data.data?.boot)lines.push(`Boot: ${data.data.boot}`);showResult(id,lines.join('\n'));notify(`${id} test passed`);}
    else if(action==='service-start'){await runtimeAction(button,id,'start');return;}
    else if(action==='service-stop'){await runtimeAction(button,id,'stop');return;}
    else if(action==='service-restart'){await runtimeAction(button,id,'restart');return;}
    else if(action==='service-logs'){done=beginBusy(button,'LOADING…');const data=await jsonFetch(`/api/plugins/logs?id=${encodeURIComponent(id)}`);showResult(id,(data.lines||[]).join('\n')||'No journal entries yet.');}
  }catch(error){if(id)showResult(id,error.message,true);notify(error.message,true);}finally{done();refreshControls();}}

  function init(){ensureUi();loadPlugins();const logout=el('logoutBtn');if(logout)new MutationObserver(refreshControls).observe(logout,{attributes:true,attributeFilter:['hidden']});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&el('plugins')?.classList.contains('on'))loadPlugins();});}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
