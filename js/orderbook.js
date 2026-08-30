/* ASTRA Terminal — live order book depth + trade tape */
const Book = {
  trades: [],
  _raf: null,

  init(){
    this.asksEl = document.getElementById('bookAsks');
    this.bidsEl = document.getElementById('bookBids');
    this.spreadEl = document.getElementById('bookSpread');
    this.tradesEl = document.getElementById('tapeBody');
    BUS.on('symbol', () => this.clear());
  },

  clear(){
    this.asksEl.innerHTML = '';
    this.bidsEl.innerHTML = '';
    this.spreadEl.textContent = '';
    this.trades = [];
    this.tradesEl.innerHTML = '';
    const route = typeof Feed !== 'undefined' ? Feed.route(STORE.symbol) : { kind: 'binance' };
    if (route.kind !== 'binance'){
      this.bidsEl.innerHTML =
        '<div class="empty">Order book and trade tape are exchange data.<br><br>' +
        (route.kind === 'bridge'
          ? 'Your broker streams a single bid/ask, not a public book — see the price and spread on the chart.'
          : esc(baseAsset(STORE.symbol)) + ' is not an exchange-traded crypto pair, so no public book exists.<br>Switch to a crypto pair to see live depth.') +
        '</div>';
    }
  },

  onDepth(d){
    if (!d || !d.bids || !this.asksEl) return;
    const bids = d.bids.slice(0, 13).map(x => [+x[0], +x[1]]);
    const asks = d.asks.slice(0, 13).map(x => [+x[0], +x[1]]);
    let maxTot = 1;
    for (const [p, q] of bids) maxTot = Math.max(maxTot, p * q);
    for (const [p, q] of asks) maxTot = Math.max(maxTot, p * q);
    this.asksEl.innerHTML = asks.slice().reverse().map(([p, q]) => this.row(p, q, p * q / maxTot, 'ask')).join('');
    this.bidsEl.innerHTML = bids.map(([p, q]) => this.row(p, q, p * q / maxTot, 'bid')).join('');
    if (bids[0] && asks[0]){
      const sp = asks[0][0] - bids[0][0];
      this.spreadEl.textContent = 'Spread ' + fmtPrice(sp) + '  ·  ' + (sp / asks[0][0] * 100).toFixed(3) + '%';
    }
  },

  row(p, q, frac, side){
    return `<div class="brow ${side}"><i style="width:${Math.min(100, frac * 100).toFixed(1)}%"></i>` +
      `<span>${fmtPrice(p)}</span><span>${q < 1 ? q.toFixed(5) : q.toFixed(3)}</span><span>${fmtNum(p * q)}</span></div>`;
  },

  onTrade(d){
    if (!d || !d.p) return;
    this.trades.unshift({ p: +d.p, q: +d.q, t: d.T, sell: !!d.m });
    if (this.trades.length > 40) this.trades.pop();
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this.renderTrades(); });
  },

  renderTrades(){
    this.tradesEl.innerHTML = this.trades.map(t =>
      `<div class="trow ${t.sell ? 'down' : 'up'}"><span>${fmtPrice(t.p)}</span>` +
      `<span>${t.q < 1 ? t.q.toFixed(5) : t.q.toFixed(3)}</span>` +
      `<span>${new Date(t.t).toLocaleTimeString()}</span></div>`).join('');
  },
};
