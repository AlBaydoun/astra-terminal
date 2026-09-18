/* ASTRA Terminal — the Bots workspace.
   Each bot keeps its own paper ledger, controls, history, reports, decisions and
   lessons, and every bot runs on paper always.

   A bot may ALSO be armed for real trading on the Live Trading page. That is the
   only route to a broker in this application, it is off by default, and it needs
   four separate gates opened by hand — see js/bots/live.js. When a bot is armed
   the paper trade still happens alongside the real one, so the simulation can be
   checked against the fills that actually occurred. */
const BOTS = [
  {
    id: 'dash', name: '▦ Dashboard', dash: true,
    blurb: 'Every number every bot has produced: totals, the day-by-day record, which timeframes and instruments were traded, and a full log of every position with the exact time it opened and closed.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 },
    warmup: 0, signal: () => null,
  },
  {
    id: 'analysis', name: 'Buy / Sell Analysis', analysis: true,
    blurb: 'Discover which direction earned more: completed trades, wins, losses, net results and the instruments behind them.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 },
    warmup: 0, signal: () => null,
  },
  {
    id: 'brain', name: '★ Master Brain', brain: true,
    blurb: 'Learns from every finished trade and every backtest, then decides which signals are worth taking. It can veto or shrink a trade — never create one.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 },
    warmup: 0, signal: () => null,
  },
  {
    id: 'fit', name: '◎ Market Fit', fit: true,
    blurb: 'Which strategy actually works on which market, and on which timeframe — measured, not assumed. It runs every strategy against crypto, metals, forex, indices and energy, then splits the history in half and keeps only what stayed profitable in BOTH halves. Almost nothing does, and that is the point.',
    defaults: { tf: '1h', tfAuto: false, minScore: 0, maxOpen: 0 },
    warmup: 0, signal: () => null,
  },
  {
    id: 'live', name: '● Live connection & safety', live: true,
    blurb: 'The only part of ASTRA that can move real money, and the hardest to switch on. Four separate gates, limits you set beforehand, a kill switch, and results read straight back from MetaTrader. Bots start in shadow: every decision worked out and written down, nothing sent.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 },
    warmup: 0, signal: () => null,
  },
  {
    id: 'open', name: '◈ Open Trades', trades: true,
    blurb: 'Every position that is live right now, across every bot, on one screen — with full control over each one: move the stop, set or clear the target, switch on a trailing stop, take half off, or close it outright.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 },
    warmup: 0, signal: () => null,
  },
  {
    id: 'report', name: 'Performance Report', report: true,
    blurb: 'Every bot side by side — what each has actually made on paper, how it finished its trades, and how close it is to being worth real money. Exportable as a PDF.',
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
    /* maxOpen used to sit here and be ignored: BotEngine.check reads cfg.RISK,
       not cfg, so the manual bot inherited the automated limits — three open in
       total and ONE per instrument. That is why a second trade on the same pair
       was refused. Both are now real settings, and both are on the toolbar. */
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 20, maxPerSymbol: 10 },
    warmup: 60,
    signal: () => null,
  },
  {
    id:'liveManual',name:'LIVE trading bot',live:true,liveManual:true,
    blurb:'Your manual market ticket for real JustMarkets orders. Separate from paper trading; locked until you connect, arm and explicitly enable real orders.',
    defaults:{tf:'15m',maxOpen:0},warmup:0,signal:()=>null,
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
  {
    id: 'fade', name: 'Mean Reversion Bot',
    blurb: 'The one bot here that does not follow a trend. It refuses to trade unless ADX says the market is ranging, waits for price to poke outside the Bollinger band and close back inside with RSI stretched, then targets the average. It earns where the trend bots get chopped up.',
    defaults: { tf: '15m', tfAuto: true, minScore: 62, maxOpen: 2,
                bbLen: 20, bbDev: 2, adxMax: 22, rsiLow: 32, stopPad: 0.4, atrMax: 2, minR: 0.8, pierceBars: 3 },
    warmup: 80,
    signal: (w, cfg) => STRAT.meanFade(w, cfg),
  },
  {
    id: 'scanTrader', name: 'Scanner Bot',
    blurb: 'The Market Scanner, but it acts. Instead of taking whichever instrument happens to fire first, it scores EVERY instrument it is allowed to look at, ranks them, and opens only the single best setup on the board — the same engine and the same evidence the scanner shows you, turned into a position.',
    defaults: { tf: '1h', tfAuto: false, minScore: 88, maxOpen: 2, threshold: 0.88, scanDepth: 24 },
    warmup: 90, rankAll: true,
    signal: (w, cfg) => STRAT.regimePullback(w, cfg),
  },
  {
    id: 'cryptoPullback', name: 'Crypto Pullback (measured)',
    blurb: 'Built from the Market Fit study, not from an opinion. Of 62 strategy/market/timeframe combinations measured, this was the ONLY one that stayed profitable in both halves of the history: the Regime-Aligned Pullback on crypto at 1h (+0.10R first half, +0.33R second). It is deliberately fussy — a raised threshold means few trades, which is the point. Crypto only; it is not allowed anywhere else because nowhere else showed evidence.',
    /* These numbers are not tuned. They are EXACTLY the configuration that was
       measured — threshold 0.92, minimum score 92, 1h, the five crypto pairs.
       Changing any of them makes this a different strategy from the one that
       passed the split test, and the evidence would no longer apply to it. */
    defaults: { tf: '1h', tfAuto: false, minScore: 92, maxOpen: 2, threshold: 0.92,
                instruments: ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'] },
    warmup: 90,
    signal: (w, cfg) => STRAT.regimePullback(w, cfg),
  },
  {
    id: 'scalper', name: 'Scalper (both ways)',
    blurb: 'Small trades in both directions, taking a slice out of the little swings. Eight indicators vote — micro-trend, the 50 average, stochastic, a fast RSI, MACD momentum, position in the band, the day average and the candle itself — and no single one can force a trade. ADX decides how the votes are read: it joins a micro-trend when one is running and fades the edges when the market is flat. Before any of that it checks the arithmetic: the target must clear the spread and commission several times over, or the instrument is refused.',
    /* It starts PAUSED. Measured over 163 trades at 5m, 440 at 15m and 589 at
       1h across five instruments it lost on every one, and the reason is
       arithmetic rather than a bad setting: on US30 the average win came to
       38.03 against an average loss of 63.59 — a nominal 1:1 turned into 0.60
       by execution — so it needed a 62.6% win rate and reached 58.8%. Switch it
       on only if you want to watch it; do not arm it. */
    defaults: { tf: '5m', tfAuto: false, minScore: 62, maxOpen: 3, paused: true,
                tpAtr: 0.55, slAtr: 0.55, costMult: 4, trendAdx: 20,
                atrMinPct: 0.05, atrMaxPct: 1.2, timeLimitBars: 14 },
    warmup: 90,
    signal: (w, cfg) => STRAT.scalper(w, Object.assign({}, cfg, {
      costPct: cfg.costPct != null ? cfg.costPct
        : (cfg.sym && typeof Bots !== 'undefined' ? Bots.costPctFor(cfg.sym) : 0.03),
    })),
  },
  {
    id: 'triple', name: 'Triple Confirmation',
    blurb: 'Three kinds of evidence have to agree: a candlestick pattern with a measured edge, formed ON a support or resistance level the market has already turned at, with the ASTRA Confluence reading (EMA20/EMA100 trend, ADX, RSI, tick activity) scored on top. The stop sits beyond the level, so the trade is wrong exactly when the level breaks. Its chart indicator marks every place it would have acted.',
    defaults: { tf: '15m', tfAuto: false, minScore: 60, maxOpen: 2,
                nearAtr: 0.6, padAtr: 0.35, rr: 2, minR: 1.2, minEdge: 0.05, minTouch: 2,
                wing: 3, lookback: 300, tolAtr: 0.35 },
    warmup: 120,
    signal: (w, cfg) => STRAT.triple(w, cfg),
  },
  {
    id: 'conviction', name: 'Max Assurance (conviction)',
    blurb: 'The risky one — and risk done the only way it can pay: by concentrating, not by trading more. It polls five independent engines on the same candle (Triple Confirmation, Pattern Pro, Regime Pullback, Mean Reversion and ASTRA Confluence) plus the higher-timeframe trend, and stays out unless at least three agree with nobody strongly against. Every vote above the minimum puts more on the table, up to 3× the base risk — and never past the ceiling you set here. Its chart indicator shows every candle it would have called a very good trade.',
    /* Runs on paper from the start (the owner asked for it to trade by itself);
       base risk 1% and a ceiling of 3% per trade — six times the
       0.5% the other bots use. The daily-loss lock is raised to match, or the
       second trade of a day would be refused by the shared 2% rule. The
       position-value budget is 300% of equity (3:1) instead of the shared
       100%: at 1:1 a gold or bitcoin position is capped by its VALUE long
       before it reaches even the base risk, so the vote count would change
       nothing — measured: every gold trade came out at 0.02 lots whatever the
       votes said. Raising maxRiskPct is the one knob that makes this bot more
       dangerous; the engine will not let a signal pass it whatever the vote
       count says. */
    defaults: { tf: '15m', tfAuto: false, higherTf: '1h', minScore: 75, maxOpen: 2, paused: false,
                minVotes: 3, minFull: 2, leanScore: 50, maxMult: 3,
                risk: { riskPct: 1, maxRiskPct: 3, maxDailyLossPct: 6, maxNotionalPct: 300 } },
    warmup: 250, needsHigher: true, conviction: true,
    signal: (w, cfg, ledger, higher) => STRAT.conviction(w, cfg, ledger, higher),
  },
  {
    id: 'patPro', name: 'Pattern Pro (all patterns)',
    blurb: 'Trades the same detector the chart draws with, so every marker you see is something it can act on. Patterns are weighted by MEASURED edge rather than reputation: hammer and morning star score highest, engulfing barely registers, and Three Soldiers is refused outright because following it lost money across 154 occurrences.',
    defaults: { tf: '15m', tfAuto: true, minScore: 55, maxOpen: 3,
                minEdge: 0.05, stopPad: 0.25, rr: 1.5, atrMax: 2.5 },
    warmup: 80,
    signal: (w, cfg) => STRAT.patternPro(w, cfg),
  },
  {
    id: 'patGold', name: 'Pattern · Gold & Silver',
    blurb: 'Pattern Pro tuned for metals. Gold’s 15m ATR is about 0.23%, so a 1.6R target sits roughly where the instrument actually travels, and the stop clears the formation by a quarter ATR. Metals only.',
    defaults: { tf: '15m', tfAuto: false, minScore: 55, maxOpen: 2,
                minEdge: 0.05, stopPad: 0.25, rr: 1.6, atrMax: 2.0,
                instruments: ['XAUUSD.m', 'XAGUSD.m'] },
    warmup: 80,
    signal: (w, cfg) => STRAT.patternPro(w, cfg),
  },
  {
    id: 'patCrypto', name: 'Pattern · Crypto',
    blurb: 'Pattern Pro on crypto at 1h, the timeframe that survived the Market Fit split test. Crypto’s ATR runs near 0.4% on 15m, so this uses the slower chart and a wider 1.8R target to stay outside the noise.',
    defaults: { tf: '1h', tfAuto: false, minScore: 58, maxOpen: 2,
                minEdge: 0.08, stopPad: 0.3, rr: 1.8, atrMax: 3.0,
                instruments: ['BTCUSD.m', 'ETHUSD.m', 'BTCUSDT', 'ETHUSDT'] },
    warmup: 80,
    signal: (w, cfg) => STRAT.patternPro(w, cfg),
  },
  {
    id: 'patIndices', name: 'Pattern · Indices',
    blurb: 'Pattern Pro on the US indices, whose 15m ATR is only 0.12–0.17% — the tightest of the group. Stops are padded a little more because index candles gap, and the target is kept modest to match the smaller range.',
    defaults: { tf: '15m', tfAuto: false, minScore: 55, maxOpen: 2,
                minEdge: 0.05, stopPad: 0.35, rr: 1.4, atrMax: 1.5,
                instruments: ['US100.std', 'US30.std'] },
    warmup: 80,
    signal: (w, cfg) => STRAT.patternPro(w, cfg),
  },
  {
    id: 'patEnergy', name: 'Pattern · Oil',
    blurb: 'Pattern Pro on WTI and Brent. Oil moves most of any instrument here (0.4% ATR on 15m) but also carries the widest spread at 0.022%, so this one demands a higher score and asks for more reward before it is worth paying that spread.',
    defaults: { tf: '15m', tfAuto: false, minScore: 62, maxOpen: 2,
                minEdge: 0.08, stopPad: 0.3, rr: 2.0, atrMax: 3.0,
                instruments: ['WTI.m', 'BRENT.m'] },
    warmup: 80,
    signal: (w, cfg) => STRAT.patternPro(w, cfg),
  },
  {
    id: 'patFx', name: 'Pattern · Forex',
    blurb: 'Pattern Pro on the majors at 1h. Forex barely moves on 15m — 0.05% ATR, with the spread eating a tenth of that — so the faster chart is unusable and this runs slower and stricter.',
    defaults: { tf: '1h', tfAuto: false, minScore: 60, maxOpen: 2,
                minEdge: 0.08, stopPad: 0.25, rr: 1.6, atrMax: 1.0,
                instruments: ['EURUSD.m', 'GBPUSD.m', 'USDJPY.m'] },
    warmup: 80,
    signal: (w, cfg) => STRAT.patternPro(w, cfg),
  },
  {
    id: 'bullEngTrail', name: 'Bullish Engulfing · Trailing',
    blurb: 'Identical to the Bullish Engulfing Bot in every respect except the exit: instead of a fixed 1.35R target it lets the trade run, moving the stop up to half an R behind the best price once the trade is 1R in front. Built purely so the two exits can be compared head to head on the same signals.',
    defaults: { tf: '15m', tfAuto: true, minScore: 60, maxOpen: 3, only: 'engulfBull',
                rr: 6, trail: { start: 1, gap: 0.5 } },
    warmup: 70,
    signal: (w, cfg) => STRAT.candlestick(w, Object.assign({}, cfg, { only: 'engulfBull' })),
  },
  {
    id: 'patElite', name: 'Pattern Elite (best edge + trail)',
    blurb: 'The two findings put together. Entry is restricted to the only three patterns that measured a real forward edge — Hammer (+0.38 ATR), Morning Star (+0.27) and Three Crows (+0.23) — and the exit is the ratchet trail that beat a fixed target by +0.18R per trade in a head-to-head on identical signals. Engulfing is excluded because it measured near zero; Three Soldiers because it measured negative. Expect FEW trades: these three patterns are rare, and that is deliberate.',
    defaults: { tf: '15m', tfAuto: true, minScore: 50, maxOpen: 3,
                minEdge: 0.2, stopPad: 0.25, rr: 6,
                patterns: ['Hammer', 'Morning star', 'Three crows'],
                trail: { start: 1, gap: 0.5 } },
    warmup: 80,
    signal: (w, cfg) => STRAT.patternPro(w, cfg),
  },
  {
    id: 'consensus', name: 'Consensus Bot',
    blurb: 'Has no opinion of its own. It asks the Regime Pullback, Candlestick, MA ribbon and Mean Reversion engines what they see on this candle and only trades when enough of them agree, taking the risk geometry from the strongest of them.',
    defaults: { tf: '15m', tfAuto: false, higherTf: '1h', minScore: 70, maxOpen: 2,
                minAgree: 2, leanScore: 62 },
    warmup: 240, needsHigher: true,
    signal: (w, cfg, ledger, higher) => STRAT.consensus(w, cfg, ledger, higher),
  },
];
const BOT_BY_ID = {};
for (const b of BOTS) BOT_BY_ID[b.id] = b;

const Bots = {
  active: 'dash',
  ledgers: {},
  cfgs: {},
  scan: { rows: [], at: 0, busy: false, universe: 0 },
  timer: null,
  bt: {},                    // last backtest result per bot

  init(){
    /* bots the Strategy Lab has published come back before anything is wired */
    if (typeof StratLab !== 'undefined') try { StratLab.init(); } catch(e){}
    for (const b of BOTS){
      this.ledgers[b.id] = BotEngine.load(b.id);
      this.cfgs[b.id] = Object.assign({}, b.defaults, lsGet('astra_botcfg_' + b.id, {}));
      /* Max Assurance first shipped paused; the owner then asked for it to run
         by itself. A setting saved under the old default is lifted once. */
      if (b.id === 'conviction' && this.cfgs[b.id].paused && !lsGet('astra_conviction_auto_v1', false)){
        this.cfgs[b.id].paused = false; lsSet('astra_botcfg_' + b.id, this.cfgs[b.id]); lsSet('astra_conviction_auto_v1', true);
      }
    }
    this.wire();
    this.render();
    /* the workspace runs on a slow, deliberate cadence — bots act on closed candles */
    this.timer = setInterval(() => this.tick(), 30000);
    if (typeof Auto !== 'undefined') Auto.init();
    if (typeof LiveDesk !== 'undefined') LiveDesk.init();
    if (typeof ConfluenceScanner !== 'undefined') ConfluenceScanner.start();
    setTimeout(() => this.tick(), 8000);
  },

  /* ================= shared column sorting =================
     Every table in the workspace uses this rather than growing its own copy.
     A table declares its columns once; the header cells, the click handling and
     the ordering all come from here, so a new table gets sorting for free and
     they all behave identically. */
  sortState: {},

  sortFor(id, def){
    if (!this.sortState[id]) this.sortState[id] = { key: def || null, dir: -1 };
    return this.sortState[id];
  },

  setTableSort(id, key){
    const s = this.sortFor(id);
    if (s.key === key) s.dir = -s.dir;
    else { s.key = key; s.dir = -1; }
  },

  /* cols: [key, label, isNumeric] — a null key makes a plain, unsortable column */
  sortHead(id, cols, def){
    const s = this.sortFor(id, def);
    return '<tr>' + cols.map(([k, label, num]) => k == null
      ? `<th${num ? ' class="num"' : ''}>${esc(label || '')}</th>`
      : `<th class="${num ? 'num ' : ''}sortable${s.key === k ? ' sorted' : ''}"` +
        ` data-tsort="${esc(id)}" data-tkey="${esc(k)}">${esc(label)}` +
        `${s.key === k ? (s.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`).join('') + '</tr>';
  },

  /* valueOf(row, key) lets a table map a column onto something comparable */
  sortRows(id, rows, def, valueOf){
    const s = this.sortFor(id, def);
    if (!s.key) return rows;
    const val = r => valueOf ? valueOf(r, s.key) : r[s.key];
    return rows.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (x == null && y == null) return 0;
      if (x == null) return 1;                   // blanks always sink
      if (y == null) return -1;
      if (typeof x === 'string' || typeof y === 'string')
        return String(x).localeCompare(String(y)) * s.dir;
      return ((x || 0) - (y || 0)) * s.dir;
    });
  },

  cfg(id){ return this.cfgs[id]; },
  saveCfg(id){ lsSet('astra_botcfg_' + id, this.cfgs[id]); },
  ledger(id){ return this.ledgers[id]; },

  /* ---------- which instruments a bot looks at ---------- */
  universe(){
    const out = [];
    const seen = new Set();      // exact names already taken
    const canon = new Set();     // the BROKER's own name for each, to kill duplicates

    /* One market must never appear twice. XAUUSD.m is an alias for the broker's
       XAUUSD.s — the same gold, the same account — but a bot treats two names as
       two markets: it can hold both at once, at double the exposure, while its
       position limit counts one each. Six instruments were doubled this way
       (gold, silver, Bitcoin, EUR/USD, GBP/USD, USD/JPY). First name in wins.
       Binance pairs are NOT folded in with the broker's: BTCUSDT really is a
       different venue with its own spread. */
    const add = s => {
      if (!s || seen.has(s)) return;
      if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(s)) return;
      const c = (typeof Feed !== 'undefined' && Feed.brokerName) ? Feed.brokerName(s) : s;
      if (canon.has(c)) return;
      seen.add(s); canon.add(c); out.push(s);
    };

    /* when your MT5 terminal is connected its instruments lead, because those
       are the ones you can actually trade and their prices are exact */
    if (Feed.bridge) for (const s of BotEngine.PRIORITY) if (Feed.bridgeHas(s)) add(s);

    /* anything the study is allowed to NAME has to be reachable here, or it
       reports "no trades" for an instrument the bots could never pick up —
       ETHUSD.m sat on the grid for weeks doing exactly that */
    if (typeof MarketFit !== 'undefined')
      for (const g of Object.values(MarketFit.GROUPS || {}))
        for (const s of (g.syms || [])) if (Feed.bridgeHas(s) || Feed.isLive(s)) add(s);

    for (const s of BotEngine.PRIORITY) if (BROKER.is(s) || STORE.tickers.has(s)) add(s);
    for (const s of (Watch.list || [])) add(s);
    for (const s of (MK.monitored || [])) add(s);
    if (Feed.bridge) for (const s of Feed.bridge.symbols) if (out.length < 400) add(s);   /* the whole account, not a slice of it */
    for (const s of STORE.universe.slice(0, 40)) add(s);
    return out;
  },

  quoteFor(sym){
    if (typeof MarketSources !== 'undefined' && !MarketSources.executable(sym, Feed.srcOf[sym])) return null;
    const t = STORE.tickers.get(sym);
    if (!t || !Number.isFinite(t.last) || !(t.last > 0) || !Feed.isLive(sym)) return null;
    const qt = Feed.quoteTime[sym];
    const ageSec = Date.now() / 1000 - qt;
    const livePct = (t.spread > 0) ? t.spread / t.last * 100 : null;
    const costs = BROKER.costsFor(sym, livePct);
    const spread = t.spread != null && t.spread > 0 ? t.spread : t.last * costs.spreadPct / 100;
    return { price: t.last, spread, ageSec, time: qt, source: Feed.srcOf[sym], bid: t.bid, ask: t.ask, costs };
  },

  /* ---------- repricing the commission already charged ----------
     Every trade in every ledger was charged 0.001 of its value per side — 0.1%,
     because the engine multiplied a PERCENT figure straight into the notional.
     The real cost on this account is 0.003% a side on FX, metals and energy and
     nothing at all on indices and crypto, so the paper record was carrying
     between 33 and 100 times too much cost and every net, every average R and
     every equity curve was wrong in the same direction.

     This puts it right on the trades that already happened. It is arithmetic,
     not a re-simulation: the entry and exit prices are untouched, only the
     commission taken out of them changes.

     Two details that have to be respected or the books stop adding up:
       - `fees` on a closed trade is BOTH sides. `pnl` had only the exit side
         taken out of it (the entry fee came off equity at the moment of entry).
         So pnl is corrected by the exit portion alone, while equity is rebuilt
         from every leg.
       - `r` is pnl over the risk that was staked. The risk is not stored, so it
         is recovered from the old pnl and the old r, then reapplied.

     A snapshot of every ledger is written to astra_feefix_backup first. */
  OLD_COMMISSION_FRAC: 0.001,

  repriceFees(opts){
    const dry = !!(opts && opts.dryRun);
    const OLD = this.OLD_COMMISSION_FRAC;
    const report = { bots: [], totals: { feesBefore: 0, feesAfter: 0, netBefore: 0, netAfter: 0,
                                         equityBefore: 0, equityAfter: 0, trades: 0 } };
    if (!dry){
      const backup = {};
      for (const b of BOTS){
        const L = this.ledgers[b.id];
        if (L) backup[b.id] = L;
      }
      lsSet('astra_feefix_backup', { at: Date.now(), ledgers: backup });
    }

    for (const b of BOTS){
      if (this.isPage(b)) continue;
      const L = this.ledgers[b.id];
      if (!L || (!L.closed.length && !L.open.length)) continue;

      const before = { fees: 0, net: 0, equity: L.equity };
      let feesAfter = 0, netAfter = 0;

      for (const t of L.closed){
        before.fees += t.fees || 0;
        before.net += t.pnl || 0;
        const frac = BotEngine.commissionFrac(t.sym, BotEngine.RISK);
        const ratio = OLD > 0 ? frac / OLD : 0;
        const oldFees = t.fees || 0;
        if (oldFees > 0){
          /* the entry leg, priced the way it was actually charged */
          const feeIn = Math.min(oldFees, Math.abs(t.qty * t.entry) * OLD);
          const outOld = Math.max(0, oldFees - feeIn);
          const oldPnl = t.pnl;
          const oldR = t.r;
          if (!dry){
            t.fees = +(oldFees * ratio).toFixed(4);
            t.pnl = +(oldPnl + outOld * (1 - ratio)).toFixed(4);
            if (oldR && Math.abs(oldR) > 0.005){
              const riskCash = oldPnl / oldR;
              if (isFinite(riskCash) && riskCash !== 0) t.r = +(t.pnl / riskCash).toFixed(2);
            }
          }
          feesAfter += oldFees * ratio;
          netAfter += oldPnl + outOld * (1 - ratio);
        } else {
          feesAfter += 0;
          netAfter += t.pnl || 0;
        }
      }

      /* positions still open carry only their entry fee */
      for (const p of L.open){
        const frac = BotEngine.commissionFrac(p.sym, BotEngine.RISK);
        const ratio = OLD > 0 ? frac / OLD : 0;
        const oldFees = p.fees || 0;
        before.fees += oldFees;
        if (!dry && oldFees > 0){
          p.fees = +(oldFees * ratio).toFixed(6);
          p.feeIn = +((p.feeIn || oldFees) * ratio).toFixed(6);
        }
        feesAfter += oldFees * ratio;
      }

      if (!dry){
        /* rebuild equity and the curve from the corrected trades rather than
           nudging the old figures, so the two can never drift apart */
        const chron = L.closed.slice().sort((x, y) => x.exitTime - y.exitTime);
        let eq = L.startEquity;
        const curve = [];
        for (const t of chron){
          const frac = BotEngine.commissionFrac(t.sym, BotEngine.RISK);
          const feeIn = Math.abs(t.qty * t.entry) * frac;
          eq += (t.pnl - feeIn);
          curve.push({ t: t.exitTime, eq: +eq.toFixed(2) });
        }
        for (const p of L.open) eq -= (p.fees || 0);
        L.equity = +eq.toFixed(6);
        L.equityCurve = curve;

        /* and the day totals, straight from the corrected trades */
        const daily = {};
        for (const t of L.closed){
          const dk = BotEngine.dayKey(t.exitTime);
          const d = daily[dk] = daily[dk] || { pnl: 0, wins: 0, losses: 0, fees: 0 };
          d.pnl += t.pnl; d.fees += t.fees;
          t.pnl >= 0 ? d.wins++ : d.losses++;
        }
        for (const k of Object.keys(daily)){
          daily[k].pnl = +daily[k].pnl.toFixed(4);
          daily[k].fees = +daily[k].fees.toFixed(4);
        }
        L.daily = daily;
        BotEngine.save(b.id, L);
      }

      report.bots.push({ bot: b.name, trades: L.closed.length,
        feesBefore: +before.fees.toFixed(2), feesAfter: +feesAfter.toFixed(2),
        netBefore: +before.net.toFixed(2), netAfter: +netAfter.toFixed(2),
        equityBefore: +before.equity.toFixed(2), equityAfter: +L.equity.toFixed(2) });
      report.totals.trades += L.closed.length;
      report.totals.feesBefore += before.fees;
      report.totals.feesAfter += feesAfter;
      report.totals.netBefore += before.net;
      report.totals.netAfter += netAfter;
      report.totals.equityBefore += before.equity;
      report.totals.equityAfter += L.equity;
    }
    for (const k of Object.keys(report.totals)) report.totals[k] = +report.totals[k].toFixed(2);
    return report;
  },

  /* put every ledger back exactly as it was before the repricing */
  restoreFeeBackup(){
    const b = lsGet('astra_feefix_backup', null);
    if (!b || !b.ledgers) return { error: 'no backup' };
    let n = 0;
    for (const id of Object.keys(b.ledgers)){
      this.ledgers[id] = b.ledgers[id];
      BotEngine.save(id, this.ledgers[id]);
      n++;
    }
    return { restored: n, takenAt: new Date(b.at).toLocaleString() };
  },

  /* the full round trip on one instrument, as a percentage of price: the live
     spread when MT5 is connected, plus both commissions for this account type */
  costPctFor(sym){
    const q = this.quoteFor(sym);
    const spreadPct = (q && q.price > 0 && q.spread > 0) ? q.spread / q.price * 100 : null;
    const c = BROKER.costsFor(sym, spreadPct);
    return (spreadPct != null ? spreadPct : c.spreadPct) + 2 * c.commissionPct;
  },

  /* ---------- fast stop and target, by percentage ----------
     Traders think in "half a percent", not in "1806.23". These turn a percentage
     into the actual price on the correct side of the market, and then into the
     money it is worth — so the figure you are deciding on is the figure you see.
     Shared by the manual form, the Open Trades page and the live panel, so one
     click means the same thing everywhere. */
  PCT_STEPS: [0.1, 0.2, 0.3, 0.5, 1, 2],

  /* the price sitting pct% away from `price`, on the right side for the side you
     are taking: a target is in your favour, a stop is against you */
  levelAt(price, dir, pct, which){
    const sign = (which === 'tp' ? 1 : -1) * dir;
    return price * (1 + sign * pct / 100);
  },

  /* and what reaching that level is worth on a position of this size */
  moneyAt(entry, dir, qty, level){
    if (level == null || !(qty > 0)) return null;
    return (level - entry) * dir * qty;
  },

  /* the side the manual form is set to — two buttons, not a dropdown */
  manualSide: 1,
  /* how the Amount box is read: 'value' = that much position, 'margin' = that
     much out of the account. Defaults to the safe one. */
  amtMode: 'value',

  /* ---------- pages versus bots ----------
     Six files each spelled out "not brain and not scan and not report and not
     dash and not fit and not live", and every new page meant remembering all
     six. Two of them had already drifted: the report backtested the Dashboard,
     and the tick loop ran a scan for every page. One list, asked once. */
  isPage(b){ return !!(b && (b.brain || b.scan || b.report || b.dash || b.fit || b.live || b.trades || b.analysis)); },
  tradingBots(){ return BOTS.filter(b => !this.isPage(b) && !this.disabled(b.id)); },

  /* ---- bots switched off in Settings: gone from every list, ledger kept ----
     A disabled bot opens nothing new; a position it still holds is managed to
     its stop or target like any other. Its ledger and settings stay, so
     switching it back on brings it back exactly as it was. */
  DISABLED_KEY: 'astra_botdisabled',
  disabledIds(){ return lsGet(this.DISABLED_KEY, []) || []; },
  disabled(id){ return this.disabledIds().includes(id); },
  setDisabled(id, off){
    const list = this.disabledIds().filter(x => x !== id);
    if (off) list.push(id);
    lsSet(this.DISABLED_KEY, list);
    if (off && this.active === id) this.active = 'dash';
    this.renderNav && this.renderNav();
    this.render();
  },
  /* the bots that can trade but are not: paused by you, or locked on an empty paper account */
  idle(){
    const out = { paused: [], locked: [] };
    for (const b of this.tradingBots()){
      if (b.manual || b.liveManual) continue;
      const cfg = this.cfg(b.id) || {};
      const L = this.ledger(b.id);
      if (cfg.paused) out.paused.push(b);
      else if (L && Number.isFinite(L.equity) && L.equity < BotEngine.rules(cfg).minEquity) out.locked.push(b);
    }
    return out;
  },
  setPaused(id, on){
    const cfg = this.cfg(id); if (!cfg) return;
    cfg.paused = !!on; this.saveCfg(id); this.render();
  },

  /* ---------- the periodic pass ---------- */
  lastTickAt: 0,
  async tick(){
    this.lastTickAt = Date.now();
    /* contract sizes first — without them the risk engine cannot size in lots */
    if (Feed.bridge) await Feed.loadSpecs(this.universe().slice(0, 40));
    // Restored positions may not be on any watchlist. Fetch their own quotes
    // before managing saved stops/targets, including after a browser restart.
    const held = [...new Set(Object.values(this.ledgers).flatMap(L => L.open.map(p => p.sym)))];
    for (let i = 0; i < held.length; i += 40) await Feed.quotes(held.slice(i, i + 40));
    /* keep open paper positions marked to market first */
    for (const b of BOTS){
      if (b.managePaper){ await b.managePaper(); continue; }
      if (b.manual && typeof ManualOrders !== 'undefined'){
        await ManualOrders.managePositions(); continue;
      }
      const L = this.ledgers[b.id];
      let touched = false;
      for (const pos of L.open.slice()){
        const q = this.quoteFor(pos.sym);
        if (!q) continue;
        const cfgB = this.cfg(b.id);
        // Pausing prevents new entries; stops and targets must still protect existing ones.
        BotEngine.step(L, cfgB, pos, null, q);
        touched = true;
      }
      if (touched) BotEngine.save(b.id, L);
    }

    if (this.scanShouldRun()) this.runScan();

    for (const b of BOTS){
      if (this.isPage(b) || b.manual || this.disabled(b.id)) continue;
      const cfg = this.cfg(b.id);
      if (cfg.paused && !b.runPaper) continue;
      await this.runBot(b, false);
      (this.lastRunAt = this.lastRunAt || {})[b.id] = Date.now();     /* the live desk shows when each bot last looked */
    }
    this.render();
  },

  scanShouldRun(){ return !this.scan.busy && Date.now() - this.scan.at > 60000; },

  /* ---------- "why is nothing trading?" ----------
     Everything the bots are up against right now, counted: whether the cycle
     is running, how many instruments have a LIVE price (closed markets do
     not), how many are blocked by the Prohibited list, and the reasons the
     bots themselves wrote down in the last hours, most common first. */
  diagnose(hours){
    const since = Date.now() - (hours || 6) * 3600 * 1000;
    const trading = this.tradingBots().filter(b => !b.manual && !b.liveManual);
    const active = trading.filter(b => !(this.cfg(b.id) || {}).paused);
    const idle = this.idle();
    const uni = this.universe();
    let live = 0, stale = 0, blocked = 0;
    const staleList = [], liveList = [];
    for (const sym of uni){
      if (typeof PairRules !== 'undefined' && PairRules.blocked(sym)){ blocked++; continue; }
      if (this.quoteFor(sym)){ live++; liveList.push(sym); } else { stale++; staleList.push(sym); }
    }
    const reasons = {};
    let looked = 0, waits = 0, rejects = 0, brain = 0, opens = 0;
    for (const b of trading){
      const L = this.ledgers[b.id];
      if (!L) continue;
      for (const d of L.decisions || []){
        if (d.t < since) break;
        looked++;
        if (d.kind === 'wait') waits++; else if (d.kind === 'reject') rejects++; else if (d.kind === 'brain') brain++; else if (d.kind === 'open') opens++;
        if (d.kind === 'wait' || d.kind === 'reject' || d.kind === 'brain'){
          /* strip the instrument and timeframe so identical reasons pool */
          const why = String(d.text).replace(/^.*?—\s*/, '').replace(/^Scored \d+ of 100/, 'Scored below the minimum').replace(/\d+(\.\d+)?%/g, 'n%').slice(0, 90);
          reasons[why] = (reasons[why] || 0) + 1;
        }
      }
    }
    const top = Object.entries(reasons).sort((a, b) => b[1] - a[1]).slice(0, 8);
    const day = new Date().getUTCDay();
    const weekend = day === 6 || day === 0 || (day === 5 && new Date().getUTCHours() >= 21);
    return { tickAgo: this.lastTickAt ? Math.round((Date.now() - this.lastTickAt) / 1000) : null,
      bots: trading.length, active: active.length, paused: trading.length - active.length,
      universe: uni.length, live, stale, blocked, liveList, staleList, looked, waits, rejects, brain, opens, top, weekend, hours: hours || 6,
      pausedBots: idle.paused, lockedBots: idle.locked, disabledBots: this.disabledIds().map(id => BOT_BY_ID[id]).filter(Boolean) };
  },

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

  /* which instruments is this bot allowed to trade?
     Evidence beats hope: a strategy that earns on one market and bleeds on
     another should simply not be let near the second one. */
  /* ---------- which markets a bot may touch ----------
     Three ways to decide, chosen per bot on its own page:

       'fit'    — whatever the Market Fit study found held for THIS bot
       'brain'  — only instruments this bot has actually made money on
       'manual' — you pick the groups, and the instruments inside them

     Manual is the default so nothing changes for a bot that was already set up
     by hand. In every mode the Master Brain still has its veto on the individual
     trade — these modes decide where the bot may LOOK, not whether it may act. */
  MARKET_FALLBACK: {
    crypto:  { label: 'Crypto',  syms: ['BTCUSD.m', 'ETHUSD.m', 'BTCUSDT', 'ETHUSDT', 'SOLUSDT'] },
    gold:    { label: 'Metals',  syms: ['XAUUSD.m', 'XAGUSD.m'] },
    forex:   { label: 'Forex',   syms: ['EURUSD.m', 'GBPUSD.m', 'USDJPY.m'] },
    indices: { label: 'Indices', syms: ['US100.std', 'US30.std'] },
    energy:  { label: 'Energy',  syms: ['WTI.m', 'BRENT.m'] },
  },

  marketGroups(){
    return (typeof MarketFit !== 'undefined' && MarketFit.GROUPS) ? MarketFit.GROUPS : this.MARKET_FALLBACK;
  },

  groupSymbols(ids){
    const G = this.marketGroups();
    const out = [];
    for (const id of (ids || [])) for (const s of ((G[id] || {}).syms || [])) if (!out.includes(s)) out.push(s);
    return out;
  },

  /* which group a symbol belongs to, or null if it is outside all of them */
  groupOf(sym){
    const G = this.marketGroups();
    for (const [id, g] of Object.entries(G)) if ((g.syms || []).includes(sym)) return id;
    return null;
  },

  /* what the study says this bot should trade — null when it has no verdict */
  fitSymbolsFor(botId){
    if (typeof MarketFit === 'undefined' || !MarketFit.plan) return null;
    let plan;
    try { plan = MarketFit.plan(); } catch(e){ return null; }
    const mine = plan.find(p => p.botId === botId);
    if (!mine || mine.action !== 'configure') return [];      // paused by the study = trade nothing
    return mine.instruments || [];
  },

  /* instruments this bot has genuinely earned on, from its own closed trades */
  provenSymbols(botId){
    const per = this.perInstrument(botId);
    return Object.entries(per).filter(([, v]) => v.net > 0).map(([k]) => k);
  },

  allowed(b){
    const cfg = this.cfg(b.id);
    let all = this.universe();
    /* in live-only mode a bot never even considers a delayed instrument, so it
       does not burn a scan cycle on something it could not trade anyway */
    if (typeof Feed !== 'undefined')
      all = all.filter(s => Feed.isLive(s));

    const mode = cfg.marketMode || 'manual';

    if (mode === 'fit'){
      const syms = this.fitSymbolsFor(b.id);
      /* no study yet = no opinion, so leave the bot as it was rather than
         silently starving it */
      if (syms) all = all.filter(s => syms.includes(s));
    } else if (mode === 'brain'){
      const good = this.provenSymbols(b.id);
      /* with no finished trades there is nothing to learn from — trade the lot
         until there is */
      if (good.length) all = all.filter(s => good.includes(s));
    } else {
      /* "every market" means every market a trading bot was built for —
         share CFDs are only traded when a bot is switched onto them by hand */
      const groups = (cfg.groups && cfg.groups.length) ? cfg.groups : Object.keys(this.marketGroups()).filter(g => g !== 'stocks' && g !== 'other');
      const pool = this.groupSymbols(groups);
      all = all.filter(s => pool.includes(s));
      if (cfg.instruments && cfg.instruments.length)
        all = all.filter(s => cfg.instruments.includes(s));
    }
    /* pairs you blocked for this bot, in every mode */
    if (cfg.blocked && cfg.blocked.length)
      all = all.filter(s => !cfg.blocked.includes(s));

    /* The prohibited list has the last word, in every mode. A pair Al has
       stopped must not come back because Market Fit took a liking to it this
       morning, or because the bot's own record happens to look good today.
       Only NEW entries are refused — anything already open still manages itself
       out through its own stop and target. */
    if (typeof PairRules !== 'undefined')
      all = all.filter(s => !PairRules.blocked(s));

    /* preferred pairs go first: the bot walks this list in order and stops
       when it has filled its open slots, so first in line = first chance */
    if (cfg.preferred && cfg.preferred.length){
      const rank = s => cfg.preferred.indexOf(s);
      all = all.slice().sort((a, b) => (rank(a) < 0 ? 1e9 : rank(a)) - (rank(b) < 0 ? 1e9 : rank(b)));
    }
    return all;
  },

  /* how this bot has actually done per instrument, from its own closed trades */
  perInstrument(id){
    const L = this.ledger(id);
    const out = {};
    for (const t of L.closed){
      const k = t.sym;
      const o = out[k] = out[k] || { n: 0, net: 0, wins: 0 };
      o.n++; o.net += t.pnl; if (t.pnl > 0) o.wins++;
    }
    return out;
  },

  /* ---------- one automated bot pass ---------- */
  botError(ledger, bot, sym, tf, error){
    // Switching off a venue cancels an in-progress scan; that is not a strategy error.
    if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym)) return;
    const message = bot.name + ' could not evaluate ' + baseAsset(sym) + ' ' + tf + ': ' + error.message;
    BotEngine.note(ledger, 'error', message, { sym, tf });
    console.error('ASTRA ' + message);
  },
  async runBot(b, manual){
    if (b.runPaper) return b.runPaper(b); // Fixed experiments own a paper-only runner.
    const cfg = this.cfg(b.id);
    const L = this.ledgers[b.id];
    /* A bot looks at up to scanDepth instruments per cycle (24 by default) so
       a cycle stays quick. It does NOT always look at the same 24: the window
       walks around the list cycle after cycle, so every allowed instrument gets
       its turn — with the ★ preferred ones looked at every single time. */
    const allowedAll = this.allowed(b);
    const depth = cfg.scanDepth || 24;
    let syms = allowedAll;
    if (allowedAll.length > depth){
      const pref = (cfg.preferred || []).filter(s => allowedAll.includes(s));
      const rest = allowedAll.filter(s => !pref.includes(s));
      const room = Math.max(4, depth - pref.length);
      const start = (this._scanCursor = this._scanCursor || {})[b.id] || 0;
      const slice = [];
      for (let i = 0; i < Math.min(room, rest.length); i++) slice.push(rest[(start + i) % rest.length]);
      this._scanCursor[b.id] = rest.length ? (start + room) % rest.length : 0;
      syms = pref.concat(slice);
    }
    let acted = false;

    /* A ranking bot does not take whichever instrument happens to come first in
       the list. It scores the whole board, then works down it best-first, so the
       position it opens is the strongest setup available rather than the
       earliest alphabetically. Candles fetched while ranking are reused. */
    const preloaded = {};
    if (b.rankAll){
      const scored = [];
      for (const sym of syms){
        if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym)) continue;
        let candles;
        try { candles = await API.klines(sym, cfg.tf, b.warmup + 120); }
        catch(e){ this.botError(L, b, sym, cfg.tf, e); continue; }
        if (!candles || candles.length < b.warmup || (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym))) continue;
        preloaded[sym] = candles;
        let sig = null;
        try { sig = b.signal(candles, Object.assign({}, cfg, { sym }), L, null); }
        catch(e){ this.botError(L, b, sym, cfg.tf, e); continue; }
        scored.push({ sym, score: (sig && (sig.score || 0)) || 0, dir: sig ? (sig.dir || sig.near || 0) : 0 });
      }
      scored.sort((x, y) => y.score - x.score);
      syms = scored.map(x => x.sym);
      if (manual && scored.length)
        BotEngine.note(L, 'scan', 'Board ranked: ' + scored.slice(0, 5)
          .map(x => baseAsset(x.sym) + ' ' + Math.round(x.score)).join(', '), {});
    }

    for (const sym of syms){
      if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym)) continue;
      if (L.open.length >= BotEngine.rules(cfg).maxOpen) break;
      const tf = cfg.tf;
      let candles, higher = null;
      try {
        candles = preloaded[sym] || await API.klines(sym, tf, b.warmup + 120);
        if (b.needsHigher) higher = await API.klines(sym, cfg.higherTf || '15m', 300);
      } catch(e){ this.botError(L, b, sym, tf, e); continue; }
      if (!candles || candles.length < b.warmup || (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym))) continue;

      let sig;
      try { sig = b.signal(candles, Object.assign({}, cfg, { sym }), L, higher); }
      catch(e){ this.botError(L, b, sym, tf, e); continue; }
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
      if (cfg.hours && cfg.hours.length && !cfg.hours.includes(new Date().getUTCHours())){
        if (manual) BotEngine.note(L, 'wait', baseAsset(sym) + ' — outside this bot’s trading hours', { sym, tf });
        continue;
      }
      if (sig.score != null && sig.score < (cfg.minScore || 0)){
        if (manual) BotEngine.note(L, 'wait',
          baseAsset(sym) + ' scored ' + Math.round(sig.score) + ', below the minimum of ' + cfg.minScore, { sym, tf });
        continue;
      }

      sig.sym = sym; sig.tf = tf;
      sig.state = MarketState.of(candles, candles.length - 2);
      await Feed.loadSpecs([sym]);
      const q = this.quoteFor(sym);
      if (q && q.costs) cfg.risk = Object.assign({}, cfg.risk, { commissionPct: q.costs.commissionPct });
      let gate = BotEngine.check(L, cfg, sig, q);
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
      if (brain.gated && brain.sizeMult < 1){
        gate = BotEngine.shrink(gate, brain.sizeMult);
        if (!gate.ok){ BotEngine.note(L, 'reject', gate.reason, { sym, tf }); continue; }
      }
      sig.reasons = (sig.reasons || []).concat([brain.why]);
      if (!BotEngine.open(L, cfg, sig, q, gate)) continue;
      /* The paper trade always happens, armed or not, so live fills can be
         compared against what the simulation expected. Only if this bot is armed
         does the same signal also go to the live gates. */
      if (typeof Live !== 'undefined' && Live.armedEntry(b.id))
        Live.submit(b, sig, gate, q).catch(() => {});
      if (b.sessionGuard && sig.session){ L.guards = L.guards || {}; L.guards[sym + '|' + sig.session] = true; }
      acted = true;
      Alerts && typeof toast === 'function' &&
        toast(b.name + ': paper ' + (sig.dir > 0 ? 'BUY' : 'SELL') + ' ' + baseAsset(sym) + ' ' + tf, 'info');
    }

    BotEngine.save(b.id, L);
    if (manual && !acted) toast(b.name + ': no setup passed every gate right now', 'info');
    return acted;
  },

  /* ---------- a price for an instrument nobody is watching ----------
     quoteFor() reads the ticker cache, which only holds what the chart, the
     watchlist and the monitored list happen to be polling — 81 of the 147
     instruments a bot may scan had no entry in it. Typing one of those into the
     manual form produced "no live price" for a pair the bridge would have
     answered instantly. So when the cache is empty, ask the broker. */
  async liveQuote(sym){
    const cached = this.quoteFor(sym);
    if (cached) return cached;
    try {
      const q = (await Feed.quotes([sym]))[0];
      if (q && q.last > 0){
        const t = STORE.tickers.get(sym) || {};
        Object.assign(t, { last: q.last, bid: q.bid, ask: q.ask,
          spread: (q.ask > 0 && q.bid > 0) ? q.ask - q.bid : t.spread,
          high: q.high != null ? q.high : t.high, low: q.low != null ? q.low : t.low,
          pct: q.pct != null ? q.pct : t.pct });
        STORE.tickers.set(sym, t);
      }
    } catch(e){}
    return this.quoteFor(sym);
  },

  manualQuotes: new Map(),
  async refreshManualQuote(sym){
    const prev = this.manualQuotes.get(sym);
    if (prev && (prev.pending || Date.now() - prev.at < 5000)) return;
    const state = { at: Date.now(), pending: true };
    this.manualQuotes.set(sym, state);
    try {
      await Feed.loadSpecs([sym]);
      await Feed.quotes([sym]);
      if(typeof ManualTicket!=='undefined')await ManualTicket.loadFx(sym);
    } catch(e){ console.warn('ASTRA manual price refresh failed:', sym, e.message); }
    finally {
      state.pending = false;
      state.at = Date.now();
      if (document.getElementById('mbSym')?.dataset.val === sym) this.manualCalc();
    }
  },

  /* ---------- what the operator typed, turned into a real symbol ----------
     THE bug behind "no live price for XPTUSD.m": the box was uppercased, and the
     broker's suffixes are lower case. XPTUSD.m became XPTUSD.M, which matches no
     instrument anywhere, so the quote lookup failed for every metal, index and
     energy contract — everything except the all-caps crypto pairs.
     Match against what actually exists instead, ignoring case, and accept a bare
     base name (XPTUSD, or XAUUSD) as well as the full contract. */
  resolveSymbol(text){
    const t = (text || '').trim();
    if (!t) return null;
    const up = t.toUpperCase();
    const base = s => s.toUpperCase().replace(/\.[A-Z]+$/, '');
    /* ASTRA's own catalogue name wins, so a bare "XPTUSD" becomes XPTUSD.m and
       not the broker's raw XPTUSD — otherwise the same metal would build two
       separate trade histories under two spellings. */
    const cat = (typeof BROKER !== 'undefined') ? BROKER.all() : [];
    const pool = [];
    if (Feed.bridge) for (const s of Feed.bridge.symbols) pool.push(s);
    for (const s of STORE.tickers.keys()) pool.push(s);
    const hit = cat.find(s => s === t)
      || cat.find(s => s.toUpperCase() === up)
      || cat.find(s => base(s) === up)
      || pool.find(s => s === t)
      || pool.find(s => s.toUpperCase() === up)
      || pool.find(s => base(s) === up);
    return hit || up;
  },

  /* where to put a stop when none was typed: 1.5 x ATR on the chosen timeframe,
     falling back to a per-market percentage if the candles cannot be had */
  async autoStop(sym, tf, price, spread){
    const cfg = this.manualCfg(), R = BotEngine.rules(cfg);
    const mult = cfg.manualAutoStopAtr ?? 1.5;
    let dist = 0, why = '';
    try {
      const c = await API.klines(sym, tf, 120);
      if (c && c.length > 20){
        const a = IND.atr(c, 14);
        const atr = a[a.length - 1];
        if (atr > 0){ dist = atr * mult; why = mult + ' × ATR(14) on ' + tf; }
      }
    } catch(e){ console.warn('ASTRA manual automatic stop: history unavailable; using percentage fallback.', e.message); }
    if (!dist){
      const pct = cfg.manualFallbackPct > 0 ? cfg.manualFallbackPct
        : ({ metal: 0.6, energy: 1.2, index: 0.5, fx: 0.3, crypto: 1.5 }[BROKER.costGroup(sym)] || 1);
      dist = price * pct / 100;
      why = pct + '% of the price';
    }
    /* A stop chosen for us must not sit so close that the spread swallows the
       risk. The engine refuses a trade whose spread exceeds a quarter of the
       stop distance, so the automatic stop clears that bar by construction —
       otherwise a plain market order on a wide instrument like platinum is
       rejected for a stop the app itself picked. */
    const floor = (spread > 0 && R.maxSpreadAtrPct > 0) ? spread * 100 / R.maxSpreadAtrPct : 0;
    if (floor > dist){ dist = floor; why = 'spread / your ' + R.maxSpreadAtrPct + '% spread-to-stop limit'; }
    return { dist, why };
  },

  /* ---------- how big is this trade? ----------
     Three ways to say it, in order of precedence: an exact amount of money, a
     number of lots, or nothing at all — in which case the risk limit decides.
     ONE function, called by both the preview and the order, so what the
     calculator shows can never be a different trade from the one that opens. */
  manualRequest(sym, price, inputs){
    const val = id => parseFloat((document.getElementById(id) || {}).value);
    const amt = inputs ? inputs.amt : val('mbAmt'), lots = inputs ? inputs.lots : val('mbQty');
    const mode = inputs?.amtMode ?? this.amtMode;
    const spec = (typeof Feed !== 'undefined' && Feed.specFor) ? Feed.specFor(sym) : null;
    const contract = (spec && spec.contractSize) ? spec.contractSize : 1;
    const cashRate=typeof ManualTicket!=='undefined'?(ManualTicket.fx(sym)?.loss??1):1;
    const lev = (typeof Feed !== 'undefined' && Feed.account && Feed.account.leverage)
      ? Feed.account.leverage : null;
    if ([amt, lots].some(v => !Number.isNaN(v) && !(Number.isFinite(v) && v > 0)))
      return { qty: 0, basis: 'none', lev, reason: 'Size must be positive or left empty' };

    if(lots>0){
      if(!spec)return {qty:0,basis:'lots',lev,reason:'Broker specifications are required to enter lots'};
      return {qty:lots*contract,lots,basis:'lots',lev,why:lots+' lot'};
    }
    if (amt > 0 && price > 0){
      /* "enter with 100" is genuinely ambiguous and the two readings are miles
         apart: on this account's 1:2000 leverage, 100 as MARGIN controls a
         200,000 position, where 100 as POSITION VALUE is a 100 position. Getting
         that wrong would be catastrophic, so the form asks rather than assumes,
         and position value is the default because it is the safe reading. */
      if (mode === 'margin' && !(Number.isFinite(lev) && lev > 0))
        return { qty: 0, basis: 'amount', lev, reason: 'Account leverage is unknown; margin cannot be converted into a position' };
      const asMargin = mode === 'margin';
      const qty = asMargin ? (amt * lev / (price*cashRate)) : (amt / (price*cashRate));
      return { qty, lots: qty / contract, basis: 'amount', lev,
        why: fmtNum(amt) + (asMargin ? ' of margin at 1:' + lev : ' of position value') };
    }
    return { qty: null, lots: null, basis: 'risk', lev, why: 'risk and position-value limits' };
  },

  manualSize(sym, price, stopDist, sl){
    const q = this.manualPreviewQuote(sym), R = BotEngine.rules(this.manualCfg());
    const fill = q ? q.price * (1 + this.manualSide * R.slippagePct / 100) + this.manualSide * q.spread / 2 : price;
    const request = this.manualRequest(sym, fill);
    const none = Object.assign({}, request, { qty: 0, lots: null,
      requestedNotional: request.qty > 0 ? request.qty * fill * (typeof ManualTicket!=='undefined'?(ManualTicket.fx(sym)?.loss??1):1) : 0 });
    if (request.reason) return none;
    if (!(stopDist > 0)) return Object.assign(none, { reason: 'Set a stop to preview the allowed size; an automatic stop is chosen on entry' });
    const sig = { sym, dir: this.manualSide, entry: price, sl: sl == null ? price - this.manualSide * stopDist : sl,
      manual: true, requestedQty: request.qty, tp:parseFloat(document.getElementById('mbTp')?.value)||null };
    if(typeof ManualTicket!=='undefined'){
      const plan=ManualTicket.fit(this.ledgers.manual,this.manualCfg(),sig,q),gate=plan.estimate;
      return {...request,qty:gate?.qty||0,lots:gate?.lots??null,riskCash:gate?.riskCash,gate,reason:plan.reason,plan};
    }
    const gate = BotEngine.check(this.ledgers.manual, this.manualCfg(), sig, q);
    if (!gate.ok) return Object.assign(none, { reason: gate.reason });
    return Object.assign({}, request, { qty: gate.qty, lots: gate.lots || null, riskCash: gate.riskCash, gate });
  },
  manualPreviewQuote(sym){
    const live=this.quoteFor(sym);if(live)return live;
    const t=STORE.tickers.get(sym);if(!(t?.last>0))return null;
    return {price:t.last,spread:t.spread??0,ageSec:Infinity,time:Feed.quoteTime[sym],source:Feed.srcOf[sym]};
  },

  /* ---------- what the account has to work with ----------
     Equity, what is already committed to open positions, and what is therefore
     free. Allocate position value; broker leverage does not replenish it. */
  manualFunds(){
    const L = this.ledgers.manual || { equity: 0, open: [] };
    const lev = (typeof Feed !== 'undefined' && Feed.account && Feed.account.leverage)
      ? Feed.account.leverage : null;
    return Object.assign(BotEngine.funds(L, BotEngine.rules(this.manualCfg())), { lev });
  },

  /* what actually leaves the account to hold a position of this size */
  marginFor(qty, price, lev){
    const notional = Math.abs(qty * price);
    return { notional, margin: lev ? notional / lev : null };
  },

  /* the manual bot's own limits, in the shape BotEngine.check reads */
  manualCfg(){
    const cfg = Object.assign({}, this.cfg('manual'));
    if (cfg.maxOpen == null) cfg.maxOpen = 20;
    if (cfg.maxPerSymbol == null) cfg.maxPerSymbol = 10;
    return cfg;
  },

  /* ---------- manual paper trade ----------
     A market order. Only the instrument is required: leave the volume out and it
     is sized from the risk limit, leave the stop out and one is placed for you,
     leave the target out and the position simply runs until you close it or the
     stop is hit. Both levels can be re-set afterwards. */
  async manualOpen(){ return this.manualMarketOpen(); },
  async manualMarketOpen(draft){
    const L = this.ledgers.manual;
    let cfg = this.manualCfg();
    const sym = draft?.sym || this.resolveSymbol((document.getElementById('mbSym') || {}).dataset.val) || STORE.symbol;
    const dir = draft?.dir ?? this.manualSide;                     // set by the BUY / SELL buttons
    const slIn = draft ? draft.sl : parseFloat(document.getElementById('mbSl').value);
    const tpIn = draft ? draft.tp : parseFloat(document.getElementById('mbTp').value);
    const tf = draft?.tf || document.getElementById('mbTf').value;
    const note = draft ? draft.note : document.getElementById('mbNote').value.trim();
    const inputs = draft || { amt: parseFloat(document.getElementById('mbAmt').value),
      lots: parseFloat(document.getElementById('mbQty').value), amtMode: this.amtMode };

    await Feed.loadSpecs([sym]);
    if(typeof ManualTicket!=='undefined')await ManualTicket.loadFx(sym);
    let q = await this.liveQuote(sym);
    if (!q) return toast('No live price for ' + baseAsset(sym) +
      (Feed.bridge ? ' — the broker did not answer for that symbol' : ' — start START-MT5-Bridge.bat'), 'warn');

    let sl = slIn > 0 ? slIn : null, slWhy = '';
    if (!sl){
      const a = await this.autoStop(sym, tf, q.price, q.spread);
      sl = q.price - dir * a.dist;
      slWhy = ' · stop set automatically at ' + a.why;
    }
    // Automatic-stop history can take time to load; size at the latest quote.
    q = await this.liveQuote(sym);
    if (!q) return toast('No fresh live price — entry refused', 'warn');
    const tp = tpIn > 0 ? tpIn : null;
    if(cfg.manualAutoFit===false || typeof ManualTicket==='undefined'){
      if (dir > 0 && sl >= q.price) return toast('For a buy the stop must be below ' + fmtPrice(q.price), 'warn');
      if (dir < 0 && sl <= q.price) return toast('For a sell the stop must be above ' + fmtPrice(q.price), 'warn');
      if (tp != null && dir > 0 && tp <= q.price) return toast('For a buy the target must be above ' + fmtPrice(q.price), 'warn');
      if (tp != null && dir < 0 && tp >= q.price) return toast('For a sell the target must be below ' + fmtPrice(q.price), 'warn');
    }

    const sig = { sym, tf, dir, entry: q.price, sl, tp, score: 100, model: 'Manual', note, manual: true,
      reasons: ['Opened by hand' + (note ? ' — ' + note : '')], factors: { manual: true } };
    if (typeof ManualOrders !== 'undefined') ManualOrders.syncPreferences();
    cfg = this.manualCfg();
    const R = BotEngine.rules(cfg);
    const fill = q.price * (1 + dir * R.slippagePct / 100) + dir * q.spread / 2;
    const request = this.manualRequest(sym, fill, inputs);
    if (request.reason) return toast('Rejected: ' + request.reason, 'warn');
    sig.requestedQty = request.qty;
    let gate;
    if(typeof ManualTicket!=='undefined'){
      const plan=ManualTicket.fit(L,cfg,sig,q);gate=plan.gate;
      if(!gate)return toast('Not ready: '+plan.reason,'warn');
      Object.assign(sig,plan.sig);
      if(plan.adjustments.length){sig.note=[sig.note,...plan.adjustments].filter(Boolean).join(' · ');this.applyManualFit?.(plan);}
    }else gate=BotEngine.check(L, cfg, sig, q);
    if (!gate.ok) return toast('Rejected: ' + gate.reason, 'warn');

    if (!BotEngine.open(L, cfg, sig, q, gate)) return toast('Entry refused after final risk check', 'warn');
    if (!BotEngine.save('manual', L)){
      this.render();
      return toast('Paper position opened but could not be saved. Keep ASTRA open; new entries are blocked until saving succeeds.', 'warn');
    }
    const noteBox = document.getElementById('mbNote');
    if (noteBox && noteBox.value.trim() === note) noteBox.value = '';
    toast('Paper ' + (dir > 0 ? 'BUY' : 'SELL') + ' ' + baseAsset(sym) + ' at ' + fmtPrice(q.price) +
      (gate.lots ? ' · ' + gate.lots + ' lot' : '') + slWhy, 'ok');
    this.render();
  },

  /* ---------- move the stop or the target on a running position ----------
     Any bot's position can be re-set from the Open Trades page — it is your
     money and your decision. What the app will not do is pretend it did not
     happen: the position is stamped `touched`, every change is kept in
     `pos.edits`, and the flag travels onto the closed trade. So a bot's measured
     record can always be read as "of these N trades, M were adjusted by hand",
     which is the difference between a record you can trust and one you cannot.

     The ORIGINAL risk (slInit, stopDist) is never rewritten, so the R of the
     trade still measures what was actually staked when it opened. */
  editPos(botId, posId, patch){
    const L = this.ledgers[botId];
    const pos = L && L.open.find(p => p.id === posId);
    if (!pos) return;
    const q = this.quoteFor(pos.sym);
    const price = q ? q.price : pos.entry;

    if (patch.sl != null){
      if (!(patch.sl > 0)) return toast('The stop has to be a price', 'warn');
      if (pos.dir > 0 && patch.sl >= price) return toast('For a buy the stop must stay below ' + fmtPrice(price), 'warn');
      if (pos.dir < 0 && patch.sl <= price) return toast('For a sell the stop must stay above ' + fmtPrice(price), 'warn');
      const cfg = botId === 'manual' ? this.manualCfg() : this.cfg(botId) || {};
      const R = BotEngine.rules(cfg);
      const risk = BotEngine.remainingRisk(pos, R, patch.sl) + (pos.fees || 0);
      /* A stop moved BY HAND may widen the risk — that is the point of taking
         over a trade — but not without limit. The hand ceiling is three times
         the bot's risk per trade (or its own maximum, if higher), and the
         daily-loss budget below still applies on top. */
      const eq = Math.min(L.equity, BotEngine.equityNow(L));
      const handPct = Math.max(R.riskPct * 3, R.maxRiskPct || 0);
      const riskCeiling = eq * handPct / 100;
      if (risk > riskCeiling + 1e-8)
        return toast('That stop would risk ' + fmtNum(risk) + ' (' + (risk / eq * 100).toFixed(2) + '% of equity) — the hand limit for this bot is ' +
          handPct + '% (' + fmtNum(riskCeiling) + ')', 'warn');
      const reserved = L.open.reduce((sum, p) => sum + BotEngine.remainingRisk(p, R, p === pos ? patch.sl : null), 0);
      const dayBudget = L.startEquity * R.maxDailyLossPct / 100 + Math.min(0, BotEngine.dailyPnl(L, Date.now()));
      if (reserved > dayBudget + 1e-8)
        return toast('All open stops together would risk ' + fmtNum(reserved) + ', more than the ' + fmtNum(Math.max(0, dayBudget)) +
          ' left in today’s loss budget (' + R.maxDailyLossPct + '% a day)', 'warn');
    }
    if (patch.tp != null && patch.tp > 0){
      if (pos.dir > 0 && patch.tp <= price) return toast('For a buy the target must be above ' + fmtPrice(price), 'warn');
      if (pos.dir < 0 && patch.tp >= price) return toast('For a sell the target must be below ' + fmtPrice(price), 'warn');
    }

    const was = { sl: pos.sl, tp: pos.tp, trail: pos.trail };
    const bits = [];
    if (patch.sl != null && patch.sl !== pos.sl){
      pos.sl = patch.sl;
      bits.push('stop ' + fmtPrice(was.sl) + ' → ' + fmtPrice(pos.sl));
    }
    if (patch.tp !== undefined){
      const next = (patch.tp > 0) ? patch.tp : null;
      if (next !== pos.tp){
        pos.tp = next;
        bits.push('target ' + (was.tp ? fmtPrice(was.tp) : 'none') + ' → ' + (pos.tp ? fmtPrice(pos.tp) : 'none'));
      }
    }
    if (patch.trail !== undefined){
      pos.trail = patch.trail;
      bits.push(patch.trail
        ? 'trailing on — starts at ' + patch.trail.start + 'R, holds ' + patch.trail.gap + 'R back'
        : 'trailing off');
    }
    if (!bits.length) return toast('Nothing changed', 'info');

    pos.touched = true;
    (pos.edits = pos.edits || []).push({ at: Date.now(), what: bits.join(' · ') });
    BotEngine.note(L, 'edit', 'Re-set ' + baseAsset(pos.sym) + ' by hand — ' + bits.join(' · '), { sym: pos.sym });
    const saved = BotEngine.save(botId, L);
    toast(saved ? bits.join(' · ') : 'Stop/target changed in memory but saving failed. Keep ASTRA open.', saved ? 'ok' : 'warn');
    this.render();
    if (typeof Draw !== 'undefined') Draw.redraw();     /* the lines on the chart follow */
  },

  /* move the stop to the entry price — the commonest single action there is */
  breakEven(botId, posId){
    const L = this.ledgers[botId];
    const pos = L && L.open.find(p => p.id === posId);
    if (!pos) return;
    const q = this.quoteFor(pos.sym);
    const price = q ? q.price : pos.entry;
    if (pos.dir > 0 && pos.entry >= price) return toast('Not in profit yet — the stop would sit above the price', 'warn');
    if (pos.dir < 0 && pos.entry <= price) return toast('Not in profit yet — the stop would sit below the price', 'warn');
    pos.beMoved = true;
    this.editPos(botId, posId, { sl: pos.entry });
  },

  /* bank part of a position and let the rest run */
  partialClose(botId, posId, fraction){
    const L = this.ledgers[botId];
    const pos = L && L.open.find(p => p.id === posId);
    if (!pos) return;
    const f = Math.min(0.9, Math.max(0.1, fraction || 0.5));
    const q = this.quoteFor(pos.sym);
    if (!q) return toast('No price to close ' + baseAsset(pos.sym) + ' against', 'warn');
    const part = BotEngine.partialFill(L, this.cfg(botId) || {}, pos, f, q.price);
    if (!part.ok) return toast(part.reason, 'warn');
    const pnl = part.pnl;
    pos.touched = true;
    (pos.edits = pos.edits || []).push({ at: Date.now(), what: 'took ' + part.qty + ' units off at ' + fmtPrice(part.price) });
    BotEngine.note(L, 'partial',
      'Took ' + part.qty + ' units off ' + baseAsset(pos.sym) + ' by hand at ' + fmtPrice(part.price) +
      ' · ' + (pnl >= 0 ? '+' : '') + fmtNum(pnl), { sym: pos.sym });
    BotEngine.mark(L);
    BotEngine.save(botId, L);
    toast('Banked ' + (pnl >= 0 ? '+' : '') + fmtNum(pnl) + ' — the rest runs on', pnl >= 0 ? 'ok' : 'warn');
    this.render();
  },

  closePos(botId, posId){
    const L = this.ledgers[botId];
    const pos = L.open.find(p => p.id === posId);
    if (!pos) return;
    const q = this.quoteFor(pos.sym) || null;
    if (!q) return toast('No price to close ' + baseAsset(pos.sym) + ' against — check the bridge', 'warn');
    BotEngine.close(L, this.cfg(botId), pos, q.price, 'closed by operator');
    BotEngine.save(botId, L);
    this.render();
  },

  resetBot(id){
    if (id === 'manual' && typeof ManualOrders !== 'undefined' && ManualOrders.read().some(o => ['waiting','processing','review'].includes(o.status)))
      return toast('Cancel or review waiting entry orders before resetting the manual account.', 'warn');
    const b = BOT_BY_ID[id];
    if (!confirm('Reset ' + b.name + '?\n\nThis clears its paper ledger, history, decisions and lessons. It cannot be undone.')) return;
    this.ledgers[id] = BotEngine.reset(id);
    this.render();
    toast(b.name + ' reset to ' + fmtNum(BotEngine.RISK.startEquity) + ' virtual', 'ok');
  },

  /* the last measured backtest of each bot, kept so the report is still there
     after a reload — only the summary, never the full trade list */
  rememberBacktest(id, r){
    if (!r || r.error) return;
    const s = r.stats;
    const all = lsGet('astra_btlog', {});
    all[id] = { at: Date.now(), sym: r.sym, tf: r.tf, bars: r.bars, from: r.from, to: r.to,
      trades: s.trades, winRate: +s.winRate.toFixed(1), pf: s.profitFactor === Infinity ? null : +s.profitFactor.toFixed(2),
      avgR: +s.avgR.toFixed(3), pnl: +s.pnl.toFixed(2), pnlPct: +s.pnlPct.toFixed(2),
      maxDD: +s.maxDD.toFixed(1), fees: +s.fees.toFixed(2), signals: r.signals, rejected: r.rejected,
      curve: (r.curve || []).slice(-120).map(e => e.eq) };
    lsSet('astra_btlog', all);
  },
  backtestLog(){ return lsGet('astra_btlog', {}); },

  async backtest(id){
    const b = BOT_BY_ID[id];
    const cfg = this.cfg(id);
    const host = document.getElementById('botBt');
    if (host) host.innerHTML = '<div class="empty">Running the strategy over history…</div>';
    const r = await Backtest.run(b, { sym: cfg.btSym || STORE.symbol, tf: cfg.tf, cfg });
    this.bt[id] = r;
    this.rememberBacktest(id, r);
    const learned = MasterBrain.ingestBacktest(r, b);
    if (learned) toast('Master Brain learned from ' + learned + ' backtested trades', 'ok');
    this.render();
    if (r.error) toast('Backtest: ' + r.error, 'warn');
  },
};
