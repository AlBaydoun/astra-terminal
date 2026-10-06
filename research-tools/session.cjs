// Session effects, broker server clock (US cash 16:30-23:00, DAX 10:00-18:30)
const B = require('./bt.cjs');
const hm = t => { const d = new Date(t * 1000); return d.getUTCHours() * 100 + d.getUTCMinutes(); };
const dkey = t => Math.floor(t / 86400);
const f = v => v == null ? '—' : v === Infinity ? 'inf' : (+v).toFixed(2);

/* A) intraday momentum: sign of (prev cash close -> end of first 30 min) decides the last 30 min */
function intradayMomentum(sym, S, opts = {}){
  const c = B.load(sym, '15m'), A = B.atr(c, 14), sp = B.SPREAD[sym] || 0;
  const byDay = {};
  c.forEach((x, i) => { (byDay[dkey(x.t)] = byDay[dkey(x.t)] || []).push(i); });
  const days = Object.keys(byDay).map(Number).sort((a, b) => a - b);
  const trades = []; let prevClose = null;
  for (const d of days){
    const idx = byDay[d], at = h => idx.find(i => hm(c[i].t) === h);
    const iFirstEnd = at(S.firstEnd), iLastStart = at(S.lastStart), iLastEnd = at(S.lastEnd);
    if (prevClose != null && iFirstEnd != null && iLastStart != null && iLastEnd != null && A[iLastStart]){
      const r1 = c[iFirstEnd].c / prevClose - 1;
      if (Math.abs(r1) >= (opts.minMove || 0)){
        const dir = (opts.fade ? -1 : 1) * Math.sign(r1); if (dir){
          const e = c[iLastStart].o, x = c[iLastEnd].c, stop = 1.5 * A[iLastStart];
          // protective stop inside the half hour (pessimistic)
          let exit = x; for (let j = iLastStart; j <= iLastEnd; j++){ const b = c[j]; if (dir > 0 ? b.l <= e - stop : b.h >= e + stop){ exit = e - dir * stop; break; } }
          trades.push({ t: c[iLastStart].t, sym, dir, r: ((exit - e) * dir - sp) / stop, rRnd: null, move: (exit - e) * dir, stop, sp });
        }
      }
    }
    const iClose = at(S.closeBar); if (iClose != null) prevClose = c[iClose].c;
  }
  return trades;
}
/* B) overnight drift: long from the cash close to the next cash open, financing charged */
function overnight(sym, S, swapPctPerNight = 0.02){
  const c = B.load(sym, '1h'), A = B.atr(c, 14), sp = B.SPREAD[sym] || 0;
  const trades = [];
  for (let i = 220; i < c.length - 30; i++){
    if (hm(c[i].t) !== S.closeHour) continue;                     // bar starting at 22:00 closes at 23:00
    let j = i + 1; while (j < c.length && hm(c[j].t) !== S.openHour) j++;   // bar starting at 16:00 = last before the open
    if (j >= c.length || j - i > 90) continue;
    const e = c[i].c, x = c[j].c, stop = 2 * A[i];
    let exit = x; for (let k = i + 1; k <= j; k++){ if (c[k].l <= e - stop){ exit = Math.min(e - stop, c[k].o); break; } }
    const nights = Math.round((c[j].t - c[i].t) / 86400) || 1;
    const swap = e * swapPctPerNight / 100 * Math.max(1, nights);
    trades.push({ t: c[i].t, sym, dir: 1, r: (exit - e - sp - swap) / stop, hours: (c[j].t - c[i].t) / 3600, stop, sp, swap });
  }
  return trades;
}
function randomLongs(sym, hold, n, swapPctPerNight = 0.02, seeds = 30){
  const c = B.load(sym, '1h'), A = B.atr(c, 14), sp = B.SPREAD[sym] || 0; const out = [];
  for (let s = 0; s < seeds; s++){ let seed = 999 + s * 7919; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
    for (let k = 0; k < n; k++){ const i = 220 + Math.floor(rnd() * (c.length - 260)); const j = Math.min(c.length - 1, i + hold); if (!A[i]) continue;
      const e = c[i].c, stop = 2 * A[i]; let exit = c[j].c; for (let q = i + 1; q <= j; q++){ if (c[q].l <= e - stop){ exit = Math.min(e - stop, c[q].o); break; } }
      const nights = Math.max(0, Math.round((c[j].t - c[i].t) / 86400));
      out.push({ r: (exit - e - sp - e * swapPctPerNight / 100 * nights) / stop }); } }
  return B.stats(out);
}
const halves = tr => { tr.sort((a, b) => a.t - b.t); const m = (tr[0].t + tr[tr.length - 1].t) / 2; return [B.stats(tr.filter(t => t.t < m)), B.stats(tr.filter(t => t.t >= m))]; };

const US = { firstEnd: 1645, lastStart: 2230, lastEnd: 2245, closeBar: 2245, closeHour: 2200, openHour: 1600 };
const DE = { firstEnd: 1015, lastStart: 1800, lastEnd: 1815, closeBar: 1815 };
console.log('== A) intraday momentum (last 30 min follows first 30 min) ==');
for (const [label, syms, S] of [['US indices', ['US500.s', 'US100.s', 'US30.s'], US], ['Europe', ['DE40.s', 'EU50.s', 'FR40.s'], DE]]){
  for (const minMove of [0, 0.002]){
    let tr = []; for (const s of syms) tr = tr.concat(intradayMomentum(s, S, { minMove }));
    const st = B.stats(tr), [h1, h2] = halves(tr.slice());
    // coin-flip benchmark: same days, same window, random direction
    const flips = []; for (let k = 0; k < 40; k++){ let seed = 77 + k * 31; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
      for (const t of tr){ const d = rnd() < 0.5 ? 1 : -1; flips.push({ r: (d === t.dir ? t.move : -t.move - 0) / t.stop - t.sp / t.stop }); } }
    const fb = B.stats(flips);
    const per = syms.map(s => { const x = B.stats(tr.filter(t => t.sym === s)); return s.replace('.s', '') + ' n' + x.n + ' PF' + f(x.pf) + ' ' + f(x.netR) + 'R'; }).join(' | ');
    console.log(label.padEnd(10), 'min first move', (minMove * 100) + '%', 'n', st.n, 'win', f(st.winRate), 'PF', f(st.pf), 'netR', f(st.netR), 'avgR', f(st.avgR), '| halves', f(h1.pf), f(h2.pf), '| coin-flip PF', f(fb.pf), 'avgR', f(fb.avgR), '\n     ', per);
  }
}
console.log('== B) overnight drift, long 23:00 -> 17:00 next day, financing 0.02%/night ==');
let all = [];
for (const s of ['US500.s', 'US100.s', 'US30.s']){
  const tr = overnight(s, US); all = all.concat(tr);
  const st = B.stats(tr), [h1, h2] = halves(tr.slice()); const avgH = Math.round(tr.reduce((a, t) => a + t.hours, 0) / tr.length);
  const rb = randomLongs(s, avgH, tr.length);
  console.log(s.padEnd(8), 'n', st.n, 'win', f(st.winRate), 'PF', f(st.pf), 'netR', f(st.netR), '| halves', f(h1.pf), f(h2.pf), '| random', avgH + 'h longs PF', f(rb.pf), 'avgR', f(rb.avgR), 'vs', f(st.avgR));
}
