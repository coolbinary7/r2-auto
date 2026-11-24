// Carnet d'Auto R2 : les artistes et contributeurs avec lesquels on travaille, leur Party ID (Identify),
// leur projet R2 et leurs réglages par défaut. Partagé par le panneau, R2 et la fenêtre Identify.
// Exportable / importable (fichier .json) pour le retrouver sur un autre PC.
(function (root) {
  const KEY = 'r2auto-carnet';
  const api = typeof browser !== 'undefined' ? browser : (typeof chrome !== 'undefined' ? chrome : null);
  const norm = (t) => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
  const EMPTY = () => ({ version: 1, people: [], defaults: { mainLevee: true, genre: '', learn: true } });

  function clean(c) {
    const out = EMPTY();
    if (!c || typeof c !== 'object') return out;
    out.defaults = Object.assign(out.defaults, c.defaults || {});
    out.people = (Array.isArray(c.people) ? c.people : []).map(p => ({
      name: String(p.name || '').trim(),
      partyId: String(p.partyId || '').replace(/\D/g, ''),
      aliases: (Array.isArray(p.aliases) ? p.aliases : String(p.aliases || '').split(/[,;]/)).map(a => String(a).trim()).filter(Boolean),
      project: String(p.project || '').trim(),
      genre: String(p.genre || '').trim(),
      note: String(p.note || '').trim(),
      learned: !!p.learned
    })).filter(p => p.name);
    return out;
  }
  async function load() { const d = await api.storage.local.get(KEY); return clean(d[KEY]); }
  async function save(c) { const v = clean(c); await api.storage.local.set({ [KEY]: v }); return v; }
  function findIn(c, name) {
    const n = norm(name);
    if (!n) return null;
    return c.people.find(p => norm(p.name) === n) || c.people.find(p => p.aliases.some(a => norm(a) === n)) || null;
  }
  async function find(name) { return findIn(await load(), name); }
  // ajoute ou complète (ne remplace jamais un Party ID déjà saisi à la main)
  async function upsert(entry) {
    const c = await load();
    const p = findIn(c, entry.name) || (entry.partyId && c.people.find(x => x.partyId === String(entry.partyId)));
    if (p) {
      for (const k of ['partyId', 'project', 'genre']) if (!p[k] && entry[k]) p[k] = String(entry[k]);
      if (entry.name && norm(entry.name) !== norm(p.name) && !p.aliases.some(a => norm(a) === norm(entry.name))) p.aliases.push(entry.name);
    } else c.people.push(Object.assign({ aliases: [], project: '', genre: '', note: '', learned: false }, entry));
    return save(c);
  }
  // fusion à l'import : les fiches du fichier complètent ou remplacent celles du même nom
  function merge(cur, inc) {
    const a = clean(cur), b = clean(inc);
    let added = 0, updated = 0;
    for (const p of b.people) {
      const q = findIn(a, p.name);
      if (q) { Object.assign(q, p, { aliases: [...new Set([...q.aliases, ...p.aliases])] }); updated++; }
      else { a.people.push(p); added++; }
    }
    a.defaults = Object.assign(a.defaults, b.defaults || {});
    return { carnet: a, added, updated };
  }
  const exported = (c) => JSON.stringify({ app: 'Auto R2', kind: 'carnet', exportedAt: new Date().toISOString(), ...clean(c) }, null, 2);

  root.R2Carnet = { KEY, norm, clean, load, save, find, findIn, upsert, merge, exported };
})(typeof window !== 'undefined' ? window : globalThis);
