/* ASTRA Terminal — shared live connection, arming and automated order submission.
   The separate live-manual.js ticket uses these arming gates and submits its
   reviewed market requests through the bridge's dedicated manual endpoint.

   This is the only part of ASTRA that can move real money, and it is built to be
   difficult. Four independent things must all be true before a single order is
   sent, and any one of them failing stops everything:

     1. the bridge was started by START-LIVE-TRADING.bat  (a window you opened)
     2. its six-digit session code has been entered here  (a code only that window shows)
     3. the bot is armed, individually, by name           (a phrase you typed)
     4. that bot is in LIVE and not SHADOW mode           (a second phrase you typed)

   On top of that every order is measured against caps you set beforehand, the
   Master Brain has a veto, and a kill switch disarms everything at once. Real
   results are read back from MetaTrader itself, never from ASTRA's simulation.

   New bots start in SHADOW: fully armed, fully logged, nothing sent. That is
   where a bot should live for weeks before it is trusted with anything. */
const Live = {

  BRIDGE: 'http://127.0.0.1:8644',

  DEFAULT_CAPS: {
    riskPct: 0.5,          // % of live balance risked per trade
    maxLots: 0.05,         // hard ceiling on order size
    maxOpen: 2,            // live positions at once, across all bots
    maxDailyLossPct: 2,    // stop for the day past this
    maxTotalLossPct: 10,   // disarm everything past this
    instruments: [],       // explicit allow-list; empty means nothing may trade
    sessionFrom: '00:00',
    sessionTo: '23:59',
  },

  state: null,
  book: null,
  bridge: { trading: false, account: null, balance: null, currency: '', server: '', checked: 0 },

  /* ---------- storage ---------- */
  load(){
    this.state = lsGet('astra_live', null) || {
      code: '', linked: false, armed: {}, caps: Object.assign({}, this.DEFAULT_CAPS),
      killedAt: 0, killReason: '', startBalance: null, audit: [],
    };
    this.state.caps = Object.assign({}, this.DEFAULT_CAPS, this.state.caps || {});
    if (!this.state.armed) this.state.armed = {};
    if (!this.state.audit) this.state.audit = [];
    return this.state;
  },
  save(){ lsSet('astra_live', this.state); },

  loadBook(){
    this.book = lsGet('astra_livebook', null) || { orders: [], open: [], closed: [], syncedAt: 0 };
    return this.book;
  },
  saveBook(){
    const b = this.book;
    if (b.orders.length > 500) b.orders.length = 500;
    if (b.closed.length > 500) b.closed.length = 500;
    return lsSet('astra_livebook', b) !== false;
  },

  audit(kind, text, data){
    this.load();
    this.state.audit.unshift({ t: Date.now(), kind, text, data: data || null });
    if (this.state.audit.length > 300) this.state.audit.length = 300;
    this.save();
  },

  /* ---------- the bridge ---------- */
  async probe(){
    try {
      const r = await fetch(this.BRIDGE + '/health', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      const j = await r.json();
      this.bridge = { trading: !!j.trading, account: j.account || null, balance: j.balance,
                      currency: j.currency || '', server: j.server || '', magic: j.magic, checked: Date.now() };
    } catch(e){
      this.bridge = { trading: false, account: null, balance: null, currency: '', server: '', checked: Date.now() };
    }
    return this.bridge;
  },

  /* Validate the session code without any side effect: asking to close ticket 0
     is refused for a bad code (403) and simply not found for a good one (404). */
  async link(code){
    code = String(code || '').trim();
    if (!/^\d{6}$/.test(code)) return { ok: false, why: 'The code is six digits.' };
    await this.probe();
    if (!this.bridge.trading)
      return { ok: false, why: 'The live bridge is not running. Close the read-only bridge and start START-LIVE-TRADING.bat.' };
    try {
      const r = await fetch(this.BRIDGE + '/close', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code, ticket: 0 }), signal: AbortSignal.timeout(4000),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 403 || j.error === 'bad_code')
        return { ok: false, why: 'That code was refused. Read the six digits again in the bridge window.' };
      this.load();
      this.state.code = code;
      this.state.linked = true;
      this.state.startBalance = this.bridge.balance;
      this.save();
      this.audit('link', 'Linked to account ' + this.bridge.account + ' on ' + this.bridge.server);
      return { ok: true };
    } catch(e){
      return { ok: false, why: 'The bridge did not answer: ' + e.message };
    }
  },

  unlink(){
    this.load();
    this.state.code = ''; this.state.linked = false;
    this.save();
    this.audit('unlink', 'Session code cleared');
  },

  /* ---------- arming ---------- */
  armedEntry(id){ this.load(); return this.state.armed[id] || null; },
  armedList(){ this.load(); return Object.keys(this.state.armed); },
  liveCount(){ return this.armedList().filter(id => this.state.armed[id].mode === 'live').length; },

  /* what a bot has to show before it may be armed at all */
  readiness(botId){
    const rows = (typeof BotReports !== 'undefined') ? BotReports.rows() : [];
    const r = rows.find(x => x.id === botId);
    if (!r) return { ok: false, met: 0, of: 0, checks: [], why: 'No record for this bot' };
    return { ok: r.ready >= 4, met: r.ready, of: BotReports.READY.length, checks: r.checks,
             why: r.ready >= 4 ? '' : 'It meets ' + r.ready + ' of ' + BotReports.READY.length + ' conditions; four is the minimum to arm even in shadow.' };
  },

  arm(botId, caps, typed){
    this.load();
    const bot = BOT_BY_ID[botId];
    if (!bot) return { ok: false, why: 'Unknown bot' };
    if (String(typed || '').trim().toLowerCase() !== bot.name.trim().toLowerCase())
      return { ok: false, why: 'Type the bot’s name exactly to arm it.' };
    // A discretionary manual ticket is armed by its operator's named consent,
    // not by pretending it has an automated strategy's research record.
    const ready = bot.liveManual ? {ok:true,met:0} : this.readiness(botId);
    if (!ready.ok) return { ok: false, why: ready.why };

    this.state.caps = Object.assign({}, this.state.caps, caps || {});
    if (!this.state.caps.instruments.length)
      return { ok: false, why: 'Choose at least one instrument it may trade. An empty list means nothing is allowed.' };

    this.state.armed[botId] = { at: Date.now(), mode: 'shadow', readyAt: ready.met };
    this.state.killedAt = 0; this.state.killReason = '';
    this.save();
    this.audit('arm', bot.name + ' armed in SHADOW — orders will be recorded, not sent',
      { caps: this.state.caps });
    return { ok: true };
  },

  goLive(botId, typed){
    this.load();
    const bot = BOT_BY_ID[botId];
    const a = this.state.armed[botId];
    if (!bot || !a) return { ok: false, why: 'That bot is not armed.' };
    if (String(typed || '').trim().toUpperCase() !== 'TRADE REAL MONEY')
      return { ok: false, why: 'Type TRADE REAL MONEY to switch this bot from shadow to live.' };
    if (!this.state.linked) return { ok: false, why: 'The bridge session code has not been entered.' };
    if (!this.bridge.trading) return { ok: false, why: 'The live bridge is not running.' };
    a.mode = 'live'; a.liveAt = Date.now();
    this.save();
    this.audit('golive', bot.name + ' switched to LIVE — it can now place real orders');
    return { ok: true };
  },

  toShadow(botId){
    this.load();
    const a = this.state.armed[botId];
    if (!a) return;
    a.mode = 'shadow';
    this.save();
    this.audit('shadow', (BOT_BY_ID[botId] || {}).name + ' put back into shadow');
  },

  disarm(botId, why){
    this.load();
    const bot = BOT_BY_ID[botId];
    const wasDesk = !!(this.state.armed[botId] || {}).desk;
    delete this.state.armed[botId];
    this.save();
    if (wasDesk && typeof LiveDesk !== 'undefined') LiveDesk.dropped(botId);
    this.audit('disarm', ((bot && bot.name) || botId) + ' disarmed' + (why ? ' — ' + why : ''));
  },

  kill(reason){
    this.load();
    const n = Object.keys(this.state.armed).length;
    this.state.armed = {};
    this.state.killedAt = Date.now();
    this.state.killReason = reason || 'stopped by the operator';
    this.save();
    this.audit('kill', 'KILL SWITCH — ' + n + ' bot(s) disarmed: ' + this.state.killReason);
    if (typeof LiveDesk !== 'undefined') LiveDesk.onKill();
    if (typeof toast === 'function') toast('Live trading stopped — every bot disarmed', 'warn');
  },

  /* ---------- the gates every order must pass ---------- */
  hhmm(){
    const d = new Date();
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },

  dayKey(){
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  dayPnl(){
    this.loadBook();
    const k = this.dayKey();
    return this.book.closed.filter(t => t.day === k).reduce((a, t) => a + (t.net || 0), 0);
  },

  totalPnl(){
    this.loadBook();
    return this.book.closed.reduce((a, t) => a + (t.net || 0), 0);
  },

  /* Size a live order from the REAL account balance.

     The paper engine sizes against its own virtual 10,000, which is the right
     thing for a simulation and the wrong thing here: on a live account of a few
     hundred it would ask for an order many times too large. Live orders are
     therefore always re-sized from the balance MetaTrader reports, using the
     broker's own contract specification, and rounded down to a whole lot step.

     If the smallest lot the broker will accept already risks more than the cap,
     the honest answer is to refuse. Some instruments simply cannot be traded at
     0.5% of a small account. */
  liveLots(sig, opts){
    opts = opts || {};
    const bal = opts.balance > 0 ? opts.balance : (this.bridge.balance || this.state.startBalance || 0);
    if (!(bal > 0)) return { ok: false, why: 'the live balance is not known yet — press Refresh' };

    const C = this.state.caps;
    /* the live desk hands over the money it wants risked (a share of the bots'
       own pool); without it the cap is a share of the whole balance */
    const riskBase = opts.riskBase > 0 ? opts.riskBase : bal;
    const riskPct = opts.riskPct > 0 ? opts.riskPct : C.riskPct;
    const baseName = opts.riskBase > 0 ? 'the bot money' : 'the live balance';
    const stopDist = Math.abs(sig.entry - sig.sl);
    if (!(stopDist > 0)) return { ok: false, why: 'the stop distance is zero' };

    const spec = (typeof Feed !== 'undefined' && Feed.specFor) ? Feed.specFor(sig.sym) : null;
    if (!spec || !(spec.tickSize > 0) || !(spec.tickValue > 0))
      return { ok: false, why: 'the contract size for ' + baseAsset(sig.sym) +
        ' is not known — the MT5 bridge has to be running so the specifications load' };

    const riskPerLot = (stopDist / spec.tickSize) * spec.tickValue;
    if (!(riskPerLot > 0)) return { ok: false, why: 'the contract value could not be worked out' };

    const riskCash = riskBase * riskPct / 100;
    const step = spec.volumeStep || 0.01;
    const minLot = spec.volumeMin || step;
    let lots = Math.floor((riskCash / riskPerLot) / step) * step;

    if (lots < minLot){
      const minRisk = minLot * riskPerLot;
      return { ok: false, why: 'the smallest size the broker accepts (' + minLot + ' lot) would risk ' +
        fmtNum(minRisk) + ', which is ' + (minRisk / riskBase * 100).toFixed(2) + '% of ' + baseName + ' — above your ' +
        riskPct + '% limit', minRisk, minLot };
    }
    lots = Math.min(lots, C.maxLots, spec.volumeMax || lots);
    lots = Math.floor(lots / step) * step;
    if (lots < minLot)
      return { ok: false, why: 'your ' + C.maxLots + ' lot ceiling is below the broker minimum of ' + minLot };

    return { ok: true, lots: +lots.toFixed(4), riskCash: +(lots * riskPerLot).toFixed(2), balance: bal, riskPerLot };
  },

  check(bot, sig, gate, quote){
    this.load();
    const C = this.state.caps;
    const a = this.state.armed[bot.id];

    if (!a) return { ok: false, reason: 'not armed' };
    if (this.state.killedAt) return { ok: false, reason: 'live trading was stopped: ' + this.state.killReason };
    /* a desk bot in SHADOW may rehearse against the ordinary read-only bridge
       (it only needs the balance and the contract sizes); LIVE still needs the
       live bridge and its code, and so does every hand-armed bot */
    const rehearsing = !!(a.desk && a.mode !== 'live');
    if (!this.state.linked && !rehearsing) return { ok: false, reason: 'the bridge session code has not been entered' };
    if (!this.bridge.trading && !rehearsing) return { ok: false, reason: 'the live bridge is not running' };
    if (rehearsing && !(this.bridge.balance > 0) && !(this.state.startBalance > 0)) return { ok: false, reason: 'the account balance is not known yet — is the MT5 bridge running?' };

    /* a bot the live desk armed is judged by the desk's own choices — its
       markets, pairs, timeframes and the bots' own pool of money. Everything
       below (hours, ceilings, loss limits, kill switch) still applies on top. */
    const desk = (typeof LiveDesk !== 'undefined' && a.desk) ? LiveDesk.gate(bot, sig) : null;
    if (desk && !desk.ok) return { ok: false, reason: desk.why, stage: 'desk', quiet: !!desk.quiet };
    if (!desk && !C.instruments.includes(sig.sym))
      return { ok: false, reason: baseAsset(sig.sym) + ' is not on the allowed list' };

    const now = this.hhmm();
    if (C.sessionFrom <= C.sessionTo){
      if (now < C.sessionFrom || now > C.sessionTo)
        return { ok: false, reason: 'outside the trading hours ' + C.sessionFrom + '–' + C.sessionTo };
    } else if (now < C.sessionFrom && now > C.sessionTo){
      return { ok: false, reason: 'outside the trading hours ' + C.sessionFrom + '–' + C.sessionTo };
    }

    const sl = desk ? desk.sl : sig.sl, tp = desk ? desk.tp : (sig.tp || 0);
    if (!(sl > 0)) return { ok: false, reason: 'no stop-loss' };

    /* the size is worked out here, from the real balance — never taken from the
       paper engine, which sizes against its own virtual account */
    const sized = desk ? desk.sized : this.liveLots(sig);
    if (!sized.ok) return { ok: false, reason: sized.why };
    const lots = sized.lots;
    const bal = sized.balance;
    if (lots > C.maxLots)
      return { ok: false, reason: lots + ' lots is over the ceiling of ' + C.maxLots };

    this.loadBook();
    if (this.book.open.length >= C.maxOpen)
      return { ok: false, reason: 'already holding ' + this.book.open.length + ' live positions (limit ' + C.maxOpen + ')' };
    if (this.book.open.some(p => p.symbol === sig.sym))
      return { ok: false, reason: 'already live in ' + baseAsset(sig.sym) };

    if (bal > 0){
      const day = this.dayPnl();
      if (day < -(bal * C.maxDailyLossPct / 100))
        return { ok: false, reason: 'daily loss limit of ' + C.maxDailyLossPct + '% reached' };
      const tot = this.totalPnl();
      if (tot < -(bal * C.maxTotalLossPct / 100)){
        this.kill('total loss limit of ' + C.maxTotalLossPct + '% reached');
        return { ok: false, reason: 'total loss limit reached — everything disarmed' };
      }
    }
    return { ok: true, mode: a.mode, lots, sl, tp, desk: !!desk };
  },

  /* ---------- sending ---------- */
  async submit(bot, sig, gate, quote){
    this.load();
    const deskBot = typeof LiveDesk !== 'undefined' && !!(this.state.armed[bot.id] || {}).desk;
    if (deskBot) LiveDesk.saw(bot, sig);
    const g = this.check(bot, sig, gate, quote);
    if (!g.ok){
      this.record({ bot: bot.id, botName: bot.name, sym: sig.sym, dir: sig.dir, sent: false,
                    refused: g.reason, at: Date.now() });
      if (deskBot) LiveDesk.refused(bot, sig, g.reason, g.stage || 'ceiling', g.quiet);
      return { ok: false, reason: g.reason };
    }

    const order = {
      code: this.state.code,
      symbol: sig.sym,
      side: sig.dir > 0 ? 'buy' : 'sell',
      lots: g.lots,
      sl: g.sl,
      tp: g.tp || 0,
      comment: 'ASTRA ' + bot.id,
    };

    /* SHADOW: everything is worked out and written down, nothing is sent */
    if (g.mode !== 'live'){
      this.record({ bot: bot.id, botName: bot.name, sym: sig.sym, dir: sig.dir, lots: g.lots,
                    entry: sig.entry, sl: g.sl, tp: g.tp, sent: false, shadow: true, desk: g.desk,
                    at: Date.now(), tf: sig.tf, model: sig.model });
      this.audit('shadow-order', bot.name + ' would have ' + order.side.toUpperCase() + ' ' +
        baseAsset(sig.sym) + ' ' + g.lots + ' lots', order);
      if (g.desk && typeof LiveDesk !== 'undefined'){
        LiveDesk.sent(bot, sig, false, g.lots);
        LiveDesk.note('shadow', 'SHADOW · ' + bot.name + ' would ' + order.side.toUpperCase() + ' ' + baseAsset(sig.sym) + ' ' + g.lots + ' lot' + (sig.tf ? ' on ' + sig.tf : '') + ' · stop ' + fmtPrice(g.sl) + (g.tp ? ' · target ' + fmtPrice(g.tp) : '') + ' · risk ' + fmtNum(LiveDesk.lastRisk || 0));
      }
      return { ok: true, shadow: true };
    }

    try {
      const r = await fetch(this.BRIDGE + '/order', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify(order), signal: AbortSignal.timeout(15000),
      });
      const j = await r.json().catch(() => ({}));
      const ok = r.ok && j.ok;
      this.record({ bot: bot.id, botName: bot.name, sym: sig.sym, dir: sig.dir, lots: g.lots,
                    entry: j.price || sig.entry, sl: g.sl, tp: g.tp, sent: true, ok, desk: g.desk,
                    ticket: j.ticket || null, retcode: j.retcode, brokerSaid: j.comment || j.message || j.error,
                    at: Date.now(), tf: sig.tf, model: sig.model });
      this.audit(ok ? 'order' : 'order-failed',
        bot.name + ' ' + order.side.toUpperCase() + ' ' + baseAsset(sig.sym) + ' ' + g.lots + ' lots — ' +
        (ok ? 'filled at ' + j.price + ', ticket ' + j.ticket : 'refused: ' + (j.message || j.error || j.comment)), j);
      if (ok && typeof toast === 'function')
        toast('LIVE ' + order.side.toUpperCase() + ' ' + baseAsset(sig.sym) + ' ' + g.lots + ' lots — ticket ' + j.ticket, 'ok');
      if (!ok && typeof toast === 'function')
        toast('Live order refused: ' + (j.message || j.error || j.comment), 'warn');
      if (ok && g.desk && typeof LiveDesk !== 'undefined'){
        LiveDesk.adopt(j.ticket, bot.id, sig, order);
        LiveDesk.sent(bot, sig, true, g.lots);
        LiveDesk.note('order', 'REAL · ' + bot.name + ' ' + order.side.toUpperCase() + ' ' + baseAsset(sig.sym) + ' ' + g.lots + ' lot' + (sig.tf ? ' on ' + sig.tf : '') + ' — filled at ' + fmtPrice(j.price) + ', ticket ' + j.ticket + ' · stop ' + fmtPrice(g.sl) + (g.tp ? ' · target ' + fmtPrice(g.tp) : ''));
      }
      if (!ok && g.desk && typeof LiveDesk !== 'undefined') LiveDesk.note('order-failed', 'REAL order refused by the broker · ' + bot.name + ' ' + baseAsset(sig.sym) + ' — ' + (j.message || j.error || j.comment));
      await this.sync();
      return { ok, result: j };
    } catch(e){
      this.record({ bot: bot.id, botName: bot.name, sym: sig.sym, dir: sig.dir, lots: g.lots,
                    sent: true, ok: false, brokerSaid: e.message, at: Date.now() });
      this.audit('order-failed', bot.name + ' order could not be sent — ' + e.message);
      return { ok: false, reason: e.message };
    }
  },

  record(o){
    this.loadBook();
    this.book.orders.unshift(o);
    return this.saveBook();
  },

  /* ---------- the truth, read back from MetaTrader ---------- */
  async sync(){
    if (!this.bridge.trading && !this.state) return;
    this.loadBook();
    try {
      const [pr, dr] = await Promise.all([
        fetch(this.BRIDGE + '/positions', { cache: 'no-store', signal: AbortSignal.timeout(4000) }).then(r => r.json()),
        fetch(this.BRIDGE + '/deals?days=60', { cache: 'no-store', signal: AbortSignal.timeout(6000) }).then(r => r.json()),
      ]);
      const magic = this.bridge.magic || 20260902;
      /* only what ASTRA itself opened — a hand-placed trade is none of its business */
      this.book.open = (pr.positions || []).filter(p => p.magic === magic);
      this.book.closed = (dr.deals || []).filter(d => d.magic === magic).map(d => ({
        ticket: d.position, dealTicket: d.ticket, symbol: d.symbol, volume: d.volume,
        price: d.price, dir: d.type === 'buy' ? -1 : 1,     // the closing deal is the opposite side
        profit: d.profit, commission: d.commission, swap: d.swap,
        net: +(d.profit + d.commission + d.swap).toFixed(2),
        time: d.time * 1000, day: this.dayOfTs(d.time * 1000),
        bot: (d.comment || '').replace('ASTRA ', '').trim(), comment: d.comment,
      }));
      this.book.syncedAt = Date.now();
      this.saveBook();
    } catch(e){ /* the bridge is simply not there; nothing to reconcile */ }
    return this.book;
  },

  dayOfTs(ts){
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  /* ---------- reporting, entirely separate from paper ---------- */
  stats(){
    this.loadBook();
    const c = this.book.closed;
    const won = c.filter(t => t.net > 0), lost = c.filter(t => t.net <= 0);
    const gw = won.reduce((a, t) => a + t.net, 0);
    const gl = Math.abs(lost.reduce((a, t) => a + t.net, 0));
    return {
      trades: c.length, won: won.length, lost: lost.length,
      winRate: c.length ? won.length / c.length * 100 : 0,
      net: c.reduce((a, t) => a + t.net, 0),
      fees: c.reduce((a, t) => a + (t.commission || 0) + (t.swap || 0), 0),
      pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      open: this.book.open.length,
      openPnl: this.book.open.reduce((a, p) => a + (p.profit || 0), 0),
      today: this.dayPnl(),
      syncedAt: this.book.syncedAt,
    };
  },

  status(){
    this.load();
    const armed = this.armedList().length;
    const live = this.liveCount();
    if (this.state.killedAt) return { cls: 'bad', label: 'STOPPED', text: this.state.killReason };
    if (!this.bridge.trading) return { cls: 'idle', label: 'READ-ONLY', text: 'The live bridge is not running — nothing can be sent.' };
    if (!this.state.linked) return { cls: 'idle', label: 'NOT LINKED', text: 'The bridge is live but its session code has not been entered here.' };
    if (!armed) return { cls: 'idle', label: 'IDLE', text: 'Linked to the account, but no bot is armed.' };
    const desk = typeof LiveDesk !== 'undefined' && LiveDesk.isOn() ? ' · desk on' : '';
    if (live) return { cls: 'live', label: 'LIVE · ' + live + ' BOT' + (live > 1 ? 'S' : '') + desk,
                       text: 'Real orders can be placed right now.' };
    return { cls: 'shadow', label: 'SHADOW · ' + armed + desk, text: 'Armed, recording every decision, sending nothing.' };
  },
};
