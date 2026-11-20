/* ASTRA / Timurila — ProInd: the advanced indicators, the signals they give, and the
   context around a trade.

   One file, three users:
     · Classic and Timurila draw these on the chart (catalogue entries at the bottom, and the
       structure layers that js/studio.js paints);
     · timurila/research/signals.cjs runs every signal below through the research court
       (random-entry baseline, spread paid) so each one carries a measured verdict;
     · js/autopsy.js reads the context of a past trade: the daily trend ("the stream"), whether
       the market had just been shocked, and how many trend readings agreed with the trade.

   Everything here is arithmetic on closed candles. Nothing here places, changes or closes an order.
   The indicators are the published versions with their usual settings; none is tuned. */
(function(root){
'use strict';
const F = n => new Float64Array(n).fill(NaN);
const memo = (P, k, fn) => (P._m[k] !== undefined ? P._m[k] : (P._m[k] = fn()));

/* candles in either spelling ({time,open,high,low,close,volume} or {t,o,h,l,c,v}) -> typed columns */
function prep(c){
  if (c && c._m) return c;
  const n = c.length, P = { n, _m: {}, t: new Float64Array(n), o: new Float64Array(n), h: new Float64Array(n), l: new Float64Array(n), c: new Float64Array(n), v: new Float64Array(n) };
  for (let i = 0; i < n; i++){ const b = c[i];
    P.t[i] = b.time != null ? b.time : b.t; P.o[i] = b.open != null ? b.open : b.o; P.h[i] = b.high != null ? b.high : b.h;
    P.l[i] = b.low != null ? b.low : b.l; P.c[i] = b.close != null ? b.close : b.c; P.v[i] = (b.volume != null ? b.volume : b.v) || 0; }
  return P;
}

/* ---------- building blocks (NaN = not enough history yet) ---------- */
function sma(a, n){ const o = F(a.length); let s = 0, m = 0; for (let i = 0; i < a.length; i++){ const x = a[i]; if (x !== x){ s = 0; m = 0; continue; } s += x; m++; if (m > n){ s -= a[i - n]; m = n; } if (m === n) o[i] = s / n; } return o; }
function ema(a, n){ const o = F(a.length), k = 2 / (n + 1); let e = NaN, m = 0; for (let i = 0; i < a.length; i++){ const x = a[i]; if (x !== x) continue; e = e !== e ? x : x * k + e * (1 - k); if (++m >= n) o[i] = e; } return o; }
function rma(a, n){ const o = F(a.length); let e = NaN, s = 0, m = 0; for (let i = 0; i < a.length; i++){ const x = a[i]; if (x !== x) continue; m++; if (m <= n){ s += x; if (m === n){ e = s / n; o[i] = e; } } else { e = (e * (n - 1) + x) / n; o[i] = e; } } return o; }
function highest(a, n){ const o = F(a.length); for (let i = n - 1; i < a.length; i++){ let m = -Infinity, bad = false; for (let k = i - n + 1; k <= i; k++){ const x = a[k]; if (x !== x){ bad = true; break; } if (x > m) m = x; } if (!bad) o[i] = m; } return o; }
function lowest(a, n){ const o = F(a.length); for (let i = n - 1; i < a.length; i++){ let m = Infinity, bad = false; for (let k = i - n + 1; k <= i; k++){ const x = a[k]; if (x !== x){ bad = true; break; } if (x < m) m = x; } if (!bad) o[i] = m; } return o; }
function stdev(a, n){ const m = sma(a, n), o = F(a.length); for (let i = n - 1; i < a.length; i++){ if (m[i] !== m[i]) continue; let s = 0; for (let k = i - n + 1; k <= i; k++) s += (a[k] - m[i]) * (a[k] - m[i]); o[i] = Math.sqrt(s / n); } return o; }
/* value of the least-squares line through the last n points, read at its last point */
function linregEnd(a, n){ const o = F(a.length), sx = n * (n - 1) / 2, sxx = (n - 1) * n * (2 * n - 1) / 6, den = n * sxx - sx * sx;
  for (let i = n - 1; i < a.length; i++){ let sy = 0, sxy = 0, bad = false; for (let k = 0; k < n; k++){ const y = a[i - n + 1 + k]; if (y !== y){ bad = true; break; } sy += y; sxy += k * y; }
    if (bad) continue; const b = (n * sxy - sx * sy) / den; o[i] = (sy - b * sx) / n + b * (n - 1); } return o; }
function trueRange(P){ return memo(P, 'tr', () => { const o = F(P.n); for (let i = 0; i < P.n; i++) o[i] = i ? Math.max(P.h[i] - P.l[i], Math.abs(P.h[i] - P.c[i - 1]), Math.abs(P.l[i] - P.c[i - 1])) : P.h[i] - P.l[i]; return o; }); }
function atr(P, n){ return memo(P, 'atr' + n, () => rma(trueRange(P), n)); }
function rsi(a, n){ const o = F(a.length); let g = 0, l = 0; for (let i = 1; i < a.length; i++){ const d = a[i] - a[i - 1], up = d > 0 ? d : 0, dn = d < 0 ? -d : 0;
    if (i <= n){ g += up / n; l += dn / n; } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; }
    if (i >= n) o[i] = l === 0 ? 100 : 100 - 100 / (1 + g / l); } return o; }
const hlc3 = P => memo(P, 'hlc3', () => { const o = F(P.n); for (let i = 0; i < P.n; i++) o[i] = (P.h[i] + P.l[i] + P.c[i]) / 3; return o; });

/* ---------- the indicators ---------- */
/* SuperTrend (Olivier Seban), 10 / 3 */
function supertrend(P, len = 10, mult = 3){ return memo(P, 'st' + len + '_' + mult, () => {
  const A = atr(P, len), line = F(P.n), dir = new Int8Array(P.n); let ub = NaN, lb = NaN, d = 1;
  for (let i = 1; i < P.n; i++){ if (A[i] !== A[i]) continue; const mid = (P.h[i] + P.l[i]) / 2, u = mid + mult * A[i], l = mid - mult * A[i];
    if (ub !== ub){ ub = u; lb = l; d = P.c[i] >= mid ? 1 : -1; }
    else { const pu = ub, pl = lb; ub = (u < pu || P.c[i - 1] > pu) ? u : pu; lb = (l > pl || P.c[i - 1] < pl) ? l : pl;
      if (d < 0 && P.c[i] > ub) d = 1; else if (d > 0 && P.c[i] < lb) d = -1; }
    dir[i] = d; line[i] = d > 0 ? lb : ub; }
  return { line, dir }; }); }

/* Chandelier Exit (Chuck LeBeau), 22 / 3 */
function chandelier(P, len = 22, mult = 3){ return memo(P, 'ce' + len + '_' + mult, () => {
  const A = atr(P, len), hh = highest(P.h, len), ll = lowest(P.l, len), lo = F(P.n), sh = F(P.n), dir = new Int8Array(P.n); let d = 1;
  for (let i = 1; i < P.n; i++){ if (A[i] !== A[i] || hh[i] !== hh[i]) continue; let L = hh[i] - mult * A[i], S = ll[i] + mult * A[i]; const Lp = lo[i - 1], Sp = sh[i - 1];
    if (Lp === Lp && P.c[i - 1] > Lp) L = Math.max(L, Lp); if (Sp === Sp && P.c[i - 1] < Sp) S = Math.min(S, Sp);
    lo[i] = L; sh[i] = S; if (Sp === Sp && P.c[i] > Sp) d = 1; else if (Lp === Lp && P.c[i] < Lp) d = -1; dir[i] = d; }
  return { long: lo, short: sh, dir }; }); }

/* UT Bot (an ATR trailing stop; key 1, ATR 10) */
function utbot(P, key = 1, len = 10){ return memo(P, 'ut' + key + '_' + len, () => {
  const A = atr(P, len), stop = F(P.n), dir = new Int8Array(P.n); let s = NaN, d = 0;
  for (let i = 1; i < P.n; i++){ if (A[i] !== A[i]) continue; const x = P.c[i], xp = P.c[i - 1], nl = key * A[i];
    if (s !== s) s = x - nl; else if (x > s && xp > s) s = Math.max(s, x - nl); else if (x < s && xp < s) s = Math.min(s, x + nl); else s = x > s ? x - nl : x + nl;
    stop[i] = s; d = x > s ? 1 : x < s ? -1 : d; dir[i] = d; }
  return { stop, dir }; }); }

function macd(a, f = 12, s = 26, g = 9){ const ef = ema(a, f), es = ema(a, s), m = F(a.length); for (let i = 0; i < a.length; i++) m[i] = ef[i] - es[i]; const sig = ema(m, g), hist = F(a.length); for (let i = 0; i < a.length; i++) hist[i] = m[i] - sig[i]; return { macd: m, signal: sig, hist }; }

function adx(P, n = 14){ return memo(P, 'adx' + n, () => {
  const pd = F(P.n), md = F(P.n); for (let i = 1; i < P.n; i++){ const up = P.h[i] - P.h[i - 1], dn = P.l[i - 1] - P.l[i]; pd[i] = up > dn && up > 0 ? up : 0; md[i] = dn > up && dn > 0 ? dn : 0; }
  const T = trueRange(P).slice(); T[0] = NaN; const tr = rma(T, n), p = rma(pd, n), m = rma(md, n), pdi = F(P.n), mdi = F(P.n), dx = F(P.n);
  for (let i = 0; i < P.n; i++){ if (tr[i] !== tr[i] || !tr[i]) continue; pdi[i] = 100 * p[i] / tr[i]; mdi[i] = 100 * m[i] / tr[i]; const s = pdi[i] + mdi[i]; dx[i] = s ? 100 * Math.abs(pdi[i] - mdi[i]) / s : 0; }
  return { adx: rma(dx, n), pdi, mdi }; }); }

/* Ichimoku: the cloud as it stands above each candle (spans drawn 26 candles ahead of where they were measured) */
function ichimoku(P){ return memo(P, 'ichi', () => {
  const mid = n => { const hh = highest(P.h, n), ll = lowest(P.l, n), o = F(P.n); for (let i = 0; i < P.n; i++) o[i] = (hh[i] + ll[i]) / 2; return o; };
  const tk = mid(9), kj = mid(26), sb = mid(52), top = F(P.n), bot = F(P.n);
  for (let i = 26; i < P.n; i++){ const a = (tk[i - 26] + kj[i - 26]) / 2, b = sb[i - 26]; if (a === a && b === b){ top[i] = Math.max(a, b); bot[i] = Math.min(a, b); } }
  return { tk, kj, top, bot }; }); }

/* WaveTrend (LazyBear), 10 / 21 */
function wavetrend(P, n1 = 10, n2 = 21){ return memo(P, 'wt' + n1 + '_' + n2, () => {
  const ap = hlc3(P), esa = ema(ap, n1), dev = F(P.n); for (let i = 0; i < P.n; i++) dev[i] = Math.abs(ap[i] - esa[i]);
  const d = ema(dev, n1), ci = F(P.n); for (let i = 0; i < P.n; i++) ci[i] = d[i] ? (ap[i] - esa[i]) / (0.015 * d[i]) : NaN;
  const wt1 = ema(ci, n2); return { wt1, wt2: sma(wt1, 4) }; }); }

/* Stochastic RSI (Chande & Kroll), 14 / 14 / 3 / 3 */
function stochRsi(P, rl = 14, sl = 14, k = 3, d = 3){ return memo(P, 'srsi' + rl + sl + k + d, () => {
  const r = rsi(P.c, rl), hh = highest(r, sl), ll = lowest(r, sl), st = F(P.n); for (let i = 0; i < P.n; i++){ const w = hh[i] - ll[i]; st[i] = w > 0 ? 100 * (r[i] - ll[i]) / w : (w === 0 ? 50 : NaN); }
  const K = sma(st, k); return { k: K, d: sma(K, d) }; }); }

/* Fisher Transform (John Ehlers), 10 */
function fisher(P, len = 10){ return memo(P, 'fish' + len, () => {
  const hh = highest(P.h, len), ll = lowest(P.l, len), f = F(P.n), trig = F(P.n); let v = 0, fp = 0;
  for (let i = 0; i < P.n; i++){ if (hh[i] !== hh[i]) continue; const w = hh[i] - ll[i], x = w > 0 ? ((P.h[i] + P.l[i]) / 2 - ll[i]) / w - 0.5 : 0;
    v = Math.max(-0.999, Math.min(0.999, 0.66 * x + 0.67 * v)); const fi = 0.5 * Math.log((1 + v) / (1 - v)) + 0.5 * fp; trig[i] = fp; f[i] = fi; fp = fi; }
  return { f, trig }; }); }

/* Squeeze Momentum (LazyBear, after John Carter's TTM Squeeze), 20 / 2 / 1.5 */
function squeeze(P, len = 20, bb = 2, kc = 1.5){ return memo(P, 'sqz' + len + bb + kc, () => {
  const m = sma(P.c, len), sd = stdev(P.c, len), rng = sma(trueRange(P), len), hh = highest(P.h, len), ll = lowest(P.l, len), on = new Int8Array(P.n), src = F(P.n);
  for (let i = 0; i < P.n; i++){ if (m[i] !== m[i] || rng[i] !== rng[i]) continue; on[i] = (m[i] - bb * sd[i] > m[i] - kc * rng[i] && m[i] + bb * sd[i] < m[i] + kc * rng[i]) ? 1 : 0; src[i] = P.c[i] - ((hh[i] + ll[i]) / 2 + m[i]) / 2; }
  return { mom: linregEnd(src, len), on }; }); }

/* Nadaraya–Watson envelope, read only from candles that have closed (the popular version looks
   ahead and repaints; this one does not, so what you see is what was knowable at the time) */
function nwEnvelope(P, h = 8, mult = 3, look = 40, errLen = 100){ return memo(P, 'nw' + h + mult, () => {
  const w = []; for (let k = 0; k < look; k++) w.push(Math.exp(-(k * k) / (2 * h * h))); const ws = w.reduce((a, b) => a + b, 0), mid = F(P.n), err = F(P.n);
  for (let i = look - 1; i < P.n; i++){ let s = 0; for (let k = 0; k < look; k++) s += w[k] * P.c[i - k]; mid[i] = s / ws; err[i] = Math.abs(P.c[i] - mid[i]); }
  const mae = sma(err, errLen), up = F(P.n), dn = F(P.n); for (let i = 0; i < P.n; i++){ up[i] = mid[i] + mult * mae[i]; dn[i] = mid[i] - mult * mae[i]; }
  return { mid, up, dn }; }); }

/* VWAP anchored to the start of each day, week or month, with one and two standard-deviation bands */
function avwap(P, period = 'week'){ return memo(P, 'avwap' + period, () => {
  const key = t => { const d = Math.floor(t / 86400); if (period === 'day') return d; if (period === 'week') return Math.floor((d + 3) / 7); const D = new Date(t * 1000); return D.getUTCFullYear() * 12 + D.getUTCMonth(); };
  const v = F(P.n), u1 = F(P.n), l1 = F(P.n), u2 = F(P.n), l2 = F(P.n); let sv = 0, sp = 0, spp = 0, cur = null; const tp = hlc3(P);
  for (let i = 0; i < P.n; i++){ const k = key(P.t[i]); if (k !== cur){ cur = k; sv = 0; sp = 0; spp = 0; } const w = P.v[i] > 0 ? P.v[i] : 1; sv += w; sp += w * tp[i]; spp += w * tp[i] * tp[i];
    const m = sp / sv, sd = Math.sqrt(Math.max(0, spp / sv - m * m)); v[i] = m; u1[i] = m + sd; l1[i] = m - sd; u2[i] = m + 2 * sd; l2[i] = m - 2 * sd; }
  return { v, u1, l1, u2, l2 }; }); }

/* Choppiness Index (E. W. Dreiss): 100 = pure chop, 0 = a straight line */
function choppiness(P, n = 14){ return memo(P, 'chop' + n, () => { const T = trueRange(P), s = sma(T, n), hh = highest(P.h, n), ll = lowest(P.l, n), o = F(P.n);
  for (let i = 0; i < P.n; i++){ const w = hh[i] - ll[i]; if (w > 0 && s[i] === s[i]) o[i] = 100 * Math.log10(s[i] * n / w) / Math.log10(n); } return o; }); }
function rvol(P, n = 20){ return memo(P, 'rvol' + n, () => { const m = sma(P.v, n), o = F(P.n); for (let i = 0; i < P.n; i++) o[i] = m[i] > 0 ? P.v[i] / m[i] : NaN; return o; }); }
function cci(P, n = 20){ return memo(P, 'cci' + n, () => { const tp = hlc3(P), m = sma(tp, n), o = F(P.n); for (let i = n - 1; i < P.n; i++){ if (m[i] !== m[i]) continue; let d = 0; for (let k = i - n + 1; k <= i; k++) d += Math.abs(tp[k] - m[i]); d /= n; o[i] = d ? (tp[i] - m[i]) / (0.015 * d) : 0; } return o; }); }

/* Lorentzian classification (after jdehorty's popular script, simplified: no extra filters).
   For each candle it finds the 8 past candles whose readings looked most alike (Lorentzian
   distance over RSI 14, WaveTrend, CCI 20, ADX 20 and RSI 9) and counts how many of them were
   followed by a rise four candles later. It only ever uses outcomes that were already known. */
function lorentzian(P, k = 8, back = 1000, step = 4, ahead = 4){ return memo(P, 'lor', () => {
  const n = P.n, clamp = x => x < 0 ? 0 : x > 1 ? 1 : x, r14 = rsi(P.c, 14), r9 = rsi(P.c, 9), wt = wavetrend(P, 10, 11).wt1, cc = cci(P, 20), ad = adx(P, 20).adx;
  const f = [F(n), F(n), F(n), F(n), F(n)];
  for (let i = 0; i < n; i++){ f[0][i] = r14[i] / 100; f[1][i] = clamp((wt[i] + 80) / 160); f[2][i] = clamp((cc[i] + 200) / 400); f[3][i] = clamp(ad[i] / 60); f[4][i] = r9[i] / 100; }
  const okAt = i => f[0][i] === f[0][i] && f[1][i] === f[1][i] && f[2][i] === f[2][i] && f[3][i] === f[3][i] && f[4][i] === f[4][i];
  let start = 0; while (start < n && !okAt(start)) start++; start = Math.ceil(start / step) * step;
  const pred = new Int8Array(n), dir = new Int8Array(n), dist = new Float64Array(k), lab = new Int8Array(k); let d = 0;
  for (let i = start + 40; i < n; i++){
    if (!okAt(i)){ dir[i] = d; continue; }
    let cnt = 0, worst = -1, wi = -1; const a0 = f[0][i], a1 = f[1][i], a2 = f[2][i], a3 = f[3][i], a4 = f[4][i];
    let j = i - ahead; j -= j % step;
    for (const j0 = Math.max(start, i - back); j >= j0; j -= step){
      const dd = Math.log(1 + Math.abs(a0 - f[0][j])) + Math.log(1 + Math.abs(a1 - f[1][j])) + Math.log(1 + Math.abs(a2 - f[2][j])) + Math.log(1 + Math.abs(a3 - f[3][j])) + Math.log(1 + Math.abs(a4 - f[4][j]));
      if (cnt < k){ dist[cnt] = dd; lab[cnt] = P.c[j + ahead] > P.c[j] ? 1 : P.c[j + ahead] < P.c[j] ? -1 : 0; cnt++; if (cnt === k){ worst = -1; for (let q = 0; q < k; q++) if (dist[q] > worst){ worst = dist[q]; wi = q; } } }
      else if (dd < worst){ dist[wi] = dd; lab[wi] = P.c[j + ahead] > P.c[j] ? 1 : P.c[j + ahead] < P.c[j] ? -1 : 0; worst = -1; for (let q = 0; q < k; q++) if (dist[q] > worst){ worst = dist[q]; wi = q; } }
    }
    let s = 0; for (let q = 0; q < cnt; q++) s += lab[q]; pred[i] = s; d = s > 0 ? 1 : s < 0 ? -1 : d; dir[i] = d; }
  return { pred, dir }; }); }

/* ---------- market structure ("smart money concepts", as usually coded) ---------- */
/* a swing point is only known `w` candles after it happened; `at` is the candle it became known */
function pivots(P, w = 5){ return memo(P, 'piv' + w, () => { const out = [];
  for (let j = w; j < P.n - w; j++){ let hi = true, lo = true;
    for (let k = 1; k <= w && (hi || lo); k++){ if (P.h[j] <= P.h[j - k] || P.h[j] < P.h[j + k]) hi = false; if (P.l[j] >= P.l[j - k] || P.l[j] > P.l[j + k]) lo = false; }
    if (hi) out.push({ i: j, at: j + w, p: P.h[j], hi: true }); if (lo) out.push({ i: j, at: j + w, p: P.l[j], hi: false }); }
  return out; }); }

/* break of structure (trend continues) and change of character (first break against the trend) */
function structure(P, w = 5){ return memo(P, 'struct' + w, () => { const piv = pivots(P, w), ev = []; let pi = 0, SH = null, SL = null, trend = 0;
  for (let i = 0; i < P.n; i++){ while (pi < piv.length && piv[pi].at <= i){ const q = piv[pi++]; if (q.hi) SH = q; else SL = q; }
    if (SH && P.c[i] > SH.p){ ev.push({ i, up: true, kind: trend < 0 ? 'CHoCH' : 'BOS', level: SH.p, from: SH.i }); trend = 1; SH = null; }
    else if (SL && P.c[i] < SL.p){ ev.push({ i, up: false, kind: trend > 0 ? 'CHoCH' : 'BOS', level: SL.p, from: SL.i }); trend = -1; SL = null; } }
  return ev; }); }

/* fair value gap: three candles that leave a hole between the first one's high and the third one's low */
function fvgs(P, minAtr = 0.3, life = 120){ return memo(P, 'fvg' + minAtr, () => { const A = atr(P, 14), out = [];
  for (let i = 2; i < P.n; i++){ if (A[i] !== A[i]) continue;
    if (P.l[i] > P.h[i - 2] && P.l[i] - P.h[i - 2] >= minAtr * A[i]) out.push({ i, up: true, top: P.l[i], bot: P.h[i - 2] });
    else if (P.h[i] < P.l[i - 2] && P.l[i - 2] - P.h[i] >= minAtr * A[i]) out.push({ i, up: false, top: P.l[i - 2], bot: P.h[i] }); }
  for (const g of out){ g.touch = -1; g.end = -1;
    for (let k = g.i + 1; k < Math.min(P.n, g.i + life); k++){
      if (g.up){ if (g.touch < 0 && P.l[k] <= g.top) g.touch = k; if (P.c[k] < g.bot){ g.end = k; break; } }
      else { if (g.touch < 0 && P.h[k] >= g.bot) g.touch = k; if (P.c[k] > g.top){ g.end = k; break; } } } }
  return out; }); }

/* order block: the last candle against the move, at the origin of a move that went on to break structure */
function orderBlocks(P, w = 5, life = 160){ return memo(P, 'ob' + w, () => { const A = atr(P, 14), out = [];
  for (const e of structure(P, w)){ const a = Math.max(e.from, e.i - 40); let m = a;
    for (let k = a; k < e.i; k++) if (e.up ? P.l[k] < P.l[m] : P.h[k] > P.h[m]) m = k;
    const cap = 1.5 * (A[e.i] || (P.h[m] - P.l[m])); let top = P.h[m], bot = P.l[m]; if (top - bot > cap){ if (e.up) top = bot + cap; else bot = top - cap; }
    const g = { i: m, born: e.i, up: e.up, top, bot, kind: e.kind, touch: -1, end: -1 };
    for (let k = e.i + 1; k < Math.min(P.n, e.i + life); k++){
      if (g.up){ if (g.touch < 0 && P.l[k] <= g.top) g.touch = k; if (P.c[k] < g.bot){ g.end = k; break; } }
      else { if (g.touch < 0 && P.h[k] >= g.bot) g.touch = k; if (P.c[k] > g.top){ g.end = k; break; } } }
    out.push(g); }
  return out; }); }

/* liquidity sweep: a candle trades through a known swing point and closes back on the other side of it */
function sweeps(P, w = 5){ return memo(P, 'sweep' + w, () => { const piv = pivots(P, w), ev = []; let pi = 0, lows = [], highs = [];
  for (let i = 0; i < P.n; i++){ while (pi < piv.length && piv[pi].at < i){ const q = piv[pi++]; (q.hi ? highs : lows).push(q); if (highs.length > 4) highs.shift(); if (lows.length > 4) lows.shift(); }
    lows = lows.filter(q => { if (P.l[i] < q.p){ if (P.c[i] > q.p) ev.push({ i, up: true, level: q.p, from: q.i }); return false; } return true; });
    highs = highs.filter(q => { if (P.h[i] > q.p){ if (P.c[i] < q.p) ev.push({ i, up: false, level: q.p, from: q.i }); return false; } return true; }); }
  return ev; }); }

/* regular RSI divergence between two successive swing points (known when the second swing is confirmed) */
function divergences(P, w = 5){ return memo(P, 'div' + w, () => { const R = rsi(P.c, 14), out = []; let lo = null, hi = null;
  for (const q of pivots(P, w)){ const r = R[q.i]; if (r !== r) continue;
    if (!q.hi){ if (lo && q.i - lo.i >= 5 && q.i - lo.i <= 60 && q.p < lo.p && r > lo.r && lo.r < 40) out.push({ i: q.at, a: lo.i, b: q.i, pa: lo.p, pb: q.p, up: true }); lo = { i: q.i, p: q.p, r }; }
    else { if (hi && q.i - hi.i >= 5 && q.i - hi.i <= 60 && q.p > hi.p && r < hi.r && hi.r > 60) out.push({ i: q.at, a: hi.i, b: q.i, pa: hi.p, pb: q.p, up: false }); hi = { i: q.i, p: q.p, r }; } }
  return out; }); }

/* ---------- signals: +1 = buy read on the close of that candle, -1 = sell, 0 = nothing ---------- */
const flips = d => { const o = new Int8Array(d.length); for (let i = 1; i < d.length; i++) if (d[i] && d[i - 1] && d[i] !== d[i - 1]) o[i] = d[i]; return o; };
const fromEvents = (P, ev, at, dirOf) => { const o = new Int8Array(P.n); for (const e of ev){ const i = at(e); if (i >= 0 && i < P.n) o[i] = dirOf(e); } return o; };
const cross = (a, b, i) => a[i - 1] === a[i - 1] && b[i - 1] === b[i - 1] && a[i] === a[i] && b[i] === b[i] ? (a[i - 1] <= b[i - 1] && a[i] > b[i] ? 1 : a[i - 1] >= b[i - 1] && a[i] < b[i] ? -1 : 0) : 0;

const SIGNALS = [
  { id: 'st', name: 'SuperTrend flip', family: 'trend', how: 'SuperTrend 10 / 3 changes side', run: P => flips(supertrend(P).dir) },
  { id: 'ce', name: 'Chandelier Exit flip', family: 'trend', how: 'Chandelier Exit 22 / 3 changes side', run: P => flips(chandelier(P).dir) },
  { id: 'ut', name: 'UT Bot flip', family: 'trend', how: 'UT Bot (key 1, ATR 10) changes side', run: P => flips(utbot(P).dir) },
  { id: 'macd', name: 'MACD cross', family: 'trend', how: 'MACD 12 / 26 crosses its 9 signal line', run: P => { const m = memo(P, 'macd', () => macd(P.c)), o = new Int8Array(P.n); for (let i = 1; i < P.n; i++) o[i] = cross(m.macd, m.signal, i); return o; } },
  { id: 'ichi', name: 'Ichimoku cloud break', family: 'trend', how: 'the close leaves the cloud', run: P => { const k = ichimoku(P), o = new Int8Array(P.n); for (let i = 1; i < P.n; i++){ if (k.top[i] !== k.top[i] || k.top[i - 1] !== k.top[i - 1]) continue; if (P.c[i] > k.top[i] && P.c[i - 1] <= k.top[i - 1]) o[i] = 1; else if (P.c[i] < k.bot[i] && P.c[i - 1] >= k.bot[i - 1]) o[i] = -1; } return o; } },
  { id: 'donch', name: 'Donchian 20 breakout', family: 'trend', how: 'a close beyond the last 20 candles', run: P => { const hh = highest(P.h, 20), ll = lowest(P.l, 20), o = new Int8Array(P.n); for (let i = 22; i < P.n; i++){ if (P.c[i] > hh[i - 1] && P.c[i - 1] <= hh[i - 2]) o[i] = 1; else if (P.c[i] < ll[i - 1] && P.c[i - 1] >= ll[i - 2]) o[i] = -1; } return o; } },
  { id: 'gc', name: 'Golden / death cross', family: 'trend', how: 'the 50 average crosses the 200', run: P => { const a = sma(P.c, 50), b = sma(P.c, 200), o = new Int8Array(P.n); for (let i = 1; i < P.n; i++) o[i] = cross(a, b, i); return o; } },
  { id: 'bos', name: 'Break of structure', family: 'structure', how: 'a close beyond the last swing, with the trend', run: P => fromEvents(P, structure(P).filter(e => e.kind === 'BOS'), e => e.i, e => e.up ? 1 : -1) },
  { id: 'choch', name: 'Change of character', family: 'structure', how: 'the first close beyond a swing against the trend', run: P => fromEvents(P, structure(P).filter(e => e.kind === 'CHoCH'), e => e.i, e => e.up ? 1 : -1) },
  { id: 'fvg', name: 'Fair value gap retest', family: 'structure', how: 'price returns into a gap and does not close through it', run: P => fromEvents(P, fvgs(P).filter(g => g.touch > 0 && g.end !== g.touch), g => g.touch, g => g.up ? 1 : -1) },
  { id: 'ob', name: 'Order block retest', family: 'structure', how: 'price returns to the origin of a structure break', run: P => fromEvents(P, orderBlocks(P).filter(g => g.touch > 0 && g.end !== g.touch), g => g.touch, g => g.up ? 1 : -1) },
  { id: 'sweep', name: 'Liquidity sweep', family: 'reversal', how: 'a swing point is taken and the candle closes back', run: P => fromEvents(P, sweeps(P), e => e.i, e => e.up ? 1 : -1) },
  { id: 'sqz', name: 'Squeeze release', family: 'breakout', how: 'six or more squeezed candles end; side = momentum', run: P => { const q = squeeze(P), o = new Int8Array(P.n); let run = 0; for (let i = 1; i < P.n; i++){ if (q.on[i]){ run++; continue; } if (run >= 6 && q.mom[i] === q.mom[i]) o[i] = q.mom[i] > 0 ? 1 : q.mom[i] < 0 ? -1 : 0; run = 0; } return o; } },
  { id: 'wt', name: 'WaveTrend cross at an extreme', family: 'reversal', how: 'the lines cross below −53 or above +53', run: P => { const w = wavetrend(P), o = new Int8Array(P.n); for (let i = 1; i < P.n; i++){ const x = cross(w.wt1, w.wt2, i); if (x > 0 && w.wt1[i] < -53) o[i] = 1; else if (x < 0 && w.wt1[i] > 53) o[i] = -1; } return o; } },
  { id: 'srsi', name: 'Stochastic RSI cross', family: 'reversal', how: '%K crosses %D below 20 or above 80', run: P => { const s = stochRsi(P), o = new Int8Array(P.n); for (let i = 1; i < P.n; i++){ const x = cross(s.k, s.d, i); if (x > 0 && s.k[i] < 20) o[i] = 1; else if (x < 0 && s.k[i] > 80) o[i] = -1; } return o; } },
  { id: 'fisher', name: 'Fisher Transform turn', family: 'reversal', how: 'Fisher turns back from beyond ±1.5', run: P => { const f = fisher(P), o = new Int8Array(P.n); for (let i = 1; i < P.n; i++){ const x = cross(f.f, f.trig, i); if (x > 0 && f.f[i] < -1.5) o[i] = 1; else if (x < 0 && f.f[i] > 1.5) o[i] = -1; } return o; } },
  { id: 'rsidiv', name: 'RSI divergence', family: 'reversal', how: 'price makes a new extreme, RSI does not', run: P => fromEvents(P, divergences(P), e => e.i, e => e.up ? 1 : -1) },
  { id: 'nw', name: 'Nadaraya–Watson band fade', family: 'reversal', how: 'a close beyond the envelope, faded', run: P => { const e = nwEnvelope(P), o = new Int8Array(P.n); for (let i = 1; i < P.n; i++){ if (e.dn[i] !== e.dn[i] || e.dn[i - 1] !== e.dn[i - 1]) continue; if (P.c[i] < e.dn[i] && P.c[i - 1] >= e.dn[i - 1]) o[i] = 1; else if (P.c[i] > e.up[i] && P.c[i - 1] <= e.up[i - 1]) o[i] = -1; } return o; } },
  { id: 'td9', name: 'TD 9 count', family: 'reversal', how: 'nine closes in a row beyond the close four candles earlier', run: P => { const o = new Int8Array(P.n); let b = 0, s = 0; for (let i = 4; i < P.n; i++){ if (P.c[i] < P.c[i - 4]){ b++; s = 0; } else if (P.c[i] > P.c[i - 4]){ s++; b = 0; } else { b = 0; s = 0; } if (b === 9) o[i] = 1; else if (s === 9) o[i] = -1; } return o; } },
  { id: 'lor', name: 'Lorentzian classification', family: 'model', how: 'the nearest-neighbour vote changes side', run: P => flips(lorentzian(P).dir) },
];
const signal = (P, id) => memo(P, 'sig_' + id, () => SIGNALS.find(s => s.id === id).run(P));

/* ---------- states: which way each trend reading points on a candle (+1 up, -1 down, 0 neither) ---------- */
const sign8 = (n, f) => { const o = new Int8Array(n); for (let i = 0; i < n; i++){ const x = f(i); o[i] = x > 0 ? 1 : x < 0 ? -1 : 0; } return o; };
const STATES = [
  { id: 'st', name: 'SuperTrend', run: P => supertrend(P).dir },
  { id: 'ce', name: 'Chandelier Exit', run: P => chandelier(P).dir },
  { id: 'ut', name: 'UT Bot', run: P => utbot(P).dir },
  { id: 'macd', name: 'MACD', run: P => { const m = memo(P, 'macd', () => macd(P.c)); return sign8(P.n, i => m.hist[i]); } },
  { id: 'ichi', name: 'Ichimoku cloud', run: P => { const k = ichimoku(P); return sign8(P.n, i => k.top[i] !== k.top[i] ? 0 : P.c[i] > k.top[i] ? 1 : P.c[i] < k.bot[i] ? -1 : 0); } },
  { id: 'ma', name: 'Averages 50 / 200', run: P => { const a = memo(P, 'sma50', () => sma(P.c, 50)), b = memo(P, 'sma200', () => sma(P.c, 200)); return sign8(P.n, i => a[i] - b[i]); } },
  { id: 'di', name: 'Directional index', run: P => { const a = adx(P, 14); return sign8(P.n, i => a.pdi[i] - a.mdi[i]); } },
  { id: 'mid', name: 'Donchian midline', run: P => { const hh = memo(P, 'hh20', () => highest(P.h, 20)), ll = memo(P, 'll20', () => lowest(P.l, 20)); return sign8(P.n, i => P.c[i] - (hh[i] + ll[i]) / 2); } },
  { id: 'lor', name: 'Lorentzian vote', run: P => lorentzian(P).dir },
];
const state = (P, id) => memo(P, 'state_' + id, () => STATES.find(s => s.id === id).run(P));
/* how many of the trend readings point with `dir` on candle i */
function agreement(P, i, dir){ const list = STATES.map(s => ({ id: s.id, name: s.name, dir: state(P, s.id)[i] || 0 })); let yes = 0, no = 0; for (const x of list){ if (x.dir === dir) yes++; else if (x.dir === -dir) no++; }
  return { yes, no, of: list.length, share: yes / list.length, list }; }

/* ---------- context ---------- */
/* last candle whose time is <= t (binary search; -1 if none) */
function indexAt(P, t){ let a = 0, b = P.n - 1, r = -1; while (a <= b){ const m = (a + b) >> 1; if (P.t[m] <= t){ r = m; a = m + 1; } else b = m - 1; } return r; }
/* the stream: four plain readings of the daily trend. +2 or more = up, -2 or less = down */
function stream(P, i){ if (i < 0) return null; const s200 = memo(P, 'sma200', () => sma(P.c, 200)), s50 = memo(P, 'sma50', () => sma(P.c, 50)), x = P.c[i]; let sc = 0, n = 0; const parts = [];
  const add = (label, v) => { if (v === v){ const d = v > 0 ? 1 : v < 0 ? -1 : 0; sc += d; n++; parts.push({ label, dir: d }); } };
  add('Price against the 200-day average', x - s200[i]); add('50-day against the 200-day', s50[i] - s200[i]); add('Price against the 50-day average', x - s50[i]); add('The 50-day is rising or falling', i >= 10 ? s50[i] - s50[i - 10] : NaN);
  return { score: sc, of: n, dir: n < 2 ? 0 : sc >= 2 ? 1 : sc <= -2 ? -1 : 0, parts }; }
/* a shock: a candle whose true range is at least 2.5 times the usual (ATR 20) within the last `look` candles */
function shock(P, i, look = 2){ const A = atr(P, 20), T = trueRange(P); let z = 0, at = -1; for (let k = Math.max(21, i - look + 1); k <= i; k++){ const a = A[k - 1]; if (!(a > 0)) continue; const r = T[k] / a; if (r > z){ z = r; at = k; } }
  return { z, at, on: z >= 2.5, dir: at > 0 ? (P.c[at] > P.c[at - 1] ? 1 : -1) : 0 }; }

/* how far today has already travelled by candle i of an intraday series (high to low so far) */
function dayRangeSoFar(P, i){ const d = Math.floor(P.t[i] / 86400); let hi = -Infinity, lo = Infinity; for (let k = i; k >= 0 && Math.floor(P.t[k] / 86400) === d; k--){ if (P.h[k] > hi) hi = P.h[k]; if (P.l[k] < lo) lo = P.l[k]; } return hi - lo; }

const toArr = a => Array.from(a, x => x === x ? x : null);
const API = { prep, sma, ema, rma, atr, rsi, stdev, highest, lowest, linregEnd, trueRange, supertrend, chandelier, utbot, macd, adx, ichimoku, wavetrend, stochRsi, fisher, squeeze, nwEnvelope, avwap, choppiness, rvol, cci, lorentzian,
  pivots, structure, fvgs, orderBlocks, sweeps, divergences, SIGNALS, STATES, signal, state, agreement, indexAt, stream, shock, dayRangeSoFar, toArr };
if (typeof module !== 'undefined' && module.exports) module.exports = API; else root.ProInd = API;

/* ---------- Classic: catalogue entries, so each one appears in Indicators like any other ---------- */
if (typeof INDS !== 'undefined'){
  const A = toArr, col = (v, up, dn) => v >= 0 ? up : dn;
  const hist = (t, arr, f) => t.map((x, i) => arr[i] === arr[i] && arr[i] != null ? { time: x.time, value: arr[i], color: f(arr[i], i) } : null).filter(Boolean);
  const PRO = [
    { id: 'pro_wt', label: 'WaveTrend (LazyBear)', kind: 'osc', range: [-100, 100],
      note: 'A smoothed measure of how far price sits from its own average, in units of its usual wander. Above +53 it is stretched up, below −53 stretched down. The research court tested the cross at an extreme as a signal: see the Lab for its verdict.',
      def: { on: false, n1: 10, n2: 21, levels: '-60,-53,53,60', target: 'p1' }, params: [{ k: 'n1', kind: 'num', min: 2, max: 100, label: 'Channel' }, { k: 'n2', kind: 'num', min: 2, max: 100, label: 'Average' }],
      parts: [{ key: 'a', label: 'WT 1', color: '#4FD8F7' }, { key: 'b', label: 'WT 2', color: '#FFB648' }],
      build(ctx, c){ const w = wavetrend(prep(ctx.v), c.n1, c.n2); return [{ key: 'a', data: ctx.line(A(w.wt1)) }, { key: 'b', data: ctx.line(A(w.wt2)) }]; } },
    { id: 'pro_srsi', label: 'Stochastic RSI', kind: 'osc', range: [0, 100], fixed: true,
      note: 'Where RSI sits inside its own recent range. Faster than RSI and noisier; 20 and 80 are the usual lines.',
      def: { on: false, rl: 14, sl: 14, k: 3, d: 3, levels: '20,80', target: 'p1' }, params: [{ k: 'rl', kind: 'num', min: 2, max: 100, label: 'RSI' }, { k: 'sl', kind: 'num', min: 2, max: 100, label: 'Stochastic' }, { k: 'k', kind: 'num', min: 1, max: 20, label: '%K' }, { k: 'd', kind: 'num', min: 1, max: 20, label: '%D' }],
      parts: [{ key: 'k', label: '%K', color: '#4FD8F7' }, { key: 'd', label: '%D', color: '#FFB648' }],
      build(ctx, c){ const s = stochRsi(prep(ctx.v), c.rl, c.sl, c.k, c.d); return [{ key: 'k', data: ctx.line(A(s.k)) }, { key: 'd', data: ctx.line(A(s.d)) }]; } },
    { id: 'pro_fisher', label: 'Fisher Transform (Ehlers)', kind: 'osc',
      note: 'Reshapes price position inside its range so that extremes stand out as sharp peaks. Beyond ±1.5 is unusual.',
      def: { on: false, len: 10, levels: '-1.5,0,1.5', target: 'p2' }, params: [{ k: 'len', kind: 'num', min: 2, max: 100, label: 'Period' }],
      parts: [{ key: 'f', label: 'Fisher', color: '#4FD8F7' }, { key: 't', label: 'Trigger', color: '#FF6B7A' }],
      build(ctx, c){ const f = fisher(prep(ctx.v), c.len); return [{ key: 'f', precision: 2, data: ctx.line(A(f.f)) }, { key: 't', precision: 2, data: ctx.line(A(f.trig)) }]; } },
    { id: 'pro_chop', label: 'Choppiness Index', kind: 'osc', range: [0, 100], fixed: true,
      note: 'How much of the recent movement was noise. Above about 61 the market is chopping sideways; below about 38 it is trending. It says nothing about direction.',
      def: { on: false, len: 14, levels: '38.2,61.8', target: 'p2' }, params: [{ k: 'len', kind: 'num', min: 2, max: 100, label: 'Period' }],
      parts: [{ key: 'l', label: 'Choppiness', color: '#A78BFA' }], build(ctx, c){ return [{ key: 'l', precision: 1, data: ctx.line(A(choppiness(prep(ctx.v), c.len))) }]; } },
    { id: 'pro_rvol', label: 'Relative Volume', kind: 'osc',
      note: 'Each candle’s volume divided by the average of the last 20. Above 1.5 means unusual interest. Broker volume is tick count, not shares or contracts.',
      def: { on: false, len: 20, levels: '1,1.5', target: 'p3' }, params: [{ k: 'len', kind: 'num', min: 2, max: 200, label: 'Average of' }],
      parts: [{ key: 'h', label: 'Relative volume', color: '#4FD8F7' }],
      build(ctx, c){ const r = rvol(prep(ctx.v), c.len); return [{ key: 'h', type: 'hist', precision: 2, data: hist(ctx.v, r, v => v >= 1.5 ? 'rgba(255,182,72,0.85)' : 'rgba(79,216,247,0.45)') }]; } },
    { id: 'pro_lor', label: 'Lorentzian classification (nearest neighbours)', kind: 'osc', range: [-8, 8],
      note: 'A simplified version of the most downloaded free TradingView script. For each candle it finds the 8 most similar past candles and counts how many were followed by a rise four candles later. +8 = all rose, −8 = all fell. It uses only outcomes already known at the time. The research court measured it; see the Lab.',
      def: { on: false, levels: '0', target: 'p3' }, params: [],
      parts: [{ key: 'h', label: 'Vote', color: '#3DDC97' }],
      build(ctx){ const p = lorentzian(prep(ctx.v)).pred; return [{ key: 'h', type: 'hist', precision: 0, data: ctx.v.map((x, i) => ({ time: x.time, value: p[i], color: col(p[i], 'rgba(61,220,151,0.7)', 'rgba(255,107,122,0.7)') })) }]; } },
    { id: 'pro_ce', label: 'Chandelier Exit', kind: 'price',
      note: 'A trailing stop hung from the highest high (or lowest low) of the last 22 candles, three ATRs away. Only the side in force is drawn.',
      def: { on: false, len: 22, mult: 3, target: 'main' }, params: [{ k: 'len', kind: 'num', min: 2, max: 200, label: 'Period' }, { k: 'mult', kind: 'num', min: 0.5, max: 10, step: 0.5, label: 'ATR ×' }],
      parts: [{ key: 'l', label: 'Stop under price', color: '#3DDC97' }, { key: 's', label: 'Stop over price', color: '#FF6B7A' }],
      build(ctx, c){ const e = chandelier(prep(ctx.v), c.len, c.mult); return [{ key: 'l', data: ctx.line(Array.from(e.long, (x, i) => e.dir[i] > 0 && x === x ? x : null)) }, { key: 's', data: ctx.line(Array.from(e.short, (x, i) => e.dir[i] < 0 && x === x ? x : null)) }]; } },
    { id: 'pro_nw', label: 'Nadaraya–Watson envelope (no repaint)', kind: 'price',
      note: 'A kernel-smoothed centre line with bands three average errors away. The popular version redraws its own past; this one reads closed candles only, so it shows what was knowable at the time.',
      def: { on: false, h: 8, mult: 3, target: 'main' }, params: [{ k: 'h', kind: 'num', min: 2, max: 50, label: 'Smoothness' }, { k: 'mult', kind: 'num', min: 0.5, max: 6, step: 0.5, label: 'Band ×' }],
      parts: [{ key: 'u', label: 'Upper', color: '#FF6B7A' }, { key: 'm', label: 'Centre', color: '#8FA3C8' }, { key: 'l', label: 'Lower', color: '#3DDC97' }],
      build(ctx, c){ const e = nwEnvelope(prep(ctx.v), c.h, c.mult); return [{ key: 'u', data: ctx.line(A(e.up)) }, { key: 'm', data: ctx.line(A(e.mid)) }, { key: 'l', data: ctx.line(A(e.dn)) }]; } },
    { id: 'pro_avwap', label: 'Anchored VWAP with bands', kind: 'price',
      note: 'The volume-weighted average price since the start of the day, week or month, with bands one and two standard deviations away. Broker volume is tick count.',
      def: { on: false, period: 'week', target: 'main' }, params: [{ k: 'period', kind: 'sel', opts: [['day', 'Day'], ['week', 'Week'], ['month', 'Month']], label: 'Anchor' }],
      parts: [{ key: 'v', label: 'VWAP', color: '#FFB648' }, { key: 'u1', label: '+1 sd', color: '#8FA3C8' }, { key: 'l1', label: '−1 sd', color: '#8FA3C8' }, { key: 'u2', label: '+2 sd', color: '#5C6F92' }, { key: 'l2', label: '−2 sd', color: '#5C6F92' }],
      build(ctx, c){ const e = avwap(prep(ctx.v), c.period); return ['v', 'u1', 'l1', 'u2', 'l2'].map(k => ({ key: k, data: ctx.line(A(e[k])) })); } },
  ];
  for (const d of PRO){ if (typeof IND_BY_ID !== 'undefined' && IND_BY_ID[d.id]) continue; INDS.push(d); if (typeof IND_BY_ID !== 'undefined') IND_BY_ID[d.id] = d; }
}
})(typeof window !== 'undefined' ? window : globalThis);
