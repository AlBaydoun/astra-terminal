/* ASTRA Terminal — the Strategy Lab.

   The Master Brain does not only judge the bots that exist; it invents new ones.
   A "recipe" is a base strategy plus a set of numbers — how far the stop sits
   from the candle, how much reward it asks for each unit of risk, how strict the
   entry has to be, which timeframe it works on. The lab mutates those numbers,
   backtests every candidate across several instruments, and publishes only the
   ones that beat the guards on evidence.

   Everything it creates is a PAPER bot. Nothing here can reach a broker. */
const StratLab = {

  /* the strategies it is allowed to build from, and the range each knob may take */
  BASES: {
    pullback: {
      label: 'Regime Pullback', warmup: 90,
      fn: (w, cfg) => STRAT.regimePullback(w, cfg),
      knobs: { threshold: [0.60, 0.95, 0.01], stopAtr: [0.8, 2.2, 0.1], rr: [1.0, 3.0, 0.1] },
    },
    candle: {
      label: 'Candlestick', warmup: 70,
      fn: (w, cfg) => STRAT.candlestick(w, cfg),
      knobs: { minScore: [50, 82, 1], stopPad: [0.05, 0.6, 0.05], rr: [1.0, 2.6, 0.05],
               trendBonus: [0, 20, 1], atrMax: [1.0, 3.5, 0.1], trendOnly: [0, 1, 1] },
    },
    ribbon: {
      label: 'MA ribbon + MACD', warmup: 230, needsHigher: true,
      fn: (w, cfg, l, h) => STRAT.maMacd(w, cfg, h),
      knobs: { stopPad: [0.05, 0.6, 0.05], rr: [1.0, 3.0, 0.1], tp1R: [0.6, 1.6, 0.1] },
    },
    rigor: {
      label: 'RigorGate', warmup: 90,
      fn: (w, cfg, l) => STRAT.rigorGate(w, cfg, l),
      knobs: { minScore: [50, 80, 1], stopAtr: [0.8, 2.2, 0.1], rr: [1.0, 3.0, 0.1] },
    },
    fade: {
      label: 'Mean Reversion', warmup: 80,
      fn: (w, cfg) => STRAT.meanFade(w, cfg),
      knobs: { minScore: [50, 78, 1], bbDev: [1.6, 3.0, 0.1], adxMax: [14, 30, 1],
               rsiLow: [20, 40, 1], stopPad: [0.2, 0.8, 0.05], minR: [0.6, 1.6, 0.1],
               pierceBars: [1, 6, 1] },
    },
    consensus: {
      label: 'Consensus', warmup: 240, needsHigher: true,
      fn: (w, cfg, l, h) => STRAT.consensus(w, cfg, l, h),
      knobs: { minAgree: [1.5, 3, 0.5], leanScore: [50, 78, 1], minScore: [55, 85, 1] },
    },
  },
  TFS: ['5m', '15m', '1h', '4h'],

  /* a candidate must earn its place — these are the publishing guards */
  GUARD: { trades: 25, pf: 1.25, avgR: 0.05, consistency: 0.5, maxDD: 30 },
  MAX_BOTS: 8,

  state: null,
  busy: false,

  load(){
    this.state = lsGet('astra_lab', null) || { recipes: [], log: [], runs: 0, tried: 0, lastRun: 0 };
    if (!this.state.log) this.state.log = [];
    if (!this.state.recipes) this.state.recipes = [];
    return this.state;
  },
  save(){ lsSet('astra_lab', this.state); },
  note(text){
    this.state.log.unshift({ t: Date.now(), text });
    if (this.state.log.length > 60) this.state.log.length = 60;
  },

  /* ---------- recipes ---------- */
  rand(range){
    const [lo, hi, step] = range;
    const n = Math.floor(Math.random() * ((hi - lo) / step + 1));
    return +(lo + n * step).toFixed(4);
  },
  jitter(v, range){
    const [lo, hi, step] = range;
    const move = (Math.random() < 0.5 ? -1 : 1) * step * (1 + Math.floor(Math.random() * 3));
    return +Math.min(hi, Math.max(lo, Math.round((v + move) / step) * step)).toFixed(4);
  },

  /* a fresh draw, or a small step away from something that already works */
  propose(parent){
    const ids = Object.keys(this.BASES);
    const baseId = parent ? parent.base : ids[Math.floor(Math.random() * ids.length)];
    const base = this.BASES[baseId];
    const params = {};
    for (const [k, range] of Object.entries(base.knobs))
      params[k] = (parent && parent.params && parent.params[k] != null && Math.random() < 0.7)
        ? this.jitter(parent.params[k], range)
        : this.rand(range);
    const tf = (parent && Math.random() < 0.65) ? parent.tf : this.TFS[Math.floor(Math.random() * this.TFS.length)];
    return { base: baseId, params, tf };
  },

  signature(rec){
    return rec.base + '|' + rec.tf + '|' + Object.entries(rec.params).sort()
      .map(([k, v]) => k + '=' + v).join(',');
  },

  nameFor(rec){
    const base = this.BASES[rec.base];
    const p = rec.params;
    const bits = [];
    if (p.rr != null) bits.push('R' + (+p.rr).toFixed(1));
    if (p.threshold != null) bits.push('T' + Math.round(p.threshold * 100));
    if (p.minScore != null) bits.push('S' + p.minScore);
    if (p.trendOnly) bits.push('trend-only');
    return 'Lab · ' + base.label + ' ' + bits.join(' ') + ' · ' + rec.tf;
  },

  blurbFor(rec, ev){
    const base = this.BASES[rec.base];
    const p = Object.entries(rec.params).map(([k, v]) => k + ' ' + v).join(', ');
    const record = ev
      ? ' Found by the lab on ' + new Date(ev.at).toLocaleDateString() + ': ' + ev.trades +
        ' backtested trades across ' + ev.syms + ' instruments, profit factor ' +
        (ev.pf === Infinity ? '∞' : ev.pf.toFixed(2)) + ', average ' + ev.avgR.toFixed(2) +
        'R, worst drawdown ' + ev.maxDD.toFixed(1) + '%.'
      : '';
    return base.label + ' on ' + rec.tf + ' with ' + p + '.' + record +
      ' Paper only — it has to earn a live seat before it gets one.';
  },

  /* turn a stored recipe back into a real bot the workspace can run */
  toBot(rec){
    const base = this.BASES[rec.base];
    if (!base) return null;
    const params = rec.params;
    return {
      id: rec.id,
      name: rec.name || this.nameFor(rec),
      blurb: rec.blurb || this.blurbFor(rec, rec.evidence),
      lab: true, recipe: rec,
      defaults: Object.assign({ tf: rec.tf, tfAuto: false, minScore: 0, maxOpen: 2 }, params,
        base.needsHigher ? { higherTf: this.higherOf(rec.tf) } : {}),
      warmup: base.warmup, needsHigher: !!base.needsHigher,
      signal: (w, cfg, ledger, higher) => base.fn(w, Object.assign({}, params, cfg), ledger, higher),
    };
  },

  higherOf(tf){
    const order = ['1m', '5m', '15m', '1h', '4h', '1d'];
    const i = order.indexOf(tf);
    return order[Math.min(order.length - 1, i + 2)] || '1h';
  },

  /* ---------- registration ---------- */
  mount(rec){
    const bot = this.toBot(rec);
    if (!bot || BOT_BY_ID[bot.id]) return null;
    BOTS.push(bot);
    BOT_BY_ID[bot.id] = bot;
    if (typeof Bots !== 'undefined' && Bots.ledgers){
      Bots.cfgs[bot.id] = Object.assign({}, bot.defaults, lsGet('astra_botcfg_' + bot.id, {}));
      Bots.ledgers[bot.id] = BotEngine.load(bot.id);
    }
    if (typeof StratIndReg !== 'undefined') StratIndReg.add(bot);
    return bot;
  },

  /* rebuild every published lab bot — called once at start-up */
  init(){
    this.load();
    for (const rec of this.state.recipes) if (!rec.retired) this.mount(rec);
  },

  /* ---------- measuring a candidate ---------- */
  async assess(rec, syms, limit){
    const bot = this.toBot(Object.assign({}, rec, { id: rec.id || 'lab_probe' }));
    if (!bot) return null;
    let trades = 0, gw = 0, gl = 0, net = 0, rSum = 0, maxDD = 0, profitable = 0, learned = 0;
    const per = [];
    for (const sym of syms){
      const r = await Backtest.run(bot, { sym, tf: rec.tf, limit: limit || 1000 });
      await new Promise(res => setTimeout(res));          // let the interface breathe
      if (r.error) continue;
      const s = r.stats;
      trades += s.trades; net += s.pnl; gw += s.winAmount; gl += s.lossAmount;
      rSum += s.avgR * s.trades; maxDD = Math.max(maxDD, s.maxDD);
      if (s.pnl > 0) profitable++;
      per.push({ sym, trades: s.trades, net: +s.pnl.toFixed(2),
        pf: s.profitFactor === Infinity ? null : +s.profitFactor.toFixed(2), avgR: +s.avgR.toFixed(3) });
      /* every backtest the lab runs also teaches the Master Brain */
      learned += MasterBrain.ingestBacktest(r, bot);
    }
    const pf = gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0);
    return {
      at: Date.now(), trades, net: +net.toFixed(2), pf,
      avgR: trades ? +(rSum / trades).toFixed(3) : 0,
      maxDD: +maxDD.toFixed(1), syms: per.length, profitable, per, learned,
    };
  },

  /* one number for "is this worth keeping" — depth, consistency and drawdown all
     count, so a lucky three-trade run cannot win */
  score(ev){
    if (!ev || !ev.trades) return -1;
    const pf = ev.pf === Infinity ? 3 : Math.min(ev.pf, 3);
    const depth = Math.min(1, ev.trades / 40);
    const consistency = ev.syms ? ev.profitable / ev.syms : 0;
    const ddPen = Math.max(0.1, 1 - ev.maxDD / 40);
    return +(ev.avgR * depth * consistency * ddPen * (0.5 + pf / 3)).toFixed(4);
  },

  passes(ev){
    const G = this.GUARD;
    return !!ev && ev.trades >= G.trades && (ev.pf === Infinity || ev.pf >= G.pf) &&
      ev.avgR >= G.avgR && ev.syms > 0 && ev.profitable / ev.syms >= G.consistency && ev.maxDD <= G.maxDD;
  },

  why(ev){
    if (!ev || !ev.trades) return 'it produced no trades at all';
    const G = this.GUARD, out = [];
    if (ev.trades < G.trades) out.push('only ' + ev.trades + ' trades (needs ' + G.trades + ')');
    if (ev.pf !== Infinity && ev.pf < G.pf) out.push('profit factor ' + ev.pf.toFixed(2) + ' (needs ' + G.pf + ')');
    if (ev.avgR < G.avgR) out.push('average ' + ev.avgR.toFixed(2) + 'R');
    if (ev.syms && ev.profitable / ev.syms < G.consistency)
      out.push('made money on only ' + ev.profitable + ' of ' + ev.syms + ' instruments');
    if (ev.maxDD > G.maxDD) out.push('drawdown ' + ev.maxDD.toFixed(1) + '%');
    return out.join(', ') || 'it did not beat the guards';
  },

  /* ---------- the research run ---------- */
  universe(){
    const syms = (typeof Feed !== 'undefined' && Feed.bridge)
      ? BotEngine.PRIORITY.filter(s => Feed.bridgeHas(s))
      : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
    return syms.length ? syms.slice(0, 3) : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  },

  async research(candidates, onProgress){
    if (this.busy) return { error: 'A research run is already going' };
    this.busy = true;
    this.load();
    const n = candidates || 8;
    const syms = this.universe();
    const seen = {};
    for (const r of this.state.recipes) seen[this.signature(r)] = true;

    /* parents: what already works, best first */
    const parents = this.state.recipes.filter(r => !r.retired)
      .sort((a, b) => this.score(b.evidence) - this.score(a.evidence));

    const results = [];
    try {
      for (let i = 0; i < n; i++){
        let rec = null;
        for (let tries = 0; tries < 12 && !rec; tries++){
          const parent = (parents.length && Math.random() < 0.6)
            ? parents[Math.floor(Math.random() * Math.min(3, parents.length))] : null;
          const cand = this.propose(parent);
          if (!seen[this.signature(cand)]) rec = cand;
        }
        if (!rec) break;
        seen[this.signature(rec)] = true;
        if (onProgress) onProgress(i, n, this.nameFor(rec));
        const ev = await this.assess(rec, syms);
        this.state.tried++;
        results.push({ rec, ev, score: this.score(ev) });
      }

      results.sort((a, b) => b.score - a.score);
      const published = [];
      for (const r of results){
        if (published.length >= 2) break;
        if (!this.passes(r.ev)){
          this.note('Rejected ' + this.nameFor(r.rec) + ' — ' + this.why(r.ev));
          continue;
        }
        const live = this.state.recipes.filter(x => !x.retired);
        if (live.length >= this.MAX_BOTS){
          const worst = live.slice().sort((a, b) => this.score(a.evidence) - this.score(b.evidence))[0];
          if (this.score(worst.evidence) >= r.score){
            this.note('Kept ' + worst.name + ' — the new candidate did not beat it');
            continue;
          }
          this.retire(worst.id, 'replaced by a stronger recipe');
        }
        const rec = Object.assign({}, r.rec, {
          id: 'lab_' + (++this.state.runs) + Date.now().toString(36).slice(-4),
          evidence: r.ev, born: Date.now(),
        });
        rec.name = this.nameFor(rec);
        rec.blurb = this.blurbFor(rec, r.ev);
        this.state.recipes.push(rec);
        this.mount(rec);
        published.push(rec);
        this.note('Opened a new bot: ' + rec.name + ' — ' + r.ev.trades + ' backtested trades, PF ' +
          (r.ev.pf === Infinity ? '∞' : r.ev.pf.toFixed(2)) + ', ' + r.ev.avgR.toFixed(2) +
          'R average, profitable on ' + r.ev.profitable + ' of ' + r.ev.syms + ' instruments');
      }

      /* the research itself is training data */
      const learned = results.reduce((a, r) => a + ((r.ev && r.ev.learned) || 0), 0);
      if (learned) MasterBrain.train();
      this.state.lastRun = Date.now();
      this.save();
      return { tested: results.length, published, learned, best: results[0] || null, syms };
    } finally {
      this.busy = false;
    }
  },

  retire(id, reason){
    const rec = this.state.recipes.find(r => r.id === id);
    if (!rec) return;
    rec.retired = Date.now();
    rec.retiredWhy = reason || 'retired by hand';
    const i = BOTS.findIndex(b => b.id === id);
    if (i >= 0) BOTS.splice(i, 1);
    delete BOT_BY_ID[id];
    if (typeof StratIndReg !== 'undefined') StratIndReg.remove(id);
    this.note('Retired ' + rec.name + ' — ' + rec.retiredWhy);
    this.save();
  },

  /* re-measure every published bot and retire the ones that no longer hold up */
  async review(onProgress){
    this.load();
    const syms = this.universe();
    const live = this.state.recipes.filter(r => !r.retired);
    let dropped = 0;
    for (let i = 0; i < live.length; i++){
      if (onProgress) onProgress(i, live.length, live[i].name);
      const ev = await this.assess(live[i], syms);
      live[i].evidence = ev;
      live[i].reviewedAt = Date.now();
      if (!this.passes(ev)){ this.retire(live[i].id, 'failed its review — ' + this.why(ev)); dropped++; }
    }
    this.save();
    return { checked: live.length, dropped };
  },
};
