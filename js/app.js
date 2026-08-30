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
    const match = s => !q || s.toUpperCase().includes(q) ||
      (MK.names[s] || '').toUpperCase().includes(q) ||
      (BROKER.is(s) && BROKER.info(s).name.toUpperCase().includes(q));
    /* your broker instruments and what you monitor come first, then all of crypto */
    const seen = new Set();
    const list = [];
    for (const s of [...BROKER.all(), ...MK.monitored, ...Watch.list, ...STORE.universe]){
      if (seen.has(s) || !match(s)) continue;
      seen.add(s);
      list.push(s);
      if (list.length >= 120) break;
    }
    const host = document.getElementById('symList');
    host.innerHTML = list.map(s => {
      const t = STORE.tickers.get(s);
      const st = Feed.status(s);
      return `<div class="srow" data-sym="${esc(s)}">` +
        `<div class="wico" style="--hue:${Watch.hue(s)}">${esc(baseAsset(s).slice(0, 4))}</div>` +
        `<div class="sname"><b>${esc(baseAsset(s))}</b><span>${esc(MK.sub(s))}</span></div>` +
        `<div class="spx"><b>${t ? fmtPrice(t.last) : '—'}</b><span class="${t ? pctClass(t.pct) : ''}">${t ? fmtPct(t.pct) : ''}</span></div>` +
        `<span class="fdTag ${st.cls}" title="${esc(st.tip)}">${esc(st.label)}</span></div>`;
    }).join('') || '<div class="empty">Nothing found.<br>Use the Markets button to browse every market.</div>';
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
    await Feed.init();
    this.updateFeedChip();
    try {
      await bootMarketData();
    } catch(e){
      toast('Cannot reach the Binance market data API — check your internet connection.', 'error');
    }
    MK.startPolling();
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
    const known = STORE.tickers.has(sym) ||
      (typeof MK !== 'undefined' && MK.isKnown(sym)) ||
      (typeof BROKER !== 'undefined' && BROKER.is(sym));
    if (sym === STORE.symbol || !known) return;
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

    /* markets browser + data sources */
    document.getElementById('mktBtn').addEventListener('click', () => MarketBrowser.open());
    document.getElementById('mktSearch').addEventListener('input', e => MarketBrowser.onSearch(e.target.value));
    document.getElementById('stFeed').addEventListener('click', () => this.openFeed());
    document.getElementById('feedSave').addEventListener('click', async () => {
      const ok = await Feed.setApi(document.getElementById('feedUrl').value);
      toast(ok ? 'Data service connected' : 'Could not reach that address — crypto still works', ok ? 'ok' : 'warn');
      this.renderFeed();
      if (ok) MK.refresh();
    });
    BUS.on('feed', () => { this.updateFeedChip(); this.renderFeed(); });

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

  /* colour inputs need plain hex, but a default may be an rgba() string */
  toHex(col){
    if (!col) return '#8fa3c8';
    if (col[0] === '#') return col.length === 4
      ? '#' + col[1] + col[1] + col[2] + col[2] + col[3] + col[3] : col.slice(0, 7);
    const m = col.match(/rgba?\(([^)]+)\)/);
    if (!m) return '#8fa3c8';
    const [r, g, b] = m[1].split(',').map(x => Math.round(parseFloat(x)));
    return '#' + [r, g, b].map(x => Math.max(0, Math.min(255, x || 0)).toString(16).padStart(2, '0')).join('');
  },

  openIndicators(){
    const host = document.getElementById('indList');
    host.innerHTML = INDS.map(def => {
      const c = Chart.settings[def.id] || def.def;
      const parts = def.parts || [];
      const params = (def.params || []).map(p => {
        const val = c[p.k];
        if (p.kind === 'sel')
          return `<select class="tsel" data-id="${def.id}" data-k="${p.k}">` +
            p.opts.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${l}</option>`).join('') + '</select>';
        return `<input type="number" data-id="${def.id}" data-k="${p.k}" value="${val}" ` +
          `min="${p.min}" max="${p.max}"${p.step ? ` step="${p.step}"` : ''} style="width:52px" title="${p.k}">`;
      }).join('');
      const applyTo = def.applyTo
        ? `<select class="tsel" data-id="${def.id}" data-k="src" title="Apply to — which price this reads">` +
          IND.SOURCES.map(([v, l]) => `<option value="${v}"${v === (c.src || 'close') ? ' selected' : ''}>${l}</option>`).join('') +
          '</select>'
        : '';
      const targets = IND_TARGETS.map(([v, l]) =>
        `<option value="${v}"${v === c.target ? ' selected' : ''}>${l}</option>`).join('');
      const colors = parts.map(pt =>
        `<label class="stCol"><input type="color" data-id="${def.id}" data-ck="${pt.key}" ` +
        `value="${this.toHex((c.colors || {})[pt.key] || pt.color)}"><span>${esc(pt.label)}</span></label>`).join('');
      const styleRow = `<div class="indStyle" id="ist-${def.id}">` + colors +
        `<label class="stCol"><input type="number" data-id="${def.id}" data-k="width" value="${c.width || 1}" min="1" max="5" style="width:44px"><span>Thickness</span></label>` +
        `<label class="stCol"><select class="tsel" data-id="${def.id}" data-k="style">` +
        IND_STYLES.map(([v, l]) => `<option value="${v}"${v === (c.style || 0) ? ' selected' : ''}>${l}</option>`).join('') +
        `</select><span>Line</span></label></div>`;
      return `<div class="indRow">` +
        `<label class="main"><input type="checkbox" data-id="${def.id}" data-k="on"${c.on ? ' checked' : ''}>` +
        `<span class="chip" style="background:${this.toHex(parts[0] ? parts[0].color : '#3d5a80')}"></span>${esc(def.label)}` +
        (def.note ? `<i class="indNote" title="${esc(def.note)}">?</i>` : '') + `</label>` +
        `<span class="indParams">${params}${applyTo}</span>` +
        `<button class="indStyleBtn" data-style="${def.id}" title="Colours and line style">◑</button>` +
        `<select class="tsel indTarget" data-id="${def.id}" data-k="target" title="Which window to draw it in">${targets}</select>` +
        `</div>` + styleRow;
    }).join('');
    host.querySelectorAll('.indStyleBtn').forEach(b => b.addEventListener('click', () => {
      const el = document.getElementById('ist-' + b.dataset.style);
      el.classList.toggle('open');
      b.classList.toggle('on', el.classList.contains('open'));
    }));
    document.getElementById('i_vp').checked = Chart.settings.vp.on;
    document.getElementById('i_pat').checked = Chart.settings.patterns.on;
    this.showModal('indModal');
  },

  applyIndicators(){
    const S = Chart.settings;
    document.querySelectorAll('#indList [data-id]').forEach(el => {
      const cfg = S[el.dataset.id];
      if (!cfg) return;
      if (el.dataset.ck){                       /* a colour for one line of this indicator */
        cfg.colors = cfg.colors || {};
        cfg.colors[el.dataset.ck] = el.value;
        return;
      }
      const k = el.dataset.k;
      if (el.type === 'checkbox') cfg[k] = el.checked;
      else if (el.type === 'number'){
        const v = parseFloat(el.value);
        if (!isNaN(v) && v > 0) cfg[k] = v;
      } else if (k === 'style') cfg[k] = parseInt(el.value, 10) || 0;
      else cfg[k] = el.value;
    });
    S.vp = { on: document.getElementById('i_vp').checked };
    S.patterns = { on: document.getElementById('i_pat').checked };
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

  openFeed(){
    document.getElementById('feedUrl').value = localStorage.getItem('astra_api') || '';
    this.renderFeed();
    this.showModal('feedModal');
  },

  renderFeed(){
    const el = document.getElementById('feedState');
    if (!el) return;
    const row = (label, ok, text) =>
      `<div class="feedRow"><i class="fdDot ${ok ? 'on' : 'off'}"></i><b>${esc(label)}</b><span>${esc(text)}</span></div>`;
    const b = Feed.bridge;
    el.innerHTML =
      row('Crypto (Binance)', true, 'live stream · always on, no service needed') +
      row('Data service', Feed.apiReady, Feed.apiReady
        ? 'connected' + (Feed.apiBase ? ' · ' + Feed.apiBase : ' · this page') + ' — stocks, forex, indices, commodities'
        : 'not reachable — only crypto is available') +
      row('MT5 bridge (' + BROKER.name + ')', !!b, b
        ? 'connected · account ' + (b.account || '?') + ' · ' + (b.server || '') + ' · ' + b.symbols.size + ' symbols, no delay'
        : 'not running — start START-MT5-Bridge.bat for your broker\'s own live prices');
  },

  updateFeedChip(){
    const el = document.getElementById('stFeed');
    if (!el) return;
    el.textContent = Feed.sourceLabel();
    el.className = 'stv ' + (Feed.bridge ? 'up' : Feed.apiReady ? '' : 'down');
  },

  showModal(id){ document.getElementById(id).classList.add('show'); },
  hideModal(id){ document.getElementById(id).classList.remove('show'); },
};

window.addEventListener('DOMContentLoaded', () => App.boot());
