/* ASTRA / Timurila — Lens: Renko and the other candles that have no time axis, in their own
   small window over the chart.

   Renko bricks, range bars, three-line break and Kagi drop time: a new brick appears when price
   has moved far enough, not when a clock ticks. Put on the main chart they would shift every
   drawing, alert line and indicator. So they live here instead, in a separate box that is switched
   on and off on its own, built from the same candles as the chart behind it. The chart, its
   drawings and its indicators are never touched.

   One "brick" is a multiple of the average true range of the loaded candles (ATR 14), so the same
   setting suits gold and EURUSD alike. Display only: nothing here trades. */
const Lens = {
  KEY: 'astra_lens',
  DEF: { on: false, type: 'renko', size: 1, x: 14, y: null, w: 440, h: 270 },
  TYPES: [['renko', 'Renko'], ['range', 'Range bars'], ['break', 'Three-line break'], ['kagi', 'Kagi']],
  ABOUT: { renko: 'A new brick each time the close moves one brick; a turn needs two', range: 'Every bar covers the same price range', break: 'A new line on a new closing extreme; a turn must clear the last three lines', kagi: 'One line that turns after a move of one brick against it; thick above the last high' },
  cfg(){ let c = {}; try { c = JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch(e){} return Object.assign({}, this.DEF, c); },
  save(c){ try { localStorage.setItem(this.KEY, JSON.stringify(c)); } catch(e){} this.sync(); },
  colors(){ return typeof CandleStyles !== 'undefined' ? CandleStyles.colors() : [typeof CFG !== 'undefined' ? CFG.UP : '#2ebd85', typeof CFG !== 'undefined' ? CFG.DOWN : '#f6465d']; },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c); if (typeof toast === 'function') toast(c.on ? 'Lens on: ' + this.TYPES.find(t => t[0] === c.type)[1] + ' in its own window. Your chart and drawings stay as they are.' : 'Lens off.', 'info'); },
  set(k, v){ const c = this.cfg(); c[k] = v; if (k === 'type') c.on = true; this.save(c); },

  /* ---------- the four constructions (v = candles with open/high/low/close/time) ---------- */
  brick(v, k){ const n = v.length; let a = 0, m = 0; for (let i = Math.max(1, n - 200); i < n; i++){ a += Math.max(v[i].high - v[i].low, Math.abs(v[i].high - v[i - 1].close), Math.abs(v[i].low - v[i - 1].close)); m++; } return m ? a / m * k : 0; },
  renko(v, b){ const out = []; let base = v[0].close, dir = 0;
    for (let i = 1; i < v.length; i++){ const c = v[i].close;
      if (dir >= 0){ while (c >= base + b){ out.push({ o: base, c: base + b, i }); base += b; dir = 1; }
        if (dir > 0 ? c <= base - 2 * b : c <= base - b){ if (dir > 0) base -= b; while (c <= base - b){ out.push({ o: base, c: base - b, i }); base -= b; } dir = -1; } }
      else { while (c <= base - b){ out.push({ o: base, c: base - b, i }); base -= b; }
        if (c >= base + 2 * b){ base += b; while (c >= base + b){ out.push({ o: base, c: base + b, i }); base += b; } dir = 1; } } }
    return out.map(x => ({ o: x.o, c: x.c, h: Math.max(x.o, x.c), l: Math.min(x.o, x.c), i: x.i })); },
  range(v, b){ const out = []; let o = v[0].open, h = o, l = o;
    for (let i = 0; i < v.length; i++){ const k = v[i], path = k.close >= k.open ? [k.open, k.low, k.high, k.close] : [k.open, k.high, k.low, k.close];
      for (const p of path){ let guard = 0; while (guard++ < 500){ if (p > l + b){ const c = l + b; out.push({ o, h: c, l, c, i }); o = h = l = c; } else if (p < h - b){ const c = h - b; out.push({ o, h, l: c, c, i }); o = h = l = c; } else break; } if (p > h) h = p; if (p < l) l = p; } }
    return out; },
  lineBreak(v){ const out = [{ o: v[0].close, c: v[0].close, i: 0 }];
    for (let i = 1; i < v.length; i++){ const c = v[i].close, last = out[out.length - 1], up = last.c >= last.o, rec = out.slice(-3), hi = Math.max(...rec.map(x => Math.max(x.o, x.c))), lo = Math.min(...rec.map(x => Math.min(x.o, x.c)));
      if (out.length === 1 && last.o === last.c){ if (c !== last.c) out[0] = { o: last.c, c, i }; continue; }
      if (up){ if (c > last.c) out.push({ o: last.c, c, i }); else if (c < lo) out.push({ o: last.o, c, i }); }
      else { if (c < last.c) out.push({ o: last.c, c, i }); else if (c > hi) out.push({ o: last.o, c, i }); } }
    return out.map(x => ({ o: x.o, c: x.c, h: Math.max(x.o, x.c), l: Math.min(x.o, x.c), i: x.i })); },
  /* Kagi: the turning points of one line; `thick` is true while the line is above the previous swing high */
  kagi(v, b){ const pts = [{ p: v[0].close, i: 0 }]; let dir = 0, cur = v[0].close;
    for (let i = 1; i < v.length; i++){ const c = v[i].close;
      if (dir === 0){ if (Math.abs(c - cur) >= b){ dir = c > cur ? 1 : -1; cur = c; pts.push({ p: c, i }); } }
      else if (dir > 0){ if (c > cur){ cur = c; pts[pts.length - 1] = { p: c, i }; } else if (c <= cur - b){ dir = -1; cur = c; pts.push({ p: c, i }); } }
      else { if (c < cur){ cur = c; pts[pts.length - 1] = { p: c, i }; } else if (c >= cur + b){ dir = 1; cur = c; pts.push({ p: c, i }); } } }
    return pts; },

  /* ---------- the window ---------- */
  box(){
    let el = document.getElementById('lensBox'); if (el) return el; const wrap = document.getElementById('mainWrap'); if (!wrap) return null;
    el = document.createElement('div'); el.id = 'lensBox';
    el.innerHTML = '<div class="lensHead"><b id="lensTitle">Renko</b><span id="lensInfo"></span><i></i><button type="button" data-l="size:-" title="Smaller bricks">−</button><button type="button" data-l="size:+" title="Larger bricks">+</button><button type="button" data-l="off" title="Close the lens">✕</button></div>' +
      '<div class="lensTypes">' + this.TYPES.map(t => '<button type="button" data-l="type:' + t[0] + '">' + t[1] + '</button>').join('') + '</div><canvas id="lensCv"></canvas><div class="lensGrip" title="Drag to resize"></div>';
    wrap.appendChild(el);
    el.addEventListener('click', e => { const b = e.target.closest('[data-l]'); if (!b) return; const [k, val] = b.dataset.l.split(':'), c = this.cfg();
      if (k === 'off'){ c.on = false; this.save(c); } else if (k === 'type') this.set('type', val); else if (k === 'size'){ const steps = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4], j = steps.indexOf(c.size), n = steps[Math.max(0, Math.min(steps.length - 1, (j < 0 ? 3 : j) + (val === '+' ? 1 : -1)))]; this.set('size', n); } });
    /* move it by its title bar, resize it by its corner; both are remembered */
    const drag = (handle, fn) => handle.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; e.preventDefault(); const c = this.cfg(), r = el.getBoundingClientRect(), pr = wrap.getBoundingClientRect(), s = { x: e.clientX, y: e.clientY, left: r.left - pr.left, top: r.top - pr.top, w: r.width, h: r.height };
      const mv = ev => { fn(c, s, ev.clientX - s.x, ev.clientY - s.y, pr); this.place(c); this.draw(true); }, up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); this.save(c); }; addEventListener('pointermove', mv); addEventListener('pointerup', up); });
    drag(el.querySelector('.lensHead'), (c, s, dx, dy, pr) => { c.x = Math.max(0, Math.min(pr.width - 120, s.left + dx)); c.y = Math.max(0, Math.min(pr.height - 60, s.top + dy)); });
    drag(el.querySelector('.lensGrip'), (c, s, dx, dy) => { c.w = Math.max(260, s.w + dx); c.h = Math.max(170, s.h + dy); });
    const cv = el.querySelector('canvas'); cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(); this.mx = e.clientX - r.left; this.draw(true); }); cv.addEventListener('mouseleave', () => { this.mx = null; this.draw(true); });
    return el;
  },
  place(c){ const el = document.getElementById('lensBox'), wrap = document.getElementById('mainWrap'); if (!el || !wrap) return; const H = wrap.clientHeight, W = wrap.clientWidth, w = Math.min(c.w, W - 20), h = Math.min(c.h, H - 20);
    el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.left = Math.max(0, Math.min(W - w - 4, c.x)) + 'px'; el.style.top = Math.max(0, Math.min(H - h - 4, c.y == null ? H - h - 44 : c.y)) + 'px'; },
  sync(){ const c = this.cfg(), b = document.getElementById('lensBtn'); if (b){ b.classList.toggle('on', c.on); b.textContent = '▦ ' + this.TYPES.find(t => t[0] === c.type)[1] + ' lens'; }
    let el = document.getElementById('lensBox'); if (!c.on){ if (el) el.style.display = 'none'; document.dispatchEvent(new CustomEvent('lens')); return; }
    el = this.box(); if (!el) return; el.style.display = 'flex'; this.place(c); el.querySelectorAll('[data-l^="type:"]').forEach(x => x.classList.toggle('on', x.dataset.l === 'type:' + c.type)); this._key = ''; this.draw(); document.dispatchEvent(new CustomEvent('lens')); },

  draw(force){
    const c = this.cfg(), el = document.getElementById('lensBox'); if (!c.on || !el || el.style.display === 'none' || typeof Chart === 'undefined') return;
    const v = Chart.view ? Chart.view() : (Chart.raw || []); if (!v || v.length < 30) return;
    const key = [typeof STORE !== 'undefined' ? STORE.symbol + '|' + STORE.tf : '', v.length, v[v.length - 1].close, c.type, c.size, el.clientWidth, el.clientHeight].join('|'); if (!force && key === this._key) return;
    if (key !== this._key || !this._u){ this._key = key; const b = this.brick(v, c.size); this._b = b; this._u = !b ? [] : c.type === 'renko' ? this.renko(v, b) : c.type === 'range' ? this.range(v, b) : c.type === 'break' ? this.lineBreak(v) : this.kagi(v, b); }
    const U = this._u, b = this._b, cv = document.getElementById('lensCv'), dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (w < 40 || h < 40) return;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const g = cv.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const [UP, DN] = this.colors(), padR = 58, last = v[v.length - 1].close, prec = typeof Chart.precision === 'function' ? Chart.precision() : 2, fmt = p => Number(p).toFixed(prec), tm = i => { const t = v[Math.min(v.length - 1, i)]; return t ? new Date((t.rawTime != null ? t.rawTime : t.time) * 1000).toISOString().slice(5, 16).replace('T', ' ') : ''; };
    document.getElementById('lensTitle').textContent = this.TYPES.find(t => t[0] === c.type)[1]; el.title = this.ABOUT[c.type];
    if (!U.length || (c.type === 'kagi' && U.length < 2)){ document.getElementById('lensInfo').textContent = 'no ' + (c.type === 'kagi' ? 'turn' : 'brick') + ' yet at this size'; return; }
    const unit = c.type === 'kagi' ? 16 : c.type === 'break' ? 10 : 9, n = Math.max(4, Math.floor((w - padR - 10) / unit)), S = U.slice(-n), X = k => 6 + (k + 0.5) * unit; let lo = Infinity, hi = -Infinity;
    for (const u of S){ lo = Math.min(lo, c.type === 'kagi' ? u.p : u.l); hi = Math.max(hi, c.type === 'kagi' ? u.p : u.h); } lo = Math.min(lo, last); hi = Math.max(hi, last); const pd = (hi - lo) * 0.08 || b; lo -= pd; hi += pd; const Y = p => 6 + (hi - p) / (hi - lo) * (h - 24);
    g.font = '10px JetBrains Mono, monospace'; g.textBaseline = 'middle'; for (let q = 0; q <= 3; q++){ const p = lo + (hi - lo) * q / 3, y = Math.round(Y(p)) + 0.5; g.strokeStyle = 'rgba(126,156,224,.12)'; g.beginPath(); g.moveTo(0, y); g.lineTo(w - padR, y); g.stroke(); g.fillStyle = '#7C8BA8'; g.fillText(fmt(p), w - padR + 6, y); }
    let hov = -1; if (this.mx != null) hov = Math.max(0, Math.min(S.length - 1, Math.floor((this.mx - 6) / unit)));
    if (c.type === 'kagi'){ let prevHigh = -Infinity, prevLow = Infinity, thick = false;
      for (let k = 1; k < S.length; k++){ const a = S[k - 1].p, d = S[k].p, x = X(k - 1), up = d > a;
        /* the line turns thick the moment it passes the last swing high, thin when it passes the last swing low */
        const seg = (from, to, th) => { g.strokeStyle = th ? UP : DN; g.lineWidth = th ? 3.2 : 1.4; g.beginPath(); g.moveTo(x, Y(from)); g.lineTo(x, Y(to)); g.stroke(); };
        if (up){ if (!thick && d > prevHigh && prevHigh > a){ seg(a, prevHigh, false); thick = true; seg(prevHigh, d, true); } else { if (!thick && d > prevHigh) thick = true; seg(a, d, thick); } prevLow = a; }
        else { if (thick && d < prevLow && prevLow < a){ seg(a, prevLow, true); thick = false; seg(prevLow, d, false); } else { if (thick && d < prevLow) thick = false; seg(a, d, thick); } prevHigh = a; }
        if (k < S.length - 1){ g.strokeStyle = thick ? UP : DN; g.lineWidth = thick ? 3.2 : 1.4; g.beginPath(); g.moveTo(x, Y(d)); g.lineTo(X(k), Y(d)); g.stroke(); } } }
    else S.forEach((u, k) => { const up = u.c >= u.o, x = X(k), bw = unit - 2, yT = Y(Math.max(u.o, u.c)), yB = Y(Math.min(u.o, u.c));
      if (c.type === 'range'){ g.strokeStyle = up ? UP : DN; g.lineWidth = 1; g.beginPath(); g.moveTo(Math.round(x) + 0.5, Y(u.h)); g.lineTo(Math.round(x) + 0.5, Y(u.l)); g.stroke(); }
      g.fillStyle = up ? UP : DN; g.globalAlpha = k === hov ? 1 : 0.88; g.fillRect(x - bw / 2, yT, bw, Math.max(1.5, yB - yT)); g.globalAlpha = 1; if (k === hov){ g.strokeStyle = '#fff'; g.lineWidth = 1; g.strokeRect(x - bw / 2 - 0.5, yT - 0.5, bw + 1, Math.max(1.5, yB - yT) + 1); } });
    const yl = Math.round(Y(last)) + 0.5; g.setLineDash([3, 4]); g.strokeStyle = '#4FD8F7'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, yl); g.lineTo(w - padR, yl); g.stroke(); g.setLineDash([]); g.fillStyle = '#4FD8F7'; g.fillRect(w - padR + 2, yl - 8, padR - 4, 16); g.fillStyle = '#04121A'; g.fillText(fmt(last), w - padR + 6, yl);
    /* how many in a row, and when the one under the pointer formed */
    let run = 0, dirNow = 0; if (c.type !== 'kagi'){ for (let k = U.length - 1; k >= 0; k--){ const d = U[k].c >= U[k].o ? 1 : -1; if (!dirNow) dirNow = d; if (d !== dirNow) break; run++; } }
    const info = document.getElementById('lensInfo'); info.textContent = (hov >= 0 && S[hov] ? 'formed ' + tm(S[hov].i) + ' · ' : '') + (c.type === 'kagi' ? U.length - 1 + ' turns' : run + (dirNow > 0 ? ' up' : ' down') + ' in a row') + (c.type === 'break' ? '' : ' · brick ' + fmt(b) + ' (' + c.size + ' ATR)'); info.style.color = dirNow > 0 ? UP : dirNow < 0 ? DN : '#9FB0CE';
    g.fillStyle = '#7C8BA8'; g.font = '10px Inter, sans-serif'; g.textBaseline = 'alphabetic'; g.fillText(tm(S[0].i), 6, h - 5); g.textAlign = 'right'; g.fillText('no time axis: spacing is movement, not hours', w - padR - 4, h - 5); g.textAlign = 'left';
  },
};
if (typeof document !== 'undefined') document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('studioCfg') || document.getElementById('patCfg'); if (!after || document.getElementById('lensBtn')) return;
  after.insertAdjacentHTML('afterend', '<button id="lensBtn" class="bMini autoSrBtn" title="Renko, range bars, three-line break or Kagi in their own small window. These have no time axis, so they are kept off the chart: your drawings and indicators stay exactly where they are.">▦ Renko lens</button><button id="lensCfg" class="bMini" title="Next lens type">⚙</button>');
  document.getElementById('lensBtn').addEventListener('click', () => Lens.toggle());
  document.getElementById('lensCfg').addEventListener('click', () => { const c = Lens.cfg(), i = Lens.TYPES.findIndex(t => t[0] === c.type); Lens.set('type', Lens.TYPES[(i + 1) % Lens.TYPES.length][0]); });
  setTimeout(() => Lens.sync(), 1500); setInterval(() => Lens.draw(), 1500); window.addEventListener('resize', () => { if (Lens.cfg().on){ Lens.place(Lens.cfg()); Lens.draw(true); } });
});
