/* ASTRA Terminal — ✦ SIGNAL LABELS: named signals on the candles, like Candlestick Patterns.

   Three families with long-standing followings, using published rules:

   TD SEQUENTIAL (Tom DeMark)
     Setup      9 closes in a row below the close 4 candles earlier (buy), or above
                it (sell), started by a price flip. Labelled TD9, or TD9★ when
                perfected: for a buy, the low of candle 8 or 9 is at or under the
                lows of candles 6 and 7.
     Countdown  After a setup, 13 candles (not necessarily in a row) closing at or
                under the low of 2 candles earlier (buy), or at or over that high
                (sell). Candle 13 must also reach past the close of candle 8, or it
                waits. Cancelled by a close beyond the setup's far extreme, or by a
                completed setup the other way. Labelled TD13.
     TD Sequential has many variants; this is the common published form, without
     DeMark's proprietary recycling rules.

   RSI DIVERGENCE
     Price makes a lower swing low while RSI(14) makes a higher one (bull), or the
     mirror at swing highs (bear).

   MARKET STRUCTURE
     A close through the last confirmed swing. With the trend it is a BOS (break of
     structure); against the trend it is a CHoCH (change of character).

   A swing needs 5 candles on each side, so divergence and structure labels appear
   on the candle that CONFIRMS them, 5 or more candles after the turn. That is when
   they could really have been seen, and it means they never repaint. The forming
   candle is never read.

   These are labels, not advice. The card compares each one with random entries on
   the open chart, after spread. Read only: this file has no order path. */
