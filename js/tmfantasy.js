/* ASTRA · Replay — the Fantasy look: the trade told as a journey.

   A switch on the Replay's toolbar. With it on, the Replay's own chart is painted as a land, not replaced by one:
   every candle keeps its exact place and its exact prices, so the ruler, the price and time lines, the pen, the
   hover readout, zoom and pan all work as before.

     THE CANDLES   each candle is a block of stone with depth (a front, a side and a top), green for a candle that
                   closed higher and red for one that closed lower; its wick is a thin spire. Open, high, low and
                   close are where they always were.
     THE ROAD      a narrow paved road runs from close to close, one stretch per candle between two rails of
                   gold; it is thin on purpose, so every candle shows whole beside it.
     THE LAND      the rock under the road: mossy where price climbed, dark with veins of lava where it fell;
                   emerald peaks behind the highest climbs.
     THE THREE     the king sets out from the entry and walks the road one candle at a time, leaving a footprint
                   for each (green or red); the princess waits at the target, the warrior at the stop. With a
                   drawing tool in hand they turn faint, so nothing hides a candle you want to measure.
     3D            with the Replay on 3D, the same journey as a scene you can turn (fantasy/scene.html).

   The pictures of the three are the owner's own (fantasy/img). It draws; it reads nothing new and places nothing. */
