/* ASTRA / Timurila — Autopsy: what was true when each past trade was opened, and how it went.

   For every closed trade, paper or live, it rebuilds the picture at the moment of entry from
   candles that had already closed:
     · the stream  — four plain readings of the DAILY trend (js/proind.js `stream`);
     · agreement   — how many of nine trend readings on the trade's own timeframe pointed its way;
     · shock       — whether one of the last two days, or the day in progress, was at least 2.5
                     times its usual size (wars, surprise decisions and crashes show up here
                     whatever the headline was);
     · the path    — how far it went for and against the trade before it closed.
   Then it adds the same facts up across all analysed trades ("What mattered").

   It describes; it does not prove a cause. A handful of trades proves nothing, so every bar shows
   its sample size, and the large test (timurila/research/signals.cjs) is quoted beside it.
   Read only: it reads ledgers, the bridge's GET endpoints and candles. It never trades. */
const Autopsy = {
  TF: { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 },
  C: { up: '#3DDC97', dn: '#FF6B7A', cy: '#4FD8F7', am: '#FFB648', grid: '#16223A', text: '#E6EEFF', dim: '#7C8BA8', wick: '#5C6F92' },
  trades: [], facts: {}, sel: null, live: null, filter: { src: 'all', bot: '', out: 'all' }, cc: {}, busy: false, done: 0, todo: 0,
  num(v, d = 2){ return v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  sg(v, d = 2, u = ''){ if (v == null || !isFinite(v)) return '–'; const z = Math.abs(v) < 0.5 * Math.pow(10, -d); return (z ? '' : v > 0 ? '+' : '−') + this.num(Math.abs(v), d) + u; },
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  load(){ try { this.facts = JSON.parse(localStorage.getItem('astra_autopsy_v1') || '{}') || {}; } catch(e){ this.facts = {}; } },
  save(){ try { const k = Object.keys(this.facts); if (k.length > 2500) for (const x of k.slice(0, k.length - 2500)) delete this.facts[x]; localStorage.setItem('astra_autopsy_v1', JSON.stringify(this.facts)); } catch(e){} },

  /* ---------- the trades: every paper ledger, and live trades read from MetaTrader's history ---------- */
  async collect(){
    const out = [];
    try { if (typeof BOTS !== 'undefined' && typeof Bots !== 'undefined') for (const b of BOTS){ if (Bots.isPage(b)) continue; const L = Bots.ledgers[b.id];
      for (const t of (L && L.closed) || []){ if (!t.entryTime || !t.exitTime || !(t.entry > 0)) continue;
        out.push({ id: 'p:' + b.id + ':' + t.id, src: 'paper', bot: b.id, botName: typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name, sym: t.sym, tf: t.tf, dir: t.dir > 0 ? 1 : -1, entry: t.entry, exit: t.exit,
          t0: t.entryTime, t1: t.exitTime, sl: t.slInit || t.sl || null, tp: t.tp || null, pnl: t.pnl, r: isFinite(t.r) ? t.r : null, reason: t.reason || '', why: (t.reasons || []).slice(0, 4), score: t.score }); } } } catch(e){ console.warn('autopsy paper', e); }
    try { if (!this.live && typeof Feed !== 'undefined' && Feed.bridge){ const d = await fetch(Feed.BRIDGE_URL + '/deals?days=365&entries=1', { cache: 'no-store', signal: AbortSignal.timeout(15000) }).then(r => r.json()), ent = {}, by = {};
        for (const e of d.entries || []) ent[e.position] = e;
        for (const x of d.deals || []){ const e = ent[x.position] || {}, id = String(e.comment || '').replace(/^ASTRA\s*/, '').trim() || 'untagged', c = String(x.comment || '');
          const t = by[x.position] = by[x.position] || { id: 'l:' + x.position, src: 'live', bot: id, botName: id, sym: x.symbol, tf: (id.match(/(\d+)(m|h)$/) || [])[0] || '15m', dir: (e.type || (x.type === 'sell' ? 'buy' : 'sell')) === 'buy' ? 1 : -1,
            entry: e.price || null, exit: null, raw0: e.time || x.time, raw1: 0, sl: null, tp: null, pnl: (e.commission || 0) + (e.swap || 0) + (e.fee || 0), r: null, reason: 'closed', why: [] };
          t.pnl += (x.profit || 0) + (x.commission || 0) + (x.swap || 0) + (x.fee || 0);
          if (x.time >= t.raw1){ t.raw1 = x.time; t.exit = x.price; const m = c.match(/^\[(sl|tp)\s*([\d.]+)/i); if (m){ t.reason = m[1].toLowerCase() === 'sl' ? 'stop-loss' : 'target reached'; if (m[1].toLowerCase() === 'sl') t.sl = +m[2]; else t.tp = +m[2]; } } }
        this.live = Object.values(by).filter(t => t.entry > 0 && t.exit > 0); } } catch(e){ console.warn('autopsy live', e); }
    for (const t of this.live || []){ const sh = this.shift(t.sym); out.push(Object.assign({}, t, { t0: (t.raw0 - sh) * 1000, t1: (t.raw1 - sh) * 1000 })); }
    this.trades = out.sort((a, b) => b.t1 - a.t1); return out;
  },
  kind(sym){ try { return Feed.route(sym).kind; } catch(e){ return 'none'; } },
  shift(sym){ return this.kind(sym) === 'bridge' && typeof PosLines !== 'undefined' ? (PosLines.serverShift() || 0) : 0; },
  raw(t, ms){ return Math.floor(ms / 1000) + this.shift(t.sym); },

  /* ---------- candles, one request at a time ---------- */
  q: Promise.resolve(),
  one(fn){ const p = this.q.then(fn, fn); this.q = p.catch(() => {}); return p; },
  async candles(sym, tf, from, to){
    const kind = this.kind(sym), S = this.TF[tf]; if (!S) return null;
    if (kind === 'bridge'){ const key = sym + '|' + tf, hit = this.cc[key]; if (hit && hit.from <= from) return hit.bars;
      const now = Math.floor(Date.now() / 1000) + this.shift(sym) + 86400, need = Math.ceil((now - from) / S) + 10; if (need > 60000) return null;
      const bars = await this.one(() => API.klines(sym, tf, need, { from })); this.cc[key] = { from, bars }; return bars; }
    if (kind === 'binance'){ const key = sym + '|' + tf + '|' + Math.floor(to / (200 * S)), hit = this.cc[key]; if (hit) return hit.bars;
      const bars = await this.one(() => API.binanceKlines(Feed.route(sym).addr, tf, 1000, (to + S) * 1000)); this.cc[key] = { bars }; return bars; }
    return null;
  },
  async daily(sym){ const key = sym + '|D', hit = this.cc[key]; if (hit) return hit.bars; const kind = this.kind(sym); let bars = null;
    if (kind === 'bridge') bars = await this.one(() => API.klines(sym, '1d', 900)); else if (kind === 'binance') bars = await this.one(() => API.binanceKlines(Feed.route(sym).addr, '1d', 1000));
    this.cc[key] = { bars }; return bars; },

  /* ---------- one trade ---------- */
  async analyse(t, keep){
    const S = this.TF[t.tf]; if (!S || typeof ProInd === 'undefined') return (this.facts[t.id] = { err: 'timeframe' });
    const r0 = this.raw(t, t.t0), r1 = this.raw(t, t.t1); let bars = null, day = null;
    try { bars = await this.candles(t.sym, t.tf, r0 - 260 * S, r1 + 40 * S); day = await this.daily(t.sym); } catch(e){ return (this.facts[t.id] = { err: 'no candles' }); }
    if (!bars || bars.length < 80) return (this.facts[t.id] = { err: 'no candles' });
    const P = ProInd.prep(bars.map(b => ({ time: b.rawTime != null ? b.rawTime : b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })));
    const iE = ProInd.indexAt(P, r0), iX = Math.max(iE, ProInd.indexAt(P, r1)), k = iE - 1; if (k < 40) return (this.facts[t.id] = { err: 'no candles' });
    const A = ProInd.atr(P, 14)[k] || Math.abs(t.entry) * 0.002, ag = ProInd.agreement(P, k, t.dir);
    /* 1R in price: from the trade's own recorded R when it has one (a stop moved to breakeven says nothing about the first risk),
       else the stop distance, else one ATR */
    let risk = A; const rp = t.r != null && Math.abs(t.r) >= 0.05 ? t.dir * (t.exit - t.entry) / t.r : 0, sd = t.sl ? Math.abs(t.entry - t.sl) : 0;
    if (rp >= 0.1 * A && rp <= 20 * A) risk = rp; else if (sd >= 0.2 * A && sd <= 20 * A) risk = sd;
    let mfe = 0, mae = 0, iBest = iE, iWorst = iE; const path = [];
    for (let i = iE; i <= iX; i++){ const f = t.dir > 0 ? P.h[i] - t.entry : t.entry - P.l[i], a = t.dir > 0 ? t.entry - P.l[i] : P.h[i] - t.entry; if (f > mfe){ mfe = f; iBest = i; } if (a > mae){ mae = a; iWorst = i; } path.push(t.dir * (P.c[i] - t.entry) / risk); }
    const F = { a: [ag.yes, ag.no, ag.of], mfe: mfe / risk, mae: mae / risk, r: t.r != null ? t.r : t.dir * (t.exit - t.entry) / risk, chop: ProInd.choppiness(P, 14)[k], held: iX - iE + 1 };
    let st = null, sh = null, D = null, di = -1;
    if (day && day.length > 60){ D = ProInd.prep(day.map(b => ({ time: b.rawTime != null ? b.rawTime : b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }))); di = ProInd.indexAt(D, r0) - 1;
      if (di >= 60){ st = ProInd.stream(D, di); sh = ProInd.shock(D, di, 2); const aD = ProInd.atr(D, 20)[di], today = aD > 0 && S < 86400 ? ProInd.dayRangeSoFar(P, k) / aD : 0;
        F.s = st && st.of >= 2 ? (st.dir === 0 ? 'flat' : st.dir === t.dir ? 'with' : 'against') : null; F.sc = st ? st.score : null; F.z = Math.max(sh.z, today); F.sh = F.z >= 2.5 ? 1 : 0; F.shDir = sh.z >= today ? sh.dir : 0; } }
    this.facts[t.id] = F;
    if (keep) this.view = { t, P, iE, iX, k, risk, A, ag, st, path, iBest, iWorst, F };
    return F;
  },
  /* the facts of the latest `n` trades that are still missing */
  async audit(n){
    if (this.busy) return; this.busy = true; const list = this.rows().filter(t => !this.facts[t.id]).slice(0, n); this.todo = list.length; this.done = 0; this.paint();
    for (const t of list){ if (!this.host || !this.host.isConnected) break; try { await this.analyse(t); } catch(e){ this.facts[t.id] = { err: 'failed' }; } this.done++; if (this.done % 5 === 0 || this.done === this.todo){ this.save(); this.paint(); } }
    this.busy = false; this.save(); this.paint();
  },

  /* ---------- words ---------- */
  why(t, F){
    if (!F || F.err) return 'No candles could be read for this trade, so its context is unknown.';
    const side = t.dir > 0 ? 'buy' : 'sell', won = t.pnl > 0, bits = [];
    if (!won && F.mfe >= 1) bits.push('It was ahead by ' + this.num(F.mfe, 1) + 'R, then came all the way back. The exit let it go, not the entry.');
    if (F.s === 'against') bits.push('A ' + side + ' against the daily trend.'); else if (F.s === 'with') bits.push('A ' + side + ' with the daily trend.');
    if (F.sh) bits.push('The market had just made an unusually large move (' + this.num(F.z, 1) + '× a normal day).');
    const share = F.a[0] / F.a[2]; if (share >= 0.75) bits.push(F.a[0] + ' of ' + F.a[2] + ' trend readings pointed this way.'); else if (share < 0.34) bits.push('Only ' + F.a[0] + ' of ' + F.a[2] + ' trend readings pointed this way.');
    if (won && F.mfe > 0 && F.r / F.mfe < 0.5 && F.mfe >= 1.5) bits.push('It kept less than half of its best point (+' + this.num(F.mfe, 1) + 'R).');
    if (!won && F.mfe < 0.3) bits.push('Price never went its way.');
    return bits.length ? bits.slice(0, 3).join(' ') : 'Nothing unusual at entry: an ordinary ' + (won ? 'win' : 'loss') + '.';
  },

  /* ---------- screen ---------- */
  rows(){ const f = this.filter; return this.trades.filter(t => (f.src === 'all' || t.src === f.src) && (!f.bot || t.bot === f.bot) && (f.out === 'all' || (f.out === 'win') === (t.pnl > 0))); },
  async open(host){
    this.host = host; this.load();
    host.innerHTML = '<div class="auWrap"><div class="auHead"><div><h1>Autopsy</h1><p>What was true when each trade was opened, and how it went. It describes; it does not prove the cause.</p></div><div class="auFilters" id="auFilters"></div></div>' +
      '<canvas id="auStrip" class="auStrip" height="74"></canvas><div class="auGrid"><div class="auList" id="auList"></div><div class="auMain" id="auMain"><div class="auEmpty">Reading your trades…</div></div><div class="auSide" id="auSide"></div></div><div class="auAudit" id="auAudit"></div></div>';
    host.onclick = e => this.click(e); host.onchange = e => { if (e.target.id === 'auBot'){ this.filter.bot = e.target.value; this.paint(); } };
    await this.collect(); this.paint();
    const first = this.rows()[0]; if (first) this.select(first.id);
  },
  click(e){
    const b = e.target.closest('[data-ap]'); if (!b) { if (e.target.id === 'auStrip') this.stripPick(e); return; } const [k, v] = b.dataset.ap.split(':');
    if (k === 'src' || k === 'out'){ this.filter[k] = v; this.paint(); } else if (k === 'row') this.select(b.dataset.id); else if (k === 'audit') this.audit(+v);
    else if (k === 'chart' && this.sel){ const t = this.trades.find(x => x.id === this.sel); if (t && typeof Face !== 'undefined'){ Face.go('chart'); try { (typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(t.sym) : App.setSymbol(t.sym)); if (App.setTf && this.TF[t.tf]) setTimeout(() => App.setTf(t.tf), 350); } catch(x){} } }
    else if (k === 'tf' && this.sel){ const t = this.trades.find(x => x.id === this.sel); if (t){ t.tf = v; delete this.facts[t.id]; this.select(t.id); } }
  },
  async select(id){ this.sel = id; const t = this.trades.find(x => x.id === id); if (!t) return; this.view = null; this.paintList();
    const m = document.getElementById('auMain'); if (m) m.innerHTML = '<div class="auEmpty">Rebuilding the moment of entry…</div>';
    try { await this.analyse(t, true); } catch(e){ this.facts[t.id] = { err: 'failed' }; } this.save(); if (this.sel === id) this.paint(); },

  paint(){ if (!this.host || !this.host.isConnected) return; this.paintFilters(); this.paintList(); this.paintTrade(); this.paintAudit(); this.strip(); },
  paintFilters(){ const el = document.getElementById('auFilters'); if (!el) return; const f = this.filter, chip = (k, v, label) => '<button class="auChip' + (f[k] === v ? ' on' : '') + '" data-ap="' + k + ':' + v + '">' + label + '</button>';
    const bots = [...new Map(this.trades.map(t => [t.bot, t.botName])).entries()].sort((a, b) => String(a[1]).localeCompare(b[1]));
    el.innerHTML = '<span class="auSeg">' + chip('src', 'all', 'All') + chip('src', 'paper', 'Paper') + chip('src', 'live', 'Live') + '</span><span class="auSeg">' + chip('out', 'all', 'Wins and losses') + chip('out', 'win', 'Wins') + chip('out', 'loss', 'Losses') + '</span>' +
      '<select id="auBot"><option value="">Every bot</option>' + bots.map(([id, nm]) => '<option value="' + this.esc(id) + '"' + (f.bot === id ? ' selected' : '') + '>' + this.esc(nm) + '</option>').join('') + '</select>'; },
  paintList(){ const el = document.getElementById('auList'); if (!el) return; const rows = this.rows().slice(0, 300), max = Math.min(4, Math.max(2, ...rows.map(t => Math.abs(t.r != null ? t.r : 0))));
    el.innerHTML = rows.length ? rows.map(t => { const F = this.facts[t.id], r = t.r != null ? t.r : (F && !F.err ? F.r : null), w = r == null ? 0 : Math.min(100, Math.abs(r) / max * 100), d = new Date(t.t1);
      return '<button class="auRow' + (t.id === this.sel ? ' on' : '') + '" data-ap="row" data-id="' + this.esc(t.id) + '"><span class="auSym">' + this.esc(String(t.sym).replace(/\.(s|m|std)$/i, '')) + '<i class="' + (t.dir > 0 ? 'up' : 'dn') + '">' + (t.dir > 0 ? '▲' : '▼') + '</i>' + (t.src === 'live' ? '<em>LIVE</em>' : '') + '</span>' +
        '<span class="auBar"><i class="' + (t.pnl > 0 ? 'up' : 'dn') + '" style="width:' + w.toFixed(0) + '%"></i></span><span class="auR ' + (t.pnl > 0 ? 'up' : 'dn') + '">' + (r != null ? this.sg(r, 1, 'R') : this.sg(t.pnl, 0)) + '</span><span class="auWhen">' + d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</span></button>'; }).join('') : '<div class="auEmpty">No closed trades match.</div>'; },

  paintTrade(){
    const m = document.getElementById('auMain'), s = document.getElementById('auSide'); if (!m || !s) return; const t = this.trades.find(x => x.id === this.sel), V = this.view, F = t && this.facts[t.id];
    if (!t){ m.innerHTML = '<div class="auEmpty">No trade selected.</div>'; s.innerHTML = ''; return; }
    const d0 = new Date(t.t0), d1 = new Date(t.t1), ds = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toTimeString().slice(0, 5), r = t.r != null ? t.r : (F && !F.err ? F.r : null);
    m.innerHTML = '<div class="auTitle"><div><b>' + this.esc(String(t.sym).replace(/\.(s|m|std)$/i, '')) + '</b><span class="auTag ' + (t.dir > 0 ? 'up' : 'dn') + '">' + (t.dir > 0 ? 'BUY' : 'SELL') + '</span><span class="auTag">' + this.esc(t.botName) + '</span>' + (t.src === 'live' ? '<span class="auTag live">LIVE</span>' : '<span class="auTag">paper</span>') +
      '<span class="auSeg small">' + Object.keys(this.TF).map(x => '<button class="auChip' + (x === t.tf ? ' on' : '') + '" data-ap="tf:' + x + '">' + x + '</button>').join('') + '</span></div>' +
      '<div class="auRes ' + (t.pnl > 0 ? 'up' : 'dn') + '"><b>' + (r != null ? this.sg(r, 2, 'R') : '') + '</b><span>' + this.sg(t.pnl, 2) + '</span></div></div>' +
      '<div class="auMeta">' + ds(d0) + ' → ' + ds(d1) + (F && F.held ? ' · ' + F.held + ' candles' : '') + (t.reason ? ' · ' + this.esc(t.reason) : '') + '<button class="auLink" data-ap="chart:1">Open this chart</button></div>' +
      (V ? '<canvas id="auChart" class="auChart"></canvas><div class="auPathHead"><span>The trade, candle by candle, in R</span><span>best ' + this.sg(F.mfe, 1, 'R') + ' · worst ' + this.sg(-F.mae, 1, 'R') + '</span></div><canvas id="auPath" class="auPath"></canvas>' : '<div class="auEmpty">' + this.why(t, F) + '</div>');
    if (!V || !F || F.err){ s.innerHTML = ''; return; }
    const sName = F.s === 'with' ? 'With the stream' : F.s === 'against' ? 'Against the stream' : F.s === 'flat' ? 'No clear stream' : 'Stream unknown', share = F.a[0] / F.a[2];
    s.innerHTML = '<div class="auWhy ' + (t.pnl > 0 ? 'up' : 'dn') + '"><small>' + (t.pnl > 0 ? 'WHY IT MAY HAVE WON' : 'WHY IT MAY HAVE LOST') + '</small><p>' + this.esc(this.why(t, F)) + '</p></div>' +
      '<div class="auDial"><canvas id="auCompass" width="220" height="130"></canvas><div><small>DAILY TREND</small><b class="' + (F.s === 'with' ? 'up' : F.s === 'against' ? 'dn' : '') + '">' + sName + '</b>' + (V.st ? V.st.parts.map(p => '<span class="auTick ' + (p.dir > 0 ? 'up' : p.dir < 0 ? 'dn' : '') + '">' + (p.dir > 0 ? '▲' : p.dir < 0 ? '▼' : '•') + ' ' + this.esc(p.label) + '</span>').join('') : '') + '</div></div>' +
      '<div class="auDial"><canvas id="auRing" width="130" height="130"></canvas><div><small>TREND READINGS ON ' + this.esc(t.tf.toUpperCase()) + '</small><b class="' + (share >= 0.75 ? 'up' : share < 0.34 ? 'dn' : '') + '">' + F.a[0] + ' of ' + F.a[2] + ' agreed</b>' + V.ag.list.map(x => '<span class="auTick ' + (x.dir === t.dir ? 'up' : x.dir === -t.dir ? 'dn' : '') + '">' + (x.dir > 0 ? '▲' : x.dir < 0 ? '▼' : '•') + ' ' + this.esc(x.name) + '</span>').join('') + '</div></div>' +
      '<div class="auMeter"><small>SHOCK</small><b class="' + (F.sh ? 'am' : '') + '">' + (F.z != null ? (F.sh ? 'Yes: ' : 'No: ') + this.num(F.z, 1) + '× a normal day' : 'unknown') + '</b><div class="auTrack"><i style="width:' + Math.min(100, (F.z || 0) / 4 * 100).toFixed(0) + '%" class="' + (F.sh ? 'am' : '') + '"></i><u style="left:62.5%"></u></div></div>' +
      '<div class="auMeter"><small>MARKET TEXTURE</small><b>' + (F.chop == null || F.chop !== F.chop ? 'unknown' : F.chop >= 61.8 ? 'Choppy' : F.chop <= 38.2 ? 'Trending' : 'Mixed') + '</b><div class="auTrack"><i style="width:' + Math.max(0, Math.min(100, F.chop || 0)).toFixed(0) + '%"></i><u style="left:38.2%"></u><u style="left:61.8%"></u></div></div>' +
      (t.why && t.why.length ? '<div class="auBotSaid"><small>WHAT THE BOT SAID</small>' + t.why.map(x => '<span>' + this.esc(x) + '</span>').join('') + '</div>' : '');
    this.drawChart(); this.drawPath(); this.drawCompass(); this.drawRing();
  },

  /* ---------- what mattered ---------- */
  paintAudit(){
    const el = document.getElementById('auAudit'); if (!el) return; const rows = this.rows(), ok = rows.filter(t => this.facts[t.id] && !this.facts[t.id].err), miss = rows.filter(t => !this.facts[t.id]).length;
    const grp = (name, key, order, labels) => { const g = {}; for (const t of ok){ const k = key(t, this.facts[t.id]); if (k == null) continue; const x = g[k] || (g[k] = { n: 0, w: 0, r: 0 }); x.n++; if (t.pnl > 0) x.w++; x.r += Math.max(-5, Math.min(5, this.facts[t.id].r || 0)); }
      return '<div class="auCard"><h3>' + name + '</h3>' + order.map(k => { const x = g[k]; if (!x) return '<div class="auStat off"><span>' + labels[k] + '</span><em>no trades</em></div>'; const wr = 100 * x.w / x.n, ar = x.r / x.n;
        return '<div class="auStat"><span>' + labels[k] + '</span><div class="auTrack big"><i class="' + (wr >= 50 ? 'up' : 'dn') + '" style="width:' + wr.toFixed(0) + '%"></i><u style="left:50%"></u></div><b>' + wr.toFixed(0) + '% won</b><em class="' + (ar > 0 ? 'up' : 'dn') + '">' + this.sg(ar, 2, 'R') + '</em><small>' + x.n + (x.n < 30 ? ' · too few to trust' : '') + '</small></div>'; }).join('') + '<p class="auCourt">' + this.court(name) + '</p></div>'; };
    el.innerHTML = '<div class="auAuditHead"><div><h2>What mattered</h2><p>' + ok.length + ' of ' + rows.length + ' trades analysed' + (this.busy ? ' · working ' + this.done + ' / ' + this.todo : '') + ' · average R counts a trade beyond ±5R as ±5R</p></div>' +
      (miss ? '<div><button class="auBtn" data-ap="audit:60"' + (this.busy ? ' disabled' : '') + '>Analyse the next ' + Math.min(60, miss) + '</button>' + (miss > 60 ? '<button class="auBtn ghost" data-ap="audit:400"' + (this.busy ? ' disabled' : '') + '>Analyse ' + Math.min(400, miss) + '</button>' : '') + '</div>' : '') + '</div>' +
      (ok.length ? '<div class="auCards">' +
        grp('The stream', (t, F) => F.s, ['with', 'flat', 'against'], { with: 'With the daily trend', flat: 'No clear trend', against: 'Against the daily trend' }) +
        grp('Agreement', (t, F) => { const s = F.a[0] / F.a[2]; return s >= 0.75 ? 'most' : s >= 0.5 ? 'half' : 'few'; }, ['most', 'half', 'few'], { most: 'Most readings agreed', half: 'About half agreed', few: 'Few agreed' }) +
        grp('Shock', (t, F) => F.z == null ? null : F.sh ? 'shock' : 'calm', ['calm', 'shock'], { calm: 'Normal days', shock: 'After an unusually large move' }) +
        grp('The exit', (t, F) => t.pnl > 0 ? (F.mfe > 0 && F.r / F.mfe >= 0.6 ? 'kept' : 'cut') : (F.mfe >= 1 ? 'gave' : 'never'), ['kept', 'cut', 'gave', 'never'], { kept: 'Won and kept most of it', cut: 'Won but kept under 60%', gave: 'Lost after being 1R ahead', never: 'Lost, never 1R ahead' }) +
        '</div>' : '<div class="auEmpty">Press “Analyse” to rebuild the context of your trades. It reads candles one request at a time.</div>');
  },
  court(name){ const R = window.TIMURILA_SIGNALS; if (!R) return ''; const avg = (rows, pick) => { let n = 0, s = 0; for (const x of rows) if (pick(x)){ n += x.n; s += x.exR * x.n; } return n ? s / n : null; };
    const f = v => this.sg(v, 3, 'R'), big = Math.round(R.events / 1e5) / 10 + ' million signals';
    if (name === 'The stream') return 'Large test, ' + big + ': with the daily trend ' + f(avg(R.stream, x => x.side === 'with')) + ', against it ' + f(avg(R.stream, x => x.side === 'against')) + ' above a random entry. Trading indicator signals with the trend did not help.';
    if (name === 'Agreement') return 'Large test: when most readings agreed ' + f(avg(R.agree, x => x.bucket === 'most agree')) + ', when few agreed ' + f(avg(R.agree, x => x.bucket === 'few agree')) + '. More agreement did not help; by then the move had often happened.';
    if (name === 'Shock') return 'Large test: signals on shock days ' + f(avg(R.shock, x => x.state === 'shock')) + ', on normal days ' + f(avg(R.shock, x => x.state === 'calm')) + ' above a random entry. No reliable difference.';
    return 'The exit is where your own trades can differ most from the textbook tests: those all used a fixed five-candle hold.'; },

  /* ---------- drawings ---------- */
  fit(cv, h){ const dpr = window.devicePixelRatio || 1, w = cv.clientWidth || cv.parentElement.clientWidth || 600, hh = h || cv.clientHeight || 300; cv.width = Math.round(w * dpr); cv.height = Math.round(hh * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c, w, h: hh }; },
  drawChart(){
    const cv = document.getElementById('auChart'), V = this.view; if (!cv || !V) return; const { c, w, h } = this.fit(cv), C = this.C, { t, P, iE, iX } = V;
    const a = Math.max(0, iE - 70), b = Math.min(P.n - 1, iX + 22), n = b - a + 1, padR = 64, padB = 22, padT = 12, cw = (w - padR - 8) / n; let lo = Infinity, hi = -Infinity;
    for (let i = a; i <= b; i++){ lo = Math.min(lo, P.l[i]); hi = Math.max(hi, P.h[i]); } for (const p of [t.sl, t.tp, t.entry, t.exit]) if (p > 0){ lo = Math.min(lo, p); hi = Math.max(hi, p); }
    const pad = (hi - lo) * 0.07 || 1; lo -= pad; hi += pad; const X = i => 8 + (i - a + 0.5) * cw, Y = p => padT + (hi - p) / (hi - lo) * (h - padT - padB);
    c.clearRect(0, 0, w, h); c.font = '11px JetBrains Mono, monospace'; c.textBaseline = 'middle';
    for (let g = 0; g <= 4; g++){ const p = lo + (hi - lo) * g / 4, y = Math.round(Y(p)) + 0.5; c.strokeStyle = C.grid; c.beginPath(); c.moveTo(0, y); c.lineTo(w - padR, y); c.stroke(); c.fillStyle = C.dim; c.textAlign = 'left'; c.fillText(this.px(p), w - padR + 8, y); }
    /* the time in the trade */
    const x0 = X(iE) - cw / 2, x1 = X(iX) + cw / 2, win = t.pnl > 0; c.fillStyle = win ? 'rgba(61,220,151,.09)' : 'rgba(255,107,122,.09)'; c.fillRect(x0, padT, x1 - x0, h - padT - padB);
    /* the candles */
    for (let i = a; i <= b; i++){ const up = P.c[i] >= P.o[i], x = X(i), bw = Math.max(1.5, cw * 0.62); c.strokeStyle = C.wick; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(x) + 0.5, Y(P.h[i])); c.lineTo(Math.round(x) + 0.5, Y(P.l[i])); c.stroke();
      c.fillStyle = up ? C.up : C.dn; const yo = Y(P.o[i]), yc = Y(P.c[i]); c.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo))); }
    const line = (p, col, dash, label) => { if (!(p > 0)) return; const y = Math.round(Y(p)) + 0.5; c.strokeStyle = col; c.lineWidth = 1.2; c.setLineDash(dash); c.beginPath(); c.moveTo(x0, y); c.lineTo(w - padR, y); c.stroke(); c.setLineDash([]); c.fillStyle = col; c.textAlign = 'right'; c.fillText(label, w - padR - 4, y - 8); };
    line(t.sl, C.dn, [4, 4], 'stop'); line(t.tp, C.up, [4, 4], 'target'); line(t.entry, C.cy, [], 'in');
    /* in, out, the best and the worst point */
    const dot = (x, y, col, txt, above) => { c.fillStyle = col; c.beginPath(); c.arc(x, y, 4.5, 0, 6.3); c.fill(); c.strokeStyle = '#060A12'; c.lineWidth = 2; c.stroke(); c.font = '600 11px Inter, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(6,10,18,.9)'; c.strokeText(txt, x, y + (above ? -14 : 15)); c.fillStyle = col; c.fillText(txt, x, y + (above ? -14 : 15)); c.font = '11px JetBrains Mono, monospace'; };
    dot(X(iE), Y(t.entry), C.cy, t.dir > 0 ? 'Buy' : 'Sell', t.dir < 0); dot(X(iX), Y(t.exit), win ? C.up : C.dn, 'Out ' + this.sg(V.F.r, 1, 'R'), t.dir > 0 === win);
    if (V.F.mfe > 0.3) dot(X(V.iBest), Y(t.dir > 0 ? P.h[V.iBest] : P.l[V.iBest]), C.am, 'best', t.dir > 0);
    if (V.F.mae > 0.3 && V.iWorst !== V.iBest) dot(X(V.iWorst), Y(t.dir > 0 ? P.l[V.iWorst] : P.h[V.iWorst]), C.dim, 'worst', t.dir < 0);
    c.fillStyle = C.dim; c.textAlign = 'center'; const tl = i => { const d = new Date((P.t[i] - this.shift(t.sym)) * 1000); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + d.toTimeString().slice(0, 5); };
    c.fillText(tl(iE), Math.max(60, Math.min(w - padR - 60, X(iE))), h - 9); if (X(iX) - X(iE) > 130) c.fillText(tl(iX), Math.min(w - padR - 50, X(iX)), h - 9);
  },
  px(p){ const a = Math.abs(p), d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 5; return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  drawPath(){ const cv = document.getElementById('auPath'), V = this.view; if (!cv || !V) return; const { c, w, h } = this.fit(cv, 96), C = this.C, p = V.path, hi = Math.max(1.2, V.F.mfe, ...p), lo = Math.min(-1.2, -V.F.mae, ...p), X = i => 6 + i / Math.max(1, p.length - 1) * (w - 60), Y = v => 6 + (hi - v) / (hi - lo) * (h - 12);
    c.clearRect(0, 0, w, h); c.font = '10px JetBrains Mono, monospace'; c.textBaseline = 'middle'; c.textAlign = 'left';
    for (const v of [1, 0, -1]){ const y = Math.round(Y(v)) + 0.5; c.strokeStyle = v ? C.grid : '#2A3B5C'; c.setLineDash(v ? [3, 4] : []); c.beginPath(); c.moveTo(0, y); c.lineTo(w - 50, y); c.stroke(); c.setLineDash([]); c.fillStyle = C.dim; c.fillText(v ? (v > 0 ? '+1R' : '−1R') : 'entry', w - 44, y); }
    const end = p[p.length - 1] || 0, col = end >= 0 ? C.up : C.dn; c.beginPath(); c.moveTo(X(0), Y(0)); for (let i = 0; i < p.length; i++) c.lineTo(X(i), Y(p[i])); c.lineTo(X(p.length - 1), Y(0)); c.closePath(); c.fillStyle = end >= 0 ? 'rgba(61,220,151,.16)' : 'rgba(255,107,122,.16)'; c.fill();
    c.beginPath(); for (let i = 0; i < p.length; i++) i ? c.lineTo(X(i), Y(p[i])) : c.moveTo(X(i), Y(p[i])); c.strokeStyle = col; c.lineWidth = 1.8; c.lineJoin = 'round'; c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(X(p.length - 1), Y(end), 3.5, 0, 6.3); c.fill(); },
  drawCompass(){ const cv = document.getElementById('auCompass'), V = this.view; if (!cv || !V) return; const { c, w, h } = this.fit(cv, 130), C = this.C, cx = w / 2, cy = h - 16, R = Math.min(w / 2 - 12, h - 30), sc = V.st ? V.st.score : 0;
    c.clearRect(0, 0, w, h); c.lineCap = 'round';
    for (let s = -4; s <= 4; s++){ const a0 = Math.PI + (s + 4) / 9 * Math.PI + 0.02, a1 = Math.PI + (s + 5) / 9 * Math.PI - 0.02; c.beginPath(); c.arc(cx, cy, R, a0, a1); c.lineWidth = 9; c.strokeStyle = s === sc ? (s > 0 ? C.up : s < 0 ? C.dn : C.dim) : s > 0 ? 'rgba(61,220,151,.22)' : s < 0 ? 'rgba(255,107,122,.22)' : 'rgba(124,139,168,.25)'; c.stroke(); }
    const ang = Math.PI + (sc + 4.5) / 9 * Math.PI; c.strokeStyle = C.text; c.lineWidth = 2.5; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + Math.cos(ang) * (R - 16), cy + Math.sin(ang) * (R - 16)); c.stroke(); c.fillStyle = C.text; c.beginPath(); c.arc(cx, cy, 4, 0, 6.3); c.fill();
    c.font = '10px Inter, sans-serif'; c.fillStyle = C.dim; c.textAlign = 'left'; c.fillText('down', 4, h - 4); c.textAlign = 'right'; c.fillText('up', w - 4, h - 4);
    c.textAlign = 'center'; c.font = '600 11px Inter, sans-serif'; c.fillStyle = V.t.dir > 0 ? C.up : C.dn; c.fillText(V.t.dir > 0 ? 'trade: buy ▲' : 'trade: sell ▼', cx, 12); },
  drawRing(){ const cv = document.getElementById('auRing'), V = this.view; if (!cv || !V) return; const { c, w, h } = this.fit(cv, 130), C = this.C, cx = w / 2, cy = h / 2, R = Math.min(w, h) / 2 - 10, L = V.ag.list, n = L.length;
    c.clearRect(0, 0, w, h); c.lineCap = 'butt'; for (let i = 0; i < n; i++){ const a0 = -Math.PI / 2 + i / n * 6.283 + 0.05, a1 = -Math.PI / 2 + (i + 1) / n * 6.283 - 0.05, d = L[i].dir; c.beginPath(); c.arc(cx, cy, R, a0, a1); c.lineWidth = 10; c.strokeStyle = d === V.t.dir ? C.up : d === -V.t.dir ? C.dn : 'rgba(124,139,168,.3)'; c.stroke(); }
    c.fillStyle = C.text; c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = '600 26px Space Grotesk, sans-serif'; c.fillText(V.F.a[0] + '/' + V.F.a[2], cx, cy - 2); c.font = '10px Inter, sans-serif'; c.fillStyle = C.dim; c.fillText('agreed', cx, cy + 18); },
  strip(){ const cv = document.getElementById('auStrip'); if (!cv) return; const { c, w, h } = this.fit(cv, 74), C = this.C, rows = this.rows(); c.clearRect(0, 0, w, h); if (!rows.length) return;
    const t0 = Math.min(...rows.map(t => t.t1)), t1 = Math.max(...rows.map(t => t.t1)), span = Math.max(1, t1 - t0), rOf = t => { const F = this.facts[t.id]; return t.r != null ? t.r : F && !F.err ? F.r : (t.pnl > 0 ? 0.6 : -0.6); };
    const X = t => 12 + (t.t1 - t0) / span * (w - 24), Y = r => h / 2 - Math.max(-3, Math.min(3, r)) / 3 * (h / 2 - 9); c.strokeStyle = '#2A3B5C'; c.beginPath(); c.moveTo(0, h / 2 + 0.5); c.lineTo(w, h / 2 + 0.5); c.stroke();
    this._strip = []; for (const t of rows.slice().reverse()){ const r = rOf(t), x = X(t), y = Y(r), on = t.id === this.sel; c.strokeStyle = t.pnl > 0 ? 'rgba(61,220,151,.5)' : 'rgba(255,107,122,.5)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, h / 2); c.lineTo(x, y); c.stroke();
      c.fillStyle = t.pnl > 0 ? C.up : C.dn; c.beginPath(); c.arc(x, y, on ? 5 : 2.6, 0, 6.3); c.fill(); if (on){ c.strokeStyle = C.text; c.lineWidth = 1.5; c.stroke(); } this._strip.push({ x, y, id: t.id }); }
    c.font = '10px Inter, sans-serif'; c.fillStyle = C.dim; c.textBaseline = 'top'; c.textAlign = 'left'; c.fillText(new Date(t0).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }), 4, 2); c.textAlign = 'right'; c.fillText(new Date(t1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) + ' · every dot is a trade, height = R', w - 4, 2); },
  stripPick(e){ if (!this._strip) return; const r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 144; for (const p of this._strip){ const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd){ bd = d; best = p; } } if (best) this.select(best.id); },
};
