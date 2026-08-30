/* ASTRA Terminal — multi-market registry.
   Crypto comes live from Binance (websocket). Stocks (US + Europe), forex,
   commodities and indices come from the ASTRA data proxy, which fetches them
   server-side and republishes them (browsers cannot call those sources directly).
   Non-crypto prices are polled, not streamed, and follow their exchange hours. */
const MK = {
  GROUPS: [
    { id: 'broker', label: BROKER.name, sub: 'the instruments you trade in MT5' },
    { id: 'crypto', label: 'Crypto',      sub: 'Binance · 24/7 live' },
    { id: 'fx',     label: 'Forex',       sub: 'major currency pairs' },
    { id: 'us',     label: 'US stocks',   sub: 'NYSE · Nasdaq' },
    { id: 'eu',     label: 'Europe',      sub: 'XETRA · Paris · Amsterdam · London · Zurich · Milan · Madrid' },
    { id: 'index',  label: 'Indices',     sub: 'world benchmarks' },
    { id: 'comm',   label: 'Commodities', sub: 'metals · energy' },
  ],

  /* curated catalog — [symbol, name] (crypto is taken from the live Binance list) */
  CATALOG: {
    fx: [
      ['EURUSD=X', 'Euro / US Dollar'], ['GBPUSD=X', 'British Pound / US Dollar'],
      ['USDJPY=X', 'US Dollar / Japanese Yen'], ['USDCHF=X', 'US Dollar / Swiss Franc'],
      ['AUDUSD=X', 'Australian Dollar / US Dollar'], ['USDCAD=X', 'US Dollar / Canadian Dollar'],
      ['NZDUSD=X', 'New Zealand Dollar / US Dollar'], ['EURGBP=X', 'Euro / British Pound'],
      ['EURJPY=X', 'Euro / Japanese Yen'], ['GBPJPY=X', 'British Pound / Japanese Yen'],
      ['EURCHF=X', 'Euro / Swiss Franc'], ['AUDJPY=X', 'Australian Dollar / Japanese Yen'],
      ['USDTRY=X', 'US Dollar / Turkish Lira'], ['EURTRY=X', 'Euro / Turkish Lira'],
      ['USDCNY=X', 'US Dollar / Chinese Yuan'], ['USDSEK=X', 'US Dollar / Swedish Krona'],
      ['USDNOK=X', 'US Dollar / Norwegian Krone'], ['USDPLN=X', 'US Dollar / Polish Zloty'],
      ['USDMXN=X', 'US Dollar / Mexican Peso'], ['USDZAR=X', 'US Dollar / South African Rand'],
    ],
    us: [
      ['AAPL', 'Apple'], ['MSFT', 'Microsoft'], ['NVDA', 'NVIDIA'], ['GOOGL', 'Alphabet'],
      ['AMZN', 'Amazon'], ['META', 'Meta Platforms'], ['TSLA', 'Tesla'], ['AVGO', 'Broadcom'],
      ['BRK-B', 'Berkshire Hathaway'], ['JPM', 'JPMorgan Chase'], ['V', 'Visa'], ['MA', 'Mastercard'],
      ['WMT', 'Walmart'], ['XOM', 'Exxon Mobil'], ['UNH', 'UnitedHealth'], ['JNJ', 'Johnson & Johnson'],
      ['PG', 'Procter & Gamble'], ['HD', 'Home Depot'], ['COST', 'Costco'], ['ORCL', 'Oracle'],
      ['AMD', 'AMD'], ['NFLX', 'Netflix'], ['CRM', 'Salesforce'], ['INTC', 'Intel'],
      ['KO', 'Coca-Cola'], ['PEP', 'PepsiCo'], ['DIS', 'Walt Disney'], ['BAC', 'Bank of America'],
      ['PFE', 'Pfizer'], ['MRK', 'Merck'], ['CSCO', 'Cisco'], ['ADBE', 'Adobe'],
      ['QCOM', 'Qualcomm'], ['BA', 'Boeing'], ['NKE', 'Nike'], ['MCD', "McDonald's"],
      ['GS', 'Goldman Sachs'], ['CAT', 'Caterpillar'], ['IBM', 'IBM'], ['GE', 'GE Aerospace'],
      ['T', 'AT&T'], ['VZ', 'Verizon'], ['PLTR', 'Palantir'], ['COIN', 'Coinbase'],
      ['MSTR', 'MicroStrategy'], ['UBER', 'Uber'], ['ABNB', 'Airbnb'], ['PYPL', 'PayPal'],
      ['SBUX', 'Starbucks'], ['LMT', 'Lockheed Martin'], ['SPY', 'S&P 500 ETF'], ['QQQ', 'Nasdaq 100 ETF'],
    ],
    eu: [
      ['SAP.DE', 'SAP'], ['SIE.DE', 'Siemens'], ['ALV.DE', 'Allianz'], ['DTE.DE', 'Deutsche Telekom'],
      ['MBG.DE', 'Mercedes-Benz'], ['BMW.DE', 'BMW'], ['VOW3.DE', 'Volkswagen'], ['P911.DE', 'Porsche AG'],
      ['BAS.DE', 'BASF'], ['BAYN.DE', 'Bayer'], ['ADS.DE', 'Adidas'], ['DBK.DE', 'Deutsche Bank'],
      ['RWE.DE', 'RWE'], ['IFX.DE', 'Infineon'], ['DHL.DE', 'DHL Group'], ['MUV2.DE', 'Munich Re'],
      ['ENR.DE', 'Siemens Energy'], ['SHL.DE', 'Siemens Healthineers'], ['HEN3.DE', 'Henkel'],
      ['AIR.PA', 'Airbus'], ['MC.PA', 'LVMH'], ['OR.PA', "L'Oréal"], ['TTE.PA', 'TotalEnergies'],
      ['SAN.PA', 'Sanofi'], ['BNP.PA', 'BNP Paribas'], ['SU.PA', 'Schneider Electric'],
      ['RMS.PA', 'Hermès'], ['CS.PA', 'AXA'], ['DG.PA', 'Vinci'],
      ['ASML.AS', 'ASML'], ['ADYEN.AS', 'Adyen'], ['INGA.AS', 'ING Group'], ['HEIA.AS', 'Heineken'],
      ['PRX.AS', 'Prosus'], ['NESN.SW', 'Nestlé'], ['NOVN.SW', 'Novartis'], ['ROG.SW', 'Roche'],
      ['UBSG.SW', 'UBS'], ['ZURN.SW', 'Zurich Insurance'], ['ABBN.SW', 'ABB'],
      ['SHEL.L', 'Shell'], ['AZN.L', 'AstraZeneca'], ['HSBA.L', 'HSBC'], ['ULVR.L', 'Unilever'],
      ['BP.L', 'BP'], ['RIO.L', 'Rio Tinto'], ['GSK.L', 'GSK'], ['VOD.L', 'Vodafone'],
      ['BARC.L', 'Barclays'], ['LSEG.L', 'London Stock Exchange'],
      ['ISP.MI', 'Intesa Sanpaolo'], ['ENI.MI', 'Eni'], ['ENEL.MI', 'Enel'], ['UCG.MI', 'UniCredit'],
      ['STLAM.MI', 'Stellantis'], ['SAN.MC', 'Banco Santander'], ['IBE.MC', 'Iberdrola'],
      ['ITX.MC', 'Inditex'], ['BBVA.MC', 'BBVA'],
      ['NOVO-B.CO', 'Novo Nordisk'], ['VOLV-B.ST', 'Volvo'], ['EQNR.OL', 'Equinor'],
    ],
    index: [
      ['^GSPC', 'S&P 500'], ['^DJI', 'Dow Jones'], ['^IXIC', 'Nasdaq Composite'],
      ['^NDX', 'Nasdaq 100'], ['^RUT', 'Russell 2000'], ['^VIX', 'Volatility Index'],
      ['^GDAXI', 'DAX (Germany)'], ['^FCHI', 'CAC 40 (France)'], ['^STOXX50E', 'Euro Stoxx 50'],
      ['^FTSE', 'FTSE 100 (UK)'], ['^IBEX', 'IBEX 35 (Spain)'], ['^AEX', 'AEX (Netherlands)'],
      ['^SSMI', 'SMI (Switzerland)'], ['FTSEMIB.MI', 'FTSE MIB (Italy)'],
      ['^N225', 'Nikkei 225 (Japan)'], ['^HSI', 'Hang Seng (Hong Kong)'], ['^BSESN', 'Sensex (India)'],
    ],
    comm: [
      ['GC=F', 'Gold'], ['SI=F', 'Silver'], ['PL=F', 'Platinum'], ['HG=F', 'Copper'],
      ['CL=F', 'Crude Oil (WTI)'], ['BZ=F', 'Crude Oil (Brent)'], ['NG=F', 'Natural Gas'],
      ['ZW=F', 'Wheat'], ['ZC=F', 'Corn'], ['KC=F', 'Coffee'],
    ],
  },

  /* what the user monitors outside crypto (synced with everything else) */
  monitored: lsGet('astra_monitored', [
    'XAUUSD.m', 'XAGUSD.m', 'BTCUSD.m', 'US100.std', 'US30.std', 'WTI.m', 'BRENT.m',
    'EURUSD.m', 'GBPUSD.m', 'USDJPY.m',
    'AAPL', 'MSFT', 'NVDA', 'SAP.DE', '^GDAXI',
  ]),

  names: {},          // symbol -> display name (catalog + anything found via search)
  meta: {},           // symbol -> {currency, exchange}
  pollTimer: null,

  init(){
    for (const [g, list] of Object.entries(this.CATALOG))
      for (const [sym, name] of list){ this.names[sym] = name; this.groupOf[sym] = g; }
  },
  groupOf: {},

  /* ---------- classification ---------- */
  isCrypto(sym){ return /USDT$/.test(sym); },
  group(sym){
    if (BROKER.is(sym)) return 'broker';
    if (this.isCrypto(sym)) return 'crypto';
    if (this.groupOf[sym]) return this.groupOf[sym];
    if (/=X$/.test(sym)) return 'fx';
    if (/=F$/.test(sym)) return 'comm';
    if (/^\^/.test(sym)) return 'index';
    if (/\.[A-Z]{1,3}$/.test(sym)) return 'eu';
    return 'us';
  },
  groupLabel(sym){
    const g = this.GROUPS.find(x => x.id === this.group(sym));
    return g ? g.label : '';
  },
  isKnown(sym){ return !!this.names[sym] || this.monitored.includes(sym) || STORE.tickers.has(sym); },

  /* short label for buttons/rows */
  short(sym){
    if (BROKER.is(sym)) return sym;          // show MT5 names exactly as the broker does
    if (this.isCrypto(sym)) return sym.replace(/USDT$/, '');
    if (/=X$/.test(sym)){
      const p = sym.replace('=X', '');
      return p.length === 6 ? p.slice(0, 3) + '/' + p.slice(3) : p;
    }
    if (/=F$/.test(sym)) return (this.names[sym] || sym.replace('=F', ''));
    if (/^\^/.test(sym) || /^FTSEMIB/.test(sym)) return (this.names[sym] || sym.replace('^', ''));
    return sym.replace(/\.[A-Z]{1,3}$/, '');
  },
  /* the small grey line under the name */
  sub(sym){
    if (BROKER.is(sym)){
      const i = BROKER.info(sym);
      const r = Feed.route(sym);
      return i.name + ' · ' + (r.kind === 'bridge' ? BROKER.name : r.kind === 'binance' ? 'Binance' : r.addr);
    }
    if (this.isCrypto(sym)) return 'USDT · Binance';
    const m = this.meta[sym];
    const name = this.names[sym];
    const g = this.groupLabel(sym);
    if (m && m.exchange) return (name && this.short(sym) !== name ? name + ' · ' : '') + m.exchange;
    return name && this.short(sym) !== name ? name + ' · ' + g : g;
  },
  currency(sym){
    if (this.isCrypto(sym)) return 'USDT';
    const m = this.meta[sym];
    return (m && m.currency) || '';
  },

  /* ---------- data (everything that is not a live Binance stream) ---------- */
  async fetchQuotes(symbols){
    const syms = symbols.filter(s => !this.streams(s));
    if (!syms.length) return [];
    return Feed.quotes(syms);
  },

  /* does this instrument arrive on the Binance websocket already? */
  streams(sym){
    if (this.isCrypto(sym)) return true;
    if (BROKER.is(sym)){
      const r = Feed.route(sym);
      return r.kind === 'binance';
    }
    return false;
  },

  applyQuotes(quotes){
    const changed = [];
    for (const q of quotes){
      const prev = STORE.tickers.get(q.symbol);
      STORE.tickers.set(q.symbol, {
        last: q.last, open: q.prev, high: q.high != null ? q.high : q.last,
        low: q.low != null ? q.low : q.last,
        vol: 0, quoteVol: prev ? prev.quoteVol : 0, pct: q.pct, count: 0,
      });
      this.meta[q.symbol] = { currency: q.currency, exchange: q.exchange };
      changed.push(q.symbol);
    }
    if (changed.length) BUS.emit('tickers', changed);
    return changed;
  },

  async refresh(extra){
    const wanted = new Set(this.monitored);
    for (const s of Watch.list || []) if (!this.isCrypto(s)) wanted.add(s);
    if (!this.isCrypto(STORE.symbol)) wanted.add(STORE.symbol);
    for (const s of Chart.compares || []) if (!this.isCrypto(s)) wanted.add(s);
    for (const c of (typeof Multi !== 'undefined' ? Multi.cells : [])) if (!this.isCrypto(c.sym)) wanted.add(c.sym);
    for (const s of extra || []) if (!this.isCrypto(s)) wanted.add(s);
    const list = [...wanted];
    if (!list.length) return [];
    return this.applyQuotes(await this.fetchQuotes(list));
  },

  startPolling(){
    if (this.pollTimer) return;
    this.refresh();
    this.pollTimer = setInterval(() => this.refresh(), 20000);
  },

  async klines(symbol, tf, limit){ return Feed.klines(symbol, tf, limit); },

  async search(q){
    try {
      const results = await Feed.search(q);
      for (const x of results) if (!this.names[x.symbol]) this.names[x.symbol] = x.name;
      return results;
    } catch(e){ return []; }
  },

  /* ---------- the user's monitoring picks ---------- */
  isMonitored(sym){ return this.isCrypto(sym) ? Watch.list.includes(sym) : this.monitored.includes(sym); },
  toggle(sym){
    if (this.isCrypto(sym)){
      Watch.list.includes(sym) ? Watch.remove(sym) : Watch.add(sym);
      return;
    }
    if (this.monitored.includes(sym)){
      this.monitored = this.monitored.filter(s => s !== sym);
      Watch.remove(sym);
    } else {
      this.monitored.push(sym);
      Watch.add(sym);
      this.refresh([sym]);
    }
    lsSet('astra_monitored', this.monitored);
    BUS.emit('watch');
  },
};
MK.init();

