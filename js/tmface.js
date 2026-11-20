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
    { id: 'deep', label: 'Deep Dive', kind: 'bot', bot: 'explorer', tip: 'Deep Dive: every paper trade, sliced' },
    { id: 'live', label: 'Live', kind: 'bot', bot: 'liveManual', tip: 'The live trading desk' },
    { id: 'livedive', label: 'Live Dive', kind: 'bot', bot: 'livedive', tip: 'Live Deep Dive: real trades, sliced' },
    { id: 'dash', label: 'Dashboard', kind: 'bot', bot: 'dash', tip: 'Every bot at a glance' },
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
    else { this.closePops(); this.restore(); delete H.dataset.face; delete H.dataset.tmroom; delete H.dataset.tmlayers; const st = $('tmStage'); if (st) st.hidden = true;
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
    const stage = document.createElement('div'); stage.id = 'tmStage'; stage.hidden = true; stage.innerHTML = '<iframe id="tmFrame" title="Timurila" hidden></iframe><div id="tmNative" hidden></div>'; document.body.appendChild(stage);
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
    this.bLayers.onclick = () => { H.dataset.tmlayers = H.dataset.tmlayers === '1' ? '' : '1'; this.bLayers.classList.toggle('on', H.dataset.tmlayers === '1'); this.layersSync(); };
    for (const id of ['tmPopCandles', 'tmPopTools', 'tmPopView']){ const p = document.createElement('div'); p.id = id; p.className = 'tmPop'; p.hidden = true; document.body.appendChild(p); }
    document.addEventListener('mousedown', e => { if (!e.target.closest('.tmPop, #tmCandleBtn, #tmToolsBtn, #tmViewBtn, #winMenu, .modal')) this.closePops(); });
    document.addEventListener('keydown', e => {
      if (!this.on()) return;
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k'){ e.preventDefault(); e.stopPropagation(); this.palette($('tmPal').hidden); }
      else if (e.key === 'Escape'){ if (!$('tmPal').hidden){ this.palette(false); e.stopPropagation(); } else this.closePops(); }
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
    this.candleLabel(); this.layersSync();
  },
  restore(){ for (const m of this.moved.reverse()){ try { if (m.label === undefined) delete m.el.dataset.tml; else m.el.dataset.tml = m.label; m.parent.insertBefore(m.el, m.next && m.next.parentNode === m.parent ? m.next : null); } catch(e){} } this.moved = []; },

  /* ---------- rooms ---------- */
  measure(){ const m = $('main'), s = $('statusbar'); if (!m) return; H.style.setProperty('--tm-top', Math.round(m.getBoundingClientRect().top) + 'px'); H.style.setProperty('--tm-bot', (s ? Math.round(s.getBoundingClientRect().height) : 26) + 'px'); },
  openTab(tab){ const bp = $('bottomPanel'), b = document.querySelector('#botTabs [data-tab="' + tab + '"]'); if (!bp || !b) return;
    try { if (H.dataset.chartmax === '1' && typeof App !== 'undefined' && App.setMax) App.setMax(false); } catch(e){}
    bp.classList.remove('collapsed'); if (!b.classList.contains('active')) b.click(); bp.classList.remove('collapsed');
    if (tab === 'heatmap') try { Heat.show(); } catch(e){} },
  go(id, quiet){
    if (!this.on()) return; const r = this.ROOMS.find(x => x.id === id) || this.ROOMS[0]; this.room = r.id; this.closePops(); this.measure();
    try { localStorage.setItem('astra_face_room', r.kind === 'chart' || r.kind === 'bot' ? r.id : 'chart'); } catch(e){}
    document.querySelectorAll('#tmDock [data-room]').forEach(b => b.classList.toggle('on', b.dataset.room === r.id));
    const stage = $('tmStage'), frame = $('tmFrame'), nat = $('tmNative'), bp = $('bottomPanel');
    if (r.kind === 'chart'){ H.dataset.tmroom = 'chart'; stage.hidden = true; if (bp && !quiet) bp.classList.add('collapsed'); setTimeout(() => window.dispatchEvent(new Event('resize')), 40); }
    else if (r.kind === 'tab' || r.kind === 'bot'){ H.dataset.tmroom = 'panel'; stage.hidden = true; this.openTab(r.kind === 'bot' ? 'bots' : r.tab);
      if (r.bot) setTimeout(() => { const b = document.querySelector('#botNav [data-bot="' + r.bot + '"]'); if (b && !b.classList.contains('active')) b.click(); }, 80); }
    else { H.dataset.tmroom = 'stage'; stage.hidden = false; stage.classList.remove('in'); void stage.offsetWidth; stage.classList.add('in');
      if (r.kind === 'frame'){ nat.hidden = true; frame.hidden = false; const want = 'timurila/index.html?embed=1#' + r.hash;
        if (!frame.dataset.loaded){ frame.src = want; frame.dataset.loaded = '1'; } else try { frame.contentWindow.location.hash = '#' + r.hash; } catch(e){ frame.src = want; } }
      else { frame.hidden = true; nat.hidden = false; if (typeof Autopsy !== 'undefined'){ if (!nat.dataset.open){ nat.dataset.open = '1'; Autopsy.open(nat); } else Autopsy.collect().then(() => Autopsy.paint()); } } }
  },
  panel(tab){ if (!this.on()) return; this.room = ''; H.dataset.tmroom = 'panel'; $('tmStage').hidden = true; document.querySelectorAll('#tmDock [data-room]').forEach(b => b.classList.remove('on')); this.openTab(tab); },
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
      '<p class="tmNote">Hollow, Trend, Volume and Power recolour real candles: every price stays where it was. Heikin Ashi shows averaged prices.</p>';
    p.onclick = e => { const a = e.target.closest('[data-shape]'), b = e.target.closest('[data-pal]'); if (a) CandleStyles.set(a.dataset.shape); else if (b) CandleStyles.setPalette(b.dataset.pal); else return; this.candleFill(p); };
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
  /* a way in from the Classic look: one button beside the theme switch */
  const theme = $('themeBtn'); if (theme && !$('tmFaceBtn')){ const b = document.createElement('button'); b.className = 'tbtn'; b.id = 'tmFaceBtn'; b.type = 'button'; b.title = 'Switch to the Timurila look: a dock, one Layers panel, and every function still here. Click “Classic” in the dock to come back.'; b.innerHTML = '✦ Timurila'; theme.before(b); b.onclick = () => Face.set(true); }
  if (Face.on()){ Face.build(); /* wait for Classic to finish adding its own buttons before moving them */ setTimeout(() => { Face.arrange(); Face.measure(); Face.go(localStorage.getItem('astra_face_room') || 'chart', true); Face.badges(); }, 900); }
});
})();
