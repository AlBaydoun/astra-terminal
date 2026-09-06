/* ASTRA Terminal — desktop shell.

   The same application, in its own program window instead of a browser tab. It
   starts the data service itself, opens real operating-system windows for every
   torn-off panel (so they can be dragged onto a second or third monitor and are
   never blocked by a pop-up blocker), and remembers where each one was left.

   The rendering engine is the same Chromium the browser uses, so charts, feeds
   and bots run exactly as fast here as they do in the browser. */
const { app, BrowserWindow, Menu, screen, shell, dialog } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8642;
const URL_BASE = 'http://localhost:' + PORT + '/';

let server = null;
let mainWin = null;
const extraWins = new Set();

/* ---------- window positions, per panel, so a three-monitor desk stays put ---------- */
const stateFile = () => path.join(app.getPath('userData'), 'windows.json');
function loadBounds(){
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')); } catch(e){ return {}; }
}
function saveBounds(key, win){
  if (!win || win.isDestroyed()) return;
  try {
    const all = loadBounds();
    all[key] = Object.assign(win.getBounds(), { maximized: win.isMaximized() });
    fs.mkdirSync(path.dirname(stateFile()), { recursive: true });
    fs.writeFileSync(stateFile(), JSON.stringify(all, null, 2));
  } catch(e){}
}
/* only restore a position that still lands on a monitor that exists today */
function usableBounds(b){
  if (!b || b.width == null) return null;
  const displays = screen.getAllDisplays();
  const fits = displays.some(d => {
    const a = d.workArea;
    return b.x + b.width > a.x + 40 && b.x < a.x + a.width - 40 &&
           b.y + b.height > a.y + 20 && b.y < a.y + a.height - 20;
  });
  return fits ? b : null;
}

/* ---------- the data service ---------- */
function startServer(){
  return new Promise(resolve => {
    const probe = () => http.get(URL_BASE + 'api/health', r => { r.resume(); resolve(true); })
      .on('error', () => setTimeout(probe, 250));

    /* if something is already serving on the port, use it rather than fighting it */
    http.get(URL_BASE + 'api/health', r => { r.resume(); resolve(true); }).on('error', () => {
      server = spawn(process.execPath, [path.join(ROOT, 'server', 'astra-api.cjs')], {
        cwd: ROOT, env: Object.assign({}, process.env, { ELECTRON_RUN_AS_NODE: '1' }), stdio: 'ignore',
      });
      server.on('error', err => dialog.showErrorBox('ASTRA', 'The data service would not start:\n' + err.message));
      probe();
    });
  });
}

/* ---------- windows ---------- */
function makeWindow(url, key, opts){
  opts = opts || {};
  const saved = usableBounds(loadBounds()[key]);
  const win = new BrowserWindow(Object.assign({
    width: opts.width || 1500, height: opts.height || 950,
    minWidth: 380, minHeight: 320,
    backgroundColor: '#070b18',
    autoHideMenuBar: !!opts.child,
    title: 'ASTRA',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,     // a background monitor must keep updating
    },
  }, saved ? { x: saved.x, y: saved.y, width: saved.width, height: saved.height } : {}));

  if (saved && saved.maximized) win.maximize();
  win.loadURL(url);

  /* a torn-off panel becomes a real window of its own */
  win.webContents.setWindowOpenHandler(({ url: target, features }) => {
    const panel = (target.match(/[?&]panel=([a-z0-9_]+)/i) || [])[1] || 'panel';
    const num = n => { const m = features && features.match(new RegExp(n + '=(\\d+)')); return m ? +m[1] : undefined; };
    const bounds = usableBounds(loadBounds()['panel:' + panel]) || {};
    return {
      action: 'allow',
      overrideBrowserWindowOptions: {
        width: bounds.width || num('width') || 1280,
        height: bounds.height || num('height') || 860,
        x: bounds.x, y: bounds.y,
        backgroundColor: '#070b18',
        autoHideMenuBar: true,
        webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true,
                          nodeIntegration: false, backgroundThrottling: false },
      },
    };
  });

  win.webContents.on('did-create-window', (child, details) => {
    const panel = (details.url.match(/[?&]panel=([a-z0-9_]+)/i) || [])[1] || 'panel';
    extraWins.add(child);
    const remember = () => saveBounds('panel:' + panel, child);
    child.on('moved', remember);
    child.on('resize', remember);
    child.on('closed', () => extraWins.delete(child));
  });

  /* anything that is not our own app opens in the real browser, never in here */
  win.webContents.on('will-navigate', (e, target) => {
    if (!target.startsWith(URL_BASE)){ e.preventDefault(); shell.openExternal(target); }
  });

  const remember = () => saveBounds(key, win);
  win.on('moved', remember);
  win.on('resize', remember);
  win.on('maximize', remember);
  win.on('unmaximize', remember);
  return win;
}

