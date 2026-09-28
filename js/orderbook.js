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
    this.wrapParts();
  },

  /* ⚙ the Depth panel your way: which block first, on/off, levels, which side on top, columns */
  CFG_KEY: 'astra_bookcfg',
  cfg(){ const c = lsGet(this.CFG_KEY, {}) || {}; return { order: c.order || ['book', 'tape'], hidden: c.hidden || [], levels: c.levels || 13, bidsTop: !!c.bidsTop, amount: c.amount !== false, total: c.total !== false }; },
  saveCfg(c){ lsSet(this.CFG_KEY, c); this.applyCfg(); if (this._last) this.onDepth(this._last); },
  wrapParts(){
    const panel = document.getElementById('tab-book'); if (!panel || panel.querySelector('.bkPart')) return;
    const head = panel.querySelector('.bookHead'), title = panel.querySelector('.tapeTitle');
    const book = document.createElement('div'); book.className = 'bkPart'; book.dataset.bk = 'book';
    const tape = document.createElement('div'); tape.className = 'bkPart'; tape.dataset.bk = 'tape';
    for (const el of [head, this.asksEl, this.spreadEl, this.bidsEl]) if (el) book.appendChild(el);
    for (const el of [title, this.tradesEl]) if (el) tape.appendChild(el);
    const top = document.createElement('div'); top.className = 'sideHead bkTop';
    top.innerHTML = '<span>DEPTH</span><button id="bookCfgBtn" title="Arrange the Depth panel">⚙</button>';
    const box = document.createElement('div'); box.id = 'bookCfgBox'; box.hidden = true;
    panel.prepend(top, box); panel.append(book, tape);
    top.querySelector('#bookCfgBtn').addEventListener('click', () => { this.cfgOpen = !this.cfgOpen; this.cfgView(); });
    box.addEventListener('click', e => { const m = e.target.closest('[data-bkmv]'); if (!m) return; const c = this.cfg(); const [k, d] = m.dataset.bkmv.split('|'); const i = c.order.indexOf(k), j = i + +d; if (i < 0 || j < 0 || j >= c.order.length) return; c.order.splice(i, 1); c.order.splice(j, 0, k); this.saveCfg(c); this.cfgView(); });
    box.addEventListener('change', e => {
      const t = e.target, c = this.cfg();
      if (t.dataset.bkon){ c.hidden = t.checked ? c.hidden.filter(x => x !== t.dataset.bkon) : c.hidden.concat([t.dataset.bkon]); }
      else if (t.dataset.bklevels) c.levels = +t.value;
      else if (t.dataset.bktop) c.bidsTop = t.value === 'bids';
      else if (t.dataset.bkcol) c[t.dataset.bkcol] = t.checked;
      else return;
      this.saveCfg(c); this.cfgView();
    });
    this.applyCfg();
  },
  applyCfg(){
    const panel = document.getElementById('tab-book'); if (!panel) return;
    const c = this.cfg();
    for (const k of c.order){ const el = panel.querySelector('.bkPart[data-bk="' + k + '"]'); if (el){ panel.appendChild(el); el.hidden = c.hidden.includes(k); } }
    /* which side sits on top: the spread always stays between them */
    const book = panel.querySelector('.bkPart[data-bk="book"]');
    if (book){ if (c.bidsTop){ book.insertBefore(this.bidsEl, this.spreadEl); book.appendChild(this.asksEl); } else { book.insertBefore(this.asksEl, this.spreadEl); book.appendChild(this.bidsEl); } }
    panel.classList.toggle('bkNoAmount', !c.amount); panel.classList.toggle('bkNoTotal', !c.total);
  },
  cfgView(){
    const box = document.getElementById('bookCfgBox'), btn = document.getElementById('bookCfgBtn'); if (!box) return;
    box.hidden = !this.cfgOpen; if (btn) btn.classList.toggle('on', !!this.cfgOpen);
    if (!this.cfgOpen){ box.innerHTML = ''; return; }
    const c = this.cfg(), label = { book: 'Order book (sells · spread · buys)', tape: 'Recent trades' };
    box.innerHTML = `<div class="bkRows">${c.order.map((k, i) => `<div class="bkRow"><label><input type="checkbox" data-bkon="${k}" ${c.hidden.includes(k) ? '' : 'checked'}> ${label[k]}</label>
        <span><button data-bkmv="${k}|-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-bkmv="${k}|1" ${i === c.order.length - 1 ? 'disabled' : ''}>▼</button></span></div>`).join('')}</div>
      <label>Levels per side <select data-bklevels="1">${[5, 8, 13, 20].map(n => `<option${n === c.levels ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>On top <select data-bktop="1"><option value="asks"${c.bidsTop ? '' : ' selected'}>Sells (asks)</option><option value="bids"${c.bidsTop ? ' selected' : ''}>Buys (bids)</option></select></label>
      <span class="bkCols">Columns <label><input type="checkbox" data-bkcol="amount" ${c.amount ? 'checked' : ''}> amount</label><label><input type="checkbox" data-bkcol="total" ${c.total ? 'checked' : ''}> total</label></span>`;
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
    this._last = d;
    const c = this.cfg(), n = c.levels;
    const bids = d.bids.slice(0, n).map(x => [+x[0], +x[1]]);
    const asks = d.asks.slice(0, n).map(x => [+x[0], +x[1]]);
    let maxTot = 1;
    for (const [p, q] of bids) maxTot = Math.max(maxTot, p * q);
    for (const [p, q] of asks) maxTot = Math.max(maxTot, p * q);
    /* the side next to the spread always holds the best price */
    this.asksEl.innerHTML = (c.bidsTop ? asks : asks.slice().reverse()).map(([p, q]) => this.row(p, q, p * q / maxTot, 'ask')).join('');
    this.bidsEl.innerHTML = (c.bidsTop ? bids.slice().reverse() : bids).map(([p, q]) => this.row(p, q, p * q / maxTot, 'bid')).join('');
    if (bids[0] && asks[0]){
      const sp = asks[0][0] - bids[0][0];
      this.spreadEl.textContent = 'Spread ' + fmtPrice(sp) + '  ·  ' + (sp / asks[0][0] * 100).toFixed(3) + '%';
    }
  },

  row(p, q, frac, side){
    return `<div class="brow ${side}"><i style="width:${Math.min(100, frac * 100).toFixed(1)}%"></i>` +
      `<span>${fmtPrice(p)}</span><span class="bkAmt">${q < 1 ? q.toFixed(5) : q.toFixed(3)}</span><span class="bkTot">${fmtNum(p * q)}</span></div>`;
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
