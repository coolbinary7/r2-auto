// Panneau latéral : mail → fiche, WAV → durée, réglages. Tout est gardé dans browser.storage.local.
const $ = (s) => document.querySelector(s);
const JOB = 'r2job', SET = 'r2settings', STATE = 'r2state';

const DEFAULTS = {
  configGroup: 'e-Product',
  configuration: 'eSingle Audio',
  mixGroup: 'Mastering Engineers',
  mixRole: 'Mastering Engineer',
  coverSize: '3000',
  coverDpi: '300 dpi',
  coverColor: 'RGB',
  coverFormat: 'TIFF',
  autoSave: true
};

const FIELDS = ['title', 'artist', 'feats', 'date', 'writers', 'mix', 'duration', 'isrcAuto'];
const LABELS = { title: 'titre', artist: 'artiste', feats: 'featurings', date: 'date', writers: 'auteurs', mix: 'mix & master', duration: 'durée' };

function readJob() {
  return {
    title: $('#f_title').value.trim(),
    artist: $('#f_artist').value.trim(),
    feats: $('#f_feats').value.split(',').map(s => s.trim()).filter(Boolean),
    date: $('#f_date').value,
    writers: $('#f_writers').value.split('\n').map(s => s.trim()).filter(Boolean),
    mix: $('#f_mix').value.split('\n').map(s => s.trim()).filter(Boolean),
    duration: $('#f_duration').value.trim(),
    isrcAuto: $('#f_isrcAuto').checked,
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
  $('#f_mix').value = (j.mix || []).join('\n');
  $('#f_duration').value = j.duration || '';
  $('#f_isrcAuto').checked = j.isrcAuto !== false;
  currentConfirm = j.toConfirm || [];
  currentExtra = j.extra || {};
  const ids = { title: 'f_title', artist: 'f_artist', feats: 'f_feats', date: 'f_date', writers: 'f_writers', mix: 'f_mix', duration: 'f_duration' };
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

async function save() {
  await browser.storage.local.set({ [JOB]: readJob() });
}

$('#parse').addEventListener('click', async () => {
  const p = R2Parse.parseMail($('#mail').value);
  const keep = readJob();
  const job = {
    title: p.title, artist: p.artist, feats: p.feats, date: p.date,
    writers: p.writers, mix: p.mix,
    duration: keep.duration, // la durée vient du WAV, pas du mail
    isrcAuto: p.isrcAuto, toConfirm: p.toConfirm,
    extra: { territory: p.territory, upc: p.upc, label: p.label }
  };
  showJob(job);
  await save();
  const missing = ['title', 'artist', 'date'].filter(k => !job[k]);
  $('#parseMsg').style.color = missing.length ? 'var(--red)' : '';
  $('#parseMsg').textContent = missing.length
    ? 'Pas trouvé : ' + missing.map(k => LABELS[k]).join(', ') + '. Complète à la main.'
    : 'Fiche remplie. Ajoute le WAV pour la durée.';
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
const SETTING_IDS = ['configGroup', 'configuration', 'mixGroup', 'mixRole', 'coverSize', 'coverDpi', 'coverColor', 'coverFormat'];
function showSettings(s) {
  SETTING_IDS.forEach(k => { $('#s_' + k).value = s[k] ?? DEFAULTS[k]; });
  $('#s_autoSave').checked = s.autoSave !== false;
}
async function saveSettings() {
  const s = {};
  SETTING_IDS.forEach(k => { s[k] = $('#s_' + k).value.trim() || DEFAULTS[k]; });
  s.autoSave = $('#s_autoSave').checked;
  s.v = 2;
  await browser.storage.local.set({ [SET]: s });
}
SETTING_IDS.forEach(k => $('#s_' + k).addEventListener('change', saveSettings));
$('#s_autoSave').addEventListener('change', saveSettings);
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
  release: 'Release (titre, UPC, date)',
  copyAudio: 'Copie de la piste',
  audio: 'Piste : ISRC, durée',
  contributors: 'Auteurs et mix/master',
  copyImage: 'Copie pour la cover',
  image: 'Cover (taille, format)'
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
