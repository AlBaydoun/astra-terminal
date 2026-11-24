/* ASTRA / Timurila — more on the live chart, in the new look.

     GLOWING POINTS   every open position on the chart (paper and real) gets a glowing point where it
                      was entered, and its target and stop glow a few candles ahead of the newest one,
                      so they move on as new candles arrive. The position lines stay as they are; the
                      points only add light. They follow "Positions on chart" in Layers.
     PEN              free drawing on the chart: the same pens, colours and tips as the Replay and the
                      Inspect studios, stored with their drawings (one list per instrument and
                      timeframe, so a stroke drawn here is there in Replay and the other way round).
                      Press a stroke to move it, hide it or remove it; right-click removes it.
     FROM ENTRY       press a candle: entries at its top, middle and bottom, each tried as a buy and as
                      a sell with one exit rule, the signals that fired on it and how each did before.
     STUDIO VIEW      the chart studio of the Markets room (its layers, scenes, zoom) opened over the
                      chart on this very instrument and timeframe, without leaving the chart page.
     ORDER            the rows of Layers ▸ More overlays and the tabs of the side panel can be dragged
                      into any order; the names of the side tabs show in front of everything.

   While the pen or From entry is in hand, a press on the chart is caught before the chart sees it, so
   nothing on the chart (a position line, a drawing) can move by accident. Nothing here places,
   closes or changes an order. */
