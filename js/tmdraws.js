/* ASTRA / Timurila — your drawings on the studio charts: measurements, price lines, time lines.

   Shared by the Inspect studio and the Replay studio, and stored per instrument and timeframe, so a
   line you draw in Inspect is there when you replay a trade on the same chart, and the other way round.

     · MEASURE     drag from one point to another: the move in price, %, money for one lot, the number
                   of candles, the time it took, and the start and end date and time;
     · PRICE LINE  a glowing line across the whole chart, with its price and its distance from the
                   last price; two of them show the gap between them in price, % and money;
     · TIME LINE   a glowing line from top to bottom, with its date; two of them show the candles and
                   the time between them.

   Every drawing can be edited: click it to select it (handles appear), drag it or its ends to move
   it, and a small card offers Hide from the chart (kept in your list, shown again with one click),
   Remove, and a colour. Right-click removes it at once. The measuring tape sticks to your lines.

   A measurement carries two small buttons on its label, with any tool in hand: the pencil opens its card
   (read it as a buy, a sell or the plain price; type its two prices), the cross removes it. With the
   ruler in hand, pressing an end of a measurement moves that end; it does not start a new one. Delete
   removes the drawing that is selected.

   A studio hands over its geometry as g = { X(i), Y(p), P(y), I(x), idx(t), T(i), w, h, W, padR,
   date(t, full), px(p), dur(sec), pv, ccy, last }. Read-only apart from your own drawings. */
