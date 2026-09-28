/* ASTRA Terminal — chart screens: as many charts on the desk as you want.

   A "screen" is not a copy of the chart, it IS the chart. Each screen loads this
   same page with ?panel=chart&tile=<id>, so it brings the whole apparatus with
   it: the drawing tools down the left, every indicator in the catalogue, the
   price rail, the position lines, the buy and sell buttons, the right-click
   menu, replay, alerts — everything the main chart can do, because it is the
   same code running again.

   What each screen keeps to itself: its instrument, its timeframe, its
   indicators, its candle type, its pane layout (see PER_CHART_KEYS in
   config.js). What stays shared on purpose: drawings per instrument, open
   positions, alerts, the watchlist and the theme — a trendline drawn on a screen
   is the same trendline the main chart shows.

   A brand-new screen starts as a copy of whatever the main chart shows and goes
   its own way from the first change you make to it.

   This one file is both halves: Screens (the desk, in the main window) and
   ScreenTile (the small amount a screen needs to know about its parent). */

const Screens = {
  MAX: 16,                       // a hard stop, so a stuck keypress cannot open 500
  list: [],                      // [{ id, sym, tf, follow }]
  frames: {},                    // id -> iframe
  maxId: null,                   // which screen is blown up, if any

  /* ---------------- boot ---------------- */

  init(){
    if (TILE_ID || (typeof Popout !== 'undefined' && Popout.isChild())) return; // never inside a screen
    this.grid = document.getElementById('chartGrid');
    if (!this.grid) return;
    this.list = this.load();
    this.buildControls();
    BUS.on('symbol', sym => this.pushSymbol(sym || STORE.symbol));
    window.addEventListener('message', e => this.onTileMessage(e));
    this.render();
  },

  load(){
    const saved = lsGet('astra_screens', null);
    if (Array.isArray(saved)) return saved.slice(0, this.MAX).filter(s => s && s.id);
    /* first run after the update: carry over the old split layout so the desk
       looks the way he left it, just with real charts in the cells */
    const n = Math.max(0, (parseInt(localStorage.getItem('astra_layout'), 10) || 1) - 1);
    const minis = lsGet('astra_minis', []);
    const out = [];
    for (let i = 0; i < n; i++){
      const m = minis[i] || {};
      out.push({ id: this.newId(), sym: m.sym || STORE.symbol, tf: m.tf || STORE.tf, follow: false });
    }
    /* the old split layout has been carried over; forget it, or every start
       would build the old mini charts again just to throw them away */
    localStorage.setItem('astra_layout', '1');
    return out;
  },
  save(){ lsSet('astra_screens', this.list); },
  newId(){
    let id;
    do { id = Math.random().toString(36).slice(2, 7); } while (this.frames[id]);
    return id;
  },

  /* ---------------- the controls in the top bar ---------------- */

  buildControls(){
    const seg = document.getElementById('layoutSeg');
    if (!seg) return;
    /* rebuilding the segment also drops the old layout listeners, so the
       1 / 2 / 4 buttons now mean "1, 2 or 4 real charts" */
    seg.innerHTML =
      `<button data-n="1" title="One chart">` +
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="16" rx="2"/></svg></button>` +
      `<button data-n="2" title="Two charts side by side">` +
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/></svg></button>` +
      `<button data-n="4" title="Four charts">` +
      `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="8" height="7" rx="1"/><rect x="13" y="4" width="8" height="7" rx="1"/><rect x="3" y="13" width="8" height="7" rx="1"/><rect x="13" y="13" width="8" height="7" rx="1"/></svg></button>` +
      `<span class="lsSep"></span>` +
      `<button data-screens="less" title="One chart fewer">−</button>` +
      `<b id="lsCount" title="Charts on the desk">1</b>` +
      `<button data-screens="more" title="Add another full chart">+</button>`;
    seg.querySelectorAll('[data-n]').forEach(b =>
      b.addEventListener('click', () => this.setCount(parseInt(b.dataset.n, 10))));
    seg.querySelector('[data-screens="more"]').addEventListener('click', () => this.add());
    seg.querySelector('[data-screens="less"]').addEventListener('click', () => this.removeLast());
  },

  markCount(){
    const total = this.list.length + 1;
    const el = document.getElementById('lsCount');
    if (el) el.textContent = total;
    document.querySelectorAll('#layoutSeg [data-n]').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.n, 10) === total));
  },

  /* ---------------- adding and removing ---------------- */

  setCount(total){
    total = Math.max(1, Math.min(this.MAX + 1, total));
    while (this.list.length > total - 1) this.forget(this.list.pop());
    while (this.list.length < total - 1)
      this.list.push({ id: this.newId(), sym: STORE.symbol, tf: STORE.tf, follow: false });
    this.maxId = null;
    this.save();
    this.render();
  },

  add(){
    if (this.list.length >= this.MAX)
      return toast('That is ' + (this.MAX + 1) + ' charts — as many as one window can hold sensibly. Use a second window for more.', 'warn');
    this.list.push({ id: this.newId(), sym: STORE.symbol, tf: STORE.tf, follow: false });
    this.save();
    this.render();
  },

  removeLast(){
    if (!this.list.length) return toast('Only the main chart is open', 'info');
    this.remove(this.list[this.list.length - 1].id);
  },

  /* a closed screen must not leave its settings behind: one saved indicator set
     is around 20 KB, and browser storage is small */
  forget(s){
    if (!s) return;
    const tail = '::t' + s.id;
    for (let i = localStorage.length - 1; i >= 0; i--){
      const k = localStorage.key(i);
      if (k && k.endsWith(tail)) localStorage.removeItem(k);
    }
  },

  remove(id){
    const i = this.list.findIndex(s => s.id === id);
    if (i < 0) return;
    this.forget(this.list[i]);
    this.list.splice(i, 1);
    if (this.maxId === id) this.maxId = null;
    this.save();
    this.render();
  },

  /* ---------------- drawing the desk ---------------- */

  render(){
    /* the old split charts and the new screens never share the grid */
    if (typeof Multi !== 'undefined' && Multi.layout > 1) Multi.setLayout(1);

    const keep = new Set(this.list.map(s => s.id));
    for (const id of Object.keys(this.frames)){
      if (keep.has(id)) continue;
      const cell = this.frames[id].closest('.screenCell');
      if (cell) cell.remove();
      delete this.frames[id];
    }
    for (const s of this.list) if (!this.frames[s.id]) this.createCell(s);

    /* order in the grid follows the saved order */
    for (const s of this.list){
      const cell = this.frames[s.id].closest('.screenCell');
      if (cell) this.grid.appendChild(cell);
    }

    const total = this.list.length + 1;
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);
    this.grid.className = 'layout-screens';
    this.grid.style.gridTemplateColumns = 'repeat(' + cols + ', minmax(0, 1fr))';
    this.grid.style.gridTemplateRows = total > 1 ? 'repeat(' + rows + ', minmax(0, 1fr))' : '';
    this.grid.classList.toggle('cellMax', !!this.maxId);
    for (const s of this.list){
      const cell = this.frames[s.id].closest('.screenCell');
      if (cell) cell.classList.toggle('gridMax', this.maxId === s.id);
    }
    const area = document.getElementById('chartArea');
    if (area) area.classList.toggle('gridMax', this.maxId === 'main');
    this.markCount();
    /* the chart library measures itself on resize */
    setTimeout(() => window.dispatchEvent(new Event('resize')), 60);
  },

  createCell(s){
    const el = document.createElement('div');
    el.className = 'screenCell';
    el.dataset.screen = s.id;
    el.innerHTML =
      `<div class="screenHead">` +
      `<b class="screenSym">${esc(s.sym)}</b>` +
      `<span class="screenTf">${esc(s.tf)}</span>` +
      `<label class="screenFollow" title="Show whatever the main chart shows">` +
      `<input type="checkbox"${s.follow ? ' checked' : ''}> follow</label>` +
      `<span class="screenGrow"></span>` +
      `<button data-act="max" title="Give this chart the whole desk">⛶</button>` +
      `<button data-act="close" title="Close this chart">×</button>` +
      `</div>` +
      `<iframe class="screenFrame" title="Chart ${esc(s.id)}" src="${this.urlFor(s)}"></iframe>`;
    this.grid.appendChild(el);
    this.frames[s.id] = el.querySelector('iframe');

    el.querySelector('[data-act="max"]').addEventListener('click', () => {
      this.maxId = this.maxId === s.id ? null : s.id;
      this.render();
    });
    el.querySelector('[data-act="close"]').addEventListener('click', () => this.remove(s.id));
    el.querySelector('.screenFollow input').addEventListener('change', e => {
      s.follow = e.target.checked;
      this.save();
      this.tell(s.id, { astra: 'follow', on: s.follow });
      if (s.follow) this.tell(s.id, { astra: 'symbol', symbol: STORE.symbol });
    });
    this.frames[s.id].addEventListener('load', () => {
      this.tell(s.id, { astra: 'hello', id: s.id, follow: s.follow });
    });
  },

  urlFor(s){
    return location.pathname + '?panel=chart&tile=' + encodeURIComponent(s.id) +
      '&symbol=' + encodeURIComponent(s.sym) + '&tf=' + encodeURIComponent(s.tf);
  },

  /* ---------------- talking to the screens ---------------- */

  tell(id, msg){
    const f = this.frames[id];
    if (!f || !f.contentWindow) return;
    try { f.contentWindow.postMessage(msg, location.origin); } catch(e){}
  },

  pushSymbol(sym){
    for (const s of this.list) if (s.follow) this.tell(s.id, { astra: 'symbol', symbol: sym });
  },

  /* a screen reports what it is showing, so its header can say so and the desk
     can be rebuilt on the same instruments next time */
  onTileMessage(e){
    if (e.origin !== location.origin) return;
    const m = e.data;
    if (!m || !m.id) return;
    /* a screen asking to become a window of its own: it opens on its own
       instrument and its tile goes, because the chart has moved, not multiplied */
    if (m.astra === 'popout') return this.popOut(m.id);
    /* a desk command pressed inside a screen: the screen has no Windows menu and
       no + / − of its own, so it asks the desk to do it */
    if (m.astra === 'desk'){
      if (m.cmd === 'winnew' && typeof Popout !== 'undefined') Popout.open('chart', { fresh: true });
      if (m.cmd === 'winmenu'){ const b = document.getElementById('winBtn'); if (b) b.click(); }
      if (m.cmd === 'screenadd') this.add();
      if (m.cmd === 'screenless') this.removeLast();
      return;
    }
    if (m.astra !== 'state') return;
    const s = this.list.find(x => x.id === m.id);
    if (!s) return;
    let changed = false;
    if (m.symbol && m.symbol !== s.sym){ s.sym = m.symbol; changed = true; }
    if (m.tf && m.tf !== s.tf){ s.tf = m.tf; changed = true; }
    if (!changed) return;
    this.save();
    const cell = this.grid.querySelector('.screenCell[data-screen="' + m.id + '"]');
    if (cell){
      cell.querySelector('.screenSym').textContent = s.sym;
      cell.querySelector('.screenTf').textContent = s.tf;
    }
  },

  /* ---------------- a screen becomes a window ---------------- */

  popOut(id){
    const s = this.list.find(x => x.id === id);
    if (!s || typeof Popout === 'undefined') return;
    const w = Popout.open('chart', { fresh: true, symbol: s.sym, tf: s.tf });
    if (w) this.remove(id);          // only if the window really opened
  },

  /* ---------------- workspaces ---------------- */

  snapshot(){ return this.list.map(s => ({ sym: s.sym, tf: s.tf, follow: !!s.follow })); },
  restore(arr){
    if (!Array.isArray(arr)) return;
    this.list = arr.slice(0, this.MAX).map(s => ({
      id: this.newId(), sym: s.sym || STORE.symbol, tf: s.tf || STORE.tf, follow: !!s.follow,
    }));
    this.maxId = null;
    this.save();
    this.render();
  },
};

