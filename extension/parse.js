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
    const flagged = /a confirmer|tbc|to be confirmed|\?\s*$/.test(norm(v));
    const value = v.replace(/\(?\s*(à|a)\s+confirmer\s*\)?/ig, '').replace(/\(?\s*tbc\s*\)?/ig, '').replace(/\s+/g, ' ').trim();
    return { value, flagged };
  }

  const KEYS = [
    ['title', /^(titre|title|nom du titre|single)$/],
    ['artist', /^(artiste principal|artiste|main artist|artist|artiste\(s\))$/],
    ['feats', /^(featuring|feat|feats|ft|artiste invite|artistes invites|invite\(s\)|featured artist)s?$/],
    ['date', /^(date de sortie|sortie|release date|date)$/],
    ['writers', /^(auteurs?|auteurs? compositeurs?|auteur-compositeur|compositeurs?|paroles et musique|paroliers?|writers?|songwriters?|ecriture)$/],
    ['mix', /^(mix ?(&|et|and)? ?master(ing)?|mix|mixage|mastering|master|ingenieur du son|mix\/master)$/],
    ['isrc', /^(isrc)$/],
    ['upc', /^(upc|ean|code barre)$/],
    ['territory', /^(territoires?|territory|zone)$/],
    ['label', /^(label)$/],
    ['genre', /^(genre|genre musical|style)$/]
  ];

  function parseMail(text) {
    const out = { title: '', artist: '', feats: [], date: '', writers: [], mix: [], isrcAuto: true, upc: '', territory: '', label: '', genre: '', toConfirm: [] };
    const lines = (text || '').split(/\r?\n/);
    for (const raw of lines) {
      const m = raw.match(/^\s*[-•*]?\s*([^:：]{2,40}?)\s*[:：]\s*(.+)$/);
      if (!m) continue;
      const key = norm(m[1]).replace(/\s+/g, ' ');
      const hit = KEYS.find(([, re]) => re.test(key));
      if (!hit) continue;
      const field = hit[0];
      const { value, flagged } = clean(m[2]);
      if (flagged) out.toConfirm.push(field);
      if (field === 'feats' || field === 'writers' || field === 'mix') {
        out[field] = out[field].concat(splitNames(value));
      } else if (field === 'date') {
        out.date = out.date || parseDate(value);
      } else if (field === 'isrc') {
        out.isrcAuto = /generer|generate|auto|a creer|nouveau/.test(norm(value)) || !/[A-Z]{2}[A-Z0-9]{3}\d{7}/i.test(value);
      } else if (!out[field]) {
        out[field] = value;
      }
    }
    // Objet du mail : « MISE EN DISTRIBUTION – ARTISTE – TITRE – SORTIE LE 11/11/2026 »
    const subj = (text || '').match(/mise en (?:distribution|ligne)\s*[–-]\s*([^–\n-]+?)\s*[–-]\s*([^–\n]+?)\s*[–-]\s*sortie le\s*([0-9\/.\-]+)/i);
    if (subj) {
      if (!out.artist) out.artist = subj[1].trim();
      if (!out.title) out.title = subj[2].trim();
      if (!out.date) out.date = parseDate(subj[3]);
    }
    // « feat. X » collé au nom de l'artiste
    const f = out.artist.match(/^(.+?)\s+(?:feat\.?|ft\.?|featuring|x)\s+(.+)$/i);
    if (f) { out.artist = f[1].trim(); out.feats = out.feats.concat(splitNames(f[2])); }
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
