/* ASTRA Terminal — price alerts (local, with sound + notification + toast) */
const Alerts = {
  list: lsGet('astra_alerts', []),

  init(){
    this.host = document.getElementById('alertsBody');
    document.getElementById('alertNew').addEventListener('click', () => this.openModal());
    document.getElementById('alCreate').addEventListener('click', () => this.create());
    BUS.on('tickers', ch => this.check(ch));
    this.render();
  },

  openModal(prefPrice){
    const t = STORE.tickers.get(STORE.symbol);
    document.getElementById('alSym').textContent = baseAsset(STORE.symbol) + '/USDT';
    document.getElementById('alPrice').value = prefPrice != null ? prefPrice : (t ? t.last : '');
    document.getElementById('alCond').value = 'auto';
    App.showModal('alertModal');
    setTimeout(() => document.getElementById('alPrice').select(), 60);
  },

  create(){
    const price = parseFloat(document.getElementById('alPrice').value);
    if (!(price > 0)){ toast('Enter a valid price', 'warn'); return; }
    const t = STORE.tickers.get(STORE.symbol);
    let cond = document.getElementById('alCond').value;
    if (cond === 'auto') cond = (t && price >= t.last) ? 'above' : 'below';
    this.list.push({ id: Date.now(), symbol: STORE.symbol, price, cond, active: true, created: Date.now() });
    this.save();
    App.hideModal('alertModal');
    if (window.Notification && Notification.permission === 'default'){
      try { Notification.requestPermission(); } catch(e){}
    }
    toast('Alert set: ' + baseAsset(STORE.symbol) + ' ' + (cond === 'above' ? '≥ ' : '≤ ') + fmtPrice(price), 'ok');
  },

  save(){
    lsSet('astra_alerts', this.list);
    this.render();
    if (typeof Chart !== 'undefined' && Chart.priceSeries) Chart.renderAlertLines();
  },

  check(changed){
    let fired = false;
    for (const a of this.list){
      if (!a.active || changed.indexOf(a.symbol) === -1) continue;
      const t = STORE.tickers.get(a.symbol);
      if (!t) continue;
      if ((a.cond === 'above' && t.last >= a.price) || (a.cond === 'below' && t.last <= a.price)){
        a.active = false;
        a.firedAt = Date.now();
        fired = true;
        const msg = a.symbol + (a.cond === 'above' ? ' crossed above ' : ' dropped below ') + fmtPrice(a.price) + ' — now ' + fmtPrice(t.last);
        toast('⏰ ' + msg, 'alert');
        beep();
        try { if (Notification.permission === 'granted') new Notification('ASTRA price alert', { body: msg }); } catch(e){}
      }
    }
    if (fired) this.save();
  },

  render(){
    if (!this.host) return;
    if (!this.list.length){
      this.host.innerHTML = '<div class="empty">No alerts yet.<br>Use the bell tool on the chart<br>or the + button above.</div>';
      return;
    }
    this.host.innerHTML = '';
    [...this.list].reverse().forEach(a => {
      const t = STORE.tickers.get(a.symbol);
      const div = document.createElement('div');
      div.className = 'alrow' + (a.active ? '' : ' done');
      div.innerHTML =
        `<div class="altop"><b>${esc(a.symbol)}</b> <span class="${a.cond === 'above' ? 'up' : 'down'}">${a.cond === 'above' ? '≥' : '≤'} ${fmtPrice(a.price)}</span></div>` +
        `<div class="alsub">${a.active ? 'armed · now ' + (t ? fmtPrice(t.last) : '—') : 'fired ' + new Date(a.firedAt).toLocaleString()}</div>` +
        `<div class="alacts">${a.active ? '' : '<button data-act="rearm">Re-arm</button>'}<button data-act="del">Delete</button></div>`;
      div.addEventListener('click', e => {
        const act = e.target.dataset ? e.target.dataset.act : null;
        if (act === 'del'){ this.list = this.list.filter(x => x.id !== a.id); this.save(); }
        if (act === 'rearm'){ a.active = true; this.save(); }
      });
      this.host.appendChild(div);
    });
  },
};
