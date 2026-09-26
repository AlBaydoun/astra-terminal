/* ASTRA Terminal — open positions ON the chart, and the "Today" card.

   PosLines draws every open paper position for the chart's instrument on the
   drawing canvas: entry, stop and target as lines with labels, the risk zone
   shaded red and the reward zone green, from the candle it opened on to the
   right edge. The stop and target can be DRAGGED; letting go hands the new
   price to Bots.editPos, which applies exactly the same rules as the Open
   Trades page (so a refused move snaps back and says why).

   Today explains the instrument's day in plain words, with a small heat-map
   of its market group. Read only. */
const PosLines = {
  on: lsGet('astra_poslines', true) !== false,
  drag: null,          // { bot, id, which:'sl'|'tp', price }
  pending: null,       // a dragged level waiting for your Apply / Cancel
  focus: null,         // 'bot:id' opened from a bot page — drawn thicker for a while
  timer: null,
  COL: { sl: '#f6465d', tp: '#2ebd85', entry: '#8fa3c8', trail: '#ffd166', real: '#ffb03a' },

  /* the trailing stop of a position, if it has one: where it switches on,
     and — once on — where it sits right now, following the best price */
  trailOf(r){
    if (r.live) return typeof LiveDesk !== 'undefined' ? LiveDesk.trailInfo(r) : null;
    const p = r.p;
    const trail = p.trail !== undefined ? p.trail : ((Bots.cfg(r.bot) || {}).trail || null);
    if (!trail) return null;
    const R1 = p.stopDist || Math.abs(p.entry - (p.slInit || p.sl));
    if (!(R1 > 0)) return null;
    const startR = trail.start != null ? trail.start : 1, gapR = trail.gap != null ? trail.gap : 0.5;
    const arm = p.entry + p.dir * startR * R1;                    /* price where it switches on */
    const peak = p.peak != null ? p.peak : null;
    const gainR = peak != null ? (peak - p.entry) * p.dir / R1 : 0;
    const on = p.trailed || gainR >= startR;
    const level = on && peak != null ? peak - p.dir * gapR * R1 : null;   /* where the stop would sit now */
    return { startR, gapR, arm, on, level, peak, R1 };
  },

  rows(){
    if (!this.on || typeof Bots === 'undefined' || typeof OpenTrades === 'undefined') return [];
    const key = s => typeof Feed !== 'undefined' ? Feed.brokerName(s) : s;
    const here = key(STORE.symbol);
    const paper = OpenTrades.all().filter(r => key(r.p.sym) === here);
    /* the REAL positions on the account are drawn too — gold, marked REAL —
       and a dragged level on one of those is sent to the broker */
    const real = typeof LiveDesk !== 'undefined' ? LiveDesk.chartRows().filter(r => key(r.p.sym) === here) : [];
    return paper.concat(real);
  },
  /* the live half of a row, paper or real */
  liveOf(r){ return r.live ? LiveDesk.liveOf(r) : OpenTrades.live(r); },
  /* the position behind a bot:id pair, paper or real */
  posOf(bot, id){
    if (String(id).startsWith('T')){
      const r = typeof LiveDesk !== 'undefined' ? LiveDesk.chartRows().find(x => x.bot === bot && x.p.id === id) : null;
      return r ? { p: r.p, row: r, live: true } : null;
    }
    const L = Bots.ledgers[bot]; const p = L && L.open.find(x => x.id === id);
    return p ? { p, row: OpenTrades.all().find(r => r.bot === bot && r.p.id === id) || null, live: false } : null;
  },

  /* From a bot page or Open Trades: jump to the chart of that trade with
     its stop and target drawn and ready to drag. */
  show(bot, id){
    const L = Bots.ledgers[bot];
    const p = L && L.open.find(x => x.id === id);
    if (!p) return toast('That position is no longer open', 'info');
    if (!this.on){ this.on = true; lsSet('astra_poslines', true); }
    this.focus = bot + ':' + id;
    this.cancelPending();
    if (typeof WorkspaceUI !== 'undefined') WorkspaceUI.openChart(p.sym); else App.setSymbol(p.sym);
    this.sync();
    toast((p.dir > 0 ? 'BUY ' : 'SELL ') + baseAsset(p.sym) + ' is on the chart — drag the red stop or the green target, then confirm', 'ok');
    setTimeout(() => { if (this.focus === bot + ':' + id) this.focus = null; if (typeof Draw !== 'undefined') Draw.redraw(); }, 20000);
  },

  toggle(){
    this.on = !this.on;
    lsSet('astra_poslines', this.on);
    this.sync();
    if (typeof Draw !== 'undefined') Draw.redraw();
    toast(this.on ? 'Open positions are shown on the chart — drag a stop or target to move it' : 'Open positions hidden from the chart', 'info');
  },

  /* keep the labels' P/L moving while something is open */
  sync(){
    const btn = document.getElementById('posLinesBtn');
    if (btn) btn.classList.toggle('on', this.on);
    const want = this.on && this.rows().length > 0;
    this.panel();
    if (want && !this.timer) this.timer = setInterval(() => { if (!this.drag && typeof Draw !== 'undefined') Draw.redraw(); }, 1500);
    if (!want && this.timer){ clearInterval(this.timer); this.timer = null; }
  },

  /* ---------- the "on this chart" panel ----------
     A real HTML strip in the chart's corner with one row per open trade on
     this instrument and a big "Close at market" button. The small ✕ drawn on
     the canvas can hide under candle labels or another trade's label; this
     one is always on top and always clickable. */
  panelFold: lsGet('astra_pospanel_fold', false) === true,
  panel(){
    const wrap = document.getElementById('mainWrap');
    if (!wrap) return;
    let el = document.getElementById('posPanel');
    const rows = this.on ? this.rows() : [];
    if (!rows.length){ if (el) el.remove(); return; }
    if (!el){
      wrap.insertAdjacentHTML('beforeend', '<div id="posPanel" class="posPanel"></div>');
      el = document.getElementById('posPanel');
      /* the chart underneath must not pan or start a drawing from a click here */
      ['mousedown', 'pointerdown', 'wheel', 'dblclick'].forEach(t => el.addEventListener(t, e => e.stopPropagation()));
      el.addEventListener('click', e => {
        const b = e.target.closest('[data-ppclose],[data-ppfold],[data-ppfocus]');
        if (!b) return;
        if (b.hasAttribute('data-ppfold')){ this.panelFold = !this.panelFold; lsSet('astra_pospanel_fold', this.panelFold); this._panelSig = ''; return this.panel(); }
        const [bot, id] = (b.dataset.ppclose || b.dataset.ppfocus).split('|');
        const pid = /^T/.test(id) ? id : +id;
        if (b.hasAttribute('data-ppclose')) return this.confirmClose(bot, pid);
        this.focus = bot + ':' + pid; if (typeof Draw !== 'undefined') Draw.redraw();
        setTimeout(() => { if (this.focus === bot + ':' + pid){ this.focus = null; if (typeof Draw !== 'undefined') Draw.redraw(); } }, 8000);
      });
    }
    const fmtC = v => (v >= 0 ? '+' : '') + fmtNum(v);
    /* the focused trade (opened from Open Trades) comes first */
    const sorted = rows.slice().sort((a, b) => (this.focus === b.bot + ':' + b.p.id) - (this.focus === a.bot + ':' + a.p.id));
    const items = sorted.map(r => {
      const p = r.p, l = this.liveOf(r) || { unreal: 0 };
      const key = r.bot + '|' + p.id, hot = this.focus === r.bot + ':' + p.id;
      return { key, hot, html: `<div class="ppRow${r.live ? ' real' : ''}${hot ? ' hot' : ''}">
        <button class="ppWho" data-ppfocus="${esc(key)}" title="Highlight this trade on the chart">
          <b class="${p.dir > 0 ? 'up' : 'down'}">${r.live ? 'REAL ' : ''}${p.dir > 0 ? 'BUY' : 'SELL'}</b> ${esc(p.lots ? p.lots + ' lot' : fmtNum(p.qty))} · <span>${esc(r.botName || r.bot)}</span></button>
        <i class="${l.unreal >= 0 ? 'up' : 'down'}">${fmtC(l.unreal)}</i>
        <button class="ppClose" data-ppclose="${esc(key)}" title="Close this trade at the market price now — you confirm first">✕ Close at market</button>
      </div>` };
    });
    const head = `<div class="ppHead"><span>${rows.length} open trade${rows.length > 1 ? 's' : ''} on this chart</span><button data-ppfold title="${this.panelFold ? 'Show' : 'Fold'}">${this.panelFold ? '▸' : '▾'}</button></div>`;
    const html = head + (this.panelFold ? '' : items.map(i => i.html).join(''));
    if (html !== this._panelSig){ el.innerHTML = html; this._panelSig = html; }
  },

  /* ---------- drawing ---------- */
  yOf(price){ const y = Chart.priceSeries.priceToCoordinate(price); return y == null ? null : y; },
  /* Broker candles are stamped in the broker's own clock (a few whole hours
     from UTC); positions are stamped in real time. The difference is learned
     from any chart whose candles are an hour or shorter and remembered. */
  tfSec(){ const m = /^(\d+)([smhdw])$/.exec(STORE.tf || ''); if (!m) return 900; return +m[1] * { s: 1, m: 60, h: 3600, d: 86400, w: 604800 }[m[2]]; },
  serverShift(){
    const raw = Chart.raw || [];
    if (raw.length && this.tfSec() <= 3600 && typeof Feed !== 'undefined' && Feed.srcOf[STORE.symbol] === 'bridge'){
      const last = raw[raw.length - 1].rawTime, now = Math.floor(Date.now() / 1000);
      const shift = Math.round((last - now) / 3600) * 3600;
      if (Math.abs(shift) <= 14 * 3600){ this._shift = shift; lsSet('astra_servershift', shift); }
    }
    if (this._shift == null) this._shift = lsGet('astra_servershift', 0) || 0;
    return typeof Feed !== 'undefined' && Feed.srcOf[STORE.symbol] === 'bridge' ? this._shift : 0;
  },
  xOf(pos){
    const t = Math.floor(pos.entryTime / 1000) + this.serverShift() + (typeof TZ_OFF !== 'undefined' ? TZ_OFF : 0);
    let x = null;
    try {
      /* the chart only maps whole bar indexes; interpolate between the two */
      const l = Draw.logicalFor(t);
      if (l != null){
        const ts = Chart.main.timeScale(), a = Math.floor(l), b = a + 1;
        const xa = ts.logicalToCoordinate(a), xb = ts.logicalToCoordinate(b);
        if (xa != null && xb != null) x = xa + (xb - xa) * (l - a);
      }
    } catch(e){ x = null; }
    return x == null || isNaN(x) ? 0 : Math.max(0, x);
  },

  closeBtns: [],
  draw(ctx){
    const rows = this.rows();
    this.closeBtns = [];
    this.sync();
    if (!rows.length || !Chart.priceSeries) return;
    const W = Draw.cssW, right = W - 2;
    ctx.save();
    ctx.font = '11px ' + (getComputedStyle(document.body).getPropertyValue('--font-mono') || 'monospace');
    for (const r of rows){
      const p = r.p, l = this.liveOf(r);
      const entryCol = r.live ? this.COL.real : this.COL.entry;
      const live = [this.drag, this.pending].find(d => d && d.bot === r.bot && d.id === p.id) || null;
      const dragging = live;
      const sl = dragging && dragging.which === 'sl' ? dragging.price : p.sl;
      const tp = dragging && dragging.which === 'tp' ? dragging.price : p.tp;
      const hot = this.focus === r.bot + ':' + p.id;
      const x0 = this.xOf(p);
      const yE = this.yOf(p.entry), yS = sl > 0 ? this.yOf(sl) : null, yT = tp > 0 ? this.yOf(tp) : null;
      if (yE == null) continue;
      /* zones */
      if (yS != null){ ctx.fillStyle = 'rgba(246,70,93,.10)'; ctx.fillRect(x0, Math.min(yE, yS), right - x0, Math.abs(yS - yE)); }
      if (yT != null){ ctx.fillStyle = 'rgba(46,189,133,.10)'; ctx.fillRect(x0, Math.min(yE, yT), right - x0, Math.abs(yT - yE)); }
      /* lines */
      /* the lines span the WHOLE chart, so a stop or target can be read against
         every earlier high and low like a level; only the shaded zones start
         at the candle the trade opened on */
      const line = (y, color, dash, w) => {
        ctx.beginPath(); ctx.setLineDash(dash); ctx.lineWidth = w; ctx.strokeStyle = color;
        ctx.moveTo(0, y); ctx.lineTo(right, y); ctx.stroke(); ctx.setLineDash([]);
      };
      line(yE, entryCol, [4, 3], hot || r.live ? 2 : 1);
      if (yS != null) line(yS, this.COL.sl, [], (dragging && dragging.which === 'sl') || hot ? 2.5 : 1.5);
      if (yT != null) line(yT, this.COL.tp, [], (dragging && dragging.which === 'tp') || hot ? 2.5 : 1.5);
      /* labels, on the left of the line */
      const side = p.dir > 0 ? 'BUY' : 'SELL';
      const money = (price) => {
        const v = (price - p.entry) * p.dir * p.qty * BotEngine.cashRate(p, true);
        return (v >= 0 ? '+' : '') + fmtNum(v);
      };
      const lx = 6;
      const box = this.label(ctx, lx, yE, (r.live ? 'REAL ' : '') + side + ' ' + (p.lots ? p.lots + ' lot' : fmtNum(p.qty)) + ' · ' + r.botName + ' · ' + (l.unreal >= 0 ? '+' : '') + fmtNum(l.unreal), entryCol, true);
      /* a small ✕ CLOSE button glued to the entry label */
      const cb = { x: box.x + box.w + 4, y: box.y, w: 58, h: box.h, bot: r.bot, id: p.id };
      ctx.fillStyle = 'rgba(246,70,93,.18)'; ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
      ctx.strokeStyle = this.COL.sl; ctx.strokeRect(cb.x + .5, cb.y + .5, cb.w - 1, cb.h - 1);
      ctx.fillStyle = '#ffb3bd'; ctx.textBaseline = 'middle'; ctx.fillText('✕ close', cb.x + 6, cb.y + cb.h / 2);
      this.closeBtns.push(cb);
      const tail = which => (this.drag && this.drag.which === which && dragging === this.drag) ? '  ← release, then confirm'
        : (this.pending && dragging === this.pending && this.pending.which === which) ? '  · waiting for your confirmation' : '  ⇕';
      if (yS != null) this.label(ctx, lx, yS, 'SL ' + fmtPrice(sl) + ' · ' + money(sl) + tail('sl'), this.COL.sl, yS > yE);
      if (yT != null) this.label(ctx, lx, yT, 'TP ' + fmtPrice(tp) + ' · ' + money(tp) + tail('tp'), this.COL.tp, yT > yE);
      /* the trailing stop: dotted amber. Before it engages, the line marks the
         price that switches it on; once engaged, the stop itself is the trail
         (drawn red above) and the amber line shows the peak it follows. */
      const tr = this.trailOf(r);
      if (tr){
        if (!tr.on){
          const yA = this.yOf(tr.arm);
          if (yA != null){
            line(yA, this.COL.trail, [2, 4], 1);
            this.label(ctx, W * 0.45, yA, tr.text || ('TRAIL arms at ' + fmtPrice(tr.arm) + ' (' + tr.startR + 'R) · gap ' + tr.gapR + 'R'), this.COL.trail, p.dir < 0);
          }
        } else if (tr.peak != null){
          const yP = this.yOf(tr.peak);
          if (yP != null){
            line(yP, this.COL.trail, [2, 4], 1);
            this.label(ctx, W * 0.45, yP, tr.text || ('TRAILING · best ' + fmtPrice(tr.peak) + ' · gap ' + tr.gapR + 'R'), this.COL.trail, p.dir < 0);
          }
          if (tr.level != null && r.live){
            /* where the desk will put the real stop next */
            const yL = this.yOf(tr.level);
            if (yL != null){ line(yL, this.COL.trail, [1, 3], 1); this.label(ctx, W * 0.45, yL, 'stop follows to ' + fmtPrice(tr.level), this.COL.trail, yL > yE); }
          }
          if (yS != null) this.label(ctx, W * 0.45, yS, 'trailing stop', this.COL.trail, yS > yE);
        }
      }
    }
    ctx.restore();
  },

  label(ctx, x, y, text, color, below){
    const w = ctx.measureText(text).width + 10, h = 16;
    x = Math.max(2, Math.min(x, Draw.cssW - w - 4));      /* keep the whole label on the canvas */
    const yy = below ? y + 2 : y - h - 2;
    ctx.fillStyle = 'rgba(8,13,28,.85)'; ctx.fillRect(x, yy, w, h);
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.strokeRect(x + .5, yy + .5, w - 1, h - 1);
    ctx.fillStyle = color; ctx.textBaseline = 'middle'; ctx.fillText(text, x + 5, yy + h / 2);
    return { x, y: yy, w, h };
  },
  closeBtnAt(x, y){ return this.closeBtns.find(b => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) || null; },

  /* ---------- grabbing a stop or a target ---------- */
  hit(x, y){
    if (!this.on || !Chart.priceSeries) return null;
    for (const r of this.rows()){
      const p = r.p;
      for (const which of ['sl', 'tp']){
        const price = p[which];
        if (!(price > 0)) continue;
        const ly = this.yOf(price);
        if (ly != null && Math.abs(ly - y) <= 6) return { bot: r.bot, id: p.id, which, price, live: !!r.live, ticket: r.ticket };
      }
    }
    return null;
  },
  hover(x, y){ return this.closeBtnAt(x, y) ? 'pointer' : this.hit(x, y) ? 'ns-resize' : ''; },

  /* called from Draw's mousedown; true = we took the event */
  mousedown(e, x, y){
    const cb = this.closeBtnAt(x, y);
    if (cb){ this.confirmClose(cb.bot, cb.id); return true; }
    const h = this.hit(x, y);
    if (!h) return false;
    this.drag = Object.assign({}, h);        /* a copy — h keeps the price it started from */
    document.body.style.cursor = 'ns-resize';
    const canvas = document.getElementById('drawLayer');
    const move = ev => {
      const rr = canvas.getBoundingClientRect();
      const price = Chart.priceSeries.coordinateToPrice(ev.clientY - rr.top);
      if (price != null && price > 0){ this.drag.price = price; Draw.redraw(); }
    };
    const up = () => {
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('mouseup', up, true);
      document.body.style.cursor = '';
      const d = this.drag; this.drag = null;
      if (d && Math.abs(d.price - h.price) > 0) this.confirm(d, h.price);
      Draw.redraw();
    };
    window.addEventListener('mousemove', move, true);
    window.addEventListener('mouseup', up, true);
    return true;
  },
};

