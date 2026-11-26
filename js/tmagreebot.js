/* ASTRA · the Agreement bot: three timeframes that say the same thing.

   THE RULE
     1. On its own timeframe (15m as it comes) it counts the readings of the Signals board on the last CLOSED
        candle. If at least 21 of the 33 point one way (and more than point the other), it goes on.
     2. It reads the next two timeframes up (15m → 1h and 4h; 5m → 15m and 1h; 1h → 4h and 1d; 4h → 1d and 1w).
        If at least 21 point the SAME way on both, the rule is met.
     3. Trend check (on as it comes): on all three timeframes the close must be on the trade's side of its 200
        average, above for a buy and below for a sell.
     4. Then it opens a paper trade that way at the price now: stop 1.5 ATR(14) of its own timeframe away, target
        at 2 times that distance. One trade per run of agreement on a market.

   The four numbers (how many must agree, the trend check, the stop, the target) are yours to change, in the
   Signals tab. It is an ordinary paper bot: Classic's engine runs it, sizes it and guards it like every other
   bot, and it reaches real money only through the Live desk and its checks, armed by you.

   It ships PAUSED: it opens nothing until you switch Pause off on its page.

   Unproven. In the large test on this broker's markets, more agreement between signals did not beat random
   entries once the spread was paid. This bot is a way to watch the idea on paper, not a finding.

   This file reads candles (GET) and answers the engine's question "is there a setup?". It has no call that
   places, changes or closes an order. Needs js/tmsignals.js (the readings) and js/proind.js. */
