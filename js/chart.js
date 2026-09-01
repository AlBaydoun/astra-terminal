/* ASTRA Terminal — main chart engine (lightweight-charts) with indicator panes + live stream */
const Chart = {
  raw: [],
  main: null, priceSeries: null,
  panes: {},          // 'p1'|'p2'|'p3' -> {el, chart}
  series: {},         // 'indicatorId|seriesKey' -> {s, target}
  sock: null,
  alertLines: [],
  syncing: false,

  /* built from the indicator catalogue, then overlaid with whatever was saved —
     so a new indicator appears with its defaults without wiping your settings */
  settings: (() => {
    const saved = lsGet('astra_ind', {});
    const out = {
      vp: Object.assign({ on: false }, saved.vp || {}),
      patterns: Object.assign({ on: true }, saved.patterns || {}),
    };
    for (const d of INDS) out[d.id] = Object.assign({}, d.def, saved[d.id] || {});
    return out;
  })(),

  replay: { active: false, selecting: false, playing: false, idx: 0, speed: 2, timer: null },

  compares: lsGet('astra_compare', []),
  cmpColors: ['#ffb03a', '#ff6bd6', '#8b6cff'],
  cmpSeries: {},
  cmpLast: {},

  themeColors(){
    const light = STORE.theme === 'light';
    return {
      text: light ? '#4a5a7c' : '#8fa3c8',
      grid: light ? 'rgba(60,90,160,0.10)' : 'rgba(120,150,220,0.06)',
      border: light ? 'rgba(60,90,160,0.22)' : 'rgba(120,150,220,0.15)',
      crossLabel: light ? '#1d3a5c' : '#0b2740',
    };
  },

  chartOpts(){
    const c = this.themeColors();
    return {
      autoSize: true,
      layout: {
        background: { type: 'solid', color: 'transparent' },
        textColor: c.text,
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: c.grid },
        horzLines: { color: c.grid },
      },
      crosshair: {
        mode: 0,
        vertLine: { color: 'rgba(0,229,255,0.45)', width: 1, labelBackgroundColor: c.crossLabel },
        horzLine: { color: 'rgba(0,229,255,0.45)', width: 1, labelBackgroundColor: c.crossLabel },
      },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border, timeVisible: true, secondsVisible: false, rightOffset: 6 },
    };
  },

  applyTheme(){
    const c = this.themeColors();
    const opts = {
      layout: { textColor: c.text },
      grid: { vertLines: { color: c.grid }, horzLines: { color: c.grid } },
      crosshair: { vertLine: { labelBackgroundColor: c.crossLabel }, horzLine: { labelBackgroundColor: c.crossLabel } },
      rightPriceScale: { borderColor: c.border },
      timeScale: { borderColor: c.border },
    };
    for (const [, ch] of this.allCharts())
      if (ch) try { ch.applyOptions(opts); } catch(e){}
  },

  makePane(el, showTime){
    const o = this.chartOpts();
    o.timeScale.visible = showTime;
    return LightweightCharts.createChart(el, o);
  },

  init(){
    this.main = LightweightCharts.createChart(document.getElementById('mainChart'), this.chartOpts());
    this.main.timeScale().subscribeVisibleLogicalRangeChange(r => { this.syncFrom('main', r); Draw.redraw(); });
    this.main.subscribeCrosshairMove(p => { this.onCross(p); Draw.onMove(p); });
    this.main.subscribeClick(p => {
      if (this.replay.selecting){ this.replayBeginAt(p); return; }
      Draw.onClick(p);
    });
    /* live tick for compare overlays */
    BUS.on('tickers', ch => {
      if (this.replay.active) return;
      for (const sym of this.compares){
        if (ch.indexOf(sym) === -1 || !this.cmpSeries[sym] || this.cmpLast[sym] == null) continue;
        const t = STORE.tickers.get(sym);
        if (t) try { this.cmpSeries[sym].update({ time: this.cmpLast[sym], value: t.last }); } catch(e){}
      }
    });
  },

  syncFrom(which, range){
    if (this.syncing || !range) return;
    this.syncing = true;
    for (const [name, c] of this.allCharts()){
      if (!c || name === which) continue;
      try { c.timeScale().setVisibleLogicalRange(range); } catch(e){}
    }
    this.syncing = false;
  },

  precision(){
    const t = STORE.tickers.get(STORE.symbol);
    const p = t ? t.last : (this.raw.length ? this.raw[this.raw.length - 1].close : 1);
    if (typeof MK !== 'undefined' && MK.group(STORE.symbol) === 'fx') return p >= 50 ? 3 : 5;
    if (p >= 100) return 2;
    if (p >= 1) return 4;
    if (p >= 0.01) return 6;
    return 8;
  },

  /* dataset the chart currently shows (truncated during bar replay) */
  view(){
    return this.replay.active ? this.raw.slice(0, this.replay.idx + 1) : this.raw;
  },

  displayCandles(){
    const v = this.view();
    return STORE.chartType === 'heikin' ? IND.heikinAshi(v) : v;
  },
  priceData(){
    const c = this.displayCandles();
    if (STORE.chartType === 'line' || STORE.chartType === 'area')
      return c.map(x => ({ time: x.time, value: x.close }));
    return c.map(x => ({ time: x.time, open: x.open, high: x.high, low: x.low, close: x.close }));
  },

  rebuildPrice(){
    if (this.priceSeries){ try { this.main.removeSeries(this.priceSeries); } catch(e){} this.priceSeries = null; }
    this.alertLines = [];
    const prec = this.precision();
    const priceFormat = { type: 'price', precision: prec, minMove: Math.pow(10, -prec) };
    const t = STORE.chartType;
    if (t === 'line')
      this.priceSeries = this.main.addLineSeries({ color: CFG.ACCENT, lineWidth: 2, priceFormat });
    else if (t === 'area')
      this.priceSeries = this.main.addAreaSeries({ lineColor: CFG.ACCENT, topColor: 'rgba(0,229,255,0.22)', bottomColor: 'rgba(0,229,255,0)', lineWidth: 2, priceFormat });
    else if (t === 'bars')
      this.priceSeries = this.main.addBarSeries({ upColor: CFG.UP, downColor: CFG.DOWN, priceFormat });
    else
      this.priceSeries = this.main.addCandlestickSeries({ upColor: CFG.UP, downColor: CFG.DOWN, wickUpColor: CFG.UP, wickDownColor: CFG.DOWN, borderVisible: false, priceFormat });
  },

  renderAll(){
    this.rebuildPrice();
    this.priceSeries.setData(this.priceData());
    this.renderIndicators();
    this.renderPatternMarkers();
    this.renderAlertLines();
    this.updateLegend(null);
    setTimeout(() => this.alignScales(), 60);
    Draw.redraw();
  },

  /* candlestick pattern markers (Hammer, Engulfing, Morning star, …) */
  renderPatternMarkers(){
    if (!this.priceSeries) return;
    const S = this.settings.patterns;
    const showable = ['candles', 'heikin', 'bars'].includes(STORE.chartType);
    if (!S || !S.on || !showable || typeof PAT === 'undefined'){
      try { this.priceSeries.setMarkers([]); } catch(e){}
      return;
    }
    const v = this.view();
    const markers = [];
    const start = Math.max(4, v.length - 200);
    for (let i = start; i < v.length; i++){
      for (const p of PAT.at(v, i)){
        markers.push({
          time: v[i].time,
          position: p.dir >= 0 ? 'belowBar' : 'aboveBar',
          color: p.dir > 0 ? CFG.UP : p.dir < 0 ? CFG.DOWN : '#8fa3c8',
          shape: p.dir > 0 ? 'arrowUp' : p.dir < 0 ? 'arrowDown' : 'circle',
          text: p.name,
        });
      }
    }
    try { this.priceSeries.setMarkers(markers.slice(-60)); } catch(e){}
  },

  /* compose a PNG of the chart (panes + drawings) and download it */
  snapshot(){
    try {
      const parts = this.allCharts().map(x => x[1]).map(c => c.takeScreenshot());
      const light = STORE.theme === 'light';
      const w = Math.max(...parts.map(c => c.width));
      const header = 40;
      const h = header + parts.reduce((a, c) => a + c.height, 0);
      const cv = document.createElement('canvas');
      cv.width = w; cv.height = h;
      const ctx = cv.getContext('2d');
      ctx.fillStyle = light ? '#eef2fb' : '#04060d';
      ctx.fillRect(0, 0, w, h);
      const t = STORE.tickers.get(STORE.symbol);
      ctx.fillStyle = light ? '#16233f' : '#d6e4ff';
      ctx.font = '700 18px Rajdhani, Segoe UI, sans-serif';
      ctx.fillText('ASTRA  ·  ' + baseAsset(STORE.symbol) + '/USDT  ·  ' + STORE.tf.toUpperCase() +
        (t ? '  ·  ' + fmtPrice(t.last) : '') + '  ·  ' + new Date().toLocaleString(), 12, 26);
      let y = header;
      parts.forEach((c, i) => {
        ctx.drawImage(c, 0, y);
        if (i === 0){ try { ctx.drawImage(Draw.canvas, 0, y, c.width, c.height); } catch(e){} }
        y += c.height;
      });
      const a = document.createElement('a');
      a.download = 'ASTRA_' + STORE.symbol + '_' + STORE.tf + '_' +
        new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-') + '.png';
      a.href = cv.toDataURL('image/png');
      a.click();
      toast('Screenshot saved to your Downloads folder', 'ok');
    } catch(e){
      toast('Screenshot failed — ' + e.message, 'error');
    }
  },

  lineData(arr, view){
    const v = view || this.view();
    const out = [];
    for (let i = 0; i < arr.length; i++)
      if (arr[i] != null) out.push({ time: v[i].time, value: arr[i] });
    return out;
  },

  /* ---------- indicator engine ----------
     Every indicator in the catalogue names the window it belongs to: the price
     chart itself, or one of three extra windows. Several indicators can share
     one window. Series are created, moved and destroyed to match. */

  chartFor(target){
    if (target === 'main') return this.main;
    const p = this.panes[target];
    return p ? p.chart : null;
  },

  allCharts(){
    const out = [['main', this.main]];
    for (const k of Object.keys(this.panes)) out.push([k, this.panes[k].chart]);
    return out;
  },

  /* which extra windows are needed right now, in fixed order */
  neededPanes(){
    const want = [];
    for (const d of INDS){
      const c = this.settings[d.id];
      if (c && c.on && c.target && c.target !== 'main' && want.indexOf(c.target) === -1) want.push(c.target);
    }
    return IND_TARGETS.map(t => t[0]).filter(t => t !== 'main' && want.indexOf(t) !== -1);
  },

  ensurePanes(){
    const need = this.neededPanes();
    /* drop windows that no longer hold anything */
    for (const key of Object.keys(this.panes)){
      if (need.indexOf(key) !== -1) continue;
      const p = this.panes[key];
      for (const sk of Object.keys(this.series))
        if (this.series[sk].target === key) delete this.series[sk];
      try { p.chart.remove(); } catch(e){}
      p.el.classList.remove('open');
      delete this.panes[key];
    }
    /* build the ones that are missing */
    for (const key of need){
      if (this.panes[key]) continue;
      const el = document.getElementById('pane-' + key);
      if (!el) continue;
      el.classList.add('open');
      const chart = this.makePane(el.querySelector('.paneChart'), false);
      chart.timeScale().subscribeVisibleLogicalRangeChange(r => this.syncFrom(key, r));
      chart.subscribeCrosshairMove(p => this.renderIndLegends(p && p.time != null ? p.time : null));
      this.panes[key] = { el, chart };
    }
    /* name each window after what it holds */
    for (const key of Object.keys(this.panes)){
      const names = INDS.filter(d => this.settings[d.id] && this.settings[d.id].on && this.settings[d.id].target === key)
        .map(d => d.label);
      const tag = this.panes[key].el.querySelector('.paneTag');
      if (tag) tag.textContent = names.join('  ·  ');
    }
  },

  /* Which price scale should this indicator use?
     Indicators that share a natural range (RSI, Stochastic, MFI — all 0–100) sit on
     ONE axis so they can be compared. Anything unbounded (MACD, ATR, OBV…) gets its
     own hidden axis, so a 0–100 line and a 0.18 line can share a window without
     one flattening the other. The first axis in a window is the visible one. */
  scaleKey(def){
    return def.range ? 'r' + def.range.join('_') : 'i' + def.id;
  },
  assignScales(){
    const map = {};                       // target -> {scaleKey -> scaleId}
    for (const def of INDS){
      const cfg = this.settings[def.id];
      if (!cfg || !cfg.on) continue;
      const t = cfg.target || 'main';
      if (t === 'main') continue;
      const m = map[t] = map[t] || {};
      const key = this.scaleKey(def);
      if (!m[key]) m[key] = Object.keys(m).length === 0 ? 'right' : 'ov_' + key;
    }
    return map;
  },

  makeSeries(chart, spec, target, def, scaleOverride){
    const scaleId = spec.scale === 'vol' ? 'vol'
      : (target === 'main' && def.kind === 'osc') ? 'osc_' + def.id
      : (scaleOverride || 'right');
    const priceFormat = spec.precision != null
      ? { type: 'price', precision: spec.precision, minMove: Math.pow(10, -spec.precision) }
      : (spec.scale === 'vol' ? { type: 'volume' } : undefined);
    const base = {
      priceScaleId: scaleId,
      priceLineVisible: false,
      lastValueVisible: target !== 'main',
      crosshairMarkerVisible: false,
    };
    if (priceFormat) base.priceFormat = priceFormat;
    const s = spec.type === 'hist'
      ? chart.addHistogramSeries(Object.assign(base, spec.color ? { color: spec.color } : {}))
      : chart.addLineSeries(Object.assign(base, {
          color: spec.color || def.color || '#8fa3c8',
          lineWidth: spec.width || 1,
          lineStyle: spec.lineStyle || 0,
          /* dotted indicators (Parabolic SAR, Fractals) hide the line and show points */
          lineVisible: !spec.dots,
          pointMarkersVisible: !!spec.dots,
          pointMarkersRadius: spec.radius || 1.6,
        }));
    if (scaleId !== 'right'){
      const margins = spec.margins || { top: 0.72, bottom: 0 };
      try { chart.priceScale(scaleId).applyOptions({ scaleMargins: margins }); } catch(e){}
    }
    for (const [price, color] of spec.levels || [])
      try { s.createPriceLine({ price, color, lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' }); } catch(e){}
    return s;
  },

  ma(closes, cfg){ return (cfg.type === 'sma' ? IND.sma : IND.ema)(closes, cfg.len); },

  /* tickOnly = keep the drawn history, just move the newest point along */
  renderIndicators(tickOnly){
    const v = this.view();
    if (!v.length) return;
    const ctx = {
      v, closes: v.map(c => c.close),
      line: arr => this.lineData(arr, v),
      /* "Apply to" — the price each indicator reads, as in MetaTrader */
      srcOf: cfg => IND.src(v, cfg.src || 'close'),
    };
    this.ensurePanes();

    const scales = this.assignScales();
    const alive = {};
    this.specCache = {};
    for (const def of INDS){
      const cfg = this.settings[def.id];
      if (!cfg || !cfg.on) continue;
      const target = this.chartFor(cfg.target) ? cfg.target : 'main';
      const chart = this.chartFor(target);
      if (!chart) continue;
      const scaleId = (scales[target] || {})[this.scaleKey(def)] || 'right';
      let specs;
      try { specs = def.build(ctx, cfg) || []; } catch(e){ continue; }
      /* apply the look chosen in the dialog: colour per line, thickness, dash */
      const chosen = cfg.colors || {};
      for (const spec of specs){
        const part = (def.parts || []).find(p => p.key === spec.key);
        spec.color = chosen[spec.key] || spec.color || (part && part.color) || def.color;
        if (cfg.width) spec.width = cfg.width;
        if (cfg.style != null && spec.lineStyle == null) spec.lineStyle = cfg.style;
      }
      this.specCache[def.id] = { def, cfg, specs };
      for (const spec of specs){
        const id = def.id + '|' + spec.key;
        /* an indicator with nothing to show (e.g. daily pivots on a one-day range)
           gets no series at all rather than an empty one */
        if (!spec.data || !spec.data.length) continue;
        alive[id] = true;
        let entry = this.series[id];
        if (entry && (entry.target !== target || entry.scaleId !== scaleId)){
          try { this.chartFor(entry.target).removeSeries(entry.s); } catch(e){}   /* moved window or axis */
          entry = null;
        }
        const look = [spec.color, spec.width || 1, spec.lineStyle || 0, spec.dots ? 1 : 0].join('|');
        if (!entry){
          try {
            entry = this.series[id] = { s: this.makeSeries(chart, spec, target, def, scaleId), target, look, scaleId };
            entry.s.setData(spec.data);
          } catch(e){ delete this.series[id]; }
          continue;
        }
        if (entry.look !== look){                       /* colour / thickness / dash changed */
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
    /* remove what is no longer switched on */
    for (const id of Object.keys(this.series)){
      if (alive[id]) continue;
      const e = this.series[id];
      const c = this.chartFor(e.target);
      if (c) try { c.removeSeries(e.s); } catch(err){}
      delete this.series[id];
    }
    this.updateTimeAxes();
    this.renderIndLegends();
  },

  /* ---------- live value legends, MetaTrader style ----------
     "RSI(14) 47.32   MACD(12,26,9) 0.18 0.18" above each window, and the
     indicators sitting on the price chart listed under the main legend.
     Values follow the crosshair, or show the newest bar when it is away. */
  paramText(def, cfg){
    const nums = (def.params || []).filter(p => p.kind === 'num').map(p => cfg[p.k]);
    return nums.length ? '(' + nums.join(',') + ')' : '';
  },

  valueAt(data, time){
    if (!data || !data.length) return null;
    if (time == null) return data[data.length - 1].value;
    let lo = 0, hi = data.length - 1;
    if (time <= data[0].time) return data[0].value;
    if (time >= data[hi].time) return data[hi].value;
    while (hi - lo > 1){
      const m = (hi + lo) >> 1;
      if (data[m].time <= time) lo = m; else hi = m;
    }
    return data[lo].value;
  },

  fmtInd(x){
    if (x == null || isNaN(x)) return '—';
    const a = Math.abs(x);
    if (a >= 1e6) return fmtNum(x);
    if (a >= 100) return x.toFixed(2);
    if (a >= 1) return x.toFixed(3);
    return x.toFixed(5).replace(/0+$/, '').replace(/\.$/, '');
  },

  legendFor(target, time){
    const out = [];
    for (const def of INDS){
      const c = this.specCache[def.id];
      if (!c) continue;
      if ((c.cfg.target || 'main') !== target) continue;
      if (target === 'main' && def.id === 'vol') continue;   // volume already in the main legend
      const vals = c.specs.map(sp =>
        `<b style="color:${sp.color}">${esc(this.fmtInd(this.valueAt(sp.data, time)))}</b>`).join(' ');
      out.push(`<span class="ilg"><i style="color:${c.specs[0] ? c.specs[0].color : 'inherit'}">` +
        `${esc(def.label)}${esc(this.paramText(def, c.cfg))}</i> ${vals}</span>`);
    }
    return out.join('');
  },

  renderIndLegends(time){
    if (!this.specCache) return;
    for (const key of Object.keys(this.panes)){
      const tag = this.panes[key].el.querySelector('.paneTag');
      if (tag) tag.innerHTML = this.legendFor(key, time);
    }
    const el = document.getElementById('indLegend');
    if (el) el.innerHTML = this.legendFor('main', time);
  },

  updateTimeAxes(){
    const charts = this.allCharts();
    const lastKey = charts[charts.length - 1][0];
    for (const [key, c] of charts)
      try { c.applyOptions({ timeScale: { visible: key === lastKey } }); } catch(e){}
  },

  alignScales(){
    try {
      const charts = this.allCharts().map(x => x[1]);
      let w = 0;
      charts.forEach(c => { w = Math.max(w, c.priceScale('right').width()); });
      if (w > 0) charts.forEach(c => c.applyOptions({ rightPriceScale: { minimumWidth: w } }));
    } catch(e){}
  },

  /* --- data loading + live stream --- */
  async load(){
    const spin = document.getElementById('chartLoading');
    this._fold = null;
    /* second-by-second candles exist only where we get a real tick stream */
    if (CFG.SUB_MINUTE.includes(STORE.tf)){
      const route = typeof Feed !== 'undefined' ? Feed.route(STORE.symbol) : { kind: 'binance' };
      if (route.kind === 'proxy'){
        toast(baseAsset(STORE.symbol) + ' has no second-by-second data from the public feed — showing 1 minute. Run the MT5 bridge for seconds.', 'warn');
        STORE.tf = '1m';
        localStorage.setItem('astra_tf', STORE.tf);
        App.renderTfPills();
      }
    }
    spin.classList.add('show');
    try {
      this.raw = await API.klines(STORE.symbol, STORE.tf);
    } catch(e){
      toast('Could not load chart data — ' + e.message, 'error');
      spin.classList.remove('show');
      return;
    }
    spin.classList.remove('show');
    this.renderAll();
    const n = this.raw.length;
    try { this.main.timeScale().setVisibleLogicalRange({ from: Math.max(0, n - 160), to: n + 8 }); } catch(e){}
    this.resub();
    Draw.loadFor(STORE.symbol);
    this.loadCompares();
    BUS.emit('symbol', STORE.symbol);
  },

  resub(){
    if (this.sock){ this.sock.close(); this.sock = null; }
    if (this.pollTimer){ clearInterval(this.pollTimer); this.pollTimer = null; }
    if (this.quoteTimer){ clearInterval(this.quoteTimer); this.quoteTimer = null; }
    /* anything without a public stream is polled: fast price ticks + slower full candles.
       The MT5 bridge is on this machine, so it can be polled about once a second. */
    const route = typeof Feed !== 'undefined' ? Feed.route(STORE.symbol) : { kind: 'binance' };
    if (route.kind !== 'binance'){
      BUS.emit('ws', { label: 'symbol', up: true, mode: 'poll' });
      const fast = route.kind === 'bridge' ? 1000 : 6000;
      this.quoteTimer = setInterval(() => this.quoteTick(), fast);
      this.pollTimer = setInterval(() => this.pollUpdate(), route.kind === 'bridge' ? 20000 : 60000);
      this.quoteTick();
      return;
    }
    const s = (route.addr || STORE.symbol).toLowerCase();
    /* 30-second candles are folded from the 1-second stream */
    const wsTf = STORE.tf === '30s' ? '1s' : STORE.tf;
    this.sock = new Sock(
      [`${s}@kline_${wsTf}`, `${s}@depth20@1000ms`, `${s}@aggTrade`],
      (d, stream) => {
        if (stream.includes('@kline')) this.onKline(d);
        else if (stream.includes('@depth')) Book.onDepth(d);
        else if (stream.includes('@aggTrade')) Book.onTrade(d);
      }, 'symbol');
  },

  /* pull just the price and move the running candle — keeps the numbers alive
     between full candle refreshes instead of freezing for a minute */
  async quoteTick(){
    if (this.replay.active || !this.raw.length) return;
    const sym = STORE.symbol;
    let q;
    try { q = (await Feed.quotes([sym]))[0]; } catch(e){ return; }
    if (!q || sym !== STORE.symbol || !(q.last > 0)) return;
    const t = STORE.tickers.get(sym) || {};
    Object.assign(t, {
      last: q.last, open: q.prev != null ? q.prev : t.open,
      high: q.high != null ? q.high : t.high, low: q.low != null ? q.low : t.low,
      pct: q.pct != null ? q.pct : t.pct,
    });
    STORE.tickers.set(sym, t);
    const c = this.raw[this.raw.length - 1];
    if (c.close !== q.last){
      c.close = q.last;
      if (q.last > c.high) c.high = q.last;
      if (q.last < c.low) c.low = q.last;
      this.tickUpdate(c);
    }
    this.updateLegend(null);
    BUS.emit('tickers', [sym]);
  },

  /* refresh the tail of a polled (non-crypto) chart */
  async pollUpdate(){
    if (this.replay.active) return;
    const sym = STORE.symbol, tf = STORE.tf;
    let fresh;
    try { fresh = await API.klines(sym, tf); }
    catch(e){ return; }
    if (sym !== STORE.symbol || tf !== STORE.tf || !fresh.length) return;
    this.raw = fresh;
    this.priceSeries.setData(this.priceData());
    this.renderIndicators();
    this.renderPatternMarkers();
    this.updateLegend(null);
    Draw.redraw();
    BUS.emit('candleClose', { sym, tf });
  },

  onKline(d){
    const k = d.k;
    if (!k || !this.raw.length) return;
    let c = { rawTime: k.t / 1000, time: k.t / 1000 + TZ_OFF, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, quoteVol: +k.q };
    /* fold the 1-second stream into the running 30-second candle.
       Each second can be re-sent while it is still open, so volumes are kept
       per second and summed — never added twice. */
    if (STORE.tf === '30s'){
      const sec = c.rawTime;
      const slot = Math.floor(sec / 30) * 30;
      const last = this.raw[this.raw.length - 1];
      if (!this._fold || this._fold.slot !== slot)
        this._fold = { slot, open: c.open, high: c.high, low: c.low, secs: {}, qsecs: {} };
      if (last && last.rawTime === slot && this._fold.slot === slot){
        this._fold.high = Math.max(this._fold.high, c.high);
        this._fold.low = Math.min(this._fold.low, c.low);
      }
      this._fold.secs[sec] = c.volume;
      this._fold.qsecs[sec] = c.quoteVol;
      let vol = 0, qvol = 0;
      for (const s in this._fold.secs){ vol += this._fold.secs[s]; qvol += this._fold.qsecs[s]; }
      c = {
        rawTime: slot, time: slot + TZ_OFF,
        open: this._fold.open,
        high: Math.max(this._fold.high, c.high),
        low: Math.min(this._fold.low, c.low),
        close: c.close, volume: vol, quoteVol: qvol,
      };
      this._fold.high = c.high; this._fold.low = c.low;
    }
    const last = this.raw[this.raw.length - 1];
    let isNew = false;
    if (last && last.time === c.time) this.raw[this.raw.length - 1] = c;
    else if (!last || c.time > last.time){ this.raw.push(c); isNew = true; if (this.raw.length > 1600 && !this.replay.active) this.raw.shift(); }
    else return;
    if (this.replay.active) return; // keep data fresh silently; replay owns the screen
    if (isNew || k.x){
      this.priceSeries.setData(this.priceData());
      this.renderIndicators();
      this.renderPatternMarkers();
      if (isNew) this.refreshComparesSoon();
      Draw.redraw();
      if (k.x) BUS.emit('candleClose', { sym: STORE.symbol, tf: STORE.tf });
    } else {
      this.tickUpdate(c);
    }
    this.updateLegend(null);
  },

  tickUpdate(c){
    const t = STORE.chartType;
    try {
      if (t === 'line' || t === 'area') this.priceSeries.update({ time: c.time, value: c.close });
      else if (t === 'heikin'){
        const ha = IND.heikinAshi(this.raw);
        const h = ha[ha.length - 1];
        this.priceSeries.update({ time: h.time, open: h.open, high: h.high, low: h.low, close: h.close });
      }
      else this.priceSeries.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });

      this.renderIndicators(true);
      this.renderIndLegends();
    } catch(e){ console.warn('tick update', e); }
  },

  /* --- legend + crosshair --- */
  updateLegend(hover){
    const el = document.getElementById('legend');
    const disp = this.displayCandles();
    const c = hover || (disp.length ? disp[disp.length - 1] : null);
    if (!c){ el.innerHTML = ''; return; }
    const chg = c.close - c.open;
    const pct = c.open ? chg / c.open * 100 : 0;
    const cls = chg >= 0 ? 'up' : 'down';
    const st = typeof Feed !== 'undefined' ? Feed.status(STORE.symbol) : { cls: 'live', label: 'LIVE', tip: '' };
    const route = typeof Feed !== 'undefined' ? Feed.route(STORE.symbol) : { kind: 'binance', addr: STORE.symbol };
    const srcName = route.kind === 'bridge' ? BROKER.name
      : route.kind === 'binance' ? 'BINANCE' : String(route.addr).toUpperCase();
    el.innerHTML =
      `<span class="lgSym">${esc(baseAsset(STORE.symbol))}${typeof MK !== 'undefined' && MK.isCrypto(STORE.symbol) ? '<i>/USDT</i>' : ''}</span>` +
      `<span class="lgTag">${esc(STORE.tf.toUpperCase())}</span>` +
      `<span class="lgTag dim" title="Where this price comes from">${esc(srcName)}</span>` +
      `<span class="fdTag ${st.cls}" title="${esc(st.tip)}">${esc(st.label)}</span>` +
      `<span class="lgOhlc">O <b class="${cls}">${fmtPrice(c.open)}</b> H <b class="${cls}">${fmtPrice(c.high)}</b> L <b class="${cls}">${fmtPrice(c.low)}</b> C <b class="${cls}">${fmtPrice(c.close)}</b></span>` +
      `<span class="lgChg ${cls}">${(chg >= 0 ? '+' : '') + fmtPrice(chg)} (${fmtPct(pct)})</span>` +
      (c.volume != null ? `<span class="lgVol">Vol <b>${fmtNum(c.volume)}</b></span>` : '');
  },

  onCross(p){
    this.renderIndLegends(p && p.time != null ? p.time : null);
    if (!p || !p.time || !p.seriesData || !this.priceSeries){ this.updateLegend(null); return; }
    const sd = p.seriesData.get(this.priceSeries);
    if (sd && sd.open !== undefined){
      const rawC = this.raw.find(x => x.time === p.time);
      this.updateLegend({ ...sd, volume: rawC ? rawC.volume : null });
    } else this.updateLegend(null);
  },

  /* --- compare overlay (percent scale while active) --- */
  async addCompare(sym){
    if (sym === STORE.symbol){ toast('That is already the main chart symbol', 'warn'); return; }
    if (this.compares.includes(sym)) return;
    if (this.compares.length >= 3){ toast('Maximum 3 compare symbols', 'warn'); return; }
    this.compares.push(sym);
    lsSet('astra_compare', this.compares);
    await this.loadCompare(sym);
    this.applyCompareMode();
    this.renderCmpChips();
    toast('Comparing with ' + baseAsset(sym) + ' — scale switched to %', 'ok');
  },

  async loadCompare(sym){
    let data;
    try { data = await API.klines(sym, STORE.tf); }
    catch(e){ toast('Could not load ' + baseAsset(sym), 'error'); return; }
    if (!this.compares.includes(sym)) return;
    let s = this.cmpSeries[sym];
    if (!s){
      s = this.cmpSeries[sym] = this.main.addLineSeries({
        color: this.cmpColors[this.compares.indexOf(sym) % this.cmpColors.length],
        lineWidth: 1, priceScaleId: 'right',
        priceLineVisible: false, lastValueVisible: true, crosshairMarkerVisible: false,
        title: baseAsset(sym),
      });
    }
    s.setData(data.map(c => ({ time: c.time, value: c.close })));
    this.cmpLast[sym] = data.length ? data[data.length - 1].time : null;
  },

  removeCompare(sym){
    this.compares = this.compares.filter(x => x !== sym);
    lsSet('astra_compare', this.compares);
    if (this.cmpSeries[sym]){
      try { this.main.removeSeries(this.cmpSeries[sym]); } catch(e){}
      delete this.cmpSeries[sym];
      delete this.cmpLast[sym];
    }
    this.applyCompareMode();
    this.renderCmpChips();
  },

  applyCompareMode(){
    try { this.main.priceScale('right').applyOptions({ mode: this.compares.length ? 2 : 0 }); } catch(e){}
  },

  async loadCompares(){
    this.compares = this.compares.filter(s => s !== STORE.symbol);
    lsSet('astra_compare', this.compares);
    for (const sym of Object.keys(this.cmpSeries)){
      if (!this.compares.includes(sym)){
        try { this.main.removeSeries(this.cmpSeries[sym]); } catch(e){}
        delete this.cmpSeries[sym]; delete this.cmpLast[sym];
      }
    }
    for (const sym of [...this.compares]) await this.loadCompare(sym);
    this.applyCompareMode();
    this.renderCmpChips();
  },

  refreshComparesSoon(){
    if (!this.compares.length || this._cmpTimer) return;
    this._cmpTimer = setTimeout(() => {
      this._cmpTimer = null;
      for (const sym of [...this.compares]) this.loadCompare(sym);
    }, 2500);
  },

  renderCmpChips(){
    const host = document.getElementById('cmpChips');
    if (!host) return;
    host.innerHTML = this.compares.map((s, i) =>
      `<span class="cmpChip" style="--c:${this.cmpColors[i % this.cmpColors.length]}">vs ${esc(baseAsset(s))}<button data-sym="${esc(s)}" title="Remove">×</button></span>`).join('');
    host.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => this.removeCompare(b.dataset.sym)));
  },

  setComparesVisible(v){
    Object.values(this.cmpSeries).forEach(s => { try { s.applyOptions({ visible: v }); } catch(e){} });
  },

  /* --- bar replay --- */
  replayStart(){
    if (this.replay.active){ this.replayExit(); return; }
    if (this.raw.length < 50){ toast('Not enough data for replay', 'warn'); return; }
    this.replay.selecting = true;
    document.getElementById('replayBtn').classList.add('active');
    document.getElementById('mainWrap').classList.add('drawing');
    toast('Replay: click a candle to choose the starting point', 'info');
  },

  replayBeginAt(p){
    this.replay.selecting = false;
    document.getElementById('mainWrap').classList.remove('drawing');
    if (!p || !p.point){ this.replayExit(); return; }
    const time = this.main.timeScale().coordinateToTime(p.point.x);
    if (time == null){ this.replayExit(); return; }
    let idx = this.raw.findIndex(c => c.time >= time);
    if (idx < 10) idx = 10;
    this.replay.active = true;
    this.replay.idx = idx;
    this.replay.playing = false;
    this.setComparesVisible(false);
    try { this.main.priceScale('right').applyOptions({ mode: 0 }); } catch(e){}
    document.getElementById('replayBar').classList.add('show');
    this.replayRender();
    toast('Replay started — press play or step forward', 'ok');
  },

  replayRender(){
    this.priceSeries.setData(this.priceData());
    this.renderIndicators();
    this.updateLegend(null);
    this.updateReplayUI();
    Draw.redraw();
  },

  replayStep(){
    if (!this.replay.active) return;
    if (this.replay.idx >= this.raw.length - 1){ this.replayPause(); toast('Replay reached the live edge', 'info'); return; }
    this.replay.idx++;
    const v = this.view();
    const c = STORE.chartType === 'heikin' ? IND.heikinAshi(v)[v.length - 1] : v[v.length - 1];
    if (STORE.chartType === 'line' || STORE.chartType === 'area')
      this.priceSeries.update({ time: c.time, value: c.close });
    else
      this.priceSeries.update({ time: c.time, open: c.open, high: c.high, low: c.low, close: c.close });
    this.renderIndicators();
    this.updateLegend(null);
    this.updateReplayUI();
  },

  replayTogglePlay(){
    if (!this.replay.active) return;
    if (this.replay.playing) this.replayPause();
    else {
      this.replay.playing = true;
      this.replay.timer = setInterval(() => this.replayStep(), 1000 / this.replay.speed);
      this.updateReplayUI();
    }
  },
  replayPause(){
    this.replay.playing = false;
    clearInterval(this.replay.timer);
    this.updateReplayUI();
  },
  replaySetSpeed(s){
    this.replay.speed = s;
    if (this.replay.playing){
      clearInterval(this.replay.timer);
      this.replay.timer = setInterval(() => this.replayStep(), 1000 / s);
    }
  },
  replayExit(){
    this.replayPause();
    this.replay.active = false;
    this.replay.selecting = false;
    document.getElementById('replayBar').classList.remove('show');
    document.getElementById('replayBtn').classList.remove('active');
    document.getElementById('mainWrap').classList.remove('drawing');
    this.setComparesVisible(true);
    this.applyCompareMode();
    this.renderAll();
    try { this.main.timeScale().scrollToRealTime(); } catch(e){}
  },
  updateReplayUI(){
    const c = this.raw[this.replay.idx];
    if (!c) return;
    document.getElementById('rpPos').textContent =
      new Date(c.rawTime * 1000).toLocaleString() + '  ·  bar ' + (this.replay.idx + 1) + '/' + this.raw.length;
    document.getElementById('rpPlay').textContent = this.replay.playing ? '⏸' : '▶';
  },

  /* --- alert price lines --- */
  renderAlertLines(){
    if (!this.priceSeries) return;
    this.alertLines.forEach(l => { try { this.priceSeries.removePriceLine(l); } catch(e){} });
    this.alertLines = [];
    if (typeof Alerts === 'undefined') return;
    Alerts.list.filter(a => a.symbol === STORE.symbol && a.active).forEach(a => {
      this.alertLines.push(this.priceSeries.createPriceLine({
        price: a.price, color: '#ffb03a', lineWidth: 1, lineStyle: 2,
        title: 'alert ' + (a.cond === 'above' ? '≥' : '≤'),
      }));
    });
  },
};
