/* Manual PAPER entry instructions. Kept separately from the existing ledgers.
   The owner approved the separate saved list after reviewing MANUAL-ENTRY-PLAN.md.
   Never calls Live, /order or /close. */
const ManualOrders = {
  KEY: 'astra_manual_pending_v1',
  error: '', busy: false, submitting: false,
  read(){
    const s = lsGet(this.KEY, { orders: [] });
    const statuses = ['waiting', 'processing', 'review', 'filled', 'rejected', 'cancelled'];
    if (!s || !Array.isArray(s.orders) || s.orders.some(o => !o || typeof o.id !== 'string' ||
        typeof o.sym !== 'string' || !['limit','stop'].includes(o.type) || ![1,-1].includes(o.dir) ||
        ![o.entry,o.qty,o.sl,o.createdAt].every(x => Number.isFinite(x) && x > 0) ||
        (o.tp != null && !(Number.isFinite(o.tp) && o.tp > 0)) || !statuses.includes(o.status)))
      throw Error('Saved entry orders could not be read. No waiting order will execute.');
    return s.orders;
  },
  save(orders){
    const active = orders.filter(o => ['waiting','processing','review'].includes(o.status));
    const finished = orders.filter(o => !active.includes(o)).slice(-100);
    if (!lsSet(this.KEY, { orders: active.concat(finished).sort((a,b) => a.createdAt-b.createdAt) }))
      throw Error('Waiting orders could not be saved. Keep ASTRA open and check browser storage.');
    this.error = '';
  },
  syncLedger(){
    const old = Bots.ledgers.manual;
    if (!BotEngine.unsaved.has(old)){
      const saved = lsGet('astra_bot_manual', null);
      if (saved) Bots.ledgers.manual = Object.assign(BotEngine.blank('manual'), saved);
    }
    this.syncPreferences();
  },
  syncPreferences(){
    const cfg = lsGet('astra_botcfg_manual', null);
    if (cfg) Bots.cfgs.manual = cfg;
    PairRules.state = null; PairRules._cache = null;
  },
  async exclusive(action){
    // One writer across ASTRA windows. No extra storage key or ledger field.
    if (!navigator.locks) throw Error('This browser cannot coordinate saved orders. Open ASTRA in Edge or Chrome on localhost.');
    return navigator.locks.request('astra-manual-ledger', async () => {
      this.syncLedger();
      return action();
    });
  },
  fail(e){
    const message = e.message || String(e);
    if (this.error !== message){ console.error('ASTRA manual orders:', message); toast(message, 'warn'); }
    this.error = message; this.refresh();
  },
  start(){
    if (this.timer) return;
    this.timer = setInterval(() => this.poll(), 5000);
    window.addEventListener('storage', e => {
      if (['astra_pairrules', 'astra_bot_manual', 'astra_botcfg_manual', this.KEY].includes(e.key)){
        // Obtain the writer lock before refreshing another window's ledger.
        this.exclusive(() => {}).then(() => Bots.render()).catch(e => this.fail(e));
      }
    });
    this.poll();
  },
  form(){
    const value = id => document.getElementById(id)?.value || '';
    return { type: value('mbOrderType') || 'market', entry: parseFloat(value('mbEntry')),
      sym: Bots.resolveSymbol(document.getElementById('mbSym')?.dataset.val) || STORE.symbol,
      dir: Bots.manualSide, sl: parseFloat(value('mbSl')), tp: value('mbTp').trim() === '' ? null : parseFloat(value('mbTp')),
      amt: parseFloat(value('mbAmt')), lots: parseFloat(value('mbQty')), amtMode: Bots.amtMode,
      tf: value('mbTf'), note: value('mbNote').trim() };
  },
  validate(d){
    if (!['limit','stop'].includes(d.type) || ![1,-1].includes(d.dir)) return 'Choose Limit or Stop entry.';
    if (!(Number.isFinite(d.entry) && d.entry > 0)) return 'Set a positive entry price.';
    if (!(Number.isFinite(d.sl) && d.sl > 0 && (d.entry-d.sl)*d.dir > 0))
      return 'Set a stop-loss ' + (d.dir > 0 ? 'below' : 'above') + ' your entry price.';
    if (d.tp != null && !(Number.isFinite(d.tp) && d.tp > 0 && (d.tp-d.entry)*d.dir > 0))
      return 'Set a take-profit ' + (d.dir > 0 ? 'above' : 'below') + ' your entry price, or leave it empty.';
    return null;
  },
  fill(q, dir, R){ return q.price * (1 + dir * R.slippagePct / 100) + dir * (q.spread ?? q.price * 0.0002) / 2; },
  reached(o, fill){ return Number.isFinite(fill) && (o.type === 'limit' ? (fill-o.entry)*o.dir <= 0 : (fill-o.entry)*o.dir >= 0); },
  signal(o, price){
    return { sym:o.sym, tf:o.tf, dir:o.dir, entry:price, sl:o.sl, tp:o.tp, requestedQty:o.qty,
      score:100, model:'Manual ' + (o.type === 'limit' ? 'Limit' : 'Stop entry'), note:o.note,
      manual:true, reasons:['Entry instruction at ' + fmtPrice(o.entry)], factors:{manual:true} };
  },
  preview(d, q){
    const none = { qty:0, lots:null, lev:Feed.account?.leverage || null };
    const reason = this.validate(d);
    if (reason) return {...none, reason};
    if (!q) return {...none, reason:'Waiting for a fresh live quote; the order cannot be placed yet.'};
    const L = Bots.ledgers.manual, cfg = Bots.manualCfg(), R = BotEngine.rules(cfg);
    if (BotEngine.unsaved.has(L)) return {...none, reason:'Save failed — new entries are blocked until this ledger is saved'};
    // This is an estimate ONLY, at the chosen level with today's spread and
    // unchanged costs. It never goes to open(). Actual fills use fresh quotes.
    // Entry is the executable price, not the midpoint. Solve for the quote
    // that would produce that fill, keeping spread and slippage unchanged.
    const spread = q.spread ?? q.price * 0.0002;
    const projected = {...q, spread, price:(d.entry - d.dir*spread/2)/(1 + d.dir*R.slippagePct/100)};
    const request = Bots.manualRequest(d.sym, this.fill(projected,d.dir,R), d);
    if (request.reason) return {...none, reason:request.reason};
    if(typeof ManualTicket!=='undefined'){
      const plan=ManualTicket.fit({...L},cfg,this.signal({...d,qty:request.qty},d.entry),projected),estimate=plan.estimate;
      return {...request,qty:estimate?.qty||0,lots:estimate?.lots??null,riskCash:estimate?.riskCash,gate:plan.gate,estimate,reason:plan.reason,plan};
    }
    const gate = BotEngine.check({...L}, cfg, this.signal({...d,qty:request.qty},d.entry), projected);
    if (!gate.ok) return {...none, reason:gate.reason};
    return {...request, qty:gate.qty, lots:gate.lots ?? null, riskCash:gate.riskCash, gate};
  },
  async submit(){
    if (this.submitting) return;
    const d = this.form(); // Freeze the user's input before any asynchronous work.
    this.submitting = true;
    try {
      await this.exclusive(async () => {
        if (d.type === 'market') return Bots.manualMarketOpen(d);
        await Feed.loadSpecs([d.sym]); await Feed.quotes([d.sym]);
        if(typeof ManualTicket!=='undefined')await ManualTicket.loadFx(d.sym);
        const orders = this.read();
        if (orders.filter(o => o.status === 'waiting').length >= 50) throw Error('Cancel an existing waiting order before adding more than 50.');
        const p = this.preview(d, Bots.quoteFor(d.sym));
        if (!p.gate) return toast('Order rejected: ' + p.reason, 'warn');
        orders.push({id:crypto.randomUUID(), sym:d.sym, dir:d.dir, type:d.type,
          entry:d.entry, qty:p.qty, sl:p.plan?.sig.sl??d.sl, tp:p.plan?.sig.tp??d.tp, tf:d.tf, note:[d.note,...(p.plan?.adjustments||[])].filter(Boolean).join(' · '),
          createdAt:Date.now(), status:'waiting'});
        this.save(orders);
        toast('Saved paper ' + (d.dir > 0 ? 'BUY' : 'SELL') + ' ' + d.type + ' at ' + fmtPrice(d.entry), 'ok');
      });
    } catch(e){ this.fail(e); }
    finally { this.submitting = false; Bots.render(); this.refresh(); }
  },
  async cancel(id){
    try {
      await this.exclusive(() => {
        const orders = this.read(), o = orders.find(o => o.id === id);
        if (!o || !['waiting','review'].includes(o.status)) return;
        o.status = 'cancelled'; o.message = 'Cancelled by you'; this.save(orders);
      });
    } catch(e){ this.fail(e); }
    this.refresh();
  },
  async poll(){
    if (this.busy) return;
    this.busy = true;
    try {
      const waiting = this.read().filter(o => o.status === 'waiting');
      const syms = [...new Set(waiting.map(o => o.sym))];
      if (syms.length){ await Feed.loadSpecs(syms); await Feed.quotes(syms);
        if(typeof ManualTicket!=='undefined')for(const sym of syms)await ManualTicket.loadFx(sym); }
      await this.exclusive(() => this.process());
    } catch(e){ this.fail(e); }
    finally {
      this.busy = false;
      if (Bots.active === 'manual') Bots.render(); else this.refresh();
    }
  },
  process(){
    const orders = this.read();
    // A prior window stopped between saving the instruction and its fill. Do
    // not retry an uncertain action: the user must review the existing ledger.
    for (const o of orders.filter(o => o.status === 'processing')){
      o.status = 'review'; o.message = 'Interrupted during execution. Check open/history trades before replacing this instruction.';
      this.save(orders);
    }
    for (const o of orders.filter(o => o.status === 'waiting')){
      const q = Bots.quoteFor(o.sym); // Never use a candle's old high/low to invent a fill.
      if (!q) continue;
      const cfg = Bots.manualCfg(), R = BotEngine.rules(cfg), L = Bots.ledgers.manual;
      if (!this.reached(o, this.fill(q,o.dir,R))) continue;
      const sig = this.signal(o,q.price), gate = BotEngine.check(L,cfg,sig,q);
      if (!gate.ok){ o.status = 'rejected'; o.message = gate.reason; this.save(orders); continue; }
      if (Math.abs(gate.qty-o.qty) > 1e-9){
        o.status = 'rejected'; o.message = 'Broker volume step changed. Replace this instruction with a valid size.';
        this.save(orders); continue;
      }
      o.status = 'processing'; this.save(orders); // Must persist BEFORE any ledger mutation.
      const pos = BotEngine.open(L,cfg,sig,q,gate);
      if (!pos){ o.status = 'rejected'; o.message = 'Final risk check refused the entry'; this.save(orders); continue; }
      o.positionId = pos.id;
      if (!BotEngine.save('manual',L)){
        o.status = 'review'; o.message = 'Position opened in memory but saving failed. Keep ASTRA open and check the ledger.';
        this.save(orders); break;
      }
      o.status = 'filled'; o.fill = pos.entry; o.message = 'Opened paper position #' + pos.id;
      this.save(orders);
      toast('Paper ' + (o.dir > 0 ? 'BUY' : 'SELL') + ' ' + o.sym + ' opened at ' + fmtPrice(pos.entry), 'ok');
    }
  },
  managePositions(){
    return this.exclusive(() => {
      const L = Bots.ledgers.manual;
      let changed = false;
      for (const p of L.open.slice()){
        const q = Bots.quoteFor(p.sym);
        if (q){ BotEngine.step(L,Bots.manualCfg(),p,null,q); changed = true; }
      }
      if (changed) BotEngine.save('manual',L);
    }).catch(e => this.fail(e));
  },
  view(){
    let orders;
    try { orders = this.read(); } catch(e){ return '<div class="botNote warn">' + esc(e.message) + '</div>'; }
    const row = o => `<div class="prCard" data-pending-id="${esc(o.id)}">
      <div class="prTop"><b>${esc(o.sym)} · ${o.dir > 0 ? 'BUY' : 'SELL'} ${o.type === 'limit' ? 'LIMIT' : 'STOP ENTRY'}</b>
      <span class="prBadge">${esc(o.status)}</span></div>
      <div class="prWhy">Entry ${fmtPrice(o.entry)} · SL ${fmtPrice(o.sl)} · TP ${o.tp == null ? 'none' : fmtPrice(o.tp)}
      · ${+o.qty.toPrecision(8)} units · ${esc(o.tf)}</div>
      <div class="prWhy">${esc(o.message || (Bots.quoteFor(o.sym) ? 'Waiting for your entry price' : 'Waiting for a fresh live quote'))}</div>
      ${o.fill ? '<div class="prWhy">Filled at ' + fmtPrice(o.fill) + '</div>' : ''}
      ${o.note ? '<div class="prWhy">' + esc(o.note) + '</div>' : ''}
      ${['waiting','review'].includes(o.status) ? '<button class="bMini" data-pcancel="' + esc(o.id) + '">Cancel order</button>' : ''}</div>`;
    return '<div class="botH">WAITING ENTRY ORDERS · PAPER</div>' +
      '<div class="botNote">Saved in this browser across restarts; not copied to other devices. Checks run while ASTRA is open. Funds are checked at execution; waiting instructions do not reserve funds. A rejected instruction must be placed again.</div>' +
      (this.error ? '<div class="botNote warn">' + esc(this.error) + '</div>' : '') +
      (orders.length ? orders.slice().reverse().map(row).join('') : '<div class="empty">No entry orders yet</div>');
  },
  refresh(){
    const host = document.getElementById('manualPending');
    if (!host) return;
    host.innerHTML = this.view();
    host.querySelectorAll('[data-pcancel]').forEach(el => el.addEventListener('click', () => this.cancel(el.dataset.pcancel)));
  },
};

// Serialize every existing manual-ledger writer with waiting-order execution.
// Other bots retain their existing per-bot ledgers and execution path.
for (const name of ['editPos','partialClose','closePos','breakEven','resetBot']){
  const action = Bots[name];
  Bots[name] = function(botId, ...args){
    if (botId !== 'manual') return action.call(this,botId,...args);
    return ManualOrders.exclusive(() => {
      // breakEven calls editPos itself: use its existing synchronous core while
      // already holding the lock, instead of trying to take the same lock twice.
      if (name === 'breakEven'){
        const p = this.ledgers.manual.open.find(p => p.id === args[0]);
        if (!p) return;
        const price = this.quoteFor(p.sym)?.price || p.entry;
        if ((price-p.entry)*p.dir <= 0) return toast('Not in profit yet — the stop would sit beyond the price', 'warn');
        p.beMoved = true;
        return ManualOrders.editCore.call(this,botId,p.id,{sl:p.entry});
      }
      return action.call(this,botId,...args);
    }).catch(e => ManualOrders.fail(e));
  };
  if (name === 'editPos') ManualOrders.editCore = action;
}
Bots.manualOpen = () => ManualOrders.submit();
