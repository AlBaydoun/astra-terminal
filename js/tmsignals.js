/* ASTRA / Timurila — the Signals board: a side tab that reads the open chart the way you would,
   twenty readings at once, and shows which way they point right now.

     THE LEAN       a dial and a ring: how many of the twenty point up, how many down
     TIME           when this candle closes, how long the lean has held, the newest change,
                    which sessions are open, how big this candle is against a usual one
     TIMEFRAMES     the nine trend readings on 5m, 15m, 1h, 4h and 1d (press one to open it)
     THE LIGHTS     trend (9), momentum (10), structure (1). Green = points up, red = down,
                    grey = neither. Each shows for how many candles it has held; press one
                    for what it reads and how it did on this very chart
     FRESH SIGNALS  the one-off signals (a flip, a cross, a sweep…) of the last few candles
     THE RECORD     counted on the candles of this chart: when this many pointed this way
                    before, how often price went that way five candles later, next to how
                    often it went that way on any candle. Direction only, before costs.

   It reads candles and draws. It places nothing, arms nothing and sends no order; the only
   thing a press here changes is which chart timeframe you look at. The readings describe
   the chart, they are not a forecast: the record under them says how much they were worth.

   Only in the new look. Needs js/proind.js (the indicator maths) and Classic's Chart / STORE. */
