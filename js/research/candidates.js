/* ASTRA Terminal — research ideas (written by Claude after a "research run").

   Each idea is pushed into RESEARCH_CANDIDATES and appears on Bots → Research.
   Ids start with rsx_ and NEVER change once published (an added bot keeps its
   paper record under that id). Format:

   RESEARCH_CANDIDATES.push({
     id: 'rsx_example', name: 'Short plain name', found: '2026-10-06',
     tf: '15m', markets: ['indices'], instruments: null, direction: 'buy and sell',
     summary: 'One sentence: what it does.',
     rules: 'The exact entry, stop and target rules in words.',
     why: 'Why it should work.', risks: 'When it will not.',
     evidence: {
       period: '01.06.2026 – 05.10.2026', trades: 64, winRate: 52, pf: 1.48, netR: 18.6, maxDdPct: 7.2,
       random: { pf: 0.91, netR: -6.4 },                        // random entries, same markets, same period
       halves: { first: { pf: 1.4 }, second: { pf: 1.55 } },   // both halves of the history
       perMarket: [{ name: 'DE40', trades: 20, winRate: 55, pf: 1.6, netR: 7.1 }],
     },
     warmup: 120, maxOpen: 2, timeLimitBars: 24,
     signal: (w, cfg) => ({ dir: 0 }),   // the strategy: w = candles (last one still forming)
   });

   Nothing here is real until it is on this list; nothing on this list trades real money. */

/* ===================== Research run 1 — 2026-10-06 =====================
   Tested: 24 JustMarkets instruments (indices, metals, majors, oil, crypto), 15m / 1h / 4h / daily,
   two years of 1h and 4h history and one year of 15m, read through the read-only bridge.
   Rules: signal on a CLOSED candle, entry at the next open, the full spread paid (the account's
   measured in-session spreads x1.5), stop counted first when stop and target fall in one candle,
   one position per instrument. Benchmark: the same number of RANDOM entries on the same
   instruments, same direction, same stop / target / time limit. Drawdown in % assumes 1% risk
   per trade. Most ideas tested did NOT beat random entries and are not published here. */

/* the closed candles and the clock helpers both ideas share */
const RSX = {
  closed(w){ return STRAT.closed(w); },
  day(c){ return Math.floor((c.rawTime != null ? c.rawTime : c.time) / 86400); },   // the broker's day
};

RESEARCH_CANDIDATES.push({
  id: 'rsx_metal_thrust', name: 'Metals thrust · 4h', found: '2026-10-06',
  tf: '4h', markets: ['gold'], instruments: ['XAUUSD.m', 'XAGUSD.m'], direction: 'buy only',
  summary: 'Buys gold or silver after a 4-hour candle that is unusually wide and closes at its very top, while the metal is already in an uptrend.',
  rules: 'On a closed 4h candle: its range is at least 1.3× the 14-candle ATR, it closes in the top 15% of its range, the close is above the 100-EMA and the 50-EMA is above the 100-EMA. Buy at the next open. Stop 1× ATR below, target 2× ATR above, out after 24 candles (4 days) if neither is hit.',
  why: 'A wide 4h candle that closes at its high in an established metals uptrend is buyers taking control, and in metals that pressure has tended to carry on for days. It beat random buying of the SAME metal (profit factor 1.49 vs 1.09) on BOTH gold and silver separately and in both halves of the history - so it is not just gold rising. It also held with double the trading costs (PF 1.42) and with other targets (1.5×: 1.30, 3×: 1.54).',
  risks: 'Buy-only and built for trending metals: in a long metals downtrend it will mostly stand aside, and in a sudden reversal the stop is 1 ATR on a 4h chart, a real-money loss of several dollars per 0.01 lot on gold. Two years of history give 144 trades - enough to clear the bar, not enough to be certain. The idea was confirmed on metals after a first test on every market showed no edge elsewhere.',
  evidence: {
    period: '11.12.2024 – 03.09.2026 (4h)', trades: 144, winRate: 43.8, pf: 1.49, netR: 40.6, maxDdPct: 7.5,
    random: { pf: 1.09, netR: 8.4 },
    halves: { first: { pf: 1.38 }, second: { pf: 1.69 } },
    perMarket: [{ name: 'XAUUSD (gold)', trades: 74, winRate: 43, pf: 1.49, netR: 20.8 }, { name: 'XAGUSD (silver)', trades: 70, winRate: 44, pf: 1.49, netR: 19.8 }],
  },
  warmup: 220, maxOpen: 2, timeLimitBars: 24,
  signal(w, cfg){
    const c = RSX.closed(w); const i = c.length - 1;
    if (i < 210) return { dir: 0, failed: ['warming up'] };
    const close = c.map(x => x.close), A = IND.atr(c, 14)[i], e50 = IND.ema(close, 50)[i], e100 = IND.ema(close, 100)[i];
    const b = c[i]; if (!A || !e50 || !e100) return { dir: 0, failed: ['not enough history'] };
    const rng = b.high - b.low, pos = rng > 0 ? (b.close - b.low) / rng : 0;
    if (!(b.close > e100 && e50 > e100)) return { dir: 0, failed: ['not in an uptrend (close above the 100-EMA, 50 above 100)'] };
    if (rng < 1.3 * A) return { dir: 0, failed: ['last 4h candle is not wide enough (' + (rng / A).toFixed(2) + '× ATR, needs 1.3×)'] };
    if (pos < 0.85) return { dir: 0, failed: ['last 4h candle did not close at its top (' + Math.round(pos * 100) + '% of its range, needs 85%)'] };
    return { dir: 1, score: 80, entry: b.close, sl: b.close - A, tp: b.close + 2 * A, model: 'Metals thrust',
      reasons: ['Wide 4h candle (' + (rng / A).toFixed(2) + '× ATR) closing at ' + Math.round(pos * 100) + '% of its range', 'Uptrend: close above the 100-EMA, 50-EMA above the 100-EMA', 'Research run 1: PF 1.49 vs 1.09 for random metal buys'] };
  },
});

