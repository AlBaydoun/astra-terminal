// Relative-strength rotation on daily bars: each day, among a basket, buy the strongest by N-day return
// if it is above its own 50-day average; hold H days; stop 2 x daily ATR. Benchmark: a random basket member, same days, same hold.
const B = require('./bt.cjs');
const f = v => v == null ? '—' : v === Infinity ? 'inf' : (+v).toFixed(2);
const BASKETS = {
  indices: ['US100.s', 'US30.s', 'US500.s', 'DE40.s', 'EU50.s', 'FR40.s', 'UK100.s', 'AU200.s', 'JP225.s'],
  everything: B.SYMS,
  fx: ['EURUSD.s', 'GBPUSD.s', 'USDJPY.s', 'AUDUSD.s', 'USDCAD.s', 'USDCHF.s', 'EURJPY.s', 'GBPJPY.s'],
};
function series(sym){ const c = B.load(sym, '1d'); const m = new Map(c.map((x, i) => [x.t, i])); return { c, m, A: B.atr(c, 14), S50: B.sma(c.map(x => x.c), 50) }; }
function trade(sr, i, hold, sym, dir = 1){
  const c = sr.c, e = c[i + 1] && c[i + 1].o; if (!e || !sr.A[i]) return null;
  const stop = 2 * sr.A[i], j = Math.min(c.length - 1, i + hold); let exit = c[j].c;
  for (let k = i + 1; k <= j; k++){ if (dir > 0 ? c[k].l <= e - stop : c[k].h >= e + stop){ exit = e - dir * stop; break; } }
  const nights = Math.max(1, Math.round((c[j].t - c[i + 1].t) / 86400));
  const swap = e * 0.02 / 100 * nights;   // financing estimate for every market
  return { r: ((exit - e) * dir - B.SPREAD[sym] - swap) / stop, t: c[i].t, sym };
}
function run(basket, look, hold, topN = 1){
  const S = Object.fromEntries(basket.map(s => [s, series(s)]));
  const days = [...new Set([].concat(...basket.map(s => S[s].c.map(x => x.t))))].sort((a, b) => a - b);
  const tr = [], rnd = []; let busy = -1; let seed = 4242; const R = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let d = 60; d < days.length - hold - 1; d++){
    if (d < busy) continue;
    const t = days[d], cands = [];
    for (const s of basket){ const sr = S[s], i = sr.m.get(t); if (i == null || i < look + 50) continue; const ret = sr.c[i].c / sr.c[i - look].c - 1; cands.push({ s, i, ret, up: sr.c[i].c > sr.S50[i] }); }
    if (cands.length < 3) continue;
    cands.sort((a, b) => b.ret - a.ret);
    const pick = cands.slice(0, topN).filter(x => x.up && x.ret > 0);
    for (const p of pick){ const x = trade(S[p.s], p.i, hold, p.s); if (x) tr.push(x); }
    if (pick.length){ for (let k = 0; k < 20; k++){ const q = cands[Math.floor(R() * cands.length)]; const x = trade(S[q.s], q.i, hold, q.s); if (x) rnd.push(x); } busy = d + hold; }
  }
  return { tr, rnd };
}
for (const [bn, basket] of Object.entries(BASKETS)) for (const [look, hold] of [[20, 5], [60, 10], [10, 3]]){
  const { tr, rnd } = run(basket, look, hold);
  if (!tr.length) continue;
  const st = B.stats(tr), rs = B.stats(rnd); tr.sort((a, b) => a.t - b.t); const mid = (tr[0].t + tr[tr.length - 1].t) / 2;
  const h1 = B.stats(tr.filter(x => x.t < mid)), h2 = B.stats(tr.filter(x => x.t >= mid));
  const bySym = {}; for (const x of tr) bySym[x.sym] = (bySym[x.sym] || 0) + 1;
  console.log(bn.padEnd(10), 'look', look, 'hold', hold, '| n', st.n, 'win', f(st.winRate), 'PF', f(st.pf), 'netR', f(st.netR), 'avgR', f(st.avgR), 'ddR', f(st.maxDdR), '| halves', f(h1.pf), f(h2.pf), '| random member PF', f(rs.pf), 'avgR', f(rs.avgR), '\n     picks:', Object.entries(bySym).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([s, n]) => s.replace('.s', '') + ' ' + n).join(', '));
}
