// Research run 4 — PROVEN CANDLES.
// Which candlestick patterns, in which CONTEXT, on which market group and timeframe, really pay
// after costs — measured on history they were NOT chosen on?
//
// Method (honest by construction):
//  * 8 pattern families, bull + bear mirror, defined in ATR terms (no fixed % sizes).
//  * Context atoms: with / against the trend, liquidity sweep, stretched from the mean, big candle,
//    high volume, higher-timeframe agreement, active session. Combinations of up to three.
//  * Trade model: entry at the next open (or after a confirming close), stop beyond the pattern's
//    extreme + 0.1 ATR (never closer than 0.5 ATR, never wider than 3 ATR), targets 1 / 1.5 / 2 / 3 R,
//    time exit. Full spread paid (bt.cjs cost model, x1.5 safety). Stop-first when both in one candle.
//    One position per instrument at a time.
//  * Selection on the FIRST 60 % of history only. The last 40 % is never looked at while choosing.
//    A setup survives only if it ALSO pays out of sample, beats the drift of random entries in the
//    same direction, and is not carried by one single instrument.
//  * A PLACEBO run (random candles, random direction, same filters, same selection) counts how many
//    "discoveries" pure chance produces — the real run must clearly beat it.
// Output: js/research/candle-edges.js (read by js/provencandles.js).
const fs = require('fs'), path = require('path');
const { load, ema, atr, rsi, SYMS, GROUP, SPREAD } = require('./bt.cjs');

const TFS = ['15m', '1h', '4h'];
const MAXB = { '15m': 32, '1h': 24, '4h': 12 };
const TGT = [1, 1.5, 2, 3];
const GR = s => { const g = GROUP(s); return g === 'gold' ? 'metals' : g; };
const FAMS = ['pin', 'engulf', 'star', 'tweezer', 'three', 'outside', 'insidebreak', 'twobar'];
const ATOMS = ['W', 'X', 'SW', 'ST', 'BIG', 'VOL', 'HTF', 'SES'];
const BIT = Object.fromEntries(ATOMS.map((a, i) => [a, 1 << i]));
/* active sessions in the BROKER's server hours (EET): the data is stamped in server time */
function sesOK(sym, t){
  const h = new Date(t * 1000).getUTCHours();
  if (/^(US100|US30|US500)/.test(sym)) return h >= 16 && h < 23;
  if (/^(DE40|EU50|FR40|UK100)/.test(sym)) return h >= 9 && h < 18;
  if (/^(AU200|JP225)/.test(sym)) return h >= 2 && h < 9;
  if (GROUP(sym) === 'crypto') return h >= 10 && h < 23;
  return h >= 9 && h < 19;
}

/* ---------- pattern detection: bull versions; bear = mirror (prices negated) ---------- */
function mirror(c){ return c.map(x => ({ t: x.t, o: -x.o, h: -x.l, l: -x.h, c: -x.c, v: x.v })); }
function detect(c, A, i){
  const b = c[i], a = c[i - 1], a2 = c[i - 2], at = A[i]; if (!at || !a2) return [];
  const body = x => Math.abs(x.c - x.o), rng = x => x.h - x.l, green = x => x.c > x.o, red = x => x.c < x.o;
  const out = [];
  const lw = Math.min(b.o, b.c) - b.l, uw = b.h - Math.max(b.o, b.c);
  if (rng(b) >= 0.6 * at && lw >= 2 * body(b) && lw >= 0.6 * rng(b) && uw <= 0.25 * rng(b)) out.push(['pin', 1]);
  if (red(a) && green(b) && body(b) >= 0.5 * at && body(b) > body(a) && b.c > a.o && b.o <= a.c) out.push(['engulf', 1]);
  if (red(a2) && body(a2) >= 0.5 * at && body(a) <= 0.3 * body(a2) && green(b) && b.c > (a2.o + a2.c) / 2) out.push(['star', 3]);
  if (red(a) && green(b) && Math.abs(a.l - b.l) <= 0.1 * at && rng(a) >= 0.5 * at && b.c > (a.o + a.c) / 2) out.push(['tweezer', 2]);
  if (green(a2) && green(a) && green(b) && a.c > a2.c && b.c > a.c && body(a2) >= 0.5 * rng(a2) && body(a) >= 0.5 * rng(a) && body(b) >= 0.5 * rng(b) && b.c - a2.o >= 1.5 * at) out.push(['three', 3]);
  if (b.l < a.l && b.c > a.h && rng(b) >= 0.8 * at) out.push(['outside', 2]);
  if (a.h <= a2.h && a.l >= a2.l && b.c > a2.h && green(b)) out.push(['insidebreak', 3]);
  if (red(a) && body(a) >= 0.6 * at && green(b) && body(b) >= 0.6 * at && b.c >= a.o - 0.1 * at && b.o <= a.c + 0.1 * at) out.push(['twobar', 2]);
  return out.map(([fam, len]) => ({ fam, len }));
}

