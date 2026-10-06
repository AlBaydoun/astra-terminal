/* ASTRA Terminal — one-time correction of the paper trade history (2026-10-04).

   Two faults were found in the recorded trades, both arithmetic, both proven
   against MetaTrader's own figures:

   1. CURRENCY. A contract priced in another currency was booked as if its
      profit were in the account's dollars:
        USD/JPY            profit is in YEN   -> 1 yen = 1/price dollars
        DE40 / EU50 / FR40 profit is in EUR   -> 1 point = 1.13 USD
        AU200              profit is in AUD   -> 1 point = 0.70 USD
        UK100              profit is in GBP   -> 1 point = 1.32 USD
      (MetaTrader's order_calc_profit through the read-only bridge, 2026-10-04.)
      The engine now converts these at entry (engine.js), so new trades are right.

   2. COMMISSION. Trades of 1–4 September were charged 0.05–0.3 % a side.
      This account charges no commission (broker.js: 0 for every class; the
      cost is in the spread, which is already in the fill prices), and the
      engine has charged none since. The old charge is taken back out.

   Arithmetic only: entry and exit prices are never touched. Each corrected
   trade keeps its old figures in t.fix so every number can be traced. The
   ledgers' equity, equity curve and day totals move by exactly the change of
   each trade; the factor weights are relearned from the corrected trades; the
   "lessons" and the Master Brain examples of those trades are put right.

   A copy of everything changed is written to astra_histfix_backup first, and
   HistoryFix.undo() puts it all back. */
