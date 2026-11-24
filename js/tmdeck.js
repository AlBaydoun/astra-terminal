/* ASTRA · Markets Terminal — pages as stations (the Live Desk's launch sequence, and the desks built like it).

   A Classic page is one very long scroll. Here the same page is laid out as a few stations with a
   rail on top; one station is open at a time, and "Show everything" lays the whole page out again
   with its layout tools.

     live ...... Link → Money → Exits → Bots → Arm → Watch → Records. A real sequence: the rail reads
                 the desk's own four gates (Bridge, Code, Desk armed, Real money) and the next step
                 pulses. Link status, Refresh and STOP EVERYTHING ride under the rail at every station.
     manual .... Ticket · Rules · Auto · Orders · Results · Notes (your paper desk; not a sequence)
     open ...... Trades · Summary · Notes. The trades are a wall of small cards; press one and it
                 opens wide with its own controls (stop, target, trailing, reduce or close)
     scanner ... Setups · Watching · Notes. The table's rows are tiles with the score as a ring; press
                 one for every check behind it. Timeframe is chips, the minimum score a slider
     confluenceScanner ... Board · Rules · Notes. A tile an instrument with its five checks as bars
     brain ..... Teach · Report · Lab · Autopilot · Notes. Its buttons are cards that say what each does
     fit ....... Study · Markets · Plan · Table · History · Notes. The three buttons are steps 1, 2, 3
     checker ... Answer · Map · Signals · Study · Notebook · Notes
     research .. New ideas · On paper · Dismissed · Ask · Notes. Each idea is drawn against random entries
     analysis .. Headline · Money · Where · When · Trades · Notes. The filters ride along on every station
     report .... Verdict · Ranking · Charts · Fleet · Live seat · Notes
     bot ....... Result · Trades · Decisions · Markets · Settings · Notes, for every strategy bot
     permissions ... Blocked · Allowed · Rules · Notes

   This file DRAWS and ARRANGES only. Every control is still Classic's own element inside the page
   body the studio moved here (BotStudio.embed): a station is made by showing and hiding those
   elements (a data attribute and a class, read by the stylesheet), never by copying or re-wiring
   them. On the two scanners, which have no money function at all, a list of choices is drawn as chips
   that set the page's own field (see seg below). Nothing here calls a function that arms a bot, changes a limit, or sends, closes or changes
   an order, paper or real. */
