/* ASTRA Terminal — desktop preload.

   Deliberately almost empty. The page runs with contextIsolation on and no Node
   access, exactly as it does in a browser, so the desktop shell adds windows and
   menus without widening what the page itself can reach. */
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('astraDesktop', {
  version: process.versions.electron,
  platform: process.platform,
});
