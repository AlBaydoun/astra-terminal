/* ASTRA Terminal — the Strategy Checker page.
   Opened like the Deep Dive: start with every signal ever measured, press a
   signal, then a market, a pair, a timeframe, a side, an hour, a context — at
   every step the whole picture of what is left. The target and the stop you
   pick at the top decide what "won" and "failed" mean everywhere on the page. */
Object.assign(Checker, {
  dirty: true, path: null, _model: null, _modelKey: '',

  DIMS: [
    { id: 'family', label: 'Kind', of: (r) => Checker.sigMeta(Checker.sigList[r.sig]).family, name: v => ({ candles: 'Candle patterns', indicators: 'Indicator signals', research: 'Strategies from research', bots: 'Your bots' })[v] || v },
    { id: 'sig', label: 'Signal', of: r => Checker.sigList[r.sig], name: v => Checker.sigMeta(v).label },
    { id: 'market', label: 'Market', of: r => r.market, name: v => Checker.marketLabel(v) },
    { id: 'sym', label: 'Pair', of: r => r.sym, name: v => (typeof BotMarkets !== 'undefined' ? BotMarkets.short(v) : baseAsset(v)) },
    { id: 'tf', label: 'Timeframe', of: r => r.tf, name: v => v, order: ['5m', '15m', '1h', '4h', '1d'] },
    { id: 'side', label: 'Side', of: r => r.dir > 0 ? 'buy' : 'sell', name: v => v === 'buy' ? 'Buy signals' : 'Sell signals' },
    { id: 'hour', label: 'Hour (your time)', of: r => String(new Date(r.time * 1000).getHours()).padStart(2, '0'), name: v => v + ':00', order: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0')) },
    { id: 'dow', label: 'Weekday', of: r => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][new Date(r.time * 1000).getDay()], name: v => v, order: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] },
    { id: 'ctx', label: 'Market context', multi: true, name: v => Checker.FILTERS[+v] ? Checker.FILTERS[+v][1] : v },
  ],
  dim(id){ return this.DIMS.find(d => d.id === id); },

  /* the doll as a filter */
  pass(){
    const P = this.load().path || [];
    if (!P.length) return null;
    return { row: r => P.every(f => f.dim === 'ctx' ? !!(r.mask & (1 << +f.value)) : this.dim(f.dim).of(r) === f.value) };
  },

  /* one pass over the doll: the hero numbers, every split, every bucket */
  model(){
    const S = this.load();
    const key = [this.version, JSON.stringify(S.path), S.t, S.s, S.conf, S.minN].join('|');
    if (this._model && this._modelKey === key) return this._model;
    const t = S.t, s = S.s, TL = this.TH.length, SL = this.ST.length, U = this.U8;
    const hero = this.newAcc();
    const splits = {}; for (const d of this.DIMS) splits[d.id] = new Map();
    const buckets = new Map();            /* sig|market|tf → full acc */
    const perSig = new Map();             /* sig → full acc */
    const tHist = new Int32Array(24);     /* candles to target, for the chosen pair */
    const light = () => ({ n: 0, w: 0, l: 0, bars: 0, over: 0, cost: 0, nA: 0, wA: 0, nB: 0, wB: 0, sec: 0 });
    const addLight = (m, k, win, loss, fb, mfe, cost, first, sec) => {
      let a = m.get(k); if (!a){ a = light(); m.set(k, a); }
      a.n++; a.cost += cost; a.sec += sec; if (first) a.nA++; else a.nB++;
      if (win){ a.w++; a.bars += fb; a.over += mfe - this.TH[t]; if (first) a.wA++; else a.wB++; } else if (loss) a.l++;
    };
    this.each(this.pass(), (row, ch, r) => {
      this.addRow(hero, ch, r, row.time);
      const o = r * U, fb = ch.u8[o + 1 + t], ab = ch.u8[o + 1 + TL + s];
      const win = fb && (!ab || fb < ab), loss = !win && !!ab, mfe = ch.i16[r * 6 + 1] / 100, first = row.time < (ch.from + ch.to) / 2, sec = this.TF_SEC[ch.tf] || 900;
      if (win) tHist[Math.min(23, fb - 1)]++;
      for (const d of this.DIMS){
        if (d.multi){ for (let b = 0; b < this.FILTERS.length; b++) if (row.mask & (1 << b)) addLight(splits.ctx, String(b), win, loss, fb, mfe, ch.costPct, first, sec); }
        else addLight(splits[d.id], d.of(row), win, loss, fb, mfe, ch.costPct, first, sec);
      }
      const sigId = this.sigList[row.sig];
      const bk = sigId + '|' + ch.market + '|' + ch.tf;
      let b = buckets.get(bk); if (!b){ b = this.newAcc(); b.key = { sig: sigId, market: ch.market, tf: ch.tf }; buckets.set(bk, b); }
      this.addRow(b, ch, r, row.time);
      let ps = perSig.get(sigId); if (!ps){ ps = this.newAcc(); perSig.set(sigId, ps); }
      this.addRow(ps, ch, r, row.time);
    });
    /* recommendations: the best target/stop for every signal × market × timeframe that holds up */
    const recs = [];
    for (const b of buckets.values()){
      const c = this.best(b, S.minN); if (!c || !c.holds || c.expLo <= 0 || c.edge == null || c.edge < 5 || c.edgeExp <= 0) continue;
      const easy = this.easy(b, s, S.conf);
      recs.push({ ...b.key, acc: b, c, easy, score: Math.min(c.expLo, c.edgeExp) });
    }
    recs.sort((a, b) => b.score - a.score);
    this._model = { hero, splits, recs, perSig, tHist, key };
    this._modelKey = key;
    return this._model;
  },

  /* ================= page ================= */
  view(){
    const S = this.load();
    if (!this.loaded) return '<div class="ckWrap"><div class="empty">Opening the checker’s memory…</div></div>';
    const M = this.model();
    const P = S.path || [];
    const crumbs = [`<button class="exCrumb${P.length ? '' : ' on'}" data-ckcrumb="-1">Everything</button>`]
      .concat(P.map((f, i) => `<i>›</i><button class="exCrumb${i === P.length - 1 ? ' on' : ''}" data-ckcrumb="${i}">${esc(this.dim(f.dim).label)}: ${esc(f.label)}</button>`)).join('');
    /* one faulty section must never take the whole page down */
    const safe = (fn) => { try { return fn(); } catch(e){ console.warn('ASTRA checker section:', e); return '<div class="empty">This part could not be drawn: ' + esc(e.message) + '</div>'; } };
    const secs = [
      ['recs', '🏆 What to do — the recommendations', 'the best measured signals in this view, with the target and stop that suit them', safe(() => this.recsView(M, S))],
      ['now', '⚡ Firing now', 'signals on the last closed candle, where the history says they work', safe(() => this.nowView(M, S))],
      ['grid', '🎯 Target × stop map', 'every target against every stop — press a cell to use it on the whole page', safe(() => this.gridView(M.hero, S))],
      ['reach', '📈 How far does it go?', 'how often price reached each target before your stop, and how long it took', safe(() => this.reachView(M, S))],
      ['board', '📋 Every signal, ranked', 'press a row to open it', safe(() => this.boardView(M, S))],
      ['splits', '🪆 Open a smaller doll', 'the same numbers split by market, pair, timeframe, side, hour, weekday and context', safe(() => this.splitsView(M, S))],
      ['brain', '🧠 The brain’s notebook', 'mixes it tried, what it kept, what it re-tuned', safe(() => this.brainView(S))],
      ['botsMade', '🤖 Paper bots made from findings', 'they re-tune themselves as new history arrives', safe(() => this.botsView())],
      ['lib', '📚 The library', 'every signal the checker knows, and how it is measured', safe(() => this.libView())],
    ];
    return `<div class="ckWrap">
      ${this.statusView(S)}
      ${this.controlsView(S)}
      <div class="exCrumbs">${crumbs}${P.length ? `<button class="bMini" data-ckcrumb="-1">✕ clear</button>` : ''}</div>
      ${M.hero.n ? safe(() => this.heroView(M.hero, S)) : `<div class="empty">${this.chunks.size ? 'Nothing measured in this doll yet — go back a step.' : 'The checker has not measured anything yet. It starts by itself a few seconds after ASTRA opens (the MT5 bridge has to be running) — or press “Study now”.'}</div>`}
      ${secs.map(([id, t, h, body]) => this.sec(id, t, h, body)).join('')}
    </div>`;
  },
  sec(id, title, hint, body){
    const S = this.load(), folded = !!(S.secs[id] || {}).fold;
    return `<section class="ckSec${folded ? ' folded' : ''}" data-cksec="${id}"><div class="ckSecHead"><b>${esc(title)}</b><span>${esc(hint)}</span>
      <span class="ckSecTools"><button data-ckmove="${id}|-1" title="Move up">▲</button><button data-ckmove="${id}|1" title="Move down">▼</button><button data-ckfold="${id}" title="${folded ? 'Open' : 'Fold'}">${folded ? '▸' : '▾'}</button></span></div>
      <div class="ckSecBody">${folded ? '' : body}</div></section>`;
  },

  statusView(S){
    const pairs = this.universe(), total = pairs.length * this.TFS.length;
    let done = 0, rows = 0, botChunks = 0;
    for (const ch of this.chunks.values()){ rows += ch.n || 0; if (ch.bot) botChunks++; else if (!ch.error) done++; }
    const pct = total ? Math.min(100, done / total * 100) : 0;
    const cur = this.current ? (this.current.kind === 'bot' ? 'replaying ' + ((BOT_BY_ID[this.current.bot.id] || {}).name || '') + ' on ' + baseAsset(this.current.sym) + ' ' + this.current.tf : 'measuring ' + baseAsset(this.current.sym) + ' ' + this.current.tf) : (S.on ? 'waiting for the next job' : 'paused');
    const mk = ['crypto', 'metal', 'fx', 'index', 'energy', 'stock', 'eustock'];
    return `<div class="ckStatus ${S.on ? 'on' : ''}" id="ckStatus">
      <div class="ckBrain"><i class="${this.busy ? 'busy' : ''}"></i><div><b>${S.on ? 'The brain is studying' : 'The brain is paused'}</b><span id="ckCur">${esc(cur)}</span><span class="dim2">${esc(S.lastThought || '')}</span></div></div>
      <div class="ckProg"><span>${done} of ${total} pair × timeframe studies · ${botChunks} bot replays · ${rows.toLocaleString()} signals measured</span><i><b style="width:${pct.toFixed(1)}%"></b></i></div>
      <div class="ckBtns">
        <button class="bMini ${S.on ? 'on' : ''}" data-ckact="toggle">${S.on ? '⏸ Pause' : '▶ Study'}</button>
        <button class="bMini" data-ckact="now" title="Run the next study right away">⚡ Study now</button>
        <select data-ckspeed title="How often the brain takes the next job"><option value="normal"${S.speed !== 'fast' ? ' selected' : ''}>calm (every 8 s)</option><option value="fast"${S.speed === 'fast' ? ' selected' : ''}>fast (every 2.5 s)</option></select>
        <label class="ckChk"><input type="checkbox" data-ckbots${S.bots ? ' checked' : ''}> replay my bots too</label>
        <button class="bMini" data-ckact="wipe" title="Forget every measurement and start again">↺ start over</button>
      </div>
      <div class="ckMk"><span>Markets to study:</span>${mk.map(m => `<button class="ldChip${S.markets.includes(m) ? ' on' : ''}" data-ckmk="${m}">${esc(this.marketLabel(m))}</button>`).join('')}</div>
    </div>`;
  },
  controlsView(S){
    return `<div class="ckCtl">
      <div><span>Target</span>${this.TH.map((v, i) => `<button class="ckPill up${i === S.t ? ' on' : ''}" data-ckt="${i}">+${v}%</button>`).join('')}</div>
      <div><span>Stop</span>${this.ST.map((v, i) => `<button class="ckPill dn${i === S.s ? ' on' : ''}" data-cks="${i}">−${v}%</button>`).join('')}</div>
      <div><span>“Easy win” means reached in at least</span><input type="range" min="50" max="95" step="5" value="${S.conf}" data-ckconf><b>${S.conf}%</b><span>of cases · trust a result from</span><select data-ckmin>${[10, 20, 30, 50, 100].map(n => `<option value="${n}"${S.minN === n ? ' selected' : ''}>${n} cases</option>`).join('')}</select></div>
    </div>`;
  },
  heroView(acc, S){
    const c = this.cell(acc, S.t, S.s), easy = this.easy(acc, S.s, S.conf), sec = this.avgTf(acc);
    const own = acc.own ? `<div class="ckKpi"><label>Bot’s own target</label><b class="${acc.ownWin >= acc.ownLoss ? 'up' : 'down'}">${Math.round(acc.ownWin / acc.own * 100)}%</b><small>reached ${acc.ownWin} · stopped ${acc.ownLoss} · overshoot +${(acc.ownWin ? acc.ownOver / acc.ownWin : 0).toFixed(2)}%</small></div>` : '';
    const pie = this.donut(c.win, c.loss, c.out);
    return `<div class="ckHero">
      ${pie}
      <div class="ckHeroMain">
        <div class="ckSentence">${this.sentence(null, acc, c, easy, S)}</div>
        <div class="ckKpis">
          <div class="ckKpi"><label>Signals</label><b>${acc.n.toLocaleString()}</b><small>${this.dur(acc.last - acc.first)} of history</small></div>
          <div class="ckKpi"><label>Won · failed · ran out</label><b><span class="up">${c.win}</span> · <span class="down">${c.loss}</span> · ${c.out}</b><small>target +${c.T}% vs stop −${c.S}%</small></div>
          <div class="ckKpi"><label>Win rate</label><b class="${c.winPct >= 50 ? 'up' : 'down'}">${c.winPct.toFixed(1)}%</b><small>early half ${c.halfA == null ? '—' : c.halfA.toFixed(0) + '%'} · late half ${c.halfB == null ? '—' : c.halfB.toFixed(0) + '%'} ${c.holds ? '✓ holds up' : '⚠ unstable'}</small></div>
          <div class="ckKpi"><label>Time to target</label><b>${c.sec ? this.dur(c.sec) : '—'}</b><small>${c.bars ? c.bars.toFixed(1) + ' candles on average' : ''}</small></div>
          <div class="ckKpi"><label>Went beyond the target</label><b class="up">${c.over != null ? '+' + c.over.toFixed(2) + '%' : '—'}</b><small>average extra run after reaching it</small></div>
          <div class="ckKpi"><label>Per signal, after costs</label><b class="${c.exp >= 0 ? 'up' : 'down'}">${c.exp >= 0 ? '+' : ''}${c.exp.toFixed(3)}%</b><small>spread + commission ${(acc.cost / acc.n).toFixed(3)}%</small></div>
          <div class="ckKpi"><label>Better than random?</label><b class="${(c.edge || 0) >= 5 ? 'up' : (c.edge || 0) <= -5 ? 'down' : ''}">${c.edge == null ? '—' : (c.edge >= 0 ? '+' : '') + c.edge.toFixed(1) + ' pts'}</b><small>${c.baseWinPct == null ? 'no benchmark yet' : 'random entry: ' + c.baseWinPct.toFixed(0) + '% won'}</small></div>
          <div class="ckKpi"><label>Easy win</label><b class="up">${easy ? '+' + easy.T + '%' : '—'}</b><small>${easy ? 'reached in ' + easy.winPct.toFixed(0) + '% before −' + easy.S + '%' : 'nothing reaches ' + S.conf + '%'}</small></div>
          ${own}
        </div>
      </div>
    </div>`;
  },
  sentence(key, acc, c, easy, S){
    const sec = this.avgTf(acc);
    const where = key ? `<b>${esc(this.sigMeta(key.sig).label)}</b> · ${esc(this.marketLabel(key.market))} · ${esc(key.tf)}` : 'In this view';
    return `${where}: reached <b class="up">+${c.T}%</b> before <b class="down">−${c.S}%</b> in <b>${c.winPct.toFixed(0)}%</b> of ${c.n} cases
      (won ${c.win}, failed ${c.loss}, ran out ${c.out})${c.sec ? `, typically in ${this.dur(c.sec)} (${c.bars.toFixed(1)} candles)` : ''}${c.over != null ? `, and it kept going to about +${(c.T + c.over).toFixed(2)}% on average` : ''}.
      ${easy ? `Its easy win is <b>+${easy.T}%</b> (${easy.winPct.toFixed(0)}% of cases).` : ''}
      ${c.baseWinPct != null ? `A random entry in the same pairs and direction reached it ${c.baseWinPct.toFixed(0)}% of the time — <b class="${c.edge >= 0 ? 'up' : 'down'}">${c.edge >= 0 ? '+' : ''}${c.edge.toFixed(1)} points</b> ${c.edge >= 0 ? 'better' : 'worse'} than random.` : ''}
      ${c.holds ? '<span class="up">Held up in both halves of the history.</span>' : '<span class="warn">Not stable across the history — treat with care.</span>'}
      After costs: <b class="${c.exp >= 0 ? 'up' : 'down'}">${c.exp >= 0 ? '+' : ''}${c.exp.toFixed(3)}%</b> per signal measured, <b class="${c.expLo >= 0 ? 'up' : 'down'}">${c.expLo >= 0 ? '+' : ''}${c.expLo.toFixed(3)}%</b> at the cautious end.`;
  },
  donut(w, l, o){
    const n = w + l + o || 1, R = 34, C = 2 * Math.PI * R;
    const seg = (v, off, col) => `<circle cx="45" cy="45" r="${R}" fill="none" stroke="${col}" stroke-width="12" stroke-dasharray="${(v / n * C).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off / n * C).toFixed(2)}" transform="rotate(-90 45 45)"/>`;
    return `<svg class="ckDonut" viewBox="0 0 90 90"><circle cx="45" cy="45" r="${R}" fill="none" stroke="rgba(120,150,220,.15)" stroke-width="12"/>${seg(w, 0, '#2ebd85')}${seg(l, w, '#f6465d')}${seg(o, w + l, '#8fa3c8')}
      <text x="45" y="43" text-anchor="middle" class="ckDonutT">${Math.round(w / n * 100)}%</text><text x="45" y="56" text-anchor="middle" class="ckDonutS">won</text></svg>`;
  },

  recsView(M, S){
    if (!M.recs.length) return `<div class="empty">No signal in this view has yet earned a recommendation: it needs at least ${S.minN} cases, a positive result after costs even at the cautious end, and a profit in both halves of the history. That bar is high on purpose — most signals do not clear it. The brain keeps measuring.</div>`;
    return `<div class="ckRecs">${M.recs.slice(0, 12).map((r, i) => `<div class="ckRec">
        <div class="ckRecRank">#${i + 1}</div>
        <div class="ckRecMain">${this.sentence(r, r.acc, r.c, r.easy, S)}
          <div class="ckBar"><i class="w" style="width:${r.c.winPct}%"></i><i class="l" style="width:${r.c.failPct}%"></i></div></div>
        <div class="ckRecBtns">
          <button class="bMini" data-ckopen="${esc(r.sig)}|${esc(r.market)}|${esc(r.tf)}" title="Open this signal, market and timeframe">▸ open</button>
          <button class="bMini go" data-ckmake="${esc(r.sig)}|${esc(r.market)}|${esc(r.tf)}|${r.c.t}|${r.c.s}" title="Make a paper bot that trades exactly this, with this target and stop">🤖 make a paper bot</button>
        </div></div>`).join('')}</div>`;
  },
  nowView(M, S){
    const P = S.path || [], out = [];
    const pass = this.pass();
    for (const ch of this.chunks.values()){
      for (const f of ch.fresh || []){
        if (f.barsAgo > 1) continue;
        const fake = { sig: this.sigIndex[f.sig], sym: ch.sym, tf: ch.tf, market: ch.market, dir: f.dir, time: f.time, mask: f.mask };
        if (fake.sig == null || (pass && !pass.row(fake))) continue;
        const b = M.recs.find(r => r.sig === f.sig && r.market === ch.market && r.tf === ch.tf);
        if (!b) continue;
        out.push({ f, ch, b });
      }
    }
    out.sort((x, y) => y.b.c.exp - x.b.c.exp);
    if (!out.length) return '<div class="empty">Nothing that the history rates is firing on the last closed candle in this view.</div>';
    return `<div class="ckNow">${out.slice(0, 16).map(({ f, ch, b }) => `<div class="ckNowRow">
        <b class="${f.dir > 0 ? 'up' : 'down'}">${f.dir > 0 ? 'BUY' : 'SELL'} ${esc(baseAsset(ch.sym))}</b><span>${esc(this.sigMeta(f.sig).label)} · ${ch.tf} · ${new Date(f.time * 1000).toLocaleTimeString()}</span>
        <span class="dim2">history: +${b.c.T}% before −${b.c.S}% in ${b.c.winPct.toFixed(0)}% of ${b.c.n}</span>
        <button class="bMini" data-ckchart="${esc(ch.sym)}">chart ↗</button></div>`).join('')}</div>
      <div class="ckNote">A signal on the chart is a probability, not a promise — these are only the ones whose measured history is positive after costs.</div>`;
  },
  gridView(acc, S){
    if (!acc.n) return '<div class="empty">—</div>';
    let head = '<tr><th>target ↓ · stop →</th>' + this.ST.map(v => `<th>−${v}%</th>`).join('') + '</tr>';
    let best = this.best(acc, 1);
    const rows = this.TH.map((tv, t) => '<tr><th>+' + tv + '%</th>' + this.ST.map((sv, s) => {
      const c = this.cell(acc, t, s);
      const e = c.exp, hue = e >= 0 ? `rgba(46,189,133,${Math.min(0.85, 0.12 + e * 3)})` : `rgba(246,70,93,${Math.min(0.85, 0.12 - e * 3)})`;
      return `<td class="ckCell${t === S.t && s === S.s ? ' on' : ''}${best && best.t === t && best.s === s ? ' best' : ''}" style="background:${hue}" data-ckcell="${t}|${s}" title="${esc('+' + tv + '% before −' + sv + '%: ' + c.winPct.toFixed(1) + '% won · ' + c.failPct.toFixed(1) + '% failed · ' + (e >= 0 ? '+' : '') + e.toFixed(3) + '% per signal after costs')}"><b>${c.winPct.toFixed(0)}%</b><small>${e >= 0 ? '+' : ''}${e.toFixed(2)}</small></td>`;
    }).join('') + '</tr>').join('');
    return `<div class="dashScroll"><table class="ckGrid">${head}${rows}</table></div>
      <div class="ckNote">Big number = how often the target came before the stop. Small number = what one signal was worth after costs, in %. ★ = the best pair in this view${best ? ' (+' + best.T + '% / −' + best.S + '%)' : ''}. Press a cell to use it everywhere on the page.</div>`;
  },
  reachView(M, S){
    const acc = M.hero; if (!acc.n) return '<div class="empty">—</div>';
    const sec = this.avgTf(acc);
    const bars = this.TH.map((tv, t) => { const c = this.cell(acc, t, S.s); return `<div class="ckReach${c.winPct >= S.conf ? ' easy' : ''}"><span>+${tv}%</span><i><b style="width:${c.winPct.toFixed(1)}%"></b></i><small>${c.winPct.toFixed(0)}% · ${c.sec ? this.dur(c.sec) : '—'}</small></div>`; }).join('');
    const max = Math.max(1, ...M.tHist);
    const hist = Array.from(M.tHist).map((n, i) => `<i style="height:${(n / max * 100).toFixed(0)}%" title="${n} reached the target in ${i + 1}${i === 23 ? '+' : ''} candle${i ? 's' : ''}"></i>`).join('');
    return `<div class="ckReachGrid"><div><h5>Reached before −${this.ST[S.s]}% (highlighted = easy win, ≥ ${S.conf}%)</h5>${bars}</div>
      <div><h5>How many candles it took to reach +${this.TH[S.t]}%</h5><div class="ckHist">${hist}</div><div class="ckHistAx"><span>1</span><span>6</span><span>12</span><span>18</span><span>24+</span></div>
      <div class="ckNote">Average best move after a signal: <b class="up">+${(acc.mfe / acc.n).toFixed(2)}%</b> · average worst: <b class="down">−${(acc.mae / acc.n).toFixed(2)}%</b> (within ${this.HORIZON['15m']} candles on 15m, ${this.HORIZON['1h']} on 1h).</div></div></div>`;
  },
  boardView(M, S){
    const rows = [...M.perSig.entries()].map(([id, acc]) => ({ id, acc, c: this.cell(acc, S.t, S.s), b: this.best(acc, 1), e: this.easy(acc, S.s, S.conf) }))
      .filter(x => x.c).sort((a, b) => (b.c.edgeExp == null ? b.c.exp : b.c.edgeExp) - (a.c.edgeExp == null ? a.c.exp : a.c.edgeExp));
    if (!rows.length) return '<div class="empty">—</div>';
    const sec = acc => this.avgTf(acc);
    return `<div class="dashScroll"><table class="dashTable ckBoard"><thead><tr><th>Signal</th><th>Kind</th><th class="num">Cases</th><th class="num">Won</th><th class="num">Failed</th><th class="num">Ran out</th><th class="num">Win %</th><th class="num">vs random</th><th>Won vs failed</th><th class="num">Time to target</th><th class="num">Beyond target</th><th class="num">Easy win</th><th class="num">Best pair</th><th class="num">Per signal</th><th>Halves</th></tr></thead><tbody>
      ${rows.map(x => { const m = this.sigMeta(x.id); return `<tr data-ckopen="${esc(x.id)}" class="ckRow ${x.acc.n < S.minN ? 'thin' : ''}">
        <td><b class="${m.dir > 0 ? 'up' : m.dir < 0 ? 'down' : ''}">${esc(m.label)}</b></td><td class="dim2">${esc(m.family)}</td>
        <td class="num">${x.acc.n}</td><td class="num up">${x.c.win}</td><td class="num down">${x.c.loss}</td><td class="num">${x.c.out}</td>
        <td class="num ${x.c.winPct >= 50 ? 'up' : 'down'}">${x.c.winPct.toFixed(1)}%</td><td class="num ${(x.c.edge || 0) >= 5 ? 'up' : (x.c.edge || 0) <= -5 ? 'down' : ''}">${x.c.edge == null ? '—' : (x.c.edge >= 0 ? '+' : '') + x.c.edge.toFixed(1)}</td>
        <td><div class="ckBar sm"><i class="w" style="width:${x.c.winPct}%"></i><i class="l" style="width:${x.c.failPct}%"></i></div></td>
        <td class="num">${x.c.sec ? this.dur(x.c.sec) : '—'}</td><td class="num up">${x.c.over != null ? '+' + x.c.over.toFixed(2) + '%' : '—'}</td>
        <td class="num">${x.e ? '+' + x.e.T + '%' : '—'}</td><td class="num">${x.b ? '+' + x.b.T + ' / −' + x.b.S : '—'}</td>
        <td class="num ${x.c.exp >= 0 ? 'up' : 'down'}">${x.c.exp >= 0 ? '+' : ''}${x.c.exp.toFixed(3)}%</td>
        <td>${x.c.holds ? '<span class="up">✓</span>' : '<span class="dim2">~</span>'} ${(x.c.halfA == null ? '—' : x.c.halfA.toFixed(0)) + ' / ' + (x.c.halfB == null ? '—' : x.c.halfB.toFixed(0))}</td></tr>`; }).join('')}</tbody></table></div>
      <div class="ckNote">Sorted by how much better than a random entry each signal did. Faded rows have fewer than ${S.minN} cases — too few to trust. “vs random” = win-rate points above (or below) entering at any candle in the same pairs and direction. “Best pair” is the target / stop with the best result at the cautious end.</div>`;
  },
  splitsView(M, S){
    const used = new Set((S.path || []).filter(f => f.dim !== 'ctx').map(f => f.dim));
    return `<div class="ckSplits">${this.DIMS.filter(d => !used.has(d.id)).map(d => {
      const m = M.splits[d.id]; if (!m || !m.size) return '';
      let entries = [...m.entries()];
      if (d.order) entries.sort((a, b) => d.order.indexOf(a[0]) - d.order.indexOf(b[0])); else entries.sort((a, b) => b[1].n - a[1].n);
      const all = !!(this._showAll || {})[d.id];
      const shown = all ? entries : entries.slice(0, 14);
      const rows = shown.map(([k, a]) => {
        const wp = a.n ? a.w / a.n * 100 : 0, lp = a.n ? a.l / a.n * 100 : 0;
        const hold = a.nA >= 8 && a.nB >= 8 && Math.abs(a.wA / a.nA - a.wB / a.nB) * 100 <= 15;
        return `<button class="ckSplit ${a.n < S.minN ? 'thin' : ''}" data-ckdrill="${d.id}|${esc(k)}" title="${esc(d.name(k) + ' — ' + a.n + ' cases · won ' + a.w + ' · failed ' + a.l + (a.w ? ' · ' + (a.bars / a.w).toFixed(1) + ' candles to target' : ''))}">
          <span>${esc(d.name(k))}</span><div class="ckBar sm"><i class="w" style="width:${wp}%"></i><i class="l" style="width:${lp}%"></i></div>
          <b class="${wp >= 50 ? 'up' : 'down'}">${wp.toFixed(0)}%</b><small>${a.n}${hold ? ' ✓' : ''}</small></button>`;
      }).join('');
      return `<div class="ckSplitCard"><h5>${esc(d.label)}</h5>${rows}${entries.length > 14 ? `<button class="bMini" data-ckmore="${d.id}">${all ? 'show fewer' : 'show all ' + entries.length}</button>` : ''}</div>`;
    }).join('')}</div>`;
  },
  brainView(S){
    const ideas = S.ideas.slice(0, 20).map(x => `<div class="ckIdea"><b>${esc(x.name)}</b>
      <span>+${x.T}% before −${x.S}% in <b class="up">${x.winPct}%</b> of ${x.n} cases${x.baseWin != null ? ' · the signal alone: ' + x.baseWin + '%' : ''}${x.edge != null ? ' · <b class="up">+' + x.edge + '</b> points better than random' : ''} · lift <b class="${x.lift >= 0 ? 'up' : 'down'}">${x.lift >= 0 ? '+' : ''}${x.lift}</b> points · ${x.sec ? this.dur(x.sec) + ' to target' : ''} · per signal <b class="${x.exp >= 0 ? 'up' : 'down'}">${x.exp >= 0 ? '+' : ''}${x.exp}%</b></span>
      <span class="ckIdeaBtns"><button class="bMini go" data-ckmakeidea="${esc(x.id)}">🤖 paper bot</button></span></div>`).join('') || '<div class="empty">No mix has beaten a plain signal on both halves of the history yet.</div>';
    const log = S.log.slice(0, 20).map(e => `<div class="botLog"><span class="dim2">${new Date(e.t).toLocaleString()}</span> ${esc(e.text)}</div>`).join('') || '<div class="empty">Nothing yet</div>';
    return `<div class="ckBrainGrid"><div><h5>Mixes that beat the signal on its own</h5>${ideas}</div><div><h5>What it has been doing</h5>${log}</div></div>
      <div class="ckNote">How it thinks: after every study it takes one signal, adds each of the ${this.FILTERS.length} market contexts and every pair of them (${this.FILTERS.length + this.FILTERS.length * (this.FILTERS.length - 1) / 2} mixes), and keeps a mix only if it has at least twice the usual number of cases, is positive after costs, wins at least 5 points more often than the signal alone, and does so in both halves of the history. The stricter bar is on purpose: the more mixes one tries, the more one finds by pure luck.</div>`;
  },
  botsView(){
    const list = this.recipes();
    if (!list.length) return '<div class="empty">None yet. Press “make a paper bot” on a recommendation or a mix.</div>';
    return `<div class="ckBots">${list.map(r => { const b = BOT_BY_ID[r.id], L = Bots.ledger && Bots.ledger(r.id), st = L ? BotEngine.stats(L) : null; return `<div class="ckBotRow${r.retired ? ' retired' : ''}">
      <b>${esc(r.name)}</b><span>target +${r.T}% · stop −${r.S}% · ${r.n || '?'} cases · ${r.winPct != null ? r.winPct + '%' : '?'} won in history</span>
      <span>${st ? st.trades + ' paper trades · ' + (st.pnl >= 0 ? '+' : '') + fmtNum(st.pnl) : ''}${(r.tunes || []).length ? ' · re-tuned ' + r.tunes.length + '×' : ''}</span>
      <label class="ckChk"><input type="checkbox" data-ckauto="${esc(r.id)}"${r.auto ? ' checked' : ''}> keep re-tuning</label>
      ${b ? `<button class="bMini" data-ws-bot="${esc(r.id)}">open ↗</button>` : ''}
      <button class="bMini" data-ckretire="${esc(r.id)}">${r.retired ? 'bring back' : 'retire'}</button></div>`; }).join('')}</div>`;
  },
  libView(){
    const E = this.EVENTS || this.buildEvents();
    const fam = f => E.filter(e => e.family === f).map(e => `<span class="ckLib ${e.dir > 0 ? 'up' : 'down'}">${e.dir > 0 ? '▲' : '▼'} ${esc(e.label)}</span>`).join('');
    const bots = BOTS.filter(b => !Bots.isPage(b) && !b.manual && !b.liveManual && typeof b.signal === 'function' && !b.checkerBot).map(b => `<span class="ckLib">${esc(typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name)}${Bots.disabled(b.id) ? ' (off)' : ''}</span>`).join('');
    return `<div class="ckLibGrid">
      <div><h5>Candle patterns (${E.filter(e => e.family === 'candles').length})</h5>${fam('candles')}</div>
      <div><h5>Indicator signals (${E.filter(e => e.family === 'indicators').length})</h5>${fam('indicators')}</div>
      <div><h5>Strategies from research (${E.filter(e => e.family === 'research').length})</h5>${fam('research')}</div>
      <div><h5>Your bots — replayed on their own timeframe and pairs, new bots join by themselves</h5>${bots}</div>
      <div><h5>Market contexts the brain mixes in</h5>${this.FILTERS.map(f => `<span class="ckLib">${esc(f[1])}</span>`).join('')}</div>
    </div>
    <div class="ckNote"><b>How a signal is measured:</b> it is read on a closed candle; the trade starts at the next candle’s open; the checker then watches up to ${this.HORIZON['15m']} candles (15m), ${this.HORIZON['1h']} (1h), ${this.HORIZON['4h']} (4h) for each target and each stop. Target and stop inside the same candle count as a fail. Costs are the JustMarkets spread and commission for that pair.</div>
    <div class="ckNote warn"><b>About the internet:</b> ASTRA itself cannot browse the web from inside the app. New strategies reach this library when you ask Claude to research them — they are then added here as new signals and the brain starts measuring them on the next study, automatically.</div>`;
  },

  /* ================= refresh + events ================= */
  refresh(){ if (Bots.active !== 'checker') return; this.dirty = true; Bots.render(); },
  renderStatus(){
    const el = document.getElementById('ckStatus'); if (!el) return;
    const cur = document.getElementById('ckCur');
    if (cur) cur.textContent = this.current ? (this.current.kind === 'bot' ? 'replaying ' + ((BOT_BY_ID[this.current.bot.id] || {}).name || '') + ' on ' + baseAsset(this.current.sym) + ' ' + this.current.tf : 'measuring ' + baseAsset(this.current.sym) + ' ' + this.current.tf) : (this.load().on ? 'waiting for the next job' : 'paused');
    const dot = el.querySelector('.ckBrain i'); if (dot) dot.classList.toggle('busy', !!this.busy);
  },
  setPath(p){ const S = this.load(); S.path = p; this.save(); this.dirty = true; Bots.render(); },
  bind(host){
    const S = this.load();
    const q = (sel, fn) => host.querySelectorAll(sel).forEach(el => el.addEventListener('click', e => fn(el, e)));
    q('[data-ckcrumb]', el => { const i = +el.dataset.ckcrumb; this.setPath(i < 0 ? [] : (S.path || []).slice(0, i + 1)); });
    q('[data-ckdrill]', el => { const [d, ...rest] = el.dataset.ckdrill.split('|'); const v = rest.join('|'); this.setPath((S.path || []).concat([{ dim: d, value: v, label: this.dim(d).name(v) }])); });
    q('[data-ckopen]', el => {
      const [sig, market, tf] = el.dataset.ckopen.split('|');
      const p = (S.path || []).filter(f => !['sig', 'market', 'tf'].includes(f.dim));
      p.push({ dim: 'sig', value: sig, label: this.sigMeta(sig).label });
      if (market) p.push({ dim: 'market', value: market, label: this.marketLabel(market) });
      if (tf) p.push({ dim: 'tf', value: tf, label: tf });
      this.setPath(p); host.scrollTop = 0;
    });
    q('[data-ckmore]', el => { this._showAll = this._showAll || {}; this._showAll[el.dataset.ckmore] = !this._showAll[el.dataset.ckmore]; this.dirty = true; Bots.render(); });
    q('[data-ckt]', el => { S.t = +el.dataset.ckt; this.save(); this.dirty = true; Bots.render(); });
    q('[data-cks]', el => { S.s = +el.dataset.cks; this.save(); this.dirty = true; Bots.render(); });
    q('[data-ckcell]', el => { const [t, s] = el.dataset.ckcell.split('|'); S.t = +t; S.s = +s; this.save(); this.dirty = true; Bots.render(); });
    host.querySelector('[data-ckconf]')?.addEventListener('change', e => { S.conf = +e.target.value; this.save(); this.dirty = true; Bots.render(); });
    host.querySelector('[data-ckmin]')?.addEventListener('change', e => { S.minN = +e.target.value; this.save(); this.dirty = true; Bots.render(); });
    host.querySelector('[data-ckspeed]')?.addEventListener('change', e => { this.setSpeed(e.target.value); this.dirty = true; Bots.render(); });
    host.querySelector('[data-ckbots]')?.addEventListener('change', e => { S.bots = e.target.checked; this.save(); });
    q('[data-ckmk]', el => { const m = el.dataset.ckmk; S.markets = S.markets.includes(m) ? S.markets.filter(x => x !== m) : S.markets.concat([m]); this.save(); this.dirty = true; Bots.render(); });
    q('[data-ckact]', async el => {
      const a = el.dataset.ckact;
      if (a === 'toggle'){ S.on = !S.on; this.save(); this.dirty = true; Bots.render(); }
      if (a === 'now'){ toast('Studying the next pair…', 'info'); await this.tick(true); }
      if (a === 'wipe'){ if (!confirm('Forget every measurement the checker has made and start again from scratch?')) return;
        await this.clearAll(); this.chunks.clear(); this.version++; S.ideas = []; S.scanned = 0; this.save(); this.note('Started again from scratch'); this.dirty = true; Bots.render(); }
    });
    q('[data-ckfold]', el => { const id = el.dataset.ckfold; S.secs[id] = Object.assign({}, S.secs[id], { fold: !(S.secs[id] || {}).fold }); this.save(); this.dirty = true; Bots.render(); });
    q('[data-ckmove]', el => {
      const [id, d] = el.dataset.ckmove.split('|'); const secs = [...host.querySelectorAll('[data-cksec]')];
      const i = secs.findIndex(x => x.dataset.cksec === id), j = i + +d; if (j < 0 || j >= secs.length) return;
      if (+d < 0) secs[j].before(secs[i]); else secs[j].after(secs[i]);
      S.order = [...host.querySelectorAll('[data-cksec]')].map(x => x.dataset.cksec); this.save();
    });
    q('[data-ckchart]', el => { if (typeof WorkspaceUI !== 'undefined') WorkspaceUI.openChart(el.dataset.ckchart); });
    q('[data-ckmake]', el => {
      const [sig, market, tf, t, s] = el.dataset.ckmake.split('|');
      const M = this.model(), r = M.recs.find(x => x.sig === sig && x.market === market && x.tf === tf);
      if (!confirm('Make a PAPER bot that trades “' + this.sigMeta(sig).label + '” on ' + this.marketLabel(market) + ' · ' + tf + ' with target +' + this.TH[+t] + '% and stop −' + this.ST[+s] + '%?\n\nIt keeps re-tuning itself as the checker learns. Paper only.')) return;
      const res = this.makeBot({ sig, market, tf, T: this.TH[+t], S: this.ST[+s], n: r ? r.acc.n : null, winPct: r ? +r.c.winPct.toFixed(1) : null });
      toast(res.ok ? 'Paper bot made — it is in the bot list' : res.why, res.ok ? 'ok' : 'warn');
      this.dirty = true; Bots.render();
    });
    q('[data-ckmakeidea]', el => {
      const x = S.ideas.find(i => i.id === el.dataset.ckmakeidea); if (!x) return;
      const tf = prompt('Which timeframe should the bot trade? (5m, 15m, 1h, 4h, 1d)', '15m'); if (!tf || !this.TFS.includes(tf.trim())) return;
      const res = this.makeBot({ sig: x.sig, fa: x.fa, fb: x.fb, tf: tf.trim(), T: x.T, S: x.S, n: x.n, winPct: x.winPct });
      toast(res.ok ? 'Paper bot made — it is in the bot list' : res.why, res.ok ? 'ok' : 'warn');
      this.dirty = true; Bots.render();
    });
    host.querySelectorAll('[data-ckauto]').forEach(el => el.addEventListener('change', () => { const l = this.recipes(); const r = l.find(x => x.id === el.dataset.ckauto); if (r){ r.auto = el.checked; this.saveRecipes(l); } }));
    q('[data-ckretire]', el => {
      const l = this.recipes(); const r = l.find(x => x.id === el.dataset.ckretire); if (!r) return;
      r.retired = !r.retired; this.saveRecipes(l);
      if (r.retired){ const i = BOTS.findIndex(b => b.id === r.id); if (i >= 0) BOTS.splice(i, 1); delete BOT_BY_ID[r.id]; }
      else this.mount(r);
      this.dirty = true; Bots.render();
    });
    /* keep the section order the way it was left */
    if (S.order && S.order.length){ const wrap = host.querySelector('.ckWrap'); for (const id of S.order){ const el = host.querySelector('[data-cksec="' + id + '"]'); if (el) wrap.appendChild(el); } }
    this.dirty = false;
  },
});
BOTS.push({ id: 'checker', name: 'Strategy Checker', analysis: true, checker: true,
  blurb: 'Every signal ASTRA knows — candle patterns, indicator events and all your bots — measured on real history across markets, pairs and timeframes: how often it reached each target before the stop, how long it took, how far it kept going. A brain mixes signals with market contexts and turns what holds up into recommendations and paper bots.',
  defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 0 }, warmup: 0, signal: () => null });
BOT_BY_ID.checker = BOTS[BOTS.length - 1];
