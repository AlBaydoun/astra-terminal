/* ASTRA · Markets Terminal — pages as stations (the Live Desk's launch sequence, and the desks built like it).

   A Classic page is one very long scroll. Here the same page is laid out as a few stations with a
   rail on top; one station is open at a time, and "Show everything" lays the whole page out again
   with its layout tools.

     live ...... Link → Money → Exits → Bots → Arm → Watch → Records. A real sequence: the rail reads
                 the desk's own four gates (Bridge, Code, Desk armed, Real money) and the next step
                 pulses. Link status, Refresh and STOP EVERYTHING ride under the rail at every station.
     manual .... Ticket · Rules · Auto · Orders · Results · Notes (your paper desk; not a sequence)
     open ...... Trades · Summary · Notes. The trades are a wall of small cards; press one and it
                 opens wide with its own controls (stop, target, trailing, reduce or close)

   This file DRAWS and ARRANGES only. Every control is still Classic's own element inside the page
   body the studio moved here (BotStudio.embed): a station is made by showing and hiding those
   elements (a data attribute and a class, read by the stylesheet), never by copying or re-wiring
   them. Nothing here calls a function that arms a bot, changes a limit, or sends, closes or changes
   an order, paper or real. */
'use strict';
const LiveDeck = window.LiveDeck = {
  page: '', st: '', on: false, timer: 0, _sig: '',
  PAGES: {
    live: { key: 'astra_deck', eyebrow: 'THE LIVE DESK', seq: ['link', 'money', 'exits', 'bots', 'arm'], css: true, stations: [
      { id: 'link', n: 'Link', icon: '🔌', title: 'Link to your account', text: 'ASTRA only reads your account until the live bridge is running and you have entered its code. Closing that window stops live trading at once.' },
      { id: 'money', n: 'Money', icon: '💰', title: 'Bot money', text: 'How much of your balance the bots may use, what one trade may risk, and what that money can really afford.' },
      { id: 'exits', n: 'Exits', icon: '🎯', title: 'Exit rules', text: 'How every real trade of the desk is closed.' },
      { id: 'bots', n: 'Bots', icon: '🤖', title: 'Which bots, and where', text: 'The bots that may trade with real money, and where each one may trade.' },
      { id: 'arm', n: 'Arm', icon: '🛡️', title: 'Arm the desk', text: 'Arming starts in shadow: orders are recorded, not sent. Real money has its own typed confirmation.' },
      { id: 'watch', n: 'Watch', icon: '📈', title: 'What is happening', text: 'The desk’s pulse, your real open trades, and how each bot has done with real money.' },
      { id: 'records', n: 'Records', icon: '📜', title: 'Records', text: 'Everything the desk did and refused, and your notes.' } ] },
    manual: { key: 'astra_deck_manual', eyebrow: 'YOUR PAPER DESK · PLAY MONEY', stations: [
      { id: 'ticket', n: 'Ticket', icon: '🎫', title: 'The order ticket', text: 'Place a paper trade: choose the instrument and the side, size it, set its stop and its target. The slip on the right shows what it would cost and what it could win or lose.', parts: ['ticket', 'help'] },
      { id: 'rules', n: 'Rules', icon: '📏', title: 'Your trading rules', text: 'The limits every paper trade of yours has to respect.', parts: ['rules'] },
      { id: 'auto', n: 'Auto', icon: '⚙️', title: 'Automatic entries', text: 'Entries the paper account may take by itself.', parts: ['auto'] },
      { id: 'orders', n: 'Orders', icon: '⏳', title: 'Waiting and open', text: 'Your waiting entry orders and the paper trades that are open now.', parts: ['pending', 'positions'] },
      { id: 'results', n: 'Results', icon: '📊', title: 'How you have done', text: 'Your numbers, the running result and every closed paper trade.', parts: ['stats'], sel: ['.botGrid'], rest: true },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes and the paper / real switch', text: 'Your notes on this desk, and the way over to the real-money ticket.', parts: ['notes', 'links'] } ] },
    open: { key: 'astra_deck_open', eyebrow: 'OPEN TRADES', focus: { card: '.otCard', key: 'ot' }, stations: [
      { id: 'trades', n: 'Trades', icon: '🃏', title: 'Every open trade', text: 'One card a trade: what it is, where the price stands between its stop and its target, and what it is worth now. Press a card to open its controls: stop and target, trailing stop, reduce or close.', parts: ['sort', 'filter', 'list'], rest: true },
      { id: 'summary', n: 'Summary', icon: '📋', title: 'The summary', text: 'The numbers of everything open, every trade on one line, and the real positions on your account.', parts: ['stats', 'table', 'real'] },
      { id: 'notes', n: 'Notes', icon: '📝', title: 'Notes', text: 'Your notes on this page and how adjusting a bot’s trade works.', parts: ['notes', 'intro', 'note'] } ] },
  },
  sel: {},
  esc(s){ return TmSettings.esc(s); },
  body(){ const b = document.getElementById('botBody'), h = document.getElementById('suFullHost'); return b && h && h.contains(b) ? b : null; },
  head(){ return document.querySelector('#suFull .suFullH'); },
  cfg(){ return this.PAGES[this.page] || null; },

  /* called by the studio each time it shows a page */
  sync(id){ if (this.PAGES[id]) this.mount(id); else this.unmount(); },
  mount(id){ const b = this.body(), h = this.head(), C = this.PAGES[id]; if (!b || !h || !C) return; if (this.on && this.page !== id) this.unmount(); this.page = id; this.st = C.stations[0].id; try { const s = localStorage.getItem(C.key); if (s && (s === 'all' || C.stations.some(x => x.id === s))) this.st = s; } catch(e){}
    if (!h.dataset.plain) h.dataset.plain = h.innerHTML; h.classList.add('dkHead'); this.on = true; this._sig = ''; b.dataset.deck = this.st; b.dataset.deckpage = id;
    if (!h._dk){ h._dk = true; h.addEventListener('click', e => { const n = e.target.closest('[data-dk]'); if (n && this.on) this.set(n.dataset.dk); }); }
    if (!this._doc){ this._doc = true;
      /* the live desk's own "Next step" button and gate chips lead to a station too */
      document.addEventListener('click', e => { if (!this.on || this.page !== 'live' || !e.target.closest) return; const nx = e.target.closest('#suFullHost .ldNextStep, #suFullHost .ldGate, #suFullHost .ldGatesMini button'); if (!nx) return; const key = nx.dataset.ldgate || (((this.body() || document).querySelector('.ldGate.next') || {}).dataset || {}).ldgate; if (key) setTimeout(() => this.set(key === 'arm' || key === 'live' ? 'arm' : 'link'), 60); });
      /* a wall of cards: press one (not one of its controls) and it opens wide; press its top again to put it back */
      document.addEventListener('click', e => { const C = this.cfg(); if (!this.on || !C || !C.focus || !e.target.closest) return; const card = e.target.closest('#suFullHost ' + C.focus.card); if (!card) return; const open = card.classList.contains('dkSel');
        if (e.target.closest('button, input, select, textarea, a, label')) return;   /* a control keeps its own job */
        if (open && !e.target.closest('.otHead')) return;                             /* an open card closes from its top only */
        if (!open && e.target.closest('.wsPriceRail')) return;                        /* dragging a level is not a press */
        this.sel[this.page] = open ? '' : card.dataset[C.focus.key]; this.applyFocus();
        if (!open) setTimeout(() => { const c = this.body() && this.body().querySelector(C.focus.card + '.dkSel'), m = document.getElementById('suMain'), h = this.head(); if (c && m) m.scrollTop = c.getBoundingClientRect().top - m.getBoundingClientRect().top + m.scrollTop - (h ? h.offsetHeight : 0) - 6; }, 40); });
      /* Classic draws its page again from time to time: the stations are put back on it at once */
      if (typeof Bots !== 'undefined' && !Bots._dkWrapped){ Bots._dkWrapped = true; const o = Bots.render.bind(Bots); Bots.render = (...a) => { const r = o(...a); try { if (this.on && this.body()) this.apply(); } catch(e){} return r; }; } }
    if (C.focus && !b._dkMo){ b._dkMo = new MutationObserver(() => { if (this._moT) return; this._moT = requestAnimationFrame(() => { this._moT = 0; if (this.on && this.body()) this.apply(); }); }); b._dkMo.observe(b, { childList: true, subtree: true }); }
    if (!h._ro && 'ResizeObserver' in window){ h._ro = new ResizeObserver(() => this.measure()); h._ro.observe(h); }
    this.paint(); clearInterval(this.timer); this.timer = setInterval(() => { if (this.on && this.body() && !document.hidden) this.paint(); else if (this.on && !this.body()) this.unmount(); }, 1500); },
  unmount(){ clearInterval(this.timer); const h = this.head(), b = document.getElementById('botBody'); if (b){ delete b.dataset.deck; delete b.dataset.deckpage; b.querySelectorAll('[data-dkst]').forEach(el => { delete el.dataset.dkst; el.classList.remove('dkOn'); }); } if (h && h.dataset.plain != null){ h.innerHTML = h.dataset.plain; h.classList.remove('dkHead'); } this.on = false; this.page = ''; },
  set(id){ const C = this.cfg(); if (!C) return; this.st = id; try { localStorage.setItem(C.key, id); } catch(e){} this._sig = ''; this.paint(); const f = document.getElementById('suFull'); if (f) TmSettings.scrollTo(document.getElementById('suMain'), f); },

  /* which of the page's own parts belong to which station (pages laid out by BotLayout parts) */
  apply(){ const b = this.body(), C = this.cfg(); if (!b || !C) return; if (b.dataset.deck !== this.st) b.dataset.deck = this.st; if (b.dataset.deckpage !== this.page) b.dataset.deckpage = this.page; if (C.css) return;
    const rest = (C.stations.find(s => s.rest) || C.stations[C.stations.length - 1]).id, parts = [...b.querySelectorAll('.blPart[data-blpart]')].filter(p => !p.parentElement.closest('.blPart'));
    for (const p of parts){ const s = C.stations.find(x => (x.parts || []).includes(p.dataset.blpart)), v = s ? s.id : rest; if (p.dataset.dkst !== v) p.dataset.dkst = v; }
    for (const s of C.stations) for (const q of s.sel || []) b.querySelectorAll(q).forEach(el => { if (!el.closest('.blPart')) el.dataset.dkst = s.id; });
    b.querySelectorAll('[data-dkst]').forEach(el => { const on = this.st === 'all' || el.dataset.dkst === this.st; if (el.classList.contains('dkOn') !== on) el.classList.toggle('dkOn', on); }); this.applyFocus(); },
  applyFocus(){ const b = this.body(), C = this.cfg(); if (!b || !C || !C.focus) return; const k = this.sel[this.page] || ''; b.querySelectorAll(C.focus.card).forEach(c => { const on = !!k && c.dataset[C.focus.key] === k; if (c.classList.contains('dkSel') !== on) c.classList.toggle('dkSel', on); }); },

  /* ---------- where each station stands: read, never written ---------- */
  facts(){ return this.page === 'live' ? this.factsLive() : this.page === 'manual' ? this.factsManual() : this.page === 'open' ? this.factsOpen() : {}; },
  factsOpen(){ let n = 0, fl = 0, up = 0; try { for (const p of Pages.openPaper()){ n++; fl += p.unreal || 0; if (p.unreal > 0) up++; } } catch(e){} let real = 0; try { real = (Pages._pos || []).length; } catch(e){}
    return { _label: n + ' open', trades: { t: up + ' ahead · ' + (n - up) + ' behind' }, summary: { t: 'floating ' + (fl >= 0 ? '+' : '−') + TmSettings.num(Math.abs(fl)) + (real ? ' · ' + real + ' real' : '') }, notes: { t: 'yours' } }; },
  factsLive(){ const b = this.body(), q = s => b && b.querySelector(s), txt = el => el ? (el.textContent || '').trim().replace(/\s+/g, ' ') : '', gate = k => { const g = q('.ldGate[data-ldgate="' + k + '"]'); return { on: !!g && g.classList.contains('on'), next: !!g && g.classList.contains('next'), s: txt(g && g.querySelector('span')) }; };
    const G = { bridge: gate('bridge'), code: gate('code'), arm: gate('arm'), live: gate('live') }; let armed = 0, audit = 0, status = { label: '' }; try { armed = Live.armedList().length; audit = (Live.state.audit || []).length; status = Live.status() || status; } catch(e){}
    const pool = txt(q('.ldPool b')), who = txt(q('.ldArmWho b')), noBot = /^no bot/i.test(who);
    return { _label: status.label,
      link: { done: G.bridge.on && G.code.on, next: G.bridge.next || G.code.next, t: !G.bridge.on ? (G.bridge.s || 'bridge not running') : !G.code.on ? 'enter the code' : 'linked' },
      money: { done: /[1-9]/.test(pool), t: pool ? pool + ' for the bots' : 'not set' },
      exits: { t: 'your rules' },
      bots: { done: !!who && !noBot, t: who ? (noBot ? 'none chosen' : who.slice(0, 26)) : 'choose them' },
      arm: { done: G.arm.on, next: G.arm.next || G.live.next, hot: G.live.on, t: G.live.on ? 'LIVE · real orders' : G.arm.on ? 'armed · shadow' : 'not armed' },
      watch: { t: armed ? armed + ' armed' : 'nothing armed' },
      records: { t: audit + ' entr' + (audit === 1 ? 'y' : 'ies') } }; },
  factsManual(){ let L = {}, wait = 0; try { L = Bots.ledger('manual') || {}; } catch(e){} try { if (typeof ManualOrders !== 'undefined') wait = ManualOrders.read().filter(o => ['waiting', 'processing', 'review'].includes(o.status)).length; } catch(e){}
    const b = this.body(), side = b && b.querySelector('.sideBtn.on'), sym = b && b.querySelector('#mbSym'), open = (L.open || []).length, closed = (L.closed || []).length, eq = Number.isFinite(L.equity) ? L.equity : null;
    return { _label: eq != null ? 'equity ' + TmSettings.num(eq) : '',
      ticket: { t: (side ? (side.textContent || '').trim().toLowerCase() + ' ' : '') + (sym ? (sym.textContent || '').replace('▾', '').trim() : '') },
      rules: { t: 'your limits' }, auto: { t: 'by itself' },
      orders: { t: open + ' open · ' + wait + ' waiting' },
      results: { t: closed + ' closed trade' + (closed === 1 ? '' : 's') }, notes: { t: 'yours' } }; },
  paint(){ const h = this.head(), b = this.body(), C = this.cfg(); if (!h || !b || !C) return; this.apply();
    const F = this.facts(), S = C.stations, cur = S.find(x => x.id === this.st), seq = C.seq || [], doneN = seq.filter(k => F[k] && F[k].done).length, f = id => F[id] || {}, sig = JSON.stringify([this.page, this.st, S.map(x => [f(x.id).done, f(x.id).next, f(x.id).t, f(x.id).hot]), F._label]);
    if (sig !== this._sig){ this._sig = sig;
      h.innerHTML = '<div class="dkTop"><i class="dkGlyph">' + (cur ? cur.icon : '🧭') + '</i><div class="dkTitle"><small>' + C.eyebrow + (F._label ? ' · ' + this.esc(F._label) : '') + '</small><b>' + (cur ? cur.title : 'Everything on one page') + '</b><span>' + (cur ? cur.text : 'The whole page laid out at once, with its layout tools: move, fold and resize its parts here.') + '</span></div>' +
          '<button type="button" class="dkAll' + (this.st === 'all' ? ' on' : '') + '" data-dk="' + (this.st === 'all' ? S[0].id : 'all') + '" title="' + (this.st === 'all' ? 'Back to one station at a time' : 'The whole page at once, with its layout tools') + '">' + (this.st === 'all' ? 'One station at a time' : 'Show everything') + '</button></div>' +
        '<div class="dkRail' + (seq.length ? ' seq' : '') + '" style="--n:' + S.length + '">' + (seq.length ? '<i class="dkLine"><u style="--p:' + (Math.max(0, doneN - 1) / (S.length - 1) * 100).toFixed(1) + '%"></u></i>' : '') + S.map((x, i) => { const s = f(x.id); return '<button type="button" class="dkNode' + (x.id === this.st ? ' on' : '') + (s.done ? ' done' : '') + (s.next ? ' next' : '') + (s.hot ? ' hot' : '') + '" data-dk="' + x.id + '" style="--i:' + i + '" title="' + this.esc(x.title + (s.t ? ': ' + s.t : '')) + '"><span class="dkOrb"><i>' + x.icon + '</i>' + (seq.length && s.done ? '<u>✓</u>' : s.next ? '<u class="nx">!</u>' : '') + '</span><b>' + x.n + '</b><em>' + this.esc(s.t || '') + '</em></button>'; }).join('') + '</div>'; }
    this.measure(); },
  /* the safety bar rides just under the rail */
  measure(){ const h = this.head(), b = this.body(); if (h && b) b.style.setProperty('--dkH', Math.max(0, h.offsetHeight - 21) + 'px'); },
};
