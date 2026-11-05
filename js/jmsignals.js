/* ASTRA Terminal — ✦ SIGNALS: BUY / SELL calls and the expected move, on the chart.

   THE RULE (fixed in advance, one rule, both directions)
     BUY   EMA 50 above EMA 200, close above EMA 200 and EMA 20, RSI(14) dipped to
           42 or lower inside the last 8 candles and has just closed back over 50.
     SELL  the mirror: EMA 50 below EMA 200, close below both, RSI(14) rose to 58
           or higher inside the last 8 candles and has just closed back under 50.
     Trade: enters at the next candle's open, stop 1.5 ATR, target 2.5 ATR, out
     after 24 candles. Stop counts first when one candle touches both. A new call
     waits until the previous one has finished. The forming candle is never read.

   WHAT SITS ON THE CHART
     A call: a cone built ONLY from what the price did after EARLIER calls on this
     instrument and timeframe, with SELL calls mirrored so "up" always means "the
     call's way" (25th, 50th, 75th percentile at every candle ahead). It reads up
     to 2000 candles of history, because a chart alone holds too few calls.
     Under 20 earlier calls, or no call: a grey band of the instrument's usual
     range instead. That band has no direction.

   HOW IT REPORTS ITSELF
     Every open chart replays the rule over its own candles, after your spread, and
     compares it with random entries using the same stop and target. Solid arrows
     mean the record holds up on this chart; hollow arrows mean it does not.

   The cone is a summary of past moves, not a prediction. Read only: this file has
   no order path. */
