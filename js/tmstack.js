/* ASTRA · new look — the Stack: every thing on the chart as a layer, as in a picture editor.

   An addition. The Layers tab stays what it is (the switches for scenes, the Studio look and the overlays);
   the Stack is the pile itself: what is on the chart right now, one row each, the top row painted over the
   rows under it.

     ON THE CHART     a side tab, STACK. Its rows, top first:
                      · the ended trade you pressed, the readouts in the corner;
                      · the planes drawn over the candles — your drawings and the overlays, the pen strokes,
                        the marks, the glowing points, the stop and target being set — each with an eye, a
                        see-through slider and ▲ ▼ to put a whole plane over or under another;
                      · inside "Drawings and overlays": every overlay that is on and every drawing of yours,
                        each with its eye, ▲ ▼ (painted over / under its neighbours) and, for a drawing, ✕;
                      · every pen stroke and every mark, one row each;
                      · the chart itself: every indicator in every window, compared instruments, the candles.
                        The chart library paints these in the order they were added, so they have an eye,
                        settings and ✕, and no ▲ ▼.
     IN THE REPLAY    a card, LAYERS ON THIS CHART: the Replay's layers in the order they are painted, with
                      the same eye and ▲ ▼, and every drawing (measurement, line, pen stroke) with its eye,
                      a pencil to edit it and ✕ to remove it.

   It catches things by looking, not from a list: the overlays come from the painters of the drawing canvas
   (Draw.PAINT) and from the overlay buttons, indicators from the chart's own series and settings, drawings,
   strokes and marks from their stores, and any other canvas laid over the chart is listed as a plane of its
   own. An eye on an overlay or an indicator presses that thing's own switch, so Layers and the legend agree.

   It shows, hides, orders and removes what is drawn. It places, closes and changes no order, and arms nothing. */
