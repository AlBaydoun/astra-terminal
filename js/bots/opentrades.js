/* ASTRA Terminal — Open Trades.

   Every position that is live right now, across every bot, on one screen, with
   full control over each one: move the stop, set or clear the target, switch a
   trailing stop on for that trade alone, bank part of it, or close it outright.

   Two things make this page behave itself:

   THE NUMBERS REFRESH, THE BOXES DO NOT. Prices move every second, so the live
   figures are rewritten in place through textContent. The inputs are never
   re-rendered while you are typing in them — an earlier version redrew the whole
   card on each tick and the cursor jumped out of the box mid-number.

   AN ADJUSTED TRADE IS MARKED. Moving a bot's stop is allowed — it is your
   money. But the position is stamped `touched` and the flag travels onto the
   closed trade, so a bot's record can always be read as "of these N trades, M
   were adjusted by hand". Interfering is fine; interfering invisibly is not. */
const OpenTrades = {

  timer: null,
  sortKey: 'entryTime',

  /* ---------- gathering ---------- */
  all(){
    const out = [];
    for (const b of BOTS){
      if (Bots.isPage(b)) continue;
      const L = Bots.ledger(b.id);
      if (!L) continue;
      for (const p of L.open) out.push({ bot: b.id, botName: b.name, p });
    }
    return out;
  },

  /* everything the live half of a card needs, recomputed from the latest price */
  live(row){
    const p = row.p;
    const q = Bots.quoteFor(p.sym);
    const px = q ? q.price : (p.last || p.entry);
    const unreal = BotEngine.cashPnl(p,(px - p.entry) * p.dir * p.qty) - p.fees;
    const R1 = p.stopDist || Math.abs(p.entry - (p.slInit || p.sl)) || 0;
    const rNow = R1 > 0 ? (px - p.entry) * p.dir / R1 : 0;
    /* how far price has to travel before each level is reached */
    const toStop = (px - p.sl) * p.dir;
    const toTp = p.tp != null ? (p.tp - px) * p.dir : null;
    return {
      px, unreal, rNow, R1, toStop, toTp,
      stale: !q,
      pctToStop: px > 0 ? toStop / px * 100 : 0,
      pctToTp: (p.tp != null && px > 0) ? toTp / px * 100 : null,
      cashToStop: toStop * p.qty * BotEngine.cashRate(p,true),
      cashToTp: toTp == null ? null : toTp * p.qty * BotEngine.cashRate(p),
      held: BotDash.held(p.entryTime, Date.now()),
      value: Math.abs(p.qty * p.entry)*BotEngine.cashRate(p,true),
    };
  },

  /* how far a level is, said in the two ways that matter: the move price has to
     make, and what it is worth. A raw price gap of 0.00140975 on XRP tells you
     nothing and does not fit in the cell. */
  gap(pct, cash){
    return Math.abs(pct).toFixed(2) + '% · ' + fmtNum(Math.abs(cash));
  },

  /* what the levels currently in the boxes are worth. Read from the INPUTS, not
     from the position, so the figures move as you type or click a percentage —
     the whole point being that a stop is a decision about money. */
  calcLine(row, host){
    const p = row.p, l = this.live(row);
    const k = row.bot + ':' + p.id;
    const scope = host || document;
    const slEl = scope.querySelector('[data-otsl="' + k + '"]');
    const tpEl = scope.querySelector('[data-ottp="' + k + '"]');
    const sl = slEl ? parseFloat(slEl.value) : p.sl;
    const tpRaw = tpEl ? tpEl.value.trim() : (p.tp == null ? '' : String(p.tp));
    const tp = tpRaw === '' ? null : parseFloat(tpRaw);

    const atStop = (sl > 0) ? BotEngine.cashPnl(p,Bots.moneyAt(p.entry, p.dir, p.qty, sl)) - p.fees : null;
    const atTp = (tp > 0) ? BotEngine.cashPnl(p,Bots.moneyAt(p.entry, p.dir, p.qty, tp)) - p.fees : null;
    const fromHere = (sl > 0) ? BotEngine.cashPnl(p,(sl - l.px) * p.dir * p.qty) : null;

    const cell = (label, value, cls) =>
      `<span class="mbCell"><label>${esc(label)}</label><b class="${cls || ''}">${value}</b></span>`;
    return cell('If the stop is hit', atStop == null ? '—' : (atStop >= 0 ? '+' : '') + fmtNum(atStop),
                atStop >= 0 ? 'up' : 'down') +
      cell('From here', fromHere == null ? '—' : (fromHere >= 0 ? '+' : '') + fmtNum(fromHere),
           fromHere >= 0 ? 'up' : 'down') +
      cell('If the target is hit', atTp == null ? 'no target' : '+' + fmtNum(atTp), 'up') +
      cell('Reward to risk',
           (atTp > 0 && fromHere < 0) ? (atTp / Math.abs(fromHere)).toFixed(2) + ' : 1' : '—');
  },

  /* ---------- the page ---------- */
  view(bot=null,summaryOnly=false,extras=null){
    /* the Open Trades page itself comes out in your ⚙ Layout order; a part you
       switch off stays on the page hidden, so the live refresh still finds it */
    if (!bot && !summaryOnly && extras && typeof BotLayout !== 'undefined') return BotLayout.compose('open', Object.assign({ notes: extras.notes || '', intro: extras.intro || '' }, this.parts()), true);
    const rows = this.all().filter(r => !bot || r.bot === bot);
    const tot = rows.reduce((a, r) => {
      const l = this.live(r);
      a.unreal += l.unreal; a.value += l.value;
      /* what the open stops would cost if every one were hit from here.
         toStop is positive while price is still on the right side of the
         stop, so THAT is the exposure — negating it read almost every
         healthy position as risking nothing. */
      a.risk += Math.max(0, l.toStop) * r.p.qty * BotEngine.cashRate(r.p,true);
      if (l.unreal >= 0) a.up++; else a.down++;
      return a;
    }, { unreal: 0, value: 0, risk: 0, up: 0, down: 0 });

    const real = (!bot && !summaryOnly && typeof LiveDesk !== 'undefined') ? '<div id="ldRealHost">' + LiveDesk.positionsView() + '</div>' : '';
    if (!rows.length) return real + `<div class="botStats">
        ${Bots.stat('OPEN NOW', 0)}
      </div>
      <div class="otList"></div><div class="empty otEmpty">Nothing is open. New positions appear here automatically.</div>`;

    const sorted = rows.slice().sort((a, b) => {
      if (this.sortKey === 'unreal') return this.live(b).unreal - this.live(a).unreal;
      if (this.sortKey === 'sym') return a.p.sym.localeCompare(b.p.sym);
      if (this.sortKey === 'bot') return a.botName.localeCompare(b.botName);
      return b.p.entryTime - a.p.entryTime;
    });

    const sortBtn = (k, label) =>
      `<button class="bMini${this.sortKey === k ? ' on' : ''}" data-otsort="${k}">${esc(label)}</button>`;

    return real + `<div class="botStats">
        ${Bots.stat('OPEN NOW', rows.length)}
        ${Bots.stat('IN PROFIT', tot.up, tot.up ? 1 : 0)}
        ${Bots.stat('IN LOSS', tot.down, -1)}
        ${Bots.stat('UNREALISED', (tot.unreal >= 0 ? '+' : '') + fmtNum(tot.unreal), tot.unreal)}
        ${Bots.stat('VALUE HELD', fmtNum(tot.value))}
        ${Bots.stat('STILL AT RISK', fmtNum(tot.risk), -1)}
      </div>
      <div class="otBar">
        <span class="insLbl">Order</span>
        ${sortBtn('entryTime', 'Newest')}${sortBtn('unreal', 'Best first')}
        ${sortBtn('sym', 'Instrument')}${sortBtn('bot', 'Bot')}
        <span class="otHint">Live figures refresh every second. Anything you type is left alone.</span>
      </div>
      ${bot ? '' : this.botFilterBar(rows)}
      <div class="otList">${summaryOnly?'':sorted.map(r => this.card(r)).join('')}</div>
      <div class="empty otFilterEmpty" hidden>No open trade from that bot right now.</div>
      <div class="botNote">Adjusting a bot's trade is allowed — it is your money. The trade is marked
        <b>adjusted</b> and stays marked when it closes, so a bot's record never quietly counts a trade
        the strategy did not run on its own. The original risk is never rewritten, so its R still measures
        what was staked when it opened.</div>`;
  },

  card(row){
    const p = row.p, l = this.live(row);
    const ui = typeof WorkspaceUI !== 'undefined' ? WorkspaceUI : null;
    const icon = name => ui ? ui.icon(name) : '';
    const k = row.bot + ':' + p.id;
    const trail = p.trail !== undefined ? p.trail : (Bots.cfg(row.bot) || {}).trail;
    const trailOn = !!trail;
    return `<div class="otCard ${l.unreal >= 0 ? 'up' : 'down'}" data-ot="${esc(k)}">

      <div class="otHead">
        <b class="${p.dir > 0 ? 'up' : 'down'}">${p.dir > 0 ? 'BUY' : 'SELL'} ${typeof WorkspaceUI!=='undefined'?WorkspaceUI.pair(p.sym):esc(baseAsset(p.sym))}</b>
        <button type="button" class="otTag otBotLink" data-otdive="${esc(row.bot)}" title="Go to ${esc(row.botName)} — its page, its net result and its open trades">${esc(row.botName)} ↗</button>
        <span class="otTag dim">${esc(p.tf || '')}${p.model ? ' · ' + esc(p.model) : ''}${p.riskMult > 1 ? ' · size ×' + p.riskMult.toFixed(1) : ''}</span>
        <span class="otTag warn" data-f="adjusted" ${p.touched?'':'hidden'} title="stop, target or size was changed by hand">adjusted</span>
        <span class="otTag on" data-f="trailing" ${trailOn?'':'hidden'}>trailing</span>
        <button class="bMini otChart" data-otchart="${esc(k)}" title="Open the chart with this trade's stop and target drawn — drag them to change">On chart ↗</button>
        <span class="otTag warn" data-f="stale" ${l.stale?'':'hidden'} title="no fresh quote for this instrument">no quote</span>
        <span class="otPnl ${pctClass(l.unreal)}" data-f="unreal">${(l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal)}</span>
      </div>

      <div class="otFacts">
        <span><label>Size</label><b data-f="size">${p.lots ? p.lots + ' lot' : +p.qty.toPrecision(4)}</b></span>
        <span><label>Entry</label><b>${fmtPrice(p.entry)}</b></span>
        <span><label>Now</label><b data-f="px">${fmtPrice(l.px)}</b></span>
        <span><label>R so far</label><b class="${pctClass(l.rNow)}" data-f="r">${l.rNow.toFixed(2)}</b></span>
        <span><label>To stop</label><b data-f="tostop">${this.gap(l.pctToStop, l.cashToStop)}</b></span>
        <span><label>To target</label><b data-f="totp">${l.toTp == null ? 'none' : this.gap(l.pctToTp, l.cashToTp)}</b></span>
        <span><label>Best / worst</label><b data-f="mfe">+${fmtNum(p.mfe || 0)} / -${fmtNum(p.mae || 0)}</b></span>
        ${(w => w ? `<span title="Opened ${esc(w.full)} (your computer’s clock)"><label>Opened</label><b class="otWhen">🕒 ${esc(w.abs)}</b></span>` : '')(typeof PosLines !== 'undefined' && PosLines.openedAt ? PosLines.openedAt(p.entryTime) : null)}
        <span><label>Held</label><b data-f="held">${l.held}</b></span>
      </div>

      ${ui ? `<div class="wsPriceMap">${ui.priceMap(p,l,{k})}</div>
        <div class="wsTradeLinks"><button data-ws-chart="${esc(p.sym)}">${icon('chart')} Chart · ${esc(p.sym)}</button>
        <button data-ws-bot="${esc(row.bot)}">${icon('bot')} View bot</button></div>` : ''}

      <section class="wsTradeSection"><h3>${icon('shield')} Stop loss &amp; take profit</h3>
      <div class="otCtl">
        <label class="otIn">Stop<input type="number" step="any" data-otsl="${esc(k)}" data-saved="${p.sl}" value="${p.sl}"></label>
        <span class="pctRow">${Bots.PCT_STEPS.map(pc =>
          `<button class="pctBtn" data-otpct="${esc(k)}:sl:${pc}" title="put the stop ${pc}% from the price now">${pc}%</button>`).join('')}</span>
      </div>
      <div class="otCtl">
        <label class="otIn">Target<input type="number" step="any" data-ottp="${esc(k)}" data-saved="${p.tp == null ? '' : p.tp}" value="${p.tp == null ? '' : p.tp}" placeholder="none"></label>
        <span class="pctRow">${Bots.PCT_STEPS.map(pc =>
          `<button class="pctBtn" data-otpct="${esc(k)}:tp:${pc}" title="put the target ${pc}% from the price now">${pc}%</button>`).join('')}</span>
      </div>
      <div class="otCalc" data-otcalc="${esc(k)}">${this.calcLine(row)}</div>
      <div class="otCtl">
        <button class="bMini go" data-otset="${esc(k)}">Apply levels</button>
        <button class="bMini" data-otbe="${esc(k)}" title="move the stop to the entry price">Break even</button>
      </div>
      </section>

      <section class="wsTradeSection"><h3>${icon('chart')} Trailing stop</h3>
      <div class="otCtl">
        <label class="otIn">Trail starts at<input type="number" step="0.1" min="0.1" data-otts="${esc(k)}"
          value="${trailOn && trail.start != null ? trail.start : 1}"><i>R</i></label>
        <label class="otIn">and holds<input type="number" step="0.1" min="0.1" data-ottg="${esc(k)}"
          value="${trailOn && trail.gap != null ? trail.gap : 0.5}"><i>R back</i></label>
        <button class="bMini${trailOn ? ' on' : ''}" data-ottrail="${esc(k)}">${trailOn ? 'Update trail' : 'Start trailing'}</button>
        <button class="bMini" data-ottrailoff="${esc(k)}" ${trailOn?'':'hidden'}>Stop trailing</button>
      </div>
      </section>

      <section class="wsTradeSection wsExit"><h3>${icon('exit')} Reduce or close position</h3>
      <div class="otCtl">
        <button class="bMini" data-otpart="${esc(k)}:0.25">Take 25% off</button>
        <button class="bMini" data-otpart="${esc(k)}:0.5">Take half off</button>
        <button class="bMini danger" data-otclose="${esc(k)}" data-f="closebtn">Close at market · ${(l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal)}</button>
        <span class="otWhy">${esc((p.reasons || []).slice(0, 1).join('') || p.note || '')}</span>
      </div>
      </section>

      ${p.edits && p.edits.length ? `<div class="otEdits">${
        p.edits.slice(-4).map(e => `<i>${esc(BotDash.clock(e.at))} — ${esc(e.what)}</i>`).join('')}</div>` : ''}
    </div>`;
  },

  /* the page's parts, for ⚙ Layout */
  parts(){
    const rows = this.all();
    const tot = rows.reduce((a, r) => {
      const l = this.live(r);
      a.unreal += l.unreal; a.value += l.value;
      a.risk += Math.max(0, l.toStop) * r.p.qty * BotEngine.cashRate(r.p,true);
      if (l.unreal >= 0) a.up++; else a.down++;
      return a;
    }, { unreal: 0, value: 0, risk: 0, up: 0, down: 0 });
    const sorted = rows.slice().sort((a, b) => {
      if (this.sortKey === 'unreal') return this.live(b).unreal - this.live(a).unreal;
      if (this.sortKey === 'sym') return a.p.sym.localeCompare(b.p.sym);
      if (this.sortKey === 'bot') return a.botName.localeCompare(b.botName);
      return b.p.entryTime - a.p.entryTime;
    });
    const sortBtn = (k, label) => `<button class="bMini${this.sortKey === k ? ' on' : ''}" data-otsort="${k}">${esc(label)}</button>`;
    return {
      real: typeof LiveDesk !== 'undefined' ? '<div id="ldRealHost">' + LiveDesk.positionsView() + '</div>' : '',
      stats: rows.length ? `<div class="botStats">
        ${Bots.stat('OPEN NOW', rows.length)}
        ${Bots.stat('IN PROFIT', tot.up, tot.up ? 1 : 0)}
        ${Bots.stat('IN LOSS', tot.down, -1)}
        ${Bots.stat('UNREALISED', (tot.unreal >= 0 ? '+' : '') + fmtNum(tot.unreal), tot.unreal)}
        ${Bots.stat('VALUE HELD', fmtNum(tot.value))}
        ${Bots.stat('STILL AT RISK', fmtNum(tot.risk), -1)}
      </div>` : `<div class="botStats">${Bots.stat('OPEN NOW', 0)}</div>`,
      sort: rows.length ? `<div class="otBar">
        <span class="insLbl">Order</span>
        ${sortBtn('entryTime', 'Newest')}${sortBtn('unreal', 'Best first')}
        ${sortBtn('sym', 'Instrument')}${sortBtn('bot', 'Bot')}
        <span class="otHint">Live figures refresh every second. Anything you type is left alone.</span>
      </div>` : '',
      table: rows.length ? this.tableHtml(rows) : '',
      filter: rows.length ? this.botFilterBar(rows) : '',
      list: `<div class="otList">${sorted.map(r => this.card(r)).join('')}</div>
      <div class="empty otFilterEmpty" hidden>No open trade from that bot right now.</div>` +
        (rows.length ? '' : '<div class="empty otEmpty">Nothing is open. New positions appear here automatically.</div>'),
      note: `<div class="botNote">Adjusting a bot's trade is allowed — it is your money. The trade is marked
        <b>adjusted</b> and stays marked when it closes, so a bot's record never quietly counts a trade
        the strategy did not run on its own. The original risk is never rewritten, so its R still measures
        what was staked when it opened.</div>`,
    };
  },

  /* ---------- the summary table ----------
     Every open trade on one line: green while it is in profit, red while it is
     losing. A click on a heading sorts by it (again: the other way round), a
     click on a line takes you to that trade's card below, and the ▸ opens the
     line itself - the levels, what they are worth, why it was opened. The live
     figures are rewritten in place every second; the order only changes when
     you ask for it, so a line never jumps away from under the mouse. */
  tblSort: { k: 'unreal', dir: -1 },
  tblOpen: new Set(),
  TBL_COLS: [
    ['bot', 'Bot'], ['sym', 'Instrument'], ['dir', 'Side'], ['tf', 'TF'], ['size', 'Size', 'num'],
    ['entry', 'Entry', 'num'], ['px', 'Now', 'num'], ['unreal', 'Profit / loss', 'num'], ['pct', '%', 'num'],
    ['r', 'R', 'num'], ['tostop', 'To stop', 'num'], ['totp', 'To target', 'num'], ['opened', 'Opened'], ['held', 'Held', 'num'],
  ],
  tblVal(row, l, k){
    const p = row.p;
    switch (k){
      case 'bot': return row.botName.toLowerCase();
      case 'sym': return baseAsset(p.sym).toLowerCase();
      case 'dir': return p.dir;
      case 'tf': return typeof tfSeconds === 'function' ? (tfSeconds(p.tf) || 0) : 0;
      case 'size': return l.value;
      case 'entry': return p.entry;
      case 'px': return l.px;
      case 'unreal': return l.unreal;
      case 'pct': return l.value > 0 ? l.unreal / l.value : 0;
      case 'r': return l.rNow;
      case 'tostop': return l.cashToStop;
      case 'totp': return l.cashToTp == null ? -Infinity : l.cashToTp;
      case 'opened': return p.entryTime;
      case 'held': return -p.entryTime;
    }
    return 0;
  },
  tblSorted(rows){
    const { k, dir } = this.tblSort;
    const lv = new Map(rows.map(r => [r, this.live(r)]));
    return rows.slice().sort((a, b) => {
      const x = this.tblVal(a, lv.get(a), k), y = this.tblVal(b, lv.get(b), k);
      return (typeof x === 'string' ? x.localeCompare(y) : x - y) * dir || b.p.entryTime - a.p.entryTime;
    });
  },
  /* the figures of one line, by column - shared by the first draw and the refresh */
  tblCells(row, l){
    const p = row.p, sign = v => (v >= 0 ? '+' : '') + fmtNum(v);
    const w = typeof PosLines !== 'undefined' && PosLines.openedAt ? PosLines.openedAt(p.entryTime) : null;
    const pc = l.value > 0 ? l.unreal / l.value * 100 : null;
    return {
      size: p.lots ? p.lots + ' lot' : String(+p.qty.toPrecision(4)),
      px: fmtPrice(l.px) + (l.stale ? ' ⚠' : ''),
      unreal: sign(l.unreal), pct: pc == null ? '—' : (pc >= 0 ? '+' : '') + pc.toFixed(2) + '%',
      r: (l.rNow >= 0 ? '+' : '') + l.rNow.toFixed(2),
      tostop: p.sl > 0 ? this.gap(l.pctToStop, l.cashToStop) : 'no stop',
      totp: l.toTp == null ? 'none' : this.gap(l.pctToTp, l.cashToTp),
      opened: w ? w.abs : '', held: l.held,
    };
  },
  tblRowHtml(row){
    const p = row.p, l = this.live(row), c = this.tblCells(row, l), k = row.bot + ':' + p.id;
    const open = this.tblOpen.has(k), cls = l.unreal >= 0 ? 'up' : 'down';
    const w = typeof PosLines !== 'undefined' && PosLines.openedAt ? PosLines.openedAt(p.entryTime) : null;
    return `<tr class="otSumRow ${cls}" data-otrow="${esc(k)}" title="Go to this trade">
        <td class="otSumBot"><button type="button" class="otSumDrill" data-otdrill="${esc(k)}" title="Show the details of this trade here" aria-expanded="${open}">${open ? '▾' : '▸'}</button>${esc(row.botName)}</td>
        <td><b>${esc(baseAsset(p.sym))}</b> <span class="dim2">${esc(p.sym)}</span></td>
        <td class="${p.dir > 0 ? 'up' : 'down'}"><b>${p.dir > 0 ? 'BUY' : 'SELL'}</b></td>
        <td>${esc(p.tf || '—')}</td>
        <td class="num" data-c="size">${esc(c.size)}</td>
        <td class="num">${esc(fmtPrice(p.entry))}</td>
        <td class="num" data-c="px">${esc(c.px)}</td>
        <td class="num otSumPnl" data-c="unreal">${esc(c.unreal)}</td>
        <td class="num" data-c="pct">${esc(c.pct)}</td>
        <td class="num" data-c="r">${esc(c.r)}</td>
        <td class="num" data-c="tostop">${esc(c.tostop)}</td>
        <td class="num" data-c="totp">${esc(c.totp)}</td>
        <td${w ? ` title="${esc(w.full)}"` : ''}>${esc(c.opened)}</td>
        <td class="num" data-c="held">${esc(c.held)}</td>
      </tr>
      <tr class="otSumDetail" data-otdetail="${esc(k)}"${open ? '' : ' hidden'}><td colspan="${this.TBL_COLS.length}">${open ? this.tblDetail(row) : ''}</td></tr>`;
  },
  /* the line, opened: levels and what each is worth, then the way into everything else */
  tblDetail(row){
    const p = row.p, l = this.live(row), k = row.bot + ':' + p.id;
    const atStop = p.sl > 0 ? BotEngine.cashPnl(p, Bots.moneyAt(p.entry, p.dir, p.qty, p.sl)) - p.fees : null;
    const atTp = p.tp > 0 ? BotEngine.cashPnl(p, Bots.moneyAt(p.entry, p.dir, p.qty, p.tp)) - p.fees : null;
    const sign = v => v == null ? '—' : (v >= 0 ? '+' : '') + fmtNum(v);
    const trail = p.trail !== undefined ? p.trail : (Bots.cfg(row.bot) || {}).trail;
    const w = typeof PosLines !== 'undefined' && PosLines.openedAt ? PosLines.openedAt(p.entryTime) : null;
    const f = (lab, val, cls) => `<span><label>${esc(lab)}</label><b class="${cls || ''}">${val}</b></span>`;
    const fx = p.meta && p.meta.accountFx;
    return `<div class="otSumDrillBody">
      <div class="otSumFacts">
        ${f('Stop', p.sl > 0 ? esc(fmtPrice(p.sl)) : 'none')}
        ${f('If the stop is hit', esc(sign(atStop)), atStop == null ? '' : atStop >= 0 ? 'up' : 'down')}
        ${f('Target', p.tp > 0 ? esc(fmtPrice(p.tp)) : 'none')}
        ${f('If the target is hit', esc(sign(atTp)), 'up')}
        ${f('Value held', esc(fmtNum(l.value)))}
        ${f('Best / worst so far', '+' + esc(fmtNum(p.mfe || 0)) + ' / -' + esc(fmtNum(p.mae || 0)))}
        ${f('Costs paid', esc(fmtNum(p.fees || 0)))}
        ${f('Opened', esc(w ? w.full : new Date(p.entryTime).toLocaleString()))}
        ${f('Strategy', esc(p.model || '—'))}
        ${f('Trailing stop', trail ? 'on — starts ' + esc(String(trail.start)) + 'R, holds ' + esc(String(trail.gap)) + 'R back' : 'off')}
        ${p.touched ? f('Adjusted by hand', p.edits && p.edits.length ? p.edits.length + ' change' + (p.edits.length === 1 ? '' : 's') : 'yes', 'warn') : ''}
        ${fx && fx.from ? f('Priced in', esc(fx.from) + ' → ' + esc(fx.currency || 'USD')) : ''}
      </div>
      ${(p.reasons || []).length ? `<ul class="otSumWhy">${p.reasons.slice(0, 6).map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="otSumGo">
        <button class="bMini go" data-otgoto="${esc(k)}">Go to this trade ↓</button>
        <button class="bMini" data-otsumchart="${esc(k)}">On chart ↗</button>
        <button class="bMini" data-otdive="${esc(row.bot)}">${esc(row.botName)} ↗</button>
      </div>
    </div>`;
  },
  tableHtml(rows){
    const head = this.TBL_COLS.map(([k, label, cls]) => {
      const on = this.tblSort.k === k;
      return `<th class="sortable${on ? ' sorted' : ''}${cls ? ' ' + cls : ''}" data-otsortcol="${k}" title="Sort by ${esc(label)}">${esc(label)}${on ? (this.tblSort.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
    }).join('');
    return `<div class="otSum"><div class="dashScroll"><table class="dashTable otSumTable">
      <thead><tr>${head}</tr></thead>
      <tbody>${this.tblSorted(rows).map(r => this.tblRowHtml(r)).join('')}</tbody>
      <tfoot>${this.tblFoot(rows)}</tfoot></table></div>
      <div class="dim2 otSumHint">Click a heading to sort · click a line to go to that trade · ▸ opens the line</div></div>`;
  },
  tblFoot(rows){
    let up = 0, down = 0, sum = 0, value = 0;
    for (const r of rows){ const l = this.live(r); sum += l.unreal; value += l.value; if (l.unreal >= 0) up++; else down++; }
    return `<tr class="dashTotal"><td colspan="4">${rows.length} open · <span class="up">${up} in profit</span> · <span class="down">${down} losing</span></td>
      <td class="num">${esc(fmtNum(value))}</td><td colspan="2"></td>
      <td class="num ${sum >= 0 ? 'up' : 'down'}">${(sum >= 0 ? '+' : '') + esc(fmtNum(sum))}</td><td colspan="6"></td></tr>`;
  },
  updateTable(host, rows){
    const box = host.querySelector('.otSum'); if (!box) return;
    const body = box.querySelector('tbody');
    const want = new Set(rows.map(r => r.bot + ':' + r.p.id));
    const have = new Set([...body.querySelectorAll('tr[data-otrow]')].map(tr => tr.dataset.otrow));
    /* a trade opened or closed: the lines are drawn again, in the chosen order */
    if (want.size !== have.size || [...want].some(k => !have.has(k))){
      for (const k of [...this.tblOpen]) if (!want.has(k)) this.tblOpen.delete(k);
      body.innerHTML = this.tblSorted(rows).map(r => this.tblRowHtml(r)).join('');
      box.querySelector('tfoot').innerHTML = this.tblFoot(rows);
      if (this.filterBot) this.applyFilter(host);
      return;
    }
    for (const row of rows){
      const k = row.bot + ':' + row.p.id, tr = body.querySelector('tr[data-otrow="' + CSS.escape(k) + '"]'); if (!tr) continue;
      const l = this.live(row), c = this.tblCells(row, l);
      for (const [f, v] of Object.entries(c)){ const td = tr.querySelector('[data-c="' + f + '"]'); if (td && td.textContent !== v) td.textContent = v; }
      tr.classList.toggle('up', l.unreal >= 0); tr.classList.toggle('down', l.unreal < 0);
    }
    box.querySelector('tfoot').innerHTML = this.tblFoot(rows);
  },
  /* take the eye to the trade's card: unfold its part, lift a bot filter that hides it, flash it */
  goTo(host, k){
    const root = host.closest('#botBody') || host;
    const find = () => root.querySelector('.otList [data-ot="' + CSS.escape(k) + '"]');
    let card = find();
    if (!card) return toast('That trade is no longer open', 'info');
    if (card.hidden){ this.filterBot = ''; this.applyFilter(root); }
    const fold = card.closest('.blFoldable.blFolded');
    if (fold){ const bar = fold.querySelector('.blFoldBar'); if (bar) bar.click(); card = find() || card; }
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
    card.classList.remove('otFlash'); void card.offsetWidth; card.classList.add('otFlash');
    setTimeout(() => card.classList.remove('otFlash'), 2400);
  },
  bindTable(host){
    const box = host.querySelector('.otSum'); if (!box || box._otb) return; box._otb = true;
    box.addEventListener('click', e => {
      const th = e.target.closest('[data-otsortcol]');
      if (th){
        const k = th.dataset.otsortcol;
        this.tblSort = this.tblSort.k === k ? { k, dir: -this.tblSort.dir } : { k, dir: ['bot', 'sym', 'tf', 'opened'].includes(k) ? 1 : -1 };
        const parent = box.parentElement;
        box.outerHTML = this.tableHtml(this.all());
        this.bindTable(parent);
        if (this.filterBot) this.applyFilter(parent);
        return;
      }
      const dr = e.target.closest('[data-otdrill]');
      if (dr){
        const k = dr.dataset.otdrill, row = this.all().find(r => r.bot + ':' + r.p.id === k);
        const det = box.querySelector('tr[data-otdetail="' + CSS.escape(k) + '"]'); if (!row || !det) return;
        if (this.tblOpen.has(k)){ this.tblOpen.delete(k); det.hidden = true; dr.textContent = '▸'; dr.setAttribute('aria-expanded', 'false'); }
        else { this.tblOpen.add(k); det.firstElementChild.innerHTML = this.tblDetail(row); det.hidden = false; dr.textContent = '▾'; dr.setAttribute('aria-expanded', 'true'); }
        return;
      }
      const go = e.target.closest('[data-otgoto]'); if (go) return this.goTo(box, go.dataset.otgoto);
      const ch = e.target.closest('[data-otsumchart]');
      if (ch){ const { bot, id } = this.split(ch.dataset.otsumchart); if (typeof PosLines !== 'undefined') PosLines.show(bot, id); return; }
      if (e.target.closest('[data-otdive], .otSumDetail')) return;   /* the bot link is handled by the page; clicks inside the detail stay there */
      const tr = e.target.closest('tr[data-otrow]'); if (tr) this.goTo(box, tr.dataset.otrow);
    });
  },

  /* ---------- the live half, rewritten in place ----------
     Only the figures inside [data-f] are touched, so a number being typed into
     a stop box is never yanked away mid-edit. */
  /* which page is showing cards right now: the Open Trades page (every bot),
     the manual desk (its own), or any bot's page (its own) */
  scope(){
    const a = Bots.active;
    if (a === 'open') return { host: document.getElementById('botBody'), bot: null };
    if (a === 'manual') return { host: document.getElementById('manualPositions'), bot: 'manual' };
    const b = BOT_BY_ID[a];
    if (b && Bots.isPage && !Bots.isPage(b) && !b.manual && !b.liveManual) return { host: document.getElementById('botPositions'), bot: a };
    return null;
  },
  refresh(){
    const sc = this.scope();
    const host = sc && sc.host;
    if (!host) return this.stop();
    const rows = this.all().filter(r => !sc.bot || r.bot === sc.bot);
    const byKey = {};
    for (const r of rows) byKey[r.bot + ':' + r.p.id] = r;

    host.querySelectorAll('[data-ot]').forEach(card => {
      const row = byKey[card.dataset.ot];
      if (!row){ card.remove(); return; }
      const l = this.live(row), p = row.p;
      const set = (f, text, cls) => {
        const el = card.querySelector('[data-f="' + f + '"]');
        if (el && el.dataset.armed === '1') return;
        if (!el) return;
        if (el.textContent !== text) el.textContent = text;
        if (cls != null) el.className = cls;
      };
      set('unreal', (l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal), 'otPnl ' + pctClass(l.unreal));
      set('px', fmtPrice(l.px));
      set('r', l.rNow.toFixed(2), pctClass(l.rNow));
      set('tostop', this.gap(l.pctToStop, l.cashToStop));
      set('totp', l.toTp == null ? 'none' : this.gap(l.pctToTp, l.cashToTp));
      set('mfe', '+' + fmtNum(p.mfe || 0) + ' / -' + fmtNum(p.mae || 0));
      set('held', l.held);
      set('size',p.lots?p.lots+' lot':String(+p.qty.toPrecision(4)));
      const trail=p.trail!==undefined?p.trail:(Bots.cfg(row.bot)||{}).trail;
      for(const [field,on] of [['adjusted',p.touched],['trailing',trail],['stale',l.stale]])card.querySelector('[data-f="'+field+'"]').hidden=!on;
      const trailing=card.querySelector('[data-ottrail]');
      trailing.textContent=trail?'Update trail':'Start trailing';trailing.classList.toggle('on',!!trail);
      card.querySelector('[data-ottrailoff]').hidden=!trail;
      for(const [field,value] of [['otsl',p.sl],['ottp',p.tp??'']]){
        const input=card.querySelector('[data-'+field+']');
        if(input.value===input.dataset.saved&&document.activeElement!==input)input.value=value;
        input.dataset.saved=String(value);
      }
      this.recalc(card,row.bot+':'+p.id);
      const map = card.querySelector('.wsPriceMap');
      /* never rebuild the rail under a hand that is dragging one of its handles */
      if (map && typeof WorkspaceUI !== 'undefined' && !(typeof PriceRail !== 'undefined' && PriceRail.busy(map)))
        map.innerHTML = WorkspaceUI.priceMap(p, l, { k: row.bot + ':' + p.id });
      const cb = card.querySelector('[data-f="closebtn"]:not([data-armed="1"])');
      if (cb) cb.textContent = 'Close at market · ' + (l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal);
      card.classList.toggle('up', l.unreal >= 0); card.classList.toggle('down', l.unreal < 0);   /* keeps the highlight from the summary table */
    });
    // Preserve surviving cards and drafts even when another position opens or closes.
    const present = new Set([...host.querySelectorAll('[data-ot]')].map(el=>el.dataset.ot));
    for (const row of rows) if (!present.has(row.bot+':'+row.p.id)){
      const list=host.querySelector('.otList');
      list.insertAdjacentHTML('afterbegin',this.card(row));
      this.bind(list.firstElementChild);
    }
    if (!sc.bot) this.updateTable(host, rows);
    const template=document.createElement('div');
    template.innerHTML=this.view(sc.bot,true);
    host.querySelector('.botStats')?.replaceWith(template.querySelector('.botStats'));
    host.querySelector('.otEmpty')?.remove();
    if(!rows.length)host.querySelector('.otList').insertAdjacentHTML('afterend','<div class="empty otEmpty">No open positions.</div>');
    if(rows.length&&!host.querySelector('.otBar')){
      const bar=template.querySelector('.otBar');host.querySelector('.otList').before(bar);this.bind(bar);
    }
  },

  start(){
    this.stop();
    this.timer = setInterval(() => this.refresh(), 1000);
  },
  stop(){ if (this.timer){ clearInterval(this.timer); this.timer = null; } },

  /* ---------- controls ---------- */
  split(k){ const i = k.indexOf(':'); return { bot: k.slice(0, i), id: +k.slice(i + 1) }; },

  levels(host, k){
    const sl = host.querySelector('[data-otsl="' + k + '"]');
    const tp = host.querySelector('[data-ottp="' + k + '"]');
    const slv = sl ? parseFloat(sl.value) : NaN;
    const tpRaw = tp ? tp.value.trim() : '';
    return { sl: isNaN(slv) ? null : slv, tp: tpRaw === '' ? 0 : parseFloat(tpRaw) };
  },

  recalc(host, k){
    const row = this.all().find(r => r.bot + ':' + r.p.id === k);
    const box = host.querySelector('[data-otcalc="' + k + '"]');
    if (row && box) box.innerHTML = this.calcLine(row, host);
  },

  /* ---- filter by bot: one chip per bot that has something open ----
     Filtering hides cards instead of re-rendering, so nothing you are typing
     into a card is lost, and the 1-second refresh keeps working underneath. */
  filterBot: '',
  botFilterBar(rows){
    const counts = {};
    for (const r of rows) counts[r.bot] = (counts[r.bot] || 0) + 1;
    const ids = Object.keys(counts);
    if (ids.length < 2 && !this.filterBot) return '';
    const chip = (id, label, n) =>
      `<button class="bMini${(this.filterBot || '') === id ? ' on' : ''}" data-otbot="${esc(id)}">${esc(label)}${n != null ? ' <small>' + n + '</small>' : ''}</button>`;
    return `<div class="otBar otFilter"><span class="insLbl">Show</span>
      ${chip('', 'All bots', rows.length)}
      ${ids.map(id => chip(id, (rows.find(r => r.bot === id) || {}).botName || id, counts[id])).join('')}</div>`;
  },
  applyFilter(host){
    const root = host.closest('#manualPositions, #botBody') || host;
    const want = this.filterBot || '';
    let shown = 0;
    root.querySelectorAll('.otList [data-ot]').forEach(card => {
      const hit = !want || card.dataset.ot.split(':')[0] === want;
      card.hidden = !hit; if (hit) shown++;
    });
    root.querySelectorAll('.otSum tr[data-otrow]').forEach(tr => {
      const hit = !want || tr.dataset.otrow.split(':')[0] === want;
      tr.hidden = !hit;
      const d = tr.nextElementSibling; if (d && d.classList.contains('otSumDetail')) d.hidden = !hit || !this.tblOpen.has(tr.dataset.otrow);
    });
    const empty = root.querySelector('.otFilterEmpty');
    if (empty) empty.hidden = !(want && !shown);
    root.querySelectorAll('[data-otbot]').forEach(b => b.classList.toggle('on', (b.dataset.otbot || '') === want));
  },

  /* a bot's page is rebuilt every 30 seconds; anything typed into a stop or
     target box must survive that */
  snapshot(host){
    const out = {};
    if (!host) return out;
    host.querySelectorAll('[data-otsl],[data-ottp],[data-otts],[data-ottg]').forEach(el => {
      const k = el.dataset.otsl != null ? 'sl:' + el.dataset.otsl : el.dataset.ottp != null ? 'tp:' + el.dataset.ottp
              : el.dataset.otts != null ? 'ts:' + el.dataset.otts : 'tg:' + el.dataset.ottg;
      if (el.value !== (el.dataset.saved != null ? el.dataset.saved : el.defaultValue)) out[k] = el.value;
    });
    return out;
  },
  restore(host, snap){
    if (!host || !snap) return;
    for (const [k, v] of Object.entries(snap)){
      const [kind, key] = [k.slice(0, 2), k.slice(3)];
      const attr = { sl: 'data-otsl', tp: 'data-ottp', ts: 'data-otts', tg: 'data-ottg' }[kind];
      const el = host.querySelector('[' + attr + '="' + key + '"]');
      if (el) el.value = v;
    }
  },

  bind(host){
    if (typeof LiveDesk !== 'undefined' && host.querySelector('#ldRealHost')) LiveDesk.bindPositions(host.querySelector('#ldRealHost'));
    this.bindTable(host);
    host.querySelectorAll('[data-otchart]').forEach(el => el.addEventListener('click', () => {
      const { bot, id } = this.split(el.dataset.otchart);
      if (typeof PosLines !== 'undefined') PosLines.show(bot, id);
    }));
    host.querySelectorAll('[data-otbot]').forEach(el => el.addEventListener('click', () => {
      this.filterBot = el.dataset.otbot || '';
      this.applyFilter(host);
    }));
    if (this.filterBot) this.applyFilter(host);
    host.querySelectorAll('[data-otsort]').forEach(el => el.addEventListener('click', () => {
      this.sortKey = el.dataset.otsort;
      const list=host.closest('#manualPositions, #botBody').querySelector('.otList');
      const lookup=new Map(this.all().map(r=>[r.bot+':'+r.p.id,r]));
      [...list.children].sort((a,b)=>{
        const x=lookup.get(a.dataset.ot),y=lookup.get(b.dataset.ot);
        if(!x||!y)return 0;
        return this.sortKey==='unreal'?this.live(y).unreal-this.live(x).unreal:this.sortKey==='sym'?x.p.sym.localeCompare(y.p.sym):this.sortKey==='bot'?x.botName.localeCompare(y.botName):y.p.entryTime-x.p.entryTime;
      }).forEach(node=>list.append(node));
      el.parentElement.querySelectorAll('[data-otsort]').forEach(b=>b.classList.toggle('on',b===el));
    }));
    host.querySelectorAll('[data-otset]').forEach(el => el.addEventListener('click', () => {
      const { bot, id } = this.split(el.dataset.otset);
      Bots.editPos(bot, id, this.levels(host, el.dataset.otset));
    }));
    /* a percentage fills the box with the real price that far from the market */
    host.querySelectorAll('[data-otpct]').forEach(el => el.addEventListener('click', () => {
      const raw = el.dataset.otpct;
      const parts = raw.split(':');            // bot:id:which:pct
      const k = parts[0] + ':' + parts[1], which = parts[2], pc = parseFloat(parts[3]);
      const row = this.all().find(r => r.bot + ':' + r.p.id === k);
      if (!row) return;
      const q = Bots.quoteFor(row.p.sym);
      if (!q) return toast('No live price for ' + baseAsset(row.p.sym), 'warn');
      const box = host.querySelector('[data-' + (which === 'tp' ? 'ottp' : 'otsl') + '="' + k + '"]');
      if (box) box.value = +Bots.levelAt(q.price, row.p.dir, pc, which).toFixed(8);
      host.querySelectorAll('[data-otpct^="' + k + ':' + which + ':"]')
        .forEach(x => x.classList.toggle('on', x === el));
      this.recalc(host, k);
    }));
    /* and the same figures move as you type into either box */
    host.querySelectorAll('[data-otsl], [data-ottp]').forEach(el => el.addEventListener('input', () => {
      const k = el.getAttribute('data-otsl') || el.getAttribute('data-ottp');
      this.recalc(host, k);
    }));
    host.querySelectorAll('[data-otbe]').forEach(el => el.addEventListener('click', () => {
      const { bot, id } = this.split(el.dataset.otbe);
      Bots.breakEven(bot, id);
    }));
    host.querySelectorAll('[data-ottrail]').forEach(el => el.addEventListener('click', () => {
      const k = el.dataset.ottrail, { bot, id } = this.split(k);
      const s = parseFloat((host.querySelector('[data-otts="' + k + '"]') || {}).value);
      const g = parseFloat((host.querySelector('[data-ottg="' + k + '"]') || {}).value);
      if (!(s > 0) || !(g > 0)) return toast('Both trail figures have to be above zero', 'warn');
      Bots.editPos(bot, id, { trail: { start: s, gap: g } });
    }));
    host.querySelectorAll('[data-ottrailoff]').forEach(el => el.addEventListener('click', () => {
      const { bot, id } = this.split(el.dataset.ottrailoff);
      Bots.editPos(bot, id, { trail: null });
    }));
    host.querySelectorAll('[data-otpart]').forEach(el => el.addEventListener('click', () => {
      const raw = el.dataset.otpart;
      const cut = raw.lastIndexOf(':');
      const { bot, id } = this.split(raw.slice(0, cut));
      Bots.partialClose(bot, id, parseFloat(raw.slice(cut + 1)));
    }));
    /* two presses to close: the first turns the button into a confirmation
       for six seconds, so a slip of the hand never closes a trade */
    host.querySelectorAll('[data-otclose]').forEach(el => el.addEventListener('click', () => {
      const { bot, id } = this.split(el.dataset.otclose);
      if (el.dataset.armed === '1'){
        el.dataset.armed = ''; clearTimeout(el._disarm);
        Bots.closePos(bot, id, 'Open Trades');
        return;
      }
      el.dataset.armed = '1';
      el.dataset.wasText = el.textContent;
      el.textContent = 'Press again to close now · ' + el.textContent.split('·').pop().trim();
      el.classList.add('armed');
      const cancel = document.createElement('button');
      cancel.className = 'bMini'; cancel.textContent = 'Keep it open'; cancel.dataset.otkeep = '1';
      el.after(cancel);
      const disarm = () => { el.dataset.armed = ''; el.classList.remove('armed'); cancel.remove(); this.refresh(); };
      cancel.addEventListener('click', e => { e.stopPropagation(); clearTimeout(el._disarm); disarm(); });
      el._disarm = setTimeout(disarm, 6000);
    }));
    this.start();
  },
};