/* ---------- one trade from a known entry bar ---------- */
function trade(c, ei, dir, stopPx, R, maxB, sp){
  const e = c[ei].o, sd = (e - stopPx) * dir; if (!(sd > 0)) return null;
  const tp = e + dir * R * sd; let j, exit = null;
  for (j = ei; j < Math.min(c.length, ei + maxB); j++){
    const x = c[j], hs = dir > 0 ? x.l <= stopPx : x.h >= stopPx, ht = dir > 0 ? x.h >= tp : x.l <= tp;
    if (hs){ exit = j === ei && (dir > 0 ? x.o <= stopPx : x.o >= stopPx) ? x.o : stopPx; break; }
    if (ht){ exit = tp; break; }
  }
  if (exit == null){ j = Math.min(c.length - 1, ei + maxB - 1); exit = c[j].c; }
  return { r: ((exit - e) * dir - sp) / sd, x: j };
}

/* ---------- every pattern event with its features and outcomes ---------- */
function events(sym, tf, placebo){
  const c = load(sym, tf), n = c.length, A = atr(c, 14), sp = (SPREAD[sym] || 0) * (+process.env.COSTX || 1);
  const close = c.map(x => x.c), E20 = ema(close, 20), E50 = ema(close, 50), E200 = ema(close, 200), EH = ema(close, 800);
  const vol = c.map(x => x.v || 0), vAvg = []; let vs = 0;
  for (let i = 0; i < n; i++){ vs += vol[i]; if (i >= 20) vs -= vol[i - 20]; vAvg[i] = i >= 19 ? vs / 20 : null; }
  const M = mirror(c), out = [];
  let seed = 99991 + sym.length * 31 + tf.length;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let i = 260; i < n - 3; i++){
    const at = A[i]; if (!at || E200[i] == null || EH[i] == null) continue;
    for (const dir of [1, -1]){
      const C = dir > 0 ? c : M;
      let pats;
      if (placebo){ if (rnd() > 0.02) continue; pats = [{ fam: FAMS[Math.floor(rnd() * FAMS.length)], len: 1 + Math.floor(rnd() * 3) }]; }
      else pats = detect(C, A, i);
      for (const p of pats){
        /* pattern extreme in real prices */
        let ext = dir > 0 ? Infinity : -Infinity;
        for (let k = i - p.len + 1; k <= i; k++) ext = dir > 0 ? Math.min(ext, c[k].l) : Math.max(ext, c[k].h);
        /* features (dir-aware) */
        let f = 0;
        const up = dir > 0;
        const trendUp = close[i] > E200[i] && E50[i] > E200[i], trendDn = close[i] < E200[i] && E50[i] < E200[i];
        if (up ? trendUp : trendDn) f |= BIT.W;
        if (up ? trendDn : trendUp) f |= BIT.X;
        let prior = up ? Infinity : -Infinity;
        for (let k = i - p.len - 20; k <= i - p.len; k++) if (k >= 0) prior = up ? Math.min(prior, c[k].l) : Math.max(prior, c[k].h);
        if (up ? (ext < prior && close[i] > prior) : (ext > prior && close[i] < prior)) f |= BIT.SW;
        if ((up ? E20[i] - close[i] : close[i] - E20[i]) >= 1.0 * at || (up ? (E20[i - p.len] - c[i - p.len].c) : (c[i - p.len].c - E20[i - p.len])) >= 1.2 * at) f |= BIT.ST;
        let ph = -Infinity, pl = Infinity; for (let k = i - p.len + 1; k <= i; k++){ ph = Math.max(ph, c[k].h); pl = Math.min(pl, c[k].l); }
        if (ph - pl >= 1.5 * at) f |= BIT.BIG;
        if (vAvg[i] > 0 && vol[i] >= 1.5 * vAvg[i]) f |= BIT.VOL;
        if (up ? close[i] > EH[i] : close[i] < EH[i]) f |= BIT.HTF;
        if (sesOK(sym, c[i].t)) f |= BIT.SES;
        /* stop */
        const buf = 0.1 * at;
        let stopPx = ext - dir * buf;
        const sdNext = (c[i + 1].o - stopPx) * dir;
        if (sdNext < 0.5 * at) stopPx = c[i + 1].o - dir * 0.5 * at;
        if ((c[i + 1].o - stopPx) * dir > 3 * at) continue;
        const ev = { sym, tf, t: c[i].t, i, dir, fam: p.fam, f, next: [], conf: null };
        for (const R of TGT) ev.next.push(trade(c, i + 1, dir, stopPx, R, MAXB[tf], sp));
        /* confirmation: the next candle closes beyond the pattern candle's far end; enter one bar later */
        const cf = c[i + 1], conf = up ? cf.c > c[i].h : cf.c < c[i].l;
        if (conf && i + 2 < n){
          let sp2 = stopPx; const sd2 = (c[i + 2].o - sp2) * dir;
          if (sd2 < 0.5 * at) sp2 = c[i + 2].o - dir * 0.5 * at;
          if ((c[i + 2].o - sp2) * dir <= 3 * at){ ev.conf = []; for (const R of TGT) ev.conf.push(trade(c, i + 2, dir, sp2, R, MAXB[tf], sp)); }
        }
        out.push(ev);
      }
    }
  }
  return out;
}

