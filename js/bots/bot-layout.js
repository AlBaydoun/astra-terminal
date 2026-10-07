/* ASTRA Terminal — the layout of a bot's page, your way.

   A strategy bot's page is made of parts: your notes, the settings row, the
   markets, the net result with the open trades, the numbers (equity, P&L…),
   the equity history, the closed history, decisions, lessons, daily, and the
   backtest. ⚙ Layout on every bot page lets you move each part up or down
   and switch it off or on.

   One layout for all bots by default; tick "only this bot" to give one bot
   its own. Stored under astra_botlayout: { '*': {order, hidden}, <botId>: {…} }.
   Switching a part off only hides it from the page — the bot keeps working
   exactly the same. */
const BotLayout = {
  KEY: 'astra_botlayout',
  PARTS: [
    { id: 'notes',     label: 'My notes',                     icon: '📝' },
    { id: 'controls',  label: 'Settings row (timeframe, score, run, backtest)', icon: '⚙' },
    { id: 'markets',   label: 'Markets',                      icon: '🌍' },
    { id: 'result',    label: 'Net result & open trades',     icon: '◎' },
    { id: 'stats',     label: 'Numbers — equity, P&L, trades, profit factor…', icon: '#' },
    { id: 'equity',    label: 'Equity history (the curve)',   icon: '📈' },
    { id: 'history',   label: 'Closed history',               icon: '🕘', grid: true },
    { id: 'decisions', label: 'Decisions',                    icon: '🔎', grid: true },
    { id: 'lessons',   label: 'Lessons from losses',          icon: '📘', grid: true },
    { id: 'daily',     label: 'Daily',                        icon: '📅', grid: true },
    { id: 'backtest',  label: 'Backtest results',             icon: '⏪' },
  ],
  /* the Manual Trading Bot page has parts of its own, and its own layout */
  MANUAL_PARTS: [
    { id: 'notes',     label: 'My notes',                                  icon: '📝' },
    { id: 'links',     label: 'Paper / REAL switch',                       icon: '⇄' },
    { id: 'rules',     label: 'Manual trading rules (risk, budget, limits)', icon: '⚙' },
    { id: 'ticket',    label: 'Order ticket (buy / sell)',                 icon: '🎫' },
    { id: 'help',      label: 'How the ticket works (explanation)',        icon: 'ℹ' },
    { id: 'auto',      label: 'Automatic entries',                         icon: '🤖' },
    { id: 'pending',   label: 'Waiting orders (limit / stop entries)',     icon: '⏳' },
    { id: 'positions', label: 'Open manual trades',                        icon: '📂' },
    { id: 'stats',     label: 'Numbers — equity, P&L, trades, profit factor…', icon: '#' },
    { id: 'equity',    label: 'Equity history (the curve)',                icon: '📈' },
    { id: 'history',   label: 'Closed history',                            icon: '🕘', grid: true },
    { id: 'decisions', label: 'Decisions',                                 icon: '🔎', grid: true },
    { id: 'lessons',   label: 'Lessons from losses',                       icon: '📘', grid: true },
    { id: 'daily',     label: 'Daily',                                     icon: '📅', grid: true },
  ],
  /* the LIVE trading bot: its safety line and its confirm step can move but never disappear */
  LIVE_PARTS: [
    { id: 'notes',      label: 'My notes',                                      icon: '📝' },
    { id: 'banner',     label: 'Title banner (↩ back to paper)',                 icon: '🏷' },
    { id: 'state',      label: 'Safety status — locked / shadow / live',        icon: '🛡', always: true },
    { id: 'connection', label: 'Connection & unlock',                           icon: '🔌' },
    { id: 'order',      label: 'Your market order (the ticket)',                icon: '🎫' },
    { id: 'rules',      label: 'Live account rules & position budgets',         icon: '⚖' },
    { id: 'confirm',    label: 'Order preview & confirm',                       icon: '✅', always: true },
    { id: 'auto',       label: 'Automatic entries (switched off — the desk runs the bots)', icon: '🤖' },
    { id: 'tuning',     label: 'Tuning — sliders (switched off with it)',        icon: '🎚' },
    { id: 'positions',  label: 'Real open trades',                              icon: '📂' },
  ],
  /* Live connection & safety: the STOP EVERYTHING banner never disappears */
  LIVEPAGE_PARTS: [
    { id: 'notes',   label: 'My notes',                                       icon: '📝' },
    { id: 'links',   label: 'Link to the LIVE trading bot (manual orders)',   icon: '↗' },
    { id: 'banner',  label: 'Status banner with STOP EVERYTHING',             icon: '🛑', always: true },
    { id: 'connect', label: '1 · Connect to the account',                     icon: '🔌' },
    { id: 'desk',    label: 'The Live Desk (its cards are listed below)',     icon: '🎛' },
    { id: 'classic', label: 'Hard ceilings & arm one bot by name',            icon: '⚙' },
    { id: 'account', label: 'Live results from MetaTrader',                   icon: '📊' },
    { id: 'audit',   label: 'Audit log',                                      icon: '📜' },
    { id: 'note',    label: 'Note: paper and live are kept apart',            icon: 'ℹ' },
  ],
  /* Open Trades */
  OPEN_PARTS: [
    { id: 'notes',  label: 'My notes',                                           icon: '📝' },
    { id: 'intro',  label: 'Short explanation line',                             icon: 'ℹ' },
    { id: 'real',   label: 'REAL positions on the account (Live Desk)',          icon: '💵' },
    { id: 'stats',  label: 'Numbers — open now, in profit / loss, unrealised, at risk', icon: '#' },
    { id: 'table',  label: 'Summary table — every open trade on one line (sortable, click to go to it)', icon: '☰' },
    { id: 'sort',   label: 'Order buttons (newest, best first, instrument, bot)', icon: '⇅' },
    { id: 'filter', label: 'Bot filter (show one bot’s trades)',                 icon: '⧩' },
    { id: 'list',   label: 'The open trades themselves (the cards)',             icon: '🗂' },
    { id: 'note',   label: 'Note about adjusting a bot’s trade',                 icon: '✎' },
  ],
  /* the Dashboard: its top and its eight sections */
  DASH_PARTS: [
    { id: 'notes',       label: 'My notes',                                     icon: '📝' },
    { id: 'intro',       label: 'Short explanation line',                       icon: 'ℹ' },
    { id: 'health',      label: 'Health check (bots running, feed, warnings)',  icon: '🩺' },
    { id: 'links',       label: 'Link to Buy / Sell Analysis',                  icon: '↗' },
    { id: 'filter',      label: 'Filters (bot, market, day…)',                  icon: '⧩' },
    { id: 'stats',       label: 'Numbers — trades, won, lost, net, best day…',  icon: '#' },
    { id: 'secbar',      label: 'Fold-all / normal-order buttons',              icon: '⇅' },
    { id: 'ranking',     label: 'Bot ranking — who is earning, and where',      icon: '🏆', ownFold: true },
    { id: 'money',       label: 'The money',                                    icon: '💰', ownFold: true },
    { id: 'bots',        label: 'Every bot, side by side',                      icon: '🤖', ownFold: true },
    { id: 'instruments', label: 'Every instrument, in full',                    icon: '🗂', ownFold: true },
    { id: 'breakdowns',  label: 'Breakdowns',                                   icon: '▦', ownFold: true },
    { id: 'days',        label: 'Day by day',                                   icon: '📅', ownFold: true },
    { id: 'open',        label: 'Open right now (when something is open)',      icon: '📂', ownFold: true },
    { id: 'log',         label: 'Trade log',                                    icon: '☰', ownFold: true },
    { id: 'pairs',       label: 'Permitted & prohibited',                       icon: '🛡', ownFold: true },
    { id: 'note',        label: 'Note: every trade here is virtual',            icon: '⚠' },
  ],
  /* the Performance Report; its six chart cards sit side by side when they follow each other */
  REPORT_PARTS: [
    { id: 'notes',      label: 'My notes',                                    icon: '📝' },
    { id: 'intro',      label: 'Short explanation line (and test progress)',  icon: 'ℹ' },
    { id: 'head',       label: 'Title with Test every bot / Excel / PDF',     icon: '🏷' },
    { id: 'disclaimer', label: 'Note: this page decides nothing on its own',  icon: '⚠' },
    { id: 'kpis',       label: 'Numbers — bots, trades, fleet P&L, win rate…', icon: '#' },
    { id: 'best',       label: 'Best on evidence so far',                     icon: '🏆' },
    { id: 'ranking',    label: 'Ranking — which bot would you trust?',        icon: '☰' },
    { id: 'pnl',        label: 'Profit and loss by bot',                      icon: '▥', grid: 'rpGrid', gridFold: true },
    { id: 'winrate',    label: 'Win rate',                                    icon: '◔', grid: 'rpGrid', gridFold: true },
    { id: 'curves',     label: 'Equity curves',                               icon: '📈', grid: 'rpGrid', gridFold: true },
    { id: 'rmult',      label: 'How trades finished (R multiples)',           icon: '▤', grid: 'rpGrid', gridFold: true },
    { id: 'earns',      label: 'Where the fleet earns',                       icon: '🌍', grid: 'rpGrid', gridFold: true },
    { id: 'lab',        label: 'What the lab has been doing',                 icon: '🧪', grid: 'rpGrid', gridFold: true },
    { id: 'conditions', label: 'The six conditions for a live seat',          icon: '✅' },
  ],
  /* Buy / Sell Analysis; the charts and the two breakdowns pair up side by side */
  ANALYSIS_PARTS: [
    { id: 'notes',       label: 'My notes',                                        icon: '📝' },
    { id: 'filters',     label: 'Filters (account, instrument, timeframe, dates…)', icon: '⧩' },
    { id: 'hero',        label: 'Headline and combined net',                       icon: '◈' },
    { id: 'scope',       label: 'What is counted (open trades excluded…)',         icon: 'ℹ' },
    { id: 'notices',     label: 'Warnings (missing fees, excluded records…)',      icon: '⚠' },
    { id: 'sides',       label: 'BUY and SELL cards',                              icon: '⇅' },
    { id: 'money',       label: 'Where the money came from',                       icon: '▥', grid: 'anColumns' },
    { id: 'time',        label: 'Profit over time',                                icon: '⌁', grid: 'anColumns' },
    { id: 'compare',     label: 'Buy vs Sell · the full comparison',               icon: '≋' },
    { id: 'instruments', label: 'Which instruments delivered?',                    icon: '◎' },
    { id: 'tf',          label: 'By timeframe',                                    icon: '◷', grid: 'anColumns' },
    { id: 'bots',        label: 'By bot account',                                  icon: '▦', grid: 'anColumns' },
    { id: 'log',         label: 'Every completed trade',                           icon: '☷' },
    { id: 'updated',     label: '“Updated at …” line',                             icon: '🕘' },
  ],
  /* the Strategy Checker */
  CHECKER_PARTS: [
    { id: 'notes',    label: 'My notes',                                             icon: '📝' },
    { id: 'status',   label: 'The brain’s status and progress (pause / study)',      icon: '🧠' },
    { id: 'controls', label: 'Controls — target, stop, markets to study',            icon: '⚙' },
    { id: 'crumbs',   label: 'The path (Everything › …)',                            icon: '›' },
    { id: 'hero',     label: 'The main picture of this doll',                        icon: '◎' },
    { id: 'recs',     label: '🏆 What to do — the recommendations',                   icon: '🏆' },
    { id: 'now',      label: '⚡ Firing now',                                          icon: '⚡' },
    { id: 'grid',     label: '🎯 Target × stop map',                                   icon: '🎯' },
    { id: 'reach',    label: '📈 How far does it go?',                                 icon: '📈' },
    { id: 'board',    label: '📋 Every signal, ranked',                                icon: '📋' },
    { id: 'splits',   label: '🪆 Open a smaller doll',                                 icon: '🪆' },
    { id: 'brain',    label: '🧠 The brain’s notebook',                                icon: '📓' },
    { id: 'botsMade', label: '🤖 Paper bots made from findings',                       icon: '🤖' },
    { id: 'lib',      label: '📚 The library',                                         icon: '📚' },
  ],
  /* the Master Brain */
  BRAIN_PARTS: [
    { id: 'notes',    label: 'My notes',                                                icon: '📝' },
    { id: 'controls', label: 'Buttons — train, learn from history, research, lab…',     icon: '⚙' },
    { id: 'state',    label: 'The brain’s state',                                       icon: '🧠' },
    { id: 'live',     label: 'Live trading notice (every live signal passes the veto)', icon: '💵' },
    { id: 'counts',   label: 'Numbers — examples, trained on, approved, vetoed',        icon: '#' },
    { id: 'coverage', label: 'Context coverage (regime, fear & greed, news)',           icon: '🌐' },
    { id: 'needs',    label: 'Not trained yet — what it needs',                         icon: '⏳' },
    { id: 'score',    label: 'Honest score & effect of the filter',                     icon: '🎯', grid: true },
    { id: 'calib',    label: 'Is it calibrated?',                                       icon: '⚖', grid: true },
    { id: 'weights',  label: 'What it has learned to weigh',                            icon: '🏋', grid: true },
    { id: 'log',      label: 'Learning log',                                            icon: '📜', grid: true },
    { id: 'warn',     label: 'Note: a statistical model, not a forecaster',             icon: '⚠' },
    { id: 'auto',     label: 'Automatic schedule',                                      icon: '⏰' },
    { id: 'lab',      label: 'The Strategy Lab (bots it builds and retires)',           icon: '🧪' },
  ],
  partsFor(id){ return id === 'manual' ? this.MANUAL_PARTS : id === 'liveManual' ? this.LIVE_PARTS : id === 'live' ? this.LIVEPAGE_PARTS : id === 'open' ? this.OPEN_PARTS : id === 'dash' ? this.DASH_PARTS : id === 'report' ? this.REPORT_PARTS : id === 'analysis' ? this.ANALYSIS_PARTS : id === 'checker' ? this.CHECKER_PARTS : this.brainId(id) ? this.BRAIN_PARTS : id === 'scanner' ? this.SCANNER_PARTS : id === 'confluenceScanner' ? this.CFS_PARTS : id === 'confluence' ? this.CF_PARTS : id === 'permissions' ? this.PERM_PARTS : id === 'botsettings' ? this.BOTSET_PARTS : id === 'clock' ? this.CLOCK_PARTS : id === 'replay' ? this.REPLAY_PARTS : this.PARTS; },
  brainId(id){ const b = typeof BOT_BY_ID !== 'undefined' ? BOT_BY_ID[id] : null; return !!(b && b.brain); },
  /* the Trade Replay window; its title (✕) and the replay itself never disappear */
  REPLAY_PARTS: [
    { id: 'head',    label: 'Title (with ⚙ Layout and the ✕ close button)',        icon: '🏷', always: true },
    { id: 'filters', label: 'Filters (bot, pair, side, result, dates…)',            icon: '⧩' },
    { id: 'stats',   label: 'Summary numbers of the filtered trades',               icon: '#' },
    { id: 'list',    label: 'The trade list',                                       icon: '☰' },
    { id: 'pager',   label: 'Pages, export CSV, inspect current chart',             icon: '⇆' },
    { id: 'review',  label: 'The replay — chart, controls, facts (when a trade is open)', icon: '▶', always: true },
    { id: 'foot',    label: 'Footnote about the data',                              icon: 'ℹ' },
  ],
  /* the Market Clock window; the ✕ in its title must never disappear */
  CLOCK_PARTS: [
    { id: 'head',    label: 'Title (with the ✕ close button)',                     icon: '🏷', always: true },
    { id: 'hero',    label: 'Your local time',                                     icon: '🕘' },
    { id: 'toolbar', label: 'Search, filter, pause motion, US stock activity, ⚙',  icon: '🔍', always: true },
    { id: 'cards',   label: 'The market cards (their order is below)',              icon: '🗂' },
    { id: 'audit',   label: 'US stock bot activity (when you open it)',            icon: '⌕' },
    { id: 'foot',    label: 'Sources and holiday note',                             icon: 'ℹ' },
  ],
  /* the market cards themselves: their own order and on/off */
  clockCards(){
    const ids = (typeof MarketClock !== 'undefined' ? MarketClock.profiles : []).map(p => p.id);
    const L = this.all().clockCards || {};
    const order = (L.order || []).filter(x => ids.includes(x)); for (const id of ids) if (!order.includes(id)) order.push(id);
    return { order, hidden: (L.hidden || []).filter(x => ids.includes(x)) };
  },
  saveClockCards(c){ const A = this.all(); A.clockCards = c; lsSet(this.KEY, A); this.rebuild(); },
  clockCardRows(){
    const c = this.clockCards(), n = c.order.length;
    return `<div class="blSub"><b>The market cards</b><span class="dim2">your markets first · untick the ones you do not trade</span></div>
      <div class="blRows">${c.order.map((id, i) => { const p = MarketClock.profiles.find(x => x.id === id) || {}, on = !c.hidden.includes(id);
        return `<div class="blRow${on ? '' : ' off'}"><span class="blIco">${p.icon || '▪'}</span>
          <label><input type="checkbox" data-blcon="${esc(id)}" ${on ? 'checked' : ''}> ${esc(p.name || id)} <small class="dim2">· ${esc(p.sub || '')}</small></label>
          <span class="blMove"><button data-blcmv="${esc(id)}|-1" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button><button data-blcmv="${esc(id)}|1" ${i === n - 1 ? 'disabled' : ''} title="Move down">▼</button></span></div>`; }).join('')}</div>`;
  },
  /* Bots on / off */
  BOTSET_PARTS: [
    { id: 'notes',   label: 'My notes',                                               icon: '📝' },
    { id: 'menu',    label: 'Pages in the left menu — show or hide each one',         icon: '☰' },
    { id: 'intro',   label: 'What switching a bot off does (explanation)',            icon: 'ℹ' },
    { id: 'actions', label: 'Switch all on / unpause all / reset every locked bot',   icon: '⚡' },
    { id: 'list',    label: 'The bots (switch, pause, reset each one)',               icon: '🤖' },
  ],
  /* Instrument permissions */
  PERM_PARTS: [
    { id: 'notes',   label: 'My notes',                                                   icon: '📝' },
    { id: 'tools',   label: 'Automatic blocking on / off and “use the rule for every pair”', icon: '⚙' },
    { id: 'search',  label: 'Find a pair (search)',                                       icon: '🔍' },
    { id: 'columns', label: 'Permitted and prohibited pairs (the lists)',                 icon: '🛡' },
    { id: 'note',    label: 'How blocking works (and whether automatic blocking is on)',  icon: 'ℹ' },
  ],
  /* the Confluence bot */
  CF_PARTS: [
    { id: 'notes',     label: 'My notes',                                             icon: '📝' },
    { id: 'buttons',   label: 'Buttons — start / pause, scan now, chart, guide',      icon: '⚙' },
    { id: 'rules',     label: 'Trading rules (counts, budgets) and Save',             icon: '⚖' },
    { id: 'status',    label: 'Status and how it trades (explanation)',               icon: 'ℹ' },
    { id: 'scanner',   label: 'Scanner preview (top setups)',                         icon: '📡' },
    { id: 'result',    label: 'Net result & open trades',                             icon: '◎' },
    { id: 'stats',     label: 'Numbers — equity, P&L, trades, profit factor…',        icon: '#' },
    { id: 'equity',    label: 'Equity history (the curve)',                           icon: '📈' },
    { id: 'history',   label: 'Closed history',                                       icon: '🕘', grid: true },
    { id: 'decisions', label: 'Decisions',                                            icon: '🔎', grid: true },
    { id: 'lessons',   label: 'Lessons from losses',                                  icon: '📘', grid: true },
    { id: 'daily',     label: 'Daily',                                                icon: '📅', grid: true },
  ],
  /* the Confluence Scanner */
  CFS_PARTS: [
    { id: 'notes',    label: 'My notes',                                                  icon: '📝' },
    { id: 'controls', label: 'Buttons — pause / start, scan all now, open the bot',       icon: '⚙' },
    { id: 'status',   label: 'Status line (on / paused, checked, setups, ready)',         icon: '📡' },
    { id: 'explain',  label: 'How it scans and ranks (explanation)',                      icon: 'ℹ' },
    { id: 'find',     label: 'Find pair and Show filter',                                 icon: '🔍' },
    { id: 'table',    label: 'The instruments table',                                     icon: '☰' },
  ],
  /* the Market Scanner */
  SCANNER_PARTS: [
    { id: 'notes',    label: 'My notes',                                          icon: '📝' },
    { id: 'controls', label: 'Settings row — timeframe, min score, Scan now',     icon: '⚙' },
    { id: 'active',   label: 'Active setups (the table)',                          icon: '⚡' },
    { id: 'watching', label: 'Watching (everything else it looked at)',           icon: '👁' },
    { id: 'note',     label: 'Note: the scanner never opens a trade',             icon: 'ℹ' },
  ],
  hasLayout(b){ return !!b && (this.applies(b) || b.liveManual || b.id === 'live' || b.trades || b.dash || b.report || b.id === 'analysis' || b.checker || b.brain || b.id === 'scanner' || b.confluenceScanner || b.id === 'confluence'); },
  solo(id){ return id === 'manual' || id === 'liveManual' || id === 'live' || id === 'open' || id === 'dash' || id === 'report' || id === 'analysis' || id === 'checker' || this.brainId(id) || id === 'scanner' || id === 'confluenceScanner' || id === 'confluence' || id === 'permissions' || id === 'botsettings' || id === 'clock' || id === 'replay'; },
  /* the parts actually on screen last time a page was put together */
  _visible: {},
  visible(id){ return this._visible[id] || null; },
  /* the page must be rebuilt once after a change (the live pages normally refresh in place) */
  rebuild(){ this._force = true; if (typeof LiveDesk !== 'undefined') LiveDesk._force = true; if (typeof Checker !== 'undefined') Checker.dirty = true; Bots.render();
    if (typeof MarketClock !== 'undefined' && MarketClock.host && MarketClock.layoutOpen !== undefined) MarketClock.applyLayout();
    if (typeof TradeReview !== 'undefined' && TradeReview.applyLayout && TradeReview.host) TradeReview.applyLayout(); },
  _force: false,
  /* pages whose parts each fold (their fold bars are drawn by compose) */
  FOLDING: ['liveManual', 'manual', 'live', 'open', 'dash', 'report', 'botsettings'],
  toggleFold(page, pid){
    const A = this.all(), L = A[page] || (A[page] = this.get(page)); L.folded = L.folded || [];
    const shut = !L.folded.includes(pid); L.folded = shut ? L.folded.concat([pid]) : L.folded.filter(x => x !== pid);
    lsSet(this.KEY, A);
    /* in place — the LIVE page is never rebuilt for a fold */
    const w = document.querySelector('.blFoldable[data-blpart="' + pid + '"]'); if (!w) return;
    w.classList.toggle('blFolded', shut); w.querySelector(':scope > .blFoldBody').hidden = shut;
    const b = w.querySelector(':scope > .blFoldBar'); b.setAttribute('aria-expanded', String(!shut)); b.querySelector('i').textContent = shut ? '▸' : '▾';
  },           // a layout change must rebuild the Manual page (it normally never rebuilds)
  open: false,

  /* which pages it applies to: the ordinary strategy bots */
  applies(b){
    return !!b && !(b.analysis || b.dash || b.explorer || b.checker || b.trades || b.fit || b.live || b.liveManual || b.report || b.brain || b.scan || b.confluenceScanner || b.id === 'confluence' || b.id === 'permissions' || b.id === 'botsettings');
  },
  all(){ const v = lsGet(this.KEY, {}); return v && typeof v === 'object' ? v : {}; },
  own(id){ return this.solo(id) || !!this.all()[id]; },
  get(id){
    const A = this.all();
    let L = (this.solo(id) ? A[id] : (A[id] || A['*'])) || {};
    if (id === 'checker' && !A.checker && typeof Checker !== 'undefined'){
      const own = ((Checker.load() || {}).order || []);
      if (own.length) L = { order: ['notes', 'status', 'controls', 'crumbs', 'hero'].concat(own), hidden: [] };
    }
    if (id === 'dash' && !A.dash && typeof BotDash !== 'undefined' && Array.isArray(BotDash.order)){
      const top = ['notes', 'intro', 'health', 'links', 'filter', 'stats', 'secbar'];
      L = { order: top.concat(BotDash.secOrder(BotDash.DEFAULT_ORDER)).concat(['note']), hidden: [] };
    }
    const known = this.partsFor(id).map(p => p.id);
    /* keep the saved order, and add any part invented later at its default place */
    let order = (L.order || []).filter(x => known.includes(x));
    known.forEach((p, i) => { if (!order.includes(p)){ const before = known.slice(0, i).reverse().find(q => order.includes(q)); order.splice(before ? order.indexOf(before) + 1 : 0, 0, p); } });
    return { order, hidden: (L.hidden || []).filter(x => known.includes(x)) };
  },
  save(id, lay){
    const A = this.all(), prev = A[this.own(id) ? id : '*'] || {}; A[this.own(id) ? id : '*'] = { order: lay.order, hidden: lay.hidden, folded: prev.folded || [] };
    lsSet(this.KEY, A); this.rebuild();
  },

  /* the page, in your order; neighbouring columns share one grid, as before */
  compose(id, html, keepHidden){
    const lay = this.get(id), out = [];
    let grid = [], gridCls = 'botGrid';
    const flush = () => { if (grid.length){ out.push(`<div class="${gridCls}">${grid.join('')}</div>`); grid = []; } };
    for (const pid of lay.order){
      const part = this.partsFor(id).find(p => p.id === pid), h = html[pid] || '';
      const off = lay.hidden.includes(pid) && !part.always;
      const cls = part.grid ? (part.grid === true ? 'botGrid' : part.grid) : null;
      if (cls && cls !== gridCls){ flush(); gridCls = cls; }
      if (off && keepHidden){
        if (h){ if (cls) grid.push(`<div class="blCell" data-blpart="${pid}" hidden>${h}</div>`); else { flush(); out.push(`<div class="blPart" data-blpart="${pid}" hidden>${h}</div>`); } }
        continue;
      }
      if (off) continue;
      if (!h) continue;
      /* a column keeps its own wrapper too, so the Manual page can refresh it in place */
      if (part.grid && part.gridFold && this.FOLDING.includes(id)){
        /* a card in a side-by-side grid that folds: the wrapper is the grid item, with its own fold bar */
        const f = (this.all()[id] || {}).folded || [], shut = f.includes(pid);
        grid.push(`<div class="blFoldable blGridFold${shut ? ' blFolded' : ''}" data-blpart="${pid}"><button type="button" class="blFoldBar" data-blfold="${esc(id)}|${pid}" aria-expanded="${!shut}"><i>${shut ? '▸' : '▾'}</i> ${esc(part.label)}</button><div class="blFoldBody"${shut ? ' hidden' : ''}>${h}</div></div>`);
      }
      else if (part.grid) grid.push(`<div class="blCell" data-blpart="${pid}">${h}</div>`);
      else if (this.FOLDING.includes(id) && !part.always && !part.ownFold){
        const f = (this.all()[id] || {}).folded || [], shut = f.includes(pid);
        flush(); out.push(`<div class="blPart blFoldable${shut ? ' blFolded' : ''}" data-blpart="${pid}"><button type="button" class="blFoldBar" data-blfold="${esc(id)}|${pid}" aria-expanded="${!shut}"><i>${shut ? '▸' : '▾'}</i> ${esc(part.label)}</button><span class="blQuickMove"><button type="button" data-blqmv="${esc(id)}|${pid}|-1" title="Move this section up">▲</button><button type="button" data-blqmv="${esc(id)}|${pid}|1" title="Move this section down">▼</button></span><div class="blFoldBody"${shut ? ' hidden' : ''}>${h}</div></div>`);
      }
      else { flush(); out.push(`<div class="blPart" data-blpart="${pid}">${h}</div>`); }
    }
    flush();
    this._visible[id] = lay.order.filter(pid => { const p = this.partsFor(id).find(x => x.id === pid); return (html[pid] || '') && !(lay.hidden.includes(pid) && !p.always); });
    const off = lay.hidden.filter(pid => !(this.partsFor(id).find(p => p.id === pid) || {}).always).length;
    return out.join('') + (off ? `<div class="blHiddenNote dim2">${off} part${off === 1 ? ' is' : 's are'} switched off on this page — <button class="bMini" data-blopen="${esc(id)}">⚙ Layout</button></div>` : '');
  },

  button(id){ return `<button type="button" class="bMini blBtn${this.open ? ' on' : ''}" data-blopen="${esc(id)}" title="Put the parts of this page in your own order and switch parts off or on">⚙ Layout</button>`; },

  panel(id, force){
    if (!this.open && !force) return '';
    const lay = this.get(id), own = this.own(id), n = lay.order.length;
    const row = (pid, i) => {
      const p = this.partsFor(id).find(x => x.id === pid), on = p.always || !lay.hidden.includes(pid);
      return `<div class="blRow${on ? '' : ' off'}">
        <span class="blIco">${p.icon}</span>
        <label${p.always ? ' title="Always shown — you must always see whether real orders are locked, and the confirm step"' : ''}><input type="checkbox" data-blon="${esc(id)}|${pid}" ${on ? 'checked' : ''}${p.always ? ' disabled' : ''}> ${esc(p.label)}${p.always ? ' <small class="dim2">· always shown</small>' : ''}</label>
        <span class="blMove"><button data-blmv="${esc(id)}|${pid}|-1" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button><button data-blmv="${esc(id)}|${pid}|1" ${i === n - 1 ? 'disabled' : ''} title="Move down">▼</button></span>
      </div>`;
    };
    return `<div class="blPanel">
      <div class="blHead"><b>⚙ Page layout</b><span class="dim2">top to bottom, as the page shows it · untick to hide a part (${id === 'clock' ? 'the clock keeps counting' : id === 'replay' ? 'every trade stays in the record' : 'the bot keeps working'})</span>
        <button class="bMini" data-blclose="1" title="Close these settings">Done</button></div>
      <div class="blScope"${this.solo(id) ? ' hidden' : ''}>
        <label><input type="radio" name="blScope" data-blscope="${esc(id)}|all" ${own ? '' : 'checked'}> The same for <b>all bots</b></label>
        <label><input type="radio" name="blScope" data-blscope="${esc(id)}|own" ${own ? 'checked' : ''}> <b>Only this bot</b> has its own</label>
      </div>
      <div class="blRows">${lay.order.map(row).join('')}</div>
      ${id === 'live' && typeof LiveDesk !== 'undefined' ? this.deskRows() : ''}
      ${id === 'clock' && typeof MarketClock !== 'undefined' ? this.clockCardRows() : ''}
      <div class="blFoot"><button class="bMini" data-blreset="${esc(id)}" title="Back to the original order, every part on">↺ Reset to the original</button>
        ${this.brainId(id) ? '<span class="dim2">Honest score, calibration, weights and the learning log sit side by side when they follow each other.</span>' : id === 'report' ? '<span class="dim2">The six chart cards sit side by side when they follow each other.</span>' : id === 'analysis' ? '<span class="dim2">The two charts, and the two breakdowns, sit side by side when they follow each other.</span>' : this.partsFor(id).some(p => p.grid) ? '<span class="dim2">Closed history, Decisions, Lessons and Daily sit side by side when they follow each other.</span>' : id === 'liveManual' ? '<span class="dim2">A part you switch off is only hidden — every safety check behind it keeps running.</span>' : ''}</div>
    </div>`;
  },

  /* the Live Desk's own cards, in the same panel */
  deskRows(){
    const S = LiveDesk.load(), order = LiveDesk.order(), hid = S.ui.hidden || {};
    return `<div class="blSub"><b>Inside the Live Desk</b><span class="dim2">its cards — also movable with their own ▲▼ and by dragging their title</span></div>
      <div class="blRows">${order.map((k, i) => { const always = LiveDesk.ALWAYS.includes(k), on = always || !hid[k];
        return `<div class="blRow${on ? '' : ' off'}"><span class="blIco">${LiveDesk.SEC_ICON[k] || '▪'}</span>
          <label${always ? ' title="Always shown — you must always see whether real trading is armed"' : ''}><input type="checkbox" data-bldon="${k}" ${on ? 'checked' : ''}${always ? ' disabled' : ''}> ${esc(LiveDesk.SEC_LABEL[k] || k)}${always ? ' <small class="dim2">· always shown</small>' : ''}</label>
          <span class="blMove"><button data-bldmv="${k}|-1" ${i === 0 ? 'disabled' : ''} title="Move up">▲</button><button data-bldmv="${k}|1" ${i === order.length - 1 ? 'disabled' : ''} title="Move down">▼</button></span></div>`; }).join('')}</div>`;
  },

  move(id, pid, d, visible){
    const lay = this.get(id), i = lay.order.indexOf(pid);
    let j = i + d;
    while (visible && j >= 0 && j < lay.order.length && !visible.includes(lay.order[j])) j += d;
    if (i < 0 || j < 0 || j >= lay.order.length) return;
    lay.order.splice(i, 1); lay.order.splice(j, 0, pid); this.save(id, lay);
  },
  toggle(id, pid, on){
    const lay = this.get(id);
    lay.hidden = on ? lay.hidden.filter(x => x !== pid) : lay.hidden.concat([pid]);
    this.save(id, lay);
  },
  scope(id, own){
    const A = this.all();
    if (own){ A[id] = this.get(id); toast('This bot now has its own page layout', 'info'); }
    else { delete A[id]; toast('This bot follows the layout shared by all bots again', 'info'); }
    lsSet(this.KEY, A); this.rebuild();
  },
  reset(id){
    const A = this.all();
    /* a bot with its own layout keeps its own — back to the original order, every part on */
    if (id === 'clock') delete A.clockCards;
    if (this.solo(id)) delete A[id];
    else if (this.own(id)) A[id] = { order: this.PARTS.map(p => p.id), hidden: [] }; else delete A['*'];
    if (id === 'live' && typeof LiveDesk !== 'undefined'){ const S = LiveDesk.load(); S.ui.hidden = {}; S.ui.order = []; LiveDesk.save(); }
    lsSet(this.KEY, A); this.rebuild();
    toast('Page layout back to the original', 'info');
  },
};

