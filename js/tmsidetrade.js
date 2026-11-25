/* ASTRA / Timurila — trading from the side panel, in the new look.

     TRADE tab   BUY · Manual and SELL · Manual (on the top bar, and Buy / Sell on any chart) open the paper ticket
                 here, in the side panel, already set to the chart's instrument and side. It is the Manual Trading
                 Bot's own ticket: the page itself is moved here (as the bot studio does), so every field, check and
                 button is Classic's own, with its own code. "Full Manual Trading Bot" opens the whole desk.
                 Under it, every open paper trade as a card: its result, its facts, the price between stop and target
                 (drag them), and, pressed open, stop and target, trailing stop, reduce or close. These are
                 Open Trades' own cards with their own controls, laid out for the narrow panel.
     BOTS tab    in the new look, a tidy list of every page and bot (as in the studio's rail); a press opens it in
                 the studio. In the Classic look the tab is unchanged.

   This file moves and draws. It sends nothing: a trade is placed, changed or closed only by the page's own buttons,
   pressed by you. */
'use strict';
const SideTrade = window.SideTrade = {
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  on(){ return document.documentElement.dataset.face === 'tm'; },
  scope: 'all', kind: 'paper', open: new Set(), openLive: new Set(), q: '',
  ICON: '<svg class="wsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 17l5-5 4 4 7-8"/><path d="M15 8h5v5"/><path d="M4 21h16"/></svg>',

  init(){ const st = this.$('sideTabs'), body = document.querySelector('#sidebar .sideBody'); if (!st || !body || this.$('tab-tstrade') || typeof OpenTrades === 'undefined' || typeof WorkspaceUI === 'undefined') return false;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'tstrade'; b.className = 'tsOnlyFace'; b.title = 'Trade: the paper ticket and your open trades'; b.innerHTML = this.ICON + '<span>TRADE</span>';
    const w = st.querySelector('[data-tab="watch"]'); st.insertBefore(b, w ? w.nextSibling : st.firstChild);
    b.addEventListener('click', () => this.show());
    const p = document.createElement('div'); p.id = 'tab-tstrade'; p.className = 'sidePanel tsOnlyFace';
    p.innerHTML = '<div class="trWrap"><div class="trTop"><button type="button" class="trBuy" data-tr="buy"><b>BUY</b><small>paper ticket</small></button><button type="button" class="trSell" data-tr="sell"><b>SELL</b><small>paper ticket</small></button></div>' +
      '<section class="trTicket" id="trTicket" hidden><div class="trBar"><b>Manual ticket</b><button type="button" data-tr="full" title="The whole Manual Trading Bot: rules, automatic entries, orders, results">Full desk ↗</button><button type="button" data-tr="close" title="Put the ticket away">✕</button></div><div id="tsTradeHost"></div></section>' +
      '<div class="trCardsHead"><b>Open trades</b><span class="trSeg trKind"><button type="button" data-tr="kind:paper">Paper</button><button type="button" data-tr="kind:live">Live</button></span><span class="trSeg"><button type="button" data-tr="scope:all">All</button><button type="button" data-tr="scope:chart">This chart</button></span><em id="trCount"></em></div><div id="tsTradeCards" class="trCards"></div><div id="tsLiveCards" class="trLive" hidden></div></div>';
    body.appendChild(p);
    p.addEventListener('click', e => this.click(e)); p.addEventListener('dblclick', e => this.dbl(e));
    /* the ticket is the Manual Trading Bot's own: Buy / Sell anywhere bring it here while the chart is on screen */
    const om = WorkspaceUI.openManual.bind(WorkspaceUI);
    WorkspaceUI.openManual = (sym, dir, tf) => { if (this.on() && document.documentElement.dataset.tmroom === 'chart' && !document.documentElement.dataset.panel){ this.ticket(sym || STORE.symbol, dir, tf || STORE.tf); return; } return om(sym, dir, tf); };
    /* whoever needs the page next takes it back first */
    if (typeof BotStudio !== 'undefined' && !BotStudio._trWrap){ BotStudio._trWrap = true; const em = BotStudio.embed.bind(BotStudio); BotStudio.embed = (...a) => { this.release(); return em(...a); }; }
    const lower = document.querySelector('#botTabs [data-tab="bots"]'); if (lower) lower.addEventListener('click', () => this.release(), true);
    st.addEventListener('click', e => { const t = e.target.closest && e.target.closest('button[data-tab]'); if (t && t.dataset.tab !== 'tstrade') setTimeout(() => { this.release(); this.sync(); }, 0); });
    new MutationObserver(() => { if (!this.on() || document.documentElement.dataset.tmroom !== 'chart') this.release(); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-face', 'data-tmroom', 'data-chartmax'] });
    setInterval(() => this.tick(), 1000);
    try { BUS.on('symbol', () => this.filter()); } catch(e){}
    this.bots(); return true; },

  active(){ const p = this.$('tab-tstrade'); return !!p && p.classList.contains('active') && p.offsetParent !== null; },
  show(){ const st = this.$('sideTabs'), b = st && st.querySelector('[data-tab="tstrade"]'); if (!b) return; if (typeof ChartPlus !== 'undefined') ChartPlus._picked = true;
    st.querySelectorAll('button[data-tab]').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('#sidebar .sidePanel').forEach(p => p.classList.toggle('active', p.id === 'tab-tstrade'));
    try { if (typeof Face !== 'undefined') Face.sideNames(); } catch(e){} this.sync(); this.cards(true); },
  click(e){ const b = e.target.closest('[data-tr]'); if (b){ const k = b.dataset.tr;
      if (k === 'buy' || k === 'sell') this.ticket(STORE.symbol, k === 'buy' ? 1 : -1, STORE.tf);
      else if (k === 'close') this.release();
      else if (k === 'full'){ this.release(); if (typeof Face !== 'undefined') Face.studio('manual'); }
      else if (k.startsWith('scope:')){ this.scope = k.slice(6); this.filter(); }
      else if (k.startsWith('kind:')){ this.kind = k.slice(5); try { localStorage.setItem('astra_trade_kind', this.kind); } catch(x){} this.cards(true); }
      return; }
    /* ▾ opens a card's controls; a press anywhere else on it shows the trade on the chart, as the chart's own list does */
    const more = e.target.closest('#tab-tstrade .trMore'); if (more){ const card = more.closest('.otCard'), live = card.hasAttribute('data-ldpos'), k = live ? card.dataset.ldpos : card.dataset.ot, set = live ? this.openLive : this.open, isOpen = card.classList.contains('trOpen'); if (isOpen) set.delete(k); else set.add(k); card.classList.toggle('trOpen', !isOpen); return; }
    /* a real position: a press shows it on the chart, as its own On chart button does */
    const lc = e.target.closest('#tsLiveCards .ldPos'); if (lc){ if (e.target.closest('button, input, select, textarea, a, label, .wsPriceRail, .otEdit, .tnBox')) return; const id = lc.dataset.ldpos; clearTimeout(this._ct); this._ct = setTimeout(() => { try { LiveDesk.showOnChart(id); } catch(x){} }, 260); return; }
    const card = e.target.closest('#tsTradeCards .otCard'); if (!card || e.target.closest('button, input, select, textarea, a, label, .wsPriceRail, .wsTradeSection, .tnBox')) return; const ck = card.dataset.ot; clearTimeout(this._ct); this._ct = setTimeout(() => this.focus(ck), 260); },
  /* a double press anywhere on a card that is not a control unfolds it (or folds it again); the single press waits a moment so the two do not both happen */
  dbl(e){ if (e.target.closest('button, input, select, textarea, a, label, .wsPriceRail, .otEdit, .wsTradeSection, .tnBox')) return; const card = e.target.closest('#tsTradeCards .otCard, #tsLiveCards .ldPos[data-ldpos]'); if (!card) return; clearTimeout(this._ct); e.preventDefault();
    const live = card.hasAttribute('data-ldpos'), k = live ? card.dataset.ldpos : card.dataset.ot, set = live ? this.openLive : this.open, isOpen = card.classList.contains('trOpen'); if (isOpen) set.delete(k); else set.add(k); card.classList.toggle('trOpen', !isOpen); try { window.getSelection().removeAllRanges(); } catch(x){} if (!isOpen) card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  focus(k){ if (typeof PosLines === 'undefined' || !k) return; const i = k.indexOf(':'), bot = k.slice(0, i), id = /^T/.test(k.slice(i + 1)) ? k.slice(i + 1) : +k.slice(i + 1); const row = OpenTrades.all().find(r => r.bot + ':' + r.p.id === k); if (!row) return;
    const here = this.base(STORE.symbol) === this.base(row.p.sym);
    if (!here){ PosLines.show(bot, id); setTimeout(() => { try { if (PosLines.rows().length > 1) PosLines.toggleSolo(k); } catch(e){} this.dress(); }, 1500); return; }
    if (PosLines.rows().length > 1) PosLines.toggleSolo(k); else { PosLines.focus = k; try { Draw.redraw(); } catch(e){} setTimeout(() => { if (PosLines.focus === k){ PosLines.focus = null; try { Draw.redraw(); } catch(e){} } }, 8000); }
    this.dress(); },
  /* each card gets its ▾, the note written with the trade, and a mark when it is the one singled out on the chart */
  dress(){ const host = this.$('tsTradeCards'); if (!host) return; let rows = null, solo = null; try { solo = PosLines.soloKey(); } catch(e){}
    host.querySelectorAll('.otCard').forEach(c => { if (!c.querySelector(':scope > .trMore')){ const b = document.createElement('button'); b.type = 'button'; b.className = 'trMore'; b.title = 'Stop and target, trailing stop, reduce or close. A double-click on the card does the same.'; b.textContent = '▾'; c.appendChild(b); }
      rows = rows || new Map(OpenTrades.all().map(r => [r.bot + ':' + r.p.id, r])); const r = rows.get(c.dataset.ot), note = r && typeof ChartPlus !== 'undefined' ? ChartPlus.noteOf(r.p) : '';
      let n = c.querySelector(':scope > .trNote'); if (note){ if (!n){ n = document.createElement('div'); n.className = 'trNote'; c.querySelector('.otHead').after(n); } if (n.textContent !== '📝 ' + note) n.textContent = '📝 ' + note; } else if (n) n.remove();
      c.classList.toggle('trSolo', !!solo && solo === c.dataset.ot); }); },

  /* ---------- the ticket ---------- */
  ticket(sym, dir, tf){ if (!sym) return; const body = this.$('botBody'), host = this.$('tsTradeHost'), box = this.$('trTicket'); if (!body || !host || typeof Bots === 'undefined') return;
    this.show();
    try { if (typeof SideBots !== 'undefined' && SideBots.inSide) SideBots.back(); } catch(e){}
    try { if (typeof BotStudio !== 'undefined') BotStudio.release(); } catch(e){}
    if (body.parentElement !== host){ this.home = { parent: body.parentElement, next: body.nextSibling }; host.appendChild(body); }
    body.dataset.sidetrade = '1'; box.hidden = false;
    if (Bots.active !== 'manual'){ Bots.active = 'manual'; try { if (Bots.renderNav) Bots.renderNav(); } catch(e){} Bots.render(); }
    /* the same filling as the Manual Trading Bot's own Buy / Sell: the instrument, its timeframe, market order, the side */
    const picker = this.$('mbSym'); if (!picker) return;
    if (picker.dataset.val !== sym){ for (const id of ['mbAmt', 'mbQty', 'mbSl', 'mbTp', 'mbEntry', 'mbNote']){ const el = this.$(id); if (el) el.value = ''; } const pct = this.$('mbPct'); if (pct) pct.value = 0; }
    picker.dataset.val = sym; picker.innerHTML = this.esc(typeof baseAsset === 'function' ? baseAsset(sym) : sym) + ' <i>▾</i>';
    const tfEl = this.$('mbTf'); if (tfEl) tfEl.value = tf; const ot = this.$('mbOrderType'); if (ot) ot.value = 'market';
    const side = document.querySelector('#tsTradeHost [data-mbside="' + dir + '"]'); if (side) side.click();
    try { Bots.manualCalc(); } catch(e){} const sl = this.$('mbSl'); if (sl) sl.focus({ preventScroll: true });
    host.scrollIntoView({ block: 'nearest' }); },
  release(){ const body = this.$('botBody'), host = this.$('tsTradeHost'), box = this.$('trTicket'); if (box) box.hidden = true; if (!body || !host || !host.contains(body)) return;
    delete body.dataset.sidetrade; const h = this.home || {}, home = h.parent && h.parent.isConnected && !host.contains(h.parent) ? h.parent : document.querySelector('#bot-bots .botsWrap'); if (!home) return;
    try { home.insertBefore(body, h.next && h.next.parentNode === home ? h.next : null); } catch(e){ home.appendChild(body); } },

  /* ---------- the cards: Open Trades' own, refreshed by its own code, pointed at this panel ---------- */
  /* the real positions: the live desk's own cards, with its own Apply (which asks first) and its two-press close */
  live(fresh){ const host = this.$('tsLiveCards'); if (!host || typeof LiveDesk === 'undefined') return;
    if (!fresh){ if (host.contains(document.activeElement) && document.activeElement.matches('input')) return; if (host.querySelector('[data-ldclose][data-armed="1"]')) return; if (typeof PriceRail !== 'undefined' && PriceRail.busy(host)) return; if (Date.now() - (this._lAt || 0) < 3000) return; }
    this._lAt = Date.now(); let html = ''; try { html = LiveDesk.positionsView(); } catch(e){ html = '<div class="empty">The real positions could not be read just now.</div>'; } host.innerHTML = html; try { LiveDesk.bindPositions(host); } catch(e){}
    /* each real card gets its ▾ and keeps its open state across the desk's redraws */
    host.querySelectorAll('.ldPos[data-ldpos]').forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'trMore'; b.title = 'Stop and target at the broker, on chart, close. A double-click on the card does the same.'; b.textContent = '▾'; c.appendChild(b); c.classList.toggle('trOpen', this.openLive.has(c.dataset.ldpos)); });
    this.filter(); },
  cards(fresh){ try { const k = localStorage.getItem('astra_trade_kind'); if (k && fresh && !this._kindRead){ this.kind = k; } this._kindRead = true; } catch(e){}
    const lv = this.$('tsLiveCards'), pp = this.$('tsTradeCards'); if (lv) lv.hidden = this.kind !== 'live'; if (pp) pp.hidden = this.kind === 'live';
    document.querySelectorAll('#tab-tstrade [data-tr^="kind:"]').forEach(b => b.classList.toggle('on', b.dataset.tr === 'kind:' + this.kind));
    if (this.kind === 'live'){ this.live(fresh); return; }
    const host = this.$('tsTradeCards'); if (!host) return; if (fresh || !host.querySelector('.otList')){ const rows = OpenTrades.all();
      host.innerHTML = '<div class="otBar" hidden></div><div class="otList">' + rows.map(r => OpenTrades.card(r)).join('') + '</div>' + (rows.length ? '' : '<div class="empty otEmpty">No open positions.</div>');
      OpenTrades.bind(host); host.querySelectorAll('.otCard').forEach(c => c.classList.toggle('trOpen', this.open.has(c.dataset.ot))); }
    this.refresh(); },
  refresh(){ if (this.kind === 'live'){ this.live(false); return; } const host = this.$('tsTradeCards'); if (!host || !host.querySelector('.otList')) return; const o = OpenTrades.scope;
    OpenTrades.scope = () => ({ host, bot: null }); try { OpenTrades.refresh(); } catch(e){ console.warn('side cards', e); } finally { OpenTrades.scope = o; }
    host.querySelectorAll('.otCard').forEach(c => { if (this.open.has(c.dataset.ot) !== c.classList.contains('trOpen')) c.classList.toggle('trOpen', this.open.has(c.dataset.ot)); }); this.dress(); this.filter(); },
  base(s){ return String(s || '').replace(/\.(s|m|std)$/i, '').toUpperCase(); },
  filter(){ const here = this.base(STORE.symbol); if (this.kind === 'live'){ const lv = this.$('tsLiveCards'); let rows = []; try { rows = LiveDesk.chartRows(); } catch(e){} const symOf = {}; for (const r of rows) symOf[String(r.ticket != null ? r.ticket : r.p && r.p.id)] = r.p && r.p.sym;
      let n = 0, all = 0; if (lv) lv.querySelectorAll('[data-ldpos]').forEach(c => { const mine = this.base(symOf[c.dataset.ldpos]) === here, show = this.scope === 'all' || mine; all++; if (show) n++; if (c.hidden === show) c.hidden = !show; });
      const cnt = this.$('trCount'); if (cnt) cnt.textContent = (this.scope === 'all' ? all + ' real' : n + ' on ' + here + ' · ' + all + ' real');
      document.querySelectorAll('#tab-tstrade [data-tr^="scope:"]').forEach(b => b.classList.toggle('on', b.dataset.tr === 'scope:' + this.scope)); return; }
    const host = this.$('tsTradeCards'); if (!host) return; let n = 0, all = 0;
    host.querySelectorAll('.otCard').forEach(c => { const pl = c.querySelector('[data-pair-chart]'), mine = pl && this.base(pl.dataset.pairChart) === here, show = this.scope === 'all' || mine; all++; if (show) n++; if (c.hidden === show) c.hidden = !show; });
    const cnt = this.$('trCount'); if (cnt) cnt.textContent = this.scope === 'all' ? all + ' open' : n + ' on ' + here + ' · ' + all + ' in all';
    document.querySelectorAll('#tab-tstrade [data-tr^="scope:"]').forEach(b => b.classList.toggle('on', b.dataset.tr === 'scope:' + this.scope)); },
  sync(){ const on = this.on() && this.active(), H = document.documentElement; if (H.classList.contains('tsTradeTab') !== on){ H.classList.toggle('tsTradeTab', on); setTimeout(() => window.dispatchEvent(new Event('resize')), 80); } },
  tick(){ this.sync(); if (!this.on()) return; if (this.active()) this.refresh(); else if (this.$('tsTradeHost') && this.$('tsTradeHost').contains(this.$('botBody')) && this.$('tab-tstrade') && !this.$('tab-tstrade').classList.contains('active')) this.release(); if (this.sbActive()) this.paintBots(); },

  /* ---------- the Bots tab, tidy ---------- */
  bots(){ if (typeof SideBots === 'undefined' || SideBots._trWrap) return; SideBots._trWrap = true; const show = SideBots.show.bind(SideBots);
    SideBots.show = () => { if (!this.on()) return show(); if (SideBots.inSide) SideBots.back(); this.paintBots(true); };
    new MutationObserver(() => { if (this.on() && SideBots.inSide) SideBots.back(); if (this.sbActive()) this.paintBots(true); }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-face'] }); },
  sbActive(){ const p = this.$('tab-sbots'); return this.on() && !!p && p.classList.contains('active') && p.offsetParent !== null; },
  paintBots(force){ const p = this.$('tab-sbots'); if (!p || typeof BotStudio === 'undefined') return; let box = this.$('trBots');
    if (!box){ box = document.createElement('div'); box.id = 'trBots'; box.className = 'tsOnlyFace'; box.innerHTML = '<div class="trBotsHead"><input type="search" id="trBotsFind" placeholder="Find a page or a bot…"></div><div class="suItems" id="trBotsItems"></div>'; p.appendChild(box);
      box.addEventListener('click', e => this.botClick(e)); box.querySelector('#trBotsFind').addEventListener('input', e => { this.q = e.target.value; this.findBots(); }); }
    if (!force && Date.now() - (this._bAt || 0) < 8000) return; this._bAt = Date.now();
    const S = BotStudio, E = S.entries(), list = S.list(), esc = s => this.esc(s), cls = v => v > 0 ? 'up' : v < 0 ? 'dn' : '', sg = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(Math.round(v)).toLocaleString('en-US');
    const item = f => { const ch = f.eq - f.start; return '<button type="button" class="suItem ' + f.state + '" data-sb="pick:' + esc(f.id) + '" data-name="' + esc((f.name + ' ' + (f.tf || '') + ' ' + f.state).toLowerCase()) + '"><i></i><span><b>' + esc(f.name) + '</b><small>' + (f.tf ? esc(f.tf) + ' · ' : '') + f.trades + ' trades</small></span>' + (typeof TmSettings !== 'undefined' ? TmSettings.spark(f.curve, 64, 22, null, 'sb' + f.id) : '') + '<em class="' + cls(ch) + '">' + sg(ch) + '</em></button>'; };
    const page = e => '<button type="button" class="suItem pg" data-sb="' + (e.kind === 'page' ? 'pick:' + esc(e.id) : e.kind === 'room' ? 'room:' + S.ROOMS[e.id] : e.kind === 'settings' ? 'settings:1' : 'classic:' + esc(e.id)) + '" data-name="' + esc((e.name + ' ' + e.group).toLowerCase()) + '"><i class="ic">' + e.icon + '</i><span><b>' + esc(e.name) + '</b><small>' + (e.kind === 'room' ? 'its own room' : e.kind === 'settings' ? 'in Settings' : e.kind === 'classic' ? 'Classic page' : 'opens in the studio') + '</small></span>' + (e.real ? '<em class="real">REAL</em>' : '') + '</button>';
    const off = list.filter(f => f.state === 'off'), G = ['Trading desk', 'Strategy bots', 'Overview', 'Scanners & research', 'Settings & safety'];
    box.querySelector('#trBotsItems').innerHTML = G.map(g => { const l = E.filter(e => e.group === g); return l.length ? '<small class="suOffT">' + g.toUpperCase() + ' · ' + l.length + '</small>' + l.map(e => e.kind === 'bot' && e.f ? item(e.f) : page(e)).join('') : ''; }).join('') + (off.length ? '<small class="suOffT">SWITCHED OFF · ' + off.length + '</small>' + off.map(item).join('') : '');
    this.findBots(); },
  findBots(){ const w = this.q.toLowerCase().split(/\s+/).filter(Boolean); document.querySelectorAll('#trBotsItems .suItem').forEach(b => { b.hidden = !w.every(x => b.dataset.name.includes(x)); }); },
  botClick(e){ const b = e.target.closest('[data-sb]'); if (!b || typeof Face === 'undefined') return; const i = b.dataset.sb.indexOf(':'), k = b.dataset.sb.slice(0, i), v = b.dataset.sb.slice(i + 1);
    if (k === 'pick') Face.studio(v); else if (k === 'room') Face.go(v); else if (k === 'settings') Face.go('settings'); else if (k === 'classic'){ Face._raw = true; try { Face.bot(v); } finally { setTimeout(() => { Face._raw = false; }, 400); } } },
};
(function(){ let n = 0; const go = () => { let ok = false; try { ok = SideTrade.init() !== false; } catch(e){ console.warn('side trade', e); ok = true; } if (!ok && ++n < 20) setTimeout(go, 800); }; if (document.readyState !== 'loading') setTimeout(go, 2400); else document.addEventListener('DOMContentLoaded', () => setTimeout(go, 2400)); })();
