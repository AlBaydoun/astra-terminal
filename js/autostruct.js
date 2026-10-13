/* ASTRA Terminal — Auto Structure: the sloped levels and the predictive ones.

   Auto S/R (autosr.js) draws the FLAT levels. This draws what moves:

   1. TRENDLINES in both directions. Every pair of swing lows is tried as a
      support line and every pair of swing highs as a resistance line. A line
      is kept only if no candle CLOSED through it between its two anchors, and
      it is scored on how many other swings sit on it (touches), how long it is,
      and how recently it was touched. Lines whose price has since closed
      clearly through them are "broken" and hidden (or shown faint, if you ask).
      Rising support under an uptrend, falling resistance over a downtrend,
      and the other two combinations, all found the same way.
   2. CHANNEL: the best trendline copied in parallel through the farthest
      swing on the other side, so the price's corridor is visible.
   3. FIBONACCI on the last major swing (the largest high-to-low move in the
      lookback): retracements 23.6 / 38.2 / 50 / 61.8 / 78.6 %, the "golden
      pocket" 61.8–65 % shaded, and extensions 127.2 / 161.8 % beyond it.
   4. PIVOT POINTS for today from yesterday's high, low and close: classic,
      Fibonacci or Camarilla — the levels many floor traders and algos use.

   Every part, colour, thickness and number is set in ⚙ and remembered.
   Read only: it draws, it never trades. */
