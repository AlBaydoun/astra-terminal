/* ASTRA / Timurila — Studio: the chart look from the Timurila design.

   One engine, drawn by both faces:
     · level support and resistance ZONES — swing highs and lows that cluster at the same price,
       named with their price range and whether price has since broken through them;
     · a dashed TREND CHANNEL around the leg in progress;
     · the EVENTS on the zones — bounces, rejections, breakouts and held retests — as plain words;
     · a MOVING AVERAGE (20-candle EMA), the SIGNAL LABELS (when js/jmmarks.js is loaded) and the
       USUAL RANGE ahead (how far price normally travels, no direction claimed).

   Studio.analyse(candles) is a pure function of the candles; Studio.paint(ctx, R, view) draws on
   any canvas given two mappers (candle index -> x, price -> y). Classic adds a "✦ Studio" button
   beside Patterns (see the bottom of this file); Timurila's chart studio calls the same two functions.

   Read only: it draws, it never trades, and nothing here is a signal that has been proven. */
const Studio = {
  atr(c, n){ const o = new Array(c.length).fill(null); let a = null; for (let i = 0; i < c.length; i++){ const tr = i ? Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)) : c[i].high - c[i].low; a = a == null ? tr : (a * (n - 1) + tr) / n; if (i >= n) o[i] = a; } return o; },
  ema(a, n){ const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null; for (let i = 0; i < a.length; i++){ e = e == null ? a[i] : a[i] * k + e * (1 - k); if (i >= n - 1) o[i] = e; } return o; },

  analyse(raw, opt){
    const o = opt || {}, closed = raw.slice(0, -1), look = Math.max(60, Math.min(closed.length, o.look || 140)), c = closed.slice(-look), base = closed.length - look, n = c.length;
    if (n < 40) return null;
    const A = this.atr(c, 14)[n - 1] || c[n - 1].close * 0.002, last = c[n - 1].close, w = 3;
    /* swing highs and lows */
    const piv = [];
    for (let i = w; i < n - w; i++){ let hi = true, lo = true;
      for (let k = 1; k <= w; k++){ if (!(c[i].high > c[i - k].high && c[i].high >= c[i + k].high)) hi = false; if (!(c[i].low < c[i - k].low && c[i].low <= c[i + k].low)) lo = false; }
      if (hi) piv.push({ i, p: c[i].high, hi: true }); if (lo) piv.push({ i, p: c[i].low, hi: false }); }
    /* swings at about the same price make a zone */
    piv.sort((a, b) => a.p - b.p); const cl = [];
    for (const q of piv){ const g = cl[cl.length - 1]; if (g && q.p - g.sum / g.m.length <= 0.7 * A){ g.m.push(q); g.sum += q.p; } else cl.push({ m: [q], sum: q.p }); }
    const cand = cl.map(g => { const ps = g.m.map(q => q.p), mid = (Math.min(...ps) + Math.max(...ps)) / 2, half = Math.min(0.5 * A, Math.max(0.18 * A, (Math.max(...ps) - Math.min(...ps)) / 2)), lo = mid - half, hi = mid + half;
      let visits = 0, inside = false; for (let i = 0; i < n; i++){ const t = c[i].high >= lo && c[i].low <= hi; if (t && !inside) visits++; inside = t; }
      const highs = g.m.filter(q => q.hi).length, recent = Math.max(...g.m.map(q => q.i)) / n;
      return { lo, hi, mid, first: Math.min(...g.m.map(q => q.i)), pivots: g.m.length, highs, lows: g.m.length - highs, score: g.m.length * 2 + visits * 0.5 + recent * 2 - Math.abs(mid - last) / A * 0.15 }; });
    /* the zone price is in, then the nearest one above and the nearest one below (they are the ones that matter now),
       then the strongest of the rest that is still close */
    const zones = [], solid = z => z.pivots >= 2 || z.first > n * 0.55, apart = z => zones.every(y => z.lo - y.hi >= 0.3 * A || y.lo - z.hi >= 0.3 * A), add = z => { if (z && zones.length < 3 && apart(z)) zones.push(z); };
    add(cand.find(z => z.lo <= last && z.hi >= last));
    add(cand.filter(z => z.lo > last && solid(z)).sort((a, b) => a.lo - b.lo)[0]);
    add(cand.filter(z => z.hi < last && solid(z)).sort((a, b) => b.hi - a.hi)[0]);
    for (const z of cand.filter(z => Math.abs(z.mid - last) <= 8 * A).sort((a, b) => b.score - a.score)) add(z);
    const marks = [];
    for (const Z of zones){
      Z.kind = Z.highs >= Z.lows ? 'res' : 'sup'; Z.side = last > Z.hi ? 'below' : last < Z.lo ? 'above' : 'at'; Z.gFirst = base + Z.first;
      Z.name = Z.kind === 'res' ? 'Resistance' : 'Support'; Z.note = Z.kind === 'res' && Z.side === 'below' ? 'broken, now support' : Z.kind === 'sup' && Z.side === 'above' ? 'broken, now resistance' : '';
      /* what happened on this zone */
      let brk = null;
      for (let i = Z.first + 1; i < n; i++){ const b = c[i], pc = c[i - 1].close;
        if (b.close > Z.hi && pc <= Z.hi){ marks.push({ i, kind: 'break', up: true, p: b.high, text: 'Breakout' }); brk = { i, up: true }; continue; }
        if (b.close < Z.lo && pc >= Z.lo){ marks.push({ i, kind: 'break', up: false, p: b.low, text: 'Breakdown' }); brk = { i, up: false }; continue; }
        if (brk && i - brk.i > 1 && i - brk.i <= 15){
          if (brk.up && b.low <= Z.hi + 0.25 * A && b.close > Z.hi){ marks.push({ i, kind: 'retest', up: true, p: b.low, text: 'Retest held' }); brk = null; continue; }
          if (!brk.up && b.high >= Z.lo - 0.25 * A && b.close < Z.lo){ marks.push({ i, kind: 'retest', up: false, p: b.high, text: 'Retest held' }); brk = null; continue; } }
        if (b.high >= Z.lo && b.close < Z.lo && b.close < b.open && pc < Z.lo) marks.push({ i, kind: 'reject', p: b.high, text: '▼ Rejection' });
        else if (b.low <= Z.hi && b.close > Z.hi && b.close > b.open && pc > Z.hi) marks.push({ i, kind: 'bounce', p: b.low, text: '▲ Bounce' }); } }
    marks.sort((a, b) => a.i - b.i); const kept = [], per = {};
    for (let k = marks.length - 1; k >= 0; k--){ const m = marks[k]; if (kept.some(x => x.kind === m.kind && Math.abs(x.i - m.i) < 5)) continue; if ((per[m.kind] = (per[m.kind] || 0) + 1) > 3) continue; kept.push(Object.assign(m, { gi: base + m.i })); }
    /* the leg in progress: from the most recent extreme of the last 90 candles */
    let channel = null; const m0 = Math.max(0, n - 90); let iLo = m0, iHi = m0;
    for (let i = m0; i < n; i++){ if (c[i].low < c[iLo].low) iLo = i; if (c[i].high > c[iHi].high) iHi = i; }
    let start = Math.max(iLo, iHi); if (n - 1 - start < 12) start = Math.min(iLo, iHi); if (n - 1 - start < 12) start = Math.max(0, n - 40);
    { const m = n - start; let sx = 0, sy = 0, sxx = 0, sxy = 0; for (let i = start; i < n; i++){ sx += i; sy += c[i].close; sxx += i * i; sxy += i * c[i].close; }
      const slope = (m * sxy - sx * sy) / ((m * sxx - sx * sx) || 1), icp = (sy - slope * sx) / m; let up = 0, dn = 0;
      for (let i = start; i < n; i++){ const y = icp + slope * i; up = Math.max(up, c[i].high - y); dn = Math.min(dn, c[i].low - y); }
      channel = { g0: base + start, g1: base + n + 5, at: g => icp + slope * (g - base), up, dn, rising: slope > 0 }; }
    const closes = raw.map(b => b.close), rets = []; for (let i = Math.max(1, closes.length - 300); i < closes.length; i++) rets.push(Math.log(closes[i] / closes[i - 1]));
    const mu = rets.reduce((a, b) => a + b, 0) / (rets.length || 1), sd1 = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / (rets.length || 1));
    let signals = []; try { if (typeof JMMarks !== 'undefined' && closed.length > 40) signals = JMMarks.analyse(closed).filter(x => x.i >= base).map(x => ({ gi: x.i, dir: x.dir, text: x.text, strong: x.strong })); } catch(e){ signals = []; }
    /* market structure (js/proind.js): gaps and order blocks still open, the latest breaks, sweeps and divergences */
    let smc = null;
    try { if (typeof ProInd !== 'undefined' && closed.length > 60){ const P = ProInd.prep(closed), N = closed.length, near = (a, k) => a.slice().sort((x, y) => Math.abs((x.top + x.bot) / 2 - last) - Math.abs((y.top + y.bot) / 2 - last)).slice(0, k);
      smc = { fvg: near(ProInd.fvgs(P).filter(g => g.end < 0 && g.i >= N - 120), 4), ob: near(ProInd.orderBlocks(P).filter(g => g.end < 0 && g.born >= N - 160), 3),
        bos: ProInd.structure(P).filter(e => e.i >= base).slice(-6), sweeps: ProInd.sweeps(P).filter(e => e.i >= base).slice(-5), div: ProInd.divergences(P).filter(d => d.b >= base).slice(-4) }; } } catch(e){ smc = null; }
    return { base, n, A, zones, marks: kept, channel, ema: this.ema(closes, 20), signals, sd1, smc, lastIdx: raw.length - 1, last: raw[raw.length - 1].close };
  },

  /* view: { X(i), Y(price), left, right, i0, i1, bars, layers, fmt(price), pulse, sans, mono } */
  paint(ctx, R, v){
    if (!R) return; const L = v.layers || {}, X = v.X, Y = v.Y, ok = Number.isFinite, sans = v.sans || 'sans-serif', mono = v.mono || 'monospace', pulse = v.pulse || 1;
    const halo = (t, x, y, col, font, align) => { ctx.font = font; ctx.textAlign = align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.lineWidth = 3.5; ctx.strokeStyle = 'rgba(6,10,18,.9)'; ctx.strokeText(t, x, y); ctx.fillStyle = col; ctx.fillText(t, x, y); };
    const lab = [], zf = v.zfmt || Studio.overlay.fmt, free = (x0, x1, y) => !lab.some(q => x0 < q.x1 + 6 && x1 > q.x0 - 6 && Math.abs(q.y - y) < 14);
    ctx.save();
    if (L.zones) for (const Z of R.zones){
      const x0 = v.left, x1 = Math.min(v.right, (ok(X(R.lastIdx)) ? X(R.lastIdx) : v.right) + 10), yT = Y(Z.hi), yB = Y(Z.lo); if (![x1, yT, yB].every(ok) || x1 <= x0) continue;
      const res = Z.kind === 'res', rgb = res ? '255,107,122' : '61,220,151', edge = res ? '#FF9AA4' : '#7BE8B8', h = Math.max(4, yB - yT);
      let g = ctx.createLinearGradient(0, yT, 0, yB); g.addColorStop(0, `rgba(${rgb},${res ? 0.5 : 0.1})`); g.addColorStop(1, `rgba(${rgb},${res ? 0.1 : 0.5})`); ctx.fillStyle = g; ctx.fillRect(x0, yT, x1 - x0, h);
      /* the reflection: under a resistance, over a support */
      const r0 = res ? yB : yT - h * 2.2, r1 = res ? yB + h * 2.2 : yT; g = ctx.createLinearGradient(0, r0, 0, r1); g.addColorStop(0, `rgba(${rgb},${res ? 0.14 : 0})`); g.addColorStop(1, `rgba(${rgb},${res ? 0 : 0.14})`); ctx.fillStyle = g; ctx.fillRect(x0, r0, x1 - x0, r1 - r0);
      const ye = Math.round(res ? yT : yB) + 0.5; ctx.strokeStyle = edge; ctx.lineWidth = 1.6; ctx.shadowColor = `rgb(${rgb})`; ctx.shadowBlur = 7 * pulse; ctx.beginPath(); ctx.moveTo(x0, ye); ctx.lineTo(x1, ye); ctx.stroke(); ctx.shadowBlur = 0;
      const txt = Z.name + ' ' + zf(Z.lo) + ' to ' + zf(Z.hi) + (Z.note ? ' · ' + Z.note : ''), ty = res ? yT - 9 : yB + 11; ctx.font = '600 11px ' + sans;
      lab.push({ x0: x0 + 8, x1: x0 + 8 + ctx.measureText(txt).width, y: ty }); halo(txt, x0 + 8, ty, res ? '#FFB3BB' : '#9AEFC9', '600 11px ' + sans, 'left'); }
    if (L.channel && R.channel){ const C = R.channel, xa = X(C.g0), xb = X(C.g1), ya = C.at(C.g0), yb = C.at(C.g1);
      if ([xa, xb].every(ok)){ ctx.setLineDash([6, 5]); ctx.strokeStyle = '#4FD8F7'; ctx.lineWidth = 1.2; ctx.beginPath();
        ctx.moveTo(xa, Y(ya + C.up)); ctx.lineTo(xb, Y(yb + C.up)); ctx.moveTo(xa, Y(ya + C.dn)); ctx.lineTo(xb, Y(yb + C.dn)); ctx.stroke(); ctx.setLineDash([]); } }
    if (L.ma && R.ema){ ctx.strokeStyle = '#FFB648'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round'; ctx.beginPath(); let on = false;
      for (let i = Math.max(0, v.i0); i <= Math.min(R.ema.length - 1, v.i1); i++){ const e = R.ema[i], x = X(i); if (e == null || !ok(x)) continue; on ? ctx.lineTo(x, Y(e)) : ctx.moveTo(x, Y(e)); on = true; } ctx.stroke(); }
    if (L.events) for (const m of R.marks.slice().sort((a, b) => b.gi - a.gi)){ const x = X(m.gi), y = Y(m.p); if (!ok(x) || !ok(y)) continue;   /* newest first; an older label gives way */
      const below = m.kind === 'bounce' || (m.kind === 'retest' && m.up) || (m.kind === 'break' && !m.up), ty = below ? y + 15 : y - 13;
      ctx.font = '600 11px ' + sans; const hw = ctx.measureText(m.text).width / 2; if (x - hw < v.left + 4 || x + hw > v.right - 4 || !free(x - hw, x + hw, ty)) continue; lab.push({ x0: x - hw, x1: x + hw, y: ty });
      halo(m.text, x, ty, m.kind === 'reject' ? '#FFB3BB' : m.kind === 'bounce' ? '#7BE8B8' : '#A5ECFC', '600 11px ' + sans); }
    if (L.signals && v.bars){ const put = [];
      for (let k = R.signals.length - 1; k >= 0; k--){ const s = R.signals[k], b = v.bars[s.gi], x = X(s.gi); if (!b || !ok(x) || s.gi < v.i0 || s.gi > v.i1) continue; const y = s.dir > 0 ? Y(b.low) + 28 : Y(b.high) - 26;
        if (put.some(q => Math.abs(q.x - x) < 46 && Math.abs(q.y - y) < 13)) continue; put.push({ x, y }); halo(s.text, x, y, '#FFB648', '500 11px ' + mono); if (put.length >= 40) break; } }
    if (L.range && R.sd1){ const i = R.lastIdx, lc = R.last, x = X(i), xe = X(i + 24); if (ok(x) && ok(xe)){ ctx.beginPath(); ctx.moveTo(x, Y(lc));
        for (let h = 1; h <= 24; h++) ctx.lineTo(X(i + h), Y(lc * (1 + R.sd1 * Math.sqrt(h)))); for (let h = 24; h >= 1; h--) ctx.lineTo(X(i + h), Y(lc * (1 - R.sd1 * Math.sqrt(h))));
        ctx.closePath(); ctx.fillStyle = 'rgba(154,167,184,.18)'; ctx.fill(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(169,182,202,.7)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, Y(lc)); ctx.lineTo(xe, Y(lc)); ctx.stroke(); ctx.setLineDash([]);
        halo('usual range · no direction', xe, Y(lc * (1 + R.sd1 * Math.sqrt(24))) - 9, '#C9D4E5', '11px ' + sans, 'right'); } }
    const S = R.smc, xr = Math.min(v.right, (ok(X(R.lastIdx)) ? X(R.lastIdx) : v.right) + 10);
    if (S){
      const box = (g, rgb, tag) => { const x0 = Math.max(v.left, X(g.i)), yT = Y(g.top), yB = Y(g.bot); if (![x0, yT, yB].every(ok) || xr - x0 < 6) return;
        ctx.fillStyle = `rgba(${rgb},.13)`; ctx.fillRect(x0, yT, xr - x0, Math.max(2, yB - yT)); ctx.strokeStyle = `rgba(${rgb},.7)`; ctx.lineWidth = 1; ctx.setLineDash(tag === 'FVG' ? [3, 3] : []);
        ctx.strokeRect(Math.round(x0) + .5, Math.round(yT) + .5, Math.round(xr - x0) - 1, Math.max(2, Math.round(yB - yT))); ctx.setLineDash([]);
        const ty = (yT + yB) / 2; if (yB - yT >= 9 && free(x0 + 6, x0 + 40, ty)){ lab.push({ x0: x0 + 6, x1: x0 + 40, y: ty }); halo(tag, x0 + 6, ty, `rgb(${rgb})`, '600 10px ' + mono, 'left'); } };
      if (L.fvg) for (const g of S.fvg) box({ i: g.i - 2, top: g.top, bot: g.bot }, g.up ? '79,216,247' : '255,150,190', 'FVG');
      if (L.ob) for (const g of S.ob) box(g, g.up ? '61,220,151' : '255,182,72', 'OB');
      if (L.bos) for (const e of S.bos){ const xa = X(e.from), xb = X(e.i), y = Y(e.level); if (![xa, xb, y].every(ok)) continue; const col = e.up ? '#7BE8B8' : '#FF9AA4', xs = Math.max(v.left, xa);
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash(e.kind === 'CHoCH' ? [2, 3] : []); ctx.beginPath(); ctx.moveTo(xs, Math.round(y) + .5); ctx.lineTo(xb, Math.round(y) + .5); ctx.stroke(); ctx.setLineDash([]);
        const tx = (xs + xb) / 2, ty = e.up ? y - 8 : y + 9; if (free(tx - 18, tx + 18, ty)){ lab.push({ x0: tx - 18, x1: tx + 18, y: ty }); halo(e.kind, tx, ty, col, '600 10px ' + mono); } }
      if (L.sweep) for (const e of S.sweeps){ const x = X(e.i), xf = X(e.from), y = Y(e.level); if (![x, xf, y].every(ok)) continue; const col = e.up ? '#7BE8B8' : '#FF9AA4', ty = e.up ? y + 13 : y - 12;
        ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([1, 3]); ctx.beginPath(); ctx.moveTo(Math.max(v.left, xf), y); ctx.lineTo(x, y); ctx.stroke(); ctx.setLineDash([]);
        if (free(x - 20, x + 20, ty)){ lab.push({ x0: x - 20, x1: x + 20, y: ty }); halo('Sweep', x, ty, col, '600 10px ' + mono); } }
      if (L.div) for (const d of S.div){ const xa = X(d.a), xb = X(d.b), ya = Y(d.pa), yb = Y(d.pb); if (![xa, xb, ya, yb].every(ok)) continue;
        ctx.strokeStyle = '#FFB648'; ctx.lineWidth = 1.3; ctx.setLineDash([4, 3]); ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke(); ctx.setLineDash([]);
        const ty = d.up ? yb + 13 : yb - 12; if (free(xb - 14, xb + 14, ty)){ lab.push({ x0: xb - 14, x1: xb + 14, y: ty }); halo('Div', xb, ty, '#FFB648', '600 10px ' + mono); } }
    }
    ctx.restore();
  },
};

