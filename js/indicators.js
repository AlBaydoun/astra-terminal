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
