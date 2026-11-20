/* Timurila research run 5 — strategy families, tested on every instrument the account offers.

   Every rule below is taken as published, with its textbook settings, and is NOT tuned here.
   Each one stands in the same court:
     · signals read on a CLOSED candle, entry at the next open, the spread paid (x1.5 for safety);
     · result in R = the trade's net return divided by the instrument's own ATR(20) at entry;
     · BASELINE = the exact average of every possible entry on the same instrument, in the same
       direction, held for the same number of candles. A rule only counts for what it earns ABOVE that
       (so a long-only share rule gets no credit for the market simply going up);
     · significance on MONTHLY totals of that excess, because trades on related instruments
       cluster in time and are not independent;
     · both halves of history, double spread, and an assumed overnight financing charge
       (the bridge does not report swap rates, so 0.02 % of the position per night is ASSUMED).
   Read-only: it reads ./data (made by fetch.cjs) and writes results.json / results.js. */
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const M = L.meta();
const FIN_ASSUMED = 0.0002;
const FLOOR = { indices: 0.00009, metals: 0.00006, energy: 0.00028, crypto: 0.0005, forex: 0.00002, shares: 0.0005, other: 0.0005 };

/* ---------- universe and costs ---------- */
const SYMS = M.symbols.filter(s => L.has(s, '1d') && L.load(s, '1d').length >= 300);
const GROUPS = {}; for (const s of SYMS) (GROUPS[L.groupOf(s)] = GROUPS[L.groupOf(s)] || []).push(s);
const rawSpread = s => { const q = M.quotes[s]; if (!q || !(q.bid > 0) || !(q.ask > q.bid)) return null; return (q.ask - q.bid) / ((q.ask + q.bid) / 2); };
const median = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const GROUP_MED = {}; for (const g in GROUPS) GROUP_MED[g] = median(GROUPS[g].map(rawSpread).filter(x => x != null && x < 0.02)) || FLOOR[g];
const COST = {};
for (const s of SYMS){ const g = L.groupOf(s); let sp = rawSpread(s); if (sp == null || sp > 5 * GROUP_MED[g]) sp = GROUP_MED[g]; COST[s] = Math.max(sp, FLOOR[g]) * 1.5; }

/* ---------- one instrument, prepared ---------- */
const PREP = {};
function prep(sym, tf){
  const k = sym + '|' + tf; if (PREP[k]) return PREP[k];
  const c = L.load(sym, tf), n = c.length, g = L.groupOf(sym), A = L.atr(c, 20), lim = g === 'shares' ? 0.4 : 0.6;
  const P = new Int32Array(n + 1);                       /* P[k] = jumps (splits / bad ticks) among candles 0..k-1 */
  for (let i = 0; i < n; i++){ const j = i > 0 && (Math.abs(Math.log(c[i].c / c[i - 1].c)) > lim || Math.abs(Math.log(c[i].o / c[i - 1].c)) > lim); P[i + 1] = P[i] + (j ? 1 : 0); }
  return PREP[k] = { sym, g, tf, c, n, cl: c.map(b => b.c), risk: c.map((b, i) => A[i] ? A[i] / b.c : null), P, cost: COST[sym],
    nightsPerBar: tf === '1d' ? 1 : tf === '4h' ? 1 / 6 : 1 / 24, base: {} };
}
const clean = (S, a, b) => S.P[b + 1] - S.P[a + 1] === 0;   /* no jump in candles a+1..b */

/* signal on closed candle i, in at open i+1, out at the open after candle x */
function trade(S, i, x, dir, atClose){
  if (x <= i || i + 1 >= S.n || !S.risk[i]) return null;
  const xi = atClose ? x : Math.min(x + 1, S.n - 1), e = S.c[i + 1].o, out = atClose ? S.c[x].c : x + 1 < S.n ? S.c[x + 1].o : S.c[S.n - 1].c;
  if (!clean(S, i, xi)) return null;
  return { sym: S.sym, g: S.g, S, t: S.c[i + 1].t, dir, h: x - i, gross: dir * (out / e - 1), risk: S.risk[i], nights: (x - i) * S.nightsPerBar, cost: S.cost };
}
/* exact expectation of a random long entry held h candles, in R, and the mean of 1/risk (for the cost part) */
function baseline(S, h){
  if (S.base[h]) return S.base[h];
  let sg = 0, si = 0, m = 0, up = 0;
  for (let i = 25; i + h + 1 < S.n; i++){ if (!S.risk[i] || !clean(S, i, i + h + 1)) continue; const g = S.c[i + h + 1].o / S.c[i + 1].o - 1; if (g > 0) up++; sg += g / S.risk[i]; si += 1 / S.risk[i]; m++; }
  return S.base[h] = m ? { bg: sg / m, inv: si / m, pUp: up / m } : { bg: 0, inv: 0, pUp: 0.5 };
}
const rOf = (t, cx, fin) => (t.gross - t.cost * cx - fin * t.nights) / t.risk;
function bOf(t, cx, fin){
  if (t.peers){ let s = 0; for (const p of t.peers) s += rOf(p, cx, fin); return s / t.peers.length; }
  if (t.bfix) return t.bfix.bg - (t.cost * cx + fin * t.nights) * t.bfix.inv;   /* a rule with its own like-for-like baseline */
  const b = baseline(t.S, t.h); return t.dir * b.bg - (t.cost * cx + fin * t.nights) * b.inv;
}