'use strict';
const SignalBoard = window.SignalBoard = {
  LOOK: 1200,               /* candles of the open chart that are read */
  AHEAD: 5,                 /* candles looked ahead in the record */
  WARM: 210,                /* candles left out at the start (the 200 average needs them) */
  TFS: ['5m', '15m', '1h', '4h', '1d'],
  M: {},                    /* other timeframes: { 'sym|tf': { at, up, dn, of } } */
  open: '',                 /* the light whose details are open */
  prev: {},                 /* each light's last direction, to show a change the moment it happens */
  $: id => document.getElementById(id),
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  ICON: '<svg class="wsIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 18a8 8 0 0 1 16 0"/><path d="M12 18l4-6"/><circle cx="12" cy="18" r="1.2"/><path d="M6.5 12.5l1 1M17.5 12.5l-1 1M12 10v1.4"/></svg>',

  /* ---------- the twenty readings: each answers, candle by candle, +1 up · -1 down · 0 neither ---------- */
  mm(P, k, f){ return P._m[k] || (P._m[k] = f()); },
  sg(n, f){ const o = new Int8Array(n); for (let k = 0; k < n; k++){ const x = f(k); o[k] = x > 0 ? 1 : x < 0 ? -1 : 0; } return o; },
  HOW: { st: 'SuperTrend 10 / 3. Price above its line is up, below is down.', ce: 'Chandelier Exit 22 / 3. Which side its trailing stop sits on.', ut: 'UT Bot (key 1, ATR 10). Which side its trail sits on.', macd: 'MACD 12 / 26 / 9. The histogram above zero is up, below is down.', ichi: 'Ichimoku. A close above the cloud is up, below is down, inside is neither.', ma: 'The 50 average above the 200 average is up.', di: 'Directional index 14. +DI above −DI is up.', mid: 'A close above the middle of the last 20 candles is up.', lor: 'A nearest-neighbour vote: what happened after the most similar past candles.' },
  readings(){ if (this._R) return this._R; const I = ProInd, S = this, f1 = v => v === v ? (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1)) : '–';
    const trend = I.STATES.map(s => ({ id: 't_' + s.id, name: s.name, fam: 'trend', how: S.HOW[s.id] || '', run: P => I.state(P, s.id) }));
    const e = (P, n) => S.mm(P, 'sg_ema' + n, () => I.ema(P.c, n)), rsi = P => S.mm(P, 'sg_rsi', () => I.rsi(P.c, 14));
    const mom = [
      { id: 'm_rsi', name: 'RSI 14', how: 'Above 55 is up, below 45 is down, between is neither.', run: P => { const R = rsi(P); return S.sg(P.n, k => R[k] > 55 ? 1 : R[k] < 45 ? -1 : 0); }, val: (P, i) => 'RSI ' + f1(rsi(P)[i]) },
      { id: 'm_srsi', name: 'Stochastic RSI', how: '%K above %D is up, below is down.', run: P => { const s = I.stochRsi(P); return S.sg(P.n, k => s.k[k] - s.d[k]); }, val: (P, i) => '%K ' + f1(I.stochRsi(P).k[i]) },
      { id: 'm_wt', name: 'WaveTrend', how: 'The fast line above the slow line is up.', run: P => { const w = I.wavetrend(P); return S.sg(P.n, k => w.wt1[k] - w.wt2[k]); }, val: (P, i) => f1(I.wavetrend(P).wt1[i]) },
      { id: 'm_fish', name: 'Fisher Transform', how: 'Fisher above its trigger line is up.', run: P => { const f = I.fisher(P); return S.sg(P.n, k => f.f[k] - f.trig[k]); }, val: (P, i) => f1(I.fisher(P).f[i]) },
      { id: 'm_cci', name: 'CCI 20', how: 'Above +25 is up, below −25 is down.', run: P => { const c = I.cci(P, 20); return S.sg(P.n, k => c[k] > 25 ? 1 : c[k] < -25 ? -1 : 0); }, val: (P, i) => 'CCI ' + f1(I.cci(P, 20)[i]) },
      { id: 'm_sqz', name: 'Squeeze momentum', how: 'The momentum bar of the squeeze: above zero is up.', run: P => { const q = I.squeeze(P); return S.sg(P.n, k => q.mom[k]); }, val: (P, i) => I.squeeze(P).on[i] ? 'squeezed' : 'released' },
      { id: 'm_ema', name: 'EMA 9 / 21', how: 'The 9 average above the 21 average is up.', run: P => { const a = e(P, 9), b = e(P, 21); return S.sg(P.n, k => a[k] - b[k]); } },
      { id: 'm_e20', name: 'Price / EMA 20', how: 'A close above the 20 average is up.', run: P => { const a = e(P, 20); return S.sg(P.n, k => P.c[k] - a[k]); } },
      { id: 'm_vwap', name: 'Price / weekly VWAP', how: 'A close above this week’s volume-weighted average price is up.', run: P => { const v = I.avwap(P, 'week').v; return S.sg(P.n, k => v[k] === v[k] ? P.c[k] - v[k] : 0); } },
      { id: 'm_roc', name: 'Move over 10 candles', how: 'The close against the close ten candles earlier.', run: P => S.sg(P.n, k => k >= 10 ? P.c[k] - P.c[k - 10] : 0), val: (P, i) => i >= 10 && P.c[i - 10] ? ((P.c[i] / P.c[i - 10] - 1) * 100 >= 0 ? '+' : '−') + Math.abs((P.c[i] / P.c[i - 10] - 1) * 100).toFixed(2) + '%' : '' },
    ].map(r => Object.assign(r, { fam: 'momentum' }));
    const struct = [{ id: 's_brk', name: 'Last break of structure', fam: 'structure', how: 'Which way the most recent break of a swing high or low went.', run: P => { const o = new Int8Array(P.n), ev = I.structure(P).slice().sort((a, b) => a.i - b.i); let d = 0, p = 0; for (let k = 0; k < P.n; k++){ while (p < ev.length && ev[p].i <= k){ d = ev[p].up ? 1 : -1; p++; } o[k] = d; } return o; } }];
    return (this._R = trend.concat(mom, struct)); },
  FAM: [['trend', 'TREND'], ['momentum', 'MOMENTUM'], ['structure', 'STRUCTURE']],
  SHORT: { t_st: 'SuperTrend', t_ce: 'Chandelier', t_ut: 'UT Bot', t_macd: 'MACD', t_ichi: 'Ichimoku', t_ma: 'MA 50/200', t_di: 'DI + / −', t_mid: 'Donchian', t_lor: 'Lorentzian', m_rsi: 'RSI 14', m_srsi: 'Stoch RSI', m_wt: 'WaveTrend', m_fish: 'Fisher', m_cci: 'CCI 20', m_sqz: 'Squeeze', m_ema: 'EMA 9/21', m_e20: 'Px / EMA 20', m_vwap: 'Px / VWAP', m_roc: '10-c move', s_brk: 'Structure' },

  /* ---------- the tab ---------- */
  init(){ const st = this.$('sideTabs'), body = document.querySelector('#sidebar .sideBody'); if (!st || !body || this.$('tab-tssig') || typeof ProInd === 'undefined') return;
    const b = document.createElement('button'); b.type = 'button'; b.dataset.tab = 'tssig'; b.className = 'tsOnlyFace'; b.title = 'Signals: twenty readings of this chart, live'; b.innerHTML = this.ICON + '<span>SIGNALS</span>'; st.insertBefore(b, st.children[1] || st.querySelector('.sideCtl') || null);
    b.addEventListener('click', () => { st.querySelectorAll('button[data-tab]').forEach(x => x.classList.toggle('active', x === b)); document.querySelectorAll('#sidebar .sidePanel').forEach(p => p.classList.toggle('active', p.id === 'tab-tssig')); try { if (typeof Face !== 'undefined') Face.sideNames(); } catch(e){} this.sync(); });
    const p = document.createElement('div'); p.id = 'tab-tssig'; p.className = 'sidePanel tsOnlyFace'; p.innerHTML = '<div class="sgWrap" id="sgWrap"></div>'; body.appendChild(p);
    p.addEventListener('click', e => this.click(e));
    st.addEventListener('click', () => setTimeout(() => this.sync(), 30));
    try { BUS.on('symbol', () => { this._key = ''; setTimeout(() => this.tick(true), 900); }); BUS.on('candleClose', () => setTimeout(() => this.tick(true), 250)); BUS.on('history', () => setTimeout(() => this.tick(true), 300)); } catch(e){}
    setInterval(() => this.tick(), 2000); setInterval(() => this.clock(), 1000); this.sync(); },
  active(){ const p = this.$('tab-tssig'); return !!p && p.classList.contains('active') && p.offsetParent !== null && document.documentElement.dataset.face === 'tm'; },
  /* while this tab is open the panel is wider and the news stream at its foot steps aside: the board gets the whole side */
  sync(){ const on = this.active(), H = document.documentElement; if (H.classList.contains('tsSigTab') !== on){ H.classList.toggle('tsSigTab', on); setTimeout(() => window.dispatchEvent(new Event('resize')), 80); } if (on) this.tick(true); },
  click(e){ const l = e.target.closest('[data-sg]'), tf = e.target.closest('[data-sgtf]'); if (l){ this.open = this.open === l.dataset.sg ? '' : l.dataset.sg; this.paint(); return; }
    if (tf && typeof App !== 'undefined' && App.setTf){ try { App.setTf(tf.dataset.sgtf); } catch(x){} this._key = ''; setTimeout(() => this.tick(true), 1200); } },

  /* ---------- reading the chart ---------- */
  dur(c){ const s = c * (typeof tfSeconds === 'function' ? tfSeconds(STORE.tf) : 60); return s < 3600 ? Math.round(s / 60) + ' min' : s < 86400 ? Math.floor(s / 3600) + ' h' + (Math.round(s % 3600 / 60) ? ' ' + Math.round(s % 3600 / 60) + ' m' : '') : (s / 86400).toFixed(s < 864000 ? 1 : 0) + ' d'; },
  lean(up, dn, of){ const side = up > dn ? 1 : dn > up ? -1 : 0, n = Math.max(up, dn); return { side, n, level: n >= Math.ceil(of * 0.7) ? 2 : n >= Math.ceil(of * 0.55) && side ? 1 : 0 }; },
  compute(){ const raw = (typeof Chart !== 'undefined' && Chart.raw) || []; if (raw.length < 260) return null; const P = ProInd.prep(raw.slice(-this.LOOK)), n = P.n, i = n - 1, R = this.readings();
    const D = R.map(r => { try { return r.run(P); } catch(e){ return new Int8Array(n); } }), up = new Int16Array(n), dn = new Int16Array(n);
    for (const d of D) for (let k = 0; k < n; k++){ if (d[k] > 0) up[k]++; else if (d[k] < 0) dn[k]++; }
    const of = R.length, L = this.lean(up[i], dn[i], of);
    /* how long: the lean, and each light */
    let held = 0; if (L.side){ for (let k = i; k >= this.WARM; k--){ const x = this.lean(up[k], dn[k], of); if (x.side !== L.side || x.level < Math.min(1, L.level)) break; held++; } }
    const lights = R.map((r, x) => { const d = D[x][i]; let h = 1; for (let k = i - 1; k >= 0 && D[x][k] === d; k--) h++; let v = ''; try { v = r.val ? r.val(P, i) : ''; } catch(e){} return { id: r.id, name: r.name, fam: r.fam, how: r.how, dir: d, held: h, val: v, x }; });
    const newest = lights.filter(l => l.held < n - 1).slice().sort((a, b) => a.held - b.held)[0] || null;
    /* fresh one-off signals */
    const ev = []; for (const s of ProInd.SIGNALS){ let a; try { a = ProInd.signal(P, s.id); } catch(e){ continue; } for (let k = i; k >= Math.max(0, i - 6); k--) if (a[k]){ ev.push({ name: s.name, how: s.how, dir: a[k], ago: i - k }); break; } }
    ev.sort((a, b) => a.ago - b.ago);
    /* context */
    let chop = NaN, z = NaN, rv = NaN; try { chop = ProInd.choppiness(P, 14)[i]; const A = ProInd.atr(P, 20), T = ProInd.trueRange(P); z = A[i - 1] > 0 ? T[i] / A[i - 1] : NaN; rv = ProInd.rvol(P, 20)[i]; } catch(e){}
    return { P, n, i, D, up, dn, of, L, held, lights, newest, ev: ev.slice(0, 6), chop, z, rv, upN: up[i], dnN: dn[i], last: raw[raw.length - 1] }; },
  /* counted on this chart: of the candles where at least this many pointed this way, how many were followed by a move that way */
  record(C, side, count, one){ const P = C.P, A = this.AHEAD; let N = 0, hit = 0, B = 0, bh = 0; if (!side) return null;
    for (let j = this.WARM; j < C.n - 1 - A; j++){ const mv = P.c[j + A] - P.c[j], went = mv > 0 ? 1 : mv < 0 ? -1 : 0; B++; if (went === side) bh++;
      const ok = one ? one[j] === side : (side > 0 ? C.up[j] >= count && C.up[j] > C.dn[j] : C.dn[j] >= count && C.dn[j] > C.up[j]); if (ok){ N++; if (went === side) hit++; } }
    return { N, hit, B, bh, p: N ? hit / N * 100 : NaN, base: B ? bh / B * 100 : NaN }; },

  /* ---------- the other timeframes: one request at a time, each kept until its own candle has closed ---------- */
  async mtf(){ if (this._busy || typeof API === 'undefined') return; const sym = STORE.symbol; this._busy = true;
    try { for (const tf of this.TFS){ if (tf === STORE.tf || !this.active() || STORE.symbol !== sym) continue; const k = sym + '|' + tf, c = this.M[k], ttl = Math.min(typeof tfSeconds === 'function' ? tfSeconds(tf) : 900, 900) * 1000; if (c && Date.now() - c.at < ttl) continue;
        try { const get = () => API.klines(sym, tf, 320), bars = await (typeof Autopsy !== 'undefined' && Autopsy.one ? Autopsy.one(get) : get());
          if (bars && bars.length > 60){ const P = ProInd.prep(bars), a = ProInd.agreement(P, P.n - 1, 1); this.M[k] = { at: Date.now(), up: a.yes, dn: a.no, of: a.of }; } else this.M[k] = { at: Date.now(), none: true }; }
        catch(e){ this.M[k] = { at: Date.now() - ttl + 60000, none: true }; }
        this.paintTfs(); await new Promise(r => setTimeout(r, 1500)); } }
    finally { this._busy = false; } },

  /* ---------- drawing ---------- */
  COL: { 1: '#3DDC97', '-1': '#FF6B7A', 0: '#3A4763' },
  build(){ const w = this.$('sgWrap'); if (!w) return; const R = this.readings(), N = R.length, C = 2 * Math.PI * 40, seg = C / N;
    w.innerHTML = '<div class="sgTop"><div class="sgDial"><svg viewBox="0 0 150 92"><defs><linearGradient id="sgG" x1="0" x2="1"><stop offset="0" stop-color="#FF6B7A"/><stop offset=".5" stop-color="#3A4763"/><stop offset="1" stop-color="#3DDC97"/></linearGradient></defs><path d="M14 80 A61 61 0 0 1 136 80" fill="none" stroke="url(#sgG)" stroke-width="9" stroke-linecap="round" opacity=".85"/><g id="sgNeedle" class="sgNeedle"><line x1="75" y1="80" x2="75" y2="30" stroke="#F2F6FF" stroke-width="2.4" stroke-linecap="round"/></g><circle cx="75" cy="80" r="5" fill="#F2F6FF"/><text x="12" y="91" class="sgAx">down</text><text x="138" y="91" text-anchor="end" class="sgAx">up</text></svg></div>' +
        '<div class="sgRing"><svg viewBox="0 0 100 100">' + R.map((r, k) => '<circle class="sgSeg" data-k="' + k + '" cx="50" cy="50" r="40" fill="none" stroke-width="9" stroke-dasharray="' + (seg - 2.4).toFixed(2) + ' ' + (C - seg + 2.4).toFixed(2) + '" transform="rotate(' + (k * 360 / N - 90).toFixed(1) + ' 50 50)"/>').join('') + '</svg><div><b id="sgNum">–</b><small id="sgNumL">reading…</small></div></div></div>' +
      '<div class="sgVerdict" id="sgVerdict"><b>Reading the chart…</b><small></small></div>' +
      '<div class="sgTime"><div><small>THIS CANDLE CLOSES IN</small><b id="sgCd">–</b></div><div><small>THE LEAN HAS HELD</small><b id="sgHeld">–</b></div><div class="wide"><small>NEWEST CHANGE</small><b id="sgNew">–</b></div></div>' +
      '<p class="sgLegend"><i class="up"></i>points up <i class="dn"></i>points down <i></i>neither <b>12</b> candles it has held · press a light</p>' +
      this.FAM.map(f => '<div class="sgBlock"><h5>' + f[1] + ' <em id="sgF_' + f[0] + '"></em></h5><div class="sgGrid">' + R.filter(r => r.fam === f[0]).map(r => '<button type="button" class="sgL" data-sg="' + r.id + '"><i></i><b>' + this.esc(this.SHORT[r.id] || r.name) + '</b><em></em></button>').join('') + '</div></div>').join('') +
      '<div class="sgMore" id="sgMore" hidden></div>' +
      '<div class="sgBlock"><h5>OTHER TIMEFRAMES <em>the nine trend readings · press one to open it</em></h5><div class="sgTfs" id="sgTfs"></div></div>' +
      '<div class="sgCtx" id="sgCtx"></div>' +
      '<div class="sgBlock"><h5>FRESH SIGNALS <em>one-off signals of the last six candles</em></h5><div class="sgEv" id="sgEv"></div></div>' +
      '<div class="sgBlock"><h5>THE RECORD <em>counted on this chart’s own candles</em></h5><div class="sgRec" id="sgRec"></div></div>' +
      '<p class="sgFoot">The readings describe this chart; they are not a forecast and not advice. In the large test on your broker’s markets (twenty of these signals, 2.9 million cases), more agreement did not beat random entries once the spread was paid.</p>'; },
  tick(force){ if (!this.active()) return; const key = STORE.symbol + '|' + STORE.tf; if (key !== this._key){ this._key = key; this.prev = {}; this.open = ''; this.C = null; }
    if (!this.$('sgNeedle')) this.build(); let C = null; try { C = this.compute(); } catch(e){ console.warn('signals', e); } this.C = C; this.paint(); this.mtf(); },
  paint(){ const C = this.C, w = this.$('sgWrap'); if (!w || !this.$('sgNeedle')) return; const set = (id, t) => { const e = this.$(id); if (e && e.textContent !== t) e.textContent = t; }, html = (id, h) => { const e = this.$(id); if (e && e._h !== h){ e._h = h; e.innerHTML = h; } };
    if (!C){ set('sgNum', '–'); set('sgNumL', 'too few candles'); html('sgVerdict', '<b>Not enough candles on this chart yet.</b><small>The board needs about 260 candles to read every indicator.</small>'); return; }
    const L = C.L, of = C.of, flat = of - C.upN - C.dnN, word = L.side > 0 ? 'up' : L.side < 0 ? 'down' : '';
    this.$('sgNeedle').style.transform = 'rotate(' + ((C.upN - C.dnN) / of * 90).toFixed(1) + 'deg)';
    w.querySelectorAll('.sgSeg').forEach((s, k) => { const c = k < C.upN ? 1 : k < C.upN + flat ? 0 : -1, col = this.COL[c]; if (s.dataset.c !== col){ s.dataset.c = col; s.style.stroke = col; } });
    set('sgNum', L.n + '/' + of); set('sgNumL', L.side ? 'point ' + word : 'evenly split'); const num = this.$('sgNum'); if (num) num.className = L.side > 0 ? 'up' : L.side < 0 ? 'dn' : '';
    html('sgVerdict', '<b class="' + (L.level ? (L.side > 0 ? 'up' : 'dn') : '') + '">' + (L.level === 2 ? 'Most readings point ' + word : L.level === 1 ? 'Leaning ' + word : 'Mixed: no clear side') + '</b><small>' + C.upN + ' up · ' + C.dnN + ' down · ' + flat + ' neither</small>');
    set('sgHeld', L.level && C.held ? C.held + ' candle' + (C.held === 1 ? '' : 's') + ' · ' + this.dur(C.held) : 'no lean right now');
    const nw = C.newest; html('sgNew', nw ? this.esc(nw.name) + ' <i class="' + (nw.dir > 0 ? 'up' : nw.dir < 0 ? 'dn' : '') + '">' + (nw.dir > 0 ? 'turned up' : nw.dir < 0 ? 'turned down' : 'went neutral') + '</i> · ' + (nw.held <= 1 ? 'on this candle' : (nw.held - 1) + ' candle' + (nw.held === 2 ? '' : 's') + ' ago') : '–');
    /* context: texture, this candle's size, volume, sessions */
    const tx = C.chop !== C.chop ? '' : C.chop >= 61.8 ? 'choppy' : C.chop <= 38.2 ? 'trending' : 'mixed', ses = typeof SidePanels !== 'undefined' && SidePanels.SES ? SidePanels.SES.map(s => { let o = false; try { o = SidePanels.isOpen(s, Date.now()); } catch(e){} return '<span class="sgSes' + (o ? ' on' : '') + '" style="--c:' + s[4] + '">' + s[0] + '</span>'; }).join('') : '';
    html('sgCtx', (tx ? '<div><small>TEXTURE</small><b>' + tx + '</b><i><u style="--w:' + Math.max(4, Math.min(100, 100 - C.chop)).toFixed(0) + '%"></u></i></div>' : '') + (C.z === C.z ? '<div><small>THIS CANDLE</small><b>' + C.z.toFixed(1) + '× a usual one</b><i><u class="' + (C.z >= 2.5 ? 'hot' : '') + '" style="--w:' + Math.max(4, Math.min(100, C.z / 3 * 100)).toFixed(0) + '%"></u></i></div>' : '') + (C.rv === C.rv && C.rv > 0 ? '<div><small>VOLUME</small><b>' + C.rv.toFixed(1) + '× usual</b><i><u style="--w:' + Math.max(4, Math.min(100, C.rv / 3 * 100)).toFixed(0) + '%"></u></i></div>' : '') + (ses ? '<div class="wide"><small>SESSIONS OPEN</small><span class="sgSesRow">' + ses + '</span></div>' : ''));
    /* the lights */
    const now = Date.now(); for (const l of C.lights){ const b = w.querySelector('[data-sg="' + l.id + '"]'); if (!b) continue; const cls = 'sgL ' + (l.dir > 0 ? 'up' : l.dir < 0 ? 'dn' : 'fl') + (this.open === l.id ? ' open' : ''), p = this.prev[l.id];
      if (p !== undefined && p !== l.dir){ b.classList.remove('chg'); void b.offsetWidth; b._chg = now; } this.prev[l.id] = l.dir; const want = cls + (b._chg && now - b._chg < 6000 ? ' chg' : ''); if (b.className !== want) b.className = want;
      const em = b.querySelector('em'), t = l.held >= C.n - 1 ? 'all' : l.held > 99 ? '99+' : String(l.held); if (em.textContent !== t) em.textContent = t; b.title = l.name + ': ' + (l.dir > 0 ? 'points up' : l.dir < 0 ? 'points down' : 'neither') + (l.val ? ' (' + l.val + ')' : '') + ' · for ' + l.held + ' candle' + (l.held === 1 ? '' : 's') + '. Press for more.'; }
    for (const f of this.FAM){ const ls = C.lights.filter(l => l.fam === f[0]); set('sgF_' + f[0], ls.filter(l => l.dir > 0).length + ' up · ' + ls.filter(l => l.dir < 0).length + ' down'); }
    /* one light, opened */
    const m = this.$('sgMore'), o = C.lights.find(l => l.id === this.open); if (m){ m.hidden = !o; if (o){ const r = o.dir ? this.record(C, o.dir, 0, C.D[o.x]) : null;
        html('sgMore', '<b>' + this.esc(o.name) + ' <i class="' + (o.dir > 0 ? 'up' : o.dir < 0 ? 'dn' : '') + '">' + (o.dir > 0 ? 'points up' : o.dir < 0 ? 'points down' : 'points neither way') + '</i></b><p>' + this.esc(o.how) + (o.val ? ' Now: ' + this.esc(o.val) + '.' : '') + '</p><p>It has pointed this way for <b>' + o.held + ' candle' + (o.held === 1 ? '' : 's') + '</b> (' + this.dur(o.held) + ').</p>' +
          (r && r.N >= 20 ? '<p>On this chart, the ' + r.N + ' candles where it pointed ' + (o.dir > 0 ? 'up' : 'down') + ' were followed ' + this.AHEAD + ' candles later by a move that way <b>' + r.p.toFixed(0) + '%</b> of the time. Any candle: <b>' + r.base.toFixed(0) + '%</b>.</p>' : o.dir ? '<p>Too few cases on this chart to say how it did.</p>' : '')); } }
    /* fresh one-off signals */
    html('sgEv', C.ev.length ? C.ev.map(e => '<div class="' + (e.dir > 0 ? 'up' : 'dn') + '" title="' + this.esc(e.how) + '"><i>' + (e.dir > 0 ? '▲' : '▼') + '</i><b>' + this.esc(e.name) + '</b><em>' + (e.ago === 0 ? 'this candle' : e.ago + ' candle' + (e.ago === 1 ? '' : 's') + ' ago') + '</em></div>').join('') : '<span class="sgNone">None in the last six candles.</span>');
    /* the record of this many agreeing */
    const rec = L.side ? this.record(C, L.side, L.n) : null;
    html('sgRec', !L.side ? '<span class="sgNone">The readings are evenly split, so there is no side to check.</span>' : !rec || rec.N < 20 ? '<span class="sgNone">At least ' + L.n + ' pointing ' + word + ' has happened only ' + (rec ? rec.N : 0) + ' times in the ' + (C.n - this.WARM) + ' candles read: too few to say.</span>'
      : '<div class="sgRecRow"><span>When at least ' + L.n + ' pointed ' + word + '</span><i><u class="' + (rec.p >= rec.base + 3 ? 'up' : rec.p <= rec.base - 3 ? 'dn' : '') + '" style="--w:' + rec.p.toFixed(0) + '%"></u></i><b>' + rec.p.toFixed(0) + '%</b></div><div class="sgRecRow"><span>Any candle</span><i><u style="--w:' + rec.base.toFixed(0) + '%"></u></i><b>' + rec.base.toFixed(0) + '%</b></div><p>How often price was ' + (L.side > 0 ? 'higher' : 'lower') + ' ' + this.AHEAD + ' candles later. ' + rec.N + ' cases in the last ' + (C.n - this.WARM) + ' candles of this chart. Direction only, before the spread. ' + (Math.abs(rec.p - rec.base) < 3 ? 'No real difference from any candle.' : rec.p > rec.base ? 'A little better than any candle on this stretch; the cases overlap, so it proves little.' : 'Worse than any candle on this stretch.') + '</p>');
    this.paintTfs(); this.clock(); },
  paintTfs(){ const el = this.$('sgTfs'); if (!el) return; const sym = STORE.symbol, C = this.C;
    const chip = (tf, d, cur) => { const of = d && d.of ? d.of : 9, up = d && !d.none ? d.up : 0, dn = d && !d.none ? d.dn : 0, side = up > dn ? 'up' : dn > up ? 'dn' : ''; return '<button type="button" class="sgTf ' + side + (cur ? ' cur' : '') + '" data-sgtf="' + tf + '" title="' + (cur ? 'The chart you are on' : 'Open the ' + tf + ' chart') + '"><b>' + tf + '</b><span>' + Array.from({ length: of }, (_, k) => '<i class="' + (!d || d.none ? '' : k < up ? 'up' : k >= of - dn ? 'dn' : '') + '"></i>').join('') + '</span><em>' + (!d ? '…' : d.none ? 'no data' : (side === 'up' ? up + ' up' : side === 'dn' ? dn + ' down' : 'split')) + '</em></button>'; };
    let cur = null; if (C){ const t = C.lights.filter(l => l.fam === 'trend'); cur = { up: t.filter(l => l.dir > 0).length, dn: t.filter(l => l.dir < 0).length, of: t.length }; }
    const tfs = this.TFS.includes(STORE.tf) ? this.TFS : [STORE.tf].concat(this.TFS), h = tfs.map(tf => tf === STORE.tf ? chip(tf, cur, true) : chip(tf, this.M[sym + '|' + tf], false)).join(''); if (el._h !== h){ el._h = h; el.innerHTML = h; } },
  /* when the forming candle closes. Up to one hour the candles sit on the clock; above that the candle's own start is used */
  clock(){ if (!this.active()) return; const el = this.$('sgCd'); if (!el) return; const sec = typeof tfSeconds === 'function' ? tfSeconds(STORE.tf) : 0, now = Date.now() / 1000; let rem = NaN;
    if (sec && sec <= 3600) rem = sec - (now % sec); else if (sec && this.C && this.C.last){ const t0 = this.C.last.rawTime != null ? this.C.last.rawTime : this.C.last.time; rem = t0 + sec - now; if (!(rem > 0 && rem <= sec)) rem = NaN; }
    const f = x => String(Math.floor(x)).padStart(2, '0'), t = rem !== rem ? '–' : rem >= 3600 ? Math.floor(rem / 3600) + ':' + f(rem % 3600 / 60) + ':' + f(rem % 60) : f(rem / 60) + ':' + f(rem % 60); if (el.textContent !== t) el.textContent = t; el.classList.toggle('soon', rem === rem && rem <= 10); },
};
(function(){ let n = 0; const go = () => { try { SignalBoard.init(); } catch(e){ console.warn('signals board', e); } if (!document.getElementById('tab-tssig') && ++n < 14) setTimeout(go, 800); }; if (document.readyState !== 'loading') setTimeout(go, 2100); else document.addEventListener('DOMContentLoaded', () => setTimeout(go, 2100)); })();
