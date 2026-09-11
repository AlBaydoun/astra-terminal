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
    /* Exactly as MetaTrader 5 ships it (Insert → Indicators → Oscillators →
       Relative Strength Index): Wilder smoothing, period 14, applied to Close,
       drawn DodgerBlue on a scale FIXED at 0–100, with Silver dotted level
       lines at 30 and 70 that you can edit or add to, as in MT5's Levels tab.
       The old version autoscaled, so the 30/70 lines wandered up and down the
       window as the RSI moved — that is what "shows differently" meant. */
    id: 'rsi', label: 'Relative Strength Index', kind: 'osc', applyTo: true,
    range: [0, 100], fixed: true,
    note: 'MetaTrader 5 RSI: RSI = 100 − 100 / (1 + U/D), where U and D are the Wilder-smoothed average up and down closes over the period. Scale fixed 0–100. Levels are a comma list, exactly as in MT5\u2019s Levels tab.',
    def: { on: true, len: 14, src: 'close', levels: '30,70', target: 'p1' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 500, label: 'Period' }],
    parts: [{ key: 'l', label: 'RSI', color: '#1e90ff' }],
    /* the 30/70 lines come from the generic Levels tab (cfg.levels), the same
       machinery every other indicator now has */
    build(ctx, c){
      return [{ key: 'l', precision: 2, data: ctx.line(IND.rsi(ctx.srcOf(c), c.len)) }];
    },
  },
  {
    id: 'stoch', label: 'Stochastic', kind: 'osc', fixed: true, range: [0, 100],
    def: { on: false, k: 14, smooth: 3, d: 3, target: 'p1', levels: '20,80' },
    params: [{ k: 'k', kind: 'num', min: 2, max: 100 }, { k: 'smooth', kind: 'num', min: 1, max: 50 }, { k: 'd', kind: 'num', min: 1, max: 50 }],
    parts: [{ key: 'k', label: '%K', color: '#00e5ff' }, { key: 'd', label: '%D', color: '#ffb03a' }],
    build(ctx, c){
      const s = IND.stoch(ctx.v, c.k, c.smooth, c.d);
      return [
        { key: 'k', precision: 2, data: ctx.line(s.k) },
        { key: 'd', data: ctx.line(s.d) },
      ];
    },
  },
  {
    id: 'macd', label: 'MACD (EMA signal)', kind: 'osc', applyTo: true,
    note: 'ASTRA original: EMA signal line and difference histogram. Choose MACD (MetaTrader) for the broker-style SMA signal and MACD bars.',
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
    id: 'cci', label: 'Commodity Channel Index (CCI)', kind: 'osc',
    def: { on: false, len: 20, target: 'p2', levels: '-100,100' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200 }],
    parts: [{ key: 'l', label: 'Line', color: '#fb923c' }],
    build(ctx, c){
      return [{ key: 'l', precision: 1, 
        data: ctx.line(IND.cci(ctx.v, c.len)) }];
    },
  },
  {
    id: 'wpr', label: 'Williams %R', kind: 'osc', fixed: true, range: [-100, 0],
    def: { on: false, len: 14, target: 'p2', levels: '-80,-20' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#facc15' }],
    build(ctx, c){
      return [{ key: 'l', precision: 1, 
        data: ctx.line(IND.williamsR(ctx.v, c.len)) }];
    },
  },
  {
    id: 'mfi', label: 'Money Flow Index', kind: 'osc', fixed: true, range: [0, 100],
    def: { on: false, len: 14, target: 'p2', levels: '20,80' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#34d399' }],
    build(ctx, c){
      return [{ key: 'l', precision: 1, 
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
    id: 'dem', label: 'DeMarker', kind: 'osc', fixed: true, range: [0, 1],
    def: { on: false, len: 14, target: 'p3', levels: '0.3,0.7' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100 }],
    parts: [{ key: 'l', label: 'Line', color: '#f0abfc' }],
    build(ctx, c){
      return [{ key: 'l', precision: 3, 
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
    id: 'atr', label: 'Average True Range (ATR)', kind: 'osc',
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

// These are additional chart definitions: existing saved MACD and bot math stay intact.
INDS.push(
  {
    id:'macd_mt5',label:'MACD (MetaTrader)',kind:'osc',applyTo:true,
    note:'MetaTrader-style MACD: fast EMA minus slow EMA, displayed as bars, with a simple moving-average signal. Defaults 12 / 26 / 9. Warm-up history can cause small differences from MT5.',
    def:{on:false,f:12,s:26,sig:9,src:'close',target:'p2'},
    params:[{k:'f',kind:'num',min:2,max:100},{k:'s',kind:'num',min:2,max:200},{k:'sig',kind:'num',min:2,max:100}],
    parts:[{key:'m',label:'MACD bars',color:'#2ebd85'},{key:'s',label:'Signal (SMA)',color:'#ffb03a'}],
    build(ctx,c){const m=MT5Osc.macd(ctx.srcOf(c),c.f,c.s,c.sig);return [{key:'m',type:'hist',precision:5,levels:[[0,'#65748b']],data:MT5Osc.histogram(ctx,m.main)},{key:'s',lineStyle:2,data:ctx.line(m.signal)}];},
  },
  {
    id:'osma',label:'Moving Average of Oscillator (OsMA)',kind:'osc',applyTo:true,
    note:'Difference between MetaTrader-style MACD and its SMA signal. Not the MACD main bars.',
    def:{on:false,f:12,s:26,sig:9,src:'close',target:'p2'},
    params:[{k:'f',kind:'num',min:2,max:100},{k:'s',kind:'num',min:2,max:200},{k:'sig',kind:'num',min:2,max:100}],
    parts:[{key:'h',label:'OsMA bars',color:'#2ebd85'}],
    build(ctx,c){return [{key:'h',type:'hist',precision:5,levels:[[0,'#65748b']],data:MT5Osc.histogram(ctx,MT5Osc.macd(ctx.srcOf(c),c.f,c.s,c.sig).osma)}];},
  },
  ...[['bull','Bulls Power'],['bear','Bears Power']].map(([side,label])=>({
    id:side+'power',label,kind:'osc',
    note:(side==='bull'?'High':'Low')+' minus the EMA of close. Default period 13.',
    def:{on:false,len:13,target:'p3'},params:[{k:'len',kind:'num',min:2,max:200}],
    parts:[{key:'h',label:'Power',color:side==='bull'?'#2ebd85':'#f6465d'}],
    build(ctx,c){return [{key:'h',type:'hist',precision:5,levels:[[0,'#65748b']],data:MT5Osc.histogram(ctx,MT5Osc.power(ctx.v,c.len,side))}];},
  })),
  {
    id:'chaikin',label:'Chaikin Oscillator',kind:'osc',
    note:'Fast minus slow EMA of Accumulation/Distribution. Uses the chart’s volume; JustMarkets commonly supplies tick activity, not exchange-wide traded volume.',
    def:{on:false,f:3,s:10,target:'p3'},params:[{k:'f',kind:'num',min:2,max:100},{k:'s',kind:'num',min:2,max:200}],
    parts:[{key:'l',label:'Chaikin',color:'#38bdf8'}],
    build(ctx,c){return [{key:'l',levels:[[0,'#65748b']],data:ctx.line(MT5Osc.chaikin(ctx.v,c.f,c.s))}];},
  },
  {
    id:'rvi',label:'Relative Vigor Index (RVI)',kind:'osc',
    note:'Smoothed close-minus-open divided by smoothed high-minus-low, with a four-bar weighted signal. Default period 10.',
    def:{on:false,len:10,target:'p3'},params:[{k:'len',kind:'num',min:2,max:200}],
    parts:[{key:'m',label:'RVI',color:'#2ebd85'},{key:'s',label:'Signal',color:'#f6465d'}],
    build(ctx,c){const r=MT5Osc.rvi(ctx.v,c.len);return [{key:'m',precision:4,levels:[[0,'#65748b']],data:ctx.line(r.main)},{key:'s',data:ctx.line(r.signal)}];},
  },
  {
    id:'trix',label:'Triple Exponential Average (TRIX)',kind:'osc',applyTo:true,
    note:'One-bar fractional change of a triple-smoothed EMA. Ratio units, not percent. Default period 14.',
    def:{on:false,len:14,src:'close',target:'p3'},params:[{k:'len',kind:'num',min:2,max:200}],
    parts:[{key:'l',label:'TRIX',color:'#c084fc'}],
    build(ctx,c){return [{key:'l',precision:6,levels:[[0,'#65748b']],data:ctx.line(MT5Osc.trix(ctx.srcOf(c),c.len))}];},
  }
);

/* ---------- the MetaTrader indicators that were still missing ----------
   Trend: AMA, ADX (EMA-smoothed), DEMA, TEMA, FRAMA, VIDYA.
   Volumes: Accumulation/Distribution.
   Bill Williams: Accelerator, Gator, Market Facilitation Index.
   With these, every indicator on all four pages of the MT5 help is present. */
INDS.push(
  {
    id: 'ama', label: 'Adaptive Moving Average', kind: 'price', applyTo: true, cat: 'trend',
    note: 'Kaufman AMA. MT5 defaults: period 9, fast EMA 2, slow EMA 30. Follows price quickly in a trend and slows to a crawl in chop.',
    def: { on: false, len: 9, fast: 2, slow: 30, src: 'close', target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200, label: 'Period' },
             { k: 'fast', kind: 'num', min: 1, max: 50, label: 'Fast EMA' },
             { k: 'slow', kind: 'num', min: 2, max: 200, label: 'Slow EMA' }],
    parts: [{ key: 'l', label: 'AMA', color: '#ff4500' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.ama(ctx.srcOf(c), c.len, c.fast, c.slow)) }]; },
  },
  {
    id: 'adxc', label: 'Average Directional Movement Index', kind: 'osc', cat: 'trend', range: [0, 100],
    note: 'MT5\u2019s ADX with exponential smoothing. The Wilder variant (MT5 \u201cADX Wilder\u201d) is the separate entry below.',
    def: { on: false, len: 14, target: 'p3' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 100, label: 'Period' }],
    parts: [{ key: 'a', label: 'ADX', color: '#7dd3fc' }, { key: 'p', label: '+DI', color: '#2ebd85' }, { key: 'm', label: '\u2212DI', color: '#f6465d' }],
    build(ctx, c){
      const a = IND.adxClassic(ctx.v, c.len);
      return [{ key: 'a', width: 2, precision: 2, data: ctx.line(a.adx) },
              { key: 'p', lineStyle: 1, data: ctx.line(a.pdi) }, { key: 'm', lineStyle: 1, data: ctx.line(a.mdi) }];
    },
  },
  {
    id: 'dema', label: 'Double Exponential Moving Average', kind: 'price', applyTo: true, cat: 'trend',
    note: 'MT5 default period 14. Two stacked EMAs with the lag subtracted out.',
    def: { on: false, len: 14, src: 'close', target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 500, label: 'Period' }],
    parts: [{ key: 'l', label: 'DEMA', color: '#ff6bd6' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.dema(ctx.srcOf(c), c.len)) }]; },
  },
  {
    id: 'tema', label: 'Triple Exponential Moving Average', kind: 'price', applyTo: true, cat: 'trend',
    note: 'MT5 default period 14. Three stacked EMAs, lag removed twice.',
    def: { on: false, len: 14, src: 'close', target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 500, label: 'Period' }],
    parts: [{ key: 'l', label: 'TEMA', color: '#f472b6' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.tema(ctx.srcOf(c), c.len)) }]; },
  },
  {
    id: 'frama', label: 'Fractal Adaptive Moving Average', kind: 'price', cat: 'trend',
    note: 'MT5 default period 14 (must be even). The fractal dimension of the recent range sets how fast it follows.',
    def: { on: false, len: 14, target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 4, max: 200, step: 2, label: 'Period' }],
    parts: [{ key: 'l', label: 'FRAMA', color: '#fbbf24' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.frama(ctx.v, c.len)) }]; },
  },
  {
    id: 'vidya', label: 'Variable Index Dynamic Average', kind: 'price', applyTo: true, cat: 'trend',
    note: 'MT5 defaults: CMO period 9, EMA period 12. The Chande Momentum Oscillator scales the smoothing.',
    def: { on: false, cmo: 9, len: 12, src: 'close', target: 'main' },
    params: [{ k: 'cmo', kind: 'num', min: 2, max: 100, label: 'CMO period' },
             { k: 'len', kind: 'num', min: 2, max: 200, label: 'EMA period' }],
    parts: [{ key: 'l', label: 'VIDYA', color: '#a3e635' }],
    build(ctx, c){ return [{ key: 'l', data: ctx.line(IND.vidya(ctx.srcOf(c), c.cmo, c.len)) }]; },
  },
  {
    id: 'ad', label: 'Accumulation/Distribution', kind: 'osc', cat: 'vol',
    note: 'Running total of volume weighted by where each close sat in its bar. No parameters, as in MT5.',
    def: { on: false, target: 'p3' }, params: [],
    parts: [{ key: 'l', label: 'A/D', color: '#32cd32' }],
    build(ctx){ return [{ key: 'l', precision: 0, data: ctx.line(IND.ad(ctx.v)) }]; },
  },
  {
    id: 'ac', label: 'Accelerator Oscillator', kind: 'osc', cat: 'bw',
    note: 'Bill Williams: Awesome Oscillator minus its 5-period average. Green bar when rising, red when falling, as in MT5.',
    def: { on: false, target: 'p3' }, params: [],
    parts: [{ key: 'h', label: 'AC', color: '#2ebd85', noHide: true }],
    build(ctx){
      const ac = IND.ac(ctx.v);
      const data = [];
      for (let i = 0; i < ac.length; i++){
        if (ac[i] == null) continue;
        const rising = ac[i - 1] != null ? ac[i] >= ac[i - 1] : true;
        data.push({ time: ctx.v[i].time, value: ac[i], color: rising ? '#2ebd85' : '#f6465d' });
      }
      return [{ key: 'h', type: 'hist', precision: 5, levels: [[0, '#65748b']], data }];
    },
  },
  {
    id: 'gator', label: 'Gator Oscillator', kind: 'osc', cat: 'bw',
    note: 'Bill Williams: how far apart the Alligator\u2019s lines are. Upper bars = jaw \u2212 teeth, lower bars = teeth \u2212 lips drawn downward. Green while the gap widens, red while it narrows.',
    def: { on: false, target: 'p3' }, params: [],
    parts: [{ key: 'u', label: 'Upper', color: '#2ebd85', noHide: true }, { key: 'd', label: 'Lower', color: '#f6465d', noHide: true }],
    build(ctx){
      const g = IND.gator(ctx.v);
      const paint = (arr, sign) => {
        const out = [];
        for (let i = 0; i < arr.length; i++){
          if (arr[i] == null) continue;
          const grow = arr[i - 1] != null ? Math.abs(arr[i]) >= Math.abs(arr[i - 1]) : true;
          out.push({ time: ctx.v[i].time, value: arr[i], color: grow ? '#2ebd85' : '#f6465d' });
        }
        return out;
      };
      return [{ key: 'u', type: 'hist', precision: 5, levels: [[0, '#65748b']], data: paint(g.up, 1) },
              { key: 'd', type: 'hist', precision: 5, data: paint(g.dn, -1) }];
    },
  },
  {
    id: 'bwmfi', label: 'Market Facilitation Index', kind: 'osc', cat: 'bw',
    note: 'Bill Williams: bar range per unit of volume, in MT5\u2019s four colours \u2014 green (MFI and volume both up), brown (both down), blue (MFI up, volume down: a fake), pink (MFI down, volume up: a squat).',
    def: { on: false, target: 'p3' }, params: [],
    parts: [{ key: 'h', label: 'MFI', color: '#2ebd85', noHide: true }],
    build(ctx){
      const m = IND.bwmfi(ctx.v);
      const COL = { green: '#32cd32', brown: '#8b4513', blue: '#1e90ff', pink: '#ff69b4' };
      const data = [];
      for (let i = 0; i < m.mfi.length; i++){
        if (m.mfi[i] == null) continue;
        data.push({ time: ctx.v[i].time, value: m.mfi[i], color: COL[m.state[i]] || '#65748b' });
      }
      return [{ key: 'h', type: 'hist', precision: 8, data }];
    },
  }
);

