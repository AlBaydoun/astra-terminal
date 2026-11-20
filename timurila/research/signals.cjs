/* Timurila research run 7 — the indicator court.

   Question 1: which of the popular "advanced" indicators give a signal that beats a random entry?
   Question 2: does it help when several trend readings agree?
   Question 3: does it help to trade with the daily trend ("the stream"), and what happens to
               signals that fire right after a shock (a day at least 2.5 times its usual size,
               counting the day in progress)?

   Method, the same court as run.cjs:
     · every signal is the published indicator with its usual settings (see js/proind.js), NOT tuned;
     · read on a CLOSED candle, in at the next open, out at the open five candles later,
       the spread paid (x1.5 for safety);
     · result in R = net return divided by the instrument's own ATR(20) at entry;
     · BASELINE = the exact average of every possible entry on the same instrument, same side,
       same holding time, paying the same spread. Only the EXCESS over that counts;
     · significance on MONTHLY totals of the excess (signals on related instruments cluster in time);
     · both halves of history, double spread, and 0.02 % a night financing (ASSUMED: the bridge
       reports no swap rates).
   Read-only: it reads ./data (made by fetch.cjs) and writes signals.json / signals.js. */
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const PI = require('../../js/proind.js');
const M = L.meta();
const FIN = 0.0002, H = 5, WARM = 260;
const FLOOR = { indices: 0.00009, metals: 0.00006, energy: 0.00028, crypto: 0.0005, forex: 0.00002, shares: 0.0005, other: 0.0005 };

/* ---------- universe and costs (as in run.cjs) ---------- */
const SYMS = M.symbols.filter(s => L.has(s, '1d') && L.load(s, '1d').length >= 300);
const GROUPS = {}; for (const s of SYMS) (GROUPS[L.groupOf(s)] = GROUPS[L.groupOf(s)] || []).push(s);
const rawSpread = s => { const q = M.quotes[s]; if (!q || !(q.bid > 0) || !(q.ask > q.bid)) return null; return (q.ask - q.bid) / ((q.ask + q.bid) / 2); };
const median = a => { const b = a.filter(x => x != null && isFinite(x)).sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)] : null; };
const GROUP_MED = {}; for (const g in GROUPS) GROUP_MED[g] = median(GROUPS[g].map(rawSpread).filter(x => x != null && x < 0.02)) || FLOOR[g];
const COST = {}; for (const s of SYMS){ const g = L.groupOf(s); let sp = rawSpread(s); if (sp == null || sp > 5 * GROUP_MED[g]) sp = GROUP_MED[g]; COST[s] = Math.max(sp, FLOOR[g]) * 1.5; }
const macro = ['forex', 'metals', 'energy', 'indices', 'crypto'].flatMap(g => GROUPS[g] || []);
const TFS = [['1d', SYMS, 1], ['4h', macro.filter(s => L.has(s, '4h')), 1 / 6], ['1h', macro.filter(s => L.has(s, '1h')), 1 / 24]];

/* ---------- accumulators ---------- */
const ym = t => { const d = new Date(t * 1000); return d.getUTCFullYear() * 12 + d.getUTCMonth(); };
function Acc(){ return { n: 0, r: 0, rf: 0, ex: 0, ex2: 0, win: 0, a: { n: 0, ex: 0 }, b: { n: 0, ex: 0 }, mon: new Map(), g: {} }; }
function add(A, o){ A.n++; A.r += o.r; A.rf += o.rf; A.ex += o.ex; A.ex2 += o.ex2; if (o.r > 0) A.win++;
  const half = o.first ? A.a : A.b; half.n++; half.ex += o.ex; A.mon.set(o.m, (A.mon.get(o.m) || 0) + o.ex);
  if (o.g){ const G = A.g[o.g] || (A.g[o.g] = { n: 0, ex: 0 }); G.n++; G.ex += o.ex; } }
function tOf(A){ const v = [...A.mon.values()]; if (v.length < 12) return 0; const mu = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - mu) ** 2, 0) / (v.length - 1)); return sd ? mu / (sd / Math.sqrt(v.length)) : 0; }
const r3 = x => Math.round(x * 1000) / 1000;
function sum(A){ const n = A.n || 1; return { n: A.n, avgR: r3(A.r / n), avgRfin: r3(A.rf / n), exR: r3(A.ex / n), ex2: r3(A.ex2 / n), win: Math.round(100 * A.win / n), t: Math.round(tOf(A) * 100) / 100,
  h1: A.a.n ? r3(A.a.ex / A.a.n) : null, h2: A.b.n ? r3(A.b.ex / A.b.n) : null, months: A.mon.size,
  byGroup: Object.fromEntries(Object.entries(A.g).map(([g, x]) => [g, { n: x.n, exR: r3(x.ex / x.n) }])) }; }
