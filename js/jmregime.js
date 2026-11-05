/* ASTRA Terminal — ✦ REGIME: six readings of the market's CONDITION, in one card.

   Patterns reads the SHAPE of the last stretch of candles — the triangle, the
   channel, the break. This reads something else and complementary: what KIND of
   market you are in right now, which decides whether a shape is worth trading
   at all. The same ascending triangle means one thing in a market that is
   genuinely going somewhere and another in one that has chopped sideways for
   three days.

   Six readings, each a well-known measure, gathered so they can be read against
   one another instead of one at a time:

     TREND STRENGTH   Efficiency Ratio over 50 candles (how much of the path
                      walked was actual progress) beside ADX(14).
     DIRECTION        Vortex VI+/VI− and which side of its KAMA price sits.
     VOLATILITY       ATR(14) as a percentage of price, and where that sits in
                      its own last 200 candles — quiet or wild FOR THIS market,
                      not against some absolute number.
     COMPRESSION      Whether the Bollinger Bands are inside the Keltner
                      Channels, and for how many candles.
     STRETCH          How many standard deviations price sits from its own
                      20-candle mean — the Bollinger position, as a number.
     PARTICIPATION    This candle's volume against the 20-candle average. On a
                      CFD this is the broker's tick count, not exchange volume,
                      and the card says so rather than letting you forget it.

   Then one combined line: which FAMILY of rule has something to work with here
   — trend, fade, or neither. That is the whole purpose. A trend rule and a
   fade rule want opposite markets, and running either in the wrong one is
   where most of the loss in simple strategies comes from.

   WHAT THIS IS NOT. Every number here describes the present and the recent
   past. None of them forecasts. "Trending" does not mean it will keep
   trending, "coiled" does not say which way it releases, and a green dot is
   not permission to trade — it is the statement that this kind of market is
   not actively hostile to that kind of rule. Read only: it draws a card and
   never places, sizes or suggests an order.

   Built the way every other ✦ overlay here is: its own storage key, a cfg/save
   pair, a settings panel, a button injected beside the others, and a draw()
   that the chart calls on every redraw. */