/* ---------- support & resistance on the chart ----------
   The strongest levels the market has turned at, drawn flat across the window.
   Green = support (turned up there), red = resistance (turned down), amber =
   both. Thicker = touched more often. These are the same levels the Triple
   Confirmation bot reads, so what you see is what it trades against. */
INDS.push({
  id: 'srl', label: 'Support & Resistance', kind: 'price', cat: 'other',
  note: 'Swing highs and lows within a lookback, merged when they sit within a fraction of ATR of each other. Strength is the number of touches, weighted to recent ones.',
  def: { on: false, wing: 3, lookback: 300, tolAtr: 0.35, max: 6, target: 'main' },
  params: [
    { k: 'wing', kind: 'num', min: 1, max: 10, label: 'Swing width (bars each side)' },
    { k: 'lookback', kind: 'num', min: 50, max: 1000, label: 'Lookback (bars)' },
    { k: 'tolAtr', kind: 'num', min: 0.1, max: 2, step: 0.05, label: 'Merge within (× ATR)' },
    { k: 'max', kind: 'num', min: 1, max: 12, label: 'Levels shown' },
  ],
  parts: [{ key: 'sup', label: 'Support', color: '#2ebd85' }, { key: 'res', label: 'Resistance', color: '#f6465d' },
          { key: 'both', label: 'Both', color: '#ffb03a' }],
  build(ctx, c){
    const lv = IND.srLevels(ctx.v, { wing: c.wing, lookback: c.lookback, tolAtr: c.tolAtr, max: c.max });
    const cols = Object.assign({ sup: '#2ebd85', res: '#f6465d', both: '#ffb03a' }, c.colors || {});
    return lv.map((L, k) => {
      const part = L.kind === 'support' ? 'sup' : L.kind === 'resistance' ? 'res' : 'both';
      return { key: 'l' + k, color: cols[part], width: Math.min(4, 1 + Math.floor(L.touches / 2)),
        lineStyle: L.touches >= 3 ? 0 : 2,
        data: ctx.v.slice(Math.max(0, L.last - 1)).map(b => ({ time: b.time, value: L.price })) };
    });
  },
});