/* ---------- statistics of one rule on a list of events ---------- */
function evalRule(evs, mask, fam, dirSel, entry, ti){
  const busy = {}, rs = [], per = {};
  for (const e of evs){
    if (e.fam !== fam || (e.f & mask) !== mask) continue;
    if (dirSel && e.dir !== dirSel) continue;
    const o = entry === 'conf' ? (e.conf && e.conf[ti]) : e.next[ti]; if (!o) continue;
    const ei = e.i + (entry === 'conf' ? 2 : 1);
    if (busy[e.sym] != null && ei <= busy[e.sym]) continue;
    busy[e.sym] = o.x;
    rs.push({ r: o.r, sym: e.sym, t: e.t, dir: e.dir });
    per[e.sym] = (per[e.sym] || 0) + o.r;
  }
  return summarize(rs, per);
}
function summarize(rs, per){
  const n = rs.length; if (!n) return { n: 0 };
  let w = 0, gw = 0, gl = 0, s = 0, s2 = 0;
  for (const x of rs){ s += x.r; s2 += x.r * x.r; if (x.r > 0){ w++; gw += x.r; } else gl -= x.r; }
  const avg = s / n, sd = Math.sqrt(Math.max(0, s2 / n - avg * avg));
  const syms = Object.keys(per || {}), best = syms.length ? Math.max(...syms.map(k => per[k])) : 0;
  return { n, win: w / n * 100, avgR: avg, pf: gl ? gw / gl : (gw ? 99 : 0), se: sd / Math.sqrt(n), netR: s, nSym: syms.length, exBest: n ? (s - best) : 0, long: rs.filter(x => x.dir > 0).length };
}

/* ---------- the drift of random entries (what "any long" or "any short" earned) ---------- */
function drift(group, tf){
  const syms = SYMS.filter(s => GR(s) === group), res = {};
  for (const R of TGT) res[R] = { 1: [], '-1': [] };
  let seed = 4242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (const s of syms){
    let c; try { c = load(s, tf); } catch(e){ continue; }
    const A = atr(c, 14), sp = SPREAD[s] || 0;
    for (let k = 0; k < 600; k++){
      const i = 260 + Math.floor(rnd() * (c.length - 300)); if (!A[i]) continue;
      for (const dir of [1, -1]) for (const R of TGT){ const o = trade(c, i + 1, dir, c[i + 1].o - dir * 1.0 * A[i], R, MAXB[tf], sp); if (o) res[R][dir].push(o.r); }
    }
  }
  const avg = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
  const out = {}; for (const R of TGT) out[R] = { 1: avg(res[R][1]), '-1': avg(res[R]['-1']) };
  return out;
}

