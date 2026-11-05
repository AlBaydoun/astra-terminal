/* ASTRA Terminal — the JUSTMARKETS portal.

   One page that answers three questions about your broker account, and nothing
   else:

     WHAT CAN I TRADE?   Every instrument your JustMarkets MT5 terminal actually
                         offers, read from the live bridge when it is running —
                         not a hand-written list. Each one says where its price
                         comes from and what a round trip costs on YOUR account
                         type, from the live spread where the bridge gives one.

     IS A BOT ON IT?     Which of those instruments the paper bots have actually
                         traded, how many trades, and what the paper ledger made
                         or lost on it. An instrument the account offers but no
                         bot has ever touched is shown as a gap, because that is
                         the thing you cannot see anywhere else in ASTRA.

     WHAT IS READY?      Every bot with its readiness count, its paper record and
                         a plain verdict. Promotion to real money still happens
                         on the Live Desk, behind its four typed gates.

   READ ONLY. This file has no order function, no bridge write path and no
   credential. It reads localStorage ledgers and whatever Feed/BROKER already
   hold, renders a table, and stops. It cannot arm a bot, size a position, move a
   stop or send anything to MetaTrader — the only route to the broker remains
   js/bots/live.js with its gates untouched.

   Paper and backtested results never guarantee future profit. */
