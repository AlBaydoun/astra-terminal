/* ASTRA Terminal — paper trading portfolio (virtual money, 0.1% simulated fee) */
const Port = {
  state: lsGet('astra_port', { balance: 100000, positions: {}, history: [] }),
  FEE: 0.001,

  /* ⚙ the Paper panel your way: the blocks in any order, on or off, positions sorted, history length */
  CFG_KEY: 'astra_portcfg',
  PARTS: { stats: 'Cash, equity and total P&L', ticket: 'Buy / sell ticket', positions: 'Open positions', history: 'Trade history', reset: 'Reset paper account button' },
  cfg(){ const c = lsGet(this.CFG_KEY, {}) || {}; const ids = Object.keys(this.PARTS); const order = (c.order || []).filter(x => ids.includes(x)); for (const id of ids) if (!order.includes(id)) order.push(id);
    return { order, hidden: c.hidden || [], posSort: c.posSort || 'none', histN: c.histN || 15 }; },
  saveCfg(c){ lsSet(this.CFG_KEY, c); this.applyCfg(); this.render(); this.cfgView(); },
  wrapParts(){
    const panel = document.getElementById('tab-portfolio'); if (!panel || panel.querySelector('.ptPart')) return;
    const titles = [...panel.querySelectorAll(':scope > .secTitle')];
    const groups = {
      stats: [panel.querySelector(':scope > .ptStats')], ticket: [panel.querySelector(':scope > .ticket')],
      positions: [titles[0], document.getElementById('ptPositions')], history: [titles[1], document.getElementById('ptHistory')],
      reset: [document.getElementById('ptReset')],
    };
    const top = document.createElement('div'); top.className = 'sideHead ptTop';
    top.innerHTML = '<span>PAPER</span><button id="portCfgBtn" title="Arrange the Paper panel">⚙</button>';
    const box = document.createElement('div'); box.id = 'portCfgBox'; box.hidden = true;
    panel.prepend(top, box);
    for (const [k, els] of Object.entries(groups)){ const w = document.createElement('div'); w.className = 'ptPart'; w.dataset.pt = k; for (const el of els) if (el) w.appendChild(el); panel.appendChild(w); }
    top.querySelector('#portCfgBtn').addEventListener('click', () => { this.cfgOpen = !this.cfgOpen; this.cfgView(); });
    box.addEventListener('click', e => { const m = e.target.closest('[data-ptmv]'); if (!m) return; const c = this.cfg(), [k, d] = m.dataset.ptmv.split('|'), i = c.order.indexOf(k), j = i + +d; if (i < 0 || j < 0 || j >= c.order.length) return; c.order.splice(i, 1); c.order.splice(j, 0, k); this.saveCfg(c); });
    box.addEventListener('change', e => {
      const t = e.target, c = this.cfg();
      if (t.dataset.pton) c.hidden = t.checked ? c.hidden.filter(x => x !== t.dataset.pton) : c.hidden.concat([t.dataset.pton]);
      else if (t.dataset.ptsort) c.posSort = t.value; else if (t.dataset.pthist) c.histN = +t.value; else return;
      this.saveCfg(c);
    });
    this.applyCfg();
  },
  applyCfg(){
    const panel = document.getElementById('tab-portfolio'); if (!panel) return;
    const c = this.cfg();
    for (const k of c.order){ const el = panel.querySelector(':scope > .ptPart[data-pt="' + k + '"]'); if (el){ panel.appendChild(el); el.hidden = c.hidden.includes(k); } }
  },
  cfgView(){
    const box = document.getElementById('portCfgBox'), btn = document.getElementById('portCfgBtn'); if (!box) return;
    box.hidden = !this.cfgOpen; if (btn) btn.classList.toggle('on', !!this.cfgOpen);
    if (!this.cfgOpen){ box.innerHTML = ''; return; }
    const c = this.cfg(), n = c.order.length;
    box.innerHTML = `<div class="bkRows">${c.order.map((k, i) => `<div class="bkRow"><label><input type="checkbox" data-pton="${k}" ${c.hidden.includes(k) ? '' : 'checked'}> ${esc(this.PARTS[k])}</label>
        <span><button data-ptmv="${k}|-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-ptmv="${k}|1" ${i === n - 1 ? 'disabled' : ''}>▼</button></span></div>`).join('')}</div>
      <label>Positions <select data-ptsort="1">${[['none', 'As opened'], ['value', 'Largest value first'], ['pnl', 'Best result first'], ['worst', 'Worst result first'], ['az', 'A → Z']].map(([v, t]) => `<option value="${v}"${v === c.posSort ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>History rows <select data-pthist="1">${[5, 15, 30, 50].map(v => `<option${v === c.histN ? ' selected' : ''}>${v}</option>`).join('')}</select></label>`;
  },

  init(){
    document.getElementById('ptBuy').addEventListener('click', () => this.trade('buy'));
    document.getElementById('ptSell').addEventListener('click', () => this.trade('sell'));
    document.getElementById('ptReset').addEventListener('click', () => {
      if (confirm('Reset paper account to 100,000 USDT? All positions and history will be cleared.')){
        this.state = { balance: 100000, positions: {}, history: [] };
        this.persist();
        toast('Paper account reset', 'ok');
      }
    });
    document.querySelectorAll('.ptPct').forEach(b => b.addEventListener('click', () => {
      const px = this.price(STORE.symbol);
      if (!(px > 0)) return;
      const frac = parseFloat(b.dataset.p) / 100;
      const qty = this.state.balance * frac / (px * (1 + this.FEE));
      document.getElementById('ptQty').value = qty > 0 ? +qty.toPrecision(6) : '';
    }));
    BUS.on('symbol', () => this.updateTicket());
    setInterval(() => {
      const panel = document.getElementById('tab-portfolio');
      if (panel && panel.classList.contains('active')) this.render();
    }, 1500);
    this.updateTicket();
    this.render();
    this.wrapParts();
  },

  price(sym){ const t = STORE.tickers.get(sym); return t ? t.last : 0; },

  updateTicket(){
    document.getElementById('ptSym').textContent = baseAsset(STORE.symbol) + '/USDT';
  },

  trade(side){
    const qty = parseFloat(document.getElementById('ptQty').value);
    this.execute(STORE.symbol, side, qty);
  },

  execute(sym, side, qty, who){
    if (typeof MarketSources !== 'undefined' && (!MarketSources.binanceOn() || Feed.route(sym).kind !== 'binance' || !Feed.isLive(sym))){
      toast('The exchange paper portfolio is paused. Use the Manual Trading Bot for JustMarkets.', 'warn'); return;
    }
    const px = this.price(sym);
    if (!(qty > 0) || !(px > 0)){ toast('Enter a quantity first', 'warn'); return; }
    const st = this.state;
    const pos = st.positions[sym] || { qty: 0, avg: 0 };
    if (side === 'buy'){
      const cost = qty * px * (1 + this.FEE);
      if (cost > st.balance + 1e-9){ toast('Not enough paper balance (need ' + fmtNum(cost) + ' USDT)', 'warn'); return; }
      st.balance -= cost;
      pos.avg = (pos.avg * pos.qty + px * qty) / (pos.qty + qty);
      pos.qty += qty;
      st.positions[sym] = pos;
      st.history.unshift({ t: Date.now(), sym, side, qty, px });
    } else {
      if (qty > pos.qty + 1e-12){ toast('You only hold ' + (+pos.qty.toPrecision(6)) + ' ' + baseAsset(sym), 'warn'); return; }
      st.balance += qty * px * (1 - this.FEE);
      const realized = (px - pos.avg) * qty;
      pos.qty -= qty;
      if (pos.qty < 1e-12) delete st.positions[sym];
      else st.positions[sym] = pos;
      st.history.unshift({ t: Date.now(), sym, side, qty, px, pnl: realized });
    }
    if (st.history.length > 60) st.history.length = 60;
    this.persist();
    toast((who ? who + ': ' : '') + (side === 'buy' ? 'Bought ' : 'Sold ') + (+qty.toPrecision(6)) + ' ' + baseAsset(sym) + ' @ ' + fmtPrice(px) + ' (paper)', 'ok');
  },

  persist(){ lsSet('astra_port', this.state); this.render(); },

  equity(){
    let eq = this.state.balance;
    for (const [s, p] of Object.entries(this.state.positions)) eq += p.qty * this.price(s);
    return eq;
  },

  render(){
    const st = this.state;
    const eq = this.equity();
    const pnlTotal = eq - 100000;
    document.getElementById('ptBalance').textContent = fmtNum(st.balance) + ' USDT';
    const eqEl = document.getElementById('ptEquity');
    eqEl.textContent = fmtNum(eq) + ' USDT';
    const pe = document.getElementById('ptPnl');
    pe.textContent = (pnlTotal >= 0 ? '+' : '') + fmtNum(pnlTotal) + ' (' + fmtPct(pnlTotal / 1000) + ')';
    pe.className = 'ptv ' + pctClass(pnlTotal);

    const posHost = document.getElementById('ptPositions');
    const C = this.cfg();
    const entries = Object.entries(st.positions);
    const pnlOf = ([s, p]) => (this.price(s) - p.avg) * p.qty, valOf = ([s, p]) => p.qty * this.price(s);
    if (C.posSort === 'value') entries.sort((a, b) => valOf(b) - valOf(a));
    else if (C.posSort === 'pnl') entries.sort((a, b) => pnlOf(b) - pnlOf(a));
    else if (C.posSort === 'worst') entries.sort((a, b) => pnlOf(a) - pnlOf(b));
    else if (C.posSort === 'az') entries.sort((a, b) => baseAsset(a[0]).localeCompare(baseAsset(b[0])));
    if (!entries.length) posHost.innerHTML = '<div class="empty">No open positions</div>';
    else posHost.innerHTML = entries.map(([s, p]) => {
      const px = this.price(s);
      const val = p.qty * px;
      const upnl = (px - p.avg) * p.qty;
      const upct = p.avg ? (px - p.avg) / p.avg * 100 : 0;
      return `<div class="posrow" data-sym="${s}">` +
        `<div class="posl"><b>${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(s):esc(baseAsset(s))}</b><span>${+p.qty.toPrecision(6)} @ ${fmtPrice(p.avg)}</span></div>` +
        `<div class="posr"><b>${fmtNum(val)}</b><span class="${pctClass(upnl)}">${(upnl >= 0 ? '+' : '') + fmtNum(upnl)} · ${fmtPct(upct)}</span></div></div>`;
    }).join('');
    posHost.querySelectorAll('.posrow').forEach(r => r.addEventListener('click', () => App.setSymbol(r.dataset.sym)));

    const hist = document.getElementById('ptHistory');
    if (!st.history.length) hist.innerHTML = '<div class="empty">No trades yet</div>';
    else hist.innerHTML = st.history.slice(0, C.histN).map(h =>
      `<div class="histrow"><span class="${h.side === 'buy' ? 'up' : 'down'}">${h.side.toUpperCase()}</span>` +
      `<span>${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(h.sym):esc(baseAsset(h.sym))}</span><span>${+h.qty.toPrecision(5)}</span><span>@ ${fmtPrice(h.px)}</span>` +
      `<span class="${h.pnl != null ? pctClass(h.pnl) : ''}">${h.pnl != null ? (h.pnl >= 0 ? '+' : '') + fmtNum(h.pnl) : ''}</span></div>`).join('');
  },
};