function verdict(s){
  if (s.n < 300) return 'too few';
  const halves = s.h1 > 0 && s.h2 > 0;
  if (s.t >= 3 && halves && s.avgR > 0 && s.avgRfin > 0 && s.ex2 > 0) return 'proven';
  if (s.t >= 2 && halves && s.avgR > 0) return 'leaning';
  return 'benched';
}

/* ---------- the run ---------- */
const SIG = PI.SIGNALS.concat([{ id: 'cons', name: 'Seven of nine agree', family: 'agreement', how: 'seven of the nine trend readings point the same way for the first time' }]);
const tests = {}, ctx = { stream: {}, shock: {}, agree: {} }, K = (o, k) => o[k] || (o[k] = Acc());
const t0 = Date.now(); let bars = 0, events = 0;
for (const [tf, syms, nightsPerBar] of TFS){
  /* the middle of this timeframe's history, to split it in two halves */
  let lo = Infinity, hi = -Infinity; for (const s of syms){ const c = L.load(s, tf); if (c.length < WARM + 50) continue; lo = Math.min(lo, c[WARM].t); hi = Math.max(hi, c[c.length - 1].t); }
  const split = (lo + hi) / 2;
  for (const sym of syms){
    const c = L.load(sym, tf); if (c.length < WARM + 50) continue;
    const g = L.groupOf(sym), P = PI.prep(c), n = P.n, A = PI.atr(P, 20), cost = COST[sym], lim = g === 'shares' ? 0.4 : 0.6; bars += n;
    const J = new Int32Array(n + 1); for (let i = 0; i < n; i++){ const j = i > 0 && (Math.abs(Math.log(P.c[i] / P.c[i - 1])) > lim || Math.abs(Math.log(P.o[i] / P.c[i - 1])) > lim); J[i + 1] = J[i] + (j ? 1 : 0); }
    const clean = (a, b) => J[b + 1] - J[a + 1] === 0;
    const risk = i => A[i] > 0 ? A[i] / P.c[i] : 0, gross = i => P.o[i + H + 1] / P.o[i + 1] - 1;
    /* baseline: every possible long entry held H candles */
    let bg = 0, inv = 0, m = 0; for (let i = WARM; i + H + 1 < n; i++){ const rk = risk(i); if (!rk || !clean(i, i + H + 1)) continue; bg += gross(i) / rk; inv += 1 / rk; m++; }
    if (!m) continue; bg /= m; inv /= m;
    /* context: the daily series of the same instrument */
    const D = tf === '1d' ? P : (L.has(sym, '1d') ? PI.prep(L.load(sym, '1d')) : null), AD = D ? PI.atr(D, 20) : null;
    const ST = PI.STATES.map(s => PI.state(P, s.id)), sid = PI.STATES.map(s => s.id);
    const cons = new Int8Array(n); { let prev = 0; for (let i = WARM; i < n; i++){ let up = 0, dn = 0; for (const a of ST){ if (a[i] > 0) up++; else if (a[i] < 0) dn++; } const now = up >= 7 ? 1 : dn >= 7 ? -1 : 0; if (now && now !== prev) cons[i] = now; prev = now; } }
    for (const S of SIG){
      const arr = S.id === 'cons' ? cons : PI.signal(P, S.id), own = sid.indexOf(S.id);
      for (let i = WARM; i + H + 1 < n; i++){ const dir = arr[i]; if (!dir) continue; const rk = risk(i); if (!rk || !clean(i, i + H + 1)) continue;
        const gr = dir * gross(i), nights = H * nightsPerBar, r = (gr - cost) / rk, rf = (gr - cost - FIN * nights) / rk, base = dir * bg - cost * inv, base2 = dir * bg - 2 * cost * inv;
        const o = { r, rf, ex: r - base, ex2: (gr - 2 * cost) / rk - base2, m: ym(P.t[i]), first: P.t[i] < split, g }; events++;
        /* for the context tables: direction only, before costs. With costs in, a volatile day looks better than a
           quiet one for any signal at all, only because the same spread is a smaller share of a bigger move. */
        const q = Object.assign({}, o, { ex: gr / rk - dir * bg, g: null });
        add(K(tests, S.id + '|' + tf), o);
        /* the stream and the shock, read from what was complete at the time */
        if (D){ const di = tf === '1d' ? i : PI.indexAt(D, P.t[i]) - 1;
          if (di >= 210){ const st = PI.stream(D, di), side = !st || !st.dir ? 'flat' : st.dir === dir ? 'with' : 'against'; add(K(ctx.stream, tf + '|' + S.family + '|' + side), q);
            const sh = PI.shock(D, di, 2).on || (tf !== '1d' && AD[di] > 0 && PI.dayRangeSoFar(P, i) / AD[di] >= 2.5); add(K(ctx.shock, tf + '|' + S.family + '|' + (sh ? 'shock' : 'calm')), q); } }
        /* how many of the OTHER trend readings agreed (asked of the trend-flip signals only) */
        if (S.family === 'trend'){ let yes = 0, of = 0; for (let k = 0; k < ST.length; k++){ if (k === own) continue; of++; if (ST[k][i] === dir) yes++; }
          const sh = yes / of; add(K(ctx.agree, tf + '|' + (sh >= 0.75 ? 'most agree' : sh >= 0.5 ? 'half agree' : 'few agree')), q); }
      }
    }
  }
  console.log(tf, 'done', Math.round((Date.now() - t0) / 1000) + 's', 'bars', bars, 'events', events);
}

