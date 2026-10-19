// Research run 2c — the detail for each group's best call, and the file the app reads (js/research/forecasts.js).
const fs = require('fs'), path = require('path');
const { SYMS, GROUP, SPREAD, load, atr } = require('./bt.cjs');
const P = require('./predict-lib.cjs');
const rows = JSON.parse(fs.readFileSync(path.join(__dirname, 'rdata', 'predict-groups.json')));
const PICK = {
  indices: { tf: '4h', mk: 'stretch', p: 2.5, status: 'proven' },
  forex:   { tf: '4h', mk: 'rangefade', p: 20, status: 'leaning' },
  gold:    { tf: '1d', mk: 'momentum', p: 72, status: 'leaning' },
};
const out = {};
for (const [g, pk] of Object.entries(PICK)){
  const r = rows.find(x => x.g === g && x.tf === pk.tf && x.mk === pk.mk && x.p === pk.p);
  const syms = SYMS.filter(s => GROUP(s) === g);
  /* the trades it implies: enter next open, out after H candles, full spread - and again with double spread */
  let all = [], all2 = [];
  const per = [];
  for (const s of syms){
    const cs = P.calls(s, pk.tf, pk.mk, pk.p); const c = load(s, pk.tf), A = atr(c, 14), sp = SPREAD[s] || 0;
    const b = P.baseRate(s, pk.tf, 0, Infinity); cs.forEach(x => x.b = x.d > 0 ? b.up : b.dn);
    all = all.concat(cs);
    const sc = P.scoreB(cs);
    per.push({ name: s.replace(/\.s$/, ''), n: sc.n, hit: +(sc.hit * 100).toFixed(1), base: +(sc.base * 100).toFixed(1), avgAtr: +sc.avg.toFixed(2) });
  }
  const pf = xs => { const w = xs.filter(v => v > 0).reduce((a, v) => a + v, 0), l = -xs.filter(v => v < 0).reduce((a, v) => a + v, 0); return l ? w / l : 0; };
  const tot = P.scoreB(all);
  out[g] = Object.assign({}, pk, { method: P.METHODS[pk.mk].name, horizon: P.H[pk.tf],
    calls: tot.n, hit: +(tot.hit * 100).toFixed(1), base: +(tot.base * 100).toFixed(1), z: +r.tot.z.toFixed(1),
    halves: [+(r.h1.hit * 100).toFixed(1), +(r.h2.hit * 100).toFixed(1)], halvesZ: [+r.h1.z.toFixed(1), +r.h2.z.toFixed(1)],
    avgAtr: +tot.avg.toFixed(2), pf: +pf(all.map(x => x.atrMove)).toFixed(2),
    cone: { q25: +tot.q25.toFixed(2), q50: +tot.q50.toFixed(2), q75: +tot.q75.toFixed(2) },
    agree: r.agree + ' of ' + r.counted, per, period: new Date(all.reduce((a, x) => Math.min(a, x.t), Infinity) * 1000).toISOString().slice(0, 10) + ' – ' + new Date(all.reduce((a, x) => Math.max(a, x.t), 0) * 1000).toISOString().slice(0, 10) });
  console.log(g, JSON.stringify(out[g], null, 0));
}
fs.writeFileSync(path.join(__dirname, 'rdata', 'forecast-pick.json'), JSON.stringify(out, null, 1));
