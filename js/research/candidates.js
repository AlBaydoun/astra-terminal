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