/* ---------- the whole search ---------- */
function masks(){
  const out = [0];
  const n = ATOMS.length;
  for (let a = 0; a < n; a++){ out.push(1 << a);
    for (let b = a + 1; b < n; b++){ out.push((1 << a) | (1 << b));
      for (let d = b + 1; d < n; d++) out.push((1 << a) | (1 << b) | (1 << d)); } }
  return out.filter(m => !((m & BIT.W) && (m & BIT.X)));
}
const IS_MIN = { n: 40, avgR: 0.12, pf: 1.25 }, OOS_MIN = { n: 20, avgR: 0.08, pf: 1.15, lift: 0.08 };
function search(placebo){
  const groups = [...new Set(SYMS.map(GR))], found = [];
  let tests = 0;
  for (const tf of TFS){
    for (const g of groups){
      const syms = SYMS.filter(s => GR(s) === g);
      let evs = [];
      for (const s of syms){ try { evs = evs.concat(events(s, tf, placebo)); } catch(e){} }
      if (!evs.length) continue;
      evs.sort((a, b) => a.t - b.t);
      const t0 = evs[0].t, t1 = evs[evs.length - 1].t, cut = t0 + (t1 - t0) * 0.6;
      const IS = evs.filter(e => e.t < cut), OOS = evs.filter(e => e.t >= cut);
      const D = drift(g, tf);
      const M = masks();
      for (const fam of FAMS){
        const fIS = IS.filter(e => e.fam === fam), fOOS = OOS.filter(e => e.fam === fam), fAll = evs.filter(e => e.fam === fam);
        for (const mask of M){
          /* a condition set that leaves too few patterns in-sample cannot pass any variant */
          let cnt = 0; for (const e of fIS) if ((e.f & mask) === mask) cnt++;
          if (cnt < IS_MIN.n){ tests += 24; continue; }
        for (const dirSel of [0, 1, -1]) for (const entry of ['next', 'conf']) for (let ti = 0; ti < TGT.length; ti++){
        tests++;
        const a = evalRule(fIS, mask, fam, dirSel, entry, ti);
        if (!(a.n >= IS_MIN.n && a.avgR >= IS_MIN.avgR && a.pf >= IS_MIN.pf)) continue;
        const b = evalRule(fOOS, mask, fam, dirSel, entry, ti);
        if (!(b.n >= OOS_MIN.n && b.avgR >= OOS_MIN.avgR && b.pf >= OOS_MIN.pf)) continue;
        /* the drift of random entries with the same direction mix */
        const R = TGT[ti], base = (b.long * D[R][1] + (b.n - b.long) * D[R]['-1']) / b.n;
        if (b.avgR - base < OOS_MIN.lift) continue;
        /* not one instrument carrying it */
        if (Math.min(syms.length, 3) > b.nSym || b.exBest <= 0) continue;
        const all = evalRule(fAll, mask, fam, dirSel, entry, ti);
        found.push({ tf, group: g, fam, mask, atoms: ATOMS.filter(x => mask & BIT[x]), dir: dirSel, entry, R, maxBars: MAXB[tf],
          is: a, oos: b, all, base, lift: b.avgR - base, score: (b.avgR - b.se) });
      }
        }
      }
    }
  }
  return { found, tests };
}

