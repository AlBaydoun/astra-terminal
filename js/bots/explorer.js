/* ASTRA Terminal — the Deep Dive.
   Every paper trade every bot has made, opened like a Russian doll: start
   with everything, press a market (Forex, Crypto, Metals…), then a pair, a
   bot, a timeframe, a side, a day, an hour — each step shows the same full
   picture for what is left: how many trades, how long they ran, what they
   made, how today went, and what is underneath to press next.
   Reading only. It never changes a trade or a setting. */
const Explorer = {
  path: [],                       // [{dim, value, label}] — the dolls opened so far
  GROUP_LABEL: { fx: 'Forex', crypto: 'Crypto', metal: 'Metals', index: 'Indices', energy: 'Energy', other: 'Other' },

  /* ---------- the dimensions a set can be split by ---------- */
  DIMS: [
    { id: 'market',  label: 'Market',      of: t => BROKER.costGroup(t.sym), name: v => Explorer.GROUP_LABEL[v] || v },
    { id: 'sym',     label: 'Instrument',  of: t => Feed.brokerName(t.sym), name: v => baseAsset(v).replace(/\.[A-Za-z]{1,4}$/, '') },
    { id: 'bot',     label: 'Bot',         of: t => t.bot, name: v => (BOT_BY_ID[v] ? WorkspaceUI.name(BOT_BY_ID[v]) : v) },
    { id: 'tf',      label: 'Timeframe',   of: t => t.tf || '?', name: v => v },
    { id: 'side',    label: 'Side',        of: t => t.dir > 0 ? 'buy' : 'sell', name: v => v === 'buy' ? 'Buys' : 'Sells' },
    { id: 'day',     label: 'Day',         of: t => new Date(t.exitTime || t.entryTime).toLocaleDateString(undefined, { year: 'numeric', month: '2-digit', day: '2-digit' }), name: v => v, sortByKey: true },
    { id: 'hour',    label: 'Hour opened', of: t => String(new Date(t.entryTime).getHours()).padStart(2, '0') + ':00', name: v => v, sortByKey: true },
    { id: 'dow',     label: 'Weekday',     of: t => ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][new Date(t.entryTime).getDay()], name: v => v },
    { id: 'outcome', label: 'How it ended', of: t => t.reason || '?', name: v => v },
    { id: 'hold',    label: 'How long it ran', of: t => Explorer.holdBucket((t.exitTime || 0) - (t.entryTime || 0)), name: v => v, order: ['< 15 min', '15–60 min', '1–4 h', '4–24 h', '> 1 day'] },
    { id: 'touched', label: 'Hand-adjusted', of: t => t.touched ? 'Adjusted by you' : 'Bot only', name: v => v },
  ],
  holdBucket(ms){
    const m = ms / 60000;
    return m < 15 ? '< 15 min' : m < 60 ? '15–60 min' : m < 240 ? '1–4 h' : m < 1440 ? '4–24 h' : '> 1 day';
  },
  dim(id){ return this.DIMS.find(d => d.id === id); },

  /* ---------- data ---------- */
  all(){ return BotDash.allTrades().filter(t => Number.isFinite(t.pnl)); },
  filtered(){
    let rows = this.all();
    for (const f of this.path){ const d = this.dim(f.dim); rows = rows.filter(t => d.of(t) === f.value); }
    return rows;
  },
  openNow(){
    let rows = BotDash.allOpen();
    for (const f of this.path){ const d = this.dim(f.dim); rows = rows.filter(t => { try { return d.of(t) === f.value; } catch(e){ return false; } }); }
    return rows;
  },
  stats(rows){
    const n = rows.length, wins = rows.filter(t => t.pnl > 0), losses = rows.filter(t => t.pnl <= 0);
    const gp = wins.reduce((a, t) => a + t.pnl, 0), gl = -losses.reduce((a, t) => a + t.pnl, 0);
    const net = rows.reduce((a, t) => a + t.pnl, 0), fees = rows.reduce((a, t) => a + (t.fees || 0), 0);
    const rs = rows.map(t => t.r).filter(Number.isFinite);
    const holds = rows.map(t => (t.exitTime || 0) - (t.entryTime || 0)).filter(x => x > 0);
    const today = new Date().toDateString();
    const todayRows = rows.filter(t => new Date(t.exitTime || t.entryTime).toDateString() === today);
    /* the longest run of wins and of losses, in time order */
    const ordered = rows.slice().sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0));
    let bestRun = 0, worstRun = 0, run = 0, last = null;
    for (const t of ordered){ const w = t.pnl > 0; if (w === last) run++; else { run = 1; last = w; } if (w) bestRun = Math.max(bestRun, run); else worstRun = Math.max(worstRun, run); }
    /* drawdown of the cumulative curve */
    let peak = 0, cum = 0, dd = 0;
    for (const t of ordered){ cum += t.pnl; peak = Math.max(peak, cum); dd = Math.max(dd, peak - cum); }
    const span = ordered.length ? (ordered[ordered.length - 1].exitTime || 0) - (ordered[0].entryTime || 0) : 0;
    return { n, wins: wins.length, losses: losses.length, winPct: n ? wins.length / n * 100 : 0, net, fees, gp, gl,
      pf: gl > 0 ? gp / gl : (gp > 0 ? Infinity : 0),
      avgR: rs.length ? rs.reduce((a, b) => a + b, 0) / rs.length : 0,
      avgWin: wins.length ? gp / wins.length : 0, avgLoss: losses.length ? gl / losses.length : 0,
      best: rows.reduce((a, t) => t.pnl > a ? t.pnl : a, 0), worst: rows.reduce((a, t) => t.pnl < a ? t.pnl : a, 0),
      avgHold: holds.length ? holds.reduce((a, b) => a + b, 0) / holds.length : 0,
      longest: holds.length ? Math.max(...holds) : 0, totalHold: holds.reduce((a, b) => a + b, 0),
      today: todayRows.length, todayNet: todayRows.reduce((a, t) => a + t.pnl, 0),
      bestRun, worstRun, maxDD: dd, span, ordered };
  },

  /* ---------- drawing ---------- */
  fmtDur(ms){
    if (!(ms > 0)) return '—';
    const m = Math.round(ms / 60000);
    if (m < 60) return m + ' min';
    const h = m / 60; if (h < 24) return h.toFixed(1) + ' h';
    const d = h / 24; return d < 30 ? d.toFixed(1) + ' days' : (d / 30).toFixed(1) + ' months';
  },
  money(v){ return (v >= 0 ? '+' : '') + fmtNum(v); },

  curveSvg(st){
    const pts = st.ordered; if (pts.length < 2) return '<div class="exEmpty">Not enough trades for a curve</div>';
    let cum = 0; const ys = pts.map(t => (cum += t.pnl));
    const lo = Math.min(0, ...ys), hi = Math.max(0, ...ys), W = 600, H = 120;
    const x = i => 8 + i / (pts.length - 1) * (W - 16), y = v => hi === lo ? H / 2 : 8 + (hi - v) / (hi - lo) * (H - 16);
    const d = ys.map((v, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1)).join(' ');
    const zero = y(0);
    const up = ys[ys.length - 1] >= 0;
    return `<svg class="exCurve" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
      <line x1="0" y1="${zero}" x2="${W}" y2="${zero}" class="exZero"/>
      <path d="${d} L${x(pts.length - 1).toFixed(1)} ${zero} L${x(0)} ${zero} Z" class="exFill ${up ? 'up' : 'down'}"/>
      <path d="${d}" class="exLine ${up ? 'up' : 'down'}" pathLength="1"/>
      <circle cx="${x(pts.length - 1).toFixed(1)}" cy="${y(ys[ys.length - 1]).toFixed(1)}" r="4" class="exDot ${up ? 'up' : 'down'}"/>
    </svg>`;
  },
  donut(st){
    const r = 34, c = 2 * Math.PI * r, w = st.n ? st.wins / st.n : 0;
    return `<svg class="exDonut" viewBox="0 0 90 90">
      <circle cx="45" cy="45" r="${r}" class="exDonutBg"/>
      <circle cx="45" cy="45" r="${r}" class="exDonutLoss" style="stroke-dasharray:${c};stroke-dashoffset:0"/>
      <circle cx="45" cy="45" r="${r}" class="exDonutWin" style="stroke-dasharray:${c};stroke-dashoffset:${c * (1 - w)}"/>
      <text x="45" y="42" class="exDonutBig">${Math.round(st.winPct)}%</text><text x="45" y="56" class="exDonutSmall">won</text>
    </svg>`;
  },
  histogram(values, buckets, fmt){
    if (!values.length) return '';
    const lo = Math.min(...values), hi = Math.max(...values);
    const step = (hi - lo) / buckets || 1;
    const bins = new Array(buckets).fill(0);
    for (const v of values){ let i = Math.floor((v - lo) / step); if (i >= buckets) i = buckets - 1; bins[i]++; }
    const max = Math.max(...bins);
    return `<div class="exHist">${bins.map((n, i) => `<div class="exBin" title="${fmt(lo + i * step)} to ${fmt(lo + (i + 1) * step)}: ${n}"><i style="height:${max ? n / max * 100 : 0}%" class="${lo + (i + 0.5) * step >= 0 ? 'up' : 'down'}"></i></div>`).join('')}
      <div class="exHistAxis"><span>${fmt(lo)}</span><span>${fmt(hi)}</span></div></div>`;
  },
  hourStrip(rows){
    const bins = new Array(24).fill(0), net = new Array(24).fill(0);
    for (const t of rows){ const h = new Date(t.entryTime).getHours(); bins[h]++; net[h] += t.pnl; }
    const max = Math.max(1, ...bins);
    return `<div class="exHours">${bins.map((n, h) => `<button class="exHour ${net[h] > 0 ? 'up' : net[h] < 0 ? 'down' : ''}" style="opacity:${0.25 + n / max * 0.75}" ${n ? `data-exdrill="hour|${String(h).padStart(2,'0')}:00"` : 'disabled'} title="${String(h).padStart(2,'0')}:00 — ${n} trades, ${this.money(net[h])}${n ? ' · press to open this hour' : ''}"><b>${n || ''}</b><span>${h}</span></button>`).join('')}</div>`;
  },

  /* one "split by" card: bars per value, click to open that doll */
  splitCard(dim, rows){
    const groups = {};
    for (const t of rows){ const k = dim.of(t); (groups[k] = groups[k] || []).push(t); }
    let entries = Object.entries(groups).map(([k, list]) => ({ k, n: list.length, net: list.reduce((a, t) => a + t.pnl, 0), wins: list.filter(t => t.pnl > 0).length }));
    if (entries.length < 2 && dim.id !== 'sym') return '';
    if (dim.order) entries.sort((a, b) => dim.order.indexOf(a.k) - dim.order.indexOf(b.k));
    else if (dim.sortByKey) entries.sort((a, b) => b.k.localeCompare(a.k));
    else entries.sort((a, b) => b.net - a.net);
    const maxAbs = Math.max(1, ...entries.map(e => Math.abs(e.net)));
    const all = this.showAll[dim.id];
    const shown = all ? entries : entries.slice(0, 14);
    const bar = e => `<button class="exBar" data-exdrill="${esc(dim.id)}|${esc(e.k)}" title="Open ${esc(dim.name(e.k))}">
        <span class="exBarName">${esc(dim.name(e.k))}</span>
        <span class="exBarTrack"><i class="${e.net >= 0 ? 'up' : 'down'}" style="width:${Math.abs(e.net) / maxAbs * 100}%"></i></span>
        <span class="exBarNum ${e.net >= 0 ? 'up' : 'down'}">${this.money(e.net)}</span>
        <span class="exBarMeta">${e.n} · ${Math.round(e.wins / e.n * 100)}%</span></button>`;
    return this.section('split:' + dim.id, esc(dim.label), entries.length + ' ' + (entries.length === 1 ? 'value' : 'values') + ' · press one to open it',
      `<div class="exBars">${shown.map(bar).join('')}</div>` +
      (entries.length > 14 ? `<button class="bMini exMoreBtn" data-exmore="${esc(dim.id)}">${all ? 'Show the top 14 only' : 'Show all ' + entries.length + ' (' + (entries.length - 14) + ' more)'}</button>` : ''),
      'exSplit');
  },
  showAll: {},

  /* ---------- sections: fold, maximise, move, resize — all remembered ---------- */
  SEC_KEY: 'astra_explorer_secs',
  secState(){ return lsGet(this.SEC_KEY, { order: [], fold: {}, max: null, h: {} }) || { order: [], fold: {}, max: null, h: {} }; },
  saveSec(st){ lsSet(this.SEC_KEY, st); },
  section(id, title, sub, body, cls){
    const st = this.secState();
    const folded = !!st.fold[id], maxed = st.max === id;
    const h = st.h[id] ? `style="height:${st.h[id]}px"` : '';
    return `<section class="exSec ${cls || 'exCard'}${folded ? ' folded' : ''}${maxed ? ' maxed' : ''}" data-exsec="${esc(id)}">
      <div class="exSecHead">
        <b>${title}</b><span>${esc(sub || '')}</span>
        <span class="paneCtl exSecCtl">
          <button data-exs="up" title="Move up">▲</button><button data-exs="down" title="Move down">▼</button>
          <button data-exs="fold" title="${folded ? 'Open' : 'Fold'}">${folded ? '▢' : '_'}</button>
          <button data-exs="max" class="${maxed ? 'on' : ''}" title="${maxed ? 'Back to normal' : 'Maximise'}">⛶</button>
        </span>
      </div>
      ${folded ? '' : `<div class="exSecBody" ${h}>${body}</div>`}
    </section>`;
  },
  ordered(list){
    const st = this.secState(), rank = {};
    st.order.forEach((id, i) => { rank[id] = i; });
    return list.map((x, i) => ({ x, i })).sort((a, b) => {
      const ra = rank[a.x.id], rb = rank[b.x.id];
      if (ra != null && rb != null) return ra - rb;
      if (ra != null) return -1; if (rb != null) return 1;
      return a.i - b.i;
    }).map(o => o.x);
  },
  secAction(id, what, ids){
    const st = this.secState();
    if (what === 'fold'){ st.fold[id] = !st.fold[id]; if (st.fold[id] && st.max === id) st.max = null; }
    else if (what === 'max'){ st.max = st.max === id ? null : id; delete st.fold[id]; }
    else if (what === 'up' || what === 'down'){
      const cur = this.ordered(ids.map(i => ({ id: i }))).map(o => o.id);
      const i = cur.indexOf(id), j = i + (what === 'up' ? -1 : 1);
      if (i < 0 || j < 0 || j >= cur.length) return;
      cur.splice(i, 1); cur.splice(j, 0, id);
      st.order = st.order.filter(x => !cur.includes(x)).concat(cur);
    }
    this.saveSec(st); this.dirty = true; Bots.render();
  },

  kpi(label, value, cls, sub){ return `<div class="exKpi"><span>${esc(label)}</span><b class="${cls || ''}">${value}</b>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`; },

  dirty: false,
  view(){
    this.dirty = false;
    const rows = this.filtered(), st = this.stats(rows), open = this.openNow();
    const crumbs = [`<button class="exCrumb${this.path.length ? '' : ' on'}" data-excrumb="-1">Everything</button>`]
      .concat(this.path.map((f, i) => `<i>›</i><button class="exCrumb${i === this.path.length - 1 ? ' on' : ''}" data-excrumb="${i}">${esc(this.dim(f.dim).label)}: ${esc(f.label)}</button>`)).join('');
    const usedDims = new Set(this.path.map(f => f.dim));
    const splitSecs = this.DIMS.filter(d => !usedDims.has(d.id)).map(d => ({ id: 'split:' + d.id, html: this.splitCard(d, rows) })).filter(x => x.html);
    const pfTxt = st.pf === Infinity ? '∞' : st.pf.toFixed(2);
    const list = rows.length && rows.length <= 80
      ? `<div class="exList">${rows.slice().sort((a, b) => (b.exitTime || 0) - (a.exitTime || 0)).map(t => `<div class="exRow ${t.pnl >= 0 ? 'up' : 'down'}">
          <b class="${t.dir > 0 ? 'up' : 'down'}">${t.dir > 0 ? 'BUY' : 'SELL'} ${esc(baseAsset(t.sym))}</b>
          <span>${esc(BOT_BY_ID[t.bot] ? WorkspaceUI.name(BOT_BY_ID[t.bot]) : t.bot)} · ${esc(t.tf || '')}</span>
          <span class="dim2">${new Date(t.entryTime).toLocaleString()} → ${this.fmtDur((t.exitTime || 0) - (t.entryTime || 0))}</span>
          <span class="dim2">${esc(t.reason || '')}${t.touched ? ' · adjusted' : ''}</span>
          <span class="${t.pnl >= 0 ? 'up' : 'down'} exRowPnl">${this.money(t.pnl)}<small>${Number.isFinite(t.r) ? ' · ' + t.r.toFixed(2) + 'R' : ''}</small></span></div>`).join('')}</div>`
      : rows.length ? `<div class="dim2 exMore">${rows.length} trades — open a smaller doll (a pair, a day…) to see them one by one.</div>` : '';
    const hero = `<div class="exHero">
        <div class="exHeroLeft">
          <div class="exBig ${st.net >= 0 ? 'up' : 'down'}"><span>net result</span><b data-count="${st.net.toFixed(2)}">${this.money(st.net)}</b></div>
          <div class="exKpis">
            ${this.kpi('Trades', st.n, '', this.fmtDur(st.span) + ' of history')}
            ${this.kpi('Won · lost', st.wins + ' · ' + st.losses, '', Math.round(st.winPct) + '% win rate')}
            ${this.kpi('Profit factor', pfTxt, st.pf >= 1 ? 'up' : 'down', 'won ' + fmtNum(st.gp) + ' vs lost ' + fmtNum(st.gl))}
            ${this.kpi('Average R', (st.avgR >= 0 ? '+' : '') + st.avgR.toFixed(2) + 'R', st.avgR >= 0 ? 'up' : 'down', 'avg win ' + fmtNum(st.avgWin) + ' · avg loss ' + fmtNum(st.avgLoss))}
            ${this.kpi('Time in trades', this.fmtDur(st.avgHold), '', 'average · longest ' + this.fmtDur(st.longest) + ' · total ' + this.fmtDur(st.totalHold))}
            ${this.kpi('Today', st.today + ' trade' + (st.today === 1 ? '' : 's'), st.todayNet >= 0 ? 'up' : 'down', this.money(st.todayNet) + ' today · ' + open.length + ' open now')}
            ${this.kpi('Best · worst', this.money(st.best) + ' · ' + this.money(st.worst), '', 'runs: ' + st.bestRun + ' wins, ' + st.worstRun + ' losses in a row')}
            ${this.kpi('Deepest dip', '−' + fmtNum(st.maxDD), st.maxDD > Math.abs(st.net) ? 'down' : '', 'from the highest point of the curve · fees ' + fmtNum(st.fees))}
          </div>
        </div>
        <div class="exHeroRight">${this.donut(st)}<div class="exDonutLegend"><span class="up">■ ${st.wins} won</span><span class="down">■ ${st.losses} lost</span></div></div>
      </div>`;
    const secs = this.ordered([
      { id: 'hero',  html: this.section('hero', 'The picture', 'what this doll holds', hero, 'exHeroSec') },
      { id: 'curve', html: this.section('curve', 'The curve', 'every trade added up, in time order', this.curveSvg(st)) },
      { id: 'pnl',   html: this.section('pnl', 'Result per trade', 'how the wins and losses are spread', this.histogram(rows.map(t => t.pnl), 16, v => fmtNum(v))) },
      { id: 'rdist', html: this.section('rdist', 'R per trade', 'reward against the risk taken', this.histogram(rows.map(t => t.r).filter(Number.isFinite), 16, v => v.toFixed(1) + 'R')) },
      { id: 'hours', html: this.section('hours', 'Hour of the day', 'when the trades were opened · colour = net · press an hour to open it', this.hourStrip(rows)) },
    ].concat(splitSecs).concat(list ? [{ id: 'list', html: this.section('list', 'The trades themselves', rows.length <= 80 ? rows.length + ' — newest first' : rows.length + ' trades', list) }] : []));
    const maxed = this.secState().max;
    this._secIds = secs.map(x => x.id);
    return `<div class="exWrap${maxed ? ' hasMax' : ''}">
      <div class="exCrumbs">${crumbs}${this.path.length ? `<button class="bMini" data-excrumb="-1" title="Back to everything">✕ clear</button>` : ''}</div>
      ${rows.length ? `<div class="exSecs">${secs.map(x => x.html).join('')}</div>` : `<div class="empty exEmpty">No closed trades here yet.${this.path.length ? ' Try a wider doll.' : ''}</div>`}
    </div>`;
  },

  drill(dimId, value){
    const d = this.dim(dimId);
    this.path.push({ dim: dimId, value, label: d.name(value) });
    lsSet('astra_explorer_path', this.path);
    this.dirty = true; Bots.render();
  },
  crumb(i){
    this.path = i < 0 ? [] : this.path.slice(0, i + 1);
    lsSet('astra_explorer_path', this.path);
    this.dirty = true; Bots.render();
  },
  bind(host){
    host.querySelectorAll('[data-exdrill]').forEach(b => b.addEventListener('click', () => {
      const i = b.dataset.exdrill.indexOf('|');
      this.drill(b.dataset.exdrill.slice(0, i), b.dataset.exdrill.slice(i + 1));
    }));
    host.querySelectorAll('[data-excrumb]').forEach(b => b.addEventListener('click', () => this.crumb(+b.dataset.excrumb)));
    host.querySelectorAll('[data-exmore]').forEach(b => b.addEventListener('click', () => { this.showAll[b.dataset.exmore] = !this.showAll[b.dataset.exmore]; this.dirty = true; Bots.render(); }));
    host.querySelectorAll('[data-exs]').forEach(b => b.addEventListener('click', e => {
      e.stopPropagation();
      this.secAction(b.closest('[data-exsec]').dataset.exsec, b.dataset.exs, this._secIds || []);
    }));
    /* a folded section opens when its heading is clicked */
    host.querySelectorAll('.exSec.folded .exSecHead').forEach(h => h.addEventListener('click', e => { if (!e.target.closest('[data-exs]')) this.secAction(h.closest('[data-exsec]').dataset.exsec, 'fold', this._secIds || []); }));
    /* drag the bottom-right corner of a section to resize it; the height is remembered */
    if (window.ResizeObserver){
      host.querySelectorAll('.exSecBody').forEach(body => {
        let first = true;
        const ro = new ResizeObserver(() => {
          if (first){ first = false; return; }
          const st = this.secState(); const id = body.closest('[data-exsec]').dataset.exsec;
          const h = Math.round(body.getBoundingClientRect().height);
          if (h > 40){ st.h[id] = h; this.saveSec(st); }
        });
        ro.observe(body);
      });
    }
    /* the big number counts up, the bars grow in — a beat after the page is on screen */
    requestAnimationFrame(() => {
      host.querySelectorAll('.exBar i, .exBin i').forEach(el => { const w = el.style.width, h = el.style.height; el.style.transition = 'none'; if (w) el.style.width = '0'; if (h) el.style.height = '0'; void el.offsetWidth; el.style.transition = ''; if (w) el.style.width = w; if (h) el.style.height = h; });
      const big = host.querySelector('[data-count]');
      if (big){ const target = +big.dataset.count, t0 = performance.now(); const tick = now => { const k = Math.min(1, (now - t0) / 700), v = target * (1 - Math.pow(1 - k, 3)); big.textContent = (v >= 0 ? '+' : '') + fmtNum(v); if (k < 1) requestAnimationFrame(tick); }; requestAnimationFrame(tick); }
    });
  },
};
Explorer.path = lsGet('astra_explorer_path', []) || [];
BOTS.push({ id: 'explorer', name: 'Deep Dive', analysis: true, explorer: true,
  blurb: 'Every trade, opened like a Russian doll: start with everything, press a market, then a pair, a bot, a timeframe, a side, a day — and see the whole picture of what is left at every step.',
  defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 }, warmup: 0, signal: () => null });
BOT_BY_ID.explorer = BOTS[BOTS.length - 1];
