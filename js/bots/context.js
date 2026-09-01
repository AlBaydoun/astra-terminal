/* ASTRA Terminal — market context for the Master Brain.
   ---------------------------------------------------------------------------
   The brain should not only see "RSI was 55". It should see what KIND of market
   it was: quiet or violent, trending or ranging, which session, where price sat
   in its recent range — and how the world felt that day.

   There is a hard rule here, and breaking it would quietly poison everything:

     A FEATURE MAY ONLY BE USED IF IT CAN BE RECONSTRUCTED FOR A PAST MOMENT.

   Most of the learning corpus comes from backtests. If a feature exists only for
   live trades, the model learns to tell live trades from backtested ones instead
   of learning about markets — and its score becomes meaningless. So context is
   split into two groups and the split is reported in the interface:

     HISTORICAL  — regime, session, range position, and the Fear & Greed index,
                   which alternative.me publishes as a full daily history. These
                   are attached to backtested trades as accurately as to live ones.
     LIVE ONLY   — today's news mood and shock-echo warnings. There is no archive
                   of these, so they carry an availability flag and the brain is
                   told how much of its corpus actually had them. */
const MarketState = {

  /* ---------- regime, computable at any historical bar ---------- */
  of(candles, i){
    if (!candles || candles.length < 60) return null;
    i = i == null ? candles.length - 1 : i;
    if (i < 55) return null;
    const win = candles.slice(0, i + 1);
    const close = win.map(c => c.close);
    const px = close[i];

    const atr = IND.atr(win, 14);
    const a = atr[i];
    if (a == null) return null;

    /* where does today's volatility sit against the last 100 bars? */
    const hist = atr.slice(Math.max(0, i - 100), i).filter(x => x != null);
    const atrPctile = hist.length ? hist.filter(x => x < a).length / hist.length : 0.5;

    const e50 = IND.ema(close, 50), e200 = IND.ema(close, Math.min(200, i - 1));
    const slope = (e50[i] != null && e50[i - 10] != null) ? (e50[i] - e50[i - 10]) / (a || 1) : 0;
    const htf = (e200 && e200[i] != null) ? (px > e200[i] ? 1 : -1) : 0;

    /* position inside the recent range: 0 = at the lows, 1 = at the highs */
    let hi = -Infinity, lo = Infinity;
    for (let j = Math.max(0, i - 20); j <= i; j++){ hi = Math.max(hi, win[j].high); lo = Math.min(lo, win[j].low); }
    const rangePos = hi > lo ? (px - lo) / (hi - lo) : 0.5;

    const vw = IND.vwapDaily(win);
    const distVwap = (vw[i] != null && a) ? Math.max(-3, Math.min(3, (px - vw[i]) / a)) : 0;

    /* trading session, from the bar's own timestamp (UTC) */
    const d = new Date(win[i].rawTime * 1000);
    const h = d.getUTCHours();
    return {
      atrPctile, slope: Math.max(-3, Math.min(3, slope)), htf, rangePos, distVwap,
      asia: (h >= 0 && h < 8) ? 1 : 0,
      london: (h >= 7 && h < 16) ? 1 : 0,
      ny: (h >= 12 && h < 21) ? 1 : 0,
      overlap: (h >= 12 && h < 16) ? 1 : 0,
      dow: d.getUTCDay() / 6,
      t: win[i].rawTime,
    };
  },

  /* ---------- how the world felt, on a given day ----------
     Fear & Greed is the one sentiment series with a real archive, so it is the
     one sentiment input a backtested trade may legitimately carry. */
  fngByDay: null,
  buildFng(){
    if (this.fngByDay || typeof Intel === 'undefined' || !Intel.fng || !Intel.fng.length) return;
    this.fngByDay = {};
    for (const f of Intel.fng) this.fngByDay[Math.floor(f.t / 86400000)] = f.v;
  },

  context(tsMs, live){
    this.buildFng();
    const out = { fng: 0.5, fngAvail: 0, newsMood: 0, riskLvl: 0, ctxAvail: 0 };
    const day = Math.floor(tsMs / 86400000);
    if (this.fngByDay){
      /* the index is daily; look back up to 3 days for the closest published value */
      for (let k = 0; k <= 3; k++){
        const v = this.fngByDay[day - k];
        if (v != null){ out.fng = v / 100; out.fngAvail = 1; break; }
      }
    }
    /* news mood has no archive — only a trade happening right now may carry it */
    const fresh = live && typeof Intel !== 'undefined' && Intel.newsFresh && Intel.newsFresh();
    if (fresh && Math.abs(Date.now() - tsMs) < 6 * 3600 * 1000){
      out.newsMood = Math.max(-1, Math.min(1, (Intel.sentiment || 0) / 100));
      out.riskLvl = Math.min(1, (Intel.risk && Intel.risk.level || 0) / 3);
      out.ctxAvail = 1;
    }
    return out;
  },

  /* what proportion of the corpus actually carries each kind of context */
  coverage(samples){
    if (!samples || !samples.length) return { n: 0, state: 0, fng: 0, news: 0 };
    const n = samples.length;
    const idx = MasterBrain.FEATURES.indexOf('ctxAvail');
    const fIdx = MasterBrain.FEATURES.indexOf('fngAvail');
    const sIdx = MasterBrain.FEATURES.indexOf('atrPctile');
    return {
      n,
      state: sIdx < 0 ? 0 : samples.filter(s => s.x[sIdx] !== 0).length / n * 100,
      fng: fIdx < 0 ? 0 : samples.filter(s => s.x[fIdx] === 1).length / n * 100,
      news: idx < 0 ? 0 : samples.filter(s => s.x[idx] === 1).length / n * 100,
    };
  },
};
