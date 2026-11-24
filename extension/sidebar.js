// Panneau latéral : mail → fiche, WAV → durée, réglages. Tout est gardé dans browser.storage.local.
const $ = (s) => document.querySelector(s);
const JOB = 'r2job', SET = 'r2settings', STATE = 'r2state';

const DEFAULTS = {
  configGroup: 'e-Product',
  configuration: 'eSingle Audio',
  snippetConfiguration: 'eSnippet Audio',
  albumConfiguration: 'eAlbum Audio',
  mixGroup: 'Mastering Engineers',
  mixRole: 'Mastering Engineer',
  coverSize: '3000',
  coverDpi: '300 dpi',
  coverColor: 'RGB',
  coverFormat: 'TIFF',
  autoSave: true,
  artistWriter: true,
  fixYears: true
};

const FIELDS = ['title', 'artist', 'feats', 'date', 'writers', 'producers', 'mix', 'duration', 'genre', 'isrcAuto', 'mode', 'snippets', 'srcIsrc', 'videoVersion', 'videoCategory', 'videoDuration', 'director', 'videoProducer', 'videoIsrc'];
const LABELS = { isrc: 'ISRC (audio)', snippets: 'durées des snippets', title: 'titre', artist: 'artiste', feats: 'featurings', date: 'date', writers: 'auteurs', producers: 'producteurs', mix: 'mix & master', duration: 'durée' };

function readJob() {
  return {
    title: $('#f_title').value.trim(),
    artist: $('#f_artist').value.trim(),
    feats: $('#f_feats').value.split(',').map(s => s.trim()).filter(Boolean),
    date: $('#f_date').value,
    writers: $('#f_writers').value.split('\n').map(s => s.trim()).filter(Boolean),
    producers: $('#f_producers').value.split('\n').map(s => s.trim()).filter(Boolean),
    mix: $('#f_mix').value.split('\n').map(s => s.trim()).filter(Boolean),
    duration: $('#f_duration').value.trim(),
    genre: $('#f_genre').value.trim(),
    mode: $('#f_mode').value,
    snippets: $('#f_snippets').value.split(/[\n,;]+/).map(s => s.trim()).filter(Boolean),
    srcIsrc: $('#f_srcIsrc').value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
    videoVersion: $('#f_videoVersion').value.trim(), videoCategory: $('#f_videoCategory').value, videoDuration: $('#f_videoDuration').value.trim(),
    director: $('#f_videoDirector').value.trim(), videoProducer: $('#f_videoProducer').value.trim(),
    videoIsrc: $('#f_videoIsrc').value.replace(/[^A-Za-z0-9]/g, '').toUpperCase(),
    isrcAuto: $('#f_isrcAuto').checked,
    tracks: $('#f_mode').value === 'album' ? currentTracks : undefined,
    version: $('#f_mode').value === 'album' ? $('#f_albumVersion').value.trim() : undefined,
    toConfirm: currentConfirm,
    extra: currentExtra
  };
}

let currentConfirm = [], currentExtra = {};

