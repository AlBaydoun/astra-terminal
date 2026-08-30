/* ASTRA Terminal — broker instrument layer (JustMarkets / MetaTrader 5 style).
   You see the symbols exactly as they appear in your MT5 terminal (XAUUSD.m,
   US100.std, WTI.m …). Where the ASTRA MT5 bridge is running, prices come straight
   from your broker with no delay. Without it, each instrument falls back to the
   closest public feed, and the terminal always tells you which one it used and how
   fresh it is — it never pretends delayed data is live. */
const BROKER = {
  name: 'JustMarkets',

  /* symbol, display name, group, public fallback feed, price digits */
  LIST: [
    // ---- metals -------------------------------------------------------
    ['XAUUSD.m', 'Gold / US Dollar',        'metal', 'GC=F',   2, 'PAXGUSDT'],
    ['XAGUSD.m', 'Silver / US Dollar',      'metal', 'SI=F',   3, null],
    ['XPTUSD.m', 'Platinum / US Dollar',    'metal', 'PL=F',   2, null],
    // ---- energy -------------------------------------------------------
    ['WTI.m',    'Crude Oil WTI',           'energy', 'CL=F',  2, null],
    ['BRENT.m',  'Crude Oil Brent',         'energy', 'BZ=F',  2, null],
    ['NATGAS.m', 'Natural Gas',             'energy', 'NG=F',  3, null],
    // ---- indices ------------------------------------------------------
    ['US100.std', 'Nasdaq 100',             'index', '^NDX',    1, null],
    ['US30.std',  'Dow Jones 30',           'index', '^DJI',    1, null],
    ['US500.std', 'S&P 500',                'index', '^GSPC',   1, null],
    ['GER40.std', 'DAX 40 (Germany)',       'index', '^GDAXI',  1, null],
    ['UK100.std', 'FTSE 100 (UK)',          'index', '^FTSE',   1, null],
    ['FRA40.std', 'CAC 40 (France)',        'index', '^FCHI',   1, null],
    ['EUSTX50.std','Euro Stoxx 50',         'index', '^STOXX50E', 1, null],
    ['JPN225.std','Nikkei 225 (Japan)',     'index', '^N225',   1, null],
    ['HK50.std',  'Hang Seng (Hong Kong)',  'index', '^HSI',    1, null],
    ['AUS200.std','ASX 200 (Australia)',    'index', '^AXJO',   1, null],
    // ---- crypto (real-time even without the bridge) ---------------------
    ['BTCUSD.m', 'Bitcoin',                 'crypto', 'BTCUSDT',  2, null],
    ['ETHUSD.m', 'Ethereum',                'crypto', 'ETHUSDT',  2, null],
    ['XRPUSD.m', 'Ripple',                  'crypto', 'XRPUSDT',  4, null],
    ['SOLUSD.m', 'Solana',                  'crypto', 'SOLUSDT',  3, null],
    ['LTCUSD.m', 'Litecoin',                'crypto', 'LTCUSDT',  2, null],
    ['ADAUSD.m', 'Cardano',                 'crypto', 'ADAUSDT',  4, null],
    ['DOGEUSD.m','Dogecoin',                'crypto', 'DOGEUSDT', 5, null],
    ['BNBUSD.m', 'BNB',                     'crypto', 'BNBUSDT',  2, null],
    // ---- forex majors --------------------------------------------------
    ['EURUSD.m', 'Euro / US Dollar',        'fx', 'EURUSD=X', 5, null],
    ['GBPUSD.m', 'Pound / US Dollar',       'fx', 'GBPUSD=X', 5, null],
    ['USDJPY.m', 'US Dollar / Yen',         'fx', 'USDJPY=X', 3, null],
    ['USDCHF.m', 'US Dollar / Swiss Franc', 'fx', 'USDCHF=X', 5, null],
    ['AUDUSD.m', 'Aussie / US Dollar',      'fx', 'AUDUSD=X', 5, null],
    ['USDCAD.m', 'US Dollar / Loonie',      'fx', 'USDCAD=X', 5, null],
    ['NZDUSD.m', 'Kiwi / US Dollar',        'fx', 'NZDUSD=X', 5, null],
    // ---- forex crosses -------------------------------------------------
    ['EURGBP.m', 'Euro / Pound',            'fx', 'EURGBP=X', 5, null],
    ['EURJPY.m', 'Euro / Yen',              'fx', 'EURJPY=X', 3, null],
    ['GBPJPY.m', 'Pound / Yen',             'fx', 'GBPJPY=X', 3, null],
    ['EURCHF.m', 'Euro / Swiss Franc',      'fx', 'EURCHF=X', 5, null],
    ['AUDJPY.m', 'Aussie / Yen',            'fx', 'AUDJPY=X', 3, null],
    ['CHFJPY.m', 'Swiss Franc / Yen',       'fx', 'CHFJPY=X', 3, null],
    ['EURAUD.m', 'Euro / Aussie',           'fx', 'EURAUD=X', 5, null],
    ['GBPAUD.m', 'Pound / Aussie',          'fx', 'GBPAUD=X', 5, null],
    ['CADJPY.m', 'Loonie / Yen',            'fx', 'CADJPY=X', 3, null],
    // ---- exotics --------------------------------------------------------
    ['USDTRY.m', 'US Dollar / Turkish Lira','fx', 'USDTRY=X', 4, null],
    ['USDZAR.m', 'US Dollar / Rand',        'fx', 'USDZAR=X', 4, null],
    ['USDMXN.m', 'US Dollar / Mexican Peso','fx', 'USDMXN=X', 4, null],
    ['USDPLN.m', 'US Dollar / Zloty',       'fx', 'USDPLN=X', 4, null],
  ],

  map: {},        // symbol -> {sym,name,group,feed,digits,alt}
  bridgeSymbols: null,   // what the live MT5 bridge reports, when connected

  init(){
    for (const [sym, name, group, feed, digits, alt] of this.LIST)
      this.map[sym] = { sym, name, group, feed, digits, alt };
  },

  is(sym){ return !!this.map[sym]; },
  info(sym){ return this.map[sym] || null; },
  all(){ return this.LIST.map(x => x[0]); },
  byGroup(g){ return this.LIST.filter(x => x[2] === g).map(x => x[0]); },

  /* where should this instrument's data come from right now? */
  feedFor(sym){
    const i = this.map[sym];
    if (!i) return null;
    if (typeof Feed !== 'undefined' && Feed.bridgeHas(sym)) return { kind: 'bridge', addr: sym };
    if (/USDT$/.test(i.feed)) return { kind: 'binance', addr: i.feed };
    return { kind: 'proxy', addr: i.feed };
  },

  /* an always-on 24/7 stand-in (e.g. gold token for XAUUSD when metals are shut) */
  altFeed(sym){
    const i = this.map[sym];
    return i && i.alt ? { kind: 'binance', addr: i.alt } : null;
  },
};
BROKER.init();
