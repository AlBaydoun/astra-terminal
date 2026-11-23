/* ASTRA / Timurila — Replay studio: one past trade, played back candle by candle, with everything
   that was known at the time drawn around it.

   The chart is the Markets studio turned on a single trade: the same level zones, trend channel,
   bounces and breaks, and market structure (js/studio.js, js/proind.js) — but rebuilt at every step
   of the playback from the candles that had closed by then, so nothing on screen knows the future.

     · WHO AND WHY   the bot, the signal that opened the trade, the bot's own reasons with their
                     weights, its score, and what it read about the market at that moment;
     · AROUND IT     the trend on every timeframe, the daily stream, how many trend readings agreed,
                     whether the market had just been shocked, which sessions were open, what the
                     neighbouring markets did while the trade was open, and which other trades were
                     open at the same time;
     · THE PLAYBACK  play, pause, step, scrub, jump to the entry, the best point, the worst, the exit;
                     in 2D or as a 3D scene with stop, entry and target as sheets of glass;
     · WHAT IF       the same entry with other targets and stops, walked forward on the real candles
                     (a candle that touches both stop and target counts as the stop).

   It reads ledgers and candles (js/autopsy.js does the reading, GET requests only). It never trades. */
const Replay = {
  C: { up: '#3DDC97', dn: '#FF6B7A', cy: '#4FD8F7', am: '#FFB648', grid: '#16223A', text: '#E6EEFF', dim: '#7C8BA8', wick: '#5C6F92' },
  LKEY: 'astra_replay_layers', NKEY: 'astra_replay_notes',
  LAYERS: [['trade', 'The trade', 'entry, stop, target and the R lines'], ['zones', 'Zones', 'support and resistance, as known then'], ['channel', 'Trend channel', 'the leg in progress'], ['events', 'Bounces and breaks', 'on the zones'],
    ['ma', 'Averages', '20, 50 and 200 candles'], ['bb', 'Bollinger bands', '20 candles, 2 deviations'], ['st', 'SuperTrend', '10 / 3'], ['vwap', 'Weekly VWAP', 'volume-weighted average since Monday'],
    ['fvg', 'Fair value gaps', 'still open'], ['ob', 'Order blocks', 'still standing'], ['bos', 'Structure breaks', 'BOS and CHoCH'], ['sweep', 'Liquidity sweeps', 'a swing taken and rejected'], ['div', 'RSI divergences', 'price and RSI disagree'],
    ['sig', 'Every signal', 'all 20 indicator signals that fired'], ['vol', 'Volume', 'bars along the bottom']],
  SCENES: { bot: ['trade', 'ma', 'vol'], studio: ['trade', 'zones', 'channel', 'events', 'ma', 'vol'], structure: ['trade', 'zones', 'fvg', 'ob', 'bos', 'sweep', 'div'], signals: ['trade', 'ma', 'st', 'sig', 'vol'], clean: ['trade'] },
  CODE: { st: 'ST', ce: 'CE', ut: 'UT', macd: 'MACD', ichi: 'ICHI', donch: 'DON', gc: 'GC', bos: 'BOS', choch: 'CHoCH', fvg: 'FVG', ob: 'OB', sweep: 'SWP', sqz: 'SQZ', wt: 'WT', srsi: 'SRSI', fisher: 'FSH', rsidiv: 'DIV', nw: 'NW', td9: 'TD9', lor: 'LOR' },
  PEERS: { fx: ['EURUSD', 'GBPUSD', 'USDJPY', 'XAUUSD', 'US500'], metal: ['XAUUSD', 'XAGUSD', 'EURUSD', 'US500', 'BRENT'], index: ['US500', 'US100', 'DE40', 'JP225', 'XAUUSD'], crypto: ['BTCUSD', 'ETHUSD', 'US100', 'XAUUSD'], energy: ['BRENT', 'WTI', 'US500', 'EURUSD'], other: ['US500', 'US100', 'XAUUSD', 'EURUSD'] },
  t: null, V: null, cur: 0, a: 0, b: 0, playing: false, speed: 2, d3: false, osc: 'rsi', future: false, hov: null, L: null,
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  num(v, d = 2){ return v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  sg(v, d = 2, u = ''){ if (v == null || !isFinite(v)) return '–'; const z = Math.abs(v) < 0.5 * Math.pow(10, -d); return (z ? '' : v > 0 ? '+' : '−') + this.num(Math.abs(v), d) + u; },
  px(p){ const a = Math.abs(p), d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 5; return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  sym(s){ return String(s).replace(/\.(s|m|std)$/i, ''); },
  when(sec, t){ const d = new Date((sec - Autopsy.shift(t.sym, sec)) * 1000); return d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + d.toTimeString().slice(0, 5); },
  layers(){ if (!this.L){ let s = {}; try { s = JSON.parse(localStorage.getItem(this.LKEY) || '{}') || {}; } catch(e){} this.L = Object.assign({ trade: true, ma: true, vol: true, zones: true, channel: true, events: true }, s); } return this.L; },
  saveLayers(){ try { localStorage.setItem(this.LKEY, JSON.stringify(this.L)); } catch(e){} },
  notes(){ try { return JSON.parse(localStorage.getItem(this.NKEY) || '{}') || {}; } catch(e){ return {}; } },
  sigOf(t){ const o = t.orig; let s = ''; try { if (o && typeof Explorer !== 'undefined') s = Explorer.triggerOf(o); } catch(e){} s = s || (o && (o.trigger || o.model)) || 'Not recorded'; return s === t.bot || s === t.botName ? 'Not recorded' : s; },

  /* ---------- the room ---------- */
  async show(host){
    this.host = host; this.layers();
    if (!host.dataset.rp){ host.dataset.rp = '1'; host.tabIndex = 0;
      host.innerHTML = '<div class="rpWrap"><div class="rpHead"><div><h1>Replay studio</h1><p>One trade, candle by candle, with only what was known at the time. Who opened it, why, and what was going on around it.</p></div><div class="rpFilters" id="rpFilters"></div></div>' +
        '<div class="rpMain"><aside class="rpList" id="rpList"></aside><section class="rpStage" id="rpStage"><div class="rpEmpty">Reading your trades…</div></section><aside class="rpSide" id="rpSide"></aside></div>' +
        '<canvas id="auStrip" class="auStrip" height="74"></canvas><div class="auAudit" id="auAudit"></div></div>';
      host.addEventListener('click', e => this.click(e));
      host.addEventListener('change', e => { const x = e.target; if (x.id === 'rpBot'){ Autopsy.filter.bot = x.value; this.refilter(); } else if (x.id === 'rpSeek'){ this.pause(); this.cur = +x.value; this.draw(); } else if (x.id === 'rpNote' || x.id === 'rpTag'){ const n = this.notes(); if (this.t){ n[this.t.id] = { text: this.$('rpNote').value.slice(0, 2000), tag: this.$('rpTag').value, at: Date.now() }; if (!n[this.t.id].text && !n[this.t.id].tag) delete n[this.t.id]; try { localStorage.setItem(this.NKEY, JSON.stringify(n)); } catch(er){} this.paintList(); } } });
      host.addEventListener('input', e => { if (e.target.id === 'rpSeek'){ this.pause(); this.cur = +e.target.value; this.draw(); } });
      host.addEventListener('keydown', e => { if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.id !== 'rpSeek') return; if (!this.V) return;
        if (e.key === ' '){ e.preventDefault(); this.playing ? this.pause() : this.play(); } else if (e.key === 'ArrowRight'){ e.preventDefault(); this.step(1); } else if (e.key === 'ArrowLeft'){ e.preventDefault(); this.step(-1); } else if (e.key === 'Home'){ e.preventDefault(); this.jump(this.V.iE); } else if (e.key === 'End'){ e.preventDefault(); this.jump(this.V.iX); } });
      window.addEventListener('resize', () => { if (this.host && this.host.offsetParent !== null) this.draw(); });
    }
    Autopsy.host = host; Autopsy.load(); await Autopsy.collect(); this.paintFilters(); this.paintList(); Autopsy.strip(); Autopsy.paintAudit();
    const want = Autopsy.want; Autopsy.want = null; if (want && Autopsy.trades.some(t => t.id === want)) Autopsy.filter = { src: 'all', bot: '', out: 'all' };
    const id = want && Autopsy.trades.some(t => t.id === want) ? want : this.t ? this.t.id : (Autopsy.rows()[0] || {}).id;
    if (id && (!this.t || this.t.id !== id || !this.V)) this.select(id); else if (this.V) this.draw(); else this.$('rpStage').innerHTML = '<div class="rpEmpty">No closed trade yet.</div>';
  },
  refilter(){ this.paintFilters(); this.paintList(); Autopsy.strip(); Autopsy.paintAudit(); },
  paintFilters(){ const f = Autopsy.filter, chip = (k, v, l) => '<button type="button" class="rpChip' + (f[k] === v ? ' on' : '') + '" data-r="f:' + k + '=' + v + '">' + l + '</button>', bots = [...new Map(Autopsy.trades.map(t => [t.bot, t.botName])).entries()].sort((a, b) => String(a[1]).localeCompare(b[1]));
    this.$('rpFilters').innerHTML = '<span class="rpSeg">' + chip('src', 'all', 'All') + chip('src', 'paper', 'Paper') + chip('src', 'live', 'Live') + '</span><span class="rpSeg">' + chip('out', 'all', 'Wins and losses') + chip('out', 'win', 'Wins') + chip('out', 'loss', 'Losses') + '</span>' +
      '<select id="rpBot"><option value="">Every bot</option>' + bots.map(([id, nm]) => '<option value="' + this.esc(id) + '"' + (f.bot === id ? ' selected' : '') + '>' + this.esc(nm) + '</option>').join('') + '</select><button type="button" class="rpGhost" data-r="classic:1" title="Classic’s own Trade Replay window">Classic replay</button>'; },
  paintList(){ const rows = Autopsy.rows().slice(0, 300), notes = this.notes(), el = this.$('rpList'); if (!el) return;
    el.innerHTML = rows.length ? rows.map(t => { const F = Autopsy.facts[t.id], r = t.r != null ? t.r : (F && !F.err ? F.r : null), w = r == null ? 0 : Math.min(100, Math.abs(r) / 4 * 100), n = notes[t.id];
      return '<button type="button" class="rpRow' + (this.t && t.id === this.t.id ? ' on' : '') + '" data-r="sel:' + this.esc(t.id) + '"><span class="rpSym">' + this.esc(this.sym(t.sym)) + '<i class="' + (t.dir > 0 ? 'up' : 'dn') + '">' + (t.dir > 0 ? '▲' : '▼') + '</i>' + (t.src === 'live' ? '<em>LIVE</em>' : '') + (n ? '<u title="You wrote a note on this trade">✎</u>' : '') + '</span>' +
        '<span class="rpBarT"><i class="' + (t.pnl > 0 ? 'up' : 'dn') + '" style="width:' + w.toFixed(0) + '%"></i></span><span class="rpR ' + (t.pnl > 0 ? 'up' : 'dn') + '">' + (r != null ? this.sg(r, 1, 'R') : this.sg(t.pnl, 0)) + '</span><span class="rpWhen">' + this.esc(t.botName) + ' · ' + new Date(t.t1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + '</span></button>'; }).join('') : '<div class="rpEmpty">No closed trade matches.</div>'; },

  async select(id){
    const t = Autopsy.trades.find(x => x.id === id); if (!t) return; this.pause(); this.t = t; this.V = null; Autopsy.sel = id; this.paintList(); this.$('rpStage').innerHTML = '<div class="rpEmpty">Rebuilding the moment of entry…</div>'; this.$('rpSide').innerHTML = '';
    try { await Autopsy.analyse(t, true); } catch(e){} Autopsy.save(); if (this.t !== t) return; const V = Autopsy.view;
    if (!V || V.t !== t){ this.$('rpStage').innerHTML = '<div class="rpEmpty">' + this.esc(Autopsy.why(t, Autopsy.facts[t.id])) + '</div>'; this.paintSide(); Autopsy.strip(); return; }
    this.V = V; const P = V.P; this.bars = []; for (let i = 0; i < P.n; i++) this.bars.push({ time: P.t[i], open: P.o[i], high: P.h[i], low: P.l[i], close: P.c[i], volume: P.v[i] });
    this.a = Math.max(0, V.iE - 110); this.b = Math.min(P.n - 1, V.iX + 45); this.cur = V.iE; this._Rk = -1; this.hov = null;
    const bbm = ProInd.sma(P.c, 20), sd = ProInd.stdev(P.c, 20);
    this.ind = { e20: ProInd.ema(P.c, 20), e50: ProInd.ema(P.c, 50), e200: ProInd.ema(P.c, 200), bu: bbm.map((m, i) => m + 2 * sd[i]), bl: bbm.map((m, i) => m - 2 * sd[i]), st: ProInd.supertrend(P), vw: ProInd.avwap(P, 'week').v, rsi: ProInd.rsi(P.c, 14), wt: ProInd.wavetrend(P) };
    let lo = Infinity, hi = -Infinity; for (let i = this.a; i <= this.b; i++){ lo = Math.min(lo, P.l[i]); hi = Math.max(hi, P.h[i]); } for (const p of [t.sl, t.tp, t.entry, t.exit]) if (p > 0){ lo = Math.min(lo, p); hi = Math.max(hi, p); } const pad = (hi - lo) * 0.06 || 1; this.lo = lo - pad; this.hi = hi + pad;
    this.paintStage(); this.paintSide(); this.draw(); Autopsy.strip(); Autopsy.paintAudit(); this.around(t);
  },

  /* ---------- the stage ---------- */
  paintStage(){
    const t = this.t, V = this.V, F = V.F, L = this.L, r = t.r != null ? t.r : F.r, scene = Object.keys(this.SCENES).find(k => { const s = this.SCENES[k]; return this.LAYERS.every(l => !!L[l[0]] === s.includes(l[0])); }) || '';
    this.$('rpStage').innerHTML = '<div class="rpTitle"><div><b>' + this.esc(this.sym(t.sym)) + '</b><span class="rpTag ' + (t.dir > 0 ? 'up' : 'dn') + '">' + (t.dir > 0 ? 'BUY' : 'SELL') + '</span><span class="rpTag">' + this.esc(t.botName) + '</span>' + (this.sigOf(t) !== 'Not recorded' ? '<span class="rpTag sig">' + this.esc(this.sigOf(t)) + '</span>' : '') + (t.src === 'live' ? '<span class="rpTag live">LIVE</span>' : '<span class="rpTag">paper</span>') + '</div>' +
        '<div class="rpRes ' + (t.pnl > 0 ? 'up' : 'dn') + '"><b>' + this.sg(r, 2, 'R') + '</b><span>' + this.sg(t.pnl, 2) + '</span></div></div>' +
      '<div class="rpBarRow"><span class="rpSeg"><small>SCENE</small>' + [['bot', 'As the bot saw it'], ['studio', 'Studio'], ['structure', 'Structure'], ['signals', 'Signals'], ['clean', 'Clean']].map(s => '<button type="button" class="rpChip' + (scene === s[0] ? ' on' : '') + '" data-r="scene:' + s[0] + '">' + s[1] + '</button>').join('') + '</span>' +
        '<span class="rpSeg">' + Object.keys(Autopsy.TF).map(x => '<button type="button" class="rpChip mono' + (x === t.tf ? ' on' : '') + '" data-r="tf:' + x + '">' + x + '</button>').join('') + '</span>' +
        '<span class="rpSeg"><button type="button" class="rpChip' + (this.d3 ? '' : ' on') + '" data-r="dim:2">2D</button><button type="button" class="rpChip' + (this.d3 ? ' on' : '') + '" data-r="dim:3">3D</button></span>' +
        '<span class="rpSeg"><small>PANE</small>' + [['rsi', 'RSI'], ['wt', 'WaveTrend'], ['none', 'None']].map(o => '<button type="button" class="rpChip' + (this.osc === o[0] ? ' on' : '') + '" data-r="osc:' + o[0] + '">' + o[1] + '</button>').join('') + '</span>' +
        '<button type="button" class="rpChip' + (this.future ? ' on' : '') + '" data-r="future:1" title="Show the candles that had not happened yet, faintly">Show the future</button><button type="button" class="rpGhost" data-r="png:1" title="Save this picture">Save picture</button><button type="button" class="rpGhost" data-r="chart:1">Open live chart</button></div>' +
      '<div class="rpLayers">' + this.LAYERS.map(l => '<button type="button" class="rpLay' + (L[l[0]] ? ' on' : '') + '" data-r="lay:' + l[0] + '" title="' + this.esc(l[2]) + '"><i></i>' + l[1] + '</button>').join('') + '</div>' +
      '<div class="rpCanvasBox"><canvas id="rpCv"' + (this.d3 ? ' hidden' : '') + '></canvas><canvas id="rp3d"' + (this.d3 ? '' : ' hidden') + '></canvas><div class="rpHud" id="rpHud"></div></div>' +
      '<div class="rpTransport"><button type="button" data-r="prev:1" title="Previous trade in the list">⏮</button><button type="button" data-r="step:-1" title="One candle back (←)">◀</button><button type="button" class="pri" id="rpPlay" data-r="play:1" title="Play or pause (space)">▶</button><button type="button" data-r="step:1" title="One candle forward (→)">▶▏</button><button type="button" data-r="next:1" title="Next trade in the list">⏭</button>' +
        '<input type="range" id="rpSeek" min="' + this.a + '" max="' + this.b + '" value="' + this.cur + '" aria-label="Position in the replay">' +
        '<span class="rpSeg">' + [1, 2, 5, 10].map(s => '<button type="button" class="rpChip mono' + (this.speed === s ? ' on' : '') + '" data-r="speed:' + s + '">' + s + '×</button>').join('') + '</span>' +
        '<span class="rpSeg"><small>JUMP</small>' + [['start', 'Before'], ['entry', 'Entry'], ['best', 'Best'], ['worst', 'Worst'], ['exit', 'Exit'], ['end', 'After']].map(j => '<button type="button" class="rpChip" data-r="jump:' + j[0] + '">' + j[1] + '</button>').join('') + '</span></div>' +
      '<div class="rpWhatIf" id="rpWhatIf">' + this.whatIf() + '</div>';
    const cv = this.$('rpCv'); cv.addEventListener('mousemove', e => { const r = cv.getBoundingClientRect(), cw = (r.width - 74) / (this.b - this.a + 1), i = Math.round((e.clientX - r.left - 6) / cw - 0.5) + this.a; this.hov = i >= this.a && i <= (this.future ? this.b : this.cur) ? i : null; this.hy = e.clientY - r.top; if (!this.playing) this.draw(); });
    cv.addEventListener('mouseleave', () => { this.hov = null; if (!this.playing) this.draw(); }); cv.addEventListener('click', () => { if (this.hov != null){ this.pause(); this.cur = this.hov; this.draw(); } });
  },
  /* the same entry with other targets and stops, walked forward on the real candles */
  whatIf(){ const { t, P, iE, risk, F } = this.V, end = P.n - 1, sim = (sr, tr) => { const sl = t.entry - t.dir * sr * risk, tp = t.entry + t.dir * tr * risk;
      for (let i = iE; i <= end; i++){ if (t.dir > 0 ? P.l[i] <= sl : P.h[i] >= sl) return { r: -sr, n: i - iE + 1, why: 'stopped' }; if (t.dir > 0 ? P.h[i] >= tp : P.l[i] <= tp) return { r: tr, n: i - iE + 1, why: 'reached the target' }; }
      return { r: t.dir * (P.c[end] - t.entry) / risk, n: end - iE + 1, why: 'still open ' + (end - iE + 1) + ' candles later' }; };
    const rows = [['As it happened', { r: t.r != null ? t.r : F.r, n: F.held, why: t.reason || 'closed' }, true], ['Target at 1R', sim(1, 1)], ['Target at 2R', sim(1, 2)], ['Target at 3R', sim(1, 3)], ['Stop 1.5× wider, target at 2R', sim(1.5, 2)], ['No target, same stop', sim(1, 99)]], mx = Math.max(1, ...rows.map(x => Math.abs(x[1].r)));
    return '<div class="rpWhatHead"><b>What if</b><span>the same entry with other exits, walked forward on the real candles · 1R = ' + this.px(risk) + ' · a candle that touches both stop and target counts as the stop</span></div><div class="rpWhatRows">' +
      rows.map(x => '<div class="rpWhat' + (x[2] ? ' real' : '') + '"><span>' + x[0] + '</span><i class="rpTrk"><u class="' + (x[1].r >= 0 ? 'up' : 'dn') + '" style="width:' + (Math.abs(x[1].r) / mx * 50).toFixed(1) + '%"></u></i><b class="' + (x[1].r >= 0 ? 'up' : 'dn') + '">' + this.sg(x[1].r, 2, 'R') + '</b><small>' + this.esc(x[1].why) + (x[1].n ? ' · ' + x[1].n + ' candles' : '') + '</small></div>').join('') + '</div>'; },

  /* ---------- playback ---------- */
  play(){ if (!this.V) return; if (this.cur >= this.b) this.cur = this.V.iE; this.playing = true; clearInterval(this.timer); this.timer = setInterval(() => { if (!this.host.isConnected || this.host.offsetParent === null) return this.pause(); if (this.cur >= this.b) return this.pause(); this.cur++; this.draw(); }, Math.max(40, 620 / this.speed)); this.sync(); },
  pause(){ this.playing = false; clearInterval(this.timer); this.sync(); },
  step(d){ if (!this.V) return; this.pause(); this.cur = Math.max(this.a, Math.min(this.b, this.cur + d)); this.draw(); },
  jump(i){ if (!this.V) return; this.pause(); this.cur = Math.max(this.a, Math.min(this.b, i)); this.draw(); },
  sync(){ const p = this.$('rpPlay'); if (p){ p.textContent = this.playing ? '❚❚' : '▶'; p.classList.toggle('on', this.playing); } const s = this.$('rpSeek'); if (s && +s.value !== this.cur) s.value = this.cur; },
  neighbour(d){ const rows = Autopsy.rows(), i = rows.findIndex(x => this.t && x.id === this.t.id), n = rows[i + d]; if (n) this.select(n.id); },

  /* ---------- drawing ---------- */
  studio(){ if (this._Rk !== this.cur){ this._Rk = this.cur; try { this._R = Studio.analyse(this.bars.slice(0, Math.min(this.bars.length, this.cur + 2)), { look: 140 }); } catch(e){ this._R = null; } } return this._R; },
  draw(){ if (!this.V || !this.host || this.host.offsetParent === null) return; this.sync(); if (this.d3) this.draw3d(); else this.draw2d(); this.hud(); },
  draw3d(){ const cv = this.$('rp3d'); if (!cv || typeof Tm3D === 'undefined') return; const { t, P, iE, iX } = this.V, bars = []; for (let i = this.a; i <= this.b; i++) bars.push({ o: P.o[i], h: P.h[i], l: P.l[i], c: P.c[i], v: P.v[i] });
    Tm3D.candles(cv, { bars, cur: this.cur - this.a, lo: this.lo, hi: this.hi, entry: t.entry, sl: t.sl, tp: t.tp, exit: t.exit, iE: iE - this.a, iX: iX - this.a, dir: t.dir, win: t.pnl > 0 }); },
  draw2d(){
    const cv = this.$('rpCv'); if (!cv) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight; if (W < 80 || Hh < 80) return; cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
    const { t, P, iE, iX, risk, F } = this.V, C = this.C, L = this.L, I = this.ind, a = this.a, b = this.b, cur = this.cur, n = b - a + 1, padR = 68, oscH = this.osc === 'none' ? 0 : Math.round(Hh * 0.2), mainH = Hh - oscH - 22, cw = (W - padR - 6) / n, X = i => 6 + (i - a + 0.5) * cw, lo = this.lo, hi = this.hi, Y = p => 8 + (hi - p) / (hi - lo) * (mainH - 16), end = this.future ? b : cur, bw = Math.max(1.5, cw * 0.64);
    c.font = '11px JetBrains Mono, monospace'; c.textBaseline = 'middle';
    for (let g = 0; g <= 5; g++){ const p = lo + (hi - lo) * g / 5, y = Math.round(Y(p)) + 0.5; c.strokeStyle = C.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y); c.lineTo(W - padR, y); c.stroke(); c.fillStyle = C.dim; c.textAlign = 'left'; c.fillText(this.px(p), W - padR + 8, y); }
    c.save(); c.beginPath(); c.rect(0, 0, W - padR, mainH); c.clip();
    /* the time in the trade, as far as the playback has got */
    if (cur >= iE){ const x0 = X(iE) - cw / 2, x1 = X(Math.min(cur, iX)) + cw / 2; c.fillStyle = t.pnl > 0 ? 'rgba(61,220,151,.07)' : 'rgba(255,107,122,.07)'; c.fillRect(x0, 0, x1 - x0, mainH); }
    const R = (L.zones || L.channel || L.events || L.fvg || L.ob || L.bos || L.sweep || L.div) && typeof Studio !== 'undefined' ? this.studio() : null;
    const view = lay => ({ X, Y, left: 0, right: W - padR, i0: a, i1: cur, bars: this.bars, layers: lay, fmt: p => this.px(p), pulse: 1, sans: 'Inter, sans-serif', mono: 'JetBrains Mono, monospace' });
    if (R && L.zones) Studio.paint(c, R, view({ zones: true }));
    if (L.vol){ let mv = 1; for (let i = a; i <= b; i++) mv = Math.max(mv, P.v[i]); for (let i = a; i <= end; i++){ const hgt = P.v[i] / mv * mainH * 0.14; c.fillStyle = P.c[i] >= P.o[i] ? 'rgba(61,220,151,.22)' : 'rgba(255,107,122,.22)'; c.globalAlpha = i > cur ? 0.3 : 1; c.fillRect(X(i) - bw / 2, mainH - hgt, bw, hgt); } c.globalAlpha = 1; }
    for (let i = a; i <= end; i++){ const up = P.c[i] >= P.o[i], x = X(i); c.globalAlpha = i > cur ? 0.22 : 1; c.strokeStyle = C.wick; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(x) + 0.5, Y(P.h[i])); c.lineTo(Math.round(x) + 0.5, Y(P.l[i])); c.stroke(); c.fillStyle = up ? C.up : C.dn; const yo = Y(P.o[i]), yc = Y(P.c[i]); c.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo))); } c.globalAlpha = 1;
    const line = (arr, col, wd, dash) => { c.strokeStyle = col; c.lineWidth = wd || 1.4; c.setLineDash(dash || []); c.lineJoin = 'round'; c.beginPath(); let on = false; for (let i = a; i <= cur; i++){ const v = arr[i]; if (v !== v || v == null){ on = false; continue; } on ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)); on = true; } c.stroke(); c.setLineDash([]); };
    if (L.bb){ line(I.bu, 'rgba(167,139,250,.75)', 1.1); line(I.bl, 'rgba(167,139,250,.75)', 1.1); }
    if (L.ma){ line(I.e200, '#FF6BD6', 1.3); line(I.e50, '#FFB648', 1.4); line(I.e20, '#4FD8F7', 1.5); }
    if (L.vwap) line(I.vw, '#E6EEFF', 1.1, [5, 4]);
    if (L.st){ c.lineWidth = 1.8; for (let i = Math.max(a + 1, 1); i <= cur; i++){ const p0 = I.st.line[i - 1], p1 = I.st.line[i]; if (p0 !== p0 || p1 !== p1 || I.st.dir[i] !== I.st.dir[i - 1]) continue; c.strokeStyle = I.st.dir[i] > 0 ? C.up : C.dn; c.beginPath(); c.moveTo(X(i - 1), Y(p0)); c.lineTo(X(i), Y(p1)); c.stroke(); } }
    if (R) Studio.paint(c, R, view({ channel: L.channel, events: L.events, fvg: L.fvg, ob: L.ob, bos: L.bos, sweep: L.sweep, div: L.div }));
    if (L.sig && typeof ProInd !== 'undefined'){ const put = {}; c.font = '600 9.5px JetBrains Mono, monospace'; c.textAlign = 'center';
      for (const S of ProInd.SIGNALS){ const arr = ProInd.signal(P, S.id); for (let i = Math.max(a, iE - 45); i <= cur; i++){ const d = arr[i]; if (!d) continue; const k = i + '|' + d, m = put[k] = (put[k] || 0) + 1; if (m > 3) continue; const y = d > 0 ? Y(P.l[i]) + 10 + (m - 1) * 11 : Y(P.h[i]) - 10 - (m - 1) * 11; c.lineWidth = 3; c.strokeStyle = 'rgba(6,10,18,.9)'; c.strokeText(this.CODE[S.id] || S.id, X(i), y); c.fillStyle = d > 0 ? '#7BE8B8' : '#FF9AA4'; c.fillText(this.CODE[S.id] || S.id, X(i), y); } } }
    if (L.trade){ c.font = '600 10.5px Inter, sans-serif'; const x0 = X(iE) - cw / 2, lv = (p, col, dash, label) => { if (!(p > 0)) return; const y = Math.round(Y(p)) + 0.5; c.strokeStyle = col; c.lineWidth = 1.2; c.setLineDash(dash); c.beginPath(); c.moveTo(x0, y); c.lineTo(W - padR, y); c.stroke(); c.setLineDash([]); c.fillStyle = col; c.textAlign = 'right'; c.fillText(label, W - padR - 5, y - 8); };
      for (const k of [1, 2, -1]){ const p = t.entry + t.dir * k * risk; if (p > lo && p < hi && Math.abs(p - (k < 0 ? t.sl : t.tp)) > risk * 0.1) lv(p, 'rgba(124,139,168,.45)', [2, 5], (k > 0 ? '+' : '−') + Math.abs(k) + 'R'); }
      lv(t.sl, C.dn, [5, 4], 'stop'); lv(t.tp, C.up, [5, 4], 'target'); lv(t.entry, C.cy, [], 'entry');
      const dot = (i, p, col, txt, above) => { const x = X(i), y = Y(p); c.fillStyle = col; c.shadowColor = col; c.shadowBlur = 12; c.beginPath(); c.arc(x, y, 5, 0, 6.3); c.fill(); c.shadowBlur = 0; c.strokeStyle = '#060A12'; c.lineWidth = 2; c.stroke(); c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(6,10,18,.9)'; c.strokeText(txt, x, y + (above ? -15 : 16)); c.fillStyle = col; c.fillText(txt, x, y + (above ? -15 : 16)); };
      if (cur >= iE) dot(iE, t.entry, C.cy, t.dir > 0 ? 'Buy' : 'Sell', t.dir < 0);
      if (cur >= this.V.iBest && F.mfe > 0.3) dot(this.V.iBest, t.dir > 0 ? P.h[this.V.iBest] : P.l[this.V.iBest], C.am, 'best ' + this.sg(F.mfe, 1, 'R'), t.dir > 0);
      if (cur >= this.V.iWorst && F.mae > 0.3 && this.V.iWorst !== this.V.iBest) dot(this.V.iWorst, t.dir > 0 ? P.l[this.V.iWorst] : P.h[this.V.iWorst], C.dim, 'worst ' + this.sg(-F.mae, 1, 'R'), t.dir < 0);
      if (cur >= iX) dot(iX, t.exit, t.pnl > 0 ? C.up : C.dn, 'Out ' + this.sg(F.r, 1, 'R'), (t.dir > 0) === (t.pnl > 0)); }
    /* where the playback stands */
    { const x = Math.round(X(cur) + cw / 2) + 0.5; c.strokeStyle = 'rgba(79,216,247,.55)'; c.lineWidth = 1; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, mainH); c.stroke(); c.setLineDash([]); }
    c.restore();
    /* the pane under the price */
    if (oscH){ const y0 = mainH + 4, y1 = Hh - 22, wt = this.osc === 'wt', A = wt ? I.wt.wt1 : I.rsi, mn = wt ? -100 : 0, mx = wt ? 100 : 100, Yo = v => y1 - (Math.max(mn, Math.min(mx, v)) - mn) / (mx - mn) * (y1 - y0); c.strokeStyle = C.grid; c.beginPath(); c.moveTo(0, y0 - 2.5); c.lineTo(W - padR, y0 - 2.5); c.stroke();
      c.setLineDash([3, 4]); c.font = '10px JetBrains Mono, monospace'; for (const lv of (wt ? [-53, 0, 53] : [30, 50, 70])){ const y = Math.round(Yo(lv)) + 0.5; c.strokeStyle = 'rgba(126,156,224,.2)'; c.beginPath(); c.moveTo(0, y); c.lineTo(W - padR, y); c.stroke(); c.fillStyle = C.dim; c.textAlign = 'left'; c.fillText(String(lv), W - padR + 8, y); } c.setLineDash([]);
      const ln = (arr, col) => { c.strokeStyle = col; c.lineWidth = 1.5; c.beginPath(); let on = false; for (let i = a; i <= cur; i++){ const v = arr[i]; if (v !== v){ on = false; continue; } on ? c.lineTo(X(i), Yo(v)) : c.moveTo(X(i), Yo(v)); on = true; } c.stroke(); }; ln(A, C.cy); if (wt) ln(I.wt.wt2, C.am);
      c.fillStyle = C.dim; c.font = '600 10px Inter, sans-serif'; c.fillText(wt ? 'WaveTrend' : 'RSI 14', 8, y0 + 8); }
    c.fillStyle = C.dim; c.font = '10px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; for (const i of [a + Math.round(n * 0.08), iE, iX, b - Math.round(n * 0.05)]){ if (i < a || i > b) continue; c.fillText(this.when(P.t[i], t).slice(4), Math.max(52, Math.min(W - padR - 52, X(i))), Hh - 7); }
    if (this.hov != null && this.hy != null && this.hy < mainH){ const x = Math.round(X(this.hov)) + 0.5, y = Math.round(this.hy) + 0.5, p = hi - (this.hy - 8) / (mainH - 16) * (hi - lo); c.strokeStyle = 'rgba(230,238,255,.35)'; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, mainH); c.moveTo(0, y); c.lineTo(W - padR, y); c.stroke(); c.setLineDash([]); c.fillStyle = '#E6EEFF'; c.fillRect(W - padR + 2, y - 8, padR - 4, 16); c.fillStyle = '#04121A'; c.font = '11px JetBrains Mono, monospace'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(this.px(p), W - padR + 7, y); }
  },
  hud(){ const el = this.$('rpHud'); if (!el) return; const { t, P, iE, iX, risk, F } = this.V, cur = this.cur, i = this.hov != null ? this.hov : cur, last = Math.min(cur, iX); let best = 0, worst = 0; for (let k = iE; k <= last; k++){ best = Math.max(best, t.dir > 0 ? P.h[k] - t.entry : t.entry - P.l[k]); worst = Math.max(worst, t.dir > 0 ? t.entry - P.l[k] : P.h[k] - t.entry); }
    const rNow = t.dir * (P.c[last] - t.entry) / risk, way = t.tp > 0 && rNow > 0 ? Math.min(100, Math.abs(P.c[last] - t.entry) / Math.abs(t.tp - t.entry) * 100) : t.sl > 0 && rNow < 0 ? -Math.min(100, Math.abs(P.c[last] - t.entry) / Math.abs(t.sl - t.entry) * 100) : 0;
    el.innerHTML = '<b>' + this.when(P.t[i], t) + '</b><span>O ' + this.px(P.o[i]) + ' · H ' + this.px(P.h[i]) + ' · L ' + this.px(P.l[i]) + ' · C ' + this.px(P.c[i]) + '</span>' +
      (cur < iE ? '<em>' + (iE - cur) + ' candles before the entry</em>' : cur < iX ? '<em class="' + (rNow >= 0 ? 'up' : 'dn') + '">' + this.sg(rNow, 2, 'R') + ' now · candle ' + (cur - iE + 1) + ' of ' + (iX - iE + 1) + '</em><span>best so far ' + this.sg(best / risk, 1, 'R') + ' · worst ' + this.sg(-worst / risk, 1, 'R') + (way ? ' · ' + Math.abs(Math.round(way)) + '% of the way to the ' + (way > 0 ? 'target' : 'stop') : '') + '</span>'
        : '<em class="' + (t.pnl > 0 ? 'up' : 'dn') + '">closed ' + this.sg(F.r, 2, 'R') + ' · ' + this.esc(t.reason || '') + '</em>' + (cur > iX ? '<span>' + (cur - iX) + ' candles after the exit</span>' : '')); },

  /* ---------- who opened it and why; what was going on around it ---------- */
  paintSide(){
    const el = this.$('rpSide'), t = this.t, V = this.V, F = t && Autopsy.facts[t.id]; if (!el || !t) return; const o = t.orig || {}, note = this.notes()[t.id] || {};
    const reasons = (Array.isArray(o.reasons) ? o.reasons : t.why || []).map(x => { const m = String(x).match(/([+−-]\s?\d+(?:\.\d+)?)(?!.*[+−-]\s?\d)/), w = m ? parseFloat(m[1].replace('−', '-').replace(/\s/g, '')) : null; return { text: String(x), w }; }), mw = Math.max(1, ...reasons.map(x => Math.abs(x.w || 0)));
    const facts = o.factors && typeof o.factors === 'object' ? Object.entries(o.factors) : [], st = o.state || {}, sc = Number.isFinite(o.score) ? o.score : null, arc = 2 * Math.PI * 30 * 0.75;
    const bar = (label, v, lo, hi, txt) => v == null || !isFinite(v) ? '' : '<div class="rpStat"><span>' + label + '</span><i><u style="width:' + Math.max(0, Math.min(100, (v - lo) / (hi - lo) * 100)).toFixed(0) + '%"></u></i><b>' + txt + '</b></div>';
    const h = new Date(t.t0).getUTCHours(), ses = [['Asia', h >= 0 && h < 9], ['London', h >= 7 && h < 16], ['New York', h >= 12 && h < 21]];
    const others = Autopsy.trades.filter(x => x !== t && x.t0 <= t.t1 && x.t1 >= t.t0), ob = others.filter(x => x.dir > 0).length, same = Autopsy.trades.filter(x => x.src === t.src && x.bot === t.bot && x.sym === t.sym && x.tf === t.tf && this.sigOf(x) === this.sigOf(t)), sw = same.filter(x => x.pnl > 0).length, botAll = Autopsy.trades.filter(x => x.src === t.src && x.bot === t.bot), bw = botAll.filter(x => x.pnl > 0).length;
    el.innerHTML = '<div class="rpCard rpWho"><small>WHO OPENED IT, AND WHY</small><div class="rpWhoTop">' + (sc != null ? '<svg viewBox="0 0 76 76" class="rpGauge"><circle cx="38" cy="38" r="30" class="bg" style="stroke-dasharray:' + arc.toFixed(1) + ' 999"/><circle cx="38" cy="38" r="30" class="fg" style="stroke-dasharray:' + (arc * Math.max(0, Math.min(100, sc)) / 100).toFixed(1) + ' 999"/><text x="38" y="41">' + Math.round(sc) + '</text><text x="38" y="54" class="s">score</text></svg>' : '') +
        '<div><button type="button" class="rpBotBtn" data-r="bot:' + this.esc(t.bot) + '" title="Open this bot’s page">' + this.esc(t.botName) + ' ↗</button><b>' + (this.sigOf(t) === 'Not recorded' ? 'Signal not recorded' : this.esc(this.sigOf(t))) + '</b><span>' + (t.dir > 0 ? 'Buy' : 'Sell') + ' · ' + this.esc(t.tf) + (o.lots ? ' · ' + o.lots + ' lots' : '') + (Number.isFinite(o.riskCash) ? ' · risking ' + this.num(o.riskCash, 0) : o.risk > 0 ? ' · risking ' + this.num(o.risk, 2) : '') + '</span></div></div>' +
        (t.src === 'live' && o.live ? '<div class="rpFacts">' + [['spread', o.spreadCost != null ? 'spread cost ' + this.num(o.spreadCost, 2) : ''], ['slip', o.slipCost != null ? 'slippage ' + this.sg(o.slipCost, 2) : ''], ['fees', (o.commission || o.swap || o.fee) ? 'commission and swap ' + this.sg((o.commission || 0) + (o.swap || 0) + (o.fee || 0), 2) : ''], ['how', o.reason ? String(o.reason) : ''], ['touched', o.touched ? 'adjusted by hand' : '']].filter(x => x[1]).map(x => '<span class="no">' + this.esc(x[1]) + '</span>').join('') + '</div>' : '') +
        (reasons.length ? '<div class="rpReasons">' + reasons.map(x => '<div class="rpReason"><span>' + this.esc(x.text) + '</span>' + (x.w != null ? '<i class="' + (x.w >= 0 ? 'up' : 'dn') + '"><u style="width:' + (Math.abs(x.w) / mw * 100).toFixed(0) + '%"></u></i>' : '') + '</div>').join('') + '</div>' : '<p class="rpMuted">' + (t.src === 'live' ? 'MetaTrader keeps the bot’s name on a live order, not its reasons. The signal shows here when Classic recorded it at the moment the order was sent.' : 'This trade recorded no reasons.') + '</p>') +
        (facts.length ? '<div class="rpFacts">' + facts.map(([k, v]) => '<span class="' + (v ? 'yes' : 'no') + '">' + (v ? '✓ ' : '✗ ') + this.esc(k.replace(/^pattern:/, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()) + '</span>').join('') + '</div>' : '') +
        (Object.keys(st).length ? '<div class="rpStats"><small>WHAT THE BOT READ AT THAT MOMENT</small>' + bar('Volatility rank', st.atrPctile, 0, 1, Math.round(st.atrPctile * 100) + '%') + bar('Place in the day’s range', st.rangePos, 0, 1, Math.round(st.rangePos * 100) + '%') + bar('Distance from VWAP', Math.abs(st.distVwap), 0, 3, this.sg(st.distVwap, 2)) + bar('Slope', Math.abs(st.slope), 0, 1.5, this.sg(st.slope, 2)) +
          (st.htf != null ? '<div class="rpStat"><span>Higher timeframe</span><b class="' + (st.htf > 0 ? 'up' : st.htf < 0 ? 'dn' : '') + '">' + (st.htf > 0 ? '▲ up' : st.htf < 0 ? '▼ down' : 'flat') + (st.htf && st.htf === t.dir ? ' · with the trade' : st.htf ? ' · against the trade' : '') + '</b></div>' : '') + '</div>' : '') + '</div>' +
      (V && F && !F.err ? '<div class="rpCard"><small>AROUND IT, AT THE ENTRY</small><div class="rpDials"><div><canvas id="auCompass" width="220" height="130"></canvas><b class="' + (F.s === 'with' ? 'up' : F.s === 'against' ? 'dn' : '') + '">' + (F.s === 'with' ? 'With the daily trend' : F.s === 'against' ? 'Against the daily trend' : F.s === 'flat' ? 'No clear daily trend' : 'Daily trend unknown') + '</b></div><div><canvas id="auRing" width="130" height="130"></canvas><b>' + F.a[0] + ' of ' + F.a[2] + ' readings agreed</b></div></div>' +
        '<div class="rpMeter"><span>Shock</span><i><u class="' + (F.sh ? 'am' : '') + '" style="width:' + Math.min(100, (F.z || 0) / 4 * 100).toFixed(0) + '%"></u></i><b class="' + (F.sh ? 'am' : '') + '">' + (F.z != null ? this.num(F.z, 1) + '× a normal day' : 'unknown') + '</b></div>' +
        '<div class="rpMeter"><span>Texture</span><i><u style="width:' + Math.max(0, Math.min(100, F.chop || 0)).toFixed(0) + '%"></u></i><b>' + (F.chop !== F.chop || F.chop == null ? 'unknown' : F.chop >= 61.8 ? 'choppy' : F.chop <= 38.2 ? 'trending' : 'mixed') + '</b></div>' +
        '<div class="rpSes"><span>Sessions open</span>' + ses.map(s => '<em class="' + (s[1] ? 'on' : '') + '">' + s[0] + '</em>').join('') + '</div>' +
        '<p class="rpWhyLine">' + this.esc(Autopsy.why(t, F)) + '</p></div>' +
        '<div class="rpCard"><small>THE TREND ON EVERY TIMEFRAME</small><div id="rpMtf" class="rpMtf"><span class="rpMuted">Reading the other timeframes…</span></div></div>' +
        '<div class="rpCard"><small>THE MARKETS AROUND IT, WHILE IT WAS OPEN</small><div id="rpPeers" class="rpPeers"><span class="rpMuted">Reading the neighbouring markets…</span></div></div>' : '') +
      '<div class="rpCard"><small>OTHER TRADES OPEN AT THE SAME TIME</small>' + (others.length ? '<p class="rpMuted">' + others.length + ' other ' + (others.length === 1 ? 'trade was' : 'trades were') + ' open: ' + ob + ' buys, ' + (others.length - ob) + ' sells.' + (others.length >= 3 && (ob === others.length || ob === 0) ? ' All on one side: the bots were leaning the same way.' : '') + '</p><div class="rpOthers">' + others.slice(0, 8).map(x => '<button type="button" data-r="sel:' + this.esc(x.id) + '"><b>' + this.esc(this.sym(x.sym)) + '</b><i class="' + (x.dir > 0 ? 'up' : 'dn') + '">' + (x.dir > 0 ? '▲' : '▼') + '</i><span>' + this.esc(x.botName) + '</span><em class="' + (x.pnl > 0 ? 'up' : 'dn') + '">' + this.sg(x.pnl, 0) + '</em></button>').join('') + '</div>' : '<p class="rpMuted">None: this trade was alone.</p>') + '</div>' +
      '<div class="rpCard"><small>HOW THIS SETUP USUALLY DOES</small><div class="rpBase"><div><b>' + same.length + '</b><span>trades by this bot with this signal on ' + this.esc(this.sym(t.sym)) + ' ' + this.esc(t.tf) + '</span></div><div><b>' + (same.length ? Math.round(100 * sw / same.length) + '%' : '–') + '</b><span>of them won' + (same.length < 30 ? ' · too few to trust' : '') + '</span></div><div><b>' + (botAll.length ? Math.round(100 * bw / botAll.length) + '%' : '–') + '</b><span>this bot overall, ' + botAll.length + ' trades</span></div></div><button type="button" class="rpGhost" data-r="deep:1">Open these in the Deep Dive</button></div>' +
      '<div class="rpCard"><small>YOUR NOTE ON THIS TRADE</small><select id="rpTag"><option value="">No label</option>' + [['good', 'Good trade'], ['lucky', 'Lucky'], ['mistake', 'Mistake'], ['rule', 'Broke a rule'], ['lesson', 'Lesson']].map(x => '<option value="' + x[0] + '"' + (note.tag === x[0] ? ' selected' : '') + '>' + x[1] + '</option>').join('') + '</select><textarea id="rpNote" rows="3" placeholder="What did this trade teach you?">' + this.esc(note.text || '') + '</textarea></div>';
    if (V && F && !F.err){ try { Autopsy.drawCompass(); Autopsy.drawRing(); } catch(e){} }
  },
  async around(t){
    const V = this.V, r0 = Autopsy.raw(t, t.t0), r1 = Autopsy.raw(t, t.t1), rows = [];
    for (const tf of ['5m', '15m', '1h', '4h', '1d']){ if (this.t !== t) return; const S = Autopsy.TF[tf]; let P = null;
      try { if (tf === t.tf) P = V.P; else { const bars = tf === '1d' ? await Autopsy.daily(t.sym) : await Autopsy.candles(t.sym, tf, r0 - 260 * S - 3 * 86400, r0 + S); if (bars && bars.length > 60) P = ProInd.prep(bars.map(b => ({ time: b.rawTime != null ? b.rawTime : b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }))); } } catch(e){}
      if (!P){ rows.push({ tf, none: true }); continue; } const i = (tf === t.tf ? V.k : ProInd.indexAt(P, r0) - 1); if (i < 30){ rows.push({ tf, none: true }); continue; }
      const e20 = ProInd.ema(P.c, 20)[i], e50 = ProInd.ema(P.c, 50)[i], e200 = ProInd.ema(P.c, 200)[i], sd = ProInd.supertrend(P).dir[i], rs = ProInd.rsi(P.c, 14)[i];
      rows.push({ tf, ma: e20 === e20 && e50 === e50 ? (e20 > e50 ? 1 : -1) : 0, big: e200 === e200 ? (P.c[i] > e200 ? 1 : -1) : 0, st: sd, rsi: rs }); }
    if (this.t !== t) return; const ar = d => d > 0 ? '<i class="up">▲</i>' : d < 0 ? '<i class="dn">▼</i>' : '<i>·</i>', el = this.$('rpMtf'), withN = rows.filter(x => !x.none).reduce((a, x) => a + (x.ma === t.dir ? 1 : 0) + (x.big === t.dir ? 1 : 0) + (x.st === t.dir ? 1 : 0), 0), of = rows.filter(x => !x.none).length * 3;
    if (el) el.innerHTML = '<div class="rpMtfRow head"><span></span><span>20 / 50</span><span>vs 200</span><span>SuperTrend</span><span>RSI</span></div>' + rows.map(x => '<div class="rpMtfRow' + (x.tf === t.tf ? ' own' : '') + '"><b>' + x.tf + '</b>' + (x.none ? '<span class="rpMuted" style="grid-column:2 / -1">too far back to read</span>' : '<span>' + ar(x.ma) + '</span><span>' + ar(x.big) + '</span><span>' + ar(x.st) + '</span><span class="mono">' + (x.rsi === x.rsi ? Math.round(x.rsi) : '–') + '</span>') + '</div>').join('') +
      '<p class="rpMuted">' + withN + ' of ' + of + ' readings pointed the way of the trade (' + (t.dir > 0 ? 'up' : 'down') + ').</p>';
    /* the neighbours */
    let grp = 'other'; try { grp = (typeof MarketFit !== 'undefined' && MarketFit.marketOf(t.sym)) || 'other'; } catch(e){} const want = this.PEERS[grp] || this.PEERS.other, all = (typeof Feed !== 'undefined' && Feed.bridge && Feed.bridge.symbols) ? [...Feed.bridge.symbols] : [], mine = this.sym(t.sym).toUpperCase();
    const peers = want.filter(x => x !== mine).map(x => all.find(s => this.sym(s).toUpperCase() === x)).filter(Boolean).slice(0, 4), S = Autopsy.TF[t.tf], out = [];
    for (const p of [t.sym].concat(peers)){ if (this.t !== t) return; try { const fake = { sym: p }, a0 = Autopsy.raw(fake, t.t0), a1 = Autopsy.raw(fake, t.t1), bars = p === t.sym ? null : await Autopsy.candles(p, t.tf, a0 - 80 * S, a1 + 30 * S), P = p === t.sym ? V.P : (bars && bars.length > 20 ? ProInd.prep(bars.map(b => ({ time: b.rawTime != null ? b.rawTime : b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume }))) : null);
        if (!P) continue; const i0 = ProInd.indexAt(P, a0), i1 = Math.max(i0, ProInd.indexAt(P, a1)); if (i0 < 1) continue; const from = Math.max(0, i0 - 40), to = Math.min(P.n - 1, i1 + 12), vals = []; for (let i = from; i <= to; i++) vals.push(P.c[i]);
        out.push({ sym: p, own: p === t.sym, pct: (P.c[i1] / P.o[i0] - 1) * 100, vals, e: i0 - from, x: i1 - from }); } catch(e){} }
    if (this.t !== t) return; const pe = this.$('rpPeers'); if (!pe) return; const nb = out.filter(x => !x.own), withT = nb.filter(x => Math.sign(x.pct) === t.dir).length;
    pe.innerHTML = out.length ? out.map(x => { const lo = Math.min(...x.vals), hi = Math.max(...x.vals), sp = hi - lo || 1, W = 150, Hh = 34, X = i => i / Math.max(1, x.vals.length - 1) * W, Y = v => Hh - 2 - (v - lo) / sp * (Hh - 4), col = x.pct >= 0 ? this.C.up : this.C.dn;
        return '<button type="button" class="rpPeer' + (x.own ? ' own' : '') + '" data-r="open:' + this.esc(x.sym) + '" title="Open this chart"><b>' + this.esc(this.sym(x.sym)) + '</b><svg viewBox="0 0 ' + W + ' ' + Hh + '" preserveAspectRatio="none"><rect x="' + X(x.e).toFixed(1) + '" y="0" width="' + Math.max(1, X(x.x) - X(x.e)).toFixed(1) + '" height="' + Hh + '" fill="rgba(79,216,247,.10)"/><polyline fill="none" stroke="' + col + '" stroke-width="1.6" points="' + x.vals.map((v, i) => X(i).toFixed(1) + ',' + Y(v).toFixed(1)).join(' ') + '"/></svg><em class="' + (x.pct >= 0 ? 'up' : 'dn') + '">' + this.sg(x.pct, 2, '%') + '</em></button>'; }).join('') +
      (nb.length ? '<p class="rpMuted">' + withT + ' of ' + nb.length + ' neighbouring markets moved ' + (t.dir > 0 ? 'up' : 'down') + ' with the trade while it was open. The shaded part is the time in the trade.</p>' : '') : '<span class="rpMuted">No neighbouring market could be read for that time.</span>';
  },

  /* ---------- clicks ---------- */
  click(e){
    if (e.target.id === 'auStrip'){ const pts = Autopsy._strip || [], r = e.target.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; let best = null, bd = 196; for (const p of pts){ const d = (p.x - x) ** 2 + (p.y - y) ** 2; if (d < bd){ bd = d; best = p; } } if (best) this.select(best.id); return; }
    const ap = e.target.closest('[data-ap]'); if (ap){ const [k, v] = ap.dataset.ap.split(':'); if (k === 'audit') Autopsy.audit(+v); return; }
    const b = e.target.closest('[data-r]'); if (!b) return; const i = b.dataset.r.indexOf(':'), k = b.dataset.r.slice(0, i), v = b.dataset.r.slice(i + 1), t = this.t, V = this.V;
    if (k === 'sel') this.select(v);
    else if (k === 'f'){ const j = v.indexOf('='); Autopsy.filter[v.slice(0, j)] = v.slice(j + 1); this.refilter(); }
    else if (k === 'classic'){ const x = document.getElementById('tradeReviewBtn'); if (x){ Face._classicReplay = true; try { x.click(); } finally { Face._classicReplay = false; } } }
    else if (!t) return;
    else if (k === 'play'){ this.playing ? this.pause() : this.play(); }
    else if (k === 'step') this.step(+v);
    else if (k === 'prev') this.neighbour(-1); else if (k === 'next') this.neighbour(1);
    else if (k === 'speed'){ this.speed = +v; b.parentElement.querySelectorAll('.rpChip').forEach(x => x.classList.toggle('on', x === b)); if (this.playing) this.play(); }
    else if (k === 'jump' && V){ this.jump({ start: this.a, entry: V.iE, best: V.iBest, worst: V.iWorst, exit: V.iX, end: this.b }[v]); }
    else if (k === 'lay'){ this.L[v] = !this.L[v]; this.saveLayers(); this.restage(); }
    else if (k === 'scene'){ const s = this.SCENES[v]; for (const l of this.LAYERS) this.L[l[0]] = s.includes(l[0]); this.saveLayers(); if (v === 'bot' && V){ this.cur = V.iE; } this.restage(); }
    else if (k === 'dim'){ this.d3 = v === '3'; this.restage(); }
    else if (k === 'osc'){ this.osc = v; this.restage(); }
    else if (k === 'future'){ this.future = !this.future; this.restage(); }
    else if (k === 'tf'){ t.tf = v; delete Autopsy.facts[t.id]; this.select(t.id); }
    else if (k === 'png'){ const cv = this.$(this.d3 ? 'rp3d' : 'rpCv'); if (cv) cv.toBlob(bl => { if (!bl) return; const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'replay-' + this.sym(t.sym) + '-' + new Date(t.t0).toISOString().slice(0, 10) + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); }
    else if (k === 'chart' || k === 'open'){ const s = k === 'open' ? v : t.sym; if (typeof Face !== 'undefined') Face.go('chart'); try { typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(s) : App.setSymbol(s); if (k === 'chart' && App.setTf && Autopsy.TF[t.tf]) setTimeout(() => App.setTf(t.tf), 350); } catch(x){} }
    else if (k === 'bot'){ if (typeof Face !== 'undefined') Face.bot(v); }
    else if (k === 'deep'){ if (typeof Info !== 'undefined'){ Info.f = { src: t.src, period: 'all', bot: t.bot, sym: t.sym, tf: t.tf, dir: '', reason: '', dow: '', hour: '', day: '' }; Face.view('deep', 'info'); } }
  },
  restage(){ const playing = this.playing; this.pause(); this.paintStage(); this.draw(); if (playing) this.play(); },
};