function showJob(j) {
  $('#f_title').value = j.title || '';
  $('#f_artist').value = j.artist || '';
  $('#f_feats').value = (j.feats || []).join(', ');
  $('#f_date').value = j.date || '';
  $('#f_writers').value = (j.writers || []).join('\n');
  $('#f_producers').value = (j.producers || []).join('\n');
  $('#f_mix').value = (j.mix || []).join('\n');
  $('#f_duration').value = j.duration || '';
  $('#f_genre').value = j.genre || '';
  $('#f_mode').value = ['snippet', 'video', 'album'].includes(j.mode) ? j.mode : 'single';
  if (Array.isArray(j.tracks)) currentTracks = j.tracks;
  $('#f_albumVersion').value = j.mode === 'album' ? (j.version || '') : '';
  $('#f_videoVersion').value = j.videoVersion || versionOfCat(j.videoCategory || 'Official Music Video'); $('#f_videoCategory').value = j.videoCategory || 'Official Music Video';
  $('#f_videoDuration').value = j.videoDuration || ''; $('#f_videoDirector').value = j.director || ''; $('#f_videoProducer').value = j.videoProducer || ''; $('#f_videoIsrc').value = j.videoIsrc || '';
  $('#f_snippets').value = (j.snippets || []).join('\n');
  $('#f_srcIsrc').value = j.srcIsrc || '';
  showMode();
  $('#f_isrcAuto').checked = j.isrcAuto !== false;
  currentConfirm = (j.toConfirm || []).filter(k => !(['snippet', 'video'].includes(j.mode) && ['writers', 'producers', 'mix', 'title', 'feats'].includes(k)));
  currentExtra = j.extra || {};
  const ids = { title: 'f_title', artist: 'f_artist', feats: 'f_feats', date: 'f_date', writers: 'f_writers', producers: 'f_producers', mix: 'f_mix', duration: 'f_duration' };
  Object.values(ids).forEach(id => $('#' + id).parentElement.classList.remove('flag'));
  currentConfirm.forEach(k => ids[k] && $('#' + ids[k]).parentElement.classList.add('flag'));
  const box = $('#confirm');
  if (currentConfirm.length) {
    box.hidden = false;
    box.textContent = 'À confirmer dans le mail : ' + currentConfirm.map(k => LABELS[k] || k).join(', ') + '. Vérifie avant de lancer.';
  } else box.hidden = true;
  const extra = [];
  if (currentExtra.territory) extra.push('Territoire : ' + currentExtra.territory);
  if (currentExtra.upc) extra.push('UPC dans le mail : ' + currentExtra.upc);
  $('#extra').textContent = extra.join(' · ');
}

function showMode() {
  const m = $('#f_mode').value, snip = m === 'snippet', vid = m === 'video';
  $('#snipBox').hidden = !snip;
  $('#vidBox').hidden = !vid;
  $('#isrcBox').hidden = !(snip || vid);
  $('#isrcLabel').textContent = vid ? 'ISRC audio' : 'ISRC de la piste complète';
  $('#isrcHint').textContent = vid ? '(obligatoire : la vidéo est copiée de cette piste et lui est associée)' : '(obligatoire : l’extension retrouve la piste dans R2 et reprend son titre tel quel ; c’est elle qui est dupliquée, avec son work)';
  document.querySelectorAll('[data-nosnip]').forEach(el => { el.hidden = snip || vid; });
  document.querySelectorAll('[data-novid]').forEach(el => { el.hidden = vid; });
  const alb = m === 'album';
  $('#albBox').hidden = !alb;
  document.querySelectorAll('[data-noalb]').forEach(el => { el.hidden = el.hidden || alb; });
  $('#titleLab').textContent = alb ? 'Titre de l’album' : 'Titre';
  if (alb && !currentTracks.length) currentTracks.push({ title: '', version: '', artist: '', feats: [], writers: [], producers: [], mix: [], isrc: '', duration: '', genre: '' });
  if (alb) setTimeout(drawTracks, 0);
  $('#vidGuide').hidden = !vid;
}
function versionOfCat(cat) { const c = (R2Parse.VIDEO_CATS || []).find(x => x[0] === cat); return c ? c[1] : (cat || 'Official Music Video'); }
$('#f_videoCategory').addEventListener('change', () => { $('#f_videoVersion').value = versionOfCat($('#f_videoCategory').value); save(); });
$('#f_mode').addEventListener('change', () => { showMode(); save(); showJob(readJob()); });

async function save() {
  await browser.storage.local.set({ [JOB]: readJob() });
}

