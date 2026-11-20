/* Timurila — the chart studio canvas.
   Candles, axes, crosshair, zoom and pan are drawn here. What sits on top comes from two engines
   that Classic shares: Studio (../js/studio.js — level zones, trend channel, events, moving average,
   signal labels, usual range) and Patterns (../js/chartpatterns.js — the sloped 3-D zones).
   Read only: it draws, it never trades. */
class TChart {
  constructor(box){
    this.box = box; this.cv = document.createElement('canvas'); this.cv.style.touchAction = 'none'; box.appendChild(this.cv);
    this.ctx = this.cv.getContext('2d');
    this.raw = []; this.sym = ''; this.tf = '1h'; this.step = 11; this.off = 0; this.FUT = 26;
    this.layers = { zones: true, channel: true, events: true, ma: true, signals: false, range: false, classic: false };
    this.mouse = null; this.R = null; this.S = null; this.t0 = 0; this.last = 0; this.onHover = null; this.active = true;
    this.padR = 68; this.padT = 8; this.padB = 24;
    new ResizeObserver(() => this.resize()).observe(box);
    const cv = this.cv;
    cv.addEventListener('wheel', e => { e.preventDefault(); const mx = e.offsetX, idx = this.iAt(mx);
      this.step = Math.max(3, Math.min(40, this.step * (e.deltaY < 0 ? 1.12 : 1 / 1.12)));
      this.off = this.clampOff(this.raw.length - 1 + this.FUT - (idx + (this.plotW - mx - this.step / 2) / this.step)); this.draw(); }, { passive: false });
    cv.addEventListener('pointerdown', e => { this.drag = { x: e.clientX, off: this.off }; cv.setPointerCapture(e.pointerId); });
    cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); this.mouse = { x: e.clientX - r.left, y: e.clientY - r.top };
      if (this.drag) this.off = this.clampOff(this.drag.off + (e.clientX - this.drag.x) / this.step); this.draw(); this.hover(); });
    const end = () => { this.drag = null; };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
    cv.addEventListener('pointerleave', () => { this.mouse = null; this.draw(); this.hover(); });
    cv.addEventListener('dblclick', () => { this.off = 0; this.step = 11; this.draw(); });
    this.resize();
    const loop = now => { requestAnimationFrame(loop);
      if (!this.active || document.hidden || !this.raw.length) return;
      const intro = now - this.t0 < 900, glow = T.motion() && ((this.layers.zones && this.S) || (this.layers.classic && this.R));
      if ((intro || glow) && now - this.last > (intro ? 16 : 50)) this.draw(now); };
    requestAnimationFrame(loop);
  }
  clampOff(o){ return Math.max(0, Math.min(Math.max(0, this.raw.length - 12), o)); }
  resize(){ const r = this.box.getBoundingClientRect(), d = window.devicePixelRatio || 1; this.W = r.width; this.H = r.height;
    this.cv.width = Math.max(1, Math.round(this.W * d)); this.cv.height = Math.max(1, Math.round(this.H * d)); this.ctx.setTransform(d, 0, 0, d, 0, 0);
    this.plotW = this.W - this.padR; this.plotH = this.H - this.padT - this.padB; this.draw(); }
  set(raw, sym, tf){
    this.raw = raw; this.sym = sym; this.tf = tf; this.off = 0; this.R = null; this.S = null;
    if (raw.length >= 60){
      try { this.S = Studio.analyse(raw); } catch(e){ console.warn('studio', e); }
      try { this.R = ChartPatterns.analyse(raw); } catch(e){ console.warn('patterns', e); }
    }
    this.t0 = performance.now(); this.draw(this.t0);
  }
  /* the newest candle only (live tick): keep the view, no intro */
  tick(raw){ const keep = this.off, t = this.t0; this.set(raw, this.sym, this.tf); this.off = this.clampOff(keep); this.t0 = t; this.draw(); }
  get rgt(){ return this.raw.length - 1 + this.FUT - this.off; }
  x(i){ return this.plotW - (this.rgt - i) * this.step - this.step / 2; }
  iAt(x){ return this.rgt - (this.plotW - x - this.step / 2) / this.step; }
  y(p){ return this.padT + (this.hi - p) / (this.hi - this.lo) * this.plotH; }
  pAt(y){ return this.hi - (y - this.padT) / this.plotH * (this.hi - this.lo); }
  hover(){ if (!this.onHover) return; const i = this.mouse ? Math.round(this.iAt(this.mouse.x)) : -1; this.onHover(this.raw[i] || null); }
  fmt(p){ const d = (T.quotes[this.sym] || {}).digits; return T.num(p, d != null ? Math.min(d, 5) : (p > 100 ? 2 : 5)); }

  draw(now){
    const ctx = this.ctx, W = this.W, H = this.H, n = this.raw.length; this.last = now || performance.now();
    ctx.clearRect(0, 0, W, H); if (!n || W < 80) return;
    const c = this.raw, pw = this.plotW, i0 = Math.max(0, Math.floor(this.iAt(0))), i1 = Math.min(n - 1, Math.ceil(this.iAt(pw))), LY = this.layers, S = this.S;
    let lo = Infinity, hi = -Infinity; for (let i = i0; i <= i1; i++){ if (c[i].low < lo) lo = c[i].low; if (c[i].high > hi) hi = c[i].high; }
    if (!(hi > lo)){ hi = c[n - 1].close * 1.01; lo = c[n - 1].close * 0.99; }
    if (LY.range && S && S.sd1 && this.off < 6){ const w = c[n - 1].close * S.sd1 * Math.sqrt(24); hi = Math.max(hi, c[n - 1].close + w); lo = Math.min(lo, c[n - 1].close - w); }
    if (S && LY.zones){ const sp = hi - lo; for (const Z of S.zones) if (Z.lo < hi + 0.4 * sp && Z.hi > lo - 0.4 * sp){ hi = Math.max(hi, Z.hi); lo = Math.min(lo, Z.lo); } }   /* keep a nearby zone on screen */
    const pad = (hi - lo) * 0.11; this.hi = hi + pad; this.lo = lo - pad;
    const X = i => this.x(i), Y = p => this.y(p), css = getComputedStyle(document.body), mono = css.getPropertyValue('--font-mono') || 'monospace', sans = css.getPropertyValue('--font-sans') || 'sans-serif';

    /* grid and price axis */
    const span = this.hi - this.lo, rawStep = span / 6, mag = Math.pow(10, Math.floor(Math.log10(rawStep))), nice = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= rawStep) || rawStep;
    ctx.font = '11px ' + mono; ctx.textBaseline = 'middle'; ctx.lineWidth = 1;
    for (let p = Math.ceil(this.lo / nice) * nice; p < this.hi; p += nice){ const yy = Math.round(Y(p)) + 0.5;
      ctx.strokeStyle = '#16223A'; ctx.beginPath(); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke();
      ctx.fillStyle = '#A9B6CA'; ctx.textAlign = 'left'; ctx.fillText(this.fmt(p), pw + 8, yy); }
    /* time axis: a label where the day (or, on daily candles, the month) changes */
    let lastX = -999; const daily = this.tf === '1d' || this.tf === '1w';
    for (let i = Math.max(1, i0); i <= i1; i++){ const a = new Date(c[i - 1].time * 1000), b = new Date(c[i].time * 1000);
      const turn = daily ? a.getUTCMonth() !== b.getUTCMonth() : a.getUTCDate() !== b.getUTCDate(); if (!turn) continue;
      const xx = Math.round(X(i)) + 0.5; if (xx - lastX < 84) continue; lastX = xx;
      ctx.fillStyle = '#A9B6CA'; ctx.textAlign = 'center';
      ctx.fillText(daily ? b.toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' }) : b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }), xx, H - this.padB / 2); }

    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, pw, this.padT + this.plotH); ctx.clip();
    const R = this.R, C = R ? ChartPatterns.cfg() : null, pulse = T.motion() ? 1 + 0.22 * Math.sin(this.last / 900) : 1;
    const view = on => ({ X, Y, left: 0, right: pw, i0, i1, bars: c, layers: on, fmt: p => this.fmt(p), pulse, sans, mono });
    /* under the candles: the Studio's level zones, or Classic's sloped ones */
    if (S && LY.zones) Studio.paint(ctx, S, view({ zones: true }));
    if (R && LY.classic){
      const zone = (line, St, label) => { const g0 = R.base + line.first, g1 = this.iAt(pw), p0 = line.at(g0 - R.base), p1 = line.at(g1 - R.base);
        const P = { x0: X(g0), x1: pw, y0a: Y(p0 + R.z), y0b: Y(p0 - R.z), y1a: Y(p1 + R.z), y1b: Y(p1 - R.z) };
        if (Object.values(P).every(Number.isFinite)) ChartPatterns.band(ctx, P, Object.assign({}, St, { glow: St.glow * pulse }), C, label); };
      if (R.top) zone(R.top, C.res, R.names.top); if (R.bot) zone(R.bot, C.sup, R.names.bot);
    }
    /* candles, with a short left-to-right reveal when a chart loads */
    const p = Math.min(1, (this.last - this.t0) / 700), bw = Math.max(1, this.step * 0.62);
    for (let i = i0; i <= i1; i++){ const b = c[i], up = b.close >= b.open, xx = X(i), rel = (i - i0) / (i1 - i0 + 1), a = p >= 1 ? 1 : Math.max(0, Math.min(1, (p * 1.5 - rel) * 4));
      if (a <= 0) continue; ctx.globalAlpha = a; const dy = (1 - a) * 10; ctx.fillStyle = up ? '#3DDC97' : '#FF6B7A'; ctx.strokeStyle = '#8391A8'; ctx.lineWidth = 1.1;
      ctx.beginPath(); ctx.moveTo(Math.round(xx) + 0.5, Y(b.high) + dy); ctx.lineTo(Math.round(xx) + 0.5, Y(b.low) + dy); ctx.stroke();
      const y0 = Y(Math.max(b.open, b.close)) + dy, hgt = Math.max(1, Math.abs(Y(b.open) - Y(b.close))); ctx.fillRect(xx - bw / 2, y0, bw, hgt); }
    ctx.globalAlpha = 1;
    /* over the candles: Classic's trend curve and marks */
    if (R && LY.classic){ const St = C.curve; ctx.lineWidth = St.width; ctx.strokeStyle = ChartPatterns.rgba(St.color, 0.85); ctx.shadowColor = St.color; ctx.shadowBlur = 6; ctx.beginPath();
      R.curve.forEach((v, i) => { i ? ctx.lineTo(X(R.base + i), Y(v)) : ctx.moveTo(X(R.base + i), Y(v)); }); ctx.stroke(); ctx.shadowBlur = 0;
      const k = R.curve.length - 1, xa = X(R.base + k), ya = Y(R.curve[k]), xb = X(R.base + k - 3), yb = Y(R.curve[k - 3]), ang = Math.atan2(ya - yb, xa - xb);
      ctx.fillStyle = ChartPatterns.rgba(St.color, 0.95); ctx.beginPath(); ctx.moveTo(xa + Math.cos(ang) * 10, ya + Math.sin(ang) * 10); ctx.lineTo(xa + Math.cos(ang + 2.5) * 9, ya + Math.sin(ang + 2.5) * 9); ctx.lineTo(xa + Math.cos(ang - 2.5) * 9, ya + Math.sin(ang - 2.5) * 9); ctx.closePath(); ctx.fill();
      const per = {}, drawn = []; ctx.font = '700 10.5px ' + mono;
      const marks = R.marks.map(m => Object.assign({}, m, { gi: R.base + m.i })).sort((a, b) => b.gi - a.gi).filter(m => (per[m.kind] = (per[m.kind] || 0) + 1) <= C.maxMarks);
      for (const m of marks){ const xx = X(m.gi), yy = Y(m.p), col = C.marks[m.kind];
        if (drawn.some(d => Math.abs(d.x - xx) < 62 && Math.abs(d.y - yy) < 22)) continue; drawn.push({ x: xx, y: yy });
        const below = m.kind === 'bounce' || (m.kind === 'retest' && m.p <= (R.top ? R.top.at(m.i) : m.p)) || (m.kind === 'breakout' && !m.up), ty = below ? yy + 18 : yy - 18;
        ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(xx, below ? yy + 3 : yy - 3); ctx.lineTo(xx, below ? ty - 8 : ty + 8); ctx.stroke();
        const tw = ctx.measureText(m.text).width + 10; ctx.fillStyle = 'rgba(8,12,24,.9)'; ChartPatterns.pill(ctx, xx - tw / 2, ty - 8, tw, 16, 8); ctx.fill(); ctx.stroke();
        ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(m.text, xx, ty); }
      const lines = [[R.trend, R.trend === 'Uptrend' ? '#00e676' : R.trend === 'Downtrend' ? '#ff5252' : '#ffd740'], [R.pattern || '', '#e8eaf6'], [R.continuation || '', '#40c4ff']].filter(l => l[0]);
      let yy = 22; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      lines.forEach(([t, col], k2) => { ctx.font = (k2 ? '600 12px ' : '700 13px ') + sans; const tw = ctx.measureText(t).width + 18; ctx.fillStyle = 'rgba(6,10,22,.82)'; ChartPatterns.pill(ctx, 12, yy - 11, tw, 22, 6); ctx.fill();
        ctx.strokeStyle = ChartPatterns.rgba(col, 0.7); ctx.lineWidth = 1; ctx.stroke(); ctx.fillStyle = col; ctx.fillText(t, 21, yy + 0.5); yy += 26; }); }
    /* over the candles: the Studio's channel, moving average, events, signal labels and usual range */
    if (S) Studio.paint(ctx, S, view({ channel: LY.channel, ma: LY.ma, events: LY.events, signals: LY.signals, range: LY.range }));
    /* last price line */
    const lc = c[n - 1].close;
    ctx.setLineDash([2, 5]); ctx.strokeStyle = 'rgba(79,216,247,.6)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, Math.round(Y(lc)) + 0.5); ctx.lineTo(pw, Math.round(Y(lc)) + 0.5); ctx.stroke(); ctx.setLineDash([]);
    ctx.restore();

    /* price tag and crosshair on the axis */
    const tag = (yy, text, bg, fg) => { ctx.fillStyle = bg; ChartPatterns.pill(ctx, pw + 3, yy - 10, this.padR - 6, 20, 5); ctx.fill(); ctx.fillStyle = fg; ctx.font = '600 11px ' + mono; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, pw + this.padR / 2, yy + 0.5); };
    tag(Y(lc), this.fmt(lc), '#4FD8F7', '#04121A');
    const m = this.mouse;
    if (m && m.x < pw && m.y > this.padT && m.y < this.padT + this.plotH && !this.drag){
      const i = Math.round(this.iAt(m.x)), xx = Math.round(X(i)) + 0.5, yy = Math.round(m.y) + 0.5;
      ctx.setLineDash([3, 4]); ctx.strokeStyle = 'rgba(201,212,229,.5)'; ctx.beginPath(); ctx.moveTo(xx, this.padT); ctx.lineTo(xx, this.padT + this.plotH); ctx.moveTo(0, yy); ctx.lineTo(pw, yy); ctx.stroke(); ctx.setLineDash([]);
      tag(yy, this.fmt(this.pAt(m.y)), '#22344F', '#EAF1FB');
      if (c[i]){ const d = new Date(c[i].time * 1000), t = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + (daily ? '' : ' ' + d.toISOString().slice(11, 16));
        ctx.font = '11px ' + mono; const tw = ctx.measureText(t).width + 12; ctx.fillStyle = '#22344F'; ChartPatterns.pill(ctx, Math.max(2, Math.min(pw - tw - 2, xx - tw / 2)), H - this.padB + 2, tw, 19, 5); ctx.fill();
        ctx.fillStyle = '#EAF1FB'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(t, Math.max(2 + tw / 2, Math.min(pw - tw / 2 - 2, xx)), H - this.padB + 12); }
    }
  }
}
