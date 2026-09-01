/* ASTRA Terminal — the indicator catalogue.
   Each entry declares WHAT it draws; the chart decides WHERE (price chart or any
   of three windows, shared or alone) and the settings decide HOW it looks
   (colour of every line, thickness, solid/dashed) and WHAT PRICE it reads
   ("Apply to", exactly as in MetaTrader: Close, Open, High, Low, Median…).
   Adding an indicator here makes it appear everywhere automatically. */

const MA_TYPES = [['ema', 'EMA'], ['sma', 'SMA'], ['wma', 'WMA'], ['smma', 'SMMA']];
function maOf(v, n, type){
  if (type === 'sma') return IND.sma(v, n);
  if (type === 'wma') return IND.wma(v, n);
  if (type === 'smma') return IND.smma(v, n);
  return IND.ema(v, n);
}

const INDS = [
  /* ============================ ON THE PRICE ============================ */
  {
    id: 'vol', label: 'Volume', kind: 'osc',
    def: { on: true, target: 'main' }, params: [],
    parts: [{ key: 'v', label: 'Bars', color: '#3d5a80' }],
    build(ctx){
      return [{ key: 'v', type: 'hist', scale: 'vol', margins: { top: 0.82, bottom: 0 },
        data: ctx.v.map(c => ({ time: c.time, value: c.volume,
          color: c.close >= c.open ? 'rgba(46,189,133,0.35)' : 'rgba(246,70,93,0.35)' })) }];
    },
  },
  ...[['ema1', 'MA 1', 20, true, '#00e5ff'], ['ema2', 'MA 2', 50, true, '#ffb03a'], ['ema3', 'MA 3', 200, false, '#ff6bd6']]
    .map(([id, label, len, on, color]) => ({
      id, label, kind: 'price', applyTo: true,
      def: { on, len, type: 'ema', src: 'close', target: 'main' },
      params: [{ k: 'type', kind: 'sel', opts: MA_TYPES }, { k: 'len', kind: 'num', min: 2, max: 500 }],
      parts: [{ key: 'l', label: 'Line', color }],
      build(ctx, c){ return [{ key: 'l', data: ctx.line(maOf(ctx.srcOf(c), c.len, c.type)) }]; },
    })),
  {
    id: 'bb', label: 'Bollinger Bands', kind: 'price', applyTo: true,
    def: { on: false, len: 20, mult: 2, src: 'close', target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }, { k: 'mult', kind: 'num', min: 0.5, max: 5, step: 0.5 }],
    parts: [{ key: 'u', label: 'Upper', color: '#8b6cff' }, { key: 'm', label: 'Middle', color: '#6b5bb8' }, { key: 'l', label: 'Lower', color: '#8b6cff' }],
    build(ctx, c){
      const b = IND.bb(ctx.srcOf(c), c.len, c.mult);
      return [{ key: 'u', data: ctx.line(b.up) }, { key: 'm', data: ctx.line(b.mid) }, { key: 'l', data: ctx.line(b.lo) }];
    },
  },
  {
    id: 'env', label: 'Envelopes', kind: 'price', applyTo: true,
    def: { on: false, len: 20, pct: 1, src: 'close', target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }, { k: 'pct', kind: 'num', min: 0.1, max: 20, step: 0.1 }],
    parts: [{ key: 'u', label: 'Upper', color: '#7dd3fc' }, { key: 'l', label: 'Lower', color: '#7dd3fc' }],
    build(ctx, c){
      const e = IND.envelopes(ctx.srcOf(c), c.len, c.pct);
      return [{ key: 'u', data: ctx.line(e.up) }, { key: 'l', data: ctx.line(e.lo) }];
    },
  },
  {
    id: 'kelt', label: 'Keltner Channel', kind: 'price',
    def: { on: false, len: 20, mult: 2, target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }, { k: 'mult', kind: 'num', min: 0.5, max: 6, step: 0.5 }],
    parts: [{ key: 'u', label: 'Upper', color: '#5eead4' }, { key: 'm', label: 'Middle', color: '#2dd4bf' }, { key: 'l', label: 'Lower', color: '#5eead4' }],
    build(ctx, c){
      const k = IND.keltner(ctx.v, c.len, c.mult);
      return [{ key: 'u', data: ctx.line(k.up) }, { key: 'm', data: ctx.line(k.mid) }, { key: 'l', data: ctx.line(k.lo) }];
    },
  },
  {
    id: 'donch', label: 'Donchian Channel', kind: 'price',
    def: { on: false, len: 20, target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }],
    parts: [{ key: 'u', label: 'High', color: '#f472b6' }, { key: 'l', label: 'Low', color: '#f472b6' }],
    build(ctx, c){
      const d = IND.donchian(ctx.v, c.len);
      return [{ key: 'u', data: ctx.line(d.hi) }, { key: 'l', data: ctx.line(d.lo) }];
    },
  },
  {
    id: 'vwap', label: 'VWAP (daily)', kind: 'price',
    def: { on: false, target: 'main' }, params: [],
    parts: [{ key: 'l', label: 'Line', color: '#ffd166' }],
    build(ctx){ return [{ key: 'l', lineStyle: 2, data: ctx.line(IND.vwapDaily(ctx.v)) }]; },
  },
  {
    id: 'st', label: 'SuperTrend', kind: 'price',
    def: { on: false, len: 10, mult: 3, target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }, { k: 'mult', kind: 'num', min: 0.5, max: 10, step: 0.5 }],
    parts: [{ key: 'u', label: 'Rising', color: '#2ebd85' }, { key: 'd', label: 'Falling', color: '#f6465d' }],
    build(ctx, c){
      const s = IND.supertrend(ctx.v, c.len, c.mult);
      return [{ key: 'u', width: 2, data: ctx.line(s.up) }, { key: 'd', width: 2, data: ctx.line(s.down) }];
    },
  },
  {
    id: 'psar', label: 'Parabolic SAR', kind: 'price',
    def: { on: false, step: 0.02, max: 0.2, target: 'main' },
    params: [{ k: 'step', kind: 'num', min: 0.001, max: 0.2, step: 0.001 }, { k: 'max', kind: 'num', min: 0.05, max: 1, step: 0.05 }],
    parts: [{ key: 'd', label: 'Dots', color: '#e879f9' }],
    build(ctx, c){
      return [{ key: 'd', dots: true, data: ctx.line(IND.psar(ctx.v, c.step, c.max)) }];
    },
  },
  {
    id: 'alli', label: 'Alligator', kind: 'price',
    def: { on: false, target: 'main' }, params: [],
    parts: [{ key: 'j', label: 'Jaw', color: '#3b82f6' }, { key: 't', label: 'Teeth', color: '#ef4444' }, { key: 'p', label: 'Lips', color: '#22c55e' }],
    build(ctx){
      const a = IND.alligator(ctx.v);
      return [{ key: 'j', data: ctx.line(a.jaw) }, { key: 't', data: ctx.line(a.teeth) }, { key: 'p', data: ctx.line(a.lips) }];
    },
  },
  {
    id: 'ichi', label: 'Ichimoku Cloud', kind: 'price',
    def: { on: false, t: 9, k: 26, b: 52, target: 'main' },
    params: [{ k: 't', kind: 'num', min: 2, max: 60 }, { k: 'k', kind: 'num', min: 2, max: 120 }, { k: 'b', kind: 'num', min: 2, max: 240 }],
    parts: [
      { key: 'tk', label: 'Conversion', color: '#00e5ff' }, { key: 'kj', label: 'Base', color: '#f6465d' },
      { key: 'sa', label: 'Span A', color: 'rgba(46,189,133,0.75)' }, { key: 'sb', label: 'Span B', color: 'rgba(246,70,93,0.6)' },
      { key: 'ch', label: 'Lagging', color: '#a78bfa' },
    ],
    build(ctx, c){
      const i = IND.ichimokuFull(ctx.v, c.t, c.k, c.b);
      return [
        { key: 'tk', data: ctx.line(i.tenkan) }, { key: 'kj', data: ctx.line(i.kijun) },
        { key: 'sa', data: ctx.line(i.senkouA) }, { key: 'sb', data: ctx.line(i.senkouB) },
        { key: 'ch', lineStyle: 2, data: ctx.line(i.chikou) },
      ];
    },
  },
  {
    id: 'piv', label: 'Pivot Points (daily)', kind: 'price',
    note: 'Needs a completed previous day on screen — on 1S/30S/1m charts the range is too short, so use 5m or higher.',
    def: { on: false, target: 'main' }, params: [],
    parts: [
      { key: 'p', label: 'Pivot', color: '#ffd166' },
      { key: 'r1', label: 'R1', color: 'rgba(246,70,93,0.7)' }, { key: 's1', label: 'S1', color: 'rgba(46,189,133,0.7)' },
      { key: 'r2', label: 'R2', color: 'rgba(246,70,93,0.4)' }, { key: 's2', label: 'S2', color: 'rgba(46,189,133,0.4)' },
    ],
    build(ctx){
      const p = IND.pivots(ctx.v);
      return ['p', 'r1', 's1', 'r2', 's2'].map(k => ({ key: k, lineStyle: k === 'p' ? 0 : 2, data: ctx.line(p[k]) }));
    },
  },
  {
    id: 'frac', label: 'Fractals', kind: 'price',
    def: { on: false, target: 'main' }, params: [],
    parts: [{ key: 'u', label: 'Tops', color: '#f6465d' }, { key: 'd', label: 'Bottoms', color: '#2ebd85' }],
    build(ctx){
      const f = IND.fractals(ctx.v);
      return [{ key: 'u', dots: true, radius: 3, data: ctx.line(f.up) }, { key: 'd', dots: true, radius: 3, data: ctx.line(f.dn) }];
    },
  },

  /* ============================ IN A WINDOW ============================ */
  {
    id: 'rsi', label: 'RSI', kind: 'osc', applyTo: true, range: [0, 100],
    def: { on: true, len: 14, src: 'close', target: 'p1' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#c084fc' }],
    build(ctx, c){
      return [{ key: 'l', precision: 2, levels: [[70, 'rgba(246,70,93,0.5)'], [30, 'rgba(46,189,133,0.5)']],
        data: ctx.line(IND.rsi(ctx.srcOf(c), c.len)) }];
    },
  },
  {
    id: 'stoch', label: 'Stochastic', kind: 'osc', range: [0, 100],
    def: { on: false, k: 14, smooth: 3, d: 3, target: 'p1' },
    params: [{ k: 'k', kind: 'num', min: 2, max: 100 }, { k: 'smooth', kind: 'num', min: 1, max: 50 }, { k: 'd', kind: 'num', min: 1, max: 50 }],
    parts: [{ key: 'k', label: '%K', color: '#00e5ff' }, { key: 'd', label: '%D', color: '#ffb03a' }],
    build(ctx, c){
      const s = IND.stoch(ctx.v, c.k, c.smooth, c.d);
      return [
        { key: 'k', precision: 2, levels: [[80, 'rgba(246,70,93,0.5)'], [20, 'rgba(46,189,133,0.5)']], data: ctx.line(s.k) },
        { key: 'd', data: ctx.line(s.d) },
      ];
    },
  },
  {
    id: 'macd', label: 'MACD', kind: 'osc', applyTo: true,
    def: { on: false, f: 12, s: 26, sig: 9, src: 'close', target: 'p2' },
    params: [{ k: 'f', kind: 'num', min: 2, max: 100 }, { k: 's', kind: 'num', min: 2, max: 200 }, { k: 'sig', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'h', label: 'Histogram', color: '#3d5a80' }, { key: 'm', label: 'MACD', color: '#00e5ff' }, { key: 's', label: 'Signal', color: '#ffb03a' }],
    build(ctx, c){
      const m = IND.macd(ctx.srcOf(c), c.f, c.s, c.sig);
      const hist = [];
      for (let i = 0; i < m.hist.length; i++)
        if (m.hist[i] != null) hist.push({ time: ctx.v[i].time, value: m.hist[i],
          color: m.hist[i] >= 0 ? 'rgba(46,189,133,0.5)' : 'rgba(246,70,93,0.5)' });
      return [{ key: 'h', type: 'hist', precision: 4, data: hist },
        { key: 'm', data: ctx.line(m.macd) }, { key: 's', data: ctx.line(m.signal) }];
    },
  },
  {
    id: 'cci', label: 'CCI', kind: 'osc',
    def: { on: false, len: 20, target: 'p2' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }],
    parts: [{ key: 'l', label: 'Line', color: '#fb923c' }],
    build(ctx, c){
      return [{ key: 'l', precision: 1, levels: [[100, 'rgba(246,70,93,0.45)'], [-100, 'rgba(46,189,133,0.45)']],
        data: ctx.line(IND.cci(ctx.v, c.len)) }];
    },
  },
  {
    id: 'wpr', label: 'Williams %R', kind: 'osc', range: [-100, 0],
    def: { on: false, len: 14, target: 'p2' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#facc15' }],
    build(ctx, c){
      return [{ key: 'l', precision: 1, levels: [[-20, 'rgba(246,70,93,0.45)'], [-80, 'rgba(46,189,133,0.45)']],
        data: ctx.line(IND.williamsR(ctx.v, c.len)) }];
    },
  },
  {
    id: 'mfi', label: 'Money Flow Index', kind: 'osc', range: [0, 100],
    def: { on: false, len: 14, target: 'p2' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#34d399' }],
    build(ctx, c){
      return [{ key: 'l', precision: 1, levels: [[80, 'rgba(246,70,93,0.45)'], [20, 'rgba(46,189,133,0.45)']],
        data: ctx.line(IND.mfi(ctx.v, c.len)) }];
    },
  },
  {
    id: 'obv', label: 'On Balance Volume', kind: 'osc',
    def: { on: false, target: 'p3' }, params: [],
    parts: [{ key: 'l', label: 'Line', color: '#60a5fa' }],
    build(ctx){ return [{ key: 'l', data: ctx.line(IND.obv(ctx.v)) }]; },
  },
  {
    id: 'mom', label: 'Momentum', kind: 'osc', applyTo: true,
    def: { on: false, len: 14, src: 'close', target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 1, max: 200 }],
    parts: [{ key: 'l', label: 'Line', color: '#a3e635' }],
    build(ctx, c){
      return [{ key: 'l', precision: 2, levels: [[100, 'rgba(120,150,220,0.45)']],
        data: ctx.line(IND.momentum(ctx.srcOf(c), c.len)) }];
    },
  },
  {
    id: 'ao', label: 'Awesome Oscillator', kind: 'osc',
    def: { on: false, target: 'p3' }, params: [],
    parts: [{ key: 'h', label: 'Bars', color: '#38bdf8' }],
    build(ctx){
      const a = IND.ao(ctx.v);
      const data = [];
      for (let i = 1; i < a.length; i++)
        if (a[i] != null) data.push({ time: ctx.v[i].time, value: a[i],
          color: (a[i - 1] == null || a[i] >= a[i - 1]) ? 'rgba(46,189,133,0.6)' : 'rgba(246,70,93,0.6)' });
      return [{ key: 'h', type: 'hist', precision: 4, data }];
    },
  },
  {
    id: 'dem', label: 'DeMarker', kind: 'osc', range: [0, 1],
    def: { on: false, len: 14, target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#f0abfc' }],
    build(ctx, c){
      return [{ key: 'l', precision: 3, levels: [[0.7, 'rgba(246,70,93,0.45)'], [0.3, 'rgba(46,189,133,0.45)']],
        data: ctx.line(IND.demarker(ctx.v, c.len)) }];
    },
  },
  {
    id: 'force', label: 'Force Index', kind: 'osc',
    def: { on: false, len: 13, target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 1, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#fca5a5' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.forceIndex(ctx.v, c.len)) }]; },
  },
  {
    id: 'atr', label: 'ATR', kind: 'osc',
    def: { on: false, len: 14, target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#ff9f6b' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.atr(ctx.v, c.len)) }]; },
  },
  {
    id: 'sdev', label: 'Standard Deviation', kind: 'osc', applyTo: true,
    def: { on: false, len: 20, src: 'close', target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }],
    parts: [{ key: 'l', label: 'Line', color: '#c7d2fe' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.stdev(ctx.srcOf(c), c.len)) }]; },
  },
  {
    id: 'adx', label: 'ADX + DI', kind: 'osc', range: [0, 100],
    def: { on: false, len: 14, target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'a', label: 'ADX', color: '#7dd3fc' }, { key: 'p', label: '+DI', color: '#2ebd85' }, { key: 'm', label: '−DI', color: '#f6465d' }],
    build(ctx, c){
      const a = IND.adx(ctx.v, c.len);
      return [
        { key: 'a', width: 2, precision: 2, levels: [[25, 'rgba(120,150,220,0.45)']], data: ctx.line(a.adx) },
        { key: 'p', data: ctx.line(a.pdi) }, { key: 'm', data: ctx.line(a.mdi) },
      ];
    },
  },
];

const IND_BY_ID = {};
for (const d of INDS) IND_BY_ID[d.id] = d;

/* the windows an indicator can be sent to */
const IND_TARGETS = [
  ['main', 'Price chart'],
  ['p1', 'Window 1'],
  ['p2', 'Window 2'],
  ['p3', 'Window 3'],
];

/* line appearance */
const IND_STYLES = [[0, 'Solid'], [1, 'Dotted'], [2, 'Dashed'], [3, 'Large dash']];
