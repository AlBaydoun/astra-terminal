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
      (b.scan ? this.scannerView() : b.manual ? this.manualView(L, st) : this.botView(b, L, st));

    this.bind(b);
  },

  controls(b, cfg){
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
