/* ASTRA Terminal — strategy engines.
   Every engine is a pure function of CLOSED candles: (candles, cfg) -> decision.
   Nothing here repaints: the newest candle is only used once it has closed, and
   each engine returns the exact gates it passed and the exact gate that stopped
   it, so a WAIT is always explainable.

   decision = { dir: 1|-1|0, score, entry, sl, tp, tp1, model, reasons[], failed[], factors{} } */
const STRAT = {

  /* ================= shared helpers ================= */
  closed(candles, allowLast){
    /* the last candle of a live series is still forming — drop it by default */
    return allowLast ? candles : candles.slice(0, -1);
  },
  slope(arr, i, back){
    if (i - back < 0 || arr[i] == null || arr[i - back] == null) return 0;
    return (arr[i] - arr[i - back]) / Math.abs(arr[i - back] || 1);
  },
  recentHigh(c, i, n){ let h = -Infinity; for (let j = Math.max(0, i - n); j < i; j++) h = Math.max(h, c[j].high); return h; },
  recentLow(c, i, n){ let l = Infinity; for (let j = Math.max(0, i - n); j < i; j++) l = Math.min(l, c[j].low); return l; },
  avgVol(c, i, n){ let s = 0, k = 0; for (let j = Math.max(0, i - n); j < i; j++){ s += c[j].volume || 0; k++; } return k ? s / k : 0; },
  body(c){ return Math.abs(c.close - c.open); },
  range(c){ return (c.high - c.low) || 1e-12; },
  bull(c){ return c.close > c.open; },
  bear(c){ return c.close < c.open; },
  wait(failed, extra){ return Object.assign({ dir: 0, score: 0, reasons: [], failed: failed || [] }, extra || {}); },

  /* MACD whose signal line is an SMA(9), as in the CM MTF MACD script */
  macdSma(src, f, s, sig){
    const ef = IND.ema(src, f), es = IND.ema(src, s);
    const macd = src.map((_, i) => (ef[i] == null || es[i] == null) ? null : ef[i] - es[i]);
    const signal = IND.smaOver ? IND.smaOver(macd, sig) : IND.smaOver_(macd, sig);
    const hist = macd.map((m, i) => (m == null || signal[i] == null) ? null : m - signal[i]);
    return { macd, signal, hist };
  },
  histState(hist, i){
    const h = hist[i], p = hist[i - 1];
    if (h == null) return { name: 'yellow', text: 'histogram undefined' };
    if (p == null || h === p) return { name: 'yellow', text: 'histogram unchanged' };
    if (h > 0) return h > p ? { name: 'aqua', text: 'histogram rising above zero' } : { name: 'blue', text: 'histogram falling but still above zero' };
    return h < p ? { name: 'red', text: 'histogram falling at or below zero' } : { name: 'maroon', text: 'histogram rising but still below zero' };
  },

  /* ================= 1. Regime-Aligned Pullback =================
     Used by the Market Scanner and, through it, by RigorGate. */
  WEIGHTS: { trend: 28, pullback: 18, breakout: 22, momentum: 12, direction: 12, volume: 5, volatility: 3 },

  regimePullback(candles, cfg){
    cfg = cfg || {};
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 80) return this.wait(['Not enough candles (need 80, have ' + c.length + ')']);
    const i = c.length - 1;
    const close = c.map(x => x.close);
    const e20 = IND.ema(close, 20), e50 = IND.ema(close, 50);
    const rsi = IND.rsi(close, 14), atr = IND.atr(c, 14), adx = IND.adx(c, 14);
    if (e50[i] == null || atr[i] == null || adx.adx[i] == null)
      return this.wait(['Indicators still warming up']);

    const px = c[i].close, A = atr[i];
    const atrPct = A / px * 100;
    const volAvg = this.avgVol(c, i, 20);
    const volOk = volAvg <= 0 || (c[i].volume || 0) >= 0.70 * volAvg;
    const volRatio = volAvg > 0 ? (c[i].volume || 0) / volAvg : 1;

    const build = (dir) => {
      const up = dir > 0;
      const reasons = [], failed = [], factors = {};
      let score = 0;

      /* --- trend regime (28) --- */
      const stack = up ? e20[i] > e50[i] : e20[i] < e50[i];
      const e20Slope = this.slope(e20, i, 3), e50Slope = this.slope(e50, i, 5);
      const fastOk = up ? e20Slope > 0 : e20Slope < 0;
      const slowOk = up ? e50Slope >= -1e-6 : e50Slope <= 1e-6;
      if (stack && fastOk && slowOk){
        score += this.WEIGHTS.trend; factors.trend = true;
        reasons.push('EMA20 is ' + (up ? 'above' : 'below') + ' EMA50 and sloping ' + (up ? 'up' : 'down'));
      } else {
        if (!stack) failed.push('EMA20 is not ' + (up ? 'above' : 'below') + ' EMA50');
        else if (!fastOk) failed.push('EMA20 is not sloping ' + (up ? 'up' : 'down'));
        else failed.push('EMA50 is sloping against the trade');
      }

      /* --- pullback into the fast average (18) --- */
      let pulled = false;
      for (let j = i - 4; j < i; j++){
        if (j < 1 || e20[j] == null) continue;
        const near = up ? (c[j].low - e20[j]) <= 0.75 * A : (e20[j] - c[j].high) <= 0.75 * A;
        const back = up ? c[j].close > e20[j] : c[j].close < e20[j];
        if (near && back){ pulled = true; break; }
      }
      if (pulled){
        score += this.WEIGHTS.pullback; factors.pullback = true;
        reasons.push('Price pulled back to within 0.75 ATR of EMA20 and closed back ' + (up ? 'above' : 'below') + ' it');
      } else failed.push('No recent pullback to EMA20 within the last 4 candles');

      /* --- breakout of the recent structure (22) --- */
      const level = up ? this.recentHigh(c, i, 10) : this.recentLow(c, i, 10);
      const broke = up ? (c[i].close > level && c[i].close > e20[i]) : (c[i].close < level && c[i].close < e20[i]);
      if (broke){
        score += this.WEIGHTS.breakout; factors.breakout = true;
        reasons.push('Latest closed candle broke the 10-candle ' + (up ? 'high' : 'low') + ' at ' + fmtPrice(level) + ' and closed ' + (up ? 'above' : 'below') + ' EMA20');
      } else failed.push('Latest candle did not break the recent ' + (up ? 'high' : 'low'));

      /* --- momentum band (12) --- */
      const r = rsi[i];
      const rsiOk = up ? (r >= 52 && r <= 68) : (r >= 32 && r <= 48);
      if (rsiOk){
        score += this.WEIGHTS.momentum; factors.momentum = true;
        reasons.push('RSI ' + r.toFixed(1) + ' sits in the ' + (up ? '52–68' : '32–48') + ' continuation band');
      } else failed.push('RSI ' + (r == null ? '—' : r.toFixed(1)) + ' is outside the ' + (up ? '52–68' : '32–48') + ' band');

      /* --- directional strength (12) --- */
      const diOk = up ? adx.pdi[i] > adx.mdi[i] : adx.mdi[i] > adx.pdi[i];
      const adxOk = adx.adx[i] >= 20;
      if (diOk && adxOk){
        score += this.WEIGHTS.direction; factors.direction = true;
        reasons.push('ADX ' + adx.adx[i].toFixed(1) + ' with ' + (up ? '+DI above −DI' : '−DI above +DI'));
      } else failed.push(!adxOk ? 'ADX ' + adx.adx[i].toFixed(1) + ' is below 20 (no real trend)' : 'Directional index favours the other side');

      /* --- participation (5) --- */
      if (volOk){ score += this.WEIGHTS.volume; factors.volume = true;
        reasons.push('Volume ' + volRatio.toFixed(2) + '× the 20-candle average'); }
      else failed.push('Volume only ' + volRatio.toFixed(2) + '× average (needs 0.70×)');

      /* --- volatility sanity (3) --- */
      if (atrPct > 0 && atrPct <= 1.5){ score += this.WEIGHTS.volatility; factors.volatility = true;
        reasons.push('ATR is ' + atrPct.toFixed(2) + '% of price — tradable volatility'); }
      else failed.push('ATR is ' + atrPct.toFixed(2) + '% of price (needs 0–1.5%)');

      /* geometry knobs — these defaults are the original behaviour, and the
         Strategy Lab varies them to build new bots */
      const stopAtr = cfg.stopAtr != null ? cfg.stopAtr : 1.2;
      const rr = cfg.rr != null ? cfg.rr : 1.5;
      const stopDist = Math.max(stopAtr * A, px * 0.0015);
      return {
        dir, score, reasons, failed, factors,
        entry: px,
        sl: up ? px - stopDist : px + stopDist,
        tp: up ? px + rr * stopDist : px - rr * stopDist,
        model: 'Regime-Aligned Pullback',
        meta: { atrPct: +atrPct.toFixed(3), adx: +adx.adx[i].toFixed(1), rsi: +r.toFixed(1), volRatio: +volRatio.toFixed(2) },
      };
    };

    const long = build(1), short = build(-1);
    const best = long.score >= short.score ? long : short;
    const threshold = (cfg.threshold != null ? cfg.threshold : 0.92) * 100;
    if (best.score < threshold){
      return this.wait(best.failed, {
        score: best.score, near: best.dir, reasons: best.reasons, meta: best.meta,
        model: 'Regime-Aligned Pullback',
        note: 'Scored ' + best.score.toFixed(0) + '/100, needs ' + threshold.toFixed(0),
      });
    }
    return best;
  },

  /* ================= 2. Candlestick patterns ================= */
  PATTERN_STRENGTH: { engulfBull: 74, engulfBear: 74, morningStar: 78, eveningStar: 78, threeSoldiers: 76, threeCrows: 76, doji: 0 },

  detectPattern(c, i){
    const a = c[i], p = c[i - 1], p2 = c[i - 2];
    if (!p) return null;
    const bodyA = this.body(a), bodyP = this.body(p);

    if (bodyA <= 0.10 * this.range(a))
      return { key: 'doji', dir: 0, name: 'Doji', text: 'Body is under 10% of the range — indecision, not an entry' };

    if (this.bear(p) && this.bull(a) && a.open <= p.close && a.close >= p.open && bodyA > bodyP)
      return { key: 'engulfBull', dir: 1, name: 'Bullish Engulfing', text: 'Bullish candle fully engulfs the previous bearish body' };

    if (this.bull(p) && this.bear(a) && a.open >= p.close && a.close <= p.open && bodyA > bodyP)
      return { key: 'engulfBear', dir: -1, name: 'Bearish Engulfing', text: 'Bearish candle fully engulfs the previous bullish body' };

    if (p2){
      const body2 = this.body(p2);
      if (this.bear(p2) && body2 >= 0.5 * this.range(p2) && bodyP <= 0.45 * body2 &&
          this.bull(a) && a.close >= (p2.open + p2.close) / 2)
        return { key: 'morningStar', dir: 1, name: 'Morning Star', text: 'Strong down candle, small pause, then a close back above its midpoint' };

      if (this.bull(p2) && body2 >= 0.5 * this.range(p2) && bodyP <= 0.45 * body2 &&
          this.bear(a) && a.close <= (p2.open + p2.close) / 2)
        return { key: 'eveningStar', dir: -1, name: 'Evening Star', text: 'Strong up candle, small pause, then a close back below its midpoint' };

      const strong = x => this.body(x) >= 0.45 * this.range(x);
      if (this.bull(p2) && this.bull(p) && this.bull(a) && strong(p2) && strong(p) && strong(a) &&
          p.close > p2.close && a.close > p.close &&
          p.open > Math.min(p2.open, p2.close) && p.open < Math.max(p2.open, p2.close) &&
          a.open > Math.min(p.open, p.close) && a.open < Math.max(p.open, p.close))
        return { key: 'threeSoldiers', dir: 1, name: 'Three White Soldiers', text: 'Three strong rising candles, each opening inside the last body' };

      if (this.bear(p2) && this.bear(p) && this.bear(a) && strong(p2) && strong(p) && strong(a) &&
          p.close < p2.close && a.close < p.close &&
          p.open > Math.min(p2.open, p2.close) && p.open < Math.max(p2.open, p2.close) &&
          a.open > Math.min(p.open, p.close) && a.open < Math.max(p.open, p.close))
        return { key: 'threeCrows', dir: -1, name: 'Three Black Crows', text: 'Three strong falling candles, each opening inside the last body' };
    }
    return null;
  },

  candlestick(candles, cfg){
    cfg = cfg || {};
    const only = cfg.only || null;                       // 'engulfBull' | 'engulfBear' | null
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 60) return this.wait(['Not enough candles']);
    const i = c.length - 1;
    const pat = this.detectPattern(c, i);
    if (!pat) return this.wait(['No recognised formation on the last closed candle']);
    if (pat.dir === 0) return this.wait([pat.name + ' — ' + pat.text], { model: pat.name });
    if (only && pat.key !== only)
      return this.wait([pat.name + ' found, but this bot only trades ' +
        (only === 'engulfBull' ? 'Bullish Engulfing' : 'Bearish Engulfing')], { model: pat.name });

    const close = c.map(x => x.close);
    const e20 = IND.ema(close, 20), e50 = IND.ema(close, 50), atr = IND.atr(c, 14);
    if (atr[i] == null || e50[i] == null) return this.wait(['Indicators still warming up']);

    const A = atr[i], a = c[i], p = c[i - 1];
    const reasons = [pat.name + ' — ' + pat.text], failed = [], factors = {};
    factors['pattern:' + pat.key] = true;

    let score = this.PATTERN_STRENGTH[pat.key];
    const trendUp = e20[i] > e50[i];
    const agrees = (pat.dir > 0 && trendUp) || (pat.dir < 0 && !trendUp);
    const bonus = cfg.trendBonus != null ? cfg.trendBonus : 10;
    if (agrees){ score += bonus; factors.trendAgrees = true;
      reasons.push('Direction agrees with the EMA20/EMA50 trend (+' + bonus + ')'); }
    else if (cfg.trendOnly){
      return this.wait([pat.name + ' fights the EMA20/EMA50 trend, and this bot only trades with it'], { score, model: pat.name });
    }
    else { score -= Math.round(bonus * 0.6); reasons.push('Direction fights the EMA20/EMA50 trend (−' + Math.round(bonus * 0.6) + ')'); }

    const bodyStrength = Math.min(1, this.body(a) / this.range(a));
    const bodyPts = +(bodyStrength * 7).toFixed(1);
    score += bodyPts; factors.strongBody = bodyStrength > 0.55;
    reasons.push('Body fills ' + Math.round(bodyStrength * 100) + '% of the candle (+' + bodyPts + ')');

    const spread = cfg.spread != null ? cfg.spread : a.close * 0.0002;
    const spreadPct = spread / a.close * 100;
    const penalty = Math.min(12, spreadPct * 60);
    score -= penalty;
    if (penalty > 0.5) reasons.push('Spread penalty −' + penalty.toFixed(1) + ' (' + spreadPct.toFixed(3) + '%)');

    const atrPct = A / a.close * 100;
    const atrMax = cfg.atrMax != null ? cfg.atrMax : 2.5;
    if (!(atrPct > 0 && atrPct <= atrMax)) failed.push('ATR ' + atrPct.toFixed(2) + '% is outside the tradable band (max ' + atrMax + '%)');

    const min = cfg.minScore != null ? cfg.minScore : 60;
    if (failed.length) return this.wait(failed, { score, model: pat.name });
    if (score < min)
      return this.wait(['Scored ' + score.toFixed(0) + ', below the minimum of ' + min], { score, model: pat.name, reasons });

    const px = a.close;
    const pad = cfg.stopPad != null ? cfg.stopPad : 0.15;
    const rr = cfg.rr != null ? cfg.rr : 1.35;
    const sl = pat.dir > 0
      ? Math.min(a.low, p.low) - pad * A
      : Math.max(a.high, p.high) + pad * A;
    const stopDist = Math.abs(px - sl);
    return {
      dir: pat.dir, score: Math.round(score), entry: px, sl,
      tp: pat.dir > 0 ? px + rr * stopDist : px - rr * stopDist,
      model: pat.name, reasons, failed: [], factors,
      meta: { atrPct: +atrPct.toFixed(3), bodyPct: Math.round(bodyStrength * 100) },
    };
  },

  /* ================= 3. Jdub Traders — New York opening range ================= */
  jdub(candles, cfg){
    cfg = cfg || {};
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 120) return this.wait(['Not enough 1-minute candles for a session']);

    /* New York wall-clock parts for a UTC timestamp */
    const nyParts = ts => {
      const d = new Date(ts * 1000);
      const s = d.toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
      const m = s.match(/(\d+)\/(\d+)\/(\d+),?\s+(\d+):(\d+)/);
      if (!m) return null;
      return { date: m[3] + '-' + m[1] + '-' + m[2], min: (+m[4] % 24) * 60 + (+m[5]) };
    };
    const OPEN = 9 * 60 + 30, RANGE_END = 9 * 60 + 45, WINDOW_END = OPEN + 90;

    const last = nyParts(c[c.length - 1].rawTime);
    if (!last) return this.wait(['Could not resolve New York time']);
    const session = last.date;

    const bars = [];
    for (let k = c.length - 1; k >= 0 && bars.length < 700; k--){
      const p = nyParts(c[k].rawTime);
      if (!p || p.date !== session) break;
      bars.unshift(Object.assign({}, c[k], { nyMin: p.min }));
    }
    const orBars = bars.filter(b => b.nyMin >= OPEN && b.nyMin < RANGE_END);
    if (!orBars.length)
      return this.wait(['The 09:30–09:45 New York opening range has not formed yet today'], { model: 'Jdub Traders', session });
    if (last.min < RANGE_END)
      return this.wait(['Opening range still building (ends 09:45 New York)'], { model: 'Jdub Traders', session });
    if (last.min > WINDOW_END)
      return this.wait(['Outside the 90-minute entry window (closes ' +
        Math.floor(WINDOW_END / 60) + ':' + String(WINDOW_END % 60).padStart(2, '0') + ' New York)'], { model: 'Jdub Traders', session });

    const orHigh = Math.max(...orBars.map(b => b.high));
    const orLow = Math.min(...orBars.map(b => b.low));
    const orSize = orHigh - orLow;
    const after = bars.filter(b => b.nyMin >= RANGE_END);
    if (after.length < 5) return this.wait(['Waiting for candles after the opening range'], { model: 'Jdub Traders', session });

    /* fold M1 into completed M5 confirmation candles */
    const m5 = [];
    let cur = null;
    for (const b of after){
      const slot = Math.floor(b.rawTime / 300) * 300;
      if (!cur || cur.slot !== slot){
        if (cur) m5.push(cur);
        cur = { slot, open: b.open, high: b.high, low: b.low, close: b.close, rawTime: slot };
      } else {
        cur.high = Math.max(cur.high, b.high); cur.low = Math.min(cur.low, b.low); cur.close = b.close;
      }
    }
    /* `cur` is the still-forming M5 — only completed ones confirm */
    const confUp = m5.find(x => x.close > orHigh && x.close > x.open);
    const confDn = m5.find(x => x.close < orLow && x.close < x.open);
    if (!confUp && !confDn)
      return this.wait(['No completed M5 candle has closed beyond the opening range yet'],
        { model: 'Jdub Traders', session, meta: { orHigh, orLow } });

    const a = after[after.length - 1], prev = after[after.length - 2];
    const ageMin = (last.min - (nyParts(a.rawTime) || last).min);
    if (ageMin > 5)
      return this.wait(['Latest trigger candle is older than 5 minutes'], { model: 'Jdub Traders', session });

    const buffer = Math.max(orSize * 0.05, a.close * 0.0001);
    const mk = (dir, model, score, trigger, why) => {
      const entry = a.close;
      const sl = dir > 0
        ? Math.min(trigger.low, orHigh) - buffer
        : Math.max(trigger.high, orLow) + buffer;
      const stopDist = Math.abs(entry - sl);
      return {
        dir, score, entry, sl,
        tp: dir > 0 ? entry + 1.5 * stopDist : entry - 1.5 * stopDist,
        model: 'Jdub · ' + model,
        reasons: [
          'New York session ' + session + ', opening range ' + fmtPrice(orLow) + ' – ' + fmtPrice(orHigh),
          'Confirmation: completed M5 candle closed ' + (dir > 0 ? 'above the range high' : 'below the range low'),
          why,
          'Stop placed beyond the trigger structure with a ' + fmtPrice(buffer) + ' buffer (the source method does not fix one universal stop rule — this is ASTRA\'s stated assumption)',
        ],
        failed: [], session,
        factors: { ['jdub:' + model]: true },
        meta: { orHigh, orLow, orSize: +orSize.toFixed(6), buffer: +buffer.toFixed(6) },
      };
    };

    /* 1 & 2 — break and retest (highest quality) */
    if (confUp && prev && prev.low <= orHigh && a.close > orHigh && this.bull(a))
      return mk(1, 'break & retest', 84, a, 'Price came back to the range high and the retest closed bullish above it');
    if (confDn && prev && prev.high >= orLow && a.close < orLow && this.bear(a))
      return mk(-1, 'break & retest', 84, a, 'Price came back to the range low and the retest closed bearish below it');

    /* 5 & 6 — reversal / failed breakout */
    if (prev && prev.high > orHigh && prev.close < orHigh && this.bear(a))
      return mk(-1, 'reversal', 76, prev, 'Price poked above the range high, closed back inside, and the next candle confirmed the rejection');
    if (prev && prev.low < orLow && prev.close > orLow && this.bull(a))
      return mk(1, 'reversal', 76, prev, 'Price poked below the range low, closed back inside, and the next candle confirmed the rejection');

    /* 3 & 4 — plain breakout continuation */
    if (confUp && this.bull(a) && a.close > orHigh)
      return mk(1, 'breakout', 70, a, 'Bullish candle closed above the range high with no completed retest');
    if (confDn && this.bear(a) && a.close < orLow)
      return mk(-1, 'breakout', 70, a, 'Bearish candle closed below the range low with no completed retest');

    return this.wait(['Confirmed beyond the range, but no valid entry model on the latest candle'],
      { model: 'Jdub Traders', session, meta: { orHigh, orLow } });
  },

  /* ================= 4. RigorGate — action gate over scanner evidence ================= */
  rigorGate(candles, cfg, ledger){
    cfg = cfg || {};
    const ev = this.regimePullback(candles, Object.assign({}, cfg, { threshold: 0 }));
    const min = cfg.minScore != null ? cfg.minScore : 62;
    const score = ev.score || 0;
    const dir = ev.dir || ev.near || 0;
    const holding = ledger && ledger.open.some(p => p.sym === cfg.sym && p.dir > 0);

    const base = { model: 'RigorGate', score, evidence: ev.reasons || [], failed: ev.failed || [], meta: ev.meta };

    if (dir > 0 && score >= min)
      return Object.assign({}, ev, base, { dir: 1, action: 'BUY',
        reasons: ['BUY accepted — scanner evidence scored ' + score.toFixed(0) + ' (minimum ' + min + ')'].concat(ev.reasons || []) });

    if (dir < 0 && score >= min){
      if (holding)
        return Object.assign({}, base, { dir: 0, action: 'SELL', closeLongs: true,
          reasons: ['SELL accepted — closing the open long. RigorGate never opens short positions.'] });
      return Object.assign({}, base, { dir: 0, action: 'SELL',
        reasons: ['SELL signalled but no long is held — no action taken (shorts are deliberately disabled)'] });
    }

    return Object.assign({}, base, { dir: 0, action: 'WAIT',
      reasons: ['WAIT — evidence scored ' + score.toFixed(0) + ', below the minimum of ' + min] });
  },

  /* ================= 5. Video MA ribbon + multi-timeframe MACD ================= */
  maMacd(candles, cfg, higher){
    cfg = cfg || {};
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 220) return this.wait(['Needs 220 candles for the EMA200 ribbon (have ' + c.length + ')']);
    const i = c.length - 1;
    const close = c.map(x => x.close);

    const ma = {
      e20: IND.ema(close, 20), e50: IND.ema(close, 50),
      e100: IND.ema(close, 100), e200: IND.ema(close, 200),
      sma1: close.slice(),      // MA5 = SMA(1) — reference only, never a gate
    };
    const atr = IND.atr(c, 14), rsi = IND.rsi(close, 14);
    if (ma.e200[i] == null || atr[i] == null) return this.wait(['Ribbon still warming up']);

    const cur = this.macdSma(close, 12, 26, 9);
    const hi = higher && higher.length > 40 ? this.macdSma(this.closed(higher, cfg.allowLive).map(x => x.close), 12, 26, 9) : null;
    const hIdx = hi ? hi.macd.length - 1 : -1;

    const build = (dir) => {
      const up = dir > 0;
      const reasons = [], failed = [], factors = {};
      const px = c[i].close, A = atr[i];

      /* --- ribbon alignment (SMA(1) deliberately ignored) --- */
      const rel = [
        [ma.e20[i], ma.e50[i], 'EMA20 vs EMA50'],
        [ma.e50[i], ma.e100[i], 'EMA50 vs EMA100'],
        [ma.e100[i], ma.e200[i], 'EMA100 vs EMA200'],
      ];
      const agree = rel.filter(([a, b]) => up ? a > b : a < b);
      const priceOk = up ? px > ma.e20[i] : px < ma.e20[i];
      const slowSlope = this.slope(ma.e200, i, 10);
      const slowOk = up ? slowSlope > 0 : slowSlope < 0;

      if (agree.length < 3) failed.push('Only ' + agree.length + ' of 3 ribbon relationships are ' + (up ? 'bullish' : 'bearish') + ' (needs 3)');
      else { reasons.push('Ribbon fully ' + (up ? 'bullish' : 'bearish') + ': EMA20 > EMA50 > EMA100 > EMA200'.replace(/>/g, up ? '>' : '<')); factors.ribbon = true; }
      if (!priceOk) failed.push('Price is not ' + (up ? 'above' : 'below') + ' EMA20');
      else reasons.push('Price is ' + (up ? 'above' : 'below') + ' the fastest average');
      if (!slowOk) failed.push('EMA200 is not sloping ' + (up ? 'up' : 'down'));
      else { reasons.push('EMA200 slopes ' + (up ? 'up' : 'down')); factors.slowSlope = true; }

      /* --- pullback then reclaim --- */
      const p = c[i - 1];
      const nearRibbon = up
        ? (p.low - ma.e20[i - 1]) <= 0.75 * A || (p.low - ma.e50[i - 1]) <= 0.75 * A
        : (ma.e20[i - 1] - p.high) <= 0.75 * A || (ma.e50[i - 1] - p.high) <= 0.75 * A;
      const counter = up ? this.bear(p) : this.bull(p);
      const reclaim = up ? (this.bull(c[i]) && c[i].close > p.high) : (this.bear(c[i]) && c[i].close < p.low);
      if (nearRibbon && counter) { reasons.push('Previous candle pulled back into the ribbon'); factors.pullback = true; }
      else failed.push('No counter-direction pullback into the ribbon on the previous candle');
      if (reclaim) { reasons.push('Latest closed candle reclaimed the previous candle\'s ' + (up ? 'high' : 'low')); factors.reclaim = true; }
      else failed.push('Latest candle did not reclaim in the intended direction');

      /* --- MACD on this timeframe and the higher one --- */
      const m = cur.macd[i], s = cur.signal[i], h = cur.hist[i];
      const state = this.histState(cur.hist, i);
      const curOk = m != null && s != null && (up ? (m > s && h > 0) : (m < s && h < 0));
      if (curOk) { reasons.push('MACD ' + (up ? 'above' : 'below') + ' its signal with a ' + (up ? 'positive' : 'negative') + ' histogram (' + state.name + ': ' + state.text + ')'); factors.macd = true; }
      else failed.push('MACD on this timeframe does not confirm (' + state.text + ')');

      if (hi && hIdx > 0){
        const hm = hi.macd[hIdx], hs = hi.signal[hIdx], hh = hi.hist[hIdx];
        const hiOk = hm != null && hs != null && (up ? (hm > hs && hh > 0) : (hm < hs && hh < 0));
        if (hiOk) { reasons.push('Higher timeframe (' + (cfg.higherTf || 'M15') + ') MACD agrees'); factors.macdHigher = true; }
        else failed.push('Higher timeframe (' + (cfg.higherTf || 'M15') + ') MACD does not agree');
      } else failed.push('Higher timeframe data unavailable for confirmation');

      /* --- RSI as support only, never alone --- */
      const r = rsi[i];
      if (r != null && (up ? r > 50 : r < 50)) { reasons.push('RSI ' + r.toFixed(1) + ' supports the direction'); factors.rsi = true; }

      /* --- risk: beyond the 5-candle swing --- */
      const swing = up ? this.recentLow(c, i + 1, 5) : this.recentHigh(c, i + 1, 5);
      const pad = cfg.stopPad != null ? cfg.stopPad : 0.2;
      const rr = cfg.rr != null ? cfg.rr : 1.5;
      const tp1R = cfg.tp1R != null ? cfg.tp1R : 1;
      const sl = up ? swing - pad * A : swing + pad * A;
      const stopDist = Math.abs(px - sl);
      const scoreParts = ['ribbon', 'slowSlope', 'pullback', 'reclaim', 'macd', 'macdHigher', 'rsi'];
      const score = Math.round(scoreParts.filter(k => factors[k]).length / scoreParts.length * 100);

      return {
        dir, score, reasons, failed, factors,
        entry: px, sl,
        tp1: up ? px + tp1R * stopDist : px - tp1R * stopDist,  // take half, stop to breakeven
        tp: up ? px + rr * stopDist : px - rr * stopDist,       // final target
        model: 'MA ribbon + MTF MACD',
        meta: { histState: state.name, macd: m == null ? null : +m.toFixed(6), signal: s == null ? null : +s.toFixed(6),
                sma1: +px.toFixed(6), higherTf: cfg.higherTf || '15m' },
      };
    };

    const long = build(1), short = build(-1);
    const best = long.failed.length <= short.failed.length ? long : short;
    if (best.failed.length) return this.wait(best.failed, { score: best.score, model: best.model, reasons: best.reasons, meta: best.meta });
    return best;
  },

  /* ================= 6. Mean reversion — band fade =================
     Every other strategy here follows a trend. This one does the opposite, and
     that is the point: it earns in exactly the conditions that chop the others
     up, so the two together are steadier than either alone.

     It refuses to trade a trending market. ADX must be LOW. Price has to have
     poked outside the Bollinger band and then closed back inside — a rejected
     extreme, not a running one — with the oscillator stretched to match. The
     target is the middle band: the average it is reverting to. If that average
     is too close to pay for the stop, it does not take the trade. */
  /* ================= SCALPER =================
     Small, frequent trades in BOTH directions, taking a slice out of the little
     swings rather than waiting for a move.

     The thing that decides whether a scalper works is not the entry, it is the
     COST. A target of 0.05% is pure fantasy on an instrument whose spread is
     0.04%: the trade starts a long way behind and has to make the whole gap back
     before the first cent of profit. So the first gate here is arithmetic, not
     opinion — the target must clear the round trip (spread + both commissions)
     by a stated multiple, and if it cannot, the instrument is refused outright
     no matter how good the setup looks.

     After that gate, eight indicators vote. None of them is a veto on its own,
     because a single indicator is noise at this timeframe; the score is what
     decides. They are chosen to disagree in useful ways — trend, momentum,
     stretch, position and structure — so agreement means something.

     Regime decides WHICH WAY the votes are read: when ADX says a micro-trend is
     running, the bot buys dips within it, and when ADX says the market is flat,
     it fades the edges of the range. Trading a range as if it were a trend is
     how a scalper bleeds. */
  SCALP_W: { trend: 16, htf: 10, stoch: 15, rsi: 12, macd: 12, band: 11, vwap: 10, candle: 14 },

  scalper(candles, cfg){
    cfg = cfg || {};
    const c = this.closed(candles, cfg.allowLive);
    const need = 90;
    if (c.length < need) return this.wait(['Not enough candles (need ' + need + ', have ' + c.length + ')']);
    const i = c.length - 1;

    const tpAtr      = cfg.tpAtr      != null ? cfg.tpAtr      : 0.55;
    const slAtr      = cfg.slAtr      != null ? cfg.slAtr      : 0.55;
    const costMult   = cfg.costMult   != null ? cfg.costMult   : 4;
    const trendAdx   = cfg.trendAdx   != null ? cfg.trendAdx   : 20;
    const atrMinPct  = cfg.atrMinPct  != null ? cfg.atrMinPct  : 0.05;
    const atrMaxPct  = cfg.atrMaxPct  != null ? cfg.atrMaxPct  : 1.2;
    const minScore   = cfg.minScore   != null ? cfg.minScore   : 62;

    const close = c.map(x => x.close);
    const ema8 = IND.ema(close, 8), ema21 = IND.ema(close, 21), ema50 = IND.ema(close, 50);
    const rsi = IND.rsi(close, 7);
    const st = IND.stoch(c, 14, 3, 3);
    const md = IND.macd(close, 12, 26, 9);
    const bb = IND.bb(close, 20, 2);
    const atr = IND.atr(c, 14);
    const adx = IND.adx(c, 14);
    const vwap = IND.vwapDaily(c);

    if (ema50[i] == null || atr[i] == null || adx.adx[i] == null || rsi[i] == null ||
        st.k[i] == null || md.hist[i] == null || bb.mid[i] == null)
      return this.wait(['Indicators still warming up']);

    const a = c[i], px = a.close, A = atr[i];
    const atrPct = A / px * 100;
    const adxNow = adx.adx[i];
    const trending = adxNow >= trendAdx;

    /* ---- gate 1: is there enough movement to scalp at all? ---- */
    if (atrPct < atrMinPct)
      return this.wait(['The market is too quiet — a candle moves ' + atrPct.toFixed(3) +
        '% and this bot needs at least ' + atrMinPct + '%'],
        { model: 'Scalper', meta: { atrPct: +atrPct.toFixed(3), adx: +adxNow.toFixed(1) } });
    if (atrPct > atrMaxPct)
      return this.wait(['Too wild for a scalp — a candle moves ' + atrPct.toFixed(2) +
        '%, above the ' + atrMaxPct + '% ceiling, and a tight stop is just noise here'],
        { model: 'Scalper', meta: { atrPct: +atrPct.toFixed(3), adx: +adxNow.toFixed(1) } });

    /* ---- gate 2: THE COST GATE ----
       cfg.costPct is the round trip as a percentage of price, handed in by the
       bot from the live spread and this account's real commission. A scalp whose
       target does not clear it several times over is not a trade, it is a
       donation. */
    const costPct = cfg.costPct != null ? cfg.costPct : 0.03;
    const targetPct = tpAtr * A / px * 100;
    const cover = costPct > 0 ? targetPct / costPct : 99;
    if (cover < costMult)
      return this.wait(['The target is only ' + cover.toFixed(1) + 'x the cost of the trade (' +
        targetPct.toFixed(3) + '% target against ' + costPct.toFixed(3) +
        '% spread and commission) — this bot needs ' + costMult + 'x'],
        { model: 'Scalper', meta: { atrPct: +atrPct.toFixed(3), costPct: +costPct.toFixed(4),
                                    targetPct: +targetPct.toFixed(4), cover: +cover.toFixed(2) } });

    const W = this.SCALP_W;

    const build = (dir) => {
      const up = dir > 0;
      const reasons = [], failed = [], soft = [], factors = {};
      let score = 0;

      /* --- 1. the micro-trend, and the only hard requirement --- */
      const fastAbove = ema8[i] > ema21[i];
      if (trending){
        if (up !== fastAbove){
          failed.push('ADX ' + adxNow.toFixed(1) + ' says a trend is running ' +
            (fastAbove ? 'up' : 'down') + ' and this would trade against it');
        } else {
          score += W.trend; factors.trend = true;
          reasons.push('EMA 8 is ' + (up ? 'above' : 'below') + ' EMA 21 and ADX is ' +
            adxNow.toFixed(1) + ' — a real micro-trend to join');
        }
      } else {
        /* flat market: fade the edge instead, so the direction is set by where
           price sits in the range rather than by the moving averages */
        const nearEdge = up ? (px <= bb.lo[i] + 0.25 * (bb.mid[i] - bb.lo[i]))
                            : (px >= bb.up[i] - 0.25 * (bb.up[i] - bb.mid[i]));
        if (!nearEdge){
          failed.push('Flat market (ADX ' + adxNow.toFixed(1) + ') and price is not at the ' +
            (up ? 'lower' : 'upper') + ' edge of the range, so there is nothing to fade');
        } else {
          score += W.trend; factors.fade = true;
          reasons.push('ADX ' + adxNow.toFixed(1) + ' — a flat range, and price is at the ' +
            (up ? 'bottom' : 'top') + ' of it');
        }
      }

      /* --- 2. the slower average, as a background bias --- */
      const htfOk = up ? px > ema50[i] : px < ema50[i];
      if (htfOk){
        score += W.htf; factors.htf = true;
        reasons.push('Price is on the ' + (up ? 'upper' : 'lower') + ' side of the 50 average');
      } else soft.push('Price is on the wrong side of the 50 average for this direction');

      /* --- 3. stochastic turning out of the extreme --- */
      const kNow = st.k[i], kPrev = st.k[i - 1];
      const turned = up ? (kPrev < kNow && kPrev < 35) : (kPrev > kNow && kPrev > 65);
      if (turned){
        score += W.stoch; factors.stoch = true;
        reasons.push('Stochastic turned ' + (up ? 'up from ' : 'down from ') + kPrev.toFixed(0));
      } else soft.push('Stochastic has not turned out of an extreme (' + kNow.toFixed(0) + ')');

      /* --- 4. a fast RSI that is stretched but not broken --- */
      const rNow = rsi[i];
      const rsiOk = up ? (rNow > 30 && rNow < 62) : (rNow < 70 && rNow > 38);
      if (rsiOk){
        score += W.rsi; factors.rsi = true;
        reasons.push('RSI(7) at ' + rNow.toFixed(0) + ' — room left in this direction');
      } else soft.push('RSI(7) is ' + rNow.toFixed(0) + ', too far gone for a ' + (up ? 'buy' : 'sell'));

      /* --- 5. momentum bending our way --- */
      const hNow = md.hist[i], hPrev = md.hist[i - 1];
      const macdOk = up ? hNow > hPrev : hNow < hPrev;
      if (macdOk){
        score += W.macd; factors.macd = true;
        reasons.push('MACD histogram is bending ' + (up ? 'up' : 'down'));
      } else soft.push('MACD momentum is still going the other way');

      /* --- 6. where in the band --- */
      const width = bb.up[i] - bb.lo[i];
      const pos = width > 0 ? (px - bb.lo[i]) / width : 0.5;
      const bandOk = up ? pos < 0.5 : pos > 0.5;
      if (bandOk){
        score += W.band; factors.band = true;
        reasons.push('Price is in the ' + (up ? 'lower' : 'upper') + ' half of the band — not chasing');
      } else soft.push('Price is already in the ' + (up ? 'upper' : 'lower') + ' half of the band');

      /* --- 7. the day's volume-weighted average --- */
      const vw = vwap[i];
      if (vw != null){
        const vwapOk = up ? px >= vw * 0.999 : px <= vw * 1.001;
        if (vwapOk){
          score += W.vwap; factors.vwap = true;
          reasons.push('On the ' + (up ? 'buy' : 'sell') + ' side of the day average');
        } else soft.push('On the wrong side of the day average');
      }

      /* --- 8. the candle itself: a rejection wick where we want one --- */
      const body = Math.abs(a.close - a.open);
      const lowWick = Math.min(a.open, a.close) - a.low;
      const highWick = a.high - Math.max(a.open, a.close);
      const wick = up ? lowWick : highWick;
      const rejected = body > 0 ? wick > body * 0.6 : wick > 0;
      const closedOurWay = up ? a.close >= a.open : a.close <= a.open;
      if (rejected || closedOurWay){
        score += rejected && closedOurWay ? W.candle : Math.round(W.candle * 0.6);
        factors.candle = true;
        reasons.push(rejected
          ? 'The last candle was rejected from ' + (up ? 'below' : 'above')
          : 'The last candle closed ' + (up ? 'up' : 'down'));
      } else soft.push('The last candle gives no support to this direction');

      const sl = up ? px - slAtr * A : px + slAtr * A;
      const tp = up ? px + tpAtr * A : px - tpAtr * A;
      const stopDist = Math.abs(px - sl);
      return { dir, score: Math.round(score), reasons, failed, soft, factors,
        entry: px, sl, tp,
        rMultiple: stopDist > 0 ? +(Math.abs(tp - px) / stopDist).toFixed(2) : 0,
        model: trending ? 'Scalper · with the trend' : 'Scalper · fading the range',
        meta: { adx: +adxNow.toFixed(1), atrPct: +atrPct.toFixed(3),
                costPct: +costPct.toFixed(4), targetPct: +targetPct.toFixed(4),
                cover: +cover.toFixed(2), rsi: +rNow.toFixed(0), stoch: +kNow.toFixed(0) } };
    };

    const long = build(1), short = build(-1);
    const valid = [long, short].filter(x => !x.failed.length);
    if (!valid.length){
      const near = long.failed.length <= short.failed.length ? long : short;
      return this.wait(near.failed, { score: near.score, near: near.dir, model: near.model,
        reasons: near.reasons, meta: near.meta });
    }
    const best = valid.sort((a, b) => b.score - a.score)[0];
    if (best.score < minScore)
      return this.wait(['Only ' + best.score + ' of 100 confirmations agreed, below the ' +
        minScore + ' this bot needs'].concat(best.soft || []),
        { score: best.score, near: best.dir, model: best.model, reasons: best.reasons, meta: best.meta });

    best.reasons.push('Target ' + best.meta.targetPct.toFixed(3) + '% covers the ' +
      best.meta.costPct.toFixed(3) + '% round trip ' + best.meta.cover.toFixed(1) + ' times over');
    return best;
  },

  /* ================= TRIPLE CONFIRMATION =================
     Three different kinds of evidence have to agree before it acts:

       1. A CANDLESTICK PATTERN on the last closed candle, and only one with a
          measured positive edge (the PATTERN_EDGE table). Three Soldiers
          measured negative, so it is refused here as everywhere else.
       2. LOCATION — the pattern has to form AT a support or resistance level
          the market has already turned at: a bullish pattern within reach of
          support, a bearish one within reach of resistance. A hammer in the
          middle of nowhere is a candle; a hammer on a level touched three
          times is a setup.
       3. THE ASTRA CONFLUENCE READING — the same checks the Confluence
          indicator makes (EMA20/EMA100 trend, ADX strength, RSI in its zone,
          tick activity), scored rather than demanded, so the bot can trade a
          strong pattern at a strong level on a day the trend check is mixed.

     The stop sits on the far side of the level, so the trade is wrong when the
     level breaks — which is a reason, not a guess. The target is the next
     level the other way if that pays enough, otherwise a fixed multiple of the
     risk. */
  TRIPLE_W: { pattern: 30, level: 30, trend: 14, adx: 10, rsi: 8, tick: 8 },

  triple(candles, cfg){
    cfg = cfg || {};
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 120) return this.wait(['Not enough candles (need 120, have ' + c.length + ')']);
    const i = c.length - 1;
    const W = this.TRIPLE_W;
    const nearAtr  = cfg.nearAtr  != null ? cfg.nearAtr  : 0.6;   /* how close to a level counts as "at" it */
    const padAtr   = cfg.padAtr   != null ? cfg.padAtr   : 0.35;  /* stop this far beyond the level */
    const rr       = cfg.rr       != null ? cfg.rr       : 2;
    const minR     = cfg.minR     != null ? cfg.minR     : 1.2;
    const minEdge  = cfg.minEdge  != null ? cfg.minEdge  : 0.05;
    const minTouch = cfg.minTouch != null ? cfg.minTouch : 2;
    const minScore = cfg.minScore != null ? cfg.minScore : 60;

    /* ---- 1. a pattern with a measured edge ---- */
    const found = PAT.at(c, i).filter(p => p.dir !== 0);
    if (!found.length) return this.wait(['No pattern on the last closed candle'], { model: 'Triple' });
    const usable = found
      .map(p => ({ p, e: (this.PATTERN_EDGE[p.name] || { edge: 0 }).edge }))
      .filter(x => x.e >= minEdge)
      .sort((a, b) => b.e - a.e);
    if (!usable.length){
      const names = found.map(p => p.name).join(', ');
      return this.wait([names + ' — ' + (found.some(p => (this.PATTERN_EDGE[p.name] || {}).edge < 0)
        ? 'measured negative, so it is refused' : 'no measured edge')], { model: 'Triple' });
    }
    const pat = usable[0].p, edge = usable[0].e, dir = pat.dir, up = dir > 0;

    /* ---- 2. at a level ---- */
    const atr = IND.atr(c, 14), A = atr[i];
    if (!(A > 0)) return this.wait(['ATR still warming up'], { model: 'Triple' });
    const a = c[i], px = a.close;
    const levels = IND.srLevels(c, { wing: cfg.wing || 3, lookback: cfg.lookback || 300,
                                     tolAtr: cfg.tolAtr || 0.35, max: 10 });
    const strong = levels.filter(L => L.touches >= minTouch);
    /* the level the pattern formed on: for a buy, support under the candle's low
       (or that the low pierced and closed back above); for a sell, the mirror */
    const wantKind = up ? 'support' : 'resistance';
    let at = null, dist = Infinity;
    for (const L of strong){
      if (L.kind !== wantKind && L.kind !== 'both') continue;
      const d = up ? Math.abs(a.low - L.price) : Math.abs(a.high - L.price);
      const closedRightSide = up ? a.close > L.price : a.close < L.price;
      if (d <= nearAtr * A && closedRightSide && d < dist){ at = L; dist = d; }
    }
    if (!at){
      const near = IND.srNear(strong, px);
      const hint = up ? (near.below ? 'nearest support is ' + fmtPrice(near.below.price) + ', ' +
                        ((px - near.below.price) / A).toFixed(1) + ' ATR below' : 'no support level nearby')
                      : (near.above ? 'nearest resistance is ' + fmtPrice(near.above.price) + ', ' +
                        ((near.above.price - px) / A).toFixed(1) + ' ATR above' : 'no resistance level nearby');
      return this.wait([pat.name + ' formed away from any ' + wantKind + ' level — ' + hint],
        { model: 'Triple', near: dir, meta: { pattern: pat.name, edge } });
    }

    /* ---- 3. the confluence reading, scored ---- */
    const close = c.map(x => x.close);
    const e20 = IND.ema(close, 20), e100 = IND.ema(close, 100);
    const adx = IND.adx(c, 14).adx[i], rsi = IND.rsi(close, 14)[i];
    const vols = c.slice(i - 20, i).map(b => b.volume || 0), vmean = vols.reduce((x, y) => x + y, 0) / 20;
    const tick = vmean > 0 && a.volume > 0 ? a.volume / vmean : null;
    const trend = (e20[i] > e100[i] && e100[i] > e100[i - 4]) ? 1
                : (e20[i] < e100[i] && e100[i] < e100[i - 4]) ? -1 : 0;

    const reasons = [], soft = [], factors = {};
    let score = 0;

    score += W.pattern * Math.min(1, 0.4 + edge * 1.6);
    factors['pattern:' + pat.name] = true;
    reasons.push(pat.name + ' — measured +' + edge.toFixed(2) + ' ATR edge (' +
      (this.PATTERN_EDGE[pat.name] || {}).n + ' cases)');

    score += W.level * Math.min(1, 0.5 + (at.touches - minTouch) * 0.2);
    factors.atLevel = true;
    reasons.push('Formed on ' + wantKind + ' at ' + fmtPrice(at.price) + ', touched ' + at.touches +
      ' times, ' + (dist / A).toFixed(2) + ' ATR away');

    if (trend === dir){ score += W.trend; factors.trend = true; reasons.push('EMA20/EMA100 trend agrees'); }
    else if (trend === 0){ score += W.trend * 0.4; soft.push('Trend is mixed'); }
    else soft.push('Trend is against this direction');

    if (adx != null && adx >= 25){ score += W.adx; factors.adx = true; reasons.push('ADX ' + adx.toFixed(1) + ' — the move has strength'); }
    else soft.push('ADX ' + (adx == null ? '—' : adx.toFixed(1)) + ' is under 25');

    const rsiOk = rsi != null && (up ? rsi >= 40 && rsi <= 70 : rsi >= 30 && rsi <= 60);
    if (rsiOk){ score += W.rsi; factors.rsi = true; reasons.push('RSI ' + rsi.toFixed(0) + ' has room'); }
    else soft.push('RSI ' + (rsi == null ? '—' : rsi.toFixed(0)) + ' is outside its zone');

    if (tick != null && tick >= 1){ score += W.tick; factors.tick = true; reasons.push('Activity ' + tick.toFixed(2) + '× the prior 20 bars'); }
    else if (tick != null) soft.push('Activity ' + tick.toFixed(2) + '× — quieter than usual');

    score = Math.round(score);
    if (score < minScore)
      return this.wait(['Scored ' + score + ' of 100, below the ' + minScore + ' this bot needs'].concat(soft),
        { score, near: dir, model: 'Triple', reasons, meta: { pattern: pat.name, level: at.price } });

    /* ---- levels: stop beyond the level, target at the next level or rr×risk ---- */
    const sl = up ? at.price - padAtr * A : at.price + padAtr * A;
    const risk = Math.abs(px - sl);
    if (!(risk > 0)) return this.wait(['Stop would sit on the entry'], { model: 'Triple' });
    const opp = IND.srNear(strong.filter(L => L.kind !== wantKind || L.kind === 'both'), px);
    const nextLevel = up ? (opp.above && opp.above.price > px ? opp.above.price : null)
                         : (opp.below && opp.below.price < px ? opp.below.price : null);
    let tp = up ? px + rr * risk : px - rr * risk, tpWhy = rr + '× the risk';
    if (nextLevel != null){
      const rAtLevel = Math.abs(nextLevel - px) / risk;
      if (rAtLevel >= minR && rAtLevel < rr * 1.5){ tp = nextLevel; tpWhy = 'the next ' + (up ? 'resistance' : 'support') + ' at ' + fmtPrice(nextLevel); }
      else if (rAtLevel < minR)
        return this.wait(['The next ' + (up ? 'resistance' : 'support') + ' is only ' + rAtLevel.toFixed(2) +
          'R away — not enough room to pay for the risk'], { score, near: dir, model: 'Triple' });
    }
    const rMul = Math.abs(tp - px) / risk;
    reasons.push('Stop ' + fmtPrice(sl) + ' beyond the level · target ' + fmtPrice(tp) + ' (' + tpWhy + ', ' + rMul.toFixed(2) + 'R)');

    return { dir, score, reasons, failed: [], soft, factors,
      entry: px, sl, tp, rMultiple: +rMul.toFixed(2), model: 'Triple',
      meta: { pattern: pat.name, edge, level: +at.price.toFixed(6), touches: at.touches,
              adx: adx == null ? null : +adx.toFixed(1), rsi: rsi == null ? null : +rsi.toFixed(0),
              trend, tick: tick == null ? null : +tick.toFixed(2) } };
  },

  meanFade(candles, cfg){
    cfg = cfg || {};
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 60) return this.wait(['Not enough candles (need 60, have ' + c.length + ')']);
    const i = c.length - 1;
    if (i < 2) return this.wait(['Not enough closed candles']);

    const bbLen = cfg.bbLen != null ? cfg.bbLen : 20;
    const bbDev = cfg.bbDev != null ? cfg.bbDev : 2;
    const adxMax = cfg.adxMax != null ? cfg.adxMax : 22;
    const rsiLow = cfg.rsiLow != null ? cfg.rsiLow : 32;
    const rsiHigh = 100 - rsiLow;
    const stopPad = cfg.stopPad != null ? cfg.stopPad : 0.4;
    const atrMax = cfg.atrMax != null ? cfg.atrMax : 2;
    const minR = cfg.minR != null ? cfg.minR : 0.8;
    const pierceBars = cfg.pierceBars != null ? Math.round(cfg.pierceBars) : 3;

    const close = c.map(x => x.close);
    const bb = IND.bb(close, bbLen, bbDev);
    const rsi = IND.rsi(close, 14), atr = IND.atr(c, 14), adx = IND.adx(c, 14);
    if (bb.mid[i] == null || atr[i] == null || adx.adx[i] == null || rsi[i] == null)
      return this.wait(['Indicators still warming up']);

    const a = c[i], p = c[i - 1], A = atr[i], px = a.close;
    const atrPct = A / px * 100;
    const adxNow = adx.adx[i];

    /* the one condition it will not bend: this is a range tool */
    if (adxNow > adxMax)
      return this.wait(['ADX is ' + adxNow.toFixed(1) + ' — the market is trending, and fading a trend is how accounts die (needs under ' + adxMax + ')'],
        { model: 'Mean Reversion', meta: { adx: +adxNow.toFixed(1) } });

    const build = (dir) => {
      const up = dir > 0;                       // up = buy the lower band
      const reasons = [], failed = [], soft = [], factors = {};
      let score = 0;

      /* --- range regime (26) --- */
      score += this.FADE_W.regime; factors.range = true;
      reasons.push('ADX ' + adxNow.toFixed(1) + ' — a range, which is the only place this belongs');

      /* --- pierce then reclaim (24) ---
         The reclaim rarely happens on the very next candle: price tags the band,
         hesitates for a bar or two, then turns. Requiring it immediately threw
         away almost every real setup, so the pierce may be up to pierceBars back
         as long as price is now back inside. */
      const band = up ? bb.lo : bb.up;
      let pierceAt = -1;
      for (let k = i - 1; k >= Math.max(1, i - pierceBars); k--){
        const hit = up ? (c[k].low < band[k]) : (c[k].high > band[k]);
        if (hit){ pierceAt = k; break; }
      }
      const reclaimed = up ? (a.close > band[i]) : (a.close < band[i]);
      if (pierceAt >= 0 && reclaimed){
        score += this.FADE_W.reclaim; factors.reclaim = true;
        reasons.push('Price pushed ' + (up ? 'below' : 'above') + ' the band ' +
          (i - pierceAt === 1 ? 'on the previous candle' : (i - pierceAt) + ' candles ago') +
          ' and has closed back inside — the extreme was rejected');
      } else if (pierceAt < 0)
        failed.push('Price has not reached ' + (up ? 'below' : 'above') + ' the band in the last ' + pierceBars + ' candles');
      else failed.push('Price is still outside the band — nothing has been rejected yet');

      /* --- the oscillator agrees the move was stretched (18) --- */
      const rPrev = rsi[i - 1];
      const stretched = up ? (rPrev <= rsiLow) : (rPrev >= rsiHigh);
      if (stretched){
        score += this.FADE_W.rsi; factors.rsi = true;
        reasons.push('RSI reached ' + rPrev.toFixed(1) + ' at the extreme');
      } else soft.push('RSI only reached ' + (rPrev == null ? '—' : rPrev.toFixed(1)) +
        ' (' + (up ? 'under ' + rsiLow : 'over ' + rsiHigh) + ' would have scored)');

      /* --- the candle itself turns (12) --- */
      const turns = up ? this.bull(a) : this.bear(a);
      if (turns){ score += this.FADE_W.candle; factors.candle = true;
        reasons.push('The reclaiming candle closed ' + (up ? 'bullish' : 'bearish')); }
      else soft.push('The reclaiming candle closed the wrong way');

      /* --- is there enough room to the average to be worth it? (12) ---
         Which SIDE of the average price sits on is mandatory: if it is already
         past the mean there is nothing to revert to. How far away it is only
         adds to the score. */
      const mid = bb.mid[i];
      const room = Math.abs(mid - px);
      if ((up && mid > px) || (!up && mid < px)){
        if (room >= 0.5 * A){ score += this.FADE_W.room; factors.room = true;
          reasons.push('The average sits ' + (room / A).toFixed(2) + ' ATR away'); }
        else soft.push('The average is only ' + (room / A).toFixed(2) + ' ATR away');
      } else failed.push('Price is already past the average — there is nothing to revert to');

      /* --- volatility sanity (8) --- */
      if (atrPct > 0 && atrPct <= atrMax){ score += this.FADE_W.vol; factors.vol = true;
        reasons.push('ATR is ' + atrPct.toFixed(2) + '% of price'); }
      else soft.push('ATR is ' + atrPct.toFixed(2) + '% of price (0–' + atrMax + '% would have scored)');

      let extreme = up ? Math.min(p.low, a.low) : Math.max(p.high, a.high);
      for (let k = Math.max(0, i - pierceBars); k <= i; k++)
        extreme = up ? Math.min(extreme, c[k].low) : Math.max(extreme, c[k].high);
      const sl = up ? extreme - stopPad * A : extreme + stopPad * A;
      const stopDist = Math.abs(px - sl);
      const r = stopDist > 0 ? room / stopDist : 0;

      return { dir, score: Math.round(score), reasons, failed, soft, factors,
        entry: px, sl, tp: mid, rMultiple: +r.toFixed(2),
        model: 'Mean Reversion',
        meta: { adx: +adxNow.toFixed(1), rsi: +(rPrev || 0).toFixed(1), atrPct: +atrPct.toFixed(3),
                bandDev: bbDev, toMean: +(room / A).toFixed(2), r: +r.toFixed(2) } };
    };

    /* Only two things are mandatory: the extreme really was rejected, and price
       is on the reverting side of the average. Everything else is weighed, and
       the score decides — the same way the pullback engine works. Making every
       contributor a gate meant the score never mattered and the bot fired twice
       in a thousand candles. */
    const long = build(1), short = build(-1);
    const valid = [long, short].filter(x => !x.failed.length);
    if (!valid.length){
      const near = long.failed.length <= short.failed.length ? long : short;
      return this.wait(near.failed, { score: near.score, near: near.dir, model: near.model,
        reasons: near.reasons, meta: near.meta });
    }
    const best = valid.sort((a, b) => b.score - a.score)[0];

    const min = cfg.minScore != null ? cfg.minScore : 62;
    if (best.score < min)
      return this.wait(['Scored ' + best.score + ', below the minimum of ' + min]
        .concat(best.soft || []),
        { score: best.score, near: best.dir, model: best.model, reasons: best.reasons, meta: best.meta });

    /* the reward has to cover the risk — a fade with a target inside the stop
       distance is a losing trade wearing a good disguise */
    if (best.rMultiple < minR)
      return this.wait(['The average is only ' + best.rMultiple.toFixed(2) +
        'R away, and this bot needs at least ' + minR + 'R'],
        { score: best.score, near: best.dir, model: best.model, meta: best.meta });

    best.reasons.push('Target is the ' + bbLen + '-period average, ' + best.rMultiple.toFixed(2) + 'R away');
    return best;
  },

  FADE_W: { regime: 26, reclaim: 24, rsi: 18, candle: 12, room: 12, vol: 8 },

  /* ================= 7. Consensus =================
     No signal of its own. It asks the other engines what they see on this exact
     candle and only acts when enough of them agree. A full vote is a strategy
     that would actually have opened a trade; a half vote is one that is close but
     short of its own threshold. The trade it takes is the best full vote's —
     its entry, its stop, its target — because averaging incompatible stops
     produces a position neither strategy would have wanted. */
  CONSENSUS_MEMBERS: {
    'Regime Pullback': (w, cfg, l, h) => STRAT.regimePullback(w, Object.assign({}, cfg, { threshold: 0 })),
    'Candlestick': (w, cfg) => STRAT.candlestick(w, Object.assign({}, cfg, { minScore: 0, only: null })),
    'MA ribbon + MACD': (w, cfg, l, h) => STRAT.maMacd(w, cfg, h),
    'Mean Reversion': (w, cfg) => STRAT.meanFade(w, Object.assign({}, cfg, { minScore: 0 })),
  },

  consensus(candles, cfg, ledger, higher){
    cfg = cfg || {};
    const minAgree = cfg.minAgree != null ? cfg.minAgree : 2;
    const leanScore = cfg.leanScore != null ? cfg.leanScore : 62;
    const votes = [];

    for (const [name, fn] of Object.entries(this.CONSENSUS_MEMBERS)){
      let sig = null;
      try { sig = fn(candles, cfg, ledger, higher); } catch(e){ continue; }
      if (!sig) continue;
      if (sig.dir) votes.push({ name, dir: sig.dir, score: sig.score || 0, weight: 1, sig });
      else if (sig.near && (sig.score || 0) >= leanScore)
        votes.push({ name, dir: sig.near, score: sig.score || 0, weight: 0.5, sig });
    }
    if (!votes.length)
      return this.wait(['None of the four engines sees anything here'], { model: 'Consensus' });

    const side = d => votes.filter(v => v.dir === d);
    const longs = side(1), shorts = side(-1);
    const weigh = list => list.reduce((a, v) => a + v.weight, 0);
    const wl = weigh(longs), ws = weigh(shorts);
    const dir = wl > ws ? 1 : ws > wl ? -1 : 0;

    if (!dir)
      return this.wait(['The engines are split ' + longs.length + ' long against ' + shorts.length + ' short'],
        { model: 'Consensus', reasons: votes.map(v => v.name + ' says ' + (v.dir > 0 ? 'buy' : 'sell')) });

    const agree = dir > 0 ? longs : shorts;
    const against = dir > 0 ? shorts : longs;
    const weight = weigh(agree);
    const full = agree.filter(v => v.weight === 1);

    const named = agree.map(v => v.name + (v.weight === 1 ? '' : ' (leaning)') +
      ' ' + Math.round(v.score)).join(', ');

    if (!full.length)
      return this.wait(['Only leaning votes — no engine actually fired: ' + named],
        { model: 'Consensus', near: dir, score: Math.round(weight * 30) });

    if (weight < minAgree)
      return this.wait(['Agreement is ' + weight.toFixed(1) + ' of the ' + minAgree + ' needed — ' + named],
        { model: 'Consensus', near: dir, score: Math.round(weight / minAgree * 60),
          reasons: agree.map(v => v.name + ' agrees') });

    /* the geometry comes from the strongest engine that actually fired */
    const lead = full.sort((a, b) => b.score - a.score)[0];
    const base = full.reduce((a, v) => a + v.score, 0) / full.length;
    const score = Math.min(100, Math.round(base + 6 * (weight - 1) - 8 * weigh(against)));

    const min = cfg.minScore != null ? cfg.minScore : 70;
    if (score < min)
      return this.wait(['Consensus scored ' + score + ', below the minimum of ' + min],
        { score, near: dir, model: 'Consensus', reasons: agree.map(v => v.name + ' agrees') });

    return {
      dir, score,
      entry: lead.sig.entry, sl: lead.sig.sl, tp: lead.sig.tp, tp1: lead.sig.tp1 || null,
      model: 'Consensus (' + full.length + '/' + Object.keys(this.CONSENSUS_MEMBERS).length + ')',
      reasons: ['Agreement ' + weight.toFixed(1) + ': ' + named]
        .concat(against.length ? ['Against it: ' + against.map(v => v.name).join(', ')] : [])
        .concat(['Risk taken from ' + lead.name + ', the strongest of them'])
        .concat(lead.sig.reasons || []),
      failed: [],
      factors: Object.assign({ consensus: true },
        agree.reduce((a, v) => { a['agrees:' + v.name] = true; return a; }, {})),
      meta: { agreement: +weight.toFixed(1), lead: lead.name,
              voted: votes.map(v => v.name + ':' + (v.dir > 0 ? '+' : '-') + Math.round(v.score)).join(' '),
              leadMeta: lead.sig.meta || {} },
    };
  },

  /* ================= 8. Pattern Pro =================
     Trades the SAME detector the chart draws with (PAT), so every marker you see
     is something this bot can act on — hammer, shooting star, engulfing, morning
     and evening star, tweezers, three soldiers and crows.

     What separates it from the older candlestick bot is that the patterns are
     WEIGHTED BY MEASURED EDGE, not by reputation. Measured over ~2,800
     occurrences across 8 instruments and 2 timeframes, the average forward move
     10 bars later, in the pattern’s own direction, in ATR units:

         Hammer            +0.38     Bullish engulfing  +0.05
         Morning star      +0.27     Bearish engulfing  +0.04
         Three crows       +0.23     Shooting star      +0.03
         Evening star      +0.12     Tweezer bottom     -0.05
         Tweezer top       +0.09     Three soldiers     -0.41

     Two of those are worth dwelling on. The engulfing patterns — the ones the
     original bots trade — are statistically almost nothing. And Three Soldiers,
     which every textbook calls strongly bullish, was the worst performer in the
     set: following it lost money consistently. It is refused here.

     Win rates are all close to 50%. That is expected and not a problem: the edge
     is in how far the move goes, not in how often it goes the right way. */
  PATTERN_EDGE: {
    'Hammer':            { edge: 0.38, n: 72 },
    'Morning star':      { edge: 0.27, n: 274 },
    'Three crows':       { edge: 0.23, n: 119 },
    'Evening star':      { edge: 0.12, n: 304 },
    'Tweezer top':       { edge: 0.09, n: 288 },
    'Bullish engulfing': { edge: 0.05, n: 619 },
    'Bearish engulfing': { edge: 0.04, n: 678 },
    'Shooting star':     { edge: 0.03, n: 63 },
    'Tweezer bottom':    { edge: -0.05, n: 221 },
    'Three soldiers':    { edge: -0.41, n: 154 },
  },

  patternPro(candles, cfg){
    cfg = cfg || {};
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 60) return this.wait(['Not enough candles']);
    const i = c.length - 1;

    const minEdge = cfg.minEdge != null ? cfg.minEdge : 0.05;
    const stopPad = cfg.stopPad != null ? cfg.stopPad : 0.25;
    const rr = cfg.rr != null ? cfg.rr : 1.5;
    const atrMax = cfg.atrMax != null ? cfg.atrMax : 2.5;

    if (typeof PAT === 'undefined') return this.wait(['Pattern detector unavailable']);
    const found = PAT.at(c, i).filter(p => p.dir !== 0);
    if (!found.length) return this.wait(['No pattern on the last closed candle'], { model: 'Pattern Pro' });

    /* keep only patterns this bot is allowed to trade AND that measured positive */
    const allow = cfg.patterns && cfg.patterns.length ? cfg.patterns : null;
    const usable = found
      .map(p => ({ p, e: (this.PATTERN_EDGE[p.name] || { edge: 0 }).edge }))
      .filter(x => (!allow || allow.includes(x.p.name)) && x.e >= minEdge)
      .sort((a, b) => b.e - a.e);

    if (!usable.length){
      const names = found.map(p => p.name).join(', ');
      const worst = found.map(p => (this.PATTERN_EDGE[p.name] || {}).edge).filter(e => e != null);
      return this.wait([names + ' — ' + (worst.some(e => e < 0)
        ? 'measured NEGATIVE historically, so it is refused'
        : 'below the minimum measured edge of ' + minEdge + ' ATR')], { model: 'Pattern Pro' });
    }

    const best = usable[0];
    const pat = best.p;
    const close = c.map(x => x.close);
    const e20 = IND.ema(close, 20), e50 = IND.ema(close, 50), atr = IND.atr(c, 14);
    if (atr[i] == null || e50[i] == null) return this.wait(['Indicators still warming up']);

    const A = atr[i], a = c[i], p1 = c[i - 1], px = a.close;
    const atrPct = A / px * 100;
    const reasons = [], failed = [], factors = {};
    factors['pattern:' + pat.name] = true;

    /* the measured edge IS the base score, scaled onto 0-100 */
    let score = 40 + best.e * 100;
    reasons.push(pat.name + ' — measured +' + best.e.toFixed(2) +
      ' ATR average move over the following 10 candles (' +
      (this.PATTERN_EDGE[pat.name] || {}).n + ' occurrences)');

    const trendUp = e20[i] > e50[i];
    const agrees = (pat.dir > 0 && trendUp) || (pat.dir < 0 && !trendUp);
    if (agrees){ score += 14; factors.trendAgrees = true;
      reasons.push('Direction agrees with the EMA20/EMA50 trend'); }
    else if (cfg.trendOnly)
      return this.wait([pat.name + ' fights the trend and this bot only trades with it'], { score, model: 'Pattern Pro' });
    else { score -= 8; reasons.push('Direction fights the EMA20/EMA50 trend'); }

    const bodyStrength = Math.min(1, this.body(a) / this.range(a));
    score += bodyStrength * 8;
    reasons.push('Body fills ' + Math.round(bodyStrength * 100) + '% of the candle');

    const spread = cfg.spread != null ? cfg.spread : px * 0.0002;
    const spreadPct = spread / px * 100;
    score -= Math.min(12, spreadPct * 60);

    if (!(atrPct > 0 && atrPct <= atrMax))
      failed.push('ATR ' + atrPct.toFixed(2) + '% is outside the tradable band');

    const min = cfg.minScore != null ? cfg.minScore : 55;
    if (failed.length) return this.wait(failed, { score: Math.round(score), model: 'Pattern Pro' });
    if (score < min)
      return this.wait(['Scored ' + Math.round(score) + ', below the minimum of ' + min],
        { score: Math.round(score), near: pat.dir, model: 'Pattern Pro', reasons });

    /* the stop clears the whole formation, not just the signal candle */
    const lo = Math.min(a.low, p1.low), hiP = Math.max(a.high, p1.high);
    const sl = pat.dir > 0 ? lo - stopPad * A : hiP + stopPad * A;
    const stopDist = Math.abs(px - sl);
    if (!(stopDist > 0)) return this.wait(['Stop distance is zero'], { model: 'Pattern Pro' });

    return {
      dir: pat.dir, score: Math.round(score), entry: px, sl,
      tp: pat.dir > 0 ? px + rr * stopDist : px - rr * stopDist,
      model: 'Pattern Pro · ' + pat.name,
      reasons, failed: [], factors,
      meta: { pattern: pat.name, measuredEdge: best.e, atrPct: +atrPct.toFixed(3),
              alsoFound: found.map(x => x.name).join(', ') },
    };
  },

  /* ================= 10. Max Assurance (conviction) =================
     The "risky" bot, built the only way risk can honestly pay: it does NOT
     trade more often — it trades LESS, and puts more on the table when several
     independent engines agree on the same candle.

     Five engines are polled on the same closed candle. Each looks at different
     evidence, so agreement between them means something:
       · Triple Confirmation — a measured pattern ON a support/resistance level
       · Pattern Pro         — a pattern with a measured edge (level not needed)
       · Regime Pullback     — trend + pullback, at the 0.92 setting that passed
                               the split test
       · Mean Reversion      — the one counter-trend engine (its NO is as useful
                               as its YES: a fade signal against a trend entry
                               is a warning, and refuses the trade)
       · ASTRA Confluence    — the fixed 15-minute rule (trend, EMA20 reclaim,
                               ADX, RSI, tick), when the timeframe is 15m
     plus a structural check that is not a vote: the higher-timeframe trend
     (EMA20/EMA100 on the higher chart). Against it → refused, with it → +1.

     A full vote is an engine that would actually have opened a trade; a lean
     (½) is one that is close. It takes at least `minVotes` (default 3) with
     at least two engines actually firing, and ANY full vote the other way
     refuses the trade outright. Every extra vote above the minimum raises the
     size: riskMult = 1 + 0.5 × (votes − minVotes), +0.5 when the score passes
     90, capped at `maxMult` — and the engine caps it again at the bot's own
     maxRiskPct, so no configuration can risk more than that on one trade.

     Geometry comes from Triple when it fired (a stop beyond a real level is
     the most defensible stop here), otherwise from the strongest engine. */
  CONVICTION_MEMBERS: {
    'Triple':          (w, cfg) => STRAT.triple(w, Object.assign({}, cfg, { minScore: 0 })),
    'Pattern Pro':     (w, cfg) => STRAT.patternPro(w, Object.assign({}, cfg, { minScore: 0, minEdge: 0.05 })),
    'Regime Pullback': (w, cfg) => STRAT.regimePullback(w, Object.assign({}, cfg, { threshold: 0, minScore: 0 })),
    'Mean Reversion':  (w, cfg) => STRAT.meanFade(w, Object.assign({}, cfg, { minScore: 0 })),
    'ASTRA Confluence':(w, cfg) => (typeof Confluence !== 'undefined' && (cfg.tf || '15m') === '15m')
                                     ? Confluence.inspect(w, w.length - 1, '15m') : null,
  },
  CONVICTION_FIRE: { 'Triple': 60, 'Pattern Pro': 55, 'Regime Pullback': 92, 'Mean Reversion': 62, 'ASTRA Confluence': 100 },

  conviction(candles, cfg, ledger, higher){
    cfg = cfg || {};
    const minVotes  = cfg.minVotes  != null ? cfg.minVotes  : 3;
    const minFull   = cfg.minFull   != null ? cfg.minFull   : 2;
    const leanScore = cfg.leanScore != null ? cfg.leanScore : 50;
    const minScore  = cfg.minScore  != null ? cfg.minScore  : 75;
    const maxMult   = cfg.maxMult   != null ? cfg.maxMult   : 3;
    const c = this.closed(candles, cfg.allowLive);
    if (c.length < 120) return this.wait(['Not enough candles (need 120, have ' + c.length + ')'], { model: 'Max Assurance' });

    /* ---- poll the engines ---- */
    const votes = [], seen = [];
    for (const [name, fn] of Object.entries(this.CONVICTION_MEMBERS)){
      let sig = null;
      try { sig = fn(candles, cfg, ledger, higher); } catch(e){ sig = null; }
      if (!sig) continue;
      const fireAt = this.CONVICTION_FIRE[name] || 0, sc = sig.score || 0;
      const fired = !!sig.dir && sc >= fireAt;
      const leanDir = sig.dir || sig.near || 0;
      const lean = !fired && leanDir && sc >= leanScore ? leanDir : 0;
      if (fired) votes.push({ name, dir: sig.dir, score: sc, weight: 1, sig });
      else if (lean) votes.push({ name, dir: lean, score: sc, weight: 0.5, sig });
      seen.push(name + ':' + (fired ? 'FIRE' : lean ? 'lean' : '—') + (leanDir ? (leanDir > 0 ? '+' : '−') : '') + Math.round(sc));
    }
    const voted = seen.join(' ');
    if (!votes.length)
      return this.wait(['No engine sees anything on this candle'], { model: 'Max Assurance', meta: { voted } });

    const side = d => votes.filter(v => v.dir === d);
    const weigh = list => list.reduce((a, v) => a + v.weight, 0);
    const wl = weigh(side(1)), ws = weigh(side(-1));
    const dir = wl > ws ? 1 : ws > wl ? -1 : 0;
    if (!dir)
      return this.wait(['The engines are split — ' + voted], { model: 'Max Assurance', meta: { voted } });
    const agree = side(dir), against = side(-dir);
    const full = agree.filter(v => v.weight === 1).sort((a, b) => b.score - a.score);
    const named = agree.map(v => v.name + (v.weight === 1 ? '' : ' (leaning)') + ' ' + Math.round(v.score)).join(', ');

    /* any engine that would have traded the OTHER way is a veto */
    const veto = against.filter(v => v.weight === 1);
    if (veto.length)
      return this.wait([veto.map(v => v.name).join(', ') + ' would trade the other way — refused'],
        { model: 'Max Assurance', near: dir, score: 30, meta: { voted } });

    /* ---- higher-timeframe structure: not a vote, a gate + bonus ---- */
    let htf = 0, htfNote = 'No higher-timeframe data';
    if (higher && higher.length >= 110){
      const hc = this.closed(higher, false), k = hc.length - 1;
      if (hc.length >= 105){
        const close = hc.map(x => x.close), e20 = IND.ema(close, 20), e100 = IND.ema(close, 100);
        htf = (e20[k] > e100[k] && e100[k] > e100[k - 3]) ? 1 : (e20[k] < e100[k] && e100[k] < e100[k - 3]) ? -1 : 0;
        htfNote = 'Higher-timeframe trend is ' + (htf > 0 ? 'up' : htf < 0 ? 'down' : 'mixed');
      }
    }
    if (htf && htf !== dir)
      return this.wait([htfNote + ' — against this trade'], { model: 'Max Assurance', near: dir, score: 35, meta: { voted } });

    const weight = weigh(agree) + (htf === dir ? 1 : 0);
    if (full.length < minFull || weight < minVotes)
      return this.wait(['Agreement ' + weight.toFixed(1) + ' of ' + minVotes + ' (' + full.length + ' fired, need ' + minFull + ') — ' + named],
        { model: 'Max Assurance', near: dir, score: Math.round(Math.min(70, weight / minVotes * 60)),
          reasons: agree.map(v => v.name + ' agrees'), meta: { voted } });

    /* ---- context on this timeframe (bonus only) ---- */
    const i = c.length - 1, close = c.map(x => x.close);
    const adx = IND.adx(c, 14).adx[i], rsi = IND.rsi(close, 14)[i];
    const up = dir > 0;
    const rsiOk = rsi != null && (up ? rsi >= 40 && rsi <= 70 : rsi >= 30 && rsi <= 60);
    const base = full.reduce((a, v) => a + v.score, 0) / full.length;
    let score = base + 8 * (weight - minVotes) - 12 * weigh(against);
    if (adx != null && adx >= 25) score += 4;
    if (rsiOk) score += 3;
    score = Math.max(0, Math.min(100, Math.round(score)));
    if (score < minScore)
      return this.wait(['Scored ' + score + ' of 100, below the ' + minScore + ' this bot needs — ' + named],
        { score, near: dir, model: 'Max Assurance', reasons: agree.map(v => v.name + ' agrees'), meta: { voted } });

    /* ---- geometry: Triple's level stop if it fired, else the strongest ---- */
    const lead = full.find(v => v.name === 'Triple') || full[0];
    const g = lead.sig;
    if (![g.entry, g.sl, g.tp].every(v => Number.isFinite(v) && v > 0))
      return this.wait([lead.name + ' fired without usable levels'], { model: 'Max Assurance', near: dir, score, meta: { voted } });
    const risk = Math.abs(g.entry - g.sl), rMul = risk > 0 ? Math.abs(g.tp - g.entry) / risk : 0;

    /* ---- conviction → size ---- */
    let riskMult = 1 + 0.5 * (weight - minVotes) + (score >= 90 ? 0.5 : 0);
    riskMult = Math.max(1, Math.min(maxMult, +riskMult.toFixed(2)));

    const reasons = ['Agreement ' + weight.toFixed(1) + ': ' + named]
      .concat(htf === dir ? [htfNote + ' — with the trade'] : [htfNote])
      .concat(against.length ? ['Leaning against: ' + against.map(v => v.name).join(', ')] : [])
      .concat(adx != null && adx >= 25 ? ['ADX ' + adx.toFixed(1) + ' — the move has strength'] : [])
      .concat(rsiOk ? ['RSI ' + rsi.toFixed(0) + ' has room'] : [])
      .concat(['Levels from ' + lead.name + ' · ' + rMul.toFixed(2) + 'R'])
      .concat(['Conviction size ×' + riskMult.toFixed(2) + (riskMult > 1 ? ' — capped by this bot’s maximum risk per trade' : '')]);

    return {
      dir, score, entry: g.entry, sl: g.sl, tp: g.tp, tp1: g.tp1 || null,
      rMultiple: +rMul.toFixed(2), riskMult,
      model: 'Max Assurance (' + full.length + ' fired, ' + weight.toFixed(1) + ' votes)',
      reasons, failed: [],
      factors: Object.assign({ conviction: true, htf: htf === dir },
        agree.reduce((a, v) => { a['agrees:' + v.name] = true; return a; }, {})),
      meta: { votes: +weight.toFixed(1), fired: full.length, riskMult, lead: lead.name, voted, htf,
              adx: adx == null ? null : +adx.toFixed(1), rsi: rsi == null ? null : +rsi.toFixed(0),
              leadMeta: g.meta || {} },
    };
  },
};

/* SMA over an array that may contain leading nulls — used by the CM MACD signal line */
IND.smaOver_ = IND.smaOver_ || function(vals, n){
  const out = new Array(vals.length).fill(null);
  let sum = 0, cnt = 0;
  for (let i = 0; i < vals.length; i++){
    if (vals[i] == null) continue;
    sum += vals[i]; cnt++;
    if (cnt > n && vals[i - n] != null){ sum -= vals[i - n]; cnt = n; }
    if (cnt === n) out[i] = sum / n;
  }
  return out;
};
