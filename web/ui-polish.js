'use strict';
(() => {
  let modalResolve = null;
  let modalLastFocus = null;

  // Reuse the dashboard's existing CSP-approved modal/dialog/button styles.
  // Do not inject a <style> block here: style-src 'self' intentionally blocks
  // script-created inline CSS.
  const overlay = document.createElement('div');
  overlay.className = 'modal';
  overlay.id = 'ywdConfirmModal';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.innerHTML = `
    <div class="dialog" id="ywdModalCard">
      <div class="card-title" id="ywdModalKicker">YWD // HOTSPOT</div>
      <div class="who" id="ywdModalTitle">CONFIRM ACTION</div>
      <p class="hint" id="ywdModalMessage"></p>
      <div class="buttonrow wrap">
        <button class="btn" id="ywdModalCancel">CANCEL</button>
        <button class="btn primary" id="ywdModalConfirm">CONFIRM</button>
      </div>
    </div>`;
  document.body.append(overlay);

  function closeModal(value) {
    overlay.classList.remove('on');
    const r = modalResolve;
    modalResolve = null;
    if (modalLastFocus && typeof modalLastFocus.focus === 'function') modalLastFocus.focus();
    modalLastFocus = null;
    if (r) r(value);
  }

  window.ywdConfirm = function({
    title = 'CONFIRM ACTION',
    message = '',
    confirmText = 'CONFIRM',
    cancelText = 'CANCEL',
    tone = 'normal',
    kicker = 'YWD // HOTSPOT'
  } = {}) {
    if (modalResolve) closeModal(false);
    modalLastFocus = document.activeElement;
    $('ywdModalTitle').textContent = title;
    $('ywdModalMessage').textContent = message;
    $('ywdModalConfirm').textContent = confirmText;
    $('ywdModalCancel').textContent = cancelText;
    $('ywdModalKicker').textContent = kicker;
    $('ywdModalKicker').className = 'card-title' + (tone === 'danger' ? ' badtext' : tone === 'warn' ? ' warntext2' : '');
    $('ywdModalConfirm').className = 'btn ' + (tone === 'danger' || tone === 'warn' ? 'danger' : 'primary');
    overlay.classList.add('on');
    setTimeout(() => $('ywdModalConfirm').focus(), 30);
    return new Promise(resolve => { modalResolve = resolve; });
  };

  $('ywdModalCancel').onclick = () => closeModal(false);
  $('ywdModalConfirm').onclick = () => closeModal(true);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) closeModal(false);
  });
  document.addEventListener('keydown', e => {
    if (!overlay.classList.contains('on')) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(false);
    }
  });

  function invokeWithNativeConfirmAccepted(el, ev) {
    const fn = el && el.onclick;
    if (typeof fn !== 'function') return;
    const nativeConfirm = window.confirm;
    window.confirm = () => true;
    try {
      return fn.call(el, ev);
    } finally {
      window.confirm = nativeConfirm;
    }
  }

  function detailsFor(el) {
    if (!el) return null;
    const id = el.id || '';
    if (id === 'dropDyn' || id === 'tgDropDynamic') return {
      title: 'DROP DYNAMIC TALKGROUPS',
      message: 'Drop every dynamic talkgroup currently linked to this hotspot?\n\nStatic talkgroups are not removed.',
      confirmText: 'DROP DYNAMIC', tone: 'warn'
    };
    if (id === 'startRf') return {
      title: 'START RF STACK',
      message: 'Start MMDVM-Host and the BrandMeister network path now?\n\nVerify the antenna and configured frequency before transmitting.',
      confirmText: 'START RF', tone: 'warn'
    };
    if (id === 'stopRf') return {
      title: 'STOP RF STACK',
      message: 'Stop the active RF + BrandMeister stack now?\n\nThis runtime action does not rewrite unrelated configuration.',
      confirmText: 'STOP RF', tone: 'warn'
    };
    if (id === 'restartRf') return {
      title: 'RESTART RF STACK',
      message: 'Restart the currently running RF stack?\n\nA brief DMR interruption is expected.',
      confirmText: 'RESTART', tone: 'warn'
    };
    if (id === 'rebootPi') return {
      title: 'REBOOT RASPBERRY PI',
      message: 'Reboot the hotspot now?\n\nThe WebUI and DMR services will be unavailable while the Pi restarts.',
      confirmText: 'REBOOT PI', tone: 'danger'
    };
    if (id === 'resetCal') return {
      title: 'NEW CALIBRATION SESSION',
      message: 'Clear the recorded calibration result table and start a new test?\n\nCurrent RF settings are not changed.',
      confirmText: 'START NEW TEST', tone: 'warn'
    };
    if (id === 'restoreBaseline') return {
      title: 'RESTORE CALIBRATION BASELINE',
      message: 'Restore the saved baseline modem/RF settings and apply them now?',
      confirmText: 'RESTORE + APPLY', tone: 'warn'
    };
    if (id === 'calUseBest') return {
      title: 'USE RECOMMENDED RX OFFSET',
      message: 'Apply the currently recommended RX offset?\n\nThe configuration will be saved/applied and the active RF stack may restart.',
      confirmText: 'USE BEST OFFSET', tone: 'warn'
    };
    if (id === 'tgApplyPlan') {
      const d = typeof tgDiff === 'function' ? tgDiff() : {add: [], remove: []};
      const rows = [];
      if (d.add.length) rows.push('ADD: ' + d.add.join(', '));
      if (d.remove.length) rows.push('REMOVE: ' + d.remove.join(', '));
      return {
        title: 'APPLY STATIC TALKGROUP PLAN',
        message: (rows.join('\n') || 'No changes planned.') + '\n\nChanges are sent to BrandMeister on simplex slot 0.',
        confirmText: 'APPLY PLAN', tone: d.remove.length ? 'warn' : 'normal'
      };
    }
    if (el.matches('.calAdj')) return {
      title: 'ADJUST RX OFFSET',
      message: `Change RX offset by ${el.dataset.delta} Hz and restart the active RF stack?`,
      confirmText: 'APPLY RX STEP', tone: 'warn'
    };
    if (el.matches('.txAdj')) return {
      title: 'ADJUST TX OFFSET',
      message: `Change TX offset by ${el.dataset.delta} Hz and restart the active RF stack?`,
      confirmText: 'APPLY TX STEP', tone: 'warn'
    };
    if (el.matches('[data-del-tg]')) return {
      title: 'REMOVE STATIC TALKGROUP',
      message: `Remove static TG ${el.dataset.delTg} from BrandMeister?`,
      confirmText: 'REMOVE TG', tone: 'warn'
    };
    if (el.matches('[data-revert]')) return {
      title: 'RESTORE CONFIGURATION',
      message: 'Restore this saved configuration snapshot and apply it now?',
      confirmText: 'RESTORE + APPLY', tone: 'warn'
    };
    if (el.matches('[data-set-del]')) {
      const s = typeof tgSets === 'function' ? tgSets()[Number(el.dataset.setDel)] : null;
      return {
        title: 'DELETE SAVED TG SET',
        message: `Delete saved set “${s?.name || 'this set'}”?\n\nThis does not change BrandMeister routes.`,
        confirmText: 'DELETE SET', tone: 'danger'
      };
    }
    return null;
  }

  // Apply Configuration is special: the original handler asks after the save request.
  if ($('applyConfig')) $('applyConfig').onclick = async () => {
    try {
      const c = formConfig();
      const s = await post('/api/config/save', {config: c});
      configDoc = c;
      setDirty(false);
      toast(s.changed?.length ? `Saved ${s.changed.length} change(s)` : 'No changes');
      const h = s.hints || {}, parts = [];
      if (h.rf) parts.push('RF/DMR stack');
      if (h.oled) parts.push('OLED');
      if (h.dashboard) parts.push('dashboard');
      if (h.journald) parts.push('journald');
      if (h.autostart) parts.push('boot policy');
      if (s.changed?.length && parts.length) {
        const ok = await ywdConfirm({
          title: 'SAVE + APPLY CONFIGURATION',
          message: `Apply the saved configuration now?\n\nAffected: ${parts.join(', ')}`,
          confirmText: 'APPLY NOW', tone: h.rf ? 'warn' : 'normal'
        });
        if (!ok) {
          toast('Saved; changes remain pending');
          getStatus();
          return;
        }
      }
      const a = await post('/api/config/apply', {});
      toast(a.changed?.length ? 'Configuration applied' : 'Configuration already applied');
      if (a.dashboard_restart_pending) {
        const port = a.new_port;
        toast(`Dashboard restarting${port ? ' on port ' + port : ''}…`);
        if (port && Number(port) !== Number(location.port || 80)) {
          setTimeout(() => { location.href = `${location.protocol}//${location.hostname}:${port}/`; }, 4500);
        }
      }
      setTimeout(() => { getStatus(); loadConfig(true); }, 800);
    } catch (e) {
      toast(e.message, true);
    }
  };

  // Capture dangerous/confirming actions before their existing onclick handlers.
  document.addEventListener('click', async e => {
    const el = e.target.closest('button,[data-revert],[data-del-tg],[data-set-del]');
    if (!el || !document.body.contains(el) || overlay.contains(el)) return;

    // Leaving dirty Settings gets a themed in-app dialog. Browser close/reload
    // remains the native beforeunload prompt by browser design.
    if (el.matches('.tabs button')) {
      const current = document.querySelector('.tabs button.on')?.dataset.tab;
      if (current === 'settings' && el.dataset.tab !== 'settings' && typeof dirty !== 'undefined' && dirty) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const ok = await ywdConfirm({
          title: 'DISCARD UNSAVED SETTINGS?',
          message: 'You have unsaved Settings form edits.\n\nLeave Settings and discard those edits?',
          confirmText: 'DISCARD + LEAVE', tone: 'warn'
        });
        if (ok) invokeWithNativeConfirmAccepted(el, e);
      }
      return;
    }

    // Saving an existing TG set has a conditional native confirm in the core handler.
    if (el.id === 'tgSaveSet' && typeof tgSets === 'function') {
      const name = $('tgSetName')?.value.trim().slice(0, 40) || '';
      const existing = tgSets().find(x => x.name.toLowerCase() === name.toLowerCase());
      if (existing) {
        e.preventDefault();
        e.stopImmediatePropagation();
        const ok = await ywdConfirm({
          title: 'REPLACE SAVED TG SET',
          message: `Replace saved set “${existing.name}” with the current plan?`,
          confirmText: 'REPLACE SET', tone: 'warn'
        });
        if (ok) invokeWithNativeConfirmAccepted(el, e);
      }
      return;
    }

    const d = detailsFor(el);
    if (!d) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    const ok = await ywdConfirm(d);
    if (ok) invokeWithNativeConfirmAccepted(el, e);
  }, true);
})();
