/* ASTRA Terminal — Auto Support & Resistance.

   Finds the price levels the market actually respects and draws them on the
   chart in neon, strongest brightest. It combines the methods the serious
   tools use, and scores every level on all of them at once:

     1. Swing pivots at FOUR sizes (2, 5, 10 and 20 candles either side): a
        turn that holds against 20 candles each way counts far more than a wiggle.
     2. How hard price bounced away (the reaction, in ATR).
     3. The volume on the turning candle against the average.
     4. Every later candle that came to the level and was rejected (a wick
        through it that closed back on the right side) — a "test".
     5. Role flip: a level that was support and later resistance (or the other
        way) is the classic strongest kind.
     6. Higher-timeframe confirmation: the same candles grouped 4 and 16 at a
        time (15m → 1h → 4h) must show a turn there too.
     7. The volume profile: prices where the most volume changed hands.
     8. Round numbers (4100, 4150, 1.1000 …), where orders cluster.
     9. Recency: an old level fades unless it keeps being tested.
    Levels closer than a fraction of ATR are merged into one ZONE whose width is
    the spread of its turns. Penalty: closes straight through it many times.

   Plus the levels every trader watches: yesterday's and last week's high and low.

   Read only. Nothing here trades; it draws. */
const AutoSR = {
  KEY: 'astra_autosr',
  cfg(){
    return Object.assign({ on: false, perSide: 4, zones: true, minor: true, dayWeek: true, sens: 'normal', labels: true,
      colors: {}, width: 1, bright: 0.9, glow: 0, zoneAlpha: 1 }, lsGet(this.KEY, {}) || {});
  },
  save(c){ lsSet(this.KEY, c); this._cache = null; if (typeof Draw !== 'undefined') Draw.redraw(); this.syncBtn(); },
  /* defaults chosen to look NOTHING like the open-trade lines (green target, red stop, grey entry, amber REAL) */
  COL: { support: '#3d8bff', resistance: '#ff8a00', flip: '#e6e6ff', day: '#c77dff', week: '#4dd0e1' },
  /* your own colours (⚙), falling back to the defaults */
  col(k){ const c = (this.cfg().colors || {})[k]; return /^#[0-9a-f]{6}$/i.test(c || '') ? c : this.COL[k]; },
  SENS: { tight: { tol: 0.3, look: 600 }, normal: { tol: 0.45, look: 1000 }, wide: { tol: 0.7, look: 1500 } },

  /* ---------- the engine ---------- */
  compute(raw){
    const C = this.cfg(), S = this.SENS[C.sens] || this.SENS.normal;
    const c = raw.slice(-S.look);
    const n = c.length;
    if (n < 60) return { levels: [], keys: [] };
    const atr = IND.atr(c, 14), A = atr[n - 1] || (c[n - 1].high - c[n - 1].low) || c[n - 1].close * 0.002;
    const tol = A * S.tol;
    const vols = c.map(b => b.volume || 0), vAvg = vols.reduce((a, b) => a + b, 0) / n || 1;

    /* 1-3: pivots at four sizes, each with its reaction and volume */
    const WINGS = [[20, 4], [10, 3], [5, 2], [2, 1]];
    const isPivot = (i, w, hi) => {
      if (i - w < 0 || i + w >= n) return false;
      for (let k = 1; k <= w; k++){
        if (hi ? (c[i].high <= c[i - k].high || c[i].high < c[i + k].high) : (c[i].low >= c[i - k].low || c[i].low > c[i + k].low)) return false;
      }
      return true;
    };
    const pts = [];
    for (let i = 2; i < n - 2; i++){
      for (const hi of [true, false]){
        let sig = 0;
        for (const [w, s] of WINGS) if (isPivot(i, w, hi)){ sig = s; break; }
        if (!sig) continue;
        const price = hi ? c[i].high : c[i].low;
        let away = 0;
        for (let j = i + 1; j <= Math.min(n - 1, i + 12); j++) away = Math.max(away, hi ? price - c[j].low : c[j].high - price);
        pts.push({ price, i, kind: hi ? 'resistance' : 'support', sig,
          react: Math.min(3, away / A), vol: Math.max(0.5, Math.min(3, (vols[i] || vAvg) / vAvg)) });
      }
    }
    if (!pts.length) return { levels: [], keys: this.keyLevels(raw) };

    /* merge into zones */
    pts.sort((a, b) => a.price - b.price);
    const groups = [];
    for (const p of pts){
      const g = groups[groups.length - 1];
      const centre = g ? g.wsum / g.w : 0;
      if (g && Math.abs(p.price - centre) <= tol){ g.pts.push(p); g.wsum += p.price * p.sig; g.w += p.sig; }
      else groups.push({ pts: [p], wsum: p.price * p.sig, w: p.sig });
    }

    /* 6: higher timeframes — the same candles grouped 4 and 16 at a time */
    const htf = [4, 16].map(k => {
      const agg = [];
      for (let i = n % k; i + k <= n; i += k){
        const s = c.slice(i, i + k);
        agg.push({ high: Math.max(...s.map(b => b.high)), low: Math.min(...s.map(b => b.low)) });
      }
      const out = [];
      for (let i = 2; i < agg.length - 2; i++){
        if (agg[i].high > agg[i - 1].high && agg[i].high > agg[i - 2].high && agg[i].high >= agg[i + 1].high && agg[i].high >= agg[i + 2].high) out.push(agg[i].high);
        if (agg[i].low < agg[i - 1].low && agg[i].low < agg[i - 2].low && agg[i].low <= agg[i + 1].low && agg[i].low <= agg[i + 2].low) out.push(agg[i].low);
      }
      return out;
    });

    /* 7: the volume profile - the three busiest price bands */
    const lo = Math.min(...c.map(b => b.low)), hi = Math.max(...c.map(b => b.high)), BINS = 60, step = (hi - lo) / BINS || 1;
    const prof = new Array(BINS).fill(0);
    for (const b of c){ const v = b.volume || 1, a = Math.floor((b.low - lo) / step), z = Math.min(BINS - 1, Math.floor((b.high - lo) / step));
      for (let k = Math.max(0, a); k <= z; k++) prof[k] += v / (z - a + 1); }
    const hvn = prof.map((v, k) => ({ v, price: lo + (k + 0.5) * step })).sort((x, y) => y.v - x.v).slice(0, 3).map(x => x.price);

    /* 8: the round-number grid for this price */
    const px = c[n - 1].close, mag = Math.pow(10, Math.floor(Math.log10(px)));
    const roundStep = px / mag >= 5 ? mag / 2 : mag / 4 >= A * 4 ? mag / 4 : mag / 10;

    const levels = groups.map(g => {
      const centre = g.wsum / g.w;
      const prices = g.pts.map(p => p.price);
      let zLo = Math.min(...prices), zHi = Math.max(...prices);
      const pad = A * 0.08; zLo -= pad; zHi += pad;
      if (zHi - zLo > A * 1.2){ zLo = centre - A * 0.6; zHi = centre + A * 0.6; }
      const first = Math.min(...g.pts.map(p => p.i)), last = Math.max(...g.pts.map(p => p.i));
      const kinds = new Set(g.pts.map(p => p.kind));
      /* 4: tests after the first turn - a wick into the zone that closed back out */
      let tests = 0, through = 0;
      for (let j = first + 1; j < n; j++){
        const b = c[j];
        if (b.low <= zHi && b.high >= zLo){
          if ((b.close > zHi && b.low <= zHi) || (b.close < zLo && b.high >= zLo)) tests++;
        }
        if (j > 0 && ((c[j - 1].close < zLo && b.close > zHi) || (c[j - 1].close > zHi && b.close < zLo))) through++;
      }
      /* a true flip: turned the market BOTH ways, more than once each */
      const flip = g.pts.filter(p => p.kind === 'support').length >= 2 && g.pts.filter(p => p.kind === 'resistance').length >= 2;
      const htfHit = htf.map(list => list.some(v => Math.abs(v - centre) <= tol * 1.5));
      const volHit = hvn.some(v => Math.abs(v - centre) <= Math.max(tol, step));
      const round = Math.abs(centre / roundStep - Math.round(centre / roundStep)) * roundStep <= A * 0.15;
      const recency = Math.exp(-(n - 1 - last) / (n / 3));
      const base = g.pts.reduce((a, p) => a + p.sig * (1 + p.react / 3) * (0.7 + 0.3 * p.vol), 0);
      const score = base + Math.min(tests, 8) * 0.6 + (flip ? 3 : 0) + (htfHit[0] ? 2 : 0) + (htfHit[1] ? 3 : 0)
        + (volHit ? 1.5 : 0) + (round ? 0.5 : 0) + recency * 3 - Math.min(through, 10) * 0.4;
      const tags = [];
      if (flip) tags.push('flip'); if (htfHit[1]) tags.push('HTF×16'); else if (htfHit[0]) tags.push('HTF×4');
      if (volHit) tags.push('volume'); if (round) tags.push('round');
      return { price: centre, zLo, zHi, touches: g.pts.length, tests, through, flip, tags, score, first, firstTime: c[first].time, lastTime: c[last].time };
    }).filter(L => L.score > 2);

    return { levels, A, keys: this.keyLevels(raw) };
  },

  /* yesterday's and last week's high / low, on the broker's own day */
  keyLevels(raw){
    if (!raw.length) return [];
    const day = b => Math.floor((b.rawTime != null ? b.rawTime : b.time) / 86400);
    const today = day(raw[raw.length - 1]);
    const prevDays = [...new Set(raw.map(day))].filter(d => d < today).slice(-6);
    if (!prevDays.length) return [];
    const yd = prevDays[prevDays.length - 1];
    const ys = raw.filter(b => day(b) === yd), ws = raw.filter(b => prevDays.includes(day(b)));
    const out = [];
    if (ys.length){ out.push({ price: Math.max(...ys.map(b => b.high)), label: 'Yesterday high', kind: 'day' }, { price: Math.min(...ys.map(b => b.low)), label: 'Yesterday low', kind: 'day' }); }
    if (ws.length > ys.length){ out.push({ price: Math.max(...ws.map(b => b.high)), label: 'Last 5 days high', kind: 'week' }, { price: Math.min(...ws.map(b => b.low)), label: 'Last 5 days low', kind: 'week' }); }
    return out;
  },

  /* the levels to show: the strongest on each side of the price, never two on top of each other */
  pick(res, price){
    const C = this.cfg();
    if (!res.levels.length) return [];
    const max = Math.max(...res.levels.map(L => L.score));
    const pickSide = list => {
      const out = [];
      for (const L of list.sort((a, b) => b.score - a.score)){
        if (out.length >= C.perSide) break;
        if (out.some(o => Math.abs(o.price - L.price) < res.A * 2)) continue;     /* levels never crowd each other */
        out.push(L);
      }
      return out.sort((a, b) => Math.abs(a.price - price) - Math.abs(b.price - price));
    };
    const below = pickSide(res.levels.filter(L => L.zHi < price)), above = pickSide(res.levels.filter(L => L.zLo > price));
    const at = res.levels.filter(L => L.zLo <= price && L.zHi >= price).sort((a, b) => b.score - a.score).slice(0, 1);
    const tier = L => { const r = L.score / max; return r >= 0.66 ? 3 : r >= 0.38 ? 2 : 1; };
    const out = [];
    /* the colour says which side of the price it is on; a flip is a tag (and a bonus), not a colour */
    below.forEach((L, k) => out.push(Object.assign({}, L, { role: 'support', name: 'S' + (k + 1), tier: tier(L) })));
    above.forEach((L, k) => out.push(Object.assign({}, L, { role: 'resistance', name: 'R' + (k + 1), tier: tier(L) })));
    at.forEach(L => out.push(Object.assign({}, L, { role: 'flip', name: 'AT', tier: tier(L), atPrice: true })));
    return out.filter(L => C.minor || L.tier > 1);
  },

  result(){
    const raw = (typeof Chart !== 'undefined' && Chart.raw) || [];
    if (!raw.length) return null;
    const lastClosed = raw.length > 1 ? raw[raw.length - 2] : raw[0];
    const key = STORE.symbol + '|' + STORE.tf + '|' + raw.length + '|' + lastClosed.time + '|' + this.cfg().sens;
    if (!this._cache || this._cache.key !== key){
      /* the forming candle is left out: a level is made of finished candles */
      this._cache = { key, res: this.compute(raw.slice(0, -1)) };
    }
    return this._cache.res;
  },

  /* ---------- drawing ---------- */
  draw(ctx){
    const C = this.cfg();
    if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries) return;
    const res = this.result(); if (!res) return;
    const raw = Chart.raw, price = raw[raw.length - 1].close;
    const W = Draw.cssW, right = W - 2;
    const shown = this.pick(res, price);
    this._shown = shown;
    ctx.save();
    ctx.font = '600 11px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
    const used = [];
    const label = (y, text, color) => {
      if (!C.labels) return;
      let yy = y - 9; while (used.some(u => Math.abs(u - yy) < 15)) yy -= 15;
      used.push(yy);
      const w = ctx.measureText(text).width + 12, x = Math.max(4, right - w - 70);
      ctx.shadowBlur = 0; ctx.fillStyle = 'rgba(6,10,22,.82)'; ctx.fillRect(x, yy - 8, w, 16);
      ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x + .5, yy - 7.5, w - 1, 15);
      ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 6, yy);
    };
    const line = (y, color, width, blur, dash, x0) => {
      ctx.setLineDash(dash || []);
      /* a plain coloured line - no glow, so the candles underneath stay readable */
      /* thickness, brightness and (optional) glow are yours to set in ⚙ */
      ctx.strokeStyle = color; ctx.shadowColor = color; ctx.shadowBlur = C.glow ? blur * C.glow / 3 : 0;
      ctx.lineWidth = Math.max(0.5, width * C.width); ctx.globalAlpha = C.bright;
      ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(right, y); ctx.stroke();
      ctx.setLineDash([]); ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    };
    for (const L of shown.slice().sort((a, b) => a.tier - b.tier)){
      const col = this.col(L.role), y = Chart.priceSeries.priceToCoordinate(L.price);
      if (y == null) continue;
      const x0 = Math.max(0, Draw.timeToX(L.firstTime) || 0);
      if (C.zones){
        const y1 = Chart.priceSeries.priceToCoordinate(L.zHi), y2 = Chart.priceSeries.priceToCoordinate(L.zLo);
        if (y1 != null && y2 != null){
          const g = ctx.createLinearGradient(x0, 0, right, 0);
          const a = [0, 0.03, 0.05, 0.07][L.tier] * C.zoneAlpha;              /* a faint band, never a curtain over the candles */
          g.addColorStop(0, this.rgba(col, 0)); g.addColorStop(0.25, this.rgba(col, a)); g.addColorStop(1, this.rgba(col, a));
          ctx.fillStyle = g; ctx.fillRect(x0, Math.min(y1, y2), right - x0, Math.max(2, Math.abs(y2 - y1)));
        }
      }
      line(y, col, [0, 1, 1.6, 2.4][L.tier], [0, 6, 12, 22][L.tier], L.tier === 1 ? [6, 4] : null, x0);
      const stars = '★'.repeat(L.tier) + '☆'.repeat(3 - L.tier);
      label(y, `${L.name} ${stars} ${fmtPrice(L.price)} · ${L.touches} turn${L.touches === 1 ? '' : 's'}${L.tests ? ' · tested ' + (L.tests > 20 ? '20+' : L.tests) + '×' : ''}${L.tags.length ? ' · ' + L.tags.join(' · ') : ''}`, col);
    }
    if (C.dayWeek) for (const K of res.keys){
      const y = Chart.priceSeries.priceToCoordinate(K.price); if (y == null) continue;
      line(y, this.col(K.kind), 1, 8, [2, 5], 0);
      label(y, K.label + ' ' + fmtPrice(K.price), this.col(K.kind));
    }
    ctx.restore();
  },
  rgba(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; },

  /* ---------- the button and its little settings box ---------- */
  syncBtn(){ const b = document.getElementById('autoSrBtn'); if (b) b.classList.toggle('on', this.cfg().on); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c);
    if (c.on && typeof toast === 'function') toast('Auto support & resistance on — ★★★ strongest, S = support below the price, R = resistance above', 'info'); },
  panel(){
    let el = document.getElementById('autoSrPanel');
    if (el){ el.remove(); return; }
    const c = this.cfg();
    document.body.insertAdjacentHTML('beforeend', `<div id="autoSrPanel" class="autoSrPanel">
      <b>Auto support &amp; resistance</b>
      <label>Levels each side <select data-sr="perSide">${[2, 3, 4, 5, 6, 8].map(v => `<option${v === c.perSide ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
      <label>Sensitivity <select data-sr="sens">${[['tight', 'Tight — fewer, closer levels'], ['normal', 'Normal'], ['wide', 'Wide — the big picture']].map(([v, t]) => `<option value="${v}"${v === c.sens ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label><input type="checkbox" data-sr="zones"${c.zones ? ' checked' : ''}> Shade the zones</label>
      <label><input type="checkbox" data-sr="minor"${c.minor ? ' checked' : ''}> Show minor levels (★)</label>
      <label><input type="checkbox" data-sr="dayWeek"${c.dayWeek ? ' checked' : ''}> Yesterday's and last 5 days' high / low</label>
      <label><input type="checkbox" data-sr="labels"${c.labels ? ' checked' : ''}> Labels</label>
      <div class="srLook"><b>Look</b>
        ${[['support', 'Support'], ['resistance', 'Resistance'], ['flip', 'Price in the zone'], ['day', 'Yesterday high / low'], ['week', 'Last 5 days high / low']]
          .map(([k, t]) => `<label>${t} <input type="color" data-srcol="${k}" value="${this.col(k)}"></label>`).join('')}
        <label>Line thickness <input type="range" min="0.5" max="3" step="0.25" data-srnum="width" value="${c.width}"><em>${c.width}×</em></label>
        <label>Brightness <input type="range" min="0.25" max="1" step="0.05" data-srnum="bright" value="${c.bright}"><em>${Math.round(c.bright * 100)}%</em></label>
        <label>Glow <input type="range" min="0" max="3" step="0.5" data-srnum="glow" value="${c.glow}"><em>${c.glow ? c.glow + '×' : 'off'}</em></label>
        <label>Zone shading <input type="range" min="0" max="3" step="0.25" data-srnum="zoneAlpha" value="${c.zoneAlpha}"><em>${c.zoneAlpha}×</em></label>
        <button class="bMini" data-srreset="1">Back to the original look</button>
      </div>
      <p class="dim2"><span style="color:${this.col('support')}">■ support</span> · <span style="color:${this.col('resistance')}">■ resistance</span> · <span style="color:${this.col('flip')}">■ price is in the zone now</span><br>
      ★★★ major · ★★ strong · ★ minor. Scored on swing size, bounce, volume, tests, flips, higher timeframes, volume profile and round numbers.</p>
    </div>`);
    el = document.getElementById('autoSrPanel');
    const b = document.getElementById('autoSrCfg').getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - 300, b.left - 120)) + 'px'; el.style.top = (b.bottom + 6) + 'px';
    /* colours and sliders apply while you move them */
    el.addEventListener('input', e => {
      const t = e.target, v = this.cfg();
      if (t.dataset.srcol){ v.colors = Object.assign({}, v.colors, { [t.dataset.srcol]: t.value }); }
      else if (t.dataset.srnum){ v[t.dataset.srnum] = +t.value; const em = t.nextElementSibling;
        if (em) em.textContent = t.dataset.srnum === 'bright' ? Math.round(+t.value * 100) + '%' : t.dataset.srnum === 'glow' && !+t.value ? 'off' : t.value + '×'; }
      else return;
      if (!v.on) v.on = true; this.save(v);
    });
    el.addEventListener('click', e => { if (!e.target.closest('[data-srreset]')) return; const v = this.cfg();
      Object.assign(v, { colors: {}, width: 1, bright: 0.9, glow: 0, zoneAlpha: 1 }); this.save(v); el.remove(); this.panel(); });
    el.addEventListener('change', e => { const t = e.target, k = t.dataset.sr; if (!k) return; const v = this.cfg();
      v[k] = t.type === 'checkbox' ? t.checked : (k === 'perSide' ? +t.value : t.value); if (!v.on) v.on = true; this.save(v); });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#autoSrPanel, #autoSrCfg')){ document.getElementById('autoSrPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('chartLabelBar');
  if (!bar || document.getElementById('autoSrBtn')) return;
  const tools = bar.querySelector('.chartTools');
  const html = `<button id="autoSrBtn" class="bMini autoSrBtn${AutoSR.cfg().on ? ' on' : ''}" title="Draw the support and resistance levels automatically — the strongest drawn thickest">✦ Auto S/R</button><button id="autoSrCfg" class="bMini" title="Auto S/R settings">⚙</button>`;
  if (tools) tools.insertAdjacentHTML('afterbegin', html); else bar.insertAdjacentHTML('beforeend', '<span class="chartTools">' + html + '</span>');
  document.getElementById('autoSrBtn').addEventListener('click', () => AutoSR.toggle());
  document.getElementById('autoSrCfg').addEventListener('click', () => AutoSR.panel());
});
