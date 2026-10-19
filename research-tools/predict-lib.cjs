// Shared by predict.cjs and predict-groups.cjs. Research run 2 — "does this predict the next move?"
// Every method below makes a DIRECTION call on a closed candle (up or down over the next H candles).
// It is measured against the base rate of that market (how often price simply went that way anyway),
// after paying the full spread, on signals that do not overlap.
// Honesty rules: each method's settings are chosen on the FIRST 60% of the history only;
// the verdict is read on the LAST 40%, which the choice never saw.
const fs = require('fs'), path = require('path');
const { load, ema, sma, atr, rsi, adx, SYMS, GROUP, SPREAD } = require('./bt.cjs');
const H = { '1h': 8, '4h': 6, '1d': 5 };                       // how far ahead each call looks
const TFS = ['1h', '4h', '1d'];

/* the methods, in the chart's own vocabulary */
const METHODS = {
  breakout: { name: 'Breakout continuation', params: [20, 55],
    prep: c => ({}), call: (c, X, i, N) => {
      let hi = -Infinity, lo = Infinity; for (let k = i - N; k < i; k++){ hi = Math.max(hi, c[k].h); lo = Math.min(lo, c[k].l); }
      return c[i].c > hi ? 1 : c[i].c < lo ? -1 : 0; } },
  momentum: { name: 'Trend continuation (momentum)', params: [24, 72],
    prep: c => ({}), call: (c, X, i, K) => { const d = c[i].c - c[i - K].c; return Math.abs(d) > 2 * X.A[i] ? Math.sign(d) : 0; } },
  stretch: { name: 'Over-stretched — snaps back', params: [2.0, 2.5],
    prep: c => ({ m: sma(c.map(x => x.c), 20) }), call: (c, X, i, z) => { if (!X.m[i]) return 0; const d = (c[i].c - X.m[i]) / X.A[i]; return d > z ? -1 : d < -z ? 1 : 0; } },
  pullback: { name: 'Bounce in a trend (pullback)', params: [10, 20],
    prep: c => { const cl = c.map(x => x.c); return { e50: ema(cl, 50), e200: ema(cl, 200), r2: rsi(cl, 2) }; },
    call: (c, X, i, t) => { if (!X.e200[i] || X.r2[i] == null) return 0;
      if (X.e50[i] > X.e200[i] && c[i].c > X.e200[i] && X.r2[i] < t) return 1;
      if (X.e50[i] < X.e200[i] && c[i].c < X.e200[i] && X.r2[i] > 100 - t) return -1; return 0; } },
  rangefade: { name: 'Rejection at the edge of a range', params: [20, 40],
    prep: c => ({ ad: adx(c, 14) }), call: (c, X, i, N) => { if (X.ad[i] == null || X.ad[i] > 20) return 0;
      let hi = -Infinity, lo = Infinity; for (let k = i - N; k <= i; k++){ hi = Math.max(hi, c[k].h); lo = Math.min(lo, c[k].l); }
      const pos = (c[i].c - lo) / ((hi - lo) || 1); return pos > 0.9 ? -1 : pos < 0.1 ? 1 : 0; } },
};

function calls(sym, tf, mk, p){
  const c = load(sym, tf), X = Object.assign({ A: atr(c, 14) }, METHODS[mk].prep(c)), h = H[tf], sp = SPREAD[sym] || 0, out = [];
  let busy = -1;
  for (let i = 220; i < c.length - h - 1; i++){
    if (i <= busy || !X.A[i]) continue;
    const d = METHODS[mk].call(c, X, i, p); if (!d) continue;
    const e = c[i + 1].o, x = c[i + h].c, move = (x - e) * d - sp;           // in the called direction, after the spread
    out.push({ t: c[i].t, d, win: move > 0, atrMove: move / X.A[i] }); busy = i + h;
  }
  return out;
}
/* the base rate: from ANY candle, how often did price move up over h candles, after the spread */
function baseRate(sym, tf, from, to){
  const c = load(sym, tf), h = H[tf], sp = SPREAD[sym] || 0; let up = 0, dn = 0, n = 0;
  for (let i = 220; i < c.length - h - 1; i += h){ if (c[i].t < from || c[i].t >= to) continue; const m = c[i + h].c - c[i + 1].o; if (m - sp > 0) up++; if (-m - sp > 0) dn++; n++; }
  return { up: up / n, dn: dn / n };
}
function score(cs, base){
  const n = cs.length; if (!n) return { n: 0 };
  const hits = cs.filter(x => x.win).length, b = cs.reduce((a, x) => a + (x.d > 0 ? base.up : base.dn), 0) / n;
  const hit = hits / n, z = (hit - b) / Math.sqrt(b * (1 - b) / n), avg = cs.reduce((a, x) => a + x.atrMove, 0) / n;
  const q = cs.map(x => x.atrMove).sort((a, b2) => a - b2), Q = f => q[Math.min(q.length - 1, Math.floor(f * q.length))];
  return { n, hit, base: b, z, avg, q25: Q(0.25), q50: Q(0.5), q75: Q(0.75), ups: cs.filter(x => x.d > 0).length };
}


/* score where each call carries its own base rate (x.b) - for pooled groups */
function scoreB(cs){
  const n = cs.length; if (!n) return { n: 0, hit: 0, base: 0, z: 0, avg: 0 };
  const hit = cs.filter(x => x.win).length / n, b = cs.reduce((a, x) => a + x.b, 0) / n;
  const avg = cs.reduce((a, x) => a + x.atrMove, 0) / n, z = (hit - b) / Math.sqrt(b * (1 - b) / n);
  const q = cs.map(x => x.atrMove).sort((a, c) => a - c), Q = f => q[Math.min(q.length - 1, Math.floor(f * q.length))];
  return { n, hit, base: b, z, avg, q25: Q(0.25), q50: Q(0.5), q75: Q(0.75) };
}
module.exports = { H, TFS, METHODS, calls, baseRate, score, scoreB };
