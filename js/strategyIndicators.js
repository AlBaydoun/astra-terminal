/* ASTRA Terminal — one indicator per trading bot.
   Every bot in the Bots workspace scores the market on each closed candle. These
   indicators run that exact same scoring code over the chart's history and draw
   the result as a histogram: green where the bot would go long, red where it
   would go short, grey where it looked but stayed out. The dashed line is the
   minimum score the bot needs before it acts.

   Nothing here can place a trade — it is the bot's opinion, drawn. */
const StratInd = {
  cache: {},          // 'id|symbol|tf|params' -> { time -> {dir,score,fire} }
  order: [],

  bucket(key){
    if (!this.cache[key]){
      this.cache[key] = {};
      this.order.push(key);
      while (this.order.length > 10) delete this.cache[this.order.shift()];
    }
    return this.cache[key];
  },

  /* The REAL higher-timeframe candles, fetched once per symbol and kept, so a
     bot's chart indicator confirms against exactly what the bot itself sees.
     Until they arrive the grouped approximation below is used, and the chart
     is redrawn the moment the real ones land. */
  htf: {},
  higherFor(bot, win){
    const tf = bot.defaults.higherTf || '1h';
    const key = STORE.symbol + '|' + tf;
    const rec = this.htf[key];
    /* fetch once, then refresh every few minutes so the newest higher bar is
       not stale — the previous candles stay in use while the refresh runs */
    const stale = !rec || (rec.candles && Date.now() - rec.at > 5 * 60 * 1000);
    if (stale && typeof API !== 'undefined'){
      this.htf[key] = { candles: rec && rec.candles || null, at: Date.now() };
      API.klines(STORE.symbol, tf, 500).then(c => {
        this.htf[key] = { candles: c || [], at: Date.now() };
        /* the cached scores were made with older data — drop them */
        for (const k of Object.keys(this.cache)) if (k.includes('|' + STORE.symbol + '|')) delete this.cache[k];
        if (typeof Chart !== 'undefined' && Chart.main) try { Chart.renderAll(); } catch(e){}
      }).catch(() => { if (!(rec && rec.candles)) delete this.htf[key]; });
    }
    if (rec && rec.candles){
      const end = win[win.length - 1].rawTime;
      /* only what the bot could have known at this candle: the higher bar that
         is still forming at that moment is shown at its open, as the backtest does */
      const rows = rec.candles.filter(h => h.rawTime <= end);
      if (rows.length >= 110)
        return rows.map((h, j) => j === rows.length - 1 ? { ...h, high: h.open, low: h.open, close: h.open, volume: 0 } : h);
    }
    return this.higher(win, 3);
  },

  /* Group the chart's own candles into a coarser series, so a bot that wants a
     higher timeframe for confirmation gets something honest to look at.
     It is built from what is on screen, so it is close to — but not identical
     with — the bot running on real higher-timeframe candles. */
  higher(win, mult){
    const out = [];
    for (let end = win.length; end > 0; end -= mult){
      const start = Math.max(0, end - mult);
      const part = win.slice(start, end);
      out.unshift({
        time: part[0].time, rawTime: part[0].rawTime,
        open: part[0].open, close: part[part.length - 1].close,
        high: Math.max(...part.map(c => c.high)),
        low: Math.min(...part.map(c => c.low)),
        volume: part.reduce((s, c) => s + (c.volume || 0), 0),
      });
    }
    return out;
  },

  /* Evaluate one bot bar by bar. Results are cached per candle, so a live tick
     only ever costs one evaluation instead of a few hundred. */
  run(bot, ctx, cfg){
    const v = ctx.v;
    if (!v || v.length < 40) return [];
    const bars = Math.max(10, Math.min(400, cfg.bars || 120));
    const look = Math.min(460, Math.max(140, (bot.warmup || 80) + 60));
    const min = cfg.minScore != null ? cfg.minScore : (bot.defaults.minScore || 0);
    const key = [bot.id, STORE.symbol, STORE.tf, look, min].join('|');
    const store = this.bucket(key);
    const bcfg = Object.assign({}, bot.defaults, { minScore: min, threshold: min / 100 });
    const out = [];

    for (let i = Math.max(20, v.length - bars); i < v.length; i++){
      const t = v[i].time;
      let r = store[t];
      if (r === undefined){
        const win = v.slice(Math.max(0, i - look), i + 1);
        let sig = null;
        try {
          sig = bot.needsHigher
            ? bot.signal(win, Object.assign({}, bcfg, { higherTf: bot.defaults.higherTf }), null, this.higherFor(bot, win))
            : bot.signal(win, bcfg, null);
        } catch(e){ sig = null; }
        r = store[t] = sig
          ? { dir: sig.dir || sig.near || 0, score: Math.max(0, Math.min(100, +sig.score || 0)), fire: !!sig.dir,
              entry: sig.dir ? sig.entry : null, sl: sig.dir ? sig.sl : null, tp: sig.dir ? sig.tp : null,
              mult: sig.dir && sig.riskMult > 1 ? +sig.riskMult.toFixed(2) : null,
              votes: sig.dir && sig.meta && sig.meta.votes != null ? sig.meta.votes : null,
              why: sig.dir ? (sig.reasons || []).slice(0, 3).join(' · ') : (sig.failed && sig.failed[0]) || '' }
          : null;
      }
      if (r) out.push(Object.assign({ time: t }, r));
    }
    return out;
  },

  /* ---- BUY / SELL arrows on the price chart ----
     For the bots you watch most (Triple Confirmation, Max Assurance) there is a
     second indicator that lives ON the candles: an arrow on every candle the bot
     would have acted on, and the stop and target of its latest call drawn as
     lines from that candle to now. Same scoring code, same cache — a marker is
     never something the bot itself would not have taken. */
  SIGNAL_BOTS: ['triple', 'conviction'],
  signalRows(botId, cfg){
    const bot = BOT_BY_ID[botId];
    if (!bot || typeof Chart === 'undefined') return [];
    const ctx = { v: Chart.view() };
    const min = cfg.minScore != null ? cfg.minScore : (bot.defaults.minScore || 0);
    return this.run(bot, ctx, Object.assign({}, cfg, { minScore: min })).filter(r => r.fire && r.score >= min);
  },
  /* chart.js asks for these when it lays out the pattern markers */
  markers(v){
    const out = [];
    if (typeof Chart === 'undefined' || !Chart.settings) return out;
    for (const botId of this.SIGNAL_BOTS){
      const id = 'sig_' + botId, cfg = Chart.settings[id];
      if (!cfg || !cfg.on) continue;
      const bot = BOT_BY_ID[botId];
      const tag = cfg.tag || (bot ? bot.name.split(' ')[0].replace(/[^A-Za-z]/g, '').toUpperCase() : botId.toUpperCase());
      const col = cfg.colors || {};
      const buy = col.long || '#2ebd85', sell = col.short || '#f6465d';
      for (const r of this.signalRows(botId, cfg)){
        const up = r.dir > 0;
        out.push({ time: r.time, position: up ? 'belowBar' : 'aboveBar', color: up ? buy : sell,
          shape: up ? 'arrowUp' : 'arrowDown',
          text: tag + ' ' + (up ? 'BUY' : 'SELL') + ' ' + Math.round(r.score) + (r.mult ? ' ×' + r.mult : '') });
      }
    }
    return out;
  },
  latest(botId, cfg){
    const rows = this.signalRows(botId, cfg);
    return rows.length ? rows[rows.length - 1] : null;
  },
};

