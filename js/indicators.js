/* ASTRA Terminal — pure indicator math (arrays aligned to input, null-padded) */
const IND = {
  sma(src, n){
    const out = new Array(src.length).fill(null);
    let sum = 0;
    for (let i = 0; i < src.length; i++){
      sum += src[i];
      if (i >= n) sum -= src[i - n];
      if (i >= n - 1) out[i] = sum / n;
    }
    return out;
  },

  /* EMA over an array that may have leading nulls (seeded with SMA) */
  emaOver(vals, n){
    const out = new Array(vals.length).fill(null);
    let start = -1;
    for (let i = 0; i < vals.length; i++){ if (vals[i] != null){ start = i; break; } }
    if (start < 0 || vals.length - start < n) return out;
    let sum = 0;
    for (let i = start; i < start + n; i++) sum += vals[i];
    let prev = sum / n;
    out[start + n - 1] = prev;
    const a = 2 / (n + 1);
    for (let i = start + n; i < vals.length; i++){
      prev = vals[i] * a + prev * (1 - a);
      out[i] = prev;
    }
    return out;
  },

  ema(src, n){ return IND.emaOver(src, n); },

  bb(src, n, k){
    const mid = IND.sma(src, n);
    const up = new Array(src.length).fill(null), lo = new Array(src.length).fill(null);
    for (let i = n - 1; i < src.length; i++){
      let s = 0;
      for (let j = i - n + 1; j <= i; j++){ const d = src[j] - mid[i]; s += d * d; }
      const sd = Math.sqrt(s / n);
      up[i] = mid[i] + k * sd;
      lo[i] = mid[i] - k * sd;
    }
    return { mid, up, lo };
  },

  rsi(src, n){
    const out = new Array(src.length).fill(null);
    if (src.length <= n) return out;
    let g = 0, l = 0;
    for (let i = 1; i <= n; i++){
      const d = src[i] - src[i-1];
      if (d >= 0) g += d; else l -= d;
    }
    let ag = g / n, al = l / n;
    out[n] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    for (let i = n + 1; i < src.length; i++){
      const d = src[i] - src[i-1];
      ag = (ag * (n - 1) + Math.max(d, 0)) / n;
      al = (al * (n - 1) + Math.max(-d, 0)) / n;
      out[i] = al === 0 ? 100 : 100 - 100 / (1 + ag / al);
    }
    return out;
  },

  macd(src, f, s, sig){
    const ef = IND.ema(src, f), es = IND.ema(src, s);
    const macd = src.map((_, i) => (ef[i] == null || es[i] == null) ? null : ef[i] - es[i]);
    const signal = IND.emaOver(macd, sig);
    const hist = src.map((_, i) => (macd[i] == null || signal[i] == null) ? null : macd[i] - signal[i]);
    return { macd, signal, hist };
  },

  /* session VWAP, anchored to each UTC day (uses raw exchange time) */
  vwapDaily(candles){
    const out = new Array(candles.length).fill(null);
    let day = -1, pv = 0, vv = 0;
    for (let i = 0; i < candles.length; i++){
      const c = candles[i], d = Math.floor(c.rawTime / 86400);
      if (d !== day){ day = d; pv = 0; vv = 0; }
      const tp = (c.high + c.low + c.close) / 3;
      pv += tp * c.volume; vv += c.volume;
      out[i] = vv > 0 ? pv / vv : null;
    }
    return out;
  },

  /* =====================================================================
     The MetaTrader 5 indicators that were still missing, so the catalogue
     matches every page of the MT5 help: Trend, Oscillators, Volumes and
     Bill Williams. Each follows the MT5 formula and MT5 default periods.
     ===================================================================== */

  /* Kaufman's Adaptive Moving Average — MT5 defaults: period 9, fast 2, slow 30.
     The efficiency ratio (net move over the sum of moves) decides how fast the
     average follows price: it speeds up in a trend and slows down in chop. */
  ama(src, n, fast, slow){
    const out = new Array(src.length).fill(null);
    if (src.length <= n) return out;
    const fastSC = 2 / (fast + 1), slowSC = 2 / (slow + 1);
    let prev = src[n - 1];
    out[n - 1] = prev;
    for (let i = n; i < src.length; i++){
      const change = Math.abs(src[i] - src[i - n]);
      let vol = 0;
      for (let k = i - n + 1; k <= i; k++) vol += Math.abs(src[k] - src[k - 1]);
      const er = vol > 0 ? change / vol : 0;
      const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
      prev = prev + sc * (src[i] - prev);
      out[i] = prev;
    }
    return out;
  },

  /* MT5's "Average Directional Movement Index" — the NON-Wilder one. It
     smooths +DM, −DM and the true range with an ordinary EMA, then the DX with
     another EMA. The existing adx() is the Wilder variant (MT5 calls that
     "ADX Wilder"). Both are offered, as in MetaTrader. */
  adxClassic(candles, n){
    const len = candles.length;
    const out = { adx: new Array(len).fill(null), pdi: new Array(len).fill(null), mdi: new Array(len).fill(null) };
    if (len <= n + 1) return out;
    const tr = new Array(len).fill(null), pdm = new Array(len).fill(null), mdm = new Array(len).fill(null);
    for (let i = 1; i < len; i++){
      const c = candles[i], p = candles[i - 1];
      tr[i] = Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close));
      const up = c.high - p.high, dn = p.low - c.low;
      pdm[i] = (up > dn && up > 0) ? up : 0;
      mdm[i] = (dn > up && dn > 0) ? dn : 0;
    }
    const eTr = IND.emaOver(tr, n), eP = IND.emaOver(pdm, n), eM = IND.emaOver(mdm, n);
    const dx = new Array(len).fill(null);
    for (let i = 0; i < len; i++){
      if (eTr[i] == null || !(eTr[i] > 0)) continue;
      const pdi = 100 * eP[i] / eTr[i], mdi = 100 * eM[i] / eTr[i];
      out.pdi[i] = pdi; out.mdi[i] = mdi;
      dx[i] = (pdi + mdi) > 0 ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0;
    }
    out.adx = IND.emaOver(dx, n);
    return out;
  },

  /* Double and Triple EMA — MT5 default period 14. Each subtracts the lag that
     stacking EMAs introduces, so the line hugs price more closely than a
     single EMA of the same period. */
  dema(src, n){
    const e1 = IND.ema(src, n), e2 = IND.emaOver(e1, n);
    return src.map((_, i) => (e1[i] == null || e2[i] == null) ? null : 2 * e1[i] - e2[i]);
  },
  tema(src, n){
    const e1 = IND.ema(src, n), e2 = IND.emaOver(e1, n), e3 = IND.emaOver(e2, n);
    return src.map((_, i) => (e1[i] == null || e2[i] == null || e3[i] == null) ? null : 3 * e1[i] - 3 * e2[i] + e3[i]);
  },

  /* Fractal Adaptive Moving Average (Ehlers) — MT5 default period 14, which
     must be even because the window is split in two halves. The fractal
     dimension of the recent range sets the smoothing: a jagged range (D near
     2) slows the average right down, a clean trend (D near 1) lets it run. */
  frama(candles, n){
    const len = candles.length;
    const out = new Array(len).fill(null);
    const N = Math.max(2, n % 2 === 0 ? n : n + 1), half = N / 2;
    if (len < N) return out;
    const hi = candles.map(c => c.high), lo = candles.map(c => c.low), cl = candles.map(c => c.close);
    let prev = cl[N - 1];
    out[N - 1] = prev;
    const rng = (a, b) => { let h = -Infinity, l = Infinity; for (let k = a; k <= b; k++){ if (hi[k] > h) h = hi[k]; if (lo[k] < l) l = lo[k]; } return h - l; };
    for (let i = N; i < len; i++){
      const n1 = rng(i - N + 1, i - half) / half;
      const n2 = rng(i - half + 1, i) / half;
      const n3 = rng(i - N + 1, i) / N;
      let d = 1;
      if (n1 + n2 > 0 && n3 > 0) d = (Math.log(n1 + n2) - Math.log(n3)) / Math.log(2);
      let alpha = Math.exp(-4.6 * (d - 1));
      alpha = Math.min(1, Math.max(0.01, alpha));
      prev = alpha * cl[i] + (1 - alpha) * prev;
      out[i] = prev;
    }
    return out;
  },

  /* Variable Index Dynamic Average (Chande) — MT5 defaults: CMO period 9,
     EMA period 12. The Chande Momentum Oscillator scales the EMA's smoothing
     factor, so the average adapts to how one-directional recent movement is. */
  vidya(src, cmoLen, emaLen){
    const out = new Array(src.length).fill(null);
    if (src.length <= cmoLen) return out;
    const alpha = 2 / (emaLen + 1);
    let prev = src[cmoLen];
    out[cmoLen] = prev;
    for (let i = cmoLen + 1; i < src.length; i++){
      let up = 0, dn = 0;
      for (let k = i - cmoLen + 1; k <= i; k++){
        const d = src[k] - src[k - 1];
        if (d > 0) up += d; else dn -= d;
      }
      const cmo = (up + dn) > 0 ? Math.abs((up - dn) / (up + dn)) : 0;
      prev = alpha * cmo * src[i] + (1 - alpha * cmo) * prev;
      out[i] = prev;
    }
    return out;
  },

  /* Accumulation/Distribution — a running total of volume weighted by where
     the close sat inside the bar's range. No parameters, as in MT5. */
  ad(candles){
    const out = new Array(candles.length).fill(null);
    let acc = 0;
    for (let i = 0; i < candles.length; i++){
      const c = candles[i];
      const range = c.high - c.low;
      const clv = range > 0 ? ((c.close - c.low) - (c.high - c.close)) / range : 0;
      acc += clv * (c.volume || 0);
      out[i] = acc;
    }
    return out;
  },

  /* Accelerator Oscillator (Bill Williams) — AO minus a 5-period SMA of AO. */
  ac(candles){
    const ao = IND.ao(candles);
    const s = IND.smaOver(ao, 5);
    return ao.map((v, i) => (v == null || s[i] == null) ? null : v - s[i]);
  },

  /* Gator Oscillator (Bill Williams) — how far apart the Alligator's lines are:
     the upper histogram is jaw minus teeth, the lower one is teeth minus lips
     drawn downwards. A bar is "growing" when the gap widened since the last
     bar, and MT5 colours it green then, red when it narrowed. */
  gator(candles){
    const a = IND.alligator(candles);
    const up = candles.map((_, i) => (a.jaw[i] == null || a.teeth[i] == null) ? null : Math.abs(a.jaw[i] - a.teeth[i]));
    const dn = candles.map((_, i) => (a.teeth[i] == null || a.lips[i] == null) ? null : -Math.abs(a.teeth[i] - a.lips[i]));
    return { up, dn };
  },

  /* Market Facilitation Index (Bill Williams) — bar range per unit of volume,
     with MT5's four colours: both MFI and volume up (green: the move is being
     backed), both down (brown: fading), MFI up on falling volume (blue: fake),
     MFI down on rising volume (pink: squat). */
  bwmfi(candles){
    const out = new Array(candles.length).fill(null), state = new Array(candles.length).fill(null);
    for (let i = 0; i < candles.length; i++){
      const c = candles[i];
      const v = c.volume || 0;
      out[i] = v > 0 ? (c.high - c.low) / v : null;
      if (i > 0 && out[i] != null && out[i - 1] != null){
        const mUp = out[i] > out[i - 1], vUp = v > (candles[i - 1].volume || 0);
        state[i] = mUp && vUp ? 'green' : (!mUp && !vUp) ? 'brown' : (mUp && !vUp) ? 'blue' : 'pink';
      }
    }
    return { mfi: out, state };
  },

  /* ---------- support and resistance ----------
     A level is a price the market has turned at more than once. Swing highs
     and lows (a bar higher / lower than `wing` bars either side) are collected,
     then any that sit within `tol` of one another are merged into one level
     whose strength is how many times it was touched, weighted towards the
     recent ones. A level touched from both sides counts as both.

     Returned newest-strongest first: [{ price, touches, kind, last, score }],
     kind being 'support' (price turned up there), 'resistance' (turned down)
     or 'both'. */
  srLevels(candles, opts){
    const o = Object.assign({ wing: 3, lookback: 300, tolAtr: 0.35, max: 8 }, opts || {});
    const n = candles.length;
    if (n < o.wing * 2 + 5) return [];
    const from = Math.max(o.wing, n - o.lookback);
    const atrArr = IND.atr(candles, 14);
    const A = atrArr[n - 1] || (candles[n - 1].high - candles[n - 1].low) || 1e-9;
    const tol = A * o.tolAtr;

    const pts = [];
    for (let i = from; i < n - o.wing; i++){
      let hi = true, lo = true;
      for (let k = 1; k <= o.wing; k++){
        if (candles[i].high <= candles[i - k].high || candles[i].high <= candles[i + k].high) hi = false;
        if (candles[i].low >= candles[i - k].low || candles[i].low >= candles[i + k].low) lo = false;
        if (!hi && !lo) break;
      }
      if (hi) pts.push({ price: candles[i].high, i, kind: 'resistance' });
      if (lo) pts.push({ price: candles[i].low, i, kind: 'support' });
    }
    if (!pts.length) return [];

    /* merge into levels */
    pts.sort((a, b) => a.price - b.price);
    const levels = [];
    for (const p of pts){
      const L = levels[levels.length - 1];
      if (L && Math.abs(p.price - L.sum / L.count) <= tol){
        L.sum += p.price; L.count++;
        L.last = Math.max(L.last, p.i);
        L.kinds[p.kind] = (L.kinds[p.kind] || 0) + 1;
        L.recency += 1 - (n - 1 - p.i) / o.lookback;
      } else {
        levels.push({ sum: p.price, count: 1, last: p.i, kinds: { [p.kind]: 1 },
                      recency: 1 - (n - 1 - p.i) / o.lookback });
      }
    }
    return levels.map(L => ({
      price: L.sum / L.count,
      touches: L.count,
      last: L.last,
      kind: L.kinds.support && L.kinds.resistance ? 'both' : (L.kinds.support ? 'support' : 'resistance'),
      /* touches matter most; a recent level matters more than an old one */
      score: L.count + L.recency,
    })).sort((a, b) => b.score - a.score).slice(0, o.max);
  },

  /* the nearest level on each side of a price, from a srLevels() result */
  srNear(levels, price){
    let below = null, above = null;
    for (const L of levels){
      if (L.price <= price && (!below || L.price > below.price)) below = L;
      if (L.price >= price && (!above || L.price < above.price)) above = L;
    }
    return { below, above };
  },

  /* SMA over an array that may have leading nulls */
  smaOver(vals, n){
    const out = new Array(vals.length).fill(null);
    let sum = 0, cnt = 0;
    for (let i = 0; i < vals.length; i++){
      if (vals[i] == null){ continue; }
      sum += vals[i]; cnt++;
      if (cnt > n){ sum -= vals[i - n] != null ? vals[i - n] : 0; cnt = n; }
      if (cnt === n) out[i] = sum / n;
    }
    return out;
  },

  /* Wilder ATR */
  atr(candles, n){
    const out = new Array(candles.length).fill(null);
    if (candles.length <= n) return out;
    const tr = candles.map((c, i) => i === 0
      ? c.high - c.low
      : Math.max(c.high - c.low, Math.abs(c.high - candles[i-1].close), Math.abs(c.low - candles[i-1].close)));
    let a = 0;
    for (let i = 0; i < n; i++) a += tr[i];
    a /= n;
    out[n - 1] = a;
    for (let i = n; i < candles.length; i++){
      a = (a * (n - 1) + tr[i]) / n;
      out[i] = a;
    }
    return out;
  },

  /* SuperTrend — returns {up, down}: line values split by trend direction */
  supertrend(candles, n, mult){
    const len = candles.length;
    const up = new Array(len).fill(null), down = new Array(len).fill(null);
    const atr = IND.atr(candles, n);
    let fub = null, flb = null, prevSt = null, prevTrendUp = true;
    for (let i = 0; i < len; i++){
      if (atr[i] == null) continue;
      const c = candles[i], hl2 = (c.high + c.low) / 2;
      const ub = hl2 + mult * atr[i], lb = hl2 - mult * atr[i];
      const pc = i > 0 ? candles[i-1].close : c.close;
      fub = (fub == null || ub < fub || pc > fub) ? ub : fub;
      flb = (flb == null || lb > flb || pc < flb) ? lb : flb;
      let trendUp;
      if (prevSt == null) trendUp = c.close >= flb;
      else if (prevTrendUp) trendUp = c.close >= flb ? true : false;
      else trendUp = c.close > fub ? true : false;
      const st = trendUp ? flb : fub;
      if (trendUp) up[i] = st; else down[i] = st;
      prevSt = st; prevTrendUp = trendUp;
    }
    return { up, down };
  },

  /* Stochastic %K/%D */
  stoch(candles, n, smooth, dLen){
    const len = candles.length;
    const kRaw = new Array(len).fill(null);
    for (let i = n - 1; i < len; i++){
      let hi = -Infinity, lo = Infinity;
      for (let j = i - n + 1; j <= i; j++){
        if (candles[j].high > hi) hi = candles[j].high;
        if (candles[j].low < lo) lo = candles[j].low;
      }
      kRaw[i] = hi === lo ? 50 : (candles[i].close - lo) / (hi - lo) * 100;
    }
    const k = IND.smaOver(kRaw, smooth);
    const d = IND.smaOver(k, dLen);
    return { k, d };
  },

  /* Wilder ADX with +DI/-DI */
  adx(candles, n){
    const len = candles.length;
    const out = { adx: new Array(len).fill(null), pdi: new Array(len).fill(null), mdi: new Array(len).fill(null) };
    if (len <= n * 2) return out;
    const tr = [], pdm = [], mdm = [];
    for (let i = 1; i < len; i++){
      const c = candles[i], p = candles[i - 1];
      tr.push(Math.max(c.high - c.low, Math.abs(c.high - p.close), Math.abs(c.low - p.close)));
      const up = c.high - p.high, dn = p.low - c.low;
      pdm.push(up > dn && up > 0 ? up : 0);
      mdm.push(dn > up && dn > 0 ? dn : 0);
    }
    let sTr = 0, sP = 0, sM = 0;
    for (let i = 0; i < n; i++){ sTr += tr[i]; sP += pdm[i]; sM += mdm[i]; }
    const dx = [];
    for (let i = n; i <= tr.length; i++){
      const pdi = sTr ? 100 * sP / sTr : 0, mdi = sTr ? 100 * sM / sTr : 0;
      out.pdi[i] = pdi; out.mdi[i] = mdi;
      dx.push((pdi + mdi) ? 100 * Math.abs(pdi - mdi) / (pdi + mdi) : 0);
      if (i < tr.length){ sTr = sTr - sTr / n + tr[i]; sP = sP - sP / n + pdm[i]; sM = sM - sM / n + mdm[i]; }
    }
    let a = 0;
    for (let i = 0; i < n && i < dx.length; i++) a += dx[i];
    a /= Math.min(n, dx.length);
    out.adx[n * 2] = a;
    for (let i = n + 1; i < dx.length; i++){
      a = (a * (n - 1) + dx[i]) / n;
      out.adx[i + n] = a;
    }
    return out;
  },

  /* Donchian channel of the PREVIOUS n bars (for breakout checks) */
  donchian(candles, n){
    const len = candles.length;
    const hi = new Array(len).fill(null), lo = new Array(len).fill(null);
    for (let i = n; i < len; i++){
      let h = -Infinity, l = Infinity;
      for (let j = i - n; j < i; j++){
        if (candles[j].high > h) h = candles[j].high;
        if (candles[j].low < l) l = candles[j].low;
      }
      hi[i] = h; lo[i] = l;
    }
    return { hi, lo };
  },

  /* Ichimoku conversion/base lines */
  ichimoku(candles, t, k){
    const len = candles.length;
    const mid = n => {
      const out = new Array(len).fill(null);
      for (let i = n - 1; i < len; i++){
        let h = -Infinity, l = Infinity;
        for (let j = i - n + 1; j <= i; j++){
          if (candles[j].high > h) h = candles[j].high;
          if (candles[j].low < l) l = candles[j].low;
        }
        out[i] = (h + l) / 2;
      }
      return out;
    };
    return { tenkan: mid(t), kijun: mid(k) };
  },

  /* ---------- price source ("Apply to", as in MetaTrader) ---------- */
  SOURCES: [
    ['close', 'Close'], ['open', 'Open'], ['high', 'High'], ['low', 'Low'],
    ['median', 'Median (H+L)/2'], ['typical', 'Typical (H+L+C)/3'], ['weighted', 'Weighted (H+L+2C)/4'],
  ],
  src(candles, s){
    switch (s){
      case 'open':     return candles.map(c => c.open);
      case 'high':     return candles.map(c => c.high);
      case 'low':      return candles.map(c => c.low);
      case 'median':   return candles.map(c => (c.high + c.low) / 2);
      case 'typical':  return candles.map(c => (c.high + c.low + c.close) / 3);
      case 'weighted': return candles.map(c => (c.high + c.low + 2 * c.close) / 4);
      default:         return candles.map(c => c.close);
    }
  },

  /* ---------- extra averages ---------- */
  wma(v, n){
    const out = new Array(v.length).fill(null);
    const denom = n * (n + 1) / 2;
    for (let i = n - 1; i < v.length; i++){
      let s = 0;
      for (let j = 0; j < n; j++) s += v[i - n + 1 + j] * (j + 1);
      out[i] = s / denom;
    }
    return out;
  },
  /* Wilder's smoothed average, used by the Alligator */
  smma(v, n){
    const out = new Array(v.length).fill(null);
    if (v.length < n) return out;
    let sum = 0;
    for (let i = 0; i < n; i++) sum += v[i];
    let prev = sum / n;
    out[n - 1] = prev;
    for (let i = n; i < v.length; i++){
      prev = (prev * (n - 1) + v[i]) / n;
      out[i] = prev;
    }
    return out;
  },
  /* move a series forward (+) or back (-) in time */
  shift(arr, by){
    const out = new Array(arr.length).fill(null);
    for (let i = 0; i < arr.length; i++){
      const j = i - by;
      if (j >= 0 && j < arr.length) out[i] = arr[j];
    }
    return out;
  },

  stdev(v, n){
    const m = IND.sma(v, n);
    const out = new Array(v.length).fill(null);
    for (let i = n - 1; i < v.length; i++){
      let s = 0;
      for (let j = i - n + 1; j <= i; j++) s += (v[j] - m[i]) ** 2;
      out[i] = Math.sqrt(s / n);
    }
    return out;
  },

  momentum(v, n){
    const out = new Array(v.length).fill(null);
    for (let i = n; i < v.length; i++) out[i] = v[i - n] ? v[i] / v[i - n] * 100 : null;
    return out;
  },

  envelopes(v, n, pct){
    const m = IND.sma(v, n);
    return {
      mid: m,
      up: m.map(x => x == null ? null : x * (1 + pct / 100)),
      lo: m.map(x => x == null ? null : x * (1 - pct / 100)),
    };
  },

  /* ---------- oscillators ---------- */
  cci(candles, n){
    const tp = candles.map(c => (c.high + c.low + c.close) / 3);
    const m = IND.sma(tp, n);
    const out = new Array(candles.length).fill(null);
    for (let i = n - 1; i < candles.length; i++){
      let dev = 0;
      for (let j = i - n + 1; j <= i; j++) dev += Math.abs(tp[j] - m[i]);
      dev /= n;
      out[i] = dev ? (tp[i] - m[i]) / (0.015 * dev) : 0;
    }
    return out;
  },

  williamsR(candles, n){
    const out = new Array(candles.length).fill(null);
    for (let i = n - 1; i < candles.length; i++){
      let hi = -Infinity, lo = Infinity;
      for (let j = i - n + 1; j <= i; j++){
        if (candles[j].high > hi) hi = candles[j].high;
        if (candles[j].low < lo) lo = candles[j].low;
      }
      out[i] = hi === lo ? -50 : (hi - candles[i].close) / (hi - lo) * -100;
    }
    return out;
  },

  demarker(candles, n){
    const len = candles.length;
    const deMax = new Array(len).fill(0), deMin = new Array(len).fill(0);
    for (let i = 1; i < len; i++){
      deMax[i] = Math.max(candles[i].high - candles[i - 1].high, 0);
      deMin[i] = Math.max(candles[i - 1].low - candles[i].low, 0);
    }
    const a = IND.sma(deMax, n), b = IND.sma(deMin, n);
    return a.map((x, i) => (x == null || b[i] == null) ? null : ((x + b[i]) ? x / (x + b[i]) : 0.5));
  },

  ao(candles){
    const hl2 = candles.map(c => (c.high + c.low) / 2);
    const f = IND.sma(hl2, 5), s = IND.sma(hl2, 34);
    return f.map((x, i) => (x == null || s[i] == null) ? null : x - s[i]);
  },

  /* ---------- volume based ---------- */
  obv(candles){
    const out = new Array(candles.length).fill(null);
    let v = 0;
    out[0] = 0;
    for (let i = 1; i < candles.length; i++){
      if (candles[i].close > candles[i - 1].close) v += candles[i].volume;
      else if (candles[i].close < candles[i - 1].close) v -= candles[i].volume;
      out[i] = v;
    }
    return out;
  },

  mfi(candles, n){
    const len = candles.length;
    const out = new Array(len).fill(null);
    const tp = candles.map(c => (c.high + c.low + c.close) / 3);
    for (let i = n; i < len; i++){
      let pos = 0, neg = 0;
      for (let j = i - n + 1; j <= i; j++){
        const flow = tp[j] * candles[j].volume;
        if (tp[j] > tp[j - 1]) pos += flow;
        else if (tp[j] < tp[j - 1]) neg += flow;
      }
      out[i] = neg === 0 ? 100 : 100 - 100 / (1 + pos / neg);
    }
    return out;
  },

  forceIndex(candles, n){
    const raw = candles.map((c, i) => i === 0 ? 0 : (c.close - candles[i - 1].close) * c.volume);
    return IND.emaOver(raw, n);
  },

  /* ---------- channels and stops ---------- */
  keltner(candles, n, mult){
    const closes = candles.map(c => c.close);
    const mid = IND.ema(closes, n);
    const atr = IND.atr(candles, n);
    return {
      mid,
      up: mid.map((m, i) => (m == null || atr[i] == null) ? null : m + mult * atr[i]),
      lo: mid.map((m, i) => (m == null || atr[i] == null) ? null : m - mult * atr[i]),
    };
  },

  /* Parabolic SAR — the classic trailing stop */
  psar(candles, step, max){
    const len = candles.length;
    const out = new Array(len).fill(null);
    if (len < 3) return out;
    let up = candles[1].close >= candles[0].close;
    let sar = up ? candles[0].low : candles[0].high;
    let ep = up ? candles[0].high : candles[0].low;
    let af = step;
    for (let i = 1; i < len; i++){
      sar = sar + af * (ep - sar);
      if (up){
        sar = Math.min(sar, candles[i - 1].low, candles[i > 1 ? i - 2 : 0].low);
        if (candles[i].low < sar){ up = false; sar = ep; ep = candles[i].low; af = step; }
        else if (candles[i].high > ep){ ep = candles[i].high; af = Math.min(af + step, max); }
      } else {
        sar = Math.max(sar, candles[i - 1].high, candles[i > 1 ? i - 2 : 0].high);
        if (candles[i].high > sar){ up = true; sar = ep; ep = candles[i].high; af = step; }
        else if (candles[i].low < ep){ ep = candles[i].low; af = Math.min(af + step, max); }
      }
      out[i] = sar;
    }
    return out;
  },

  /* Bill Williams Alligator — three smoothed averages pushed into the future */
  alligator(candles){
    const med = candles.map(c => (c.high + c.low) / 2);
    return {
      jaw: IND.shift(IND.smma(med, 13), 8),
      teeth: IND.shift(IND.smma(med, 8), 5),
      lips: IND.shift(IND.smma(med, 5), 3),
    };
  },

  /* five-bar fractals (turning points) */
  fractals(candles){
    const len = candles.length;
    const up = new Array(len).fill(null), dn = new Array(len).fill(null);
    for (let i = 2; i < len - 2; i++){
      const h = candles[i].high, l = candles[i].low;
      if (h > candles[i-1].high && h > candles[i-2].high && h > candles[i+1].high && h > candles[i+2].high) up[i] = h;
      if (l < candles[i-1].low && l < candles[i-2].low && l < candles[i+1].low && l < candles[i+2].low) dn[i] = l;
    }
    return { up, dn };
  },

  /* full Ichimoku, including the cloud and the lagging line */
  ichimokuFull(candles, t, k, b){
    const mid = n => {
      const out = new Array(candles.length).fill(null);
      for (let i = n - 1; i < candles.length; i++){
        let hi = -Infinity, lo = Infinity;
        for (let j = i - n + 1; j <= i; j++){
          if (candles[j].high > hi) hi = candles[j].high;
          if (candles[j].low < lo) lo = candles[j].low;
        }
        out[i] = (hi + lo) / 2;
      }
      return out;
    };
    const tenkan = mid(t), kijun = mid(k);
    const spanA = tenkan.map((x, i) => (x == null || kijun[i] == null) ? null : (x + kijun[i]) / 2);
    return {
      tenkan, kijun,
      senkouA: IND.shift(spanA, k),
      senkouB: IND.shift(mid(b), k),
      chikou: IND.shift(candles.map(c => c.close), -k),
    };
  },

  /* classic daily pivot levels, drawn on every bar of the day */
  pivots(candles){
    const len = candles.length;
    const keys = ['p', 'r1', 's1', 'r2', 's2'];
    const out = {}; keys.forEach(k => out[k] = new Array(len).fill(null));
    let day = -1, prev = null, cur = null;
    for (let i = 0; i < len; i++){
      const d = Math.floor(candles[i].rawTime / 86400);
      if (d !== day){
        if (cur) prev = cur;
        day = d;
        cur = { h: candles[i].high, l: candles[i].low, c: candles[i].close };
      } else {
        cur.h = Math.max(cur.h, candles[i].high);
        cur.l = Math.min(cur.l, candles[i].low);
        cur.c = candles[i].close;
      }
      if (prev){
        const p = (prev.h + prev.l + prev.c) / 3;
        out.p[i] = p;
        out.r1[i] = 2 * p - prev.l;
        out.s1[i] = 2 * p - prev.h;
        out.r2[i] = p + (prev.h - prev.l);
        out.s2[i] = p - (prev.h - prev.l);
      }
    }
    return out;
  },

  heikinAshi(candles){
    const out = [];
    let prevO = null, prevC = null;
    for (const c of candles){
      const haC = (c.open + c.high + c.low + c.close) / 4;
      const haO = (prevO == null) ? (c.open + c.close) / 2 : (prevO + prevC) / 2;
      out.push({
        rawTime: c.rawTime, time: c.time,
        open: haO,
        high: Math.max(c.high, haO, haC),
        low: Math.min(c.low, haO, haC),
        close: haC,
        volume: c.volume, quoteVol: c.quoteVol,
      });
      prevO = haO; prevC = haC;
    }
    return out;
  },
};
