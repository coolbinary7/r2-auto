/* Auto R2 — bandeau dans R2 qui enchaîne la saisie d'une sortie à partir de la fiche du panneau.
 * Tout est calé sur un enregistrement réel (R2 Recorder) : copie de release, ménage, copie de la piste,
 * ISRC / durée / auteurs / mix, copie pour la cover, puis rattachement par glisser-déposer et sauvegarde.
 * Le Submit Release n'est jamais cliqué.
 */
(() => {
  if (window.top !== window) return; // seulement la page principale de R2
  if (window.__r2auto) return;
  window.__r2auto = true;

  const VERSION = '0.4.1';
  const JOB = 'r2job', SET = 'r2settings', STATE = 'r2state', PROJ = 'r2projects', CMD = 'r2cmd';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘`]/g, "'").toLowerCase().replace(/\s+/g, ' ').trim();
  const $id = (id) => document.getElementById(id);
  const txt = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const page = (o) => (o && o.wrappedJSObject) || o; // objets de la page R2 (Firefox)
  const forPage = (o) => { try { return typeof cloneInto === 'function' ? cloneInto(o, window) : o; } catch (e) { return o; } };

  // ---------- Journal (repris dans « Copier le diagnostic ») ----------
  const LOGS = [];
  const notes = []; // messages affichés par R2 pendant le déroulé
  function log(m) {
    LOGS.push(new Date().toTimeString().slice(0, 8) + ' ' + m);
    if (LOGS.length > 400) LOGS.shift();
  }

  class Stop extends Error { constructor() { super('arrêté à ta demande'); } }
  let stopRequested = false;

  function visible(el) {
    if (!el || !el.isConnected) return false;
    if (el.closest && el.closest('#r2auto-host')) return false;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none';
  }
  const vis = (sel) => [...document.querySelectorAll(sel)].find(visible) || null;

  async function waitFor(fn, timeout = 10000, step = 250) {
    const t0 = Date.now();
    for (;;) {
      if (stopRequested) throw new Stop();
      try { const v = fn(); if (v) return v; } catch (e) { if (e instanceof Stop) throw e; }
      if (Date.now() - t0 >= timeout) return null;
      await sleep(step);
    }
  }

  function mouse(el, type, extra = {}) {
    const r = el.getBoundingClientRect();
    el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window,
      clientX: r.left + Math.min(r.width / 2, 60), clientY: r.top + r.height / 2, button: 0, ...extra
    }));
  }

  // Clic « comme à la souris » : survol, appui, focus, relâchement, clic
  function click(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* tant pis */ }
    mouse(el, 'mouseover'); mouse(el, 'mousemove'); mouse(el, 'mousedown');
    if (/^(INPUT|SELECT|TEXTAREA|A|BUTTON)$/.test(el.tagName)) { try { el.focus(); } catch (e) { /* rien */ } }
    mouse(el, 'mouseup');
    el.click();
  }

  function fire(el, ...types) { types.forEach(t => el.dispatchEvent(new Event(t, { bubbles: true }))); }
  function blur(el) {
    el.dispatchEvent(new FocusEvent('blur', { bubbles: false }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    try { el.blur(); } catch (e) { /* rien */ }
  }

  function setText(el, value) {
    try { el.focus(); } catch (e) { /* rien */ }
    el.value = value;
    fire(el, 'input', 'keyup', 'change');
    blur(el);
  }

  // <select> classique : choisit l'option par son texte
  function setSelect(el, wanted) {
    const w = norm(wanted);
    const opts = [...el.options];
    const o = opts.find(x => norm(x.textContent) === w) || opts.find(x => norm(x.textContent).startsWith(w)) || opts.find(x => norm(x.textContent).includes(w));
    if (!o) throw new Error(`« ${wanted} » absent de la liste`);
    if (el.value === o.value && el.selectedIndex === o.index) return;
    try { el.focus(); } catch (e) { /* rien */ }
    el.selectedIndex = o.index;
    fire(el, 'input', 'change');
  }

  function pressKey(el, key, extra = {}) {
    const code = { ArrowDown: 40, Enter: 13, Escape: 27, Tab: 9 }[key] || 0;
    ['keydown', 'keyup'].forEach(t => el.dispatchEvent(new KeyboardEvent(t, { key, code: key, keyCode: code, which: code, bubbles: true, cancelable: true, ...extra })));
  }

  // ---------- Listes maison de R2 (input.r2ComboInput + div#ID_option_N) : elles s'ouvrent au focus ----------
  const lastAdded = [];
  function comboOptions(id) {
    const own = [...document.querySelectorAll(`[id^="${id}_option_"]`)];
    const box = $id(id + '_options');
    const inBox = box ? [...box.querySelectorAll('div, li, td, span')].filter(e => !e.children.length) : [];
    return [...new Set([...own, ...inBox])].filter(e => visible(e) && txt(e));
  }
  async function setCombo(id, wanted, label, { optional = false } = {}) {
    const input = await waitFor(() => { const e = $id(id); return e && visible(e) ? e : null; }, 8000);
    if (!input) {
      if (optional) { log(`liste ${id} absente (ignorée)`); return false; }
      throw new Error(`champ ${id} introuvable`);
    }
    const w = norm(wanted);
    if (norm(input.value) === w) return true;
    const pick = () => {
      const opts = comboOptions(id);
      if (!opts.length) return null;
      return opts.find(o => norm(txt(o)) === w) || opts.find(o => norm(txt(o)).startsWith(w)) || opts.find(o => norm(txt(o)).includes(w)) || 'none';
    };
    const mo = new MutationObserver(muts => {
      for (const m of muts) for (const n of m.addedNodes) {
        if (n.nodeType === 1 && lastAdded.length < 40) lastAdded.push(`${n.tagName.toLowerCase()}${n.id ? '#' + n.id : ''}${typeof n.className === 'string' && n.className ? '.' + n.className.split(' ')[0] : ''} « ${txt(n).slice(0, 40)} »`);
      }
    });
    lastAdded.length = 0;
    mo.observe(document.body, { childList: true, subtree: true });
    const pg = page(input);
    const arrow = $id(id + '_comboArrow');
    const tries = [
      ['clic', () => click(input)],
      ['focus', () => { input.dispatchEvent(new FocusEvent('focus')); input.dispatchEvent(new FocusEvent('focusin', { bubbles: true })); }],
      ['onfocus R2', () => { if (pg && typeof pg.onfocus === 'function') pg.onfocus.call(pg, new (page(window)).FocusEvent('focus')); }],
      ['flèche', () => { if (arrow) click(arrow); }],
      ['clavier', () => { try { input.focus(); } catch (e) {} pressKey(input, 'ArrowDown'); }],
      ['onclick R2', () => { if (pg && typeof pg.onclick === 'function') pg.onclick.call(pg, new (page(window)).MouseEvent('click', forPage({ bubbles: true }))); }]
    ];
    let opt = null, how = '';
    for (const [name, t] of tries) {
      try { t(); } catch (e) { /* méthode suivante */ }
      opt = await waitFor(pick, 1300, 120);
      if (opt) { how = name; break; }
    }
    mo.disconnect();
    if (opt && opt !== 'none') {
      mouse(opt, 'mouseover'); mouse(opt, 'mousemove');
      await sleep(80);
      click(opt);
      if (await waitFor(() => norm(input.value) === norm(txt(opt)) || norm(input.value).includes(w), 3000)) {
        log(`liste ${id} = ${input.value} (${how})`);
        await sleep(300);
        return true;
      }
    }
    log(`liste ${id} : ${opt === 'none' ? '« ' + wanted + ' » absent des choix' : 'ne s’ouvre pas'}`);
    if (optional && opt === 'none') { try { pressKey(input, 'Escape'); blur(input); } catch (e) {} return false; }
    const name = label || id;
    const r = await pause(`Choisis « ${wanted} » dans la liste « ${name} »${opt === 'none' ? ' (je ne le trouve pas tel quel)' : ''}. Je continue tout de suite après.`,
      () => norm(input.value) === w || norm(input.value).startsWith(w));
    if (r === 'stop') throw new Stop();
    say('Je continue…');
    await sleep(300);
    return true;
  }

  function check(el, on = true) {
    if (!el) return false;
    if (el.checked !== on) click(el);
    if (el.checked !== on) {
      el.checked = on; fire(el, 'change');
      try { const pg = page(el); if (pg && typeof pg.onclick === 'function') pg.onclick.call(pg); } catch (e) { /* rien */ }
    }
    return true;
  }

  // ---------- Attente de R2 (« Loading page, please wait… ») ----------
  let overlayIgnored = false;
  function covering(el) {
    if (!visible(el)) return false;
    const r = el.getBoundingClientRect();
    if (r.right <= 0 || r.bottom <= 0 || r.left >= innerWidth || r.top >= innerHeight) return false;
    return getComputedStyle(el).opacity !== '0';
  }
  function loadingShown() {
    if (overlayIgnored) return false;
    const d = $id('actionLoadingPage_trackingDiv');
    if (d && covering(d)) return true;
    return [...document.querySelectorAll('div[id*="oading"], div[class*="oading"]')]
      .some(x => covering(x) && txt(x).length < 140 && /please wait/i.test(txt(x)));
  }
  async function waitIdle(timeout = 45000) {
    await sleep(350);
    const t0 = Date.now();
    let calm = 0;
    while (Date.now() - t0 < timeout) {
      if (stopRequested) throw new Stop();
      calm = loadingShown() ? 0 : calm + 1;
      if (calm >= 2) return true;
      await sleep(250);
    }
    // le voile de chargement ne disparaît jamais : on ne s'y fie plus
    overlayIgnored = true;
    log('voile de chargement toujours affiché après ' + Math.round(timeout / 1000) + ' s : ignoré pour la suite');
    return false;
  }

  const durationDigits = (d) => {
    const p = (d || '').split(':').map(s => s.trim()).filter(Boolean);
    if (p.length === 3) return `${+p[0]}${p[1].padStart(2, '0')}${p[2].padStart(2, '0')}`;
    if (p.length === 2) return `${+p[0]}${p[1].padStart(2, '0')}`;
    return (d || '').replace(/\D/g, '');
  };
  const durationFull = (d) => {
    const p = (d || '').split(':').map(s => +s.trim() || 0);
    while (p.length < 3) p.unshift(0);
    return `${p[0]}:${String(p[1]).padStart(2, '0')}:${String(p[2]).padStart(2, '0')}`;
  };
  const seconds = (d) => (String(d || '').match(/\d+/g) || []).reduce((a, n) => a * 60 + +n, 0);

  // ---------- Fenêtres de R2 (Yes / No / Ok) ----------
  function dialog() {
    // la fenêtre du dessus (la dernière ouverte)
    const b = [...document.querySelectorAll('a#yesButton, a#okButton')].filter(visible).pop();
    if (!b) return null;
    const yes = b.id === 'yesButton' ? b : null, ok = b.id === 'okButton' ? b : null;
    // Le bouton porte lui-même une classe « modal… » : on remonte jusqu'au bloc qui contient le message
    let box = b.parentElement, text = '';
    for (let i = 0; i < 6 && box && box !== document.body; i++, box = box.parentElement) {
      const t = txt(box);
      if (t.length > 1500) break;
      const buttons = [...box.querySelectorAll('a, button')].map(txt).join('');
      if (t.replace(/\s/g, '').length - buttons.replace(/\s/g, '').length > 3) {
        const c = box.cloneNode(true);
        c.querySelectorAll('a, button').forEach(x => x.remove());
        text = (c.textContent || '').replace(/\s+/g, ' ').trim();
        break;
      }
    }
    return { yes, ok, text: text.slice(0, 300), onclick: b.getAttribute('onclick') || '' };
  }

  const YES_SAVE = /isClipTabEditable|checkClosedCaptionedFields/;          // « enregistrer avant de quitter ? »
  const YES_DELETE = /deleteTrack|processUnlinkCoverArt|removeContributorsConfirmed|removeTrack|removeWorkContributor/;
  const YES_DELETE_TXT = /remove (this|these) (track|contributor)|unlink/i;
  const NEVER = /validationTranslationToMain|submit/i;                      // le Submit reste à l'utilisateur
  let expectDeleteUntil = 0;
  const expectDelete = () => { expectDeleteUntil = Date.now() + 12000; };
  let dialogSeen = null, watcher = null;

  function watchDialogs() {
    const d = dialog();
    if (!d) { dialogSeen = null; if (ui.ask) { ui.ask = null; render(); } return; }
    const key = d.onclick + '|' + d.text;
    if (!dialogSeen || dialogSeen.key !== key) { dialogSeen = { key, t: Date.now() }; return; } // laisse R2 finir d'afficher
    if (Date.now() - dialogSeen.t < 350) return;
    if (NEVER.test(d.onclick) || /submit/i.test(d.text)) return;
    const answer = (btn, why) => { log(`fenêtre R2 « ${d.text.slice(0, 120)} » → ${why}`); dialogSeen = null; click(btn); };
    if (d.yes) {
      if (YES_SAVE.test(d.onclick)) return answer(d.yes, 'Yes (enregistrer et continuer)');
      if (/embargo/i.test(d.text)) return answer(d.yes, 'Yes (embargo)');
      if (Date.now() < expectDeleteUntil && (YES_DELETE.test(d.onclick) || YES_DELETE_TXT.test(d.text))) { expectDeleteUntil = 0; return answer(d.yes, 'Yes (retrait demandé)'); }
      if (Date.now() - dialogSeen.t > 2500 && !ui.ask) {
        log(`fenêtre R2 inconnue : « ${d.text.slice(0, 160)} » [${d.onclick.slice(0, 80)}]`);
        ui.ask = `R2 pose une question${d.text ? ' : « ' + d.text.slice(0, 140) + ' »' : ''}. Réponds dans R2, je continue ensuite.`;
        render();
      }
      return;
    }
    if (d.ok) {
      const t = d.text.replace(/^alert\s*/i, '').trim();
      if (t && !notes.includes(t)) notes.push(t);
      return answer(d.ok, 'Ok');
    }
  }

  // Message d'erreur de validation affiché par R2 après un Save
  function validationText() {
    for (const el of document.querySelectorAll('div, span, td, li, p, b, font')) {
      if (el.childElementCount > 4) continue;
      const t = el.textContent;
      if (!t || t.length > 500 || !/validation error/i.test(t)) continue;
      if (visible(el)) return txt(el.parentElement && txt(el.parentElement).length < 500 ? el.parentElement : el).slice(0, 300);
    }
    return '';
  }

  // ---------- Reconnaissance de l'écran ----------
  const identifyFrame = () => [...document.querySelectorAll('iframe')].find(f => /identify|party-workspace/i.test((f.getAttribute('src') || '') + ' ' + (f.src || '') + ' ' + f.id + ' ' + (f.name || '')) && visible(f)) || null;
  function screen() {
    if (identifyFrame()) return 'identify';
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
  const titleValue = () => (($id('title') && $id('title').value) || '').trim();
  const titleIs = (t) => norm(titleValue()) === norm(t);

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
  async function saveRun(run) {
    const d = await browser.storage.local.get(STATE);
    const st = d[STATE] || { steps: {} };
    st.run = run;
    await browser.storage.local.set({ [STATE]: st });
    ui.run = run;
  }

  // ---------- Pause : on attend l'utilisateur (ex. choix dans Identify), reprise automatique ----------
  let pauseResolve = null;
  function pause(message, autoUntil) {
    log('PAUSE : ' + message);
    return new Promise(resolve => {
      pauseResolve = resolve;
      ui.status = { kind: 'pause', text: message };
      render();
      if (autoUntil) {
        (async () => {
          const t0 = Date.now();
          while (pauseResolve === resolve && Date.now() - t0 < 45 * 60 * 1000) {
            let ok = false;
            try { ok = autoUntil(); } catch (e) { /* on réessaie */ }
            if (ok) { if (pauseResolve === resolve) { pauseResolve = null; log('reprise automatique'); resolve('auto'); } return; }
            await sleep(500);
          }
        })();
      }
    });
  }
  function say(t) { ui.status = { kind: 'run', text: t }; log(t); render(); }

  // Attend une condition ; si elle n'arrive pas, explique quoi faire et reprend tout seul dès que c'est bon
  async function until(fn, timeout, message) {
    const v = await waitFor(fn, timeout, 300);
    if (v) return v;
    const r = await pause(message, fn);
    if (r === 'stop') throw new Stop();
    say('Je continue…');
    await sleep(400);
    try { return fn() || true; } catch (e) { return true; }
  }

  async function saveAndCheck(sel, what) {
    const b = await until(() => vis(sel), 10000, `Je ne vois pas le bouton Save (${what}). Affiche ${what}, je continue ensuite.`);
    click(b === true ? vis(sel) : b);
    await sleep(700);
    await waitIdle();
    await sleep(500);
    if (!await waitFor(() => !dialog(), 8000)) {
      const d = dialog();
      await until(() => !dialog(), 500, `R2 pose une question avant d’enregistrer ${what}${d && d.text ? ' : « ' + d.text.slice(0, 140) + ' »' : ''}. Réponds dans R2, je continue ensuite.`);
    }
    await waitIdle();
    const v = validationText();
    if (v) {
      log('validation R2 : ' + v);
      const r = await pause(`R2 refuse d’enregistrer ${what} : ${v.slice(0, 200)} — corrige dans R2, clique Save, puis Continuer.`);
      if (r === 'stop') throw new Stop();
      say('Je continue…');
    }
  }

  // ---------- Onglets ----------
  async function openTab(id, shown, label) {
    if (shown()) return true;
    const attempts = [
      () => { const a = $id(id); if (a) click(a); },
      () => { const a = $id(id); if (a && a.parentElement) click(a.parentElement); },
      () => { const a = $id(id); const li = a && a.closest('li'); if (li) click(li); },
      () => { for (let n = $id(id), i = 0; n && i < 3; n = n.parentElement, i++) { const p = page(n); if (p && typeof p.onclick === 'function') { p.onclick.call(p, new (page(window)).MouseEvent('click', forPage({ bubbles: true }))); break; } } }
    ];
    for (const a of attempts) {
      try { a(); } catch (e) { /* suivante */ }
      await sleep(500);
      await waitIdle();
      if (await waitFor(shown, 9000)) return true;
    }
    await until(shown, 2000, `Ouvre l’onglet « ${label} », je continue dès qu’il est affiché.`);
    return true;
  }

  // ---------- Arbre (Explorer) ----------
  const treeRows = () => [...document.querySelectorAll('td.standartTreeRow')];

  async function expandFolder(re) {
    const td = treeRows().find(x => re.test(txt(x)));
    if (!td) return false;
    const row = td.closest('tr');
    const plus = row && [...row.querySelectorAll('img')].find(i => /plus/i.test(i.getAttribute('src') || ''));
    if (!plus) return false;
    log('ouverture du dossier ' + txt(td).slice(0, 30));
    click(plus);
    await sleep(900);
    await waitIdle();
    return true;
  }

  // Ressources de l'arbre : « Titre | ISRC | 0:02:12 » ou « Titre [Cover Art] (3000w x 3000h pixels) | code | 0:00:00 »
  function resourceList() {
    const out = [];
    const push = (el, td, id) => {
      const t = txt(el);
      const parts = t.split('|').map(x => x.trim());
      if (parts.length < 3 || !/^\d{1,2}:\d{2}(:\d{2})?$/.test(parts[parts.length - 1])) return;
      const full = parts.slice(0, -2).join(' | ');
      const cover = /\[cover art\]/i.test(full);
      out.push({ el, td, id, text: t, code: parts[parts.length - 2], cover, title: cover ? full.replace(/\s*\[cover art\].*$/i, '') : full });
    };
    const spans = [...document.querySelectorAll('span[id^="resource_"]')];
    if (spans.length) {
      for (const s of spans) {
        const el = [...s.children].reverse().find(c => txt(c)) || s;
        push(el, s.closest('td') || s, +(s.id.replace(/\D/g, '')) || 0);
      }
    } else {
      treeRows().forEach((td, i) => { if (!td.querySelector('[id^="digital_"],[id^="physical_"]')) push(td.querySelector('div') || td, td, i); });
    }
    return out;
  }

  async function findResourceNode(title, { cover = false, codes = [], timeout = 60000 } = {}) {
    const w = norm(title);
    const pick = () => {
      const list = resourceList().filter(r => r.cover === cover && norm(r.title) === w);
      if (!list.length) return null;
      return list.find(r => codes.includes(r.code)) || list.sort((a, b) => b.id - a.id)[0];
    };
    let hit = pick();
    if (!hit || !visible(hit.el)) {
      if (await expandFolder(/^RESOURCES\s*\(/i) || !hit) hit = await waitFor(pick, hit ? 5000 : timeout, 500);
    }
    return hit;
  }

  // Releases de l'arbre : « Titre | UPC | Artiste(s) | Config »
  function releaseList() {
    const out = [];
    for (const el of document.querySelectorAll('[id^="digital_"][id$="_text"]')) {
      const parts = txt(el).split('|').map(x => x.trim());
      if (parts.length < 3) continue;
      const artists = parts[2];
      const names = artists.split(/\s*(?:,|&|\/|\bfeat\.?|\bft\.?|\sx\s)\s*/i).map(norm).filter(Boolean);
      out.push({ el, td: el.closest('td') || el, title: parts[0], upc: parts[1], artists, names, id: +((el.id.match(/digital_(\d+)/) || [])[1] || 0) });
    }
    return out;
  }
  let scanArtistReleases = function (artist, excludeTitle, feats) {
    const a = norm(artist);
    const wanted = [a, ...(feats || []).map(norm)].sort().join('|');
    return releaseList()
      .filter(r => r.names.includes(a) && !/\[copy\]/i.test(r.title) && !(excludeTitle && norm(r.title) === norm(excludeTitle)))
      .map(r => ({ ...r, main: r.names[0] === a, exact: [...r.names].sort().join('|') === wanted }))
      // mêmes artistes que la fiche d'abord (pas de featuring hérité), puis artiste principal, puis la plus récente
      .sort((x, y) => (y.exact - x.exact) || (y.main - x.main) || (y.id - x.id));
  };
  async function findLatestArtistRelease(artist, excludeTitle, feats) {
    const scan = scanArtistReleases;
    scanArtistReleases = (a, e) => scan(a, e, feats);
    try { return await findLatest0(artist, excludeTitle); } finally { scanArtistReleases = scan; }
  }
  async function findLatest0(artist, excludeTitle) {
    let list = scanArtistReleases(artist, excludeTitle);
    if (!list.length && await expandFolder(/^RELEASES\s*\(/i)) {
      list = (await waitFor(() => { const l = scanArtistReleases(artist, excludeTitle); return l.length ? l : null; }, 25000, 500)) || [];
    }
    return list[0] || null;
  }
  const newReleaseNode = (job, notId) => releaseList()
    .filter(r => norm(r.title) === norm(job.title) && r.id !== notId && (!job.artist || r.names.includes(norm(job.artist))))
    .sort((a, b) => b.id - a.id)[0] || null;

  // Clic droit → Copy
  async function contextCopy(target) {
    try { target.scrollIntoView({ block: 'center' }); } catch (e) { /* rien */ }
    click(target); await sleep(450);
    const r = target.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + 12, clientY: r.top + r.height / 2, button: 2, buttons: 2 };
    target.dispatchEvent(new MouseEvent('mousedown', o));
    target.dispatchEvent(new MouseEvent('mouseup', o));
    target.dispatchEvent(new MouseEvent('contextmenu', o));
    const item = await waitFor(() => vis('td#menuItem_copyResource') ||
      [...document.querySelectorAll('table.menuTable td.defaultMenuText')].find(td => visible(td) && /^copy$/i.test(txt(td))), 5000);
    if (!item) { log('menu clic droit : « Copy » introuvable'); return false; }
    click(item.querySelector('img') || item);
    return true;
  }

  // Double-clic dans l'arbre (ouvre la release / la ressource)
  async function openNode(el) {
    try { el.scrollIntoView({ block: 'center' }); } catch (e) { /* rien */ }
    click(el); await sleep(150); click(el);
    mouse(el, 'dblclick', { detail: 2 });
  }

  const waitScreen = (name, timeout = 30000) => waitFor(() => screen() === name, timeout, 300);

  // ---------- Grilles de la release ----------
  function tracksBox() {
    const anchor = vis('img#img_add_tracks') || vis('img#img_delete_tracks');
    if (!anchor) return null;
    for (let n = anchor.parentElement, i = 0; n && i < 12; n = n.parentElement, i++) {
      const box = [...n.querySelectorAll('div.objbox')].filter(visible)
        .find(b => (anchor.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) && !b.querySelector('tr.coverArtRow'));
      if (box) return box;
    }
    return null;
  }
  // Pistes de la release ouverte (onglet Tracks)
  function readTracks(wantedTitle) {
    const box = tracksBox();
    if (!box) return [];
    const out = [];
    for (const tr of box.querySelectorAll('tr')) {
      if (!visible(tr) || tr.classList.contains('coverArtRow')) continue;
      const links = [...tr.querySelectorAll('a[href]')].map(a => a.getAttribute('href') || '');
      if (!links.some(h => /loadTrack|removeTrack/.test(h))) continue;
      const isNew = links.some(h => /removeTrackFromNewRelease|resource_new_/.test(h));
      const cells = [...tr.querySelectorAll('td')].map(txt);
      let title = '';
      const hist = links.map(h => h.match(/loadTrackHistory\('\d+',\s*'((?:[^'\\]|\\.)*)'/)).find(Boolean);
      if (hist) title = hist[1].replace(/\\'/g, "'");
      if (!title && wantedTitle) title = cells.find(c => norm(c) === norm(wantedTitle)) || '';
      if (!title) title = cells.filter(c => c && !/^[\d:.\s]+$/.test(c) && c.length > 1).sort((a, b) => b.length - a.length)[0] || '?';
      const isrcLink = [...tr.querySelectorAll('a[href*="cmd=loadTrack"]')].map(txt).find(Boolean) || '';
      out.push({ row: tr, title, isrc: isrcLink, isNew, cells });
    }
    return out;
  }
  const waitTracks = async (timeout = 15000) => (await waitFor(() => { const t = readTracks(); return t.length ? t : null; }, timeout, 400)) || [];

  function selectRow(row, text) {
    const tds = [...row.querySelectorAll('td')].filter(td => visible(td) && !td.querySelector('a, img, input'));
    const cell = (text && tds.find(td => norm(txt(td)) === norm(text))) || tds.find(td => txt(td).length > 1) || tds[0] || row;
    click(cell);
  }

  async function deleteOldTracks(keepTitle) {
    let removed = 0;
    for (let i = 0; i < 12; i++) {
      const all = readTracks();
      const olds = all.filter(t => !t.isNew && !(keepTitle && norm(t.title) === norm(keepTitle)));
      if (!olds.length) break;
      const t = olds[0], n = all.length;
      log(`retrait de l’ancienne piste « ${t.title} »`);
      selectRow(t.row, t.title);
      await sleep(500);
      const del = vis('img#img_delete_tracks');
      expectDelete();
      if (del) click(del);
      let ok = await waitFor(() => readTracks().length < n, 8000);
      if (!ok) {
        const a = t.row.isConnected && t.row.querySelector('a[title="Remove Track"], a[href*="removeTrack("]');
        if (a) { expectDelete(); click(a.querySelector('img') || a); ok = await waitFor(() => readTracks().length < n, 8000); }
      }
      if (!ok) { log('retrait de piste non confirmé'); break; }
      await waitIdle();
      removed++;
    }
    return removed;
  }

  const unseqTab = () => $id('tabBar_releases_unsequenced_tab_div_a');
  const unseqCount = () => { const m = txt(unseqTab()).match(/\((\d+)\)/); return m ? +m[1] : null; };
  const coverRows = () => [...document.querySelectorAll('tr.coverArtRow')].filter(visible);
  const unseqShown = () => !tracksBox() || coverRows().length > 0;
  async function showUnseq() {
    const tab = unseqTab();
    if (!tab) return false;
    if (!unseqShown()) {
      click(tab);
      await sleep(600); await waitIdle();
      if (!await waitFor(unseqShown, 5000)) { click(tab.parentElement || tab); await sleep(600); await waitIdle(); }
      if (!await waitFor(unseqShown, 4000)) log('onglet Unseq : affichage non confirmé');
    }
    await sleep(700);
    await waitIdle();
    return true;
  }
  async function showTracks() {
    if (tracksBox()) return true;
    const tab = [...document.querySelectorAll('a[id^="tabBar_releases_"][id$="_tab_div_a"]')].find(a => /^(tracks?|seq)/i.test(txt(a)) && a !== unseqTab());
    if (tab) await openTab(tab.id, () => !!tracksBox(), 'Tracks');
    return !!tracksBox();
  }
  function unseqBox() {
    const row = coverRows()[0];
    if (row) return row.closest('div.objbox');
    const tab = unseqTab(), tb = tracksBox();
    return [...document.querySelectorAll('div.objbox')].filter(visible)
      .find(b => b !== tb && !b.querySelector('td.standartTreeRow') && !b.closest('#r2auto-host') && (!tab || (tab.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING))) || null;
  }
  // une ressource est posée dans Unseq (ligne de cover, ou toute ligne avec un lien)
  const unseqHasRow = () => coverRows().length > 0 || (!tracksBox() && !!unseqBox() && [...unseqBox().querySelectorAll('tr')].some(tr => visible(tr) && tr.querySelector('a[href]')));

  async function unlinkOldCover() {
    if (unseqCount() === 0) return 0;
    if (!await showUnseq()) return 0;
    await waitFor(() => coverRows().length, 8000);
    let removed = 0;
    for (let i = 0; i < 4; i++) {
      const rows = coverRows();
      if (!rows.length) break;
      const row = rows[0], n = rows.length;
      const link = row.querySelector('a[title="Remove Resource"]') || [...row.querySelectorAll('a')].find(a => /trash/i.test((a.querySelector('img') || a).getAttribute('src') || ''));
      const trash = (link && (link.querySelector('img') || link)) || [...row.querySelectorAll('img')].find(im => /trash/i.test(im.getAttribute('src') || ''));
      if (!trash) { log('cover : corbeille introuvable'); break; }
      log('retrait de l’ancienne cover');
      expectDelete();
      click(trash);
      if (!await waitFor(() => coverRows().length < n, 9000)) { log('retrait de cover non confirmé'); break; }
      await waitIdle();
      removed++;
    }
    return removed;
  }

  // ---------- Glisser-déposer de l'arbre vers une grille (c'est ainsi que R2 rattache piste et cover) ----------
  function dropTarget(box) {
    if (!box) return null;
    const big = (el) => { if (!el || !visible(el)) return false; const r = el.getBoundingClientRect(); return r.height >= 8 && r.width >= 30; };
    const cell = [...box.querySelectorAll('tr')].filter(tr => visible(tr) && tr.querySelector('td')).map(tr => [...tr.querySelectorAll('td')].find(big)).find(Boolean);
    return [cell, box, box.parentElement, box.parentElement && box.parentElement.parentElement].find(big) || box;
  }
  const chain = (el, prop) => { for (let n = el; n && n.nodeType === 1; n = n.parentElement) { const p = page(n); try { if (p && p[prop]) return n; } catch (e) { /* suivant */ } } return null; };
  function dndInfo(src, target) {
    let w = false;
    try { w = !!page(window).dhtmlDragAndDrop; } catch (e) { /* rien */ }
    const d = (el) => el ? `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\s+/)[0] : ''}` : 'aucun';
    return `dhtmlDragAndDrop=${w} · source=${d(src)} prise=${d(chain(src, 'onmousedown'))} départ=${d(chain(src, 'dragStarter'))} · cible=${d(target)} dépôt=${d(chain(target, 'dragLanding'))}`;
  }

  async function dragSynthetic(src, target) {
    const ev = (el, type, x, y, buttons = 1) => el.dispatchEvent(new MouseEvent(type, {
      bubbles: true, cancelable: true, view: window, clientX: x, clientY: y, screenX: x, screenY: y, button: 0, buttons
    }));
    host.style.display = 'none'; // le bandeau ne doit pas se trouver sous le « curseur »
    try {
      try { target.scrollIntoView({ block: 'nearest' }); src.scrollIntoView({ block: 'center' }); } catch (e) { /* rien */ }
      await sleep(250);
      const a = src.getBoundingClientRect();
      const x1 = a.left + Math.min(20, a.width / 2), y1 = a.top + a.height / 2;
      ev(src, 'mouseover', x1, y1, 0); ev(src, 'mousemove', x1, y1, 0);
      ev(src, 'mousedown', x1, y1);
      await sleep(280); // dhtmlx ignore les mouvements des 100 premières ms
      for (const d of [6, 14, 26, 40]) { ev(src, 'mousemove', x1 + d, y1 + d / 3); await sleep(55); }
      const b = target.getBoundingClientRect();
      const x2 = b.left + Math.min(80, b.width / 2), y2 = b.top + Math.min(12, b.height / 2);
      for (let i = 1; i <= 4; i++) {
        const x = x1 + (x2 - x1) * i / 5, y = y1 + (y2 - y1) * i / 5;
        ev(document.elementFromPoint(x, y) || document.body, 'mousemove', x, y);
        await sleep(45);
      }
      ev(target, 'mouseover', x2, y2);
      for (const d of [0, 2, 4]) { ev(target, 'mousemove', x2 + d, y2 + d / 2); await sleep(75); }
      await sleep(140);
      ev(target, 'mouseup', x2 + 4, y2 + 2, 0);
    } finally { host.style.display = ''; }
  }

  // Secours : on appelle directement le glisser-déposer de R2 (dhtmlx)
  function dragInternal(src, target) {
    const s = chain(src, 'dragStarter') || chain(src, 'dragLanding');
    const l = chain(target, 'dragLanding');
    if (!s || !l) return false;
    const ps = page(s), pl = page(l), landing = pl.dragLanding;
    const r = target.getBoundingClientRect();
    const e = new (page(window)).MouseEvent('mousemove', forPage({ bubbles: true, clientX: r.left + 20, clientY: r.top + 8 }));
    try { if (typeof landing._dragIn === 'function') landing._dragIn(pl, ps, r.left + 20, r.top + 8, e); } catch (err) { log('dragIn : ' + err.message); }
    landing._drag(ps, ps.dragStarter || ps.dragLanding, pl, page(target));
    try { if (typeof landing._dragOut === 'function') landing._dragOut(pl); } catch (err) { /* rien */ }
    return true;
  }

  async function dropInto(node, getTarget, done, what, manual) {
    if (done()) return true;
    const src = node.el;
    let target = getTarget();
    log(`glisser ${what} : ${dndInfo(src, target)}`);
    if (target) {
      await dragSynthetic(src, target);
      await sleep(400); await waitIdle();
      if (await waitFor(done, 7000)) { log(`${what} : déposé (souris simulée)`); return true; }
      // deuxième essai, plus lent, sur la zone de la grille elle-même
      target = getTarget();
      const alt = target && (target.closest('div.objbox') || target);
      if (alt) {
        await dragSynthetic(src, alt);
        await sleep(400); await waitIdle();
        if (await waitFor(done, 6000)) { log(`${what} : déposé (2e essai)`); return true; }
      }
      try {
        if (dragInternal(src, getTarget() || target)) {
          await sleep(400); await waitIdle();
          if (await waitFor(done, 7000)) { log(`${what} : déposé (appel direct R2)`); return true; }
        }
      } catch (e) { log(`${what} : appel direct R2 impossible (${e.message})`); }
    }
    log(`${what} : dépôt automatique sans effet`);
    try { src.scrollIntoView({ block: 'center' }); } catch (e) { /* rien */ }
    await until(done, 500, manual);
    return true;
  }

  // ---------- Contributeurs ----------
  const contribRows = (kind) => [...new Set([...document.querySelectorAll(`a[href*="${kind}"]`)].filter(visible).map(a => a.closest('tr')).filter(Boolean))];
  const hasContributor = (kind, name) => contribRows(kind).some(tr => norm(txt(tr)).includes(norm(name)) || [...tr.querySelectorAll('a')].some(a => norm(a.getAttribute('title') || '').includes(norm(name))));

  // Ajoute un contributeur : nom → Tab (R2 cherche) → Identify si besoin (choix par l'utilisateur) → Save
  async function addContributor(kind, name, group, role) {
    const addSel = kind === 'writer' ? 'img#img_writers_composers_add' : 'img#img_secondary_contributors_add';
    const modalSave = () => vis('a#saveButton[onclick*="saveContributor"]');
    const nameInput = () => { const e = $id('contributor_name_0'); return e && visible(e) ? e : null; };
    log(`contributeur ${kind} : ${name}`);
    if (!modalSave()) {
      await until(() => vis(addSel), 25000, `Je ne vois pas le bouton + (${kind === 'writer' ? 'Add Writer/Composer' : 'Add Secondary Contributor'}). Affiche l’onglet Contributors, je continue ensuite.`);
      click(vis(addSel));
    }
    const inp0 = await until(nameInput, 15000, `La fenêtre « New Contributor » ne s’ouvre pas : clique le + pour ajouter « ${name} », je prends la suite.`);
    const inp = inp0 === true ? nameInput() : inp0;
    if (!inp) throw new Error('fenêtre « New Contributor » introuvable');
    await sleep(500);
    try { inp.focus(); } catch (e) { /* rien */ }
    inp.value = name;
    fire(inp, 'input', 'keyup');
    await sleep(300);
    if (group) {
      await setCombo('role_group_0', group, 'Role Group');
      await sleep(600);
      if (role) await setCombo('role_0', role, 'Role');
      await sleep(300);
      if (nameInput() && norm(nameInput().value) !== norm(name)) { nameInput().value = name; fire(nameInput(), 'input', 'keyup'); }
    }
    // Tab : R2 retrouve la personne tout seul, ou ouvre Identify
    const field = nameInput() || inp;
    try { field.focus(); } catch (e) { /* rien */ }
    pressKey(field, 'Tab');
    fire(field, 'change');
    blur(field);
    let idf = await waitFor(identifyFrame, 2500);
    if (!idf && modalSave()) {
      // R2 n'a pas lancé la recherche tout seul : la loupe
      const loupe = vis('img#contributor_name_0_img');
      if (loupe) { click(loupe); idf = await waitFor(identifyFrame, 12000); }
    }
    const choose = async () => {
      const r = await pause(`Choisis « ${name} » dans Identify (bouton Select). Je continue dès que c’est fait.`, () => !identifyFrame());
      if (r === 'stop') throw new Stop();
      say('Je continue…');
      await sleep(900);
    };
    if (idf) await choose(); else log('Identify ne s’est pas ouvert pour ' + name);
    const trySave = async () => {
      const b = modalSave();
      if (!b) return true;
      click(b);
      await waitFor(() => !modalSave() || identifyFrame(), 8000);
      return !modalSave();
    };
    let saved = await trySave();
    for (let i = 0; i < 2 && !saved && identifyFrame(); i++) { await choose(); saved = await trySave(); }
    if (!saved && modalSave()) {
      await until(() => !modalSave(), 500, `Je n’arrive pas à enregistrer « ${name} » : dans la fenêtre New Contributor, clique la loupe, choisis la personne (Select) puis Save — ou Cancel pour passer. Je continue ensuite.`);
    }
    await waitIdle();
    await sleep(400);
  }

  async function removeSecondaryContributors() {
    await openTab('tabBar_resources_contributors_tab_div_a', () => vis('img#img_secondary_contributors_add') || vis('img#img_secondary_contributors_delete'), 'Contributors');
    await sleep(900);
    const rows = () => contribRows('editSecondaryContributor');
    await waitFor(() => rows().length, 3000);
    for (let i = 0; i < 12; i++) {
      const rs = rows();
      if (!rs.length) return true;
      const row = rs[0], n = rs.length;
      log('cover : retrait d’un contributeur secondaire copié');
      selectRow(row);
      await sleep(400);
      const del = vis('img#img_secondary_contributors_delete');
      expectDelete();
      if (del) click(del);
      let ok = await waitFor(() => rows().length < n, 7000);
      if (!ok) {
        const a = row.isConnected && row.querySelector('a[title="Remove Contributor"]');
        if (a) { selectRow(row); await sleep(200); expectDelete(); click(a.querySelector('img') || a); ok = await waitFor(() => rows().length < n, 7000); }
      }
      if (!ok) { log('retrait de contributeur non confirmé'); return false; }
      await waitIdle();
    }
    return !rows().length;
  }

  // ---------- Remplissages, écran par écran ----------
  const yearOf = (job) => (job.date || '').slice(0, 4);
  function fixYear(id, job, set) {
    const el = $id(id), y = yearOf(job);
    if (!el || !visible(el) || set.fixYears === false || !/^\d{4}$/.test(y)) return;
    if (/^\d{4}$/.test(el.value.trim()) && el.value.trim() !== y) { log(`${id} : ${el.value} → ${y}`); setText(el, y); }
  }

  const ACTIONS = {
    async copyRelease({ set }) {
      await setCombo('configGroup_1', set.configGroup || 'e-Product', 'Config Group');
      await sleep(600);
      await setCombo('configuration_1', set.configuration || 'eSingle Audio', 'Configuration');
      await step('copyRelease', 'ok');
      if (set.autoSave === false) return 'Rempli. Clique « Save » pour créer la copie.';
      const save = () => vis('a#saveButton[onclick*="copyRelease"]');
      click(save());
      await waitFor(() => !save(), 20000);
      await waitIdle();
      return 'Release copiée.';
    },

    // Titre, UPC Auto, date, (genre), puis retrait de l'ancienne piste et de l'ancienne cover, puis Save
    async release({ job, set }, arg, run) {
      if (!job.title) throw new Error('la fiche n’a pas de titre (panneau Auto R2)');
      const tracks = await waitTracks(run ? 15000 : 6000);
      if (run) {
        const copied = titleValue().replace(/\s*\[copy\]\s*$/i, '').trim();
        run.old = [...new Set([...tracks.filter(t => !t.isNew).map(t => t.title), copied, run.modelTitle].filter(t => t && norm(t) !== norm(job.title)))];
        run.oldCodes = tracks.map(t => t.isrc).filter(Boolean);
        log('ancienne(s) piste(s) : ' + run.old.join(' / ') + ' ' + run.oldCodes.join(','));
      }
      setText($id('title'), job.title);
      const upc = $id('upc_type');
      if (upc && visible(upc)) { try { setSelect(upc, 'Auto'); } catch (e) { log('UPC Auto : ' + e.message); } }
      if (job.date) {
        const [y, m, d] = job.date.split('-');
        if ($id('original_release_date_month')) setSelect($id('original_release_date_month'), MONTHS[+m - 1]);
        if ($id('original_release_date_day')) setText($id('original_release_date_day'), String(+d));
        if ($id('original_release_date_year') && $id('original_release_date_year').value.trim() !== y) setText($id('original_release_date_year'), y);
      }
      if (job.genre && $id('genre') && $id('genre').tagName === 'SELECT') {
        try { setSelect($id('genre'), job.genre); } catch (e) { log('genre release : ' + e.message); notes.push(`Genre « ${job.genre} » introuvable dans la liste de la release`); }
      }
      fixYear('p_notice_year', job, set); fixYear('c_notice_year', job, set);
      await sleep(400);
      const nT = await deleteOldTracks(null);
      const left = readTracks().filter(t => !t.isNew).length;
      const nC = await unlinkOldCover();
      log(`ménage : ${nT} piste(s), ${nC} cover retirée(s)`);
      if (set.autoSave !== false) await saveAndCheck('img#img_saveReleaseButton', 'la release');
      await step('release', left ? 'ancienne piste à retirer à la main' : 'ok');
      return 'Release enregistrée : titre, UPC Auto, date' + (nT || nC ? ', ancienne piste / cover retirées.' : '.');
    },

    async copyResource({ job, set }, kind) {
      if (!job.title) throw new Error('la fiche n’a pas de titre (panneau Auto R2)');
      const type = $id('copy_resource_type_0');
      if (kind === 'image') {
        if (type) setSelect(type, 'Image');
        await sleep(900);
        await setCombo('copy_resource_category_0', 'Cover Art', 'Category');
      } else if (type) {
        setSelect(type, 'Audio');
        await sleep(400);
      }
      const t = $id('copy_resource_title_0');
      setText(t, job.title);
      await sleep(300);
      if (t.value !== job.title) setText(t, job.title);
      await step(kind === 'image' ? 'copyImage' : 'copyAudio', 'ok');
      if (set.autoSave === false) return 'Rempli. Clique « Save » pour créer la copie.';
      const save = () => vis('a#saveButton[onclick*="copyResource"]');
      click(save());
      await waitFor(() => !save(), 20000);
      await waitIdle();
      return kind === 'image' ? 'Copie pour la cover créée.' : 'Piste copiée.';
    },

    async resourceAudio({ job, set }) {
      // ISRC : 3rd Party + Auto-Generate
      const third = $id('isrc_id_type_third');
      if (job.isrcAuto !== false && third) {
        check(third, true);
        await sleep(600);
        const auto = await waitFor(() => { const a = $id('auto_gen'); return a && visible(a) && !a.disabled ? a : null; }, 4000);
        if (auto) { check(auto, true); await sleep(500); } else log('case Auto-Generate indisponible');
      }
      // Durée (R2 la met en forme tout seul : 313 → 0:03:13)
      if (job.duration) {
        const dur = await waitFor(() => { const d = $id('duration'); return d && visible(d) && !d.disabled ? d : null; }, 5000);
        if (dur) {
          setText(dur, durationDigits(job.duration));
          await sleep(500);
          if (seconds(dur.value) !== seconds(job.duration)) { log(`durée affichée « ${dur.value} » → saisie complète`); setText(dur, durationFull(job.duration)); await sleep(300); }
          log('durée : ' + dur.value);
        } else log('champ durée indisponible');
      }
      await step('audio', job.duration ? 'ok' : 'durée manquante (ajoute le WAV)');
      if (job.genre && $id('genre') && $id('genre').tagName === 'INPUT') {
        if (!await setCombo('genre', job.genre, 'Genre', { optional: true })) notes.push(`Genre « ${job.genre} » introuvable dans la liste de la piste`);
      }
      fixYear('pc_notice_year', job, set);

      // Contributeurs : onglet, puis Auto Work Creation (nouvelle œuvre), puis auteurs et mix/master
      await openTab('tabBar_resources_contributors_tab_div_a', () => vis('img#img_secondary_contributors_add') || vis('img#img_primary_contributors_add'), 'Contributors');
      const autoWork = $id('automatic_work_flag');
      if (autoWork && !autoWork.checked && !autoWork.disabled) {
        check(autoWork, true);
        log('Auto Work Creation cochée');
        await sleep(700);
        await waitIdle();
      }
      const writers = [];
      if (set.artistWriter !== false && job.artist) writers.push(job.artist);
      for (const w of (job.writers || [])) if (!writers.some(x => norm(x) === norm(w))) writers.push(w);
      if (writers.length) {
        await until(() => vis('img#img_writers_composers_add'), 30000,
          'Je ne vois pas le bouton « Add Writer/Composer » (onglet Contributors, Auto Work Creation cochée). Affiche-le, je continue ensuite.');
        await sleep(500);
      }
      for (const name of writers) {
        if (hasContributor('editWorkContributor', name)) { log(`auteur déjà présent : ${name}`); continue; }
        await addContributor('writer', name, null, null);
      }
      const role = set.mixRole || 'Mastering Engineer';
      for (const name of (job.mix || [])) {
        if (contribRows('editSecondaryContributor').some(tr => norm(txt(tr)).includes(norm(name)) && norm(txt(tr) + ' ' + [...tr.querySelectorAll('a')].map(a => a.title).join(' ')).includes(norm(role)))) { log(`mix/master déjà présent : ${name}`); continue; }
        await addContributor('secondary', name, set.mixGroup || 'Mastering Engineers', role);
      }
      await step('contributors', 'ok');
      if (set.autoSave === false) return 'Piste remplie. Vérifie puis clique « Save ».';
      await saveAndCheck('img#img_saveActionIcon', 'la piste');
      const isrc = $id('isrc_resource_id') && $id('isrc_resource_id').value;
      if (isrc) log('ISRC : ' + isrc);
      return 'Piste enregistrée : ISRC, durée, auteurs, mix/master.';
    },

    async resourceImage({ set }, arg) {
      const size = set.coverSize || '3000';
      const sel = (id, v) => { const el = $id(id); if (el && visible(el)) { try { setSelect(el, v); } catch (e) { log(`${id} : ${e.message}`); } } };
      sel('measurement2', 'pixels');
      sel('resolution', set.coverDpi || '300 dpi');
      sel('measurement', 'pixels');
      sel('color_mode', set.coverColor || 'RGB');
      if ($id('height')) setText($id('height'), size);
      if ($id('width')) setText($id('width'), size);
      if ($id('format')) await setCombo('format', (!set.v && set.coverFormat === 'JPEG') ? 'TIFF' : (set.coverFormat || 'TIFF'), 'Format');
      let cleaned = true;
      if (arg === 'cleanup') cleaned = await removeSecondaryContributors();
      await step('image', cleaned ? 'ok' : 'contributeurs secondaires à retirer à la main');
      if (!cleaned) notes.push('Cover : contributeurs secondaires copiés à retirer à la main');
      if (set.autoSave === false) return 'Cover remplie. Vérifie puis clique « Save ».';
      await saveAndCheck('img#img_saveActionIcon', 'la cover');
      return 'Cover enregistrée' + (arg === 'cleanup' && cleaned ? ' (contributeurs secondaires retirés).' : '.');
    },

    // Sur la release ouverte : glisse la piste dans Tracks et la cover dans Unseq, puis Save
    async link({ job, set }) {
      if (!job.title) throw new Error('la fiche n’a pas de titre (panneau Auto R2)');
      await showTracks();
      await waitFor(() => readTracks(job.title).length, 4000);
      const hasTrack = () => readTracks(job.title).some(t => t.isNew || norm(t.title) === norm(job.title));
      if (!hasTrack()) {
        say('7/7 · Rattachement de la piste à la release…');
        const node = await findResourceNode(job.title, { cover: false });
        const label = node ? node.text : `${job.title} | ISRC | durée`;
        const manual = `Glisse la piste « ${label} » depuis RESOURCES (arbre de gauche) jusque dans la grille des pistes de la release. Je continue dès qu’elle y est.`;
        if (node) await dropInto(node, () => dropTarget(tracksBox()), hasTrack, 'piste', manual);
        else await until(hasTrack, 500, manual);
      } else log('piste déjà rattachée');
      await sleep(600);

      const coverCount = () => Math.max(coverRows().length, unseqCount() || 0);
      if (!coverCount()) {
        say('7/7 · Rattachement de la cover à la release…');
        await showUnseq();
        const hasCover = unseqHasRow;
        const node = await findResourceNode(job.title, { cover: true });
        const label = node ? node.text : `${job.title} [Cover Art]`;
        const manual = `Onglet Unseq : glisse la cover « ${label} » depuis RESOURCES (arbre de gauche) jusque dans la grille. Je continue dès qu’elle y est.`;
        if (node) await dropInto(node, () => dropTarget(unseqBox()), hasCover, 'cover', manual);
        else await until(hasCover, 500, manual);
      } else log('cover déjà rattachée');
      await sleep(500);
      if (set.autoSave !== false) await saveAndCheck('img#img_saveReleaseButton', 'la release');
      await step('link', 'ok');
      return 'Piste et cover rattachées, release enregistrée.';
    }
  };

  // ---------- Projet ----------
  const projectCode = () => { const m = (treeRows().map(txt).find(t => /^\S*PJ-\d+\s+-\s+/.test(t)) || '').match(/^(\S+)/); return m ? m[1] : ''; };
  const projectLinks = () => [...document.querySelectorAll('a[href*="loadProjectByUniqueId"]')].filter(visible);
  async function ensureProject(job) {
    if (releaseList().length || treeRows().some(td => /^RELEASES\s*\(/i.test(txt(td)))) return;
    const d = await browser.storage.local.get(PROJ);
    const code = (d[PROJ] || {})[norm(job.artist)];
    const link = code && projectLinks().find(a => txt(a) === code);
    if (!link) return;
    say(`1/7 · Ouverture du projet ${code}…`);
    click(link);
    await sleep(800);
    await waitIdle();
    await waitFor(() => treeRows().some(td => /^RELEASES\s*\(/i.test(txt(td))), 30000);
  }
  async function rememberProject(job) {
    const code = projectCode();
    if (!code || !job.artist) return;
    const d = await browser.storage.local.get(PROJ);
    const map = d[PROJ] || {};
    map[norm(job.artist)] = code;
    await browser.storage.local.set({ [PROJ]: map });
  }

  // ---------- Tout enchaîner ----------
  const STAGES = ['copie de la release', 'release', 'copie de la piste', 'piste', 'copie pour la cover', 'cover', 'rattachement'];
  async function runAll(resume) {
    const data = await get();
    const job = data.job;
    data.set = { ...data.set, autoSave: true };
    const set = data.set;
    if (!job.title || !job.artist) throw new Error('fiche incomplète : remplis au moins le titre et l’artiste dans le panneau');
    const prev = data.state.run;
    const run = (resume && prev && norm(prev.title) === norm(job.title)) ? prev : { title: job.title, stage: 0, old: [], oldCodes: [] };
    if (!resume) await browser.storage.local.set({ [STATE]: { steps: {}, run } });
    const done = async (n) => { run.stage = n; await saveRun(run); log(`étape ${n}/7 terminée (${STAGES[n - 1]})`); };
    log(`=== ${resume ? 'reprise à l’étape ' + (run.stage + 1) : 'départ'} : ${job.artist} – ${job.title} (Auto R2 ${VERSION})`);

    // 1. Copie de la release modèle : la dernière sortie de l'artiste dans le projet
    if (run.stage < 1) {
      if (screen() !== 'copyRelease') {
        say(`1/7 · Recherche de la dernière sortie de ${job.artist}…`);
        await ensureProject(job);
        let model = await findLatestArtistRelease(job.artist, job.title, job.feats);
        if (!model) {
          const r = await pause(`Pas de sortie de « ${job.artist} » dans ce que je vois. Ouvre le projet du label de l’artiste (ou fais clic droit → Copy sur la release à copier) : je continue tout seul.`,
            () => screen() === 'copyRelease' || !!(model = scanArtistReleases(job.artist, job.title, job.feats)[0]));
          if (r === 'stop') throw new Stop();
          if (!model && screen() !== 'copyRelease') model = await findLatestArtistRelease(job.artist, job.title, job.feats);
        }
        const dup = newReleaseNode(job, model ? model.id : 0);
        if (dup && screen() !== 'copyRelease') {
          const r = await pause(`Une release « ${dup.title} » de ${job.artist} existe déjà dans le projet (essai précédent ?). « Continuer » en crée une nouvelle ; « Arrêter » pour garder l’existante.`);
          if (r === 'stop') throw new Stop();
        }
        if (model && screen() !== 'copyRelease') {
          run.modelTitle = model.title; run.modelId = model.id;
          if (!model.exact) { run.modelArtists = model.artists; log('modèle avec d’autres artistes : ' + model.artists); }
          say(`1/7 · Modèle : « ${model.title} » (${model.artists}). Copie…`);
          await sleep(600);
          for (let i = 0; i < 2 && screen() !== 'copyRelease'; i++) {
            await contextCopy(model.el);
            await waitScreen('copyRelease', 8000);
          }
        }
        await until(() => screen() === 'copyRelease', 500, model
          ? `Je n’ai pas réussi à ouvrir la copie de « ${model.title} ». Fais clic droit dessus → Copy, je prends la suite.`
          : 'Fais clic droit → Copy sur la release à copier, je prends la suite.');
      }
      say('1/7 · Copie de la release…');
      await ACTIONS.copyRelease(data);
      await done(1);
    }

    // 2. Release copiée : titre, UPC, date + retrait de l'ancienne piste et de l'ancienne cover
    if (run.stage < 2) {
      say('2/7 · Ouverture de la release copiée…');
      await until(() => screen() === 'release' && (/\[copy\]/i.test(titleValue()) || titleIs(job.title)), 60000,
        'Ouvre la release copiée (« … [Copy] », double-clic dans l’arbre). Je continue dès qu’elle s’affiche.');
      await waitIdle();
      say('2/7 · Release : titre, UPC, date, retrait de l’ancienne piste et de l’ancienne cover…');
      await ACTIONS.release(data, null, run);
      await done(2);
    }

    // 3. Copie de l'ancienne piste (clic droit → Copy dans RESOURCES)
    if (run.stage < 3) {
      if (screen() !== 'copyResource') {
        const titles = [...new Set([...(run.old || []), run.modelTitle].filter(Boolean))];
        let node = null;
        for (const t of titles) {
          say(`3/7 · Recherche de la piste « ${t} » dans RESOURCES…`);
          node = await findResourceNode(t, { codes: run.oldCodes || [], timeout: node === null && t === titles[0] ? 60000 : 8000 });
          if (node) break;
        }
        if (node) {
          log('piste modèle : ' + node.text);
          for (let i = 0; i < 2 && screen() !== 'copyResource'; i++) {
            await contextCopy(node.el);
            await waitScreen('copyResource', 8000);
          }
        }
        await until(() => screen() === 'copyResource', 500,
          `${node ? 'Je n’arrive pas à copier' : 'Je ne trouve pas'} la piste « ${titles[0] || '?'} » dans RESOURCES. Fais clic droit dessus → Copy, je reprends.`);
      }
      say('3/7 · Copie de la piste…');
      await ACTIONS.copyResource(data, 'audio');
      await done(3);
    }

    // 4. Piste : ISRC, durée, auteurs, mix/master (pause seulement pour Identify)
    if (run.stage < 4) {
      await until(() => screen() === 'resourceAudio' && titleIs(job.title), 60000,
        `Ouvre la nouvelle piste « ${job.title} » (double-clic dans RESOURCES). Je continue dès qu’elle s’affiche.`);
      await waitIdle();
      say('4/7 · Piste : ISRC, durée, auteurs, mix/master…');
      await ACTIONS.resourceAudio(data);
      await done(4);
    }

    // 5. Copie de la piste en image (Cover Art)
    if (run.stage < 5) {
      say('5/7 · Copie pour la cover…');
      if (screen() !== 'copyResource') {
        const btn = screen() === 'resourceAudio' && titleIs(job.title) && vis('img#img_copy_resource_icon');
        if (btn) { click(btn); await waitScreen('copyResource', 8000); }
        if (screen() !== 'copyResource') {
          const node = await findResourceNode(job.title, { timeout: 30000 });
          for (let i = 0; node && i < 2 && screen() !== 'copyResource'; i++) {
            await contextCopy(node.el);
            await waitScreen('copyResource', 8000);
          }
        }
        await until(() => screen() === 'copyResource', 500,
          `Fais clic droit → Copy sur la piste « ${job.title} » dans RESOURCES, je reprends pour la cover.`);
      }
      await ACTIONS.copyResource(data, 'image');
      await done(5);
    }

    // 6. Cover : taille, résolution, format + retrait des contributeurs secondaires copiés
    if (run.stage < 6) {
      await until(() => screen() === 'resourceImage', 60000,
        `Ouvre la ressource cover « ${job.title} [Cover Art] » (double-clic dans RESOURCES). Je continue dès qu’elle s’affiche.`);
      await waitIdle();
      say('6/7 · Cover : taille, résolution, format…');
      await ACTIONS.resourceImage(data, 'cleanup');
      await done(6);
    }

    // 7. Retour sur la release : piste dans Tracks, cover dans Unseq, Save. Le Submit reste manuel.
    if (run.stage < 7) {
      say('7/7 · Retour sur la release…');
      if (!(screen() === 'release' && titleIs(job.title))) {
        const rel = newReleaseNode(job, run.modelId || 0);
        if (rel) { log('ouverture de la release ' + rel.id); await openNode(rel.el); }
        await until(() => screen() === 'release' && titleIs(job.title), 45000,
          `Ouvre la release « ${job.title} » (double-clic dans l’arbre). Je continue dès qu’elle s’affiche.`);
      }
      await waitIdle();
      await sleep(800);
      await ACTIONS.link(data);
      await done(7);
    }
    await rememberProject(job);
    if (run.modelArtists) notes.unshift(`artistes repris de la sortie copiée : ${run.modelArtists} — à corriger s’ils ne sont pas tous sur ce titre`);
    const extra = notes.length ? ' R2 a signalé : ' + notes.map(n => '« ' + n.slice(0, 120) + ' »').join(' ; ') + '.' : '';
    return `Terminé ✓ « ${job.title} » est prête : release, piste (ISRC, durée, auteurs, mix/master) et cover rattachées et enregistrées.${extra} Vérifie, puis fais toi-même le Submit Release.`;
  }

  // ---------- Bandeau ----------
  const ui = { screen: null, busy: false, status: null, collapsed: false, ask: null, run: null, jobTitle: '' };
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
    const b = [['run', '▶ Lancer tout']];
    if (ui.run && ui.run.stage > 0 && ui.run.stage < 7 && norm(ui.run.title) === norm(ui.jobTitle)) b.push(['resume', `↻ Reprendre (étape ${ui.run.stage + 1}/7)`]);
    switch (s) {
      case 'copyRelease': b.push(['copyRelease', 'Remplir la copie']); break;
      case 'release': b.push(['release', 'Remplir la release'], ['link', 'Rattacher piste + cover']); break;
      case 'copyResource': b.push(['copyResource:audio', 'Copie : piste'], ['copyResource:image', 'Copie : cover']); break;
      case 'resourceAudio': b.push(['resourceAudio', 'Remplir la piste']); break;
      case 'resourceImage': b.push(['resourceImage:cleanup', 'Remplir la cover']); break;
    }
    return b;
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
    const paused = st && st.kind === 'pause' && pauseResolve;
    shadow.innerHTML = `
      <style>
        .b{font:12px/1.4 system-ui,"Segoe UI",sans-serif;background:#0f2747;color:#fff;border-radius:10px;padding:8px 10px;width:${ui.collapsed ? 'auto' : '300px'};box-shadow:0 8px 24px rgba(0,0,0,.3)}
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
        <div class="h" data-a="toggle"><span class="t">Auto R2 <span class="s">${VERSION}</span></span><span class="s">${s ? esc(SCREEN_LABELS[s]) : (ui.busy ? 'en cours' : 'prêt')} ${ui.collapsed ? '▸' : '▾'}</span></div>
        ${ui.collapsed ? '' : `
          ${st ? `<div class="m ${st.kind}">${esc(st.text)}</div>` : ''}
          ${ui.ask ? `<div class="m pause">${esc(ui.ask)}</div>` : ''}
          <div class="r">
            ${btns.map(([a, l]) => `<button data-a="${a}">${esc(l)}</button>`).join('')}
            ${paused ? '<button data-a="continue">Continuer</button>' : ''}
            ${ui.busy ? '<button class="g" data-a="stop">Arrêter</button>' : ''}
            <button class="g" data-a="diag">Copier le diagnostic</button>
          </div>`}
      </div>`;
    shadow.querySelectorAll('[data-a]').forEach(el => el.addEventListener('click', (e) => { e.stopPropagation(); onAction(el.dataset.a); }));
  }

  function startBusy() {
    ui.busy = true; stopRequested = false; ui.ask = null; notes.length = 0; dialogSeen = null;
    clearInterval(watcher);
    watcher = setInterval(() => { try { watchDialogs(); } catch (e) { /* rien */ } }, 300);
  }
  function endBusy() {
    clearInterval(watcher); watcher = null;
    ui.busy = false; ui.ask = null; pauseResolve = null;
    ui.screen = screen();
    render();
  }

  async function onAction(a) {
    if (a === 'toggle') { ui.collapsed = !ui.collapsed; return render(); }
    if (a === 'continue') { if (pauseResolve) { const r = pauseResolve; pauseResolve = null; log('Continuer (manuel)'); r('manual'); } return; }
    if (a === 'stop') { stopRequested = true; log('Arrêt demandé'); if (pauseResolve) { const r = pauseResolve; pauseResolve = null; r('stop'); } return; }
    if (a === 'diag') return copyDiag();
    if (ui.busy) return;
    const [name, arg] = a.split(':');
    if (name === 'run' || name === 'resume') {
      startBusy();
      try {
        ui.status = { kind: 'ok', text: await runAll(name === 'resume') };
        log('FIN : ' + ui.status.text);
      } catch (e) {
        const msg = (e && e.message) || String(e);
        log('ARRÊT : ' + msg);
        const d = await browser.storage.local.get(STATE).catch(() => ({}));
        ui.run = (d[STATE] || {}).run || ui.run;
        ui.status = { kind: 'err', text: `Arrêté : ${msg}. Corrige si besoin puis clique « Reprendre » : je repars de l’étape en cours, sans refaire ce qui est fait.` };
      } finally { endBusy(); }
      return;
    }
    if (!ACTIONS[name]) return;
    startBusy();
    say('Remplissage en cours… ne touche pas à R2 un instant.');
    try {
      const data = await get();
      ui.status = { kind: 'ok', text: await ACTIONS[name](data, arg) };
    } catch (e) {
      const msg = (e && e.message) || String(e);
      log('BLOQUÉ : ' + msg);
      ui.status = { kind: 'err', text: `Bloqué : ${msg}. Fais cette partie à la main, ou clique « Copier le diagnostic » et envoie-le à Claude.` };
      const stepName = { copyRelease: 'copyRelease', release: 'release', resourceAudio: 'audio', resourceImage: 'image', link: 'link' }[name]
        || (name === 'copyResource' ? (arg === 'image' ? 'copyImage' : 'copyAudio') : name);
      await step(stepName, msg);
    } finally { endBusy(); }
  }

  async function copyDiag() {
    const rows = [];
    const inTree = (el) => /^(digital|resource|side|physical|project|releases|resources)_?[\w]*_img$/.test(el.id || '') || !!el.closest('td.standartTreeRow, td.standartTreeImage');
    for (const el of document.querySelectorAll('input, select, textarea, a[onclick], img[onclick], img[id], a[id], iframe')) {
      if (inTree(el) || !visible(el) || el.type === 'hidden' || el.type === 'password') continue;
      rows.push(JSON.stringify({
        tag: el.tagName.toLowerCase(), id: el.id || undefined,
        cls: (typeof el.className === 'string' ? el.className : '').trim().slice(0, 50) || undefined,
        title: el.getAttribute('title') || undefined, onclick: (el.getAttribute('onclick') || '').slice(0, 90) || undefined,
        src: el.tagName === 'IFRAME' ? el.src.slice(0, 90) : undefined,
        value: el.tagName === 'SELECT' ? (el.options[el.selectedIndex] || {}).text : (el.type === 'checkbox' || el.type === 'radio' ? el.checked : (el.value !== undefined ? String(el.value).slice(0, 40) : undefined))
      }));
      if (rows.length > 260) break;
    }
    const grids = [...document.querySelectorAll('div.objbox')].filter(visible).map((b, i) => {
      const trs = [...b.querySelectorAll('tr')].filter(visible);
      const hrefs = [...new Set([...b.querySelectorAll('a[href]')].map(a => (a.getAttribute('href') || '').replace(/^javascript:\s*/, '').split('(')[0]))].slice(0, 8).join(',');
      return `grille ${i} : ${trs.length} ligne(s) · ${trs.slice(0, 3).map(t => `[${(t.className || '').trim()}] ${txt(t).slice(0, 70)}`).join(' ¦ ')} · liens : ${hrefs}`;
    });
    const tree = `arbre : ${releaseList().length} release(s), ${resourceList().length} ressource(s), dossiers : ${treeRows().map(txt).filter(t => /^(RELEASES|RESOURCES)/i.test(t)).join(' / ')}`;
    const d = dialog();
    const data = await browser.storage.local.get([JOB, STATE]).catch(() => ({}));
    const job = data[JOB] || {};
    const out = [`AUTO R2 — DIAGNOSTIC (${VERSION})`,
      'Écran reconnu : ' + (screen() || 'aucun') + ' · titre affiché : ' + titleValue(),
      'Message : ' + (ui.status ? ui.status.text : ''),
      'Fiche : ' + JSON.stringify({ title: job.title, artist: job.artist, date: job.date, writers: job.writers, mix: job.mix, duration: job.duration, genre: job.genre }),
      'Étape : ' + JSON.stringify((data[STATE] || {}).run || {}),
      d ? `Fenêtre R2 ouverte : « ${d.text} » [${d.onclick.slice(0, 100)}]` : 'Fenêtre R2 ouverte : aucune',
      tree, ...grids,
      '--- journal', ...LOGS.slice(-160),
      '--- dernière liste ouverte', ...lastAdded.slice(0, 12),
      '--- éléments visibles', ...rows].join('\n');
    try {
      await navigator.clipboard.writeText(out);
      ui.status = { kind: ui.busy ? 'run' : 'ok', text: 'Diagnostic copié : colle-le à Claude.' };
    } catch (e) {
      window.__r2autoDiag = out;
      ui.status = { kind: 'err', text: 'Copie impossible : ' + e.message };
    }
    render();
  }

  // Commandes envoyées par le panneau (« Lancer dans R2 »)
  browser.storage.onChanged.addListener((ch) => {
    if (ch[JOB] && ch[JOB].newValue) { ui.jobTitle = ch[JOB].newValue.title || ''; if (!ui.busy) render(); }
    if (ch[STATE] && ch[STATE].newValue && !ui.busy) { ui.run = ch[STATE].newValue.run || null; render(); }
    if (ch[CMD] && ch[CMD].newValue && document.visibilityState === 'visible') {
      const c = ch[CMD].newValue;
      if (Date.now() - (c.t || 0) < 5000 && /^(run|resume|stop)$/.test(c.name)) onAction(c.name);
    }
  });

  // Suivre l'écran affiché
  let timer = null;
  const mo = new MutationObserver(() => {
    if (ui.busy) return;
    clearTimeout(timer);
    timer = setTimeout(() => {
      const s = screen();
      if (s !== ui.screen) { ui.screen = s; render(); }
    }, 400);
  });
  mo.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['style', 'class'] });
  ui.screen = screen();
  render();
  browser.storage.local.get([JOB, STATE]).then(d => {
    ui.jobTitle = (d[JOB] || {}).title || '';
    ui.run = (d[STATE] || {}).run || null;
    render();
  }).catch(() => {});

  window.__r2autoTest = { screen, ACTIONS, setCombo, setSelect, durationDigits, runAll, readTracks, findResourceNode, scanArtistReleases, resourceList, dialog, LOGS };
})();