/* ---------- the confirmation box ----------
   Nothing is written to the bot's trade until you press Apply. */
PosLines.confirm = function(d, was){
  this.cancelPending();
  const found = this.posOf(d.bot, d.id); const p = found && found.p;
  if (!p) return;
  if (d.live && (!Live.state || !Live.state.linked || !Live.bridge.trading)){
    Draw.redraw();
    return toast('That is a REAL position — the live bridge must be running and linked before its levels can be changed', 'warn');
  }
  this.pending = d;
  const cash = price => (price - p.entry) * p.dir * p.qty * BotEngine.cashRate(p, true);
  const fmtC = v => (v >= 0 ? '+' : '') + fmtNum(v);
  const isSL = d.which === 'sl';
  const wrap = document.getElementById('mainWrap');
  const y = Chart.priceSeries.priceToCoordinate(d.price) || 0;
  const bot = (BOT_BY_ID[d.bot] || {}).name || d.bot;
  wrap.insertAdjacentHTML('beforeend', `<div id="posConfirm" class="posConfirm" style="top:${Math.max(8, Math.min(wrap.clientHeight - 120, y + 10))}px">
    <b>${isSL ? 'Move the stop' : 'Move the target'} · ${p.dir > 0 ? 'BUY' : 'SELL'} ${esc(baseAsset(p.sym))} <small>${esc(bot)}</small></b>
    <div class="pcRow"><span>${isSL ? 'Stop' : 'Target'}</span><i>${fmtPrice(was)}</i><em>→</em><i class="${isSL ? 'down' : 'up'}">${fmtPrice(d.price)}</i></div>
    <div class="pcRow"><span>${isSL ? 'Loss if hit' : 'Profit if hit'}</span><i>${fmtC(cash(was))}</i><em>→</em><i class="${cash(d.price) >= 0 ? 'up' : 'down'}">${fmtC(cash(d.price))}</i></div>
    <div class="pcRow"><span>From the price now</span><i>${(Math.abs(d.price - (Bots.quoteFor(p.sym) || { price: p.entry }).price) / (Bots.quoteFor(p.sym) || { price: p.entry }).price * 100).toFixed(2)}%</i></div>
    <div class="pcBtns"><button class="bMini ${d.live ? 'danger' : 'go'}" data-pcapply>${d.live ? 'Send to the broker' : 'Apply to the trade'}</button><button class="bMini" data-pccancel>Cancel</button></div>
    <small class="dim2">${d.live ? 'REAL position #' + d.ticket + ' — the broker is told to move the level; it holds with this PC off.' : 'The trade will be marked “adjusted” in the bot’s record.'}</small>
  </div>`);
  const box = document.getElementById('posConfirm');
  if (d.live) box.classList.add('real');
  box.querySelector('[data-pcapply]').addEventListener('click', async () => {
    const patch = {}; patch[d.which] = d.price;
    box.remove(); this.pending = null;
    if (d.live){
      const sl = d.which === 'sl' ? d.price : p.sl, tp = d.which === 'tp' ? d.price : (p.tp || 0);
      await LiveDesk.modify(d.ticket, sl, tp, 'moved on the chart');
      await Live.sync();
    } else await Bots.editPos(d.bot, d.id, patch);      /* the same rules as the Open Trades page */
    Draw.redraw();
  });
  box.querySelector('[data-pccancel]').addEventListener('click', () => this.cancelPending());
  Draw.redraw();
};
/* close at market, from the chart — confirmed first, like a moved level */
PosLines.confirmClose = function(bot, id){
  this.cancelPending();
  const found = this.posOf(bot, id); const p = found && found.p;
  if (!p) return;
  const real = found.live;
  if (real && (!Live.state || !Live.state.linked || !Live.bridge.trading))
    return toast('That is a REAL position — the live bridge must be running and linked before it can be closed from here', 'warn');
  const q = Bots.quoteFor(p.sym) || (real ? { price: found.row.raw.price_current } : null);
  if (!q) return toast('No live price to close ' + baseAsset(p.sym) + ' against — check the bridge', 'warn');
  const row = found.row;
  const l = row ? this.liveOf(row) : { unreal: 0 };
  const fmtC = v => (v >= 0 ? '+' : '') + fmtNum(v);
  const wrap = document.getElementById('mainWrap');
  const y = Chart.priceSeries.priceToCoordinate(p.entry) || 0;
  const botName = (BOT_BY_ID[bot] || {}).name || bot;
  if (!wrap) return;
  wrap.insertAdjacentHTML('beforeend', `<div id="posConfirm" class="posConfirm" style="top:${Math.max(8, Math.min(wrap.clientHeight - 120, y + 10))}px">
    <b>${real ? 'Close the REAL position · ' : 'Close at market · '}${p.dir > 0 ? 'BUY' : 'SELL'} ${esc(baseAsset(p.sym))} <small>${esc(botName)}</small></b>
    <div class="pcRow"><span>Size</span><i>${p.lots ? p.lots + ' lot' : fmtNum(p.qty)}</i><em></em><i></i></div>
    <div class="pcRow"><span>Entry → price now</span><i>${fmtPrice(p.entry)}</i><em>→</em><i>${fmtPrice(q.price)}</i></div>
    <div class="pcRow"><span>Result if closed now</span><i></i><em></em><i class="${l.unreal >= 0 ? 'up' : 'down'}">${fmtC(l.unreal)}</i></div>
    <div class="pcBtns"><button class="bMini danger" data-pcclose>Close now · ${fmtC(l.unreal)}</button><button class="bMini" data-pccancel>Cancel</button></div>
    <small class="dim2">${real ? 'REAL position #' + found.row.ticket + ' — the broker closes it at the market price now.' : 'Closes the paper position at the live price. The bot\'s record will show “closed by operator”.'}</small>
  </div>`);
  const box = document.getElementById('posConfirm');
  if (real) box.classList.add('real');
  box.querySelector('[data-pcclose]').addEventListener('click', async () => {
    box.remove();
    if (real) await LiveDesk.closeTicket(found.row.ticket, 'closed from the chart');
    else {
      await Bots.closePos(bot, id, 'the chart');
      if (!this.posOf(bot, id)) toast((p.dir > 0 ? 'BUY ' : 'SELL ') + baseAsset(p.sym) + ' closed at the market · ' + fmtC(l.unreal), l.unreal >= 0 ? 'ok' : 'warn');
    }
    this._panelSig = ''; this.panel();
    Draw.redraw();
  });
  box.querySelector('[data-pccancel]').addEventListener('click', () => this.cancelPending());
};
PosLines.cancelPending = function(){
  const box = document.getElementById('posConfirm');
  if (box) box.remove();
  if (this.pending){ this.pending = null; if (typeof Draw !== 'undefined') Draw.redraw(); }
};
document.addEventListener('keydown', e => { if (e.key === 'Escape') PosLines.cancelPending(); });

