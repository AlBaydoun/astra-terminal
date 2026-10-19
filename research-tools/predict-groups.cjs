// Research run 2b — the same direction calls, judged per MARKET GROUP with all its instruments pooled.
// No per-instrument tuning: one setting for the whole group. Verdict needs BOTH halves of the history.
const { SYMS, GROUP } = require('./bt.cjs');
const P = require('./predict-lib.cjs');
const groups = {}; for (const s of SYMS) (groups[GROUP(s)] = groups[GROUP(s)] || []).push(s);
const rows = [];
for (const [g, syms] of Object.entries(groups)){
  for (const tf of P.TFS) for (const mk of Object.keys(P.METHODS)) for (const p of P.METHODS[mk].params){
    let all = [], baseW = 0;
    const per = [];
    for (const s of syms){
      const cs = P.calls(s, tf, mk, p); const b = P.baseRate(s, tf, 0, Infinity);
      cs.forEach(x => x.b = x.d > 0 ? b.up : b.dn); all = all.concat(cs);
      const sc = P.scoreB(cs); per.push({ s, n: sc.n, hit: sc.hit, base: sc.base, avg: sc.avg });
    }
    all.sort((a, b) => a.t - b.t);
    const mid = all.length ? (all[0].t + all[all.length - 1].t) / 2 : 0;
    const tot = P.scoreB(all), h1 = P.scoreB(all.filter(x => x.t < mid)), h2 = P.scoreB(all.filter(x => x.t >= mid));
    const agree = per.filter(x => x.n >= 10 && x.hit > x.base && x.avg > 0).length, counted = per.filter(x => x.n >= 10).length;
    rows.push({ g, tf, mk, p, tot, h1, h2, agree, counted, per });
  }
}
const ok = r => r.tot.n >= 100 && r.tot.z >= 2.5 && r.h1.z >= 1 && r.h2.z >= 1 && r.tot.avg > 0 && r.h1.avg > 0 && r.h2.avg > 0 && r.agree >= Math.ceil(r.counted * 0.6);
const f = s => `${s.n} calls ${(s.hit * 100).toFixed(1)}% vs ${(s.base * 100).toFixed(1)}% z${s.z.toFixed(1)} avg${s.avg >= 0 ? '+' : ''}${s.avg.toFixed(2)}ATR`;
for (const g of Object.keys(groups)){
  const gr = rows.filter(r => r.g === g).sort((a, b) => b.tot.z - a.tot.z);
  console.log(`\n=== ${g.toUpperCase()} (${groups[g].length} instruments) ===`);
  for (const r of gr.slice(0, 6)) console.log(`${ok(r) ? 'PASS' : '    '} ${(P.METHODS[r.mk].name + ' ' + r.p + ' ' + r.tf).padEnd(46)} ALL ${f(r.tot)} | H1 z${r.h1.z.toFixed(1)} H2 z${r.h2.z.toFixed(1)} | ${r.agree}/${r.counted} instruments agree`);
}
require('fs').writeFileSync(require('path').join(__dirname, 'rdata', 'predict-groups.json'), JSON.stringify(rows.map(r => ({ g: r.g, tf: r.tf, mk: r.mk, p: r.p, tot: r.tot, h1: r.h1, h2: r.h2, agree: r.agree, counted: r.counted, per: r.per, pass: ok(r) })), null, 1));
console.log('\nPASS = ≥100 calls, z ≥ 2.5 overall, both halves z ≥ 1 and profitable after spread, and ≥60 % of the group\'s instruments agree. Combinations tried per group:', rows.filter(r => r.g === 'forex').length);
