/* ASTRA Terminal — bots made for US shares.

   Every other bot in ASTRA was built for markets that trade (almost) around
   the clock: crypto, forex, gold, indices. A US share is different. It has
   ONE session a day (09:30–16:00 New York time), an overnight GAP between
   sessions, a volume pattern that is heavy at the open and the close, and a
   price that institutions measure against the day's VWAP. These five bots
   use exactly those things:

     US Stocks · Opening-range breakout   the first 30 minutes set the range
     US Stocks · Gap fill                 a modest overnight gap drifts back
     US Stocks · VWAP trend pullback      trend days pull back to VWAP
     US Stocks · Last-hour momentum       the day's direction carries into the close
     US Stocks · RSI(2) dip               Connors' classic, on shares

   The indicators they need (New York clock, session VWAP, the opening range,
   the previous close, the overnight gap, relative volume) are computed here.
   Every rule is also a signal in the Strategy Checker (family "US stocks"),
   so it is measured against a random entry before you trust it.

   They only open trades inside the regular session and never hold a day
   trade overnight (each has a time limit that ends it before the close).
   Paper, like every bot, until you arm it on the Live Desk. */
const USStocks = {

  /* ---------- the New York clock ---------- */
  _off: {},
  /* minutes between UTC and New York on a given UTC day (−240 summer, −300 winter) */
  nyOffsetMin(utcSec){
    const day = Math.floor(utcSec / 86400);
    if (this._off[day] != null) return this._off[day];
    let off = -300;
    try {
      const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour12: false, hour: '2-digit', minute: '2-digit' })
        .formatToParts(new Date((day * 86400 + 12 * 3600) * 1000));
      const h = +parts.find(p => p.type === 'hour').value, m = +parts.find(p => p.type === 'minute').value;
      off = (h * 60 + m) - 12 * 60;
    } catch(e){}
    return this._off[day] = off;
  },

  /* European summer time: last Sunday of March 01:00 UTC → last Sunday of October 01:00 UTC */
  _eu: {},
  euSummer(utcSec){
    const y = new Date(utcSec * 1000).getUTCFullYear();
    if (!this._eu[y]){
      const lastSun = m => { const d = new Date(Date.UTC(y, m + 1, 0, 1)); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.getTime() / 1000; };
      this._eu[y] = [lastSun(2), lastSun(9)];
    }
    return utcSec >= this._eu[y][0] && utcSec < this._eu[y][1];
  },
  /* the broker's clock at the time of a candle. JustMarkets runs on Eastern European
     time (UTC+2, +3 in summer); today's offset alone would put every winter candle an
     hour off, so the offset follows the European summer-time dates */
  brokerOffsetAt(raw){
    const now = (typeof Feed !== 'undefined' && Feed.bridgeClock && Feed.bridgeClock.offset != null) ? Feed.bridgeClock.offset : 10800;
    if (now !== 10800 && now !== 7200) return now;                        /* not an EET server — keep it as it is */
    return this.euSummer(raw - 7200) ? 10800 : 7200;
  },

  /* ---------- the indicators ---------- */
  prepare(A){
    const c = A.c, n = c.length;
    if (A.ny) return A;
    const nyMin = new Array(n), nyDay = new Array(n);
    for (let i = 0; i < n; i++){
      const raw = c[i].rawTime || c[i].time;
      const utc = raw - this.brokerOffsetAt(raw);
      const local = utc + this.nyOffsetMin(utc) * 60;
      nyDay[i] = Math.floor(local / 86400);
      nyMin[i] = Math.floor((local - nyDay[i] * 86400) / 60);
    }
    A.ny = { min: nyMin, day: nyDay };
    const OPEN = 570, OR_END = 600, CLOSE = 960;               /* 09:30, 10:00, 16:00 */
    const reg = i => nyMin[i] >= OPEN && nyMin[i] < CLOSE;
    A.usReg = c.map((_, i) => reg(i));
    A.e9 = IND.ema(A.close, 9);
    /* session VWAP (from 09:30), the opening range, the day's open and the previous regular close */
    A.svwap = new Array(n).fill(null);
    A.orHi = new Array(n).fill(null); A.orLo = new Array(n).fill(null);
    A.dOpen = new Array(n).fill(null); A.prevClose = new Array(n).fill(null);
    let day = null, pv = 0, vv = 0, oh = -Infinity, ol = Infinity, dOpen = null, lastRegClose = null, prevDayClose = null;
    for (let i = 0; i < n; i++){
      if (nyDay[i] !== day){
        if (day != null && lastRegClose != null) prevDayClose = lastRegClose;
        day = nyDay[i]; pv = 0; vv = 0; oh = -Infinity; ol = Infinity; dOpen = null; lastRegClose = null;
      }
      if (!reg(i)) continue;
      const b = c[i], vol = Math.max(1, b.volume || 1), tp = (b.high + b.low + b.close) / 3;
      if (dOpen == null) dOpen = b.open;
      pv += tp * vol; vv += vol;
      A.svwap[i] = pv / vv;
      if (nyMin[i] < OR_END){ oh = Math.max(oh, b.high); ol = Math.min(ol, b.low); }
      else if (oh > -Infinity){ A.orHi[i] = oh; A.orLo[i] = ol; }
      A.dOpen[i] = dOpen; A.prevClose[i] = prevDayClose;
      lastRegClose = b.close;
    }
    /* overnight gap in % and the move since yesterday's close */
    A.gapPct = A.dOpen.map((o, i) => o != null && A.prevClose[i] > 0 ? (o - A.prevClose[i]) / A.prevClose[i] * 100 : null);
    A.dayPct = A.close.map((v, i) => A.prevClose[i] > 0 && A.usReg[i] ? (v - A.prevClose[i]) / A.prevClose[i] * 100 : null);
    /* relative volume: this candle against the average of the last 20 regular-session candles */
    A.rvol = new Array(n).fill(null);
    const q = [];
    for (let i = 0; i < n; i++){
      if (!A.usReg[i]) continue;
      if (q.length >= 10) A.rvol[i] = (c[i].volume || 0) / (q.reduce((a, b) => a + b, 0) / q.length || 1);
      q.push(c[i].volume || 0); if (q.length > 20) q.shift();
    }
    return A;
  },

  /* helpers read on the closed candle j */
  inHours(A, j, from, to){ return A.ny && A.usReg[j] && A.ny.min[j] >= from && A.ny.min[j] < to; },
  firstToday(A, j, test){
    for (let k = j - 1; k > 0 && A.ny.day[k] === A.ny.day[j]; k--) if (A.usReg[k] && test(k)) return false;
    return true;
  },

  /* ---------- the rules ---------- */
  EVENTS: [
    /* Opening-range breakout: the first close outside the 09:30–10:00 range, before noon, on above-average volume, on the right side of VWAP */
    ['usOrbUp', 'US · Opening-range breakout up (30 min, rising volume)', 'usstocks', 1, (A, j) => USStocks.inHours(A, j, 600, 720) && A.orHi[j] != null && A.c[j].close > A.orHi[j] && A.rvol[j] >= 1.3 && A.c[j].close > A.svwap[j] && USStocks.firstToday(A, j, k => A.orHi[k] != null && A.c[k].close > A.orHi[k])],
    ['usOrbDown', 'US · Opening-range breakout down (30 min, rising volume)', 'usstocks', -1, (A, j) => USStocks.inHours(A, j, 600, 720) && A.orLo[j] != null && A.c[j].close < A.orLo[j] && A.rvol[j] >= 1.3 && A.c[j].close < A.svwap[j] && USStocks.firstToday(A, j, k => A.orLo[k] != null && A.c[k].close < A.orLo[k])],
    /* Gap fill: a modest gap (0.4–2.5 %), still open after 09:45, and the first candle that turns back toward yesterday's close */
    ['usGapFillUp', 'US · Gap down 0.4–2.5 % turning back up (gap fill)', 'usstocks', 1, (A, j) => USStocks.inHours(A, j, 585, 660) && A.gapPct[j] != null && A.gapPct[j] <= -0.4 && A.gapPct[j] >= -2.5 && A.c[j].close < A.prevClose[j] && A.c[j].close > A.c[j].open && A.c[j].close > A.c[j - 1].high && USStocks.firstToday(A, j, k => A.c[k].close > A.c[k].open && A.c[k].close > A.c[k - 1].high)],
    ['usGapFillDown', 'US · Gap up 0.4–2.5 % turning back down (gap fill)', 'usstocks', -1, (A, j) => USStocks.inHours(A, j, 585, 660) && A.gapPct[j] != null && A.gapPct[j] >= 0.4 && A.gapPct[j] <= 2.5 && A.c[j].close > A.prevClose[j] && A.c[j].close < A.c[j].open && A.c[j].close < A.c[j - 1].low && USStocks.firstToday(A, j, k => A.c[k].close < A.c[k].open && A.c[k].close < A.c[k - 1].low)],
    /* VWAP trend pullback: a trend day (six candles on one side of VWAP, EMA 9 over 20), a touch of VWAP / EMA 20, a close back in the trend */
    ['usVwapPullUp', 'US · Trend day pulls back to VWAP, closes up', 'usstocks', 1, (A, j) => USStocks.inHours(A, j, 630, 900) && A.svwap[j] != null && [1, 2, 3, 4, 5, 6].every(k => A.svwap[j - k] != null && A.c[j - k].close > A.svwap[j - k]) && A.e9[j] > A.e20[j] && A.c[j].low <= Math.max(A.svwap[j], A.e20[j]) && A.c[j].close > A.e9[j] && A.c[j].close > A.c[j].open],
    ['usVwapPullDown', 'US · Trend day pulls back to VWAP, closes down', 'usstocks', -1, (A, j) => USStocks.inHours(A, j, 630, 900) && A.svwap[j] != null && [1, 2, 3, 4, 5, 6].every(k => A.svwap[j - k] != null && A.c[j - k].close < A.svwap[j - k]) && A.e9[j] < A.e20[j] && A.c[j].high >= Math.min(A.svwap[j], A.e20[j]) && A.c[j].close < A.e9[j] && A.c[j].close < A.c[j].open],
    /* Last-hour momentum: the first candle after 15:00 on a day already up / down more than 1 %, on the same side of VWAP */
    ['usPowerUp', 'US · Day up >1 % at 15:00 — ride it into the close', 'usstocks', 1, (A, j) => USStocks.inHours(A, j, 900, 930) && A.dayPct[j] > 1 && A.c[j].close > A.svwap[j] && USStocks.firstToday(A, j, k => A.ny.min[k] >= 900)],
    ['usPowerDown', 'US · Day down >1 % at 15:00 — ride it into the close', 'usstocks', -1, (A, j) => USStocks.inHours(A, j, 900, 930) && A.dayPct[j] < -1 && A.c[j].close < A.svwap[j] && USStocks.firstToday(A, j, k => A.ny.min[k] >= 900)],
    /* Connors RSI(2), on shares, only inside the session */
    ['usRsi2Buy', 'US · RSI(2) under 10 above the 200 SMA (shares)', 'usstocks', 1, (A, j) => USStocks.inHours(A, j, 600, 930) && A.sma200 && A.sma200[j] != null && A.c[j].close > A.sma200[j] && A.rsi2 && A.rsi2[j] < 10 && !(A.rsi2[j - 1] < 10)],
    ['usRsi2Sell', 'US · RSI(2) over 90 below the 200 SMA (shares)', 'usstocks', -1, (A, j) => USStocks.inHours(A, j, 600, 930) && A.sma200 && A.sma200[j] != null && A.c[j].close < A.sma200[j] && A.rsi2 && A.rsi2[j] > 90 && !(A.rsi2[j - 1] > 90)],
  ],

  /* ---------- the bots ----------
     stop/tp in ATR; target 'prev' = yesterday's close (the gap is filled). A
     time limit in candles keeps every trade inside the day. */
  BOTS: [
    { id: 'us_orb', name: 'US Stocks · Opening-range breakout', ev: ['usOrbUp', 'usOrbDown'], tf: '5m', stop: 1.2, tp: 2.4, bars: 42,
      src: 'Toby Crabel (1990); Zarattini, Barbon & Aziz, “A Profitable Day Trading Strategy for the U.S. Equity Market” (2024) — opening-range breakouts on US shares with unusual volume', kind: 'opening-range breakout',
      how: 'The high and low of the first 30 minutes (09:30–10:00 New York) are the range. The first 5-minute close above it — before noon, on at least 1.3× the recent volume and above the session VWAP — is bought; the mirror is sold. Ends by itself about 3½ hours later.' },
    { id: 'us_gap', name: 'US Stocks · Gap fill', ev: ['usGapFillUp', 'usGapFillDown'], tf: '5m', stop: 1.0, tp: 'prev', bars: 36,
      src: 'Studies of price gaps in US shares (e.g. Caporale & Plastun) — modest gaps are filled more often than large ones; large gaps on news often run', kind: 'gap fade',
      how: 'Only gaps of 0.4 % to 2.5 % (big news gaps are left alone). After 09:45 New York, the first candle that turns back toward yesterday’s close — closing through the previous candle — is taken, with yesterday’s close as the target.' },
    { id: 'us_vwap', name: 'US Stocks · VWAP trend pullback', ev: ['usVwapPullUp', 'usVwapPullDown'], tf: '5m', stop: 1.2, tp: 2.0, bars: 48,
      src: 'VWAP as the institutional benchmark; Zarattini & Aziz, “Volume Weighted Average Price (VWAP): The Holy Grail for Day Trading Systems” (2023)', kind: 'trend pullback',
      how: 'A trend day: six candles in a row on one side of the session VWAP and EMA 9 above EMA 20. When price dips back to VWAP (or EMA 20) and closes back in the trend direction, it is taken — between 10:30 and 15:00 New York.' },
    { id: 'us_power', name: 'US Stocks · Last-hour momentum', ev: ['usPowerUp', 'usPowerDown'], tf: '15m', stop: 1.0, tp: 1.5, bars: 3,
      src: 'Gao, Han, Li & Zhou, “Market Intraday Momentum”, Journal of Financial Economics (2018); Baltussen, Da, Lammers & Martens (2021)', kind: 'intraday momentum',
      how: 'At 15:00 New York, a share already more than 1 % up on yesterday’s close and above its VWAP is bought for the last hour (the mirror is sold). The research found the day’s direction tends to carry into the close. Closed before 16:00 by the time limit.' },
    { id: 'us_rsi2', name: 'US Stocks · RSI(2) dip', ev: ['usRsi2Buy', 'usRsi2Sell'], tf: '1h', stop: 2.0, tp: 1.0, bars: 21,
      src: 'Larry Connors & Cesar Alvarez, “Short Term Trading Strategies That Work” — first published on US shares and ETFs', kind: 'mean reversion',
      how: 'A share above its 200-hour average (a long up-trend) whose 2-period RSI has just dropped under 10 is bought for the bounce; the mirror is sold in a down-trend. Only inside the session.' },
  ],

  toBot(d){
    const byId = id => Checker.EVENTS.find(e => e.id === id);
    const tfMin = { '5m': 5, '15m': 15, '1h': 60 }[d.tf] || 15;
    return {
      id: d.id, name: d.name, research: true, usStocks: true,
      blurb: d.how + ' Source: ' + d.src + '. Stop ' + d.stop + '× ATR, target ' + (d.tp === 'prev' ? 'yesterday’s close' : d.tp + '× ATR') + ', ends after ' + d.bars + ' candles. Made for US shares — paper until you arm it.',
      defaults: { tf: d.tf, tfAuto: false, minScore: 0, maxOpen: 3, groups: ['stocks'], timeLimitBars: d.bars },
      warmup: 260,
      guide: { icon: '🇺🇸', tagline: d.name.replace('US Stocks · ', '') + ' — a ' + d.kind + ' strategy made for US shares.',
        tags: ['US shares', d.kind, d.tf], steps: [
          ['📖', 'Where it comes from', d.src],
          ['📐', 'The rule', d.how],
          ['🕤', 'New York hours only', 'It reads the candles on the New York clock (summer and winter time handled) and only opens trades inside the regular session, 09:30–16:00. A day trade never stays open overnight: after ' + d.bars + ' candles (' + Math.round(d.bars * tfMin / 60 * 10) / 10 + ' h) it is closed.'],
          ['🎯', 'Stop and target', 'Stop ' + d.stop + '× the average candle range (ATR 14), target ' + (d.tp === 'prev' ? 'yesterday’s closing price — the gap filled' : d.tp + '× ATR') + '.'],
          ['🔬', 'Checked by the Strategy Checker', 'Its rules are also signals in the Strategy Checker (family “US stocks”) and are measured against a random entry there. Tick the Stocks market in the checker to study them.']],
        settings: [], use: ['It trades only the Stocks market by default — you can narrow it to a few shares in its Markets card.', 'US shares trade only on weekdays in the New York session; outside it the bot waits.'],
        honest: 'Published results come from clean US exchange data and often from a hand-picked list of shares “in play”. A CFD adds a spread, and the broker sends a tick volume, not the exchange volume. Let the checker and the paper record decide.' },
      signal: (w, cfg) => {
        const c = w.slice(0, -1);                                            /* the last candle is still forming */
        if (c.length < 262) return { dir: 0, failed: ['warming up'] };
        const A = Checker.prepare(c.slice(-460));
        const j = A.c.length - 1, atr = A.atr14[j];
        if (!(atr > 0)) return { dir: 0, failed: ['ATR not ready'] };
        if (!A.usReg[j]) return { dir: 0, failed: ['Outside the New York session (09:30–16:00)'] };
        for (const id of d.ev){
          const ev = byId(id); if (!ev) continue;
          let on = false; try { on = ev.fn(A, j); } catch(e){ on = false; }
          if (!on) continue;
          const px = A.c[j].close, dir = ev.dir;
          const sl = px - dir * d.stop * atr;
          let tp = d.tp === 'prev' ? A.prevClose[j] : px + dir * d.tp * atr;
          if (!(tp > 0) || (tp - px) * dir < 0.8 * atr) tp = px + dir * 0.8 * atr;       /* never a target smaller than 0.8 ATR */
          return { dir, score: 75, entry: px, sl, tp, model: ev.label, reasons: [ev.label, d.kind + ' · ' + d.src] };
        }
        return { dir: 0, failed: ['No ' + d.name.replace('US Stocks · ', '') + ' setup on the last closed candle'] };
      },
    };
  },

  install(){
    const build = Checker.buildEvents.bind(Checker);
    Checker.buildEvents = () => {
      const E = build();
      for (const [id, label, family, dir, fn] of this.EVENTS) if (!E.some(e => e.id === id)) E.push({ id, label, family, dir, fn });
      return E;
    };
    const prep = Checker.prepare.bind(Checker);
    Checker.prepare = (c) => this.prepare(prep(c));
    Checker.EVENTS = null; Checker.buildEvents();
    for (const d of this.BOTS){
      if (BOT_BY_ID[d.id]) continue;
      const bot = this.toBot(d);
      BOTS.push(bot); BOT_BY_ID[bot.id] = bot;
    }
  },
};
USStocks.install();