/* =================== "Today" for the chart's instrument =================== */
const TodayCard = {
  open: false,
  toggle(){ this.open ? this.hide() : this.show(); },
  hide(){ this.open = false; const el = document.getElementById('todayCard'); if (el) el.remove(); if (this.timer){ clearInterval(this.timer); this.timer = null; } },
  timer: null, sym: '',
  watch(){
    if (this.timer) return;
    this.timer = setInterval(() => { if (this.open && (STORE.symbol !== this.sym || STORE.tf !== this.tf)) this.show(); }, 1500);
  },

  dayStats(v){
    if (!v || v.length < 5) return null;
    const last = v[v.length - 1];
    /* "today" is YOUR calendar day: broker candle clocks are moved back to
       real time, then to local time */
    const shift = typeof PosLines !== 'undefined' ? PosLines.serverShift() : 0;
    const off = typeof TZ_OFF !== 'undefined' ? TZ_OFF : 0;
    const dayOf = c => Math.floor((c.rawTime - shift + off) / 86400);
    const today = dayOf(last);
    const bars = v.filter(c => dayOf(c) === today);
    if (!bars.length) return null;
    const open = bars[0].open, hi = Math.max(...bars.map(c => c.high)), lo = Math.min(...bars.map(c => c.low));
    const px = last.close;
    const vol = bars.reduce((a, c) => a + (c.volume || 0), 0);
    /* the same number of bars on each of the previous days, for a fair volume comparison */
    const prevDays = {};
    for (const c of v){ const d = dayOf(c); if (d !== today) (prevDays[d] = prevDays[d] || []).push(c); }
    const prevVols = Object.values(prevDays).map(list => list.slice(0, bars.length).reduce((a, c) => a + (c.volume || 0), 0)).filter(x => x > 0);
    const volAvg = prevVols.length ? prevVols.reduce((a, b) => a + b, 0) / prevVols.length : 0;
    const prevClose = (() => { const before = v.filter(c => dayOf(c) < today); return before.length ? before[before.length - 1].close : open; })();
    const atr = IND.atr(v, 14)[v.length - 1] || 0;
    const closes = v.map(c => c.close);
    const e20 = IND.ema(closes, 20), e100 = IND.ema(closes, 100), i = v.length - 1;
    const trend = e20[i] > e100[i] ? 'up' : e20[i] < e100[i] ? 'down' : 'flat';
    const rsi = IND.rsi(closes, 14)[i];
    return { open, hi, lo, px, prevClose, bars: bars.length, vol, volAvg, atr, trend, rsi,
      chg: prevClose ? (px - prevClose) / prevClose * 100 : 0,
      range: hi > lo ? (px - lo) / (hi - lo) : 0.5,
      rangePct: lo > 0 ? (hi - lo) / lo * 100 : 0 };
  },

  words(s, sym){
    const name = baseAsset(sym);
    const dir = s.chg > 0.05 ? 'up' : s.chg < -0.05 ? 'down' : 'flat';
    const size = Math.abs(s.chg) > 2 ? 'a big move' : Math.abs(s.chg) > 0.7 ? 'a solid move' : Math.abs(s.chg) > 0.2 ? 'a modest move' : 'barely moved';
    const where = s.range > 0.8 ? 'near the top of today’s range' : s.range < 0.2 ? 'near the bottom of today’s range' : s.range > 0.6 ? 'in the upper part of the range' : s.range < 0.4 ? 'in the lower part of the range' : 'in the middle of the range';
    const vol = !s.volAvg ? '' : s.vol > s.volAvg * 1.4 ? ' Activity is high — ' + (s.vol / s.volAvg).toFixed(1) + '× the usual for this time of day.'
      : s.vol < s.volAvg * 0.6 ? ' Activity is quiet — ' + (s.vol / s.volAvg).toFixed(1) + '× the usual for this time of day.' : ' Activity is about normal.';
    const rangeNote = s.atr > 0 && s.lo > 0 ? ' Today’s range is ' + ((s.hi - s.lo) / s.atr).toFixed(1) + ' ATR wide.' : '';
    const trend = s.trend === 'up' ? 'The short-term trend on this chart is up (EMA20 above EMA100)' : s.trend === 'down' ? 'The short-term trend on this chart is down (EMA20 below EMA100)' : 'The short-term trend is flat';
    const rsi = s.rsi == null ? '' : s.rsi >= 70 ? ' and RSI is stretched high (' + s.rsi.toFixed(0) + ') — a pullback would not be a surprise.' : s.rsi <= 30 ? ' and RSI is stretched low (' + s.rsi.toFixed(0) + ') — a bounce would not be a surprise.' : ' with RSI at ' + s.rsi.toFixed(0) + ', nothing stretched.';
    return `${name} is ${dir === 'flat' ? 'flat' : dir + ' ' + Math.abs(s.chg).toFixed(2) + '%'} today against yesterday’s close — ${size}. It is trading ${where}.${vol}${rangeNote} ${trend}${rsi}`;
  },

  peers(sym){
    if (typeof BROKER === 'undefined') return [];
    const item = BROKER.map[sym] || BROKER.map[typeof Feed !== 'undefined' ? Feed.brokerName(sym) : sym];
    const group = item ? item.group : (typeof MK !== 'undefined' ? MK.group(sym) : null);
    if (!group) return [];
    return BROKER.byGroup(group).map(s => {
      const t = STORE.tickers.get(s) || STORE.tickers.get(typeof Feed !== 'undefined' ? Feed.brokerName(s) : s);
      return t && Number.isFinite(t.pct) ? { sym: s, pct: t.pct } : null;
    }).filter(Boolean).sort((a, b) => b.pct - a.pct).slice(0, 24);
  },

  show(){
    const v = Chart.view();
    const s = this.dayStats(v);
    const sym = STORE.symbol;
    const keepTimer = this.timer; this.timer = null;
    this.hide();
    this.timer = keepTimer;
    this.open = true; this.sym = STORE.symbol; this.tf = STORE.tf;
    this.watch();
    const host = document.getElementById('chartArea');
    if (!host) return;
    const heat = this.peers(sym);
    const tile = h => {
      const a = Math.min(1, Math.abs(h.pct) / 3);
      const bg = h.pct >= 0 ? `rgba(46,189,133,${0.15 + a * 0.6})` : `rgba(246,70,93,${0.15 + a * 0.6})`;
      return `<button class="tdTile${h.sym === sym ? ' me' : ''}" style="background:${bg}" data-tdsym="${esc(h.sym)}" title="Open ${esc(h.sym)}"><b>${esc(baseAsset(h.sym))}</b><span>${(h.pct >= 0 ? '+' : '') + h.pct.toFixed(2)}%</span></button>`;
    };
    const stat = (k, val, cls) => `<div class="tdStat"><span>${k}</span><b class="${cls || ''}">${val}</b></div>`;
    const bar = document.getElementById('chartLabelBar');
    (bar || host).insertAdjacentHTML(bar ? 'afterend' : 'afterbegin', `<div id="todayCard" class="todayCard">
      <div class="tdHead"><b>${esc(baseAsset(sym))} · TODAY</b><span class="dim2">${STORE.tf} chart · ${s ? s.bars + ' candles so far' : ''}</span><button class="mClose" data-tdclose>×</button></div>
      ${s ? `<p class="tdWords">${esc(this.words(s, sym))}</p>
      <div class="tdStats">
        ${stat('Change', (s.chg >= 0 ? '+' : '') + s.chg.toFixed(2) + '%', s.chg >= 0 ? 'up' : 'down')}
        ${stat('Open', fmtPrice(s.open))}${stat('High', fmtPrice(s.hi))}${stat('Low', fmtPrice(s.lo))}${stat('Now', fmtPrice(s.px))}
        ${stat('Range', s.rangePct.toFixed(2) + '%')}
        ${stat('Position in range', Math.round(s.range * 100) + '%')}
        ${s.volAvg ? stat('Activity vs usual', (s.vol / s.volAvg).toFixed(2) + '×', s.vol > s.volAvg ? 'up' : '') : ''}
        ${stat('Trend', s.trend, s.trend === 'up' ? 'up' : s.trend === 'down' ? 'down' : '')}
        ${s.rsi != null ? stat('RSI 14', s.rsi.toFixed(0)) : ''}
      </div>
      <div class="tdRange"><i style="left:${(s.range * 100).toFixed(1)}%"></i></div>` : '<p class="tdWords">Not enough candles loaded to describe today yet.</p>'}
      ${heat.length ? `<div class="tdHeatHead">Its market group right now <span class="dim2">— day change, click a tile to open it</span></div><div class="tdHeat">${heat.map(tile).join('')}</div>` : ''}
    </div>`);
    const card = document.getElementById('todayCard');
    card.querySelector('[data-tdclose]').addEventListener('click', () => this.hide());
    card.querySelectorAll('[data-tdsym]').forEach(b => b.addEventListener('click', () => App.setSymbol(b.dataset.tdsym)));
  },
};

