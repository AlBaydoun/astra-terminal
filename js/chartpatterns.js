/* ASTRA Terminal — Chart Patterns: the story of the last stretch of candles.

   Reads the recent candles (the window is yours to set) and answers, on the chart:
     · the TREND — uptrend, downtrend or consolidation;
     · the SHAPE — the upper boundary through the swing highs and the lower one
       through the swing lows, each classed as rising, flat or falling:
         flat top    + rising bottom  → ascending triangle   (flat resistance, rising support)
         falling top + flat bottom    → descending triangle  (descending upper trendline, flat lower trendline)
         flat + flat                  → range / consolidation
         falling top + rising bottom  → symmetrical triangle (consolidation)
         both rising                  → rising channel  (uptrend)
         both falling                 → falling channel (downtrend)
         spreading apart              → broadening
       and whether it is a CONTINUATION of the trend before it;
     · the EVENTS on the two zones — bounces off support, rejections at
       resistance, breakouts (and breakdowns) and the retest after a breakout.

   Support and resistance are drawn as ZONES (a band of the width you choose),
   in a 3-D style with a glowing edge and a reflection underneath — or flat,
   hatched (////), or as a single line, dotted / dashed / solid, thin or bold.
   The chart background can be changed here too.

   Read only: it draws, it never trades. */
