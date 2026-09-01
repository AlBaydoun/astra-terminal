/* ASTRA Terminal — historical backtester.
   Walks the candles forward one bar at a time and only ever shows the strategy
   what it could have known at that moment: the signal is computed from candles
   up to and including the last CLOSED bar, and the resulting trade is then
   managed through the following bars. No look-ahead, no repainting.

   The same risk engine, spread, commission and slippage model is used as in live
   paper trading, so a backtest and the paper ledger are directly comparable.
   A backtest is a study of the past. It is not a promise about the future. */
const Backtest = {
  running: false,

  async run(botDef, opts){
    opts = opts || {};
    const sym = opts.sym || STORE.symbol;
    const tf = opts.tf || botDef.defaults.tf;
    const cfg = Object.assign({}, botDef.defaults, opts.cfg || {}, { sym });

    let candles;
    try { candles = await API.klines(sym, tf, opts.limit || 1000); }
    catch(e){ return { error: 'Could not load history for ' + baseAsset(sym) + ' — ' + e.message }; }
    if (!candles || candles.length < 250) return { error: 'Not enough history (' + (candles ? candles.length : 0) + ' candles)' };

    /* the higher timeframe some strategies confirm against */
    let higher = null;
    if (botDef.needsHigher){
      try { higher = await API.klines(sym, cfg.higherTf || '15m', 500); } catch(e){}
    }

    const ledger = BotEngine.blank('bt');
    const warm = botDef.warmup || 220;
    const spread = candles[candles.length - 1].close * (opts.spreadPct != null ? opts.spreadPct : 0.02) / 100;
    let evaluated = 0, signals = 0, rejected = 0;
    const rejectReasons = {};

    for (let i = warm; i < candles.length; i++){
      const window = candles.slice(0, i + 1);         // last element is the forming bar
      const bar = candles[i];
      const quote = { price: bar.open, spread, ageSec: 0 };

      /* manage anything already open against this bar */
      for (const pos of ledger.open.slice()) BotEngine.step(ledger, cfg, pos, bar, { price: bar.close });

      evaluated++;
      let sig;
      try {
        sig = botDef.signal(window, cfg, ledger, higher ? higher.filter(h => h.rawTime <= bar.rawTime) : null);
      } catch(e){ continue; }
      if (!sig) continue;

      if (sig.closeLongs){
        for (const pos of ledger.open.filter(p => p.dir > 0)) BotEngine.close(ledger, cfg, pos, bar.close, 'opposite signal');
        continue;
      }
      if (!sig.dir) continue;
      if (sig.score != null && cfg.minScore != null && sig.score < cfg.minScore) continue;
      signals++;

      sig.sym = sym; sig.tf = tf;
      const gate = BotEngine.check(ledger, cfg, sig, quote);
      if (!gate.ok){
        rejected++;
        rejectReasons[gate.reason] = (rejectReasons[gate.reason] || 0) + 1;
        continue;
      }
      BotEngine.open(ledger, cfg, sig, quote, gate);
    }

    /* close whatever is still open at the final price, so the numbers are honest */
    const lastBar = candles[candles.length - 1];
    for (const pos of ledger.open.slice())
      BotEngine.close(ledger, cfg, pos, lastBar.close, 'backtest ended');

    const st = BotEngine.stats(ledger);
    return {
      sym, tf, bars: candles.length,
      from: candles[warm].rawTime, to: lastBar.rawTime,
      evaluated, signals, rejected,
      rejectReasons: Object.entries(rejectReasons).sort((a, b) => b[1] - a[1]).slice(0, 6),
      stats: st, closed: ledger.closed, curve: ledger.equityCurve,
    };
  },

  /* run the same strategy across several instruments and rank the outcome */
  async sweep(botDef, syms, tf, onProgress){
    const out = [];
    for (let i = 0; i < syms.length; i++){
      if (onProgress) onProgress(i, syms.length, syms[i]);
      const r = await this.run(botDef, { sym: syms[i], tf });
      if (!r.error) out.push({ sym: syms[i], tf, ...r.stats, trades: r.stats.trades });
    }
    return out.sort((a, b) => (b.profitFactor === Infinity ? 9e9 : b.profitFactor) - (a.profitFactor === Infinity ? 9e9 : a.profitFactor));
  },
};
