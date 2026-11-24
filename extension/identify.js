// Auto R2 — dans la fenêtre Identify (identify.umgapps.com, ouverte par R2 dans un cadre).
// 1) Main levée : si R2 attend une personne du carnet, on clique « Select » sur SA fiche (Party ID), pas sur un homonyme.
// 2) Apprentissage : quand tu choisis toi-même quelqu'un (Select), on note son Party ID pour le carnet.
(function () {
  if (window.__r2autoIdentify) return;
  window.__r2autoIdentify = true;
  const api = typeof browser !== 'undefined' ? browser : chrome;
  const WANT = 'r2auto-idwant', RES = 'r2auto-idres', PICK = 'r2auto-idpicked';
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const vis = (el) => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const selects = () => [...document.querySelectorAll('button, a')].filter(b => vis(b) && b.textContent.trim() === 'Select');
  const query = () => new URLSearchParams(location.search).get('query') || '';
  const pageParty = () => (location.pathname.match(/\/party\/(\d+)/) || [])[1] || '';

  // la « ligne » d'un bouton Select : le plus grand bloc qui ne contient que ce bouton-là
  function rowOf(btn) {
    let r = btn;
    while (r.parentElement && r.parentElement !== document.body && r.parentElement.querySelectorAll('button, a').length && [...r.parentElement.querySelectorAll('button, a')].filter(b => b.textContent.trim() === 'Select').length === 1) r = r.parentElement;
    return r;
  }
  function partyOfRow(row) {
    for (const a of row.querySelectorAll('a[href]')) { const m = (a.getAttribute('href') || '').match(/\/party\/(\d+)/); if (m) return m[1]; }
    const m = (row.innerText || '').match(/Party\s*(?:ID|Id)\s*:?\s*(\d{5,})/);
    return m ? m[1] : '';
  }
  function nameOfRow(row) { const a = row.querySelector('a'); return a ? a.textContent.trim() : ''; }
  function click(el) {
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) el.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window }));
    el.click();
  }
  function typeSearch(v) {
    const inp = [...document.querySelectorAll('input')].find(i => vis(i) && /search for parties/i.test(i.placeholder || ''));
    if (!inp) return false;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
    set.call(inp, v);
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
    for (const t of ['keydown', 'keypress', 'keyup']) inp.dispatchEvent(new KeyboardEvent(t, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
    const form = inp.closest('form');
    if (form) { try { form.requestSubmit ? form.requestSubmit() : form.submit(); } catch (e) { /* rien */ } }
    const btn = inp.parentElement && [...inp.parentElement.querySelectorAll('button')].find(vis);
    if (btn) click(btn);
    return true;
  }
  async function report(want, ok, msg) { await api.storage.local.set({ [RES]: { id: want.id, ok, msg, partyId: want.partyId, ts: Date.now() } }); }

  // ---- apprentissage : le Select que TU cliques ----
  let auto = false;
  document.addEventListener('click', (e) => {
    if (auto) return;
    const b = e.target.closest && e.target.closest('button, a');
    if (!b || b.textContent.trim() !== 'Select') return;
    const pid = pageParty() || partyOfRow(rowOf(b));
    if (!pid) return;
    const label = pageParty() ? ((document.querySelector('h1,h2,h3,h4') || {}).textContent || '').trim() : nameOfRow(rowOf(b));
    api.storage.local.set({ [PICK]: { query: query(), partyId: pid, label, ts: Date.now() } });
  }, true);

  // ---- main levée ----
  let busy = false;
  async function tick() {
    if (busy) return;
    const d = await api.storage.local.get([WANT, RES]);
    const want = d[WANT];
    if (!want || !want.partyId || Date.now() - (want.ts || 0) > 3 * 60 * 1000) return;
    if (d[RES] && d[RES].id === want.id) return; // déjà traité
    busy = true;
    try {
      const done = sessionStorage.getItem('r2auto-tried-' + want.id) || '';
      // sur la fiche de la personne
      if (pageParty() === want.partyId) {
        const b = await waitSel(6000);
        if (b) { auto = true; await report(want, true, 'fiche ouverte, Select cliqué'); click(b); return; }
      }
      // dans les résultats de recherche
      const b0 = await waitSel(8000);
      if (b0 || /search/.test(location.pathname)) {
        await sleep(600);
        const hit = selects().find(b => partyOfRow(rowOf(b)) === want.partyId);
        if (hit) { auto = true; await report(want, true, 'trouvé dans les résultats'); click(hit); return; }
        if (!done.includes('search')) {
          sessionStorage.setItem('r2auto-tried-' + want.id, done + 'search');
          if (typeSearch(want.partyId)) { await sleep(2500); const h2 = selects().find(b => partyOfRow(rowOf(b)) === want.partyId) || (selects().length === 1 ? selects()[0] : null); if (h2) { auto = true; await report(want, true, 'trouvé par le Party ID'); click(h2); return; } }
        }
        if (!done.includes('open')) {
          // dernier essai : ouvrir directement la fiche, en gardant les paramètres de la fenêtre R2
          sessionStorage.setItem('r2auto-tried-' + want.id, done + 'search,open');
          const q = new URLSearchParams(location.search); q.delete('query');
          location.assign(location.origin + '/party-workspace/party/' + want.partyId + '?' + q.toString());
          return;
        }
        await report(want, false, `Party ID ${want.partyId} introuvable dans Identify`);
      }
    } finally { busy = false; }
  }
  async function waitSel(ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { const s = selects(); if (s.length) return pageParty() ? s[0] : s[0]; await sleep(250); } return null; }
  setInterval(() => { tick().catch(() => { busy = false; }); }, 700);
})();
