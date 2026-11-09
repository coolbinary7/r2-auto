const browser = chrome;
const $ = (s) => document.querySelector(s);
async function refresh() {
  const s = await browser.runtime.sendMessage({ type: 'getState' });
  $('#st').innerHTML = s.recording
    ? `<span class="rec">● Enregistrement en cours</span> — ${s.events} action(s), ${s.snaps} capture(s)`
    : `En pause — ${s.events} action(s), ${s.snaps} capture(s)`;
  $('#start').style.display = s.recording ? 'none' : 'block';
  $('#stop').style.display = s.recording ? 'block' : 'none';
  $('#add').style.display = s.recording ? 'block' : 'none';
}
$('#start').onclick = async () => { await browser.runtime.sendMessage({ type: 'start' }); refresh(); };
$('#add').onclick = async () => { await browser.runtime.sendMessage({ type: 'start' }); $('#add').textContent = '✓ Onglet ajouté'; setTimeout(() => { $('#add').textContent = '＋ Enregistrer aussi cet onglet'; }, 1500); refresh(); };
$('#stop').onclick = async () => { await browser.runtime.sendMessage({ type: 'stop' }); refresh(); };
$('#snap').onclick = async () => { await browser.runtime.sendMessage({ type: 'snapAll' }); setTimeout(refresh, 800); };
$('#export').onclick = async () => {
  const data = await browser.runtime.sendMessage({ type: 'exportData' });
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' }));
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
  await chrome.downloads.download({ url, filename: `enregistrement-${(data.site || 'site').replace(/[^a-z0-9.-]/gi, '')}-${stamp}.json`, saveAs: false });
  $('#export').textContent = '✓ Exporté dans Téléchargements';
};
$('#clear').onclick = async () => { if (confirm('Effacer tout l’enregistrement ?')) { await browser.runtime.sendMessage({ type: 'clear' }); refresh(); } };
refresh();
setInterval(refresh, 1500);