/* ---------- the rules ---------- */
/* 1 · Trend breakout (Donchian 55 in, 20 out — the "Turtle" long-term system; disaster stop 3 ATR on the close) */
function trend55(S){
  const out = [], c = S.c, hh55 = L.highest(c, 55, 'h'), ll55 = L.lowest(c, 55, 'l'), hh20 = L.highest(c, 20, 'h'), ll20 = L.lowest(c, 20, 'l');
  let pos = 0, ei = -1, stop = 0;
  for (let i = 60; i < S.n - 1; i++){
    const x = c[i].c;
    if (!pos){ if (!S.risk[i]) continue;
      if (x > hh55[i - 1]){ pos = 1; ei = i; stop = x * (1 - 3 * S.risk[i]); } else if (x < ll55[i - 1]){ pos = -1; ei = i; stop = x * (1 + 3 * S.risk[i]); } }
    else if ((pos > 0 && (x < ll20[i - 1] || x < stop)) || (pos < 0 && (x > hh20[i - 1] || x > stop))){ const t = trade(S, ei, i, pos); if (t) out.push(t); pos = 0; }
  }
  if (pos){ const t = trade(S, ei, S.n - 1, pos); if (t) out.push(t); }
  return out;
}
/* 2 · Time-series momentum: side = sign of the last 12 months, looked at once a week (Moskowitz, Ooi, Pedersen 2012) */
function tsmom(S){
  const out = []; let pos = 0, ei = -1;
  for (let i = 252; i < S.n - 1; i += 5){
    const s = S.cl[i] > S.cl[i - 252] ? 1 : -1;
    if (s !== pos){ if (pos){ const t = trade(S, ei, i, pos); if (t) out.push(t); } pos = s; ei = i; }
  }
  if (pos){ const t = trade(S, ei, S.n - 1, pos); if (t) out.push(t); }
  return out;
}
/* 3 · Short-term snap-back inside a trend (Connors RSI-2): above the 200-day average and RSI(2) < 10 -> buy,
       out on a close above the 5-day average or after 10 days. Mirror image for the short side. */
function rsi2(side){ return S => {
  const out = [], r = L.rsi(S.cl, 2), s200 = L.sma(S.cl, 200), s5 = L.sma(S.cl, 5); let pos = 0, ei = -1;
  for (let i = 200; i < S.n - 1; i++){
    const x = S.cl[i];
    if (!pos){ if (r[i] == null || s200[i] == null) continue;
      if (side >= 0 && x > s200[i] && r[i] < 10){ pos = 1; ei = i; } else if (side <= 0 && x < s200[i] && r[i] > 90){ pos = -1; ei = i; } }
    else if ((pos > 0 ? x > s5[i] : x < s5[i]) || i - ei >= 10){ const t = trade(S, ei, i, pos); if (t) out.push(t); pos = 0; }
  }
  return out; }; }
/* 4 · Turn of the month: hold from the last trading day through the third day of the new month (Lakonishok & Smidt; McConnell & Xu) */
const ym = t => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
function tom(S){
  const out = [];
  for (let i = 30; i < S.n - 5; i++) if (ym(S.c[i].t) !== ym(S.c[i + 1].t)){ const t = trade(S, i - 1, i + 3, 1); if (t) out.push(t); }
  return out;
}
/* 5 · Share rotation: each month end rank every share by its 6-month move (skipping the last month), hold the 10 strongest
       for a month (Jegadeesh & Titman). The baseline here is the average of ALL eligible shares over the same month. */
function rotation(syms){
  const maps = syms.map(s => { const S = prep(s, '1d'), m = {}; for (let i = 0; i < S.n - 1; i++) if (ym(S.c[i].t) !== ym(S.c[i + 1].t)) m[ym(S.c[i].t)] = i; return { S, m }; });
  const months = [...new Set(maps.flatMap(x => Object.keys(x.m).map(Number)))].sort((a, b) => a - b), top = [], bottom = [];
  for (const K of months){
    const cand = [];
    for (const { S, m } of maps){ const i = m[K], j = m[K + 1]; if (i == null || j == null || i < 150 || !clean(S, i - 147, i)) continue;
      const t = trade(S, i, j, 1); if (t) cand.push({ mom: S.cl[i - 21] / S.cl[i - 147] - 1, t }); }
    if (cand.length < 40) continue;
    cand.sort((a, b) => b.mom - a.mom);
    const longs = cand.map(x => x.t), shorts = longs.map(t => Object.assign({}, t, { dir: -1, gross: -t.gross }));
    for (let k = 0; k < 10; k++){ top.push(Object.assign({}, longs[k], { peers: longs })); bottom.push(Object.assign({}, shorts[shorts.length - 1 - k], { peers: shorts })); }
  }
  return { top, bottom };
}
/* 6 · Pairs: two close relatives; when their ratio sits 2 standard deviations from its 60-day average, bet on the way back.
       Out at 0.5, after 20 days, or stopped at 3.5. Both legs pay their spread. R = one standard deviation of the ratio. */
