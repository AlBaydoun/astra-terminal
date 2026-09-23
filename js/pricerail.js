/* ASTRA Terminal — the price rail you can drag.
   Every open trade shows a rail with its stop, entry, the price now and its
   target. Grab the red or the green handle and slide it: the price, the money
   it is worth and the reward-to-risk update as you move, and when you let go
   the level is applied to the trade —
     · a paper trade goes through Bots.editPos, so the bot's own risk rules,
       the daily budget and the "adjusted" mark all still apply;
     · a REAL broker position asks once, then the change is sent to MetaTrader
       through the bridge (the same /modify the live desk uses).
   A handle can never be dropped on the wrong side of the price: the stop stays
   behind the market, the target in front of it. Arrow keys nudge the focused
   handle, Delete clears a target, Esc cancels a drag. */
const PriceRail = {
  drag: null,

  /* is a rail inside this element being dragged right now? (the refreshers ask
     before they rebuild a card under your hand) */
  busy(host){ return !!(this.drag && host && host.contains(this.drag.rail)); },

  init(){
    document.addEventListener('pointerdown', e => {
      const grip = e.target.closest && e.target.closest('.wsPriceRail.live .wsGrip');
      if (!grip) return;
      e.preventDefault(); grip.focus();
      this.start(grip, e);
    });
    document.addEventListener('keydown', e => {
      const grip = document.activeElement;
      if (!grip || !grip.classList || !grip.classList.contains('wsGrip')) return;
      const rail = grip.closest('.wsPriceRail.live'); if (!rail) return;
      const d = this.read(rail), kind = grip.dataset.grip;
      const cur = this.priceOf(rail, grip);
      if (e.key === 'Escape'){ grip.blur(); return; }
      if ((e.key === 'Delete' || e.key === 'Backspace') && kind === 'tp'){
        e.preventDefault(); this.apply(rail, 'tp', 0); return;
      }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      if (e.key === 'Enter'){ this.apply(rail, kind, cur); return; }
      const step = (d.hi - d.lo) / (e.shiftKey ? 40 : 200);
      const next = cur + (e.key === 'ArrowRight' || e.key === 'ArrowUp' ? step : -step);
      this.place(rail, grip, this.clamp(d, kind, next), true);
    });
  },

  read(rail){
    const n = k => parseFloat(rail.dataset[k]);
    return { lo: n('lo'), hi: n('hi'), dir: n('dir'), entry: n('entry'), px: n('px'), qty: n('qty'), rate: n('rate'), fees: n('fees') || 0 };
  },
  /* where a handle sits now, in price */
  priceOf(rail, grip){
    const d = this.read(rail);
    return d.lo + (parseFloat(grip.style.left) || 0) / 100 * (d.hi - d.lo);
  },
  /* the stop stays behind the market, the target in front of it */
  clamp(d, kind, price){
    const gap = (d.hi - d.lo) * 0.004;
    if (kind === 'sl') return d.dir > 0 ? Math.min(price, d.px - gap) : Math.max(price, d.px + gap);
    return d.dir > 0 ? Math.max(price, d.px + gap) : Math.min(price, d.px - gap);
  },
  money(d, price){ return (price - d.entry) * d.dir * d.qty * d.rate - d.fees; },

  start(grip, e){
    const rail = grip.closest('.wsPriceRail.live');
    const d = this.read(rail), kind = grip.dataset.grip;
    this.drag = { rail, grip, kind, d, from: this.priceOf(rail, grip), moved: false };
    rail.classList.add('dragging'); document.body.classList.add('railDrag');
    const move = ev => {
      const r = rail.getBoundingClientRect();
      const price = d.lo + Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)) * (d.hi - d.lo);
      this.drag.moved = true;
      this.place(rail, grip, this.clamp(d, kind, price), false);
    };
    const up = ev => {
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('keydown', esc, true);
      rail.classList.remove('dragging'); document.body.classList.remove('railDrag');
      const dr = this.drag; this.drag = null;
      if (!dr || !dr.moved) return;                       /* a plain click changes nothing */
      this.apply(rail, kind, this.priceOf(rail, grip));
    };
    const esc = ev => {
      if (ev.key !== 'Escape') return;
      ev.preventDefault();
      const dr = this.drag; this.drag = null;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', up, true);
      window.removeEventListener('keydown', esc, true);
      rail.classList.remove('dragging'); document.body.classList.remove('railDrag');
      if (dr) this.place(rail, grip, dr.from, true);
      toast('Move cancelled', 'info');
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', up, true);
    window.addEventListener('keydown', esc, true);
    this.place(rail, grip, this.priceOf(rail, grip), false);
  },

  /* move the handle and rewrite everything that depends on it — live, while dragging */
  place(rail, grip, price, quiet){
    const d = this.read(rail), kind = grip.dataset.grip;
    const pct = Math.max(0, Math.min(100, (price - d.lo) / (d.hi - d.lo) * 100));
    grip.style.left = pct + '%';
    grip.classList.remove('empty');
    const money = this.money(d, price);
    const label = kind === 'sl' ? 'Stop' : 'Target';
    grip.querySelector('span').textContent = label + ' ' + fmtPrice(price);
    grip.classList.toggle('good', money >= 0);
    /* the zone between the entry and this level */
    const zone = rail.querySelector('.wsZone.' + (kind === 'sl' ? 'risk' : 'reward'));
    const ePct = (d.entry - d.lo) / (d.hi - d.lo) * 100;
    if (zone){ zone.style.left = Math.min(pct, ePct) + '%'; zone.style.width = Math.abs(pct - ePct) + '%'; }
    /* the legend under the rail */
    const wrap = rail.parentElement;
    const lv = wrap.querySelector('[data-rl="' + kind + '"]'), lm = wrap.querySelector('[data-rlm="' + kind + '"]');
    if (lv) lv.textContent = fmtPrice(price);
    if (lm){ lm.textContent = (money >= 0 ? '+' : '') + fmtNum(money); lm.className = money >= 0 ? 'up' : 'down'; }
    /* the reward-to-risk readout that floats above the handle while you drag */
    const other = rail.querySelector('.wsGrip.' + (kind === 'sl' ? 'tp' : 'sl') + ':not(.empty)');
    const oMoney = other ? this.money(d, this.priceOf(rail, other)) : null;
    const risk = kind === 'sl' ? money : oMoney, reward = kind === 'sl' ? oMoney : money;
    const rr = (risk != null && reward != null && risk < 0 && reward > 0) ? (reward / Math.abs(risk)).toFixed(2) + ' : 1' : null;
    let tip = rail.querySelector('.wsRailTip');
    if (!tip){ tip = document.createElement('div'); tip.className = 'wsRailTip'; rail.appendChild(tip); }
    tip.innerHTML = `<b>${fmtPrice(price)}</b> · <em class="${money >= 0 ? 'up' : 'down'}">${(money >= 0 ? '+' : '') + fmtNum(money)}</em>` +
      `<small>${((price - d.entry) / d.entry * 100 * d.dir).toFixed(2)}% from the entry${rr ? ' · reward to risk ' + rr : ''}</small>`;
    tip.style.left = pct + '%';
    tip.hidden = false;
    clearTimeout(this._tipT); if (quiet) this._tipT = setTimeout(() => { tip.hidden = true; }, 2500);
    /* keep the card's own number box in step, so Apply levels agrees with the rail */
    const k = rail.dataset.railk;
    if (k){
      const card = rail.closest('[data-ot]') || document;
      const input = card.querySelector('[data-' + (kind === 'sl' ? 'otsl' : 'ottp') + '="' + k + '"]');
      if (input && document.activeElement !== input){
        input.value = +price.toPrecision(10);
        if (typeof OpenTrades !== 'undefined' && OpenTrades.recalc) try { OpenTrades.recalc(card, k); } catch(e){}
      }
    }
  },

  /* let go → the level is really set */
  apply(rail, kind, price){
    const k = rail.dataset.railk, ticket = rail.dataset.railticket;
    const patch = {}; patch[kind] = kind === 'tp' && !(price > 0) ? null : +price.toPrecision(10);
    if (k){
      /* the same split Open Trades uses — a position id is a NUMBER in the ledger */
      const { bot, id } = (typeof OpenTrades !== 'undefined' && OpenTrades.split) ? OpenTrades.split(k)
        : { bot: k.slice(0, k.indexOf(':')), id: +k.slice(k.indexOf(':') + 1) };
      if (typeof Bots === 'undefined' || !Bots.editPos) return;
      Bots.editPos(bot, id, patch);
      if (typeof OpenTrades !== 'undefined' && OpenTrades.refresh) setTimeout(() => OpenTrades.refresh(), 60);
      if (typeof Draw !== 'undefined' && Draw.redraw) Draw.redraw();
      return;
    }
    if (ticket && typeof LiveDesk !== 'undefined'){
      const d = this.read(rail);
      const other = rail.querySelector('.wsGrip.' + (kind === 'sl' ? 'tp' : 'sl') + ':not(.empty)');
      const otherPrice = other ? this.priceOf(rail, other) : 0;
      const sl = kind === 'sl' ? price : otherPrice, tp = kind === 'tp' ? price : otherPrice;
      if (!(sl > 0)) return toast('A real position must keep a stop', 'warn');
      if (!confirm('REAL position #' + ticket + ': tell the broker to set the ' + (kind === 'sl' ? 'stop' : 'target') + ' to ' + fmtPrice(price) + '?\n\n' +
                   (kind === 'sl' ? 'If it is hit: ' : 'If it is reached: ') + (this.money(d, price) >= 0 ? '+' : '') + fmtNum(this.money(d, price)))){
        toast('Nothing was sent', 'info'); if (typeof LiveDesk.refreshPositions === 'function') LiveDesk.refreshPositions();
        return;
      }
      LiveDesk.modify(+ticket, sl, tp > 0 ? tp : 0, 'moved on the rail').then(() => {
        if (typeof Live !== 'undefined' && Live.sync) Live.sync();
        if (typeof LiveDesk.refreshPositions === 'function') LiveDesk.refreshPositions();
      });
    }
  },
};
document.addEventListener('DOMContentLoaded', () => PriceRail.init());
