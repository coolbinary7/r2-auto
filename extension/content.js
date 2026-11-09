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

    async resourceImage({ set }, arg) {
      const size = set.coverSize || '3000';
      if ($id('measurement2')) setSelect($id('measurement2'), 'pixels');
      if ($id('measurement')) setSelect($id('measurement'), 'pixels');
      if ($id('resolution')) setSelect($id('resolution'), set.coverDpi || '300 dpi');
      if ($id('color_mode')) setSelect($id('color_mode'), set.coverColor || 'RGB');
      if ($id('height')) setText($id('height'), size);
      if ($id('width')) setText($id('width'), size);
      if ($id('format')) await setCombo('format', (!set.v && set.coverFormat === 'JPEG') ? 'TIFF' : (set.coverFormat || 'TIFF'));
      let cleaned = false;
      if (arg === 'cleanup') cleaned = await removeSecondaryContributors();
      await step('image', 'ok');
      if (set.autoSave !== false) {
        click(vis('img#img_saveActionIcon'));
        await waitIdle();
        return cleaned ? 'Cover enregistrée (contributeurs secondaires retirés).' : 'Cover enregistrée. Retire les contributeurs secondaires copiés s’il y en a. Le Submit Release reste à toi.';
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


  // ---------- Arbre (Explorer), grilles et menu clic droit ----------
  const rowsOf = (objbox) => objbox ? [...objbox.querySelectorAll('tr')].filter(tr => /row_(odd|even)/.test(tr.className) && visible(tr)) : [];

  // Grille qui suit un bouton (ex. corbeille des pistes → grille des pistes)
  function gridAfter(el) {
    if (!el) return null;
    const boxes = [...document.querySelectorAll('div.objbox')].filter(visible);
    return boxes.find(b => el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) || null;
  }

  function treeRows() {
    return [...document.querySelectorAll('td.standartTreeRow')];
  }

  async function expandFolder(re) {
    const folder = treeRows().find(td => re.test(txt(td)) && visible(td));
    if (!folder) return false;
    const row = folder.closest('tr');
    const plus = row && [...row.querySelectorAll('td.standartTreeImage img')].find(i => /plus/i.test(i.getAttribute('src') || ''));
    if (plus) { click(plus); await sleep(1500); }
    return true;
  }

  // Ligne de l'arbre qui commence par « Titre | » (pistes) en évitant les covers
  async function findResourceNode(title, { notCover = true } = {}) {
    const w = norm(title) + ' |';
    const match = () => treeRows().filter(td => {
      const t = norm(txt(td));
      return t.startsWith(w) && (!notCover || !/\[cover art\]/i.test(t));
    });
    let hits = match();
    if (!hits.length) { await expandFolder(/^RESOURCES\s*\(\d+\)/i); hits = match(); }
    return hits.length ? hits[hits.length - 1] : null;
  }

  function findReleaseNode(title) {
    const w = norm(title) + ' |';
    return treeRows().find(td => {
      const inner = td.querySelector('[id^="digital_"]');
      return inner && norm(txt(td)).replace(/^[a-z] /, '').startsWith(w);
    }) || null;
  }

  // Dernière release de l'artiste dans l'arbre : « Titre | UPC | Artiste(s) | Config »
  function scanArtistReleases(artist, excludeTitle) {
    const a = norm(artist);
    const out = [];
    for (const el of document.querySelectorAll('[id^="digital_"][id$="_text"]')) {
      const parts = txt(el).split('|').map(x => x.trim());
      if (parts.length < 3) continue;
      const title = parts[0], artists = parts[2];
      const names = artists.split(/\s*(?:,|&|\/|\bfeat\.?|\bft\.?|\sx\s)\s*/i).map(norm).filter(Boolean);
      const main = names[0] === a, any = names.includes(a);
      if (!any) continue;
      if (/\[copy\]/i.test(title) || (excludeTitle && norm(title) === norm(excludeTitle))) continue;
      const id = +((el.id.match(/digital_(\d+)/) || [])[1] || 0);
      out.push({ el, td: el.closest('td') || el, title, artists, upc: parts[1], id, main });
    }
    // les sorties où l'artiste est l'artiste principal d'abord, puis la plus récente
    return out.sort((x, y) => (y.main - x.main) || (y.id - x.id));
  }

  async function findLatestArtistRelease(artist, excludeTitle) {
    let list = scanArtistReleases(artist, excludeTitle);
    if (!list.length) { await expandFolder(/^RELEASES\s*\(\d+\)/i); list = scanArtistReleases(artist, excludeTitle); }
    return list[0] || null;
  }

  async function contextCopy(node) {
    const target = node.querySelector('div,span') || node;
    target.scrollIntoView({ block: 'center' });
    const r = target.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + 10, clientY: r.top + r.height / 2, button: 2, buttons: 2 };
    click(target); await sleep(400);
    target.dispatchEvent(new MouseEvent('mousedown', o));
    target.dispatchEvent(new MouseEvent('mouseup', o));
    target.dispatchEvent(new MouseEvent('contextmenu', o));
    const item = await waitFor(() => vis('td#menuItem_copyResource') ||
      [...document.querySelectorAll('table.menuTable td.defaultMenuText')].find(td => visible(td) && /^copy$/i.test(txt(td))), 5000);
    if (!item) return false;
    click(item.querySelector('img') || item);
    return true;
  }

  const waitScreen = (name, timeout = 30000) => waitFor(() => !ui.busyModal && screen() === name, timeout, 400);

  // Lit les titres des pistes de la release ouverte (onglet Tracks)
  function readTracks() {
    const grid = gridAfter($id('img_delete_tracks'));
    return rowsOf(grid).map(tr => {
      const tds = [...tr.querySelectorAll('td')];
      return { row: tr, title: txt(tds[2]) || txt(tds.find(td => txt(td) && !/^\d+$/.test(txt(td)))) };
    }).filter(t => t.title);
  }

  async function deleteOldTracks() {
    let removed = 0;
    for (let i = 0; i < 12; i++) {
      const tracks = readTracks();
      if (!tracks.length) break;
      const cell = tracks[0].row.querySelectorAll('td')[2] || tracks[0].row.querySelector('td');
      click(cell); await sleep(400);
      click($id('img_delete_tracks'));
      const ok = await confirmIf(/remove (this|these) track/i, 5000);
      if (!ok) break;
      await waitIdle();
      removed++;
    }
    return removed;
  }

  async function unlinkOldCover() {
    const tab = $id('tabBar_releases_unsequenced_tab_div_a');
    if (tab) { click(tab); await waitIdle(); await sleep(600); }
    let removed = 0;
    for (let i = 0; i < 4; i++) {
      const row = [...document.querySelectorAll('tr.coverArtRow')].find(visible);
      if (!row) break;
      const trash = [...row.querySelectorAll('img')].find(im => /trash/i.test(im.getAttribute('src') || ''));
      if (!trash) break;
      click(trash);
      const yes = await waitFor(() => vis('a#yesButton'), 5000);
      if (!yes) break;
      click(yes); await waitIdle(); removed++;
    }
    return removed;
  }

  async function removeSecondaryContributors() {
    const tab = $id('tabBar_resources_contributors_tab_div_a');
    if (tab) { click(tab); await waitIdle(); await sleep(500); }
    const del = await waitFor(() => vis('img#img_secondary_contributors_delete'), 6000);
    if (!del) return false;
    for (let i = 0; i < 4; i++) {
      const rows = rowsOf(gridAfter(del));
      if (!rows.length) return true;
      rows.forEach((tr, k) => {
        const cell = tr.querySelectorAll('td')[2] || tr.querySelector('td');
        const r = cell.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, view: window, clientX: r.left + 5, clientY: r.top + 5, ctrlKey: k > 0 };
        cell.dispatchEvent(new MouseEvent('mousedown', o)); cell.dispatchEvent(new MouseEvent('mouseup', o)); cell.dispatchEvent(new MouseEvent('click', o));
      });
      await sleep(300);
      click(del);
      if (!await confirmIf(/remove these contributors/i, 5000)) return false;
      await waitIdle();
    }
    return !rowsOf(gridAfter(vis('img#img_secondary_contributors_delete'))).length;
  }

  // ---------- Tout enchaîner ----------
  async function runAll() {
    const data = await get();
    const job = data.job;
    data.set = { ...data.set, autoSave: true };
    if (!job.title || !job.artist) throw new Error('fiche incomplète : remplis au moins titre et artiste dans le panneau');
    const say = (t) => { ui.status = { kind: 'run', text: t }; render(); };
    const needScreen = async (name, msg) => {
      if (await waitScreen(name, 25000)) return;
      const r = await pause(msg, () => screen() === name);
      if (r === 'stop') throw new Error('arrêté à ta demande');
      if (screen() !== name && !(await waitScreen(name, 8000))) throw new Error('écran attendu non affiché');
    };

    // 1. Copie de la release de référence : la dernière sortie de l'artiste dans le projet ouvert
    if (screen() !== 'copyRelease') {
      say(`1/6 · Recherche de la dernière sortie de ${job.artist}…`);
      let model = await findLatestArtistRelease(job.artist, job.title);
      if (model) {
        say(`1/6 · Modèle trouvé : « ${model.title} » (${model.artists}). Copie…`);
        await sleep(1200);
        await contextCopy(model.td);
        await waitScreen('copyRelease', 8000);
      }
      if (screen() !== 'copyRelease') {
        const r = await pause(model
          ? `Je n’ai pas réussi à copier « ${model.title} ». Fais clic droit dessus → Copy, je prends la suite.`
          : `Pas de sortie de « ${job.artist} » dans le projet ouvert. Ouvre le projet du label de l’artiste : je la repère et je continue (ou fais clic droit → Copy sur une release).`,
          () => {
            if (screen() === 'copyRelease') return true;
            if (!model) { const m = scanArtistReleases(job.artist, job.title)[0]; if (m) { model = m; return true; } }
            return false;
          });
        if (r === 'stop') throw new Error('arrêté à ta demande');
        if (screen() !== 'copyRelease' && model) {
          say(`1/6 · Modèle trouvé : « ${model.title} » (${model.artists}). Copie…`);
          await contextCopy(model.td);
          if (!(await waitScreen('copyRelease', 8000))) throw new Error('la copie de la release ne s’ouvre pas');
        }
      }
    }
    say('1/6 · Copie de la release…');
    await ACTIONS.copyRelease(data);

    // 2. Release : titre, UPC, date + ménage de l'ancienne piste et de l'ancienne cover
    await needScreen('release', 'Ouvre la release copiée (double-clic dans l’arbre). Je continue dès qu’elle s’affiche.');
    await sleep(800);
    const old = readTracks().map(t => t.title);
    say('2/6 · Release : titre, UPC, date…');
    await ACTIONS.release(data);
    await needScreen('release', 'Rouvre la release copiée pour que je retire l’ancienne piste.');
    if (norm($id('title') && $id('title').value) === norm(job.title)) {
      say('2/6 · Retrait de l’ancienne piste et de l’ancienne cover…');
      const nT = await deleteOldTracks();
      const nC = await unlinkOldCover();
      if (nT || nC) {
        click(vis('img#img_saveReleaseButton'));
        await confirmIf(/embargo/i, 5000);
        await waitIdle();
      }
      await step('release', 'ok');
      if (!nT && old.length) await step('release', 'ancienne piste à retirer à la main');
    }

    // 3. Copie de l'ancienne piste
    say('3/6 · Copie de la piste « ' + (old[0] || '?') + ' »…');
    const trackNode = old[0] ? await findResourceNode(old[0]) : null;
    if (!(trackNode && await contextCopy(trackNode))) {
      const r = await pause(`Clic droit sur la piste « ${old[0] || 'de l’ancienne sortie'} » (dossier RESOURCES) → Copy.`, () => screen() === 'copyResource');
      if (r === 'stop') throw new Error('arrêté à ta demande');
    }
    await needScreen('copyResource', 'Ouvre la copie de la piste (clic droit → Copy).');
    await ACTIONS.copyResource(data, 'audio');

    // 4. Piste : ISRC, durée, auteurs, mix/master (pauses Identify)
    await needScreen('resourceAudio', 'Ouvre la nouvelle piste « ' + job.title + ' ».');
    say('4/6 · Piste : ISRC, durée, auteurs…');
    await ACTIONS.resourceAudio(data);

    // 5. Copie pour la cover
    say('5/6 · Copie pour la cover…');
    await sleep(1200);
    const newNode = await findResourceNode(job.title);
    if (!(newNode && await contextCopy(newNode))) {
      const r = await pause(`Clic droit sur la piste « ${job.title} » → Copy, pour créer la cover.`, () => screen() === 'copyResource');
      if (r === 'stop') throw new Error('arrêté à ta demande');
    }
    await needScreen('copyResource', 'Ouvre la copie de la piste pour la cover.');
    await ACTIONS.copyResource(data, 'image');

    // 6. Cover : format + retrait des contributeurs secondaires copiés
    await needScreen('resourceImage', 'Ouvre la ressource cover « ' + job.title + ' ».');
    say('6/6 · Cover : taille, format…');
    const msg = await ACTIONS.resourceImage(data, 'cleanup');

    // Fin : on rouvre la release pour la vérification et le Submit
    const rel = findReleaseNode(job.title);
    if (rel) {
      const t = rel.querySelector('[id^="digital_"]') || rel;
      click(t); await sleep(200);
      t.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, view: window }));
      await confirmIf(/.*/, 2500);
    }
    return 'Terminé ✓ ' + msg.replace(/ Le Submit Release reste à toi\./, '') + ' Vérifie la release « ' + job.title + ' », puis fais toi-même le Submit Release.';
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
    const run = [['run', '▶ Lancer tout']];
    switch (s) {
      case 'copyRelease': return [...run, ['copyRelease', 'Remplir la copie de release']];
      case 'release': return [['release', 'Remplir la release']];
      case 'copyResource': return [['copyResource:audio', 'Piste audio'], ['copyResource:image', 'Cover']];
      case 'resourceAudio': return [['resourceAudio', 'Remplir la piste + auteurs']];
      case 'resourceImage': return [['resourceImage', 'Remplir la cover']];
      default: return run;
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
        <div class="h" data-a="toggle"><span class="t">Auto R2</span><span class="s">${s ? esc(SCREEN_LABELS[s]) : 'écran non reconnu'} ${ui.collapsed ? '▸' : '▾'}</span></div>
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
    if (name === 'run' && !ui.busy) {
      ui.busy = true; stopRequested = false;
      try {
        const msg = await runAll();
        ui.status = { kind: 'ok', text: msg };
      } catch (e) {
        ui.status = { kind: 'err', text: 'Arrêté : ' + (e && e.message) + '. Tu peux finir à la main, ou reprendre écran par écran avec les boutons du bandeau.' };
      } finally {
        ui.busy = false; ui.screen = screen(); render();
      }
      return;
    }
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
    const out = ['AUTO R2 — DIAGNOSTIC', 'Écran reconnu : ' + (ui.screen || 'aucun'), 'Message : ' + (ui.status ? ui.status.text : ''), '---', ...rows].join('\n');
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

  window.__r2autoTest = { screen, ACTIONS, setCombo, setSelect, durationDigits, runAll, readTracks, findResourceNode, scanArtistReleases };
})();
