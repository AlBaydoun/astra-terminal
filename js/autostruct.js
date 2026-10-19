/* ASTRA Terminal — Structure: the swing, its pullback, and the measured odds.

   Research run 3 (research-tools/levels.cjs + structstats.cjs, 2026-10-15) asked
   whether the classic levels really hold price better than any other level:
     · Fibonacci retracements: NO special effect. How often a pullback turns back
       rises smoothly with its depth (38.2 % → 18 %, 50 % → 31 %, 61.8 % → 43 %,
       78.6 % → 56 %); made-up levels in between sit on the same curve.
     · Pivot points: R1 holds 65.1 % vs 65.5 % for a shifted "fake" R1 — no edge.
     · Trendlines with 3 touches: 66 % vs 65 % for the same line 1 ATR away — no edge.
   What IS measurable, and useful, is the curve itself: per market group and
   timeframe, the chance that a pullback of a given depth turns back, and — once
   it has turned — the chance it gets back to the swing's end or beyond. That is
   what this tool shows on every level, instead of pretending a number is magic.

   1. THE SWING: a zigzag of moves of at least N × ATR (the same rule the
      research measured). The last finished swing is drawn — UP (pullback levels
      below it = where buyers may step in) or DOWN (levels above it = where
      sellers may step in). You can force up / down, or show both last swings.
   2. THE LADDER: the retracement levels, each with "turns back X %", and the
      targets (back to the swing end, 127.2 %, 161.8 %) with "reached Y %".
   3. TRENDLINES and the CHANNEL, drawn as glowing zones (Patterns style).
   4. PIVOT POINTS, off by default — shown as reference, labelled honestly.
   A card explains, in words, where the price is now and what the odds are.

   Read only: it draws, it never trades. */
