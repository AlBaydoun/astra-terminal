/* ASTRA Terminal — application glue: boot, topbar, tabs, modals, status bar */
const SymbolSearch = {
  cb: null,
  open(cb){
    this.cb = cb || (sym => App.setSymbol(sym));
    App.showModal('symModal');
    const inp = document.getElementById('symInput');
    inp.value = '';
    this.render('');
    setTimeout(() => inp.focus(), 60);
  },
  render(q){
    q = q.trim().toUpperCase();
    const list = STORE.universe.filter(s => s.includes(q)).slice(0, 100);
    const host = document.getElementById('symList');
    host.innerHTML = list.map(s => {
      const t = STORE.tickers.get(s);
      return `<div class="srow" data-sym="${s}">` +
        `<div class="wico" style="--hue:${Watch.hue(s)}">${esc(baseAsset(s).slice(0, 4))}</div>` +
        `<div class="sname"><b>${esc(baseAsset(s))}</b><span>/ USDT · Binance spot</span></div>` +
        `<div class="spx"><b>${t ? fmtPrice(t.last) : '—'}</b><span class="${t ? pctClass(t.pct) : ''}">${t ? fmtPct(t.pct) : ''}</span></div></div>`;
    }).join('') || '<div class="empty">No pair found</div>';
    host.querySelectorAll('.srow').forEach(r =>
      r.addEventListener('click', () => { App.hideModal('symModal'); this.cb(r.dataset.sym); }));
  },
};

/* top movers ticker strip */
const Strip = {
  init(){
    this.el = document.getElementById('tickerStrip');
    this.build();
    setInterval(() => this.build(), 60000);
  },
  build(){
    if (!STORE.universe.length || !this.el) return;
    const liquid = STORE.universe.filter(s => (STORE.tickers.get(s) || {}).quoteVol > 2e6);
    const sorted = [...liquid].sort((a, b) => STORE.tickers.get(b).pct - STORE.tickers.get(a).pct);
    const items = [...sorted.slice(0, 8), ...sorted.slice(-8).reverse()];
    if (!items.length) return;
    const chip = s => {
      const t = STORE.tickers.get(s);
      return `<span class="tsChip" data-sym="${esc(s)}"><b>${esc(baseAsset(s))}</b><span>${fmtPrice(t.last)}</span><i class="${pctClass(t.pct)}">${fmtPct(t.pct)}</i></span>`;
    };
    const html = items.map(chip).join('');
    this.el.innerHTML = `<div class="tsTrack">${html}${html}</div>`;
    this.el.querySelectorAll('.tsChip').forEach(c =>
      c.addEventListener('click', () => App.setSymbol(c.dataset.sym)));
  },
};

/* named workspaces: save / load the whole screen setup */
const Layouts = {
  saved: lsGet('astra_workspaces', {}),
  open(){
    this.renderList();
    App.showModal('layoutModal');
    setTimeout(() => document.getElementById('lyName').focus(), 60);
  },
  saveCurrent(){
    const inp = document.getElementById('lyName');
    const name = inp.value.trim();
    if (!name){ toast('Give the workspace a name first', 'warn'); return; }
    this.saved[name] = {
      sym: STORE.symbol, tf: STORE.tf, type: STORE.chartType,
      layout: Multi.layout,
      minis: Multi.cells.length ? Multi.cells.map(c => ({ sym: c.sym, tf: c.tf, ema: !!c.ema })) : Multi.minis,
      ind: Chart.settings,
      compares: Chart.compares,
    };
    lsSet('astra_workspaces', this.saved);
    inp.value = '';
    this.renderList();
    toast('Workspace "' + name + '" saved', 'ok');
  },
  load(name){
    const w = this.saved[name];
    if (!w) return;
    Chart.settings = Object.assign({}, Chart.settings, w.ind || {});
    lsSet('astra_ind', Chart.settings);
    STORE.chartType = w.type || 'candles';
    localStorage.setItem('astra_ctype', STORE.chartType);
    document.getElementById('chartType').value = STORE.chartType;
    Chart.compares = (w.compares || []).filter(s => s !== w.sym);
    lsSet('astra_compare', Chart.compares);
    Multi.minis = w.minis || Multi.minis;
    lsSet('astra_minis', Multi.minis);
    Multi.setLayout(w.layout || 1);
    STORE.tf = w.tf || STORE.tf;
    localStorage.setItem('astra_tf', STORE.tf);
    App.renderTfPills();
    STORE.symbol = STORE.tickers.has(w.sym) ? w.sym : STORE.symbol;
    localStorage.setItem('astra_symbol', STORE.symbol);
    App.updateSymBtn();
    Chart.load();
    App.hideModal('layoutModal');
    toast('Workspace "' + name + '" loaded', 'ok');
  },
  del(name){
    delete this.saved[name];
    lsSet('astra_workspaces', this.saved);
    this.renderList();
  },
  renderList(){
    const host = document.getElementById('lyList');
    const names = Object.keys(this.saved);
    host.innerHTML = names.length ? names.map(n =>
      `<div class="lyRow"><b>${esc(n)}</b><span>${esc(baseAsset(this.saved[n].sym || ''))} · ${esc(this.saved[n].tf || '')} · ${this.saved[n].layout || 1} chart${(this.saved[n].layout || 1) > 1 ? 's' : ''}</span>` +
      `<button data-act="load" data-n="${esc(n)}">Load</button><button data-act="del" data-n="${esc(n)}" class="lyDel">×</button></div>`).join('')
      : '<div class="empty">No saved workspaces yet.</div>';
    host.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => b.dataset.act === 'load' ? this.load(b.dataset.n) : this.del(b.dataset.n)));
  },
};

