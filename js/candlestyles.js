/* ASTRA / Timurila — candle shapes and colours for the Classic chart.

   Purely additive: it wraps four functions of js/chart.js and leaves that file untouched. With the
   shape "Candles" and the "ASTRA" colours everything behaves exactly as it did before.

   Shapes that only recolour real candles (hollow, trend, volume, power) keep every price, every
   drawing and every indicator where it was. Heikin Ashi and its smoothed version redraw the candles
   themselves, so their open and close are averages, not traded prices — the legend says so.
   Nothing here trades. */
const CandleStyles = {
  KEY: 'astra_cshape', PKEY: 'astra_cpalette',
  /* id, name, the chart type underneath, one line of what it shows */
  SHAPES: [
    ['classic', 'Candles', 'candles', 'Open, high, low, close'],
    ['hollow', 'Hollow candles', 'candles', 'Hollow when the close is above the open; colour compares with yesterday’s close'],
    ['heikin', 'Heikin Ashi', 'heikin', 'Averaged candles: smoother trends, prices are not traded prices'],
    ['smooth', 'Smoothed Heikin Ashi', 'candles', 'Heikin Ashi of a 6-candle average: slower, cleaner'],
    ['trend', 'Trend candles', 'candles', 'Coloured by SuperTrend: pale candles go against the trend'],
    ['volume', 'Volume candles', 'candles', 'Bright when volume is high, faint when it is thin'],
    ['power', 'Power candles', 'candles', 'Bright when the body is large for this market'],
    ['bars', 'Bars', 'bars', 'Open, high, low, close as bars'],
    ['line', 'Line', 'line', 'Closing prices'],
    ['step', 'Step line', 'line', 'Closing prices as steps'],
    ['area', 'Area', 'area', 'Closing prices, filled'],
    ['baseline', 'Baseline', 'line', 'Green above the average of what is loaded, red below'],
  ],
  PALETTES: [['astra', 'ASTRA', null, null], ['timurila', 'Timurila', '#3DDC97', '#FF6B7A'], ['blueorange', 'Blue / orange', '#4F9DFF', '#FF9F45'], ['tv', 'Teal / red', '#26A69A', '#EF5350'], ['mono', 'Mono', '#E6EEFF', '#56688C'], ['ink', 'Cyan / amber', '#4FD8F7', '#FFB648']],
  k(key){ return typeof PCK === 'function' ? PCK(key) : key; },
  shape(){ const s = localStorage.getItem(this.k(this.KEY)) || '', d = this.SHAPES.find(x => x[0] === s); if (d && typeof STORE !== 'undefined' && d[2] === STORE.chartType) return s;
    return typeof STORE === 'undefined' ? 'classic' : ({ candles: 'classic', heikin: 'heikin', bars: 'bars', line: 'line', area: 'area' })[STORE.chartType] || 'classic'; },
  palette(){ return localStorage.getItem(this.PKEY) || 'astra'; },
  colors(){ const p = this.PALETTES.find(x => x[0] === this.palette()) || this.PALETTES[0]; return [p[2] || CFG.UP, p[3] || CFG.DOWN]; },
  rgba(hex, a){ const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return hex; const n = parseInt(m[1], 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; },

  set(shape){ const d = this.SHAPES.find(s => s[0] === shape) || this.SHAPES[0]; localStorage.setItem(this.k(this.KEY), d[0]); this._st = null; App.setType(d[2]); this.sync(); },
  setPalette(id){ localStorage.setItem(this.PKEY, id); Chart.renderAll(); this.sync(); },
  sync(){ const sel = document.getElementById('chartType'); if (sel){ const v = 'x:' + this.shape(); if ([...sel.options].some(o => o.value === v)) sel.value = v; }
    document.dispatchEvent(new CustomEvent('candlestyle')); },

  smoothHA(v){ if (!v.length) return v; const k = 2 / 7, e = { o: v[0].open, h: v[0].high, l: v[0].low, c: v[0].close }, out = []; let po = null, pc = null;
    for (const b of v){ e.o = b.open * k + e.o * (1 - k); e.h = b.high * k + e.h * (1 - k); e.l = b.low * k + e.l * (1 - k); e.c = b.close * k + e.c * (1 - k);
      const c = (e.o + e.h + e.l + e.c) / 4, o = po == null ? (e.o + e.c) / 2 : (po + pc) / 2; out.push(Object.assign({}, b, { open: o, close: c, high: Math.max(e.h, o, c), low: Math.min(e.l, o, c) })); po = o; pc = c; }
    return out; },

  /* the colours of candle i of `v` under shape `sh` (null = leave it alone) */
  paint(sh, v, i, cache){
    const [UP, DN] = this.colors(), b = v[i]; if (!b) return null;
    if (sh === 'hollow'){ const col = i && b.close < v[i - 1].close ? DN : UP; return { color: b.close >= b.open ? 'rgba(0,0,0,0)' : col, borderColor: col, wickColor: col }; }
    if (sh === 'trend'){ const d = cache.dir ? cache.dir[Math.min(i, cache.dir.length - 1)] : 0, col = d > 0 ? UP : d < 0 ? DN : '#7C8BA8', against = (d > 0 && b.close < b.open) || (d < 0 && b.close > b.open), c = against ? this.rgba(col, 0.35) : col; return { color: c, borderColor: col, wickColor: col }; }
    if (sh === 'volume'){ let s = 0, m = 0; for (let k = Math.max(0, i - 19); k <= i; k++){ s += v[k].volume || 0; m++; } const rv = s > 0 ? (b.volume || 0) / (s / m) : 1, a = Math.max(0.22, Math.min(1, 0.15 + 0.5 * rv)), col = this.rgba(b.close >= b.open ? UP : DN, a); return { color: col, borderColor: col, wickColor: col }; }
    if (sh === 'power'){ let s = 0, m = 0; for (let k = Math.max(0, i - 19); k <= i; k++){ s += v[k].high - v[k].low; m++; } const p = s > 0 ? Math.abs(b.close - b.open) / (s / m) : 0.5, a = Math.max(0.2, Math.min(1, 0.15 + 0.95 * p)), col = this.rgba(b.close >= b.open ? UP : DN, a); return { color: col, borderColor: col, wickColor: col }; }
    return null;
  },
  cacheFor(sh, v){ if (sh !== 'trend' || typeof ProInd === 'undefined' || v.length < 15) return {};
    const key = v.length + '|' + v[v.length - 2].time; if (!this._st || this._st.key !== key) this._st = { key, dir: ProInd.supertrend(ProInd.prep(v.slice(0, -1))).dir }; return this._st; },

  install(){
    if (typeof Chart === 'undefined' || this._in) return; this._in = true; const self = this;
    const oDisp = Chart.displayCandles.bind(Chart), oData = Chart.priceData.bind(Chart), oRebuild = Chart.rebuildPrice.bind(Chart), oTick = Chart.tickUpdate.bind(Chart);
    Chart.displayCandles = function(){ return self.shape() === 'smooth' ? self.smoothHA(this.view()) : oDisp(); };
    Chart.priceData = function(){ const d = oData(), sh = self.shape(); if (!['hollow', 'trend', 'volume', 'power'].includes(sh)) return d;
      const v = this.view(), cache = self.cacheFor(sh, v); for (let i = 0; i < d.length && i < v.length; i++){ const p = self.paint(sh, v, i, cache); if (p) Object.assign(d[i], p); } return d; };
    Chart.rebuildPrice = function(){
      oRebuild(); const sh = self.shape(), [UP, DN] = self.colors(), t = STORE.chartType;
      try {
        if (t === 'candles' || t === 'heikin') this.priceSeries.applyOptions({ upColor: UP, downColor: DN, wickUpColor: UP, wickDownColor: DN, borderUpColor: UP, borderDownColor: DN, borderVisible: sh === 'hollow' });
        else if (t === 'bars') this.priceSeries.applyOptions({ upColor: UP, downColor: DN });
        else if (sh === 'step') this.priceSeries.applyOptions({ lineType: 1 });
        else if (sh === 'baseline'){ const v = this.view(), avg = v.length ? v.reduce((a, b) => a + b.close, 0) / v.length : 0, prec = this.precision();
          this.main.removeSeries(this.priceSeries);
          this.priceSeries = this.main.addBaselineSeries({ baseValue: { type: 'price', price: avg }, lineWidth: 2, topLineColor: UP, topFillColor1: self.rgba(UP, 0.28), topFillColor2: self.rgba(UP, 0.02),
            bottomLineColor: DN, bottomFillColor1: self.rgba(DN, 0.02), bottomFillColor2: self.rgba(DN, 0.28), priceFormat: { type: 'price', precision: prec, minMove: Math.pow(10, -prec) } }); }
      } catch(e){ console.warn('candle shape', e); }
    };
    Chart.tickUpdate = function(c){
      oTick(c); const sh = self.shape();
      try {
        const v = this.view(), i = v.length - 1; if (i < 1) return;
        if (sh === 'smooth'){ const h = self.smoothHA(v)[i]; this.priceSeries.update({ time: h.time, open: h.open, high: h.high, low: h.low, close: h.close }); }
        else if (['hollow', 'trend', 'volume', 'power'].includes(sh)){ const p = self.paint(sh, v, i, self.cacheFor(sh, v)), b = v[i]; if (p) this.priceSeries.update(Object.assign({ time: b.time, open: b.open, high: b.high, low: b.low, close: b.close }, p)); }
      } catch(e){}
    };
    /* the Chart-type list gains the new shapes; the five original entries keep working as they did */
    const sel = document.getElementById('chartType');
    if (sel){ const have = new Set(['candles', 'heikin', 'bars', 'line', 'area']);
      for (const s of this.SHAPES) if (!(have.has(s[2]) && ['classic', 'heikin', 'bars', 'line', 'area'].includes(s[0]))){ const o = document.createElement('option'); o.value = 'x:' + s[0]; o.textContent = s[1]; sel.appendChild(o); }
      sel.addEventListener('change', e => { const val = sel.value;
        if (val.startsWith('x:')){ e.stopImmediatePropagation(); self.set(val.slice(2)); }
        else localStorage.setItem(self.k(self.KEY), ({ candles: 'classic' })[val] || val); }, true);
    }
  },
};
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => { try { CandleStyles.install(); setTimeout(() => { CandleStyles.sync(); if (CandleStyles.shape() !== 'classic' || CandleStyles.palette() !== 'astra') try { Chart.renderAll(); } catch(e){} }, 1200); } catch(e){ console.warn('CandleStyles', e); } });
