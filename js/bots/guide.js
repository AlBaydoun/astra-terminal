/* ASTRA Terminal — the bot guides.
   One plain-language explanation per bot and per page: what it is, how it
   thinks, what every setting does and why it is there, how to use it, and an
   honest note on what has actually been measured. Opened from the ? on every
   bot's header. Reading only — nothing here changes a setting or a trade. */
const BotGuide = {

  /* ---------- little sketches, drawn inline so they follow the theme ---------- */
  ART: {
    engulf: `<svg viewBox="0 0 120 80"><g stroke-width="2"><line x1="40" y1="14" x2="40" y2="66" stroke="#f6465d"/><rect x="33" y="24" width="14" height="30" fill="#f6465d"/><line x1="72" y1="8" x2="72" y2="72" stroke="#2ebd85"/><rect x="63" y="16" width="18" height="48" fill="#2ebd85"/></g><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">the green body swallows the red one</text></svg>`,
    hammer: `<svg viewBox="0 0 120 80"><g stroke-width="2"><line x1="60" y1="10" x2="60" y2="70" stroke="#2ebd85"/><rect x="52" y="10" width="16" height="14" fill="#2ebd85"/></g><line x1="20" y1="70" x2="100" y2="70" stroke="#8fa3c8" stroke-dasharray="3 3"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">long lower wick, small body on top</text></svg>`,
    pullback: `<svg viewBox="0 0 120 80"><polyline points="8,64 30,44 48,50 70,28 84,36 110,12" fill="none" stroke="#2ebd85" stroke-width="2"/><path d="M8 66 C 40 50, 70 40, 110 20" fill="none" stroke="#52dbc6" stroke-width="1.5" stroke-dasharray="4 3"/><circle cx="84" cy="36" r="4" fill="#ffd166"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">trend up · dip to the average · buy the turn</text></svg>`,
    band: `<svg viewBox="0 0 120 80"><path d="M6 20 C 40 14, 80 26, 114 20" fill="none" stroke="#8b6cff" stroke-width="1.5"/><path d="M6 58 C 40 52, 80 64, 114 58" fill="none" stroke="#8b6cff" stroke-width="1.5"/><path d="M6 39 C 40 33, 80 45, 114 39" fill="none" stroke="#8b6cff" stroke-width="1" stroke-dasharray="3 3"/><polyline points="20,36 40,48 56,66 66,58 90,42" fill="none" stroke="#e8edf7" stroke-width="2"/><circle cx="56" cy="66" r="4" fill="#ffd166"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">pokes outside the band · closes back in · aims for the middle</text></svg>`,
    level: `<svg viewBox="0 0 120 80"><line x1="6" y1="52" x2="114" y2="52" stroke="#2ebd85" stroke-width="1.5" stroke-dasharray="5 3"/><polyline points="8,20 26,50 40,34 58,50 72,30 90,51 100,40 112,18" fill="none" stroke="#e8edf7" stroke-width="2"/><circle cx="26" cy="50" r="3" fill="#ffd166"/><circle cx="58" cy="50" r="3" fill="#ffd166"/><circle cx="90" cy="51" r="3" fill="#ffd166"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">a level the market has turned at three times</text></svg>`,
    votes: `<svg viewBox="0 0 120 80"><g font-size="9" text-anchor="middle" fill="#e8edf7"><rect x="6" y="14" width="30" height="20" rx="4" fill="#2ebd85"/><text x="21" y="28">BUY</text><rect x="45" y="14" width="30" height="20" rx="4" fill="#2ebd85"/><text x="60" y="28">BUY</text><rect x="84" y="14" width="30" height="20" rx="4" fill="#4a5a7c"/><text x="99" y="28">wait</text><rect x="26" y="44" width="30" height="20" rx="4" fill="#2ebd85"/><text x="41" y="58">BUY</text><rect x="64" y="44" width="30" height="20" rx="4" fill="#4a5a7c"/><text x="79" y="58">lean</text></g><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">independent engines · trade only when enough agree</text></svg>`,
    ribbon: `<svg viewBox="0 0 120 80"><path d="M6 60 C 40 50, 70 30, 114 10" fill="none" stroke="#52dbc6" stroke-width="1.5"/><path d="M6 64 C 40 56, 70 38, 114 18" fill="none" stroke="#ffd166" stroke-width="1.5"/><path d="M6 68 C 40 62, 70 46, 114 26" fill="none" stroke="#ff8799" stroke-width="1.5"/><path d="M6 72 C 40 68, 70 54, 114 34" fill="none" stroke="#8b6cff" stroke-width="1.5"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">averages stacked in order = a trend worth following</text></svg>`,
    ladder: `<svg viewBox="0 0 120 80"><line x1="30" y1="16" x2="90" y2="16" stroke="#50edbc" stroke-width="2"/><text x="96" y="19" font-size="8" fill="#50edbc">target</text><line x1="30" y1="40" x2="90" y2="40" stroke="#8fa3c8" stroke-width="2"/><text x="96" y="43" font-size="8" fill="#8fa3c8">entry</text><line x1="30" y1="60" x2="90" y2="60" stroke="#ff8799" stroke-width="2"/><text x="96" y="63" font-size="8" fill="#ff8799">stop</text><text x="14" y="30" font-size="8" fill="currentColor">2R</text><text x="14" y="52" font-size="8" fill="currentColor">1R</text><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">risk one unit to win two — "2R"</text></svg>`,
    trail: `<svg viewBox="0 0 120 80"><polyline points="8,62 26,50 40,56 58,34 72,40 90,18 104,26" fill="none" stroke="#2ebd85" stroke-width="2"/><polyline points="8,70 26,70 40,64 58,58 72,50 90,42 104,36" fill="none" stroke="#ff8799" stroke-width="1.5" stroke-dasharray="4 2"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">the stop climbs behind price and never comes back down</text></svg>`,
    shield: `<svg viewBox="0 0 120 80"><path d="M60 8 L92 20 V40 C92 58 60 70 60 70 C60 70 28 58 28 40 V20 Z" fill="none" stroke="#00e5ff" stroke-width="2"/><path d="M46 40 L56 50 L76 30" fill="none" stroke="#2ebd85" stroke-width="3"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">four gates, limits set beforehand, a kill switch</text></svg>`,
    brain: `<svg viewBox="0 0 120 80"><g fill="none" stroke="#8b6cff" stroke-width="1.5"><circle cx="24" cy="20" r="6"/><circle cx="24" cy="40" r="6"/><circle cx="24" cy="60" r="6"/><circle cx="60" cy="30" r="6"/><circle cx="60" cy="50" r="6"/><circle cx="96" cy="40" r="7"/><line x1="30" y1="20" x2="54" y2="30"/><line x1="30" y1="40" x2="54" y2="30"/><line x1="30" y1="40" x2="54" y2="50"/><line x1="30" y1="60" x2="54" y2="50"/><line x1="66" y1="30" x2="89" y2="40"/><line x1="66" y1="50" x2="89" y2="40"/></g><text x="96" y="43" font-size="8" text-anchor="middle" fill="#e8edf7">P</text><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">features in · probability of winning out</text></svg>`,
    split: `<svg viewBox="0 0 120 80"><rect x="8" y="20" width="50" height="34" rx="3" fill="rgba(46,189,133,.25)" stroke="#2ebd85"/><rect x="62" y="20" width="50" height="34" rx="3" fill="rgba(46,189,133,.25)" stroke="#2ebd85"/><text x="33" y="41" font-size="9" text-anchor="middle" fill="#e8edf7">1st half</text><text x="87" y="41" font-size="9" text-anchor="middle" fill="#e8edf7">2nd half</text><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">must earn in BOTH halves, or it is not kept</text></svg>`,
    scan: `<svg viewBox="0 0 120 80"><g fill="none" stroke="#00e5ff" stroke-width="1.5"><circle cx="60" cy="38" r="26"/><circle cx="60" cy="38" r="15"/><circle cx="60" cy="38" r="5"/><line x1="60" y1="38" x2="84" y2="18"/></g><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">every instrument scored · the best rises to the top</text></svg>`,
    open: `<svg viewBox="0 0 120 80"><rect x="10" y="14" width="100" height="14" rx="3" fill="rgba(0,229,255,.12)" stroke="#00e5ff"/><rect x="10" y="33" width="100" height="14" rx="3" fill="rgba(0,229,255,.12)" stroke="#00e5ff"/><rect x="10" y="52" width="100" height="14" rx="3" fill="rgba(0,229,255,.12)" stroke="#00e5ff"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">one card per live position · stop · target · trail · close</text></svg>`,
    manual: `<svg viewBox="0 0 120 80"><rect x="14" y="12" width="40" height="22" rx="4" fill="#2ebd85"/><text x="34" y="27" font-size="10" text-anchor="middle" fill="#04110b" font-weight="700">BUY</text><rect x="66" y="12" width="40" height="22" rx="4" fill="#f6465d"/><text x="86" y="27" font-size="10" text-anchor="middle" fill="#fff" font-weight="700">SELL</text><rect x="14" y="42" width="92" height="10" rx="3" fill="#4a5a7c"/><rect x="14" y="42" width="46" height="10" rx="3" fill="#00e5ff"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">you decide the side, the size and the levels</text></svg>`,
    clock: `<svg viewBox="0 0 120 80"><circle cx="60" cy="38" r="26" fill="none" stroke="#ffd166" stroke-width="2"/><line x1="60" y1="38" x2="60" y2="20" stroke="#ffd166" stroke-width="2"/><line x1="60" y1="38" x2="72" y2="44" stroke="#ffd166" stroke-width="2"/><text x="60" y="78" font-size="8" text-anchor="middle" fill="currentColor">only inside the New York opening minutes</text></svg>`,
    news: `<svg viewBox="0 0 120 80"><rect x="18" y="12" width="84" height="52" rx="4" fill="none" stroke="#8fa3c8" stroke-width="1.5"/><rect x="26" y="20" width="24" height="18" fill="#4a5a7c"/><line x1="56" y1="24" x2="94" y2="24" stroke="#8fa3c8"/><line x1="56" y1="32" x2="94" y2="32" stroke="#8fa3c8"/><line x1="26" y1="46" x2="94" y2="46" stroke="#8fa3c8"/><line x1="26" y1="54" x2="80" y2="54" stroke="#8fa3c8"/></svg>`,
  },

  /* ---------- the controls every trading bot shares ---------- */
  SHARED: [
    ['⏱ Timeframe', 'The candle size the bot reads — 1m, 5m, 15m, 1h and so on.', 'A pattern on a 15-minute chart means something different from the same pattern on a 1-minute chart. Each bot was built and measured on a particular timeframe; changing it makes it a different bot.'],
    ['🔁 Auto', 'Lets the bot follow the timeframe the chart is showing instead of its own.', 'Handy when you want to see the bot react to whatever you are looking at. Off means it stays on its own timeframe no matter what the chart does.'],
    ['🎯 Min score', 'Every setup is scored 0–100. Below this number the bot waits.', 'The single most important dial. Higher = fewer trades but better ones; lower = more trades, more noise. The defaults are where each bot was measured.'],
    ['📦 Max open', 'How many positions this bot may hold at once.', 'A cap on how much of the account one bot can commit. It also protects you from a bot that fires on ten correlated instruments in the same minute.'],
    ['⏸ Pause', 'Stops NEW entries. Open positions keep their stops and targets and finish normally.', 'The safe way to switch a bot off — it never abandons a position that is already running.'],
    ['▶ Run now', 'Makes the bot look at every allowed instrument right now instead of waiting for its 30-second cycle, and writes down why it did or did not act on each one.', 'The fastest way to understand a bot: press it and read the reasons in the log below.'],
    ['🧪 Backtest', 'Replays the bot over past candles with spreads, slippage and fees, candle by candle, no peeking ahead.', 'Backtests do not predict the future — but a bot that loses in a backtest will not become profitable live. Use it to reject ideas, not to fall in love with them.'],
    ['🗑 Reset', 'Wipes this bot’s paper account back to 10,000 and clears its record.', 'Use it after you change settings, so the record reflects the bot as it is now, not a mix of old and new rules.'],
    ['🌍 Markets', 'Which instruments the bot may trade: a mode picker and, in manual mode, market groups and single instruments.', 'A bot measured on gold is not evidence for oil. Keep each one on the markets it was built for unless you have run a backtest that says otherwise.'],
  ],

  /* every trading bot also lives under these house rules */
  RULES: [
    ['💰 Risk per trade', 'Each bot risks 0.5% of its 10,000 paper account per trade (Max Assurance: 1%, up to 3% with strong agreement). The stop distance decides the size, not a lot number.'],
    ['🛑 Daily loss lock', 'Lose 2% in a day and the bot is locked until tomorrow. Nothing you do mid-tilt can beat this rule.'],
    ['📉 Spread checks', 'A trade is refused when the spread is too wide for the price, or would eat more than a quarter of the stop distance.'],
    ['⏳ Live-only prices', 'A quote older than three minutes is not a price — the bot refuses to act on it. Nothing here ever trades on delayed data.'],
    ['🧠 Master Brain', 'Every entry passes through the Master Brain last. Once it has learned enough it can veto a trade or make it smaller — it can never make one bigger or invent one.'],
    ['🚫 Prohibited pairs', 'The Instrument permissions page blocks pairs that have a bad record across the bots. A blocked pair is blocked for every bot until you allow it.'],
  ],

  /* ---------- the guides ---------- */
  G: {
    dash: { icon: '📊', art: 'open', tagline: 'Every number every bot has produced, on one page.',
      tags: ['Overview', 'Paper results', 'Read only'],
      steps: [
        ['🔍', 'Filter', 'Pick a bot, an instrument, a timeframe, a side or a day — every table below narrows to match.'],
        ['💵', 'The money', 'Equity, net result, fees, best and worst trade, win rate, profit factor — the summary numbers.'],
        ['🤖', 'Per bot', 'One row per bot: trades, wins, losses, net, average R. Click a row to filter everything to that bot.'],
        ['📈', 'Per instrument', 'What each pair has earned or lost, with a fold-out history of every trade on it.'],
        ['📅', 'Day by day', 'The record per calendar day with a totals row at the bottom.'],
        ['📜', 'The log', 'Every position with the exact time it opened and closed, why it opened and how it ended.'],
      ],
      settings: [
        ['Fold / unfold ▾', 'Every section collapses. Your choice is remembered.', 'So you can keep the two sections you care about open and the rest out of the way.'],
        ['▲ ▼ on a section', 'Moves the section up or down the page.', 'Put what you read first at the top.'],
        ['Column headings', 'Click to sort; click again to flip.', 'Find the worst instrument or the best day in one click.'],
      ],
      use: ['Start here every morning: which bot made money yesterday, which pair keeps losing.', 'Click a bot row, then read its per-instrument table — that is where you find a pair worth prohibiting.', 'Everything is paper. The real account has its own page (Live connection & safety).'],
      honest: 'Numbers here are simulated: real spreads and slippage from MetaTrader, but no real fills. Treat them as evidence, not as profit.' },

    analysis: { icon: '⚖️', art: 'votes', tagline: 'Did buying or selling earn more — and on what?',
      tags: ['Overview', 'Read only'],
      steps: [
        ['🟢', 'Buys', 'All completed long trades: count, wins, losses, net result and the instruments behind them.'],
        ['🔴', 'Sells', 'The same for shorts.'],
        ['🔎', 'Compare', 'If one side loses everywhere, a bot can be set to one direction only (Direction in the Manual bot’s automatic entries, or a one-sided bot such as the Engulfing bots).'],
      ],
      settings: [['Filters', 'Same as the Dashboard: bot, instrument, timeframe, day.', 'Ask the question narrowly: "does selling gold work for the Pattern bot?"']],
      use: ['Look once a week. Markets in a long trend punish one side for months.'],
      honest: 'A side can look bad simply because the market trended the other way during the sample. Check the period before drawing a rule from it.' },

    brain: { icon: '🧠', art: 'brain', tagline: 'A real trained model that learns from every finished trade — and can only ever say NO.',
      tags: ['Learning', 'Gate on every bot', 'Cannot open trades'],
      steps: [
        ['📝', 'Every trade is a lesson', 'When any bot closes a paper trade (or a backtest finishes), the setup is turned into ~40 numbers: score, trend, ADX, RSI, volatility, spread, hour, session, news mood, Fear & Greed… and labelled won or lost.'],
        ['🏋️', 'Training', 'A classifier is trained on the older 70% of examples and tested on the newest 30% it has never seen. If it is no better than a coin toss out of sample, it stays silent.'],
        ['🚦', 'The gate', 'Every new entry from every bot passes through it last. It estimates the chance of winning and the expected result in R; negative expectancy = veto, marginal = smaller size.'],
        ['🔒', 'It can only shrink', 'It never invents an entry and never raises risk. A brain that can only say no cannot run away with the account if it learns something wrong.'],
      ],
      settings: [
        ['Train now', 'Retrains on every example it holds.', 'Do it after a big batch of new trades or backtests.'],
        ['Learn from history', 'Turns every bot’s closed trades into examples in one go.', 'Fastest way to give it something to learn from on a new install.'],
        ['Research new strategies', 'Lets the Strategy Lab invent and test variants; winners become real bots with their own page.', 'Discovery, with the same split-test honesty as Market Fit.'],
        ['Re-check lab bots', 'Re-measures bots the Lab created earlier and retires the ones that stopped working.', 'A lab bot that only fitted its own past is removed before it costs anything.'],
        ['Forget everything', 'Wipes the model and the examples.', 'Use after a major change to the bots — old lessons about old rules only mislead.'],
      ],
      use: ['You do not need to touch it. It learns on its own from paper trading.', 'Read its status line: "abstaining" means it has not earned the right to speak yet — that is correct behaviour, not a fault.', 'Look at the top weights: they tell you which conditions have actually mattered in your trades.'],
      honest: 'It needs at least 60 examples and 25 validation cases before it gates anything. Until then the bots run exactly as before.' },

    fit: { icon: '🧪', art: 'split', tagline: 'Which strategy works on which market — measured, not assumed.',
      tags: ['Research', 'Split test', 'Read only'],
      steps: [
        ['🌐', 'Every combination', 'Runs every strategy against a studied set of crypto, metals, forex, indices and energy, on several timeframes.'],
        ['✂️', 'Split the history', 'Cuts the history in half. A strategy is only kept if it earned in BOTH halves. Fitting one stretch of history is easy; surviving the next one is the test.'],
        ['🏆', 'The survivors', 'Almost nothing survives. That is the point — and the survivors become the "measured" bots (Crypto Pullback is one).'],
      ],
      settings: [
        ['Sweep', 'Runs every combination once and ranks them.', 'A first look at what might work.'],
        ['Split test', 'The two-halves test on the sweep’s candidates.', 'The one that matters.'],
        ['Apply', 'Restricts each bot to the markets where it passed.', 'Turns the study into permissions.'],
      ],
      use: ['Run it after adding a new strategy or a new market group.', 'Re-run every few weeks; markets drift.'],
      honest: 'Passing a split test is evidence, not a guarantee. A strategy can pass and still lose next month — but one that fails will almost certainly lose.' },

    live: { icon: '🛡️', art: 'shield', tagline: 'The only page that can move real money — and the hardest to switch on.',
      tags: ['Real money', 'Four gates', 'Kill switch'],
      steps: [
        ['🔌', 'Gate 1 · Connect', 'The MetaTrader bridge must be running and the account read back (balance, leverage, symbols).'],
        ['📏', 'Gate 2 · Limits', 'You set them beforehand: max risk per trade, max daily loss, max open positions, allowed instruments. The bots cannot change them.'],
        ['🤖', 'Gate 3 · Arm a bot', 'Only a bot that meets 4 of 6 readiness conditions (a real paper record, enough trades, positive expectancy…) can be armed — and arming puts it in SHADOW: every order worked out and written down, nothing sent.'],
        ['🔴', 'Gate 4 · Go live', 'A separate, typed confirmation per bot. Even then every order still passes the limits and the kill switch.'],
        ['🛑', 'Kill switch', 'One button: no new orders from anything, instantly.'],
      ],
      settings: [
        ['Save limits', 'Stores the ceilings every real order is checked against.', 'Set them once, calmly, before anything is armed.'],
        ['Arm in shadow', 'Starts the bot writing real-account decisions without sending them.', 'Read the shadow log for days before going further.'],
        ['Go live / Back to shadow', 'Switches a bot between sending and only logging.', 'Reversible at any time.'],
        ['Disarm', 'Takes the bot off the real account entirely.', ''],
      ],
      use: ['Never skip shadow. Compare its log with the paper trades: if they differ, something is wrong with the setup, not the market.', 'Your real account is small; the limits should be smaller than feels comfortable.'],
      honest: 'A backtest and a paper record do not predict future results. Real fills, spreads, gaps and slippage differ from the simulation. These limits reduce risk; they do not remove it.' },

    open: { icon: '📋', art: 'open', tagline: 'Every live position, across every bot, with full control over each one.',
      tags: ['Positions', 'Control'],
      steps: [
        ['🃏', 'One card per position', 'Bot, instrument, side, size, entry, live price and P/L, updated every second.'],
        ['🎚', 'Stop & target', 'Type a price, or use the % ladder (0.30 / 0.50 / 1.00 %). The calculator shows the money at stake at each level before you confirm.'],
        ['🪜', 'Trailing stop', 'Start (how far in profit before it engages) and gap (how far behind price it follows). Per position — it overrides the bot’s own trail.'],
        ['✂️', 'Take some off', 'Close 25% or half; the rest keeps running.'],
        ['⚡', 'Close at market', 'Out now at the live price, with the P/L shown on the button.'],
      ],
      settings: [
        ['Break even', 'Moves the stop to the entry price.', 'The classic "free trade" — right after the first target is reached.'],
        ['Marked ✎', 'A trade whose levels you changed by hand is marked, so a bot’s measured record never silently includes trades it did not run itself.', 'Keeps the statistics honest.'],
      ],
      use: ['Check it when the market is moving fast — it is the one screen that shows everything at once.', 'Trailing stops are the friend of a trend and the enemy of a range: use them when price is running, not when it is chopping.'],
      honest: 'Paper positions only. The real account’s positions are on the Live page, read back from MetaTrader.' },

    report: { icon: '📑', art: 'split', tagline: 'Every bot side by side — and how close each is to being worth real money.',
      tags: ['Overview', 'PDF export'],
      steps: [
        ['🏁', 'Rank', 'Bots are ordered by average R weighted by how much evidence there is — a lucky three-trade run cannot outrank a hundred-trade one.'],
        ['✅', 'Live readiness', 'Six conditions per bot (enough trades, positive expectancy, drawdown within limits, recent activity…). Four of six are needed before the Live page will even list it.'],
        ['📄', 'Export', 'A PDF with the same tables.'],
      ],
      settings: [['Export PDF', 'Saves the report.', 'For a record before changing anything.']],
      use: ['This is where you decide which bot deserves shadow mode — not the dashboard’s biggest number.'],
      honest: 'Being top of the list means the strongest record so far on paper — nothing more.' },

    scanner: { icon: '📡', art: 'scan', tagline: 'Ranks the whole broker universe with the Regime-Aligned Pullback engine. It never opens a trade.',
      tags: ['Scanner', 'Read only'],
      steps: [
        ['🌐', 'Every instrument', 'Every pair the bridge can price is scored on the chosen timeframe.'],
        ['📈', 'Regime-Aligned Pullback', 'Trend (EMA20 above/below EMA50 and both sloping), a pullback toward the fast average, a fresh push out of it, momentum, candle direction, volume and calm volatility — seven weighted checks, 100 points.'],
        ['🥇', 'Ranked', 'Best first, with the reasons for and against each.'],
      ],
      settings: [['Min score', 'Only instruments at or above it are listed as setups.', '92 is deliberately strict — the level that passed the split test on crypto.'], ['Scan now', 'Refreshes the board immediately.', '']],
      use: ['Use it to find where the action is, then look at that chart yourself.', 'The Scanner Bot is this same engine with hands.'],
      honest: 'A high score is a well-formed setup, not a prediction.' },

    manual: { icon: '🎛️', art: 'manual', tagline: 'You decide the instrument, side, size, stop and target. ASTRA manages the position like a bot would.',
      tags: ['Manual', 'Paper', 'Automatic entries'],
      steps: [
        ['🔎', 'Instrument', 'Searchable picker. The live price is shown large; no live price = no trade.'],
        ['🟢🔴', 'BUY / SELL', 'Side by side. The stop/target ladders flip with the side.'],
        ['💶', 'Size', 'Three ways: an exact amount (as position value or as margin), lots, or leave it empty and the risk rule sizes it from the stop. The fund bar (10…100%) shows how much of the free equity you are using.'],
        ['🎯', 'Stop & target', 'Type a price, or tap 0.30 / 0.50 / 1.00 %. The calculator shows the money at the stop, at the target, the risk/reward and what stays in your equity — before you press anything.'],
        ['🤖', 'Automatic entries', 'Let a bot’s or a candle signal open trades into this account: pick the signal source, scope (this pair or all), direction, exits, size per entry.'],
      ],
      settings: [
        ['Order type', 'Market, or a Limit / Stop entry that waits for a price.', 'Buy lower with a limit, buy a breakout with a stop entry.'],
        ['as position / as margin', 'Whether the amount you type is the size of the position or the money taken from equity.', 'On 1:2000 leverage the two are very different numbers; the calculator shows both.'],
        ['Max open / per instrument', 'This account allows 20 positions, 10 per instrument.', 'Higher than the bots because you are the one deciding.'],
        ['Manual rules', 'Risk per trade, total position value, spread cap (1.5% — wider than the bots’, because platinum and the like cannot be traded at 0.10%).', 'Your own house rules for this account.'],
      ],
      use: ['Everything you open here appears on Open Trades with full control.', 'The fee figures use the live spread and the broker’s commission table — what you see at the calculator is what the paper fill costs.'],
      honest: 'Paper only. The real-money ticket is a separate page (LIVE trading bot) and stays locked until you connect, arm and confirm.' },

    liveManual: { icon: '🔴', art: 'shield', tagline: 'Your manual ticket for real JustMarkets orders.',
      tags: ['Real money', 'Locked by default'],
      steps: [
        ['🔒', 'Locked until', 'The bridge is connected, the account is armed and real orders are explicitly enabled — three separate steps.'],
        ['🎫', 'The ticket', 'Same layout as the paper ticket, with the same calculator, but every number is the real account’s.'],
        ['🧾', 'Read back', 'Fills, positions and closes come straight back from MetaTrader, not from the simulation.'],
      ],
      settings: [['Enable real orders', 'The final switch for this ticket.', 'Turn it off again when you are done.']],
      use: ['Place one tiny order first and check it in MetaTrader before trusting anything else.'],
      honest: 'This page can lose real money. The limits on the Live page apply here too.' },

    jdub: { icon: '🗽', art: 'clock', tagline: 'New York opening range: 09:30–09:45, then trade the break — one setup per instrument per session.',
      tags: ['Session', '1m entries', 'Indices & US-hours markets'],
      steps: [
        ['🕤', 'The first 15 minutes', 'From 09:30 New York it records the high and low of the opening range.'],
        ['🚪', 'The break', 'A 1-minute close beyond the range, confirmed by the completed 5-minute candle in the same direction.'],
        ['1️⃣', 'Once per session', 'One setup per instrument per day. Missed it? It waits for tomorrow.'],
      ],
      settings: [['Timeframe', 'Fixed to 1m for entries; 5m is read for confirmation.', 'The setup only exists on the fast chart.']],
      use: ['Only meaningful on instruments that actually open at 09:30 New York — US indices above all.', 'Its chart indicator only scores inside the 09:30–11:00 window.'],
      honest: 'Session strategies live or die on execution speed. Paper fills at the candle open are kinder than real ones.' },

    rigor: { icon: '🚧', art: 'pullback', tagline: 'Acts on scanner evidence: BUY opens a long, SELL closes it, WAIT does nothing. Never shorts.',
      tags: ['Trend', 'Long only'],
      steps: [
        ['📡', 'Reads the scanner', 'Uses the Regime-Aligned Pullback score for the instrument.'],
        ['🟢', 'BUY', 'Score at or above the minimum, in the up direction → opens a long.'],
        ['🔻', 'SELL', 'A sell reading closes an open long. It never opens a short — a sell here is an exit, not an entry.'],
      ],
      settings: [['Min score', 'Default 62.', 'Lower than the scanner’s 92 because it manages the exit itself.']],
      use: ['A calm, one-direction bot for markets that trend up more than down.'],
      honest: 'Long-only means a falling market simply keeps it waiting — that is by design.' },

    candle: { icon: '🕯️', art: 'engulf', tagline: 'Classic candle patterns, filtered by trend, volatility, spread and price freshness.',
      tags: ['Patterns', 'Both directions'],
      steps: [
        ['🔍', 'Find the pattern', 'Doji, bullish/bearish engulfing, morning/evening star, three soldiers/crows on the last closed candle.'],
        ['🧭', 'Filter', 'Trend direction from EMAs, ATR must be sane, spread must be acceptable, the quote must be fresh.'],
        ['📐', 'Levels', 'Stop beyond the pattern; target a fixed multiple of the risk.'],
      ],
      settings: [['Min score', 'Default 60.', 'Pattern quality plus how well the filters line up.']],
      use: ['The chart’s Candlestick Patterns labels are the same detector — switch them on to see what it sees.'],
      honest: 'Measured over ~2,800 occurrences, most classic patterns barely move the needle. Pattern Pro is the version built from those measurements; this one is the textbook version.' },

    bullEng: { icon: '🟢', art: 'engulf', tagline: 'Confirmed Bullish Engulfing only. Buys only.',
      tags: ['Pattern', 'Long only'],
      steps: [['🕯️', 'The pattern', 'A green candle whose body completely covers the previous red body, after a dip.'], ['✅', 'Confirmation', 'Same trend / ATR / spread / freshness filters as the Candlestick Bot.'], ['📐', 'Exit', 'Fixed target at 1.35× the risk.']],
      settings: [['Min score', 'Default 60.', '']],
      use: ['Built so one pattern can be measured on its own.'],
      honest: 'Measured forward edge of bullish engulfing: about +0.05 ATR — close to nothing. It exists as a control, not as a money-maker.' },

    bearEng: { icon: '🔴', art: 'engulf', tagline: 'Confirmed Bearish Engulfing only. Sells only.',
      tags: ['Pattern', 'Short only'],
      steps: [['🕯️', 'The pattern', 'A red candle whose body completely covers the previous green body, after a rise.'], ['✅', 'Confirmation', 'Same filters as the Candlestick Bot.'], ['📐', 'Exit', 'Fixed target at 1.35× the risk.']],
      settings: [['Min score', 'Default 60.', '']],
      use: ['The mirror of the Bullish Engulfing Bot.'],
      honest: 'Measured edge about +0.04 ATR. A control bot.' },

    maMacd: { icon: '🎀', art: 'ribbon', tagline: 'EMA 20/50/100/200 ribbon with MACD confirmed on this timeframe AND a higher one.',
      tags: ['Trend', 'Two timeframes', 'Scales out'],
      steps: [
        ['🎀', 'The ribbon', 'All four averages stacked in order = a trend. Price above them all for a buy, below for a sell.'],
        ['📶', 'MACD twice', 'The MACD histogram must agree on the 5-minute chart and on the 15-minute chart.'],
        ['✂️', 'The exit', 'Half off at 1R, stop moved to breakeven, the rest at 1.5R.'],
      ],
      settings: [['Higher timeframe', 'Default 15m for 5m entries.', 'Two agreeing clocks are harder to fool than one.']],
      use: ['A trend bot: it will lose small amounts in a range and earn when a move runs.'],
      honest: 'Scaling out reduces the size of wins as well as losses; it was chosen for a smoother curve, not a higher one.' },

    fade: { icon: '🪃', art: 'band', tagline: 'The one bot that does NOT follow a trend: it fades a stretched move back to the average.',
      tags: ['Mean reversion', 'Ranging markets'],
      steps: [
        ['😴', 'Only when it is quiet', 'ADX must be under 22 — a ranging market. In a trend it refuses to trade at all.'],
        ['🎈', 'The stretch', 'Price pokes outside the Bollinger band (20, 2) and closes back inside, with RSI stretched.'],
        ['🎯', 'The target', 'The middle of the band — the average price comes back to.'],
      ],
      settings: [
        ['bbLen / bbDev', 'Bollinger period and width (20, 2).', 'The textbook band.'],
        ['adxMax', 'Refuse above this ADX (22).', 'The regime filter that makes it work.'],
        ['rsiLow', 'How stretched RSI must be (32 for buys; mirrored for sells).', 'Confirms the move is tired.'],
        ['stopPad', 'Stop this many ATR beyond the poke (0.4).', 'Room for one more wick.'],
        ['atrMax', 'Refuse when the candle range is over this many ATR (2).', 'A huge candle is news, not a stretch.'],
        ['minR', 'Refuse if the target pays less than this many R (0.8).', 'Not worth the spread otherwise.'],
        ['pierceBars', 'The poke must be within the last N bars (3).', 'Freshness.'],
      ],
      use: ['Earns where the trend bots get chopped up; loses the moment a range turns into a trend — the ADX rule is there to catch that early.'],
      honest: 'Measured on the pooled record it is one of the steadier engines, but a strong breakout through the band is its worst case.' },

    scanTrader: { icon: '🏹', art: 'scan', tagline: 'The Market Scanner with hands: scores everything, opens only the single best setup.',
      tags: ['Trend', 'Ranking', '1h'],
      steps: [['🌐', 'Score all', 'Every allowed instrument, best first.'], ['🥇', 'Take the best', 'Only the top setup, and only above the minimum score.'], ['🔁', 'Repeat', 'Each cycle it looks again; it does not queue the second-best.']],
      settings: [['threshold / Min score', '0.88 / 88.', 'Strict on purpose.'], ['scanDepth', 'How many instruments to consider (24).', 'Speed vs coverage.']],
      use: ['Give it the whole market; that is its point.'],
      honest: 'The best setup on the board is still just a setup.' },

    cryptoPullback: { icon: '₿', art: 'split', tagline: 'The only strategy/market/timeframe combination that passed the split test, exactly as measured.',
      tags: ['Measured', 'Crypto only', '1h'],
      steps: [['🧪', 'From Market Fit', 'Of 62 combinations, this one stayed profitable in both halves: +0.10R first half, +0.33R second.'], ['🔒', 'Nothing tuned', 'Threshold 0.92, min score 92, 1h, five crypto pairs — the exact configuration measured.'], ['📈', 'The engine', 'Regime-Aligned Pullback.']],
      settings: [['Everything', 'Deliberately fixed.', 'Change any number and the evidence no longer applies to what you are running.']],
      use: ['Expect very few trades. That is the price of being fussy.'],
      honest: 'Passing once is evidence, not a guarantee. It is re-checked when Market Fit is re-run.' },

    scalper: { icon: '⚡', art: 'votes', tagline: 'Small trades both ways, eight indicators voting. Ships PAUSED — measured, it lost.',
      tags: ['Scalping', 'Both directions', 'Paused by default'],
      steps: [
        ['🧮', 'Arithmetic first', 'The target must clear the spread and commission several times over (costMult 4) or the instrument is refused.'],
        ['🗳️', 'Eight votes', 'Micro-trend, the 50 average, stochastic, fast RSI, MACD momentum, position in the band, the day average, the candle. No single one can force a trade.'],
        ['🧭', 'ADX decides the mode', 'Trend running (ADX ≥ 20) → join the micro-trend. Flat → fade the edges.'],
        ['⏲️', 'Time limit', 'Out after 14 bars whatever happens.'],
      ],
      settings: [['tpAtr / slAtr', 'Target and stop as a fraction of ATR (0.55 each).', 'Small, symmetric.'], ['costMult', 'Target must be this many times the round-trip cost (4).', 'The gate that refuses expensive instruments.'], ['atrMinPct / atrMaxPct', 'Volatility window it is willing to work in.', 'Too calm = nothing to take; too wild = stops get hit.']],
      use: ['Watch it, do not arm it.'],
      honest: 'Measured over 1,192 trades it lost on every instrument: the average win came to 38 against an average loss of 64, so a nominal 1:1 needed a 63% win rate and got 59%. Execution cost eats scalping.' },

    triple: { icon: '🔺', art: 'level', tagline: 'Three kinds of evidence must agree: a measured pattern, ON a real level, with the Confluence reading on top.',
      tags: ['Pattern + level', 'Both directions', '15m'],
      steps: [
        ['🕯️', '1 · A pattern with a measured edge', 'Only patterns that measured a real forward move: hammer, morning star, three crows, evening star… Three Soldiers is refused (it measured negative).'],
        ['📏', '2 · On a level', 'The pattern must form on a support (for a buy) or resistance (for a sell) the market has already turned at — at least twice.'],
        ['🧭', '3 · The Confluence reading', 'EMA20/EMA100 trend, ADX, RSI zone and tick activity, scored on top. 60 of 100 needed.'],
        ['🛑', 'The stop', 'Just beyond the level. The trade is wrong exactly when the level breaks — a stop that means something.'],
        ['🎯', 'The target', 'The next level the other way if it pays at least 1.2R, otherwise 2× the risk.'],
      ],
      settings: [
        ['nearAtr', 'How close to the level counts as "on" it (0.6 ATR).', 'Tighter = fewer, cleaner setups.'],
        ['padAtr', 'Stop this far beyond the level (0.35 ATR).', 'Room for a wick without giving up the logic.'],
        ['rr / minR', 'Target multiple (2) and the least the next level must pay (1.2R).', 'Reward has to justify the risk.'],
        ['minEdge', 'Minimum measured pattern edge (0.05 ATR).', 'Filters out patterns that measured as noise.'],
        ['minTouch', 'How many times the level must have held (2).', 'One touch is a coincidence.'],
        ['wing / lookback / tolAtr', 'How swing points are found and merged into levels.', 'Same engine as the Support & Resistance chart indicator.'],
      ],
      use: ['Switch on the "Triple Confirmation · BUY / SELL" indicator: an arrow on every candle it would have acted on, plus the stop and target of its latest call.', 'The Support & Resistance indicator shows the levels it is watching.'],
      honest: 'Pooled paper record so far: about +0.01R over 37 trades at 15m — not yet a proven edge. Max Assurance uses it as one vote among five, which is where it has done better.' },

    conviction: { icon: '💎', art: 'votes', tagline: 'The risky one — risk done the only way it pays: concentrate, don’t multiply.',
      tags: ['Conviction sizing', 'Five engines + 1h trend', 'Up to 3% risk'],
      steps: [
        ['🗳️', 'Five engines vote', 'Triple Confirmation, Pattern Pro, Regime Pullback, Mean Reversion and ASTRA Confluence each look at the same closed candle with their own eyes. A full vote = the engine would have traded; a half vote = it is close.'],
        ['🧭', 'The 1-hour trend', 'Not a vote but a gate: against it → refused; with it → one more vote.'],
        ['🚫', 'Veto', 'Any engine that would trade the OTHER way refuses the trade, whatever the count.'],
        ['3️⃣', 'Three votes, two fired', 'At least 3 votes, of which at least 2 engines actually fired. Fewer → wait.'],
        ['💪', 'Conviction = size', 'Base risk 1%. Each vote above the minimum adds half again; a score over 90 adds half more; capped at 3× and — separately, by the engine — at the Risk ceiling.'],
        ['📐', 'Levels', 'From Triple when it fired (a stop beyond a real level), otherwise from the strongest engine.'],
      ],
      settings: [
        ['Votes needed', 'Total votes required (3). The 1h trend counts as one when it agrees.', 'Raise it for fewer, stronger trades.'],
        ['Max size ×', 'How far the size may grow with extra votes (3).', 'The upper end of "concentrate".'],
        ['Base risk %', 'Risk at the minimum vote count (1%).', 'Twice the other bots.'],
        ['Risk ceiling %', 'The most it may ever risk on one trade (3%). Enforced by the engine, not the strategy — no vote count can pass it.', 'The one knob that makes this bot more dangerous. Lower it if 3% keeps you awake.'],
        ['Position value budget', '300% of equity (the other bots: 100%).', 'At 100% a gold or bitcoin position is capped by its VALUE long before it reaches even the base risk, so the votes would change nothing.'],
        ['Daily loss lock', '6% instead of 2%.', 'Or the second trade of a day would be refused by the shared rule.'],
      ],
      use: ['Its indicator "Max Assurance · BUY / SELL" marks every candle it would have called a very good trade, with the size multiplier on the label (e.g. ×1.75).', 'The trade record shows the multiplier actually USED — the position-value budget or the lot step can leave a boosted trade smaller than its allowance, and the record never claims a size it did not have.'],
      honest: 'Measured over 8 instruments, ~3 weeks of 15m: +0.18R over 58 trades, both halves positive (+0.58R / +0.10R), profit factor 1.6. Trades with more votes did clearly better (+0.38R) than minimum-vote ones (−0.08R). A promising start on a SMALL sample — run it on paper for weeks before thinking about arming it.' },

    patPro: { icon: '🎯', art: 'hammer', tagline: 'The same pattern detector the chart draws with — weighted by MEASURED edge, not reputation.',
      tags: ['Patterns', 'Measured', 'Both directions'],
      steps: [
        ['📏', 'Measured, not believed', 'Over ~2,800 occurrences: Hammer +0.38 ATR forward, Morning star +0.27, Three crows +0.23, Evening star +0.12 … engulfing ≈ +0.05, Three Soldiers −0.41 (refused).'],
        ['⚖️', 'Score', 'The pattern’s edge, its size against ATR, and the context.'],
        ['📐', 'Levels', 'Stop clears the whole formation by stopPad ATR; target rr × the risk.'],
      ],
      settings: [['minEdge', 'Least measured edge to trade (0.05).', 'Raise it to trade only the strong patterns.'], ['stopPad', 'ATR beyond the formation (0.25).', ''], ['rr', 'Target multiple (1.5).', ''], ['atrMax', 'Refuse giant candles (2.5 ATR).', 'News candles are not patterns.']],
      use: ['The five market-specific Pattern bots are this engine tuned per market.'],
      honest: 'Win rates near 50% are expected: the edge is in how far the move goes, not how often.' },

    patGold: { icon: '🥇', art: 'hammer', tagline: 'Pattern Pro tuned for gold and silver.', tags: ['Patterns', 'Metals only', '15m'],
      steps: [['📐', 'Why these numbers', 'Gold’s 15m ATR is about 0.23%, so a 1.6R target sits where the metal actually travels; the stop clears the formation by a quarter ATR.']],
      settings: [['rr 1.6 · stopPad 0.25 · atrMax 2.0', 'The metal-sized version of Pattern Pro.', 'Instruments fixed to XAUUSD and XAGUSD.']],
      use: ['Compare it with Pattern Pro on the same pairs in the Dashboard.'], honest: 'Tuned by measured volatility, not by results — the record decides.' },
    patCrypto: { icon: '🪙', art: 'hammer', tagline: 'Pattern Pro on crypto at 1h — the timeframe that survived the split test.', tags: ['Patterns', 'Crypto only', '1h'],
      steps: [['📐', 'Why 1h', 'Crypto’s ATR runs near 0.4% on 15m; the slower chart and a wider 1.8R target stay outside the noise.']],
      settings: [['rr 1.8 · stopPad 0.3 · atrMax 3.0 · minEdge 0.08', 'Wider everything.', 'Crypto moves more.']], use: ['BTC and ETH on both JustMarkets and Binance.'], honest: 'Same caveat as Pattern Pro.' },
    patIndices: { icon: '📈', art: 'hammer', tagline: 'Pattern Pro on the US indices — the tightest ranges of the group.', tags: ['Patterns', 'Indices only', '15m'],
      steps: [['📐', 'Why these numbers', 'Index 15m ATR is only 0.12–0.17%; stops are padded a little more because index candles gap, and the target is kept modest.']],
      settings: [['rr 1.4 · stopPad 0.35 · atrMax 1.5', 'Small targets, slightly wider stops.', 'US100 and US30.']], use: ['Most active in US hours.'], honest: 'Same caveat as Pattern Pro.' },
    patEnergy: { icon: '🛢️', art: 'hammer', tagline: 'Pattern Pro on WTI and Brent — big moves, wide spread.', tags: ['Patterns', 'Oil only', '15m'],
      steps: [['📐', 'Why stricter', 'Oil moves most (0.4% ATR on 15m) but carries the widest spread (0.022%), so it demands a higher score and more reward before paying that spread.']],
      settings: [['minScore 62 · rr 2.0 · minEdge 0.08', 'Stricter and greedier.', '']], use: ['Watch the spread line in its log — refusals are usually the spread.'], honest: 'Same caveat as Pattern Pro.' },
    patFx: { icon: '💱', art: 'hammer', tagline: 'Pattern Pro on the majors at 1h — forex barely moves on 15m.', tags: ['Patterns', 'Forex only', '1h'],
      steps: [['📐', 'Why 1h', '0.05% ATR on 15m with the spread eating a tenth of it makes the fast chart unusable; this runs slower and stricter.']],
      settings: [['rr 1.6 · atrMax 1.0 · minEdge 0.08', 'Forex-sized.', 'EURUSD, GBPUSD, USDJPY.']], use: ['Few trades; that is normal here.'], honest: 'Same caveat as Pattern Pro.' },

    bullEngTrail: { icon: '🪜', art: 'trail', tagline: 'The Bullish Engulfing Bot with one change: the exit trails instead of a fixed target.',
      tags: ['Pattern', 'Trailing stop', 'Experiment'],
      steps: [['🕯️', 'Same entries', 'Identical signals to the Bullish Engulfing Bot.'], ['🪜', 'Different exit', 'Once the trade is 1R in front, the stop follows half an R behind the best price and never comes back down. Target far away (6R) so the trail does the work.']],
      settings: [['trail start / gap', '1R / 0.5R.', 'Start = how far in profit before it engages; gap = how far behind it follows.']],
      use: ['Built purely to compare the two exits head to head on the same signals — read both in the Dashboard.'],
      honest: 'In that head-to-head the trail beat the fixed target by about +0.18R per trade.' },

    patElite: { icon: '🏆', art: 'trail', tagline: 'The two findings put together: only the three patterns with real edge, and the trailing exit.',
      tags: ['Patterns', 'Trailing stop', 'Few trades'],
      steps: [['🎯', 'Only three patterns', 'Hammer (+0.38 ATR), Morning Star (+0.27), Three Crows (+0.23). Engulfing excluded (near zero), Three Soldiers excluded (negative).'], ['🪜', 'Trail the exit', 'The ratchet that beat a fixed target on identical signals.']],
      settings: [['minEdge 0.2', 'Only the strong three qualify.', ''], ['rr 6 · trail 1 / 0.5', 'Let it run.', '']],
      use: ['Expect FEW trades — these patterns are rare, and that is deliberate.'],
      honest: 'Rare patterns mean a small sample; give it months, not days.' },

    consensus: { icon: '🤝', art: 'votes', tagline: 'No opinion of its own: it asks four engines and trades when enough agree.',
      tags: ['Voting', 'Both directions', '15m + 1h'],
      steps: [['🗳️', 'Four engines', 'Regime Pullback, Candlestick, MA ribbon + MACD (with its higher timeframe) and Mean Reversion. A full vote = would have traded; half = close.'], ['⚖️', 'Weighing', 'Needs 2 votes with at least one engine actually fired; votes the other way count against.'], ['📐', 'Levels', 'From the strongest engine that fired — averaging incompatible stops makes a position nobody wanted.']],
      settings: [['minAgree', 'Votes needed (2).', ''], ['leanScore', 'Score at which a non-firing engine counts as half a vote (62).', '']],
      use: ['Max Assurance is the same idea with stronger engines, a veto, the 1h gate and conviction sizing.'],
      honest: 'Agreement between weak engines is still weak; it is the quality of the voters that matters.' },

    confluence: { icon: '🧭', art: 'pullback', tagline: 'One fixed 15-minute rule, run as a paper experiment. Nothing tunable, on purpose.',
      tags: ['Fixed rule', '15m', 'Paper experiment'],
      steps: [['✅', 'Five checks', 'Trend (EMA20 over EMA100 and rising), an EMA20 pullback reclaimed on the close, ADX14 ≥ 25, RSI in its momentum zone, tick activity above its 20-bar average.'], ['🕰️', 'Session', 'Only 11:00–17:45 broker time.'], ['📐', 'Levels', 'Stop 2 ATR, target 4 ATR. One trade per pair per day.']],
      settings: [['None', 'Deliberately.', 'A fixed rule can be measured; a tuned one can only be admired.']],
      use: ['The chart labels "ASTRA BUY / SELL" are this rule; the Confluence Scanner feeds it across the whole catalogue.'],
      honest: 'An experiment: its record is the answer, and it starts paused.' },

    confluenceScanner: { icon: '📡', art: 'scan', tagline: 'Runs the Confluence rule across the whole JustMarkets catalogue and hands setups to the Confluence bot.',
      tags: ['Scanner', '15m'],
      steps: [['🌐', 'Every pair', 'Exact pairs, buy/sell setups, and the reason each of the others is waiting.'], ['➡️', 'Hand-off', 'Eligible, ranked setups go to the Confluence paper bot.']],
      settings: [['Scanner on / paused', 'Whether it feeds the bot.', '']],
      use: ['Read the "why waiting" column — it is a tour of the rule.'], honest: 'Read-only until the bot takes a setup.' },

    permissions: { icon: '🚫', art: 'level', tagline: 'Which pairs may open new trades — across every bot.',
      tags: ['Settings', 'Applies to all bots'],
      steps: [['📉', 'Automatic', 'A pair with at least 5 trades that has lost more than half of what it won across the bots is blocked; a severe record is blocked harder.'], ['✋', 'Manual', 'Block or allow any pair yourself; a manual choice always wins over the automatic one.'], ['🔎', 'Search', 'Two columns, searchable, with the record behind each verdict.']],
      settings: [['Allow / Block / Auto', 'Per pair.', 'A blocked pair is blocked for every bot until you allow it.']],
      use: ['If a bot you trust refuses a pair you expected, look here first — the shared record may have blocked it.'],
      honest: 'The record is pooled across bots: a pair can be blocked because a weak bot lost on it. Allow it by hand if a strong bot deserves the chance.' },

    _lab: { icon: '🔬', art: 'split', tagline: 'A strategy the Lab invented and the split test kept.',
      tags: ['Lab bot', 'Measured'],
      steps: [['🧪', 'Where it came from', 'The Master Brain’s "Research new strategies" tried variants of an existing engine; this one earned in both halves of the history.'], ['🔁', 'Re-checked', '"Re-check lab bots" measures it again later and retires it if it stops working.']],
      settings: [['Its knobs', 'The variant’s measured values.', 'Change them and it is no longer the bot that passed.']],
      use: ['Treat it like any other bot: paper record first.'], honest: 'A lab bot can fit its own past. Time is the only real test.' },
  },

  /* ---------- rendering ---------- */
  guideFor(bot){
    const g = this.G[bot.id] || (bot.lab || /^lab/.test(bot.id) ? this.G._lab : null);
    return g || { icon: '🤖', tagline: bot.blurb || '', tags: [], steps: [], settings: [], use: [], honest: '' };
  },
  isTrading(bot){ return typeof Bots !== 'undefined' && !Bots.isPage(bot) && !bot.manual && !bot.liveManual && bot.id !== 'permissions'; },

  html(bot){
    const g = this.guideFor(bot), name = typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(bot) : bot.name;
    const d = bot.defaults || {};
    const facts = [];
    if (this.isTrading(bot) || bot.manual){
      if (d.tf) facts.push('⏱ ' + d.tf + (d.tfAuto ? ' (auto)' : ''));
      if (d.higherTf) facts.push('🔭 confirms on ' + d.higherTf);
      if (d.minScore) facts.push('🎯 min score ' + d.minScore);
      if (d.maxOpen) facts.push('📦 max open ' + d.maxOpen);
      if (d.instruments) facts.push('🌍 ' + d.instruments.map(baseAsset).join(', '));
      if (d.paused) facts.push('⏸ starts paused');
    }
    const row = (cells) => `<tr>${cells.map((c, i) => `<td class="${i === 0 ? 'k' : ''}">${c}</td>`).join('')}</tr>`;
    /* the sketch's caption is drawn as text under it, where it can wrap */
    let art = '';
    if (g.art && this.ART[g.art]){
      const raw = this.ART[g.art];
      const cap = (raw.match(/<text x="60" y="78"[^>]*>([^<]*)<\/text>/) || [])[1] || '';
      art = `<div class="bgArt">${raw.replace(/<text x="60" y="78"[^>]*>[^<]*<\/text>/, '').replace('viewBox="0 0 120 80"', 'viewBox="0 0 120 72"')}<small>${esc(cap)}</small></div>`;
    }
    return `
      <div class="bgHero">
        <div class="bgIcon">${g.icon}</div>
        <div class="bgTitle"><b>${esc(name)}</b><p>${esc(g.tagline)}</p>
          <div class="bgTags">${(g.tags || []).map(t => `<span>${esc(t)}</span>`).join('')}</div>
          ${facts.length ? `<div class="bgFacts">${facts.map(f => `<span>${esc(f)}</span>`).join('')}</div>` : ''}
        </div>
        ${art}
      </div>
      ${g.steps && g.steps.length ? `<h4 class="bgH">How it thinks</h4>
      <ol class="bgSteps">${g.steps.map(([ic, t, x]) => `<li><i>${ic}</i><div><b>${esc(t)}</b><span>${esc(x)}</span></div></li>`).join('')}</ol>` : ''}
      ${g.settings && g.settings.length ? `<h4 class="bgH">Its own settings</h4>
      <table class="bgTable"><thead><tr><th>Setting</th><th>What it does</th><th>Why it is there</th></tr></thead><tbody>
        ${g.settings.map(s => row(s.map(esc))).join('')}</tbody></table>` : ''}
      ${this.isTrading(bot) ? `<h4 class="bgH">Controls every bot has</h4>
      <table class="bgTable"><thead><tr><th>Control</th><th>What it does</th><th>Why it is there</th></tr></thead><tbody>
        ${this.SHARED.map(s => row(s.map(esc))).join('')}</tbody></table>
      <h4 class="bgH">House rules it lives under</h4>
      <div class="bgRules">${this.RULES.map(([t, x]) => `<div><b>${esc(t)}</b><span>${esc(x)}</span></div>`).join('')}</div>` : ''}
      ${g.use && g.use.length ? `<h4 class="bgH">How to use it</h4><ul class="bgUse">${g.use.map(u => `<li>${esc(u)}</li>`).join('')}</ul>` : ''}
      ${g.honest ? `<div class="bgHonest"><b>⚠️ The honest part</b><span>${esc(g.honest)}</span></div>` : ''}
      ${this.isTrading(bot) ? `<div class="bgSee"><b>Where to see it</b><span>Its chart indicator under the ƒx → Bots tab · its row in the Dashboard and Performance Report · its positions on Open Trades · its reasons in the log on its own page after “Run now”.</span></div>` : ''}`;
  },

  open(id){
    const bot = BOT_BY_ID[id] || (id === 'permissions' ? { id, name: 'Instrument permissions', defaults: {} } : null);
    if (!bot) return;
    let m = document.getElementById('botGuideModal');
    if (!m){
      document.body.insertAdjacentHTML('beforeend', `<div class="modal" id="botGuideModal"><div class="mBox bgBox">
        <div class="mHead"><span id="botGuideTitle">GUIDE</span> <span>HOW IT WORKS</span><button class="mClose">×</button></div>
        <div class="mBody" id="botGuideBody"></div></div></div>`);
      m = document.getElementById('botGuideModal');
      m.querySelector('.mClose').addEventListener('click', () => m.classList.remove('show'));
      m.addEventListener('mousedown', e => { if (e.target === m) m.classList.remove('show'); });
    }
    document.getElementById('botGuideTitle').textContent = (typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(bot) : bot.name).toUpperCase();
    document.getElementById('botGuideBody').innerHTML = this.html(bot);
    document.getElementById('botGuideBody').scrollTop = 0;
    m.classList.add('show');
  },

  bind(){
    if (this._bound) return;
    this._bound = true;
    document.addEventListener('click', e => {
      const b = e.target.closest && e.target.closest('[data-guide]');
      if (b){ e.preventDefault(); e.stopPropagation(); this.open(b.dataset.guide); }
    });
  },
};
BotGuide.bind();