/* one listener: the page is rebuilt every few seconds */
document.addEventListener('click', e => {
  const t = e.target; if (!t || !t.closest) return;
  const orp = t.closest('[data-blopen="replay"]'); if (orp){ e.preventDefault(); e.stopPropagation(); TradeReview.layoutOpen = !TradeReview.layoutOpen; TradeReview.applyLayout(); return; }
  if (t.closest('.trLayoutHost [data-blclose]')){ TradeReview.layoutOpen = false; TradeReview.applyLayout(); return; }
  const oc = t.closest('[data-blopen="clock"]'); if (oc){ e.preventDefault(); MarketClock.layoutOpen = !MarketClock.layoutOpen; MarketClock.applyLayout(); return; }
  if (t.closest('.mcLayoutHost [data-blclose]')){ MarketClock.layoutOpen = false; MarketClock.applyLayout(); return; }
  const cm = t.closest('[data-blcmv]'); if (cm){ const [id, d] = cm.dataset.blcmv.split('|'); const c = BotLayout.clockCards(), i = c.order.indexOf(id), j = i + +d; if (i >= 0 && j >= 0 && j < c.order.length){ c.order.splice(i, 1); c.order.splice(j, 0, id); BotLayout.saveClockCards(c); } return; }
  const o = t.closest('[data-blopen]'); if (o){ e.preventDefault(); BotLayout.open = !BotLayout.open; BotLayout.rebuild(); if (BotLayout.open) setTimeout(() => { const p = document.querySelector('.blPanel'); if (p) p.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, 50); return; }
  if (t.closest('[data-blclose]')){ BotLayout.open = false; BotLayout.rebuild(); return; }
  const dm = t.closest('[data-bldmv]'); if (dm){ const [k, d] = dm.dataset.bldmv.split('|'); LiveDesk.moveSec(k, +d); BotLayout.rebuild(); return; }
  const m = t.closest('[data-blmv]'); if (m){ const [id, pid, d] = m.dataset.blmv.split('|'); BotLayout.move(id, pid, +d); return; }
  /* the ▲ ▼ beside a fold bar: past the sections you switched off, so one press always moves it on screen */
  const qm = t.closest('[data-blqmv]'); if (qm){ e.preventDefault(); e.stopPropagation(); const [id, pid, d] = qm.dataset.blqmv.split('|'); BotLayout.move(id, pid, +d, (BotLayout._visible || {})[id]); return; }
  const r = t.closest('[data-blreset]'); if (r){ BotLayout.reset(r.dataset.blreset); return; }
  const fb = t.closest('[data-blfold]'); if (fb){ e.preventDefault(); const [pg, pid] = fb.dataset.blfold.split('|'); BotLayout.toggleFold(pg, pid); return; }
});
document.addEventListener('change', e => {
  const t = e.target; if (!t || !t.dataset) return;
  if (t.dataset.blon){ const [id, pid] = t.dataset.blon.split('|'); BotLayout.toggle(id, pid, t.checked); }
  if (t.dataset.blcon){ const c = BotLayout.clockCards(); c.hidden = t.checked ? c.hidden.filter(x => x !== t.dataset.blcon) : c.hidden.concat([t.dataset.blcon]); BotLayout.saveClockCards(c); }
  if (t.dataset.bldon){ const S = LiveDesk.load(); S.ui.hidden = S.ui.hidden || {}; if (t.checked) delete S.ui.hidden[t.dataset.bldon]; else S.ui.hidden[t.dataset.bldon] = true; LiveDesk.save(); BotLayout.rebuild(); }
  if (t.dataset.blscope){ const [id, w] = t.dataset.blscope.split('|'); BotLayout.scope(id, w === 'own'); }
});
