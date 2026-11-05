/* ASTRA Terminal — three regime-gated bots.

   The design question is not "which indicator", it is "when is this kind of
   rule allowed to speak". A trend rule and a fade rule want opposite markets,
   and most of what retail strategies lose is spread paid running a trend rule
   through a range. So all three of these are built on the same regime measure
   — Kaufman's Efficiency Ratio, how much of the path walked was actual
   progress — and each one is only permitted in the regime it suits:

     Squeeze release   range has compressed, then let go. Needs efficiency to
                       be RISING, so a release that immediately dies is skipped.
     Vortex trend      VI+/VI- cross with efficiency ABOVE 0.35 and price the
                       right side of KAMA. Trend rule, trending market only.
     Range fade        efficiency BELOW 0.20 over 50 candles — an explicitly
                       market, measured over 50 candles — fading a Bollinger
                       extreme back to the middle.

   Honest statement of what this is and is not. These are coherent, costed,
   non-repainting implementations of published ideas. They are NOT known to be
   profitable, here or anywhere: the regime gate is a well-evidenced way to
   stop a rule trading in conditions that historically ruin it, which is not
   the same as an edge. Every one starts on paper like every other ASTRA bot,
   and the readiness bar in BotReports.READY plus the bootstrap in the
   JUSTMARKETS portal are what decide whether any of them earns real money.
   Expect most strategies to fail that bar. That is the bar working.

   No repainting: signal() drops the forming candle before it reads anything,
   and every value at candle i uses candles up to i only. Stops and targets are
   in ATR, so they scale with the instrument; the engine applies your real
   spread from the MT5 bridge on top.

   Registered like js/bots/us-stocks.js: the rules are also Strategy Checker
   events (family "regime"), so they are measured against a random entry
   instead of being taken on trust. */