const JMSignals = {
  KEY: 'astra_signals',
  DEF: { on: false, card: true, arrows: true, cone: true, range: true, levels: true, onlyHolds: false },
  RULE: { stop: 1.5, target: 2.5, horizon: 24, warm: 210, minCone: 20, minStats: 30 },

  cfg(){ return Object.assign({}, this.DEF, lsGet(this.KEY, {}) || {}); },
  save(c){ lsSet(this.KEY, c); this._sig = ''; this.syncBtn(); if (typeof Draw !== 'undefined') Draw.redraw(); },

  q(sorted, p){
    if (!sorted.length) return null;
    const x = (sorted.length - 1) * p, i = Math.floor(x), f = x - i;
    return sorted[i] + (i + 1 < sorted.length ? (sorted[i + 1] - sorted[i]) * f : 0);
  },

  /* one trade from candle i, using the rule's own exits */
  walk(c, i, d, A, costPct){
    const R = this.RULE, e = c[i].open, risk = R.stop * A;
    const sl = e - d * risk, tp = e + d * R.target * A, end = i + R.horizon - 1;
    const cost = e * costPct / 100 / risk;
    for (let k = i; k <= end && k < c.length; k++){
      const hitS = d > 0 ? c[k].low <= sl : c[k].high >= sl;
      const hitT = d > 0 ? c[k].high >= tp : c[k].low <= tp;
      if (hitS) return { done: true, r: -1 - cost, res: 'stop', exit: k };
      if (hitT) return { done: true, r: R.target / R.stop - cost, res: 'target', exit: k };
    }
    if (end < c.length) return { done: true, r: (c[end].close - e) * d / risk - cost, res: 'time', exit: end };
    return { done: false, sl, tp };
  },

  /* a pure function of closed candles, so the same code runs on the chart and in
     the multi-instrument measurement */
  analyse(c, costPct){
    const R = this.RULE, n = c.length;
    if (n < R.warm + 60) return { thin: true, have: n, need: R.warm + 60 };
    const close = c.map(x => x.close);
    const e20 = IND.ema(close, 20), e50 = IND.ema(close, 50), e200 = IND.ema(close, 200);
    const rsi = IND.rsi(close, 14), atr = IND.atr(c, 14);
    const calls = [];
    let busy = -1;
    for (let j = R.warm; j < n; j++){
      if (j <= busy || !(atr[j] > 0) || rsi[j] == null || rsi[j - 1] == null) continue;
      let lo = Infinity, hi = -Infinity;
      for (let k = j - 8; k < j; k++){ if (rsi[k] != null){ lo = Math.min(lo, rsi[k]); hi = Math.max(hi, rsi[k]); } }
      let d = 0;
      if (e50[j] > e200[j] && close[j] > e200[j] && close[j] > e20[j] && rsi[j] >= 50 && rsi[j - 1] < 50 && lo <= 42) d = 1;
      else if (e50[j] < e200[j] && close[j] < e200[j] && close[j] < e20[j] && rsi[j] <= 50 && rsi[j - 1] > 50 && hi >= 58) d = -1;
      if (!d) continue;
      const i = j + 1, A = atr[j];
      if (i >= n){
        const e = close[j];
        calls.push({ j, i, d, A, entry: e, time: c[j].time, pending: true, done: false, sl: e - d * R.stop * A, tp: e + d * R.target * A });
        break;
      }
      const o = this.walk(c, i, d, A, costPct);
      calls.push(Object.assign({ j, i, d, A, entry: c[i].open, time: c[j].time }, o));
      if (!o.done) break;
      busy = o.exit;
    }

    /* random entries with the same exits: what the stop and target earn by themselves */
    const base = { 1: { s: 0, n: 0 }, '-1': { s: 0, n: 0 } };
    const range = Array.from({ length: R.horizon }, () => []);
    for (let i = R.warm + 1; i + R.horizon <= n; i += 2){
      const A = atr[i - 1]; if (!(A > 0)) continue;
      for (const d of [1, -1]){ const o = this.walk(c, i, d, A, costPct); if (o.done){ base[d].s += o.r; base[d].n++; } }
      for (let k = 0; k < R.horizon; k++) range[k].push((c[i + k].close - c[i].open) / A);
    }
    const rangeCone = range.map(a => { a.sort((x, y) => x - y); return { lo: this.q(a, 0.1), mid: this.q(a, 0.5), hi: this.q(a, 0.9) }; });

    const done = calls.filter(k => k.done), N = done.length;
    const mean = a => a.length ? a.reduce((s, k) => s + k.r, 0) / a.length : null;
    const avg = mean(done);
    const sd = N > 1 ? Math.sqrt(done.reduce((s, k) => s + (k.r - avg) ** 2, 0) / (N - 1)) : 0;
    const t = N > 1 && sd > 0 ? avg / (sd / Math.sqrt(N)) : 0;
    const mid = Math.floor(N / 2), h1 = mean(done.slice(0, mid)), h2 = mean(done.slice(mid));
    const baseDir = d => base[d].n ? base[d].s / base[d].n : 0;
    const baseR = N ? done.reduce((s, k) => s + baseDir(k.d), 0) / N : null;
    const holds = N >= R.minStats && avg > 0 && avg > baseR && h1 > 0 && h2 > 0 && t >= 2;
    const status = N < R.minStats ? 'few' : holds ? 'holds' : avg > 0 ? 'weak' : 'losing';
    const last = calls[calls.length - 1];
    const active = last && !last.done ? last : null;
    let cone = null, prior = 0;
    if (active){
      const paths = calls.filter(k => k.done && k.i + R.horizon <= active.j);
      prior = paths.length;
      if (prior >= R.minCone){
        cone = [];
        for (let s = 0; s < R.horizon; s++){
          const v = paths.map(k => (c[k.i + s].close - k.entry) * k.d / k.A).sort((x, y) => x - y);
          cone.push({ q25: this.q(v, 0.25), q50: this.q(v, 0.5), q75: this.q(v, 0.75) });
        }
      }
    }
    return { calls, active, cone, prior, rangeCone, costPct, bars: n, lastClose: close[n - 1], lastAtr: atr[n - 1], lastTime: c[n - 1].time,
      stats: { n: N, wins: done.filter(k => k.r > 0).length, avg, t, h1, h2, baseR, status } };
  },

  result(){
    if (typeof Chart === 'undefined') return null;
    const v = Chart.view ? Chart.view() : (Chart.raw || []);
    if (v.length < 2) return null;
    const sym = STORE.symbol, tf = STORE.tf, key = sym + '|' + tf;
    this.fetchHistory(key, sym, tf);
    const older = this._hist[key] && this._hist[key] !== 'wait' ? this._hist[key].filter(x => x.time < v[0].time) : [];
    const sig = key + '|' + older.length + '|' + v.length + '|' + v[v.length - 2].time;
    if (sig === this._sig && this._R) return this._R;
    this._sig = sig; this._cardSig = '';
    const cost = typeof Checker !== 'undefined' ? Checker.costPct(sym) : 0.02;
    try { this._R = this.analyse(older.concat(v.slice(0, -1)), cost); }
    catch(e){ console.warn('ASTRA signals:', e.message); this._R = null; }
    return this._R;
  },

  /* older candles for the record and the cone, fetched once per instrument and
     timeframe; the chart's own candles always supply the recent end */
  _hist: {},
  fetchHistory(key, sym, tf){
    if (this._hist[key]) return;
    this._hist[key] = 'wait';
    API.klines(sym, tf, 2000, { signal: AbortSignal.timeout(30000) })
      .then(c => { this._hist[key] = c || []; if (STORE.symbol + '|' + STORE.tf === key) Draw.redraw(); })
      .catch(() => { this._hist[key] = []; });
  },

  STATUS: {
    holds:  ['HOLDS UP ON THIS CHART', '#2ebd85', 'Profitable after spread in both halves of this history, and better than random entries.'],
    weak:   ['WEAK ON THIS CHART', '#eda100', 'Above zero here, but it does not pass every test: both halves, better than random, and enough consistency.'],
    losing: ['LOSING ON THIS CHART', '#f6465d', 'This rule has lost money on this instrument and timeframe.'],
    few:    ['TOO FEW CALLS TO JUDGE', '#9aa7b8', 'Under 30 finished calls here. Treat any win rate as noise.'],
  },

  card(R, C){
    const wrap = document.getElementById('mainWrap'); if (!wrap) return;
    let el = document.getElementById('jmSigCard');
    if (!C.on || !C.card || !R){ if (el) el.remove(); return; }
    const sig = this._sig + '|' + JSON.stringify(C);
    if (el && sig === this._cardSig) return;
    this._cardSig = sig;
    if (!el){
      wrap.insertAdjacentHTML('beforeend', '<div id="jmSigCard" class="fcCard" style="left:12px;right:auto;top:52px"></div>');
      el = document.getElementById('jmSigCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
    }
    const head = '<div class="fcHead">✦ SIGNALS · ' + esc(baseAsset(STORE.symbol)) + ' ' + esc(STORE.tf) + '</div>';
    if (R.thin){ el.innerHTML = head + '<p>Needs ' + R.need + ' closed candles and has ' + R.have + '.</p>'; return; }
    const S = R.stats, ST = this.STATUS[S.status], a = R.active, f = v => (v > 0 ? '+' : '') + v.toFixed(2) + 'R';
    let body = head;
    if (a){
      const blocked = C.onlyHolds && S.status !== 'holds';
      body += '<div class="fcBig ' + (a.d > 0 ? 'up' : 'down') + '">' + (a.d > 0 ? '▲ BUY' : '▼ SELL') + (blocked ? ' <small>(hidden on the chart)</small>' : '') + '</div>';
      body += '<p>Signal at the close of ' + new Date(a.time * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '. ' +
        (a.pending ? 'Entry would be the next open, about ' : 'Entry ') + fmtPrice(a.entry) + ' · stop ' + fmtPrice(a.sl) + ' · target ' + fmtPrice(a.tp) + '.</p>';
      if (R.cone){ const e = R.cone[R.cone.length - 1];
        body += '<p>After ' + R.prior + ' earlier calls here, the typical move ' + this.RULE.horizon + ' candles later was ' + (e.q50 >= 0 ? '+' : '') + e.q50.toFixed(2) + ' ATR in the call’s direction (middle half: ' + e.q25.toFixed(2) + ' to ' + e.q75.toFixed(2) + ').</p>'; }
      else body += '<p>Only ' + R.prior + ' earlier calls here, and an expected path needs ' + this.RULE.minCone + '. The grey band is just this market’s usual range.</p>';
    } else {
      body += '<div class="fcBig">No signal</div><p>The rule is waiting. The grey band shows this market’s usual range over the next ' + this.RULE.horizon + ' candles, with no direction.</p>';
    }
    body += '<div style="margin-top:6px;font-weight:600;color:' + ST[1] + '">' + ST[0] + '</div><p>' + ST[2] + '</p>';
    if (S.n) body += '<p>' + S.n + ' finished calls · ' + (S.wins / S.n * 100).toFixed(0) + '% wins · average ' + f(S.avg) + ' after spread · random entries ' + f(S.baseR) + (S.h1 != null ? ' · halves ' + f(S.h1) + ', ' + f(S.h2) : '') + '</p>';
    body += '<p style="opacity:.65;font-size:10.5px">A record measured on one chart is not a promise, and checking many charts will find some good ones by luck. Drag this card anywhere.</p>';
    el.innerHTML = body;
  },

  draw(ctx){
    const C = this.cfg();
    if (!C.on){
      document.getElementById('jmSigCard')?.remove();
      this.restoreOffset();
      return;
    }
    if (typeof Chart === 'undefined' || !Chart.priceSeries) return;
    const R = this.result();
    try { this.card(R, C); } catch(e){ console.warn('ASTRA signals card:', e.message); }
    if (!R || R.thin) return;
    const show = !C.onlyHolds || R.stats.status === 'holds', solid = R.stats.status === 'holds';
    const ts = Chart.main.timeScale(), Y = p => Chart.priceSeries.priceToCoordinate(p), H = this.RULE.horizon;
    const up = '#2ebd85', down = '#f6465d';
    ctx.save();
    if (C.arrows && show) for (const k of R.calls.slice(-60)){
      const x = Draw.timeToX(k.time), y = Y(k.entry);
      if (x == null || y == null || x < 0 || x > Draw.cssW) continue;
      const col = k.d > 0 ? up : down, tip = y + (k.d > 0 ? 8 : -8), back = tip + (k.d > 0 ? 11 : -11);
      ctx.beginPath(); ctx.moveTo(x, tip); ctx.lineTo(x - 6, back); ctx.lineTo(x + 6, back); ctx.closePath();
      if (solid){ ctx.fillStyle = col; ctx.fill(); } else { ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.stroke(); }
      ctx.font = '700 10px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = k.done ? (k.r > 0 ? '#00e676' : '#ff5252') : '#ffd740';
      ctx.fillText(k.done ? (k.r > 0 ? '✓' : '✗') : '…', x, back + (k.d > 0 ? 8 : -8));
    }
    const a = R.active, withCone = C.cone && show && a && R.cone, withRange = C.range && show && !withCone && R.rangeCone;
    if (withCone || withRange){
      try { const cur = ts.options().rightOffset;
        if (cur < H + 6){ if (this._prevOffset == null) this._prevOffset = cur; ts.applyOptions({ rightOffset: H + 6 }); } } catch(e){}
      const plotW = (ts.width && ts.width()) || Draw.cssW, last = Chart.raw[Chart.raw.length - 1];
      const l0 = Draw.logicalFor(a ? a.time : last.time);
      const X = s => ts.logicalToCoordinate(l0 + 1 + s);
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, plotW, Draw.cssH || 9999); ctx.clip();
      const band = (lo, hi, fill) => { ctx.beginPath(); lo.forEach((p, s) => s ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        hi.slice().reverse().forEach(p => ctx.lineTo(p[0], p[1])); ctx.closePath(); ctx.fillStyle = fill; ctx.fill(); };
      const line = (pts, col, dash) => { ctx.beginPath(); pts.forEach((p, s) => s ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.strokeStyle = col; ctx.lineWidth = 1.6; ctx.setLineDash(dash || []); ctx.stroke(); ctx.setLineDash([]); };
      if (withCone){
        const col = a.d > 0 ? up : down, P = q => a.entry + a.d * q * a.A;
        const pts = key => R.cone.map((e, s) => [X(s), Y(P(e[key]))]).filter(p => p[0] != null && p[1] != null);
        band(pts('q25'), pts('q75'), a.d > 0 ? 'rgba(46,189,133,.2)' : 'rgba(246,70,93,.2)');
        const mid = pts('q50'); line(mid, col, [5, 4]);
        const e = mid[mid.length - 1];
        if (e){ ctx.font = '600 10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = col; ctx.fillText('typical path of past calls', e[0], e[1] - 4); }
      } else {
        const P = q => (a ? a.entry : R.lastClose) + q * (a ? a.A : R.lastAtr);
        const pts = key => R.rangeCone.map((e, s) => [X(s), Y(P(e[key]))]).filter(p => p[0] != null && p[1] != null);
        const hi = pts('hi'); band(pts('lo'), hi, 'rgba(154,167,184,.12)');
        const e = hi[hi.length - 1];
        if (e){ ctx.font = '600 10px sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#9aa7b8'; ctx.fillText('usual range · no direction', e[0], e[1] - 4); }
      }
      ctx.restore();
    } else this.restoreOffset();
    if (C.levels && a && show){
      const x0 = Math.max(0, Draw.timeToX(a.time) ?? 0), x1 = (ts.width && ts.width()) || Draw.cssW;
      for (const [p, col, label] of [[a.entry, '#c9d6e8', 'Entry'], [a.sl, down, 'Stop'], [a.tp, up, 'Target']]){
        const y = Y(p); if (y == null) continue;
        ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.setLineDash([3, 4]); ctx.stroke(); ctx.setLineDash([]);
        ctx.font = '600 10px sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = col; ctx.fillText(label, x0 + 4, y - 2);
      }
    }
    ctx.restore();
  },

  restoreOffset(){
    if (this._prevOffset == null) return;
    try { Chart.main.timeScale().applyOptions({ rightOffset: this._prevOffset }); } catch(e){}
    this._prevOffset = null;
  },
  syncBtn(){ const b = document.getElementById('jmSigBtn'); if (b) b.classList.toggle('on', this.cfg().on); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c); },
  panel(){
    let el = document.getElementById('jmSigPanel'); if (el){ el.remove(); return; }
    const c = this.cfg(), chk = (k, t) => '<label><input type="checkbox" data-sk="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>';
    document.body.insertAdjacentHTML('beforeend', '<div id="jmSigPanel" class="autoSrPanel asPanel"><b>Signals</b><div class="srLook"><b>What to show</b>' +
      chk('card', 'The signal card') + chk('arrows', 'BUY / SELL arrows with ✓ and ✗') + chk('cone', 'Expected-move cone after a call') + chk('range', 'Usual range when there is no call') +
      chk('levels', 'Entry, stop and target lines') + chk('onlyHolds', 'Draw calls only where the record holds up') + '</div></div>');
    el = document.getElementById('jmSigPanel');
    el.addEventListener('change', e => { const k = e.target.dataset.sk; if (!k) return; const v = this.cfg(); v[k] = e.target.checked; v.on = true; this.save(v); });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#jmSigPanel, #jmSigCfg')){ document.getElementById('jmSigPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('jmRegCfg') || document.getElementById('fcCfg');
  if (!after || document.getElementById('jmSigBtn')) return;
  after.insertAdjacentHTML('afterend', '<button id="jmSigBtn" class="bMini autoSrBtn' + (JMSignals.cfg().on ? ' on' : '') + '" title="BUY and SELL signals with the expected move drawn on the chart, and how the rule has done on this chart">✦ Signals</button><button id="jmSigCfg" class="bMini" title="Signals settings">⚙</button>');
  document.getElementById('jmSigBtn').addEventListener('click', () => JMSignals.toggle());
  document.getElementById('jmSigCfg').addEventListener('click', () => JMSignals.panel());
});
