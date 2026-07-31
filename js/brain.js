/* ASTRA Terminal — the Observer: a self-adjusting signal engine.
   It votes with 10 rule-based strategies, records each call as a "signal note",
   checks the outcome after a fixed horizon, and re-weights its strategies:
   winners gain trust, losers lose it. On a wrong call it re-examines the window
   to find which strategies WOULD have been right and boosts those.
   Experimental pattern engine — not financial advice, and it never touches real money. */
const Brain = {
  HORIZON: 10,          // evaluation horizon in candles
  MIN_VOTERS: 3,
  W_MIN: 0.2, W_MAX: 3,
  TFSEC: { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 },

  state: lsGet('astra_brain', { weights: {}, notes: [], log: [], strat: {}, autoTrade: false }),

  STRATS: [
    { id: 'emaCross', name: 'EMA 9/21 cross', check(c, cl){
      const e9 = IND.ema(cl, 9), e21 = IND.ema(cl, 21), n = cl.length - 1;
      if (e9[n] == null || e21[n - 3] == null) return null;
      if (e9[n] > e21[n] && e9[n - 3] <= e21[n - 3]) return { dir: 1, why: 'fast EMA just crossed above slow EMA' };
      if (e9[n] < e21[n] && e9[n - 3] >= e21[n - 3]) return { dir: -1, why: 'fast EMA just crossed below slow EMA' };
      return null;
    }},
    { id: 'rsiRev', name: 'RSI reversal', check(c, cl){
      const r = IND.rsi(cl, 14), n = cl.length - 1;
      if (r[n] == null || r[n - 1] == null) return null;
      if (r[n] < 32 && r[n] > r[n - 1]) return { dir: 1, why: 'RSI oversold and turning up' };
      if (r[n] > 68 && r[n] < r[n - 1]) return { dir: -1, why: 'RSI overbought and turning down' };
      return null;
    }},
    { id: 'macdMom', name: 'MACD momentum', check(c, cl){
      const h = IND.macd(cl, 12, 26, 9).hist, n = cl.length - 1;
      if (h[n] == null || h[n - 2] == null) return null;
      if (h[n] > 0 && h[n] > h[n - 1] && h[n - 1] > h[n - 2]) return { dir: 1, why: 'MACD momentum building up' };
      if (h[n] < 0 && h[n] < h[n - 1] && h[n - 1] < h[n - 2]) return { dir: -1, why: 'MACD momentum building down' };
      return null;
    }},
    { id: 'superT', name: 'SuperTrend', check(c, cl){
      const st = IND.supertrend(c, 10, 3), n = cl.length - 1;
      if (st.up[n] != null) return { dir: 1, why: 'SuperTrend is in an uptrend' };
      if (st.down[n] != null) return { dir: -1, why: 'SuperTrend is in a downtrend' };
      return null;
    }},
    { id: 'bbBreak', name: 'Bollinger breakout', check(c, cl){
      const b = IND.bb(cl, 20, 2), n = cl.length - 1;
      if (b.up[n] == null) return null;
      if (cl[n] > b.up[n]) return { dir: 1, why: 'price broke above the upper Bollinger band' };
      if (cl[n] < b.lo[n]) return { dir: -1, why: 'price broke below the lower Bollinger band' };
      return null;
    }},
    { id: 'vwapStretch', name: 'VWAP stretch', check(c, cl){
      const vw = IND.vwapDaily(c), n = cl.length - 1;
      if (vw[n] == null) return null;
      const d = (cl[n] - vw[n]) / vw[n];
      if (d > 0.02) return { dir: -1, why: 'price stretched 2%+ above VWAP — pullback likely' };
      if (d < -0.02) return { dir: 1, why: 'price stretched 2%+ below VWAP — bounce likely' };
      return null;
    }},
    { id: 'stochX', name: 'Stochastic cross', check(c, cl){
      const s = IND.stoch(c, 14, 3, 3), n = cl.length - 1;
      if (s.k[n] == null || s.d[n - 1] == null) return null;
      if (s.k[n] > s.d[n] && s.k[n - 1] <= s.d[n - 1] && s.k[n] < 30) return { dir: 1, why: 'stochastic crossed up from oversold' };
      if (s.k[n] < s.d[n] && s.k[n - 1] >= s.d[n - 1] && s.k[n] > 70) return { dir: -1, why: 'stochastic crossed down from overbought' };
      return null;
    }},
    { id: 'volSpike', name: 'Volume burst', check(c){
      const n = c.length - 1;
      let avg = 0;
      for (let i = n - 20; i < n; i++) avg += c[i].volume;
      avg /= 20;
      if (avg > 0 && c[n].volume > 2.5 * avg){
        const dir = c[n].close >= c[n].open ? 1 : -1;
        return { dir, why: 'unusual volume burst on a ' + (dir > 0 ? 'green' : 'red') + ' candle' };
      }
      return null;
    }},
    { id: 'trendSlope', name: 'Trend slope', check(c, cl){
      const e = IND.ema(cl, 50), n = cl.length - 1;
      if (e[n] == null || e[n - 10] == null) return null;
      const s = (e[n] - e[n - 10]) / e[n - 10];
      if (s > 0.004) return { dir: 1, why: 'medium-term trend is rising' };
      if (s < -0.004) return { dir: -1, why: 'medium-term trend is falling' };
      return null;
    }},
    { id: 'engulf', name: 'Engulfing candle', check(c){
      const n = c.length - 1, a = c[n - 1], b = c[n];
      if (!a) return null;
      if (a.close < a.open && b.close > b.open && b.close > a.open && b.open < a.close)
        return { dir: 1, why: 'bullish engulfing candle' };
      if (a.close > a.open && b.close < b.open && b.close < a.open && b.open > a.close)
        return { dir: -1, why: 'bearish engulfing candle' };
      return null;
    }},
  ],

  init(){
    document.getElementById('aiAnalyze').addEventListener('click', () => this.consider(true));
    const at = document.getElementById('aiAuto');
    at.checked = !!this.state.autoTrade;
    at.addEventListener('change', () => {
      this.state.autoTrade = at.checked;
      this.save();
      toast(at.checked ? 'Observer will paper-trade its signals (play money only)' : 'Observer auto paper-trading off', 'info');
    });
    document.getElementById('aiReset').addEventListener('click', () => {
      if (confirm('Reset the Observer? All learned weights, notes and its log are cleared.')){
        this.state = { weights: {}, notes: [], log: [], strat: {}, autoTrade: false };
        document.getElementById('aiAuto').checked = false;
        this.save(); this.render();
      }
    });
    BUS.on('candleClose', () => this.consider(false));
    BUS.on('symbol', () => setTimeout(() => this.consider(false), 700));
    setInterval(() => this.evaluate(), 25000);
    this.render();
    setTimeout(() => this.consider(false), 2500);
  },

  w(id){ const v = this.state.weights[id]; return v == null ? 1 : v; },
  setW(id, v){ this.state.weights[id] = Math.min(this.W_MAX, Math.max(this.W_MIN, v)); },
  save(){
    if (this.state.notes.length > 120) this.state.notes.length = 120;
    if (this.state.log.length > 30) this.state.log.length = 30;
    lsSet('astra_brain', this.state);
  },

  analyze(candles){
    if (!candles || candles.length < 60) return null;
    const cl = candles.map(x => x.close);
    const votes = [];
    for (const s of this.STRATS){
      let r = null;
      try { r = s.check(candles, cl); } catch(e){}
      if (r && r.dir) votes.push({ id: s.id, name: s.name, dir: r.dir, why: r.why, w: this.w(s.id) });
    }
    if (votes.length < this.MIN_VOTERS) return { votes, dir: 0, conf: 0 };
    let score = 0, wsum = 0;
    for (const v of votes){ score += v.dir * v.w; wsum += v.w; }
    const conf = wsum ? Math.abs(score) / wsum : 0;
    return { votes, dir: score > 0 ? 1 : score < 0 ? -1 : 0, conf };
  },

  consider(force){
    const res = this.analyze(Chart.raw);
    this.renderVerdict(res);
    if (!res || !res.dir || res.conf < 0.5) return;
    const key = STORE.symbol + '|' + STORE.tf;
    if (!force && this.state.notes.some(x => x.status === 'pending' && x.key === key)) return;
    const c = Chart.raw, n = c.length - 1;
    const cl = c.map(x => x.close);
    const atr = IND.atr(c, 14)[n];
    const minMove = Math.max(0.15, atr ? atr / cl[n] * 100 * 0.5 : 0.3);
    const note = {
      id: Date.now(), key, sym: STORE.symbol, tf: STORE.tf,
      time: c[n].time, price: cl[n],
      dir: res.dir, conf: Math.round(res.conf * 100), minMove: +minMove.toFixed(2),
      voters: res.votes.map(v => ({ id: v.id, dir: v.dir })),
      whys: res.votes.filter(v => v.dir === res.dir).slice(0, 3).map(v => v.why),
      status: 'pending',
    };
    this.state.notes.unshift(note);
    this.save();
    this.render();
    toast('Observer: ' + baseAsset(note.sym) + ' looks ' + (note.dir > 0 ? 'UP' : 'DOWN') + ' (' + note.conf + '% confidence, next ' + this.HORIZON + ' bars)', 'info');
    this.autoTrade(note);
  },

  autoTrade(note){
    if (!this.state.autoTrade || note.conf < 55) return;
    const t = STORE.tickers.get(note.sym);
    if (!t) return;
    if (note.dir > 0){
      const qty = Port.state.balance * 0.05 / (t.last * (1 + Port.FEE));
      if (qty > 0) Port.execute(note.sym, 'buy', +qty.toPrecision(6), 'Observer');
    } else {
      const pos = Port.state.positions[note.sym];
      if (pos && pos.qty > 0) Port.execute(note.sym, 'sell', pos.qty, 'Observer');
    }
  },

  async evaluate(){
    const nowShift = Date.now() / 1000 + TZ_OFF;
    const due = this.state.notes.filter(x => {
      if (x.status !== 'pending') return false;
      const tfs = this.TFSEC[x.tf] || 3600;
      return nowShift >= x.time + (this.HORIZON + 1) * tfs;
    });
    if (!due.length) return;
    const cache = {};
    for (const note of due){
      const ck = note.sym + '|' + note.tf;
      try {
        if (!cache[ck]) cache[ck] = await API.klines(note.sym, note.tf, 1000);
      } catch(e){ continue; }
      const data = cache[ck];
      const tfs = this.TFSEC[note.tf] || 3600;
      const deadline = note.time + this.HORIZON * tfs;
      const bar = data.find(b => b.time >= deadline);
      const t = STORE.tickers.get(note.sym);
      const evalPrice = bar ? bar.close : (t ? t.last : null);
      if (evalPrice == null) continue;
      const move = (evalPrice - note.price) / note.price * 100;
      note.evalPrice = evalPrice;
      note.move = +move.toFixed(2);
      if (Math.abs(move) < note.minMove) note.status = 'flat';
      else note.status = (move > 0 ? 1 : -1) === note.dir ? 'correct' : 'wrong';
      if (note.status !== 'flat'){
        for (const v of note.voters){
          const agreed = v.dir === (move > 0 ? 1 : -1);
          this.setW(v.id, this.w(v.id) * (agreed ? 1.08 : 0.92));
          const st = this.state.strat[v.id] = this.state.strat[v.id] || { c: 0, t: 0 };
          st.t++; if (agreed) st.c++;
        }
      }
      if (note.status === 'wrong') this.retrospect(note, data, move);
    }
    this.save();
    this.render();
  },

  /* on a miss: which strategies would have been right? boost them and write it down */
  retrospect(note, data, move){
    const idx = data.findIndex(b => b.time === note.time);
    if (idx < 60) return;
    const slice = data.slice(0, idx + 1);
    const cl = slice.map(x => x.close);
    const actual = move > 0 ? 1 : -1;
    const winners = [];
    for (const s of this.STRATS){
      let r = null;
      try { r = s.check(slice, cl); } catch(e){}
      if (r && r.dir === actual){
        winners.push(s.name);
        this.setW(s.id, this.w(s.id) * 1.12);
      }
    }
    const head = baseAsset(note.sym) + ' ' + note.tf + ': said ' + (note.dir > 0 ? 'UP' : 'DOWN') + ', price went ' + fmtPct(move) + '.';
    this.state.log.unshift({
      t: Date.now(),
      msg: winners.length
        ? head + ' ' + winners.slice(0, 3).join(', ') + ' had it right — trusting ' + (winners.length > 1 ? 'them' : 'it') + ' more.'
        : head + ' None of my strategies caught it — keeping weights as they are.',
    });
  },

  /* --- rendering --- */
  renderVerdict(res){
    const el = document.getElementById('aiVerdict');
    if (!res){ el.innerHTML = '<div class="empty">Not enough chart data yet.</div>'; return; }
    const pct = Math.round(res.conf * 100);
    const dirTxt = res.dir > 0 ? 'UP' : res.dir < 0 ? 'DOWN' : 'NO CLEAR SIGNAL';
    const cls = res.dir > 0 ? 'up' : res.dir < 0 ? 'down' : 'flat';
    const whys = res.votes.filter(v => res.dir && v.dir === res.dir).slice(0, 4).map(v => '<li>' + esc(v.why) + '</li>').join('');
    el.innerHTML =
      `<div class="aiDir ${cls}">${res.dir > 0 ? '▲' : res.dir < 0 ? '▼' : '◆'} ${dirTxt}` +
      (res.dir ? ` <span class="aiConf">${pct}%</span>` : '') + `</div>` +
      `<div class="aiSub">${esc(baseAsset(STORE.symbol))}/USDT · ${esc(STORE.tf.toUpperCase())} · next ${this.HORIZON} bars · ${res.votes.length} strategies voting</div>` +
      (whys ? `<ul class="aiWhys">${whys}</ul>` : '<div class="aiSub">Fewer than 3 strategies see anything right now.</div>');
  },

  render(){
    const notes = this.state.notes;
    const wins = notes.filter(x => x.status === 'correct').length;
    const losses = notes.filter(x => x.status === 'wrong').length;
    const flat = notes.filter(x => x.status === 'flat').length;
    const pend = notes.filter(x => x.status === 'pending').length;
    document.getElementById('aiStats').innerHTML =
      `<span class="up">${wins} right</span> · <span class="down">${losses} wrong</span> · ${flat} flat · ${pend} open` +
      (wins + losses ? ` · <b>${Math.round(wins / (wins + losses) * 100)}% hit rate</b>` : '');

    const lead = [...this.STRATS].sort((a, b) => this.w(b.id) - this.w(a.id));
    document.getElementById('aiLeader').innerHTML = lead.map(s => {
      const st = this.state.strat[s.id];
      const acc = st && st.t ? Math.round(st.c / st.t * 100) + '%' : '—';
      const wpct = (this.w(s.id) - this.W_MIN) / (this.W_MAX - this.W_MIN) * 100;
      return `<div class="aiStrat"><span>${esc(s.name)}</span><i><b style="width:${wpct.toFixed(0)}%"></b></i><span class="aiAcc">${acc}</span></div>`;
    }).join('');

    document.getElementById('aiNotes').innerHTML = notes.length ? notes.slice(0, 15).map(x => {
      const ic = { pending: '⏳', correct: '✓', wrong: '✗', flat: '·' }[x.status];
      const cls = { pending: 'flat', correct: 'up', wrong: 'down', flat: 'flat' }[x.status];
      return `<div class="aiNote"><span class="${cls}">${ic}</span>` +
        `<span class="${x.dir > 0 ? 'up' : 'down'}">${x.dir > 0 ? '▲' : '▼'}</span>` +
        `<b>${esc(baseAsset(x.sym))}</b><span class="dim2">${esc(x.tf)}</span>` +
        `<span>${fmtPrice(x.price)}</span>` +
        `<span class="${cls}">${x.move != null ? fmtPct(x.move) : x.conf + '%'}</span></div>`;
    }).join('') : '<div class="empty">No signal notes yet.<br>The Observer notes a call whenever enough strategies agree.</div>';

    document.getElementById('aiLog').innerHTML = this.state.log.length
      ? this.state.log.slice(0, 10).map(l => `<div class="aiLogRow">${esc(l.msg)}</div>`).join('')
      : '<div class="empty">Nothing learned yet — lessons appear after wrong calls.</div>';
  },
};
