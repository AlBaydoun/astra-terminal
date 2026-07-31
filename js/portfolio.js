/* ASTRA Terminal — paper trading portfolio (virtual money, 0.1% simulated fee) */
const Port = {
  state: lsGet('astra_port', { balance: 100000, positions: {}, history: [] }),
  FEE: 0.001,

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
  },

  price(sym){ const t = STORE.tickers.get(sym); return t ? t.last : 0; },

  updateTicket(){
    document.getElementById('ptSym').textContent = baseAsset(STORE.symbol) + '/USDT';
  },

  trade(side){
    const sym = STORE.symbol, px = this.price(sym);
    const qty = parseFloat(document.getElementById('ptQty').value);
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
    toast((side === 'buy' ? 'Bought ' : 'Sold ') + (+qty.toPrecision(6)) + ' ' + baseAsset(sym) + ' @ ' + fmtPrice(px) + ' (paper)', 'ok');
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
    const entries = Object.entries(st.positions);
    if (!entries.length) posHost.innerHTML = '<div class="empty">No open positions</div>';
    else posHost.innerHTML = entries.map(([s, p]) => {
      const px = this.price(s);
      const val = p.qty * px;
      const upnl = (px - p.avg) * p.qty;
      const upct = p.avg ? (px - p.avg) / p.avg * 100 : 0;
      return `<div class="posrow" data-sym="${s}">` +
        `<div class="posl"><b>${esc(baseAsset(s))}</b><span>${+p.qty.toPrecision(6)} @ ${fmtPrice(p.avg)}</span></div>` +
        `<div class="posr"><b>${fmtNum(val)}</b><span class="${pctClass(upnl)}">${(upnl >= 0 ? '+' : '') + fmtNum(upnl)} · ${fmtPct(upct)}</span></div></div>`;
    }).join('');
    posHost.querySelectorAll('.posrow').forEach(r => r.addEventListener('click', () => App.setSymbol(r.dataset.sym)));

    const hist = document.getElementById('ptHistory');
    if (!st.history.length) hist.innerHTML = '<div class="empty">No trades yet</div>';
    else hist.innerHTML = st.history.slice(0, 15).map(h =>
      `<div class="histrow"><span class="${h.side === 'buy' ? 'up' : 'down'}">${h.side.toUpperCase()}</span>` +
      `<span>${esc(baseAsset(h.sym))}</span><span>${+h.qty.toPrecision(5)}</span><span>@ ${fmtPrice(h.px)}</span>` +
      `<span class="${h.pnl != null ? pctClass(h.pnl) : ''}">${h.pnl != null ? (h.pnl >= 0 ? '+' : '') + fmtNum(h.pnl) : ''}</span></div>`).join('');
  },
};
