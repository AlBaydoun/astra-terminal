/* ASTRA Terminal — strategies from published research.

   Ten strategy families that have public rules and public test records
   (Connors & Alvarez, Crabel, the TTM squeeze, the Turtles, Moskowitz-Ooi-
   Pedersen's time-series momentum, the London breakout, VWAP reversion, the
   Internal Bar Strength effect). Each one is added twice:

     1. as SIGNALS in the Strategy Checker — so the checker measures them on
        every market, pair and timeframe and compares them with a random entry;
     2. as a PAPER BOT — so they trade on paper under the normal engine, the
        Master Brain veto and every house rule, and build a record.

   Most of them were published for stock indices on the DAILY chart. Here they
   also run on shorter timeframes and on crypto, forex and metals, because the
   checker is exactly the place to find out where they still hold and where
   they don't. A published backtest is a claim, not a promise. */
const Research = {

  /* ---------- extra indicators the rules need ---------- */
  prepare(A){
    const c = A.c, n = c.length, close = A.close;
    A.sma200 = IND.sma(close, 200);
    A.sma5 = IND.sma(close, 5);
    A.rsi2 = IND.rsi(close, 2);
    A.ibs = c.map(b => b.high > b.low ? (b.close - b.low) / (b.high - b.low) : 0.5);
    A.kc = IND.keltner(c, 20, 1.5);
    A.don55 = IND.donchian(c, 55);
    A.atr14 = IND.atr(c, 14);
    A.range = c.map(b => b.high - b.low);
    /* VWAP of the (broker) day and how far price sits from it, in standard deviations */
    A.vwap = IND.vwapDaily(c);
    const dev = close.map((v, i) => A.vwap[i] == null ? null : v - A.vwap[i]);
    A.vwapZ = new Array(n).fill(null);
    for (let i = 50; i < n; i++){
      let s = 0, s2 = 0, k = 0;
      for (let j = i - 49; j <= i; j++) if (dev[j] != null){ s += dev[j]; s2 += dev[j] * dev[j]; k++; }
      if (k < 30) continue;
      const m = s / k, sd = Math.sqrt(Math.max(0, s2 / k - m * m));
      A.vwapZ[i] = sd > 0 && dev[i] != null ? dev[i] / sd : null;
    }
    /* the Asian session range (00:00–06:59 UTC) of each day, known from 07:00 on */
    const off = (typeof Feed !== 'undefined' && Feed.bridgeClock && Feed.bridgeClock.offset != null) ? Feed.bridgeClock.offset : 10800;
    A.utcH = c.map(b => new Date(((b.rawTime || b.time) - off) * 1000).getUTCHours());
    A.utcD = c.map(b => Math.floor(((b.rawTime || b.time) - off) / 86400));
    A.asHi = new Array(n).fill(null); A.asLo = new Array(n).fill(null);
    let day = null, hi = -Infinity, lo = Infinity;
    for (let i = 0; i < n; i++){
      if (A.utcD[i] !== day){ day = A.utcD[i]; hi = -Infinity; lo = Infinity; }
      if (A.utcH[i] < 7){ hi = Math.max(hi, c[i].high); lo = Math.min(lo, c[i].low); }
      else if (hi > -Infinity){ A.asHi[i] = hi; A.asLo[i] = lo; }
    }
    A.ret100 = close.map((v, i) => i >= 100 ? (v - close[i - 100]) / close[i - 100] : null);
    return A;
  },

  /* ---------- the rules, read on the closed candle j ---------- */
  EVENTS: [
    /* Connors & Alvarez — RSI(2): buy a sharp 2-day dip inside a long up-trend */
    ['rsi2Buy', 'RSI(2) under 10 above the 200 SMA (Connors)', 'research', 1, (A, j) => A.sma200[j] != null && A.c[j].close > A.sma200[j] && A.rsi2[j] != null && A.rsi2[j] < 10 && !(A.rsi2[j - 1] < 10)],
    ['rsi2Sell', 'RSI(2) over 90 below the 200 SMA (Connors)', 'research', -1, (A, j) => A.sma200[j] != null && A.c[j].close < A.sma200[j] && A.rsi2[j] != null && A.rsi2[j] > 90 && !(A.rsi2[j - 1] > 90)],
    /* Connors & Alvarez — Double 7s: a 7-candle closing low inside an up-trend */
    ['double7Buy', 'Double 7s — 7-candle closing low above the 200 SMA', 'research', 1, (A, j) => Research.lowestClose(A, j, 7) && !Research.lowestClose(A, j - 1, 7) && A.sma200[j] != null && A.c[j].close > A.sma200[j]],
    ['double7Sell', 'Double 7s — 7-candle closing high below the 200 SMA', 'research', -1, (A, j) => Research.highestClose(A, j, 7) && !Research.highestClose(A, j - 1, 7) && A.sma200[j] != null && A.c[j].close < A.sma200[j]],
    /* Connors — 3-day high/low: three lower highs and lows under the 5 SMA, above the 200 */
    ['threeLowBuy', '3 lower highs & lows in an up-trend (Connors)', 'research', 1, (A, j) => { const c = A.c; return j > 3 && A.sma200[j] != null && A.sma5[j] != null && c[j].close > A.sma200[j] && c[j].close < A.sma5[j] && [0, 1, 2].every(k => c[j - k].high < c[j - k - 1].high && c[j - k].low < c[j - k - 1].low) && !(c[j - 3].high < c[j - 4].high && c[j - 3].low < c[j - 4].low); }],
    ['threeHighSell', '3 higher highs & lows in a down-trend (Connors)', 'research', -1, (A, j) => { const c = A.c; return j > 3 && A.sma200[j] != null && A.sma5[j] != null && c[j].close < A.sma200[j] && c[j].close > A.sma5[j] && [0, 1, 2].every(k => c[j - k].high > c[j - k - 1].high && c[j - k].low > c[j - k - 1].low) && !(c[j - 3].high > c[j - 4].high && c[j - 3].low > c[j - 4].low); }],
    /* Internal Bar Strength (Pagonidis 2013): a close near the low tends to bounce */
    ['ibsBuy', 'IBS under 0.2 above the 200 SMA', 'research', 1, (A, j) => A.ibs[j] < 0.2 && A.range[j] > 0 && A.sma200[j] != null && A.c[j].close > A.sma200[j]],
    ['ibsSell', 'IBS over 0.8 below the 200 SMA', 'research', -1, (A, j) => A.ibs[j] > 0.8 && A.range[j] > 0 && A.sma200[j] != null && A.c[j].close < A.sma200[j]],
    /* Toby Crabel — NR7: the narrowest candle of seven, then a break of it */
    ['nr7Up', 'NR7 → break up (Crabel)', 'research', 1, (A, j) => Research.nr7(A, j - 1) && A.c[j].close > A.c[j - 1].high],
    ['nr7Down', 'NR7 → break down (Crabel)', 'research', -1, (A, j) => Research.nr7(A, j - 1) && A.c[j].close < A.c[j - 1].low],
    /* TTM squeeze: Bollinger inside Keltner, then released in the direction of momentum */
    ['squeezeUp', 'Squeeze fires up (Bollinger inside Keltner)', 'research', 1, (A, j) => Research.squeezeFired(A, j) && A.c[j].close > A.e20[j] && A.e20[j] > A.e20[j - 3]],
    ['squeezeDown', 'Squeeze fires down (Bollinger inside Keltner)', 'research', -1, (A, j) => Research.squeezeFired(A, j) && A.c[j].close < A.e20[j] && A.e20[j] < A.e20[j - 3]],
    /* the Turtles, system 2: a 55-candle breakout */
    ['turtle55Up', '55-candle breakout up (Turtle system 2)', 'research', 1, (A, j) => A.don55.hi[j] != null && A.c[j].close > A.don55.hi[j] && A.c[j - 1].close <= A.don55.hi[j - 1]],
    ['turtle55Down', '55-candle breakout down (Turtle system 2)', 'research', -1, (A, j) => A.don55.lo[j] != null && A.c[j].close < A.don55.lo[j] && A.c[j - 1].close >= A.don55.lo[j - 1]],
    /* time-series momentum (Moskowitz, Ooi, Pedersen 2012): trade WITH the trend, on a pullback */
    ['tsmomBuy', 'Trend pullback to EMA 20 (time-series momentum)', 'research', 1, (A, j) => A.ret100[j] > 0 && A.e20[j] > A.e50[j] && A.c[j].low <= A.e20[j] && A.c[j].close > A.e20[j] && A.c[j].close > A.c[j].open && !(A.c[j - 1].low <= A.e20[j - 1])],
    ['tsmomSell', 'Trend pullback to EMA 20, down (time-series momentum)', 'research', -1, (A, j) => A.ret100[j] < 0 && A.e20[j] < A.e50[j] && A.c[j].high >= A.e20[j] && A.c[j].close < A.e20[j] && A.c[j].close < A.c[j].open && !(A.c[j - 1].high >= A.e20[j - 1])],
    /* the London breakout: the Asian range broken between 07:00 and 10:00 UTC */
    ['londonUp', 'London breakout of the Asian range, up', 'research', 1, (A, j) => A.asHi[j] != null && A.utcH[j] >= 7 && A.utcH[j] < 10 && A.c[j].close > A.asHi[j] && A.c[j - 1].close <= A.asHi[j] && Research.firstToday(A, j, 1)],
    ['londonDown', 'London breakout of the Asian range, down', 'research', -1, (A, j) => A.asLo[j] != null && A.utcH[j] >= 7 && A.utcH[j] < 10 && A.c[j].close < A.asLo[j] && A.c[j - 1].close >= A.asLo[j] && Research.firstToday(A, j, -1)],
    /* VWAP reversion: 2 standard deviations away, back inside, only when there is no strong trend */
    ['vwapBuy', 'Back from 2σ under VWAP (weak trend)', 'research', 1, (A, j) => A.vwapZ[j - 1] != null && A.vwapZ[j] != null && A.vwapZ[j - 1] < -2 && A.vwapZ[j] >= -2 && A.adx.adx[j] != null && A.adx.adx[j] < 22],
    ['vwapSell', 'Back from 2σ over VWAP (weak trend)', 'research', -1, (A, j) => A.vwapZ[j - 1] != null && A.vwapZ[j] != null && A.vwapZ[j - 1] > 2 && A.vwapZ[j] <= 2 && A.adx.adx[j] != null && A.adx.adx[j] < 22],
  ],

  lowestClose(A, j, n){ if (j < n) return false; for (let k = 1; k < n; k++) if (A.c[j - k].close <= A.c[j].close) return false; return true; },
  highestClose(A, j, n){ if (j < n) return false; for (let k = 1; k < n; k++) if (A.c[j - k].close >= A.c[j].close) return false; return true; },
  nr7(A, j){ if (j < 7 || !(A.range[j] > 0)) return false; for (let k = 1; k < 7; k++) if (A.range[j - k] <= A.range[j]) return false; return true; },
  squeezeOn(A, j){ return A.bb.up[j] != null && A.kc.up[j] != null && A.bb.up[j] < A.kc.up[j] && A.bb.lo[j] > A.kc.lo[j]; },
  squeezeFired(A, j){ return j > 6 && !this.squeezeOn(A, j) && this.squeezeOn(A, j - 1) && this.squeezeOn(A, j - 2); },
  firstToday(A, j, dir){
    for (let k = j - 1; k > 0 && A.utcD[k] === A.utcD[j]; k--){
      if (A.asHi[k] == null) break;
      if (dir > 0 ? A.c[k].close > A.asHi[k] : A.c[k].close < A.asLo[k]) return false;
    }
    return true;
  },

  /* ---------- the paper bots ----------
     Each bot fires on its buy AND its sell rule, with a stop and a target in
     ATR (so they fit every market). The mean-reversion ones ask for a small
     target (the published versions exit on the first bounce); the trend and
     breakout ones let the winner run further. */
  BOTS: [
    { id: 'rs_rsi2', name: 'Research · RSI(2) pullback', ev: ['rsi2Buy', 'rsi2Sell'], tf: '1h', stop: 2.0, tp: 1.0, groups: ['indices', 'gold', 'crypto'],
      src: 'Larry Connors & Cesar Alvarez, “Short Term Trading Strategies That Work”', kind: 'mean reversion',
      how: 'Only buys when price is above its 200-candle average (a long up-trend) and the 2-period RSI has just dropped under 10 — a sharp short dip. Sells the mirror image in a down-trend.' },
    { id: 'rs_double7', name: 'Research · Double 7s', ev: ['double7Buy', 'double7Sell'], tf: '1h', stop: 2.0, tp: 1.0, groups: ['indices', 'gold'],
      src: 'Connors & Alvarez — published test: 154 trades since 1993, 82.5 % winners on the S&P 500 (daily)', kind: 'mean reversion',
      how: 'Above the 200-candle average, the first close that is the lowest of the last seven candles is bought; the mirror in a down-trend is sold.' },
    { id: 'rs_3day', name: 'Research · 3-day high/low', ev: ['threeLowBuy', 'threeHighSell'], tf: '1h', stop: 2.0, tp: 1.0, groups: ['indices', 'gold'],
      src: 'Larry Connors — 3-Day High/Low Method (ETFs)', kind: 'mean reversion',
      how: 'In an up-trend (above the 200 SMA) but under the 5 SMA, three candles in a row with lower highs AND lower lows — the pullback is bought.' },
    { id: 'rs_ibs', name: 'Research · IBS reversion', ev: ['ibsBuy', 'ibsSell'], tf: '4h', stop: 1.8, tp: 1.0, groups: ['indices'],
      src: 'Pagonidis (2013), Pandey & Joshi (2023) — the Internal Bar Strength effect in equity indices', kind: 'mean reversion',
      how: 'IBS = where the candle closed inside its range (0 = at the low, 1 = at the high). A close in the bottom 20 % inside an up-trend is bought, the top 20 % in a down-trend sold. Published as strongest on broad stock indices.' },
    { id: 'rs_nr7', name: 'Research · NR7 breakout', ev: ['nr7Up', 'nr7Down'], tf: '1h', stop: 1.2, tp: 2.0, groups: null,
      src: 'Toby Crabel, “Day Trading with Short-Term Price Patterns and Opening Range Breakout” (1990)', kind: 'volatility breakout',
      how: 'The narrowest candle of the last seven (a quiet market), then the next candle closes beyond it — the move out of the quiet spell is followed.' },
    { id: 'rs_squeeze', name: 'Research · Squeeze breakout', ev: ['squeezeUp', 'squeezeDown'], tf: '1h', stop: 1.5, tp: 2.5, groups: null,
      src: 'John Carter’s TTM Squeeze (Bollinger Bands inside Keltner Channels)', kind: 'volatility breakout',
      how: 'Bollinger Bands squeezed inside the Keltner Channel for at least two candles, then released — taken in the direction the 20 EMA is already rising or falling.' },
    { id: 'rs_turtle', name: 'Research · Turtle 55', ev: ['turtle55Up', 'turtle55Down'], tf: '4h', stop: 2.0, tp: 3.0, groups: null,
      src: 'The Turtle Traders, system 2 (Dennis & Eckhardt)', kind: 'trend following',
      how: 'A close above the highest high of the last 55 candles is bought, below the lowest low sold. Few winners, but big ones.' },
    { id: 'rs_tsmom', name: 'Research · Trend pullback', ev: ['tsmomBuy', 'tsmomSell'], tf: '1h', stop: 1.5, tp: 2.0, groups: null,
      src: 'Moskowitz, Ooi & Pedersen, “Time Series Momentum”, Journal of Financial Economics (2012) — 58 futures markets', kind: 'trend following',
      how: 'Only in the direction of the last 100 candles and with EMA 20 over EMA 50: the first touch of the 20 EMA that closes back in the trend direction.' },
    { id: 'rs_london', name: 'Research · London breakout', ev: ['londonUp', 'londonDown'], tf: '15m', stop: 1.5, tp: 1.5, groups: ['forex', 'gold'],
      src: 'The Asian-range / London-open breakout (forex session effect) — published results are mixed', kind: 'session breakout',
      how: 'The high and low of the Asian session (00:00–06:59 UTC) are the range; the first close beyond it between 07:00 and 10:00 UTC is followed. One trade per side per day.' },
    { id: 'rs_vwap', name: 'Research · VWAP 2σ fade', ev: ['vwapBuy', 'vwapSell'], tf: '15m', stop: 1.5, tp: 1.0, groups: ['crypto', 'indices', 'gold'],
      src: 'VWAP reversion, as used by index and crypto intraday traders (ADX filter against trends)', kind: 'mean reversion',
      how: 'Price stretched more than two standard deviations away from the day’s VWAP, then back inside — traded back toward VWAP, only when ADX shows no strong trend.' },
  ],

  toBot(d){
    const byId = id => Checker.EVENTS.find(e => e.id === id);
    return {
      id: d.id, name: d.name, research: true,
      blurb: d.how + ' Source: ' + d.src + '. Stop ' + d.stop + '× ATR, target ' + d.tp + '× ATR. Paper only — the Strategy Checker measures where it still works.',
      defaults: Object.assign({ tf: d.tf, tfAuto: false, minScore: 0, maxOpen: 2 }, d.groups ? { groups: d.groups } : {}),
      warmup: 260,
      guide: { icon: '📚', tagline: d.name.replace('Research · ', '') + ' — a ' + d.kind + ' strategy with a published record.',
        tags: ['Research', d.kind, d.tf], steps: [['📖', 'Where it comes from', d.src], ['📐', 'The rule', d.how], ['🎯', 'Stop and target', 'Stop ' + d.stop + '× the average candle range (ATR 14), target ' + d.tp + '× ATR — so the same rule fits a pair that moves 0.1 % a candle and one that moves 1 %.'],
          ['🔬', 'Checked by the Strategy Checker', 'Its buy and sell rules are also signals in the Strategy Checker, measured on every market and timeframe against a random entry. Look there before trusting it.']],
        settings: [], use: ['Leave it on paper for weeks; compare its record with what the checker measures for the same rule.'],
        honest: 'Most of these rules were published on daily charts of US stock indices. On other markets and shorter timeframes they may not hold — which is exactly what the checker is there to tell you.' },
      signal: (w, cfg) => {
        const c = w.slice(0, -1);                                            /* the last candle is still forming */
        if (c.length < 262) return { dir: 0, failed: ['warming up'] };
        const A = Checker.prepare(c.slice(-460));
        const j = A.c.length - 1, atr = A.atr14[j];
        if (!(atr > 0)) return { dir: 0, failed: ['ATR not ready'] };
        for (const id of d.ev){
          const ev = byId(id); if (!ev) continue;
          let on = false; try { on = ev.fn(A, j); } catch(e){ on = false; }
          if (!on) continue;
          const px = A.c[j].close, dir = ev.dir;
          const sl = px - dir * d.stop * atr, tp = px + dir * d.tp * atr;
          return { dir, score: 75, entry: px, sl, tp, model: ev.label, reasons: [ev.label, d.kind + ' · ' + d.src] };
        }
        return { dir: 0, failed: ['No ' + d.name.replace('Research · ', '') + ' setup on the last closed candle'] };
      },
    };
  },

  install(){
    /* 1. the checker learns the new signals */
    const build = Checker.buildEvents.bind(Checker);
    Checker.buildEvents = () => {
      const E = build();
      for (const [id, label, family, dir, fn] of this.EVENTS) if (!E.some(e => e.id === id)) E.push({ id, label, family, dir, fn });
      return E;
    };
    const prep = Checker.prepare.bind(Checker);
    Checker.prepare = (c) => this.prepare(prep(c));
    Checker.EVENTS = null; Checker.buildEvents();
    /* 2. the paper bots — registered before the workspace loads the ledgers */
    for (const d of this.BOTS){
      if (BOT_BY_ID[d.id]) continue;
      const bot = this.toBot(d);
      BOTS.push(bot); BOT_BY_ID[bot.id] = bot;
    }
  },
};
Research.install();