function pairSeries(a, b){
  if (!L.has(a, '1d') || !L.has(b, '1d')) return null;
  const A = L.load(a, '1d'), B = L.load(b, '1d'), day = t => Math.floor(t / 86400), mb = new Map(B.map(x => [day(x.t), x])), c = [];
  for (const x of A){ const y = mb.get(day(x.t)); if (y) c.push({ t: x.t, o: x.o / y.o, h: x.c / y.c, l: x.c / y.c, c: x.c / y.c }); }
  if (c.length < 300) return null;
  const n = c.length, lr = c.map(x => Math.log(x.c)), z = new Array(n).fill(null), risk = new Array(n).fill(null);
  for (let i = 59; i < n; i++){ let s = 0, q = 0; for (let k = i - 59; k <= i; k++){ s += lr[k]; q += lr[k] * lr[k]; } const mu = s / 60, sd = Math.sqrt(Math.max(1e-12, q / 60 - mu * mu)); if (sd > 2e-4){ z[i] = (lr[i] - mu) / sd; risk[i] = sd; } }
  return { sym: L.base(a) + '/' + L.base(b), g: 'pairs', tf: '1d', c, n, cl: c.map(x => x.c), risk, z, P: new Int32Array(n + 1), cost: (COST[a] || 0) + (COST[b] || 0), nightsPerBar: 2, base: {} };
}
function pairs(S){
  const out = []; let pos = 0, ei = -1;
  for (let i = 60; i < S.n - 1; i++){
    const z = S.z[i]; if (z == null) continue;
    if (!pos){ if (z > 2 && z < 3.5){ pos = -1; ei = i; } else if (z < -2 && z > -3.5){ pos = 1; ei = i; } }
    else if (Math.abs(z) < 0.5 || Math.abs(z) > 3.5 || i - ei >= 20){ const t = trade(S, ei, i, pos); if (t) out.push(t); pos = 0; }
  }
  return out;
}
/* 7 · Over-stretched snap-back on 4-hour candles — the idea ASTRA's research run 2 called proven on indices
       (close more than 2.5 ATR from its 20-candle average -> back over the next 6 candles), re-tested here on
       seven years of 4-hour history, most of which that run never saw. */
function snap4h(S){
  const out = [], s20 = L.sma(S.cl, 20), A = L.atr(S.c, 14); let busy = -1;
  for (let i = 30; i < S.n - 1; i++){
    if (i <= busy || !A[i] || s20[i] == null) continue;
    const d = (S.cl[i] - s20[i]) / A[i];
    if (Math.abs(d) > 2.5){ const t = trade(S, i, i + 6, d > 0 ? -1 : 1); if (t){ out.push(t); busy = i + 6; } }
  }
  return out;
}

/* ---------- the court ---------- */
function stat(tr, cx, fin){
  const n = tr.length; if (!n) return { n: 0 };
  let net = 0, gw = 0, gl = 0, w = 0, ex = 0, bs = 0, hit = 0, bh = 0;
  for (const t of tr){ const r = rOf(t, cx, fin), b = bOf(t, cx, fin); net += r; bs += b; ex += r - b; if (r > 0){ w++; gw += r; } else gl -= r;
    if (t.gross > 0) hit++; if (t.peers) bh += t.peers.filter(p => p.gross > 0).length / t.peers.length; else if (t.bfix) bh += t.bfix.pHit; else { const pu = baseline(t.S, t.h).pUp; bh += t.dir > 0 ? pu : 1 - pu; } }
  return { n, avgR: net / n, pf: gl ? gw / gl : null, win: w / n * 100, baseR: bs / n, exR: ex / n, netR: net, hit: hit / n * 100, baseHit: bh / n * 100 };
}
const r2 = x => x == null || !isFinite(x) ? null : Math.round(x * 1000) / 1000;
function judge(id, family, name, universe, rule, source, tr, opt = {}){
  tr = tr.filter(Boolean).sort((a, b) => a.t - b.t);
  const res = { id, family, name, universe, rule, source, n: tr.length };
  if (tr.length < 30){ res.verdict = 'not enough trades'; res.checks = []; return res; }
  const base = stat(tr, 1, 0), c2 = stat(tr, 2, 0), fin = stat(tr, 1, FIN_ASSUMED);
  const k0 = ym(tr[0].t), k1 = ym(tr[tr.length - 1].t), mEx = new Array(k1 - k0 + 1).fill(0), mR = new Array(k1 - k0 + 1).fill(0);
  for (const t of tr){ const k = ym(t.t) - k0; mEx[k] += rOf(t, 1, 0) - bOf(t, 1, 0); mR[k] += rOf(t, 1, 0); }
  const mu = mEx.reduce((a, b) => a + b, 0) / mEx.length, sd = Math.sqrt(mEx.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, mEx.length - 1));
  const tM = sd ? mu / sd * Math.sqrt(mEx.length) : 0;
  const cut = opt.cutT || (tr[0].t + tr[tr.length - 1].t) / 2, h1 = stat(tr.filter(t => t.t < cut), 1, 0), h2 = stat(tr.filter(t => t.t >= cut), 1, 0);
  const by = {}; for (const t of tr){ const o = by[t.sym] = by[t.sym] || { n: 0, r: 0 }; o.n++; o.r += rOf(t, 1, 0); }
  const big = Object.values(by).filter(o => o.n >= 5), breadth = big.length >= 4 ? big.filter(o => o.r > 0).length / big.length : null;
  const tot = Math.abs(base.netR) || 1, topShare = Math.max(...Object.values(by).map(o => Math.abs(o.r))) / tot;
  const grp = {}; for (const t of tr) (grp[t.g] = grp[t.g] || []).push(t);
  const yr = {}; for (const t of tr){ const y = new Date(t.t * 1000).getUTCFullYear(); (yr[y] = yr[y] || []).push(t); }
  const cum = []; let a = 0, e = 0; for (let k = 0; k < mR.length; k++){ a += mR[k]; e += mEx[k]; cum.push([k0 + k, r2(a), r2(e)]); }
  const step = Math.max(1, Math.ceil(cum.length / 120));
  Object.assign(res, {
    avgR: r2(base.avgR), pf: r2(base.pf), win: r2(base.win), baseR: r2(base.baseR), exR: r2(base.exR), netR: r2(base.netR),
    tMonthly: r2(tM), months: mEx.length, monthsAhead: mEx.filter(x => x > 0).length, monthsTraded: mEx.filter(x => x !== 0).length,
    from: new Date(tr[0].t * 1000).toISOString().slice(0, 10), to: new Date(tr[tr.length - 1].t * 1000).toISOString().slice(0, 10),
    cutLabel: opt.cutLabel || null,
    h1: { n: h1.n, avgR: r2(h1.avgR), exR: r2(h1.exR), hit: r2(h1.hit), baseHit: r2(h1.baseHit) }, h2: { n: h2.n, avgR: r2(h2.avgR), exR: r2(h2.exR), hit: r2(h2.hit), baseHit: r2(h2.baseHit) },
    hit: r2(base.hit), baseHit: r2(base.baseHit),
    cost2: { avgR: r2(c2.avgR), exR: r2(c2.exR), pf: r2(c2.pf) }, fin: { avgR: r2(fin.avgR), exR: r2(fin.exR) },
    breadth: r2(breadth), instruments: Object.keys(by).length, topShare: r2(topShare),
    avgHold: r2(tr.reduce((s, t) => s + t.h, 0) / tr.length),
    ...(rs => ({ worstR: r2(rs[0]), p05R: r2(rs[Math.floor(rs.length * 0.05)]), p95R: r2(rs[Math.floor(rs.length * 0.95)]), bestR: r2(rs[rs.length - 1]) }))(tr.map(t => rOf(t, 1, 0)).sort((a, b) => a - b)),
    long: (s => ({ n: s.n, avgR: r2(s.avgR), exR: r2(s.exR) }))(stat(tr.filter(t => t.dir > 0), 1, 0)),
    short: (s => ({ n: s.n, avgR: r2(s.avgR), exR: r2(s.exR) }))(stat(tr.filter(t => t.dir < 0), 1, 0)),
    groups: Object.fromEntries(Object.entries(grp).map(([g, x]) => { const s = stat(x, 1, 0); return [g, { n: s.n, avgR: r2(s.avgR), exR: r2(s.exR), pf: r2(s.pf) }]; })),
    years: Object.fromEntries(Object.entries(yr).map(([y, x]) => { const s = stat(x, 1, 0); return [y, { n: s.n, avgR: r2(s.avgR), exR: r2(s.exR) }]; })),
    curve: cum.filter((_, k) => k % step === 0 || k === cum.length - 1),
  });
  const checks = [
    ['Enough trades (100+)', res.n >= 100, String(res.n)],
    ['Makes money after the spread', base.avgR > 0, (base.avgR >= 0 ? '+' : '') + base.avgR.toFixed(3) + 'R a trade'],
    ['Beats random entries (monthly t of 3+)', tM >= 3, 't ' + tM.toFixed(1) + ' · ' + (base.exR >= 0 ? '+' : '') + base.exR.toFixed(3) + 'R above random'],
    ['Holds in both halves', h1.exR > 0 && h2.exR > 0, (h1.exR >= 0 ? '+' : '') + (h1.exR || 0).toFixed(3) + ' and ' + (h2.exR >= 0 ? '+' : '') + (h2.exR || 0).toFixed(3)],
    ['Still pays at double spread', c2.avgR > 0 && c2.exR > 0, (c2.avgR >= 0 ? '+' : '') + c2.avgR.toFixed(3) + 'R'],
    ['Survives 0.02% a night financing (assumed)', fin.avgR > 0, (fin.avgR >= 0 ? '+' : '') + fin.avgR.toFixed(3) + 'R'],
    ['Not carried by one instrument', topShare < 0.4 || opt.narrow, Math.round(topShare * 100) + '% from the biggest'],
  ];
  if (breadth != null && !opt.noBreadth) checks.push(['Works on most instruments (55%+)', breadth >= 0.55, Math.round(breadth * 100) + '% of ' + big.length]);
  res.checks = checks.map(([label, pass, value]) => ({ label, pass: !!pass, value }));
  const all = res.checks.every(c => c.pass);
  res.verdict = all ? 'proven' : (tM >= 2 && h1.exR > 0 && h2.exR > 0 && base.avgR > 0 && c2.avgR > 0) ? 'leaning' : 'benched';
  return res;
}

