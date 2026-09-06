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
    maxOpen: 3,               // open positions per bot
    maxPerSymbol: 1,          // positions in the same instrument
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
    lsSet('astra_bot_' + id, ledger);
  },

  dayKey(ts){ return new Date(ts || Date.now()).toISOString().slice(0, 10); },

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
    const R = Object.assign({}, this.RISK, cfg.risk || {});
    /* In a backtest "now" is the time of the bar being replayed, not the real
       clock. Without this the daily-loss lock was set to tonight's real midnight
       and never expired, so the first bad day silently locked out the entire
       remainder of every backtest. */
    const now = cfg.nowTs || Date.now();

    if (ledger.equity < R.minEquity)
      return { ok: false, reason: 'Equity ' + fmtNum(ledger.equity) + ' is below the minimum of ' + R.minEquity };

    if (ledger.lockedUntil > now)
      return { ok: false, reason: 'Daily loss limit reached — locked until ' + new Date(ledger.lockedUntil).toLocaleTimeString() };

    const day = ledger.daily[this.dayKey(now)] || { pnl: 0 };
    if (day.pnl < -(ledger.startEquity * R.maxDailyLossPct / 100)){
      const midnight = new Date(now); midnight.setHours(24, 0, 0, 0);
      ledger.lockedUntil = midnight.getTime();
      return { ok: false, reason: 'Daily loss limit of ' + R.maxDailyLossPct + '% hit — no more entries today' };
    }

    if (ledger.open.length >= R.maxOpen)
      return { ok: false, reason: 'Already holding the maximum of ' + R.maxOpen + ' open positions' };

    if (ledger.open.filter(p => p.sym === sig.sym).length >= R.maxPerSymbol)
      return { ok: false, reason: 'Already in ' + baseAsset(sig.sym) + ' (limit ' + R.maxPerSymbol + ' per instrument)' };

    if (!quote || !(quote.price > 0))
      return { ok: false, reason: 'No usable price for ' + baseAsset(sig.sym) };

    if (quote.ageSec != null && quote.ageSec > R.staleQuoteSec)
      return { ok: false, reason: 'Quote is stale (' + Math.round(quote.ageSec) + 's old, limit ' + R.staleQuoteSec + 's)' };

    /* Live-only. A delayed price is not a price you can be filled at, so in this
       mode an instrument that is not on a real-time feed is refused outright
       rather than merely flagged. This is the last gate before sizing. */
    if (typeof Feed !== 'undefined' && Feed.liveOnly && !cfg.allowDelayed){
      const t = Feed.tradable(sig.sym);
      if (!t.ok) return { ok: false, reason: t.why };
    }

    if (!sig.sl || !(Math.abs(sig.entry - sig.sl) > 0))
      return { ok: false, reason: 'No stop-loss — an entry without a stop is never allowed' };

    const spread = quote.spread != null ? quote.spread : quote.price * 0.0002;
    const spreadPct = spread / quote.price * 100;
    /* A hand-placed trade is a decision already taken, so it gets a wider
       absolute ceiling. The 0.10% limit is meant for tight majors and was
       refusing EVERY manual entry on platinum, whose normal spread is 0.11%.
       The PROPORTIONAL test below still applies to everyone, and it is the one
       that matters: the spread against the distance to the stop, not the price. */
    const spreadCap = sig.manual ? (R.maxSpreadManualPct || 1.5) : R.maxSpreadPct;
    if (spreadPct > spreadCap)
      return { ok: false, reason: 'Spread ' + spreadPct.toFixed(3) + '% is above the limit of ' + spreadCap + '%' };

    const stopDist = Math.abs(sig.entry - sig.sl);
    if (spread / stopDist * 100 > R.maxSpreadAtrPct)
      return { ok: false, reason: 'Spread is ' + (spread / stopDist * 100).toFixed(0) +
        '% of the stop distance (limit ' + R.maxSpreadAtrPct + '%) — the stop needs to be at least ' +
        fmtPrice(spread * 100 / R.maxSpreadAtrPct) + ' away, or leave it empty and one will be placed for you' };

    const riskCash = ledger.equity * R.riskPct / 100;

    /* ---- size in real lots when the broker's contract specs are known ----
       Rounding down to the lot step and honouring the minimum is what makes a
       paper result reproducible on the live account. If even the smallest
       permitted trade risks more than allowed, the honest answer is to refuse
       rather than pretend a fractional position was opened. */
    const spec = (typeof Feed !== 'undefined' && Feed.specFor) ? Feed.specFor(sig.sym) : null;
    if (spec && spec.tickSize > 0 && spec.tickValue > 0){
      const riskPerLot = (stopDist / spec.tickSize) * spec.tickValue;
      if (!(riskPerLot > 0)) return { ok: false, reason: 'Contract value could not be resolved for ' + baseAsset(sig.sym) };
      const step = spec.volumeStep || 0.01;
      const raw = riskCash / riskPerLot;
      const lots = Math.floor(raw / step) * step;
      const minLot = spec.volumeMin || step;
      if (lots < minLot){
        const minRisk = minLot * riskPerLot;
        return { ok: false, reason:
          'Smallest tradable size (' + minLot + ' lot) would risk ' + fmtNum(minRisk) +
          ' = ' + (minRisk / ledger.equity * 100).toFixed(2) + '% of equity, above the ' +
          R.riskPct + '% limit. Raise the risk limit, or trade an instrument with a smaller contract.' };
      }
      const capped = Math.min(lots, spec.volumeMax || lots);
      return { ok: true, qty: capped * (spec.contractSize || 1), lots: capped,
               riskCash: capped * riskPerLot, stopDist, spread, R, spec };
    }

    const qty = riskCash / stopDist;
    if (!(qty > 0) || !isFinite(qty))
      return { ok: false, reason: 'Position size could not be calculated' };

    return { ok: true, qty, riskCash, stopDist, spread, R };
  },

  /* ---------- open a virtual position ----------
     Costs are modelled the way an exchange charges them: you pay the spread on
     entry, slippage against you, and commission on both sides. */
  open(ledger, cfg, sig, quote, gate){
    const R = gate.R;
    const dir = sig.dir;                                   // 1 long, -1 short
    const slipped = quote.price * (1 + dir * R.slippagePct / 100);
    const fill = slipped + dir * (gate.spread / 2);        // buy at ask, sell at bid
    const notional = gate.qty * fill;
    const feeIn = notional * this.commissionFrac(sig.sym, R);

    const pos = {
      id: ledger.seq++,
      sym: sig.sym, tf: sig.tf, dir,
      qty: gate.qty, lots: gate.lots || null, entry: fill, entryTime: Date.now(),
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
    this.mark(ledger);
    return pos;
  },

  /* ---------- update open positions against a candle ----------
     Conservative rule: if a candle's range covers both the stop and the target,
     the stop is assumed to have been hit first. Never flatter than reality. */
  step(ledger, cfg, pos, candle, quote){
    const R = Object.assign({}, this.RISK, cfg.risk || {});
    const dir = pos.dir;
    const hi = candle ? candle.high : quote.price;
    const lo = candle ? candle.low : quote.price;
    const px = quote ? quote.price : candle.close;
    pos.barsHeld++;

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
      const half = pos.qty / 2;
      const feeOut = half * pos.tp1 * this.commissionFrac(pos.sym, R);
      const pnl = (pos.tp1 - pos.entry) * dir * half - feeOut;
      pos.qty -= half;
      pos.fees += feeOut;
      pos.tp1Done = true;
      pos.beMoved = true;
      pos.sl = pos.entry;
      pos.partialPnl = (pos.partialPnl || 0) + pnl;
      ledger.equity += pnl;
      this.note(ledger, 'partial',
        'Took half off ' + baseAsset(pos.sym) + ' at 1R (' + fmtPrice(pos.tp1) + '), stop moved to breakeven · +' + fmtNum(pnl),
        { sym: pos.sym });
      this.mark(ledger);
      return null;
    }
    if (hitTp) return this.close(ledger, cfg, pos, pos.tp, 'target reached');
    if (pos.barsHeld >= pos.timeLimitBars) return this.close(ledger, cfg, pos, px, 'time limit');
    return null;
  },

  close(ledger, cfg, pos, price, reason){
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
      entryTime: pos.entryTime, exitTime: Date.now(),
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

    const dk = this.dayKey(cfg.nowTs || Date.now());
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
    this.mark(ledger);
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

  mark(ledger){
    const eq = this.equityNow(ledger);
    const last = ledger.equityCurve[ledger.equityCurve.length - 1];
    if (!last || Math.abs(eq - last.eq) > 0.004 || Date.now() - last.t > 120000)
      ledger.equityCurve.push({ t: Date.now(), eq: +eq.toFixed(2) });
  },

  equityNow(ledger){
    let eq = ledger.equity;
    for (const p of ledger.open) if (p.unreal != null) eq += p.unreal;
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