function carnetGenre(artist) {
  const c = window.carnetNow && window.carnetNow();
  if (!c) return '';
  const f = R2Carnet.findIn(c, artist);
  return (f && f.genre) || c.defaults.genre || '';
}
// les noms de la fiche qui passeront par Identify sans Party ID dans le carnet
function carnetGaps(job) {
  const c = window.carnetNow && window.carnetNow();
  if (!c || !c.defaults.mainLevee) return '';
  const names = job.mode === 'video' ? [job.director, job.videoProducer] : job.mode === 'snippet' ? [] : [...(job.feats || []), ...(job.writers || []), ...(job.producers || []), ...(job.mix || [])];
  const miss = [...new Set(names.filter(Boolean))].filter(n => { const f = R2Carnet.findIn(c, n); return !(f && f.partyId); });
  return miss.length ? ` — Pas de Party ID dans le carnet pour : ${miss.join(', ')} (Identify te demandera de choisir ; l’extension les retiendra).` : (names.filter(Boolean).length ? ' — Tout le monde est dans le carnet : main levée.' : '');
}
$('#parse').addEventListener('click', async () => {
  const albumP = R2Parse.parseAlbum($('#mail').value);
  if (albumP) {
    const keep0 = readJob();
    currentTracks = albumP.tracks;
    const job = { ...keep0, mode: 'album', title: albumP.title, artist: albumP.artist, feats: albumP.feats, date: albumP.date, genre: albumP.genre || carnetGenre(albumP.artist),
      version: albumP.version || '', writers: [], producers: [], mix: [], duration: '', isrcAuto: true, tracks: currentTracks, toConfirm: albumP.toConfirm, extra: { territory: albumP.territory, upc: albumP.upc, label: albumP.label, assets: albumP.assets } };
    showJob(job); await save(); drawTracks();
    const probs = R2Parse.albumProblems(job);
    $('#parseMsg').style.color = probs.length ? 'var(--red)' : '';
    $('#parseMsg').textContent = `Album « ${job.title || '?'} » : ${currentTracks.length} piste(s) reconnues dans l’ordre.` + (probs.length ? ` À corriger : ${probs.length} point(s), voir les pistes en rouge.` : ' Tout est prêt.') + carnetGaps({ ...job, mode: 'single', feats: currentTracks.flatMap(t => t.feats), writers: currentTracks.flatMap(t => t.writers), producers: currentTracks.flatMap(t => t.producers), mix: currentTracks.flatMap(t => t.mix) });
    return;
  }
  const p = R2Parse.parseMail($('#mail').value);
  const keep = readJob();
  const job = {
    title: p.title, artist: p.artist, feats: p.feats, date: p.date,
    writers: p.writers, producers: p.producers || [], mix: p.mix,
    duration: keep.duration, // la durée vient du WAV, pas du mail
    genre: p.genre || carnetGenre(p.artist),
    mode: p.mode === 'album' ? 'album' : (p.mode === 'video' || p.audioIsrc) ? 'video' : p.mode === 'snippet' ? 'snippet' : (p.mode ? 'single' : (keep.mode === 'video' ? 'single' : keep.mode)), snippets: (p.snippets && p.snippets.length) ? p.snippets : keep.snippets,
    srcIsrc: p.audioIsrc ? p.audioIsrc : (p.mode === 'snippet' && p.isrc) ? p.isrc : keep.srcIsrc,
    director: p.videoDirector || '', videoProducer: p.videoProducer || '', videoIsrc: p.videoIsrc || '',
    videoCategory: p.videoCategory || keep.videoCategory || 'Official Music Video', videoVersion: versionOfCat(p.videoCategory || keep.videoCategory || 'Official Music Video'),
    isrcAuto: p.isrcAuto, toConfirm: p.toConfirm,
    extra: { territory: p.territory, upc: p.upc, label: p.label }
  };
  showJob(job);
  await save();
  const missing = (job.mode === 'video' ? [] : job.mode === 'snippet' ? ['artist', 'date'] : ['title', 'artist', 'date']).filter(k => !job[k]);
  if (job.mode === 'video' && !job.srcIsrc) missing.push('isrc');
  if (job.mode === 'video' && !job.director) missing.push('Video Director');
  if (job.mode === 'video' && !job.videoProducer) missing.push('Video Producer');
  if (job.mode === 'snippet' && !job.srcIsrc) missing.push('isrc');
  if (job.mode === 'snippet' && !(job.snippets || []).length) missing.push('snippets');
  if (!job.writers.length && !['snippet', 'video'].includes(job.mode)) missing.push('writers');
  const notes = (p.notes || []).concat(p.mode === 'album' ? ['type « album » sans sections « PISTE 01, 02… » : utilise le modèle album (Type de sortie : Album)'] : []);
  $('#parseMsg').style.color = missing.length ? 'var(--red)' : '';
  $('#parseMsg').textContent = (missing.length
    ? 'Pas trouvé : ' + missing.map(k => LABELS[k] || k).join(', ') + '. Complète à la main (ou demande un mail au format modèle).'
    : (job.mode === 'video' ? 'Fiche vidéo remplie (ISRC audio, crédit vidéo' + (job.videoIsrc ? ', ISRC vidéo fourni' : ', ISRC vidéo à générer') + ', catégorie ' + job.videoCategory + ').' : job.mode === 'snippet' ? 'Fiche snippet remplie.' : 'Fiche remplie. Ajoute le WAV pour la durée.')) + (notes.length ? ' — ' + notes.join(' ; ') : '') + carnetGaps(job);
});