'use strict';
const ChartPlus = window.ChartPlus = {
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  on(){ return document.documentElement.dataset.face === 'tm'; },
  room(){ return document.documentElement.dataset.tmroom === 'chart'; },
  mode: '',                 /* '' | 'pen' | 'entry' */
  probe: null,
  rule: { stop: 1, tgt: 2, hold: 48, lots: 0.1 },
  ICON: {
    pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l4-1L19 8a2.1 2.1 0 0 0-3-3L5 16l-1 4Z"/><path d="M14 7l3 3"/></svg>',
    entry: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3v18M8 7h8v10H8zM4 8h3M4 12h3M4 16h3"/></svg>',
    lines: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 7h18M3 12h18" stroke-dasharray="3 3"/><path d="M3 17h18"/></svg>',
    studio: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M3 9h18M8 9v11M11 14l2-2 2 3 2-2"/></svg>' },

  init(){ if (this._init) return; const bar = this.$('tmMarkBar'), host = this.$('mainWrap'); if (!bar || !host || typeof Draw === 'undefined' || typeof Chart === 'undefined') return false; this._init = true;
    try { this.rule.lots = +(localStorage.getItem('astra_inspect_lots') || 0.1) || 0.1; } catch(e){}
    /* three more buttons on the chart's own bar */
    const mk = (id, icon, label, title) => { const b = document.createElement('button'); b.type = 'button'; b.id = id; b.title = title; b.innerHTML = icon + '<span>' + label + '</span>'; bar.appendChild(b); return b; };
    mk('tmPenBtn', this.ICON.pen, 'Pen', 'Draw on the chart with a pen. Press a stroke to move or remove it; right-click removes it. Esc puts the pen down.');
    const car = document.createElement('button'); car.type = 'button'; car.id = 'tmPenCar'; car.title = 'Choose the pen, its colour, tip and thickness'; car.textContent = '▾'; bar.appendChild(car);
    mk('tmEntryBtn', this.ICON.entry, 'From entry', 'Press a candle: what an entry at its top, middle or bottom would have done. Esc ends it.');
    mk('tmStudioBtn', this.ICON.studio, 'Studio view', 'This chart in the Markets studio: its layers, scenes and zoom');
    mk('tmLinesBtn', this.ICON.lines, 'Lines', 'Make the entry, stop and target lines invisible; their labels on the left stay');
    this.posLines();
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return;
      if (b.id === 'tmPenBtn') this.setMode(this.mode === 'pen' ? '' : 'pen');
      else if (b.id === 'tmPenCar'){ if (typeof Ink !== 'undefined') Ink.menu(b, cur => { if (Ink.isMagic(cur.pen)){ this.setMode(''); const m = this.$('tmMagicBtn'); if (m && !m.classList.contains('on')) m.click(); } else this.setMode('pen'); }); }
      else if (b.id === 'tmEntryBtn') this.setMode(this.mode === 'entry' ? '' : 'entry');
      else if (b.id === 'tmStudioBtn') this.studio(true);
      else if (b.id === 'tmLinesBtn') this.setLines(!this.linesHidden());
      else if (b.id === 'tmMagicBtn' && this.mode) this.setMode(''); });
    /* the layer for pen strokes and the From-entry marks */
    const cv = document.createElement('canvas'); cv.id = 'tmPenCv'; host.appendChild(cv); this.cv = cv;
    this.catchPresses();
    /* follow the chart: every redraw of the drawing layer repaints ours */
    if (!Draw._cpWrapped){ Draw._cpWrapped = true; const o = Draw.redraw.bind(Draw); Draw.redraw = (...a) => { const r = o(...a); this.later(); return r; }; }
    setInterval(() => this.later(), 1000);
    window.addEventListener('resize', () => this.later());
    try { BUS.on('symbol', () => { this.probe = null; this.closeCard(); this.studio(false); this.later(); }); BUS.on('tf', () => { this.probe = null; this.closeCard(); this.later(); }); } catch(e){}
    document.addEventListener('keydown', e => { if (!this.on() || !this.room() || e.ctrlKey || e.metaKey || e.altKey) return; const t = (e.target && e.target.tagName) || ''; if (/INPUT|TEXTAREA|SELECT/.test(t) || (e.target && e.target.isContentEditable)) return;
      if (e.key === 'Escape'){ if (this.$('tmStudioView')){ this.studio(false); e.stopPropagation(); } else if (this.mode){ this.setMode(''); e.stopPropagation(); } } }, true);
    new MutationObserver(() => { if (!this.room()){ this.studio(false); if (this.mode) this.setMode(''); } this.later(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tmroom', 'data-face', 'data-chartmax'] });
    this.layersOrder(); this.sideOrder(); this.sideTip(); this.zoomPresses(); this.viewOpts(); this.firstTab();
    this.later(); return true; },

  /* ---------- the position lines: hidden or shown; while hidden they cannot be pressed or dragged either ---------- */
  LNKEY: 'astra_poslines_hidden',
  linesHidden(){ try { return this.on() && localStorage.getItem(this.LNKEY) === '1'; } catch(e){ return false; } },
  setLines(hide){ try { localStorage.setItem(this.LNKEY, hide ? '1' : ''); } catch(e){} this.linesBtn(); try { Draw.redraw(); } catch(e){} if (typeof toast === 'function') toast(hide ? 'Position lines invisible: their labels stay (drag a label to move a stop or a target). Press Lines to bring them back.' : 'Position lines visible again', 'info'); },
  linesBtn(){ const b = this.$('tmLinesBtn'), h = this.linesHidden(); if (b){ b.classList.toggle('off', h); b.title = h ? 'The position lines are invisible (labels kept): press to bring them back' : 'Make the entry, stop and target lines invisible; their labels on the left stay'; } },
  posLines(){ if (typeof PosLines === 'undefined' || PosLines._cpWrap) return; PosLines._cpWrap = true; const P = PosLines, draw = P.draw.bind(P), label = P.label.bind(P), hit = P.hit.bind(P), shift = P.serverShift.bind(P);
    /* the labels are written down as they are drawn, so a press on one can still find its line */
    P.label = (ctx, x, y, text, color, below) => { const b = label(ctx, x, y, text, color, below); try { (P._cpLbl = P._cpLbl || []).push({ x: b.x, y: b.y, w: b.w, h: b.h, ly: y, text: String(text || '') }); } catch(e){} return b; };
    /* invisible lines: the chart's own drawing goes through a stand-in that leaves out the long lines and the shaded zones */
    P.draw = ctx => { P._cpLbl = []; if (!this.linesHidden()) return draw(ctx); return draw(this.noLines(ctx)); };
    P.hit = (x, y) => { if (!this.linesHidden()) return hit(x, y); const b = (P._cpLbl || []).find(q => /^(SL|TP) /.test(q.text) && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h); return b ? hit(x, b.ly) : null; };
    /* the broker's clock for a date, as the Replay uses it: learning it from the newest candle comes out an hour short in
       the second half of every hour on a 1-hour chart, which drew a position one hour away from where it opened */
    P.serverShift = () => { if (this.on() && typeof Autopsy !== 'undefined' && Autopsy.shift){ try { return Autopsy.shift(STORE.symbol); } catch(e){} } return shift(); };
    this.linesBtn(); },
  /* a stand-in for the canvas: a stroke that is one straight line across most of the chart is not drawn, nor a faint shaded zone */
  noLines(ctx){ const pts = [], W = (Draw.cssW || 1000) * 0.6;
    return new Proxy(ctx, { get: (t, k) => {
        if (k === 'beginPath') return () => { pts.length = 0; t.beginPath(); };
        if (k === 'moveTo' || k === 'lineTo') return (x, y) => { pts.push([x, y]); t[k](x, y); };
        if (k === 'stroke') return (...a) => { if (pts.length === 2 && Math.abs(pts[0][1] - pts[1][1]) < 0.6 && Math.abs(pts[1][0] - pts[0][0]) > W) return; t.stroke(...a); };
        if (k === 'fillRect') return (x, y, w, h) => { if (/,\s*0?\.1\)\s*$/.test(String(t.fillStyle))) return; t.fillRect(x, y, w, h); };
        const v = t[k]; return typeof v === 'function' ? v.bind(t) : v; },
      set: (t, k, v) => { t[k] = v; return true; } }); },
  setMode(m){ this.mode = m; const p = this.$('tmPenBtn'), en = this.$('tmEntryBtn'); if (p) p.classList.toggle('on', m === 'pen'); if (en) en.classList.toggle('on', m === 'entry');
    if (m){ const mg = this.$('tmMagicBtn'); if (mg && mg.classList.contains('on')) mg.click(); if (m === 'pen' && typeof Ink !== 'undefined' && Ink.isMagic()){ Ink.load().pen = 'pen'; Ink.save(); } }
    const host = this.$('mainWrap'); if (host){ host.classList.toggle('cpPen', m === 'pen'); host.classList.toggle('cpEntry', m === 'entry'); }
    if (m !== 'entry'){ this.probe = null; this.closeCard(); }
    if (typeof Draws !== 'undefined'){ Draws.sel = null; Draws.closeCard(); } this.later(); },

  /* ---------- the chart's geometry, in the form the drawing engine (js/tmdraws.js) expects ---------- */
  plotW(){ let psw = 0; try { psw = Chart.main.priceScale('right').width() || 0; } catch(e){} return Math.max(10, (Draw.cssW || 0) - psw); },
  idx(t){ const R = Chart.raw || [], n = R.length; if (!n) return 0; if (t <= R[0].rawTime) return 0; let a = 0, b = n - 1; while (a < b){ const m = (a + b + 1) >> 1; if (R[m].rawTime <= t) a = m; else b = m - 1; } return a; },
  g(){ const R = Chart.raw || [], n = R.length; if (!n || !Chart.priceSeries || !Chart.main) return null; const ts = Chart.main.timeScale(), ps = Chart.priceSeries, cl = i => Math.max(0, Math.min(n - 1, i));
    const step = n > 1 ? R[n - 1].rawTime - R[n - 2].rawTime : 60;
    return { X: i => { const v = ts.logicalToCoordinate(i); return v == null ? NaN : v; }, Y: p => { const v = ps.priceToCoordinate(p); return v == null ? NaN : v; },
      F: x => { const v = ts.coordinateToLogical(x); return v == null ? 0 : v; }, I: x => { const v = ts.coordinateToLogical(x); return Math.round(v == null ? 0 : v); }, P: y => ps.coordinateToPrice(y),
      idx: t => this.idx(t), T: i => i > n - 1 ? R[n - 1].rawTime + (i - (n - 1)) * step : R[cl(i)].rawTime, w: this.plotW(), h: Draw.cssH || 0,
      date: (t, full) => this.date(t, full), px: v => this.px(v), dur: v => this.dur(v), pv: this.pv(), ccy: this.ccy(), last: R[n - 1].close }; },
  key(){ return typeof Draws !== 'undefined' ? Draws.key(STORE.symbol, STORE.tf) : ''; },
  pv(){ try { const s = Feed.specFor(STORE.symbol); return s && s.pointValue > 0 ? s.pointValue : null; } catch(e){ return null; } },
  ccy(){ try { return (Feed.account && Feed.account.currency) || 'USD'; } catch(e){ return 'USD'; } },
  px(v){ if (v == null || !isFinite(v)) return '–'; const a = Math.abs(v); return v.toFixed(a >= 1000 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 5); },
  dur(s){ s = Math.abs(s); return s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? (s / 3600).toFixed(s < 36000 ? 1 : 0) + ' h' : (s / 86400).toFixed(1) + ' d'; },
  /* the candles' own clock, as the chart shows it */
  date(t, full){ const d = new Date((t + (typeof TZ_OFF !== 'undefined' ? TZ_OFF : 0)) * 1000), p = n => String(n).padStart(2, '0'), D = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()], M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
    return (full ? D + ' ' : '') + d.getUTCDate() + ' ' + M + (full ? ' ' + d.getUTCFullYear() : '') + ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()); },
  sg(v, d, suf){ return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d) + (suf || ''); },
  money(v){ return (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0, maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }); },

  /* ---------- painting: pen strokes, the From-entry marks, and the glowing points of the positions ---------- */
  later(){ if (this._raf) return; this._raf = requestAnimationFrame(() => { this._raf = 0; try { this.paint(); } catch(e){ console.warn('chart plus', e); } try { this.beacons(); } catch(e){ console.warn('position points', e); } }); },
  paint(){ const cv = this.cv; if (!cv) return; const show = this.on() && this.room(), g = show ? this.g() : null, dpr = window.devicePixelRatio || 1, W = g ? g.w : 0, H = g ? g.h : 0;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H); if (!g || typeof Draws === 'undefined' || typeof Ink === 'undefined') return;
    const key = this.key(), sel = Draws.sel && Draws.sel.key === key ? Draws.sel.id : null;
    for (const k of Draws.is(key).filter(x => !x.off)) Ink.stroke(c, Draws.px2(g, k), k, k.id === sel);
    if (Draws.op && Draws.op.mode === 'ink' && Draws.op.key === key) Ink.stroke(c, Draws.px2(g, Draws.op.s), Draws.op.s);
    const pr = this.probe; if (pr && Chart.raw[pr.i]){ const b = Chart.raw[pr.i], x = g.X(pr.i), cw = Math.max(4, g.X(pr.i + 1) - x), yh = g.Y(b.high), yl = g.Y(b.low);
      c.save(); c.strokeStyle = '#FFB648'; c.lineWidth = 1.2; c.setLineDash([3, 3]); c.strokeRect(x - cw / 2 - 3, yh - 4, cw + 6, yl - yh + 8); c.setLineDash([]);
      for (const [name, p] of [['top', b.high], ['mid', (b.high + b.low) / 2], ['low', b.low]]){ const y = g.Y(p); c.fillStyle = '#FFB648'; c.shadowColor = '#FFB648'; c.shadowBlur = 8; c.beginPath(); c.arc(x + cw / 2 + 9, y, 3.2, 0, 6.3); c.fill(); c.shadowBlur = 0; c.font = '600 10px JetBrains Mono, monospace'; c.textBaseline = 'middle'; c.fillText(name, x + cw / 2 + 16, y); }
      c.restore(); } },
  /* the glowing points: the entry where it happened, the target and the stop a few candles ahead of the newest candle */
  AHEAD: 6,
  beacons(){ const host = this.$('mainWrap'); if (!host || typeof Beacon === 'undefined') return; const g = this.on() && this.room() && typeof PosLines !== 'undefined' && PosLines.on ? this.g() : null;
    if (!g){ Beacon.clear(host); return; } let rows = []; try { rows = PosLines.shownRows(); } catch(e){} const n = Chart.raw.length, xF = g.X(n - 1 + this.AHEAD), many = rows.length > 3, items = [];
    rows.forEach((r, k) => { const p = r.p; if (!p || !(p.entry > 0)) return; const id = r.bot + ':' + p.id, side = p.dir > 0 ? 'BUY' : 'SELL', lots = p.lots != null ? p.lots : p.qty;
      let xE = NaN; try { const t = Math.floor(p.entryTime / 1000) + PosLines.serverShift() + (typeof TZ_OFF !== 'undefined' ? TZ_OFF : 0), l = Draw.logicalFor(t); if (l != null) xE = g.X(Math.floor(l + 1e-6)); } catch(e){}
      const cash = price => { try { const v = (price - p.entry) * p.dir * p.qty * BotEngine.cashRate(p, true); return isFinite(v) ? ' · ' + (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) : ''; } catch(e){ return ''; } };
      const col = r.live ? '#FFB648' : '#4FD8F7', dx = k * 0;
      (this._entryAt = this._entryAt || {})['pe' + id] = { t: p.entryTime };
      items.push({ key: 'pe' + id, kind: 'entry', x: xE, y: g.Y(p.entry), color: col, noLevel: true, mini: many, tag: (r.live ? 'REAL · ' : 'ENTRY · ') + side, sub: this.px(p.entry) + (lots != null ? ' · ' + (+lots).toFixed(2) + ' lots' : ''), title: 'Entry · ' + side + ' ' + this.px(p.entry) });
      if (p.tp > 0) items.push({ key: 'pt' + id, kind: 'target', x: xF + dx, y: g.Y(p.tp), color: '#3DDC97', noLevel: true, mini: many, edge: 'TARGET', tag: 'TARGET', sub: this.px(p.tp) + cash(p.tp), title: 'Target ' + this.px(p.tp) });
      if (p.sl > 0) items.push({ key: 'ps' + id, kind: 'stop', x: xF + dx, y: g.Y(p.sl), color: '#FF6B7A', noLevel: true, mini: many, edge: 'STOP', tag: 'STOP', sub: this.px(p.sl) + cash(p.sl), title: 'Stop ' + this.px(p.sl) }); });
    const cw = Math.max(2, g.X(n - 1) - g.X(n - 2));
    Beacon.render(host, items, { w: g.w, h: g.h, cw });
    const layer = host.querySelector(':scope > .bcnLayer'); if (layer) layer.classList.add('passive'); },

  /* ---------- presses on the chart while the pen or From entry is in hand ---------- */
  SKIP: 'button, input, select, textarea, a, #tmMarkBar, #drawBar, #legend, #indLegend, .posPanel, #tmExpand, #dwCard, #cpCard, #inkMenu, .paneCtl',
  inPlot(e){ const host = this.$('mainWrap'); if (!host || !this.mode || !this.on() || !this.room()) return null; if (e.target && e.target.closest && (e.target.closest(this.SKIP) || !host.contains(e.target))) return null;
    const r = host.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; return x >= 0 && y >= 0 && x <= this.plotW() && y <= (Draw.cssH || 0) ? { x, y } : null; },
  catchPresses(){ const host = () => this.$('mainWrap');
    /* the work is done on the pointer event; the mouse events that may follow it are only swallowed */
    const down = e => { if (e.button !== 0 && e.button !== 2) return; const q = this.inPlot(e); if (!q) return; e.preventDefault(); e.stopImmediatePropagation(); if (e.type !== 'pointerdown') return; const g = this.g(); if (!g) return; const key = this.key();
      if (e.button === 2){ if (this.mode === 'pen'){ const h = Draws.hit(g, key, q.x, q.y); if (h && h.type === 'i'){ Draws.remove(key, h.id); this.later(); } } return; }
      if (this.mode === 'entry'){ const i = Math.max(0, Math.min(Chart.raw.length - 1, g.I(q.x))); this.pick(i); return; }
      const h = Draws.hit(g, key, q.x, q.y); this._press = q; Draws.down(g, key, h && h.type === 'i' ? 'select' : 'ink', q.x, q.y); this.later(); };
    window.addEventListener('pointerdown', down, true); window.addEventListener('mousedown', down, true);
    window.addEventListener('contextmenu', e => { if (this.inPlot(e)){ e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    const move = e => { if (!this._press) return; e.stopImmediatePropagation(); if (!Draws.op) return; const r = host().getBoundingClientRect(), g = this.g(); if (!g) return; Draws.move(g, e.clientX - r.left, e.clientY - r.top); this.later(); };
    window.addEventListener('pointermove', move, true); window.addEventListener('mousemove', move, true);
    const up = e => { if (!this._press) return; this._press = null; const r = host().getBoundingClientRect(), g = this.g(); this._swallow = true; if (g && Draws.op) Draws.up(host(), g, e.clientX - r.left, e.clientY - r.top, () => this.later()); e.stopImmediatePropagation(); this.later(); };
    window.addEventListener('pointerup', up, true); window.addEventListener('mouseup', e => { if (this._press) up(e); else if (this._swallow) e.stopImmediatePropagation(); }, true);
    window.addEventListener('click', e => { if (this._swallow || this.inPlot(e)){ e.stopImmediatePropagation(); e.preventDefault(); } this._swallow = false; }, true); },

  /* ---------- From entry ---------- */
  pick(i){ const R = Chart.raw; if (!R[i]) return; this.probe = { i }; this.run(); },
  sim(P, atr, i, entry, dir){ const rule = this.rule, n = P.n, a = atr[i] > 0 ? atr[i] : (P.h[i] - P.l[i]) || entry * 0.002, risk = a * rule.stop, sl = entry - dir * risk, tp = entry + dir * risk * rule.tgt, end = Math.min(n - 1, i + rule.hold);
    let res; for (let k = i + 1; k <= end; k++){ if (dir > 0 ? P.l[k] <= sl : P.h[k] >= sl){ res = { r: -1, n: k - i, why: 'stop' }; break; } if (dir > 0 ? P.h[k] >= tp : P.l[k] <= tp){ res = { r: rule.tgt, n: k - i, why: 'target' }; break; } }
    if (!res) res = end <= i ? { r: null, n: 0, why: 'no candles after it yet' } : { r: dir * (P.c[end] - entry) / risk, n: end - i, why: end - i < rule.hold ? 'still open' : 'time limit' };
    res.sl = sl; res.tp = tp; if (res.r != null){ const pv = this.pv(), move = res.r * risk; res.pct = move / entry * 100; res.usd = pv ? move * pv * (rule.lots || 0) : null; } return res; },
  run(){ const pr = this.probe; if (!pr) return; const R = Chart.raw, P = ProInd.prep(R), atr = ProInd.atr(P, 14), i = pr.i, hi = P.h[i], lo = P.l[i];
    pr.rows = [['Top', hi], ['Middle', (hi + lo) / 2], ['Bottom', lo]].map(([name, price]) => ({ name, price, buy: this.sim(P, atr, i, price, 1), sell: this.sim(P, atr, i, price, -1) }));
    /* the signals of this candle (or up to three before it), and how each did from every candle where it fired */
    const fired = []; for (const S of ProInd.SIGNALS){ let a; try { a = ProInd.signal(P, S.id); } catch(e){ continue; } for (let k = i; k >= Math.max(0, i - 3); k--) if (a[k]){ fired.push({ name: S.name, how: S.how, d: a[k], ago: i - k, arr: a }); break; } }
    const mid = pr.rows[1]; for (const f of fired){ f.res = f.d > 0 ? mid.buy : mid.sell; let w = 0, c = 0, sum = 0; for (let k = 210; k < P.n - 2; k++){ if (f.arr[k] !== f.d) continue; const r = this.sim(P, atr, k, P.c[k], f.d); if (r.r == null) continue; c++; sum += r.pct; if (r.r > 0) w++; k += 2; } f.hist = { n: c, win: c ? w / c : null, avg: c ? sum / c : null }; }
    let agree = null; try { const u = ProInd.agreement(P, i, 1); agree = { up: u.yes, dn: u.no, of: u.of }; } catch(e){}
    const right = mid.buy.r != null && mid.sell.r != null ? (mid.buy.r > mid.sell.r ? 1 : mid.sell.r > mid.buy.r ? -1 : 0) : 0;
    pr.sig = { fired, agree, right }; pr.atr = atr[i]; this.card(); this.later(); },
  closeCard(){ const c = this.$('cpCard'); if (c) c.remove(); },
  card(){ const pr = this.probe, host = this.$('mainWrap'); if (!pr || !pr.rows || !host) return; let el = this.$('cpCard');
    if (!el){ el = document.createElement('div'); el.id = 'cpCard'; host.appendChild(el); el.addEventListener('mousedown', e => e.stopPropagation()); el.addEventListener('pointerdown', e => e.stopPropagation());
      el.addEventListener('click', e => { const b = e.target.closest('[data-cp]'); if (!b) return; if (b.dataset.cp === 'x'){ this.probe = null; this.closeCard(); this.later(); } else if (b.dataset.cp === 'off'){ this.setMode(''); } });
      el.addEventListener('change', e => { const s = e.target.closest('[data-rule]'); if (!s) return; this.rule[s.dataset.rule] = +s.value; if (s.dataset.rule === 'lots') try { localStorage.setItem('astra_inspect_lots', s.value); } catch(x){} this.run(); }); }
    const R = Chart.raw, k = R[pr.i], rule = this.rule, s = pr.sig, pv = this.pv();
    const cell = r => '<b class="' + (r.r == null ? '' : r.r > 0 ? 'up' : 'dn') + '">' + (r.r == null ? '–' : this.sg(r.pct, 2, '%')) + '</b>' + (r.usd != null ? '<i class="' + (r.usd >= 0 ? 'up' : 'dn') + '">' + this.money(r.usd) + '</i>' : '') + '<small>' + r.why + (r.n ? ' · ' + r.n + (r.n === 1 ? ' candle' : ' candles') : '') + '</small>';
    const opt = (key, list, lab) => '<label>' + lab + '<select data-rule="' + key + '">' + list.map(v => '<option value="' + v[0] + '"' + (rule[key] === v[0] ? ' selected' : '') + '>' + v[1] + '</option>').join('') + '</select></label>';
    const stat = h => h.n ? '<span class="cpBar"><i style="width:' + Math.round((h.win || 0) * 100) + '%"></i></span><em>' + Math.round(h.win * 100) + '% won · ' + this.sg(h.avg, 2, '%') + ' a trade · ' + h.n + ' trades' + (h.n < 30 ? ' · few' : '') + '</em>' : '<em>no history</em>';
    const move = k.close - k.open, rng = k.high - k.low;
    el.innerHTML = '<div class="cpHead"><div><small>FROM ENTRY · ' + this.esc(STORE.symbol) + ' ' + this.esc(STORE.tf) + '</small><b>' + this.date(k.rawTime, true) + '</b></div><button type="button" data-cp="x" title="Remove this test">✕</button></div>' +
      '<div class="cpOhlc"><span><label>OPEN</label><b>' + this.px(k.open) + '</b></span><span><label>HIGH</label><b>' + this.px(k.high) + '</b></span><span><label>LOW</label><b>' + this.px(k.low) + '</b></span><span><label>CLOSE</label><b class="' + (move >= 0 ? 'up' : 'dn') + '">' + this.px(k.close) + '</b></span><span><label>RANGE</label><b>' + this.px(rng) + '</b></span><span><label>ATR 14</label><b>' + this.px(pr.atr) + '</b></span></div>' +
      '<div class="cpGrid"><span></span><span class="up">▲ as a buy</span><span class="dn">▼ as a sell</span>' + pr.rows.map(r => '<span class="cpLv"><b>' + r.name + '</b><small>' + this.px(r.price) + '</small></span><span>' + cell(r.buy) + '</span><span>' + cell(r.sell) + '</span>').join('') + '</div>' +
      '<div class="cpRule">' + opt('stop', [[0.5, '0.5 × ATR'], [1, '1 × ATR'], [1.5, '1.5 × ATR'], [2, '2 × ATR'], [3, '3 × ATR']], 'Stop') + opt('tgt', [[1, '1 × stop'], [1.5, '1.5 × stop'], [2, '2 × stop'], [3, '3 × stop'], [4, '4 × stop']], 'Target') + opt('hold', [[12, '12 candles'], [24, '24 candles'], [48, '48 candles'], [96, '96 candles'], [200, '200 candles']], 'Give up') + opt('lots', [[0.01, '0.01 lot'], [0.05, '0.05 lots'], [0.1, '0.1 lots'], [0.25, '0.25 lots'], [0.5, '0.5 lots'], [1, '1 lot'], [2, '2 lots']], 'Size') + '</div>' +
      '<small class="cpCap">THE SIGNALS ON THIS CANDLE</small>' + (s.fired.length ? '<p class="cpVerdict">' + (s.right ? 'From the middle, a <b class="' + (s.right > 0 ? 'up">buy' : 'dn">sell') + '</b> did better: ' + s.fired.filter(f => f.d === s.right).length + ' of ' + s.fired.length + ' signals pointed that way.' : 'From the middle, a buy and a sell ended the same.') + (s.agree ? ' Trend readings: ' + s.agree.up + ' up, ' + s.agree.dn + ' down, of ' + s.agree.of + '.' : '') + '</p>' +
        '<div class="cpSigs">' + s.fired.map(f => '<div class="' + (s.right && f.d === s.right ? 'ok' : s.right ? 'no' : '') + '" title="' + this.esc(f.how) + '"><span><i class="' + (f.d > 0 ? 'up' : 'dn') + '">' + (f.d > 0 ? '▲' : '▼') + '</i><b>' + this.esc(f.name) + '</b>' + (f.ago ? '<small>' + f.ago + ' before</small>' : '') + '</span><span class="cpHist">' + stat(f.hist) + '</span></div>').join('') + '</div>'
        : '<p class="cpMuted">No signal fired on this candle or the three before it.' + (s.agree ? ' Trend readings: ' + s.agree.up + ' up, ' + s.agree.dn + ' down, of ' + s.agree.of + '.' : '') + '</p>') +
      '<p class="cpMuted">Stop and target are measured from each entry with the rule above; a candle that touches both counts as the stop. "Won" is how often the same rule reached the target first from every candle where the signal fired on this chart. Money shows when the broker gives the value of a lot' + (pv ? '' : ' (not for this instrument)') + '. Press another candle to test it.</p>' +
      '<button type="button" class="cpDone" data-cp="off">Done</button>'; },

  /* ---------- a press on an entry point, or a double-click on a candle: the studio, zoomed on that moment ---------- */
  zoomPresses(){ const core = e => e.target && e.target.closest && e.target.closest('#mainWrap > .bcnLayer .bcn.entry > .bcnCore, #mainWrap > .bcnLayer .bcn.entry > .bcnTag');
    for (const ev of ['pointerdown', 'mousedown', 'mouseup', 'pointerup']) window.addEventListener(ev, e => { if (core(e) && this.on()){ e.preventDefault(); e.stopImmediatePropagation(); } }, true);
    window.addEventListener('click', e => { const c = core(e); if (!c || !this.on()) return; e.preventDefault(); e.stopImmediatePropagation(); const k = c.parentElement.dataset.k, a = (this._entryAt || {})[k]; if (!a) return;
      const raw = typeof Autopsy !== 'undefined' && Autopsy.raw ? Autopsy.raw({ sym: STORE.symbol }, a.t) : Math.floor(a.t / 1000) + 7200; this.studio(true, raw); }, true);
    window.addEventListener('dblclick', e => { if (!this.on() || !this.room() || this.mode) return; const host = this.$('mainWrap'); if (!host || !host.contains(e.target) || (e.target.closest && e.target.closest(this.SKIP + ', .bcnLayer'))) return;
      const r = host.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top, g = this.g(); if (!g || x < 0 || y < 0 || x > g.w || y > g.h) return;
      const i = Math.max(0, Math.min(Chart.raw.length - 1, g.I(x))); e.preventDefault(); e.stopImmediatePropagation(); this.studio(true, Chart.raw[i].rawTime); }, true); },
  /* the studio's chart, centred on a moment and zoomed in */
  focusStudio(M, t){ const C = M && M.chart, R = C && C.raw; if (!R || !R.length || !t) return false; const tt = b => b.time != null ? b.time : b.t; let i = R.length - 1; for (let k = R.length - 1; k >= 0; k--){ if (tt(R[k]) <= t){ i = k; break; } }
    if (tt(R[0]) > t) return false; C.step = 22; C.off = C.clampOff(R.length - 1 + C.FUT - i - (C.plotW / 2 - C.step / 2) / C.step); C.mark = i; C.draw(); return true; },
  /* ---------- the Markets studio, over the chart ---------- */
  studio(open, at){ const old = this.$('tmStudioView'); if (old && open && at){ this.studio(false); return this.studio(true, at); } if (!open){ if (old){ old.remove(); const b = this.$('tmStudioBtn'); if (b) b.classList.remove('on'); } return; } if (old) return;
    let sym = STORE.symbol; try { if (typeof Feed !== 'undefined' && Feed.brokerName) sym = Feed.brokerName(STORE.symbol) || sym; } catch(e){}
    const tf = { '1m': '15m', '5m': '15m', '15m': '15m', '30m': '1h', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1d' }[STORE.tf] || '1h';
    try { localStorage.setItem('timurila_sym', JSON.stringify(sym)); localStorage.setItem('timurila_tf', JSON.stringify(tf)); } catch(e){}
    const el = document.createElement('div'); el.id = 'tmStudioView';
    el.innerHTML = '<div class="svHead"><b>Studio view</b><span>' + this.esc(sym) + ' · ' + this.esc(tf) + (at ? ' · zoomed on ' + this.esc(this.date(at, true)) : '') + (tf !== STORE.tf ? ' (the studio has 15m, 1h, 4h and 1d)' : '') + ' · the Markets chart studio: layers, scenes and zoom</span><button type="button" data-sv="x">Back to the live chart ✕</button></div><iframe title="Markets studio" src="timurila/index.html?embed=1&studio=1#markets"></iframe>';
    document.body.appendChild(el); const b = this.$('tmStudioBtn'); if (b) b.classList.add('on');
    el.addEventListener('click', e => { if (e.target.closest('[data-sv="x"]')) this.studio(false); });
    /* the studio's own objects are top-level constants of its page, so they are reached by name in its window */
    const fr = el.querySelector('iframe'); fr.addEventListener('load', () => { const w = fr.contentWindow, get = name => { try { return w.eval('typeof ' + name + " !== 'undefined' ? " + name + ' : null'); } catch(x){ return null; } }; let n = 0;
      const go = () => { const T = get('T'), M = get('Markets'); if (T && T.symbols && T.symbols.length && M && M.chart){ if (M.sym !== sym && T.symbols.includes(sym)) M.open(sym); if (M.tf !== tf){ M.tf = tf; M.loadChart(true); }
          /* zoomed on a moment: once the studio's candles are in, centre them on it (they reach back about 600 candles) */
          if (at){ let m = 0; const fx = () => { const ok = M.chart && M.chart.sym === sym && M.chart.raw && M.chart.raw.length > 30 && this.focusStudio(M, at); if (!ok && ++m < 30) setTimeout(fx, 400); else if (!ok){ const h = el.querySelector('.svHead span'); if (h) h.textContent += ' · that moment is older than the studio’s candles'; } }; setTimeout(fx, 300); } return; } if (++n < 40) setTimeout(go, 500); }; go(); }); },

  /* ---------- the order of Layers ▸ More overlays ---------- */
  LKEY: 'astra_layers_order',
  lrows(){ const box = document.querySelector('#chartLabelBar .chartTools'); if (!box) return []; const out = []; for (const el of box.children){ if (/Cfg$/.test(el.id || '') && out.length && !out[out.length - 1].cfg){ out[out.length - 1].cfg = el; continue; } if (el.id) out.push({ id: el.id, head: el, cfg: null }); } return out; },
  layersApply(){ const rows = this.lrows(); let saved = []; try { saved = JSON.parse(localStorage.getItem(this.LKEY) || '[]') || []; } catch(e){}
    const order = saved.filter(id => rows.some(r => r.id === id)).concat(rows.map(r => r.id).filter(id => !saved.includes(id)));
    rows.forEach(r => { const k = order.indexOf(r.id); r.head.style.setProperty('--lo', k); if (r.cfg) r.cfg.style.setProperty('--lo', k); r.head.draggable = this.on(); }); return order; },
  layersOrder(){ const box = document.querySelector('#chartLabelBar .chartTools'); if (!box) return; this.layersApply(); let drag = null;
    const rowOf = el => { const t = el && el.closest && el.closest('.chartTools > *'); if (!t) return null; return this.lrows().find(r => r.head === t || r.cfg === t) || null; };
    const mark = (r, after) => { box.querySelectorAll('.lyDrop, .lyDropA').forEach(x => x.classList.remove('lyDrop', 'lyDropA')); if (r) r.head.classList.add(after ? 'lyDropA' : 'lyDrop'); };
    box.addEventListener('dragstart', e => { if (!this.on()) return; const r = rowOf(e.target); if (!r) return; drag = r; r.head.classList.add('lyDrag'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', r.id); } catch(x){} });
    box.addEventListener('dragover', e => { if (!drag) return; const r = rowOf(e.target); if (!r || r === drag) return mark(null); e.preventDefault(); const b = r.head.getBoundingClientRect(); mark(r, e.clientY > b.top + b.height / 2); });
    box.addEventListener('drop', e => { if (!drag) return; e.preventDefault(); const r = rowOf(e.target); if (r && r !== drag){ const b = r.head.getBoundingClientRect(), after = e.clientY > b.top + b.height / 2, order = this.layersApply().filter(id => id !== drag.id); let k = order.indexOf(r.id); if (after) k++; order.splice(k, 0, drag.id); try { localStorage.setItem(this.LKEY, JSON.stringify(order)); } catch(x){} this.layersApply(); } mark(null); });
    box.addEventListener('dragend', () => { if (drag) drag.head.classList.remove('lyDrag'); drag = null; mark(null); });
    new MutationObserver(() => this.layersApply()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-face'] }); },

  /* ---------- the order of the side tabs: every tab, including the ones the new look adds ---------- */
  sideOrder(){ const st = this.$('sideTabs'); if (!st || st._cpOrder) return; st._cpOrder = true; let drag = null;
    const tabs = () => [...st.children].filter(b => b.dataset && b.dataset.tab);
    const keys = () => tabs().map(b => b.dataset.tab);
    const save = () => { try { const c = (typeof lsGet === 'function' ? lsGet('astra_taborder', {}) : JSON.parse(localStorage.getItem('astra_taborder') || '{}')) || {}; c.side = Object.assign({}, c.side || {}, { order: keys() }); if (typeof lsSet === 'function') lsSet('astra_taborder', c); else localStorage.setItem('astra_taborder', JSON.stringify(c)); } catch(e){} };
    const mark = (b, after) => { st.querySelectorAll('.stDrop, .stDropA').forEach(x => x.classList.remove('stDrop', 'stDropA')); if (b) b.classList.add(after ? 'stDropA' : 'stDrop'); };
    const arm = () => tabs().forEach(b => { b.draggable = true; });
    st.addEventListener('dragstart', e => { const b = e.target.closest && e.target.closest('button[data-tab]'); if (!b) return; drag = b; arm(); this.tipHide(); }, true);
    st.addEventListener('dragover', e => { if (!drag) return; const b = e.target.closest && e.target.closest('button[data-tab]'); e.stopPropagation(); if (!b || b === drag){ mark(null); return; } e.preventDefault(); const r = b.getBoundingClientRect(); mark(b, e.clientX > r.left + r.width / 2); }, true);
    st.addEventListener('drop', e => { if (!drag) return; e.preventDefault(); e.stopPropagation(); const b = e.target.closest && e.target.closest('button[data-tab]'); if (b && b !== drag){ const r = b.getBoundingClientRect(); st.insertBefore(drag, e.clientX > r.left + r.width / 2 ? b.nextSibling : b); save(); } mark(null); drag = null; }, true);
    st.addEventListener('dragend', () => { mark(null); drag = null; }, true);
    /* the tabs the new look adds arrive after Classic has put its own in order: they are put in their places too */
    let tries = 0; const later = () => { arm(); try { if (typeof TabOrder !== 'undefined') TabOrder.apply('side'); } catch(e){} if (++tries < 6) setTimeout(later, 1500); }; later(); },

  /* ---------- the clock strip and the news stream of the side panel: on or off (View menu) ---------- */
  OPTS: [['cpNoClock', 'astra_side_clock_off', 'Clock strip', 'the market sessions at the top of the side panel'], ['cpNoNews', 'astra_side_news_off', 'News stream', 'the headlines at the foot of the side panel']],
  viewOpts(){ const H = document.documentElement; for (const [cls, key] of this.OPTS){ let off = false; try { off = localStorage.getItem(key) === '1'; } catch(e){} H.classList.toggle(cls, off); }
    const put = () => { const v = this.$('tmPopView'); if (!v || this.$('cpViewOpts')) return; const box = document.createElement('div'); box.id = 'cpViewOpts'; v.appendChild(box); this.paintOpts();
      box.addEventListener('click', e => { const b = e.target.closest('[data-cpopt]'); if (!b) return; e.stopPropagation(); const o = this.OPTS.find(x => x[0] === b.dataset.cpopt), off = !H.classList.contains(o[0]); H.classList.toggle(o[0], off); try { localStorage.setItem(o[1], off ? '1' : ''); } catch(x){} this.paintOpts(); setTimeout(() => window.dispatchEvent(new Event('resize')), 60); }); };
    put(); setInterval(put, 2000); },
  paintOpts(){ const box = this.$('cpViewOpts'); if (!box) return; const H = document.documentElement;
    box.innerHTML = '<h4>Side panel</h4>' + this.OPTS.map(o => { const on = !H.classList.contains(o[0]); return '<button type="button" class="cpOpt' + (on ? ' on' : '') + '" data-cpopt="' + o[0] + '"><i></i><span><b>' + o[2] + '</b><small>' + o[3] + '</small></span><em>' + (on ? 'on' : 'off') + '</em></button>'; }).join(''); },
  /* ---------- the side tab you put first opens with the chart (unless you starred another with a right-click) ---------- */
  firstTab(){ setTimeout(() => { try { if (!this.on()) return; const c = typeof lsGet === 'function' ? (lsGet('astra_taborder', {}) || {}) : {}; if (c.side && c.side.def) return; const b = document.querySelector('#sideTabs button[data-tab]'); if (b && !b.classList.contains('active')) b.click(); } catch(e){} }, 9500); },
  /* ---------- the names of the side tabs, in front of everything ---------- */
  sideTip(){ const st = this.$('sideTabs'); if (!st || this.$('cpTabTip')) return; const tip = document.createElement('div'); tip.id = 'cpTabTip'; tip.hidden = true; document.body.appendChild(tip);
    st.addEventListener('mouseover', e => { const b = e.target.closest && e.target.closest('button[data-tab]'); if (!b || !this.on()) return; const t = b.dataset.tml || (b.textContent || '').trim(); if (!t) return; tip.textContent = t; tip.hidden = false;
      const r = b.getBoundingClientRect(), w = tip.offsetWidth; tip.style.left = Math.max(6, Math.min(window.innerWidth - w - 6, r.left + r.width / 2 - w / 2)) + 'px'; tip.style.top = (r.bottom + 8) + 'px'; });
    st.addEventListener('mouseout', e => { if (!e.relatedTarget || !st.contains(e.relatedTarget) || !e.relatedTarget.closest('button[data-tab]')) this.tipHide(); });
    st.addEventListener('mousedown', () => this.tipHide()); },
  tipHide(){ const t = this.$('cpTabTip'); if (t) t.hidden = true; },
};
(function(){ let n = 0; const go = () => { let ok = false; try { ok = ChartPlus.init() !== false; } catch(e){ console.warn('chart plus', e); ok = true; } if (!ok && ++n < 20) setTimeout(go, 800); }; if (document.readyState !== 'loading') setTimeout(go, 2600); else document.addEventListener('DOMContentLoaded', () => setTimeout(go, 2600)); })();
