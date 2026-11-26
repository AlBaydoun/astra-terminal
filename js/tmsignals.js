/* ASTRA / Timurila — the Signals board: a side tab that reads the open chart the way you would,
   thirty-three readings at once, and shows which way they point right now.

     THE LEAN       a dial and a ring: how many of the readings point up, how many down
     TIME           when this candle closes, how long the lean has held, the newest change,
                    which sessions are open, how big this candle is against a usual one
     TIMEFRAMES     the nine trend readings on 5m, 15m, 1h, 4h, 1d and 1w (press one to open it)
     THE PARTS      every part under the dial has ▲ ▼ in its title: move it up or down, the order is
                    remembered. The timeframes come first.
     AGREEMENT BOT  the rule of the Agreement bot (js/tmagreebot.js) read on this chart, and its numbers
     THE LIGHTS     trend (14), momentum (13), volume (3), pullback (2), structure (1).
                    Green = points up, red = down, grey = neither. The volume lights stay grey
                    on a market that reports no volume; the pullback lights are grey most of
                    the time and point against the last few candles when they light. Each shows for how many candles it has held; press one
                    for what it reads and how it did on this very chart
     FRESH SIGNALS  the one-off signals (a flip, a cross, a sweep…) of the last few candles
     THE RECORD     counted on the candles of this chart: when this many pointed this way
                    before, how often price went that way five candles later, next to how
                    often it went that way on any candle. Direction only, before costs.

   It reads candles and draws. It places nothing, arms nothing and sends no order; the only
   thing a press here changes is which chart timeframe you look at. The readings describe
   the chart, they are not a forecast: the record under them says how much they were worth.

   Only in the new look. Needs js/proind.js (the indicator maths) and Classic's Chart / STORE. */