const JMRegime = {
  KEY: 'astra_regime',
  DEF: {
    on: false, card: true,
    erLen: 50, adxLen: 14, atrLen: 14, volLook: 200, bbLen: 20, sqLen: 20,
    trendEr: 0.35, rangeEr: 0.20, trendAdx: 20,
    showTrend: true, showDir: true, showVol: true, showSq: true, showStretch: true, showPart: true,
  },

  cfg(){
    const s = lsGet(this.KEY, {}) || {}, D = this.DEF;
    const out = {}; for (const k of Object.keys(D)) out[k] = s[k] === undefined ? D[k] : s[k];
    return out;
  },
  save(c){ lsSet(this.KEY, c); this._sig = ''; this.syncBtn(); if (typeof Draw !== 'undefined') Draw.redraw(); },

  /* ---------- the reading ---------- */
  read(raw, C){
    const need = Math.max(C.erLen, C.volLook, 60) + 30;
    if (!raw || raw.length < need) return { thin: true, have: raw ? raw.length : 0, need };
    const c = raw.slice(0, -1);                       /* the forming candle is not read */
    if (c.length < need) return { thin: true, have: c.length, need };
    const close = c.map(x => x.close), i = c.length - 1, px = close[i];

    const er = JMIND.efficiency(close, C.erLen)[i];
    const adxAll = IND.adx(c, C.adxLen), adx = adxAll.adx[i];
    const atrArr = IND.atr(c, C.atrLen), atr = atrArr[i];
    const atrPct = (atr != null && px) ? atr / px * 100 : null;
    /* percentile of the current ATR% within its own recent history */
    let atrPctile = null;
    if (atrPct != null){
      const hist = [];
      for (let k = Math.max(1, i - C.volLook); k <= i; k++) if (atrArr[k] != null && close[k]) hist.push(atrArr[k] / close[k] * 100);
      if (hist.length > 20){ const below = hist.filter(v => v < atrPct).length; atrPctile = below / hist.length * 100; }
    }
    const vx = JMIND.vortex(c, 14), viU = vx.up[i], viD = vx.down[i];
    const kama = JMIND.kama(close, 10, 2, 30)[i];
    const q = JMIND.squeeze(c, C.sqLen, 2, 1.5);
    let sqBars = 0; if (q.on[i] === 1){ let k = i; while (k >= 0 && q.on[k] === 1){ sqBars++; k--; } }
    const bb = IND.bb(close, C.bbLen, 2);
    const sd = (bb.up[i] != null && bb.mid[i] != null) ? (bb.up[i] - bb.mid[i]) / 2 : null;
    const z = (sd && sd > 0) ? (px - bb.mid[i]) / sd : null;
    const vols = c.map(x => x.volume || 0), vAvg = IND.sma(vols, 20)[i];
    const relVol = (vAvg > 0) ? vols[i] / vAvg : null;

    /* the combined verdict */
    let family, why;
    if (q.on[i] === 1 && sqBars >= 6){
      family = 'coiled';
      why = 'Range has compressed for ' + sqBars + ' candles. Neither family has an edge until it releases, and the release picks its own direction.';
    } else if (er != null && er >= C.trendEr && adx != null && adx >= C.trendAdx){
      family = 'trend';
      why = 'The market is covering ground efficiently and ADX agrees. Trend rules have something to work with; fading this is fighting it.';
    } else if (er != null && er < C.rangeEr && (adx == null || adx < C.trendAdx)){
      family = 'range';
      why = 'The market is going nowhere over ' + C.erLen + ' candles. Fade rules suit it; a breakout rule here mostly pays spread.';
    } else {
      family = 'neither';
      /* name the dissent when there is one: two trend measures disagreeing is
         itself the useful reading, and "in between" hides it */
      const erTrend = er != null && er >= C.trendEr, adxTrend = adx != null && adx >= C.trendAdx;
      if (adxTrend && !erTrend)
        why = 'ADX reads ' + adx.toFixed(0) + ', which says trend, but only ' + (er == null ? '—' : (er * 100).toFixed(0)) +
              '% of the path walked was progress. A market can grind directionally and still be an expensive one to trade. They disagree, so neither family is favoured.';
      else if (erTrend && !adxTrend)
        why = 'The move is efficient (' + er.toFixed(2) + ') but ADX is only ' + (adx == null ? '—' : adx.toFixed(0)) +
              ' — a clean move that has not built strength yet. They disagree, so neither family is favoured.';
      else
        why = 'Between the two: not efficient enough for a trend rule, not directionless enough to fade with confidence. The honest answer is that neither family is favoured.';
    }
    return { er, adx, pdi: adxAll.pdi[i], mdi: adxAll.mdi[i], atrPct, atrPctile, viU, viD, kama, px,
             sqOn: q.on[i] === 1, sqBars, z, relVol, family, why, bars: c.length,
             time: c[i].rawTime || c[i].time };
  },

  /* ---------- the card ---------- */
  DOT: { good: '#2ebd85', warn: '#eda100', bad: '#f6465d', off: 'rgba(160,160,160,.45)' },
  dot(kind){ return '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + this.DOT[kind] + ';margin-right:7px;vertical-align:1px"></span>'; },
  /* two lines per reading: the card is narrow, and a third column squeezed the
     explanation into a few characters per line */
  row(kind, label, value, note){
    return '<div style="margin:7px 0 0">' +
      '<div style="display:flex;gap:8px;align-items:baseline;justify-content:space-between">' +
        '<span style="opacity:.72;font-size:11px">' + this.dot(kind) + esc(label) + '</span>' +
        '<span style="font-weight:500;font-size:12px;white-space:nowrap">' + value + '</span></div>' +
      '<div style="opacity:.62;font-size:10.5px;line-height:1.45;margin:1px 0 0 15px">' + esc(note) + '</div></div>';
  },

  VERDICT: {
    trend:   ['TRENDING',      '#2ebd85'],
    range:   ['RANGING',       '#00e5ff'],
    coiled:  ['COILED',        '#eda100'],
    neither: ['NO CLEAR EDGE', 'rgba(200,200,200,.8)'],
  },

  card(R, C){
    const wrap = document.getElementById('mainWrap'); if (!wrap) return;
    let el = document.getElementById('jmRegCard');
    if (!C.on || !C.card){ if (el) el.remove(); return; }
    if (!el){
      wrap.insertAdjacentHTML('beforeend', '<div id="jmRegCard" class="fcCard"></div>');
      el = document.getElementById('jmRegCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
    }
    const sym = (typeof STORE !== 'undefined' ? baseAsset(STORE.symbol) : ''), tf = (typeof STORE !== 'undefined' ? STORE.tf : '');
    const head = '<div class="fcHead">✦ REGIME · ' + esc(sym) + ' ' + esc(tf) + '</div>';

    if (R.thin){
      el.innerHTML = head + '<p>Not enough history yet — ' + R.have + ' candles, this needs about ' + R.need + '. Load more of this timeframe and it fills in.</p>';
      return;
    }
    const V = this.VERDICT[R.family];
    let body = head + '<div class="fcBig" style="color:' + V[1] + '">' + V[0] + '</div><p>' + esc(R.why) + '</p>';

    const n = (v, d) => v == null ? '—' : (+v).toFixed(d == null ? 2 : d);
    if (C.showTrend){
      const k = R.er == null ? 'off' : R.er >= C.trendEr ? 'good' : R.er < C.rangeEr ? 'bad' : 'warn';
      body += this.row(k, 'Trend strength', n(R.er, 2) + ' · ADX ' + n(R.adx, 0),
        R.er == null ? 'not ready' : R.er >= C.trendEr ? 'efficient — real progress per unit of movement'
          : R.er < C.rangeEr ? 'inefficient — the path is far longer than the distance' : 'in between');
    }
    if (C.showDir){
      const upT = R.viU != null && R.viU > R.viD, aboveK = R.kama != null && R.px > R.kama;
      const agree = (upT && aboveK) || (!upT && !aboveK);
      body += this.row(agree ? (upT ? 'good' : 'bad') : 'warn', 'Direction',
        (R.viU == null ? '—' : (upT ? '▲ up' : '▼ down')) + ' · VI ' + n(R.viU, 2) + '/' + n(R.viD, 2),
        R.viU == null ? 'not ready' : agree ? (upT ? 'Vortex and KAMA both point up' : 'Vortex and KAMA both point down')
          : 'Vortex and KAMA disagree — direction is not settled');
    }
    if (C.showVol){
      const p = R.atrPctile;
      const k = p == null ? 'off' : p >= 80 ? 'bad' : p <= 20 ? 'warn' : 'good';
      body += this.row(k, 'Volatility', n(R.atrPct, 2) + '% ATR' + (p == null ? '' : ' · ' + n(p, 0) + 'th'),
        p == null ? 'not ready' : p >= 80 ? 'wild for this market — stops in ATR widen, size shrinks'
          : p <= 20 ? 'unusually quiet for this market — moves may be too small to clear the spread'
          : 'normal for this market');
    }
    if (C.showSq){
      body += this.row(R.sqOn ? 'warn' : 'off', 'Compression',
        R.sqOn ? 'on · ' + R.sqBars + ' candles' : 'off',
        R.sqOn ? 'Bollinger inside Keltner — coiled, and the release chooses its own side'
               : 'bands are outside the channel — no compression');
    }
    if (C.showStretch){
      const a = R.z == null ? null : Math.abs(R.z);
      const k = a == null ? 'off' : a >= 2 ? 'bad' : a >= 1 ? 'warn' : 'good';
      body += this.row(k, 'Stretch', R.z == null ? '—' : (R.z > 0 ? '+' : '') + n(R.z, 2) + ' σ',
        a == null ? 'not ready' : a >= 2 ? 'far from the mean — late to join, and a fade is crowded'
          : a >= 1 ? 'extended from the mean' : 'near the mean');
    }
    if (C.showPart){
      const r = R.relVol;
      const k = r == null ? 'off' : r >= 1.5 ? 'good' : r <= 0.6 ? 'warn' : 'off';
      body += this.row(k, 'Participation', r == null ? '—' : n(r, 2) + '×',
        r == null ? 'no volume on this feed' : r >= 1.5 ? 'busier than usual'
          : r <= 0.6 ? 'thin — moves here are easier to fake' : 'ordinary');
    }

    body += '<p style="opacity:.6;font-size:10.5px;line-height:1.5;margin-top:8px">' +
      'Every reading above describes the market now and in the recent past. None of them is a forecast, ' +
      'and none is permission to trade — the verdict says which FAMILY of rule is not fighting the market, ' +
      'nothing more. Volume on a CFD is the broker’s tick count, not exchange volume. ' +
      'Read on the last closed candle (' + R.bars + ' used).</p>';
    el.innerHTML = body;
  },

  /* ---------- called by the chart on every redraw ---------- */
  draw(ctx){
    const C = this.cfg();
    if (!C.on){ const el = document.getElementById('jmRegCard'); if (el) el.remove(); return; }
    const raw = typeof Chart === 'undefined' ? [] : (Chart.view ? Chart.view() : (Chart.raw || []));   /* during bar replay, only the replay's candles */
    const last = raw.length ? (raw[raw.length - 1].rawTime || raw[raw.length - 1].time) : 0;
    const sig = (typeof STORE !== 'undefined' ? STORE.symbol + '|' + STORE.tf : '') + '|' + last + '|' + raw.length + '|' + JSON.stringify(C);
    if (sig === this._sig && document.getElementById('jmRegCard')) return;   /* nothing changed */
    this._sig = sig;
    let R; try { R = this.read(raw, C); } catch(e){ R = { thin: true, have: raw.length, need: 0 }; }
    try { this.card(R, C); } catch(e){ console.warn('ASTRA regime card:', e.message); }
  },

  /* ---------- button and settings ---------- */
  syncBtn(){
    const b = document.getElementById('jmRegBtn');
    if (b) b.classList.toggle('on', this.cfg().on);
    if (!this.cfg().on) document.getElementById('jmRegCard')?.remove();
  },
  toggle(){ const c = this.cfg(); c.on = !c.on; this._sig = ''; this.save(c); },

  panel(){
    let el = document.getElementById('jmRegPanel'); if (el){ el.remove(); return; }
    const c = this.cfg();
    const chk = (k, t) => '<label><input type="checkbox" data-jk="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>';
    const num = (k, t, min, max, step) => '<label>' + t + ' <input type="number" data-jn="' + k + '" value="' + c[k] + '" min="' + min + '" max="' + max + '" step="' + step + '"></label>';
    document.body.insertAdjacentHTML('beforeend', '<div id="jmRegPanel" class="autoSrPanel asPanel">' +
      '<b>Regime</b>' +
      '<div class="srLook"><b>What to show</b>' + chk('card', 'The regime card') + chk('showTrend', 'Trend strength') +
        chk('showDir', 'Direction') + chk('showVol', 'Volatility') + chk('showSq', 'Compression') +
        chk('showStretch', 'Stretch') + chk('showPart', 'Participation') + '</div>' +
      '<div class="srLook"><b>Where the lines fall</b>' +
        num('erLen', 'Efficiency over (candles)', 10, 300, 1) +
        num('trendEr', 'Trending above', 0.1, 0.9, 0.05) +
        num('rangeEr', 'Ranging below', 0.05, 0.8, 0.05) +
        num('trendAdx', 'ADX must reach', 5, 60, 1) +
        num('volLook', 'Volatility history (candles)', 50, 600, 10) + '</div>' +
      '<div class="fcBtns"><button class="bMini" data-jreset="1">Reset</button></div></div>');
    el = document.getElementById('jmRegPanel');
    const apply = e => {
      const t = e.target, v = this.cfg();
      if (t.dataset.jk) v[t.dataset.jk] = t.checked;
      else if (t.dataset.jn){ if (!Number.isFinite(+t.value) || t.value === '') return; v[t.dataset.jn] = +t.value; }
      else return;
      if (!v.on) v.on = true;
      this._sig = ''; this.save(v);
    };
    el.addEventListener('input', apply);
    el.addEventListener('change', apply);
    el.addEventListener('click', e => {
      if (!e.target.closest('[data-jreset]')) return;
      this.save(Object.assign({}, this.DEF, { on: true })); el.remove(); this.panel();
    });
    setTimeout(() => document.addEventListener('mousedown', function off(e){
      if (!e.target.closest('#jmRegPanel, #jmRegCfg')){ document.getElementById('jmRegPanel')?.remove(); document.removeEventListener('mousedown', off); }
    }), 0);
  },
};

document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('fcCfg') || document.getElementById('patCfg') || document.getElementById('autoSrCfg');
  if (!after || document.getElementById('jmRegBtn')) return;
  after.insertAdjacentHTML('afterend',
    '<button id="jmRegBtn" class="bMini autoSrBtn' + (JMRegime.cfg().on ? ' on' : '') + '" ' +
    'title="Regime — six readings of what KIND of market this is: trend strength, direction, volatility, compression, stretch and participation">✦ Regime</button>' +
    '<button id="jmRegCfg" class="bMini" title="Regime settings">⚙</button>');
  document.getElementById('jmRegBtn').addEventListener('click', () => JMRegime.toggle());
  document.getElementById('jmRegCfg').addEventListener('click', () => JMRegime.panel());
});
