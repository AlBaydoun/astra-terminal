/* ASTRA / Timurila — chart marks: "I expect a buy (or a sell) from here."

   You put a mark on any chart: a price, a direction, and if you like a target, a stop, a size and a
   note. The chart moves on. Every time you come back the mark tells you how it went:
     · did the price ever trade at your level after you marked it (if not, nothing would have happened);
     · from there, where it stands now, the best and the worst it went, and whether the target or the
       stop came first (a candle that touches both counts as the stop);
     · what that would have made or lost for the size you gave, in the account's money, using the
       broker's own value of one lot (from /specs). Without a size it shows the move in %.
   "My marks" lists every mark on every chart, best first, with how often you were right.

   Marks live in this browser's storage (astra_marks). Nothing here sends an order: it only reads candles. */
const Marks = {
  KEY: 'astra_marks',
  C: { up: '#3DDC97', dn: '#FF6B7A', cy: '#4FD8F7', am: '#FFB648', dim: '#7C8BA8', text: '#E6EEFF' },
  armed: false, hits: [], cache: {}, filt: 'all',
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  all(){ try { const a = JSON.parse(localStorage.getItem(this.KEY) || '[]'); return Array.isArray(a) ? a : []; } catch(e){ return []; } },
  save(list){ try { localStorage.setItem(this.KEY, JSON.stringify(list.slice(-500))); } catch(e){} this.count(); },
  px(p){ const a = Math.abs(p), d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 5; return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  sg(v, d = 2, u = ''){ if (v == null || !isFinite(v)) return '–'; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + u; },
  base(s){ return String(s).replace(/\.(s|m|std)$/i, ''); },
  TF: { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400, '1w': 604800 },
  /* a bar time in the broker's clock → a readable local date */
  when(m, raw){ let sh = 0; try { if (typeof Autopsy !== 'undefined') sh = Autopsy.shift(m.sym, raw); } catch(e){} const d = new Date((raw - sh) * 1000); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) + ' ' + d.toTimeString().slice(0, 5); },
  spec(sym){ try { return typeof Feed !== 'undefined' && Feed.specFor ? Feed.specFor(sym) : null; } catch(e){ return null; } },
  cur(){ try { return (Feed.account && Feed.account.currency) || 'USD'; } catch(e){ return 'USD'; } },

  /* ---------- how a mark went, on a list of candles {rawTime, open, high, low, close} ---------- */
  judge(m, bars){
    if (!bars || !bars.length) return null; let i0 = bars.findIndex(b => b.rawTime >= m.raw); if (i0 < 0) return { none: true, wait: true, reason: 'no candles after the mark yet' };
    if (i0 > 0 && bars[i0].rawTime > m.raw) i0--;  // the candle the mark sits in
    let iE = -1; for (let i = i0; i < bars.length; i++){ if (bars[i].low <= m.price && bars[i].high >= m.price){ iE = i; break; } }
    const last = bars[bars.length - 1];
    if (iE < 0) return { wait: true, i0, reason: 'price has not traded at ' + this.px(m.price) + ' since (now ' + this.px(last.close) + ')', gap: (last.close / m.price - 1) * 100 };
    let best = 0, worst = 0, iB = iE, iW = iE, hit = null, iH = -1;
    for (let i = iE; i < bars.length; i++){ const b = bars[i], up = m.dir * ((m.dir > 0 ? b.high : b.low) - m.price), dn = m.dir * ((m.dir > 0 ? b.low : b.high) - m.price);
      if (!hit && m.sl > 0 && (m.dir > 0 ? b.low <= m.sl : b.high >= m.sl) && !(i === iE && m.dir * (m.sl - m.price) > 0)){ hit = 'stop'; iH = i; }
      if (!hit && m.tp > 0 && (m.dir > 0 ? b.high >= m.tp : b.low <= m.tp)){ hit = 'target'; iH = i; }
      if (up > best){ best = up; iB = i; } if (dn < worst){ worst = dn; iW = i; } if (hit) break; }
    const exit = hit === 'stop' ? m.sl : hit === 'target' ? m.tp : last.close, move = m.dir * (exit - m.price), pct = move / m.price * 100, sp = this.spec(m.sym), pv = sp && sp.pointValue > 0 ? sp.pointValue : null;
    return { i0, iE, iB, iW, iH, hit, exit, move, pct, best: best / m.price * 100, worst: worst / m.price * 100, money: pv && m.lots > 0 ? move * pv * m.lots : null, right: move > 0, n: (hit ? iH : bars.length - 1) - iE + 1, open: !hit };
  },
  label(m, J){ if (!J) return 'reading…'; if (J.wait) return 'not reached yet'; const r = (J.right ? '✓ ' : '✗ ') + this.sg(J.pct, 2, '%') + (J.money != null ? ' · ' + this.sg(J.money, 2) + ' ' + this.cur() : ''); return r + (J.hit ? ' · ' + J.hit + ' hit' : ' · still running'); },

  /* ---------- the chart ---------- */
  init(){
    const host = this.$('mainWrap'); if (!host || this.$('tmMarkCv')) return;
    const cv = document.createElement('canvas'); cv.id = 'tmMarkCv'; host.appendChild(cv);
    const bar = document.createElement('div'); bar.id = 'tmMarkBar';
    bar.innerHTML = '<button type="button" id="tmMarkBtn" title="Put a mark: click the chart where you expect a buy or a sell"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2 4 2 4H5"/></svg><span>Mark</span></button><button type="button" id="tmMarkList" title="Every mark you made, how it went"><b id="tmMarkN">0</b><span>My marks</span></button>';
    host.appendChild(bar);
    bar.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.id === 'tmMarkBtn') this.arm(!this.armed); else this.board(true); });
    /* placing a mark, or opening one, before the chart and its drawing tools see the click */
    host.addEventListener('click', e => this.click(e), true);
    host.addEventListener('mousemove', e => { if (this.armed){ this.ghost = this.pt(e); this.draw(); } else { const h = this.hitAt(e); host.classList.toggle('tmMarkHover', !!h); } });
    document.addEventListener('keydown', e => { if (e.key === 'Escape'){ if (this.armed) this.arm(false); const f = this.$('tmMarkForm'); if (f) f.remove(); } });
    try { Chart.main.timeScale().subscribeVisibleLogicalRangeChange(() => this.draw()); } catch(e){}
    window.addEventListener('resize', () => this.draw()); setInterval(() => this.draw(), 1500);
    try { BUS.on('symbol', () => setTimeout(() => this.draw(), 400)); BUS.on('tf', () => setTimeout(() => this.draw(), 400)); } catch(e){}
    this.count(); this.draw();
  },
  count(){ const n = this.$('tmMarkN'); if (n) n.textContent = this.all().length; },
  arm(on){ this.armed = on; this.ghost = null; const b = this.$('tmMarkBtn'); if (b) b.classList.toggle('on', on); const h = this.$('mainWrap'); if (h) h.classList.toggle('tmMarkArmed', on); if (on && typeof toast === 'function') toast('Click the chart where you expect the move to start. Esc cancels.', 'info'); this.draw(); },
  geo(){ const el = this.$('mainChart'), host = this.$('mainWrap'); if (!el || !host) return null; const r = el.getBoundingClientRect(), h = host.getBoundingClientRect(); let ps = 70; try { ps = Chart.main.priceScale('right').width(); } catch(e){} return { x: r.left - h.left, y: r.top - h.top, w: r.width, h: r.height, plotW: r.width - ps, hostR: h }; },
  pt(e){ const g = this.geo(); if (!g) return null; const x = e.clientX - g.hostR.left - g.x, y = e.clientY - g.hostR.top - g.y; if (x < 0 || y < 0 || x > g.plotW || y > g.h - 26) return null;
    let price = null, time = null; try { price = Chart.priceSeries.coordinateToPrice(y); time = Chart.main.timeScale().coordinateToTime(x); } catch(e){} if (price == null) return null;
    const raw = Chart.raw || []; let bar = null; if (time != null) bar = raw.find(b => b.time === time); if (!bar) bar = raw[raw.length - 1];
    return { x, y, price, bar }; },
  barOf(m){ const raw = Chart.raw || []; let k = -1; for (let i = raw.length - 1; i >= 0; i--){ if (raw[i].rawTime <= m.raw){ k = i; break; } } return k; },
  hitAt(e){ const g = this.geo(); if (!g) return null; const x = e.clientX - g.hostR.left - g.x, y = e.clientY - g.hostR.top - g.y; return this.hits.find(h => (h.x - x) ** 2 + (h.y - y) ** 2 < 15 * 15) || null; },
  click(e){
    if (e.target.closest('#tmMarkBar, #tmMarkForm, #tmMarkCard, #tmExpand')) return;
    if (this.armed){ const p = this.pt(e); if (!p) return; e.preventDefault(); e.stopPropagation(); this.arm(false); this.form(p); return; }
    const h = this.hitAt(e); if (h){ e.preventDefault(); e.stopPropagation(); this.card(h.id, h); }
  },
  /* the little form at the mark: buy or sell, target, stop, size, note */
  form(p){
    const old = this.$('tmMarkForm'); if (old) old.remove(); const g = this.geo(), sym = STORE.symbol, v = Chart.raw || [], n = v.length;
    let atr = 0; for (let i = Math.max(1, n - 14); i < n; i++) atr += v[i].high - v[i].low; atr /= Math.max(1, Math.min(14, n - 1));
    const lastLots = +(localStorage.getItem('astra_marks_lots') || '') || '', last = v[n - 1] ? v[n - 1].close : p.price, dir0 = p.price <= last ? 1 : -1;
    const f = document.createElement('div'); f.id = 'tmMarkForm'; f.style.left = Math.min(g.x + p.x + 14, g.x + g.plotW - 300) + 'px'; f.style.top = Math.max(8, Math.min(g.y + p.y - 40, g.y + g.h - 330)) + 'px';
    f.innerHTML = '<div class="tmMfHead"><b>' + this.esc(this.base(sym)) + '</b><span>' + this.esc(STORE.tf) + ' · ' + this.when({ sym }, p.bar.rawTime) + '</span><button type="button" data-mf="close" title="Cancel">✕</button></div>' +
      '<div class="tmMfDir"><button type="button" data-mf="dir:1" class="' + (dir0 > 0 ? 'on' : '') + ' up">▲ I expect a buy</button><button type="button" data-mf="dir:-1" class="' + (dir0 < 0 ? 'on' : '') + ' dn">▼ I expect a sell</button></div>' +
      '<label>From price<input id="tmMfPrice" type="number" step="any" value="' + this.px(p.price).replace(/,/g, '') + '"></label>' +
      '<div class="tmMfRow"><label>Target<input id="tmMfTp" type="number" step="any" placeholder="none"></label><label>Stop<input id="tmMfSl" type="number" step="any" placeholder="none"></label></div>' +
      '<button type="button" class="tmMfGhost" data-mf="atr" title="Stop one average candle range away, target two">Suggest a 1 : 2 stop and target from the candle range</button>' +
      '<div class="tmMfRow"><label>Size in lots<input id="tmMfLots" type="number" step="0.01" min="0" placeholder="optional" value="' + lastLots + '"></label><label>Note<input id="tmMfNote" type="text" maxlength="200" placeholder="why"></label></div>' +
      '<button type="button" class="tmMfSave" data-mf="save">Put the mark</button><p>It only records your call. Nothing is sent to the broker.</p>';
    this.$('mainWrap').appendChild(f); let dir = dir0;
    f.addEventListener('click', e => { const b = e.target.closest('[data-mf]'); if (!b) return; const k = b.dataset.mf;
      if (k === 'close') f.remove();
      else if (k.startsWith('dir:')){ dir = +k.slice(4); f.querySelectorAll('.tmMfDir button').forEach(x => x.classList.toggle('on', x === b)); }
      else if (k === 'atr'){ const pr = +this.$('tmMfPrice').value; this.$('tmMfSl').value = +(pr - dir * atr).toPrecision(7); this.$('tmMfTp').value = +(pr + dir * 2 * atr).toPrecision(7); }
      else if (k === 'save'){ const price = +this.$('tmMfPrice').value, tp = +this.$('tmMfTp').value || null, sl = +this.$('tmMfSl').value || null, lots = +this.$('tmMfLots').value || null;
        if (!(price > 0)) return; if (tp && dir * (tp - price) <= 0){ this.$('tmMfTp').focus(); return toast && toast('The target is on the wrong side for a ' + (dir > 0 ? 'buy' : 'sell'), 'warn'); } if (sl && dir * (price - sl) <= 0){ this.$('tmMfSl').focus(); return toast && toast('The stop is on the wrong side for a ' + (dir > 0 ? 'buy' : 'sell'), 'warn'); }
        if (lots) try { localStorage.setItem('astra_marks_lots', String(lots)); } catch(er){}
        const list = this.all(); list.push({ id: 'm' + Date.now().toString(36), sym, tf: STORE.tf, raw: p.bar.rawTime, price, dir, tp, sl, lots, note: this.$('tmMfNote').value.trim(), at: Date.now() }); this.save(list); f.remove(); this.fresh = list[list.length - 1].id; this.draw(); } });
    f.addEventListener('keydown', e => { if (e.key === 'Enter'){ const s = f.querySelector('[data-mf="save"]'); if (s) s.click(); } });
  },
  card(id, h){
    const old = this.$('tmMarkCard'); if (old) old.remove(); const m = this.all().find(x => x.id === id); if (!m) return; const J = this.judge(m, Chart.raw), g = this.geo();
    const c = document.createElement('div'); c.id = 'tmMarkCard'; c.style.left = Math.min(g.x + h.x + 16, g.x + g.plotW - 290) + 'px'; c.style.top = Math.max(8, g.y + h.y - 30) + 'px';
    const rowsHtml = !J ? '' : J.wait ? '<p class="tmMcWait">' + this.esc(J.reason) + '. Had you placed it as an order, nothing would have happened yet.</p>' :
      '<div class="tmMcBig ' + (J.right ? 'up' : 'dn') + '"><b>' + (J.right ? 'You were right' : 'It went against you') + '</b><span>' + this.sg(J.pct, 2, '%') + (J.money != null ? ' · ' + this.sg(J.money, 2) + ' ' + this.cur() + ' for ' + m.lots + ' lots' : '') + '</span></div>' +
      '<div class="tmMcGrid"><span>Best</span><b class="up">' + this.sg(J.best, 2, '%') + '</b><span>Worst</span><b class="dn">' + this.sg(J.worst, 2, '%') + '</b><span>' + (J.hit ? 'Ended' : 'Now') + '</span><b>' + (J.hit ? J.hit + ' hit after ' + J.n + ' candles' : this.px(J.exit) + ' · ' + J.n + ' candles in') + '</b></div>' +
      (m.lots ? '' : '<p class="tmMcWait">Give the mark a size to see it in money.</p>');
    c.innerHTML = '<div class="tmMfHead"><b>' + (m.dir > 0 ? '▲ Buy' : '▼ Sell') + ' from ' + this.px(m.price) + '</b><span>' + this.esc(this.base(m.sym)) + ' · ' + m.tf + ' · ' + this.when(m, m.raw) + '</span><button type="button" data-mc="close">✕</button></div>' + rowsHtml +
      (m.tp || m.sl ? '<p class="tmMcLv">' + (m.tp ? 'target ' + this.px(m.tp) : '') + (m.tp && m.sl ? ' · ' : '') + (m.sl ? 'stop ' + this.px(m.sl) : '') + '</p>' : '') + (m.note ? '<p class="tmMcNote">“' + this.esc(m.note) + '”</p>' : '') +
      '<div class="tmMcAct"><button type="button" data-mc="list">All my marks</button><button type="button" data-mc="del" class="dn">Delete</button></div>';
    this.$('mainWrap').appendChild(c);
    c.addEventListener('click', e => { const b = e.target.closest('[data-mc]'); if (!b) return; const k = b.dataset.mc; if (k === 'close') c.remove(); else if (k === 'list'){ c.remove(); this.board(true); } else if (k === 'del'){ this.save(this.all().filter(x => x.id !== id)); c.remove(); this.draw(); } });
  },
  draw(){
    const cv = this.$('tmMarkCv'), g = this.geo(); if (!cv || !g || typeof Chart === 'undefined' || !Chart.main) return; const dpr = window.devicePixelRatio || 1;
    cv.style.left = g.x + 'px'; cv.style.top = g.y + 'px'; cv.style.width = g.w + 'px'; cv.style.height = g.h + 'px'; if (cv.width !== Math.round(g.w * dpr) || cv.height !== Math.round(g.h * dpr)){ cv.width = Math.round(g.w * dpr); cv.height = Math.round(g.h * dpr); }
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, g.w, g.h); this.hits = [];
    const marks = this.all().filter(m => m.sym === STORE.symbol), raw = Chart.raw || [], ts = Chart.main.timeScale(), C = this.C, R = g.plotW, now = performance.now();
    c.save(); c.beginPath(); c.rect(0, 0, R, g.h); c.clip(); c.textBaseline = 'middle';
    for (const m of marks){ const k = this.barOf(m); if (k < 0) continue; let x = ts.timeToCoordinate(raw[k].time), y = Chart.priceSeries.priceToCoordinate(m.price); if (y == null) continue; const off = x == null; if (off) x = -20;
      const J = this.judge(m, raw), col = !J || J.wait ? C.am : J.right ? C.up : C.dn, dcol = m.dir > 0 ? C.up : C.dn;
      /* from the mark to now: the band between your price and where it went */
      if (J && !J.wait){ const xE = J.iE != null ? ts.timeToCoordinate(raw[J.iE].time) : x, xEnd = J.hit ? ts.timeToCoordinate(raw[J.iH].time) : R, yE = Chart.priceSeries.priceToCoordinate(J.exit);
        if (yE != null){ const x0 = xE == null ? 0 : xE, x1 = xEnd == null ? R : xEnd, grd = c.createLinearGradient(x0, 0, x1, 0); grd.addColorStop(0, J.right ? 'rgba(61,220,151,.05)' : 'rgba(255,107,122,.05)'); grd.addColorStop(1, J.right ? 'rgba(61,220,151,.20)' : 'rgba(255,107,122,.20)'); c.fillStyle = grd; c.fillRect(x0, Math.min(y, yE), Math.max(1, x1 - x0), Math.abs(yE - y)); } }
      const lv = (p, colr, txt) => { const yy = Chart.priceSeries.priceToCoordinate(p); if (yy == null) return; c.strokeStyle = colr; c.globalAlpha = 0.75; c.lineWidth = 1; c.setLineDash([4, 4]); c.beginPath(); c.moveTo(Math.max(0, x), yy); c.lineTo(R, yy); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; c.font = '600 10px Inter, sans-serif'; c.fillStyle = colr; c.textAlign = 'right'; c.fillText(txt, R - 6, yy - 7); };
      if (m.tp) lv(m.tp, C.up, 'target'); if (m.sl) lv(m.sl, C.dn, 'stop');
      c.strokeStyle = dcol; c.lineWidth = 1.3; c.setLineDash([6, 3]); c.beginPath(); c.moveTo(Math.max(0, x), y); c.lineTo(R, y); c.stroke(); c.setLineDash([]);
      if (!off){ const pulse = this.fresh === m.id ? 0.5 + 0.5 * Math.sin(now / 260) : 0; c.fillStyle = dcol; c.shadowColor = dcol; c.shadowBlur = 10 + pulse * 14; c.beginPath(); c.arc(x, y, 8, 0, 6.3); c.fill(); c.shadowBlur = 0; c.strokeStyle = '#060A12'; c.lineWidth = 2; c.stroke();
        c.fillStyle = '#04121A'; c.beginPath(); if (m.dir > 0){ c.moveTo(x, y - 4); c.lineTo(x + 4, y + 2.5); c.lineTo(x - 4, y + 2.5); } else { c.moveTo(x, y + 4); c.lineTo(x + 4, y - 2.5); c.lineTo(x - 4, y - 2.5); } c.fill();
        /* the flag pole and flag above (or below for a sell), so a small candle is not hidden */
        const fy = y + (m.dir > 0 ? 22 : -22); c.strokeStyle = dcol; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, y + (m.dir > 0 ? 8 : -8)); c.lineTo(x, fy); c.stroke();
        c.font = '700 10px Inter, sans-serif'; const tag = m.dir > 0 ? 'MY BUY' : 'MY SELL', tw = c.measureText(tag).width + 12; c.fillStyle = dcol; c.beginPath(); c.roundRect ? c.roundRect(x - tw / 2, fy - (m.dir > 0 ? 0 : 16), tw, 16, 5) : c.rect(x - tw / 2, fy - (m.dir > 0 ? 0 : 16), tw, 16); c.fill(); c.fillStyle = '#04121A'; c.textAlign = 'center'; c.fillText(tag, x, fy + (m.dir > 0 ? 8.5 : -7.5));
        this.hits.push({ id: m.id, x, y }); }
      /* the result, at the right edge */
      const txt = this.label(m, J); c.font = '600 11px Inter, sans-serif'; const w = c.measureText(txt).width + 18, bx = R - w - 8, by = y + (m.dir > 0 ? -22 : 22) - 10; c.fillStyle = 'rgba(6,10,18,.86)'; c.strokeStyle = col; c.lineWidth = 1.2; c.beginPath(); c.roundRect ? c.roundRect(bx, by, w, 20, 10) : c.rect(bx, by, w, 20); c.fill(); c.stroke(); c.fillStyle = col; c.textAlign = 'left'; c.fillText(txt, bx + 9, by + 10.5);
      this.hits.push({ id: m.id, x: bx + w / 2, y: by + 10 }); }
    /* while placing: a ghost line with the price */
    if (this.armed && this.ghost){ const p = this.ghost; c.strokeStyle = 'rgba(255,182,72,.85)'; c.setLineDash([3, 3]); c.lineWidth = 1; c.beginPath(); c.moveTo(0, p.y); c.lineTo(R, p.y); c.moveTo(p.x, 0); c.lineTo(p.x, g.h); c.stroke(); c.setLineDash([]); c.fillStyle = C.am; c.beginPath(); c.arc(p.x, p.y, 6, 0, 6.3); c.fill(); c.font = '600 11px Inter, sans-serif'; c.textAlign = 'left'; c.fillText('mark at ' + this.px(p.price), p.x + 12, p.y - 12); }
    c.restore();
    if (this.fresh && !this._pulse){ this._pulse = true; const loop = () => { if (!this.fresh || performance.now() - (this._p0 || (this._p0 = performance.now())) > 4000){ this.fresh = null; this._pulse = false; this._p0 = 0; this.draw(); return; } this.draw(); requestAnimationFrame(loop); }; requestAnimationFrame(loop); }
  },

  /* ---------- My marks: every mark, how it went, best first ---------- */
  async board(open){
    let p = this.$('tmMarkBoard'); if (!open){ if (p) p.hidden = true; return; }
    if (!p){ p = document.createElement('div'); p.id = 'tmMarkBoard'; document.body.appendChild(p); p.addEventListener('mousedown', e => { if (e.target === p) p.hidden = true; });
      p.addEventListener('click', e => { const b = e.target.closest('[data-mb]'); if (!b) return; const [k, v] = b.dataset.mb.split(':'); if (k === 'close') p.hidden = true; else if (k === 'f'){ this.filt = v; this.paintBoard(); } else if (k === 'go') this.goTo(v); else if (k === 'del'){ this.save(this.all().filter(x => x.id !== v)); this.paintBoard(); this.draw(); } }); }
    p.hidden = false; this.paintBoard();
    /* the marks on other charts need their own candles: read them one at a time */
    for (const m of this.all()){ if (p.hidden) break; const k = m.sym + '|' + m.tf; if (this.cache[k] && Date.now() - this.cache[k].at < 120000) continue; try { const S = this.TF[m.tf] || 900, bars = typeof Autopsy !== 'undefined' ? await Autopsy.candles(m.sym, m.tf, m.raw - 5 * S, Math.floor(Date.now() / 1000) + 7200) : null; if (bars) this.cache[k] = { at: Date.now(), bars }; } catch(e){} this.paintBoard(); }
  },
  judged(){ return this.all().map(m => { const k = m.sym + '|' + m.tf, bars = m.sym === STORE.symbol && m.tf === STORE.tf ? Chart.raw : this.cache[k] && this.cache[k].bars; return { m, J: bars ? this.judge(m, bars) : null }; }); },
  paintBoard(){
    const p = this.$('tmMarkBoard'); if (!p || p.hidden) return; const all = this.judged(), done = all.filter(x => x.J && !x.J.wait), right = done.filter(x => x.J.right), money = done.filter(x => x.J.money != null).reduce((a, x) => a + x.J.money, 0), hasMoney = done.some(x => x.J.money != null);
    const f = this.filt, rows = all.filter(x => f === 'all' || (f === 'right' ? x.J && !x.J.wait && x.J.right : f === 'wrong' ? x.J && !x.J.wait && !x.J.right : f === 'wait' ? !x.J || x.J.wait : f === 'here' ? x.m.sym === STORE.symbol : true)).sort((a, b) => (b.J && !b.J.wait ? b.J.pct : -1e9) - (a.J && !a.J.wait ? a.J.pct : -1e9));
    const mx = Math.max(0.5, ...done.map(x => Math.abs(x.J.pct))), ring = done.length ? right.length / done.length : 0, R = 30, L = 2 * Math.PI * R;
    p.innerHTML = '<div class="tmMbBox" role="dialog" aria-label="My marks"><div class="tmMbHead"><b>My marks</b><span>Your calls on the charts, and how each one went since</span><button type="button" data-mb="close">✕</button></div>' +
      '<div class="tmMbKpis"><div class="tmMbRing"><svg viewBox="0 0 76 76"><circle cx="38" cy="38" r="' + R + '" fill="none" stroke="rgba(255,107,122,.35)" stroke-width="8"/><circle cx="38" cy="38" r="' + R + '" fill="none" stroke="#3DDC97" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (L * ring).toFixed(1) + ' ' + L.toFixed(1) + '" transform="rotate(-90 38 38)"/></svg><b>' + (done.length ? Math.round(ring * 100) + '%' : '–') + '</b><span>right</span></div>' +
      '<div><b>' + all.length + '</b><span>marks</span></div><div><b>' + done.length + '</b><span>reached your price</span></div><div><b class="up">' + right.length + '</b><span>went your way</span></div><div><b class="dn">' + (done.length - right.length) + '</b><span>went against</span></div>' +
      (hasMoney ? '<div><b class="' + (money >= 0 ? 'up' : 'dn') + '">' + this.sg(money, 2) + '</b><span>' + this.cur() + ' for the sizes you gave</span></div>' : '') + '</div>' +
      (done.length && done.length < 20 ? '<p class="tmMbNote">' + done.length + ' marks are too few to say whether your calls have an edge; keep marking.</p>' : '') +
      '<div class="tmMbChips">' + [['all', 'All'], ['here', 'This chart'], ['right', 'Right'], ['wrong', 'Wrong'], ['wait', 'Not reached']].map(c => '<button type="button" data-mb="f:' + c[0] + '" class="' + (f === c[0] ? 'on' : '') + '">' + c[1] + '</button>').join('') + '</div>' +
      '<div class="tmMbList">' + (rows.length ? rows.map(({ m, J }) => { const ok = J && !J.wait, w = ok ? Math.abs(J.pct) / mx * 50 : 0;
        return '<div class="tmMbRow"><button type="button" class="tmMbMain" data-mb="go:' + m.id + '" title="Open the chart at this mark"><span class="tmMbSym"><b>' + this.esc(this.base(m.sym)) + '</b><i class="' + (m.dir > 0 ? 'up' : 'dn') + '">' + (m.dir > 0 ? '▲ buy' : '▼ sell') + '</i><small>' + m.tf + ' · ' + this.when(m, m.raw) + '</small></span>' +
          '<span class="tmMbTrk"><u class="' + (ok ? (J.right ? 'up' : 'dn') : '') + '" style="' + (ok ? (J.pct >= 0 ? 'left:50%' : 'right:50%') + ';width:' + w.toFixed(1) + '%' : 'width:0') + '"></u><i></i></span>' +
          '<span class="tmMbRes ' + (ok ? (J.right ? 'up' : 'dn') : 'am') + '">' + (!J ? 'reading…' : J.wait ? 'not reached' : this.sg(J.pct, 2, '%') + (J.money != null ? '<small>' + this.sg(J.money, 2) + '</small>' : '')) + '</span>' +
          '<span class="tmMbHow">' + (!J ? '' : J.wait ? '' : J.hit ? J.hit + ' · ' + J.n + ' candles' : 'running · ' + J.n + ' candles') + (m.note ? ' · “' + this.esc(m.note.slice(0, 40)) + '”' : '') + '</span></button><button type="button" class="tmMbDel" data-mb="del:' + m.id + '" title="Delete this mark">✕</button></div>'; }).join('') : '<div class="tmMbEmpty">No mark yet. Press <b>Mark</b> on the chart, then click where you expect a buy or a sell.</div>') + '</div></div>';
  },
  goTo(id){ const m = this.all().find(x => x.id === id); if (!m) return; const p = this.$('tmMarkBoard'); if (p) p.hidden = true; if (typeof Face !== 'undefined' && Face.on && Face.on()) Face.go('chart');
    const show = () => { try { const raw = Chart.raw, k = this.barOf(m); if (k < 0) return; const lr = Chart.main.timeScale().getVisibleLogicalRange(), span = lr ? Math.max(60, lr.to - lr.from) : 120; Chart.main.timeScale().setVisibleLogicalRange({ from: k - span * 0.3, to: k + span * 0.7 }); this.fresh = m.id; this.draw(); } catch(e){} };
    const need = m.sym !== STORE.symbol || m.tf !== STORE.tf; if (!need) return show();
    try { if (m.sym !== STORE.symbol){ typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(m.sym) : App.setSymbol(m.sym); } setTimeout(() => { if (STORE.tf !== m.tf && App.setTf) App.setTf(m.tf); setTimeout(show, 1500); }, 600); } catch(e){} },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => { try { Marks.init(); } catch(e){ console.warn('marks', e); } }, 1200));