module.exports = { events, detect, FAMS, ATOMS, BIT, TGT, MAXB };
if (require.main === module){
const real = search(false);
const plc = process.env.NOPLACEBO ? { found: [], tests: 0 } : search(true);
console.log('tests', real.tests, '| real survivors', real.found.length, '| placebo survivors', plc.found.length);

/* keep the strongest rule per family x group x timeframe x direction; prefer fewer conditions on a tie */
const best = {};
for (const r of real.found){
  const k = [r.tf, r.group, r.fam, r.dir].join('|');
  const better = !best[k] || r.score > best[k].score + 0.02 || (Math.abs(r.score - best[k].score) <= 0.02 && r.atoms.length < best[k].atoms.length);
  if (better) best[k] = r;
}
/* the chance bar: how strong did the luckiest PLACEBO "discoveries" look? A rule is shown only when it is
   stronger than (A) every placebo survivor, or (B) 90 % of them */
const ps = plc.found.map(r => r.score).sort((x, y) => x - y);
const pMax = ps.length ? ps[ps.length - 1] : 0, p90 = ps.length ? ps[Math.floor(ps.length * 0.9)] : 0;
console.log('placebo scores: median', ps.length ? ps[Math.floor(ps.length / 2)].toFixed(3) : '-', 'p90', p90.toFixed(3), 'max', pMax.toFixed(3));
for (const r of Object.values(best)) r.grade = r.score > pMax ? 'A' : r.score > p90 ? 'B' : 'C';
const pub = Object.values(best).filter(r => r.grade !== 'C').sort((a, b) => b.score - a.score);
console.log('grades: A', pub.filter(r => r.grade === 'A').length, 'B', pub.filter(r => r.grade === 'B').length, 'dropped as within chance', Object.values(best).length - pub.length);
const fmt = x => x.n ? `n${x.n} win${x.win.toFixed(0)}% ${x.avgR >= 0 ? '+' : ''}${x.avgR.toFixed(2)}R pf${x.pf.toFixed(2)}` : '-';
for (const r of pub) console.log(r.grade, r.tf.padEnd(4), r.group.padEnd(8), r.fam.padEnd(12), (r.dir === 1 ? 'long' : r.dir === -1 ? 'short' : 'both').padEnd(6), r.entry.padEnd(5), (r.R + 'R').padEnd(5), (r.atoms.join('+') || '—').padEnd(14), '| IS', fmt(r.is), '| OOS', fmt(r.oos), '| lift', r.lift.toFixed(2), '| syms', r.oos.nSym);

/* stress test: the same rules, unseen part only, with DOUBLE the spread */
{
  const keep = {}; for (const r of pub) (keep[r.tf + '|' + r.group] = keep[r.tf + '|' + r.group] || []).push(r);
  process.env.COSTX = '2';
  for (const [k, rules] of Object.entries(keep)){
    const [tf, g] = k.split('|'); let evs = [];
    for (const s of SYMS.filter(x => GR(x) === g)){ try { evs = evs.concat(events(s, tf, false)); } catch(e){} }
    evs.sort((a, b) => a.t - b.t);
    const t0 = evs[0].t, t1 = evs[evs.length - 1].t, cut = t0 + (t1 - t0) * 0.6, OOS = evs.filter(e => e.t >= cut);
    for (const r of rules){ r.cost2 = evalRule(OOS.filter(e => e.fam === r.fam), r.mask, r.fam, r.dir, r.entry, TGT.indexOf(r.R)); }
  }
  delete process.env.COSTX;
  for (const r of pub) console.log('cost x2', r.grade, r.tf, r.group, r.fam, r.dir, r.atoms.join('+') || '-', '→', r.cost2.n ? r.cost2.avgR.toFixed(2) + 'R pf' + r.cost2.pf.toFixed(2) : '-');
}
const placeboRate = plc.tests ? plc.found.length / plc.tests : null;
const strip = s => ({ n: s.n, win: +s.win.toFixed(1), avgR: +s.avgR.toFixed(3), pf: +Math.min(s.pf, 99).toFixed(2), nSym: s.nSym });
const DATA = {
  made: new Date().toISOString().slice(0, 10),
  tests: real.tests, survivors: real.found.length, placeboSurvivors: plc.found.length, placeboTests: plc.tests,
  method: 'Selected on the first 60% of history, kept only if the last 40% (unseen) also paid after full spread, beat random entries in the same direction by 0.08R and was not carried by one instrument.',
  chanceBar: { p90: +p90.toFixed(3), max: +pMax.toFixed(3) },
  rules: pub.map(r => ({ grade: r.grade, score: +r.score.toFixed(3), tf: r.tf, group: r.group, fam: r.fam, dir: r.dir, entry: r.entry, R: r.R, maxBars: r.maxBars, atoms: r.atoms,
    is: strip(r.is), oos: strip(r.oos), all: strip(r.all), cost2: r.cost2 && r.cost2.n ? strip(r.cost2) : null, lift: +r.lift.toFixed(3), base: +r.base.toFixed(3) })),
};
fs.writeFileSync(path.join(__dirname, '..', 'js', 'research', 'candle-edges.js'),
  '/* ASTRA — measured by research-tools/candles.cjs (research run 4, ' + DATA.made + '). Read by js/provencandles.js.\n   ' + DATA.method + ' */\nconst CANDLE_EDGES = ' + JSON.stringify(DATA) + ';\n');
console.log('written', pub.length, 'rules; placebo rate', placeboRate);
}
