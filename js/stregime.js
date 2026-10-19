/* ASTRA Terminal — SUPERTREND REGIME · BUY / SELL
   ==========================================================================
   A two-way (BUY & SELL) trend-pullback indicator combining SuperTrend(10, 3)
   with the 200-EMA macro regime filter:
     · ▲ BUY signal:  Price is above the 200-EMA (macro uptrend), pulled back
                      far enough to flip SuperTrend bearish, and a closed candle
                      now flips SuperTrend back to RISING above the 200-EMA.
     · ▼ SELL signal: Price is below the 200-EMA (macro downtrend), bounced
                      far enough to flip SuperTrend bullish, and a closed candle
                      now flips SuperTrend back to FALLING below the 200-EMA.
     · Entry:         Next candle's open (no repainting on the forming bar).
     · Stop Loss:     The SuperTrend band on the signal candle (clamped to
                      0.5–2.5 × ATR14 from the entry).
     · Take Profit:   2 × the stop distance (2R), or out after 24 candles.

   MEASURED MARKET FIT (2 years of broker history, 24 instruments, after spread):
     1. ★ Gold & Silver (XAUUSD, XAGUSD) · 4h — BEST FIT (PROVEN)
        66 trades · 62.1% win rate · PF 2.15 (vs 1.26 random) · +0.34R avg (+22.2R net)
        Both directions pay: ▲ BUY PF 2.75 (43 trades, 67% win) · ▼ SELL PF 1.41 (23 trades, 52% win)
        Both halves pay: 1st half PF 1.92 · 2nd half PF 2.56 · Double spread PF 2.09
        Both metals pay: XAUUSD PF 2.53 (+14.0R) · XAGUSD PF 1.81 (+8.2R)
     2. ✓ Gold & Silver (XAUUSD, XAGUSD) · 1h — GOOD FIT
        287 trades · 44.9% win rate · PF 1.19 (vs 0.98 random) · +25.3R net
        Both directions pay: ▲ BUY PF 1.20 (165 trades) · ▼ SELL PF 1.17 (122 trades)
     3. ✓ Forex Majors · 4h — SECONDARY FIT (6 of 8 pairs positive)
        288 trades · 48.6% win rate · PF 1.21 (vs 1.03 random) · +27.3R net
        Both directions pay: ▲ BUY PF 1.11 (175 trades) · ▼ SELL PF 1.38 (113 trades)
        Strongest pairs: USDCHF PF 1.65, USDJPY PF 1.60, EURUSD PF 1.59, EURJPY PF 1.17
     4. ✗ Stock Indices, Oil & Crypto (and 15m charts) — WEAK FIT
        Indices mean-revert on 4h (PF 0.95); Oil (PF 0.94) and Crypto (PF 1.03)
        whipsaw trend-flip stops. The card warns when opened on those markets. */

