/* ASTRA Terminal — Bots workspace rendering. */
Object.assign(Bots, {

  wire(){
    if (typeof ManualOrders !== 'undefined') ManualOrders.start();
    if (!this.manualTimer) this.manualTimer = setInterval(() => {
      if (this.active === 'manual') this.manualCalc();
    }, 5000);
    this.renderNav();
  },

  /* the list on the left — re-run whenever its order changes */
  renderNav(){
    const nav = document.getElementById('botNav');
    if (!nav) return;
    nav.innerHTML = typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.nav(this.active) : `<button data-bot="permissions"${this.active === 'permissions' ? ' class="active"' : ''}>Instrument permissions</button>` + this.ordered(BOTS).map(b =>
      `<button data-bot="${b.id}"${b.id === this.active ? ' class="active"' : ''}>${esc(b.name)}</button>`).join('');
    nav.querySelectorAll('[data-bot]').forEach(btn => btn.addEventListener('click', () => {
      this.active = btn.dataset.bot;
      nav.querySelectorAll('button[data-bot]').forEach(x => x.classList.toggle('active', x === btn));
      this.render();
      document.getElementById('botBody').scrollTop = 0;
    }));
    if (typeof WorkspaceUI !== 'undefined') WorkspaceUI.bindNav(nav);
  },

  /* ---- your own order for the bot lists ----
     Saved as a list of ids. Bots you have never moved keep the registry order
     after the ones you have. New storage key; ledgers and settings untouched. */
  ORDER_KEY: 'astra_botorder',
  botOrder(){ return lsGet(this.ORDER_KEY, []) || []; },
  ordered(list){
    const rank = {}; this.botOrder().forEach((id, i) => { rank[id] = i; });
    const base = {}; list.forEach((b, i) => { base[b.id] = i; });
    return list.slice().sort((a, b) => {
      const ra = rank[a.id], rb = rank[b.id];
      if (ra != null && rb != null) return ra - rb;
      if (ra != null) return -1;
      if (rb != null) return 1;
      return base[a.id] - base[b.id];
    });
  },
  /* move one entry up or down inside its own group of the sidebar */
  moveBot(id, dir, groupIds){
    const list = this.ordered(groupIds.map(g => ({ id: g }))).map(b => b.id);
    const i = list.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return false;
    list.splice(i, 1); list.splice(j, 0, id);
    /* keep the saved order complete for this group, leave other groups as saved */
    const saved = this.botOrder().filter(x => !list.includes(x));
    lsSet(this.ORDER_KEY, saved.concat(list));
    this.renderNav();
    return true;
  },

  h(v, d){ return v == null || isNaN(v) ? '—' : (d != null ? v.toFixed(d) : fmtNum(v)); },
  when(ts){ return ts ? new Date(ts).toLocaleString() : '—'; },

  render(){
    const host = document.getElementById('botBody');
    if (!host) return;
    if(this.active!=='liveManual'&&typeof LiveManual!=='undefined'&&(LiveManual.auto?.running||LiveManual.auto?.starting))LiveManual.auto.stop('Stopped because you left the live desk.');
    if (typeof WorkspaceUI !== 'undefined') WorkspaceUI.sync(this.active);
    if (this.active === 'permissions'){
      if (host.dataset.bot === 'manual') this.manualDraft = this.snapshotForm(host);
      OpenTrades.stop();
      if (host.dataset.bot !== 'permissions'){
        host.dataset.bot = 'permissions';
        host.innerHTML = `<div class="botHead"><div class="botTitle"><b>Instrument permissions</b>
          <span>Control which pairs may open new trades across the bots.</span></div></div>
          <div class="botCtl" id="prTools"></div>${BotDash.pairRulesView()}`;
        host.querySelector('#prSearch').addEventListener('input', e => {
          BotDash.pairQ = e.target.value; this.refreshPermissions(host);
        });
        host.querySelector('[data-act="prclear"]').addEventListener('click', () => {
          BotDash.pairQ = ''; host.querySelector('#prSearch').value = ''; this.refreshPermissions(host);
        });
      }
      this.refreshPermissions(host);
      return;
    }
    const b = BOT_BY_ID[this.active] || BOTS[0];
    if (!b) return;
    /* a bot can exist before its ledger does — during boot, or when the Strategy
       Lab mounts one mid-session. Render an empty ledger rather than throwing. */
    const cfg = this.cfg(b.id) || Object.assign({}, b.defaults);
    const L = this.ledger(b.id) || BotEngine.blank(b.id);
    const st = BotEngine.stats(L);
    if (b.liveManual && host.dataset.bot === b.id && host.querySelector('#lmDesk')){
      LiveManual.status(); return;
    }

    if (b.analysis && host.dataset.bot === b.id && host.querySelector('#anResults')){
      TradeAnalysis.refresh();
      return;
    }

    if (b.confluenceScanner && host.dataset.bot === b.id && host.querySelector('#cfScanRows')){
      ConfluenceScanner.refresh(); // Keep the search field, filter and focus alive during scans.
      return;
    }
    if (b.id === 'confluence' && host.dataset.bot === b.id && host.querySelector('#cfLimitsForm')){
      ConfluenceBot.refresh(); // Never rebuild a trading rule while it is being typed.
      return;
    }

    // Keep the actual controls alive. Restoring text after replacing the DOM
    // still closes pickers, loses a partially typed number and resets selections.
    const manualLedger = host.querySelector('#manualLedger');
    if (b.manual && host.dataset.bot === b.id && manualLedger){
      if (!manualLedger.contains(document.activeElement) || !document.activeElement.matches('input,select,textarea')){
        manualLedger.innerHTML = this.ledgerView('manual', L, st);
        this.bindPositionControls(manualLedger);
      }
      this.manualCalc();
      OpenTrades.refresh();
      if (typeof ManualOrders !== 'undefined') ManualOrders.refresh();
      return;
    }
    if (host.dataset.bot === 'manual') this.manualDraft = this.snapshotForm(host);
    const keep = b.manual ? this.manualDraft : null;
    host.dataset.bot = b.id;
    host.innerHTML =
      `<div class="botHead">
         ${typeof WorkspaceUI !== 'undefined' ? '<div class="wsHeroIcon">' + WorkspaceUI.icon(WorkspaceUI.botIcon(b)) + '</div>' : ''}
         <div class="botTitle"><b>${esc(typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : b.name)}</b><span>${esc(b.blurb)}</span></div>
         ${b.live
           ? `<span class="paperTag live" title="Real orders are possible from this page">REAL MONEY</span>`
           : `<span class="paperTag" title="This page cannot send an order to a broker">PAPER ONLY</span>`}
       </div>` +
      this.controls(b, cfg) +
      (b.dash ? BotDash.view()
        : b.analysis ? TradeAnalysis.view()
        : b.trades ? OpenTrades.view()
        : b.fit ? this.fitView()
        : b.liveManual ? LiveManual.view()
        : b.live ? this.liveView()
        : b.report ? BotReports.view()
        : b.brain ? this.brainView()
        : b.confluenceScanner ? ConfluenceScanner.view()
        : b.scan ? this.scannerView()
        : b.manual ? this.manualView(L, st)
        : this.botView(b, L, st));

    this.bind(b);
    this.restoreForm(keep);
  },

  showPermissions(sym = ''){
    BotDash.pairQ = sym;
    this.active = 'permissions'; this.wire();
    const search = document.getElementById('prSearch');
    if (search) search.value = sym;
    this.render();
  },
  refreshPermissions(host){
    // Refresh results only: leave the search input and its cursor alive.
    const cols = host.querySelector('#prCols');
    cols.innerHTML = BotDash.pairColumns(); BotDash.bindPairCards(cols);
    const tools = host.querySelector('#prTools');
    tools.innerHTML = BotDash.pairRulesTools();
    tools.querySelector('[data-act="prtoggle"]').addEventListener('click', () => {
      PairRules.setAuto(!PairRules.autoOn()); this.render();
    });
    tools.querySelector('[data-act="prreset"]')?.addEventListener('click', () => {
      if (confirm('Clear your manual choices and use the automatic rule for every pair?')){
        PairRules.clearAll(); this.render();
      }
    });
    host.querySelector('#prAutoStatus').textContent = PairRules.autoOn()
      ? 'Automatic blocking is ON. Your individual Allow or Block choices override it.'
      : 'Automatic blocking is OFF. Only pairs you block yourself are prohibited.';
  },

  /* ---------- keep what is half-typed ----------
     Bots.tick() rebuilds this whole page every 30 seconds. Without this, an
     amount, a stop or a note being typed into the manual form was wiped
     mid-sentence — and the fund slider snapped back to zero — for no reason the
     user could see. The values and the caret are put back after the redraw. */
  FORM_IDS: ['mbAmt', 'mbQty', 'mbSl', 'mbTp', 'mbNote', 'mbPct', 'mbTf', 'mbOrderType', 'mbEntry'],

  snapshotForm(host){
    const out = { vals: {}, focus: null, a: null, b: null,
      sym: host.querySelector('#mbSym')?.dataset.val };
    for (const id of this.FORM_IDS){
      const el = host.querySelector('#' + id);
      if (el) out.vals[id] = el.value;
    }
    const el = document.activeElement;
    if (el && el.id && this.FORM_IDS.indexOf(el.id) !== -1){
      out.focus = el.id;
      try { out.a = el.selectionStart; out.b = el.selectionEnd; } catch(e){}
    }
    return out;
  },

  restoreForm(keep){
    if (!keep || !Object.keys(keep.vals).length) return;
    for (const id of Object.keys(keep.vals)){
      const v = keep.vals[id];
      const el = document.getElementById(id);
      if (el && v != null) el.value = v;
    }
    const pick = document.getElementById('mbSym');
    if (pick && keep.sym){
      pick.dataset.val = keep.sym;
      pick.innerHTML = esc(baseAsset(keep.sym)) + ' <i>▾</i>';
    }
    if (keep.focus){
      const el = document.getElementById(keep.focus);
      if (el){
        el.focus();
        try { if (keep.a != null) el.setSelectionRange(keep.a, keep.b); } catch(e){}
      }
    }
    this.manualCalc();
  },

  controls(b, cfg){
    if (b.analysis) return '';
    if (b.confluenceScanner) return ConfluenceScanner.controls();
    if (b.id === 'confluence') return ConfluenceBot.controls();
    if (b.trades) return '<div class="botCtl"><span class="bcNote">Paper positions across your bots. Edit stop and target prices, then press <b>Apply levels</b> to save. The price graphic shows saved levels.</span></div>';
    if (b.dash) return '<div class="botCtl"><span class="bcNote">Filter with the boxes below, click a bot row or a day to narrow everything, click a column heading to sort. Paper trades only.</span></div>';
    if (b.live) return '';
    if (b.fit) return '';
    if (b.report) return '<div class="botCtl"><span class="bcNote" id="rpProgress">Ranked on the evidence each bot has produced. Nothing here can trade live.</span></div>';
    if (b.brain){
      const S = MasterBrain.state || MasterBrain.load();
      return `<div class="botCtl">
        <button class="bBtn" data-act="train">Train now</button>
        <button class="bBtn" data-act="harvest">Learn from history</button>
        <button class="bBtn go" data-act="research">Research new strategies</button>
        <button class="bBtn" data-act="labreview">Re-check lab bots</button>
        <button class="bBtn danger" data-act="brainreset">Forget everything</button>
        <span class="bcNote" id="labProgress">${S.samples.length} examples · last trained ${S.trainedAt ? this.when(S.trainedAt) : 'never'}</span>
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
    if (b.manual) return typeof ManualRules !== 'undefined' ? ManualRules.view() : '';
    return `<div class="botCtl">
      ${this.tfSel(cfg)}
      <label class="bc">Min score <input type="number" data-cfg="minScore" value="${cfg.minScore}" min="0" max="100"></label>
      <label class="bc">Max open <input type="number" data-cfg="maxOpen" value="${cfg.maxOpen}" min="0" max="10"></label>
      <label class="bc"><input type="checkbox" data-cfg="paused" ${cfg.paused ? 'checked' : ''}> Pause</label>
      ${b.conviction ? this.convictionCtl(cfg) : ''}
      <button class="bBtn" data-act="run">Run now</button>
      <button class="bBtn" data-act="bt">Backtest</button>
      <button class="bBtn danger" data-act="reset">Reset</button>
    </div>` + this.instrumentBar(b, cfg);
  },

  /* The Max Assurance bot's own knobs. Risk lives under cfg.risk, so the
     inputs use dotted keys the change handler knows how to write. */
  convictionCtl(cfg){
    const R = cfg.risk || {};
    const base = R.riskPct != null ? R.riskPct : 1, cap = R.maxRiskPct != null ? R.maxRiskPct : 3;
    return `
      <label class="bc" title="Full votes needed before it trades (the higher-timeframe trend counts as one when it agrees)">Votes needed <input type="number" data-cfg="minVotes" value="${cfg.minVotes != null ? cfg.minVotes : 3}" min="2" max="6" step="0.5"></label>
      <label class="bc" title="How far the size may grow with extra votes">Max size × <input type="number" data-cfg="maxMult" value="${cfg.maxMult != null ? cfg.maxMult : 3}" min="1" max="4" step="0.5"></label>
      <label class="bc" title="Risk per trade at the minimum vote count">Base risk % <input type="number" data-cfg="risk.riskPct" value="${base}" min="0.1" max="5" step="0.1"></label>
      <label class="bc" title="The most this bot may ever risk on one trade, whatever the votes say">Risk ceiling % <input type="number" data-cfg="risk.maxRiskPct" value="${cap}" min="0.1" max="10" step="0.1"></label>
      <span class="bcNote">at ${cfg.minVotes != null ? cfg.minVotes : 3} votes it risks ${base}%, each extra vote adds half again, never above ${cap}%</span>`;
  },

  /* one chip per instrument: click to allow or forbid, with its real record */
  /* ---------- where this bot is allowed to trade ----------
     A mode picker, then — only in manual mode — the market groups and the
     instruments inside them. The line underneath always states what the current
     settings actually resolve to, so the answer is never hidden behind a mode. */
  instrumentBar(b, cfg){
    const mode = cfg.marketMode || 'manual';
    const stats = this.perInstrument(b.id);
    const resolved = this.allowed(b);
    const G = this.marketGroups();

    const modeBtn = (k, label, hint) =>
      `<button class="mkMode${mode === k ? ' on' : ''}" data-mmode="${k}" title="${esc(hint)}">${esc(label)}</button>`;

    /* what the two automatic modes would pick, so the choice is informed */
    const fitSyms = this.fitSymbolsFor(b.id);
    const fitHint = fitSyms === null ? 'The study has not run yet'
      : fitSyms.length ? 'Study says: ' + fitSyms.map(baseAsset).join(', ')
      : 'The study paused this bot — it would trade nothing';
    const proven = this.provenSymbols(b.id);
    const brainHint = proven.length
      ? 'Has earned on: ' + proven.map(baseAsset).join(', ')
      : 'No winning instrument yet — it would trade everything until there is one';

    let body = '';
    if (mode === 'manual'){
      const chosen = cfg.groups && cfg.groups.length ? cfg.groups : null;   // null = every group
      const groupChips = Object.entries(G).map(([id, g]) => {
        const on = !chosen || chosen.includes(id);
        const n = g.syms.filter(s => resolved.includes(s)).length;
        return `<button class="mkGroup${on ? ' on' : ''}" data-mgroup="${esc(id)}">` +
          `${esc(g.label)}<i>${n}/${g.syms.length}</i></button>`;
      }).join('');

      const rows = Object.entries(G).filter(([id]) => !chosen || chosen.includes(id)).map(([id, g]) => {
        const picked = cfg.instruments && cfg.instruments.length ? cfg.instruments : null;
        const chips = g.syms.map(sym => {
          const on = !picked || picked.includes(sym);
          const st = stats[sym];
          const rec = st ? (st.net >= 0 ? '+' : '') + fmtNum(st.net) + ' · ' + st.n : 'no trades';
          const cls = st ? (st.net > 0 ? ' good' : st.net < 0 ? ' bad' : '') : '';
          const live = typeof Feed !== 'undefined' ? Feed.isLive(sym) : true;
          return `<button class="insChip${on ? ' on' : ''}${cls}${live ? '' : ' off'}" data-ins="${esc(sym)}"
            title="${esc(rec + (live ? '' : ' · not on a live feed'))}">${esc(baseAsset(sym))}<i>${esc(rec)}</i></button>`;
        }).join('');
        return `<div class="mkRow"><label>${esc(g.label)}</label><div class="mkChips">${chips}</div></div>`;
      }).join('');

      body = `<div class="mkGroups">${groupChips}
          <button class="bMini" data-mgroupall="1">${chosen ? 'All groups' : 'Clear'}</button></div>
        ${rows}
        <div class="mkTools">
          <button class="bMini" data-insall="1">${cfg.instruments && cfg.instruments.length ? 'Allow all instruments' : 'Only the winners'}</button>
        </div>`;
    }

    return `<div class="mkBar">
      <div class="mkTop">
        <span class="insLbl">Markets</span>
        ${modeBtn('fit', 'Follow Market Fit', fitHint)}
        ${modeBtn('brain', 'Follow its own record', brainHint)}
        ${modeBtn('manual', 'Choose myself', 'Pick the groups and the instruments inside them')}
        <span class="mkCount">${resolved.length} instrument${resolved.length === 1 ? '' : 's'}
          ${resolved.length ? '· ' + resolved.slice(0, 6).map(baseAsset).join(', ') + (resolved.length > 6 ? ' …' : '') : ''}</span>
      </div>
      ${mode === 'fit' ? `<div class="mkNote">${esc(fitHint)}</div>` : ''}
      ${mode === 'brain' ? `<div class="mkNote">${esc(brainHint)}</div>` : ''}
      ${body}
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
        <td class="c-sym">${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(r.sym):esc(baseAsset(r.sym))}</td>
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

    /* the Brain governs what may reach real money, so its state is shown here too */
    const lv = (typeof Live !== 'undefined') ? Live.status() : null;
    const lvArmed = (typeof Live !== 'undefined') ? Live.armedList().length : 0;
    const head = `<div class="brainState ${st.cls}"><div class="bsTop"><b>${esc(st.label)}</b><span>${esc(st.text)}</span></div></div>` +
      (lv ? `<div class="brainLive ${lv.cls}">
        <b>LIVE TRADING · ${esc(lv.label)}</b>
        <span>${esc(lv.text)}</span>
        <i>${lvArmed ? lvArmed + ' bot' + (lvArmed > 1 ? 's' : '') + ' armed. ' : ''}Every live signal still passes this Brain’s veto before it is sent.</i>
        <button class="bMini" data-act="goLivePage">Open Live Trading</button>
      </div>` : '');
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
      <div class="botNote warn">A statistical model fitted to past trades — not a forecaster. It may only refuse or shrink a trade, never invent one, and everything it touches is play money.</div>`
      + (typeof Auto !== 'undefined' ? Auto.view() : '')
      + this.labView();
  },

  /* ---------------- the Strategy Lab ----------------
     What the Brain does with what it has learned: build new bots, test them, and
     keep only the ones the evidence supports. */
  labView(){
    const L = StratLab.load();
    const live = L.recipes.filter(r => !r.retired);
    const gone = L.recipes.filter(r => r.retired);
    const G = StratLab.GUARD;

    const card = r => {
      const ev = r.evidence || {};
      const pf = ev.pf === Infinity ? '∞' : (ev.pf || 0).toFixed(2);
      const per = (ev.per || []).map(x =>
        `<span class="labIns ${x.net > 0 ? 'good' : 'bad'}">${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(x.sym):esc(baseAsset(x.sym))} ${x.net > 0 ? '+' : ''}${fmtNum(x.net)}</span>`).join('');
      return `<div class="labCard">
        <div class="labTop"><b>${esc(r.name)}</b>
          <button class="bMini danger" data-labretire="${esc(r.id)}">Retire</button></div>
        <div class="labNums">
          <span><label>TRADES</label><b>${ev.trades || 0}</b></span>
          <span><label>PROFIT FACTOR</label><b>${pf}</b></span>
          <span><label>AVERAGE</label><b class="${pctClass(ev.avgR)}">${(ev.avgR || 0).toFixed(2)}R</b></span>
          <span><label>WORST DD</label><b>-${(ev.maxDD || 0).toFixed(1)}%</b></span>
          <span><label>NET</label><b class="${pctClass(ev.net)}">${(ev.net >= 0 ? '+' : '') + fmtNum(ev.net || 0)}</b></span>
        </div>
        <div class="labIns2">${per}</div>
        <div class="labWhy">${esc(r.blurb || '')}</div>
        <div class="labWhen">Opened ${this.when(r.born)}${r.reviewedAt ? ' · re-checked ' + this.when(r.reviewedAt) : ''}</div>
      </div>`;
    };

    return `<div class="botH">STRATEGY LAB — BOTS THE BRAIN BUILT ITSELF</div>
      <div class="botNote">It mutates the numbers behind a strategy — how far the stop sits, how much reward it asks for
        each unit of risk, how strict the entry is, which timeframe it runs on — then backtests every candidate across
        several instruments. A candidate only becomes a bot if it clears all of: <b>${G.trades}+ trades</b>,
        <b>profit factor ${G.pf}</b>, <b>positive average R</b>, <b>profitable on at least half the instruments</b> and
        <b>drawdown under ${G.maxDD}%</b>. Everything it opens is paper, and every backtest it runs becomes training data.</div>
      <div class="labStats">
        ${this.stat('RECIPES TESTED', L.tried || 0)}
        ${this.stat('BOTS PUBLISHED', live.length)}
        ${this.stat('RETIRED', gone.length)}
        ${this.stat('LAST RUN', L.lastRun ? this.when(L.lastRun) : 'never')}
      </div>
      <div class="labGrid">${live.map(card).join('') ||
        '<div class="empty">Nothing published yet — press “Research new strategies”. A run tests eight recipes across three instruments and takes a couple of minutes.</div>'}</div>
      ${gone.length ? '<div class="botH">RETIRED</div>' + gone.slice(-6).reverse().map(r =>
        `<div class="botLog loss"><span class="dim2">${new Date(r.retired).toLocaleDateString()}</span> ${esc(r.name)} — ${esc(r.retiredWhy || '')}</div>`).join('') : ''}
      ${(L.log || []).slice(0, 8).map(l =>
        `<div class="botLog"><span class="dim2">${new Date(l.t).toLocaleString()}</span> ${esc(l.text)}</div>`).join('')}`;
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

  /* the Brain goes looking for new strategies */
  async research(){
    if (StratLab.busy) return toast('A research run is already going', 'warn');
    const note = document.getElementById('labProgress');
    const say = t => { if (note) note.textContent = t; };
    say('Building candidates…');
    toast('Researching new strategies — this takes a couple of minutes', 'info');
    const r = await StratLab.research(8, (i, n, name) => say('Testing ' + (i + 1) + ' of ' + n + ' — ' + name));
    if (r.error) return toast(r.error, 'warn');
    const made = r.published.length;
    toast(made
      ? 'Opened ' + made + ' new bot' + (made > 1 ? 's' : '') + ': ' + r.published.map(x => x.name).join(', ')
      : 'Tested ' + r.tested + ' recipes — none cleared the guards, so nothing was published',
      made ? 'ok' : 'info');
    this.wire();
    this.render();
  },

  async labReview(){
    const note = document.getElementById('labProgress');
    const say = t => { if (note) note.textContent = t; };
    const r = await StratLab.review((i, n, name) => say('Re-checking ' + (i + 1) + ' of ' + n + ' — ' + name));
    toast(r.checked ? 'Re-checked ' + r.checked + ' lab bots, retired ' + r.dropped : 'No lab bots to check',
      r.dropped ? 'warn' : 'ok');
    this.wire();
    this.render();
  },

  /* ---------------- Manual bot ---------------- */
  manualTicketView(live=false){
    const q = Bots.quoteFor(STORE.symbol);
    const px = q ? q.price : null;
    const dir = live ? (LiveManual.draft.side==='buy'?1:-1) : Bots.manualSide;

    /* one row of quick percentages. Clicking one fills the box with the actual
       price that far away, on the correct side for the side you are taking. */
    const ladder = which => Bots.PCT_STEPS.map(pc =>
      `<button class="pctBtn" data-mbpct="${which}:${pc}" title="${pc}% away from the price">${pc}%</button>`).join('');

    return `<div class="mbForm">
      <label class="bc">Instrument
        <button id="mbSym" class="mbPick" data-val="${esc(STORE.symbol)}" title="Search every instrument">${esc(baseAsset(STORE.symbol))} <i>▾</i></button></label>
      <div class="mbPrice"><label>Price now</label><b id="mbPx">${px == null ? '—' : fmtPrice(px)}</b></div>
      <div class="sideSeg">
        <button class="sideBtn buy${dir > 0 ? ' on' : ''}" data-mbside="1">BUY</button>
        <button class="sideBtn sell${dir < 0 ? ' on' : ''}" data-mbside="-1">SELL</button>
      </div>
      <label class="bc">Order type <select id="mbOrderType">
        <option value="market">Market — enter now</option>
        <option value="limit">Limit — buy lower / sell higher</option>
        <option value="stop">Stop entry — buy higher / sell lower</option>
      </select></label>
      <label class="bc" id="mbEntryLabel" hidden>Entry price <input id="mbEntry" type="number" step="any" min="0" placeholder="your chosen price"></label>
      <label class="bc">Amount <input id="mbAmt" type="number" step="any" min="0" placeholder="e.g. 100"></label>
      <span class="pctRow" title="what the amount means">
        <button class="pctBtn${Bots.amtMode === 'value' ? ' on' : ''}" data-mbamt="value">as position</button>
        <button class="pctBtn${Bots.amtMode === 'margin' ? ' on' : ''}" data-mbamt="margin">as margin</button>
      </span>
      <label class="bc">or Lots <input id="mbQty" type="number" step="any" min="0" placeholder="auto"></label>
      <label class="bc">Timeframe <select id="mbTf">${BotEngine.TFS.map(x =>
        `<option value="${x}"${x === STORE.tf ? ' selected' : ''}>${x}</option>`).join('')}</select></label>

      <div class="mbLine mbFundLine">
        <span class="mbFunds" id="mbFunds"></span>
        <input type="range" id="mbPct" min="0" max="100" step="1" value="0" class="fundBar">
        <span class="pctRow">${[10, 25, 50, 75, 100].map(v =>
          `<button class="pctBtn" data-mbfund="${v}">${v}%</button>`).join('')}</span>
      </div>

      <div class="mbLine">
        <label class="bc">Stop-loss <input id="mbSl" type="number" step="any" min="0" placeholder="auto"></label>
        <span class="pctRow">${ladder('sl')}</span>
      </div>
      <div class="mbLine">
        <label class="bc">Take-profit <input id="mbTp" type="number" step="any" min="0" placeholder="none"></label>
        <span class="pctRow">${ladder('tp')}</span>
      </div>

      <div class="mbLine botNote" id="mbOrderHint"></div>
      <div class="mbCalc" id="mbCalc"></div>

      <label class="bc grow">Note <input id="mbNote" type="text" placeholder="why are you taking this trade?"></label>
      <button class="bBtn go" ${live?'data-lm-act="preview"':'data-act="mopen"'} id="mbGo">${live?'Calculate & review REAL order':(dir > 0 ? 'BUY' : 'SELL')+' at market'+(px != null ? ' · ' + fmtPrice(px) : '')}</button>
    </div>
`;
  },
  manualView(L, st){
    return `<div class="wsTradeLinks"><button data-ws-bot="manual">PAPER · Manual trading</button><button data-ws-bot="liveManual">REAL · LIVE trading bot</button></div>`+this.manualTicketView()+`
    <div class="botNote">Market enters now. Limit and Stop entry wait for your price and require an explicit stop-loss.
      Leave <b>volume</b> empty to size from the risk limit when placing the order. For Market only, leave the
      <b>stop</b> empty for an automatic stop using your saved ATR multiplier; leave the
      <b>target</b> empty and the position simply runs until you close it or the stop is hit.
      Both levels can be changed at any time on the open position below, or on the Open Trades page.
      Saved stops and targets return after a restart. Paper execution pauses while the PC or browser is off
      and resumes on fresh prices when ASTRA reopens.</div>` +
      (typeof ManualAuto!=='undefined'?ManualAuto.view():'') + '<div id="manualPending"></div><section id="manualPositions"><h2 class="botH">Open manual trades</h2>' + OpenTrades.view('manual') + '</section><div id="manualLedger">' + this.ledgerView('manual', L, st) + '</div>';
  },

  /* ---------- what this trade would win or lose ----------
     Recomputed on every keystroke and after every percentage button, because a
     stop is a decision about money, not about a price. When the volume is left
     to the risk limit, the size is worked out the way the ENGINE will work it
     out, so the figures shown are the figures you actually get. */
  manualCalc(applyFit=false){
    const host = document.getElementById('mbCalc');
    if (!host) return;
    const symBtn = document.getElementById('mbSym');
    const sym = Bots.resolveSymbol(symBtn ? symBtn.dataset.val : '') || STORE.symbol;
    this.refreshManualQuote(sym);
    const liveQuote=Bots.quoteFor(sym),q = Bots.manualPreviewQuote(sym);
    const pxEl = document.getElementById('mbPx');
    if (pxEl) pxEl.textContent = q ? fmtPrice(q.price) : '—';
    const go = document.getElementById('mbGo');
    const orderType = document.getElementById('mbOrderType')?.value || 'market';
    const waiting = orderType !== 'market';
    const entryBox = document.getElementById('mbEntry');
    const entry = waiting ? parseFloat(entryBox?.value) : q?.price;
    const entryLabel = document.getElementById('mbEntryLabel');
    if (entryLabel){ entryLabel.hidden = !waiting; entryLabel.style.display = waiting ? '' : 'none'; }
    if (entryBox) entryBox.disabled = !waiting;
    if (go) go.textContent = waiting ? 'Place ' + (Bots.manualSide > 0 ? 'BUY' : 'SELL') + ' ' + (orderType === 'limit' ? 'LIMIT' : 'STOP ENTRY')
      : (Bots.manualSide > 0 ? 'BUY' : 'SELL') + ' at market' + (q ? ' · ' + fmtPrice(q.price) : ' · waiting for live price');
    const hint = document.getElementById('mbOrderHint');
    if (hint) hint.textContent = waiting
      ? (orderType === 'limit'
        ? 'Wait for the simulated buy price at or below your entry, or sell price at or above it. Spread and slippage are included.'
        : 'Wait for the simulated buy price at or above your entry, or sell price at or below it. A gap can give a worse fill.') +
        ' SL/TP percentages use your entry price. Size is fixed when placed; funds and risk are checked again at execution.'
      : 'Enters at the current executable price, including spread and slippage.';
    if (!q){
      if(go)go.disabled=true;
      const pending = Feed.bridgeHas(sym) && Feed.bridgeClock?.offset == null;
      host.innerHTML = '<i>' + (pending ? 'Checking the broker clock and waiting for a new tick. ' : '') +
        'No verified live price for ' + esc(baseAsset(sym)) + ' yet. Entries stay blocked until a fresh quote arrives.</i>';
      const fundsEl = document.getElementById('mbFunds'), F = Bots.manualFunds();
      if (fundsEl) fundsEl.textContent = fmtNum(F.free) + ' available · ' + fmtNum(F.used) + ' already committed';
      return;
    }
    /* leverage decides what "leaves your equity" means, so if it has not arrived
       yet, ask once and redraw rather than quietly showing the wrong basis */
    if (Feed.bridge && !(Feed.account && Feed.account.leverage) && !this._acctAsked){
      this._acctAsked = true;
      Feed.loadAccount().then(a => { if (a && a.leverage) this.manualCalc(); });
    }

    const dir = Bots.manualSide;
    const sl = parseFloat((document.getElementById('mbSl') || {}).value);
    const tp = parseFloat((document.getElementById('mbTp') || {}).value);
    const stopDist = sl > 0 ? Math.abs(entry - sl) : 0;

    /* the SAME function the order uses, so this is not a different trade */
    const size = waiting && typeof ManualOrders !== 'undefined' ? ManualOrders.preview(ManualOrders.form(),q)
      : Bots.manualSize(sym, q.price, stopDist, sl);
    if(size.estimate&&!size.gate)size.gate=size.estimate;
    this.manualPreviewPlan=size.plan;
    if(applyFit&&size.plan?.estimate&&Bots.manualCfg().manualAutoFit!==false)this.applyManualFit(size.plan);
    const automaticStop=!waiting&&!(sl>0);
    if(go){go.disabled=(!!size.reason&&!automaticStop)||!liveQuote;
      go.title=go.disabled?(size.reason||'Waiting for a fresh broker price'):'';}
    const fill = size.gate ? size.gate.fill : q.price;
    const m = Bots.marginFor(size.qty*(size.gate?.fx?.loss??1), fill, size.lev);

    const risk = size.riskCash != null ? size.riskCash : null;
    const usedTp=size.plan?.sig?.tp??tp,usedSl=size.plan?.sig?.sl??sl;
    const exit = size.gate ? usedTp * (1 - dir * size.gate.R.slippagePct / 100) : usedTp;
    const quoteReward=(exit-fill)*dir;
    const reward = (size.gate && usedTp > 0) ? (quoteReward*(size.gate.fx?.[quoteReward<0?'loss':'profit']??1) -
      (exit + fill)*(size.gate.fx?.loss??1) * BotEngine.commissionFrac(sym, size.gate.R)) * size.qty : null;
    const rr = (risk > 0 && reward > 0) ? reward / risk : null;
    const eq = Bots.ledgers.manual ? Bots.ledgers.manual.equity : 0;

    const cell = (label, value, cls) =>
      `<span class="mbCell"><label>${esc(label)}</label><b class="${cls || ''}">${value}</b></span>`;

    /* the funds line and the slider position follow whatever the amount is now */
    const F = Bots.manualFunds();
    const fundsEl = document.getElementById('mbFunds');
    const bar = document.getElementById('mbPct');
    const allocation = size.gate ? m.notional : (size.requestedNotional || 0);
    const share = F.free > 0 ? Math.min(100, allocation / F.free * 100) : 0;
    if (bar && document.activeElement !== bar) bar.value = Math.round(share);
    if (fundsEl) fundsEl.innerHTML =
      `<b>${Math.round(share)}%</b> of your free funds` +
      `<i>${fmtNum(allocation)} ${size.reason ? 'requested (entry blocked)' : 'into this trade'} · ${fmtNum(F.free)} available now` +
      (F.used > 0 ? ' · ' + fmtNum(F.used) + ' already committed' : '') + `</i>`;

    host.innerHTML =
      cell('Estimated broker margin', m.margin == null
             ? fmtNum(m.notional) + ' (no leverage known)'
             : fmtNum(m.margin) + (eq > 0 ? ' · ' + (m.margin / eq * 100).toFixed(1) + '% of it' : ''), 'warn') +
      cell('Account allocation', fmtNum(m.notional)) +
      (risk != null && eq > 0 && risk / eq > 0.05
        ? cell('⚠ Stop would cost', (risk / eq * 100).toFixed(1) + '% of the account', 'down') : '') +
      cell('Size', size.qty > 0 ? (size.lots != null ? size.lots + ' lot' : +size.qty.toPrecision(6) + ' units') : '—') +
      cell('If the stop is hit', risk == null ? 'set a stop' : '-' + fmtNum(risk), 'down') +
      cell('If the target is hit', reward == null ? 'no target' : (reward>=0?'+':'') + fmtNum(reward), reward<0?'down':'up') +
      cell('Reward to risk', rr == null ? '—' : rr.toFixed(2) + ' : 1', rr == null ? '' : (rr >= 1 ? 'up' : 'down')) +
      cell('Stop is', usedSl > 0 && entry > 0 ? (Math.abs(entry-usedSl) / entry * 100).toFixed(2) + '% away' : '—') +
      cell('Target is', usedTp > 0 && entry > 0 ? (Math.abs(usedTp - entry) / entry * 100).toFixed(2) + '% away' : '—') +
      (size.plan?.adjustments?.length?cell('Auto-fit',esc(size.plan.adjustments.join(' · '))):'') +
      (size.gate?.fx?.from&&size.gate.fx.from!==size.gate.fx.currency?cell('Cash currency',esc(size.gate.fx.currency+' · '+size.gate.fx.from+' conversion estimate, fixed at entry')):'') +
      (!liveQuote?cell('Preview only','Last available price; waiting for a fresh tradable quote','warn'):'') +
      (size.reason ? cell(automaticStop?'Automatic stop':waiting ? 'Order blocked' : 'Entry blocked', esc(size.reason), automaticStop?'':'down')
        : cell(waiting ? 'Estimate at entry' : 'Sized by', waiting ? fmtPrice(fill) + ' · rechecked at execution' : esc(size.why)));
    if (typeof ManualOrders !== 'undefined') ManualOrders.refresh();
  },
  applyManualFit(plan){
    const gate=plan.estimate;if(!gate)return;
    const set=(id,v)=>{const el=document.getElementById(id);if(el)el.value=v;};
    set('mbSl',plan.sig.sl);if(plan.sig.tp!=null)set('mbTp',plan.sig.tp);
    if(gate.lots!=null){set('mbQty',gate.lots);set('mbAmt','');}
    else set('mbAmt',gate.notional);
  },

  /* ---------------- automated bot ---------------- */
  botView(b, L, st){
    if (b.id === 'confluence'){
      const display = ConfluenceBot.displayLedger(L);
      return ConfluenceBot.view() + '<div id="cfLedger">' + this.ledgerView(b.id, display, BotEngine.stats(display)) + '</div>';
    }
    return this.ledgerView(b.id, L, st) + this.btView(b.id);
  },

  ledgerView(id, L, st){
    const pf = st.profitFactor === Infinity ? '∞' : st.profitFactor.toFixed(2);
    const icon = name => typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.icon(name) : '';
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
      ${typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.equity(L) : ''}
      <div class="botGrid">
        ${id==='manual'?'':`<div class="botCol"><div class="botH">${icon('positions')} OPEN POSITIONS · ${L.open.length}</div>${this.openView(id, L)}</div>`}
        <div class="botCol"><div class="botH">${icon('clock')} CLOSED HISTORY</div>${this.closedView(L)}</div>
        <div class="botCol"><div class="botH">${icon('scanner')} DECISIONS</div>${this.decisionView(L)}</div>
        <div class="botCol"><div class="botH">${icon('report')} LESSONS FROM LOSSES</div>${this.lessonView(L)}
          <div class="botH">${icon('chart')} DAILY</div>${this.dailyView(L)}</div>
      </div>`;
  },

  stat(label, val, sign){
    const cls = sign == null ? '' : (sign > 0 ? 'up' : sign < 0 ? 'down' : '');
    return `<div class="obStat"><label>${esc(label)}</label><b class="${cls}">${val}</b></div>`;
  },

  openView(id, L){
    if (!L.open.length) return '<div class="empty">No open positions</div>';
    /* the stop and the target are editable on a hand-placed trade. They stay
       read-only for an automated bot: moving its levels mid-trade would falsify
       the record that decides whether it earns real money. */
    const editable = id === 'manual';
    return L.open.map(p => {
      const u = p.unreal != null ? p.unreal : 0;
      const levels = editable
        ? `<span class="posEdit">
             <label>SL<input type="number" step="any" data-psl="${p.id}" value="${p.sl}"></label>
             <label>TP<input type="number" step="any" data-ptp="${p.id}" value="${p.tp == null ? '' : p.tp}" placeholder="none"></label>
             <button class="bMini" data-pset="${p.id}">Set</button>
           </span>`
        : `<span class="dim2">SL ${fmtPrice(p.sl)} · TP ${p.tp == null ? 'none' : fmtPrice(p.tp)}${p.tp1Done ? ' · half banked, stop at breakeven' : ''}</span>`;
      return `<div class="botRow">
        <b class="${p.dir > 0 ? 'up' : 'down'}">${p.dir > 0 ? 'BUY' : 'SELL'} ${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(p.sym):esc(baseAsset(p.sym))}</b>
        <span class="dim2">${esc(p.tf)} · ${esc(p.model || '')}${p.riskMult > 1 ? ' · <b class="ok">size ×' + p.riskMult.toFixed(1) + '</b>' : ''}</span>
        <span>${p.lots ? p.lots + ' lot' : +p.qty.toPrecision(4)} @ ${fmtPrice(p.entry)}</span>
        ${levels}
        <span class="${pctClass(u)}">${(u >= 0 ? '+' : '') + fmtNum(u)}</span>
        <span class="dim2">opened ${this.when(p.entryTime)}</span>
        <button class="bMini" data-close="${id}:${p.id}">Close</button></div>`;
    }).join('');
  },

  closedView(L){
    if (!L.closed.length) return '<div class="empty">No closed trades yet</div>';
    return L.closed.slice(0, 30).map(t => `<div class="botRow">
      <b class="${t.dir > 0 ? 'up' : 'down'}">${t.dir > 0 ? 'BUY' : 'SELL'} ${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(t.sym):esc(baseAsset(t.sym))}</b>
      <span class="dim2">${esc(t.tf)} · ${esc(t.model || '')}${t.riskMult > 1 ? ' · size ×' + t.riskMult.toFixed(1) : ''}</span>
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
      <div class="botH">BACKTEST · ${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(r.sym):esc(baseAsset(r.sym))} ${esc(r.tf)} · ${r.bars} candles
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
    if (b.id === 'confluence' || b.confluenceScanner) ConfluenceScanner.bind(host);
    if (b.id === 'confluence') ConfluenceBot.bind(host);
    /* one handler for every sortable table in the workspace */
    host.querySelectorAll('[data-tsort]').forEach(el => el.addEventListener('click', () => {
      this.setTableSort(el.dataset.tsort, el.dataset.tkey);
      this.render();
    }));
    /* the Open Trades page runs a one-second refresh; leaving it must stop
       that timer, or every page after it keeps ticking in the background */
    if (b.trades) OpenTrades.bind(host); else if (b.manual) OpenTrades.bind(host.querySelector('#manualPositions')); else OpenTrades.stop();
    if(b.manual&&typeof ManualAuto!=='undefined')ManualAuto.bind(host);
    if (b.dash) BotDash.bind(host);
    if (b.analysis) TradeAnalysis.bind(host);
    if (b.fit) host.querySelectorAll('[data-fitsort]').forEach(el =>
      el.addEventListener('click', () => { MarketFit.setSort(el.dataset.fitsort); this.render(); }));
    if (b.liveManual) LiveManual.bind(host);
    else if (b.live) this.bindLive(host);
    host.querySelectorAll('[data-cfg]').forEach(el => {
      el.addEventListener('change', () => {
        const cfg = this.cfg(b.id);
        const k = el.dataset.cfg;
        const val = el.type === 'checkbox' ? el.checked : (el.type === 'number' ? parseFloat(el.value) : el.value);
        if (el.type === 'number' && !Number.isFinite(val)) return;
        if (k.includes('.')){
          /* dotted key → nested object, e.g. risk.maxRiskPct */
          const [g, kk] = k.split('.');
          cfg[g] = Object.assign({}, cfg[g] || {}); cfg[g][kk] = val;
        } else cfg[k] = val;
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
      if (a === 'permissions') this.showPermissions();
      if (a === 'train'){ const r = MasterBrain.train(); toast(r.ok ? 'Retrained on every example it holds' : r.reason, r.ok ? 'ok' : 'warn'); this.render(); }
      if (a === 'harvest') this.harvest();
      if (a === 'research') this.research();
      if (a === 'labreview') this.labReview();
      if (a === 'assessAll') BotReports.assessAll();
      if (a === 'pdf') BotReports.exportPdf();
      if (a === 'csv') BotDash.csv();
      if (a === 'xls') BotDash.excel();
      if (a === 'dashpdf') BotDash.pdf();
      if (a === 'autotoggle'){ Auto.setOn(!Auto.load().on); }
      if (a === 'fitsweep') this.fitSweep();
      if (a === 'fitsplit') this.fitSplit();
      if (a === 'fitapply') this.fitApply();
      if (a === 'fithistclear'){
        if (confirm('Delete every archived Market Fit study?')) { MarketFit.clearHistory(); this.render(); }
      }
      if (a === 'goLivePage'){ this.active = 'live'; this.wire(); this.render(); }
      if (a.indexOf('lv') === 0) this.liveAction(a);
      if (a === 'clearf'){ BotDash.f = Object.assign(BotDash.f, { bot: 'all', sym: 'all', tf: 'all', side: 'all', result: 'all', day: 'all' }); this.render(); }
      if (a === 'prtoggle'){ PairRules.setAuto(!PairRules.autoOn()); this.render(); }
      if (a === 'dashfoldall'){
        const ids = BotDash._shownIds || BotDash._secIds || BotDash.DEFAULT_ORDER;
        const anyShut = ids.some(id => BotDash.folded[id]);
        BotDash.folded = {};
        if (!anyShut) for (const id of ids) BotDash.folded[id] = true;
        lsSet('astra_dashfold', BotDash.folded);
        this.render();
      }
      if (a === 'dashorderreset'){ BotDash.saveOrder(BotDash.DEFAULT_ORDER.slice()); this.render(); }
      if (a === 'prclear'){ BotDash.pairQ = ''; this.render(); }
      if (a === 'prreset'){
        if (confirm('Forget every pair you prohibited or allowed by hand, and go back to the record alone?')){
          PairRules.clearAll(); this.render();
        }
      }
      if (a === 'brainreset'){ if (confirm('Make the Master Brain forget every example it has learned?')){ MasterBrain.reset(); this.render(); } }
    }));
    /* ---- the manual form: side, quick percentages, live arithmetic ---- */
    if (b.manual){
      if (typeof ManualRules !== 'undefined') ManualRules.bind(host);
      const recalc = (apply=true) => this.manualCalc(apply);
      ['mbSl', 'mbTp', 'mbQty', 'mbAmt', 'mbEntry'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', () => {
          // Clear the alternative BEFORE calculating, so the preview reads the
          // same size box that the eventual order will use.
          const otherId = id === 'mbAmt' ? 'mbQty' : id === 'mbQty' ? 'mbAmt' : null;
          const other = otherId && document.getElementById(otherId);
          if (other && el.value) other.value = '';
          recalc(false);
        });
        if(el)el.addEventListener('change',()=>recalc(true));
      });
      document.getElementById('mbOrderType')?.addEventListener('change', recalc);
      /* pressing the instrument opens the search picker */
      const pick = document.getElementById('mbSym');
      if (pick) pick.addEventListener('click', () => SymbolSearch.open(sym => {
        pick.dataset.val = sym;
        pick.innerHTML = esc(baseAsset(sym)) + ' <i>▾</i>';
        const slb = document.getElementById('mbSl'), tpb = document.getElementById('mbTp');
        const entryBox = document.getElementById('mbEntry');
        if (entryBox) entryBox.value = '';
        if (slb) slb.value = ''; if (tpb) tpb.value = '';      // levels belonged to the old instrument
        recalc();
      }));
      host.querySelectorAll('[data-mbside]').forEach(el => el.addEventListener('click', () => {
        const previousSide=Bots.manualSide;
        Bots.manualSide = parseInt(el.dataset.mbside, 10);
        host.querySelectorAll('[data-mbside]').forEach(x =>
          x.classList.toggle('on', x === el));
        const go = document.getElementById('mbGo');
        const q = Bots.manualPreviewQuote(Bots.resolveSymbol((document.getElementById('mbSym') || {}).dataset.val) || STORE.symbol);
        if (go) go.textContent = (Bots.manualSide > 0 ? 'BUY' : 'SELL') + ' at market' +
          (q ? ' · ' + fmtPrice(q.price) : '');
        /* the levels were on the other side of the market a moment ago */
        const sl = document.getElementById('mbSl'), tp = document.getElementById('mbTp');
        if(previousSide!==Bots.manualSide){
          const reference=document.getElementById('mbOrderType')?.value==='market'?q?.price:+document.getElementById('mbEntry')?.value;
          if(Bots.manualCfg().manualAutoFit!==false&&reference>0){
            if(+sl?.value>0)sl.value=reference-Bots.manualSide*Math.abs(+sl.value-reference);
            if(+tp?.value>0)tp.value=reference+Bots.manualSide*Math.abs(+tp.value-reference);
          }else{if (sl) sl.value = ''; if (tp) tp.value = '';}
        }
        recalc();
      }));
      /* the fund bar is a way of SAYING an amount: it fills the amount box with
         that share of the free funds and lets every other figure follow. It is
         read as position value, never as margin — "trade half my account" means
         a position worth half the account, not half the account of margin, which
         at 1:2000 would be a position twenty times the account. */
      const useShare = pct => {
        const F = Bots.manualFunds();
        const amtBox = document.getElementById('mbAmt'), lotBox = document.getElementById('mbQty');
        if (amtBox) amtBox.value = pct > 0 ? +(F.free * pct / 100).toFixed(2) : '';
        if (lotBox) lotBox.value = '';
        Bots.amtMode = 'value';
        host.querySelectorAll('[data-mbamt]').forEach(x =>
          x.classList.toggle('on', x.dataset.mbamt === 'value'));
        host.querySelectorAll('[data-mbfund]').forEach(x =>
          x.classList.toggle('on', +x.dataset.mbfund === pct));
        recalc();
      };
      const barEl = document.getElementById('mbPct');
      if (barEl) barEl.addEventListener('input', () => useShare(+barEl.value));
      host.querySelectorAll('[data-mbfund]').forEach(el =>
        el.addEventListener('click', () => { 
          const v = +el.dataset.mbfund;
          if (barEl) barEl.value = v;
          useShare(v);
        }));

      host.querySelectorAll('[data-mbamt]').forEach(el => el.addEventListener('click', () => {
        Bots.amtMode = el.dataset.mbamt;
        host.querySelectorAll('[data-mbamt]').forEach(x => x.classList.toggle('on', x === el));
        recalc();
      }));
      host.querySelectorAll('[data-mbpct]').forEach(el => el.addEventListener('click', () => {
        const [which, pc] = el.dataset.mbpct.split(':');
        const sym = Bots.resolveSymbol((document.getElementById('mbSym') || {}).dataset.val) || STORE.symbol;
        const q = Bots.manualPreviewQuote(sym);
        const waiting = document.getElementById('mbOrderType')?.value !== 'market';
        const reference = waiting ? parseFloat(document.getElementById('mbEntry')?.value) : q?.price;
        if (!(reference > 0)) return toast(waiting ? 'Set your entry price first' : 'No live price yet for ' + baseAsset(sym), 'warn');
        const box = document.getElementById(which === 'tp' ? 'mbTp' : 'mbSl');
        if (box) box.value = +Bots.levelAt(reference, Bots.manualSide, parseFloat(pc), which).toFixed(8);
        host.querySelectorAll('[data-mbpct^="' + which + ':"]').forEach(x => x.classList.toggle('on', x === el));
        recalc();
      }));
      recalc();
    }

    this.bindPositionControls(host);

    /* the three ways a bot can decide where to trade */
    host.querySelectorAll('[data-mmode]').forEach(el => el.addEventListener('click', () => {
      const cfg = this.cfg(b.id);
      cfg.marketMode = el.dataset.mmode;
      this.saveCfg(b.id);
      this.render();
    }));

    /* whole market groups on and off */
    host.querySelectorAll('[data-mgroup]').forEach(el => el.addEventListener('click', () => {
      const cfg = this.cfg(b.id);
      const all = Object.keys(this.marketGroups());
      let list = (cfg.groups && cfg.groups.length) ? cfg.groups.slice() : all.slice();
      const id = el.dataset.mgroup;
      list = list.includes(id) ? list.filter(x => x !== id) : list.concat([id]);
      cfg.groups = list.length === all.length ? null : list;
      this.saveCfg(b.id);
      this.render();
    }));
    const gAll = host.querySelector('[data-mgroupall]');
    if (gAll) gAll.addEventListener('click', () => {
      const cfg = this.cfg(b.id);
      cfg.groups = (cfg.groups && cfg.groups.length) ? null : Object.keys(this.marketGroups()).slice(0, 1);
      this.saveCfg(b.id);
      this.render();
    });

    /* single instruments, scoped to the groups actually on screen */
    host.querySelectorAll('[data-ins]').forEach(el => el.addEventListener('click', () => {
      const cfg = this.cfg(b.id);
      const pool = (cfg.groups && cfg.groups.length)
        ? this.groupSymbols(cfg.groups)
        : this.groupSymbols(Object.keys(this.marketGroups()));
      let list = (cfg.instruments && cfg.instruments.length) ? cfg.instruments.slice() : pool.slice();
      const sym = el.dataset.ins;
      list = list.includes(sym) ? list.filter(x => x !== sym) : list.concat([sym]);
      /* everything ticked means "no filter", which keeps future instruments in */
      cfg.instruments = pool.every(s => list.includes(s)) ? null : list;
      this.saveCfg(b.id);
      this.render();
    }));
    const allBtn = host.querySelector('[data-insall]');
    if (allBtn) allBtn.addEventListener('click', () => {
      const cfg = this.cfg(b.id);
      if (cfg.instruments && cfg.instruments.length) cfg.instruments = null;      // allow everything again
      else {
        const stats = this.perInstrument(b.id);
        const winners = Object.entries(stats).filter(([, v]) => v.net > 0).map(([k]) => k);
        if (!winners.length) return toast('No instrument has made money yet — nothing to narrow to', 'warn');
        cfg.instruments = winners;
        toast('Now trading only where it has actually earned: ' + winners.map(baseAsset).join(', '), 'ok');
      }
      this.saveCfg(b.id);
      this.render();
    });
    host.querySelectorAll('[data-labretire]').forEach(el => el.addEventListener('click', () => {
      const rec = StratLab.state.recipes.find(r => r.id === el.dataset.labretire);
      if (!rec) return;
      if (!confirm('Retire ' + rec.name + '?')) return;
      StratLab.retire(rec.id, 'retired by hand');
      this.render();
    }));
    host.querySelectorAll('[data-gobot]').forEach(el => el.addEventListener('click', () => {
      this.active = el.dataset.gobot;
      this.wire(); this.render();
    }));
    host.querySelectorAll('[data-open]').forEach(el =>
      el.addEventListener('click', () => (typeof WorkspaceUI!=='undefined'?WorkspaceUI.openChart(el.dataset.open):App.setSymbol(el.dataset.open))));
    host.querySelectorAll('.scTable tbody tr[data-sym]').forEach(tr =>
      tr.addEventListener('dblclick', () => (typeof WorkspaceUI!=='undefined'?WorkspaceUI.openChart(tr.dataset.sym):App.setSymbol(tr.dataset.sym))));
  },

  bindPositionControls(host){
    host.querySelectorAll('[data-pset]').forEach(el => el.addEventListener('click', () => {
      const posId = +el.dataset.pset;
      const slEl = host.querySelector('[data-psl="' + posId + '"]');
      const tpEl = host.querySelector('[data-ptp="' + posId + '"]');
      const sl = slEl ? parseFloat(slEl.value) : NaN;
      const tpRaw = tpEl ? tpEl.value.trim() : '';
      this.editPos('manual', posId, { sl: isNaN(sl) ? null : sl,
        tp: tpRaw === '' ? 0 : parseFloat(tpRaw) });
    }));
    host.querySelectorAll('[data-close]').forEach(el => el.addEventListener('click', () => {
      const [bot, id] = el.dataset.close.split(':');
      this.closePos(bot, +id);
    }));
  },
});
