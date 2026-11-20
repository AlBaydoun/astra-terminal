/* Timurila — Shadow: the step between paper and live.

   When a bot's signal comes due, Shadow writes down the order it WOULD send to the real account,
   using what is real at that moment: the live bid and ask, the account's equity, the contract size,
   the positions already open and the day's result. It then follows that order to its exit at the
   live price. It shows what paper cannot: the real spread, the delay, whether the smallest lot even
   fits the risk, and whether the limits would have let the order through.

   IT SENDS NOTHING. This file only reads /specs, /quotes, /positions and /deals (through T), and
   writes its notes to this browser's own storage. There is no order call anywhere in Timurila.

   Shadow can only see the market while Timurila is open. A signal that comes due while it is
   closed is written down as missed, because that is what would happen to a live bot run from here. */
const Shadow = {
  GUARD: { spreadX: 2, freshSec: 600 },
  state: null, specs: null, specsBusy: false,

  init(){ this.state = T.load('shadow', {}); },
  on(id){ return id ? !!this.state[id] : Object.keys(this.state).length > 0; },
  start(id){ this.state[id] = { since: Math.floor(Date.now() / 1000), tickets: [], pos: {} }; this.save(); },
  stop(id){ delete this.state[id]; this.save(); },
  save(){ T.save('shadow', this.state); },
  nowS(){ return Math.max(0, ...Object.values(T.quotes).map(q => q.time || 0)); },   /* broker clock, from the newest quote */
  async loadSpecs(){
    if (this.specs || this.specsBusy || !T.online || !Fleet.series) return; this.specsBusy = true;
    try { const j = await T.get('/specs?symbols=' + encodeURIComponent(Object.keys(Fleet.series).join(',')), 30000); this.specs = j.specs || {}; } catch(e){}
    this.specsBusy = false;
  },
  testSpread(sym){ const R = T.research(); return R && R.spreads && R.spreads[sym] != null ? R.spreads[sym] : (R && R.universe.indices ? R.universe.indices.spreadPct : 0.02); },
  openShadow(){ let n = 0; for (const id in this.state) n += Object.keys(this.state[id].pos).length; return n; },

  /* the order as it would be written right now for `sym`, with every check a live order would face */
  sheet(sym, s, i){
    const q = T.quotes[sym], sp = (this.specs || {})[sym], C = Fleet.CFG, h = T.health || {}, now = this.nowS();
    if (!q || !sp || !s.atr[i]) return null;
    const eq = h.equity || 0, riskMoney = eq * C.riskPct / 100, atr = s.atr[i], pv = sp.pointValue || 0, raw = pv ? riskMoney / (atr * pv) : 0, step = sp.volumeStep || 0.01;
    const lots = Math.floor(raw / step + 1e-9) * step, live = T.spreadPct(sym), test = this.testSpread(sym), age = now - (q.time || 0);
    const realIdx = T.positions.filter(p => T.groupOf(p.symbol) === 'indices').length, open = T.positions.length + this.openShadow(), same = realIdx + this.openShadow();
    const day0 = Math.floor(now / 86400) * 86400, dayNet = T.deals.filter(d => d.time >= day0).reduce((a, d) => a + (d.profit || 0) + (d.commission || 0) + (d.swap || 0) + (d.fee || 0), 0);
    const ago = x => x < 90 ? Math.round(x) + ' s' : x < 5400 ? Math.round(x / 60) + ' min' : x < 172800 ? Math.round(x / 3600) + ' h' : Math.round(x / 86400) + ' days';
    const checks = [
      ['Market open, price fresh', age <= this.GUARD.freshSec, 'last quote ' + ago(age) + ' ago', 'market closed or no fresh price'],
      ['Spread no wider than twice the test’s', live != null && live <= this.GUARD.spreadX * test, (live != null ? T.num(live, 3) : '–') + '% now · ' + T.num(test, 3) + '% in the test', 'spread too wide right now'],
      ['Smallest lot fits the risk', lots >= (sp.volumeMin || 0.01) - 1e-9, lots >= (sp.volumeMin || 0.01) - 1e-9 ? T.num(lots, 2) + ' lots' : 'needs ' + T.num(raw, 3) + ' · smallest is ' + T.num(sp.volumeMin, 2), 'the smallest lot is too big for this risk'],
      ['Room under the limits', open < C.maxOpen && same < C.maxSame, open + ' open in all · ' + same + ' in indices', 'the limits are already full'],
      ['Daily loss stop not hit', dayNet > -C.dailyLossPct / 100 * eq, 'today ' + T.signed(dayNet, 2), 'the daily loss stop is hit'],
    ].map(c => ({ label: c[0], pass: !!c[1], value: c[2], fail: c[3] }));
    return { sym, bid: q.bid, ask: q.ask, live, test, lots, raw, atr, pv, riskMoney, equity: eq, age, checks, allowed: checks.every(c => c.pass) };
  },

  /* look at every bot that is in shadow: close what is due, write down what is due, note what was missed */
  sync(){
    if (!this.specs || !Fleet.series || !T.health) return; let changed = false; const now = this.nowS();
    for (const bot of Fleet.BOTS){ const st = this.state[bot.id]; if (!st) continue; const since = Math.floor(st.since / 86400) * 86400, due = [];
      for (const sym in Fleet.series){ const s = Fleet.series[sym], c = s.c, L = c.length - 1, q = T.quotes[sym], fresh = q && now - (q.time || 0) <= this.GUARD.freshSec, p = st.pos[sym];
        if (p){                                                                    /* an open shadow trade: is its exit due? */
          const ei = c.findIndex(b => b.time === p.sigT); if (ei < 0) continue; let dueIdx = -1;
          for (let k = ei + 1; k <= L - 1; k++) if (c[k].close > s.s5[k] || k - ei >= 10){ dueIdx = k + 1; break; }
          if (dueIdx > 0 && fresh){ const money = (q.bid - p.pxIn) * p.lots * p.pv;
            st.tickets.push({ kind: 'exit', sym, at: now, dueT: c[dueIdx].time, lateBars: L - dueIdx, px: q.bid, open: c[dueIdx].open, live: T.spreadPct(sym), lots: p.lots, money, r: (q.bid - p.pxIn) / p.atr, status: 'closed' });
            delete st.pos[sym]; changed = true; }
          continue; }
        for (let j = Math.max(201, L - 30); j <= L - 1; j++){                       /* entries: signals on closed candles since shadow began */
          if (c[j].time < since || s.s200[j] == null || !(c[j].close > s.s200[j]) || !bot.trig(s, j)) continue;
          const dueT = c[j + 1].time; if (st.tickets.some(t => t.kind === 'entry' && t.sym === sym && t.dueT === dueT)) continue;
          if (j + 1 < L){ st.tickets.push({ kind: 'entry', sym, at: now, dueT, status: 'missed', why: 'timurila was not open that day' }); changed = true; }
          else if (fresh) due.push({ sym, s, j, rank: bot.rank(s, j) }); } }
      due.sort((a, b) => a.rank - b.rank);
      for (const d of due){ const sh = this.sheet(d.sym, d.s, d.j); if (!sh) continue; const c = d.s.c, L = c.length - 1, failed = sh.checks.filter(x => !x.pass).map(x => x.fail);
        st.tickets.push({ kind: 'entry', sym: d.sym, at: now, dueT: c[L].time, delaySec: Math.max(0, now - c[L].time), px: sh.ask, open: c[L].open, slipR: (sh.ask - c[L].open) / sh.atr, live: sh.live, test: sh.test, lots: sh.lots, raw: sh.raw,
          equity: sh.equity, status: sh.allowed ? 'written' : 'blocked', why: failed.join('; '), checks: sh.checks });
        if (sh.allowed) st.pos[d.sym] = { sigT: c[d.j].time, tIn: now, pxIn: sh.ask, lots: sh.lots, pv: sh.pv, atr: sh.atr };
        changed = true; }
      if (st.tickets.length > 400) st.tickets = st.tickets.slice(-400); }
    if (changed) this.save();
  },

  /* ---- drawing (inside the Fleet room) ---- */
  when(t){ const d = new Date(t * 1000); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }) + ' ' + d.toISOString().slice(11, 16); },
  render(){
    const lane = document.getElementById('flShadow'), log = document.getElementById('flShadowLog'); if (!lane || !log) return;
    lane.innerHTML = Fleet.BOTS.map(b => { const st = this.state[b.id], n = k => st ? st.tickets.filter(t => t.kind === 'entry' && t.status === k).length : 0;
      return `<div class="item ${st ? 'info' : ''}"><b>${b.name}</b>
        <span>${st ? `In shadow since ${Fleet.day(st.since)} · ${n('written')} written · ${n('blocked')} blocked · ${n('missed')} missed${Object.keys(st.pos).length ? ' · ' + Object.keys(st.pos).length + ' open' : ''}` : 'Not in shadow.'}</span>
        <button type="button" class="btn ${st ? '' : 'primary'}" data-sact="${st ? 'stop' : 'start'}" data-bot="${b.id}" style="align-self:flex-start;margin-top:6px;min-height:40px">${st ? 'Stop and clear' : 'Start shadow'}</button></div>`; }).join('');
    const B = Fleet.BOTS.find(b => b.id === Fleet.sel), st = this.state[B.id], S = Fleet.series;
    if (!S || !this.specs){ log.innerHTML = `<div class="hd"><h2>Shadow · ${B.name}</h2></div><div class="empty">${T.online ? 'Reading contract sizes from MT5…' : 'Waiting for the MT5 bridge.'}</div>`; return; }
    const rows = Object.keys(S).sort().map(sym => { const s = S[sym], sh = this.sheet(sym, s, s.c.length - 2); if (!sh) return ''; const sig = s.s200[s.c.length - 2] != null && s.c[s.c.length - 2].close > s.s200[s.c.length - 2] && B.trig(s, s.c.length - 2), bad = sh.checks.filter(c => !c.pass);
      return `<tr><td class="mono">${T.esc(T.base(sym))}${sig ? ' <span class="tag amber">signal today</span>' : ''}</td><td class="n ${sh.live != null && sh.live > this.GUARD.spreadX * sh.test ? 'down' : ''}">${sh.live != null ? T.num(sh.live, 3) + '%' : '–'}</td><td class="n mute">${T.num(sh.test, 3)}%</td><td class="n">${T.num(sh.raw, 3)}</td><td class="n">${T.num(sh.lots, 2)}</td>
        <td>${bad.length ? `<span class="down">no: ${bad.map(c => T.esc(c.fail)).join('; ')}</span>` : '<span class="up">yes, every check passes</span>'}</td></tr>`; }).join('');
    const ent = st ? st.tickets.filter(t => t.kind === 'entry') : [], wr = ent.filter(t => t.status === 'written'), ex = st ? st.tickets.filter(t => t.kind === 'exit') : [], avg = (a, f) => a.length ? a.reduce((s, t) => s + f(t), 0) / a.length : null;
    const tile = (k, v, c = '') => `<div class="tile"><span class="k">${k}</span><span class="mono ${c}">${v}</span></div>`, money = ex.reduce((s, t) => s + t.money, 0);
    log.innerHTML = `<div class="hd" style="align-items:flex-start"><div style="flex:1 1 300px;min-width:0"><span class="sub">Shadow · writes orders down, sends none</span><h2 style="font-size:18px">${B.name}</h2></div>
        <span class="sub">${st ? 'in shadow since ' + Fleet.day(st.since) : 'not in shadow'}</span></div>
      <div><h3 style="margin-bottom:6px">If a signal came now: the order on your real account</h3>
        <div class="scrollx"><table class="t"><thead><tr><th>Index</th><th class="n">Spread now</th><th class="n">In the test</th><th class="n">Lots for ${Fleet.CFG.riskPct}%</th><th class="n">Lots sent</th><th>Would it go through</th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="sub" style="margin-top:6px;text-wrap:pretty">Worked out from your equity of ${T.num((T.health || {}).equity, 2)}, each index's own ATR and contract size, and the live quote. Margin is not checked.</p></div>
      ${!st ? `<div class="empty">Start shadow and each signal is written down here as a real order would be, the moment it comes due. Nothing is sent to your broker.</div>` : `
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr))">${tile('Orders written', wr.length)}${tile('Blocked by a check', ent.filter(t => t.status === 'blocked').length)}${tile('Missed while closed', ent.filter(t => t.status === 'missed').length)}${tile('Real spread, average', avg(wr, t => t.live) != null ? T.num(avg(wr, t => t.live), 3) + '%' : '–')}${tile('Paid against the open', avg(wr, t => t.slipR) != null ? T.signed(avg(wr, t => t.slipR), 2) + 'R' : '–')}${tile('Shadow result', ex.length ? T.signed(money, 2) : '–', T.cls(money))}</div>
        ${st.tickets.length ? `<div class="scrollx" style="max-height:360px;overflow-y:auto"><table class="t"><thead><tr><th>Written</th><th>Index</th><th>Order</th><th class="n">Lots</th><th class="n">Price</th><th class="n">Spread</th><th>Outcome</th></tr></thead><tbody>
          ${st.tickets.slice().reverse().map(t => `<tr><td class="mute">${this.when(t.at)}</td><td class="mono">${T.esc(T.base(t.sym))}</td><td>${t.kind === 'entry' ? 'Buy' : 'Sell to close'}</td><td class="n">${t.lots != null ? T.num(t.lots, 2) : '–'}</td><td class="n">${t.px != null ? T.num(t.px, 1) : '–'}</td><td class="n">${t.live != null ? T.num(t.live, 3) + '%' : '–'}</td>
            <td>${t.status === 'written' ? `<span class="up">written</span>${t.delaySec != null ? ' · ' + (t.delaySec < 5400 ? Math.round(t.delaySec / 60) + ' min' : Math.round(t.delaySec / 3600) + ' h') + ' after the open' : ''}` : t.status === 'closed' ? `<span class="${T.cls(t.money)} mono">${T.signed(t.money, 2)}</span> · ${T.signed(t.r, 2)}R${t.lateBars ? ' · ' + t.lateBars + ' day' + (t.lateBars === 1 ? '' : 's') + ' late' : ''}` : `<span class="down">${t.status}</span> · ${T.esc(t.why || '')}`}</td></tr>`).join('')}</tbody></table></div>`
          : `<div class="empty">Nothing written yet. Shadow is waiting for a signal to come due while Timurila is open.</div>`}`}
      <p class="sub" style="text-wrap:pretty">Shadow only sees the market while Timurila is open. A signal that comes due on a day it is closed is written down as missed, because that is what would happen to a live bot run from this page.</p>`;
  },
};