document.querySelectorAll('section input, section textarea').forEach(el => {
  if (el.id === 'mail' || el.id === 'wav') return;
  el.addEventListener('input', save);
  el.addEventListener('change', save);
});

$('#wav').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  $('#wavMsg').textContent = 'Lecture du WAV…';
  try {
    let sec;
    try { sec = await R2Parse.wavDuration(file); }
    catch (err) {
      // autre format audio : on demande au lecteur du navigateur
      sec = await new Promise((res, rej) => {
        const a = new Audio(); a.preload = 'metadata';
        a.onloadedmetadata = () => res(a.duration); a.onerror = () => rej(err);
        a.src = URL.createObjectURL(file);
      });
    }
    $('#f_duration').value = R2Parse.fmtDuration(sec);
    $('#wavMsg').textContent = `${file.name} : ${R2Parse.fmtDuration(sec)} (lu sur place, rien n’est envoyé)`;
    await save();
  } catch (err) {
    $('#wavMsg').textContent = 'Impossible de lire ce fichier : ' + err.message;
  }
  e.target.value = '';
});

// ---------- Réglages ----------
const SETTING_IDS = ['configGroup', 'configuration', 'snippetConfiguration', 'mixGroup', 'mixRole', 'coverSize', 'coverDpi', 'coverColor', 'coverFormat'];
function showSettings(s) {
  SETTING_IDS.forEach(k => { $('#s_' + k).value = s[k] ?? DEFAULTS[k]; });
  $('#s_autoSave').checked = s.autoSave !== false;
  $('#s_artistWriter').checked = s.artistWriter !== false;
  $('#s_fixYears').checked = s.fixYears !== false;
}
async function saveSettings() {
  const s = {};
  SETTING_IDS.forEach(k => { s[k] = $('#s_' + k).value.trim() || DEFAULTS[k]; });
  s.autoSave = $('#s_autoSave').checked;
  s.artistWriter = $('#s_artistWriter').checked;
  s.fixYears = $('#s_fixYears').checked;
  s.v = 2;
  await browser.storage.local.set({ [SET]: s });
}
SETTING_IDS.forEach(k => $('#s_' + k).addEventListener('change', saveSettings));
['autoSave', 'artistWriter', 'fixYears'].forEach(k => $('#s_' + k).addEventListener('change', saveSettings));
$('#resetSettings').addEventListener('click', async () => { showSettings(DEFAULTS); await saveSettings(); });

$('#newJob').addEventListener('click', async () => {
  if (!confirm('Vider la fiche pour une nouvelle sortie ?')) return;
  $('#mail').value = '';
  showJob({ isrcAuto: true });
  await browser.storage.local.set({ [JOB]: readJob(), [STATE]: { steps: {} } });
  $('#parseMsg').textContent = '';
  $('#wavMsg').textContent = '';
});

