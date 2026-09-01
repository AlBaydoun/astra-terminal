/* ASTRA Terminal — Bots workspace rendering. */
Object.assign(Bots, {

  wire(){
    const nav = document.getElementById('botNav');
    nav.innerHTML = BOTS.map(b =>
      `<button data-bot="${b.id}"${b.id === this.active ? ' class="active"' : ''}>${esc(b.name)}</button>`).join('');
    nav.querySelectorAll('button').forEach(btn => btn.addEventListener('click', () => {
      this.active = btn.dataset.bot;
      nav.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === btn));
      this.render();
    }));
  },

  h(v, d){ return v == null || isNaN(v) ? '—' : (d != null ? v.toFixed(d) : fmtNum(v)); },
  when(ts){ return ts ? new Date(ts).toLocaleString() : '—'; },

  render(){
    const host = document.getElementById('botBody');
    if (!host) return;
    const b = BOT_BY_ID[this.active];
    const cfg = this.cfg(b.id);
    const L = this.ledger(b.id);
    const st = BotEngine.stats(L);

    host.innerHTML =
      `<div class="botHead">
         <div class="botTitle"><b>${esc(b.name)}</b><span>${esc(b.blurb)}</span></div>
         <span class="paperTag" title="No part of this application can send an order to a broker">PAPER ONLY</span>
       </div>` +
      this.controls(b, cfg) +
      (b.brain ? this.brainView() : b.scan ? this.scannerView() : b.manual ? this.manualView(L, st) : this.botView(b, L, st));

    this.bind(b);
  },

  controls(b, cfg){
    if (b.brain){
      const S = MasterBrain.state || MasterBrain.load();
      return `<div class="botCtl">
        <button class="bBtn" data-act="train">Train now</button>
        <button class="bBtn" data-act="harvest">Learn from history</button>
        <button class="bBtn danger" data-act="brainreset">Forget everything</button>
        <span class="bcNote">${S.samples.length} examples · last trained ${S.trainedAt ? this.when(S.trainedAt) : 'never'}</span>
      </div>`;
    }
    if (b.scan)
      return `<div class="botCtl">
        ${this.tfSel(cfg)}
        <label class="bc">Min score <input type="number" data-cfg="minScore" value="${cfg.minScore}" min="0" max="100"></label>
        <button class="bBtn" data-act="scan">Scan now</button>
        <span class="bcNote">${this.scan.busy ? 'scanning…' : this.scan.at ? 'updated ' + this.when(this.scan.at) : 'not scanned yet'}
          ${this.scan.universe ? ' · ' + this.scan.universe + ' instruments' : ''}</span>
      </div>`;
    if (b.manual)
      return `<div class="botCtl">
        <label class="bc"><input type="checkbox" data-cfg="paused" ${cfg.paused ? 'checked' : ''}> Pause monitoring</label>
        <button class="bBtn danger" data-act="reset">Reset</button>
        <span class="bcNote">Monitoring updates price, unrealized P/L, stop, target, MFE and MAE. Pausing keeps every trade and its history.</span>
      </div>`;
    return `<div class="botCtl">
      ${this.tfSel(cfg)}
      <label class="bc">Min score <input type="number" data-cfg="minScore" value="${cfg.minScore}" min="0" max="100"></label>
      <label class="bc">Max open <input type="number" data-cfg="maxOpen" value="${cfg.maxOpen}" min="1" max="10"></label>
      <label class="bc"><input type="checkbox" data-cfg="paused" ${cfg.paused ? 'checked' : ''}> Pause</label>
      <button class="bBtn" data-act="run">Run now</button>
      <button class="bBtn" data-act="bt">Backtest</button>
      <button class="bBtn danger" data-act="reset">Reset</button>
    </div>`;
  },

  tfSel(cfg){
    return `<label class="bc">Timeframe
      <select data-cfg="tf">${BotEngine.TFS.map(t =>
        `<option value="${t}"${t === cfg.tf ? ' selected' : ''}>${t}</option>`).join('')}</select></label>` +
      (cfg.tfAuto !== undefined
        ? `<label class="bc"><input type="checkbox" data-cfg="tfAuto" ${cfg.tfAuto ? 'checked' : ''}> Auto</label>` : '');
  },

  /* ---------------- Market Scanner ---------------- */
  scannerView(){
    const rows = this.scan.rows;
    if (!rows.length) return '<div class="empty">No scan yet — press “Scan now”.</div>';
    const act = rows.filter(r => r.active), idle = rows.filter(r => !r.active);
    const row = r => {
      const d = r.dir > 0 ? 'up' : r.dir < 0 ? 'down' : 'flat';
      const why = (r.active ? r.reasons : r.failed).slice(0, 2).join(' · ');
      return `<tr data-sym="${esc(r.sym)}">
        <td class="c-sym">${esc(baseAsset(r.sym))}</td>
        <td class="${d}">${r.dir > 0 ? '▲ BUY' : r.dir < 0 ? '▼ SELL' : '—'}</td>
        <td class="num">${Math.round(r.score)}</td>
        <td class="num">${fmtPrice(r.price)}</td>
        <td class="num">${r.spreadPct == null ? '—' : r.spreadPct.toFixed(3) + '%'}</td>
        <td class="num">${r.ageSec == null ? '—' : Math.round(r.ageSec) + 's'}</td>
        <td class="num">${r.move == null ? '—' : r.move.toFixed(2) + '%'}</td>
        <td>${esc(r.tf)}</td>
        <td class="scWhy">${esc(why)}</td>
        <td><button class="bMini" data-open="${esc(r.sym)}">Chart</button></td></tr>`;
    };
    return `<div class="scWrap"><table class="scTable">
      <thead><tr><th>Instrument</th><th>Direction</th><th>Score</th><th>Price</th><th>Spread</th>
        <th>Quote age</th><th>Est. move</th><th>TF</th><th>Reason</th><th></th></tr></thead>
      <tbody>
        <tr class="scSect"><td colspan="10">ACTIVE SETUPS · ${act.length}</td></tr>
        ${act.map(row).join('') || '<tr><td colspan="10" class="empty">Nothing passes the full stack right now — that is normal.</td></tr>'}
        <tr class="scSect"><td colspan="10">WATCHING · ${idle.length}</td></tr>
        ${idle.slice(0, 60).map(row).join('')}
      </tbody></table>
      <div class="botNote">The scanner ranks and explains. It never opens a trade.</div></div>`;
  },

  /* ---------------- Master Brain ---------------- */
  brainView(){
    const S = MasterBrain.state || MasterBrain.load();
    const st = MasterBrain.status();
    const m = S.metrics;
    const paper = S.samples.filter(x => x.src === 'paper').length;
    const back = S.samples.length - paper;

    const head = `<div class="brainState ${st.cls}"><div class="bsTop"><b>${esc(st.label)}</b><span>${esc(st.text)}</span></div></div>`;
    const counts = `<div class="botStats">
        ${this.stat('EXAMPLES', S.samples.length)}
        ${this.stat('FROM PAPER', paper)}
        ${this.stat('FROM BACKTESTS', back)}
        ${this.stat('TRAINED ON', S.trained || 0)}
        ${this.stat('APPROVED', S.approved || 0)}
        ${this.stat('VETOED', S.vetoed || 0)}
      </div>`;

    const cov = (typeof MarketState !== 'undefined') ? MarketState.coverage(S.samples) : null;
    const covRow = cov && cov.n ? `<div class="botNote">Context coverage — market regime on <b>${cov.state.toFixed(0)}%</b> of examples,
      Fear &amp; Greed on <b>${cov.fng.toFixed(0)}%</b>, live news mood on <b>${cov.news.toFixed(0)}%</b>.
      Regime and Fear &amp; Greed can be reconstructed for past trades, so backtests carry them; news has no archive, so only trades taken live carry it.</div>` : '';

    if (!m) return head + counts + covRow +
      `<div class="botNote">It needs ${MasterBrain.MIN_TRAIN} finished trades before it may train. Press <b>Learn from history</b> to backtest several strategies across a set of instruments — that produces hundreds of labelled examples in one pass.</div>`;

    const of = m.overfit, ofWarn = of != null && of > 12, f = m.filtered;
    const calib = (m.calib || []).map(c =>
      `<div class="botRow"><b>${Math.round(c.lo * 100)}–${Math.round(c.hi * 100)}% predicted</b>` +
      `<span>${c.n} trades</span>` +
      `<span class="${c.actual != null && c.actual >= c.lo * 100 ? 'up' : 'down'}">actually won ${c.actual == null ? '—' : c.actual.toFixed(0) + '%'}</span></div>`).join('')
      || '<div class="empty">Not enough validation trades to check calibration</div>';

    const weights = MasterBrain.topWeights(12).map(x =>
      `<div class="botRow"><b>${esc(x.f)}</b>` +
      `<span class="${x.w > 0 ? 'up' : 'down'}">${x.w > 0 ? '+' : ''}${x.w.toFixed(3)}</span>` +
      `<span class="dim2">${x.w > 0 ? 'raises' : 'lowers'} the estimated chance of a win</span></div>`).join('')
      || '<div class="empty">No weight has moved far from zero yet</div>';

    return head + counts + covRow +
      `<div class="botGrid">
        <div class="botCol">
          <div class="botH">HONEST SCORE — ON DATA IT NEVER SAW</div>
          <div class="botRow"><b>Out-of-sample accuracy</b>
            <span class="${m.edge > 1 ? 'up' : 'down'}">${m.val ? m.val.acc.toFixed(1) + '%' : '—'} on ${m.val ? m.val.n : 0} trades</span>
            <span class="dim2">against ${m.baseline.toFixed(1)}% for always guessing the majority — edge ${m.edge > 0 ? '+' : ''}${m.edge}</span></div>
          <div class="botRow"><b>In-sample accuracy</b>
            <span>${m.train ? m.train.acc.toFixed(1) + '%' : '—'}</span>
            <span class="${ofWarn ? 'down' : 'dim2'}">${of == null ? '' : 'gap of ' + of + ' points' + (ofWarn ? ' — it is memorising, not generalising' : ' — acceptable')}</span></div>
          <div class="botRow"><b>Log loss</b><span>${m.val ? m.val.logLoss.toFixed(4) : '—'}</span>
            <span class="dim2">0.693 is a coin toss — lower is better</span></div>
          <div class="botH">EFFECT OF THE FILTER</div>
          <div class="botRow"><b>Every signal</b><span class="${pctClass(f.avgRAll)}">${f.avgRAll}R average</span>
            <span class="dim2">${m.val ? m.val.n : 0} unseen trades</span></div>
          <div class="botRow"><b>Only what it approves</b><span class="${pctClass(f.avgR)}">${f.avgR}R average</span>
            <span class="dim2">${f.taken} of ${f.of} taken</span></div>
          <div class="botNote${f.avgR > f.avgRAll ? '' : ' warn'}">${f.avgR > f.avgRAll
            ? 'On unseen data the filter improved the average result. Encouraging — not proof.'
            : 'On unseen data the filter did not improve the result. This is exactly why it abstains instead of trading.'}</div>
        </div>
        <div class="botCol"><div class="botH">IS IT CALIBRATED?</div>${calib}
          <div class="botNote">If it says 60% and roughly 60% actually win, the number means something. If not, the number is noise.</div></div>
        <div class="botCol"><div class="botH">WHAT IT HAS LEARNED TO WEIGH</div>${weights}
          <div class="botNote">The model is linear, so these weights are the entire explanation — nothing is hidden.</div></div>
        <div class="botCol"><div class="botH">LEARNING LOG</div>
          ${(S.log || []).slice(0, 12).map(l => `<div class="botLog"><span class="dim2">${new Date(l.t).toLocaleString()}</span> ${esc(l.text)}</div>`).join('') || '<div class="empty">Nothing yet</div>'}</div>
      </div>
      <div class="botNote warn">A statistical model fitted to past trades — not a forecaster. It may only refuse or shrink a trade, never invent one, and everything it touches is play money.</div>`;
  },

  /* backtest a spread of strategies and instruments, then retrain on the result */
  async harvest(){
    /* study what you actually trade. When the MT5 bridge is connected these are
       your own instruments at your own spreads; crypto is only the fallback. */
    const syms = Feed.bridge
      ? BotEngine.PRIORITY.filter(s => Feed.bridgeHas(s))
      : ['BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT'];
    if (!syms.length) syms.push('BTCUSDT', 'ETHUSDT', 'SOLUSDT');
    const bots = ['candle', 'bullEng', 'bearEng', 'rigor', 'maMacd'];
    let total = 0;
    toast('Backtesting ' + bots.length + ' strategies across ' + syms.length + ' instruments…', 'info');
    for (const bid of bots){
      for (const sym of syms){
        const b = BOT_BY_ID[bid];
        const r = await Backtest.run(b, { sym, tf: b.defaults.tf });
        total += MasterBrain.ingestBacktest(r, b);
      }
    }
    const res = MasterBrain.train();
    toast(res.ok ? 'Learned from ' + total + ' trades and retrained' : 'Collected ' + total + ' trades — ' + res.reason,
      res.ok ? 'ok' : 'warn');
    this.render();
  },

  /* ---------------- Manual bot ---------------- */
  manualView(L, st){
    const t = STORE.tickers.get(STORE.symbol);
    return `<div class="mbForm">
      <label class="bc">Instrument <input id="mbSym" type="text" value="${esc(STORE.symbol)}" spellcheck="false"></label>
      <label class="bc">Side <select id="mbDir"><option value="buy">BUY</option><option value="sell">SELL</option></select></label>
      <label class="bc">Volume <input id="mbQty" type="number" step="any" min="0" placeholder="0.10"></label>
      <label class="bc">Stop-loss <input id="mbSl" type="number" step="any" min="0" placeholder="required"></label>
      <label class="bc">Take-profit <input id="mbTp" type="number" step="any" min="0" placeholder="required"></label>
      <label class="bc">Timeframe <select id="mbTf">${BotEngine.TFS.map(x =>
        `<option value="${x}"${x === STORE.tf ? ' selected' : ''}>${x}</option>`).join('')}</select></label>
      <label class="bc grow">Note <input id="mbNote" type="text" placeholder="why are you taking this trade?"></label>
      <button class="bBtn go" data-act="mopen">Open paper trade${t ? ' @ ' + fmtPrice(t.last) : ''}</button>
    </div>` + this.ledgerView('manual', L, st);
  },

  /* ---------------- automated bot ---------------- */
  botView(b, L, st){
    return this.ledgerView(b.id, L, st) + this.btView(b.id);
  },

  ledgerView(id, L, st){
    const pf = st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2);
    return `<div class="botStats">
        ${this.stat('EQUITY', fmtNum(st.equity), st.pnl)}
        ${this.stat('P&L', (st.pnl >= 0 ? '+' : '') + fmtNum(st.pnl) + ' (' + fmtPct(st.pnlPct) + ')', st.pnl)}
        ${this.stat('TRADES', st.trades + ' · ' + Math.round(st.winRate) + '% win')}
        ${this.stat('PROFIT FACTOR', pf)}
        ${this.stat('AVERAGE R', st.avgR.toFixed(2))}
        ${this.stat('MAX DRAWDOWN', '-' + st.maxDD.toFixed(1) + '%', -1)}
        ${this.stat('FEES PAID', fmtNum(st.fees), -1)}
        ${this.stat('WON / LOST', fmtNum(st.winAmount) + ' / ' + fmtNum(st.lossAmount))}
      </div>
      <div class="botGrid">
        <div class="botCol"><div class="botH">OPEN POSITIONS · ${L.open.length}</div>${this.openView(id, L)}</div>
        <div class="botCol"><div class="botH">CLOSED HISTORY</div>${this.closedView(L)}</div>
        <div class="botCol"><div class="botH">DECISIONS</div>${this.decisionView(L)}</div>
        <div class="botCol"><div class="botH">LESSONS FROM LOSSES</div>${this.lessonView(L)}
          <div class="botH">DAILY</div>${this.dailyView(L)}</div>
      </div>`;
  },

  stat(label, val, sign){
    const cls = sign == null ? '' : (sign > 0 ? 'up' : sign < 0 ? 'down' : '');
    return `<div class="obStat"><label>${esc(label)}</label><b class="${cls}">${val}</b></div>`;
  },

  openView(id, L){
    if (!L.open.length) return '<div class="empty">No open positions</div>';
    return L.open.map(p => {
      const u = p.unreal != null ? p.unreal : 0;
      return `<div class="botRow">
        <b class="${p.dir > 0 ? 'up' : 'down'}">${p.dir > 0 ? 'BUY' : 'SELL'} ${esc(baseAsset(p.sym))}</b>
        <span class="dim2">${esc(p.tf)} · ${esc(p.model || '')}</span>
        <span>${+p.qty.toPrecision(4)} @ ${fmtPrice(p.entry)}</span>
        <span class="dim2">SL ${fmtPrice(p.sl)} · TP ${fmtPrice(p.tp)}${p.tp1Done ? ' · half banked, stop at breakeven' : ''}</span>
        <span class="${pctClass(u)}">${(u >= 0 ? '+' : '') + fmtNum(u)}</span>
        <span class="dim2">opened ${this.when(p.entryTime)}</span>
        <button class="bMini" data-close="${id}:${p.id}">Close</button></div>`;
    }).join('');
  },

  closedView(L){
    if (!L.closed.length) return '<div class="empty">No closed trades yet</div>';
    return L.closed.slice(0, 30).map(t => `<div class="botRow">
      <b class="${t.dir > 0 ? 'up' : 'down'}">${t.dir > 0 ? 'BUY' : 'SELL'} ${esc(baseAsset(t.sym))}</b>
      <span class="dim2">${esc(t.tf)} · ${esc(t.model || '')}</span>
      <span>${fmtPrice(t.entry)} → ${fmtPrice(t.exit)}</span>
      <span class="${pctClass(t.pnl)}">${(t.pnl >= 0 ? '+' : '') + fmtNum(t.pnl)} · ${t.r}R</span>
      <span class="dim2">fees ${fmtNum(t.fees)} · MFE ${fmtNum(t.mfe)} · MAE ${fmtNum(t.mae)}</span>
      <span class="dim2">${this.when(t.entryTime)} → ${this.when(t.exitTime)} (${esc(t.tz || '')})</span>
      <span class="dim2">exit: ${esc(t.reason)}</span></div>`).join('');
  },

  decisionView(L){
    if (!L.decisions.length) return '<div class="empty">Nothing logged yet</div>';
    return L.decisions.slice(0, 40).map(d =>
      `<div class="botLog ${esc(d.kind)}"><span class="dim2">${new Date(d.t).toLocaleTimeString()}</span> ${esc(d.text)}</div>`).join('');
  },

  lessonView(L){
    if (!L.lessons.length) return '<div class="empty">No losing trades to learn from yet</div>';
    return L.lessons.slice(0, 8).map(l =>
      `<div class="botLog loss"><span class="dim2">${new Date(l.t).toLocaleDateString()}</span> ${esc(l.text)}</div>`).join('');
  },

  dailyView(L){
    const days = Object.entries(L.daily).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 7);
    if (!days.length) return '<div class="empty">No completed days yet</div>';
    return days.map(([d, v]) => `<div class="botRow">
      <b>${esc(d)}</b>
      <span class="${pctClass(v.pnl)}">${(v.pnl >= 0 ? '+' : '') + fmtNum(v.pnl)}</span>
      <span class="dim2">${v.wins}W / ${v.losses}L · fees ${fmtNum(v.fees)}</span>
      <span class="dim2">${fmtPct(v.pnl / L.startEquity * 100)} of opening balance</span></div>`).join('');
  },

  btView(id){
    const r = this.bt[id];
    if (!r) return `<div id="botBt" class="botBt"><div class="botNote">Press “Backtest” to run this strategy over the loaded history of the current instrument, using the same costs and risk rules as the paper ledger.</div></div>`;
    if (r.error) return `<div id="botBt" class="botBt"><div class="empty">${esc(r.error)}</div></div>`;
    const s = r.stats;
    const pf = s.profitFactor === Infinity ? '∞' : s.profitFactor.toFixed(2);
    return `<div id="botBt" class="botBt">
      <div class="botH">BACKTEST · ${esc(baseAsset(r.sym))} ${esc(r.tf)} · ${r.bars} candles
        (${new Date(r.from * 1000).toLocaleDateString()} → ${new Date(r.to * 1000).toLocaleDateString()})</div>
      <div class="botStats">
        ${this.stat('NET', (s.pnl >= 0 ? '+' : '') + fmtNum(s.pnl) + ' (' + fmtPct(s.pnlPct) + ')', s.pnl)}
        ${this.stat('TRADES', s.trades)}
        ${this.stat('WIN RATE', Math.round(s.winRate) + '%')}
        ${this.stat('PROFIT FACTOR', pf)}
        ${this.stat('AVERAGE R', s.avgR.toFixed(2))}
        ${this.stat('MAX DRAWDOWN', '-' + s.maxDD.toFixed(1) + '%', -1)}
        ${this.stat('FEES', fmtNum(s.fees), -1)}
        ${this.stat('SIGNALS / REJECTED', r.signals + ' / ' + r.rejected)}
      </div>
      ${r.rejectReasons.length ? '<div class="botNote">Most common rejections: ' +
        r.rejectReasons.map(([why, n]) => esc(why) + ' (' + n + ')').join(' · ') + '</div>' : ''}
      <div class="botNote warn">A backtest describes the past only. It is not a forecast, and real fills, spreads and gaps will differ.</div>
    </div>`;
  },

  bind(b){
    const host = document.getElementById('botBody');
    host.querySelectorAll('[data-cfg]').forEach(el => {
      el.addEventListener('change', () => {
        const cfg = this.cfg(b.id);
        const k = el.dataset.cfg;
        cfg[k] = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? parseFloat(el.value) : el.value);
        this.saveCfg(b.id);
        this.render();
      });
    });
    host.querySelectorAll('[data-act]').forEach(el => el.addEventListener('click', () => {
      const a = el.dataset.act;
      if (a === 'scan') this.runScan(true);
      if (a === 'run'){ toast(b.name + ': checking every instrument…', 'info'); this.runBot(b, true).then(() => this.render()); }
      if (a === 'bt') this.backtest(b.id);
      if (a === 'reset') this.resetBot(b.id);
      if (a === 'mopen') this.manualOpen();
      if (a === 'train'){ const r = MasterBrain.train(); toast(r.ok ? 'Retrained on every example it holds' : r.reason, r.ok ? 'ok' : 'warn'); this.render(); }
      if (a === 'harvest') this.harvest();
      if (a === 'brainreset'){ if (confirm('Make the Master Brain forget every example it has learned?')){ MasterBrain.reset(); this.render(); } }
    }));
    host.querySelectorAll('[data-open]').forEach(el =>
      el.addEventListener('click', () => App.setSymbol(el.dataset.open)));
    host.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => {
      const [bot, id] = el.dataset.close.split(':');
      this.closePos(bot, +id);
    }));
    host.querySelectorAll('.scTable tbody tr[data-sym]').forEach(tr =>
      tr.addEventListener('dblclick', () => App.setSymbol(tr.dataset.sym)));
  },
});
