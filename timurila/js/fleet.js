/* Timurila — Fleet room: paper bots, the limits that hold them, and the live record read from MT5.

   PAPER ONLY. A paper bot here is a replay of its rule on CLOSED daily candles from the bridge:
   signal on a closed candle, in at the next open, the spread paid one and a half times over,
   sized so that one ATR(20) equals the risk per trade. Nothing in this file can send an order;
   it only reads /candles and /deals. Because the record is rebuilt from the candles each time,
   a bot misses nothing while the page is closed. Each bot keeps its own paper account. */
const Fleet = {
  CFG: { riskPct: 0.5, maxOpen: 3, maxSame: 2, dailyLossPct: 2, need: 40 },
  FLOOR: { indices: 0.00009, metals: 0.00006, energy: 0.00028, crypto: 0.0005, forex: 0.00002, shares: 0.0005, other: 0.0005 },
  LIVE_NAMES: { proven15m: 'Proven candles · 15m', patbounce: 'Bounce point', bullEng: 'Bullish Engulfing', patIndices: 'Pattern Indices', patrejstable: 'Stable rejection point', patGold: 'Pattern Gold and Silver' },
  /* trig: is there a signal on closed candle i?  rank: lower = taken first when the limits allow only some */
  BOTS: [
    { id: 'band_indices', name: 'Below the lower band · indices', group: 'indices', evidence: 'r6_bb_indices',
      rule: 'Above the 200-day average and a close below the lower Bollinger band (20 days, 2 deviations): buy at the next open. Out at the open after a close above the 5-day average, or after 10 days. Daily candles, long only.',
      trig: (s, i) => s.sd20[i] != null && s.c[i].close < s.s20[i] - 2 * s.sd20[i], rank: (s, i) => (s.c[i].close - s.s20[i]) / s.sd20[i], first: 'the furthest below the band' },
    { id: 'dip_indices', name: 'Dip in an uptrend · indices', group: 'indices', evidence: 'r5_rsi2_long_indices',
      rule: 'Above the 200-day average and RSI(2) under 10: buy at the next open. Out at the open after a close above the 5-day average, or after 10 days. Daily candles, long only.',
      trig: (s, i) => s.rsi[i] != null && s.rsi[i] < 10, rank: (s, i) => s.rsi[i], first: 'the deepest dip' },
  ],
  state: null, sel: null, series: null, loadedAt: 0, runs: {}, live: null, busy: false,

  init(){
    this.state = T.load('fleet', {}); this.sel = T.load('fleetSel', this.BOTS[0].id); if (!this.BOTS.find(b => b.id === this.sel)) this.sel = this.BOTS[0].id;
    const el = document.getElementById('room-fleet');
    el.innerHTML = `
      <div class="head"><div><h1>Fleet</h1><p>Every bot, the stage it has earned, and the limits that hold it.</p></div><span class="pill" style="cursor:default;border-color:var(--cyan);color:var(--cyan)">Paper and shadow only · Timurila sends no orders</span></div>
      <div class="cols stretch">
        <section class="card" style="flex:1 1 300px" aria-label="Paper"><div class="stage"><span class="no">1</span><h2>Paper</h2></div>
          <p class="sub">Pretend money, real prices and spread. A bot needs ${this.CFG.need} closed trades here before it can be judged.</p><div class="list" id="flPaper"></div></section>
        <section class="card" style="flex:1 1 300px" aria-label="Shadow"><div class="stage"><span class="no" style="border-color:var(--cyan);color:var(--cyan)">2</span><h2>Shadow</h2></div>
          <p class="sub">The bot watches the real account and writes down every order it would send, at the live price, without sending any.</p><div class="list" id="flShadow"></div></section>
        <section class="card" style="flex:1 1 300px" aria-label="Live"><div class="stage"><span class="no" style="border-color:var(--up);color:var(--up)">3</span><h2>Live</h2></div>
          <p class="sub">Real money, run from Classic. Read from your MT5 history, last 12 months, after commission and swap.</p><div class="list" id="flLive"></div></section>
      </div>
      <section class="card" id="flBot" aria-label="Bot detail"></section>
      <section class="card" id="flShadowLog" aria-label="Shadow"></section>
      <section class="card" aria-label="Guardian">
        <div class="hd"><h2>Guardian</h2><span class="sub">The limits every paper bot trades inside. They are the ones your engine in Classic already runs.</span></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(150px,100%),1fr))">
          <div class="tile"><span class="mono" style="font-size:24px;font-weight:600">${this.CFG.riskPct}%</span><span class="k">of the account for one R (one ATR)</span></div>
          <div class="tile"><span class="mono" style="font-size:24px;font-weight:600">${this.CFG.maxOpen}</span><span class="k">trades open at once</span></div>
          <div class="tile"><span class="mono" style="font-size:24px;font-weight:600">${this.CFG.maxSame}</span><span class="k">in markets that move together</span></div>
          <div class="tile"><span class="mono" style="font-size:24px;font-weight:600">${this.CFG.dailyLossPct}%</span><span class="k">lost in a day, then no new entries</span></div>
        </div>
        <p class="sub" style="text-wrap:pretty">Each paper bot has its own account, so two bots can hold the same index at once. Shadow adds two checks against the real account: the live spread, and whether the smallest lot fits the risk. Still to build: one shared account, the news blackout, the drawdown brake, and moving a bot back down when its record drifts from its test.</p>
      </section>`;
    el.addEventListener('click', e => { const b = e.target.closest('[data-act],[data-sel],[data-sact]'); if (!b) return; const id = b.dataset.bot || b.dataset.sel;
      if (b.dataset.sact){ if (b.dataset.sact === 'start'){ Shadow.start(id); this.sel = id; } else { if (!confirm('Stop shadow for this bot and clear its shadow notes?')) return; Shadow.stop(id); }
        T.save('fleetSel', this.sel); Shadow.sync(); this.render(); T.emit('fleet'); return; }
      if (b.dataset.act === 'start'){ this.state[id] = { since: Math.floor(Date.now() / 1000), e0: (T.health && T.health.equity) || 10000, costs: {} }; this.sel = id; }
      else if (b.dataset.act === 'stop'){ if (!confirm('Stop this paper bot and clear its paper record?')) return; delete this.state[id]; }
      else this.sel = id;
      T.save('fleet', this.state); T.save('fleetSel', this.sel); this.compute(); this.render(); T.emit('fleet'); });
    T.on('symbols', () => this.refresh()); T.on('quotes', () => { if (this.series){ Shadow.sync(); if (App.room === 'fleet'){ this.compute(); this.render(); } } });
    setInterval(() => { if (!document.hidden && T.online) this.refresh(true); }, 600000);
    this.render();
  },
  show(){ this.refresh(); },
  on(id){ return id ? !!this.state[id] : this.BOTS.some(b => this.state[b.id]); },

  /* ---- data ---- */
  async refresh(force){
    if (!T.online || this.busy || (!force && this.series && Date.now() - this.loadedAt < 600000)){ this.render(); return; }
    this.busy = true; this.render();
    try {
      const syms = T.symbols.filter(s => T.groupOf(s) === 'indices'), series = {};
      for (const s of syms){
        const j = await T.get('/candles?symbol=' + encodeURIComponent(s) + '&tf=1d&limit=2500', 20000);
        const c = (j.candles || []).map(r => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4] })).filter(b => b.open > 0 && b.close > 0);
        if (c.length < 260) continue; const cl = c.map(b => b.close), s20 = T.sma(cl, 20);
        series[s] = { c, rsi: this.rsi(cl, 2), s200: T.sma(cl, 200), s5: T.sma(cl, 5), s20, atr: T.atr(c, 20),
          sd20: cl.map((_, i) => { if (s20[i] == null) return null; let v = 0; for (let k = i - 19; k <= i; k++) v += (cl[k] - s20[i]) ** 2; return Math.sqrt(v / 20); }) };
      }
      this.series = series; this.loadedAt = Date.now(); this.compute(); await Shadow.loadSpecs(); Shadow.sync();
      const d = await T.get('/deals?days=365&entries=1', 20000), bot = {}; for (const e of d.entries || []) bot[e.position] = String(e.comment || '').replace(/^ASTRA\s*/, '') || '(untagged)';
      const by = {}; for (const x of d.deals || []){ const k = bot[x.position] || '(untagged)', o = by[k] = by[k] || { id: k, n: 0, net: 0 }; o.n++; o.net += (x.profit || 0) + (x.commission || 0) + (x.swap || 0) + (x.fee || 0); }
      this.live = Object.values(by).sort((a, b) => b.n - a.n);
    } catch(e){ console.warn('fleet', e); }
    this.busy = false; this.render(); T.emit('fleet');
  },
  rsi(a, n){ const o = new Array(a.length).fill(null); let g = 0, l = 0; for (let i = 1; i < a.length; i++){ const d = a[i] - a[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0);
    if (i <= n){ g += up / n; l += dn / n; if (i === n) o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; o[i] = 100 - 100 / (1 + g / (l || 1e-12)); } } return o; },
  cost(sym){ const sp = T.spreadPct(sym); return Math.max(sp != null && sp < 2 ? sp / 100 : 0, this.FLOOR[T.groupOf(sym)] || 0.0005) * 1.5; },

  /* ---- the replay: one account, all the bot's markets, inside the Guardian's limits ---- */
  simulate(bot, fromT, e0, costs){
    const S = this.series, C = this.CFG, ev = [];
    for (const sym in S) for (let i = 201; i < S[sym].c.length; i++) ev.push({ t: S[sym].c[i].time, sym, i });
    ev.sort((a, b) => a.t - b.t || (a.sym < b.sym ? -1 : 1));
    const pos = {}, pend = {}, trades = [], skipped = [], curve = [[fromT || (ev[0] && ev[0].t) || 0, e0]]; let eq = e0, peak = e0, dd = 0;
    for (let a = 0; a < ev.length;){
      let b = a; while (b < ev.length && ev[b].t === ev[a].t) b++; const day = ev.slice(a, b); a = b; let lostToday = 0;
      for (const { sym, i, t } of day){ const p = pos[sym]; if (!p || !p.exit) continue;                         /* 1 · exits at the open */
        const px = S[sym].c[i].open, net = px / p.pxIn - 1 - p.cost, money = p.notional * net; eq += money; if (money < 0) lostToday += money;
        trades.push({ sym, tIn: p.tIn, tOut: t, pxIn: p.pxIn, pxOut: px, r: net / p.atrPct, money, bars: i - p.inIdx }); delete pos[sym];
        peak = Math.max(peak, eq); dd = Math.max(dd, (peak - eq) / peak); curve.push([t, eq]); }
      const cand = day.filter(e => pend[e.sym]).sort((x, y) => pend[x.sym].rank - pend[y.sym].rank);              /* 2 · entries, strongest signal first */
      for (const { sym, i, t } of cand){ const open = Object.keys(pos).length, why = open >= C.maxOpen ? 'three trades already open' : open >= C.maxSame ? 'two indices already open' : lostToday <= -C.dailyLossPct / 100 * eq ? 'daily loss limit' : null;
        if (why) skipped.push({ sym, t, why });
        else { const k = sym + '|' + t, cost = costs ? (costs[k] = costs[k] != null ? costs[k] : this.cost(sym)) : this.cost(sym), atrPct = pend[sym].atrPct;
          pos[sym] = { tIn: t, inIdx: i, ei: pend[sym].ei, pxIn: S[sym].c[i].open, atrPct, cost, notional: eq * C.riskPct / 100 / atrPct }; }
        delete pend[sym]; }
      for (const { sym, i } of day){ const s = S[sym]; if (i === s.c.length - 1) continue;                         /* 3 · read the closed candle */
        const x = s.c[i].close, p = pos[sym];
        if (p){ if (x > s.s5[i] || i - p.ei >= 10) p.exit = true; }
        else if (s.c[i].time >= fromT && s.s200[i] != null && s.atr[i] && x > s.s200[i] && bot.trig(s, i)) pend[sym] = { rank: bot.rank(s, i), ei: i, atrPct: s.atr[i] / x }; }
    }
    const open = Object.entries(pos).map(([sym, p]) => { const q = T.quotes[sym], c = S[sym].c, px = (q && q.bid) || c[c.length - 1].close, net = px / p.pxIn - 1 - p.cost;
      return { sym, tIn: p.tIn, pxIn: p.pxIn, px, r: net / p.atrPct, money: p.notional * net, exit: !!p.exit }; });
    const n = trades.length, sum = k => trades.reduce((s, t) => s + t[k], 0), yrs = {};
    for (const t of trades){ const y = new Date(t.tIn * 1000).getUTCFullYear(), o = yrs[y] = yrs[y] || { n: 0, r: 0 }; o.n++; o.r += t.r; }
    const span = n ? (trades[n - 1].tOut - trades[0].tIn) / 31557600 : 0;
    return { trades, open, skipped, curve, e0, eq, n, win: n ? trades.filter(t => t.r > 0).length / n * 100 : 0, avgR: n ? sum('r') / n : 0, totR: sum('r'), dd: dd * 100,
      worst: n ? Math.min(...trades.map(t => t.r)) : 0, perYear: span > 0.2 ? n / span : null, yrs, waiting: Object.keys(pend) };
  },
  compute(){
    if (!this.series || !Object.keys(this.series).length) return;
    for (const bot of this.BOTS){ const st = this.state[bot.id], e0 = (st && st.e0) || (T.health && T.health.equity) || 10000;
      this.runs[bot.id] = { rehearsal: this.simulate(bot, 0, e0, null), paper: st ? this.simulate(bot, Math.floor(st.since / 86400) * 86400, st.e0, st.costs) : null }; }
    if (this.on()) T.save('fleet', this.state);
  },

  /* ---- drawing ---- */
  day(t){ return new Date(t * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }); },
  render(){
    const C = this.CFG, S = T.strategies(), stageOf = b => (S.find(s => s.id === b.evidence) || {}).stage || 'leaning';
    document.getElementById('flPaper').innerHTML = this.BOTS.map(b => { const on = this.on(b.id), P = (this.runs[b.id] || {}).paper, st = stageOf(b);
      return `<div class="item ${b.id === this.sel ? 'info' : ''}"><button type="button" data-sel="${b.id}" style="text-align:left;display:flex;flex-direction:column;gap:3px"><b>${b.name} <span class="tag ${st === 'proven' ? 'amber' : 'cyan'}">${st}</span></b>
        <span>${on ? `On since ${this.day(this.state[b.id].since)} · ${P ? P.n : 0} of ${C.need} closed trades${P && P.open.length ? ' · ' + P.open.length + ' open' : ''}` : 'Off. No paper record yet.'}</span></button>
        ${on ? `<div class="bar"><i style="width:${Math.max(2, Math.min(100, (P ? P.n : 0) / C.need * 100))}%"></i></div>` : ''}
        <button type="button" class="btn ${on ? '' : 'primary'}" data-act="${on ? 'stop' : 'start'}" data-bot="${b.id}" style="align-self:flex-start;margin-top:6px;min-height:40px">${on ? 'Stop and clear' : 'Start the paper record'}</button></div>`; }).join('')
      + `<div class="item"><b>SuperTrend Regime · gold and silver 4h <span class="tag amber">proven</span></b><span>Its paper bot runs in Classic. It moves here in a later stage.</span></div>`;
    document.getElementById('flLive').innerHTML = !this.live ? `<div class="empty">${T.online ? 'Reading your MT5 history…' : 'Waiting for the MT5 bridge.'}</div>`
      : this.live.length ? this.live.map(b => `<div class="item"><b style="display:flex;justify-content:space-between;gap:8px"><span>${T.esc(this.LIVE_NAMES[b.id] || b.id)}</span><span class="mono ${T.cls(b.net)}">${T.signed(b.net, 2)}</span></b>
          <div class="bar"><i style="width:${Math.max(2, Math.min(100, b.n / C.need * 100))}%;background:var(--up)"></i></div><span>${b.n} of ${C.need} closed trades${b.n < C.need ? ' · too few to judge' : ''}</span></div>`).join('')
          + `<span class="sub">All live bots together: <span class="mono ${T.cls(this.live.reduce((a, b) => a + b.net, 0))}">${T.signed(this.live.reduce((a, b) => a + b.net, 0), 2)}</span> over ${this.live.reduce((a, b) => a + b.n, 0)} trades.</span>`
        : `<div class="empty">No closed live trades in the last 12 months.</div>`;

    const B = this.BOTS.find(b => b.id === this.sel), on = this.on(B.id), run = this.runs[B.id] || {}, R = run.rehearsal, P = run.paper, ev = S.find(s => s.id === B.evidence), t5 = ev && ev.run5, el = document.getElementById('flBot');
    Shadow.render();
    if (!R){ el.innerHTML = `<div class="hd"><h2>${B.name}</h2></div><div class="empty">${!T.online ? 'Waiting for the MT5 bridge.' : 'Reading daily candles for the indices…'}</div>`; return; }
    const tile = (k, v, cls = '') => `<div class="tile"><span class="k">${k}</span><span class="mono ${cls}">${v}</span></div>`;
    const curve = (X, col) => { const p = X.curve, lo = Math.min(...p.map(x => x[1])), hi = Math.max(...p.map(x => x[1])), step = Math.max(1, Math.ceil(p.length / 300)), q = p.filter((_, i) => i % step === 0 || i === p.length - 1);
      return `<svg class="curve" viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Account size over the replay"><path d="M6 ${(140 - (X.e0 - lo) / ((hi - lo) || 1) * 130).toFixed(1)}H594" style="fill:none;stroke:#2A3A57;stroke-dasharray:3 4;vector-effect:non-scaling-stroke"></path>
        <path d="${q.map((x, i) => (i ? 'L' : 'M') + (6 + i / Math.max(1, q.length - 1) * 588).toFixed(1) + ' ' + (140 - (x[1] - lo) / ((hi - lo) || 1) * 130).toFixed(1)).join('')}" style="fill:none;stroke:${col};stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round"></path></svg>`; };
    const rows = list => list.map(t => `<tr><td class="mono">${T.esc(T.base(t.sym))}</td><td class="mute">${this.day(t.tIn)}</td><td class="mute">${t.tOut ? this.day(t.tOut) : t.exit ? 'leaves at the next open' : 'open'}</td><td class="n ${T.cls(t.r)}">${T.signed(t.r, 2)}R</td><td class="n ${T.cls(t.money)}">${T.signed(t.money, 2)}</td></tr>`).join('');
    const yearAgo = Date.now() / 1000 - 31557600, last = R.trades.filter(t => t.tIn >= yearAgo), months = R.perYear ? Math.ceil(C.need / R.perYear * 12) : null;
    el.innerHTML = `
      <div class="hd" style="align-items:flex-start"><div style="flex:1 1 300px;min-width:0"><span class="sub">Paper bot · daily candles · ${Object.keys(this.series).length} indices</span><h2 style="font-size:18px">${B.name}</h2></div>
        <a class="btn" href="#lab/${B.evidence}" style="min-height:36px">See its case in the Lab</a></div>
      <p style="color:var(--text2);text-wrap:pretty">${B.rule}</p>
      <div class="note" style="text-wrap:pretty">This rule has <b>no stop-loss</b>, because it was tested without one. One R is ${C.riskPct}% of the account, but a single trade can lose more: ${t5 && t5.worstR != null ? `in the test the worst lost ${T.num(Math.abs(t5.worstR), 1)}R and one in twenty lost more than ${T.num(Math.abs(t5.p05R), 1)}R` : 'see the worst trade below'}. Overnight financing is not charged here, because the bridge does not report it.</div>
      <div class="cols stretch">
        <div style="flex:1 1 380px;min-width:0;display:flex;flex-direction:column;gap:10px">
          <div class="hd"><h3>Paper record</h3><span class="sub">${on ? 'since ' + this.day(this.state[B.id].since) + ' · starts at ' + T.num(P.e0, 2) : 'not started'}</span></div>
          ${!on ? `<div class="empty">Start the paper record and every signal from today on is written down here, inside the Guardian's limits.${months ? ` At the pace of the replay, ${C.need} trades take about ${months} months.` : ''}</div>`
            : `<div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr))">${tile('Closed trades', P.n + ' of ' + C.need)}${tile('Result', T.signed(P.eq - P.e0, 2), T.cls(P.eq - P.e0))}${tile('R a trade', P.n ? T.signed(P.avgR, 2) + 'R' : '–', T.cls(P.avgR))}${tile('Skipped by limits', P.skipped.length)}</div>
              ${P.open.length || P.n ? `<div class="scrollx"><table class="t"><thead><tr><th>Index</th><th>In</th><th>Out</th><th class="n">R</th><th class="n">Money</th></tr></thead><tbody>${rows(P.open)}${rows(P.trades.slice(-8).reverse())}</tbody></table></div>`
                : `<div class="empty">No signal yet. ${P.waiting.length ? 'Entering at the next open: ' + P.waiting.map(s => T.base(s)).join(', ') + '.' : 'The bot is waiting for its signal.'}${months ? ` At the pace of the replay, ${C.need} trades take about ${months} months.` : ''}</div>`}`}
        </div>
        <div style="flex:1 1 380px;min-width:0;display:flex;flex-direction:column;gap:10px">
          <div class="hd"><h3>Replay on history, inside the same limits</h3><span class="sub">${R.n ? this.day(R.trades[0].tIn) + ' to today' : ''} · a rehearsal, not proof</span></div>
          ${curve(R, R.eq >= R.e0 ? '#3DDC97' : '#FF6B7A')}
          <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(110px,100%),1fr))">${tile('Trades', T.num(R.n, 0))}${tile('Won', T.num(R.win, 0) + '%')}${tile('R a trade', T.signed(R.avgR, 2) + 'R', T.cls(R.avgR))}${tile('Account', T.signed((R.eq / R.e0 - 1) * 100, 1, '%'), T.cls(R.eq - R.e0))}${tile('Deepest drop', T.num(R.dd, 1) + '%')}${tile('Worst trade', T.signed(R.worst, 1) + 'R', 'down')}${tile('Skipped by limits', T.num(R.skipped.length, 0))}${tile('Last 12 months', last.length ? last.length + ' · ' + T.signed(last.reduce((a, t) => a + t.r, 0) / last.length, 2) + 'R' : '–')}</div>
          <div class="scrollx"><table class="t"><thead><tr><th>Year</th><th class="n">Trades</th><th class="n">R a trade</th><th class="n">Total R</th></tr></thead><tbody>${Object.entries(R.yrs).map(([y, o]) => `<tr><td>${y}</td><td class="n">${o.n}</td><td class="n ${T.cls(o.r)}">${T.signed(o.r / o.n, 2)}</td><td class="n ${T.cls(o.r)}">${T.signed(o.r, 1)}</td></tr>`).join('')}</tbody></table></div>
          <p class="sub" style="text-wrap:pretty">The Lab's test took every signal on every index. This replay takes at most ${C.maxSame} at once, ${B.first} first, on one account that grows and shrinks with its results. It has no random-entry comparison, so the Lab's verdict is the one that counts.</p>
        </div>
      </div>`;
  },
};