// ---------- Avancement (écrit par le bandeau dans R2) ----------
const STEP_LABELS = {
  copyRelease: 'Copie de la release',
  release: 'Release (titre, UPC, date, ménage)',
  copyAudio: 'Copie de la piste',
  audio: 'Piste : ISRC, durée',
  contributors: 'Auteurs et mix/master',
  copyImage: 'Copie pour la cover',
  image: 'Cover (taille, format)',
  link: 'Piste et cover rattachées à la release'
};
function showState(st) {
  const steps = (st && st.steps) || {};
  $('#steps').innerHTML = Object.keys(STEP_LABELS).map(k => {
    const v = steps[k];
    const cls = v === 'ok' ? 'ok' : v && v !== 'ok' ? 'err' : '';
    const icon = v === 'ok' ? '✓' : v ? '!' : '○';
    return `<div class="${cls}">${icon} ${STEP_LABELS[k]}${v && v !== 'ok' ? ' — ' + v : ''}</div>`;
  }).join('');
}
browser.storage.onChanged.addListener((ch) => { if (ch[STATE]) showState(ch[STATE].newValue); });

// ---------- Lancer depuis le panneau (le bandeau de l'onglet R2 affiché exécute) ----------
async function sendCmd(name) {
  await save();
  const j = readJob();
  if (j.mode === 'album') {
    const probs = R2Parse.albumProblems(j);
    if (probs.length) { drawTracks(); $('#runMsg').textContent = 'Album pas prêt : ' + probs.map(p => (p.track ? 'piste ' + p.track + ' : ' : '') + p.msg).join(' ; ') + '.'; return; }
  } else if (j.mode === 'video') {
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(j.srcIsrc || '')) { $('#runMsg').textContent = 'Mode ISRC vidéo : indique l’ISRC de la piste audio (12 caractères).'; return; }
  } else if (j.mode === 'snippet') {
    if (!/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(j.srcIsrc || '')) { $('#runMsg').textContent = 'Mode Snippets : indique l’ISRC de la piste complète (12 caractères, ex. GB2DY2614066). Le titre sera repris de R2.'; return; }
    if (!j.artist) { $('#runMsg').textContent = 'Remplis au moins l’artiste.'; return; }
  } else if (!j.title || !j.artist) { $('#runMsg').textContent = 'Remplis au moins le titre et l’artiste.'; return; }
  const tabs = await browser.tabs.query({ url: '*://r2.umusic.net/*' }).catch(() => []);
  if (!tabs.length) { $('#runMsg').textContent = 'Ouvre d’abord R2 dans un onglet de cette fenêtre.'; return; }
  await browser.storage.local.set({ r2cmd: { name, t: Date.now() } });
  $('#runMsg').textContent = name === 'resume' ? 'Reprise demandée : regarde le bandeau Auto R2 dans R2.' : 'C’est parti : suis l’avancement ci-dessous ou sur le bandeau dans R2.';
}
$('#runR2').addEventListener('click', () => sendCmd('run'));
$('#resumeR2').addEventListener('click', () => sendCmd('resume'));

(async () => {
  const d = await browser.storage.local.get([JOB, SET, STATE]);
  showJob(d[JOB] || { isrcAuto: true });
  const st = d[SET] ? { ...d[SET] } : null;
  // 0.2.1 : la cover passe de JPEG à TIFF (anciens réglages mis à jour une fois)
  if (st && !st.v && st.coverFormat === 'JPEG') st.coverFormat = 'TIFF';
  showSettings(st || DEFAULTS);
  if (!d[SET] || !d[SET].v) await saveSettings();
  showState(d[STATE]);
})();

