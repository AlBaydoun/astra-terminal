/* Timurila — Journal room: what happened, read straight from MetaTrader's own record.
   Source: GET /deals?days=365&entries=1 on the bridge (closing deals + the opening deals that
   carry the bot's name). Every figure here is real money after commission and swap.
   Read only. Times are the broker's server time. */
const Journal = {
  RANGES: [['30', '30 days'], ['90', '90 days'], ['365', '12 months']],
  range: '365', filter: null, day: null, sel: null, trades: null, loadedAt: 0, busy: false, story: {},

  init(){
    this.range = T.load('jrange', '365');
    const el = document.getElementById('room-journal');
    el.innerHTML = `
      <div class="head"><div><h1>Journal</h1><p>What happened, read from your MT5 history. Real money, after commission and swap.</p></div><div class="pills" id="jrRanges"></div></div>
      <section class="card" id="jrBrief" aria-label="In plain words"></section>
      <div class="cols stretch">
        <section class="card" style="flex:3 1 520px" aria-label="Result over time" id="jrCurve"></section>
        <section class="card" style="flex:2 1 340px" aria-label="Calendar" id="jrCal"></section>
      </div>
      <section class="card" aria-label="What earned and what cost"><div class="hd"><h2>What earned and what cost</h2><span class="sub">Pick a row to look at only those trades. Pick it again to clear.</span></div><div class="cols" id="jrAttr"></div></section>
      <div class="cols">
        <section class="card" style="flex:3 1 560px" aria-label="Trades" id="jrList"></section>
        <section class="card" style="flex:2 1 380px" aria-label="Trade story" id="jrStory"></section>
      </div>`;
    document.getElementById('jrRanges').innerHTML = this.RANGES.map(r => `<button class="pill" data-range="${r[0]}">${r[1]}</button>`).join('');
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-range],[data-f],[data-day],[data-pos],[data-clear]'); if (!b) return;
      if (b.dataset.range){ this.range = b.dataset.range; T.save('jrange', this.range); this.day = null; }
      else if (b.dataset.f){ const [k, v] = [b.dataset.f, b.dataset.v]; this.filter = this.filter && this.filter.k === k && this.filter.v === v ? null : { k, v }; }
      else if (b.dataset.day){ this.day = this.day === +b.dataset.day ? null : +b.dataset.day; }
      else if (b.dataset.clear){ this.filter = null; this.day = null; }
      else if (b.dataset.pos){ this.sel = b.dataset.pos; this.loadStory(); }
      this.render();
    });
    T.on('symbols', () => { if (App.room === 'journal') this.refresh(); });
    setInterval(() => { if (App.room === 'journal' && !T.hidden() && T.online) this.refresh(true); }, 60000);
    this.render();
  },
  show(){ this.refresh(); },

  async refresh(force){
    if (!T.online || this.busy || (!force && this.trades && Date.now() - this.loadedAt < 60000)){ this.render(); return; }
    this.busy = true;
    try {
      const d = await T.get('/deals?days=365&entries=1', 20000), ent = {}; for (const e of d.entries || []) ent[e.position] = e;
      const by = {};
      for (const x of d.deals || []){
        const e = ent[x.position] || {}, id = String(e.comment || '').replace(/^ASTRA\s*/, '') || '(untagged)', c = String(x.comment || '');
        const t = by[x.position] = by[x.position] || { pos: String(x.position), sym: x.symbol, bot: id, botName: (typeof Fleet !== 'undefined' && Fleet.LIVE_NAMES[id]) || id,
          side: e.type || (x.type === 'sell' ? 'buy' : 'sell'), lots: 0, tIn: e.time || x.time, pxIn: e.price || null, tOut: 0, pxOut: null, gross: 0, costs: (e.commission || 0) + (e.swap || 0) + (e.fee || 0), exit: 'other', level: null };
        t.lots += x.volume || 0; t.gross += x.profit || 0; t.costs += (x.commission || 0) + (x.swap || 0) + (x.fee || 0);
        if (x.time >= t.tOut){ t.tOut = x.time; t.pxOut = x.price; const m = c.match(/^\[(sl|tp)\s*([\d.]+)/i);
          t.exit = m ? (m[1].toLowerCase() === 'sl' ? 'stop' : 'target') : /ASTRA close/i.test(c) ? 'closed by Classic' : 'closed another way'; t.level = m ? +m[2] : null; }
      }
      this.trades = Object.values(by).map(t => Object.assign(t, { net: t.gross + t.costs })).sort((a, b) => b.tOut - a.tOut); this.loadedAt = Date.now();
    } catch(e){ console.warn('journal', e); }
    this.busy = false; this.render();
  },

  /* ---- helpers ---- */
  dstr(t, time){ const d = new Date(t * 1000); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + (time ? ' ' + d.toISOString().slice(11, 16) : ''); },
  dur(s){ const m = Math.round(s / 60); return m < 60 ? m + 'm' : m < 1440 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : Math.floor(m / 1440) + 'd ' + Math.floor(m % 1440 / 60) + 'h'; },
  session(t){ const h = new Date(t * 1000).getUTCHours(); return h < 10 ? 'Asia hours (before 10:00)' : h < 16 ? 'London hours (10:00 to 16:00)' : h < 23 ? 'New York hours (16:00 to 23:00)' : 'Late (after 23:00)'; },
  KEYS: { bot: ['By bot', t => t.botName], sym: ['By market', t => T.base(t.sym)], group: ['By kind of market', t => T.groupName(T.groupOf(t.sym))], exit: ['By how it ended', t => t.exit[0].toUpperCase() + t.exit.slice(1)],
    side: ['By direction', t => t.side === 'buy' ? 'Buys' : 'Sells'], session: ['By time of entry, broker time', t => Journal.session(t.tIn)], wday: ['By weekday of entry', t => ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(t.tIn * 1000).getUTCDay()]] },
  inRange(){ const from = Date.now() / 1000 - (+this.range) * 86400; return (this.trades || []).filter(t => t.tOut >= from); },
  shown(){ const f = this.filter; return this.inRange().filter(t => (!f || this.KEYS[f.k][1](t) === f.v) && (this.day == null || Math.floor(t.tOut / 86400) === this.day)); },
  stats(L){ const n = L.length, w = L.filter(t => t.net > 0), l = L.filter(t => t.net <= 0), sum = a => a.reduce((s, t) => s + t.net, 0);
    return { n, net: sum(L), win: n ? w.length / n * 100 : 0, avgW: w.length ? sum(w) / w.length : 0, avgL: l.length ? sum(l) / l.length : 0, pf: l.length && sum(l) ? sum(w) / -sum(l) : null,
      best: n ? Math.max(...L.map(t => t.net)) : 0, worst: n ? Math.min(...L.map(t => t.net)) : 0, costs: L.reduce((s, t) => s + t.costs, 0), hold: n ? L.reduce((s, t) => s + (t.tOut - t.tIn), 0) / n : 0 }; },

  /* ---- drawing ---- */
  render(){
    document.querySelectorAll('#jrRanges .pill').forEach(b => b.setAttribute('aria-pressed', b.dataset.range === this.range));
    const R = this.inRange(), L = this.shown(), ids = ['jrBrief', 'jrCurve', 'jrCal', 'jrList', 'jrStory'].map(i => document.getElementById(i));
    if (!this.trades || !R.length){ const msg = !T.online ? 'Waiting for the MT5 bridge.' : !this.trades ? 'Reading your MT5 history…' : 'No closed trades in this period.';
      ids[0].innerHTML = `<div class="empty">${msg}</div>`; ids.slice(1).forEach(e => e.innerHTML = ''); document.getElementById('jrAttr').innerHTML = ''; return; }
    const A = this.stats(R), S = this.stats(L), rangeName = this.RANGES.find(r => r[0] === this.range)[1], tile = (k, v, c = '') => `<div class="tile"><span class="k">${k}</span><span class="mono ${c}">${v}</span></div>`;
    const lastDay = Math.floor(R[0].tOut / 86400), LD = R.filter(t => Math.floor(t.tOut / 86400) === lastDay), cnt = k => LD.filter(t => t.exit === k).length, ldNet = LD.reduce((s, t) => s + t.net, 0);
    const bots = this.group(R, 'bot'), bestBot = bots.slice().sort((a, b) => b.net - a.net)[0], worstBot = bots.slice().sort((a, b) => a.net - b.net)[0];
    ids[0].innerHTML = `<div class="hd"><h2>In plain words</h2><span class="sub">last ${rangeName} · ${this.dstr(R[R.length - 1].tOut)} to ${this.dstr(R[0].tOut)}</span></div>
      <p style="font-family:var(--font-head);font-size:20px;font-weight:500;line-height:1.35;text-wrap:pretty">${A.n} trades closed, ${T.num(A.win, 0)}% of them won, for <span class="${T.cls(A.net)}">${T.signed(A.net, 2)}</span> in total. The average win is ${T.num(A.avgW, 2)} and the average loss is ${T.num(Math.abs(A.avgL), 2)}.</p>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(230px,100%),1fr))">
        <div class="tile"><span class="k">Last trading day · ${this.dstr(R[0].tOut)}</span><span style="text-wrap:pretty">${LD.length} trade${LD.length === 1 ? '' : 's'} closed: ${cnt('target')} at the target, ${cnt('stop')} at the stop${LD.length - cnt('target') - cnt('stop') ? ', ' + (LD.length - cnt('target') - cnt('stop')) + ' another way' : ''}, for <span class="mono ${T.cls(ldNet)}">${T.signed(ldNet, 2)}</span>.</span></div>
        <div class="tile"><span class="k">Earned the most</span><span>${T.esc(bestBot.name)} <span class="mono ${T.cls(bestBot.net)}">${T.signed(bestBot.net, 2)}</span> over ${bestBot.n} trades</span></div>
        <div class="tile"><span class="k">Cost the most</span><span>${T.esc(worstBot.name)} <span class="mono ${T.cls(worstBot.net)}">${T.signed(worstBot.net, 2)}</span> over ${worstBot.n} trades</span></div>
        <div class="tile"><span class="k">Worth knowing</span><span style="text-wrap:pretty">No bot has the 40 trades needed to judge it, so none of this is a verdict yet.</span></div>
      </div>`;

    /* running total */
    const asc = L.slice().sort((a, b) => a.tOut - b.tOut); let c = 0; const pts = [0].concat(asc.map(t => c += t.net)), lo = Math.min(...pts), hi = Math.max(...pts), X = i => 6 + i / Math.max(1, pts.length - 1) * 588, Y = v => 140 - (v - lo) / ((hi - lo) || 1) * 130;
    const chip = this.filter || this.day != null ? `<button class="pill" data-clear="1" style="min-height:28px;font-size:12px" aria-pressed="true">${T.esc(this.filter ? this.filter.v : '')}${this.filter && this.day != null ? ' · ' : ''}${this.day != null ? this.dstr(this.day * 86400) : ''} ✕</button>` : '';
    ids[1].innerHTML = `<div class="hd"><h2>Running total</h2><span class="pills">${chip}<span class="sub">${L.length} trade${L.length === 1 ? '' : 's'}</span></span></div>
      ${L.length ? `<svg class="curve" viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Running total of closed trades"><path d="M6 ${Y(0).toFixed(1)}H594" style="fill:none;stroke:#2A3A57;stroke-dasharray:3 4;vector-effect:non-scaling-stroke"></path>
        <path d="${pts.map((v, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1)).join('')}" style="fill:none;stroke:${c >= 0 ? '#3DDC97' : '#FF6B7A'};stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round"></path></svg>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(118px,100%),1fr))">${tile('Result', T.signed(S.net, 2), T.cls(S.net))}${tile('Won', T.num(S.win, 0) + '%')}${tile('Won ÷ lost money', S.pf != null ? T.num(S.pf, 2) : '–')}${tile('Average win', T.signed(S.avgW, 2), 'up')}${tile('Average loss', T.signed(S.avgL, 2), 'down')}${tile('Best · worst', T.signed(S.best, 0) + ' · ' + T.signed(S.worst, 0))}${tile('Held on average', this.dur(S.hold))}${tile('Commission and swap', T.signed(S.costs, 2), T.cls(S.costs))}</div>` : `<div class="empty">No trades match.</div>`}`;

    /* calendar: weeks from the first trade in range, at most 16, Monday first */
    const byDay = {}; for (const t of (this.filter ? R.filter(t => this.KEYS[this.filter.k][1](t) === this.filter.v) : R)){ const d = Math.floor(t.tOut / 86400), o = byDay[d] = byDay[d] || { n: 0, net: 0 }; o.n++; o.net += t.net; }
    const today = Math.floor(Date.now() / 86400000), monday = d => d - ((new Date(d * 86400000).getUTCDay() + 6) % 7), end = monday(today) + 6, start = Math.max(monday(Math.floor(R[R.length - 1].tOut / 86400)), end - 16 * 7 + 1);
    const mx = Math.max(1, ...Object.values(byDay).map(o => Math.abs(o.net))); let cells = '';
    for (let d = start; d <= end; d++){ const o = byDay[d], dt = new Date(d * 86400000), lab = dt.getUTCDate() === 1 || d === start ? dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : dt.getUTCDate();
      cells += o ? `<button type="button" class="day" data-day="${d}" aria-pressed="${this.day === d}" title="${this.dstr(d * 86400)}: ${o.n} trade${o.n === 1 ? '' : 's'}" style="background:rgba(${o.net >= 0 ? '61,220,151' : '255,107,122'},${(0.16 + 0.4 * Math.abs(o.net) / mx).toFixed(2)})"><small>${lab}</small><b>${T.signed(o.net, 0)}</b></button>`
        : `<span class="day${d > today ? ' future' : ''}"><small>${lab}</small></span>`; }
    ids[2].innerHTML = `<div class="hd"><h2>Day by day</h2><span class="sub">pick a day to see its trades</span></div><div class="cal hd7"><span>Mon</span><span>Tue</span><span>Wed</span><span>Thu</span><span>Fri</span><span>Sat</span><span>Sun</span></div><div class="cal">${cells}</div>`;

    /* attribution */
    document.getElementById('jrAttr').innerHTML = Object.keys(this.KEYS).map(k => { const G = this.group(R, k), m = Math.max(1, ...G.map(g => Math.abs(g.net)));
      return `<div style="flex:1 1 250px;min-width:0;display:flex;flex-direction:column;gap:6px"><h3 class="sub" style="font-weight:600;letter-spacing:.04em;text-transform:uppercase">${this.KEYS[k][0]}${G.length > 5 ? ' · ' + G.length : ''}</h3><div class="attrList">${G.map(g => `<button type="button" class="attr" data-f="${k}" data-v="${T.esc(g.name)}" aria-pressed="${!!this.filter && this.filter.k === k && this.filter.v === g.name}">
          <span class="l1"><span>${T.esc(g.name)}</span><span class="mono ${T.cls(g.net)}">${T.signed(g.net, 2)}</span></span><span class="bar"><i style="width:${Math.max(2, Math.abs(g.net) / m * 100)}%;background:${g.net >= 0 ? 'var(--up)' : 'var(--down)'}"></i></span><span class="l2">${g.n} trade${g.n === 1 ? '' : 's'} · ${T.num(g.win, 0)}% won</span></button>`).join('')}</div></div>`; }).join('');

    /* the list */
    if (!L.find(t => t.pos === this.sel)){ this.sel = L[0] ? L[0].pos : null; if (this.sel) this.loadStory(); }
    ids[3].innerHTML = `<div class="hd"><h2>Trades</h2><span class="sub">${L.length} shown · newest first · pick one for its story</span></div><div class="scrollx" style="max-height:520px;overflow-y:auto"><table class="t pick"><thead><tr><th>Closed</th><th>Market</th><th>Bot</th><th>Side</th><th>Ended</th><th class="n">Held</th><th class="n">Result</th></tr></thead><tbody>
      ${L.map(t => `<tr data-pos="${t.pos}" aria-selected="${t.pos === this.sel}"><td class="mute">${this.dstr(t.tOut, true)}</td><td class="mono">${T.esc(T.base(t.sym))}</td><td>${T.esc(t.botName)}</td><td>${t.side === 'buy' ? 'Buy' : 'Sell'}</td><td>${t.exit}</td><td class="n">${this.dur(t.tOut - t.tIn)}</td><td class="n ${T.cls(t.net)}">${T.signed(t.net, 2)}</td></tr>`).join('')}</tbody></table></div>`;
    this.renderStory();
  },
  group(L, k){ const by = {}; for (const t of L){ const name = this.KEYS[k][1](t), o = by[name] = by[name] || { name, n: 0, net: 0, w: 0 }; o.n++; o.net += t.net; if (t.net > 0) o.w++; }
    return Object.values(by).map(o => Object.assign(o, { win: o.w / o.n * 100 })).sort((a, b) => b.n - a.n || b.net - a.net); },

  /* ---- one trade, with its candles ---- */
  async loadStory(){
    const t = (this.trades || []).find(x => x.pos === this.sel); if (!t || this.story[t.pos]) return;
    const hold = t.tOut - t.tIn, tf = hold < 3 * 86400 ? '15m' : '1h', bar = tf === '15m' ? 900 : 3600, pad = Math.max(hold * 0.7, bar * 24);
    try { const j = await T.get('/candles?symbol=' + encodeURIComponent(t.sym) + '&tf=' + tf + '&limit=60000&from=' + Math.floor(t.tIn - pad), 25000);
      this.story[t.pos] = { tf, c: (j.candles || []).filter(r => r[0] <= t.tOut + pad).slice(-260) }; }
    catch(e){ this.story[t.pos] = { tf, c: [] }; }
    if (this.sel === t.pos) this.renderStory();
  },
  renderStory(){
    const el = document.getElementById('jrStory'), t = (this.trades || []).find(x => x.pos === this.sel); if (!t){ el.innerHTML = ''; return; }
    const st = this.story[t.pos], d = (T.quotes[t.sym] || {}).digits, px = v => v == null ? '–' : T.num(v, d != null ? Math.min(d, 5) : 2); let chart = `<div class="empty">Loading the candles around this trade…</div>`;
    if (st && !st.c.length) chart = `<div class="empty">The broker has no candles for this stretch.</div>`;
    else if (st){ const c = st.c, lv = [t.pxIn, t.pxOut, t.level].filter(v => v != null), lo = Math.min(...c.map(r => r[3]), ...lv), hi = Math.max(...c.map(r => r[2]), ...lv), n = c.length, w = 588 / n;
      const X = i => 6 + (i + 0.5) * w, Y = v => 10 + (hi - v) / ((hi - lo) || 1) * 170, at = ts => { let k = 0; while (k < n - 1 && c[k + 1][0] <= ts) k++; return k; }, iIn = at(t.tIn), iOut = at(t.tOut), good = t.net > 0;
      chart = `<svg class="curve" style="height:200px" viewBox="0 0 600 190" preserveAspectRatio="none" role="img" aria-label="Candles around the trade, with entry, exit and the stop or target level">
        <rect x="${X(iIn).toFixed(1)}" y="6" width="${Math.max(2, X(iOut) - X(iIn)).toFixed(1)}" height="178" style="fill:${good ? 'rgba(61,220,151,.07)' : 'rgba(255,107,122,.07)'}"></rect>
        ${c.map((r, i) => { const up = r[4] >= r[1], col = up ? '#3DDC97' : '#FF6B7A'; return `<path d="M${X(i).toFixed(1)} ${Y(r[2]).toFixed(1)}V${Y(r[3]).toFixed(1)}" style="stroke:${col};stroke-width:1;vector-effect:non-scaling-stroke"></path><rect x="${(X(i) - w * 0.33).toFixed(1)}" y="${Y(Math.max(r[1], r[4])).toFixed(1)}" width="${(w * 0.66).toFixed(1)}" height="${Math.max(0.8, Math.abs(Y(r[1]) - Y(r[4]))).toFixed(1)}" style="fill:${col}"></rect>`; }).join('')}
        ${t.pxIn != null ? `<path d="M6 ${Y(t.pxIn).toFixed(1)}H594" style="fill:none;stroke:#C9D4E5;stroke-width:1;stroke-dasharray:5 4;vector-effect:non-scaling-stroke"></path>` : ''}
        ${t.level != null ? `<path d="M6 ${Y(t.level).toFixed(1)}H594" style="fill:none;stroke:${t.exit === 'stop' ? '#FF9AA4' : '#7BE8B8'};stroke-width:1;stroke-dasharray:2 4;vector-effect:non-scaling-stroke"></path>` : ''}
        ${t.pxIn != null ? `<circle cx="${X(iIn).toFixed(1)}" cy="${Y(t.pxIn).toFixed(1)}" r="5" style="fill:#060A12;stroke:#EAF1FB;stroke-width:2;vector-effect:non-scaling-stroke"></circle>` : ''}
        ${t.pxOut != null ? `<circle cx="${X(iOut).toFixed(1)}" cy="${Y(t.pxOut).toFixed(1)}" r="5" style="fill:${good ? '#3DDC97' : '#FF6B7A'}"></circle>` : ''}</svg>
        <div class="legend"><span><i style="background:#060A12;border:2px solid #EAF1FB"></i>in</span><span><i style="background:${good ? 'var(--up)' : 'var(--down)'}"></i>out</span><span>dashed line: entry price</span>${t.level != null ? `<span>dotted line: the ${t.exit}</span>` : ''}<span>${st.tf} candles</span></div>`; }
    const step = (k, v) => `<li><span class="k mono">${k}</span><span style="text-wrap:pretty">${v}</span></li>`;
    el.innerHTML = `<div class="hd"><h2>Trade story</h2><span class="mono ${T.cls(t.net)}" style="font-size:16px">${T.signed(t.net, 2)}</span></div>
      <div><b class="mono" style="font-size:16px">${T.esc(T.base(t.sym))}</b> <span class="sub">${T.groupName(T.groupOf(t.sym))} · ${T.esc(t.botName)}</span></div>${chart}
      <ol class="steps">${step('Opened', `${T.esc(t.botName)} ${t.side === 'buy' ? 'bought' : 'sold'} ${T.num(t.lots, 2)} lots at ${px(t.pxIn)} on ${this.dstr(t.tIn, true)}.`)}
        ${step('Closed', `${t.exit === 'stop' ? 'The stop was hit' : t.exit === 'target' ? 'The target was reached' : t.exit === 'closed by Classic' ? 'Classic closed it' : 'It was closed another way'} at ${px(t.pxOut)} on ${this.dstr(t.tOut, true)}, after ${this.dur(t.tOut - t.tIn)}.`)}
        ${step('Result', `${T.signed(t.gross, 2)} on the price${t.costs ? ', ' + T.signed(t.costs, 2) + ' in commission and swap' : ', no commission or swap'}.`)}</ol>
      <p class="sub">Times are your broker's server time. Why the bot took the trade is recorded in Classic's Deep Dive, not in MT5.</p>`;
  },
};
