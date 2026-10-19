// Research run 3 — do the Structure levels really hold price better than any other level?
// For each kind of level, every FIRST touch is followed: does price turn away from it by 1 ATR
// (it HELD) before it pushes 1 ATR through it (it FAILED)? The same is measured on CONTROL levels
// that are not special (made-up retracement fractions, shifted pivots, shifted trendlines).
// A level "predicts" only if it holds clearly more often than its controls.
const { load, atr, SYMS, GROUP } = require('./bt.cjs');
const TF = process.env.TF || '1h';

function zigzag(c, A, k){                       /* swings of at least k ATR, alternating */
  const piv = []; let dir = 0, ext = 0, extI = 0;
  for (let i = 15; i < c.length; i++){
    const a = A[i] || A[i - 1]; if (!a) continue;
    if (dir >= 0){ if (c[i].h > ext || dir === 0){ ext = c[i].h; extI = i; if (dir === 0) dir = 1; } else if (ext - c[i].l > k * a){ piv.push({ i: extI, p: ext, hi: true, conf: i }); dir = -1; ext = c[i].l; extI = i; } }
    else { if (c[i].l < ext){ ext = c[i].l; extI = i; } else if (c[i].h - ext > k * a){ piv.push({ i: extI, p: ext, hi: false, conf: i }); dir = 1; ext = c[i].h; extI = i; } }
  }
  return piv;
}
/* first touch of a level after `from`, coming from `side` (+1 = from above), then held or failed */
function react(c, A, from, to, level, side){
  for (let i = from; i < Math.min(c.length - 1, to); i++){
    const touched = side > 0 ? c[i].l <= level : c[i].h >= level;
    if (!touched) continue;
    const a = A[i]; if (!a) return null;
    for (let j = i; j < Math.min(c.length, i + 60); j++){
      const held = side > 0 ? c[j].h >= level + a : c[j].l <= level - a;   /* turned away by 1 ATR */
      const fail = side > 0 ? c[j].l <= level - a : c[j].h >= level + a;   /* pushed through by 1 ATR */
      if (held && fail) return 0;                                           /* both in one candle: count as failed */
      if (fail) return 0; if (held) return 1;
    }
    return null;
  }
  return null;
}
const tally = {}; const add = (k, g, v) => { if (v == null) return; const t = (tally[k] = tally[k] || {}); for (const key of ['ALL', g]){ t[key] = t[key] || [0, 0]; t[key][0] += v; t[key][1]++; } };

for (const sym of SYMS){
  const c = load(sym, TF), A = atr(c, 14), g = GROUP(sym);
  /* 1. Fibonacci retracements of each finished zigzag leg: real fractions vs made-up ones */
  const Z = zigzag(c, A, 4);
  for (let k = 1; k < Z.length - 1; k++){
    const a = Z[k - 1], b = Z[k], next = Z[k + 1], up = !a.hi;            /* leg a→b; up = it rose */
    const range = b.p - a.p;
    for (const f of [0.236, 0.382, 0.5, 0.618, 0.65, 0.786, 0.3, 0.45, 0.55, 0.7, 0.72, 0.85]){
      const lvl = b.p - range * f;                                          /* retracement level */
      const v = react(c, A, b.conf, next ? next.conf + 200 : c.length, lvl, up ? 1 : -1);
      add('fib ' + f, g, v);
    }
  }
  /* 2. daily pivot points (classic): R1/S1/P vs the same levels shifted by a quarter of yesterday's range */
  const day = x => Math.floor(x.t / 86400); const days = {};
  c.forEach((x, i) => { const d = day(x); (days[d] = days[d] || []).push(i); });
  const keys = Object.keys(days).map(Number).sort((a, b) => a - b);
  for (let k = 1; k < keys.length; k++){
    const y = days[keys[k - 1]].map(i => c[i]), t = days[keys[k]]; if (y.length < 5 || t.length < 5) continue;
    const H = Math.max(...y.map(x => x.h)), L = Math.min(...y.map(x => x.l)), C = y[y.length - 1].c, P = (H + L + C) / 3, R = H - L;
    const open = c[t[0]].o, end = t[t.length - 1] + 1;
    const lv = { R1: 2 * P - L, S1: 2 * P - H, R2: P + R, S2: P - R };
    for (const [name, v] of Object.entries(lv)){
      for (const [tag, lvl] of [['pivot ' + name, v], ['control ' + name, v + (name[0] === 'R' ? 1 : -1) * R * 0.25]]){
        const side = lvl > open ? -1 : 1;
        add(tag, g, react(c, A, t[0], end, lvl, side));
      }
    }
  }
  /* 3. trendlines through 3+ swing lows (or highs) that were not broken: the next touch, vs the same line moved 1 ATR away */
  const piv = Z;
  for (let k = 2; k < piv.length; k++){
    const p3 = piv[k], same = piv.slice(0, k).filter(q => q.hi === p3.hi).slice(-2); if (same.length < 2) continue;
    const [p1, p2] = same, slope = (p2.p - p1.p) / (p2.i - p1.i), at = i => p1.p + slope * (i - p1.i);
    const a3 = A[p3.i]; if (!a3 || Math.abs(p3.p - at(p3.i)) > 0.5 * a3) continue;       /* the third swing sat on the line */
    let broken = false; for (let i = p1.i; i <= p3.i && !broken; i++) broken = p3.hi ? c[i].c > at(i) + 0.3 * A[i] : c[i].c < at(i) - 0.3 * A[i];
    if (broken) continue;
    const side = p3.hi ? -1 : 1;
    for (const [tag, off] of [['trendline 3 touches', 0], ['control line 1 ATR off', -side * 1.0]]){
      /* next touch after the 3rd swing was confirmed */
      let v = null;
      for (let i = p3.conf + 1; i < Math.min(c.length - 1, p3.conf + 300); i++){
        const lvl = at(i) + off * A[p3.i], touched = side > 0 ? c[i].l <= lvl : c[i].h >= lvl; if (!touched) continue;
        const a = A[i]; for (let j = i; j < Math.min(c.length, i + 60); j++){ const L2 = at(j) + off * A[p3.i];
          const held = side > 0 ? c[j].h >= L2 + a : c[j].l <= L2 - a, fail = side > 0 ? c[j].l <= L2 - a : c[j].h >= L2 + a;
          if (fail){ v = 0; break; } if (held){ v = 1; break; } }
        break;
      }
      add(tag, g, v);
    }
  }
}
const pct = x => x ? (x[0] / x[1] * 100).toFixed(1) + '% of ' + x[1] : '—';
console.log('TF', TF, '— "held" = turned 1 ATR away before pushing 1 ATR through\n');
for (const k of Object.keys(tally).sort()) console.log(k.padEnd(26), 'ALL', pct(tally[k].ALL).padEnd(16), Object.entries(tally[k]).filter(([g]) => g !== 'ALL').map(([g, v]) => g + ' ' + pct(v)).join(' · '));
require('fs').writeFileSync(require('path').join(__dirname, 'rdata', 'levels-' + TF + '.json'), JSON.stringify(tally));
