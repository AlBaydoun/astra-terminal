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
    let hidden = 0;
    for (const s of [...BROKER.all(), ...MK.monitored, ...Watch.list, ...STORE.universe]){
      if (seen.has(s) || !match(s)) continue;
      if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(s)) continue;
      seen.add(s);
      /* live-only: a delayed instrument is not offered at all, because choosing
         one is the first step towards trading on a price that no longer exists */
      if (Feed.liveOnly && !Feed.isLive(s)){ hidden++; continue; }
      list.push(s);
      if (list.length >= 120) break;
    }
    const host = document.getElementById('symList');
    const banner = Feed.liveOnly
      ? `<div class="symLive${Feed.bridge ? ' on' : ' warn'}">
           <b>LIVE ONLY</b>
           <span>${Feed.bridge
             ? 'Showing real-time instruments only.'
             : 'Showing real-time instruments only — ' + hidden + ' delayed one' + (hidden === 1 ? '' : 's') +
               ' hidden. Start <b>START-MT5-Bridge.bat</b> for live JustMarkets prices.'}</span>
           <button class="bMini" id="symLiveOff">Show delayed too</button>
         </div>`
      : `<div class="symLive off"><b>ALL FEEDS</b>
           <span>Delayed instruments are shown for reference. Trading still requires a fresh MT5 or exchange-stream price.</span>
           <button class="bMini" id="symLiveOn">Live only</button></div>`;
    host.innerHTML = banner + list.map(s => {
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
    const off = document.getElementById('symLiveOff');
    if (off) off.addEventListener('click', () => { Feed.setLiveOnly(false); this.render(q); });
    const on = document.getElementById('symLiveOn');
    if (on) on.addEventListener('click', () => { Feed.setLiveOnly(true); this.render(q); });
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
    if (!this.el) return;
    const liquid = (typeof MarketSources !== 'undefined' ? MarketSources.list() : STORE.universe)
      .filter(s => Number.isFinite(STORE.tickers.get(s)?.pct));
    const sorted = [...liquid].sort((a, b) => STORE.tickers.get(b).pct - STORE.tickers.get(a).pct);
    const items = [...sorted.slice(0, 8), ...sorted.slice(-8).reverse()];
    if (!items.length){ this.el.innerHTML = '<div class="aiSub">Waiting for JustMarkets prices · use Market settings to check the connection.</div>'; return; }
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
    if (typeof Popout !== 'undefined') Popout.init();
    this.wireUI();
    MarketSources.init();
    await Feed.init();
    this.updateFeedChip();
    try {
      await bootMarketData();
    } catch(e){
      toast('Cannot reach the Binance market data API — check your internet connection.', 'error');
    }
    MK.startPolling();
    startGlobalStream();
    STORE.symbol = MarketSources.fallback(STORE.symbol);
    Watch.init(); Screener.init(); Alerts.init(); Port.init(); Book.init(); Heat.wire();
    await Chart.load();
    Screener.build();
    Multi.init();
    Resize.init();
    Strip.init();
    Notes.init();
    Intel.init();
    Brain.init();
    OBChat.init();
    Bots.init();
    MarketSources.ready = true;
    MarketSources.refresh();
    this.updateSymBtn();
    this.stats();
    setInterval(() => this.stats(), 120000);
    this.clock();
    setInterval(() => this.clock(), 1000);
    document.getElementById('bootSplash').classList.remove('show');
  },

  setSymbol(sym){
    if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym)){
      toast(MarketSources.reason(sym), 'warn'); return;
    }
    const known = STORE.tickers.has(sym) ||
      (typeof MK !== 'undefined' && MK.isKnown(sym)) ||
      (typeof BROKER !== 'undefined' && BROKER.is(sym)) || Feed.bridgeHas(sym);
    if (sym === STORE.symbol || !known) return;
    STORE.symbol = sym;
    localStorage.setItem('astra_symbol', sym);
    this.updateSymBtn();
    Chart.load();
    BUS.emit('symbol', sym);          // torn-off windows follow this
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
    document.getElementById('symBtnName').textContent = STORE.symbol ? MK.short(STORE.symbol) : 'Choose instrument';
    const px = document.getElementById('symBtnPx');
    if (t){
      px.innerHTML = `<b>${fmtPrice(t.last)}</b><span class="${pctClass(t.pct)}">${fmtPct(t.pct)}</span>`;
      document.title = fmtPrice(t.last) + ' ' + baseAsset(STORE.symbol) + ' · ASTRA';
    } else { px.textContent = ''; document.title = 'ASTRA · JustMarkets Terminal'; }
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
    document.getElementById('marketSettingsBtn').addEventListener('click', () => this.openFeed());

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
    const brandHome = document.getElementById('brand');
    if (brandHome){
      brandHome.title = 'Back to the main terminal (reloads it)';
      brandHome.addEventListener('click', () => {
        /* a torn-off window comes back as the full terminal; the main window
           simply reloads to a clean start */
        location.href = location.pathname;
      });
    }

    document.getElementById('themeBtn').addEventListener('click', () => {
      STORE.theme = STORE.theme === 'dark' ? 'light' : 'dark';
      localStorage.setItem('astra_theme', STORE.theme);
      document.documentElement.dataset.theme = STORE.theme;
      BUS.emit('theme', STORE.theme);
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
        if (b.dataset.tab === 'bots') Bots.render();
      }));
    document.getElementById('botCollapse').addEventListener('click', () => {
      const bp = document.getElementById('bottomPanel');
      bp.classList.toggle('collapsed');
      if (!bp.classList.contains('collapsed') && document.getElementById('bot-heatmap').classList.contains('active')) Heat.show();
    });

    /* ---------- maximise the chart ----------
       Hides the movers strip, the bottom panel and the side rail so the candles
       get the whole window. The drawing toolbar stays — the whole point of a big
       chart is to draw on it. M toggles, Escape comes back out. */
    const setMax = on => {
      document.documentElement.dataset.chartmax = on ? '1' : '';
      if (!on) delete document.documentElement.dataset.chartmax;
      localStorage.setItem('astra_chartmax', on ? '1' : '');
      /* the chart measures itself against its box, so it has to be told */
      setTimeout(() => {
        try { Chart.main.applyOptions({}); } catch(e){}
        if (typeof Draw !== 'undefined'){ Draw.resize(); Draw.redraw(); }
        window.dispatchEvent(new Event('resize'));
      }, 60);
    };
    const maxBtn = document.getElementById('maxBtn');
    if (maxBtn) maxBtn.addEventListener('click', () =>
      setMax(document.documentElement.dataset.chartmax !== '1'));
    if (localStorage.getItem('astra_chartmax') === '1') setMax(true);
    window.addEventListener('keydown', e => {
      if (e.key === 'Escape' && document.documentElement.dataset.chartmax === '1') setMax(false);
      const t = (e.target && e.target.tagName) || '';
      if (t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT') return;
      if ((e.key === 'm' || e.key === 'M') && (e.altKey || (typeof Draw !== 'undefined' && Draw.singleKeys && Draw.singleKeys()))){
        /* M is the measure tool's own key when single letters are on, so the
           maximise toggle takes Alt+M there and plain M only otherwise */
        if (typeof Draw !== 'undefined' && Draw.singleKeys && Draw.singleKeys() && !e.altKey) return;
        e.preventDefault();
        setMax(document.documentElement.dataset.chartmax !== '1');
      }
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
        document.getElementById('wsLbl').textContent = s.mode === 'poll' ? 'MT5 · CONNECTED' : s.up ? 'LIVE · BINANCE' : 'RECONNECTING…';
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

  indTab: 'inputs',

  openIndicators(){
    const host = document.getElementById('indList');
    host.innerHTML = INDS.map(def => {
      const c = Chart.settings[def.id] || def.def;
      const parts = def.parts || [];
      const on = c.on ? ' checked' : '';

      /* --- INPUTS: parameters and which price the indicator reads --- */
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
          '</select>' : '';
      const target = `<select class="tsel indTarget" data-id="${def.id}" data-k="target" title="Which window to draw it in">` +
        IND_TARGETS.map(([v, l]) => `<option value="${v}"${v === c.target ? ' selected' : ''}>${l}</option>`).join('') + '</select>';

      /* --- STYLE: colour, thickness, dash and per-line visibility --- */
      const hidden = c.hidden || {};
      const style = parts.map(pt =>
        `<span class="stLine">
           ${pt.noHide ? '' : `<label class="stEye" title="Show this line"><input type="checkbox" data-id="${def.id}" data-hide="${pt.key}"${hidden[pt.key] ? '' : ' checked'}></label>`}
           <input type="color" data-id="${def.id}" data-ck="${pt.key}" value="${this.toHex((c.colors || {})[pt.key] || pt.color)}">
           <i>${esc(pt.label)}</i>
         </span>`).join('') +
        `<span class="stLine"><input type="number" data-id="${def.id}" data-k="width" value="${c.width || 1}" min="1" max="5" style="width:44px"><i>Thickness</i></span>` +
        `<span class="stLine"><select class="tsel" data-id="${def.id}" data-k="style">` +
        IND_STYLES.map(([v, l]) => `<option value="${v}"${v === (c.style || 0) ? ' selected' : ''}>${l}</option>`).join('') +
        `</select><i>Line</i></span>`;

      /* --- VISIBILITY: which timeframes it appears on --- */
      const tfs = c.tfs || CFG.TFS.map(t => t[0]);
      const vis = CFG.TFS.map(([v, lbl]) =>
        `<label class="stTf"><input type="checkbox" data-id="${def.id}" data-tf="${v}"${tfs.includes(v) ? ' checked' : ''}>${lbl}</label>`).join('') +
        `<button class="bMini" data-alltf="${def.id}">All</button>`;

      return `<div class="indRow">` +
        `<label class="main"><input type="checkbox" data-id="${def.id}" data-k="on"${on}>` +
        `<span class="chip" style="background:${this.toHex(parts[0] ? parts[0].color : '#3d5a80')}"></span>${esc(def.label)}` +
        (def.note ? `<i class="indNote" title="${esc(def.note)}">?</i>` : '') + `</label>` +
        `<span class="indPane inputs"><span class="indParams">${params}${applyTo}</span>${target}</span>` +
        `<span class="indPane style">${style}</span>` +
        `<span class="indPane vis">${vis}</span>` +
        `</div>`;
    }).join('');

    host.querySelectorAll('[data-alltf]').forEach(b => b.addEventListener('click', () => {
      host.querySelectorAll(`[data-id="${b.dataset.alltf}"][data-tf]`).forEach(x => { x.checked = true; });
    }));

    const tabs = document.getElementById('indTabs');
    tabs.querySelectorAll('button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.itab === this.indTab);
      btn.onclick = () => { this.indTab = btn.dataset.itab; this.applyIndTab(); };
    });
    this.applyIndTab();

    document.getElementById('i_vp').checked = Chart.settings.vp.on;
    document.getElementById('i_pat').checked = Chart.settings.patterns.on;
    this.showModal('indModal');
  },

  applyIndTab(){
    const t = this.indTab;
    document.getElementById('indList').className = 'showing-' + t;
    document.getElementById('indTabs').querySelectorAll('button')
      .forEach(b => b.classList.toggle('active', b.dataset.itab === t));
    document.getElementById('indHint').textContent =
      t === 'inputs' ? 'Settings and the price each indicator reads. “Show in” chooses the price chart or one of three windows — two indicators pointed at the same window are drawn together.'
      : t === 'style' ? 'Colour of every individual line, its thickness and whether it is solid or dashed. The tick beside a colour hides just that line while keeping the rest.'
      : 'Choose the timeframes each indicator appears on — for example show a 200-period average only from 15m upwards, so it does not clutter a 1-second chart.';
  },

  /* ---------- one indicator's own properties ----------
     Clicking the name of an indicator on the chart opens just that one, with
     everything about it on a single card: its numbers, the price it reads, the
     window it lives in, the colour and thickness of every individual line, and
     the timeframes it appears on. */
  /* the catalogue stores short keys — spell them out in the properties card */
  PARAM_NAMES: {
    len: 'Length', f: 'Fast length', s: 'Slow length', sig: 'Signal length',
    k: '%K length', d: '%D length', smooth: 'Smoothing', mult: 'Multiplier',
    b: 'Bands (deviations)', pct: 'Percent', step: 'Step', max: 'Maximum step',
    t: 'Trigger length', type: 'Type', bars: 'Candles to score', minScore: 'Minimum to trade',
    width: 'Thickness',
  },

  openIndProps(id){
    const def = IND_BY_ID[id];
    if (!def) return;
    const c = Chart.settings[id] || def.def;
    const parts = def.parts || [];

    const params = (def.params || []).map(p => {
      const val = c[p.k];
      const label = p.label || this.PARAM_NAMES[p.k] || p.k;
      const field = p.kind === 'sel'
        ? `<select class="tsel" data-id="${id}" data-k="${p.k}">` +
          p.opts.map(([v, l]) => `<option value="${v}"${v === val ? ' selected' : ''}>${l}</option>`).join('') + '</select>'
        : `<input type="number" data-id="${id}" data-k="${p.k}" value="${val}" min="${p.min}" max="${p.max}"${p.step ? ` step="${p.step}"` : ''}>`;
      return `<label class="ipRow"><span>${esc(label)}</span>${field}</label>`;
    }).join('');

    const applyTo = def.applyTo
      ? `<label class="ipRow"><span>Apply to</span><select class="tsel" data-id="${id}" data-k="src">` +
        IND.SOURCES.map(([v, l]) => `<option value="${v}"${v === (c.src || 'close') ? ' selected' : ''}>${l}</option>`).join('') +
        '</select></label>' : '';

    const target = `<label class="ipRow"><span>Show in</span><select class="tsel" data-id="${id}" data-k="target">` +
      IND_TARGETS.map(([v, l]) => `<option value="${v}"${v === (c.target || 'main') ? ' selected' : ''}>${l}</option>`).join('') + '</select></label>';

    const hidden = c.hidden || {};
    const lines = parts.map(pt =>
      `<label class="ipRow"><span>${esc(pt.label)}</span>
         <span class="ipLine">
           ${pt.noHide ? '' : `<input type="checkbox" data-id="${id}" data-hide="${pt.key}"${hidden[pt.key] ? '' : ' checked'} title="Show this line">`}
           <input type="color" data-id="${id}" data-ck="${pt.key}" value="${this.toHex((c.colors || {})[pt.key] || pt.color)}">
         </span></label>`).join('');

    const look = `<label class="ipRow"><span>Thickness</span><input type="number" data-id="${id}" data-k="width" value="${c.width || 1}" min="1" max="5"></label>` +
      `<label class="ipRow"><span>Line style</span><select class="tsel" data-id="${id}" data-k="style">` +
      IND_STYLES.map(([v, l]) => `<option value="${v}"${v === (c.style || 0) ? ' selected' : ''}>${l}</option>`).join('') + '</select></label>';

    const tfs = c.tfs || CFG.TFS.map(t => t[0]);
    const vis = CFG.TFS.map(([v, lbl]) =>
      `<label class="stTf"><input type="checkbox" data-id="${id}" data-tf="${v}"${tfs.includes(v) ? ' checked' : ''}>${lbl}</label>`).join('') +
      `<button class="bMini" id="ipAllTf">All</button>`;

    document.getElementById('indPropTitle').textContent = def.label;
    document.getElementById('indPropBody').innerHTML =
      (def.note ? `<div class="indHint">${esc(def.note)}</div>` : '') +
      (params || applyTo ? `<div class="ipSec"><h4>Inputs</h4>${params}${applyTo}</div>` : '') +
      `<div class="ipSec"><h4>Window</h4>${target}</div>` +
      `<div class="ipSec"><h4>Style</h4>${lines}${look}</div>` +
      `<div class="ipSec"><h4>Timeframes</h4><div class="ipTfs">${vis}</div></div>`;

    const all = document.getElementById('ipAllTf');
    if (all) all.onclick = () => document.querySelectorAll('#indPropBody [data-tf]').forEach(x => { x.checked = true; });
    document.getElementById('indPropApply').onclick = () => {
      this.readIndControls('#indPropBody');
      lsSet('astra_ind', Chart.settings);
      this.hideModal('indPropModal');
      Chart.renderAll();
    };
    document.getElementById('indPropRemove').onclick = () => {
      const cfg = Chart.settings[id];
      if (cfg) cfg.on = false;
      lsSet('astra_ind', Chart.settings);
      this.hideModal('indPropModal');
      Chart.renderAll();
    };
    this.showModal('indPropModal');
  },

  /* reads the controls of one card or of the whole list — both dialogs share the
     same data- attributes, so the writing side exists exactly once */
  readIndControls(sel){
    const S = Chart.settings;
    const tfSeen = {};
    document.querySelectorAll(sel + ' [data-id]').forEach(el => {
      const cfg = S[el.dataset.id];
      if (!cfg) return;
      if (el.dataset.ck){                       /* a colour for one line */
        cfg.colors = cfg.colors || {};
        cfg.colors[el.dataset.ck] = el.value;
        return;
      }
      if (el.dataset.hide){                     /* per-line visibility */
        cfg.hidden = cfg.hidden || {};
        if (el.checked) delete cfg.hidden[el.dataset.hide];
        else cfg.hidden[el.dataset.hide] = true;
        return;
      }
      if (el.dataset.tf){                       /* timeframe visibility */
        const list = tfSeen[el.dataset.id] = tfSeen[el.dataset.id] || [];
        if (el.checked) list.push(el.dataset.tf);
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
    for (const [id, list] of Object.entries(tfSeen)) if (S[id]) S[id].tfs = list;
  },

  applyIndicators(){
    const S = Chart.settings;
    this.readIndControls('#indList');
    S.vp = { on: document.getElementById('i_vp').checked };
    S.patterns = { on: document.getElementById('i_pat').checked };
    lsSet('astra_ind', S);
    this.hideModal('indModal');
    Chart.renderAll();
  },

  async stats(){
    if (typeof MarketSources !== 'undefined' && !MarketSources.binanceOn()) return;
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
    MarketSources.render();
    const acct = document.getElementById('acctType');
    if (acct && !acct.dataset.wired){
      acct.dataset.wired = '1';
      acct.addEventListener('change', () => {
        BROKER.setAccount(acct.value);
        toast('Costs now modelled as a JustMarkets ' + acct.value + ' account', 'ok');
      });
    }
    if (acct) acct.value = BROKER.account;
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
      row('Crypto (Binance)', MarketSources.binanceOn(), MarketSources.binanceOn() ? 'Enabled in Market settings' : 'Disabled — no exchange connections') +
      row('Data service', Feed.apiReady, Feed.apiReady
        ? 'connected' + (Feed.apiBase ? ' · ' + Feed.apiBase : ' · this page') + ' — stocks, forex, indices, commodities'
        : 'not reachable') +
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
