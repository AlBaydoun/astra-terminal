/* ASTRA Terminal — drawing tools layer (trend line, ray, horizontal, fibonacci, alert, delete) */
const Draw = {
  tool: null,
  temp: null,        // first anchor while a 2-point tool is in progress
  cursor: null,
  items: [],
  sel: null,         // id of the drawing currently selected
  canvas: null, ctx: null, cssW: 0, cssH: 0,
  NEAR: 8,           // how close a click has to be to count as "on" a drawing

  FIB_LEVELS: [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1],

  init(){
    this.canvas = document.getElementById('drawLayer');
    this.ctx = this.canvas.getContext('2d');
    const wrap = document.getElementById('mainWrap');
    new ResizeObserver(() => { this.resize(); this.redraw(); }).observe(wrap);
    this.resize();
    document.querySelectorAll('#lefttools [data-tool]').forEach(b =>
      b.addEventListener('click', () => this.setTool(b.dataset.tool === this.tool ? null : b.dataset.tool)));
    const clr = document.getElementById('toolClear');
    if (clr) clr.addEventListener('click', () => { this.items = []; this.save(); this.redraw(); toast('All drawings removed', 'info'); });
    this.wireKeys();
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape'){
        this.temp = null; this.stroke = null; this.measure = null;
        this.closeMenu(); this.deselect(); this.setTool(null); this.redraw();
      }
      /* Delete removes whatever is selected, as long as you are not typing */
      if ((e.key === 'Delete' || e.key === 'Backspace') && this.sel){
        const t = (e.target && e.target.tagName) || '';
        if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
        e.preventDefault();
        this.remove(this.sel);
      }
    });
    this.wireMenu();
    this.wireDrag();
    /* freehand pencil: canvas captures the mouse while the tool is active */
    this.canvas.addEventListener('mousedown', e => {
      if (this.tool !== 'pencil') return;
      e.preventDefault();
      this.stroke = [];
      this.addStrokePoint(e);
      const move = ev => this.addStrokePoint(ev);
      const up = () => {
        window.removeEventListener('mousemove', move);
        window.removeEventListener('mouseup', up);
        if (this.stroke && this.stroke.length > 3){
          this.items.push({ id: this.newId(), type: 'pencil', pts: this.stroke });
          this.save();
        }
        this.stroke = null;
        this.redraw();
      };
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
    this.loadFor(STORE.symbol);
  },

  addStrokePoint(e){
    const r = this.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const last = this.stroke[this.stroke.length - 1];
    if (last && Math.hypot(x - last._x, y - last._y) < 3) return;
    const time = this.timeForX(x);
    const price = Chart.priceSeries ? Chart.priceSeries.coordinateToPrice(y) : null;
    if (time == null || price == null) return;
    this.stroke.push({ time, price, _x: x, _y: y });
    this.redraw();
  },

  /* How far a freshly placed stop sits from the entry: the average candle range
     of the last 14 bars, which is small on EUR/USD and large on Bitcoin without
     any per-instrument table. Falls back to 0.5% of the price. */
  defaultStopDistance(price){
    const raw = (typeof Chart !== 'undefined' && Chart.raw) ? Chart.raw : [];
    const n = Math.min(14, raw.length);
    if (n >= 3){
      let sum = 0;
      for (let i = raw.length - n; i < raw.length; i++) sum += (raw[i].high - raw[i].low);
      const avg = sum / n;
      if (avg > 0) return avg * 1.5;
    }
    return Math.abs(price) * 0.005;
  },

  /* x → time, working even right of the last candle */
  timeForX(x){
    try {
      const t = Chart.main.timeScale().coordinateToTime(x);
      if (t != null) return t;
      const l = Chart.main.timeScale().coordinateToLogical(x);
      if (l == null) return null;
      const raw = Chart.raw;
      if (!raw.length) return null;
      const step = raw.length > 1 ? raw[1].time - raw[0].time : 60;
      return raw[0].time + l * step;
    } catch(e){ return null; }
  },

  resize(){
    const wrap = document.getElementById('mainWrap');
    const dpr = window.devicePixelRatio || 1;
    this.cssW = wrap.clientWidth; this.cssH = wrap.clientHeight;
    this.canvas.width = this.cssW * dpr; this.canvas.height = this.cssH * dpr;
    this.canvas.style.width = this.cssW + 'px'; this.canvas.style.height = this.cssH + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  },

  setTool(t){
    this.tool = t; this.temp = null;
    document.querySelectorAll('#lefttools [data-tool]').forEach(b =>
      b.classList.toggle('active', b.dataset.tool === t));
    document.getElementById('mainWrap').classList.toggle('drawing', !!t);
    /* pencil captures the mouse directly (chart pan is paused while sketching) */
    this.canvas.style.pointerEvents = t === 'pencil' ? 'auto' : 'none';
    this.canvas.style.cursor = t === 'pencil' ? 'crosshair' : '';
  },

  save(){ lsSet('astra_draw_' + STORE.symbol, this.items); },
  loadFor(sym){
    this.items = lsGet('astra_draw_' + sym, []);
    this.sel = null;
    this.ensureIds();
    this.redraw();
  },

  /* every drawing needs a stable identity so a selection survives a redraw */
  newId(){ return 'd' + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36); },
  ensureIds(){ for (const it of this.items) if (!it.id) it.id = this.newId(); },
  byId(id){ return this.items.find(x => x.id === id) || null; },
  selected(){ return this.sel ? this.byId(this.sel) : null; },

  /* --- chart input (routed from lightweight-charts events) --- */
  onClick(p){
    if (!p || !p.point || !Chart.priceSeries) return;
    this.closeMenu();
    /* with no tool chosen, a click picks up whatever drawing is under it */
    if (!this.tool){
      const i = this.hitTest(p.point.x, p.point.y);
      if (i >= 0) this.select(this.items[i].id); else this.deselect();
      return;
    }
    const price = Chart.priceSeries.coordinateToPrice(p.point.y);
    /* NOT coordinateToTime: it returns null everywhere right of the last candle
       — exactly the empty strip where a position or a note gets placed. timeForX
       extrapolates past the last bar, and the rest of this file already used it.
       Text and long/short simply refused over there, with "Click inside the
       chart area". */
    const time = this.timeForX(p.point.x);
    if (price == null) return;

    if (this.tool === 'del'){ this.deleteNear(p.point.x, p.point.y); return; }
    if (this.tool === 'alert'){
      const t = STORE.tickers.get(STORE.symbol);
      const cond = (t && price >= t.last) ? 'above' : 'below';
      Alerts.list.push({ id: Date.now(), symbol: STORE.symbol, price, cond, active: true, created: Date.now() });
      Alerts.save();
      toast('Alert set: ' + STORE.symbol + ' ' + (cond === 'above' ? '≥ ' : '≤ ') + fmtPrice(price), 'ok');
      this.setTool(null);
      return;
    }
    /* measure: two clicks give price move, %, bars and elapsed time */
    if (this.tool === 'measure'){
      if (!this.temp) this.measure = null;
      if (time == null){ toast('Click inside the chart area', 'warn'); return; }
      if (!this.temp){ this.temp = { time, price }; this.redraw(); return; }
      this.measure = { p1: this.temp, p2: { time, price } };
      this.temp = null;
      this.redraw();
      return;
    }
    if (this.tool === 'hline'){
      this.items.push({ id: this.newId(), type: 'hline', price });
      this.save(); this.redraw(); this.setTool(null);
      return;
    }
    if (this.tool === 'text'){
      if (time == null){ toast('Click inside the chart area', 'warn'); return; }
      this.askText(p.point.x, p.point.y, txt => {
        this.items.push({ id: this.newId(), type: 'text', p: { time, price }, text: txt.slice(0, 80) });
        this.save(); this.redraw();
      });
      this.setTool(null);
      return;
    }
    /* vertical line — one click marks a moment: a news release, an open, a gap */
    if (this.tool === 'vline'){
      if (time == null){ toast('Click inside the chart area', 'warn'); return; }
      this.items.push({ id: this.newId(), type: 'vline', p: { time, price } });
      this.save(); this.redraw(); this.setTool(null);
      return;
    }
    /* long / short: first click is the entry, second sets the stop.
       The target follows from the reward-to-risk you have chosen. */
    /* ---------- long / short: ONE click ----------
       It used to take two, and the second one was refused whenever the stop
       landed on the wrong side of the entry — so the drawing often never
       appeared and the half-placed position sat waiting invisibly. Now the
       first click finishes it: the stop goes a measured distance away (the
       average candle range over the last 14 bars, so it fits the instrument)
       and the target follows from the reward-to-risk. Then drag any of the
       three handles to put them exactly where you want. */
    if (this.tool === 'long' || this.tool === 'short'){
      if (time == null){ toast('Click inside the chart area', 'warn'); return; }
      const long = this.tool === 'long';
      const dist = this.defaultStopDistance(price);
      const stopPrice = long ? price - dist : price + dist;
      this.items.push({ id: this.newId(), type: this.tool, entry: { time, price },
        stop: { time, price: stopPrice }, rr: this.posRR || 2 });
      this.temp = null; this.save(); this.redraw(); this.setTool(null);
      toast((long ? 'Long' : 'Short') + ' placed — drag the entry, stop or target to adjust', 'ok');
      return;
    }

    /* bars pattern: pick the end of the stretch to copy, then where to place it */
    if (this.tool === 'barspattern'){
      if (time == null){ toast('Click inside the chart area', 'warn'); return; }
      if (!this.temp){
        const raw = Chart.raw;
        let idx = raw.findIndex(c => c.time >= time);
        if (idx < 0) idx = raw.length - 1;
        const n = this.patternBars || 20;
        const from = Math.max(0, idx - n);
        this.temp = { time, price, bars: raw.slice(from, idx + 1).map(c =>
          ({ open: c.open, high: c.high, low: c.low, close: c.close })) };
        toast(this.temp.bars.length + ' bars copied — click where to place them', 'info');
        this.redraw();
        return;
      }
      this.items.push({ id: this.newId(), type: 'barspattern', p1: this.temp, p2: { time, price }, bars: this.temp.bars });
      this.temp = null; this.save(); this.redraw(); this.setTool(null);
      return;
    }

    if (time == null){ toast('Click inside the chart area', 'warn'); return; }
    if (!this.temp){ this.temp = { time, price }; this.redraw(); return; }
    this.items.push({ id: this.newId(), type: this.tool, p1: this.temp, p2: { time, price } });
    this.temp = null; this.save(); this.redraw(); this.setTool(null);
  },

  onMove(p){
    if (!p || !p.point) return;
    if (this.temp || this.tool === 'measure'){
      this.cursor = { x: p.point.x, y: p.point.y };
      if (this.temp) this.redraw();
    }
  },

  /* how many candles a bars-pattern copy takes, and the reward:risk a new
     position tool starts with — both editable from the toolbar */
  patternBars: 20,
  posRR: 2,

  /* --- coordinate mapping (logical index based, so lines survive scrolling off-screen) --- */
  logicalFor(time){
    const raw = Chart.raw;
    if (!raw.length) return null;
    const step = raw.length > 1 ? raw[1].time - raw[0].time : 60;
    if (time <= raw[0].time) return (time - raw[0].time) / step;
    if (time >= raw[raw.length - 1].time) return raw.length - 1 + (time - raw[raw.length - 1].time) / step;
    let lo = 0, hi = raw.length - 1;
    while (hi - lo > 1){ const m = (hi + lo) >> 1; if (raw[m].time <= time) lo = m; else hi = m; }
    return lo + (time - raw[lo].time) / (raw[hi].time - raw[lo].time);
  },
  timeToX(time){
    const l = this.logicalFor(time);
    if (l == null) return null;
    return Chart.main.timeScale().logicalToCoordinate(l);
  },
  toXY(pt){
    if (!pt || !Chart.priceSeries) return null;
    const x = this.timeToX(pt.time);
    const y = Chart.priceSeries.priceToCoordinate(pt.price);
    return (x == null || y == null) ? null : { x, y };
  },

  /* --- rendering --- */
  redraw(){
    if (!this.ctx) return;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (!Chart.priceSeries) return;
    this.drawVP(ctx);
    if (typeof PosLines !== 'undefined') PosLines.draw(ctx);   /* open positions, under the drawings */
    for (const it of this.items) this.drawItem(ctx, it, false);
    if (this.measure) this.drawMeasure(ctx, this.measure);
    if (this.tool === 'measure' && this.temp && this.cursor)
      this.drawMeasure(ctx, { p1: this.temp, _to: this.cursor });
    /* live preview while a position or pattern is being placed */
    if (this.temp && this.cursor){
      if (this.tool === 'long' || this.tool === 'short')
        this.drawPosition(ctx, { type: this.tool, entry: this.temp, stop: {}, rr: this.posRR || 2 }, true, this.cursor);
      if (this.tool === 'barspattern' && this.temp.bars)
        this.drawBarsPattern(ctx, { bars: this.temp.bars }, this.toXY(this.temp), this.cursor);
    }
    if (this.stroke && this.stroke.length > 1) this.drawPencil(ctx, this.stroke);
    this.drawSelection(ctx);
    if (this.sel) this.showBar();          /* the bar follows the drawing when the chart moves */
    if (this.temp && this.cursor && this.tool && ['hline', 'pencil', 'text', 'measure', 'long', 'short', 'barspattern'].indexOf(this.tool) === -1){
      const a = this.toXY(this.temp);
      if (a) this.drawItem(ctx, { type: this.tool, p1: this.temp,
        p2: { time: 0, price: 0 }, _previewTo: this.cursor }, true, a);
    }
  },

  /* the measuring box, as in TradingView: a shaded rectangle from A to B with
     the price move, the percentage, the number of bars and the time between them */
  /* Bars, elapsed time and traded volume between two chart times — the same
     figures TradingView puts under a measurement, shared by every tool that
     spans a stretch of chart so they all report alike. */
  spanStats(t1, t2){
    const raw = Chart.raw;
    const step = raw.length > 1 ? raw[1].time - raw[0].time : 60;
    if (t1 == null || t2 == null) return { bars: 0, dur: '', vol: 0, text: '' };
    const bars = Math.abs(Math.round((t2 - t1) / step));
    const lo = Math.min(t1, t2), hi = Math.max(t1, t2);
    let vol = 0;
    for (const c of raw) if (c.time >= lo && c.time <= hi) vol += c.volume || 0;
    const secs = Math.abs(t2 - t1);
    const dur = secs < 3600 ? Math.round(secs / 60) + 'm'
      : secs < 86400 ? (secs / 3600).toFixed(1) + 'h'
      : (secs / 86400).toFixed(1) + 'd';
    return { bars, dur, vol,
      text: bars + ' bars   ' + dur + (vol > 0 ? '   Vol ' + fmtNum(vol) : '') };
  },

  /* a two-line readout block: the headline in the direction colour, the bars /
     time / volume line underneath in the time colour */
  readout(ctx, cx, topY, lines, base, below){
    ctx.save();
    ctx.font = '700 12px Rajdhani, sans-serif';
    const w1 = ctx.measureText(lines[0]).width;
    ctx.font = '600 11px Rajdhani, sans-serif';
    const w2 = lines[1] ? ctx.measureText(lines[1]).width : 0;
    const w = Math.max(w1, w2) + 18;
    const h = lines[1] ? 36 : 21;
    const x = Math.min(Math.max(cx - w / 2, 2), this.cssW - w - 2);
    const y = below ? topY : topY - h;
    ctx.fillStyle = 'rgba(' + base + ',0.96)';
    if (ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x, y, w, h, 5); ctx.fill(); }
    else ctx.fillRect(x, y, w, h);
    ctx.textAlign = 'center';
    ctx.fillStyle = '#04060d';
    ctx.font = '700 12px Rajdhani, sans-serif';
    ctx.fillText(lines[0], x + w / 2, y + 15);
    if (lines[1]){
      ctx.fillStyle = 'rgba(4,6,13,0.72)';
      ctx.font = '600 11px Rajdhani, sans-serif';
      ctx.fillText(lines[1], x + w / 2, y + 30);
    }
    ctx.restore();
    return { x, y, w, h };
  },

  /* ---------------- measure ----------------
     Two zones, as in TradingView: the price travelled is tinted in the direction
     colour, the time spanned is tinted separately underneath, and the readout
     carries the move, the percentage, the bar count, the elapsed time and the
     volume traded across the span. */
  drawMeasure(ctx, m){
    const a = this.toXY(m.p1);
    const b = m._to || this.toXY(m.p2);
    if (!a || !b) return;
    const p1 = m.p1.price;
    const p2 = m._to ? Chart.priceSeries.coordinateToPrice(b.y) : m.p2.price;
    const t1 = m.p1.time;
    const t2 = m._to ? this.timeForX(b.x) : m.p2.time;
    if (p2 == null) return;

    const up = p2 >= p1;
    const base = up ? '46,189,133' : '246,70,93';
    const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
    const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);

    ctx.save();
    /* price zone — the body of the move, in the direction colour */
    ctx.fillStyle = 'rgba(' + base + ',0.20)';
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeStyle = 'rgba(' + base + ',0.9)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x0 + 0.5, y0 + 0.5, w - 1, h - 1);

    /* time zone — a calmer band under it, so the two axes read separately */
    const tBand = 22;
    ctx.fillStyle = 'rgba(41,98,255,0.18)';
    ctx.fillRect(x0, y1, w, tBand);
    ctx.strokeStyle = 'rgba(41,98,255,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x0 + 0.5, y1 + 0.5, w - 1, tBand - 1);

    /* direction arrow down the middle */
    const midX = (a.x + b.x) / 2;
    ctx.strokeStyle = 'rgba(' + base + ',0.9)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(midX, a.y); ctx.lineTo(midX, b.y); ctx.stroke();
    const dir = b.y > a.y ? 1 : -1;
    ctx.beginPath();
    ctx.moveTo(midX, b.y);
    ctx.lineTo(midX - 5, b.y - dir * 9);
    ctx.lineTo(midX + 5, b.y - dir * 9);
    ctx.closePath();
    ctx.fillStyle = 'rgba(' + base + ',0.95)';
    ctx.fill();

    const diff = p2 - p1;
    const pct = p1 ? diff / p1 * 100 : 0;
    const span = this.spanStats(t1, t2);
    this.readout(ctx, midX, up ? y0 - 6 : y1 + tBand + 6,
      [(diff >= 0 ? '+' : '') + fmtPrice(diff) + '   (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)', span.text],
      base, !up);
    ctx.restore();
  },

  /* ---------- the freehand stroke ----------
     THIS METHOD WAS MISSING. drawItem called it and so did redraw's live-stroke
     line, so the first pencil point threw inside redraw() — which killed the
     whole repaint and took every other drawing on the chart down with it. That
     is why free drawing "did nothing": the stroke WAS captured, but nothing
     could be painted afterwards. */
  drawPencil(ctx, pts, color, width){
    if (!pts || pts.length < 2) return;
    ctx.save();
    ctx.strokeStyle = color || CFG.ACCENT;
    ctx.lineWidth = width || 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    let started = false;
    for (const q of pts){
      const xy = this.toXY(q);
      if (!xy) continue;
      if (!started){ ctx.moveTo(xy.x, xy.y); started = true; }
      else ctx.lineTo(xy.x, xy.y);
    }
    if (started) ctx.stroke();
    ctx.restore();
  },

  /* ---------- a note box that works in the desktop app ----------
     Electron does not implement window.prompt, so in START-ASTRA-DESKTOP the
     note tool silently did nothing. This is a real input placed where you
     clicked: Enter writes it, Escape drops it. */
  askText(x, y, done, initial){
    const wrap = document.getElementById('mainWrap');
    if (!wrap) return;
    const old = document.getElementById('drawTextBox');
    if (old) old.remove();
    const box = document.createElement('input');
    box.id = 'drawTextBox';
    box.type = 'text';
    box.maxLength = 80;
    box.placeholder = 'Note, then Enter';
    box.value = initial || '';
    box.style.left = Math.max(4, Math.min(x, wrap.clientWidth - 220)) + 'px';
    box.style.top = Math.max(4, Math.min(y, wrap.clientHeight - 40)) + 'px';
    wrap.appendChild(box);
    setTimeout(() => { box.focus(); box.select(); }, 0);
    const close = () => { box.remove(); };
    box.addEventListener('keydown', e => {
      e.stopPropagation();                      /* not a chart shortcut while typing */
      if (e.key === 'Enter'){
        const v = box.value.trim();
        close();
        if (v) done(v);
      } else if (e.key === 'Escape') close();
    });
    box.addEventListener('blur', () => setTimeout(close, 120));
  },

  drawItem(ctx, it, preview, aPre){
    ctx.save();
    if (it.type === 'pencil'){
      ctx.restore();
      this.drawPencil(ctx, it.pts, it.color, it.lw);
      return;
    }
    if (it.type === 'vline'){
      const xy = this.toXY(it.p);
      ctx.restore();
      if (!xy) return;
      ctx.save();
      ctx.strokeStyle = it.color || '#8b6cff';
      ctx.lineWidth = it.lw || 1.4;
      ctx.setLineDash(it.dash === false ? [] : [5, 4]);
      ctx.beginPath();
      ctx.moveTo(xy.x, 0);
      ctx.lineTo(xy.x, this.cssH);
      ctx.stroke();
      ctx.setLineDash([]);
      /* the moment it marks, so the line still means something a week later */
      const d = new Date((it.p.time - (typeof TZ_OFF === 'number' ? TZ_OFF : 0)) * 1000);
      const label = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') +
        ' ' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
      ctx.font = '600 10px Rajdhani, sans-serif';
      const w = ctx.measureText(label).width + 8;
      ctx.fillStyle = 'rgba(10,20,40,.85)';
      ctx.fillRect(xy.x - w / 2, 2, w, 15);
      ctx.fillStyle = it.color || '#8b6cff';
      ctx.textAlign = 'center';
      ctx.fillText(label, xy.x, 13);
      ctx.textAlign = 'left';
      ctx.restore();
      return;
    }
    if (it.type === 'text'){
      const xy = this.toXY(it.p);
      if (xy){
        ctx.font = '600 12px Rajdhani, sans-serif';
        const w = ctx.measureText(it.text).width;
        const tc = it.color || '#ffd166';
        ctx.fillStyle = 'rgba(8,12,26,0.85)';
        ctx.strokeStyle = tc;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(xy.x + 8, xy.y - 20, w + 12, 18, 4);
        else ctx.rect(xy.x + 8, xy.y - 20, w + 12, 18);
        ctx.fill(); ctx.stroke();
        ctx.fillStyle = tc;
        ctx.fillText(it.text, xy.x + 14, xy.y - 7);
        ctx.beginPath(); ctx.arc(xy.x, xy.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }
    if (it.type === 'hline'){
      const y = Chart.priceSeries.priceToCoordinate(it.price);
      if (y != null){
        ctx.strokeStyle = it.color || '#ffd166';
        ctx.lineWidth = it.lw || 1;
        ctx.setLineDash(it.dash === 0 ? [] : it.dash === 2 ? [2, 3] : [6, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.cssW, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = it.color || 'rgba(255,209,102,0.9)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(it.label ? it.label + '  ' + fmtPrice(it.price) : fmtPrice(it.price), 6, y - 4);
      }
      ctx.restore(); return;
    }
    if (it.type === 'long' || it.type === 'short'){
      this.drawPosition(ctx, it, preview, it._previewTo || null);
      ctx.restore(); return;
    }

    const a = aPre || this.toXY(it.p1);
    const b = it._previewTo || this.toXY(it.p2);
    if (!a || !b){ ctx.restore(); return; }

    if (it.type === 'trend' || it.type === 'ray'){
      ctx.strokeStyle = it.color || (it.type === 'ray' ? CFG.ACCENT2 : CFG.ACCENT);
      ctx.lineWidth = it.lw || 1.6;
      if (it.dash) ctx.setLineDash(it.dash === 2 ? [2, 3] : [7, 5]);
      if (preview) ctx.setLineDash([5, 4]);
      let x2 = b.x, y2 = b.y;
      if (it.type === 'ray' && b.x !== a.x){
        const slope = (b.y - a.y) / (b.x - a.x);
        x2 = b.x > a.x ? this.cssW : 0;
        y2 = a.y + slope * (x2 - a.x);
      }
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(x2, y2); ctx.stroke();
      ctx.setLineDash([]);
      for (const p of [a, b]){
        ctx.fillStyle = 'rgba(0,229,255,0.9)';
        ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
      }
    }

    if (it.type === 'fib'){
      const p1 = preview ? Chart.priceSeries.coordinateToPrice(a.y) : it.p1.price;
      const p2 = preview ? Chart.priceSeries.coordinateToPrice(b.y) : it.p2.price;
      if (p1 == null || p2 == null){ ctx.restore(); return; }
      this.drawFib(ctx, a, b, p1, p2, it.extended);
    }

    if (it.type === 'forecast') this.drawForecast(ctx, it, a, b);
    if (it.type === 'barspattern') this.drawBarsPattern(ctx, it, a, b);
    ctx.restore();
  },

  /* ---------------- Fibonacci retracement ----------------
     Each ratio keeps its own colour, the band between two ratios is tinted, and
     every level is labelled with the ratio and the price it sits at. */
  FIB_COLORS: {
    0: '#787b86', 0.236: '#f23645', 0.382: '#ff9800', 0.5: '#4caf50',
    0.618: '#009688', 0.786: '#00bcd4', 1: '#787b86',
    1.272: '#2962ff', 1.618: '#9c27b0', 2.618: '#e91e63',
  },

  drawFib(ctx, a, b, p1, p2, extended){
    const levels = (extended != null ? extended : this.fibExtended)
      ? [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618]
      : this.FIB_LEVELS;
    const xLeft = Math.min(a.x, b.x);
    const xRight = this.cssW - 2;

    /* tinted bands first, so the lines sit on top */
    let prev = null;
    for (const lvl of levels){
      const y = Chart.priceSeries.priceToCoordinate(p1 + (p2 - p1) * lvl);
      if (y == null) continue;
      if (prev != null){
        ctx.fillStyle = this.FIB_COLORS[prev.lvl] || '#787b86';
        ctx.globalAlpha = 0.07;
        ctx.fillRect(xLeft, Math.min(prev.y, y), xRight - xLeft, Math.abs(y - prev.y));
        ctx.globalAlpha = 1;
      }
      prev = { lvl, y };
    }

    ctx.font = '11px "JetBrains Mono", monospace';
    for (const lvl of levels){
      const price = p1 + (p2 - p1) * lvl;
      const y = Chart.priceSeries.priceToCoordinate(price);
      if (y == null) continue;
      const col = this.FIB_COLORS[lvl] || '#787b86';
      ctx.strokeStyle = col;
      ctx.lineWidth = (lvl === 0 || lvl === 1) ? 1.5 : 1;
      ctx.beginPath(); ctx.moveTo(xLeft, y); ctx.lineTo(xRight, y); ctx.stroke();

      const label = lvl.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + '  (' + fmtPrice(price) + ')';
      const w = ctx.measureText(label).width + 10;
      ctx.fillStyle = 'rgba(6,10,22,0.82)';
      ctx.fillRect(xLeft + 2, y - 13, w, 13);
      ctx.fillStyle = col;
      ctx.textAlign = 'left';
      ctx.fillText(label, xLeft + 6, y - 3);
    }

    /* the swing the ratios are measured from */
    ctx.strokeStyle = 'rgba(120,150,220,0.7)';
    ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);
    for (const p of [a, b]){
      ctx.fillStyle = 'rgba(120,150,220,0.9)';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3, 0, Math.PI * 2); ctx.fill();
    }
  },

  /* ---------------- long / short position ----------------
     Entry, stop and target as two coloured zones — red for what you risk, green
     for what you stand to make — with the reward-to-risk ratio and both amounts. */
  drawPosition(ctx, it, preview, cursor){
    const long = it.type === 'long';
    const entry = it.entry.price;
    const stop = preview && cursor
      ? Chart.priceSeries.coordinateToPrice(cursor.y)
      : it.stop.price;
    if (stop == null) return;
    const risk = Math.abs(entry - stop);
    if (!(risk > 0)) return;
    const rr = it.rr || 2;
    const target = long ? entry + risk * rr : entry - risk * rr;

    const yE = Chart.priceSeries.priceToCoordinate(entry);
    const yS = Chart.priceSeries.priceToCoordinate(stop);
    const yT = Chart.priceSeries.priceToCoordinate(target);
    if (yE == null || yS == null || yT == null) return;

    const x1 = this.toXY(it.entry) ? this.toXY(it.entry).x : 0;
    const x2 = Math.min(this.cssW - 2, x1 + (it.boxW || it.width || 190));

    /* reward zone */
    ctx.fillStyle = 'rgba(46,189,133,0.16)';
    ctx.fillRect(x1, Math.min(yE, yT), x2 - x1, Math.abs(yT - yE));
    /* risk zone */
    ctx.fillStyle = 'rgba(246,70,93,0.16)';
    ctx.fillRect(x1, Math.min(yE, yS), x2 - x1, Math.abs(yS - yE));

    ctx.lineWidth = 1;
    const line = (y, col, dash) => {
      ctx.strokeStyle = col; ctx.setLineDash(dash || []);
      ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
      ctx.setLineDash([]);
    };
    line(yT, 'rgba(46,189,133,0.95)');
    line(yE, 'rgba(200,215,245,0.95)', [5, 3]);
    line(yS, 'rgba(246,70,93,0.95)');

    /* the numbers that actually matter */
    const pctRisk = risk / entry * 100;
    const pctRew = (Math.abs(target - entry)) / entry * 100;
    ctx.font = '600 11px Rajdhani, sans-serif';
    ctx.textAlign = 'left';
    const tag = (y, text, col) => {
      const w = ctx.measureText(text).width + 12;
      ctx.fillStyle = col;
      if (ctx.roundRect){ ctx.beginPath(); ctx.roundRect(x2 + 4, y - 8, w, 16, 4); ctx.fill(); }
      else ctx.fillRect(x2 + 4, y - 8, w, 16);
      ctx.fillStyle = '#04060d';
      ctx.fillText(text, x2 + 10, y + 4);
    };
    tag(yT, 'Target ' + fmtPrice(target) + '  +' + pctRew.toFixed(2) + '%', 'rgba(46,189,133,0.95)');
    tag(yS, 'Stop ' + fmtPrice(stop) + '  −' + pctRisk.toFixed(2) + '%', 'rgba(246,70,93,0.95)');
    tag(yE, (long ? 'Long ' : 'Short ') + fmtPrice(entry), 'rgba(200,215,245,0.95)');

    /* the headline: reward to risk, and what it costs at the account's risk rule */
    const head = (long ? 'LONG' : 'SHORT') + '   R:R  ' + rr.toFixed(2) + ' : 1';
    const riskPct = (typeof BotEngine !== 'undefined' && BotEngine.RISK) ? BotEngine.RISK.riskPct : null;
    const eq = (typeof BotEngine !== 'undefined' && BotEngine.RISK) ? BotEngine.RISK.startEquity : null;
    const cash = (riskPct && eq) ? eq * riskPct / 100 : null;
    const sub = cash != null
      ? 'risk ' + fmtNum(cash) + '   reward ' + fmtNum(cash * rr) + '   at ' + riskPct + '% of ' + fmtNum(eq)
      : 'risk ' + pctRisk.toFixed(2) + '%   reward ' + pctRew.toFixed(2) + '%';
    this.readout(ctx, (x1 + x2) / 2, Math.min(yT, yS) - 6, [head, sub],
      long ? '46,189,133' : '246,70,93', false);
  },

  /* ---------------- forecast ----------------
     A projection from a start point to where you think price is heading. */
  drawForecast(ctx, it, a, b){
    if (!a || !b) return;
    const p1 = it.p1.price, p2 = it.p2.price;
    const up = p2 >= p1;
    const col = up ? 'rgba(46,189,133,' : 'rgba(246,70,93,';

    ctx.fillStyle = col + '0.10)';
    ctx.fillRect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y));
    ctx.strokeStyle = col + '0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.setLineDash([]);

    /* arrow head at the projection */
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - 10 * Math.cos(ang - 0.4), b.y - 10 * Math.sin(ang - 0.4));
    ctx.lineTo(b.x - 10 * Math.cos(ang + 0.4), b.y - 10 * Math.sin(ang + 0.4));
    ctx.closePath();
    ctx.fillStyle = col + '0.95)';
    ctx.fill();

    const pct = p1 ? (p2 - p1) / p1 * 100 : 0;
    const span = this.spanStats(it.p1.time, it.p2.time);
    this.readout(ctx, b.x, b.y - 12,
      [(p2 - p1 >= 0 ? '+' : '') + fmtPrice(p2 - p1) + '   (' + (pct >= 0 ? '+' : '') + pct.toFixed(2) + '%)',
       'in ' + span.bars + ' bars   ' + span.dur],
      up ? '46,189,133' : '246,70,93', false);
  },

  /* ---------------- bars pattern ----------------
     Copies the shape of a stretch of candles and redraws it wherever you place
     it, so a past move can be compared against the present one. */
  drawBarsPattern(ctx, it, a, b){
    if (!a || !b || !it.bars || !it.bars.length) return;
    const n = it.bars.length;
    /* drawn at the chart's own candle width, so the copy is the same size as the
       stretch it came from — not stretched to wherever it was dropped */
    let bs = 8;
    try { bs = Chart.main.timeScale().options().barSpacing || 8; } catch(e){}
    const span = bs * n;
    const w = Math.max(1.5, bs * 0.7);
    const base = it.bars[0].open;
    const anchor = Chart.priceSeries.coordinateToPrice(b.y);
    if (anchor == null || !base) return;
    const scale = anchor / base;

    /* the block the copy occupies, so it reads as a lifted piece of chart */
    let top = Infinity, bot = -Infinity;
    for (const c of it.bars){
      const yH = Chart.priceSeries.priceToCoordinate(c.high * scale);
      const yL = Chart.priceSeries.priceToCoordinate(c.low * scale);
      if (yH != null) top = Math.min(top, yH);
      if (yL != null) bot = Math.max(bot, yL);
    }
    if (top < bot){
      ctx.fillStyle = 'rgba(139,108,255,0.07)';
      ctx.fillRect(b.x - 3, top - 5, span + 6, bot - top + 10);
      ctx.strokeStyle = 'rgba(139,108,255,0.45)';
      ctx.lineWidth = 1; ctx.setLineDash([4, 3]);
      ctx.strokeRect(b.x - 3, top - 5, span + 6, bot - top + 10);
      ctx.setLineDash([]);
    }

    for (let i = 0; i < n; i++){
      const c = it.bars[i];
      const x = b.x + (i / n) * span;
      const yO = Chart.priceSeries.priceToCoordinate(c.open * scale);
      const yC = Chart.priceSeries.priceToCoordinate(c.close * scale);
      const yH = Chart.priceSeries.priceToCoordinate(c.high * scale);
      const yL = Chart.priceSeries.priceToCoordinate(c.low * scale);
      if (yO == null || yC == null) continue;
      const up = c.close >= c.open;
      ctx.strokeStyle = up ? 'rgba(46,189,133,0.95)' : 'rgba(246,70,93,0.95)';
      ctx.fillStyle = up ? 'rgba(46,189,133,0.7)' : 'rgba(246,70,93,0.7)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + w / 2, yH); ctx.lineTo(x + w / 2, yL); ctx.stroke();
      ctx.fillRect(x, Math.min(yO, yC), w, Math.max(1, Math.abs(yC - yO)));
    }
    ctx.font = '600 10px Rajdhani, sans-serif';
    ctx.fillStyle = 'rgba(139,108,255,0.95)';
    ctx.textAlign = 'left';
    ctx.fillText(n + '-bar pattern', b.x, (top < bot ? top : b.y) - 10);
  },

  /* --- volume profile of the visible range (toggled in the Indicators dialog) --- */
  drawVP(ctx){
    const S = Chart.settings.vp;
    if (!S || !S.on) return;
    let range = null;
    try { range = Chart.main.timeScale().getVisibleLogicalRange(); } catch(e){}
    if (!range) return;
    const v = Chart.view();
    const from = Math.max(0, Math.floor(range.from));
    const to = Math.min(v.length - 1, Math.ceil(range.to));
    if (to - from < 5) return;
    let pMin = Infinity, pMax = -Infinity;
    for (let i = from; i <= to; i++){
      if (v[i].low < pMin) pMin = v[i].low;
      if (v[i].high > pMax) pMax = v[i].high;
    }
    if (!(pMax > pMin)) return;
    const buckets = 40, bh = (pMax - pMin) / buckets;
    const vol = new Array(buckets).fill(0);
    for (let i = from; i <= to; i++){
      const c = v[i];
      const lo = Math.max(0, Math.floor((c.low - pMin) / bh));
      const hi = Math.min(buckets - 1, Math.floor((c.high - pMin) / bh));
      const n = hi - lo + 1;
      for (let b = lo; b <= hi; b++) vol[b] += c.volume / n;
    }
    const maxV = Math.max(...vol);
    if (!(maxV > 0)) return;
    const maxW = this.cssW * 0.18;
    const pocIdx = vol.indexOf(maxV);
    ctx.save();
    for (let b = 0; b < buckets; b++){
      const y1 = Chart.priceSeries.priceToCoordinate(pMin + (b + 1) * bh);
      const y2 = Chart.priceSeries.priceToCoordinate(pMin + b * bh);
      if (y1 == null || y2 == null) continue;
      const w = vol[b] / maxV * maxW;
      ctx.fillStyle = b === pocIdx ? 'rgba(255,209,102,0.32)' : 'rgba(0,229,255,0.13)';
      ctx.fillRect(this.cssW - w, Math.min(y1, y2) + 0.5, w, Math.max(1, Math.abs(y2 - y1) - 1));
    }
    const pocY = Chart.priceSeries.priceToCoordinate(pMin + (pocIdx + 0.5) * bh);
    if (pocY != null){
      ctx.strokeStyle = 'rgba(255,209,102,0.45)';
      ctx.setLineDash([4, 3]);
      ctx.beginPath(); ctx.moveTo(0, pocY); ctx.lineTo(this.cssW, pocY); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,209,102,0.8)';
      ctx.font = '9px "JetBrains Mono", monospace';
      ctx.fillText('POC', 4, pocY - 3);
    }
    ctx.restore();
  },

  /* ================= picking a drawing up =================
     A click with no tool chosen selects whatever is under it; a right-click
     anywhere opens the menu for that spot. Both work from the same hit test. */
  distToSeg(px, py, x1, y1, x2, y2){
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  },

  inBox(x, y, x1, y1, x2, y2, pad){
    const g = pad || 4;
    return x >= Math.min(x1, x2) - g && x <= Math.max(x1, x2) + g &&
           y >= Math.min(y1, y2) - g && y <= Math.max(y1, y2) + g;
  },

  /* the three prices a position tool draws: entry, stop and the target that
     follows from the reward-to-risk */
  posPrices(it){
    const entry = it.entry.price, stop = it.stop.price;
    const risk = Math.abs(entry - stop);
    const rr = it.rr || 2;
    return { entry, stop, risk, rr,
      target: it.type === 'long' ? entry + risk * rr : entry - risk * rr };
  },

  hits(it, x, y){
    const N = this.NEAR;
    const S = Chart.priceSeries;
    if (!S) return false;

    if (it.type === 'hline'){
      const ly = S.priceToCoordinate(it.price);
      return ly != null && Math.abs(y - ly) < N;
    }
    if (it.type === 'pencil'){
      let prev = null;
      for (const q of it.pts){
        const xy = this.toXY({ time: q.time, price: q.price });
        if (xy && prev && this.distToSeg(x, y, prev.x, prev.y, xy.x, xy.y) < N) return true;
        if (xy) prev = xy;
      }
      return false;
    }
    if (it.type === 'vline'){
      const xy = this.toXY(it.p);
      return !!xy && Math.abs(x - xy.x) < N;
    }
    if (it.type === 'text'){
      const xy = this.toXY(it.p);
      return !!xy && x >= xy.x - 4 && x <= xy.x + 130 && y >= xy.y - 26 && y <= xy.y + 8;
    }
    if (it.type === 'long' || it.type === 'short'){
      const e = this.toXY(it.entry);
      if (!e) return false;
      const pp = this.posPrices(it);
      const ys = [S.priceToCoordinate(pp.entry), S.priceToCoordinate(pp.stop), S.priceToCoordinate(pp.target)]
        .filter(v => v != null);
      if (!ys.length) return false;
      const x2 = Math.min(this.cssW - 2, e.x + (it.boxW || it.width || 190));
      return this.inBox(x, y, e.x, Math.min.apply(null, ys), x2, Math.max.apply(null, ys));
    }

    const a = this.toXY(it.p1), b = this.toXY(it.p2);
    if (!a || !b) return false;

    if (it.type === 'ray' && b.x !== a.x){
      const slope = (b.y - a.y) / (b.x - a.x);
      const x2 = b.x > a.x ? this.cssW : 0;
      return this.distToSeg(x, y, a.x, a.y, x2, a.y + slope * (x2 - a.x)) < N;
    }
    if (it.type === 'fib'){
      const p1 = it.p1.price, p2 = it.p2.price;
      const levels = (it.extended != null ? it.extended : this.fibExtended)
        ? [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1, 1.272, 1.618, 2.618] : this.FIB_LEVELS;
      return levels.some(lvl => {
        const ly = S.priceToCoordinate(p1 + (p2 - p1) * lvl);
        return ly != null && Math.abs(y - ly) < 6 && x >= Math.min(a.x, b.x) - 4;
      });
    }
    if (it.type === 'barspattern'){
      const span = (function(){
        try { return (Chart.main.timeScale().options().barSpacing || 8) * it.bars.length; }
        catch(e){ return 160; }
      })();
      let top = Infinity, bot = -Infinity;
      const base = it.bars[0] ? it.bars[0].open : 0;
      const anchor = S.coordinateToPrice(b.y);
      if (!base || anchor == null) return false;
      const scale = anchor / base;
      for (const c of it.bars){
        const yh = S.priceToCoordinate(c.high * scale), yl = S.priceToCoordinate(c.low * scale);
        if (yh != null) top = Math.min(top, yh);
        if (yl != null) bot = Math.max(bot, yl);
      }
      return top < bot && this.inBox(x, y, b.x, top, b.x + span, bot, 5);
    }
    if (it.type === 'forecast')
      return this.distToSeg(x, y, a.x, a.y, b.x, b.y) < N + 2;

    return this.distToSeg(x, y, a.x, a.y, b.x, b.y) < N;
  },

  hitTest(x, y){
    for (let i = this.items.length - 1; i >= 0; i--)
      if (this.hits(this.items[i], x, y)) return i;
    return -1;
  },

  /* every anchor point of a drawing, so the selection can show handles */
  anchors(it){
    const out = [];
    const push = pt => { const xy = this.toXY(pt); if (xy) out.push(xy); };
    if (it.type === 'hline'){
      const y = Chart.priceSeries.priceToCoordinate(it.price);
      if (y != null) out.push({ x: this.cssW / 2, y });
    } else if (it.type === 'text' || it.type === 'vline'){ push(it.p); }
    else if (it.type === 'pencil'){
      if (it.pts.length) { push(it.pts[0]); push(it.pts[it.pts.length - 1]); }
    } else if (it.type === 'long' || it.type === 'short'){
      push(it.entry); push(it.stop);
      const pp = this.posPrices(it);
      const yt = Chart.priceSeries.priceToCoordinate(pp.target);
      const e = this.toXY(it.entry);
      if (yt != null && e) out.push({ x: e.x, y: yt });
    } else { push(it.p1); push(it.p2); }
    return out;
  },

  select(id){
    this.sel = id;
    this.redraw();
    this.showBar();
  },
  deselect(){
    this.sel = null;
    this.hideBar();
    this.redraw();
  },

  drawSelection(ctx){
    const it = this.selected();
    if (!it) return;
    const pts = this.anchors(it);
    if (!pts.length) return;
    ctx.save();
    for (const q of pts){
      ctx.beginPath();
      ctx.arc(q.x, q.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0,229,255,0.95)';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = 'rgba(4,6,13,0.9)';
      ctx.stroke();
    }
    /* a soft frame so it is obvious what is picked up */
    const xs = pts.map(q => q.x), ys = pts.map(q => q.y);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = 'rgba(0,229,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.min.apply(null, xs) - 8, Math.min.apply(null, ys) - 8,
      Math.max(16, Math.max.apply(null, xs) - Math.min.apply(null, xs) + 16),
      Math.max(16, Math.max.apply(null, ys) - Math.min.apply(null, ys) + 16));
    ctx.setLineDash([]);
    ctx.restore();
  },

  /* ---- the little bar that appears over a selected drawing ---- */
  showBar(){
    const it = this.selected();
    const bar = document.getElementById('drawBar');
    if (!it || !bar) return;
    const pts = this.anchors(it);
    if (!pts.length) return this.hideBar();
    const x = Math.min.apply(null, pts.map(q => q.x));
    const y = Math.min.apply(null, pts.map(q => q.y));
    bar.querySelector('.dbName').textContent = this.LABELS[it.type] || it.type;
    bar.style.left = Math.max(4, Math.min(this.cssW - 210, x - 10)) + 'px';
    bar.style.top = Math.max(4, y - 40) + 'px';
    bar.classList.add('show');
  },
  hideBar(){
    const bar = document.getElementById('drawBar');
    if (bar) bar.classList.remove('show');
  },

  LABELS: {
    trend: 'Trend line', ray: 'Ray', hline: 'Horizontal line', fib: 'Fibonacci',
    long: 'Long position', short: 'Short position', forecast: 'Forecast',
    barspattern: 'Bars pattern', pencil: 'Free drawing', text: 'Note', vline: 'Vertical line',
  },

  /* ---- the operations the bar and the menu share ---- */
  remove(id){
    const i = this.items.findIndex(x => x.id === id);
    if (i < 0) return;
    const name = this.LABELS[this.items[i].type] || 'Drawing';
    this.items.splice(i, 1);
    if (this.sel === id) this.sel = null;
    this.hideBar();
    this.save(); this.redraw();
    toast(name + ' removed', 'info');
  },

  duplicate(id){
    const it = this.byId(id);
    if (!it) return;
    const copy = JSON.parse(JSON.stringify(it));
    copy.id = this.newId();
    /* nudge it a few candles to the right so the copy is visible */
    const raw = Chart.raw;
    const step = raw.length > 1 ? (raw[1].time - raw[0].time) * 3 : 180;
    const shift = pt => { if (pt && pt.time != null) pt.time += step; };
    shift(copy.p1); shift(copy.p2); shift(copy.p); shift(copy.entry); shift(copy.stop);
    if (copy.pts) copy.pts.forEach(shift);
    this.items.push(copy);
    this.save();
    this.select(copy.id);
    toast('Copied', 'ok');
  },

  order(id, toFront){
    const i = this.items.findIndex(x => x.id === id);
    if (i < 0) return;
    const [it] = this.items.splice(i, 1);
    if (toFront) this.items.push(it); else this.items.unshift(it);
    this.save(); this.redraw();
  },

  clearAll(){
    if (!this.items.length) return toast('There are no drawings on this chart', 'info');
    if (!confirm('Remove all ' + this.items.length + ' drawings from this chart?')) return;
    this.items = []; this.sel = null;
    this.hideBar(); this.save(); this.redraw();
    toast('All drawings removed', 'info');
  },

  deleteNear(x, y){
    const i = this.hitTest(x, y);
    if (i < 0) return;
    this.remove(this.items[i].id);
  },

  /* ================= keyboard =================
     Alt + letter always works and matches what TradingView uses, so the muscle
     memory carries over. Plain single letters can do the same, but they are OFF
     by default because typing a letter with the chart focused is how you search
     for a symbol — turning them on moves symbol search onto the "/" key. */
  KEYS: {
    t: 'trend', r: 'ray', h: 'hline', f: 'fib', m: 'measure',
    l: 'long', s: 'short', j: 'forecast', b: 'barspattern',
    p: 'pencil', n: 'text', a: 'alert', x: 'del', v: 'vline',
  },

  singleKeys(){ return lsGet('astra_keysingle', false) === true; },
  setSingleKeys(on){
    lsSet('astra_keysingle', !!on);
    this.labelTools();
    toast(on
      ? 'Single-letter shortcuts on — press / to search for a symbol'
      : 'Single-letter shortcuts off — Alt + letter still works', 'ok');
  },

  wireKeys(){
    if (this._keysWired) return;
    this._keysWired = true;
    this.labelTools();

    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.querySelector('.modal.show')) return;

      const k = (e.key || '').toLowerCase();

      /* with single letters on, "/" takes over as the way to search a symbol */
      if (!e.altKey && this.singleKeys() && k === '/'){
        e.preventDefault();
        e.stopImmediatePropagation();
        if (typeof SymbolSearch !== 'undefined') SymbolSearch.open();
        return;
      }

      const tool = this.KEYS[k];
      if (!tool) return;
      if (!e.altKey && !this.singleKeys()) return;   // plain letters belong to symbol search

      e.preventDefault();
      /* stopPropagation is not enough: the symbol-search handler is bound to the
         SAME element, and only stopImmediatePropagation keeps a tool shortcut
         from also opening the search box */
      e.stopImmediatePropagation();
      this.setTool(this.tool === tool ? null : tool);
      if (this.tool) toast(this.LABELS[tool] + ' — ' + (tool === 'hline' || tool === 'vline' || tool === 'text' ||
        tool === 'alert' || tool === 'long' || tool === 'short'
        ? 'click once on the chart' : 'click twice on the chart'), 'info');
    }, true);
  },

  /* put the shortcut into every tool button's tooltip, so it is discoverable */
  labelTools(){
    const single = this.singleKeys();
    document.querySelectorAll('#lefttools [data-tool]').forEach(b => {
      const tool = b.dataset.tool;
      const key = Object.keys(this.KEYS).find(k => this.KEYS[k] === tool);
      if (!key) return;
      if (!b.dataset.baseTitle) b.dataset.baseTitle = b.title || '';
      b.title = b.dataset.baseTitle + '   (' + (single ? key.toUpperCase() + ' or ' : '') +
        'Alt+' + key.toUpperCase() + ')';
    });
  },

  /* ================= moving a drawing =================
     A drawing is not finished when you place it. Grab one of its round handles
     to move that point, or grab the drawing itself to slide the whole thing, and
     every number it shows is recalculated from where it ends up.

     For a position that means the reward-to-risk follows the target handle: drag
     the target further away and the ratio rises, drag the stop wider and it
     falls. The figures on screen are always the figures of where it now sits. */
  drag: null,

  /* which handle is under the pointer, or -1 */
  handleAt(it, x, y){
    const pts = this.anchors(it);
    for (let i = 0; i < pts.length; i++)
      if (Math.hypot(x - pts[i].x, y - pts[i].y) <= 9) return i;
    return -1;
  },

  /* Where the body of a drawing may be grabbed. For a position that is its three
     lines, not the whole shaded block \u2014 otherwise the box would swallow every
     attempt to pan the chart behind it. */
  grabbable(it, x, y){
    if (it.type === 'long' || it.type === 'short'){
      const e = this.toXY(it.entry);
      if (!e) return false;
      const pp = this.posPrices(it);
      const x2 = Math.min(this.cssW - 2, e.x + (it.boxW || it.width || 190));
      if (x < e.x - 6 || x > x2 + 6) return false;
      return [pp.entry, pp.stop, pp.target].some(v => {
        const yy = Chart.priceSeries.priceToCoordinate(v);
        return yy != null && Math.abs(y - yy) <= 6;
      });
    }
    if (it.type === 'barspattern'){
      const b = this.toXY(it.p2);
      return !!b && Math.hypot(x - b.x, y - b.y) <= 14;   // grab it by its corner
    }
    return this.hits(it, x, y);
  },

  /* the point under the pointer, in chart terms rather than pixels, so a drag
     survives zooming and scrolling */
  at(x, y){
    const price = Chart.priceSeries ? Chart.priceSeries.coordinateToPrice(y) : null;
    const time = this.timeForX(x);
    return (price == null) ? null : { time, price };
  },

  wireDrag(){
    const wrap = document.getElementById('mainWrap');
    if (!wrap || this._dragWired) return;
    this._dragWired = true;

    wrap.addEventListener('mousedown', e => {
      if (e.button !== 0 || this.tool) return;              // a tool in progress wins
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      if (!Chart.priceSeries) return;
      /* a stop or target of an open position wins over any drawing */
      if (typeof PosLines !== 'undefined' && PosLines.mousedown(e, x, y)){ e.preventDefault(); e.stopPropagation(); return; }

      let it = this.selected(), mode = null, idx = -1;
      if (it){
        idx = this.handleAt(it, x, y);
        if (idx >= 0) mode = 'handle';
        else if (this.grabbable(it, x, y)) mode = 'body';
      }
      if (!mode){                                            // grab an unselected one
        for (let i = this.items.length - 1; i >= 0; i--){
          if (!this.grabbable(this.items[i], x, y)) continue;
          it = this.items[i];
          this.select(it.id);
          mode = 'body';
          break;
        }
      }
      if (!mode || !it) return;

      const from = this.at(x, y);
      if (!from) return;
      e.preventDefault();
      e.stopPropagation();                                   // the chart must not pan
      this.drag = { id: it.id, mode, idx, from, orig: JSON.parse(JSON.stringify(it)) };
      document.body.style.cursor = mode === 'handle' ? 'grabbing' : 'move';

      const move = ev => {
        const rr = this.canvas.getBoundingClientRect();
        const to = this.at(ev.clientX - rr.left, ev.clientY - rr.top);
        if (to) this.applyDrag(to);
      };
      const up = () => {
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
        document.body.style.cursor = '';
        if (this.drag){ this.drag = null; this.save(); this.redraw(); this.showBar(); }
      };
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
    }, true);

    /* show what can be grabbed before it is grabbed */
    wrap.addEventListener('mousemove', e => {
      if (this.drag || this.tool) return;
      const r = this.canvas.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const it = this.selected();
      let cur = typeof PosLines !== 'undefined' ? PosLines.hover(x, y) : '';
      if (cur) {}
      else if (it && this.handleAt(it, x, y) >= 0) cur = 'grab';
      else if (it && this.grabbable(it, x, y)) cur = 'move';
      else if (this.items.some(o => this.grabbable(o, x, y))) cur = 'move';
      const wrapEl = document.getElementById('mainWrap');
      if (wrapEl && wrapEl.dataset.cur !== cur){
        wrapEl.dataset.cur = cur;
        wrapEl.style.cursor = cur;
      }
    });
  },

  /* move the point, or the whole drawing, and let every number follow */
  applyDrag(to){
    const d = this.drag;
    if (!d) return;
    const it = this.byId(d.id);
    if (!it) return;
    const o = d.orig;
    const dt = (to.time != null && d.from.time != null) ? to.time - d.from.time : 0;
    const dp = to.price - d.from.price;

    const shift = (dst, src) => {
      if (!dst || !src) return;
      if (src.time != null) dst.time = src.time + dt;
      if (src.price != null) dst.price = src.price + dp;
    };

    if (d.mode === 'body'){
      if (it.type === 'hline'){ it.price = o.price + dp; }
      else if (it.type === 'text' || it.type === 'vline'){ shift(it.p, o.p); }
      else if (it.type === 'pencil'){
        it.pts.forEach((q, i) => { q.time = o.pts[i].time + dt; q.price = o.pts[i].price + dp; });
      } else if (it.type === 'long' || it.type === 'short'){
        shift(it.entry, o.entry); shift(it.stop, o.stop);   // rr is kept, so the target follows
      } else { shift(it.p1, o.p1); shift(it.p2, o.p2); }
      return this.redraw();
    }

    /* a single handle */
    if (it.type === 'hline'){ it.price = to.price; return this.redraw(); }
    if (it.type === 'text' || it.type === 'vline'){ it.p = { time: to.time, price: to.price }; return this.redraw(); }
    if (it.type === 'pencil'){
      it.pts.forEach((q, i) => { q.time = o.pts[i].time + dt; q.price = o.pts[i].price + dp; });
      return this.redraw();
    }

    if (it.type === 'long' || it.type === 'short'){
      const long = it.type === 'long';
      if (d.idx === 0){
        /* the entry moves; the stop stays where you put it, so the risk changes
           and the target moves with it */
        it.entry = { time: to.time, price: to.price };
        if (long && it.stop.price >= it.entry.price) it.stop.price = it.entry.price * 0.999;
        if (!long && it.stop.price <= it.entry.price) it.stop.price = it.entry.price * 1.001;
      } else if (d.idx === 1){
        /* the stop, kept on its own side of the entry */
        const price = long ? Math.min(to.price, it.entry.price * 0.9999)
                           : Math.max(to.price, it.entry.price * 1.0001);
        it.stop = { time: it.stop.time, price };
      } else if (d.idx === 2){
        /* the target: this is what rewrites the reward-to-risk */
        const risk = Math.abs(it.entry.price - it.stop.price);
        if (risk > 0){
          const reward = long ? (to.price - it.entry.price) : (it.entry.price - to.price);
          it.rr = Math.max(0.1, +(reward / risk).toFixed(2));
        }
      }
      return this.redraw();
    }

    /* everything else: two points */
    if (d.idx === 0) it.p1 = { time: to.time, price: to.price };
    else it.p2 = { time: to.time, price: to.price };
    if (it.type === 'barspattern' && it.p1 && o.p1.bars) it.p1.bars = o.p1.bars;
    this.redraw();
  },

  /* ================= right-click menu ================= */
  wireMenu(){
    const wrap = document.getElementById('mainWrap');
    if (!wrap || this._menuWired) return;
    this._menuWired = true;

    wrap.addEventListener('contextmenu', e => {
      e.preventDefault();
      const r = this.canvas.getBoundingClientRect();
      this.openMenu(e.clientX - r.left, e.clientY - r.top, e.clientX, e.clientY);
    });
    document.addEventListener('mousedown', e => {
      const m = document.getElementById('ctxMenu');
      if (m && m.classList.contains('show') && !m.contains(e.target)) this.closeMenu();
    });
    window.addEventListener('blur', () => this.closeMenu());

    const bar = document.getElementById('drawBar');
    if (bar) bar.addEventListener('click', e => {
      const b = e.target.closest('[data-db]');
      if (!b || !this.sel) return;
      if (b.dataset.db === 'edit') this.openProps(this.sel);
      if (b.dataset.db === 'copy') this.duplicate(this.sel);
      if (b.dataset.db === 'del') this.remove(this.sel);
    });
  },

  closeMenu(){
    const m = document.getElementById('ctxMenu');
    if (m) m.classList.remove('show');
  },

  /* the menu is built for the exact spot that was clicked: on a drawing it
     offers that drawing, on empty chart it offers what you can start there */
  menuItems(idx, price, time){
    const px = price == null ? null : fmtPrice(price);
    if (idx >= 0){
      const it = this.items[idx];
      const name = this.LABELS[it.type] || 'Drawing';
      return [
        { k: 'edit', label: name + ' settings…', icon: '\u2699' },
        { k: 'copy', label: 'Duplicate', icon: '\u29c9' },
        { sep: true },
        { k: 'front', label: 'Bring to front' },
        { k: 'back', label: 'Send to back' },
        { sep: true },
        { k: 'del', label: 'Remove ' + name.toLowerCase(), icon: '\u2715', danger: true },
        { k: 'clear', label: 'Remove all drawings', danger: true },
      ];
    }
    return [
      { k: 'alert', label: px ? 'Add alert at ' + px : 'Add alert', icon: '\u25b3' },
      { k: 'hline', label: px ? 'Horizontal line at ' + px : 'Horizontal line', icon: '\u2014' },
      { k: 'note', label: 'Write a note here', icon: '\u2710' },
      { k: 'vline', label: 'Vertical line here' },
      { sep: true },
      { k: 'measure', label: 'Measure from here' },
      { k: 'long', label: 'Long position from here' },
      { k: 'short', label: 'Short position from here' },
      { sep: true },
      { k: 'copyprice', label: px ? 'Copy price ' + px : 'Copy price' },
      { k: 'reset', label: 'Reset chart view' },
      { k: 'shot', label: 'Screenshot the chart' },
      { sep: true },
      { k: 'keys', label: (this.singleKeys() ? '✓ ' : '') + 'Single-letter tool shortcuts' },
      { k: 'clear', label: 'Remove all drawings', danger: true },
    ];
  },

  openMenu(x, y, clientX, clientY){
    const m = document.getElementById('ctxMenu');
    if (!m || !Chart.priceSeries) return;
    const price = Chart.priceSeries.coordinateToPrice(y);
    const time = this.timeForX(x);
    const idx = this.hitTest(x, y);
    if (idx >= 0) this.select(this.items[idx].id);

    m.innerHTML = this.menuItems(idx, price, time).map(i => i.sep
      ? '<div class="cmSep"></div>'
      : `<button data-cm="${i.k}"${i.danger ? ' class="danger"' : ''}>` +
        `<i>${i.icon || ''}</i>${esc(i.label)}</button>`).join('');

    m.classList.add('show');
    /* keep it on screen */
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = Math.min(clientX, window.innerWidth - w - 8) + 'px';
    m.style.top = Math.min(clientY, window.innerHeight - h - 8) + 'px';

    m.querySelectorAll('[data-cm]').forEach(b => b.addEventListener('click', () => {
      this.closeMenu();
      this.menuAction(b.dataset.cm, { idx, price, time, x, y });
    }));
  },

  menuAction(k, c){
    const id = c.idx >= 0 ? this.items[c.idx].id : null;
    if (k === 'edit' && id) return this.openProps(id);
    if (k === 'copy' && id) return this.duplicate(id);
    if (k === 'front' && id) return this.order(id, true);
    if (k === 'back' && id) return this.order(id, false);
    if (k === 'del' && id) return this.remove(id);
    if (k === 'clear') return this.clearAll();
    if (k === 'keys') return this.setSingleKeys(!this.singleKeys());

    if (k === 'alert'){
      const t = STORE.tickers.get(STORE.symbol);
      const cond = (t && c.price >= t.last) ? 'above' : 'below';
      Alerts.list.push({ id: Date.now(), symbol: STORE.symbol, price: c.price, cond, active: true, created: Date.now() });
      Alerts.save();
      return toast('Alert set: ' + STORE.symbol + ' ' + (cond === 'above' ? '\u2265 ' : '\u2264 ') + fmtPrice(c.price), 'ok');
    }
    if (k === 'hline'){
      this.items.push({ id: this.newId(), type: 'hline', price: c.price });
      this.save(); this.redraw();
      return toast('Line added at ' + fmtPrice(c.price), 'ok');
    }
    if (k === 'note'){
      this.askText(c.x, c.y, txt => {
        this.items.push({ id: this.newId(), type: 'text', p: { time: c.time, price: c.price }, text: txt.slice(0, 80) });
        this.save(); this.redraw();
      });
      return;
    }
    if (k === 'vline'){
      this.items.push({ id: this.newId(), type: 'vline', p: { time: c.time, price: c.price } });
      this.save(); this.redraw();
      return toast('Vertical line added', 'ok');
    }
    /* start a two-click tool with the first point already placed */
    if (k === 'long' || k === 'short'){
      if (c.time == null) return toast('Click inside the chart area', 'warn');
      const long = k === 'long';
      const dist = this.defaultStopDistance(c.price);
      this.items.push({ id: this.newId(), type: k, entry: { time: c.time, price: c.price },
        stop: { time: c.time, price: long ? c.price - dist : c.price + dist }, rr: this.posRR || 2 });
      this.save(); this.redraw();
      return toast((long ? 'Long' : 'Short') + ' placed — drag a handle to adjust', 'ok');
    }
    if (k === 'measure'){
      if (c.time == null) return toast('Click inside the chart area', 'warn');
      this.setTool(k);
      this.temp = { time: c.time, price: c.price };
      this.cursor = { x: c.x, y: c.y };
      this.redraw();
      return toast('Now click the second point', 'info');
    }
    if (k === 'copyprice'){
      const txt = fmtPrice(c.price);
      if (navigator.clipboard) navigator.clipboard.writeText(txt).then(
        () => toast('Copied ' + txt, 'ok'), () => toast('Could not copy', 'warn'));
      return;
    }
    if (k === 'reset'){
      try { Chart.main.timeScale().fitContent(); } catch(e){}
      return;
    }
    if (k === 'shot'){
      const b = document.getElementById('shotBtn');
      if (b) b.click();
      return;
    }
  },

  /* ================= properties of one drawing ================= */
  DASHES: [[0, 'Solid'], [1, 'Dashed'], [2, 'Dotted']],

  openProps(id){
    const it = this.byId(id);
    const box = document.getElementById('drawPropBody');
    if (!it || !box) return;
    const row = (label, field) => `<label class="ipRow"><span>${esc(label)}</span>${field}</label>`;
    const num = (k, v, step, min) =>
      `<input type="number" data-dp="${k}" value="${v}" step="${step || 'any'}"${min != null ? ' min="' + min + '"' : ''}>`;

    let html = '';
    const colored = ['trend', 'ray', 'hline', 'vline', 'text', 'pencil', 'forecast'].includes(it.type);
    if (colored){
      const def = it.type === 'ray' ? CFG.ACCENT2 : it.type === 'vline' ? '#8b6cff'
        : it.type === 'hline' || it.type === 'text' ? '#ffd166' : CFG.ACCENT;
      html += row('Colour', `<input type="color" data-dp="color" value="${it.color || def}">`);
    }
    if (it.type !== 'barspattern')
      html += row('Thickness', num('lw', it.lw || (it.type === 'fib' ? 1 : 1.6), 0.5, 0.5));
    if (['trend', 'ray', 'hline'].includes(it.type))
      html += row('Line style', `<select class="tsel" data-dp="dash">` +
        this.DASHES.map(([v, l]) => `<option value="${v}"${v === (it.dash != null ? it.dash : (it.type === 'hline' ? 1 : 0)) ? ' selected' : ''}>${l}</option>`).join('') +
        `</select>`);

    if (it.type === 'hline'){
      html += row('Price', num('price', it.price, 'any'));
      html += row('Label', `<input type="text" data-dp="label" value="${esc(it.label || '')}" placeholder="optional">`);
    }
    if (it.type === 'text')
      html += row('Text', `<input type="text" data-dp="text" value="${esc(it.text || '')}" maxlength="80">`);
    if (it.type === 'fib')
      html += row('Show extension levels',
        `<input type="checkbox" data-dp="extended"${(it.extended != null ? it.extended : this.fibExtended) ? ' checked' : ''}>`);
    if (it.type === 'long' || it.type === 'short'){
      const pp = this.posPrices(it);
      html += row('Entry', num('entryPrice', it.entry.price, 'any'));
      html += row('Stop', num('stopPrice', it.stop.price, 'any'));
      html += row('Reward : risk', num('rr', it.rr || 2, 0.1, 0.1));
      html += row('Box width (px)', num('boxW', it.boxW || it.width || 190, 10, 40));
      html += `<div class="indHint">Target follows the reward-to-risk: ${fmtPrice(pp.target)}.
        Risk per unit ${fmtPrice(pp.risk)}.</div>`;
    }
    if (it.type === 'barspattern')
      html += `<div class="indHint">${it.bars.length} candles copied. Move it by deleting and placing it again.</div>`;

    document.getElementById('drawPropTitle').textContent = this.LABELS[it.type] || 'Drawing';
    box.innerHTML = html || '<div class="indHint">This drawing has nothing to adjust.</div>';

    document.getElementById('drawPropApply').onclick = () => {
      box.querySelectorAll('[data-dp]').forEach(el => {
        const k = el.dataset.dp;
        if (el.type === 'checkbox'){ it[k] = el.checked; return; }
        if (el.type === 'number'){
          const v = parseFloat(el.value);
          if (isNaN(v)) return;
          if (k === 'entryPrice') it.entry.price = v;
          else if (k === 'stopPrice') it.stop.price = v;
          else it[k] = v;
          return;
        }
        if (k === 'dash'){ it.dash = parseInt(el.value, 10) || 0; return; }
        it[k] = el.value;
      });
      this.save(); this.redraw(); this.showBar();
      App.hideModal('drawPropModal');
    };
    document.getElementById('drawPropDelete').onclick = () => {
      App.hideModal('drawPropModal');
      this.remove(id);
    };
    App.showModal('drawPropModal');
  },
};