function openPanel(panel){
  if (!mainWin) return;
  mainWin.webContents.executeJavaScript(
    'typeof Popout !== "undefined" && Popout.open(' + JSON.stringify(panel) + ')').catch(() => {});
}

/* move the focused window to the next monitor — the one thing a multi-monitor
   desk needs constantly and Windows makes fiddly */
function moveToNextDisplay(){
  const win = BrowserWindow.getFocusedWindow();
  if (!win) return;
  const displays = screen.getAllDisplays();
  if (displays.length < 2) return;
  const b = win.getBounds();
  const cur = screen.getDisplayMatching(b);
  const i = displays.findIndex(d => d.id === cur.id);
  const next = displays[(i + 1) % displays.length].workArea;
  const wasMax = win.isMaximized();
  if (wasMax) win.unmaximize();
  win.setBounds({
    x: next.x + Math.round((next.width - Math.min(b.width, next.width)) / 2),
    y: next.y + Math.round((next.height - Math.min(b.height, next.height)) / 2),
    width: Math.min(b.width, next.width), height: Math.min(b.height, next.height),
  });
  if (wasMax) win.maximize();
}

function buildMenu(){
  const panels = [
    ['Chart', 'chart'], ['Bots', 'bots'], ['Screener', 'screener'], ['Heatmap', 'heatmap'],
    ['Observer', 'observer'], ['Intel & news', 'intel'], ['Watchlist', 'watch'],
    ['Order book', 'book'], ['Alerts', 'alerts'], ['Paper account', 'portfolio'],
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'ASTRA', submenu: [
      { label: 'Reload', accelerator: 'F5', click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.reload(); } },
      { type: 'separator' },
      { label: 'Quit', accelerator: 'CmdOrCtrl+Q', role: 'quit' },
    ] },
    { label: 'Windows', submenu: panels.map(([label, key]) => ({
        label: 'Open ' + label + ' in its own window', click: () => openPanel(key) }))
      .concat([
        { type: 'separator' },
        { label: 'Move this window to the next monitor', accelerator: 'CmdOrCtrl+Shift+M', click: moveToNextDisplay },
        { label: 'Full screen', accelerator: 'F11', role: 'togglefullscreen' },
        { type: 'separator' },
        { label: 'Close every extra window', click: () => {
            for (const w of Array.from(extraWins)) { try { w.close(); } catch(e){} } } },
      ]) },
    { label: 'View', submenu: [
      { role: 'zoomIn', accelerator: 'CmdOrCtrl+=' }, { role: 'zoomOut' }, { role: 'resetZoom' },
      { type: 'separator' },
      { label: 'Developer tools', accelerator: 'CmdOrCtrl+Shift+I',
        click: () => { const w = BrowserWindow.getFocusedWindow(); if (w) w.webContents.toggleDevTools(); } },
    ] },
  ]));
}

app.whenReady().then(async () => {
  await startServer();
  buildMenu();
  mainWin = makeWindow(URL_BASE, 'main', { width: 1600, height: 1000 });
  mainWin.on('closed', () => { mainWin = null; });
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (server) { try { server.kill(); } catch(e){} } });
