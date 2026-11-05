/* ASTRA Terminal — five indicators the catalogue was missing.

   Chosen to fill real gaps rather than pad the list. ASTRA already has every
   common oscillator and five families of moving average; what it had no measure
   of at all was REGIME — whether a market is currently trending or simply
   moving about, which decides whether a trend rule or a fade rule is the one
   that can work. Three of the five answer that question, and the other two are
   moving averages whose whole point is to lag less than the ones already here.

     Efficiency Ratio   how much of the distance travelled was actual progress
     KAMA               a moving average that speeds up and slows down on it
     Hull MA            the standard low-lag average, missing until now
     Vortex             trend direction from the reach between candle extremes
     Squeeze            Bollinger Bands inside Keltner Channels — compression

   None of them repaints: every value at candle i uses candles up to i and
   nothing after it, and the chart drops the forming candle before it draws.
   None of them predicts anything. A regime measure tells you what kind of
   market you are in NOW; it does not say what happens next, and reading it as
   a forecast is the most common way these are misused.

   Registered the same way js/confluence-indicator.js registers its own:
   INDS.push(def) and IND_BY_ID[id] = def. */

const JMIND = {

  /* ---------- Kaufman's Efficiency Ratio ----------
     Net distance over n candles divided by the total path walked to get there.
     1.0 is a straight line; near 0 is a market that went nowhere expensively.
     Perry Kaufman, "Smarter Trading" (1995). */
  efficiency(close, n){
    const out = new Array(close.length).fill(null);
    if (close.length <= n) return out;
    let path = 0;
    for (let i = 1; i < close.length; i++){
      path += Math.abs(close[i] - close[i - 1]);
      if (i > n) path -= Math.abs(close[i - n] - close[i - n - 1]);
      if (i >= n){
        const net = Math.abs(close[i] - close[i - n]);
        out[i] = path > 0 ? net / path : 0;
      }
    }
    return out;
  },

  /* ---------- KAMA ----------
     An EMA whose smoothing constant is driven by the Efficiency Ratio: it
     tracks closely while a move is efficient and goes nearly flat in chop, so
     it is not whipsawed the way a fixed-length average is. */
  kama(close, n, fast, slow){
    const er = this.efficiency(close, n);
    const f = 2 / (fast + 1), s = 2 / (slow + 1);
    const out = new Array(close.length).fill(null);
    let prev = null;
    for (let i = 0; i < close.length; i++){
      if (er[i] == null) continue;
      if (prev == null){ prev = close[i]; out[i] = prev; continue; }
      const sc = Math.pow(er[i] * (f - s) + s, 2);
      prev = prev + sc * (close[i] - prev);
      out[i] = prev;
    }
    return out;
  },

  /* ---------- Hull moving average ----------
     HMA = WMA( 2·WMA(n/2) − WMA(n), √n ). Alan Hull's construction: the
     doubled half-length average cancels most of the lag, the final √n average
     puts the smoothness back. */
  hull(v, n){
    const half = Math.max(1, Math.round(n / 2)), rt = Math.max(1, Math.round(Math.sqrt(n)));
    const w1 = IND.wma(v, half), w2 = IND.wma(v, n);
    const raw = v.map((_, i) => (w1[i] == null || w2[i] == null) ? null : 2 * w1[i] - w2[i]);
    /* IND.wma cannot take nulls, so run it over the filled tail and put the
       gap back afterwards */
    const first = raw.findIndex(x => x != null);
    if (first < 0) return new Array(v.length).fill(null);
    const tail = IND.wma(raw.slice(first), rt);
    const out = new Array(v.length).fill(null);
    for (let i = 0; i < tail.length; i++) out[first + i] = tail[i];
    return out;
  },

  /* ---------- Vortex ----------
     Etienne Botes & Douglas Siepman, Technical Analysis of Stocks & Commodities
     (January 2010). VM+ is how far this candle's high reaches above the last
     low, VM− the mirror; each is summed over n and divided by the summed true
     range. VI+ crossing above VI− is the trend turning up. */
  vortex(c, n){
    const vp = new Array(c.length).fill(null), vm = new Array(c.length).fill(null);
    if (c.length <= n) return { up: vp, down: vm };
    const pvm = [0], nvm = [0], tr = [0];
    for (let i = 1; i < c.length; i++){
      pvm.push(Math.abs(c[i].high - c[i - 1].low));
      nvm.push(Math.abs(c[i].low - c[i - 1].high));
      tr.push(Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)));
    }
    let sp = 0, sn = 0, st = 0;
    for (let i = 1; i < c.length; i++){
      sp += pvm[i]; sn += nvm[i]; st += tr[i];
      if (i > n){ sp -= pvm[i - n]; sn -= nvm[i - n]; st -= tr[i - n]; }
      if (i >= n && st > 0){ vp[i] = sp / st; vm[i] = sn / st; }
    }
    return { up: vp, down: vm };
  },

  /* ---------- Squeeze ----------
     John Bollinger's bands inside Keltner's channels: when the standard
     deviation band sits entirely inside the ATR channel, range has compressed.
     Compression is not direction and it is not a signal — it is the statement
     that the market is coiled, and the release can go either way. The
     histogram is the slope of a least-squares line through price minus its own
     midpoint, which is the usual way of reading which way it is leaning. */
  squeeze(c, n, bbMult, kcMult){
    const close = c.map(x => x.close);
    const bb = IND.bb(close, n, bbMult), kc = IND.keltner(c, n, kcMult);
    const on = new Array(c.length).fill(null);
    for (let i = 0; i < c.length; i++){
      if (bb.up[i] == null || kc.up[i] == null) continue;
      on[i] = (bb.up[i] < kc.up[i] && bb.lo[i] > kc.lo[i]) ? 1 : 0;
    }
    /* momentum: linear-regression slope over n of close minus the midpoint of
       the recent range, the de-trended series the original study used */
    const mom = new Array(c.length).fill(null);
    for (let i = n - 1; i < c.length; i++){
      let hi = -Infinity, lo = Infinity;
      for (let j = i - n + 1; j <= i; j++){ hi = Math.max(hi, c[j].high); lo = Math.min(lo, c[j].low); }
      const sma = kc.mid[i];
      if (sma == null) continue;
      const base = ((hi + lo) / 2 + sma) / 2;
      let sx = 0, sy = 0, sxy = 0, sxx = 0;
      for (let k = 0; k < n; k++){
        const y = c[i - n + 1 + k].close - base;
        sx += k; sy += y; sxy += k * y; sxx += k * k;
      }
      const d = n * sxx - sx * sx;
      mom[i] = d !== 0 ? (n * sxy - sx * sy) / d : 0;
    }
    return { on, mom };
  },
};

