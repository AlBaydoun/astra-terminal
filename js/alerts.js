/* ASTRA Terminal — price alerts (local, with sound + notification + toast) */
const Alerts = {
  list: lsGet('astra_alerts', []),

  /* ⚙ the alerts your way: order (by hand — drag or ▲▼ — or sorted) and where fired ones go */
  CFG_KEY: 'astra_alertcfg',
  SORTS: [['newest', 'Newest first'], ['hand', 'By hand (drag, or ▲▼)'], ['oldest', 'Oldest first'], ['closest', 'Closest to its price first'], ['symbol', 'By instrument'], ['armed', 'Armed first']],
  FIRED: [['mixed', 'In the list'], ['bottom', 'At the bottom'], ['hide', 'Hidden']],
  cfg(){ const c = lsGet(this.CFG_KEY, {}) || {}; return { sort: c.sort || 'newest', fired: c.fired || 'mixed', order: c.order || [] }; },
  saveCfg(c){ lsSet(this.CFG_KEY, c); this.render(); this.cfgView(); },
  dist(a){ const t = STORE.tickers.get(a.symbol); return t && t.last ? Math.abs(a.price - t.last) / t.last : Infinity; },
  ordered(){
    const c = this.cfg(), L = this.list.slice(), by = {
      newest: (a, b) => b.id - a.id, oldest: (a, b) => a.id - b.id,
      hand: (a, b) => { const i = c.order.indexOf(a.id), j = c.order.indexOf(b.id); return (i < 0 ? -1 : i) - (j < 0 ? -1 : j) || b.id - a.id; },
      closest: (a, b) => this.dist(a) - this.dist(b), symbol: (a, b) => a.symbol.localeCompare(b.symbol) || a.price - b.price,
      armed: (a, b) => (b.active ? 1 : 0) - (a.active ? 1 : 0) || b.id - a.id,
    }[c.sort] || ((a, b) => b.id - a.id);
    let out = L.sort(by);
    if (c.fired === 'bottom') out = out.filter(a => a.active).concat(out.filter(a => !a.active));
    if (c.fired === 'hide') out = out.filter(a => a.active);
    return out;
  },
  moveTo(id, target, after){
    const cur = this.ordered().map(a => a.id), i = cur.indexOf(id); if (i < 0) return;
    cur.splice(i, 1); let j = cur.indexOf(target); if (j < 0) j = cur.length; cur.splice(after ? j + 1 : j, 0, id);
    /* alerts hidden by the "fired" choice keep their place at the end */
    for (const a of this.list) if (!cur.includes(a.id)) cur.push(a.id);
    const c = this.cfg(); c.order = cur; c.sort = 'hand'; this.saveCfg(c);
  },
  step(id, d){ const cur = this.ordered().map(a => a.id), i = cur.indexOf(id), j = i + d; if (i < 0 || j < 0 || j >= cur.length) return; this.moveTo(id, cur[j], d > 0); },
  cfgView(){
    const box = document.getElementById('alertCfgBox'), btn = document.getElementById('alertCfg'); if (!box) return;
    box.hidden = !this.cfgOpen; if (btn) btn.classList.toggle('on', !!this.cfgOpen);
    if (!this.cfgOpen){ box.innerHTML = ''; return; }
    const c = this.cfg(), fired = this.list.filter(a => !a.active).length, opt = (L, v) => L.map(([k, t]) => `<option value="${k}"${k === v ? ' selected' : ''}>${esc(t)}</option>`).join('');
    box.innerHTML = `<label>Order <select data-alsort="1">${opt(this.SORTS, c.sort)}</select></label>
      <label>Fired alerts <select data-alfired="1">${opt(this.FIRED, c.fired)}</select></label>
      <button class="bMini" data-alclear="1"${fired ? '' : ' disabled'}>Delete all fired (${fired})</button>
      <small>${c.sort === 'hand' ? 'Drag an alert up or down, or use the ▲▼ that appear when you point at it.' : 'Choose “By hand” to arrange the alerts yourself.'} Hiding fired alerts never deletes them.</small>`;
  },

  init(){
    this.host = document.getElementById('alertsBody');
    document.getElementById('alertCfg')?.addEventListener('click', () => { this.cfgOpen = !this.cfgOpen; this.cfgView(); });
    const box = document.getElementById('alertCfgBox');
    box?.addEventListener('change', e => {
      const t = e.target, c = this.cfg();
      if (t.dataset.alsort){ if (t.value === 'hand' && c.sort !== 'hand') c.order = this.ordered().map(a => a.id); c.sort = t.value; }
      else if (t.dataset.alfired) c.fired = t.value; else return;
      this.saveCfg(c);
    });
    box?.addEventListener('click', e => {
      if (!e.target.closest('[data-alclear]')) return;
      const n = this.list.filter(a => !a.active).length; if (!n) return;
      if (!confirm('Delete all ' + n + ' fired alert' + (n === 1 ? '' : 's') + '? Armed alerts are kept.')) return;
      this.list = this.list.filter(a => a.active); this.save(); this.cfgView();
    });
    document.getElementById('alertNew').addEventListener('click', () => this.openModal());
    document.getElementById('alCreate').addEventListener('click', () => this.create());
    BUS.on('tickers', ch => this.check(ch));
    this.render();
  },

  openModal(prefPrice, symbol){
    this.modalSym = symbol || STORE.symbol;
    const t = STORE.tickers.get(this.modalSym);
    document.getElementById('alSym').textContent = baseAsset(this.modalSym) + '/USDT';
    document.getElementById('alPrice').value = prefPrice != null ? prefPrice : (t ? t.last : '');
    document.getElementById('alCond').value = 'auto';
    App.showModal('alertModal');
    setTimeout(() => document.getElementById('alPrice').select(), 60);
  },

  create(){
    const sym = this.modalSym || STORE.symbol;
    const price = parseFloat(document.getElementById('alPrice').value);
    if (!(price > 0)){ toast('Enter a valid price', 'warn'); return; }
    const t = STORE.tickers.get(sym);
    let cond = document.getElementById('alCond').value;
    if (cond === 'auto') cond = (t && price >= t.last) ? 'above' : 'below';
    this.list.push({ id: Date.now(), symbol: sym, price, cond, active: true, created: Date.now() });
    this.save();
    App.hideModal('alertModal');
    if (window.Notification && Notification.permission === 'default'){
      try { Notification.requestPermission(); } catch(e){}
    }
    toast('Alert set: ' + baseAsset(sym) + ' ' + (cond === 'above' ? '≥ ' : '≤ ') + fmtPrice(price), 'ok');
  },

  save(){
    lsSet('astra_alerts', this.list);
    this.render();
    if (typeof Chart !== 'undefined' && Chart.priceSeries) Chart.renderAlertLines();
  },

  check(changed){
    let fired = false;
    for (const a of this.list){
      if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(a.symbol)) continue;
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
    else if (this.cfg().sort === 'closest' && Date.now() - (this._rAt || 0) > 5000 && this.host && this.host.offsetParent){ this._rAt = Date.now(); this.render(); }
  },

  render(){
    if (!this.host) return;
    if (!this.list.length){
      this.host.innerHTML = '<div class="empty">No alerts yet.<br>Use the bell tool on the chart<br>or the + button above.</div>';
      return;
    }
    this.host.innerHTML = '';
    const shown = this.ordered(), hand = this.cfg().sort === 'hand';
    if (!shown.length) this.host.innerHTML = '<div class="empty">Every alert has fired and fired alerts are hidden — see ⚙.</div>';
    shown.forEach(a => {
      const t = STORE.tickers.get(a.symbol);
      const div = document.createElement('div');
      div.className = 'alrow' + (a.active ? '' : ' done');
      if (hand){
        div.draggable = true;
        div.addEventListener('dragstart', e => { this._drag = a.id; div.classList.add('wDragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(a.id)); } catch(err){} });
        div.addEventListener('dragend', () => { this._drag = null; div.classList.remove('wDragging'); this.host.querySelectorAll('.wDropAbove,.wDropBelow').forEach(r => r.classList.remove('wDropAbove', 'wDropBelow')); });
        div.addEventListener('dragover', e => { if (this._drag == null || this._drag === a.id) return; e.preventDefault(); const r = div.getBoundingClientRect(), below = e.clientY > r.top + r.height / 2; div.classList.toggle('wDropBelow', below); div.classList.toggle('wDropAbove', !below); });
        div.addEventListener('dragleave', () => div.classList.remove('wDropAbove', 'wDropBelow'));
        div.addEventListener('drop', e => { e.preventDefault(); const below = div.classList.contains('wDropBelow'); div.classList.remove('wDropAbove', 'wDropBelow'); if (this._drag != null && this._drag !== a.id) this.moveTo(this._drag, a.id, below); });
      }
      div.innerHTML =
        `<div class="altop"><b>${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(a.symbol,a.symbol):esc(a.symbol)}</b> <span class="${a.cond === 'above' ? 'up' : 'down'}">${a.cond === 'above' ? '≥' : '≤'} ${fmtPrice(a.price)}</span></div>` +
        `<div class="alsub">${a.active ? 'armed · now ' + (t ? fmtPrice(t.last) : '—') : 'fired ' + new Date(a.firedAt).toLocaleString()}</div>` +
        `<div class="alacts">${hand ? '<button data-act="up" title="Move up">▲</button><button data-act="down" title="Move down">▼</button>' : ''}${a.active ? '' : '<button data-act="rearm">Re-arm</button>'}<button data-act="del">Delete</button></div>`;
      div.addEventListener('click', e => {
        const act = e.target.dataset ? e.target.dataset.act : null;
        if (act === 'del'){ this.list = this.list.filter(x => x.id !== a.id); this.save(); }
        if (act === 'rearm'){ a.active = true; this.save(); }
        if (act === 'up' || act === 'down') this.step(a.id, act === 'up' ? -1 : 1);
      });
      this.host.appendChild(div);
    });
  },
};
