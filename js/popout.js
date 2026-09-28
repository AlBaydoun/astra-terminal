/* ASTRA Terminal — separate windows for separate monitors.

   Any panel can be torn off into its own window: a chart, the bots workspace,
   the screener, the heatmap, the observer, the news feed, the watchlist. Each
   window runs the same application with one panel shown, so a chart in a torn-off
   window is the real chart with all its tools, not a picture of one.

   Windows talk to each other over a BroadcastChannel: change the theme in one and
   they all follow, and a chart window can be told to follow the main symbol or to
   hold its own. Everything is same-origin, so nothing leaves the machine. */
const Popout = {

  PANELS: {
    chart:     { label: 'Chart',         w: 1280, h: 860, hint: 'A full chart with every drawing tool' },
    bots:      { label: 'Bots',          w: 1500, h: 950, hint: 'Dashboard, reports, the brain and every bot' },
    screener:  { label: 'Screener',      w: 1100, h: 800 },
    heatmap:   { label: 'Heatmap',       w: 1000, h: 800 },
    observer:  { label: 'Observer',      w: 1100, h: 850 },
    intel:     { label: 'Intel & news',  w: 900,  h: 900 },
    news:      { label: 'News & alerts', w: 1280, h: 900 },
    watch:     { label: 'Watchlist',     w: 460,  h: 900 },
    book:      { label: 'Order book',    w: 460,  h: 900 },
    alerts:    { label: 'Alerts',        w: 520,  h: 700 },
    portfolio: { label: 'Paper account', w: 620,  h: 800 },
    replay:    { label: 'Trade replay',  w: 1400, h: 900, hint: 'The replay chart with its indicators and recorder' },
  },

  /* which panels live in the lower strip vs the right sidebar */
  BOTTOM: ['screener', 'heatmap', 'observer', 'intel', 'news', 'bots'],
  SIDE: ['watch', 'book', 'alerts', 'portfolio', 'ai', 'notes'],

  chan: null,
  children: {},          // name -> window handle, so the parent can find them again
  chartWins: {},         // slot -> what that chart window is showing, for the menu
  follow: true,          // child only: follow the main window's symbol

  /* ---------- identity ---------- */
  panel(){
    const p = new URLSearchParams(location.search).get('panel');
    return p && this.PANELS[p] ? p : null;
  },
  isChild(){ return !!this.panel(); },

  init(){
    this.chan = ('BroadcastChannel' in window) ? new BroadcastChannel('astra-windows') : null;
    if (this.chan) this.chan.onmessage = e => this.onMessage(e.data);

    if (TILE_ID){ this.mountTile(); return; }
    if (this.isChild()) this.mountChild();
    else this.mountParent();

    window.addEventListener('beforeunload', () => {
      if (!this.isChild()) this.send({ type: 'parentClosing' });
    });
  },

  send(msg){
    if (!this.chan) return;
    try { this.chan.postMessage(Object.assign({ from: this.panel() || 'main' }, msg)); } catch(e){}
  },

  onMessage(m){
    if (!m || m.from === (this.panel() || 'main')) return;
    if (m.type === 'theme' && m.theme !== STORE.theme){
      STORE.theme = m.theme;
      document.documentElement.dataset.theme = m.theme;
      localStorage.setItem('astra_theme', m.theme);
      if (typeof Chart !== 'undefined' && Chart.main) Chart.applyTheme();
    }
    if (m.type === 'symbol' && this.isChild() && this.follow && m.symbol !== STORE.symbol)
      App.setSymbol(m.symbol);
    if (m.type === 'settings'){
      /* another window changed indicators or bot settings — pick them up */
      if (typeof Chart !== 'undefined' && Chart.settings){
        const saved = lsGet('astra_ind', {});
        for (const k of Object.keys(saved)) Chart.settings[k] = Object.assign(Chart.settings[k] || {}, saved[k]);
        if (Chart.main) Chart.renderAll();
      }
    }
    if (m.type === 'chartwin' && m.slot) this.chartWins[m.slot] = m.symbol;
    if (m.type === 'closeAll' && this.isChild()) window.close();
    if (m.type === 'parentClosing' && this.isChild()) this.markOrphan();
  },

  /* ---------- the main window ---------- */
  mountParent(){
    const btn = document.getElementById('winBtn');
    if (btn) btn.addEventListener('click', e => { e.stopPropagation(); this.toggleMenu(); });
    document.addEventListener('click', () => this.closeMenu());

    /* tell the children when the symbol or theme moves */
    BUS.on('symbol', sym => this.send({ type: 'symbol', symbol: sym || STORE.symbol }));
    BUS.on('theme', () => this.send({ type: 'theme', theme: STORE.theme }));
    window.addEventListener('storage', e => { if (e.key === 'astra_ind') this.send({ type: 'settings' }); });
  },

  toggleMenu(){
    const m = document.getElementById('winMenu');
    if (!m) return;
    if (m.classList.contains('show')) return this.closeMenu();
    const live = Object.entries(this.children).filter(([, w]) => w && !w.closed).length;
    const charts = this.openChartWindows();
    m.innerHTML =
      '<div class="wmHead">OPEN IN ITS OWN WINDOW</div>' +
      Object.entries(this.PANELS).map(([k, p]) => {
        if (k === 'chart') return '';   // the chart has its own section below
        const open = this.children[k] && !this.children[k].closed;
        return `<button data-pop="${k}"${open ? ' class="on"' : ''}>` +
          `<i>${open ? '◉' : '◎'}</i>${esc(p.label)}` +
          (p.hint ? `<small>${esc(p.hint)}</small>` : '') + '</button>';
      }).join('') +
      '<div class="wmSep"></div>' +
      '<div class="wmHead">CHART WINDOWS</div>' +
      charts.map(n =>
        `<button data-chart="${n}" class="on"><i>◉</i>Chart window ${n}` +
        `<small>${esc(this.chartWins[n] || 'open')} — click to bring it forward</small>` +
        `<b data-chartx="${n}" title="Close this chart window">×</b></button>`).join('') +
      '<button data-pop="__chart2">➕ Another chart window</button>' +
      (live ? `<button data-pop="__closeall" class="danger">Close all ${live} extra window${live > 1 ? 's' : ''}</button>` : '') +
      '<div class="wmNote">Open as many chart windows as you have monitors — drag each one across and it stays there. ' +
      'Every chart window keeps its own instrument, timeframe and indicators, and comes back that way next time. ' +
      'Tick “follow” inside a window to make it track the main chart instead. Keys: Ctrl+F2 for another window.</div>';
    m.classList.add('show');
    m.querySelectorAll('[data-pop]').forEach(b => b.addEventListener('click', () => {
      this.closeMenu();
      const k = b.dataset.pop;
      if (k === '__closeall') return this.closeAll();
      if (k === '__chart2') return this.open('chart', { fresh: true });
      this.open(k);
    }));
    m.querySelectorAll('[data-chart]').forEach(b => b.addEventListener('click', e => {
      const slot = +b.dataset.chart;
      if (e.target && e.target.dataset && e.target.dataset.chartx){
        e.stopPropagation();
        return this.closeChart(slot);
      }
      this.closeMenu();
      this.focusChart(slot);
    }));
  },
  closeMenu(){
    const m = document.getElementById('winMenu');
    if (m) m.classList.remove('show');
  },

  MAX_CHART_WINDOWS: 24,

  /* Chart windows are numbered, not stamped with the clock. The old key used the
     last four characters of Date.now() in base 36, which repeats every 28
     minutes — two windows opened far enough apart got the SAME window name, and
     the browser then reused the first one instead of opening a second. A slot
     also means the chart window on a given monitor keeps its own instrument and
     indicators and comes back that way. */
  chartSlot(){
    for (let n = 1; n <= this.MAX_CHART_WINDOWS; n++){
      const w = this.children['chart_w' + n];
      if (!w || w.closed) return n;
    }
    return 0;
  },
  openChartWindows(){
    const out = [];
    for (let n = 1; n <= this.MAX_CHART_WINDOWS; n++){
      const w = this.children['chart_w' + n];
      if (w && !w.closed) out.push(n);
    }
    return out;
  },

  open(name, opts){
    opts = opts || {};
    const p = this.PANELS[name];
    if (!p) return;

    let key = name, slot = 0;
    if (name === 'chart'){
      slot = opts.slot || (opts.fresh ? this.chartSlot() : (this.openChartWindows()[0] || this.chartSlot()));
      if (!slot) return toast('That is ' + this.MAX_CHART_WINDOWS + ' chart windows already open', 'warn');
      key = 'chart_w' + slot;
    }

    const exist = this.children[key];
    if (exist && !exist.closed){ try { exist.focus(); } catch(e){} return exist; }

    /* A chart torn off a screen must arrive on THAT screen's instrument. The
       window reads its own remembered settings before the address, so the
       instrument is handed over through those settings, not through the URL. */
    if (slot && (opts.symbol || opts.tf)){
      if (opts.symbol) localStorage.setItem('astra_symbol::tw' + slot, opts.symbol);
      if (opts.tf) localStorage.setItem('astra_tf::tw' + slot, opts.tf);
    }
    const url = location.pathname + '?panel=' + encodeURIComponent(name) +
      (slot ? '&chart=w' + slot : '') +
      '&symbol=' + encodeURIComponent(opts.symbol || STORE.symbol) +
      '&tf=' + encodeURIComponent(opts.tf || STORE.tf);
    /* a named window with a size is what makes the browser give it its own frame
       rather than a tab, which is the whole point on a multi-monitor desk; each
       further window steps down and right so it cannot hide behind the last one */
    const step = slot ? (slot - 1) * 36 : 0;
    const feat = 'popup=yes,width=' + p.w + ',height=' + p.h +
      ',left=' + Math.round(window.screenX + 60 + step) + ',top=' + Math.round(window.screenY + 60 + step) +
      ',menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes';
    const w = window.open(url, 'astra_' + key, feat);
    if (!w) return toast('The browser blocked the new window — allow pop-ups for this page, or use the desktop app', 'warn');
    this.children[key] = w;
    toast((slot ? 'Chart window ' + slot : p.label) + ' opened — drag it to another monitor', 'ok');
    return w;
  },

  focusChart(slot){
    const w = this.children['chart_w' + slot];
    if (w && !w.closed){ try { w.focus(); } catch(e){} }
  },
  closeChart(slot){
    const w = this.children['chart_w' + slot];
    try { if (w && !w.closed) w.close(); } catch(e){}
    delete this.children['chart_w' + slot];
    this.toggleMenu(); this.toggleMenu();   // redraw the list
  },

  closeAll(){
    this.send({ type: 'closeAll' });
    for (const w of Object.values(this.children)) { try { if (w && !w.closed) w.close(); } catch(e){} }
    this.children = {};
    toast('Extra windows closed', 'info');
  },

  /* ---------- a chart screen inside the main window ----------
     A screen is a chart panel like a torn-off window, but it has no title bar of
     its own and no "follow" tick of its own: the desk draws that header around
     the frame, so the screen only needs the panel class and its own side of the
     conversation (ScreenTile in chartscreens.js). */
  mountTile(){
    document.documentElement.dataset.panel = 'chart';
    this.follow = false;
    if (typeof ScreenTile !== 'undefined') ScreenTile.init();
    window.addEventListener('storage', e => { if (e.key === 'astra_ind') this.onMessage({ type: 'settings', from: 'x' }); });
  },

  /* ---------- a torn-off window ---------- */
  mountChild(){
    const name = this.panel();
    const p = this.PANELS[name];
    document.documentElement.dataset.panel = name;
    document.title = p.label + ' · ASTRA';

    /* the panel this window owns has to be the visible one */
    if (this.BOTTOM.includes(name)){
      document.querySelectorAll('#botTabs [data-tab]').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === name));
      document.querySelectorAll('.botPanel').forEach(el =>
        el.classList.toggle('active', el.id === 'bot-' + name));
    }
    if (this.SIDE.includes(name)){
      document.querySelectorAll('#sideTabs [data-tab]').forEach(b =>
        b.classList.toggle('active', b.dataset.tab === name));
      document.querySelectorAll('.sidePanel').forEach(el =>
        el.classList.toggle('active', el.id === 'side-' + name));
    }

    this.buildChildBar(p);

    /* a chart window keeps its own symbol by default, so three monitors can show
       three different instruments */
    this.follow = name !== 'chart' ? true : (sessionStorage.getItem('astra_follow') === '1');
    const chk = document.getElementById('popFollow');
    if (chk){
      chk.checked = this.follow;
      chk.addEventListener('change', () => {
        this.follow = chk.checked;
        sessionStorage.setItem('astra_follow', this.follow ? '1' : '0');
        if (this.follow) toast('This window will follow the main chart', 'info');
      });
    }
    /* let the main window know what this one is showing, so the Windows menu can
       name it: "Chart window 2 — XAUUSD.m" beats three identical rows */
    if (CHART_WIN){
      const slot = CHART_WIN.slice(1);
      const say = () => this.send({ type: 'chartwin', slot, symbol: STORE.symbol });
      BUS.on('symbol', say);
      say();
      setTimeout(say, 2500);
    }
    window.addEventListener('storage', e => { if (e.key === 'astra_ind') this.onMessage({ type: 'settings', from: 'x' }); });
  },

  buildChildBar(p){
    const bar = document.createElement('div');
    bar.id = 'popBar';
    bar.innerHTML =
      `<b>${esc(p.label)}</b>` +
      (this.panel() === 'chart'
        ? '<label title="Show whatever the main window is showing"><input type="checkbox" id="popFollow"> follow main</label>'
        : '') +
      '<span class="popGrow"></span>' +
      '<button id="popMain" title="Bring the main window forward">Main window</button>';
    document.body.appendChild(bar);
    const m = document.getElementById('popMain');
    if (m) m.addEventListener('click', () => { try { window.opener && window.opener.focus(); } catch(e){} });
  },

  markOrphan(){
    const bar = document.getElementById('popBar');
    if (bar) bar.classList.add('orphan');
  },
};
