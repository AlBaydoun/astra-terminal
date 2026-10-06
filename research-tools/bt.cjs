// Research backtester: closed-candle signals, next-open entry, full spread paid,
// stop-before-target inside one candle (pessimistic), one position per instrument,
// random-entry benchmark with identical exits, two halves of history.
const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, 'rdata');
const quotes = JSON.parse(fs.readFileSync(path.join(DATA, 'quotes.json'))).quotes || [];
// Cost model: the account's measured in-session spreads (broker.js, 'pro') x1.5 safety; EU/AU indices x2
// (their snapshot was taken out of hours); never below a snapshot taken while the market was open.
const SNAP = Object.fromEntries(quotes.map(q => [q.symbol, { sp: Math.max(0, q.ask - q.bid), px: q.bid }]));
const CLASS_PCT = { indices: 0.009, gold: 0.006, energy: 0.028, crypto: 0.050, forex: 0.002 };
const OFF_HOURS = /^(DE40|EU50|FR40|UK100|AU200)/;
const SPREAD = new Proxy({}, { get(_, sym){
  const s = SNAP[sym]; if (!s) return 0;
  const g = GROUP(sym), typical = s.px * CLASS_PCT[g] / 100 * (OFF_HOURS.test(sym) ? 2 : 1.5);
  return OFF_HOURS.test(sym) ? typical : Math.max(typical, s.sp);
} });
const GROUP = s => /^(US100|US30|US500|DE40|EU50|FR40|UK100|AU200|JP225)/.test(s) ? 'indices' : /^(XAU|XAG)/.test(s) ? 'gold'
  : /^(WTI|BRENT)/.test(s) ? 'energy' : /^(BTC|ETH|SOL)/.test(s) ? 'crypto' : 'forex';
const SYMS = 'US100.s US30.s US500.s DE40.s EU50.s FR40.s UK100.s AU200.s JP225.s XAUUSD.s XAGUSD.s EURUSD.s GBPUSD.s USDJPY.s AUDUSD.s USDCAD.s USDCHF.s EURJPY.s GBPJPY.s WTI.s BRENT.s BTCUSD.s ETHUSD.s SOLUSD.s'.split(' ');

const cache = {};
function agg(c, sec){ const out = []; let cur = null, slot = -1; for (const x of c){ const s = Math.floor(x.t / sec) * sec; if (s !== slot){ if (cur) out.push(cur); cur = { t: s, o: x.o, h: x.h, l: x.l, c: x.c, v: x.v }; slot = s; } else { cur.h = Math.max(cur.h, x.h); cur.l = Math.min(cur.l, x.l); cur.c = x.c; cur.v += x.v; } } if (cur) out.push(cur); return out; }
function load(sym, tf){
  if (tf === '4h' || tf === '1d'){ const k = sym + tf; if (cache[k]) return cache[k]; return cache[k] = agg(load(sym, '1h'), tf === '4h' ? 14400 : 86400); }
  const k = sym + tf; if (cache[k]) return cache[k];
  const raw = JSON.parse(fs.readFileSync(path.join(DATA, sym + '_' + tf + '.json')));
  return cache[k] = raw.map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] }));
}
// ---- indicators (arrays aligned with candles) ----
function ema(a, n){ const k = 2 / (n + 1), out = new Array(a.length).fill(null); let e = null; for (let i = 0; i < a.length; i++){ e = e == null ? a[i] : a[i] * k + e * (1 - k); if (i >= n - 1) out[i] = e; } return out; }
function sma(a, n){ const out = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++){ s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; } return out; }
function atr(c, n){ const tr = c.map((x, i) => i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l); const out = new Array(c.length).fill(null); let a = null; for (let i = 0; i < c.length; i++){ a = a == null ? tr[i] : (a * (n - 1) + tr[i]) / n; if (i >= n) out[i] = a; } return out; }
function rsi(a, n){ const out = new Array(a.length).fill(null); let g = 0, l = 0; for (let i = 1; i < a.length; i++){ const d = a[i] - a[i - 1]; const up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n){ g += up / n; l += dn / n; if (i === n) out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } } return out; }
function adx(c, n){ const out = new Array(c.length).fill(null); let tr = 0, pd = 0, md = 0, ad = null; for (let i = 1; i < c.length; i++){ const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l; const p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0; const t = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)); tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m; const pdi = 100 * pd / (tr || 1e-12), mdi = 100 * md / (tr || 1e-12); const dx = 100 * Math.abs(pdi - mdi) / ((pdi + mdi) || 1e-12); ad = ad == null ? dx : (ad * (n - 1) + dx) / n; if (i >= 2 * n) out[i] = ad; } return out; }

