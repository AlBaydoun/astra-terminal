/* ASTRA Terminal — the indicator catalogue.
   Every indicator declares what it draws; the chart decides WHERE it is drawn.
   Each one can sit on the price chart itself or in any of three extra windows,
   and several indicators may share the same window (RSI and Stochastic together,
   for example). Adding a new indicator here is all it takes for it to appear
   everywhere: the dialog, the chart and the live tick updates. */
const INDS = [
  {
    id: 'vol', label: 'Volume', kind: 'osc',
    def: { on: true, target: 'main' },
    params: [],
    build(ctx){
      return [{ key: 'v', type: 'hist', scale: 'vol', margins: { top: 0.82, bottom: 0 },
        data: ctx.v.map(c => ({ time: c.time, value: c.volume,
          color: c.close >= c.open ? 'rgba(46,189,133,0.35)' : 'rgba(246,70,93,0.35)' })) }];
    },
  },
  {
    id: 'ema1', label: 'MA 1', kind: 'price',
    def: { on: true, len: 20, type: 'ema', target: 'main' },
    params: [{ k: 'type', kind: 'sel', opts: [['ema', 'EMA'], ['sma', 'SMA']] }, { k: 'len', kind: 'num', min: 2, max: 500 }],
    color: '#00e5ff',
    build(ctx, c){ return [{ key: 'l', type: 'line', color: '#00e5ff',
      data: ctx.line((c.type === 'sma' ? IND.sma : IND.ema)(ctx.closes, c.len)) }]; },
  },
  {
    id: 'ema2', label: 'MA 2', kind: 'price',
    def: { on: true, len: 50, type: 'ema', target: 'main' },
    params: [{ k: 'type', kind: 'sel', opts: [['ema', 'EMA'], ['sma', 'SMA']] }, { k: 'len', kind: 'num', min: 2, max: 500 }],
    color: '#ffb03a',
    build(ctx, c){ return [{ key: 'l', type: 'line', color: '#ffb03a',
      data: ctx.line((c.type === 'sma' ? IND.sma : IND.ema)(ctx.closes, c.len)) }]; },
  },
  {
    id: 'ema3', label: 'MA 3', kind: 'price',
    def: { on: false, len: 200, type: 'ema', target: 'main' },
    params: [{ k: 'type', kind: 'sel', opts: [['ema', 'EMA'], ['sma', 'SMA']] }, { k: 'len', kind: 'num', min: 2, max: 500 }],
    color: '#ff6bd6',
    build(ctx, c){ return [{ key: 'l', type: 'line', color: '#ff6bd6',
      data: ctx.line((c.type === 'sma' ? IND.sma : IND.ema)(ctx.closes, c.len)) }]; },
  },
  {
    id: 'bb', label: 'Bollinger Bands', kind: 'price',
    def: { on: false, len: 20, mult: 2, target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }, { k: 'mult', kind: 'num', min: 0.5, max: 5, step: 0.5 }],
    color: '#8b6cff',
    build(ctx, c){
      const b = IND.bb(ctx.closes, c.len, c.mult);
      return [
        { key: 'u', type: 'line', color: 'rgba(139,108,255,0.7)', data: ctx.line(b.up) },
        { key: 'm', type: 'line', color: 'rgba(139,108,255,0.45)', data: ctx.line(b.mid) },
        { key: 'l', type: 'line', color: 'rgba(139,108,255,0.7)', data: ctx.line(b.lo) },
      ];
    },
  },
  {
    id: 'vwap', label: 'VWAP (daily)', kind: 'price',
    def: { on: false, target: 'main' },
    params: [],
    color: '#ffd166',
    build(ctx){ return [{ key: 'l', type: 'line', color: '#ffd166', lineStyle: 2, data: ctx.line(IND.vwapDaily(ctx.v)) }]; },
  },
  {
    id: 'st', label: 'SuperTrend', kind: 'price',
    def: { on: false, len: 10, mult: 3, target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }, { k: 'mult', kind: 'num', min: 0.5, max: 10, step: 0.5 }],
    color: '#2ebd85',
    build(ctx, c){
      const s = IND.supertrend(ctx.v, c.len, c.mult);
      return [
        { key: 'u', type: 'line', color: 'rgba(46,189,133,0.9)', width: 2, data: ctx.line(s.up) },
        { key: 'd', type: 'line', color: 'rgba(246,70,93,0.9)', width: 2, data: ctx.line(s.down) },
      ];
    },
  },
  {
    id: 'rsi', label: 'RSI', kind: 'osc',
    def: { on: true, len: 14, target: 'p1' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    color: '#c084fc',
    build(ctx, c){
      return [{ key: 'l', type: 'line', color: '#c084fc', precision: 2,
        levels: [[70, 'rgba(246,70,93,0.5)'], [30, 'rgba(46,189,133,0.5)']],
        data: ctx.line(IND.rsi(ctx.closes, c.len)) }];
    },
  },
  {
    id: 'stoch', label: 'Stochastic', kind: 'osc',
    def: { on: false, k: 14, smooth: 3, d: 3, target: 'p1' },
    params: [{ k: 'k', kind: 'num', min: 2, max: 100 }, { k: 'smooth', kind: 'num', min: 1, max: 50 }, { k: 'd', kind: 'num', min: 1, max: 50 }],
    color: '#00e5ff',
    build(ctx, c){
      const s = IND.stoch(ctx.v, c.k, c.smooth, c.d);
      return [
        { key: 'k', type: 'line', color: '#00e5ff', precision: 2,
          levels: [[80, 'rgba(246,70,93,0.5)'], [20, 'rgba(46,189,133,0.5)']], data: ctx.line(s.k) },
        { key: 'd', type: 'line', color: '#ffb03a', data: ctx.line(s.d) },
      ];
    },
  },
  {
    id: 'macd', label: 'MACD', kind: 'osc',
    def: { on: false, f: 12, s: 26, sig: 9, target: 'p2' },
    params: [{ k: 'f', kind: 'num', min: 2, max: 100 }, { k: 's', kind: 'num', min: 2, max: 200 }, { k: 'sig', kind: 'num', min: 2, max: 100 }],
    color: '#00e5ff',
    build(ctx, c){
      const m = IND.macd(ctx.closes, c.f, c.s, c.sig);
      const hist = [];
      for (let i = 0; i < m.hist.length; i++)
        if (m.hist[i] != null) hist.push({ time: ctx.v[i].time, value: m.hist[i],
          color: m.hist[i] >= 0 ? 'rgba(46,189,133,0.5)' : 'rgba(246,70,93,0.5)' });
      return [
        { key: 'h', type: 'hist', precision: 4, data: hist },
        { key: 'm', type: 'line', color: '#00e5ff', data: ctx.line(m.macd) },
        { key: 's', type: 'line', color: '#ffb03a', data: ctx.line(m.signal) },
      ];
    },
  },
  {
    id: 'atr', label: 'ATR', kind: 'osc',
    def: { on: false, len: 14, target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    color: '#ff9f6b',
    build(ctx, c){ return [{ key: 'l', type: 'line', color: '#ff9f6b', data: ctx.line(IND.atr(ctx.v, c.len)) }]; },
  },
  {
    id: 'adx', label: 'ADX + DI', kind: 'osc',
    def: { on: false, len: 14, target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    color: '#7dd3fc',
    build(ctx, c){
      const a = IND.adx(ctx.v, c.len);
      return [
        { key: 'a', type: 'line', color: '#7dd3fc', width: 2, precision: 2,
          levels: [[25, 'rgba(120,150,220,0.45)']], data: ctx.line(a.adx) },
        { key: 'p', type: 'line', color: '#2ebd85', data: ctx.line(a.pdi) },
        { key: 'm', type: 'line', color: '#f6465d', data: ctx.line(a.mdi) },
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
