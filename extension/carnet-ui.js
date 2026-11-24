// Panneau « Mon carnet » : liste éditable, réglages, export / import
(function () {
  const $ = (s) => document.querySelector(s);
  let C = null;
  const esc = (t) => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const msg = (t, ok = true) => { const m = $('#cMsg'); m.style.color = ok ? '' : 'var(--red)'; m.textContent = t; };
  let saveT = null;
  const persist = () => { clearTimeout(saveT); saveT = setTimeout(async () => { C = await R2Carnet.save(C); }, 300); };

  function draw() {
    const q = R2Carnet.norm($('#cSearch').value);
    const list = $('#cList');
    list.innerHTML = '';
    const people = C.people.map((p, i) => [p, i]).filter(([p]) => !q || R2Carnet.norm([p.name, ...p.aliases, p.partyId, p.project].join(' ')).includes(q))
      .sort((a, b) => a[0].name.localeCompare(b[0].name, 'fr', { sensitivity: 'base' }));
    if (!people.length) list.innerHTML = `<p class="hint">${C.people.length ? 'Personne ne correspond.' : 'Carnet vide : ajoute tes artistes, ou laisse « Apprendre » le remplir au fil de tes choix dans Identify.'}</p>`;
    for (const [p, i] of people) {
      const d = document.createElement('div');
      d.className = 'cp' + (p.partyId ? '' : ' missing');
      d.innerHTML = `<div class="top"><input data-k="name" value="${esc(p.name)}" placeholder="Nom (comme dans R2)">${p.learned ? '<span class="tag" title="Ajouté automatiquement : vérifie-le">appris</span>' : ''}<button class="del" title="Retirer du carnet">✕</button></div>
        <div class="grid"><label>Party ID<input class="pid" data-k="partyId" inputmode="numeric" value="${esc(p.partyId)}" placeholder="ex. 102191636"></label><label>Alias <small>(virgules)</small><input data-k="aliases" value="${esc(p.aliases.join(', '))}" placeholder="ex. Natou"></label>
        <label>Projet R2<input data-k="project" value="${esc(p.project)}" placeholder="ex. 99PJ-40352"></label><label>Genre<input data-k="genre" value="${esc(p.genre)}" placeholder="par défaut"></label></div>`;
      d.querySelectorAll('input[data-k]').forEach(inp => inp.addEventListener('input', () => {
        const k = inp.dataset.k;
        p[k] = k === 'aliases' ? inp.value.split(/[,;]/).map(x => x.trim()).filter(Boolean) : k === 'partyId' ? inp.value.replace(/\D/g, '') : inp.value;
        p.learned = false;
        d.classList.toggle('missing', !p.partyId);
        persist();
      }));
      d.querySelector('.del').addEventListener('click', () => {
        if (d.dataset.armed !== '1') { d.dataset.armed = '1'; d.querySelector('.del').textContent = 'Sûr ?'; setTimeout(() => { d.dataset.armed = ''; const b = d.querySelector('.del'); if (b) b.textContent = '✕'; }, 3000); return; }
        C.people.splice(i, 1); persist(); draw();
      });
      list.appendChild(d);
    }
  }

  async function init() {
    C = await R2Carnet.load();
    $('#cMain').checked = C.defaults.mainLevee !== false;
    $('#cLearn').checked = C.defaults.learn !== false;
    $('#cGenre').value = C.defaults.genre || '';
    draw();
  }
  $('#cMain').addEventListener('change', () => { C.defaults.mainLevee = $('#cMain').checked; persist(); });
  $('#cLearn').addEventListener('change', () => { C.defaults.learn = $('#cLearn').checked; persist(); });
  $('#cGenre').addEventListener('input', () => { C.defaults.genre = $('#cGenre').value.trim(); persist(); });
  $('#cSearch').addEventListener('input', draw);
  $('#cAdd').addEventListener('click', () => { $('#cSearch').value = ''; C.people.push({ name: 'Nouvel artiste', partyId: '', aliases: [], project: '', genre: '', note: '', learned: false }); persist(); draw(); const ins = [...document.querySelectorAll('#cList .cp input[data-k=name]')].find(i => i.value === 'Nouvel artiste'); if (ins) { ins.focus(); ins.select(); } });
  $('#cExport').addEventListener('click', async () => {
    C = await R2Carnet.save(C);
    const blob = new Blob([R2Carnet.exported(C)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `auto-r2-carnet-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    msg(`Carnet exporté (${C.people.length} personne(s)) : le fichier est dans tes Téléchargements.`);
  });
  $('#cImport').addEventListener('change', async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (!data || !Array.isArray(data.people)) throw new Error('ce fichier n’est pas un carnet Auto R2');
      const r = R2Carnet.merge(await R2Carnet.load(), data);
      C = await R2Carnet.save(r.carnet);
      await init();
      msg(`Import OK : ${r.added} ajoutée(s), ${r.updated} mise(s) à jour.`);
    } catch (err) { msg('Import impossible : ' + (err.message || err), false); }
  });
  // le carnet peut changer pendant un lancement (apprentissage) : on se resynchronise
  browser.storage.onChanged.addListener((ch) => { if (ch[R2Carnet.KEY] && document.activeElement && !document.activeElement.closest('#carnetCard')) init(); });
  // exposé au reste du panneau (genre / alias à l'analyse du mail)
  window.carnetNow = () => C;
  init();
})();