RESEARCH_CANDIDATES.push({
  id: 'rsx_gold_pdretest', name: 'Gold prior-day retest · 4h', found: '2026-10-06',
  tf: '4h', markets: ['gold'], instruments: ['XAUUSD.m'], direction: 'buy only',
  summary: 'Buys gold when it has broken above yesterday’s high, comes back to that level and holds above it, in an uptrend.',
  rules: 'Yesterday’s high (broker day). Earlier today a candle went above it. Now a closed 4h candle dips to within 0.15 ATR of that level but closes above it, and above the 50-EMA. Buy at the next open. Stop = distance to yesterday’s high + 0.8 ATR below the entry, target 2× that distance, out after 24 candles.',
  why: 'A broken high that is retested and holds tends to act as a floor - the sellers who were there are gone. On gold this beat random gold buys clearly (PF 1.82 vs 1.20) in both halves, with a shallow drawdown, and held with double costs (1.78).',
  risks: 'Gold ONLY: the same rules on silver did not beat random silver buys (1.02 vs 1.17), so this may be partly specific to how gold traded in 2024–2026. 79 trades is enough for the bar but on the thin side. The first half was much stronger (2.30) than the second (1.30) - watch it.',
  evidence: {
    period: '27.11.2024 – 18.09.2026 (4h)', trades: 79, winRate: 50.6, pf: 1.82, netR: 32.2, maxDdPct: 5.1,
    random: { pf: 1.20, netR: 9.5 },
    halves: { first: { pf: 2.30 }, second: { pf: 1.30 } },
    perMarket: [{ name: 'XAUUSD (gold)', trades: 79, winRate: 51, pf: 1.82, netR: 32.2 }],
  },
  warmup: 220, maxOpen: 1, timeLimitBars: 24,
  signal(w, cfg){
    const c = RSX.closed(w); const i = c.length - 1;
    if (i < 210) return { dir: 0, failed: ['warming up'] };
    const close = c.map(x => x.close), A = IND.atr(c, 14)[i], e50 = IND.ema(close, 50)[i];
    const b = c[i]; if (!A || !e50) return { dir: 0, failed: ['not enough history'] };
    const today = RSX.day(b);
    /* "yesterday" is the previous TRADING day: on a Monday that is Friday */
    let k = i; while (k >= 0 && RSX.day(c[k]) === today) k--;
    if (k < 0) return { dir: 0, failed: ['no candles from the previous day yet'] };
    const prevDay = RSX.day(c[k]);
    let pdh = -Infinity, broke = false;
    for (let j = k; j >= 0 && RSX.day(c[j]) === prevDay; j--) pdh = Math.max(pdh, c[j].high);
    if (!isFinite(pdh)) return { dir: 0, failed: ['no candles from yesterday yet'] };
    for (let j = i - 1; j >= 0 && RSX.day(c[j]) === today; j--) if (c[j].high > pdh) broke = true;
    if (!broke) return { dir: 0, failed: ['gold has not broken above yesterday’s high earlier today'] };
    if (!(b.low <= pdh + 0.15 * A && b.close > pdh)) return { dir: 0, failed: ['no retest of yesterday’s high that held'] };
    if (!(b.close > e50)) return { dir: 0, failed: ['below the 50-EMA'] };
    const sd = (b.close - pdh) + 0.8 * A;
    return { dir: 1, score: 80, entry: b.close, sl: b.close - sd, tp: b.close + 2 * sd, model: 'Gold prior-day retest',
      reasons: ['Broke yesterday’s high ' + fmtPrice(pdh) + ', came back and held', 'Close above the 50-EMA', 'Research run 1: PF 1.82 vs 1.20 for random gold buys'] };
  },
});

