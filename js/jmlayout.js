/* ASTRA Terminal — move things on the chart.

   Result cards (Forecast, Structure, Proven, SuperTrend, Regime, Signals, and any
   later one using .fcCard or .pcCard) can be dragged anywhere on the chart. Each
   remembers its place, measured from the nearest side, so it stays on that side
   when the window changes size. Double-click a card to send it home.

   The ✦ buttons can be dragged into any order; each keeps its ⚙ with it. The
   ↺ button puts every card and button back. */
const JMLayout = {
  KEY: 'astra_card_places', ORDER_KEY: 'astra_button_order', CARDS: '.fcCard, .pcCard',
  SKIP: 'button, a, input, select, textarea, label, summary',
  BTN: 'button.autoSrBtn[id]',
  places(){ return lsGet(this.KEY, {}) || {}; },
  wrap(){ return document.getElementById('mainWrap'); },

  apply(el){
    const p = this.places()[el.id], W = this.wrap();
    if (!p || !W) return;
    const maxX = Math.max(0, W.clientWidth - el.offsetWidth), maxY = Math.max(0, W.clientHeight - el.offsetHeight);
    const x = Math.min(p.x, maxX), y = Math.min(p.y, maxY), s = el.style;
    s.left = p.h === 'l' ? x + 'px' : 'auto'; s.right = p.h === 'r' ? x + 'px' : 'auto';
    s.top = p.v === 't' ? y + 'px' : 'auto'; s.bottom = p.v === 'b' ? y + 'px' : 'auto';
  },
  applyAll(){ const W = this.wrap(); if (W) W.querySelectorAll(this.CARDS).forEach(el => this.apply(el)); },
  home(el){
    ['left', 'right', 'top', 'bottom'].forEach(k => { el.style[k] = ''; });
    if (el.id === 'jmSigCard'){ el.style.left = '12px'; el.style.right = 'auto'; el.style.top = '52px'; }
  },

  remember(el){
    const W = this.wrap().getBoundingClientRect(), r = el.getBoundingClientRect();
    const left = r.left - W.left, right = W.right - r.right, top = r.top - W.top, bottom = W.bottom - r.bottom;
    const all = this.places();
    all[el.id] = { h: left <= right ? 'l' : 'r', x: Math.round(Math.max(0, Math.min(left, right))),
                   v: top <= bottom ? 't' : 'b', y: Math.round(Math.max(0, Math.min(top, bottom))) };
    lsSet(this.KEY, all);
    this.apply(el);
  },

  bindCards(){
    const W = this.wrap(); if (!W) return;
    let drag = null, moved = false;
    document.addEventListener('pointerdown', e => {
      const el = e.target.closest && e.target.closest(this.CARDS);
      if (!el || !el.id || !W.contains(el) || e.button !== 0 || e.target.closest(this.SKIP)) return;
      const r = el.getBoundingClientRect();
      if (e.clientX - r.left > el.clientWidth) return;      /* the card's own scrollbar */
      drag = { el, dx: e.clientX - r.left, dy: e.clientY - r.top, sx: e.clientX, sy: e.clientY, id: e.pointerId };
      moved = false;
    }, true);
    document.addEventListener('pointermove', e => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!moved && Math.hypot(e.clientX - drag.sx, e.clientY - drag.sy) < 4) return;
      if (!moved){ moved = true; drag.el.classList.add('jmDragging'); document.body.classList.add('jmDragBody'); try { drag.el.setPointerCapture(drag.id); } catch(x){} }
      const w = W.getBoundingClientRect(), s = drag.el.style;
      const x = Math.max(0, Math.min(e.clientX - w.left - drag.dx, w.width - drag.el.offsetWidth));
      const y = Math.max(0, Math.min(e.clientY - w.top - drag.dy, w.height - drag.el.offsetHeight));
      s.left = x + 'px'; s.top = y + 'px'; s.right = 'auto'; s.bottom = 'auto';
      e.preventDefault();
    }, true);
    const end = e => {
      if (!drag || e.pointerId !== drag.id) return;
      const el = drag.el; drag = null;
      if (!moved) return;
      moved = false;
      el.classList.remove('jmDragging'); document.body.classList.remove('jmDragBody');
      this.remember(el);
      /* the click that follows a drag must not press anything inside the card */
      const swallow = ev => { ev.stopPropagation(); ev.preventDefault(); };
      document.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => document.removeEventListener('click', swallow, { capture: true }), 50);
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
    document.addEventListener('dblclick', e => {
      const el = e.target.closest && e.target.closest(this.CARDS);
      if (!el || !el.id || e.target.closest(this.SKIP)) return;
      const all = this.places(); delete all[el.id]; lsSet(this.KEY, all);
      this.home(el);
    }, true);
    new MutationObserver(ms => { for (const m of ms) for (const n of m.addedNodes) if (n.nodeType === 1 && n.matches(this.CARDS)) this.apply(n); }).observe(W, { childList: true });
    new ResizeObserver(() => this.applyAll()).observe(W);
    this.applyAll();
  },

  pairs(bar){
    return [...bar.querySelectorAll(this.BTN)].map(b => {
      const n = b.nextElementSibling;
      return { id: b.id, nodes: n && n.tagName === 'BUTTON' && n.textContent.trim() === '⚙' ? [b, n] : [b] };
    });
  },
  /* put the pairs back in `ids` order, starting where the first pair now sits */
  place(bar, ids){
    const P = this.pairs(bar); if (!P.length) return;
    const mark = document.createComment('jm'); P[0].nodes[0].before(mark);
    const known = ids.filter(id => P.some(p => p.id === id));
    const order = known.concat(P.map(p => p.id).filter(id => !known.includes(id)));
    let at = mark;
    for (const id of order) for (const node of P.find(p => p.id === id).nodes){ at.after(node); at = node; }
    mark.remove();
  },
  bindButtons(){
    const bar = document.getElementById('chartLabelBar'); if (!bar) return;
    this.defaultOrder = this.pairs(bar).map(p => p.id);
    this.place(bar, lsGet(this.ORDER_KEY, []) || []);
    bar.querySelectorAll(this.BTN).forEach(b => { b.draggable = true; b.title = (b.title || '') + ' · drag to move this button'; });
    let moving = null;
    bar.addEventListener('dragstart', e => {
      const b = e.target.closest && e.target.closest(this.BTN); if (!b) return;
      moving = b.id; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', b.id); b.classList.add('jmDragging');
    });
    bar.addEventListener('dragover', e => { if (moving && e.target.closest(this.BTN)) e.preventDefault(); });
    bar.addEventListener('drop', e => {
      const t = e.target.closest(this.BTN);
      if (!moving || !t || t.id === moving) return;
      e.preventDefault();
      const r = t.getBoundingClientRect();
      this.moveTo(bar, moving, t.id, e.clientX > r.left + r.width / 2);
    });
    bar.addEventListener('dragend', () => { document.getElementById(moving)?.classList.remove('jmDragging'); moving = null; });
    const last = this.pairs(bar).pop();
    if (last) last.nodes[last.nodes.length - 1].insertAdjacentHTML('afterend', '<button id="jmLayoutReset" class="bMini" title="Put every result card and ✦ button back in its original place">↺</button>');
    document.getElementById('jmLayoutReset')?.addEventListener('click', () => this.reset());
  },
  moveTo(bar, id, targetId, after){
    const ids = this.pairs(bar).map(p => p.id).filter(x => x !== id);
    ids.splice(ids.indexOf(targetId) + (after ? 1 : 0), 0, id);
    this.place(bar, ids); lsSet(this.ORDER_KEY, ids);
  },
  reset(){
    lsSet(this.KEY, {}); lsSet(this.ORDER_KEY, []);
    const W = this.wrap(), bar = document.getElementById('chartLabelBar');
    if (W) W.querySelectorAll(this.CARDS).forEach(el => this.home(el));
    if (bar && this.defaultOrder) this.place(bar, this.defaultOrder);
  },
  init(){
    document.head.insertAdjacentHTML('beforeend', '<style>.fcCard,.pcCard{cursor:move;max-height:calc(100% - 12px);overflow:auto}.fcCard button,.pcCard button,.fcCard a,.pcCard a{cursor:pointer}.jmDragging{opacity:.75}.jmDragBody{user-select:none;cursor:move}</style>');
    this.bindCards(); this.bindButtons();
  },
};
window.addEventListener('load', () => JMLayout.init());
