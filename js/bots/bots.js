/* ASTRA Terminal — the Bots workspace.
   Eight sections, each with its own paper ledger, controls, history, reports,
   decisions and lessons. Everything is PAPER ONLY — there is no order path to any
   broker anywhere in this application. */
const BOTS = [
  {
    id: 'brain', name: '★ Master Brain', brain: true,
    blurb: 'Learns from every finished trade and every backtest, then decides which signals are worth taking. It can veto or shrink a trade — never create one.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 },
    warmup: 0, signal: () => null,
  },
  {
    id: 'scanner', name: 'Market Scanner', scan: true,
    blurb: 'Ranks the whole broker universe with the Regime-Aligned Pullback engine. It never opens a trade.',
    defaults: { tf: '15m', tfAuto: false, minScore: 92, maxOpen: 0, threshold: 0.92 },
    warmup: 90,
    signal: (w, cfg) => STRAT.regimePullback(w, cfg),
  },
  {
    id: 'manual', name: 'Manual Trading Bot', manual: true,
    blurb: 'You choose the instrument, direction, size, stop and target. ASTRA monitors the position and applies the same virtual execution model.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 10 },
    warmup: 60,
    signal: () => null,
  },
  {
    id: 'jdub', name: 'Jdub Traders',
    blurb: 'New York 09:30–09:45 opening range. M1 entries confirmed by completed M5 candles, one setup per instrument per session.',
    defaults: { tf: '1m', tfAuto: true, minScore: 70, maxOpen: 2 },
    warmup: 200, sessionGuard: true,
    signal: (w, cfg) => STRAT.jdub(w, cfg),
  },
  {
    id: 'rigor', name: 'RigorGate',
    blurb: 'Acts on scanner evidence: BUY opens a long, SELL closes a long, WAIT does nothing. It never opens shorts.',
    defaults: { tf: '15m', tfAuto: true, minScore: 62, maxOpen: 3 },
    warmup: 90,
    signal: (w, cfg, ledger) => STRAT.rigorGate(w, cfg, ledger),
  },
  {
    id: 'candle', name: 'Candlestick Bot',
    blurb: 'Doji, engulfing, morning/evening star and three soldiers/crows, filtered by EMA trend, ATR, spread and quote freshness.',
    defaults: { tf: '15m', tfAuto: true, minScore: 60, maxOpen: 3 },
    warmup: 70,
    signal: (w, cfg) => STRAT.candlestick(w, cfg),
  },
  {
    id: 'bullEng', name: 'Bullish Engulfing Bot',
    blurb: 'Confirmed Bullish Engulfing only. Buys only — it will never open a short.',
    defaults: { tf: '15m', tfAuto: true, minScore: 60, maxOpen: 3, only: 'engulfBull' },
    warmup: 70,
    signal: (w, cfg) => STRAT.candlestick(w, Object.assign({}, cfg, { only: 'engulfBull' })),
  },
  {
    id: 'bearEng', name: 'Bearish Engulfing Bot',
    blurb: 'Confirmed Bearish Engulfing only. Sells only — it will never open a long.',
    defaults: { tf: '15m', tfAuto: true, minScore: 60, maxOpen: 3, only: 'engulfBear' },
    warmup: 70,
    signal: (w, cfg) => STRAT.candlestick(w, Object.assign({}, cfg, { only: 'engulfBear' })),
  },
  {
    id: 'maMacd', name: 'MA + MTF MACD Bot',
    blurb: 'EMA 20/50/100/200 ribbon (SMA1 shown but never a gate) with MACD confirmed on this timeframe and a higher one. Half off at 1R, stop to breakeven, final 1.5R.',
    defaults: { tf: '5m', tfAuto: false, higherTf: '15m', minScore: 70, maxOpen: 2 },
    warmup: 230, needsHigher: true,
    signal: (w, cfg, ledger, higher) => STRAT.maMacd(w, cfg, higher),
  },
];
const BOT_BY_ID = {};
for (const b of BOTS) BOT_BY_ID[b.id] = b;

