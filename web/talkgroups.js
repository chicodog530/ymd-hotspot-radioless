'use strict';

const TG_FAVORITES_KEY = 'ywd.tgFavorites.v1';
const TG_SETS_KEY = 'ywd.tgSets.v1';
let tgPlan = null;
let tgPlanDirty = false;
let tgNames = new Map();
let tgDirectoryMeta = null;
let tgSearchTimer = null;

function tgLoadJson(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(key) || 'null');
    return v ?? fallback;
  } catch (_) { return fallback; }
}
function tgSaveJson(key, value) { localStorage.setItem(key, JSON.stringify(value)); }
function tgCurrentIds() { return new Set((state?.brandmeister?.static || []).map(x => Number(x.talkgroup)).filter(Number.isInteger)); }
function tgFavorites() {
  return (tgLoadJson(TG_FAVORITES_KEY, []) || []).filter(x => Number.isInteger(Number(x?.id))).map(x => ({id:Number(x.id), name:String(x.name || '')}));
}
function tgSets() {
  return (tgLoadJson(TG_SETS_KEY, []) || []).filter(x => x && typeof x.name === 'string' && Array.isArray(x.ids)).map(x => ({name:x.name.slice(0,40), ids:x.ids.map(Number).filter(Number.isInteger)}));
}
function tgName(id, fallback='') { return tgNames.get(Number(id)) || fallback || ''; }
function tgRememberRows(rows) { (rows || []).forEach(x => { if (Number.isInteger(Number(x.id))) tgNames.set(Number(x.id), String(x.name || '')); }); }
function tgDiff() {
  const current = tgCurrentIds();
  const plan = tgPlan || new Set(current);
  return {
    add: [...plan].filter(x => !current.has(x)).sort((a,b)=>a-b),
    remove: [...current].filter(x => !plan.has(x)).sort((a,b)=>a-b),
  };
}