'use strict';
const Fantasy = window.Fantasy = {
  KEY: 'astra_replay_fantasy', on: false, IM: {}, n: 0, want: ['king', 'princess', 'warrior', 'castle', 'entry', 'profit', 'stop'],
  hash(x, y){ const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); },
  init(){ try { this.on = localStorage.getItem(this.KEY) === '1'; } catch(e){} if (this.on) this.load(); },
  toggle(){ this.on = !this.on; try { localStorage.setItem(this.KEY, this.on ? '1' : '0'); } catch(e){} if (this.on) this.load(); },
  load(){ if (this._ld) return; this._ld = true; for (const k of this.want){ const i = new Image(); i.onload = () => { this.IM[k] = i; if (++this.n === this.want.length) this.again(); }; i.onerror = () => { if (++this.n === this.want.length) this.again(); }; i.src = 'fantasy/img/' + k + '.png'; } },
  again(){ try { if (typeof Replay !== 'undefined' && Replay.V) Replay.draw(); } catch(e){} },
  /* the night behind everything */
  sky(c, W, H){ const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#03060f'); g.addColorStop(0.55, '#0a1733'); g.addColorStop(1, '#101f3d'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 90; i++){ c.globalAlpha = 0.25 + this.hash(i, 3) * 0.6; c.fillStyle = '#dfe8ff'; const s = 0.6 + this.hash(i, 4) * 1.2; c.fillRect(this.hash(i, 1) * W, this.hash(i, 2) * H * 0.7, s, s); } c.globalAlpha = 1;
    for (const [col, base, amp, sc] of [['#0c1830', 0.62, 0.2, 0.006], ['#0f1d38', 0.74, 0.22, 0.011]]){ c.fillStyle = col; c.beginPath(); c.moveTo(0, H); for (let x = 0; x <= W; x += 18) c.lineTo(x, H * base - Math.abs(Math.sin(x * sc) + Math.sin(x * sc * 2.7 + 1.3) * 0.5) * H * amp); c.lineTo(W, H); c.fill(); } },
  sprite(c, im, x, y, h, a, rot){ if (!im) return; const w = h * im.width / im.height; c.save(); c.globalAlpha = a == null ? 1 : a; c.translate(x, y); if (rot) c.rotate(rot); c.drawImage(im, -w / 2, -h, w, h); c.restore(); },
  /* the land, the candles, the road and the three, in the Replay's own coordinates */
  paint(c, o){ const { X, Y, a, cur, end, P, cw, bw, right, mainH, t, iE, iX } = o, H = this.hash.bind(this), up = i => P.c[i] >= P.o[i], seen = Math.min(cur, end), faint = o.tool && o.tool !== 'pan' ? 0.3 : 1;
    let atr = 0, m = 0; for (let i = Math.max(a + 1, 1); i <= o.b; i++){ atr += Math.abs(P.c[i] - P.c[i - 1]); m++; } atr = m ? atr / m : 1; const dirOf = i => { const d = P.c[Math.min(o.b, i + 2)] - P.c[Math.max(a, i - 2)]; return d > atr * 0.9 ? 1 : d < -atr * 0.9 ? -1 : 0; };
    /* emerald peaks behind the highest climbs */
    { const tops = []; for (let i = a + 3; i <= seen - 1; i++){ let mx = true; for (let d = 1; d <= 6; d++) if ((i - d >= a && P.c[i - d] > P.c[i]) || (i + d <= seen && P.c[i + d] >= P.c[i])) mx = false; if (mx && dirOf(i - 2) > 0) tops.push(i); }
      for (const i of tops.slice(-6)){ const x = X(i), yb = Y(P.c[i]) + 10, h = Math.min(mainH * 0.34, 60 + H(i, 1) * 70), w = Math.max(26, cw * 5 + H(i, 2) * 30), g = c.createLinearGradient(0, yb - h, 0, yb + 60); g.addColorStop(0, '#bff7a8'); g.addColorStop(0.12, '#3fd27f'); g.addColorStop(0.6, '#15663c'); g.addColorStop(1, 'rgba(11,26,34,0)'); c.fillStyle = g;
        c.beginPath(); c.moveTo(x - w, yb + 60); c.lineTo(x - w * 0.5, yb - h * 0.45); c.lineTo(x - w * 0.28, yb - h * 0.38); c.lineTo(x, yb - h); c.lineTo(x + w * 0.3, yb - h * 0.5); c.lineTo(x + w * 0.5, yb - h * 0.56); c.lineTo(x + w, yb + 60); c.closePath(); c.fill();
        c.strokeStyle = '#ffe9a6'; c.lineWidth = 1.5; c.shadowColor = '#ffd067'; c.shadowBlur = 10; c.beginPath(); c.moveTo(x - w * 0.5, yb - h * 0.45); c.lineTo(x - w * 0.28, yb - h * 0.38); c.lineTo(x, yb - h); c.stroke(); c.shadowBlur = 0;
        for (let k = 0; k < 3; k++){ const cx = x + (H(i, k + 9) - 0.5) * w, cy = yb - 6 - H(k, i) * h * 0.5, ch = 10 + H(i + k, 3) * 12; c.fillStyle = 'rgba(70,255,170,.9)'; c.shadowColor = '#35ffa0'; c.shadowBlur = 12; c.beginPath(); c.moveTo(cx, cy - ch); c.lineTo(cx + ch * 0.28, cy - ch * 0.3); c.lineTo(cx, cy); c.lineTo(cx - ch * 0.28, cy - ch * 0.3); c.closePath(); c.fill(); c.shadowBlur = 0; } } }
    /* the rock under the road */
    if (seen > a){ c.save(); c.beginPath(); c.moveTo(X(a) - cw / 2, Y(P.c[a])); for (let i = a; i <= seen; i++) c.lineTo(X(i), Y(P.c[i])); c.lineTo(X(seen) + cw / 2, Y(P.c[seen])); c.lineTo(X(seen) + cw / 2, mainH + 4); c.lineTo(X(a) - cw / 2, mainH + 4); c.closePath();
      const land = c.createLinearGradient(0, 0, 0, mainH); land.addColorStop(0, '#465470'); land.addColorStop(0.35, '#283146'); land.addColorStop(1, '#070a12'); c.fillStyle = land; c.fill(); c.clip();
      for (let i = a; i <= seen; i += 2){ const x = X(i) + (H(i, 31) - 0.5) * cw * 3, y = Y(P.c[i]) + 16 + H(i, 32) * mainH * 0.5, w = 16 + H(i, 33) * 60, h = 24 + H(i, 34) * 90; c.fillStyle = H(i, 35) < 0.5 ? 'rgba(170,190,230,.07)' : 'rgba(0,0,0,.2)'; c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y + h * 0.3); c.lineTo(x + w * 0.6, y + h); c.lineTo(x - w * 0.2, y + h * 0.7); c.closePath(); c.fill(); }
      for (let i = a; i < seen; i++){ const d = dirOf(i), col = d > 0 ? '47,211,138' : d < 0 ? '224,53,75' : '138,147,166', y0 = Y(P.c[i]), y1 = Y(P.c[i + 1]), dep = 26 + Math.abs(d) * 30, g = c.createLinearGradient(0, Math.min(y0, y1), 0, Math.min(y0, y1) + dep); g.addColorStop(0, 'rgba(' + col + ',.55)'); g.addColorStop(1, 'rgba(' + col + ',0)'); c.fillStyle = g; c.beginPath(); c.moveTo(X(i), y0); c.lineTo(X(i + 1) + 0.6, y1); c.lineTo(X(i + 1) + 0.6, y1 + dep); c.lineTo(X(i), y0 + dep); c.closePath(); c.fill(); }
      c.lineCap = 'round'; c.lineJoin = 'round'; for (let i = a + 1; i <= seen; i += 3) if (dirOf(i) < 0 && H(i, 4) < 0.6){ let x = X(i), y = Y(P.c[i]) + 10; c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 7 + H(i, 5) * 6; k++){ x += (H(i, k) - 0.5) * 14; y += 10 + H(k, i) * 16; c.lineTo(x, y); } c.shadowColor = '#ff3a2a'; c.shadowBlur = 14; c.strokeStyle = 'rgba(255,70,45,.85)'; c.lineWidth = 3; c.stroke(); c.strokeStyle = 'rgba(255,220,150,.8)'; c.lineWidth = 1; c.stroke(); c.shadowBlur = 0; }
      c.restore(); }
    /* every candle, as a block of stone with depth: its four prices where they always are */
    const dx = Math.max(2, Math.min(16, bw * 0.55)), dy = Math.max(1.5, Math.min(10, bw * 0.34));
    for (let i = a; i <= end; i++){ const u = up(i), x = X(i), yo = Y(P.o[i]), yc = Y(P.c[i]), top = Math.min(yo, yc), hgt = Math.max(1.5, Math.abs(yc - yo)), l = x - bw / 2, r = x + bw / 2; c.globalAlpha = i > cur ? 0.2 : 1;
      c.fillStyle = 'rgba(0,0,0,.32)'; c.beginPath(); c.moveTo(l + dx * 0.5, top + hgt + dy * 0.5); c.lineTo(r + dx * 1.4, top + hgt + dy * 0.5); c.lineTo(r + dx, top + hgt - dy); c.lineTo(r, top + hgt); c.lineTo(l, top + hgt); c.closePath(); c.fill();
      c.fillStyle = u ? '#0f5c38' : '#6e1826'; c.beginPath(); c.moveTo(r, top); c.lineTo(r + dx, top - dy); c.lineTo(r + dx, top + hgt - dy); c.lineTo(r, top + hgt); c.closePath(); c.fill();
      c.fillStyle = u ? '#b6f8d8' : '#ffc0c8'; c.beginPath(); c.moveTo(l, top); c.lineTo(l + dx, top - dy); c.lineTo(r + dx, top - dy); c.lineTo(r, top); c.closePath(); c.fill();
      c.strokeStyle = u ? '#c9f7de' : '#ffd0d5'; c.lineWidth = Math.max(1, Math.min(3, bw * 0.12)); c.lineCap = 'butt'; c.beginPath(); c.moveTo(x, Y(P.h[i])); c.lineTo(x, Y(P.l[i])); c.stroke();
      const fg = c.createLinearGradient(0, top, 0, top + hgt); fg.addColorStop(0, u ? '#3ddc97' : '#ff6b7a'); fg.addColorStop(1, u ? '#1f9a63' : '#c9384d'); c.fillStyle = fg; c.fillRect(l, top, bw, hgt);
      if (bw >= 6){ c.strokeStyle = 'rgba(4,8,14,.55)'; c.lineWidth = 1; c.strokeRect(l + 0.5, top + 0.5, bw - 1, Math.max(0.5, hgt - 1)); } }
    c.globalAlpha = 1;
    /* the road: one slab per candle, as wide as the candle, a joint at each one */
    if (seen > a){ const th = Math.max(2, Math.min(5, cw * 0.2)); c.lineCap = 'round'; c.lineJoin = 'round'; const way = () => { c.beginPath(); c.moveTo(X(a), Y(P.c[a])); for (let i = a + 1; i <= seen; i++) c.lineTo(X(i), Y(P.c[i])); };
      way(); c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = th + 3; c.save(); c.translate(1.5, 2.5); c.stroke(); c.restore();
      way(); c.shadowColor = '#ffb02e'; c.shadowBlur = 10; c.strokeStyle = '#ffd067'; c.lineWidth = th + 2.4; c.stroke(); c.shadowBlur = 0; way(); c.strokeStyle = '#5a6275'; c.lineWidth = th; c.stroke(); way(); c.strokeStyle = 'rgba(214,220,235,.5)'; c.lineWidth = Math.max(1, th * 0.45); c.stroke();
      if (th >= 4){ c.strokeStyle = 'rgba(20,24,34,.9)'; c.lineWidth = 1; for (let i = a; i < seen; i++){ const xm = (X(i) + X(i + 1)) / 2, ym = (Y(P.c[i]) + Y(P.c[i + 1])) / 2, ang = Math.atan2(Y(P.c[i + 1]) - Y(P.c[i]), cw) + Math.PI / 2; c.beginPath(); c.moveTo(xm - Math.cos(ang) * th / 2, ym - Math.sin(ang) * th / 2); c.lineTo(xm + Math.cos(ang) * th / 2, ym + Math.sin(ang) * th / 2); c.stroke(); } } }
    /* the three */
    const KH = Math.max(64, Math.min(150, mainH * 0.24)), IM = this.IM, R = o.reach || {}, kT = R.kT, kS = R.kS;
    if (t.tp > 0){ const got = kT != null && cur >= kT, x = kT != null && kT <= o.b ? Math.min(right - KH * 0.5, X(kT) + KH * 0.42) : right - KH * 0.42, y = Y(t.tp); if (y > -10 && y < mainH + KH){ c.globalAlpha = faint * (got ? 1 : 0.92); const g = c.createLinearGradient(0, y, 0, y + KH * 0.9); g.addColorStop(0, '#48c070'); g.addColorStop(0.25, '#1c2a35'); g.addColorStop(1, 'rgba(6,8,14,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x - KH * 0.3, y); c.lineTo(x + KH * 0.3, y); c.lineTo(x + KH * 0.42, y + KH * 0.9); c.lineTo(x - KH * 0.42, y + KH * 0.9); c.closePath(); c.fill();
        this.sprite(c, IM.castle, x + KH * 0.42, y + KH * 0.16, KH * 1.25, faint * 0.9); this.sprite(c, IM.princess, x, y + KH * 0.05, KH, faint); this.sprite(c, IM.profit, x - KH * 0.5, y - KH * 0.72, KH * 0.3, faint); c.globalAlpha = 1; } }
    if (t.sl > 0){ const x = kS != null && kS <= o.b ? Math.min(right - KH * 0.5, X(kS) + KH * 0.42) : right - KH * 1.25, y = Y(t.sl); if (y > -10 && y < mainH + KH){ c.globalAlpha = faint; const rg = c.createRadialGradient(x, y + KH * 0.3, 0, x, y + KH * 0.3, KH * 0.9); rg.addColorStop(0, 'rgba(255,60,40,.28)'); rg.addColorStop(1, 'rgba(255,60,40,0)'); c.fillStyle = rg; c.fillRect(x - KH, y - KH * 0.6, KH * 2, KH * 1.8);
        const g = c.createLinearGradient(0, y, 0, y + KH * 0.8); g.addColorStop(0, '#4a4f5e'); g.addColorStop(0.3, '#1b1216'); g.addColorStop(1, 'rgba(6,8,14,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(x - KH * 0.34, y); c.lineTo(x + KH * 0.34, y); c.lineTo(x + KH * 0.46, y + KH * 0.8); c.lineTo(x - KH * 0.46, y + KH * 0.8); c.closePath(); c.fill();
        this.sprite(c, IM.warrior, x, y + KH * 0.06, KH * 0.98, faint); this.sprite(c, IM.stop, x - KH * 0.52, y - KH * 0.62, KH * 0.34, faint); c.globalAlpha = 1; } }
    /* his footsteps, one for each candle walked */
    const hTo = Math.max(iE, Math.min(cur, iX)); for (let i = iE + 1; i <= hTo; i++){ c.fillStyle = P.c[i] >= P.c[i - 1] ? '#4dffa6' : '#ff5a4a'; c.shadowColor = c.fillStyle; c.shadowBlur = 8; c.beginPath(); c.arc(X(i), Y(P.c[i]), Math.max(2, Math.min(3.6, cw * 0.2)), 0, 6.3); c.fill(); } c.shadowBlur = 0;
    /* the king: on his rock at the entry until it opens, then on the road at the candle being played; a short step between candles */
    if (cur !== this._cur){ this._from = this._cur != null && Math.abs(cur - this._cur) === 1 ? this._cur : cur; this._cur = cur; this._t0 = performance.now(); }
    const age = Math.min(1, (performance.now() - (this._t0 || 0)) / 220), ease = age * age * (3 - 2 * age), fpos = this._from + (cur - this._from) * ease, hp = Math.max(iE, Math.min(fpos, iX)), i0 = Math.floor(hp), fr = hp - i0, pAt = i => i <= iE ? t.entry : i >= iX ? t.exit : P.c[i];
    const hx = X(i0) + fr * cw, hy = Y(pAt(i0)) + (Y(pAt(Math.min(iX, i0 + 1))) - Y(pAt(i0))) * fr, moving = age < 1 && cur > iE && cur <= iX && this._from !== cur, hop = moving ? Math.sin(Math.PI * age) * KH * 0.07 : 0, feet = KH * 0.085;
    if (cur >= iE){ const ex = X(iE), ey = Y(t.entry); c.fillStyle = 'rgba(240,194,78,.9)'; c.shadowColor = '#ffb02e'; c.shadowBlur = 14; c.beginPath(); c.ellipse(ex, ey + 3, KH * 0.2, KH * 0.045, 0, 0, 6.3); c.fill(); c.shadowBlur = 0; if (cur > iE){ this.sprite(c, IM.king, ex, ey + feet, KH, 0.3 * faint); } this.sprite(c, IM.entry, ex - KH * 0.5, ey - KH * 0.86, KH * 0.26, faint); }
    if (cur >= iE){ c.fillStyle = 'rgba(0,0,0,' + (0.4 * faint) + ')'; c.beginPath(); c.ellipse(hx, hy + 2, KH * 0.2, KH * 0.04, 0, 0, 6.3); c.fill(); c.shadowColor = '#ffd067'; c.shadowBlur = 16; this.sprite(c, IM.king, hx, hy - hop + feet, KH, faint, moving ? Math.sin(Math.PI * 2 * age) * 0.04 : 0); c.shadowBlur = 0; }
    else { this.sprite(c, IM.king, X(iE), Y(t.entry) + feet, KH, 0.45 * faint); }
    if (moving && o.redraw && !this._raf){ this._raf = requestAnimationFrame(() => { this._raf = 0; try { o.redraw(); } catch(e){} }); }
  },

  /* ---------- 3D: the same journey as a scene, in its own frame ---------- */
  frame(box){ let f = box.querySelector('#rpFan3'); if (!f){ f = document.createElement('iframe'); f.id = 'rpFan3'; f.title = 'The trade as a 3D scene'; f.src = 'fantasy/scene.html?embed=1'; f.setAttribute('loading', 'eager'); this._ok3 = false; this._sent = ''; box.appendChild(f); f.addEventListener('load', () => { this._ok3 = true; this._sent = ''; this.again(); }); } return f; },
  show3d(box, d){ const f = this.frame(box); f.hidden = false; if (!this._ok3 || !f.contentWindow) return; const key = d.id + '|' + d.a + '|' + d.b + '|' + d.tf;
    try { if (this._sent !== key){ this._sent = key; f.contentWindow.postMessage({ fan: 'data', d }, location.origin); } f.contentWindow.postMessage({ fan: 'cur', cur: d.cur }, location.origin); } catch(e){} },
  hide3d(box){ const f = box && box.querySelector('#rpFan3'); if (f) f.hidden = true; },
};
Fantasy.init();
