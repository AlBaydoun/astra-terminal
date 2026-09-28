/* ASTRA Terminal — watchlist with live prices + sparklines */
const Watch = {
  list: lsGet('astra_watch', CFG.WATCH_DEFAULT),
  sparkData: {},
  rows: null,

  /* ⚙ the watchlist your way: order (by hand — drag or ▲▼ — or sorted) and what a row shows */
  CFG_KEY: 'astra_watchcfg',
  SORTS: [['hand', 'By hand (drag a row, or ▲▼)'], ['az', 'A → Z'], ['best', 'Best today first'], ['worst', 'Worst today first'], ['group', 'By market (crypto, forex, metals…)']],
  cfg(){ const c = lsGet(this.CFG_KEY, {}) || {}; return { sort: c.sort || 'hand', spark: c.spark !== false, sub: c.sub !== false }; },
  saveCfg(c){ lsSet(this.CFG_KEY, c); this.render(); this.cfgView(); },
  cfgView(){
    const box = document.getElementById('watchCfgBox'), btn = document.getElementById('watchCfg');
    if (!box) return;
    box.hidden = !this.cfgOpen; if (btn) btn.classList.toggle('on', !!this.cfgOpen);
    if (!this.cfgOpen){ box.innerHTML = ''; return; }
    const c = this.cfg();
    box.innerHTML = `<label>Order <select data-wcsort="1">${this.SORTS.map(([v, t]) => `<option value="${v}"${v === c.sort ? ' selected' : ''}>${esc(t)}</option>`).join('')}</select></label>
      <span class="wcShow">Show <label><input type="checkbox" data-wcshow="spark" ${c.spark ? 'checked' : ''}> mini chart</label><label><input type="checkbox" data-wcshow="sub" ${c.sub ? 'checked' : ''}> name line</label></span>
      <small>${c.sort === 'hand' ? 'Drag a row up or down, or use the ▲▼ that appear when you point at it.' : 'Sorted automatically. Choose “By hand” to arrange it yourself — your own order is kept.'}</small>`;
  },
  /* the rows in the order you chose */
  ordered(list){
    const c = this.cfg(), t = s => (STORE.tickers.get(s) || {}).pct;
    const num = v => Number.isFinite(v) ? v : null;
    if (c.sort === 'az') return list.slice().sort((a, b) => baseAsset(a).localeCompare(baseAsset(b)));
    if (c.sort === 'best' || c.sort === 'worst'){ const d = c.sort === 'best' ? -1 : 1; return list.slice().sort((a, b) => { const x = num(t(a)), y = num(t(b)); if (x == null) return 1; if (y == null) return -1; return d * (x - y); }); }
    if (c.sort === 'group' && typeof MK !== 'undefined' && MK.group){ const g = s => { try { return String(MK.group(s) || 'zz'); } catch(e){ return 'zz'; } }; return list.slice().sort((a, b) => g(a).localeCompare(g(b)) || list.indexOf(a) - list.indexOf(b)); }
    return list;
  },
  /* moving a row writes the new order into the list itself (instruments you only
     monitor from Market settings become part of it, in the place you put them) */
  moveTo(sym, target, after){
    const vis = this.visible().slice();
    const i = vis.indexOf(sym); if (i < 0) return;
    vis.splice(i, 1);
    let j = target == null ? vis.length : vis.indexOf(target); if (j < 0) j = vis.length;
    vis.splice(after ? j + 1 : j, 0, sym);
    this.list = vis; lsSet('astra_watch', this.list);
    const c = this.cfg(); if (c.sort !== 'hand'){ c.sort = 'hand'; lsSet(this.CFG_KEY, c); this.cfgView(); }
    this.render();
  },
  step(sym, d){ const vis = this.ordered(this.visible()); const i = vis.indexOf(sym), j = i + d; if (i < 0 || j < 0 || j >= vis.length) return; this.moveTo(sym, vis[j], d > 0); },
  visible(){
    return typeof MarketSources === 'undefined' ? this.list
      : [...new Set([...this.list, ...MK.monitored])].filter(s => MarketSources.allowed(s));
  },

  init(){
    this.el = document.getElementById('watchBody');
    document.getElementById('watchCfg')?.addEventListener('click', () => { this.cfgOpen = !this.cfgOpen; this.cfgView(); });
    document.getElementById('watchCfgBox')?.addEventListener('change', e => {
      const t = e.target, c = this.cfg();
      if (t.dataset.wcsort){ if (t.value === 'hand' && c.sort !== 'hand'){ this.list = this.ordered(this.visible()); lsSet('astra_watch', this.list); } c.sort = t.value; }
      else if (t.dataset.wcshow) c[t.dataset.wcshow] = t.checked;
      else return;
      this.saveCfg(c);
    });
    BUS.on('tickers', ch => this.update(ch));
    BUS.on('symbol', () => this.highlight());
    document.getElementById('watchAdd').addEventListener('click', () => SymbolSearch.open(sym => this.add(sym)));
    this.render();
  },

  hue(sym){ let h = 0; for (const ch of sym) h = (h * 31 + ch.charCodeAt(0)) % 360; return h; },

  add(sym){
    if (!this.list.includes(sym)){
      this.list.push(sym);
      lsSet('astra_watch', this.list);
      this.render();
      toast(baseAsset(sym) + ' added to watchlist', 'ok');
    }
  },
  remove(sym){
    this.list = this.list.filter(s => s !== sym);
    lsSet('astra_watch', this.list);
    if (typeof MarketSources !== 'undefined' && MK.monitored.includes(sym)){
      MK.monitored = MK.monitored.filter(s => s !== sym);
      lsSet('astra_monitored', MK.monitored);
    }
    this.render();
  },

  render(){
    if (!this.el) return;
    BUS.emit('watch');
    this.el.innerHTML = '';
    this.rows = {};
    const visible = this.ordered(this.visible()), C = this.cfg(), hand = C.sort === 'hand';
    this.el.classList.toggle('wNoSpark', !C.spark); this.el.classList.toggle('wNoSub', !C.sub);
    if (!visible.length) this.el.innerHTML = '<div class="empty">No enabled instruments in your watchlist. Add a JustMarkets instrument with +, or check the bridge in Market settings.</div>';
    for (const sym of visible){
      const row = document.createElement('div');
      row.className = 'wrow' + (sym === STORE.symbol ? ' sel' : '');
      row.innerHTML =
        `<div class="wico" style="--hue:${this.hue(sym)}">${esc(baseAsset(sym).slice(0, 4))}</div>` +
        `<div class="wname"><b>${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(sym):esc(baseAsset(sym))}</b><span>${esc(typeof MK !== 'undefined' ? MK.sub(sym) : 'USDT')}</span></div>` +
        `<canvas class="wspark" width="70" height="26"></canvas>` +
        `<div class="wpx"><b class="wlast"></b><span class="wpct"></span></div>` +
        (hand ? `<span class="wmv"><button data-wmv="-1" title="Move up">▲</button><button data-wmv="1" title="Move down">▼</button></span>` : '') +
        `<button class="wdel" title="Remove">×</button>`;
      if (hand){
        row.draggable = true; row.dataset.sym = sym;
        row.addEventListener('dragstart', e => { this._drag = sym; row.classList.add('wDragging'); try { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', sym); } catch(err){} });
        row.addEventListener('dragend', () => { this._drag = null; row.classList.remove('wDragging'); this.el.querySelectorAll('.wDropAbove,.wDropBelow').forEach(r => r.classList.remove('wDropAbove', 'wDropBelow')); });
        row.addEventListener('dragover', e => { if (!this._drag || this._drag === sym) return; e.preventDefault(); const r = row.getBoundingClientRect(), below = e.clientY > r.top + r.height / 2; row.classList.toggle('wDropBelow', below); row.classList.toggle('wDropAbove', !below); });
        row.addEventListener('dragleave', () => row.classList.remove('wDropAbove', 'wDropBelow'));
        row.addEventListener('drop', e => { e.preventDefault(); const below = row.classList.contains('wDropBelow'); row.classList.remove('wDropAbove', 'wDropBelow'); if (this._drag && this._drag !== sym) this.moveTo(this._drag, sym, below); });
      }
      row.addEventListener('click', e => {
        const mv = e.target.closest('[data-wmv]'); if (mv){ e.stopPropagation(); this.step(sym, +mv.dataset.wmv); return; }
        if (e.target.classList.contains('wdel')){ this.remove(sym); return; }
        (typeof WorkspaceUI!=='undefined'?WorkspaceUI.openChart(sym):App.setSymbol(sym));
      });
      this.el.appendChild(row);
      this.rows[sym] = row;
      this.update([sym]);
      this.spark(sym, row.querySelector('.wspark'));
    }
  },

  update(changed){
    if (!this.rows) return;
    for (const sym of changed){
      const row = this.rows[sym];
      if (!row) continue;
      const t = STORE.tickers.get(sym);
      if (!t) continue;
      const lastEl = row.querySelector('.wlast'), pctEl = row.querySelector('.wpct');
      const prev = parseFloat(lastEl.dataset.v || '0');
      lastEl.textContent = fmtPrice(t.last);
      lastEl.dataset.v = t.last;
      if (prev && t.last !== prev){
        lastEl.classList.remove('flashUp', 'flashDown');
        void lastEl.offsetWidth;
        lastEl.classList.add(t.last > prev ? 'flashUp' : 'flashDown');
      }
      pctEl.textContent = fmtPct(t.pct);
      pctEl.className = 'wpct ' + pctClass(t.pct);
      if (typeof Feed !== 'undefined'){
        const st = Feed.status(sym);
        if (st.cls !== 'live'){
          lastEl.classList.add('stale');
          lastEl.title = st.tip;
        } else { lastEl.classList.remove('stale'); lastEl.title = ''; }
      }
    }
  },

  async spark(sym, cv){
    try {
      const d = this.sparkData[sym] || (this.sparkData[sym] = await API.klines(sym, '1h', 42));
      const ctx = cv.getContext('2d');
      const vals = d.map(c => c.close);
      const min = Math.min(...vals), max = Math.max(...vals), rng = (max - min) || 1;
      const up = vals[vals.length - 1] >= vals[0];
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = i / (vals.length - 1) * cv.width;
        const y = cv.height - 2 - ((v - min) / rng) * (cv.height - 4);
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      });
      ctx.strokeStyle = up ? CFG.UP : CFG.DOWN;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.lineTo(cv.width, cv.height); ctx.lineTo(0, cv.height); ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, 0, cv.height);
      g.addColorStop(0, up ? 'rgba(46,189,133,0.25)' : 'rgba(246,70,93,0.25)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fill();
    } catch(e){}
  },

  highlight(){
    if (!this.rows) return;
    Object.entries(this.rows).forEach(([s, r]) => r.classList.toggle('sel', s === STORE.symbol));
  },
};