/* ---------- run ---------- */
const macro = ['forex', 'metals', 'energy', 'indices', 'crypto'].flatMap(g => GROUPS[g] || []);
const shares = GROUPS.shares || [], indices = GROUPS.indices || [];
const each = (syms, tf, fn) => syms.flatMap(s => { try { return fn(prep(s, tf)); } catch(e){ return []; } });
const has4h = s => L.has(s, '4h') && L.load(s, '4h').length >= 500;
const RUN2_END = Date.UTC(2024, 9, 15) / 1000;      /* research run 2 used the two years to mid October 2026; before this date is unseen by it */
const tests = []; let RUN = 5;
const T = (...a) => { const r = judge(...a); r.run = RUN; tests.push(r); console.log((r.verdict || '').toUpperCase().padEnd(18), r.id.padEnd(22), 'n', String(r.n).padStart(6), 'avgR', String(r.avgR).padStart(7), 'base', String(r.baseR).padStart(7), 'ex', String(r.exR).padStart(7), 't', String(r.tMonthly).padStart(6), 'halves', r.h1 && r.h1.exR, r.h2 && r.h2.exR, 'x2', r.cost2 && r.cost2.avgR, 'fin', r.fin && r.fin.avgR, 'breadth', r.breadth); };

const SRC = { turtle: 'Donchian channel breakout, the "Turtle" long-term system (1983); Faith 2007', tsm: 'Moskowitz, Ooi & Pedersen, "Time series momentum", 2012',
  rsi: 'Connors & Alvarez, "Short Term Trading Strategies That Work", 2008', tom: 'Lakonishok & Smidt 1988; McConnell & Xu 2008',
  jt: 'Jegadeesh & Titman, "Returns to buying winners and selling losers", 1993', pr: 'Gatev, Goetzmann & Rouwenhorst, "Pairs trading", 2006', run2: 'ASTRA research run 2 (15 Oct 2026), re-tested independently' };

