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
            ? bot.signal(win, Object.assign({}, bcfg, { higherTf: bot.defaults.higherTf }), null, this.higher(win, 3))
            : bot.signal(win, bcfg, null);
        } catch(e){ sig = null; }
        r = store[t] = sig
          ? { dir: sig.dir || sig.near || 0, score: Math.max(0, Math.min(100, +sig.score || 0)), fire: !!sig.dir }
          : null;
      }
      if (r) out.push({ time: t, dir: r.dir, score: r.score, fire: r.fire });
    }
    return out;
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