const ChartPatterns = {
  KEY: 'astra_patterns',
  DEF: {
    on: false,
    look: 120, wing: 4, zoneAtr: 0.5, flatAtr: 1.0,
    showZones: true, showTrend: true, showCurve: true, showTitle: true,
    showBounce: true, showReject: true, showBreak: true, showRetest: true, maxMarks: 4,
    labels: true, reflection: true,
    sup: { color: '#00e676', style: '3d', line: 'solid', width: 2, glow: 1 },
    res: { color: '#ff1744', style: '3d', line: 'solid', width: 2, glow: 1 },
    curve: { color: '#e8eaf6', line: 'solid', width: 2 },
    marks: { bounce: '#00e676', reject: '#ff5252', breakout: '#40c4ff', retest: '#ffd740' },
    bg: 'none', bgTop: '#0b1f4a', bgBottom: '#02060f', hideGrid: false,
  },
  cfg(){ const s = lsGet(this.KEY, {}) || {}, D = this.DEF;
    return Object.assign({}, D, s, { sup: Object.assign({}, D.sup, s.sup || {}), res: Object.assign({}, D.res, s.res || {}),
      curve: Object.assign({}, D.curve, s.curve || {}), marks: Object.assign({}, D.marks, s.marks || {}) }); },
  save(c){ lsSet(this.KEY, c); this._cache = null; this.applyBg(); if (typeof Draw !== 'undefined') Draw.redraw(); this.syncBtn(); },
  DASH: { solid: [], dashed: [9, 5], dotted: [2, 4], dashdot: [10, 4, 2, 4] },

  /* ---------- the analysis ---------- */
  analyse(raw){
    const C = this.cfg();
    const closed = raw.slice(0, -1), look = Math.max(40, Math.min(closed.length, C.look | 0)), c = closed.slice(-look), base = closed.length - look, n = c.length;
    const A = IND.atr(c, 14)[n - 1] || c[n - 1].close * 0.002, w = Math.max(2, C.wing | 0);
    const piv = hi => { const out = [];
      for (let i = w; i < n - w; i++){ let ok = true;
        for (let k = 1; k <= w && ok; k++) ok = hi ? (c[i].high > c[i - k].high && c[i].high >= c[i + k].high) : (c[i].low < c[i - k].low && c[i].low <= c[i + k].low);
        if (ok) out.push({ i, p: hi ? c[i].high : c[i].low }); }
      return out; };
    /* a boundary = least-squares line through the swings, then shifted out so it holds them all */
    const fit = (pts, hi) => {
      if (pts.length < 2) return null;
      const m = pts.length, sx = pts.reduce((a, q) => a + q.i, 0), sy = pts.reduce((a, q) => a + q.p, 0);
      const sxx = pts.reduce((a, q) => a + q.i * q.i, 0), sxy = pts.reduce((a, q) => a + q.i * q.p, 0);
      const slope = (m * sxy - sx * sy) / ((m * sxx - sx * sx) || 1), icp = (sy - slope * sx) / m;
      let shift = 0; for (const q of pts){ const d = q.p - (icp + slope * q.i); if (hi ? d > shift : d < shift) shift = d; }
      const at = i => icp + shift + slope * i;
      const move = slope * n / A;                     /* how far the line travels over the window, in ATR */
      return { slope, at, move, kind: Math.abs(move) < C.flatAtr ? 'flat' : move > 0 ? 'rising' : 'falling', first: pts[0].i };
    };
    const H = piv(true).slice(-6), L = piv(false).slice(-6);
    const top = fit(H, true), bot = fit(L, false);
    /* the trend over the window: a regression of the closes, in ATR */
    const cs = c.map(b => b.close), mx = (n - 1) / 2, my = cs.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0; cs.forEach((v, i) => { num += (i - mx) * (v - my); den += (i - mx) ** 2; });
    const trendMove = (num / den) * n / A;
    const trend = trendMove > 2 ? 'Uptrend' : trendMove < -2 ? 'Downtrend' : 'Consolidation';
    /* the trend BEFORE the window - for "continuation" */
    const pre = closed.slice(Math.max(0, base - look), base), preMove = pre.length > 20 ? (pre[pre.length - 1].close - pre[0].close) / A : 0;
    let pattern = null, bias = 0;
    if (top && bot){
      const k = top.kind + '/' + bot.kind;
      const gapStart = top.at(0) - bot.at(0), gapEnd = top.at(n - 1) - bot.at(n - 1);
      if (k === 'flat/rising'){ pattern = 'Ascending triangle'; bias = 1; }
      else if (k === 'falling/flat'){ pattern = 'Descending triangle'; bias = -1; }
      else if (k === 'flat/flat'){ pattern = 'Range (consolidation)'; }
      else if (k === 'falling/rising'){ pattern = 'Symmetrical triangle'; }
      else if (k === 'rising/rising'){ pattern = gapEnd < gapStart * 0.6 ? 'Rising wedge' : 'Rising channel'; bias = gapEnd < gapStart * 0.6 ? -1 : 1; }
      else if (k === 'falling/falling'){ pattern = gapEnd < gapStart * 0.6 ? 'Falling wedge' : 'Falling channel'; bias = gapEnd < gapStart * 0.6 ? 1 : -1; }
      else if (gapEnd > gapStart * 1.4) pattern = 'Broadening';
      else pattern = top.kind[0].toUpperCase() + top.kind.slice(1) + ' top, ' + bot.kind + ' bottom';
    }
    const consolidating = /triangle|Range|wedge|Broad/i.test(pattern || '');
    const continuation = consolidating && Math.abs(preMove) > 3 ? (preMove > 0 ? 'Trend continuation ↑ likely (the trend before was up)' : 'Trend continuation ↓ likely (the trend before was down)') : null;

    /* the events on the two zones */
    const z = A * C.zoneAtr / 2, marks = [];
    const inUp = i => top && c[i].high >= top.at(i) - z, inDn = i => bot && c[i].low <= bot.at(i) + z;
    let lastBreak = null;
    for (let i = Math.max(1, Math.min(top ? top.first : n, bot ? bot.first : n)); i < n; i++){
      const b = c[i];
      if (top){
        const t = top.at(i);
        if (b.close > t + z && c[i - 1].close <= top.at(i - 1) + z){ marks.push({ i, kind: 'breakout', up: true, p: b.close, text: 'Breakout ↑' }); lastBreak = { i, up: true }; continue; }
        if (inUp(i) && b.close < t - z * 0.2 && b.close < b.open) marks.push({ i, kind: 'reject', p: b.high, text: 'Rejection' });
      }
      if (bot){
        const s = bot.at(i);
        if (b.close < s - z && c[i - 1].close >= bot.at(i - 1) - z){ marks.push({ i, kind: 'breakout', up: false, p: b.close, text: 'Breakdown ↓' }); lastBreak = { i, up: false }; continue; }
        if (inDn(i) && b.close > s + z * 0.2 && b.close > b.open) marks.push({ i, kind: 'bounce', p: b.low, text: 'Bounce' });
      }
      /* back to the broken line within 12 candles, and held = a retest */
      if (lastBreak && i - lastBreak.i > 1 && i - lastBreak.i <= 12){
        if (lastBreak.up && top && b.low <= top.at(i) + z && b.close > top.at(i)){ marks.push({ i, kind: 'retest', p: b.low, text: 'Retest ✓' }); lastBreak = null; }
        else if (!lastBreak.up && bot && b.high >= bot.at(i) - z && b.close < bot.at(i)){ marks.push({ i, kind: 'retest', p: b.high, text: 'Retest ✓' }); lastBreak = null; }
      }
    }
    /* a smooth path through the closes, like a hand-drawn trend curve */
    const curve = IND.ema(IND.ema(cs, 8).map((v, i) => v == null ? cs[i] : v), 8).map((v, i) => v == null ? cs[i] : v);
    const names = {
      top: top ? (top.kind === 'flat' ? 'Flat resistance' : top.kind === 'falling' ? 'Descending upper trendline' : 'Rising upper trendline') + ' · resistance zone' : '',
      bot: bot ? (bot.kind === 'flat' ? 'Flat lower trendline' : bot.kind === 'rising' ? 'Rising lower trendline' : 'Falling lower trendline') + ' · support zone' : '',
    };
    return { base, n, A, z, top, bot, trend, pattern, bias, continuation, marks, curve, names };
  },
  result(){
    const raw = (typeof Chart !== 'undefined' && Chart.raw) || [];
    if (raw.length < 60) return null;
    /* follow the chart: read the candles that END at the right edge of what is on screen.
       At the live edge that is the newest closed candle (as before); scrolled back, the
       patterns are those of that moment, built only from candles up to it. */
    let end = raw.length - 2;                                   /* the last CLOSED candle */
    try { const r = Chart.main.timeScale().getVisibleLogicalRange(); if (r && r.to < end) end = Math.max(59, Math.floor(r.to)); } catch(e){}
    this.endIdx = end; this.atLive = end >= raw.length - 2;
    const view = this.atLive ? raw : raw.slice(0, end + 2);     /* analyse() drops the last one as "still forming" */
    const C = this.cfg(), key = [STORE.symbol, STORE.tf, raw.length, raw[raw.length - 2].time, end, C.look, C.wing, C.zoneAtr, C.flatAtr].join('|');
    if (!this._cache || this._cache.key !== key) this._cache = { key, res: this.analyse(view) };
    return this._cache.res;
  },

  /* ---------- drawing ---------- */
  rgba(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; },
  /* one sloped zone: a band from x0 to x1, in the chosen style, with its reflection */
  band(ctx, P, S, C, label){
    const { x0, x1, y0a, y0b, y1a, y1b } = P;                 /* a = upper edge, b = lower edge, at both ends */
    const poly = (dy, ctxFill) => { ctx.beginPath(); ctx.moveTo(x0, y0a + dy); ctx.lineTo(x1, y1a + dy); ctx.lineTo(x1, y1b + dy); ctx.lineTo(x0, y0b + dy); ctx.closePath(); if (ctxFill) ctx.fill(); };
    const mid0 = (y0a + y0b) / 2, mid1 = (y1a + y1b) / 2, h = Math.max(4, Math.abs(y0b - y0a));
    const edge = (ya, yb, width, alpha, blur) => { ctx.setLineDash(this.DASH[S.line] || []); ctx.lineWidth = width; ctx.strokeStyle = this.rgba(S.color, alpha);
      ctx.shadowColor = S.color; ctx.shadowBlur = blur; ctx.beginPath(); ctx.moveTo(x0, ya); ctx.lineTo(x1, yb); ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]); };
    if (S.style === 'line'){ edge(mid0, mid1, S.width, 1, S.glow * 6); }
    else if (S.style === 'flat'){ ctx.fillStyle = this.rgba(S.color, 0.16); poly(0, true); edge(y0a, y1a, S.width * 0.6, 0.8, 0); edge(y0b, y1b, S.width * 0.6, 0.8, 0); }
    else if (S.style === 'hatch'){
      ctx.save(); poly(0, false); ctx.clip(); ctx.strokeStyle = this.rgba(S.color, 0.45); ctx.lineWidth = 1;
      const top = Math.min(y0a, y1a, y0b, y1b) - 40, bottom = Math.max(y0a, y1a, y0b, y1b) + 40;
      for (let x = x0 - (bottom - top); x < x1; x += 7){ ctx.beginPath(); ctx.moveTo(x, bottom); ctx.lineTo(x + (bottom - top), top); ctx.stroke(); }   /* //// */
      ctx.restore(); edge(y0a, y1a, S.width * 0.7, 0.9, 0); edge(y0b, y1b, S.width * 0.7, 0.9, 0);
    } else {
      /* 3-D: a glowing core line, a body shaded darker to the bottom, a bright top edge */
      const g = ctx.createLinearGradient(0, Math.min(y0a, y1a), 0, Math.max(y0b, y1b));
      g.addColorStop(0, this.rgba(S.color, 0.38)); g.addColorStop(0.5, this.rgba(S.color, 0.16)); g.addColorStop(1, this.rgba(S.color, 0.04));
      ctx.fillStyle = g; poly(0, true);
      edge(y0a, y1a, Math.max(1, S.width * 0.6), 0.95, S.glow * 10);          /* lit top edge */
      edge(mid0, mid1, S.width, 1, S.glow * 16);                                /* the bright core */
      edge(y0b, y1b, 1, 0.35, 0);
      if (C.reflection){                                                        /* the reflection underneath */
        const off = h * 1.15, r = ctx.createLinearGradient(0, Math.min(y0b, y1b) + off - h, 0, Math.max(y0b, y1b) + off + h);
        r.addColorStop(0, this.rgba(S.color, 0.14)); r.addColorStop(1, this.rgba(S.color, 0));
        ctx.fillStyle = r; poly(off, true);
        ctx.setLineDash([]); ctx.lineWidth = 1; ctx.strokeStyle = this.rgba(S.color, 0.18); ctx.beginPath(); ctx.moveTo(x0, mid0 + off); ctx.lineTo(x1, mid1 + off); ctx.stroke();
      }
    }
    if (label && C.labels){
      /* the label pill sits ON the band, like the picture */
      ctx.font = '600 12px ' + (getComputedStyle(document.body).getPropertyValue('--font-sans') || 'sans-serif');
      const tw = ctx.measureText(label).width + 22, lx = x0 + (x1 - x0) * 0.22 + tw / 2, ly = mid0 + (mid1 - mid0) * (0.22 + tw / 2 / Math.max(1, x1 - x0));
      ctx.fillStyle = 'rgba(8,12,24,.88)'; ctx.strokeStyle = this.rgba(S.color, 0.9); ctx.lineWidth = 1.2; ctx.shadowColor = S.color; ctx.shadowBlur = S.style === '3d' ? 8 * S.glow : 0;
      this.pill(ctx, lx - tw / 2, ly - 11, tw, 22, 11); ctx.fill(); ctx.stroke(); ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(label, lx, ly + 0.5); ctx.textAlign = 'left';
    }
  },
  pill(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r); ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r); ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r); ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r); ctx.closePath(); },

  draw(ctx){
    const C = this.cfg();
    if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries) return;
    const R = this.result(); if (!R) return;
    const ts = Chart.main.timeScale(), right = Draw.cssW - 2, lr = ts.coordinateToLogical(right); if (lr == null) return;
    const X = i => ts.logicalToCoordinate(i), Y = p => Chart.priceSeries.priceToCoordinate(p);
    const at = (line, gi) => line.at(gi - R.base);
    ctx.save();
    const zoneOf = (line, S, label) => {
      const g0 = R.base + line.first, g1 = lr;
      const p0 = at(line, g0), p1 = at(line, g1);
      const P = { x0: X(g0), x1: X(g1), y0a: Y(p0 + R.z), y0b: Y(p0 - R.z), y1a: Y(p1 + R.z), y1b: Y(p1 - R.z) };
      if (Object.values(P).some(v => v == null || !Number.isFinite(v))) return;
      this.band(ctx, P, S, C, label);
    };
    if (C.showZones){
      if (R.top) zoneOf(R.top, C.res, R.names.top);
      if (R.bot) zoneOf(R.bot, C.sup, R.names.bot);
    }
    /* the trend curve with its arrow */
    if (C.showCurve){
      const S = C.curve; ctx.setLineDash(this.DASH[S.line] || []); ctx.lineWidth = S.width; ctx.strokeStyle = this.rgba(S.color, 0.85);
      ctx.shadowColor = S.color; ctx.shadowBlur = 6; ctx.beginPath();
      R.curve.forEach((v, i) => { const x = X(R.base + i), y = Y(v); if (x == null || y == null) return; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke(); ctx.shadowBlur = 0; ctx.setLineDash([]);
      const k = R.curve.length - 1, xa = X(R.base + k), ya = Y(R.curve[k]), xb = X(R.base + k - 3), yb = Y(R.curve[k - 3]);
      if ([xa, ya, xb, yb].every(v => v != null)){ const ang = Math.atan2(ya - yb, xa - xb); ctx.fillStyle = this.rgba(S.color, 0.95); ctx.beginPath();
        ctx.moveTo(xa + Math.cos(ang) * 10, ya + Math.sin(ang) * 10); ctx.lineTo(xa + Math.cos(ang + 2.5) * 9, ya + Math.sin(ang + 2.5) * 9); ctx.lineTo(xa + Math.cos(ang - 2.5) * 9, ya + Math.sin(ang - 2.5) * 9); ctx.closePath(); ctx.fill(); }
    }
    /* the events */
    const want = { bounce: C.showBounce, reject: C.showReject, breakout: C.showBreak, retest: C.showRetest };
    const per = {}; const marks = R.marks.slice().reverse().filter(m => want[m.kind] && (per[m.kind] = (per[m.kind] || 0) + 1) <= C.maxMarks);
    ctx.font = '700 10.5px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
    for (const m of marks){
      const x = X(R.base + m.i), y = Y(m.p); if (x == null || y == null) continue;
      const col = C.marks[m.kind], below = m.kind === 'bounce' || (m.kind === 'retest' && m.p <= (R.top ? at(R.top, R.base + m.i) : m.p)) || (m.kind === 'breakout' && !m.up);
      const ty = below ? y + 18 : y - 18;
      ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(x, below ? y + 3 : y - 3); ctx.lineTo(x, below ? ty - 8 : ty + 8); ctx.stroke();
      const tw = ctx.measureText(m.text).width + 10;
      ctx.fillStyle = 'rgba(8,12,24,.9)'; this.pill(ctx, x - tw / 2, ty - 8, tw, 16, 8); ctx.fill(); ctx.strokeStyle = col; ctx.stroke();
      ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.text, x, ty); ctx.textAlign = 'left';
    }
    /* the title: what the window is doing */
    if (C.showTitle){
      const lines = [[C.showTrend ? R.trend : '', R.trend === 'Uptrend' ? '#00e676' : R.trend === 'Downtrend' ? '#ff5252' : '#ffd740'], [R.pattern || '', '#e8eaf6'], [R.continuation || '', '#40c4ff']].filter(l => l[0]);
      ctx.font = '700 13px ' + (getComputedStyle(document.body).getPropertyValue('--font-sans') || 'sans-serif');
      let y = 74; const x = 12;
      if (!this.atLive){ const t0 = (Chart.raw[this.endIdx] || {}).time;
        if (t0) lines.unshift(['⏪ as of ' + new Date((t0 - TZ_OFF) * 1000).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' — scroll right for live', '#9fb0c8']); }
      for (const [t, col] of lines){ const tw = ctx.measureText(t).width + 18; ctx.fillStyle = 'rgba(6,10,22,.82)'; this.pill(ctx, x, y - 11, tw, 22, 6); ctx.fill();
        ctx.strokeStyle = this.rgba(col, 0.7); ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = col; ctx.textBaseline = 'middle'; ctx.fillText(t, x + 9, y + 0.5); y += 26; ctx.font = '600 12px ' + (getComputedStyle(document.body).getPropertyValue('--font-sans') || 'sans-serif'); }
    }
    ctx.restore();
  },

  /* ---------- the chart background ---------- */
  BGS: {
    none: null,
    deepblue: 'radial-gradient(ellipse at 50% 20%, #12306b 0%, #071634 45%, #02060f 100%)',
    midnight: 'linear-gradient(180deg, #05070d 0%, #000000 100%)',
    navy: 'linear-gradient(180deg, #0d1b3d 0%, #050b1c 100%)',
    purple: 'radial-gradient(ellipse at 50% 0%, #2a1050 0%, #120726 55%, #05020c 100%)',
    carbon: 'repeating-linear-gradient(45deg, #0d0f14 0 6px, #11141b 6px 12px)',
    stage: 'linear-gradient(180deg, #081a3a 0%, #04102a 70%, #0a2a55 86%, #020814 100%)',
  },
  applyBg(){
    const C = this.cfg(), el = document.getElementById('mainWrap'); if (!el) return;
    const bg = C.bg === 'custom' ? `linear-gradient(180deg, ${C.bgTop} 0%, ${C.bgBottom} 100%)` : this.BGS[C.bg];
    el.style.background = bg || '';
    if (typeof Chart !== 'undefined' && Chart.main) try { Chart.main.applyOptions({ grid: C.hideGrid ? { vertLines: { visible: false }, horzLines: { visible: false } } : { vertLines: { visible: true }, horzLines: { visible: true } } }); } catch(e){}
  },

  /* ---------- the button and the settings ---------- */
  syncBtn(){ const b = document.getElementById('patBtn'); if (b) b.classList.toggle('on', this.cfg().on); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c);
    if (c.on && typeof toast === 'function') toast('Patterns on — trend, the shape of the market, its zones and the bounces, rejections, breakouts and retests. ⚙ to design it.', 'info'); },
  panel(){
    let el = document.getElementById('patPanel');
    if (el){ el.remove(); return; }
    const c = this.cfg();
    const chk = (k, t) => `<label><input type="checkbox" data-pk="${k}"${c[k] ? ' checked' : ''}> ${t}</label>`;
    const num = (k, t, min, max, step) => `<label>${t} <input type="number" data-pn="${k}" value="${c[k]}" min="${min}" max="${max}" step="${step || 1}"></label>`;
    const sel = (path, t, opts, cur) => `<label>${t} <select data-ps="${path}">${opts.map(([v, x]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${x}</option>`).join('')}</select></label>`;
    const col = (path, t, v) => `<label>${t} <input type="color" data-pc="${path}" value="${v}"></label>`;
    const rng = (path, t, min, max, step, v) => `<label>${t} <input type="range" data-pr="${path}" min="${min}" max="${max}" step="${step}" value="${v}"><em>${v}</em></label>`;
    const STY = [['3d', '3-D glow (like the picture)'], ['flat', 'Flat band'], ['hatch', 'Hatched ////'], ['line', 'Single line']];
    const LIN = [['solid', 'Solid ───'], ['dashed', 'Dashed - - -'], ['dotted', 'Dotted ·····'], ['dashdot', 'Dash-dot -·-·']];
    const zone = (k, t) => `<div class="srLook"><b>${t}</b>${col(k + '.color', 'Colour', c[k].color)}${sel(k + '.style', 'Style', STY, c[k].style)}${sel(k + '.line', 'Line', LIN, c[k].line)}
      ${rng(k + '.width', 'Thickness (thin → bold)', 0.5, 5, 0.5, c[k].width)}${rng(k + '.glow', 'Glow', 0, 3, 0.25, c[k].glow)}</div>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="patPanel" class="autoSrPanel asPanel">
      <b>Patterns — trend, shape, zones and events</b>
      <div class="srLook"><b>What to find</b>
        ${num('look', 'Candles to read', 40, 600, 10)}${num('wing', 'Swing size (candles each side)', 2, 15)}
        ${num('zoneAtr', 'Zone thickness (× ATR)', 0.1, 3, 0.1)}${num('flatAtr', 'Counts as flat below (ATR moved)', 0.2, 5, 0.1)}</div>
      <div class="srLook"><b>What to show</b>
        ${chk('showTitle', 'The name of the pattern (top left)')}${chk('showTrend', 'Uptrend / downtrend / consolidation')}${chk('showZones', 'Support and resistance zones')}
        ${chk('showCurve', 'Trend curve with arrow')}${chk('showBounce', 'Bounces')}${chk('showReject', 'Rejections')}${chk('showBreak', 'Breakouts / breakdowns')}${chk('showRetest', 'Retests')}
        ${num('maxMarks', 'Markers of each kind', 1, 12)}${chk('labels', 'Labels on the zones')}${chk('reflection', 'Reflection under the 3-D zones')}</div>
      ${zone('res', 'Resistance zone')}${zone('sup', 'Support zone')}
      <div class="srLook"><b>Trend curve</b>${col('curve.color', 'Colour', c.curve.color)}${sel('curve.line', 'Line', LIN, c.curve.line)}${rng('curve.width', 'Thickness', 0.5, 5, 0.5, c.curve.width)}</div>
      <div class="srLook"><b>Event colours</b>${col('marks.bounce', 'Bounce', c.marks.bounce)}${col('marks.reject', 'Rejection', c.marks.reject)}${col('marks.breakout', 'Breakout', c.marks.breakout)}${col('marks.retest', 'Retest', c.marks.retest)}</div>
      <div class="srLook"><b>Chart background</b>
        ${sel('bg', 'Background', [['none', 'ASTRA standard'], ['deepblue', 'Deep blue glow (like the picture)'], ['stage', 'Blue stage with a lit floor'], ['navy', 'Navy'], ['midnight', 'Midnight black'], ['purple', 'Purple night'], ['carbon', 'Carbon'], ['custom', 'My own colours ↓']], c.bg)}
        ${col('bgTop', 'Own colour — top', c.bgTop)}${col('bgBottom', 'Own colour — bottom', c.bgBottom)}${chk('hideGrid', 'Hide the grid lines')}</div>
      <button class="bMini" data-preset="1">Back to the original design</button>
    </div>`);
    el = document.getElementById('patPanel');
    const b = document.getElementById('patCfg').getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - 350, b.left - 150)) + 'px'; el.style.top = (b.bottom + 6) + 'px';
    const setPath = (v, path, val) => { const [a, k] = path.split('.'); if (k) v[a] = Object.assign({}, v[a], { [k]: val }); else v[a] = val; };
    const apply = e => {
      const t = e.target, v = this.cfg();
      if (t.dataset.pk) v[t.dataset.pk] = t.checked;
      else if (t.dataset.pn){ if (t.value === '' || !Number.isFinite(+t.value)) return; v[t.dataset.pn] = +t.value; }
      else if (t.dataset.ps) setPath(v, t.dataset.ps, t.value);
      else if (t.dataset.pc){ setPath(v, t.dataset.pc, t.value); if (/^bg(Top|Bottom)$/.test(t.dataset.pc)) v.bg = 'custom'; }
      else if (t.dataset.pr){ setPath(v, t.dataset.pr, +t.value); const em = t.nextElementSibling; if (em) em.textContent = t.value; }
      else return;
      if (!v.on && !t.dataset.ps?.startsWith('bg') && !t.dataset.pc?.startsWith('bg') && t.dataset.pk !== 'hideGrid') v.on = true;
      this.save(v);
    };
    el.addEventListener('input', apply); el.addEventListener('change', apply);
    el.addEventListener('click', e => { if (!e.target.closest('[data-preset]')) return; this.save(Object.assign({}, this.DEF, { on: true })); el.remove(); this.panel(); });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#patPanel, #patCfg')){ document.getElementById('patPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('autoStructCfg') || document.getElementById('autoSrCfg');
  if (!after || document.getElementById('patBtn')) return;
  after.insertAdjacentHTML('afterend', `<button id="patBtn" class="bMini autoSrBtn${ChartPatterns.cfg().on ? ' on' : ''}" title="Trend, pattern, support and resistance zones, bounces, rejections, breakouts and retests — and the chart background">✦ Patterns</button><button id="patCfg" class="bMini" title="Patterns and chart background settings">⚙</button>`);
  document.getElementById('patBtn').addEventListener('click', () => ChartPatterns.toggle());
  document.getElementById('patCfg').addEventListener('click', () => ChartPatterns.panel());
  setTimeout(() => ChartPatterns.applyBg(), 1500);
});
