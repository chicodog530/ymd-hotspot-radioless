'use strict';
(() => {
  let pollTimer = null;
  let armedAt = 0;
  let lastProgress = 0;

  const el = id => document.getElementById(id);
  const safeText = v => String(v ?? '');

  async function statusFetch() {
    const r = await fetch('/api/update/status', {cache:'no-store', credentials:'same-origin'});
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  }

  function ensureModal() {
    if (el('updateProgressModal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal update-progress-modal';
    modal.id = 'updateProgressModal';
    modal.innerHTML = `
      <div class="dialog update-progress-dialog" role="dialog" aria-modal="true" aria-labelledby="updateProgressTitle">
        <div class="card-title title-row">
          <span id="updateProgressTitle">SOFTWARE UPDATE</span>
          <span id="updateProgressState" class="badge warn">STARTING</span>
        </div>
        <div class="update-progress-stage">
          <span id="updateProgressSpinner" class="update-spinner" aria-hidden="true"></span>
          <div>
            <div id="updateProgressPhase" class="update-progress-phase">Starting update…</div>
            <div id="updateProgressMessage" class="hint">The detached update service is starting.</div>
          </div>
        </div>
        <div class="update-progress-meter-row">
          <div class="update-progress-track" role="progressbar" aria-label="Software update progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
            <div id="updateProgressFill" class="update-progress-fill"></div>
          </div>
          <b id="updateProgressPercent">0%</b>
        </div>
        <p class="hint update-progress-note">Progress is stage-driven: the bar advances only when the updater reaches a verified milestone.</p>
        <div id="updateProgressTarget" class="update-progress-target"></div>
        <div class="buttonrow update-progress-actions">
          <button class="btn" id="closeUpdateProgress" hidden>CLOSE</button>
          <button class="btn primary" id="reloadUpdateProgress" hidden>RELOAD DASHBOARD</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    el('closeUpdateProgress').addEventListener('click', () => modal.classList.remove('on'));
    el('reloadUpdateProgress').addEventListener('click', () => location.reload());
  }

  function statusTime(u) {
    const value = u.started_at || u.completed_at || u.updated_at;
    const ms = value ? Date.parse(value) : NaN;
    return Number.isFinite(ms) ? ms : 0;
  }

  function relevant(u) {
    if (!u || !u.state || u.state === 'idle' || u.state === 'checked') return false;
    if (!armedAt) {
      if (u.state !== 'running') return false;
      const t = statusTime(u);
      if (t) armedAt = t;
      return true;
    }
    return statusTime(u) >= armedAt - 1500;
  }

  function setProgress(value) {
    const pct = Math.max(0, Math.min(100, Number(value) || 0));
    lastProgress = Math.max(lastProgress, pct);
    const track = document.querySelector('#updateProgressModal .update-progress-track');
    const fill = el('updateProgressFill');
    if (fill) fill.style.width = `${lastProgress}%`;
    if (track) track.setAttribute('aria-valuenow', String(Math.round(lastProgress)));
    if (el('updateProgressPercent')) el('updateProgressPercent').textContent = `${Math.round(lastProgress)}%`;
  }

  function targetText(u) {
    const version = u.target_version && u.target_version !== 'unknown' ? u.target_version : '';
    const commit = u.target_commit && u.target_commit !== 'unknown' ? String(u.target_commit).slice(0,10) : '';
    const channel = u.channel || '';
    return [version, commit && `@ ${commit}`, channel && `· ${channel}`].filter(Boolean).join(' ');
  }

  function render(u) {
    ensureModal();
    const modal = el('updateProgressModal');
    modal.classList.add('on');
    modal.classList.remove('failed','complete','reconnecting');

    const state = safeText(u.state || 'running');
    const phase = safeText(u.phase || 'working');
    const message = safeText(u.message || 'Software update is running…');
    const badge = el('updateProgressState');
    const spinner = el('updateProgressSpinner');
    const close = el('closeUpdateProgress');
    const reload = el('reloadUpdateProgress');

    setProgress(u.progress ?? (state === 'complete' ? 100 : lastProgress));
    el('updateProgressPhase').textContent = phase.replace(/[-_]/g,' ').toUpperCase();
    el('updateProgressMessage').textContent = message;
    el('updateProgressTarget').textContent = targetText(u);
    close.hidden = true;
    reload.hidden = true;
    spinner.hidden = false;

    if (state === 'complete') {
      modal.classList.add('complete');
      badge.textContent = u.phase === 'up-to-date' ? 'UP TO DATE' : 'COMPLETE';
      badge.className = 'badge good';
      spinner.hidden = true;
      setProgress(100);
      el('updateProgressPhase').textContent = u.phase === 'up-to-date' ? 'ALREADY CURRENT' : 'UPDATE COMPLETE';
      reload.hidden = u.phase === 'up-to-date';
      close.hidden = false;
      stopPolling();
      return;
    }
    if (state === 'failed') {
      modal.classList.add('failed');
      badge.textContent = 'FAILED';
      badge.className = 'badge bad';
      spinner.hidden = true;
      el('updateProgressPhase').textContent = 'UPDATE FAILED';
      el('updateProgressMessage').textContent = safeText(u.error || u.message || 'The update failed. Check the update service journal for details.');
      close.hidden = false;
      stopPolling();
      return;
    }

    badge.textContent = `${Math.round(lastProgress)}%`;
    badge.className = 'badge warn';
  }

  function showReconnect() {
    ensureModal();
    const modal = el('updateProgressModal');
    if (!modal.classList.contains('on')) return;
    modal.classList.add('reconnecting');
    el('updateProgressState').textContent = 'RECONNECTING';
    el('updateProgressState').className = 'badge warn';
    el('updateProgressPhase').textContent = 'DASHBOARD RESTARTING';
    el('updateProgressMessage').textContent = 'The updater is still running outside the dashboard. Reconnecting to live update status…';
  }

  async function poll() {
    try {
      const d = await statusFetch();
      const u = d.update || {};
      if (relevant(u)) render(u);
    } catch (_) {
      showReconnect();
    }
  }

  function startPolling() {
    if (pollTimer) return;
    poll();
    pollTimer = setInterval(poll, 1000);
  }

  function stopPolling() {
    if (!pollTimer) return;
    clearInterval(pollTimer);
    pollTimer = null;
  }

  function armForNewUpdate() {
    armedAt = Date.now();
    lastProgress = 0;
    startPolling();
    // If the start request fails, the main update UI reports the error. Stop
    // waiting for a job that never entered running state after a short grace period.
    setTimeout(() => {
      const modal = el('updateProgressModal');
      if (armedAt && (!modal || !modal.classList.contains('on'))) {
        armedAt = 0;
        stopPolling();
      }
    }, 15000);
  }

  function init() {
    ensureModal();
    document.addEventListener('click', e => {
      if (e.target && e.target.id === 'confirmUpdate') armForNewUpdate();
    }, true);
    startPolling();
    setTimeout(() => {
      const modal = el('updateProgressModal');
      if (!modal?.classList.contains('on')) stopPolling();
    }, 5000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && (el('updateProgressModal')?.classList.contains('on') || armedAt)) startPolling();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
