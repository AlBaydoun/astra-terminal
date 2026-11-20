/* ASTRA / Timurila — Face: a second look and layout for the SAME Classic application.

   Nothing is rebuilt and nothing is removed: the page, its bots, its engines and its order gates
   are the ones Classic has always run. The face only rearranges what is on screen:
     · a dock on the left that is always there: Chart, Deep Dive, Live, Live Dive, Dashboard,
       Autopsy, then the Timurila rooms (Command, Markets, Evidence), All bots, News and
       "More" — a palette (Ctrl+K) that lists every page, panel, button and instrument;
     · the three rows of chart buttons become one "Layers" panel with scenes;
     · the top bar keeps the symbol, the timeframes and the account; everything else moves
       into Candles, Indicators, Layers, Tools and View.
   Buttons are MOVED, never copied, so each keeps the handler Classic gave it. Switching the
   face off puts every one of them back where it was. Because it is the same page, switching
   faces never stops a running bot.

   This file adds no way to place, change or close an order. */
(function(){
'use strict';
const H = document.documentElement, KEY = 'astra_face';
/* before the first paint, so nothing flashes. A torn-off panel window keeps the Classic look. */
const isPanel = !!new URLSearchParams(location.search).get('panel');
try { if (!isPanel && localStorage.getItem(KEY) === 'tm') H.dataset.face = 'tm'; } catch(e){}
{ const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=Inter:wght@400;500;600&display=swap'; document.head.appendChild(l); }

const ICON = {
  chart: 'M3 3v18h18M7 15l4-5 3 3 5-7', deep: 'M11 4a7 7 0 1 0 4.9 12l4.6 4.5M8.5 13v-2.5M11 13V8M13.5 13v-1.5', live: 'M2 12h4l3-8 4 16 3-8h6',
  livedive: 'M2 11h3l2-6 4 12 2-6h2M18 15a3 3 0 1 0 .01 0M20.2 20.2 22 22', dash: 'M4 4h7v7H4zM13 4h7v4h-7zM13 11h7v9h-7zM4 14h7v6H4z', autopsy: 'M3 10a9 9 0 1 1 2 6M3 4v6h6M12 8v4l3 2',
  home: 'M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0M3 12c0-2.5 4-4.5 9-4.5s9 2 9 4.5-4 4.5-9 4.5-9-2-9-4.5z', markets: 'M7 4v16M5 8h4v7H5zM17 3v18M15 6h4v9h-4z',
  lab: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3M7.5 15h9', bots: 'M8 4h8a4 4 0 0 1 4 4v8a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4zM9 10v2M15 10v2M9 16h6',
  news: 'M4 5h13v14H6a2 2 0 0 1-2-2zM17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5', more: 'M5 5h.01M12 5h.01M19 5h.01M5 12h.01M12 12h.01M19 12h.01M5 19h.01M12 19h.01M19 19h.01',
  layers: 'M12 3 3 8l9 5 9-5zM3 13l9 5 9-5', tools: 'M14 6a4 4 0 0 0 5 5l-9 9a2.1 2.1 0 0 1-3-3zM5 5l3 3', view: 'M3 5h18v12H3zM8 21h8M12 17v4', candles: 'M7 4v16M5 8h4v7H5zM17 3v18M15 6h4v9h-4z',
};
const svg = (d, w) => '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + (w || 1.7) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
const $ = id => document.getElementById(id), esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const Face = window.Face = {
  ROOMS: [
    { id: 'chart', label: 'Chart', kind: 'chart', tip: 'The chart, full size' },
    { id: 'deep', label: 'Deep Dive', kind: 'bot', bot: 'explorer', info: 'deep', tip: 'Deep Dive: every trade, sliced. Click any bar.' },
    { id: 'live', label: 'Live', kind: 'bot', bot: 'liveManual', info: 'live', tip: 'Your real account at a glance; the live desk is one click away' },
    { id: 'livedive', label: 'Live Dive', kind: 'bot', bot: 'livedive', info: 'livedive', tip: 'Live Deep Dive: real trades, sliced' },
    { id: 'dash', label: 'Dashboard', kind: 'bot', bot: 'dash', info: 'dash', tip: 'Every bot at a glance' },
    { id: 'autopsy', label: 'Autopsy', kind: 'native', tip: 'Why each trade won or lost: trend, agreement, shock' },
    { sep: true },
    { id: 'home', label: 'Command', kind: 'frame', hash: 'command', tip: 'Market map, account and autopilot' },
    { id: 'markets', label: 'Markets', kind: 'frame', hash: 'markets', tip: 'Radar and the chart studio' },
    { id: 'lab', label: 'Evidence', kind: 'frame', hash: 'lab', tip: 'What has been tested, and how it scored' },
    { id: 'bots', label: 'All bots', kind: 'tab', tab: 'bots', tip: 'Every bot and page' },
    { id: 'news', label: 'News', kind: 'tab', tab: 'news', tip: 'News and alerts' },
  ],
  room: 'chart', moved: [], built: false,
  on(){ return H.dataset.face === 'tm'; },

  /* ---------- switching the face ---------- */
  set(on){
    if (isPanel) return;
    try { localStorage.setItem(KEY, on ? 'tm' : 'classic'); } catch(e){}
    if (on){ H.dataset.face = 'tm'; this.build(); this.arrange(); this.go(localStorage.getItem('astra_face_room') || 'chart', true); }
    else { this.closePops(); this.restore(); delete H.dataset.face; delete H.dataset.tmroom; delete H.dataset.tmlayers; delete H.dataset.tmview; const st = $('tmStage'); if (st) st.hidden = true; if ($('tmViewSwitch')) $('tmViewSwitch').hidden = true;
      const bp = $('bottomPanel'); if (bp && this._wasCollapsed != null) bp.classList.toggle('collapsed', this._wasCollapsed); }
    this.measure(); setTimeout(() => { window.dispatchEvent(new Event('resize')); try { Draw.redraw(); } catch(e){} }, 60);
    if (typeof toast === 'function') toast(on ? 'Timurila look on. Everything Classic does is still here: press Ctrl+K to find any of it.' : 'Classic look on. Nothing else changed.', 'info');
  },
  toggle(){ this.set(!this.on()); },

  /* ---------- the dock, the stage, the palette (made once, shown by the stylesheet) ---------- */
  build(){
    if (this.built) return; this.built = true;
    const dock = document.createElement('nav'); dock.id = 'tmDock'; dock.setAttribute('aria-label', 'Rooms');
    dock.innerHTML = '<div class="tmLogo" title="Timurila"><i></i><i></i><b></b></div>' +
      this.ROOMS.map(r => r.sep ? '<span class="tmSep"></span>' : '<button type="button" data-room="' + r.id + '" title="' + esc(r.tip) + '">' + svg(ICON[r.id]) + '<span>' + r.label + '</span><em hidden></em></button>').join('') +
      '<span class="tmGrow"></span><button type="button" id="tmMore" title="Everything: pages, panels, buttons, instruments (Ctrl+K)">' + svg(ICON.more, 2.6) + '<span>More</span></button>' +
      '<button type="button" id="tmClassic" title="Back to the Classic look. Nothing else changes.">Classic</button>';
    document.body.appendChild(dock);
    dock.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.room) this.go(b.dataset.room); else if (b.id === 'tmMore') this.palette(true); else if (b.id === 'tmClassic') this.set(false); });
    const stage = document.createElement('div'); stage.id = 'tmStage'; stage.hidden = true; stage.innerHTML = '<iframe id="tmFrame" title="Timurila" hidden></iframe><div id="tmNative" hidden></div><div id="tmInfo" hidden></div><div id="tmFail" hidden></div>'; document.body.appendChild(stage);
    /* on a Classic page that also has an infographic view: the way back to it */
    const vs = document.createElement('button'); vs.id = 'tmViewSwitch'; vs.type = 'button'; vs.hidden = true; vs.textContent = '◧ Infographic view'; vs.title = 'Back to the infographic view of this page'; vs.onclick = () => this.view(this.room, 'info'); document.body.appendChild(vs);
    const pal = document.createElement('div'); pal.id = 'tmPal'; pal.hidden = true; pal.innerHTML = '<div class="tmPalBox" role="dialog" aria-label="Find anything"><input id="tmPalIn" type="text" placeholder="Find a page, a bot, a button or an instrument…" autocomplete="off" spellcheck="false"><div id="tmPalList"></div><p>↑ ↓ to move · Enter to open · Esc to close</p></div>'; document.body.appendChild(pal);
    pal.addEventListener('mousedown', e => { if (e.target === pal) this.palette(false); });
    $('tmPalIn').addEventListener('input', () => this.palFill()); $('tmPalIn').addEventListener('keydown', e => this.palKey(e));
    $('tmPalList').addEventListener('click', e => { const b = e.target.closest('[data-i]'); if (b) this.palRun(+b.dataset.i); });
    /* top-bar entries of the new look */
    const mk = (id, label, icon, title) => { const b = document.createElement('button'); b.className = 'tbtn tmOnly'; b.id = id; b.type = 'button'; b.title = title; b.innerHTML = svg(icon) + '<span>' + label + '</span>'; return b; };
    const ind = $('indBtn'), bar = $('topbar');
    this.bCandles = mk('tmCandleBtn', 'Candles', ICON.candles, 'Candle shape and colours'); this.bLayers = mk('tmLayersBtn', 'Layers', ICON.layers, 'Everything drawn on the chart, in one place');
    this.bTools = mk('tmToolsBtn', 'Tools', ICON.tools, 'Alerts, replay, compare, markets, saved workspaces'); this.bView = mk('tmViewBtn', 'View', ICON.view, 'Windows, maximise, screenshot, light or dark, full screen');
    bar.insertBefore(this.bCandles, ind); ind.after(this.bLayers, this.bTools); bar.appendChild(this.bView);
    this.bCandles.onclick = () => this.pop('candles', this.bCandles); this.bTools.onclick = () => this.pop('tools', this.bTools); this.bView.onclick = () => this.pop('view', this.bView);
    ind.addEventListener('click', e => { if (this.on() && !this._indPass){ e.preventDefault(); e.stopImmediatePropagation(); this.closePops(); this.indOpen(true); } }, true);
    this.bLayers.onclick = () => { H.dataset.tmlayers = H.dataset.tmlayers === '1' ? '' : '1'; this.bLayers.classList.toggle('on', H.dataset.tmlayers === '1'); this.layersSync(); };
    for (const id of ['tmPopCandles', 'tmPopTools', 'tmPopView']){ const p = document.createElement('div'); p.id = id; p.className = 'tmPop'; p.hidden = true; document.body.appendChild(p); }
    document.addEventListener('mousedown', e => { if (!e.target.closest('.tmPop, #tmCandleBtn, #tmToolsBtn, #tmViewBtn, #winMenu, .modal')) this.closePops(); });
    document.addEventListener('keydown', e => {
      if (!this.on()) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); e.stopPropagation(); this.palette($('tmPal').hidden); }
      else if (e.key === 'Escape'){ if (!$('tmPal').hidden){ this.palette(false); e.stopPropagation(); } else if ($('tmInd') && !$('tmInd').hidden){ this.indOpen(false); e.stopPropagation(); } else this.closePops(); }
    }, true);
    window.addEventListener('resize', () => this.measure());
    document.addEventListener('candlestyle', () => this.candleLabel());
    setInterval(() => this.badges(), 5000);
  },

  /* ---------- moving Classic's own buttons into their new places, and back ---------- */
  move(el, into, label){ if (!el || !into) return; this.moved.push({ el, parent: el.parentNode, next: el.nextSibling, label: el.dataset.tml }); if (label) el.dataset.tml = label; into.appendChild(el); },
  arrange(){
    if (this.moved.length) return;
    { const bp = $('bottomPanel'); if (bp) this._wasCollapsed = bp.classList.contains('collapsed'); }   /* so the Classic look gets its lower panel back as it was */
    const tools = $('tmPopTools'), view = $('tmPopView');
    tools.innerHTML = '<h4>Tools</h4>'; view.innerHTML = '<h4>View</h4>';
    for (const [id, label] of [['alertBtn', 'New price alert'], ['replayBtn', 'Bar replay'], ['cmpBtn', 'Compare another instrument'], ['mktBtn', 'Markets: what I watch'], ['layoutsBtn', 'Saved workspaces'], ['chartReviewBtn', 'Inspect or replay this chart']]) this.move($(id), tools, label);
    for (const [id, label] of [['layoutSeg', 'Charts on screen'], ['winBtn', 'Open a panel in its own window'], ['maxBtn', 'Maximise the chart'], ['shotBtn', 'Screenshot the chart'], ['themeBtn', 'Light or dark'], ['fsBtn', 'Full screen']]) this.move($(id), view, label);
    /* the chart strip becomes the Layers panel; the manual BUY / SELL buttons stay in sight on the top bar */
    const strip = $('chartLabelBar'), acts = strip && strip.querySelector('.chartTradeActions');
    if (acts) { this.moved.push({ el: acts, parent: acts.parentNode, next: acts.nextSibling }); this.bTools.after(acts); }
    if (strip){ this.moved.push({ el: strip, parent: strip.parentNode, next: strip.nextSibling }); document.body.appendChild(strip);
      if (!$('tmLayersHead')){ const h = document.createElement('div'); h.id = 'tmLayersHead'; strip.prepend(h); h.addEventListener('click', e => this.layersClick(e)); }
      if (!this._obs){ this._obs = new MutationObserver(() => { clearTimeout(this._lt); this._lt = setTimeout(() => this.layersSync(), 120); }); this._obs.observe(strip, { subtree: true, attributes: true, attributeFilter: ['class'] }); } }
    this.candleLabel(); this.layersSync(); this.sideNames();
  },
  SIDE: { watch: 'Watchlist', sbots: 'Bots', book: 'Depth', ind: 'Indicators', heat: 'Time heatmap', alerts: 'Alerts', portfolio: 'Paper account', ai: 'Observer', notes: 'Notes' },
  sideNames(){ const st = $('sideTabs'); if (!st) return; const set = () => { st.querySelectorAll('[data-tab]').forEach(b => { b.dataset.tml = this.SIDE[b.dataset.tab] || (b.textContent || '').trim(); }); const a = st.querySelector('[data-tab].active'); st.dataset.tml = a ? a.dataset.tml : ''; };
    set(); if (!this._sideObs){ this._sideObs = new MutationObserver(set); this._sideObs.observe(st, { subtree: true, attributes: true, attributeFilter: ['class'], childList: true }); } },
  restore(){ for (const m of this.moved.reverse()){ try { if (m.label === undefined) delete m.el.dataset.tml; else m.el.dataset.tml = m.label; m.parent.insertBefore(m.el, m.next && m.next.parentNode === m.parent ? m.next : null); } catch(e){} } this.moved = []; },

  /* ---------- rooms ---------- */
  /* Dashboard, Deep Dive and Live each have two views: the infographic one and the full Classic page */
  viewOf(id){ try { return localStorage.getItem('astra_face_view_' + id) === 'classic' ? 'classic' : 'info'; } catch(e){ return 'info'; } },
  view(id, v){ try { localStorage.setItem('astra_face_view_' + id, v); } catch(e){} this.go(id); },
  measure(){ const m = $('main'), s = $('statusbar'); if (!m) return; H.style.setProperty('--tm-top', Math.round(m.getBoundingClientRect().top) + 'px'); H.style.setProperty('--tm-bot', (s ? Math.round(s.getBoundingClientRect().height) : 26) + 'px'); },
  openTab(tab){ const bp = $('bottomPanel'), b = document.querySelector('#botTabs [data-tab="' + tab + '"]'); if (!bp || !b) return;
    try { if (H.dataset.chartmax === '1' && typeof App !== 'undefined' && App.setMax) App.setMax(false); } catch(e){}
    bp.classList.remove('collapsed'); if (!b.classList.contains('active')) b.click(); bp.classList.remove('collapsed');
    if (tab === 'heatmap') try { Heat.show(); } catch(e){} },
  go(id, quiet){
    if (!this.on()) return; const r = this.ROOMS.find(x => x.id === id) || this.ROOMS[0]; this.room = r.id; this.closePops(); this.measure();
    try { localStorage.setItem('astra_face_room', r.kind === 'chart' || r.kind === 'bot' ? r.id : 'chart'); } catch(e){}
    document.querySelectorAll('#tmDock [data-room]').forEach(b => b.classList.toggle('on', b.dataset.room === r.id));
    const stage = $('tmStage'), frame = $('tmFrame'), nat = $('tmNative'), inf = $('tmInfo'), bp = $('bottomPanel'), info = !!r.info && this.viewOf(r.id) === 'info' && typeof Info !== 'undefined';
    H.dataset.tmview = r.info && !info ? 'classic' : ''; $('tmViewSwitch').hidden = true;
    if (r.kind === 'chart'){ H.dataset.tmroom = 'chart'; stage.hidden = true; if (bp && !quiet) bp.classList.add('collapsed'); setTimeout(() => window.dispatchEvent(new Event('resize')), 40); }
    else if ((r.kind === 'tab' || r.kind === 'bot') && !info){ H.dataset.tmroom = 'panel'; stage.hidden = true; $('tmViewSwitch').hidden = !r.info; this.openTab(r.kind === 'bot' ? 'bots' : r.tab);
      if (r.bot) setTimeout(() => { const b = document.querySelector('#botNav [data-bot="' + r.bot + '"]'); if (b && !b.classList.contains('active')) b.click(); }, 80); }
    else { H.dataset.tmroom = 'stage'; stage.hidden = false; stage.classList.remove('in'); void stage.offsetWidth; stage.classList.add('in');
      $('tmFail').hidden = true;
      if (info){ frame.hidden = true; nat.hidden = true; inf.hidden = false; Info.open(inf, r.info); }
      else if (r.kind === 'frame'){ nat.hidden = true; inf.hidden = true; frame.hidden = false; const want = 'timurila/index.html?embed=1#' + r.hash;
        const fail = $('tmFail'); fail.hidden = true;
        /* did Timurila really arrive? If the data service is not answering, say so and offer to try again, rather than a blank room */
        const alive = () => { try { return !!frame.contentDocument.querySelector('.app'); } catch(e){ return false; } };
        const check = () => { if (this.room !== r.id || frame.hidden) return; if (alive()) return; frame.hidden = true; frame.dataset.loaded = ''; fail.hidden = false; fail.innerHTML = '<div><b>This room could not be loaded</b><p>The page that serves ASTRA’s files is not answering, so Timurila’s ' + esc(r.label) + ' room did not arrive. The chart and your bots are not affected.</p><button type="button" id="tmRetry">Try again</button></div>'; $('tmRetry').onclick = () => this.go(r.id); };
        if (!frame.dataset.loaded || !alive()){ frame.onload = () => setTimeout(check, 300); frame.src = frame.dataset.loaded ? 'timurila/index.html?embed=1&r=' + Date.now() + '#' + r.hash : want; frame.dataset.loaded = '1'; clearTimeout(this._ft); this._ft = setTimeout(check, 7000); }
        else try { frame.contentWindow.location.hash = '#' + r.hash; } catch(e){ frame.src = want; } }
      else { frame.hidden = true; inf.hidden = true; nat.hidden = false; if (typeof Autopsy !== 'undefined'){ if (!nat.dataset.open){ nat.dataset.open = '1'; Autopsy.open(nat); } else Autopsy.collect().then(() => { if (Autopsy.want){ const w = Autopsy.want; Autopsy.want = null; Autopsy.filter = { src: 'all', bot: '', out: 'all' }; Autopsy.select(w); } else Autopsy.paint(); }); } } }
  },
  panel(tab){ if (!this.on()) return; this.room = ''; H.dataset.tmroom = 'panel'; H.dataset.tmview = ''; $('tmViewSwitch').hidden = true; $('tmStage').hidden = true; document.querySelectorAll('#tmDock [data-room]').forEach(b => b.classList.remove('on')); this.openTab(tab); },
  bot(id){ this.panel('bots'); setTimeout(() => { const b = document.querySelector('#botNav [data-bot="' + id + '"]'); if (b) b.click(); }, 80); },
  badges(){ if (!this.on()) return; try { const b = document.querySelector('#tmDock [data-room="live"] em'); if (b && typeof Live !== 'undefined' && Live.book){ const n = (Live.book.open || []).length, d = typeof Live.dayPnl === 'function' ? Live.dayPnl() : 0; b.hidden = !n && !d; b.textContent = n ? String(n) : ''; b.className = d > 0 ? 'up' : d < 0 ? 'dn' : ''; b.title = n + ' live position' + (n === 1 ? '' : 's') + ' open'; } } catch(e){} },

  /* ---------- pop-overs ---------- */
  closePops(){ document.querySelectorAll('.tmPop').forEach(p => p.hidden = true); document.querySelectorAll('.tmOnly.open').forEach(b => b.classList.remove('open')); },
  pop(which, btn){
    const p = $(which === 'candles' ? 'tmPopCandles' : which === 'tools' ? 'tmPopTools' : 'tmPopView'), was = !p.hidden; this.closePops(); if (was) return;
    if (which === 'candles') this.candleFill(p);
    p.hidden = false; btn.classList.add('open'); const r = btn.getBoundingClientRect(), w = p.offsetWidth; p.style.top = (r.bottom + 8) + 'px'; p.style.left = Math.max(84, Math.min(innerWidth - w - 10, r.left)) + 'px';
  },
  candleLabel(){ if (!this.bCandles || typeof CandleStyles === 'undefined') return; const s = CandleStyles.SHAPES.find(x => x[0] === CandleStyles.shape()); this.bCandles.querySelector('span').textContent = s ? s[1] : 'Candles'; },
  candleFill(p){
    if (typeof CandleStyles === 'undefined'){ p.innerHTML = '<h4>Candles</h4><p class="tmNote">Candle shapes are not loaded.</p>'; return; }
    const cur = CandleStyles.shape(), pal = CandleStyles.palette();
    p.innerHTML = '<h4>Candle shape</h4><div class="tmShapes">' + CandleStyles.SHAPES.map(s => '<button type="button" data-shape="' + s[0] + '" class="' + (s[0] === cur ? 'on' : '') + '" title="' + esc(s[3]) + '"><canvas width="132" height="72"></canvas><span>' + s[1] + '</span></button>').join('') + '</div>' +
      '<h4>Colours</h4><div class="tmPals">' + CandleStyles.PALETTES.map(x => '<button type="button" data-pal="' + x[0] + '" class="' + (x[0] === pal ? 'on' : '') + '"><i style="background:' + (x[2] || CFG.UP) + '"></i><i style="background:' + (x[3] || CFG.DOWN) + '"></i><span>' + x[1] + '</span></button>').join('') + '</div>' +
      '<p class="tmNote">Hollow, Trend, Volume and Power recolour real candles: every price stays where it was. Heikin Ashi shows averaged prices.</p>' +
      (typeof Lens !== 'undefined' ? '<h4>Candles without a time axis · in their own window</h4><div class="tmPals"><button type="button" data-lens="off" class="' + (Lens.cfg().on ? '' : 'on') + '"><span>Off</span></button>' + Lens.TYPES.map(t => '<button type="button" data-lens="' + t[0] + '" class="' + (Lens.cfg().on && Lens.cfg().type === t[0] ? 'on' : '') + '" title="' + esc(Lens.ABOUT[t[0]]) + '"><span>' + t[1] + '</span></button>').join('') + '</div><p class="tmNote">These open as a separate lens over the chart, so your drawings, alerts and indicators are not moved.</p>' : '');
    p.onclick = e => { const a = e.target.closest('[data-shape]'), b = e.target.closest('[data-pal]'), l = e.target.closest('[data-lens]'); if (a) CandleStyles.set(a.dataset.shape); else if (b) CandleStyles.setPalette(b.dataset.pal); else if (l){ if (l.dataset.lens === 'off'){ if (Lens.cfg().on) Lens.toggle(); } else Lens.set('type', l.dataset.lens); } else return; this.candleFill(p); };
    const [UP, DN] = CandleStyles.colors(); p.querySelectorAll('[data-shape] canvas').forEach(cv => this.thumb(cv, cv.parentElement.dataset.shape, UP, DN));
  },
  /* a small sample of each shape */
  thumb(cv, sh, UP, DN){
    const c = cv.getContext('2d'), W = cv.width, Hh = cv.height, D = [[30, 38, 28, 36, 3], [36, 44, 34, 42, 6], [42, 45, 37, 39, 4], [39, 41, 31, 33, 9], [33, 40, 32, 39, 5], [39, 50, 38, 48, 12], [48, 54, 46, 52, 8], [52, 55, 47, 49, 5], [49, 58, 48, 56, 10]];
    const n = D.length, X = i => 10 + (i + 0.5) * (W - 20) / n, Y = v => Hh - 8 - (v - 26) / 34 * (Hh - 16), bw = (W - 20) / n * 0.6, rgba = (h, a) => CandleStyles.rgba(h, a); c.clearRect(0, 0, W, Hh); c.lineWidth = 1.5;
    if (['line', 'step', 'area', 'baseline'].includes(sh)){ const base = Y(42); c.beginPath(); D.forEach((d, i) => { const x = X(i), y = Y(d[3]); if (!i) c.moveTo(x, y); else if (sh === 'step'){ c.lineTo(x, Y(D[i - 1][3])); c.lineTo(x, y); } else c.lineTo(x, y); });
      if (sh === 'baseline'){ c.save(); c.beginPath(); c.rect(0, 0, W, base); c.clip(); c.beginPath(); D.forEach((d, i) => i ? c.lineTo(X(i), Y(d[3])) : c.moveTo(X(i), Y(d[3]))); c.strokeStyle = UP; c.lineWidth = 2; c.stroke(); c.restore(); c.save(); c.beginPath(); c.rect(0, base, W, Hh); c.clip(); c.beginPath(); D.forEach((d, i) => i ? c.lineTo(X(i), Y(d[3])) : c.moveTo(X(i), Y(d[3]))); c.strokeStyle = DN; c.lineWidth = 2; c.stroke(); c.restore(); c.strokeStyle = 'rgba(124,139,168,.5)'; c.setLineDash([3, 3]); c.beginPath(); c.moveTo(6, base); c.lineTo(W - 6, base); c.stroke(); c.setLineDash([]); return; }
      c.strokeStyle = '#4FD8F7'; c.lineWidth = 2; c.stroke(); if (sh === 'area'){ c.lineTo(X(n - 1), Hh); c.lineTo(X(0), Hh); c.closePath(); c.fillStyle = 'rgba(79,216,247,.18)'; c.fill(); } return; }
    let d = D; if (sh === 'heikin' || sh === 'smooth'){ let po = null, pc = null; d = D.map(b => { const cl = (b[0] + b[1] + b[2] + b[3]) / 4, o = po == null ? (b[0] + b[3]) / 2 : (po + pc) / 2; po = o; pc = cl; return [o, Math.max(b[1], o, cl), Math.min(b[2], o, cl), cl, b[4]]; }); }
    d.forEach((b, i) => { const up = b[3] >= b[0], x = X(i); let col = up ? UP : DN, fill = col;
      if (sh === 'hollow'){ col = i && b[3] < d[i - 1][3] ? DN : UP; fill = up ? 'rgba(0,0,0,0)' : col; } else if (sh === 'trend'){ col = i < 3 ? UP : i < 4 ? DN : UP; fill = (col === UP) !== up ? rgba(col, 0.35) : col; }
      else if (sh === 'volume'){ fill = col = rgba(col, Math.max(0.25, Math.min(1, b[4] / 9))); } else if (sh === 'power'){ fill = col = rgba(col, Math.max(0.22, Math.min(1, Math.abs(b[3] - b[0]) / 8))); }
      c.strokeStyle = col; c.beginPath(); c.moveTo(x, Y(b[1])); c.lineTo(x, Y(b[2])); c.stroke();
      if (sh === 'bars'){ c.beginPath(); c.moveTo(x - bw / 2, Y(b[0])); c.lineTo(x, Y(b[0])); c.moveTo(x, Y(b[3])); c.lineTo(x + bw / 2, Y(b[3])); c.stroke(); return; }
      const y0 = Math.min(Y(b[0]), Y(b[3])), hh = Math.max(1.5, Math.abs(Y(b[0]) - Y(b[3]))); c.clearRect(x - bw / 2, y0, bw, hh); c.fillStyle = fill; c.fillRect(x - bw / 2, y0, bw, hh); if (sh === 'hollow') c.strokeRect(x - bw / 2 + 0.5, y0 + 0.5, bw - 1, hh - 1); });
  },

  /* ---------- the Layers panel (Classic's chart strip, restyled, with scenes on top) ---------- */
  STUDIO: [['zones', 'Support and resistance zones'], ['channel', 'Trend channel'], ['events', 'Bounces and breaks'], ['ma', 'Moving average'], ['signals', 'Signal labels'], ['range', 'Usual range ahead'],
           ['fvg', 'Fair value gaps', 'fvg'], ['ob', 'Order blocks', 'ob'], ['bos', 'Structure breaks', 'bos'], ['sweep', 'Liquidity sweeps', 'sweep'], ['div', 'RSI divergences', 'rsidiv']],
  verdict(id){ const R = window.TIMURILA_SIGNALS; if (!R || !id) return ''; const t = R.tests.filter(x => x.id === id); if (!t.length) return ''; return t.some(x => x.verdict === 'proven') ? 'proven' : t.some(x => x.verdict === 'leaning') ? 'leaning' : 'no edge'; },
  layersSync(){
    const h = $('tmLayersHead'); if (!h || !this.on() || typeof Studio === 'undefined') return; const c = Studio.overlay.cfg();
    h.innerHTML = '<div class="tmLH"><b>Layers</b><button type="button" data-lx="close" title="Close">✕</button></div>' +
      '<div class="tmScenes"><span>Scene</span><button type="button" data-scene="clean">Clean</button><button type="button" data-scene="studio">Studio</button><button type="button" data-scene="structure">Structure</button><button type="button" data-scene="all">Everything</button></div>' +
      '<div class="tmLGroup"><label class="tmSwitch big"><input type="checkbox" data-st="on"' + (c.on ? ' checked' : '') + '><i></i><span>Studio look</span></label>' +
      this.STUDIO.map(([k, name, ev]) => { const v = this.verdict(ev); return '<label class="tmSwitch' + (c.on ? '' : ' dim') + '"><input type="checkbox" data-st="' + k + '"' + (c[k] ? ' checked' : '') + '><i></i><span>' + name + '</span>' + (v ? '<em class="' + (v === 'no edge' ? 'no' : 'ok') + '" title="What the test of this signal found. A layer can still help you see the market.">' + v + '</em>' : '') + '</label>'; }).join('') + '</div>' +
      '<div class="tmLSub">More overlays</div>';
  },
  layersClick(e){
    const t = e.target; if (t.dataset.lx === 'close'){ H.dataset.tmlayers = ''; this.bLayers.classList.remove('on'); return; }
    if (t.dataset.st){ const c = Studio.overlay.cfg(); if (t.dataset.st === 'on'){ if (c.on !== t.checked) Studio.overlay.toggle(); } else { c[t.dataset.st] = t.checked; if (t.checked && !c.on){ Studio.overlay.save(c); Studio.overlay.toggle(); } else Studio.overlay.save(c); } this.layersSync(); return; }
    const s = t.dataset.scene; if (!s) return; e.preventDefault();
    /* a scene first switches every other overlay off, by pressing the buttons that are on */
    document.querySelectorAll('#chartLabelBar .chartTools .autoSrBtn.on').forEach(b => { if (b.id !== 'studioBtn') b.click(); });
    const sel = $('chartLabelMode'); if (sel && sel.value !== 'none'){ sel.value = 'none'; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    let c = Studio.overlay.cfg(); const keys = this.STUDIO.map(x => x[0]), want = s === 'clean' ? [] : s === 'studio' ? ['zones', 'channel', 'events', 'ma'] : s === 'structure' ? ['zones', 'fvg', 'ob', 'bos', 'sweep', 'div'] : keys;
    for (const k of keys) c[k] = want.includes(k); c.patWasOn = false; Studio.overlay.save(c); c = Studio.overlay.cfg();
    if ((s !== 'clean') !== c.on) Studio.overlay.toggle(); this.layersSync();
  },

  /* ---------- the Indicators gallery: every indicator as a small live example ---------- */
  FAM: [['all', 'All'], ['on', 'On the chart'], ['trend', 'Trend'], ['osc', 'Oscillators'], ['vol', 'Volume'], ['bw', 'Bill Williams'], ['pro', 'Advanced'], ['other', 'More']],
  famOf(d){ const id = d.id; if (/^pro_|^jm/.test(id)) return 'pro'; if (['alli', 'frac', 'ao', 'ac', 'gator', 'bwmfi'].includes(id)) return 'bw'; if (['vol', 'mfi', 'obv', 'ad', 'force'].includes(id)) return 'vol';
    if (['ema1', 'ema2', 'ema3', 'bb', 'env', 'kelt', 'donch', 'vwap', 'st', 'st_regime', 'psar', 'ichi', 'piv', 'ama', 'dema', 'tema', 'frama', 'vidya', 'srl'].includes(id)) return 'trend';
    if (['rsi', 'stoch', 'macd', 'cci', 'wpr', 'mom', 'dem', 'atr', 'sdev', 'adx', 'adxc'].includes(id)) return 'osc'; return d.kind === 'osc' ? 'osc' : 'other'; },
  indOpen(open){
    let p = $('tmInd');
    if (!p){ p = document.createElement('div'); p.id = 'tmInd'; p.hidden = true;
      p.innerHTML = '<div class="tmIndBox" role="dialog" aria-label="Indicators"><div class="tmIndHead"><b>Indicators</b><input id="tmIndQ" type="text" placeholder="Search: RSI, bands, volume…" autocomplete="off" spellcheck="false"><span class="tmIndFams" id="tmIndFams"></span><i></i><button type="button" data-ix="full" title="Classic’s full list: inputs, colours, windows">All settings…</button><button type="button" data-ix="close" title="Close">✕</button></div>' +
        '<div class="tmIndBody"><div class="tmIndGrid" id="tmIndGrid"></div><aside class="tmIndPrev"><canvas id="tmIndBig"></canvas><h3 id="tmIndName">Hover an indicator</h3><p id="tmIndNote">Each tile is the indicator drawn on the chart you have open. Hover one to see it larger; click to put it on the chart or take it off.</p><div class="tmIndAct"><button type="button" class="pri" data-ix="toggle" hidden></button><button type="button" data-ix="props" hidden>Inputs and colours…</button></div></aside></div></div>';
      document.body.appendChild(p);
      p.addEventListener('mousedown', e => { if (e.target === p) this.indOpen(false); });
      p.addEventListener('click', e => { const t = e.target.closest('[data-ind]'), x = e.target.closest('[data-ix]'), f = e.target.closest('[data-fam]');
        if (t) this.indToggle(t.dataset.ind); else if (f){ this._indFam = f.dataset.fam; this.indFill(); }
        else if (x){ const k = x.dataset.ix; if (k === 'close') this.indOpen(false); else if (k === 'toggle' && this._indSel) this.indToggle(this._indSel);
          else if (k === 'full' || k === 'props'){ const def = k === 'props' && this._indSel ? INDS.find(d => d.id === this._indSel) : null; this.indOpen(false); this._indPass = true; $('indBtn').click(); this._indPass = false;
            if (def) setTimeout(() => { const q = $('indSearch'); if (q){ q.value = def.label; q.dispatchEvent(new Event('input', { bubbles: true })); } }, 80); } } });
      const over = e => { const t = e.target.closest && e.target.closest('[data-ind]'); if (t) this.indHover(t.dataset.ind); };
      p.addEventListener('mouseover', over); p.addEventListener('focusin', over); $('tmIndQ').addEventListener('input', () => this.indFill());
    }
    p.hidden = !open; if (!open) return; this._indFam = this._indFam || 'all'; $('tmIndQ').value = ''; this.indFill(); setTimeout(() => $('tmIndQ').focus(), 30);
  },
  indFill(){
    const q = $('tmIndQ').value.trim().toLowerCase(), fam = this._indFam, S = Chart.settings || {}, isOn = d => !!(S[d.id] && S[d.id].on);
    $('tmIndFams').innerHTML = this.FAM.map(f => '<button type="button" data-fam="' + f[0] + '" class="' + (f[0] === fam ? 'on' : '') + '">' + f[1] + (f[0] === 'on' ? ' ' + INDS.filter(isOn).length : '') + '</button>').join('');
    const list = INDS.filter(d => (fam === 'all' || (fam === 'on' ? isOn(d) : this.famOf(d) === fam)) && (!q || (d.label + ' ' + d.id + ' ' + (d.note || '')).toLowerCase().includes(q)));
    /* its own short name first (rsi, macd), then a match in the name, then a match only in the description */
    if (q){ const rank = d => d.id === q ? 0 : d.label.toLowerCase().includes(q) ? 1 : d.id.toLowerCase().includes(q) ? 2 : 3; list.sort((x, y) => rank(x) - rank(y)); }
    $('tmIndGrid').innerHTML = list.length ? list.map(d => '<button type="button" class="tmIndTile' + (isOn(d) ? ' on' : '') + '" data-ind="' + d.id + '"><canvas></canvas><span>' + esc(d.label) + '</span><em>on the chart</em></button>').join('') : '<div class="tmNote">No indicator matches.</div>';
    /* draw the examples a few at a time, so the list appears at once */
    const cvs = [...$('tmIndGrid').querySelectorAll('.tmIndTile')]; let i = 0; const run = () => { if ($('tmInd').hidden) return; for (let k = 0; k < 6 && i < cvs.length; k++, i++){ const def = INDS.find(d => d.id === cvs[i].dataset.ind); try { this.indDraw(cvs[i].querySelector('canvas'), def, false); } catch(e){} } if (i < cvs.length) setTimeout(run, 0); }; run();
    if (list.length && !list.some(d => d.id === this._indSel)) this.indHover(list[0].id);
  },
  indHover(id){ const def = INDS.find(d => d.id === id); if (!def) return; this._indSel = id; const on = !!(Chart.settings[id] && Chart.settings[id].on);
    $('tmIndName').textContent = def.label; const note = def.note || (def.kind === 'osc' ? 'Drawn in its own window under the price.' : 'Drawn on the price itself.'); $('tmIndNote').textContent = note.length > 360 ? note.slice(0, 357) + '…' : note;
    const t = $('tmInd').querySelector('[data-ix="toggle"]'); t.hidden = false; t.textContent = on ? 'Take it off the chart' : 'Put it on the chart'; t.classList.toggle('off', on); $('tmInd').querySelector('[data-ix="props"]').hidden = false;
    $('tmIndGrid').querySelectorAll('.tmIndTile').forEach(x => x.classList.toggle('sel', x.dataset.ind === id)); try { this.indDraw($('tmIndBig'), def, true); } catch(e){} },
  indToggle(id){ const c = Chart.settings[id]; if (!c) return; c.on = !c.on; try { lsSet('astra_ind', Chart.settings); Chart.renderAll(); } catch(e){ console.warn('indicator', e); }
    const t = $('tmIndGrid').querySelector('[data-ind="' + id + '"]'); if (t) t.classList.toggle('on', c.on); this.indHover(id);
    const f = $('tmIndFams').querySelector('[data-fam="on"]'); if (f) f.textContent = 'On the chart ' + INDS.filter(d => Chart.settings[d.id] && Chart.settings[d.id].on).length; },
  /* the indicator's own code, run on the candles of the open chart */
  indData(def){ const v = Chart.view(), n = v.length; if (n < 60) return null; const key = STORE.symbol + '|' + STORE.tf + '|' + n; if (this._indKey !== key){ this._indKey = key; this._indC = {}; }
    if (this._indC[def.id] !== undefined) return this._indC[def.id];
    const win = v.slice(-340), cfg = Object.assign({}, def.def, Chart.settings[def.id] || {}), ctx = { v: win, closes: win.map(c => c.close), line: arr => Chart.lineData(arr, win), srcOf: c => IND.src(win, (c && c.src) || 'close') }; let specs = null;
    try { specs = def.build(ctx, cfg) || []; } catch(e){ specs = null; }
    return (this._indC[def.id] = specs && specs.length ? { win, specs, cfg } : null); },
  indDraw(cv, def, big){
    const D = this.indData(def), dpr = window.devicePixelRatio || 1, W = cv.clientWidth || 176, Hh = cv.clientHeight || 84; cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
    if (!D){ c.fillStyle = '#5C6F92'; c.font = '11px Inter, sans-serif'; c.fillText('needs more candles for an example', 8, Hh / 2); return; }
    const N = big ? 120 : 64, win = D.win, a = Math.max(0, win.length - N), n = win.length - a, idx = new Map(); for (let i = a; i < win.length; i++) idx.set(win[i].time, i - a);
    const X = k => 4 + (k + 0.5) * (W - 8) / n, bw = Math.max(1, (W - 8) / n * 0.62), osc = def.kind === 'osc', split = osc ? 0.48 : 1, pH = Hh * split, onPrice = s => !osc && !s.scale && s.type !== 'hist';
    let lo = Infinity, hi = -Infinity; for (let i = a; i < win.length; i++){ lo = Math.min(lo, win[i].low); hi = Math.max(hi, win[i].high); } const sp = hi - lo || 1;
    for (const s of D.specs) if (onPrice(s)) for (const p of s.data || []) if (idx.has(p.time) && p.value != null && p.value > lo - sp * 0.4 && p.value < hi + sp * 0.4){ lo = Math.min(lo, p.value); hi = Math.max(hi, p.value); }
    const Yp = p => 4 + (hi - p) / (hi - lo || 1) * (pH - 8), al = osc ? 0.55 : 0.4;
    for (let i = a; i < win.length; i++){ const b = win[i], x = X(i - a), up = b.close >= b.open; c.strokeStyle = c.fillStyle = up ? 'rgba(61,220,151,' + al + ')' : 'rgba(255,107,122,' + al + ')'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, Yp(b.high)); c.lineTo(x, Yp(b.low)); c.stroke(); c.fillRect(x - bw / 2, Math.min(Yp(b.open), Yp(b.close)), bw, Math.max(1, Math.abs(Yp(b.open) - Yp(b.close)))); }
    const col = s => (D.cfg.colors && D.cfg.colors[s.key]) || s.color || ((def.parts || []).find(p => p.key === s.key) || {}).color || '#4FD8F7';
    const spec = (s, Y, base) => { const color = col(s);
      if (s.type === 'hist'){ for (const p of s.data || []){ const k = idx.get(p.time); if (k == null || p.value == null || !isFinite(p.value)) continue; c.fillStyle = p.color || color; const y = Y(p.value); c.fillRect(X(k) - bw / 2, Math.min(y, base), bw, Math.max(1, Math.abs(base - y))); } return; }
      c.strokeStyle = color; c.fillStyle = color; c.lineWidth = big ? 1.9 : 1.3; c.lineJoin = 'round';
      if (s.dots){ for (const p of s.data || []){ const k = idx.get(p.time); if (k == null || p.value == null) continue; c.beginPath(); c.arc(X(k), Y(p.value), big ? 2.2 : 1.3, 0, 6.3); c.fill(); } return; }
      c.beginPath(); let prev = -2; for (const p of s.data || []){ const k = idx.get(p.time); if (k == null || p.value == null || !isFinite(p.value)) continue; if (k === prev + 1) c.lineTo(X(k), Y(p.value)); else c.moveTo(X(k), Y(p.value)); prev = k; } c.stroke(); };
    const sep = D.specs.filter(s => !onPrice(s));
    if (sep.length){ let l2 = Infinity, h2 = -Infinity; for (const s of sep) for (const p of s.data || []) if (idx.has(p.time) && p.value != null && isFinite(p.value)){ l2 = Math.min(l2, p.value); h2 = Math.max(h2, p.value); }
      if (def.fixed && def.range){ l2 = def.range[0]; h2 = def.range[1]; } if (sep.some(s => s.type === 'hist')){ l2 = Math.min(l2, 0); h2 = Math.max(h2, 0); } if (!(h2 > l2)){ h2 = l2 + 1; }
      const y0 = osc ? pH + 6 : Hh * 0.74, y1 = Hh - 4, Y2 = v => y1 - (v - l2) / (h2 - l2) * (y1 - y0);
      if (osc){ c.strokeStyle = 'rgba(126,156,224,.2)'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, pH + 1.5); c.lineTo(W, pH + 1.5); c.stroke(); c.setLineDash([3, 4]);
        for (const lv of String(D.cfg.levels || '').split(',').map(Number).filter(x => isFinite(x) && x > l2 && x < h2)){ const y = Math.round(Y2(lv)) + 0.5; c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); } c.setLineDash([]); }
      for (const s of sep) spec(s, Y2, Y2(Math.max(l2, Math.min(h2, 0)))); }
    for (const s of D.specs) if (onPrice(s)) spec(s, Yp, 0);
  },

  /* ---------- the palette: every page, panel, button and instrument ---------- */
  items(){
    const out = [], txt = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
    for (const r of this.ROOMS) if (!r.sep) out.push({ label: r.label, hint: 'Room', run: () => this.go(r.id) });
    document.querySelectorAll('#botTabs [data-tab]').forEach(b => out.push({ label: txt(b).replace(/^◉\s*/, ''), hint: 'Panel', run: () => this.panel(b.dataset.tab) }));
    for (const id of ['marketClockBtn', 'tradeReviewBtn']){ const b = $(id); if (b) out.push({ label: txt(b), hint: 'Window', run: () => b.click() }); }
    document.querySelectorAll('#sideTabs [data-tab]').forEach(b => out.push({ label: txt(b) + ' (side panel)', hint: 'Side panel', run: () => { this.go('chart'); b.click(); } }));
    try { if (typeof BOTS !== 'undefined') for (const b of BOTS) out.push({ label: typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name, hint: 'Bot or page', run: () => this.bot(b.id) }); } catch(e){}
    for (const [id, label] of [['indBtn', 'Indicators'], ['alertBtn', 'New price alert'], ['replayBtn', 'Bar replay'], ['cmpBtn', 'Compare another instrument'], ['mktBtn', 'Markets: what I watch'], ['marketSettingsBtn', 'Market settings'], ['layoutsBtn', 'Saved workspaces'], ['winBtn', 'Open a panel in its own window'], ['maxBtn', 'Maximise the chart'], ['shotBtn', 'Screenshot the chart'], ['themeBtn', 'Light or dark'], ['fsBtn', 'Full screen'], ['symBtn', 'Change symbol'], ['chartReviewBtn', 'Inspect or replay this chart'], ['toolClear', 'Remove all drawings']]){ const b = $(id); if (b) out.push({ label, hint: 'Action', run: () => { if (['indBtn', 'symBtn', 'replayBtn', 'cmpBtn', 'alertBtn', 'chartReviewBtn', 'maxBtn', 'shotBtn'].includes(id)) this.go('chart'); b.click(); } }); }
    document.querySelectorAll('#lefttools [data-tool]').forEach(b => out.push({ label: 'Draw: ' + (b.title || b.dataset.tool).split('(')[0].split('—')[0].trim(), hint: 'Drawing tool', run: () => { this.go('chart'); b.click(); } }));
    document.querySelectorAll('#chartLabelBar .chartTools .autoSrBtn').forEach(b => out.push({ label: 'Layer: ' + txt(b).replace(/^[✦★⚡]\s*/, ''), hint: b.classList.contains('on') ? 'On · click to switch off' : 'Off · click to switch on', run: () => { this.go('chart'); b.click(); } }));
    if (typeof CandleStyles !== 'undefined') for (const s of CandleStyles.SHAPES) out.push({ label: 'Candles: ' + s[1], hint: 'Chart', run: () => { this.go('chart'); CandleStyles.set(s[0]); } });
    out.push({ label: 'Classic look', hint: 'Face', run: () => this.set(false) });
    try { for (const s of (Feed.bridge && Feed.bridge.symbols) || []) out.push({ label: s, hint: 'Instrument', sym: true, run: () => { this.go('chart'); typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(s) : App.setSymbol(s); } }); } catch(e){}
    return out;
  },
  palette(open){ const p = $('tmPal'); if (!p) return; p.hidden = !open; if (!open) return; this._items = this.items(); const i = $('tmPalIn'); i.value = ''; this.palFill(); setTimeout(() => i.focus(), 20); },
  palFill(){ const q = $('tmPalIn').value.trim().toLowerCase(), words = q.split(/\s+/).filter(Boolean);
    let list = this._items.filter(x => !words.length ? !x.sym : words.every(w => x.label.toLowerCase().includes(w) || x.hint.toLowerCase().includes(w)));
    if (words.length) list.sort((a, b) => (a.label.toLowerCase().startsWith(q) ? 0 : 1) - (b.label.toLowerCase().startsWith(q) ? 0 : 1));
    this._shown = list.slice(0, 60); this._pi = 0;
    $('tmPalList').innerHTML = this._shown.length ? this._shown.map((x, i) => '<button type="button" data-i="' + i + '" class="' + (i ? '' : 'on') + '"><span>' + esc(x.label) + '</span><em>' + esc(x.hint) + '</em></button>').join('') : '<div class="tmNote">Nothing matches.</div>'; },
  palKey(e){ const n = (this._shown || []).length; if (e.key === 'ArrowDown' || e.key === 'ArrowUp'){ e.preventDefault(); if (!n) return; this._pi = (this._pi + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; const bs = $('tmPalList').querySelectorAll('[data-i]'); bs.forEach((b, i) => b.classList.toggle('on', i === this._pi)); bs[this._pi].scrollIntoView({ block: 'nearest' }); }
    else if (e.key === 'Enter'){ e.preventDefault(); this.palRun(this._pi); } },
  palRun(i){ const x = (this._shown || [])[i]; if (!x) return; this.palette(false); try { x.run(); } catch(e){ console.warn('palette', e); } },
};

