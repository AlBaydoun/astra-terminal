/* Timurila — Command room: where things stand, in one screen. Everything shown is read live
   from the MT5 bridge (account, positions, closed deals, quotes) or from the evidence on file. */
const Command = {
  LEVELS: [['Manual', 'You place every trade. Timurila watches, explains and keeps the journal.', true],
    ['Advisor', 'Timurila proposes each trade from the tested rules. You decide and place it yourself.', true],
    ['Paper', 'Bots trade by themselves with pretend money at real prices.', true],
    ['Shadow', 'Bots write down the orders they would send to the real account.', true],
    ['Live', 'Real orders stay in Classic, behind your four typed gates. Timurila sends none.', false]],

  init(){
    const el = document.getElementById('room-command');
    el.innerHTML = `
      <div class="head"><div><h1>Command</h1><p>Where things stand right now.</p></div><span class="sub" id="cmStamp"></span></div>
      <section class="card" aria-label="Autopilot">
        <div class="hd"><h2>Autopilot</h2><span class="sub" id="cmAutoSub"></span></div>
        <div class="auto" id="cmAuto"></div>
      </section>
      <section class="card" id="cmAdvisor" aria-label="Advisor" style="display:none"></section>
      <div class="cols stretch">
        <section class="card equity" style="flex:1 1 320px" aria-label="Account" id="cmAccount"></section>
        <section class="card" style="flex:2 1 520px" aria-label="Market map">
          <div class="hd"><h2>Market map</h2><span class="sub" id="cmMapSub"></span></div>
          <div class="mapWrap"><canvas id="cmMap"></canvas><div class="tip" id="cmTip"></div></div>
          <div class="legend" id="cmLegend"></div>
        </section>
      </div>
      <div class="cols stretch">
        <section class="card" style="flex:1 1 360px" aria-label="Needs you"><div class="hd"><h2>Needs you</h2></div><div class="list" id="cmNeeds"></div></section>
        <section class="card" style="flex:1 1 360px" aria-label="Earned its place"><div class="hd"><h2>Earned its place</h2><span class="sub">beat random entries, with proof</span></div><div class="list" id="cmProven"></div></section>
        <section class="card" style="flex:1 1 300px" aria-label="Benched"><div class="hd"><h2>Benched</h2><span class="sub">tested, no edge found</span></div><div class="list" id="cmBenched"></div></section>
      </div>`;
    this.map = new MarketMap(document.getElementById('cmMap'), document.getElementById('cmTip'), {
      quote: sym => T.quotes[sym], group: sym => T.groupOf(sym), groupName: g => T.groupName(g), base: sym => T.base(sym), motion: () => T.motion(),
      proven: sym => T.strategies().some(x => x.stage === 'proven' && x.match && x.match(sym)), selected: () => Markets.sym, active: () => App.room === 'command',
      onPick: sym => { Markets.open(sym); location.hash = '#markets'; } });
    document.getElementById('cmAuto').addEventListener('click', e => { const b = e.target.closest('button:not([disabled])'); if (!b) return;
      if (b.dataset.lv === '1'){ T.save('advisor', !T.load('advisor', false)); this.renderAuto(); this.renderAdvisor(); } else if (b.dataset.lv !== '0') location.hash = '#fleet'; });
    T.on('fleet', () => { this.renderAuto(); this.renderLists(); this.renderAdvisor(); }); this.renderAuto(); this.renderAdvisor();
    T.on('health', () => this.renderAccount()); T.on('account', () => { this.renderAccount(); this.renderLists(); });
    T.on('symbols', () => { this.map.build(T.symbols); this.renderLists(); }); T.on('quotes', () => { this.renderLegend(); this.renderAdvisor(); });
    this.renderAccount(); this.renderLists(); this.renderLegend();
  },
  show(){ this.map.resize(); this.renderAuto(); this.renderAdvisor(); },
  renderAuto(){
    const paper = typeof Fleet !== 'undefined' && Fleet.on(), nOn = paper ? Fleet.BOTS.filter(b => Fleet.on(b.id)).length : 0, nSh = typeof Shadow !== 'undefined' ? Fleet.BOTS.filter(b => Shadow.on(b.id)).length : 0, adv = T.load('advisor', false), level = nSh ? 3 : paper ? 2 : adv ? 1 : 0;
    document.getElementById('cmAutoSub').textContent = nSh ? 'Shadow: ' + nSh + ' bot' + (nSh === 1 ? ' is' : 's are') + ' writing down real-account orders without sending them' + (nOn ? ', and ' + nOn + ' on paper' : '') + '. Live stays in Classic.' : paper ? (adv ? 'Advisor is on. ' : '') + 'Paper: ' + nOn + ' bot' + (nOn === 1 ? ' is' : 's are') + ' keeping a paper record. Live stays in Classic.' : adv ? 'Advisor: Timurila lists the trades its tested rules propose today. You place them yourself in Classic.' : 'Manual: no bot is running here. Start one in the Fleet. Live stays in Classic.';
    document.getElementById('cmAuto').innerHTML = this.LEVELS.map((l, i) => `<button type="button" data-lv="${i}" aria-pressed="${i === level || (i === 1 && adv)}" ${l[2] ? '' : 'disabled'}><b>${l[0]}${l[2] ? '' : ' <span class="tag">in Classic only</span>'}</b><span>${l[1]}</span></button>`).join('');
  },

  /* ---- Advisor: what the tested rules propose today, for you to place by hand ---- */
  renderAdvisor(){
    const el = document.getElementById('cmAdvisor'), on = T.load('advisor', false); el.style.display = on ? '' : 'none'; if (!on) return;
    const S = typeof Fleet !== 'undefined' ? Fleet.series : null, ready = S && typeof Shadow !== 'undefined' && Shadow.specs, rows = [];
    if (ready) for (const bot of Fleet.BOTS) for (const sym of Object.keys(S).sort()){ const s = S[sym], j = s.c.length - 2;
      if (s.s200[j] == null || !(s.c[j].close > s.s200[j]) || !bot.trig(s, j)) continue; const sh = Shadow.sheet(sym, s, j); if (sh) rows.push({ bot, sym, sh }); }
    el.innerHTML = `<div class="hd"><h2>Advisor · proposals for today</h2><span class="sub">from the rules that passed or lean in the Lab · you decide, and place them yourself in Classic</span></div>` +
      (!ready ? `<div class="empty">${T.online ? 'Reading the indices…' : 'Waiting for the MT5 bridge.'}</div>`
      : rows.length ? `<div class="scrollx"><table class="t"><thead><tr><th>Rule</th><th>Index</th><th>Proposal</th><th class="n">Lots for ${Fleet.CFG.riskPct}%</th><th class="n">Ask now</th><th>Leave when</th><th>Checks</th></tr></thead><tbody>` +
          rows.map(r => `<tr><td>${T.esc(r.bot.name)}</td><td class="mono">${T.esc(T.base(r.sym))}</td><td>Buy</td><td class="n">${T.num(r.sh.lots, 2)}</td><td class="n">${T.num(r.sh.ask, 1)}</td><td>a close above the 5-day average, or after 10 days</td>
            <td>${r.sh.allowed ? '<span class="up">all pass</span>' : '<span class="down">' + r.sh.checks.filter(c => !c.pass).map(c => T.esc(c.fail)).join('; ') + '</span>'}</td></tr>`).join('') + `</tbody></table></div>
          <p class="sub" style="text-wrap:pretty">These rules have no stop-loss; see their cases in the Lab before acting. Timurila does not place anything.</p>`
        : `<div class="empty">No proposal today. The dip rules are waiting for an index to close below its trigger while still above its 200-day average.</div>`);
  },

  /* ---- account ---- */
  renderAccount(){
    const el = document.getElementById('cmAccount'), h = T.health;
    document.getElementById('cmStamp').textContent = T.online ? 'Live from ' + (h.server || 'MT5') : 'MT5 bridge offline';
    if (!h){ el.innerHTML = `<div class="hd"><h2>Account</h2></div><div class="empty">${T.online ? 'Reading the account…' : 'The MT5 bridge is not answering. Start it with START-MT5-Bridge.bat; this fills in by itself.'}</div>`; return; }
    const net = d => (d.profit || 0) + (d.commission || 0) + (d.swap || 0) + (d.fee || 0);
    const nowS = Math.max(0, ...Object.values(T.quotes).map(q => q.time || 0)) || Date.now() / 1000, day0 = Math.floor(nowS / 86400) * 86400;
    const today = T.deals.filter(d => d.time >= day0), dayNet = today.reduce((a, d) => a + net(d), 0), float = T.positions.reduce((a, p) => a + (p.profit || 0) + (p.swap || 0), 0);
    const asc = T.deals.slice().sort((a, b) => a.time - b.time); let cum = 0; const pts = [0].concat(asc.map(d => cum += net(d)));
    const lo = Math.min(...pts), hi = Math.max(...pts), sx = i => 4 + i / Math.max(1, pts.length - 1) * 292, sy = v => 62 - (v - lo) / ((hi - lo) || 1) * 54;
    const path = pts.map((v, i) => (i ? 'L' : 'M') + sx(i).toFixed(1) + ' ' + sy(v).toFixed(1)).join(''), ccy = T.esc(h.currency || '');
    el.innerHTML = `<div class="hd"><h2>Equity</h2><span class="sub">${ccy} · ${T.online ? 'live' : 'last reading'}</span></div>
      <div><div class="big">${T.num(h.equity, 2)}</div><span class="sub">balance ${T.num(h.balance, 2)} · free margin ${T.num(h.margin_free, 2)}</span></div>
      <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(130px,100%),1fr))">
        <div class="tile"><span class="k">Closed today</span><span class="mono ${T.cls(dayNet)}">${today.length ? T.signed(dayNet, 2) : '0.00'}</span><span class="k">${today.length} trade${today.length === 1 ? '' : 's'}</span></div>
        <div class="tile"><span class="k">Open now</span><span class="mono ${T.cls(float)}">${T.positions.length ? T.signed(float, 2) : '0.00'}</span><span class="k">${T.positions.length} position${T.positions.length === 1 ? '' : 's'}</span></div>
      </div>
      ${asc.length > 1 ? `<div><svg class="spark" viewBox="0 0 300 70" preserveAspectRatio="none" role="img" aria-label="Closed-trade result over the last 35 days">
        <path d="M4 ${sy(0).toFixed(1)}H296" style="fill:none;stroke:#2A3A57;stroke-width:1;stroke-dasharray:3 4"></path>
        <path d="${path}" style="fill:none;stroke:${cum >= 0 ? '#3DDC97' : '#FF6B7A'};stroke-width:2;stroke-linejoin:round;vector-effect:non-scaling-stroke"></path></svg>
        <span class="sub">Closed trades, last 35 days: <span class="mono ${T.cls(cum)}">${T.signed(cum, 2)}</span> over ${asc.length} trades, after commission and swap</span></div>`
        : `<span class="sub">No closed trades in the last 35 days.</span>`}
      ${T.deals.length ? `<div><h3 style="margin-bottom:6px">Last closed trades</h3><table class="t"><tbody>${T.deals.slice(0, 6).map(d => `<tr><td class="mono">${T.esc(T.base(d.symbol))}</td><td class="mute">${new Date(d.time * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</td><td class="n ${T.cls(net(d))}">${T.signed(net(d), 2)}</td></tr>`).join('')}</tbody></table></div>` : ''}`;
  },

  /* ---- the lists ---- */
  renderLists(){
    const S = T.strategies(), R = T.research(), needs = [];
    if (!T.online) needs.push(['warn', 'The MT5 bridge is offline', 'Prices, the account and the charts need it. Start START-MT5-Bridge.bat.', null]);
    const naked = T.positions.filter(p => !p.sl);
    if (naked.length) needs.push(['warn', naked.length + ' open position' + (naked.length === 1 ? ' has' : 's have') + ' no stop-loss', [...new Set(naked.map(p => T.base(p.symbol)))].join(', '), null]);
    if (R){ const c = k => R.tests.filter(t => t.verdict === k).length;
      needs.push(['info', 'The research is in', `${R.tests.length} rules tested on ${R.instruments} instruments: ${c('proven')} proven, ${c('leaning')} leaning, ${R.tests.length - c('proven') - c('leaning')} benched. Open the Lab for the proof.`, '#lab']); }
    else needs.push(['info', 'The research has not reported yet', 'Timurila is testing trend following, dip buying, turn of the month, share rotation and pairs on your own instruments.', '#lab']);
    const snap = S.find(s => s.id === 'p_snap'), lead = S.filter(s => s.isNew && s.stage !== 'benched');
    if (snap && snap.downgraded) needs.push(['warn', 'Indices snap-back did not hold on older history', 'It beat chance in the last two years but not in the five before. Timurila has moved it from proven to leaning.', '#lab/p_snap']);
    else if (snap) needs.push(['info', 'A proven idea has no bot yet', 'The indices snap-back passed every test on charts. Nothing trades it.', '#lab/p_snap']);
    if (lead.length && typeof Fleet !== 'undefined' && !Fleet.on()) needs.push(['info', 'No paper record is running yet', 'The paper bots for the dip rules are ready in the Fleet. Each needs 40 closed trades before it can be judged.', '#fleet']);
    for (const s of lead) needs.push(['info', (s.stage === 'proven' ? 'New and proven: ' : 'One new lead: ') + s.name, s.line, '#lab/' + s.id]);
    document.getElementById('cmNeeds').innerHTML = needs.map(n => n[3] ? `<a class="item ${n[0]}" href="${n[3]}"><b>${T.esc(n[1])}</b><span>${T.esc(n[2])}</span></a>` : `<div class="item ${n[0]}"><b>${T.esc(n[1])}</b><span>${T.esc(n[2])}</span></div>`).join('');
    const row = s => `<a class="item ${s.stage === 'proven' ? 'proven' : ''}" href="#lab/${s.id}"><b>${T.esc(s.name)}${s.isNew ? ' <span class="tag cyan">round ' + s.runNo + '</span>' : ''}</b><span>${T.esc(s.line)}</span></a>`;
    document.getElementById('cmProven').innerHTML = S.filter(s => s.stage === 'proven').map(row).join('') || `<div class="empty">Nothing has earned its place yet.</div>`;
    document.getElementById('cmBenched').innerHTML = S.filter(s => s.stage === 'benched').map(row).join('') || `<div class="empty">Nothing benched.</div>`;
  },
  renderLegend(){
    const counts = {}; for (const s of T.symbols){ const g = T.groupOf(s); counts[g] = (counts[g] || 0) + 1; }
    document.getElementById('cmMapSub').textContent = T.symbols.length ? T.symbols.length + ' instruments, live from your MT5 · point at one, click to open it' : 'waiting for the MT5 bridge';
    document.getElementById('cmLegend').innerHTML = MarketMap.RINGS.filter(r => counts[r[0]]).map(r => `<span>${T.groupName(r[0])} <b class="mono" style="color:var(--text)">${counts[r[0]]}</b></span>`).join('') +
      `<span><i style="background:var(--up)"></i>up today</span><span><i style="background:var(--down)"></i>down today</span><span><i style="background:var(--amber)"></i>a proven strategy is on file</span><span>rings run from shares (outside) to energy (inside)</span>`;
  },
};
