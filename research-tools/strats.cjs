// Candidate strategies - all decided BEFORE looking at results; exits fixed a priori (2R, 24 bars)
const B = require('./bt.cjs');
const prepBase = (c) => {
  const cl = c.map(x => x.c);
  return { c, cl, e20: B.ema(cl, 20), e50: B.ema(cl, 50), e100: B.ema(cl, 100), e200: B.ema(cl, 200), A: B.atr(c, 14), R: B.rsi(cl, 14), X: B.adx(c, 14) };
};
const day = t => Math.floor(t / 86400);

/* S1 — Thrust continuation: a wide candle closing at its extreme, WITH the trend */
const thrust = (dirs, rr = 2, maxBars = 24) => ({
  name: 'Thrust continuation', warmup: 220, prep: prepBase,
  signal(x, i){
    const b = x.c[i], A = x.A[i]; if (!A || !x.e100[i] || !x.e50[i]) return null;
    const rng = b.h - b.l; if (rng < 1.3 * A) return null;
    const pos = (b.c - b.l) / (rng || 1e-12);
    if (dirs.includes(1) && pos >= 0.85 && b.c > x.e100[i] && x.e50[i] > x.e100[i])
      return { dir: 1, stopDist: 1.0 * A, tgtDist: rr * A, maxBars, atr: A };
    if (dirs.includes(-1) && pos <= 0.15 && b.c < x.e100[i] && x.e50[i] < x.e100[i])
      return { dir: -1, stopDist: 1.0 * A, tgtDist: rr * A, maxBars, atr: A };
    return null;
  },
});

/* S2 — Prior-day level retest: price broke yesterday's high earlier today, comes back to it and holds */
const pdRetest = (dirs, rr = 2, maxBars = 24) => ({
  name: 'Prior-day retest', warmup: 220,
  prep(c){
    const x = prepBase(c); const pdh = new Array(c.length).fill(null), pdl = new Array(c.length).fill(null), brokeH = new Array(c.length).fill(false), brokeL = new Array(c.length).fill(false);
    let curD = null, hi = -Infinity, lo = Infinity, prevHi = null, prevLo = null, bh = false, bl = false;
    for (let i = 0; i < c.length; i++){
      const d = day(c[i].t);
      if (d !== curD){ if (curD != null){ prevHi = hi; prevLo = lo; } curD = d; hi = -Infinity; lo = Infinity; bh = false; bl = false; }
      pdh[i] = prevHi; pdl[i] = prevLo; brokeH[i] = bh; brokeL[i] = bl;
      hi = Math.max(hi, c[i].h); lo = Math.min(lo, c[i].l);
      if (prevHi != null && c[i].h > prevHi) bh = true;
      if (prevLo != null && c[i].l < prevLo) bl = true;
    }
    return Object.assign(x, { pdh, pdl, brokeH, brokeL });
  },
  signal(x, i){
    const b = x.c[i], A = x.A[i]; if (!A || !x.e50[i]) return null;
    if (dirs.includes(1) && x.pdh[i] != null && x.brokeH[i] && b.l <= x.pdh[i] + 0.15 * A && b.c > x.pdh[i] && b.c > x.e50[i])
      return { dir: 1, stopDist: (b.c - x.pdh[i]) + 0.8 * A, tgtDist: rr * ((b.c - x.pdh[i]) + 0.8 * A), maxBars, atr: A };
    if (dirs.includes(-1) && x.pdl[i] != null && x.brokeL[i] && b.h >= x.pdl[i] - 0.15 * A && b.c < x.pdl[i] && b.c < x.e50[i])
      return { dir: -1, stopDist: (x.pdl[i] - b.c) + 0.8 * A, tgtDist: rr * ((x.pdl[i] - b.c) + 0.8 * A), maxBars, atr: A };
    return null;
  },
});

/* S3 — Inside-bar break in trend: a pause candle inside the one before, then a close beyond it */
const insideBreak = (dirs, rr = 2, maxBars = 24) => ({
  name: 'Inside-bar break', warmup: 220, prep: prepBase,
  signal(x, i){
    const m = x.c[i - 2], ib = x.c[i - 1], b = x.c[i], A = x.A[i]; if (!A || !x.e200[i]) return null;
    if (!(ib.h <= m.h && ib.l >= m.l)) return null;
    if (dirs.includes(1) && b.c > ib.h && b.c > x.e200[i] && x.e50[i] > x.e200[i]){
      const sd = Math.max(b.c - ib.l, 0.5 * A); return { dir: 1, stopDist: sd, tgtDist: rr * sd, maxBars, atr: A };
    }
    if (dirs.includes(-1) && b.c < ib.l && b.c < x.e200[i] && x.e50[i] < x.e200[i]){
      const sd = Math.max(ib.h - b.c, 0.5 * A); return { dir: -1, stopDist: sd, tgtDist: rr * sd, maxBars, atr: A };
    }
    return null;
  },
});

/* S4 — Trend-day dip: in an uptrend, buy the first 1h close back above the 20 EMA after a dip below it that did NOT break the 50 */
const emaReclaim = (dirs, rr = 2, maxBars = 24) => ({
  name: 'EMA-20 reclaim', warmup: 220, prep: prepBase,
  signal(x, i){
    const b = x.c[i], p = x.c[i - 1], A = x.A[i]; if (!A || !x.e100[i]) return null;
    if (dirs.includes(1) && x.e20[i] > x.e50[i] && x.e50[i] > x.e100[i] && p.c < x.e20[i - 1] && b.c > x.e20[i] && Math.min(p.l, b.l) > x.e50[i]){
      const sd = (b.c - Math.min(p.l, b.l)) + 0.3 * A; return { dir: 1, stopDist: sd, tgtDist: rr * sd, maxBars, atr: A };
    }
    if (dirs.includes(-1) && x.e20[i] < x.e50[i] && x.e50[i] < x.e100[i] && p.c > x.e20[i - 1] && b.c < x.e20[i] && Math.max(p.h, b.h) < x.e50[i]){
      const sd = (Math.max(p.h, b.h) - b.c) + 0.3 * A; return { dir: -1, stopDist: sd, tgtDist: rr * sd, maxBars, atr: A };
    }
    return null;
  },
});

module.exports = { thrust, pdRetest, insideBreak, emaReclaim };