'use strict';
const Stack = window.Stack = {
  KEY: 'astra_stack', S: null, seen: {}, _sig: '', _rsig: '',
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  on(){ return document.documentElement.dataset.face === 'tm'; },
  px(p){ const a = Math.abs(p), d = a >= 1000 ? 2 : a >= 10 ? 3 : 5; return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  load(){ if (!this.S){ let o = {}; try { o = JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch(e){} this.S = { planes: Array.isArray(o.planes) ? o.planes : [], paint: Array.isArray(o.paint) ? o.paint : [], alpha: o.alpha && typeof o.alpha === 'object' ? o.alpha : {}, hid: o.hid && typeof o.hid === 'object' ? o.hid : {}, fold: o.fold && typeof o.fold === 'object' ? o.fold : {} }; } return this.S; },
  save(){ try { localStorage.setItem(this.KEY, JSON.stringify(this.S)); } catch(e){} },
  /* a saved order, kept to what exists now; anything new takes the place it has by default */
  merge(saved, def){ const o = saved.filter((k, i) => def.includes(k) && saved.indexOf(k) === i); for (const k of def) if (!o.includes(k)){ const before = def.slice(0, def.indexOf(k)).reverse().find(x => o.includes(x)); o.splice(before ? o.indexOf(before) + 1 : 0, 0, k); } return o; },
  /* one step among the rows that are shown: it goes past the hidden neighbours too, so a press always shows */
  step(list, k, d, shown){ const i = list.indexOf(k); if (i < 0) return false; let j = i + d; while (j >= 0 && j < list.length && shown && !shown.includes(list[j])) j += d; if (j < 0 || j >= list.length) return false; list.splice(i, 1); list.splice(j, 0, k); return true; },
  EYE: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  EYE0: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.2A9.7 9.7 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.4 6.5C3.6 8.4 2 12 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4-.9"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>',
  ICON: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="5" rx="1.5"/><rect x="4" y="9.5" width="16" height="5" rx="1.5"/><rect x="4" y="16" width="16" height="5" rx="1.5"/></svg>',

  /* =============================== the live chart =============================== */
  /* the planes laid over the candles, bottom first, as the page stacks them by default */
  PLANES: { beacons: ['#mainWrap > .bcnLayer', 'Glowing points', 'entries, targets and stops of open positions'], marks: ['#tmMarkCv', 'Marks', 'your up and down marks'], pen: ['#tmPenCv', 'Pen strokes', 'drawn with the pen'], draw: ['#drawLayer', 'Drawings and overlays', 'your drawings, positions and the overlays'], levels: ['#lvLayer', 'Stop and target being set', 'the dashed preview lines'] },
  /* the painters of the drawing canvas: the switch that turns each on and off, and a plain name */
  PAINTERS: { vp: ['', 'Volume profile'], autosr: ['autoSrBtn', 'Support and resistance'], autostruct: ['autoStructBtn', 'Structure lines'], patterns: ['patBtn', 'Chart patterns'], studio: ['studioBtn', 'Studio look'], forecast: ['fcBtn', 'Forecast'], proven: ['pcBtn', 'Proven candles'], stregime: ['stRegBtn', 'SuperTrend regime'], jmregime: ['jmRegBtn', 'Regime'], jmsignals: ['jmSigBtn', 'Signals'], jmcheck: ['jmChkBtn', 'Check'], pos: ['posLinesBtn', 'Open positions'] },
  UI: { legend: 'Price readout', indLegend: 'Indicator names' },
  KNOWN: ['mainChart', 'drawLayer', 'drawBar', 'legend', 'indLegend', 'cmpChips', 'chartLoading', 'replayBar', 'posPanel', 'tmExpand', 'tmMarkCv', 'tmPenCv', 'lvLayer', 'ghLayer'],
  clean(t){ return String(t || '').replace(/^[^A-Za-z0-9]+/, '').replace(/\s*·\s*drag to move this button\s*$/i, '').trim(); },
  /* a canvas or layer over the chart that nobody told the Stack about: it is listed as a plane of its own */
  extra(){ const w = this.$('mainWrap'); if (!w) return []; const out = []; for (const el of w.children){ if (this.KNOWN.includes(el.id) || el.classList.contains('bcnLayer') || el.classList.contains('paneCtl')) continue; if (el.tagName !== 'CANVAS' && !/layer/i.test(el.id + ' ' + el.className)) continue; const k = el.id || String(el.className).split(/\s+/)[0]; if (!k || getComputedStyle(el).position !== 'absolute') continue; out.push({ k: 'dom:' + k, el }); } return out; },
  planeEl(k){ if (k === 'ghost') return this.$('ghLayer'); if (k.startsWith('dom:')){ const x = (this._extra || []).find(q => q.k === k); return x ? x.el : null; } const P = this.PLANES[k]; return P ? document.querySelector(P[0]) : null; },
  planeOrder(){ this._extra = this.extra(); const def = ['beacons', 'marks', 'pen', 'draw', 'levels'].concat(this._extra.map(x => x.k)); return this.merge(this.load().planes, def); },
  paintOrder(){ if (typeof Draw === 'undefined' || !Draw.PAINT) return []; const def = Draw.PAINT_DEFAULT.concat(Object.keys(Draw.PAINT).filter(k => !Draw.PAINT_DEFAULT.includes(k))); return this.merge(this.load().paint, def); },
  /* put the saved order, the eyes and the see-through sliders on the page. It runs by itself, so a reload keeps them. */
  apply(){ if (typeof Draw === 'undefined' || !Draw.PAINT) return; const S = this.load(), on = this.on();
    const po = this.paintOrder(), hidP = po.filter(k => S.hid['p:' + k] && !(this.PAINTERS[k] && this.PAINTERS[k][0]) && k !== 'vp' && k !== 'items'), want = on && (S.paint.length || hidP.length) ? po.filter(k => !hidP.includes(k)) : null, was = Draw._order || null;
    if (JSON.stringify(want) !== JSON.stringify(was)){ Draw._order = want; try { Draw.redraw(); } catch(e){} }
    const order = this.planeOrder(); this._z = this._z || {}; this._a = this._a || {};
    order.forEach((k, i) => { const el = this.planeEl(k); if (!el) return; if (on && S.planes.length){ el.style.zIndex = String(i + 1); this._z[k] = 1; } else if (this._z[k]){ el.style.zIndex = ''; delete this._z[k]; } });
    for (const k of order.concat(['ghost'])){ const el = this.planeEl(k); if (!el) continue; el.classList.toggle('skHid', on && !!S.hid['pl:' + k]); const a = on ? S.alpha[k] : null; if (a != null && a < 1){ el.style.opacity = String(a); this._a[k] = 1; } else if (this._a[k]){ el.style.opacity = ''; delete this._a[k]; } }
    for (const id of Object.keys(this.UI)){ const el = this.$(id); if (el) el.classList.toggle('skHid', on && !!S.hid['u:' + id]); }
    try { if (typeof Chart !== 'undefined' && Chart.priceSeries && S.hid['x:candles'] != null){ const v = !(on && S.hid['x:candles']); if (Chart.priceSeries.options().visible !== v) Chart.priceSeries.applyOptions({ visible: v }); if (!S.hid['x:candles']){ delete S.hid['x:candles']; this.save(); } } } catch(e){} },

  drawSub(it){ const pt = it.p1 || it.p || it.entry || (it.pts && it.pts[0]) || null, b = []; if (it.text) b.push(String(it.text).slice(0, 26)); if (pt && pt.price != null) b.push(this.px(pt.price)); if (it.p2 && it.p2.price != null && it.type !== 'hline') b.push('to ' + this.px(it.p2.price)); if (it.hidden) b.push('hidden'); return b.join(' · '); },
  /* the rows of the drawing canvas, top first: each overlay that is on, and your drawings one by one */
  rowsDraw(){ const S = this.load(), po = this.paintOrder(), rows = [], shown = [];
    const state = k => { if (k === 'items') return { on: true, show: true }; if (k === 'vp'){ const c = Chart.settings && Chart.settings.vp; return { on: !!(c && c.on) && !Chart.hiddenIn(c, 'main'), show: !!(c && c.on) }; }
      const P = this.PAINTERS[k], b = P && P[0] ? this.$(P[0]) : null; if (b){ if (b.hidden) return { on: false, show: false }; let on = b.classList.contains('on'); if (k === 'studio'){ try { on = !!Studio.overlay.cfg().on; } catch(e){} } if (on) this.seen[k] = 1; return { on, show: on || !!this.seen[k], b }; } return { on: !S.hid['p:' + k], show: true }; };
    const st = {}; for (const k of po){ st[k] = state(k); if (st[k].show) shown.push(k); } this._shownP = shown;
    for (let i = po.length - 1; i >= 0; i--){ const k = po[i], s = st[k]; if (!s.show) continue; const si = shown.indexOf(k), up = si < shown.length - 1, dn = si > 0;
      if (k === 'items'){ const n = Draw.items.length; rows.push({ id: 'p:items', head: true, name: 'Your drawings', sub: n ? n + (n === 1 ? ' drawing' : ' drawings') : 'none on this chart', up, dn, col: '#4FD8F7' });
        for (let j = n - 1; j >= 0; j--){ const it = Draw.items[j]; rows.push({ id: 'd:' + it.id, kid: true, name: Draw.LABELS[it.type] || (it.type === 'measure' ? 'Measurement' : it.type) || 'Drawing', sub: this.drawSub(it), col: it.color || '#4FD8F7', on: !it.hidden, eye: true, del: true, pick: true, sel: Draw.sel === it.id, up: j < n - 1, dn: j > 0 }); } continue; }
      const P = this.PAINTERS[k] || ['', k]; let sub = ''; if (k === 'pos'){ try { const n = PosLines.shownRows().length; sub = n + (n === 1 ? ' position' : ' positions') + ' on this chart'; } catch(e){} }
      rows.push(k === 'vp' ? { id: 'p:vp', name: P[1], sub: 'volume at each price', on: s.on, eye: true, eyeAttr: 'data-indeye="vp" data-indwin="main"', del: true, delAttr: 'data-indoff="vp" data-indwin="main"', cfg: true, up, dn, col: '#7B8FB8' }
        : { id: 'p:' + k, name: s.b ? (this.clean(s.b.textContent) || P[1]) : P[1], sub, on: s.on, eye: true, up, dn, col: k === 'pos' ? '#FFB648' : '#A78BFA' }); }
    return rows; },
  rowsPen(){ if (typeof Draws === 'undefined' || typeof ChartPlus === 'undefined') return []; const I = Draws.is(ChartPlus.key()), n = I.length; return I.map((k, j) => ({ id: 'k:' + k.id, kid: true, name: ((typeof Ink !== 'undefined' && Ink.PENS.find(p => p[0] === k.pen)) || [0, 'Pen'])[1] + ' stroke', sub: k.pts.length + ' points' + (k.off ? ' · hidden' : ''), col: k.c, on: !k.off, eye: true, del: true, up: j < n - 1, dn: j > 0 })).reverse(); },
  rowsMarks(){ if (typeof Marks === 'undefined') return []; return Marks.all().filter(m => m.sym === STORE.symbol).map(m => ({ id: 'm:' + m.id, kid: true, name: (m.dir > 0 ? 'Up' : 'Down') + ' mark', sub: m.price != null ? 'at ' + this.px(m.price) : '', col: m.dir > 0 ? '#3DDC97' : '#FF6B7A', del: true })).reverse(); },
  /* indicators: what the chart really holds (its series) and what is switched on but hidden */
  rowsInd(){ if (typeof Chart === 'undefined' || !Chart.settings) return {}; const by = {}, label = {}, put = (id, t) => { (by[t] = by[t] || []); if (!by[t].includes(id)) by[t].push(id); };
    try { for (const d of INDS) label[d.id] = d.label; } catch(e){} try { for (const d of JM_INDS) label[d.id] = label[d.id] || d.label || d.name; } catch(e){}
    for (const key of Object.keys(Chart.series || {})){ const at = key.lastIndexOf('@'), id = key.slice(0, key.indexOf('|')); if (at > 0 && id) put(id, key.slice(at + 1)); }
    for (const id of Object.keys(Chart.settings)){ const c = Chart.settings[id]; if (c && c.on && label[id]){ let T = ['main']; try { T = Chart.targetsOf(c); } catch(e){} for (const t of T) put(id, t); } }
    const out = {}; for (const t of Object.keys(by)) out[t] = by[t].filter(id => id !== 'vp').map(id => { const c = Chart.settings[id], k = Object.keys(Chart.series || {}).find(q => q.startsWith(id + '|') && q.endsWith('@' + t)), look = k && Chart.series[k].look ? String(Chart.series[k].look).split('|')[0] : '#5C6F92', on = c ? !Chart.hiddenIn(c, t) : true; let sub = ''; try { const d = INDS.find(x => x.id === id); if (d && c) sub = Chart.paramText(d, c) || ''; } catch(e){}
      return c ? { id: 'i:' + id + '@' + t, name: label[id] || id, sub: sub + (on ? '' : (sub ? ' · ' : '') + 'hidden'), col: look, on, eye: true, eyeAttr: 'data-indeye="' + this.esc(id) + '" data-indwin="' + this.esc(t) + '"', del: true, delAttr: 'data-indoff="' + this.esc(id) + '" data-indwin="' + this.esc(t) + '"', cfg: true } : { id: 'i:' + id + '@' + t, name: label[id] || id, col: look }; });
    return out; },
  rowsOther(){ const out = [], used = Object.values(this.PAINTERS).map(p => p[0]); let ids = ['jmMarkBtn', 'lensBtn']; try { if (typeof SidePeek !== 'undefined') ids = Object.keys(SidePeek.OVER).filter(id => !used.includes(id)); } catch(e){}
    for (const id of ids){ const b = this.$(id); if (!b || b.hidden) continue; const on = b.classList.contains('on'); if (on) this.seen[id] = 1; if (on || this.seen[id]) out.push({ id: 'o:' + id, name: this.clean(b.textContent) || id, sub: on ? '' : 'switched off', on, eye: true, col: '#A78BFA' }); }
    const sel = this.$('chartLabelMode'); if (sel){ const v = sel.value; for (const [k, nm] of [['patterns', 'Candlestick pattern labels'], ['confluence', 'Confluence labels']]){ const on = v === k || v === 'both'; if (on) this.seen['lab:' + k] = 1; if (on || this.seen['lab:' + k]) out.push({ id: 'o:lab:' + k, name: nm, sub: on ? '' : 'switched off', on, eye: true, col: '#FFB648' }); } }
    return out; },
  /* every group of the chart's stack, top first */
  chartGroups(){ const S = this.load(), G = [], gh = this.$('ghLayer');
    const top = []; if (gh && gh.children.length && !gh.hidden) top.push({ id: 'g:ghost', name: 'Ended trade', sub: 'its entry, exit, stop and target', col: '#FFB648', del: true });
    for (const id of Object.keys(this.UI)) if (this.$(id)) top.push({ id: 'u:' + id, name: this.UI[id], sub: 'in the corner of the chart', on: !S.hid['u:' + id], eye: true, col: '#7C8BA8' });
    G.push({ id: 'top', title: 'On top', note: 'always over everything', rows: top });
    const order = this.planeOrder(), have = order.filter(k => this.planeEl(k)); this._shownPl = have;
    for (let i = order.length - 1; i >= 0; i--){ const k = order[i], el = this.planeEl(k); if (!el) continue; const P = this.PLANES[k] || ['', 'Other layer', k.slice(4)], hi = have.indexOf(k);
      const rows = k === 'draw' ? this.rowsDraw() : k === 'pen' ? this.rowsPen() : k === 'marks' ? this.rowsMarks() : [];
      if ((k === 'levels' && !el.children.length) || (k === 'beacons' && !el.children.length)) { G.push({ id: 'pl:' + k, plane: k, title: P[1], note: 'nothing on it now', rows: [], on: !S.hid['pl:' + k], up: hi < have.length - 1, dn: hi > 0, alpha: S.alpha[k], empty: true }); continue; }
      G.push({ id: 'pl:' + k, plane: k, title: P[1], note: P[2], rows, on: !S.hid['pl:' + k], up: hi < have.length - 1, dn: hi > 0, alpha: S.alpha[k] }); }
    const ind = this.rowsInd(), cmp = Object.keys((typeof Chart !== 'undefined' && Chart.cmpSeries) || {}).map(s => ({ id: 'c:' + s, name: s, sub: 'compared with this chart', col: (Chart.cmpColors && Chart.cmpColors[s]) || '#A78BFA', del: true }));
    const al = (typeof Chart !== 'undefined' && Chart.alertLines && Chart.alertLines.length) || 0, base = this.rowsOther().concat(cmp, ind.main || []);
    if (al) base.push({ id: 'a:alerts', name: 'Alert lines', sub: al + (al === 1 ? ' line' : ' lines') + ' · managed in Alerts', col: '#FFB648' });
    base.push({ id: 'x:candles', name: 'Candles', sub: (typeof STORE !== 'undefined' ? STORE.symbol + ' · ' + STORE.tf : ''), on: !S.hid['x:candles'], eye: true, col: '#3DDC97' });
    G.push({ id: 'chart', title: 'The chart', note: 'under every plane · painted in the order they were added', rows: base });
    for (const t of Object.keys(ind).filter(t => t !== 'main').sort()) G.push({ id: 'win:' + t, title: 'Window ' + (t.replace(/^p/, '') || t), note: 'under the chart', rows: ind[t] });
    return G; },

  /* =============================== the Replay =============================== */
  RCOL: { trade: '#4FD8F7', zones: '#FF6B7A', channel: '#4FD8F7', events: '#E6EEFF', ma: '#FFB648', bb: '#A78BFA', st: '#3DDC97', vwap: '#E6EEFF', fvg: '#4FD8F7', ob: '#FFB648', bos: '#A78BFA', sweep: '#FF6BD6', div: '#FFB648', sig: '#3DDC97', vol: '#5C6F92', candles: '#3DDC97' },
  replayRows(){ if (typeof Replay === 'undefined' || !Replay.V) return []; const R = Replay, L = R.layers(), po = R.paintOrder(), g = R.dg(), key = R.dkey(), name = Object.fromEntries(R.LAYERS.map(x => [x[0], x])), out = [];
    for (let i = po.length - 1; i >= 0; i--){ const k = po[i], up = i < po.length - 1, dn = i > 0;
      if (k === 'draws'){ const M = Draws.ms(key), Ls = Draws.ls(key), I = Draws.is(key), n = M.length + Ls.length + I.length; out.push({ id: 'L:draws', head: true, name: 'Your drawings', sub: n ? n + (n === 1 ? ' drawing' : ' drawings') + ' · shared with Inspect' : 'none on this chart', up, dn, col: '#4FD8F7' }); if (!g) continue;
        const sel = Draws.sel && Draws.sel.key === key ? Draws.sel.id : null, kid = (o, j, len, nm, sub, col) => out.push({ id: 'D:' + o.id, kid: true, name: nm, sub: sub + (o.off ? ' · hidden' : ''), col, on: !o.off, eye: true, del: true, edit: true, sel: o.id === sel, up: j < len - 1, dn: j > 0 });
        for (let j = M.length - 1; j >= 0; j--){ const m = M[j], r = Draws.info(g, m); kid(m, j, M.length, 'Measurement ' + (r.side ? (r.side > 0 ? 'as a buy ' : 'as a sell ') : '') + Draws.sg(r.pct, 2) + '%', r.n + ' candles · ' + g.dur(r.sec), r.good ? '#3DDC97' : '#FF6B7A'); }
        for (let j = Ls.length - 1; j >= 0; j--){ const l = Ls[j]; kid(l, j, Ls.length, l.k === 'h' ? 'Price line ' + g.px(l.p) : 'Time line', l.k === 'h' ? 'across the chart' : g.date(l.t), l.c); }
        for (let j = I.length - 1; j >= 0; j--){ const s = I[j]; kid(s, j, I.length, ((typeof Ink !== 'undefined' && Ink.PENS.find(p => p[0] === s.pen)) || [0, 'Pen'])[1] + ' stroke', s.pts.length + ' points', s.c); }
        continue; }
      if (k === 'candles'){ out.push({ id: 'L:candles', name: 'Candles', sub: typeof Fantasy !== 'undefined' && Fantasy.on ? 'drawn as the Fantasy land' : 'open, high, low and close', on: L.candles !== false, eye: true, up, dn, col: this.RCOL.candles }); continue; }
      const d = name[k]; if (!d) continue; out.push({ id: 'L:' + k, name: d[1], sub: d[2], on: !!L[k], eye: true, up, dn, col: this.RCOL[k] || '#7C8BA8' }); }
    out.push({ id: 'O:osc', name: R.osc === 'wt' ? 'WaveTrend pane' : 'RSI pane', sub: 'the window under the price', on: R.osc !== 'none', eye: true, col: '#4FD8F7' });
    return out; },

  /* =============================== drawing the rows =============================== */
  rowHtml(r){ const E = this.esc.bind(this), off = r.on === false, eyeT = off ? 'Show it on the chart again' : 'Hide it from the chart (it stays in this list)';
    return '<div class="skRow' + (r.head ? ' skSub' : '') + (r.kid ? ' kid' : '') + (off ? ' off' : '') + (r.sel ? ' sel' : '') + '" data-id="' + E(r.id) + '">' +
      (r.eye ? '<button type="button" class="skEye" ' + (r.eyeAttr || 'data-sk="eye"') + ' title="' + eyeT + '" aria-label="' + eyeT + ': ' + E(r.name) + '" aria-pressed="' + !off + '">' + (off ? this.EYE0 : this.EYE) + '</button>' : '<span class="skEye none"></span>') +
      '<i class="skDot" style="--c:' + E(r.col || '#5C6F92') + '"></i>' +
      '<' + (r.pick || r.edit ? 'button type="button" data-sk="pick" title="' + (r.edit ? 'Select it on the chart and open its card' : 'Select it on the chart') + '"' : 'span') + ' class="skName"><b>' + E(r.name) + '</b>' + (r.sub ? '<span>' + E(r.sub) + '</span>' : '') + '</' + (r.pick || r.edit ? 'button' : 'span') + '>' +
      '<span class="skAct">' + (r.edit ? '<button type="button" class="skBtn" data-sk="pick" title="Edit it" aria-label="Edit ' + E(r.name) + '">✎</button>' : '') + (r.cfg ? '<button type="button" class="skBtn" data-sk="cfg" title="Settings" aria-label="Settings of ' + E(r.name) + '">⚙</button>' : '') +
      (r.up != null ? '<button type="button" class="skBtn" data-sk="up"' + (r.up ? '' : ' disabled') + ' title="One step up: painted over the row above" aria-label="Move ' + E(r.name) + ' up">▲</button><button type="button" class="skBtn" data-sk="dn"' + (r.dn ? '' : ' disabled') + ' title="One step down: painted under the row below" aria-label="Move ' + E(r.name) + ' down">▼</button>' : '') +
      (r.del ? '<button type="button" class="skBtn del" ' + (r.delAttr || 'data-sk="del"') + ' title="Remove it" aria-label="Remove ' + E(r.name) + '">✕</button>' : '') + '</span></div>'; },
  groupHtml(G){ const E = this.esc.bind(this), S = this.load(), fold = !!S.fold[G.id], off = G.on === false, n = G.rows.filter(r => !r.head).length;
    let h = '<section class="skGroup' + (G.plane ? ' plane' : '') + (off ? ' off' : '') + (fold ? ' fold' : '') + '" data-id="' + E(G.id) + '"><header class="skHead">' +
      (G.plane ? '<button type="button" class="skEye" data-sk="eye" title="' + (off ? 'Show this whole plane again' : 'Hide this whole plane') + '" aria-label="' + (off ? 'Show' : 'Hide') + ' ' + E(G.title) + '" aria-pressed="' + !off + '">' + (off ? this.EYE0 : this.EYE) + '</button>' : '') +
      '<button type="button" class="skTitle" data-sk="fold" aria-expanded="' + !fold + '" title="' + (fold ? 'Open' : 'Fold') + '"><b>' + E(G.title) + '</b><span>' + (n ? n + (n === 1 ? ' layer' : ' layers') + ' · ' : '') + E(G.note || '') + '</span></button>' +
      (G.plane ? '<span class="skAct"><button type="button" class="skBtn" data-sk="up"' + (G.up ? '' : ' disabled') + ' title="This whole plane one step up, over the plane above" aria-label="Move ' + E(G.title) + ' up">▲</button><button type="button" class="skBtn" data-sk="dn"' + (G.dn ? '' : ' disabled') + ' title="This whole plane one step down" aria-label="Move ' + E(G.title) + ' down">▼</button></span>' : '') + '</header>';
    if (G.plane && !fold) h += '<label class="skAlpha"><span>See-through</span><input type="range" min="15" max="100" step="5" value="' + Math.round((G.alpha == null ? 1 : G.alpha) * 100) + '" data-sk="alpha" aria-label="How solid ' + E(G.title) + ' is"><b>' + Math.round((G.alpha == null ? 1 : G.alpha) * 100) + '%</b></label>';
    if (!fold) h += '<div class="skRows">' + (G.rows.length ? G.rows.map(r => this.rowHtml(r)).join('') : '<p class="skNone">' + (G.empty ? 'Nothing on it now.' : 'Nothing here.') + '</p>') + '</div>';
    return h + '</section>'; },
  paint(force){ const host = this.$('skChart'), tab = this.$('tab-tsstack'); if (!host || !tab || !tab.classList.contains('active') || typeof Draw === 'undefined') return; let G; try { G = this.chartGroups(); } catch(e){ console.warn('stack', e); return; }
    const sig = JSON.stringify(G) + JSON.stringify(this.load().fold); if (!force && sig === this._sig) return; if (!force && host.contains(document.activeElement) && document.activeElement.type === 'range') return; this._sig = sig; const y = host.scrollTop;
    host.innerHTML = '<div class="skIntro"><b>Stack</b><span>Everything on this chart, top row painted last. The eye hides a layer and keeps it here; ▲ ▼ put it over or under its neighbours.</span><button type="button" class="skReset" data-sk="reset" title="Put every plane and overlay back in the order the chart has by default, fully solid and visible">Default order</button></div>' + G.map(g => this.groupHtml(g)).join('') + '<p class="skFoot">An overlay that is switched off is not listed: switch it on in Layers and it appears here.</p>'; host.scrollTop = y; },
  paintReplay(force){ const body = this.$('rpStackBody'); if (!body || typeof Replay === 'undefined' || !Replay.V) return; let rows; try { rows = this.replayRows(); } catch(e){ console.warn('stack', e); return; } const sig = JSON.stringify(rows); if (!force && sig === this._rsig && body.children.length) return; this._rsig = sig;
    body.innerHTML = '<p class="skLead">Top row painted last. The eye hides a layer; ▲ ▼ put it over or under its neighbours; a drawing has ✎ to edit and ✕ to remove.</p><div class="skRows">' + rows.map(r => this.rowHtml(r)).join('') + '</div><button type="button" class="skReset" data-sk="reset" title="Paint the layers in the order the Replay has by default">Default order</button>'; },

  /* =============================== what a press does =============================== */
  after(){ this.apply(); this._sig = ''; this.paint(true); },
  act(id, what, el){ const S = this.load(), k = id.slice(id.indexOf(':') + 1), kind = id.slice(0, id.indexOf(':'));
    if (what === 'reset'){ S.planes = []; S.paint = []; S.alpha = {}; for (const q of Object.keys(S.hid)) if (q !== 'x:candles') delete S.hid[q]; if (S.hid['x:candles']) S.hid['x:candles'] = false; this.save(); return this.after(); }
    if (what === 'fold'){ S.fold[id] = !S.fold[id]; this.save(); return this.after(); }
    if (kind === 'pl'){ if (what === 'eye') S.hid[id] = !S.hid[id]; else if (what === 'up' || what === 'dn'){ const o = this.planeOrder(); if (this.step(o, k, what === 'up' ? 1 : -1, this._shownPl)) S.planes = o; } this.save(); return this.after(); }
    if (kind === 'u'){ if (what === 'eye'){ S.hid[id] = !S.hid[id]; this.save(); } return this.after(); }
    if (kind === 'x'){ if (what === 'eye'){ S.hid[id] = !S.hid[id]; this.save(); } return this.after(); }
    if (kind === 'g'){ if (what === 'del' && typeof Ghost !== 'undefined') Ghost.hide(); return this.after(); }
    if (kind === 'p'){ if (what === 'up' || what === 'dn'){ const o = this.paintOrder(); if (this.step(o, k, what === 'up' ? 1 : -1, this._shownP)){ S.paint = o; this.save(); } }
      else if (what === 'eye'){ const P = this.PAINTERS[k], b = P && P[0] ? this.$(P[0]) : null; if (b) b.click(); else { S.hid[id] = !S.hid[id]; this.save(); } }
      else if (what === 'cfg' && k === 'vp'){ try { App.openIndProps('vp', 'main'); } catch(e){} } return setTimeout(() => this.after(), 60); }
    if (kind === 'd'){ const it = Draw.byId(k) || Draw.items.find(x => String(x.id) === k); if (!it) return this.after(); const i = Draw.items.indexOf(it);
      if (what === 'eye'){ it.hidden = !it.hidden; if (it.hidden && Draw.sel === it.id) Draw.deselect(); Draw.save(); Draw.redraw(); }
      else if (what === 'del') Draw.remove(it.id);
      else if (what === 'pick'){ if (!it.hidden) Draw.sel === it.id ? Draw.deselect() : Draw.select(it.id); }
      else if (what === 'up' || what === 'dn'){ const j = i + (what === 'up' ? 1 : -1); if (j >= 0 && j < Draw.items.length){ Draw.items[i] = Draw.items[j]; Draw.items[j] = it; Draw.save(); Draw.redraw(); } } return this.after(); }
    if (kind === 'k'){ const key = ChartPlus.key(); if (what === 'eye') Draws.toggle(key, k); else if (what === 'del') Draws.remove(key, k); else if (what === 'up' || what === 'dn') Draws.shift(key, k, what === 'up' ? 1 : -1); try { ChartPlus.paint(); } catch(e){} return this.after(); }
    if (kind === 'm'){ if (what === 'del'){ Marks.save(Marks.all().filter(x => String(x.id) !== k)); try { Marks.draw(); } catch(e){} } return this.after(); }
    if (kind === 'i'){ if (what === 'cfg'){ const at = k.lastIndexOf('@'); try { App.openIndProps(k.slice(0, at), k.slice(at + 1)); } catch(e){} } return setTimeout(() => this.after(), 80); }
    if (kind === 'c'){ if (what === 'del'){ try { Chart.removeCompare(k); } catch(e){} } return setTimeout(() => this.after(), 80); }
    if (kind === 'o'){ if (what === 'eye'){ if (k.startsWith('lab:')){ const sel = this.$('chartLabelMode'), w = k.slice(4), o = w === 'patterns' ? 'confluence' : 'patterns'; if (sel){ const v = sel.value, has = v === w || v === 'both', oth = v === o || v === 'both'; sel.value = has ? (oth ? o : 'none') : (oth ? 'both' : w); sel.dispatchEvent(new Event('change', { bubbles: true })); } } else { const b = this.$(k); if (b) b.click(); } } return setTimeout(() => this.after(), 60); }
    this.after(); },
  actReplay(id, what){ const R = Replay; if (!R.V) return; const k = id.slice(2), key = R.dkey(), done = () => { try { R.paintDw(); R.draw(); } catch(e){} this.paintReplay(true); };
    if (what === 'reset'){ R.setPaintOrder(null); return done(); }
    if (id === 'O:osc'){ if (what === 'eye'){ if (R.osc !== 'none'){ this._osc = R.osc; R.osc = 'none'; } else R.osc = this._osc || 'rsi'; R.restage(); } return this.paintReplay(true); }
    if (id.startsWith('L:')){ if (what === 'eye'){ const L = R.layers(); if (k === 'candles') L.candles = L.candles === false; else if (k !== 'draws') L[k] = !L[k]; R.saveLayers(); R.restage(); return this.paintReplay(true); }
      if (what === 'up' || what === 'dn'){ const o = R.paintOrder().slice(); if (this.step(o, k, what === 'up' ? 1 : -1)) R.setPaintOrder(o); } return done(); }
    if (id.startsWith('D:')){ if (what === 'eye') Draws.toggle(key, k); else if (what === 'del') Draws.remove(key, k); else if (what === 'up' || what === 'dn') Draws.shift(key, k, what === 'up' ? 1 : -1);
      else if (what === 'pick'){ const f = Draws.find(key, k), cv = R.$('rpCv'); if (f && cv){ if (f.o.off) Draws.toggle(key, k); Draws.sel = { key, id: k }; Draws._host = cv.parentElement; Draws._onChange = done; done(); Draws.card(cv.parentElement, key, k, 14, 44, done); cv.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); return; } }
      return done(); } },

  /* =============================== wiring =============================== */
  clicks(root, replay){ root.addEventListener('click', e => { const b = e.target.closest('[data-sk]'); if (!b || b.dataset.sk === 'alpha') { if (e.target.closest('[data-indeye], [data-indoff]')) setTimeout(() => this.after(), 120); return; } const row = b.closest('[data-id]'), id = row ? row.dataset.id : ''; if (b.dataset.sk !== 'reset' && !id) return; e.preventDefault(); replay ? this.actReplay(id, b.dataset.sk) : this.act(id, b.dataset.sk, b); });
    if (!replay) root.addEventListener('input', e => { const r = e.target.closest('[data-sk="alpha"]'); if (!r) return; const g = r.closest('[data-id]'), k = g.dataset.id.slice(3), v = Math.max(0.15, Math.min(1, +r.value / 100)), S = this.load(); if (v >= 1) delete S.alpha[k]; else S.alpha[k] = v; const out = r.parentElement.querySelector('b'); if (out) out.textContent = Math.round(v * 100) + '%'; this.save(); this.apply(); }); },
  tab(){ if (this.$('tab-tsstack')) return true; const st = this.$('sideTabs'), body = document.querySelector('#sidebar .sideBody'); if (!st || !body || typeof Draw === 'undefined') return false;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'tsstack'; b.className = 'tsOnlyFace'; b.title = 'Stack: every thing on the chart as a layer, top to bottom'; b.innerHTML = this.ICON + '<span>STACK</span>';
    const tabs = st.querySelectorAll('button[data-tab]'), last = tabs[tabs.length - 1]; st.insertBefore(b, last ? last.nextSibling : null);
    b.addEventListener('click', () => { st.querySelectorAll('button[data-tab]').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('#sidebar .sidePanel').forEach(p => p.classList.toggle('active', p.id === 'tab-tsstack')); try { if (typeof Face !== 'undefined') Face.sideNames(); } catch(e){} this.paint(true); });
    const p = document.createElement('div'); p.id = 'tab-tsstack'; p.className = 'sidePanel tsOnlyFace'; p.innerHTML = '<div class="skPanel" id="skChart"></div>'; body.appendChild(p); this.clicks(p, false);
    try { if (typeof TabOrder !== 'undefined' && TabOrder.apply) TabOrder.apply(); } catch(e){} try { if (typeof SideLook !== 'undefined' && SideLook.dress) SideLook.dress(); } catch(e){} return true; },
  /* the Replay draws its side column in one go: the card is put back after each drawing */
  replayCard(){ const side = this.$('rpSide'); if (!side || typeof Replay === 'undefined' || !Replay.V) return; let c = this.$('rpStack');
    if (!c || c.parentElement !== side){ c = document.createElement('div'); c.className = 'rpCard rpStackCard'; c.id = 'rpStack'; c.innerHTML = '<small>LAYERS ON THIS CHART</small><div class="skPanel" id="rpStackBody"></div>'; side.insertBefore(c, side.children[1] || null); this.clicks(c, true); this._rsig = ''; try { if (typeof ReplaySig !== 'undefined') ReplaySig.sections(); } catch(e){} }
    this.paintReplay(); },
  wrapReplay(){ if (typeof Replay === 'undefined' || Replay._skWrap) return typeof Replay !== 'undefined'; Replay._skWrap = true; const R = Replay;
    for (const fn of ['paintSide', 'paintDw', 'restage']){ const o = R[fn]; if (typeof o !== 'function') continue; R[fn] = (...a) => { const r = o.apply(R, a); try { this.replayCard(); } catch(e){} return r; }; } return true; },
  init(){ this.load(); let n = 0; const go = () => { const a = this.tab(), b = this.wrapReplay(); if ((!a || !b) && ++n < 60) setTimeout(go, 300); }; go();
    setInterval(() => { try { this.apply(); this.paint(); if (this.$('rpStackBody') && this.$('rpStack').offsetParent) this.paintReplay(); } catch(e){} }, 1200);
    new MutationObserver(() => { try { this.apply(); } catch(e){} }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-face'] }); },
};
Stack.init();