const AutoStruct = {
  KEY: 'astra_autostruct',
  DEF: {
    on: false,
    swing: true, zz: 4, fibDir: 'auto', look: 400, fibLevels: '0.236, 0.382, 0.5, 0.618, 0.786', golden: true, fibExt: true, fibExtLevels: '1, 1.272, 1.618', odds: true,
    trend: true, trendN: 2, wing: 5, tolAtr: 0.3, zoneAtr: 0.35, showBroken: false, channel: true,
    piv: false, pivType: 'classic',
    card: true, labels: true, reflection: true,
    swingS: { style: '3d', line: 'solid', width: 1.5, glow: 1 }, trendS: { style: '3d', line: 'solid', width: 2, glow: 1 },
    width: 1, bright: 0.9,
    colors: { up: '#2979ff', down: '#ff6d00', channel: '#90a4ae', fib: '#ffca28', golden: '#ffca28', ext: '#ab47bc', pivot: '#26c6da', pivotP: '#eceff1', buyZone: '#00e676', sellZone: '#ff1744' },
  },
  cfg(){ const s = lsGet(this.KEY, {}) || {}, D = this.DEF;
    return Object.assign({}, D, s, { colors: Object.assign({}, D.colors, s.colors || {}), swingS: Object.assign({}, D.swingS, s.swingS || {}), trendS: Object.assign({}, D.trendS, s.trendS || {}) }); },
  save(c){ lsSet(this.KEY, c); this._cache = null; this._sig = ''; if (typeof Draw !== 'undefined') Draw.redraw(); this.syncBtn(); },
  nums(str){ return String(str || '').split(/[ ,;]+/).map(Number).filter(v => Number.isFinite(v) && v > 0 && v < 10); },
  DASH: { solid: [], dashed: [9, 5], dotted: [2, 4], dashdot: [10, 4, 2, 4] },

  /* ---------- the measured odds (js/research/structure-stats.js) ---------- */
  stats(){
    if (typeof STRUCT_STATS === 'undefined') return null;
    const sec = typeof tfSeconds === 'function' ? tfSeconds(STORE.tf) : 3600, tf = sec <= 3600 ? '1h' : '4h';
    let g = null; try { g = typeof Bots !== 'undefined' && Bots.groupOfAny ? Bots.groupOfAny(STORE.symbol) : null; } catch(e){}
    const T = STRUCT_STATS[tf]; return T ? Object.assign({ tf, g: T[g] ? g : 'ALL' }, T[g] || T.ALL) : null;
  },
  /* a fraction that was not measured is read off the curve between its neighbours */
  holdAt(S, f){
    const pts = Object.keys(S.hold).map(Number).sort((a, b) => a - b); if (!pts.length) return null;
    if (f <= pts[0]) return S.hold[pts[0]][0]; if (f >= pts[pts.length - 1]) return S.hold[pts[pts.length - 1]][0];
    for (let k = 1; k < pts.length; k++) if (f <= pts[k]){ const a = pts[k - 1], b = pts[k], w = (f - a) / (b - a); return S.hold[a][0] * (1 - w) + S.hold[b][0] * w; }
    return null;
  },
  reachAt(S, depth, t){
    const pts = Object.keys(S.reach).map(Number).filter(f => f <= Math.max(depth, 0.236) + 1e-9).sort((a, b) => b - a);
    const f = pts[0]; if (f == null || !S.reach[f] || !S.reach[f][t]) return null; return S.reach[f][t][0];
  },

  /* ---------- 1: the swings ---------- */
  zigzag(c, A, k){
    const piv = []; let dir = 0, ext = 0, extI = 0;
    for (let i = 15; i < c.length; i++){
      const a = A[i] || A[i - 1]; if (!a) continue;
      if (dir >= 0){ if (c[i].high > ext || dir === 0){ ext = c[i].high; extI = i; if (dir === 0) dir = 1; } else if (ext - c[i].low > k * a){ piv.push({ i: extI, p: ext, hi: true }); dir = -1; ext = c[i].low; extI = i; } }
      else { if (c[i].low < ext){ ext = c[i].low; extI = i; } else if (c[i].high - ext > k * a){ piv.push({ i: extI, p: ext, hi: false }); dir = 1; ext = c[i].high; extI = i; } }
    }
    return piv;
  },
  swings(c, base, A, C){
    const Z = this.zigzag(c, A, C.zz || 4); if (Z.length < 2) return [];
    const legs = []; for (let k = Z.length - 1; k >= 1 && legs.length < 2; k--){ const a = Z[k - 1], b = Z[k]; legs.push({ a: { i: base + a.i, p: a.p, time: c[a.i].time }, b: { i: base + b.i, p: b.p, time: c[b.i].time }, up: !a.hi }); }
    if (C.fibDir === 'both') return legs;
    if (C.fibDir === 'up') return legs.filter(L => L.up).slice(0, 1);
    if (C.fibDir === 'down') return legs.filter(L => !L.up).slice(0, 1);
    return legs.slice(0, 1);                                               /* auto: the latest swing, whichever way */
  },

  /* ---------- 3: trendlines and the channel (unchanged rules) ---------- */
  trendlines(c, base, A, C){
    const n = c.length, w = Math.max(2, C.wing | 0), tol = A * C.tolAtr;
    const piv = (hi) => { const out = [];
      for (let i = w; i < n - w; i++){ let ok = true;
        for (let k = 1; k <= w && ok; k++) ok = hi ? (c[i].high > c[i - k].high && c[i].high >= c[i + k].high) : (c[i].low < c[i - k].low && c[i].low <= c[i + k].low);
        if (ok) out.push({ i, p: hi ? c[i].high : c[i].low }); }
      return out; };
    const make = (hi) => {
      const P = piv(hi), lines = [];
      for (let a = 0; a < P.length; a++) for (let b = a + 1; b < P.length; b++){
        const A1 = P[a], B1 = P[b]; if (B1.i - A1.i < w * 2) continue;
        const slope = (B1.p - A1.p) / (B1.i - A1.i), at = i => A1.p + slope * (i - A1.i);
        let bad = false;
        for (let i = A1.i + 1; i < B1.i && !bad; i++) bad = hi ? c[i].close > at(i) + tol : c[i].close < at(i) - tol;
        if (bad) continue;
        let touches = 2, lastTouch = B1.i, broken = false, brokenAt = null;
        for (const q of P) if (q.i > A1.i && q.i !== B1.i && Math.abs(q.p - at(q.i)) <= tol){ touches++; lastTouch = Math.max(lastTouch, q.i); }
        let beyond = 0;
        for (let i = B1.i + 1; i < n; i++){ const out = hi ? c[i].close > at(i) + tol : c[i].close < at(i) - tol;
          beyond = out ? beyond + 1 : 0; if (beyond >= 2){ broken = true; brokenAt = i; break; } }
        if (broken && !C.showBroken) continue;
        const span = (n - A1.i) / n, recency = Math.exp(-(n - 1 - lastTouch) / (n / 4));
        lines.push({ hi, a: base + A1.i, pa: A1.p, slope, touches, broken, brokenAt: brokenAt != null ? base + brokenAt : null,
          score: touches * 2 + span * 2 + recency * 3 - (broken ? 5 : 0) });
      }
      lines.sort((x, y) => y.score - x.score);
      const end = base + n - 1, out = [];
      for (const L of lines){
        if (out.length >= C.trendN) break;
        const pe = L.pa + L.slope * (end - L.a);
        if (out.some(o => Math.abs((o.pa + o.slope * (end - o.a)) - pe) < A * 0.8 && Math.abs(o.slope - L.slope) < A * 0.05)) continue;
        out.push(L);
      }
      return out;
    };
    const sup = make(false), res = make(true);
    let channel = null;
    if (C.channel){
      const best = [...sup, ...res].filter(L => !L.broken).sort((x, y) => y.score - x.score)[0];
      if (best){
        let far = 0;
        for (let i = best.a - base; i < n; i++){ const d = best.hi ? (best.pa + best.slope * (base + i - best.a)) - c[i].low : c[i].high - (best.pa + best.slope * (base + i - best.a)); if (d > far) far = d; }
        if (far > A * 0.5) channel = Object.assign({}, best, { pa: best.pa + (best.hi ? -far : far), channelOf: best });
      }
    }
    return { sup, res, channel };
  },

  /* ---------- 4: pivot points for today ---------- */
  pivots(raw, type){
    const day = b => Math.floor((b.rawTime != null ? b.rawTime : b.time) / 86400);
    const today = day(raw[raw.length - 1]);
    const prev = raw.filter(b => day(b) < today); if (!prev.length) return null;
    const yd = day(prev[prev.length - 1]), y = prev.filter(b => day(b) === yd);
    const H = Math.max(...y.map(b => b.high)), L = Math.min(...y.map(b => b.low)), Cl = y[y.length - 1].close, R = H - L;
    const P = (H + L + Cl) / 3;
    let lv;
    if (type === 'fibonacci') lv = { P, R1: P + 0.382 * R, R2: P + 0.618 * R, R3: P + R, S1: P - 0.382 * R, S2: P - 0.618 * R, S3: P - R };
    else if (type === 'camarilla') lv = { P, R1: Cl + R * 1.1 / 12, R2: Cl + R * 1.1 / 6, R3: Cl + R * 1.1 / 4, R4: Cl + R * 1.1 / 2,
                                          S1: Cl - R * 1.1 / 12, S2: Cl - R * 1.1 / 6, S3: Cl - R * 1.1 / 4, S4: Cl - R * 1.1 / 2 };
    else lv = { P, R1: 2 * P - L, R2: P + R, R3: H + 2 * (P - L), S1: 2 * P - H, S2: P - R, S3: L - 2 * (H - P) };
    const first = raw.find(b => day(b) === today);
    return { lv, startTime: first ? first.time : raw[raw.length - 1].time };
  },

  result(){
    const raw = (typeof Chart !== 'undefined' && Chart.raw) || [];
    if (raw.length < 80) return null;
    const C = this.cfg();
    const key = [STORE.symbol, STORE.tf, raw.length, raw[raw.length - 2].time, C.wing, C.look, C.tolAtr, C.trendN, C.showBroken, C.channel, C.zz, C.fibDir, C.pivType].join('|');
    if (this._cache && this._cache.key === key) return this._cache.res;
    const closed = raw.slice(0, -1), look = Math.min(closed.length, C.look | 0 || 400), c = closed.slice(-look), base = closed.length - look;
    const atr = IND.atr(c, 14), A = atr[c.length - 1] || c[c.length - 1].close * 0.002;
    const res = { A, base, legs: this.swings(c, base, IND.atr(c, 14), C), tl: this.trendlines(c, base, A, C), piv: this.pivots(raw, C.pivType) };
    this._cache = { key, res };
    return res;
  },

  /* ---------- drawing ---------- */
  rgba(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; },
  pill(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); },
  draw(ctx){
    const C = this.cfg();
    if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries){ this.card(null, C); return; }
    const R = this.result(); if (!R){ this.card(null, C); return; }
    const ts = Chart.main.timeScale(), right = Math.min(Draw.cssW - 2, (ts.width ? ts.width() : Draw.cssW) - 4);
    const lr = ts.coordinateToLogical(right); if (lr == null) return;
    const X = i => ts.logicalToCoordinate(i), Y = p => Chart.priceSeries.priceToCoordinate(p);
    const S = this.stats(), price = (Chart.raw[Chart.raw.length - 1] || {}).close;
    const sans = getComputedStyle(document.body).getPropertyValue('--font-sans') || 'sans-serif';
    ctx.save();
    const used = [];
    /* a label pill at the right-hand side of a level, never on top of another */
    const tag = (y, text, color, strong) => {
      if (!C.labels || y == null) return;
      ctx.font = (strong ? '700 ' : '600 ') + '11px ' + sans;
      /* a label stays ON its line: when the spot is taken it moves LEFT along the line, not up the chart */
      const w = ctx.measureText(text).width + 18; let x = right - w - 8, yy = y;
      for (let k = 0; k < 6 && used.some(u => Math.abs(u.y - yy) < 18 && x < u.x + u.w + 6 && x + w + 6 > u.x); k++) x = Math.min(...used.filter(u => Math.abs(u.y - yy) < 18).map(u => u.x)) - w - 8;
      x = Math.max(4, x); used.push({ x, y: yy, w });
      ctx.fillStyle = 'rgba(6,10,22,.86)'; ctx.strokeStyle = this.rgba(color, 0.85); ctx.lineWidth = 1; ctx.shadowColor = color; ctx.shadowBlur = strong ? 8 : 0;
      this.pill(ctx, x, yy - 9, w, 18, 9); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = strong ? '#ffffff' : color; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 9, yy + 0.5);
    };
    /* a horizontal glowing line, in the chosen style */
    const hline = (x0, y, color, St, w, dash) => {
      if (y == null) return;
      ctx.setLineDash(dash || this.DASH[St.line] || []); ctx.strokeStyle = this.rgba(color, C.bright); ctx.lineWidth = Math.max(0.5, w * St.width * C.width);
      ctx.shadowColor = color; ctx.shadowBlur = St.style === '3d' ? 8 * St.glow : 0;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(right, y); ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
    };

    /* 1 + 2: the swing and its ladder */
    if (C.swing) R.legs.forEach((L, li) => {
      const faint = li > 0, range = L.b.p - L.a.p, lv = f => L.b.p - range * f, ext = t => L.a.p + range * t;
      const x0 = X(L.a.i), xb = X(L.b.i); if (x0 == null) return;
      const zoneCol = L.up ? C.colors.buyZone : C.colors.sellZone, St = C.swingS;
      ctx.globalAlpha = faint ? 0.45 : 1;
      /* the swing itself: a glowing arrow from its start to its end */
      ctx.strokeStyle = this.rgba(L.up ? C.colors.up : C.colors.down, 0.9); ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(x0, Y(L.a.p)); ctx.lineTo(xb, Y(L.b.p)); ctx.stroke(); ctx.setLineDash([]);
      /* the "golden pocket" as a 3-D zone, coloured as where buyers (up swing) or sellers (down swing) may step in */
      if (C.golden && typeof ChartPatterns !== 'undefined'){
        const ya = Y(lv(0.618)), yb2 = Y(lv(0.65));
        if (ya != null && yb2 != null) ChartPatterns.band(ctx, { x0: xb, x1: right, y0a: Math.min(ya, yb2), y0b: Math.max(ya, yb2), y1a: Math.min(ya, yb2), y1b: Math.max(ya, yb2) },
          { color: zoneCol, style: St.style, line: St.line, width: St.width, glow: St.glow }, { labels: false, reflection: C.reflection && !faint }, null);
      }
      for (const f of [0, ...this.nums(C.fibLevels), 1]){
        const y = Y(lv(f)), hold = S && C.odds && f > 0 && f < 1 ? this.holdAt(S, f) : null;
        hline(xb, y, C.colors.fib, St, f === 0 || f === 1 ? 1.2 : 0.8, f === 0.5 ? [4, 3] : null);
        if (!faint) tag(y, `${(f * 100).toFixed(1)}%  ${fmtPrice(lv(f))}${hold != null ? '  ·  turns back ' + Math.round(hold) + '%' : f === 0 ? (L.up ? '  ·  swing high' : '  ·  swing low') : f === 1 ? '  ·  swing start' : ''}`, f === 0.618 ? zoneCol : C.colors.fib, f === 0.618);
      }
      if (C.fibExt && !faint){
        /* how deep the pullback has gone since the swing ended (its own deepest point) */
        const after = Chart.raw.slice(L.b.i + 1, -1), deepest = after.length ? (L.up ? Math.min(...after.map(b => b.low)) : Math.max(...after.map(b => b.high))) : L.b.p;
        const depth = Math.max(0, Math.min(1, (L.b.p - deepest) / range));
        for (const t of this.nums(C.fibExtLevels)){
          if (t === 1) continue;                                         /* the swing end is already on the ladder */
          const y = Y(ext(t)), r = S && C.odds ? this.reachAt(S, depth, t) : null;
          hline(xb, y, C.colors.ext, St, 0.9, [6, 4]);
          tag(y, `Target ${(t * 100).toFixed(1)}%  ${fmtPrice(ext(t))}${r != null ? '  ·  reached ' + Math.round(r) + '% after a turn' : ''}`, C.colors.ext);
        }
      }
      ctx.globalAlpha = 1;
    });

    /* 3: trendlines and the channel, as glowing sloped zones */
    if (C.trend && typeof ChartPatterns !== 'undefined'){
      const z = R.A * C.zoneAtr / 2;
      const zone = (L, color, label) => {
        const end = L.broken && L.brokenAt != null ? L.brokenAt + 3 : lr, p = i => L.pa + L.slope * (i - L.a);
        const P = { x0: X(L.a), x1: X(end), y0a: Y(p(L.a) + z), y0b: Y(p(L.a) - z), y1a: Y(p(end) + z), y1b: Y(p(end) - z) };
        if (Object.values(P).some(v => v == null || !Number.isFinite(v))) return;
        const St = L.broken ? Object.assign({}, C.trendS, { style: 'line', line: 'dotted' }) : C.trendS;
        ChartPatterns.band(ctx, P, Object.assign({ color }, St), { labels: C.labels, reflection: C.reflection }, label);
      };
      const deg = L => { const a = Y(L.pa), b = Y(L.pa + L.slope * 10); const dx = (X(L.a + 10) || 0) - (X(L.a) || 0); return Math.atan2(-(b - a), dx || 1) * 180 / Math.PI; };
      R.tl.sup.forEach((L, k) => zone(L, C.colors.up, `Support line ${k + 1} · ${L.touches} touches · ${deg(L) >= 0 ? '↗' : '↘'} ${Math.abs(deg(L)).toFixed(0)}°${L.broken ? ' · broken' : ''}`));
      R.tl.res.forEach((L, k) => zone(L, C.colors.down, `Resistance line ${k + 1} · ${L.touches} touches · ${deg(L) >= 0 ? '↗' : '↘'} ${Math.abs(deg(L)).toFixed(0)}°${L.broken ? ' · broken' : ''}`));
      if (R.tl.channel) zone(R.tl.channel, C.colors.channel, 'Channel');
    }

    /* 4: pivots (reference) */
    if (C.piv && R.piv){
      const x0 = Math.max(0, Draw.timeToX(R.piv.startTime) || 0);
      for (const [k, p] of Object.entries(R.piv.lv)){ const y = Y(p), col = k === 'P' ? C.colors.pivotP : C.colors.pivot;
        hline(x0, y, col, { style: 'flat', line: k === 'P' ? 'solid' : 'dotted', width: 1, glow: 0 }, k === 'P' ? 1.3 : 0.9); tag(y, `${k === 'P' ? 'Pivot' : k} ${fmtPrice(p)}`, col); }
    }
    ctx.restore();
    this.card(R, C, S, price);
  },

  /* ---------- the card: where the price is in its swing, and the odds, in words ---------- */
  card(R, C, S, price){
    const wrap = document.getElementById('mainWrap'); if (!wrap) return;
    let el = document.getElementById('stCard');
    if (!R || !C.on || !C.card){ if (el) el.remove(); return; }
    if (!el){ wrap.insertAdjacentHTML('beforeend', '<div id="stCard" class="fcCard stCard"></div>'); el = document.getElementById('stCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
      el.addEventListener('click', e => { if (e.target.closest('[data-stfold]')){ this._more = !this._more; this._sig = ''; Draw.redraw(); } }); }
    const L = R.legs[0];
    let body = '<div class="fcHead">STRUCTURE</div>';
    if (!L || !C.swing) body += '<p>No finished swing on this chart yet (moves smaller than ' + C.zz + ' × ATR are ignored).</p>';
    else {
      const range = L.b.p - L.a.p, depthNow = (L.b.p - price) / range, pct = Math.round(depthNow * 100);
      const where = depthNow < 0 ? `beyond the swing ${L.up ? 'high' : 'low'} — the ${L.up ? 'up' : 'down'} move is continuing` : depthNow > 1 ? `past the swing's start — this swing is over` : `pulled back <b>${pct}%</b> of it`;
      const hold = S && depthNow >= 0.2 && depthNow <= 1 ? this.holdAt(S, depthNow) : null;
      const r1 = S ? this.reachAt(S, Math.max(0.236, depthNow), 1) : null, r127 = S ? this.reachAt(S, Math.max(0.236, depthNow), 1.272) : null;
      body += `<div class="fcBig ${L.up ? 'up' : 'down'}">${L.up ? '▲ Up swing' : '▼ Down swing'}${hold != null ? ` <small>· pulled back ${pct}% · turns back ${Math.round(hold)}%</small>` : ''}</div>`;
      if (this._more) body += `<p>${fmtPrice(L.a.p)} → ${fmtPrice(L.b.p)}. Price ${fmtPrice(price)} has ${where}.</p>
        ${hold != null ? `<p>At this depth, pullbacks on ${esc(this.groupName(S.g))} (${S.tf}) turned back <b>${Math.round(hold)}%</b> of the time before going 1 ATR deeper.${r1 != null ? ` When they did: back to ${fmtPrice(L.b.p)} in <b>${Math.round(r1)}%</b>${r127 != null ? `, to the 127% target in <b>${Math.round(r127)}%</b>` : ''}.` : ''}</p>` : ''}
        <p class="dim2">${L.up ? 'An up swing: the levels below are where buyers have stepped in before — the deeper, the more often.' : 'A down swing: the levels above are where sellers have stepped in before — the higher, the more often.'}</p>`;
      if (this._more) body += `<div class="fcStats"><span>What the research found (2 years, 24 markets)</span>
        Fibonacci levels are <b>not</b> special: a 55% or 70% pullback holds just as often as the "Fibonacci" ones next to it — the odds follow the DEPTH, not the number. Pivot points held 65% vs 65% for made-up levels; 3-touch trendlines 66% vs 65%. That is why every level here shows its measured odds instead.</div>`;
    }
    body += `<div class="fcBtns"><button class="bMini" data-stfold="1">${this._more ? 'Less ▴' : 'Details &amp; evidence ▾'}</button></div>`;
    if (body !== this._sig){ el.innerHTML = body; this._sig = body; }
  },
  groupName(g){ return ({ indices: 'stock indices', forex: 'forex', gold: 'gold & silver', energy: 'oil', crypto: 'crypto', ALL: 'all markets' })[g] || g; },

  /* ---------- button + settings ---------- */
  syncBtn(){ const b = document.getElementById('autoStructBtn'); if (b) b.classList.toggle('on', this.cfg().on); if (!this.cfg().on) document.getElementById('stCard')?.remove(); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c);
    if (c.on && typeof toast === 'function') toast('Structure on — the last swing with the measured odds on every level, trendlines and channel. ⚙ to design it.', 'info'); },
  panel(){
    let el = document.getElementById('autoStructPanel');
    if (el){ el.remove(); return; }
    const c = this.cfg();
    const chk = (k, t) => `<label><input type="checkbox" data-as="${k}"${c[k] ? ' checked' : ''}> ${t}</label>`;
    const num = (k, t, min, max, step) => `<label>${t} <input type="number" data-asn="${k}" value="${c[k]}" min="${min}" max="${max}" step="${step || 1}"></label>`;
    const txt = (k, t) => `<label class="asWide">${t} <input type="text" data-ast="${k}" value="${esc(c[k])}"></label>`;
    const col = (k, t) => `<label>${t} <input type="color" data-asc="${k}" value="${c.colors[k]}"></label>`;
    const sel = (path, t, opts, cur) => `<label>${t} <select data-assel="${path}">${opts.map(([v, x]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${x}</option>`).join('')}</select></label>`;
    const rng = (path, t, min, max, step, v) => `<label>${t} <input type="range" data-asr="${path}" min="${min}" max="${max}" step="${step}" value="${v}"><em>${v}</em></label>`;
    const STY = [['3d', '3-D glow'], ['flat', 'Flat'], ['hatch', 'Hatched ////'], ['line', 'Single line']];
    const LIN = [['solid', 'Solid ───'], ['dashed', 'Dashed - - -'], ['dotted', 'Dotted ·····'], ['dashdot', 'Dash-dot -·-·']];
    const look = (k) => `${sel(k + '.style', 'Style', STY, c[k].style)}${sel(k + '.line', 'Line', LIN, c[k].line)}${rng(k + '.width', 'Thickness', 0.5, 4, 0.25, c[k].width)}${rng(k + '.glow', 'Glow', 0, 3, 0.25, c[k].glow)}`;
    document.body.insertAdjacentHTML('beforeend', `<div id="autoStructPanel" class="autoSrPanel asPanel">
      <b>Structure — swing, measured odds, trendlines</b>
      <div class="srLook"><b>The swing &amp; its ladder</b>
        ${chk('swing', 'Show the last swing and its levels')}
        ${sel('fibDir', 'Which swing', [['auto', 'The latest one (up or down)'], ['up', 'The latest UP swing'], ['down', 'The latest DOWN swing'], ['both', 'The last two swings']], c.fibDir)}
        ${num('zz', 'A swing must move at least (× ATR)', 1, 15, 0.5)}${num('look', 'Look back (candles)', 100, 3000, 50)}
        ${txt('fibLevels', 'Pullback levels')}${chk('golden', 'Shade the 61.8–65 % zone')}${chk('fibExt', 'Targets beyond the swing')}${txt('fibExtLevels', 'Target levels')}
        ${chk('odds', 'Show the measured odds on each level')}
        ${look('swingS')}${col('fib', 'Level colour')}${col('ext', 'Target colour')}${col('buyZone', 'Buy zone (up swing)')}${col('sellZone', 'Sell zone (down swing)')}${col('up', 'Up swing colour')}${col('down', 'Down swing colour')}</div>
      <div class="srLook"><b>Trendlines &amp; channel</b>
        ${chk('trend', 'Show trendlines')}${num('trendN', 'Lines each way', 1, 8)}${num('wing', 'Swing size (candles each side)', 2, 20)}
        ${num('tolAtr', 'Touch tolerance (× ATR)', 0.05, 2, 0.05)}${num('zoneAtr', 'Zone thickness (× ATR)', 0.05, 2, 0.05)}
        ${chk('showBroken', 'Also show broken lines (dotted)')}${chk('channel', 'Channel (parallel line)')}
        ${look('trendS')}${col('channel', 'Channel colour')}</div>
      <div class="srLook"><b>Pivot points (reference only — tested: no edge)</b>
        ${chk('piv', 'Show pivot points')}
        ${sel('pivType', 'Type', [['classic', 'Classic'], ['fibonacci', 'Fibonacci'], ['camarilla', 'Camarilla']], c.pivType)}
        ${col('pivotP', 'Pivot colour')}${col('pivot', 'R / S colour')}</div>
      <div class="srLook"><b>Look</b>${chk('card', 'The explanation card')}${chk('labels', 'Labels')}${chk('reflection', 'Reflection under 3-D zones')}
        ${rng('width', 'All lines thicker / thinner', 0.5, 3, 0.25, c.width)}${rng('bright', 'Brightness', 0.25, 1, 0.05, c.bright)}
        <button class="bMini" data-asreset="1">Back to the original settings</button></div>
    </div>`);
    el = document.getElementById('autoStructPanel');
    const b = document.getElementById('autoStructCfg').getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - 350, b.left - 150)) + 'px'; el.style.top = (b.bottom + 6) + 'px';
    const setPath = (v, path, val) => { const [a, k] = path.split('.'); if (k) v[a] = Object.assign({}, v[a], { [k]: val }); else v[a] = val; };
    const apply = e => {
      const t = e.target, v = this.cfg();
      if (t.dataset.as) v[t.dataset.as] = t.checked;
      else if (t.dataset.asn){ if (t.value === '' || !Number.isFinite(+t.value)) return; v[t.dataset.asn] = +t.value; }
      else if (t.dataset.ast) v[t.dataset.ast] = t.value;
      else if (t.dataset.assel) setPath(v, t.dataset.assel, t.value);
      else if (t.dataset.asc) v.colors = Object.assign({}, v.colors, { [t.dataset.asc]: t.value });
      else if (t.dataset.asr){ setPath(v, t.dataset.asr, +t.value); const em = t.nextElementSibling; if (em) em.textContent = t.value; }
      else return;
      if (!v.on) v.on = true; this.save(v);
    };
    el.addEventListener('input', apply); el.addEventListener('change', apply);
    el.addEventListener('click', e => { if (!e.target.closest('[data-asreset]')) return; this.save(Object.assign({}, this.DEF, { on: true })); el.remove(); this.panel(); });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#autoStructPanel, #autoStructCfg')){ document.getElementById('autoStructPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('autoSrCfg');
  if (!after || document.getElementById('autoStructBtn')) return;
  after.insertAdjacentHTML('afterend', `<button id="autoStructBtn" class="bMini autoSrBtn${AutoStruct.cfg().on ? ' on' : ''}" title="The last swing with the measured odds on every level, trendlines and channel — drawn automatically">✦ Structure</button><button id="autoStructCfg" class="bMini" title="Structure settings">⚙</button>`);
  document.getElementById('autoStructBtn').addEventListener('click', () => AutoStruct.toggle());
  document.getElementById('autoStructCfg').addEventListener('click', () => AutoStruct.panel());
});
