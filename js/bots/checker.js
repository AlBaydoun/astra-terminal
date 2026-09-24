/* ASTRA Terminal — the Strategy Checker.

   It takes every signal ASTRA knows — the candle patterns (Hammer, Bullish
   Engulfing…), indicator events (RSI back above 30, MACD crossing its signal,
   SuperTrend flipping…) and every bot you run — and replays each of them over
   real JustMarkets history, on every market, pair and timeframe. For every time
   a signal fired it measures what price did NEXT:

     · did it reach +0.1 / 0.2 / 0.3 / 0.5 / 0.75 / 1 / 1.5 / 2 / 3 % in the
       signal's favour, and after how many candles?
     · did it first go −0.2 … −2 % against it (the stop)?
     · how far did it run at best (and how far against, at worst)?
     · for a bot, did it reach the bot's OWN target before its own stop, and by
       how much did it overshoot it?

   Nothing is a guess: a signal is read on a CLOSED candle and the trade starts
   at the open of the next one, exactly as a bot would have taken it. If the
   target and the stop fall inside the same candle, it counts as a FAIL (the
   order inside a candle cannot be known — the pessimistic reading is the honest
   one).

   Besides every signal on its own, each occurrence carries the market context
   at that moment (RSI low/high, above/below the 200 EMA, trend, ADX, volume
   spike, squeeze…). That is what lets the brain test mixes such as "MACD cross
   while RSI is under 30" without scanning again: it combines signals with
   contexts, keeps the mixes that beat the signal on its own on BOTH halves of
   the history, and turns the best into plain recommendations.

   Storage: IndexedDB (astra_checker) — one record per pair × timeframe, rebuilt
   from fresh history each time it is rescanned, so nothing is ever counted
   twice. Settings and the brain's notebook: localStorage astra_checker. Paper
   bots it creates: astra_checker_bots. Reading and paper only — nothing here can
   reach a broker. */
