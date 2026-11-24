/* ASTRA · Markets Terminal — the Live Desk as a launch sequence.

   Classic's "Live connection & safety" is one page fourteen thousand pixels long. Here the same
   page is laid out as the road real money actually travels:

       Link  →  Money  →  Exits  →  Bots  →  Arm  →  Watch  →  Records

   One station is open at a time; the rail on top shows where each stands (it reads the desk's own
   four gates: Bridge, Code, Desk armed, Real money) and which step comes next. STOP EVERYTHING
   and the link status ride along under the rail at every station. "Show everything" lays the whole
   page out again, with its layout tools.

   This file DRAWS and ARRANGES only. Every control is still Classic's own element inside the page
   body the studio moved here (BotStudio.embed): the stations are made by showing and hiding those
   elements with a data attribute and the stylesheet, never by copying or re-wiring them. Nothing
   here calls a function that arms a bot, changes a limit or sends, closes or changes an order. */
'use strict';
const LiveDeck = window.LiveDeck = {
  KEY: 'astra_deck', st: 'link', on: false, timer: 0, _sig: '',
  STATIONS: [
    { id: 'link', n: 'Link', icon: '🔌', title: 'Link to your account', text: 'ASTRA only reads your account until the live bridge is running and you have entered its code. Closing that window stops live trading at once.' },
    { id: 'money', n: 'Money', icon: '💰', title: 'Bot money', text: 'How much of your balance the bots may use, what one trade may risk, and what that money can really afford.' },
    { id: 'exits', n: 'Exits', icon: '🎯', title: 'Exit rules', text: 'How every real trade of the desk is closed.' },
    { id: 'bots', n: 'Bots', icon: '🤖', title: 'Which bots, and where', text: 'The bots that may trade with real money, and where each one may trade.' },
    { id: 'arm', n: 'Arm', icon: '🛡️', title: 'Arm the desk', text: 'Arming starts in shadow: orders are recorded, not sent. Real money has its own typed confirmation.' },
    { id: 'watch', n: 'Watch', icon: '📈', title: 'What is happening', text: 'The desk’s pulse, your real open trades, and how each bot has done with real money.' },
    { id: 'records', n: 'Records', icon: '📜', title: 'Records', text: 'Everything the desk did and refused, and your notes.' },
  ],
  esc(s){ return TmSettings.esc(s); },
  body(){ const b = document.getElementById('botBody'), h = document.getElementById('suFullHost'); return b && h && h.contains(b) ? b : null; },
  head(){ return document.querySelector('#suFull .suFullH'); },

  /* called by the studio each time it shows a page: the deck belongs to the live desk only */
  sync(id){ if (id === 'live') this.mount(); else this.unmount(); },
  mount(){ const b = this.body(), h = this.head(); if (!b || !h) return; try { const s = localStorage.getItem(this.KEY); if (s && (s === 'all' || this.STATIONS.some(x => x.id === s))) this.st = s; } catch(e){}
    if (!h.dataset.plain) h.dataset.plain = h.innerHTML; h.classList.add('dkHead'); this.on = true; this._sig = ''; b.dataset.deck = this.st;
    if (!h._dk){ h._dk = true; h.addEventListener('click', e => { const n = e.target.closest('[data-dk]'); if (n && this.on) this.set(n.dataset.dk); });
      /* the desk's own "Next step" button leads to a station too */
      document.addEventListener('click', e => { if (!this.on || !e.target.closest) return; const nx = e.target.closest('#suFullHost .ldNextStep, #suFullHost .ldGate, #suFullHost .ldGatesMini button'); if (!nx) return; const g = nx.dataset.ldgate || ((this.body() || document).querySelector('.ldGate.next') || {}).dataset; const key = typeof g === 'string' ? g : g && g.ldgate; if (key) setTimeout(() => this.set(key === 'arm' || key === 'live' ? 'arm' : 'link'), 60); }); }
    if (!h._ro && 'ResizeObserver' in window){ h._ro = new ResizeObserver(() => this.measure()); h._ro.observe(h); }
    this.paint(); clearInterval(this.timer); this.timer = setInterval(() => { if (this.on && this.body() && !document.hidden) this.paint(); else if (this.on && !this.body()) this.unmount(); }, 1500); },
  unmount(){ clearInterval(this.timer); const h = this.head(), b = document.getElementById('botBody'); if (b) delete b.dataset.deck; if (h && h.dataset.plain != null){ h.innerHTML = h.dataset.plain; h.classList.remove('dkHead'); } this.on = false; },
  set(id){ this.st = id; try { localStorage.setItem(this.KEY, id); } catch(e){} const b = this.body(); if (b) b.dataset.deck = id; this._sig = ''; this.paint(); const f = document.getElementById('suFull'); if (f) TmSettings.scrollTo(document.getElementById('suMain'), f); },

  /* ---------- where each station stands: read from the desk's own gates and from Live, never written ---------- */
  facts(){ const b = this.body(), q = s => b && b.querySelector(s), txt = el => el ? (el.textContent || '').trim().replace(/\s+/g, ' ') : '', gate = k => { const g = q('.ldGate[data-ldgate="' + k + '"]'); return { on: !!g && g.classList.contains('on'), next: !!g && g.classList.contains('next'), s: txt(g && g.querySelector('span')) }; };
    const G = { bridge: gate('bridge'), code: gate('code'), arm: gate('arm'), live: gate('live') }; let armed = 0, audit = 0, status = { label: '' }; try { armed = Live.armedList().length; audit = (Live.state.audit || []).length; status = Live.status() || status; } catch(e){}
    const pool = txt(q('.ldPool b')), who = txt(q('.ldArmWho b')), noBot = /^no bot/i.test(who), stop = q('.lvBanner .bBtn.kill');
    return { G, armed, audit, status, pool, who, noBot, stopOff: !!stop && stop.disabled,
      link: { done: G.bridge.on && G.code.on, next: G.bridge.next || G.code.next, t: !G.bridge.on ? (G.bridge.s || 'bridge not running') : !G.code.on ? 'enter the code' : 'linked' },
      money: { done: /[1-9]/.test(pool), next: false, t: pool ? pool + ' for the bots' : 'not set' },
      exits: { done: null, next: false, t: 'your rules' },
      bots: { done: !!who && !noBot, next: false, t: who ? (noBot ? 'none chosen' : who.slice(0, 26)) : 'choose them' },
      arm: { done: G.arm.on, next: G.arm.next || G.live.next, hot: G.live.on, t: G.live.on ? 'LIVE · real orders' : G.arm.on ? 'armed · shadow' : 'not armed' },
      watch: { done: null, next: false, t: armed ? armed + ' armed' : 'nothing armed' },
      records: { done: null, next: false, t: audit + ' entr' + (audit === 1 ? 'y' : 'ies') } }; },
  paint(){ const h = this.head(), b = this.body(); if (!h || !b) return; if (b.dataset.deck !== this.st) b.dataset.deck = this.st;
    const F = this.facts(), S = this.STATIONS, cur = S.find(x => x.id === this.st), seq = ['link', 'money', 'exits', 'bots', 'arm'], doneN = seq.filter(k => F[k].done).length, sig = JSON.stringify([this.st, S.map(x => [F[x.id].done, F[x.id].next, F[x.id].t, F[x.id].hot]), F.status.label]);
    if (sig !== this._sig){ this._sig = sig;
      h.innerHTML = '<div class="dkTop"><i class="dkGlyph">' + (cur ? cur.icon : '🧭') + '</i><div class="dkTitle"><small>THE LIVE DESK' + (F.status.label ? ' · ' + this.esc(F.status.label) : '') + '</small><b>' + (cur ? cur.title : 'Everything on one page') + '</b><span>' + (cur ? cur.text : 'The whole live desk laid out as one page, with its layout tools: move, fold and resize its parts here.') + '</span></div>' +
          '<button type="button" class="dkAll' + (this.st === 'all' ? ' on' : '') + '" data-dk="' + (this.st === 'all' ? 'link' : 'all') + '" title="' + (this.st === 'all' ? 'Back to one station at a time' : 'The whole page at once, with its layout tools') + '">' + (this.st === 'all' ? 'One station at a time' : 'Show everything') + '</button></div>' +
        '<div class="dkRail"><i class="dkLine"><u style="--p:' + (Math.max(0, doneN - 1) / 6 * 100).toFixed(1) + '%"></u></i>' + S.map((x, i) => { const f = F[x.id]; return '<button type="button" class="dkNode' + (x.id === this.st ? ' on' : '') + (f.done ? ' done' : '') + (f.next ? ' next' : '') + (f.hot ? ' hot' : '') + '" data-dk="' + x.id + '" style="--i:' + i + '" title="' + this.esc(x.title + ': ' + f.t) + '"><span class="dkOrb"><i>' + x.icon + '</i>' + (f.done ? '<u>✓</u>' : f.next ? '<u class="nx">!</u>' : '') + '</span><b>' + x.n + '</b><em>' + this.esc(f.t) + '</em></button>'; }).join('') + '</div>'; }
    /* the safety bar rides just under the rail */
    this.measure(); },
  measure(){ const h = this.head(), b = this.body(); if (h && b) b.style.setProperty('--dkH', Math.max(0, h.offsetHeight - 21) + 'px'); },
};
