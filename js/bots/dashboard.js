/* ASTRA Terminal — the bot dashboard.

   Every number every bot has produced, in one place: the totals, the day-by-day
   record, the timeframes and instruments each one traded, and a full log of every
   position with the exact time it was entered and the exact time it was closed.

   Paper only. None of these trades ever reached a broker. */
const BotDash = {

  f: { bot: 'all', sym: 'all', tf: 'all', side: 'all', result: 'all', day: 'all',
       sort: 'exitTime', dir: -1, limit: 250 },

  /* ---------- gathering ---------- */
  /* only real trading bots — the Dashboard, Market Fit, Live Trading, Report,
     Scanner and Brain are pages, not bots, and have no ledger of their own */
  bots(){
    return BOTS.filter(b => !Bots.isPage(b) && Bots.ledger(b.id));
  },

  allTrades(){
    const out = [];
    for (const b of this.bots()){
      const L = Bots.ledger(b.id);
      if (!L) continue;
      for (const t of L.closed) out.push(Object.assign({ bot: b.id, botName: b.name }, t));
    }
    return out;
  },

  allOpen(){
    const out = [];
    for (const b of this.bots()){
      const L = Bots.ledger(b.id);
      if (!L) continue;
      for (const p of L.open) out.push(Object.assign({ bot: b.id, botName: b.name }, p));
    }
    return out.sort((a, b) => b.entryTime - a.entryTime);
  },

  match(t){
    const f = this.f;
    if (f.bot !== 'all' && t.bot !== f.bot) return false;
    if (f.sym !== 'all' && t.sym !== f.sym) return false;
    if (f.tf !== 'all' && t.tf !== f.tf) return false;
    if (f.side !== 'all' && (f.side === 'buy' ? t.dir <= 0 : t.dir > 0)) return false;
    if (f.result !== 'all' && (f.result === 'win' ? t.pnl <= 0 : t.pnl > 0)) return false;
    if (f.day !== 'all' && this.dayOf(t.exitTime) !== f.day) return false;
    return true;
  },

  dayOf(ts){
    const d = new Date(ts);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  /* ---------- formatting ---------- */
  clock(ts){
    if (!ts) return '—';
    const d = new Date(ts);
    return String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + ' ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ':' +
      String(d.getSeconds()).padStart(2, '0');
  },
  /* a length of time, spelled out — kept separate from held() so an average
     duration can be formatted without inventing two timestamps for it */
  dur(ms){
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return s + 's';
    if (s < 3600) return Math.floor(s / 60) + 'm ' + (s % 60) + 's';
    if (s < 86400) return Math.floor(s / 3600) + 'h ' + Math.round(s % 3600 / 60) + 'm';
    return Math.floor(s / 86400) + 'd ' + Math.round(s % 86400 / 3600) + 'h';
  },
  held(a, b){
    if (!a || !b) return '—';
    return this.dur(b - a);
  },
  pf(v){ return v == null ? '—' : (v === Infinity ? '∞' : v.toFixed(2)); },
  money(v){ return (v >= 0 ? '+' : '') + fmtNum(v); },

  /* ---------- summarising any set of trades ---------- */
  /* what one trade actually put on the table: the full value of the position,
     not the margin. qty is in units of the instrument, so qty x entry is the
     money the position controlled. */
  notional(t){ return Math.abs((t.qty || 0) * (t.entry || 0)) * BotEngine.cashRate(t,true); },

  /* and what it stood to lose if the stop had been hit */
  risked(t){
    if (!t.sl || !t.entry) return 0;
    return Math.abs(t.entry - t.sl) * (t.qty || 0) * BotEngine.cashRate(t,true);
  },

  sum(list){
    const won = list.filter(t => t.pnl > 0), lost = list.filter(t => t.pnl <= 0);
    const gw = won.reduce((a, t) => a + t.pnl, 0);
    const gl = Math.abs(lost.reduce((a, t) => a + t.pnl, 0));
    const volume = list.reduce((a, t) => a + this.notional(t), 0);
    const risked = list.reduce((a, t) => a + this.risked(t), 0);
    const net = list.reduce((a, t) => a + t.pnl, 0);
    return {
      n: list.length, won: won.length, lost: lost.length,
      winRate: list.length ? won.length / list.length * 100 : 0,
      net,
      fees: list.reduce((a, t) => a + t.fees, 0),
      /* turnover, the average position, and what that turnover returned */
      volume, risked,
      avgSize: list.length ? volume / list.length : 0,
      biggest: list.reduce((a, t) => Math.max(a, this.notional(t)), 0),
      roiVol: volume > 0 ? net / volume * 100 : 0,
      roiRisk: risked > 0 ? net / risked * 100 : 0,
      gw, gl, pf: gl > 0 ? gw / gl : (gw > 0 ? Infinity : 0),
      avgWin: won.length ? gw / won.length : 0,
      avgLoss: lost.length ? gl / lost.length : 0,
      avgR: list.length ? list.reduce((a, t) => a + (t.r || 0), 0) / list.length : 0,
      best: list.reduce((a, t) => (!a || t.pnl > a.pnl) ? t : a, null),
      worst: list.reduce((a, t) => (!a || t.pnl < a.pnl) ? t : a, null),
      first: list.reduce((a, t) => (!a || t.entryTime < a) ? t.entryTime : a, null),
      last: list.reduce((a, t) => (!a || t.exitTime > a) ? t.exitTime : a, null),
    };
  },

  /* group a list by any key, summarise each group */
  group(list, key){
    const map = {};
    for (const t of list) (map[t[key]] = map[t[key]] || []).push(t);
    return Object.entries(map).map(([k, v]) => Object.assign({ key: k }, this.sum(v)))
      .sort((a, b) => b.net - a.net);
  },

  /* ---------- foldable, re-orderable sections ----------
     The page had grown to nine stacked tables under identical little captions,
     which is a great deal to read top to bottom. Each block is now a titled card
     you can fold shut, and move up or down into the order you actually read in.
     Both the folded set and the order are remembered between visits. */
  folded: lsGet('astra_dashfold', { pairs: true }),
  order: lsGet('astra_dashorder', null),

  DEFAULT_ORDER: ['money', 'bots', 'instruments', 'breakdowns', 'days', 'open', 'log', 'pairs'],

  secOrder(ids){
    const saved = Array.isArray(this.order) ? this.order : this.DEFAULT_ORDER;
    /* a section added later appears where the default puts it, never lost */
    const out = saved.filter(id => ids.indexOf(id) !== -1);
    for (const id of this.DEFAULT_ORDER) if (ids.indexOf(id) !== -1 && out.indexOf(id) === -1) out.push(id);
    for (const id of ids) if (out.indexOf(id) === -1) out.push(id);
    return out;
  },
  saveOrder(list){ this.order = list; lsSet('astra_dashorder', list); },
  toggleFold(id){
    if (this.folded[id]) delete this.folded[id]; else this.folded[id] = true;
    lsSet('astra_dashfold', this.folded);
  },
  /* Move a section past the next VISIBLE one. "Open right now" disappears when
     nothing is open, and swapping with an invisible neighbour looked like the
     arrow did nothing at all. The hidden ids keep their place in the saved
     order, so they come back where they belong. */
  moveSec(id, dir){
    const full = this.secOrder(this._secIds || this.DEFAULT_ORDER).slice();
    const shownIds = this._shownIds || full;
    const shown = full.filter(x => shownIds.indexOf(x) !== -1);
    const si = shown.indexOf(id), sj = si + dir;
    if (si < 0 || sj < 0 || sj >= shown.length) return;
    const other = shown[sj];
    const i = full.indexOf(id), j = full.indexOf(other);
    if (i < 0 || j < 0) return;
    full[i] = other; full[j] = id;
    this.saveOrder(full);
  },

  section(id, title, sub, body, tools){
    const shut = !!this.folded[id];
    return '<section class="dashSec' + (shut ? ' shut' : '') + '" data-sec="' + esc(id) + '">' +
      '<header class="dashSecHead">' +
        '<button class="secFold" data-secfold="' + esc(id) + '" title="' +
          (shut ? 'Open' : 'Fold') + ' this section"><i>' + (shut ? '\u25B8' : '\u25BE') + '</i></button>' +
        '<h3>' + (typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.icon({money:'report',bots:'bot',instruments:'layers',breakdowns:'chart',days:'clock',open:'positions',log:'report',pairs:'shield'}[id]) + ' ' : '') + title + '</h3>' +
        (sub ? '<span class="dashSecSub">' + esc(sub) + '</span>' : '') +
        '<span class="dashSecTools">' + (tools || '') +
          '<button class="bMini secMove" data-secup="' + esc(id) + '" title="Move up">\u25B2</button>' +
          '<button class="bMini secMove" data-secdown="' + esc(id) + '" title="Move down">\u25BC</button>' +
        '</span>' +
      '</header>' +
      (shut ? '' : '<div class="dashSecBody">' + body + '</div>') +
      '</section>';
  },

  /* ---------- the page ---------- */
  view(){
    const all = this.allTrades();
    const shown = all.filter(t => this.match(t));
    const open = this.allOpen().filter(p => this.f.bot === 'all' || p.bot === this.f.bot);
    const S = this.sum(shown);
    const days = this.dayRows(shown);
    const bestDay = days.reduce((a, d) => (!a || d.net > a.net) ? d : a, null);
    const worstDay = days.reduce((a, d) => (!a || d.net < a.net) ? d : a, null);

    const secs = {
      money: () => this.section('money', 'THE MONEY',
        'what the account actually did', this.capitalView(S, all)),
      bots: () => this.section('bots', 'EVERY BOT, SIDE BY SIDE',
        this.bots().length + ' bots', this.botTable(all)),
      instruments: () => this.section('instruments', 'EVERY INSTRUMENT, IN FULL',
        'whole history per pair \u2014 click a row for its record',
        this.instrumentTable(all, this.allOpen())),
      breakdowns: () => this.section('breakdowns', 'BREAKDOWNS',
        'the filtered trades, cut four ways',
        '<div class="dashCols">' +
          '<div class="dashCol"><h4 class="dashColH">By timeframe</h4>' + this.breakdown(shown, 'tf', 'Timeframe') + '</div>' +
          '<div class="dashCol"><h4 class="dashColH">By instrument</h4>' + this.breakdown(shown, 'sym', 'Instrument', baseAsset) + '</div>' +
          '<div class="dashCol"><h4 class="dashColH">By direction</h4>' + this.sideTable(shown) + '</div>' +
          '<div class="dashCol"><h4 class="dashColH">How they ended</h4>' + this.breakdown(shown, 'reason', 'Exit reason') + '</div>' +
        '</div>'),
      days: () => this.section('days', 'DAY BY DAY',
        days.length + ' day' + (days.length === 1 ? '' : 's') +
        (this.f.day !== 'all' ? ' \u00B7 showing ' + this.f.day : ''),
        this.dayStrip(days) + this.dayTable(days)),
      open: () => open.length ? this.section('open', 'OPEN RIGHT NOW',
        open.length + ' position' + (open.length === 1 ? '' : 's'), this.openTable(open)) : '',
      log: () => this.section('log', 'TRADE LOG',
        shown.length + ' trade' + (shown.length === 1 ? '' : 's') +
        (shown.length > this.f.limit ? ' \u00B7 newest ' + this.f.limit + ' shown' : ''),
        this.logTable(shown),
        '<button class="bMini" data-act="xls">Excel</button>' +
        '<button class="bMini" data-act="csv">CSV</button>' +
        '<button class="bMini" data-act="dashpdf">PDF</button>'),
      pairs: () => this.section('pairs', 'PERMITTED &amp; PROHIBITED',
        PairRules.columns('').blocked.length + ' prohibited',
        '<div class="botNote">Manage the shared list on the Instrument permissions page.</div>' +
        '<button class="bBtn" data-act="permissions">Instrument permissions</button>'),
    };
    this._secIds = Object.keys(secs);
    /* a section that renders to nothing is not on the page, so it must not take
       part in the up/down ordering either */
    const rendered = this.secOrder(this._secIds).map(id => ({ id, html: secs[id]() })).filter(x => x.html);
    this._shownIds = rendered.map(x => x.id);
    const anyShut = this._shownIds.some(id => this.folded[id]);

    return `<div class="dashWrap">
      ${this.filterBar(all)}
      <div class="botStats">
        ${Bots.stat('TRADES', S.n)}
        ${Bots.stat('WON', S.won + ' \u00B7 ' + Math.round(S.winRate) + '%', S.won ? 1 : 0)}
        ${Bots.stat('LOST', S.lost + ' \u00B7 ' + Math.round(100 - S.winRate) + '%', -1)}
        ${Bots.stat('MONEY WON', '+' + fmtNum(S.gw), 1)}
        ${Bots.stat('MONEY LOST', '-' + fmtNum(S.gl), -1)}
        ${Bots.stat('NET', this.money(S.net), S.net)}
        ${Bots.stat('PROFIT FACTOR', this.pf(S.pf))}
        ${Bots.stat('AVERAGE R', S.avgR.toFixed(2), S.avgR)}
        ${Bots.stat('AVG WIN / LOSS', fmtNum(S.avgWin) + ' / ' + fmtNum(S.avgLoss))}
        ${Bots.stat('FEES', fmtNum(S.fees), -1)}
        ${Bots.stat('OPEN NOW', open.length)}
        ${Bots.stat('DAYS TRADED', days.length)}
        ${Bots.stat('BEST DAY', bestDay ? this.money(bestDay.net) : '\u2014', bestDay ? bestDay.net : 0)}
        ${Bots.stat('WORST DAY', worstDay ? this.money(worstDay.net) : '\u2014', worstDay ? worstDay.net : 0)}
      </div>

      <div class="dashSecBar">
        <button class="bMini" data-act="dashfoldall">${anyShut ? 'Open every section' : 'Fold every section'}</button>
        <button class="bMini" data-act="dashorderreset">Back to the normal order</button>
        <span class="dashSecHint">Click the arrow on a title to fold it \u00B7 the small arrows move a section up or down</span>
      </div>

      ${rendered.map(x => x.html).join('')}

      <div class="botNote warn">Every trade listed here is virtual. ASTRA has no connection that can place an order with
        any broker \u2014 times, prices, spreads and commission are real, the money is not.</div>
    </div>`;
  },

  /* ---------- what the money actually did ----------
     "Net +500" says nothing about whether that was a good use of the account.
     These figures do: how much was committed to get it, how much was genuinely
     at risk, and what the turnover returned. */
  capitalView(S, all){
    const start = BotEngine.RISK.startEquity;
    const bots = this.bots();
    /* every bot starts with the same virtual account, so the fleet's capital is
       that figure times the number of bots that have actually traded */
    const active = bots.filter(b => (Bots.ledger(b.id) || { closed: [] }).closed.length).length || 1;
    const capital = start * active;
    const equityNow = bots.reduce((a, b) => a + BotEngine.stats(Bots.ledger(b.id)).equity, 0);

    const row = (label, value, sub, sign) =>
      `<div class="capCell"><label>${esc(label)}</label>
         <b class="${sign == null ? '' : sign > 0 ? 'up' : sign < 0 ? 'down' : ''}">${value}</b>
         ${sub ? `<i>${esc(sub)}</i>` : ''}</div>`;

    /* the section header supplies the title now */
    return `<div class="capGrid">
        ${row('VIRTUAL ACCOUNT', fmtNum(start), 'per bot · ' + active + ' bot' + (active === 1 ? '' : 's') +
             ' trading = ' + fmtNum(capital) + ' in play')}
        ${row('MONEY WON', '+' + fmtNum(S.gw), S.won + ' winning trade' + (S.won === 1 ? '' : 's'), 1)}
        ${row('MONEY LOST', '-' + fmtNum(S.gl), S.lost + ' losing trade' + (S.lost === 1 ? '' : 's'), -1)}
        ${row('NET RESULT', this.money(S.net),
             capital > 0 ? (S.net / capital * 100).toFixed(2) + '% of the account' : '', S.net)}
        ${row('VOLUME TRADED', fmtNum(S.volume),
             'total value of every position opened')}
        ${row('AVERAGE POSITION', fmtNum(S.avgSize),
             'biggest was ' + fmtNum(S.biggest))}
        ${row('RETURN ON VOLUME', S.roiVol.toFixed(4) + '%',
             'earned per unit of value traded', S.net)}
        ${row('TOTAL PUT AT RISK', fmtNum(S.risked),
             'what the stops would have cost if every one had been hit')}
        ${row('RETURN ON RISK', S.roiRisk.toFixed(2) + '%',
             'the honest measure — profit against money genuinely exposed', S.net)}
      </div>
      <div class="botNote">Volume is turnover, not money spent: a 0.10 lot gold position controls several thousand
        euro of metal while only a fraction is ever at risk. <b>Return on risk</b> is the figure to judge a bot by —
        it compares what was made against what the stop-losses actually exposed.</div>`;
  },

  filterBar(all){
    const syms = [...new Set(all.map(t => t.sym))].sort();
    const tfs = [...new Set(all.map(t => t.tf))].filter(Boolean);
    const days = [...new Set(all.map(t => this.dayOf(t.exitTime)))].sort().reverse();
    const sel = (k, opts, cur) => `<select class="tsel" data-df="${k}">` +
      opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('') +
      '</select>';
    return `<div class="dashBar">
      <label class="bc">Bot ${sel('bot', [['all', 'All bots']].concat(this.bots().map(b => [b.id, b.name])), this.f.bot)}</label>
      <label class="bc">Instrument ${sel('sym', [['all', 'All']].concat(syms.map(s => [s, baseAsset(s)])), this.f.sym)}</label>
      <label class="bc">Timeframe ${sel('tf', [['all', 'All']].concat(tfs.map(t => [t, t])), this.f.tf)}</label>
      <label class="bc">Side ${sel('side', [['all', 'Both'], ['buy', 'Buy only'], ['sell', 'Sell only']], this.f.side)}</label>
      <label class="bc">Result ${sel('result', [['all', 'All'], ['win', 'Winners'], ['loss', 'Losers']], this.f.result)}</label>
      <label class="bc">Day ${sel('day', [['all', 'Every day']].concat(days.map(d => [d, d])), this.f.day)}</label>
      <button class="bMini" data-act="clearf">Clear filters</button>
    </div>`;
  },

  /* ---------- one row per bot ---------- */
  botTable(all){
    let rows = this.bots().map(b => {
      const list = all.filter(t => t.bot === b.id);
      const s = this.sum(list);
      const L = Bots.ledger(b.id) || BotEngine.blank(b.id);
      const st = BotEngine.stats(L);
      const tfs = [...new Set(list.map(t => t.tf))].filter(Boolean);
      return { b, s, st, tfs, open: L.open.length };
    });
    if (!rows.length) return '<div class="empty">No bots</div>';
    const cols = [
      ['name', 'Bot', 0], ['tf', 'Now on', 0], [null, 'Traded on', 0],
      ['trades', 'Trades', 1], ['won', 'Won', 1], ['lost', 'Lost', 1], ['winRate', 'Win %', 1],
      ['net', 'Net', 1], ['avgWin', 'Avg win', 1], ['avgLoss', 'Avg loss', 1], ['avgR', 'Avg R', 1],
      ['pf', 'PF', 1], ['maxDD', 'Max DD', 1], ['gw', 'Money won', 1], ['gl', 'Money lost', 1],
      ['volume', 'Volume', 1], ['roiRisk', 'Return on risk', 1],
      ['fees', 'Fees', 1], ['open', 'Open', 1],
      ['first', 'First trade', 0], ['last', 'Last trade', 0],
    ];
    rows = Bots.sortRows('dashBots', rows, 'net', (r, k) => {
      if (k === 'name') return r.b.name;
      if (k === 'tf') return (Bots.cfg(r.b.id) || {}).tf || '';
      if (k === 'trades') return r.s.n;
      if (k === 'pf') return r.s.pf === Infinity ? 999 : r.s.pf;
      if (k === 'maxDD') return -r.st.maxDD;
      if (k === 'open') return r.open;
      return r.s[k];
    });
    return `<div class="dashScroll"><table class="dashTable">
      <thead>${Bots.sortHead('dashBots', cols, 'net')}</thead><tbody>${rows.map(r => `
        <tr data-pickbot="${esc(r.b.id)}"${this.f.bot === r.b.id ? ' class="on"' : ''}>
          <td class="c-sym">${esc(r.b.name)}</td>
          <td>${esc((Bots.cfg(r.b.id) || {}).tf || '—')}</td>
          <td class="dashTfs">${r.tfs.map(t => `<i>${esc(t)}</i>`).join('') || '—'}</td>
          <td class="num">${r.s.n}</td>
          <td class="num up">${r.s.won}</td>
          <td class="num down">${r.s.lost}</td>
          <td class="num">${r.s.n ? Math.round(r.s.winRate) + '%' : '—'}</td>
          <td class="num ${pctClass(r.s.net)}">${r.s.n ? this.money(r.s.net) : '—'}</td>
          <td class="num up">${r.s.won ? fmtNum(r.s.avgWin) : '—'}</td>
          <td class="num down">${r.s.lost ? fmtNum(r.s.avgLoss) : '—'}</td>
          <td class="num ${pctClass(r.s.avgR)}">${r.s.n ? r.s.avgR.toFixed(2) : '—'}</td>
          <td class="num">${r.s.n ? this.pf(r.s.pf) : '—'}</td>
          <td class="num">${r.s.n ? '-' + r.st.maxDD.toFixed(1) + '%' : '—'}</td>
          <td class="num up">${r.s.won ? '+' + fmtNum(r.s.gw) : '—'}</td>
          <td class="num down">${r.s.lost ? '-' + fmtNum(r.s.gl) : '—'}</td>
          <td class="num">${r.s.n ? fmtNum(r.s.volume) : '—'}</td>
          <td class="num ${pctClass(r.s.roiRisk)}">${r.s.n && r.s.risked ? r.s.roiRisk.toFixed(1) + '%' : '—'}</td>
          <td class="num">${fmtNum(r.s.fees)}</td>
          <td class="num">${r.open || '—'}</td>
          <td>${r.s.first ? this.clock(r.s.first) : '—'}</td>
          <td>${r.s.last ? this.clock(r.s.last) : '—'}</td>
        </tr>`).join('')}</tbody></table></div>
      <div class="botNote">Click a row to filter everything below to that bot.</div>`;
  },

  /* ---------- the totals line under the day table ----------
     In a <tfoot>, so sorting the columns never moves it off the bottom.
     Two of these must NOT be plain sums, and getting either wrong would be a
     figure that looks right and is not:
       Win %  is wins over ALL trades, not the average of the daily percentages
              (a one-trade winning day would otherwise count as much as a
              forty-trade losing one).
       Avg R  is weighted by how many trades each day held, for the same reason.
     Best and Worst are the best and worst SINGLE TRADE across the whole set,
     which is what those columns hold on each row too. */
  dayTotalRow(days){
    if (!days.length) return '';
    const t = days.reduce((a, d) => {
      a.n += d.n; a.won += d.won; a.lost += d.lost;
      a.gw += d.gw; a.gl += d.gl; a.net += d.net;
      a.volume += d.volume; a.fees += d.fees;
      a.rSum += (d.avgR || 0) * d.n;
      if (d.best && (!a.best || d.best.pnl > a.best.pnl)) a.best = d.best;
      if (d.worst && (!a.worst || d.worst.pnl < a.worst.pnl)) a.worst = d.worst;
      return a;
    }, { n: 0, won: 0, lost: 0, gw: 0, gl: 0, net: 0, volume: 0, fees: 0, rSum: 0, best: null, worst: null });

    const winRate = t.n ? t.won / t.n * 100 : 0;
    const avgR = t.n ? t.rSum / t.n : 0;

    return `<tfoot><tr class="dashTotal">
      <td class="c-sym">TOTAL · ${days.length} day${days.length === 1 ? '' : 's'}</td>
      <td class="num">${t.n}</td>
      <td class="num up">${t.won}</td>
      <td class="num down">${t.lost}</td>
      <td class="num">${Math.round(winRate)}%</td>
      <td class="num up">${t.won ? '+' + fmtNum(t.gw) : '—'}</td>
      <td class="num down">${t.lost ? '-' + fmtNum(t.gl) : '—'}</td>
      <td class="num ${pctClass(t.net)}">${this.money(t.net)}</td>
      <td class="num">${fmtNum(t.volume)}</td>
      <td class="num">${fmtNum(t.fees)}</td>
      <td class="num ${pctClass(avgR)}">${avgR.toFixed(2)}</td>
      <td class="num up">${t.best ? this.money(t.best.pnl) : '—'}</td>
      <td class="num down">${t.worst ? this.money(t.worst.pnl) : '—'}</td>
      <td class="num ${pctClass(t.net)}">${this.money(t.net)}</td>
    </tr></tfoot>`;
  },

  /* ---------- one row per instrument, with its whole history ----------
     The small "BY INSTRUMENT" panel further down answers "what is this filter
     showing". This answers a different question: what has this pair EVER done —
     since when, over how many days, how much it won and how much it lost. It
     therefore ignores the filters on purpose; only the bot filter narrows it,
     because "Brent under this one bot" is a question worth asking. */
  symOpen: {},

  instrumentRows(all, open){
    const map = {};
    for (const t of all) (map[t.sym] = map[t.sym] || []).push(t);
    /* an instrument that is open but has never closed a trade still deserves a row */
    for (const p of open) if (!map[p.sym]) map[p.sym] = [];

    const DAY = 86400000;
    return Object.entries(map).map(([sym, list]) => {
      const s = this.sum(list);
      const days = [...new Set(list.map(t => this.dayOf(t.exitTime)))];
      /* two different numbers, and the difference matters: how long ago it
         started, against how many of those days it actually did something */
      const span = (s.first && s.last) ? Math.max(1, Math.round((s.last - s.first) / DAY) + 1) : 0;
      const ageDays = s.first ? Math.max(1, Math.round((Date.now() - s.first) / DAY)) : 0;
      const holds = list.filter(t => t.entryTime && t.exitTime).map(t => t.exitTime - t.entryTime);
      return {
        sym, list, s,
        daysTraded: days.length, span, ageDays,
        perDay: days.length ? s.n / days.length : 0,
        avgHold: holds.length ? holds.reduce((a, x) => a + x, 0) / holds.length : 0,
        openNow: open.filter(p => p.sym === sym).length,
        bots: [...new Set(list.map(t => t.botName))],
        tfs: [...new Set(list.map(t => t.tf))].filter(Boolean),
      };
    });
  },

  instrumentTable(all, openAll){
    const scoped = this.f.bot === 'all' ? all : all.filter(t => t.bot === this.f.bot);
    const scopedOpen = this.f.bot === 'all' ? openAll : openAll.filter(p => p.bot === this.f.bot);
    let rows = this.instrumentRows(scoped, scopedOpen);
    if (!rows.length) return '<div class="empty">No instrument has traded yet</div>';

    const cols = [
      [null, '', 0], ['sym', 'Instrument', 0],
      ['n', 'Trades', 1], ['won', 'Won', 1], ['lost', 'Lost', 1], ['winRate', 'Win %', 1],
      ['gw', 'Money won', 1], ['gl', 'Money lost', 1], ['net', 'Net', 1],
      ['roiRisk', 'Return on risk', 1],
      ['ageDays', 'Trading for', 1], ['daysTraded', 'Active days', 1],
      ['first', 'Since', 0], ['last', 'Last trade', 0], ['openNow', 'Open', 1],
    ];
    rows = Bots.sortRows('dashSyms', rows, 'net', (r, k) => {
      if (k === 'sym') return baseAsset(r.sym);
      if (k === 'ageDays' || k === 'daysTraded' || k === 'openNow') return r[k];
      return r.s[k];
    });

    const span = cols.length;
    return `<div class="dashScroll"><table class="dashTable symTable">
      <thead>${Bots.sortHead('dashSyms', cols, 'net')}</thead><tbody>${rows.map(r => {
        const on = !!this.symOpen[r.sym];
        return `
        <tr class="symRow${on ? ' open' : ''}" data-picksym="${esc(r.sym)}">
          <td class="symFold">${on ? '▾' : '▸'}</td>
          <td class="c-sym">${esc(baseAsset(r.sym))}</td>
          <td class="num">${r.s.n}</td>
          <td class="num up">${r.s.won || '—'}</td>
          <td class="num down">${r.s.lost || '—'}</td>
          <td class="num">${r.s.n ? Math.round(r.s.winRate) + '%' : '—'}</td>
          <td class="num up">${r.s.won ? '+' + fmtNum(r.s.gw) : '—'}</td>
          <td class="num down">${r.s.lost ? '-' + fmtNum(r.s.gl) : '—'}</td>
          <td class="num ${pctClass(r.s.net)}">${r.s.n ? this.money(r.s.net) : '—'}</td>
          <td class="num ${pctClass(r.s.roiRisk)}">${r.s.risked ? r.s.roiRisk.toFixed(1) + '%' : '—'}</td>
          <td class="num">${r.ageDays ? r.ageDays + ' d' : '—'}</td>
          <td class="num">${r.daysTraded || '—'}</td>
          <td>${r.s.first ? this.clock(r.s.first) : '—'}</td>
          <td>${r.s.last ? this.clock(r.s.last) : '—'}</td>
          <td class="num">${r.openNow || '—'}</td>
        </tr>` + (on ? `<tr class="symDetailRow"><td colspan="${span}">${this.symDetail(r)}</td></tr>` : '');
      }).join('')}</tbody></table></div>
      <div class="botNote">Click any instrument to open its full record. These figures cover the whole
        history${this.f.bot === 'all' ? '' : ' of the selected bot'} and ignore the day, side and result filters.</div>`;
  },

  /* the folded-open panel: everything about one pair */
  symDetail(r){
    const s = r.s;
    const fact = (label, value, sub, sign) =>
      `<div class="capCell"><label>${esc(label)}</label>
         <b class="${sign == null ? '' : sign > 0 ? 'up' : sign < 0 ? 'down' : ''}">${value}</b>
         ${sub ? `<i>${esc(sub)}</i>` : ''}</div>`;

    if (!s.n) return `<div class="symPanel"><div class="empty">Nothing has closed on this instrument yet
      — ${r.openNow} position${r.openNow === 1 ? '' : 's'} still open.</div></div>`;

    /* who traded it, on what, and which way */
    const mini = (title, groups, fmt) => `<div class="symMini"><h5>${esc(title)}</h5>
      <table class="dashMini"><thead><tr><th>${esc(title)}</th><th class="num">Trades</th>
        <th class="num">W/L</th><th class="num">Win %</th><th class="num">Net</th></tr></thead><tbody>${
        groups.map(g => `<tr><td>${esc(fmt ? fmt(g.key) : (g.key || '—'))}</td>
          <td class="num">${g.n}</td>
          <td class="num"><b class="up">${g.won}</b>/<b class="down">${g.lost}</b></td>
          <td class="num">${g.n ? Math.round(g.winRate) + '%' : '—'}</td>
          <td class="num ${pctClass(g.net)}">${g.n ? this.money(g.net) : '—'}</td></tr>`).join('')
        }</tbody></table></div>`;

    const sides = [
      { key: 'Buy', list: r.list.filter(t => t.dir > 0) },
      { key: 'Sell', list: r.list.filter(t => t.dir < 0) },
    ].map(x => Object.assign({ key: x.key }, this.sum(x.list))).filter(x => x.n);

    const recent = r.list.slice().sort((a, b) => b.exitTime - a.exitTime).slice(0, 8);

    return `<div class="symPanel">
      <div class="capGrid tight">
        ${fact('FIRST TRADE', this.clock(s.first), 'opened ' + r.ageDays + ' day' + (r.ageDays === 1 ? '' : 's') + ' ago')}
        ${fact('LAST TRADE', this.clock(s.last), r.span + ' day' + (r.span === 1 ? '' : 's') + ' from first to last')}
        ${fact('ACTIVE DAYS', r.daysTraded, r.perDay.toFixed(1) + ' trades on a day it traded')}
        ${fact('MONEY WON', '+' + fmtNum(s.gw), s.won + ' win' + (s.won === 1 ? '' : 's') +
              ' · average ' + fmtNum(s.avgWin), 1)}
        ${fact('MONEY LOST', '-' + fmtNum(s.gl), s.lost + ' loss' + (s.lost === 1 ? '' : 'es') +
              ' · average ' + fmtNum(s.avgLoss), -1)}
        ${fact('NET', this.money(s.net), 'after ' + fmtNum(s.fees) + ' in costs', s.net)}
        ${fact('PROFIT FACTOR', this.pf(s.pf), 'won per unit lost')}
        ${fact('AVERAGE R', s.avgR.toFixed(2), 'per trade, in units of risk', s.avgR)}
        ${fact('BEST / WORST', this.money(s.best ? s.best.pnl : 0) + ' / ' + this.money(s.worst ? s.worst.pnl : 0),
              s.best ? this.clock(s.best.exitTime) + ' · ' + this.clock(s.worst.exitTime) : '')}
        ${fact('AVERAGE HOLD', r.avgHold ? this.dur(r.avgHold) : '—', 'time in the market per trade')}
        ${fact('VOLUME TRADED', fmtNum(s.volume), 'average position ' + fmtNum(s.avgSize))}
        ${fact('RETURN ON RISK', s.risked ? s.roiRisk.toFixed(1) + '%' : '—',
              s.risked ? fmtNum(s.risked) + ' was genuinely exposed' : 'no stops recorded', s.net)}
      </div>

      <div class="symMinis">
        ${mini('Bot', this.group(r.list, 'botName'))}
        ${r.tfs.length ? mini('Timeframe', this.group(r.list, 'tf')) : ''}
        ${sides.length ? mini('Direction', sides) : ''}
        ${mini('Exit reason', this.group(r.list, 'reason'))}
      </div>

      <div class="symMini wide"><h5>Last ${recent.length} trade${recent.length === 1 ? '' : 's'}</h5>
        <table class="dashMini"><thead><tr><th>Closed</th><th>Bot</th><th>Side</th>
          <th class="num">Entry</th><th class="num">Exit</th><th class="num">Held</th>
          <th class="num">R</th><th class="num">Result</th><th>Why it ended</th></tr></thead><tbody>${
          recent.map(t => `<tr>
            <td>${this.clock(t.exitTime)}</td>
            <td>${esc(t.botName)}</td>
            <td class="${t.dir > 0 ? 'up' : 'down'}">${t.dir > 0 ? 'Buy' : 'Sell'}</td>
            <td class="num">${fmtPrice(t.entry)}</td>
            <td class="num">${fmtPrice(t.exit)}</td>
            <td class="num">${this.held(t.entryTime, t.exitTime)}</td>
            <td class="num ${pctClass(t.r)}">${t.r == null ? '—' : t.r.toFixed(2)}</td>
            <td class="num ${pctClass(t.pnl)}">${this.money(t.pnl)}</td>
            <td>${esc(t.reason || '—')}</td></tr>`).join('')}</tbody></table></div>

      <div class="symTools">
        <button class="bMini" data-onlysym="${esc(r.sym)}">Show only ${esc(baseAsset(r.sym))} below</button>
        <button class="bMini" data-chartsym="${esc(r.sym)}">Open the chart</button>
      </div>
    </div>`;
  },

  /* ---------- permitted / prohibited ----------
     Two columns and a search box. The verdicts come from PairRules, which is
     also what every bot consults before it opens anything — so what is written
     here is what actually happens, not a display of it. */
  pairQ: '',

  pairCard(v){
    const m = v.m;
    const net = m ? this.money(m.net) : null;
    const badge = v.manual ? 'yours' : v.state === 'watch' ? 'watch' : v.source === 'the record' ? 'record' : 'new';
    const cls = v.state === 'blocked' ? 'bad' : v.state === 'watch' ? 'warn' : (m && m.net > 0 ? 'good' : '');
    return `<div class="prCard ${cls}">
      <div class="prTop">
        <b>${esc(v.sym)}</b>
        <span class="prBadge ${badge}">${badge === 'yours' ? 'your choice' : badge === 'watch' ? 'watching' : badge === 'new' ? 'no record' : 'automatic'}</span>
        ${net ? `<i class="${pctClass(m.net)}">${net}</i>` : ''}
      </div>
      <div class="prWhy">${esc(v.auto.why)}${m ? ' · ' + m.won + 'W/' + m.lost + 'L' : ''}</div>
      ${m && m.bots.length ? `<div class="prBots">${esc(m.bots.slice(0, 3).join(', '))}${m.bots.length > 3 ? ' +' + (m.bots.length - 3) : ''}</div>` : ''}
      <div class="prBtns">
        ${v.state === 'blocked'
          ? `<button class="bMini" data-prallow="${esc(v.sym)}">Allow pair</button>`
          : `<button class="bMini danger" data-prblock="${esc(v.sym)}">Block pair</button>`}
        ${v.manual ? `<button class="bMini" data-prauto="${esc(v.sym)}">Back to automatic</button>` : ''}
      </div>
    </div>`;
  },

  pairColumns(){
    const c = PairRules.columns(this.pairQ);
    const col = (title, sub, rows, empty) => `<div class="prCol">
      <div class="prHead">${esc(title)} <span>${rows.length}</span><i>${esc(sub)}</i></div>
      ${rows.length ? rows.map(r => this.pairCard(r)).join('') : `<div class="empty">${esc(empty)}</div>`}
    </div>`;
    return col('BLOCKED PAIRS', 'new entries refused', c.blocked,
               this.pairQ ? 'nothing prohibited matches that' : 'nothing is prohibited yet') +
           col('ALLOWED PAIRS', 'other risk limits still apply', c.allowed,
               this.pairQ ? 'nothing allowed matches that' : 'no instrument has traded yet');
  },

  /* the section header owns these buttons now, so they sit beside the title */
  pairRulesTools(){
    const auto = PairRules.autoOn();
    return `<button class="bMini${auto ? ' on' : ''}" data-act="prtoggle">Automatic blocking: ${auto ? 'ON' : 'OFF'}</button>` +
      (Object.keys(PairRules.load().rules).length
        ? '<button class="bMini" data-act="prreset">Clear my own choices</button>' : '');
  },

  pairRulesView(){
    const c = PairRules.columns('');
    const auto = PairRules.autoOn();
    return `<div class="prBar">
      <input type="text" id="prSearch" aria-label="Find a pair" placeholder="Find a pair to block or allow — ETH, EURUSD, DAX…"
        value="${esc(this.pairQ)}" spellcheck="false" autocomplete="off">
      <button class="bMini" data-act="prclear">Clear search</button>
      <span class="prHint">${c.untested} instrument${c.untested === 1 ? '' : 's'} with no record are allowed by
        default — search to find and prohibit one.</span>
    </div>

    <div class="prCols" id="prCols">${this.pairColumns()}</div>

    <div class="botNote"><b id="prAutoStatus"></b><br>A pair is prohibited automatically once it has
      <b>${PairRules.MIN_TRADES} or more finished trades and is down by more than ${fmtNum(PairRules.minLoss())}</b> (half a percent of one virtual account) — the rule that catches
      EUR/USD. Anything you prohibit or allow by hand always wins and is never overturned by a later good day.
      The block applies to every bot in every mode, including Follow Market Fit; it refuses <b>new</b> entries only,
      so a position already open still runs to its own stop or target.
      Use <b>Allow pair</b> to remove a block and keep the pair allowed. Use <b>Back to automatic</b>
      to remove your override. Choices are saved and apply to aliases of the same pair.</div>`;
  },

  /* ---------- small breakdowns ---------- */
  breakdown(list, key, label, fmt){
    let g = this.group(list, key);
    if (!g.length) return '<div class="empty">Nothing yet</div>';
    const id = 'brk_' + key;
    g = Bots.sortRows(id, g, 'net', (r, k) => k === 'key' ? String(r.key) : r[k]);
    const cols = [['key', label, 0], ['n', 'Trades', 1], [null, 'W/L', 1],
                  ['winRate', 'Win %', 1], ['net', 'Net', 1]];
    return `<table class="dashMini"><thead>${Bots.sortHead(id, cols, 'net')}</thead><tbody>${
      g.slice(0, 12).map(r => `<tr>
        <td>${esc(fmt ? fmt(r.key) : (r.key || '—'))}</td>
        <td class="num">${r.n}</td>
        <td class="num"><b class="up">${r.won}</b>/<b class="down">${r.lost}</b></td>
        <td class="num">${Math.round(r.winRate)}%</td>
        <td class="num ${pctClass(r.net)}">${this.money(r.net)}</td></tr>`).join('')}</tbody></table>`;
  },

  sideTable(list){
    const rows = [
      { key: 'Buy', list: list.filter(t => t.dir > 0) },
      { key: 'Sell', list: list.filter(t => t.dir < 0) },
    ].map(r => Object.assign({ key: r.key }, this.sum(r.list)));
    return `<table class="dashMini"><thead><tr><th>Direction</th><th class="num">Trades</th>
      <th class="num">W/L</th><th class="num">Win %</th><th class="num">Net</th></tr></thead><tbody>${
      rows.map(r => `<tr><td>${r.key}</td><td class="num">${r.n}</td>
        <td class="num"><b class="up">${r.won}</b>/<b class="down">${r.lost}</b></td>
        <td class="num">${r.n ? Math.round(r.winRate) + '%' : '—'}</td>
        <td class="num ${pctClass(r.net)}">${r.n ? this.money(r.net) : '—'}</td></tr>`).join('')}</tbody></table>`;
  },

  /* ---------- day by day ---------- */
  dayRows(list){
    const map = {};
    for (const t of list) (map[this.dayOf(t.exitTime)] = map[this.dayOf(t.exitTime)] || []).push(t);
    const days = Object.keys(map).sort();
    let cum = 0;
    const rows = days.map(d => {
      const s = this.sum(map[d]);
      cum += s.net;
      return Object.assign({ day: d, cum }, s);
    });
    return rows.reverse();      // newest first
  },

  /* a compact strip of the last 40 days, one column per day */
  dayStrip(days){
    if (!days.length) return '<div class="empty">No finished trades yet</div>';
    const last = days.slice(0, 40).reverse();
    const max = Math.max(1, ...last.map(d => Math.abs(d.net)));
    return '<div class="dayStrip">' + last.map(d => {
      const h = Math.max(4, Math.abs(d.net) / max * 46);
      const up = d.net >= 0;
      return `<div class="dsCol" data-pickday="${esc(d.day)}"
        title="${esc(d.day)} — ${d.n} trades, ${d.won}W/${d.lost}L, ${this.money(d.net)}">
        <div class="dsTop">${up ? `<i style="height:${h}px" class="up"></i>` : ''}</div>
        <div class="dsBot">${!up ? `<i style="height:${h}px" class="down"></i>` : ''}</div>
        <label>${esc(d.day.slice(8))}</label></div>`;
    }).join('') + '</div>';
  },

  dayTable(days){
    if (!days.length) return '';
    days = days.slice();
    const dcols = [['day', 'Day', 0], ['n', 'Trades', 1], ['won', 'Won', 1], ['lost', 'Lost', 1],
      ['winRate', 'Win %', 1], ['gw', 'Money won', 1], ['gl', 'Money lost', 1],
      ['net', 'Net', 1], ['volume', 'Volume', 1], ['fees', 'Fees', 1], ['avgR', 'Avg R', 1],
      ['best', 'Best', 1], ['worst', 'Worst', 1], ['cum', 'Running total', 1]];
    days = Bots.sortRows('dashDays', days, 'day', (r, k) =>
      k === 'best' ? (r.best ? r.best.pnl : null)
      : k === 'worst' ? (r.worst ? r.worst.pnl : null) : r[k]);
    return `<div class="dashScroll short"><table class="dashTable">
      <thead>${Bots.sortHead('dashDays', dcols, 'day')}</thead>
      <tbody>${days.map(d => `<tr data-pickday="${esc(d.day)}"${this.f.day === d.day ? ' class="on"' : ''}>
        <td class="c-sym">${esc(d.day)}</td>
        <td class="num">${d.n}</td>
        <td class="num up">${d.won}</td>
        <td class="num down">${d.lost}</td>
        <td class="num">${Math.round(d.winRate)}%</td>
        <td class="num up">${d.won ? '+' + fmtNum(d.gw) : '—'}</td>
        <td class="num down">${d.lost ? '-' + fmtNum(d.gl) : '—'}</td>
        <td class="num ${pctClass(d.net)}">${this.money(d.net)}</td>
        <td class="num">${fmtNum(d.volume)}</td>
        <td class="num">${fmtNum(d.fees)}</td>
        <td class="num ${pctClass(d.avgR)}">${d.avgR.toFixed(2)}</td>
        <td class="num up">${d.best ? this.money(d.best.pnl) : '—'}</td>
        <td class="num down">${d.worst ? this.money(d.worst.pnl) : '—'}</td>
        <td class="num ${pctClass(d.cum)}">${this.money(d.cum)}</td></tr>`).join('')}</tbody>
      ${this.dayTotalRow(days)}</table></div>
      <div class="botNote">Click a day to see only that day's trades below. The bottom row totals every day shown,
        so it follows the filters above.</div>`;
  },

  /* ---------- open positions ---------- */
  openTable(open){
    const ocols = [['botName', 'Bot', 0], ['sym', 'Instrument', 0], ['tf', 'TF', 0], ['dir', 'Side', 0],
      ['entryTime', 'Entered', 0], ['heldMs', 'Open for', 1], ['entry', 'Entry', 1], ['qty', 'Size', 1],
      ['sl', 'Stop', 1], ['tp', 'Target', 1], ['unreal', 'Unrealised', 1], ['model', 'Setup', 0]];
    open = Bots.sortRows('dashOpen', open, 'entryTime', (r, k) =>
      k === 'heldMs' ? (Date.now() - r.entryTime) : r[k]);
    return `<div class="dashScroll short"><table class="dashTable">
      <thead>${Bots.sortHead('dashOpen', ocols, 'entryTime')}</thead>
      <tbody>${open.map(p => `<tr>
        <td class="c-sym">${esc(p.botName)}</td>
        <td>${esc(baseAsset(p.sym))}</td>
        <td>${esc(p.tf || '—')}</td>
        <td class="${p.dir > 0 ? 'up' : 'down'}">${p.dir > 0 ? 'BUY' : 'SELL'}</td>
        <td>${this.clock(p.entryTime)}</td>
        <td class="num">${this.held(p.entryTime, Date.now())}</td>
        <td class="num">${fmtPrice(p.entry)}</td>
        <td class="num">${p.lots ? p.lots + ' lot' : +p.qty.toPrecision(4)}</td>
        <td class="num">${fmtPrice(p.sl)}</td>
        <td class="num">${fmtPrice(p.tp)}</td>
        <td class="num ${pctClass(p.unreal || 0)}">${this.money(p.unreal || 0)}</td>
        <td class="dim2">${esc(p.model || '')}</td></tr>`).join('')}</tbody></table></div>`;
  },

  /* ---------- the full trade log ---------- */
  COLS: [
    ['botName', 'Bot', 0], ['sym', 'Instrument', 0], ['tf', 'TF', 0], ['dir', 'Side', 0],
    ['entryTime', 'Entered', 0], ['exitTime', 'Exited', 0], ['heldMs', 'Held', 1],
    ['entry', 'Entry', 1], ['exit', 'Exit', 1], ['qty', 'Size', 1],
    ['value', 'Value entered', 1], ['riskMoney', 'At risk', 1],
    ['pnl', 'P&L', 1], ['r', 'R', 1], ['retPct', 'Return on entry', 1], ['fees', 'Fees', 1],
    ['mfe', 'Best point', 1], ['mae', 'Worst point', 1], ['reason', 'Why it closed', 0],
  ],

  sorted(list){
    const k = this.f.sort, d = this.f.dir;
    const val = t =>
      k === 'heldMs' ? (t.exitTime - t.entryTime)
      : k === 'value' ? this.notional(t)
      : k === 'riskMoney' ? this.risked(t)
      : k === 'retPct' ? (this.notional(t) ? t.pnl / this.notional(t) * 100 : 0)
      : t[k];
    return list.slice().sort((a, b) => {
      const x = val(a), y = val(b);
      if (typeof x === 'string' || typeof y === 'string')
        return String(x || '').localeCompare(String(y || '')) * d;
      return ((x || 0) - (y || 0)) * d;
    });
  },

  logTable(list){
    if (!list.length) return '<div class="empty">No trades match these filters</div>';
    const rows = this.sorted(list).slice(0, this.f.limit);
    const head = this.COLS.map(([k, l, num]) =>
      `<th class="${num ? 'num ' : ''}sortable${this.f.sort === k ? ' sorted' : ''}" data-sort="${k}">${esc(l)}` +
      (this.f.sort === k ? (this.f.dir < 0 ? ' ▼' : ' ▲') : '') + '</th>').join('');
    return `<div class="dashScroll"><table class="dashTable log">
      <thead><tr>${head}</tr></thead><tbody>${rows.map(t => `<tr class="${t.pnl > 0 ? 'w' : 'l'}">
        <td class="c-sym">${esc(t.botName)}</td>
        <td>${esc(baseAsset(t.sym))}</td>
        <td>${esc(t.tf || '—')}</td>
        <td class="${t.dir > 0 ? 'up' : 'down'}">${t.dir > 0 ? 'BUY' : 'SELL'}</td>
        <td>${this.clock(t.entryTime)}</td>
        <td>${this.clock(t.exitTime)}</td>
        <td class="num">${this.held(t.entryTime, t.exitTime)}</td>
        <td class="num">${fmtPrice(t.entry)}</td>
        <td class="num">${fmtPrice(t.exit)}</td>
        <td class="num">${t.lots ? t.lots + ' lot' : +t.qty.toPrecision(4)}</td>
        <td class="num">${fmtNum(this.notional(t))}</td>
        <td class="num">${this.risked(t) ? fmtNum(this.risked(t)) : '—'}</td>
        <td class="num ${pctClass(t.pnl)}">${this.money(t.pnl)}</td>
        <td class="num ${pctClass(t.r)}">${(t.r || 0).toFixed(2)}</td>
        <td class="num ${pctClass(t.pnl)}">${this.notional(t) ? (t.pnl / this.notional(t) * 100).toFixed(3) + '%' : '—'}</td>
        <td class="num">${fmtNum(t.fees)}</td>
        <td class="num up">${fmtNum(t.mfe)}</td>
        <td class="num down">${fmtNum(t.mae)}</td>
        <td class="dim2">${esc(t.reason || '')}</td></tr>`).join('')}</tbody></table></div>`;
  },

  /* ---------- CSV ---------- */
  csv(){
    const list = this.sorted(this.allTrades().filter(t => this.match(t)));
    if (!list.length) return toast('Nothing to export with these filters', 'warn');
    const head = ['Bot', 'Instrument', 'Timeframe', 'Side', 'Entered', 'Exited', 'Held (min)',
      'Entry', 'Exit', 'Size (lots)', 'Quantity', 'Stop', 'Target', 'P&L', 'R', 'Fees',
      'Best point', 'Worst point', 'Score', 'Setup', 'Why it closed', 'Time zone'];
    const esc2 = v => {
      const s = v == null ? '' : String(v);
      return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const iso = ts => ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 19) : '';
    const lines = [head.join(',')].concat(list.map(t => [
      t.botName, t.sym, t.tf, t.dir > 0 ? 'BUY' : 'SELL', iso(t.entryTime), iso(t.exitTime),
      ((t.exitTime - t.entryTime) / 60000).toFixed(1),
      t.entry, t.exit, t.lots || '', t.qty, t.sl, t.tp, t.pnl, t.r, t.fees,
      t.mfe, t.mae, t.score == null ? '' : t.score, t.model, t.reason, t.tz,
    ].map(esc2).join(',')));

    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'astra-trades-' + this.dayOf(Date.now()) + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toast('Exported ' + list.length + ' trades', 'ok');
  },

  /* ---------- Excel ----------
     One workbook, eight sheets, every figure the dashboard shows. Filters apply,
     so exporting "RigorGate, losers only" gives exactly that. */
  iso(ts){ return ts ? new Date(ts).toISOString().replace('T', ' ').slice(0, 19) : ''; },

  excel(){
    const all = this.allTrades();
    const list = this.sorted(all.filter(t => this.match(t)));
    if (!list.length) return toast('Nothing to export with these filters', 'warn');
    const S = this.sum(list);
    const days = this.dayRows(list);
    const open = this.allOpen().filter(p => this.f.bot === 'all' || p.bot === this.f.bot);
    const H = XLSX.head.bind(XLSX);
    const pfv = v => v === Infinity ? 999 : +(v || 0).toFixed(2);
    const f = this.f;

    /* 1 — summary */
    const summary = { name: 'Summary', filter: false, cols: [34, 22, 18, 18],
      rows: [
        [{ v: 'ASTRA — bot performance', s: 4 }],
        ['Exported', this.iso(Date.now())],
        ['Account model', BotEngine.RISK.startEquity, 'Risk per trade', BotEngine.RISK.riskPct + '%'],
        ['These are PAPER trades. ASTRA cannot place an order with any broker.'],
        [],
        [{ v: 'Filters applied', s: 4 }],
        ['Bot', f.bot === 'all' ? 'All bots' : (BOT_BY_ID[f.bot] || {}).name || f.bot],
        ['Instrument', f.sym === 'all' ? 'All' : f.sym],
        ['Timeframe', f.tf === 'all' ? 'All' : f.tf],
        ['Side', f.side === 'all' ? 'Both' : f.side],
        ['Result', f.result === 'all' ? 'All' : f.result],
        ['Day', f.day === 'all' ? 'Every day' : f.day],
        [],
        [{ v: 'Totals', s: 4 }],
        ['Trades', S.n], ['Won', S.won], ['Lost', S.lost],
        ['Win rate %', +S.winRate.toFixed(1)],
        ['Net', +S.net.toFixed(2)],
        ['Gross won', +S.gw.toFixed(2)], ['Gross lost', +S.gl.toFixed(2)],
        ['Profit factor', pfv(S.pf)],
        ['Average R', +S.avgR.toFixed(3)],
        ['Average win', +S.avgWin.toFixed(2)], ['Average loss', +S.avgLoss.toFixed(2)],
        ['Fees paid', +S.fees.toFixed(2)],
        ['Days traded', days.length],
        ['Open right now', open.length],
        ['Best trade', S.best ? +S.best.pnl.toFixed(2) : ''],
        ['Worst trade', S.worst ? +S.worst.pnl.toFixed(2) : ''],
        ['First entry', this.iso(S.first)], ['Last exit', this.iso(S.last)],
      ] };

    /* 2 — one row per bot */
    const bots = { name: 'Bots', cols: [26, 10, 18, 10, 9, 9, 10, 13, 12, 12, 10, 10, 11, 11, 8, 20, 20],
      rows: [H(['Bot', 'Runs on', 'Traded on', 'Trades', 'Won', 'Lost', 'Win %', 'Net', 'Avg win',
        'Avg loss', 'Avg R', 'Profit factor', 'Max DD %', 'Fees', 'Open', 'First trade', 'Last trade'])]
        .concat(this.bots().map(b => {
          const l = list.filter(t => t.bot === b.id);
          const x = this.sum(l);
          const st = BotEngine.stats(Bots.ledger(b.id));
          return [b.name, (Bots.cfg(b.id) || {}).tf || '',
            [...new Set(l.map(t => t.tf))].filter(Boolean).join(' '),
            x.n, x.won, x.lost, +x.winRate.toFixed(1), +x.net.toFixed(2),
            +x.avgWin.toFixed(2), +x.avgLoss.toFixed(2), +x.avgR.toFixed(3), pfv(x.pf),
            +st.maxDD.toFixed(1), +x.fees.toFixed(2), Bots.ledger(b.id).open.length,
            this.iso(x.first), this.iso(x.last)];
        })) };

    /* 3 — day by day */
    const daily = { name: 'Daily', cols: [13, 10, 9, 9, 10, 13, 11, 10, 12, 12, 15],
      rows: [H(['Day', 'Trades', 'Won', 'Lost', 'Win %', 'Net', 'Fees', 'Avg R', 'Best', 'Worst', 'Running total'])]
        .concat(days.slice().reverse().map(d => [d.day, d.n, d.won, d.lost, +d.winRate.toFixed(1),
          +d.net.toFixed(2), +d.fees.toFixed(2), +d.avgR.toFixed(3),
          d.best ? +d.best.pnl.toFixed(2) : '', d.worst ? +d.worst.pnl.toFixed(2) : '',
          +d.cum.toFixed(2)])) };

    /* 4 — every trade */
    const trades = { name: 'Trades',
      cols: [26, 14, 8, 7, 20, 20, 11, 13, 13, 11, 12, 12, 8, 10, 11, 11, 8, 22, 22, 16],
      rows: [H(['Bot', 'Instrument', 'TF', 'Side', 'Entered', 'Exited', 'Held (min)', 'Entry', 'Exit',
        'Lots', 'Quantity', 'Stop', 'Target', 'P&L', 'R', 'Fees', 'Score', 'Setup', 'Why it closed', 'Time zone'])]
        .concat(list.map(t => [t.botName, t.sym, t.tf || '', t.dir > 0 ? 'BUY' : 'SELL',
          this.iso(t.entryTime), this.iso(t.exitTime),
          +((t.exitTime - t.entryTime) / 60000).toFixed(2),
          t.entry, t.exit, t.lots || '', t.qty, t.sl, t.tp,
          +t.pnl.toFixed(2), +(t.r || 0).toFixed(2), +t.fees.toFixed(2),
          t.score == null ? '' : t.score, t.model || '', t.reason || '', t.tz || ''])) };

    /* 5-7 — breakdowns */
    const brk = (key, label, fmt) => ({ name: label, cols: [22, 10, 9, 9, 10, 13, 11, 11],
      rows: [H([label, 'Trades', 'Won', 'Lost', 'Win %', 'Net', 'Avg R', 'Profit factor'])]
        .concat(this.group(list, key).map(r => [fmt ? fmt(r.key) : (r.key || ''),
          r.n, r.won, r.lost, +r.winRate.toFixed(1), +r.net.toFixed(2),
          +r.avgR.toFixed(3), pfv(r.pf)])) });

    /* 8 — what is open right now */
    const openSheet = { name: 'Open now', cols: [26, 14, 8, 7, 20, 12, 13, 11, 13, 13, 13, 22],
      rows: [H(['Bot', 'Instrument', 'TF', 'Side', 'Entered', 'Open for', 'Entry', 'Lots',
        'Stop', 'Target', 'Unrealised', 'Setup'])]
        .concat(open.map(p => [p.botName, p.sym, p.tf || '', p.dir > 0 ? 'BUY' : 'SELL',
          this.iso(p.entryTime), this.held(p.entryTime, Date.now()), p.entry, p.lots || p.qty,
          p.sl, p.tp, +(p.unreal || 0).toFixed(2), p.model || ''])) };

    const size = XLSX.save('astra-bots-' + this.dayOf(Date.now()) + '.xlsx',
      [summary, bots, daily, trades,
       brk('tf', 'Timeframe'), brk('sym', 'Instrument'), brk('reason', 'Exit reason'), openSheet]);
    toast('Excel workbook saved — ' + list.length + ' trades, 8 sheets (' + Math.round(size / 1024) + ' KB)', 'ok');
  },

  /* ---------- PDF ----------
     The dashboard, laid out for paper, handed to the browser's print dialogue. */
  pdf(){
    const all = this.allTrades();
    const list = this.sorted(all.filter(t => this.match(t)));
    if (!list.length) return toast('Nothing to print with these filters', 'warn');
    const S = this.sum(list);
    const days = this.dayRows(list);
    const f = this.f;
    const pf = v => v === Infinity ? '\u221e' : (v || 0).toFixed(2);
    const money = v => (v >= 0 ? '+' : '') + fmtNum(v);
    const cls = v => v >= 0 ? 'g' : 'r';

    const botRows = this.bots().map(b => {
      const l = list.filter(t => t.bot === b.id);
      const x = this.sum(l);
      if (!x.n) return '';
      const st = BotEngine.stats(Bots.ledger(b.id));
      return `<tr><td>${esc(b.name)}</td><td>${esc([...new Set(l.map(t => t.tf))].join(' '))}</td>
        <td class="n">${x.n}</td><td class="n g">${x.won}</td><td class="n r">${x.lost}</td>
        <td class="n">${Math.round(x.winRate)}%</td><td class="n ${cls(x.net)}">${money(x.net)}</td>
        <td class="n">${fmtNum(x.avgWin)}</td><td class="n">${fmtNum(x.avgLoss)}</td>
        <td class="n">${x.avgR.toFixed(2)}</td><td class="n">${pf(x.pf)}</td>
        <td class="n">-${st.maxDD.toFixed(1)}%</td><td class="n">${fmtNum(x.fees)}</td></tr>`;
    }).join('');

    const dayRows = days.slice(0, 40).map(d => `<tr><td>${d.day}</td><td class="n">${d.n}</td>
      <td class="n g">${d.won}</td><td class="n r">${d.lost}</td><td class="n">${Math.round(d.winRate)}%</td>
      <td class="n ${cls(d.net)}">${money(d.net)}</td><td class="n">${fmtNum(d.fees)}</td>
      <td class="n">${d.avgR.toFixed(2)}</td><td class="n ${cls(d.cum)}">${money(d.cum)}</td></tr>`).join('');

    const tradeRows = list.slice(0, 400).map(t => `<tr><td>${esc(t.botName)}</td>
      <td>${esc(baseAsset(t.sym))}</td><td>${esc(t.tf || '')}</td>
      <td class="${t.dir > 0 ? 'g' : 'r'}">${t.dir > 0 ? 'BUY' : 'SELL'}</td>
      <td>${this.clock(t.entryTime)}</td><td>${this.clock(t.exitTime)}</td>
      <td class="n">${this.held(t.entryTime, t.exitTime)}</td>
      <td class="n">${fmtPrice(t.entry)}</td><td class="n">${fmtPrice(t.exit)}</td>
      <td class="n ${cls(t.pnl)}">${money(t.pnl)}</td><td class="n">${(t.r || 0).toFixed(2)}</td>
      <td>${esc(t.reason || '')}</td></tr>`).join('');

    const filters = [
      f.bot === 'all' ? null : 'bot: ' + ((BOT_BY_ID[f.bot] || {}).name || f.bot),
      f.sym === 'all' ? null : 'instrument: ' + f.sym,
      f.tf === 'all' ? null : 'timeframe: ' + f.tf,
      f.side === 'all' ? null : 'side: ' + f.side,
      f.result === 'all' ? null : 'result: ' + f.result,
      f.day === 'all' ? null : 'day: ' + f.day,
    ].filter(Boolean).join(' \u00b7 ') || 'no filters \u2014 everything';

    const doc = `<!doctype html><html><head><meta charset="utf-8"><title>ASTRA \u2014 bot dashboard</title><style>
      *{box-sizing:border-box}
      body{font:12px/1.4 -apple-system,Segoe UI,Roboto,sans-serif;color:#16203a;margin:0;padding:24px 26px;background:#fff}
      h1{font-size:20px;margin:0 0 2px;letter-spacing:.06em}
      h2{font-size:12px;letter-spacing:.14em;color:#5b6b8c;margin:18px 0 6px;text-transform:uppercase;
        border-bottom:1px solid #dde3ee;padding-bottom:4px}
      .sub{color:#5b6b8c;margin-bottom:10px;font-size:11px}
      .paper{background:#fff4e5;border:1px solid #ffc98a;border-radius:6px;padding:7px 10px;margin:10px 0 14px;color:#7a4a00;font-size:11px}
      .kpis{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px}
      .k{border:1px solid #dde3ee;border-radius:6px;padding:6px 10px;min-width:96px}
      .k label{display:block;font-size:8.5px;letter-spacing:.11em;color:#7b88a4;text-transform:uppercase}
      .k b{font-size:14px}
      table{width:100%;border-collapse:collapse;font-size:10px}
      th{text-align:left;font-size:8.5px;letter-spacing:.09em;color:#7b88a4;text-transform:uppercase;
        border-bottom:1px solid #dde3ee;padding:4px 5px}
      td{padding:3px 5px;border-bottom:1px solid #eef1f7}
      td.n,th.n{text-align:right}
      .g{color:#12885c;font-weight:600}.r{color:#c02b3f;font-weight:600}
      tr{break-inside:avoid}
      .foot{margin-top:16px;font-size:9.5px;color:#7b88a4;border-top:1px solid #dde3ee;padding-top:7px}
      @page{margin:12mm;size:A4 landscape}
    </style></head><body>
      <h1>ASTRA \u00b7 BOT DASHBOARD</h1>
      <div class="sub">${new Date().toLocaleString()} \u00b7 ${esc(filters)}</div>
      <div class="paper"><b>Paper only.</b> Every trade below is simulated against real prices, spreads and commission.
        ASTRA has no connection that can place an order with a broker.</div>
      <div class="kpis">
        <div class="k"><label>Trades</label><b>${S.n}</b></div>
        <div class="k"><label>Won</label><b class="g">${S.won} \u00b7 ${Math.round(S.winRate)}%</b></div>
        <div class="k"><label>Lost</label><b class="r">${S.lost}</b></div>
        <div class="k"><label>Net</label><b class="${cls(S.net)}">${money(S.net)}</b></div>
        <div class="k"><label>Profit factor</label><b>${pf(S.pf)}</b></div>
        <div class="k"><label>Average R</label><b>${S.avgR.toFixed(2)}</b></div>
        <div class="k"><label>Avg win / loss</label><b>${fmtNum(S.avgWin)} / ${fmtNum(S.avgLoss)}</b></div>
        <div class="k"><label>Fees</label><b>${fmtNum(S.fees)}</b></div>
        <div class="k"><label>Days traded</label><b>${days.length}</b></div>
      </div>
      <h2>Every bot</h2>
      <table><thead><tr><th>Bot</th><th>Traded on</th><th class="n">Trades</th><th class="n">Won</th>
        <th class="n">Lost</th><th class="n">Win %</th><th class="n">Net</th><th class="n">Avg win</th>
        <th class="n">Avg loss</th><th class="n">Avg R</th><th class="n">PF</th><th class="n">Max DD</th>
        <th class="n">Fees</th></tr></thead><tbody>${botRows}</tbody></table>
      <h2>Day by day</h2>
      <table><thead><tr><th>Day</th><th class="n">Trades</th><th class="n">Won</th><th class="n">Lost</th>
        <th class="n">Win %</th><th class="n">Net</th><th class="n">Fees</th><th class="n">Avg R</th>
        <th class="n">Running total</th></tr></thead><tbody>${dayRows}</tbody></table>
      <h2>Trade log${list.length > 400 ? ' \u2014 newest 400 of ' + list.length : ''}</h2>
      <table><thead><tr><th>Bot</th><th>Instrument</th><th>TF</th><th>Side</th><th>Entered</th><th>Exited</th>
        <th class="n">Held</th><th class="n">Entry</th><th class="n">Exit</th><th class="n">P&amp;L</th>
        <th class="n">R</th><th>Why it closed</th></tr></thead><tbody>${tradeRows}</tbody></table>
      <div class="foot">Generated by ASTRA Terminal. Paper trading only \u2014 nothing in this document is financial advice.</div>
    </body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0';
    document.body.appendChild(frame);
    const d = frame.contentWindow.document;
    d.open(); d.write(doc); d.close();
    const go = () => {
      try { frame.contentWindow.focus(); frame.contentWindow.print(); }
      catch(e){ toast('Could not open the print dialogue', 'warn'); }
      setTimeout(() => frame.remove(), 60000);
    };
    if (d.readyState === 'complete') setTimeout(go, 250); else frame.onload = () => setTimeout(go, 250);
    toast('Choose \u201cSave as PDF\u201d in the print dialogue', 'info');
  },

  /* ---------- events ---------- */
  bind(host){
    host.querySelectorAll('[data-df]').forEach(el => el.addEventListener('change', () => {
      this.f[el.dataset.df] = el.value;
      Bots.render();
    }));
    host.querySelectorAll('[data-pickbot]').forEach(el => el.addEventListener('click', () => {
      this.f.bot = this.f.bot === el.dataset.pickbot ? 'all' : el.dataset.pickbot;
      Bots.render();
    }));
    host.querySelectorAll('[data-pickday]').forEach(el => el.addEventListener('click', () => {
      this.f.day = this.f.day === el.dataset.pickday ? 'all' : el.dataset.pickday;
      Bots.render();
    }));
    /* fold one instrument open or shut — several may be open at once, so two
       pairs can be read side by side */
    host.querySelectorAll('[data-picksym]').forEach(el => el.addEventListener('click', () => {
      const sym = el.dataset.picksym;
      if (this.symOpen[sym]) delete this.symOpen[sym]; else this.symOpen[sym] = true;
      Bots.render();
    }));
    /* the two buttons inside an opened panel must not fold it shut again */
    host.querySelectorAll('[data-onlysym]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      this.f.sym = this.f.sym === el.dataset.onlysym ? 'all' : el.dataset.onlysym;
      Bots.render();
    }));
    host.querySelectorAll('[data-chartsym]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      App.setSymbol(el.dataset.chartsym);
    }));

    /* ---- permitted / prohibited ---- */
    this.bindPairCards(host);

    /* the search redraws only the two columns, so the box keeps the cursor */
    const q = host.querySelector('#prSearch');
    if (q){
      q.addEventListener('input', () => {
        this.pairQ = q.value;
        const cols = host.querySelector('#prCols');
        if (cols){ cols.innerHTML = this.pairColumns(); this.bindPairCards(cols); }
      });
      if (this.pairQ){
        q.focus();
        try { q.setSelectionRange(this.pairQ.length, this.pairQ.length); } catch(e){}
      }
    }

    /* fold a section, or move it up and down the page */
    host.querySelectorAll('[data-secfold]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation();
      this.toggleFold(el.dataset.secfold);
      Bots.render();
    }));
    host.querySelectorAll('[data-secup]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation(); this.moveSec(el.dataset.secup, -1); Bots.render();
    }));
    host.querySelectorAll('[data-secdown]').forEach(el => el.addEventListener('click', e => {
      e.stopPropagation(); this.moveSec(el.dataset.secdown, 1); Bots.render();
    }));
    /* the title itself folds too, so the whole bar is a target */
    host.querySelectorAll('.dashSecHead h3').forEach(el => el.addEventListener('click', () => {
      const sec = el.closest('[data-sec]');
      if (sec){ this.toggleFold(sec.dataset.sec); Bots.render(); }
    }));

    host.querySelectorAll('[data-sort]').forEach(el => el.addEventListener('click', () => {
      const k = el.dataset.sort;
      if (this.f.sort === k) this.f.dir = -this.f.dir;
      else { this.f.sort = k; this.f.dir = -1; }
      Bots.render();
    }));
  },

  /* the prohibit / allow buttons — bound on a full render, and again on their
     own whenever a search redraws just the two columns */
  bindPairCards(host){
    const rule = (attr, value) => host.querySelectorAll('[' + attr + ']').forEach(el =>
      el.addEventListener('click', e => {
        e.stopPropagation();
        PairRules.setManual(el.getAttribute(attr), value);
        Bots.render();
      }));
    rule('data-prblock', 'block');
    rule('data-prallow', 'allow');
    rule('data-prauto', null);
  },
};