const Checker = {

  TH: [0.1, 0.2, 0.3, 0.5, 0.75, 1, 1.5, 2, 3],        /* favourable thresholds, % */
  ST: [0.2, 0.3, 0.5, 0.75, 1, 1.5, 2],                /* adverse (stop) thresholds, % */
  TFS: ['5m', '15m', '1h', '4h', '1d'],
  HORIZON: { '1m': 120, '5m': 96, '15m': 96, '1h': 72, '4h': 60, '1d': 30 },
  TF_SEC: { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 },
  REFRESH_H: { '5m': 3, '15m': 6, '1h': 12, '4h': 24, '1d': 48 },  /* rescan a pair after this many hours */
  LIMIT: 2000,                                           /* candles per scan */
  WARM: 210,
  U8: 20,                                                /* bytes per row: barsMfe, fav×9, adv×7, tpBar, slBar, spare */

  /* ================= the signals ================= */
  EVENTS: null,
  buildEvents(){
    const x = (a, b, j) => a[j - 1] != null && b[j - 1] != null && a[j] != null && b[j] != null && a[j - 1] <= b[j - 1] && a[j] > b[j];
    const xv = (a, v, j) => a[j - 1] != null && a[j] != null && a[j - 1] <= v && a[j] > v;
    const pat = name => (A, j) => (A.pat[j] || []).some(p => p.name === name);
    const E = [
      /* ---- candles ---- */
      ['hammer', 'Hammer', 'candles', 1, pat('Hammer')],
      ['shootingStar', 'Shooting star', 'candles', -1, pat('Shooting star')],
      ['bullEngulf', 'Bullish engulfing', 'candles', 1, pat('Bullish engulfing')],
      ['bearEngulf', 'Bearish engulfing', 'candles', -1, pat('Bearish engulfing')],
      ['morningStar', 'Morning star', 'candles', 1, pat('Morning star')],
      ['eveningStar', 'Evening star', 'candles', -1, pat('Evening star')],
      ['soldiers', 'Three white soldiers', 'candles', 1, pat('Three soldiers')],
      ['crows', 'Three black crows', 'candles', -1, pat('Three crows')],
      ['tweezerBottom', 'Tweezer bottom', 'candles', 1, pat('Tweezer bottom')],
      ['tweezerTop', 'Tweezer top', 'candles', -1, pat('Tweezer top')],
      ['insideUp', 'Inside bar → break up', 'candles', 1, (A, j) => { const c = A.c; return j > 2 && c[j - 1].high <= c[j - 2].high && c[j - 1].low >= c[j - 2].low && c[j].close > c[j - 1].high; }],
      ['insideDown', 'Inside bar → break down', 'candles', -1, (A, j) => { const c = A.c; return j > 2 && c[j - 1].high <= c[j - 2].high && c[j - 1].low >= c[j - 2].low && c[j].close < c[j - 1].low; }],
      ['haUp', 'Heikin-Ashi turns green', 'candles', 1, (A, j) => A.ha[j - 1].close < A.ha[j - 1].open && A.ha[j].close > A.ha[j].open && A.ha[j].low >= Math.min(A.ha[j].open, A.ha[j].close) - 1e-12],
      ['haDown', 'Heikin-Ashi turns red', 'candles', -1, (A, j) => A.ha[j - 1].close > A.ha[j - 1].open && A.ha[j].close < A.ha[j].open && A.ha[j].high <= Math.max(A.ha[j].open, A.ha[j].close) + 1e-12],
      /* ---- indicators ---- */
      ['rsiUp30', 'RSI back above 30', 'indicators', 1, (A, j) => xv(A.rsi, 30, j)],
      ['rsiDown70', 'RSI back below 70', 'indicators', -1, (A, j) => A.rsi[j - 1] != null && A.rsi[j] != null && A.rsi[j - 1] >= 70 && A.rsi[j] < 70],
      ['rsiBullDiv', 'RSI bullish divergence', 'indicators', 1, (A, j) => this.div(A, j, 1)],
      ['rsiBearDiv', 'RSI bearish divergence', 'indicators', -1, (A, j) => this.div(A, j, -1)],
      ['macdUp', 'MACD crosses above signal', 'indicators', 1, (A, j) => x(A.macd, A.macdSig, j)],
      ['macdDown', 'MACD crosses below signal', 'indicators', -1, (A, j) => x(A.macdSig, A.macd, j)],
      ['macdZeroUp', 'MACD crosses above zero', 'indicators', 1, (A, j) => xv(A.macd, 0, j)],
      ['macdZeroDown', 'MACD crosses below zero', 'indicators', -1, (A, j) => A.macd[j - 1] != null && A.macd[j] != null && A.macd[j - 1] >= 0 && A.macd[j] < 0],
      ['ema921Up', 'EMA 9 crosses above EMA 21', 'indicators', 1, (A, j) => x(A.e9, A.e21, j)],
      ['ema921Down', 'EMA 9 crosses below EMA 21', 'indicators', -1, (A, j) => x(A.e21, A.e9, j)],
      ['golden', 'Golden cross (EMA 50 over 200)', 'indicators', 1, (A, j) => x(A.e50, A.e200, j)],
      ['death', 'Death cross (EMA 50 under 200)', 'indicators', -1, (A, j) => x(A.e200, A.e50, j)],
      ['bbBackUp', 'Back inside the lower Bollinger band', 'indicators', 1, (A, j) => A.bb.lo[j] != null && A.c[j - 1].close < A.bb.lo[j - 1] && A.c[j].close > A.bb.lo[j]],
      ['bbBackDown', 'Back inside the upper Bollinger band', 'indicators', -1, (A, j) => A.bb.up[j] != null && A.c[j - 1].close > A.bb.up[j - 1] && A.c[j].close < A.bb.up[j]],
      ['stochUp', 'Stochastic crosses up under 25', 'indicators', 1, (A, j) => x(A.st.k, A.st.d, j) && A.st.k[j] < 25],
      ['stochDown', 'Stochastic crosses down over 75', 'indicators', -1, (A, j) => x(A.st.d, A.st.k, j) && A.st.k[j] > 75],
      ['superUp', 'SuperTrend flips up', 'indicators', 1, (A, j) => A.sup.up[j] != null && A.sup.up[j - 1] == null && A.sup.down[j - 1] != null],
      ['superDown', 'SuperTrend flips down', 'indicators', -1, (A, j) => A.sup.down[j] != null && A.sup.down[j - 1] == null && A.sup.up[j - 1] != null],
      ['psarUp', 'Parabolic SAR flips up', 'indicators', 1, (A, j) => A.ps[j] != null && A.ps[j - 1] != null && A.ps[j] < A.c[j].close && A.ps[j - 1] > A.c[j - 1].close],
      ['psarDown', 'Parabolic SAR flips down', 'indicators', -1, (A, j) => A.ps[j] != null && A.ps[j - 1] != null && A.ps[j] > A.c[j].close && A.ps[j - 1] < A.c[j - 1].close],
      ['donchUp', '20-candle breakout up', 'indicators', 1, (A, j) => A.don.hi[j] != null && A.c[j].close > A.don.hi[j] && A.c[j - 1].close <= A.don.hi[j - 1]],
      ['donchDown', '20-candle breakout down', 'indicators', -1, (A, j) => A.don.lo[j] != null && A.c[j].close < A.don.lo[j] && A.c[j - 1].close >= A.don.lo[j - 1]],
      ['cciUp', 'CCI back above −100', 'indicators', 1, (A, j) => xv(A.cci, -100, j)],
      ['cciDown', 'CCI back below +100', 'indicators', -1, (A, j) => A.cci[j - 1] != null && A.cci[j] != null && A.cci[j - 1] >= 100 && A.cci[j] < 100],
      ['wrUp', 'Williams %R leaves oversold', 'indicators', 1, (A, j) => xv(A.wr, -80, j)],
      ['wrDown', 'Williams %R leaves overbought', 'indicators', -1, (A, j) => A.wr[j - 1] != null && A.wr[j] != null && A.wr[j - 1] >= -20 && A.wr[j] < -20],
      ['diUp', '+DI crosses above −DI (ADX > 20)', 'indicators', 1, (A, j) => x(A.adx.pdi, A.adx.mdi, j) && A.adx.adx[j] > 20],
      ['diDown', '−DI crosses above +DI (ADX > 20)', 'indicators', -1, (A, j) => x(A.adx.mdi, A.adx.pdi, j) && A.adx.adx[j] > 20],
      ['tkUp', 'Ichimoku Tenkan crosses above Kijun', 'indicators', 1, (A, j) => x(A.ichi.tenkan, A.ichi.kijun, j)],
      ['tkDown', 'Ichimoku Tenkan crosses below Kijun', 'indicators', -1, (A, j) => x(A.ichi.kijun, A.ichi.tenkan, j)],
    ];
    this.EVENTS = E.map(([id, label, family, dir, fn]) => ({ id, label, family, dir, fn }));
    return this.EVENTS;
  },
  /* a simple, honest divergence: the last 12 candles made a lower low (higher
     high) than the 12 before, while RSI made a higher low (lower high), and
     the signal candle closed back in the other direction */
  div(A, j, dir){
    if (j < 30 || A.rsi[j] == null) return false;
    const c = A.c;
    let aLo = Infinity, aI = -1, bLo = Infinity, bI = -1;
    for (let k = j - 23; k <= j - 12; k++) if ((dir > 0 ? c[k].low : -c[k].high) < aLo){ aLo = dir > 0 ? c[k].low : -c[k].high; aI = k; }
    for (let k = j - 11; k <= j; k++) if ((dir > 0 ? c[k].low : -c[k].high) < bLo){ bLo = dir > 0 ? c[k].low : -c[k].high; bI = k; }
    if (aI < 0 || bI < 0 || A.rsi[aI] == null || A.rsi[bI] == null) return false;
    const priceNew = bLo < aLo, rsiBetter = dir > 0 ? A.rsi[bI] > A.rsi[aI] + 2 : A.rsi[bI] < A.rsi[aI] - 2;
    const turned = dir > 0 ? c[j].close > c[j].open && bI >= j - 3 : c[j].close < c[j].open && bI >= j - 3;
    const zone = dir > 0 ? A.rsi[bI] < 40 : A.rsi[bI] > 60;
    return priceNew && rsiBetter && turned && zone;
  },

  /* the market context at the signal candle — a bit each */
  FILTERS: [
    ['rsiLow', 'RSI under 30'], ['rsiHigh', 'RSI over 70'], ['rsiU50', 'RSI under 50'], ['rsiO50', 'RSI over 50'],
    ['above200', 'Price above the 200 EMA'], ['below200', 'Price below the 200 EMA'],
    ['trendUp', 'EMA 20 above EMA 50 (up-trend)'], ['trendDown', 'EMA 20 below EMA 50 (down-trend)'],
    ['adxStrong', 'ADX over 25 (strong trend)'], ['adxWeak', 'ADX under 20 (no trend)'],
    ['volSpike', 'Volume 1.5× its average'], ['squeeze', 'Bollinger squeeze'],
    ['macdNeg', 'MACD under zero'], ['macdPos', 'MACD over zero'],
    ['stochLow', 'Stochastic under 20'], ['stochHigh', 'Stochastic over 80'],
    ['atrHigh', 'Volatility high (ATR 1.3× usual)'], ['atrLow', 'Volatility low (ATR 0.7× usual)'],
  ],
  maskAt(A, j){
    const c = A.c[j], r = A.rsi[j], m = A.macd[j], k = A.st.k[j], adx = A.adx.adx[j];
    let b = 0; const set = (i, on) => { if (on) b |= (1 << i); };
    set(0, r != null && r < 30); set(1, r != null && r > 70); set(2, r != null && r < 50); set(3, r != null && r >= 50);
    set(4, A.e200[j] != null && c.close > A.e200[j]); set(5, A.e200[j] != null && c.close < A.e200[j]);
    set(6, A.e20[j] != null && A.e50[j] != null && A.e20[j] > A.e50[j]); set(7, A.e20[j] != null && A.e50[j] != null && A.e20[j] < A.e50[j]);
    set(8, adx != null && adx > 25); set(9, adx != null && adx < 20);
    set(10, A.volAvg[j] > 0 && c.volume > 1.5 * A.volAvg[j]);
    set(11, A.bbw[j] != null && A.bbwAvg[j] != null && A.bbw[j] < 0.6 * A.bbwAvg[j]);
    set(12, m != null && m < 0); set(13, m != null && m > 0);
    set(14, k != null && k < 20); set(15, k != null && k > 80);
    set(16, A.atrP[j] != null && A.atrAvg[j] != null && A.atrP[j] > 1.3 * A.atrAvg[j]);
    set(17, A.atrP[j] != null && A.atrAvg[j] != null && A.atrP[j] < 0.7 * A.atrAvg[j]);
    return b;
  },

  /* every indicator the signals and contexts need, once per candle set */
  prepare(c){
    const close = c.map(x => x.close);
    const A = { c, close };
    A.pat = PAT.index(c);
    A.ha = IND.heikinAshi(c);
    A.rsi = IND.rsi(close, 14);
    const md = IND.macd(close, 12, 26, 9); A.macd = md.macd; A.macdSig = md.signal;
    A.e9 = IND.ema(close, 9); A.e20 = IND.ema(close, 20); A.e21 = IND.ema(close, 21); A.e50 = IND.ema(close, 50); A.e200 = IND.ema(close, 200);
    A.bb = IND.bb(close, 20, 2);
    A.bbw = close.map((_, i) => A.bb.up[i] != null && A.bb.mid[i] ? (A.bb.up[i] - A.bb.lo[i]) / A.bb.mid[i] : null);
    A.bbwAvg = IND.smaOver(A.bbw, 100);
    A.st = IND.stoch(c, 14, 3, 3);
    A.sup = IND.supertrend(c, 10, 3);
    A.ps = IND.psar(c, 0.02, 0.2);
    A.don = IND.donchian(c, 20);
    A.cci = IND.cci(c, 20);
    A.wr = IND.williamsR(c, 14);
    A.adx = IND.adx(c, 14);
    A.ichi = IND.ichimoku(c, 9, 26);
    const atr = IND.atr(c, 14);
    A.atrP = atr.map((v, i) => v == null ? null : v / close[i] * 100);
    A.atrAvg = IND.smaOver(A.atrP, 50);
    A.volAvg = IND.sma(c.map(x => x.volume || 0), 20);
    return A;
  },

  /* ================= measuring what happened next ================= */
  /* entry at the OPEN of candle i (the one after the signal candle); walk H candles */
  outcome(c, i, dir, H, own){
    const e = c[i].open; if (!(e > 0)) return null;
    const TH = this.TH, ST = this.ST;
    const fav = new Array(TH.length).fill(0), adv = new Array(ST.length).fill(0);
    let mfe = 0, mae = 0, barsMfe = 0, tpBar = 0, slBar = 0;
    const end = Math.min(c.length - 1, i + H - 1);
    for (let k = i; k <= end; k++){
      const b = c[k], n = k - i + 1;
      const f = dir > 0 ? (b.high - e) / e * 100 : (e - b.low) / e * 100;
      const a = dir > 0 ? (e - b.low) / e * 100 : (b.high - e) / e * 100;
      if (f > mfe){ mfe = f; barsMfe = n; }
      if (a > mae) mae = a;
      for (let t = 0; t < TH.length; t++) if (!fav[t] && f >= TH[t]) fav[t] = n;
      for (let s = 0; s < ST.length; s++) if (!adv[s] && a >= ST[s]) adv[s] = n;
      if (own){
        if (!tpBar && own.tp > 0 && f >= own.tp) tpBar = n;
        if (!slBar && own.sl > 0 && a >= own.sl) slBar = n;
      }
    }
    const last = c[end].close;
    const endPct = (last - e) / e * 100 * dir;
    return { mfe, mae, barsMfe, fav, adv, endPct, tpBar, slBar };
  },

  /* the benchmark: enter at EVERY second candle, both ways, and see what happens.
     If the market only went up in the studied period, every buy signal looks
     good — the question is whether a signal did BETTER than buying anything. */
  baseline(c, H, warm){
    const TS = this.TH.length * this.ST.length, TL = this.TH.length, SL = this.ST.length;
    const B = { n: [0, 0], win: new Int32Array(2 * TS), loss: new Int32Array(2 * TS), end: [0, 0] };
    for (let i = warm + 1; i + H <= c.length; i += 2){
      for (const dir of [1, -1]){
        const o = this.outcome(c, i, dir, H, null); if (!o) continue;
        const d = dir > 0 ? 0 : 1; B.n[d]++; B.end[d] += o.endPct;
        for (let t = 0; t < TL; t++){ const fb = o.fav[t];
          for (let s2 = 0; s2 < SL; s2++){ const ab = o.adv[s2], k = d * TS + t * SL + s2;
            if (fb && (!ab || fb < ab)) B.win[k]++; else if (ab) B.loss[k]++; } }
      }
    }
    return B;
  },

  /* one pair × timeframe: every signal, every outcome → one compact record */
  async scanChunk(sym, tf){
    let candles;
    try { candles = await API.klines(sym, tf, this.LIMIT, { signal: AbortSignal.timeout(30000) }); } catch(e){ return { error: (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'the bridge did not answer in 30 s' : e.message }; }
    if (!candles || candles.length < this.WARM + 50) return { error: 'not enough history (' + (candles ? candles.length : 0) + ')' };
    const sec = this.TF_SEC[tf] || 900;
    const nowS = Date.now() / 1000;
    /* the last candle may still be forming — drop it */
    if ((candles[candles.length - 1].rawTime || candles[candles.length - 1].time) + sec > nowS + 5) candles = candles.slice(0, -1);
    const c = candles, A = this.prepare(c), H = this.HORIZON[tf] || 96;
    const E = this.EVENTS || this.buildEvents();
    const i32 = [], i16 = [], u8 = [], fresh = [];
    const sigs = E.map(e => e.id);
    for (let j = this.WARM; j < c.length; j++){
      let mask = null;
      for (let s = 0; s < E.length; s++){
        let on = false; try { on = E[s].fn(A, j); } catch(e){ on = false; }
        if (!on) continue;
        if (mask == null) mask = this.maskAt(A, j);
        const i = j + 1;
        if (i + H > c.length){ fresh.push({ sig: E[s].id, dir: E[s].dir, time: c[j].rawTime || c[j].time, mask, close: c[j].close, barsAgo: c.length - 1 - j }); continue; }
        const o = this.outcome(c, i, E[s].dir, H, null); if (!o) continue;
        this.push(i32, i16, u8, s, c[i].rawTime || c[i].time, mask, E[s].dir, o, null);
      }
    }
    const costPct = this.costPct(sym);
    return { key: sym + '|' + tf, sym, tf, at: Date.now(), bars: c.length, from: c[0].rawTime || c[0].time, to: c[c.length - 1].rawTime || c[c.length - 1].time,
             costPct, sigs, n: i32.length / 3, i32: Int32Array.from(i32), i16: Int16Array.from(i16), u8: Uint8Array.from(u8), fresh, base: this.baseline(c, H, this.WARM) };
  },
  push(i32, i16, u8, s, time, mask, dir, o, own){
    const bp = v => Math.max(-32000, Math.min(32000, Math.round(v * 100)));
    i32.push(s, time, mask);
    i16.push(dir, bp(o.mfe), bp(o.mae), bp(o.endPct), own ? bp(own.tp) : 0, own ? bp(own.sl) : 0);
    u8.push(Math.min(255, o.barsMfe), ...o.fav.map(v => Math.min(255, v)), ...o.adv.map(v => Math.min(255, v)), Math.min(255, o.tpBar), Math.min(255, o.slBar), 0);
  },
  costPct(sym){
    try {
      const t = STORE.tickers.get(sym);
      const live = t && t.spread > 0 && t.last > 0 ? t.spread / t.last * 100 : null;
      const k = BROKER.costsFor(sym, live);
      return +(k.spreadPct + 2 * (k.commissionPct || 0)).toFixed(4);
    } catch(e){ return 0.02; }
  },

  /* a bot is replayed exactly like the backtester does: on the candles it
     could have known, with its own stop and target recorded */
  async scanBot(bot, sym, tf){
    let candles, higher = null;
    try { candles = await API.klines(sym, tf, 900, { signal: AbortSignal.timeout(30000) }); } catch(e){ return { error: (e.name === 'TimeoutError' || e.name === 'AbortError') ? 'the bridge did not answer in 30 s' : e.message }; }
    const warm = Math.max(bot.warmup || 200, this.WARM);
    if (!candles || candles.length < warm + 60) return { error: 'not enough history' };
    const sec = this.TF_SEC[tf] || 900;
    if ((candles[candles.length - 1].rawTime || candles[candles.length - 1].time) + sec > Date.now() / 1000 + 5) candles = candles.slice(0, -1);
    if (bot.needsHigher){ try { higher = await API.klines(sym, (Bots.cfg(bot.id) || {}).higherTf || bot.defaults.higherTf || '1h', 500); } catch(e){ higher = null; } }
    const c = candles, A = this.prepare(c), H = this.HORIZON[tf] || 96;
    const cfg = Object.assign({}, bot.defaults, Bots.cfg(bot.id) || {}, { sym, noLearn: true, tf });
    const ledger = BotEngine.blank('chk');
    const i32 = [], i16 = [], u8 = [], fresh = [];
    let evaluated = 0;
    for (let i = warm; i < c.length; i++){
      const bar = c[i];
      const forming = { ...bar, high: bar.open, low: bar.open, close: bar.open, volume: 0 };
      const win = c.slice(0, i).concat([forming]);
      cfg.nowTs = (bar.rawTime || bar.time) * 1000;
      let sig = null;
      try {
        const hi = higher ? higher.filter(h => h.rawTime <= bar.rawTime).map((h, j, all) => j === all.length - 1 ? { ...h, high: h.open, low: h.open, close: h.open, volume: 0 } : h) : null;
        sig = bot.signal(win, cfg, ledger, hi);
      } catch(e){ sig = null; }
      evaluated++;
      if (evaluated % 60 === 0) await new Promise(r => setTimeout(r));           /* keep the screen alive */
      if (!sig || !sig.dir || sig.closeLongs) continue;
      if (sig.score != null && cfg.minScore && sig.score < cfg.minScore) continue;
      const j = i - 1, dir = sig.dir > 0 ? 1 : -1;
      const ref = sig.entry > 0 ? sig.entry : c[j].close;
      const own = { tp: sig.tp > 0 ? Math.abs(sig.tp - ref) / ref * 100 : 0, sl: sig.sl > 0 ? Math.abs(sig.sl - ref) / ref * 100 : 0 };
      const mask = this.maskAt(A, j);
      if (i + H > c.length){ fresh.push({ sig: 'bot:' + bot.id, dir, time: bar.rawTime || bar.time, mask, close: c[j].close, barsAgo: c.length - i }); continue; }
      const o = this.outcome(c, i, dir, H, own); if (!o) continue;
      this.push(i32, i16, u8, 0, bar.rawTime || bar.time, mask, dir, o, own);
    }
    return { key: 'bot:' + bot.id + '|' + sym + '|' + tf, sym, tf, bot: bot.id, at: Date.now(), bars: c.length, from: c[0].rawTime || c[0].time, to: c[c.length - 1].rawTime || c[c.length - 1].time,
             costPct: this.costPct(sym), sigs: ['bot:' + bot.id], n: i32.length / 3, i32: Int32Array.from(i32), i16: Int16Array.from(i16), u8: Uint8Array.from(u8), fresh, base: this.baseline(c, H, warm) };
  },

  /* ================= storage (IndexedDB) ================= */
  db: null,
  async open(){
    if (this.db) return this.db;
    this.db = await new Promise((res, rej) => {
      const r = indexedDB.open('astra_checker', 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('chunks', { keyPath: 'key' }); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
    return this.db;
  },
  async putChunk(ch){ const db = await this.open(); return new Promise((res, rej) => { const t = db.transaction('chunks', 'readwrite'); t.objectStore('chunks').put(ch); t.oncomplete = res; t.onerror = () => rej(t.error); }); },
  async allChunks(){ const db = await this.open(); return new Promise((res, rej) => { const q = db.transaction('chunks').objectStore('chunks').getAll(); q.onsuccess = () => res(q.result || []); q.onerror = () => rej(q.error); }); },
  async clearAll(){ const db = await this.open(); return new Promise(res => { const t = db.transaction('chunks', 'readwrite'); t.objectStore('chunks').clear(); t.oncomplete = res; }); },

  /* ================= the in-memory table ================= */
  chunks: new Map(),        /* key → chunk */
  sigIndex: {}, sigList: [],
  gsig(id){ if (this.sigIndex[id] == null){ this.sigIndex[id] = this.sigList.length; this.sigList.push(id); } return this.sigIndex[id]; },
  addChunk(ch){
    ch.gs = ch.sigs.map(id => this.gsig(id));
    ch.market = this.marketOf(ch.sym);
    this.chunks.set(ch.key, ch);
    this.version = (this.version || 0) + 1;
  },
  marketOf(sym){ try { return (typeof MarketFit !== 'undefined' && MarketFit.marketOf) ? MarketFit.marketOf(sym) : (Bots.groupOf(sym) || 'other'); } catch(e){ return 'other'; } },
  marketLabel(m){ return (typeof MarketFit !== 'undefined' && MarketFit.MARKET_LABEL && MarketFit.MARKET_LABEL[m]) || m; },
  sigMeta(id){
    if (id.startsWith('bot:')){ const b = BOT_BY_ID[id.slice(4)]; return { id, label: b ? (typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name) : id.slice(4), family: 'bots', dir: 0 }; }
    const e = (this.EVENTS || this.buildEvents()).find(x => x.id === id);
    return e || { id, label: id, family: 'other', dir: 0 };
  },

  /* walk every stored occurrence that passes `pass`; hand each to `fn` as a view */
  each(pass, fn){
    const row = {};
    for (const ch of this.chunks.values()){
      row.sym = ch.sym; row.tf = ch.tf; row.market = ch.market; row.cost = ch.costPct; row.chunk = ch;
      if (pass && pass.chunk && !pass.chunk(ch)) continue;
      const n = ch.n, i32 = ch.i32, i16 = ch.i16, u8 = ch.u8;
      for (let r = 0; r < n; r++){
        row.r = r;
        row.sig = ch.gs[i32[r * 3]]; row.time = i32[r * 3 + 1]; row.mask = i32[r * 3 + 2];
        row.dir = i16[r * 6];
        if (pass && pass.row && !pass.row(row)) continue;
        fn(row, ch, r);
      }
    }
  },
  /* the numbers of one occurrence, read lazily */
  favBar(ch, r, t){ return ch.u8[r * this.U8 + 1 + t]; },
  advBar(ch, r, s){ return ch.u8[r * this.U8 + 1 + this.TH.length + s]; },

  /* ================= statistics for a set of occurrences ================= */
  newAcc(){
    const T = this.TH.length, S = this.ST.length;
    return { n: 0, win: new Int32Array(T * S), loss: new Int32Array(T * S), barsSum: new Float64Array(T * S), secSum: new Float64Array(T * S), overSum: new Float64Array(T * S),
             winA: new Int32Array(T * S), nA: 0, winB: new Int32Array(T * S), nB: 0, lossA: new Int32Array(T * S), lossB: new Int32Array(T * S), mfe: 0, mae: 0, end: 0, cost: 0, tf: {}, reach: new Int32Array(T), bWin: new Float64Array(T * S), bLoss: new Float64Array(T * S), bEnd: 0, bN: 0,
             own: 0, ownWin: 0, ownLoss: 0, ownOver: 0, ownBars: 0, first: Infinity, last: 0, sec: 0 };
  },
  addRow(acc, ch, r, time){
    const T = this.TH.length, S = this.ST.length, U = this.U8, u8 = ch.u8, o = r * U, i16 = ch.i16, k6 = r * 6;
    const first = time < (ch.from + ch.to) / 2, tfSec = this.TF_SEC[ch.tf] || 900;
    if (first) acc.nA++; else acc.nB++;
    acc.n++; acc.mfe += i16[k6 + 1] / 100; acc.mae += i16[k6 + 2] / 100; acc.end += i16[k6 + 3] / 100; acc.cost += ch.costPct;
    acc.tf[ch.tf] = (acc.tf[ch.tf] || 0) + 1; acc.sec += (this.TF_SEC[ch.tf] || 900);
    if (time < acc.first) acc.first = time; if (time > acc.last) acc.last = time;
    const mfe = i16[k6 + 1] / 100;
    for (let t = 0; t < T; t++){
      const fb = u8[o + 1 + t];
      if (fb) acc.reach[t]++;
      for (let s = 0; s < S; s++){
        const ab = u8[o + 1 + T + s], k = t * S + s;
        if (fb && (!ab || fb < ab)){ acc.win[k]++; acc.barsSum[k] += fb; acc.secSum[k] += fb * tfSec; acc.overSum[k] += mfe - this.TH[t]; if (first) acc.winA[k]++; else acc.winB[k]++; }
        else if (ab){ acc.loss[k]++; if (first) acc.lossA[k]++; else acc.lossB[k]++; }
      }
    }
    /* the bot's own target and stop, where the signal came with them */
    /* what a RANDOM entry in the same pair, timeframe and direction would have done */
    const B = ch.base;
    if (B){ const d = i16[k6] > 0 ? 0 : 1, nb = B.n[d];
      if (nb){ const TS = T * S; acc.bN++; acc.bEnd += B.end[d] / nb; for (let k = 0; k < TS; k++){ acc.bWin[k] += B.win[d * TS + k] / nb; acc.bLoss[k] += B.loss[d * TS + k] / nb; } } }
    const tpBp = i16[k6 + 4], slBp = i16[k6 + 5];
    if (tpBp > 0 || slBp > 0){
      acc.own++;
      const tb = u8[o + 1 + T + S], sb = u8[o + 2 + T + S];
      if (tb && (!sb || tb < sb)){ acc.ownWin++; acc.ownBars += tb; acc.ownOver += mfe - tpBp / 100; }
      else if (sb) acc.ownLoss++;
    }
  },
  collect(pass){
    const acc = this.newAcc();
    this.each(pass, (row, ch, r) => this.addRow(acc, ch, r, row.time));
    return acc;
  },
  /* what one target/stop pair looks like for this set */
  /* Wilson lower bound: how often it wins, at the cautious end — a 9-out-of-10
     on ten cases is not the same evidence as 900 out of 1000 */
  wilsonLo(k, n, z){ if (!n) return 0; z = z || 1.64; const p = k / n, d = 1 + z * z / n;
    return Math.max(0, (p + z * z / (2 * n) - z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n))) / d); },
  cell(acc, t, s){
    const S = this.ST.length, k = t * S + s, n = acc.n;
    if (!n) return null;
    const win = acc.win[k], loss = acc.loss[k], out = n - win - loss;
    const T = this.TH[t], St = this.ST[s];
    const cost = acc.cost / n, avgEnd = acc.end / n;
    const outVal = Math.max(-St, Math.min(T, avgEnd));
    /* measured: a case that ran out of time is valued at the average end of the set */
    const exp = (win * T - loss * St + out * outVal) / n - cost;
    /* prudent: the cautious win rate, and every case that did not win counted as a full stop */
    const pLo = this.wilsonLo(win, n);
    const expLo = pLo * T - (1 - pLo) * St - cost;
    const halfExp = (w, l, m) => m ? (w * T - l * St + (m - w - l) * outVal) / m - cost : null;
    const expA = halfExp(acc.winA[k], acc.lossA[k], acc.nA), expB = halfExp(acc.winB[k], acc.lossB[k], acc.nB);
    const wA = acc.nA ? acc.winA[k] / acc.nA : null, wB = acc.nB ? acc.winB[k] / acc.nB : null;
    let baseWinPct = null, baseExp = null;
    if (acc.bN){ const bw = acc.bWin[k] / acc.bN, bl = acc.bLoss[k] / acc.bN, bo = 1 - bw - bl, be = Math.max(-St, Math.min(T, acc.bEnd / acc.bN));
      baseWinPct = bw * 100; baseExp = bw * T - bl * St + bo * be - cost; }
    return { t, s, T, S: St, n, win, loss, out, winPct: win / n * 100, failPct: loss / n * 100, exp, expLo, pLo: pLo * 100, cost,
             baseWinPct, baseExp, edge: baseWinPct == null ? null : win / n * 100 - baseWinPct, edgeExp: baseExp == null ? null : exp - baseExp,
             bars: win ? acc.barsSum[k] / win : null, sec: win ? acc.secSum[k] / win : null, over: win ? acc.overSum[k] / win : null,
             halfA: wA == null ? null : wA * 100, halfB: wB == null ? null : wB * 100, expA, expB,
             /* holds = the same behaviour early and late, AND it made money in both halves */
             holds: wA != null && wB != null && acc.nA >= 10 && acc.nB >= 10 && Math.abs(wA - wB) * 100 <= 15 && expA > 0 && expB > 0 };
  },
  /* the best target/stop is chosen on the PRUDENT figure, so a lucky corner of
     the map cannot win just because it had few cases */
  best(acc, minN){
    if (!acc.n || acc.n < (minN || 1)) return null;
    let b = null;
    for (let t = 0; t < this.TH.length; t++) for (let s = 0; s < this.ST.length; s++){
      const c = this.cell(acc, t, s); if (!c) continue;
      if (!b || c.expLo > b.expLo) b = c;
    }
    return b;
  },
  /* the "easy win": the biggest move it reaches in at least `conf`% of cases before the chosen stop */
  easy(acc, s, conf){
    let e = null;
    for (let t = 0; t < this.TH.length; t++){ const c = this.cell(acc, t, s); if (c && c.winPct >= conf) e = c; }
    return e;
  },
  avgTf(acc){ return acc.n ? acc.sec / acc.n : 900; },
  dur(sec){ if (sec == null || !isFinite(sec)) return '—'; const m = sec / 60; return m < 90 ? Math.round(m) + ' min' : m < 60 * 36 ? (m / 60).toFixed(1) + ' h' : (m / 1440).toFixed(1) + ' days'; },

  /* ================= settings, the brain, the notebook ================= */
  KEY: 'astra_checker',
  state: null,
  load(){
    if (this.state) return this.state;
    const d = { on: true, t: 2, s: 1, conf: 70, minN: 30, markets: ['crypto', 'metal', 'fx', 'index', 'energy'], bots: true,
                ideas: [], log: [], cursorSig: 0, scanned: 0, speed: 'normal', path: [], secs: {} };
    this.state = Object.assign(d, lsGet(this.KEY, {}) || {});
    return this.state;
  },
  save(){ const S = this.state; if (S.ideas.length > 120) S.ideas.length = 120; if (S.log.length > 80) S.log.length = 80; lsSet(this.KEY, S); },
  note(text){ const S = this.load(); S.log.unshift({ t: Date.now(), text }); this.save(); },

  universe(){
    const S = this.load();
    let all = []; try { all = Bots.universe(); } catch(e){}
    /* history comes from the MT5 bridge — a pair does not need a live quote to be studied */
    if (typeof Feed !== 'undefined' && Feed.route) all = all.filter(s => { try { return Feed.route(s).kind === 'bridge'; } catch(e){ return false; } });
    return all.filter(s => S.markets.includes(this.marketOf(s)));
  },
  /* the next job: the pair × timeframe whose study is missing or oldest */
  nextJob(){
    const S = this.load(), now = Date.now();
    let best = null;
    for (const sym of this.universe()) for (const tf of this.TFS){
      const ch = this.chunks.get(sym + '|' + tf);
      /* a study made before a signal existed is out of date, however recent */
      const complete = ch && (this._evIds || (this._evIds = (this.EVENTS || this.buildEvents()).map(e => e.id))).every(id => (ch.sigs || []).includes(id));
      const age = ch ? (complete || ch.error ? now - ch.at : 1e15 + (now - ch.at)) : Infinity;
      if (ch && age < (ch.error ? 1800e3 : this.REFRESH_H[tf] * 3600e3)) continue;      /* a failed study is retried after half an hour */
      if (!best || age > best.age) best = { kind: 'pair', sym, tf, age };
    }
    /* every few jobs, a bot on one of its pairs — new bots join by themselves */
    this._n = (this._n || 0) + 1;
    if (S.bots && (this._n % 3 === 0 || !best)){
      const bj = this.nextBotJob(); if (bj) return bj;
    }
    return best;
  },
  nextBotJob(){
    const now = Date.now(); let best = null;
    const bots = BOTS.filter(b => !Bots.isPage(b) && !b.manual && !b.liveManual && !Bots.disabled(b.id) && typeof b.signal === 'function' && !b.runPaper);
    for (const b of bots){
      const cfg = Bots.cfg(b.id) || {}; const tf = cfg.tf || b.defaults.tf || '15m';
      let syms = []; try { syms = Bots.allowed(b).slice(0, 6); } catch(e){}
      for (const sym of syms){
        const ch = this.chunks.get('bot:' + b.id + '|' + sym + '|' + tf);
        const age = ch ? now - ch.at : Infinity;
        if (ch && age < 24 * 3600e3) continue;
        if (!best || age > best.age) best = { kind: 'bot', bot: b, sym, tf, age };
      }
    }
    return best;
  },
  busy: false, timer: null,
  async tick(force){
    const S = this.load();
    /* a watchdog: one study can never hold the brain for more than two minutes */
    if (this.busy && Date.now() - (this.busySince || 0) > 120000){ this.busy = false; this.note('⚠ A study took too long and was abandoned'); }
    if (this.busy || (!S.on && !force)) return;
    if (!this.loaded) return;
    this.busy = true; this.busySince = Date.now();
    try {
      const job = this.nextJob();
      if (job){
        this.current = job; this.renderStatus();
        const ch = job.kind === 'bot' ? await this.scanBot(job.bot, job.sym, job.tf) : await this.scanChunk(job.sym, job.tf);
        if (ch && !ch.error){
          await this.putChunk(ch); this.addChunk(ch); S.scanned = (S.scanned || 0) + 1; this.save();
        } else if (ch && ch.error){
          /* remember the failure for a while so the brain does not spin on it */
          this.addChunk({ key: job.kind === 'bot' ? 'bot:' + job.bot.id + '|' + job.sym + '|' + job.tf : job.sym + '|' + job.tf, sym: job.sym, tf: job.tf, at: Date.now(), n: 0, sigs: [], i32: new Int32Array(0), i16: new Int16Array(0), u8: new Uint8Array(0), fresh: [], costPct: 0, error: ch.error });
        }
      }
      this.current = null;
      this.think();
      this.autoTune();
      this.dirty = true;
      if (Bots.active === 'checker') this.refresh();
    } catch(e){ console.warn('ASTRA checker:', e.message); }
    finally { this.busy = false; this.current = null; this.renderStatus(); }
  },
  /* the brain's other half: mixing signals with contexts, one signal per tick */
  think(){
    const S = this.load(), E = this.EVENTS || this.buildEvents();
    const ids = this.sigList.filter(id => !id.startsWith('bot:'));
    if (!ids.length) return;
    const id = ids[(S.cursorSig || 0) % ids.length]; S.cursorSig = (S.cursorSig || 0) + 1;
    const gi = this.sigIndex[id];
    /* gather this signal's rows once */
    const rows = []; this.each({ row: r => r.sig === gi }, (row, ch, r) => rows.push([ch, r, row.time, row.mask, row.market, row.tf]));
    if (rows.length < S.minN) return;
    const base = this.accOf(rows, null, null);
    const bb = this.best(base, S.minN);
    const F = this.FILTERS.length;
    const tried = [];
    const consider = (fa, fb) => {
      const acc = this.accOf(rows, fa, fb); if (acc.n < S.minN) return;
      const b = this.best(acc, S.minN); if (!b) return;
      const sameCell = this.cell(acc, bb ? bb.t : S.t, bb ? bb.s : S.s);
      const lift = sameCell && bb ? sameCell.winPct - bb.winPct : 0;
      tried.push({ fa, fb, acc, b, lift });
    };
    for (let a = 0; a < F; a++){ consider(a, null); for (let b = a + 1; b < F; b++) consider(a, b); }
    tried.sort((x, y) => y.b.expLo - x.b.expLo);
    /* the more mixes it tries, the more it will find by pure luck — so a mix has
       to clear a higher bar than a plain signal: twice the cases, enough of them in
       EACH half of the history, positive after costs, better than the signal alone */
    const need = S.minN * 2;
    const keep = tried.filter(x => x.acc.n >= need && x.acc.nA >= S.minN / 2 && x.acc.nB >= S.minN / 2 &&
      x.b.expLo > 0 && x.b.expLo > (bb ? bb.expLo : 0) + 0.01 && x.b.holds && x.lift >= 5 && x.b.edge != null && x.b.edge >= 5 && x.b.edgeExp > 0).slice(0, 3);
    const label = this.sigMeta(id).label;
    for (const k of keep){
      const name = label + ' + ' + this.FILTERS[k.fa][1] + (k.fb != null ? ' + ' + this.FILTERS[k.fb][1] : '');
      const idea = { id: id + '|' + k.fa + '|' + (k.fb == null ? '' : k.fb), sig: id, fa: k.fa, fb: k.fb, name, n: k.acc.n, T: k.b.T, S: k.b.S, t: k.b.t, s: k.b.s,
                     winPct: +k.b.winPct.toFixed(1), exp: +k.b.exp.toFixed(3), expLo: +k.b.expLo.toFixed(3), edge: +k.b.edge.toFixed(1), bars: k.b.bars, sec: k.b.sec, lift: +k.lift.toFixed(1),
                     baseWin: bb ? +this.cell(k.acc, bb.t, bb.s).winPct.toFixed(1) : null, halfA: k.b.halfA, halfB: k.b.halfB, at: Date.now() };
      const was = S.ideas.findIndex(x => x.id === idea.id);
      if (was >= 0) S.ideas[was] = idea; else { S.ideas.push(idea); this.note('💡 ' + name + ': reaches +' + idea.T + '% before −' + idea.S + '% in ' + idea.winPct + '% of ' + idea.n + ' cases (' + (idea.lift >= 0 ? '+' : '') + idea.lift + ' points better than ' + label + ' alone)'); }
    }
    /* ideas that no longer pass after new history are dropped */
    S.ideas = S.ideas.filter(i => i.sig !== id || keep.some(k => i.id === id + '|' + k.fa + '|' + (k.fb == null ? '' : k.fb)));
    S.ideas.sort((a, b) => (b.expLo || 0) - (a.expLo || 0));
    if (!keep.length && tried.length) S.lastThought = 'Tried ' + tried.length + ' mixes of ' + label + ' — none beat it on both halves of the history';
    else S.lastThought = 'Mixed ' + label + ' with ' + tried.length + ' contexts — kept ' + keep.length;
    this.save();
  },
  accOf(rows, fa, fb){
    const acc = this.newAcc();
    for (const x of rows){ const m = x[3]; if (fa != null && !(m & (1 << fa))) continue; if (fb != null && !(m & (1 << fb))) continue; this.addRow(acc, x[0], x[1], x[2]); }
    return acc;
  },

  /* ================= paper bots made from a finding ================= */
  BKEY: 'astra_checker_bots',
  recipes(){ return lsGet(this.BKEY, []) || []; },
  saveRecipes(list){ lsSet(this.BKEY, list); },
  makeBot(spec){
    const list = this.recipes();
    const id = 'chk_' + Math.abs([...JSON.stringify([spec.sig, spec.fa, spec.fb, spec.market, spec.tf, spec.sym])].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) | 0, 7)).toString(36);
    if (list.some(r => r.id === id) || BOT_BY_ID[id]) return { ok: false, why: 'That bot already exists' };
    const meta = this.sigMeta(spec.sig);
    const bits = [meta.label]; if (spec.fa != null) bits.push(this.FILTERS[spec.fa][1]); if (spec.fb != null) bits.push(this.FILTERS[spec.fb][1]);
    const rec = Object.assign({ id, name: 'Checker · ' + bits.join(' + ') + (spec.market ? ' · ' + this.marketLabel(spec.market) : '') + ' · ' + spec.tf, auto: true, made: Date.now(), tunes: [] }, spec);
    list.push(rec); this.saveRecipes(list);
    this.mount(rec);
    if (typeof Bots !== 'undefined' && Bots.render) Bots.render();
    this.note('🤖 Made a paper bot: ' + rec.name + ' (target +' + rec.T + '%, stop −' + rec.S + '%)');
    return { ok: true, id };
  },
  toBot(rec){
    const E = this.EVENTS || this.buildEvents();
    const ev = E.find(e => e.id === rec.sig);
    if (!ev) return null;
    const groups = rec.market ? this.groupsFor(rec.market) : null;
    return {
      id: rec.id, name: rec.name, checkerBot: true,
      blurb: 'Made by the Strategy Checker from ' + (rec.n || '?') + ' measured cases: ' + ev.label +
        (rec.fa != null ? ' while ' + this.FILTERS[rec.fa][1].toLowerCase() : '') + (rec.fb != null ? ' and ' + this.FILTERS[rec.fb][1].toLowerCase() : '') +
        '. Target and stop are percentages that the checker keeps re-tuning as new history comes in' + (rec.auto ? '' : ' (auto-tune off)') + '. Paper only.',
      defaults: Object.assign({ tf: rec.tf, tfAuto: false, minScore: 0, maxOpen: 2 }, groups ? { groups } : {}, rec.sym ? { instruments: [rec.sym] } : {}),
      warmup: this.WARM + 5,
      signal: (w, cfg) => {
        const c = w.slice(0, -1);                                       /* the last candle is still forming */
        if (c.length < this.WARM + 2) return { dir: 0, failed: ['warming up'] };
        const A = this.prepare(c.slice(-Math.min(c.length, 420)));
        const j = A.c.length - 1;
        let on = false; try { on = ev.fn(A, j); } catch(e){ on = false; }
        if (!on) return { dir: 0, failed: ['No ' + ev.label.toLowerCase() + ' on the last closed candle'] };
        const m = this.maskAt(A, j);
        if (rec.fa != null && !(m & (1 << rec.fa))) return { dir: 0, failed: [ev.label + ', but not while ' + this.FILTERS[rec.fa][1].toLowerCase()] };
        if (rec.fb != null && !(m & (1 << rec.fb))) return { dir: 0, failed: [ev.label + ', but not while ' + this.FILTERS[rec.fb][1].toLowerCase()] };
        const px = A.c[j].close, dir = ev.dir;
        return { dir, score: 80, entry: px, sl: px * (1 - dir * rec.S / 100), tp: px * (1 + dir * rec.T / 100), model: ev.label,
                 reasons: [ev.label + (rec.fa != null ? ' + ' + this.FILTERS[rec.fa][1] : '') + (rec.fb != null ? ' + ' + this.FILTERS[rec.fb][1] : ''),
                           'Checker: reached +' + rec.T + '% before −' + rec.S + '% in ' + (rec.winPct != null ? rec.winPct + '%' : '?') + ' of ' + (rec.n || '?') + ' cases'] };
      },
    };
  },
  groupsFor(market){
    const map = { crypto: 'crypto', metal: 'gold', fx: 'forex', index: 'indices', energy: 'energy', stock: 'stocks', eustock: 'other', other: 'other' };
    const g = map[market] || market; return Bots.marketGroups()[g] ? [g] : null;
  },
  mount(rec){
    const bot = this.toBot(rec); if (!bot || BOT_BY_ID[bot.id]) return null;
    BOTS.push(bot); BOT_BY_ID[bot.id] = bot;
    if (typeof Bots !== 'undefined' && Bots.ledgers){
      Bots.cfgs[bot.id] = Object.assign({}, bot.defaults, lsGet('astra_botcfg_' + bot.id, {}));
      Bots.ledgers[bot.id] = BotEngine.load(bot.id);
    }
    if (typeof StratIndReg !== 'undefined') try { StratIndReg.add(bot); } catch(e){}
    return bot;
  },
  mountAll(){ for (const r of this.recipes()) if (!r.retired) this.mount(r); },
  /* the bots it made keep learning: when the history says a better target/stop
     now fits the same signal, the bot is re-tuned (and says so) */
  autoTune(){
    const list = this.recipes(); if (!list.length) return;
    const S = this.load(); let changed = false;
    this._tuneAt = this._tuneAt || 0; if (Date.now() - this._tuneAt < 10 * 60e3) return; this._tuneAt = Date.now();
    for (const rec of list){
      if (!rec.auto || rec.retired) continue;
      const gi = this.sigIndex[rec.sig]; if (gi == null) continue;
      const rows = []; this.each({ chunk: ch => ch.tf === rec.tf && (!rec.market || ch.market === rec.market) && (!rec.sym || ch.sym === rec.sym), row: r => r.sig === gi },
        (row, ch, r) => rows.push([ch, r, row.time, row.mask]));
      const acc = this.accOf(rows, rec.fa, rec.fb);
      const b = this.best(acc, S.minN); if (!b || !b.holds) continue;
      if (b.T !== rec.T || b.S !== rec.S){
        rec.tunes = (rec.tunes || []).concat([{ at: Date.now(), from: [rec.T, rec.S], to: [b.T, b.S], n: acc.n }]).slice(-10);
        this.note('🔧 Re-tuned ' + rec.name + ': target +' + rec.T + '% → +' + b.T + '%, stop −' + rec.S + '% → −' + b.S + '% (' + acc.n + ' cases)');
        rec.T = b.T; rec.S = b.S; changed = true;
      }
      rec.n = acc.n; rec.winPct = +b.winPct.toFixed(1);
      const bot = BOT_BY_ID[rec.id]; if (bot){ const fresh = this.toBot(rec); bot.signal = fresh.signal; bot.blurb = fresh.blurb; }
    }
    if (changed || list.length) this.saveRecipes(list);
  },

  /* ================= start ================= */
  loaded: false,
  async init(){
    this.load(); this.buildEvents();
    try { const all = await this.allChunks(); for (const ch of all) this.addChunk(ch); } catch(e){ console.warn('ASTRA checker storage:', e.message); }
    this.loaded = true;
    if (!this.timer) this.timer = setInterval(() => this.tick(), this.load().speed === 'fast' ? 2500 : 8000);
    setTimeout(() => this.tick(), 20000);
    this.dirty = true;
    if (Bots.active === 'checker') this.refresh();
  },
  setSpeed(v){ const S = this.load(); S.speed = v; this.save(); clearInterval(this.timer); this.timer = setInterval(() => this.tick(), v === 'fast' ? 2500 : 8000); },
};
