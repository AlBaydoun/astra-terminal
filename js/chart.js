/* ASTRA Terminal — main chart engine (lightweight-charts) with indicator panes + live stream */
const Chart = {
  raw: [],
  main: null, priceSeries: null,
  overlays: {},
  rsiChart: null, rsiSeries: null,
  macdChart: null, macdHist: null, macdLine: null, macdSig: null,
  stochChart: null, stochK: null, stochD: null,
  atrChart: null, atrSeries: null,
  sock: null,
  alertLines: [],
  syncing: false,

  settings: Object.assign({
    ema1: { on: true,  len: 20,  type: 'ema' },
    ema2: { on: true,  len: 50,  type: 'ema' },
    ema3: { on: false, len: 200, type: 'ema' },
    bb:   { on: false, len: 20, mult: 2 },
    vwap: { on: false },
    vol:  { on: true },
    st:   { on: false, len: 10, mult: 3 },
    rsi:  { on: true,  len: 14 },
    macd: { on: false, f: 12, s: 26, sig: 9 },
    stoch:{ on: false, k: 14, smooth: 3, d: 3 },
    atr:  { on: false, len: 14 },
    vp:   { on: false },
  }, lsGet('astra_ind', {})),

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
    for (const ch of [this.main, this.rsiChart, this.macdChart, this.stochChart, this.atrChart])
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
    for (const [name, c] of [['main', this.main], ['rsi', this.rsiChart], ['macd', this.macdChart], ['stoch', this.stochChart], ['atr', this.atrChart]]){
      if (!c || name === which) continue;
      try { c.timeScale().setVisibleLogicalRange(range); } catch(e){}
    }
    this.syncing = false;
  },

  precision(){
    const t = STORE.tickers.get(STORE.symbol);
    const p = t ? t.last : (this.raw.length ? this.raw[this.raw.length - 1].close : 1);
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
    this.renderAlertLines();
    this.updateLegend(null);
    setTimeout(() => this.alignScales(), 60);
    Draw.redraw();
  },

  lineData(arr, view){
    const v = view || this.view();
    const out = [];
    for (let i = 0; i < arr.length; i++)
      if (arr[i] != null) out.push({ time: v[i].time, value: arr[i] });
    return out;
  },

  setOverlay(key, on, create, fill){
    if (on){
      if (!this.overlays[key]) this.overlays[key] = create();
      fill(this.overlays[key]);
    } else if (this.overlays[key]){
      try { this.main.removeSeries(this.overlays[key]); } catch(e){}
      delete this.overlays[key];
    }
  },

  ma(closes, cfg){
    return (cfg.type === 'sma' ? IND.sma : IND.ema)(closes, cfg.len);
  },

  renderIndicators(){
    const S = this.settings;
    const v = this.view();
    const closes = v.map(c => c.close);

    this.setOverlay('vol', S.vol.on,
      () => this.main.addHistogramSeries({ priceScaleId: 'vol', priceFormat: { type: 'volume' }, lastValueVisible: false, priceLineVisible: false }),
      s => {
        this.main.priceScale('vol').applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        s.setData(v.map(c => ({ time: c.time, value: c.volume, color: c.close >= c.open ? 'rgba(0,229,160,0.35)' : 'rgba(255,77,109,0.35)' })));
      });

    for (const [key, color] of [['ema1', '#00e5ff'], ['ema2', '#ffb03a'], ['ema3', '#ff6bd6']]){
      const cfg = S[key];
      this.setOverlay(key, cfg.on,
        () => this.main.addLineSeries({ color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
        s => s.setData(this.lineData(this.ma(closes, cfg), v)));
    }

    const bbOn = S.bb.on;
    let bbData = null;
    if (bbOn) bbData = IND.bb(closes, S.bb.len, S.bb.mult);
    for (const [key, part, color] of [['bbU', 'up', 'rgba(139,108,255,0.7)'], ['bbM', 'mid', 'rgba(139,108,255,0.45)'], ['bbL', 'lo', 'rgba(139,108,255,0.7)']]){
      this.setOverlay(key, bbOn,
        () => this.main.addLineSeries({ color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
        s => s.setData(this.lineData(bbData[part], v)));
    }

    this.setOverlay('vwap', S.vwap.on,
      () => this.main.addLineSeries({ color: '#ffd166', lineWidth: 1, lineStyle: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
      s => s.setData(this.lineData(IND.vwapDaily(v), v)));

    const stOn = S.st.on;
    let stData = null;
    if (stOn) stData = IND.supertrend(v, S.st.len, S.st.mult);
    for (const [key, part, color] of [['stUp', 'up', 'rgba(0,229,160,0.9)'], ['stDn', 'down', 'rgba(255,77,109,0.9)']]){
      this.setOverlay(key, stOn,
        () => this.main.addLineSeries({ color, lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false }),
        s => s.setData(this.lineData(stData[part], v)));
    }

    this.ensurePanes();
    if (this.rsiSeries) this.rsiSeries.setData(this.lineData(IND.rsi(closes, S.rsi.len), v));
    if (this.macdHist) this.setMacdData(closes, v);
    if (this.stochK){
      const st = IND.stoch(v, S.stoch.k, S.stoch.smooth, S.stoch.d);
      this.stochK.setData(this.lineData(st.k, v));
      this.stochD.setData(this.lineData(st.d, v));
    }
    if (this.atrSeries) this.atrSeries.setData(this.lineData(IND.atr(v, S.atr.len), v));
    this.updateTimeAxes();
  },

  ensurePanes(){
    const S = this.settings;
    const rsiEl = document.getElementById('rsiPane');
    const macdEl = document.getElementById('macdPane');

    if (S.rsi.on && !this.rsiChart){
      rsiEl.classList.add('open');
      this.rsiChart = this.makePane(rsiEl.querySelector('.paneChart'), false);
      this.rsiSeries = this.rsiChart.addLineSeries({ color: '#c084fc', lineWidth: 1, priceLineVisible: false, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
      this.rsiSeries.createPriceLine({ price: 70, color: 'rgba(255,77,109,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      this.rsiSeries.createPriceLine({ price: 30, color: 'rgba(0,229,160,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      this.rsiChart.timeScale().subscribeVisibleLogicalRangeChange(r => this.syncFrom('rsi', r));
    }
    if (!S.rsi.on && this.rsiChart){
      try { this.rsiChart.remove(); } catch(e){}
      this.rsiChart = null; this.rsiSeries = null;
      rsiEl.classList.remove('open');
    }

    if (S.macd.on && !this.macdChart){
      macdEl.classList.add('open');
      this.macdChart = this.makePane(macdEl.querySelector('.paneChart'), false);
      this.macdHist = this.macdChart.addHistogramSeries({ priceFormat: { type: 'price', precision: 4, minMove: 0.0001 }, lastValueVisible: false, priceLineVisible: false });
      this.macdLine = this.macdChart.addLineSeries({ color: '#00e5ff', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      this.macdSig = this.macdChart.addLineSeries({ color: '#ffb03a', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      this.macdChart.timeScale().subscribeVisibleLogicalRangeChange(r => this.syncFrom('macd', r));
    }
    if (!S.macd.on && this.macdChart){
      try { this.macdChart.remove(); } catch(e){}
      this.macdChart = null; this.macdHist = this.macdLine = this.macdSig = null;
      macdEl.classList.remove('open');
    }

    const stochEl = document.getElementById('stochPane');
    if (S.stoch.on && !this.stochChart){
      stochEl.classList.add('open');
      this.stochChart = this.makePane(stochEl.querySelector('.paneChart'), false);
      this.stochK = this.stochChart.addLineSeries({ color: '#00e5ff', lineWidth: 1, priceLineVisible: false, priceFormat: { type: 'price', precision: 2, minMove: 0.01 } });
      this.stochD = this.stochChart.addLineSeries({ color: '#ffb03a', lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
      this.stochK.createPriceLine({ price: 80, color: 'rgba(255,77,109,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      this.stochK.createPriceLine({ price: 20, color: 'rgba(0,229,160,0.5)', lineWidth: 1, lineStyle: 2, axisLabelVisible: false, title: '' });
      this.stochChart.timeScale().subscribeVisibleLogicalRangeChange(r => this.syncFrom('stoch', r));
    }
    if (!S.stoch.on && this.stochChart){
      try { this.stochChart.remove(); } catch(e){}
      this.stochChart = null; this.stochK = this.stochD = null;
      stochEl.classList.remove('open');
    }

    const atrEl = document.getElementById('atrPane');
    if (S.atr.on && !this.atrChart){
      atrEl.classList.add('open');
      this.atrChart = this.makePane(atrEl.querySelector('.paneChart'), false);
      this.atrSeries = this.atrChart.addLineSeries({ color: '#ff9f6b', lineWidth: 1, priceLineVisible: false });
      this.atrChart.timeScale().subscribeVisibleLogicalRangeChange(r => this.syncFrom('atr', r));
    }
    if (!S.atr.on && this.atrChart){
      try { this.atrChart.remove(); } catch(e){}
      this.atrChart = null; this.atrSeries = null;
      atrEl.classList.remove('open');
    }
  },

  updateTimeAxes(){
    const last = this.atrChart ? 'atr' : this.stochChart ? 'stoch' : this.macdChart ? 'macd' : this.rsiChart ? 'rsi' : 'main';
    this.main.applyOptions({ timeScale: { visible: last === 'main' } });
    if (this.rsiChart) this.rsiChart.applyOptions({ timeScale: { visible: last === 'rsi' } });
    if (this.macdChart) this.macdChart.applyOptions({ timeScale: { visible: last === 'macd' } });
    if (this.stochChart) this.stochChart.applyOptions({ timeScale: { visible: last === 'stoch' } });
    if (this.atrChart) this.atrChart.applyOptions({ timeScale: { visible: last === 'atr' } });
  },

  alignScales(){
    try {
      const charts = [this.main, this.rsiChart, this.macdChart, this.stochChart, this.atrChart].filter(Boolean);
      let w = 0;
      charts.forEach(c => { w = Math.max(w, c.priceScale('right').width()); });
      if (w > 0) charts.forEach(c => c.applyOptions({ rightPriceScale: { minimumWidth: w } }));
    } catch(e){}
  },

  setMacdData(closes, view){
    const S = this.settings.macd;
    const v = view || this.view();
    const m = IND.macd(closes, S.f, S.s, S.sig);
    this.macdLine.setData(this.lineData(m.macd, v));
    this.macdSig.setData(this.lineData(m.signal, v));
    const hd = [];
    for (let i = 0; i < m.hist.length; i++)
      if (m.hist[i] != null) hd.push({ time: v[i].time, value: m.hist[i], color: m.hist[i] >= 0 ? 'rgba(0,229,160,0.5)' : 'rgba(255,77,109,0.5)' });
    this.macdHist.setData(hd);
  },

  /* --- data loading + live stream --- */
  async load(){
    const spin = document.getElementById('chartLoading');
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
    if (this.sock) this.sock.close();
    const s = STORE.symbol.toLowerCase();
    this.sock = new Sock(
      [`${s}@kline_${STORE.tf}`, `${s}@depth20@1000ms`, `${s}@aggTrade`],
      (d, stream) => {
        if (stream.includes('@kline')) this.onKline(d);
        else if (stream.includes('@depth')) Book.onDepth(d);
        else if (stream.includes('@aggTrade')) Book.onTrade(d);
      }, 'symbol');
  },

  onKline(d){
    const k = d.k;
    if (!k || !this.raw.length) return;
    const c = { rawTime: k.t / 1000, time: k.t / 1000 + TZ_OFF, open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v, quoteVol: +k.q };
    const last = this.raw[this.raw.length - 1];
    let isNew = false;
    if (last && last.time === c.time) this.raw[this.raw.length - 1] = c;
    else if (!last || c.time > last.time){ this.raw.push(c); isNew = true; if (this.raw.length > 1600 && !this.replay.active) this.raw.shift(); }
    else return;
    if (this.replay.active) return; // keep data fresh silently; replay owns the screen
    if (isNew || k.x){
      this.priceSeries.setData(this.priceData());
      this.renderIndicators();
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

      const closes = this.raw.map(x => x.close);
      const S = this.settings, i = this.raw.length - 1, time = c.time;
      for (const key of ['ema1', 'ema2', 'ema3']){
        const s = this.overlays[key];
        if (!s) continue;
        const arr = this.ma(closes, S[key]);
        if (arr[i] != null) s.update({ time, value: arr[i] });
      }
      if (this.overlays.stUp){
        const st = IND.supertrend(this.raw, S.st.len, S.st.mult);
        if (st.up[i] != null) this.overlays.stUp.update({ time, value: st.up[i] });
        if (st.down[i] != null) this.overlays.stDn.update({ time, value: st.down[i] });
      }
      if (this.stochK){
        const st = IND.stoch(this.raw, S.stoch.k, S.stoch.smooth, S.stoch.d);
        if (st.k[i] != null) this.stochK.update({ time, value: st.k[i] });
        if (st.d[i] != null) this.stochD.update({ time, value: st.d[i] });
      }
      if (this.atrSeries){
        const a = IND.atr(this.raw, S.atr.len);
        if (a[i] != null) this.atrSeries.update({ time, value: a[i] });
      }
      if (this.overlays.vol)
        this.overlays.vol.update({ time, value: c.volume, color: c.close >= c.open ? 'rgba(0,229,160,0.35)' : 'rgba(255,77,109,0.35)' });
      if (this.overlays.bbU){
        const b = IND.bb(closes, S.bb.len, S.bb.mult);
        if (b.up[i] != null){
          this.overlays.bbU.update({ time, value: b.up[i] });
          this.overlays.bbM.update({ time, value: b.mid[i] });
          this.overlays.bbL.update({ time, value: b.lo[i] });
        }
      }
      if (this.overlays.vwap){
        const v = IND.vwapDaily(this.raw);
        if (v[i] != null) this.overlays.vwap.update({ time, value: v[i] });
      }
      if (this.rsiSeries){
        const r = IND.rsi(closes, S.rsi.len);
        if (r[i] != null) this.rsiSeries.update({ time, value: r[i] });
      }
      if (this.macdHist){
        const m = IND.macd(closes, S.macd.f, S.macd.s, S.macd.sig);
        if (m.hist[i] != null){
          this.macdHist.update({ time, value: m.hist[i], color: m.hist[i] >= 0 ? 'rgba(0,229,160,0.5)' : 'rgba(255,77,109,0.5)' });
          this.macdLine.update({ time, value: m.macd[i] });
          this.macdSig.update({ time, value: m.signal[i] });
        }
      }
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
    el.innerHTML =
      `<span class="lgSym">${esc(baseAsset(STORE.symbol))}<i>/USDT</i></span>` +
      `<span class="lgTag">${esc(STORE.tf.toUpperCase())}</span>` +
      `<span class="lgTag dim">BINANCE</span>` +
      `<span class="lgOhlc">O <b class="${cls}">${fmtPrice(c.open)}</b> H <b class="${cls}">${fmtPrice(c.high)}</b> L <b class="${cls}">${fmtPrice(c.low)}</b> C <b class="${cls}">${fmtPrice(c.close)}</b></span>` +
      `<span class="lgChg ${cls}">${(chg >= 0 ? '+' : '') + fmtPrice(chg)} (${fmtPct(pct)})</span>` +
      (c.volume != null ? `<span class="lgVol">Vol <b>${fmtNum(c.volume)}</b></span>` : '');
  },

  onCross(p){
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
