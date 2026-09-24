/* ASTRA Terminal — keyboard shortcuts.
   Function keys open the pages you use most, wherever you are in the app:
   F6 the chart, F8 Deep Dive, F9 the live desk, F10 maximise the chart…
   F1 shows the list, and any key can be changed there: click a row, press
   the new key. Stored under astra_keys. Typing in a box never triggers a
   shortcut unless it is a function key (those are safe to press anywhere). */
const Shortcuts = {
  KEY: 'astra_keys',
  ACTIONS: [
    { id: 'help',     label: 'This list of shortcuts',           def: 'F1',  run: () => Shortcuts.open() },
    { id: 'clock',    label: 'Market Clock',                     def: 'F2',  run: () => Shortcuts.obs('clock', 'marketClockBtn') },
    { id: 'replay',   label: 'Trade Replay',                     def: 'F3',  run: () => Shortcuts.obs('replay', 'tradeReviewBtn') },
    { id: 'screener', label: 'Screener',                         def: 'F4',  run: () => Shortcuts.tab('screener') },
    { id: 'chart',    label: 'The chart (fold the lower panel)', def: 'F6',  run: () => { if (typeof WorkspaceUI !== 'undefined') WorkspaceUI.openChart(); } },
    { id: 'open',     label: 'Open Trades',                      def: 'F7',  run: () => Shortcuts.bot('open') },
    { id: 'explorer', label: 'Deep Dive',                        def: 'F8',  run: () => Shortcuts.bot('explorer') },
    { id: 'checker',  label: 'Strategy Checker',                 def: 'Shift+F8', run: () => Shortcuts.bot('checker') },
    { id: 'live',     label: 'Live connection & safety (the desk)', def: 'F9', run: () => Shortcuts.bot('live') },
    { id: 'max',      label: 'Maximise / restore the chart',     def: 'F10', run: () => { if (typeof App !== 'undefined' && App.setMax) App.setMax(document.documentElement.dataset.chartmax !== '1'); } },
    { id: 'dash',     label: 'Bots dashboard',                   def: 'Ctrl+F8', run: () => Shortcuts.bot('dash') },
    { id: 'manual',   label: 'Manual Trading Bot (paper)',       def: 'Ctrl+F7', run: () => Shortcuts.bot('manual') },
    { id: 'livebot',  label: 'LIVE trading bot (manual ticket)', def: 'Ctrl+F9', run: () => Shortcuts.bot('liveManual') },
    { id: 'news',     label: 'News & alerts',                    def: 'Ctrl+F4', run: () => Shortcuts.tab('news') },
    { id: 'heatmap',  label: 'Heatmap',                          def: 'Ctrl+F6', run: () => Shortcuts.tab('heatmap') },
    { id: 'panel',    label: 'Lower panel: normal → small → full', def: 'Ctrl+F10', run: () => { const t = document.querySelector('#botTabs [data-tab].active') || document.querySelector('#botTabs [data-tab="bots"]'); if (t) t.click(); } },
  ],
  map: null, capture: null,

  load(){ if (!this.map){ const saved = lsGet(this.KEY, {}) || {}; this.map = {}; for (const a of this.ACTIONS) this.map[a.id] = saved[a.id] || a.def; } return this.map; },
  save(){ lsSet(this.KEY, this.map); },
  combo(e){ return (e.ctrlKey ? 'Ctrl+' : '') + (e.altKey ? 'Alt+' : '') + (e.shiftKey ? 'Shift+' : '') + (e.key.length === 1 ? e.key.toUpperCase() : e.key); },

  init(){
    this.load();
    window.addEventListener('keydown', e => {
      if (this.capture){ /* rebinding: the next key pressed becomes the shortcut */
        if (e.key === 'Escape'){ this.capture = null; this.render(); return; }
        if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
        e.preventDefault(); e.stopPropagation();
        const combo = this.combo(e);
        const taken = Object.entries(this.map).find(([id, k]) => k === combo && id !== this.capture);
        if (taken) delete this.map[taken[0]];
        this.map[this.capture] = combo; this.capture = null; this.save(); this.render();
        toast('Shortcut saved: ' + combo, 'ok');
        return;
      }
      const isF = /^F\d{1,2}$/.test(e.key);
      const tag = (e.target && e.target.tagName) || '';
      if (!isF && (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || (e.target && e.target.isContentEditable))) return;
      const combo = this.combo(e);
      const hit = this.ACTIONS.find(a => this.map[a.id] === combo);
      if (!hit) return;
      e.preventDefault(); e.stopPropagation();
      try { hit.run(); } catch(err){ console.warn('ASTRA shortcut:', err.message); }
    }, true);
  },

  /* ---- the little helpers the actions use ---- */
  bot(id){
    if (typeof WorkspaceUI === 'undefined') return;
    const o = document.getElementById('obsMax'); if (o && !o.hidden && typeof ObsWindows !== 'undefined' && o.dataset.name) ObsWindows.set(o.dataset.name, 'normal');
    if (document.documentElement.dataset.chartmax === '1' && App.setMax) App.setMax(false);
    WorkspaceUI.openBot(id); WorkspaceUI.expand(true);
  },
  tab(name){
    if (document.documentElement.dataset.chartmax === '1' && App.setMax) App.setMax(false);
    const t = document.querySelector('#botTabs [data-tab="' + name + '"]'); if (!t) return;
    const bp = document.getElementById('bottomPanel');
    if (t.classList.contains('active')){ if (bp && bp.classList.contains('collapsed')) t.click(); return; }
    t.click();
  },
  obs(name, btnId){
    if (typeof ObsWindows !== 'undefined' && ObsWindows.win && ObsWindows.win[name]){
      const w = ObsWindows.win[name];
      if (w.state === 'max'){ ObsWindows.set(name, 'normal'); return; }
      const b = document.getElementById(btnId); if (b) b.click();
      setTimeout(() => ObsWindows.set(name, 'max'), 80);
    } else { const b = document.getElementById(btnId); if (b) b.click(); }
  },

  /* ---- the list ---- */
  open(){
    let m = document.getElementById('keysModal');
    if (!m){
      document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="keysModal"><div class="mBox mNarrow keysBox">
        <div class="mHead"><span>KEYBOARD SHORTCUTS</span> <span>PRESS A KEY, GO THERE</span><button class="mClose">×</button></div>
        <div class="mBody" id="keysBody"></div></div></div>`);
      m = document.getElementById('keysModal');
      m.querySelector('.mClose').addEventListener('click', () => { this.capture = null; m.classList.remove('show'); });
      m.addEventListener('mousedown', e => { if (e.target === m){ this.capture = null; m.classList.remove('show'); } });
    }
    this.render(); m.classList.add('show');
  },
  render(){
    const body = document.getElementById('keysBody'); if (!body) return;
    body.innerHTML = `<p class="dim2 keysHint">Function keys work anywhere, even while typing. Click a key to change it, then press the new key (Esc cancels). Letters on their own open the symbol search, so use F-keys or Ctrl/Alt combinations.</p>
      <table class="keysTable">${this.ACTIONS.map(a => `<tr><td>${esc(a.label)}</td><td><button class="keysKey${this.capture === a.id ? ' waiting' : ''}" data-keyid="${a.id}">${this.capture === a.id ? 'press a key…' : esc(this.map[a.id] || '—')}</button></td></tr>`).join('')}</table>
      <div class="keysFoot"><span class="dim2">Also: Esc closes / restores · M maximises the chart when single-letter tools are off</span><button class="bMini" data-keysreset>↺ defaults</button></div>`;
    body.querySelectorAll('[data-keyid]').forEach(b => b.addEventListener('click', () => { this.capture = this.capture === b.dataset.keyid ? null : b.dataset.keyid; this.render(); }));
    body.querySelector('[data-keysreset]').addEventListener('click', () => { this.map = null; lsSet(this.KEY, {}); this.load(); this.render(); });
  },
};
document.addEventListener('DOMContentLoaded', () => Shortcuts.init());