/* ---------------------------------------------------------------------------
   The screen's own side: it only needs to know how to follow the main chart and
   how to say what it is showing. Everything else is the ordinary application.
   --------------------------------------------------------------------------- */
const ScreenTile = {
  id: TILE_ID,
  follow: false,

  init(){
    if (!TILE_ID) return;
    document.documentElement.dataset.tile = '1';
    window.addEventListener('message', e => {
      if (e.origin !== location.origin) return;
      const m = e.data;
      if (!m || !m.astra) return;
      if (m.astra === 'hello'){ this.follow = !!m.follow; this.report(); }
      if (m.astra === 'follow') this.follow = !!m.on;
      if (m.astra === 'symbol' && this.follow && m.symbol && m.symbol !== STORE.symbol)
        App.setSymbol(m.symbol);
    });
    BUS.on('symbol', () => this.report());
    document.addEventListener('click', () => setTimeout(() => this.report(), 120), true);
    const slim = () => {
      /* nine charts on one monitor leaves each one short: below this height the
         chart-labels row is dropped so the candles keep what is left */
      document.documentElement.dataset.slim = window.innerHeight < 300 ? '1' : '';
    };
    window.addEventListener('resize', slim);
    slim();
    this.report();
  },

  /* the shortcut inside a screen: hand this chart to the desk to open as a window */
  popOut(){ return this.send({ astra: 'popout', id: this.id }); },
  /* anything that belongs to the desk rather than to this one chart */
  ask(cmd){ return this.send({ astra: 'desk', id: this.id, cmd }); },
  send(msg){
    if (!window.parent || window.parent === window) return false;
    try { window.parent.postMessage(msg, location.origin); } catch(e){ return false; }
    return true;
  },

  report(){
    if (!window.parent || window.parent === window) return;
    try {
      window.parent.postMessage(
        { astra: 'state', id: this.id, symbol: STORE.symbol, tf: STORE.tf }, location.origin);
    } catch(e){}
  },
};
