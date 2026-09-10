/* ASTRA Terminal — the Live Trading page.

   Four numbered steps, in order, each one refusing to go forward until the one
   before it is genuinely done. The kill switch is on screen the whole time.
   Live results shown here come from MetaTrader's own record, not from ASTRA. */
Object.assign(Bots, {

  liveView(){
    const S = Live.load();
    const st = Live.status();
    const B = Live.bridge;
    const stats = Live.stats();
    const armed = Live.armedList();

    return `<div class="lvWrap">
      <div class="wsTradeLinks"><button data-ws-bot="liveManual">Open LIVE trading bot · manual orders</button></div>
      ${this.lvBanner(st, B, armed)}
      ${this.lvStep1(S, B)}
      ${this.lvStep2(S)}
      ${this.lvStep3(S)}
      ${armed.length ? this.lvArmed(S) : ''}
      ${this.lvAccount(stats, B)}
      ${this.lvAudit(S)}
      <div class="botNote warn">Live results here are read back from MetaTrader itself. Paper and live are kept
        completely apart — nothing on this page touches the paper ledgers, and nothing there affects this.</div>
    </div>`;
  },

  lvBanner(st, B, armed){
    return `<div class="lvBanner ${st.cls}">
      <div class="lvbLeft">
        <b>${esc(st.label)}</b>
        <span>${esc(st.text)}</span>
        ${B.account ? `<i>account ${esc(String(B.account))} · ${esc(B.server)} · balance ${fmtNum(B.balance)} ${esc(B.currency)}</i>` : ''}
      </div>
      <div class="lvbRight">
        <button class="bBtn" data-act="lvrefresh">Refresh</button>
        <button class="bBtn kill" data-act="lvkill" ${armed.length ? '' : 'disabled'}>STOP EVERYTHING</button>
      </div>
    </div>`;
  },

  /* ---- step 1: the bridge ---- */
  lvStep1(S, B){
    const done = S.linked && B.trading;
    return `<div class="lvStep ${done ? 'done' : ''}">
      <div class="lvHead"><i>1</i> Connect to the account
        ${done ? '<b class="ok">connected</b>' : ''}</div>
      ${B.trading
        ? (S.linked
            ? `<div class="lvBody"><p>The live bridge is running and this terminal is linked to it.</p>
                 <button class="bMini" data-act="lvunlink">Forget the code</button></div>`
            : `<div class="lvBody">
                 <p>The live bridge is running. Read the <b>six-digit session code</b> printed in its window and type it here.</p>
                 <div class="lvRow"><input id="lvCode" type="text" inputmode="numeric" maxlength="6"
                   placeholder="000000" autocomplete="off" spellcheck="false">
                   <button class="bBtn go" data-act="lvlink">Link</button></div>
               </div>`)
        : `<div class="lvBody">
             <p>ASTRA cannot place an order right now, and that is the normal state.</p>
             <ol class="lvSteps">
               <li>Close the ordinary bridge window if it is open.</li>
               <li>Double-click <b>START-LIVE-TRADING.bat</b> in the ASTRA folder.</li>
               <li>Type <b>LIVE</b> when it asks, and leave that window open.</li>
               <li>Come back here and enter the six digits it prints.</li>
             </ol>
             <p class="dim2">Closing that window stops live trading instantly, whatever is armed.</p>
           </div>`}
    </div>`;
  },

  /* ---- step 2: the limits ---- */
  lvStep2(S){
    const C = S.caps;
    const uni = this.universe();
    const chips = uni.slice(0, 16).map(sym =>
      `<button class="insChip${C.instruments.includes(sym) ? ' on' : ''}" data-lvins="${esc(sym)}">${esc(baseAsset(sym))}</button>`).join('');
    const num = (k, label, step, hint) =>
      `<label class="lvField"><span>${esc(label)}</span>
         <input type="number" data-lvcap="${k}" value="${C[k]}" step="${step || 'any'}" min="0">
         ${hint ? `<i>${esc(hint)}</i>` : ''}</label>`;
    return `<div class="lvStep ${C.instruments.length ? 'done' : ''}">
      <div class="lvHead"><i>2</i> The limits it may never cross
        ${C.instruments.length ? '<b class="ok">' + C.instruments.length + ' instrument' + (C.instruments.length > 1 ? 's' : '') + '</b>' : ''}</div>
      <div class="lvBody">
        <div class="lvGrid">
          ${num('riskPct', 'Risk per trade (%)', 0.1, 'of the live balance')}
          ${num('maxLots', 'Biggest order (lots)', 0.01, 'a hard ceiling')}
          ${num('maxOpen', 'Live positions at once', 1)}
          ${num('maxDailyLossPct', 'Stop for the day at (%)', 0.5)}
          ${num('maxTotalLossPct', 'Disarm everything at (%)', 1, 'total loss')}
          <label class="lvField"><span>Trading hours</span>
            <span class="lvHours">
              <input type="time" data-lvcap="sessionFrom" value="${esc(C.sessionFrom)}">
              <input type="time" data-lvcap="sessionTo" value="${esc(C.sessionTo)}">
            </span></label>
        </div>
        <div class="lvIns"><span>Instruments it may trade — nothing is allowed until you choose:</span>
          <div class="insBar">${chips}</div></div>
        <button class="bBtn" data-act="lvsavecaps">Save limits</button>
      </div>
    </div>`;
  },

  /* ---- step 3: arming a bot ---- */
  lvStep3(S){
    /* Ranked by the same measure the Performance Report uses — average R weighted
       by how much evidence there is, so a lucky three-trade run cannot outrank a
       hundred-trade one. Best first, and the best eligible one is pre-selected.
       Choosing is still yours: nothing arms itself. */
    const rows = (typeof BotReports !== 'undefined') ? BotReports.rows() : [];
    const candidates = BOTS
      .filter(b => !Bots.isPage(b) && !b.manual)
      .map(b => ({ b, row: rows.find(r => r.id === b.id) || null, ready: Live.readiness(b.id) }))
      .sort((x, y) => ((y.row && y.row.rank) || -9) - ((x.row && x.row.rank) || -9));

    const eligible = candidates.filter(c => c.ready.ok).length;
    let preselected = false;
    const opts = candidates.map(c => {
      const r = c.row;
      const rec = r && r.trades
        ? r.trades + ' trades · ' + Math.round(r.winRate) + '% · ' +
          (r.pnl >= 0 ? '+' : '') + fmtNum(r.pnl) + ' · PF ' + (r.pf === Infinity ? '∞' : (r.pf || 0).toFixed(2))
        : 'no trades yet';
      const sel = (!preselected && c.ready.ok) ? (preselected = true, ' selected') : '';
      return `<option value="${esc(c.b.id)}"${c.ready.ok ? '' : ' disabled'}${sel}>` +
        `${esc(c.b.name)} — ${rec} — ${c.ready.met}/${c.ready.of} conditions${c.ready.ok ? '' : ' (not eligible)'}</option>`;
    }).join('');

    const best = candidates.find(c => c.row && c.row.trades);
    const bestLine = best ? `<div class="lvBest">
        <span>BEST PAPER RECORD RIGHT NOW</span>
        <b>${esc(best.b.name)}</b>
        <i>${best.row.trades} trades · ${Math.round(best.row.winRate)}% won ·
          ${(best.row.pnl >= 0 ? '+' : '') + fmtNum(best.row.pnl)} ·
          profit factor ${best.row.pf === Infinity ? '∞' : (best.row.pf || 0).toFixed(2)} ·
          ${best.ready.met} of ${best.ready.of} live conditions</i>
        <u>The list below is ordered by this measure. Being top of it is not a reason to trade it —
          it only means it has the strongest record so far on paper.</u>
      </div>` : '';

    return `<div class="lvStep">
      <div class="lvHead"><i>3</i> Arm an automated bot</div>
      <div class="lvBody">
        <p>A bot must meet at least four of the six live-readiness conditions before it can be armed —
          the same conditions on the Performance Report. <b>${eligible}</b> of ${candidates.length} qualify today.</p>
        ${bestLine}
        ${eligible ? `
          <div class="lvRow">
            <select class="tsel" id="lvBot">${opts}</select>
          </div>
          <div class="lvAck">
            <label><input type="checkbox" class="lvAckBox"> I understand a backtest and paper record do not predict future results.</label>
            <label><input type="checkbox" class="lvAckBox"> I understand real fills, spreads, gaps and slippage will differ from the simulation.</label>
            <label><input type="checkbox" class="lvAckBox"> I understand I can lose money, and that these limits reduce that risk but do not remove it.</label>
          </div>
          <div class="lvRow">
            <input id="lvConfirm" type="text" placeholder="type the bot's name exactly" spellcheck="false" autocomplete="off">
            <button class="bBtn go" data-act="lvarm">Arm in shadow</button>
          </div>
          <p class="dim2">Arming puts the bot in <b>shadow</b>: it works out every order in full and writes it down,
            but sends nothing. Switching it to live is a separate decision, below.</p>`
          : '<p class="dim2">No bot qualifies yet. Run them on paper until one meets four of the six conditions.</p>'}
      </div>
    </div>`;
  },

  /* ---- the armed bots ---- */
  lvArmed(S){
    const rows = Live.armedList().map(id => {
      const b = BOT_BY_ID[id] || { name: id };
      const a = S.armed[id];
      const live = a.mode === 'live';
      return `<div class="lvBot ${live ? 'live' : 'shadow'}">
        <div class="lvBotTop">
          <b>${esc(b.name)}</b>
          <span class="lvMode ${live ? 'live' : ''}">${live ? 'LIVE' : 'SHADOW'}</span>
        </div>
        <div class="lvBotMeta">armed ${this.when(a.at)}${a.liveAt ? ' · live since ' + this.when(a.liveAt) : ''}</div>
        <div class="lvBotBtns">
          ${live
            ? `<button class="bMini" data-lvshadow="${esc(id)}">Back to shadow</button>`
            : `<input class="lvGoInput" data-lvgoinput="${esc(id)}" type="text" placeholder="TRADE REAL MONEY" spellcheck="false">
               <button class="bMini danger" data-lvgo="${esc(id)}">Go live</button>`}
          <button class="bMini" data-lvdisarm="${esc(id)}">Disarm</button>
        </div>
      </div>`;
    }).join('');
    return `<div class="botH">ARMED BOTS</div><div class="lvBots">${rows}</div>`;
  },

  /* ---- the real account ---- */
  lvAccount(s, B){
    const open = Bots.sortRows('lvOpen', Live.book.open || [], 'time', (r, k) =>
      k === 'symbol' ? baseAsset(r.symbol) : r[k]);
    const closed = Bots.sortRows('lvClosed', Live.book.closed || [], 'time', (r, k) =>
      k === 'symbol' ? baseAsset(r.symbol) : r[k]).slice(0, 40);
    const openRows = open.length ? open.map(p => `<tr>
        <td class="c-sym">${esc(baseAsset(p.symbol))}</td>
        <td class="${p.type === 'buy' ? 'up' : 'down'}">${p.type.toUpperCase()}</td>
        <td class="num">${p.volume}</td>
        <td class="num">${fmtPrice(p.price_open)}</td>
        <td class="num">${fmtPrice(p.price_current)}</td>
        <td class="num">${fmtPrice(p.sl)}</td>
        <td class="num">${fmtPrice(p.tp)}</td>
        <td class="num ${pctClass(p.profit)}">${(p.profit >= 0 ? '+' : '') + fmtNum(p.profit)}</td>
        <td class="num">${this.lvWorth(p)}</td>
        <td class="num">${new Date(p.time * 1000).toLocaleString()}</td>
        <td><button class="bMini danger" data-lvclose="${p.ticket}">Close at market</button></td></tr>`).join('')
      : '<tr><td colspan="11" class="empty">No live position open</td></tr>';

    const closedRows = closed.length ? closed.map(t => `<tr>
        <td class="c-sym">${esc(baseAsset(t.symbol))}</td>
        <td class="num">${t.volume}</td>
        <td class="num">${fmtPrice(t.price)}</td>
        <td class="num ${pctClass(t.profit)}">${(t.profit >= 0 ? '+' : '') + fmtNum(t.profit)}</td>
        <td class="num">${fmtNum(t.commission)}</td>
        <td class="num">${fmtNum(t.swap)}</td>
        <td class="num ${pctClass(t.net)}">${(t.net >= 0 ? '+' : '') + fmtNum(t.net)}</td>
        <td class="num">${new Date(t.time).toLocaleString()}</td>
        <td class="dim2">${esc(t.bot || '')}</td></tr>`).join('')
      : '<tr><td colspan="9" class="empty">No live trade has closed yet</td></tr>';

    return `<div class="botH">THE REAL ACCOUNT
        <span class="dim2">${s.syncedAt ? 'read from MetaTrader ' + this.when(s.syncedAt) : 'not read yet'}</span></div>
      <div class="botStats">
        ${this.stat('LIVE TRADES', s.trades)}
        ${this.stat('WON / LOST', s.won + ' / ' + s.lost)}
        ${this.stat('WIN RATE', s.trades ? Math.round(s.winRate) + '%' : '—')}
        ${this.stat('NET', (s.net >= 0 ? '+' : '') + fmtNum(s.net), s.net)}
        ${this.stat('PROFIT FACTOR', s.pf === Infinity ? '∞' : s.pf.toFixed(2))}
        ${this.stat('COSTS', fmtNum(s.fees), -1)}
        ${this.stat('TODAY', (s.today >= 0 ? '+' : '') + fmtNum(s.today), s.today)}
        ${this.stat('OPEN NOW', s.open + (s.open ? ' · ' + (s.openPnl >= 0 ? '+' : '') + fmtNum(s.openPnl) : ''), s.openPnl)}
      </div>
      <div class="dashScroll short"><table class="dashTable">
        <thead>${Bots.sortHead('lvOpen', [
          ['symbol', 'Instrument', 0], ['type', 'Side', 0], ['volume', 'Lots', 1],
          ['price_open', 'Entry', 1], ['price_current', 'Now', 1], ['sl', 'Stop', 1],
          ['tp', 'Target', 1], ['profit', 'P&L', 1], [null, 'Stop / target worth', 1],
          ['time', 'Opened', 1], [null, '', 0],
        ], 'time')}</thead><tbody>${openRows}</tbody></table></div>
      <div class="botH">CLOSED — FROM METATRADER'S OWN HISTORY</div>
      <div class="dashScroll short"><table class="dashTable">
        <thead>${Bots.sortHead('lvClosed', [
          ['symbol', 'Instrument', 0], ['volume', 'Lots', 1], ['price', 'Exit', 1],
          ['profit', 'Gross', 1], ['commission', 'Commission', 1], ['swap', 'Swap', 1],
          ['net', 'Net', 1], ['time', 'Closed', 1], ['bot', 'Bot', 0],
        ], 'time')}</thead><tbody>${closedRows}</tbody></table></div>`;
  },

  /* What the stop and the target on a REAL position are worth, worked out from
     MetaTrader's own numbers: profit / (current − entry) gives the money per
     unit of price on this contract, which then prices any level. No contract
     specification needed, and it cannot disagree with the broker. */
  lvWorth(p){
    const move = (p.price_current - p.price_open);
    if (!move || !p.profit) return '—';
    const perPoint = p.profit / move;
    const at = lvl => (lvl > 0) ? (lvl - p.price_open) * perPoint : null;
    const sl = at(p.sl), tp = at(p.tp);
    const one = (v, cls) => v == null ? '—'
      : `<b class="${cls}">${(v >= 0 ? '+' : '') + fmtNum(v)}</b>`;
    return one(sl, sl >= 0 ? 'up' : 'down') + ' / ' + one(tp, 'up');
  },

  lvAudit(S){
    const rows = (S.audit || []).slice(0, 25).map(a =>
      `<div class="botLog ${esc(a.kind)}"><span class="dim2">${new Date(a.t).toLocaleString()}</span> ${esc(a.text)}</div>`).join('')
      || '<div class="empty">Nothing yet</div>';
    return `<div class="botH">EVERYTHING THAT HAPPENED</div>${rows}
      <div class="botNote">The bridge keeps its own copy of every order attempt in
        <b>astra-data\\live-orders.log</b>, outside ASTRA, so the two records can be compared.</div>`;
  },

  /* ---- events ---- */
  bindLive(host){
    const act = a => host.parentElement.querySelector('[data-act="' + a + '"]');

    host.querySelectorAll('[data-lvins]').forEach(el => el.addEventListener('click', () => {
      const S = Live.load();
      const sym = el.dataset.lvins;
      const list = S.caps.instruments.slice();
      const i = list.indexOf(sym);
      if (i >= 0) list.splice(i, 1); else list.push(sym);
      S.caps.instruments = list;
      Live.save();
      this.render();
    }));

    host.querySelectorAll('[data-lvgo]').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.lvgo;
      const inp = host.querySelector('[data-lvgoinput="' + id + '"]');
      const r = Live.goLive(id, inp ? inp.value : '');
      toast(r.ok ? BOT_BY_ID[id].name + ' is now LIVE — real orders can be placed' : r.why, r.ok ? 'warn' : 'warn');
      this.render();
    }));
    host.querySelectorAll('[data-lvshadow]').forEach(el => el.addEventListener('click', () => {
      Live.toShadow(el.dataset.lvshadow); toast('Back in shadow — nothing will be sent', 'ok'); this.render();
    }));
    host.querySelectorAll('[data-lvdisarm]').forEach(el => el.addEventListener('click', () => {
      const id = el.dataset.lvdisarm;
      if (!confirm('Disarm ' + (BOT_BY_ID[id] || {}).name + '?')) return;
      Live.disarm(id, 'by hand'); this.render();
    }));
    host.querySelectorAll('[data-lvclose]').forEach(el => el.addEventListener('click', async () => {
      const ticket = +el.dataset.lvclose;
      if (!confirm('Close live position ' + ticket + ' at the market?')) return;
      try {
        const r = await fetch(Live.BRIDGE + '/close', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ code: Live.state.code, ticket }),
        });
        const j = await r.json();
        Live.audit(j.ok ? 'close' : 'close-failed', 'Close ' + ticket + ' — ' + (j.ok ? 'done' : (j.message || j.error)));
        toast(j.ok ? 'Position closed' : 'Could not close: ' + (j.message || j.error), j.ok ? 'ok' : 'warn');
        await Live.sync();
      } catch(e){ toast('Could not reach the bridge', 'warn'); }
      this.render();
    }));
  },

  async liveAction(a){
    if (a === 'lvrefresh'){
      await Live.probe(); await Live.sync();
      toast(Live.bridge.trading ? 'Live bridge answering' : 'The live bridge is not running', Live.bridge.trading ? 'ok' : 'info');
      return this.render();
    }
    if (a === 'lvkill'){
      if (!confirm('Stop live trading and disarm every bot?\n\nOpen positions are NOT closed — close those yourself, or from the table below.')) return;
      Live.kill('stopped by the operator');
      return this.render();
    }
    if (a === 'lvlink'){
      const el = document.getElementById('lvCode');
      const r = await Live.link(el ? el.value : '');
      toast(r.ok ? 'Linked to the live account' : r.why, r.ok ? 'ok' : 'warn');
      return this.render();
    }
    if (a === 'lvunlink'){ Live.unlink(); return this.render(); }
    if (a === 'lvsavecaps'){
      const S = Live.load();
      document.querySelectorAll('[data-lvcap]').forEach(el => {
        const k = el.dataset.lvcap;
        S.caps[k] = el.type === 'number' ? (parseFloat(el.value) || 0) : el.value;
      });
      Live.save();
      Live.audit('caps', 'Limits changed', S.caps);
      toast('Limits saved', 'ok');
      return this.render();
    }
    if (a === 'lvarm'){
      const boxes = [...document.querySelectorAll('.lvAckBox')];
      if (!boxes.length || !boxes.every(b => b.checked))
        return toast('Tick all three acknowledgements first', 'warn');
      const id = (document.getElementById('lvBot') || {}).value;
      const typed = (document.getElementById('lvConfirm') || {}).value;
      const r = Live.arm(id, Live.state.caps, typed);
      toast(r.ok ? BOT_BY_ID[id].name + ' armed in shadow' : r.why, r.ok ? 'ok' : 'warn');
      return this.render();
    }
  },
});
