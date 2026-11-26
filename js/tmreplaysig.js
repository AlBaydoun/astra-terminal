/* ASTRA · Replay — the Signals board as it stood when the trade opened, and sections you can move.

   One more card in the Replay studio's side column: the same readings the Signals tab shows live, worked out
   from the candles that had CLOSED when the trade was opened:

     THE DIAL        how many of the readings pointed up and down, the verdict in the board's own words, and how
                     many pointed with the trade and against it
     THE LIGHTS      every reading by family (trend, momentum, volume, pullback, structure), green, red or grey.
                     Press a light: what it reads, the value it had then, and for how many candles it had
                     pointed that way
     BY TIMEFRAME    the same dial on 5m, 15m, 1h, 4h and 1d at that moment: up and down, the trend readings,
                     the close against its 200 average, and whether that timeframe was with the trade.
                     Press a timeframe: the dial and the lights above show that timeframe

   It is read on the last candle that had closed before the entry. The live board also counts the candle that
   is still forming, so a light or two may have looked different on screen at the moment itself.

   SECTIONS          every card of the side column has ▲ ▼ in its title: move it up or down, the order is kept.

   It reads candles (js/autopsy.js does the fetching, GET only) and draws. Nothing else in the Replay changes. */
'use strict';
const ReplaySig = window.ReplaySig = {
  TFS: ['5m', '15m', '1h', '4h', '1d'], H: {}, n: 0, rows: [], tfs: [], t: null, sel: '', light: '',
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  ready(){ return typeof SignalBoard !== 'undefined' && !!SignalBoard.tally && typeof ProInd !== 'undefined' && typeof Autopsy !== 'undefined'; },
  /* the card's place in the side column; the reading is filled in as it arrives */
  card(t){ if (!t || !this.ready()) return ''; return '<div class="rpCard rpSig"><small>THE SIGNALS BOARD, WHEN IT OPENED</small><div id="rpSig" class="rsBox">' + (this.H[t.id] || '<span class="rpMuted">Reading the signals as they were…</span>') + '</div></div>'; },
  map(list){ return list.map(b => ({ time: b.rawTime != null ? b.rawTime : b.time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume })); },
  /* the count on one timeframe, on the last candle that had closed before the entry */
  async tallyAt(R, t, tf, r0){ let bars = null, i = -1;
    if (tf === t.tf){ bars = R.bars; i = R.V.k; }
    else { const S = Autopsy.TF[tf]; if (!S) return null; const got = tf === '1d' ? await Autopsy.daily(t.sym) : await Autopsy.candles(t.sym, tf, r0 - 420 * S - 3 * 86400, r0 + S); if (!got || got.length < 60) return null; bars = this.map(got); i = ProInd.indexAt(ProInd.prep(bars), r0) - 1; }
    if (i < 259) return { few: true }; return SignalBoard.tally(bars.slice(Math.max(0, i + 1 - SignalBoard.LOOK), i + 1)) || { few: true }; },
  paint(){ const t = this.t; if (!t) return; const h = this.html(t, this.rows, this.tfs); this.H = {}; this.H[t.id] = h; const el = document.getElementById('rpSig'); if (el) el.innerHTML = h; },
  async run(R, t){ if (!this.ready() || !R || !R.V || !t) return; const r0 = Autopsy.raw(t, t.t0), tfs = this.TFS.includes(t.tf) ? this.TFS.slice() : [t.tf].concat(this.TFS), rows = [];
    this.t = t; this.rows = rows; this.tfs = tfs; this.sel = t.tf; this.light = ''; this.R = R; this.paint();
    for (const tf of [t.tf].concat(tfs.filter(x => x !== t.tf))){ if (R.t !== t || this.t !== t) return; let T = null; try { T = await this.tallyAt(R, t, tf, r0); } catch(e){ console.warn('replay signals', tf, e); } rows.push({ tf, T }); if (R.t === t && this.t === t) this.paint(); } },
  dial(T, big){ const a = ((T.up - T.dn) / T.of * 90).toFixed(1), id = 'rsG' + (++this.n);
    return '<svg viewBox="0 0 150 92" class="rsDial' + (big ? ' big' : '') + '" aria-hidden="true"><defs><linearGradient id="' + id + '" x1="0" x2="1"><stop offset="0" stop-color="#FF6B7A"/><stop offset=".5" stop-color="#3A4763"/><stop offset="1" stop-color="#3DDC97"/></linearGradient></defs><path d="M14 80 A61 61 0 0 1 136 80" fill="none" stroke="url(#' + id + ')" stroke-width="' + (big ? 9 : 12) + '" stroke-linecap="round" opacity=".85"/><line x1="75" y1="80" x2="75" y2="30" stroke="#F2F6FF" stroke-width="' + (big ? 2.6 : 4) + '" stroke-linecap="round" transform="rotate(' + a + ' 75 80)"/><circle cx="75" cy="80" r="' + (big ? 5 : 7) + '" fill="#F2F6FF"/></svg>'; },
  span(c, tf){ const s = c * (Autopsy.TF[tf] || 0); if (!s) return ''; return s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.floor(s / 3600) + ' h' + (Math.round(s % 3600 / 60) ? ' ' + Math.round(s % 3600 / 60) + ' m' : '') : (s / 86400).toFixed(s < 864000 ? 1 : 0) + ' d'; },
  html(t, rows, tfs){ const SB = SignalBoard, R = SB.readings(), E = s => this.esc(s), side = t.dir > 0 ? 'BUY' : 'SELL', own = rows.find(r => r.tf === t.tf), shown = rows.find(r => r.tf === this.sel && r.T && !r.T.few) ? this.sel : t.tf, cur = rows.find(r => r.tf === shown); let h = '';
    if (!own) h += '<span class="rpMuted">Reading the signals as they were…</span>';
    else if (!cur || !cur.T || cur.T.few) h += '<p class="rpMuted">There are too few candles before this entry to read every signal on ' + E(shown) + ' (260 are needed).</p>';
    else { const T = cur.T, play = R.filter(r => !r.quiet && (T.vol || r.fam !== 'volume')).length, L = SB.lean(T.up, T.dn, play), word = L.side > 0 ? 'up' : L.side < 0 ? 'down' : '', flat = T.of - T.up - T.dn, w = t.dir > 0 ? T.up : T.dn, ag = t.dir > 0 ? T.dn : T.up;
      h += '<div class="rsCols"><div class="rsLeft"><div class="rsTop">' + this.dial(T, true) + '<div class="rsNum"><b class="' + (L.side > 0 ? 'up' : L.side < 0 ? 'dn' : '') + '">' + L.n + '/' + T.of + '</b><small>' + (L.side ? 'pointed ' + word : 'evenly split') + ' on ' + E(shown) + '</small></div></div>' +
        '<p class="rsVerdict"><b class="' + (L.level ? (L.side > 0 ? 'up' : 'dn') : '') + '">' + (L.level === 2 ? 'Most readings pointed ' + word : L.level === 1 ? 'Leaning ' + word : 'Mixed: no clear side') + '</b><span>' + T.up + ' up · ' + T.dn + ' down · ' + flat + ' neither</span></p>' +
        '<p class="rsWith ' + (w > ag ? 'ok' : w < ag ? 'no' : '') + '"><b>' + w + '</b> of ' + T.of + ' pointed with this ' + side + ', <b>' + ag + '</b> against it.</p>' +
        (shown !== t.tf ? '<p class="rsOther">Showing ' + E(shown) + '. The trade was opened on ' + E(t.tf) + '. <button type="button" data-rstf="' + E(t.tf) + '">Back to ' + E(t.tf) + '</button></p>' : '') + '</div><div class="rsRight">' +
        SB.FAM.map(f => { const ls = R.map((r, x) => ({ r, x, d: T.last[x] })).filter(o => o.r.fam === f[0]); if (!ls.length) return '';
          return '<div class="rsFam"><h6>' + E(f[1].split(' · ')[0]) + ' <em>' + ls.filter(o => o.d > 0).length + ' up · ' + ls.filter(o => o.d < 0).length + ' down</em></h6><div class="rsLights">' + ls.map(o => '<button type="button" data-rsl="' + E(o.r.id) + '" class="' + (o.d > 0 ? 'up' : o.d < 0 ? 'dn' : 'fl') + (this.light === o.r.id ? ' open' : '') + '" title="' + E(o.r.name + ': ' + (o.d > 0 ? 'pointed up' : o.d < 0 ? 'pointed down' : 'neither') + '. Press for what it read then.') + '"><i></i>' + E(SB.SHORT[o.r.id] || o.r.name) + '</button>').join('') + '</div></div>'; }).join('') +
        (() => { const x = R.findIndex(r => r.id === this.light); if (x < 0) return '<p class="rsHint">Press a light to see what it read at that moment, or a timeframe below to see its lights here.</p>'; const r = R[x], d = T.last[x], hl = T.held ? T.held[x] : 0, v = T.vals ? T.vals[x] : '', sp = this.span(hl, shown);
          return '<div class="rsMore"><b>' + E(r.name) + ' <i class="' + (d > 0 ? 'up' : d < 0 ? 'dn' : '') + '">' + (d > 0 ? 'pointed up' : d < 0 ? 'pointed down' : 'pointed neither way') + '</i> <em>on ' + E(shown) + ', at the entry</em></b>' + (v ? '<p>Its value then: <b>' + E(v) + '</b></p>' : '') + (hl ? '<p>It had pointed this way for <b>' + hl + ' candle' + (hl === 1 ? '' : 's') + '</b>' + (sp ? ' (' + sp + ')' : '') + '.</p>' : '') + '<p>' + E(r.how || '') + '</p></div>'; })() + '</div></div>'; }
    h += '<h6 class="rsH">BY TIMEFRAME, AT THE ENTRY <em>press one to see its lights above</em></h6><div class="rsTfs">' + tfs.map(tf => { const r = rows.find(x => x.tf === tf), own2 = tf === t.tf ? ' own' : '';
      if (!r) return '<div class="rsTf wait' + own2 + '"><b>' + E(tf) + '</b><small>reading…</small></div>'; if (!r.T) return '<div class="rsTf none' + own2 + '"><b>' + E(tf) + '</b><small>too far back to read</small></div>'; if (r.T.few) return '<div class="rsTf none' + own2 + '"><b>' + E(tf) + '</b><small>too few candles then</small></div>';
      const T = r.T, s = T.up > T.dn ? 1 : T.dn > T.up ? -1 : 0, tr = R.map((x, k) => x.fam === 'trend' ? T.last[k] : 0), tu = tr.filter(d => d > 0).length, td = tr.filter(d => d < 0).length;
      return '<button type="button" data-rstf="' + E(tf) + '" aria-pressed="' + (tf === shown) + '" title="Show the ' + E(tf) + ' lights above" class="rsTf ' + (s === t.dir ? 'with' : s ? 'against' : '') + own2 + (tf === shown ? ' sel' : '') + '"><b>' + E(tf) + '</b>' + this.dial(T) + '<span class="' + (s > 0 ? 'up' : s < 0 ? 'dn' : '') + '">' + T.up + ' up · ' + T.dn + ' down</span><small>trend: ' + tu + ' up · ' + td + ' down</small><small>' + (T.trend > 0 ? '▲ above' : T.trend < 0 ? '▼ below' : 'at') + ' its 200 average</small><em>' + (s === t.dir ? 'with the trade' : s ? 'against the trade' : 'no side') + '</em></button>'; }).join('') + '</div>' +
      '<p class="rsNote">Read on the last candle that had closed before the entry, from candles known then. The live board also counts the candle still forming, so a light or two may have looked different at the moment itself. The readings describe the chart; they are not a forecast.</p>';
    return h; },

  /* ---------- the side column's cards, in your own order ---------- */
  OKEY: 'astra_replay_order',
  order(){ let s = []; try { s = JSON.parse(localStorage.getItem(this.OKEY) || '[]') || []; } catch(e){} return Array.isArray(s) ? s : []; },
  cards(){ const side = document.getElementById('rpSide'); return side ? [...side.querySelectorAll(':scope > .rpCard')] : []; },
  sections(){ const cards = this.cards(); if (!cards.length) return; const saved = this.order();
    cards.forEach((c, i) => { const sm = c.querySelector(':scope > small'); if (!sm) return; if (!c.dataset.rpk) c.dataset.rpk = sm.textContent.trim(); c.dataset.rpi = String(i);
      if (!sm.querySelector('.rpMv')) sm.insertAdjacentHTML('beforeend', '<span class="rpMv"><button type="button" data-rpmv="-1" title="Move this section up" aria-label="Move this section up">▲</button><button type="button" data-rpmv="1" title="Move this section down" aria-label="Move this section down">▼</button></span>'); });
    const rank = c => { const k = saved.indexOf(c.dataset.rpk); return k < 0 ? 1000 + (+c.dataset.rpi) : k; }, sorted = cards.slice().sort((a, b) => rank(a) - rank(b));
    sorted.forEach((c, k) => { c.style.order = String(k); const b = c.querySelectorAll(':scope > small .rpMv button'); if (b[0]) b[0].disabled = k === 0; if (b[1]) b[1].disabled = k === sorted.length - 1; }); return sorted; },
  moveCard(card, d){ const sorted = this.sections() || [], k = sorted.indexOf(card), j = k + d; if (k < 0 || j < 0 || j >= sorted.length) return; const t = sorted[k]; sorted[k] = sorted[j]; sorted[j] = t;
    try { localStorage.setItem(this.OKEY, JSON.stringify(sorted.map(c => c.dataset.rpk))); } catch(e){} this.sections(); card.classList.remove('rpMoved'); void card.offsetWidth; card.classList.add('rpMoved'); card.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); },
  init(){ if (this._on) return; this._on = true;
    document.addEventListener('click', e => { const el = e.target.closest && e.target.closest('#rpSig [data-rstf], #rpSig [data-rsl], #rpSide [data-rpmv]'); if (!el) return;
      if (el.dataset.rpmv){ e.preventDefault(); e.stopPropagation(); const c = el.closest('.rpCard'); if (c) this.moveCard(c, +el.dataset.rpmv); return; }
      if (el.dataset.rstf){ this.sel = el.dataset.rstf; this.paint(); return; }
      this.light = this.light === el.dataset.rsl ? '' : el.dataset.rsl; this.paint(); });
    /* the Replay draws its side column in one go: the order and the ▲ ▼ are put back after each drawing */
    if (typeof Replay !== 'undefined' && Replay.paintSide && !Replay._rsWrap){ Replay._rsWrap = true; const ps = Replay.paintSide.bind(Replay); Replay.paintSide = (...a) => { const r = ps(...a); try { this.sections(); } catch(e){} return r; }; } },
};
ReplaySig.init();