function ensureTalkgroupManager() {
  if ($('talkgroups')) return;
  const tabs = document.querySelector('.tabs');
  const controlTab = tabs?.querySelector('[data-tab="control"]');
  if (!tabs || !controlTab) return;
  const tab = document.createElement('button');
  tab.dataset.tab = 'talkgroups';
  tab.textContent = 'TALKGROUPS';
  controlTab.after(tab);

  const page = document.createElement('section');
  page.className = 'page';
  page.id = 'talkgroups';
  page.innerHTML = `
    <article class="card">
      <div class="card-title title-row"><span>TALKGROUP MANAGER</span><span class="hint">BrandMeister · simplex slot 0</span></div>
      <div id="tgManagerState" class="notice">Loading BrandMeister state…</div>
      <p class="hint">Build a desired static-TG plan first. Nothing changes on BrandMeister until you press APPLY PLAN and confirm it.</p>
    </article>
    <div class="grid two">
      <article class="card"><div class="card-title">CURRENT BRANDMEISTER ROUTES</div>
        <div class="label">STATIC</div><div id="tgCurrentStatic" class="pills"></div>
        <div class="label tg-spacer">DYNAMIC</div><div id="tgCurrentDynamic" class="pills"></div>
        <div class="buttonrow wrap tg-spacer"><button class="btn ctl" id="tgDropDynamic">DROP ALL DYNAMIC</button><button class="btn" id="tgRefreshState">REFRESH STATE</button></div>
      </article>
      <article class="card"><div class="card-title">STATIC CHANGE PLAN</div>
        <div id="tgPlanSummary" class="hint">No changes planned.</div>
        <div id="tgPlanPills" class="pills tg-spacer"></div>
        <div class="buttonrow wrap tg-spacer"><button class="btn" id="tgResetPlan">RESET TO CURRENT</button><button class="btn danger" id="tgClearPlan">PLAN REMOVE ALL</button><button class="btn primary ctl" id="tgApplyPlan">APPLY PLAN</button></div>
      </article>
    </div>
    <article class="card"><div class="card-title title-row"><span>SEARCH BRANDMEISTER DIRECTORY</span><span id="tgDirectoryMeta" class="hint">directory not loaded</span></div>
      <div class="field inline"><label>SEARCH TG ID OR NAME</label><input id="tgSearch" placeholder="California, POTA, 3106…" maxlength="80"><button class="btn" id="tgSearchBtn">SEARCH</button><button class="btn ctl" id="tgRefreshDirectory">REFRESH DIRECTORY</button></div>
      <div class="tablewrap"><table><thead><tr><th>TG</th><th>NAME</th><th>FAVORITE</th><th>PLAN</th></tr></thead><tbody id="tgSearchRows"><tr><td colspan="4">Search by talkgroup number or name.</td></tr></tbody></table></div>
    </article>
    <div class="grid two">
      <article class="card"><div class="card-title">FAVORITES</div><p class="hint">Favorites are saved in this browser and never change BrandMeister by themselves.</p><div id="tgFavoriteRows"></div></article>
      <article class="card"><div class="card-title">SAVED STATIC SETS</div><p class="hint">Saved sets load into the change plan only; APPLY PLAN is still required.</p>
        <div class="field inline"><label>SET NAME</label><input id="tgSetName" maxlength="40" placeholder="Local / Travel / Nets"><button class="btn" id="tgSaveSet">SAVE CURRENT PLAN</button></div><div id="tgSetRows"></div>
      </article>
    </div>`;
  document.querySelector('main')?.append(page);

  const style = document.createElement('style');
  style.textContent = `
    .tg-spacer{margin-top:12px}.tg-id{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-weight:700}
    .tg-plan-add{border-color:rgba(68,255,170,.45)}.tg-plan-remove{border-color:rgba(255,90,110,.5);opacity:.78}
    .tg-row-actions{display:flex;gap:6px;flex-wrap:wrap}.tg-star{font-size:1.05rem;min-width:36px}
    #tgFavoriteRows .row,#tgSetRows .row{align-items:center;gap:8px} #tgManagerState{margin-bottom:10px}
  `;
  document.head.append(style);

  tab.onclick = () => {
    $$('.tabs button').forEach(x => x.classList.remove('on'));
    $$('.page').forEach(x => x.classList.remove('on'));
    tab.classList.add('on'); page.classList.add('on');
    tgRender(state);
    tgHydrateCurrentNames();
    setTimeout(() => $('tgSearch')?.focus(), 50);
  };

  $('tgSearchBtn').onclick = () => tgSearch(false);
  $('tgSearch').oninput = () => { clearTimeout(tgSearchTimer); tgSearchTimer = setTimeout(() => tgSearch(false), 280); };
  $('tgSearch').onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); tgSearch(false); } };
  $('tgRefreshDirectory').onclick = () => tgSearch(true);
  $('tgRefreshState').onclick = () => { getStatus(); toast('Refreshing BrandMeister state'); };
  $('tgDropDynamic').onclick = async () => {
    if (!confirm('Drop every dynamic talkgroup currently linked to this hotspot?')) return;
    try { await post('/api/bm/drop-dynamic', {}); toast('Dynamic talkgroups dropped'); setTimeout(getStatus, 700); }
    catch (e) { toast(e.message, true); }
  };
  $('tgResetPlan').onclick = () => { tgPlan = new Set(tgCurrentIds()); tgPlanDirty = false; tgRender(state); };
  $('tgClearPlan').onclick = () => { tgPlan = new Set(); tgPlanDirty = true; tgRender(state); };
  $('tgApplyPlan').onclick = tgApplyPlan;
  $('tgSaveSet').onclick = tgSaveSet;
}

async function tgApi(params) {
  const u = new URL('/api/talkgroups/search', location.origin);
  Object.entries(params || {}).forEach(([k,v]) => { if (v !== '' && v != null) u.searchParams.set(k, String(v)); });
  const r = await fetch(u, {cache:'no-store'});
  const d = await r.json().catch(() => ({error:`HTTP ${r.status}`}));
  if (!r.ok) throw new Error(d.error || `HTTP ${r.status}`);
  tgRememberRows(d.results || []);
  tgDirectoryMeta = d;
  return d;
}

async function tgHydrateCurrentNames() {
  const ids = new Set([...tgCurrentIds(), ...tgFavorites().map(x=>x.id)]);
  tgSets().forEach(s => s.ids.forEach(id => ids.add(id)));
  if (!ids.size) return;
  try { await tgApi({ids:[...ids].join(','), limit:100}); tgRender(state); }
  catch (_) { }
}

async function tgSearch(refresh=false) {
  const q = $('tgSearch')?.value.trim() || '';
  if (!q) {
    $('tgSearchRows').innerHTML = '<tr><td colspan="4">Search by talkgroup number or name.</td></tr>';
    return;
  }
  $('tgSearchRows').innerHTML = '<tr><td colspan="4">Searching BrandMeister directory…</td></tr>';
  try {
    const d = await tgApi({q, limit:50, refresh:refresh ? 1 : 0});
    tgRenderSearch(d.results || []);
    tgRender(state);
  } catch (e) {
    $('tgSearchRows').innerHTML = `<tr><td colspan="4">${esc(e.message)}</td></tr>`;
    toast(e.message, true);
  }
}

