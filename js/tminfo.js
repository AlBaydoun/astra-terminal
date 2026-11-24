/* ASTRA / Timurila — Info: the Dashboard, the Deep Dive and Live, redrawn as infographics.

   These are VIEWS of the same records Classic keeps: every paper ledger (Bots.ledgers), and the
   live trades and positions MetaTrader reports. Each view has a switch back to the full Classic
   page, where every control still lives. Everything is drillable:
     Dashboard  → a bot (sphere, league row) or a day  → Deep Dive, already filtered
     Deep Dive  → any bar filters every other chart     → a trade → its Autopsy
     Live       → a bot → Deep Dive on its real trades  · a position → its chart

   The Live view only shows. It has no button that places, changes or closes an order, arms or
   stops a bot: those stay on the Classic live desk, behind its typed gates. It reads the bridge
   with GET requests only (/health, /positions, and /deals through js/autopsy.js). */
const Info = {
  C: { up: '#3DDC97', dn: '#FF6B7A', cy: '#4FD8F7', am: '#FFB648', grid: '#16223A', text: '#E6EEFF', dim: '#7C8BA8' },
  DOW: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  f: { src: 'paper', period: 'all', bot: '', sym: '', tf: '', dir: '', reason: '', dow: '', hour: '', day: '' },
  trades: [], kind: '', host: null, acct: null, pos: null, at: 0,
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  num(v, d = 0){ return v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  sg(v, d = 0, u = ''){ if (v == null || !isFinite(v)) return '–'; const z = Math.abs(v) < 0.5 * Math.pow(10, -d); return (z ? '' : v > 0 ? '+' : '−') + this.num(Math.abs(v), d) + u; },
  cls(v){ return v > 0 ? 'up' : v < 0 ? 'dn' : ''; },
  sym(s){ return String(s).replace(/\.(s|m|std)$/i, ''); },
  dayKey(ms){ const d = new Date(ms); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); },
  reasonOf(t){ const r = String(t.reason || 'other').toLowerCase(); return /target/.test(r) ? 'Target' : /break ?even/.test(r) ? 'Breakeven stop' : /trail/.test(r) ? 'Trailing stop' : /stop/.test(r) ? 'Stop' : /time|limit|expired/.test(r) ? 'Time limit' : /manual|closed/.test(r) ? 'Closed by hand' : 'Other'; },

  /* ---------- data ---------- */
  stat(list){ const s = list.slice().sort((a, b) => a.t1 - b.t1), curve = []; let w = 0, net = 0, gp = 0, gl = 0, rs = 0, rn = 0, peak = 0, dd = 0;
    for (const t of s){ net += t.pnl; if (t.pnl > 0){ w++; gp += t.pnl; } else gl -= t.pnl; if (t.r != null){ rs += Math.max(-5, Math.min(5, t.r)); rn++; } if (net > peak) peak = net; if (peak - net > dd) dd = peak - net; curve.push({ t: t.t1, v: net }); }
    return { n: s.length, w, wr: s.length ? 100 * w / s.length : 0, net, pf: gl ? gp / gl : gp ? 99 : 0, avgR: rn ? rs / rn : null, dd, curve }; },
  group(list, key){ const m = new Map(); for (const t of list){ const k = key(t); if (k == null) continue; let g = m.get(k); if (!g) m.set(k, g = { k, n: 0, w: 0, net: 0 }); g.n++; if (t.pnl > 0) g.w++; g.net += t.pnl; } return m; },
  rows(skip){ const f = this.f, since = f.period === 'all' ? 0 : Date.now() - (+f.period) * 86400000, on = k => !(Array.isArray(skip) ? skip.includes(k) : k === skip) && f[k] !== '';
    return this.trades.filter(t => t.src === f.src && t.t1 >= since && (!on('bot') || t.bot === f.bot) && (!on('sym') || t.sym === f.sym) && (!on('tf') || t.tf === f.tf) && (!on('dir') || String(t.dir) === f.dir) && (!on('reason') || this.reasonOf(t) === f.reason) &&
      (!on('dow') || String(new Date(t.t0).getDay()) === f.dow) && (!on('hour') || String(new Date(t.t0).getHours()) === f.hour) && (!on('day') || this.dayKey(t.t1) === f.day)); },
  async get(path){ const r = await fetch(Feed.BRIDGE_URL + path, { cache: 'no-store', signal: AbortSignal.timeout(6000) }); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); },
  async refresh(){
    if (this.busy) return; this.busy = true;
    try { if (typeof Autopsy !== 'undefined'){ if (Date.now() - this.at > 60000){ Autopsy.live = null; this.at = Date.now(); } await Autopsy.collect(); this.trades = Autopsy.trades; }
      if (this.kind === 'live' && typeof Feed !== 'undefined' && Feed.bridge){ try { this.acct = await this.get('/health'); const p = await this.get('/positions'); this.pos = p.positions || []; } catch(e){} } } catch(e){ console.warn('info', e); }
    this.busy = false; this.paint();
  },

  /* ---------- frame ---------- */
  async open(host, kind){
    this.host = host; this.kind = kind;
    const T = { dash: ['Dashboard', 'Every bot at a glance. Click anything to go deeper.', 'dash'], deep: ['Deep Dive', 'Every closed trade, sliced. Click any bar: every other chart follows.', 'deep'], live: ['Live', 'Your real account, read from MetaTrader. This view only shows; the switches stay on the Classic live desk.', 'live'],
      livedive: ['Live Dive', 'Every real trade MetaTrader recorded in the last year, sliced. Click any bar: every other chart follows.', 'livedive'] }[kind];
    if (kind === 'livedive') this.f.src = 'live'; else if (kind === 'deep' && this._last === 'livedive') this.f.src = 'paper'; this._last = kind;
    host.innerHTML = '<div class="tmiWrap"><div class="tmiHead"><div><h1>' + T[0] + '</h1><p>' + T[1] + '</p></div><div class="tmiSeg"><button class="on" type="button">Infographic</button>' + (kind === 'deep' || kind === 'livedive' ? '<button type="button" data-i="visual:1" title="Classic’s own page and every function of it, redrawn, with the wizard on top">Visual</button>' : '') + '<button type="button" data-i="classic:' + T[2] + '">' + (kind === 'live' ? 'Classic live desk' : 'Classic page') + '</button></div></div><div id="tmiBody"><div class="tmiEmpty">Reading your trades…</div></div></div>';
    host.onclick = e => this.click(e);
    host.onmousemove = e => { const c = e.target.closest('.tmiTilt'); if (this._tilt && this._tilt !== c){ this._tilt.style.transform = ''; } this._tilt = c; if (!c) return; const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5; c.style.transform = 'perspective(900px) rotateX(' + (-y * 7).toFixed(2) + 'deg) rotateY(' + (x * 9).toFixed(2) + 'deg) translateZ(6px)'; };
    host.onmouseleave = () => { if (this._tilt){ this._tilt.style.transform = ''; this._tilt = null; } };
    clearInterval(this.timer); this.timer = setInterval(() => { if (this.host && this.host.isConnected && this.host.offsetParent !== null && !document.hidden) this.refresh(); }, 20000);
    this._sig = ''; await this.refresh();
  },
  click(e){
    const b = e.target.closest('[data-i]'); if (!b) return; const i = b.dataset.i.indexOf(':'), k = b.dataset.i.slice(0, i), v = b.dataset.i.slice(i + 1);
    if (k === 'classic'){ if (typeof Face !== 'undefined') Face.view(Face.room, 'classic'); }
    else if (k === 'visual'){ Face.view(Face.room, 'visual'); }
    else if (k === 'room'){ Face.go(v); }
    else if (k === 'pb'){ if (b.tagName === 'BUTTON') e.preventDefault(); if (typeof Wizard !== 'undefined') Wizard.shelfClick(v); }
    else if (k === 'drill'){ const o = JSON.parse(v); this.f = Object.assign({ src: 'paper', period: 'all', bot: '', sym: '', tf: '', dir: '', reason: '', dow: '', hour: '', day: '' }, o); if (this.kind === 'deep'){ this._sig = ''; this.paint(); } else { Face.view('deep', 'info'); } }
    else if (k === 'f'){ const j = v.indexOf('='), key = v.slice(0, j), val = v.slice(j + 1); this.f[key] = this.f[key] === val && key !== 'src' && key !== 'period' ? '' : val; if (key === 'src') Object.assign(this.f, { bot: '', sym: '', tf: '', reason: '' }); this._sig = ''; this.paint(); }
    else if (k === 'clear'){ Object.assign(this.f, { bot: '', sym: '', tf: '', dir: '', reason: '', dow: '', hour: '', day: '' }); this._sig = ''; this.paint(); }
    else if (k === 'trade'){ if (typeof Autopsy !== 'undefined'){ Autopsy.want = v; Face.go('autopsy'); } }
    else if (k === 'bot'){ Face.view(Face.room, 'classic'); Face.bot(v); }
    else if (k === 'chart'){ Face.go('chart'); try { typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(v) : App.setSymbol(v); } catch(x){} }
  },
  paint(){ const body = this.host && this.host.isConnected ? document.getElementById('tmiBody') : null; if (!body) return; this['paint_' + this.kind](body); },

  /* ---------- small pieces ---------- */
  ring(pct, col, label, sub){ const c = 2 * Math.PI * 18, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100); return '<div class="tmiRing"><svg viewBox="0 0 44 44"><circle cx="22" cy="22" r="18" class="bg"/><circle cx="22" cy="22" r="18" class="fg" style="stroke:' + col + ';stroke-dasharray:' + c.toFixed(1) + ';--off:' + off.toFixed(1) + '"/></svg><b' + (String(label).length > 4 ? ' class="sm"' : '') + '>' + label + '</b>' + (sub ? '<small>' + sub + '</small>' : '') + '</div>'; },
  spark(vals, w = 150, h = 34){ if (vals.length < 2) return ''; const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals), sp = hi - lo || 1, X = i => i / (vals.length - 1) * w, Y = v => h - 2 - (v - lo) / sp * (h - 4), last = vals[vals.length - 1], col = last >= 0 ? this.C.up : this.C.dn;
    return '<svg class="tmiSpark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><line x1="0" x2="' + w + '" y1="' + Y(0).toFixed(1) + '" y2="' + Y(0).toFixed(1) + '" stroke="#2A3B5C" stroke-width="1"/><polyline fill="none" stroke="' + col + '" stroke-width="1.8" stroke-linejoin="round" points="' + vals.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + '"/></svg>'; },
  thin(a, n){ if (a.length <= n) return a; const o = []; for (let i = 0; i < n; i++) o.push(a[Math.round(i * (a.length - 1) / (n - 1))]); return o; },
  /* a card of diverging bars; a click on a bar sets that filter (or drills, on the Dashboard) */
  bars(title, list, o){ o = o || {}; const max = Math.max(1e-9, ...list.map(g => Math.abs(g.net)));
    return '<div class="tmiCard"><h3>' + title + (o.note ? '<small>' + o.note + '</small>' : '') + '</h3><div class="tmiBars' + (o.dense ? ' dense' : '') + '">' + (list.length ? list.map(g => { const w = Math.abs(g.net) / max * 50, on = o.sel != null && String(o.sel) === String(g.k);
      return '<button type="button" class="tmiBarRow' + (on ? ' on' : '') + '" data-i="' + this.esc(o.act(g)) + '" title="' + g.n + ' trades · ' + (g.n ? Math.round(100 * g.w / g.n) : 0) + '% won"><span>' + this.esc(o.label ? o.label(g) : g.k) + '</span><i class="tmiTrk"><u class="' + (g.net >= 0 ? 'up' : 'dn') + '" style="width:' + w.toFixed(1) + '%"></u></i><b class="' + this.cls(g.net) + '">' + this.sg(g.net, 0) + '</b><em>' + g.n + '</em></button>'; }).join('') : '<div class="tmiEmpty small">Nothing here.</div>') + '</div></div>'; },
  cal(list, src){ const by = this.group(list, t => this.dayKey(t.t1)), days = 70, now = new Date(); now.setHours(12, 0, 0, 0); const end = new Date(now); end.setDate(end.getDate() + (6 - ((end.getDay() + 6) % 7))); let max = 1e-9; for (const g of by.values()) max = Math.max(max, Math.abs(g.net)); let h = '';
    for (let i = days - 1; i >= 0; i--){ const d = new Date(end); d.setDate(end.getDate() - i); const k = this.dayKey(d.getTime()), g = by.get(k), fut = d > now, a = g ? 0.18 + 0.82 * Math.min(1, Math.abs(g.net) / max) : 0;
      h += '<button type="button" class="tmiDay' + (fut ? ' fut' : '') + '"' + (g ? ' data-i=\'drill:' + JSON.stringify({ src, day: k }) + '\' style="background:rgba(' + (g.net >= 0 ? '61,220,151' : '255,107,122') + ',' + a.toFixed(2) + ')"' : '') + ' title="' + d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + (g ? ' · ' + this.sg(g.net, 0) + ' · ' + g.n + ' trades' : ' · no trades') + '"></button>'; }
    return '<div class="tmiCal">' + h + '</div><div class="tmiCalFoot"><span>10 weeks ago</span><span>Mon to Sun, top to bottom</span><span>this week</span></div>'; },
  track(lo, hi, at, entry, dir){ if (!(lo > 0) || !(hi > 0) || hi <= lo) return ''; const p = v => Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)); return '<div class="tmiSLTP"><i class="' + (dir > 0 ? 'l' : 'r') + '"></i><u style="left:' + p(entry).toFixed(1) + '%"></u><b style="left:' + p(at).toFixed(1) + '%"></b></div><div class="tmiSLTPf"><span>' + (dir > 0 ? 'stop' : 'target') + '</span><span>' + (dir > 0 ? 'target' : 'stop') + '</span></div>'; },
  fit(cv, h){ const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || 600; cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c, w, h }; },
  curve(cv, pts, h){ const { c, w } = this.fit(cv, h), C = this.C; c.clearRect(0, 0, w, h); if (pts.length < 2){ c.fillStyle = C.dim; c.font = '12px Inter, sans-serif'; c.fillText('Not enough trades to draw a curve.', 12, 22); return; }
    const vs = pts.map(p => p.v), lo = Math.min(0, ...vs), hi = Math.max(0, ...vs), sp = hi - lo || 1, X = i => 8 + i / (pts.length - 1) * (w - 70), Y = v => 10 + (hi - v) / sp * (h - 30);
    c.font = '10px JetBrains Mono, monospace'; c.textBaseline = 'middle'; for (const v of [hi, 0, lo]){ const y = Math.round(Y(v)) + 0.5; c.strokeStyle = v ? C.grid : '#2A3B5C'; c.beginPath(); c.moveTo(0, y); c.lineTo(w - 58, y); c.stroke(); c.fillStyle = C.dim; c.fillText(this.sg(v, 0), w - 54, y); }
    /* the drawdowns: the gap under the running high */
    let peak = -Infinity; c.beginPath(); for (let i = 0; i < pts.length; i++){ peak = Math.max(peak, pts[i].v); c.lineTo(X(i), Y(peak)); } for (let i = pts.length - 1; i >= 0; i--) c.lineTo(X(i), Y(pts[i].v)); c.closePath(); c.fillStyle = 'rgba(255,107,122,.16)'; c.fill();
    const last = vs[vs.length - 1], col = last >= 0 ? C.up : C.dn, g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, last >= 0 ? 'rgba(61,220,151,.22)' : 'rgba(255,107,122,.02)'); g.addColorStop(1, last >= 0 ? 'rgba(61,220,151,.02)' : 'rgba(255,107,122,.22)');
    c.beginPath(); c.moveTo(X(0), Y(0)); for (let i = 0; i < pts.length; i++) c.lineTo(X(i), Y(pts[i].v)); c.lineTo(X(pts.length - 1), Y(0)); c.closePath(); c.fillStyle = g; c.fill();
    c.beginPath(); for (let i = 0; i < pts.length; i++) i ? c.lineTo(X(i), Y(pts[i].v)) : c.moveTo(X(i), Y(pts[i].v)); c.strokeStyle = col; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(X(pts.length - 1), Y(last), 4, 0, 6.3); c.fill();
    c.fillStyle = C.dim; c.font = '10px Inter, sans-serif'; c.textBaseline = 'alphabetic'; const dl = t => new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); c.textAlign = 'left'; c.fillText(dl(pts[0].t), 8, h - 4); c.textAlign = 'right'; c.fillText(dl(pts[pts.length - 1].t), w - 62, h - 4); c.textAlign = 'left'; },
  hist(cv, list, h){ const { c, w } = this.fit(cv, h), C = this.C, rs = list.filter(t => t.r != null).map(t => Math.max(-4, Math.min(4, t.r))); c.clearRect(0, 0, w, h);
    if (rs.length < 5){ if (list.length < 5){ c.fillStyle = C.dim; c.font = '12px Inter, sans-serif'; c.fillText(list.length ? 'Too few trades to draw.' : 'No trades.', 12, 22); return; }
      const ps = list.map(t => t.pnl).sort((a, b) => a - b), cap = Math.max(1e-9, Math.abs(ps[Math.floor(ps.length * 0.03)]), Math.abs(ps[Math.floor(ps.length * 0.97)])), B = 16, bins = new Array(B).fill(0); for (const p of ps) bins[Math.max(0, Math.min(B - 1, Math.floor((Math.max(-cap, Math.min(cap, p)) + cap) / (2 * cap) * B)))]++;
      const max = Math.max(...bins), bw = (w - 16) / B; for (let i = 0; i < B; i++){ const hh = bins[i] / max * (h - 34), x = 8 + i * bw; c.fillStyle = i >= B / 2 ? C.up : C.dn; c.globalAlpha = 0.85; c.beginPath(); c.roundRect(x + 2, h - 22 - hh, bw - 4, hh, 3); c.fill(); } c.globalAlpha = 1;
      c.strokeStyle = '#2A3B5C'; c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w / 2, h - 20); c.stroke(); c.fillStyle = C.dim; c.font = '10px JetBrains Mono, monospace'; c.textAlign = 'center'; for (const q of [-1, -0.5, 0, 0.5, 1]) c.fillText(this.sg(q * cap, 0), 8 + (q + 1) / 2 * (w - 16), h - 6); c.textAlign = 'left'; return; }
    const B = 16, bins = new Array(B).fill(0); for (const r of rs) bins[Math.min(B - 1, Math.floor((r + 4) / 8 * B))]++; const max = Math.max(...bins), bw = (w - 16) / B;
    for (let i = 0; i < B; i++){ const hh = bins[i] / max * (h - 34), x = 8 + i * bw; c.fillStyle = i >= B / 2 ? C.up : C.dn; c.globalAlpha = 0.85; c.beginPath(); c.roundRect(x + 2, h - 22 - hh, bw - 4, hh, 3); c.fill(); } c.globalAlpha = 1;
    c.strokeStyle = '#2A3B5C'; c.beginPath(); c.moveTo(w / 2, 6); c.lineTo(w / 2, h - 20); c.stroke(); c.fillStyle = C.dim; c.font = '10px JetBrains Mono, monospace'; c.textAlign = 'center'; for (const r of [-4, -2, 0, 2, 4]) c.fillText((r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + 'R' + (Math.abs(r) === 4 ? '+' : ''), 8 + (r + 4) / 8 * (w - 16), h - 6); c.textAlign = 'left'; },
  tip(el, html, x, y){ if (!el) return; if (!html){ el.style.opacity = 0; return; } el.innerHTML = html; el.style.opacity = 1; el.style.left = Math.min(el.parentElement.clientWidth - el.offsetWidth - 8, x + 14) + 'px'; el.style.top = Math.max(4, y - 10) + 'px'; },

  /* ---------- Dashboard ---------- */
  paint_dash(body){
    const paper = this.trades.filter(t => t.src === 'paper'), live = this.trades.filter(t => t.src === 'live'), sp = this.stat(paper), sl = this.stat(live), names = new Map(this.trades.map(t => [t.bot, t.botName]));
    const bots = [...this.group(paper, t => t.bot).values()].sort((a, b) => b.net - a.net); let open = [], trading = 0, all = 0, armed = [];
    try { for (const b of BOTS){ if (Bots.isPage(b)) continue; all++; if (!Bots.disabled(b.id)) trading++; for (const p of (Bots.ledgers[b.id] || {}).open || []) open.push(Object.assign({ bot: b.id, botName: typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name }, p)); } } catch(e){}
    try { armed = Live.armedList(); } catch(e){}
    const sig = [this.trades.length, sp.net.toFixed(1), sl.net.toFixed(1), open.length, trading].join('|');
    if (sig !== this._sig || !document.getElementById('tmiGalaxy')){ this._sig = sig; const liveToday = live.filter(t => this.dayKey(t.t1) === this.dayKey(Date.now())).reduce((a, t) => a + t.pnl, 0);
      body.innerHTML = '<div class="tmiHero"><div class="tmiCard tmiScene"><h3>The bot galaxy<small>right = wins more often · up = earns more a trade · deep = more trades · drag to turn, click a bot</small></h3><canvas id="tmiGalaxy"></canvas><div class="tmiTip" id="tmiGTip"></div></div>' +
        '<div class="tmiKpis"><button type="button" class="tmiCard tmiTilt tmiKpi" data-i=\'drill:{"src":"paper"}\'><small>PAPER FLEET · PLAY MONEY</small><b class="' + this.cls(sp.net) + '">' + this.sg(sp.net, 0) + '</b>' + this.spark(this.thin(sp.curve.map(p => p.v), 80)) + '<span>' + sp.n + ' closed trades · deepest drop ' + this.num(sp.dd, 0) + '</span></button>' +
        '<div class="tmiCard tmiTilt tmiKpi two">' + this.ring(sp.wr, this.C.cy, Math.round(sp.wr) + '%', 'won') + '<div><small>PROFIT FACTOR</small><b>' + (sp.pf >= 99 ? '∞' : this.num(sp.pf, 2)) + '</b><small>AVERAGE TRADE</small><b class="' + this.cls(sp.avgR) + '">' + (sp.avgR == null ? '–' : this.sg(sp.avgR, 2, 'R')) + '</b></div></div>' +
        '<button type="button" class="tmiCard tmiTilt tmiKpi" data-i="room:live"><small>LIVE · REAL MONEY · 365 DAYS</small><b class="' + this.cls(sl.net) + '">' + this.sg(sl.net, 2) + '</b>' + this.spark(this.thin(sl.curve.map(p => p.v), 80)) + '<span>' + sl.n + ' trades · ' + Math.round(sl.wr) + '% won · today ' + this.sg(liveToday, 2) + '</span></button>' +
        '<div class="tmiCard tmiTilt tmiKpi two">' + this.ring(all ? 100 * trading / all : 0, this.C.am, trading + '/' + all, 'bots on') + '<div><small>OPEN ON PAPER</small><b>' + open.length + '</b><small>ARMED FOR LIVE</small><b class="' + (armed.length ? 'am' : '') + '">' + armed.length + '</b></div></div></div></div>' +
        '<div class="tmiCols"><div class="tmiCol2">' + this.bars('Bots league', bots, { note: 'net result on paper · click a bot to open its trades', label: g => names.get(g.k) || g.k, act: g => 'drill:' + JSON.stringify({ src: 'paper', bot: g.k }) }) + '</div>' +
        '<div class="tmiCol1"><div class="tmiCard"><h3>Paper, day by day<small>click a day</small></h3>' + this.cal(paper, 'paper') + '</div><div class="tmiCard"><h3>Live, day by day<small>real money</small></h3>' + this.cal(live, 'live') + '</div></div></div>' +
        '<div class="tmiCard"><h3>Open on paper right now<small>' + open.length + ' positions · the dot is the price between stop and target</small></h3><div class="tmiTiles">' + (open.length ? open.sort((a, b) => Math.abs(b.unreal || 0) - Math.abs(a.unreal || 0)).slice(0, 16).map(p => { const lo = Math.min(p.sl, p.tp), hi = Math.max(p.sl, p.tp);
          return '<button type="button" class="tmiPos tmiTilt" data-i="chart:' + this.esc(p.sym) + '"><div><b>' + this.esc(this.sym(p.sym)) + '</b><i class="' + (p.dir > 0 ? 'up' : 'dn') + '">' + (p.dir > 0 ? '▲ buy' : '▼ sell') + '</i><em class="' + this.cls(p.unreal) + '">' + this.sg(p.unreal, 0) + '</em></div>' + this.track(lo, hi, p.last || p.entry, p.entry, p.dir) + '<span>' + this.esc(p.botName) + ' · ' + this.esc(p.tf || '') + '</span></button>'; }).join('') : '<div class="tmiEmpty small">No paper position is open.</div>') + '</div></div>'; }
    /* the galaxy: one sphere per bot with at least three trades */
    const cv = document.getElementById('tmiGalaxy'); if (!cv || typeof Tm3D === 'undefined') return; const gb = bots.filter(g => g.n >= 3), maxAvg = Math.max(1e-9, ...gb.map(g => Math.abs(g.net / g.n))), maxN = Math.max(2, ...gb.map(g => g.n)), top = new Set(gb.slice().sort((a, b) => b.n - a.n).slice(0, 7).map(g => g.k));
    Tm3D.galaxy(cv, { axes: { x: 'wins more often →', y: 'earns more a trade ↑', z: 'more trades', zero: 0 }, balls: gb.map(g => ({ id: g.k, label: (names.get(g.k) || g.k).replace(/ Bot$/i, '').slice(0, 22), x: Math.max(-1, Math.min(1, (g.w / g.n - 0.5) * 2.4)), y: Math.max(-0.95, Math.min(0.95, g.net / g.n / maxAvg * 0.95)), z: -0.9 + 1.8 * Math.log(g.n) / Math.log(maxN),
        r: Math.min(24, 6 + 1.5 * Math.sqrt(g.n)), col: g.net >= 0 ? '#3DDC97' : '#FF6B7A', dark: g.net >= 0 ? '#0B3B2A' : '#4A1620', ring: armed.includes(g.k), show: top.has(g.k), g })),
      onPick: it => { this.f = { src: 'paper', period: 'all', bot: it.id, sym: '', tf: '', dir: '', reason: '', dow: '', hour: '', day: '' }; Face.view('deep', 'info'); },
      tip: (it, x, y) => this.tip(document.getElementById('tmiGTip'), it ? '<b>' + this.esc(names.get(it.id) || it.id) + '</b><span>' + it.g.n + ' trades · ' + Math.round(100 * it.g.w / it.g.n) + '% won</span><span class="' + this.cls(it.g.net) + '">net ' + this.sg(it.g.net, 0) + ' · ' + this.sg(it.g.net / it.g.n, 1) + ' a trade</span>' + (it.ring ? '<span class="am">armed for live</span>' : '') : '', x, y) });
  },

  /* ---------- Deep Dive ---------- */
  /* Live Dive is the Deep Dive locked to real trades, plus how each bot's live record compares with its paper one */
  paint_livedive(body){ this.f.src = 'live'; this.paint_deep(body, true); },
  versus(){ const names = new Map(this.trades.map(t => [t.bot, t.botName])), L = this.group(this.trades.filter(t => t.src === 'live'), t => t.bot), P = this.group(this.trades.filter(t => t.src === 'paper'), t => t.bot);
    const rows = [...L.values()].sort((a, b) => b.n - a.n).map(g => { const p = P.get(g.k), lw = 100 * g.w / g.n, pw = p && p.n ? 100 * p.w / p.n : null;
      return '<div class="tmiVs"><span>' + this.esc(names.get(g.k) || g.k) + '</span><div><i class="live" style="width:' + lw.toFixed(0) + '%"></i><em>' + Math.round(lw) + '% won live · ' + g.n + ' trades' + (g.n < 30 ? ' · too few to trust' : '') + '</em></div><div>' + (pw == null ? '<em>no paper record under this name</em>' : '<i style="width:' + pw.toFixed(0) + '%"></i><em>' + Math.round(pw) + '% won on paper · ' + p.n + ' trades</em>') + '</div></div>'; }).join('');
    return '<div class="tmiCard"><h3>Paper against live<small>share of trades won, same bot</small></h3>' + (rows || '<div class="tmiEmpty small">No live trade yet.</div>') + '<p class="tmiNote">A wide gap is worth a look: spread, slippage, timing, or simply too few live trades to tell.</p></div>'; },
  paint_deep(body, live){
    const f = this.f, list = this.rows(), s = this.stat(list), names = new Map(this.trades.map(t => [t.bot, t.botName])), sig = [this.trades.length, JSON.stringify(f), list.length].join('|');
    if (sig === this._sig && document.getElementById('tmiCurve')) return; this._sig = sig;
    const chip = (k, v, label) => '<button type="button" class="tmiChip' + (f[k] === v ? ' on' : '') + '" data-i="f:' + k + '=' + v + '">' + label + '</button>', act = k => g => 'f:' + k + '=' + g.k;
    const top = (key, kf, n) => [...this.group(this.rows(key), kf).values()].sort((a, b) => Math.abs(b.net) - Math.abs(a.net)).slice(0, n || 8);
    const fixed = (key, kf, order) => { const m = this.group(this.rows(key), kf); return order.map(k => m.get(k) || { k, n: 0, w: 0, net: 0 }).filter(g => g.n || f[key] === String(g.k)); };
    const tags = [['bot', names.get(f.bot) || f.bot], ['sym', this.sym(f.sym)], ['tf', f.tf], ['dir', f.dir === '1' ? 'Buys' : 'Sells'], ['reason', f.reason], ['dow', this.DOW[+f.dow]], ['hour', f.hour + ':00'], ['day', f.day]].filter(x => f[x[0]] !== '');
    body.innerHTML = '<div class="tmiFilters">' + (live ? '<span class="tmiReal">REAL MONEY</span>' : '<span class="tmiSegs">' + chip('src', 'paper', 'Paper') + chip('src', 'live', 'Live') + '</span>') + '<span class="tmiSegs">' + chip('period', '7', '7 days') + chip('period', '30', '30 days') + chip('period', '90', '90 days') + chip('period', 'all', 'All') + '</span>' +
      tags.map(([k, l]) => '<button type="button" class="tmiTag" data-i="f:' + k + '=' + this.esc(f[k]) + '">' + this.esc(l) + ' ✕</button>').join('') + (tags.length ? '<button type="button" class="tmiTag clear" data-i="clear:1">Clear all</button>' : '') + '</div>' +
      '<div class="tmiStrip"><div class="tmiCard tmiTilt tmiKpi"><small>NET RESULT' + (f.src === 'paper' ? ' · PLAY MONEY' : ' · REAL MONEY') + '</small><b class="' + this.cls(s.net) + '">' + this.sg(s.net, f.src === 'live' ? 2 : 0) + '</b><span>' + s.n + ' trades</span></div>' +
      '<div class="tmiCard tmiTilt tmiKpi two">' + this.ring(s.wr, this.C.cy, Math.round(s.wr) + '%', 'won') + '<div><small>PROFIT FACTOR</small><b>' + (s.pf >= 99 ? '∞' : this.num(s.pf, 2)) + '</b></div></div>' +
      '<div class="tmiCard tmiTilt tmiKpi"><small>AVERAGE TRADE</small><b class="' + this.cls(s.avgR != null ? s.avgR : s.net) + '">' + (s.avgR != null ? this.sg(s.avgR, 2, 'R') : this.sg(s.n ? s.net / s.n : 0, 2)) + '</b><span>' + (s.avgR != null ? 'a trade beyond ±5R counts as ±5R' : 'money a trade') + '</span></div>' +
      '<div class="tmiCard tmiTilt tmiKpi"><small>DEEPEST DROP</small><b class="dn">' + this.sg(-s.dd, f.src === 'live' ? 2 : 0) + '</b><span>from a high to the low after it</span></div></div>' +
      '<div class="tmiCols"><div class="tmiCol2"><div class="tmiCard"><h3>Running result<small>red = time spent under an earlier high</small></h3><canvas id="tmiCurve" class="tmiCv"></canvas></div></div><div class="tmiCol1"><div class="tmiCard"><h3>How big the wins and losses were<small>' + (f.src === 'live' ? 'in money' : 'in R') + '</small></h3><canvas id="tmiHist" class="tmiCv"></canvas></div></div></div>' +
      '<div class="tmiGrid3">' + this.bars('By bot', top('bot', t => t.bot, 9), { sel: f.bot, label: g => names.get(g.k) || g.k, act: act('bot') }) + this.bars('By instrument', top('sym', t => t.sym, 9), { sel: f.sym, label: g => this.sym(g.k), act: act('sym') }) +
        '<div class="tmiStack">' + this.bars('By timeframe', top('tf', t => t.tf, 6), { sel: f.tf, act: act('tf') }) + this.bars('By side', fixed('dir', t => t.dir, [1, -1]), { sel: f.dir, label: g => g.k > 0 ? 'Buys' : 'Sells', act: act('dir') }) + (live ? this.versus() : '') + '</div>' +
        this.bars('By weekday', fixed('dow', t => new Date(t.t0).getDay(), [1, 2, 3, 4, 5, 6, 0]), { sel: f.dow, label: g => this.DOW[g.k], act: act('dow') }) + this.bars('By hour of entry', fixed('hour', t => new Date(t.t0).getHours(), [...Array(24).keys()]), { sel: f.hour, dense: true, label: g => String(g.k).padStart(2, '0') + ':00', act: act('hour') }) + this.bars('By how it ended', top('reason', t => this.reasonOf(t), 7), { sel: f.reason, act: act('reason') }) + '</div>' +
      '<div class="tmiCols"><div class="tmiCol2"><div class="tmiCard tmiScene"><h3>When it pays: weekday by hour<small>bars up = gains, down = losses · drag to turn · click a bar to filter</small></h3><canvas id="tmiCity"></canvas><div class="tmiTip" id="tmiCTip"></div></div></div>' +
      '<div class="tmiCol1"><div class="tmiCard"><h3>The trades<small>newest first · click one for its autopsy</small></h3><div class="tmiTrades">' + (list.length ? list.slice(0, 60).map(t => '<button type="button" class="tmiTr" data-i="trade:' + this.esc(t.id) + '"><b>' + this.esc(this.sym(t.sym)) + '</b><i class="' + (t.dir > 0 ? 'up' : 'dn') + '">' + (t.dir > 0 ? '▲' : '▼') + '</i><span>' + this.esc(names.get(t.bot) || t.bot) + '</span><em class="' + this.cls(t.pnl) + '">' + this.sg(t.pnl, f.src === 'live' ? 2 : 0) + '</em><small>' + new Date(t.t1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</small></button>').join('') : '<div class="tmiEmpty small">No trade matches these filters.</div>') + '</div></div></div></div>';
    this.curve(document.getElementById('tmiCurve'), this.thin(s.curve, 400), 230); this.hist(document.getElementById('tmiHist'), list, 230);
    const cv = document.getElementById('tmiCity'); if (!cv || typeof Tm3D === 'undefined') return; const order = [1, 2, 3, 4, 5, 6, 0], v = order.map(() => new Array(24).fill(0)), n = order.map(() => new Array(24).fill(0));
    for (const t of this.rows(['dow', 'hour'])){ const d = new Date(t.t0), r = order.indexOf(d.getDay()); v[r][d.getHours()] += t.pnl; n[r][d.getHours()]++; }
    Tm3D.city(cv, { rows: order.map(k => this.DOW[k]), cols: [...Array(24).keys()].map(h => String(h).padStart(2, '0')), colStep: 3, v, n, onPick: it => { this.f.dow = String(order[it.r]); this.f.hour = String(it.k); this._sig = ''; this.paint(); },
      tip: (it, x, y) => this.tip(document.getElementById('tmiCTip'), it ? '<b>' + it.row + ' ' + it.col + ':00</b><span>' + it.n + ' trades</span><span class="' + this.cls(it.val) + '">net ' + this.sg(it.val, 0) + '</span>' : '', x, y) });
  },

  /* ---------- Live (shows only) ---------- */
  paint_live(body){
    const live = this.trades.filter(t => t.src === 'live'), s = this.stat(live), A = this.acct, pos = this.pos || [], cur = A && A.currency ? ' ' + A.currency : '', today = this.dayKey(Date.now()), td = live.filter(t => this.dayKey(t.t1) === today).sort((a, b) => a.t1 - b.t1), dayNet = td.reduce((a, t) => a + t.pnl, 0), float = pos.reduce((a, p) => a + (p.profit || 0), 0);
    let st = { label: '', text: '', cls: '' }, caps = null, armed = []; try { st = Live.status(); caps = (Live.state && Live.state.caps) || Live.DEFAULT_CAPS; armed = Live.armedList().map(id => ({ id, mode: (Live.armedEntry(id) || {}).mode })); } catch(e){}
    const names = new Map(this.trades.map(t => [t.bot, t.botName])), lim = A && caps && caps.maxDailyLossPct ? A.balance * caps.maxDailyLossPct / 100 : 0, used = lim ? Math.max(0, Math.min(100, -(dayNet + float) / lim * 100)) : 0, sig = [live.length, pos.length, A ? A.equity : 0, float.toFixed(2), st.label, armed.map(a => a.id + a.mode).join(','), typeof Wizard !== 'undefined' ? Wizard.shelfSig() : ''].join('|');
    if (sig === this._sig && document.getElementById('tmiToday')) return; this._sig = sig;
    const bots = [...this.group(live, t => t.bot).values()].sort((a, b) => b.net - a.net), linked = typeof Feed !== 'undefined' && !!Feed.bridge;
    body.innerHTML = '<div class="tmiStrip"><div class="tmiCard tmiTilt tmiKpi two wide">' + this.ring(A && A.balance ? Math.min(100, A.equity / A.balance * 100) : 0, this.C.cy, A ? this.num(A.equity, 0) : '–', 'equity') + '<div><small>BALANCE</small><b>' + (A ? this.num(A.balance, 2) + cur : '–') + '</b><small>FREE TO USE</small><b>' + (A ? this.num(A.margin_free, 2) : '–') + '</b></div></div>' +
      '<div class="tmiCard tmiTilt tmiKpi"><small>TODAY</small><b class="' + this.cls(dayNet + float) + '">' + this.sg(dayNet + float, 2) + '</b><span>closed ' + this.sg(dayNet, 2) + ' · open ' + this.sg(float, 2) + '</span></div>' +
      '<div class="tmiCard tmiTilt tmiKpi"><small>DAILY LOSS LIMIT</small><b class="' + (used >= 80 ? 'dn' : used >= 50 ? 'am' : '') + '">' + (lim ? Math.round(used) + '% used' : 'not set') + '</b><div class="tmiGauge"><i style="width:' + used.toFixed(0) + '%" class="' + (used >= 80 ? 'dn' : used >= 50 ? 'am' : 'up') + '"></i></div><span>' + (lim ? 'stops at −' + this.num(lim, 2) + ' (' + caps.maxDailyLossPct + '% of balance)' : 'set on the Classic live desk') + '</span></div>' +
      '<div class="tmiCard tmiTilt tmiKpi"><small>THE LINK</small><b class="' + (linked ? 'up' : 'dn') + '">' + (linked ? 'MT5 connected' : 'MT5 not reachable') + '</b><span>' + this.esc(st.label || '') + (st.text ? ' · ' + this.esc(String(st.text).slice(0, 70)) : '') + '</span></div></div>' +
      '<div class="tmiCard"><h3>Open positions<small>' + pos.length + ' open · the dot is the price between stop and target · click to open the chart</small></h3><div class="tmiTiles">' + (pos.length ? pos.map(p => { const dir = p.type === 'buy' ? 1 : -1, lo = Math.min(p.sl, p.tp), hi = Math.max(p.sl, p.tp), held = Math.max(0, Date.now() / 1000 - (p.time - (typeof Autopsy !== 'undefined' ? Autopsy.off(p.time) : typeof PosLines !== 'undefined' ? PosLines.serverShift() || 0 : 0)));
          return '<button type="button" class="tmiPos tmiTilt live" data-i="chart:' + this.esc(p.symbol) + '"><div><b>' + this.esc(this.sym(p.symbol)) + '</b><i class="' + (dir > 0 ? 'up' : 'dn') + '">' + (dir > 0 ? '▲ buy' : '▼ sell') + ' ' + p.volume + '</i><em class="' + this.cls(p.profit) + '">' + this.sg(p.profit, 2) + '</em></div>' + (p.sl > 0 && p.tp > 0 ? this.track(lo, hi, p.price_current, p.price_open, dir) : '<div class="tmiWarn">' + (p.sl > 0 ? 'no target set' : 'no stop set') + '</div>') +
            '<span>in at ' + p.price_open + ' · now ' + p.price_current + ' · ' + (held > 86400 ? Math.floor(held / 86400) + ' d' : held > 3600 ? Math.floor(held / 3600) + ' h' : Math.floor(held / 60) + ' min') + ' · ' + this.esc(String(p.comment || '').replace(/^ASTRA\s*/, '') || 'by hand') + '</span></button>'; }).join('') : '<div class="tmiEmpty small">' + (this.pos ? 'No live position is open.' : 'Waiting for MetaTrader…') + '</div>') + '</div></div>' +
      (typeof Wizard !== 'undefined' ? Wizard.shelfHtml(this.trades) : '') +
      '<div class="tmiCols"><div class="tmiCol2"><div class="tmiCard"><h3>Today, trade by trade<small>bars = each closed trade · line = the day so far</small></h3><canvas id="tmiToday" class="tmiCv"></canvas></div>' +
        '<div class="tmiCard"><h3>Running result, 365 days<small>real money' + cur + '</small></h3><canvas id="tmiLCurve" class="tmiCv"></canvas></div></div>' +
      '<div class="tmiCol1"><div class="tmiCard"><h3>Armed bots<small>changed only on the Classic live desk</small></h3><div class="tmiArmed">' + (armed.length ? armed.map(a => '<span class="' + (a.mode === 'live' ? 'live' : '') + '">' + this.esc(names.get(a.id) || a.id) + '<em>' + (a.mode === 'live' ? 'LIVE' : 'shadow') + '</em>' + (typeof Wizard !== 'undefined' && Wizard.originOf(a.id, names.get(a.id)) ? '<small title="This bot is in a playbook you saved in the Deep Dive wizard">from “' + this.esc(Wizard.originOf(a.id, names.get(a.id))) + '”</small>' : '') + '</span>').join('') : '<div class="tmiEmpty small">No bot is armed.</div>') + '</div></div>' +
        this.bars('Live bots', bots, { note: s.n + ' trades · ' + Math.round(s.wr) + '% won · net ' + this.sg(s.net, 2), label: g => names.get(g.k) || g.k, act: g => 'drill:' + JSON.stringify({ src: 'live', bot: g.k }) }) +
        '<div class="tmiCard"><h3>Day by day<small>click a day</small></h3>' + this.cal(live, 'live') + '</div></div></div>';
    this.curve(document.getElementById('tmiLCurve'), this.thin(s.curve, 400), 210);
    const cv = document.getElementById('tmiToday'), { c, w, h } = this.fit(cv, 190), C = this.C; c.clearRect(0, 0, w, h);
    if (!td.length){ c.fillStyle = C.dim; c.font = '12px Inter, sans-serif'; c.fillText('No live trade has closed today.', 12, 24); return; }
    let run = 0; const cum = td.map(t => (run += t.pnl)), lo = Math.min(0, ...cum, ...td.map(t => t.pnl)), hi = Math.max(0, ...cum, ...td.map(t => t.pnl)), sp = hi - lo || 1, d0 = new Date(); d0.setHours(0, 0, 0, 0); const X = t => 8 + (t - d0.getTime()) / 86400000 * (w - 70), Y = v => 10 + (hi - v) / sp * (h - 34);
    c.font = '10px JetBrains Mono, monospace'; c.textBaseline = 'middle'; for (const v of [hi, 0, lo]){ const y = Math.round(Y(v)) + 0.5; c.strokeStyle = v ? C.grid : '#2A3B5C'; c.beginPath(); c.moveTo(0, y); c.lineTo(w - 58, y); c.stroke(); c.fillStyle = C.dim; c.fillText(this.sg(v, 2), w - 54, y); }
    td.forEach(t => { c.fillStyle = t.pnl >= 0 ? C.up : C.dn; c.globalAlpha = 0.8; const y0 = Y(0), y1 = Y(t.pnl); c.beginPath(); c.roundRect(X(t.t1) - 4, Math.min(y0, y1), 8, Math.max(2, Math.abs(y1 - y0)), 2); c.fill(); }); c.globalAlpha = 1;
    c.beginPath(); c.moveTo(X(td[0].t1), Y(0)); td.forEach((t, i) => c.lineTo(X(t.t1), Y(cum[i]))); c.strokeStyle = C.cy; c.lineWidth = 2; c.lineJoin = 'round'; c.stroke();
    c.fillStyle = C.dim; c.font = '10px Inter, sans-serif'; c.textBaseline = 'alphabetic'; c.textAlign = 'center'; for (const hh of [0, 6, 12, 18, 24]) c.fillText(String(hh).padStart(2, '0') + ':00', 8 + hh / 24 * (w - 70), h - 5); c.textAlign = 'left';
  },
};
