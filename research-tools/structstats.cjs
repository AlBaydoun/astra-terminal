// Research run 3b — the probability ladder used by the Structure tool.
// For the last finished swing (zigzag, 4 ATR), per market group and timeframe:
//   hold[f]   = when price pulls back to f of the swing, how often it turns back 1 ATR (with the swing)
//               before pushing 1 ATR deeper
//   reach[f][t] = after it held at f, how often it then reaches t × the swing (1 = the swing's end again,
//               1.272 / 1.618 = the extensions) BEFORE it breaks the swing's start (the swing is then over)
// The numbers go to js/research/structure-stats.js.
const { load, atr, SYMS, GROUP } = require('./bt.cjs');
const FR = [0.236, 0.382, 0.5, 0.618, 0.786], TG = [1, 1.272, 1.618];
function zigzag(c, A, k){ const piv = []; let dir = 0, ext = 0, extI = 0;
  for (let i = 15; i < c.length; i++){ const a = A[i] || A[i - 1]; if (!a) continue;
    if (dir >= 0){ if (c[i].h > ext || dir === 0){ ext = c[i].h; extI = i; if (dir === 0) dir = 1; } else if (ext - c[i].l > k * a){ piv.push({ i: extI, p: ext, hi: true, conf: i }); dir = -1; ext = c[i].l; extI = i; } }
    else { if (c[i].l < ext){ ext = c[i].l; extI = i; } else if (c[i].h - ext > k * a){ piv.push({ i: extI, p: ext, hi: false, conf: i }); dir = 1; ext = c[i].h; extI = i; } } }
  return piv; }
const out = {};
for (const tf of ['1h', '4h']){
  const T = {};
  for (const sym of SYMS){
    const c = load(sym, tf), A = atr(c, 14), g = GROUP(sym), Z = zigzag(c, A, 4);
    for (const key of ['ALL', g]){ T[key] = T[key] || { legs: 0, hold: {}, reach: {} }; }
    for (let k = 1; k < Z.length - 1; k++){
      const a = Z[k - 1], b = Z[k], s = a.hi ? -1 : 1, range = b.p - a.p;     /* s = +1 for an up swing */
      for (const key of ['ALL', g]) T[key].legs++;
      for (const f of FR){
        const lvl = b.p - range * f; let res = null, at = -1;
        for (let i = b.conf; i < Math.min(c.length - 1, b.conf + 400); i++){
          if (!(s > 0 ? c[i].l <= lvl : c[i].h >= lvl)) continue;
          const av = A[i]; for (let j = i; j < Math.min(c.length, i + 60); j++){
            const held = s > 0 ? c[j].h >= lvl + av : c[j].l <= lvl - av, fail = s > 0 ? c[j].l <= lvl - av : c[j].h >= lvl + av;
            if (fail){ res = 0; break; } if (held){ res = 1; at = j; break; } }
          break;
        }
        if (res == null) continue;
        for (const key of ['ALL', g]){ const h = (T[key].hold[f] = T[key].hold[f] || [0, 0]); h[0] += res; h[1]++; }
        if (res !== 1) continue;
        for (const t of TG){
          const target = a.p + range * t; let hit = 0;
          for (let j = at; j < Math.min(c.length, at + 400); j++){
            if (s > 0 ? c[j].l <= a.p : c[j].h >= a.p) break;                  /* the swing's start broken: over */
            if (s > 0 ? c[j].h >= target : c[j].l <= target){ hit = 1; break; }
          }
          for (const key of ['ALL', g]){ const r = ((T[key].reach[f] = T[key].reach[f] || {})[t] = T[key].reach[f][t] || [0, 0]); r[0] += hit; r[1]++; }
        }
      }
    }
  }
  /* to percentages */
  const P = {}; for (const [k, v] of Object.entries(T)){ P[k] = { legs: v.legs, hold: {}, reach: {} };
    for (const f of FR){ const h = v.hold[f]; if (h) P[k].hold[f] = [+(h[0] / h[1] * 100).toFixed(1), h[1]];
      P[k].reach[f] = {}; for (const t of TG){ const r = (v.reach[f] || {})[t]; if (r) P[k].reach[f][t] = [+(r[0] / r[1] * 100).toFixed(1), r[1]]; } } }
  out[tf] = P;
  console.log('\n== ' + tf + ' ==');
  for (const [k, v] of Object.entries(P)) console.log(k.padEnd(8), 'legs', v.legs, '| hold', FR.map(f => f + ':' + (v.hold[f] || ['-'])[0] + '%').join(' '), '| after holding at 61.8%: back to the swing end', ((v.reach[0.618] || {})[1] || ['-'])[0] + '%, 127%', ((v.reach[0.618] || {})[1.272] || ['-'])[0] + '%, 162%', ((v.reach[0.618] || {})[1.618] || ['-'])[0] + '%');
}
const fs = require('fs');
fs.writeFileSync(require('path').join(__dirname, '..', 'js', 'research', 'structure-stats.js'),
  '/* ASTRA — measured by research-tools/structstats.cjs (research run 3, ' + new Date().toISOString().slice(0, 10) + ').\n   Per timeframe and market group: hold[fraction] = [% that turned back 1 ATR before pushing 1 ATR deeper, sample];\n   reach[fraction][target] = [% that then reached target × swing before the swing start broke, sample]. Read by js/autostruct.js. */\nconst STRUCT_STATS = ' + JSON.stringify(out) + ';\n');