/* ---------- which tab each indicator lives in ----------
   The four groups are MetaTrader's own (Trend, Oscillators, Volumes, Bill
   Williams); "More" holds the ASTRA extras MT5 does not ship. Anything not
   listed here is an ASTRA extra by definition, so a new indicator can never
   vanish from the dialog by being unclassified. */
const IND_CATS = {
  trend: ['ema1', 'ema2', 'ema3', 'bb', 'env', 'psar', 'ichi', 'sdev', 'adx', 'adxc',
          'ama', 'dema', 'tema', 'frama', 'vidya'],
  oscillators: ['atr', 'bearpower', 'bullpower', 'chaikin', 'cci', 'dem', 'force', 'macd', 'macd_mt5',
                'mom', 'osma', 'rsi', 'rvi', 'stoch', 'trix', 'wpr'],
  vol: ['vol', 'mfi', 'obv', 'ad'],
  bw: ['ao', 'alli', 'frac', 'ac', 'gator', 'bwmfi'],
};
for (const def of INDS){
  def.category = 'other';
  for (const [cat, ids] of Object.entries(IND_CATS)) if (ids.indexOf(def.id) !== -1) def.category = cat;
}
/* the existing Wilder ADX takes MetaTrader's name for it */
if (INDS.find(d => d.id === 'adx')) INDS.find(d => d.id === 'adx').label = 'ADX Wilder (+DI / −DI)';

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
