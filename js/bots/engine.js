/* ASTRA Terminal — bot core: risk engine, paper ledger and virtual execution.
   ------------------------------------------------------------------------
   EVERYTHING IN THIS FILE IS PAPER. There is no order function here, no
   credential and no write path to MetaTrader; this engine only ever moves
   numbers in a local ledger.

   Real orders live in exactly one other place — js/bots/live.js — which is off
   by default and needs four separate gates opened by hand, and which talks to a
   bridge that must itself have been started in trading mode. Nothing in this
   file can reach it, and nothing here behaves differently when a bot is armed.

   Past results — backtested or paper — never guarantee future profit. */
const BotEngine = {
  /* ---------- defaults every bot inherits ---------- */
  RISK: {
    /* 0.5% per trade. Chosen deliberately: on an 800 USD account the smallest lot
       your broker will accept already risks roughly 0.4–1.1% on most instruments,
       so anything tighter simply refuses every trade. This is the floor the
       contract sizes impose, not a preference. */
    riskPct: 0.5,             // % of virtual equity risked per trade
    maxNotionalPct: 100,      // position value cannot exceed one virtual account
    maxOpen: 3,               // open positions per bot
    maxPerSymbol: 1,          // positions in the same instrument
    maxCorrelated: 2,         // gross positions sharing a market group or FX currency, per virtual account
    maxDailyLossPct: 2,       // lock the bot for the day past this loss
    minEquity: 100,           // stop trading below this equity
    maxSpreadAtrPct: 25,      // reject if spread eats >25% of the stop distance
    maxSpreadPct: 0.10,       // reject if spread > 0.10% of price
    maxSpreadManualPct: 1.5,  // a trade you place by hand may cross a wider spread
    staleQuoteSec: 180,       // reject on quotes older than this
    /* Costs are modelled per side of the trade. 0.1% is a realistic exchange
       taker fee; JustMarkets CFDs are mostly spread-only, so set this lower for
       those bots. Getting this number wrong changes everything: with tight stops
       the position is large, so a fee that is 2x too high can turn a break-even
       strategy into a clear loser on paper. */
    commissionPct: 0.003,     // PERCENT per side (0.003 = 0.003%), see commissionFrac
    slippagePct: 0.005,       // per side, % of price
    timeLimitBars: 240,       // give up on a trade after this many bars
    startEquity: 10000,
  },

  TFS: ['1m', '5m', '15m', '1h', '4h', '1d'],
  PRIORITY: ['XAUUSD.m', 'XAGUSD.m', 'BTCUSD.m', 'US100.std', 'US30.std', 'WTI.m', 'BRENT.m'],

  /* ---------- ledger ---------- */
  blank(id){
    return {
      id, equity: this.RISK.startEquity, startEquity: this.RISK.startEquity,
      open: [], closed: [], decisions: [], lessons: [], equityCurve: [],
      factors: {}, daily: {}, lockedUntil: 0, seq: 1,
    };
  },

  load(id){
    const l = lsGet('astra_bot_' + id, null);
    if (!l) return this.blank(id);
    return Object.assign(this.blank(id), l);
  },
  save(id, ledger){
    if (ledger.decisions.length > 300) ledger.decisions.length = 300;
    if (ledger.lessons.length > 120) ledger.lessons.length = 120;
    if (ledger.closed.length > 500) ledger.closed.length = 500;
    if (ledger.equityCurve.length > 1500) ledger.equityCurve.splice(0, ledger.equityCurve.length - 1500);
    const saved = lsSet('astra_bot_' + id, ledger) !== false;
    if (saved) this.unsaved.delete(ledger); else this.unsaved.add(ledger);
    return saved;
  },
  unsaved: new WeakSet(),

  dayKey(ts){ return new Date(ts || Date.now()).toISOString().slice(0, 10); },

  // Replay permission belongs to a disposable ledger, never to a saved bot setting.
  replays: new WeakSet(),
  now(ledger, cfg){ return this.replays.has(ledger) ? cfg.nowTs : Date.now(); },
  rules(cfg){
    const R = Object.assign({}, this.RISK, cfg.risk || {});
    for (const k of ['maxOpen', 'maxPerSymbol', 'maxCorrelated']){
      if (cfg[k] != null) R[k] = cfg.risk && cfg.risk[k] != null ? Math.min(cfg[k], cfg.risk[k]) : cfg[k];
    }
    return R;
  },
  symbolKey(sym){
    const base = typeof Feed !== 'undefined' ? Feed.baseOf(Feed.brokerName(sym)) : String(sym).toUpperCase();
    return base.replace(/USDT$/, 'USD');
  },
  exposureKeys(sym){
    const key = this.symbolKey(sym);
    const known = typeof BROKER !== 'undefined' ? BROKER.all().find(s => this.symbolKey(s) === key) : null;
    const group = typeof BROKER !== 'undefined' ? BROKER.costGroup(known || sym) : '';
    if (['metal', 'energy', 'index', 'crypto'].includes(group)) return ['group:' + group];
    if (/^(AUD|CAD|CHF|EUR|GBP|JPY|NZD|USD){2}$/.test(key))
      return ['fx:' + key.slice(0, 3), 'fx:' + key.slice(3, 6)];
    return ['symbol:' + key];
  },
  dailyPnl(ledger, now){
    const day = ledger.daily[this.dayKey(now)] || {};
    // Older daily totals omit entry fees and don't date partial exits. Reserve
    // all recorded fees and unbanked partial losses conservatively, without
    // rewriting the historical ledger or inventing missing execution dates.
    return (day.pnl ?? 0) - (day.fees ?? 0) - ledger.open.reduce((sum, p) =>
      sum + (p.fees ?? 0) - Math.min(0, p.partialPnl ?? 0), 0);
  },
  remainingRisk(pos, R, stop){
    const sl = stop == null ? pos.sl : stop;
    if (!(Number.isFinite(sl) && sl > 0)) return Infinity;
    const exit = sl * (1 - pos.dir * R.slippagePct / 100);
    return Math.max(0, (pos.entry - exit) * pos.dir * pos.qty) +
      exit * pos.qty * this.commissionFrac(pos.sym, R);
  },

  funds(ledger, R){
    const equity = Math.min(ledger.equity, this.equityNow(ledger));
    // Reserve full position value, not margin divided by broker leverage.
    // A losing position cannot release its allocation just because price fell.
    const used = ledger.open.reduce((sum, p) => sum + Math.abs(p.qty) * Math.max(p.entry, p.last ?? p.entry), 0);
    const limit = Math.max(0, equity * R.maxNotionalPct / 100);
    return { equity, used, limit, free: Math.max(0, limit - used) };
  },

  note(ledger, kind, text, extra){
    ledger.decisions.unshift(Object.assign({ t: Date.now(), kind, text }, extra || {}));
  },

  /* ---------- risk gates ----------
     Returns {ok:true, ...sizing} or {ok:false, reason}. Every rejection is
     explainable — the bot shows exactly which gate stopped it. */
  /* ---------- what a trade really costs ----------
     Everything in this app states a cost as a PERCENT: spreadPct 0.006 means
     0.006%, and slippagePct is divided by 100 at every use. commissionPct was
     the one exception — it was multiplied straight into the notional, so the
     default 0.001 charged 0.1% a side and the broker table's 0.003 charged
     0.3%. The real figure on this account is 0.003% a side on FX, metals and
     energy, and ZERO on indices and crypto: between 33 and 100 times less than
     what was being taken out of every paper trade.

     It also has to be per instrument. Charging an index the FX commission is
     wrong in the direction that matters most to a scalper, where the cost IS
     the strategy. */
  commissionFrac(sym, R){
    let pct = R && R.commissionPct != null ? R.commissionPct : 0.003;
    if (sym && typeof BROKER !== 'undefined' && BROKER.costsFor){
      const c = BROKER.costsFor(sym);
      if (c && c.commissionPct != null) pct = c.commissionPct;
    }
    return Math.max(0, pct) / 100;
  },

  /* spread + both commissions, as a fraction of price — the hurdle any target
     has to clear before a trade can make money at all */
  roundTripCost(sym, quote){
    const px = quote && quote.price > 0 ? quote.price : 0;
    const spreadFrac = (px > 0 && quote.spread > 0) ? quote.spread / px : 0;
    return spreadFrac + 2 * this.commissionFrac(sym, this.RISK);
  },

  check(ledger, cfg, sig, quote){
    if (this.unsaved.has(ledger)) return { ok: false, reason: 'Save failed — new entries are blocked until this ledger is saved' };
    const R = this.rules(cfg);
    /* In a backtest "now" is the time of the bar being replayed, not the real
       clock. Without this the daily-loss lock was set to tonight's real midnight
       and never expired, so the first bad day silently locked out the entire
       remainder of every backtest. */
    const now = this.now(ledger, cfg);
    if (!Number.isFinite(ledger.equity) || !Number.isFinite(ledger.startEquity) ||
        !['riskPct', 'maxNotionalPct', 'maxDailyLossPct', 'minEquity', 'maxSpreadAtrPct', 'maxSpreadPct',
          'maxSpreadManualPct', 'staleQuoteSec', 'slippagePct', 'commissionPct'].every(k => Number.isFinite(R[k]) && R[k] >= 0) ||
        !['maxOpen', 'maxPerSymbol', 'maxCorrelated'].every(k => Number.isInteger(R[k]) && R[k] >= 0))
      return { ok: false, reason: 'Invalid equity or risk limits — entry refused' };

    if (!this.replays.has(ledger) && cfg.paused)
      return { ok: false, reason: 'New entries are paused; existing stops remain active' };
    const equity = Math.min(ledger.equity, this.equityNow(ledger));
    if (!Number.isFinite(equity)) return { ok: false, reason: 'Open-position equity is invalid' };
    if (equity < R.minEquity)
      return { ok: false, reason: 'Equity ' + fmtNum(ledger.equity) + ' is below the minimum of ' + R.minEquity };

    if (ledger.lockedUntil > now)
      return { ok: false, reason: 'Daily loss limit reached — locked until ' + new Date(ledger.lockedUntil).toLocaleTimeString() };

    const dayPnl = this.dailyPnl(ledger, now);
    const dailyLimit = ledger.startEquity * R.maxDailyLossPct / 100;
    const floatingLoss = ledger.open.reduce((sum, p) => sum + Math.min(0,
      ((p.last || p.entry) - p.entry) * p.dir * p.qty), 0);
    if (!Number.isFinite(dayPnl) || !Number.isFinite(floatingLoss))
      return { ok: false, reason: 'Daily loss or open-position values are invalid' };
    if (dayPnl + floatingLoss <= -dailyLimit){
      const midnight = new Date(now); midnight.setUTCHours(24, 0, 0, 0);
      ledger.lockedUntil = midnight.getTime();
      return { ok: false, reason: 'Daily loss limit of ' + R.maxDailyLossPct + '% hit — no more entries today' };
    }

    if (ledger.open.length >= R.maxOpen)
      return { ok: false, reason: 'Already holding the maximum of ' + R.maxOpen + ' open positions' };

    if (ledger.open.filter(p => this.symbolKey(p.sym) === this.symbolKey(sig.sym)).length >= R.maxPerSymbol)
      return { ok: false, reason: 'Already in ' + baseAsset(sig.sym) + ' (limit ' + R.maxPerSymbol + ' per instrument)' };

    const keys = this.exposureKeys(sig.sym);
    if (keys.some(key => ledger.open.filter(p => this.exposureKeys(p.sym).includes(key)).length >= R.maxCorrelated))
      return { ok: false, reason: 'Related-exposure limit of ' + R.maxCorrelated + ' reached for this virtual account' };

    if (!quote || !(quote.price > 0))
      return { ok: false, reason: 'No usable price for ' + baseAsset(sig.sym) };

    const quoteAge = !this.replays.has(ledger) && quote.time != null ? Date.now() / 1000 - quote.time : quote.ageSec;
    if (!Number.isFinite(quoteAge) || quoteAge < 0 || quoteAge >= Math.min(180, R.staleQuoteSec))
      return { ok: false, reason: 'Quote is stale (' + Math.round(quote.ageSec) + 's old, limit ' + R.staleQuoteSec + 's)' };

    /* Live-only. A delayed price is not a price you can be filled at, so in this
       mode an instrument that is not on a real-time feed is refused outright
       rather than merely flagged. This is the last gate before sizing. */
    if (!this.replays.has(ledger) && (typeof Feed === 'undefined' || !Feed.isLive(sig.sym) ||
        (quote.source != null && !['bridge', 'binance'].includes(quote.source))))
      return { ok: false, reason: 'No fresh MT5 or exchange-stream price — entry refused' };
    if (!this.replays.has(ledger) && typeof PairRules !== 'undefined' && PairRules.blocked(sig.sym))
      return { ok: false, reason: sig.sym + ' is blocked. Open Instrument permissions to allow this pair.' };

    if (![sig.entry, sig.sl, quote.price].every(v => Number.isFinite(v) && v > 0) ||
        ![1, -1].includes(sig.dir) || (quote.price - sig.sl) * sig.dir <= 0)
      return { ok: false, reason: 'No stop-loss — an entry without a stop is never allowed' };

    const spread = quote.spread != null ? quote.spread : quote.price * 0.0002;
    const spreadPct = spread / quote.price * 100;
    /* A hand-placed trade is a decision already taken, so it gets a wider
       absolute ceiling. The 0.10% limit is meant for tight majors and was
       refusing EVERY manual entry on platinum, whose normal spread is 0.11%.
       The PROPORTIONAL test below still applies to everyone, and it is the one
       that matters: the spread against the distance to the stop, not the price. */
    const spreadCap = sig.manual ? R.maxSpreadManualPct : R.maxSpreadPct;
    if (spreadPct > spreadCap)
      return { ok: false, reason: 'Spread ' + spreadPct.toFixed(3) + '% is above the limit of ' + spreadCap + '%' };

    const stopDist = Math.abs(quote.price - sig.sl);
    if (spread / stopDist * 100 > R.maxSpreadAtrPct)
      return { ok: false, reason: 'Spread is ' + (spread / stopDist * 100).toFixed(0) +
        '% of the stop distance (limit ' + R.maxSpreadAtrPct + '%) — the stop needs to be at least ' +
        fmtPrice(spread * 100 / R.maxSpreadAtrPct) + ' away, or leave it empty and one will be placed for you' };

    const sized = this.size(ledger, R, sig, quote, spread);
    if (!sized.ok) return sized;
    const reserved = ledger.open.reduce((sum, p) => sum + this.remainingRisk(p, R), 0);
    if (!Number.isFinite(reserved) || reserved + sized.riskCash > Math.max(0, dailyLimit + Math.min(0, dayPnl)) + 1e-8)
      return { ok: false, reason: 'Open stops and this entry would exceed the remaining daily loss budget' };
    return sized;
  },

  /* One sizing calculation for automatic entries, typed amounts/lots and the
     preview. A broker's leverage is NOT permission to multiply this ceiling.
     Count the existing spread, slippage and fees in the loss at the stop; a
     signal's old candle price cannot define the risk of a new market fill. */
  size(ledger, R, sig, quote, spread){
    const equity = Math.min(ledger.equity, this.equityNow(ledger));
    if (![equity, R.riskPct, R.maxNotionalPct].every(v => Number.isFinite(v) && v > 0))
      return { ok: false, reason: 'Equity, risk and position-value limits must be finite and positive' };
    if (!(Number.isFinite(spread) && spread >= 0))
      return { ok: false, reason: 'Invalid spread' };
    const fill = quote.price * (1 + sig.dir * R.slippagePct / 100) + sig.dir * spread / 2;
    if ([sig.tp, sig.tp1].some(target => target != null &&
        !(Number.isFinite(target) && target > 0 && (target - fill) * sig.dir > 0)))
      return { ok: false, reason: 'Target is invalid or already crossed by the executable entry price' };
    const exit = sig.sl * (1 - sig.dir * R.slippagePct / 100);
    const stopDist = (fill - sig.sl) * sig.dir;
    const fee = this.commissionFrac(sig.sym, R);
    const lossPerUnit = (fill - exit) * sig.dir + (fill + exit) * fee;
    if (![fill, exit, stopDist, lossPerUnit].every(v => Number.isFinite(v) && v > 0))
      return { ok: false, reason: 'Position loss at the executable stop could not be calculated' };
    const riskLimit = equity * R.riskPct / 100;
    const funds = this.funds(ledger, R);
    const notionalLimit = funds.free;
    if (!Number.isFinite(notionalLimit) || notionalLimit <= 0)
      return { ok: false, reason: 'No uncommitted position-value budget remains in this account' };
    const spec = typeof Feed !== 'undefined' ? Feed.specFor(sig.sym) : null;
    const broker = typeof Feed !== 'undefined' && (Feed.bridgeHas(sig.sym) ||
      (typeof BROKER !== 'undefined' && BROKER.is(sig.sym)));
    if (broker && !spec)
      return { ok: false, reason: 'Broker specifications are missing for ' + baseAsset(sig.sym) + ' — waiting for /specs' };
    let contract = 1;
    if (spec){
      if (!['tickSize', 'tickValue', 'contractSize', 'volumeMin', 'volumeStep', 'volumeMax']
          .every(k => Number.isFinite(spec[k]) && spec[k] > 0) || spec.volumeMax < spec.volumeMin)
        return { ok: false, reason: 'Broker specifications are incomplete or invalid for ' + baseAsset(sig.sym) };
      contract = spec.contractSize;
      // This ledger expresses P&L as price change times units. Refuse a contract
      // needing currency conversion rather than mixing quote cash with account cash.
      const cashPerPoint = spec.tickValue / spec.tickSize;
      if (Math.abs(cashPerPoint / contract - 1) > 0.000001)
        return { ok: false, reason: 'This contract needs account-currency conversion; paper sizing cannot safely value ' + baseAsset(sig.sym) };
    }
    let qty = Math.min(riskLimit / lossPerUnit, notionalLimit / fill);
    if (sig.requestedQty != null){
      if (!(Number.isFinite(sig.requestedQty) && sig.requestedQty > 0))
        return { ok: false, reason: 'Requested size must be finite and positive' };
      if (sig.requestedQty * lossPerUnit > riskLimit + 1e-8)
        return { ok: false, reason: 'Requested size exceeds the ' + R.riskPct + '% risk limit' };
      if (sig.requestedQty * fill > notionalLimit + 1e-8)
        return { ok: false, reason: 'Requested size exceeds the remaining position-value budget of ' + fmtNum(notionalLimit) };
      qty = sig.requestedQty;
    }
    let lots;
    if (spec){
      if (sig.requestedQty != null && qty / contract > spec.volumeMax + 1e-10)
        return { ok: false, reason: 'Requested lots exceed the broker maximum of ' + spec.volumeMax };
      lots = this.floorLots(Math.min(qty / contract, spec.volumeMax), spec.volumeStep);
      if (lots < spec.volumeMin - 1e-10)
        return { ok: false, reason: 'Smallest broker size (' + spec.volumeMin + ' lot) exceeds the risk or position-value budget' };
      qty = lots * contract;
    }
    if (!(Number.isFinite(qty) && qty > 0)) return { ok: false, reason: 'Position size could not be calculated' };
    return { ok: true, qty, lots, riskCash: qty * lossPerUnit, stopDist, spread, R, spec,
      fill, notional: qty * fill, riskLimit, notionalLimit };
  },

  floorLots(lots, step){
    // Correct floating-point noise at exact step boundaries, never round up a lot.
    return +(Math.floor(lots / step + 1e-10) * step).toFixed(10);
  },

  shrink(gate, multiplier){
    if (!(Number.isFinite(multiplier) && multiplier > 0 && multiplier <= 1))
      return { ok: false, reason: 'Invalid size reduction' };
    let qty = gate.qty * multiplier, lots = gate.lots;
    if (gate.spec){
      lots = this.floorLots(lots * multiplier, gate.spec.volumeStep);
      if (lots < gate.spec.volumeMin - 1e-10)
        return { ok: false, reason: 'Reduced size is below the broker minimum' };
      qty = lots * gate.spec.contractSize;
    }
    return Object.assign({}, gate, { qty, lots, riskCash: gate.riskCash * qty / gate.qty,
      notional: gate.notional * qty / gate.qty });
  },

  partialFill(ledger, cfg, pos, fraction, price){
    if (!ledger.open.includes(pos) || !(fraction > 0 && fraction < 1) || !Number.isFinite(price) || price <= 0)
      return { ok: false, reason: 'Invalid partial exit' };
    if (!this.replays.has(ledger) && !Feed.isLive(pos.sym))
      return { ok: false, reason: 'No fresh live price for a partial exit' };
    const spec = Feed.specFor(pos.sym);
    let qty = pos.qty * fraction, remainingLots = null;
    if (spec){
      if (!['contractSize', 'volumeMin', 'volumeStep', 'volumeMax'].every(k => Number.isFinite(spec[k]) && spec[k] > 0))
        return { ok: false, reason: 'Broker volume specifications are invalid' };
      const lots = this.floorLots(Math.min(qty / spec.contractSize, spec.volumeMax), spec.volumeStep);
      remainingLots = +(pos.qty / spec.contractSize - lots).toFixed(10);
      if (lots < spec.volumeMin || remainingLots < spec.volumeMin ||
          Math.abs(remainingLots - this.floorLots(remainingLots, spec.volumeStep)) > 1e-9)
        return { ok: false, reason: 'This position cannot be split into two valid broker volumes' };
      qty = lots * spec.contractSize;
    } else if (Feed.bridgeHas(pos.sym) || (typeof BROKER !== 'undefined' && BROKER.is(pos.sym))){
      return { ok: false, reason: 'Broker specifications are required for a partial exit' };
    }
    const R = this.rules(cfg);
    const fill = price * (1 - pos.dir * R.slippagePct / 100);
    const fee = qty * fill * this.commissionFrac(pos.sym, R);
    const pnl = (fill - pos.entry) * pos.dir * qty - fee;
    pos.qty -= qty;
    if (remainingLots != null) pos.lots = remainingLots;
    pos.fees += fee;
    pos.partialPnl = (pos.partialPnl || 0) + pnl;
    ledger.equity += pnl;
    return { ok: true, qty, price: fill, pnl };
  },
  partialWarnings: new WeakSet(),

  /* ---------- open a virtual position ----------
     Costs are modelled the way an exchange charges them: you pay the spread on
     entry, slippage against you, and commission on both sides. */
  open(ledger, cfg, sig, quote, gate){
    if (!gate || !gate.ok) return null;
    // Approval is checked again immediately before mutation: callers cannot
    // reuse an old approval or replace its quantity after passing the gates.
    gate = this.check(ledger, cfg, Object.assign({}, sig, { requestedQty: gate.qty }), quote);
    if (!gate.ok){ this.note(ledger, 'reject', gate.reason, { sym: sig.sym }); return null; }
    const R = gate.R;
    const dir = sig.dir;                                   // 1 long, -1 short
    const slipped = quote.price * (1 + dir * R.slippagePct / 100);
    const fill = slipped + dir * (gate.spread / 2);        // buy at ask, sell at bid
    const notional = gate.qty * fill;
    const feeIn = notional * this.commissionFrac(sig.sym, R);

    const pos = {
      id: ledger.seq++,
      sym: sig.sym, tf: sig.tf, dir,
      qty: gate.qty, lots: gate.lots || null, entry: fill, entryTime: this.now(ledger, cfg),
      sl: sig.sl, tp: sig.tp, tp1: sig.tp1 || null, tp1Done: false, beMoved: false,
      score: sig.score, reasons: sig.reasons || [], model: sig.model || '',
      feeIn, fees: feeIn, slippage: Math.abs(fill - quote.price) * gate.qty,
      riskCash: gate.riskCash, stopDist: gate.stopDist, slInit: sig.sl, peak: null, trailed: false,
      mfe: 0, mae: 0, note: sig.note || '',
      barsHeld: 0, timeLimitBars: cfg.timeLimitBars || R.timeLimitBars,
      factors: sig.factors || {}, meta: sig.meta || {}, state: sig.state || null,
    };
    ledger.open.push(pos);
    ledger.equity -= feeIn;
    this.note(ledger, 'entry',
      (dir > 0 ? 'BUY ' : 'SELL ') + baseAsset(sig.sym) + ' ' + sig.tf + ' @ ' + fmtPrice(fill) +
      ' · stop ' + fmtPrice(sig.sl) + ' · target ' + (sig.tp ? fmtPrice(sig.tp) : 'none') +
      ' · size ' + (gate.lots ? gate.lots + ' lot' : (+gate.qty.toPrecision(4))) +
      ' · risk ' + fmtNum(gate.riskCash),
      { sym: sig.sym, tf: sig.tf, score: sig.score, reasons: sig.reasons });
    this.mark(ledger, this.now(ledger, cfg));
    return pos;
  },

  /* ---------- update open positions against a candle ----------
     Conservative rule: if a candle's range covers both the stop and the target,
     the stop is assumed to have been hit first. Never flatter than reality. */
  step(ledger, cfg, pos, candle, quote){
    const R = Object.assign({}, this.RISK, cfg.risk || {});
    if (!this.replays.has(ledger) && (typeof Feed === 'undefined' || !Feed.isLive(pos.sym))) return null;
    const dir = pos.dir;
    const hi = candle ? candle.high : quote.price;
    const lo = candle ? candle.low : quote.price;
    const px = quote ? quote.price : candle.close;
    if (candle) pos.barsHeld++;
    else {
      const tf = /^(\d+)(s|m|h|d|w)$/.exec(pos.tf || '');
      const barMs = tf ? +tf[1] * ({ s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[tf[2]]) * 1000 : 0;
      if (barMs) pos.barsHeld = Math.floor((this.now(ledger, cfg) - pos.entryTime) / barMs);
    }

    const favour = dir > 0 ? (hi - pos.entry) : (pos.entry - lo);
    const against = dir > 0 ? (pos.entry - lo) : (hi - pos.entry);
    pos.mfe = Math.max(pos.mfe, favour * pos.qty);
    pos.mae = Math.max(pos.mae, against * pos.qty);
    pos.last = px;
    pos.unreal = (px - pos.entry) * dir * pos.qty - pos.fees;

    const hitStop = dir > 0 ? lo <= pos.sl : hi >= pos.sl;
    /* a position may deliberately run with no target. Without this guard
       `hi >= null` reads as `hi >= 0` and closes it on the very next tick. */
    const hitTp   = pos.tp ? (dir > 0 ? hi >= pos.tp : lo <= pos.tp) : false;
    const hitTp1  = pos.tp1 && !pos.tp1Done && (dir > 0 ? hi >= pos.tp1 : lo <= pos.tp1);

    if (hitStop) return this.close(ledger, cfg, pos, pos.sl,
      pos.trailed ? 'trailing stop' : pos.beMoved ? 'stop at breakeven' : 'stop-loss');

    /* ---- ratchet trailing stop (opt-in via cfg.trail) ----
       Expressed in R, not in percent, so it means the same thing on gold as on
       oil. Once the trade is `start` R in front, the stop follows the best price
       reached, staying `gap` R behind it, and only ever moves in your favour.

       The trade-off is real and worth stating: a trail converts a high win rate
       into a lower one with bigger winners. Most trades give a little back at
       the end; the occasional runner pays for them. */
    /* A trail can now be set on ONE position from the Open Trades page, which
       overrides whatever the bot itself does: pos.trail = {start, gap} switches
       it on for this trade alone, pos.trail = null switches a bot-level trail
       off for this trade alone, and leaving it undefined inherits the bot. */
    const trail = (pos.trail !== undefined) ? pos.trail : cfg.trail;
    if (trail && pos.riskCash > 0){
      const R1 = pos.stopDist || Math.abs(pos.entry - pos.slInit || pos.sl);
      if (R1 > 0){
        const best = dir > 0 ? hi : lo;
        pos.peak = pos.peak == null ? best : (dir > 0 ? Math.max(pos.peak, best) : Math.min(pos.peak, best));
        const gainR = (pos.peak - pos.entry) * dir / R1;
        const startR = trail.start != null ? trail.start : 1;
        const gapR = trail.gap != null ? trail.gap : 0.5;
        if (gainR >= startR){
          const want = pos.peak - dir * gapR * R1;
          /* never widen a stop, only tighten it */
          if (dir > 0 ? want > pos.sl : want < pos.sl){
            pos.sl = want;
            pos.trailed = true;
            pos.beMoved = true;
          }
        }
      }
    }
    if (hitTp1){
      /* bank half at 1R and protect the rest */
      const part = this.partialFill(ledger, cfg, pos, 0.5, pos.tp1);
      if (part.ok){
        pos.tp1Done = true;
        pos.beMoved = true;
        pos.sl = dir > 0 ? Math.max(pos.sl, pos.entry) : Math.min(pos.sl, pos.entry);
        this.note(ledger, 'partial',
          'Partial target on ' + baseAsset(pos.sym) + ' (' + fmtPrice(part.price) + '), stop protected · ' + fmtNum(part.pnl),
          { sym: pos.sym });
        this.mark(ledger, this.now(ledger, cfg));
      } else if (!this.partialWarnings.has(pos)){
        this.partialWarnings.add(pos);
        this.note(ledger, 'reject', part.reason, { sym: pos.sym });
      }
      // A candle spanning both targets must also close the remaining position.
    }
    if (hitTp) return this.close(ledger, cfg, pos, pos.tp, 'target reached');
    if (pos.barsHeld >= pos.timeLimitBars) return this.close(ledger, cfg, pos, px, 'time limit');
    return null;
  },

  close(ledger, cfg, pos, price, reason){
    if (!ledger.open.includes(pos) || !(Number.isFinite(price) && price > 0)) return null;
    if (!this.replays.has(ledger) && (typeof Feed === 'undefined' || !Feed.isLive(pos.sym))) return null;
    const R = Object.assign({}, this.RISK, cfg.risk || {});
    const dir = pos.dir;
    const slipped = price * (1 - dir * R.slippagePct / 100);
    const feeOut = pos.qty * slipped * this.commissionFrac(pos.sym, R);
    const pnl = (slipped - pos.entry) * dir * pos.qty - feeOut + (pos.partialPnl || 0);
    const fees = pos.fees + feeOut;

    ledger.equity += (slipped - pos.entry) * dir * pos.qty - feeOut;
    ledger.open = ledger.open.filter(p => p.id !== pos.id);

    const rec = {
      id: pos.id, sym: pos.sym, tf: pos.tf, dir, model: pos.model,
      qty: pos.qty, lots: pos.lots || null, entry: pos.entry, exit: slipped,
      entryTime: pos.entryTime, exitTime: this.now(ledger, cfg),
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      sl: pos.sl, tp: pos.tp, fees: +fees.toFixed(4), slippage: +(pos.slippage || 0).toFixed(4),
      /* a trade whose levels were moved by hand is marked, so a bot's measured
         record never silently includes trades the strategy did not run itself */
      touched: !!pos.touched, edits: pos.edits ? pos.edits.length : 0,
      pnl: +pnl.toFixed(4), r: pos.riskCash ? +(pnl / pos.riskCash).toFixed(2) : 0,
      mfe: +pos.mfe.toFixed(4), mae: +pos.mae.toFixed(4),
      reason, reasons: pos.reasons, score: pos.score, note: pos.note,
      barsHeld: pos.barsHeld, factors: pos.factors, meta: pos.meta || {}, state: pos.state || null,
    };
    ledger.closed.unshift(rec);

    const dk = this.dayKey(this.now(ledger, cfg));
    const d = ledger.daily[dk] = ledger.daily[dk] || { pnl: 0, wins: 0, losses: 0, fees: 0 };
    d.pnl += rec.pnl; d.fees += rec.fees;
    pnl >= 0 ? d.wins++ : d.losses++;

    this.learn(ledger, rec);
    if (typeof MasterBrain !== 'undefined' && !cfg.noLearn){
      try {
        MasterBrain.addSample(
          { sym: rec.sym, tf: rec.tf, dir, entry: pos.entry, sl: pos.sl, tp: pos.tp,
            score: pos.score, model: pos.model, factors: pos.factors, meta: pos.meta, state: pos.state },
          cfg, { time: pos.entryTime, live: true, state: pos.state },
          { r: rec.r, t: pos.entryTime, src: 'paper' });
        MasterBrain.save();
      } catch(e){}
    }
    this.note(ledger, pnl >= 0 ? 'win' : 'loss',
      'Closed ' + baseAsset(pos.sym) + ' ' + (dir > 0 ? 'long' : 'short') + ' at ' + fmtPrice(slipped) +
      ' — ' + reason + ' · ' + (pnl >= 0 ? '+' : '') + fmtNum(pnl) + ' (' + rec.r + 'R) after ' + fmtNum(fees) + ' costs',
      { sym: pos.sym, tf: pos.tf });
    this.mark(ledger, this.now(ledger, cfg));
    return rec;
  },

  /* ---------- explainable paper-learning overlay ----------
     Records how each contributing factor performed. It only ever nudges the
     *ranking* of optional evidence and needs a real sample first. It can never
     bypass a mandatory gate, never increase risk, and never touches live
     behaviour (there is none). */
  MIN_SAMPLE: 12,
  learn(ledger, rec){
    for (const [k, on] of Object.entries(rec.factors || {})){
      if (!on) continue;
      const f = ledger.factors[k] = ledger.factors[k] || { n: 0, wins: 0, r: 0, weight: 1 };
      f.n++; f.r += rec.r;
      if (rec.pnl > 0) f.wins++;
      if (f.n >= this.MIN_SAMPLE){
        const winRate = f.wins / f.n;
        const target = winRate < 0.35 ? 0.85 : winRate > 0.6 ? 1.1 : 1;
        f.weight = Math.max(0.7, Math.min(1.15, f.weight * 0.9 + target * 0.1));
      }
    }
    if (rec.pnl < 0){
      const worst = Object.entries(ledger.factors)
        .filter(([, f]) => f.n >= this.MIN_SAMPLE)
        .sort((a, b) => (a[1].wins / a[1].n) - (b[1].wins / b[1].n))[0];
      ledger.lessons.unshift({
        t: Date.now(), sym: rec.sym, tf: rec.tf, r: rec.r, reason: rec.reason,
        text: 'Lost ' + fmtNum(Math.abs(rec.pnl)) + ' on ' + baseAsset(rec.sym) + ' (' + rec.reason + '). ' +
          (worst
            ? 'Weakest evidence so far: ' + worst[0] + ' (' + Math.round(worst[1].wins / worst[1].n * 100) + '% over ' + worst[1].n + ' trades) — its weight is now ' + worst[1].weight.toFixed(2) + '.'
            : 'Not enough completed trades yet to change any weighting (needs ' + this.MIN_SAMPLE + ' per factor).'),
      });
    }
  },

  mark(ledger, now = Date.now()){
    const eq = this.equityNow(ledger);
    const last = ledger.equityCurve[ledger.equityCurve.length - 1];
    if (!last || Math.abs(eq - last.eq) > 0.004 || now - last.t > 120000)
      ledger.equityCurve.push({ t: now, eq: +eq.toFixed(2) });
  },

  equityNow(ledger){
    let eq = ledger.equity;
    // Entry and partial-exit fees already left the cash balance. Adding the
    // displayed net P&L would charge those fees a second time and could retain
    // the old full quantity after a partial exit until the next price tick.
    for (const p of ledger.open) eq += ((p.last ?? p.entry) - p.entry) * p.dir * p.qty;
    return eq;
  },

  /* ---------- reporting ---------- */
  stats(ledger){
    const c = ledger.closed;
    const wins = c.filter(x => x.pnl > 0), losses = c.filter(x => x.pnl <= 0);
    const gw = wins.reduce((a, x) => a + x.pnl, 0);
    const gl = Math.abs(losses.reduce((a, x) => a + x.pnl, 0));
    let peak = -Infinity, dd = 0;
    for (const e of ledger.equityCurve){ peak = Math.max(peak, e.eq); dd = Math.max(dd, (peak - e.eq) / (peak || 1) * 100); }
    const eq = this.equityNow(ledger);
    return {
      equity: eq,
      pnl: eq - ledger.startEquity,
      pnlPct: (eq - ledger.startEquity) / ledger.startEquity * 100,
      trades: c.length,
      winRate: c.length ? wins.length / c.length * 100 : 0,
      profitFactor: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      avgR: c.length ? c.reduce((a, x) => a + x.r, 0) / c.length : 0,
      fees: c.reduce((a, x) => a + x.fees, 0),
      winAmount: gw, lossAmount: gl,
      winPctOfStart: gw / ledger.startEquity * 100,
      lossPctOfStart: gl / ledger.startEquity * 100,
      maxDD: dd,
      best: c.reduce((a, x) => (!a || x.pnl > a.pnl) ? x : a, null),
      worst: c.reduce((a, x) => (!a || x.pnl < a.pnl) ? x : a, null),
      openCount: ledger.open.length,
    };
  },

  reset(id){
    const fresh = this.blank(id);
    this.save(id, fresh);
    return fresh;
  },
};