/* ---------- Classic: the "✦ Studio" button beside Patterns ---------- */
Studio.overlay = {
  KEY: 'astra_studio',
  DEF: { on: false, look: 140, zones: true, channel: true, events: true, ma: true, signals: false, range: true, fvg: false, ob: false, bos: false, sweep: false, div: false, patWasOn: false },
  cfg(){ return Object.assign({}, this.DEF, (typeof lsGet === 'function' ? lsGet(this.KEY, {}) : {}) || {}); },
  save(c){ lsSet(this.KEY, c); this._key = ''; this.syncBtn(); try { Draw.redraw(); } catch(e){} },
  syncBtn(){ const b = document.getElementById('studioBtn'); if (b) b.classList.toggle('on', this.cfg().on); },
  /* Studio and Patterns are two looks of the same chart: turning one on puts the other away, and back */
  toggle(){
    const c = this.cfg(); c.on = !c.on;
    try { if (typeof ChartPatterns !== 'undefined'){ const p = ChartPatterns.cfg();
      if (c.on && p.on){ c.patWasOn = true; p.on = false; ChartPatterns.save(p); }
      else if (!c.on && c.patWasOn){ c.patWasOn = false; p.on = true; ChartPatterns.save(p); } } } catch(e){}
    this.save(c);
    if (typeof toast === 'function') toast(c.on ? 'Studio look on: level zones, the trend channel, bounces and breaks. Click again to go back.' : 'Studio look off. Your chart is back as it was.', 'info');
  },
  fmt(p){ const a = Math.abs(p), d = a >= 1000 ? 0 : a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 4 : 5; return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  draw(ctx){
    const C = this.cfg(); if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries || !Chart.main) return;
    const raw = Chart.view ? Chart.view() : (Chart.raw || []); if (!raw || raw.length < 60) return;
    const key = [typeof STORE !== 'undefined' ? STORE.symbol + '|' + STORE.tf : '', raw.length, raw[raw.length - 2].time, C.look].join('|');
    if (key !== this._key){ this._key = key; try { this._R = Studio.analyse(raw, { look: C.look }); } catch(e){ this._R = null; } }
    if (!this._R) return;
    const ts = Chart.main.timeScale(), right = Draw.cssW - 2, lr = ts.coordinateToLogical(right), l0 = ts.coordinateToLogical(0); if (lr == null) return;
    const css = getComputedStyle(document.body);
    Studio.paint(ctx, this._R, { X: i => ts.logicalToCoordinate(i), Y: p => Chart.priceSeries.priceToCoordinate(p), left: 0, right, i0: Math.max(0, Math.floor(l0 == null ? 0 : l0)), i1: Math.min(raw.length - 1, Math.ceil(lr)),
      bars: raw, layers: C, fmt: p => this.fmt(p), pulse: 1, sans: css.getPropertyValue('--font-sans') || 'sans-serif', mono: css.getPropertyValue('--font-mono') || 'monospace' });
  },
  panel(){
    let el = document.getElementById('studioPanel'); if (el){ el.remove(); return; }
    const c = this.cfg(), chk = (k, t) => '<label><input type="checkbox" data-sk="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>';
    document.body.insertAdjacentHTML('beforeend', '<div id="studioPanel" class="autoSrPanel asPanel"><b>Studio — the Timurila chart look</b><div class="srLook"><b>What to show</b>' +
      chk('zones', 'Support and resistance zones') + chk('channel', 'Trend channel (dashed)') + chk('events', 'Bounces, rejections, breakouts, retests') + chk('ma', 'Moving average (20-candle EMA)') +
      chk('signals', 'Signal labels (TD, UT Bot, Chandelier…)') + chk('range', 'Usual range ahead (no direction)') +
      '<b>Market structure</b>' + chk('fvg', 'Fair value gaps still open') + chk('ob', 'Order blocks still standing') + chk('bos', 'Breaks of structure and changes of character') + chk('sweep', 'Liquidity sweeps') + chk('div', 'RSI divergences') +
      '<label>Candles to read <input type="number" data-sn="look" value="' + c.look + '" min="60" max="600" step="10"></label></div></div>');
    el = document.getElementById('studioPanel');
    const b = document.getElementById('studioCfg').getBoundingClientRect(); el.style.left = Math.max(8, Math.min(innerWidth - 350, b.left - 150)) + 'px'; el.style.top = (b.bottom + 6) + 'px';
    el.addEventListener('change', e => { const t = e.target, v = this.cfg(); if (t.dataset.sk) v[t.dataset.sk] = t.checked; else if (t.dataset.sn && Number.isFinite(+t.value)) v[t.dataset.sn] = +t.value; else return; this.save(v); });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#studioPanel, #studioCfg')){ const p = document.getElementById('studioPanel'); if (p) p.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('patCfg'); if (!after || document.getElementById('studioBtn')) return;      /* Classic only: Timurila has no such button */
  after.insertAdjacentHTML('afterend', '<button id="studioBtn" class="bMini autoSrBtn' + (Studio.overlay.cfg().on ? ' on' : '') + '" title="The Timurila chart look: level support and resistance zones, a dashed trend channel, bounces and breaks, a moving average and the usual range. Click to switch between this and your chart as it is.">✦ Studio</button><button id="studioCfg" class="bMini" title="Studio settings">⚙</button>');
  document.getElementById('studioBtn').addEventListener('click', () => Studio.overlay.toggle());
  document.getElementById('studioCfg').addEventListener('click', () => Studio.overlay.panel());
});
