/* ASTRA Terminal — the LIVE DESK: automatic bots on the real account, on
   your terms.

   The desk sits on top of the live engine (live.js) and changes nothing about
   its four gates. What it adds is the PREFERENCES an automatic real-money run
   is made of, in one place, in plain words:

     BOT MONEY   — how much of the account the bots may treat as theirs.
                   100 USD of 800.50 means every size is worked out from 100,
                   the margin they tie up may never pass 100, and losing the
                   100 switches the desk off. The other 700.50 is invisible to them.
     EXIT RULES  — a minimum target (0.30%, 1%…). When a real trade reaches it
                   the desk either LOCKS the stop into profit and trails it, or
                   EXITS at the market. Your choice. The stop is only ever moved
                   in the trade's favour, never widened, never removed.
     WHICH BOTS  — tick any bot yourself, or let the desk choose the best-ranked
                   ready bots on its own (and re-choose as the ranking changes).
     PER BOT     — open a bot and set ITS markets, pairs, timeframes, stops and
                   exit rules, matryoshka-style: bot → market → pair. Anything
                   you leave alone is AUTOMATIC. A bot with nothing set simply
                   mirrors its paper twin; a bot you have shaped is run by the
                   desk itself, with the bot's own strategy, on your terms.

   Arming the desk is typed (ARM THE DESK) and puts every chosen bot in SHADOW.
   Real money needs the second typed phrase (TRADE REAL MONEY), the bridge
   started by START-LIVE-TRADING.bat and its session code — exactly as before.
   The kill switch still disarms everything at once.

   Stored under its own key (astra_livedesk); nothing about the older live
   state or the bots' ledgers changes shape. */