const AutoStruct = {
  KEY: 'astra_autostruct',
  DEF: {
    on: false,
    trend: true, trendN: 2, wing: 5, look: 300, tolAtr: 0.3, showBroken: false, channel: true,
    fib: true, fibLook: 150, fibLevels: '0.236, 0.382, 0.5, 0.618, 0.786', golden: true, fibExt: true, fibExtLevels: '1.272, 1.618',
    piv: true, pivType: 'classic',
    labels: true, width: 1, bright: 0.9,
    colors: { up: '#2979ff', down: '#ff6d00', channel: '#90a4ae', fib: '#ffca28', golden: '#ffca28', ext: '#ab47bc', pivot: '#26c6da', pivotP: '#eceff1' },
  },
  cfg(){ const s = lsGet(this.KEY, {}) || {}; return Object.assign({}, this.DEF, s, { colors: Object.assign({}, this.DEF.colors, s.colors || {}) }); },
  save(c){ lsSet(this.KEY, c); this._cache = null; if (typeof Draw !== 'undefined') Draw.redraw(); this.syncBtn(); },
  nums(str){ return String(str || '').split(/[ ,;]+/).map(Number).filter(v => Number.isFinite(v) && v > 0 && v < 10); },

  /* ---------- 1 + 2: trendlines and the channel ---------- */
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
        /* no candle may CLOSE through the line between its anchors */
        let bad = false;
        for (let i = A1.i + 1; i < B1.i && !bad; i++) bad = hi ? c[i].close > at(i) + tol : c[i].close < at(i) - tol;
        if (bad) continue;
        let touches = 2, lastTouch = B1.i, broken = false, brokenAt = null;
        for (const q of P) if (q.i > A1.i && q.i !== B1.i && Math.abs(q.p - at(q.i)) <= tol){ touches++; lastTouch = Math.max(lastTouch, q.i); }
        /* after the second anchor: two closes beyond the line = broken */
        let beyond = 0;
        for (let i = B1.i + 1; i < n; i++){ const out = hi ? c[i].close > at(i) + tol : c[i].close < at(i) - tol;
          beyond = out ? beyond + 1 : 0; if (beyond >= 2){ broken = true; brokenAt = i; break; } }
        if (broken && !C.showBroken) continue;
        const span = (n - A1.i) / n, recency = Math.exp(-(n - 1 - lastTouch) / (n / 4));
        lines.push({ hi, a: base + A1.i, pa: A1.p, slope, touches, broken, brokenAt: brokenAt != null ? base + brokenAt : null,
          score: touches * 2 + span * 2 + recency * 3 - (broken ? 5 : 0), aTime: c[A1.i].time });
      }
      lines.sort((x, y) => y.score - x.score);
      /* never two nearly identical lines */
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

  /* ---------- 3: Fibonacci on the last major swing ---------- */
  fib(c, base, C){
    const n = c.length, look = Math.min(n, C.fibLook | 0 || 150), s = c.slice(n - look);
    let hiI = 0, loI = 0;
    s.forEach((b, i) => { if (b.high > s[hiI].high) hiI = i; if (b.low < s[loI].low) loI = i; });
    const up = loI < hiI;                                   /* the low came first: the swing went UP */
    const from = up ? s[loI].low : s[hiI].high, to = up ? s[hiI].high : s[loI].low;
    return { up, from, to, startTime: s[Math.min(hiI, loI)].time, startIdx: base + n - look + Math.min(hiI, loI), range: Math.abs(to - from) };
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
    const key = [STORE.symbol, STORE.tf, raw.length, raw[raw.length - 2].time, C.wing, C.look, C.tolAtr, C.trendN, C.showBroken, C.channel, C.fibLook, C.pivType].join('|');
    if (this._cache && this._cache.key === key) return this._cache.res;
    const closed = raw.slice(0, -1), look = Math.min(closed.length, C.look | 0 || 300), c = closed.slice(-look), base = closed.length - look;
    const atr = IND.atr(c, 14), A = atr[c.length - 1] || c[c.length - 1].close * 0.002;
    const res = { A, base, tl: this.trendlines(c, base, A, C), fib: this.fib(c, base, C), piv: this.pivots(raw, C.pivType) };
    this._cache = { key, res };
    return res;
  },

  /* ---------- drawing ---------- */
  rgba(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; },
  draw(ctx){
    const C = this.cfg();
    if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries) return;
    const R = this.result(); if (!R) return;
    const ts = Chart.main.timeScale(), W = Draw.cssW, right = W - 2;
    const lr = ts.coordinateToLogical(right); if (lr == null) return;
    const X = i => ts.logicalToCoordinate(i), Y = p => Chart.priceSeries.priceToCoordinate(p);
    ctx.save();
    ctx.font = '600 10.5px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
    const used = [];
    const label = (x, y, text, color) => {
      if (!C.labels || y == null) return;
      let yy = y - 9; while (used.some(u => Math.abs(u.y - yy) < 14 && Math.abs(u.x - x) < 200)) yy -= 14;
      const w = ctx.measureText(text).width + 10; x = Math.max(4, Math.min(x, right - w - 70)); used.push({ x, y: yy });
      ctx.globalAlpha = 1; ctx.fillStyle = 'rgba(6,10,22,.82)'; ctx.fillRect(x, yy - 7, w, 14);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x + .5, yy - 6.5, w - 1, 13);
      ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 5, yy);
    };
    const seg = (x0, y0, x1, y1, color, width, dash) => {
      if (x0 == null || y0 == null || x1 == null || y1 == null) return;
      ctx.setLineDash(dash || []); ctx.strokeStyle = color; ctx.globalAlpha = C.bright; ctx.lineWidth = Math.max(0.5, width * C.width);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
    };
    const tline = (L, color, dash, name) => {
      const end = L.broken && L.brokenAt != null ? L.brokenAt + 3 : lr;
      const pAt = i => L.pa + L.slope * (i - L.a);
      seg(X(L.a), Y(pAt(L.a)), X(end), Y(pAt(end)), color, L.broken ? 1 : 1 + Math.min(1.5, (L.touches - 2) * 0.5), L.broken ? [3, 4] : dash);
      const lastI = Math.min(end, lr - 2), deg = Math.atan2(-(Y(pAt(lastI)) - Y(pAt(lastI - 10))), X(lastI) - X(lastI - 10)) * 180 / Math.PI;
      label(X(lastI) - 260, Y(pAt(lastI)), `${name} · ${L.touches} touches · ${deg >= 0 ? '↗' : '↘'} ${Math.abs(deg).toFixed(0)}°${L.broken ? ' · broken' : ''} · now ${fmtPrice(pAt(R.base + (Chart.raw.length - 2 - R.base)))}`, color);
    };
    /* 1 + 2 */
    if (C.trend){
      R.tl.sup.forEach((L, k) => tline(L, C.colors.up, null, 'Support line ' + (k + 1)));
      R.tl.res.forEach((L, k) => tline(L, C.colors.down, null, 'Resistance line ' + (k + 1)));
      if (R.tl.channel){ const L = R.tl.channel; seg(X(L.a), Y(L.pa), X(lr), Y(L.pa + L.slope * (lr - L.a)), C.colors.channel, 1, [8, 5]);
        label(X(lr - 2) - 180, Y(L.pa + L.slope * (lr - 2 - L.a)), 'Channel', C.colors.channel); }
    }
    /* 3 */
    if (C.fib && R.fib.range > 0){
      const F = R.fib, x0 = X(F.startIdx), lv = p => F.to + (F.from - F.to) * p;   /* retracement measured back from the end of the swing */
      if (C.golden){ const y1 = Y(lv(0.618)), y2 = Y(lv(0.65)); if (y1 != null && y2 != null){ ctx.fillStyle = this.rgba(C.colors.golden, 0.1); ctx.fillRect(x0, Math.min(y1, y2), right - x0, Math.max(2, Math.abs(y2 - y1))); } }
      const levels = [0, ...this.nums(C.fibLevels), 1];
      for (const p of levels){ const y = Y(lv(p)); seg(x0, y, right, y, C.colors.fib, p === 0 || p === 1 ? 1.2 : 0.8, p === 0.5 ? [4, 3] : null);
        label(right - 230, y, `Fib ${(p * 100).toFixed(1)}%  ${fmtPrice(lv(p))}${p === 0.618 && C.golden ? '  golden pocket' : ''}`, C.colors.fib); }
      if (C.fibExt) for (const e of this.nums(C.fibExtLevels)){ const p = F.from + (F.to - F.from) * e, y = Y(p);
        seg(x0, y, right, y, C.colors.ext, 0.8, [6, 4]); label(right - 230, y, `Fib ext ${(e * 100).toFixed(1)}%  ${fmtPrice(p)}`, C.colors.ext); }
    }
    /* 4 */
    if (C.piv && R.piv){
      const x0 = Math.max(0, Draw.timeToX(R.piv.startTime) || 0);
      for (const [k, p] of Object.entries(R.piv.lv)){ const y = Y(p), col = k === 'P' ? C.colors.pivotP : C.colors.pivot;
        seg(x0, y, right, y, col, k === 'P' ? 1.3 : 0.9, k === 'P' ? null : [2, 3]); label(x0 + 6, y, `${k === 'P' ? 'Pivot' : k} ${fmtPrice(p)}`, col); }
    }
    ctx.restore();
  },

  /* ---------- button + settings ---------- */
  syncBtn(){ const b = document.getElementById('autoStructBtn'); if (b) b.classList.toggle('on', this.cfg().on); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c);
    if (c.on && typeof toast === 'function') toast('Structure on — sloped support/resistance, channel, Fibonacci and today\'s pivots. ⚙ to change anything.', 'info'); },
  panel(){
    let el = document.getElementById('autoStructPanel');
    if (el){ el.remove(); return; }
    const c = this.cfg();
    const chk = (k, t) => `<label><input type="checkbox" data-as="${k}"${c[k] ? ' checked' : ''}> ${t}</label>`;
    const num = (k, t, min, max, step) => `<label>${t} <input type="number" data-asn="${k}" value="${c[k]}" min="${min}" max="${max}" step="${step || 1}"></label>`;
    const txt = (k, t) => `<label class="asWide">${t} <input type="text" data-ast="${k}" value="${esc(c[k])}"></label>`;
    const col = (k, t) => `<label>${t} <input type="color" data-asc="${k}" value="${c.colors[k]}"></label>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="autoStructPanel" class="autoSrPanel asPanel">
      <b>Structure — sloped lines, Fibonacci, pivots</b>
      <div class="srLook"><b>Trendlines (sloped support &amp; resistance)</b>
        ${chk('trend', 'Show trendlines')}${num('trendN', 'Lines each way', 1, 8)}${num('wing', 'Swing size (candles each side)', 2, 20)}
        ${num('look', 'Look back (candles)', 100, 2000, 50)}${num('tolAtr', 'Touch tolerance (× ATR)', 0.05, 2, 0.05)}
        ${chk('showBroken', 'Also show broken lines (faint)')}${chk('channel', 'Channel (parallel line)')}
        ${col('up', 'Support line colour')}${col('down', 'Resistance line colour')}${col('channel', 'Channel colour')}</div>
      <div class="srLook"><b>Fibonacci (last major swing)</b>
        ${chk('fib', 'Show Fibonacci')}${num('fibLook', 'Swing found within (candles)', 30, 1000, 10)}
        ${txt('fibLevels', 'Retracements')}${chk('golden', 'Shade the golden pocket (61.8–65 %)')}
        ${chk('fibExt', 'Extensions')}${txt('fibExtLevels', 'Extension levels')}
        ${col('fib', 'Fibonacci colour')}${col('ext', 'Extension colour')}${col('golden', 'Golden pocket colour')}</div>
      <div class="srLook"><b>Pivot points (today, from yesterday)</b>
        ${chk('piv', 'Show pivot points')}
        <label>Type <select data-assel="pivType">${[['classic', 'Classic'], ['fibonacci', 'Fibonacci'], ['camarilla', 'Camarilla']].map(([v, t]) => `<option value="${v}"${v === c.pivType ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        ${col('pivotP', 'Pivot colour')}${col('pivot', 'R / S colour')}</div>
      <div class="srLook"><b>Look</b>${chk('labels', 'Labels')}
        <label>Line thickness <input type="range" min="0.5" max="3" step="0.25" data-asr="width" value="${c.width}"><em>${c.width}×</em></label>
        <label>Brightness <input type="range" min="0.25" max="1" step="0.05" data-asr="bright" value="${c.bright}"><em>${Math.round(c.bright * 100)}%</em></label>
        <button class="bMini" data-asreset="1">Back to the original settings</button></div>
    </div>`);
    el = document.getElementById('autoStructPanel');
    const b = document.getElementById('autoStructCfg').getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - 340, b.left - 150)) + 'px'; el.style.top = (b.bottom + 6) + 'px';
    const apply = e => {
      const t = e.target, v = this.cfg();
      if (t.dataset.as) v[t.dataset.as] = t.checked;
      else if (t.dataset.asn){ if (t.value === '' || !Number.isFinite(+t.value)) return; v[t.dataset.asn] = +t.value; }
      else if (t.dataset.ast) v[t.dataset.ast] = t.value;
      else if (t.dataset.assel) v[t.dataset.assel] = t.value;
      else if (t.dataset.asc) v.colors = Object.assign({}, v.colors, { [t.dataset.asc]: t.value });
      else if (t.dataset.asr){ v[t.dataset.asr] = +t.value; const em = t.nextElementSibling; if (em) em.textContent = t.dataset.asr === 'bright' ? Math.round(+t.value * 100) + '%' : t.value + '×'; }
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
  after.insertAdjacentHTML('afterend', `<button id="autoStructBtn" class="bMini autoSrBtn${AutoStruct.cfg().on ? ' on' : ''}" title="Sloped support & resistance, channel, Fibonacci and pivot points — drawn automatically">✦ Structure</button><button id="autoStructCfg" class="bMini" title="Structure settings">⚙</button>`);
  document.getElementById('autoStructBtn').addEventListener('click', () => AutoStruct.toggle());
  document.getElementById('autoStructCfg').addEventListener('click', () => AutoStruct.panel());
});
