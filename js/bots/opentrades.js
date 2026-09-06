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
    const unreal = (px - p.entry) * p.dir * p.qty - p.fees;
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
      cashToStop: toStop * p.qty,
      cashToTp: toTp == null ? null : toTp * p.qty,
      held: BotDash.held(p.entryTime, Date.now()),
      value: Math.abs(p.qty * p.entry),
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

    const atStop = (sl > 0) ? Bots.moneyAt(p.entry, p.dir, p.qty, sl) - p.fees : null;
    const atTp = (tp > 0) ? Bots.moneyAt(p.entry, p.dir, p.qty, tp) - p.fees : null;
    const fromHere = (sl > 0) ? (sl - l.px) * p.dir * p.qty : null;

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
  view(){
    const rows = this.all();
    const tot = rows.reduce((a, r) => {
      const l = this.live(r);
      a.unreal += l.unreal; a.value += l.value;
      /* what the open stops would cost if every one were hit from here.
         toStop is positive while price is still on the right side of the
         stop, so THAT is the exposure — negating it read almost every
         healthy position as risking nothing. */
      a.risk += Math.max(0, l.toStop) * r.p.qty;
      if (l.unreal >= 0) a.up++; else a.down++;
      return a;
    }, { unreal: 0, value: 0, risk: 0, up: 0, down: 0 });

    if (!rows.length) return `<div class="botStats">
        ${Bots.stat('OPEN NOW', 0)}
      </div>
      <div class="empty">Nothing is open. When any bot takes a position it appears here immediately,
        with every control you need to manage it.</div>`;

    const sorted = rows.slice().sort((a, b) => {
      if (this.sortKey === 'unreal') return this.live(b).unreal - this.live(a).unreal;
      if (this.sortKey === 'sym') return a.p.sym.localeCompare(b.p.sym);
      if (this.sortKey === 'bot') return a.botName.localeCompare(b.botName);
      return b.p.entryTime - a.p.entryTime;
    });

    const sortBtn = (k, label) =>
      `<button class="bMini${this.sortKey === k ? ' on' : ''}" data-otsort="${k}">${esc(label)}</button>`;

    return `<div class="botStats">
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
      <div class="otList">${sorted.map(r => this.card(r)).join('')}</div>
      <div class="botNote">Adjusting a bot's trade is allowed — it is your money. The trade is marked
        <b>adjusted</b> and stays marked when it closes, so a bot's record never quietly counts a trade
        the strategy did not run on its own. The original risk is never rewritten, so its R still measures
        what was staked when it opened.</div>`;
  },

  card(row){
    const p = row.p, l = this.live(row);
    const k = row.bot + ':' + p.id;
    const trail = p.trail !== undefined ? p.trail : (Bots.cfg(row.bot) || {}).trail;
    const trailOn = !!trail;
    return `<div class="otCard ${l.unreal >= 0 ? 'up' : 'down'}" data-ot="${esc(k)}">

      <div class="otHead">
        <b class="${p.dir > 0 ? 'up' : 'down'}">${p.dir > 0 ? 'BUY' : 'SELL'} ${esc(baseAsset(p.sym))}</b>
        <span class="otTag">${esc(row.botName)}</span>
        <span class="otTag dim">${esc(p.tf || '')}${p.model ? ' · ' + esc(p.model) : ''}</span>
        ${p.touched ? '<span class="otTag warn" title="stop, target or size was changed by hand">adjusted</span>' : ''}
        ${trailOn ? '<span class="otTag on">trailing</span>' : ''}
        ${l.stale ? '<span class="otTag warn" title="no fresh quote for this instrument">no quote</span>' : ''}
        <span class="otPnl ${pctClass(l.unreal)}" data-f="unreal">${(l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal)}</span>
      </div>

      <div class="otFacts">
        <span><label>Size</label><b>${p.lots ? p.lots + ' lot' : +p.qty.toPrecision(4)}</b></span>
        <span><label>Entry</label><b>${fmtPrice(p.entry)}</b></span>
        <span><label>Now</label><b data-f="px">${fmtPrice(l.px)}</b></span>
        <span><label>R so far</label><b class="${pctClass(l.rNow)}" data-f="r">${l.rNow.toFixed(2)}</b></span>
        <span><label>To stop</label><b data-f="tostop">${this.gap(l.pctToStop, l.cashToStop)}</b></span>
        <span><label>To target</label><b data-f="totp">${l.toTp == null ? 'none' : this.gap(l.pctToTp, l.cashToTp)}</b></span>
        <span><label>Best / worst</label><b data-f="mfe">+${fmtNum(p.mfe || 0)} / -${fmtNum(p.mae || 0)}</b></span>
        <span><label>Held</label><b data-f="held">${l.held}</b></span>
      </div>

      <div class="otCtl">
        <label class="otIn">Stop<input type="number" step="any" data-otsl="${esc(k)}" value="${p.sl}"></label>
        <span class="pctRow">${Bots.PCT_STEPS.map(pc =>
          `<button class="pctBtn" data-otpct="${esc(k)}:sl:${pc}" title="put the stop ${pc}% from the price now">${pc}%</button>`).join('')}</span>
      </div>
      <div class="otCtl">
        <label class="otIn">Target<input type="number" step="any" data-ottp="${esc(k)}" value="${p.tp == null ? '' : p.tp}" placeholder="none"></label>
        <span class="pctRow">${Bots.PCT_STEPS.map(pc =>
          `<button class="pctBtn" data-otpct="${esc(k)}:tp:${pc}" title="put the target ${pc}% from the price now">${pc}%</button>`).join('')}</span>
      </div>
      <div class="otCalc" data-otcalc="${esc(k)}">${this.calcLine(row)}</div>
      <div class="otCtl">
        <button class="bMini go" data-otset="${esc(k)}">Apply levels</button>
        <button class="bMini" data-otbe="${esc(k)}" title="move the stop to the entry price">Break even</button>
      </div>

      <div class="otCtl">
        <label class="otIn">Trail starts at<input type="number" step="0.1" min="0.1" data-otts="${esc(k)}"
          value="${trailOn && trail.start != null ? trail.start : 1}"><i>R</i></label>
        <label class="otIn">and holds<input type="number" step="0.1" min="0.1" data-ottg="${esc(k)}"
          value="${trailOn && trail.gap != null ? trail.gap : 0.5}"><i>R back</i></label>
        <button class="bMini${trailOn ? ' on' : ''}" data-ottrail="${esc(k)}">${trailOn ? 'Update trail' : 'Start trailing'}</button>
        ${trailOn ? `<button class="bMini" data-ottrailoff="${esc(k)}">Stop trailing</button>` : ''}
      </div>

      <div class="otCtl">
        <button class="bMini" data-otpart="${esc(k)}:0.25">Take 25% off</button>
        <button class="bMini" data-otpart="${esc(k)}:0.5">Take half off</button>
        <button class="bMini danger" data-otclose="${esc(k)}" data-f="closebtn">Close at market · ${(l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal)}</button>
        <span class="otWhy">${esc((p.reasons || []).slice(0, 1).join('') || p.note || '')}</span>
      </div>

      ${p.edits && p.edits.length ? `<div class="otEdits">${
        p.edits.slice(-4).map(e => `<i>${esc(BotDash.clock(e.at))} — ${esc(e.what)}</i>`).join('')}</div>` : ''}
    </div>`;
  },

  /* ---------- the live half, rewritten in place ----------
     Only the figures inside [data-f] are touched, so a number being typed into
     a stop box is never yanked away mid-edit. */
  refresh(){
    const host = document.getElementById('botBody');
    if (!host || Bots.active !== 'open') return this.stop();
    const rows = this.all();
    if (!rows.length) return;
    const byKey = {};
    for (const r of rows) byKey[r.bot + ':' + r.p.id] = r;

    let anyGone = false;
    host.querySelectorAll('[data-ot]').forEach(card => {
      const row = byKey[card.dataset.ot];
      if (!row){ anyGone = true; return; }          // it closed while we were looking
      const l = this.live(row), p = row.p;
      const set = (f, text, cls) => {
        const el = card.querySelector('[data-f="' + f + '"]');
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
      const cb = card.querySelector('[data-f="closebtn"]');
      if (cb) cb.textContent = 'Close at market · ' + (l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal);
      card.className = 'otCard ' + (l.unreal >= 0 ? 'up' : 'down');
    });
    /* a position closing changes the whole board, so that does need a redraw */
    if (anyGone || host.querySelectorAll('[data-ot]').length !== rows.length) Bots.render();
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

  bind(host){
    host.querySelectorAll('[data-otsort]').forEach(el => el.addEventListener('click', () => {
      this.sortKey = el.dataset.otsort;
      Bots.render();
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
    host.querySelectorAll('[data-otclose]').forEach(el => el.addEventListener('click', () => {
      const { bot, id } = this.split(el.dataset.otclose);
      Bots.closePos(bot, id);
    }));
    this.start();
  },
};