// modèle de mail à copier
const MAIL_MODEL = `MISE EN LIGNE – ARTISTE PRINCIPAL – TITRE – SORTIE LE JJ/MM/AAAA

Type de sortie : Single / Snippet / Album / Vidéo
Date de sortie : JJ/MM/AAAA
Artiste principal :
Featuring :
Titre :
Version :
Durées des snippets : (snippet seulement, ex. 0:59, 0:59, 0:37)
Auteurs :
Compositeurs :
Producteurs :
Mix / Master :
Genre :
Label :
Territoire : Monde
UPC : à générer
ISRC : à générer
ISRC audio à rattacher : (vidéo seulement)
Video Director : (vidéo seulement)
Video Producer : (vidéo seulement)
Catégorie : (vidéo seulement, ex. Official Music Video, Lyric Video)
ISRC vidéo : (vidéo seulement, vide = à générer)
Assets : (lien)`;
$('#copyModel').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(MAIL_MODEL); $('#parseMsg').style.color = ''; $('#parseMsg').textContent = 'Modèle de mail copié : colle-le dans ton mail ou envoie-le aux labels.'; }
  catch (e) { $('#mail').value = MAIL_MODEL; $('#parseMsg').textContent = 'Modèle affiché ci-dessus : copie-le.'; }
});

// ---------- Modèle de mail selon le type (Album : une section par piste) ----------
function currentModel() {
  const t = $('#tplType').value;
  if (t !== 'album') return { ok: true, text: MAIL_MODEL };
  const n = Number($('#tplN').value);
  if (!Number.isInteger(n) || n < 1) return { ok: false, msg: 'Nombre de titres invalide : mets un nombre entier, 1 ou plus.' };
  return { ok: true, text: R2Parse.albumModel(n) };
}
function refreshModel() {
  $('#tplNLab').hidden = $('#tplType').value !== 'album';
  const m = currentModel();
  $('#tplMsg').style.color = m.ok ? '' : 'var(--red)';
  $('#tplMsg').textContent = m.ok ? '' : m.msg;
  $('#tplPre').textContent = m.ok ? m.text : '';
  $('#copyModel').disabled = !m.ok;
}
$('#tplType').addEventListener('change', refreshModel);
$('#tplN').addEventListener('input', refreshModel);
refreshModel();
// remplace l'ancien bouton (le même modèle pour tous) : le modèle suit le type et le nombre de titres choisis
$('#copyModel').replaceWith($('#copyModel').cloneNode(true));
$('#copyModel').addEventListener('click', async () => {
  const m = currentModel();
  if (!m.ok) { refreshModel(); return; }
  const what = $('#tplType').value === 'album' ? `Modèle album (${$('#tplN').value} titre(s))` : 'Modèle de mail';
  try { await navigator.clipboard.writeText(m.text); $('#parseMsg').style.color = ''; $('#parseMsg').textContent = `${what} copié : colle-le dans ton mail ou envoie-le aux labels.`; }
  catch (e) { $('#tplPrev') ; document.querySelector('.tplPrev').open = true; $('#parseMsg').textContent = 'Copie impossible ici : sélectionne le modèle dans « Voir le modèle ».'; }
});

