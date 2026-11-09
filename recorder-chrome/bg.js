// R2 Recorder pour Chrome : garde les événements de l'onglet où l'on a cliqué « Démarrer » (et des fenêtres qu'il ouvre)
let state = null;
const ready = chrome.storage.local.get('r2rec').then(d => { state = { recording: false, events: [], snaps: [], tabs: [], host: '', ...(d.r2rec || {}) }; });
let saveTimer = null;
function save() { clearTimeout(saveTimer); saveTimer = setTimeout(() => chrome.storage.local.set({ r2rec: state }), 300); }
const flag = () => chrome.storage.local.set({ r2recOn: { recording: state.recording, t: Date.now() } });
const mine = (sender) => !!(sender.tab && state.tabs.includes(sender.tab.id));

chrome.tabs.onCreated.addListener((tab) => ready.then(() => {
  if (state.recording && tab.openerTabId != null && state.tabs.includes(tab.openerTabId)) { state.tabs.push(tab.id); save(); flag(); }
}));

async function activeTab() {
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  return tab;
}

async function handle(msg, sender) {
  if (!msg) return null;
  if (msg.type === 'getState') return { recording: state.recording, events: state.events.length, snaps: state.snaps.length };
  if (msg.type === 'isRecording') return state.recording && mine(sender);
  if (msg.type === 'start') {
    const tab = await activeTab();
    if (tab && !state.tabs.includes(tab.id)) state.tabs.push(tab.id);
    if (tab && !state.host) { try { state.host = new URL(tab.url).hostname; } catch (e) { /* rien */ } }
    state.recording = true; save();
    // les pages déjà ouvertes avant l'installation n'ont pas encore le script
    if (tab) { try { await chrome.scripting.executeScript({ target: { tabId: tab.id, allFrames: true }, files: ['rec.js'] }); } catch (e) { /* page protégée */ } }
    await flag();
    if (tab) chrome.tabs.sendMessage(tab.id, { type: 'doSnap' }).catch(() => {});
    return true;
  }
  if (msg.type === 'stop') { state.recording = false; save(); await flag(); return true; }
  if (msg.type === 'clear') { state = { recording: false, events: [], snaps: [], tabs: [], host: '' }; save(); await flag(); return true; }
  if (msg.type === 'ev' && state.recording && mine(sender)) {
    msg.ev.n = state.events.length + 1;
    msg.ev.tab = sender.tab.id;
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
    const tab = await activeTab();
    if (tab) chrome.tabs.sendMessage(tab.id, { type: 'doSnap' }).catch(() => {});
    return true;
  }
  if (msg.type === 'exportData') {
    return { tool: 'R2 Recorder 0.2.0 (Chrome)', site: state.host, exportedAt: new Date().toISOString(), events: state.events, snapshots: state.snaps };
  }
  return null;
}
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  ready.then(() => handle(msg, sender)).then(sendResponse, () => sendResponse(null));
  return true;
});