/* ---------- the markets browser ("choose what I monitor") ---------- */
const MarketBrowser = {
  group: 'broker',
  query: '',
  remote: [],

  open(){
    App.showModal('mktModal');
    this.renderTabs();
    this.render();
    const inp = document.getElementById('mktSearch');
    inp.value = '';
    this.query = '';
    setTimeout(() => inp.focus(), 60);
    MK.refresh(this.groupSymbols());
  },

  renderTabs(){
    const host = document.getElementById('mktTabs');
    host.innerHTML = MK.GROUPS.map(g =>
      `<button data-g="${g.id}"${g.id === this.group ? ' class="active"' : ''}>${esc(g.label)}</button>`).join('');
    host.querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
      this.group = b.dataset.g;
      this.renderTabs();
      this.render();
      MK.refresh(this.groupSymbols());
    }));
  },

  groupSymbols(){
    if (this.group === 'crypto') return [];
    if (this.group === 'broker') return BROKER.all();
    return (MK.CATALOG[this.group] || []).map(x => x[0]);
  },

  async onSearch(q){
    this.query = q.trim();
    this.render();
    if (this.query.length >= 2 && this.group !== 'crypto'){
      this.remote = await MK.search(this.query);
      if (this.remote.length){
        MK.refresh(this.remote.map(r => r.symbol));
        this.render();
      }
    } else this.remote = [];
  },

  rows(){
    const q = this.query.toUpperCase();
    if (this.group === 'broker'){
      return BROKER.LIST
        .filter(([s, n]) => !q || s.toUpperCase().includes(q) || n.toUpperCase().includes(q))
        .map(([s, n, g]) => ({ sym: s, name: n + ' · ' + g }));
    }
    if (this.group === 'crypto'){
      return STORE.universe.filter(s => !q || s.includes(q)).slice(0, 300)
        .map(s => ({ sym: s, name: 'Binance spot' }));
    }
    const cat = (MK.CATALOG[this.group] || [])
      .filter(([s, n]) => !q || s.toUpperCase().includes(q) || n.toUpperCase().includes(q))
      .map(([s, n]) => ({ sym: s, name: n }));
    const have = new Set(cat.map(r => r.sym));
    const extra = this.remote
      .filter(r => !have.has(r.symbol))
      .map(r => ({ sym: r.symbol, name: r.name + ' · ' + r.exchange, found: true }));
    return [...cat, ...extra];
  },

  render(){
    const host = document.getElementById('mktList');
    const rows = this.rows();
    host.innerHTML = rows.length ? rows.map(r => {
      const t = STORE.tickers.get(r.sym);
      const on = MK.isMonitored(r.sym);
      return `<div class="mktRow${on ? ' on' : ''}" data-sym="${esc(r.sym)}">` +
        `<span class="mkTick">${on ? '★' : '☆'}</span>` +
        `<span class="mkName"><b>${esc(MK.short(r.sym))}</b><i>${esc(r.name)}${r.found ? ' · found' : ''}</i></span>` +
        `<span class="mkPx">${t ? fmtPrice(t.last) : '<span class="dim2">…</span>'}</span>` +
        `<span class="mkPct ${t ? pctClass(t.pct) : ''}">${t ? fmtPct(t.pct) : ''}</span>` +
        `<button class="mkOpen" title="Open chart">Chart</button></div>`;
    }).join('') : '<div class="empty">Nothing found. Type at least 2 letters to search worldwide.</div>';

    host.querySelectorAll('.mktRow').forEach(row => {
      const sym = row.dataset.sym;
      row.addEventListener('click', e => {
        if (e.target.classList.contains('mkOpen')){
          App.hideModal('mktModal');
          App.setSymbol(sym);
          return;
        }
        MK.toggle(sym);
        this.render();
      });
    });
    const n = MK.monitored.length + (Watch.list || []).filter(s => MK.isCrypto(s)).length;
    document.getElementById('mktCount').textContent = n + ' monitored';
  },
};
