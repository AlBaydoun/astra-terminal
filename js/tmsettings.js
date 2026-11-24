/* ASTRA · Markets Terminal — Settings, the new look's control room.

   At the top, every bot as a point of light on a turning 3D sphere (green running, amber paused,
   red locked, grey switched off; bigger = more trades). Drag it, point at a bot to name it,
   click to open its studio. Beside it, the health of the whole terminal.

   Then the sections:
     · Bots on / off ... one trading card per paper bot: its equity curve, its numbers, a power switch
     · Look & motion ... Classic look, the right panel, calmer motion
     · Connections ..... MetaTrader bridge, price feed, cloud sync (read only)
     · Safety .......... what the live desk is set to (read only: it is changed only on the live desk)
     · Storage ......... what ASTRA keeps on this computer
     · Shortcuts ....... every key, and where to change them
     · Bot menu ........ which pages the All bots list shows

   Every switch calls the SAME functions the Classic pages call (Bots.setDisabled, Bots.setPaused,
   Bots.resetBot, Bots.setAllOn, WorkspaceUI.setHidden, Face.setClassic, SidePanels.setAuto), with
   the same confirmations. Nothing here arms a bot for real money or sends an order. */
'use strict';
const TmSettings = window.TmSettings = {
  host: null, filter: 'all', q: '', offOpen: false, timer: 0, _sig: '', _offCache: {},
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  num(v, d){ return Number(v || 0).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 }); },
  sg(v, d){ return (v > 0 ? '+' : v < 0 ? '−' : '') + this.num(Math.abs(v), d); },
  name(b){ return typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.name(b) : String(b.name || b.id); },
  ready(){ return typeof Bots !== 'undefined' && typeof BOTS !== 'undefined' && typeof BotEngine !== 'undefined'; },
  calm(){ try { return localStorage.getItem('astra_calm') === '1'; } catch(e){ return false; } },
  /* scroll a section to the top of its scroller: smoothly where the browser does that, and straight there if it does not */
  scrollTo(box, el){ if (!box || !el) return; const top = Math.max(0, el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 8), from = box.scrollTop; if (this.calm()){ box.scrollTop = top; return; } try { box.scrollTo({ top, behavior: 'smooth' }); } catch(e){ box.scrollTop = top; } setTimeout(() => { if (box.scrollTop === from && Math.abs(top - from) > 4) box.scrollTop = top; }, 450); },
  COL: { running: '#3DDC97', paused: '#FFB648', locked: '#FF6B7A', off: '#5D6C8A' },
  LABEL: { running: 'Running', paused: 'Paused', locked: 'Locked', off: 'Switched off' },
  ABOUT: { running: 'On and trading on paper', paused: 'Paused by you: opens nothing new', locked: 'Paper account under its minimum: reset it to trade again', off: 'Switched off: gone from every list, record kept' },

  /* ---------- the facts of every paper bot ---------- */
  strategy(b){ return !!b && !b.manual && !b.liveManual && !(typeof Bots !== 'undefined' && Bots.isPage(b)); },
  bots(){ const on = BOTS.filter(b => this.strategy(b) && !Bots.disabled(b.id)), off = (Bots.offBots ? Bots.offBots() : []).filter(b => !b.manual && !b.liveManual);
    return (Bots.ordered ? Bots.ordered(on) : on).concat(off.slice().sort((a, b) => this.name(a).localeCompare(this.name(b)))).map(b => this.fact(b)); },
  fact(b){ const off = Bots.disabled(b.id); let cfg, L;
    if (off){ const c = this._offCache[b.id]; if (c){ cfg = c.cfg; L = c.L; } else { cfg = (typeof lsGet === 'function' ? lsGet('astra_botcfg_' + b.id, {}) : {}) || {}; try { L = BotEngine.load(b.id); } catch(e){ L = null; } this._offCache[b.id] = { cfg, L }; } }
    else { cfg = Bots.cfg(b.id) || {}; L = Bots.ledger(b.id); }
    let min = 0; try { min = BotEngine.rules(cfg).minEquity || 0; } catch(e){}
    const start = (L && L.startEquity) || (BotEngine.RISK && BotEngine.RISK.startEquity) || 10000, eq = L && Number.isFinite(L.equity) ? L.equity : start, closed = ((L && L.closed) || []).slice().sort((a, b) => (a.exitTime || 0) - (b.exitTime || 0));
    const locked = !!(L && Number.isFinite(L.equity) && L.equity < min), state = off ? 'off' : cfg.paused ? 'paused' : locked ? 'locked' : 'running';
    let live = ''; try { const a = typeof Live !== 'undefined' ? Live.armedEntry(b.id) : null; if (a) live = a.mode === 'live' ? 'live' : 'shadow'; } catch(e){}
    let run = start; const curve = [start].concat(closed.map(t => (run += (t.pnl || 0))));
    return { b, id: b.id, name: this.name(b), state, eq, start, min, trades: closed.length, won: closed.length ? Math.round(100 * closed.filter(t => t.pnl > 0).length / closed.length) : null, open: ((L && L.open) || []).length, live, tf: cfg.tf || (b.defaults && b.defaults.tf) || '', curve };
  },

  /* ---------- small drawings shared with the bot studio ---------- */
  spark(vals, w, h, col, id){ w = w || 240; h = h || 64; if (!vals || vals.length < 2) return '<svg class="crSpark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><line x1="0" x2="' + w + '" y1="' + (h / 2) + '" y2="' + (h / 2) + '" class="base"/><text x="' + (w / 2) + '" y="' + (h / 2 - 6) + '" text-anchor="middle">no closed trade yet</text></svg>';
    const v = vals.length > 160 ? vals.filter((_, i) => i % Math.ceil(vals.length / 160) === 0 || i === vals.length - 1) : vals, lo = Math.min(...v), hi = Math.max(...v), sp = hi - lo || 1, X = i => i / (v.length - 1) * w, Y = x => h - 4 - (x - lo) / sp * (h - 10);
    const pts = v.map((x, i) => X(i).toFixed(1) + ',' + Y(x).toFixed(1)).join(' '), up = v[v.length - 1] >= v[0], c = col || (up ? '#3DDC97' : '#FF6B7A'), g = 'tsg' + (id || Math.random().toString(36).slice(2, 8)), base = Y(v[0]).toFixed(1);
    return '<svg class="crSpark" viewBox="0 0 ' + w + ' ' + h + '" preserveAspectRatio="none"><defs><linearGradient id="' + g + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + c + '" stop-opacity=".38"/><stop offset="1" stop-color="' + c + '" stop-opacity="0"/></linearGradient></defs>' +
      '<line x1="0" x2="' + w + '" y1="' + base + '" y2="' + base + '" class="base"/><polygon points="0,' + h + ' ' + pts + ' ' + w + ',' + h + '" fill="url(#' + g + ')" class="area"/><polyline points="' + pts + '" fill="none" stroke="' + c + '" stroke-width="2" stroke-linejoin="round" class="line" pathLength="1"/><circle cx="' + X(v.length - 1).toFixed(1) + '" cy="' + Y(v[v.length - 1]).toFixed(1) + '" r="3.2" fill="' + c + '" class="dot"/></svg>'; },
  ring(pct, col, size){ size = size || 38; const r = size / 2 - 4, c = 2 * Math.PI * r, p = Math.max(0, Math.min(100, pct || 0));
    return '<svg class="crRing" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size + '"><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="bg"/><circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" class="fg" stroke="' + col + '" stroke-dasharray="' + c.toFixed(1) + '" stroke-dashoffset="' + c.toFixed(1) + '" data-off="' + (c * (1 - p / 100)).toFixed(1) + '"/></svg>'; },
  /* rings and numbers grow into place once they are on screen */
  animate(root){ if (!root) return; requestAnimationFrame(() => { root.querySelectorAll('.crRing .fg[data-off]').forEach(el => { el.style.strokeDashoffset = el.dataset.off; el.removeAttribute('data-off'); });
      root.querySelectorAll('[data-count]').forEach(el => { const to = +el.dataset.count, d = +(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || ''; el.removeAttribute('data-count'); if (this.calm() || !isFinite(to)){ el.textContent = pre + this.num(to, d) + suf; return; } const t0 = performance.now(), go = now => { const k = Math.min(1, (now - t0) / 900), e = 1 - Math.pow(1 - k, 3); el.textContent = pre + this.num(to * e, d) + suf; if (k < 1) requestAnimationFrame(go); }; requestAnimationFrame(go); }); }); },

  /* ---------- the 3D sphere of bots ---------- */
  orbit(cv, list){ if (!cv) return; const self = this, N = list.length, still = this.calm() || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches), maxT = Math.max(1, ...list.map(f => f.trades));
    const pts = list.map((f, i) => { const y = 1 - (i + 0.5) / N * 2, rr = Math.sqrt(1 - y * y), th = i * 2.39996; return { f, x: Math.cos(th) * rr, y, z: Math.sin(th) * rr, s: 3 + 6 * Math.sqrt(f.trades / maxT), ph: Math.random() * 6.28 }; });
    let yaw = 0.4, pitch = 0.32, drag = null, hover = null, last = 0, t = 0, mx = null, my = null; const tip = cv.parentElement.querySelector('.crOrbTip');
    cv.style.touchAction = 'none';
    cv.onpointerdown = e => { drag = { x: e.clientX, y: e.clientY, yaw, pitch, moved: 0 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; };
    cv.onpointermove = e => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; if (drag){ const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy)); yaw = drag.yaw + dx * 0.008; pitch = Math.max(-1.1, Math.min(1.1, drag.pitch + dy * 0.006)); } };
    cv.onpointerup = () => { const d = drag; drag = null; cv.style.cursor = 'grab'; if (d && d.moved < 5 && hover && typeof Face !== 'undefined' && Face.studio && hover.f.state !== 'off') Face.studio(hover.f.id); };
    cv.onpointerleave = () => { mx = null; hover = null; if (tip) tip.style.opacity = 0; };
    const frame = now => { if (!cv.isConnected) return; requestAnimationFrame(frame); if (document.hidden || cv.offsetParent === null) return; const dt = Math.min(0.1, (now - last) / 1000 || 0.016); if (now - last < 28) return; last = now; t += dt; if (!drag && !hover && !still) yaw += dt * 0.16;
      const dpr = window.devicePixelRatio || 1, w = cv.clientWidth, h = cv.clientHeight; if (cv.width !== Math.round(w * dpr)){ cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); } const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, w, h);
      const R = Math.min(w, h) * 0.36, cx = w / 2, cy = h / 2, cyw = Math.cos(yaw), syw = Math.sin(yaw), cp = Math.cos(pitch), spp = Math.sin(pitch);
      const P = (x, y, z) => { const x1 = x * cyw + z * syw, z1 = -x * syw + z * cyw, y1 = y * cp - z1 * spp, z2 = y * spp + z1 * cp, k = 3.2 / (3.2 + z2); return { x: cx + x1 * R * k, y: cy - y1 * R * k, k, z: z2 }; };
      /* the rings, each with a light running along it */
      const rings = [[1.32, 0, '#4FD8F7'], [1.5, 1.05, '#A78BFA'], [1.18, -0.9, '#3DDC97']];
      for (const [rad, tilt, col] of rings){ c.beginPath(); for (let a = 0; a <= 64; a++){ const u = a / 64 * 6.283, x = Math.cos(u) * rad, z = Math.sin(u) * rad, y = z * Math.sin(tilt), zz = z * Math.cos(tilt), p = P(x, y, zz); a ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y); } c.strokeStyle = col; c.globalAlpha = 0.16; c.lineWidth = 1; c.stroke();
        for (let q = 0; q < 3; q++){ const u = t * 0.5 * (1 + q * 0.13) + q * 2.1 + tilt, x = Math.cos(u) * rad, z = Math.sin(u) * rad, p = P(x, z * Math.sin(tilt), z * Math.cos(tilt)); c.globalAlpha = 0.55 + 0.3 * Math.sin(t * 3 + q); c.fillStyle = col; c.beginPath(); c.arc(p.x, p.y, 1.8 * p.k, 0, 6.283); c.fill(); } }
      c.globalAlpha = 1;
      /* the core */
      const pulse = 1 + 0.06 * Math.sin(t * 2), g = c.createRadialGradient(cx - R * 0.08, cy - R * 0.1, 2, cx, cy, R * 0.3 * pulse); g.addColorStop(0, 'rgba(230,251,255,.95)'); g.addColorStop(0.35, 'rgba(79,216,247,.55)'); g.addColorStop(1, 'rgba(79,216,247,0)'); c.fillStyle = g; c.beginPath(); c.arc(cx, cy, R * 0.3 * pulse, 0, 6.283); c.fill();
      /* the bots, far ones first */
      const proj = pts.map(p => Object.assign(p, { q: P(p.x, p.y, p.z) })).sort((a, b) => b.q.z - a.q.z); let best = null, bd = 18;
      for (const p of proj){ if (mx != null){ const d = Math.hypot(p.q.x - mx, p.q.y - my); if (d < bd){ bd = d; best = p; } } }
      hover = drag ? null : best;
      for (const p of proj){ const col = self.COL[p.f.state], far = (p.q.z + 1) / 2, a = 0.35 + 0.65 * (1 - far), r = p.s * p.q.k * (p === hover ? 1.6 : 1), tw = p.f.state === 'paused' ? 0.55 + 0.45 * Math.sin(t * 5 + p.ph) : 1;
        if (p.f.state === 'running' && p.q.z < 0.2){ c.strokeStyle = col; c.globalAlpha = 0.07 * a; c.beginPath(); c.moveTo(cx, cy); c.lineTo(p.q.x, p.q.y); c.stroke(); }
        const gg = c.createRadialGradient(p.q.x, p.q.y, 0, p.q.x, p.q.y, r * 3); gg.addColorStop(0, col); gg.addColorStop(1, 'rgba(0,0,0,0)'); c.globalAlpha = 0.35 * a * tw; c.fillStyle = gg; c.beginPath(); c.arc(p.q.x, p.q.y, r * 3, 0, 6.283); c.fill();
        c.globalAlpha = a * tw; c.fillStyle = col; c.beginPath(); c.arc(p.q.x, p.q.y, r, 0, 6.283); c.fill(); if (p.f.live){ c.strokeStyle = '#FFB648'; c.lineWidth = 1.5; c.globalAlpha = a; c.beginPath(); c.arc(p.q.x, p.q.y, r + 3, 0, 6.283); c.stroke(); } }
      c.globalAlpha = 1;
      if (tip){ if (hover){ const f = hover.f; tip.innerHTML = '<b>' + self.esc(f.name) + '</b><span style="color:' + self.COL[f.state] + '">' + self.LABEL[f.state] + (f.live ? ' · armed ' + f.live : '') + '</span><span>' + self.num(f.eq) + ' equity · ' + f.trades + ' trades</span>' + (f.state !== 'off' ? '<em>click to open its studio</em>' : ''); tip.style.opacity = 1; tip.style.left = Math.min(w - tip.offsetWidth - 6, hover.q.x + 14) + 'px'; tip.style.top = Math.max(4, hover.q.y - 16) + 'px'; cv.style.cursor = 'pointer'; } else { tip.style.opacity = 0; if (!drag) cv.style.cursor = 'grab'; } } };
    requestAnimationFrame(frame); },

  /* ---------- one bot's card ---------- */
  card(f){ const ch = f.eq - f.start, pct = f.start ? ch / f.start * 100 : 0, off = f.state === 'off', id = this.esc(f.id);
    return '<div class="crCard ' + f.state + '" data-sid="' + id + '" data-sname="' + this.esc((f.name + ' ' + f.id + ' ' + this.LABEL[f.state] + ' ' + f.state + ' ' + f.tf + (f.live ? ' armed ' + f.live : '')).toLowerCase()) + '">' +
      '<div class="crCardHead"><i class="crDot" title="' + this.esc(this.ABOUT[f.state]) + '"></i><b title="' + this.esc(f.name) + '">' + this.esc(f.name) + '</b>' + (f.tf ? '<span class="crTf">' + this.esc(f.tf) + '</span>' : '') +
        '<label class="crSw" title="' + (off ? 'Switch this bot on: it comes back exactly as it was' : 'Switch this bot off: it leaves every list and opens nothing new; its record is kept') + '"><input type="checkbox" data-s="power:' + id + '"' + (off ? '' : ' checked') + '><i></i></label></div>' +
      (f.live ? '<span class="crArmed ' + f.live + '" title="Armed on the Classic live desk. Arming and disarming happen only there.">' + (f.live === 'live' ? '● LIVE · real money' : '● armed · shadow') + '</span>' : '') +
      '<button type="button" class="crCardChart" data-s="open:' + id + '" title="' + (off ? 'Switch it on to open its studio' : 'Open this bot’s studio') + '">' + this.spark(f.curve, 260, 70, null, f.id) + '<span class="crState">' + this.LABEL[f.state] + '</span></button>' +
      '<div class="crKpis"><div><small>EQUITY</small><b>' + this.num(f.eq) + '</b><em class="' + (ch >= 0 ? 'up' : 'dn') + '">' + (ch >= 0 ? '+' : '−') + Math.abs(pct).toFixed(1) + '%</em></div>' +
        '<div><small>TRADES</small><b>' + f.trades + '</b><em>' + f.open + ' open</em></div>' +
        '<div class="crWon">' + this.ring(f.won || 0, f.won == null ? '#2A3650' : f.won >= 50 ? '#3DDC97' : '#FFB648', 40) + '<span><small>WON</small><b>' + (f.won == null ? '–' : f.won + '%') + '</b></span></div></div>' +
      '<div class="crCardFoot">' + (off ? '<span class="crHint">Switched off · record kept</span>' : '<button type="button" class="crBtn' + (f.state === 'paused' ? ' am' : '') + '" data-s="pause:' + id + '">' + (f.state === 'paused' ? '▶ Resume' : '❚❚ Pause') + '</button>') +
        (f.state === 'locked' ? '<button type="button" class="crBtn dn" data-s="reset:' + id + '" title="Reset its paper account to ' + this.num(f.start) + ': clears its paper history. You are asked first.">↺ Reset to ' + this.num(f.start) + '</button>' : '') +
        '<button type="button" class="crBtn ghost" data-guide="' + id + '" title="How this bot works">?</button>' + (off ? '' : '<button type="button" class="crBtn go" data-s="open:' + id + '">Studio →</button>') + '</div></div>'; },

  /* ---------- the room ---------- */
  show(stage){ let h = document.getElementById('tmSetRoom'); if (!h){ h = document.createElement('div'); h.id = 'tmSetRoom'; stage.appendChild(h);
      h.addEventListener('click', e => this.click(e)); h.addEventListener('change', e => { const s = e.target.closest('[data-s^="power:"]'); if (s) this.power(s.dataset.s.slice(6), s); });
      h.addEventListener('input', e => { if (e.target.id === 'crFind'){ this.q = e.target.value; this.apply(); } });
      h.addEventListener('scroll', () => { const secs = [...h.querySelectorAll('.crSec')], top = h.getBoundingClientRect().top + 90; let cur = secs[0]; for (const s of secs) if (s.getBoundingClientRect().top <= top) cur = s; if (h.scrollTop + h.clientHeight >= h.scrollHeight - 4) cur = secs[secs.length - 1]; if (cur) this.mark(cur.id); }, { passive: true }); }
    h.hidden = false; this.host = h; this.paint(true);
    clearInterval(this.timer); this.timer = setInterval(() => { if (this.host && this.host.isConnected && !this.host.hidden && this.host.offsetParent !== null && !document.hidden) this.paint(); }, 5000); },
  mark(id){ const nav = this.host.querySelector('.crNav'); if (!nav) return; let on = null; nav.querySelectorAll('[data-s]').forEach(x => { const m = x.dataset.s === 'go:' + id; x.classList.toggle('on', m); if (m) on = x; }); const bar = nav.querySelector('.crNavBar'); if (bar && on){ bar.style.transform = 'translateY(' + on.offsetTop + 'px)'; bar.style.height = on.offsetHeight + 'px'; } },
  NAV: [['crBots', 'Bots on / off', 'switch, pause, reset'], ['crLook', 'Look & motion', 'Classic look, panel, motion'], ['crConn', 'Connections', 'MetaTrader, prices, sync'], ['crSafe', 'Safety', 'what the live desk is set to'], ['crStore', 'Storage', 'what is kept on this computer'], ['crKeys', 'Shortcuts', 'every key'], ['crMenu', 'Bot menu', 'pages in All bots']],
  frame(){ return '<div class="crWrap"><aside class="crNav"><h2>Settings</h2><i class="crNavBar"></i>' + this.NAV.map((n, i) => '<button type="button" data-s="go:' + n[0] + '"' + (i ? '' : ' class="on"') + '><b>' + n[1] + '</b><small>' + n[2] + '</small></button>').join('') + '</aside>' +
    '<main class="crMain">' +
      '<section class="crHero"><div class="crOrb"><canvas id="crOrbit"></canvas><div class="crOrbTip"></div><div class="crOrbKey"><span><i style="background:#3DDC97"></i>running</span><span><i style="background:#FFB648"></i>paused</span><span><i style="background:#FF6B7A"></i>locked</span><span><i style="background:#5D6C8A"></i>off</span><span><i class="ring"></i>armed live</span><em>drag to turn · click a bot</em></div></div>' +
        '<div class="crHeroSide"><h1>Control room</h1><p>Every bot, every link and every guard of the terminal in one place. Paper only: nothing here arms a bot for real money or sends an order.</p><div class="crHealth" id="crHealth"></div></div></section>' +
      '<section id="crBots" class="crSec"><header class="crSecHead"><div><h3>Bots on / off</h3><p>Every paper bot, with its equity curve. The switch turns a bot on or off; a switched-off bot is treated like a deleted one and its record is kept. Click a card to open the bot’s studio.</p></div></header>' +
        '<div class="crTiles" id="crTiles"></div><div class="crBar"><input type="search" id="crFind" placeholder="Find a bot: name, timeframe, running, paused, armed…" value="' + this.esc(this.q) + '"><span id="crCount"></span><span class="crBulk" id="crBulk"></span></div>' +
        '<div class="crGrid" id="crGrid"></div><div class="crNone" id="crNone" hidden>No bot matches.</div><div class="crOff" id="crOff"></div></section>' +
      '<section id="crLook" class="crSec"><header class="crSecHead"><div><h3>Look &amp; motion</h3></div></header><div id="crLookBody"></div></section>' +
      '<section id="crConn" class="crSec"><header class="crSecHead"><div><h3>Connections</h3><p>Read only. They refresh by themselves.</p></div></header><div class="crConn" id="crConnBody"></div></section>' +
      '<section id="crSafe" class="crSec"><header class="crSecHead"><div><h3>Safety</h3><p>What the live desk is set to, read only. These are changed only on the Classic live desk, behind its typed gates.</p></div><button type="button" class="crBtn go" data-s="desk:1">Open the live desk</button></header><div id="crSafeBody"></div></section>' +
      '<section id="crStore" class="crSec"><header class="crSecHead"><div><h3>Storage</h3><p>What ASTRA keeps in this computer’s browser storage. Nothing here deletes anything.</p></div></header><div id="crStoreBody"></div></section>' +
      '<section id="crKeys" class="crSec"><header class="crSecHead"><div><h3>Shortcuts</h3><p>The keys that work right now.</p></div><button type="button" class="crBtn" data-s="keys:1">Change a key</button></header><div id="crKeysBody"></div></section>' +
      '<section id="crMenu" class="crSec"><header class="crSecHead"><div><h3>Bot menu</h3><p>Which pages the All bots list shows on its left. A hidden page keeps working: a hidden bot still trades (switch it off above for that).</p></div></header><div id="crMenuBody"></div></section>' +
    '</main></div>'; },
  paint(full){ const h = this.host; if (!h) return;
    if (!this.ready()){ h.innerHTML = '<div class="crWrap"><div class="crNone">The bots have not started yet.</div></div>'; return; }
    const list = this.bots(), sig = list.map(f => f.id + f.state + Math.round(f.eq) + f.trades + f.open + f.live).join('|');
    if (full || !h.querySelector('#crGrid')){ h.innerHTML = this.frame(); this._sig = ''; this.orbit(h.querySelector('#crOrbit'), list); this.reveal(); this.mark('crBots'); }
    this.paintHealth(list); this.paintConn(); this.paintSafe();
    if (sig === this._sig) return; this._sig = sig;
    const n = k => list.filter(f => f.state === k).length;
    h.querySelector('#crTiles').innerHTML = [['all', 'All bots', list.length], ['running', 'Running', n('running')], ['paused', 'Paused', n('paused')], ['locked', 'Locked', n('locked')], ['off', 'Switched off', n('off')]]
      .map(t => '<button type="button" class="crTile ' + t[0] + (this.filter === t[0] ? ' on' : '') + '" data-s="filter:' + t[0] + '" title="' + this.esc(t[0] === 'all' ? 'Every paper bot' : this.ABOUT[t[0]]) + '"><i></i><b data-count="' + t[2] + '">0</b><span>' + t[1] + '</span></button>').join('');
    const on = list.filter(f => f.state !== 'off'), off = list.filter(f => f.state === 'off'), open = this.offOpen || this.filter === 'off' || !!this.q;
    h.querySelector('#crGrid').innerHTML = on.length ? on.map(f => this.card(f)).join('') : '<div class="crNone">Every bot is switched off.</div>';
    const ob = h.querySelector('#crOff'); ob.innerHTML = off.length ? '<button type="button" class="crOffHead" data-s="offfold:1"><i>' + (open ? '▾' : '▸') + '</i>Switched off <small>' + off.length + ' bot' + (off.length === 1 ? '' : 's') + ' · treated as deleted, record kept · turn the switch on to bring one back</small></button><div class="crGrid"' + (open ? '' : ' hidden') + '>' + off.map(f => this.card(f)).join('') + '</div>' : '';
    const idle = Bots.idle ? Bots.idle() : { paused: [], locked: [] };
    h.querySelector('#crBulk').innerHTML = (off.length ? '<button type="button" class="crBtn go" data-s="all:on">Switch every bot on <small>' + off.length + '</small></button>' : '') + (idle.paused.length ? '<button type="button" class="crBtn" data-s="all:unpause">Resume every paused bot <small>' + idle.paused.length + '</small></button>' : '') + (idle.locked.length ? '<button type="button" class="crBtn dn" data-s="all:reset">Reset every locked bot <small>' + idle.locked.length + '</small></button>' : '');
    this.apply(); this.animate(h); if (full){ this.paintLook(); this.paintStore(); this.paintKeys(); this.paintMenu(); } },
  reveal(){ const h = this.host; if (!('IntersectionObserver' in window)){ h.querySelectorAll('.crSec').forEach(s => s.classList.add('in')); return; } const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting){ e.target.classList.add('in'); this.animate(e.target); io.unobserve(e.target); } }), { root: h, threshold: 0.06 }); h.querySelectorAll('.crSec').forEach(s => io.observe(s)); },
  apply(){ const h = this.host; if (!h) return; const words = this.q.toLowerCase().split(/\s+/).filter(Boolean); let shown = 0, total = 0;
    h.querySelectorAll('.crCard[data-sid]').forEach(c => { total++; const st = ['running', 'paused', 'locked', 'off'].find(k => c.classList.contains(k)), ok = (this.filter === 'all' || this.filter === st) && words.every(w => c.dataset.sname.includes(w)); c.hidden = !ok; if (ok) shown++; });
    const g = h.querySelector('#crGrid'); if (g) g.hidden = this.filter === 'off';
    const cnt = h.querySelector('#crCount'); if (cnt) cnt.textContent = words.length || this.filter !== 'all' ? shown + ' of ' + total + ' bots' : total + ' bots';
    const none = h.querySelector('#crNone'); if (none) none.hidden = !!shown; },

  /* ---------- the health beside the sphere ---------- */
  status(){ const t = id => { const el = document.getElementById(id); return el ? (el.textContent || '').trim() : ''; }; let live = { label: '', text: '' }, caps = null, armed = 0, killed = 0;
    try { live = Live.status() || live; caps = (Live.state && Live.state.caps) || null; armed = Live.armedList().length; killed = Live.state && Live.state.killedAt; } catch(e){}
    return { bridge: typeof Feed !== 'undefined' && !!Feed.bridge, server: typeof Feed !== 'undefined' && Feed.bridge && Feed.bridge.server ? String(Feed.bridge.server) : '', feed: t('stFeed') || (typeof Feed !== 'undefined' && Feed.sourceLabel ? Feed.sourceLabel() : ''), sync: t('stSync'), link: t('wsLbl'), live, caps, armed, killed }; },
  paintHealth(list){ const el = this.host.querySelector('#crHealth'); if (!el) return; const S = this.status(), run = list.filter(f => f.state === 'running').length, sig = [S.bridge, S.feed, S.sync, S.armed, run, list.length, S.link].join('|'); if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    const tile = (k, val, ring, col, sub, s) => '<div class="crH"' + (s ? ' data-s="' + s + '" role="button" tabindex="0"' : '') + '>' + this.ring(ring, col, 46) + '<div><small>' + k + '</small><b>' + val + '</b><span>' + sub + '</span></div></div>';
    el.innerHTML = tile('BOTS RUNNING', '<i data-count="' + run + '">0</i> of ' + list.length, list.length ? run / list.length * 100 : 0, '#3DDC97', 'paper bots trading now', 'go:crBots') +
      tile('METATRADER', S.bridge ? 'Connected' : 'Not reachable', S.bridge ? 100 : 8, S.bridge ? '#4FD8F7' : '#FF6B7A', S.bridge ? (S.server ? this.esc(S.server) : 'the bridge answers') : 'start the MT5 bridge', 'go:crConn') +
      tile('PRICES', this.esc((S.feed || '–').split('·')[0].trim() || '–'), S.link && /live|connected/i.test(S.link) ? 100 : 55, '#A78BFA', this.esc(S.link || ''), 'go:crConn') +
      tile('ARMED FOR LIVE', '<i data-count="' + S.armed + '">0</i> bot' + (S.armed === 1 ? '' : 's'), S.armed ? 100 : 0, '#FFB648', S.armed ? 'on the live desk' : 'nothing armed', 'go:crSafe');
    this.animate(el); },

  /* ---------- look & motion ---------- */
  seg(t, d, k, opts){ return '<div class="crRow"><div><b>' + t + '</b><small>' + d + '</small></div><span class="crSeg">' + opts.map(o => '<button type="button" data-s="' + k + ':' + o[0] + '" class="' + (o[2] ? 'on' : '') + '">' + o[1] + '</button>').join('') + '</span></div>'; },
  paintLook(){ const el = this.host && this.host.querySelector('#crLookBody'); if (!el) return; const co = typeof Face !== 'undefined' && Face.classicOff ? Face.classicOff() : false, auto = typeof SidePanels !== 'undefined' ? !!SidePanels.auto : null, calm = this.calm();
    el.innerHTML = '<div class="crLookGrid"><div class="crPrev ' + (co ? 'tm' : 'both') + '"><div class="a"><i></i><i></i><i></i></div><div class="b"><span></span><span></span></div><em>' + (co ? 'Only the new look' : 'New look · Classic one key away') + '</em></div><div>' +
      this.seg('Classic look', co ? 'Off: ASTRA always opens in this look; F12 and the Classic button no longer go back.' : 'On: F12 or the Classic button switches to the old look.', 'classic', [['1', 'On', !co], ['0', 'Off', co]]) +
      (auto == null ? '' : this.seg('Right panel', auto ? 'Hides by itself: it slides in when the mouse reaches the right edge.' : 'Stays open beside the chart.', 'side', [['fixed', 'Stays', !auto], ['auto', 'Hides by itself', auto]])) +
      this.seg('Motion', calm ? 'Calm: the new look’s pages stop their moving parts (spinning, pulsing, drawing in).' : 'Full: spheres turn, curves draw themselves in, lights pulse.', 'calm', [['0', 'Full', !calm], ['1', 'Calm', calm]]) + '</div></div>'; },

  /* ---------- connections and safety (read only) ---------- */
  paintConn(){ const el = this.host && this.host.querySelector('#crConnBody'); if (!el) return; const S = this.status(), sig = [S.bridge, S.server, S.feed, S.sync, S.link, S.live.label].join('|'); if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    const node = (cls, ico, t, v, sub, btn) => '<div class="crNode ' + cls + '"><div class="ico">' + ico + '</div><div><small>' + t + '</small><b>' + v + '</b><span>' + sub + '</span></div>' + (btn || '') + '</div>';
    el.innerHTML = '<div class="crFlow"><span class="crPipe ' + (S.bridge ? 'on' : '') + '"></span>' +
      node(S.bridge ? 'ok' : 'bad', '⛓', 'METATRADER 5 BRIDGE', S.bridge ? 'Connected' : 'Not reachable', S.bridge ? 'answers on this computer only' + (S.server ? ' · ' + this.esc(S.server) : '') : 'start it with the START-MT5-Bridge shortcut') +
      node('ok', '◎', 'ASTRA', 'This terminal', 'pages served from this computer (127.0.0.1)') +
      node(/live|connected/i.test(S.link) ? 'ok' : 'mid', '≋', 'PRICES', this.esc(S.feed || '–'), this.esc(S.link || ''), '<button type="button" class="crBtn" data-s="feed:1">Choose the source</button>') +
      node(/off|—|^$/i.test(S.sync) ? 'mid' : 'ok', '☁', 'CLOUD SYNC', this.esc(S.sync || '–'), 'your settings and records between computers') + '</div>' +
      (S.live.label ? '<p class="crNote"><b>Live desk link:</b> ' + this.esc(S.live.label) + (S.live.text ? ' · ' + this.esc(String(S.live.text).slice(0, 140)) : '') + '</p>' : ''); },
  paintSafe(){ const el = this.host && this.host.querySelector('#crSafeBody'); if (!el) return; const S = this.status(), C = S.caps || {}, sig = JSON.stringify([C, S.armed, S.killed]); if (el.dataset.sig === sig) return; el.dataset.sig = sig;
    let armed = []; try { armed = Live.armedList().map(id => ({ id, mode: (Live.armedEntry(id) || {}).mode, name: (typeof BOT_BY_ID !== 'undefined' && BOT_BY_ID[id] ? this.name(BOT_BY_ID[id]) : id) })); } catch(e){}
    const inst = Array.isArray(C.instruments) ? C.instruments : [], fact = (k, v, sub, cls) => '<div class="crFact ' + (cls || '') + '"><small>' + k + '</small><b>' + v + '</b><span>' + sub + '</span></div>';
    const known = { maxDailyLossPct: ['Daily loss limit', v => v + '% of balance', 'trading stops for the day at this loss'], maxOpen: ['Open trades at once', v => v, 'the most real trades open together'], maxRiskPct: ['Risk a trade', v => v + '% of balance', 'the most one trade may lose'], maxLots: ['Largest size', v => v + ' lots', 'per order'] };
    el.innerHTML = '<div class="crFacts">' + fact('ARMED BOTS', String(armed.length), armed.length ? armed.map(a => this.esc(a.name) + (a.mode === 'live' ? ' (LIVE)' : ' (shadow)')).join(', ') : 'nothing is armed', armed.some(a => a.mode === 'live') ? 'am' : '') +
      Object.keys(known).filter(k => C[k] != null).map(k => fact(known[k][0].toUpperCase(), this.esc(known[k][1](C[k])), known[k][2])).join('') +
      fact('ALLOWED INSTRUMENTS', String(inst.length), inst.length ? this.esc(inst.slice(0, 8).join(', ')) + (inst.length > 8 ? ' +' + (inst.length - 8) : '') : 'none: nothing may trade for real', inst.length ? '' : 'dn') +
      (S.killed ? fact('STOPPED', 'Everything stopped', new Date(S.killed).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), 'dn') : '') + '</div>' +
      '<div class="crGuards"><span>✓ The bridge and the server answer this computer only</span><span>✓ Five wrong session codes lock real trading</span><span>✓ Real orders need the four typed gates on the live desk</span><span>✓ Links to other sites open in your browser, never inside ASTRA</span></div>'; },

  /* ---------- storage ---------- */
  paintStore(){ const el = this.host && this.host.querySelector('#crStoreBody'); if (!el) return; const G = [['Bot settings', /botcfg|botorder|botdisabled|botnotes|botlayout/i, '#4FD8F7'], ['Bot records', /^astra_bot_|ledger|_ledger/i, '#3DDC97'], ['The Observer & brains', /brain|observer|intel/i, '#2DD4BF'], ['Charts & drawings', /draw|chart|inspect|ink|marks|layout|screen/i, '#A78BFA'], ['Live desk', /live(?!dive)|desk|armed/i, '#FFB648'], ['Research & studies', /research|checker|explorer|livedive|fit|study|backtest|playbook/i, '#F472B6'], ['Everything else', /.*/, '#5D6C8A']];
    const sum = G.map(g => ({ name: g[0], re: g[1], col: g[2], b: 0, n: 0 })); let total = 0;
    try { for (let i = 0; i < localStorage.length; i++){ const k = localStorage.key(i), v = localStorage.getItem(k) || '', b = (k.length + v.length) * 2; total += b; const g = sum.find(x => x.re.test(k)); g.b += b; g.n++; } } catch(e){}
    const cap = 10 * 1024 * 1024, mb = b => (b / 1048576).toFixed(b > 104857 ? 1 : 2) + ' MB', max = Math.max(1, ...sum.map(g => g.b));
    el.innerHTML = '<div class="crStore"><div class="crStoreRing">' + this.ring(total / cap * 100, total / cap > 0.8 ? '#FF6B7A' : '#4FD8F7', 120) + '<div><b>' + mb(total) + '</b><small>of about ' + mb(cap) + '</small></div></div><div class="crStoreBars">' +
      sum.filter(g => g.n).sort((a, b) => b.b - a.b).map(g => '<div class="crSB"><span>' + g.name + '<small>' + g.n + ' item' + (g.n === 1 ? '' : 's') + '</small></span><i><u style="--w:' + (g.b / max * 100).toFixed(1) + '%;background:' + g.col + '"></u></i><b>' + mb(g.b) + '</b></div>').join('') + '</div></div>'; },

  /* ---------- shortcuts ---------- */
  paintKeys(){ const el = this.host && this.host.querySelector('#crKeysBody'); if (!el) return; let rows = [];
    rows.push(['Ctrl+K', 'Find anything: every page, panel, button and instrument'], ['F12', 'Switch between this look and Classic'], ['W', 'The Deep Dive wizard (in the Deep Dive’s Visual view)'], ['Alt + click', 'Replay and Inspect: set the playback point on a candle'], ['Esc', 'Close a pop-over or the wizard']);
    try { if (typeof Shortcuts !== 'undefined'){ Shortcuts.load(); for (const a of Shortcuts.ACTIONS) rows.push([(Shortcuts.map && Shortcuts.map[a.id]) || a.def, a.label]); } } catch(e){}
    el.innerHTML = '<div class="crKeys">' + rows.map(r => '<div class="crKey"><kbd>' + r[0].split('+').map(x => this.esc(x.trim())).join('</kbd><i>+</i><kbd>') + '</kbd><span>' + this.esc(r[1]) + '</span></div>').join('') + '</div>'; },

  /* ---------- the bot menu ---------- */
  paintMenu(){ const el = this.host && this.host.querySelector('#crMenuBody'); if (!el || typeof WorkspaceUI === 'undefined' || !WorkspaceUI.hidden) return; const hid = WorkspaceUI.hidden();
    const entries = BOTS.filter(b => !Bots.disabled(b.id)).concat({ id: 'permissions', name: 'Instrument permissions' }), groups = ['Overview', 'Trading desk', 'Scanners & research', 'Strategy bots', 'Settings & safety'];
    el.innerHTML = groups.map(g => { const list = entries.filter(b => WorkspaceUI.group(b) === g); return list.length ? '<div class="crGroup"><small>' + g.toUpperCase() + '</small><div>' + list.map(b => '<button type="button" class="crChip' + (hid.includes(b.id) ? '' : ' on') + '" data-s="menu:' + this.esc(b.id) + '" title="' + (hid.includes(b.id) ? 'Hidden: press to show it again' : 'Shown: press to hide it from the menu') + '"><i></i>' + this.esc(this.name(b)) + (b.live ? '<em>REAL</em>' : '') + '</button>').join('') + '</div></div>' : ''; }).join('') +
      (hid.length ? '<button type="button" class="crBtn" data-s="menuall:1">Show every page again</button>' : ''); },

  /* ---------- what a press does: the same calls the Classic pages make ---------- */
  power(id, input){ const off = Bots.disabled(id);
    if (!off){ let a = null; try { a = typeof Live !== 'undefined' ? Live.armedEntry(id) : null; } catch(x){} if (a && !confirm('This bot is armed on the live desk (' + (a.mode === 'live' ? 'LIVE, real money' : 'shadow') + ').\n\nSwitching it off takes it out of every list, the live desk included. Its record is kept.\n\nSwitch it off?')){ input.checked = true; return; } }
    const done = Bots.setDisabled(id, !off) !== false; if (done && typeof toast === 'function') toast(off ? 'Switched on: the bot is back, exactly as it was.' : 'Switched off: the bot is out of every list. Its record is kept.', 'ok');
    this._offCache = {}; setTimeout(() => this.paint(true), off ? 0 : 260); },
  click(e){ const b = e.target.closest('[data-s]'); if (!b || !this.host.contains(b) || b.matches('input')) return; const i = b.dataset.s.indexOf(':'), k = b.dataset.s.slice(0, i), v = b.dataset.s.slice(i + 1), redraw = () => { this._offCache = {}; this.paint(true); };
    if (k === 'go'){ this.scrollTo(this.host, this.host.querySelector('#' + v)); this.mark(v); }
    else if (k === 'filter'){ this.filter = v; this._sig = ''; this.paint(); this.host.querySelectorAll('.crTile').forEach(t => t.classList.toggle('on', t.dataset.s === 'filter:' + v)); }
    else if (k === 'offfold'){ this.offOpen = !this.offOpen; this._sig = ''; this.paint(); }
    else if (k === 'open'){ if (!Bots.disabled(v) && typeof Face !== 'undefined') Face.studio(v); }
    else if (k === 'pause'){ Bots.setPaused(v, !(Bots.cfg(v) || {}).paused); redraw(); }
    else if (k === 'reset'){ Bots.resetBot(v); redraw(); }
    else if (k === 'all'){ if (v === 'on'){ Bots.setAllOn(); if (typeof toast === 'function') toast('Every bot is switched on again', 'ok'); }
      else if (v === 'unpause'){ for (const x of Bots.idle().paused){ const c = Bots.cfg(x.id); c.paused = false; Bots.saveCfg(x.id); } Bots.render(); if (typeof toast === 'function') toast('Every paused bot is running again', 'ok'); }
      else if (v === 'reset'){ for (const x of Bots.idle().locked) Bots.resetBot(x.id); } redraw(); }
    else if (k === 'classic'){ if (typeof Face !== 'undefined') Face.setClassic(v === '1'); this.paintLook(); }
    else if (k === 'side'){ if (typeof SidePanels !== 'undefined') SidePanels.setAuto(v === 'auto'); this.paintLook(); }
    else if (k === 'calm'){ try { localStorage.setItem('astra_calm', v); } catch(x){} document.documentElement.classList.toggle('tmCalm', v === '1'); this.paintLook(); }
    else if (k === 'feed'){ const f = document.getElementById('stFeed'); if (f) f.click(); }
    else if (k === 'desk'){ if (typeof Face !== 'undefined') Face.view('live', 'classic'); }
    else if (k === 'keys'){ if (typeof Shortcuts !== 'undefined') Shortcuts.open(); }
    else if (k === 'menu'){ const hid = WorkspaceUI.hidden(); WorkspaceUI.setHidden(v, !hid.includes(v)); this.paintMenu(); }
    else if (k === 'menuall'){ if (typeof lsSet === 'function') lsSet(WorkspaceUI.HIDE_KEY, []); if (Bots.renderNav) Bots.renderNav(); Bots.render(); this.paintMenu(); }
  },
};
try { if (localStorage.getItem('astra_calm') === '1') document.documentElement.classList.add('tmCalm'); } catch(e){}