// ---------- Album : liste des pistes ----------
let currentTracks = [];
const listOf = (v) => String(v || '').split(/[,;\n]+/).map(x => x.trim()).filter(Boolean);
const TRK_FIELDS = [['title', 'Titre'], ['version', 'Version'], ['artist', 'Artiste (vide = album)'], ['feats', 'Featuring'], ['writers', 'Auteurs / compositeurs'], ['producers', 'Producteurs'], ['mix', 'Mix / Master'], ['isrc', 'ISRC (vide = généré)'], ['duration', 'Durée'], ['genre', 'Genre (vide = album)']];
const LISTF = new Set(['feats', 'writers', 'producers', 'mix']);
function fmtTotal(tr) {
  const sec = tr.reduce((a, t) => { const m = String(t.duration || '').match(/(?:(\d+):)?(\d{1,2}):(\d{2})$/); return a + (m ? (+(m[1] || 0)) * 3600 + (+m[2]) * 60 + (+m[3]) : 0); }, 0);
  if (!sec) return '';
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s2 = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s2).padStart(2, '0');
}
function drawTracks() {
  const box = $('#tracks'); box.innerHTML = '';
  const job = readJob();
  const probs = R2Parse.albumProblems(job);
  currentTracks.forEach((t, i) => {
    const d = document.createElement('div');
    const mine = probs.filter(p => p.track === i + 1);
    d.className = 'trk' + (mine.length ? ' bad' : '');
    d.innerHTML = `<div class="top"><b>${String(i + 1).padStart(2, '0')}</b><input data-k="title" placeholder="Titre"><button data-a="up" title="Monter">↑</button><button data-a="down" title="Descendre">↓</button><button data-a="copy" title="Recopier les crédits de la piste précédente">⤵</button><button data-a="del" title="Supprimer">✕</button></div>
      <div class="grid">${TRK_FIELDS.slice(1).map(([k, l]) => `<label>${l}<input data-k="${k}"></label>`).join('')}<label class="file" style="margin-top:4px">🎵 WAV<input data-wav type="file" accept=".wav,audio/*"></label></div>
      ${mine.length ? `<div class="e">${mine.map(p => p.msg).join(' · ')}</div>` : ''}`;
    d.querySelectorAll('input[data-k]').forEach(inp => {
      const k = inp.dataset.k;
      inp.value = LISTF.has(k) ? (t[k] || []).join(', ') : (t[k] || '');
      inp.addEventListener('change', () => { t[k] = LISTF.has(k) ? listOf(inp.value) : (k === 'isrc' ? inp.value.replace(/[^A-Za-z0-9]/g, '').toUpperCase() : inp.value.trim()); save(); drawTracks(); });
    });
    d.querySelector('[data-wav]').addEventListener('change', async (e) => {
      const f = e.target.files[0]; if (!f) return;
      try { t.duration = R2Parse.fmtDuration(await R2Parse.wavDuration(f)); if (!t.title) t.title = f.name.replace(/\.[^.]+$/, ''); } catch (err) { alert('WAV illisible : ' + err.message); }
      save(); drawTracks();
    });
    d.querySelectorAll('[data-a]').forEach(b => b.addEventListener('click', () => {
      const a = b.dataset.a;
      if (a === 'up' && i > 0) [currentTracks[i - 1], currentTracks[i]] = [currentTracks[i], currentTracks[i - 1]];
      if (a === 'down' && i < currentTracks.length - 1) [currentTracks[i + 1], currentTracks[i]] = [currentTracks[i], currentTracks[i + 1]];
      if (a === 'copy' && i > 0) { const p = currentTracks[i - 1]; for (const k of ['artist', 'feats', 'writers', 'producers', 'mix', 'genre']) t[k] = Array.isArray(p[k]) ? [...p[k]] : (p[k] || ''); }
      if (a === 'del') { if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Sûr ?'; setTimeout(() => { b.dataset.armed = ''; b.textContent = '✕'; }, 3000); return; } currentTracks.splice(i, 1); }
      save(); drawTracks();
    }));
    box.appendChild(d);
  });
  const total = fmtTotal(currentTracks);
  const common = probs.filter(p => !p.track);
  $('#albRecap').innerHTML = `<b>${esc2(job.title || 'Titre de l’album ?')}</b> — ${esc2(job.artist || 'artiste ?')} — ${job.date ? job.date.split('-').reverse().join('/') : 'date ?'}<br>${currentTracks.length} piste(s)${total ? ' · durée totale ' + total : ''}${job.genre ? ' · ' + esc2(job.genre) : ''}`
    + (probs.length ? `<br><span class="err">À corriger avant de lancer : ${common.map(p => p.msg).concat(probs.filter(p => p.track).map(p => 'piste ' + p.track + ' : ' + p.msg)).join(' ; ')}</span>` : '<br>✓ Prêt à lancer');
}
function esc2(t) { return String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
$('#addTrack').addEventListener('click', () => { currentTracks.push({ title: '', version: '', artist: '', feats: [], writers: [], producers: [], mix: [], isrc: '', duration: '', genre: '' }); save(); drawTracks(); const ins = document.querySelectorAll('#tracks .trk input[data-k=title]'); if (ins.length) ins[ins.length - 1].focus(); });