const out = { at: new Date().toISOString().slice(0, 10), run: 7, horizon: H, financingAssumed: FIN, instruments: SYMS.length, bars, events,
  universe: Object.fromEntries(TFS.map(([tf, s]) => [tf, s.length])),
  contextNote: 'Context tables measure direction only, before costs: the average move in the direction of the signal, in R, above a random entry on the same side.',
  tests: [], stream: [], shock: [], agree: [] };
for (const S of SIG) for (const [tf] of TFS){ const A = tests[S.id + '|' + tf]; if (!A) continue; const s = sum(A); out.tests.push(Object.assign({ id: S.id, name: S.name, family: S.family, how: S.how, tf }, s, { verdict: verdict(s) })); }
for (const k of Object.keys(ctx.stream).sort()){ const [tf, family, side] = k.split('|'), s = sum(ctx.stream[k]); out.stream.push({ tf, family, side, n: s.n, exR: s.exR, avgR: s.avgR, t: s.t, h1: s.h1, h2: s.h2 }); }
for (const k of Object.keys(ctx.shock).sort()){ const [tf, family, state] = k.split('|'), s = sum(ctx.shock[k]); out.shock.push({ tf, family, state, n: s.n, exR: s.exR, avgR: s.avgR, t: s.t, h1: s.h1, h2: s.h2 }); }
for (const k of Object.keys(ctx.agree).sort()){ const [tf, bucket] = k.split('|'), s = sum(ctx.agree[k]); out.agree.push({ tf, bucket, n: s.n, exR: s.exR, avgR: s.avgR, t: s.t, h1: s.h1, h2: s.h2 }); }
fs.writeFileSync(path.join(__dirname, 'signals.json'), JSON.stringify(out, null, 1));
fs.writeFileSync(path.join(__dirname, 'signals.js'), '/* made by signals.cjs — do not edit */\nwindow.TIMURILA_SIGNALS = ' + JSON.stringify(out) + ';\n');
const pad = (s, n) => String(s).padEnd(n), num = (x, n) => String(x).padStart(n);
console.log('\n' + pad('signal', 30) + pad('tf', 4) + num('n', 8) + num('avgR', 8) + num('exR', 8) + num('t', 7) + num('h1', 8) + num('h2', 8) + '  verdict');
for (const t of out.tests) console.log(pad(t.name, 30) + pad(t.tf, 4) + num(t.n, 8) + num(t.avgR, 8) + num(t.exR, 8) + num(t.t, 7) + num(t.h1, 8) + num(t.h2, 8) + '  ' + t.verdict);
console.log('\nSTREAM'); for (const s of out.stream) console.log(pad(s.tf, 4) + pad(s.family, 11) + pad(s.side, 9) + num(s.n, 8) + num(s.exR, 8) + num(s.t, 7));
console.log('\nSHOCK'); for (const s of out.shock) console.log(pad(s.tf, 4) + pad(s.family, 11) + pad(s.state, 9) + num(s.n, 8) + num(s.exR, 8) + num(s.t, 7));
console.log('\nAGREEMENT'); for (const s of out.agree) console.log(pad(s.tf, 4) + pad(s.bucket, 12) + num(s.n, 8) + num(s.exR, 8) + num(s.t, 7));
console.log('\n' + Math.round((Date.now() - t0) / 1000) + 's');