const JMPortal = {
  KEY: 'astra_jmportal',
  st: null,

  state(){
    if (!this.st) this.st = Object.assign(
      { tab: 'universe', group: 'all', sort: 'group', dir: 1, gapsOnly: false },
      lsGet(this.KEY, {}) || {});
    return this.st;
  },
  save(){ lsSet(this.KEY, this.st); },

  /* ---------- what the account offers ---------- */

  /* true when the MT5 bridge is connected, so the lists below are the real account.
     Feed.bridge.symbols is a Set, not an array — .length is undefined on it, which
     is what made this page claim the bridge was closed while the terminal header
     was reporting 271 live symbols. Ask Feed itself, and fall back to the Set size. */
  bridgeOn(){
    try {
      if (typeof Feed === 'undefined') return false;
      if (typeof Feed.bridgeOn === 'function' && Feed.bridgeOn()) return true;
      return this.bridgeCount() > 0;
    } catch(e){ return false; }
  },

  bridgeCount(){
    try {
      const s = typeof Feed !== 'undefined' && Feed.bridge && Feed.bridge.symbols;
      if (!s) return 0;
      if (typeof s.size === 'number') return s.size;
      if (typeof s.length === 'number') return s.length;
      return 0;
    } catch(e){ return 0; }
  },

  bridgeAccount(){
    try {
      const b = typeof Feed !== 'undefined' && Feed.bridge;
      if (!b) return '';
      return [b.account, b.server].filter(Boolean).join(' · ');
    } catch(e){ return ''; }
  },

  /* the tradable universe. The bridge leads — those are the instruments your
     account really has. Without it we can only show ASTRA's catalogue and we say so. */
  tradable(){
    const out = [], seen = new Set(), canon = new Set();
    /* XAUUSD.s from the bridge and XAUUSD.m from the catalogue are ONE contract.
       Counting both inflated this list to 315 on a 271-symbol account and would
       have shown every broker instrument twice, once as a phantom gap. The
       bridge name wins, because that is the one the account can actually trade. */
    const add = s => {
      if (!s || seen.has(s)) return;
      const c = this.base(s);
      if (canon.has(c)) return;
      seen.add(s); canon.add(c); out.push(s);
    };
    if (this.bridgeOn()) for (const s of Feed.bridge.symbols) add(s);
    if (typeof BROKER !== 'undefined') for (const s of BROKER.all()) add(s);
    return out;
  },

  /* the broker's name without its account suffix: XAUUSD.m and XAUUSD.s are the
     same contract. The catalogue is written in .m / .std; a Pro account serves
     .s, so an exact lookup misses almost everything. */
  base(sym){ return String(sym || '').replace(/\.[A-Za-z]{1,4}$/, '').toUpperCase(); },

  CCY: 'AED|AUD|BRL|CAD|CHF|CLP|CNH|CNY|CZK|DKK|EUR|GBP|HKD|HUF|ILS|INR|JPY|KRW|MXN|NOK|NZD|PLN|RON|RUB|SAR|SEK|SGD|THB|TRY|USD|ZAR',
  METAL: /^(XAU|XAG|XPT|XPD)/,
  ENERGY: /^(WTI|BRENT|NATGAS|XBR|XTI|XNG|OIL)/,
  /* the same index appears under several broker spellings: GER40.std and DE40.s
     are both the DAX. Both are listed, because both are names your account may use. */
  INDEX: /^(US100|US30|US500|US2000|USTEC|NAS100|SPX500|GER40|GER30|DE40|DE30|UK100|GB100|FRA40|FR40|EUSTX50|EU50|STOXX50|ESP35|ES35|SPAIN35|IT40|SWI20|CH20|NETH25|NL25|NOR25|SE30|JPN225|JP225|HK50|HKG33|CHINA50|CHA50|CHINAH|SG20|AUS200|AU200|INDIA50|IN50|VIX)/,
  CRYPTO: /^(BTC|ETH|XRP|SOL|LTC|ADA|DOGE|BNB|DOT|UNI|LINK|AVAX|MATIC|TRX|XLM|ATOM|FIL|ETC|BCH|SHIB|NEAR|APT|ARB|OPT|ALGO|EOS|AAVE|SAND|MANA|ICP|KSM|XMR|XTZ|ZEC|DASH|COMP|CRV|SUSHI|YFI|SNX|BAT|ENJ|CHZ|GRT|LDO|RUNE|FTM|HBAR|VET|THETA|AXS|GALA|IMX|STX|INJ|SEI|SUI|TIA|PEPE|WIF|BONK)(USD|USDT|EUR|JPY|GBP|AUD|CHF)?$/,

  /* Deliberately NOT using MK.group here. MK answers "us" for every symbol it
     does not recognise, and on a Pro account (the .s suffix) it does not
     recognise any of them — EURUSD.s, WTI.s and XAGUSD.s all came back as US
     shares, which filed 235 instruments under Shares including gold crosses.
     The broker catalogue and the symbol's own shape are the honest sources. */
  groupOf(sym){
    const b = this.base(sym);
    if (typeof BROKER !== 'undefined'){
      const i = BROKER.info(sym);
      if (i) return i.group;
      const hit = BROKER.LIST.find(x => this.base(x[0]) === b);
      if (hit) return hit[2];
    }
    if (this.METAL.test(b)) return 'metal';
    if (this.ENERGY.test(b)) return 'energy';
    if (this.INDEX.test(b)) return 'index';
    if (new RegExp('^(' + this.CCY + ')(' + this.CCY + ')$').test(b)) return 'fx';
    if (this.CRYPTO.test(b)) return 'crypto';
    /* a share CFD carries no account suffix on this broker: AAPL, AMZN, ADSGn,
       DBKGn. Anything still suffixed at this point is a CFD we cannot name. */
    return /\.[A-Za-z]{1,4}$/.test(sym) ? 'other' : 'stocks';
  },

  GROUP_LABEL: { metal: 'Metals', energy: 'Energy', index: 'Indices', crypto: 'Crypto',
                 fx: 'Forex', stocks: 'Shares', other: 'Other' },

  /* where this instrument's price is coming from right now */
  source(sym){
    try {
      if (typeof Feed !== 'undefined' && Feed.bridgeHas && Feed.bridgeHas(sym)) return { kind: 'bridge', label: 'MT5 bridge', live: true };
      if (typeof BROKER !== 'undefined'){
        const f = BROKER.feedFor(sym);
        if (f && f.kind === 'binance') return { kind: 'binance', label: 'Binance', live: true };
        if (f && f.kind === 'proxy') return { kind: 'proxy', label: 'public feed', live: false };
      }
      if (typeof Feed !== 'undefined' && Feed.isLive && Feed.isLive(sym)) return { kind: 'live', label: 'live feed', live: true };
    } catch(e){}
    return { kind: 'none', label: 'no feed', live: false };
  },

  /* round-trip cost on your account, preferring the live spread from MT5 */
  cost(sym){
    try {
      if (typeof BROKER === 'undefined') return null;
      let liveSpread = null;
      if (typeof Bots !== 'undefined' && Bots.quoteFor){
        const q = Bots.quoteFor(sym);
        if (q && q.bid > 0 && q.ask > q.bid) liveSpread = (q.ask - q.bid) / q.ask * 100;
      }
      const c = BROKER.costsFor(sym, liveSpread);
      return { pct: (c.spreadPct || 0) + 2 * (c.commissionPct || 0), source: c.source };
    } catch(e){ return null; }
  },

  /* can a bot actually pick this instrument up? */
  /* Keyed by CONTRACT, not by exact name. Bots.universe() keeps the first name it
     sees for a contract and drops the alias, so it holds AUDUSD.m where the
     account serves AUDUSD.s. Comparing exact strings marked 44 instruments
     "out of reach" that the bots were already trading. */
  reachable(){
    if (this._reach) return this._reach;
    let list = [];
    try { if (typeof Bots !== 'undefined' && Bots.universe) list = Bots.universe() || []; } catch(e){}
    return this._reach = new Set(list.map(s => this.base(s)));
  },

  /* ---------- what the paper bots have done, per instrument ---------- */

  /* every closed paper trade of every trading bot, grouped by instrument */
  paperBySymbol(){
    if (this._paper) return this._paper;
    const map = {};
    try {
      const bots = (typeof Bots !== 'undefined' && Bots.tradingBots) ? Bots.tradingBots() : [];
      for (const b of bots){
        let led = null;
        try { led = (Bots.ledger && Bots.ledger(b.id)) || (typeof BotEngine !== 'undefined' && BotEngine.load(b.id)); } catch(e){}
        if (!led) continue;
        const rows = [].concat(led.closed || []);
        for (const t of rows){
          const raw = t.sym || t.symbol;
          if (!raw) continue;
          const sym = this.base(raw);   /* a trade on XAUUSD.m is a trade on XAUUSD.s */
          const m = map[sym] || (map[sym] = { trades: 0, pnl: 0, fees: 0, wins: 0, bots: new Set(), last: 0 });
          m.trades++;
          m.pnl += (+t.pnl || 0);
          m.fees += (+t.fees || 0);
          if ((+t.pnl || 0) > 0) m.wins++;
          m.bots.add(b.name || b.id);
          m.last = Math.max(m.last, +t.closedAt || +t.ts || 0);
        }
        for (const p of (led.open || [])){
          const raw = p.sym || p.symbol;
          if (!raw) continue;
          const sym = this.base(raw);
          const m = map[sym] || (map[sym] = { trades: 0, pnl: 0, fees: 0, wins: 0, bots: new Set(), last: 0 });
          m.open = (m.open || 0) + 1;
          m.bots.add(b.name || b.id);
        }
      }
    } catch(e){}
    return this._paper = map;
  },

  /* ---------- rows ---------- */

  universeRows(){
    const paper = this.paperBySymbol(), reach = this.reachable();
    return this.tradable().map(sym => {
      const g = this.groupOf(sym), src = this.source(sym), c = this.cost(sym);
      const p = paper[this.base(sym)] || null;
      const inReach = reach.has(this.base(sym));
      let status, rank;
      if (p && p.trades > 0){ status = 'traded'; rank = 0; }
      else if (p && p.open){ status = 'open only'; rank = 1; }
      else if (inReach){ status = 'gap'; rank = 2; }
      else { status = 'unreachable'; rank = 3; }
      return { sym, group: g, src, cost: c, paper: p, reach: inReach, status, rank };
    });
  },

  botRows(){
    let cands = [];
    try { if (typeof LiveDesk !== 'undefined' && LiveDesk.candidates) cands = LiveDesk.candidates() || []; } catch(e){}
    if (!cands.length){
      try {
        const bots = (typeof Bots !== 'undefined' && Bots.tradingBots) ? Bots.tradingBots() : [];
        cands = bots.map(b => ({ b, row: null, ready: { met: 0, of: 0 }, paused: false }));
      } catch(e){}
    }
    let armed = {};
    try { if (typeof Live !== 'undefined' && Live.load){ Live.load(); armed = Live.state.armed || {}; } } catch(e){}
    return cands.map(c => {
      let s = null;
      try {
        const led = (Bots.ledger && Bots.ledger(c.b.id)) || BotEngine.load(c.b.id);
        s = BotEngine.stats(led);
      } catch(e){}
      const met = (c.ready && c.ready.met) || 0, of = (c.ready && c.ready.of) || 0;
      const a = armed[c.b.id] || null;
      return { id: c.b.id, name: c.b.name || c.b.id, met, of, stats: s, paused: !!c.paused,
               armed: a ? (a.mode || 'shadow') : '', rank: (c.row && c.row.rank) };
    });
  },

  /* ================= coverage =================

     Bots.refuses() gives a bot with no explicit market list every group EXCEPT
     'stocks' and 'other', so the 24/7 bots are shut out of shares by default.
     The five US Stocks bots are NOT: they carry groups:['stocks'] already and
     are permitted on all 162 share instruments.

     So an untraded share market is usually not a permission problem, and this
     page should not pretend it is. The table below separates the two causes
     that actually matter — how many bots MAY trade a market, and how many of
     its instruments are quoting right now. A share quotes only inside its one
     session a day; with New York shut, every share row is permitted, reachable
     and priceless, and no bot can open anything.

     What the plan below still does is real but small: the share bots are given
     'other' (European shares and the rest) alongside 'stocks'. Shares go only
     to the bots written for a single session with an opening range, an
     overnight gap and a close; the 24/7 bots are left alone.

     This is the ONLY part of the portal that writes. It writes bot market
     settings and nothing else — no order, no stop, no arming, no live state.
     It refuses to touch a bot armed on the Live Desk, because widening a bot's
     markets would widen what it may trade with real money. */

  UNDO_KEY: 'astra_jmportal_undo',
  SHARE_GROUPS: ['stocks', 'other'],

  groupDefs(){
    try { return (typeof Bots !== 'undefined' && Bots.marketGroups) ? Bots.marketGroups() : {}; }
    catch(e){ return {}; }
  },

  armedIds(){
    try {
      if (typeof Live === 'undefined' || !Live.load) return new Set();
      Live.load();
      return new Set(Object.keys(Live.state.armed || {}));
    } catch(e){ return new Set(); }
  },

  /* bots this page is willing to change, and the reason for each one it is not */
  eligibility(){
    const armed = this.armedIds(), out = [];
    let bots = [];
    try { bots = (typeof Bots !== 'undefined' && Bots.tradingBots) ? Bots.tradingBots() : []; } catch(e){}
    for (const b of bots){
      const cfg = (Bots.cfg && Bots.cfg(b.id)) || {};
      let skip = '';
      if (armed.has(b.id)) skip = 'armed on the Live Desk — its markets are not changed from here';
      else if (cfg.instruments && cfg.instruments.length) skip = 'narrowed to a hand-picked pair list';
      else if (cfg.paused) skip = 'paused';
      out.push({ bot: b, cfg, skip, share: !!b.usStocks });
    }
    return out;
  },

  /* what each bot's markets would become. Share bots get the share groups;
     everything else is left exactly as it is. */
  plan(){
    const defs = Object.keys(this.groupDefs());
    const share = this.SHARE_GROUPS.filter(g => defs.includes(g));
    if (!share.length) return [];
    const rows = [];
    for (const e of this.eligibility()){
      if (e.skip || !e.share) continue;
      const cur = (e.cfg.groups && e.cfg.groups.length)
        ? e.cfg.groups.slice()
        : defs.filter(g => !this.SHARE_GROUPS.includes(g));
      const adds = share.filter(g => !cur.includes(g));
      if (!adds.length) continue;
      rows.push({ id: e.bot.id, name: e.bot.name, from: cur, to: share.slice(), adds });
    }
    return rows;
  },

  /* how many instruments of a group any bot may currently open */
  coverageRows(){
    const G = this.groupDefs(), paper = this.paperBySymbol();
    let bots = [];
    try { bots = (typeof Bots !== 'undefined' && Bots.tradingBots) ? Bots.tradingBots() : []; } catch(e){}
    return Object.entries(G).map(([gid, g]) => {
      const syms = g.syms || [];
      const probe = syms[0];
      let allowed = 0;
      if (probe) for (const b of bots){
        try { if (Bots.refuses(b.id, probe) == null) allowed++; } catch(e){}
      }
      const traded = syms.filter(s => { const p = paper[this.base(s)]; return p && p.trades > 0; }).length;
      /* permitted and priced are different things, and confusing them is how you
         conclude a market is switched off when its session is simply closed */
      let quoted = 0;
      for (const s of syms){
        try { if (Bots.quoteFor && Bots.quoteFor(s)) quoted++; } catch(e){}
      }
      return { gid, label: g.label || gid, count: syms.length, allowed, traded, quoted, bots: bots.length };
    }).sort((a, b) => b.count - a.count);
  },

  applyPlan(){
    const rows = this.plan();
    if (!rows.length) return { ok: false, why: 'Nothing to change.' };
    const undo = [];
    let done = 0;
    for (const r of rows){
      try {
        const cfg = Bots.cfg(r.id);
        if (!cfg) continue;
        undo.push({ id: r.id, groups: cfg.groups ? cfg.groups.slice() : null, marketMode: cfg.marketMode || null });
        cfg.groups = r.to.slice();
        Bots.saveCfg(r.id);          /* stamps Bots' own market log for us */
        done++;
      } catch(e){}
    }
    if (done) lsSet(this.UNDO_KEY, { at: Date.now(), rows: undo });
    this._reach = null;
    return { ok: !!done, done, why: done ? '' : 'No bot could be changed.' };
  },

  undoStash(){ const u = lsGet(this.UNDO_KEY, null); return (u && Array.isArray(u.rows) && u.rows.length) ? u : null; },

  undoPlan(){
    const u = this.undoStash();
    if (!u) return { ok: false };
    let done = 0;
    for (const r of u.rows){
      try {
        const cfg = Bots.cfg(r.id);
        if (!cfg) continue;
        if (r.groups == null) delete cfg.groups; else cfg.groups = r.groups.slice();
        if (r.marketMode == null) delete cfg.marketMode; else cfg.marketMode = r.marketMode;
        Bots.saveCfg(r.id);
        done++;
      } catch(e){}
    }
    lsSet(this.UNDO_KEY, null);
    this._reach = null;
    return { ok: !!done, done };
  },

  coverageView(){
    const rows = this.coverageRows(), plan = this.plan(), elig = this.eligibility(), undo = this.undoStash();
    const skipped = elig.filter(e => e.skip);

    const th = s => '<th style="text-align:left;padding:6px 10px;font-size:11px;opacity:.65;font-weight:400;white-space:nowrap">' + s + '</th>';
    const td = (s, extra) => '<td style="padding:6px 10px;font-size:12px;white-space:nowrap;' + (extra || '') + '">' + s + '</td>';

    let html = '<table style="width:100%;border-collapse:collapse;margin:0 0 16px">' +
      '<thead><tr>' + th('Market') + th('Instruments') + th('Bots allowed on it') +
      th('Quoting now') + th('Instruments traded') + th('What is stopping it') + '</tr></thead><tbody>';
    for (const r of rows){
      const off = r.allowed === 0;
      let why;
      if (off) why = 'switched off for every bot';
      else if (!r.quoted) why = 'no price right now — its session is closed';
      else if (!r.traded) why = 'open and priced; no signal has fired yet';
      else why = '—';
      html += '<tr style="border-top:1px solid rgba(127,127,127,.16)">' +
        td('<strong>' + this.esc(r.label) + '</strong>') +
        td(r.count) +
        td(r.allowed + ' of ' + r.bots, off ? 'color:var(--down,#e3534f)' : '') +
        td(r.quoted + ' of ' + r.count, r.quoted ? '' : 'opacity:.55') +
        td(r.traded || '—', r.traded ? '' : 'opacity:.5') +
        td(this.esc(why), 'opacity:.75;white-space:normal') +
        '</tr>';
    }
    html += '</tbody></table>';

    if (plan.length){
      html += '<div style="background:rgba(127,127,127,.08);border-radius:8px;padding:12px 14px;margin:0 0 12px">' +
        '<div style="font-size:13px;font-weight:500;margin:0 0 6px">Give the share bots the European shares too</div>' +
        '<div style="font-size:12px;opacity:.8;line-height:1.6;margin:0 0 10px">' +
        'These ' + plan.length + ' bots already hold the US Stocks market &mdash; permission was never what was ' +
        'stopping them. This adds the one market they are still missing, &ldquo;European stocks &amp; other&rdquo;, ' +
        'which they are equally suited to: it is also a single session with a gap and a close. ' +
        'It is a small change, and it will not make an untraded market trade on its own &mdash; a market with no ' +
        'price in the column above is waiting for its session, not for a setting. ' +
        'The 24/7 bots stay off shares, and so does every bot listed below.</div>' +
        '<table style="width:100%;border-collapse:collapse;margin:0 0 10px"><thead><tr>' +
        th('Bot') + th('Markets now') + th('Markets after') + '</tr></thead><tbody>';
      const G = this.groupDefs(), lab = g => (G[g] || {}).label || g;
      for (const p of plan){
        html += '<tr style="border-top:1px solid rgba(127,127,127,.16)">' +
          td('<strong>' + this.esc(p.name) + '</strong>') +
          td(this.esc(p.from.map(lab).join(', ') || 'none'), 'opacity:.7;white-space:normal') +
          td(this.esc(p.to.map(lab).join(', ')), 'white-space:normal') +
          '</tr>';
      }
      html += '</tbody></table>' +
        '<button type="button" id="jmApply" class="bMini">Apply to ' + plan.length + ' bots</button> ' +
        '<span style="font-size:11px;opacity:.65">Paper only. Nothing is armed and no order is sent.</span></div>';
    } else {
      html += '<div style="background:rgba(127,127,127,.08);border-radius:8px;padding:11px 14px;margin:0 0 12px;font-size:12px;line-height:1.6">' +
        'Nothing to change: the share bots already have the share markets, or there is no share bot to give them to.</div>';
    }

    if (undo){
      html += '<div style="margin:0 0 12px"><button type="button" id="jmUndo" class="bMini">Undo the last change (' +
        undo.rows.length + ' bots)</button> <span style="font-size:11px;opacity:.65">applied ' +
        this.esc(new Date(undo.at).toLocaleString()) + '</span></div>';
    }

    if (skipped.length){
      html += '<div style="font-size:12px;opacity:.8;line-height:1.7"><strong>Left alone (' + skipped.length + ')</strong><br>' +
        skipped.map(e => this.esc(e.bot.name) + ' &mdash; ' + this.esc(e.skip)).join('<br>') + '</div>';
    }
    return html;
  },

  /* ---------- rendering ---------- */

  esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); },
  n(v, d){ return (v == null || !isFinite(v)) ? '—' : (+v).toFixed(d == null ? 2 : d); },
  money(v){ if (v == null || !isFinite(v)) return '—'; const s = v > 0 ? '+' : v < 0 ? '−' : ''; return s + Math.abs(+v).toFixed(2); },
  pnlColor(v){ return v > 0 ? 'var(--up, #26a66b)' : v < 0 ? 'var(--down, #e3534f)' : 'inherit'; },

  STATUS: {
    traded:        ['on paper',      'A paper bot has closed trades on this instrument.'],
    'open only':   ['open only',     'A paper position is open but nothing has closed yet.'],
    gap:           ['not traded',    'The bots can reach this instrument but have never traded it.'],
    unreachable:   ['out of reach',  'No bot can pick this up: no feed, or it is filtered out of the bot universe.'],
  },

  head(){
    const S = this.state(), on = this.bridgeOn();
    const rows = this.universeRows();
    const counts = { traded: 0, gap: 0, unreachable: 0, 'open only': 0 };
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;
    const acct = (typeof BROKER !== 'undefined' && BROKER.account) ? BROKER.account : '—';
    const tile = (label, value, note) =>
      '<div style="background:rgba(127,127,127,.08);border-radius:8px;padding:10px 12px;min-width:120px">' +
      '<div style="font-size:11px;opacity:.65;margin-bottom:3px">' + this.esc(label) + '</div>' +
      '<div style="font-size:19px;font-weight:500">' + this.esc(value) + '</div>' +
      (note ? '<div style="font-size:11px;opacity:.55;margin-top:2px">' + this.esc(note) + '</div>' : '') +
      '</div>';

    return '<div style="display:flex;flex-wrap:wrap;gap:10px;margin:0 0 12px">' +
      tile('Account', 'JustMarkets ' + acct, on ? (this.bridgeAccount() || 'bridge connected') : 'bridge closed') +
      tile('Instruments', rows.length, on ? this.bridgeCount() + ' live from your terminal' : "ASTRA's catalogue only") +
      tile('Paper-traded', counts.traded || 0, 'have closed paper trades') +
      tile('Not traded', counts.gap || 0, 'reachable, never traded') +
      tile('Out of reach', counts.unreachable || 0, 'no feed or filtered out') +
      '</div>' +
      (on ? '' :
        '<div style="background:rgba(230,160,60,.12);border-radius:8px;padding:9px 12px;margin:0 0 12px;font-size:12px;line-height:1.55">' +
        'The MT5 bridge is not connected, so this is ASTRA&rsquo;s own catalogue of ' +
        (typeof BROKER !== 'undefined' ? BROKER.all().length : 0) + ' instruments &mdash; not a reading of your account. ' +
        'Start MetaTrader 5 and <code>START-MT5-Bridge.bat</code>, then press Refresh: the list becomes whatever your ' +
        'Market Watch actually holds, shares included if your account has them.</div>');
  },

  tabs(){
    const S = this.state();
    const b = (id, label) => '<button type="button" data-jmtab="' + id + '" class="bMini"' +
      (S.tab === id ? ' style="outline:1px solid currentColor"' : '') + '>' + this.esc(label) + '</button>';
    return '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 10px">' +
      b('universe', 'Instruments') + b('bots', 'Bots & readiness') + b('coverage', 'Coverage') +
      '<span style="flex:1"></span>' +
      (S.tab === 'universe'
        ? '<label style="font-size:12px;opacity:.8;display:flex;gap:5px;align-items:center">' +
          '<input type="checkbox" id="jmGaps"' + (S.gapsOnly ? ' checked' : '') + '> show only what is not traded</label>'
        : '') +
      '<button type="button" id="jmRefresh" class="bMini">Refresh</button>' +
      '</div>';
  },

  universeTable(){
    const S = this.state();
    let rows = this.universeRows();
    if (S.gapsOnly) rows = rows.filter(r => r.status === 'gap' || r.status === 'unreachable');
    rows.sort((a, b) => (a.rank - b.rank) || a.group.localeCompare(b.group) || a.sym.localeCompare(b.sym));
    if (!rows.length) return '<p style="opacity:.7;font-size:13px">Nothing to show.</p>';

    const th = s => '<th style="text-align:left;padding:6px 10px;font-size:11px;opacity:.65;font-weight:400;white-space:nowrap">' + s + '</th>';
    const td = (s, extra) => '<td style="padding:6px 10px;font-size:12px;white-space:nowrap;' + (extra || '') + '">' + s + '</td>';

    let html = '<div style="overflow:auto;max-height:52vh"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' + th('Instrument') + th('Group') + th('Price from') + th('Round trip') +
      th('Paper trades') + th('Paper result') + th('Win rate') + th('Bots on it') + th('Status') + '</tr></thead><tbody>';

    for (const r of rows){
      const st = this.STATUS[r.status] || [r.status, ''];
      const p = r.paper;
      const wr = p && p.trades ? this.n(p.wins / p.trades * 100, 0) + '%' : '—';
      html += '<tr style="border-top:1px solid rgba(127,127,127,.16)">' +
        td('<strong>' + this.esc(r.sym) + '</strong>') +
        td(this.esc(this.GROUP_LABEL[r.group] || r.group), 'opacity:.75') +
        td('<span title="' + this.esc(r.src.live ? 'real time' : 'delayed or absent') + '">' +
           (r.src.live ? '●' : '○') + ' ' + this.esc(r.src.label) + '</span>', 'opacity:.8') +
        td(r.cost ? '<span title="' + this.esc(r.cost.source) + '">' + this.n(r.cost.pct, 3) + '%</span>' : '—', 'opacity:.8') +
        td(p && p.trades ? p.trades + (p.open ? ' (+' + p.open + ' open)' : '') : (p && p.open ? p.open + ' open' : '—')) +
        td(p && p.trades ? this.money(p.pnl) : '—', p && p.trades ? 'color:' + this.pnlColor(p.pnl) : 'opacity:.5') +
        td(wr, 'opacity:.8') +
        td(p ? this.esc([...p.bots].slice(0, 3).join(', ') + ([...p.bots].length > 3 ? ' +' + ([...p.bots].length - 3) : '')) : '—', 'opacity:.75;white-space:normal;max-width:240px') +
        td('<span title="' + this.esc(st[1]) + '">' + this.esc(st[0]) + '</span>', 'opacity:.8') +
        '</tr>';
    }
    return html + '</tbody></table></div>';
  },

  botTable(){
    const rows = this.botRows();
    if (!rows.length) return '<p style="opacity:.7;font-size:13px">No trading bots found.</p>';
    rows.sort((a, b) => (b.met - a.met) || ((b.stats && b.stats.pnl) || 0) - ((a.stats && a.stats.pnl) || 0));

    const th = s => '<th style="text-align:left;padding:6px 10px;font-size:11px;opacity:.65;font-weight:400;white-space:nowrap">' + s + '</th>';
    const td = (s, extra) => '<td style="padding:6px 10px;font-size:12px;white-space:nowrap;' + (extra || '') + '">' + s + '</td>';

    let html = '<div style="overflow:auto;max-height:52vh"><table style="width:100%;border-collapse:collapse">' +
      '<thead><tr>' + th('Bot') + th('Readiness') + th('Paper trades') + th('Paper P&amp;L') +
      th('Win rate') + th('Profit factor') + th('Max drawdown') + th('On the desk') + th('Verdict') + '</tr></thead><tbody>';

    for (const r of rows){
      const s = r.stats;
      const ready = r.of ? r.met + ' of ' + r.of : '—';
      const enough = r.of && r.met >= 4;
      let verdict, why;
      if (!s || !s.trades){ verdict = 'no record'; why = 'It has not closed a paper trade yet.'; }
      else if (!enough){ verdict = 'not ready'; why = 'Four readiness conditions is the minimum to arm, even in shadow.'; }
      else if (s.pnl <= 0){ verdict = 'ready, losing'; why = 'It meets the readiness bar but its paper ledger is down.'; }
      else { verdict = 'ready'; why = 'Meets the readiness bar with a positive paper ledger. Arming is still yours to do on the Live Desk.'; }
      html += '<tr style="border-top:1px solid rgba(127,127,127,.16)">' +
        td('<strong>' + this.esc(r.name) + '</strong>' + (r.paused ? ' <span style="opacity:.6">(paused)</span>' : '')) +
        td(ready, enough ? '' : 'opacity:.7') +
        td(s && s.trades ? s.trades : '—') +
        td(s && s.trades ? this.money(s.pnl) : '—', s && s.trades ? 'color:' + this.pnlColor(s.pnl) : 'opacity:.5') +
        td(s && s.trades ? this.n(s.winRate, 0) + '%' : '—', 'opacity:.8') +
        td(s && s.trades ? (isFinite(s.profitFactor) ? this.n(s.profitFactor, 2) : '∞') : '—', 'opacity:.8') +
        td(s && s.trades ? this.n(s.maxDD, 1) + '%' : '—', 'opacity:.8') +
        td(r.armed ? '<strong>' + this.esc(r.armed) + '</strong>' : '—', r.armed ? '' : 'opacity:.5') +
        td('<span title="' + this.esc(why) + '">' + this.esc(verdict) + '</span>', 'opacity:.85') +
        '</tr>';
    }
    return html + '</tbody></table></div>';
  },

  footer(){
    return '<p style="font-size:11px;opacity:.6;line-height:1.6;margin:10px 0 0">' +
      'This page only reads. It cannot arm a bot, size a position or send anything to MetaTrader &mdash; ' +
      'real orders still go through the Live Desk and its four typed gates, by your hand. ' +
      'Every figure above is a paper ledger or a reading of your terminal, not a forecast; ' +
      'paper and backtested results never guarantee future profit.</p>';
  },

  view(){
    const S = this.state();
    const body = S.tab === 'bots' ? this.botTable()
      : S.tab === 'coverage' ? this.coverageView()
      : this.universeTable();
    return '<div style="padding:12px 14px">' + this.head() + this.tabs() + body + this.footer() + '</div>';
  },

  render(){
    const host = document.getElementById('bot-justmarkets');
    if (!host) return;
    this._reach = null; this._paper = null;
    try { host.innerHTML = this.view(); }
    catch(e){
      host.innerHTML = '<div style="padding:14px;font-size:13px;opacity:.8">The JustMarkets portal could not render: ' +
        this.esc(e && e.message) + '</div>';
      return;
    }
    const S = this.state();
    host.querySelectorAll('[data-jmtab]').forEach(b =>
      b.addEventListener('click', () => { S.tab = b.dataset.jmtab; this.save(); this.render(); }));
    const gaps = host.querySelector('#jmGaps');
    if (gaps) gaps.addEventListener('change', () => { S.gapsOnly = gaps.checked; this.save(); this.render(); });
    const ref = host.querySelector('#jmRefresh');
    if (ref) ref.addEventListener('click', () => this.render());

    const apply = host.querySelector('#jmApply');
    if (apply) apply.addEventListener('click', () => {
      const rows = this.plan();
      const names = rows.map(r => r.name).join('\n  ');
      if (!window.confirm('Give these ' + rows.length + ' bots the share markets?\n\n  ' + names +
        '\n\nThey trade on paper. Nothing is armed and no order is sent. This can be undone here.')) return;
      const res = this.applyPlan();
      this.render();
      if (res.ok && typeof Bots !== 'undefined' && Bots.render) { try { Bots.render(); } catch(e){} }
    });

    const undo = host.querySelector('#jmUndo');
    if (undo) undo.addEventListener('click', () => {
      if (!window.confirm('Put those bots back to the markets they had before?')) return;
      this.undoPlan();
      this.render();
      if (typeof Bots !== 'undefined' && Bots.render) { try { Bots.render(); } catch(e){} }
    });
  },

  /* binds itself, so no other file has to change */
  init(){
    const btn = document.querySelector('#botTabs button[data-tab="justmarkets"]');
    if (btn) btn.addEventListener('click', () => setTimeout(() => this.render(), 0));
  },
};
if (typeof window !== 'undefined'){
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => JMPortal.init());
  else JMPortal.init();
}