/* =================== folding the strip above the chart =================== */
const ChartStrip = {
  folded: lsGet('astra_stripfold', false) === true,
  apply(){
    document.body.classList.toggle('stripFolded', this.folded);
    const b = document.getElementById('stripFoldBtn');
    if (b){ b.textContent = this.folded ? '▸' : '▾'; b.title = this.folded ? 'Show the chart tools and labels' : 'Fold the chart tools and labels away'; }
    if (this.folded && typeof TodayCard !== 'undefined') TodayCard.hide();
    setTimeout(() => { try { Chart.resize && Chart.resize(); } catch(e){} try { Draw.resize(); Draw.redraw(); } catch(e){} }, 60);
  },
  toggle(){ this.folded = !this.folded; lsSet('astra_stripfold', this.folded); this.apply(); },
};

document.addEventListener('DOMContentLoaded', () => {
  const bar = document.getElementById('chartLabelBar');
  if (bar && !document.getElementById('stripFoldBtn')){
    bar.insertAdjacentHTML('afterbegin', `<button id="stripFoldBtn" class="bMini stripFold" title="Fold the chart tools and labels away">▾</button>`);
    document.getElementById('stripFoldBtn').addEventListener('click', () => ChartStrip.toggle());
    ChartStrip.apply();
  }
  if (bar && !document.getElementById('posLinesBtn')){
    bar.insertAdjacentHTML('beforeend',
      `<span class="chartTools"><button id="posLinesBtn" class="bMini${PosLines.on ? ' on' : ''}" title="Show every open position on this chart — drag a stop or target to move it">Positions on chart</button>` +
      `<button id="todayBtn" class="bMini" title="How this instrument has been doing today, with a heat-map of its market group">Today</button></span>`);
    document.getElementById('posLinesBtn').addEventListener('click', () => PosLines.toggle());
    document.getElementById('todayBtn').addEventListener('click', () => TodayCard.toggle());
  }
});
