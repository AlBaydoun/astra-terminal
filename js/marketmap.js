/* ASTRA / Timurila — the market map: every instrument on the account as a dot on a tilted ring,
   one ring per kind of market, coloured by today's move. Drawn by both faces.
   Read only: it shows quotes it is handed and opens a chart when a dot is clicked. */
class MarketMap {
  /* o: { quote(sym) -> {pct}|undefined, proven(sym) -> bool, selected() -> sym, onPick(sym), active() -> bool,
          group(sym), groupName(g), base(sym), motion() -> bool } — all optional except quote and onPick */
  constructor(canvas, tip, o){
    this.cv = canvas; this.tipEl = tip; this.o = o || {}; this.ctx = canvas.getContext('2d'); this.dots = []; this.t = 0; this.last = 0; this.hot = null; this.count = 0;
    this.group = this.o.group || MarketMap.groupOf; this.groupName = this.o.groupName || (g => (MarketMap.NAMES[g] || 'Other')); this.base = this.o.base || MarketMap.base;
    new ResizeObserver(() => this.resize()).observe(canvas);
    canvas.addEventListener('pointermove', e => { const r = canvas.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 100;
      for (const d of this.dots){ const q = (d.x - x) ** 2 + (d.y - y) ** 2; if (q < bd){ bd = q; best = d; } } this.hot = best; this.tip(); });
    canvas.addEventListener('pointerleave', () => { this.hot = null; this.tip(); });
    canvas.addEventListener('click', () => { if (this.hot && this.o.onPick) this.o.onPick(this.hot.s); });
    const loop = now => { if (!canvas.isConnected) return; requestAnimationFrame(loop);
      if (document.hidden || (this.o.active && !this.o.active())) return; if (now - this.last < 33) return;
      const dt = this.last ? Math.min(0.1, (now - this.last) / 1000) : 0; this.last = now; const move = this.o.motion ? this.o.motion() : !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
      if (move && !this.hot) this.t += dt; this.draw(now); };
    requestAnimationFrame(loop); this.resize();
  }
  static base(sym){ return String(sym).replace(/\.(s|m|std|pro|ecn|raw)$/i, ''); }
  static groupOf(sym){ const b = MarketMap.base(sym), C = MarketMap.CCY;
    if (/^(XAU|XAG|XPT|XPD)[A-Z]{3}$/.test(b)) return 'metals';
    if (/^(WTI|BRENT|XNG|NGAS|UKOIL|USOIL|XBR|XTI|NATGAS)/.test(b)) return 'energy';
    if (b.length === 6 && C.includes(b.slice(0, 3)) && C.includes(b.slice(3))) return 'forex';
    if (MarketMap.CRYPTO.test(b) && /(USD|USDT|EUR|BTC|JPY|GBP|XAU)$/.test(b)) return 'crypto';
    if (b === sym) return 'shares';
    if (/\d/.test(b)) return 'indices';
    return 'other'; }
  build(symbols){
    const by = {}; this.count = symbols.length; for (const s of symbols) (by[this.group(s)] = by[this.group(s)] || []).push(s); this.dots = [];
    MarketMap.RINGS.forEach(([g, rf, w]) => (by[g] || []).sort().forEach((s, k, a) => this.dots.push({ s, g, rf, w, a0: k / a.length * Math.PI * 2, proven: !!(this.o.proven && this.o.proven(s)), x: -99, y: -99 })));
    this.counts = Object.fromEntries(MarketMap.RINGS.map(r => [r[0], (by[r[0]] || []).length]));
  }
  resize(){ const r = this.cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; if (!r.width) return; this.w = r.width; this.h = r.height;
    this.cv.width = Math.round(r.width * d); this.cv.height = Math.round(r.height * d); this.ctx.setTransform(d, 0, 0, d, 0, 0); this.draw(performance.now()); }
  draw(now){
    const ctx = this.ctx, W = this.w, H = this.h; if (!W) return; ctx.clearRect(0, 0, W, H);
    const tilt = 0.44, cx = W / 2, cy = H * 0.5, RM = Math.min(W * 0.47, H * 0.48 / tilt), q = this.o.quote || (() => null);
    for (const [, rf] of MarketMap.RINGS){ ctx.beginPath(); ctx.ellipse(cx, cy, RM * rf, RM * rf * tilt, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(79,216,247,.16)'; ctx.lineWidth = 1; ctx.stroke(); }
    const pulse = 0.5 + 0.5 * Math.sin(now / 420), sel = this.o.selected ? this.o.selected() : null;
    for (const d of this.dots){ const a = d.a0 + d.w * this.t; d.depth = Math.sin(a); d.x = cx + RM * d.rf * Math.cos(a); d.y = cy + RM * d.rf * tilt * d.depth; }
    const dot = d => { const v = q(d.s), pct = v && v.pct != null ? v.pct : null, near = (d.depth + 1) / 2, r = (d.g === 'shares' ? 2.3 : 3.2) * (0.72 + 0.5 * near), mag = pct == null ? 0 : Math.min(1, Math.abs(pct) / 2);
      ctx.globalAlpha = 0.42 + 0.58 * near;
      if (d.proven){ ctx.beginPath(); ctx.arc(d.x, d.y, r + 3.5 + pulse * 2.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,182,72,' + (0.35 + 0.45 * pulse) + ')'; ctx.lineWidth = 1.4; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pct == null ? '#5E6F8C' : pct >= 0 ? `rgb(${Math.round(94 - 33 * mag)},${Math.round(150 + 70 * mag)},${Math.round(140 + 11 * mag)})` : `rgb(${Math.round(170 + 85 * mag)},${Math.round(120 - 13 * mag)},${Math.round(135 - 13 * mag)})`;
      if (mag > 0.5){ ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8 * mag; } ctx.fill(); ctx.shadowBlur = 0;
      if (d.s === sel || d === this.hot){ ctx.beginPath(); ctx.arc(d.x, d.y, r + 3, 0, Math.PI * 2); ctx.strokeStyle = '#EAF1FB'; ctx.lineWidth = 1.5; ctx.globalAlpha = 1; ctx.stroke(); } };
    this.dots.filter(d => d.depth < 0).forEach(dot); ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, RM * 0.2); g.addColorStop(0, 'rgba(79,216,247,.55)'); g.addColorStop(0.35, 'rgba(79,216,247,.16)'); g.addColorStop(1, 'rgba(79,216,247,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, RM * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#EAF1FB'; ctx.font = '600 20px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(this.count || ''), cx, cy);
    this.dots.filter(d => d.depth >= 0).forEach(dot); ctx.globalAlpha = 1;
  }
  tip(){
    const el = this.tipEl, d = this.hot; this.cv.style.cursor = d ? 'pointer' : 'crosshair'; if (!el) return; el.style.opacity = d ? 1 : 0; if (!d) return;
    const v = this.o.quote ? this.o.quote(d.s) : null, pct = v && v.pct != null ? v.pct : null, esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    el.style.left = d.x + 'px'; el.style.top = d.y + 'px';
    el.innerHTML = '<b style="font-family:monospace">' + esc(this.base(d.s)) + '</b> · ' + esc(this.groupName(d.g)) + (pct != null ? ' · <span style="color:' + (pct >= 0 ? '#3DDC97' : '#FF9AA4') + '">' + (pct >= 0 ? '+' : '−') + Math.abs(pct).toFixed(2) + '%</span>' : '') + (d.proven ? ' · <span style="color:#FFB648">★ proven on file</span>' : '');
  }
}
MarketMap.RINGS = [['shares', 1.0, 0.020], ['forex', 0.83, -0.030], ['crypto', 0.67, 0.045], ['indices', 0.53, -0.060], ['metals', 0.39, 0.080], ['energy', 0.26, -0.100]];
MarketMap.NAMES = { shares: 'Shares', forex: 'Forex', crypto: 'Crypto', indices: 'Indices', metals: 'Metals', energy: 'Energy' };
MarketMap.CCY = 'USD EUR GBP JPY CHF CAD AUD NZD SGD HKD CNH DKK NOK SEK PLN MXN ZAR TRY HUF CZK THB ILS RUB'.split(' ');
MarketMap.CRYPTO = /^(BTC|ETH|BCH|LTC|XRP|SOL|ADA|DOGE|DOT|LINK|AVAX|BNB|UNI|XLM|TRX|MATIC|ATOM|EOS|ETC|FIL|NEAR|APT|ARB|OP|SHIB|TON|SUI|AAVE|ALGO|XMR|XTZ|ZEC|DASH|NEO|KSM|IOTA|MANA|SAND|COMP|MKR|GRT|INJ|PEPE|FTM|HBAR|ICP|VET|AXS|APE|LDO)/;