'use strict';
const AgreeBot = window.AgreeBot = {
  ID: 'agree3', NAME: 'Agreement · 3 timeframes', KEY: 'astra_agreebot', LADDER: ['1m', '5m', '15m', '1h', '4h', '1d', '1w'],
  DEF: { need: 21, trend: true, stopAtr: 1.5, rr: 2 }, C: {}, busy: {}, T0: {},
  $(id){ return document.getElementById(id); },
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  sec(tf){ return typeof tfSeconds === 'function' ? tfSeconds(tf) : 0; },
  total(){ try { return SignalBoard.readings().length; } catch(e){ return 33; } },
  set(){ let s = {}; try { s = JSON.parse(localStorage.getItem(this.KEY) || '{}') || {}; } catch(e){} const o = Object.assign({}, this.DEF, s), n = this.total(), cl = (v, a, b, d) => Number.isFinite(+v) ? Math.max(a, Math.min(b, +v)) : d;
    return { need: Math.round(cl(o.need, 5, n, this.DEF.need)), trend: o.trend !== false, stopAtr: cl(o.stopAtr, 0.3, 10, this.DEF.stopAtr), rr: cl(o.rr, 0.3, 10, this.DEF.rr) }; },
  save(k, v){ const s = this.set(); s[k] = v; try { localStorage.setItem(this.KEY, JSON.stringify(s)); } catch(e){} },
  /* its own timeframe and the two above it */
  chain(tf){ const s = this.sec(tf); return [tf].concat(this.LADDER.filter(t => this.sec(t) > s).slice(0, 2)); },

  /* ---------- the higher timeframes: read once, kept until their own candle has closed (15 minutes at most) ---------- */
  async fetch(sym, tf){ const k = sym + '|' + tf; if (this.busy[k] || typeof API === 'undefined') return; this.busy[k] = true;
    try { const bars = await API.klines(sym, tf, 520), closed = bars && bars.length > 1 ? bars.slice(0, -1) : []; this.C[k] = { at: Date.now(), T: SignalBoard.tally(closed) }; }
    catch(e){ this.C[k] = { at: Date.now(), err: true }; } finally { delete this.busy[k]; }
    const keys = Object.keys(this.C); if (keys.length > 400) for (const x of keys.slice(0, keys.length - 400)) delete this.C[x]; },
  cached(sym, tf){ const c = this.C[sym + '|' + tf]; if (!c) return null; const ttl = c.err ? 60000 : Math.min(this.sec(tf) || 900, 900) * 1000; return Date.now() - c.at < ttl ? c : null; },
  /* the count on the bot's own timeframe, worked out once per closed candle */
  own(sym, tf, closed){ const last = closed[closed.length - 1], k = sym + '|' + tf, c = this.T0[k]; if (c && c.t === last.time) return c.T; const T = SignalBoard.tally(closed); this.T0[k] = { t: last.time, T };
    const keys = Object.keys(this.T0); if (keys.length > 400) for (const x of keys.slice(0, keys.length - 400)) delete this.T0[x]; return T; },

  /* ---------- the rule ---------- */
  judge(sym, tf, T0, all){ const S = this.set(), ch = this.chain(tf), out = { tf, chain: ch, rows: [], dir: 0, ok: false, wait: false, why: '', need: S.need };
    if (!T0){ out.why = 'Too few candles on ' + tf + ' to read (260 are needed).'; return out; }
    const side = T => T.up >= S.need && T.up > T.dn ? 1 : T.dn >= S.need && T.dn > T.up ? -1 : 0, dir = side(T0), word = d => d > 0 ? 'up' : 'down';
    out.rows.push({ tf, T: T0, pass: !!dir }); out.dir = dir;
    if (ch.length < 3){ out.why = 'There are not two timeframes above ' + tf + ', so the rule cannot be met here.'; return out; }
    if (!dir && !all){ out.why = tf + ': ' + Math.max(T0.up, T0.dn) + ' agree, ' + S.need + ' are needed.'; return out; }
    let fail = dir ? '' : tf + ': ' + Math.max(T0.up, T0.dn) + ' agree, ' + S.need + ' are needed.';
    for (const h of ch.slice(1)){ const c = this.cached(sym, h); if (!c){ this.fetch(sym, h); out.wait = true; out.rows.push({ tf: h, wait: true }); continue; }
      if (!c.T){ out.rows.push({ tf: h, none: true }); fail = fail || h + ' has too few candles to read (260 are needed).'; continue; }
      const n = dir > 0 ? c.T.up : dir < 0 ? c.T.dn : Math.max(c.T.up, c.T.dn), pass = !!dir && side(c.T) === dir; out.rows.push({ tf: h, T: c.T, pass });
      if (dir && !pass){ const opp = dir > 0 ? c.T.dn : c.T.up; fail = fail || (n >= S.need ? h + ': ' + n + ' point ' + word(dir) + ', but ' + opp + ' point the other way.' : h + ': ' + n + ' point ' + word(dir) + ', ' + S.need + ' are needed.'); } }
    if (fail){ out.why = fail; return out; } if (out.wait){ out.why = 'Reading ' + ch.slice(1).join(' and ') + '…'; return out; }
    if (S.trend){ const bad = out.rows.find(r => r.T && r.T.trend !== dir); if (bad){ out.trendFail = bad.tf; out.why = 'Trend check: on ' + bad.tf + ' the close is ' + (bad.T.trend > 0 ? 'above' : bad.T.trend < 0 ? 'below' : 'not clear of') + ' its 200 average, against a ' + (dir > 0 ? 'buy' : 'sell') + '.'; return out; } }
    out.ok = true; out.why = 'All three point ' + word(dir) + (S.trend ? ', with the trend' : '') + '.'; return out; },
  /* what Classic's engine asks on every scan: is there a setup on this market? */
  signal(w, cfg){ if (typeof SignalBoard === 'undefined' || !SignalBoard.tally || typeof ProInd === 'undefined') return { dir: 0, failed: ['the Signals board is not loaded'] };
    const sym = cfg.sym, tf = cfg.tf, S = this.set(); if (!w || w.length < 262) return { dir: 0, failed: ['warming up (needs 260 closed candles)'] };
    const closed = w.slice(0, -1), T0 = this.own(sym, tf, closed), J = this.judge(sym, tf, T0, false), n0 = T0 ? Math.max(T0.up, T0.dn) : 0, score = T0 ? Math.round(n0 / T0.of * 100) : 0;
    if (!J.ok) return { dir: 0, score, failed: [J.why] };
    const px = w[w.length - 1].close, atr = T0.atr; if (!(atr > 0) || !(px > 0)) return { dir: 0, score, failed: ['no usual range to size the stop'] };
    const dir = J.dir, sd = S.stopAtr * atr, need = S.need; let k = T0.U.length - 1; while (k > 0 && (dir > 0 ? T0.U[k - 1] >= need && T0.U[k - 1] > T0.D[k - 1] : T0.D[k - 1] >= need && T0.D[k - 1] > T0.U[k - 1])) k--;
    return { dir, score, entry: px, sl: px - dir * sd, tp: px + dir * S.rr * sd, session: 'agree:' + (dir > 0 ? 'up:' : 'dn:') + T0.TS[k], model: 'Three timeframes agree',
      reasons: J.rows.map(r => r.tf + ': ' + (dir > 0 ? r.T.up : r.T.dn) + ' of ' + r.T.of + ' point ' + (dir > 0 ? 'up' : 'down')).concat([S.trend ? 'close on the trade’s side of the 200 average on all three' : 'trend check off', 'stop ' + S.stopAtr + ' ATR · target ' + S.rr + 'R']) }; },
  def(){ return { id: this.ID, name: this.NAME, agree: true,
      blurb: 'Counts the readings of the Signals board on its timeframe. When at least 21 of them point one way, it reads the next two timeframes up (15m, then 1h and 4h); if at least 21 point the same way on both, it opens a paper trade that way, with a stop 1.5 ATR away and a target at twice that. A trend check (the 200 average on all three) is on as it comes. The numbers are yours to change in the Signals tab. Unproven: in the large test, more agreement did not beat random entries after the spread. It ships paused.',
      defaults: { tf: '15m', tfAuto: false, minScore: 0, maxOpen: 2, paused: true }, warmup: 420, sessionGuard: true, signal: (w, cfg) => this.signal(w, cfg) }; },
  install(){ if (typeof BOTS === 'undefined' || typeof BOT_BY_ID === 'undefined' || BOT_BY_ID[this.ID]) return; const b = this.def(); BOTS.push(b); BOT_BY_ID[b.id] = b; },

  /* ---------- in the Signals tab: the rule read on the chart you have open, and its four numbers ---------- */
  state(){ try { const b = BOT_BY_ID[this.ID]; if (!b || typeof Bots === 'undefined') return null; if (Bots.disabled && Bots.disabled(b.id)) return { st: 'off', tf: '' }; const c = Bots.cfg(b.id) || {}; return { st: c.paused ? 'paused' : 'running', tf: c.tf || b.defaults.tf }; } catch(e){ return null; } },
  paint(){ const el = this.$('sgBot'); if (!el || typeof SignalBoard === 'undefined' || !SignalBoard.active()) return; const a = document.activeElement; if (a && el.contains(a) && /INPUT/.test(a.tagName)) return;
    if (!el._on){ el._on = true; el.addEventListener('change', e => { const i = e.target; if (!i.dataset || !i.dataset.ab) return; this.save(i.dataset.ab, i.type === 'checkbox' ? i.checked : +i.value); el._h = ''; i.blur(); this.paint(); });
      el.addEventListener('click', e => { const b = e.target.closest('[data-abgo]'); if (b && typeof Face !== 'undefined') Face.studio(this.ID); }); }
    const raw = (typeof Chart !== 'undefined' && Chart.raw) || [], sym = STORE.symbol, tf = STORE.tf, S = this.set(), E = s => this.esc(s), N = this.total(); let T0 = null; try { if (raw.length > 262) T0 = this.own(sym, tf, raw.slice(0, -1)); } catch(e){}
    const J = this.judge(sym, tf, T0, true), st = this.state();
    const row = r => { if (r.wait) return '<div class="abRow"><b>' + E(r.tf) + '</b><i></i><span class="abW">reading…</span></div>'; if (r.none || !r.T) return '<div class="abRow"><b>' + E(r.tf) + '</b><i></i><span class="abW">too few candles</span></div>';
      const T = r.T, side = T.up > T.dn ? 'up' : T.dn > T.up ? 'dn' : '', tr = S.trend ? '<small class="' + (J.dir && T.trend === J.dir ? 'ok' : J.dir ? 'no' : '') + '" title="The close against its 200 average on ' + E(r.tf) + '">' + (T.trend > 0 ? '▲ above 200 avg' : T.trend < 0 ? '▼ below 200 avg' : '200 avg: unclear') + '</small>' : '';
      return '<div class="abRow ' + (r.pass ? 'pass' : '') + '"><b>' + E(r.tf) + '</b><i><u class="up" style="--w:' + (T.up / T.of * 100).toFixed(0) + '%"></u><u class="dn" style="--w:' + (T.dn / T.of * 100).toFixed(0) + '%"></u><s style="--x:' + (S.need / T.of * 100).toFixed(0) + '%"></s></i><span class="' + side + '">' + T.up + ' up · ' + T.dn + ' down</span><em>' + (r.pass ? '✓' : '✗') + '</em>' + tr + '</div>'; };
    const h = '<div class="abRows">' + J.rows.map(row).join('') + '</div>' +
      '<p class="abVerdict ' + (J.ok ? (J.dir > 0 ? 'up' : 'dn') : '') + '">' + (J.ok ? 'The rule is met on this chart: it would be a <b>' + (J.dir > 0 ? 'BUY' : 'SELL') + '</b>. ' + E(J.why) : 'No entry on this chart: ' + E(J.why)) + '</p>' +
      '<div class="abSet"><label title="How many of the ' + N + ' readings must point the same way, on each of the three timeframes">Must agree<input type="number" data-ab="need" min="5" max="' + N + '" step="1" value="' + S.need + '"><small>of ' + N + '</small></label><label title="The stop, in ATR(14) of the bot’s own timeframe">Stop<input type="number" data-ab="stopAtr" min="0.3" max="10" step="0.1" value="' + S.stopAtr + '"><small>ATR</small></label><label title="The target, as a multiple of the stop distance">Target<input type="number" data-ab="rr" min="0.3" max="10" step="0.1" value="' + S.rr + '"><small>R</small></label>' +
        '<label class="chk" title="Buy only above the 200 average on all three timeframes, sell only below"><input type="checkbox" data-ab="trend"' + (S.trend ? ' checked' : '') + '>Trend check</label></div>' +
      '<div class="abBot"><span class="abSt ' + (st ? st.st : '') + '">' + (st ? (st.st === 'running' ? 'The bot is running on paper' : st.st === 'paused' ? 'The bot is paused' : 'The bot is switched off') + (st.tf ? ' · it scans on ' + E(st.tf) + ' → ' + this.chain(st.tf).slice(1).map(E).join(' → ') : '') : 'The bot is not loaded') + '</span><button type="button" data-abgo="1" title="Its page: Pause, its timeframe, its markets, its paper trades">Its page ↗</button></div>' +
      '<p class="abNote">' + (st && st.st === 'paused' ? 'It opens nothing while paused. Switch Pause off on its page to let it trade on paper. ' : '') + 'This card reads the chart you have open; the bot reads every market it may trade, on its own timeframe. Unproven: in the large test, more agreement did not beat random entries after the spread. Real money only through the Live desk and its checks.</p>';
    if (el._h !== h){ el._h = h; el.innerHTML = h; } },
};
AgreeBot.install();
setInterval(() => { try { AgreeBot.paint(); } catch(e){} }, 3000);