document.addEventListener('DOMContentLoaded', () => {
  if (isPanel) return;
  /* F12 switches the look (Classic's own shortcuts already use F1 to F10). Handled here as well as in the desktop menu,
     and stopped here, so the two can never both fire and cancel each other out. */
  document.addEventListener('keydown', e => { if (e.key === 'F12' && !e.ctrlKey && !e.altKey && !e.metaKey && !e.shiftKey){ e.preventDefault(); e.stopPropagation(); Face.toggle(); } }, true);
  /* Classic's own ways of moving about (its shortcut keys, the account pill, a click on a ticker) keep working in the new
     look: when Classic opens a page, the face shows that page; when Classic opens a chart, the face goes to the chart. */
  try {
    const MAP = { explorer: 'deep', livedive: 'livedive', liveManual: 'live', dash: 'dash' };
    if (typeof WorkspaceUI !== 'undefined' && WorkspaceUI.openBot && !WorkspaceUI._tmWrapped){ WorkspaceUI._tmWrapped = true;
      const ob = WorkspaceUI.openBot.bind(WorkspaceUI), oc = WorkspaceUI.openChart.bind(WorkspaceUI);
      WorkspaceUI.openBot = function(id){ const r = ob.apply(null, arguments); try { if (Face.on() && !Face._busy){ Face._busy = true; if (MAP[id]) Face.go(MAP[id]); else { Face.room = ''; H.dataset.tmroom = 'panel'; H.dataset.tmview = ''; $('tmStage').hidden = true; $('tmViewSwitch').hidden = true; document.querySelectorAll('#tmDock [data-room]').forEach(b => b.classList.remove('on')); const bp = $('bottomPanel'); if (bp) bp.classList.remove('collapsed'); } Face._busy = false; } } catch(e){ Face._busy = false; } return r; };
      WorkspaceUI.openChart = function(){ try { if (Face.on() && Face.room !== 'chart') Face.go('chart'); } catch(e){} return oc.apply(null, arguments); };
    }
    if (typeof Shortcuts !== 'undefined' && Shortcuts.tab && !Shortcuts._tmWrapped){ Shortcuts._tmWrapped = true; const ot = Shortcuts.tab.bind(Shortcuts); Shortcuts.tab = function(name){ if (Face.on()) return Face.panel(name); return ot.apply(null, arguments); }; }
  } catch(e){ console.warn('Face: could not follow Classic navigation', e); }
  /* a way in from the Classic look: one button beside the theme switch */
  const theme = $('themeBtn'); if (theme && !$('tmFaceBtn')){ const b = document.createElement('button'); b.className = 'tbtn'; b.id = 'tmFaceBtn'; b.type = 'button'; b.title = 'Switch to the Timurila look (F12 in the desktop app): a dock, one Layers panel, and every function still here. Click “Classic” in the dock, or press F12 again, to come back.'; b.innerHTML = '<i></i>New look'; const brand = $('brand'); if (brand) brand.after(b); else theme.before(b); b.onclick = () => Face.set(true); }
  if (Face.on()){ Face.build(); /* wait for Classic to finish adding its own buttons before moving them */ setTimeout(() => { Face.arrange(); Face.measure(); Face.go(localStorage.getItem('astra_face_room') || 'chart', true); Face.badges(); }, 900); }
});
})();
