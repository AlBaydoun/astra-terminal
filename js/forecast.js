/* ASTRA Terminal — Forecast: the next move, but only where research proved it.

   Research run 2 (research-tools/predict*.cjs, 2026-10-15) tested 5 ways of
   calling the next move — breakout continuation, momentum, over-stretched snap
   back, bounce in a trend, rejection at the edge of a range — on 24 instruments,
   3 timeframes, 2 years of the broker's own candles, after the spread. One call
   per market GROUP is kept (js/research/forecasts.js):

     Stock indices  PROVEN   over-stretched → snaps back, 4h, right 58 % vs 49 %
     Forex          leaning  rejection at the edge of a range, 4h
     Gold / silver  leaning  trend continuation, daily
     Oil, crypto    none     nothing beat chance — no arrow is ever drawn there

   On the chart: a card says what the market's tested call is, whether it is
   firing NOW, and how often it has been right; when it fires, a forecast cone
   is drawn into the future (the middle half of what happened after the same
   call in two years, and the typical outcome as an arrow). Past calls on this
   chart are marked ✓ / ✗, and "Backtest here" re-runs the call on this
   instrument's own history.

   Read only: it draws, it never trades. */
const Forecast = {
  KEY: 'astra_forecast',
  _fold: true,                          /* the card opens small; "More" shows the evidence */
  DEF: { on: false, cone: true, card: true, past: true, leaning: true, style: '3d', up: '#00e676', down: '#ff1744', glow: 1, width: 2, stretchZ: 2.5, rangeN: 20, momK: 72 },
  cfg(){ return Object.assign({}, this.DEF, lsGet(this.KEY, {}) || {}); },
  save(c){ lsSet(this.KEY, c); this._calc = null; if (typeof Draw !== 'undefined') Draw.redraw(); this.syncBtn(); },
  TF_SEC: { '1h': 3600, '4h': 14400, '1d': 86400 },
  GROUP_NAME: { indices: 'Stock indices', forex: 'Forex', gold: 'Gold & silver', energy: 'Oil', crypto: 'Crypto' },

  groupOf(sym){ try { return (typeof Bots !== 'undefined' && Bots.groupOfAny) ? Bots.groupOfAny(sym) : null; } catch(e){ return null; } },
  model(sym){
    const g = this.groupOf(sym), F = typeof FORECASTS !== 'undefined' ? FORECASTS : null;
    if (!F || !g) return { g, none: true, why: 'This market was not part of the research.' };
    if (F.groups[g]) return Object.assign({ g }, F.groups[g]);
    return { g, none: true, why: (F.none || {})[g] || 'No tested call beat chance on this market.' };
  },

  /* the call, worked out exactly as the research did, on CLOSED candles of the model's own timeframe */
  callAt(c, X, i, M, C){
    if (M.mk === 'stretch'){ if (!X.m[i] || !X.A[i]) return 0; const d = (c[i].close - X.m[i]) / X.A[i]; return d > C.stretchZ ? -1 : d < -C.stretchZ ? 1 : 0; }
    if (M.mk === 'rangefade'){ if (X.ad[i] == null || X.ad[i] > 20) return 0; const N = C.rangeN; let hi = -Infinity, lo = Infinity;
      for (let k = i - N; k <= i; k++){ hi = Math.max(hi, c[k].high); lo = Math.min(lo, c[k].low); } const pos = (c[i].close - lo) / ((hi - lo) || 1); return pos > 0.9 ? -1 : pos < 0.1 ? 1 : 0; }
    if (M.mk === 'momentum'){ const K = C.momK; if (i < K || !X.A[i]) return 0; const d = c[i].close - c[i - K].close; return Math.abs(d) > 2 * X.A[i] ? Math.sign(d) : 0; }
    return 0;
  },
  /* how close the market is to firing, in words (for the card when there is no call) */
  distance(c, X, i, M, C){
    if (M.mk === 'stretch' && X.m[i] && X.A[i]){ const d = (c[i].close - X.m[i]) / X.A[i]; return `now ${d >= 0 ? '+' : ''}${d.toFixed(1)} ATR from its 20-candle average — fires beyond ±${C.stretchZ}`; }
    if (M.mk === 'rangefade'){ return X.ad[i] != null ? `ADX ${X.ad[i].toFixed(0)} — needs a quiet market (under 20) and a close at the top or bottom 10 % of the last ${C.rangeN} candles` : ''; }
    if (M.mk === 'momentum' && X.A[i] && i >= C.momK){ const d = (c[i].close - c[i - C.momK].close) / X.A[i]; return `moved ${d >= 0 ? '+' : ''}${d.toFixed(1)} ATR over ${C.momK} days — fires beyond ±2`; }
    return '';
  },
  prep(c, M){ const cl = c.map(b => b.close); return { A: IND.atr(c, 14), m: IND.sma(cl, 20), ad: IND.adx(c, 14).adx }; },

  /* the candles of the model's timeframe, fetched apart from the chart (refreshed every few minutes) */
  async load(sym, tf){
    const k = sym + '|' + tf, hit = (this._bars = this._bars || {})[k];
    if (hit && Date.now() - hit.at < 4 * 60e3) return hit.c;
    if (this._loading === k) return hit ? hit.c : null;
    this._loading = k;
    try { const c = await API.klines(sym, tf, 1500); this._bars[k] = { c, at: Date.now() }; this._calc = null; return c; }
    catch(e){ return hit ? hit.c : null; } finally { this._loading = null; }
  },
  compute(){
    const sym = STORE.symbol, M = this.model(sym), C = this.cfg();
    if (M.none) return { M };
    if (M.status === 'leaning' && !C.leaning) return { M, hidden: true };
    const hit = (this._bars || {})[sym + '|' + M.tf];
    if (!hit){ this.load(sym, M.tf).then(() => Draw.redraw()); return { M, loading: true }; }
    if (Date.now() - hit.at > 4 * 60e3) this.load(sym, M.tf).then(() => Draw.redraw());
    const c = hit.c.slice(0, -1);                          /* the forming candle is never used */
    if (c.length < 60) return { M, loading: true };
    const X = this.prep(c, M), H = M.horizon, n = c.length;
    /* every past call on this instrument, the research's way: one call, then wait H candles */
    const calls = []; let busy = -1;
    for (let i = 30; i < n; i++){ if (i <= busy) continue; const d = this.callAt(c, X, i, M, C); if (!d) continue;
      const done = i + H < n, e = i + 1 < n ? c[i + 1].open : c[i].close, x = done ? c[i + H].close : null;
      calls.push({ i, d, time: c[i].time, rawTime: c[i].rawTime, entry: e, A: X.A[i], done, right: done ? (x - e) * d > 0 : null, moveAtr: done ? (x - e) * d / X.A[i] : null });
      busy = i + H; }
    const last = calls[calls.length - 1], active = last && n - 1 - last.i < H ? last : null;
    return { M, c, X, calls, active, dist: this.distance(c, X, n - 1, M, C), A: X.A[n - 1], lastTime: c[n - 1].time };
  },
  result(){
    const key = STORE.symbol + '|' + JSON.stringify(this.cfg()) + '|' + ((this._bars || {})[STORE.symbol + '|' + (this.model(STORE.symbol).tf || '')] || {}).at;
    if (!this._calc || this._calc.key !== key) this._calc = { key, r: this.compute() };
    return this._calc.r;
  },

  /* ---------- drawing ---------- */
  rgba(hex, a){ const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; },
  draw(ctx){
    const C = this.cfg();
    if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries) return;
    const R = this.result(); if (!R) return;
    const ts = Chart.main.timeScale(), right = Math.min(Draw.cssW - 2, (ts.width ? ts.width() : Draw.cssW) - 4);
    /* while a call is live, leave room right of the last candle for its cone (and give it back afterwards) */
    try { const want = C.cone && R.active ? 34 : 6, cur = ts.options().rightOffset;
      if (C.cone && R.active && cur < want){ this._prevOffset = this._prevOffset ?? cur; ts.applyOptions({ rightOffset: want }); }
      else if (!(C.cone && R.active) && this._prevOffset != null){ ts.applyOptions({ rightOffset: this._prevOffset }); this._prevOffset = null; } } catch(e){}
    const Y = p => Chart.priceSeries.priceToCoordinate(p);
    ctx.save();
    /* past calls on this chart, ✓ / ✗ */
    if (C.past && R.calls){
      ctx.font = '700 10px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
      for (const k of R.calls.slice(-40)){
        const x = Draw.timeToX(k.time), y = Y(k.entry); if (x == null || y == null || x < 0 || x > right) continue;
        const col = k.d > 0 ? C.up : C.down, sy = y + (k.d > 0 ? 16 : -16);
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(x, y + (k.d > 0 ? 6 : -6)); ctx.lineTo(x - 5, sy); ctx.lineTo(x + 5, sy); ctx.closePath(); ctx.fill();
        const t = k.done ? (k.right ? '✓' : '✗') : '…';
        ctx.fillStyle = k.done ? (k.right ? '#00e676' : '#ff5252') : '#ffd740'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, sy + (k.d > 0 ? 9 : -9)); ctx.textAlign = 'left';
      }
    }
    /* the forecast cone, from the call into the future */
    if (C.cone && R.active){
      const a = R.active, M = R.M, d = a.d, col = d > 0 ? C.up : C.down;
      const tfSec = this.TF_SEC[M.tf], t0 = (Chart.raw[Chart.raw.length - 1] || {}).time || R.lastTime;
      const tEnd = a.time + tfSec * (M.horizon + 1);
      /* the cone starts where the call was MADE (its time, its entry price) - not at today's price */
      const x0 = Math.max(0, Draw.timeToX(a.time + tfSec) ?? 0); let x1 = Draw.timeToX(Math.max(tEnd, t0 + tfSec)); const y0 = Y(a.entry);
      /* a 24-hour call on a 15-minute chart reaches far off screen: the cone is kept on screen, its end says when */
      const squeezed = x1 == null || x1 > right - 20; if (squeezed) x1 = Math.max((x0 || 0) + 40, right - 20);
      const p = q => a.entry + d * q * a.A;
      const yq25 = Y(p(M.cone.q25)), yq50 = Y(p(M.cone.q50)), yq75 = Y(p(M.cone.q75));
      if ([x0, x1, y0, yq25, yq50, yq75].every(v => v != null && Number.isFinite(v))){
        const g = ctx.createLinearGradient(x0, 0, x1, 0); g.addColorStop(0, this.rgba(col, 0.05)); g.addColorStop(1, this.rgba(col, C.style === '3d' ? 0.28 : 0.16));
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, yq75); ctx.lineTo(x1, yq25); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = this.rgba(col, 0.55); ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, yq75); ctx.moveTo(x0, y0); ctx.lineTo(x1, yq25); ctx.stroke(); ctx.setLineDash([]);
        ctx.strokeStyle = col; ctx.lineWidth = C.width; ctx.shadowColor = col; ctx.shadowBlur = C.style === '3d' ? 12 * C.glow : 0;
        ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, yq50); ctx.stroke();
        const ang = Math.atan2(yq50 - y0, x1 - x0); ctx.fillStyle = col; ctx.beginPath();
        ctx.moveTo(x1 + Math.cos(ang) * 12, yq50 + Math.sin(ang) * 12); ctx.lineTo(x1 + Math.cos(ang + 2.5) * 10, yq50 + Math.sin(ang + 2.5) * 10); ctx.lineTo(x1 + Math.cos(ang - 2.5) * 10, yq50 + Math.sin(ang - 2.5) * 10); ctx.closePath(); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.font = '700 11px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'); ctx.fillStyle = col;
        ctx.fillText('called at ' + fmtPrice(a.entry) + ' → typical ' + fmtPrice(p(M.cone.q50)) + (squeezed ? '  (in ' + Math.round(M.horizon * tfSec / 3600) + ' h)' : ''), Math.max(x0 + 4, Math.min(x1 - 170, right - 190)), yq50 - 12);
        ctx.fillStyle = this.rgba(col, 0.8); ctx.font = '600 10px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
        ctx.fillText('half of outcomes ' + fmtPrice(Math.min(p(M.cone.q25), p(M.cone.q75))) + ' – ' + fmtPrice(Math.max(p(M.cone.q25), p(M.cone.q75))), Math.max(x0 + 4, Math.min(x1 - 230, right - 240)), yq50 + 16);
      }
    }
    ctx.restore();
    this.card(R, C);
  },

  /* ---------- the card (HTML, top right of the chart) ---------- */
  card(R, C){
    const wrap = document.getElementById('mainWrap'); if (!wrap) return;
    let el = document.getElementById('fcCard');
    if (!C.on || !C.card){ if (el) el.remove(); return; }
    if (!el){ wrap.insertAdjacentHTML('beforeend', '<div id="fcCard" class="fcCard"></div>'); el = document.getElementById('fcCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
      el.addEventListener('click', e => { if (e.target.closest('[data-fcbt]')) this.backtest(); if (e.target.closest('[data-fcfold]')){ this._fold = !this._fold; this._sig = ''; Draw.redraw(); } }); }
    const M = R.M, gname = this.GROUP_NAME[M.g] || M.g || 'This market';
    let body;
    if (M.none) body = `<div class="fcHead none">FORECAST · ${esc(gname)}</div><div class="fcBig">No forecast</div><p>${esc(M.why)} Rather than guess, no arrow is drawn here.</p>`;
    else if (R.hidden) body = `<div class="fcHead">FORECAST · ${esc(gname)}</div><p>Only a weak ("leaning") call exists for this market and you chose to hide those (⚙).</p>`;
    else if (R.loading) body = `<div class="fcHead">FORECAST · ${esc(gname)}</div><p>Reading the ${esc(M.tf)} candles…</p>`;
    else {
      const a = R.active, tag = M.status === 'proven' ? '<b class="fcProven">PROVEN</b>' : '<b class="fcLean">LEANING · weak evidence</b>';
      const hours = M.horizon * this.TF_SEC[M.tf] / 3600, span = hours >= 48 ? (hours / 24) + ' days' : hours + ' hours';
      const now = a ? `<div class="fcBig ${a.d > 0 ? 'up' : 'down'}">${a.d > 0 ? '▲ UP' : '▼ DOWN'} expected</div><p>over the next ${span} (${M.horizon} × ${M.tf} candles), called at the ${M.tf} close of ${new Date(a.time * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })}.${(() => { const px = (Chart.raw[Chart.raw.length - 1] || {}).close, tgt = a.entry + a.d * M.cone.q50 * a.A; if (!px) return ''; const gone = (px - tgt) * a.d >= 0; return ' Called at ' + fmtPrice(a.entry) + ', typical target ' + fmtPrice(tgt) + ' — ' + (gone ? '<b>price is already past it</b>' : fmtPrice(Math.abs(tgt - px)) + ' still to go') + '.'; })()}</p>`
        : `<div class="fcBig">No call right now</div><p>${esc(R.dist)}.</p>`;
      const mine = R.calls.filter(k => k.done), right = mine.filter(k => k.right).length;
      body = `<div class="fcHead">FORECAST · ${esc(gname)} · ${esc(M.method)} · ${esc(M.tf)} ${tag}</div>${now}
        ${this._fold ? '' : `<div class="fcStats"><span>Research, ${esc(M.period)}</span><b>right ${M.hit}%</b> of ${M.calls} calls vs <b>${M.base}%</b> by chance · both halves ${M.halves.join('% / ')}% · ${esc(M.agree)} instruments agree · profit factor ${M.pf} after spread</div>
        <div class="fcStats"><span>On this instrument (loaded history)</span>${mine.length ? `right <b>${right} of ${mine.length}</b> (${Math.round(right / mine.length * 100)}%)` : 'no finished call in the loaded candles'}</div>`}
        <div class="fcBtns"><button class="bMini" data-fcbt="1">Backtest here</button><button class="bMini" data-fcfold="1">${this._fold ? 'More ▾' : 'Less ▴'}</button></div>`;
    }
    const sig = body + (this._fold ? 1 : 0);
    if (sig !== this._sig){ el.innerHTML = body; this._sig = sig; }
  },

  /* re-run the call on this instrument's own long history, and say plainly what it shows */
  async backtest(){
    const sym = STORE.symbol, M = this.model(sym), C = this.cfg();
    if (M.none) return;
    toast('Backtesting the ' + M.method + ' call on ' + baseAsset(sym) + '…', 'info');
    let c; try { c = await API.klines(sym, M.tf, 60000, { from: Math.floor(Date.now() / 1000) - 2 * 365 * 86400 }); } catch(e){ return toast('Could not read the history: ' + e.message, 'warn'); }
    c = c.slice(0, -1); const X = this.prep(c, M), H = M.horizon, sp = ((Bots.quoteFor && Bots.quoteFor(sym)) || {}).spread || 0;
    let busy = -1, n = 0, right = 0, sum = 0, up = 0, nb = 0, upMoves = 0, dnMoves = 0;
    for (let i = 30; i < c.length - H - 1; i++){
      if (i % H === 0){ const m = c[i + H].close - c[i + 1].open; if (m - sp > 0) upMoves++; if (-m - sp > 0) dnMoves++; nb++; }
      if (i <= busy) continue; const d = this.callAt(c, X, i, M, C); if (!d) continue;
      const mv = (c[i + H].close - c[i + 1].open) * d - sp; n++; if (mv > 0) right++; if (d > 0) up++; sum += mv / X.A[i]; busy = i + H; }
    const base = nb ? ((up * upMoves + (n - up) * dnMoves) / nb / Math.max(1, n)) * 100 : 0;
    const box = document.getElementById('fcCard');
    if (box) box.insertAdjacentHTML('beforeend', `<div class="fcBt"><b>Backtest · ${esc(baseAsset(sym))} · ${c.length} ${esc(M.tf)} candles</b><br>${n} calls · right <b>${n ? (right / n * 100).toFixed(1) : 0}%</b> vs ${base.toFixed(1)}% by chance · average ${(n ? sum / n : 0) >= 0 ? '+' : ''}${(n ? sum / n : 0).toFixed(2)} ATR per call after the spread${n < 30 ? '<br><i>Fewer than 30 calls: too few to judge this instrument on its own — the group result above is the stronger evidence.</i>' : ''}</div>`);
  },

  /* ---------- button + settings ---------- */
  syncBtn(){ const b = document.getElementById('fcBtn'); if (b) b.classList.toggle('on', this.cfg().on); if (!this.cfg().on) document.getElementById('fcCard')?.remove(); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c);
    if (!c.on && this._prevOffset != null){ try { Chart.main.timeScale().applyOptions({ rightOffset: this._prevOffset }); } catch(e){} this._prevOffset = null; } },
  panel(){
    let el = document.getElementById('fcPanel'); if (el){ el.remove(); return; }
    const c = this.cfg();
    const chk = (k, t) => `<label><input type="checkbox" data-fk="${k}"${c[k] ? ' checked' : ''}> ${t}</label>`;
    const num = (k, t, min, max, step) => `<label>${t} <input type="number" data-fn="${k}" value="${c[k]}" min="${min}" max="${max}" step="${step}"></label>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="fcPanel" class="autoSrPanel asPanel">
      <b>Forecast</b>
      <div class="srLook"><b>What to show</b>${chk('card', 'The forecast card')}${chk('cone', 'The forecast cone and arrow')}${chk('past', 'Past calls on the chart (✓ right / ✗ wrong)')}${chk('leaning', 'Also the "leaning" (weak-evidence) markets: forex, gold & silver')}</div>
      <div class="srLook"><b>Look</b><label>Up colour <input type="color" data-fc="up" value="${c.up}"></label><label>Down colour <input type="color" data-fc="down" value="${c.down}"></label>
        <label>Style <select data-fs="style"><option value="3d"${c.style === '3d' ? ' selected' : ''}>3-D glow</option><option value="flat"${c.style === 'flat' ? ' selected' : ''}>Flat</option></select></label>
        <label>Arrow thickness <input type="range" min="1" max="5" step="0.5" data-fr="width" value="${c.width}"><em>${c.width}</em></label><label>Glow <input type="range" min="0" max="3" step="0.25" data-fr="glow" value="${c.glow}"><em>${c.glow}</em></label></div>
      <div class="srLook"><b>The triggers (tested values: 2.5 · 20 · 72)</b>${num('stretchZ', 'Indices: over-stretched beyond (× ATR)', 1, 5, 0.1)}${num('rangeN', 'Forex: range length (candles)', 10, 60, 1)}${num('momK', 'Gold: momentum over (days)', 10, 150, 1)}
        <p class="dim2">The research figures on the card are only valid for the tested values. Change them and use “Backtest here” to see what your values would have done.</p></div>
      <button class="bMini" data-freset="1">Back to the tested settings</button></div>`);
    el = document.getElementById('fcPanel');
    const b = document.getElementById('fcCfg').getBoundingClientRect(); el.style.left = Math.max(8, Math.min(innerWidth - 350, b.left - 150)) + 'px'; el.style.top = (b.bottom + 6) + 'px';
    const apply = e => { const t = e.target, v = this.cfg();
      if (t.dataset.fk) v[t.dataset.fk] = t.checked; else if (t.dataset.fn){ if (!Number.isFinite(+t.value) || t.value === '') return; v[t.dataset.fn] = +t.value; }
      else if (t.dataset.fc) v[t.dataset.fc] = t.value; else if (t.dataset.fs) v[t.dataset.fs] = t.value;
      else if (t.dataset.fr){ v[t.dataset.fr] = +t.value; const em = t.nextElementSibling; if (em) em.textContent = t.value; } else return;
      if (!v.on) v.on = true; this._sig = ''; this.save(v); };
    el.addEventListener('input', apply); el.addEventListener('change', apply);
    el.addEventListener('click', e => { if (!e.target.closest('[data-freset]')) return; this.save(Object.assign({}, this.DEF, { on: true })); el.remove(); this.panel(); });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#fcPanel, #fcCfg')){ document.getElementById('fcPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('patCfg') || document.getElementById('autoSrCfg');
  if (!after || document.getElementById('fcBtn')) return;
  after.insertAdjacentHTML('afterend', `<button id="fcBtn" class="bMini autoSrBtn${Forecast.cfg().on ? ' on' : ''}" title="The next move — only on markets where research proved the call works">✦ Forecast</button><button id="fcCfg" class="bMini" title="Forecast settings">⚙</button>`);
  document.getElementById('fcBtn').addEventListener('click', () => Forecast.toggle());
  document.getElementById('fcCfg').addEventListener('click', () => Forecast.panel());
});