/* the on-chart signal indicators, one per watched bot */
const SigIndReg = {
  add(botId){
    const bot = BOT_BY_ID[botId];
    if (!bot) return null;
    const id = 'sig_' + botId;
    if (IND_BY_ID[id]) return IND_BY_ID[id];
    const short = bot.name.replace(/\s*\(.*\)\s*$/, '');
    const def = {
      id, label: short + ' · BUY / SELL', kind: 'price', mainOnly: true, cat: 'bots',
      def: { on: false, target: 'main', bars: 300, minScore: bot.defaults.minScore || 0, tag: short.split(' ')[0].toUpperCase() },
      params: [
        { k: 'bars', kind: 'num', label: 'Candles to scan', min: 20, max: 400, step: 10 },
        { k: 'minScore', kind: 'num', label: 'Minimum to signal', min: 0, max: 100, step: 1 },
        { k: 'tag', kind: 'text', label: 'Arrow label', placeholder: short.split(' ')[0].toUpperCase() },
      ],
      parts: [
        { key: 'long',  label: 'Buy arrows',  color: '#2ebd85', noHide: true },
        { key: 'short', label: 'Sell arrows', color: '#f6465d', noHide: true },
        { key: 'sl',    label: 'Latest stop',   color: '#ff8799' },
        { key: 'tp',    label: 'Latest target', color: '#50edbc' },
        { key: 'entry', label: 'Latest entry',  color: '#8fa3c8' },
      ],
      note: bot.blurb + '  Arrows sit on the candle the bot would have acted on (closed candles only), with its score and, for Max Assurance, the size multiplier it earned. The dotted lines are the stop, target and entry of its most recent call, drawn from that candle to now. Display only — the paper bot decides its own trades.',
      build(ctx, cfg){
        const r = StratInd.latest(botId, cfg);
        if (!r || !ctx.v.length) return [];
        const last = ctx.v[ctx.v.length - 1].time;
        const line = (key, val, style) => (val > 0 ? { key, type: 'line', lineStyle: style, width: 1,
          data: [{ time: r.time, value: val }, { time: last, value: val }] } : null);
        return [line('sl', r.sl, 2), line('tp', r.tp, 2), line('entry', r.entry, 3)].filter(Boolean);
      },
    };
    INDS.push(def);
    IND_BY_ID[id] = def;
    if (typeof Chart !== 'undefined' && Chart.settings){
      const saved = (typeof lsGet === 'function') ? lsGet('astra_ind', {}) : {};
      Chart.settings[id] = Object.assign({}, def.def, saved[id] || {});
    }
    return def;
  },
};

