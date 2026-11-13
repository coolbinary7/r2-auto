// Lecture du mail de mise en ligne (format libre « Clé : valeur »).
// Utilisé par le panneau ; exporté aussi pour les tests.
(function (root) {
  const MOIS = { janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7, aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
    january: 1, february: 2, march: 3, april: 4, may: 5, june: 6, july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
    jan: 1, fev: 2, feb: 2, mar: 3, avr: 4, apr: 4, jun: 6, jui: 7, jul: 7, aou: 8, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

  const norm = (t) => (t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const pad = (n) => String(n).padStart(2, '0');

  function parseDate(t) {
    t = norm(t);
    let m = t.match(/(\d{1,2})\s*(?:er)?\s+([a-z]+)\.?\s+(\d{4})/);
    if (m && MOIS[m[2]] ) return `${m[3]}-${pad(MOIS[m[2]])}-${pad(m[1])}`;
    if (m && MOIS[m[2].slice(0, 3)]) return `${m[3]}-${pad(MOIS[m[2].slice(0, 3)])}-${pad(m[1])}`;
    m = t.match(/(\d{1,2})\s*(?:er)?\s+([a-z]+)\.?(?!\s*\d)/);
    const mo = m && (MOIS[m[2]] || MOIS[m[2].slice(0, 3)]);
    if (mo) { const now = new Date(); let y = now.getFullYear(); if (new Date(y, mo - 1, +m[1]) < new Date(now.getFullYear(), now.getMonth(), now.getDate() - 30)) y++; return `${y}-${pad(mo)}-${pad(m[1])}`; }
    m = t.match(/(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})/);
    if (m) return `${m[3].length === 2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`;
    m = t.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (m) return `${m[1]}-${pad(m[2])}-${pad(m[3])}`;
    return '';
  }

  const splitNames = (t) => (t || '')
    .split(/\s*(?:,|;|\/|&|\bet\b|\band\b|\+)\s*/i)
    .map(s => s.trim()).filter(Boolean);

  // Retire « (à confirmer) », « à confirmer », « TBC »…
  function clean(v) {
    const flagged = /a confirmer|a preciser|a definir|a venir|tbc|tbd|to be confirmed|\?\s*$/.test(norm(v));
    const value = v.replace(/\(?\s*(à|a)\s+(confirmer|préciser|preciser|définir|definir|venir)\s*\)?/ig, '').replace(/\(?\s*(tbc|tbd|n\/a)\s*\)?/ig, '').replace(/\s+/g, ' ').trim();
    return { value, flagged };
  }

  // HTML encodé par Outlook (« &#x3a; » = « : »)
  const decode = (t) => (t || '').replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
    .replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&quot;/g, '"').replace(/&apos;|&#39;/g, "'");

  const KEYS = [
    ['title', /^(titre|title|nom du titre|single|titre du son)$/],
    ['artists', /^(artistes|artists|interpretes)$/],
    ['artist', /^(artiste principal|artiste|main artist|artist|artiste\(s\))$/],
    ['mode', /^(type de sortie|type|format|type de release)$/],
    ['version', /^(version|version title|titre de version)$/],
    ['snippets', /^(durees?( des (snippets?|extraits?))?|snippets?|extraits?|durees? snippets?)$/],
    ['producers', /^(producteurs?|prod|producers?|beatmakers?|realisateurs?|arrangeurs?)$/],
    ['feats', /^(featuring|feat|feats|ft|artiste invite|artistes invites|invite\(s\)|featured artist)s?$/],
    ['date', /^(date de sortie|sortie|release date|date)$/],
    ['writers', /^(auteurs?|auteurs? compositeurs?|auteurs?\s*[\/&-]\s*compositeurs?|auteur-compositeur|compositeurs?|paroles et musique|paroles|paroliers?|writers?|songwriters?|composers?|ecriture|composition et paroles)$/],
    ['mix', /^(mix ?(&|et|and|\/)? ?master(ing)?|mix|mixage|mastering|master|ingenieur du son|mix\/master)$/],
    ['isrc', /^(isrc)$/],
    ['upc', /^(upc|ean|code barre)$/],
    ['territory', /^(territoires?|territory|zone)$/],
    ['assets', /^(assets|lien des assets|liens?|wav|fichiers)$/],
    ['label', /^(label)$/],
    ['genre', /^(genre|genre musical|style)$/]
  ];

  const keyOf = (t) => { const k = norm(t).replace(/\s+/g, ' ').replace(/[\s:：]+$/, ''); const hit = KEYS.find(([, re]) => re.test(k)); return hit ? hit[0] : null; };
  const LIST = new Set(['feats', 'writers', 'mix', 'producers', 'artists']);

  function put(out, field, rawValue) {
    const { value, flagged } = clean(rawValue);
    if (!value) return;
    if (flagged) out.toConfirm.push(field);
    if (LIST.has(field)) {
      // « 1er prod Shado », « 2e prod Nokuji » → Shado, Nokuji
      const v = value.replace(/^\s*\d+\s*(?:er|ere|re|e|eme|ème|nd|nde)?\s*(?:prod(?:ucteur|uction)?|beat(?:maker)?)?\s*[:\-–]?\s*/i, '');
      out[field] = out[field].concat(splitNames(v));
    } else if (field === 'snippets') {
      out.snippets = out.snippets.concat((value.match(/\d{1,2}:\d{2}/g) || []));
    } else if (field === 'date') {
      out.date = out.date || parseDate(value);
    } else if (field === 'isrc') {
      out.isrcAuto = /generer|generate|auto|a creer|nouveau/.test(norm(value)) || !/[A-Z]{2}[A-Z0-9]{3}\d{7}/i.test(value);
      const m = value.match(/[A-Z]{2}-?[A-Z0-9]{3}-?\d{2}-?\d{5}/i); if (m && !out.isrcAuto) out.isrc = m[0].replace(/-/g, '').toUpperCase();
    } else if (field === 'mode') {
      const v = norm(value);
      out.mode = /snippet|extrait/.test(v) ? 'snippet' : /album|ep\b|deluxe/.test(v) ? 'album' : 'single';
      out.type = value;
    } else if (!out[field]) {
      out[field] = value;
    }
  }

  // Une ligne collée depuis le tableau modèle (en-têtes + valeurs séparés par des tabulations)
  function parseTable(text, out) {
    const rows = text.split(/\r?\n/).filter(l => l.includes('\t')).map(l => l.split('\t'));
    const hi = rows.findIndex(r => r.filter(c => keyOf(c)).length >= 3);
    if (hi < 0 || !rows[hi + 1]) return false;
    const head = rows[hi].map(keyOf);
    const row = rows[hi + 1];
    head.forEach((f, i) => { if (f && row[i] && String(row[i]).trim()) put(out, f, String(row[i])); });
    return true;
  }

  function parseMail(text) {
    const out = { snippets: [], title: '', artist: '', feats: [], artists: [], date: '', writers: [], mix: [], producers: [], isrcAuto: true, isrc: '', upc: '', territory: '', label: '', genre: '', version: '', mode: '', type: '', assets: '', toConfirm: [], notes: [] };
    // mise en forme ajoutée par Copilot / ChatGPT / Outlook : **gras**, __gras__, # titres, `code`
    text = decode(text).replace(/\*\*|__|`/g, '').replace(/^\s*#{1,6}\s*/gm, '').replace(/\u00a0/g, ' ');
    if (!parseTable(text, out)) {
      const lines = text.split(/\r?\n/);
      let block = null;   // titre seul sur sa ligne (« Artistes », « Beatmaker »…) : les lignes suivantes sont ses valeurs
      for (const raw of lines) {
        const line = raw.replace(/^\s*[-•*▪◦]\s*/, '').trim();
        if (!line) { block = null; continue; }
        const m = line.match(/^([^:：]{2,40}?)\s*[:：]\s*(.*)$/);
        const f = m ? keyOf(m[1]) : null;
        if (f) { if (m[2].trim()) { put(out, f, m[2]); block = LIST.has(f) ? f : null; } else block = f; continue; }
        const alone = keyOf(line);
        if (alone) { block = alone; continue; }
        // « Mix master Shado » sans deux-points
        const mm = line.match(/^(mix\s*(?:&|et|\/)?\s*master(?:ing)?|mixage|mastering|mix)\s+(.+)$/i);
        if (mm) { put(out, 'mix', mm[2].replace(/^[\s:：-]+/, '')); continue; }
        const pm = line.match(/^(?:\d+\s*(?:er|e|eme|ème)?\s*)?(?:prod(?:ucteur|uction)?|beatmaker)\s+(.+)$/i);
        if (pm) { put(out, 'producers', pm[1]); continue; }
        if (block) put(out, block, line);
      }
    }
    // Objet du mail : « MISE EN DISTRIBUTION – ARTISTE – TITRE – SORTIE LE 11/11/2026 »
    const subj = text.match(/mise en (?:distribution|ligne)\s*[–-]\s*([^–\n-]+?)\s*[–-]\s*([^–\n]+?)\s*[–-]\s*sortie le\s*([0-9\/.\-]+)/i);
    if (subj) {
      if (!out.artist) out.artist = subj[1].trim();
      if (!out.title) out.title = subj[2].trim();
      if (!out.date) out.date = parseDate(subj[3]);
    }
    // Nom de dossier / objet : « 20261212-SINDIKA - ZRAI - TRK - DIDI B - TEAM PAIYA : SKELELU »
    const folder = text.match(/(\d{4})(\d{2})(\d{2})\s*-\s*([^:\n]+?)\s*:\s*([^\n]+)/);
    let order = [];
    if (folder) {
      if (!out.date) out.date = `${folder[1]}-${folder[2]}-${folder[3]}`;
      order = folder[4].split(/\s+-\s+/).map(s => s.trim()).filter(Boolean);
      if (!out.title) out.title = folder[5].replace(/\s*[-–]\s*(?:sortie|release).*$/i, '').trim();
    }
    // Liste « Artistes » sans artiste principal : l'ordre du nom de dossier fait foi, sinon le premier de la liste
    if (!out.artist && (out.artists.length || order.length)) {
      const list = out.artists.length ? out.artists : order;
      const key = (s) => norm(s).replace(/[^a-z0-9]/g, '');
      let main = list[0];
      if (order.length) { const o = list.find(a => key(a) === key(order[0])); main = o || order[0]; }
      else out.toConfirm.push('artist');
      out.artist = main;
      out.feats = out.feats.concat(list.filter(a => key(a) !== key(main)));
      out.notes.push(`artiste principal pris ${order.length ? 'dans le nom du dossier' : 'en premier de la liste'} : ${main}`);
    }
    // « feat. X » collé au nom de l'artiste
    const f = out.artist.match(/^(.+?)\s+(?:feat\.?|ft\.?|featuring|x)\s+(.+)$/i);
    if (f) { out.artist = f[1].trim(); out.feats = out.feats.concat(splitNames(f[2])); }
    const uniq = (a) => { const seen = new Set(); return a.filter(x => { const k = norm(x); if (seen.has(k)) return false; seen.add(k); return true; }); };
    out.feats = uniq(out.feats); out.writers = uniq(out.writers); out.mix = uniq(out.mix); out.producers = uniq(out.producers);
    if (!out.writers.length) out.toConfirm.push('writers');
    // « Artiste principal : DIBY PROD » alors que c'est le label
    const k2 = (x) => norm(x).replace(/[^a-z0-9]/g, '').replace(/prod(uction)?s?$/, '');
    if (out.artist && out.label && k2(out.artist) === k2(out.label)) { out.toConfirm.push('artist'); out.notes.push(`l’artiste principal « ${out.artist} » est le nom du label : mets le vrai artiste`); }
    out.toConfirm = [...new Set(out.toConfirm)];
    return out;
  }

  // Durée d'un WAV en secondes, lue dans l'en-tête (le fichier n'est jamais envoyé)
  async function wavDuration(file) {
    const read = async (start, len) => new DataView(await file.slice(start, start + len).arrayBuffer());
    const head = await read(0, 12);
    const tag = (dv, o) => String.fromCharCode(dv.getUint8(o), dv.getUint8(o + 1), dv.getUint8(o + 2), dv.getUint8(o + 3));
    if (tag(head, 0) !== 'RIFF' || tag(head, 8) !== 'WAVE') throw new Error('pas un WAV');
    let pos = 12, byteRate = 0, dataSize = 0;
    while (pos + 8 <= file.size && !(byteRate && dataSize)) {
      const ch = await read(pos, 8);
      const id = tag(ch, 0), size = ch.getUint32(4, true);
      if (id === 'fmt ') byteRate = (await read(pos + 8, 16)).getUint32(8, true);
      if (id === 'data') dataSize = size === 0xFFFFFFFF ? file.size - pos - 8 : size;
      pos += 8 + size + (size % 2);
    }
    if (!byteRate || !dataSize) throw new Error('en-tête WAV incomplet');
    return dataSize / byteRate;
  }

  const fmtDuration = (sec) => {
    const s = Math.round(sec), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
    return h ? `${h}:${pad(m)}:${pad(r)}` : `${m}:${pad(r)}`;
  };

  const api = { parseMail, parseDate, wavDuration, fmtDuration, splitNames };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.R2Parse = api;
})(typeof window !== 'undefined' ? window : globalThis);
