/* ASTRA Terminal — the Live Deep Dive.
   The Deep Dive's own engine (every card, every doll, the notes, the layout,
   the hand-close check), pointed at the REAL account instead of the paper bots:
   every trade ASTRA opened on MetaTrader, read back from the broker's history.

   Nothing in the paper Deep Dive changes: this object INHERITS from Explorer and
   only replaces where the trades come from and how a real trade is valued.
   Its path, ticks, layout, notes and checks are stored under their own keys.

   Read only. It never sends, changes or closes an order.

   Where each figure comes from:
     result      MetaTrader's own deals: profit + commission + swap + fee of every
                 closing deal, plus the charges of the opening deal
     bot, tf     ASTRA's record of the order it sent (same ticket); if that record
                 is gone, the comment MetaTrader keeps on the opening deal
                 ("ASTRA <bot>"); if neither, "not known"
     R, at risk  the stop the order was sent with × the lots × MetaTrader's value
                 of one price point per lot
     times       broker time converted to your PC's clock (like the paper trades) */
const LiveDive = Object.assign(Object.create(Explorer), {
  PAGE: 'livedive', OPEN_PAGE: 'live',
  SEC_KEY: 'astra_livedive_secs', PATH_KEY: 'astra_livedive_path', EXCL_KEY: 'astra_livedive_excl',
  NOTES_KEY: 'astra_livedive_notes', FREEZE_KEY: 'astra_livedive_freeze', WI_KEY: 'astra_livedive_whatif',
  CACHE_KEY: 'astra_livedive_cache',
  ALWAYS_SPLIT: ['sym', 'bot', 'spreadB', 'slip', 'charges', 'session'],   // the bots card shows even when one bot did all the trading
  /* own copies of everything the engine changes while you click */
  path: [], excludes: {}, showAll: {}, _allKeys: {}, dirty: false, listAll: false, _listN: 0,
  layoutOpen: false, notesOpen: false, _focus: null,

  /* ---------- the dimensions: the paper ones, bots first, plus two that only real trades have ---------- */
  DIMS: (() => {
    const by = id => Object.assign({}, Explorer.DIMS.find(d => d.id === id));
    const bot = by('bot');
    bot.name = v => v === '?' ? 'Not known (no ASTRA record of it)' : (BOT_BY_ID[v] ? WorkspaceUI.name(BOT_BY_ID[v]) : v);
    const touched = by('touched');
    touched.label = 'Stop moved while open';
    touched.of = t => t.touched ? 'moved' : 'never';
    touched.name = v => v === 'moved' ? 'Stop or target moved' : 'Left as sent';
    return [bot,
      { id: 'origin', label: 'Who sent it', of: t => t.origin || '?', name: v => ({ desk: 'The live desk', armed: 'An armed bot', manual: 'LIVE trading bot (you)', '?': 'Not known' })[v] || v },
      by('market'), by('sym'), by('tf'), by('side'), by('result'), by('outcome'), by('closer'),
      { id: 'session', label: 'Session opened in', of: t => LiveDive.sessionOf(t.entryTime), name: v => ({ asia: 'Asia (before 07:00 UTC)', london: 'London (07–12 UTC)', overlap: 'London + New York (12–16 UTC)', newyork: 'New York (16–21 UTC)', late: 'Late evening (after 21 UTC)' })[v] || v, order: ['asia', 'london', 'overlap', 'newyork', 'late'] },
      by('day'), by('hour'), by('dow'), by('hold'),
      { id: 'spreadB', label: 'Spread paid (share of the risk)', of: t => !(t.spreadCost > 0) ? 'none' : !(t.risk > 0) ? 'norisk' : (s => s < 0.05 ? 'a' : s < 0.15 ? 'b' : s < 0.3 ? 'c' : 'd')(t.spreadCost / t.risk),
        name: v => ({ a: 'Under 5% of the risk', b: '5–15% of the risk', c: '15–30% of the risk', d: 'Over 30% of the risk', norisk: 'Risk not known', none: 'Spread not known' })[v] || v, order: ['a', 'b', 'c', 'd', 'norisk', 'none'] },
      { id: 'slip', label: 'Fill against the signal price', of: t => t.slip == null ? 'none' : Math.abs(t.slip) < 1e-9 ? 'exact' : t.slip > 0 ? 'worse' : 'better',
        name: v => ({ better: 'Filled better', exact: 'Filled exactly', worse: 'Filled worse (slippage)', none: 'Not recorded (older orders)' })[v] || v, order: ['better', 'exact', 'worse', 'none'] },
      { id: 'charges', label: 'Broker charges', of: t => t.swap < 0 ? 'swap' : t.commission < 0 || t.fee < 0 ? 'comm' : 'none',
        name: v => ({ swap: 'Paid overnight swap', comm: 'Commission or fees only', none: 'No charges' })[v] || v, order: ['none', 'comm', 'swap'] },
      touched];
  })(),

  /* ---------- the data ---------- */
  data: null,          // { trades, open, at, from: 'bridge' | 'saved' }
  error: '',
  busy: false,
  all(){ return ((this.data && this.data.trades) || []).filter(t => Number.isFinite(t.pnl)); },
  openNow(){
    let rows = (this.data && this.data.open) || [];
    for (const f of this.path) rows = rows.filter(t => { try { return f.range || f.dim === 'trade' || f.dim === 'result' ? true : this.pass(t, f); } catch(e){ return false; } });
    return rows.filter(t => { try { return !this.excluded(t); } catch(e){ return true; } });
  },

  /* the broker writes its server's wall clock into the epoch; ours is real UTC */
  utcMs(raw){
    if (!(raw > 0)) return 0;
    const off = typeof USStocks !== 'undefined' && USStocks.brokerOffsetAt ? USStocks.brokerOffsetAt(raw)
      : ((typeof Feed !== 'undefined' && Feed.bridgeClock && Feed.bridgeClock.offset) || 0);
    return (raw - off) * 1000;
  },
  /* the name ASTRA uses for a broker symbol (XAUUSD.s → XAUUSD.m), so markets, charts and replays line up */
  astraSym(broker){
    const al = (typeof Feed !== 'undefined' && Feed.alias) || {};
    for (const k of Object.keys(al)) if (al[k] === broker) return k;
    return broker;
  },
  /* "ASTRA <bot id>" — MetaTrader cuts a comment at 31 characters, so a long id may arrive shortened */
  botFromComment(c){
    const m = /^ASTRA\s+(\S+)/.exec(String(c || '')); if (!m || m[1] === 'close') return null;
    const id = m[1]; if (BOT_BY_ID[id]) return id;
    const hit = Object.keys(BOT_BY_ID).find(k => k.startsWith(id)); return hit || id;
  },
  pointValue(sym, broker){
    const s = typeof Feed !== 'undefined' && Feed.specFor ? (Feed.specFor(sym) || Feed.specFor(broker)) : null;
    if (s && s.pointValue > 0) return s.pointValue;
    if (s && s.tickSize > 0 && s.tickValue > 0) return s.tickValue / s.tickSize;
    return 0;
  },
  /* how a real position ended, in words — from the closing deal's comment and ASTRA's own log */
  howClosed(pos, audit){
    const c = String(pos.closeComment || '');
    if (/^\[sl/i.test(c)) return { reason: pos.net > 0 ? 'stop hit after it was moved into profit' : pos.touched ? 'stop hit (after it was moved)' : 'stop hit' };
    if (/^\[tp/i.test(c)) return { reason: 'target hit' };
    if (/^\[so/i.test(c)) return { reason: 'stop-out by the broker (margin)' };
    const re = new RegExp('Ticket ' + pos.id + ' closed at the market(?: — (.+))?');
    for (const a of audit){
      const m = re.exec(a.text || '');
      if (m){ const why = (m[1] || '').trim();
        return /by hand/i.test(why) || !why ? { reason: 'closed by operator', closedBy: { via: 'the live desk' } } : { reason: 'desk rule: ' + why }; }
      if ((a.kind === 'close') && new RegExp('Close ' + pos.id + ' — done').test(a.text || '')) return { reason: 'closed by operator', closedBy: { via: 'Live connection page' } };
    }
    if (/^ASTRA/i.test(c)) return { reason: 'closed at market by ASTRA' };
    return { reason: 'closed by operator', closedBy: { via: 'MetaTrader' } };
  },

  /* spread and slippage of one trade. The spread is the one recorded the moment the order was sent;
     orders sent before ASTRA recorded it get the account's usual spread for that market, marked as an estimate. */
  costsOf(t, o){
    const out = { spread: null, spreadSrc: 'none', spreadCost: null, slip: null, slipCost: null };
    if (o && o.spread > 0){ out.spread = o.spread; out.spreadSrc = o.spreadMeasured ? 'measured' : 'model'; }
    else if (t.entry > 0 && typeof BROKER !== 'undefined' && BROKER.costsFor){
      try { const c = BROKER.costsFor(t.sym, null); if (c && c.spreadPct > 0){ out.spread = t.entry * c.spreadPct / 100; out.spreadSrc = 'estimate'; } } catch(e){}
    }
    if (out.spread > 0 && t.pv > 0) out.spreadCost = +(out.spread * t.lots * t.pv).toFixed(2);
    if (o && o.sigEntry > 0 && t.entry > 0){
      out.slip = (t.entry - o.sigEntry) * t.dir;                       // + = filled worse than the signal price
      if (t.pv > 0) out.slipCost = +(out.slip * t.lots * t.pv).toFixed(2);
    }
    return out;
  },
  /* the trading session the trade was opened in (UTC hours) */
  sessionOf(ms){
    const h = new Date(ms).getUTCHours();
    return h < 7 ? 'asia' : h < 12 ? 'london' : h < 16 ? 'overlap' : h < 21 ? 'newyork' : 'late';
  },
  /* put the broker's deals back together into whole trades, one per position */
  build(raw){
    const magic = raw.magic;
    const own = d => magic == null || d.magic === magic;
    const book = typeof Live !== 'undefined' ? Live.loadBook() : { orders: [] };
    const orders = {}; for (const o of book.orders || []) if (o.sent && o.ok && o.ticket) orders[String(o.ticket)] = o;
    const S = typeof LiveDesk !== 'undefined' && LiveDesk.load ? LiveDesk.load() : {};
    const deskT = Object.assign({}, S.tickets || {});
    const audit = (typeof Live !== 'undefined' && Live.load().audit) || [];
    const moved = new Set(); for (const a of audit) if (/modify/.test(a.kind || '') && !/failed/.test(a.kind || '')){ const m = /Ticket (\d+)/.exec(a.text || ''); if (m) moved.add(m[1]); }
    const entries = {}; for (const e of raw.entries || []) if (own(e)) entries[String(e.position)] = e;
    const pos = {};
    for (const d of raw.deals || []){
      if (!own(d)) continue;
      const id = String(d.position);
      const p = pos[id] || (pos[id] = { id, broker: d.symbol, deals: [], closeVol: 0, closeVal: 0, net: 0, costs: 0, comm: 0, swap: 0, fee: 0, gross: 0, last: 0, closeComment: '' });
      p.deals.push(d);
      p.closeVol += d.volume || 0; p.closeVal += (d.volume || 0) * (d.price || 0);
      const c = (d.commission || 0) + (d.swap || 0) + (d.fee || 0);
      p.net += (d.profit || 0) + c; p.costs += c; p.gross += d.profit || 0; p.comm += d.commission || 0; p.swap += d.swap || 0; p.fee += d.fee || 0;
      if (d.time >= p.last){ p.last = d.time; p.closeComment = d.comment || ''; p.closeSide = d.type; }
    }
    const openTickets = new Set((raw.open || []).filter(own).map(p => String(p.ticket)));
    const trades = [];
    for (const p of Object.values(pos)){
      if (openTickets.has(p.id)) continue;                     // partly closed and still running: counted once it has closed
      const e = entries[p.id], o = orders[p.id], dk = deskT[p.id];
      if (e){ const c = (e.commission || 0) + (e.swap || 0) + (e.fee || 0); p.net += c; p.costs += c; p.comm += e.commission || 0; p.swap += e.swap || 0; p.fee += e.fee || 0; }
      const sym = o && o.sym ? o.sym : this.astraSym(p.broker);
      const dir = o && o.dir ? o.dir : e ? (e.type === 'buy' ? 1 : -1) : (p.closeSide === 'sell' ? 1 : -1);
      const lots = e ? e.volume : (o && o.lots) || p.closeVol;
      const entry = e ? e.price : (o && o.entry) || (dk && dk.entry) || null;
      const entryTime = e ? this.utcMs(e.time) : (o && o.at) || (dk && dk.openedAt) || this.utcMs(p.last);
      const exitTime = this.utcMs(p.last), exit = p.closeVol > 0 ? p.closeVal / p.closeVol : null;
      const bot = (o && o.bot) || (dk && dk.bot) || this.botFromComment(e && e.comment) || '?';
      const sl0 = o && o.sl > 0 ? o.sl : dk && dk.sl0 > 0 ? dk.sl0 : null, tp0 = o && o.tp > 0 ? o.tp : null;
      /* MetaTrader's value of one price point per lot: from its contract list, or - exactly - from what
         this very trade paid: profit ÷ (price moved × lots) */
      const gross = p.gross;
      const pv = this.pointValue(sym, p.broker) || (entry != null && exit != null && exit !== entry && lots > 0 ? Math.abs(gross / ((exit - entry) * lots)) : 0);
      const risk = sl0 != null && entry != null && pv > 0 ? Math.abs(entry - sl0) * lots * pv : 0;
      const t = { live: true, ticket: p.id, bot, botName: (o && o.botName) || null, sym, broker: p.broker, dir,
        qty: lots, lots, entry, exit, entryTime, exitTime, sl: sl0, tp: tp0, tf: (o && o.tf) || '?', model: (o && o.model) || '',
        origin: o ? (o.desk ? 'desk' : bot === 'liveManual' ? 'manual' : 'armed') : dk ? 'desk' : bot === 'liveManual' ? 'manual' : '?',
        pnl: +p.net.toFixed(2), fees: +(-p.costs).toFixed(2), pv, risk: +risk.toFixed(2),
        r: risk > 0 ? +(p.net / risk).toFixed(2) : NaN, touched: moved.has(p.id) || (/^\[sl/i.test(p.closeComment) && p.net > 0),
        deals: p.deals.slice().sort((a, b) => a.time - b.time), entryDeal: e || null, order: o || null,
        closeComment: p.closeComment, partial: p.deals.length > 1 };
      Object.assign(t, this.howClosed(Object.assign({}, p, { touched: t.touched }), audit));
      if (t.closedBy){ t.closedBy.sl = sl0; t.closedBy.tp = tp0; }
      /* the costs of getting in and out - what the result paid before the market even moved */
      t.commission = +p.comm.toFixed(2); t.swap = +p.swap.toFixed(2); t.fee = +p.fee.toFixed(2); t.gross = +p.gross.toFixed(2);
      Object.assign(t, this.costsOf(t, o));
      trades.push(t);
    }
    const open = (raw.open || []).filter(own).map(p => {
      const o = orders[String(p.ticket)], dk = deskT[String(p.ticket)];
      const sym = o && o.sym ? o.sym : this.astraSym(p.symbol);
      return { live: true, ticket: String(p.ticket), bot: (o && o.bot) || (dk && dk.bot) || this.botFromComment(p.comment) || '?', sym, broker: p.symbol,
        dir: p.type === 'buy' ? 1 : -1, lots: p.volume, qty: p.volume, entry: p.price_open, entryTime: this.utcMs(p.time), tf: (o && o.tf) || '?',
        origin: o ? (o.desk ? 'desk' : 'armed') : dk ? 'desk' : '?', floating: (p.profit || 0) + (p.swap || 0), sl: p.sl, tp: p.tp };
    });
    return { trades, open };
  },

  /* read MetaTrader through the bridge (read only); keep the last good read for when it is off */
  async refresh(force){
    if (this.busy) return; this.busy = true;
    const get = async path => { const r = await fetch(Live.BRIDGE + path, { cache: 'no-store', signal: AbortSignal.timeout(8000) }); if (!r.ok) throw Error('HTTP ' + r.status); return r.json(); };
    try {
      const [h, pr, dr] = await Promise.all([get('/health'), get('/positions'), get('/deals?days=365&entries=1')]);
      if (!Array.isArray(pr.positions) || !Array.isArray(dr.deals)) throw Error('the bridge answered without positions or deals');
      const raw = { magic: h.magic || (Live.bridge && Live.bridge.magic) || 20260902, open: pr.positions, deals: dr.deals, entries: dr.entries || null };
      const built = this.build(raw);
      /* prices right now, from MetaTrader, for every instrument these trades were on */
      const syms = [...new Set(built.trades.map(t => t.broker).concat(built.open.map(p => p.broker)))].filter(Boolean).slice(0, 60);
      let quotes = {};
      try { const qj = syms.length ? await get('/quotes?symbols=' + encodeURIComponent(syms.join(','))) : { quotes: [] }; for (const q of qj.quotes || []) quotes[q.symbol] = q; } catch(e){}
      built.account = { balance: h.balance, equity: h.equity, currency: h.currency || '' };
      built.todayDeals = (dr.deals || []).filter(d => this.isToday(this.utcMs(d.time)));
      built.allOpen = pr.positions;
      built.quotes = quotes;
      this.noteDayStart(built.account, built.todayDeals);
      const sig = built.trades.map(t => t.ticket + ':' + t.pnl).join(',') + '|' + built.open.map(p => p.ticket).join(',') + '|' + Math.round((h.equity || 0) * 100) + '|' + Object.values(quotes).map(q => q.bid).join(',');
      const changed = !this.data || this.data.sig !== sig || this.data.from !== 'bridge';
      this.data = Object.assign(built, { at: Date.now(), from: 'bridge', sig, oldBridge: !dr.entries, capped: dr.deals.length >= 500, currency: h.currency || '' });
      this.error = '';
      try { lsSet(this.CACHE_KEY, { at: this.data.at, raw, account: built.account, quotes }); } catch(e){}
      if (changed || force){ this.dirty = true; if (Bots.active === this.PAGE) Bots.render(); }
      else this.paintStatus();
    } catch(e){
      this.error = 'MetaTrader did not answer (' + e.message + ').';
      if (!this.data){ const c = lsGet(this.CACHE_KEY, null); if (c && c.raw){ this.data = Object.assign(this.build(c.raw), { at: c.at, from: 'saved', sig: '', account: c.account || null, quotes: c.quotes || {}, todayDeals: [], allOpen: c.raw.open || [] }); } }
      this.dirty = true; if (Bots.active === this.PAGE) Bots.render();
    } finally { this.busy = false; }
  },
  statusLine(){
    const d = this.data;
    const when = d ? new Date(d.at).toLocaleString() : '';
    const txt = !d ? (this.busy || !this.error ? 'Reading the real account from MetaTrader…' : this.error + ' Start MetaTrader and the bridge, then press Refresh.')
      : d.from === 'saved' ? this.error + ' Showing the last read, from ' + when + '.'
      : 'Real account · read from MetaTrader ' + when + (d.currency ? ' · figures in ' + d.currency : '') + ' · last 365 days' + (d.capped ? ' · the broker returned its maximum of 500 closes, older ones are left out' : '');
    const warn = !d || d.from === 'saved' || this.error;
    return `<div class="lvDiveStatus${warn ? ' warn' : ''}"><span>◉ ${esc(txt)}</span>${d && d.oldBridge ? '<span class="dim2"> · restart START-LIVE-TRADING.bat once so the opening deals (entry time, entry price, opening charges) load too</span>' : ''}<button class="bMini" data-lvdref="1"${this.busy ? ' disabled' : ''}>${this.busy ? 'Reading…' : '↻ Refresh'}</button></div>`;
  },
  paintStatus(){ const el = document.querySelector('#botBody .lvDiveStatus'); if (el) el.outerHTML = this.statusLine(); const n = document.querySelector('#botBody [data-lvdref]'); if (n) n.addEventListener('click', () => this.refresh(true)); },
  tabs(){ return Explorer.tabs.call(this) + this.statusLine(); },

  /* ---------- the account: where it stands now, and where it stood when today began ---------- */
  isToday(ms){ return new Date(ms).toDateString() === new Date().toDateString(); },
  DAY_KEY: 'astra_livedive_daystart',
  /* the first time ASTRA reads the account each day, the figures are kept: that is "this morning" */
  noteDayStart(acc, todayDeals){
    if (!acc || !(acc.balance > 0)) return;
    const k = new Date().toDateString(), cur = lsGet(this.DAY_KEY, null);
    if (cur && cur.day === k) return;
    const closedToday = todayDeals.reduce((a, d) => a + (d.profit || 0) + (d.commission || 0) + (d.swap || 0) + (d.fee || 0), 0);
    lsSet(this.DAY_KEY, { day: k, at: Date.now(), balance: acc.balance, equity: acc.equity, closedBefore: +closedToday.toFixed(2) });
  },
  acctOpen: false,
  accountSec(){
    const d = this.data, A = d && d.account;
    if (!A || !(A.balance > 0)) return '<div class="dim2">The account figures appear once MetaTrader answers.</div>';
    const cur = A.currency ? ' ' + A.currency : '', ex = v => (+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), m = v => (v > 0 ? '+' : v < 0 ? '−' : '') + ex(Math.abs(v));
    const net = x => (x.profit || 0) + (x.commission || 0) + (x.swap || 0) + (x.fee || 0);
    const today = d.todayDeals || [], closedToday = today.reduce((a, x) => a + net(x), 0);
    const floating = (d.allOpen || []).reduce((a, p) => a + (p.profit || 0) + (p.swap || 0), 0);
    /* the balance this morning = the balance now, minus what every trade closed today added */
    const startBal = A.balance - closedToday;
    const seen = lsGet(this.DAY_KEY, null), seenToday = seen && seen.day === new Date().toDateString() ? seen : null;
    const change = A.equity - startBal;
    const tradeOf = x => (this.all().find(t => t.ticket === String(x.position)) || null);
    const rows = today.slice().sort((a, b) => a.time - b.time).map(x => {
      const t = tradeOf(x), when = new Date(this.utcMs(x.time)).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const label = (t ? (t.dir > 0 ? 'BUY ' : 'SELL ') + baseAsset(t.sym) + ' · ' + this.dim('bot').name(t.bot) : esc(x.symbol) + ' · not an ASTRA trade');
      const v = net(x);
      return `<div class="lvAcctRow">${t ? `<a class="exDoor" data-exact="${esc(this.tradeAct(t))}" role="button" tabindex="0" title="Open this trade">${esc(label)}</a>` : `<span>${label}</span>`}<span class="dim2">closed ${when}</span><b class="${v >= 0 ? 'up' : 'down'}">${m(v)}</b></div>`; }).join('');
    const openRows = (d.allOpen || []).map(p => { const v = (p.profit || 0) + (p.swap || 0);
      return `<div class="lvAcctRow"><span>${p.type === 'buy' ? 'BUY' : 'SELL'} ${esc(p.symbol)} · ${p.volume} lot · still open</span><span class="dim2">${p.comment ? esc(p.comment) : ''}</span><b class="${v >= 0 ? 'up' : 'down'}">${m(v)}</b></div>`; }).join('');
    return `<div class="lvAcct">
      <button class="lvAcctBig" data-lvacct="1" title="${this.acctOpen ? 'Fold the breakdown' : 'Show how the account moved today'}">
        <span>Account total now${cur ? ' · ' + esc(A.currency) : ''}</span><b>${ex(A.equity)}</b>
        <small>balance ${ex(A.balance)}${floating ? ' · open trades ' + m(floating) : ''}</small>
        <em class="${change >= 0 ? 'up' : 'down'}">${m(change)} since today began ${this.acctOpen ? '▾' : '▸'}</em></button>
      ${this.acctOpen ? `<div class="lvAcctBody">
        <div class="lvAcctRow head"><span>When today began</span><span class="dim2">balance before any trade closed today</span><b>${ex(startBal)}</b></div>
        ${seenToday ? `<div class="lvAcctRow"><span class="dim2">First read by ASTRA today, ${new Date(seenToday.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span><span class="dim2">balance ${ex(seenToday.balance)} · total ${ex(seenToday.equity)}</span><b></b></div>` : ''}
        ${rows || '<div class="lvAcctRow"><span class="dim2">No trade has closed today yet.</span><span></span><b></b></div>'}
        <div class="lvAcctRow head"><span>Balance now</span><span class="dim2">${today.length} trade${today.length === 1 ? '' : 's'} closed today · ${m(closedToday)}</span><b>${ex(A.balance)}</b></div>
        ${openRows}
        <div class="lvAcctRow head"><span>Account total now</span><span class="dim2">balance + open trades</span><b>${ex(A.equity)}</b></div>
        <p class="dim2">Counts every trade on the account (ASTRA's and any you placed in MetaTrader). Money you deposited or withdrew today is not a trade and is not in this list.</p>
      </div>` : ''}
    </div>`;
  },
  /* the account and the costs sit in their OWN sections: they never freeze with the picture */
  extraSecs(rows, st){
    return [
      { id: 'account', html: this.section('account', 'The account', 'the real total now · press it to see where today began', this.accountSec()) },
      { id: 'costs', html: this.section('costs', 'What trading cost', 'spread, slippage and the broker’s charges on these trades', this.costsStrip(rows)) },
    ];
  },
  layoutList(){
    const l = Explorer.layoutList.call(this);
    l.splice(1, 0, { id: 'account', label: 'The account — total now and since today began', icon: '◉' }, { id: 'costs', label: 'What trading cost — spread, slippage, charges', icon: '€' });
    return l;
  },

  /* ---------- where the price is now, against the trade's own levels ---------- */
  nowOf(t){
    const q = this.data && this.data.quotes && this.data.quotes[t.broker];
    if (!q) return null;
    const px = t.dir > 0 ? (q.bid || q.last) : (q.ask || q.last);          // the side the trade would close on
    return px > 0 ? px : null;
  },
  rowExtra(t){
    const now = this.nowOf(t), px = v => v != null && v > 0 ? fmtPrice(v) : '—';
    const held = now != null && t.entry > 0 && t.pv > 0 ? (now - t.entry) * t.dir * t.lots * t.pv - (t.fees || 0) : null;
    const tp = t.tp > 0 ? t.tp : null, sl = t.sl > 0 ? t.sl : null;
    const away = (lvl, good) => { if (now == null || lvl == null) return ''; const dist = (lvl - now) * t.dir * (good ? 1 : -1);
      return dist <= 0 ? ' <i class="' + (good ? 'up' : 'down') + '">passed</i>' : ' <i class="dim2">' + fmtPrice(Math.abs(lvl - now)) + ' away</i>'; };
    return `<div class="lvRowPx">
      <span>Entry <b>${px(t.entry)}</b></span><span>Exit <b>${px(t.exit)}</b></span>
      <span class="lvNow">Now <b>${px(now)}</b></span>
      ${tp ? `<span>Target <b class="up">${px(tp)}</b>${away(tp, true)}</span>` : ''}${sl ? `<span>Stop <b class="down">${px(sl)}</b>${away(sl, false)}</span>` : ''}
      ${held != null ? `<span title="What this trade would show if it had never been closed">Held until now <b class="${held >= 0 ? 'up' : 'down'}">${this.money(held)}</b> <i class="dim2">vs ${this.money(t.pnl)} taken</i></span>` : ''}
    </div>`;
  },
  /* bots first: on arrival the picture is followed straight away by "which bots traded" */
  secState(){
    const st0 = lsGet(this.SEC_KEY, null);
    if (!st0) lsSet(this.SEC_KEY, { order: ['hero', 'account', 'split:bot', 'costs', 'notes', 'curve'], fold: {}, max: null, h: {}, hidden: {}, g12: true });
    /* layouts saved before the account and cost sections existed: put them right after the picture once */
    else if (st0.order && !st0.order.includes('account')){ const i = Math.max(0, st0.order.indexOf('hero') + 1); st0.order.splice(i, 0, 'account', 'costs'); lsSet(this.SEC_KEY, st0); }
    return Explorer.secState.call(this);
  },
  layoutReset(){ lsSet(this.SEC_KEY, null); this.dirty = true; Bots.render(); toast('Live Deep Dive layout back to the original', 'info'); },

  /* real money: value and risk from MetaTrader's own value per lot */
  invested(t){ return t.pv > 0 && t.entry > 0 ? Math.abs(t.lots * t.pv * t.entry) : 0; },
  risked(t){ return t.risk || 0; },
  cash(t, px){ return (px - t.entry) * t.dir * t.lots * (t.pv || 0) - (t.fees || 0); },
  notesTitle(){ const b = this.notesBot(); const n = this.notesAll().filter(x => !b || x.bot === b).length; return (b ? 'Notes on ' + this.botName(b) + ' · real account' : 'Notes on the real trades') + (n ? ' (' + n + ')' : ''); },
  tradeName(t){ return t ? (t.dir > 0 ? 'BUY ' : 'SELL ') + baseAsset(t.sym) + ' · #' + t.ticket : ''; },

  /* one real trade, all the way down: every deal MetaTrader holds for it */
  hero(rows, st, open){
    const top = Explorer.hero.call(this, rows, st, open);
    if (rows.length !== 1) return top;
    const t = rows[0], f = (k, v) => `<div><dt>${esc(k)}</dt><dd>${v == null || v === '' ? '<span class="dim2">not known</span>' : v}</dd></div>`;
    const px = v => v != null && Number.isFinite(+v) ? fmtPrice(+v) : null;
    const dealRow = (d, kind) => `<tr><td>${esc(kind)}</td><td>#${esc(String(d.ticket))}</td><td>${new Date(this.utcMs(d.time)).toLocaleString()}</td><td>${esc(String(d.volume))}</td><td>${px(d.price)}</td>
      <td class="${(d.profit || 0) >= 0 ? 'up' : 'down'}">${d.profit != null ? this.money(d.profit) : ''}</td><td>${fmtNum(d.commission || 0)}</td><td>${fmtNum(d.swap || 0)}</td><td>${fmtNum(d.fee || 0)}</td><td class="dim2">${esc(d.comment || '')}</td></tr>`;
    return top + `<div class="lvDiveTrade">
      <h4>Position #${esc(t.ticket)} · ${t.dir > 0 ? 'BUY' : 'SELL'} ${esc(t.broker)} · ${esc(String(t.lots))} lot${t.lots === 1 ? '' : 's'}</h4>
      <dl class="liveDiveFields">
        ${f('Bot', esc(this.dim('bot').name(t.bot)))}${f('Who sent it', esc(this.dim('origin').name(t.origin)))}${f('Timeframe', t.tf !== '?' ? esc(t.tf) : '')}${f('Signal', esc(t.model))}
        ${f('Opened', new Date(t.entryTime).toLocaleString())}${f('Closed', new Date(t.exitTime).toLocaleString())}${f('Entry price', px(t.entry))}${f('Exit price' + (t.partial ? ' (average)' : ''), px(t.exit))}
        ${f('Stop sent with the order', px(t.sl))}${f('Target sent with the order', px(t.tp))}${f('Risk at the stop', t.risk > 0 ? fmtNum(t.risk) : '')}${f('Result in R', Number.isFinite(t.r) ? (t.r >= 0 ? '+' : '') + t.r.toFixed(2) + 'R' : '')}
        ${f('How it ended', esc(t.reason))}${f('Held for', esc(this.fmtDur(t.exitTime - t.entryTime)))}${f('Session opened in', esc(this.dim('session').name(this.sessionOf(t.entryTime))))}
        ${f('Before charges', this.money(t.gross))}${f('Commission', fmtNum(t.commission))}${f('Swap', fmtNum(t.swap))}${f('Other fees', fmtNum(t.fee))}
        ${f('Spread when sent', t.spread > 0 ? fmtPrice(t.spread) + (t.spreadCost != null ? ' · ' + fmtNum(t.spreadCost) + ' on this size' : '') + ' · ' + ({ measured: 'measured', model: 'from the cost model', estimate: 'estimated (older order)' })[t.spreadSrc] : '')}
        ${f('Signal price → fill', t.order && t.order.sigEntry > 0 ? fmtPrice(t.order.sigEntry) + ' → ' + fmtPrice(t.entry) + (t.slipCost != null ? ' · ' + (t.slipCost > 0 ? 'cost ' : t.slipCost < 0 ? 'gained ' : '') + fmtNum(Math.abs(t.slipCost)) : '') : '')}${f('Price age when sent', t.order && t.order.quoteAge != null ? t.order.quoteAge + ' s' : '')}${f('Net result', '<b class="' + (t.pnl >= 0 ? 'up' : 'down') + '">' + this.money(t.pnl) + '</b>')}${f('Value per price point per lot', t.pv > 0 ? fmtNum(t.pv) : '')}
      </dl>
      <table class="lvDiveDeals"><thead><tr><th>Deal</th><th>Ticket</th><th>Time (your clock)</th><th>Lots</th><th>Price</th><th>Profit</th><th>Commission</th><th>Swap</th><th>Fee</th><th>MetaTrader comment</th></tr></thead>
        <tbody>${t.entryDeal ? dealRow(t.entryDeal, 'Opened') : ''}${t.deals.map((d, i) => dealRow(d, t.deals.length > 1 ? 'Closed part ' + (i + 1) : 'Closed')).join('')}</tbody></table>
      ${!t.entryDeal ? '<p class="dim2">The opening deal was not read — restart the live bridge once so it is included.</p>' : ''}
      ${this.rowExtra(t)}
      <p><button class="bMini" data-exreplay="${esc(t.bot)}|${t.entryTime}|${t.exitTime || 0}|${esc(t.sym)}">▷ Replay this real trade</button> <button class="bMini" data-lvdchart="${esc(t.sym)}">Open the ${esc(baseAsset(t.sym))} chart ↗</button></p>
    </div>`;
  },

  /* what trading cost on these trades - every figure opens the card that splits it */
  costsStrip(rows){
    if (!rows.length) return '';
    const sum = k => rows.reduce((a, t) => a + (Number.isFinite(t[k]) ? t[k] : 0), 0);
    const sp = rows.filter(t => t.spreadCost > 0), spM = sp.filter(t => t.spreadSrc !== 'estimate').length;
    const sl = rows.filter(t => t.slipCost != null), slN = sum('slipCost');
    const comm = sum('commission'), swap = sum('swap'), fee = sum('fee'), gross = sum('gross'), net = sum('pnl');
    const spreadSum = sp.reduce((a, t) => a + t.spreadCost, 0);
    const box = (label, val, sub, act, tip, cls) => `<div class="lvCost${act ? ' exAct' : ''}"${act ? ` data-exact="${esc(act)}" role="button" tabindex="0" title="${esc(tip)}"` : ''}><span>${esc(label)}</span><b class="${cls || ''}">${val}</b><small>${sub}</small></div>`;
    const m = v => (v > 0 ? '+' : v < 0 ? '−' : '') + fmtNum(Math.abs(v));
    return `<div class="lvCosts"><div class="lvCostsHead">On these ${rows.length} real trade${rows.length === 1 ? '' : 's'} <span class="dim2">· press a figure to split the trades by it</span></div><div class="lvCostRow">
      ${box('Before charges', m(gross), 'the price moves alone', 'sec:split:result', 'Winners and losers side by side', gross >= 0 ? 'up' : 'down')}
      ${box('Commission', m(comm), comm ? 'opening + closing' : 'none charged', 'sec:split:charges', 'Split the trades by the charges they paid', comm < 0 ? 'down' : '')}
      ${box('Swap', m(swap), rows.filter(t => t.swap).length + ' held overnight', 'sec:split:charges', 'Split the trades by the charges they paid', swap < 0 ? 'down' : swap > 0 ? 'up' : '')}
      ${box('Other fees', m(fee), fee ? 'broker fees' : 'none charged', 'sec:split:charges', 'Split the trades by the charges they paid', fee < 0 ? 'down' : '')}
      ${box('Net result', m(net), 'after every charge', 'list', 'Open every trade', net >= 0 ? 'up' : 'down')}
      ${box('Spread paid', sp.length ? fmtNum(spreadSum) : '—', sp.length ? (spM ? spM + ' measured' : '') + (sp.length - spM ? (spM ? ' · ' : '') + (sp.length - spM) + ' estimated' : '') + ' · already inside the prices' : 'not known', 'sec:split:spreadB', 'Split the trades by how much of their risk the spread took')}
      ${box('Slippage', sl.length ? m(-slN) : '—', sl.length ? sl.length + ' of ' + rows.length + ' recorded · fill vs signal price' : 'recorded on new orders from now on', 'sec:split:slip', 'Split the trades by how they were filled', slN > 0 ? 'down' : slN < 0 ? 'up' : '')}
      ${box('Opened in', '', 'which session paid best', 'sec:split:session', 'Split the trades by the session they were opened in')}
    </div></div>`;
  },

  /* Replay: the paper twin of this trade (the same bot, same pair, same signal) if it exists; otherwise the chart */
  /* Replay: the REAL trade itself - its real entry, exit, stop and target, candle by candle,
     and on to now (Trade Replay also says whether the target was reached after the exit) */
  replay(bot, entryTime, exitTime, sym){
    const t = this.all().find(x => x.bot === bot && x.entryTime === entryTime && x.sym === sym);
    if (!t) return toast('That real trade is no longer in the broker history that was read', 'warn');
    if (typeof TradeReview === 'undefined') return toast('Trade Replay is not loaded', 'warn');
    const rec = { bot: t.bot, botName: 'REAL · ' + this.dim('bot').name(t.bot), sym: t.sym, dir: t.dir, entry: t.entry, exit: t.exit,
      sl: t.sl, tp: t.tp, qty: t.lots, lots: t.lots, pnl: t.pnl, r: Number.isFinite(t.r) ? t.r : null, fees: t.fees,
      slippage: t.slipCost, entryTime: t.entryTime, exitTime: t.exitTime, tf: t.tf !== '?' ? t.tf : '15m', reason: t.reason, touched: t.touched,
      reasons: [t.model, 'Real position #' + t.ticket + ' on MetaTrader'].filter(Boolean), live: true, ticket: t.ticket };
    if (!(rec.entry > 0)) return toast('The entry price of this trade is not known — restart the live bridge once so the opening deals load', 'warn');
    TradeReview.show();
    if (typeof ObsWindows !== 'undefined' && ObsWindows.set) ObsWindows.set('replay', 'max');
    setTimeout(() => TradeReview.select(rec), 150);
  },

  timer: null,
  bind(host){
    Explorer.bind.call(this, host);
    host.querySelectorAll('[data-lvdref]').forEach(b => b.addEventListener('click', () => this.refresh(true)));
    host.querySelectorAll('[data-lvacct]').forEach(b => b.addEventListener('click', () => { this.acctOpen = !this.acctOpen; this.dirty = true; Bots.render(); }));
    host.querySelectorAll('.lvAcct [data-exact], .lvCosts [data-exact]').forEach(b => { const go = e => { e.stopPropagation(); this.act(b.dataset.exact); }; b.addEventListener('click', go); b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' '){ e.preventDefault(); go(e); } }); });
    host.querySelectorAll('[data-lvdchart]').forEach(b => b.addEventListener('click', () => WorkspaceUI.openChart(b.dataset.lvdchart)));
    if (!this.data || Date.now() - this.data.at > 20e3) this.refresh();
    clearInterval(this.timer);
    this.timer = setInterval(() => { if (Bots.active === this.PAGE && document.querySelector('#botBody .exWrap')) this.refresh(); else { clearInterval(this.timer); this.timer = null; } }, 30e3);
  },
});
LiveDive.path = lsGet(LiveDive.PATH_KEY, []) || [];
LiveDive.excludes = lsGet(LiveDive.EXCL_KEY, {}) || {};
/* placed right after the Deep Dive in the menu */
(() => {
  const at = BOTS.findIndex(b => b.id === 'explorer');
  const entry = { id: 'livedive', name: 'Live Deep Dive', analysis: true, liveDive: true,
    blurb: 'Every REAL trade ASTRA made on the MetaTrader account, opened like a Russian doll: start with every bot that traded, press one, then a pair, a timeframe, a side, a day — down to the broker’s own deals of a single trade. Read only.',
    defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 }, warmup: 0, signal: () => null };
  if (at >= 0) BOTS.splice(at + 1, 0, entry); else BOTS.push(entry);
  BOT_BY_ID.livedive = entry;
})();
