/* Research candidate only; fixed rules in channel20-plan.md. No storage or orders. */
const Channel20 = {
  id: 'channel20Study', name: 'Channel 20 intraday — research candidate', warmup: 60,
  defaults: { tf: '1h', maxOpen: 1, maxPerSymbol: 1, timeLimitBars: 4, noLearn: true },
  signal(window){
    if (window.length < 61) return null;
    const forming = window[window.length - 1];
    const hour = new Date(forming.rawTime * 1000).getUTCHours(); // broker wall-clock field
    if (hour < 10 || hour > 17) return null;
    const c = window.slice(0, -1), last = c[c.length - 1];
    const range = c.slice(-21, -1);
    const high = Math.max(...range.map(x => x.high)), low = Math.min(...range.map(x => x.low));
    const dir = last.close > high ? 1 : last.close < low ? -1 : 0;
    if (!dir) return null;
    const a = IND.atr(c, 20), atr = a[a.length - 1];
    if (!(Number.isFinite(atr) && atr > 0)) return null;
    const entry = forming.open, sl = entry - dir * 2 * atr, tp = entry + dir * 4 * atr;
    if (!(sl > 0 && tp > 0)) return null;
    return { dir, entry, sl, tp, score: 100, model: this.name,
      reasons: ['Closed candle broke its preceding 20-bar channel'], factors: {} };
  },
};
