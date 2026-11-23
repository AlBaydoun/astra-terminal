/* ASTRA / Timurila — Wizard: from "which signal works" to a shortlist, in eight questions.

   It sits on top of the Deep Dive in its Visual view and runs on Classic's own Deep Dive engine
   (js/bots/explorer.js: the same trades, the same dimensions, the same ticks and path). So a choice
   made here is the choice the Classic page shows, and the other way round. Nothing is copied.

     1 Signal      which signals earned the most, and on which timeframe
     2 Bot         which bots traded them, and how each one did
     3 Market      on which markets and instruments
     4 Timeframe   instrument by instrument
     5 When        which hours and weekdays (is there a magic hour?)
     6 Direction   with or against the trend, buys or sells
     7 How it ended  target, stop, time limit, closed by you — shown, never used as a filter
     8 Shortlist   every bot · instrument · timeframe · signal that matches the choices

   Two things it says plainly, because they decide what the list is worth:
     · how a trade ended is only known afterwards, so it cannot be a rule for choosing trades;
     · the best slices of the past always look better than they will be: every extra choice leaves
       fewer trades, and each setup shows whether it held in both halves of its history.

   It arms nothing and places nothing. To trade a setup live, its bot is armed on the Classic live
   desk, by hand, behind the typed gates. */