RESEARCH_CANDIDATES.push({
  id: 'rsx_st_regime', name: 'SuperTrend Regime · 4h (Buy & Sell)', found: '2026-10-20',
  tf: '4h', markets: ['gold', 'forex'], instruments: ['XAUUSD.m', 'XAGUSD.m', 'EURUSD.m', 'USDJPY.m', 'USDCHF.m', 'EURJPY.m', 'USDCAD.m', 'AUDUSD.m'], direction: 'buy and sell',
  summary: 'Buys when SuperTrend(10, 3) flips from falling to rising above the 200-EMA (end of a pullback in an uptrend), and sells when SuperTrend(10, 3) flips from rising to falling below the 200-EMA (end of a bounce in a downtrend).',
  rules: 'On a closed 4h candle: compute SuperTrend(10, 3) and the 200-EMA. ▲ BUY when SuperTrend was falling on the prior candle and flips to rising on this candle with the close above the 200-EMA. ▼ SELL when SuperTrend was rising on the prior candle and flips to falling on this candle with the close below the 200-EMA. Enter at the next open. Stop at the SuperTrend line (clamped to 0.5–2.5× ATR14), target 2× the stop distance (2R), out after 24 candles (4 days).',
  why: 'For SuperTrend to flip against the 200-EMA and then flip back in alignment with it, the market must first complete a meaningful counter-trend pullback (or bear-market rally) and then break the ratcheted volatility band back in the direction of the dominant trend. On Gold & Silver 4h this produced 66 trades with a 62.1% win rate and PF 2.15 (vs 1.26 random), paying in both halves (1.92 / 2.56), on both metals (XAUUSD PF 2.53, XAGUSD PF 1.81), on both BUY (PF 2.75) and SELL (PF 1.41), and under double spread (PF 2.09). On Forex Majors 4h it produced 288 trades with PF 1.21 (Buy PF 1.11, Sell PF 1.38, 6 of 8 pairs positive).',
  risks: 'Built for sustained multi-day macro waves (Metals 4h/1h and Forex 4h). Do not run on Stock Indices (mean-reverting on 4h, PF 0.95), Oil (PF 0.94), Crypto (PF 1.03), or 15m charts where spread and chop whipsaw trend-flip stops.',
  evidence: {
    period: '09.12.2024 – 14.10.2026 (4h)', trades: 66, winRate: 62.1, pf: 2.15, netR: 22.2, maxDdPct: 5.9,
    random: { pf: 1.26, netR: 7.6 },
    halves: { first: { pf: 1.92 }, second: { pf: 2.56 } },
    perMarket: [
      { name: 'XAUUSD (gold 4h)', trades: 35, winRate: 63, pf: 2.53, netR: 14.0 },
      { name: 'XAGUSD (silver 4h)', trades: 31, winRate: 61, pf: 1.81, netR: 8.2 },
      { name: 'Forex Majors (8 pairs, 4h)', trades: 288, winRate: 49, pf: 1.21, netR: 27.3 },
      { name: 'Gold & Silver (1h)', trades: 287, winRate: 45, pf: 1.19, netR: 25.3 },
    ],
  },
  warmup: 220, maxOpen: 2, timeLimitBars: 24,
  signal(w, cfg){
    const c = RSX.closed(w); const i = c.length - 1;
    if (i < 210) return { dir: 0, failed: ['warming up (needs 200-EMA)'] };
    const close = c.map(x => x.close), A = IND.atr(c, 14)[i], e200 = IND.ema(close, 200)[i];
    const st = IND.supertrend(c, 10, 3), b = c[i];
    if (!A || !e200 || (st.up[i - 1] == null && st.down[i - 1] == null)) return { dir: 0, failed: ['indicators warming up'] };
    const flipUp = st.up[i] != null && st.down[i - 1] != null;
    const flipDn = st.down[i] != null && st.up[i - 1] != null;
    if (flipUp && b.close > e200){
      const sd = Math.max(0.5 * A, Math.min(2.5 * A, b.close - st.up[i]));
      return { dir: 1, score: 85, entry: b.close, sl: b.close - sd, tp: b.close + 2 * sd, model: 'SuperTrend Regime BUY',
        reasons: ['SuperTrend(10,3) flipped bullish after pullback', 'Close above 200-EMA (' + fmtPrice(e200) + ')', 'Metals 4h PF 2.15 (Buy PF 2.75) · Forex 4h PF 1.21'] };
    }
    if (flipDn && b.close < e200){
      const sd = Math.max(0.5 * A, Math.min(2.5 * A, st.down[i] - b.close));
      return { dir: -1, score: 82, entry: b.close, sl: b.close + sd, tp: b.close - 2 * sd, model: 'SuperTrend Regime SELL',
        reasons: ['SuperTrend(10,3) flipped bearish after bounce', 'Close below 200-EMA (' + fmtPrice(e200) + ')', 'Metals 4h PF 2.15 (Sell PF 1.41) · Forex 4h PF 1.21 (Sell PF 1.38)'] };
    }
    return { dir: 0, failed: ['waiting for SuperTrend(10,3) flip in the direction of the 200-EMA'] };
  },
});