const HistoryFix = {
  KEY_DONE: 'astra_histfix_done',
  KEY_BACKUP: 'astra_histfix_backup',
  KEY_REPORT: 'astra_histfix_report',

  /* account-currency value of one unit of the instrument's profit currency */
  RATES: { EUR: 1.13, AUD: 0.70, GBP: 1.32 },
  currencyOf(sym){
    const s = String(sym || '').toUpperCase();
    if (/^(DE40|GER40|EU50|STOXX50|FR40|FRA40)/.test(s)) return 'EUR';
    if (/^(AU200|AUS200)/.test(s)) return 'AUD';
    if (/^(UK100)/.test(s)) return 'GBP';
    if (/^USDJPY/.test(s)) return 'JPY';
    return null;
  },
  rateFor(t, cur){
    if (cur === 'JPY') return t.exit > 0 ? 1 / t.exit : (t.entry > 0 ? 1 / t.entry : null);
    return this.RATES[cur] || null;
  },

  ledgerKeys(){
    const out = [];
    for (let i = 0; i < localStorage.length; i++){
      const k = localStorage.key(i);
      if (k && k.indexOf('astra_bot_') === 0) out.push(k);
    }
    return out.sort();
  },

  /* what the account charges per side today (0 on this account) */
  fracNow(sym){
    try { return BotEngine.commissionFrac(sym, BotEngine.RISK); } catch(e){ return 0; }
  },

  /* correct ONE closed trade in place; returns {dPnl, dEquity, dFees} or null */
  fixTrade(t){
    if (!t || t.fix) return null;
    const hasFx = !!(t.meta && t.meta.accountFx);
    const cur = hasFx ? null : this.currencyOf(t.sym);
    const rate = cur ? this.rateFor(t, cur) : null;
    const nowFrac = this.fracNow(t.sym);
    const oldFees = +t.fees || 0;
    const qty = Math.abs(+t.qty || 0);
    /* commission that this account would not have charged */
    const feeFix = oldFees > 0.0001 && nowFrac === 0 && qty > 0 && t.entry > 0 && t.exit > 0;
    if (!rate && !feeFix) return null;

    const old = { pnl: t.pnl, fees: t.fees, r: t.r, mfe: t.mfe, mae: t.mae, slippage: t.slippage };
    /* the entry fee came off equity when the trade opened, the exit fee is inside pnl */
    let feeIn = 0, feeOut = 0;
    if (feeFix){
      const perSide = oldFees / (qty * (t.entry + t.exit));
      feeIn = qty * t.entry * perSide; feeOut = oldFees - feeIn;
    }
    let pnl = (+t.pnl || 0) + feeOut;               // in the instrument's own money
    let r = t.r;
    if (feeFix && !rate && Number.isFinite(t.r) && Math.abs(t.r) > 0.005 && t.pnl){
      const riskCash = t.pnl / t.r;                  // the risk staked, recovered as repriceFees does
      if (Number.isFinite(riskCash) && riskCash !== 0) r = +(pnl / riskCash).toFixed(2);
    }
    if (rate){
      pnl *= rate;
      /* the risk at entry was sized as if 1 unit were 1 dollar, so the old R is
         meaningless: measure it from the prices, against the stop */
      const stopDist = Math.abs(t.entry - (t.slInit || t.sl || 0));
      if (stopDist > 0 && t.sl > 0) r = +(((t.exit - t.entry) * t.dir) / stopDist).toFixed(2);
      for (const k of ['mfe', 'mae', 'slippage']) if (Number.isFinite(+t[k])) t[k] = +(t[k] * rate).toFixed(4);
      t.meta = Object.assign({}, t.meta || {}, { accountFx: { profit: rate, loss: rate, currency: 'USD', from: cur, via: 'history fix 2026-10-04' } });
    }
    t.pnl = +pnl.toFixed(4);
    t.fees = feeFix ? 0 : +(oldFees * (rate || 1)).toFixed(4);
    if (r !== undefined) t.r = r;
    t.fix = { at: '2026-10-04', currency: cur ? cur + ' → USD at ' + (+rate.toPrecision(4)) : null,
              commission: feeFix ? +oldFees.toFixed(4) : null, old };
    const dPnl = t.pnl - (+old.pnl || 0);
    return { dPnl, feeIn, dFees: t.fees - oldFees, cur, feeFix };
  },

  /* an open position in another currency gets its conversion, so its running
     P/L, its stop risk and its eventual close are valued in dollars */
  fixOpen(p){
    if (!p || (p.meta && p.meta.accountFx)) return false;
    const cur = this.currencyOf(p.sym); if (!cur) return false;
    const rate = cur === 'JPY' ? (p.entry > 0 ? 1 / p.entry : null) : this.RATES[cur];
    if (!rate) return false;
    p.meta = Object.assign({}, p.meta || {}, { accountFx: { profit: rate, loss: rate, currency: 'USD', from: cur, via: 'history fix 2026-10-04' } });
    for (const k of ['riskCash', 'mfe', 'mae', 'slippage', 'unreal']) if (Number.isFinite(+p[k])) p[k] = +(p[k] * rate).toFixed(4);
    return true;
  },

  /* the factor weights, learned again from the corrected trades in time order */
  relearn(L){
    const f = {};
    const chron = (L.closed || []).slice().sort((a, b) => a.exitTime - b.exitTime);
    for (const rec of chron){
      for (const [k, on] of Object.entries(rec.factors || {})){
        if (!on) continue;
        const x = f[k] = f[k] || { n: 0, wins: 0, r: 0, weight: 1 };
        x.n++; x.r += rec.r || 0; if (rec.pnl > 0) x.wins++;
        if (x.n >= BotEngine.MIN_SAMPLE){
          const wr = x.wins / x.n, target = wr < 0.35 ? 0.85 : wr > 0.6 ? 1.1 : 1;
          x.weight = Math.max(0.7, Math.min(1.15, x.weight * 0.9 + target * 0.1));
        }
      }
    }
    L.factors = f;
  },

  run(opts){
    const dry = !!(opts && opts.dryRun);
    const report = { at: Date.now(), bots: [], trades: 0, currencyTrades: 0, commissionTrades: 0, openFixed: 0,
                     netBefore: 0, netAfter: 0, brainSamples: 0 };
    const backup = {}, writes = {};
    const fixedTrades = [];                          // {sym, entryTime, r, pnl}
    for (const key of this.ledgerKeys()){
      let L; try { L = JSON.parse(localStorage.getItem(key)); } catch(e){ continue; }
      if (!L || !Array.isArray(L.closed) || !Number.isFinite(+L.startEquity)) continue;
      const copy = JSON.parse(JSON.stringify(L));
      const changes = [];
      for (const t of L.closed){
        const before = +t.pnl || 0;
        const c = this.fixTrade(t);
        if (!c) continue;
        changes.push({ t, c, before });
      }
      let openFixed = 0; const openOld = [];
      for (const p of (L.open || [])){
        const was = { id: p.id, riskCash: p.riskCash, mfe: p.mfe, mae: p.mae, slippage: p.slippage, unreal: p.unreal };
        if (this.fixOpen(p)){ openFixed++; openOld.push(was); }
      }
      const lessonsRemoved = [], lessonsChanged = [];
      if (!changes.length && !openFixed) continue;

      const netBefore = copy.closed.reduce((a, t) => a + (+t.pnl || 0), 0);
      /* EQUITY. On every ledger the old commission never touched, equity is exactly
         start + the sum of the closed trades - open fees + banked partial exits
         (checked on all of them, to the cent). So a ledger whose whole history is
         still listed is rebuilt to that sum. Some ledgers had the old ENTRY fee
         taken off equity and some did not; the rebuild settles both the same way.
         A ledger whose list was trimmed (500 trades kept) only moves by the change. */
      const sumNew = L.closed.reduce((a, t) => a + (+t.pnl || 0), 0);
      const openFees = (L.open || []).reduce((a, p) => a + (+p.fees || 0), 0);
      const openPart = (L.open || []).reduce((a, p) => a + (+p.partialPnl || 0), 0);
      const dPnlAll = changes.reduce((a, x) => a + x.c.dPnl, 0);
      const complete = L.closed.length < 500;
      const target = complete ? (+L.startEquity) + sumNew - openFees + openPart : (+L.equity || 0) + dPnlAll;
      const extra = target - ((+L.equity || 0) + dPnlAll);          // the old entry fees that had come off equity
      const feeInAll = changes.reduce((a, x) => a + x.c.feeIn, 0);
      const share = feeInAll > 0 ? extra / feeInAll : 0;
      for (const { t, c, before } of changes){
        const dEqT = c.dPnl + c.feeIn * share;
        t.fix.dEq = +dEqT.toFixed(6); t.fix.dPnl = +c.dPnl.toFixed(6); t.fix.dFees = +c.dFees.toFixed(6);
        t.fix.flip = before < 0 && t.pnl >= 0 ? 'l2w' : before >= 0 && t.pnl < 0 ? 'w2l' : null;
        for (const pt of (L.equityCurve || [])) if (pt.t >= t.exitTime) pt.eq = +(pt.eq + dEqT).toFixed(2);
        const dk = BotEngine.dayKey(t.exitTime), d = L.daily && L.daily[dk];
        if (d){
          d.pnl = +((d.pnl || 0) + c.dPnl).toFixed(4);
          d.fees = +Math.max(0, (d.fees || 0) + c.dFees).toFixed(4);
          if (before < 0 && t.pnl >= 0){ d.losses = Math.max(0, (d.losses || 0) - 1); d.wins = (d.wins || 0) + 1; }
          else if (before >= 0 && t.pnl < 0){ d.wins = Math.max(0, (d.wins || 0) - 1); d.losses = (d.losses || 0) + 1; }
        }
        /* the lesson written when it closed */
        L.lessons = (L.lessons || []).filter(l => {
          if (l.sym !== t.sym || Math.abs((l.t || 0) - t.exitTime) > 5000) return true;
          if (t.pnl >= 0){ lessonsRemoved.push(l); return false; }   // it was not a loss after all
          lessonsChanged.push({ t: l.t, sym: l.sym, r: l.r, text: l.text });
          l.r = t.r; l.text = String(l.text || '').replace(/^Lost [^ ]+/, 'Lost ' + fmtNum(Math.abs(t.pnl))); return true;
        });
        fixedTrades.push({ sym: t.sym, entryTime: t.entryTime, r: t.r, pnl: t.pnl });
        report.trades++; if (c.cur) report.currencyTrades++; if (c.feeFix) report.commissionTrades++;
      }
      L.equity = +target.toFixed(6);
      if (changes.length) this.relearn(L);
      const netAfter = L.closed.reduce((a, t) => a + (+t.pnl || 0), 0);
      report.netBefore += netBefore; report.netAfter += netAfter; report.openFixed += openFixed;
      report.bots.push({ key, id: key.slice(10), trades: changes.length, openFixed,
        netBefore: +netBefore.toFixed(2), netAfter: +netAfter.toFixed(2),
        equityBefore: +(+copy.equity).toFixed(2), equityAfter: +L.equity.toFixed(2),
        detail: changes.map(({ t, before }) => ({ id: t.id, sym: t.sym, day: BotEngine.dayKey(t.exitTime), before: +(+before).toFixed(2), after: +t.pnl.toFixed(2), why: [t.fix.currency, t.fix.commission != null ? 'commission ' + fmtNum(t.fix.commission) + ' removed' : null].filter(Boolean).join(' · ') })) });
      /* compact backup: each trade carries its own old figures in t.fix; what is
         kept here is only what is not per trade (storage is nearly full - a whole
         copy of every ledger would not fit) */
      backup[key] = { equity: copy.equity, factors: copy.factors, lessonsRemoved, lessonsChanged, openOld };
      writes[key] = JSON.stringify(L);
    }

    /* the Master Brain's examples of those same trades */
    try {
      const raw = localStorage.getItem('astra_brainml');
      const B = raw ? JSON.parse(raw) : null;
      if (B && Array.isArray(B.samples) && fixedTrades.length){
        const byKey = new Map(fixedTrades.map(f => [f.sym + '|' + f.entryTime, f]));
        let n = 0; const old = [];
        B.samples.forEach((s, i) => {
          if (s.src !== 'paper') return;
          const f = byKey.get(s.sym + '|' + s.t); if (!f) return;
          old.push({ i, sym: s.sym, t: s.t, r: s.r, y: s.y });
          s.r = +(+f.r || 0).toFixed(3); s.y = f.r > 0 ? 1 : 0; n++;
        });
        report.brainSamples = n;
        if (n){ backup.astra_brainml = { samples: old }; writes.astra_brainml = JSON.stringify(B); }
      }
    } catch(e){ report.brainError = e.message; }

    report.netBefore = +report.netBefore.toFixed(2); report.netAfter = +report.netAfter.toFixed(2);
    if (!dry && Object.keys(writes).length){
      /* the backup must be safely stored BEFORE a single record is changed */
      let ok = false;
      try { localStorage.setItem(this.KEY_BACKUP, JSON.stringify({ at: Date.now(), items: backup })); ok = true; } catch(e){ report.error = 'backup could not be saved: ' + e.message; }
      if (!ok) return report;                        // nothing changed
      for (const [k, v] of Object.entries(writes)) localStorage.setItem(k, v);
    }
    if (!dry){
      lsSet(this.KEY_REPORT, report);
      if (!report.error) lsSet(this.KEY_DONE, Date.now());
    }
    return report;
  },

  /* once, in the window that runs the bots, before any ledger is loaded */
  runOnce(){
    if (lsGet(this.KEY_DONE, null)) return null;
    const rep = this.run();
    if (rep.trades || rep.openFixed){
      console.info('ASTRA history fix:', rep);
      setTimeout(() => { try { toast('Trade history corrected: ' + rep.trades + ' trades (' + rep.currencyTrades + ' currency, ' + rep.commissionTrades + ' commission) · total ' + fmtNum(rep.netBefore) + ' → ' + fmtNum(rep.netAfter), 'ok'); } catch(e){} }, 6000);
    }
    return rep;
  },

  /* everything back exactly as it was before the correction */
  undo(){
    const b = lsGet(this.KEY_BACKUP, null);
    if (!b || !b.items) return { error: 'no backup' };
    let n = 0;
    for (const [k, v] of Object.entries(b.items)){
      if (k === 'astra_brainml'){
        const B = lsGet('astra_brainml', null); if (!B || !B.samples) continue;
        /* by position (two examples can share an instrument and a time); if the list
           was trimmed since, the first unrestored example with that instrument and time */
        const used = new Set();
        for (const o of v.samples){
          let i = B.samples[o.i] && B.samples[o.i].sym === o.sym && B.samples[o.i].t === o.t && !used.has(o.i) ? o.i
            : B.samples.findIndex((s, j) => !used.has(j) && s.src === 'paper' && s.sym === o.sym && s.t === o.t);
          if (i < 0) continue; used.add(i); B.samples[i].r = o.r; B.samples[i].y = o.y;
        }
        lsSet('astra_brainml', B); n++; continue;
      }
      const L = lsGet(k, null); if (!L) continue;
      for (const t of (L.closed || [])){
        const f = t.fix; if (!f || f.at !== '2026-10-04') continue;
        Object.assign(t, f.old);
        if (t.meta && t.meta.accountFx && /history fix/.test(t.meta.accountFx.via || '')) delete t.meta.accountFx;
        for (const pt of (L.equityCurve || [])) if (pt.t >= t.exitTime) pt.eq = +(pt.eq - (f.dEq || 0)).toFixed(2);
        const d = L.daily && L.daily[BotEngine.dayKey(t.exitTime)];
        if (d){
          d.pnl = +(d.pnl - (f.dPnl || 0)).toFixed(4); d.fees = +(d.fees - (f.dFees || 0)).toFixed(4);
          if (f.flip === 'l2w'){ d.wins--; d.losses++; } else if (f.flip === 'w2l'){ d.losses--; d.wins++; }
        }
        delete t.fix;
      }
      for (const o of (v.openOld || [])){
        const p = (L.open || []).find(x => x.id === o.id); if (!p) continue;
        for (const kk of ['riskCash', 'mfe', 'mae', 'slippage', 'unreal']) if (o[kk] !== undefined) p[kk] = o[kk];
        if (p.meta && p.meta.accountFx && /history fix/.test(p.meta.accountFx.via || '')) delete p.meta.accountFx;
      }
      L.lessons = (L.lessons || []).map(l => { const c = (v.lessonsChanged || []).find(x => x.t === l.t && x.sym === l.sym); return c ? Object.assign(l, { r: c.r, text: c.text }) : l; })
        .concat(v.lessonsRemoved || []).sort((a, b) => (b.t || 0) - (a.t || 0));
      L.factors = v.factors; L.equity = v.equity;
      lsSet(k, L); n++;
    }
    localStorage.removeItem(this.KEY_DONE);
    lsSet(this.KEY_DONE, 'undone ' + new Date().toISOString());   // never re-applied by itself after an undo
    return { restored: n, takenAt: new Date(b.at).toLocaleString(), note: 'restart ASTRA to load the restored records' };
  },
};
