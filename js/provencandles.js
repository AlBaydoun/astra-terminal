/* ASTRA Terminal — PROVEN CANDLES: candlestick signals that survived a real test.

   Research run 4 (research-tools/candles.cjs) tested 8 candle patterns × every combination of up
   to three context conditions × long/short × two ways of entering × four targets, on 24
   instruments, 15m / 1h / 4h, after the full spread — 247,680 setups. A setup was CHOSEN on the
   first 60 % of history and KEPT only if the last 40 % (never looked at while choosing) also paid,
   beat random entries in the same direction, and was not carried by one single instrument.
   The same pipeline run on random fake candles let 93 setups through by luck, so the bar was
   raised again: a rule is shown only when it is stronger than 90 % (grade B) or than ALL (grade A)
   of those lucky placebo setups. Every one of the 56 kept rules still pays with DOUBLE the spread.

   On the chart: only candles that match a kept rule for THIS market group and THIS timeframe are
   marked; the newest one carries its entry, stop and target. Everything else is noise and stays
   unmarked. Read only: it draws, it never trades. */
const ProvenCandles = {
  KEY: 'astra_proven',
  DEF: { on: false, grades: 'AB', past: true, levels: true, card: true, up: '#00e676', down: '#ff1744' },
  cfg(){ return Object.assign({}, this.DEF, lsGet(this.KEY, {}) || {}); },
  save(c){ lsSet(this.KEY, c); this._sig = ''; this._key = ''; if (typeof Draw !== 'undefined') Draw.redraw(); this.syncBtn(); },
  GROUP: { indices: 'indices', gold: 'metals', forex: 'forex', energy: 'energy', crypto: 'crypto' },
  GNAME: { indices: 'Stock indices', metals: 'Gold & silver', forex: 'Forex', energy: 'Oil', crypto: 'Crypto' },
  NAME: { pin: ['Hammer (pin bar)', 'Shooting star (pin bar)'], engulf: ['Bullish engulfing', 'Bearish engulfing'], star: ['Morning star', 'Evening star'],
    tweezer: ['Tweezer bottom', 'Tweezer top'], three: ['Three white soldiers', 'Three black crows'], outside: ['Outside reversal bar', 'Outside reversal bar'],
    insidebreak: ['Inside-bar breakout', 'Inside-bar breakdown'], twobar: ['Two-bar reversal', 'Two-bar reversal'] },
  ATOM: { W: 'with the trend', X: 'against the trend', SW: 'after a liquidity sweep', ST: 'stretched from its average', BIG: 'big candle', VOL: 'high volume', HTF: 'higher timeframe agrees', SES: 'in the active session' },
  ATOM_LONG: { W: 'price above its 200-average and the 50 above the 200', X: 'price below its 200-average and the 50 below the 200 — a reversal against the trend',
    SW: 'the candle took out the lowest low/highest high of the 20 candles before and closed back inside (stops were run, then rejected)',
    ST: 'at least 1 ATR away from its 20-average — an over-stretched move', BIG: 'the pattern spans at least 1.5 ATR', VOL: 'volume at least 1.5× its 20-candle average',
    HTF: 'on the right side of the 800-average (≈ the 200-average one timeframe up)', SES: 'during the market\'s main trading hours' },
  TFS: ['15m', '1h', '4h'], MAXB: { '15m': 32, '1h': 24, '4h': 12 }, TF_SEC: { '15m': 900, '1h': 3600, '4h': 14400 },

  groupOf(sym){ let g = null; try { g = typeof Bots !== 'undefined' && Bots.groupOfAny ? Bots.groupOfAny(sym) : null; } catch(e){} return this.GROUP[g] || null; },
  rules(g, tf){
    const C = this.cfg(), E = typeof CANDLE_EDGES !== 'undefined' ? CANDLE_EDGES.rules : [];
    return E.filter(r => r.group === g && (!tf || r.tf === tf) && C.grades.includes(r.grade));
  },

  /* ---------- the same indicators as the research (bt.cjs) ---------- */
  ema(a, n){ const k = 2 / (n + 1), out = new Array(a.length).fill(null); let e = null; for (let i = 0; i < a.length; i++){ e = e == null ? a[i] : a[i] * k + e * (1 - k); if (i >= n - 1) out[i] = e; } return out; },
  atr(c, n){ const out = new Array(c.length).fill(null); let a = null; for (let i = 0; i < c.length; i++){ const x = c[i], tr = i ? Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)) : x.h - x.l; a = a == null ? tr : (a * (n - 1) + tr) / n; if (i >= n) out[i] = a; } return out; },
  serverHour(sym, raw){
    let bridge = false; try { bridge = Feed.route(sym).kind === 'bridge'; } catch(e){}
    const off = bridge ? 0 : (typeof USStocks !== 'undefined' && USStocks.brokerOffsetAt ? USStocks.brokerOffsetAt(raw + 7200) : 10800);
    return new Date((raw + off) * 1000).getUTCHours();
  },
  sesOK(sym, h, g){
    const b = baseAsset(sym).toUpperCase();
    if (/^(US100|US30|US500|USTEC|NAS|SPX|DJ)/.test(b)) return h >= 16 && h < 23;
    if (/^(DE40|GER|EU50|STOXX|FR40|UK100|FTSE)/.test(b)) return h >= 9 && h < 18;
    if (/^(AU200|JP225|NIK)/.test(b)) return h >= 2 && h < 9;
    if (g === 'crypto') return h >= 10 && h < 23;
    return h >= 9 && h < 19;
  },
  detect(c, A, i){
    const b = c[i], a = c[i - 1], a2 = c[i - 2], at = A[i]; if (!at || !a2) return [];
    const body = x => Math.abs(x.c - x.o), rng = x => x.h - x.l, green = x => x.c > x.o, red = x => x.c < x.o, out = [];
    const lw = Math.min(b.o, b.c) - b.l, uw = b.h - Math.max(b.o, b.c);
    if (rng(b) >= 0.6 * at && lw >= 2 * body(b) && lw >= 0.6 * rng(b) && uw <= 0.25 * rng(b)) out.push(['pin', 1]);
    if (red(a) && green(b) && body(b) >= 0.5 * at && body(b) > body(a) && b.c > a.o && b.o <= a.c) out.push(['engulf', 1]);
    if (red(a2) && body(a2) >= 0.5 * at && body(a) <= 0.3 * body(a2) && green(b) && b.c > (a2.o + a2.c) / 2) out.push(['star', 3]);
    if (red(a) && green(b) && Math.abs(a.l - b.l) <= 0.1 * at && rng(a) >= 0.5 * at && b.c > (a.o + a.c) / 2) out.push(['tweezer', 2]);
    if (green(a2) && green(a) && green(b) && a.c > a2.c && b.c > a.c && body(a2) >= 0.5 * rng(a2) && body(a) >= 0.5 * rng(a) && body(b) >= 0.5 * rng(b) && b.c - a2.o >= 1.5 * at) out.push(['three', 3]);
    if (b.l < a.l && b.c > a.h && rng(b) >= 0.8 * at) out.push(['outside', 2]);
    if (a.h <= a2.h && a.l >= a2.l && b.c > a2.h && green(b)) out.push(['insidebreak', 3]);
    if (red(a) && body(a) >= 0.6 * at && green(b) && body(b) >= 0.6 * at && b.c >= a.o - 0.1 * at && b.o <= a.c + 0.1 * at) out.push(['twobar', 2]);
    return out;
  },

  /* ---------- every proven signal in the loaded candles ---------- */
  compute(){
    const sym = STORE.symbol, tf = STORE.tf, g = this.groupOf(sym), raw = (Chart.raw || []);
    const key = [sym, tf, raw.length, raw.length ? raw[raw.length - 1].time : 0, this.cfg().grades].join('|');
    if (key === this._key) return this._res;
    this._key = key;
    return this._res = this.scan(raw, sym, tf, g, g ? this.rules(g, tf) : [], g ? this.rules(g) : []);
  },
  /* the signal finder itself — shared by the chart and the ★ Proven paper bots, so they can never disagree.
     raw = candles with open/high/low/close/volume/time/rawTime, the LAST one still forming */
  scan(raw, sym, tf, g, rules, allRules){
    const R = { sym, tf, g, rules, allRules: allRules || rules, sigs: [], n: raw.length };
    if (!g || !R.rules.length || raw.length < 300) return R;
    /* closed candles only: the last one is still forming */
    const c = raw.slice(0, -1).map(x => ({ t: x.rawTime || x.time, time: x.time, o: x.open, h: x.high, l: x.low, c: x.close, v: x.volume || 0 }));
    const n = c.length, A = this.atr(c, 14), close = c.map(x => x.c), E20 = this.ema(close, 20), E50 = this.ema(close, 50), E200 = this.ema(close, 200), EH = this.ema(close, 800);
    R.noHtf = EH[n - 1] == null;
    const vAvg = []; let vs = 0; for (let i = 0; i < n; i++){ vs += c[i].v; if (i >= 20) vs -= c[i - 20].v; vAvg[i] = i >= 19 ? vs / 20 : null; }
    const M = c.map(x => ({ o: -x.o, h: -x.l, l: -x.h, c: -x.c }));
    const busy = {};
    for (let i = 260; i < n; i++){
      const at = A[i]; if (!at || E200[i] == null) continue;
      for (const dir of [1, -1]){
        const pats = this.detect(dir > 0 ? c : M, A, i);
        for (const [fam, len] of pats){
          const up = dir > 0;
          let ext = up ? Infinity : -Infinity; for (let k = i - len + 1; k <= i; k++) ext = up ? Math.min(ext, c[k].l) : Math.max(ext, c[k].h);
          const f = new Set();
          const tUp = close[i] > E200[i] && E50[i] > E200[i], tDn = close[i] < E200[i] && E50[i] < E200[i];
          if (up ? tUp : tDn) f.add('W'); if (up ? tDn : tUp) f.add('X');
          let prior = up ? Infinity : -Infinity; for (let k = i - len - 20; k <= i - len; k++) if (k >= 0) prior = up ? Math.min(prior, c[k].l) : Math.max(prior, c[k].h);
          if (up ? (ext < prior && close[i] > prior) : (ext > prior && close[i] < prior)) f.add('SW');
          if ((up ? E20[i] - close[i] : close[i] - E20[i]) >= at || (up ? E20[i - len] - c[i - len].c : c[i - len].c - E20[i - len]) >= 1.2 * at) f.add('ST');
          let ph = -Infinity, pl = Infinity; for (let k = i - len + 1; k <= i; k++){ ph = Math.max(ph, c[k].h); pl = Math.min(pl, c[k].l); }
          if (ph - pl >= 1.5 * at) f.add('BIG');
          if (vAvg[i] > 0 && c[i].v >= 1.5 * vAvg[i]) f.add('VOL');
          if (EH[i] != null && (up ? close[i] > EH[i] : close[i] < EH[i])) f.add('HTF');
          if (this.sesOK(sym, this.serverHour(sym, c[i].t), g)) f.add('SES');
          /* the strongest kept rule this candle satisfies */
          let best = null;
          for (const r of R.rules){
            if (r.fam !== fam || (r.dir && r.dir !== dir) || !r.atoms.every(a => f.has(a))) continue;
            if (r.entry === 'conf'){ if (i + 1 >= n || !(up ? c[i + 1].c > c[i].h : c[i + 1].c < c[i].l)) continue; }
            if (!best || (r.grade < best.grade) || (r.grade === best.grade && r.score > best.score)) best = r;
          }
          if (!best) continue;
          const ei = i + (best.entry === 'conf' ? 2 : 1);           /* entry = the open after the signal */
          if (busy[best.tf] != null && ei <= busy[best.tf]) continue;
          let stop = ext - dir * 0.1 * at;
          const eo = ei < n ? c[ei].o : raw[raw.length - 1].open;
          if ((eo - stop) * dir < 0.5 * at) stop = eo - dir * 0.5 * at;
          if ((eo - stop) * dir > 3 * at) continue;
          const sd = (eo - stop) * dir, tp = eo + dir * best.R * sd;
          /* what happened afterwards (or that it is still running) */
          let res = 'open', exitI = null;
          for (let j = ei; j < Math.min(n, ei + best.maxBars); j++){
            const x = c[j], hs = up ? x.l <= stop : x.h >= stop, ht = up ? x.h >= tp : x.l <= tp;
            if (hs){ res = 'loss'; exitI = j; break; } if (ht){ res = 'win'; exitI = j; break; }
          }
          if (res === 'open' && ei + best.maxBars <= n){ res = (c[ei + best.maxBars - 1].c - eo) * dir > 0 ? 'time+' : 'time-'; exitI = ei + best.maxBars - 1; }
          busy[best.tf] = exitI != null ? exitI : n + 999;
          R.sigs.push({ i, ei, dir, fam, len, rule: best, f: [...f], at, entry: eo, stop, tp, sd, res, time: c[i].time, sigTime: c[best.entry === 'conf' ? i + 1 : i].time,
            entryTime: ei < n ? c[ei].time : raw[raw.length - 1].time, exitTime: exitI != null ? c[exitI].time : null, pending: ei >= n });
        }
      }
    }
    return R;
  },

  /* ---------- drawing ---------- */
  rgba(hex, a){ const h = hex.replace('#', ''); const v = parseInt(h.length === 3 ? h.split('').map(x => x + x).join('') : h, 16); return `rgba(${v >> 16 & 255},${v >> 8 & 255},${v & 255},${a})`; },
  draw(ctx){
    const C = this.cfg();
    if (!C.on || typeof Chart === 'undefined' || !Chart.priceSeries){ this.card(null, C); return; }
    const R = this.compute(); this.card(R, C);
    if (!R.sigs.length) return;
    const Y = p => Chart.priceSeries.priceToCoordinate(p), ts = Chart.main.timeScale(), right = Math.min(Draw.cssW - 2, (ts.width ? ts.width() : Draw.cssW) - 4);
    const font = getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace';
    ctx.save();
    const last = R.sigs[R.sigs.length - 1], live = last && (last.res === 'open') ? last : null;
    for (const s of R.sigs){
      if (!C.past && s !== live) continue;
      const x = Draw.timeToX(s.sigTime); if (x == null || x < 0 || x > right) continue;
      const col = s.dir > 0 ? C.up : C.down, yEdge = Y(s.dir > 0 ? s.stop + 0.1 * s.at : s.stop - 0.1 * s.at); if (yEdge == null) continue;
      const y = yEdge + (s.dir > 0 ? 10 : -10);
      /* the marker: a filled triangle under a long, over a short, with the grade */
      ctx.shadowColor = col; ctx.shadowBlur = s === live ? 14 : 6; ctx.fillStyle = col;
      ctx.beginPath(); if (s.dir > 0){ ctx.moveTo(x, y); ctx.lineTo(x - 7, y + 11); ctx.lineTo(x + 7, y + 11); } else { ctx.moveTo(x, y); ctx.lineTo(x - 7, y - 11); ctx.lineTo(x + 7, y - 11); }
      ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
      ctx.font = '800 10px ' + font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const ty = y + (s.dir > 0 ? 21 : -21);
      ctx.fillStyle = s.rule.grade === 'A' ? '#ffd740' : '#9fdcff'; ctx.fillText('★' + s.rule.grade, x, ty);
      const out = s.res === 'win' ? '✓' : s.res === 'loss' ? '✗' : s.res === 'time+' ? '✓' : s.res === 'time-' ? '✗' : '…';
      ctx.fillStyle = s.res === 'win' || s.res === 'time+' ? '#00e676' : s.res === 'open' ? '#ffd740' : '#ff5252';
      ctx.fillText(out, x, ty + (s.dir > 0 ? 12 : -12));
      ctx.textAlign = 'left';
    }
    /* the newest signal that is still running: entry, stop and target */
    if (live && C.levels){
      const col = live.dir > 0 ? C.up : C.down, x0 = Math.max(0, Draw.timeToX(live.entryTime) ?? Draw.timeToX(live.sigTime) ?? 0);
      const tEnd = live.entryTime + this.TF_SEC[R.tf] * live.rule.maxBars; let x1 = Draw.timeToX(tEnd); if (x1 == null || x1 > right) x1 = right;
      const yE = Y(live.entry), yS = Y(live.stop), yT = Y(live.tp);
      if ([yE, yS, yT].every(v => v != null)){
        ctx.fillStyle = this.rgba(C.up, 0.10); ctx.fillRect(x0, Math.min(yE, live.dir > 0 ? yT : yS), x1 - x0, Math.abs((live.dir > 0 ? yT : yS) - yE));
        ctx.fillStyle = this.rgba(C.down, 0.10); ctx.fillRect(x0, Math.min(yE, live.dir > 0 ? yS : yT), x1 - x0, Math.abs((live.dir > 0 ? yS : yT) - yE));
        const line = (yy, c, dash, label) => { ctx.strokeStyle = c; ctx.lineWidth = 1.5; ctx.setLineDash(dash); ctx.beginPath(); ctx.moveTo(x0, yy); ctx.lineTo(x1, yy); ctx.stroke(); ctx.setLineDash([]);
          ctx.font = '700 10.5px ' + font; ctx.fillStyle = c; ctx.fillText(label, Math.max(x0 + 4, x1 - 230), yy - 4); };
        line(yT, C.up === col ? C.up : C.up, [6, 4], 'target ' + fmtPrice(live.tp) + ' (' + live.rule.R + 'R)');
        line(yE, '#e6e6ff', [], (live.pending ? 'entry at the next open ≈ ' : 'entry ') + fmtPrice(live.entry));
        line(yS, C.down, [6, 4], 'stop ' + fmtPrice(live.stop));
      }
    }
    ctx.restore();
  },

  /* ---------- the card ---------- */
  pct(x){ return Math.round(x) + '%'; },
  rr(x){ return (x >= 0 ? '+' : '') + x.toFixed(2) + 'R'; },
  card(R, C){
    const wrap = document.getElementById('mainWrap'); if (!wrap) return;
    let el = document.getElementById('pcCard');
    if (!R || !C.on || !C.card){ if (el) el.remove(); this._sig = ''; return; }
    if (!el){ wrap.insertAdjacentHTML('beforeend', '<div id="pcCard" class="pcCard"></div>'); el = document.getElementById('pcCard');
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
      el.addEventListener('click', e => {
        if (e.target.closest('[data-pcfold]')){ this._open = !this._open; this._sig = ''; Draw.redraw(); }
        const tf = e.target.closest('[data-pctf]'); if (tf && typeof App !== 'undefined' && App.setTf) App.setTf(tf.dataset.pctf);
      }); }
    const gname = this.GNAME[R.g] || 'This market', E = typeof CANDLE_EDGES !== 'undefined' ? CANDLE_EDGES : null;
    let body = `<div class="pcHead">★ PROVEN CANDLES · ${esc(gname)} · ${esc(R.tf)}</div>`;
    if (!E) body += '<p>The research file is missing.</p>';
    else if (!R.g) body += `<p>No proven candle rules for this market. The test covered stock indices, gold & silver, forex, oil and crypto — not single shares. Rather than show untested signals, nothing is drawn.</p>`;
    else if (!R.rules.length){
      const tfs = [...new Set(R.allRules.map(r => r.tf))];
      body += `<p>No rule was proven for ${esc(gname)} on ${esc(R.tf)}.${tfs.length ? ' Proven on: ' + tfs.map(t => `<button class="bMini" data-pctf="${t}">${t}</button>`).join(' ') : ''}</p>`;
    } else if (R.n < 300) body += '<p>Reading the candles…</p>';
    else {
      const last = R.sigs[R.sigs.length - 1], live = last && last.res === 'open' ? last : null;
      if (live){
        const r = live.rule, nm = this.NAME[r.fam][live.dir > 0 ? 0 : 1];
        body += `<div class="pcBig ${live.dir > 0 ? 'up' : 'down'}">${live.dir > 0 ? '▲ LONG' : '▼ SHORT'} · ${esc(nm)} <span class="pcGrade g${r.grade}">${r.grade}</span></div>
          <p>${live.pending ? 'Signal on the last closed candle — entry at the next open.' : 'Running since ' + new Date(live.entryTime * 1000).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' }) + '.'}
          Entry ${fmtPrice(live.entry)} · stop ${fmtPrice(live.stop)} · target ${fmtPrice(live.tp)} (${r.R} × the risk) · closes after ${r.maxBars} candles at the latest.</p>
          <p class="pcWhy">Why it counts: ${r.atoms.length ? r.atoms.map(a => esc(this.ATOM[a])).join(' · ') : 'the pattern itself'}${r.entry === 'conf' ? ' · confirmed by the next close' : ''}.</p>
          <div class="pcStats">Unseen test: <b>${r.oos.n}</b> trades · won <b>${this.pct(r.oos.win)}</b> · average <b>${this.rr(r.oos.avgR)}</b> · profit factor <b>${r.oos.pf}</b>${r.cost2 ? ' · double spread ' + this.rr(r.cost2.avgR) : ''}</div>`;
      } else {
        const seen = R.sigs.length;
        body += `<div class="pcBig">No signal running</div><p>${R.rules.length} proven rule${R.rules.length === 1 ? '' : 's'} watch ${esc(gname)} on ${esc(R.tf)}. ${seen ? 'Last signal ' + new Date(last.sigTime * 1000).toLocaleString([], { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + '.' : 'None in the loaded candles.'} Most candles are noise — waiting is the point.</p>`;
      }
      const done = R.sigs.filter(s => s.res !== 'open'), good = done.filter(s => s.res === 'win' || s.res === 'time+').length;
      const net = done.reduce((a, s) => a + (s.res === 'win' ? s.rule.R : s.res === 'loss' ? -1 : 0), 0);
      body += `<div class="pcStats">On this chart: <b>${done.length}</b> finished signal${done.length === 1 ? '' : 's'}${done.length ? ` · <b>${good}</b> ended in profit · targets/stops ≈ <b>${net >= 0 ? '+' : ''}${net.toFixed(1)}R</b> (before costs)` : ''}</div>`;
      if (this._open){
        body += `<table class="pcRules"><thead><tr><th></th><th>Pattern</th><th>When</th><th>Unseen test</th></tr></thead><tbody>${R.allRules.map(r => `<tr${r.tf === R.tf ? '' : ' class="dim2"'}><td><span class="pcGrade g${r.grade}">${r.grade}</span></td>
          <td>${esc(this.NAME[r.fam][r.dir < 0 ? 1 : 0])}${r.dir ? (r.dir > 0 ? ' · long' : ' · short') : ' · both ways'}<br><small>${r.tf} · target ${r.R}R${r.entry === 'conf' ? ' · after a confirming close' : ''}</small></td>
          <td><small>${r.atoms.length ? r.atoms.map(a => esc(this.ATOM[a])).join(', ') : 'any context'}</small></td>
          <td><small>${r.oos.n} trades · ${this.pct(r.oos.win)} · ${this.rr(r.oos.avgR)} · PF ${r.oos.pf}</small></td></tr>`).join('')}</tbody></table>
          <p class="pcFoot">Grade A: stronger than every setup that passed by pure luck in the placebo test. B: stronger than 90 % of them. Tested ${E.made} on 2 years (1h/4h) and 1 year (15m) of the broker's candles. It can still be wrong — a stop is part of every signal.</p>`;
      }
      body += `<div class="fcBtns"><button class="bMini" data-pcfold="1">${this._open ? 'Less ▴' : 'All rules & evidence ▾'}</button></div>`;
    }
    if (body !== this._sig){ el.innerHTML = body; this._sig = body; }
  },

  /* ---------- button + settings ---------- */
  syncBtn(){ const b = document.getElementById('pcBtn'); if (b) b.classList.toggle('on', this.cfg().on); if (!this.cfg().on) document.getElementById('pcCard')?.remove(); },
  toggle(){ const c = this.cfg(); c.on = !c.on; this.save(c); },
  count(gr){ return typeof CANDLE_EDGES === 'undefined' ? 0 : CANDLE_EDGES.rules.filter(r => gr.includes(r.grade)).length; },
  panel(){
    let el = document.getElementById('pcPanel'); if (el){ el.remove(); return; }
    const c = this.cfg(), chk = (k, t) => `<label><input type="checkbox" data-pk="${k}"${c[k] ? ' checked' : ''}> ${t}</label>`;
    document.body.insertAdjacentHTML('beforeend', `<div id="pcPanel" class="autoSrPanel asPanel">
      <b>Proven candles</b>
      <div class="srLook"><b>Which rules</b><label><select data-ps="grades"><option value="AB"${c.grades === 'AB' ? ' selected' : ''}>Grade A and B (${this.count('AB')} rules)</option><option value="A"${c.grades === 'A' ? ' selected' : ''}>Only grade A — the very strongest (${this.count('A')} rules)</option></select></label></div>
      <div class="srLook"><b>What to show</b>${chk('card', 'The card')}${chk('past', 'Past signals with ✓ / ✗')}${chk('levels', 'Entry, stop and target of the running signal')}</div>
      <div class="srLook"><b>Look</b><label>Long colour <input type="color" data-pc="up" value="${c.up}"></label><label>Short colour <input type="color" data-pc="down" value="${c.down}"></label></div>
      <p class="dim2">The rules themselves cannot be changed here — they are exactly what was tested.</p></div>`);
    el = document.getElementById('pcPanel');
    const b = document.getElementById('pcCfg').getBoundingClientRect(); el.style.left = Math.max(8, Math.min(innerWidth - 350, b.left - 150)) + 'px'; el.style.top = (b.bottom + 6) + 'px';
    const apply = e => { const t = e.target, v = this.cfg();
      if (t.dataset.pk) v[t.dataset.pk] = t.checked; else if (t.dataset.pc) v[t.dataset.pc] = t.value; else if (t.dataset.ps) v[t.dataset.ps] = t.value; else return;
      if (!v.on) v.on = true; this.save(v); };
    el.addEventListener('input', apply); el.addEventListener('change', apply);
    setTimeout(() => document.addEventListener('mousedown', function off(e){ if (!e.target.closest('#pcPanel, #pcCfg')){ document.getElementById('pcPanel')?.remove(); document.removeEventListener('mousedown', off); } }), 0);
  },
};
document.addEventListener('DOMContentLoaded', () => {
  const after = document.getElementById('fcCfg') || document.getElementById('patCfg');
  if (!after || document.getElementById('pcBtn')) return;
  after.insertAdjacentHTML('afterend', `<button id="pcBtn" class="bMini autoSrBtn${ProvenCandles.cfg().on ? ' on' : ''}" title="Candle signals that survived a real backtest — only on the market and timeframe where they were proven">★ Proven</button><button id="pcCfg" class="bMini" title="Proven candles settings">⚙</button>`);
  document.getElementById('pcBtn').addEventListener('click', () => ProvenCandles.toggle());
  document.getElementById('pcCfg').addEventListener('click', () => ProvenCandles.panel());
});
