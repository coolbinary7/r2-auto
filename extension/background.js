// Clic sur l'icône : ouvre / ferme le panneau latéral R2 Auto
browser.browserAction.onClicked.addListener(() => { browser.sidebarAction.toggle(); });
