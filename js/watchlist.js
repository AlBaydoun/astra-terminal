/* ASTRA Terminal — watchlist with live prices + sparklines */
const Watch = {
  list: lsGet('astra_watch', CFG.WATCH_DEFAULT),
  sparkData: {},
  rows: null,

  init(){
    this.el = document.getElementById('watchBody');
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
    this.render();
  },

  render(){
    BUS.emit('watch');
    this.el.innerHTML = '';
    this.rows = {};
    for (const sym of this.list){
      const row = document.createElement('div');
      row.className = 'wrow' + (sym === STORE.symbol ? ' sel' : '');
      row.innerHTML =
        `<div class="wico" style="--hue:${this.hue(sym)}">${esc(baseAsset(sym).slice(0, 4))}</div>` +
        `<div class="wname"><b>${esc(baseAsset(sym))}</b><span>${esc(typeof MK !== 'undefined' ? MK.sub(sym) : 'USDT')}</span></div>` +
        `<canvas class="wspark" width="70" height="26"></canvas>` +
        `<div class="wpx"><b class="wlast"></b><span class="wpct"></span></div>` +
        `<button class="wdel" title="Remove">×</button>`;
      row.addEventListener('click', e => {
        if (e.target.classList.contains('wdel')){ this.remove(sym); return; }
        App.setSymbol(sym);
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
