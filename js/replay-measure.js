/* ASTRA Terminal — a measuring tape for the Trade Replay.
   Two clicks on the replay chart measure the move between them: price, %,
   candles and time — and, when a trade is open in the replay, the money that
   move is worth for THAT trade's size and direction, plus what the trade would
   have made had it been closed at the second point instead of where it was.
   "From entry" needs one click only: it measures from the trade's entry.
   Bolted onto TradeReview; draws on its own canvas over the chart. Read-only. */
const ReplayMeasure = {
  on: false, mode: 'two',          // 'two' = click A then B · 'entry' = from the entry
  a: null, b: null, hover: null,   // {time, price}
  canvas: null,

  init(){
    const T = TradeReview; if (!T || !T.host) return;
    const controls = T.host.querySelector('#trBack')?.parentElement; if (!controls) return;
    controls.insertAdjacentHTML('beforeend',
      `<span class="rmTools"><button id="rmTwo" title="Measure between two points: click the first candle, then the second">📏 Measure</button>` +
      `<button id="rmEntry" title="One click: what the trade would have made if it had been closed at that candle">📐 From entry</button>` +
      `<button id="rmClear" title="Remove the measurement">✕</button><span id="rmOut" class="rmOut"></span></span>`);
    T.host.querySelector('#rmTwo').onclick = () => this.toggle('two');
    T.host.querySelector('#rmEntry').onclick = () => this.toggle('entry');
    T.host.querySelector('#rmClear').onclick = () => this.clear();
    /* re-hook whenever the replay builds a fresh chart */
    const create = T.createChart.bind(T); T.createChart = () => { create(); this.hook(); };
    const dispose = T.dispose.bind(T); T.dispose = () => { this.unhook(); dispose(); };
    const draw = T.draw.bind(T); T.draw = () => { draw(); this.render(); };
    if (T.chart) this.hook();
  },
  toggle(mode){
    if (this.on && this.mode === mode){ this.on = false; }
    else { this.on = true; this.mode = mode; this.a = this.b = null; if (mode === 'entry' && TradeReview.selected){ const t = TradeReview.selected; this.a = { time: t.entryTime / 1000, price: t.entry, entry: true }; } }
    this.buttons(); this.render();
    if (this.on) toast(mode === 'two' ? 'Click the first candle, then the second' : 'Click the candle where you would have closed the trade', 'info');
  },
  clear(){ this.on = false; this.a = this.b = this.hover = null; this.buttons(); this.render(); },
  buttons(){
    const h = TradeReview.host; if (!h) return;
    h.querySelector('#rmTwo')?.classList.toggle('active', this.on && this.mode === 'two');
    h.querySelector('#rmEntry')?.classList.toggle('active', this.on && this.mode === 'entry');
    const stage = h.querySelector('#trChart'); if (stage) stage.classList.toggle('rmArmed', this.on);
  },

  hook(){
    const T = TradeReview; if (!T.chart) return;
    const el = T.host.querySelector('#trChart');
    if (!this.canvas){
      this.canvas = document.createElement('canvas'); this.canvas.className = 'rmCanvas';
      el.style.position = 'relative'; el.appendChild(this.canvas);
    }
    T.chart.subscribeClick(p => this.click(p));
    T.chart.subscribeCrosshairMove(p => { if (this.on && this.a && !this.b && p.point){ this.hover = this.at(p); this.render(); } });
    T.chart.timeScale().subscribeVisibleLogicalRangeChange(() => this.render());
    this.render();
  },
  unhook(){ if (this.canvas){ this.canvas.remove(); this.canvas = null; } },

  /* the candle + price under a chart event */
  at(p){
    const T = TradeReview; if (!p.point || !T.series) return null;
    const price = T.series.coordinateToPrice(p.point.y);
    let time = p.time;
    if (time == null){ const lg = T.chart.timeScale().coordinateToLogical(p.point.x); const b = T.bars[Math.max(0, Math.min(T.bars.length - 1, Math.round(lg)))]; time = b && b.time; }
    if (!(price > 0) || time == null) return null;
    return { time, price };
  },
  /* a moment in time → the candle that holds it (a trade's entry time rarely sits exactly on a candle) */
  snap(time){
    const T = TradeReview, secs = T.seconds();
    const b = T.bars.find(x => x.time <= time && time < x.time + secs) || T.bars.find(x => x.time >= time);
    return b ? b.time : time;
  },
  click(p){
    if (!this.on) return;
    const pt = this.at(p); if (!pt) return;
    if (this.mode === 'entry'){
      /* a click past the candle's best price snaps to that best price — the
         "what if I had sold at the very top" question */
      const t = TradeReview.selected, bar = TradeReview.bars.find(x => x.time === pt.time);
      if (t && bar){ const dir = t.dir > 0 ? 1 : -1; const best = dir > 0 ? bar.high : bar.low; if ((pt.price - best) * dir > 0) pt.price = best; }
      this.b = pt; this.hover = null;
    }
    else if (!this.a || this.b){ this.a = pt; this.b = null; }
    else { this.b = pt; this.hover = null; }
    this.render();
  },

  /* ---------- the numbers ---------- */
  measure(a, b){
    const T = TradeReview, t = T.selected;
    const secs = T.seconds();
    const ia = T.bars.findIndex(x => x.time === this.snap(a.time)), ib = T.bars.findIndex(x => x.time === this.snap(b.time));
    const bars = (ia >= 0 && ib >= 0) ? Math.abs(ib - ia) : Math.round(Math.abs(b.time - a.time) / secs);
    const dp = b.price - a.price, pct = a.price > 0 ? dp / a.price * 100 : 0;
    const ms = Math.abs(b.time - a.time) * 1000;
    const span = ms < 3600000 ? Math.round(ms / 60000) + ' min' : ms < 86400000 ? (ms / 3600000).toFixed(1) + ' h' : (ms / 86400000).toFixed(1) + ' days';
    const out = { dp, pct, bars, span };
    if (t && Number.isFinite(t.qty)){
      const dir = t.dir > 0 ? 1 : -1;
      const rate = typeof BotEngine !== 'undefined' ? BotEngine.cashRate(t, true) : 1;
      out.money = dp * dir * t.qty * rate;                                     /* that move, for this trade's size and side */
      out.fromEntry = (b.price - t.entry) * dir * t.qty * rate - (t.fees || 0);  /* closed at B instead */
      out.recorded = t.pnl;
      out.R1 = Math.abs(t.entry - (t.slInit || t.sl)) || 0;
      out.r = out.R1 > 0 ? (b.price - t.entry) * dir / out.R1 : null;
    }
    return out;
  },
  text(m, entryMode){
    const T = TradeReview, f = v => T.fmt(v);
    const money = v => (v >= 0 ? '+' : '') + fmtNum(v);
    const lines = [];
    if (entryMode){
      lines.push(`If closed here: ${money(m.fromEntry)}${m.r != null ? ' · ' + (m.r >= 0 ? '+' : '') + m.r.toFixed(2) + 'R' : ''}`);
      lines.push(`recorded result was ${money(m.recorded)} → difference ${money(m.fromEntry - m.recorded)}`);
      lines.push(`${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(2)}% from the entry · ${m.bars} candles · ${m.span}`);
    } else {
      lines.push(`${m.dp >= 0 ? '+' : ''}${f(Math.abs(m.dp))} · ${m.pct >= 0 ? '+' : ''}${m.pct.toFixed(2)}% · ${m.bars} candles · ${m.span}`);
      if (m.money != null) lines.push(`worth ${money(m.money)} for this trade's size${m.fromEntry != null ? ' · closed at the 2nd point: ' + money(m.fromEntry) + ' (recorded ' + money(m.recorded) + ')' : ''}`);
    }
    return lines;
  },

  /* ---------- drawing ---------- */
  render(){
    const T = TradeReview, c = this.canvas; if (!c || !T.chart || !T.series) return;
    const el = T.host.querySelector('#trChart'); const W = el.clientWidth, H = el.clientHeight;
    const dpr = window.devicePixelRatio || 1;
    if (c.width !== W * dpr || c.height !== H * dpr){ c.width = W * dpr; c.height = H * dpr; c.style.width = W + 'px'; c.style.height = H + 'px'; }
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const out = T.host.querySelector('#rmOut');
    const a = this.a, b = this.b || this.hover;
    if (!a || !b){ if (out) out.textContent = this.on ? (this.mode === 'entry' ? (a ? 'now click the candle where you would have closed' : 'open a trade first') : (a ? 'now click the second candle' : 'click the first candle')) : ''; return; }
    const x = time => T.chart.timeScale().timeToCoordinate(time), y = price => T.series.priceToCoordinate(price);
    const xa = x(this.snap(a.time)), ya = y(a.price), xb = x(this.snap(b.time)), yb = y(b.price);
    const m = this.measure(a, b);
    const entryMode = this.mode === 'entry';
    const lines = this.text(m, entryMode);
    if (out) out.textContent = lines.join('  ·  ');
    if (xa == null || xb == null || ya == null || yb == null) return;
    const good = entryMode ? m.fromEntry >= 0 : m.dp >= 0;
    const col = good ? '#5be8cf' : '#ff879b';
    /* the box between the two points */
    ctx.fillStyle = good ? 'rgba(91,232,207,.12)' : 'rgba(255,135,155,.12)';
    ctx.fillRect(Math.min(xa, xb), Math.min(ya, yb), Math.abs(xb - xa), Math.abs(yb - ya));
    ctx.strokeStyle = col; ctx.lineWidth = 1.5; ctx.setLineDash([5, 4]);
    ctx.strokeRect(Math.min(xa, xb) + .5, Math.min(ya, yb) + .5, Math.abs(xb - xa), Math.abs(yb - ya));
    ctx.setLineDash([]);
    ctx.beginPath(); ctx.moveTo(xa, ya); ctx.lineTo(xb, yb); ctx.stroke();
    for (const [px, py, lab] of [[xa, ya, entryMode ? 'entry' : 'A'], [xb, yb, entryMode ? 'closed here' : 'B']]){
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fillStyle = col; ctx.fill();
      ctx.font = '10px JetBrains Mono, monospace'; ctx.fillStyle = '#eaf3ff'; ctx.fillText(lab, px + 7, py - 6);
    }
    /* the label */
    ctx.font = '11px JetBrains Mono, monospace';
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 16, h = lines.length * 15 + 10;
    let lx = Math.max(xa, xb) + 10, ly = Math.min(ya, yb) - h - 6;
    if (lx + w > W - 4) lx = Math.min(xa, xb) - w - 10; if (lx < 4) lx = 4; if (ly < 4) ly = Math.max(ya, yb) + 8; if (ly + h > H - 4) ly = H - h - 4;
    ctx.fillStyle = 'rgba(8,13,28,.9)'; ctx.fillRect(lx, ly, w, h); ctx.strokeStyle = col; ctx.lineWidth = 1; ctx.strokeRect(lx + .5, ly + .5, w - 1, h - 1);
    lines.forEach((l, i) => { ctx.fillStyle = i === 0 ? col : '#c9d9ed'; ctx.fillText(l, lx + 8, ly + 16 + i * 15); });
  },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => { try { ReplayMeasure.init(); } catch(e){ console.warn('ASTRA replay measure:', e.message); } }, 30));
