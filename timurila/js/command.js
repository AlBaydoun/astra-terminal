/* Timurila — Command room: where things stand, in one screen. Everything shown is read live
   from the MT5 bridge (account, positions, closed deals, quotes) or from the evidence on file. */
const Command = {
  RINGS: [['shares', 1.0, 0.020], ['forex', 0.83, -0.030], ['crypto', 0.67, 0.045], ['indices', 0.53, -0.060], ['metals', 0.39, 0.080], ['energy', 0.26, -0.100]],
  LEVELS: [['Manual', 'You place every trade. Timurila watches, explains and keeps the journal.', true],
    ['Advisor', 'Timurila proposes each trade with entry, stop and target. You decide.', false],
    ['Paper', 'Bots trade by themselves with pretend money at real prices.', true],
    ['Shadow', 'Bots write down the orders they would send to the real account.', true],
    ['Live', 'Real orders, only through your four typed gates in Classic.', false]],
  t: 0, lastFrame: 0, dots: [], hot: null,

  init(){
    const el = document.getElementById('room-command');
    el.innerHTML = `
      <div class="head"><div><h1>Command</h1><p>Where things stand right now.</p></div><span class="sub" id="cmStamp"></span></div>
      <section class="card" aria-label="Autopilot">
        <div class="hd"><h2>Autopilot</h2><span class="sub" id="cmAutoSub"></span></div>
        <div class="auto" id="cmAuto"></div>
      </section>
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
    this.cv = document.getElementById('cmMap'); this.ctx = this.cv.getContext('2d');
    new ResizeObserver(() => this.sizeMap()).observe(this.cv); this.sizeMap();
    this.cv.addEventListener('pointermove', e => { const r = this.cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 100;
      for (const d of this.dots){ const q = (d.x - x) ** 2 + (d.y - y) ** 2; if (q < bd){ bd = q; best = d; } } this.hot = best; this.tip(); });
    this.cv.addEventListener('pointerleave', () => { this.hot = null; this.tip(); });
    this.cv.addEventListener('click', () => { if (this.hot){ Markets.open(this.hot.s); location.hash = '#markets'; } });
    document.getElementById('cmAuto').addEventListener('click', e => { if (e.target.closest('button:not([disabled])')) location.hash = '#fleet'; });
    T.on('fleet', () => { this.renderAuto(); this.renderLists(); }); this.renderAuto();
    T.on('health', () => this.renderAccount()); T.on('account', () => { this.renderAccount(); this.renderLists(); });
    T.on('symbols', () => { this.buildDots(); this.renderLists(); }); T.on('quotes', () => this.renderLegend());
    this.renderAccount(); this.renderLists(); this.renderLegend();
    const loop = now => { requestAnimationFrame(loop); if (App.room !== 'command' || document.hidden) return;
      if (now - this.lastFrame < 33) return; const dt = this.lastFrame ? Math.min(0.1, (now - this.lastFrame) / 1000) : 0; this.lastFrame = now;
      if (T.motion() && !this.hot) this.t += dt; this.drawMap(now); };
    requestAnimationFrame(loop);
  },
  show(){ this.lastFrame = 0; this.sizeMap(); this.renderAuto(); },
  renderAuto(){
    const paper = typeof Fleet !== 'undefined' && Fleet.on(), nOn = paper ? Fleet.BOTS.filter(b => Fleet.on(b.id)).length : 0, nSh = typeof Shadow !== 'undefined' ? Fleet.BOTS.filter(b => Shadow.on(b.id)).length : 0, level = nSh ? 3 : paper ? 2 : 0;
    document.getElementById('cmAutoSub').textContent = nSh ? 'Shadow: ' + nSh + ' bot' + (nSh === 1 ? ' is' : 's are') + ' writing down real-account orders without sending them' + (nOn ? ', and ' + nOn + ' on paper' : '') + '. Live stays in Classic.' : paper ? 'Paper: ' + nOn + ' bot' + (nOn === 1 ? ' is' : 's are') + ' keeping a paper record. Live stays in Classic.' : 'Manual: no bot is running here. Start one in the Fleet. Live stays in Classic.';
    document.getElementById('cmAuto').innerHTML = this.LEVELS.map((l, i) => `<button type="button" aria-pressed="${i === level}" ${l[2] ? '' : 'disabled'}><b>${l[0]}</b><span>${l[1]}</span></button>`).join('');
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
    document.getElementById('cmLegend').innerHTML = this.RINGS.filter(r => counts[r[0]]).map(r => `<span>${T.groupName(r[0])} <b class="mono" style="color:var(--text)">${counts[r[0]]}</b></span>`).join('') +
      `<span><i style="background:var(--up)"></i>up today</span><span><i style="background:var(--down)"></i>down today</span><span><i style="background:var(--amber)"></i>a proven strategy is on file</span><span>rings run from shares (outside) to energy (inside)</span>`;
  },

  /* ---- the market map ---- */
  buildDots(){
    const S = T.strategies().filter(x => x.stage === 'proven' && x.match), by = {};
    for (const s of T.symbols) (by[T.groupOf(s)] = by[T.groupOf(s)] || []).push(s);
    this.dots = [];
    this.RINGS.forEach(([g, rf, w]) => (by[g] || []).sort().forEach((s, k, a) => this.dots.push({ s, g, rf, w, a0: k / a.length * Math.PI * 2, proven: S.some(x => x.match(s)), x: -99, y: -99 })));
  },
  sizeMap(){ const r = this.cv.getBoundingClientRect(), d = window.devicePixelRatio || 1; if (!r.width) return; this.mw = r.width; this.mh = r.height;
    this.cv.width = Math.round(r.width * d); this.cv.height = Math.round(r.height * d); this.ctx.setTransform(d, 0, 0, d, 0, 0); this.drawMap(performance.now()); },
  drawMap(now){
    const ctx = this.ctx, W = this.mw, H = this.mh; if (!W) return; ctx.clearRect(0, 0, W, H);
    const tilt = 0.44, cx = W / 2, cy = H * 0.5, RM = Math.min(W * 0.47, H * 0.48 / tilt);
    for (const [, rf] of this.RINGS){ ctx.beginPath(); ctx.ellipse(cx, cy, RM * rf, RM * rf * tilt, 0, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(79,216,247,.16)'; ctx.lineWidth = 1; ctx.stroke(); }
    const pulse = 0.5 + 0.5 * Math.sin(now / 420), sel = typeof Markets !== 'undefined' ? Markets.sym : null;
    for (const d of this.dots){ const a = d.a0 + d.w * this.t; d.depth = Math.sin(a); d.x = cx + RM * d.rf * Math.cos(a); d.y = cy + RM * d.rf * tilt * d.depth; }
    const dot = d => { const q = T.quotes[d.s], pct = q ? q.pct : null, near = (d.depth + 1) / 2, r = (d.g === 'shares' ? 2.3 : 3.2) * (0.72 + 0.5 * near), mag = pct == null ? 0 : Math.min(1, Math.abs(pct) / 2);
      ctx.globalAlpha = 0.42 + 0.58 * near;
      if (d.proven){ ctx.beginPath(); ctx.arc(d.x, d.y, r + 3.5 + pulse * 2.5, 0, Math.PI * 2); ctx.strokeStyle = 'rgba(255,182,72,' + (0.35 + 0.45 * pulse) + ')'; ctx.lineWidth = 1.4; ctx.stroke(); }
      ctx.beginPath(); ctx.arc(d.x, d.y, r, 0, Math.PI * 2);
      ctx.fillStyle = pct == null ? '#5E6F8C' : pct >= 0 ? `rgb(${Math.round(94 - 33 * mag)},${Math.round(150 + 70 * mag)},${Math.round(140 + 11 * mag)})` : `rgb(${Math.round(170 + 85 * mag)},${Math.round(120 - 13 * mag)},${Math.round(135 - 13 * mag)})`;
      if (mag > 0.5){ ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 8 * mag; } ctx.fill(); ctx.shadowBlur = 0;
      if (d.s === sel || d === this.hot){ ctx.beginPath(); ctx.arc(d.x, d.y, r + 3, 0, Math.PI * 2); ctx.strokeStyle = '#EAF1FB'; ctx.lineWidth = 1.5; ctx.globalAlpha = 1; ctx.stroke(); } };
    this.dots.filter(d => d.depth < 0).forEach(dot); ctx.globalAlpha = 1;
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, RM * 0.2); g.addColorStop(0, 'rgba(79,216,247,.55)'); g.addColorStop(0.35, 'rgba(79,216,247,.16)'); g.addColorStop(1, 'rgba(79,216,247,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, RM * 0.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#EAF1FB'; ctx.font = '600 20px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace'); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(T.symbols.length || ''), cx, cy);
    this.dots.filter(d => d.depth >= 0).forEach(dot); ctx.globalAlpha = 1;
  },
  tip(){
    const el = document.getElementById('cmTip'), d = this.hot; el.classList.toggle('on', !!d); this.cv.style.cursor = d ? 'pointer' : 'crosshair'; if (!d) return;
    const q = T.quotes[d.s]; el.style.left = d.x + 'px'; el.style.top = d.y + 'px';
    el.innerHTML = `<b class="mono">${T.esc(T.base(d.s))}</b> · ${T.groupName(d.g)}${q ? ` · <span class="mono ${T.cls(q.pct)}">${T.signed(q.pct, 2, '%')}</span>` : ''}${d.proven ? ' · <span class="amber">★ proven on file</span>' : ''}`;
  },
};
