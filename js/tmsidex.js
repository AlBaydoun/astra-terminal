/* ASTRA / Timurila — more of the right-hand side panel in the new look.

   CLOCK     a thin strip at the top of the panel: a 24-hour ring with the four trading sessions
             (Sydney, Tokyo, London, New York, each in its own city's time, summer time included),
             which are open now, and the next opening or closing. Click: Classic's full Market Clock.
   HEATMAP   a side tab: every broker market as a tile, coloured by today's % change, in groups.
             Hover: price and the last 24 hours as a line. Click: that chart. Expand: the full Heatmap.
   NEWS      a side tab of its own, full height: news about the open chart first, then the rest;
             filters This market · High impact · All. While it is open, the stream at the foot of the
             panel steps aside so the same headlines do not show twice.

   Only in the new look; Classic's panel is unchanged. Reads prices and headlines only. */
const SidePanels = {
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  base(s){ return String(s || '').replace(/\.(s|m|std)$/i, ''); },
  /* FX sessions in each city's own clock (the usual dealing hours), weekdays */
  SES: [['Sydney', 'Australia/Sydney', 7, 16, '#A78BFA'], ['Tokyo', 'Asia/Tokyo', 9, 18, '#FF6BD6'], ['London', 'Europe/London', 8, 17, '#4FD8F7'], ['New York', 'America/New_York', 8, 17, '#FFB648']],
  ICON: { clock: '<svg class="wsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    heat: '<svg class="wsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="5" rx="1.5"/><rect x="13" y="10" width="8" height="11" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/></svg>',
    news: '<svg class="wsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h13v14H6a2 2 0 0 1-2-2V5Z"/><path d="M17 9h3v8a2 2 0 0 1-2 2M8 9h5M8 13h5M8 16h3"/></svg>' },
  nf: 'rel',

  init(){ const st = this.$('sideTabs'), body = document.querySelector('#sidebar .sideBody'); if (!st || !body || this.$('tab-tsheat')) return;
    /* two more tabs, after Classic's own */
    const add = (id, label, icon) => { const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = id; b.className = 'tsOnlyFace'; b.title = label; b.innerHTML = icon + '<span>' + label.toUpperCase() + '</span>'; st.insertBefore(b, st.querySelector('.sideCtl') || null);
      b.addEventListener('click', () => { st.querySelectorAll('button[data-tab]').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('#sidebar .sidePanel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + id)); try { if (typeof Face !== 'undefined') Face.sideNames(); } catch(e){} this.sync(); }); return b; };
    add('tsclock', 'Clock', this.ICON.clock); add('tsheat', 'Heatmap', this.ICON.heat); add('tsnews', 'News', this.ICON.news);
    const pc = document.createElement('div'); pc.id = 'tab-tsclock'; pc.className = 'sidePanel tsOnlyFace'; pc.innerHTML = '<div class="tcBody" id="tcBody"></div>'; body.appendChild(pc);
    pc.addEventListener('click', e => { const g = e.target.closest('[data-tcg]'), sy = e.target.closest('[data-tcsym]'); if (sy){ this.open(sy.dataset.tcsym); return; } if (g){ this.tcOpen = this.tcOpen === g.dataset.tcg ? null : g.dataset.tcg; this.clockTab(true); } });
    setInterval(() => { if (this.active('tsclock')) this.clockTab(); }, 1000);
    const ph = document.createElement('div'); ph.id = 'tab-tsheat'; ph.className = 'sidePanel tsOnlyFace'; ph.innerHTML = '<div class="tsHHead"><span id="tsHSum"></span><button type="button" data-th="watch" title="Only the markets in your watchlist">Watchlist</button><button type="button" data-th="expand" title="The full Heatmap, full width">Expand ⤢</button></div><div class="tsHBody" id="tsHBody"></div>'; body.appendChild(ph);
    const pn = document.createElement('div'); pn.id = 'tab-tsnews'; pn.className = 'sidePanel tsOnlyFace'; pn.innerHTML = '<div class="tsNfHead" id="tsNfHead"></div><div class="tsNfBody" id="tsNfBody"></div>'; body.appendChild(pn);
    st.addEventListener('click', () => setTimeout(() => this.sync(), 20));
    ph.addEventListener('click', e => { const t = e.target.closest('[data-th]'), tile = e.target.closest('[data-sym]'); if (tile){ this.open(tile.dataset.sym); return; } if (!t) return;
      if (t.dataset.th === 'expand'){ if (typeof Face !== 'undefined') Face.panel('heatmap'); } else if (t.dataset.th === 'watch'){ this.watchOnly = !this.watchOnly; t.classList.toggle('on', this.watchOnly); this.heat(); } });
    ph.addEventListener('mouseover', e => { const tile = e.target.closest('[data-sym]'); if (tile) this.tip(tile); }); ph.addEventListener('mouseleave', () => { const t = this.$('tsHTip'); if (t) t.hidden = true; });
    pn.addEventListener('click', e => { const f = e.target.closest('[data-nf]'); if (f){ this.nf = f.dataset.nf; this.newsTab(); } });
    const tip = document.createElement('div'); tip.id = 'tsHTip'; tip.hidden = true; document.body.appendChild(tip);
    try { BUS.on('symbol', () => setTimeout(() => this.sync(), 700)); } catch(e){}
    setInterval(() => this.sync(), 10000); this.initClock(); this.initAuto(); this.sync(); },

  /* ---------- pinned, or hidden until you reach for it ---------- */
  AKEY: 'astra_side_auto',
  PIN: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6l-1 6 3 3H7l3-3-1-6ZM12 13v7"/></svg>',
  initAuto(){ const ctl = document.querySelector('#sideTabs .sideCtl'), sb = this.$('sidebar'); if (!sb || this.$('tsPin')) return;
    const b = document.createElement('button'); b.type = 'button'; b.id = 'tsPin'; b.className = 'tsOnlyFace'; b.innerHTML = this.PIN; (ctl || this.$('sideTabs')).prepend(b);
    b.addEventListener('click', e => { e.stopPropagation(); this.setAuto(!this.auto); });
    const h = document.createElement('div'); h.id = 'tsSideHandle'; h.className = 'tsOnlyFace'; h.title = 'The side panel: move the mouse here'; h.innerHTML = '<i></i><span>◀</span>'; document.body.appendChild(h);
    h.addEventListener('mouseenter', () => this.peek(true)); h.addEventListener('click', () => this.peek(true));
    sb.addEventListener('mouseenter', () => { clearTimeout(this._hideT); }); sb.addEventListener('mouseleave', () => this.later());
    document.addEventListener('mousemove', e => { if (this.auto && !this.open && e.clientX >= window.innerWidth - 6 && document.documentElement.dataset.tmroom === 'chart') this.peek(true); }, { passive: true });
    window.addEventListener('resize', () => { if (this.auto) this.place(); });
    let on = false; try { on = localStorage.getItem(this.AKEY) === '1'; } catch(e){} this.setAuto(on, true); },
  setAuto(on, quiet){ this.auto = on; try { localStorage.setItem(this.AKEY, on ? '1' : '0'); } catch(e){} const H = document.documentElement; H.classList.toggle('tsSideAuto', on); this.peek(false);
    const b = this.$('tsPin'); if (b){ b.classList.toggle('auto', on); b.title = on ? 'Auto-hide is on: the panel slides in when the mouse reaches the right edge. Click to pin it again.' : 'Pinned. Click to auto-hide the panel and give the chart the full width.'; }
    if (on) this.place(); setTimeout(() => window.dispatchEvent(new Event('resize')), 60); if (!quiet && typeof toast === 'function') toast(on ? 'Side panel: auto-hide. Move the mouse to the right edge to bring it in.' : 'Side panel: pinned', 'info'); },
  /* the panel floats over the chart, from the top of the work area to its foot */
  place(){ const m = this.$('main'); if (!m) return; const r = m.getBoundingClientRect(), H = document.documentElement.style; H.setProperty('--tsSideTop', (r.top + 10) + 'px'); H.setProperty('--tsSideBot', Math.max(8, window.innerHeight - r.bottom + 10) + 'px'); },
  peek(on){ if (on && !this.auto) return; clearTimeout(this._hideT); this.open = on; if (on) this.place(); document.documentElement.classList.toggle('tsSideOpen', !!on); if (on) setTimeout(() => this.sync(), 50); },
  later(){ if (!this.auto) return; clearTimeout(this._hideT); this._hideT = setTimeout(() => { const sb = this.$('sidebar'), a = document.activeElement; if (sb && (sb.matches(':hover') || (a && sb.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)))) return this.later(); this.peek(false); }, 450); },
  open(sym){ try { if (typeof Face !== 'undefined' && Face.room !== 'chart') Face.go('chart'); typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(sym) : App.setSymbol(sym); } catch(e){} },
  active(id){ const p = this.$('tab-' + id); return !!p && p.classList.contains('active') && p.offsetParent !== null; },
  sync(){ const nOn = this.active('tsnews'); document.documentElement.classList.toggle('tsNewsTab', nOn); if (this.active('tsheat')) this.heat(); if (nOn) this.newsTab(); if (this.active('tsclock')) this.clockTab(true); },

  /* ---------- the clock strip ---------- */
  initClock(){ const sb = this.$('sidebar'), st = this.$('sideTabs'); if (!sb || this.$('tsClock')) return; const c = document.createElement('button'); c.type = 'button'; c.id = 'tsClock'; c.className = 'tsOnlyFace'; c.title = 'Trading sessions now · click for the full Market Clock';
    sb.insertBefore(c, st); c.title = 'Trading sessions now · click for a quick look'; c.addEventListener('click', e => { e.stopPropagation(); this.pop(); }); this.clock(); setInterval(() => this.clock(), 20000); },
  /* minutes since midnight in a city, and whether that city's session is open (weekdays only) */
  local(zone, ms){ const p = new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(ms)), g = k => (p.find(x => x.type === k) || {}).value; return { dow: g('weekday'), min: (+g('hour') % 24) * 60 + +g('minute') }; },
  isOpen(s, ms){ const L = this.local(s[1], ms); return !/Sat|Sun/.test(L.dow) && L.min >= s[2] * 60 && L.min < s[3] * 60; },
  clock(){ const el = this.$('tsClock'); if (!el) return; const now = Date.now(), open = this.SES.filter(s => this.isOpen(s, now));
    /* the next change: walk forward minute by minute (cheap: at most a weekend) */
    let next = null; for (let m = 1; m <= 3 * 1440 && !next; m += 1){ const t = now + m * 60000; for (const s of this.SES){ const a = this.isOpen(s, now + (m - 1) * 60000), b = this.isOpen(s, t); if (a !== b){ next = { s, open: b, m }; break; } } }
    const fmt = m => m >= 60 ? Math.floor(m / 60) + 'h ' + (m % 60) + 'm' : m + 'm', R = 22, cx = 28, cy = 28, nowD = new Date(now), myMin = nowD.getHours() * 60 + nowD.getMinutes(), ang = m => (m / 1440) * 2 * Math.PI - Math.PI / 2;
    /* each session as an arc on a 24-hour ring in YOUR time */
    const arcs = this.SES.map((s, k) => { const off = (this.local(s[1], now).min - myMin + 1440 * 2) % 1440, st0 = (s[2] * 60 - off + 1440) % 1440, len = (s[3] - s[2]) * 60, r = R - k * 3.2, a0 = ang(st0), a1 = ang(st0 + len), big = len > 720 ? 1 : 0, on = open.includes(s);
      return '<path d="M' + (cx + r * Math.cos(a0)).toFixed(2) + ' ' + (cy + r * Math.sin(a0)).toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + big + ' 1 ' + (cx + r * Math.cos(a1)).toFixed(2) + ' ' + (cy + r * Math.sin(a1)).toFixed(2) + '" stroke="' + s[4] + '" stroke-width="2.4" fill="none" stroke-linecap="round" opacity="' + (on ? 1 : 0.28) + '"/>'; }).join('');
    const a = ang(myMin), hand = '<line x1="' + cx + '" y1="' + cy + '" x2="' + (cx + (R + 3) * Math.cos(a)).toFixed(2) + '" y2="' + (cy + (R + 3) * Math.sin(a)).toFixed(2) + '" stroke="#E6EEFF" stroke-width="1.6" stroke-linecap="round"/><circle cx="' + cx + '" cy="' + cy + '" r="2.4" fill="#E6EEFF"/>';
    const wk = !open.length && /Sat|Sun/.test(this.local('America/New_York', now).dow);
    el.innerHTML = '<svg viewBox="0 0 56 56">' + arcs + hand + '</svg><div class="tsCk"><div class="tsCkS">' + this.SES.map(s => '<span class="' + (open.includes(s) ? 'on' : '') + '" style="--c:' + s[4] + '">' + s[0] + '</span>').join('') + '</div><b>' + (open.length >= 2 ? this.esc(open.map(s => s[0]).join(' + ')) + ' overlap' : open.length ? this.esc(open[0][0]) + ' session' : wk ? 'Weekend · forex closed' : 'Between sessions') + '</b>' +
      (next ? '<small>' + this.esc(next.s[0]) + (next.open ? ' opens' : ' closes') + ' in ' + fmt(next.m) + '</small>' : '') + '</div>'; },


  /* ---------- the Clock tab: Classic's Market Clock, redrawn ---------- */
  pad(n){ return String(n).padStart(2, '0'); },
  hms(ms){ const t = Math.max(0, Math.ceil(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor(t / 60) % 60, x = t % 60; return (h >= 24 ? Math.floor(h / 24) + 'd ' + (h % 24) + 'h' : h + ':' + this.pad(m) + ':' + this.pad(x)); },
  inZone(zone, ms){ return new Intl.DateTimeFormat('en-GB', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms)); },
  /* the open stretches of a market group inside YOUR day, as fractions of 24 hours */
  dayBars(p, sym, now){ if (typeof MarketClock === 'undefined') return []; const d0 = new Date(now); d0.setHours(0, 0, 0, 0); const a = d0.getTime(), b = a + 86400000, out = [];
    for (let k = -1; k <= 1; k++){ const day = MarketClock.day(a + k * 86400000 + 43200000, p.zone); for (const [x, y] of MarketClock.ranges(p, day, sym)){ const s0 = Math.max(a, MarketClock.instant(day, x, p.zone)), s1 = Math.min(b, MarketClock.instant(day, y, p.zone)); if (s1 > s0) out.push([(s0 - a) / 86400000, (s1 - a) / 86400000]); } }
    return out; },
  groups(){ if (typeof MarketClock === 'undefined') return []; let syms = []; try { syms = MarketSources.brokerList(); } catch(e){} const by = {}; for (const s of syms){ let g = 'other'; try { g = MarketClock.group(s); } catch(e){} (by[g] = by[g] || []).push(s); }
    return MarketClock.profiles.filter(p => p.id !== 'other' && (by[p.id] || []).length).map(p => ({ p, syms: by[p.id] })); },
  clockTab(full){ const el = this.$('tcBody'); if (!el) return; const now = Date.now(), d = new Date(now), myMin = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60, zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const G = this.groups(), st = G.map(g => ({ g, s: MarketClock.status(g.p, now, g.syms[0]) }));
    if (!full && this._tcBuilt){ /* every second: only the numbers and the hands */
      const t = el.querySelector('.tcTime'); if (t) t.innerHTML = this.pad(d.getHours()) + '<i>:</i>' + this.pad(d.getMinutes()) + '<small>' + this.pad(d.getSeconds()) + '</small>';
      for (const x of st){ const r = el.querySelector('[data-tcg="' + x.g.p.id + '"]'); if (!r) continue; const cd = r.querySelector('.tcCd'); if (cd) cd.textContent = x.s.next ? this.hms(x.s.next - now) : '—'; if (r.classList.contains('on') !== !!x.s.open) return this.clockTab(true); }
      for (const n of el.querySelectorAll('.tcNow')) n.style.left = (myMin / 1440 * 100).toFixed(3) + '%';
      const hand = el.querySelector('.tcHand'); if (hand) hand.setAttribute('transform', 'rotate(' + (myMin / 1440 * 360).toFixed(2) + ' 70 70)');
      const sh = el.querySelector('.tcSecHand'); if (sh) sh.setAttribute('transform', 'rotate(' + (d.getSeconds() * 6) + ' 70 70)');
      for (const c of el.querySelectorAll('[data-tcity]')){ const s = this.SES.find(x => x[0] === c.dataset.tcity); c.querySelector('b').textContent = this.inZone(s[1], now); }
      return; }
    this._tcBuilt = true; const open = this.SES.filter(s => this.isOpen(s, now)), openG = st.filter(x => x.s.open).length;
    /* the 24-hour dial: the four sessions as rings, your time on the hand */
    const R0 = 58, arcs = this.SES.map((s, k) => { const off = (this.local(s[1], now).min - Math.floor(myMin) + 2880) % 1440, s0 = (s[2] * 60 - off + 1440) % 1440, len = (s[3] - s[2]) * 60, r = R0 - k * 7, A = m => m / 1440 * 2 * Math.PI - Math.PI / 2, a0 = A(s0), a1 = A(s0 + len), on = open.includes(s);
      return '<circle cx="70" cy="70" r="' + r + '" fill="none" stroke="rgba(126,156,224,.08)" stroke-width="5"/><path d="M' + (70 + r * Math.cos(a0)).toFixed(2) + ' ' + (70 + r * Math.sin(a0)).toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (len > 720 ? 1 : 0) + ' 1 ' + (70 + r * Math.cos(a1)).toFixed(2) + ' ' + (70 + r * Math.sin(a1)).toFixed(2) + '" stroke="' + s[4] + '" stroke-width="5" fill="none" stroke-linecap="round" opacity="' + (on ? 1 : 0.3) + '"' + (on ? ' filter="url(#tcGlow)"' : '') + '/>'; }).join('');
    const ticks = [0, 6, 12, 18].map(h => { const a = h / 24 * 2 * Math.PI - Math.PI / 2; return '<text x="' + (70 + 68 * Math.cos(a)).toFixed(1) + '" y="' + (70 + 68 * Math.sin(a) + 3).toFixed(1) + '" text-anchor="middle">' + this.pad(h) + '</text>'; }).join('');
    const dial = '<svg class="tcDial" viewBox="-4 -4 148 148"><defs><filter id="tcGlow"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>' + arcs + ticks +
      '<g class="tcHand" transform="rotate(' + (myMin / 1440 * 360).toFixed(2) + ' 70 70)"><line x1="70" y1="70" x2="70" y2="6" stroke="#E6EEFF" stroke-width="2" stroke-linecap="round"/></g><g class="tcSecHand" transform="rotate(' + d.getSeconds() * 6 + ' 70 70)"><line x1="70" y1="74" x2="70" y2="38" stroke="#4FD8F7" stroke-width="1" opacity=".7"/></g><circle cx="70" cy="70" r="3.5" fill="#E6EEFF"/></svg>';
    const head = '<div class="tcHead">' + dial + '<div class="tcNowBox"><div class="tcTime">' + this.pad(d.getHours()) + '<i>:</i>' + this.pad(d.getMinutes()) + '<small>' + this.pad(d.getSeconds()) + '</small></div><span>' + d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }) + '</span><em>' + this.esc(zone) + '</em>' +
      '<div class="tcMini"><span>UTC <b>' + this.inZone('UTC', now) + '</b></span><span>Broker <b>' + this.inZone('Europe/Helsinki', now) + '</b></span></div><div class="tcOpenN"><b>' + openG + '</b> of ' + G.length + ' market groups open</div></div></div>';
    const cities = '<div class="tcCities">' + this.SES.map(s => { const on = open.includes(s); return '<div class="tcCity' + (on ? ' on' : '') + '" data-tcity="' + s[0] + '" style="--c:' + s[4] + '"><i></i><span>' + s[0] + '</span><b>' + this.inZone(s[1], now) + '</b><small>' + (on ? 'open' : 'closed') + '</small></div>'; }).join('') + '</div>';
    const hours = '<div class="tcScale"><span>00</span><span>06</span><span>12</span><span>18</span><span>24</span></div>';
    const rows = st.map(({ g, s }) => { const p = g.p, bars = this.dayBars(p, g.syms[0], now), op = this.tcOpen === p.id;
      return '<div class="tcRow' + (s.open ? ' on' : '') + (op ? ' open' : '') + '" data-tcg="' + p.id + '" style="--c:' + p.color + '"><div class="tcRowTop"><span class="tcIc">' + p.icon + '</span><b>' + this.esc(p.name) + '</b><u>' + (s.open ? 'OPEN' : s.label === 'Exchange holiday' ? 'HOLIDAY' : 'CLOSED') + '</u><span class="tcWhen">' + (s.next ? (s.open ? 'closes in ' : 'opens in ') : '') + '<b class="tcCd">' + (s.next ? this.hms(s.next - now) : '—') + '</b></span></div>' +
        '<div class="tcBar">' + bars.map(x => '<i style="left:' + (x[0] * 100).toFixed(2) + '%;width:' + ((x[1] - x[0]) * 100).toFixed(2) + '%"></i>').join('') + '<em class="tcNow" style="left:' + (myMin / 1440 * 100).toFixed(3) + '%"></em></div>' +
        (op ? '<div class="tcSyms"><small>' + g.syms.length + ' instruments · ' + this.esc(p.sub) + (s.next ? ' · ' + (s.open ? 'closes ' : 'opens ') + new Date(s.next).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '') + '</small><div>' + g.syms.slice(0, 30).map(x => '<button type="button" data-tcsym="' + this.esc(x) + '">' + this.esc(this.base(x)) + '</button>').join('') + (g.syms.length > 30 ? '<em>+' + (g.syms.length - 30) + '</em>' : '') + '</div></div>' : '') + '</div>'; }).join('');
    el.innerHTML = head + cities + '<small class="tcCap">YOUR MARKETS TODAY · your time</small>' + hours + '<div class="tcRows">' + rows + '</div><p class="tcNote">Hours are the broker’s published sessions and exchange calendars: a guide for planning, not a promise that a market is trading.</p>'; },
  /* the strip: a small card for a few seconds */
  pop(){ let c = this.$('tsClockPop'); if (c && !c.hidden){ c.hidden = true; return; } if (!c){ c = document.createElement('div'); c.id = 'tsClockPop'; c.className = 'tsOnlyFace'; document.body.appendChild(c);
      c.addEventListener('mouseenter', () => clearTimeout(this._popT)); c.addEventListener('mouseleave', () => this.popLater(2500));
      c.addEventListener('click', e => { const b = e.target.closest('[data-tcp]'); if (!b) return; c.hidden = true; const t = document.querySelector('#sideTabs [data-tab="tsclock"]'); if (t) t.click(); if (this.auto) this.peek(true); }); }
    const now = Date.now(), open = this.SES.filter(s => this.isOpen(s, now)), r = this.$('tsClock').getBoundingClientRect(), G = this.groups(), st = G.map(g => ({ g, s: MarketClock.status(g.p, now, g.syms[0]) }));
    c.innerHTML = '<div class="tcpHead"><b>' + new Date(now).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + '</b><span>' + (open.length ? this.esc(open.map(s => s[0]).join(' + ')) + (open.length > 1 ? ' overlap' : ' session') : 'Between sessions') + '</span></div>' +
      '<div class="tcpCities">' + this.SES.map(s => { const on = open.includes(s); return '<div class="' + (on ? 'on' : '') + '" style="--c:' + s[4] + '"><i></i><span>' + s[0] + '</span><b>' + this.inZone(s[1], now) + '</b></div>'; }).join('') + '</div>' +
      '<div class="tcpRows">' + st.map(({ g, s }) => '<div class="' + (s.open ? 'on' : '') + '" style="--c:' + g.p.color + '"><span>' + g.p.icon + ' ' + this.esc(g.p.name) + '</span><b>' + (s.next ? (s.open ? 'closes ' : 'opens ') + this.hms(s.next - now) : '—') + '</b></div>').join('') + '</div><button type="button" data-tcp="1">Open the Clock tab</button><i class="tcpLife"></i>';
    c.style.top = (r.bottom + 8) + 'px'; c.style.left = Math.max(90, Math.min(window.innerWidth - 300, r.left)) + 'px'; c.hidden = false; c.classList.remove('go'); void c.offsetWidth; c.classList.add('go'); this.popLater(6000); },
  popLater(ms){ clearTimeout(this._popT); this._popT = setTimeout(() => { const c = this.$('tsClockPop'); if (c && !c.matches(':hover')) c.hidden = true; }, ms); },
  /* ---------- the heatmap tab ---------- */
  tiles(){ let list = []; try { list = (typeof MarketSources !== 'undefined' && MarketSources.brokerList ? MarketSources.brokerList() : STORE.universe || []).map(s => { const t = STORE.tickers.get(s); return t && Number.isFinite(t.pct) ? { sym: s, pct: t.pct, px: t.price || t.last || t.close } : null; }).filter(Boolean); } catch(e){}
    if (this.watchOnly && typeof Watch !== 'undefined'){ const w = new Set((Watch.list || []).map(s => this.base(s).toUpperCase())); list = list.filter(x => w.has(this.base(x.sym).toUpperCase())); } return list; },
  col(p){ const a = Math.min(1, Math.abs(p) / 3), base = p >= 0 ? [61, 220, 151] : [255, 107, 122]; return 'rgba(' + base.join(',') + ',' + (0.12 + a * 0.68).toFixed(2) + ')'; },
  heat(){ const el = this.$('tsHBody'); if (!el) return; const list = this.tiles(); if (!list.length){ el.innerHTML = '<div class="tsNEmpty">Waiting for prices…</div>'; return; }
    const G = (typeof Heat !== 'undefined' && Heat.groups) ? Heat.groups() : {}, gOf = s => { try { return Heat.groupOf(s); } catch(e){ return 'other'; } }, by = {}; for (const x of list) (by[gOf(x.sym)] = by[gOf(x.sym)] || []).push(x);
    const keys = Object.keys(by).sort((a, b) => (Object.keys(G).indexOf(a) + 1 || 99) - (Object.keys(G).indexOf(b) + 1 || 99)), up = list.filter(x => x.pct > 0).length;
    this.$('tsHSum').innerHTML = '<b class="up">' + up + '</b> up · <b class="dn">' + (list.length - up) + '</b> down today';
    el.innerHTML = keys.map(k => { const L = by[k].sort((a, b) => b.pct - a.pct), avg = L.reduce((s, x) => s + x.pct, 0) / L.length;
      return '<section><h4>' + this.esc((G[k] && G[k].label) || k) + '<em class="' + (avg >= 0 ? 'up' : 'dn') + '">' + (avg >= 0 ? '+' : '') + avg.toFixed(2) + '%</em><small>' + L.length + '</small></h4><div class="tsHGrid">' +
        L.slice(0, 40).map(x => '<button type="button" data-sym="' + this.esc(x.sym) + '" style="background:' + this.col(x.pct) + '"' + (x.sym === STORE.symbol ? ' class="here"' : '') + '><b>' + this.esc(this.base(x.sym)) + '</b><span>' + (x.pct >= 0 ? '+' : '') + x.pct.toFixed(2) + '%</span></button>').join('') + (L.length > 40 ? '<i>+' + (L.length - 40) + ' more in Expand</i>' : '') + '</div></section>'; }).join(''); },
  spark: {},
  async tip(tile){ const t = this.$('tsHTip'), sym = tile.dataset.sym, r = tile.getBoundingClientRect(), x = this.tiles().find(y => y.sym === sym); if (!t || !x) return; this._tipSym = sym;
    t.hidden = false; t.style.top = Math.max(60, Math.min(window.innerHeight - 150, r.top - 20)) + 'px'; t.style.left = Math.max(80, r.left - 250) + 'px';
    const draw = arr => { if (!arr || arr.length < 2) return ''; const lo = Math.min(...arr), hi = Math.max(...arr), W = 210, Hh = 50; return '<svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none"><polyline fill="none" stroke="' + (arr[arr.length - 1] >= arr[0] ? '#3DDC97' : '#FF6B7A') + '" stroke-width="1.6" points="' + arr.map((v, i) => (i / (arr.length - 1) * W).toFixed(1) + ',' + (Hh - 3 - (v - lo) / ((hi - lo) || 1) * (Hh - 6)).toFixed(1)).join(' ') + '"/></svg>'; };
    const head = '<b>' + this.esc(this.base(sym)) + '</b><span class="' + (x.pct >= 0 ? 'up' : 'dn') + '">' + (x.pct >= 0 ? '+' : '') + x.pct.toFixed(2) + '% today</span>' + (x.px ? '<em>' + Number(x.px).toLocaleString('en-US', { maximumFractionDigits: 5 }) + '</em>' : '');
    const c = this.spark[sym]; t.innerHTML = head + (c && Date.now() - c.at < 300000 ? draw(c.v) + '<small>last 24 hours · click to open the chart</small>' : '<small>reading the last 24 hours…</small>');
    if (c && Date.now() - c.at < 300000) return; try { const b = await API.klines(sym, '1h', 24); this.spark[sym] = { at: Date.now(), v: b.map(k => k.close) }; if (this._tipSym === sym && !t.hidden) t.innerHTML = head + draw(this.spark[sym].v) + '<small>last 24 hours · click to open the chart</small>'; } catch(e){} },

  /* ---------- the news tab ---------- */
  newsTab(){ const head = this.$('tsNfHead'), body = this.$('tsNfBody'); if (!body || typeof Side === 'undefined') return; const all = Side.news(), base = this.base(STORE.symbol), rel = all.filter(n => n.rel), high = all.filter(n => n.impact >= 3);
    head.innerHTML = [['rel', 'This market', rel.length], ['high', 'High impact', high.length], ['all', 'All', all.length]].map(f => '<button type="button" data-nf="' + f[0] + '" class="' + (this.nf === f[0] ? 'on' : '') + '">' + f[1] + ' <small>' + f[2] + '</small></button>').join('') + '<button type="button" class="tsNfFull" title="All the news, full screen" onclick="Face.go(\'news\')">⤢</button>';
    const list = this.nf === 'rel' ? rel : this.nf === 'high' ? high : all;
    if (!list.length){ body.innerHTML = '<div class="tsNEmpty">' + (all.length ? (this.nf === 'rel' ? 'Nothing about ' + this.esc(base) + ' right now.' : 'No high-impact news right now.') + ' <button type="button" data-nf="all">Show all</button>' : 'Reading the news…') + '</div>'; return; }
    body.innerHTML = list.slice(0, 60).map((n, i) => { const url = MarketNews.safeUrl(n.url), mins = n.publishedAt ? Math.max(0, Math.round((Date.now() - n.publishedAt) / 60000)) : null, age = mins == null ? '' : mins < 60 ? mins + 'm ago' : mins < 1440 ? Math.round(mins / 60) + 'h ago' : Math.round(mins / 1440) + 'd ago';
      return '<a class="tsNfItem lvl' + n.impact + (n.rel ? ' rel' : '') + '" style="animation-delay:' + Math.min(i, 12) * 30 + 'ms"' + (url ? ' href="' + this.esc(url) + '" target="_blank" rel="noopener noreferrer"' : '') + '><span class="tsNTop">' + (n.rel === 2 ? '<em>' + this.esc(base) + '</em>' : '') + '<i>' + this.esc(n.topic) + '</i><u class="imp' + n.impact + '">' + (n.impact >= 3 ? 'high' : n.impact === 2 ? 'watch' : 'context') + '</u><time>' + age + '</time></span><b>' + this.esc(n.title) + '</b><p>' + this.esc(n.why) + '</p><small>' + this.esc(n.source || '') + '</small></a>'; }).join(''); },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => { try { SidePanels.init(); } catch(e){ console.warn('side panels', e); } }, 1700));