T('trend55_macro', 'Trend following', 'Trend breakout · 55-day', 'Forex, metals, energy, indices, crypto · daily', 'Buy a close above the 55-day high, sell a close below the 55-day low. Out when price closes through the 20-day level the other way.', SRC.turtle, each(macro, '1d', trend55));
T('trend55_shares', 'Trend following', 'Trend breakout · 55-day', 'Shares · daily', 'Buy a close above the 55-day high, sell a close below the 55-day low. Out when price closes through the 20-day level the other way.', SRC.turtle, each(shares, '1d', trend55));
T('tsmom_macro', 'Trend following', '12-month momentum', 'Forex, metals, energy, indices, crypto · daily', 'Long while the price is above where it was 12 months ago, short while below. Checked once a week.', SRC.tsm, each(macro, '1d', tsmom));
T('tsmom_shares', 'Trend following', '12-month momentum', 'Shares · daily', 'Long while the price is above where it was 12 months ago, short while below. Checked once a week.', SRC.tsm, each(shares, '1d', tsmom));
T('rsi2_long_shares', 'Dip buying', 'Dip in an uptrend · RSI-2', 'Shares · daily · long only', 'Above the 200-day average and RSI(2) under 10: buy. Out on a close above the 5-day average, or after 10 days.', SRC.rsi, each(shares, '1d', rsi2(1)));
T('rsi2_long_indices', 'Dip buying', 'Dip in an uptrend · RSI-2', 'Indices · daily · long only', 'Above the 200-day average and RSI(2) under 10: buy. Out on a close above the 5-day average, or after 10 days.', SRC.rsi, each(indices, '1d', rsi2(1)), { narrow: true });
T('rsi2_short_shares', 'Dip buying', 'Spike in a downtrend · RSI-2', 'Shares · daily · short only', 'Below the 200-day average and RSI(2) over 90: sell. Out on a close below the 5-day average, or after 10 days.', SRC.rsi, each(shares, '1d', rsi2(-1)));
T('rsi2_macro', 'Dip buying', 'Dip or spike with the trend · RSI-2', 'Forex, metals, energy, crypto · daily · both ways', 'With the 200-day trend, enter against a two-day extreme in RSI(2). Out at the 5-day average, or after 10 days.', SRC.rsi, each(macro.filter(s => L.groupOf(s) !== 'indices'), '1d', rsi2(0)));
T('tom_indices', 'Calendar', 'Turn of the month', 'Indices · daily · long only', 'Hold from the last trading day of the month through the third day of the new one.', SRC.tom, each(indices, '1d', tom), { narrow: true });
T('tom_shares', 'Calendar', 'Turn of the month', 'Shares · daily · long only', 'Hold from the last trading day of the month through the third day of the new one.', SRC.tom, each(shares, '1d', tom));
const rot = rotation(shares);
T('rotation_top', 'Share rotation', 'Hold the 10 strongest shares', 'Shares · monthly · long only', 'Each month end, rank every share by its last six months (skipping the latest month) and hold the ten strongest for a month. Compared with the average share over the same month.', SRC.jt, rot.top, { noBreadth: true });
T('rotation_bottom', 'Share rotation', 'Short the 10 weakest shares', 'Shares · monthly · short only', 'Each month end, short the ten weakest shares of the last six months for a month. Compared with shorting the average share.', SRC.jt, rot.bottom, { noBreadth: true });
const PAIRS = [['XAUUSD.s', 'XAGUSD.s'], ['BRENT.s', 'WTI.s'], ['US500.s', 'US100.s'], ['US500.s', 'US30.s'], ['DE40.s', 'EU50.s'], ['FR40.s', 'EU50.s'], ['EURUSD.s', 'GBPUSD.s'], ['AUDUSD.s', 'NZDUSD.s']].map(p => pairSeries(p[0], p[1])).filter(Boolean);
T('pairs', 'Pairs', 'Stretched pair comes back', PAIRS.map(p => p.sym).join(', ') + ' · daily', 'When the ratio of two close relatives is 2 standard deviations from its 60-day average, bet on the way back. Out at 0.5, after 20 days, or stopped at 3.5.', SRC.pr, PAIRS.flatMap(pairs), { narrow: true });
T('snap4h_indices', 'Snap-back', 'Over-stretched snap-back · 4h', 'Indices · 4-hour', 'Close more than 2.5 ATR from the 20-candle average: trade back toward it for 6 candles.', SRC.run2, each(indices.filter(has4h), '4h', snap4h), { cutT: RUN2_END, cutLabel: 'before / after 15 Oct 2024 (the earlier research only saw the part after)', narrow: true });
T('snap4h_other', 'Snap-back', 'Over-stretched snap-back · 4h', 'Forex, metals, energy, crypto · 4-hour', 'Close more than 2.5 ATR from the 20-candle average: trade back toward it for 6 candles.', SRC.run2, each(macro.filter(s => L.groupOf(s) !== 'indices' && has4h(s)), '4h', snap4h));

/* ================= ROUND 6 =================
   Two questions. (A) Does the one lead from round 5 — buying dips on indices — survive when its
   settings change and when the dip is defined in other well-known ways? A real effect should not
   live on one setting. (B) Six more published rules that round 5 did not cover, including two that
   need hourly candles and each market's own session hours (broker time: the US cash session opens
   inside the 16:00 candle, Europe's inside the 10:00 candle). Same court as before. */
