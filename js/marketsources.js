/* Market availability is separate from price freshness and pair permissions.
   The owner approved this one new preference key; no saved ledger is rewritten. */
const MarketSources = {
  KEY: 'astra_market_sources_v1',
  state: { binance: false },
  revision: 0,
  ready: false,
  read(){ return { binance: lsGet(this.KEY, null)?.binance === true }; },
  binanceOn(){ return this.state.binance === true; },
  brokerOn(){ return !!Feed.bridge && /^JustMarkets/i.test(Feed.bridge.server || ''); },
  brokerSymbol(sym){ return this.brokerOn() && Feed.bridgeHas(sym); },
  allowed(sym){
    if (!sym) return false;
    if (this.brokerSymbol(sym)) return true;
    // A broker CFD never becomes a Binance spot pair when MT5 disconnects.
    return !BROKER.is(sym) && /USDT$/.test(sym) && this.binanceOn();
  },
  executable(sym, source){
    return this.allowed(sym) && (this.brokerSymbol(sym) ? source === 'bridge' : source === 'binance');
  },
  reason(sym){
    return /USDT$/.test(sym || '') && !BROKER.is(sym)
      ? 'Binance is disabled in Market settings.'
      : 'This instrument is not available from the connected JustMarkets account. Check Market settings.';
  },
  brokerList(){
    if (!this.brokerOn()) return [];
    const out = [], seen = new Set();
    for (const sym of [...BROKER.all(), ...Feed.bridge.symbols]){
      if (!this.brokerSymbol(sym)) continue;
      const key = Feed.brokerName(sym);
      if (!seen.has(key)){ seen.add(key); out.push(sym); }
    }
    return out;
  },
  list(){ return [...this.brokerList(), ...(this.binanceOn() ? STORE.universe : [])]; },
  fallback(sym){
    if (this.allowed(sym)) return sym;
    const base = Feed.baseOf(sym || '').replace(/USDT$/, 'USD');
    const list = this.brokerList();
    return list.find(s => Feed.baseOf(s) === base) || list[0] || (this.binanceOn() ? STORE.universe[0] : '') || '';
  },
  init(){
    this.state = this.read();
    window.addEventListener('storage', e => {
      if (e.key !== this.KEY && e.key !== null) return;
      const next = this.read();
      if (next.binance !== this.state.binance){ this.state = next; this.apply(); }
    });
    BUS.on('feed', () => {
      const key = this.brokerList().join('|');
      if (this.ready && key !== this.brokerKey) this.refresh();
    });
  },
  async setBinance(on){
    const next = { binance: on === true };
    if (!lsSet(this.KEY, next)){
      toast('Market settings could not be saved. The previous setting is still active.', 'error');
      this.render(); return false;
    }
    this.state = next;
    await this.apply();
    return true;
  },
  async apply(){
    const revision = ++this.revision;
    this.render();
    if (!this.binanceOn()){
      Sock.stopAll();
      API.cancelBinance();
      STORE.universe = [];
      for (const [sym] of STORE.tickers){
        if (/USDT$/.test(sym) && !this.brokerSymbol(sym)) STORE.tickers.delete(sym);
      }
      for (const sym of Object.keys(Feed.srcOf)) if (Feed.srcOf[sym] === 'binance'){
        delete Feed.srcOf[sym]; delete Feed.quoteTime[sym];
      }
    } else {
      try { await bootMarketData(); }
      catch(e){ if (revision === this.revision && this.binanceOn()) toast('Binance data could not be loaded: ' + e.message, 'error'); }
      if (revision !== this.revision || !this.binanceOn()) return;
      startGlobalStream();
    }
    this.refresh();
  },
  refresh(){
    this.brokerKey = this.brokerList().join('|');
    this.render();
    if (!this.ready) return;
    const old = STORE.symbol;
    STORE.symbol = this.fallback(old); // keep the saved selection for re-enabling later
    if (old !== STORE.symbol || !Chart.raw.length) Chart.load();
    App.updateSymBtn();
    App.renderFeed();
    Watch.render(); Screener.rebuild(); Strip.build();
    if (Heat.data){ Heat.data = null; Heat.show(); }
    for (const id of ['stMcap', 'stMcapCh', 'stBtcD', 'stEthD', 'stFng']){
      const el = document.getElementById(id);
      if (el) el.closest('.stItem').style.display = this.binanceOn() ? '' : 'none';
    }
    const wsLabel = document.getElementById('wsLbl');
    if (wsLabel && !this.binanceOn()) wsLabel.textContent = this.brokerOn() ? 'MT5 · CONNECTED' : 'WAITING FOR MT5';
    if (typeof Intel !== 'undefined' && this.binanceOn() && !Intel.btcDaily) Intel.loadHistory();
    MarketBrowser.renderTabs(); MarketBrowser.render();
    if (document.getElementById('symModal')?.classList.contains('show'))
      SymbolSearch.render(document.getElementById('symInput').value);
    for (const cell of Multi.cells || []) Multi.loadCell(cell);
    for (const sym of Object.keys(Chart.cmpSeries || {})) if (!this.allowed(sym)){
      try { Chart.main.removeSeries(Chart.cmpSeries[sym]); } catch(e){}
      delete Chart.cmpSeries[sym];
    }
    Chart.loadCompares();
    MK.refresh(); Bots.render();
    BUS.emit('marketSources');
  },
  render(){
    const host = document.getElementById('marketSourceSettings');
    if (!host) return;
    const on = this.binanceOn(), broker = this.brokerOn();
    host.innerHTML = `<div class="feedRow"><i class="fdDot ${broker ? 'on' : 'off'}"></i><b>JustMarkets</b><span>${broker
      ? this.brokerList().length + ' instruments reported by your MT5 account'
      : 'Waiting for your JustMarkets MT5 bridge. Unsupported markets stay hidden.'}</span></div>
      <div class="feedRow"><i class="fdDot ${on ? 'on' : 'off'}"></i><b>Binance: ${on ? 'ON' : 'OFF'}</b>
      <span>${on ? 'Exchange pairs, prices and paper trading enabled' : 'Pairs hidden · connections and new entries disabled'}</span></div>
      <button class="mPrimary" id="binanceToggle">${on ? 'Disable Binance' : 'Enable Binance'}</button>
      <p class="aiSub">Broker crypto such as ETHUSD.m uses JustMarkets prices. Public-feed instruments are hidden.
      Existing trades, stops, targets and watchlist choices are kept. Paper positions and waiting orders on a disabled source pause until you enable it again and a fresh price arrives.</p>`;
    host.querySelector('#binanceToggle').addEventListener('click', () => this.setBinance(!this.binanceOn()));
  },
};