/* One catalogue entry per bot that actually produces a signal.
   The Master Brain and the Manual bot have no signal of their own — the Brain
   judges other bots' trades, the Manual bot does what you tell it.

   The registry is open at runtime, so a bot the Strategy Lab invents gets its
   own indicator the moment it is published. */
const StratIndReg = {
  add(bot){
    /* signal.length is the arity — the Brain and the Manual bot declare none */
    if (!bot || bot.brain || bot.manual || !bot.signal || bot.signal.length === 0) return null;
    const id = 'bot_' + bot.id;
    if (IND_BY_ID[id]) return IND_BY_ID[id];

    const def = {
      id,
      label: bot.name.replace('★ ', '') + ' (bot)',
      kind: 'osc',
      def: { on: false, target: 'p1', bars: 120, minScore: bot.defaults.minScore || 0 },
      params: [
        { k: 'bars', kind: 'num', label: 'Candles to score', min: 10, max: 400, step: 10 },
        { k: 'minScore', kind: 'num', label: 'Minimum to trade', min: 0, max: 100, step: 1 },
      ],
      /* one bar per candle, coloured by what the bot would have done — so the
         legend reads "score, minimum" instead of four half-empty numbers */
      parts: [
        { key: 'score', label: 'Signal strength',   color: '#4a5a7c' },
        { key: 'min',   label: 'Minimum to trade',  color: '#8fa3c8' },
        { key: 'long',  label: 'Colour when buying',  color: '#2ebd85', noHide: true },
        { key: 'short', label: 'Colour when selling', color: '#f6465d', noHide: true },
      ],
      note: bot.blurb + '  The bar is how strongly this bot rates the candle; it is coloured only where the bot would actually have acted.'
        + (bot.needsHigher ? '  The higher timeframe is grouped from the chart’s own candles, so it is close to but not identical with the live bot.' : '')
        + (bot.id === 'jdub' ? '  It only scores inside the New York 09:30–11:00 window on a 1-minute chart.' : ''),
      build(ctx, cfg){
        const rows = StratInd.run(bot, ctx, cfg);
        if (!rows.length) return [];
        const min = cfg.minScore != null ? cfg.minScore : 0;
        const col = cfg.colors || {};
        const idle = col.score || '#4a5a7c';
        const buy = col.long || '#2ebd85', sell = col.short || '#f6465d';
        return [
          { key: 'score', type: 'hist', data: rows.map(r => ({
              time: r.time, value: r.score,
              color: !(r.fire && r.score >= min) ? idle : (r.dir > 0 ? buy : sell) })) },
          { key: 'min', type: 'line', lineStyle: 2, width: 1,
            data: rows.map(r => ({ time: r.time, value: min })) },
        ];
      },
    };

    INDS.push(def);
    IND_BY_ID[def.id] = def;
    if (typeof Chart !== 'undefined' && Chart.settings){
      const saved = (typeof lsGet === 'function') ? lsGet('astra_ind', {}) : {};
      Chart.settings[def.id] = Object.assign({}, def.def, saved[def.id] || {});
    }
    return def;
  },

  /* a retired lab bot takes its indicator with it */
  remove(botId){
    const id = 'bot_' + botId;
    const i = INDS.findIndex(d => d.id === id);
    if (i >= 0) INDS.splice(i, 1);
    delete IND_BY_ID[id];
    if (typeof Chart !== 'undefined' && Chart.settings){
      delete Chart.settings[id];
      if (Chart.main) try { Chart.renderAll(); } catch(e){}
    }
  },
};

if (typeof BOTS !== 'undefined') for (const bot of BOTS) StratIndReg.add(bot);
for (const id of StratInd.SIGNAL_BOTS) SigIndReg.add(id);