const Bots = {
  active: 'brain',
  ledgers: {},
  cfgs: {},
  scan: { rows: [], at: 0, busy: false, universe: 0 },
  timer: null,
  bt: {},                    // last backtest result per bot

  init(){
    for (const b of BOTS){
      this.ledgers[b.id] = BotEngine.load(b.id);
      this.cfgs[b.id] = Object.assign({}, b.defaults, lsGet('astra_botcfg_' + b.id, {}));
    }
    this.wire();
    this.render();
    /* the workspace runs on a slow, deliberate cadence — bots act on closed candles */
    this.timer = setInterval(() => this.tick(), 30000);
    setTimeout(() => this.tick(), 8000);
  },

  cfg(id){ return this.cfgs[id]; },
  saveCfg(id){ lsSet('astra_botcfg_' + id, this.cfgs[id]); },
  ledger(id){ return this.ledgers[id]; },

  /* ---------- which instruments a bot looks at ---------- */
  universe(){
    const out = [];
    const seen = new Set();
    /* when your MT5 terminal is connected its instruments lead, because those
       are the ones you can actually trade and their prices are exact */
    if (Feed.bridge)
      for (const s of BotEngine.PRIORITY) if (Feed.bridgeHas(s) && !seen.has(s)){ seen.add(s); out.push(s); }
    for (const s of BotEngine.PRIORITY) if (!seen.has(s) && (BROKER.is(s) || STORE.tickers.has(s))){ seen.add(s); out.push(s); }
    for (const s of (Watch.list || [])) if (!seen.has(s)){ seen.add(s); out.push(s); }
    for (const s of (MK.monitored || [])) if (!seen.has(s)){ seen.add(s); out.push(s); }
    if (Feed.bridge) for (const s of Feed.bridge.symbols) if (!seen.has(s) && out.length < 120){ seen.add(s); out.push(s); }
    for (const s of STORE.universe.slice(0, 40)) if (!seen.has(s)){ seen.add(s); out.push(s); }
    return out;
  },

  quoteFor(sym){
    const t = STORE.tickers.get(sym);
    if (!t || !(t.last > 0)) return null;
    const qt = Feed.quoteTime[sym];
    const ageSec = qt ? Math.max(0, Date.now() / 1000 - qt) : (Feed.srcOf[sym] === 'binance' ? 0 : null);
    const livePct = (t.spread > 0) ? t.spread / t.last * 100 : null;
    const costs = BROKER.costsFor(sym, livePct);
    const spread = t.spread != null && t.spread > 0 ? t.spread : t.last * costs.spreadPct / 100;
    return { price: t.last, spread, ageSec, bid: t.bid, ask: t.ask, costs };
  },

  /* ---------- the periodic pass ---------- */
  async tick(){
    /* contract sizes first — without them the risk engine cannot size in lots */
    if (Feed.bridge) await Feed.loadSpecs(this.universe().slice(0, 40));
    /* keep open paper positions marked to market first */
    for (const b of BOTS){
      const L = this.ledgers[b.id];
      let touched = false;
      for (const pos of L.open.slice()){
        const q = this.quoteFor(pos.sym);
        if (!q) continue;
        const cfgB = this.cfg(b.id);
        if (this.cfg(b.id).paused && b.id !== 'manual') { pos.last = q.price; continue; }
        BotEngine.step(L, cfgB, pos, null, q);
        touched = true;
      }
      if (touched) BotEngine.save(b.id, L);
    }

    if (this.scanShouldRun()) this.runScan();

    for (const b of BOTS){
      if (b.scan || b.manual || b.brain) continue;
      const cfg = this.cfg(b.id);
      if (cfg.paused) continue;
      await this.runBot(b, false);
    }
    this.render();
  },

  scanShouldRun(){ return !this.scan.busy && Date.now() - this.scan.at > 60000; },

  /* ---------- Market Scanner ---------- */
  async runScan(manual){
    if (this.scan.busy) return;
    this.scan.busy = true;
    const cfg = this.cfg('scanner');
    const syms = this.universe();
    this.scan.universe = syms.length;
    const rows = [];
    const batch = 6;
    for (let i = 0; i < syms.length; i += batch){
      await Promise.all(syms.slice(i, i + batch).map(async sym => {
        try {
          const tf = cfg.tf;
          const candles = await API.klines(sym, tf, 300);
          if (!candles || candles.length < 90) return;
          const q = this.quoteFor(sym);
          const sig = STRAT.regimePullback(candles, { threshold: 0, spread: q ? q.spread : undefined });
          const t = STORE.tickers.get(sym);
          rows.push({
            sym, tf,
            dir: sig.dir || sig.near || 0,
            score: sig.score || 0,
            active: (sig.score || 0) >= (cfg.minScore || 92),
            reasons: sig.reasons || [], failed: sig.failed || [],
            meta: sig.meta || {},
            price: t ? t.last : (candles[candles.length - 1].close),
            spreadPct: q && q.price ? q.spread / q.price * 100 : null,
            ageSec: q ? q.ageSec : null,
            move: sig.tp && sig.entry ? Math.abs(sig.tp - sig.entry) / sig.entry * 100 : null,
            status: Feed.status(sym).label,
          });
        } catch(e){}
      }));
      if (manual && i % 24 === 0) this.render();
    }
    rows.sort((a, b) => (b.active - a.active) || (b.score - a.score));
    this.scan.rows = rows;
    this.scan.at = Date.now();
    this.scan.busy = false;
    if (manual) toast('Scanned ' + rows.length + ' instruments · ' + rows.filter(r => r.active).length + ' active setups', 'ok');
    this.render();
  },

  /* ---------- one automated bot pass ---------- */
  async runBot(b, manual){
    const cfg = this.cfg(b.id);
    const L = this.ledgers[b.id];
    const syms = this.universe().slice(0, cfg.scanDepth || 24);
    let acted = false;

    for (const sym of syms){
      if (L.open.length >= (cfg.maxOpen || 3) && !manual) break;
      const tf = cfg.tf;
      let candles, higher = null;
      try {
        candles = await API.klines(sym, tf, b.warmup + 120);
        if (b.needsHigher) higher = await API.klines(sym, cfg.higherTf || '15m', 300);
      } catch(e){ continue; }
      if (!candles || candles.length < b.warmup) continue;

      let sig;
      try { sig = b.signal(candles, Object.assign({}, cfg, { sym }), L, higher); }
      catch(e){ continue; }
      if (!sig) continue;

      /* one setup per instrument per New York session */
      if (b.sessionGuard && sig.session){
        L.guards = L.guards || {};
        const key = sym + '|' + sig.session;
        if (sig.dir && L.guards[key]){
          if (manual) BotEngine.note(L, 'skip', baseAsset(sym) + ': already took a setup in the ' + sig.session + ' session', { sym });
          continue;
        }
      }

      if (sig.closeLongs){
        for (const pos of L.open.filter(p => p.sym === sym && p.dir > 0)){
          const q = this.quoteFor(sym);
          if (q) { BotEngine.close(L, cfg, pos, q.price, 'opposite signal'); acted = true; }
        }
        continue;
      }
      if (!sig.dir){
        if (manual) BotEngine.note(L, 'wait',
          baseAsset(sym) + ' ' + tf + ' — ' + (sig.failed && sig.failed[0] ? sig.failed[0] : 'no setup'),
          { sym, tf, score: sig.score, reasons: sig.failed });
        continue;
      }
      if (sig.score != null && sig.score < (cfg.minScore || 0)){
        if (manual) BotEngine.note(L, 'wait',
          baseAsset(sym) + ' scored ' + Math.round(sig.score) + ', below the minimum of ' + cfg.minScore, { sym, tf });
        continue;
      }

      sig.sym = sym; sig.tf = tf;
      sig.state = MarketState.of(candles, candles.length - 2);
      const q = this.quoteFor(sym);
      if (q && q.costs) cfg.risk = Object.assign({}, cfg.risk, { commissionPct: q.costs.commissionPct });
      const gate = BotEngine.check(L, cfg, sig, q);
      if (!gate.ok){
        BotEngine.note(L, 'reject', baseAsset(sym) + ' ' + tf + ' rejected — ' + gate.reason, { sym, tf, score: sig.score });
        continue;
      }
      /* the Master Brain has the last word — it may veto or shrink, never enlarge */
      const brain = MasterBrain.approve(sig, cfg, { time: Date.now(), live: true, state: sig.state, spreadPct: q && q.price ? q.spread / q.price * 100 : 0.02 });
      if (!brain.take){
        BotEngine.note(L, 'brain', baseAsset(sym) + ' ' + tf + ' vetoed by the Master Brain — ' + brain.why,
          { sym, tf, score: sig.score });
        continue;
      }
      if (brain.gated && brain.sizeMult < 1) gate.qty *= brain.sizeMult;
      sig.reasons = (sig.reasons || []).concat([brain.why]);
      BotEngine.open(L, cfg, sig, q, gate);
      if (b.sessionGuard && sig.session){ L.guards = L.guards || {}; L.guards[sym + '|' + sig.session] = true; }
      acted = true;
      Alerts && typeof toast === 'function' &&
        toast(b.name + ': paper ' + (sig.dir > 0 ? 'BUY' : 'SELL') + ' ' + baseAsset(sym) + ' ' + tf, 'info');
    }

    BotEngine.save(b.id, L);
    if (manual && !acted) toast(b.name + ': no setup passed every gate right now', 'info');
    return acted;
  },

  /* ---------- manual paper trade ---------- */
  manualOpen(){
    const L = this.ledgers.manual, cfg = this.cfg('manual');
    const sym = document.getElementById('mbSym').value.trim().toUpperCase() || STORE.symbol;
    const dir = document.getElementById('mbDir').value === 'sell' ? -1 : 1;
    const qty = parseFloat(document.getElementById('mbQty').value);
    const sl = parseFloat(document.getElementById('mbSl').value);
    const tp = parseFloat(document.getElementById('mbTp').value);
    const tf = document.getElementById('mbTf').value;
    const note = document.getElementById('mbNote').value.trim();
    const q = this.quoteFor(sym);
    if (!q) return toast('No live price for ' + sym, 'warn');
    if (!(qty > 0)) return toast('Enter a volume', 'warn');
    if (!(sl > 0)) return toast('A stop-loss is required — always', 'warn');
    if (!(tp > 0)) return toast('A take-profit is required', 'warn');
    if (dir > 0 && sl >= q.price) return toast('For a buy the stop must be below the price', 'warn');
    if (dir < 0 && sl <= q.price) return toast('For a sell the stop must be above the price', 'warn');

    const sig = { sym, tf, dir, entry: q.price, sl, tp, score: 100, model: 'Manual', note,
      reasons: ['Opened by hand' + (note ? ' — ' + note : '')], factors: { manual: true } };
    const gate = BotEngine.check(L, cfg, sig, q);
    if (!gate.ok) return toast('Rejected: ' + gate.reason, 'warn');
    gate.qty = qty;                                   // the operator's own size
    gate.riskCash = Math.abs(q.price - sl) * qty;
    BotEngine.open(L, cfg, sig, q, gate);
    BotEngine.save('manual', L);
    document.getElementById('mbNote').value = '';
    toast('Paper ' + (dir > 0 ? 'BUY' : 'SELL') + ' ' + baseAsset(sym) + ' opened and monitored', 'ok');
    this.render();
  },

  closePos(botId, posId){
    const L = this.ledgers[botId];
    const pos = L.open.find(p => p.id === posId);
    if (!pos) return;
    const q = this.quoteFor(pos.sym);
    if (!q) return toast('No price to close against', 'warn');
    BotEngine.close(L, this.cfg(botId), pos, q.price, 'closed by operator');
    BotEngine.save(botId, L);
    this.render();
  },

  resetBot(id){
    const b = BOT_BY_ID[id];
    if (!confirm('Reset ' + b.name + '?\n\nThis clears its paper ledger, history, decisions and lessons. It cannot be undone.')) return;
    this.ledgers[id] = BotEngine.reset(id);
    this.render();
    toast(b.name + ' reset to ' + fmtNum(BotEngine.RISK.startEquity) + ' virtual', 'ok');
  },

  async backtest(id){
    const b = BOT_BY_ID[id];
    const cfg = this.cfg(id);
    const host = document.getElementById('botBt');
    if (host) host.innerHTML = '<div class="empty">Running the strategy over history…</div>';
    const r = await Backtest.run(b, { sym: cfg.btSym || STORE.symbol, tf: cfg.tf, cfg });
    this.bt[id] = r;
    const learned = MasterBrain.ingestBacktest(r, b);
    if (learned) toast('Master Brain learned from ' + learned + ' backtested trades', 'ok');
    this.render();
    if (r.error) toast('Backtest: ' + r.error, 'warn');
  },
};
