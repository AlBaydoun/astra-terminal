/* ASTRA · new look — more for trading from the chart.

     TOP ROW    BUY and SELL are back on the top bar, each with the price it would trade at, and a switch
                beside them: Paper or Live.
                  Paper  opens the Manual Trading Bot's own ticket in the side panel, set to this market,
                         this side and a market order. In its Fast layout only what a market order needs
                         is shown, with the ticket's own "BUY at market" button first: one more press, on
                         that button, places the paper trade. Nothing here places it for you.
                  Live   opens Classic's LIVE trading bot on this market and side. Every one of its
                         checks stays in the way of a real order (bridge, session code, arming, the typed
                         phrase, calculate, confirm). Nothing is sent from the top bar.
     NOTES      a trade can be written about at any time: while it runs, and after it has ended. The notes
                are a small journal kept with the trade (in this browser), each with its time. They show
                on the trade's card, in the ended-trades list, and in the Autopsy room beside the note
                written at entry.
     FILTER     two lists over the cards: the bot that opened a trade, and the signal within that bot. They
                narrow the open trades and the ended ones alike. The signal is the one the bot recorded when
                it opened the trade; a trade that recorded none reads "Not recorded".
     ENDED      the Trade tab has an Ended button: the closed trades (paper or real, as the switch says),
                for today, the last day, week or month, everything, or between two dates. A row opens to
                its facts and notes; Review opens it in the Autopsy room.

   This file opens pages, fills the ticket's side and market, and keeps notes. It has no call that places,
   changes or closes an order, arms anything or changes a limit. */
