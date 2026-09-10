/* ASTRA Terminal — multi-chart layouts: 1 main chart + up to 3 mini charts.

   A mini is a REAL chart, not a thumbnail. It carries its own indicators drawn
   from the same catalogue the main chart uses (INDS), its own right-click menu,
   and its own live feed routed exactly like the main chart — MT5 bridge,
   Binance stream, or polled — so a broker symbol ticks here too.

   Each mini keeps its own indicator settings. A brand-new mini starts by
   showing exactly what the main chart shows, which is what you expect when you
   split the screen; from then on the two are independent. */
const Multi = {
  layout: parseInt(localStorage.getItem('astra_layout'), 10) || 1,
  minis: lsGet('astra_minis', [
    { sym: 'ETHUSDT', tf: '1h' },
    { sym: 'SOLUSDT', tf: '1h' },
    { sym: 'BNBUSDT', tf: '1h' },
  ]),
  cells: [],
  menuCell: null,
  pickCell: null,

  init(){
    this.grid = document.getElementById('chartGrid');
    document.querySelectorAll('#layoutSeg button').forEach(b =>
      b.addEventListener('click', () => this.setLayout(parseInt(b.dataset.l, 10))));
    BUS.on('tickers', ch => this.tick(ch));
    this.bindLegend();
    this.bindPicker();
    if (this.layout > 1) this.setLayout(this.layout);
    else this.markActive();
  },

  markActive(){
    document.querySelectorAll('#layoutSeg button').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.l, 10) === this.layout));
  },

  setLayout(n){
    this.layout = n;
    localStorage.setItem('astra_layout', n);
    this.grid.className = 'layout-' + n;
    this.markActive();
    this.cells.forEach(c => this.destroyCell(c));
    this.cells = [];
    for (let i = 0; i < n - 1; i++) this.createCell(i);
  },

  /* ---------------- indicator settings, one set per mini ---------------- */

  /* whatever the main chart is showing right now, as a starting point */
  fromMain(){
    const out = {};
    for (const d of INDS){
      const c = Chart.settings[d.id];
      if (c && c.on) out[d.id] = JSON.parse(JSON.stringify(c));
    }
    return out;
  },

  /* layouts saved before this version only knew a single EMA switch */
  indsOf(conf){
    if (conf.inds) return conf.inds;
    if (conf.ema) return {
      ema1: Object.assign({}, IND_BY_ID.ema1.def, { on: true }),
      ema2: Object.assign({}, IND_BY_ID.ema2.def, { on: true }),
    };
    return this.fromMain();
  },

  cfgOf(cell, def){ return Object.assign({}, def.def, cell.inds[def.id] || {}); },
  activeDefs(cell){ return INDS.filter(d => !d.mainOnly && cell.inds[d.id] && cell.inds[d.id].on); },

  symLabel(sym){
    if (typeof MK !== 'undefined' && !MK.isCrypto(sym)) return baseAsset(sym);
    return baseAsset(sym) + '/USDT';
  },

  /* ---------------- one mini chart ---------------- */

  createCell(i){
    const conf = this.minis[i] || { sym: 'ETHUSDT', tf: '1h' };
    const el = document.createElement('div');
    el.className = 'miniCell';
    el.innerHTML =
      `<div class="miniHead">` +
      `<button class="miniSym"><b></b><span class="miniPx"></span><span class="miniPct"></span></button>` +
      `<button class="miniEma miniFx" title="Indicators on this chart">&fnof;x</button>` +
      `<select class="miniTf">${CFG.TFS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>` +
      `<span class="chartTradeActions"><button class="buy miniBuy" title="Prepare manual buy">Buy</button><button class="sell miniSell" title="Prepare manual sell">Sell</button></span></div><div class="miniLegend"></div><div class="miniChart"></div>`;
    this.grid.appendChild(el);

    const chart = LightweightCharts.createChart(el.querySelector('.miniChart'), Chart.chartOpts());
    const price = chart.addCandlestickSeries({
      upColor: CFG.UP, downColor: CFG.DOWN, wickUpColor: CFG.UP, wickDownColor: CFG.DOWN, borderVisible: false,
    });
    const cell = {
      i, sym: conf.sym, tf: conf.tf, el, chart, price,
      inds: this.indsOf(conf), series: {}, specs: {},
      sock: null, quoteTimer: null, pollTimer: null, data: [],
    };

    el.querySelector('.miniSym').addEventListener('click', () =>
      SymbolSearch.open(sym => { cell.sym = sym; this.saveMinis(); this.loadCell(cell); }));
    el.querySelector('.miniBuy').addEventListener('click',()=>WorkspaceUI.openManual(cell.sym,1,cell.tf));
    el.querySelector('.miniSell').addEventListener('click',()=>WorkspaceUI.openManual(cell.sym,-1,cell.tf));
    el.querySelector('.miniFx').addEventListener('click', () => this.openPicker(cell));
    const tfSel = el.querySelector('.miniTf');
    tfSel.value = conf.tf;
    tfSel.addEventListener('change', () => { cell.tf = tfSel.value; this.saveMinis(); this.loadCell(cell); });

    /* the right-click menu, same one the main chart uses */
    el.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();
      this.openMenu(cell, e.clientX, e.clientY);
    });
    chart.subscribeCrosshairMove(p => this.renderLegend(cell, p && p.time != null ? p.time : null));

    this.cells.push(cell);
    this.loadCell(cell);
  },

  destroyCell(cell){
    this.stopFeed(cell);
    try { cell.chart.remove(); } catch(e){}
    cell.el.remove();
  },

  /* only the charts that are open right now get written — the ones a smaller
     layout has hidden keep the symbol and indicators they had, so going 4 → 2 → 4
     brings them back instead of resetting them */
  saveMinis(){
    const out = this.minis.slice();
    for (const c of this.cells) out[c.i] = { sym: c.sym, tf: c.tf, inds: c.inds };
    this.minis = out;
    lsSet('astra_minis', this.minis);
  },

  /* ---------------- indicators on a mini ----------------
     The mini has no extra windows, so an oscillator gets its own strip along
     the bottom and the price is squeezed into what is left. */
  renderInds(cell, tickOnly){
    const v = cell.data;
    if (!v.length) return;
    const ctx = {
      v, closes: v.map(c => c.close),
      line: arr => Chart.lineData(arr, v),
      srcOf: cfg => IND.src(v, cfg.src || 'close'),
    };
    const defs = this.activeDefs(cell);
    const oscs = defs.filter(d => d.kind === 'osc' && d.id !== 'vol');
    const band = oscs.length ? Math.min(0.5, 0.17 * oscs.length) : 0;
    try {
      cell.chart.priceScale('right').applyOptions({
        scaleMargins: { top: 0.06, bottom: Math.max(0.06, band) } });
    } catch(e){}

    const alive = {}, bands = [];
    cell.specs = {};
    for (const def of defs){
      const cfg = this.cfgOf(cell, def);
      let specs;
      try { specs = def.build(ctx, cfg) || []; } catch(e){ continue; }

      const chosen = cfg.colors || {};
      for (const spec of specs){
        const part = (def.parts || []).find(p => p.key === spec.key);
        spec.color = chosen[spec.key] || spec.color || (part && part.color) || def.color;
        if (cfg.width) spec.width = cfg.width;
        if (cfg.style != null && spec.lineStyle == null) spec.lineStyle = cfg.style;
      }
      cell.specs[def.id] = { def, cfg, specs };

      /* which strip of the chart this indicator lives in */
      let scale;
      if (def.id === 'vol') scale = { id: 'vol', margins: { top: 0.86, bottom: 0 } };
      else if (def.kind === 'osc'){
        const j = oscs.indexOf(def), h = band / oscs.length;
        scale = { id: 'mo_' + def.id, margins: { top: 1 - band + j * h, bottom: band - (j + 1) * h } };
      } else scale = { id: 'right' };
      if (scale.margins) bands.push(scale);

      for (const spec of specs){
        const id = def.id + '|' + spec.key;
        if (cfg.hidden && cfg.hidden[spec.key]) continue;
        if (!spec.data || !spec.data.length) continue;
        alive[id] = true;
        let entry = cell.series[id];
        if (entry && entry.scaleId !== scale.id){
          try { cell.chart.removeSeries(entry.s); } catch(e){}
          entry = null;
        }
        const look = [spec.color, spec.width || 1, spec.lineStyle || 0, spec.dots ? 1 : 0].join('|');
        if (!entry){
          try {
            entry = cell.series[id] =
              { s: Chart.makeSeries(cell.chart, spec, 'mini', def, scale), scaleId: scale.id, look };
            entry.s.setData(spec.data);
          } catch(e){ delete cell.series[id]; }
          continue;
        }
        if (entry.look !== look){
          entry.look = look;
          try {
            entry.s.applyOptions(spec.type === 'hist' ? { color: spec.color } : {
              color: spec.color, lineWidth: spec.width || 1, lineStyle: spec.lineStyle || 0,
              lineVisible: !spec.dots, pointMarkersVisible: !!spec.dots, pointMarkersRadius: spec.radius || 1.6,
            });
          } catch(e){}
        }
        if (tickOnly){
          const last = spec.data[spec.data.length - 1];
          if (last) { try { entry.s.update(last); } catch(e){} }
        } else {
          try { entry.s.setData(spec.data); } catch(e){}
        }
      }
    }
    /* take away what is no longer switched on */
    for (const id of Object.keys(cell.series)){
      if (alive[id]) continue;
      try { cell.chart.removeSeries(cell.series[id].s); } catch(e){}
      delete cell.series[id];
    }
    /* the strips are re-measured on EVERY render, not just when a series is
       created — adding a second oscillator has to move the first one up */
    for (const b of bands)
      try { cell.chart.priceScale(b.id).applyOptions({ scaleMargins: b.margins }); } catch(e){}
    this.renderLegend(cell);
  },

  /* live values above the chart — click a name to edit it, the × takes it off */
  renderLegend(cell, time){
    const host = cell.el.querySelector('.miniLegend');
    if (!host) return;
    const out = [];
    for (const def of INDS){
      const c = cell.specs[def.id];
      if (!c) continue;
      const vals = c.specs.map(sp =>
        `<b style="color:${sp.color}">${esc(Chart.fmtInd(Chart.valueAt(sp.data, time)))}</b>`).join(' ');
      out.push(`<span class="ilg" data-mind="${def.id}" data-mcell="${cell.i}" title="Click to edit ${esc(def.label)}">` +
        `<i style="color:${c.specs[0] ? c.specs[0].color : 'inherit'}">` +
        `${esc(def.label)}${esc(Chart.paramText(def, c.cfg))}</i> ${vals}` +
        `<b class="ilgX" data-mindoff="${def.id}" data-mcell="${cell.i}" title="Remove from this chart">×</b></span>`);
    }
    host.innerHTML = out.join('');
  },

  cellByIndex(i){ return this.cells.find(c => c.i === +i) || null; },

  bindLegend(){
    if (this._legendBound) return;
    this._legendBound = true;
    document.addEventListener('click', e => {
      const off = e.target.closest && e.target.closest('[data-mindoff]');
      if (off){
        e.stopPropagation();
        const cell = this.cellByIndex(off.dataset.mcell);
        if (cell){ delete cell.inds[off.dataset.mindoff]; this.saveMinis(); this.renderInds(cell); }
        return;
      }
      const tag = e.target.closest && e.target.closest('.ilg[data-mind]');
      if (tag){
        const cell = this.cellByIndex(tag.dataset.mcell);
        if (cell) this.openPicker(cell, tag.dataset.mind);
      }
    });
  },

  /* ---------------- right-click menu ---------------- */

  /* the handful worth reaching in one click; everything else is in the dialog */
  QUICK: ['ema1', 'ema2', 'ema3', 'bb', 'vol', 'rsi', 'macd'],

  menuItems(cell){
    const on = this.activeDefs(cell);
    const items = [
      { k: 'inds', label: 'Indicators…', icon: 'ƒ' },
      { k: 'same', label: 'Same indicators as the main chart' },
    ];
    if (on.length) items.push({ k: 'clear', label: 'Remove all indicators (' + on.length + ')', danger: true });
    items.push({ sep: true });
    for (const id of this.QUICK){
      const def = IND_BY_ID[id];
      if (!def) continue;
      const isOn = !!(cell.inds[id] && cell.inds[id].on);
      items.push({ k: 'tog:' + id, label: (isOn ? '✓ ' : '') + def.label });
    }
    items.push({ sep: true });
    items.push({ k: 'sym', label: 'Change instrument…' });
    items.push({ k: 'main', label: 'Open ' + this.symLabel(cell.sym) + ' in the main chart' });
    items.push({ sep: true });
    items.push({ k: 'fit', label: 'Reset view' });
    items.push({ k: 'reload', label: 'Reload data' });
    return items;
  },

  openMenu(cell, clientX, clientY){
    const m = document.getElementById('ctxMenu');
    if (!m) return;
    this.menuCell = cell;
    m.innerHTML = this.menuItems(cell).map(i => i.sep
      ? '<div class="cmSep"></div>'
      : `<button data-mcm="${i.k}"${i.danger ? ' class="danger"' : ''}>` +
        `<i>${i.icon || ''}</i>${esc(i.label)}</button>`).join('');
    m.classList.add('show');
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(clientX, window.innerWidth - w - 8) + 'px';
    m.style.top = Math.min(clientY, window.innerHeight - h - 8) + 'px';
    m.querySelectorAll('[data-mcm]').forEach(b => b.addEventListener('click', () => {
      m.classList.remove('show');
      this.menuAction(cell, b.dataset.mcm);
    }));
  },

  menuAction(cell, k){
    if (k.startsWith('tog:')){
      const id = k.slice(4), def = IND_BY_ID[id];
      if (!def) return;
      if (cell.inds[id] && cell.inds[id].on) delete cell.inds[id];
      else cell.inds[id] = Object.assign({}, def.def, { on: true });
      this.saveMinis();
      return this.renderInds(cell);
    }
    if (k === 'inds') return this.openPicker(cell);
    if (k === 'same'){
      cell.inds = this.fromMain();
      this.saveMinis();
      toast('Copied the main chart’s indicators', 'ok');
      return this.renderInds(cell);
    }
    if (k === 'clear'){
      cell.inds = {};
      this.saveMinis();
      return this.renderInds(cell);
    }
    if (k === 'sym')
      return SymbolSearch.open(sym => { cell.sym = sym; this.saveMinis(); this.loadCell(cell); });
    if (k === 'main') return App.setSymbol(cell.sym);
    if (k === 'fit'){
      const n = cell.data.length;
      try { cell.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 80), to: n + 4 }); } catch(e){}
      return;
    }
    if (k === 'reload') return this.loadCell(cell);
  },

  /* ---------------- the indicator dialog for one mini ---------------- */

  openPicker(cell, focusId){
    this.pickCell = cell;
    const host = document.getElementById('miniIndList');
    if (!host) return;
    document.getElementById('miniIndTitle').textContent =
      'CHART ' + (cell.i + 2) + ' · ' + this.symLabel(cell.sym);

    host.innerHTML = INDS.filter(def => !def.mainOnly).map(def => {
      const c = this.cfgOf(cell, def);
      const parts = def.parts || [];
      const params = (def.params || []).map(p => {
        const label = p.label || App.PARAM_NAMES[p.k] || p.k;
        return p.kind === 'sel'
          ? `<span class="stLine"><select class="tsel" data-mid="${def.id}" data-mk="${p.k}">` +
            p.opts.map(([v, l]) => `<option value="${v}"${v === c[p.k] ? ' selected' : ''}>${l}</option>`).join('') +
            `</select><i>${esc(label)}</i></span>`
          : `<span class="stLine"><input type="number" data-mid="${def.id}" data-mk="${p.k}" value="${c[p.k]}" ` +
            `min="${p.min}" max="${p.max}"${p.step ? ` step="${p.step}"` : ''} style="width:58px"><i>${esc(label)}</i></span>`;
      }).join('');
      const colors = parts.map(pt =>
        `<span class="stLine"><input type="color" data-mid="${def.id}" data-mck="${pt.key}" ` +
        `value="${App.toHex((c.colors || {})[pt.key] || pt.color)}"><i>${esc(pt.label)}</i></span>`).join('');
      return `<div class="indRow${focusId === def.id ? ' focus' : ''}">` +
        `<label class="main"><input type="checkbox" data-mid="${def.id}" data-mk="on"${c.on ? ' checked' : ''}>` +
        `<span class="chip" style="background:${App.toHex(parts[0] ? parts[0].color : '#3d5a80')}"></span>` +
        `${esc(def.label)}</label>` +
        `<span class="indPane inputs">${params}${colors}</span></div>`;
    }).join('');

    App.bindIndicatorSearch('miniIndModal','miniIndSearch','miniIndSearchCount');
    if (focusId){
      const row = host.querySelector('.indRow.focus');
      if (row) setTimeout(() => row.scrollIntoView({ block: 'center' }), 30);
    }
    App.showModal('miniIndModal');
  },

  bindPicker(){
    const apply = document.getElementById('miniIndApply');
    if (!apply) return;
    apply.addEventListener('click', () => {
      const cell = this.pickCell;
      if (!cell) return;
      this.readPicker(cell);
      this.saveMinis();
      App.hideModal('miniIndModal');
      this.renderInds(cell);
    });
    const same = document.getElementById('miniIndSame');
    if (same) same.addEventListener('click', () => {
      const cell = this.pickCell;
      if (!cell) return;
      cell.inds = this.fromMain();
      this.saveMinis();
      this.renderInds(cell);
      this.openPicker(cell);
    });
  },

  readPicker(cell){
    document.querySelectorAll('#miniIndList [data-mid]').forEach(el => {
      const id = el.dataset.mid, def = IND_BY_ID[id];
      if (!def) return;
      const cfg = cell.inds[id] = Object.assign({}, def.def, cell.inds[id] || {});
      if (el.dataset.mck){
        cfg.colors = cfg.colors || {};
        cfg.colors[el.dataset.mck] = el.value;
        return;
      }
      const k = el.dataset.mk;
      if (el.type === 'checkbox') cfg.on = el.checked;
      else if (el.type === 'number'){
        const v = parseFloat(el.value);
        if (!isNaN(v) && v > 0) cfg[k] = v;
      } else cfg[k] = el.value;
    });
    /* keep the saved layout small — only what is actually switched on */
    for (const id of Object.keys(cell.inds)) if (!cell.inds[id].on) delete cell.inds[id];
  },

  /* ---------------- data + live feed, routed like the main chart ---------------- */

  stopFeed(cell){
    if (cell.sock){ cell.sock.close(); cell.sock = null; }
    if (cell.quoteTimer){ clearInterval(cell.quoteTimer); cell.quoteTimer = null; }
    if (cell.pollTimer){ clearInterval(cell.pollTimer); cell.pollTimer = null; }
  },

  async loadCell(cell){
    this.stopFeed(cell);
    const request = cell.loadRequest = (cell.loadRequest || 0) + 1;
    if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(cell.sym)){
      cell.data = []; cell.price.setData([]);
      cell.el.querySelector('.miniSym b').textContent = 'Choose instrument'; return;
    }
    cell.el.querySelector('.miniSym b').textContent = this.symLabel(cell.sym);
    this.tick([cell.sym]);
    let data;
    try { data = await API.klines(cell.sym, cell.tf, 400); }
    catch(e){ if (typeof MarketSources === 'undefined' || MarketSources.allowed(cell.sym)) toast('Could not load ' + baseAsset(cell.sym), 'error'); return; }
    if (!this.cells.includes(cell) || request !== cell.loadRequest || (typeof MarketSources !== 'undefined' && !MarketSources.allowed(cell.sym))) return;
    cell.data = data;
    cell.price.setData(data.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    this.renderInds(cell);
    try { cell.chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, data.length - 80), to: data.length + 4 }); } catch(e){}
    this.startFeed(cell);
  },

  startFeed(cell){
    const route = (typeof Feed !== 'undefined') ? Feed.route(cell.sym) : { kind: 'binance', addr: cell.sym };
    if (route.kind === 'disabled') return;
    /* anything without a public stream is polled: quick price ticks and a
       slower full-candle refresh, exactly as the main chart does it */
    if (route.kind !== 'binance'){
      cell.quoteTimer = setInterval(() => this.quoteTick(cell), route.kind === 'bridge' ? 1500 : 6000);
      cell.pollTimer = setInterval(() => this.pollCell(cell), route.kind === 'bridge' ? 30000 : 90000);
      this.quoteTick(cell);
      return;
    }
    const s = (route.addr || cell.sym).toLowerCase();
    const wsTf = cell.tf === '30s' ? '1s' : cell.tf;
    cell.sock = new Sock([`${s}@kline_${wsTf}`], d => this.onKline(cell, d), 'mini' + cell.i);
  },

  async quoteTick(cell){
    if (!this.cells.includes(cell) || !cell.data.length) return;
    let q;
    try { q = (await Feed.quotes([cell.sym]))[0]; } catch(e){ return; }
    if (!q || !(q.last > 0) || !this.cells.includes(cell)) return;
    const c = cell.data[cell.data.length - 1];
    if (c.close === q.last) return;
    c.close = q.last;
    if (q.last > c.high) c.high = q.last;
    if (q.last < c.low) c.low = q.last;
    try { cell.price.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }); } catch(e){}
    this.renderInds(cell, true);
  },

  async pollCell(cell){
    const sym = cell.sym, tf = cell.tf;
    let fresh;
    try { fresh = await API.klines(sym, tf, 400); } catch(e){ return; }
    if (!this.cells.includes(cell) || cell.sym !== sym || cell.tf !== tf || !fresh.length) return;
    cell.data = fresh;
    cell.price.setData(fresh.map(c => ({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close })));
    this.renderInds(cell);
  },

  onKline(cell, d){
    const k = d.k;
    if (!k) return;
    const c = { rawTime: k.t / 1000, time: k.t / 1000 + TZ_OFF,
      open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, quoteVol: +k.q || 0 };
    try { cell.price.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close }); } catch(e){}
    const last = cell.data[cell.data.length - 1];
    if (last && last.time === c.time) cell.data[cell.data.length - 1] = c;
    else if (!last || c.time > last.time){
      cell.data.push(c);
      if (cell.data.length > 500) cell.data.shift();
    }
    this.renderInds(cell, !k.x);
  },

  tick(changed){
    for (const cell of this.cells){
      if (changed.indexOf(cell.sym) === -1) continue;
      const t = STORE.tickers.get(cell.sym);
      if (!t) continue;
      cell.el.querySelector('.miniPx').textContent = fmtPrice(t.last);
      const p = cell.el.querySelector('.miniPct');
      p.textContent = fmtPct(t.pct);
      p.className = 'miniPct ' + pctClass(t.pct);
    }
  },

  applyTheme(){
    const c = Chart.themeColors();
    const opts = {
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    };
    this.cells.forEach(cell => { try { cell.chart.applyOptions(opts); } catch(e){} });
  },
};