function tgRenderSearch(rows) {
  const fav = new Set(tgFavorites().map(x=>x.id));
  $('tgSearchRows').innerHTML = rows.length ? rows.map(x => {
    const id = Number(x.id), planned = tgPlan?.has(id);
    return `<tr><td class="tg-id">${id}</td><td>${esc(x.name || '—')}</td><td><button class="btn tiny tg-star" data-tg-fav="${id}" title="Toggle favorite">${fav.has(id) ? '★' : '☆'}</button></td><td><button class="btn tiny" data-tg-plan="${id}">${planned ? 'REMOVE FROM PLAN' : 'ADD TO PLAN'}</button></td></tr>`;
  }).join('') : '<tr><td colspan="4">No matching talkgroups.</td></tr>';
  $$('[data-tg-fav]').forEach(b => b.onclick = () => tgToggleFavorite(Number(b.dataset.tgFav)));
  $$('[data-tg-plan]').forEach(b => b.onclick = () => tgTogglePlan(Number(b.dataset.tgPlan)));
}

function tgToggleFavorite(id) {
  let rows = tgFavorites();
  if (rows.some(x => x.id === id)) rows = rows.filter(x => x.id !== id);
  else rows.push({id, name:tgName(id)});
  rows.sort((a,b)=>a.id-b.id); tgSaveJson(TG_FAVORITES_KEY, rows);
  tgRender(state); tgSearch(false);
}
function tgTogglePlan(id) {
  if (!tgPlan) tgPlan = new Set(tgCurrentIds());
  tgPlan.has(id) ? tgPlan.delete(id) : tgPlan.add(id);
  tgPlanDirty = true; tgRender(state); tgSearch(false);
}

function tgRender(d) {
  if (!d || !$('talkgroups')) return;
  const current = tgCurrentIds();
  if (tgPlan === null || !tgPlanDirty) tgPlan = new Set(current);
  const stat = d.brandmeister?.static || [], dyn = d.brandmeister?.dynamic || [];
  stat.forEach(x => { if (x.name) tgNames.set(Number(x.talkgroup), x.name); });
  dyn.forEach(x => { if (x.name) tgNames.set(Number(x.talkgroup), x.name); });
  const unlocked = ctlReady(), key = !!d.brandmeister?.api_key_configured;
  $('tgManagerState').textContent = !key ? 'BrandMeister API key is not configured. Search works, but route changes are locked.' : !unlocked ? 'Read-only: unlock control mode to apply talkgroup changes.' : 'Control mode unlocked. Plan changes are ready for explicit review/apply.';
  $('tgCurrentStatic').innerHTML = stat.length ? stat.map(x => `<span class="pill"><span class="tg-id">${Number(x.talkgroup)}</span>${x.name ? ' · '+esc(x.name) : ''}</span>`).join('') : '<span class="hint">none</span>';
  $('tgCurrentDynamic').innerHTML = dyn.length ? dyn.map(x => `<span class="pill dynamic"><span class="tg-id">${Number(x.talkgroup)}</span>${x.name ? ' · '+esc(x.name) : ''}</span>`).join('') : '<span class="hint">none</span>';

  const diff = tgDiff();
  const planned = [...tgPlan].sort((a,b)=>a-b);
  $('tgPlanPills').innerHTML = planned.length ? planned.map(id => {
    const cls = current.has(id) ? '' : ' tg-plan-add';
    return `<span class="pill${cls}"><button data-tg-plan-remove="${id}" title="Remove from plan">×</button> <span class="tg-id">${id}</span>${tgName(id) ? ' · '+esc(tgName(id)) : ''}</span>`;
  }).join('') : '<span class="hint">plan contains no static talkgroups</span>';
  $$('[data-tg-plan-remove]').forEach(b => b.onclick = () => tgTogglePlan(Number(b.dataset.tgPlanRemove)));
  const parts = [];
  if (diff.add.length) parts.push(`ADD ${diff.add.join(', ')}`);
  if (diff.remove.length) parts.push(`REMOVE ${diff.remove.join(', ')}`);
  $('tgPlanSummary').textContent = parts.length ? parts.join(' · ') : 'No changes planned.';
  $('tgApplyPlan').disabled = !(unlocked && key && (diff.add.length || diff.remove.length));
  $('tgApplyPlan').textContent = diff.add.length || diff.remove.length ? `APPLY PLAN · ${diff.add.length + diff.remove.length} CHANGE${diff.add.length + diff.remove.length === 1 ? '' : 'S'}` : 'APPLY PLAN';
  $('tgDropDynamic').disabled = !(unlocked && key && dyn.length);

  const meta = tgDirectoryMeta;
  $('tgDirectoryMeta').textContent = meta ? `${meta.directory_count || 0} TGs · ${meta.stale ? 'STALE CACHE' : 'cached'}${meta.cached_at ? ' · '+ago(meta.cached_at) : ''}` : 'directory loads on first search';
  tgRenderFavorites(); tgRenderSets();
}

