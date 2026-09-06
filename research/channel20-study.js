/* Runs only on the isolated study page. Never loads, saves or rewrites a ledger. */
const Channel20Study = {
  half(market, candles, half){
    const L = BotEngine.blank('study'), cfg = { ...Channel20.defaults };
    BotEngine.replays.add(L);
    Feed.specs[market.symbol] = market.spec;
    const profile = BROKER.costsFor(market.symbol);
    const q = market.quote;
    const observed = q?.last > 0 && q.ask >= q.bid ? (q.ask - q.bid) / q.last * 100 : 0;
    const spreadPct = Math.max(profile.spreadPct, observed);
    const starts = new Map(), rejected = {}, overnight = [];
    let signals = 0;
    if (candles.length <= Channel20.warmup) throw new Error(market.symbol + ': insufficient half history');
    L.equityCurve.push({ t: candles[Channel20.warmup].rawTime * 1000, eq: L.startEquity });
    for (let i = Channel20.warmup; i < candles.length; i++){
      const bar = candles[i]; cfg.nowTs = bar.rawTime * 1000;
      // Stops crossed by an opening gap fill at the adverse open, never at an
      // unobtainable stop price. Do not flatter target gaps with a better fill.
      for (const p of L.open.slice()){
        if (BotEngine.dayKey(p.entryTime) !== BotEngine.dayKey(cfg.nowTs) && !overnight.includes(p.id)) overnight.push(p.id);
        if ((bar.open - p.sl) * p.dir <= 0) BotEngine.close(L, cfg, p, bar.open, 'gap through stop');
      }
      const forming = { ...bar, high: bar.open, low: bar.open, close: bar.open, volume: 0 };
      const sig = Channel20.signal(candles.slice(0, i).concat([forming]));
      if (sig){
        signals++; sig.sym = market.symbol; sig.tf = '1h';
        const quote = { price: bar.open, spread: bar.open * spreadPct / 100, ageSec: 0 };
        const gate = BotEngine.check(L, cfg, sig, quote);
        if (gate.ok){
          const p = BotEngine.open(L, cfg, sig, quote, gate);
          if (p) starts.set(p.id, { feeIn: p.feeIn, riskCash: p.riskCash });
        } else rejected[gate.reason] = (rejected[gate.reason] || 0) + 1;
      }
      for (const p of L.open.slice()) BotEngine.step(L, cfg, p, bar, { price: bar.close });
      BotEngine.mark(L, cfg.nowTs);
    }
    const last = candles[candles.length - 1];
    for (const p of L.open.slice()) BotEngine.close(L, cfg, p, last.close, 'study ended');
    // Existing closed records omit feeIn from pnl. Correct only this disposable
    // report using the opening record we observed; never mutate legacy history.
    const trades = L.closed.map(t => ({ ...t, pnl: t.pnl - starts.get(t.id).feeIn,
      r: (t.pnl - starts.get(t.id).feeIn) / starts.get(t.id).riskCash }));
    const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl < 0);
    const grossWin = wins.reduce((s, t) => s + t.pnl, 0), grossLoss = -losses.reduce((s, t) => s + t.pnl, 0);
    const net = L.equity - L.startEquity, sum = trades.reduce((s, t) => s + t.pnl, 0);
    if (Math.abs(net - sum) > 0.02) throw new Error(market.symbol + ': net trades do not reconcile to cash');
    const pf = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Infinity : 0;
    return { symbol: market.symbol, half, bars: candles.length,
      from: new Date(candles[Channel20.warmup].rawTime * 1000).toISOString(),
      to: new Date(last.rawTime * 1000).toISOString(), timestampBasis: 'broker server clock, not UTC',
      trades: trades.length, winRate: trades.length ? wins.length / trades.length * 100 : 0,
      profitFactor: Number.isFinite(pf) ? pf : 'Infinity', averageR: trades.length ? trades.reduce((s, t) => s + t.r, 0) / trades.length : 0,
      maxDrawdownPct: BotEngine.stats(L).maxDD, netPnl: net, signals, rejected,
      spreadPct, commissionPct: profile.commissionPct, slippagePct: BotEngine.RISK.slippagePct,
      overnightTrades: overnight.length, cashReconciliationError: net - sum,
      exits: trades.reduce((out, t) => { out[t.reason] = (out[t.reason] || 0) + 1; return out; }, {}) };
  },
  async run(){
    const response = await fetch('channel20-data.json');
    if (!response.ok) throw new Error('Captured history is unavailable');
    const data = await response.json();
    if (data.accountCurrency !== 'USD') throw new Error('This snapshot is not a USD account');
    const results = [];
    for (const m of data.markets){
      const bars = m.candles.slice(0, -1).map(b => ({ rawTime: b[0], time: b[0], open: b[1], high: b[2], low: b[3], close: b[4], volume: b[5] }));
      if (bars.some((b, i) => ![b.rawTime, b.open, b.high, b.low, b.close].every(Number.isFinite) ||
          b.low <= 0 || b.high < Math.max(b.open, b.close) || b.low > Math.min(b.open, b.close) ||
          (i > 0 && b.rawTime <= bars[i - 1].rawTime))) throw new Error(m.symbol + ': invalid or unordered history');
      const cut = Math.floor(bars.length / 2);
      for (const [half, part] of [['first', bars.slice(0, cut)], ['second', bars.slice(cut)]]){
        document.getElementById('studyStatus').textContent = 'Testing ' + m.symbol + ' — ' + half + ' half…';
        await new Promise(resolve => setTimeout(resolve, 0));
        results.push(this.half(m, part, half));
      }
    }
    const passing = data.markets.map(m => m.symbol).filter(sym => results.filter(r => r.symbol === sym)
      .every(r => r.netPnl > 0 && Number(r.profitFactor) > 1 && r.overnightTrades === 0));
    const sufficient = passing.filter(sym => results.filter(r => r.symbol === sym).reduce((n, r) => n + r.trades, 0) >= 100);
    return { candidate: Channel20.name, capturedAt: data.capturedAt, evaluatedAt: new Date().toISOString(),
      passingBothHalves: passing, passingWith100Trades: sufficient,
      verdict: sufficient.length >= 2 ? 'Historical screen passed; forward paper evidence still required' : 'FAILED the predeclared promotion requirement; do not promote as profitable', results };
  },
};
document.getElementById('studyRun').onclick = async () => {
  const button = document.getElementById('studyRun'); button.disabled = true;
  try {
    const result = await Channel20Study.run();
    document.getElementById('studyRaw').textContent = JSON.stringify(result, null, 2);
    document.getElementById('studyStatus').textContent = result.verdict + '. Both halves positive: ' + (result.passingBothHalves.join(', ') || 'none') + '.';
    document.getElementById('studyTable').innerHTML = '<table><thead><tr>' +
      ['Instrument', 'Half', 'Trades', 'Win %', 'PF', 'Average R', 'Max DD %', 'Net USD'].map(h => '<th>' + h + '</th>').join('') +
      '</tr></thead><tbody>' + result.results.map(r => '<tr class="' + (r.netPnl > 0 ? 'pass' : 'fail') + '">' +
        [r.symbol, r.half, r.trades, r.winRate.toFixed(1), Number(r.profitFactor).toFixed(2), r.averageR.toFixed(3), r.maxDrawdownPct.toFixed(2), r.netPnl.toFixed(2)]
          .map(v => '<td>' + v + '</td>').join('') + '</tr>').join('') + '</tbody></table>';
    console.info('ASTRA Channel20 study completed:', result.verdict);
  } catch(e){ document.getElementById('studyStatus').textContent = 'Study failed: ' + e.message; console.error(e); }
  finally { button.disabled = false; }
};