const LiveDesk = {

  KEY: 'astra_livedesk',
  ARM_PHRASE: 'ARM THE DESK',
  LIVE_PHRASE: 'TRADE REAL MONEY',
  AUTO_REPICK_MS: 4 * 3600 * 1000,      // the automatic choice is revisited this often
  SCAN_EVERY: 60 * 1000,                 // the desk's own scans of the bots it runs itself
  TFS: ['1m', '5m', '15m', '1h', '4h', '1d'],

  state: null, timer: null, scanTimer: null, pulseTimer: null, busy: false, scanning: false, specsAsked: 0, ledgers: {},

  defaults(){
    return {
      on: false,
      budget: { mode: 'usd', value: 100 },
      riskPct: 1,                 // % of the bot money risked per trade
      maxOpen: 3,                 // real positions the desk may hold at once
      maxDailyLossPct: 5,         // % of the bot money lost today → no new trades today
      marginCapPct: 100,          // margin tied up by desk positions ≤ this % of the bot money
      minReady: 4,                // readiness conditions (of 6) the AUTOMATIC choice needs
      bots: { mode: 'manual', count: 3, picked: [] },
      perBot: {},                 // id → { markets, pairsOff, tfs, exit, stops, open }
      markets: { mode: 'auto', groups: [] },
      tfs: { mode: 'auto', list: [] },
      pairs: { mode: 'auto', blocked: [] },
      excl: [],                   // 'botId|marketId' cells un-ticked in the matrix
      side: 'both',               // 'both' | 'buy' | 'sell' — the desk's default; a bot may have its own
      stops: { mode: 'bot', slPct: 0.5, tpPct: 1.0 },
      exit: { targetPct: 0.5, onTarget: 'lock', lockPct: 0.1, trail: true, trailGapPct: 0.3, trailFrom: 'lock' },
      ui: { order: [], folded: {}, half: { money: true, exit: true } },
      startedAt: 0, startBalance: null, autoPickedAt: 0, autoPicked: [],
      tickets: {}, closedTickets: {}, everArmed: {}, skip: {}, refusals: {}, seen: {}, scanCursor: {},
      stats: { day: '', seen: 0, passed: 0, ceilings: 0, shadow: 0, real: 0, refused: 0 },
      botStats: {}, log: [],
    };
  },

  load(){
    if (this.state) return this.state;
    const d = this.defaults(), s = lsGet(this.KEY, null) || {};
    for (const k of Object.keys(d)){
      if (d[k] && typeof d[k] === 'object' && !Array.isArray(d[k])) s[k] = Object.assign({}, d[k], s[k] || {});
      else if (s[k] === undefined) s[k] = d[k];
    }
    /* the first version chose bots automatically by default; now you tick them */
    if (!s.v){ s.v = 2; s.bots.mode = 'manual'; }
    this.state = s;
    return s;
  },
  save(){ lsSet(this.KEY, this.state); },
  isOn(){ return !!this.load().on; },

  note(kind, text, data){
    const S = this.load();
    S.log.unshift({ t: Date.now(), kind, text });
    if (S.log.length > 80) S.log.length = 80;
    this.save();
    if (typeof Live !== 'undefined') Live.audit('desk-' + kind, text, data || null);
  },

  /* ================= counters that feed the picture ================= */
  dayStats(){
    const S = this.load(), k = Live.dayKey();
    if (S.stats.day !== k){ S.stats = { day: k, seen: 0, passed: 0, ceilings: 0, shadow: 0, real: 0, refused: 0 }; for (const id of Object.keys(S.botStats)) Object.assign(S.botStats[id], { seen: 0, shadow: 0, real: 0, refused: 0 }); }
    return S.stats;
  },
  botStat(id){
    const S = this.load();
    return S.botStats[id] || (S.botStats[id] = { lastScan: 0, lastSignalAt: 0, lastText: '', seen: 0, shadow: 0, real: 0, refused: 0, scans: 0 });
  },
  /* every signal a desk bot hands over, before any gate */
  saw(bot, sig){
    const st = this.dayStats(); st.seen++;
    const bs = this.botStat(bot.id); bs.seen++; bs.lastSignalAt = Date.now();
    bs.lastText = (sig.dir > 0 ? 'BUY ' : 'SELL ') + baseAsset(sig.sym) + ' ' + (sig.tf || '') + ' signal';
    this.save();
  },
  passedDesk(){ const st = this.dayStats(); st.passed++; this.save(); },
  sent(bot, sig, real, lots){
    const st = this.dayStats(); st.ceilings++; if (real) st.real++; else st.shadow++;
    const bs = this.botStat(bot.id); if (real) bs.real++; else bs.shadow++;
    bs.lastText = (real ? 'REAL ' : 'shadow ') + (sig.dir > 0 ? 'BUY ' : 'SELL ') + baseAsset(sig.sym) + ' ' + lots + ' lot';
    this.save();
  },
  /* a refused desk order is written down once per bot and pair — not on every
     cycle — so the log says WHY nothing is happening without drowning in it */
  refused(bot, sig, reason, stage, quiet){
    const S = this.load();
    const st = this.dayStats(); st.refused++;
    if (stage === 'ceiling') st.passed++;
    const bs = this.botStat(bot.id); bs.refused++; if (!quiet) bs.lastText = baseAsset(sig.sym) + ' refused: ' + reason;
    const k = bot.id + '|' + sig.sym;
    if (!quiet && S.refusals[k] !== reason){ S.refusals[k] = reason; this.note('refused', bot.name + ' · ' + baseAsset(sig.sym) + ' — not sent: ' + reason); }
    else this.save();
  },

  /* ================= money ================= */
  account(){
    const B = (typeof Live !== 'undefined' && Live.bridge) || {};
    const F = (typeof Feed !== 'undefined' && Feed.account) || {};
    const bal = Number.isFinite(F.balance) ? F.balance : (Number.isFinite(B.balance) ? B.balance : null);
    const eq = Number.isFinite(F.equity) ? F.equity : bal;
    return { balance: bal, equity: eq, currency: F.currency || B.currency || 'USD',
             leverage: B.leverage || F.leverage || this.load().leverage || null, known: bal != null };
  },
  budget(){
    const S = this.load(), a = this.account();
    const raw = S.budget.mode === 'pct' ? (a.balance || 0) * S.budget.value / 100 : S.budget.value;
    const capped = a.known ? Math.min(raw, a.balance) : raw;
    return Math.max(0, +(capped || 0).toFixed(2));
  },
  isDeskPos(p){
    const S = this.load();
    if (S.tickets[p.ticket]) return true;
    const id = (p.comment || '').replace('ASTRA ', '').trim();
    return !!(id && Live.state && Live.state.armed[id] && Live.state.armed[id].desk);
  },
  deskPositions(){
    if (typeof Live === 'undefined') return [];
    Live.loadBook();
    return (Live.book.open || []).filter(p => this.isDeskPos(p));
  },
  deskClosed(){
    const S = this.load();
    if (typeof Live === 'undefined') return [];
    Live.loadBook();
    const closedT = S.closedTickets || {};
    return (Live.book.closed || []).filter(t => t.time >= (S.startedAt || 0) && (S.tickets[t.ticket] || closedT[t.ticket] || (S.everArmed || {})[t.bot]));
  },
  pnlSince(){ return +this.deskClosed().reduce((a, t) => a + (t.net || 0), 0).toFixed(2); },
  openPnl(){ return +this.deskPositions().reduce((a, p) => a + (p.profit || 0) + (p.swap || 0), 0).toFixed(2); },
  budgetNow(){ return +(this.budget() + this.pnlSince() + this.openPnl()).toFixed(2); },
  dayPnl(){
    const k = Live.dayKey();
    return +this.deskClosed().filter(t => t.day === k).reduce((a, t) => a + (t.net || 0), 0).toFixed(2);
  },
  /* money the open stops would cost if every one were hit from the entry */
  atRisk(){
    let sum = 0;
    for (const r of this.chartRows()){ if (!this.isDeskPos(r.raw)) continue; const p = r.p; if (p.sl > 0) sum += Math.max(0, (p.entry - p.sl) * p.dir * p.qty * p.meta.accountFx.loss); }
    return +sum.toFixed(2);
  },
  marginOf(sym, lots, price){
    const spec = typeof Feed !== 'undefined' && Feed.specFor ? Feed.specFor(sym) : null;
    const lev = this.account().leverage;
    if (!spec || !(spec.contractSize > 0) || !(lev > 0) || !(price > 0)) return null;
    return lots * spec.contractSize * price / lev;
  },
  marginUsed(){
    let sum = 0, unknown = 0;
    for (const p of this.deskPositions()){
      const m = this.marginOf(p.symbol, p.volume, p.price_open);
      if (m == null) unknown++; else sum += m;
    }
    return { sum: +sum.toFixed(2), unknown };
  },
  size(sig){
    const S = this.load();
    const pool = this.budgetNow();
    if (!(pool > 0)) return { ok: false, why: 'the bot money is used up (' + fmtNum(pool) + ')' };
    const r = Live.liveLots(sig, { riskBase: pool, riskPct: S.riskPct, balance: this.account().balance });
    if (!r.ok) return r;
    const q = Bots.quoteFor(sig.sym);
    const m = this.marginOf(sig.sym, r.lots, (q && q.price) || sig.entry);
    if (m != null){
      const used = this.marginUsed().sum;
      const cap = pool * (S.marginCapPct || 100) / 100;
      if (used + m > cap)
        return { ok: false, why: 'it would tie up ' + fmtNum(m) + ' of margin — the desk already holds ' + fmtNum(used) +
          ' of its ' + fmtNum(cap) + ' (' + S.marginCapPct + '% of the bot money)' };
      r.margin = +m.toFixed(2);
    }
    return r;
  },

  /* ================= the bots ================= */
  candidates(){
    const rows = (typeof BotReports !== 'undefined') ? BotReports.rows() : [];
    return BOTS.filter(b => !Bots.isPage(b) && !b.manual && !b.liveManual && !Bots.disabled(b.id))
      .map(b => {
        const row = rows.find(r => r.id === b.id) || null;
        const cfg = Bots.cfg(b.id) || {};
        return { b, row, ready: Live.readiness(b.id), paused: !!cfg.paused, cfg };
      })
      .sort((x, y) => ((y.row && y.row.rank) || -9) - ((x.row && x.row.rank) || -9));
  },
  /* the automatic choice needs the evidence door; a bot YOU tick only needs to be running */
  autoEligible(c){ return c.ready.met >= (this.load().minReady || 4) && !c.paused; },
  runnable(c){ return !c.paused; },
  autoPick(force){
    const S = this.load();
    const cands = this.candidates();
    const fresh = S.autoPicked.filter(id => { const c = cands.find(x => x.b.id === id); return c && this.autoEligible(c); });
    const pool = cands.filter(c => this.autoEligible(c));
    const due = force || !S.autoPickedAt || Date.now() - S.autoPickedAt > this.AUTO_REPICK_MS || fresh.length < Math.min(S.bots.count, pool.length);
    if (!due) return fresh;
    const pick = pool.slice(0, Math.max(1, S.bots.count)).map(c => c.b.id);
    const changed = pick.join() !== S.autoPicked.join();
    S.autoPicked = pick; S.autoPickedAt = Date.now();
    this.save();
    if (changed && S.on) this.note('pick', 'Automatic choice: ' + (pick.map(id => (BOT_BY_ID[id] || {}).name || id).join(', ') || 'no bot qualifies'));
    return pick;
  },
  selected(){
    const S = this.load();
    const cands = this.candidates();
    if (S.bots.mode === 'auto') return this.autoPick(false);
    return S.bots.picked.filter(id => { const c = cands.find(x => x.b.id === id); return c && this.runnable(c); });
  },
  managedIds(){
    if (typeof Live === 'undefined') return [];
    Live.load();
    return Object.keys(Live.state.armed).filter(id => Live.state.armed[id].desk);
  },
  mode(){
    const S = this.load();
    if (!S.on) return 'off';
    const ids = this.managedIds();
    if (ids.some(id => Live.state.armed[id].mode === 'live')) return 'live';
    return 'shadow';
  },

  /* ================= per-bot preferences (the matryoshka) ================= */
  pb(id){
    const S = this.load();
    return S.perBot[id] || (S.perBot[id] = { markets: null, pairsOff: [], tfs: null, exit: null, stops: null, side: null, open: false });
  },
  /* the markets a bot trades on its own — the starting point of its chips */
  ownMarkets(bot){
    const gs = [];
    for (const s of Bots.allowed(bot)){ const g = Bots.groupOf(s); if (g && !gs.includes(g)) gs.push(g); }
    if (gs.length) return gs;
    const cfg = Bots.cfg(bot.id) || {};
    return (cfg.groups && cfg.groups.length) ? cfg.groups.slice() : Object.keys(this.groups()).filter(g => g !== 'stocks' && g !== 'other');
  },
  /* has this bot been shaped by hand? then the desk runs it itself */
  shaped(bot){ const p = this.pb(bot.id); return !!(p.markets || p.tfs); },
  deskRuns(bot){ return this.shaped(bot) || this.load().tfs.mode === 'manual' && this.load().tfs.list.length > 0; },
  groups(){ return Bots.marketGroups(); },
  groupsFor(bot){
    const S = this.load();
    if (bot){ const p = this.pb(bot.id); if (p.markets) return p.markets; }
    if (S.markets.mode === 'manual' && S.markets.groups.length) return S.markets.groups;
    return null;
  },
  /* every pair the account offers, live and not prohibited */
  universe(){
    let all = Bots.universe();
    if (typeof Feed !== 'undefined') all = all.filter(s => Feed.isLive(s));
    if (typeof PairRules !== 'undefined') all = all.filter(s => !PairRules.blocked(s));
    return all;
  },
  symbolsFor(bot){
    const S = this.load(), p = this.pb(bot.id);
    /* shaped by hand → the whole account, narrowed to the markets you ticked;
       untouched → exactly what the paper twin trades */
    let all = p.markets ? this.universe().filter(s => p.markets.includes(Bots.groupOf(s))) : Bots.allowed(bot);
    const G = p.markets ? null : this.groupsFor(null);
    if (G || S.excl.length){
      all = all.filter(s => {
        const g = Bots.groupOf(s);
        if (G && !G.includes(g)) return false;
        if (S.excl.includes(bot.id + '|' + g)) return false;
        return true;
      });
    }
    if (p.pairsOff.length) all = all.filter(s => !p.pairsOff.includes(s));
    if (S.pairs.blocked.length) all = all.filter(s => !S.pairs.blocked.includes(s));
    /* the bot's own ★ preferred pairs still go first */
    const cfg = Bots.cfg(bot.id) || {};
    if (cfg.preferred && cfg.preferred.length){
      const rank = s => cfg.preferred.indexOf(s);
      all = all.slice().sort((a, b) => (rank(a) < 0 ? 1e9 : rank(a)) - (rank(b) < 0 ? 1e9 : rank(b)));
    }
    return all;
  },
  tfsFor(bot){
    const S = this.load(), p = this.pb(bot.id);
    if (p.tfs && p.tfs.length) return p.tfs;
    if (S.tfs.mode === 'manual' && S.tfs.list.length) return S.tfs.list;
    return null;                                              /* automatic = the bot's own */
  },
  tfOk(bot, tf){ const list = this.tfsFor(bot); return !list || list.includes(tf); },
  stopsFor(bot){ const p = this.pb(bot.id); return p.stops || this.load().stops; },
  sideFor(bot){ const p = this.pb(bot.id); return p.side || this.load().side || 'both'; },
  sideOk(bot, dir){ const sd = this.sideFor(bot); return sd === 'both' || (sd === 'buy' && dir > 0) || (sd === 'sell' && dir < 0); },
  exitFor(botId){ const S = this.load(); const p = botId ? S.perBot[botId] : null; return (p && p.exit) || S.exit; },
  allSymbols(){
    const out = [];
    for (const id of this.selected()){ const b = BOT_BY_ID[id]; if (!b) continue; for (const s of this.symbolsFor(b)) if (!out.includes(s)) out.push(s); }
    return out;
  },
  levels(sig, bot){
    const st = bot ? this.stopsFor(bot) : this.load().stops;
    if (st.mode === 'percent' && sig.entry > 0){
      return { sl: sig.entry * (1 - sig.dir * st.slPct / 100), tp: st.tpPct > 0 ? sig.entry * (1 + sig.dir * st.tpPct / 100) : 0 };
    }
    return { sl: sig.sl, tp: sig.tp || 0 };
  },

  /* ================= the gate live.js consults for a desk bot ================= */
  gate(bot, sig){
    const S = this.load();
    if (!S.on) return { ok: false, why: 'the live desk is switched off' };
    if (!this.managedIds().includes(bot.id)) return { ok: false, why: 'the desk no longer runs ' + bot.name };
    /* a bot the desk runs itself: its paper twin's signals are not doubled */
    if (this.deskRuns(bot) && !sig.desk) return { ok: false, why: 'the desk runs ' + bot.name + ' itself on your settings — the paper signal is not doubled', quiet: true };
    if (!this.symbolsFor(bot).includes(sig.sym)) return { ok: false, why: baseAsset(sig.sym) + ' is outside the markets and pairs you allow ' + bot.name };
    if (!this.tfOk(bot, sig.tf)) return { ok: false, why: 'the ' + sig.tf + ' timeframe is not among the ones you allow ' + bot.name };
    if (!this.sideOk(bot, sig.dir)) return { ok: false, why: (sig.dir > 0 ? 'buying' : 'selling') + ' is switched off for ' + bot.name + ' (' + this.sideFor(bot) + ' only)' };
    const open = this.deskPositions();
    if (open.length >= S.maxOpen) return { ok: false, why: 'the desk already holds ' + open.length + ' real position' + (open.length > 1 ? 's' : '') + ' (its limit is ' + S.maxOpen + ')' };
    if (open.some(p => p.symbol === sig.sym)) return { ok: false, why: 'the desk is already in ' + baseAsset(sig.sym) };
    const pool = this.budget();
    if (!(pool > 0)) return { ok: false, why: 'no bot money has been set' };
    const day = this.dayPnl();
    if (day < -(pool * S.maxDailyLossPct / 100)) return { ok: false, why: 'the desk lost ' + fmtNum(-day) + ' today — its daily stop of ' + S.maxDailyLossPct + '% of the bot money is reached' };
    if (this.budgetNow() <= 0){
      this.off('the bot money is used up');
      return { ok: false, why: 'the bot money is used up — the desk switched itself off' };
    }
    const lv = this.levels(sig, bot);
    if (!(lv.sl > 0)) return { ok: false, why: 'no stop-loss' };
    const sized = this.size(Object.assign({}, sig, { sl: lv.sl }));
    if (!sized.ok) return { ok: false, why: sized.why };
    this.lastRisk = sized.riskCash;
    this.passedDesk();
    return { ok: true, sized, sl: lv.sl, tp: lv.tp };
  },

  /* ================= the desk's own scanner =================
     A bot you shaped (markets and/or timeframes of your own) is run HERE: the
     same strategy function the paper bot uses, on the pairs and timeframes
     you chose, once per closed candle, through the Master Brain and then the
     live gates. The paper twin keeps running on paper, untouched. */
  pseudoLedger(id){ return this.ledgers[id] || (this.ledgers[id] = BotEngine.blank(id)); },
  async scan(){
    const S = this.load();
    if (!S.on || this.scanning || typeof API === 'undefined') return;
    this.scanning = true; this.lastScanAt = Date.now();
    try {
      for (const id of this.managedIds()){
        const b = BOT_BY_ID[id]; if (!b || !this.deskRuns(b) || typeof b.signal !== 'function') continue;
        const cfg0 = Object.assign({}, Bots.cfg(id));
        const tfs = this.tfsFor(b) || [cfg0.tf];
        const syms = this.symbolsFor(b);
        const bs = this.botStat(id);
        bs.lastScan = Date.now(); bs.scans = (bs.scans || 0) + 1; bs.pairs = syms.length; bs.tfs = tfs.slice();
        const depth = Math.max(4, Math.floor(24 / tfs.length));
        for (const tf of tfs){
          const key = id + '|' + tf;
          const start = S.scanCursor[key] || 0;
          const slice = []; for (let i = 0; i < Math.min(depth, syms.length); i++) slice.push(syms[(start + i) % syms.length]);
          S.scanCursor[key] = syms.length ? (start + depth) % syms.length : 0;
          for (const sym of slice){
            if (!S.on) return;
            await this.look(b, cfg0, tf, sym);
          }
        }
      }
      this.save();
      this.refreshPulse(true);
    } catch(e){ console.warn('ASTRA live desk scan:', e.message); }
    finally { this.scanning = false; }
  },
  async look(b, cfg0, tf, sym){
    const S = this.load();
    if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym)) return;
    if (typeof Feed !== 'undefined' && !Feed.isLive(sym)) return;
    let candles, higher = null;
    try {
      candles = await API.klines(sym, tf, b.warmup + 120);
      if (b.needsHigher) higher = await API.klines(sym, cfg0.higherTf || '15m', 300);
    } catch(e){ return; }
    if (!candles || candles.length < b.warmup) return;
    const bar = candles[candles.length - 1].time;
    const key = b.id + '|' + sym + '|' + tf;
    if (S.seen[key] === bar) return;                          /* one look per candle */
    const cfg = Object.assign({}, cfg0, { tf, sym });
    let sig;
    try { sig = b.signal(candles, cfg, this.pseudoLedger(b.id), higher); } catch(e){ return; }
    S.seen[key] = bar;
    if (Object.keys(S.seen).length > 3000) S.seen = {};
    if (!sig || !sig.dir || sig.closeLongs) return;
    if (!this.sideOk(b, sig.dir)) return;                    /* buy-only / sell-only: not even counted */
    if (cfg.hours && cfg.hours.length && !cfg.hours.includes(new Date().getUTCHours())) return;
    if (sig.score != null && sig.score < (cfg.minScore || 0)) return;
    sig.sym = sym; sig.tf = tf; sig.desk = true;
    try { sig.state = MarketState.of(candles, candles.length - 2); } catch(e){}
    await Feed.loadSpecs([sym]);
    if (!Bots.quoteFor(sym)) { try { await Feed.quotes([sym]); } catch(e){} }
    const q = Bots.quoteFor(sym);
    if (!q) return;
    if (!(sig.entry > 0)) sig.entry = q.price;
    /* the same spread and stop sanity the paper engine applies before a trade */
    const R = BotEngine.rules(cfg), lv = this.levels(sig, b);
    const spread = q.spread != null ? q.spread : q.price * 0.0002;
    const spreadPct = spread / q.price * 100;
    if (spreadPct > R.maxSpreadPct){ this.saw(b, sig); this.refused(b, sig, 'spread ' + spreadPct.toFixed(3) + '% is above the limit of ' + R.maxSpreadPct + '%', 'desk'); return; }
    const stopDist = Math.abs(q.price - lv.sl);
    if (!(lv.sl > 0) || !(stopDist > 0) || (q.price - lv.sl) * sig.dir <= 0){ this.saw(b, sig); this.refused(b, sig, 'the stop is on the wrong side of the price', 'desk'); return; }
    if (spread / stopDist * 100 > R.maxSpreadAtrPct + 1e-9){ this.saw(b, sig); this.refused(b, sig, 'the spread is ' + (spread / stopDist * 100).toFixed(0) + '% of the stop distance (limit ' + R.maxSpreadAtrPct + '%)', 'desk'); return; }
    /* the Master Brain has the same last word it has on paper — veto only, never enlarge */
    if (typeof MasterBrain !== 'undefined' && MasterBrain.approve){
      const brain = MasterBrain.approve(sig, cfg, { time: Date.now(), live: true, state: sig.state, spreadPct: q.price ? q.spread / q.price * 100 : 0.02 });
      if (!brain.take){ this.saw(b, sig); this.refused(b, sig, 'vetoed by the Master Brain — ' + brain.why, 'brain'); return; }
    }
    this.note('signal', b.name + ' · ' + (sig.dir > 0 ? 'BUY' : 'SELL') + ' ' + baseAsset(sym) + ' on ' + tf + (sig.score != null ? ' · score ' + Math.round(sig.score) : '') + ' — found by the desk');
    await Live.submit(b, sig, null, q);
  },

  /* ================= arming ================= */
  armIds(ids, mode){
    Live.load();
    const S = this.load();
    const named = [];
    for (const id of ids){
      const b = BOT_BY_ID[id]; if (!b) continue;
      const a = Live.state.armed[id];
      if (a){ if (!a.desk){ a.desk = true; } continue; }         /* armed by hand → the desk takes it over */
      const ready = Live.readiness(id);
      /* the automatic choice needs the door; a bot you ticked yourself was your call */
      if (S.bots.mode === 'auto' && ready.met < (S.minReady || 4)) continue;
      Live.state.armed[id] = { at: Date.now(), mode: mode === 'live' ? 'live' : 'shadow', liveAt: mode === 'live' ? Date.now() : 0, readyAt: ready.met, desk: true };
      named.push(b.name);
    }
    S.everArmed = S.everArmed || {}; for (const id of ids) S.everArmed[id] = true;
    Live.save(); this.save();
    return named;
  },
  apply(announce){
    const S = this.load();
    if (!S.on) return;
    const want = this.selected();
    const have = this.managedIds();
    const mode = this.mode();
    const added = this.armIds(want.filter(id => !have.includes(id)), mode);
    const dropped = [];
    for (const id of have) if (!want.includes(id)){
      delete Live.state.armed[id]; dropped.push((BOT_BY_ID[id] || {}).name || id);
    }
    Live.save();
    if (added.length) this.note('arm', added.join(', ') + ' joined the desk in ' + mode.toUpperCase());
    if (dropped.length) this.note('disarm', dropped.join(', ') + ' left the desk');
    if (announce && typeof toast === 'function' && (added.length || dropped.length)) toast('Desk bots updated', 'ok');
  },
  arm(typed, acks){
    const S = this.load();
    if (!acks) return { ok: false, why: 'Tick the three acknowledgements first.' };
    if (String(typed || '').trim().toUpperCase() !== this.ARM_PHRASE) return { ok: false, why: 'Type ' + this.ARM_PHRASE + ' exactly to arm the desk.' };
    if (!(this.budget() > 0)) return { ok: false, why: 'Set the bot money first.' };
    const ids = this.selected();
    if (!ids.length) return { ok: false, why: S.bots.mode === 'auto' ? 'No bot passes the door yet — lower it, or tick bots yourself.' : 'Tick at least one bot.' };
    Live.load();
    if (Live.state.killedAt){ Live.state.killedAt = 0; Live.state.killReason = ''; Live.save(); }
    S.on = true; S.startedAt = Date.now(); S.startBalance = this.account().balance;
    this.save();
    const named = this.armIds(ids, 'shadow');
    this.note('arm', 'DESK ARMED in SHADOW · bot money ' + fmtNum(this.budget()) + ' · ' + ids.map(id => (BOT_BY_ID[id] || {}).name || id).join(', '), { desk: this.summary() });
    setTimeout(() => this.scan(), 1500);
    return { ok: true, named };
  },
  goLive(typed){
    const S = this.load();
    if (!S.on) return { ok: false, why: 'Arm the desk first.' };
    if (String(typed || '').trim().toUpperCase() !== this.LIVE_PHRASE) return { ok: false, why: 'Type ' + this.LIVE_PHRASE + ' to let the desk place real orders.' };
    Live.load();
    if (!Live.state.linked) return { ok: false, why: 'The bridge session code has not been entered (step 1).' };
    if (!Live.bridge.trading) return { ok: false, why: 'The live bridge is not running — start START-LIVE-TRADING.bat.' };
    let n = 0;
    for (const id of this.managedIds()){ const a = Live.state.armed[id]; if (a.mode !== 'live'){ a.mode = 'live'; a.liveAt = Date.now(); n++; } }
    Live.save();
    this.note('golive', 'DESK LIVE — ' + this.managedIds().length + ' bot(s) may place real orders within ' + fmtNum(this.budget()) + ' of bot money');
    return { ok: true, n };
  },
  toShadow(){
    Live.load();
    for (const id of this.managedIds()){ const a = Live.state.armed[id]; a.mode = 'shadow'; }
    Live.save();
    this.note('shadow', 'Desk back in SHADOW — nothing will be sent');
  },
  off(why){
    const S = this.load();
    Live.load();
    const names = this.managedIds().map(id => { const n = (BOT_BY_ID[id] || {}).name || id; delete Live.state.armed[id]; return n; });
    Live.save();
    S.on = false;
    this.save();
    this.note('off', 'Desk switched off' + (why ? ' — ' + why : '') + (names.length ? ' · disarmed ' + names.join(', ') : ''));
    if (typeof toast === 'function' && why) toast('Live desk off — ' + why, 'warn');
  },
  dropped(id){
    const S = this.load();
    S.bots.picked = S.bots.picked.filter(x => x !== id);
    S.autoPicked = S.autoPicked.filter(x => x !== id);
    S.skip = S.skip || {}; S.skip[id] = Date.now();
    this.save();
  },
  onKill(){ const S = this.load(); if (S.on){ S.on = false; this.save(); this.note('off', 'Desk switched off by the kill switch'); } },
  summary(){
    const S = this.load();
    return { budget: this.budget(), riskPct: S.riskPct, maxOpen: S.maxOpen, exit: S.exit, stops: S.stops,
             bots: this.selected(), perBot: S.perBot, markets: this.groupsFor(null) || 'auto', tfs: S.tfs.mode === 'manual' ? S.tfs.list : 'auto' };
  },

  /* ================= real positions: the exit rules ================= */
  adopt(ticket, botId, sig, order){
    if (!ticket) return;
    const S = this.load();
    S.tickets[ticket] = { bot: botId, sym: sig.sym, dir: sig.dir, entry: order.price || sig.entry, best: sig.entry,
                          sl0: order.sl, locked: false, moves: 0, lastAt: 0, openedAt: Date.now() };
    this.save();
  },
  async post(path, body){
    const r = await fetch(Live.BRIDGE + path, { method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify(Object.assign({ code: Live.state.code }, body)), signal: AbortSignal.timeout(12000) });
    const j = await r.json().catch(() => ({}));
    return Object.assign({ ok: r.ok && j.ok !== false && !j.error }, j);
  },
  async modify(ticket, sl, tp, why){
    Live.load();
    if (!Live.state.linked || !Live.bridge.trading) return { ok: false, message: 'the live bridge is not linked' };
    try {
      const j = await this.post('/modify', { ticket, sl: +sl, tp: +(tp || 0) });
      this.note(j.ok ? 'modify' : 'modify-failed', 'Ticket ' + ticket + ' — stop ' + fmtPrice(sl) + (tp > 0 ? ' · target ' + fmtPrice(tp) : ' · no target') +
        (why ? ' — ' + why : '') + (j.ok ? '' : ' — REFUSED: ' + (j.message || j.error || j.comment)), j);
      if (typeof toast === 'function') toast(j.ok ? 'REAL stop moved to ' + fmtPrice(sl) + (why ? ' — ' + why : '') : 'The broker refused the change: ' + (j.message || j.error || j.comment), j.ok ? 'ok' : 'warn');
      this._rows = null;
      return j;
    } catch(e){ this.note('modify-failed', 'Ticket ' + ticket + ' — the bridge did not answer: ' + e.message); return { ok: false, message: e.message }; }
  },
  async closeTicket(ticket, why){
    Live.load();
    if (!Live.state.linked || !Live.bridge.trading) return { ok: false, message: 'the live bridge is not linked' };
    try {
      const j = await this.post('/close', { ticket });
      this.note(j.ok ? 'close' : 'close-failed', 'Ticket ' + ticket + ' closed at the market' + (why ? ' — ' + why : '') + (j.ok ? '' : ' — REFUSED: ' + (j.message || j.error || j.comment)), j);
      if (typeof toast === 'function') toast(j.ok ? 'REAL position ' + ticket + ' closed' + (why ? ' — ' + why : '') : 'Could not close: ' + (j.message || j.error || j.comment), j.ok ? 'ok' : 'warn');
      if (j.ok){ const S = this.load(); S.closedTickets = S.closedTickets || {}; S.closedTickets[ticket] = Date.now(); delete S.tickets[ticket]; this.save(); }
      this._rows = null;
      await Live.sync();
      return j;
    } catch(e){ this.note('close-failed', 'Ticket ' + ticket + ' — the bridge did not answer: ' + e.message); return { ok: false, message: e.message }; }
  },
  plan(p){
    const S = this.load();
    const t = S.tickets[p.ticket];
    const botId = (t && t.bot) || (p.comment || '').replace('ASTRA ', '').trim();
    const X = this.exitFor(botId);
    const dir = p.type === 'buy' ? 1 : -1;
    const px = p.price_current, entry = p.price_open;
    const best = t ? Math.max(t.best * dir, px * dir) * dir : px;
    const movePct = entry > 0 ? (px - entry) / entry * dir * 100 : 0;
    const bestPct = entry > 0 ? (best - entry) / entry * dir * 100 : 0;
    const target = entry * (1 + dir * X.targetPct / 100);
    const lockAt = entry * (1 + dir * X.lockPct / 100);
    const locked = !!(t && t.locked) || (X.onTarget === 'lock' && (p.sl - lockAt) * dir >= -1e-9 && (p.sl - entry) * dir > 0);
    const trailOn = X.trail && (locked || X.trailFrom === 'start');
    const trailLevel = trailOn ? best * (1 - dir * X.trailGapPct / 100) : null;
    let next;
    if (X.targetPct > 0 && !locked && movePct < X.targetPct)
      next = (X.onTarget === 'exit' ? 'exits' : 'locks the stop at +' + X.lockPct + '%') + ' when price reaches ' + fmtPrice(target) + ' (+' + X.targetPct + '%)';
    else if (X.targetPct > 0 && !locked && movePct >= X.targetPct)
      next = X.onTarget === 'exit' ? 'target reached — closing at the market' : 'target reached — locking the stop now';
    else if (trailOn)
      next = 'trailing ' + X.trailGapPct + '% behind the best price ' + fmtPrice(best);
    else next = 'holding — the bot’s own stop and target decide';
    return { dir, px, entry, best, movePct, bestPct, target, lockAt, locked, trailOn, trailLevel, next, t, X, botId };
  },
  async rule(p){
    const S = this.load();
    const now = Date.now();
    const dir = p.type === 'buy' ? 1 : -1;
    const t = S.tickets[p.ticket] || (S.tickets[p.ticket] = {
      bot: (p.comment || '').replace('ASTRA ', '').trim(), sym: p.symbol, dir, entry: p.price_open, best: p.price_current,
      sl0: p.sl, locked: false, moves: 0, lastAt: 0, openedAt: (p.time || 0) * 1000 });
    if ((p.price_current - t.best) * dir > 0) t.best = p.price_current;
    const pl = this.plan(p), X = pl.X;
    if (pl.locked && !t.locked) t.locked = true;
    if (!Live.state.linked || !Live.bridge.trading) return;
    if (now - (t.lastAt || 0) < 8000) return;
    /* 1. the minimum target */
    if (X.targetPct > 0 && !t.locked && pl.movePct >= X.targetPct){
      t.lastAt = now;
      if (X.onTarget === 'exit'){
        await this.closeTicket(p.ticket, 'target of +' + X.targetPct + '% reached (' + baseAsset(p.symbol) + ')');
        return;
      }
      const want = +pl.lockAt.toPrecision(10);
      if ((want - p.sl) * dir > 0){
        const r = await this.modify(p.ticket, want, p.tp, 'target +' + X.targetPct + '% reached — profit locked at +' + X.lockPct + '%');
        if (r.ok){ t.locked = true; t.moves++; p.sl = want; } else t.lastAt = now + 30000;
      } else t.locked = true;
      return;
    }
    /* 2. trailing — only ever tightening, never widening */
    if (X.trail && (t.locked || X.trailFrom === 'start') && X.trailGapPct > 0){
      const want = +(t.best * (1 - dir * X.trailGapPct / 100)).toPrecision(10);
      const minStep = p.price_open * 0.0004;
      if ((want - p.sl) * dir > minStep){
        t.lastAt = now;
        const r = await this.modify(p.ticket, want, p.tp, 'trailing · best ' + fmtPrice(t.best));
        if (r.ok){ t.moves++; p.sl = want; } else t.lastAt = now + 30000;
      }
    }
  },
  async manage(){
    if (this.busy || typeof Live === 'undefined') return;
    this.busy = true;
    try {
      const S = this.load();
      Live.load();
      const known = Object.keys(S.tickets);
      if (!S.on && !known.length) return;
      this.beat = Date.now();
      if (Date.now() - (Live.bridge.checked || 0) > 30000) await Live.probe();
      if (S.on) this.apply(false);
      if (!Live.bridge.trading){ this.refreshPulse(true); return; }
      const r = await fetch(Live.BRIDGE + '/positions', { cache: 'no-store', signal: AbortSignal.timeout(4000) });
      const j = await r.json();
      const magic = Live.bridge.magic || 20260902;
      Live.loadBook();
      Live.book.open = (j.positions || []).filter(p => p.magic === magic);
      Live.saveBook();
      this._rows = null;
      for (const k of known) if (!Live.book.open.some(p => String(p.ticket) === k)){
        const t = S.tickets[k];
        S.closedTickets = S.closedTickets || {}; S.closedTickets[k] = Date.now();
        delete S.tickets[k];
        this.note('closed', 'Ticket ' + k + ' (' + baseAsset(t.sym || '') + ') is no longer open — closed by its stop, its target or by hand' + (t.moves ? ' · the desk moved its stop ' + t.moves + '×' : ''));
      }
      for (const p of this.deskPositions()) await this.rule(p);
      this.save();
      if (Bots.active === 'live' || Bots.active === 'open') this.refreshPositions();
      this.refreshPulse(true);
      if (typeof Draw !== 'undefined' && Draw.redraw) Draw.redraw();
    } catch(e){ /* the bridge is simply not there */ }
    finally { this.busy = false; }
  },
  init(){
    this.load();
    if (!this.timer) this.timer = setInterval(() => this.manage(), 5000);
    if (!this.scanTimer) this.scanTimer = setInterval(() => this.scan(), this.SCAN_EVERY);
    if (!this.pulseTimer) this.pulseTimer = setInterval(() => this.refreshPulse(), 1000);
    setTimeout(() => this.manage(), 3000);
    setTimeout(() => this.scan(), 12000);
  },

  /* ================= for the chart (PosLines) ================= */
  rowOf(p){
    const bot = (p.comment || '').replace('ASTRA ', '').trim();
    const b = BOT_BY_ID[bot];
    const spec = typeof Feed !== 'undefined' && Feed.specFor ? Feed.specFor(p.symbol) : null;
    const dir = p.type === 'buy' ? 1 : -1;
    let qty = 1, fx = 1;
    if (spec && spec.contractSize > 0 && spec.tickSize > 0 && spec.tickValue > 0){
      qty = p.volume * spec.contractSize; fx = (spec.tickValue / spec.tickSize) / spec.contractSize;
    } else if (p.price_current !== p.price_open && p.profit){
      qty = 1; fx = p.profit / ((p.price_current - p.price_open) * dir);
    }
    return { bot: bot || 'live', botName: (b ? b.name : (bot || 'real account')), live: true, ticket: p.ticket, raw: p,
      p: { id: 'T' + p.ticket, sym: p.symbol, dir, entry: p.price_open, sl: p.sl || 0, tp: p.tp || null, qty, lots: p.volume,
           entryTime: (p.time || 0) * 1000, fees: 0, last: p.price_current, meta: { accountFx: { profit: fx, loss: fx } } } };
  },
  chartRows(){
    if (typeof Live === 'undefined') return [];
    if (this._rows && Date.now() - this._rowsAt < 1000) return this._rows;
    Live.loadBook();
    this._rows = (Live.book.open || []).map(p => this.rowOf(p)); this._rowsAt = Date.now();
    return this._rows;
  },
  liveOf(row){
    const p = row.p, raw = row.raw;
    const q = Bots.quoteFor(p.sym);
    const px = q ? q.price : raw.price_current;
    const fx = p.meta.accountFx.profit;
    const unreal = (raw.profit || 0) + (raw.swap || 0) + (q ? (px - raw.price_current) * p.dir * p.qty * fx : 0);
    const toStop = (px - p.sl) * p.dir, toTp = p.tp ? (p.tp - px) * p.dir : null;
    return { px, unreal, rNow: 0, R1: Math.abs(p.entry - p.sl), toStop, toTp, stale: !q,
      pctToStop: px > 0 ? toStop / px * 100 : 0, pctToTp: p.tp && px > 0 ? toTp / px * 100 : null,
      cashToStop: toStop * p.qty * fx, cashToTp: toTp == null ? null : toTp * p.qty * fx,
      held: typeof BotDash !== 'undefined' ? BotDash.held(p.entryTime, Date.now()) : '', value: Math.abs(p.qty * p.entry) * fx };
  },
  trailInfo(row){
    if (!this.isDeskPos(row.raw)) return null;
    const pl = this.plan(row.raw), X = pl.X;
    const p = row.p;
    const R1 = Math.abs(p.entry - (pl.t && pl.t.sl0 || p.sl)) || p.entry * 0.005;
    if (!X.trail && !(X.targetPct > 0)) return null;
    if (!pl.trailOn){
      return { startR: +(X.targetPct / 100 * p.entry / R1).toFixed(2), gapR: +(X.trailGapPct / 100 * p.entry / R1).toFixed(2), arm: pl.target, on: false, level: null, peak: null, R1,
               text: (X.onTarget === 'exit' ? 'EXIT' : 'LOCK +' + X.lockPct + '%') + ' at ' + fmtPrice(pl.target) + ' (+' + X.targetPct + '%)' };
    }
    return { startR: 0, gapR: +(X.trailGapPct / 100 * p.entry / R1).toFixed(2), arm: pl.target, on: true, level: pl.trailLevel, peak: pl.best, R1,
             text: 'TRAILING · best ' + fmtPrice(pl.best) + ' · gap ' + X.trailGapPct + '%' };
  },
  showOnChart(ticket){
    Live.loadBook();
    const p = (Live.book.open || []).find(x => String(x.ticket) === String(ticket));
    if (!p) return toast('That real position is no longer open', 'info');
    const row = this.rowOf(p), key = row.bot + ':' + row.p.id;
    if (typeof PosLines !== 'undefined'){ if (!PosLines.on){ PosLines.on = true; lsSet('astra_poslines', true); } PosLines.focus = key; PosLines.cancelPending(); }
    if (typeof WorkspaceUI !== 'undefined') WorkspaceUI.openChart(p.symbol); else App.setSymbol(p.symbol);
    if (typeof PosLines !== 'undefined') PosLines.sync();
    toast('REAL ' + p.type.toUpperCase() + ' ' + baseAsset(p.symbol) + ' is on the chart — drag the stop or the target, then confirm; the broker is told', 'ok');
    setTimeout(() => { if (typeof PosLines !== 'undefined' && PosLines.focus === key) PosLines.focus = null; if (typeof Draw !== 'undefined') Draw.redraw(); }, 20000);
  },

  /* ================= what fits the money ================= */
  fit(){
    const S = this.load();
    const pool = this.budgetNow();
    const riskCash = pool * S.riskPct / 100;
    const syms = this.allSymbols();
    const out = [], need = [];
    for (const sym of syms){
      const spec = typeof Feed !== 'undefined' && Feed.specFor ? Feed.specFor(sym) : null;
      const q = Bots.quoteFor(sym);
      if (!spec || !q || !(q.price > 0)){ need.push(sym); out.push({ sym, unknown: true }); continue; }
      const stopPct = S.stops.mode === 'percent' ? S.stops.slPct : 0.5;
      const stopDist = q.price * stopPct / 100;
      const riskPerLot = (stopDist / spec.tickSize) * spec.tickValue;
      const minLot = spec.volumeMin || spec.volumeStep || 0.01;
      const minRisk = minLot * riskPerLot;
      const lots = Math.floor((riskCash / riskPerLot) / (spec.volumeStep || 0.01)) * (spec.volumeStep || 0.01);
      const m = this.marginOf(sym, Math.max(minLot, lots), q.price);
      out.push({ sym, minLot, minRisk, lots: Math.max(0, lots), fits: minRisk <= riskCash + 1e-9, margin: m, stopPct, riskCash });
    }
    if (need.length && typeof Feed !== 'undefined' && Feed.loadSpecs && Date.now() - this.specsAsked > 20000){
      this.specsAsked = Date.now();
      Feed.loadSpecs(need).then(() => { if (Bots.active === 'live') this.rerender(); }).catch(() => {});
      if (Feed.quotes) Feed.quotes(need.slice(0, 60)).catch(() => {});
    }
    return { rows: out, riskCash, pool };
  },

  /* ================= UI ================= */
  SECTIONS: ['pulse', 'money', 'exit', 'bots', 'where', 'matrix', 'fit', 'arm', 'positions', 'log'],
  order(){
    const S = this.load();
    const o = (S.ui.order || []).filter(k => this.SECTIONS.includes(k));
    for (const k of this.SECTIONS) if (!o.includes(k)) o.push(k);
    return o;
  },
  view(){
    const S = this.load();
    const mode = this.mode();
    const parts = {
      pulse: () => this.pulseView(S, mode), money: () => this.moneyView(S), exit: () => this.exitView(S), bots: () => this.botsView(S),
      where: () => this.whereView(S), matrix: () => this.matrixView(S), fit: () => this.fitView(S), arm: () => this.armView(S, mode),
      positions: () => '<div id="ldRealHost" class="ldHost">' + this.positionsView() + '</div>', log: () => this.logView(S),
    };
    return `<div class="ldWrap ${mode}">
      ${this.heroView(S, mode)}
      <div class="ldSecs">${this.order().map(k => parts[k]()).join('')}</div>
    </div>`;
  },
  /* every card folds, moves and can take half the width; all of it remembered */
  card(key, title, icon, body, hint, id, cls){
    const S = this.load();
    const folded = !!(S.ui.folded || {})[key], half = !!(S.ui.half || {})[key];
    return `<section class="ldCard ${cls || ''}${folded ? ' folded' : ''}${half ? ' half' : ''}" data-ldsec="${key}" ${id ? 'id="' + id + '"' : ''}>
      <div class="ldCardHead" draggable="true" data-lddrag="${key}" title="Drag to move this section">
        <i>${icon}</i><b>${esc(title)}</b>${hint ? `<span>${esc(hint)}</span>` : ''}
        <span class="ldSecTools">
          <button data-ldmove="${key}|-1" title="Move up">▲</button><button data-ldmove="${key}|1" title="Move down">▼</button>
          <button data-ldhalf="${key}" title="${half ? 'Full width' : 'Half width'}">${half ? '⇔' : '⇹'}</button>
          <button data-ldfold="${key}" title="${folded ? 'Unfold' : 'Fold away'}">${folded ? '▸' : '▾'}</button>
        </span>
      </div><div class="ldCardBody">${body}</div></section>`;
  },

  heroView(S, mode){
    Live.load();
    const B = Live.bridge, a = this.account();
    const gates = [
      { on: !!B.trading, icon: '🔌', t: 'Bridge', s: B.trading ? 'live bridge running' : 'read-only / off' },
      { on: !!Live.state.linked, icon: '🔑', t: 'Code', s: Live.state.linked ? 'session code entered' : 'not entered' },
      { on: S.on, icon: '🛡️', t: 'Desk armed', s: S.on ? this.managedIds().length + ' bot' + (this.managedIds().length === 1 ? '' : 's') + ' in ' + mode.toUpperCase() : 'off' },
      { on: mode === 'live', icon: '🔴', t: 'Real money', s: mode === 'live' ? 'orders can be sent' : 'shadow — nothing sent' },
    ];
    const chain = gates.map((g, i) => `<div class="ldGate ${g.on ? 'on' : ''}"><i>${g.icon}</i><b>${esc(g.t)}</b><span>${esc(g.s)}</span></div>${i < 3 ? '<em class="ldGateArrow">›</em>' : ''}`).join('');
    const pool = this.budget(), now = this.budgetNow(), pnl = this.pnlSince(), openPl = this.openPnl();
    return `<div class="ldHero">
      <div class="ldHeroLeft">
        <div class="ldBadgeRow"><div class="ldBadge ${mode}"><i></i>${mode === 'live' ? 'LIVE DESK · REAL MONEY' : mode === 'shadow' ? 'DESK IN SHADOW' : 'DESK OFF'}</div>
          <button class="bMini ldHowBtn" data-ldact="howto" title="How to trade with the desk — worked examples with pictures">📘 How to trade · examples</button>
          <button class="bMini" data-ldact="resetui" title="Every section back in its place, unfolded">↺ layout</button></div>
        <p>${mode === 'live' ? 'The chosen bots place real orders within the bot money. The desk watches every open trade and applies your exit rules.'
            : mode === 'shadow' ? 'The chosen bots work out every real order and write it down — nothing is sent. Read the log for a while, then go live below.'
            : 'Set the bot money, the exit rules and the bots below, then arm the desk. Everything starts in shadow.'}</p>
        <div class="ldGates">${chain}</div>
      </div>
      <div class="ldHeroRight">
        ${this.ring(pool, a.balance, a.currency)}
        <div class="ldPool">
          <span>BOT MONEY NOW</span>
          <b class="${now >= pool ? 'up' : 'down'}">${fmtNum(now)} <small>${esc(a.currency)}</small></b>
          <i>${fmtNum(pool)} set${pnl ? ' · closed ' + (pnl >= 0 ? '+' : '') + fmtNum(pnl) : ''}${openPl ? ' · open ' + (openPl >= 0 ? '+' : '') + fmtNum(openPl) : ''}</i>
        </div>
      </div>
    </div>`;
  },
  ring(pool, balance, cur){
    const bal = balance || 0;
    const frac = bal > 0 ? Math.min(1, pool / bal) : 0;
    const r = 34, c = 2 * Math.PI * r, dash = c * frac;
    return `<div class="ldRing" title="${esc(fmtNum(pool) + ' of ' + fmtNum(bal) + ' ' + cur + ' belongs to the bots')}">
      <svg viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="${r}" class="ldRingBg"/>
        <circle cx="45" cy="45" r="${r}" class="ldRingFg" stroke-dasharray="${dash.toFixed(2)} ${(c - dash).toFixed(2)}" transform="rotate(-90 45 45)"/>
        <text x="45" y="42" text-anchor="middle" class="ldRingPct">${bal > 0 ? Math.round(frac * 100) + '%' : '—'}</text>
        <text x="45" y="56" text-anchor="middle" class="ldRingSub">of ${bal > 0 ? fmtNum(bal) : '?'}</text>
      </svg>
      <small>bots ${fmtNum(pool)} · yours ${bal > 0 ? fmtNum(Math.max(0, bal - pool)) : '—'}</small>
    </div>`;
  },
  /* ---------- WHAT IS HAPPENING — the living picture ---------- */
  ago(ts){ if (!ts) return 'never'; const s = Math.round((Date.now() - ts) / 1000); return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago'; },
  pulseView(S, mode){
    if (mode === 'off') return this.card('pulse', 'What is happening', '📡', '<div class="empty">Arm the desk and this becomes the living picture: every bot scanning, today’s signals and how far they got, the bot money in motion, the ticker of events.</div>', 'appears once the desk is armed', 'ldPulse', 'ldPulseCard');
    const a = this.account();
    const body = `<div class="ldPulseTop">
        <div class="ldBeat"><i id="ldBeatDot" class="${Date.now() - (this.beat || 0) < 6000 ? 'on' : ''}"></i><span>desk loop every 5 s · own scans every 60 s · <em id="ldNext">next scan in ${this.nextScanIn()}s</em></span></div>
        <div class="ldPulseAcc" id="ldPulseAcc">${a.known ? 'balance ' + fmtNum(a.balance) + ' · equity ' + fmtNum(a.equity) + ' ' + a.currency : 'account not read yet'}</div>
      </div>
      <div class="ldNodes" id="ldNodes">${this.nodesHtml()}</div>
      <div class="ldPulseGrid"><div><h5>Today’s signals — how far they got</h5><div id="ldFunnel">${this.funnelHtml(mode)}</div></div><div><h5>The bot money — in motion</h5><div id="ldMoneyPic">${this.moneyPicHtml(S)}</div></div></div>
      <div class="ldTicker"><div class="ldTickerIn" id="ldTickerIn" data-top="${(S.log[0] || {}).t || 0}">${this.tickerHtml(S)}</div></div>`;
    return this.card('pulse', 'What is happening', '📡', body, mode === 'live' ? 'live · real orders possible' : 'shadow · rehearsal', 'ldPulse', 'ldPulseCard');
  },
  nodesHtml(){
    const ids = this.managedIds();
    return ids.map(id => {
      const b = BOT_BY_ID[id]; if (!b) return '';
      const bs = this.botStat(id), am = Live.state.armed[id] || {};
      const runsItself = this.deskRuns(b);
      const cfg = Bots.cfg(id) || {};
      const lastScan = runsItself ? bs.lastScan : ((Bots.lastRunAt || {})[id] || Bots.lastTickAt || 0);
      const tfs = runsItself ? (this.tfsFor(b) || [cfg.tf]) : [cfg.tf];
      const syms = this.symbolsFor(b);
      return `<div class="ldNode ${am.mode || ''}${lastScan && Date.now() - lastScan < 90000 ? ' scanning' : ''}" data-ldnode="${esc(id)}">
        <div class="ldNodeRing"><i>${typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.icon(WorkspaceUI.botIcon(b)) : ''}</i></div>
        <div class="ldNodeMain">
          <b>${esc(typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name)} <em class="ldTag ${am.mode || ''}">${(am.mode || '').toUpperCase()}</em></b>
          <span>${runsItself ? 'run by the desk' : 'mirrors its paper twin'} · ${tfs.join(', ')} · ${syms.length} pair${syms.length === 1 ? '' : 's'}</span>
          <span class="ldNodeLast" data-ldscan="${esc(id)}"></span>
          <span class="ldNodeText">${esc(bs.lastText || 'nothing yet today')}</span>
        </div>
        <div class="ldNodeNums">
          <b>${bs.seen || 0}</b><small>signals</small>
          <b class="${bs.shadow ? 'shadow' : ''}">${bs.shadow || 0}</b><small>shadow</small>
          <b class="${bs.real ? 'live' : ''}">${bs.real || 0}</b><small>real</small>
          <b class="${bs.refused ? 'warn' : ''}">${bs.refused || 0}</b><small>refused</small>
        </div>
      </div>`;
    }).join('') || '<div class="empty">no bot on the desk</div>';
  },
  /* the funnel: how far today's signals got */
  funnelHtml(mode){
    const st = this.dayStats();
    const f = [['signals seen', st.seen, '#8fa3c8'], ['passed your rules', st.passed, '#00e5ff'], ['passed the ceilings', st.ceilings, '#ffd166'], [mode === 'live' ? 'sent for real' : 'written down (shadow)', mode === 'live' ? st.real : st.shadow, mode === 'live' ? '#f6465d' : '#2ebd85']];
    const max = Math.max(1, ...f.map(x => x[1]));
    return `<div class="ldFunnel">${f.map(([l, n, c]) => `<div class="ldFunRow"><span>${esc(l)}</span><i><b style="width:${Math.max(4, n / max * 100).toFixed(0)}%;background:${c}"></b></i><small>${n}</small></div>`).join('')}
      <div class="ldFunNote">${st.refused ? st.refused + ' refused today — the log below says why' : 'nothing refused today'}</div></div>`;
  },
  /* money in motion */
  moneyPicHtml(S){
    const pool = this.budget(), now = this.budgetNow(), risk = this.atRisk(), mu = this.marginUsed().sum, day = this.dayPnl();
    const dayCap = pool * S.maxDailyLossPct / 100;
    const pct = v => pool > 0 ? Math.max(0, Math.min(100, v / pool * 100)) : 0;
    return `<div class="ldMoneyPic">
      <div class="ldMBar"><span>at risk in open stops</span><i><b class="risk" style="width:${pct(risk).toFixed(1)}%"></b></i><small>${fmtNum(risk)}</small></div>
      <div class="ldMBar"><span>margin tied up</span><i><b class="margin" style="width:${pct(mu).toFixed(1)}%"></b></i><small>${fmtNum(mu)}</small></div>
      <div class="ldMBar"><span>bot money left</span><i><b class="left" style="width:${pct(now).toFixed(1)}%"></b></i><small>${fmtNum(now)}</small></div>
      <div class="ldMBar day"><span>today ${day >= 0 ? '+' : ''}${fmtNum(day)} · stops at −${fmtNum(dayCap)}</span><i><b class="${day < 0 ? 'loss' : 'gain'}" style="width:${dayCap > 0 ? Math.min(100, Math.abs(day) / dayCap * 100).toFixed(1) : 0}%"></b></i><small>${dayCap > 0 ? Math.round(Math.abs(Math.min(0, day)) / dayCap * 100) : 0}%</small></div>
      ${this.curve()}
    </div>`;
  },
  tickerHtml(S){
    const t = (S.log || []).slice(0, 10).map(e => `<span class="${esc(e.kind)}">${new Date(e.t).toLocaleTimeString()} · ${esc(e.text)}</span>`).join('') || '<span>waiting for the first event…</span>';
    return t + t;
  },
  nextScanIn(){ const t = this.lastScanAt || 0; return Math.max(0, Math.round((t + this.SCAN_EVERY - Date.now()) / 1000)); },
  /* the bot money since the desk started, trade by trade */
  curve(){
    const closed = this.deskClosed().slice().sort((a, b) => a.time - b.time);
    const pool = this.budget();
    let v = pool; const pts = [v];
    for (const t of closed){ v += t.net || 0; pts.push(v); }
    if (pts.length < 2) return `<div class="ldCurve empty">the money curve draws itself from the first closed real trade</div>`;
    const min = Math.min(...pts), max = Math.max(...pts), span = (max - min) || 1;
    const W = 300, H = 60;
    const path = pts.map((p, i) => (i / (pts.length - 1) * W).toFixed(1) + ',' + (H - 4 - (p - min) / span * (H - 8)).toFixed(1)).join(' ');
    const up = pts[pts.length - 1] >= pool;
    const y0 = (H - 4 - (pool - min) / span * (H - 8)).toFixed(1);
    return `<svg class="ldCurve" viewBox="0 0 ${W} ${H}"><line x1="0" x2="${W}" y1="${y0}" y2="${y0}" stroke="#8fa3c8" stroke-dasharray="3 3" opacity=".6"/>
      <polyline points="${path}" fill="none" stroke="${up ? '#2ebd85' : '#f6465d'}" stroke-width="2"/>
      ${pts.map((p, i) => `<circle cx="${(i / (pts.length - 1) * W).toFixed(1)}" cy="${(H - 4 - (p - min) / span * (H - 8)).toFixed(1)}" r="2.5" fill="${p >= pool ? '#2ebd85' : '#f6465d'}"/>`).join('')}
      <text x="2" y="10" class="ldSkT">${closed.length} closed · ${pts[pts.length - 1] >= pool ? '+' : ''}${fmtNum(pts[pts.length - 1] - pool)}</text></svg>`;
  },
  /* the parts of the picture that move every second — updated in place */
  refreshPulse(full){
    const host = document.getElementById('ldPulse'); if (!host) return;
    const dot = document.getElementById('ldBeatDot'); if (dot) dot.classList.toggle('on', Date.now() - (this.beat || 0) < 6000);
    const nx = document.getElementById('ldNext'); if (nx) nx.textContent = 'next scan in ' + this.nextScanIn() + 's';
    if (full){
      const S = this.load(), mode = this.mode(), a = this.account();
      /* only what changed is rewritten, so the animations do not restart every five seconds */
      this._pulseHtml = this._pulseHtml || {};
      const set = (id, html) => { const el = document.getElementById(id); if (el && this._pulseHtml[id] !== html){ el.innerHTML = html; this._pulseHtml[id] = html; } };
      set('ldNodes', this.nodesHtml()); set('ldFunnel', this.funnelHtml(mode)); set('ldMoneyPic', this.moneyPicHtml(S));
      const acc = document.getElementById('ldPulseAcc'); if (acc) acc.textContent = a.known ? 'balance ' + fmtNum(a.balance) + ' · equity ' + fmtNum(a.equity) + ' ' + a.currency : 'account not read yet';
      const tk = document.getElementById('ldTickerIn');
      if (tk && String((S.log[0] || {}).t || 0) !== tk.dataset.top){ tk.innerHTML = this.tickerHtml(S); tk.dataset.top = String((S.log[0] || {}).t || 0); }
      return;
    }
    host.querySelectorAll('[data-ldscan]').forEach(el => {
      const id = el.dataset.ldscan; const b = BOT_BY_ID[id]; if (!b) return;
      const ts = this.deskRuns(b) ? this.botStat(id).lastScan : ((Bots.lastRunAt || {})[id] || Bots.lastTickAt || 0);
      el.textContent = 'last look ' + this.ago(ts);
      const node = el.closest('.ldNode'); if (node) node.classList.toggle('scanning', !!ts && Date.now() - ts < 90000);
    });
  },

  moneyView(S){
    const a = this.account();
    const pool = this.budget();
    const chip = (label, mode, value) => `<button class="bMini${S.budget.mode === mode && +S.budget.value === +value ? ' on' : ''}" data-ldbudget="${mode}|${value}">${label}</button>`;
    const risk = pool * S.riskPct / 100;
    const body = `
      <div class="ldMoneyRow">
        <label class="ldBig"><span>The bots may use</span>
          <input type="number" min="0" step="any" data-ld="budget.value" value="${S.budget.value}">
          <select data-ld="budget.mode"><option value="usd"${S.budget.mode === 'usd' ? ' selected' : ''}>${esc(a.currency)}</option><option value="pct"${S.budget.mode === 'pct' ? ' selected' : ''}>% of balance</option></select>
        </label>
        <div class="ldMoneyMeta">
          <b>= ${fmtNum(pool)} ${esc(a.currency)}</b>
          <span>${a.known ? 'of your ' + fmtNum(a.balance) + ' ' + a.currency + ' balance — the other ' + fmtNum(Math.max(0, a.balance - pool)) + ' is invisible to the bots' : 'the balance is not known yet — connect the bridge'}</span>
        </div>
      </div>
      <div class="ldChips">${chip('50', 'usd', 50)}${chip('100', 'usd', 100)}${chip('200', 'usd', 200)}${chip('500', 'usd', 500)}${chip('10%', 'pct', 10)}${chip('25%', 'pct', 25)}${chip('50%', 'pct', 50)}</div>
      <div class="ldSliders">
        <label><span>Risk per trade <b>${S.riskPct}%</b> <i>= ${fmtNum(risk)} ${esc(a.currency)} if the stop is hit</i></span>
          <input type="range" min="0.25" max="10" step="0.25" data-ld="riskPct" value="${S.riskPct}"></label>
        <label><span>Real positions at once <b>${S.maxOpen}</b></span>
          <input type="range" min="1" max="8" step="1" data-ld="maxOpen" value="${S.maxOpen}"></label>
        <label><span>Stop for the day after losing <b>${S.maxDailyLossPct}%</b> <i>= ${fmtNum(pool * S.maxDailyLossPct / 100)} ${esc(a.currency)}</i></span>
          <input type="range" min="1" max="50" step="1" data-ld="maxDailyLossPct" value="${S.maxDailyLossPct}"></label>
        <label><span>Margin the bots may tie up <b>${S.marginCapPct}%</b> <i>of the bot money${a.leverage ? ' · leverage 1:' + a.leverage : ''}</i></span>
          <input type="range" min="10" max="100" step="5" data-ld="marginCapPct" value="${S.marginCapPct}"></label>
      </div>
      <div class="ldNote">When the bot money is gone — every last unit lost — the desk switches itself off. Nothing else on the account is ever touched.</div>
      ${this.ceilingsNote(S)}`;
    return this.card('money', 'Bot money', '💰', body, 'how much of the account belongs to the bots');
  },
  ceilingsNote(S){
    Live.load();
    const C = Live.state.caps;
    const clash = [];
    if (S.maxOpen > C.maxOpen) clash.push('you allow ' + S.maxOpen + ' positions but the hard ceiling is ' + C.maxOpen);
    return `<div class="ldNote ${clash.length ? 'ldClash' : ''}"><b>Hard ceilings</b> (folded below the desk): biggest order ${C.maxLots} lot · ${C.maxOpen} real position${C.maxOpen === 1 ? '' : 's'} at once · stop for the day at ${C.maxDailyLossPct}% and disarm at ${C.maxTotalLossPct}% of the WHOLE balance · hours ${esc(C.sessionFrom)}–${esc(C.sessionTo)}. The desk can never go past them${clash.length ? ' — <b>' + clash.join('; ') + '</b>, so the ceiling wins; raise it there if you mean it' : ''}.</div>`;
  },

  /* the exit-rule controls, for the desk (prefix '') or for one bot (prefix 'pb|id|') */
  exitControls(X, st, prefix, compact){
    const P = prefix || '';
    const r = (name, val, label, cur) => `<label class="ldRadio${cur === val ? ' on' : ''}"><input type="radio" name="${esc(P + name)}" data-ldradio="${esc(P + name)}" value="${val}"${cur === val ? ' checked' : ''}><span>${label}</span></label>`;
    return `<div class="ldExitRow${compact ? ' compact' : ''}">
        <div class="ldField"><span>Stop and target of a new trade</span>
          <div class="ldRadios">${r('stops.mode', 'bot', '🤖 the bot’s own levels', st.mode)}${r('stops.mode', 'percent', '📐 my distances', st.mode)}</div>
          <div class="ldInline ${st.mode === 'percent' ? '' : 'dim'}"><label>stop <input type="number" min="0.05" step="0.05" data-ld="${esc(P)}stops.slPct" value="${st.slPct}">%</label><label>target <input type="number" min="0" step="0.05" data-ld="${esc(P)}stops.tpPct" value="${st.tpPct}">% <small>(0 = none)</small></label></div>
        </div>
        <div class="ldField"><span>Minimum target</span>
          <div class="ldInline"><label>when the trade is <input type="number" min="0" step="0.05" data-ld="${esc(P)}exit.targetPct" value="${X.targetPct}">% in profit…</label></div>
          <div class="ldChips">${[0.3, 0.5, 1, 1.5, 2].map(v => `<button class="bMini${+X.targetPct === v ? ' on' : ''}" data-ldset="${esc(P)}exit.targetPct|${v}">${v}%</button>`).join('')}</div>
        </div>
        <div class="ldField"><span>…the desk</span>
          <div class="ldRadios">${r('exit.onTarget', 'lock', '🔒 locks the stop into profit', X.onTarget)}${r('exit.onTarget', 'exit', '🚪 exits at the market', X.onTarget)}</div>
          <div class="ldInline ${X.onTarget === 'lock' ? '' : 'dim'}"><label>lock at <input type="number" min="0" step="0.05" data-ld="${esc(P)}exit.lockPct" value="${X.lockPct}">% profit</label></div>
        </div>
        <div class="ldField"><span>Trailing stop</span>
          <label class="ldSwitch"><input type="checkbox" data-ldbool="${esc(P)}exit.trail"${X.trail ? ' checked' : ''}><i></i><span>${X.trail ? 'on' : 'off'}</span></label>
          <div class="ldInline ${X.trail ? '' : 'dim'}"><label>gap <input type="number" min="0.05" step="0.05" data-ld="${esc(P)}exit.trailGapPct" value="${X.trailGapPct}">% behind the best price</label></div>
          <div class="ldRadios ${X.trail ? '' : 'dim'}">${r('exit.trailFrom', 'lock', 'after the lock', X.trailFrom)}${r('exit.trailFrom', 'start', 'from the first tick', X.trailFrom)}</div>
        </div>
      </div>`;
  },
  sideChips(cur, prefix, autoLabel){
    const P = prefix || '';
    const opts = [['both', '⇅ buy and sell'], ['buy', '▲ buy only'], ['sell', '▼ sell only']];
    return `<div class="ldSideRow"><b>Direction</b>${autoLabel ? `<button class="ldChip${!cur ? ' on' : ''}" data-ldside="${esc(P)}|">${esc(autoLabel)}</button>` : ''}${opts.map(([v, l]) => `<button class="ldChip${cur === v ? ' on' : ''}" data-ldside="${esc(P)}|${v}">${l}</button>`).join('')}</div>`;
  },
  exitView(S){
    const body = `
      ${this.sideChips(S.side || 'both', '')}
      ${this.exitSketch(S.exit, S.stops)}
      ${this.exitControls(S.exit, S.stops, '')}
      <div class="ldNote">These are the desk’s rules for every bot that has none of its own. Open a bot below to give it its own. The desk only ever moves a stop in the trade’s favour and never removes one; each change is sent to the broker, so it holds even when this PC is off.</div>`;
    return this.card('exit', 'Exit rules', '🎯', body, 'what happens once a real trade is in profit');
  },
  exitSketch(X, st){
    const sl = st.mode === 'percent' ? st.slPct : 0.5;
    const tgt = X.targetPct > 0 ? X.targetPct : 0.5, lock = X.lockPct, gap = X.trailGapPct;
    const bestPct = tgt + Math.max(gap, 0.15) + 0.15;
    const lo = Math.min(-sl, -0.2), hi = Math.max(bestPct + 0.15, 0.6);
    const y = v => +(112 - (v - lo) / (hi - lo) * 100).toFixed(1);
    const yE = y(0), ySl = y(-sl), yT = y(tgt), yL = y(lock), yB = y(bestPct), yTr = y(bestPct - gap);
    const exitAt = X.onTarget === 'exit';
    return `<svg class="ldSketch" viewBox="0 0 320 124">
      <defs><linearGradient id="ldg" x1="0" x2="1"><stop offset="0" stop-color="#8fa3c8" stop-opacity=".15"/><stop offset="1" stop-color="#2ebd85" stop-opacity=".5"/></linearGradient></defs>
      <rect x="0" y="0" width="320" height="124" fill="rgba(120,150,220,.04)"/>
      ${exitAt
        ? `<path class="ldSkPath" d="M12 ${y(-0.05)} C 50 ${y(0.1)}, 80 ${y(-sl * 0.5)}, 120 ${y(tgt * 0.45)} S 170 ${yT}, 196 ${yT}" fill="none" stroke="url(#ldg)" stroke-width="3" stroke-linecap="round"/>`
        : `<path class="ldSkPath" d="M12 ${y(-0.05)} C 50 ${y(0.1)}, 80 ${y(-sl * 0.5)}, 120 ${y(tgt * 0.45)} S 170 ${yT}, 200 ${y(tgt + 0.05)} S 250 ${yB}, 280 ${yB} S 305 ${y(bestPct - gap * 0.6)}, 312 ${y(bestPct - gap * 0.7)}" fill="none" stroke="url(#ldg)" stroke-width="3" stroke-linecap="round"/>`}
      <line x1="12" x2="312" y1="${yE}" y2="${yE}" stroke="#8fa3c8" stroke-dasharray="4 3"/><text x="14" y="${yE - 3}" class="ldSkT">entry</text>
      <line x1="12" x2="312" y1="${ySl}" y2="${ySl}" stroke="#f6465d"/><text x="14" y="${ySl - 3}" class="ldSkT sl">stop −${sl}%${st.mode === 'bot' ? ' (the bot’s)' : ''}</text>
      <line x1="12" x2="312" y1="${yT}" y2="${yT}" stroke="#ffd166" stroke-dasharray="2 3"/><text x="14" y="${yT - 3}" class="ldSkT tr">target +${tgt}% → ${exitAt ? 'EXIT at the market' : 'lock the stop'}</text>
      ${!exitAt ? `<line x1="196" x2="312" y1="${yL}" y2="${yL}" stroke="#2ebd85"/><text x="198" y="${yL + 10}" class="ldSkT tp">stop locked +${lock}%</text>` : ''}
      ${!exitAt && X.trail ? `<line x1="250" x2="312" y1="${yTr}" y2="${yTr}" stroke="#2ebd85" stroke-dasharray="3 2"/><text x="200" y="${yTr - 3}" class="ldSkT tp">trails ${gap}% behind the best</text>` : ''}
      <circle class="ldSkDot" cx="${exitAt ? 196 : 280}" cy="${exitAt ? yT : yB}" r="4" fill="${exitAt ? '#ffd166' : '#2ebd85'}"/>
    </svg>`;
  },

  /* ---------- WHICH BOTS — with the matryoshka inside each ---------- */
  botsView(S){
    const cands = this.candidates();
    const chosen = this.selected();
    const auto = S.bots.mode === 'auto';
    const rows = cands.map((c, i) => {
      const b = c.b, r = c.row, id = b.id;
      const on = chosen.includes(id);
      const ticked = auto ? on : S.bots.picked.includes(id);
      const a = Live.state.armed[id];
      const p = this.pb(id);
      const dots = c.ready.checks.map(ch => `<i class="${ch.ok ? 'ok' : ''}" title="${esc(ch.label + ' — ' + ch.got)}"></i>`).join('');
      const rec = r && r.trades ? `${r.trades} trades · ${Math.round(r.winRate)}% · <b class="${pctClass(r.pnl)}">${(r.pnl >= 0 ? '+' : '') + fmtNum(r.pnl)}</b> · PF ${r.pf === Infinity ? '∞' : (r.pf || 0).toFixed(2)}` : 'no paper trades yet';
      const low = c.ready.met < (S.minReady || 4);
      const why = c.paused ? 'paused' : (auto && low ? 'below the door · ' + c.ready.met + ' of ' + c.ready.of : low ? c.ready.met + ' of ' + c.ready.of + ' conditions — little evidence' : '');
      const syms = this.symbolsFor(b);
      const shaped = this.shaped(b);
      const tfs = this.tfsFor(b);
      return `<div class="ldBotBox${on ? ' on' : ''}${c.paused ? ' no' : ''}${a && a.mode === 'live' ? ' live' : ''}${p.open ? ' open' : ''}" data-ldbotrow="${esc(id)}">
        <label class="ldBot">
          <input type="checkbox" data-ldbot="${esc(id)}"${ticked ? ' checked' : ''}${auto || c.paused ? ' disabled' : ''}>
          <span class="ldBotIcon">${typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.icon(WorkspaceUI.botIcon(b)) : ''}</span>
          <span class="ldBotMain"><b>${esc(typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name)}</b>
            ${on ? `<em class="ldTag ${a ? a.mode : ''}">${auto ? 'chosen by the desk' : 'chosen'}${a ? ' · ' + a.mode.toUpperCase() : ''}</em>` : ''}${why ? `<em class="ldTag ${c.paused || (auto && low) ? 'no' : 'warn'}">${esc(why)}</em>` : ''}${shaped ? '<em class="ldTag own">your settings · run by the desk</em>' : ''}
            <span class="ldBotRec">${rec}</span>
            <span class="ldBotWhere">${shaped ? (tfs || [c.cfg.tf]).join(', ') + ' · ' + (p.markets ? p.markets.map(g => (this.groups()[g] || {}).label || g).join(', ') : 'its own markets') : (c.cfg.tf || '15m') + (c.cfg.tfAuto ? ' auto' : '') + ' · its own markets'} · ${syms.length} pair${syms.length === 1 ? '' : 's'}</span>
          </span>
          ${this.spark(r && r.curve)}
          <span class="ldDots" title="live-readiness conditions met">${dots}</span>
          <span class="ldRank">${r && r.trades ? '#' + (i + 1) : '—'}</span>
        </label>
        <button class="ldOpenBtn" data-ldopen="${esc(id)}" title="Open this bot: its markets, pairs, timeframes, stops and exit rules">${p.open ? '▾ close' : '▸ shape it'}</button>
        ${p.open ? this.botPanel(b, c) : ''}
      </div>`;
    }).join('');
    const body = `
      <div class="ldModeBar">
        <button class="ldModeBtn${!auto ? ' on' : ''}" data-ldmode="bots|manual"><i>☑</i><b>I tick them</b><span>any bot you tick runs — open it to shape where and how</span></button>
        <button class="ldModeBtn${auto ? ' on' : ''}" data-ldmode="bots|auto"><i>🤖</i><b>Let the desk choose</b><span>the best-ranked bots past the door, re-chosen every 4 hours</span></button>
        <label class="ldCount ${auto ? '' : 'dim'}">how many <input type="number" min="1" max="8" step="1" data-ld="bots.count" value="${S.bots.count}"${auto ? '' : ' disabled'}></label>
        ${auto ? '<button class="bMini" data-ldact="repick" title="Choose again now, from today’s ranking">↻ choose again</button>' : ''}
        <label class="ldCount ${auto ? '' : 'dim'}" title="How many of the six live-readiness conditions (the dots) a bot must meet before the AUTOMATIC choice takes it">door
          <select data-ld="minReady"${auto ? '' : ' disabled'}>${[4, 3, 2, 1].map(n => `<option value="${n}"${(S.minReady || 4) === n ? ' selected' : ''}>${n} of 6${n === 4 ? ' · recommended' : n === 1 ? ' · risky' : ''}</option>`).join('')}</select></label>
      </div>
      <div class="ldBots">${rows || '<div class="empty">No bot is switched on</div>'}</div>
      <div class="ldNote">The six dots are the live-readiness conditions from the Performance Report. When YOU tick a bot, the choice is yours whatever the dots say — a bot with few dots is marked <b>little evidence</b>. The automatic choice only takes bots past the door. <b>▸ shape it</b> opens the bot: tick its markets, go inside a market to tick pairs, tick timeframes, give it its own stops and exit rules. Leave anything alone and it stays automatic. A bot you shaped is run by the desk itself with the bot’s own strategy; an untouched bot simply mirrors what its paper twin does.</div>`;
    return this.card('bots', 'Which bots', '🤖', body, chosen.length ? chosen.length + ' chosen' : 'none chosen yet', 'ldBotsCard');
  },
  spark(curve){
    const c = (curve || []).slice(-60);
    if (c.length < 2) return '<span class="ldSpark"></span>';
    const min = Math.min(...c), max = Math.max(...c), span = (max - min) || 1;
    const pts = c.map((v, i) => (i / (c.length - 1) * 80).toFixed(1) + ',' + (22 - (v - min) / span * 20).toFixed(1)).join(' ');
    const up = c[c.length - 1] >= c[0];
    return `<span class="ldSpark"><svg viewBox="0 0 80 24"><polyline points="${pts}" fill="none" stroke="${up ? '#2ebd85' : '#f6465d'}" stroke-width="1.5"/></svg></span>`;
  },

  /* inside one bot: markets → pairs, timeframes, stops, exit rules */
  botPanel(b, c){
    const S = this.load(), p = this.pb(b.id), G = this.groups();
    const own = this.ownMarkets(b);
    const cur = p.markets || own;
    const uni = p.markets ? this.universe() : Bots.allowed(b);
    const openMk = p.openMarket || null;
    const mChips = Object.entries(G).map(([id, g]) => {
      const inList = cur.includes(id);
      const pairs = uni.filter(s => Bots.groupOf(s) === id);
      const off = pairs.filter(s => p.pairsOff.includes(s)).length;
      return `<span class="ldMk${inList ? ' on' : ''}${openMk === id ? ' open' : ''}">
        <label><input type="checkbox" data-ldpbm="${esc(b.id)}|${esc(id)}"${inList ? ' checked' : ''}><b>${esc(g.label)}</b></label>
        <small>${inList ? (pairs.length - off) + ' of ' + pairs.length + ' pairs' : g.syms.length + ' pairs'}</small>
        ${inList && pairs.length ? `<button class="bMini" data-ldpbpairs="${esc(b.id)}|${esc(id)}" title="Go inside: tick the pairs of this market">${openMk === id ? '▾ pairs' : '▸ pairs'}</button>` : ''}
      </span>`;
    }).join('');
    let pairsBox = '';
    if (openMk && cur.includes(openMk)){
      const pairs = uni.filter(s => Bots.groupOf(s) === openMk);
      const stats = Bots.perInstrument(b.id);
      pairsBox = `<div class="ldPairBox"><div class="ldPairHead"><b>${esc((G[openMk] || {}).label || openMk)} — the pairs</b>
          <button class="bMini" data-ldpbpall="${esc(b.id)}|${esc(openMk)}|on">tick all</button><button class="bMini" data-ldpbpall="${esc(b.id)}|${esc(openMk)}|off">untick all</button>
          <span class="dim2">untick a pair to keep this bot out of it · ★ = the bot’s preferred</span></div>
        <div class="ldPairGrid">${pairs.map(s => {
          const off = p.pairsOff.includes(s), rec = stats[s], pref = ((Bots.cfg(b.id) || {}).preferred || []).includes(s);
          return `<label class="ldPair${off ? ' off' : ''}${rec ? (rec.net > 0 ? ' good' : rec.net < 0 ? ' bad' : '') : ''}"><input type="checkbox" data-ldpbpair="${esc(b.id)}|${esc(s)}"${off ? '' : ' checked'}><span>${pref ? '★ ' : ''}${esc(typeof BotMarkets !== 'undefined' ? BotMarkets.short(s) : baseAsset(s))}</span><small>${rec ? (rec.net >= 0 ? '+' : '') + fmtNum(rec.net) : ''}</small></label>`;
        }).join('') || '<span class="dim2">no live pair in this market right now</span>'}</div></div>`;
    }
    const cfg = Bots.cfg(b.id) || {};
    const tfChips = this.TFS.map(tf => `<label class="ldTf${p.tfs ? (p.tfs.includes(tf) ? ' on' : '') : (tf === cfg.tf ? ' own' : '')}"><input type="checkbox" data-ldpbtf="${esc(b.id)}|${tf}"${p.tfs ? (p.tfs.includes(tf) ? ' checked' : '') : (tf === cfg.tf ? ' checked' : '')}><span>${tf}</span>${!p.tfs && tf === cfg.tf ? '<small>the bot’s own</small>' : ''}</label>`).join('');
    const X = p.exit || S.exit, st = p.stops || S.stops;
    const bs = this.botStat(b.id);
    return `<div class="ldPanel">
      <div class="ldPanelSec"><div class="ldPanelHead"><b>0 · Direction</b>${p.side ? '<em class="ldTag own">your choice</em>' : '<em class="ldTag">the desk’s default · ' + esc(S.side || 'both') + '</em>'}<span>let this bot only buy, only sell, or both</span></div>
        ${this.sideChips(p.side, 'pb|' + b.id, 'automatic')}</div>
      <div class="ldPanelSec"><div class="ldPanelHead"><b>1 · Markets</b>${p.markets ? '<em class="ldTag own">your choice</em><button class="bMini" data-ldpbreset="' + esc(b.id) + '|markets">↺ automatic</button>' : '<em class="ldTag">automatic — the bot’s own</em>'}<span>tick the markets this bot may trade; go inside one to tick its pairs</span></div>
        <div class="ldMks">${mChips}</div>${pairsBox}</div>
      <div class="ldPanelSec"><div class="ldPanelHead"><b>2 · Timeframes</b>${p.tfs ? '<em class="ldTag own">your choice</em><button class="bMini" data-ldpbreset="' + esc(b.id) + '|tfs">↺ automatic</button>' : '<em class="ldTag">automatic — ' + esc(cfg.tf || '15m') + '</em>'}<span>${p.tfs ? 'the desk runs this bot’s strategy on ' + p.tfs.join(', ') : 'tick more, and the desk runs the strategy on them itself'}</span></div>
        <div class="ldTfs">${tfChips}</div></div>
      <div class="ldPanelSec"><div class="ldPanelHead"><b>3 · Stops and exit rules</b>${p.exit || p.stops ? '<em class="ldTag own">this bot’s own</em><button class="bMini" data-ldpbreset="' + esc(b.id) + '|exit">↺ the desk’s rules</button>' : '<em class="ldTag">the desk’s rules</em><button class="bMini" data-ldpbown="' + esc(b.id) + '">give it its own</button>'}</div>
        ${p.exit || p.stops ? this.exitSketch(X, st) + this.exitControls(X, st, 'pb|' + b.id + '|', true) : `<div class="dim2 ldPanelMini">${this.ruleWords(X, st)}</div>`}</div>
      <div class="ldPanelSec ldPanelStat"><b>Today</b> ${bs.seen || 0} signals · ${bs.shadow || 0} shadow · ${bs.real || 0} real · ${bs.refused || 0} refused${bs.lastText ? ' · last: ' + esc(bs.lastText) : ''}${this.deskRuns(b) ? ' · looks by the desk: ' + (bs.scans || 0) : ''}</div>
    </div>`;
  },
  ruleWords(X, st){
    return (st.mode === 'percent' ? 'stop −' + st.slPct + '% · target ' + (st.tpPct > 0 ? '+' + st.tpPct + '%' : 'none') : 'the bot’s own stop and target') +
      ' · at +' + X.targetPct + '% the desk ' + (X.onTarget === 'exit' ? 'exits' : 'locks the stop at +' + X.lockPct + '%') +
      (X.trail ? ' · trails ' + X.trailGapPct + '% ' + (X.trailFrom === 'start' ? 'from the first tick' : 'after the lock') : ' · no trailing');
  },

  whereView(S){
    const G = this.groups();
    const mChips = Object.entries(G).map(([id, g]) => `<button class="ldChip${S.markets.mode === 'manual' && S.markets.groups.includes(id) ? ' on' : ''}${S.markets.mode !== 'manual' ? ' auto' : ''}" data-ldmarket="${esc(id)}">${esc(g.label)}<small>${g.syms.length}</small></button>`).join('');
    const tChips = this.TFS.map(tf => `<button class="ldChip${S.tfs.mode === 'manual' && S.tfs.list.includes(tf) ? ' on' : ''}${S.tfs.mode !== 'manual' ? ' auto' : ''}" data-ldtf="${tf}">${tf}</button>`).join('');
    const all = this.allSymbols();
    const q = (this.pairQ || '').toLowerCase();
    const pChips = all.map(s => {
      const blocked = S.pairs.blocked.includes(s);
      const hide = q && !s.toLowerCase().includes(q);
      return `<button class="mkPair ${blocked ? 'blocked' : 'allowed'}" data-ldpair="${esc(s)}"${hide ? ' hidden' : ''} title="${esc(baseAsset(s) + (blocked ? ' — blocked for the desk · click to allow' : ' — allowed · click to block'))}"><i>${blocked ? '✕' : ''}</i>${esc(typeof BotMarkets !== 'undefined' ? BotMarkets.short(s) : baseAsset(s))}</button>`;
    }).join('');
    const seg = (key, cur) => `<span class="ldSeg"><button class="${cur !== 'manual' ? 'on' : ''}" data-ldmode="${key}|auto">automatic</button><button class="${cur === 'manual' ? 'on' : ''}" data-ldmode="${key}|manual">I choose</button></span>`;
    const body = `
      <div class="ldNote" style="margin:0 0 10px">These are the desk’s defaults for every bot you did not shape. A bot’s own choice (▸ shape it, above) wins over them.</div>
      <div class="ldWhereRow"><div class="ldWhereHead"><b>Markets</b>${seg('markets', S.markets.mode)}<span>${S.markets.mode === 'manual' ? (S.markets.groups.length ? 'only the ticked markets' : 'tick at least one market') : 'each bot’s own market settings (Bots → Markets)'}</span></div><div class="ldChips">${mChips}</div></div>
      <div class="ldWhereRow"><div class="ldWhereHead"><b>Timeframes</b>${seg('tfs', S.tfs.mode)}<span>${S.tfs.mode === 'manual' ? (S.tfs.list.length ? 'the desk runs every unshaped bot on ' + S.tfs.list.join(', ') : 'tick at least one') : 'each bot trades on its own timeframe'}</span></div><div class="ldChips">${tChips}</div></div>
      <div class="ldWhereRow"><div class="ldWhereHead"><b>Pairs</b><span class="ldSeg"><button class="${S.pairs.blocked.length ? '' : 'on'}" data-ldact="pairsall">all ${all.length}</button><button class="${S.pairs.blocked.length ? 'on' : ''}" disabled>${S.pairs.blocked.length} blocked</button></span>
        <input type="search" class="mkSearch" data-ldpairq placeholder="find a pair…" value="${esc(this.pairQ || '')}"><span>click a pair to block it for every desk bot</span></div>
        <div class="mkPairs ldPairs">${pChips || '<span class="dim2">' + (all.length ? 'nothing matches' : 'no pair — choose bots first') + '</span>'}</div></div>`;
    return this.card('where', 'Where — the desk’s defaults', '🌍', body, all.length + ' pair' + (all.length === 1 ? '' : 's') + ' in play');
  },
  matrixView(S){
    const G = this.groups();
    const ids = this.selected();
    if (!ids.length) return this.card('matrix', 'The matrix', '🧩', '<div class="empty">Tick a bot first — the matrix shows who may trade what.</div>', 'who may trade what');
    const gids = Object.keys(G);
    const head = gids.map(g => `<th>${esc(G[g].label)}</th>`).join('');
    const rows = ids.map(id => {
      const b = BOT_BY_ID[id]; if (!b) return '';
      const p = this.pb(id);
      const base = p.markets ? this.universe().filter(s => p.markets.includes(Bots.groupOf(s))) : Bots.allowed(b);
      const cells = gids.map(g => {
        const inMarket = base.filter(s => Bots.groupOf(s) === g && !S.pairs.blocked.includes(s) && !p.pairsOff.includes(s));
        const off = S.excl.includes(id + '|' + g);
        if (!inMarket.length) return `<td class="ldCellNone" title="${esc(b.name + ' does not trade ' + G[g].label + ' — open the bot and tick the market to change that')}">·</td>`;
        return `<td class="ldCell${off ? ' off' : ' on'}" data-ldcell="${esc(id)}|${esc(g)}" title="${esc(b.name + ' × ' + G[g].label + ' — ' + inMarket.length + ' pair' + (inMarket.length === 1 ? '' : 's') + ' · click to ' + (off ? 'allow' : 'exclude'))}"><i>${off ? '' : '✓'}</i>${inMarket.length}</td>`;
      }).join('');
      return `<tr><th>${esc(typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name)}</th>${cells}<td class="ldCellSum">${this.symbolsFor(b).length}</td></tr>`;
    }).join('');
    const body = `<div class="dashScroll"><table class="ldMatrix"><thead><tr><th></th>${head}<th>pairs</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="ldNote">Every ✓ is a bot × market the desk lets through; the number is how many pairs that is after the bot’s settings, your ticks inside the bot and the blocked pairs. Click a cell to switch that combination off. <button class="bMini" data-ldact="exclall">↺ tick everything</button></div>`;
    return this.card('matrix', 'The matrix', '🧩', body, 'who may trade what');
  },
  fitView(S){
    const f = this.fit();
    if (!f.rows.length) return this.card('fit', 'What fits the money', '📏', '<div class="empty">Tick a bot first — this shows which pairs the smallest broker order can trade with your risk.</div>', '');
    const a = this.account();
    const fits = f.rows.filter(r => r.fits), big = f.rows.filter(r => !r.unknown && !r.fits), unk = f.rows.filter(r => r.unknown);
    const bar = r => {
      const pct = Math.min(100, r.minRisk / (f.riskCash || 1) * 100);
      return `<div class="ldFit ${r.fits ? 'ok' : 'no'}" title="${esc(baseAsset(r.sym) + ' — smallest order ' + r.minLot + ' lot risks ' + fmtNum(r.minRisk) + ' at a ' + r.stopPct + '% stop; you allow ' + fmtNum(f.riskCash) + (r.margin != null ? ' · margin ≈ ' + fmtNum(r.margin) : ''))}">
        <span>${esc(typeof BotMarkets !== 'undefined' ? BotMarkets.short(r.sym) : baseAsset(r.sym))}</span><i><b style="width:${pct.toFixed(0)}%"></b></i><small>${r.fits ? (r.lots ? r.lots + ' lot' : r.minLot + ' lot') : fmtNum(r.minRisk)}</small></div>`;
    };
    const body = `<div class="ldFitHead">With <b>${fmtNum(f.pool)} ${esc(a.currency)}</b> of bot money and <b>${S.riskPct}%</b> per trade, one trade may lose <b>${fmtNum(f.riskCash)} ${esc(a.currency)}</b>.
        <span class="up">${fits.length} pair${fits.length === 1 ? '' : 's'} fit</span>${big.length ? ` · <span class="down">${big.length} need a bigger budget</span>` : ''}${unk.length ? ` · <span class="dim2">${unk.length} not priced yet</span>` : ''}</div>
      <div class="ldFits">${f.rows.filter(r => !r.unknown).sort((x, y) => x.minRisk - y.minRisk).map(bar).join('')}</div>
      <div class="ldNote">A bar is the money the SMALLEST order the broker accepts would lose at a ${S.stops.mode === 'percent' ? S.stops.slPct + '%' : 'typical 0.5%'} stop, against what you allow per trade. A pair past the line is refused at order time — raise the bot money or the risk, or leave it out.</div>`;
    return this.card('fit', 'What fits the money', '📏', body, fits.length + ' of ' + f.rows.length + ' fit');
  },
  armView(S, mode){
    Live.load();
    const ids = this.selected();
    const names = ids.map(id => (BOT_BY_ID[id] || {}).name || id);
    const linked = Live.state.linked && Live.bridge.trading;
    if (mode === 'off'){
      return this.card('arm', 'Arm the desk', '🛡️', `
        <div class="ldArmWho">${names.length ? 'Arming puts <b>' + esc(names.join(', ')) + '</b> on the real account in <b>SHADOW</b>: every order worked out from ' + fmtNum(this.budget()) + ' of bot money and written down, nothing sent.' : '<b>No bot is chosen yet.</b> ' + (S.bots.mode === 'auto' ? 'None passes the door — lower it, or tick bots yourself.' : 'Tick at least one bot above.')}</div>
        <div class="lvAck">
          <label><input type="checkbox" class="ldAck"> I understand a backtest and paper record do not predict future results.</label>
          <label><input type="checkbox" class="ldAck"> I understand real fills, spreads, gaps and slippage will differ from the simulation.</label>
          <label><input type="checkbox" class="ldAck"> I understand I can lose the bot money, and that these limits reduce that risk but do not remove it.</label>
        </div>
        <div class="lvRow"><input id="ldArmInput" type="text" placeholder="type ${this.ARM_PHRASE}" spellcheck="false" autocomplete="off"${names.length ? '' : ' disabled'}><button class="bBtn go" data-ldact="arm"${names.length ? '' : ' disabled'}>Arm in shadow</button></div>`,
        'everything starts in shadow', '', 'ldArm');
    }
    const managed = this.managedIds();
    return this.card('arm', mode === 'live' ? 'The desk is LIVE' : 'The desk is armed — in shadow', mode === 'live' ? '🔴' : '🛡️', `
      ${mode === 'shadow' ? `
        <p>${linked ? 'The bridge is live and linked. Typing the phrase below lets every desk bot place <b>real orders</b> — within the bot money, the exit rules and the limits on this page.' : '<b>To go live:</b> start START-LIVE-TRADING.bat and enter its six-digit code in step 1 above. Until then the desk stays in shadow.'}</p>
        ${S.bots.mode === 'auto' ? '<p class="ldWarn">Automatic choice is on: the desk may swap bots in and out on its own later; a newly chosen bot trades real money under the same rules. Every swap is written in the log.</p>' : ''}
        <div class="lvRow"><input id="ldLiveInput" type="text" placeholder="type ${this.LIVE_PHRASE}" spellcheck="false" autocomplete="off"${linked ? '' : ' disabled'}><button class="bMini danger" data-ldact="golive"${linked ? '' : ' disabled'}>Go live</button>
          <button class="bMini" data-ldact="off">Switch the desk off</button></div>`
      : `
        <p>Real orders can be sent. <b>Back to shadow</b> stops new orders instantly and keeps the desk watching the open trades; <b>Switch off</b> disarms every desk bot. Open positions are never closed by either — use the cards below or the kill switch at the top.</p>
        <div class="lvRow"><button class="bBtn" data-ldact="shadow">Back to shadow</button><button class="bMini" data-ldact="off">Switch the desk off</button></div>`}`,
      managed.length + ' bot' + (managed.length === 1 ? '' : 's') + ': ' + (managed.map(id => (BOT_BY_ID[id] || {}).name || id).join(', ') || 'none'), '', 'ldArm ' + mode);
  },
  positionsView(){
    Live.load();
    const open = this.chartRows();
    const S = this.load();
    if (!open.length) return this.card('positions', 'Real open trades', '📋', `<div class="empty">No real position is open${S.on ? ' — the desk is watching' : ''}.</div>`, Live.book && Live.book.syncedAt ? 'read from MetaTrader ' + new Date(Live.book.syncedAt).toLocaleTimeString() : 'not read yet');
    const cards = open.map(r => this.posCard(r)).join('');
    return this.card('positions', 'Real open trades', '📋', `<div class="ldList">${cards}</div>
      <div class="ldNote">These are the broker’s own positions. Move a stop or a target and press Apply — the change goes to the broker and holds with this PC off. Trades from a desk bot show what the exit rules will do next.</div>`,
      open.length + ' position' + (open.length === 1 ? '' : 's') + ' on the account · read from MetaTrader');
  },
  posCard(r){
    const p = r.p, raw = r.raw, l = this.liveOf(r);
    const desk = this.isDeskPos(raw);
    const pl = desk ? this.plan(raw) : null;
    const money = v => (v >= 0 ? '+' : '') + fmtNum(v);
    const fx = p.meta.accountFx.profit;
    const atSl = p.sl > 0 ? (p.sl - p.entry) * p.dir * p.qty * fx : null, atTp = p.tp > 0 ? (p.tp - p.entry) * p.dir * p.qty * fx : null;
    return `<div class="otCard ldPos ${l.unreal >= 0 ? 'up' : 'down'}${desk ? ' desk' : ''}" data-ldpos="${raw.ticket}">
      <div class="otHead"><span class="ldRealTag">REAL</span><b class="${p.dir > 0 ? 'up' : 'down'}">${p.dir > 0 ? 'BUY' : 'SELL'}</b> <b>${esc(baseAsset(p.sym))}</b> <span class="dim2">${esc(r.botName)} · ${p.lots} lot · #${raw.ticket}</span>
        <b class="otPnl ${pctClass(l.unreal)}" data-ldf="unreal">${money(l.unreal)}</b></div>
      <div class="ldPosGrid">
        <span class="mbCell"><label>Entry</label><b>${fmtPrice(p.entry)}</b></span>
        <span class="mbCell"><label>Now</label><b data-ldf="px">${fmtPrice(l.px)}</b></span>
        <span class="mbCell"><label>Move</label><b class="${pctClass((l.px - p.entry) * p.dir)}" data-ldf="move">${(((l.px - p.entry) / p.entry) * p.dir * 100).toFixed(2)}%</b></span>
        <span class="mbCell"><label>Stop is worth</label><b class="${atSl == null ? '' : pctClass(atSl)}">${atSl == null ? '—' : money(atSl)}</b></span>
        <span class="mbCell"><label>Target is worth</label><b class="up">${atTp == null ? 'no target' : money(atTp)}</b></span>
        <span class="mbCell"><label>Held</label><b>${esc(l.held)}</b></span>
      </div>
      ${pl ? `<div class="ldPlan"><i>${pl.locked ? '🔒' : pl.trailOn ? '🧭' : '⏳'}</i><span>${esc(pl.next)}</span>${pl.t && pl.t.moves ? `<small>stop moved ${pl.t.moves}×</small>` : ''}<small>best ${fmtPrice(pl.best)} (${pl.bestPct >= 0 ? '+' : ''}${pl.bestPct.toFixed(2)}%)</small>${this.progress(pl)}</div>` : '<div class="ldPlan dim"><i>✋</i><span>not a desk trade — the desk leaves its stop and target alone</span></div>'}
      <div class="otEdit">
        <label>Stop <input type="number" step="any" data-ldsl="${raw.ticket}" value="${p.sl || ''}"></label>
        <label>Target <input type="number" step="any" data-ldtp="${raw.ticket}" value="${p.tp || ''}" placeholder="none"></label>
        <button class="bMini go" data-ldapply="${raw.ticket}">Apply at the broker</button>
        <button class="bMini" data-ldchart="${raw.ticket}">On chart ↗</button>
        <button class="bMini danger" data-ldclose="${raw.ticket}" data-ldf="closebtn">Close at market · ${money(l.unreal)}</button>
      </div>
    </div>`;
  },
  /* a little progress bar: entry → target, with the price now */
  progress(pl){
    const X = pl.X; if (!(X.targetPct > 0)) return '';
    const pct = Math.max(0, Math.min(100, pl.movePct / X.targetPct * 100));
    return `<i class="ldProg" title="how far the trade is to your minimum target"><b style="width:${pct.toFixed(0)}%"></b></i>`;
  },
  refreshPositions(){
    const host = document.getElementById('ldRealHost');
    if (!host) return;
    if (host.contains(document.activeElement) && document.activeElement.matches('input')) return;
    if (host.querySelector('[data-ldclose][data-armed="1"]')) return;
    host.innerHTML = this.positionsView();
    this.bindPositions(host);
  },
  logView(S){
    const rows = (S.log || []).slice(0, 40).map(e => `<div class="botLog ${esc(e.kind)}"><span class="dim2">${new Date(e.t).toLocaleString()}</span> ${esc(e.text)}</div>`).join('') || '<div class="empty">Nothing yet</div>';
    return this.card('log', 'The desk’s log', '🧾', rows, 'every choice, signal, stop move and close');
  },
  rerender(){ this._pulseHtml = null; this._force = true; if (typeof Bots !== 'undefined' && Bots.active === 'live') Bots.render(); },
  snapshot(host){
    return { acks: [...host.querySelectorAll('.ldAck')].map(b => b.checked),
             arm: (host.querySelector('#ldArmInput') || {}).value || '', live: (host.querySelector('#ldLiveInput') || {}).value || '' };
  },
  restore(host, snap){
    if (!snap) return;
    [...host.querySelectorAll('.ldAck')].forEach((b, i) => { if (snap.acks[i]) b.checked = true; });
    const a = host.querySelector('#ldArmInput'); if (a && snap.arm) a.value = snap.arm;
    const l = host.querySelector('#ldLiveInput'); if (l && snap.live) l.value = snap.live;
  },

  /* ---------- events ---------- */
  setPath(path, val){
    const S = this.load();
    let o = S, parts = path.split('.');
    /* 'pb|botId|exit.targetPct' addresses one bot's own rules */
    if (path.startsWith('pb|')){
      const [, id, rest] = path.split('|'); o = this.pb(id); parts = rest.split('.');
      const top = parts[0]; if (!o[top]) o[top] = Object.assign({}, S[top]);
    }
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]];
    o[parts[parts.length - 1]] = val;
    this.save();
  },
  bind(host){
    const S = this.load();
    host.querySelectorAll('[data-ld]').forEach(el => el.addEventListener('change', () => {
      const numeric = el.type === 'number' || el.type === 'range' || el.dataset.ld === 'minReady';
      const v = numeric ? parseFloat(el.value) : el.value;
      if (numeric && !Number.isFinite(v)) return;
      if (el.dataset.ld === 'minReady' && v < 4 && !confirm('Let the automatic choice take bots with only ' + v + ' of 6 readiness conditions onto the real account? They have less evidence behind them. The bot money is still the most they can lose.')){ el.value = S.minReady || 4; return; }
      this.setPath(el.dataset.ld, v);
      if ((el.dataset.ld === 'bots.count' || el.dataset.ld === 'minReady') && S.on){ this.autoPick(true); this.apply(true); }
      el.blur(); this.rerender();
    }));
    host.querySelectorAll('[data-ld][type="range"]').forEach(el => el.addEventListener('input', () => {
      const b = el.parentElement.querySelector('b'); if (b) b.textContent = el.value + (el.dataset.ld === 'maxOpen' ? '' : '%');
    }));
    host.querySelectorAll('[data-ldbool]').forEach(el => el.addEventListener('change', () => { this.setPath(el.dataset.ldbool, el.checked); el.blur(); this.rerender(); }));
    host.querySelectorAll('[data-ldradio]').forEach(el => el.addEventListener('change', () => { if (el.checked){ this.setPath(el.dataset.ldradio, el.value); el.blur(); this.rerender(); } }));
    host.querySelectorAll('[data-ldset]').forEach(el => el.addEventListener('click', () => { const i = el.dataset.ldset.lastIndexOf('|'); this.setPath(el.dataset.ldset.slice(0, i), parseFloat(el.dataset.ldset.slice(i + 1))); this.rerender(); }));
    host.querySelectorAll('[data-ldbudget]').forEach(el => el.addEventListener('click', () => {
      const [mode, v] = el.dataset.ldbudget.split('|'); S.budget.mode = mode; S.budget.value = parseFloat(v); this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldmode]').forEach(el => el.addEventListener('click', () => {
      const [k, mode] = el.dataset.ldmode.split('|');
      if (k === 'bots'){
        if (S.on && mode !== S.bots.mode && !confirm('The desk is armed. Changing how bots are chosen re-arms the desk with the new choice' + (this.mode() === 'live' ? ' — IN LIVE MODE' : '') + '. Continue?')) return;
        S.bots.mode = mode; if (mode === 'manual' && !S.bots.picked.length) S.bots.picked = this.autoPick(false).slice();
        this.save(); if (S.on) this.apply(true);
      } else { S[k].mode = mode; this.save(); }
      this.rerender();
    }));
    host.querySelectorAll('[data-ldbot]').forEach(el => el.addEventListener('change', () => {
      const id = el.dataset.ldbot;
      if (el.checked){
        const c = this.candidates().find(x => x.b.id === id);
        if (c && c.ready.met < (S.minReady || 4) && !(S.skip && S.skip['ok:' + id]) && !confirm(((BOT_BY_ID[id] || {}).name || id) + ' meets only ' + c.ready.met + ' of 6 readiness conditions — little evidence behind it. Run it on the real account anyway? The bot money is the most it can lose.')){ el.checked = false; return; }
        if (S.on && this.mode() === 'live' && !confirm('The desk is LIVE. ' + ((BOT_BY_ID[id] || {}).name || id) + ' will place real orders as soon as it is ticked. Continue?')){ el.checked = false; return; }
        S.skip = S.skip || {}; S.skip['ok:' + id] = Date.now(); delete S.skip[id];
        if (!S.bots.picked.includes(id)) S.bots.picked.push(id);
      } else S.bots.picked = S.bots.picked.filter(x => x !== id);
      this.save(); if (S.on) this.apply(true); el.blur(); this.rerender();
    }));
    /* inside a bot */
    host.querySelectorAll('[data-ldopen]').forEach(el => el.addEventListener('click', () => { const p = this.pb(el.dataset.ldopen); p.open = !p.open; this.save(); this.rerender(); }));
    host.querySelectorAll('[data-ldpbm]').forEach(el => el.addEventListener('change', () => {
      const [id, g] = el.dataset.ldpbm.split('|'); const b = BOT_BY_ID[id]; const p = this.pb(id);
      const cur = (p.markets || this.ownMarkets(b)).slice();
      const next = el.checked ? (cur.includes(g) ? cur : cur.concat([g])) : cur.filter(x => x !== g);
      if (!next.length){ toast('A bot needs at least one market', 'warn'); el.checked = true; return; }
      p.markets = next; if (!el.checked && p.openMarket === g) p.openMarket = null;
      this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldpbpairs]').forEach(el => el.addEventListener('click', () => {
      const [id, g] = el.dataset.ldpbpairs.split('|'); const p = this.pb(id); p.openMarket = p.openMarket === g ? null : g; this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldpbpair]').forEach(el => el.addEventListener('change', () => {
      const [id, s] = el.dataset.ldpbpair.split('|'); const p = this.pb(id);
      p.pairsOff = el.checked ? p.pairsOff.filter(x => x !== s) : (p.pairsOff.includes(s) ? p.pairsOff : p.pairsOff.concat([s]));
      this.save(); el.blur(); this.rerender();
    }));
    host.querySelectorAll('[data-ldpbpall]').forEach(el => el.addEventListener('click', () => {
      const [id, g, what] = el.dataset.ldpbpall.split('|'); const b = BOT_BY_ID[id]; const p = this.pb(id);
      const uni = p.markets ? this.universe() : Bots.allowed(b);
      const pairs = uni.filter(s => Bots.groupOf(s) === g);
      p.pairsOff = what === 'on' ? p.pairsOff.filter(s => !pairs.includes(s)) : [...new Set(p.pairsOff.concat(pairs))];
      this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldpbtf]').forEach(el => el.addEventListener('change', () => {
      const [id, tf] = el.dataset.ldpbtf.split('|'); const p = this.pb(id); const cfg = Bots.cfg(id) || {};
      const cur = (p.tfs || [cfg.tf]).slice();
      const next = el.checked ? (cur.includes(tf) ? cur : cur.concat([tf])) : cur.filter(x => x !== tf);
      if (!next.length){ toast('A bot needs at least one timeframe', 'warn'); el.checked = true; return; }
      p.tfs = next.sort((a, b2) => this.TFS.indexOf(a) - this.TFS.indexOf(b2));
      this.save(); el.blur(); this.rerender();
    }));
    host.querySelectorAll('[data-ldpbown]').forEach(el => el.addEventListener('click', () => {
      const p = this.pb(el.dataset.ldpbown); p.exit = Object.assign({}, S.exit); p.stops = Object.assign({}, S.stops); this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldpbreset]').forEach(el => el.addEventListener('click', () => {
      const [id, what] = el.dataset.ldpbreset.split('|'); const p = this.pb(id);
      if (what === 'markets'){ p.markets = null; p.pairsOff = []; p.openMarket = null; }
      if (what === 'tfs') p.tfs = null;
      if (what === 'exit'){ p.exit = null; p.stops = null; }
      this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldmarket]').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.ldmarket;
      if (S.markets.mode !== 'manual'){ S.markets.mode = 'manual'; S.markets.groups = [id]; }
      else S.markets.groups = S.markets.groups.includes(id) ? S.markets.groups.filter(x => x !== id) : S.markets.groups.concat([id]);
      this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldtf]').forEach(el => el.addEventListener('click', () => {
      const tf = el.dataset.ldtf;
      if (S.tfs.mode !== 'manual'){ S.tfs.mode = 'manual'; S.tfs.list = [tf]; }
      else S.tfs.list = S.tfs.list.includes(tf) ? S.tfs.list.filter(x => x !== tf) : S.tfs.list.concat([tf]);
      this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldpair]').forEach(el => el.addEventListener('click', () => {
      const s = el.dataset.ldpair;
      S.pairs.blocked = S.pairs.blocked.includes(s) ? S.pairs.blocked.filter(x => x !== s) : S.pairs.blocked.concat([s]);
      this.save(); this.rerender();
    }));
    const pq = host.querySelector('[data-ldpairq]');
    if (pq) pq.addEventListener('input', () => {
      this.pairQ = pq.value; const q = pq.value.toLowerCase();
      host.querySelectorAll('[data-ldpair]').forEach(c => { c.hidden = !!q && !c.dataset.ldpair.toLowerCase().includes(q); });
    });
    host.querySelectorAll('[data-ldcell]').forEach(el => el.addEventListener('click', () => {
      const k = el.dataset.ldcell;
      S.excl = S.excl.includes(k) ? S.excl.filter(x => x !== k) : S.excl.concat([k]);
      this.save(); this.rerender();
    }));
    host.querySelectorAll('[data-ldact]').forEach(el => el.addEventListener('click', () => this.action(el.dataset.ldact, host)));
    host.querySelectorAll('[data-ldside]').forEach(el => el.addEventListener('click', () => {
      const i = el.dataset.ldside.lastIndexOf('|'); const P = el.dataset.ldside.slice(0, i), v = el.dataset.ldside.slice(i + 1);
      if (P.startsWith('pb|')) this.pb(P.split('|')[1]).side = v || null; else S.side = v || 'both';
      this.save(); this.rerender();
    }));
    /* the sections: fold, move, half width, drag — delegated, so refreshed cards keep working */
    if (!host.dataset.ldSecBound){
      host.dataset.ldSecBound = '1';
      host.addEventListener('click', e => {
        const f = e.target.closest('[data-ldfold]'), m = e.target.closest('[data-ldmove]'), h = e.target.closest('[data-ldhalf]');
        if (f){ const S2 = this.load(); S2.ui.folded = S2.ui.folded || {}; S2.ui.folded[f.dataset.ldfold] = !S2.ui.folded[f.dataset.ldfold]; this.save(); this.rerender(); }
        if (m){ const [k, d] = m.dataset.ldmove.split('|'); this.moveSec(k, +d); }
        if (h){ const S2 = this.load(); S2.ui.half = S2.ui.half || {}; S2.ui.half[h.dataset.ldhalf] = !S2.ui.half[h.dataset.ldhalf]; this.save(); this.rerender(); }
      });
      host.addEventListener('dragstart', e => { const hd = e.target.closest && e.target.closest('[data-lddrag]'); if (!hd) return; this._drag = hd.dataset.lddrag; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', this._drag); } catch(err){} });
      host.addEventListener('dragover', e => { const sec = e.target.closest && e.target.closest('[data-ldsec]'); if (sec && this._drag && sec.dataset.ldsec !== this._drag){ e.preventDefault(); sec.classList.add('ldDropHere'); } });
      host.addEventListener('dragleave', e => { const sec = e.target.closest && e.target.closest('[data-ldsec]'); if (sec) sec.classList.remove('ldDropHere'); });
      host.addEventListener('drop', e => {
        const sec = e.target.closest && e.target.closest('[data-ldsec]'); if (!sec || !this._drag) return;
        e.preventDefault(); sec.classList.remove('ldDropHere');
        const o = this.order().filter(k => k !== this._drag); const at = o.indexOf(sec.dataset.ldsec);
        o.splice(at < 0 ? o.length : at, 0, this._drag); this._drag = null;
        this.load().ui.order = o; this.save(); this.rerender();
      });
    }
    this.bindPositions(host);
    this._pulseHtml = null;
    this.refreshPulse();
  },
  moveSec(key, dir){
    const o = this.order(); const i = o.indexOf(key); const j = i + dir;
    if (i < 0 || j < 0 || j >= o.length) return;
    o.splice(i, 1); o.splice(j, 0, key);
    this.load().ui.order = o; this.save(); this.rerender();
  },
  bindPositions(host){
    host.querySelectorAll('[data-ldapply]').forEach(el => el.addEventListener('click', async () => {
      const t = el.dataset.ldapply;
      const sl = parseFloat((host.querySelector('[data-ldsl="' + t + '"]') || {}).value);
      const tpRaw = ((host.querySelector('[data-ldtp="' + t + '"]') || {}).value || '').trim();
      const tp = tpRaw === '' ? 0 : parseFloat(tpRaw);
      if (!(sl > 0)) return toast('A real position must keep a stop', 'warn');
      if (!confirm('Tell the broker to set the stop of #' + t + ' to ' + fmtPrice(sl) + (tp > 0 ? ' and the target to ' + fmtPrice(tp) : ' and remove the target') + '?')) return;
      el.disabled = true;
      await this.modify(+t, sl, tp, 'set by hand');
      await Live.sync();
      this.refreshPositions();
    }));
    host.querySelectorAll('[data-ldchart]').forEach(el => el.addEventListener('click', () => this.showOnChart(el.dataset.ldchart)));
    host.querySelectorAll('[data-ldclose]').forEach(el => el.addEventListener('click', async () => {
      const t = el.dataset.ldclose;
      if (el.dataset.armed !== '1'){
        el.dataset.armed = '1'; el.textContent = 'Really close #' + t + ' now?';
        const keep = document.createElement('button'); keep.className = 'bMini'; keep.textContent = 'Keep it open';
        keep.addEventListener('click', () => { keep.remove(); delete el.dataset.armed; this.refreshPositions(); });
        el.after(keep);
        return;
      }
      el.disabled = true;
      await this.closeTicket(+t, 'closed by hand');
      this.refreshPositions();
    }));
  },
  async action(a, host){
    const S = this.load();
    if (a === 'howto'){ if (typeof DeskHowTo !== 'undefined') DeskHowTo.open(); return; }
    if (a === 'resetui'){ S.ui = { order: [], folded: {}, half: { money: true, exit: true } }; this.save(); return this.rerender(); }
    if (a === 'repick'){ this.autoPick(true); if (S.on) this.apply(true); toast('Chosen again from today’s ranking', 'ok'); return this.rerender(); }
    if (a === 'pairsall'){ S.pairs.blocked = []; this.save(); return this.rerender(); }
    if (a === 'exclall'){ S.excl = []; this.save(); return this.rerender(); }
    if (a === 'arm'){
      const acks = [...host.querySelectorAll('.ldAck')];
      const r = this.arm((document.getElementById('ldArmInput') || {}).value, acks.length && acks.every(b => b.checked));
      toast(r.ok ? 'Desk armed in SHADOW — ' + r.named.join(', ') : r.why, r.ok ? 'ok' : 'warn');
      return this.rerender();
    }
    if (a === 'golive'){
      const r = this.goLive((document.getElementById('ldLiveInput') || {}).value);
      toast(r.ok ? 'THE DESK IS LIVE — real orders can be placed' : r.why, 'warn');
      return this.rerender();
    }
    if (a === 'shadow'){ this.toShadow(); toast('Desk back in shadow — nothing will be sent', 'ok'); return this.rerender(); }
    if (a === 'off'){
      if (!confirm('Switch the desk off and disarm its bots?\n\nOpen real positions are NOT closed — close them from the cards, or the kill switch at the top.')) return;
      this.off('by hand'); return this.rerender();
    }
  },
};
