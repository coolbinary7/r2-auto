// Garde les événements de l'onglet où l'on a cliqué « Démarrer » (et des fenêtres qu'il ouvre), rien d'autre
let state = { recording: false, events: [], snaps: [], tabs: [], host: '' };
browser.storage.local.get('r2rec').then(d => { if (d.r2rec) state = { tabs: [], host: '', ...d.r2rec }; });
browser.tabs.onCreated.addListener((tab) => { if (state.recording && tab.openerTabId != null && state.tabs.includes(tab.openerTabId)) { state.tabs.push(tab.id); save(); } });
const mine = (sender) => !!(sender.tab && state.tabs.includes(sender.tab.id));
let saveTimer = null;
function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => browser.storage.local.set({ r2rec: state }), 400);
}

browser.runtime.onMessage.addListener((msg, sender) => {
  if (!msg) return;
  if (msg.type === 'getState') return Promise.resolve({ recording: state.recording, events: state.events.length, snaps: state.snaps.length });
  if (msg.type === 'isRecording') return Promise.resolve(state.recording && mine(sender));
  if (msg.type === 'start') {
    return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) => {
      if (tab && !state.tabs.includes(tab.id)) state.tabs.push(tab.id);
      if (tab && !state.host) { try { state.host = new URL(tab.url).hostname; } catch (e) { /* rien */ } }
      state.recording = true; save();
      if (tab) browser.tabs.sendMessage(tab.id, { type: 'doSnap' }).catch(() => {});
      return true;
    });
  }
  if (msg.type === 'stop') { state.recording = false; save(); return Promise.resolve(true); }
  if (msg.type === 'clear') { state = { recording: false, events: [], snaps: [], tabs: [], host: '' }; save(); return Promise.resolve(true); }
  if (msg.type === 'ev' && state.recording && mine(sender)) {
    msg.ev.n = state.events.length + 1;
    msg.ev.tab = sender.tab && sender.tab.id;
    state.events.push(msg.ev);
    save();
  }
  if (msg.type === 'snap' && ((state.recording && mine(sender)) || msg.force)) {
    msg.snap.afterEvent = state.events.length;
    state.snaps.push(msg.snap);
    if (state.snaps.length > 300) state.snaps.shift();
    save();
  }
  if (msg.type === 'snapAll') {
    // demande à toutes les fenêtres (frames) de l'onglet de faire une capture
    return browser.tabs.query({ active: true, currentWindow: true }).then(([tab]) =>
      tab ? browser.tabs.sendMessage(tab.id, { type: 'doSnap' }).catch(() => {}) : null);
  }
  if (msg.type === 'export') {
    const data = {
      tool: 'R2 Recorder 0.2.0',
      site: state.host,
      exportedAt: new Date().toISOString(),
      events: state.events,
      snapshots: state.snaps
    };
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    return browser.downloads.download({ url, filename: `enregistrement-${(state.host || 'site').replace(/[^a-z0-9.-]/gi, '')}-${stamp}.json`, saveAs: false });
  }
});
