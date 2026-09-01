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

      const stopDist = Math.max(1.2 * A, px * 0.0015);
      return {
        dir, score, reasons, failed, factors,
        entry: px,
        sl: up ? px - stopDist : px + stopDist,
        tp: up ? px + 1.5 * stopDist : px - 1.5 * stopDist,
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
    if (agrees){ score += 10; factors.trendAgrees = true;
      reasons.push('Direction agrees with the EMA20/EMA50 trend (+10)'); }
    else { score -= 6; reasons.push('Direction fights the EMA20/EMA50 trend (−6)'); }

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
    if (!(atrPct > 0 && atrPct <= 2.5)) failed.push('ATR ' + atrPct.toFixed(2) + '% is outside the tradable band');

    const min = cfg.minScore != null ? cfg.minScore : 60;
    if (failed.length) return this.wait(failed, { score, model: pat.name });
    if (score < min)
      return this.wait(['Scored ' + score.toFixed(0) + ', below the minimum of ' + min], { score, model: pat.name, reasons });

    const px = a.close;
    const sl = pat.dir > 0
      ? Math.min(a.low, p.low) - 0.15 * A
      : Math.max(a.high, p.high) + 0.15 * A;
    const stopDist = Math.abs(px - sl);
    return {
      dir: pat.dir, score: Math.round(score), entry: px, sl,
      tp: pat.dir > 0 ? px + 1.35 * stopDist : px - 1.35 * stopDist,
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
      const sl = up ? swing - 0.2 * A : swing + 0.2 * A;
      const stopDist = Math.abs(px - sl);
      const scoreParts = ['ribbon', 'slowSlope', 'pullback', 'reclaim', 'macd', 'macdHigher', 'rsi'];
      const score = Math.round(scoreParts.filter(k => factors[k]).length / scoreParts.length * 100);

      return {
        dir, score, reasons, failed, factors,
        entry: px, sl,
        tp1: up ? px + stopDist : px - stopDist,            // 1R — take half, stop to breakeven
        tp: up ? px + 1.5 * stopDist : px - 1.5 * stopDist, // final target
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