'use strict';
const SignalBoard = window.SignalBoard = {
  LOOK: 1200,               /* candles of the open chart that are read */
  AHEAD: 5,                 /* candles looked ahead in the record */
  WARM: 210,                /* candles left out at the start (the 200 average needs them) */
  TFS: ['5m', '15m', '1h', '4h', '1d', '1w'],
  M: {},                    /* other timeframes: { 'sym|tf': { at, up, dn, of } } */
  open: '',                 /* the light whose details are open */
  prev: {},                 /* each light's last direction, to show a change the moment it happens */
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  ICON: '<svg class="wsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 0 1 16 0"/><path d="M12 18l4-6"/><circle cx="12" cy="18" r="1.2"/><path d="M6.5 12.5l1 1M17.5 12.5l-1 1M12 10v1.4"/></svg>',

  /* ---------- the first twenty readings: each answers, candle by candle, +1 up · -1 down · 0 neither ---------- */
  mm(P, k, f){ return P._m[k] || (P._m[k] = f()); },
  sg(n, f){ const o = new Int8Array(n); for (let k = 0; k < n; k++){ const x = f(k); o[k] = x > 0 ? 1 : x < 0 ? -1 : 0; } return o; },
  HOW: { st: 'SuperTrend 10 / 3. Price above its line is up, below is down.', ce: 'Chandelier Exit 22 / 3. Which side its trailing stop sits on.', ut: 'UT Bot (key 1, ATR 10). Which side its trail sits on.', macd: 'MACD 12 / 26 / 9. The histogram above zero is up, below is down.', ichi: 'Ichimoku. A close above the cloud is up, below is down, inside is neither.', ma: 'The 50 average above the 200 average is up.', di: 'Directional index 14. +DI above −DI is up.', mid: 'A close above the middle of the last 20 candles is up.', lor: 'A nearest-neighbour vote: what happened after the most similar past candles.' },
  readings(){ if (this._R) return this._R; const I = ProInd, S = this, f1 = v => v === v ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : '–';
    const trend = I.STATES.map(s => ({ id: 't_' + s.id, name: s.name, fam: 'trend', how: S.HOW[s.id] || '', run: P => I.state(P, s.id) }));
    const e = (P, n) => S.mm(P, 'sg_ema' + n, () => I.ema(P.c, n)), rsi = P => S.mm(P, 'sg_rsi', () => I.rsi(P.c, 14));
    const mom = [
      { id: 'm_rsi', name: 'RSI 14', how: 'Above 55 is up, below 45 is down, between is neither.', run: P => { const R = rsi(P); return S.sg(P.n, k => R[k] > 55 ? 1 : R[k] < 45 ? -1 : 0); }, val: (P, i) => 'RSI ' + f1(rsi(P)[i]) },
      { id: 'm_srsi', name: 'Stochastic RSI', how: '%K above %D is up, below is down.', run: P => { const s = I.stochRsi(P); return S.sg(P.n, k => s.k[k] - s.d[k]); }, val: (P, i) => '%K ' + f1(I.stochRsi(P).k[i]) },
      { id: 'm_wt', name: 'WaveTrend', how: 'The fast line above the slow line is up.', run: P => { const w = I.wavetrend(P); return S.sg(P.n, k => w.wt1[k] - w.wt2[k]); }, val: (P, i) => f1(I.wavetrend(P).wt1[i]) },
      { id: 'm_fish', name: 'Fisher Transform', how: 'Fisher above its trigger line is up.', run: P => { const f = I.fisher(P); return S.sg(P.n, k => f.f[k] - f.trig[k]); }, val: (P, i) => f1(I.fisher(P).f[i]) },
      { id: 'm_cci', name: 'CCI 20', how: 'Above +25 is up, below −25 is down.', run: P => { const c = I.cci(P, 20); return S.sg(P.n, k => c[k] > 25 ? 1 : c[k] < -25 ? -1 : 0); }, val: (P, i) => 'CCI ' + f1(I.cci(P, 20)[i]) },
      { id: 'm_sqz', name: 'Squeeze momentum', how: 'The momentum bar of the squeeze: above zero is up.', run: P => { const q = I.squeeze(P); return S.sg(P.n, k => q.mom[k]); }, val: (P, i) => I.squeeze(P).on[i] ? 'squeezed' : 'released' },
      { id: 'm_ema', name: 'EMA 9 / 21', how: 'The 9 average above the 21 average is up.', run: P => { const a = e(P, 9), b = e(P, 21); return S.sg(P.n, k => a[k] - b[k]); } },
      { id: 'm_e20', name: 'Price / EMA 20', how: 'A close above the 20 average is up.', run: P => { const a = e(P, 20); return S.sg(P.n, k => P.c[k] - a[k]); } },
      { id: 'm_vwap', name: 'Price / weekly VWAP', how: 'A close above this week’s volume-weighted average price is up.', run: P => { const v = I.avwap(P, 'week').v; return S.sg(P.n, k => v[k] === v[k] ? P.c[k] - v[k] : 0); } },
      { id: 'm_roc', name: 'Move over 10 candles', how: 'The close against the close ten candles earlier.', run: P => S.sg(P.n, k => k >= 10 ? P.c[k] - P.c[k - 10] : 0), val: (P, i) => i >= 10 && P.c[i - 10] ? ((P.c[i] / P.c[i - 10] - 1) * 100 >= 0 ? '+' : '−') + Math.abs((P.c[i] / P.c[i - 10] - 1) * 100).toFixed(2) + '%' : '' },
    ].map(r => Object.assign(r, { fam: 'momentum' }));
    const struct = [{ id: 's_brk', name: 'Last break of structure', fam: 'structure', how: 'Which way the most recent break of a swing high or low went.', run: P => { const o = new Int8Array(P.n), ev = I.structure(P).slice().sort((a, b) => a.i - b.i); let d = 0, p = 0; for (let k = 0; k < P.n; k++){ while (p < ev.length && ev[p].i <= k){ d = ev[p].up ? 1 : -1; p++; } o[k] = d; } return o; } }];
    const X = this.more(); return (this._R = trend.concat(X.filter(r => r.fam === 'trend'), mom, X.filter(r => r.fam !== 'trend'), struct)); },
  /* ---------- thirteen more readings: long-lookback trend, volume, and pullbacks. Each says in its own text where the idea comes from ---------- */
  more(){ const I = ProInd, S = this, NA = n => new Float64Array(n).fill(NaN), f1 = v => v === v ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : '–';
    const wma = (a, n) => { const o = NA(a.length), den = n * (n + 1) / 2; for (let i = n - 1; i < a.length; i++){ let s = 0, bad = false; for (let k = 0; k < n; k++){ const x = a[i - k]; if (x !== x){ bad = true; break; } s += x * (n - k); } if (!bad) o[i] = s / den; } return o; };
    const sma200 = P => S.mm(P, 'sg_sma200', () => I.sma(P.c, 200));
    const kama = P => S.mm(P, 'sg_kama', () => { const n = P.n, o = NA(n), er = 10, fa = 2 / 3, sl = 2 / 31; let k = NaN; for (let i = er; i < n; i++){ let vol = 0; for (let j = i - er + 1; j <= i; j++) vol += Math.abs(P.c[j] - P.c[j - 1]); const e = vol > 0 ? Math.abs(P.c[i] - P.c[i - er]) / vol : 0, sc = Math.pow(e * (fa - sl) + sl, 2); k = k !== k ? P.c[i] : k + sc * (P.c[i] - k); o[i] = k; } return o; });
    const hma = P => S.mm(P, 'sg_hma55', () => { const a = wma(P.c, 27), b = wma(P.c, 55), d = NA(P.n); for (let i = 0; i < P.n; i++) d[i] = 2 * a[i] - b[i]; return wma(d, 7); });
    const d55 = P => S.mm(P, 'sg_d55', () => { const hh = I.highest(P.h, 55), ll = I.lowest(P.l, 55), o = new Int8Array(P.n); let d = 0; for (let i = 56; i < P.n; i++){ if (P.c[i] > hh[i - 1]) d = 1; else if (P.c[i] < ll[i - 1]) d = -1; o[i] = d; } return o; });
    const pos = P => S.mm(P, 'sg_pos250', () => { const hh = I.highest(P.h, 250), ll = I.lowest(P.l, 250), o = NA(P.n); for (let i = 0; i < P.n; i++) o[i] = hh[i] > ll[i] ? (P.c[i] - ll[i]) / (hh[i] - ll[i]) : NaN; return o; });
    const tsi = P => S.mm(P, 'sg_tsi', () => { const n = P.n, m = NA(n), a = NA(n); for (let i = 1; i < n; i++){ m[i] = P.c[i] - P.c[i - 1]; a[i] = Math.abs(m[i]); } const x = I.ema(I.ema(m, 25), 13), y = I.ema(I.ema(a, 25), 13), t = NA(n); for (let i = 0; i < n; i++) t[i] = y[i] > 0 ? 100 * x[i] / y[i] : NaN; return { t, s: I.ema(t, 7) }; });
    const ao = P => S.mm(P, 'sg_ao', () => { const md = NA(P.n); for (let i = 0; i < P.n; i++) md[i] = (P.h[i] + P.l[i]) / 2; const a = I.sma(md, 5), b = I.sma(md, 34), o = NA(P.n); for (let i = 0; i < P.n; i++) o[i] = a[i] - b[i]; return o; });
    const aroon = P => S.mm(P, 'sg_aroon', () => { const n = P.n, L = 25, o = NA(n); for (let i = L; i < n; i++){ let hi = i - L, lo = i - L; for (let k = i - L; k <= i; k++){ if (P.h[k] >= P.h[hi]) hi = k; if (P.l[k] <= P.l[lo]) lo = k; } o[i] = (hi - lo) / L * 100; } return o; });
    const obv = P => S.mm(P, 'sg_obv', () => { const o = new Float64Array(P.n); for (let i = 1; i < P.n; i++) o[i] = o[i - 1] + (P.c[i] > P.c[i - 1] ? P.v[i] : P.c[i] < P.c[i - 1] ? -P.v[i] : 0); return { o, e: I.ema(o, 20) }; });
    const cmf = P => S.mm(P, 'sg_cmf', () => { const n = P.n, L = 20, o = NA(n); let a = 0, b = 0; const mf = new Float64Array(n); for (let i = 0; i < n; i++){ const r = P.h[i] - P.l[i]; mf[i] = r > 0 ? ((P.c[i] - P.l[i]) - (P.h[i] - P.c[i])) / r * P.v[i] : 0; a += mf[i]; b += P.v[i]; if (i >= L){ a -= mf[i - L]; b -= P.v[i - L]; } if (i >= L - 1 && b > 0) o[i] = a / b; } return o; });
    const mfi = P => S.mm(P, 'sg_mfi', () => { const n = P.n, L = 14, o = NA(n), up = new Float64Array(n), dn = new Float64Array(n); let a = 0, b = 0; for (let i = 1; i < n; i++){ const t = (P.h[i] + P.l[i] + P.c[i]) / 3, q = (P.h[i - 1] + P.l[i - 1] + P.c[i - 1]) / 3; if (t > q) up[i] = t * P.v[i]; else if (t < q) dn[i] = t * P.v[i]; a += up[i]; b += dn[i]; if (i > L){ a -= up[i - L]; b -= dn[i - L]; } if (i >= L && a + b > 0) o[i] = b <= 0 ? 100 : 100 - 100 / (1 + a / b); } return o; });
    const rsi2 = P => S.mm(P, 'sg_rsi2', () => I.rsi(P.c, 2));
    const bb = P => S.mm(P, 'sg_bb', () => ({ m: I.sma(P.c, 20), d: I.stdev(P.c, 20) }));
    const noVol = P => !S.hasVol(P), nv = 'this market reports no volume';
    return [
      { id: 'x_tsm', name: 'Trend over 200 candles', fam: 'trend', how: 'The close against the close 200 candles earlier. This is the trend-following idea: on monthly data for 58 futures, the direction of the past year tended to continue for some months (Moskowitz, Ooi and Pedersen, 2012). That study is about months, not about these candles.', run: P => S.sg(P.n, k => k >= 200 ? P.c[k] - P.c[k - 200] : 0), val: (P, i) => i >= 200 && P.c[i - 200] ? ((P.c[i] / P.c[i - 200] - 1) * 100 >= 0 ? '+' : '−') + Math.abs((P.c[i] / P.c[i - 200] - 1) * 100).toFixed(2) + '%' : '' },
      { id: 'x_d55', name: 'Donchian 55 breakout', fam: 'trend', ev: '55-candle breakout', how: 'Which came last: a close above the highest high of the 55 candles before it, or a close below their lowest low. The Turtle traders’ breakout rule.', run: P => d55(P) },
      { id: 'x_kama', name: 'Kaufman adaptive average', fam: 'trend', how: 'Kaufman’s adaptive average (10, 2, 30) moves fast in a clean move and slowly in noise. Price above a rising line is up, below a falling line is down, anything else is neither.', run: P => { const k = kama(P); return S.sg(P.n, i => i < 1 || k[i] !== k[i] || k[i - 1] !== k[i - 1] ? 0 : P.c[i] > k[i] && k[i] > k[i - 1] ? 1 : P.c[i] < k[i] && k[i] < k[i - 1] ? -1 : 0); } },
      { id: 'x_hma', name: 'Hull average 55', fam: 'trend', how: 'The Hull average 55, a smooth average with little lag. Rising is up, falling is down.', run: P => { const h = hma(P); return S.sg(P.n, i => i < 1 || h[i] !== h[i] || h[i - 1] !== h[i - 1] ? 0 : h[i] - h[i - 1]); } },
      { id: 'x_pos', name: 'Place in the 250-candle range', fam: 'trend', how: 'Where the close sits between the highest and the lowest of the last 250 candles: the top tenth is up, the bottom tenth is down, between is neither. In stocks, nearness to the 52-week high went with later strength (George and Hwang, 2004).', run: P => { const p = pos(P); return S.sg(P.n, i => p[i] >= 0.9 ? 1 : p[i] <= 0.1 ? -1 : 0); }, val: (P, i) => pos(P)[i] === pos(P)[i] ? (pos(P)[i] * 100).toFixed(0) + '% of the way up' : '' },
      { id: 'x_tsi', name: 'True Strength Index', fam: 'momentum', how: 'True Strength Index (25, 13): the candle-to-candle move, smoothed twice. Above its 7 signal line is up.', run: P => { const t = tsi(P); return S.sg(P.n, i => t.t[i] === t.t[i] && t.s[i] === t.s[i] ? t.t[i] - t.s[i] : 0); }, val: (P, i) => 'TSI ' + f1(tsi(P).t[i]) },
      { id: 'x_ao', name: 'Awesome Oscillator', fam: 'momentum', how: 'The 5 average of the candle middles against their 34 average. Above zero is up.', run: P => { const a = ao(P); return S.sg(P.n, i => a[i] === a[i] ? a[i] : 0); } },
      { id: 'x_aroon', name: 'Aroon 25', fam: 'momentum', how: 'How recent the highest high of the last 25 candles is, against the lowest low. Above +20 is up, below −20 is down.', run: P => { const a = aroon(P); return S.sg(P.n, i => a[i] > 20 ? 1 : a[i] < -20 ? -1 : 0); }, val: (P, i) => f1(aroon(P)[i]) },
      { id: 'v_obv', name: 'On-balance volume', fam: 'volume', how: 'Volume is added on a higher close and taken off on a lower one. The running total above its own 20 average is up.', run: P => { if (noVol(P)) return new Int8Array(P.n); const b = obv(P); return S.sg(P.n, i => b.e[i] === b.e[i] ? b.o[i] - b.e[i] : 0); }, val: P => noVol(P) ? nv : '' },
      { id: 'v_cmf', name: 'Chaikin Money Flow 20', fam: 'volume', how: 'Where each candle closes inside its range, weighted by its volume, over 20 candles. Above +0.05 is up, below −0.05 is down.', run: P => { if (noVol(P)) return new Int8Array(P.n); const c = cmf(P); return S.sg(P.n, i => c[i] > 0.05 ? 1 : c[i] < -0.05 ? -1 : 0); }, val: (P, i) => noVol(P) ? nv : cmf(P)[i] === cmf(P)[i] ? 'CMF ' + cmf(P)[i].toFixed(2) : '' },
      { id: 'v_mfi', name: 'Money Flow Index 14', fam: 'volume', how: 'An RSI that counts volume. Above 55 is up, below 45 is down.', run: P => { if (noVol(P)) return new Int8Array(P.n); const m = mfi(P); return S.sg(P.n, i => m[i] > 55 ? 1 : m[i] < 45 ? -1 : 0); }, val: (P, i) => noVol(P) ? nv : 'MFI ' + f1(mfi(P)[i]) },
      { id: 'p_rsi2', name: 'RSI 2 pullback', fam: 'pullback', quiet: true, ev: 'RSI 2 pullback', how: 'A dip inside a trend (Connors): above the 200 average with RSI 2 under 10 points up; below it with RSI 2 over 90 points down; otherwise neither. Short-term reversal is documented in stocks, where trading costs took most of it.', run: P => { const r = rsi2(P), m = sma200(P); return S.sg(P.n, i => m[i] !== m[i] ? 0 : P.c[i] > m[i] && r[i] < 10 ? 1 : P.c[i] < m[i] && r[i] > 90 ? -1 : 0); }, val: (P, i) => 'RSI 2 ' + f1(rsi2(P)[i]) },
      { id: 'p_bb', name: 'Bollinger stretch', fam: 'pullback', quiet: true, ev: 'Close outside the Bollinger band', how: 'A close outside the Bollinger bands (20, 2) points back toward the middle: below the lower band is up, above the upper band is down; inside is neither.', run: P => { const b = bb(P); return S.sg(P.n, i => b.d[i] !== b.d[i] ? 0 : P.c[i] < b.m[i] - 2 * b.d[i] ? 1 : P.c[i] > b.m[i] + 2 * b.d[i] ? -1 : 0); } },
    ]; },
  hasVol(P){ return this.mm(P, 'sg_hasvol', () => { let s = 0; for (let i = Math.max(0, P.n - 200); i < P.n; i++) s += P.v[i] || 0; return s > 0; }); },
  FAM: [['trend', 'TREND'], ['momentum', 'MOMENTUM'], ['volume', 'VOLUME'], ['pullback', 'PULLBACK · against the last few candles'], ['structure', 'STRUCTURE']],
  SHORT: { t_st: 'SuperTrend', t_ce: 'Chandelier', t_ut: 'UT Bot', t_macd: 'MACD', t_ichi: 'Ichimoku', t_ma: 'MA 50/200', t_di: 'DI + / −', t_mid: 'Donchian', t_lor: 'Lorentzian', m_rsi: 'RSI 14', m_srsi: 'Stoch RSI', m_wt: 'WaveTrend', m_fish: 'Fisher', m_cci: 'CCI 20', m_sqz: 'Squeeze', m_ema: 'EMA 9/21', m_e20: 'Px / EMA 20', m_vwap: 'Px / VWAP', m_roc: '10-c move', s_brk: 'Structure',
    x_tsm: '200-c trend', x_d55: 'Donchian 55', x_kama: 'Kaufman', x_hma: 'Hull 55', x_pos: 'Range place', x_tsi: 'TSI', x_ao: 'Awesome', x_aroon: 'Aroon 25', v_obv: 'OBV', v_cmf: 'Money flow', v_mfi: 'MFI 14', p_rsi2: 'RSI 2 dip', p_bb: 'Band stretch' },

  /* ---------- the tab ---------- */
  init(){ const st = this.$('sideTabs'), body = document.querySelector('#sidebar .sideBody'); if (!st || !body || this.$('tab-tssig') || typeof ProInd === 'undefined') return;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'tssig'; b.className = 'tsOnlyFace'; b.title = 'Signals: every reading of this chart, live'; b.innerHTML = this.ICON + '<span>SIGNALS</span>'; st.insertBefore(b, st.children[1] || st.querySelector('.sideCtl') || null);
    b.addEventListener('click', () => { st.querySelectorAll('button[data-tab]').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('#sidebar .sidePanel').forEach(p => p.classList.toggle('active', p.id === 'tab-tssig')); try { if (typeof Face !== 'undefined') Face.sideNames(); } catch(e){} this.sync(); });
    const p = document.createElement('div'); p.id = 'tab-tssig'; p.className = 'sidePanel tsOnlyFace'; p.innerHTML = '<div class="sgWrap" id="sgWrap"></div>'; body.appendChild(p);
    p.addEventListener('click', e => this.click(e));
    st.addEventListener('click', () => setTimeout(() => this.sync(), 30));
    try { BUS.on('symbol', () => { this._key = ''; setTimeout(() => this.tick(true), 900); }); BUS.on('candleClose', () => setTimeout(() => this.tick(true), 250)); BUS.on('history', () => setTimeout(() => this.tick(true), 300)); } catch(e){}
    setInterval(() => this.tick(), 2000); setInterval(() => this.clock(), 1000); this.sync(); },
  active(){ const p = this.$('tab-tssig'); return !!p && p.classList.contains('active') && p.offsetParent !== null && document.documentElement.dataset.face === 'tm'; },
  /* while this tab is open the panel is wider and the news stream at its foot steps aside: the board gets the whole side */
  sync(){ const on = this.active(), H = document.documentElement; if (H.classList.contains('tsSigTab') !== on){ H.classList.toggle('tsSigTab', on); setTimeout(() => window.dispatchEvent(new Event('resize')), 80); } if (on) this.tick(true); },
  click(e){ const mv = e.target.closest('[data-sgmv]'); if (mv){ const p = mv.dataset.sgmv.split(':'); this.move(p[0], +p[1]); return; }
    const l = e.target.closest('[data-sg]'), tf = e.target.closest('[data-sgtf]'); if (l){ this.open = this.open === l.dataset.sg ? '' : l.dataset.sg; this.paint(); this.orderApply(); return; }
    if (tf && typeof App !== 'undefined' && App.setTf){ try { App.setTf(tf.dataset.sgtf); } catch(x){} this._key = ''; setTimeout(() => this.tick(true), 1200); } },

  /* ---------- reading the chart ---------- */
  dur(c){ const s = c * (typeof tfSeconds === 'function' ? tfSeconds(STORE.tf) : 60); return s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.floor(s / 3600) + ' h' + (Math.round(s % 3600 / 60) ? ' ' + Math.round(s % 3600 / 60) + ' m' : '') : (s / 86400).toFixed(s < 864000 ? 1 : 0) + ' d'; },
  lean(up, dn, of){ const side = up > dn ? 1 : dn > up ? -1 : 0, n = Math.max(up, dn); return { side, n, level: n >= Math.ceil(of * 0.7) ? 2 : n >= Math.ceil(of * 0.55) && side ? 1 : 0 }; },
  /* the count on any run of candles, read on the last one given: how many readings point up and down there, the same count
     on every candle before it (to see how long it has held), the close against its 200 average, and the usual range */
  tally(bars){ if (!bars || bars.length < 260 || typeof ProInd === 'undefined') return null; const P = ProInd.prep(bars.slice(-this.LOOK)), n = P.n, i = n - 1, R = this.readings(), U = new Int16Array(n), D = new Int16Array(n);
    const last = new Int8Array(R.length), held = new Int32Array(R.length), vals = new Array(R.length).fill(''), sgn = v => v > 0 ? 1 : v < 0 ? -1 : 0;
    R.forEach((r, x) => { let d = null; try { d = r.run(P); } catch(e){ return; } last[x] = sgn(d[i]); let hl = 1; for (let k = i - 1; k >= 0 && sgn(d[k]) === last[x]; k--) hl++; held[x] = hl; try { vals[x] = r.val ? String(r.val(P, i) || '') : ''; } catch(e){}
      for (let k = 0; k < n; k++){ if (d[k] > 0) U[k]++; else if (d[k] < 0) D[k]++; } });
    const m = ProInd.sma(P.c, 200)[i], A = ProInd.atr(P, 14)[i]; return { up: U[i], dn: D[i], of: R.length, U, D, last, held, vals, vol: this.hasVol(P), TS: P.t, px: P.c[i], ma: m, trend: m === m ? (P.c[i] > m ? 1 : P.c[i] < m ? -1 : 0) : 0, atr: A === A ? A : 0 }; },
  compute(){ const raw = (typeof Chart !== 'undefined' && Chart.raw) || []; if (raw.length < 260) return null; const P = ProInd.prep(raw.slice(-this.LOOK)), n = P.n, i = n - 1, R = this.readings();
    const D = R.map(r => { try { return r.run(P); } catch(e){ return new Int8Array(n); } }), up = new Int16Array(n), dn = new Int16Array(n);
    for (const d of D) for (let k = 0; k < n; k++){ if (d[k] > 0) up[k]++; else if (d[k] < 0) dn[k]++; }
    /* the lean is judged against the readings that can speak: the pullback lights are silent most of the time, the volume lights on a market without volume */
    const of = R.length, vol = this.hasVol(P), play = R.filter(r => !r.quiet && (vol || r.fam !== 'volume')).length, L = this.lean(up[i], dn[i], play);
    /* how long: the lean, and each light */
    let held = 0; if (L.side){ for (let k = i; k >= this.WARM; k--){ const x = this.lean(up[k], dn[k], play); if (x.side !== L.side || x.level < Math.min(1, L.level)) break; held++; } }
    const lights = R.map((r, x) => { const d = D[x][i]; let h = 1; for (let k = i - 1; k >= 0 && D[x][k] === d; k--) h++; let v = ''; try { v = r.val ? r.val(P, i) : ''; } catch(e){} return { id: r.id, name: r.name, fam: r.fam, how: r.how, dir: d, held: h, val: v, x }; });
    const newest = lights.filter(l => l.held < n - 1).slice().sort((a, b) => a.held - b.held)[0] || null;
    /* fresh one-off signals */
    const ev = []; for (const s of ProInd.SIGNALS){ let a; try { a = ProInd.signal(P, s.id); } catch(e){ continue; } for (let k = i; k >= Math.max(0, i - 6); k--) if (a[k]){ ev.push({ name: s.name, how: s.how, dir: a[k], ago: i - k }); break; } }
    R.forEach((r, x) => { if (!r.ev) return; const d = D[x]; for (let k = i; k >= Math.max(1, i - 6); k--) if (d[k] && d[k] !== d[k - 1]){ ev.push({ name: r.ev, how: r.how, dir: d[k], ago: i - k }); break; } });
    ev.sort((a, b) => a.ago - b.ago);
    /* context */
    let chop = NaN, z = NaN, rv = NaN; try { chop = ProInd.choppiness(P, 14)[i]; const A = ProInd.atr(P, 20), T = ProInd.trueRange(P); z = A[i - 1] > 0 ? T[i] / A[i - 1] : NaN; rv = ProInd.rvol(P, 20)[i]; } catch(e){}
    return { P, n, i, D, up, dn, of, L, held, lights, newest, ev: ev.slice(0, 8), vol, chop, z, rv, upN: up[i], dnN: dn[i], last: raw[raw.length - 1] }; },
  /* counted on this chart: of the candles where at least this many pointed this way, how many were followed by a move that way */
  record(C, side, count, one){ const P = C.P, A = this.AHEAD; let N = 0, hit = 0, B = 0, bh = 0; if (!side) return null;
    for (let j = this.WARM; j < C.n - 1 - A; j++){ const mv = P.c[j + A] - P.c[j], went = mv > 0 ? 1 : mv < 0 ? -1 : 0; B++; if (went === side) bh++;
      const ok = one ? one[j] === side : (side > 0 ? C.up[j] >= count && C.up[j] > C.dn[j] : C.dn[j] >= count && C.dn[j] > C.up[j]); if (ok){ N++; if (went === side) hit++; } }
    return { N, hit, B, bh, p: N ? hit / N * 100 : NaN, base: B ? bh / B * 100 : NaN }; },

  /* ---------- the other timeframes: one request at a time, each kept until its own candle has closed ---------- */
  async mtf(){ if (this._busy || typeof API === 'undefined') return; const sym = STORE.symbol; this._busy = true;
    try { for (const tf of this.TFS){ if (tf === STORE.tf || !this.active() || STORE.symbol !== sym) continue; const k = sym + '|' + tf, c = this.M[k], ttl = Math.min(typeof tfSeconds === 'function' ? tfSeconds(tf) : 900, 900) * 1000; if (c && Date.now() - c.at < ttl) continue;
        try { const get = () => API.klines(sym, tf, 320), bars = await (typeof Autopsy !== 'undefined' && Autopsy.one ? Autopsy.one(get) : get());
          if (bars && bars.length > 60){ const P = ProInd.prep(bars), a = ProInd.agreement(P, P.n - 1, 1); this.M[k] = { at: Date.now(), up: a.yes, dn: a.no, of: a.of }; } else this.M[k] = { at: Date.now(), none: true }; }
        catch(e){ this.M[k] = { at: Date.now() - ttl + 60000, none: true }; }
        this.paintTfs(); await new Promise(r => setTimeout(r, 1500)); } }
    finally { this._busy = false; } },

  /* ---------- drawing ---------- */
  COL: { 1: '#3DDC97', '-1': '#FF6B7A', 0: '#3A4763' },
  build(){ const w = this.$('sgWrap'); if (!w) return; const R = this.readings(), N = R.length, C = 2 * Math.PI * 40, seg = C / N;
    w.innerHTML = '<div class="sgTop"><div class="sgDial"><svg viewBox="0 0 150 92"><defs><linearGradient id="sgG" x1="0" x2="1"><stop offset="0" stop-color="#FF6B7A"/><stop offset=".5" stop-color="#3A4763"/><stop offset="1" stop-color="#3DDC97"/></linearGradient></defs><path d="M14 80 A61 61 0 0 1 136 80" fill="none" stroke="url(#sgG)" stroke-width="9" stroke-linecap="round" opacity=".85"/><g id="sgNeedle" class="sgNeedle"><line x1="75" y1="80" x2="75" y2="30" stroke="#F2F6FF" stroke-width="2.4" stroke-linecap="round"/></g><circle cx="75" cy="80" r="5" fill="#F2F6FF"/><text x="12" y="91" class="sgAx">down</text><text x="138" y="91" text-anchor="end" class="sgAx">up</text></svg></div>' +
        '<div class="sgRing"><svg viewBox="0 0 100 100">' + R.map((r, k) => '<circle class="sgSeg" data-k="' + k + '" cx="50" cy="50" r="40" fill="none" stroke-width="9" stroke-dasharray="' + (seg - 2.4).toFixed(2) + ' ' + (C - seg + 2.4).toFixed(2) + '" transform="rotate(' + (k * 360 / N - 90).toFixed(1) + ' 50 50)"/>').join('') + '</svg><div><b id="sgNum">–</b><small id="sgNumL">reading…</small></div></div></div>' +
      '<div class="sgVerdict" id="sgVerdict"><b>Reading the chart…</b><small></small></div>' +
      '<div class="sgTime"><div><small>THIS CANDLE CLOSES IN</small><b id="sgCd">–</b></div><div><small>THE LEAN HAS HELD</small><b id="sgHeld">–</b></div><div class="wide"><small>NEWEST CHANGE</small><b id="sgNew">–</b></div></div>' +
      '<p class="sgLegend"><i class="up"></i>points up <i class="dn"></i>points down <i></i>neither <b>12</b> candles it has held · press a light</p>' +
      this.FAM.map(f => '<div class="sgBlock" data-sgb="' + f[0] + '"><h5>' + f[1] + ' <em id="sgF_' + f[0] + '"></em>' + this.mv(f[0]) + '</h5><div class="sgGrid">' + R.filter(r => r.fam === f[0]).map(r => '<button type="button" class="sgL" data-sg="' + r.id + '"><i></i><b>' + this.esc(this.SHORT[r.id] || r.name) + '</b><em></em></button>').join('') + '</div></div>').join('') +
      '<div class="sgMore" id="sgMore" hidden></div>' +
      '<div class="sgBlock" data-sgb="tfs"><h5>TIMEFRAMES <em>the nine trend readings · press one to open it</em>' + this.mv('tfs') + '</h5><div class="sgTfs" id="sgTfs"></div></div>' +
      '<div class="sgBlock" data-sgb="ctx"><h5>RIGHT NOW <em>texture, this candle, volume, sessions</em>' + this.mv('ctx') + '</h5><div class="sgCtx" id="sgCtx"></div></div>' +
      '<div class="sgBlock" data-sgb="fresh"><h5>FRESH SIGNALS <em>one-off signals of the last six candles</em>' + this.mv('fresh') + '</h5><div class="sgEv" id="sgEv"></div></div>' +
      '<div class="sgBlock" data-sgb="record"><h5>THE RECORD <em>counted on this chart’s own candles</em>' + this.mv('record') + '</h5><div class="sgRec" id="sgRec"></div></div>' +
      '<div class="sgBlock" data-sgb="bot"><h5>AGREEMENT BOT <em>this timeframe and the two above it</em>' + this.mv('bot') + '</h5><div class="sgBot" id="sgBot"><span class="sgNone">Reading…</span></div></div>' +
      '<p class="sgFoot">The readings describe this chart; they are not a forecast and not advice. The newer lights (long trend, volume, pullback) come from published research; those studies used daily or monthly prices, and in most of them trading costs took much of the result. Press a light to see how it did on this chart. In the large test on your broker’s markets (twenty of these signals, 2.9 million cases), more agreement did not beat random entries once the spread was paid.</p>'; this.orderApply(); },
  /* ---------- the parts under the dial, in your own order ---------- */
  OKEY: 'astra_signals_order', PARTS: ['tfs', 'trend', 'momentum', 'volume', 'pullback', 'structure', 'bot', 'ctx', 'fresh', 'record'],
  mv(id){ return '<span class="sgMv"><button type="button" data-sgmv="' + id + ':-1" title="Move this part up" aria-label="Move this part up">▲</button><button type="button" data-sgmv="' + id + ':1" title="Move this part down" aria-label="Move this part down">▼</button></span>'; },
  orderGet(){ let s = []; try { s = JSON.parse(localStorage.getItem(this.OKEY) || '[]') || []; } catch(e){} s = Array.isArray(s) ? s.filter(k => this.PARTS.includes(k)) : []; return s.concat(this.PARTS.filter(k => !s.includes(k))); },
  orderApply(){ const w = this.$('sgWrap'); if (!w) return; const o = this.orderGet(); w.querySelectorAll('[data-sgb]').forEach(b => { b.style.order = String(10 + o.indexOf(b.dataset.sgb) * 10); });
    /* an opened light's details sit right under its own family */
    const m = this.$('sgMore'), r = this.open ? this.readings().find(x => x.id === this.open) : null; if (m) m.style.order = String(r ? 15 + o.indexOf(r.fam) * 10 : 5); const f = w.querySelector('.sgFoot'); if (f) f.style.order = '9999';
    w.querySelectorAll('[data-sgmv]').forEach(b => { const p = b.dataset.sgmv.split(':'), k = o.indexOf(p[0]); b.disabled = (+p[1] < 0 && k === 0) || (+p[1] > 0 && k === o.length - 1); }); },
  move(id, d){ const o = this.orderGet(), k = o.indexOf(id), j = k + d; if (k < 0 || j < 0 || j >= o.length) return; const t = o[k]; o[k] = o[j]; o[j] = t; try { localStorage.setItem(this.OKEY, JSON.stringify(o)); } catch(e){} this.orderApply();
    const b = this.$('sgWrap').querySelector('[data-sgb="' + id + '"]'); if (b){ b.classList.remove('sgMoved'); void b.offsetWidth; b.classList.add('sgMoved'); b.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } },
  tick(force){ if (!this.active()) return; const key = STORE.symbol + '|' + STORE.tf; if (key !== this._key){ this._key = key; this.prev = {}; this.open = ''; this.C = null; }
    if (!this.$('sgNeedle')) this.build(); let C = null; try { C = this.compute(); } catch(e){ console.warn('signals', e); } this.C = C; this.paint(); this.mtf(); try { if (typeof AgreeBot !== 'undefined') AgreeBot.paint(); } catch(e){} },
  paint(){ const C = this.C, w = this.$('sgWrap'); if (!w || !this.$('sgNeedle')) return; const set = (id, t) => { const e = this.$(id); if (e && e.textContent !== t) e.textContent = t; }, html = (id, h) => { const e = this.$(id); if (e && e._h !== h){ e._h = h; e.innerHTML = h; } };
    if (!C){ set('sgNum', '–'); set('sgNumL', 'too few candles'); html('sgVerdict', '<b>Not enough candles on this chart yet.</b><small>The board needs about 260 candles to read every indicator.</small>'); return; }
    const L = C.L, of = C.of, flat = of - C.upN - C.dnN, word = L.side > 0 ? 'up' : L.side < 0 ? 'down' : '';
    this.$('sgNeedle').style.transform = 'rotate(' + ((C.upN - C.dnN) / of * 90).toFixed(1) + 'deg)';
    w.querySelectorAll('.sgSeg').forEach((s, k) => { const c = k < C.upN ? 1 : k < C.upN + flat ? 0 : -1, col = this.COL[c]; if (s.dataset.c !== col){ s.dataset.c = col; s.style.stroke = col; } });
    set('sgNum', L.n + '/' + of); set('sgNumL', L.side ? 'point ' + word : 'evenly split'); const num = this.$('sgNum'); if (num) num.className = L.side > 0 ? 'up' : L.side < 0 ? 'dn' : '';
    html('sgVerdict', '<b class="' + (L.level ? (L.side > 0 ? 'up' : 'dn') : '') + '">' + (L.level === 2 ? 'Most readings point ' + word : L.level === 1 ? 'Leaning ' + word : 'Mixed: no clear side') + '</b><small>' + C.upN + ' up · ' + C.dnN + ' down · ' + flat + ' neither</small>');
    set('sgHeld', L.level && C.held ? C.held + ' candle' + (C.held === 1 ? '' : 's') + ' · ' + this.dur(C.held) : 'no lean right now');
    const nw = C.newest; html('sgNew', nw ? this.esc(nw.name) + ' <i class="' + (nw.dir > 0 ? 'up' : nw.dir < 0 ? 'dn' : '') + '">' + (nw.dir > 0 ? 'turned up' : nw.dir < 0 ? 'turned down' : 'went neutral') + '</i> · ' + (nw.held <= 1 ? 'on this candle' : (nw.held - 1) + ' candle' + (nw.held === 2 ? '' : 's') + ' ago') : '–');
    /* context: texture, this candle's size, volume, sessions */
    const tx = C.chop !== C.chop ? '' : C.chop >= 61.8 ? 'choppy' : C.chop <= 38.2 ? 'trending' : 'mixed', ses = typeof SidePanels !== 'undefined' && SidePanels.SES ? SidePanels.SES.map(s => { let o = false; try { o = SidePanels.isOpen(s, Date.now()); } catch(e){} return '<span class="sgSes' + (o ? ' on' : '') + '" style="--c:' + s[4] + '">' + s[0] + '</span>'; }).join('') : '';
    html('sgCtx', (tx ? '<div><small>TEXTURE</small><b>' + tx + '</b><i><u style="--w:' + Math.max(4, Math.min(100, 100 - C.chop)).toFixed(0) + '%"></u></i></div>' : '') + (C.z === C.z ? '<div><small>THIS CANDLE</small><b>' + C.z.toFixed(1) + '× a usual one</b><i><u class="' + (C.z >= 2.5 ? 'hot' : '') + '" style="--w:' + Math.max(4, Math.min(100, C.z / 3 * 100)).toFixed(0) + '%"></u></i></div>' : '') + (C.rv === C.rv && C.rv > 0 ? '<div><small>VOLUME</small><b>' + C.rv.toFixed(1) + '× usual</b><i><u style="--w:' + Math.max(4, Math.min(100, C.rv / 3 * 100)).toFixed(0) + '%"></u></i></div>' : '') + (ses ? '<div class="wide"><small>SESSIONS OPEN</small><span class="sgSesRow">' + ses + '</span></div>' : ''));
    /* the lights */
    const now = Date.now(); for (const l of C.lights){ const b = w.querySelector('[data-sg="' + l.id + '"]'); if (!b) continue; const cls = 'sgL ' + (l.dir > 0 ? 'up' : l.dir < 0 ? 'dn' : 'fl') + (this.open === l.id ? ' open' : ''), p = this.prev[l.id];
      if (p !== undefined && p !== l.dir){ b.classList.remove('chg'); void b.offsetWidth; b._chg = now; } this.prev[l.id] = l.dir; const want = cls + (b._chg && now - b._chg < 6000 ? ' chg' : ''); if (b.className !== want) b.className = want;
      const em = b.querySelector('em'), t = l.held >= C.n - 1 ? 'all' : l.held > 99 ? '99+' : String(l.held); if (em.textContent !== t) em.textContent = t; b.title = l.name + ': ' + (l.dir > 0 ? 'points up' : l.dir < 0 ? 'points down' : 'neither') + (l.val ? ' (' + l.val + ')' : '') + ' · for ' + l.held + ' candle' + (l.held === 1 ? '' : 's') + '. Press for more.'; }
    for (const f of this.FAM){ const ls = C.lights.filter(l => l.fam === f[0]); set('sgF_' + f[0], ls.filter(l => l.dir > 0).length + ' up · ' + ls.filter(l => l.dir < 0).length + ' down'); }
    /* one light, opened */
    const m = this.$('sgMore'), o = C.lights.find(l => l.id === this.open); if (m){ m.hidden = !o; if (o){ const r = o.dir ? this.record(C, o.dir, 0, C.D[o.x]) : null;
        html('sgMore', '<b>' + this.esc(o.name) + ' <i class="' + (o.dir > 0 ? 'up' : o.dir < 0 ? 'dn' : '') + '">' + (o.dir > 0 ? 'points up' : o.dir < 0 ? 'points down' : 'points neither way') + '</i></b><p>' + this.esc(o.how) + (o.val ? ' Now: ' + this.esc(o.val) + '.' : '') + '</p><p>It has pointed this way for <b>' + o.held + ' candle' + (o.held === 1 ? '' : 's') + '</b> (' + this.dur(o.held) + ').</p>' +
          (r && r.N >= 20 ? '<p>On this chart, the ' + r.N + ' candles where it pointed ' + (o.dir > 0 ? 'up' : 'down') + ' were followed ' + this.AHEAD + ' candles later by a move that way <b>' + r.p.toFixed(0) + '%</b> of the time. Any candle: <b>' + r.base.toFixed(0) + '%</b>.</p>' : o.dir ? '<p>Too few cases on this chart to say how it did.</p>' : '')); } }
    /* fresh one-off signals */
    html('sgEv', C.ev.length ? C.ev.map(e => '<div class="' + (e.dir > 0 ? 'up' : 'dn') + '" title="' + this.esc(e.how) + '"><i>' + (e.dir > 0 ? '▲' : '▼') + '</i><b>' + this.esc(e.name) + '</b><em>' + (e.ago === 0 ? 'this candle' : e.ago + ' candle' + (e.ago === 1 ? '' : 's') + ' ago') + '</em></div>').join('') : '<span class="sgNone">None in the last six candles.</span>');
    /* the record of this many agreeing */
    const rec = L.side ? this.record(C, L.side, L.n) : null;
    html('sgRec', !L.side ? '<span class="sgNone">The readings are evenly split, so there is no side to check.</span>' : !rec || rec.N < 20 ? '<span class="sgNone">At least ' + L.n + ' pointing ' + word + ' has happened only ' + (rec ? rec.N : 0) + ' times in the ' + (C.n - this.WARM) + ' candles read: too few to say.</span>'
      : '<div class="sgRecRow"><span>When at least ' + L.n + ' pointed ' + word + '</span><i><u class="' + (rec.p >= rec.base + 3 ? 'up' : rec.p <= rec.base - 3 ? 'dn' : '') + '" style="--w:' + rec.p.toFixed(0) + '%"></u></i><b>' + rec.p.toFixed(0) + '%</b></div><div class="sgRecRow"><span>Any candle</span><i><u style="--w:' + rec.base.toFixed(0) + '%"></u></i><b>' + rec.base.toFixed(0) + '%</b></div><p>How often price was ' + (L.side > 0 ? 'higher' : 'lower') + ' ' + this.AHEAD + ' candles later. ' + rec.N + ' cases in the last ' + (C.n - this.WARM) + ' candles of this chart. Direction only, before the spread. ' + (Math.abs(rec.p - rec.base) < 3 ? 'No real difference from any candle.' : rec.p > rec.base ? 'A little better than any candle on this stretch; the cases overlap, so it proves little.' : 'Worse than any candle on this stretch.') + '</p>');
    this.paintTfs(); this.clock(); },
  paintTfs(){ const el = this.$('sgTfs'); if (!el) return; const sym = STORE.symbol, C = this.C;
    const chip = (tf, d, cur) => { const of = d && d.of ? d.of : 9, up = d && !d.none ? d.up : 0, dn = d && !d.none ? d.dn : 0, side = up > dn ? 'up' : dn > up ? 'dn' : ''; return '<button type="button" class="sgTf ' + side + (cur ? ' cur' : '') + '" data-sgtf="' + tf + '" title="' + (cur ? 'The chart you are on' : 'Open the ' + tf + ' chart') + '"><b>' + tf + '</b><span>' + Array.from({ length: of }, (_, k) => '<i class="' + (!d || d.none ? '' : k < up ? 'up' : k >= of - dn ? 'dn' : '') + '"></i>').join('') + '</span><em>' + (!d ? '…' : d.none ? 'no data' : (side === 'up' ? up + ' up' : side === 'dn' ? dn + ' down' : 'split')) + '</em></button>'; };
    let cur = null; if (C){ const t = C.lights.filter(l => l.fam === 'trend'); cur = { up: t.filter(l => l.dir > 0).length, dn: t.filter(l => l.dir < 0).length, of: t.length }; }
    const tfs = this.TFS.includes(STORE.tf) ? this.TFS : [STORE.tf].concat(this.TFS), h = tfs.map(tf => tf === STORE.tf ? chip(tf, cur, true) : chip(tf, this.M[sym + '|' + tf], false)).join(''); if (el._h !== h){ el._h = h; el.innerHTML = h; } },
  /* when the forming candle closes. Up to one hour the candles sit on the clock; above that the candle's own start is used */
  clock(){ if (!this.active()) return; const el = this.$('sgCd'); if (!el) return; const sec = typeof tfSeconds === 'function' ? tfSeconds(STORE.tf) : 0, now = Date.now() / 1000; let rem = NaN;
    if (sec && sec <= 3600) rem = sec - (now % sec); else if (sec && this.C && this.C.last){ const t0 = this.C.last.rawTime != null ? this.C.last.rawTime : this.C.last.time; rem = t0 + sec - now; if (!(rem > 0 && rem <= sec)) rem = NaN; }
    const f = x => String(Math.floor(x)).padStart(2, '0'), t = rem !== rem ? '–' : rem >= 3600 ? Math.floor(rem / 3600) + ':' + f(rem % 3600 / 60) + ':' + f(rem % 60) : f(rem / 60) + ':' + f(rem % 60); if (el.textContent !== t) el.textContent = t; el.classList.toggle('soon', rem === rem && rem <= 10); },
};
(function(){ let n = 0; const go = () => { try { SignalBoard.init(); } catch(e){ console.warn('signals board', e); } if (!document.getElementById('tab-tssig') && ++n < 14) setTimeout(go, 800); }; if (document.readyState !== 'loading') setTimeout(go, 2100); else document.addEventListener('DOMContentLoaded', () => setTimeout(go, 2100)); })();