RUN = 6;
const hourOf = t => new Date(t * 1000).getUTCHours(), dayOf = t => Math.floor(t / 86400);
function adxArr(c, n){ const out = new Array(c.length).fill(null); let tr = 0, pd = 0, md = 0, ad = null;
  for (let i = 1; i < c.length; i++){ const up = c[i].h - c[i - 1].h, dn = c[i - 1].l - c[i].l, p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0, t = Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c));
    tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m; const pdi = 100 * pd / (tr || 1e-12), mdi = 100 * md / (tr || 1e-12), dx = 100 * Math.abs(pdi - mdi) / ((pdi + mdi) || 1e-12);
    ad = ad == null ? dx : (ad * (n - 1) + dx) / n; if (i >= 2 * n) out[i] = ad; } return out; }
const sdArr = (cl, m, n) => cl.map((_, i) => { if (m[i] == null) return null; let v = 0; for (let k = i - n + 1; k <= i; k++) v += (cl[k] - m[i]) ** 2; return Math.sqrt(v / n); });

/* A · the dip rule, generalised: which dip, and how to leave */
function dip(S, o){
  const out = [], cl = S.cl, r = L.rsi(cl, 2), s200 = L.sma(cl, 200), s5 = L.sma(cl, 5), s20 = L.sma(cl, 20), sd20 = sdArr(cl, s20, 20); let pos = 0, ei = -1;
  for (let i = 200; i < S.n - 1; i++){ const x = cl[i], b = S.c[i];
    if (!pos){ if (s200[i] == null || (o.filter !== false && !(x > s200[i]))) continue;
      const trig = o.trigger === 'ibs' ? (b.h > b.l && (b.c - b.l) / (b.h - b.l) < 0.2) : o.trigger === 'down3' ? (cl[i] < cl[i - 1] && cl[i - 1] < cl[i - 2] && cl[i - 2] < cl[i - 3])
        : o.trigger === 'bb' ? (sd20[i] != null && x < s20[i] - 2 * sd20[i]) : (r[i] != null && r[i] < o.th);
      if (trig){ pos = 1; ei = i; } }
    else if (o.exit === 'sma5' ? (x > s5[i] || i - ei >= 10) : i - ei >= o.exit){ const t = trade(S, ei, i, 1); if (t) out.push(t); pos = 0; } }
  return out;
}
/* B1 · fade the opening gap: a daily open beyond yesterday's whole range, traded back until the close */
function gapFade(S){
  const out = [], c = S.c; let sg = 0, si = 0, m = 0, up = 0;
  for (let i = 25; i < S.n - 1; i++){ if (!S.risk[i - 1] || !clean(S, i - 1, i)) continue; const g = c[i].c / c[i].o - 1; sg += g / S.risk[i - 1]; si += 1 / S.risk[i - 1]; m++; if (g > 0) up++; }
  if (!m) return out; const bg = sg / m, inv = si / m, pu = up / m;
  for (let i = 25; i < S.n - 1; i++){ if (!S.risk[i - 1] || !clean(S, i - 1, i)) continue; const b = c[i], p = c[i - 1], dir = b.o > p.h ? -1 : b.o < p.l ? 1 : 0; if (!dir) continue;
    out.push({ sym: S.sym, g: S.g, S, t: b.t, dir, h: 0, gross: dir * (b.c / b.o - 1), risk: S.risk[i - 1], nights: 0, cost: S.cost, bfix: { bg: dir * bg, inv, pHit: dir > 0 ? pu : 1 - pu } }); }
  return out;
}
/* B2 · NR7: after the narrowest day of seven, trade the break of that day's high or low until the close (Crabel).
        Daily candles cannot say which side broke first on a day that broke BOTH. Leaving those days out would
        throw away exactly the trades that reversed, so they are kept and counted the PESSIMISTIC way: as whichever
        of the two possible trades did worse. Baseline: the same break-of-yesterday trade on EVERY day, same rule,
        so only what the quiet day adds is counted. */