// ---- simulate one strategy on one instrument ----
// strat.signal(ctx, i) -> null | { dir, sl, tp, maxBars }   (read on CLOSED bar i, enter at open i+1)
function simulate(strat, sym, tf, opts = {}){
  const c = load(sym, tf); const ctx = strat.prep(c, sym, tf); const sp = (SPREAD[sym] || 0) * (+process.env.COSTX || 1);
  const trades = []; let busyUntil = -1;
  for (let i = strat.warmup || 220; i < c.length - 2; i++){
    if (i <= busyUntil) continue;
    const s = strat.signal(ctx, i); if (!s) continue;
    const tr = run(c, i, s, sp); if (!tr) continue;
    tr.sym = sym; tr.tf = tf; tr.t = c[i + 1].t; trades.push(tr); busyUntil = tr.exitIdx;
  }
  return trades;
}
function run(c, i, s, sp){
  const e = c[i + 1].o, dir = s.dir;
  // levels are expressed as distances from the entry (the signal bar defines them)
  const stopDist = s.stopDist, tgtDist = s.tgtDist;
  if (!(stopDist > 0)) return null;
  const sl = e - dir * stopDist, tp = tgtDist ? e + dir * tgtDist : null;
  const maxBars = s.maxBars || 48;
  let exit = null, j;
  for (j = i + 1; j < Math.min(c.length, i + 1 + maxBars); j++){
    const b = c[j];
    const hitS = dir > 0 ? b.l <= sl : b.h >= sl;
    const hitT = tp != null && (dir > 0 ? b.h >= tp : b.l <= tp);
    if (hitS){ exit = j === i + 1 && (dir > 0 ? b.o <= sl : b.o >= sl) ? b.o : sl; break; }   // stop first if both (pessimistic)
    if (hitT){ exit = tp; break; }
  }
  if (exit == null){ j = Math.min(c.length - 1, i + maxBars); exit = c[j].c; }
  const r = ((exit - e) * dir - sp) / stopDist;
  return { r, exitIdx: j, dir, entry: e, stopDist, atrAtEntry: s.atr || null, tgtRatio: tgtDist ? tgtDist / stopDist : null, maxBars };
}
// ---- random benchmark: same instruments, same count, same directions, same exits (in ATR terms) ----
function randomBench(strat, trades, tf, seeds = 40){
  const bySym = {}; for (const t of trades) (bySym[t.sym] = bySym[t.sym] || []).push(t);
  const all = [];
  for (let s = 0; s < seeds; s++){
    let seed = 12345 + s * 7919; const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    for (const [sym, ts] of Object.entries(bySym)){
      const c = load(sym, tf), A = atr(c, 14), sp = SPREAD[sym] || 0;
      for (const t of ts){
        const i = 220 + Math.floor(rnd() * (c.length - 300));
        if (!A[i]) continue;
        // same exit shape as the real trade: stop/target in multiples of the same ATR ratio
        const ratio = t.stopDist / (t.atrAtEntry || A[i]);
        const sd = ratio * A[i];
        const tr = run(c, i, { dir: t.dir, stopDist: sd, tgtDist: t.tgtRatio ? t.tgtRatio * sd : null, maxBars: t.maxBars }, sp);
        if (tr) all.push(tr.r);
      }
    }
  }
  return stats(all.map(r => ({ r })));
}
function stats(trades){
  const n = trades.length; if (!n) return { n: 0 };
  let w = 0, gw = 0, gl = 0, net = 0, peak = 0, dd = 0, eq = 0;
  for (const t of trades){ net += t.r; if (t.r > 0){ w++; gw += t.r; } else gl -= t.r; eq += t.r; peak = Math.max(peak, eq); dd = Math.max(dd, peak - eq); }
  return { n, winRate: w / n * 100, pf: gl ? gw / gl : (gw ? Infinity : 0), netR: net, avgR: net / n, maxDdR: dd };
}
function evaluate(strat, syms, tf){
  let all = [];
  const per = [];
  for (const s of syms){
    try { const tr = simulate(strat, s, tf); all = all.concat(tr); per.push(Object.assign({ name: s.replace(/\.s$/, ''), group: GROUP(s) }, stats(tr))); } catch(e){ /* missing data */ }
  }
  all.sort((a, b) => a.t - b.t);
  const mid = all.length ? (all[0].t + all[all.length - 1].t) / 2 : 0;
  const tot = stats(all), h1 = stats(all.filter(t => t.t < mid)), h2 = stats(all.filter(t => t.t >= mid));
  const rnd = randomBench(strat, all, tf);
  return { tot, h1, h2, rnd, per, trades: all, period: all.length ? new Date(all[0].t * 1000).toISOString().slice(0, 10) + ' – ' + new Date(all[all.length - 1].t * 1000).toISOString().slice(0, 10) : '' };
}
module.exports = { load, ema, sma, atr, rsi, adx, simulate, evaluate, stats, SYMS, GROUP, SPREAD };
