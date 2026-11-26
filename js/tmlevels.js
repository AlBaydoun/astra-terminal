/* ASTRA · new look — see a stop and a target on the chart before they are set.

     PREVIEW   a level you are choosing but have not applied yet is drawn on the chart as a dashed line that
               moves with it, with its price, its distance from the entry in percent, and what it is worth:
                 · a trade card: while you drag the rail's handles, type in Stop or Target, or press a
                   percentage, the line follows until you press Apply (or the level is set);
                 · the paper ticket: the entry it would take (the price now, or your own entry price), and
                   the stop and target you have typed, before the trade exists.
               Only for the market on the chart. The lines are a drawing: they set nothing.
     APPLY     "Apply levels" (and "Apply at the broker" on a real position) is a bright button, and it
               pulses while a level in the boxes is not the one in force yet.
     ENTRIES   the glowing entry, target and stop boxes on the chart go faint while the pointer is on them,
               whatever tool is in your hand, so they never cover what you are measuring or drawing.

   It reads the boxes and draws. It has no call that sets a level, or places, changes or closes an order:
   the Apply buttons are the cards' own and are pressed by you. */
'use strict';
const Levels = window.Levels = {
  $(id){ return document.getElementById(id); },
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  on(){ return document.documentElement.dataset.face === 'tm'; },
  base(s){ return String(s || '').replace(/\.(s|m|std)$/i, '').toUpperCase(); },
  same(a, b){ return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)); },
  num(el){ const v = parseFloat(el && el.value); return Number.isFinite(v) && v > 0 ? v : null; },
  px(v){ return typeof fmtPrice === 'function' ? fmtPrice(v) : String(v); },
  money(v){ if (!Number.isFinite(v)) return ''; const a = Math.abs(v); return (v >= 0 ? '+' : '−') + (typeof fmtNum === 'function' ? fmtNum(a) : a.toFixed(2)); },
  pct(price, entry, dir){ if (!(entry > 0)) return ''; const v = (price - entry) / entry * 100 * dir; return (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(2) + '%'; },

  /* ---------- what is being chosen right now ---------- */
  /* one trade's boxes against the levels in force */
  pending(card, slSel, tpSel, btn, p, cash, out, here, name){ if (!card || card.offsetParent === null) { if (btn) btn.classList.remove('lvPending'); return; }
    const sl = this.num(card.querySelector(slSel)), tpEl = card.querySelector(tpSel), tp = this.num(tpEl), hasTp = p.tp != null && p.tp > 0;
    const pSl = sl != null && !(p.sl > 0 && this.same(sl, p.sl)), pTp = tp != null ? !(hasTp && this.same(tp, p.tp)) : (hasTp && !!tpEl && String(tpEl.value).trim() === '');
    if (btn && btn.classList.contains('lvPending') !== (pSl || pTp)) btn.classList.toggle('lvPending', pSl || pTp);
    if (this.base(p.sym) !== here) return;   /* a stop may sit on either side of the entry once a trade is in profit, so only a target is checked */
    if (pSl) out.push({ kind: 'sl', price: sl, entry: p.entry, dir: p.dir, cash: cash(sl), tag: 'STOP · not applied yet', who: name });
    if (pTp && tp != null) out.push({ kind: 'tp', price: tp, entry: p.entry, dir: p.dir, cash: cash(tp), tag: 'TARGET · not applied yet', who: name, wrong: (tp - p.entry) * p.dir <= 0 }); },
  collect(){ const out = [], here = this.base(typeof STORE !== 'undefined' ? STORE.symbol : '');
    /* paper trades: the card's own Stop and Target boxes (the rail keeps them in step while a handle is dragged) */
    try { const btns = document.querySelectorAll('[data-otset]'); if (btns.length && typeof OpenTrades !== 'undefined'){ const rows = new Map(OpenTrades.all().map(r => [r.bot + ':' + r.p.id, r]));
        btns.forEach(btn => { const r = rows.get(btn.dataset.otset); if (!r) return; const p = r.p, card = btn.closest('[data-ot]');
          this.pending(card, '[data-otsl]', '[data-ottp]', btn, p, price => { try { return (price - p.entry) * p.dir * p.qty * BotEngine.cashRate(p, true); } catch(e){ return NaN; } }, out, here, r.botName); }); } } catch(e){}
    /* real positions: the live desk's own boxes */
    try { const btns = document.querySelectorAll('[data-ldapply]'); if (btns.length && typeof LiveDesk !== 'undefined'){ const rows = new Map(LiveDesk.chartRows().map(r => [String(r.ticket), r]));
        btns.forEach(btn => { const r = rows.get(String(btn.dataset.ldapply)); if (!r) return; const p = r.p, card = btn.closest('[data-ldpos]') || btn.parentElement, fx = (p.meta && p.meta.accountFx && p.meta.accountFx.profit) || 1;
          this.pending(card, '[data-ldsl]', '[data-ldtp]', btn, p, price => (price - p.entry) * p.dir * p.qty * fx, out, here, 'REAL'); }); } } catch(e){}
    /* the paper ticket in the side panel: the trade that does not exist yet */
    try { const tk = this.$('trTicket'), host = this.$('tsTradeHost'), body = this.$('botBody'), pick = this.$('mbSym');
      if (tk && !tk.hidden && tk.offsetParent !== null && host && body && host.contains(body) && pick && this.base(pick.dataset.val) === here && typeof Bots !== 'undefined'){ const dir = Bots.manualSide > 0 ? 1 : -1, ot = (this.$('mbOrderType') || {}).value || 'market', q = STORE.tickers.get(STORE.symbol) || {};
        const entry = ot === 'market' ? +(dir > 0 ? (q.ask || q.last || q.price) : (q.bid || q.last || q.price)) : this.num(this.$('mbEntry')), sl = this.num(this.$('mbSl')), tp = this.num(this.$('mbTp'));
        if (entry > 0 && (sl || tp || ot !== 'market')){ out.push({ kind: 'en', price: entry, entry, dir, tag: 'ENTRY · ticket · ' + (dir > 0 ? 'BUY' : 'SELL') + (ot === 'market' ? ' at the price now' : ' · ' + ot), who: '' });
          if (sl) out.push({ kind: 'sl', price: sl, entry, dir, tag: 'STOP · ticket', who: '', wrong: (sl - entry) * dir >= 0 });
          if (tp) out.push({ kind: 'tp', price: tp, entry, dir, tag: 'TARGET · ticket', who: '', wrong: (tp - entry) * dir <= 0 }); } } } catch(e){}
    return out; },

  /* ---------- drawing ---------- */
  paint(){ const host = this.$('mainWrap'); if (!host || typeof Chart === 'undefined') return; let layer = this.$('lvLayer'); const show = this.on() && document.documentElement.dataset.tmroom === 'chart' && !!Chart.priceSeries;
    let L = []; try { L = this.collect(); } catch(e){} if (!show) L = [];
    if (!layer){ if (!L.length) return; layer = document.createElement('div'); layer.id = 'lvLayer'; host.appendChild(layer); }
    let w = host.clientWidth; try { w = Chart.main.timeScale().width() || w; } catch(e){} const h = host.clientHeight, E = s => this.esc(s);
    const html = L.map(l => { let y = null; try { y = Chart.priceSeries.priceToCoordinate(l.price); } catch(e){} if (y == null || !isFinite(y)) return '';
      const off = y < 34 ? 'up' : y > h - 44 ? 'down' : '', yy = Math.max(34, Math.min(h - 44, y)), pc = l.kind === 'en' ? '' : this.pct(l.price, l.entry, l.dir), cash = l.cash != null && isFinite(l.cash) ? this.money(l.cash) : '';
      return '<div class="lvLine ' + l.kind + (off ? ' off' : '') + (l.wrong ? ' wrong' : '') + '" style="top:' + yy.toFixed(1) + 'px;width:' + Math.round(w) + 'px"><span><b>' + E(l.tag) + (off ? (off === 'up' ? ' ▲ above the view' : ' ▼ below the view') : '') + '</b><i>' + E(this.px(l.price)) + '</i>' + (pc ? '<em>' + pc + '</em>' : '') + (cash ? '<em>' + E(cash) + '</em>' : '') + (l.wrong ? '<u>on the wrong side of the entry</u>' : '') + (l.who ? '<small>' + E(l.who) + '</small>' : '') + '</span></div>'; }).join('');
    if (layer._h !== html){ layer._h = html; layer.innerHTML = html; } },

  /* ---------- the glowing boxes step aside for the pointer ---------- */
  fade(){ let raf = 0, x = -1, y = -1; const run = () => { raf = 0; const els = document.querySelectorAll('.bcnLayer > .bcn'); if (!els.length) return;
      els.forEach(el => { let near = false; for (const part of [el.querySelector('.bcnTag'), el.querySelector('.bcnCore')]){ if (!part) continue; const r = part.getBoundingClientRect(); if (!r.width && !r.height) continue; if (x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10){ near = true; break; } }
        if (el.classList.contains('bcnFaint') !== near) el.classList.toggle('bcnFaint', near); }); };
    document.addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; if (!raf) raf = requestAnimationFrame(run); }, { passive: true, capture: true });
    document.addEventListener('pointerleave', () => { x = y = -1; if (!raf) raf = requestAnimationFrame(run); }, true); },

  init(){ if (this._on) return; this._on = true; this.fade(); const now = () => { try { this.paint(); } catch(e){} };
    setInterval(now, 150);
    document.addEventListener('input', e => { if (e.target && e.target.matches && e.target.matches('[data-otsl], [data-ottp], [data-ldsl], [data-ldtp], #mbSl, #mbTp, #mbEntry')) now(); }, true);
    document.addEventListener('pointermove', () => { if (document.body.classList.contains('railDrag')) now(); }, { passive: true, capture: true }); },
};
if (document.readyState !== 'loading') Levels.init(); else document.addEventListener('DOMContentLoaded', () => Levels.init());