const App = {
  async boot(){
    document.getElementById('bootSplash').classList.add('show');
    await Sync.gate();
    document.getElementById('stSyncWrap').addEventListener('click', () => {
      if (confirm('Sign out of the terminal on this device? Your data stays saved in the cloud.')) Sync.signOut();
    });
    if (!window.LightweightCharts){
      document.getElementById('bootSplash').innerHTML =
        '<div class="bootBox"><h1>ASTRA</h1><p>Chart library could not be loaded.<br>Please check your internet connection and reopen.</p></div>';
      return;
    }
    Chart.init();
    Draw.init();
    this.wireUI();
    try {
      await bootMarketData();
    } catch(e){
      toast('Cannot reach the Binance market data API — check your internet connection.', 'error');
    }
    startGlobalStream();
    Watch.init(); Screener.init(); Alerts.init(); Port.init(); Book.init(); Heat.wire();
    await Chart.load();
    Screener.build();
    Multi.init();
    Strip.init();
    Notes.init();
    Intel.init();
    Brain.init();
    OBChat.init();
    this.updateSymBtn();
    this.stats();
    setInterval(() => this.stats(), 120000);
    this.clock();
    setInterval(() => this.clock(), 1000);
    document.getElementById('bootSplash').classList.remove('show');
  },

  setSymbol(sym){
    if (sym === STORE.symbol || !STORE.tickers.has(sym)) return;
    STORE.symbol = sym;
    localStorage.setItem('astra_symbol', sym);
    this.updateSymBtn();
    Chart.load();
  },
  setTf(tf){
    if (tf === STORE.tf) return;
    STORE.tf = tf;
    localStorage.setItem('astra_tf', tf);
    this.renderTfPills();
    Chart.load();
  },
  setType(t){
    STORE.chartType = t;
    localStorage.setItem('astra_ctype', t);
    Chart.renderAll();
  },

  updateSymBtn(){
    const t = STORE.tickers.get(STORE.symbol);
    document.getElementById('symBtnName').textContent = baseAsset(STORE.symbol) + '/USDT';
    const px = document.getElementById('symBtnPx');
    if (t){
      px.innerHTML = `<b>${fmtPrice(t.last)}</b><span class="${pctClass(t.pct)}">${fmtPct(t.pct)}</span>`;
      document.title = fmtPrice(t.last) + ' ' + baseAsset(STORE.symbol) + ' · ASTRA';
    }
  },

  renderTfPills(){
    const host = document.getElementById('tfPills');
    host.innerHTML = CFG.TFS.map(([v, lbl]) =>
      `<button class="pill${v === STORE.tf ? ' active' : ''}" data-tf="${v}">${lbl}</button>`).join('');
    host.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => this.setTf(b.dataset.tf)));
  },

  wireUI(){
    this.renderTfPills();

    document.getElementById('symBtn').addEventListener('click', () => SymbolSearch.open());
    document.getElementById('symInput').addEventListener('input', e => SymbolSearch.render(e.target.value));
    document.getElementById('symInput').addEventListener('keydown', e => {
      if (e.key === 'Enter'){
        const first = document.querySelector('#symList .srow');
        if (first){ this.hideModal('symModal'); SymbolSearch.cb(first.dataset.sym); }
      }
    });

    /* type any letter anywhere -> quick symbol search (TradingView-style) */
    window.addEventListener('keydown', e => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.querySelector('.modal.show')) return;
      if (/^[a-zA-Z0-9]$/.test(e.key)){
        SymbolSearch.open();
        const inp = document.getElementById('symInput');
        inp.value = e.key.toUpperCase();
        SymbolSearch.render(inp.value);
      }
    });

    const typeSel = document.getElementById('chartType');
    typeSel.value = STORE.chartType;
    typeSel.addEventListener('change', () => this.setType(typeSel.value));

    document.getElementById('indBtn').addEventListener('click', () => this.openIndicators());
    document.getElementById('indApply').addEventListener('click', () => this.applyIndicators());
    document.getElementById('alertBtn').addEventListener('click', () => Alerts.openModal());

    /* compare overlay */
    document.getElementById('cmpBtn').addEventListener('click', () =>
      SymbolSearch.open(sym => Chart.addCompare(sym)));

    /* named workspaces */
    document.getElementById('layoutsBtn').addEventListener('click', () => Layouts.open());
    document.getElementById('lySave').addEventListener('click', () => Layouts.saveCurrent());
    document.getElementById('lyName').addEventListener('keydown', e => { if (e.key === 'Enter') Layouts.saveCurrent(); });

    /* bar replay */
    document.getElementById('replayBtn').addEventListener('click', () => Chart.replayStart());
    document.getElementById('rpPlay').addEventListener('click', () => Chart.replayTogglePlay());
    document.getElementById('rpStep').addEventListener('click', () => Chart.replayStep());
    document.getElementById('rpExit').addEventListener('click', () => Chart.replayExit());
    document.getElementById('rpSpeed').addEventListener('change', e => Chart.replaySetSpeed(+e.target.value));

    /* theme toggle — dark is default */
    document.getElementById('themeBtn').addEventListener('click', () => {
      STORE.theme = STORE.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('astra_theme', STORE.theme);
      document.documentElement.dataset.theme = STORE.theme;
      Chart.applyTheme();
      Multi.applyTheme();
      if (Heat.data) Heat.draw();
    });
    document.getElementById('shotBtn').addEventListener('click', () => Chart.snapshot());
    document.getElementById('fsBtn').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen().catch(() => {});
    });

    /* sidebar tabs */
    document.querySelectorAll('#sideTabs button').forEach(b =>
      b.addEventListener('click', () => {
        document.querySelectorAll('#sideTabs button').forEach(x => x.classList.toggle('active', x === b));
        document.querySelectorAll('.sidePanel').forEach(p =>
          p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
      }));

    /* bottom panel tabs + collapse */
    document.querySelectorAll('#botTabs button[data-tab]').forEach(b =>
      b.addEventListener('click', () => {
        document.getElementById('bottomPanel').classList.remove('collapsed');
        document.querySelectorAll('#botTabs button[data-tab]').forEach(x => x.classList.toggle('active', x === b));
        document.querySelectorAll('.botPanel').forEach(p =>
          p.classList.toggle('active', p.id === 'bot-' + b.dataset.tab));
        if (b.dataset.tab === 'heatmap') Heat.show();
        if (b.dataset.tab === 'observer') Brain.renderDash();
        if (b.dataset.tab === 'intel') Intel.render();
      }));
    document.getElementById('botCollapse').addEventListener('click', () => {
      const bp = document.getElementById('bottomPanel');
      bp.classList.toggle('collapsed');
      if (!bp.classList.contains('collapsed') && document.getElementById('bot-heatmap').classList.contains('active')) Heat.show();
    });

    /* close modals on overlay click / X */
    document.querySelectorAll('.modal').forEach(m => {
      m.addEventListener('mousedown', e => { if (e.target === m) m.classList.remove('show'); });
      const x = m.querySelector('.mClose');
      if (x) x.addEventListener('click', () => m.classList.remove('show'));
    });

    BUS.on('tickers', ch => { if (ch.indexOf(STORE.symbol) !== -1) this.updateSymBtn(); });
    BUS.on('ws', s => {
      const dot = document.getElementById('wsDot');
      if (s.label === 'global' || s.label === 'symbol'){
        dot.classList.toggle('down', !s.up);
        document.getElementById('wsLbl').textContent = s.up ? 'LIVE · BINANCE' : 'RECONNECTING…';
      }
    });
  },

  openIndicators(){
    const S = Chart.settings;
    const set = (id, v) => { const el = document.getElementById(id); if (el.type === 'checkbox') el.checked = v; else el.value = v; };
    set('i_ema1', S.ema1.on); set('i_ema1len', S.ema1.len); set('i_ema1type', S.ema1.type || 'ema');
    set('i_ema2', S.ema2.on); set('i_ema2len', S.ema2.len); set('i_ema2type', S.ema2.type || 'ema');
    set('i_ema3', S.ema3.on); set('i_ema3len', S.ema3.len); set('i_ema3type', S.ema3.type || 'ema');
    set('i_bb', S.bb.on); set('i_bblen', S.bb.len); set('i_bbmult', S.bb.mult);
    set('i_vwap', S.vwap.on); set('i_vol', S.vol.on);
    set('i_st', S.st.on); set('i_stlen', S.st.len); set('i_stmult', S.st.mult);
    set('i_rsi', S.rsi.on); set('i_rsilen', S.rsi.len);
    set('i_macd', S.macd.on); set('i_macdf', S.macd.f); set('i_macds', S.macd.s); set('i_macdsig', S.macd.sig);
    set('i_stoch', S.stoch.on); set('i_stochk', S.stoch.k); set('i_stochsm', S.stoch.smooth); set('i_stochd', S.stoch.d);
    set('i_atr', S.atr.on); set('i_atrlen', S.atr.len);
    set('i_vp', S.vp.on);
    set('i_pat', S.patterns.on);
    this.showModal('indModal');
  },

  applyIndicators(){
    const S = Chart.settings;
    const num = (id, def) => { const v = parseInt(document.getElementById(id).value, 10); return (v > 0 && v < 1000) ? v : def; };
    const chk = id => document.getElementById(id).checked;
    const sel = id => document.getElementById(id).value;
    S.ema1 = { on: chk('i_ema1'), len: num('i_ema1len', 20), type: sel('i_ema1type') };
    S.ema2 = { on: chk('i_ema2'), len: num('i_ema2len', 50), type: sel('i_ema2type') };
    S.ema3 = { on: chk('i_ema3'), len: num('i_ema3len', 200), type: sel('i_ema3type') };
    S.bb = { on: chk('i_bb'), len: num('i_bblen', 20), mult: parseFloat(document.getElementById('i_bbmult').value) || 2 };
    S.vwap = { on: chk('i_vwap') };
    S.vol = { on: chk('i_vol') };
    S.st = { on: chk('i_st'), len: num('i_stlen', 10), mult: parseFloat(document.getElementById('i_stmult').value) || 3 };
    S.rsi = { on: chk('i_rsi'), len: num('i_rsilen', 14) };
    S.macd = { on: chk('i_macd'), f: num('i_macdf', 12), s: num('i_macds', 26), sig: num('i_macdsig', 9) };
    S.stoch = { on: chk('i_stoch'), k: num('i_stochk', 14), smooth: num('i_stochsm', 3), d: num('i_stochd', 3) };
    S.atr = { on: chk('i_atr'), len: num('i_atrlen', 14) };
    S.vp = { on: chk('i_vp') };
    S.patterns = { on: chk('i_pat') };
    lsSet('astra_ind', S);
    this.hideModal('indModal');
    Chart.renderAll();
  },

  async stats(){
    try {
      const g = await API.gecko('/global');
      const d = g.data;
      document.getElementById('stMcap').textContent = '$' + fmtNum(d.total_market_cap.usd);
      const chEl = document.getElementById('stMcapCh');
      chEl.textContent = fmtPct(d.market_cap_change_percentage_24h_usd);
      chEl.className = 'stv ' + pctClass(d.market_cap_change_percentage_24h_usd);
      document.getElementById('stBtcD').textContent = d.market_cap_percentage.btc.toFixed(1) + '%';
      document.getElementById('stEthD').textContent = d.market_cap_percentage.eth.toFixed(1) + '%';
    } catch(e){}
    try {
      const f = await API.fearGreed();
      const v = f.data && f.data[0];
      if (v){
        const el = document.getElementById('stFng');
        el.textContent = v.value + ' · ' + v.value_classification;
        el.className = 'stv ' + (v.value >= 55 ? 'up' : v.value <= 45 ? 'down' : 'flat');
      }
    } catch(e){}
  },

  clock(){
    const now = new Date();
    document.getElementById('stClock').textContent =
      now.toLocaleTimeString() + '  ·  ' + now.toUTCString().slice(17, 25) + ' UTC';
  },

  showModal(id){ document.getElementById(id).classList.add('show'); },
  hideModal(id){ document.getElementById(id).classList.remove('show'); },
};

window.addEventListener('DOMContentLoaded', () => App.boot());
