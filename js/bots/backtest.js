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
    const cfg = Object.assign({}, botDef.defaults, opts.cfg || {}, { sym, noLearn: true });
    if (typeof Feed !== 'undefined') await Feed.loadSpecs([sym]);

    let candles;
    try { candles = await API.klines(sym, tf, opts.limit || 1000); }
    catch(e){ return { error: 'Could not load history for ' + baseAsset(sym) + ' — ' + e.message }; }
    if (!candles || candles.length < 250) return { error: 'Not enough history (' + (candles ? candles.length : 0) + ' candles)' };

    /* Split testing. Fitting a strategy to a stretch of history and admiring the
       result is not research; the question is whether what worked in the first
       half still worked in the second. 'first' and 'second' cut the window in
       half so the two can be compared. */
    if (opts.slice === 'first') candles = candles.slice(0, Math.floor(candles.length / 2));
    else if (opts.slice === 'second') candles = candles.slice(Math.floor(candles.length / 2));
    const warm = botDef.warmup || 220;
    if (candles.length <= warm) return { error: 'Not enough history after split for ' + warm + ' warm-up bars' };

    /* the higher timeframe some strategies confirm against */
    let higher = null;
    if (botDef.needsHigher){
      try { higher = await API.klines(sym, cfg.higherTf || '15m', 500); }
      catch(e){ return { error: 'Required higher-timeframe history failed: ' + e.message }; }
      if (!higher || !higher.length) return { error: 'Required higher-timeframe history is empty' };
    }

    const ledger = BotEngine.blank('bt');
    BotEngine.replays.add(ledger);
    ledger.equityCurve.push({ t: candles[warm].rawTime * 1000, eq: ledger.startEquity });
    /* cost model for this instrument: live spread from MT5 when the bridge is
       running, otherwise the profile for your JustMarkets account type */
    const liveT = STORE.tickers.get(sym);
    const livePct = (liveT && liveT.spread > 0 && liveT.last > 0) ? liveT.spread / liveT.last * 100 : null;
    const costs = (typeof BROKER !== 'undefined') ? BROKER.costsFor(sym, livePct)
      : { spreadPct: 0.02, commissionPct: 0.001, source: 'default' };
    const spread = candles[candles.length - 1].close * (opts.spreadPct != null ? opts.spreadPct : costs.spreadPct) / 100;
    cfg.risk = Object.assign({}, cfg.risk, { commissionPct: costs.commissionPct });
    /* a cost-aware strategy needs the round trip and the instrument, the same
       way the live scan hands them over */
    cfg.sym = sym;
    cfg.costPct = (opts.spreadPct != null ? opts.spreadPct : costs.spreadPct) + 2 * costs.commissionPct;
    let evaluated = 0, signals = 0, rejected = 0;
    const rejectReasons = {};

    for (let i = warm; i < candles.length; i++){
      const bar = candles[i];
      // At the open, this candle's high, low, close and volume are still unknown.
      const forming = { ...bar, high: bar.open, low: bar.open, close: bar.open, volume: 0 };
      const window = candles.slice(0, i).concat([forming]);
      const quote = { price: bar.open, spread, ageSec: 0 };
      /* replay time, so daily limits roll over per simulated day */
      cfg.nowTs = bar.rawTime * 1000;

      evaluated++;
      let sig;
      try {
        const hi = higher ? higher.filter(h => h.rawTime <= bar.rawTime).map((h, j, all) =>
          j === all.length - 1 ? { ...h, high: h.open, low: h.open, close: h.open, volume: 0 } : h) : null;
        sig = botDef.signal(window, cfg, ledger, hi);
      } catch(e){
        console.error('ASTRA backtest strategy failed:', botDef.id, sym, tf, e);
        return { error: 'Strategy failed at ' + new Date(cfg.nowTs).toISOString() + ': ' + e.message };
      }
      // All returns below only end the entry decision. Every position, including
      // a new fill, still sees this candle's stop/target range immediately after.
      const enter = () => {
        if (!sig) return;
        if (sig.dir) sig.state = MarketState.of(window, window.length - 2);

        if (sig.closeLongs){
          for (const pos of ledger.open.filter(p => p.dir > 0)) BotEngine.close(ledger, cfg, pos, bar.open, 'opposite signal');
          return;
        }
        if (!sig.dir) return;
        if (sig.score != null && cfg.minScore != null && sig.score < cfg.minScore) return;
        /* session filter: cfg.hours is a list of UTC hours a bot may enter in.
           Measured across crypto, gold, forex and indices, hourly range peaks at
           12:00-15:00 UTC (the London afternoon / New York morning overlap) and
           collapses to roughly half that in the Asian hours. */
        if (cfg.hours && cfg.hours.length &&
            !cfg.hours.includes(new Date(bar.rawTime * 1000).getUTCHours())) return;
        signals++;

        sig.sym = sym; sig.tf = tf;
        const gate = BotEngine.check(ledger, cfg, sig, quote);
        if (!gate.ok){
          rejected++;
          rejectReasons[gate.reason] = (rejectReasons[gate.reason] || 0) + 1;
          return;
        }
        BotEngine.open(ledger, cfg, sig, quote, gate);
      };
      enter();
      for (const pos of ledger.open.slice()) BotEngine.step(ledger, cfg, pos, bar, { price: bar.close });
      BotEngine.mark(ledger, cfg.nowTs);
    }

    /* close whatever is still open at the final price, so the numbers are honest */
    const lastBar = candles[candles.length - 1];
    for (const pos of ledger.open.slice())
      BotEngine.close(ledger, cfg, pos, lastBar.close, 'backtest ended');

    const st = BotEngine.stats(ledger);
    return {
      sym, tf, bars: candles.length, costs,
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
