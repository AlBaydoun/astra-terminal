/* ASTRA / Timurila — Tm3D: small real-3D scenes on a plain canvas (no library, works offline).

   A scene is a list of things in a cube from -1 to 1 on each axis. Every frame they are turned
   (yaw, pitch), projected with perspective, sorted far to near and painted. Drag turns the scene,
   it drifts slowly on its own, hovering names what is under the pointer and a click drills in.

     Tm3D.galaxy(canvas, { balls, axes, onPick, tip })  — one shaded sphere per item, on a stem
     Tm3D.city(canvas, { rows, cols, v, onPick, tip })  — a grid of bars, up for gains, down for losses

   Pure drawing: nothing here reads the bridge or trades. */
class Tm3D {
  constructor(cv, o){
    this.cv = cv; this.o = o || {}; this.yaw = this.o.yaw != null ? this.o.yaw : -0.62; this.pitch = this.o.pitch != null ? this.o.pitch : 0.42; this.dist = 4.4;
    this.spin = this.o.spin != null ? this.o.spin : 0.1; this.hover = -1; this.drag = null; this.idle = 0; this.items = []; this.last = 0; this.grow = 0;
    this.still = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    cv.style.touchAction = 'none'; cv.style.cursor = 'grab';
    cv.addEventListener('pointerdown', e => { if (this.o.swing){ this.o.swing = null; this.spin = 0; }   /* once you turn it yourself, it stays where you leave it */
      this.drag = { x: e.clientX, y: e.clientY, yaw: this.yaw, pitch: this.pitch, moved: 0 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); this.mx = e.clientX - r.left; this.my = e.clientY - r.top;
      if (this.drag){ const dx = e.clientX - this.drag.x, dy = e.clientY - this.drag.y; this.drag.moved = Math.max(this.drag.moved, Math.abs(dx) + Math.abs(dy)); this.yaw = this.drag.yaw + dx * 0.008; this.pitch = Math.max(0.08, Math.min(1.25, this.drag.pitch + dy * 0.006)); this.idle = 4; } });
    const up = e => { const d = this.drag; this.drag = null; cv.style.cursor = 'grab'; if (d && d.moved < 5 && this.hover >= 0 && this.o.onPick) this.o.onPick(this.items[this.hover]); };
    cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', () => { this.drag = null; });
    cv.addEventListener('pointerleave', () => { this.mx = null; this.hover = -1; if (this.o.tip) this.o.tip(null); });
    const loop = now => { if (!cv.isConnected) return; requestAnimationFrame(loop); if (document.hidden || cv.offsetParent === null) return; if (now - this.last < 30) return; const dt = Math.min(0.1, (now - this.last) / 1000 || 0); this.last = now;
      if (this.idle > 0) this.idle -= dt; else if (!this.drag && !this.still && this.hover < 0){ if (this.o.swing){ this._sw = (this._sw || 0) + dt; this.yaw = this.o.swing[0] + Math.sin(this._sw * 0.45) * this.o.swing[1]; } else this.yaw += this.spin * dt; } this.grow = Math.min(1, this.grow + dt * 1.4); this.draw(); };
    requestAnimationFrame(loop);
  }
  fit(){ const dpr = window.devicePixelRatio || 1, w = this.cv.clientWidth, h = this.cv.clientHeight; if (this.cv.width !== Math.round(w * dpr) || this.cv.height !== Math.round(h * dpr)){ this.cv.width = Math.round(w * dpr); this.cv.height = Math.round(h * dpr); }
    const c = this.cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); this.w = w; this.h = h; const k = this.o.kind; this.S = Math.min(w * (k === 'candles' ? 0.26 : 0.33), h * (k === 'city' ? 0.52 : k === 'candles' ? 0.5 : 0.4)); this.cx = w / 2; this.cy = h * (k === 'city' ? 0.6 : k === 'candles' ? 0.5 : 0.56); return c; }
  /* a point of the cube -> screen x, y, scale and depth (larger depth = further away) */
  P(x, y, z){ const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), x1 = x * cy + z * sy, z1 = -x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, f = this.dist / (this.dist + z2);
    return { x: this.cx + x1 * f * this.S, y: this.cy - y2 * f * this.S, f, d: z2 }; }
  ease(t){ return 1 - Math.pow(1 - t, 3); }
  floor(c, y, n){ c.lineWidth = 1; for (let i = 0; i <= n; i++){ const t = -1 + 2 * i / n, a = this.P(t, y, -1), b = this.P(t, y, 1), d = this.P(-1, y, t), e = this.P(1, y, t); c.strokeStyle = 'rgba(126,156,224,' + (i % (n / 2) === 0 ? 0.3 : 0.13) + ')'; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.moveTo(d.x, d.y); c.lineTo(e.x, e.y); c.stroke(); } }
  text(c, t, p, col, font, align){ c.font = font || '11px Inter, sans-serif'; c.textAlign = align || 'center'; c.textBaseline = 'middle'; c.lineWidth = 3; c.strokeStyle = 'rgba(6,10,18,.85)'; c.lineJoin = 'round'; c.strokeText(t, p.x, p.y); c.fillStyle = col || '#9FB0CE'; c.fillText(t, p.x, p.y); }
  draw(){ const c = this.fit(); c.clearRect(0, 0, this.w, this.h); if (this.o.kind === 'city') this.drawCity(c); else if (this.o.kind === 'candles') this.drawCandles(c); else this.drawGalaxy(c);
    if (this.o.tip) this.o.tip(this.hover >= 0 ? this.items[this.hover] : null, this.mx, this.my); }

  /* ---- spheres on stems: x = right, y = up, z = depth ---- */
  drawGalaxy(c){
    const A = this.o.axes || {}, g = this.ease(this.grow); this.floor(c, -1, 8);
    /* the three axes and what each one means */
    const ax = (a, b, label, col) => { const p = this.P(...a), q = this.P(...b); c.strokeStyle = col; c.lineWidth = 1.4; c.beginPath(); c.moveTo(p.x, p.y); c.lineTo(q.x, q.y); c.stroke(); this.text(c, label, { x: q.x + (q.x - p.x) * 0.06, y: q.y + (q.y - p.y) * 0.06 }, col, '600 11px Inter, sans-serif'); };
    ax([-1, -1, -1], [1.08, -1, -1], A.x || '', '#4FD8F7'); ax([-1, -1, -1], [-1, 1.1, -1], A.y || '', '#FFB648'); ax([-1, -1, -1], [-1, -1, 1.1], A.z || '', '#9FB0CE');
    if (A.zero != null){ const y0 = A.zero, a = this.P(-1, y0, -1), b = this.P(1, y0, -1), d = this.P(1, y0, 1), e = this.P(-1, y0, 1); c.fillStyle = 'rgba(255,182,72,.05)'; c.strokeStyle = 'rgba(255,182,72,.35)'; c.setLineDash([4, 5]); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.lineTo(d.x, d.y); c.lineTo(e.x, e.y); c.closePath(); c.fill(); c.stroke(); c.setLineDash([]); }
    const pr = this.items.map((it, i) => { const y = -1 + (it.y + 1) * g, p = this.P(it.x, y, it.z), f = this.P(it.x, -1, it.z); return { i, it, p, f, r: Math.max(3, it.r * p.f) }; }).sort((a, b) => b.p.d - a.p.d);
    let hov = -1, best = 1e9;
    for (const q of pr){ const it = q.it, p = q.p, on = q.i === this.hover;
      c.strokeStyle = 'rgba(126,156,224,.28)'; c.lineWidth = 1; c.beginPath(); c.moveTo(q.f.x, q.f.y); c.lineTo(p.x, p.y); c.stroke(); c.fillStyle = 'rgba(126,156,224,.35)'; c.beginPath(); c.ellipse(q.f.x, q.f.y, q.r * 0.55, q.r * 0.22, 0, 0, 6.3); c.fill();
      const gr = c.createRadialGradient(p.x - q.r * 0.35, p.y - q.r * 0.4, q.r * 0.1, p.x, p.y, q.r); gr.addColorStop(0, '#FFFFFF'); gr.addColorStop(0.22, it.col); gr.addColorStop(1, it.dark || '#0B1322');
      c.shadowColor = it.col; c.shadowBlur = on ? 26 : 10; c.fillStyle = gr; c.beginPath(); c.arc(p.x, p.y, q.r, 0, 6.3); c.fill(); c.shadowBlur = 0;
      if (it.ring){ c.strokeStyle = '#FFB648'; c.lineWidth = 1.6; c.beginPath(); c.ellipse(p.x, p.y, q.r * 1.7, q.r * 0.55, -0.35, 0, 6.3); c.stroke(); }
      if (on){ c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(p.x, p.y, q.r + 3, 0, 6.3); c.stroke(); }
      if (it.label && (it.show || on)) this.text(c, it.label, { x: p.x, y: p.y - q.r - 9 }, on ? '#fff' : '#C9D6EE', (on ? '600 ' : '') + '11px Inter, sans-serif');
      if (this.mx != null){ const d = Math.hypot(this.mx - p.x, this.my - p.y); if (d < q.r + 5 && d <= best + 8){ best = d; hov = q.i; } } }
    this.hover = this.drag ? this.hover : hov;
  }

  /* ---- bars on a floor: rows along z, columns along x ---- */
  drawCity(c){
    const o = this.o, R = o.rows.length, C = o.cols.length, g = this.ease(this.grow), max = Math.max(1e-9, ...o.v.flat().map(Math.abs)), sx = 2 / C, sz = 2 / R, pad = 0.14; this.floor(c, 0, 8);
    const bars = []; for (let r = 0; r < R; r++) for (let k = 0; k < C; k++){ const val = o.v[r][k]; if (!val) continue; const x0 = -1 + k * sx + sx * pad, x1 = -1 + (k + 1) * sx - sx * pad, z0 = -1 + r * sz + sz * pad, z1 = -1 + (r + 1) * sz - sz * pad, hgt = val / max * 0.95 * g;
      bars.push({ i: bars.length, r, k, val, x0, x1, z0, z1, y0: Math.min(0, hgt), y1: Math.max(0, hgt), d: this.P((x0 + x1) / 2, hgt / 2, (z0 + z1) / 2).d }); }
    this.items = bars.map(b => ({ row: o.rows[b.r], col: o.cols[b.k], r: b.r, k: b.k, val: b.val, n: o.n ? o.n[b.r][b.k] : null }));
    bars.sort((a, b) => b.d - a.d); let hov = -1;
    for (const b of bars){ const up = b.val > 0, on = b.i === this.hover, base = up ? [61, 220, 151] : [255, 107, 122], P = (x, y, z) => this.P(x, y, z);
      const V = [P(b.x0, b.y0, b.z0), P(b.x1, b.y0, b.z0), P(b.x1, b.y0, b.z1), P(b.x0, b.y0, b.z1), P(b.x0, b.y1, b.z0), P(b.x1, b.y1, b.z0), P(b.x1, b.y1, b.z1), P(b.x0, b.y1, b.z1)];
      const faces = [[0, 1, 5, 4, 0.62], [1, 2, 6, 5, 0.8], [2, 3, 7, 6, 0.5], [3, 0, 4, 7, 0.7], [4, 5, 6, 7, 1], [0, 1, 2, 3, 0.4]].map(f => ({ f, d: (V[f[0]].d + V[f[1]].d + V[f[2]].d + V[f[3]].d) / 4 })).sort((a, b) => b.d - a.d);
      let inside = false;
      for (const q of faces){ const f = q.f, s = f[4] * (on ? 1.25 : 1); c.beginPath(); c.moveTo(V[f[0]].x, V[f[0]].y); for (let j = 1; j < 4; j++) c.lineTo(V[f[j]].x, V[f[j]].y); c.closePath();
        c.fillStyle = 'rgba(' + base.map(x => Math.min(255, Math.round(x * s))).join(',') + ',' + (up ? 0.92 : 0.8) + ')'; c.fill(); c.strokeStyle = 'rgba(6,10,18,.55)'; c.lineWidth = 0.8; c.stroke();
        if (this.mx != null && c.isPointInPath(this.mx * (window.devicePixelRatio || 1), this.my * (window.devicePixelRatio || 1))) inside = true; }
      if (inside) hov = b.i; }
    this.hover = this.drag ? this.hover : hov;
    for (let k = 0; k < C; k++){ if (o.colStep && k % o.colStep) continue; this.text(c, o.cols[k], this.P(-1 + (k + 0.5) * sx, 0, 1.13), '#9FB0CE', '10px JetBrains Mono, monospace'); }
    for (let r = 0; r < R; r++) this.text(c, o.rows[r], this.P(-1.14, 0, -1 + (r + 0.5) * sz), '#9FB0CE', '10px Inter, sans-serif');
  }

  /* ---- a trade in 3D: candles as slabs (thicker = more volume), stop / entry / target as sheets of glass ---- */
  box(c, x0, x1, y0, y1, z0, z1, rgb, a){ const V = [this.P(x0, y0, z0), this.P(x1, y0, z0), this.P(x1, y0, z1), this.P(x0, y0, z1), this.P(x0, y1, z0), this.P(x1, y1, z0), this.P(x1, y1, z1), this.P(x0, y1, z1)];
    const F = [[0, 1, 5, 4, 0.62], [1, 2, 6, 5, 0.8], [2, 3, 7, 6, 0.5], [3, 0, 4, 7, 0.7], [4, 5, 6, 7, 1], [0, 1, 2, 3, 0.4]].map(f => ({ f, d: (V[f[0]].d + V[f[1]].d + V[f[2]].d + V[f[3]].d) / 4 })).sort((p, q) => q.d - p.d);
    for (const q of F){ const f = q.f; c.beginPath(); c.moveTo(V[f[0]].x, V[f[0]].y); for (let j = 1; j < 4; j++) c.lineTo(V[f[j]].x, V[f[j]].y); c.closePath(); c.fillStyle = 'rgba(' + rgb.map(x => Math.min(255, Math.round(x * f[4]))).join(',') + ',' + a + ')'; c.fill(); c.strokeStyle = 'rgba(6,10,18,.5)'; c.lineWidth = 0.6; c.stroke(); } }
  quad(c, pts, fill, stroke){ c.beginPath(); pts.forEach((p, i) => { const q = this.P(p[0], p[1], p[2]); i ? c.lineTo(q.x, q.y) : c.moveTo(q.x, q.y); }); c.closePath(); if (fill){ c.fillStyle = fill; c.fill(); } if (stroke){ c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); } }
  drawCandles(c){ const o = this.o, B = o.bars, n = B.length; if (!n) return; const cur = Math.max(0, Math.min(n - 1, o.cur)), XW = 1.35, ZW = 0.5, FL = -0.88, X = i => -XW + 2 * XW * (i + 0.5) / n, Y = p => -0.85 + 1.7 * (p - o.lo) / ((o.hi - o.lo) || 1), maxV = Math.max(1, ...B.map(b => b.v || 0)), w = 2 * XW / n * 0.36;
    c.lineWidth = 1; c.strokeStyle = 'rgba(126,156,224,.14)';
    for (let i = 0; i <= 10; i++){ const x = -XW + 2 * XW * i / 10, a = this.P(x, FL, -ZW), b = this.P(x, FL, ZW); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    for (let i = 0; i <= 4; i++){ const z = -ZW + 2 * ZW * i / 4, a = this.P(-XW, FL, z), b = this.P(XW, FL, z); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
    const xe = X(o.iE) - w, xx = X(Math.min(cur, o.iX)) + w; if (cur >= o.iE) this.quad(c, [[xe, FL, -ZW], [xx, FL, -ZW], [xx, FL, ZW], [xe, FL, ZW]], o.win ? 'rgba(61,220,151,.18)' : 'rgba(255,107,122,.18)');
    const sheet = (p, rgb, label) => { if (!(p > 0) || p < o.lo || p > o.hi) return; const y = Y(p); this.quad(c, [[xe, y, -ZW], [XW, y, -ZW], [XW, y, ZW], [xe, y, ZW]], 'rgba(' + rgb + ',.10)', 'rgba(' + rgb + ',.55)'); this.text(c, label, this.P(XW + 0.1, y, ZW), 'rgb(' + rgb + ')', '600 11px Inter, sans-serif', 'left'); };
    sheet(o.tp, '61,220,151', 'target'); sheet(o.sl, '255,107,122', 'stop'); sheet(o.entry, '79,216,247', 'entry');
    const list = []; for (let i = 0; i <= cur; i++) list.push({ i, d: this.P(X(i), Y((B[i].o + B[i].c) / 2), 0).d }); list.sort((a, b) => b.d - a.d);
    for (const q of list){ const b = B[q.i], up = b.c >= b.o, x = X(q.i), d = 0.05 + 0.4 * ((b.v || 0) / maxV), y0 = Y(Math.min(b.o, b.c)), y1 = Math.max(y0 + 0.012, Y(Math.max(b.o, b.c))), inT = q.i >= o.iE && q.i <= o.iX;
      const a = this.P(x, Y(b.l), 0), e = this.P(x, Y(b.h), 0); c.strokeStyle = up ? 'rgba(61,220,151,.9)' : 'rgba(255,107,122,.9)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(e.x, e.y); c.stroke();
      this.box(c, x - w, x + w, y0, y1, -d, d, up ? [61, 220, 151] : [255, 107, 122], inT ? 0.95 : 0.62); }
    const dot = (i, p, col, label) => { const q = this.P(X(i), Y(p), ZW * 0.92); c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 14; c.beginPath(); c.arc(q.x, q.y, 6 * q.f, 0, 6.3); c.fill(); c.shadowBlur = 0; this.text(c, label, { x: q.x, y: q.y - 14 }, col, '600 11px Inter, sans-serif'); };
    if (cur >= o.iE) dot(o.iE, o.entry, '#4FD8F7', o.dir > 0 ? 'Buy' : 'Sell'); if (cur >= o.iX && o.exit > 0) dot(o.iX, o.exit, o.win ? '#3DDC97' : '#FF6B7A', 'Out');
  }

  static candles(cv, o){ const t = cv._tm3d || (cv._tm3d = new Tm3D(cv, { pitch: 0.3, yaw: -0.45, spin: 0 })); if (t.o.kind !== 'candles') t.o.swing = [-0.45, 0.32]; Object.assign(t.o, o, { kind: 'candles' }); t.grow = 1; return t; }
  static galaxy(cv, o){ const t = cv._tm3d || (cv._tm3d = new Tm3D(cv, {})); const fresh = !t.items.length || t.o.kind !== 'galaxy'; Object.assign(t.o, o, { kind: 'galaxy' }); t.items = o.balls; if (fresh) t.grow = 0; return t; }
  static city(cv, o){ const t = cv._tm3d || (cv._tm3d = new Tm3D(cv, { pitch: 0.62, yaw: -0.7, spin: 0.06 })); const key = JSON.stringify(o.v); if (t._key !== key){ t._key = key; t.grow = 0; } Object.assign(t.o, o, { kind: 'city' }); return t; }
}
