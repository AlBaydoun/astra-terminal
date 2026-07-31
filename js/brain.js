/* ASTRA Terminal — the Observer: the terminal's flagship.
   A self-adjusting signal engine with its OWN virtual fund (10,000 USDT play money).
   16 strategies vote on precomputed indicator context; decisive verdicts become signal
   notes; strong UP notes buy with the fund (0.1% fee per side, like a real exchange);
   positions close at the note's horizon or on an opposite signal. Every outcome
   re-weights the strategies; every miss triggers a retrospective; every symbol load
   runs a backtest "research pass" that tries all strategies on real history (fees
   included) and nudges trust toward what actually earned.
   Experimental pattern engine — play money only, not financial advice. */
const Brain = {
  HORIZON: 10,
  MIN_VOTERS: 3,
  FEE: 0.001,               // 0.1% per side, buy and sell
  RT_FEE_PCT: 0.2,          // round-trip fee drag in % used by research
  W_MIN: 0.2, W_MAX: 3,
  TFSEC: { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 },

  state: null,
  radar: [],
  scanning: false,
  researched: {},

  defaults(){
    return {
      weights: {}, notes: [], log: [], strat: {}, research: {}, autoTrade: false,
      fund: { start: 10000, balance: 10000, positions: {}, trades: [], equity: [], fees: 0 },
      lastScan: 0,
    };
  },

  /* ---------------- strategies (all read a precomputed context at index i) ---------------- */
  STRATS: [
    { id: 'emaCross', name: 'EMA 9/21 cross', check(x, i){
      if (x.e9[i] == null || x.e21[i - 3] == null) return null;
      if (x.e9[i] > x.e21[i] && x.e9[i - 3] <= x.e21[i - 3]) return { dir: 1, why: 'fast EMA just crossed above slow EMA' };
      if (x.e9[i] < x.e21[i] && x.e9[i - 3] >= x.e21[i - 3]) return { dir: -1, why: 'fast EMA just crossed below slow EMA' };
      return null;
    }},
    { id: 'rsiRev', name: 'RSI reversal', check(x, i){
      const r = x.rsi;
      if (r[i] == null || r[i - 1] == null) return null;
      if (r[i] < 32 && r[i] > r[i - 1]) return { dir: 1, why: 'RSI oversold and turning up' };
      if (r[i] > 68 && r[i] < r[i - 1]) return { dir: -1, why: 'RSI overbought and turning down' };
      return null;
    }},
    { id: 'macdMom', name: 'MACD momentum', check(x, i){
      const h = x.macd.hist;
      if (h[i] == null || h[i - 2] == null) return null;
      if (h[i] > 0 && h[i] > h[i - 1] && h[i - 1] > h[i - 2]) return { dir: 1, why: 'MACD momentum building up' };
      if (h[i] < 0 && h[i] < h[i - 1] && h[i - 1] < h[i - 2]) return { dir: -1, why: 'MACD momentum building down' };
      return null;
    }},
    { id: 'superT', name: 'SuperTrend', check(x, i){
      if (x.st.up[i] != null) return { dir: 1, why: 'SuperTrend is in an uptrend' };
      if (x.st.down[i] != null) return { dir: -1, why: 'SuperTrend is in a downtrend' };
      return null;
    }},
    { id: 'bbBreak', name: 'Bollinger breakout', check(x, i){
      if (x.bb.up[i] == null) return null;
      if (x.cl[i] > x.bb.up[i]) return { dir: 1, why: 'price broke above the upper Bollinger band' };
      if (x.cl[i] < x.bb.lo[i]) return { dir: -1, why: 'price broke below the lower Bollinger band' };
      return null;
    }},
    { id: 'vwapStretch', name: 'VWAP stretch', check(x, i){
      if (x.vwap[i] == null) return null;
      const d = (x.cl[i] - x.vwap[i]) / x.vwap[i];
      if (d > 0.02) return { dir: -1, why: 'price stretched 2%+ above VWAP — pullback likely' };
      if (d < -0.02) return { dir: 1, why: 'price stretched 2%+ below VWAP — bounce likely' };
      return null;
    }},
    { id: 'stochX', name: 'Stochastic cross', check(x, i){
      const s = x.stoch;
      if (s.k[i] == null || s.d[i - 1] == null) return null;
      if (s.k[i] > s.d[i] && s.k[i - 1] <= s.d[i - 1] && s.k[i] < 30) return { dir: 1, why: 'stochastic crossed up from oversold' };
      if (s.k[i] < s.d[i] && s.k[i - 1] >= s.d[i - 1] && s.k[i] > 70) return { dir: -1, why: 'stochastic crossed down from overbought' };
      return null;
    }},
    { id: 'volSpike', name: 'Volume burst', check(x, i){
      if (i < 21) return null;
      let avg = 0;
      for (let j = i - 20; j < i; j++) avg += x.c[j].volume;
      avg /= 20;
      if (avg > 0 && x.c[i].volume > 2.5 * avg){
        const dir = x.c[i].close >= x.c[i].open ? 1 : -1;
        return { dir, why: 'unusual volume burst on a ' + (dir > 0 ? 'green' : 'red') + ' candle' };
      }
      return null;
    }},
    { id: 'trendSlope', name: 'Trend slope', check(x, i){
      if (x.e50[i] == null || x.e50[i - 10] == null) return null;
      const s = (x.e50[i] - x.e50[i - 10]) / x.e50[i - 10];
      if (s > 0.004) return { dir: 1, why: 'medium-term trend is rising' };
      if (s < -0.004) return { dir: -1, why: 'medium-term trend is falling' };
      return null;
    }},
    { id: 'donchian', name: 'Donchian breakout', check(x, i){
      if (x.dch.hi[i] == null) return null;
      if (x.cl[i] > x.dch.hi[i]) return { dir: 1, why: 'price broke the 20-bar high' };
      if (x.cl[i] < x.dch.lo[i]) return { dir: -1, why: 'price broke the 20-bar low' };
      return null;
    }},
    { id: 'adxTrend', name: 'ADX trend strength', check(x, i){
      const a = x.adx;
      if (a.adx[i] == null || a.adx[i] < 25) return null;
      if (a.pdi[i] > a.mdi[i]) return { dir: 1, why: 'strong trend with buyers in control (ADX)' };
      if (a.mdi[i] > a.pdi[i]) return { dir: -1, why: 'strong trend with sellers in control (ADX)' };
      return null;
    }},
    { id: 'ichiCross', name: 'Ichimoku cross', check(x, i){
      const t = x.ichi.tenkan, k = x.ichi.kijun;
      if (t[i] == null || k[i - 2] == null) return null;
      if (t[i] > k[i] && t[i - 2] <= k[i - 2]) return { dir: 1, why: 'Ichimoku conversion line crossed above base line' };
      if (t[i] < k[i] && t[i - 2] >= k[i - 2]) return { dir: -1, why: 'Ichimoku conversion line crossed below base line' };
      return null;
    }},
    { id: 'patBull', name: 'Bullish candle patterns', check(x, i){
      const p = (x.pat[i] || []).find(q => q.dir === 1 && q.name !== 'Three soldiers');
      return p ? { dir: 1, why: p.name + ' candle pattern' } : null;
    }},
    { id: 'patBear', name: 'Bearish candle patterns', check(x, i){
      const p = (x.pat[i] || []).find(q => q.dir === -1 && q.name !== 'Three crows');
      return p ? { dir: -1, why: p.name + ' candle pattern' } : null;
    }},
    { id: 'patSoldiers', name: 'Three soldiers', check(x, i){
      return (x.pat[i] || []).some(q => q.name === 'Three soldiers') ? { dir: 1, why: 'three strong green candles in a row' } : null;
    }},
    { id: 'patCrows', name: 'Three crows', check(x, i){
      return (x.pat[i] || []).some(q => q.name === 'Three crows') ? { dir: -1, why: 'three strong red candles in a row' } : null;
    }},
    /* live-only intel strategies (never fire in backtests — they read the present) */
    { id: 'newsSent', name: 'News mood', check(x, i){
      if (i !== x.cl.length - 1 || typeof Intel === 'undefined' || !Intel.newsFresh()) return null;
      if (Intel.sentiment >= 25) return { dir: 1, why: 'news flow is clearly positive right now' };
      if (Intel.sentiment <= -25) return { dir: -1, why: 'news flow is clearly negative right now' };
      return null;
    }},
    { id: 'histEcho', name: 'History echo', check(x, i){
      if (i !== x.cl.length - 1 || typeof Intel === 'undefined' || !Intel.analogs || Intel.analogs.avgFwd == null) return null;
      if (Intel.analogs.avgFwd > 3) return { dir: 1, why: 'similar past market patterns went on to rise' };
      if (Intel.analogs.avgFwd < -3) return { dir: -1, why: 'similar past market patterns went on to fall' };
      return null;
    }},
  ],

  /* ---------------- lifecycle ---------------- */
  init(){
    this.state = Object.assign(this.defaults(), lsGet('astra_brain', {}));
    if (!this.state.fund) this.state.fund = this.defaults().fund;
    if (!this.state.research) this.state.research = {};

    document.getElementById('aiAnalyze').addEventListener('click', () => this.consider(true));
    const at = document.getElementById('aiAuto');
    at.checked = !!this.state.autoTrade;
    at.addEventListener('change', () => {
      this.state.autoTrade = at.checked;
      this.save();
      toast(at.checked ? 'Observer will mirror its signals into YOUR paper account too' : 'Observer mirroring off (its own fund keeps trading)', 'info');
    });
    document.getElementById('aiReset').addEventListener('click', () => {
      if (confirm('Reset the Observer completely? Weights, notes, journal AND its fund are cleared.')){
        this.state = this.defaults();
        document.getElementById('aiAuto').checked = false;
        this.save(); this.render(); this.renderDash();
      }
    });
    document.getElementById('obScan').addEventListener('click', () => this.scan(true));
    document.getElementById('obFundReset').addEventListener('click', () => {
      if (confirm('Reset the Observer fund to 10,000 USDT? Its positions and trade history are cleared.')){
        this.state.fund = this.defaults().fund;
        this.save(); this.renderDash();
      }
    });

    BUS.on('candleClose', () => this.consider(false));
    BUS.on('symbol', () => setTimeout(() => { this.consider(false); this.research(); }, 700));
    setInterval(() => this.evaluate(), 25000);
    setInterval(() => { if (Date.now() - this.state.lastScan > 600000) this.scan(false); }, 60000);
    setInterval(() => {
      const p = document.getElementById('bot-observer');
      if (p && p.classList.contains('active')) this.renderDash();
    }, 15000);

    this.render();
    setTimeout(() => { this.consider(false); this.research(); }, 2500);
    setTimeout(() => this.scan(false), 20000);
  },

  w(id){ const v = this.state.weights[id]; return v == null ? 1 : v; },
  setW(id, v){ this.state.weights[id] = Math.min(this.W_MAX, Math.max(this.W_MIN, v)); },
  journal(msg){ this.state.log.unshift({ t: Date.now(), msg }); },
  save(){
    if (this.state.notes.length > 150) this.state.notes.length = 150;
    if (this.state.log.length > 40) this.state.log.length = 40;
    if (this.state.fund.equity.length > 400) this.state.fund.equity.splice(0, this.state.fund.equity.length - 400);
    lsSet('astra_brain', this.state);
  },

  /* ---------------- analysis ---------------- */
  buildCtx(c){
    const cl = c.map(q => q.close);
    return {
      c, cl,
      e9: IND.ema(cl, 9), e21: IND.ema(cl, 21), e50: IND.ema(cl, 50),
      rsi: IND.rsi(cl, 14), macd: IND.macd(cl, 12, 26, 9),
      st: IND.supertrend(c, 10, 3), bb: IND.bb(cl, 20, 2),
      vwap: IND.vwapDaily(c), stoch: IND.stoch(c, 14, 3, 3), atr: IND.atr(c, 14),
      adx: IND.adx(c, 14), dch: IND.donchian(c, 20), ichi: IND.ichimoku(c, 9, 26),
      pat: PAT.index(c),
    };
  },

  analyze(candles){
    if (!candles || candles.length < 60) return null;
    const x = this.buildCtx(candles);
    const i = candles.length - 1;
    const votes = [];
    for (const s of this.STRATS){
      let r = null;
      try { r = s.check(x, i); } catch(e){}
      if (r && r.dir) votes.push({ id: s.id, name: s.name, dir: r.dir, why: r.why, w: this.w(s.id) });
    }
    if (votes.length < this.MIN_VOTERS) return { votes, dir: 0, conf: 0, ctx: x };
    let score = 0, wsum = 0;
    for (const v of votes){ score += v.dir * v.w; wsum += v.w; }
    const dir = score > 0 ? 1 : score < 0 ? -1 : 0;
    let conf = wsum ? Math.abs(score) / wsum : 0;
    let risk = null;
    if (typeof Intel !== 'undefined' && Intel.risk && Intel.risk.level >= 2){
      risk = Intel.risk;
      if (dir > 0) conf *= 0.75;   // shock headlines: dampen bullish confidence
    }
    return { votes, dir, conf, ctx: x, risk };
  },

  makeNote(candles, sym, tf, res, source){
    const n = candles.length - 1;
    const atr = res.ctx.atr[n];
    const px = candles[n].close;
    const minMove = Math.max(0.15, atr ? atr / px * 100 * 0.5 : 0.3);
    const note = {
      id: Date.now() + Math.floor(Math.random() * 1000),
      key: sym + '|' + tf, sym, tf,
      time: candles[n].time, price: px,
      dir: res.dir, conf: Math.round(res.conf * 100), minMove: +minMove.toFixed(2),
      voters: res.votes.map(v => ({ id: v.id, dir: v.dir })),
      whys: res.votes.filter(v => v.dir === res.dir).slice(0, 3).map(v => v.why),
      status: 'pending', source: source || 'chart',
    };
    this.state.notes.unshift(note);
    this.fundOnSignal(note);
    if (this.state.autoTrade && note.conf >= 55){
      if (note.dir > 0){
        const qty = Port.state.balance * 0.05 / (px * (1 + Port.FEE));
        if (qty > 0) Port.execute(sym, 'buy', +qty.toPrecision(6), 'Observer');
      } else {
        const pos = Port.state.positions[sym];
        if (pos && pos.qty > 0) Port.execute(sym, 'sell', pos.qty, 'Observer');
      }
    }
    return note;
  },

  consider(force){
    const res = this.analyze(Chart.raw);
    this.renderVerdict(res);
    if (!res || !res.dir || res.conf < 0.5) return;
    const key = STORE.symbol + '|' + STORE.tf;
    if (!force && this.state.notes.some(x => x.status === 'pending' && x.key === key)) return;
    const note = this.makeNote(Chart.raw, STORE.symbol, STORE.tf, res, 'chart');
    this.save(); this.render();
    toast('Observer: ' + baseAsset(note.sym) + ' looks ' + (note.dir > 0 ? 'UP' : 'DOWN') + ' (' + note.conf + '%, next ' + this.HORIZON + ' bars)', 'info');
  },

  /* ---------------- the Observer's own fund (fees on every side) ---------------- */
  fundOnSignal(note){
    const f = this.state.fund;
    const t = STORE.tickers.get(note.sym);
    const px = t ? t.last : note.price;
    if (note.dir < 0){
      if (f.positions[note.sym]) this.fundSell(note.sym, px, 'opposite signal');
      return;
    }
    if (note.conf < 55 || f.positions[note.sym]) return;
    const frac = Math.min(0.25, note.conf / 100 * 0.4);
    const budget = f.balance * frac;
    if (budget < 50) return;
    const qty = budget / (px * (1 + this.FEE));
    const fee = qty * px * this.FEE;
    f.balance -= qty * px + fee;
    f.fees += fee;
    f.positions[note.sym] = { qty, entry: px, feeIn: fee, noteId: note.id, t: Date.now(), tf: note.tf };
    note.trade = true;
    this.journal('Bought ' + (+qty.toPrecision(5)) + ' ' + baseAsset(note.sym) + ' @ ' + fmtPrice(px) + ' (' + note.conf + '% signal, fee ' + fee.toFixed(2) + ' USDT).');
    this.equityMark();
  },

  fundSell(sym, px, reason){
    const f = this.state.fund;
    const p = f.positions[sym];
    if (!p || !(px > 0)) return;
    const gross = p.qty * px;
    const fee = gross * this.FEE;
    f.balance += gross - fee;
    f.fees += fee;
    const pnl = gross - fee - p.qty * p.entry - p.feeIn;
    f.trades.unshift({
      t: Date.now(), sym, qty: p.qty, entry: p.entry, exit: px,
      fees: +(fee + p.feeIn).toFixed(2), pnl: +pnl.toFixed(2),
      pct: +(((px - p.entry) / p.entry * 100) - this.RT_FEE_PCT).toFixed(2),
      reason,
    });
    if (f.trades.length > 80) f.trades.length = 80;
    delete f.positions[sym];
    this.journal((pnl >= 0 ? 'Closed with profit: ' : 'Closed with loss: ') + baseAsset(sym) + ' ' + (pnl >= 0 ? '+' : '') + pnl.toFixed(2) + ' USDT after fees (' + reason + ').');
    this.equityMark();
  },

  fundEquity(){
    const f = this.state.fund;
    let eq = f.balance;
    for (const [s, p] of Object.entries(f.positions)){
      const t = STORE.tickers.get(s);
      eq += p.qty * (t ? t.last : p.entry);
    }
    return eq;
  },

  equityMark(){
    const f = this.state.fund;
    const eq = +this.fundEquity().toFixed(2);
    const last = f.equity[f.equity.length - 1];
    if (!last || Math.abs(eq - last.eq) / last.eq > 0.0005 || Date.now() - last.t > 300000)
      f.equity.push({ t: Date.now(), eq });
  },

  /* ---------------- evaluation + learning ---------------- */
  async evaluate(){
    const nowShift = Date.now() / 1000 + TZ_OFF;
    const due = this.state.notes.filter(x => x.status === 'pending' &&
      nowShift >= x.time + (this.HORIZON + 1) * (this.TFSEC[x.tf] || 3600));
    if (due.length){
      const cache = {};
      for (const note of due){
        const ck = note.sym + '|' + note.tf;
        try { if (!cache[ck]) cache[ck] = await API.klines(note.sym, note.tf, 1000); }
        catch(e){ continue; }
        const data = cache[ck];
        const deadline = note.time + this.HORIZON * (this.TFSEC[note.tf] || 3600);
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
        if (this.state.fund.positions[note.sym] && this.state.fund.positions[note.sym].noteId === note.id)
          this.fundSell(note.sym, evalPrice, 'signal window ended');
        if (note.status === 'wrong') this.retrospect(note, data, move);
      }
    }
    this.equityMark();
    this.save();
    this.render();
    const p = document.getElementById('bot-observer');
    if (p && p.classList.contains('active')) this.renderDash();
  },

  retrospect(note, data, move){
    const idx = data.findIndex(b => b.time === note.time);
    if (idx < 60) return;
    const x = this.buildCtx(data.slice(0, idx + 1));
    const actual = move > 0 ? 1 : -1;
    const winners = [];
    for (const s of this.STRATS){
      let r = null;
      try { r = s.check(x, idx); } catch(e){}
      if (r && r.dir === actual){
        winners.push(s.name);
        this.setW(s.id, this.w(s.id) * 1.12);
      }
    }
    const head = baseAsset(note.sym) + ' ' + note.tf + ': said ' + (note.dir > 0 ? 'UP' : 'DOWN') + ', price went ' + fmtPct(move) + '.';
    this.journal(winners.length
      ? head + ' ' + winners.slice(0, 3).join(', ') + ' had it right — trusting ' + (winners.length > 1 ? 'them' : 'it') + ' more.'
      : head + ' None of my strategies caught it — keeping weights as they are.');
  },

  /* ---------------- research: try every strategy on real history, fees included ---------------- */
  research(){
    const key = STORE.symbol + '|' + STORE.tf;
    if (this.researched[key] || Chart.raw.length < 300) return;
    this.researched[key] = true;
    setTimeout(() => {
      const c = Chart.raw.slice();
      const x = this.buildCtx(c);
      const H = this.HORIZON;
      const acc = {};
      for (let i = 60; i < c.length - H; i++){
        for (const s of this.STRATS){
          let r = null;
          try { r = s.check(x, i); } catch(e){}
          if (!r || !r.dir) continue;
          const net = (x.cl[i + H] - x.cl[i]) / x.cl[i] * 100 * r.dir - this.RT_FEE_PCT;
          const a = acc[s.id] = acc[s.id] || { fires: 0, wins: 0, net: 0 };
          a.fires++; if (net > 0) a.wins++; a.net += net;
        }
      }
      let best = null, worst = null;
      for (const [id, a] of Object.entries(acc)){
        if (a.fires < 5) continue;
        const exp = a.net / a.fires;
        this.state.research[id] = { fires: a.fires, winPct: Math.round(a.wins / a.fires * 100), exp: +exp.toFixed(2), key, t: Date.now() };
        this.setW(id, this.w(id) * (1 + Math.max(-0.06, Math.min(0.06, exp / 10))));
        const s = this.STRATS.find(q => q.id === id);
        if (!best || exp > best.exp) best = { name: s.name, exp };
        if (!worst || exp < worst.exp) worst = { name: s.name, exp };
      }
      if (best && worst){
        this.journal('Researched ' + baseAsset(STORE.symbol) + ' ' + STORE.tf + ' history (fees included): best — ' + best.name + ' (' + fmtPct(best.exp) + '/signal), weakest — ' + worst.name + ' (' + fmtPct(worst.exp) + '/signal). Weights adjusted.');
        this.save(); this.render();
      }
    }, 400);
  },

  /* ---------------- watchlist radar ---------------- */
  async scan(manual){
    if (this.scanning || !STORE.universe.length) return;
    this.scanning = true;
    this.state.lastScan = Date.now();
    if (manual) toast('Observer is scanning your watchlist…', 'info');
    const syms = Watch.list.slice(0, 16);
    const rows = [];
    await Promise.all(syms.map(async sym => {
      try {
        const d = await API.klines(sym, STORE.tf, 220);
        const r = this.analyze(d);
        if (r) rows.push({ sym, dir: r.dir, conf: Math.round(r.conf * 100), voters: r.votes.length, res: r, data: d });
      } catch(e){}
    }));
    rows.sort((a, b) => (b.dir * b.conf) - (a.dir * a.conf));
    let added = 0;
    for (const r of rows){
      if (added >= 3) break;
      if (!r.dir || r.conf < 60) continue;
      const key = r.sym + '|' + STORE.tf;
      if (this.state.notes.some(x => x.status === 'pending' && x.key === key)) continue;
      this.makeNote(r.data, r.sym, STORE.tf, r.res, 'radar');
      added++;
    }
    this.radar = rows.map(r => ({ sym: r.sym, dir: r.dir, conf: r.conf, voters: r.voters }));
    this.scanning = false;
    if (added) toast('Observer noted ' + added + ' new signal' + (added > 1 ? 's' : '') + ' from the radar scan', 'info');
    this.save(); this.render(); this.renderDash();
  },

  /* ---------------- rendering: sidebar ---------------- */
  renderVerdict(res){
    const el = document.getElementById('aiVerdict');
    if (!el) return;
    if (!res){ el.innerHTML = '<div class="empty">Not enough chart data yet.</div>'; return; }
    const pct = Math.round(res.conf * 100);
    const dirTxt = res.dir > 0 ? 'UP' : res.dir < 0 ? 'DOWN' : 'NO CLEAR SIGNAL';
    const cls = res.dir > 0 ? 'up' : res.dir < 0 ? 'down' : 'flat';
    const whys = res.votes.filter(v => res.dir && v.dir === res.dir).slice(0, 4).map(v => '<li>' + esc(v.why) + '</li>').join('');
    el.innerHTML =
      `<div class="aiDir ${cls}">${res.dir > 0 ? '▲' : res.dir < 0 ? '▼' : '◆'} ${dirTxt}` +
      (res.dir ? ` <span class="aiConf">${pct}%</span>` : '') + `</div>` +
      `<div class="aiSub">${esc(baseAsset(STORE.symbol))}/USDT · ${esc(STORE.tf.toUpperCase())} · next ${this.HORIZON} bars · ${res.votes.length}/${this.STRATS.length} strategies voting</div>` +
      (whys ? `<ul class="aiWhys">${whys}</ul>` : '<div class="aiSub">Fewer than 3 strategies see anything right now.</div>') +
      (res.risk ? `<div class="aiRisk">⚠ ${esc(res.risk.label)}<br><span>${esc(res.risk.lesson)}</span></div>` : '');
  },

  render(){
    if (!document.getElementById('aiStats')) return;
    const notes = this.state.notes;
    const wins = notes.filter(x => x.status === 'correct').length;
    const losses = notes.filter(x => x.status === 'wrong').length;
    const flat = notes.filter(x => x.status === 'flat').length;
    const pend = notes.filter(x => x.status === 'pending').length;
    document.getElementById('aiStats').innerHTML =
      `<span class="up">${wins}✓</span> <span class="down">${losses}✗</span> ${flat}· ${pend}⏳` +
      (wins + losses ? ` <b>${Math.round(wins / (wins + losses) * 100)}%</b>` : '');

    document.getElementById('aiNotes').innerHTML = notes.length ? notes.slice(0, 15).map(x => {
      const ic = { pending: '⏳', correct: '✓', wrong: '✗', flat: '·' }[x.status];
      const cls = { pending: 'flat', correct: 'up', wrong: 'down', flat: 'flat' }[x.status];
      return `<div class="aiNote"><span class="${cls}">${ic}</span>` +
        `<span class="${x.dir > 0 ? 'up' : 'down'}">${x.dir > 0 ? '▲' : '▼'}</span>` +
        `<b>${esc(baseAsset(x.sym))}</b><span class="dim2">${esc(x.tf)}${x.source === 'radar' ? '·R' : ''}${x.trade ? '·$' : ''}</span>` +
        `<span>${fmtPrice(x.price)}</span>` +
        `<span class="${cls}">${x.move != null ? fmtPct(x.move) : x.conf + '%'}</span></div>`;
    }).join('') : '<div class="empty">No signal notes yet.</div>';

    const lead = [...this.STRATS].sort((a, b) => this.w(b.id) - this.w(a.id));
    document.getElementById('aiLeader').innerHTML = lead.slice(0, 8).map(s => {
      const st = this.state.strat[s.id];
      const acc = st && st.t ? Math.round(st.c / st.t * 100) + '%' : '—';
      const wpct = (this.w(s.id) - this.W_MIN) / (this.W_MAX - this.W_MIN) * 100;
      return `<div class="aiStrat"><span>${esc(s.name)}</span><i><b style="width:${wpct.toFixed(0)}%"></b></i><span class="aiAcc">${acc}</span></div>`;
    }).join('') + '<div class="aiSub" style="padding:2px 12px">Full table in the OBSERVER panel below ↓</div>';

    document.getElementById('aiLog').innerHTML = this.state.log.length
      ? this.state.log.slice(0, 6).map(l => `<div class="aiLogRow">${esc(l.msg)}</div>`).join('')
      : '<div class="empty">Nothing learned yet.</div>';
  },

  /* ---------------- rendering: full dashboard (bottom panel) ---------------- */
  renderDash(){
    const f = this.state.fund;
    if (!document.getElementById('obFund')) return;
    const eq = this.fundEquity();
    const pnl = eq - f.start;
    const closed = f.trades;
    const w = closed.filter(t => t.pnl > 0), l = closed.filter(t => t.pnl <= 0);
    const gw = w.reduce((a, t) => a + t.pnl, 0), gl = Math.abs(l.reduce((a, t) => a + t.pnl, 0));
    let peak = -Infinity, dd = 0;
    for (const e of f.equity){ peak = Math.max(peak, e.eq); dd = Math.max(dd, (peak - e.eq) / peak * 100); }
    document.getElementById('obFund').innerHTML =
      `<div class="obStat"><label>EQUITY</label><b class="${pctClass(pnl)}">${fmtNum(eq)} USDT</b></div>` +
      `<div class="obStat"><label>P&L</label><b class="${pctClass(pnl)}">${(pnl >= 0 ? '+' : '') + fmtNum(pnl)} (${fmtPct(pnl / f.start * 100)})</b></div>` +
      `<div class="obStat"><label>CASH</label><b>${fmtNum(f.balance)}</b></div>` +
      `<div class="obStat"><label>FEES PAID</label><b class="down">${fmtNum(f.fees)}</b></div>` +
      `<div class="obStat"><label>TRADES</label><b>${closed.length} · ${closed.length ? Math.round(w.length / closed.length * 100) + '% win' : '—'}</b></div>` +
      `<div class="obStat"><label>PROFIT FACTOR</label><b>${gl > 0 ? (gw / gl).toFixed(2) : '—'}</b></div>` +
      `<div class="obStat"><label>MAX DRAWDOWN</label><b class="down">${dd > 0 ? '-' + dd.toFixed(1) + '%' : '—'}</b></div>`;

    this.drawEquity();

    const posE = Object.entries(f.positions);
    document.getElementById('obPositions').innerHTML = posE.length ? posE.map(([s, p]) => {
      const t = STORE.tickers.get(s);
      const now = t ? t.last : p.entry;
      const up = (now - p.entry) * p.qty - p.feeIn;
      return `<div class="obRow" data-sym="${esc(s)}"><b>${esc(baseAsset(s))}</b><span>${+p.qty.toPrecision(5)}</span>` +
        `<span>@ ${fmtPrice(p.entry)}</span><span class="${pctClass(up)}">${(up >= 0 ? '+' : '') + up.toFixed(2)}</span></div>`;
    }).join('') : '<div class="empty">No open positions</div>';
    document.querySelectorAll('#obPositions .obRow').forEach(r => r.addEventListener('click', () => App.setSymbol(r.dataset.sym)));

    document.getElementById('obTrades').innerHTML = closed.length ? closed.slice(0, 25).map(t =>
      `<div class="obRow"><b>${esc(baseAsset(t.sym))}</b><span>${fmtPrice(t.entry)} → ${fmtPrice(t.exit)}</span>` +
      `<span class="dim2">fees ${t.fees}</span><span class="${pctClass(t.pnl)}">${(t.pnl >= 0 ? '+' : '') + t.pnl} (${fmtPct(t.pct)})</span>` +
      `<span class="dim2">${esc(t.reason)}</span></div>`).join('') : '<div class="empty">No closed trades yet</div>';

    document.getElementById('obStrats').innerHTML = [...this.STRATS].sort((a, b) => this.w(b.id) - this.w(a.id)).map(s => {
      const st = this.state.strat[s.id];
      const r = this.state.research[s.id];
      return `<div class="obRow"><b>${esc(s.name)}</b><span>trust ${this.w(s.id).toFixed(2)}</span>` +
        `<span>${st && st.t ? Math.round(st.c / st.t * 100) + '% live (' + st.t + ')' : 'no live votes'}</span>` +
        `<span class="${r ? pctClass(r.exp) : ''}">${r ? 'research ' + fmtPct(r.exp) + '/sig · ' + r.winPct + '% (' + r.fires + ')' : 'not researched'}</span></div>`;
    }).join('');

    document.getElementById('obRadar').innerHTML = this.radar.length ? this.radar.map(r =>
      `<div class="obRow" data-sym="${esc(r.sym)}"><b>${esc(baseAsset(r.sym))}</b>` +
      `<span class="${r.dir > 0 ? 'up' : r.dir < 0 ? 'down' : 'flat'}">${r.dir > 0 ? '▲ UP' : r.dir < 0 ? '▼ DOWN' : '— quiet'}</span>` +
      `<span>${r.dir ? r.conf + '%' : ''}</span><span class="dim2">${r.voters} votes</span></div>`).join('')
      : '<div class="empty">No scan yet — press Scan.</div>';
    document.querySelectorAll('#obRadar .obRow').forEach(r => r.addEventListener('click', () => App.setSymbol(r.dataset.sym)));

    document.getElementById('obJournal').innerHTML = this.state.log.length
      ? this.state.log.map(l => `<div class="aiLogRow"><span class="dim2">${new Date(l.t).toLocaleTimeString()}</span> ${esc(l.msg)}</div>`).join('')
      : '<div class="empty">Journal is empty.</div>';
  },

  drawEquity(){
    const cv = document.getElementById('obEquity');
    if (!cv) return;
    const f = this.state.fund;
    const pts = f.equity.length ? f.equity : [{ t: Date.now(), eq: f.start }];
    const dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth || 220, H = cv.clientHeight || 70;
    cv.width = W * dpr; cv.height = H * dpr;
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    const vals = pts.map(p => p.eq).concat([this.fundEquity()]);
    const min = Math.min(...vals), max = Math.max(...vals);
    const rng = (max - min) || 1;
    const up = vals[vals.length - 1] >= f.start;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const x = i / Math.max(1, vals.length - 1) * W;
      const y = H - 4 - (v - min) / rng * (H - 8);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = up ? CFG.UP : CFG.DOWN;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.closePath();
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, up ? 'rgba(46,189,133,0.25)' : 'rgba(246,70,93,0.25)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fill();
  },
};
