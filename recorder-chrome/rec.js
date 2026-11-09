const browser = chrome;
// Note chaque clic, saisie, glisser-déposer et envoi de fichier de l'onglet enregistré, avec une description précise de l'élément.
(() => {
  if (window.__r2rec) return;
  window.__r2rec = true;

  const txt = (el) => (el && (el.innerText || el.textContent) || '').replace(/\s+/g, ' ').trim();
  const short = (t, n = 80) => (t || '').length > n ? t.slice(0, n) + '…' : (t || '');

  // Libellé du champ : aria, <label>, cellule de tableau précédente, texte voisin
  function labelOf(el) {
    if (!el) return '';
    const a = el.getAttribute && (el.getAttribute('aria-label') || el.getAttribute('title') || el.getAttribute('placeholder'));
    if (el.id) {
      const l = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (l) return short(txt(l));
    }
    const wrap = el.closest && el.closest('label');
    if (wrap && txt(wrap)) return short(txt(wrap));
    const td = el.closest && el.closest('td,th');
    if (td) {
      let p = td.previousElementSibling;
      while (p && !txt(p)) p = p.previousElementSibling;
      if (p) return short(txt(p));
    }
    let n = el;
    for (let i = 0; i < 4 && n; i++) {
      let s = n.previousElementSibling;
      while (s) {
        const t = txt(s);
        if (t && t.length < 60) return short(t);
        s = s.previousElementSibling;
      }
      n = n.parentElement;
    }
    return short(a || '');
  }

  function path(el) {
    const parts = [];
    let n = el;
    for (let i = 0; i < 7 && n && n.nodeType === 1 && n !== document.body; i++) {
      let p = n.tagName.toLowerCase();
      if (n.id) { p += '#' + n.id; parts.unshift(p); break; }
      const cls = (typeof n.className === 'string' ? n.className : '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
      if (cls.length) p += '.' + cls.join('.');
      if (n.parentElement) {
        const same = [...n.parentElement.children].filter(c => c.tagName === n.tagName);
        if (same.length > 1) p += `:nth-of-type(${same.indexOf(n) + 1})`;
      }
      parts.unshift(p);
      n = n.parentElement;
    }
    return parts.join(' > ');
  }

  function describe(el) {
    if (!el || el.nodeType !== 1) return null;
    const d = {
      tag: el.tagName.toLowerCase(),
      id: el.id || undefined,
      name: el.getAttribute('name') || undefined,
      type: el.getAttribute('type') || undefined,
      role: el.getAttribute('role') || undefined,
      cls: short(typeof el.className === 'string' ? el.className : '', 120) || undefined,
      text: short(txt(el), 100) || undefined,
      label: labelOf(el) || undefined,
      placeholder: el.getAttribute('placeholder') || undefined,
      title: el.getAttribute('title') || undefined,
      alt: el.getAttribute('alt') || undefined,
      src: el.tagName === 'IMG' ? short(el.getAttribute('src'), 120) : undefined,
      onclick: short(el.getAttribute('onclick'), 160) || undefined,
      href: short(el.getAttribute('href'), 160) || undefined,
      path: path(el)
    };
    if (el.tagName === 'SELECT') {
      d.options = [...el.options].slice(0, 80).map(o => o.textContent.trim());
      d.selected = el.options[el.selectedIndex] ? el.options[el.selectedIndex].textContent.trim() : '';
    } else if ('value' in el && el.type !== 'password') {
      d.value = short(String(el.value), 200);
    }
    if (el.type === 'checkbox' || el.type === 'radio') d.checked = el.checked;
    if (el.type === 'file') { d.accept = el.getAttribute('accept') || undefined; d.multiple = el.multiple || undefined; d.files = filesOf(el.files); d.shown = visible(el); }
    if (el.getAttribute('draggable') === 'true') d.draggable = true;
    return d;
  }

  // fichiers choisis ou déposés : nom, taille, type (jamais le contenu)
  const filesOf = (list) => list && list.length ? [...list].slice(0, 30).map(f => ({ name: f.name, size: f.size, type: f.type })) : undefined;

  // élément « utile » : bouton/lien/champ le plus proche du clic
  function useful(el) {
    return el.closest('button, a, input, select, textarea, label, [role], [onclick], img, td, li') || el;
  }

  let recording = false;
  browser.runtime.sendMessage({ type: 'isRecording' }).then(r => { recording = !!r; if (recording) snap('chargement'); });
  browser.storage.onChanged.addListener((ch) => {
    if (ch.r2recOn && ch.r2recOn.newValue) {
      // on redemande au fond : seul l'onglet choisi est enregistré
      browser.runtime.sendMessage({ type: 'isRecording' }).then(r => { const was = recording; recording = !!r; if (recording && !was) snap('début'); }).catch(() => {});
    }
  });

  function send(kind, el, extra) {
    if (!recording) return;
    browser.runtime.sendMessage({
      type: 'ev',
      ev: { kind, t: Date.now(), frame: location.href, el: describe(el), ...(extra || {}) }
    });
  }

  document.addEventListener('click', (e) => {
    const el = useful(e.target);
    send('clic', el, { clicked: e.target !== el ? describe(e.target) : undefined });
  }, true);
  // glisser-déposer à la souris (appui à un endroit, relâchement ailleurs)
  let down = null;
  document.addEventListener('mousedown', (e) => { down = e.button === 0 ? { el: e.target, x: e.clientX, y: e.clientY } : null; }, true);
  document.addEventListener('mouseup', (e) => {
    const d = down; down = null;
    if (!d || !d.el.isConnected) return;
    if (d.el !== e.target && Math.hypot(e.clientX - d.x, e.clientY - d.y) > 25) send('glisser', useful(d.el), { from: describe(d.el), to: describe(e.target), toUseful: describe(useful(e.target)) });
  }, true);
  // glisser-déposer natif et dépôt de fichiers depuis l'ordinateur
  document.addEventListener('dragstart', (e) => send('début de glisser', useful(e.target)), true);
  document.addEventListener('drop', (e) => send('dépôt', useful(e.target), { target: describe(e.target), files: filesOf(e.dataTransfer && e.dataTransfer.files), types: e.dataTransfer ? [...e.dataTransfer.types] : undefined }), true);
  document.addEventListener('paste', (e) => send('coller', e.target), true);
  document.addEventListener('dblclick', (e) => send('double-clic', useful(e.target)), true);
  document.addEventListener('contextmenu', (e) => send('clic-droit', useful(e.target)), true);
  document.addEventListener('change', (e) => send('changement', e.target), true);
  const timers = new WeakMap();
  document.addEventListener('input', (e) => {
    const el = e.target;
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(() => send('saisie', el), 700));
  }, true);
  document.addEventListener('keydown', (e) => {
    if (['Enter', 'Tab', 'Escape', 'ArrowDown', 'ArrowUp'].includes(e.key)) send('touche ' + e.key, e.target);
  }, true);

  // Capture de tous les champs visibles de la page (structure des formulaires)
  function visible(el) {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden';
  }
  function snap(reason, force) {
    if (!document.body) return;
    const fields = [];
    const sel = 'input, select, textarea, button, a[onclick], a[href], img[onclick], [role=button], [role=combobox], [role=option], [role=tab], [role=menuitem], [role=checkbox], [contenteditable=true], [draggable=true], [class*="dropzone" i], [class*="upload" i], object, embed, applet';
    for (const el of document.querySelectorAll(sel)) {
      if (!visible(el) && el.type !== 'file') continue;
      if (el.type === 'hidden') continue;
      fields.push(describe(el));
      if (fields.length > 600) break;
    }
    const headings = [...document.querySelectorAll('h1,h2,h3,legend,.title,.header,th')].filter(visible).map(txt).filter(Boolean).slice(0, 60);
    browser.runtime.sendMessage({
      type: 'snap', force: !!force,
      snap: { reason, t: Date.now(), frame: location.href, top: window.top === window, title: document.title, headings, fields, frames: [...document.querySelectorAll('iframe,frame')].slice(0, 20).map(f => (f.getAttribute('src') || f.id || f.name || '').slice(0, 160)) }
    });
  }
  browser.runtime.onMessage.addListener((m) => { if (m && m.type === 'doSnap') snap('capture manuelle', true); });

  // capture automatique quand une fenêtre / un formulaire apparaît
  let lastSnap = 0;
  const mo = new MutationObserver(() => {
    if (!recording) return;
    const now = Date.now();
    if (now - lastSnap < 2500) return;
    lastSnap = now;
    setTimeout(() => snap('changement de page'), 1200);
  });
  const startMo = () => document.body && mo.observe(document.body, { childList: true, subtree: true });
  if (document.body) startMo(); else document.addEventListener('DOMContentLoaded', startMo);
})();
