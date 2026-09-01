/* ASTRA Terminal — the Master Brain.
   ---------------------------------------------------------------------------
   A real, trainable model — not a metaphor. Every strategy signal is turned into
   a numeric feature vector; every finished trade (paper OR backtest) becomes one
   labelled example. A logistic-regression classifier is trained by gradient
   descent to estimate P(this trade wins), and the brain converts that into an
   EXPECTANCY in R. It approves an entry only when the expected value is positive
   after costs.

   Three rules keep it honest, because a model graded on the data it memorised
   will always flatter itself:

   1. TIME-SPLIT VALIDATION. Training uses the older 70% of examples, scoring is
      reported on the newer 30% the model has never seen. In-sample numbers are
      shown too, and a large gap between them is reported as overfitting.
   2. IT MUST EARN THE RIGHT TO SPEAK. Below MIN_TRAIN samples, or when
      out-of-sample accuracy is no better than a coin toss, the brain abstains
      and the strategies run exactly as before.
   3. IT CAN ONLY EVER SAY NO. The brain filters and shrinks size. It can never
      invent an entry, never raise risk above the strategy's own limit, and never
      reach a broker — everything downstream of it is still paper. */
const MasterBrain = {
  MIN_TRAIN: 60,          // labelled examples before it may gate anything
  MIN_VAL: 25,            // validation examples before its score is trusted
  MIN_EXP_R: 0.02,        // required expectancy, in R, to approve a trade
  MAX_SAMPLES: 6000,
  LR: 0.08,
  EPOCHS: 260,
  L2: 0.0015,

  state: null,

  /* ---------------- feature vector ----------------
     Everything is scaled into roughly -1..1 so no single input dominates the
     gradient. Adding a feature here is all it takes for the brain to use it. */
  FEATURES: [
    /* --- the signal itself --- */
    'score', 'long', 'adx', 'rsiDev', 'atrPct', 'volRatio', 'spread',
    'fTrend', 'fPullback', 'fBreakout', 'fMomentum', 'fDirection', 'fVolume', 'fVolatility',
    'stopPct', 'rr', 'hourSin', 'hourCos', 'tfIdx', 'isCrypto',
    'sCandle', 'sEngulf', 'sJdub', 'sRigor', 'sMaMacd', 'sScanner',
    /* --- what kind of market it was (reconstructable for any past bar) --- */
    'atrPctile', 'regimeSlope', 'htf', 'rangePos', 'distVwap',
    'sessAsia', 'sessLondon', 'sessNY', 'sessOverlap', 'dow',
    /* --- how the world felt (Fear & Greed has a real archive; news does not) --- */
    'fng', 'fngAvail', 'newsMood', 'riskLvl', 'ctxAvail',
  ],

  featurize(sig, cfg, ctx){
    ctx = ctx || {};
    const m = sig.meta || {}, f = sig.factors || {};
    const px = sig.entry || 1;
    const stopPct = sig.sl ? Math.abs(px - sig.sl) / px * 100 : 0.5;
    const rr = sig.sl && sig.tp ? Math.abs(sig.tp - px) / Math.max(1e-9, Math.abs(px - sig.sl)) : 1.5;
    const d = new Date((ctx.time || Date.now()));
    const hour = d.getUTCHours() + d.getUTCMinutes() / 60;
    const tfIdx = Math.max(0, BotEngine.TFS.indexOf(sig.tf || cfg.tf || '15m'));
    const model = (sig.model || '').toLowerCase();
    const has = k => Object.keys(f).some(x => x.toLowerCase().includes(k));
    /* regime captured at the moment of the signal, and the day's sentiment */
    const S = sig.state || ctx.state || {};
    const C = (typeof MarketState !== 'undefined')
      ? MarketState.context(ctx.time || Date.now(), !!ctx.live)
      : { fng: 0.5, fngAvail: 0, newsMood: 0, riskLvl: 0, ctxAvail: 0 };

    return {
      score: Math.max(0, Math.min(1, (sig.score || 0) / 100)),
      long: sig.dir > 0 ? 1 : -1,
      adx: Math.max(0, Math.min(1.5, (m.adx || 20) / 40)),
      rsiDev: ((m.rsi != null ? m.rsi : 50) - 50) / 50,
      atrPct: Math.max(0, Math.min(1.5, (m.atrPct || 0.5) / 1.5)),
      volRatio: Math.max(0, Math.min(1.5, (m.volRatio || 1) / 2)),
      spread: Math.max(0, Math.min(1.5, (ctx.spreadPct || 0.02) / 0.05)),
      fTrend: f.trend ? 1 : 0,
      fPullback: f.pullback ? 1 : 0,
      fBreakout: f.breakout ? 1 : 0,
      fMomentum: f.momentum ? 1 : 0,
      fDirection: f.direction ? 1 : 0,
      fVolume: f.volume ? 1 : 0,
      fVolatility: f.volatility ? 1 : 0,
      stopPct: Math.max(0, Math.min(1.5, stopPct / 1.5)),
      rr: Math.max(0, Math.min(1.5, rr / 2)),
      hourSin: Math.sin(hour / 24 * 2 * Math.PI),
      hourCos: Math.cos(hour / 24 * 2 * Math.PI),
      tfIdx: tfIdx / 5,
      isCrypto: (typeof MK !== 'undefined' && MK.isCrypto(sig.sym || '')) ? 1 : 0,
      sCandle: /star|soldier|crow|doji/.test(model) ? 1 : 0,
      sEngulf: has('engulf') || /engulf/.test(model) ? 1 : 0,
      sJdub: /jdub/.test(model) ? 1 : 0,
      sRigor: /rigor/.test(model) ? 1 : 0,
      sMaMacd: /ribbon|macd/.test(model) ? 1 : 0,
      sScanner: /regime/.test(model) ? 1 : 0,

      atrPctile: S.atrPctile != null ? S.atrPctile : 0,
      regimeSlope: S.slope != null ? S.slope / 3 : 0,
      htf: S.htf != null ? S.htf : 0,
      rangePos: S.rangePos != null ? S.rangePos : 0.5,
      distVwap: S.distVwap != null ? S.distVwap / 3 : 0,
      sessAsia: S.asia || 0,
      sessLondon: S.london || 0,
      sessNY: S.ny || 0,
      sessOverlap: S.overlap || 0,
      dow: S.dow != null ? S.dow : 0,

      fng: C.fng, fngAvail: C.fngAvail,
      newsMood: C.newsMood, riskLvl: C.riskLvl, ctxAvail: C.ctxAvail,
    };
  },

  vec(fo){ return this.FEATURES.map(k => { const v = fo[k]; return (v == null || isNaN(v)) ? 0 : v; }); },

  /* ---------------- corpus ---------------- */
  blank(){
    return {
      samples: [], w: new Array(this.FEATURES.length).fill(0), b: 0,
      trained: 0, trainedAt: 0, metrics: null, version: 1,
      approved: 0, vetoed: 0, log: [],
    };
  },
  load(){
    this.state = Object.assign(this.blank(), lsGet('astra_brainml', {}));
    const n = this.FEATURES.length;
    /* When new features are added the old vectors are the wrong length. Mixing
       them would train nonsense, so short ones are padded with neutral zeros and
       any stale weights are discarded — the brain retrains from scratch. */
    let migrated = 0;
    for (const s of this.state.samples){
      if (!s.x || s.x.length === n) continue;
      if (s.x.length < n){ while (s.x.length < n) s.x.push(0); migrated++; }
      else { s.x = s.x.slice(0, n); migrated++; }
    }
    if (this.state.w.length !== n || migrated){
      this.state.w = new Array(n).fill(0);
      this.state.b = 0;
      this.state.metrics = null;
      this.state.trained = 0;
      if (migrated) this.state.log.unshift({ t: Date.now(),
        text: 'The brain gained new senses (market regime and sentiment), so ' + migrated +
              ' older examples were carried over as neutral and the model was reset for retraining.' });
    }
    return this.state;
  },
  save(){
    const s = this.state;
    if (s.samples.length > this.MAX_SAMPLES) s.samples.splice(0, s.samples.length - this.MAX_SAMPLES);
    if (s.log.length > 60) s.log.length = 60;
    lsSet('astra_brainml', s);
  },

  /* one finished trade -> one labelled example */
  addSample(sig, cfg, ctx, outcome){
    if (!this.state) this.load();
    const fo = this.featurize(sig, cfg || {}, ctx || {});
    this.state.samples.push({
      x: this.vec(fo), y: outcome.r > 0 ? 1 : 0, r: +outcome.r.toFixed(3),
      t: outcome.t || Date.now(), src: outcome.src || 'paper',
      sym: sig.sym, tf: sig.tf, model: sig.model || '',
    });
  },

  /* a whole backtest at once — this is where the volume of learning comes from */
  ingestBacktest(result, botDef){
    if (!this.state) this.load();
    if (!result || result.error || !result.closed) return 0;
    let n = 0;
    for (const t of result.closed){
      const sig = {
        sym: t.sym, tf: t.tf, dir: t.dir, entry: t.entry, sl: t.sl, tp: t.tp,
        score: t.score, model: t.model, factors: t.factors || {}, meta: t.meta || {}, state: t.state || null,
      };
      this.state.samples.push({
        x: this.vec(this.featurize(sig, botDef ? botDef.defaults : {}, { time: t.entryTime })),
        y: t.pnl > 0 ? 1 : 0, r: +(t.r || 0).toFixed(3),
        t: t.entryTime, src: 'backtest', sym: t.sym, tf: t.tf, model: t.model || '',
      });
      n++;
    }
    if (n){
      this.state.log.unshift({ t: Date.now(),
        text: 'Learned from ' + n + ' backtested trades on ' + baseAsset(result.sym) + ' ' + result.tf +
          ' (' + (botDef ? botDef.name : 'strategy') + ')' });
      this.save();
    }
    return n;
  },

  /* ---------------- training ---------------- */
  sigmoid(z){ return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, z)))); },
  predictRaw(w, b, x){
    let z = b;
    for (let i = 0; i < x.length; i++) z += w[i] * x[i];
    return this.sigmoid(z);
  },

  train(){
    if (!this.state) this.load();
    const S = this.state;
    const all = S.samples.slice().sort((a, b) => a.t - b.t);   // oldest first — time order matters
    if (all.length < this.MIN_TRAIN)
      return { ok: false, reason: 'Only ' + all.length + ' examples — needs ' + this.MIN_TRAIN + ' before training' };

    const cut = Math.floor(all.length * 0.7);
    const tr = all.slice(0, cut), va = all.slice(cut);
    const n = this.FEATURES.length;
    let w = new Array(n).fill(0), b = 0;

    /* class balance, so a rare outcome is not simply ignored */
    const pos = tr.filter(s => s.y === 1).length || 1;
    const neg = tr.length - pos || 1;
    const wPos = tr.length / (2 * pos), wNeg = tr.length / (2 * neg);

    for (let ep = 0; ep < this.EPOCHS; ep++){
      const lr = this.LR * (1 - ep / this.EPOCHS * 0.85);
      const gw = new Array(n).fill(0);
      let gb = 0;
      for (const s of tr){
        const p = this.predictRaw(w, b, s.x);
        const cw = s.y === 1 ? wPos : wNeg;
        const err = (p - s.y) * cw;
        for (let i = 0; i < n; i++) gw[i] += err * s.x[i];
        gb += err;
      }
      for (let i = 0; i < n; i++) w[i] -= lr * (gw[i] / tr.length + this.L2 * w[i]);
      b -= lr * (gb / tr.length);
    }

    const score = set => {
      if (!set.length) return null;
      let correct = 0, loss = 0;
      for (const s of set){
        const p = this.predictRaw(w, b, s.x);
        if ((p >= 0.5 ? 1 : 0) === s.y) correct++;
        loss += -(s.y * Math.log(Math.max(1e-9, p)) + (1 - s.y) * Math.log(Math.max(1e-9, 1 - p)));
      }
      return { n: set.length, acc: correct / set.length * 100, logLoss: loss / set.length };
    };

    const trM = score(tr), vaM = score(va);
    const base = Math.max(pos, neg) / tr.length * 100;     // always guessing the majority class

    /* what would the gate have done on the unseen part? */
    const wins = all.filter(s => s.r > 0), losses = all.filter(s => s.r <= 0);
    const avgWin = wins.length ? wins.reduce((a, s) => a + s.r, 0) / wins.length : 1;
    const avgLoss = losses.length ? Math.abs(losses.reduce((a, s) => a + s.r, 0) / losses.length) : 1;

    let takenR = 0, taken = 0, allR = 0;
    for (const s of va){
      const p = this.predictRaw(w, b, s.x);
      const exp = p * avgWin - (1 - p) * avgLoss;
      allR += s.r;
      if (exp >= this.MIN_EXP_R){ takenR += s.r; taken++; }
    }

    S.w = w; S.b = b; S.trained = tr.length; S.trainedAt = Date.now();
    S.avgWin = +avgWin.toFixed(3); S.avgLoss = +avgLoss.toFixed(3);
    S.metrics = {
      train: trM, val: vaM, baseline: base,
      edge: vaM ? +(vaM.acc - base).toFixed(1) : null,
      overfit: (trM && vaM) ? +(trM.acc - vaM.acc).toFixed(1) : null,
      filtered: { taken, of: va.length, avgR: taken ? +(takenR / taken).toFixed(3) : 0,
                  avgRAll: va.length ? +(allR / va.length).toFixed(3) : 0 },
      calib: this.calibrate(va, w, b),
    };
    S.log.unshift({ t: Date.now(),
      text: 'Trained on ' + tr.length + ' examples, checked against ' + va.length + ' it had never seen: ' +
        (vaM ? vaM.acc.toFixed(1) + '% accurate vs ' + base.toFixed(1) + '% for always guessing the majority' : 'not enough to score') });
    this.save();
    return { ok: true, metrics: S.metrics };
  },

  /* is the predicted probability honest? bucket it and compare with reality */
  calibrate(set, w, b){
    const buckets = [[0, .35], [.35, .45], [.45, .55], [.55, .65], [.65, 1]];
    return buckets.map(([lo, hi]) => {
      const inB = set.filter(s => { const p = this.predictRaw(w, b, s.x); return p >= lo && p < hi; });
      return { lo, hi, n: inB.length, actual: inB.length ? inB.filter(s => s.y === 1).length / inB.length * 100 : null };
    }).filter(x => x.n > 0);
  },

  /* ---------------- is the brain allowed to speak? ---------------- */
  ready(){
    const S = this.state || this.load();
    const m = S.metrics;
    if (!m || !m.val || S.trained < this.MIN_TRAIN) return false;
    if (m.val.n < this.MIN_VAL) return false;
    return m.edge != null && m.edge > 1;         // must beat the majority guess out of sample
  },

  status(){
    const S = this.state || this.load();
    const m = S.metrics;
    if (!S.samples.length) return { cls: 'flat', label: 'NO DATA', text: 'No finished trades yet. Run backtests to teach it quickly.' };
    if (S.samples.length < this.MIN_TRAIN)
      return { cls: 'flat', label: 'LEARNING', text: S.samples.length + ' of ' + this.MIN_TRAIN + ' examples needed before it may train.' };
    if (!m) return { cls: 'flat', label: 'UNTRAINED', text: 'Enough data — press Train.' };
    if (!this.ready())
      return { cls: 'down', label: 'ABSTAINING',
        text: 'Out of sample it is ' + (m.val ? m.val.acc.toFixed(1) + '%' : '—') + ' accurate against a ' +
          m.baseline.toFixed(1) + '% baseline. It has found no reliable edge, so it stands aside and the strategies run unchanged.' };
    return { cls: 'up', label: 'ACTIVE',
      text: 'Out of sample: ' + m.val.acc.toFixed(1) + '% vs ' + m.baseline.toFixed(1) + '% baseline (+' + m.edge + ').' };
  },

  /* ---------------- the gate every entry passes through ---------------- */
  approve(sig, cfg, ctx){
    const S = this.state || this.load();
    if (!this.ready())
      return { take: true, gated: false, why: 'Master Brain is standing aside — strategy rules alone decide' };
    const x = this.vec(this.featurize(sig, cfg, ctx));
    const p = this.predictRaw(S.w, S.b, x);
    const expR = p * (S.avgWin || 1) - (1 - p) * (S.avgLoss || 1);
    const take = expR >= this.MIN_EXP_R;
    if (take) S.approved++; else S.vetoed++;
    return {
      take, gated: true, pWin: p, expR,
      /* it may only ever shrink the position, never enlarge it */
      sizeMult: Math.max(0.4, Math.min(1, 0.4 + p)),
      why: (take ? 'Approved' : 'Vetoed') + ' — estimated ' + Math.round(p * 100) + '% chance of a winner, ' +
        'expectancy ' + expR.toFixed(3) + 'R (needs ' + this.MIN_EXP_R + 'R). ' +
        'Based on ' + S.trained + ' learned examples.',
    };
  },

  /* the model is linear, so the weights ARE the explanation */
  topWeights(n){
    const S = this.state || this.load();
    return this.FEATURES
      .map((f, i) => ({ f, w: S.w[i] }))
      .filter(x => Math.abs(x.w) > 0.01)
      .sort((a, b) => Math.abs(b.w) - Math.abs(a.w))
      .slice(0, n || 10);
  },

  reset(){
    this.state = this.blank();
    this.save();
    return this.state;
  },
};
