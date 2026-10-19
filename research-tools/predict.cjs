// Research run 2 — "does this predict the next move?"
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

const results = [], lines = [];
for (const sym of SYMS){
  const c1 = load(sym, '1h'); const t0 = c1[220].t, t1 = c1[c1.length - 1].t, cut = t0 + (t1 - t0) * 0.6;
  let best = null; const tried = [];
  for (const tf of TFS) for (const mk of Object.keys(METHODS)) for (const p of METHODS[mk].params){
    const cs = calls(sym, tf, mk, p);
    const ins = cs.filter(x => x.t < cut), oos = cs.filter(x => x.t >= cut);
    const sIn = score(ins, baseRate(sym, tf, 0, cut)), sOut = score(oos, baseRate(sym, tf, cut, Infinity));
    tried.push({ tf, mk, p, sIn, sOut });
    /* chosen on the first 60% ONLY */
    if (sIn.n >= 30 && sIn.avg > 0 && (!best || sIn.z > best.sIn.z)) best = { tf, mk, p, sIn, sOut, all: score(cs, baseRate(sym, tf, 0, Infinity)) };
  }
  const verdict = !best ? 'none' : best.sOut.n >= 20 && best.sOut.z >= 2 && best.sOut.avg > 0 ? 'proven' : best.sOut.n >= 20 && best.sOut.z >= 1.3 && best.sOut.avg > 0 ? 'weak' : 'failed';
  results.push({ sym, group: GROUP(sym), verdict, best });
  const f = s => s && s.n ? `${s.n} calls, right ${(s.hit * 100).toFixed(1)}% vs ${(s.base * 100).toFixed(1)}% by chance, z ${s.z.toFixed(2)}, avg ${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)} ATR` : '—';
  lines.push(`${sym.padEnd(9)} ${verdict.toUpperCase().padEnd(7)} ${best ? (METHODS[best.mk].name + ' (' + best.p + ') ' + best.tf).padEnd(46) : ''} IN: ${best ? f(best.sIn) : '-'}\n${' '.repeat(64)}OUT: ${best ? f(best.sOut) : '-'}`);
}
console.log(lines.join('\n'));
fs.writeFileSync(path.join(__dirname, 'rdata', 'predict-results.json'), JSON.stringify(results, null, 1));
const tally = results.reduce((a, r) => (a[r.verdict] = (a[r.verdict] || 0) + 1, a), {});
console.log('\nverdicts', tally, '\n(tested per market: 5 methods × 2 settings × 3 timeframes = 30 combinations, choice made on the first 60% only)');