function tgRenderFavorites() {
  const rows = tgFavorites();
  $('tgFavoriteRows').innerHTML = rows.length ? rows.map(x => `<div class="row"><span><b class="tg-id">${x.id}</b>${tgName(x.id,x.name) ? ' · '+esc(tgName(x.id,x.name)) : ''}</span><span class="tg-row-actions"><button class="btn tiny" data-fav-plan="${x.id}">${tgPlan?.has(x.id) ? 'REMOVE PLAN' : 'ADD PLAN'}</button><button class="btn tiny" data-fav-del="${x.id}">UNSTAR</button></span></div>`).join('') : '<div class="hint">Star search results to build a quick-access list.</div>';
  $$('[data-fav-plan]').forEach(b => b.onclick = () => tgTogglePlan(Number(b.dataset.favPlan)));
  $$('[data-fav-del]').forEach(b => b.onclick = () => tgToggleFavorite(Number(b.dataset.favDel)));
}
function tgRenderSets() {
  const rows = tgSets();
  $('tgSetRows').innerHTML = rows.length ? rows.map((x,i) => `<div class="row"><span><b>${esc(x.name)}</b><br><small>${esc(x.ids.join(', ') || 'empty set')}</small></span><span class="tg-row-actions"><button class="btn tiny" data-set-load="${i}">LOAD PLAN</button><button class="btn tiny" data-set-del="${i}">DELETE</button></span></div>`).join('') : '<div class="hint">Save a planned static set for quick reuse.</div>';
  $$('[data-set-load]').forEach(b => b.onclick = () => { const s=tgSets()[Number(b.dataset.setLoad)]; if(!s)return; tgPlan=new Set(s.ids); tgPlanDirty=true; tgRender(state); toast(`Loaded set: ${s.name}`); });
  $$('[data-set-del]').forEach(b => b.onclick = () => { const i=Number(b.dataset.setDel), rows=tgSets(), s=rows[i]; if(!s||!confirm(`Delete saved set "${s.name}"?`))return; rows.splice(i,1); tgSaveJson(TG_SETS_KEY,rows); tgRender(state); });
}
function tgSaveSet() {
  const name = $('tgSetName').value.trim().slice(0,40);
  if (!name) return toast('Enter a name for the saved set', true);
  const rows = tgSets();
  const ids = [...(tgPlan || tgCurrentIds())].sort((a,b)=>a-b);
  const existing = rows.findIndex(x => x.name.toLowerCase() === name.toLowerCase());
  const item = {name, ids};
  if (existing >= 0) {
    if (!confirm(`Replace saved set "${rows[existing].name}"?`)) return;
    rows[existing] = item;
  } else rows.push(item);
  rows.sort((a,b)=>a.name.localeCompare(b.name));
  tgSaveJson(TG_SETS_KEY, rows); $('tgSetName').value=''; tgRender(state); toast(`Saved static set: ${name}`);
}

async function tgApplyPlan() {
  const diff = tgDiff();
  if (!diff.add.length && !diff.remove.length) return toast('No talkgroup changes planned');
  const lines = [];
  if (diff.add.length) lines.push(`ADD: ${diff.add.join(', ')}`);
  if (diff.remove.length) lines.push(`REMOVE: ${diff.remove.join(', ')}`);
  if (!confirm(`Apply this BrandMeister static talkgroup plan?\n\n${lines.join('\n')}\n\nChanges are made on simplex slot 0.`)) return;
  $('tgApplyPlan').disabled = true;
  try {
    for (const id of diff.add) await post('/api/bm/static/add', {talkgroup:id});
    for (const id of diff.remove) await post('/api/bm/static/remove', {talkgroup:id});
    toast(`Applied ${diff.add.length + diff.remove.length} talkgroup change(s)`);
    tgPlanDirty = false;
    setTimeout(async () => { await getStatus(); tgHydrateCurrentNames(); }, 900);
  } catch (e) {
    toast(`Talkgroup plan stopped: ${e.message}`, true);
    tgPlanDirty = false;
    setTimeout(getStatus, 800);
  }
}

ensureTalkgroupManager();
const tgCoreRender = render;
render = function(d) { tgCoreRender(d); tgRender(d); };
tgRender(state);