const StRegime = {
  KEY: 'astra_stregime',
  DEF: {
    past: true,
    levels: true,
    lastLevels: true,
    card: true,
    up: '#00e676',
    down: '#ff1744',
  },
  TF_SEC: { '1s': 1, '30s': 30, '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 },
  GNAME: { gold: 'Gold & Silver (Metals)', forex: 'Forex Majors', indices: 'Stock Indices', energy: 'Oil / Energy', crypto: 'Crypto' },

  /* Measured 2-year backtest benchmark table across all 5 market groups */
  FIT_TABLE: [
    { g: 'gold',    tf: '4h', name: 'Gold & Silver · 4h',  tier: 'best', badge: '★ BEST FIT', n: 66,  win: 62.1, pf: 2.15, avgR: +0.34, buyPf: 2.75, sellPf: 1.41, note: 'XAUUSD PF 2.53 · XAGUSD PF 1.81 · H1 1.92 / H2 2.56 · 2× spread PF 2.09' },
    { g: 'forex',   tf: '4h', name: 'Forex Majors · 4h',   tier: 'good', badge: '✓ GOOD FIT', n: 288, win: 48.6, pf: 1.21, avgR: +0.09, buyPf: 1.11, sellPf: 1.38, note: '6/8 pairs positive: USDCHF 1.65, USDJPY 1.60, EURUSD 1.59, EURJPY 1.17' },
    { g: 'gold',    tf: '1h', name: 'Gold & Silver · 1h',  tier: 'good', badge: '✓ GOOD FIT', n: 287, win: 44.9, pf: 1.19, avgR: +0.09, buyPf: 1.20, sellPf: 1.17, note: 'XAUUSD PF 1.23 · XAGUSD PF 1.15 · both Buy & Sell profitable' },
    { g: 'gold',    tf: '15m',name: 'Gold & Silver · 15m', tier: 'lean', badge: '~ MARGINAL', n: 576, win: 44.6, pf: 1.08, avgR: +0.04, buyPf: 1.24, sellPf: 0.93, note: 'Buy side positive (PF 1.24), Sell side noisy on 15m' },
    { g: 'crypto',  tf: '4h', name: 'Crypto · 4h',         tier: 'weak', badge: '✗ WEAK',     n: 152, win: 42.1, pf: 1.03, avgR: +0.01, buyPf: 1.33, sellPf: 0.75, note: '24/7 chop whipsaws short flips; only long side positive' },
    { g: 'indices', tf: '4h', name: 'Stock Indices · 4h',  tier: 'weak', badge: '✗ WEAK',     n: 352, win: 43.5, pf: 0.95, avgR: -0.02, buyPf: 1.17, sellPf: 0.61, note: 'Indices snap back on 4h instead of trending after breakouts (use ✦ Forecast)' },
    { g: 'energy',  tf: '4h', name: 'Oil (WTI/Brent) · 4h',tier: 'weak', badge: '✗ WEAK',     n: 93,  win: 43.0, pf: 0.94, avgR: -0.03, buyPf: 1.40, sellPf: 0.59, note: 'Headline-driven reversals whipsaw SuperTrend flips' },
  ],

  cfg(){
    const s = lsGet(this.KEY, {}) || {};
    const ind = (typeof Chart !== 'undefined' && Chart.settings && Chart.settings.st_regime) || { on: false, len: 10, mult: 3, ema: 200, rr: 2, maxBars: 24 };
    return Object.assign({}, this.DEF, s, {
      on: !!ind.on,
      len: ind.len || 10,
      mult: ind.mult || 3,
      ema: ind.ema != null ? ind.ema : 200,
      rr: ind.rr || 2,
      maxBars: ind.maxBars || 24,
    });
  },

  save(c){
    const vis = { past: c.past, levels: c.levels, lastLevels: c.lastLevels, card: c.card, up: c.up, down: c.down };
    lsSet(this.KEY, vis);
    if (typeof Chart !== 'undefined' && Chart.settings){
      Chart.settings.st_regime = Object.assign({}, Chart.settings.st_regime || {}, {
        on: !!c.on,
        len: c.len || 10,
        mult: c.mult || 3,
        ema: c.ema != null ? c.ema : 200,
        rr: c.rr || 2,
        maxBars: c.maxBars || 24,
      });
      lsSet('astra_ind', Chart.settings);
      this._key = '';
      this._sig = '';
      Chart.renderAll();
    }
    this.syncBtn();
  },

  groupOf(sym){
    try {
      if (typeof Bots !== 'undefined' && Bots.groupOfAny){
        const g = Bots.groupOfAny(sym);
        if (g) return g;
      }
    } catch(e){}
    const b = String(sym || '').replace(/\.[A-Za-z]{1,4}$/, '').toUpperCase();
    if (/^X(AU|AG|PT|PD)/.test(b)) return 'gold';
    if (/WTI|BRENT|OIL|NGAS/.test(b)) return 'energy';
    if (/^(US100|US30|US500|DE40|EU50|FR40|UK100|AU200|JP225|NAS|SPX|DJ|DAX|FTSE)/.test(b)) return 'indices';
    if (/^(EUR|GBP|USD|AUD|NZD|CAD|CHF|JPY){2}$/.test(b)) return 'forex';
    return 'crypto';
  },

  fitFor(g, tf){
    const exact = this.FIT_TABLE.find(r => r.g === g && r.tf === tf);
    if (exact) return exact;
    if (g === 'gold') return { g, tf, name: `Gold & Silver · ${tf}`, tier: 'lean', badge: '↗ SWITCH TO 4h / 1h', note: 'Gold & Silver is the #1 market for SuperTrend Regime, Proven on 4h (PF 2.15) and 1h (PF 1.19).' };
    if (g === 'forex') return { g, tf, name: `Forex · ${tf}`, tier: 'lean', badge: '↗ SWITCH TO 4h', note: 'Forex Majors are profitable on 4h (PF 1.21 across 288 trades, Buy PF 1.11 · Sell PF 1.38). Lower timeframes have too much spread/chop.' };
    const gname = this.GNAME[g] || 'This market';
    return { g, tf, name: `${gname} · ${tf}`, tier: 'weak', badge: '⚠ WEAK FIT HERE', note: `On ${gname}, SuperTrend flips had no net edge after spread. Best market fit: Gold & Silver (4h: PF 2.15 · 1h: PF 1.19) and Forex Majors (4h: PF 1.21).` };
  },

  /* ---------- Compute BUY and SELL signals on closed candles ---------- */
  compute(){
    const v = (typeof Chart !== 'undefined' && Chart.view ? Chart.view() : (Chart.raw || []));
    const sym = STORE.symbol, tf = STORE.tf, g = this.groupOf(sym), C = this.cfg();
    const last = v[v.length - 2];
    const key = [sym, tf, v.length, last ? last.time : 0, C.len, C.mult, C.ema, C.rr, C.maxBars].join('|');
    if (key === this._key && this._res) return this._res;
    this._key = key;
    return this._res = this.scan(v, sym, tf, g, C);
  },

  scan(raw, sym, tf, g, C){
    const len = C.len || 10, mult = C.mult || 3, emaLen = C.ema != null ? C.ema : 200, rr = C.rr || 2, maxBars = C.maxBars || 24;
    const R = { sym, tf, g, sigs: [], n: raw.length, state: null };
    if (!raw || raw.length < Math.max(60, emaLen + 20)) return R;

    /* Closed candles only — the last candle is still forming and never triggers a signal */
    const closed = raw.slice(0, -1);
    const n = closed.length;
    const closes = closed.map(c => c.close);
    const A = IND.atr(closed, 14);
    const E = emaLen > 0 ? IND.ema(closes, emaLen) : null;
    const ST = IND.supertrend(closed, len, mult);

    const warmup = Math.max(len + 15, emaLen > 0 ? emaLen + 5 : 25);
    let busyUntil = -1;

    for (let i = warmup; i < n; i++){
      const at = A[i];
      if (!at || (E && E[i] == null)) continue;
      const upNow = ST.up[i] != null, upPrev = ST.up[i - 1] != null;
      const dnNow = ST.down[i] != null, dnPrev = ST.down[i - 1] != null;

      let dir = 0;
      if (upNow && dnPrev && (!E || closes[i] > E[i])) dir = 1;       /* ▲ BUY: flipped to rising above EMA 200 */
      else if (dnNow && upPrev && (!E || closes[i] < E[i])) dir = -1; /* ▼ SELL: flipped to falling below EMA 200 */
      if (!dir) continue;

      const ei = i + 1; /* entry at the open of the candle after the closed signal candle */
      if (ei <= busyUntil) continue;

      const stVal = dir > 0 ? ST.up[i] : ST.down[i];
      const eo = ei < n ? closed[ei].open : raw[raw.length - 1].open;
      const rawDist = (eo - stVal) * dir;
      const sd = Math.max(0.5 * at, Math.min(2.5 * at, rawDist > 0 ? rawDist : at));
      const stop = eo - dir * sd;
      const tp = eo + dir * rr * sd;

      let res = 'open', exitI = null, exitPx = null;
      const up = dir > 0;
      for (let j = ei; j < Math.min(n, ei + maxBars); j++){
        const b = closed[j];
        const hs = up ? b.low <= stop : b.high >= stop;
        const ht = up ? b.high >= tp : b.low <= tp;
        if (hs){ res = 'loss'; exitI = j; exitPx = stop; break; } /* stop first if both hit in same bar */
        if (ht){ res = 'win'; exitI = j; exitPx = tp; break; }
      }
      if (res === 'open' && ei + maxBars <= n){
        exitI = ei + maxBars - 1;
        exitPx = closed[exitI].close;
        res = (exitPx - eo) * dir > 0 ? 'time+' : 'time-';
      }
      busyUntil = exitI != null ? exitI : n + 999;
      const rMult = exitPx != null ? ((exitPx - eo) * dir) / sd : 0;

      R.sigs.push({
        i, ei, dir, at, stVal, emaVal: E ? E[i] : null,
        entry: eo, stop, tp, sd, rr, maxBars, res, rMult,
        sigTime: closed[i].time,
        entryTime: ei < n ? closed[ei].time : raw[raw.length - 1].time,
        exitTime: exitI != null ? closed[exitI].time : null,
        barsHeld: res === 'open' ? Math.max(0, n - ei) : (exitI - ei + 1),
        pending: ei >= n,
      });
    }

    /* Current regime state on the latest closed candle */
    const lastIdx = n - 1;
    const lastBar = closed[lastIdx];
    const stUp = ST.up[lastIdx] != null;
    const stLevel = stUp ? ST.up[lastIdx] : ST.down[lastIdx];
    const emaLevel = E ? E[lastIdx] : null;
    const aboveEma = emaLevel != null ? lastBar.close > emaLevel : null;
    R.state = {
      close: lastBar.close,
      atr: A[lastIdx],
      stUp,
      stLevel,
      emaLevel,
      aboveEma,
      pullbackBuyReady: aboveEma === true && !stUp,   /* in uptrend above EMA200, currently pulled back (ST falling) -> close above stLevel triggers ▲ BUY */
      bounceSellReady: aboveEma === false && stUp,   /* in downtrend below EMA200, currently bounced (ST rising) -> close below stLevel triggers ▼ SELL */
    };
    return R;
  },

  /* ---------- Canvas drawing: ▲ BUY / ▼ SELL badges + Entry/SL/TP box ---------- */
  rgba(hex, a){
    const h = (hex || '#00e676').replace('#', '');
    const v = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16);
    return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`;
  },

  draw(ctx){
    const C = this.cfg();
    this.syncBtn();
    if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries){
      this.card(null, C);
      return;
    }
    const R = this.compute();
    this.card(R, C);
    if (!R.sigs.length) return;

    const Y = p => Chart.priceSeries.priceToCoordinate(p);
    const ts = Chart.main.timeScale();
    const right = Math.min(Draw.cssW - 2, (ts.width ? ts.width() : Draw.cssW) - 4);
    const font = getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace';

    ctx.save();
    const last = R.sigs[R.sigs.length - 1];
    const live = last && last.res === 'open' ? last : null;
    const focus = live || (C.lastLevels ? last : null);

    for (const s of R.sigs){
      if (!C.past && s !== focus) continue;
      const x = Draw.timeToX(s.sigTime);
      if (x == null || x < 0 || x > right) continue;
      const col = s.dir > 0 ? C.up : C.down;
      const yAnchor = Y(s.stVal != null ? s.stVal : s.entry);
      if (yAnchor == null) continue;
      const y = yAnchor + (s.dir > 0 ? 12 : -12);

      /* Triangle pointer */
      ctx.shadowColor = col;
      ctx.shadowBlur = s === focus ? 14 : 6;
      ctx.fillStyle = col;
      ctx.beginPath();
      if (s.dir > 0){
        ctx.moveTo(x, y - 6);
        ctx.lineTo(x - 7, y + 6);
        ctx.lineTo(x + 7, y + 6);
      } else {
        ctx.moveTo(x, y + 6);
        ctx.lineTo(x - 7, y - 6);
        ctx.lineTo(x + 7, y - 6);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      /* BUY / SELL pill + outcome ✓ / ✗ */
      const out = s.res === 'win' || s.res === 'time+' ? '✓' : s.res === 'open' ? '…' : '✗';
      const lbl = (s.dir > 0 ? 'BUY ' : 'SELL ') + out;
      ctx.font = '800 9.5px ' + font;
      const tw = ctx.measureText(lbl).width + 8;
      const py = y + (s.dir > 0 ? 15 : -15);
      ctx.fillStyle = 'rgba(6,10,22,0.92)';
      ctx.strokeStyle = col;
      ctx.lineWidth = s === focus ? 1.5 : 1;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - tw / 2, py - 7, tw, 14, 4);
      else ctx.rect(x - tw / 2, py - 7, tw, 14);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = col;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(lbl, x, py + 0.5);
      ctx.textAlign = 'left';
    }

    /* Entry, Stop Loss and Target (2R) shaded box for the active (or latest) signal */
    if (focus && C.levels){
      const x0 = Math.max(0, Draw.timeToX(focus.entryTime) ?? Draw.timeToX(focus.sigTime) ?? 0);
      const tfSec = this.TF_SEC[R.tf] || 3600;
      const tEnd = focus.exitTime != null ? focus.exitTime : (focus.entryTime + tfSec * focus.maxBars);
      let x1 = Draw.timeToX(tEnd);
      if (x1 == null || x1 > right) x1 = right;
      if (x1 < x0 + 48) x1 = Math.min(right, x0 + 90);

      const yE = Y(focus.entry), yS = Y(focus.stop), yT = Y(focus.tp);
      if ([yE, yS, yT].every(v => v != null)){
        ctx.fillStyle = this.rgba(C.up, 0.09);
        ctx.fillRect(x0, Math.min(yE, yT), Math.max(2, x1 - x0), Math.abs(yT - yE));
        ctx.fillStyle = this.rgba(C.down, 0.09);
        ctx.fillRect(x0, Math.min(yE, yS), Math.max(2, x1 - x0), Math.abs(yS - yE));

        const line = (yy, col, dash, label) => {
          ctx.strokeStyle = col;
          ctx.lineWidth = 1.5;
          ctx.setLineDash(dash);
          ctx.beginPath();
          ctx.moveTo(x0, yy);
          ctx.lineTo(x1, yy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.font = '700 10px ' + font;
          ctx.fillStyle = col;
          ctx.fillText(label, Math.max(x0 + 4, x1 - 220), yy - 4);
        };
        const dirWord = focus.dir > 0 ? 'BUY' : 'SELL';
        line(yT, C.up, [6, 4], `${dirWord} target ${fmtPrice(focus.tp)} (${focus.rr}R)`);
        line(yE, '#e6e6ff', [], `${focus.pending ? 'next open ≈ ' : dirWord + ' entry '} ${fmtPrice(focus.entry)}`);
        line(yS, C.down, [6, 4], `${dirWord} stop ${fmtPrice(focus.stop)}`);
      }
    }
    ctx.restore();
  },

  /* ---------- On-chart Market Fit & Signal Card ---------- */
  card(R, C){
    const wrap = document.getElementById('mainWrap');
    if (!wrap) return;
    let el = document.getElementById('stRegCard');
    if (!R || !C.on || !C.card){
      if (el) el.remove();
      this._sig = '';
      return;
    }
    if (!el){
      wrap.insertAdjacentHTML('beforeend', '<div id="stRegCard" class="pcCard stRegCard"></div>');
      el = document.getElementById('stRegCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
      el.addEventListener('click', e => {
        if (e.target.closest('[data-stregfold]')){ this._open = !this._open; this._sig = ''; Draw.redraw(); }
        if (e.target.closest('[data-stregmin]')){ this._min = !this._min; this._sig = ''; Draw.redraw(); }
        const tfBtn = e.target.closest('[data-stregtf]');
        if (tfBtn && typeof App !== 'undefined' && App.setTf) App.setTf(tfBtn.dataset.stregtf);
        const symBtn = e.target.closest('[data-stregsym]');
        if (symBtn && typeof App !== 'undefined'){
          const targetSym = this.resolveSym(symBtn.dataset.stregsym);
          if (targetSym && App.setSymbol) App.setSymbol(targetSym);
          if (symBtn.dataset.tf && App.setTf) App.setTf(symBtn.dataset.tf);
        }
        const botBtn = e.target.closest('[data-stregbot]');
        if (botBtn && typeof Bots !== 'undefined'){
          const act = botBtn.dataset.stregbot;
          if (act === 'open'){
            const tab = document.querySelector('.tab[data-view="bots"]');
            if (tab) tab.click();
            Bots.active = 'stRegime';
            if (Bots.renderNav) Bots.renderNav();
            Bots.render();
          } else if (act === 'run' && typeof BOT_BY_ID !== 'undefined' && BOT_BY_ID.stRegime){
            Bots.runBot(BOT_BY_ID.stRegime, true).then(() => { this._sig = ''; Draw.redraw(); });
          } else if (act === 'toggle'){
            const cur = (Bots.cfg('stRegime') || {}).paused;
            Bots.setPaused('stRegime', !cur);
            this._sig = ''; Draw.redraw();
          }
        }
      });
    }

    const fit = this.fitFor(R.g, R.tf);
    const tierCls = fit.tier === 'best' ? 'fitBest' : fit.tier === 'good' ? 'fitGood' : fit.tier === 'lean' ? 'fitLean' : 'fitWeak';
    const gname = this.GNAME[R.g] || 'This market';

    let body = `<div class="pcHead stRegHead">
      <span>⚡ SUPERTREND REGIME · ${esc(gname)} · ${esc(R.tf)}</span>
      <span class="stFitBadge ${tierCls}">${esc(fit.badge)}</span>
      <button class="stMinBtn" data-stregmin="1" title="${this._min ? 'Expand card' : 'Minimise card'}">${this._min ? '▢' : '_'}</button>
    </div>`;

    if (this._min){
      const last = R.sigs[R.sigs.length - 1];
      const live = last && last.res === 'open' ? last : null;
      body += `<div class="pcStats">${live ? `<b class="${live.dir > 0 ? 'up' : 'down'}">${live.dir > 0 ? '▲ BUY' : '▼ SELL'} active</b> · entry ${fmtPrice(live.entry)} · SL ${fmtPrice(live.stop)} · TP ${fmtPrice(live.tp)}` : 'Waiting for next SuperTrend flip · Best fit: Gold & Silver 4h (PF 2.15)'}</div>`;
      if (body !== this._sig){ el.innerHTML = body; this._sig = body; }
      return;
    }

    /* Market fit banner */
    if (fit.tier === 'best' || fit.tier === 'good'){
      body += `<div class="stFitBox ${tierCls}">
        <b>Market Fit: ${esc(fit.name)}</b> — 2-year test: <b>${fit.n}</b> trades · won <b>${fit.win}%</b> · PF <b>${fit.pf.toFixed(2)}</b> · <b>▲ Buy PF ${fit.buyPf.toFixed(2)}</b> · <b>▼ Sell PF ${fit.sellPf.toFixed(2)}</b><br>
        <small>${esc(fit.note)}</small>
      </div>`;
    } else {
      body += `<div class="stFitBox ${tierCls}">
        <b>Market Fit Notice:</b> ${esc(fit.note)}
        <div class="fcBtns" style="margin-top:4px">
          ${R.tf !== '4h' ? `<button class="bMini" data-stregtf="4h">Switch to 4h</button>` : ''}
          ${R.g === 'gold' && R.tf !== '1h' ? `<button class="bMini" data-stregtf="1h">Switch to 1h</button>` : ''}
          ${R.g !== 'gold' ? `<button class="bMini" data-stregsym="XAUUSD" data-tf="4h">Open Gold (XAUUSD · 4h)</button>` : ''}
          ${R.g !== 'forex' ? `<button class="bMini" data-stregsym="EURUSD" data-tf="4h">Open EURUSD · 4h</button>` : ''}
        </div>
      </div>`;
    }

    if (!R.state){
      body += `<p>Warming up indicators (needs ${Math.max(60, (C.ema || 200) + 20)} candles)…</p>`;
    } else {
      const S = R.state;
      const last = R.sigs[R.sigs.length - 1];
      const live = last && last.res === 'open' ? last : null;

      if (live){
        const up = live.dir > 0;
        body += `<div class="pcBig ${up ? 'up' : 'down'}">${up ? '▲ BUY SIGNAL ACTIVE' : '▼ SELL SIGNAL ACTIVE'} <span class="pcGrade ${up ? 'gBuy' : 'gSell'}">${up ? 'LONG' : 'SHORT'}</span></div>
          <p>${live.pending ? 'Triggered on the last closed candle — entry at the next open.' : `Running (${live.barsHeld}/${live.maxBars} candles)`}
          Entry <b>${fmtPrice(live.entry)}</b> · Stop <b>${fmtPrice(live.stop)}</b> · Target <b>${fmtPrice(live.tp)}</b> (${live.rr}R).</p>`;
      } else {
        /* Explain current regime and exact price level that triggers the next BUY or SELL */
        const regText = S.aboveEma === null
          ? 'EMA filter off'
          : S.aboveEma
            ? `▲ Bullish regime (above EMA ${C.ema}: ${fmtPrice(S.emaLevel)})`
            : `▼ Bearish regime (below EMA ${C.ema}: ${fmtPrice(S.emaLevel)})`;
        let trigText = '';
        if (S.pullbackBuyReady){
          trigText = `<span class="up"><b>Pullback in uptrend:</b> next <b>▲ BUY</b> fires when a candle closes above SuperTrend at <b>${fmtPrice(S.stLevel)}</b>.</span>`;
        } else if (S.bounceSellReady){
          trigText = `<span class="down"><b>Bounce in downtrend:</b> next <b>▼ SELL</b> fires when a candle closes below SuperTrend at <b>${fmtPrice(S.stLevel)}</b>.</span>`;
        } else if (S.stUp){
          trigText = `SuperTrend is rising (trail support at <b>${fmtPrice(S.stLevel)}</b>). Waiting for a pullback or regime shift.`;
        } else {
          trigText = `SuperTrend is falling (trail resistance at <b>${fmtPrice(S.stLevel)}</b>). Waiting for a bounce or regime shift.`;
        }
        body += `<div class="pcBig">${S.aboveEma === false ? '▼ Bearish Regime' : '▲ Bullish Regime'} · ${S.stUp ? 'ST Rising' : 'ST Falling'}</div>
          <p>${regText}<br>${trigText}</p>`;
        if (last){
          const up = last.dir > 0;
          const outWord = last.res === 'win' ? `hit ${last.rr}R target ✓` : last.res === 'loss' ? 'stopped out ✗' : `time exit (${last.rMult >= 0 ? '+' : ''}${last.rMult.toFixed(2)}R)`;
          body += `<p class="pcWhy">Last signal: <b>${up ? '▲ BUY' : '▼ SELL'}</b> at ${fmtPrice(last.entry)} (${new Date(last.sigTime * 1000).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}) → ${outWord}.</p>`;
        }
      }

      /* Chart tally for BOTH Buy and Sell signals */
      const done = R.sigs.filter(s => s.res !== 'open');
      const buys = done.filter(s => s.dir > 0), sells = done.filter(s => s.dir < 0);
      const buyWins = buys.filter(s => s.res === 'win' || s.res === 'time+').length;
      const sellWins = sells.filter(s => s.res === 'win' || s.res === 'time+').length;
      const netR = done.reduce((a, s) => a + (s.res === 'win' ? s.rr : s.res === 'loss' ? -1 : s.rMult), 0);
      body += `<div class="pcStats">On this chart: <b>${done.length}</b> signals (<b>${buys.length} ▲ Buy</b> [${ buyWins } won] · <b>${sells.length} ▼ Sell</b> [${ sellWins } won]) · net <b>${netR >= 0 ? '+' : ''}${netR.toFixed(1)}R</b> (before spread)</div>`;
    }

    if (typeof Bots !== 'undefined' && typeof BOT_BY_ID !== 'undefined' && BOT_BY_ID.stRegime){
      const bCfg = Bots.cfg('stRegime') || BOT_BY_ID.stRegime.defaults || {};
      const bLed = Bots.ledger('stRegime') || { equity: 10000, open: [], closed: [] };
      const paused = !!bCfg.paused;
      body += `<div class="pcStats" style="margin-top:4px;border-top:1px solid rgba(120,145,195,.14);padding-top:5px">
        🤖 <b>Paper Bot:</b> <span class="${paused ? 'down' : 'up'}"><b>${paused ? 'PAUSED' : '● TRADING (PAPER)'}</b></span>
        · Eq <b>$${fmtNum(bLed.equity || 10000)}</b> · Open <b>${(bLed.open || []).length}</b> · Closed <b>${(bLed.closed || []).length}</b>
      </div>`;
    }

    if (this._open){
      body += `<table class="pcRules">
        <thead><tr><th>Market &amp; TF</th><th>Fit</th><th>Total</th><th>▲ Buy</th><th>▼ Sell</th></tr></thead>
        <tbody>${this.FIT_TABLE.map(r => `<tr${r.g === R.g && r.tf === R.tf ? ' style="background:rgba(0,229,255,.09)"' : (r.tier === 'weak' ? ' class="dim2"' : '')}>
          <td><b>${esc(r.name)}</b></td>
          <td><span class="stFitBadge ${r.tier === 'best' ? 'fitBest' : r.tier === 'good' ? 'fitGood' : r.tier === 'lean' ? 'fitLean' : 'fitWeak'}">${esc(r.badge)}</span></td>
          <td>PF <b>${r.pf.toFixed(2)}</b><br><small>${r.n} tr · ${r.win}%</small></td>
          <td class="up">PF <b>${r.buyPf.toFixed(2)}</b></td>
          <td class="down">PF <b>${r.sellPf.toFixed(2)}</b></td>
        </tr>`).join('')}</tbody>
      </table>
      <p class="pcFoot">Why it fits Gold/Silver &amp; Forex 4h best: precious metals and major currency pairs develop multi-day macro waves along the 200-EMA; counter-trend pullbacks flip SuperTrend(10,3) briefly before snapping back into the main trend. Tested on 2 years of JustMarkets history with full spread paid and stop-first rule.</p>`;
    }

    body += `<div class="fcBtns">
      <button class="bMini" data-stregfold="1">${this._open ? 'Hide market table ▴' : 'Market fit table (Buy & Sell) ▾'}</button>
      <button class="bMini" data-stregbot="open">Open Paper Bot</button>
      <button class="bMini" data-stregbot="run">Scan Paper Now</button>
    </div>`;

    if (body !== this._sig){
      el.innerHTML = body;
      this._sig = body;
    }
  },

  resolveSym(base){
    if (typeof STORE !== 'undefined' && STORE.tickers){
      for (const k of STORE.tickers.keys()){
        if (k.toUpperCase().startsWith(base.toUpperCase())) return k;
      }
    }
    if (typeof BROKER !== 'undefined' && BROKER.all){
      const hit = BROKER.all().find(s => s.toUpperCase().startsWith(base.toUpperCase()));
      if (hit) return hit;
    }
    return base === 'XAUUSD' ? 'XAUUSD.m' : base === 'EURUSD' ? 'EURUSD.m' : base;
  },

  /* ---------- Top-bar button + Settings popup ---------- */
  syncBtn(){
    const b = document.getElementById('stRegBtn');
    const on = !!(typeof Chart !== 'undefined' && Chart.settings && Chart.settings.st_regime && Chart.settings.st_regime.on);
    if (b) b.classList.toggle('on', on);
    if (!on) document.getElementById('stRegCard')?.remove();
  },

  toggle(){
    const c = this.cfg();
    c.on = !c.on;
    this.save(c);
    if (c.on && typeof toast === 'function'){
      toast('SuperTrend Regime (BUY & SELL) on — ★ Best fit: Gold & Silver 4h (PF 2.15) and Forex 4h (PF 1.21)', 'ok');
    }
  },

  panel(){
    let el = document.getElementById('stRegPanel');
    if (el){ el.remove(); return; }
    const c = this.cfg();
    const chk = (k, t) => `<label><input type="checkbox" data-srk="${k}"${c[k] ? ' checked' : ''}> ${t}</label>`;
    const num = (k, t, min, max, step) => `<label>${t} <input type="number" data-srn="${k}" value="${c[k]}" min="${min}" max="${max}" step="${step || 1}"></label>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="stRegPanel" class="autoSrPanel asPanel">
      <b>⚡ SuperTrend Regime · BUY / SELL</b>
      <div class="srLook"><b>Parameters</b>
        ${num('len', 'SuperTrend ATR period', 2, 100, 1)}
        ${num('mult', 'SuperTrend ATR multiplier', 0.5, 10, 0.5)}
        ${num('ema', 'Regime EMA (0 = allow all flips)', 0, 500, 10)}
        ${num('rr', 'Target multiple (× risk)', 0.5, 6, 0.5)}
        ${num('maxBars', 'Time limit (candles)', 4, 96, 1)}
      </div>
      <div class="srLook"><b>What to show</b>
        ${chk('card', 'Market Fit & live signal card')}
        ${chk('past', 'Past BUY / SELL signals with ✓ / ✗')}
        ${chk('levels', 'Entry, stop and target box on chart')}
        ${chk('lastLevels', 'Keep levels visible on last finished signal')}
      </div>
      <div class="srLook"><b>Colours</b>
        <label>▲ Buy colour <input type="color" data-src="up" value="${c.up}"></label>
        <label>▼ Sell colour <input type="color" data-src="down" value="${c.down}"></label>
      </div>
      <p class="dim2">★ <b>Best Market Fit:</b> Gold &amp; Silver (XAUUSD, XAGUSD) on <b>4h</b> (PF 2.15 · Buy PF 2.75 · Sell PF 1.41) and <b>1h</b> (PF 1.19), plus <b>Forex Majors on 4h</b> (PF 1.21 · Buy PF 1.11 · Sell PF 1.38).</p>
    </div>`);
    el = document.getElementById('stRegPanel');
    const b = document.getElementById('stRegCfg').getBoundingClientRect();
    el.style.left = Math.max(8, Math.min(innerWidth - 350, b.left - 150)) + 'px';
    el.style.top = (b.bottom + 6) + 'px';

    const apply = e => {
      const t = e.target, v = this.cfg();
      if (t.dataset.srk) v[t.dataset.srk] = t.checked;
      else if (t.dataset.srn){ if (t.value === '' || !Number.isFinite(+t.value)) return; v[t.dataset.srn] = +t.value; }
      else if (t.dataset.src) v[t.dataset.src] = t.value;
      else return;
      if (!v.on) v.on = true;
      this.save(v);
    };
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
    setTimeout(() => document.addEventListener('mousedown', function off(e){
      if (!e.target.closest('#stRegPanel, #stRegCfg')){
        document.getElementById('stRegPanel')?.remove();
        document.removeEventListener('mousedown', off);
      }
    }), 0);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('pcCfg') || document.getElementById('fcCfg') || document.getElementById('patCfg');
  const bar = document.getElementById('chartLabelBar');
  if (document.getElementById('stRegBtn')) return;
  const html = `<button id="stRegBtn" class="bMini autoSrBtn${StRegime.cfg().on ? ' on' : ''}" title="SuperTrend(10,3) + EMA 200 Regime — gives both ▲ BUY and ▼ SELL signals with Entry, Stop & 2R Target. Best fit: Gold & Silver (4h/1h) & Forex Majors (4h)">⚡ SuperTrend B/S</button><button id="stRegCfg" class="bMini" title="SuperTrend Regime (Buy & Sell) settings">⚙</button>`;
  if (after) after.insertAdjacentHTML('afterend', html);
  else if (bar){
    const tools = bar.querySelector('.chartTools');
    if (tools) tools.insertAdjacentHTML('beforeend', html);
    else bar.insertAdjacentHTML('beforeend', '<span class="chartTools">' + html + '</span>');
  }
  document.getElementById('stRegBtn')?.addEventListener('click', () => StRegime.toggle());
  document.getElementById('stRegCfg')?.addEventListener('click', () => StRegime.panel());
});