function nr7(S){
  const out = [], c = S.c, G = { sg: 0, si: 0, m: 0, up: 0 };
  const brk = i => { const b = c[i], p = c[i - 1], u = b.h > p.h, d = b.l < p.l; if (!u && !d) return null;
    const lg = b.c / Math.max(b.o, p.h) - 1, sh = 1 - b.c / Math.min(b.o, p.l);
    return u && d ? (lg < sh ? { dir: 1, g: lg } : { dir: -1, g: sh }) : u ? { dir: 1, g: lg } : { dir: -1, g: sh }; };
  const ok = i => S.risk[i - 1] && clean(S, i - 1, i);
  for (let i = 25; i < S.n - 1; i++){ if (!ok(i)) continue; const k = brk(i); if (!k) continue; G.sg += k.g / S.risk[i - 1]; G.si += 1 / S.risk[i - 1]; G.m++; if (k.g > 0) G.up++; }
  if (!G.m) return out;
  for (let i = 25; i < S.n - 1; i++){ if (!ok(i)) continue; const j = i - 1, rj = c[j].h - c[j].l; let narrow = rj > 0; for (let k = j - 6; k < j && narrow; k++) if (c[k].h - c[k].l <= rj) narrow = false;
    if (!narrow) continue; const k = brk(i); if (!k) continue;
    out.push({ sym: S.sym, g: S.g, S, t: c[i].t, dir: k.dir, h: 0, gross: k.g, risk: S.risk[i - 1], nights: 0, cost: S.cost, bfix: { bg: G.sg / G.m, inv: G.si / G.m, pHit: G.up / G.m } }); }
  return out;
}
/* B3 · Bollinger fade in a quiet market: outside the 20-day, 2-deviation band while ADX(14) is under 20 -> back to the middle */
function bbFade(S){
  const out = [], cl = S.cl, s20 = L.sma(cl, 20), sd = sdArr(cl, s20, 20), ax = adxArr(S.c, 14); let pos = 0, ei = -1;
  for (let i = 40; i < S.n - 1; i++){ const x = cl[i];
    if (!pos){ if (sd[i] == null || ax[i] == null || ax[i] >= 20) continue; if (x < s20[i] - 2 * sd[i]){ pos = 1; ei = i; } else if (x > s20[i] + 2 * sd[i]){ pos = -1; ei = i; } }
    else if ((pos > 0 ? x >= s20[i] : x <= s20[i]) || i - ei >= 10){ const t = trade(S, ei, i, pos); if (t) out.push(t); pos = 0; } }
  return out;
}
/* B4 · weekly reversal on shares: buy last week's ten biggest losers, hold a week. Baseline: the average share that week. */
function reversal(syms){
  const wk = t => Math.floor((t / 86400 + 3) / 7), maps = syms.map(s => { const S = prep(s, '1d'), m = {}; for (let i = 0; i < S.n - 1; i++) if (wk(S.c[i].t) !== wk(S.c[i + 1].t)) m[wk(S.c[i].t)] = i; return { S, m }; });
  const weeks = [...new Set(maps.flatMap(x => Object.keys(x.m).map(Number)))].sort((a, b) => a - b), out = [];
  for (const K of weeks){ const cand = [];
    for (const { S, m } of maps){ const i = m[K], j = m[K + 1]; if (i == null || j == null || i < 30 || !clean(S, i - 5, i)) continue; const t = trade(S, i, j, 1); if (t) cand.push({ ret: S.cl[i] / S.cl[i - 5] - 1, t }); }
    if (cand.length < 40) continue; cand.sort((a, b) => a.ret - b.ret); const longs = cand.map(x => x.t); for (let k = 0; k < 10; k++) out.push(Object.assign({}, longs[k], { peers: longs })); }
  return out;
}
/* B5 · outside cash hours: buy at the cash close, sell just before the next cash open (hourly candles) */
function overnight(lastH, openH){ return S => { const out = [], c = S.c;
  for (let i = 30; i < S.n - 2; i++){ if (hourOf(c[i].t) !== lastH) continue; const d = dayOf(c[i].t); let j = i + 1; while (j < S.n && (dayOf(c[j].t) === d || hourOf(c[j].t) < openH)) j++;
    if (j >= S.n) break; if (dayOf(c[j].t) - d > 4) continue; const t = trade(S, i, j - 1, 1); if (t){ t.nights = dayOf(c[j].t) - d; out.push(t); } }
  return out; }; }
/* B6 · intraday momentum: the direction of the US morning (last cash close to 18:00 broker time) is traded for the last cash hour */
function intradayMom(S){ const out = [], c = S.c; let prev = null;
  for (let i = 30; i < S.n - 1; i++){ const h = hourOf(c[i].t), d = dayOf(c[i].t);
    if (h === 21 && prev != null && hourOf(c[i + 1].t) === 22 && dayOf(c[i + 1].t) === d){ let a = null; for (let k = i - 1; k >= Math.max(0, i - 6); k--) if (hourOf(c[k].t) === 17 && dayOf(c[k].t) === d){ a = c[k].c; break; }
      const dir = a == null ? 0 : a > prev ? 1 : a < prev ? -1 : 0; if (dir){ const t = trade(S, i, i + 1, dir, true); if (t){ t.nights = 0; out.push(t); } } }
    if (h === 22) prev = c[i].c; }
  return out; }

Object.assign(SRC, { ibs: 'Internal bar strength; Pagonidis, "The IBS effect", 2014', gap: 'Opening-gap fade; Connors & Raschke, "Street Smarts", 1995', nr7: 'Crabel, "Day Trading with Short Term Price Patterns and Opening Range Breakout", 1990',
  bb: 'Bollinger, "Bollinger on Bollinger Bands", 2001, with Wilder’s ADX as the quiet-market filter', rev: 'Lehmann 1990; Jegadeesh 1990 (short-term reversal)',
  night: 'Cooper, Cliff & Gulen, "Return differences between trading and non-trading hours", 2008', im: 'Gao, Han, Li & Zhou, "Market intraday momentum", 2018' });
const has1h = s => L.has(s, '1h') && L.load(s, '1h').length >= 3000, USI = indices.filter(s => /^US(500|100|30)$/.test(L.base(s)) && has1h(s)), EUI = indices.filter(s => /^(DE40|EU50|FR40|ES35|UK100)$/.test(L.base(s)) && has1h(s));