const Draws = {
  KM: 'astra_inspect_marks', KL: 'astra_inspect_lines', KI: 'astra_draw_ink', COL: ['#4FD8F7', '#FFB648', '#A78BFA', '#FF6BD6', '#3DDC97', '#FF6B7A'],
  sel: null, op: null,
  base(s){ return String(s || '').replace(/\.(s|m|std)$/i, '').toUpperCase(); },
  key(sym, tf){ return this.base(sym) + '|' + tf; },
  uid(){ return 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); },
  /* one list per instrument and timeframe; older lists stored under the full broker name are merged in */
  read(store, key){ let o = {}; try { o = JSON.parse(localStorage.getItem(store) || '{}') || {}; } catch(e){} let list = o[key] ? o[key].slice() : [];
    for (const k of Object.keys(o)){ if (k === key) continue; const i = k.lastIndexOf('|'); if (this.key(k.slice(0, i), k.slice(i + 1)) === key) list = list.concat(o[k]); }
    let fix = false; list = list.map(x => { if (x.id) return x; fix = true; return Object.assign({ id: this.uid() }, x); }); if (fix) this.write(store, key, list); return list; },
  write(store, key, list){ let o = {}; try { o = JSON.parse(localStorage.getItem(store) || '{}') || {}; } catch(e){}
    for (const k of Object.keys(o)){ const i = k.lastIndexOf('|'); if (k !== key && this.key(k.slice(0, i), k.slice(i + 1)) === key) delete o[k]; }
    if (list.length) o[key] = list.slice(-80); else delete o[key]; try { localStorage.setItem(store, JSON.stringify(o)); } catch(e){} },
  ms(key){ return this.read(this.KM, key); }, ls(key){ return this.read(this.KL, key); }, is(key){ return this.read(this.KI, key); }, saveI(key, L){ this.write(this.KI, key, L); },
  count(key){ return this.ms(key).length + this.ls(key).length + this.is(key).length; },
  saveM(key, L){ this.write(this.KM, key, L); }, saveL(key, L){ this.write(this.KL, key, L); },
  find(key, id){ const m = this.ms(key).find(x => x.id === id); if (m) return { type: 'm', o: m }; const l = this.ls(key).find(x => x.id === id); if (l) return { type: 'l', o: l }; const k = this.is(key).find(x => x.id === id); return k ? { type: 'i', o: k } : null; },
  update(key, id, fn){ const M = this.ms(key), L = this.ls(key); let k = M.findIndex(x => x.id === id); if (k >= 0){ const r = fn(M[k]); if (r === null) M.splice(k, 1); this.saveM(key, M); return; } k = L.findIndex(x => x.id === id); if (k >= 0){ const r = fn(L[k]); if (r === null) L.splice(k, 1); this.saveL(key, L); return; } const I = this.is(key); k = I.findIndex(x => x.id === id); if (k >= 0){ const r = fn(I[k]); if (r === null) I.splice(k, 1); this.saveI(key, I); } },
  /* one step up (d = 1, painted later, so on top) or down among its own kind */
  shift(key, id, d){ for (const [get, put] of [[k => this.ms(k), (k, L) => this.saveM(k, L)], [k => this.ls(k), (k, L) => this.saveL(k, L)], [k => this.is(k), (k, L) => this.saveI(k, L)]]){ const L = get(key), i = L.findIndex(x => x.id === id), j = i + d; if (i < 0) continue; if (j < 0 || j >= L.length) return false; const t = L[i]; L[i] = L[j]; L[j] = t; put(key, L); return true; } return false; },
  /* ink keeps exact times between candles: a fractional candle index, both ways */
  fi(g, t){ const i = g.idx(t), t0 = g.T(i), t1 = g.T(i + 1), sp = t1 > t0 ? t1 - t0 : (t0 - g.T(i - 1)) || 1; return i + (t - t0) / sp; },
  tAt(g, x){ const f = g.F ? g.F(x) : g.I(x), i = Math.floor(f), t0 = g.T(i), t1 = g.T(i + 1), sp = t1 > t0 ? t1 - t0 : (t0 - g.T(i - 1)) || 1; return t0 + (f - i) * sp; },
  px2(g, s){ return s.pts.map(q => [g.X(this.fi(g, q[0])), g.Y(q[1])]); },

  /* ---------- what a measurement says ---------- */
  /* a measurement read from a side: on a sell, the price going down is the profit; on a buy, going up. side 0 = the plain price move */
  sideOf(g, m){ return m.side != null ? m.side : (g.side || 0); },
  info(g, m){ const i0 = g.idx(m.t0), i1 = g.idx(m.t1), d = m.p1 - m.p0, side = this.sideOf(g, m), res = side ? side * d : d;
    return { i0, i1, d, side, res, good: res >= 0, movePct: d / m.p0 * 100, pct: res / m.p0 * 100, n: Math.abs(i1 - i0), sec: m.t1 - m.t0, money: side && g.money ? g.money(res) : g.pv ? res * g.pv : null, perLot: !(side && g.money) }; },
  sg(v, d){ return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },

  /* ---------- drawing ---------- */
  draw(c, g, key){ this._gside = g.side || 0; this._btn = []; this._lab = []; this._dkey = key; const L = this.ls(key).filter(x => !x.off), M = this.ms(key).filter(x => !x.off), sel = this.sel && this.sel.key === key ? this.sel.id : null;
    for (const k of this.is(key).filter(x => !x.off)) Ink.stroke(c, this.px2(g, k), k, k.id === sel); if (this.op && this.op.mode === 'ink' && this.op.key === key) Ink.stroke(c, this.px2(g, this.op.s), this.op.s);
    this.drawLines(c, g, L, sel); for (const m of M) this.drawM(c, g, m, m.id === sel); if (this.op && this.op.mode === 'new' && this.op.key === key) this.drawM(c, g, this.op.m, true, true); },
  pill(c, txt, x, y, col, align){ c.font = '700 10.5px JetBrains Mono, monospace'; const w = c.measureText(txt).width + 12, x0 = align === 'right' ? x - w : align === 'center' ? x - w / 2 : x; c.fillStyle = col; c.beginPath(); c.roundRect ? c.roundRect(x0, y - 9, w, 18, 6) : c.rect(x0, y - 9, w, 18); c.fill(); c.fillStyle = '#04121A'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, x0 + 6, y); },
  handle(c, x, y, col){ c.fillStyle = '#060A12'; c.strokeStyle = col; c.lineWidth = 2; c.beginPath(); c.arc(x, y, 5.5, 0, 6.3); c.fill(); c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(x, y, 2, 0, 6.3); c.fill(); },
  drawLines(c, g, L, sel){ const H = L.filter(l => l.k === 'h').sort((a, b) => b.p - a.p), V = L.filter(l => l.k === 'v').map(l => Object.assign({ i: g.idx(l.t) }, l)).sort((a, b) => a.i - b.i), R = g.w;
    for (const l of H){ const y = Math.round(g.Y(l.p)) + 0.5, on = l.id === sel; if (y < 0 || y > g.h) continue; c.save(); c.strokeStyle = l.c; c.shadowColor = l.c; c.shadowBlur = on ? 18 : 10; c.lineWidth = on ? 2.4 : 1.6; c.beginPath(); c.moveTo(0, y); c.lineTo(R, y); c.stroke(); c.shadowBlur = 0; c.globalAlpha = on ? 0.16 : 0.08; c.fillStyle = l.c; c.fillRect(0, y - 5, R, 10); c.restore();
      this.pill(c, g.px(l.p), R - 4, y, l.c, 'right'); if (g.last){ const d = (l.p / g.last - 1) * 100; c.font = '600 10px Inter, sans-serif'; c.fillStyle = l.c; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText((d >= 0 ? '+' : '') + d.toFixed(2) + '% from the last price', 8, y - 9); }
      if (on){ this.handle(c, 30, y, l.c); this.handle(c, R / 2, y, l.c); } }
    for (const l of V){ const x = Math.round(g.X(l.i)) + 0.5, on = l.id === sel; if (x < 0 || x > R) continue; c.save(); c.strokeStyle = l.c; c.shadowColor = l.c; c.shadowBlur = on ? 18 : 10; c.lineWidth = on ? 2.4 : 1.6; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, g.h); c.stroke(); c.shadowBlur = 0; c.globalAlpha = on ? 0.16 : 0.08; c.fillStyle = l.c; c.fillRect(x - 5, 0, 10, g.h); c.restore();
      this.pill(c, g.date(l.t), x, g.h - 12, l.c, 'center'); if (on){ this.handle(c, x, 40, l.c); this.handle(c, x, g.h / 2, l.c); } }
    for (let k = 1; k < H.length; k++){ const a = H[k - 1], b = H[k], ya = g.Y(a.p), yb = g.Y(b.p), x = R - 96; if (Math.abs(yb - ya) < 22) continue; c.strokeStyle = 'rgba(230,238,255,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, ya + 3); c.lineTo(x, yb - 3); c.moveTo(x - 4, ya + 3); c.lineTo(x + 4, ya + 3); c.moveTo(x - 4, yb - 3); c.lineTo(x + 4, yb - 3); c.stroke();
      const txt = g.px(a.p - b.p) + ' · ' + ((a.p / b.p - 1) * 100).toFixed(2) + '%' + (g.pv ? ' · $' + Math.round((a.p - b.p) * g.pv).toLocaleString('en-US') + '/lot' : ''); c.font = '600 10px JetBrains Mono, monospace'; const w = c.measureText(txt).width + 12; c.fillStyle = 'rgba(6,10,18,.9)'; c.fillRect(x - w - 6, (ya + yb) / 2 - 9, w, 18); c.fillStyle = '#E6EEFF'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(txt, x - w, (ya + yb) / 2); }
    for (let k = 1; k < V.length; k++){ const a = V[k - 1], b = V[k], xa = g.X(a.i), xb = g.X(b.i), y = g.h - 46; if (xb - xa < 30) continue; c.strokeStyle = 'rgba(230,238,255,.55)'; c.lineWidth = 1; c.beginPath(); c.moveTo(xa + 3, y); c.lineTo(xb - 3, y); c.moveTo(xa + 3, y - 4); c.lineTo(xa + 3, y + 4); c.moveTo(xb - 3, y - 4); c.lineTo(xb - 3, y + 4); c.stroke();
      const txt = (b.i - a.i) + ' candles · ' + g.dur(b.t - a.t); c.font = '600 10px JetBrains Mono, monospace'; const w = c.measureText(txt).width + 12; c.fillStyle = 'rgba(6,10,18,.9)'; c.fillRect((xa + xb) / 2 - w / 2, y + 5, w, 17); c.fillStyle = '#E6EEFF'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, (xa + xb) / 2, y + 13.5); } },
  drawM(c, g, m, on, live){ const r = this.info(g, m), x0 = g.X(r.i0), x1 = g.X(r.i1), y0 = g.Y(m.p0), y1 = g.Y(m.p1), up = r.d >= 0, col = r.good ? '#3DDC97' : '#FF6B7A', W = g.w, H = g.h;
    c.save(); c.fillStyle = r.good ? 'rgba(61,220,151,' + (on ? .16 : .10) + ')' : 'rgba(255,107,122,' + (on ? .16 : .10) + ')'; c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1); c.strokeStyle = col; c.lineWidth = on ? 1.6 : 1; c.setLineDash(live ? [4, 3] : []); if (on){ c.shadowColor = col; c.shadowBlur = 12; } c.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0)); c.setLineDash([]);
    c.lineWidth = 1.8; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.shadowBlur = 0; const ah = Math.atan2(y1 - y0, x1 - x0); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - 9 * Math.cos(ah - 0.4), y1 - 9 * Math.sin(ah - 0.4)); c.lineTo(x1 - 9 * Math.cos(ah + 0.4), y1 - 9 * Math.sin(ah + 0.4)); c.closePath(); c.fillStyle = col; c.fill(); c.restore();
    const money = r.money != null ? '  ' + this.sg(r.money, 2) + ' ' + (g.ccy || '') + (r.perLot ? '/lot' : g.size ? ' · ' + g.size : '') : '';
    const lines = r.side ? [(r.side > 0 ? 'BUY  ' : 'SELL  ') + this.sg(r.pct, 2) + '%' + money, 'price ' + this.sg(r.d, Math.abs(r.d) >= 100 ? 1 : 4) + ' (' + this.sg(r.movePct, 2) + '%) · ' + r.n + ' candles · ' + g.dur(r.sec), g.date(m.t0, true) + '  →', g.date(m.t1, true)]
      : [this.sg(r.d, Math.abs(r.d) >= 100 ? 1 : 4) + '  (' + this.sg(r.pct, 2) + '%)' + money, r.n + ' candles · ' + g.dur(r.sec), g.date(m.t0, true) + '  →', g.date(m.t1, true)];
    c.font = '600 11px JetBrains Mono, monospace'; const w = Math.max(...lines.map(s => c.measureText(s).width)) + 18 + (live ? 0 : 44), bx = Math.max(4, Math.min(W - w - 4, (x0 + x1) / 2 - w / 2)), by = up ? Math.max(4, Math.min(y0, y1) - 76) : Math.min(H - 74, Math.max(y0, y1) + 8);
    c.fillStyle = 'rgba(6,10,18,.92)'; c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.roundRect ? c.roundRect(bx, by, w, 68, 9) : c.rect(bx, by, w, 68); c.fill(); c.stroke(); c.textAlign = 'left'; c.textBaseline = 'middle';
    lines.forEach((s, k) => { c.fillStyle = k === 0 ? col : k === 1 ? '#E6EEFF' : '#7C8BA8'; c.font = (k === 0 ? '700 ' : '500 ') + '11px JetBrains Mono, monospace'; c.fillText(s, bx + 9, by + 12 + k * 15); });
    if (!live && m.id){ const key = this._dkey, bw = 18, ex = bx + w - 46, dx = bx + w - 24, yy = by + 5; (this._lab = this._lab || []).push({ key, id: m.id, x: bx, y: by, w, h: 68 });
      for (const [kind, x] of [['edit', ex], ['del', dx]]){ c.fillStyle = kind === 'del' ? 'rgba(255,107,122,.16)' : 'rgba(79,216,247,.14)'; c.strokeStyle = kind === 'del' ? 'rgba(255,107,122,.7)' : 'rgba(79,216,247,.7)'; c.lineWidth = 1; c.beginPath(); c.roundRect ? c.roundRect(x + 0.5, yy + 0.5, bw, bw, 5) : c.rect(x + 0.5, yy + 0.5, bw, bw); c.fill(); c.stroke();
        c.strokeStyle = kind === 'del' ? '#FF8A96' : '#8FE6FF'; c.lineWidth = 1.6; c.lineCap = 'round'; c.beginPath();
        if (kind === 'del'){ c.moveTo(x + 6, yy + 6); c.lineTo(x + 13, yy + 13); c.moveTo(x + 13, yy + 6); c.lineTo(x + 6, yy + 13); } else { c.moveTo(x + 5.5, yy + 13.5); c.lineTo(x + 6.5, yy + 10.5); c.lineTo(x + 11.5, yy + 5.5); c.lineTo(x + 13.5, yy + 7.5); c.lineTo(x + 8.5, yy + 12.5); c.closePath(); }
        c.stroke(); (this._btn = this._btn || []).push({ key, id: m.id, kind, x: x - 2, y: yy - 2, w: bw + 4, h: bw + 4 }); } }
    if (on && !live){ this.handle(c, x0, y0, col); this.handle(c, x1, y1, col); } },

  /* ---------- pointing at things ---------- */
  hit(g, key, x, y){ const sel = this.sel && this.sel.key === key ? this.sel.id : null, live = id => this.ms(key).some(q => q.id === id && !q.off), inR = q => q.key === key && x >= q.x && x <= q.x + q.w && y >= q.y && y <= q.y + q.h;
    const bt = (this._btn || []).find(q => inR(q) && live(q.id)); if (bt) return { type: 'm', id: bt.id, part: 'btn', kind: bt.kind };
    for (const m of this.ms(key).filter(q => !q.off)){ const r = this.info(g, m), x0 = g.X(r.i0), x1 = g.X(r.i1), y0 = g.Y(m.p0), y1 = g.Y(m.p1); if ((x - x0) ** 2 + (y - y0) ** 2 < 81) return { type: 'm', id: m.id, part: 'A' }; if ((x - x1) ** 2 + (y - y1) ** 2 < 81) return { type: 'm', id: m.id, part: 'B' };
      if (m.id === sel && x > Math.min(x0, x1) && x < Math.max(x0, x1) && y > Math.min(y0, y1) && y < Math.max(y0, y1)) return { type: 'm', id: m.id, part: 'body' };
      const L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2, t = L2 ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / L2)) : 0, dx = x0 + t * (x1 - x0) - x, dy = y0 + t * (y1 - y0) - y; if (dx * dx + dy * dy < 36) return { type: 'm', id: m.id, part: 'body' }; }
    for (const k of this.is(key).filter(q => !q.off).reverse()){ const P = this.px2(g, k), tol = Math.max(7, (k.pen === 'highlight' ? k.w * 3 : k.pen === 'marker' ? k.w * 1.3 : k.w / 2) + 4); for (let j = 1; j < P.length; j++){ const [x0, y0] = P[j - 1], [x1, y1] = P[j], L2 = (x1 - x0) ** 2 + (y1 - y0) ** 2, u = L2 ? Math.max(0, Math.min(1, ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / L2)) : 0; if ((x0 + u * (x1 - x0) - x) ** 2 + (y0 + u * (y1 - y0) - y) ** 2 < tol * tol) return { type: 'i', id: k.id, part: 'body' }; } }
    const L = this.ls(key).filter(q => !q.off); for (let k = L.length - 1; k >= 0; k--){ const l = L[k]; if (l.k === 'h' && Math.abs(g.Y(l.p) - y) < 7 && x < g.w) return { type: 'l', id: l.id, part: 'h' }; if (l.k === 'v' && Math.abs(g.X(g.idx(l.t)) - x) < 7 && y < g.h) return { type: 'l', id: l.id, part: 'v' }; }
    const lb = (this._lab || []).find(q => inR(q) && live(q.id)); if (lb) return { type: 'm', id: lb.id, part: 'body' };
    return null; },
  snap(g, key, x, y){ let i = g.I(x), p = g.P(y); for (const l of this.ls(key).filter(q => !q.off)){ if (l.k === 'h' && Math.abs(g.Y(l.p) - y) < 8) p = l.p; if (l.k === 'v'){ const k = g.idx(l.t); if (Math.abs(g.X(k) - x) < 8) i = k; } } return { i, p }; },
  /* a press on the chart: returns true when a drawing took it (the studio then does not pan) */
  down(g, key, tool, x, y){ if (x < 0 || y < 0 || x > g.w || y > g.h) return false; this.closeCard();
    const h0 = this.hit(g, key, x, y); if (h0 && h0.part === 'btn'){ this.sel = { key, id: h0.id }; this.op = { mode: 'btn', key, id: h0.id, kind: h0.kind }; return true; }
    const own = h0 && ((tool === 'measure' && h0.type === 'm') || ((tool === 'hl' || tool === 'vl') && h0.type === 'l'));
    if (own){ /* falls through to the edit below */ } else
    if (tool === 'measure'){ const q = this.snap(g, key, x, y), t = g.T(q.i); this.op = { mode: 'new', key, m: { t0: t, p0: q.p, t1: t, p1: q.p, side: g.side || 0 } }; return true; }
    if (!own && tool === 'ink'){ const s = Ink.load(); this.op = { mode: 'ink', key, s: { pen: s.pen, c: s.c, w: s.w, tip: s.tip || 'round', pts: [[this.tAt(g, x), g.P(y)]] }, lx: x, ly: y }; return true; }
    if (!own && (tool === 'hl' || tool === 'vl')){ const L = this.ls(key), n = L.length, l = tool === 'hl' ? { id: this.uid(), k: 'h', p: g.P(y), c: this.COL[n % this.COL.length] } : { id: this.uid(), k: 'v', t: g.T(g.I(x)), c: this.COL[n % this.COL.length] }; L.push(l); this.saveL(key, L); this.sel = { key, id: l.id }; return true; }
    const h = this.hit(g, key, x, y); if (!h){ if (this.sel){ this.sel = null; } return false; }
    const f = this.find(key, h.id); this.sel = { key, id: h.id }; this.op = { mode: 'edit', key, h, x, y, orig: JSON.parse(JSON.stringify(f.o)), moved: false }; return true; },
  move(g, x, y){ const op = this.op; if (!op) return false; if (op.mode === 'btn') return true;
    if (op.mode === 'new'){ const q = this.snap(g, op.key, x, y); op.m.t1 = g.T(q.i); op.m.p1 = q.p; return true; }
    if (op.mode === 'ink'){ if (Math.hypot(x - op.lx, y - op.ly) > 2){ op.s.pts.push([this.tAt(g, x), g.P(y)]); op.lx = x; op.ly = y; } return true; }
    if (Math.abs(x - op.x) + Math.abs(y - op.y) > 3) op.moved = true; if (!op.moved) return true;
    const o = op.orig, h = op.h, di = g.I(x) - g.I(op.x), dp = g.P(y) - g.P(op.y);
    const dt = this.tAt(g, x) - this.tAt(g, op.x);
    this.update(op.key, h.id, d => { if (h.type === 'i'){ d.pts = o.pts.map(q => [q[0] + dt, q[1] + dp]); return; } if (h.type === 'l'){ if (d.k === 'h') d.p = o.p + dp; else d.t = g.T(Math.max(0, g.idx(o.t) + di)); }
      else if (h.part === 'A'){ const q = this.snap(g, op.key, x, y); d.t0 = g.T(q.i); d.p0 = q.p; } else if (h.part === 'B'){ const q = this.snap(g, op.key, x, y); d.t1 = g.T(q.i); d.p1 = q.p; }
      else { d.t0 = g.T(Math.max(0, g.idx(o.t0) + di)); d.t1 = g.T(Math.max(0, g.idx(o.t1) + di)); d.p0 = o.p0 + dp; d.p1 = o.p1 + dp; } }); return true; },
  /* the press ends: a new measurement is kept; a click (no drag) on a drawing opens its card */
  up(host, g, x, y, onChange){ const op = this.op; if (!op) return false; this.op = null; this._host = host; this._onChange = onChange;
    if (op.mode === 'btn'){ if (op.kind === 'del') this.remove(op.key, op.id); else this.card(host, op.key, op.id, x, y, onChange); }
    else if (op.mode === 'ink'){ const I = this.is(op.key), id = this.uid(); I.push(Object.assign({ id, at: Date.now() }, op.s)); this.saveI(op.key, I); }
    else if (op.mode === 'new'){ const m = op.m; if (m.t0 !== m.t1 || Math.abs(m.p1 - m.p0) > 0){ const M = this.ms(op.key), id = this.uid(); M.push(Object.assign({ id, at: Date.now() }, m)); this.saveM(op.key, M); this.sel = { key: op.key, id }; } }
    else if (!op.moved) this.card(host, op.key, op.h.id, x, y, onChange);
    if (onChange) onChange(); return true; },
  remove(key, id){ this.update(key, id, () => null); if (this.sel && this.sel.id === id) this.sel = null; this.closeCard(); },
  toggle(key, id){ this.update(key, id, d => { d.off = !d.off; }); if (this.sel && this.sel.id === id) this.sel = null; this.closeCard(); },

  /* ---------- the little card that edits a drawing ---------- */
  closeCard(){ const c = document.getElementById('dwCard'); if (c) c.remove(); },
  card(host, key, id, x, y, onChange){ this.closeCard(); const f = this.find(key, id); if (!f || !host) return; const o = f.o, el = document.createElement('div'); el.id = 'dwCard';
    const what = f.type === 'm' ? 'Measurement' : f.type === 'i' ? ((Ink.PENS.find(p => p[0] === o.pen) || [0, 'Pen'])[1] + ' stroke') : o.k === 'h' ? 'Price line' : 'Time line';
    el.innerHTML = '<div class="dwHead"><b>' + what + '</b><button type="button" data-dw="x" title="Close">✕</button></div><p>Drag it, or its ends, to move it.</p>' +
      (f.type === 'm' ? '<div class="dwSide"><span>Read it as</span>' + [[1, 'a buy'], [-1, 'a sell'], [0, 'the price']].map(x => '<button type="button" data-dw="side:' + x[0] + '" class="' + ((o.side != null ? o.side : (this._gside || 0)) === x[0] ? 'on' : '') + '">' + x[1] + '</button>').join('') + '</div><p class="dwHint">A buy earns when the price goes up, a sell when it goes down.</p><div class="dwPx"><label>From<input type="number" step="any" data-dwp="p0" value="' + (+o.p0) + '" aria-label="The price it starts at"></label><label>To<input type="number" step="any" data-dwp="p1" value="' + (+o.p1) + '" aria-label="The price it ends at"></label></div>' : '') +
      (f.type !== 'm' ? '<div class="dwCols">' + this.COL.map(cl => '<button type="button" data-dw="c:' + cl + '" style="--c:' + cl + '" class="' + (o.c === cl ? 'on' : '') + '"></button>').join('') + '</div>' : '') +
      '<div class="dwAct"><button type="button" data-dw="hide">Hide from the chart</button><button type="button" data-dw="del" class="dn">Remove</button></div>';
    host.appendChild(el); const hr = host.getBoundingClientRect(); el.style.left = Math.max(6, Math.min(hr.width - 230, x + 14)) + 'px'; el.style.top = Math.max(6, Math.min(hr.height - 150, y - 20)) + 'px';
    el.addEventListener('change', e => { const i = e.target.closest('[data-dwp]'); if (!i) return; const v = parseFloat(i.value); if (!(v > 0)) return; this.update(key, id, d => { d[i.dataset.dwp] = v; }); if (onChange) onChange(); });
    el.addEventListener('keydown', e => e.stopPropagation());
    el.addEventListener('mousedown', e => e.stopPropagation()); el.addEventListener('click', e => { e.stopPropagation(); const b = e.target.closest('[data-dw]'); if (!b) return; const k = b.dataset.dw;
      if (k.startsWith('side:')){ const v = +k.slice(5); this.update(key, id, d => { d.side = v; }); el.querySelectorAll('[data-dw^="side:"]').forEach(q => q.classList.toggle('on', q === b)); }
      else if (k === 'x') this.closeCard(); else if (k === 'hide') this.toggle(key, id); else if (k === 'del') this.remove(key, id); else if (k.startsWith('c:')){ this.update(key, id, d => { d.c = k.slice(2); }); el.querySelectorAll('[data-dw^="c:"]').forEach(q => q.classList.toggle('on', q === b)); }
      if (onChange) onChange(); }); },

  /* ---------- a list of them, with show / hide and remove ---------- */
  listHtml(g, key){ const L = this.ls(key), M = this.ms(key), I = this.is(key); if (!L.length && !M.length && !I.length) return '<p class="dwNone">No drawings on this chart yet.</p>';
    const row = (id, off, col, title, sub, go) => '<div class="dwRow' + (off ? ' off' : '') + '"><button type="button" class="dwGo" ' + (go != null ? 'data-dl="go:' + go + '"' : '') + ' style="--c:' + col + '"><b>' + title + '</b><span>' + sub + '</span></button><button type="button" class="dwEye" data-dl="eye:' + id + '" title="' + (off ? 'Show it on the chart again' : 'Hide it from the chart (it stays here)') + '">' + (off ? '◌' : '◉') + '</button><button type="button" class="dwDel" data-dl="del:' + id + '" title="Remove">✕</button></div>';
    return L.map(l => row(l.id, l.off, l.c, l.k === 'h' ? '― ' + g.px(l.p) : '| ' + g.date(l.t), l.k === 'h' ? 'price line' : 'time line', l.k === 'v' ? l.t : null)).join('') +
      M.map(m => { const r = this.info(g, m); return row(m.id, m.off, r.good ? '#3DDC97' : '#FF6B7A', (r.side ? (r.side > 0 ? 'buy ' : 'sell ') : '') + this.sg(r.pct, 2) + '%', r.n + ' candles · ' + g.dur(r.sec), m.t0); }).join('') +
      I.map(k => row(k.id, k.off, k.c, '✎ ' + (Ink.PENS.find(p => p[0] === k.pen) || [0, 'Pen'])[1], k.pts.length + ' points · ' + g.date(k.pts[0][0]), k.pts[0][0])).join(''); },
  /* clear everything on this chart, keeping a copy so it can be undone */
  clearAll(key){ const bak = { m: this.ms(key), l: this.ls(key), i: this.is(key) }; this.saveM(key, []); this.saveL(key, []); this.saveI(key, []); this.sel = null; this.closeCard(); return bak; },
  restore(key, bak){ if (!bak) return; this.saveM(key, bak.m); this.saveL(key, bak.l); this.saveI(key, bak.i); },
  listClick(e, key){ const b = e.target.closest('[data-dl]'); if (!b) return null; const [k, v] = [b.dataset.dl.slice(0, b.dataset.dl.indexOf(':')), b.dataset.dl.slice(b.dataset.dl.indexOf(':') + 1)];
    if (k === 'eye') this.toggle(key, v); else if (k === 'del') this.remove(key, v); return { k, v }; },
};
document.addEventListener('mousedown', e => { if (!e.target.closest || e.target.closest('#dwCard')) return; if (!e.target.closest('canvas')) Draws.closeCard(); });
/* Delete removes the selected drawing, while the studio it was pressed in is on screen and nothing is being typed */
document.addEventListener('keydown', e => { if (e.key !== 'Delete' || !Draws.sel || e.defaultPrevented) return; const a = document.activeElement, h = Draws._host; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) || (a && a.isContentEditable) || !h || !h.isConnected || !h.offsetParent) return;
  if (!Draws.find(Draws.sel.key, Draws.sel.id)) return; e.preventDefault(); Draws.remove(Draws.sel.key, Draws.sel.id); try { if (Draws._onChange) Draws._onChange(); } catch(x){} });