/* ================= catalogue entries ================= */

const JM_INDS = [
  {
    id: 'jmer', label: 'Efficiency Ratio (Kaufman)', kind: 'osc', applyTo: true,
    range: [0, 1], fixed: true,
    note: 'Net distance over the period divided by the total path walked. 1 is a straight line, 0 is a market that returned where it started. It measures HOW a market is moving, never which way it goes next. Above roughly 0.35 a trend rule has something to work with; below about 0.2 most trend rules are paying spread to be chopped up. The levels are a comma list, as in MT5.',
    def: { on: false, len: 20, src: 'close', levels: '0.2,0.35', target: 'p1' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200, label: 'Period' }],
    parts: [{ key: 'l', label: 'Efficiency', color: '#f2b705' }],
    build(ctx, c){
      return [{ key: 'l', precision: 3, data: ctx.line(JMIND.efficiency(ctx.srcOf(c), c.len)) }];
    },
  },
  {
    id: 'jmkama', label: 'KAMA (adaptive average)', kind: 'price', applyTo: true,
    note: 'Kaufman Adaptive Moving Average. The smoothing constant is rebuilt every candle from the Efficiency Ratio, so it hugs an efficient move and flattens in chop instead of being sawn apart by it. Fast 2 and slow 30 are Kaufman’s own defaults.',
    def: { on: false, len: 10, fast: 2, slow: 30, src: 'close', target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200, label: 'Efficiency period' },
             { k: 'fast', kind: 'num', min: 1, max: 50, label: 'Fast' },
             { k: 'slow', kind: 'num', min: 2, max: 200, label: 'Slow' }],
    parts: [{ key: 'l', label: 'KAMA', color: '#00d6a4' }],
    build(ctx, c){
      return [{ key: 'l', data: ctx.line(JMIND.kama(ctx.srcOf(c), c.len, c.fast, c.slow)) }];
    },
  },
  {
    id: 'jmhull', label: 'Hull Moving Average', kind: 'price', applyTo: true,
    note: 'HMA = WMA(2×WMA(n/2) − WMA(n), √n). Alan Hull’s construction removes most of the lag of a weighted average while staying smooth. Less lag cuts both ways: it turns earlier in a real move and earlier in a false one.',
    def: { on: false, len: 21, src: 'close', target: 'main' },
    params: [{ k: 'len', kind: 'num', min: 4, max: 400, label: 'Period' }],
    parts: [{ key: 'l', label: 'Hull', color: '#ff7ad9' }],
    build(ctx, c){
      return [{ key: 'l', data: ctx.line(JMIND.hull(ctx.srcOf(c), c.len)) }];
    },
  },
  {
    id: 'jmvortex', label: 'Vortex Indicator', kind: 'osc',
    note: 'Botes & Siepman (2010). VI+ measures how far each candle’s high reaches above the previous low, VI− the mirror, each summed over the period and divided by the summed true range. VI+ above VI− is an up-trend in force. Like every crossing indicator it gives its clearest signals in exactly the conditions where they are most often wrong — a quiet range — so read it beside the Efficiency Ratio.',
    def: { on: false, len: 14, levels: '1', target: 'p1' },
    params: [{ k: 'len', kind: 'num', min: 2, max: 200, label: 'Period' }],
    parts: [{ key: 'u', label: 'VI+', color: '#2ebd85' }, { key: 'd', label: 'VI−', color: '#f6465d' }],
    build(ctx, c){
      const v = JMIND.vortex(ctx.v, c.len);
      return [{ key: 'u', precision: 3, data: ctx.line(v.up) },
              { key: 'd', precision: 3, data: ctx.line(v.down) }];
    },
  },
  {
    id: 'jmsqueeze', label: 'Squeeze (Bollinger in Keltner)', kind: 'osc',
    note: 'The squeeze is on while the Bollinger Bands sit entirely inside the Keltner Channels — standard deviation has fallen below average range, so the market has coiled. Dots on the zero line mark it: red while compressed, green the moment it releases. The histogram is the slope of a least-squares line through price minus its own midpoint, i.e. which way it is leaning. Compression says a move is likelier to START, never which direction it takes.',
    def: { on: false, len: 20, bb: 2, kc: 1.5, target: 'p1' },
    params: [{ k: 'len', kind: 'num', min: 5, max: 200, label: 'Period' },
             { k: 'bb', kind: 'num', min: 0.5, max: 5, step: 0.5, label: 'Bollinger ×' },
             { k: 'kc', kind: 'num', min: 0.5, max: 5, step: 0.5, label: 'Keltner ×' }],
    parts: [{ key: 'h', label: 'Momentum', color: '#8b6cff' }, { key: 's', label: 'Squeeze', color: '#f6465d' }],
    build(ctx, c){
      const q = JMIND.squeeze(ctx.v, c.len, c.bb, c.kc);
      const t = ctx.v;
      return [
        { key: 'h', type: 'hist', data: t.map((x, i) => q.mom[i] == null ? null : ({
            time: x.time, value: q.mom[i],
            color: q.mom[i] >= 0 ? 'rgba(46,189,133,0.6)' : 'rgba(246,70,93,0.6)' })).filter(Boolean) },
        { key: 's', type: 'hist', data: t.map((x, i) => q.on[i] == null ? null : ({
            time: x.time, value: 0,
            color: q.on[i] ? '#f6465d' : '#2ebd85' })).filter(Boolean) },
      ];
    },
  },
];

if (typeof INDS !== 'undefined'){
  for (const d of JM_INDS){
    if (typeof IND_BY_ID !== 'undefined' && IND_BY_ID[d.id]) continue;
    INDS.push(d);
    if (typeof IND_BY_ID !== 'undefined') IND_BY_ID[d.id] = d;
  }
}
