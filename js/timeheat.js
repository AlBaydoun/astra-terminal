/* ASTRA Terminal — TIME HEATMAP of the open chart (right side panel, tab HEAT).
   How did this one instrument behave in a given stretch of time — yesterday, the day
   before, the first half of yesterday, your own window (06:00–13:00 by default), today
   so far, by session — and how does that compare with what is USUAL for the same hours?

   Everything is read from 1-hour candles of the open chart and shown in YOUR clock.
   MT5 candles are stamped in the broker's server time (EET, UTC+2/+3) and are converted
   with the same rule the US-stocks code uses, so 10:00 server time reads as 09:00 Berlin.
   It describes what happened. It is not a forecast. */
const TimeHeat = {
  CFG_KEY: 'astra_timeheat',
  cache: {},          // sym -> { at, bars }
  open: {},           // which scenario cards are unfolded (this session only)
  cfg(){ const c = lsGet(this.CFG_KEY, {}) || {};
    return { from: Number.isFinite(c.from) ? c.from : 6, to: Number.isFinite(c.to) ? c.to : 13, days: c.days || 7, mode: c.mode || 'move' }; },
  saveCfg(c){ lsSet(this.CFG_KEY, c); this.cfgView(); this.render(); },

  init(){
    this.el = document.getElementById('thBody'); if (!this.el) return;
    document.getElementById('thCfg')?.addEventListener('click', () => { this.cfgOpen = !this.cfgOpen; this.cfgView(); });
    document.getElementById('thReload')?.addEventListener('click', () => { delete this.cache[STORE.symbol]; this.show(); });
    document.getElementById('thCfgBox')?.addEventListener('change', e => {
      const t = e.target, c = this.cfg();
      if (t.dataset.thfrom) c.from = +t.value; else if (t.dataset.thto) c.to = +t.value;
      else if (t.dataset.thdays) c.days = +t.value; else if (t.dataset.thmode) c.mode = t.value; else return;
      this.saveCfg(c);
    });
    this.el.addEventListener('click', e => {
      const cell = e.target.closest('[data-thjump]'); if (cell){ this.jump(+cell.dataset.thjump); return; }
      const card = e.target.closest('[data-thcard]'); if (card){ const k = card.dataset.thcard; this.open[k] = !this.open[k]; this.render(); }
    });
    document.querySelector('#sideTabs [data-tab="heat"]')?.addEventListener('click', () => this.show());
    BUS.on('symbol', () => { if (this.active()) this.show(); });
    setInterval(() => { if (this.active()) this.show(true); }, 300000);
  },
  active(){ return document.getElementById('tab-heat')?.classList.contains('active'); },

  cfgView(){
    const box = document.getElementById('thCfgBox'), btn = document.getElementById('thCfg'); if (!box) return;
    box.hidden = !this.cfgOpen; if (btn) btn.classList.toggle('on', !!this.cfgOpen);
    if (!this.cfgOpen){ box.innerHTML = ''; return; }
    const c = this.cfg(), hrs = (sel, a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i).map(h => `<option value="${h}"${h === sel ? ' selected' : ''}>${String(h).padStart(2, '0')}:00</option>`).join('');
    box.innerHTML = `<label>Your window <select data-thfrom="1">${hrs(c.from, 0, 23)}</select> → <select data-thto="1">${hrs(c.to, 1, 24)}</select></label>
      <label>Days in the map <select data-thdays="1">${[5, 7, 10, 14].map(n => `<option${n === c.days ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Colour by <select data-thmode="1"><option value="move"${c.mode === 'move' ? ' selected' : ''}>how far it moved up / down</option><option value="range"${c.mode === 'range' ? ' selected' : ''}>how busy the hour was (its range)</option></select></label>
      <small>Times are your clock (${esc(Intl.DateTimeFormat().resolvedOptions().timeZone)}). Colours are measured against this market's own usual hour, so a quiet stock and a wild coin are both readable.</small>`;
  },

  /* ---------- data ---------- */
  utcOf(sym, raw){
    let bridge = false; try { bridge = typeof Feed !== 'undefined' && Feed.route(sym).kind === 'bridge'; } catch(e){}
    if (!bridge) return raw;
    const off = typeof USStocks !== 'undefined' && USStocks.brokerOffsetAt ? USStocks.brokerOffsetAt(raw)
      : ((typeof Feed !== 'undefined' && Feed.bridgeClock && Feed.bridgeClock.offset) || 0);
    return raw - off;
  },
  async load(sym, quiet){
    const c = this.cache[sym];
    if (c && Date.now() - c.at < (quiet ? 290000 : 60000)) return c.bars;
    const raw = await API.klines(sym, '1h', 600);
    const pad = n => String(n).padStart(2, '0');
    const bars = (raw || []).filter(k => k && k.open > 0 && k.close > 0).map(k => {
      const ms = this.utcOf(sym, k.rawTime || k.time) * 1000, d = new Date(ms);
      return { ms, time: k.time, day: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), h: d.getHours(),
        o: k.open, hi: k.high, lo: k.low, c: k.close, v: k.volume || 0 };
    });
    this.cache[sym] = { at: Date.now(), bars };
    return bars;
  },
  async show(quiet){
    if (!this.el) return;
    const sym = STORE.symbol; this.sym = sym;
    if (!this.cache[sym]) this.el.innerHTML = '<div class="empty">Reading the hourly candles…</div>';
    try { await this.load(sym, quiet); this.err = null; }
    catch(e){ this.err = e.message || String(e); }
    if (sym === STORE.symbol) this.render();
  },

  /* ---------- the measures ---------- */
  dayKey(offset){ const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() + offset); const p = n => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); },
  slice(day, from, to){ return this.bars.filter(b => b.day === day && b.h >= from && b.h < to); },
  stat(L){
    if (!L.length) return null;
    const o = L[0].o, c = L[L.length - 1].c; let hi = -Infinity, lo = Infinity, hiAt = 0, loAt = 0, v = 0;
    for (const b of L){ if (b.hi > hi){ hi = b.hi; hiAt = b.h; } if (b.lo < lo){ lo = b.lo; loAt = b.h; } v += b.v; }
    return { o, c, hi, lo, hiAt, loAt, v, n: L.length, chg: (c - o) / o * 100, range: (hi - lo) / o * 100, pos: hi > lo ? (c - lo) / (hi - lo) : 0.5, bars: L };
  },
  /* the same hours on the trading days before `day` (up to ten): what is usual for this stretch */
  usual(day, from, to, minN){
    const days = [...new Set(this.bars.map(b => b.day))].filter(d => d < day).sort().reverse(), out = [];
    for (const d of days){ const s = this.stat(this.slice(d, from, to)); if (s && s.n >= Math.max(1, minN || 1)) out.push(s); if (out.length >= 10) break; }
    if (!out.length) return null;
    const avg = f => out.reduce((a, s) => a + f(s), 0) / out.length;
    return { n: out.length, range: avg(s => s.range), absChg: avg(s => Math.abs(s.chg)), chg: avg(s => s.chg), up: out.filter(s => s.chg > 0).length, v: avg(s => s.v) };
  },
  heatOf(s, u){
    if (!s || !u || !(u.range > 0)) return { k: 'na', t: 'no baseline yet', x: null };
    const x = s.range / u.range;
    return x >= 1.5 ? { k: 'hot', t: 'HOT', x } : x >= 1.15 ? { k: 'warm', t: 'WARM', x } : x <= 0.7 ? { k: 'quiet', t: 'QUIET', x } : { k: 'normal', t: 'NORMAL', x };
  },
  words(s, u){
    const ref = u && u.range > 0 ? u.range : s.range || 1, r = Math.abs(s.chg) / ref;
    const dir = r < 0.2 ? 'went sideways' : s.chg > 0 ? (r >= 0.6 ? 'rose strongly' : 'rose') : (r >= 0.6 ? 'fell strongly' : 'fell');
    const close = s.pos >= 0.8 ? 'closed near its high — buyers held it' : s.pos <= 0.2 ? 'closed near its low — sellers held it down' : s.pos >= 0.6 ? 'closed in the upper part of its range' : s.pos <= 0.4 ? 'closed in the lower part of its range' : 'closed mid-range';
    return dir + ', ' + close;
  },

  /* ---------- the picture ---------- */
  tone(chg, range, ref, mode){
    const v = mode === 'range' ? range / (ref.range || 1) : chg / (ref.move || 1);
    if (mode === 'range'){ const a = Math.max(0, Math.min(1, (v - 0.4) / 2.1)); return `rgba(255,170,40,${(0.08 + a * 0.85).toFixed(2)})`; }
    const a = Math.min(1, Math.abs(v) / 3);
    return v >= 0 ? `rgba(38,208,124,${(0.10 + a * 0.85).toFixed(2)})` : `rgba(255,77,94,${(0.10 + a * 0.85).toFixed(2)})`;
  },
  refs(){
    const med = a => { const s = a.slice().sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
    return { move: med(this.bars.map(b => Math.abs(b.c - b.o) / b.o * 100)) || 0.05, range: med(this.bars.map(b => (b.hi - b.lo) / b.o * 100)) || 0.1 };
  },
  strip(L, from, to, ref, mode){
    const by = {}; for (const b of L) by[b.h] = b;
    let s = ''; for (let h = from; h < to; h++){ const b = by[h];
      s += b ? `<i data-thjump="${b.time}" style="background:${this.tone((b.c - b.o) / b.o * 100, (b.hi - b.lo) / b.o * 100, ref, mode)}" title="${String(h).padStart(2, '0')}:00 · ${fmtPct((b.c - b.o) / b.o * 100)} · range ${((b.hi - b.lo) / b.o * 100).toFixed(2)}% — click to see it on the chart"></i>` : '<i class="thOff" title="no trading"></i>'; }
    return `<div class="thStrip">${s}</div>`;
  },
  grid(ref, mode, days){
    const all = [...new Set(this.bars.map(b => b.day))].sort().reverse().slice(0, days), C = this.cfg();
    const map = {}; for (const b of this.bars) map[b.day + '|' + b.h] = b;
    const wd = d => new Date(d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'numeric' });
    let rows = '';
    for (const d of all){
      let cells = ''; for (let h = 0; h < 24; h++){ const b = map[d + '|' + h], inW = h >= C.from && h < C.to;
        cells += b ? `<i data-thjump="${b.time}" class="${inW ? 'thIn' : ''}" style="background:${this.tone((b.c - b.o) / b.o * 100, (b.hi - b.lo) / b.o * 100, ref, mode)}" title="${wd(d)} ${String(h).padStart(2, '0')}:00 · ${fmtPct((b.c - b.o) / b.o * 100)} · range ${((b.hi - b.lo) / b.o * 100).toFixed(2)}% · ${fmtPrice(b.o)} → ${fmtPrice(b.c)} — click to see it on the chart"></i>`
          : `<i class="thOff${inW ? ' thIn' : ''}" title="${wd(d)} ${String(h).padStart(2, '0')}:00 · no trading"></i>`; }
      const s = this.stat(this.slice(d, 0, 24));
      rows += `<div class="thRow"><span>${wd(d)}</span><div class="thCells">${cells}</div><b class="${s ? pctClass(s.chg) : ''}">${s ? fmtPct(s.chg) : '—'}</b></div>`;
    }
    const axis = `<div class="thRow thAxis"><span></span><div class="thCells">${Array.from({ length: 24 }, (_, h) => `<i>${h % 6 === 0 ? String(h).padStart(2, '0') : ''}</i>`).join('')}</div><b></b></div>`;
    return `<div class="thGrid">${rows}${axis}</div>`;
  },
  card(key, title, sub, s, u, from, to, ref, mode, note){
    if (!s){
      const hs = [...new Set(this.bars.map(b => b.h))].sort((x, y) => x - y), hh = h => String(h).padStart(2, '0') + ':00';
      const when = hs.length && hs.length < 22 ? ` It trades about ${hh(hs[0])}–${hh(hs[hs.length - 1] + 1)} in your clock${key.endsWith('w') ? ' — set your window under ⚙' : ''}.` : '';
      const msg = (key === 'today' || key === 'tw' ? 'Not traded yet today.' : 'No candles in this stretch — the market was closed.') + when;
      return `<div class="thCard thEmpty"><div class="thTitle"><b>${esc(title)}</b><small>${esc(sub)}</small></div><p class="dim2">${esc(msg)}</p></div>`;
    }
    const ht = this.heatOf(s, u), open = !!this.open[key];
    const hh = h => String(h).padStart(2, '0') + ':00';
    let body = `<div class="thTitle"><b>${esc(title)}</b><small>${esc(sub)}</small><span class="thHeat th-${ht.k}" title="How busy this stretch was compared with the same hours on the days before${ht.x ? ': ' + ht.x.toFixed(2) + '× the usual range' : ''}">${ht.t}${ht.x ? ' ' + ht.x.toFixed(1) + '×' : ''}</span></div>
      <div class="thBig"><em class="${pctClass(s.chg)}">${fmtPct(s.chg)}</em><span>${fmtPrice(s.o)} → ${fmtPrice(s.c)}</span></div>
      ${this.strip(s.bars, from, to, ref, mode)}
      <p>It ${esc(this.words(s, u))}.</p>
      <p class="dim2">Range ${s.range.toFixed(2)}%${u ? ' (usually ' + u.range.toFixed(2) + '%)' : ''} · high ${hh(s.hiAt)} · low ${hh(s.loAt)}${u ? ' · these hours rose on ' + u.up + ' of the ' + u.n + ' days before' : ''}${note ? ' · ' + esc(note) : ''}</p>`;
    if (open) body += `<table class="thHours"><thead><tr><th>Hour</th><th>Open → close</th><th>Move</th><th>Range</th></tr></thead><tbody>${s.bars.map(b => `<tr data-thjump="${b.time}" title="Show on the chart"><td>${hh(b.h)}</td><td>${fmtPrice(b.o)} → ${fmtPrice(b.c)}</td><td class="${pctClass((b.c - b.o) / b.o * 100)}">${fmtPct((b.c - b.o) / b.o * 100)}</td><td>${((b.hi - b.lo) / b.o * 100).toFixed(2)}%</td></tr>`).join('')}</tbody></table>`;
    return `<div class="thCard${open ? ' open' : ''}" data-thcard="${key}" title="${open ? 'Fold the hours away' : 'Unfold: every hour of this stretch'}">${body}<div class="thMore">${open ? '▴ fewer details' : '▾ every hour'}</div></div>`;
  },

  render(){
    if (!this.el) return;
    const sym = STORE.symbol, cached = this.cache[sym];
    if (this.err && !cached){ this.el.innerHTML = `<div class="empty">Could not read the hourly candles of ${esc(baseAsset(sym))}: ${esc(this.err)}</div>`; return; }
    if (!cached) return;
    this.bars = cached.bars;
    if (!this.bars.length){ this.el.innerHTML = '<div class="empty">No hourly candles for this market.</div>'; return; }
    const C = this.cfg(), ref = this.refs(), mode = C.mode, nowH = new Date().getHours();
    const T = this.dayKey(0), Y = this.dayKey(-1), Y2 = this.dayKey(-2), W = `${String(C.from).padStart(2, '0')}:00–${String(C.to).padStart(2, '0')}:00`;
    const cards = [];
    const add = (key, title, sub, day, from, to, note) => { const s = this.stat(this.slice(day, from, to)); cards.push(this.card(key, title, sub, s, s ? this.usual(day, from, to, Math.ceil(s.n / 2)) : null, from, to, ref, mode, note)); };
    const tradeDays = [...new Set(this.bars.map(b => b.day))].sort().reverse();
    add('today', 'Today so far', `00:00 → now · compared with the same hours before`, T, 0, nowH + 1, 'the current hour is still forming');
    add('y', 'Yesterday', 'the whole day · 00:00–24:00', Y, 0, 24);
    add('y2', 'The day before yesterday', '00:00–24:00', Y2, 0, 24);
    const lastTD = tradeDays.find(d => d < T);
    if (lastTD && lastTD !== Y) add('last', 'Last trading day', lastTD + ' · yesterday had no trading', lastTD, 0, 24);
    add('yh1', 'Yesterday · first half', '00:00–12:00', Y, 0, 12);
    add('yh2', 'Yesterday · second half', '12:00–24:00', Y, 12, 24);
    add('yw', 'Yesterday · your window', W + ' · change it under ⚙', Y, C.from, C.to);
    if (nowH >= C.from) add('tw', 'Today · your window', W + (nowH < C.to ? ' · still running' : ''), T, C.from, Math.min(C.to, nowH + 1));

    /* your window, day by day: is it a habit or a one-off? */
    const wRows = tradeDays.slice(0, Math.max(C.days, 7)).map(d => ({ d, s: this.stat(this.slice(d, C.from, C.to)) })).filter(r => r.s);
    let habit = '';
    if (wRows.length >= 3){
      const up = wRows.filter(r => r.s.chg > 0).length, avg = wRows.reduce((a, r) => a + r.s.chg, 0) / wRows.length, rng = wRows.reduce((a, r) => a + r.s.range, 0) / wRows.length;
      const max = Math.max(...wRows.map(r => Math.abs(r.s.chg))) || 1;
      const lean = up >= wRows.length * 0.7 ? 'a rising habit' : up <= wRows.length * 0.3 ? 'a falling habit' : 'no clear habit';
      habit = `<div class="thCard${this.open.habit ? ' open' : ''}" data-thcard="habit"><div class="thTitle"><b>Your window ${W}, day by day</b><small>the last ${wRows.length} trading days</small></div>
        <p>Up on <b>${up} of ${wRows.length}</b> days · average ${fmtPct(avg)} · usual range ${rng.toFixed(2)}% → <b>${lean}</b>.</p>
        <div class="thBars">${wRows.map(r => `<div><span>${new Date(r.d + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</span><i><u class="${r.s.chg >= 0 ? 'up' : 'dn'}" style="width:${(Math.abs(r.s.chg) / max * 50).toFixed(1)}%"></u></i><em class="${pctClass(r.s.chg)}">${fmtPct(r.s.chg)}</em></div>`).join('')}</div>
        <p class="dim2">${wRows.length < 10 ? 'A handful of days is a hint, not proof.' : ''} The bars are the change from ${String(C.from).padStart(2, '0')}:00 to ${String(C.to).padStart(2, '0')}:00 of each day.</p></div>`;
    }

    /* sessions of yesterday (your clock) */
    const SES = [['Asia', 0, 8], ['Europe', 8, 14], ['America', 14, 22], ['Late', 22, 24]];
    const sesDay = this.slice(Y, 0, 24).length ? Y : lastTD;
    const ses = sesDay ? SES.map(([n, a, b]) => { const s = this.stat(this.slice(sesDay, a, b)); return { n, a, b, s, u: s ? this.usual(sesDay, a, b, Math.ceil(s.n / 2)) : null }; }) : [];
    const sesHtml = ses.length ? `<div class="thCard"><div class="thTitle"><b>Sessions · ${sesDay === Y ? 'yesterday' : sesDay}</b><small>Asia 00–08 · Europe 08–14 · America 14–22 · late 22–24 (your clock)</small></div>
      <table class="thHours"><tbody>${ses.map(x => { const h = this.heatOf(x.s, x.u); return `<tr><td>${x.n}</td><td class="${x.s ? pctClass(x.s.chg) : 'dim2'}">${x.s ? fmtPct(x.s.chg) : 'closed'}</td><td>${x.s ? x.s.range.toFixed(2) + '%' : ''}</td><td>${x.s ? `<span class="thHeat th-${h.k}">${h.t}</span>` : ''}</td></tr>`; }).join('')}</tbody></table></div>` : '';

    /* which hour of the day usually carries the move */
    const hrs = Array.from({ length: 24 }, (_, h) => { const L = this.bars.filter(b => b.h === h && b.day < T); if (L.length < 3) return null;
      const m = L.map(b => (b.c - b.o) / b.o * 100); return { h, n: L.length, avg: m.reduce((a, x) => a + x, 0) / L.length, up: m.filter(x => x > 0).length, rng: L.reduce((a, b) => a + (b.hi - b.lo) / b.o * 100, 0) / L.length }; }).filter(Boolean);
    let hourHtml = '';
    if (hrs.length >= 4){
      const busy = hrs.slice().sort((a, b) => b.rng - a.rng)[0], calm = hrs.slice().sort((a, b) => a.rng - b.rng)[0];
      const best = hrs.slice().sort((a, b) => b.avg - a.avg)[0], worst = hrs.slice().sort((a, b) => a.avg - b.avg)[0], hh = h => String(h).padStart(2, '0') + ':00';
      hourHtml = `<div class="thCard"><div class="thTitle"><b>The hours of the day</b><small>every hour across the last ${tradeDays.length - (tradeDays[0] === T ? 1 : 0)} days</small></div>
        <p>Busiest hour <b>${hh(busy.h)}</b> (range ${busy.rng.toFixed(2)}%) · calmest <b>${hh(calm.h)}</b> (${calm.rng.toFixed(2)}%).</p>
        <p>Best on average <b>${hh(best.h)}</b> <em class="${pctClass(best.avg)}">${fmtPct(best.avg)}</em> (up ${best.up}/${best.n}) · weakest <b>${hh(worst.h)}</b> <em class="${pctClass(worst.avg)}">${fmtPct(worst.avg)}</em> (up ${worst.up}/${worst.n}).</p>
        <p class="dim2">Few days each — read it as "where the action usually is", not as a rule.</p></div>`;
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    this.el.innerHTML = `<div class="thTop"><b>${typeof WorkspaceUI !== 'undefined' ? WorkspaceUI.pair(sym) : esc(baseAsset(sym))}</b><small>hourly · your clock (${esc(tz)}) · updated ${new Date(cached.at).toLocaleTimeString()}</small></div>
      ${this.grid(ref, mode, C.days)}
      <div class="thLegend">${mode === 'range' ? '<span>calm</span><i class="thGradR"></i><span>busy</span>' : '<span>down</span><i class="thGradM"></i><span>up</span>'}<small>vs. this market's usual hour · framed = your window · click an hour → chart</small></div>
      ${cards.join('')}${habit}${sesHtml}${hourHtml}
      <p class="thFoot">This shows what happened. It is not a forecast — the same hours can behave quite differently tomorrow.</p>`;
  },

  /* click an hour → the chart shows it (when the chart is this market) */
  jump(time){
    if (!Number.isFinite(time) || typeof Chart === 'undefined' || !Chart.main) return;
    if (this.sym !== STORE.symbol) return;
    const tfSec = { '1m': 60, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '4h': 14400, '1d': 86400 }[STORE.tf] || 3600;
    const pad = Math.max(6 * 3600, tfSec * 30);
    const first = Chart.raw && Chart.raw.length ? Chart.raw[0].time : null;
    if (first != null && time < first){ toast('That hour is older than the candles loaded on the chart — choose a bigger timeframe (1h or 4h) to see it.', 'info'); return; }
    try { Chart.main.timeScale().setVisibleRange({ from: time - pad, to: time + pad }); } catch(e){}
    if (typeof WorkspaceUI !== 'undefined' && document.getElementById('bottomPanel')?.classList.contains('panelMax')) WorkspaceUI.openChart();
  },
};
document.addEventListener('DOMContentLoaded', () => setTimeout(() => TimeHeat.init(), 0));