const Wizard = {
  PRE: ['trigger', 'bot', 'market', 'sym', 'tf', 'hour', 'dow', 'trend', 'side'],
  NAMES: { trigger: 'Signals', bot: 'Bots', market: 'Markets', sym: 'Instruments', tf: 'Timeframes', hour: 'Hours', dow: 'Weekdays', trend: 'Trend', side: 'Side' },
  STEPS: [
    { id: 'trigger', title: 'Signal', q: 'Which signals earned the most, and on which timeframe?', dims: ['trigger'], matrix: ['trigger', 'tf'] },
    { id: 'bot', title: 'Bot', q: 'Which bots traded them, and how did each one do?', dims: ['bot'] },
    { id: 'market', title: 'Market', q: 'On which markets and instruments did it work?', dims: ['market', 'sym'] },
    { id: 'tf', title: 'Timeframe', q: 'On which timeframe, instrument by instrument?', dims: ['tf'], matrix: ['sym', 'tf'] },
    { id: 'when', title: 'When', q: 'At which hours and on which days? Is there a magic hour?', dims: ['hour', 'dow'], clock: true },
    { id: 'trend', title: 'Direction', q: 'With the trend or against it? Buys or sells?', dims: ['trend', 'side'] },
    { id: 'exit', title: 'How it ended', q: 'Target, stop, time limit, or closed by you?', dims: ['outcome', 'closer', 'hold'], after: true },
    { id: 'list', title: 'Shortlist', q: 'Every setup that matches what you chose' },
  ],
  open: 'trigger', rank: 'r', min: 10, more: {}, ix: [], back: null,
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  eng(){ return typeof Bots !== 'undefined' && Bots.active === 'livedive' && typeof LiveDive !== 'undefined' ? LiveDive : Explorer; },
  num(v, d){ return Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  sg(v, d, u){ if (v == null || !isFinite(v)) return '–'; const z = Math.abs(v) < 0.5 * Math.pow(10, -d); return (z ? '' : v > 0 ? '+' : '−') + this.num(Math.abs(v), d) + (u || ''); },

  /* ---------- the engine, asked with some choices left out ---------- */
  rowsWithout(ids){ const E = this.eng(), ke = E.excludes, kp = E.path, tmp = Object.assign({}, ke); for (const id of ids) delete tmp[id];
    E.excludes = tmp; E.path = kp.filter(f => f.range || !ids.includes(f.dim)); let rows; try { rows = E.filtered(); } finally { E.excludes = ke; E.path = kp; } return rows; },
  /* only what can be known BEFORE a trade is opened */
  preRows(){ const E = this.eng(), ke = E.excludes, kp = E.path, ex = {}; for (const k of this.PRE) if (ke[k]) ex[k] = ke[k];
    E.excludes = ex; E.path = kp.filter(f => !f.range && this.PRE.includes(f.dim)); let rows; try { rows = E.filtered(); } finally { E.excludes = ke; E.path = kp; } return rows; },
  st(rows){ let w = 0, net = 0, rs = 0, rn = 0; for (const t of rows){ if (t.pnl > 0) w++; net += t.pnl; if (Number.isFinite(t.r)){ rs += Math.max(-5, Math.min(5, t.r)); rn++; } }
    const n = rows.length; return { n, w, net, wr: n ? 100 * w / n : 0, r: rn ? rs / rn : null, val: rn ? rs / rn : (n ? net / n : 0) }; },
  /* did it earn in the first half of its own history AND in the second? */
  halves(rows){ const s = rows.slice().sort((a, b) => (a.entryTime || 0) - (b.entryTime || 0)), m = Math.floor(s.length / 2); if (m < 3) return null; const a = this.st(s.slice(0, m)), b = this.st(s.slice(m)); return { a: a.val, b: b.val, steady: a.val > 0 && b.val > 0 }; },
  metric(g){ return this.rank === 'net' ? g.net : this.rank === 'win' ? g.wr - 50 : g.val; },
  show(g){ return this.rank === 'net' ? this.sg(g.net, 0) : this.rank === 'win' ? Math.round(g.wr) + '%' : g.r != null ? this.sg(g.r, 2, 'R') : this.sg(g.val, 1); },
  keys(dimId){ const d = this.eng().dim(dimId), s = new Set(); if (!d) return []; for (const t of this.rowsWithout([dimId])){ try { s.add(d.of(t)); } catch(e){} } return [...s]; },
  sel(dimId, keys){ const E = this.eng(), p = E.path.find(f => f.dim === dimId && !f.range); if (p) return new Set([p.value]); const ex = E.excludes[dimId] || []; return new Set(keys.filter(k => !ex.includes(k))); },
  list(dimId){ const E = this.eng(), d = E.dim(dimId); if (!d) return []; const by = new Map();
    for (const t of this.rowsWithout([dimId])){ let k; try { k = d.of(t); } catch(e){ continue; } let a = by.get(k); if (!a) by.set(k, a = []); a.push(t); }
    const sel = this.sel(dimId, [...by.keys()]), out = [...by.entries()].map(([k, a]) => Object.assign(this.st(a), { dim: dimId, k, name: d.name(k), on: sel.has(k), h: this.halves(a) }));
    const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    if (dimId === 'hour') out.sort((a, b) => String(a.k).localeCompare(String(b.k))); else if (dimId === 'dow') out.sort((a, b) => DOW.indexOf(a.k) - DOW.indexOf(b.k));
    /* best first, but anything with fewer than ten trades goes below the rest: one lucky trade is not "the best signal" */
    else if (d.order) out.sort((a, b) => d.order.indexOf(a.k) - d.order.indexOf(b.k)); else out.sort((a, b) => ((a.n >= 10 ? 0 : 1) - (b.n >= 10 ? 0 : 1)) || (this.metric(b) - this.metric(a)));
    return out; },

  /* ---------- changing a choice: the same ticks and path the Classic page uses ---------- */
  commit(){ const E = this.eng(); for (const k of Object.keys(E.excludes)) if (!E.excludes[k] || !E.excludes[k].length) delete E.excludes[k]; lsSet(E.EXCL_KEY, E.excludes); lsSet(E.PATH_KEY, E.path); E.dirty = true; Bots.render(); this.paint(); },
  unpath(dimId){ const E = this.eng(), p = E.path.find(f => f.dim === dimId && !f.range); if (!p) return; const keys = this.keys(dimId); E.path = E.path.filter(f => f !== p); E.excludes[dimId] = keys.filter(k => k !== p.value); },
  toggle(dimId, k){ const E = this.eng(); this.unpath(dimId); const ex = E.excludes[dimId] || []; E.excludes[dimId] = ex.includes(k) ? ex.filter(v => v !== k) : ex.concat([k]); },
  only(dimId, ks){ const E = this.eng(), keys = this.keys(dimId); E.path = E.path.filter(f => f.range || f.dim !== dimId); E.excludes[dimId] = keys.filter(k => !ks.includes(k)); },
  allOf(dimId){ const E = this.eng(); E.path = E.path.filter(f => f.range || f.dim !== dimId); delete E.excludes[dimId]; },
  reset(){ const E = this.eng(); E.path = []; E.excludes = {}; this.back = null; this.open = 'trigger'; this.commit(); },

  /* ---------- the shortlist ---------- */
  setups(){ const E = this.eng(), dB = E.dim('bot'), dS = E.dim('sym'), dT = E.dim('trigger'), by = new Map();
    for (const t of this.preRows()){ const key = [t.bot, dS.of(t), t.tf || '?', dT.of(t)].join('\u0001'); let a = by.get(key); if (!a) by.set(key, a = []); a.push(t); }
    return [...by.entries()].map(([key, a]) => { const [bot, sym, tf, trig] = key.split('\u0001'), s = this.st(a), ex = { target: 0, trail: 0, stop: 0, time: 0, hand: 0, other: 0 };
      /* a trailing or break-even stop that closed in profit is not a stop-loss: it gets its own colour */
      for (const t of a){ const r = String(t.reason || '').toLowerCase(); if (E.byHand(t)) ex.hand++; else if (/target|take.?profit/.test(r)) ex.target++; else if (/trail|break.?even/.test(r) || (/stop/.test(r) && t.pnl > 0)) ex.trail++; else if (/stop/.test(r)) ex.stop++; else if (/time|limit|expir/.test(r)) ex.time++; else ex.other++; }
      return Object.assign(s, { bot, botName: dB.name(bot), sym, symName: dS.name(sym), tf, trig, h: this.halves(a), ex, score: s.val * Math.sqrt(s.n) }); }).sort((a, b) => b.score - a.score); },
  choices(){ const out = []; for (const d of this.PRE){ const keys = this.keys(d); if (!keys.length) continue; const sel = this.sel(d, keys); if (sel.size === keys.length) continue; const dim = this.eng().dim(d), names = [...sel].map(k => dim.name(k)); out.push({ dim: d, label: this.NAMES[d], names }); } return out; },
  PB_KEY: 'astra_playbooks',
  books(){ try { const v = JSON.parse(localStorage.getItem(this.PB_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch(e){ return []; } },
  saveBook(name){ const E = this.eng(), ex = {}; for (const k of this.PRE){ const keys = this.keys(k), sel = this.sel(k, keys); if (sel.size !== keys.length) ex[k] = keys.filter(x => !sel.has(x)); }
    const rows = this.setups().filter(x => x.n >= this.min).slice(0, 30).map(x => ({ bot: x.botName, sym: x.symName, tf: x.tf, signal: x.trig, trades: x.n, won: Math.round(x.wr), r: x.r, net: Math.round(x.net), steady: x.h ? x.h.steady : null }));
    const list = this.books().filter(b => b.name !== name); list.unshift({ name, at: Date.now(), page: E.PAGE, excludes: ex, rows }); try { localStorage.setItem(this.PB_KEY, JSON.stringify(list.slice(0, 30))); } catch(e){} },
  loadBook(i){ const b = this.books()[i], E = this.eng(); if (!b) return; E.path = []; E.excludes = JSON.parse(JSON.stringify(b.excludes || {})); this.back = null; this.open = 'list'; this.commit(); },
  text(){ const rows = this.setups().filter(x => x.n >= this.min).slice(0, 40), ch = this.choices();
    return 'ASTRA shortlist · ' + new Date().toLocaleString() + '\n' + (ch.length ? ch.map(c => c.label + ': ' + c.names.join(', ')).join('\n') : 'No choices made: every trade counted') + '\n\n' +
      rows.map((x, i) => (i + 1) + '. ' + x.botName + ' · ' + x.symName + ' · ' + x.tf + ' · ' + x.trig + ' — ' + x.n + ' trades, ' + Math.round(x.wr) + '% won, ' + (x.r != null ? this.sg(x.r, 2, 'R') + ' a trade, ' : '') + 'net ' + this.sg(x.net, 0) + (x.h ? (x.h.steady ? ', earned in both halves' : ', did not earn in both halves') : '')).join('\n'); },

  /* ---------- drawing ---------- */
  mount(){ const wrap = document.querySelector('#bot-bots .botsWrap'), body = document.getElementById('botBody'); if (!wrap || !body) return;
    let el = document.getElementById('tmWiz'); if (!el){ el = document.createElement('div'); el.id = 'tmWiz'; wrap.insertBefore(el, body); el.addEventListener('click', e => this.click(e)); el.addEventListener('change', e => { if (e.target.id === 'twMin'){ this.min = +e.target.value; this.paint(); } }); }
    if (!this._wrapped && typeof Bots !== 'undefined'){ this._wrapped = true; const o = Bots.render.bind(Bots); Bots.render = (...a) => { const r = o(...a); setTimeout(() => { try { this.chrome(); } catch(e){} }, 30); if (document.documentElement.dataset.tmview === 'visual' && !this._busy){ clearTimeout(this._pt); this._pt = setTimeout(() => this.paint(), 60); } return r; }; }
    this.paint(); this.chrome(); },
  /* the Deep Dive's head (tabs, menu, this wizard, the filter row) slides away while you scroll down and comes back at the top;
     the net-results bar stays at the very top while it is pinned */
  PKEY: 'astra_dd_pin',
  chrome(){ const H = document.documentElement, body = document.querySelector('#bot-bots .botsWrap > #botBody') || document.getElementById('botBody'), wrap = document.querySelector('#bot-bots .botsWrap'); if (!body || !wrap) return;
    let pin = true; try { pin = localStorage.getItem(this.PKEY) !== '0'; } catch(e){} H.classList.toggle('ddUnpinned', !pin);
    if (!body._ddScroll){ body._ddScroll = true; let last = 0; body.addEventListener('scroll', () => { if (H.dataset.tmview !== 'visual') return; const y = body.scrollTop; if (y > 90 && y > last) H.classList.add('ddFold'); else if (y < 24) H.classList.remove('ddFold'); last = y; }, { passive: true }); }
    if (!document.getElementById('ddUnfold')){ const u = document.createElement('button'); u.type = 'button'; u.id = 'ddUnfold'; u.title = 'Bring back the wizard and the filters'; u.innerHTML = '▲ Wizard'; wrap.appendChild(u); u.addEventListener('click', () => { H.classList.remove('ddFold'); body.scrollTo({ top: 0, behavior: 'smooth' }); }); }
    const hero = body.querySelector('.exSec.exHeroSec'); if (hero && !hero.querySelector('.ddPin')){ const b = document.createElement('button'); b.type = 'button'; b.className = 'ddPin'; hero.appendChild(b);
      b.addEventListener('click', e => { e.stopPropagation(); const on = H.classList.contains('ddUnpinned'); H.classList.toggle('ddUnpinned', !on); try { localStorage.setItem(this.PKEY, on ? '1' : '0'); } catch(er){} this.pinLabel(); }); }
    this.pinLabel(); },
  pinLabel(){ const un = document.documentElement.classList.contains('ddUnpinned'); document.querySelectorAll('.ddPin').forEach(b => { b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v7"/></svg><span>' + (un ? 'Pin to the top' : 'Pinned') + '</span>'; b.classList.toggle('off', un); b.title = un ? 'Keep the results bar at the top while you scroll' : 'Let the results bar scroll away with the page'; }); },
  row(g, max, tick){ const i = this.ix.push({ dim: g.dim, k: g.k }) - 1, v = this.metric(g), w = max ? Math.min(100, Math.abs(v) / max * 100) : 0, few = g.n < 30;
    return '<div class="twRow' + (g.on ? '' : ' off') + '">' + (tick ? '<button type="button" class="twTick' + (g.on ? ' on' : '') + '" data-w="tog:' + i + '" title="' + (g.on ? 'Leave this out' : 'Put this back') + '"><i></i></button>' : '') +
      '<button type="button" class="twBar" data-w="' + (tick ? 'only' : 'look') + ':' + i + '" title="' + (tick ? 'Keep only ' : 'Open the trades of ') + this.esc(g.name) + '"><span class="twName">' + this.esc(g.name) + '</span><span class="twTrk"><u class="' + (v >= 0 ? 'up' : 'dn') + '" style="width:' + w.toFixed(1) + '%"></u></span>' +
      '<b class="' + (v > 0 ? 'up' : v < 0 ? 'dn' : '') + '">' + this.show(g) + '</b><span class="twWin" title="' + Math.round(g.wr) + '% of these trades won"><u style="width:' + g.wr.toFixed(0) + '%"></u></span><em>' + Math.round(g.wr) + '%</em><small class="' + (few ? 'few' : '') + '">' + g.n + (few ? ' · few' : '') + '</small>' +
      '<span class="twSt ' + (g.h ? (g.h.steady ? 'yes' : 'no') : 'na') + '" title="' + (g.h ? (g.h.steady ? 'Earned in the first half of its history and in the second' : 'Did not earn in both halves of its history') : 'Too few trades to split in two') + '"></span></button></div>'; },
  card(dimId, tick){ const E = this.eng(), d = E.dim(dimId); if (!d) return ''; const all = this.list(dimId), max = Math.max(1e-9, ...all.map(g => Math.abs(this.metric(g)))), lim = this.more[dimId] ? 1e9 : (dimId === 'hour' ? 24 : 12), on = all.filter(g => g.on).length;
    return '<div class="twCard"><div class="twCardHead"><b>' + this.esc(d.label) + '</b><span>' + (tick ? on + ' of ' + all.length + ' kept' : all.length + ' kinds') + '</span>' + (tick ? '<button type="button" data-w="all:' + dimId + '">All</button><button type="button" data-w="none:' + dimId + '">None</button>' : '') + '</div>' +
      (all.length ? all.slice(0, lim).map(g => this.row(g, max, tick)).join('') + (all.length > lim ? '<button type="button" class="twMore" data-w="more:' + dimId + '">Show all ' + all.length + '</button>' : '') : '<div class="twEmpty">No trades left for this question.</div>') + '</div>'; },
  matrix(rd, cd){ const E = this.eng(), R = E.dim(rd), C = E.dim(cd); if (!R || !C) return ''; const rows = this.rowsWithout([rd, cd]), by = new Map(), TF = ['1s', '30s', '1m', '5m', '15m', '30m', '1h', '4h', '1d', '1w'];
    for (const t of rows){ let a, b; try { a = R.of(t); b = C.of(t); } catch(e){ continue; } const k = a + '\u0001' + b; let l = by.get(k); if (!l) by.set(k, l = []); l.push(t); }
    const rk = this.list(rd).slice(0, 12), ck = [...new Set(rows.map(t => { try { return C.of(t); } catch(e){ return null; } }).filter(x => x != null))].sort((a, b) => (TF.indexOf(a) < 0 ? 99 : TF.indexOf(a)) - (TF.indexOf(b) < 0 ? 99 : TF.indexOf(b)));
    const cells = rk.map(g => ck.map(c => { const l = by.get(g.k + '\u0001' + c); return l ? Object.assign(this.st(l), { rk: g.k, ck: c }) : null; })), max = Math.max(1e-9, ...cells.flat().filter(x => x && x.n >= 3).map(x => Math.abs(this.metric(x))));
    return '<div class="twCard twMx"><div class="twCardHead"><b>' + this.esc(R.label) + ' by ' + this.esc(C.label.toLowerCase()) + '</b><span>colour = ' + (this.rank === 'net' ? 'net result' : this.rank === 'win' ? 'share won' : 'average R') + ' · small number = trades · click a square to keep only that pair</span></div>' +
      '<div class="twGrid" style="grid-template-columns:minmax(120px,1.6fr) repeat(' + ck.length + ',minmax(54px,1fr))"><span></span>' + ck.map(c => '<span class="twCol">' + this.esc(C.name(c)) + '</span>').join('') +
      rk.map((g, r) => '<span class="twRowName' + (g.on ? '' : ' off') + '">' + this.esc(g.name) + '</span>' + cells[r].map(x => { if (!x) return '<span class="twCell none"></span>'; const i = this.ix.push({ pair: [rd, x.rk, cd, x.ck] }) - 1, v = this.metric(x), a = x.n < 3 ? 0.08 : 0.15 + 0.75 * Math.min(1, Math.abs(v) / max);
        return '<button type="button" class="twCell" data-w="pair:' + i + '" style="background:rgba(' + (v >= 0 ? '61,220,151' : '255,107,122') + ',' + a.toFixed(2) + ')" title="' + this.esc(g.name) + ' on ' + this.esc(C.name(x.ck)) + ': ' + x.n + ' trades, ' + Math.round(x.wr) + '% won"><b>' + this.show(x) + '</b><small>' + x.n + '</small></button>'; }).join('')).join('') + '</div></div>'; },
  clock(){ const hrs = this.list('hour'), by = new Map(hrs.map(g => [parseInt(g.k, 10), g])), maxN = Math.max(1, ...hrs.map(g => g.n)), maxV = Math.max(1e-9, ...hrs.map(g => Math.abs(this.metric(g)))), cx = 150, cy = 150; let h = '';
    for (let i = 0; i < 24; i++){ const g = by.get(i), a0 = (i / 24) * 2 * Math.PI - Math.PI / 2 + 0.012, a1 = ((i + 1) / 24) * 2 * Math.PI - Math.PI / 2 - 0.012, r0 = 46, r1 = g ? 58 + 70 * Math.sqrt(g.n / maxN) : 54, P = (r, a) => (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
      const d = 'M' + P(r0, a0) + ' L' + P(r1, a0) + ' A' + r1 + ' ' + r1 + ' 0 0 1 ' + P(r1, a1) + ' L' + P(r0, a1) + ' A' + r0 + ' ' + r0 + ' 0 0 0 ' + P(r0, a0) + ' Z', v = g ? this.metric(g) : 0, al = g ? 0.25 + 0.7 * Math.min(1, Math.abs(v) / maxV) : 0.06, ix = g ? this.ix.push({ dim: 'hour', k: g.k }) - 1 : -1, am = (a0 + a1) / 2;
      h += '<path d="' + d + '" class="twHr' + (g && g.on ? ' on' : '') + (g ? '' : ' none') + '" ' + (g ? 'data-w="tog:' + ix + '" ' : '') + 'fill="rgba(' + (!g ? '124,139,168' : v >= 0 ? '61,220,151' : '255,107,122') + ',' + (g && !g.on ? 0.1 : al).toFixed(2) + ')"><title>' + String(i).padStart(2, '0') + ':00' + (g ? ' · ' + g.n + ' trades · ' + this.show(g) + ' · ' + Math.round(g.wr) + '% won' : ' · no trades') + '</title></path>';
      if (i % 3 === 0) h += '<text x="' + (cx + 36 * Math.cos(am - 0.13)).toFixed(1) + '" y="' + (cy + 36 * Math.sin(am - 0.13) + 3).toFixed(1) + '" class="twHrT">' + String(i).padStart(2, '0') + '</text>'; }
    const best = hrs.filter(g => g.n >= 10).sort((a, b) => this.metric(b) - this.metric(a))[0];
    return '<div class="twCard twClockCard"><div class="twCardHead"><b>Hour the trade was opened</b><span>length = trades · colour = result · click an hour to leave it out</span></div><div class="twClockRow"><svg viewBox="0 0 300 300" class="twClock">' + h + '<text x="150" y="146" class="twHrC">' + (best ? best.k : '–') + '</text><text x="150" y="163" class="twHrS">' + (best ? 'best hour' : 'no hour has 10 trades') + '</text></svg>' +
      '<div class="twPicks"><small>QUICK PICKS</small>' + [['Night', 0, 5], ['Morning', 6, 11], ['Afternoon', 12, 17], ['Evening', 18, 23]].map(p => '<button type="button" data-w="span:' + p[1] + '-' + p[2] + '">' + p[0] + '<em>' + String(p[1]).padStart(2, '0') + ' to ' + String(p[2]).padStart(2, '0') + '</em></button>').join('') + '<button type="button" data-w="all:hour">All hours</button>' +
      (best ? '<p>' + best.k + ' did best with ' + best.n + ' trades (' + this.show(best) + ')' + (best.h ? (best.h.steady ? ', and it earned in both halves of its history.' : ', but not in both halves of its history: treat it as a hint, not a rule.') : '.') + '</p>' : '') + '</div></div></div>'; },
  paint(){
    const el = document.getElementById('tmWiz'); if (!el || document.documentElement.dataset.tmview !== 'visual') return; const E = this.eng(); this.ix = [];
    const total = E.all().length, left = this.preRows().length, room = typeof Face !== 'undefined' ? Face.room : 'deep', tone = left >= 100 ? 'ok' : left >= 30 ? 'thin' : 'low';
    const sum = s => { if (s.id === 'list') return this.setups().filter(x => x.n >= this.min).length + ' setups'; if (s.after) return 'look only'; const parts = []; for (const d of s.dims){ const keys = this.keys(d), sel = this.sel(d, keys); if (sel.size !== keys.length) parts.push(sel.size === 1 ? this.eng().dim(d).name([...sel][0]) : sel.size + ' ' + this.NAMES[d].toLowerCase()); } return parts.length ? parts.join(' · ') : 'all'; };
    let h = '<div class="twRail"><div class="twTitle"><b>Find what to trade</b><small>' + (E === Explorer ? 'paper trades' : 'real trades') + ' · eight questions</small></div><div class="twSteps">' +
      this.STEPS.map((s, i) => { const t = sum(s); return '<button type="button" class="twStep' + (this.open === s.id ? ' open' : '') + (t !== 'all' && !s.after && s.id !== 'list' ? ' set' : '') + (s.id === 'list' ? ' fin' : '') + '" data-w="step:' + s.id + '"><i>' + (i + 1) + '</i><span><b>' + s.title + '</b><small>' + this.esc(t) + '</small></span></button>'; }).join('') + '</div>' +
      '<div class="twLeft ' + tone + '" title="Trades that match your choices, out of all of them. The fewer that are left, the more the result is luck."><b>' + left + '</b><small>of ' + total + ' trades left</small><i><u style="width:' + (total ? Math.max(2, left / total * 100) : 0).toFixed(0) + '%"></u></i></div>' +
      '<div class="twTools">' + (this.back ? '<button type="button" data-w="back:1">↩ Back to my shortlist</button>' : '') + '<button type="button" data-w="reset:1">Start over</button><span class="twViews"><button type="button" data-tmview="info">Infographic</button><button type="button" class="on">Visual</button><button type="button" data-tmview="classic">Classic</button></span></div></div>';
    const s = this.STEPS.find(x => x.id === this.open);
    if (s){ h += '<div class="twPanel"><div class="twQ"><div><b>' + s.q + '</b>' + (s.after ? '<small>How a trade ended is only known afterwards. You cannot pick tomorrow’s trades by it, so it is shown here and never used as a filter.</small>' : s.id === 'list' ? '' : '<small>Click the switch to leave something out · click a bar to keep only that one · the dot is green when it earned in both halves of its history</small>') + '</div>' +
        (s.id !== 'list' ? '<span class="twRank"><small>RANK BY</small>' + [['r', 'Average R'], ['net', 'Net result'], ['win', 'Share won']].map(r => '<button type="button" class="' + (this.rank === r[0] ? 'on' : '') + '" data-w="rank:' + r[0] + '">' + r[1] + '</button>').join('') + '</span>' : '') + '<button type="button" class="twClose" data-w="step:" title="Fold the wizard">✕</button></div>';
      if (s.id === 'list') h += this.listHtml(); else if (s.id === 'when') h += '<div class="twCols">' + this.clock() + this.card('dow', true) + '</div><div class="twCard twScene"><div class="twCardHead"><b>Weekday by hour</b><span>bars up = gains, down = losses · drag to turn · click a bar to keep only that weekday and hour</span></div><canvas id="twCity"></canvas><div class="tmiTip" id="twCityTip"></div></div>';
      else h += '<div class="twCols' + (s.matrix ? ' mx' : '') + '">' + s.dims.map(d => this.card(d, !s.after)).join('') + (s.matrix ? this.matrix(s.matrix[0], s.matrix[1]) : '') + '</div>';
      const i = this.STEPS.indexOf(s); h += '<div class="twNav">' + (i > 0 ? '<button type="button" data-w="step:' + this.STEPS[i - 1].id + '">← ' + this.STEPS[i - 1].title + '</button>' : '<span></span>') + (i < this.STEPS.length - 1 ? '<button type="button" class="pri" data-w="step:' + this.STEPS[i + 1].id + '">Next: ' + this.STEPS[i + 1].title + ' →</button>' : '') + '</div></div>'; }
    el.innerHTML = h; if (s && s.id === 'when') this.city();
  },
  city(){ const cv = document.getElementById('twCity'); if (!cv || typeof Tm3D === 'undefined') return; const E = this.eng(), dH = E.dim('hour'), dD = E.dim('dow'), DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'], v = DOW.map(() => new Array(24).fill(0)), n = DOW.map(() => new Array(24).fill(0));
    for (const t of this.rowsWithout(['hour', 'dow'])){ const r = DOW.indexOf(dD.of(t)), c = parseInt(dH.of(t), 10); if (r < 0 || !(c >= 0)) continue; v[r][c] += t.pnl; n[r][c]++; }
    Tm3D.city(cv, { rows: DOW, cols: [...Array(24).keys()].map(x => String(x).padStart(2, '0')), colStep: 3, v, n, onPick: it => { this.only('dow', [it.row]); this.only('hour', [it.col + ':00']); this.commit(); },
      tip: (it, x, y) => { const el = document.getElementById('twCityTip'); if (!el) return; if (!it){ el.style.opacity = 0; return; } el.innerHTML = '<b>' + it.row + ' ' + it.col + ':00</b><span>' + it.n + ' trades</span><span class="' + (it.val >= 0 ? 'up' : 'dn') + '">net ' + this.sg(it.val, 0) + '</span>'; el.style.opacity = 1; el.style.left = Math.min(el.parentElement.clientWidth - el.offsetWidth - 8, x + 14) + 'px'; el.style.top = Math.max(40, y + 30) + 'px'; } }); },
  listHtml(){ const all = this.setups(), rows = all.filter(x => x.n >= this.min), ch = this.choices(), books = this.books(), mx = Math.max(1e-9, ...rows.map(x => Math.abs(x.val)));
    const ex = x => { const t = x.n || 1, seg = (k, c, l) => x.ex[k] ? '<u class="' + c + '" style="width:' + (x.ex[k] / t * 100).toFixed(1) + '%" title="' + x.ex[k] + ' ' + l + '"></u>' : ''; return '<span class="twEx">' + seg('target', 'up', 'reached the target') + seg('trail', 'tr', 'left on a trailing or break-even stop') + seg('time', 'tm', 'ran out of time') + seg('hand', 'hd', 'closed by you') + seg('other', 'ot', 'ended another way') + seg('stop', 'dn', 'hit the stop-loss') + '</span>'; };
    return '<div class="twChoices"><small>YOUR CHOICES</small>' + (ch.length ? ch.map(c => '<span><b>' + c.label + '</b>' + this.esc(c.names.slice(0, 4).join(', ')) + (c.names.length > 4 ? ' +' + (c.names.length - 4) : '') + '</span>').join('') : '<span>None yet: every trade is counted. Go back through the questions to narrow it.</span>') + '</div>' +
      '<div class="twListHead"><label>At least <select id="twMin">' + [5, 10, 20, 30, 50].map(m => '<option value="' + m + '"' + (m === this.min ? ' selected' : '') + '>' + m + '</option>').join('') + '</select> trades each</label><span>' + rows.length + ' setups shown, ' + (all.length - rows.length) + ' with fewer trades hidden</span><i></i>' +
        '<button type="button" data-w="save:1">Save as a playbook</button><button type="button" data-w="copy:1">Copy the list</button><button type="button" class="pri" data-w="desk:1">Open the live desk</button></div>' +
      (rows.length ? '<div class="twList">' + rows.slice(0, 60).map((x, i) => { const j = this.ix.push({ setup: x }) - 1, few = x.n < 30;
        return '<div class="twSet"><i class="twNo">' + (i + 1) + '</i><div class="twWho"><b>' + this.esc(x.symName) + ' <em>' + this.esc(x.tf) + '</em></b><span>' + this.esc(x.botName) + ' · ' + this.esc(x.trig) + '</span></div>' +
          '<span class="twTrk big"><u class="' + (x.val >= 0 ? 'up' : 'dn') + '" style="width:' + Math.min(100, Math.abs(x.val) / mx * 100).toFixed(1) + '%"></u></span><b class="twVal ' + (x.val >= 0 ? 'up' : 'dn') + '">' + (x.r != null ? this.sg(x.r, 2, 'R') : this.sg(x.val, 1)) + '</b>' +
          '<span class="twPct"><b>' + Math.round(x.wr) + '%</b><small>won</small></span><span class="twPct"><b class="' + (x.net >= 0 ? 'up' : 'dn') + '">' + this.sg(x.net, 0) + '</b><small>net</small></span>' + ex(x) +
          '<span class="twTag ' + (few ? 'few' : x.h && x.h.steady ? 'yes' : 'no') + '">' + (few ? x.n + ' trades · too few to trust' : x.n + ' trades · ' + (x.h && x.h.steady ? 'earned in both halves' : 'not in both halves')) + '</span>' +
          '<span class="twActs"><button type="button" data-w="strades:' + j + '" title="Show these trades below, on the Classic page">Trades</button><button type="button" data-w="sbot:' + j + '" title="Open this bot’s own page">Bot</button><button type="button" data-w="schart:' + j + '" title="Open this chart">Chart</button></span></div>'; }).join('') + '</div>'
        : '<div class="twEmpty">No setup has ' + this.min + ' trades under these choices. Lower the number, or undo a choice.</div>') +
      '<p class="twNote"><b>How to read it.</b> These are the slices of your own past that did best under your choices. The best slices of any past look better than what follows, and the fewer the trades the less a row means. The exit bar (green target · cyan trailing stop · grey time limit · amber closed by you · red stop-loss) is information only. Nothing is armed from here: to trade a setup live, arm its bot on the Classic live desk and set its instruments and hours there.</p>' +
      (books.length ? '<div class="twBooks"><small>SAVED PLAYBOOKS</small>' + books.map((b, i) => '<span><button type="button" data-w="load:' + i + '" title="Apply these choices again">' + this.esc(b.name) + '<em>' + new Date(b.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' + (b.rows || []).length + ' setups</em></button><button type="button" class="x" data-w="del:' + i + '" title="Delete this playbook">✕</button></span>').join('') + '</div>' : ''); },

  click(e){
    const v = e.target.closest('button[data-tmview]'); if (v){ Face.view(Face.room, v.dataset.tmview); return; }   /* "button": the page itself also carries data-tmview */
    const b = e.target.closest('[data-w]'); if (!b) return; const i = b.dataset.w.indexOf(':'), k = b.dataset.w.slice(0, i), a = b.dataset.w.slice(i + 1), it = this.ix[+a], E = this.eng();
    if (k === 'step'){ this.open = a || null; this.paint(); }
    else if (k === 'rank'){ this.rank = a; this.paint(); }
    else if (k === 'more'){ this.more[a] = true; this.paint(); }
    else if (k === 'tog' && it){ this.toggle(it.dim, it.k); this.commit(); }
    else if (k === 'only' && it){ const keys = this.keys(it.dim), sel = this.sel(it.dim, keys); if (sel.size === 1 && sel.has(it.k)) this.allOf(it.dim); else this.only(it.dim, [it.k]); this.commit(); }
    else if (k === 'look' && it){ E.drill(it.dim, it.k); this.open = null; this.paint(); }
    else if (k === 'pair' && it){ const p = it.pair; this.only(p[0], [p[1]]); this.only(p[2], [p[3]]); this.commit(); }
    else if (k === 'all'){ this.allOf(a); this.commit(); }
    else if (k === 'none'){ this.unpath(a); E.excludes[a] = this.keys(a); this.commit(); }
    else if (k === 'span'){ const [lo, hi] = a.split('-').map(Number), ks = this.keys('hour').filter(x => { const h = parseInt(x, 10); return h >= lo && h <= hi; }); this.only('hour', ks); this.commit(); }
    else if (k === 'reset') this.reset();
    else if (k === 'back' && this.back){ E.path = this.back.path; E.excludes = this.back.excludes; this.back = null; this.open = 'list'; this.commit(); }
    else if (k === 'strades' && it){ const x = it.setup; this.back = { path: E.path.slice(), excludes: JSON.parse(JSON.stringify(E.excludes)) }; for (const [d, val] of [['bot', x.bot], ['sym', x.sym], ['tf', x.tf], ['trigger', x.trig]]) this.only(d, [val]); E.listAll = true; this.open = null; this.commit(); const body = document.getElementById('botBody'); if (body) body.scrollTop = 0; if (typeof toast === 'function') toast('Showing only ' + x.symName + ' ' + x.tf + ' · ' + x.botName + '. “Back to my shortlist” brings your choices back.', 'info'); }
    else if (k === 'sbot' && it){ WorkspaceUI.openBot(it.setup.bot); }
    else if (k === 'schart' && it){ const x = it.setup; WorkspaceUI.openChart(x.sym); if (typeof App !== 'undefined' && App.setTf && x.tf !== '?') setTimeout(() => { try { App.setTf(x.tf); } catch(er){} }, 350); }
    else if (k === 'save'){ const name = prompt('A name for this playbook', 'Playbook ' + new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })); if (name){ this.saveBook(name.trim().slice(0, 60)); this.paint(); if (typeof toast === 'function') toast('Playbook saved on this device. It holds your choices and the list as it stands today.', 'ok'); } }
    else if (k === 'copy'){ const t = this.text(); (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => typeof toast === 'function' && toast('The shortlist is copied.', 'ok'), () => typeof toast === 'function' && toast('Copying is blocked here.', 'warn')); }
    else if (k === 'load') this.loadBook(+a);
    else if (k === 'del'){ const l = this.books(); l.splice(+a, 1); try { localStorage.setItem(this.PB_KEY, JSON.stringify(l)); } catch(er){} this.paint(); }
    else if (k === 'desk'){ Face.view('live', 'classic'); }
  },
};