const JMMarks = {
  KEY: 'astra_marks',
  DEF: { on: false, card: true, td9: true, td13: true, div: true, structure: true, onlyStrong: false },
  H: 12, WING: 5,
  STYLE: { td: '#f0b90b', div: '#b388ff', st: '#00e5ff' },
  NAMES: { td9: 'TD9 setup', td13: 'TD13 countdown', div: 'RSI divergence', bos: 'BOS', choch: 'CHoCH' },

  cfg(){ return Object.assign({}, this.DEF, lsGet(this.KEY, {}) || {}); },
  save(c){ lsSet(this.KEY, c); this._cardSig = ''; this.syncBtn(); this.refresh(); },
  refresh(){ try { Chart.renderPatternMarkers(); } catch(e){} try { Draw.redraw(); } catch(e){} },

  /* ---------- TD Sequential ---------- */
  td(c){
    const out = [], n = c.length, close = c.map(x => x.close);
    const S = { 1: { count: 0, cd: null }, '-1': { count: 0, cd: null } };
    const lower = (i, d) => d > 0 ? close[i] < close[i - 4] : close[i] > close[i - 4];
    const flip = (i, d) => d > 0 ? close[i - 1] > close[i - 5] : close[i - 1] < close[i - 5];
    for (let i = 5; i < n; i++){
      for (const d of [1, -1]){
        const s = S[d];
        /* a running countdown is cancelled by a close beyond the setup's far extreme */
        if (s.cd && (d > 0 ? close[i] > s.cd.far : close[i] < s.cd.far)) s.cd = null;

        if (lower(i, d)){
          if (s.count > 0) s.count++;
          else if (flip(i, d)) { s.count = 1; s.start = i; }
        } else s.count = 0;

        if (s.count === 9){
          const a = c[i - 3], b = c[i - 2], e = c[i - 1], f = c[i];
          const strong = d > 0 ? Math.min(e.low, f.low) <= Math.min(a.low, b.low) : Math.max(e.high, f.high) >= Math.max(a.high, b.high);
          out.push({ i, dir: d, key: 'td9', strong, text: 'TD9' + (strong ? '★' : ''), color: this.STYLE.td });
          let far = d > 0 ? -Infinity : Infinity;
          for (let k = i - 8; k <= i; k++) far = d > 0 ? Math.max(far, c[k].high) : Math.min(far, c[k].low);
          /* a setup the other way ends this side's countdown; a repeat setup leaves a running one alone */
          S[-d].cd = null;
          if (!s.cd) s.cd = { far, n: 0, c8: null, from: i };
        }

        const cd = s.cd;
        if (cd && i >= cd.from && i >= 2){
          const qualifies = d > 0 ? close[i] <= c[i - 2].low : close[i] >= c[i - 2].high;
          if (qualifies){
            if (cd.n < 12){ cd.n++; if (cd.n === 8) cd.c8 = close[i]; }
            else if (d > 0 ? c[i].low <= cd.c8 : c[i].high >= cd.c8){
              out.push({ i, dir: d, key: 'td13', strong: true, text: 'TD13', color: this.STYLE.td });
              s.cd = null;
            }
          }
        }
      }
    }
    return out;
  },

  /* a swing at candle p, known only at candle p + WING */
  swingAt(c, p, hi){
    const W = this.WING;
    if (p - W < 0 || p + W >= c.length) return false;
    for (let k = p - W; k <= p + W; k++){
      if (k === p) continue;
      if (hi ? (k < p ? c[k].high >= c[p].high : c[k].high > c[p].high) : (k < p ? c[k].low <= c[p].low : c[k].low < c[p].low)) return false;
    }
    return true;
  },

  /* ---------- divergence and structure share the confirmed swings ---------- */
  swings(c){
    const out = [], close = c.map(x => x.close), rsi = IND.rsi(close, 14), W = this.WING;
    let lastHi = null, lastLo = null, trend = 0, openHi = null, openLo = null;
    for (let i = 0; i < c.length; i++){
      const p = i - W;
      if (p >= 0){
        if (this.swingAt(c, p, true)){
          if (lastHi && p - lastHi.p <= 60 && rsi[p] != null && rsi[lastHi.p] != null && c[p].high > lastHi.v && rsi[p] < rsi[lastHi.p])
            out.push({ i, dir: -1, key: 'div', strong: true, text: 'Bear div', color: this.STYLE.div });
          lastHi = { p, v: c[p].high }; openHi = lastHi;
        }
        if (this.swingAt(c, p, false)){
          if (lastLo && p - lastLo.p <= 60 && rsi[p] != null && rsi[lastLo.p] != null && c[p].low < lastLo.v && rsi[p] > rsi[lastLo.p])
            out.push({ i, dir: 1, key: 'div', strong: true, text: 'Bull div', color: this.STYLE.div });
          lastLo = { p, v: c[p].low }; openLo = lastLo;
        }
      }
      if (openHi && close[i] > openHi.v){
        const ch = trend < 0; out.push({ i, dir: 1, key: ch ? 'choch' : 'bos', strong: ch, text: ch ? 'CHoCH' : 'BOS', color: this.STYLE.st }); trend = 1; openHi = null;
      }
      if (openLo && close[i] < openLo.v){
        const ch = trend > 0; out.push({ i, dir: -1, key: ch ? 'choch' : 'bos', strong: ch, text: ch ? 'CHoCH' : 'BOS', color: this.STYLE.st }); trend = -1; openLo = null;
      }
    }
    return out;
  },

  /* every label on closed candles; a pure function, so the chart and the measurement agree */
  analyse(c){ return this.td(c).concat(this.swings(c)).sort((a, b) => a.i - b.i); },

  /* what price did H candles after each label, in ATR, against any candle in the same direction */
  score(c, list, costPct){
    const atr = IND.atr(c, 14), H = this.H, n = c.length, base = { 1: { s: 0, n: 0, w: 0 }, '-1': { s: 0, n: 0, w: 0 } };
    const move = (i, d, A) => (c[i + H - 1].close - c[i].open) * d / A - c[i].open * costPct / 100 / A;
    for (let i = 30; i + H <= n; i += 2){ const A = atr[i - 1]; if (!(A > 0)) continue;
      for (const d of [1, -1]){ const m = move(i, d, A); base[d].s += m; base[d].n++; if (m > 0) base[d].w++; } }
    const rows = {};
    for (const x of list){
      const i = x.i + 1, A = atr[x.i]; if (!(A > 0) || i + H > n) continue;
      const m = move(i, x.dir, A), r = rows[x.key] || (rows[x.key] = { key: x.key, n: 0, s: 0, w: 0, b: 0, bw: 0 });
      r.n++; r.s += m; if (m > 0) r.w++;
      const B = base[x.dir]; if (B.n){ r.b += B.s / B.n; r.bw += B.w / B.n; }
    }
    return rows;
  },

  /* ---------- on the chart ---------- */
  result(v){
    const c = v.slice(0, -1), last = c[c.length - 1];
    const sig = STORE.symbol + '|' + STORE.tf + '|' + c.length + '|' + (last ? last.time : 0);
    if (sig === this._sig && this._R) return this._R;
    this._sig = sig; this._cardSig = '';
    const list = c.length > 40 ? this.analyse(c) : [];
    const cost = typeof Checker !== 'undefined' ? Checker.costPct(STORE.symbol) : 0.02;
    return this._R = { c, list, rows: c.length > 40 ? this.score(c, list, cost) : {} };
  },
  shown(x, C){
    if (x.key === 'td9') return C.td9 && (!C.onlyStrong || x.strong);
    if (x.key === 'td13') return C.td13;
    if (x.key === 'div') return C.div;
    return C.structure && (!C.onlyStrong || x.strong);
  },
  /* called by the chart with the candle markers */
  markers(v){
    const C = this.cfg();
    if (!C.on){ document.getElementById('jmMarkCard')?.remove(); return []; }
    const R = this.result(v);
    try { this.card(R, C); } catch(e){ console.warn('ASTRA signal labels:', e.message); }
    return R.list.filter(x => this.shown(x, C)).slice(-1500).map(x => ({
      time: R.c[x.i].time, position: x.dir > 0 ? 'belowBar' : 'aboveBar', color: x.color,
      shape: x.dir > 0 ? 'arrowUp' : 'arrowDown', text: x.text }));
  },
  card(R, C){
    const wrap = document.getElementById('mainWrap'); if (!wrap) return;
    let el = document.getElementById('jmMarkCard');
    if (!C.card){ if (el) el.remove(); return; }
    const sig = this._sig + JSON.stringify(C);
    if (el && sig === this._cardSig) return;
    this._cardSig = sig;
    if (!el){
      wrap.insertAdjacentHTML('beforeend', '<div id="jmMarkCard" class="fcCard" style="width:330px;left:12px;right:auto;top:52px"></div>');
      el = document.getElementById('jmMarkCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
    }
    const f = v => (v >= 0 ? '+' : '') + v.toFixed(2);
    const rows = ['td9', 'td13', 'div', 'choch', 'bos'].map(k => { const r = R.rows[k];
      if (!r) return `<tr><td>${this.NAMES[k]}</td><td colspan="4" style="opacity:.55">none finished</td></tr>`;
      const avg = r.s / r.n, b = r.b / r.n;
      return `<tr><td>${this.NAMES[k]}</td><td style="text-align:right">${r.n}</td><td style="text-align:right">${Math.round(r.w / r.n * 100)}%</td><td style="text-align:right;color:${avg > b ? '#2ebd85' : '#f6465d'}">${f(avg)}</td><td style="text-align:right;opacity:.7">${f(b)}</td></tr>`; }).join('');
    const last = R.list[R.list.length - 1];
    el.innerHTML = `<div class="fcHead">✦ SIGNAL LABELS · ${esc(baseAsset(STORE.symbol))} ${esc(STORE.tf)}</div>
      <p>${last ? 'Latest: <b>' + esc(last.text) + '</b> ' + (last.dir > 0 ? '▲' : '▼') + ', ' + (R.c.length - 1 - last.i) + ' candles ago.' : 'No labels yet.'}</p>
      <table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr style="opacity:.65"><th style="text-align:left;font-weight:400">Signal</th><th style="font-weight:400;text-align:right">Count</th><th style="font-weight:400;text-align:right">Right</th><th style="font-weight:400;text-align:right">Avg</th><th style="font-weight:400;text-align:right">Random</th></tr></thead><tbody>${rows}</tbody></table>
      <p style="opacity:.65;font-size:10.5px;margin-top:6px">Move ${this.H} candles after the label, in ATR, after spread, on this chart's ${R.c.length} candles. Green beats random entries here. A small count is mostly luck, and past results do not promise future ones.</p>`;
  },
  syncBtn(){ const b = document.getElementById('jmMarkBtn'); if (b) b.classList.toggle('on', this.cfg().on); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c); },
  panel(){
    let el = document.getElementById('jmMarkPanel'); if (el){ el.remove(); return; }
    const c = this.cfg(), chk = (k, t) => '<label><input type="checkbox" data-mk="' + k + '"' + (c[k] ? ' checked' : '') + '> ' + t + '</label>';
    document.body.insertAdjacentHTML('beforeend', '<div id="jmMarkPanel" class="autoSrPanel asPanel"><b>Signal labels</b><div class="srLook"><b>What to show</b>' +
      chk('td9', 'TD9 setups') + chk('td13', 'TD13 countdowns') + chk('div', 'RSI divergences') + chk('structure', 'BOS and CHoCH') + chk('onlyStrong', 'Fewer labels: only TD9★ and CHoCH') + chk('card', 'The results card') + '</div></div>');
    el = document.getElementById('jmMarkPanel');
    el.addEventListener('change', e => { const k = e.target.dataset.mk; if (!k) return; const v = this.cfg(); v[k] = e.target.checked; v.on = true; this.save(v); });
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#jmMarkPanel, #jmMarkCfg')){ document.getElementById('jmMarkPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('jmChkCfg') || document.getElementById('jmSigCfg') || document.getElementById('fcCfg');
  if (!after || document.getElementById('jmMarkBtn')) return;
  after.insertAdjacentHTML('afterend', '<button id="jmMarkBtn" class="bMini autoSrBtn' + (JMMarks.cfg().on ? ' on' : '') + '" title="Named signals on the candles: TD Sequential 9 and 13, RSI divergence, BOS and CHoCH">✦ Signal Labels</button><button id="jmMarkCfg" class="bMini" title="Signal Labels settings">⚙</button>');
  document.getElementById('jmMarkBtn').addEventListener('click', () => JMMarks.toggle());
  document.getElementById('jmMarkCfg').addEventListener('click', () => JMMarks.panel());
});