'use strict';
const TradePlus = window.TradePlus = {
  $(id){ return document.getElementById(id); },
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  on(){ return document.documentElement.dataset.face === 'tm'; },
  ls(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : v; } catch(e){ return d; } },
  put(k, v){ try { localStorage.setItem(k, v); } catch(e){} },
  base(s){ return String(s || '').replace(/\.(s|m|std)$/i, '').toUpperCase(); },
  money(v){ if (!Number.isFinite(v)) return '–'; const a = Math.abs(v), t = typeof fmtNum === 'function' ? fmtNum(a) : a.toFixed(2); return (v > 0 ? '+' : v < 0 ? '−' : '') + t; },
  px(v){ return !Number.isFinite(v) ? '–' : typeof fmtPrice === 'function' ? fmtPrice(v) : String(v); },
  when(t){ return t ? new Date(t).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '–'; },
  dur(ms){ const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + ' min' : m < 1440 ? Math.floor(m / 60) + ' h ' + (m % 60) + ' min' : Math.floor(m / 1440) + ' d ' + Math.floor(m % 1440 / 60) + ' h'; },

  /* ================= notes: a journal kept with each trade ================= */
  NKEY: 'astra_trade_journal', draft: {},
  db(){ if (this._db) return this._db; try { this._db = JSON.parse(localStorage.getItem(this.NKEY) || '{}') || {}; } catch(e){ this._db = {}; } return this._db; },
  notes(key){ const l = this.db()[key]; return Array.isArray(l) ? l : []; },
  addNote(key, text, ended){ text = String(text || '').trim().slice(0, 600); if (!key || !text) return false; const d = this.db(); (d[key] = this.notes(key)).push({ t: Date.now(), x: text, e: ended ? 1 : 0 }); this.put(this.NKEY, JSON.stringify(d)); return true; },
  delNote(key, t){ const d = this.db(), l = this.notes(key).filter(n => String(n.t) !== String(t)); if (l.length) d[key] = l; else delete d[key]; this.put(this.NKEY, JSON.stringify(d)); },
  /* one name for a trade, open or ended: paper = its bot, its number and its entry time; real = MetaTrader's position number */
  keyOpen(bot, p){ return 'p:' + bot + ':' + p.id + '@' + p.entryTime; },
  keyOf(t){ if (!t) return ''; if (t.key) return t.key; return t.src === 'paper' ? 'p:' + t.bot + ':' + (t.orig && t.orig.id != null ? t.orig.id : String(t.id).split(':').pop()) + '@' + t.t0 : String(t.id); },
  box(key, ended){ const L = this.notes(key), d = this.draft[key] || '';
    return '<div class="tnBox" data-tnk="' + this.esc(key) + '"' + (ended ? ' data-tne="1"' : '') + '>' +
      (L.length ? '<div class="tnList">' + L.map(n => '<p' + (n.e ? ' class="late"' : '') + '><time>' + this.when(n.t) + (n.e ? ' · written after it ended' : '') + '</time><span>' + this.esc(n.x) + '</span><button type="button" data-tn="del:' + n.t + '" title="Remove this note">×</button></p>').join('') + '</div>' : '') +
      '<form class="tnAdd" autocomplete="off"><input type="text" maxlength="600" aria-label="A note on this trade" placeholder="' + (L.length ? 'Add another note…' : 'Write a note on this trade…') + '" value="' + this.esc(d) + '"><button type="submit" title="Keep this note with the trade">Save</button></form></div>'; },
  redraw(box){ const key = box.dataset.tnk, ended = box.dataset.tne === '1', t = document.createElement('div'); t.innerHTML = this.box(key, ended); const n = t.firstChild; box.replaceWith(n); const card = n.closest('.otCard, .ldPos'); if (card) card.classList.toggle('tnHas', this.notes(key).length > 0); return n; },
  notesInit(){ if (this._nOn) return; this._nOn = true;
    window.addEventListener('storage', e => { if (e.key === this.NKEY) this._db = null; });
    document.addEventListener('submit', e => { const f = e.target.closest && e.target.closest('.tnAdd'); if (!f) return; e.preventDefault(); e.stopPropagation(); const box = f.closest('.tnBox'), inp = f.querySelector('input'); if (!box || !inp) return;
      if (this.addNote(box.dataset.tnk, inp.value, box.dataset.tne === '1')){ delete this.draft[box.dataset.tnk]; const n = this.redraw(box), i = n.querySelector('input'); if (i) i.focus({ preventScroll: true }); this._eSig = ''; } }, true);
    document.addEventListener('input', e => { const i = e.target; if (i && i.matches && i.matches('.tnAdd input')){ const box = i.closest('.tnBox'); if (box) this.draft[box.dataset.tnk] = i.value; } }, true);
    document.addEventListener('click', e => { const o = e.target.closest && e.target.closest('[data-tnopen]'); if (!o) return; e.preventDefault(); e.stopPropagation(); const card = o.closest('.otCard, .ldPos'), k = o.dataset.tnopen; if (!card) return;
      const on = !card.classList.contains('tnOpen'); if (on) this.noteOpen.add(k); else this.noteOpen.delete(k); card.classList.toggle('tnOpen', on); if (on){ const i = card.querySelector('.tnAdd input'); if (i) i.focus({ preventScroll: true }); } }, true);
    document.addEventListener('click', e => { const b = e.target.closest && e.target.closest('[data-tn^="del:"]'); if (!b) return; e.preventDefault(); e.stopPropagation(); const box = b.closest('.tnBox'); if (!box) return;
      if (b.dataset.sure !== '1'){ b.dataset.sure = '1'; b.textContent = 'remove?'; b.classList.add('sure'); setTimeout(() => { if (b.isConnected){ b.dataset.sure = ''; b.textContent = '×'; b.classList.remove('sure'); } }, 3000); return; }
      this.delNote(box.dataset.tnk, b.dataset.tn.slice(4)); this.redraw(box); this._eSig = ''; }, true); },
  /* every open card in the Trade tab gets its journal. A closed card keeps its size: its newest note shows, and the pencil opens the box to write in */
  noteOpen: new Set(),
  cardBox(c, key){ c.insertAdjacentHTML('beforeend', '<button type="button" class="tnBtn" data-tnopen="' + this.esc(key) + '" title="Write a note on this trade"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/></svg></button>' + this.box(key)); c.classList.toggle('tnOpen', this.noteOpen.has(key)); c.classList.toggle('tnHas', this.notes(key).length > 0); },
  cardBoxes(){ const host = this.$('tsTradeCards');
    if (host && typeof OpenTrades !== 'undefined'){ let rows = null; host.querySelectorAll('.otCard').forEach(c => { if (c.querySelector(':scope > .tnBox')) return; try { rows = rows || new Map(OpenTrades.all().map(r => [r.bot + ':' + r.p.id, r])); } catch(e){ return; } const r = rows.get(c.dataset.ot); if (r) this.cardBox(c, this.keyOpen(r.bot, r.p)); }); }
    const lv = this.$('tsLiveCards'); if (lv) lv.querySelectorAll('.ldPos[data-ldpos]').forEach(c => { if (!c.querySelector(':scope > .tnBox')) this.cardBox(c, 'l:' + c.dataset.ldpos); }); },

  /* ================= ended trades, in the Trade tab ================= */
  ended: false, per: '7', from: '', to: '', eOpen: '', eMax: 40, _eSig: '',
  PER: [['today', 'Today'], ['1', '24 h'], ['7', '7 days'], ['30', '30 days'], ['all', 'All']],
  kind(){ return typeof SideTrade !== 'undefined' && SideTrade.kind === 'live' ? 'live' : 'paper'; },
  endedRows(){ const out = [], kind = this.kind();
    if (kind === 'paper'){ try { for (const b of BOTS){ if (Bots.isPage(b)) continue; const L = Bots.ledgers[b.id], nm = typeof TmSettings !== 'undefined' ? TmSettings.name(b) : b.name;
          for (const t of (L && L.closed) || []){ if (!t.exitTime || !t.entryTime) continue; out.push({ id: 'p:' + b.id + ':' + t.id, key: 'p:' + b.id + ':' + t.id + '@' + t.entryTime, src: 'paper', bot: b.id, botName: nm, sym: t.sym, tf: t.tf || '', dir: t.dir > 0 ? 1 : -1, entry: t.entry, exit: t.exit, sl: t.slInit || t.sl || null, tp: t.tp || null, t0: t.entryTime, t1: t.exitTime, pnl: +t.pnl || 0, r: Number.isFinite(t.r) ? t.r : null, reason: t.reason || '', touched: !!t.touched,
            note: typeof ChartPlus !== 'undefined' ? ChartPlus.noteOf(t) : '', sig: this.sigOf(t, b.id, nm) }); } } } catch(e){ console.warn('ended paper', e); } }
    else { try { for (const t of (typeof Autopsy !== 'undefined' && Autopsy.trades) || []) if (t.src === 'live') out.push(Object.assign({}, t, { key: String(t.id), note: '', sig: this.sigOf(t.orig, t.bot, t.botName) })); } catch(e){} }
    let since = 0, until = Infinity; if (this.from || this.to){ if (this.from) since = new Date(this.from + 'T00:00:00').getTime() || 0; if (this.to) until = (new Date(this.to + 'T00:00:00').getTime() || 0) + 86400000 || Infinity; }
    else if (this.per === 'today'){ const d = new Date(); d.setHours(0, 0, 0, 0); since = d.getTime(); } else if (this.per !== 'all') since = Date.now() - (+this.per) * 86400000;
    const here = this.base(typeof STORE !== 'undefined' ? STORE.symbol : ''), chart = typeof SideTrade !== 'undefined' && SideTrade.scope === 'chart';
    this._endAll = out; return out.filter(t => t.t1 >= since && t.t1 < until && (!chart || this.base(t.sym) === here) && this.match(t)).sort((a, b) => b.t1 - a.t1); },
  /* real trades come from MetaTrader's history (a GET), read again at most every five minutes */
  async liveHistory(force){ if (typeof Autopsy === 'undefined' || this._lhBusy) return; if (!force && Date.now() - (this._lhAt || 0) < 300000) return; this._lhBusy = true; this._lhAt = Date.now();
    try { Autopsy.live = null; await Autopsy.collect(); } catch(e){} finally { this._lhBusy = false; this._eSig = ''; this.paintEnded(); } },
  endedInit(){ const head = document.querySelector('#tab-tstrade .trCardsHead'), wrap = document.querySelector('#tab-tstrade .trWrap'); if (!head || !wrap || this.$('tpEndedBtn')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'tpEndedBtn'; b.dataset.tp = 'ended'; b.title = 'Show the trades that have ended, for the time you choose';
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/></svg>Ended';
    const title = head.querySelector('b'); title ? title.after(b) : head.prepend(b);
    const s = document.createElement('section'); s.id = 'tpEnded'; s.className = 'tpEnded'; s.hidden = true; wrap.appendChild(s);
    try { this.ended = this.ls('astra_trade_ended', '0') === '1'; this.per = this.ls('astra_trade_ended_per', '7'); } catch(e){}
    wrap.addEventListener('click', e => { const t = e.target.closest('[data-tp]'); if (t) this.tpClick(t, e); });
    wrap.addEventListener('change', e => { const i = e.target; if (i && i.dataset && i.dataset.tpd){ this[i.dataset.tpd] = i.value; this.eMax = 40; this._eSig = ''; this.paintEnded(true); } });
    /* Paper / Live and All / This chart are the Trade tab's own switches: the ended list follows them */
    wrap.addEventListener('click', e => { if (e.target.closest('[data-tr^="kind:"], [data-tr^="scope:"]')) setTimeout(() => { this._eSig = ''; this.eOpen = ''; this.paintEnded(true); }, 40); });
    this.paintEnded(true); },
  tpClick(t, e){ const k = t.dataset.tp;
    if (k === 'ended'){ this.ended = !this.ended; this.put('astra_trade_ended', this.ended ? '1' : '0'); this._eSig = ''; this.paintEnded(true); if (this.ended) setTimeout(() => { const s = this.$('tpEnded'); if (s) s.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }, 60); }
    else if (k.startsWith('per:')){ this.per = k.slice(4); this.from = this.to = ''; this.eMax = 40; this.put('astra_trade_ended_per', this.per); this._eSig = ''; this.paintEnded(true); }
    else if (k === 'emore'){ this.eMax += 60; this._eSig = ''; this.paintEnded(true); }
    else if (k === 'erefresh'){ this.liveHistory(true); }
    else if (k.startsWith('erow:')){ if (e.target.closest('.teBody')) return; const id = k.slice(5); this.eOpen = this.eOpen === id ? '' : id; this._eSig = ''; this.paintEnded(true);
      try { if (typeof Ghost !== 'undefined'){ const row = this.eOpen ? (this._endAll || []).find(x => x.id === id) : null; if (row) Ghost.show(row); else Ghost.hide(); } } catch(x){ console.warn('ended on chart', x); } }
    else if (k.startsWith('review:')){ const id = k.slice(7); if (typeof Autopsy === 'undefined' || typeof Face === 'undefined') return; Promise.resolve().then(() => Autopsy.collect()).catch(() => {}).then(() => { Autopsy.want = id; Face.go('autopsy'); }); }
    else if (k.startsWith('chart:')){ const id = k.slice(6), row = (this._endAll || []).find(x => x.id === id); try { if (row && typeof Ghost !== 'undefined') Ghost.show(row); else if (row){ if (typeof Face !== 'undefined' && Face.room !== 'chart') Face.go('chart'); typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(row.sym) : App.setSymbol(row.sym); } } catch(x){} } },
  paintEnded(force){ const s = this.$('tpEnded'), b = this.$('tpEndedBtn'); if (!s || !b) return; b.classList.toggle('on', this.ended); if (s.hidden === this.ended) s.hidden = !this.ended; if (!this.ended) return;
    const a = document.activeElement; if (!force && a && s.contains(a) && /INPUT|TEXTAREA/.test(a.tagName)) return;
    const kind = this.kind(); if (kind === 'live') this.liveHistory(false);
    const rows = this.endedRows(), sig = kind + '|' + this.fBot + '|' + this.fSig + '|' + this.per + '|' + this.from + '|' + this.to + '|' + this.eOpen + '|' + this.eMax + '|' + rows.length + '|' + (rows[0] ? rows[0].id + rows[0].t1 : '') + '|' + (typeof STORE !== 'undefined' ? STORE.symbol : '') + '|' + (this._lhBusy ? 1 : 0);
    if (!force && sig === this._eSig) return; this._eSig = sig;
    const won = rows.filter(t => t.pnl > 0).length, net = rows.reduce((x, t) => x + (t.pnl || 0), 0), custom = !!(this.from || this.to), E = x => this.esc(x);
    const row = t => { const open = this.eOpen === t.id, n = this.notes(t.key).length + (t.note ? 1 : 0), cls = t.pnl > 0 ? 'up' : t.pnl < 0 ? 'dn' : '';
      return '<div class="teRow ' + cls + (open ? ' open' : '') + '"><button type="button" class="teHead" data-tp="erow:' + E(t.id) + '" aria-expanded="' + open + '"><i class="' + (t.dir > 0 ? 'buy' : 'sell') + '">' + (t.dir > 0 ? 'BUY' : 'SELL') + '</i><span><b>' + E(typeof baseAsset === 'function' ? baseAsset(t.sym) : t.sym) + '</b><small>' + E(t.botName || '') + (t.sig && t.sig !== 'Not recorded' ? ' · ' + E(t.sig) : '') + (t.tf ? ' · ' + E(t.tf) : '') + '</small></span><span class="teRes"><b>' + this.money(t.pnl) + '</b><small>' + (t.r != null ? (t.r >= 0 ? '+' : '−') + Math.abs(t.r).toFixed(2) + 'R · ' : '') + this.when(t.t1) + '</small></span>' + (n ? '<u title="' + n + ' note' + (n === 1 ? '' : 's') + '">📝' + n + '</u>' : '') + '</button>' +
        (open ? '<div class="teBody"><dl><dt>Entry</dt><dd>' + this.px(t.entry) + ' · ' + this.when(t.t0) + '</dd><dt>Exit</dt><dd>' + this.px(t.exit) + ' · ' + this.when(t.t1) + '</dd><dt>Held</dt><dd>' + this.dur(t.t1 - t.t0) + '</dd><dt>Ended by</dt><dd>' + E(t.reason || 'not recorded') + (t.touched ? ' · adjusted by hand' : '') + '</dd></dl>' +
          (t.note ? '<div class="teNote"><small>WRITTEN AT ENTRY</small><p>' + E(t.note) + '</p></div>' : '') + this.box(t.key, true) +
          '<div class="teActs"><button type="button" data-tp="review:' + E(t.id) + '" title="Open this trade in the Replay: the chart around it, candle by candle">Replay ↗</button><button type="button" data-tp="chart:' + E(t.id) + '" title="Draw this trade on the main chart: its entry, target, stop and exit, where they were">Show on chart</button></div></div>' : '') + '</div>'; };
    s.innerHTML = '<div class="teTop"><b>Ended trades</b><em>' + (kind === 'live' ? 'real · from MetaTrader' : 'paper') + '</em>' + (kind === 'live' ? '<button type="button" data-tp="erefresh" title="Read MetaTrader’s history again">' + (this._lhBusy ? 'reading…' : '↻') + '</button>' : '') + '</div>' +
      '<div class="teChips">' + this.PER.map(p => '<button type="button" data-tp="per:' + p[0] + '" class="' + (!custom && this.per === p[0] ? 'on' : '') + '">' + p[1] + '</button>').join('') + '</div>' +
      '<div class="teDates' + (custom ? ' on' : '') + '"><label>From <input type="date" data-tpd="from" value="' + E(this.from) + '"></label><label>To <input type="date" data-tpd="to" value="' + E(this.to) + '"></label></div>' +
      '<p class="teSum">' + (rows.length ? '<b>' + rows.length + '</b> trade' + (rows.length === 1 ? '' : 's') + ' · <b class="up">' + won + '</b> won · <b class="dn">' + (rows.length - won) + '</b> not · net <b class="' + (net > 0 ? 'up' : net < 0 ? 'dn' : '') + '">' + this.money(net) + '</b>' : (kind === 'live' && this._lhBusy ? 'Reading MetaTrader’s history…' : this.fBot || this.fSig ? 'No ended trade matches this time and this filter.' : 'No ended trades in this time.')) + '</p>' +
      rows.slice(0, this.eMax).map(row).join('') + (rows.length > this.eMax ? '<button type="button" class="teMore" data-tp="emore">Show ' + Math.min(60, rows.length - this.eMax) + ' more of ' + rows.length + '</button>' : ''); },

  /* ================= filter: the bot that opened a trade, and the signal within that bot ================= */
  fBot: '', fSig: '', NOSIG: 'Not recorded',
  /* what the bot recorded as its reason, read the way the Autopsy room reads it */
  sigOf(o, bot, botName){ let s = ''; try { if (o && typeof Explorer !== 'undefined' && Explorer.triggerOf) s = Explorer.triggerOf(o); } catch(e){} s = String(s || (o && (o.trigger || o.model)) || '').trim(); return !s || s === bot || s === botName || s === this.NOSIG ? this.NOSIG : s; },
  match(t){ return (!this.fBot || t.bot === this.fBot) && (!this.fSig || t.sig === this.fSig); },
  /* the open trades of the side that is showing, each with its bot and signal */
  openMeta(){ const M = new Map(), kind = this.kind();
    if (kind === 'paper'){ try { for (const r of OpenTrades.all()) M.set(r.bot + ':' + r.p.id, { bot: r.bot, botName: this.botName(r.bot, r.botName), sig: this.sigOf(r.p, r.bot, r.botName) }); } catch(e){} }
    else { let orders = []; try { orders = (Live.loadBook().orders || []); } catch(e){} try { for (const r of LiveDesk.chartRows()){ const id = String(r.ticket != null ? r.ticket : r.p && r.p.id), o = orders.find(x => x && String(x.ticket) === id) || null, bid = r.bot === 'live' || !r.bot ? 'untagged' : r.bot; M.set(id, { bot: bid, botName: bid === 'untagged' ? 'untagged' : this.botName(bid, r.botName), sig: this.sigOf(o, bid, r.botName) }); } } catch(e){} }
    return M; },
  botName(id, fallback){ try { const b = typeof BOT_BY_ID !== 'undefined' && BOT_BY_ID[id]; if (b && typeof TmSettings !== 'undefined') return TmSettings.name(b); } catch(e){} return fallback || id; },
  filterInit(){ const head = document.querySelector('#tab-tstrade .trCardsHead'); if (!head || this.$('tpFilter')) return; const f = document.createElement('div'); f.id = 'tpFilter'; f.className = 'tpFilter';
    f.innerHTML = '<label>Bot<select id="tpFBot" title="Only the trades this bot opened"></select></label><label>Signal<select id="tpFSig" title="Only the trades opened by this signal"></select></label><button type="button" id="tpFClear" title="Show every trade again" hidden>Clear</button><p id="tpFNone" hidden>No open trade matches this filter.</p>';
    head.after(f);
    f.addEventListener('change', e => { if (e.target.id === 'tpFBot'){ this.fBot = e.target.value; this.fSig = ''; } else if (e.target.id === 'tpFSig') this.fSig = e.target.value; else return; this.filterChanged(); });
    f.addEventListener('click', e => { if (e.target.id === 'tpFClear'){ this.fBot = this.fSig = ''; this.filterChanged(); } });
    document.querySelector('#tab-tstrade .trWrap').addEventListener('click', e => { if (e.target.closest('[data-tr^="kind:"]')){ this.fBot = this.fSig = ''; setTimeout(() => this.filterChanged(), 60); } });
    this.filterPaint(true); },
  filterChanged(){ this._fAt = 0; this.filterPaint(true); try { SideTrade.filter(); } catch(e){} this._eSig = ''; this.eOpen = ''; this.paintEnded(true); },
  /* the two lists hold what there is to choose from: every bot with a trade on this side, and the signals of the chosen bot */
  filterPaint(force){ const sb = this.$('tpFBot'), ss = this.$('tpFSig'); if (!sb || !ss) return; const a = document.activeElement; if (!force && (a === sb || a === ss)) return; if (!force && Date.now() - (this._fAt || 0) < 5000) return; this._fAt = Date.now();
    const open = [...this.openMeta().values()]; if (!this.ended || !this._endAll || this._endKind !== this.kind()){ try { this.endedRows(); } catch(e){} } this._endKind = this.kind(); const ended = this._endAll || [];
    const bots = new Map(), add = (t, k) => { const b = bots.get(t.bot) || { id: t.bot, name: t.botName || t.bot, open: 0, ended: 0, sigs: new Map() }; b[k]++; const s = b.sigs.get(t.sig) || { open: 0, ended: 0 }; s[k]++; b.sigs.set(t.sig, s); bots.set(t.bot, b); };
    for (const t of open) add(t, 'open'); for (const t of ended) add(t, 'ended');
    const cnt = x => (x.open ? x.open + ' open' : '') + (x.open && x.ended ? ' · ' : '') + (x.ended ? x.ended + ' ended' : ''), E = s => this.esc(s), L = [...bots.values()].sort((x, y) => String(x.name).localeCompare(String(y.name)));
    let hb = '<option value="">All bots (' + L.length + ')</option>' + L.map(b => '<option value="' + E(b.id) + '">' + E(b.name) + ' — ' + cnt(b) + '</option>').join(''); if (this.fBot && !bots.has(this.fBot)) hb += '<option value="' + E(this.fBot) + '">' + E(this.botName(this.fBot)) + ' — no trade now</option>';
    const sg = new Map(); for (const b of L){ if (this.fBot && b.id !== this.fBot) continue; for (const [k, v] of b.sigs){ const s = sg.get(k) || { open: 0, ended: 0 }; s.open += v.open; s.ended += v.ended; sg.set(k, s); } }
    const SL = [...sg.entries()].sort((x, y) => (x[0] === this.NOSIG) - (y[0] === this.NOSIG) || x[0].localeCompare(y[0]));
    let hs = '<option value="">' + (this.fBot ? 'All its signals (' + SL.length + ')' : 'All signals (' + SL.length + ')') + '</option>' + SL.map(([k, v]) => '<option value="' + E(k) + '">' + E(k) + ' — ' + cnt(v) + '</option>').join(''); if (this.fSig && !sg.has(this.fSig)) hs += '<option value="' + E(this.fSig) + '">' + E(this.fSig) + ' — no trade now</option>';
    if (sb._h !== hb){ sb._h = hb; sb.innerHTML = hb; } if (ss._h !== hs){ ss._h = hs; ss.innerHTML = hs; } sb.value = this.fBot; ss.value = this.fSig;
    const on = !!(this.fBot || this.fSig); this.$('tpFilter').classList.toggle('on', on); this.$('tpFClear').hidden = !on; },
  /* after the Trade tab has shown or hidden its cards for "This chart", the cards the filter leaves out are hidden too */
  applyFilter(){ const none = this.$('tpFNone'), on = !!(this.fBot || this.fSig); if (!on){ if (none) none.hidden = true; return; } const M = this.openMeta(), live = this.kind() === 'live', host = this.$(live ? 'tsLiveCards' : 'tsTradeCards'); if (!host) return; let shown = 0, all = 0;
    host.querySelectorAll(live ? '[data-ldpos]' : '.otCard').forEach(c => { const m = M.get(live ? c.dataset.ldpos : c.dataset.ot); all++; if (!m || !this.match(m)){ if (!c.hidden) c.hidden = true; } else if (!c.hidden) shown++; });
    const cnt = this.$('trCount'); if (cnt) cnt.textContent = shown + ' shown by the filter · ' + cnt.textContent; if (none) none.hidden = shown > 0 || !all; },

  /* ================= the top row: Paper or Live, BUY and SELL with the price ================= */
  MKEY: 'astra_top_trade_mode', FKEY: 'astra_ticket_fast',
  mode(){ return this.ls(this.MKEY, 'paper') === 'live' ? 'live' : 'paper'; },
  fast(){ return this.ls(this.FKEY, '1') !== '0'; },
  topInit(){ const tb = this.$('topbar'); if (!tb || this.$('tpTop')) return; const el = document.createElement('span'); el.id = 'tpTop'; el.className = 'tsOnlyFace';
    el.innerHTML = '<span class="tpMode" role="group" aria-label="Which account the buttons open"><button type="button" data-tpm="paper" title="Paper: the Manual Trading Bot’s ticket, in the side panel">Paper</button><button type="button" data-tpm="live" title="Live: Classic’s LIVE trading bot, with every one of its checks">Live</button></span>' +
      '<button type="button" class="tpB buy" data-tpgo="1"><b>BUY</b><i id="tpAsk">–</i></button><button type="button" class="tpB sell" data-tpgo="-1"><b>SELL</b><i id="tpBid">–</i></button>';
    const after = this.$('tmToolsBtn'); if (after && after.parentNode === tb) after.after(el); else tb.appendChild(el);
    el.addEventListener('click', e => { const m = e.target.closest('[data-tpm]'), g = e.target.closest('[data-tpgo]'); if (m){ this.put(this.MKEY, m.dataset.tpm); this.paintTop(); if (typeof toast === 'function') toast(m.dataset.tpm === 'live' ? 'BUY and SELL now open the LIVE trading bot. Its own checks still stand before any real order.' : 'BUY and SELL now open the paper ticket.', 'info'); } else if (g) this.go(+g.dataset.tpgo); });
    this.paintTop(); },
  paintTop(){ const el = this.$('tpTop'); if (!el) return; const m = this.mode(); el.dataset.mode = m; el.querySelectorAll('[data-tpm]').forEach(b => b.classList.toggle('on', b.dataset.tpm === m));
    const say = m === 'live' ? 'Opens the LIVE trading bot on this market. Nothing is sent from here: its own checks and its own Confirm button come first.' : 'Opens the paper ticket on this market, at the market price. The ticket’s own button places the trade.';
    el.querySelectorAll('.tpB').forEach(b => { b.title = (b.dataset.tpgo === '1' ? 'BUY · ' : 'SELL · ') + (m === 'live' ? 'real account. ' : 'paper. ') + say; }); this.prices(); },
  prices(){ if (!this.on()) return; const a = this.$('tpAsk'), b = this.$('tpBid'); if (!a || !b || typeof STORE === 'undefined') return; const q = STORE.tickers.get(STORE.symbol) || {}, ask = q.ask || q.last || q.price, bid = q.bid || q.last || q.price, ta = this.px(+ask), tb = this.px(+bid);
    if (a.textContent !== ta) a.textContent = ta; if (b.textContent !== tb) b.textContent = tb; },
  go(dir){ if (typeof STORE === 'undefined' || !STORE.symbol){ if (typeof toast === 'function') toast('Choose a market first.', 'info'); return; } const sym = STORE.symbol, tf = STORE.tf;
    if (this.mode() === 'live') return this.live(sym, dir);
    const open = () => { try { const m = this.$('main'); if (document.documentElement.dataset.chartmax === '1' && typeof App !== 'undefined' && App.setMax) App.setMax(false); if (m && (m.classList.contains('sideClosed') || m.classList.contains('sideMin')) && typeof SideWindow !== 'undefined') SideWindow.action('restore'); } catch(e){}
      try { WorkspaceUI.openManual(sym, dir, tf); } catch(e){ console.warn('ticket', e); } setTimeout(() => this.fastPaint(), 60); };
    if (typeof Face !== 'undefined' && Face.room !== 'chart'){ Face.go('chart'); setTimeout(open, 220); } else open(); },
  /* Live: Classic's own desk, on this market and side. Its form is filled the way its own picker and its own BUY / SELL buttons fill it. */
  live(sym, dir){ const LM = typeof LiveManual !== 'undefined' ? LiveManual : null, say = (t, k) => { if (typeof toast === 'function') toast(t, k || 'info'); };
    if (!LM || typeof Face === 'undefined'){ say('The live desk is not available here.'); return; }
    const side = dir > 0 ? 'buy' : 'sell'; let exact = sym, known = false; try { exact = typeof Feed !== 'undefined' && Feed.brokerName ? Feed.brokerName(sym) : sym; known = LM.symbols().includes(exact); } catch(e){}
    const idle = !LM.busy && !(LM.auto && (LM.auto.running || LM.auto.starting)), drawn = !!document.getElementById('lmDesk');
    if (idle && known && !drawn){ /* not drawn yet: it draws itself from its draft. A changed market or side clears the levels, as its own picker does */
      if (LM.draft.sym !== exact){ LM.draft.sym = exact; LM.draft.lots = LM.draft.sl = LM.draft.tp = LM.draft.amount = ''; }
      if (LM.draft.side !== side){ LM.draft.side = side; LM.draft.sl = LM.draft.tp = ''; }
      LM.revision++; LM.preview = null; }
    const K = 'astra_face_view_live', old = this.ls(K, null); Face.view('live', 'classic'); setTimeout(() => { try { if (old == null) localStorage.removeItem(K); else localStorage.setItem(K, old); } catch(e){} }, 500);
    let n = 0; const fit = () => { const host = document.getElementById('lmDesk'); if (!host){ if (++n < 20) setTimeout(fit, 150); return; }
      if (!idle){ say('The live desk is busy, so it was opened as it is.'); return; } if (!known){ say(exact + ' is not on the live account’s list. Pick the market in the ticket.'); return; }
      try { if (LM.draft.sym !== exact){ const pick = host.querySelector('#mbSym'); LM.draft.sym = exact; if (pick){ pick.dataset.val = exact; pick.textContent = exact; } for (const id of ['mbSl', 'mbTp', 'mbQty', 'mbAmt']){ const el = host.querySelector('#' + id); if (el) el.value = ''; } const sl = host.querySelector('#mbSl'); if (sl) sl.dispatchEvent(new Event('input', { bubbles: true })); }
        if (LM.draft.side !== side){ const b = host.querySelector('[data-mbside="' + dir + '"]'); if (b) b.click(); } } catch(e){ console.warn('live ticket', e); }
      say('LIVE trading bot · ' + exact + ' · ' + side.toUpperCase() + '. Nothing has been sent; its own checks come first.'); };
    setTimeout(fit, 250); },

  /* ---------- the paper ticket, Fast: only what a market order needs ---------- */
  fastInit(){ const bar = document.querySelector('#trTicket .trBar'); if (!bar || this.$('tpFastBtn')) return; const b = document.createElement('button'); b.type = 'button'; b.id = 'tpFastBtn'; b.title = 'Fast: only what a market order needs. Full: every field of the ticket.';
    const full = bar.querySelector('[data-tr="full"]'); full ? bar.insertBefore(b, full) : bar.appendChild(b); b.addEventListener('click', e => { e.stopPropagation(); this.put(this.FKEY, this.fast() ? '0' : '1'); this.fastPaint(); });
    const p = document.createElement('p'); p.id = 'tpFastHint'; p.className = 'tpFastHint'; bar.after(p); this.fastPaint(); },
  HIDDEN: [['mbQty', 'Lots'], ['mbEntry', 'Entry price']],
  fastPaint(){ const box = this.$('trTicket'), b = this.$('tpFastBtn'), p = this.$('tpFastHint'); if (!box || !b || !p) return; const f = this.fast(); box.classList.toggle('tpFast', f); b.textContent = f ? 'Fast ✓' : 'Fast'; b.classList.toggle('on', f);
    if (!f){ if (p.textContent) p.textContent = ''; p.hidden = true; return; }
    /* a field that is hidden but filled in still counts: say so */
    const used = []; try { const ot = this.$('mbOrderType'); if (ot && ot.value && ot.value !== 'market') used.push('Order type: ' + ot.value); for (const [id, name] of this.HIDDEN){ const el = this.$(id); if (el && String(el.value || '').trim() && !(el.closest('[hidden]'))) used.push(name + ': ' + el.value); } } catch(e){}
    const t = used.length ? 'Still set in the full ticket: ' + used.join(' · ') + '. Press Fast to see every field.' : 'Market order at the price now. Leave Amount and the stop empty and the ticket sizes the trade from your risk limit and sets its own stop. The button under BUY / SELL is the ticket’s own: it places the paper trade.';
    if (p.textContent !== t) p.textContent = t; p.hidden = false; p.classList.toggle('warn', used.length > 0); },

  init(){ this.notesInit(); this.topInit(); this.endedInit(); this.fastInit(); this.filterInit();
    if (typeof SideTrade !== 'undefined' && !SideTrade._tpFilt && SideTrade.filter){ SideTrade._tpFilt = true; const f = SideTrade.filter.bind(SideTrade); SideTrade.filter = (...a) => { const r = f(...a); try { this.applyFilter(); } catch(e){} return r; }; }
    if (typeof SideTrade !== 'undefined' && !SideTrade._tpWrap && SideTrade.dress){ SideTrade._tpWrap = true; const d = SideTrade.dress.bind(SideTrade), l = SideTrade.live.bind(SideTrade);
      SideTrade.dress = (...a) => { const r = d(...a); try { this.cardBoxes(); } catch(e){} return r; }; SideTrade.live = (...a) => { const r = l(...a); try { this.cardBoxes(); } catch(e){} return r; }; }
    if (!this._tick){ this._tick = setInterval(() => { try { this.prices(); if (!this.on()) return; const tab = this.$('tab-tstrade'); if (tab && tab.classList.contains('active') && tab.offsetParent !== null){ this.cardBoxes(); this.filterPaint(false); this.paintEnded(false); const tk = this.$('trTicket'); if (tk && !tk.hidden) this.fastPaint(); } } catch(e){} }, 1000); }
    return !!(this.$('tpTop') && this.$('tpEndedBtn') && this.$('tpFastBtn') && this.$('tpFilter')); },
};
(function start(n){ let ok = false; try { ok = TradePlus.init(); } catch(e){ console.warn('trade plus', e); } if (!ok && n < 40) setTimeout(() => start(n + 1), 700); })(0);