T('ibs_indices', 'Dip buying', 'Weak close in an uptrend · IBS', 'Indices · daily · long only', 'Above the 200-day average and the day closes in the bottom fifth of its own range: buy at the next open and hold one day.', SRC.ibs, each(indices, '1d', S => dip(S, { trigger: 'ibs', exit: 1 })), { narrow: true });
T('down3_indices', 'Dip buying', 'Three down days in an uptrend', 'Indices · daily · long only', 'Above the 200-day average and three lower closes in a row: buy. Out on a close above the 5-day average, or after 10 days.', SRC.rsi, each(indices, '1d', S => dip(S, { trigger: 'down3', exit: 'sma5' })), { narrow: true });
T('bb_indices', 'Dip buying', 'Below the lower band in an uptrend', 'Indices · daily · long only', 'Above the 200-day average and a close below the lower Bollinger band (20 days, 2 deviations): buy. Out on a close above the 5-day average, or after 10 days.', SRC.bb, each(indices, '1d', S => dip(S, { trigger: 'bb', exit: 'sma5' })), { narrow: true });
T('rsi2_4h_indices', 'Dip buying', 'Dip in an uptrend · RSI-2 · 4h', 'Indices · 4-hour · long only', 'The round 5 dip rule read on 4-hour candles: above the 200-candle average and RSI(2) under 10, out above the 5-candle average or after 10 candles.', SRC.rsi, each(indices.filter(has4h), '4h', S => dip(S, { th: 10, exit: 'sma5' })), { narrow: true });
T('gapfade_indices', 'Gaps', 'Fade the opening gap', 'Indices · daily', 'When the day opens beyond the whole of yesterday’s range, trade back toward it and close at the end of the day.', SRC.gap, each(indices, '1d', gapFade), { narrow: true });
T('gapfade_shares', 'Gaps', 'Fade the opening gap', 'Shares · daily', 'When the day opens beyond the whole of yesterday’s range, trade back toward it and close at the end of the day.', SRC.gap, each(shares, '1d', gapFade));
T('nr7_macro', 'Breakouts', 'Break of the quietest day · NR7', 'Forex, metals, energy, indices, crypto · daily', 'After the narrowest day of the last seven, trade the break of that day’s high or low and close at the end of the day. Compared with trading the break of any day.', SRC.nr7, each(macro, '1d', nr7));
T('nr7_shares', 'Breakouts', 'Break of the quietest day · NR7', 'Shares · daily', 'After the narrowest day of the last seven, trade the break of that day’s high or low and close at the end of the day. Compared with trading the break of any day.', SRC.nr7, each(shares, '1d', nr7));
T('bbfade_forex', 'Range trading', 'Band fade in a quiet market', 'Forex · daily', 'A close outside the Bollinger band (20 days, 2 deviations) while ADX(14) is under 20: trade back to the 20-day average. Out there, or after 10 days.', SRC.bb, each(GROUPS.forex || [], '1d', bbFade));
T('reversal_shares', 'Share rotation', 'Buy last week’s 10 biggest losers', 'Shares · weekly · long only', 'Each week end, buy the ten shares that fell most over the week and hold them for a week. Compared with the average share over the same week.', SRC.rev, reversal(shares), { noBreadth: true });
T('overnight_indices', 'Session hours', 'Hold outside cash hours', 'US and European indices · hourly · long only', 'Buy at the cash close and sell just before the next cash open. Compared with holding for the same number of hours at any time of day.', SRC.night, each(USI, '1h', overnight(22, 16)).concat(each(EUI, '1h', overnight(18, 10))), { narrow: true });
T('intraday_mom_us', 'Session hours', 'Morning direction into the last hour', 'US indices · hourly', 'If the US session is up from yesterday’s cash close by 18:00 broker time, buy for the last cash hour; if down, sell.', SRC.im, each(USI, '1h', intradayMom), { narrow: true });

/* the lead under other settings — every cell is reported, none is picked */
const grid = [];
for (const th of [5, 10, 15, 25]) for (const ex of ['sma5', 3, 5]){ const r = judge('g', '', '', '', '', '', each(indices, '1d', S => dip(S, { th, exit: ex })), { narrow: true });
  grid.push({ label: 'RSI(2) under ' + th + ' · ' + (ex === 'sma5' ? 'out above the 5-day average' : 'hold ' + ex + ' days'), base: th === 10 && ex === 'sma5', n: r.n, avgR: r.avgR, exR: r.exR, t: r.tMonthly, h1: r.h1 && r.h1.exR, h2: r.h2 && r.h2.exR, x2: r.cost2 && r.cost2.avgR }); }
{ const r = judge('g', '', '', '', '', '', each(indices, '1d', S => dip(S, { th: 10, exit: 'sma5', filter: false })), { narrow: true });
  grid.push({ label: 'RSI(2) under 10 · no uptrend filter', n: r.n, avgR: r.avgR, exR: r.exR, t: r.tMonthly, h1: r.h1 && r.h1.exR, h2: r.h2 && r.h2.exR, x2: r.cost2 && r.cost2.avgR }); }
console.log('\nDIP GRID'); for (const g of grid) console.log(g.label.padEnd(52), 'n', String(g.n).padStart(5), 'avgR', g.avgR, 'ex', g.exR, 't', g.t, 'halves', g.h1, g.h2, 'x2', g.x2);
const studies = [{ id: 'dip_grid', title: 'The dip rule on indices, with other settings', note: 'Every combination is shown. If the effect were an accident of one setting, its neighbours would fall apart.', rows: grid }];

const span = g => { const f = (GROUPS[g] || []).map(s => L.load(s, '1d')[0].t).sort((a, b) => a - b); return f.length ? new Date(f[Math.floor(f.length / 2)] * 1000).toISOString().slice(0, 10) : null; };
const out = {
  run: 6, generatedAt: new Date().toISOString(), dataFetchedAt: new Date(M.fetchedAt).toISOString(), server: M.server,
  universe: Object.fromEntries(Object.entries(GROUPS).map(([g, a]) => [g, { n: a.length, typicalFrom: span(g), spreadPct: r2(GROUP_MED[g] * 100 * 1000) / 1000 }])),
  instruments: SYMS.length, financingAssumed: FIN_ASSUMED,
  spreads: Object.fromEntries(SYMS.map(s => [s, Math.round(COST[s] / 1.5 * 1e6) / 1e4])),   /* the spread each test paid, in percent, before the x1.5 */
  notTested: [
    { name: 'Carry', why: 'The bridge does not report swap rates, so what a position earns or pays overnight is unknown.' },
    { name: 'News and earnings reactions', why: 'The bridge carries prices only. There is no history of scheduled releases or company results to test against.' },
  ],
  tests, studies,
};
fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, 'results.js'), '/* written by run.cjs — do not edit by hand */\nwindow.TIMURILA_RESEARCH = ' + JSON.stringify(out) + ';\n');
console.log('\nwrote results.json · instruments', SYMS.length, Object.entries(GROUPS).map(([g, a]) => g + ' ' + a.length).join(' · '));
