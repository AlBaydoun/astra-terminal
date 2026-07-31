/* ASTRA Terminal — drawing tools layer (trend line, ray, horizontal, fibonacci, alert, delete) */
const Draw = {
  tool: null,
  temp: null,        // first anchor while a 2-point tool is in progress
  cursor: null,
  items: [],
  canvas: null, ctx: null, cssW: 0, cssH: 0,

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
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape'){ this.temp = null; this.setTool(null); this.redraw(); }
    });
    this.loadFor(STORE.symbol);
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
  },

  save(){ lsSet('astra_draw_' + STORE.symbol, this.items); },
  loadFor(sym){ this.items = lsGet('astra_draw_' + sym, []); this.redraw(); },

  /* --- chart input (routed from lightweight-charts events) --- */
  onClick(p){
    if (!this.tool || !p || !p.point || !Chart.priceSeries) return;
    const price = Chart.priceSeries.coordinateToPrice(p.point.y);
    const time = Chart.main.timeScale().coordinateToTime(p.point.x);
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
    if (this.tool === 'hline'){
      this.items.push({ type: 'hline', price });
      this.save(); this.redraw(); this.setTool(null);
      return;
    }
    if (time == null){ toast('Click inside the chart area', 'warn'); return; }
    if (!this.temp){ this.temp = { time, price }; this.redraw(); return; }
    this.items.push({ type: this.tool, p1: this.temp, p2: { time, price } });
    this.temp = null; this.save(); this.redraw(); this.setTool(null);
  },

  onMove(p){
    if (this.temp && p && p.point){ this.cursor = { x: p.point.x, y: p.point.y }; this.redraw(); }
  },

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
    if (!Chart.priceSeries) return null;
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
    for (const it of this.items) this.drawItem(ctx, it, false);
    if (this.temp && this.cursor && this.tool && this.tool !== 'hline'){
      const a = this.toXY(this.temp);
      if (a) this.drawItem(ctx, { type: this.tool, p1: this.temp,
        p2: { time: 0, price: 0 }, _previewTo: this.cursor }, true, a);
    }
  },

  drawItem(ctx, it, preview, aPre){
    ctx.save();
    if (it.type === 'hline'){
      const y = Chart.priceSeries.priceToCoordinate(it.price);
      if (y != null){
        ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 1; ctx.setLineDash([6, 4]);
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(this.cssW, y); ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(255,209,102,0.9)';
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(fmtPrice(it.price), 6, y - 4);
      }
      ctx.restore(); return;
    }
    const a = aPre || this.toXY(it.p1);
    const b = it._previewTo || this.toXY(it.p2);
    if (!a || !b){ ctx.restore(); return; }

    if (it.type === 'trend' || it.type === 'ray'){
      ctx.strokeStyle = it.type === 'ray' ? CFG.ACCENT2 : CFG.ACCENT;
      ctx.lineWidth = 1.6;
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
      const x1 = Math.min(a.x, b.x), x2 = this.cssW;
      const p1 = preview ? Chart.priceSeries.coordinateToPrice(a.y) : it.p1.price;
      const p2 = preview ? Chart.priceSeries.coordinateToPrice(b.y) : it.p2.price;
      if (p1 == null || p2 == null){ ctx.restore(); return; }
      const cols = ['#8b6cff', '#00e5ff', '#00e5a0', '#ffd166', '#ff9f6b', '#ff4d6d', '#8b6cff'];
      let prevY = null;
      this.FIB_LEVELS.forEach((lvl, i) => {
        const price = p1 + (p2 - p1) * lvl;
        const y = Chart.priceSeries.priceToCoordinate(price);
        if (y == null) return;
        ctx.strokeStyle = cols[i]; ctx.globalAlpha = 0.85; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = cols[i];
        ctx.font = '10px "JetBrains Mono", monospace';
        ctx.fillText(lvl.toFixed(3) + '  ' + fmtPrice(price), x1 + 4, y - 3);
        if (prevY != null){
          ctx.fillStyle = cols[i];
          ctx.globalAlpha = 0.05;
          ctx.fillRect(x1, Math.min(prevY, y), x2 - x1, Math.abs(y - prevY));
          ctx.globalAlpha = 1;
        }
        prevY = y;
      });
      ctx.strokeStyle = 'rgba(139,108,255,0.6)'; ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.restore();
  },

  /* --- deletion --- */
  distToSeg(px, py, x1, y1, x2, y2){
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = x1 + t * dx, cy = y1 + t * dy;
    return Math.hypot(px - cx, py - cy);
  },
  deleteNear(x, y){
    for (let i = this.items.length - 1; i >= 0; i--){
      const it = this.items[i];
      let hit = false;
      if (it.type === 'hline'){
        const ly = Chart.priceSeries.priceToCoordinate(it.price);
        hit = ly != null && Math.abs(y - ly) < 8;
      } else {
        const a = this.toXY(it.p1), b = this.toXY(it.p2);
        if (a && b){
          if (it.type === 'ray' && b.x !== a.x){
            const slope = (b.y - a.y) / (b.x - a.x);
            const x2 = b.x > a.x ? this.cssW : 0;
            hit = this.distToSeg(x, y, a.x, a.y, x2, a.y + slope * (x2 - a.x)) < 8;
          } else if (it.type === 'fib'){
            const p1 = it.p1.price, p2 = it.p2.price;
            hit = this.FIB_LEVELS.some(lvl => {
              const ly = Chart.priceSeries.priceToCoordinate(p1 + (p2 - p1) * lvl);
              return ly != null && Math.abs(y - ly) < 6 && x >= Math.min(a.x, b.x) - 4;
            });
          } else {
            hit = this.distToSeg(x, y, a.x, a.y, b.x, b.y) < 8;
          }
        }
      }
      if (hit){
        this.items.splice(i, 1);
        this.save(); this.redraw();
        toast('Drawing removed', 'info');
        return;
      }
    }
  },
};