'use strict';
const LiveDeck = window.LiveDeck = {
  page: '', st: '', on: false, timer: 0, _sig: '',
  PAGES: {
    live: { key: 'astra_deck', eyebrow: 'THE LIVE DESK', seq: ['link', 'money', 'exits', 'bots', 'arm'], css: true, stations: [
      { id: 'link', n: 'Link', icon: '🔌', title: 'Link to your account', text: 'ASTRA only reads your account until the live bridge is running and you have entered its code. Closing that window stops live trading at once.' },
      { id: 'money', n: 'Money', icon: '💰', title: 'Bot money', text: 'How much of your balance the bots may use, what one trade may risk, and what that money can really afford.' },
      { id: 'exits', n: 'Exits', icon: '🎯', title: 'Exit rules', text: 'How every real trade of the desk is closed.' },
      { id: 'bots', n: 'Bots', icon: '🤖', title: 'Which bots, and where', text: 'The bots that may trade with real money, and where each one may trade.' },
      { id: 'arm', n: 'Arm', icon: '🛡️', title: 'Arm the desk', text: 'Arming starts in shadow: orders are recorded, not sent. Real money has its own typed confirmation.' },
      { id: 'watch', n: 'Watch', icon: '📈', title: 'What is happening', text: 'The desk’s pulse, your real open trades, and how each bot has done with real money.' },
      { id: 'records', n: 'Records', icon: '📜', title: 'Records', text: 'Everything the desk did and refused, and your notes.' } ] },
    manual: { key: 'astra_deck_manual', eyebrow: 'YOUR PAPER DESK · PLAY MONEY', stations: [
      { id: 'ticket', n: 'Ticket', icon: '🎫', title: 'The order ticket', text: 'Place a paper trade: choose the instrument and the side, size it, set its stop and its target. The slip on the right shows what it would cost and what it could win or lose.', parts: ['ticket', 'help'] },
      { id: 'rules', n: 'Rules', icon: '📏', title: 'Your trading rules', text: 'The limits every paper trade of yours has to respect.', parts: ['rules'] },
      { id: 'auto', n: 'Auto', icon: '⚙️', title: 'Automatic entries', text: 'Entries the paper account may take by itself.', parts: ['auto'] },
      { id: 'orders', n: 'Orders', icon: '⏳', title: 'Waiting and open', text: 'Your waiting entry orders and the paper trades that are open now.', parts: ['pending', 'positions'] },
      { id: 'results', n: 'Results', icon: '📊', title: 'How you have done', text: 'Your numbers, the running result and every closed paper trade.', parts: ['stats'], sel: ['.botGrid'], rest: true },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes and the paper / real switch', text: 'Your notes on this desk, and the way over to the real-money ticket.', parts: ['notes', 'links'] } ] },
    open: { key: 'astra_deck_open', eyebrow: 'OPEN TRADES', focus: { card: '.otCard', key: 'ot', head: '.otHead', skip: '.wsPriceRail' }, stations: [
      { id: 'trades', n: 'Trades', icon: '🃏', title: 'Every open trade', text: 'One card a trade: what it is, where the price stands between its stop and its target, and what it is worth now. Press a card to open its controls: stop and target, trailing stop, reduce or close.', parts: ['sort', 'filter', 'list'], rest: true },
      { id: 'summary', n: 'Summary', icon: '📋', title: 'The summary', text: 'The numbers of everything open, every trade on one line, and the real positions on your account.', parts: ['stats', 'table', 'real'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on this page and how adjusting a bot’s trade works.', parts: ['notes', 'intro', 'note'] } ] },
    scanner: { key: 'astra_deck_scanner', eyebrow: 'MARKET SCANNER', dress: 'dressScanner', focus: { card: '.scTable tr[data-sym]', key: 'sym', head: 'td:not(.dkMore)' }, stations: [
      { id: 'setups', n: 'Setups', icon: '⚡', title: 'Ready now', text: 'Every instrument that passes all of the scanner’s checks at this moment, one tile each. Press a tile for every check behind its score. The scanner ranks and explains; it never opens a trade.', parts: ['controls', 'active'] },
      { id: 'watching', n: 'Watching', icon: '👁', title: 'Not ready yet', text: 'Everything else it looked at, highest score first (the page lists the top 60). Press a tile to see which checks it passed and which it is still missing.', parts: ['controls', 'watching'], rest: true },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on the scanner.', parts: ['notes', 'note'] } ] },
    confluenceScanner: { key: 'astra_deck_cfs', eyebrow: 'CONFLUENCE SCANNER', dress: 'dressConfluence', focus: { card: '#cfScanRows tr[data-dkk]', key: 'dkk', head: 'td:not(.dkMore)' }, stations: [
      { id: 'board', n: 'Board', icon: '🧲', title: 'Every instrument, five checks', text: 'One tile an instrument: its signal, the five checks as five bars, its state and what it is waiting for. Press a tile for the reading behind each check.', parts: ['controls', 'status', 'find', 'table'], rest: true },
      { id: 'rules', n: 'Rules', icon: '📐', title: 'How it scans and ranks', text: 'What the scanner reads, how often, and how it orders what it finds.', parts: ['explain'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on this scanner.', parts: ['notes'] } ] },
    brain: { key: 'astra_deck_brain', eyebrow: 'MASTER BRAIN', dress: 'dressBrain', stations: [
      { id: 'teach', n: 'Teach', icon: '🎓', title: 'Feed it and train it', text: 'Where it stands, what it has to learn from, and the buttons that teach it. It can only refuse or shrink a paper trade; it never invents one.', parts: ['state', 'controls', 'needs', 'counts', 'coverage'], rest: true },
      { id: 'report', n: 'Report', icon: '🎯', title: 'Its honest score', text: 'How it did on trades it had never seen, whether its percentages mean anything, and what it has learned to weigh.', parts: ['score', 'calib', 'weights', 'log', 'warn'], empty: 'It has not been trained yet, so there is no score to show. It needs enough finished trades first; then press Train now in the Teach station.' },
      { id: 'lab', n: 'Lab', icon: '🧪', title: 'The Strategy Lab', text: 'The bots the brain built itself. Each one was tested across several instruments, published only if it cleared every guard, and is retired when it stops holding up.', parts: ['lab'], empty: 'The lab opens once the brain has been trained.' },
      { id: 'auto', n: 'Autopilot', icon: '⏰', title: 'What runs by itself', text: 'The schedule for measuring, retraining and researching, and where the brain stands between a signal and real money. Arming a bot for real money is never automatic.', parts: ['auto', 'live'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on the brain.', parts: ['notes'] } ] },
    fit: { key: 'astra_deck_fit', eyebrow: 'MARKET FIT', stations: [
      { id: 'study', n: 'Study', icon: '🔬', title: 'Run the study', text: 'Three steps, in order: measure every strategy on every market and timeframe, test the winners again on each half of the history, then point the bots at what held up.', sel: ['.fitWrap > .botCtl', '.fitWrap > .lvBanner', '.fitWrap > .botNote.warn'] },
      { id: 'markets', n: 'Markets', icon: '🌍', title: 'Market by market', text: 'One card a market: which strategy held up there, or how close the best one came.', sel: ['.fitWrap > .fitCards'] },
      { id: 'plan', n: 'Plan', icon: '🧭', title: 'What applying would change', text: 'Read this before pressing Apply to the bots: which bots it would point where, and which it would pause.', sel: ['.fitWrap > .botH:has(+ .botNote + .fitPlan)', '.fitWrap > .botNote:has(+ .fitPlan)', '.fitWrap > .fitPlan'], empty: 'There is no plan yet. Run the whole grid first, in the Study station.' },
      { id: 'table', n: 'Table', icon: '☰', title: 'Every combination', text: 'Every strategy on every market and timeframe it was measured on. Press a heading to sort.', sel: ['.fitWrap > .botH:has(+ .dashScroll:not(.short))', '.fitWrap > .dashScroll:not(.short)'] },
      { id: 'history', n: 'History', icon: '🕘', title: 'Study after study', text: 'The same combination measured on different days. What keeps holding is worth more than one good figure.', sel: ['.fitWrap > .botH:has(+ .botNote + .dashScroll.short)', '.fitWrap > .botNote:has(+ .dashScroll.short)', '.fitWrap > .dashScroll.short', '.fitWrap > .botNote:not(.warn):has(+ .botH + .dashScroll:not(.short))'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on this study.', sel: ['.bnWrap'] } ] },
    checker: { key: 'astra_deck_checker', eyebrow: 'STRATEGY CHECKER', watch: true, stations: [
      { id: 'answer', n: 'Answer', icon: '🏆', title: 'What the history says', text: 'For the view you are in: how often the target came before the stop, what one signal was worth after costs, and the best measured signals with the target and stop that suit them. A measured history is a probability, not a promise.', parts: ['crumbs', 'controls', 'hero', 'recs', 'now'] },
      { id: 'map', n: 'Map', icon: '🎯', title: 'Target and stop', text: 'Every target against every stop, and how far price usually runs after a signal. Press a cell to use that pair on the whole page.', parts: ['crumbs', 'controls', 'grid', 'reach'] },
      { id: 'signals', n: 'Signals', icon: '📋', title: 'Every signal, and smaller views', text: 'All signals ranked against random entries. Open a smaller view by market, pair, timeframe, side, hour or weekday to see where a signal really works.', parts: ['crumbs', 'board', 'splits'] },
      { id: 'study', n: 'Study', icon: '🧠', title: 'The brain that measures', text: 'It replays the history pair by pair and timeframe by timeframe. Pause it, speed it up, or choose which markets it studies.', parts: ['status'], rest: true },
      { id: 'notebook', n: 'Notebook', icon: '📓', title: 'Its notebook and its bots', text: 'The mixes of signals it tried and kept, the paper bots made from findings, and the library of every signal it knows.', parts: ['brain', 'botsMade', 'lib'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on the checker.', parts: ['notes'] } ] },
    research: { key: 'astra_deck_research', eyebrow: 'RESEARCH', tag: 'tagResearch', dress: 'dressResearch', stations: [
      { id: 'ideas', n: 'New ideas', icon: '💡', title: 'Ideas waiting for your decision', text: 'Each idea with the evidence it was found on, next to what random entries did on the same markets over the same period. Add one as a paper bot, or dismiss it. Real money only ever goes through the Live desk and its gates.', empty: 'No new idea is waiting.' },
      { id: 'added', n: 'On paper', icon: '🤖', title: 'Added as paper bots', text: 'The ideas you added. Each runs as an ordinary paper bot; open it, or take it out of your bots.', empty: 'You have not added an idea as a paper bot yet.' },
      { id: 'gone', n: 'Dismissed', icon: '🗂', title: 'Dismissed', text: 'Ideas you put away. Bring one back whenever you like.', empty: 'Nothing has been dismissed.' },
      { id: 'how', n: 'Ask', icon: '💬', title: 'How to ask for a research run', text: 'Where these ideas come from, and the prompt that starts a new research run.' },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on research.' } ] },
    analysis: { key: 'astra_deck_analysis', eyebrow: 'BUY / SELL ANALYSIS', watch: true, dress: 'dressAnalysis', stations: [
      { id: 'headline', n: 'Headline', icon: '◈', title: 'Buying against selling', text: 'The verdict in one line, then the BUY card and the SELL card. Press any card, row or figure to look only at those trades; every part narrows together.', parts: ['filters', 'hero', 'scope', 'notices', 'sides'], rest: true },
      { id: 'money', n: 'Money', icon: '▥', title: 'Where the money came from', text: 'What each side won and gave back, how the result built up over time, and the full comparison line by line.', parts: ['filters', 'money', 'time', 'compare'] },
      { id: 'where', n: 'Where', icon: '◎', title: 'Which instruments, timeframes and bots', text: 'The same result split by instrument, by timeframe and by bot account.', parts: ['filters', 'instruments', 'tf', 'bots'] },
      { id: 'when', n: 'When', icon: '⏱', title: 'When the trades happened', text: 'By session, weekday, hour and how long a trade was held.', parts: ['filters', 'when'] },
      { id: 'trades', n: 'Trades', icon: '☷', title: 'Every completed trade', text: 'The list behind every figure on this page.', parts: ['filters', 'log', 'updated'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on this analysis.', parts: ['notes'] } ] },
    report: { key: 'astra_deck_report', eyebrow: 'PERFORMANCE REPORT', watch: true, stations: [
      { id: 'verdict', n: 'Verdict', icon: '🏆', title: 'Where the fleet stands', text: 'The numbers of every bot together and the best on the evidence so far. Test every bot, or take the report out as Excel or PDF. This page decides nothing by itself and cannot trade.', parts: ['head', 'intro', 'disclaimer', 'kpis', 'best'], rest: true },
      { id: 'ranking', n: 'Ranking', icon: '☰', title: 'Which bot would you trust?', text: 'Every bot ranked on the evidence it has produced.', parts: ['ranking'] },
      { id: 'charts', n: 'Charts', icon: '📈', title: 'The pictures', text: 'Profit and loss by bot, win rate, the equity curves and how trades finished.', parts: ['pnl', 'winrate', 'curves', 'rmult'] },
      { id: 'fleet', n: 'Fleet', icon: '🌍', title: 'Where it earns, and the lab', text: 'Which markets the fleet earns on, and what the lab has been doing.', parts: ['earns', 'lab'] },
      { id: 'seat', n: 'Live seat', icon: '✅', title: 'The six conditions for a live seat', text: 'What a bot has to show before it is even considered for real money. Passing them arms nothing: real money only goes through the Live desk and its gates.', parts: ['conditions'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on the report.', parts: ['notes'] } ] },
    /* one layout for every strategy bot: the studio shows whichever bot is picked (LiveDeck.botId) */
    bot: { key: 'astra_deck_bot', eyebrow: 'PAPER BOT', focus: { card: '.otCard', key: 'ot', head: '.otHead', skip: '.wsPriceRail' }, stations: [
      { id: 'result', n: 'Result', icon: '◎', title: 'What it has made, and what is open', text: 'Its net result, its open paper trades as cards (press one for its stop, target, trailing stop and close), its numbers and its equity curve.', parts: ['result', 'stats', 'equity'], rest: true },
      { id: 'trades', n: 'Trades', icon: '🕘', title: 'Closed trades, day by day', text: 'Every paper trade it has finished, and its result for each day.', parts: ['history', 'daily'], empty: 'It has not finished a trade yet.' },
      { id: 'why', n: 'Decisions', icon: '🔎', title: 'Why it acted, and what it learned', text: 'Each decision it took or refused with its reason, and the lessons it drew from its losses.', parts: ['decisions', 'lessons'], empty: 'It has not taken a decision yet.' },
      { id: 'markets', n: 'Markets', icon: '🌍', title: 'Where it may trade', text: 'The markets and pairs this bot may open paper trades on.', parts: ['markets', 'scanner'] },
      { id: 'settings', n: 'Settings', icon: '⚙️', title: 'How it runs', text: 'Its timeframes, score and limits, Run now, Pause and Reset, and its backtest.', parts: ['controls', 'backtest', 'buttons', 'rules', 'status'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on this bot.', parts: ['notes'] } ] },
    permissions: { key: 'astra_deck_perm', eyebrow: 'INSTRUMENT PERMISSIONS', watch: true, stations: [
      { id: 'blocked', n: 'Blocked', icon: '⛔', title: 'Pairs that may not open new trades', text: 'New entries are refused on these pairs across the bots. Allow one again whenever you like.', parts: ['search', 'columns'], rest: true },
      { id: 'allowed', n: 'Allowed', icon: '✅', title: 'Pairs that may trade', text: 'These pairs may open new trades; every other risk limit still applies. Block one from here.', parts: ['search', 'columns'] },
      { id: 'rules', n: 'Rules', icon: '⚙️', title: 'How blocking works', text: 'Automatic blocking on or off, and the rule it uses.', parts: ['tools', 'note'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on permissions.', parts: ['notes'] } ] },
  },
  sel: {},
  esc(s){ return TmSettings.esc(s); },
  body(){ const b = document.getElementById('botBody'), h = document.getElementById('suFullHost'); return b && h && h.contains(b) ? b : null; },
  head(){ return document.querySelector('#suFull .suFullH'); },
  cfg(){ return this.PAGES[this.page] || null; },

  /* called by the studio each time it shows a page */
  isBot(id){ try { const b = typeof BOT_BY_ID !== 'undefined' ? BOT_BY_ID[id] : null; return !!b && typeof BotLayout !== 'undefined' && id !== 'manual' && (BotLayout.applies(b) || id === 'confluence'); } catch(e){ return false; } },
  sync(id){ const k = id !== 'bot' && this.PAGES[id] ? id : this.isBot(id) ? 'bot' : ''; this.botId = id; if (k) this.mount(k); else this.unmount(); },
  mount(id){ const b = this.body(), h = this.head(), C = this.PAGES[id]; if (!b || !h || !C) return; if (this.on && this.page !== id) this.unmount(); this.page = id; this.st = C.stations[0].id; try { const s = localStorage.getItem(C.key); if (s && (s === 'all' || C.stations.some(x => x.id === s))) this.st = s; } catch(e){}
    if (!h.dataset.plain) h.dataset.plain = h.innerHTML; h.classList.add('dkHead'); this.on = true; this._sig = ''; b.dataset.deck = this.st; b.dataset.deckpage = id;
    if (!h._dk){ h._dk = true; h.addEventListener('click', e => { const n = e.target.closest('[data-dk]'); if (n && this.on) this.set(n.dataset.dk); }); }
    if (!this._doc){ this._doc = true;
      /* the live desk's own "Next step" button and gate chips lead to a station too */
      document.addEventListener('click', e => { if (!this.on || this.page !== 'live' || !e.target.closest) return; const nx = e.target.closest('#suFullHost .ldNextStep, #suFullHost .ldGate, #suFullHost .ldGatesMini button'); if (!nx) return; const key = nx.dataset.ldgate || (((this.body() || document).querySelector('.ldGate.next') || {}).dataset || {}).ldgate; if (key) setTimeout(() => this.set(key === 'arm' || key === 'live' ? 'arm' : 'link'), 60); });
      /* a wall of cards: press one (not one of its controls) and it opens wide; press its top again to put it back */
      document.addEventListener('click', e => { const C = this.cfg(); if (!this.on || !C || !C.focus || !e.target.closest) return; const card = e.target.closest('#suFullHost ' + C.focus.card); if (!card) return; const open = card.classList.contains('dkSel');
        if (e.target.closest('button, input, select, textarea, a, label')) return;   /* a control keeps its own job */
        if (open && C.focus.head && !e.target.closest(C.focus.head)) return;          /* an open card closes from its top or its summary only */
        if (!open && C.focus.skip && e.target.closest(C.focus.skip)) return;          /* dragging a level is not a press */
        this.sel[this.page] = open ? '' : card.dataset[C.focus.key]; this.applyFocus(); const b0 = () => this.body();
        if (!open) setTimeout(() => { const c = this.body() && this.body().querySelector(C.focus.card + '.dkSel'), m = document.getElementById('suMain'), h = this.head(); if (!c || !m) return; let box = c.parentElement; while (box && box !== b0() && !(box.scrollHeight > box.clientHeight + 4 && /auto|scroll/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
          if (box && box !== b0()) box.scrollTop += c.getBoundingClientRect().top - box.getBoundingClientRect().top - 6; else m.scrollTop = c.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - (h ? h.offsetHeight : 0) - 16; }, 40); });
      /* Classic draws its page again from time to time: the stations are put back on it at once */
      if (typeof Bots !== 'undefined' && !Bots._dkWrapped){ Bots._dkWrapped = true; const o = Bots.render.bind(Bots); Bots.render = (...a) => { const r = o(...a); try { if (this.on && this.body()) this.apply(); } catch(e){} return r; }; } }
    if ((C.focus || C.watch) && !b._dkMo){ b._dkMo = new MutationObserver(() => { if (!this.on || !this.body()) return; const n = Date.now(); if (n - (this._moAt || 0) > 1000){ this._moAt = n; this._moN = 0; } if (++this._moN <= 6){ this.apply(); return; } if (!this._moT) this._moT = setTimeout(() => { this._moT = 0; if (this.on && this.body()) this.apply(); }, 120); }); b._dkMo.observe(b, { childList: true, subtree: true }); }
    if (!h._ro && 'ResizeObserver' in window){ h._ro = new ResizeObserver(() => this.measure()); h._ro.observe(h); }
    this.paint(); this.fresh(); clearInterval(this.timer); this.timer = setInterval(() => { if (this.on && this.body() && !document.hidden) this.paint(); else if (this.on && !this.body()) this.unmount(); }, 1500); },
  unmount(){ clearInterval(this.timer); const h = this.head(), b = document.getElementById('botBody'); if (b){ delete b.dataset.deck; delete b.dataset.deckpage; b.querySelectorAll('[data-dkst]').forEach(el => { delete el.dataset.dkst; el.classList.remove('dkOn'); }); b.querySelectorAll('.dkAdd').forEach(el => el.remove()); b.querySelectorAll('.dkHid, .dkSel').forEach(el => el.classList.remove('dkHid', 'dkSel')); b.querySelectorAll('[data-dkk]').forEach(el => { delete el.dataset.dkk; }); b.querySelectorAll('[data-dkb]').forEach(el => { delete el.dataset.dkb; }); b.classList.remove('dkFresh'); } if (h && h.dataset.plain != null){ h.innerHTML = h.dataset.plain; h.classList.remove('dkHead'); } this.on = false; this.page = ''; },
  set(id){ const C = this.cfg(); if (!C) return; this.st = id; try { localStorage.setItem(C.key, id); } catch(e){} this._sig = ''; this.paint(); this.fresh(); const f = document.getElementById('suFull'); if (f) TmSettings.scrollTo(document.getElementById('suMain'), f); },

  /* the tiles of a station rise once when it opens, not each time the page redraws itself */
  fresh(){ const b = this.body(); if (!b) return; b.classList.remove('dkFresh'); void b.offsetWidth; b.classList.add('dkFresh'); clearTimeout(this._fr); this._fr = setTimeout(() => b.classList.remove('dkFresh'), 1100); },

  /* which of the page's own parts belong to which station (pages laid out by BotLayout parts; a part may sit in several) */
  apply(){ const b = this.body(), C = this.cfg(); if (!b || !C) return; if (b.dataset.deck !== this.st) b.dataset.deck = this.st; if (b.dataset.deckpage !== this.page) b.dataset.deckpage = this.page; if (C.css) return;
    const rest = (C.stations.find(s => s.rest) || C.stations[C.stations.length - 1]).id, parts = [...b.querySelectorAll('.blPart[data-blpart], .blCell[data-blpart], .blGridFold[data-blpart]')].filter(p => !p.parentElement.closest('.blPart, .blCell, .blGridFold'));
    for (const p of parts){ const v = C.stations.filter(x => (x.parts || []).includes(p.dataset.blpart)).map(x => x.id).join(' ') || rest; if (p.dataset.dkst !== v) p.dataset.dkst = v; }
    for (const s of C.stations) for (const q of s.sel || []) b.querySelectorAll(q).forEach(el => { if (!el.closest('.blPart')) el.dataset.dkst = s.id; });
    if (C.tag){ try { this[C.tag](b); } catch(e){ console.warn('deck tag', e); } }
    b.querySelectorAll('[data-dkst]').forEach(el => { const on = this.st === 'all' || el.dataset.dkst.split(' ').includes(this.st); if (el.classList.contains('dkOn') !== on) el.classList.toggle('dkOn', on); }); if (C.dress){ try { this[C.dress](b); } catch(e){ console.warn('deck dress', e); } } this.emptyNote(b, C); this.applyFocus(); },
  applyFocus(){ const b = this.body(), C = this.cfg(); if (!b || !C || !C.focus) return; const k = this.sel[this.page] || ''; b.querySelectorAll(C.focus.card).forEach(c => { const on = !!k && c.dataset[C.focus.key] === k; if (c.classList.contains('dkSel') !== on) c.classList.toggle('dkSel', on); }); },

  /* ---------- dressing a page's own rows ----------
     A row of the page's table is drawn as a tile. What the stylesheet cannot work out by itself is read from the scan
     (never written) and hung on the row: its side, a score to draw as a ring, and one extra cell with the checks
     behind it. Everything added carries the class dkAdd and is taken off again when the page leaves the studio. */
  cell(cls, html){ const td = document.createElement('td'); td.className = cls + ' dkAdd'; td.innerHTML = html; return td; },
  gauge(label, val, pct, unit){ return Number.isFinite(val) ? '<span><label>' + label + '</label><b>' + (+val.toFixed(2)) + (unit || '') + '</b><i><u style="--w:' + Math.max(3, Math.min(100, pct)).toFixed(0) + '%"></u></i></span>' : ''; },
  /* a short list of choices drawn as chips. A press sets the page's own field and fires that field's own change event,
     exactly as choosing from the list would. Used on the two scanners only (which timeframe, which rows to show):
     never on a page that can arm a bot, change a limit or touch an order. */
  seg(sel){ if (!sel || sel.classList.contains('dkHid')) return; const seg = document.createElement('span'); seg.className = 'dkSeg dkAdd'; seg.innerHTML = [...sel.options].map(o => '<button type="button" class="' + (o.selected ? 'on' : '') + '" data-v="' + this.esc(o.value) + '">' + this.esc(o.textContent) + '</button>').join('');
    seg.addEventListener('click', e => { const t = e.target.closest('[data-v]'); if (!t || sel.value === t.dataset.v) return; sel.value = t.dataset.v; seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === t)); sel.dispatchEvent(new Event('change', { bubbles: true })); }); sel.after(seg); sel.classList.add('dkHid'); },
  dressScanner(b){ const rows = (typeof Bots !== 'undefined' && Bots.scan && Bots.scan.rows) || []; let by = null, i = 0;
    b.querySelectorAll('.scTable tr[data-sym]').forEach(tr => { const n = i++; if (tr.querySelector('.dkMore')) return; by = by || new Map(rows.map(r => [r.sym, r])); const r = by.get(tr.dataset.sym); if (!r) return; const m = r.meta || {};
      tr.style.setProperty('--sc', Math.max(0, Math.min(100, r.score || 0)).toFixed(0)); tr.style.setProperty('--i', n); tr.classList.add(r.dir > 0 ? 'dkB' : r.dir < 0 ? 'dkS' : 'dkN'); if (r.active) tr.classList.add('dkAct');
      tr.appendChild(this.cell('dkMore', '<div class="dkGauges">' + this.gauge('RSI', m.rsi, m.rsi) + this.gauge('ADX', m.adx, m.adx * 2) + this.gauge('VOLUME', m.volRatio, m.volRatio * 50, '×') + this.gauge('ATR', m.atrPct, m.atrPct / 3 * 100, '%') + '</div><ul class="dkChecks">' + (r.reasons || []).map(x => '<li class="ok">' + this.esc(x) + '</li>').join('') + (r.failed || []).map(x => '<li class="no">' + this.esc(x) + '</li>').join('') + '</ul>')); });
    const ctl = b.querySelector('.blPart[data-blpart="controls"] .botCtl'); if (!ctl || ctl.querySelector('.dkAdd')) return;
    this.seg(ctl.querySelector('select[data-cfg="tf"]'));
    /* the minimum score as a slider beside its own number field: letting go of it is the same as typing the number */
    const num = ctl.querySelector('input[data-cfg="minScore"]'); if (num){ const rg = document.createElement('input'); rg.type = 'range'; rg.min = 0; rg.max = 100; rg.step = 1; rg.value = num.value; rg.className = 'dkRange dkAdd'; rg.setAttribute('aria-label', 'Minimum score'); rg.style.setProperty('--v', num.value + '%');
      rg.addEventListener('input', () => { num.value = rg.value; rg.style.setProperty('--v', rg.value + '%'); }); rg.addEventListener('change', () => { num.value = rg.value; num.dispatchEvent(new Event('change', { bubbles: true })); }); num.before(rg); } },
  dressConfluence(b){ const S = typeof ConfluenceScanner !== 'undefined' ? ConfluenceScanner : null; if (!S) return; let by = null, i = 0;
    b.querySelectorAll('#cfScanRows tr').forEach(tr => { const n = i++; if (tr.dataset.dkk) return; const btn = tr.querySelector('[data-cf-pair]'); if (!btn) return; by = by || new Map((S.rows || []).map(r => [r.sym, r])); const r = by.get(btn.dataset.cfPair); tr.dataset.dkk = btn.dataset.cfPair; tr.style.setProperty('--i', n); if (!r) return; const sg = r.signal || {}, ck = sg.checks || [];
      tr.classList.add(sg.dir > 0 ? 'dkB' : sg.dir < 0 ? 'dkS' : 'dkN', 'dkSt' + String(r.status || '').replace(/[^A-Z]/g, '')); if (!sg.dir) tr.classList.add('dkNoLv');
      tr.appendChild(this.cell('dkPips', ck.map(x => '<i class="' + (x.ok ? 'ok' : 'no') + '" title="' + this.esc(x.name + ': ' + x.value) + '"></i>').join('')));
      tr.appendChild(this.cell('dkMore', (ck.length ? '<ul class="dkChecks five">' + ck.map(x => '<li class="' + (x.ok ? 'ok' : 'no') + '"><b>' + this.esc(x.name) + '</b><span>' + this.esc(x.value) + '</span></li>').join('') + '</ul>' : '<div class="dkNone">No reading came for this instrument on the last scan.</div>') +
        '<div class="dkGauges">' + this.gauge('ADX', r.adx, r.adx * 2) + this.gauge('SCORE', sg.score, sg.score) + this.gauge('COST ÷ ATR', r.costRatio, r.costRatio * 200) + '</div>')); });
    this.seg(b.querySelector('#cfScanFilter'));
    /* the long explanation, one line a rule */
    const ex = b.querySelector('.blPart[data-blpart="explain"] .botNote'); if (ex && !ex.classList.contains('dkHid')){ const ul = document.createElement('ul'); ul.className = 'dkRules dkAdd'; ul.innerHTML = (ex.textContent || '').split(/(?<=\.)\s+/).map(x => x.trim()).filter(Boolean).map(x => '<li>' + this.esc(x) + '</li>').join(''); ex.after(ul); ex.classList.add('dkHid'); } },

  /* Master Brain's report: a band on each calibration row (what it predicted, where those trades really landed) and a
     bar on each weight. Read from the trained model, never written. */
  dressBrain(b){ let S = null; try { S = MasterBrain.state || MasterBrain.load(); } catch(e){ return; } const m = S && S.metrics; if (!m) return;
    const add = (row, cls, html, title) => { if (!row || row.querySelector('.dkAdd')) return; const el = document.createElement('i'); el.className = cls + ' dkAdd'; if (title) el.title = title; el.innerHTML = html; row.appendChild(el); };
    const cal = b.querySelectorAll('[data-blpart="calib"] .botRow'); (m.calib || []).forEach((c, i) => add(cal[i], 'dkCal', '<u style="left:' + (c.lo * 100).toFixed(0) + '%;width:' + ((c.hi - c.lo) * 100).toFixed(0) + '%"></u>' + (c.actual != null ? '<em style="left:' + Math.max(0, Math.min(100, c.actual)).toFixed(0) + '%"></em>' : ''), 'The band is what it predicted; the mark is how often those trades really won'));
    let tw = []; try { tw = MasterBrain.topWeights(12) || []; } catch(e){} const mw = Math.max(1e-9, ...tw.map(x => Math.abs(x.w))), wr = b.querySelectorAll('[data-blpart="weights"] .botRow');
    tw.forEach((x, i) => add(wr[i], 'dkWt', '<u class="' + (x.w > 0 ? 'up' : 'dn') + '" style="--w:' + (Math.abs(x.w) / mw * 50).toFixed(1) + '%"></u>')); },
  /* a station with nothing in it yet says so, instead of showing an empty page */
  emptyNote(b, C){ const s = C.stations.find(x => x.id === this.st), none = !!s && !b.querySelector('[data-dkst].dkOn'); let el = b.querySelector(':scope > .dkEmpty'); if (!none){ if (el) el.remove(); return; }
    const t = s.empty || 'Nothing to show here yet.'; if (!el){ el = document.createElement('div'); el.className = 'dkEmpty dkAdd'; b.appendChild(el); } if (el.dataset.t !== s.id + t){ el.dataset.t = s.id + t; el.innerHTML = '<i>' + s.icon + '</i><b>' + this.esc(s.title) + '</b><span>' + this.esc(t) + '</span>'; } },

  /* Research is one long page without named parts: its pieces are sorted into stations by what they are */
  tagResearch(b){ const pg = b.querySelector('.rsxPage'); if (!pg) return; let cur = 'ideas'; const set = (el, v) => { if (el.dataset.dkst !== v) el.dataset.dkst = v; }, open = el => { if (this.st !== 'all' && !el.open) el.open = true; };
    for (const el of pg.children){ if (el.matches('h3.rsxH')){ cur = /^new/i.test((el.textContent || '').trim()) ? 'ideas' : 'added'; set(el, cur); } else if (el.matches('.rsxList')) set(el, cur); else if (el.matches('.botStats, .rsxEmpty')) set(el, 'ideas'); else if (el.matches('.rsxGone')){ set(el, 'gone'); open(el); } else if (el.matches('.rsxHow')){ set(el, 'how'); open(el); } else if (el.matches('.rsxIntro')) set(el, 'how'); }
    const n = b.querySelector(':scope > .bnWrap'); if (n) set(n, 'notes'); },
  /* each idea gets its picture: its profit factor beside what random entries made, with the break-even line */
  dressResearch(b){ if (typeof Research === 'undefined') return; let by = null;
    b.querySelectorAll('.rsxCard[data-rsx]').forEach(card => { if (card.querySelector('.dkVs')) return; by = by || new Map(Research.all().map(c => [c.id, c])); const c = by.get(card.dataset.rsx), nums = card.querySelector('.rsxNums'); if (!c || !nums) return;
      const e = c.evidence || {}, r = e.random || {}, fin = v => Number.isFinite(v) ? v : 0, mx = Math.max(1.5, fin(e.pf), fin(r.pf)), bar = (l, v, k) => '<div class="pgPf"><span>' + l + '</span><i><u class="' + k + '" style="--w:' + (v === Infinity ? 100 : Math.max(0, fin(v)) / mx * 100).toFixed(1) + '%"></u><s style="left:' + (1 / mx * 100).toFixed(1) + '%"></s></i><b>' + (v === Infinity ? '∞' : v != null ? (+v).toFixed(2) : '–') + '</b></div>';
      const el = document.createElement('div'); el.className = 'dkVs dkAdd'; el.innerHTML = bar('this idea', e.pf, 'up') + bar('random entries', r.pf, 'gr') + '<small>profit factor: money won ÷ money lost · the line is 1.0, break-even</small>'; nums.after(el); }); },
  /* bring one thing on the page into view and light it up for a moment */
  flash(sel){ const b = this.body(), c = b && b.querySelector(sel), m = document.getElementById('suMain'), h = this.head(); if (!c || !m) return; m.scrollTop = c.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - (h ? h.offsetHeight : 0) - 16; c.classList.remove('dkFlash'); void c.offsetWidth; c.classList.add('dkFlash'); setTimeout(() => c.classList.remove('dkFlash'), 1900); },

  /* Buy against sell, measure by measure: each row of the comparison gets the size of its two figures, and the
     stylesheet draws them as two bars growing away from the measure's name. The figures themselves are untouched. */
  dressAnalysis(b){ const num = t => { const m = String(t || '').replace(/[,\s]/g, '').replace('−', '-').match(/-?\d+(\.\d+)?/); return m ? Math.abs(parseFloat(m[0])) : null; };
    b.querySelectorAll('[data-blpart="compare"] .anTable tbody tr').forEach(tr => { if (tr.dataset.dkb) return; const td = tr.querySelectorAll('td'); if (td.length < 2) return; const x = num(td[0].textContent), y = num(td[1].textContent), mx = Math.max(x || 0, y || 0); tr.dataset.dkb = '1'; tr.style.setProperty('--b', mx ? ((x || 0) / mx).toFixed(3) : '0'); tr.style.setProperty('--s', mx ? ((y || 0) / mx).toFixed(3) : '0'); }); },

  /* ---------- where each station stands: read, never written ---------- */
  facts(){ const f = { live: 'factsLive', manual: 'factsManual', open: 'factsOpen', scanner: 'factsScanner', confluenceScanner: 'factsConfluence', brain: 'factsBrain', fit: 'factsFit', checker: 'factsChecker', research: 'factsResearch', analysis: 'factsAnalysis', report: 'factsReport', bot: 'factsBot', permissions: 'factsPerm' }[this.page]; return f ? this[f]() : {}; },
  factsBot(){ const id = this.botId, b = this.body(); let L = {}, cfg = {}, name = ''; try { L = Bots.ledger(id) || {}; cfg = Bots.cfg(id) || {}; name = (BOT_BY_ID[id] || {}).name || ''; } catch(e){} const open = (L.open || []).length, closed = (L.closed || []).length, mk = b && b.querySelector('.mkCount');
    return { _label: name, result: { t: open + ' open · ' + closed + ' closed' }, trades: { t: closed + ' closed' }, why: { t: 'the reasons' }, markets: { t: mk ? ((mk.textContent || '').trim().match(/^\d+\s+\w+/) || [''])[0] : '' }, settings: { t: (cfg.paused ? 'paused' : 'running') + (cfg.tf ? ' · ' + cfg.tf : '') }, notes: { t: 'yours' } }; },
  factsPerm(){ const b = this.body(), n = i => b ? b.querySelectorAll('.prCols > .prCol:nth-child(' + i + ') .prCard').length : 0, tg = b && b.querySelector('[data-blpart="tools"] .bMini'), auto = tg ? /:\s*on/i.test(tg.textContent || '') : null;
    return { _label: auto == null ? '' : 'automatic blocking ' + (auto ? 'on' : 'off'), blocked: { t: n(1) + ' pair' + (n(1) === 1 ? '' : 's') }, allowed: { t: n(2) + ' pair' + (n(2) === 1 ? '' : 's') }, rules: { t: auto == null ? '' : 'automatic · ' + (auto ? 'on' : 'off') }, notes: { t: 'yours' } }; },
  /* both read what the page itself has drawn, so the rail always agrees with it */
  factsAnalysis(){ const b = this.body(), txt = s => { const e = b && b.querySelector(s); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; }, q = s => b ? b.querySelectorAll(s).length : 0, n = t => (t.match(/(\d[\d,]*)\s+completed/) || ['', ''])[1];
    const buy = n(txt('.anSide.buy')), sell = n(txt('.anSide.sell')), rows = q('[data-blpart="log"] tbody tr');
    return { _label: buy || sell ? ((+String(buy).replace(/,/g, '') || 0) + (+String(sell).replace(/,/g, '') || 0)) + ' completed trades' : '', headline: { t: buy || sell ? (buy || 0) + ' buys · ' + (sell || 0) + ' sells' : 'no trades yet' }, money: { t: 'won and gave back' }, where: { t: q('[data-blpart="instruments"] tbody tr') ? q('[data-blpart="instruments"] tbody tr') + ' instruments' : 'by instrument' }, when: { t: 'session · day · hour' }, trades: { t: rows ? rows + ' listed' : 'the list' }, notes: { t: 'yours' } }; },
  factsReport(){ const b = this.body(), q = s => b ? b.querySelectorAll(s).length : 0, bots = q('[data-blpart="ranking"] tbody tr');
    return { _label: bots ? bots + ' bots ranked' : '', verdict: { t: 'the numbers' }, ranking: { t: bots ? bots + ' bots' : 'no bot yet' }, charts: { t: 'four pictures' }, fleet: { t: 'markets and lab' }, seat: { t: 'six conditions' }, notes: { t: 'yours' } }; },
  factsChecker(){ let S = {}; try { S = Checker.load() || {}; } catch(e){} const b = this.body(), q = s => b ? b.querySelectorAll(s).length : 0, T = (typeof Checker !== 'undefined' && Checker.TH) || [], St = (typeof Checker !== 'undefined' && Checker.ST) || [], view = (S.path || []).length;
    return { _label: (S.on ? 'studying' : 'paused') + (view ? ' · inside ' + view + ' smaller view' + (view === 1 ? '' : 's') : ''), answer: { t: q('.ckRec') + ' recommendation' + (q('.ckRec') === 1 ? '' : 's') }, map: { t: T[S.t] != null && St[S.s] != null ? '+' + T[S.t] + '% / −' + St[S.s] + '%' : '' }, signals: { t: q('.ckRow') + ' ranked' }, study: { t: S.on ? 'studying' : 'paused' }, notebook: { t: q('.ckIdea') + ' mix' + (q('.ckIdea') === 1 ? '' : 'es') + ' kept' }, notes: { t: 'yours' } }; },
  factsResearch(){ let all = [], s = { added: {}, removed: {}, dismissed: {} }; try { all = Research.all(); s = Research.state(); } catch(e){} const gone = all.filter(c => s.dismissed[c.id]).length, added = all.filter(c => !s.dismissed[c.id] && s.added[c.id] && !s.removed[c.id]).length, fresh = all.length - gone - added;
    return { _label: all.length + ' idea' + (all.length === 1 ? '' : 's'), ideas: { t: fresh + ' to decide' }, added: { t: added + ' running' }, gone: { t: gone + ' put away' }, how: { t: 'the prompt' }, notes: { t: 'yours' } }; },
  factsBrain(){ let S = {}, label = ''; try { S = MasterBrain.state || MasterBrain.load(); label = String(MasterBrain.status().label || '').toLowerCase(); } catch(e){} const m = S.metrics, b = this.body(), n = (S.samples || []).length, tg = b && b.querySelector('[data-act="autotoggle"]'), lab = b ? b.querySelectorAll('.labCard').length : 0;
    return { _label: label, teach: { t: n + ' example' + (n === 1 ? '' : 's') }, report: { t: m && m.val ? m.val.acc.toFixed(0) + '% right on new trades' : 'not trained yet' }, lab: { t: m ? lab + ' bot' + (lab === 1 ? '' : 's') + ' published' : 'after training' }, auto: { t: tg ? (/off/i.test(tg.textContent) ? 'on' : 'off') : 'after training' }, notes: { t: 'yours' } }; },
  factsFit(){ const b = this.body(), q = s => b ? b.querySelectorAll(s).length : 0, txt = s => { const e = b && b.querySelector(s); return e ? (e.textContent || '').trim().replace(/\s+/g, ' ') : ''; };
    const rows = q('.fitWrap > .dashScroll:not(.short) tbody tr[class*="fit-"]'), held = (txt('.fitWrap > .lvBanner b').match(/^\d+/) || ['0'])[0], keep = q('.fitPlanCard.good'), stop = +((txt('.fitPlanCard.bad b').match(/^\d+/) || ['0'])[0]), hist = q('.fitWrap > .dashScroll.short tbody tr');
    return { _label: rows ? held + ' of ' + rows + ' held up' : 'not measured yet', study: { t: rows ? 'measured' : 'not run yet' }, markets: { t: q('.fitCard') + ' markets' }, plan: { t: keep || stop ? keep + ' to keep · ' + stop + ' to pause' : 'nothing yet' }, table: { t: rows + ' combination' + (rows === 1 ? '' : 's') }, history: { t: hist ? hist + ' tracked' : 'needs two studies' }, notes: { t: 'yours' } }; },
  factsScanner(){ const s = (typeof Bots !== 'undefined' && Bots.scan) || {}, rows = s.rows || [], act = rows.filter(r => r.active); let cfg = {}; try { cfg = Bots.cfg('scanner') || {}; } catch(e){}
    return { _label: s.busy ? 'scanning…' : rows.length ? (s.universe || rows.length) + ' instruments' + (cfg.tf ? ' · ' + cfg.tf : '') + (cfg.minScore != null ? ' · score ' + cfg.minScore + ' and up' : '') : 'not scanned yet',
      setups: { t: act.length ? act.filter(r => r.dir > 0).length + ' buy · ' + act.filter(r => r.dir < 0).length + ' sell' : 'none right now' }, watching: { t: (rows.length - act.length) + ' not ready' }, notes: { t: 'yours' } }; },
  factsConfluence(){ const S = typeof ConfluenceScanner !== 'undefined' ? ConfluenceScanner : { rows: [] }, rows = S.rows || [], n = k => rows.filter(r => r.status === k).length; let on = false; try { on = !!ConfluenceBot.config().scannerOn; } catch(e){}
    return { _label: (on ? 'automatic · on' : 'paused') + (S.pending ? ' · scanning ' + S.done + ' of ' + S.total : ''), board: { t: n('READY') + ' ready · ' + n('SETUP') + ' setup' + (n('SETUP') === 1 ? '' : 's') + ' · ' + rows.length + ' read' }, rules: { t: '15-minute chart' }, notes: { t: 'yours' } }; },
  factsOpen(){ let n = 0, fl = 0, up = 0; try { for (const p of Pages.openPaper()){ n++; fl += p.unreal || 0; if (p.unreal > 0) up++; } } catch(e){} let real = 0; try { real = (Pages._pos || []).length; } catch(e){}
    return { _label: n + ' open', trades: { t: up + ' ahead · ' + (n - up) + ' behind' }, summary: { t: 'floating ' + (fl >= 0 ? '+' : '−') + TmSettings.num(Math.abs(fl)) + (real ? ' · ' + real + ' real' : '') }, notes: { t: 'yours' } }; },
  factsLive(){ const b = this.body(), q = s => b && b.querySelector(s), txt = el => el ? (el.textContent || '').trim().replace(/\s+/g, ' ') : '', gate = k => { const g = q('.ldGate[data-ldgate="' + k + '"]'); return { on: !!g && g.classList.contains('on'), next: !!g && g.classList.contains('next'), s: txt(g && g.querySelector('span')) }; };
    const G = { bridge: gate('bridge'), code: gate('code'), arm: gate('arm'), live: gate('live') }; let armed = 0, audit = 0, status = { label: '' }; try { armed = Live.armedList().length; audit = (Live.state.audit || []).length; status = Live.status() || status; } catch(e){}
    const pool = txt(q('.ldPool b')), who = txt(q('.ldArmWho b')), noBot = /^no bot/i.test(who);
    return { _label: status.label,
      link: { done: G.bridge.on && G.code.on, next: G.bridge.next || G.code.next, t: !G.bridge.on ? (G.bridge.s || 'bridge not running') : !G.code.on ? 'enter the code' : 'linked' },
      money: { done: /[1-9]/.test(pool), t: pool ? pool + ' for the bots' : 'not set' },
      exits: { t: 'your rules' },
      bots: { done: !!who && !noBot, t: who ? (noBot ? 'none chosen' : who.slice(0, 26)) : 'choose them' },
      arm: { done: G.arm.on, next: G.arm.next || G.live.next, hot: G.live.on, t: G.live.on ? 'LIVE · real orders' : G.arm.on ? 'armed · shadow' : 'not armed' },
      watch: { t: armed ? armed + ' armed' : 'nothing armed' },
      records: { t: audit + ' entr' + (audit === 1 ? 'y' : 'ies') } }; },
  factsManual(){ let L = {}, wait = 0; try { L = Bots.ledger('manual') || {}; } catch(e){} try { if (typeof ManualOrders !== 'undefined') wait = ManualOrders.read().filter(o => ['waiting', 'processing', 'review'].includes(o.status)).length; } catch(e){}
    const b = this.body(), side = b && b.querySelector('.sideBtn.on'), sym = b && b.querySelector('#mbSym'), open = (L.open || []).length, closed = (L.closed || []).length, eq = Number.isFinite(L.equity) ? L.equity : null;
    return { _label: eq != null ? 'equity ' + TmSettings.num(eq) : '',
      ticket: { t: (side ? (side.textContent || '').trim().toLowerCase() + ' ' : '') + (sym ? (sym.textContent || '').replace('▾', '').trim() : '') },
      rules: { t: 'your limits' }, auto: { t: 'by itself' },
      orders: { t: open + ' open · ' + wait + ' waiting' },
      results: { t: closed + ' closed trade' + (closed === 1 ? '' : 's') }, notes: { t: 'yours' } }; },
  paint(){ const h = this.head(), b = this.body(), C = this.cfg(); if (!h || !b || !C) return; this.apply();
    const F = this.facts(), S = C.stations, cur = S.find(x => x.id === this.st), seq = C.seq || [], doneN = seq.filter(k => F[k] && F[k].done).length, f = id => F[id] || {}, sig = JSON.stringify([this.page, this.st, S.map(x => [f(x.id).done, f(x.id).next, f(x.id).t, f(x.id).hot]), F._label]);
    if (sig !== this._sig){ this._sig = sig;
      h.innerHTML = '<div class="dkTop"><i class="dkGlyph">' + (cur ? cur.icon : '🧭') + '</i><div class="dkTitle"><small>' + C.eyebrow + (F._label ? ' · ' + this.esc(F._label) : '') + '</small><b>' + (cur ? cur.title : 'Everything on one page') + '</b><span>' + (cur ? cur.text : 'The whole page laid out at once, with its layout tools: move, fold and resize its parts here.') + '</span></div>' +
          '<button type="button" class="dkAll' + (this.st === 'all' ? ' on' : '') + '" data-dk="' + (this.st === 'all' ? S[0].id : 'all') + '" title="' + (this.st === 'all' ? 'Back to one station at a time' : 'The whole page at once, with its layout tools') + '">' + (this.st === 'all' ? 'One station at a time' : 'Show everything') + '</button></div>' +
        '<div class="dkRail' + (seq.length ? ' seq' : '') + '" style="--n:' + S.length + '">' + (seq.length ? '<i class="dkLine"><u style="--p:' + (Math.max(0, doneN - 1) / (S.length - 1) * 100).toFixed(1) + '%"></u></i>' : '') + S.map((x, i) => { const s = f(x.id); return '<button type="button" class="dkNode' + (x.id === this.st ? ' on' : '') + (s.done ? ' done' : '') + (s.next ? ' next' : '') + (s.hot ? ' hot' : '') + '" data-dk="' + x.id + '" style="--i:' + i + '" title="' + this.esc(x.title + (s.t ? ': ' + s.t : '')) + '"><span class="dkOrb"><i>' + x.icon + '</i>' + (seq.length && s.done ? '<u>✓</u>' : s.next ? '<u class="nx">!</u>' : '') + '</span><b>' + x.n + '</b><em>' + this.esc(s.t || '') + '</em></button>'; }).join('') + '</div>'; }
    this.measure(); },
  /* the safety bar rides just under the rail */
  measure(){ const h = this.head(), b = this.body(); if (h && b) b.style.setProperty('--dkH', Math.max(0, h.offsetHeight - 21) + 'px'); },
};