const JMBots = {

  /* ---------- extra series the Checker does not prepare ---------- */
  prepare(A){
    if (A.jmReady) return A;
    const c = A.c, close = A.close;
    A.er = JMIND.efficiency(close, 20);
    A.erPrev = A.er.map((v, i) => i > 0 ? A.er[i - 1] : null);
    /* A SECOND, LONGER horizon, and the fade rule needs it rather than the
       20-bar one. A push to the band edge is itself a directional move, so over
       20 candles it reads as efficient — the short gate and the entry condition
       contradict each other and the rule can essentially never fire (measured:
       0 setups in 740 candles of a textbook range). Over 50 candles the same
       push sits inside a market that has gone nowhere, which is the thing the
       gate was always meant to ask. Measured on generated markets: open on 0%
       of trending bars, 21% of drifting, 82% of random, 99% of ranging. */
    A.erLong = JMIND.efficiency(close, 50);
    A.kama = JMIND.kama(close, 10, 2, 30);
    const v = JMIND.vortex(c, 14);
    A.viUp = v.up; A.viDn = v.down;
    const q = JMIND.squeeze(c, 20, 2, 1.5);
    A.sqOn = q.on; A.sqMom = q.mom;
    A.atr14 = IND.atr(c, 14);
    A.jmReady = true;
    return A;
  },

  /* was the squeeze on for at least n candles ending at j-1, and off at j */
  released(A, j, n){
    if (A.sqOn[j] !== 0) return false;
    for (let k = j - n; k < j; k++) if (!(A.sqOn[k] === 1)) return false;
    return true;
  },

  /* ---------- the rules, as Checker events ---------- */
  EVENTS: [
    ['jmSqueezeUp', 'Regime · squeeze releases upward with efficiency rising', 'regime', 1,
      (A, j) => { JMBots.prepare(A); return JMBots.released(A, j, 6) && A.sqMom[j] > 0
        && A.er[j] != null && A.erPrev[j] != null && A.er[j] > A.erPrev[j] && A.er[j] > 0.15; }],
    ['jmSqueezeDown', 'Regime · squeeze releases downward with efficiency rising', 'regime', -1,
      (A, j) => { JMBots.prepare(A); return JMBots.released(A, j, 6) && A.sqMom[j] < 0
        && A.er[j] != null && A.erPrev[j] != null && A.er[j] > A.erPrev[j] && A.er[j] > 0.15; }],

    ['jmVortexUp', 'Regime · VI+ crosses above VI− in an efficient up-trend', 'regime', 1,
      (A, j) => { JMBots.prepare(A); return A.viUp[j] != null && A.viUp[j - 1] != null
        && A.viUp[j] > A.viDn[j] && A.viUp[j - 1] <= A.viDn[j - 1]
        && A.er[j] > 0.35 && A.kama[j] != null && A.c[j].close > A.kama[j]; }],
    ['jmVortexDown', 'Regime · VI− crosses above VI+ in an efficient down-trend', 'regime', -1,
      (A, j) => { JMBots.prepare(A); return A.viDn[j] != null && A.viDn[j - 1] != null
        && A.viDn[j] > A.viUp[j] && A.viDn[j - 1] <= A.viUp[j - 1]
        && A.er[j] > 0.35 && A.kama[j] != null && A.c[j].close < A.kama[j]; }],

    ['jmFadeUp', 'Regime · buy a Bollinger low in a directionless market', 'regime', 1,
      (A, j) => { JMBots.prepare(A); return A.erLong[j] != null && A.erLong[j] < 0.20
        && A.bb.lo[j] != null && A.c[j].close <= A.bb.lo[j] && A.rsi[j] != null && A.rsi[j] < 30; }],
    ['jmFadeDown', 'Regime · sell a Bollinger high in a directionless market', 'regime', -1,
      (A, j) => { JMBots.prepare(A); return A.erLong[j] != null && A.erLong[j] < 0.20
        && A.bb.up[j] != null && A.c[j].close >= A.bb.up[j] && A.rsi[j] != null && A.rsi[j] > 70; }],
  ],

  /* ---------- the bots ---------- */
  DEFS: [
    { id: 'jm_squeeze', name: 'Regime · Squeeze release', ev: ['jmSqueezeUp', 'jmSqueezeDown'],
      tf: '15m', stop: 1.2, tp: 2.0, bars: 40, kind: 'volatility breakout',
      src: 'John Bollinger’s bands inside Keltner’s channels (the "squeeze", popularised by John Carter); regime gate from Perry Kaufman’s Efficiency Ratio',
      how: 'The squeeze has to have been ON for at least six candles — the Bollinger Bands entirely inside the Keltner Channels — and then let go on this candle. The direction is the sign of the momentum slope, and the Efficiency Ratio must be rising, which skips the releases that die immediately.' },

    { id: 'jm_vortex', name: 'Regime · Vortex trend', ev: ['jmVortexUp', 'jmVortexDown'],
      tf: '1h', stop: 1.5, tp: 2.5, bars: 48, kind: 'trend following',
      src: 'Botes & Siepman, Technical Analysis of Stocks & Commodities (January 2010); Kaufman Adaptive Moving Average (1995)',
      how: 'VI+ crossing above VI− is taken only when the Efficiency Ratio is above 0.35 — a market genuinely going somewhere — and price is on the correct side of its KAMA. Both gates have to agree, which is most of the point: the cross on its own fires constantly in a range.' },

    { id: 'jm_fade', name: 'Regime · Range fade', ev: ['jmFadeUp', 'jmFadeDown'],
      tf: '15m', stop: 1.2, tp: 'mid', bars: 32, kind: 'mean reversion',
      src: 'Bollinger band reversion, restricted to low-efficiency regimes (Kaufman)',
      how: 'Only when the Efficiency Ratio measured over 50 candles is under 0.20, meaning the market is demonstrably going nowhere. The horizon matters: over 20 candles a push to the band is itself efficient, and the gate would contradict the entry. A close at or beyond the Bollinger band with RSI past 30/70 is faded, with the band’s middle as the target. In any trending market this rule is switched off by the gate.' },
  ],

  toBot(d){
    const byId = id => (this.EVENTS.find(e => e[0] === id));
    return {
      id: d.id, name: d.name, research: true, regimeBot: true,
      blurb: d.how + ' Source: ' + d.src + '. Stop ' + d.stop + '× ATR, target ' +
        (d.tp === 'mid' ? 'the Bollinger middle' : d.tp + '× ATR') + ', ends after ' + d.bars +
        ' candles. Paper until you arm it, and not known to be profitable — let the readiness bar decide.',
      defaults: { tf: d.tf, tfAuto: false, minScore: 0, maxOpen: 3,
                  groups: ['crypto', 'forex', 'gold', 'indices', 'energy'], timeLimitBars: d.bars },
      warmup: 160,
      guide: { icon: '◎', tagline: d.name.replace('Regime · ', '') + ' — a ' + d.kind + ' rule that only speaks in the regime it suits.',
        tags: ['regime-gated', d.kind, d.tf], steps: [
          ['📖', 'Where it comes from', d.src],
          ['📐', 'The rule', d.how],
          ['◎', 'Why a regime gate', 'A trend rule and a fade rule want opposite markets. Running either in the wrong one pays spread to be chopped up, and that is where most of the loss in simple strategies comes from. The Efficiency Ratio — net distance divided by the path actually walked — decides which market this is, and the bot stays quiet when the answer is the wrong one.'],
          ['🎯', 'Stop and target', 'Stop ' + d.stop + '× the average candle range (ATR 14), target ' + (d.tp === 'mid' ? 'the middle Bollinger band' : d.tp + '× ATR') + '. Both scale with the instrument, and your real spread from the MT5 bridge is charged on top.'],
          ['🔬', 'Measured, not asserted', 'Its rules are also Strategy Checker events in the family “regime”, so they are measured against a random entry. The JUSTMARKETS portal then bootstraps its finished trades to say whether the record could be luck.']],
        settings: [],
        use: ['It avoids shares by default: these are 24-hour rules and a share trades one session a day.',
              'Expect long quiet stretches. A gate that never refuses anything is not a gate.'],
        honest: 'No published backtest of these combinations is being claimed, and none of the three is known to make money. The regime gate is a well-evidenced way to stop a rule trading where it historically loses — that is a filter, not an edge. Most strategies fail the readiness bar; that is the bar doing its job.' },

      signal: (w, cfg) => {
        const c = w.slice(0, -1);                        /* the forming candle is not read */
        if (c.length < 140) return { dir: 0, failed: ['warming up'] };
        let A;
        try { A = JMBots.prepare(Checker.prepare(c.slice(-400))); }
        catch(e){ return { dir: 0, failed: ['could not prepare the series'] }; }
        const j = A.c.length - 1, atr = A.atr14[j];
        if (!(atr > 0)) return { dir: 0, failed: ['ATR not ready'] };
        if (A.er[j] == null) return { dir: 0, failed: ['Efficiency Ratio not ready'] };

        for (const id of d.ev){
          const ev = byId(id); if (!ev) continue;
          let on = false;
          try { on = ev[4](A, j); } catch(e){ on = false; }
          if (!on) continue;
          const dir = ev[3], px = A.c[j].close;
          const sl = px - dir * d.stop * atr;
          let tp = d.tp === 'mid' ? A.bb.mid[j] : px + dir * d.tp * atr;
          /* never a target the spread eats, and never one on the wrong side */
          if (!(tp > 0) || (tp - px) * dir < 0.8 * atr) tp = px + dir * 0.8 * atr;
          return { dir, score: 72, entry: px, sl, tp, model: ev[1],
                   reasons: [ev[1], 'Efficiency Ratio ' + A.er[j].toFixed(2), d.kind] };
        }
        const why = d.id === 'jm_fade'
          ? 'No fade setup (needs the 50-candle Efficiency Ratio under 0.20 — it is ' + (A.erLong[j] == null ? '—' : A.erLong[j].toFixed(2)) + ')'
          : d.id === 'jm_vortex'
            ? 'No trend setup (needs Efficiency Ratio over 0.35 — it is ' + A.er[j].toFixed(2) + ')'
            : 'No squeeze release on the last closed candle';
        return { dir: 0, failed: [why] };
      },
    };
  },

  install(){
    if (typeof BOTS === 'undefined' || typeof Checker === 'undefined' || typeof JMIND === 'undefined') return;
    try {
      const build = Checker.buildEvents.bind(Checker);
      Checker.buildEvents = () => {
        const E = build();
        for (const [id, label, family, dir, fn] of JMBots.EVENTS)
          if (!E.some(e => e.id === id)) E.push({ id, label, family, dir, fn });
        return E;
      };
      Checker.EVENTS = null; Checker.buildEvents();
    } catch(e){ console.warn('ASTRA regime bots — checker events:', e.message); }

    for (const d of this.DEFS){
      if (BOT_BY_ID[d.id]) continue;
      const bot = this.toBot(d);
      BOTS.push(bot); BOT_BY_ID[bot.id] = bot;
    }
  },
};
JMBots.install();
