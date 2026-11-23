/* ASTRA / Timurila — Inspect studio: any chart, any time, taken apart.

   The new look's version of Classic's "Inspect / replay" (Classic's own window is kept and unchanged).

     · HISTORY     loads deep history (more on request) and keeps a list of what you inspected, with the
                   measurements and entry tests you made, so you can go back to them;
     · TIME        a map of the whole history under the chart: drag the window, click to jump, quick spans
                   (a day … everything), a date-and-time jump, the broker's clock or yours;
     · MEASURE     drag from one point to another: the move in price, %, and money for one lot, the number
                   of candles, the time it took, and the exact start and end date and time. Each one stays
                   on the chart and in the list until you remove it;
     · FROM ENTRY  click a candle: three entries at its top, middle and bottom, each tried as a buy and as a
                   sell with the same stop and target, walked forward on the real candles. The labels stand
                   beside the candle, spread apart so they stay readable on a small candle;
     · SIGNALS     for that candle: which of the 20 indicator signals pointed which way, which way would have
                   worked, and how each signal — and each pair that agreed — did on this chart's whole
                   history with the same exit rule. A short history is marked as too few to trust;
     · REPLAY      hide the future and play the candles forward from any point.

   Reads candles only (GET). It never trades. */
const Inspect = {
  C: { up: '#3DDC97', dn: '#FF6B7A', cy: '#4FD8F7', am: '#FFB648', vi: '#A78BFA', grid: '#16223A', text: '#E6EEFF', dim: '#7C8BA8', wick: '#5C6F92' },
  TFS: ['1m', '5m', '15m', '30m', '1h', '4h', '1d'], SEC: { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 },
  HKEY: 'astra_inspect_hist', MKEY: 'astra_inspect_marks',
  sym: null, tf: '1h', bars: [], P: null, a: 0, b: 0, cur: null, tool: 'pan', rule: { stop: 1, tgt: 2, hold: 48, lots: +(localStorage.getItem('astra_inspect_lots') || 0.1) }, clock: 'mine',
  L: { ma: true, vol: true, zones: false, sig: false }, probe: null, drag: null, hov: null, playing: false, speed: 4, busy: false,
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  px(p){ const a = Math.abs(p), d = a >= 1000 ? 1 : a >= 100 ? 2 : a >= 10 ? 3 : a >= 1 ? 4 : 5; return Number(p).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  sg(v, d = 2, u = ''){ if (v == null || !isFinite(v)) return '–'; return (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + u; },
  base(s){ return String(s || '').replace(/\.(s|m|std)$/i, ''); },
  shift(raw){ if (this.clock === 'broker') return 0; try { return typeof Autopsy !== 'undefined' ? Autopsy.shift(this.sym, raw) : 0; } catch(e){ return 0; } },
  date(raw, full){ const d = new Date((raw - this.shift(raw)) * 1000), z = n => String(n).padStart(2, '0'); const day = (this.clock === 'broker' ? [d.getUTCDate(), d.getUTCMonth(), d.getUTCFullYear(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCDay()] : [d.getDate(), d.getMonth(), d.getFullYear(), d.getHours(), d.getMinutes(), d.getDay()]);
    const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'], W = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return (full ? W[day[5]] + ' ' : '') + day[0] + ' ' + M[day[1]] + (full || day[2] !== new Date().getFullYear() ? ' ' + day[2] : '') + ' ' + z(day[3]) + ':' + z(day[4]); },
  dur(sec){ sec = Math.abs(sec); const d = Math.floor(sec / 86400), h = Math.floor(sec % 86400 / 3600), m = Math.round(sec % 3600 / 60); return ((d ? d + 'd ' : '') + (h || d ? h + 'h ' : '') + (d ? '' : m + 'm')).trim(); },
  pv(){ try { const s = Feed.specFor(this.sym); return s && s.pointValue > 0 ? s.pointValue : null; } catch(e){ return null; } },
  ccy(){ try { return (Feed.account && Feed.account.currency) || 'USD'; } catch(e){ return 'USD'; } },
  money(v){ return (v >= 0 ? '+' : '−') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: Math.abs(v) < 100 ? 2 : 0, maximumFractionDigits: Math.abs(v) < 100 ? 2 : 0 }); },
  hist(){ try { return JSON.parse(localStorage.getItem(this.HKEY) || '[]') || []; } catch(e){ return []; } },
  marks(){ try { return JSON.parse(localStorage.getItem(this.MKEY) || '{}') || {}; } catch(e){ return {}; } },
  myMarks(){ return this.marks()[this.sym + '|' + this.tf] || []; },
  saveMarks(list){ const m = this.marks(); if (list.length) m[this.sym + '|' + this.tf] = list.slice(-60); else delete m[this.sym + '|' + this.tf]; try { localStorage.setItem(this.MKEY, JSON.stringify(m)); } catch(e){} },
  remember(){ if (!this.bars.length) return; const h = this.hist().filter(x => !(x.sym === this.sym && x.tf === this.tf)); h.unshift({ sym: this.sym, tf: this.tf, t0: this.bars[this.a].t, t1: this.bars[this.b].t, at: Date.now() }); try { localStorage.setItem(this.HKEY, JSON.stringify(h.slice(0, 30))); } catch(e){} },

  /* ---------- the room ---------- */
  show(host, opts){
    opts = opts || {}; this.host = host;
    if (!host.dataset.in){ host.dataset.in = '1'; host.tabIndex = 0;
      host.innerHTML = '<div class="inWrap"><div class="inHead"><div><h1>Inspect</h1><p>Any chart, any moment: measure it, test an entry on any candle, see which signals would have worked.</p></div><div class="inPick"><input id="inSym" list="inSyms" spellcheck="false" autocomplete="off" placeholder="Instrument"><datalist id="inSyms"></datalist><span class="inSeg" id="inTfs"></span><button type="button" class="inGhost" data-i="here" title="The instrument and timeframe of the chart you have open">Open chart</button><button type="button" class="inGhost" data-i="classic" title="Classic’s own Inspect window">Classic inspect</button></div></div>' +
        '<div class="inMain"><aside class="inRail" id="inRail"></aside><section class="inStage" id="inStage"></section><aside class="inSide" id="inSide"></aside></div></div>';
      host.addEventListener('click', e => this.click(e));
      host.addEventListener('change', e => { const x = e.target; if (x.id === 'inSym'){ const s = this.resolve(x.value); if (s) this.load(s, this.tf); } else if (x.id === 'inJump') this.jumpTo(x.value); else if (x.dataset.rule){ this.rule[x.dataset.rule] = +x.value; if (x.dataset.rule === 'lots') try { localStorage.setItem('astra_inspect_lots', x.value); } catch(er){} this.probe ? this.runProbe() : this.paintSide(); } });
      host.addEventListener('keydown', e => { if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return; if (e.key === ' '){ e.preventDefault(); this.playing ? this.pause() : this.play(); } else if (e.key === 'ArrowRight'){ e.preventDefault(); this.step(1); } else if (e.key === 'ArrowLeft'){ e.preventDefault(); this.step(-1); } else if (e.key === 'Escape'){ this.setTool('pan'); this.probe = null; this.paintSide(); this.draw(); } else if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.altKey) this.setTool(this.tool === 'measure' ? 'pan' : 'measure'); else if ((e.key === 'e' || e.key === 'E') && !e.ctrlKey && !e.altKey) this.setTool(this.tool === 'entry' ? 'pan' : 'entry'); else return; e.stopPropagation(); });
      window.addEventListener('resize', () => { if (this.host && this.host.offsetParent !== null) this.draw(); });
      this.paintStage();
    }
    try { const syms = (Feed.bridge && Feed.bridge.symbols ? [...Feed.bridge.symbols] : []).concat(typeof STORE !== 'undefined' ? [STORE.symbol] : []); this.$('inSyms').innerHTML = [...new Set(syms)].sort().map(s => '<option value="' + this.esc(s) + '">').join(''); } catch(e){}
    const sym = opts.sym || this.sym || STORE.symbol, tf = opts.tf || (this.sym ? this.tf : (this.TFS.includes(STORE.tf) ? STORE.tf : '1h'));
    if (sym !== this.sym || tf !== this.tf || !this.bars.length) this.load(sym, tf, opts.at); else { if (opts.at) this.centre(opts.at); this.paintRail(); this.draw(); }
    setTimeout(() => host.focus({ preventScroll: true }), 50);
  },
  resolve(v){ v = String(v || '').trim(); if (!v) return null; const all = Feed.bridge && Feed.bridge.symbols ? [...Feed.bridge.symbols] : []; return all.find(s => s === v) || all.find(s => this.base(s).toUpperCase() === this.base(v).toUpperCase()) || (all.length ? null : v); },
  async load(sym, tf, at, more){
    if (this.busy) return; this.busy = true; this.pause(); const S = this.SEC[tf] || 3600, keep = more && this.bars.length ? this.bars[this.a].t : null;
    if (!more){ this.sym = sym; this.tf = tf; this.bars = []; this.P = null; this.probe = null; this.cur = null; this.sigCache = null; }
    this.paintStage(); this.msg('Reading ' + (more ? 'older candles' : 'the history') + '…');
    try { const want = more ? Math.min(60000, Math.max(3000, this.bars.length * 2)) : (S >= 86400 ? 3000 : 5000), from = more && this.bars.length ? this.bars[0].t - want * S * 1.6 : null;
      const raw = await API.klines(sym, tf, want, from ? { from: Math.floor(from) } : undefined); if (this.sym !== sym || this.tf !== tf) return;
      const seen = new Set(), out = []; for (const b of raw || []){ const t = b.rawTime != null ? b.rawTime : b.time; if (seen.has(t) || ![b.open, b.high, b.low, b.close].every(Number.isFinite)) continue; seen.add(t); out.push({ t, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume || 0 }); }
      out.sort((x, y) => x.t - y.t); if (more && out.length <= this.bars.length){ this.note = 'No older candles are available for ' + this.base(sym) + ' ' + tf + '.'; }
      this.bars = out; this.prep();
      if (keep != null){ const k = this.idx(keep), span = this.b - this.a; this.a = k; this.b = Math.min(this.bars.length - 1, k + span); }
      else { this.b = this.bars.length - 1; this.a = Math.max(0, this.b - 160); }
      if (at) this.centre(at);
    } catch(e){ this.msg('Could not read the candles: ' + this.esc(e.message || e)); this.busy = false; return; }
    this.busy = false; this.remember(); this.paintStage(); this.paintRail(); this.paintSide(); this.draw();
  },
  prep(){ const B = this.bars; if (typeof ProInd === 'undefined' || B.length < 30){ this.P = null; return; }
    this.P = ProInd.prep(B.map(b => ({ time: b.t, open: b.o, high: b.h, low: b.l, close: b.c, volume: b.v }))); const P = this.P;
    this.ind = { e20: ProInd.ema(P.c, 20), e50: ProInd.ema(P.c, 50), e200: ProInd.ema(P.c, 200), atr: ProInd.atr(P, 14) }; this.sigCache = null; this._Rk = -1; },
  idx(t){ const B = this.bars; let lo = 0, hi = B.length - 1; while (lo < hi){ const m = (lo + hi + 1) >> 1; if (B[m].t <= t) lo = m; else hi = m - 1; } return lo; },
  centre(t){ const k = this.idx(t), span = Math.max(60, this.b - this.a); this.a = Math.max(0, k - Math.round(span * 0.6)); this.b = Math.min(this.bars.length - 1, this.a + span); },
  msg(t){ const c = this.$('inMsg'); if (c){ c.innerHTML = t; c.hidden = !t; } },

  /* ---------- the stage ---------- */
  paintStage(){
    const st = this.$('inStage'); if (!st) return; const n = this.bars.length, S = this.SEC[this.tf] || 3600;
    this.$('inSym').value = this.sym || ''; this.$('inTfs').innerHTML = this.TFS.map(x => '<button type="button" class="inChip mono' + (x === this.tf ? ' on' : '') + '" data-i="tf:' + x + '">' + x + '</button>').join('');
    const first = n ? this.bars[0].t : 0, last = n ? this.bars[n - 1].t : 0;
    st.innerHTML = '<div class="inTools"><span class="inSeg"><button type="button" class="inTool' + (this.tool === 'pan' ? ' on' : '') + '" data-i="tool:pan" title="Move and zoom the chart (drag, wheel)"><svg viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M12 3l-3 3m3-3 3 3M12 21l-3-3m3 3 3-3M3 12l3-3m-3 3 3 3M21 12l-3-3m3 3-3 3"/></svg>Move</button>' +
        '<button type="button" class="inTool' + (this.tool === 'measure' ? ' on' : '') + '" data-i="tool:measure" title="Drag from one point to another (M)"><svg viewBox="0 0 24 24"><path d="M3 17 17 3l4 4L7 21zM7 13l2 2M10 10l2 2M13 7l2 2"/></svg>Measure</button>' +
        '<button type="button" class="inTool' + (this.tool === 'entry' ? ' on' : '') + '" data-i="tool:entry" title="Click a candle: entries at its top, middle and bottom (E)"><svg viewBox="0 0 24 24"><path d="M12 3v18M7 7h10v10H7zM4 7h3M4 12h3M4 17h3"/></svg>From entry</button>' +
        '<button type="button" class="inTool" data-i="clear" title="Remove the measurements and the entry test on this chart">Clear</button></span>' +
      '<span class="inSeg"><small>SHOW</small>' + [['ma', 'Averages'], ['vol', 'Volume'], ['zones', 'Zones'], ['sig', 'Signals']].map(l => '<button type="button" class="inChip' + (this.L[l[0]] ? ' on' : '') + '" data-i="lay:' + l[0] + '">' + l[1] + '</button>').join('') + '</span>' +
      '<span class="inSeg"><small>CLOCK</small><button type="button" class="inChip' + (this.clock === 'mine' ? ' on' : '') + '" data-i="clock:mine" title="Your computer’s time">Mine</button><button type="button" class="inChip' + (this.clock === 'broker' ? ' on' : '') + '" data-i="clock:broker" title="The broker’s server time, as MetaTrader shows it">Broker</button></span>' +
      '<span class="inGrow"></span><button type="button" class="inGhost" data-i="png" title="Save this picture">Picture</button><button type="button" class="inGhost" data-i="rec" id="inRec" title="Record the chart while you work, as a video">Record</button><button type="button" class="inGhost" data-i="csv" title="The visible candles and your measurements as a spreadsheet file">CSV</button><button type="button" class="inGhost" data-i="chart" title="Open this instrument on the live chart">Live chart</button></div>' +
      '<div class="inCanvasBox"><canvas id="inCv"></canvas><div class="inHud" id="inHud"></div><div class="inMsg" id="inMsg" hidden></div></div>' +
      '<div class="inTime"><div class="inTimeRow"><span class="inSeg"><small>SPAN</small>' + [['d', '1D', 86400], ['w', '1W', 604800], ['m', '1M', 2592000], ['q', '3M', 7776000], ['y', '1Y', 31536000], ['all', 'All', 0]].map(x => '<button type="button" class="inChip" data-i="span:' + x[2] + '">' + x[1] + '</button>').join('') + '<button type="button" class="inChip" data-i="fit" title="Back to the latest candles">Latest</button></span>' +
        '<label class="inJump"><small>GO TO</small><input type="datetime-local" id="inJump"' + (n ? ' min="' + this.iso(first) + '" max="' + this.iso(last) + '"' : '') + '></label>' +
        '<span class="inSeg"><small>JUMP</small>' + [['open', 'Day open'], ['asia', 'Tokyo'], ['london', 'London'], ['ny', 'New York'], ['mon', 'Week open']].map(x => '<button type="button" class="inChip" data-i="sess:' + x[0] + '">' + x[1] + '</button>').join('') + '</span>' +
        '<span class="inGrow"></span><span class="inSpan" id="inSpan"></span><button type="button" class="inGhost" data-i="more" title="Read older candles">Load older history</button></div>' +
        '<canvas id="inMap" class="inMap" title="The whole history: drag the window, or click to jump"></canvas>' +
        '<div class="inPlay"><button type="button" data-i="replay" class="' + (this.cur != null ? 'on' : '') + '" title="Hide the candles after a point and play them forward">' + (this.cur != null ? 'Show everything' : 'Replay from here') + '</button><button type="button" data-i="step:-1" title="←">◀</button><button type="button" class="pri" id="inPlayB" data-i="play" title="Space">▶</button><button type="button" data-i="step:1" title="→">▶▏</button>' +
        '<span class="inSeg">' + [1, 4, 10, 25].map(s => '<button type="button" class="inChip mono' + (this.speed === s ? ' on' : '') + '" data-i="speed:' + s + '">' + s + '×</button>').join('') + '</span><span class="inMuted">' + (n ? n.toLocaleString('en-US') + ' candles · ' + this.date(first) + ' → ' + this.date(last) : '') + '</span>' + (this.note ? '<span class="inMuted am">' + this.esc(this.note) + '</span>' : '') + '</div></div>';
    this.note = '';
    const cv = this.$('inCv');
    cv.addEventListener('wheel', e => { e.preventDefault(); const r = cv.getBoundingClientRect(), g = this.g; if (!g) return; const f = (e.clientX - r.left - 6) / g.pw, span = this.b - this.a, dz = e.deltaY > 0 ? 1.15 : 1 / 1.15;
      if (e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)){ const d = Math.round((e.deltaX || e.deltaY) / 40 * Math.max(1, span / 40)); this.pan(d); return; }
      const ns = Math.max(20, Math.min(2000, Math.round(span * dz))), mid = this.a + f * span; this.a = Math.round(mid - f * ns); this.b = this.a + ns; this.clamp(); this.draw(); }, { passive: false });
    cv.addEventListener('mousedown', e => this.down(e)); window.addEventListener('mousemove', this._mv || (this._mv = e => this.move(e))); window.addEventListener('mouseup', this._mu || (this._mu = e => this.up(e)));
    cv.addEventListener('mouseleave', () => { this.hov = null; this.draw(); });
    const map = this.$('inMap'); map.addEventListener('mousedown', e => { const r = map.getBoundingClientRect(), n2 = this.bars.length, k = Math.round((e.clientX - r.left) / r.width * (n2 - 1)), span = this.b - this.a; this.mapDrag = { x: e.clientX, a: this.a, inside: k >= this.a && k <= this.b }; if (!this.mapDrag.inside){ this.a = k - Math.round(span / 2); this.b = this.a + span; this.clamp(); this.draw(); this.mapDrag.a = this.a; } });
  },
  iso(raw){ const d = new Date((raw - this.shift(raw)) * 1000), z = n => String(n).padStart(2, '0'); return this.clock === 'broker' ? d.getUTCFullYear() + '-' + z(d.getUTCMonth() + 1) + '-' + z(d.getUTCDate()) + 'T' + z(d.getUTCHours()) + ':' + z(d.getUTCMinutes()) : d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()); },
  /* a typed date and time → the candle that holds it */
  jumpTo(v){ if (!v || !this.bars.length) return; const ms = this.clock === 'broker' ? Date.parse(v + ':00Z') : new Date(v).getTime(); if (!isFinite(ms)) return; let raw = ms / 1000; raw += this.clock === 'broker' ? 0 : this.shift(raw);
    if (raw < this.bars[0].t){ this.note = 'That date is before the loaded history; press “Load older history”.'; } this.centre(raw); this.flash = this.idx(raw); this.paintStage(); this.draw(); },
  sess(k){ if (!this.bars.length) return; const B = this.bars, ref = this.hov != null ? this.hov : Math.round((this.a + this.b) / 2), t = B[ref].t - this.shift(B[ref].t), d = new Date(t * 1000);
    const utc = (h) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h) / 1000, map = { open: utc(0), asia: utc(0), london: utc(7), ny: utc(13) }; let target = map[k];
    if (k === 'mon'){ const dow = (d.getUTCDay() + 6) % 7; target = utc(0) - dow * 86400; } if (k === 'open'){ target = utc(0); }
    const raw = target + (this.sym ? (typeof Autopsy !== 'undefined' ? Autopsy.shift(this.sym, target + 7200) : 0) : 0); this.flash = this.idx(raw); this.centre(raw); this.draw(); },
  clamp(){ const n = this.bars.length, span = Math.min(n - 1, this.b - this.a); if (this.a < 0){ this.a = 0; this.b = span; } if (this.b > n - 1 + 30){ this.b = n - 1 + 30; this.a = this.b - span; } if (this.a < 0) this.a = 0; },
  pan(d){ this.a += d; this.b += d; this.clamp(); this.draw(); },
  setTool(t){ this.tool = t; this.host.querySelectorAll('[data-i^="tool:"]').forEach(b => b.classList.toggle('on', b.dataset.i === 'tool:' + t)); const cv = this.$('inCv'); if (cv) cv.dataset.tool = t; },
  at(e){ const g = this.g, cv = this.$('inCv'); if (!g || !cv) return null; const r = cv.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; if (x < 0 || y < 0 || x > g.pw + 6 || y > g.mainH) return null; const i = Math.max(0, Math.min(this.bars.length - 1, Math.round((x - 6) / g.cw - 0.5) + this.a)); return { i, x, y, p: g.hi - (y - 8) / (g.mainH - 16) * (g.hi - g.lo) }; },
  down(e){ const p = this.at(e); if (!p) return; this.host.focus({ preventScroll: true });
    if (this.tool === 'measure'){ this.drag = { kind: 'm', A: { i: p.i, p: p.p }, B: { i: p.i, p: p.p } }; }
    else if (this.tool === 'entry'){ this.probe = { i: Math.min(p.i, this.lastShown()) }; this.runProbe(); }
    else this.drag = { kind: 'pan', x: e.clientX, a: this.a, b: this.b }; },
  move(e){ if (this.mapDrag){ const map = this.$('inMap'); if (!map) return; const r = map.getBoundingClientRect(), d = Math.round((e.clientX - this.mapDrag.x) / r.width * this.bars.length), span = this.b - this.a; this.a = this.mapDrag.a + d; this.b = this.a + span; this.clamp(); this.draw(); return; }
    if (!this.host || this.host.offsetParent === null) return; const p = this.at(e);
    if (this.drag && this.drag.kind === 'pan'){ const d = Math.round((this.drag.x - e.clientX) / this.g.cw); this.a = this.drag.a + d; this.b = this.drag.b + d; this.clamp(); this.draw(); return; }
    if (this.drag && this.drag.kind === 'm' && p){ this.drag.B = { i: p.i, p: p.p }; }
    const h = p ? p.i : null; if (h !== this.hov || (p && this.hy !== p.y) || this.drag){ this.hov = h; this.hy = p ? p.y : null; if (!this.playing) this.draw(); } },
  up(){ if (this.mapDrag){ this.mapDrag = null; this.remember(); return; } if (!this.drag) return; const d = this.drag; this.drag = null;
    if (d.kind === 'm' && (d.A.i !== d.B.i || Math.abs(d.A.p - d.B.p) > 0)){ const B = this.bars, list = this.myMarks(); list.push({ t0: B[d.A.i].t, p0: d.A.p, t1: B[d.B.i].t, p1: d.B.p, at: Date.now() }); this.saveMarks(list); this.paintRail(); }
    if (d.kind === 'pan') this.remember(); this.draw(); },
  lastShown(){ return this.cur != null ? this.cur : this.bars.length - 1; },

  /* ---------- a measurement, in words ---------- */
  measure(m){ const B = this.bars, i0 = this.idx(m.t0), i1 = this.idx(m.t1), lo = Math.min(i0, i1), hi = Math.max(i0, i1); let mx = -Infinity, mn = Infinity; for (let i = lo; i <= hi; i++){ mx = Math.max(mx, B[i].h); mn = Math.min(mn, B[i].l); }
    const d = m.p1 - m.p0, pv = this.pv(); return { i0, i1, d, pct: d / m.p0 * 100, n: Math.abs(i1 - i0), sec: m.t1 - m.t0, money: pv ? d * pv : null, mx, mn }; },

  /* ---------- from entry: three prices on one candle, tried both ways ---------- */
  sim(i, entry, dir, rule){ const r = this.sim0(i, entry, dir, rule); if (r.r != null){ const pv = this.pv(); r.move = r.r * r.risk; r.pct = r.move / entry * 100; r.usd = pv ? r.move * pv * (rule.lots || 0) : null; } return r; },
  sim0(i, entry, dir, rule){ const P = this.P, B = this.bars, atr = this.ind && this.ind.atr[i] > 0 ? this.ind.atr[i] : (B[i].h - B[i].l) || entry * 0.002, risk = atr * rule.stop, sl = entry - dir * risk, tp = entry + dir * risk * rule.tgt, end = Math.min(this.lastShown(), i + rule.hold);
    for (let k = i + 1; k <= end; k++){ const b = B[k]; if (dir > 0 ? b.l <= sl : b.h >= sl) return { r: -1, n: k - i, why: 'stop', k, risk }; if (dir > 0 ? b.h >= tp : b.l <= tp) return { r: rule.tgt, n: k - i, why: 'target', k, risk }; }
    if (end <= i) return { r: null, n: 0, why: 'no candles after it yet', k: i, risk }; return { r: dir * (B[end].c - entry) / risk, n: end - i, why: end - i < rule.hold ? 'still open' : 'time limit', k: end, risk }; },
  runProbe(){ const pr = this.probe; if (!pr || !this.bars.length) return; const b = this.bars[pr.i], lv = [['Top', b.h], ['Middle', (b.h + b.l) / 2], ['Bottom', b.l]];
    pr.rows = lv.map(([name, price]) => ({ name, price, buy: this.sim(pr.i, price, 1, this.rule), sell: this.sim(pr.i, price, -1, this.rule) }));
    pr.sig = this.signalsAt(pr.i); this.paintSide(); this.draw(); },
  /* every signal, its direction at (or up to 3 candles before) this candle, and how it did here and on the whole history */
  sigs(){ if (this.sigCache) return this.sigCache; const P = this.P, out = {}; if (!P) return out; for (const S of ProInd.SIGNALS){ try { out[S.id] = { name: S.name || S.label || S.id, arr: ProInd.signal(P, S.id) }; } catch(e){} } return (this.sigCache = out); },
  dirAt(arr, i, look = 3){ for (let k = i; k >= Math.max(0, i - look); k--) if (arr[k]) return { d: arr[k], ago: i - k }; return null; },
  base_(fired, rule, upto){ /* the same exit rule from every candle where these signals agreed */ const P = this.P, n = Math.min(upto, P.n - 2); let w = 0, c = 0, sum = 0;
    for (let i = 210; i < n; i++){ let d = 0; for (const a of fired){ const x = a[i]; if (!x || (d && x !== d)){ d = 0; break; } d = x; } if (!d) continue; const r = this.sim(i, P.c[i], d, rule); if (r.r == null) continue; c++; sum += r.pct; if (r.r > 0) w++; i += 2; }
    return { n: c, win: c ? w / c : null, avg: c ? sum / c : null }; },
  signalsAt(i){ const S = this.sigs(), fired = []; for (const id of Object.keys(S)){ const x = this.dirAt(S[id].arr, i); if (x) fired.push({ id, name: S[id].name, d: x.d, ago: x.ago }); }
    const mid = (this.bars[i].h + this.bars[i].l) / 2, buy = this.sim(i, mid, 1, this.rule), sell = this.sim(i, mid, -1, this.rule), right = buy.r != null && sell.r != null ? (buy.r > sell.r ? 1 : sell.r > buy.r ? -1 : 0) : 0, upto = this.bars.length - 1;
    for (const f of fired){ f.res = f.d > 0 ? buy : sell; f.hist = this.base_([S[f.id].arr], this.rule, upto); }
    const pairs = []; for (let x = 0; x < fired.length; x++) for (let y = x + 1; y < fired.length; y++){ if (fired[x].d !== fired[y].d) continue; pairs.push({ a: fired[x], b: fired[y], d: fired[x].d, res: fired[x].d > 0 ? buy : sell, hist: this.base_([S[fired[x].id].arr, S[fired[y].id].arr], this.rule, upto) }); }
    pairs.sort((p, q) => (q.hist.avg == null ? -9 : q.hist.avg) - (p.hist.avg == null ? -9 : p.hist.avg));
    let agree = null; try { const u = ProInd.agreement(this.P, i, 1); agree = { up: u.yes, dn: u.no, of: u.of }; } catch(e){}
    return { fired, pairs: pairs.slice(0, 8), buy, sell, right, agree }; },

  /* ---------- playback ---------- */
  play(){ if (!this.bars.length) return; if (this.cur == null){ this.cur = Math.min(this.bars.length - 1, Math.round(this.a + (this.b - this.a) * 0.7)); this.paintStage(); } this.playing = true; clearInterval(this.timer);
    this.timer = setInterval(() => { if (!this.host || this.host.offsetParent === null || this.cur >= this.bars.length - 1) return this.pause(); this.cur++; if (this.cur > this.b - 4){ this.a++; this.b++; } this.draw(); }, Math.max(30, 500 / this.speed)); this.syncPlay(); },
  pause(){ this.playing = false; clearInterval(this.timer); this.syncPlay(); },
  step(d){ if (this.cur == null){ this.pan(d); return; } this.pause(); this.cur = Math.max(1, Math.min(this.bars.length - 1, this.cur + d)); if (this.cur > this.b - 2) this.pan(1); else if (this.cur < this.a + 2) this.pan(-1); else this.draw(); },
  syncPlay(){ const b = this.$('inPlayB'); if (b){ b.textContent = this.playing ? '❚❚' : '▶'; b.classList.toggle('on', this.playing); } },

  /* ---------- drawing ---------- */
  draw(){ if (!this.host || this.host.offsetParent === null) return; this.drawMain(); this.drawMap(); this.hud(); const sp = this.$('inSpan'); if (sp && this.bars.length){ const B = this.bars, a = Math.max(0, this.a), b = Math.min(B.length - 1, this.b); sp.textContent = this.date(B[a].t) + ' → ' + this.date(B[b].t) + ' · ' + (b - a + 1) + ' candles · ' + this.dur(B[b].t - B[a].t); } },
  drawMain(){
    const cv = this.$('inCv'); if (!cv) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight; if (W < 80 || Hh < 80) return; cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
    const B = this.bars, C = this.C; if (!B.length){ this.g = null; return; } const a = this.a, b = this.b, last = this.lastShown(), n = b - a + 1, padR = 76, mainH = Hh - 24, pw = W - padR - 6, cw = pw / n, X = i => 6 + (i - a + 0.5) * cw;
    let lo = Infinity, hi = -Infinity; for (let i = Math.max(0, a); i <= Math.min(b, last); i++){ lo = Math.min(lo, B[i].l); hi = Math.max(hi, B[i].h); } if (!isFinite(lo)){ lo = B[last].l; hi = B[last].h; } const pad = (hi - lo) * 0.07 || hi * 0.001; lo -= pad; hi += pad;
    const Y = p => 8 + (hi - p) / (hi - lo) * (mainH - 16), bw = Math.max(1, cw * 0.66); this.g = { X, Y, cw, pw, mainH, lo, hi, W, padR };
    c.font = '11px JetBrains Mono, monospace'; c.textBaseline = 'middle';
    for (let g = 0; g <= 6; g++){ const p = lo + (hi - lo) * g / 6, y = Math.round(Y(p)) + 0.5; c.strokeStyle = C.grid; c.lineWidth = 1; c.beginPath(); c.moveTo(0, y); c.lineTo(W - padR, y); c.stroke(); c.fillStyle = C.dim; c.textAlign = 'left'; c.fillText(this.px(p), W - padR + 8, y); }
    /* the time axis: one label per sensible step */
    { const S = this.SEC[this.tf] || 3600, steps = [3600, 4 * 3600, 12 * 3600, 86400, 2 * 86400, 7 * 86400, 14 * 86400, 30 * 86400, 91 * 86400, 182 * 86400, 365 * 86400], want = (B[Math.min(b, B.length - 1)].t - B[Math.max(0, a)].t) / Math.max(3, W / 130), st = steps.find(s => s >= want && s >= S) || steps[steps.length - 1];
      c.fillStyle = C.dim; c.font = '10px Inter, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'alphabetic'; let prev = -1e9;
      for (let i = Math.max(1, a); i <= Math.min(b, B.length - 1); i++){ const k0 = Math.floor((B[i - 1].t - this.shift(B[i - 1].t)) / st), k1 = Math.floor((B[i].t - this.shift(B[i].t)) / st); if (k0 === k1) continue; const x = X(i); if (x - prev < 70) continue; prev = x; c.strokeStyle = 'rgba(126,156,224,.06)'; c.beginPath(); c.moveTo(Math.round(x) + 0.5, 0); c.lineTo(Math.round(x) + 0.5, mainH); c.stroke(); c.fillText(this.date(B[i].t).replace(/ 00:00$/, ''), x, Hh - 7); } c.textBaseline = 'middle'; }
    c.save(); c.beginPath(); c.rect(0, 0, W - padR, mainH); c.clip();
    if (this.flash != null && B[this.flash]){ const x = X(this.flash); c.fillStyle = 'rgba(255,182,72,.12)'; c.fillRect(x - cw / 2, 0, cw, mainH); }
    if (this.L.zones && typeof Studio !== 'undefined' && this.P){ if (this._Rk !== last + '|' + a){ this._Rk = last + '|' + a; try { this._R = Studio.analyse(B.slice(Math.max(0, last - 400), last + 1).map(x => ({ time: x.t, open: x.o, high: x.h, low: x.l, close: x.c, volume: x.v })), { look: 140 }); this._Roff = Math.max(0, last - 400); } catch(e){ this._R = null; } }
      if (this._R){ const off = this._Roff; try { Studio.paint(c, this._R, { X: i => X(i + off), Y, left: 0, right: W - padR, i0: a - off, i1: last - off, bars: B.slice(off, last + 1).map(x => ({ time: x.t, open: x.o, high: x.h, low: x.l, close: x.c })), layers: { zones: true, events: true }, fmt: p => this.px(p), pulse: 1, sans: 'Inter, sans-serif', mono: 'JetBrains Mono, monospace' }); } catch(e){} } }
    if (this.L.vol){ let mv = 1; for (let i = Math.max(0, a); i <= Math.min(b, last); i++) mv = Math.max(mv, B[i].v); for (let i = Math.max(0, a); i <= Math.min(b, last); i++){ const h = B[i].v / mv * mainH * 0.13; c.fillStyle = B[i].c >= B[i].o ? 'rgba(61,220,151,.2)' : 'rgba(255,107,122,.2)'; c.fillRect(X(i) - bw / 2, mainH - h, bw, h); } }
    for (let i = Math.max(0, a); i <= Math.min(b, last); i++){ const x = X(i), k = B[i], up = k.c >= k.o; c.strokeStyle = C.wick; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(x) + 0.5, Y(k.h)); c.lineTo(Math.round(x) + 0.5, Y(k.l)); c.stroke(); c.fillStyle = up ? C.up : C.dn; const yo = Y(k.o), yc = Y(k.c); c.fillRect(x - bw / 2, Math.min(yo, yc), bw, Math.max(1, Math.abs(yc - yo))); }
    if (this.L.ma && this.ind){ const line = (arr, col) => { c.strokeStyle = col; c.lineWidth = 1.3; c.beginPath(); let on = false; for (let i = Math.max(0, a); i <= Math.min(b, last); i++){ const v = arr[i]; if (v !== v || v == null){ on = false; continue; } on ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)); on = true; } c.stroke(); }; line(this.ind.e200, '#FF6BD6'); line(this.ind.e50, '#FFB648'); line(this.ind.e20, '#4FD8F7'); }
    if (this.L.sig && this.P){ const S = this.sigs(), put = {}; c.font = '600 9px JetBrains Mono, monospace'; c.textAlign = 'center'; const CODE = typeof Replay !== 'undefined' ? Replay.CODE : {};
      for (const id of Object.keys(S)){ const arr = S[id].arr; for (let i = Math.max(0, a); i <= Math.min(b, last); i++){ const d = arr[i]; if (!d) continue; const k = i + '|' + d, m = put[k] = (put[k] || 0) + 1; if (m > 3) continue; const y = d > 0 ? Y(B[i].l) + 10 + (m - 1) * 10 : Y(B[i].h) - 10 - (m - 1) * 10; c.fillStyle = d > 0 ? '#7BE8B8' : '#FF9AA4'; c.fillText(CODE[id] || id, X(i), y); } } }
    /* measurements */
    const drawM = (m, live) => { const r = this.measure(m), x0 = X(r.i0), x1 = X(r.i1), y0 = Y(m.p0), y1 = Y(m.p1), up = r.d >= 0, col = up ? C.up : C.dn;
      c.fillStyle = up ? 'rgba(61,220,151,.10)' : 'rgba(255,107,122,.10)'; c.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0) || 1, Math.abs(y1 - y0) || 1); c.strokeStyle = col; c.lineWidth = 1; c.setLineDash(live ? [4, 3] : []); c.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0)); c.setLineDash([]);
      c.lineWidth = 1.6; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); const ah = Math.atan2(y1 - y0, x1 - x0); c.beginPath(); c.moveTo(x1, y1); c.lineTo(x1 - 9 * Math.cos(ah - 0.4), y1 - 9 * Math.sin(ah - 0.4)); c.lineTo(x1 - 9 * Math.cos(ah + 0.4), y1 - 9 * Math.sin(ah + 0.4)); c.closePath(); c.fillStyle = col; c.fill();
      const lines = [this.sg(r.d, Math.abs(r.d) >= 100 ? 1 : 4) + '  (' + this.sg(r.pct, 2, '%') + ')' + (r.money != null ? '  ' + this.sg(r.money, 2) + ' ' + this.ccy() + '/lot' : ''), r.n + ' candles · ' + this.dur(r.sec), this.date(m.t0, true) + '  →', this.date(m.t1, true)];
      c.font = '600 11px JetBrains Mono, monospace'; const w = Math.max(...lines.map(s => c.measureText(s).width)) + 18, bx = Math.max(4, Math.min(W - padR - w - 4, (x0 + x1) / 2 - w / 2)), by = up ? Math.max(4, Math.min(y0, y1) - 76) : Math.min(mainH - 74, Math.max(y0, y1) + 8);
      c.fillStyle = 'rgba(6,10,18,.92)'; c.strokeStyle = col; c.beginPath(); c.roundRect ? c.roundRect(bx, by, w, 68, 9) : c.rect(bx, by, w, 68); c.fill(); c.stroke(); c.textAlign = 'left';
      lines.forEach((s, k) => { c.fillStyle = k === 0 ? col : k === 1 ? C.text : C.dim; c.font = (k === 0 ? '700 ' : '500 ') + '11px JetBrains Mono, monospace'; c.fillText(s, bx + 9, by + 12 + k * 15); }); };
    for (const m of this.myMarks()) drawM(m); if (this.drag && this.drag.kind === 'm'){ const d = this.drag; drawM({ t0: B[d.A.i].t, p0: d.A.p, t1: B[d.B.i].t, p1: d.B.p }, true); }
    /* the entry test: three prices on the candle, labels spread apart so they stay readable */
    if (this.probe && this.probe.rows){ const pr = this.probe, x = X(pr.i), k = B[pr.i]; c.strokeStyle = C.am; c.lineWidth = 1; c.setLineDash([2, 3]); c.strokeRect(x - cw / 2 - 2, Y(k.h) - 3, cw + 4, Y(k.l) - Y(k.h) + 6); c.setLineDash([]);
      const want = pr.rows.map(r => Y(r.price)), gap = 40, ys = want.slice(); for (let j = 1; j < 3; j++) if (ys[j] - ys[j - 1] < gap) ys[j] = ys[j - 1] + gap; const shift = Math.max(0, ys[2] - (mainH - 26)); for (let j = 0; j < 3; j++) ys[j] -= shift; for (let j = 0; j < 3; j++) ys[j] = Math.max(22, ys[j]);
      const right = x + 70 + 300 < W - padR, lx = right ? x + 60 : x - 60 - 300;
      pr.rows.forEach((r, j) => { const y = want[j], yl = ys[j]; c.fillStyle = C.am; c.beginPath(); c.arc(x, y, 3.5, 0, 6.3); c.fill(); c.strokeStyle = 'rgba(255,182,72,.6)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + (right ? 4 : -4), y); c.lineTo(right ? lx - 6 : lx + 306, yl); c.stroke();
        const cell = (res, dir, ox) => { const col = res.r == null ? C.dim : res.r > 0 ? C.up : C.dn; c.fillStyle = res.r == null ? 'rgba(124,139,168,.12)' : res.r > 0 ? 'rgba(61,220,151,.14)' : 'rgba(255,107,122,.14)'; c.beginPath(); c.roundRect ? c.roundRect(lx + ox, yl - 13, 122, 26, 7) : c.rect(lx + ox, yl - 13, 122, 26); c.fill(); c.fillStyle = col; c.font = '700 11px JetBrains Mono, monospace'; c.textAlign = 'left'; c.fillText((dir > 0 ? '▲ ' : '▼ ') + (res.r == null ? '–' : this.sg(res.pct, 2, '%')) + (res.usd != null ? '  ' + this.money(res.usd) : ''), lx + ox + 7, yl - 3); c.font = '500 9.5px Inter, sans-serif'; c.fillStyle = C.dim; c.fillText(res.why + (res.n ? ' · ' + res.n + (res.n === 1 ? ' candle' : ' candles') : ''), lx + ox + 7, yl + 8); };
        c.fillStyle = 'rgba(6,10,18,.92)'; c.beginPath(); c.roundRect ? c.roundRect(lx - 4, yl - 17, 308, 34, 10) : c.rect(lx - 4, yl - 17, 308, 34); c.fill(); c.strokeStyle = 'rgba(255,182,72,.45)'; c.stroke();
        c.fillStyle = C.am; c.font = '700 10px Inter, sans-serif'; c.textAlign = 'left'; c.fillText(r.name, lx + 2, yl - 4); c.fillStyle = C.text; c.font = '500 10px JetBrains Mono, monospace'; c.fillText(this.px(r.price), lx + 2, yl + 8); cell(r.buy, 1, 52); cell(r.sell, -1, 178); });
      /* where the buy from the middle would have ended */
      const mid = pr.rows[1]; for (const [res, dir] of [[mid.buy, 1], [mid.sell, -1]]){ if (!res || res.k == null || res.k <= pr.i) continue; const xe = X(res.k); if (xe < 0 || xe > W - padR) continue; c.strokeStyle = dir > 0 ? 'rgba(61,220,151,.35)' : 'rgba(255,107,122,.35)'; c.setLineDash([3, 4]); c.beginPath(); c.moveTo(x, Y(mid.price)); c.lineTo(xe, Y(mid.price + dir * res.r * res.risk)); c.stroke(); c.setLineDash([]); } }
    /* the playback cursor and the hidden future */
    if (this.cur != null){ const x = X(this.cur) + cw / 2; c.fillStyle = 'rgba(79,216,247,.05)'; c.fillRect(x, 0, W - padR - x, mainH); c.strokeStyle = C.cy; c.lineWidth = 1.5; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, mainH); c.stroke(); c.fillStyle = C.cy; c.font = '600 10px Inter, sans-serif'; c.textAlign = 'left'; c.fillText('the future is hidden', x + 8, 14); }
    c.restore();
    if (this.hov != null && this.hy != null && this.hy < mainH){ const x = Math.round(X(this.hov)) + 0.5, y = Math.round(this.hy) + 0.5, p = hi - (this.hy - 8) / (mainH - 16) * (hi - lo); c.strokeStyle = 'rgba(230,238,255,.3)'; c.lineWidth = 1; c.setLineDash([2, 3]); c.beginPath(); c.moveTo(x, 0); c.lineTo(x, mainH); c.moveTo(0, y); c.lineTo(W - padR, y); c.stroke(); c.setLineDash([]);
      c.fillStyle = '#E6EEFF'; c.fillRect(W - padR + 2, y - 8, padR - 4, 16); c.fillStyle = '#04121A'; c.font = '11px JetBrains Mono, monospace'; c.textAlign = 'left'; c.fillText(this.px(p), W - padR + 6, y); if (B[this.hov]){ const s = this.date(B[this.hov].t, true); c.font = '10.5px Inter, sans-serif'; const tw = c.measureText(s).width + 12; c.fillStyle = '#E6EEFF'; c.fillRect(Math.max(0, Math.min(W - padR - tw, x - tw / 2)), mainH + 2, tw, 16); c.fillStyle = '#04121A'; c.textAlign = 'center'; c.fillText(s, Math.max(tw / 2, Math.min(W - padR - tw / 2, x)), mainH + 10); } }
  },
  drawMap(){ const cv = this.$('inMap'); if (!cv) return; const dpr = window.devicePixelRatio || 1, W = cv.clientWidth, Hh = cv.clientHeight; if (W < 40) return; cv.width = Math.round(W * dpr); cv.height = Math.round(Hh * dpr); const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, Hh);
    const B = this.bars, n = B.length; if (n < 2) return; const step = Math.max(1, Math.floor(n / W)); let lo = Infinity, hi = -Infinity; for (let i = 0; i < n; i += step){ lo = Math.min(lo, B[i].l); hi = Math.max(hi, B[i].h); } const X = i => i / (n - 1) * W, Y = p => Hh - 4 - (p - lo) / (hi - lo || 1) * (Hh - 8);
    const g = c.createLinearGradient(0, 0, 0, Hh); g.addColorStop(0, 'rgba(79,216,247,.28)'); g.addColorStop(1, 'rgba(79,216,247,0)'); c.beginPath(); c.moveTo(0, Hh); for (let i = 0; i < n; i += step) c.lineTo(X(i), Y(B[i].c)); c.lineTo(W, Hh); c.closePath(); c.fillStyle = g; c.fill();
    c.beginPath(); for (let i = 0; i < n; i += step) i ? c.lineTo(X(i), Y(B[i].c)) : c.moveTo(X(i), Y(B[i].c)); c.strokeStyle = 'rgba(79,216,247,.8)'; c.lineWidth = 1; c.stroke();
    for (const m of this.myMarks()){ const x = X(this.idx(m.t0)); c.fillStyle = '#FFB648'; c.fillRect(x - 1, 0, 2, 5); }
    const x0 = X(Math.max(0, this.a)), x1 = X(Math.min(n - 1, this.b)); c.fillStyle = 'rgba(4,8,16,.55)'; c.fillRect(0, 0, x0, Hh); c.fillRect(x1, 0, W - x1, Hh); c.strokeStyle = '#4FD8F7'; c.lineWidth = 1.5; c.strokeRect(x0 + 0.5, 0.5, Math.max(3, x1 - x0), Hh - 1);
    c.fillStyle = '#4FD8F7'; for (const x of [x0, x1]){ c.beginPath(); c.roundRect ? c.roundRect(x - 2, Hh / 2 - 7, 4, 14, 2) : c.rect(x - 2, Hh / 2 - 7, 4, 14); c.fill(); }
    if (this.cur != null){ const x = X(this.cur); c.strokeStyle = '#FFB648'; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, Hh); c.stroke(); } },
  hud(){ const el = this.$('inHud'); if (!el) return; const B = this.bars; if (!B.length){ el.innerHTML = ''; return; } const i = this.hov != null ? Math.min(this.hov, this.lastShown()) : this.lastShown(), k = B[i], p = B[i - 1], ch = p ? (k.c / p.c - 1) * 100 : 0;
    el.innerHTML = '<b>' + this.esc(this.base(this.sym)) + ' · ' + this.tf + '</b><span>' + this.date(k.t, true) + (this.clock === 'broker' ? ' broker' : '') + '</span><span class="mono">O ' + this.px(k.o) + ' · H ' + this.px(k.h) + ' · L ' + this.px(k.l) + ' · C ' + this.px(k.c) + '</span><em class="' + (ch >= 0 ? 'up' : 'dn') + '">' + this.sg(ch, 2, '%') + '</em>' +
      (this.tool !== 'pan' ? '<i class="inHint">' + (this.tool === 'measure' ? 'Drag from one point to another' : 'Click a candle to test entries at its top, middle and bottom') + '</i>' : ''); },

  /* ---------- the left rail: history and measurements ---------- */
  paintRail(){ const el = this.$('inRail'); if (!el) return; const h = this.hist(), ms = this.myMarks();
    el.innerHTML = '<small class="inCap">YOUR MEASUREMENTS HERE</small>' + (ms.length ? ms.map((m, k) => { const r = this.measure(m); return '<div class="inMRow"><button type="button" data-i="goto:' + m.t0 + '"><b class="' + (r.d >= 0 ? 'up' : 'dn') + '">' + this.sg(r.pct, 2, '%') + '</b><span>' + r.n + ' candles · ' + this.dur(r.sec) + '</span><small>' + this.date(m.t0) + '</small></button><button type="button" class="x" data-i="delm:' + k + '" title="Remove">✕</button></div>'; }).join('') : '<p class="inMuted">Choose <b>Measure</b> and drag on the chart.</p>') +
      '<small class="inCap">RECENTLY INSPECTED</small>' + (h.length ? h.map(x => '<button type="button" class="inHRow' + (x.sym === this.sym && x.tf === this.tf ? ' on' : '') + '" data-i="hist:' + this.esc(x.sym) + '|' + x.tf + '|' + x.t1 + '"><b>' + this.esc(this.base(x.sym)) + '</b><em>' + x.tf + '</em><small>' + new Date(x.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' ' + new Date(x.at).toTimeString().slice(0, 5) + '</small></button>').join('') : '<p class="inMuted">Nothing yet.</p>'); },

  /* ---------- the right side: the entry test and the signals ---------- */
  paintSide(){ const el = this.$('inSide'); if (!el) return; const pr = this.probe, rule = this.rule;
    const ruleHtml = '<div class="inCard"><small class="inCap">THE EXIT RULE FOR EVERY TEST</small><div class="inRule"><label>Stop<select data-rule="stop">' + [0.5, 1, 1.5, 2, 3].map(v => '<option value="' + v + '"' + (rule.stop === v ? ' selected' : '') + '>' + v + ' × candle range</option>').join('') + '</select></label><label>Target<select data-rule="tgt">' + [1, 1.5, 2, 3, 4].map(v => '<option value="' + v + '"' + (rule.tgt === v ? ' selected' : '') + '>' + v + ' × the stop</option>').join('') + '</select></label><label>Give up after<select data-rule="hold">' + [12, 24, 48, 96, 200].map(v => '<option value="' + v + '"' + (rule.hold === v ? ' selected' : '') + '>' + v + ' candles</option>').join('') + '</select></label><label>Size<select data-rule="lots">' + [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2].map(v => '<option value="' + v + '"' + (rule.lots === v ? ' selected' : '') + '>' + v + ' lot' + (v === 1 ? '' : 's') + '</option>').join('') + '</select></label></div><p class="inMuted">Results show the move in % of the price and, when the broker gives the value of a lot, the money for the size you choose' + (this.pv() ? '' : ' (not available for this instrument)') + '. The candle range is the 14-candle average range (ATR). A candle that touches both the stop and the target counts as the stop.</p></div>';
    if (!pr || !pr.rows){ el.innerHTML = '<div class="inCard inIntro"><b>From entry</b><p>Choose <b>From entry</b> and click any candle. You get three entries on it, at its top, middle and bottom, each tried as a buy and as a sell, and the signals that pointed each way.</p><button type="button" class="inPri" data-i="tool:entry">Choose a candle</button></div>' + ruleHtml; return; }
    const B = this.bars, k = B[pr.i], s = pr.sig, cell = r => '<b class="' + (r.r == null ? '' : r.r > 0 ? 'up' : 'dn') + '">' + (r.r == null ? '–' : this.sg(r.pct, 2, '%')) + '</b>' + (r.usd != null ? '<i class="inUsd ' + (r.usd >= 0 ? 'up' : 'dn') + '">' + this.money(r.usd) + '</i>' : '') + '<small>' + r.why + (r.n ? ' · ' + r.n + (r.n === 1 ? ' candle' : ' candles') : '') + '</small>';
    const stat = h => h.n ? '<span class="inStat"><i style="width:' + Math.round((h.win || 0) * 100) + '%"></i></span><em>' + Math.round(h.win * 100) + '% won · ' + this.sg(h.avg, 2, '%') + ' a trade on average · ' + h.n + ' trades' + (h.n < 30 ? ' <u>few</u>' : '') + '</em>' : '<em>no history</em>';
    el.innerHTML = '<div class="inCard"><div class="inPrHead"><b>' + this.date(k.t, true) + '</b><button type="button" class="x" data-i="unprobe" title="Remove the test">✕</button></div><div class="inPr"><span></span><span class="up">▲ as a buy</span><span class="dn">▼ as a sell</span>' + pr.rows.map(r => '<span class="inLv"><b>' + r.name + '</b><small>' + this.px(r.price) + '</small></span><span>' + cell(r.buy) + '</span><span>' + cell(r.sell) + '</span>').join('') + '</div></div>' +
      '<div class="inCard"><small class="inCap">THE SIGNALS ON THIS CANDLE</small>' + (s && s.fired.length ? '<p class="inVerdict">' + (s.right ? (s.right > 0 ? 'From the middle, a <b class="up">buy</b> did better: ' : 'From the middle, a <b class="dn">sell</b> did better: ') + s.fired.filter(f => f.d === s.right).length + ' of ' + s.fired.length + ' signals pointed that way.' : 'From the middle, a buy and a sell ended the same (' + this.sg(s.buy.pct, 2, '%') + '): no direction would have helped here.') + (s.agree ? ' Trend readings: ' + s.agree.up + ' up, ' + s.agree.dn + ' down, of ' + s.agree.of + '.' : '') + '</p>' +
        '<div class="inSigs">' + s.fired.sort((x, y) => (s.right ? (y.d === s.right) - (x.d === s.right) : 0)).map(f => '<div class="inSig ' + (s.right && f.d === s.right ? 'ok' : s.right ? 'no' : '') + '"><span><i class="' + (f.d > 0 ? 'up' : 'dn') + '">' + (f.d > 0 ? '▲' : '▼') + '</i><b>' + this.esc(f.name) + '</b>' + (f.ago ? '<small>' + f.ago + ' candle' + (f.ago > 1 ? 's' : '') + ' before</small>' : '') + '</span><span class="inSigRes">' + cell(f.res) + '</span><span class="inSigHist">' + stat(f.hist) + '</span></div>').join('') + '</div>' +
        (s.pairs.length ? '<small class="inCap">SIGNALS THAT AGREED, IN PAIRS · ON THIS CHART’S WHOLE HISTORY</small><div class="inSigs">' + s.pairs.map(p => '<div class="inSig pair"><span><i class="' + (p.d > 0 ? 'up' : 'dn') + '">' + (p.d > 0 ? '▲' : '▼') + '</i><b>' + this.esc(p.a.name) + ' + ' + this.esc(p.b.name) + '</b></span><span class="inSigRes">' + cell(p.res) + '</span><span class="inSigHist">' + stat(p.hist) + '</span></div>').join('') + '</div>' : '') +
        '<p class="inMuted">“Won” is how often the same exit rule reached the target first, from every candle where the signal (or the pair) fired on the loaded history. Popular signals tested on 266 markets did not beat random entries; a high figure here on few trades is likely luck.</p>'
        : '<p class="inMuted">No signal fired on this candle or the three before it.</p>') + '</div>' + ruleHtml; },

  /* ---------- clicks ---------- */
  click(e){ const b = e.target.closest('[data-i]'); if (!b || !this.host.contains(b)) return; const i = b.dataset.i.indexOf(':'), k = i < 0 ? b.dataset.i : b.dataset.i.slice(0, i), v = i < 0 ? '' : b.dataset.i.slice(i + 1);
    if (k === 'tf') this.load(this.sym, v);
    else if (k === 'here') this.load(STORE.symbol, this.TFS.includes(STORE.tf) ? STORE.tf : this.tf);
    else if (k === 'classic'){ Inspect._pass = true; try { TradeReview.current(); } catch(er){} Inspect._pass = false; }
    else if (k === 'tool') this.setTool(v);
    else if (k === 'clear'){ this.saveMarks([]); this.probe = null; this.paintRail(); this.paintSide(); this.draw(); }
    else if (k === 'lay'){ this.L[v] = !this.L[v]; b.classList.toggle('on', this.L[v]); this.draw(); }
    else if (k === 'clock'){ this.clock = v; this.paintStage(); this.paintRail(); this.paintSide(); this.draw(); }
    else if (k === 'span'){ const B = this.bars; if (!B.length) return; const end = this.b >= B.length - 1 ? B.length - 1 : Math.min(B.length - 1, this.b); if (+v === 0){ this.a = 0; this.b = B.length - 1; } else { this.b = end; this.a = Math.max(0, this.idx(B[end].t - +v)); if (this.b - this.a < 20) this.a = Math.max(0, this.b - 20); } this.draw(); }
    else if (k === 'fit'){ this.b = this.bars.length - 1; this.a = Math.max(0, this.b - 160); this.draw(); }
    else if (k === 'sess') this.sess(v);
    else if (k === 'more') this.load(this.sym, this.tf, null, true);
    else if (k === 'replay'){ if (this.cur != null){ this.cur = null; this.pause(); } else this.cur = Math.max(1, Math.min(this.bars.length - 1, this.hov != null ? this.hov : Math.round(this.a + (this.b - this.a) * 0.6))); this.paintStage(); this.draw(); }
    else if (k === 'play') this.playing ? this.pause() : this.play();
    else if (k === 'step') this.step(+v);
    else if (k === 'speed'){ this.speed = +v; b.parentElement.querySelectorAll('.inChip').forEach(x => x.classList.toggle('on', x === b)); if (this.playing) this.play(); }
    else if (k === 'goto'){ this.centre(+v); this.draw(); }
    else if (k === 'delm'){ const l = this.myMarks(); l.splice(+v, 1); this.saveMarks(l); this.paintRail(); this.draw(); }
    else if (k === 'hist'){ const [s, tf, t1] = v.split('|'); this.load(s, tf, +t1); }
    else if (k === 'unprobe'){ this.probe = null; this.paintSide(); this.draw(); }
    else if (k === 'png'){ const cv = this.$('inCv'); cv && cv.toBlob(bl => { if (!bl) return; const a = document.createElement('a'); a.href = URL.createObjectURL(bl); a.download = 'inspect-' + this.base(this.sym) + '-' + this.tf + '.png'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }); }
    else if (k === 'csv'){ const B = this.bars, rows = [['time', 'open', 'high', 'low', 'close', 'volume']]; for (let j = Math.max(0, this.a); j <= Math.min(B.length - 1, this.b); j++) rows.push([this.iso(B[j].t), B[j].o, B[j].h, B[j].l, B[j].c, B[j].v]); rows.push([]); rows.push(['measurement from', 'price', 'to', 'price', 'change %', 'candles']); for (const m of this.myMarks()){ const r = this.measure(m); rows.push([this.iso(m.t0), m.p0, this.iso(m.t1), m.p1, r.pct.toFixed(3), r.n]); }
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' })); a.download = 'inspect-' + this.base(this.sym) + '-' + this.tf + '.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
    else if (k === 'rec') this.record(b);
    else if (k === 'chart'){ if (typeof Face !== 'undefined') Face.go('chart'); try { typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.openChart(this.sym) : App.setSymbol(this.sym); if (App.setTf) setTimeout(() => App.setTf(this.tf), 350); } catch(er){} } },
  record(btn){ if (this.rec){ this.rec.stop(); return; } const cv = this.$('inCv'); if (!cv || !cv.captureStream || typeof MediaRecorder === 'undefined') return toast && toast('This browser cannot record the chart', 'warn');
    const chunks = [], r = new MediaRecorder(cv.captureStream(30), { mimeType: MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' : 'video/webm' }); this.rec = r; btn.classList.add('rec'); btn.textContent = '● Stop recording';
    const keep = setInterval(() => this.draw(), 100); r.ondataavailable = e => e.data.size && chunks.push(e.data); r.onstop = () => { clearInterval(keep); this.rec = null; btn.classList.remove('rec'); btn.textContent = 'Record'; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' })); a.download = 'inspect-' + this.base(this.sym) + '.webm'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }; r.start(); },
};
