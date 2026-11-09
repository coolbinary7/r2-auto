/* R2 Auto — bandeau dans R2 qui reconnaît l'écran ouvert et le remplit avec la fiche du panneau.
 * Identifiants relevés avec R2 Recorder (copie de release, copie de ressource, ressource audio/image, contributeurs).
 */
(() => {
  if (window.top !== window) return; // seulement la page principale de R2
  if (window.__r2auto) return;
  window.__r2auto = true;

  const JOB = 'r2job', SET = 'r2settings', STATE = 'r2state';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const $id = (id) => document.getElementById(id);
  const txt = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest && el.closest('#r2auto-host')) return false;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  const vis = (sel) => [...document.querySelectorAll(sel)].find(visible) || null;

  async function waitFor(fn, timeout = 10000, step = 200) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      try { const v = fn(); if (v) return v; } catch (e) { /* on réessaie */ }
      await sleep(step);
    }
    return null;
  }

  function click(el) {
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
    el.dispatchEvent(new MouseEvent('mousedown', o));
    el.dispatchEvent(new MouseEvent('mouseup', o));
    el.click();
  }

  function fire(el, ...types) { types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); }

  function setText(el, value) {
    el.focus();
    el.value = value;
    fire(el, 'input', 'keyup', 'change');
    el.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
    fire(el, 'blur');
  }

  // <select> classique : choisit l'option par son texte
  function setSelect(el, wanted) {
    const w = norm(wanted);
    const opts = [...el.options];
    const o = opts.find(x => norm(x.textContent) === w) || opts.find(x => norm(x.textContent).startsWith(w)) || opts.find(x => norm(x.textContent).includes(w));
    if (!o) throw new Error(`« ${wanted} » absent de la liste`);
    if (el.value === o.value) return;
    el.value = o.value;
    fire(el, 'input', 'change');
  }

  // Liste maison de R2 (input.r2ComboInput + div#ID_option_N)
  async function setCombo(id, wanted) {
    const input = await waitFor(() => { const e = $id(id); return e && visible(e) ? e : null; }, 8000);
    if (!input) throw new Error(`champ ${id} introuvable`);
    const w = norm(wanted);
    if (norm(input.value) === w) return;
    click(input);
    const pick = () => {
      const opts = [...document.querySelectorAll(`[id^="${id}_option_"]`)].filter(visible);
      if (!opts.length) return null;
      return opts.find(o => norm(txt(o)) === w) || opts.find(o => norm(txt(o)).startsWith(w)) || opts.find(o => norm(txt(o)).includes(w)) || 'none';
    };
    const opt = await waitFor(pick, 6000);
    if (!opt) throw new Error(`la liste ${id} ne s’ouvre pas`);
    if (opt === 'none') { click(document.body); throw new Error(`« ${wanted} » absent de la liste ${id}`); }
    click(opt);
    await waitFor(() => norm(input.value).includes(w) || norm(input.value) === norm(txt(opt)), 3000);
    await sleep(300);
  }

  function check(el, on = true) {
    if (!el) return false;
    if (el.checked !== on) click(el);
    return true;
  }

  // Petites fenêtres de confirmation (Yes / Ok) dont le texte correspond
  async function confirmIf(re, timeout = 4000) {
    const yes = await waitFor(() => {
      const b = vis('a#yesButton') || vis('a#okButton');
      if (!b) return null;
      const box = b.closest('[class*="modal" i], .modal, div[id*="modal" i]') || b.parentElement.parentElement;
      return re.test(txt(box)) ? b : null;
    }, timeout);
    if (yes) { click(yes); await sleep(800); return true; }
    return false;
  }

  async function waitIdle(timeout = 20000) {
    // R2 affiche « Loading page, please wait… » / « Checking for modifications… »
    await sleep(400);
    await waitFor(() => !/please wait/i.test(txt(vis('div.modalLoading, #loadingDiv, .loading') || document.createElement('i'))) &&
      ![...document.querySelectorAll('div')].some(d => visible(d) && d.childElementCount < 6 && /^(loading page|checking for modifications), please wait/i.test(txt(d))), timeout, 300);
  }

  const durationDigits = (d) => {
    const p = (d || '').split(':').map(s => s.trim()).filter(Boolean);
    if (p.length === 3) return `${+p[0]}${p[1].padStart(2, '0')}${p[2].padStart(2, '0')}`;
    if (p.length === 2) return `${+p[0]}${p[1].padStart(2, '0')}`;
    return (d || '').replace(/\D/g, '');
  };

  // ---------- Reconnaissance de l'écran ----------
  function screen() {
    if (vis('iframe[src*="identify.umgapps.com"]')) return 'identify';
    if (vis('a#saveButton[onclick*="copyRelease"]')) return 'copyRelease';
    if (vis('a#saveButton[onclick*="copyResource"]')) return 'copyResource';
    if (vis('a#saveButton[onclick*="saveContributor"]')) return 'contributor';
    if (vis('img#img_saveActionIcon')) {
      if (vis('input#width') || vis('input#height')) return 'resourceImage';
      if (vis('input#duration') || vis('#isrc_id_type_third') || vis('#tabBar_resources_contributors_tab_div_a')) return 'resourceAudio';
    }
    if (vis('img#img_saveReleaseButton') && vis('input#title')) return 'release';
    return null;
  }

  // ---------- Données ----------
  const get = async () => {
    const d = await browser.storage.local.get([JOB, SET, STATE]);
    return { job: d[JOB] || {}, set: d[SET] || {}, state: d[STATE] || { steps: {} } };
  };
  async function step(name, value) {
    const d = await browser.storage.local.get(STATE);
    const st = d[STATE] || { steps: {} };
    st.steps = st.steps || {};
    st.steps[name] = value;
    await browser.storage.local.set({ [STATE]: st });
  }

  // ---------- Pause : on attend l'utilisateur (ex. choix dans Identify) ----------
  let pauseResolve = null;
  function pause(message, autoUntil) {
    return new Promise(resolve => {
      pauseResolve = resolve;
      ui.status = { kind: 'pause', text: message };
      render();
      if (autoUntil) {
        (async () => {
          const ok = await waitFor(autoUntil, 10 * 60 * 1000, 500);
          if (ok && pauseResolve === resolve) { pauseResolve = null; resolve('auto'); }
        })();
      }
    });
  }

  // ---------- Remplissages ----------
  const ACTIONS = {
    async copyRelease({ set }) {
      await setCombo('configGroup_1', set.configGroup || 'e-Product');
      await sleep(500);
      await setCombo('configuration_1', set.configuration || 'eSingle Audio');
      await step('copyRelease', 'ok');
      if (set.autoSave !== false) {
        click(vis('a#saveButton[onclick*="copyRelease"]'));
        await waitIdle();
        return 'Release copiée. Sur la copie, clique « Remplir la release ».';
      }
      return 'Rempli. Clique « Save » pour créer la copie.';
    },

    async release({ job, set }) {
      if (!job.title) throw new Error('la fiche n’a pas de titre (panneau R2 Auto)');
      setText($id('title'), job.title);
      const upc = $id('upc_type');
      if (upc && visible(upc)) setSelect(upc, 'Auto');
      if (job.date) {
        const [y, m, d] = job.date.split('-');
        if ($id('original_release_date_day')) setText($id('original_release_date_day'), String(+d));
        if ($id('original_release_date_month')) setSelect($id('original_release_date_month'), MONTHS[+m - 1]);
        if ($id('original_release_date_year')) setText($id('original_release_date_year'), y);
      }
      await step('release', 'ok');
      let msg = 'Release remplie : titre, UPC Auto, date.';
      if (set.autoSave !== false) {
        click(vis('img#img_saveReleaseButton'));
        await confirmIf(/embargo/i, 5000);
        await waitIdle();
        const err = vis('.validationError, #validationErrors, div[class*="error" i]');
        if (err && /validation error/i.test(txt(err))) throw new Error('R2 refuse la sauvegarde : ' + txt(err).slice(0, 160));
        msg = 'Release enregistrée.';
      }
      return msg + ' Pense à retirer l’ancienne piste et l’ancienne cover de la release si elles y sont encore.';
    },

    async copyResource({ job, set }, kind) {
      if (!job.title) throw new Error('la fiche n’a pas de titre (panneau R2 Auto)');
      const type = $id('copy_resource_type_0');
      if (kind === 'image') {
        if (type) setSelect(type, 'Image');
        await sleep(700);
        await setCombo('copy_resource_category_0', 'Cover Art');
      } else if (type) {
        setSelect(type, 'Audio');
        await sleep(300);
      }
      setText($id('copy_resource_title_0'), job.title);
      await step(kind === 'image' ? 'copyImage' : 'copyAudio', 'ok');
      if (set.autoSave !== false) {
        click(vis('a#saveButton[onclick*="copyResource"]'));
        await waitIdle();
        return kind === 'image' ? 'Copie pour la cover créée. Clique « Remplir la cover ».' : 'Piste copiée. Clique « Remplir la piste ».';
      }
      return 'Rempli. Clique « Save » pour créer la copie.';
    },

    async resourceAudio({ job, set }) {
      // Détail : ISRC + durée
      const third = $id('isrc_id_type_third');
      if (job.isrcAuto !== false && third) {
        if (!third.checked) { click(third); await sleep(500); }
        const auto = await waitFor(() => { const a = $id('auto_gen'); return a && !a.disabled ? a : null; }, 3000);
        if (auto) { check(auto, true); await sleep(500); }
      }
      if (job.duration) {
        const dur = $id('duration');
        if (dur) {
          setText(dur, durationDigits(job.duration));
          await sleep(400);
        }
      } else {
        await step('audio', 'durée manquante (ajoute le WAV)');
      }
      await step('audio', job.duration ? 'ok' : 'durée manquante');

      // Contributeurs
      const tab = $id('tabBar_resources_contributors_tab_div_a');
      if (tab) { click(tab); await waitIdle(); }
      const addWriter = await waitFor(() => vis('img#img_writers_composers_add'), 8000);
      if (!addWriter) throw new Error('onglet Contributors introuvable');
      const autoWork = $id('automatic_work_flag');
      if (autoWork && !autoWork.checked && !autoWork.disabled) { click(autoWork); await sleep(600); }

      const already = () => norm(txt(vis('#contributor_grid') || vis('#resources_contributors_data') || document.body));
      for (const name of (job.writers || [])) {
        if (already().includes(norm(name))) continue;
        await addContributor('img#img_writers_composers_add', name, null, null);
      }
      for (const name of (job.mix || [])) {
        await addContributor('img#img_secondary_contributors_add', name, set.mixGroup || 'Mastering Engineers', set.mixRole || 'Mastering Engineer');
      }
      await step('contributors', 'ok');

      if (set.autoSave !== false) {
        click(vis('img#img_saveActionIcon'));
        await waitIdle();
        return 'Piste enregistrée : ISRC, durée, auteurs, mix/master. Vérifie qu’il ne reste pas d’anciens auteurs de la piste copiée.';
      }
      return 'Piste remplie. Vérifie puis clique « Save ».';
    },

    async resourceImage({ set }) {
      const size = set.coverSize || '3000';
      if ($id('measurement2')) setSelect($id('measurement2'), 'pixels');
      if ($id('measurement')) setSelect($id('measurement'), 'pixels');
      if ($id('resolution')) setSelect($id('resolution'), set.coverDpi || '300 dpi');
      if ($id('color_mode')) setSelect($id('color_mode'), set.coverColor || 'RGB');
      if ($id('height')) setText($id('height'), size);
      if ($id('width')) setText($id('width'), size);
      if ($id('format')) await setCombo('format', set.coverFormat || 'JPEG');
      await step('image', 'ok');
      if (set.autoSave !== false) {
        click(vis('img#img_saveActionIcon'));
        await waitIdle();
        return 'Cover enregistrée. Retire les contributeurs secondaires copiés s’il y en a. Le Submit Release reste à toi.';
      }
      return 'Cover remplie. Vérifie puis clique « Save ».';
    }
  };

  // Ajoute un contributeur : nom → recherche Identify (choix par l'utilisateur) → Save
  async function addContributor(addSel, name, group, role) {
    const add = vis(addSel);
    if (!add) throw new Error('bouton d’ajout de contributeur introuvable');
    click(add);
    const nameInput = await waitFor(() => { const e = $id('contributor_name_0'); return e && visible(e) ? e : null; }, 10000);
    if (!nameInput) throw new Error('la fenêtre « New Contributor » ne s’ouvre pas');
    await sleep(400);
    if (group) {
      await setCombo('role_group_0', group);
      await sleep(500);
      if (role) await setCombo('role_0', role);
    }
    setText(nameInput, name);
    await sleep(300);
    const search = vis('img#contributor_name_0_img');
    if (search) click(search);
    const opened = await waitFor(() => vis('iframe[src*="identify.umgapps.com"]'), 10000);
    let r;
    if (opened) {
      r = await pause(`Choisis « ${name} » dans Identify (bouton Select). Je continue dès que c’est fait.`,
        () => !vis('iframe[src*="identify.umgapps.com"]'));
      ui.status = { kind: 'run', text: 'Je continue…' }; render();
    } else {
      r = await pause(`Lance la recherche de « ${name} » (loupe) et choisis la bonne personne, puis clique Continuer.`);
    }
    if (r === 'stop') throw new Error(`arrêté à ta demande (contributeur « ${name} » non enregistré)`);
    await sleep(600);
    const save = vis('a#saveButton[onclick*="saveContributor"]');
    if (save) {
      click(save);
      await waitFor(() => !vis('a#saveButton[onclick*="saveContributor"]'), 10000);
    }
    await waitIdle();
  }

  // ---------- Bandeau ----------
  const ui = { screen: null, busy: false, status: null, collapsed: false };
  let host, shadow;

  const SCREEN_LABELS = {
    copyRelease: 'Copie de release',
    release: 'Release',
    copyResource: 'Copie de ressource',
    resourceAudio: 'Piste audio',
    resourceImage: 'Ressource image (cover)',
    contributor: 'Nouveau contributeur',
    identify: 'Recherche Identify'
  };

  function buttonsFor(s) {
    switch (s) {
      case 'copyRelease': return [['copyRelease', 'Remplir la copie de release']];
      case 'release': return [['release', 'Remplir la release']];
      case 'copyResource': return [['copyResource:audio', 'Piste audio'], ['copyResource:image', 'Cover']];
      case 'resourceAudio': return [['resourceAudio', 'Remplir la piste + auteurs']];
      case 'resourceImage': return [['resourceImage', 'Remplir la cover']];
      default: return [];
    }
  }

  function esc(t) { return String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function render() {
    if (!host || !host.isConnected) {
      host = document.createElement('div');
      host.id = 'r2auto-host';
      host.style.cssText = 'position:fixed;top:8px;right:8px;z-index:2147483647;';
      shadow = host.attachShadow({ mode: 'open' });
      document.documentElement.appendChild(host);
    }
    const s = ui.screen;
    const st = ui.status;
    const btns = ui.busy ? [] : buttonsFor(s);
    shadow.innerHTML = `
      <style>
        .b{font:12px/1.4 system-ui,"Segoe UI",sans-serif;background:#0f2747;color:#fff;border-radius:10px;padding:8px 10px;width:${ui.collapsed ? 'auto' : '290px'};box-shadow:0 8px 24px rgba(0,0,0,.3)}
        .h{display:flex;justify-content:space-between;align-items:center;gap:8px;cursor:pointer}
        .t{font-weight:800}
        .s{font-size:11px;color:#bcd3f5}
        .m{margin-top:6px;padding:6px 8px;border-radius:7px;font-size:12px}
        .run{background:#1e4f8f}.pause{background:#92400e}.err{background:#7f1d1d}.ok{background:#065f46}
        .r{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}
        button{font:700 12px system-ui,sans-serif;border:0;border-radius:7px;padding:7px 9px;cursor:pointer;background:#fff;color:#0f2747}
        button.g{background:#2d4a72;color:#fff}
      </style>
      <div class="b">
        <div class="h" data-a="toggle"><span class="t">R2 Auto</span><span class="s">${s ? esc(SCREEN_LABELS[s]) : 'écran non reconnu'} ${ui.collapsed ? '▸' : '▾'}</span></div>
        ${ui.collapsed ? '' : `
          ${st ? `<div class="m ${st.kind}">${esc(st.text)}</div>` : ''}
          <div class="r">
            ${btns.map(([a, l]) => `<button data-a="${a}">${esc(l)}</button>`).join('')}
            ${st && st.kind === 'pause' ? '<button data-a="continue">Continuer</button> <button class="g" data-a="stop">Arrêter</button>' : ''}
            ${!ui.busy ? '<button class="g" data-a="diag">Copier le diagnostic</button>' : ''}
          </div>`}
      </div>`;
    shadow.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); onAction(el.dataset.a); }));
  }

  async function onAction(a) {
    if (a === 'toggle') { ui.collapsed = !ui.collapsed; return render(); }
    if (a === 'continue') { if (pauseResolve) { const r = pauseResolve; pauseResolve = null; r('manual'); } return; }
    if (a === 'stop') { stopRequested = true; if (pauseResolve) { const r = pauseResolve; pauseResolve = null; r('stop'); } return; }
    if (a === 'diag') return copyDiag();
    const [name, arg] = a.split(':');
    if (!ACTIONS[name] || ui.busy) return;
    ui.busy = true; stopRequested = false;
    ui.status = { kind: 'run', text: 'Remplissage en cours… ne touche pas à R2 un instant.' };
    render();
    try {
      const data = await get();
      const msg = await ACTIONS[name](data, arg);
      ui.status = { kind: 'ok', text: msg };
    } catch (e) {
      ui.status = { kind: 'err', text: 'Bloqué : ' + (e && e.message) + '. Fais cette partie à la main, ou clique « Copier le diagnostic » et envoie-le à Claude.' };
      const stepName = { copyRelease: 'copyRelease', release: 'release', resourceAudio: 'audio', resourceImage: 'image' }[name]
        || (name === 'copyResource' ? (arg === 'image' ? 'copyImage' : 'copyAudio') : name);
      await step(stepName, (e && e.message) || 'erreur');
    } finally {
      ui.busy = false;
      ui.screen = screen();
      render();
    }
  }
  let stopRequested = false;

  async function copyDiag() {
    const rows = [];
    for (const el of document.querySelectorAll('input, select, textarea, a[onclick], img[onclick], img[id], a[id], iframe')) {
      if (!visible(el) || el.type === 'hidden' || el.type === 'password') continue;
      rows.push(JSON.stringify({
        tag: el.tagName.toLowerCase(), id: el.id || undefined, name: el.getAttribute('name') || undefined,
        cls: (typeof el.className === 'string' ? el.className : '').slice(0, 60) || undefined,
        title: el.getAttribute('title') || undefined, onclick: (el.getAttribute('onclick') || '').slice(0, 100) || undefined,
        src: el.tagName === 'IFRAME' ? el.src.slice(0, 100) : undefined,
        value: el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text : (el.value !== undefined ? String(el.value).slice(0, 40) : undefined)
      }));
      if (rows.length > 400) break;
    }
    const out = ['R2 AUTO — DIAGNOSTIC', 'Écran reconnu : ' + (ui.screen || 'aucun'), 'Message : ' + (ui.status ? ui.status.text : ''), '---', ...rows].join('\n');
    try { await navigator.clipboard.writeText(out); ui.status = { kind: 'ok', text: 'Diagnostic copié : colle-le à Claude.' }; }
    catch (e) { ui.status = { kind: 'err', text: 'Copie impossible : ' + e.message }; }
    render();
  }

  // Suivre l'écran affiché
  let timer = null;
  const mo = new MutationObserver(() => {
    if (ui.busy) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const s = screen();
      if (s !== ui.screen) { ui.screen = s; if (!ui.busy && ui.status && ui.status.kind !== 'err') ui.status = ui.status; render(); }
    }, 400);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  ui.screen = screen();
  render();

  window.__r2autoTest = { screen, ACTIONS, setCombo, setSelect, durationDigits };
})();
