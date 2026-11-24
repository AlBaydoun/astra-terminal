/* ASTRA · Markets Terminal — the Bot Studio: one strategy bot, drawn for the new look.

   On the left, every strategy bot as in All bots (its state, a small equity curve, its result):
   pick one and the studio turns to it. On the right, that bot:
     · who it is: its guide (what it looks for, how it exits), its state, the switches
     · how it has done: net result, share won, trades, average R, profit factor, deepest drop
     · its running result, the spread of its wins and losses in R, how its trades ended
     · in 3D: its result by weekday and hour (a city), and its instruments (a galaxy)
     · what it holds now, its last trades (each opens in Replay), what it learned
   Everything is drillable: a bar, a tower, a sphere or a trade opens the matching view.

   The switches call the same functions as the Classic page (Bots.setDisabled, Bots.setPaused,
   Bots.resetBot). Its settings are still changed on the Classic page, one click away. Nothing here
   arms a bot for real money or sends an order. */
'use strict';
const BotStudio = window.BotStudio = {
  host: null, id: '', q: '', timer: 0, _sig: '',
  esc(s){ return TmSettings.esc(s); }, num(v, d){ return TmSettings.num(v, d); },
  sg(v, d){ if (v == null || !isFinite(v)) return '–'; const z = Math.abs(v) < 0.5 * Math.pow(10, -(d || 0)); return (z ? '' : v > 0 ? '+' : '−') + this.num(Math.abs(v), d || 0); },
  cls(v){ return v > 0 ? 'up' : v < 0 ? 'dn' : ''; },
  sym(s){ return String(s || '').replace(/\.(s|m|std)$/i, ''); },
  /* the bots that get a studio: the strategy bots of All bots */
  isStrategy(id){ try { const b = (typeof BOT_BY_ID !== 'undefined' && BOT_BY_ID[id]) || (Bots.offBots ? Bots.offBots().find(x => x.id === id) : null); return !!b && TmSettings.strategy(b); } catch(e){ return false; } },
  /* everything that has a view here: a paper bot's studio, or one of the pages (js/tmpages.js) */
  has(id){ return this.isStrategy(id) || (typeof Pages !== 'undefined' && !!Pages.VIEWS[id]); },
  ROOMS: { dash: 'dash', explorer: 'deep', livedive: 'livedive', liveManual: 'live' },
  entries(){ const facts = new Map(this.list().map(f => [f.id, f])), hid = typeof WorkspaceUI !== 'undefined' && WorkspaceUI.hidden ? WorkspaceUI.hidden() : [], out = [];
    const src = (Bots.ordered ? Bots.ordered(BOTS) : BOTS).filter(b => !Bots.disabled(b.id) && !hid.includes(b.id));
    for (const b of src){ const V = typeof Pages !== 'undefined' && Pages.VIEWS[b.id];
      out.push({ id: b.id, name: TmSettings.name(b), group: typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.group(b) : 'Strategy bots', real: !!b.live, f: facts.get(b.id) || null, kind: V ? 'page' : this.ROOMS[b.id] ? 'room' : facts.has(b.id) ? 'bot' : 'classic', icon: V ? V.icon : ({ dash: '▦', explorer: '🪆', livedive: '🪆', liveManual: '●' })[b.id] || '◇' }); }
    if (!hid.includes('permissions')) out.push({ id: 'permissions', name: 'Instrument permissions', group: 'Settings & safety', kind: 'page', icon: '🔐' });
    out.push({ id: 'botsettings', name: 'Bots on / off', group: 'Settings & safety', kind: 'settings', icon: '⚙' });
    return out; },
  list(){ return TmSettings.bots().filter(f => this.isStrategy(f.id)); },
  guide(id){ try { return (typeof BotGuide !== 'undefined' && BotGuide.G && BotGuide.G[id]) || null; } catch(e){ return null; } },
  art(g){ try { return g && g.art && BotGuide.ART && BotGuide.ART[g.art] ? BotGuide.ART[g.art] : ''; } catch(e){ return ''; } },

  async show(stage, id){ let h = document.getElementById('tmStudio'); if (!h){ h = document.createElement('div'); h.id = 'tmStudio'; stage.appendChild(h); h.addEventListener('click', e => this.click(e)); h.addEventListener('change', e => { const s = e.target.closest('[data-u^="power:"]'); if (s) this.power(s.dataset.u.slice(6), s); }); h.addEventListener('input', e => { if (e.target.id === 'suFind'){ this.q = e.target.value; this.filterRail(); } }); }
    h.hidden = false; this.host = h; this._railShown = false; const list = this.list(); const ok = x => !!x && ((typeof Pages !== 'undefined' && !!Pages.VIEWS[x]) || list.some(f => f.id === x)); this.id = ok(id) ? id : ok(this.id) ? this.id : (list.find(f => f.state !== 'off') || list[0] || {}).id || '';
    this.release();   /* the page body must be out of the studio before its frame is drawn again */
    h.innerHTML = '<div class="suWrap"><aside class="suRail" id="suRail"></aside><main class="suMain" id="suMain"><div class="suView" id="suView"><div class="suLoad"><i></i>Reading the trades…</div></div><section class="suFull" id="suFull" hidden><header class="suFullH"><i>⌘</i><div><b>All controls</b><span>the page itself: every button, form, switch and typed confirmation it has</span></div></header><div id="suFullHost"></div></section></main></div>'; this._shown = ''; this.paintRail(); this.embed();   /* the controls first: they do not wait for the trades to be read */
    if (typeof Autopsy !== 'undefined' && !(Autopsy.trades || []).length){ try { await Autopsy.collect(); } catch(e){} }
    this._sig = ''; this.paint(); this.embed();
    clearInterval(this.timer); this.timer = setInterval(() => { if (this.host && this.host.isConnected && !this.host.hidden && this.host.offsetParent !== null && !document.hidden){ this.paintRail(); this.paint(); } }, 8000); },
  pick(id){ this.id = id; this._sig = ''; this._railShown = true; this.paintRail(); this.paint(); this.embed(); const m = document.getElementById('suMain'); if (m) m.scrollTop = 0; },

  /* ---------- every function of the page ----------
     Classic's own page body (#botBody) is MOVED under the pictures, never copied or rewritten: every button, form,
     switch and typed gate is the same element with the same code it has always had. Arming a bot, the limits, STOP
     EVERYTHING, the paper ticket, training, studies: all of it works here exactly as on the Classic page, because it IS
     that page. It is put back where it came from the moment you leave the studio. */
  embed(){ const host = document.getElementById('suFullHost'), sec = document.getElementById('suFull'), body = document.getElementById('botBody'); if (!host || !sec || !body || typeof Bots === 'undefined') return;
    const id = this.id, ok = id === 'permissions' || (typeof BOT_BY_ID !== 'undefined' && !!BOT_BY_ID[id]); sec.hidden = !ok; if (!ok){ this.release(); this._shown = ''; return; }
    const deck = () => { try { if (typeof LiveDeck !== 'undefined') LiveDeck.sync(id); } catch(e){ console.warn('deck', e); } };
    if (body.parentElement !== host){ this._home = { parent: body.parentElement, next: body.nextSibling }; host.appendChild(body); }
    if (!Bots._suFollow){ Bots._suFollow = true; const o = Bots.render.bind(Bots); Bots.render = (...a) => { const r = o(...a); try { BotStudio.follow(); } catch(e){} return r; }; }
    if (this._shown !== id || Bots.active !== id){ this._shown = id; Bots.active = id; try { if (Bots.renderNav) Bots.renderNav(); Bots.render(); } catch(e){ console.warn('studio embed', e); } } deck(); },
  /* a button of the page itself can open another page (the scanner's "Open Confluence bot"): the studio goes with it,
     so the pictures and the stations on screen always belong to the page under them */
  follow(){ const here = () => { const b = document.getElementById('botBody'), h = document.getElementById('suFullHost'); return !!(b && h && h.contains(b)); }; if (this._fw || !here() || Bots.active === this.id) return; this._fw = true;
    setTimeout(() => { this._fw = false; const id = Bots.active; if (!here() || id === this.id) return; const rm = id === 'botsettings' ? 'settings' : this.ROOMS[id]; if (rm) Face.go(rm); else if (this.has(id)) this.pick(id); }, 0); },
  release(){ try { if (typeof LiveDeck !== 'undefined' && LiveDeck.on) LiveDeck.unmount(); } catch(e){}
    const body = document.getElementById('botBody'), h = this._home || {}, st = document.getElementById('tmStudio'); this._shown = ''; if (!body || !st || !st.contains(body)) return;
    /* back where it came from; if that place is gone, back into Classic's own Bots panel: it is never left inside the studio */
    const home = h.parent && h.parent.isConnected && !st.contains(h.parent) ? h.parent : document.querySelector('#bot-bots .botsWrap'); if (!home) return;
    try { home.insertBefore(body, h.next && h.next.parentNode === home ? h.next : null); } catch(e){ home.appendChild(body); } },

  /* ---------- the rail: All bots, as in the menu ---------- */
  paintRail(){ const r = document.getElementById('suRail'); if (!r) return; const list = this.list(), E = this.entries(), keep = r.querySelector('#suFind'), focus = keep && document.activeElement === keep;
    const item = f => { const ch = f.eq - f.start; return '<button type="button" class="suItem ' + f.state + (f.id === this.id ? ' on' : '') + '" data-u="pick:' + this.esc(f.id) + '" data-name="' + this.esc((f.name + ' ' + f.tf + ' ' + f.state).toLowerCase()) + '"><i></i><span><b>' + this.esc(f.name) + '</b><small>' + (f.tf ? this.esc(f.tf) + ' · ' : '') + f.trades + ' trades</small></span>' + TmSettings.spark(f.curve, 64, 22, null, 'r' + f.id) + '<em class="' + this.cls(ch) + '">' + this.sg(ch, 0) + '</em></button>'; };
    const page = e => '<button type="button" class="suItem pg' + (e.id === this.id ? ' on' : '') + '" data-u="' + (e.kind === 'page' ? 'pick:' + this.esc(e.id) : e.kind === 'room' ? 'room:' + this.ROOMS[e.id] : e.kind === 'settings' ? 'settings:1' : 'classic:' + this.esc(e.id)) + '" data-name="' + this.esc((e.name + ' ' + e.group).toLowerCase()) + '"><i class="ic">' + e.icon + '</i><span><b>' + this.esc(e.name) + '</b><small>' + (e.kind === 'classic' ? 'Classic page ↗' : e.kind === 'room' ? 'its own room →' : e.kind === 'settings' ? 'in Settings →' : 'new look') + '</small></span>' + (e.real ? '<em class="real">REAL</em>' : '') + '</button>';
    const off = list.filter(f => f.state === 'off'), G = ['Overview', 'Trading desk', 'Scanners & research', 'Strategy bots', 'Settings & safety'];
    if (!keep){ r.innerHTML = '<div class="suRailHead"><small>ALL BOTS</small><b>Every page and bot</b><input type="search" id="suFind" placeholder="Find a page or a bot…" value="' + this.esc(this.q) + '"></div><div class="suItems" id="suItems"></div><button type="button" class="suRailFoot" data-u="settings:1">⚙ Bots on / off in Settings</button>'; }
    r.querySelector('#suItems').innerHTML = G.map(g => { const l = E.filter(e => e.group === g); return l.length ? '<small class="suOffT">' + g.toUpperCase() + ' · ' + l.length + '</small>' + l.map(e => e.kind === 'bot' && e.f ? item(e.f) : page(e)).join('') : ''; }).join('') + (off.length ? '<small class="suOffT">SWITCHED OFF · ' + off.length + '</small>' + off.map(item).join('') : '');
    this.filterRail(); if (focus) keep.focus(); const cur = r.querySelector('.suItem.on'); if (cur && !this._railShown){ this._railShown = true; cur.scrollIntoView({ block: 'nearest' }); } },
  filterRail(){ const w = this.q.toLowerCase().split(/\s+/).filter(Boolean); document.querySelectorAll('#suItems .suItem').forEach(b => { b.hidden = !w.every(x => b.dataset.name.includes(x)); }); },

  /* ---------- the numbers of one bot ---------- */
  trades(id){ return ((typeof Autopsy !== 'undefined' && Autopsy.trades) || []).filter(t => t.src === 'paper' && t.bot === id); },
  stat(list){ return typeof Info !== 'undefined' ? Info.stat(list) : { n: list.length, w: 0, wr: 0, net: 0, pf: 0, avgR: null, dd: 0, curve: [] }; },
  group(list, key){ const m = new Map(); for (const t of list){ const k = key(t); if (k == null) continue; let g = m.get(k); if (!g) m.set(k, g = { k, n: 0, w: 0, net: 0 }); g.n++; if (t.pnl > 0) g.w++; g.net += t.pnl; } return [...m.values()]; },
  reason(t){ return typeof Info !== 'undefined' ? Info.reasonOf(t) : 'Other'; },

  paint(){ const main = document.getElementById('suView'); if (!main) return;
    if (typeof Pages !== 'undefined' && Pages.VIEWS[this.id]){ Pages.paint(this.id, main, this._sig !== 'page:' + this.id); this._sig = 'page:' + this.id; return; }
    const f = this.list().find(x => x.id === this.id);
    if (!f){ main.innerHTML = '<div class="suEmpty big">Pick a bot on the left.</div>'; return; }
    const T = this.trades(f.id), S = this.stat(T), L = f.state === 'off' ? null : Bots.ledger(f.id), open = (L && L.open) || [], sig = [f.id, f.state, f.live, T.length, Math.round(S.net), open.length, open.map(p => Math.round(p.unreal || 0)).join(',')].join('|');
    if (sig === this._sig) return; this._sig = sig;
    const g = this.guide(f.id) || {}, ch = f.eq - f.start, off = f.state === 'off', id = this.esc(f.id);
    const kpi = (k, v, sub, cls, extra) => '<div class="suKpi ' + (cls || '') + '">' + (extra || '') + '<div><small>' + k + '</small><b>' + v + '</b><span>' + sub + '</span></div></div>';
    const exits = this.group(T, t => this.reason(t)).sort((a, b) => b.n - a.n), syms = this.group(T, t => this.sym(t.sym)).sort((a, b) => b.net - a.net), sides = this.group(T, t => t.dir > 0 ? 'Buys' : 'Sells');
    const recent = T.slice().sort((a, b) => b.t1 - a.t1).slice(0, 14), lessons = ((L && L.lessons) || []).slice(0, 4);
    main.innerHTML =
      /* who it is */
      '<section class="suHero ' + f.state + '"><div class="suGlow"></div><div class="suHeroL"><div class="suIcon">' + this.esc(g.icon || '◈') + '</div><div><small class="suFam">STRATEGY BOT' + (f.tf ? ' · ' + this.esc(f.tf) : '') + '</small><h1>' + this.esc(f.name) + '</h1>' +
        '<p>' + this.esc(g.tagline || 'A paper bot that trades by its own rules.') + '</p><div class="suTags"><span class="suPill ' + f.state + '"><i></i>' + TmSettings.LABEL[f.state] + '</span>' + (f.live ? '<span class="suPill armed ' + f.live + '">' + (f.live === 'live' ? 'armed · LIVE' : 'armed · shadow') + '</span>' : '') + (g.tags || []).map(t => '<span>' + this.esc(t) + '</span>').join('') + '</div></div></div>' +
        '<div class="suCtl"><label class="crSw big" title="' + (off ? 'Switch this bot on' : 'Switch this bot off: it leaves every list; its record is kept') + '"><input type="checkbox" data-u="power:' + id + '"' + (off ? '' : ' checked') + '><i></i></label><span class="suCtlL">' + (off ? 'Off' : 'On') + '</span>' +
          (off ? '' : '<button type="button" class="crBtn' + (f.state === 'paused' ? ' am' : '') + '" data-u="pause:' + id + '">' + (f.state === 'paused' ? '▶ Resume' : '❚❚ Pause') + '</button>') + (f.state === 'locked' ? '<button type="button" class="crBtn dn" data-u="reset:' + id + '">↺ Reset to ' + this.num(f.start) + '</button>' : '') +
          '<button type="button" class="crBtn ghost" data-guide="' + id + '">How it works</button>' + (off ? '' : '<button type="button" class="crBtn" data-u="full:1" title="Every setting, the ledger and the notes, below">Settings &amp; ledger ↓</button>') + '<button type="button" class="crBtn go" data-u="dive:' + id + '">Deep Dive →</button></div></section>' +
      /* how it has done */
      '<section class="suKpis">' + kpi('NET RESULT · PAPER', '<span data-count="' + Math.abs(Math.round(S.net)) + '" data-pre="' + (S.net >= 0 ? '+' : '−') + '">' + (S.net >= 0 ? '+' : '−') + '0</span>', 'equity ' + this.num(f.eq) + ' · ' + (ch >= 0 ? '+' : '−') + Math.abs(f.start ? ch / f.start * 100 : 0).toFixed(1) + '%', 'wide ' + this.cls(S.net), TmSettings.spark(f.curve, 200, 46, null, 'k' + f.id)) +
        kpi('WON', S.n ? Math.round(S.wr) + '%' : '–', S.w + ' of ' + S.n + ' trades', '', TmSettings.ring(S.wr, S.wr >= 50 ? '#3DDC97' : '#FFB648', 54)) +
        kpi('TRADES', '<span data-count="' + S.n + '">0</span>', open.length + ' open now') +
        kpi('AVERAGE A TRADE', S.avgR != null ? this.sg(S.avgR, 2) + 'R' : S.n ? this.sg(S.net / S.n, 1) : '–', S.avgR != null ? 'in R: 1R = what it risked' : 'in money', this.cls(S.avgR != null ? S.avgR : S.net)) +
        kpi('PROFIT FACTOR', S.n ? (S.pf >= 99 ? '∞' : S.pf.toFixed(2)) : '–', 'won ÷ lost · above 1 earns', S.pf >= 1 ? 'up' : S.n ? 'dn' : '') +
        kpi('DEEPEST DROP', S.dd ? '−' + this.num(S.dd) : '–', 'from a high to the low after it', S.dd ? 'dn' : '') + '</section>' +
      /* the curve and how it trades */
      '<section class="suRow two"><div class="suCard"><h3>Running result<small>every closed trade · red = time under an earlier high</small></h3><canvas id="suCurve" class="suCv"></canvas></div>' +
        '<div class="suCard suHow"><h3>How it trades<small>from its guide</small></h3>' + (this.art(g) ? '<div class="suArt">' + this.art(g) + '</div>' : '') + '<div class="suSteps">' + ((g.steps || []).map((s, i) => '<div class="suStep" style="--i:' + i + '"><i>' + this.esc(s[0]) + '</i><div><b>' + this.esc(s[1]) + '</b><span>' + this.esc(s[2]) + '</span></div></div>').join('') || '<div class="suEmpty">No guide written for this bot yet. Its Classic page has every rule.</div>') + '</div></div></section>' +
      /* 3D */
      '<section class="suRow two"><div class="suCard"><h3>When it earns<small>weekday by hour, your computer’s clock · green earned, red lost, stronger = more · the bars on top are each hour’s total · click a square</small></h3>' + this.heat(T, f.id) + '</div>' +
        '<div class="suCard"><h3>Where it earns<small>one sphere per instrument · right = wins more often · up = earns more a trade · click one</small></h3><div class="suScene"><canvas id="suGalaxy"></canvas><div class="suTip" id="suGalTip"></div></div></div></section>' +
      /* spread, exits, sides */
      '<section class="suRow three"><div class="suCard"><h3>Size of wins and losses<small>' + (T.some(t => t.r != null) ? 'in R' : 'in money') + '</small></h3><canvas id="suHist" class="suCv"></canvas></div>' +
        '<div class="suCard"><h3>How its trades ended</h3>' + this.donut(exits, T.length) + '</div>' +
        '<div class="suCard"><h3>Buys against sells</h3>' + this.sides(sides) + '</div></section>' +
      /* instruments and trades */
      '<section class="suRow two"><div class="suCard"><h3>Instruments<small>net result · click one for its trades</small></h3>' + this.bars(syms.slice(0, 12), g2 => 'drill:' + JSON.stringify({ src: 'paper', bot: f.id, sym: (T.find(t => this.sym(t.sym) === g2.k) || {}).sym || g2.k })) + '</div>' +
        '<div class="suCard"><h3>Last trades<small>click one to replay it candle by candle</small></h3><div class="suTrades">' + (recent.length ? recent.map(t => '<button type="button" class="suTr" data-u="trade:' + this.esc(t.id) + '"><i class="' + (t.dir > 0 ? 'up' : 'dn') + '">' + (t.dir > 0 ? '▲' : '▼') + '</i><b>' + this.esc(this.sym(t.sym)) + '</b><span>' + new Date(t.t1).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' · ' + this.esc(this.reason(t)) + '</span><em class="' + this.cls(t.pnl) + '">' + this.sg(t.pnl, 0) + (t.r != null ? '<small>' + this.sg(t.r, 2) + 'R</small>' : '') + '</em></button>').join('') : '<div class="suEmpty">No closed trade yet.</div>') + '</div></div></section>' +
      /* now */
      '<section class="suRow two"><div class="suCard"><h3>Open now<small>' + open.length + ' position' + (open.length === 1 ? '' : 's') + ' · the dot is the price between stop and target · click to open the chart</small></h3><div class="suOpen">' + (open.length ? open.map(p => { const lo = Math.min(p.sl, p.tp), hi = Math.max(p.sl, p.tp); return '<button type="button" class="suPos" data-u="chart:' + this.esc(p.sym) + '"><div><b>' + this.esc(this.sym(p.sym)) + '</b><i class="' + (p.dir > 0 ? 'up' : 'dn') + '">' + (p.dir > 0 ? '▲ buy' : '▼ sell') + '</i><em class="' + this.cls(p.unreal) + '">' + this.sg(p.unreal || 0, 0) + '</em></div>' + (typeof Info !== 'undefined' && p.sl > 0 && p.tp > 0 ? Info.track(lo, hi, p.last || p.entry, p.entry, p.dir) : '') + '<span>in at ' + this.esc(p.entry != null ? +(+p.entry).toPrecision(6) : '–') + ' · ' + this.esc(p.tf || '') + '</span></button>'; }).join('') : '<div class="suEmpty">Nothing open.</div>') + '</div></div>' +
        '<div class="suCard"><h3>What it learned<small>its own notes after a loss</small></h3><div class="suLessons">' + (lessons.length ? lessons.map(l => '<div><small>' + new Date(l.t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</small><span>' + this.esc(l.text) + '</span></div>').join('') : '<div class="suEmpty">No lesson yet.</div>') + '</div>' +
          (g.honest ? '<p class="suHonest"><b>Honestly:</b> ' + this.esc(g.honest) + '</p>' : '') + '</div></section>' +
      '<p class="suFoot">Paper results: past trades of this bot, not a promise. Its settings, its ledger, its notes and every button of its page are below, in All controls.</p>';
    this.draw(f, T); TmSettings.animate(main); },

  /* ---------- the drawings ---------- */
  /* when it earns: weekday by hour as a flat grid of squares */
  heat(T, botId){ if (!T.length) return '<div class="suEmpty">No closed trade yet.</div>'; const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], H24 = [...Array(24).keys()], v = DOW.map(() => new Array(24).fill(0)), n = DOW.map(() => new Array(24).fill(0)), hh = c => String(c).padStart(2, '0');
    for (const t of T){ const d = new Date(t.t0), r = (d.getDay() + 6) % 7, c = d.getHours(); v[r][c] += t.pnl; n[r][c]++; }
    const max = Math.max(1e-9, ...v.flat().map(Math.abs)), rowT = v.map(r => r.reduce((x, y) => x + y, 0)), colT = H24.map(c => v.reduce((x, r) => x + r[c], 0)), cm = Math.max(1e-9, ...colT.map(Math.abs));
    const cell = (r, c) => { const x = v[r][c], k = n[r][c]; if (!k) return '<i></i>'; return '<button type="button" style="--i:' + (r + c) + ';background:rgba(' + (x >= 0 ? '61,220,151' : '255,107,122') + ',' + (0.22 + 0.78 * Math.abs(x) / max).toFixed(2) + ')" data-u="' + this.esc('drill:' + JSON.stringify({ src: 'paper', bot: botId, dow: String((r + 1) % 7), hour: String(c) })) + '" title="' + DOW[r] + ' ' + hh(c) + ':00 · ' + k + ' trade' + (k === 1 ? '' : 's') + ' · ' + this.sg(x, 0) + '"></button>'; };
    return '<div class="suHeat"><div class="suHeatCols"><span></span>' + colT.map((x, c) => '<u title="' + hh(c) + ':00 · ' + this.sg(x, 0) + '"><s class="' + this.cls(x) + '" style="--h:' + (Math.abs(x) / cm * 100).toFixed(0) + '%"></s></u>').join('') + '<span></span></div>' +
      DOW.map((d, r) => '<div class="suHeatRow"><span>' + d + '</span>' + H24.map(c => cell(r, c)).join('') + '<em class="' + this.cls(rowT[r]) + '">' + (rowT[r] ? this.sg(rowT[r], 0) : '') + '</em></div>').join('') +
      '<div class="suHeatHours"><span></span>' + H24.map(c => '<b>' + (c % 3 === 0 ? hh(c) : '') + '</b>').join('') + '<span></span></div></div>'; },
  donut(gs, n){ if (!n) return '<div class="suEmpty">No closed trade yet.</div>'; const col = { Target: '#3DDC97', 'Trailing stop': '#4FD8F7', 'Breakeven stop': '#A78BFA', Stop: '#FF6B7A', 'Time limit': '#7C8BA8', 'Closed by hand': '#FFB648', Other: '#5D6C8A' }, R = 46, C = 2 * Math.PI * R; let acc = 0;
    return '<div class="suDonut"><svg viewBox="0 0 120 120">' + gs.map(g => { const len = g.n / n * C, s = '<circle cx="60" cy="60" r="' + R + '" fill="none" stroke="' + (col[g.k] || '#5D6C8A') + '" stroke-width="16" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-acc).toFixed(2) + '" class="seg"><title>' + this.esc(g.k) + ': ' + g.n + '</title></circle>'; acc += len; return s; }).join('') + '<text x="60" y="58" text-anchor="middle" class="n">' + n + '</text><text x="60" y="74" text-anchor="middle" class="l">trades</text></svg>' +
      '<div class="suLegend">' + gs.map(g => '<span><i style="background:' + (col[g.k] || '#5D6C8A') + '"></i>' + this.esc(g.k) + '<b>' + Math.round(g.n / n * 100) + '%</b><em class="' + this.cls(g.net) + '">' + this.sg(g.net, 0) + '</em></span>').join('') + '</div></div>'; },
  sides(gs){ if (!gs.length) return '<div class="suEmpty">No closed trade yet.</div>'; const max = Math.max(1, ...gs.map(g => g.n));
    return '<div class="suSides">' + ['Buys', 'Sells'].map(k => { const g = gs.find(x => x.k === k) || { n: 0, w: 0, net: 0 }; return '<div class="suSide ' + (k === 'Buys' ? 'b' : 's') + '"><b>' + (k === 'Buys' ? '▲ ' : '▼ ') + k + '</b><i><u style="--w:' + (g.n / max * 100).toFixed(1) + '%"></u></i><span>' + g.n + ' trades · ' + (g.n ? Math.round(g.w / g.n * 100) : 0) + '% won</span><em class="' + this.cls(g.net) + '">' + this.sg(g.net, 0) + '</em></div>'; }).join('') + '</div>'; },
  bars(gs, act){ if (!gs.length) return '<div class="suEmpty">No closed trade yet.</div>'; const max = Math.max(1e-9, ...gs.map(g => Math.abs(g.net)));
    return '<div class="suBars">' + gs.map((g, i) => '<button type="button" class="suBar" style="--i:' + i + '" data-u="' + this.esc(act(g)) + '" title="' + g.n + ' trades · ' + Math.round(g.w / g.n * 100) + '% won"><span>' + this.esc(g.k) + '</span><i><u class="' + (g.net >= 0 ? 'up' : 'dn') + '" style="--w:' + (Math.abs(g.net) / max * 50).toFixed(1) + '%"></u></i><b class="' + this.cls(g.net) + '">' + this.sg(g.net, 0) + '</b><em>' + g.n + '</em></button>').join('') + '</div>'; },
  tip(el, html, x, y){ if (!el) return; if (!html){ el.style.opacity = 0; return; } el.innerHTML = html; el.style.opacity = 1; el.style.left = Math.min(el.parentElement.clientWidth - el.offsetWidth - 8, x + 14) + 'px'; el.style.top = Math.max(4, y - 10) + 'px'; },
  draw(f, T){ const S = this.stat(T);
    if (typeof Info !== 'undefined'){ const cv = document.getElementById('suCurve'); if (cv) Info.curve(cv, Info.thin(S.curve, 400), 230); const hv = document.getElementById('suHist'); if (hv) Info.hist(hv, T, 170); }
    if (typeof Tm3D === 'undefined') return;
    /* instruments */
    const gs = this.group(T, t => this.sym(t.sym)).filter(g => g.n >= 1), maxAvg = Math.max(1e-9, ...gs.map(g => Math.abs(g.net / g.n))), maxN = Math.max(2, ...gs.map(g => g.n)), top = new Set(gs.slice().sort((a, b) => b.n - a.n).slice(0, 8).map(g => g.k));
    const gal = document.getElementById('suGalaxy'); if (gal) Tm3D.galaxy(gal, { axes: { x: 'wins more often →', y: 'earns more a trade ↑', z: 'more trades', zero: 0 },
      balls: gs.map(g => ({ id: g.k, label: g.k, x: Math.max(-1, Math.min(1, (g.w / g.n - 0.5) * 2.4)), y: Math.max(-0.95, Math.min(0.95, g.net / g.n / maxAvg * 0.95)), z: -0.9 + 1.8 * Math.log(g.n + 1) / Math.log(maxN + 1), r: Math.min(22, 6 + 2 * Math.sqrt(g.n)), col: g.net >= 0 ? '#3DDC97' : '#FF6B7A', dark: g.net >= 0 ? '#0B3B2A' : '#4A1620', show: top.has(g.k), g })),
      onPick: it => { if (typeof Info === 'undefined') return; const s = (T.find(t => this.sym(t.sym) === it.id) || {}).sym || it.id; Info.f = { src: 'paper', period: 'all', bot: f.id, sym: s, tf: '', dir: '', reason: '', dow: '', hour: '', day: '' }; Face.view('deep', 'info'); },
      tip: (it, x, y) => this.tip(document.getElementById('suGalTip'), it ? '<b>' + this.esc(it.id) + '</b><span>' + it.g.n + ' trades · ' + Math.round(100 * it.g.w / it.g.n) + '% won</span><span class="' + this.cls(it.g.net) + '">net ' + this.sg(it.g.net, 0) + '</span>' : '', x, y) }); },

  /* ---------- presses ---------- */
  power(id, input){ const off = Bots.disabled(id); if (!off){ let a = null; try { a = typeof Live !== 'undefined' ? Live.armedEntry(id) : null; } catch(x){} if (a && !confirm('This bot is armed on the live desk (' + (a.mode === 'live' ? 'LIVE, real money' : 'shadow') + ').\n\nSwitching it off takes it out of every list, the live desk included. Its record is kept.\n\nSwitch it off?')){ input.checked = true; return; } }
    if (Bots.setDisabled(id, !off) === false){ input.checked = !off; return; } TmSettings._offCache = {}; if (typeof toast === 'function') toast(off ? 'Switched on: the bot is back, exactly as it was.' : 'Switched off: the bot is out of every list. Its record is kept.', 'ok'); this._sig = ''; this.paintRail(); this.paint(); },
  click(e){ const di = e.target.closest('[data-i]'); if (di && this.host.contains(di) && di.dataset.i.indexOf('drill:') === 0 && typeof Info !== 'undefined'){ Info.f = Object.assign({ src: 'paper', period: 'all', bot: '', sym: '', tf: '', dir: '', reason: '', dow: '', hour: '', day: '' }, JSON.parse(di.dataset.i.slice(6))); Face.view('deep', 'info'); return; }
    const b = e.target.closest('[data-u]'); if (!b || !this.host.contains(b) || b.matches('input')) return; const i = b.dataset.u.indexOf(':'), k = b.dataset.u.slice(0, i), v = b.dataset.u.slice(i + 1);
    if (k === 'pick') this.pick(v);
    else if (k === 'pause'){ Bots.setPaused(v, !(Bots.cfg(v) || {}).paused); this._sig = ''; this.paintRail(); this.paint(); }
    else if (k === 'reset'){ Bots.resetBot(v); TmSettings._offCache = {}; this._sig = ''; this.paintRail(); this.paint(); }
    else if (k === 'classic'){ Face._raw = true; try { Face.bot(v); } finally { setTimeout(() => { Face._raw = false; }, 400); } }
    else if (k === 'dive'){ if (typeof Info !== 'undefined') Info.f = { src: 'paper', period: 'all', bot: v, sym: '', tf: '', dir: '', reason: '', dow: '', hour: '', day: '' }; Face.view('deep', 'info'); }
    else if (k === 'drill'){ if (typeof Info !== 'undefined') Info.f = Object.assign({ src: 'paper', period: 'all', bot: '', sym: '', tf: '', dir: '', reason: '', dow: '', hour: '', day: '' }, JSON.parse(v)); Face.view('deep', 'info'); }
    else if (k === 'trade'){ if (typeof Autopsy !== 'undefined'){ Autopsy.want = v; Face.go('autopsy'); } }
    else if (k === 'chart'){ Face.go('chart'); try { typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(v) : App.setSymbol(v); } catch(x){} }
    else if (k === 'settings'){ Face.go('settings'); }
    else if (k === 'room'){ Face.go(v); }
    else if (k === 'full'){ const f = document.getElementById('suFull'); if (f && !f.hidden) TmSettings.scrollTo(document.getElementById('suMain'), f); }
    else if (typeof Pages !== 'undefined') Pages.click(k, v);
  },
};
/* whatever way the studio is left (a room, a Classic shortcut, the Classic look), the page body goes back to Classic's panel */
try { new MutationObserver(() => { try { if (typeof Face === 'undefined' || Face.room !== 'studio' || !Face.on()) BotStudio.release(); } catch(e){} }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tmroom', 'data-face'] }); } catch(e){}
