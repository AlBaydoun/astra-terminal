/* ASTRA / Timurila — pens: free drawing on the charts, and a magic pen whose ink fades away.

   PENS (kept on the chart, Replay and Inspect; stored with the other drawings in js/tmdraws.js):
     Pen · Marker · Highlighter · Neon · Dashed · Arrow — any colour, any thickness.
   MAGIC PEN (the live chart, Replay and Inspect): writes in glowing light — rainbow or one colour —
     and the ink fades away a few seconds later. Nothing is stored. For pointing at something while
     you think, or while someone watches.

   Ink.cur = { pen, c, w } is the pen in hand. Ink.menu(button, onPick) opens the pen case under a
   button. Ink.stroke(ctx, pts, style) draws a stroke whose points are already in pixels. */
const Ink = {
  PENS: [['pen', 'Pen', 'a clean line'], ['marker', 'Marker', 'thick and solid'], ['highlight', 'Highlighter', 'wide and see-through'], ['neon', 'Neon', 'a glowing tube'], ['dash', 'Dashed', 'a dashed line'], ['arrow', 'Arrow', 'a line that points'], ['magic', 'Magic pen', 'rainbow light that fades away'], ['magic1', 'Magic, one colour', 'light in your colour that fades away']],
  TIPS: [['round', 'Round'], ['square', 'Square'], ['chisel', 'Chisel'], ['brush', 'Brush'], ['pencil', 'Pencil']],
  COLS: ['#4FD8F7', '#FFB648', '#3DDC97', '#FF6B7A', '#A78BFA', '#FF6BD6', '#FFFFFF', '#F7E26B', '#7C8BA8', '#2E8BFF'],
  KEY: 'astra_ink_pen',
  cur: null,
  load(){ if (this.cur) return this.cur; let s = null; try { s = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch(e){} return (this.cur = Object.assign({ pen: 'pen', c: '#4FD8F7', w: 3, tip: 'round' }, s || {})); },
  save(){ try { localStorage.setItem(this.KEY, JSON.stringify(this.cur)); } catch(e){} },
  isMagic(p){ return /^magic/.test(p || this.load().pen); },

  /* ---------- drawing a stroke (pixels) ---------- */
  path(c, P){ c.beginPath(); c.moveTo(P[0][0], P[0][1]); if (P.length < 3){ for (let k = 1; k < P.length; k++) c.lineTo(P[k][0], P[k][1]); return; }
    for (let k = 1; k < P.length - 1; k++){ const mx = (P[k][0] + P[k + 1][0]) / 2, my = (P[k][1] + P[k + 1][1]) / 2; c.quadraticCurveTo(P[k][0], P[k][1], mx, my); } c.lineTo(P[P.length - 1][0], P[P.length - 1][1]); },
  stroke(c, P, s, sel){ if (!P || P.length < 1) return; const w = s.w || 3; c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    if (P.length === 1) P = [P[0], [P[0][0] + 0.1, P[0][1]]];
    if (sel){ c.strokeStyle = 'rgba(255,255,255,.35)'; c.lineWidth = Math.max(w * (s.pen === 'highlight' ? 6 : s.pen === 'marker' ? 2.6 : 1) + 6, 8); c.setLineDash([4, 4]); this.path(c, P); c.stroke(); c.setLineDash([]); }
    if (s.pen === 'highlight'){ c.globalAlpha = 0.3; c.strokeStyle = s.c; c.lineWidth = w * 6; c.lineCap = 'butt'; this.path(c, P); c.stroke(); }
    else if (s.tip && s.tip !== 'round' && /^(pen|marker|dash|arrow)$/.test(s.pen || 'pen')){ this.tipped(c, P, s, s.pen === 'marker' ? w * 2.6 : w); }
    else if (s.pen === 'marker'){ c.globalAlpha = 0.92; c.strokeStyle = s.c; c.lineWidth = w * 2.6; this.path(c, P); c.stroke(); }
    else if (s.pen === 'neon'){ c.strokeStyle = s.c; c.shadowColor = s.c; c.shadowBlur = 16; c.lineWidth = w * 1.6; this.path(c, P); c.stroke(); c.shadowBlur = 0; c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = Math.max(1, w * 0.45); this.path(c, P); c.stroke(); }
    else if (s.pen === 'dash'){ c.strokeStyle = s.c; c.lineWidth = w; c.setLineDash([w * 3, w * 2.4]); this.path(c, P); c.stroke(); c.setLineDash([]); }
    else { c.strokeStyle = s.c; c.lineWidth = w; this.path(c, P); c.stroke();
      if (s.pen === 'arrow' && P.length > 1){ const a = P[P.length - 1]; let b = P[Math.max(0, P.length - 6)]; const ang = Math.atan2(a[1] - b[1], a[0] - b[0]), L = 8 + w * 2.4; c.fillStyle = s.c; c.beginPath(); c.moveTo(a[0] + Math.cos(ang) * 2, a[1] + Math.sin(ang) * 2); c.lineTo(a[0] - L * Math.cos(ang - 0.45), a[1] - L * Math.sin(ang - 0.45)); c.lineTo(a[0] - L * Math.cos(ang + 0.45), a[1] - L * Math.sin(ang + 0.45)); c.closePath(); c.fill(); } }
    c.restore(); },
  /* the tip changes how the line meets the paper */
  tipped(c, P, s, base){ c.strokeStyle = s.c; c.fillStyle = s.c; if (s.pen === 'marker') c.globalAlpha = 0.92; if (s.pen === 'dash') c.setLineDash([base * 3, base * 2.4]);
    if (s.tip === 'square'){ c.lineCap = 'butt'; c.lineJoin = 'miter'; c.lineWidth = base; this.path(c, P); c.stroke(); }
    else if (s.tip === 'pencil'){ c.globalAlpha = 0.5; c.lineWidth = Math.max(1, base * 0.55); for (let r = 0; r < 3; r++){ c.beginPath(); P.forEach((q, k) => { const j = Math.sin(k * 12.9898 + r * 78.233) * 0.8; k ? c.lineTo(q[0] + j, q[1] - j) : c.moveTo(q[0] + j, q[1] - j); }); c.stroke(); } }
    else { let prev = base; c.lineCap = 'round'; for (let k = 1; k < P.length; k++){ const dx = P[k][0] - P[k - 1][0], dy = P[k][1] - P[k - 1][1], ang = Math.atan2(dy, dx), len = Math.hypot(dx, dy);
        let ww = s.tip === 'chisel' ? base * (0.22 + 0.9 * Math.abs(Math.sin(ang - Math.PI / 4))) : base * Math.max(0.35, Math.min(1.8, 1.8 - len / 12)); ww = prev * 0.6 + ww * 0.4; prev = ww;
        c.lineWidth = ww; c.beginPath(); c.moveTo(P[k - 1][0], P[k - 1][1]); c.lineTo(P[k][0], P[k][1]); c.stroke(); } }
    c.setLineDash([]);
    if (s.pen === 'arrow' && P.length > 1){ const a = P[P.length - 1], b = P[Math.max(0, P.length - 6)], ang = Math.atan2(a[1] - b[1], a[0] - b[0]), L = 8 + base * 2.4; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(a[0] - L * Math.cos(ang - 0.45), a[1] - L * Math.sin(ang - 0.45)); c.lineTo(a[0] - L * Math.cos(ang + 0.45), a[1] - L * Math.sin(ang + 0.45)); c.closePath(); c.fill(); } },
  /* a small picture of a pen, for the pen case */
  sample(pen, c, w, tip){ const cv = document.createElement('canvas'), dpr = window.devicePixelRatio || 1; cv.width = 120 * dpr; cv.height = 34 * dpr; const x = cv.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); const P = []; for (let k = 0; k <= 24; k++) P.push([8 + k * 4.4, 17 + Math.sin(k / 24 * Math.PI * 2) * 8]);
    if (/^magic/.test(pen)){ for (let k = 1; k < P.length; k++){ const col = pen === 'magic' ? 'hsl(' + (k * 15) % 360 + ',95%,62%)' : c; x.strokeStyle = col; x.shadowColor = col; x.shadowBlur = 10; x.lineWidth = Math.max(2, w); x.lineCap = 'round'; x.beginPath(); x.moveTo(P[k - 1][0], P[k - 1][1]); x.lineTo(P[k][0], P[k][1]); x.stroke(); } x.shadowBlur = 0; x.strokeStyle = 'rgba(255,255,255,.8)'; x.lineWidth = 1; this.path(x, P); x.stroke(); }
    else this.stroke(x, P, { pen, c, w: Math.min(w, 5), tip: tip || this.load().tip }); return cv.toDataURL(); },

  /* ---------- the pen case ---------- */
  menu(btn, onPick){ this.load(); let m = document.getElementById('inkMenu'); if (m && m._btn === btn){ m.remove(); return; } if (m) m.remove();
    m = document.createElement('div'); m.id = 'inkMenu'; m._btn = btn; document.body.appendChild(m); const draw = () => { const s = this.cur;
      m.innerHTML = '<div class="inkHead"><b>Pens</b><span>pick one, then draw on the chart</span></div><div class="inkPens">' + this.PENS.map(p => '<button type="button" class="' + (s.pen === p[0] ? 'on' : '') + (/^magic/.test(p[0]) ? ' magic' : '') + '" data-ink="pen:' + p[0] + '" title="' + p[2] + '"><img alt="" src="' + this.sample(p[0], s.c, s.w) + '"><b>' + p[1] + '</b><small>' + p[2] + '</small></button>').join('') + '</div>' +
        '<div class="inkCols">' + this.COLS.map(c => '<button type="button" data-ink="c:' + c + '" style="--c:' + c + '" class="' + (s.c === c ? 'on' : '') + '"></button>').join('') + '</div>' +
        '<div class="inkTips"><span>Tip</span>' + this.TIPS.map(t => '<button type="button" class="' + ((s.tip || 'round') === t[0] ? 'on' : '') + '" data-ink="tip:' + t[0] + '" title="' + t[1] + ' tip"><img alt="" src="' + this.sample('pen', s.c, Math.max(4, s.w), t[0]) + '"><b>' + t[1] + '</b></button>').join('') + '</div>' +
        '<label class="inkSize"><span>Thickness</span><input type="range" min="1" max="12" step="1" value="' + s.w + '" data-ink="w"><b>' + s.w + '</b></label><p class="inkNote">Pens stay on the chart (click a stroke to move, hide or remove it). The magic pen fades away by itself.</p>'; };
    draw(); const r = btn.getBoundingClientRect(); m.style.top = (r.bottom + 8) + 'px'; m.style.left = Math.max(8, Math.min(window.innerWidth - 380, r.left - 120)) + 'px';
    m.addEventListener('mousedown', e => e.stopPropagation());
    m.addEventListener('click', e => { const b = e.target.closest('[data-ink]'); if (!b || b.dataset.ink === 'w') return; const [k, v] = b.dataset.ink.split(/:(.+)/); if (k === 'pen') this.cur.pen = v; else if (k === 'c') this.cur.c = v; else if (k === 'tip') this.cur.tip = v; this.save(); draw(); if (onPick) onPick(this.cur); if (k === 'pen') setTimeout(() => m.remove(), 180); });
    m.addEventListener('input', e => { if (e.target.dataset.ink === 'w'){ this.cur.w = +e.target.value; this.save(); const b = m.querySelector('.inkSize b'); if (b) b.textContent = this.cur.w; m.querySelectorAll('.inkPens img').forEach((im, k) => { im.src = this.sample(this.PENS[k][0], this.cur.c, this.cur.w); }); if (onPick) onPick(this.cur); } });
    setTimeout(() => { const off = e => { if (!m.isConnected) return document.removeEventListener('mousedown', off); if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)){ m.remove(); document.removeEventListener('mousedown', off); } }; document.addEventListener('mousedown', off); }, 0); },

  /* ---------- the magic pen: light on the glass, gone in a few seconds ---------- */
  live: [], op: null, raf: 0, LIFE: 2600,
  canvas(){ let cv = document.getElementById('inkMagic'); if (!cv){ cv = document.createElement('canvas'); cv.id = 'inkMagic'; document.body.appendChild(cv); } const dpr = window.devicePixelRatio || 1, W = window.innerWidth, H = window.innerHeight; if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)){ cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + 'px'; cv.style.height = H + 'px'; } return cv; },
  magicDown(e){ const s = this.load(); this.op = { pts: [[e.clientX, e.clientY, performance.now()]], pen: s.pen === 'magic1' ? 'magic1' : 'magic', c: s.c, w: Math.max(2, s.w), done: 0 }; this.live.push(this.op); this.loop(); },
  magicMove(e){ if (!this.op) return false; const P = this.op.pts, l = P[P.length - 1]; if (Math.hypot(e.clientX - l[0], e.clientY - l[1]) > 2) P.push([e.clientX, e.clientY, performance.now()]); return true; },
  magicUp(){ if (!this.op) return false; this.op.done = performance.now(); this.op = null; return true; },
  loop(){ if (this.raf) return; const tick = () => { this.raf = 0; const cv = this.canvas(), c = cv.getContext('2d'), dpr = window.devicePixelRatio || 1, now = performance.now(); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, cv.width, cv.height);
      this.live = this.live.filter(s => !s.done || now - s.done < this.LIFE);
      for (const s of this.live){ const age = s.done ? (now - s.done) / this.LIFE : 0, fade = Math.max(0, 1 - age * age), P = s.pts; c.lineCap = 'round'; c.lineJoin = 'round';
        for (let k = 1; k < P.length; k++){ const born = (now - P[k][2]) / 1000, col = s.pen === 'magic' ? 'hsl(' + ((k * 9 + now / 12) % 360).toFixed(0) + ',95%,62%)' : s.c, wob = s.done ? Math.sin(k * 0.7 + now / 90) * age * 6 : 0;
          c.globalAlpha = fade * Math.min(1, 0.35 + born * 3); c.strokeStyle = col; c.shadowColor = col; c.shadowBlur = 18; c.lineWidth = s.w * (1 + 0.35 * Math.sin(k / 3 + now / 160)); c.beginPath(); c.moveTo(P[k - 1][0], P[k - 1][1] - wob); c.lineTo(P[k][0], P[k][1] + wob); c.stroke(); }
        c.shadowBlur = 0; c.globalAlpha = fade * 0.9; c.strokeStyle = '#fff'; c.lineWidth = Math.max(1, s.w * 0.3); if (P.length > 1){ c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let k = 1; k < P.length; k++) c.lineTo(P[k][0], P[k][1]); c.stroke(); }
        /* sparks rising from a fading stroke */
        if (s.done && P.length){ const n = Math.min(14, P.length); for (let q = 0; q < n; q++){ const pt = P[Math.floor(q / n * P.length)], rise = age * 40, x = pt[0] + Math.sin(q * 12.9 + now / 300) * 8, y = pt[1] - rise - (q % 3) * 6; c.globalAlpha = fade * 0.8; c.fillStyle = s.pen === 'magic' ? 'hsl(' + (q * 30 + now / 10) % 360 + ',95%,70%)' : s.c; c.beginPath(); c.arc(x, y, 1.6 * (1 - age) + 0.4, 0, 6.3); c.fill(); } }
        c.globalAlpha = 1; }
      if (this.live.length) this.raf = requestAnimationFrame(tick); else c.clearRect(0, 0, cv.width, cv.height); };
    this.raf = requestAnimationFrame(tick); },
  /* the magic pen on any element: while `on()` is true, a press there writes light instead of reaching the chart */
  /* the magic pen on an element: while `on()` is true, a press inside it writes light. It is caught at the very top of the page,
     before the chart, its drawing tools or its position lines can see it, so nothing on the chart moves while you write */
  attach(el, on, skip){ if (!el) return; this.zones = (this.zones || []).filter(z => z.el.isConnected); this.zones.push({ el, on, skip }); if (this._win) return; this._win = true;
    const zone = e => (this.zones || []).find(z => z.el.isConnected && z.on() && z.el.contains(e.target) && !(z.skip && e.target.closest && e.target.closest(z.skip)));
    for (const ev of ['pointerdown', 'mousedown']) window.addEventListener(ev, e => { if (e.button !== 0 || !zone(e)) return; e.preventDefault(); e.stopImmediatePropagation(); if (ev === 'mousedown' || !this.op) { if (!this.op) this.magicDown(e); } }, true);
    window.addEventListener('click', e => { if (this._swallow || zone(e)){ e.stopImmediatePropagation(); e.preventDefault(); } this._swallow = false; }, true);
    window.addEventListener('mousemove', e => { if (this.op) this.magicMove(e); }, true); window.addEventListener('pointermove', e => { if (this.op) this.magicMove(e); }, true);
    window.addEventListener('mouseup', () => { if (this.op){ this._swallow = true; this.magicUp(); } }, true); window.addEventListener('pointerup', () => { if (this.op){ this._swallow = true; this.magicUp(); } }, true); },
};
