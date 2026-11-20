/* Timurila — Lab room: every strategy on trial, with the proof shown. */
const Lab = {
  sel: null,
  LEAGUE: [['TD13', 0.13, 0.33, 0.15], ['BOS', -0.13, 0.09, 0.08], ['UT Bot', -0.18, 0.02, 0.00], ['Squeeze', -0.15, -0.02, 0.12], ['Chandelier', -0.16, -0.03, 0.01], ['CHoCH', -0.17, -0.08, -0.20], ['RSI divergence', -0.31, -0.15, -0.10], ['TD9', -0.20, -0.18, -0.14]],

  init(){
    document.getElementById('room-lab').innerHTML = `
      <div class="head"><div><h1>Lab</h1><p>Every strategy stands in the same court. Only what beats random entries gets near real money.</p></div><div class="pills" id="lbCounts"></div></div>
      <section class="card" id="lbRun" aria-label="Research run 5"></section>
      <div class="cols">
        <section class="card" style="flex:3 1 620px" aria-label="Strategy pipeline">
          <div class="hd"><h2>Strategy pipeline</h2><span class="sub">Ideas move left to right. Nothing skips a column. Pick one to see its case.</span></div>
          <div class="board" id="lbBoard"></div>
        </section>
        <section class="card" style="flex:2 1 400px" aria-label="Evidence court" id="lbCourt"></section>
      </div>
      <section class="card" aria-label="Indicator court" id="lbSignals"></section>
      <section class="card" aria-label="How a rule earns its place">
        <div class="hd"><h2>How the proven candle rules were found</h2><span class="sub">ASTRA research run 4 · bar lengths use a log scale</span></div>
        <div class="funnel">
          <div class="tile"><span class="k">1 · Setups tested</span><b>247,680</b><div class="bar"><i style="width:100%;background:#5E6F8C"></i></div><span class="sub">Every pattern, market and timeframe combination.</span></div>
          <div class="tile"><span class="k">2 · Survived unseen data</span><b>1,068</b><div class="bar"><i style="width:56%"></i></div><span class="sub">Still worked on the 40% of history they were never fitted to.</span></div>
          <div class="tile"><span class="k">3 · What luck alone produces</span><b>93</b><div class="bar"><i style="width:37%;background:var(--down-text)"></i></div><span class="sub">Shuffled fakes that passed the same test. The bar sits above them.</span></div>
          <div class="tile" style="border:1px solid var(--amber)"><span class="k amber">4 · Rules kept</span><b class="amber">56</b><div class="bar"><i style="width:32%;background:var(--amber)"></i></div><span class="sub">13 grade A, 43 grade B. All still pay at double the spread.</span></div>
        </div>
      </section>
      <section class="card" aria-label="Signal league">
        <div class="hd"><h2>Signal league</h2><span class="sub">Average move 12 candles after each label, in ATR · measured on your instruments, 5 to 9 Nov</span></div>
        <div class="scrollx"><div class="heat"><span class="hh"></span>${this.LEAGUE.map(r => `<span class="hh">${r[0]}</span>`).join('')}
          ${['15m', '1h', '4h'].map((tf, k) => `<span class="hr mono">${tf}</span>` + this.LEAGUE.map(r => { const v = r[k + 1]; return `<span class="${v >= 0.1 ? 'g2' : v > 0 ? 'g1' : v === 0 ? 'z0' : v > -0.1 ? 'r1' : 'r2'}">${v === 0 ? '0.00' : T.signed(v, 2)}</span>`; }).join('')).join('')}</div></div>
        <p style="color:var(--text2);text-wrap:pretty">Random entries on the 1-hour chart moved between −0.04 and −0.10. Only TD13 stays positive on all three, on a small sample (210 calls on 1h). None of these is a strategy on its own.</p>
      </section>`;
    document.getElementById('lbBoard').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (b){ this.sel = b.dataset.id; history.replaceState(null, '', '#lab/' + this.sel); this.render(); } });
    this.render();
  },
  show(arg){ if (arg) this.sel = arg; this.render(); if (arg) document.getElementById('lbCourt').scrollIntoView({ block: 'nearest', behavior: T.motion() ? 'smooth' : 'auto' }); },
  all(){ return T.strategies().concat(T.queued()); },

  render(){
    const all = this.all(), R = T.research(); if (!all.find(s => s.id === this.sel)) this.sel = (all.find(s => s.isNew && s.stage === 'proven') || all.find(s => s.isNew && s.stage === 'leaning') || all.find(s => s.stage === 'proven') || all[0]).id;
    const n = k => all.filter(s => s.stage === k).length;
    document.getElementById('lbCounts').innerHTML = ['proven', 'leaning', 'queued', 'benched'].map(k => `<span class="pill" style="border-color:${T.STAGES[k].color};color:${T.STAGES[k].color};cursor:default">${n(k)} ${k}</span>`).join('');
    document.getElementById('lbBoard').innerHTML = ['queued', 'leaning', 'proven', 'benched'].map(k => `<div class="lane ${k}"><div class="lh"><i style="background:${T.STAGES[k].color}"></i><h3 style="color:${k === 'proven' ? 'var(--amber)' : 'inherit'}">${T.STAGES[k].label}</h3></div><span class="sub">${T.STAGES[k].about}</span>` +
      (all.filter(s => s.stage === k).map(s => `<button class="strat" data-id="${s.id}" aria-pressed="${s.id === this.sel}">${s.isNew ? '<span class="tag cyan new">round ' + s.runNo + '</span>' : ''}<b>${T.esc(s.name)}</b><span>${T.esc(s.line)}</span></button>`).join('') || `<div class="empty" style="padding:14px 10px;font-size:12px">Empty</div>`) + `</div>`).join('');
    this.renderRun(R); this.renderCourt(all.find(s => s.id === this.sel)); this.renderSignals();
  },

  /* run 7: the popular "advanced" indicators, each signal against a random entry (timurila/research/signals.cjs) */
  renderSignals(){
    const el = document.getElementById('lbSignals'), R = window.TIMURILA_SIGNALS; if (!el) return;
    if (!R){ el.innerHTML = '<div class="hd"><h2>Indicator court</h2><span class="sub">Not run yet: node research/signals.cjs</span></div>'; return; }
    const tfs = ['1d', '4h', '1h'], ids = [...new Set(R.tests.map(t => t.id))], by = {}; for (const t of R.tests) by[t.id + '|' + t.tf] = t;
    const wavg = (rows, pick) => { let n = 0, v = 0; for (const x of rows) if (pick(x)){ n += x.n; v += x.exR * x.n; } return n ? v / n : 0; };
    const cell = t => { if (!t) return '<span class="sub">–</span>'; const w = Math.min(50, Math.abs(t.exR) / 0.1 * 50), pos = t.exR >= 0, strong = Math.abs(t.t) >= 2, col = strong ? (pos ? 'var(--amber)' : 'var(--down-text)') : '#5E6F8C';
      return `<span title="${t.n.toLocaleString('en-US')} signals · ${T.signed(t.exR, 3)}R above a random entry (t ${t.t}) · ${T.signed(t.avgR, 3)}R a trade after the spread" style="position:relative;display:block;height:26px;border-radius:7px;background:var(--raised)">` +
        `<i style="position:absolute;top:0;bottom:0;left:50%;width:1px;background:var(--line)"></i><i style="position:absolute;top:6px;bottom:6px;${pos ? 'left:50%' : 'right:50%'};width:${w.toFixed(1)}%;border-radius:4px;background:${col}"></i>` +
        `<b class="mono" style="position:absolute;${pos ? 'right:8px' : 'left:8px'};top:5px;font-size:11.5px;font-weight:500;color:${strong ? 'var(--text)' : 'var(--text2)'}">${T.signed(t.exR, 3)}</b></span>`; };
    const proven = R.tests.filter(t => t.verdict === 'proven').length, leaning = R.tests.filter(t => t.verdict === 'leaning').length, losing = R.tests.filter(t => t.avgR < 0).length;
    const tile = (k, b, sub, col) => `<div class="tile"><span class="k">${k}</span><b${col ? ` style="color:${col}"` : ''}>${b}</b><span class="sub">${sub}</span></div>`;
    el.innerHTML = `<div class="hd"><h2>Indicator court</h2><span class="sub">Run ${R.run} · ${ids.length} signals from the most popular advanced indicators · ${(R.events / 1e6).toFixed(1)} million signals on ${R.instruments} instruments · each held ${R.horizon} candles</span></div>
      <div class="funnel">
        ${tile('Beat a random entry', proven + ' of ' + R.tests.length, leaning ? leaning + ' more are leaning.' : 'None is even leaning.', proven ? 'var(--amber)' : 'var(--down-text)')}
        ${tile('Lose money after the spread', losing + ' of ' + R.tests.length, 'Five candles is rarely enough to earn back the spread.')}
        ${tile('When most readings agree', T.signed(wavg(R.agree, x => x.bucket === 'most agree'), 3) + 'R', 'Against ' + T.signed(wavg(R.agree, x => x.bucket === 'few agree'), 3) + 'R when few agree. Agreement did not help: by then the move has often happened.')}
        ${tile('With the daily trend', T.signed(wavg(R.stream, x => x.side === 'with'), 3) + 'R', 'Against it: ' + T.signed(wavg(R.stream, x => x.side === 'against'), 3) + 'R. Taking these signals only with the trend did not help.')}
        ${tile('On shock days', T.signed(wavg(R.shock, x => x.state === 'shock'), 3) + 'R', 'Normal days: ' + T.signed(wavg(R.shock, x => x.state === 'calm'), 3) + 'R. No reliable difference in direction.')}
      </div>
      <div class="scrollx"><div style="display:grid;grid-template-columns:minmax(230px,1.5fr) repeat(3,minmax(130px,1fr));gap:6px 10px;align-items:center;min-width:680px">
        <span class="sub">Signal · bar = move above a random entry, in R, before the verdict on costs</span>${tfs.map(tf => `<span class="sub mono" style="text-align:center">${tf}</span>`).join('')}
        ${ids.map(id => { const t0 = R.tests.find(t => t.id === id); return `<span><b style="font-weight:600">${T.esc(t0.name)}</b><br><span class="sub">${T.esc(t0.how)}</span></span>` + tfs.map(tf => cell(by[id + '|' + tf])).join(''); }).join('')}
      </div></div>
      <p style="color:var(--text2);text-wrap:pretty">Amber and red bars are the few results that are unlikely to be chance (t of 2 or more); grey ones are indistinguishable from a coin. Even the best of them, the Nadaraya–Watson fade on the 1-hour chart, loses after the spread. The indicators can still help you see a market; their signals alone are not an edge. The agreement, trend and shock figures measure direction only, before costs.</p>`;
  },

  renderRun(R){
    const el = document.getElementById('lbRun');
    if (!R){ el.innerHTML = `<div class="hd"><h2>Timurila's research</h2><span class="tag">running</span></div><div class="empty">Timurila's own research run has not reported yet. It copies history for every instrument out of MT5 and tests each rule against random entries. Reload this page when it is done.</div>`; return; }
    const U = R.universe, order = ['shares', 'forex', 'crypto', 'indices', 'metals', 'energy'].filter(g => U[g]);
    el.innerHTML = `<div class="hd"><h2>Timurila's own research · rounds 5 and 6</h2><span class="sub">finished ${new Date(R.generatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · ${R.tests.length} rules · ${R.instruments} instruments with enough history</span></div>
      <div class="cols stretch">
        <div style="flex:1 1 380px;display:flex;flex-direction:column;gap:6px;color:var(--text2)">
          <p style="text-wrap:pretty">Each rule is taken as published, with its textbook settings, and is not tuned to your data. The signal is read on a closed candle, the entry is the next open, and the spread is paid one and a half times over.</p>
          <p style="text-wrap:pretty">A rule only counts for what it earns <b style="color:var(--text)">above random entries</b> on the same instrument, in the same direction, held for the same time. So a share rule gets no credit for the market simply going up.</p>
          <p style="text-wrap:pretty">To be called proven it must also hold in both halves of history, at double the spread, and with an overnight charge of ${R.financingAssumed * 100}% a night. That charge is an assumption: the bridge does not report your real swap rates.</p>
        </div>
        <div class="scrollx" style="flex:1 1 340px"><table class="t"><thead><tr><th>Market</th><th class="n">Instruments</th><th class="n">History from</th><th class="n">Typical spread</th></tr></thead><tbody>
          ${order.map(g => `<tr><td>${T.groupName(g)}</td><td class="n">${U[g].n}</td><td class="n">${U[g].typicalFrom || '–'}</td><td class="n">${T.num(U[g].spreadPct, 3)}%</td></tr>`).join('')}</tbody></table></div>
      </div>
      ${(R.studies || []).map(st => `<div style="display:flex;flex-direction:column;gap:8px"><div class="hd"><h3>${T.esc(st.title)}</h3><span class="sub">${T.esc(st.note)}</span></div>
        <div class="scrollx"><table class="t"><thead><tr><th>Setting</th><th class="n">Trades</th><th class="n">R a trade</th><th class="n">Above random</th><th class="n">t</th><th class="n">First half</th><th class="n">Second half</th></tr></thead><tbody>
        ${st.rows.map(r => `<tr${r.base ? ' style="background:var(--sel)"' : ''}><td>${T.esc(r.label)}${r.base ? ' <span class="tag cyan">the round 5 rule</span>' : ''}</td><td class="n">${T.num(r.n, 0)}</td><td class="n ${T.cls(r.avgR)}">${T.signed(r.avgR, 3)}</td><td class="n ${T.cls(r.exR)}">${T.signed(r.exR, 3)}</td><td class="n">${T.num(r.t, 1)}</td><td class="n ${T.cls(r.h1)}">${T.signed(r.h1, 3)}</td><td class="n ${T.cls(r.h2)}">${T.signed(r.h2, 3)}</td></tr>`).join('')}</tbody></table></div>
        <p class="sub" style="text-wrap:pretty">Reading it: leaving on a close above the 5-day average works at every threshold. Holding for a fixed number of days does not. So the effect is the bounce itself, and it is gone once the index has recovered.</p></div>`).join('')}`;
  },

  renderCourt(s){
    const el = document.getElementById('lbCourt'), st = T.STAGES[s.stage], t = s.run5;
    let extra = '';
    if (t && t.curve){
      const P = t.curve, lo = Math.min(0, ...P.map(p => Math.min(p[1], p[2]))), hi = Math.max(0, ...P.map(p => Math.max(p[1], p[2]))), X = i => 6 + i / Math.max(1, P.length - 1) * 588, Y = v => 140 - (v - lo) / ((hi - lo) || 1) * 130;
      const line = k => P.map((p, i) => (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p[k]).toFixed(1)).join('');
      const rows = (o, name) => Object.entries(o).map(([k, v]) => `<tr><td>${name(k)}</td><td class="n">${T.num(v.n, 0)}</td><td class="n ${T.cls(v.avgR)}">${T.signed(v.avgR, 3)}</td><td class="n ${T.cls(v.exR)}">${T.signed(v.exR, 3)}</td></tr>`).join('');
      extra = `<div><svg class="curve" viewBox="0 0 600 150" preserveAspectRatio="none" role="img" aria-label="Running total in R: the rule, and what it earned above random entries">
          <path d="M6 ${Y(0).toFixed(1)}H594" style="fill:none;stroke:#2A3A57;stroke-dasharray:3 4;vector-effect:non-scaling-stroke"></path>
          <path d="${line(1)}" style="fill:none;stroke:#4FD8F7;stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round"></path>
          <path d="${line(2)}" style="fill:none;stroke:#FFB648;stroke-width:2;vector-effect:non-scaling-stroke;stroke-linejoin:round"></path></svg>
        <div class="legend" style="margin-top:6px"><span><i style="background:var(--cyan)"></i>running total, in R (${T.signed(t.netR, 0)})</span><span><i style="background:var(--amber)"></i>the part above random entries</span><span>${t.from} to ${t.to}</span></div></div>
        <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(min(120px,100%),1fr))">
          <div class="tile"><span class="k">A trade earns</span><span class="mono ${T.cls(t.avgR)}">${T.signed(t.avgR, 3)}R</span></div>
          <div class="tile"><span class="k">Random entry earns</span><span class="mono ${T.cls(t.baseR)}">${T.signed(t.baseR, 3)}R</span></div>
          <div class="tile"><span class="k">Won</span><span class="mono">${T.num(t.win, 0)}%${t.pf != null ? ' · PF ' + T.num(t.pf, 2) : ''}</span></div>
          <div class="tile"><span class="k">Held on average</span><span class="mono">${T.num(t.avgHold, 0)} candles</span></div>
          <div class="tile"><span class="k">Months ahead of random</span><span class="mono">${t.monthsAhead} of ${t.monthsTraded}</span></div>
        </div>
        <div class="scrollx"><table class="t"><thead><tr><th>Split</th><th class="n">Trades</th><th class="n">R a trade</th><th class="n">Above random</th></tr></thead><tbody>
          ${rows({ a: t.h1, b: t.h2 }, k => t.cutLabel ? (k === 'a' ? 'Before 15 Oct 2024' : 'After 15 Oct 2024') : (k === 'a' ? 'First half' : 'Second half'))}
          ${t.long.n && t.short.n ? rows({ l: t.long, s: t.short }, k => k === 'l' ? 'Buys' : 'Sells') : ''}
          ${Object.keys(t.groups).length > 1 ? rows(t.groups, k => T.groupName(k)) : ''}
          ${rows(t.years, k => k)}</tbody></table></div>
        <p class="sub" style="text-wrap:pretty">R is the trade's net return divided by the instrument's own ATR(20) at entry. Source of the rule: ${T.esc(s.source)}.</p>`;
    }
    el.innerHTML = `<div class="hd" style="align-items:flex-start"><div style="flex:1 1 220px;min-width:0"><span class="sub">Evidence court · ${T.esc(s.origin || '')}</span><h2 style="font-size:18px;text-wrap:balance">${T.esc(s.name)}</h2>${s.universe ? `<span class="sub">${T.esc(s.universe)}</span>` : ''}</div>
        <span class="pill" style="min-height:26px;border-color:${st.color};color:${st.color};font-size:12px;font-weight:600;cursor:default">${st.label}</span></div>
      <p style="color:var(--text2);text-wrap:pretty">${T.esc(s.note)}</p>
      <div class="list" style="gap:6px">${s.checks.map(c => `<div class="check"><span class="lbl">${T.esc(c[0])}</span><span class="val">${T.esc(c[1])}</span><span class="chk ${c[2]}">${c[2] === 'pass' ? 'Pass' : c[2] === 'fail' ? 'Fail' : 'Waiting'}</span></div>`).join('')}</div>
      <div class="ruling" style="border-left-color:${st.color}"><span class="sub">Ruling</span><p style="text-wrap:pretty">${T.esc(s.verdict)}</p></div>
      ${typeof Fleet !== 'undefined' && Fleet.BOTS.some(b => b.evidence === s.id) ? `<a class="btn" href="#fleet" style="align-self:flex-start">Open its paper bot in the Fleet</a>` : ''}${extra}`;
  },
};
