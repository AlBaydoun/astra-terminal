/* ASTRA Terminal — the data router.
   One place decides where every price comes from, and how fresh it is:
     1. MT5 bridge  — your own broker terminal (exact prices, no delay)
     2. Binance     — crypto, real-time websocket, always available
     3. ASTRA data service — stocks, forex, indices, commodities (public feeds)
   Nothing here ever hides a delay: every symbol carries a live/delayed/closed state. */
const Feed = {
  BRIDGE_URL: 'http://127.0.0.1:8644',
  apiBase: null,          // resolved data-service base ('' = same origin)
  apiReady: false,
  bridge: null,           // {account, server, symbols:Set} when the MT5 bridge answers
  quoteTime: {},          // symbol -> epoch seconds of the last real quote
  srcOf: {},              // symbol -> 'bridge' | 'binance' | 'proxy'

  bridgeMisses: 0,

  async init(){
    await Promise.all([this.findApi(), this.probeBridge()]);
    /* look for the bridge often while it is there, rarely while it is not
       (a missing bridge is the normal case and should stay quiet) */
    setInterval(() => {
      if (this.bridge || this.bridgeMisses % 3 === 0) this.probeBridge();
      else this.bridgeMisses++;
    }, 20000);
    if (!this.apiReady) setInterval(() => { if (!this.apiReady) this.findApi(); }, 60000);
  },

  /* ---------- data service discovery (no external cloud required) ---------- */
  candidates(){
    const saved = localStorage.getItem('astra_api');
    const list = [];
    if (saved) list.push(saved.replace(/\/+$/, ''));
    if (location.protocol === 'http:' || location.protocol === 'https:') list.push('');       // same origin
    if (location.protocol !== 'https:') list.push('http://127.0.0.1:8642');                    // local server
    return [...new Set(list)];
  },

  async findApi(){
    for (const base of this.candidates()){
      try {
        const r = await fetch(base + '/api/health', { cache: 'no-store' });
        if (!r.ok) continue;
        const j = await r.json();
        if (j && j.ok){
          this.apiBase = base; this.apiReady = true;
          BUS.emit('feed');
          return true;
        }
      } catch(e){}
    }
    this.apiReady = false;
    BUS.emit('feed');
    return false;
  },

  setApi(url){
    const clean = (url || '').trim().replace(/\/+$/, '');
    if (clean) localStorage.setItem('astra_api', clean);
    else localStorage.removeItem('astra_api');
    this.apiBase = null; this.apiReady = false;
    return this.findApi();
  },

  /* ---------- MT5 bridge ---------- */
  async probeBridge(){
    try {
      const r = await fetch(this.BRIDGE_URL + '/health', { cache: 'no-store', signal: AbortSignal.timeout(2500) });
      if (!r.ok) throw new Error('bad');
      const j = await r.json();
      const was = !!this.bridge;
      this.bridge = { account: j.account || '', server: j.server || '', symbols: new Set(j.symbols || []),
                      balance: j.balance, currency: j.currency };
      this.buildAliases();
      this.bridgeMisses = 0;
      /* the account — balance, currency and LEVERAGE — used to arrive only as a
         side effect of loading contract specs, which early-returns once they are
         cached. So anything asking "what margin does this need" got nothing for
         the first minute after a reload, and silently fell back to a different
         answer. Ask for it the moment the bridge answers. */
      if (!was) this.loadAccount();
      if (!was){ toast('MT5 bridge connected — live broker prices' + (j.server ? ' (' + j.server + ')' : ''), 'ok'); BUS.emit('feed'); }
    } catch(e){
      this.bridgeMisses++;
      if (this.bridge){ this.bridge = null; toast('MT5 bridge disconnected — broker instruments paused', 'warn'); BUS.emit('feed'); }
    }
  },
  bridgeOn(){ return !!this.bridge; },

  /* balance, currency and leverage, straight from MetaTrader */
  async loadAccount(){
    if (!this.bridge) return null;
    try {
      const r = await fetch(this.BRIDGE_URL + '/specs?symbols=', { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      if (j.account){ this.account = j.account; BUS.emit('feed'); }
      return this.account;
    } catch(e){ return null; }
  },

  /* ---------- broker symbol naming ----------
     The same instrument is named differently on different account types. On this
     broker a Standard account calls gold XAUUSD.m and the Nasdaq US100.std, while
     a Pro account calls them XAUUSD.s and US100.s. Hard-coding either one breaks
     silently on the other — the bots simply find nothing. So the account's own
     symbol list is matched by base name and an alias map is built at connect
     time. ASTRA keeps one internal name; the broker gets whatever it calls it. */
  alias: {},
  baseOf(sym){ return String(sym).replace(/\.[A-Za-z]{1,4}$/, '').toUpperCase(); },

  buildAliases(){
    this.alias = {};
    if (!this.bridge) return;
    const byBase = {};
    for (const s of this.bridge.symbols){
      const b = this.baseOf(s);
      /* prefer the shortest name for a base — the plain contract, not a variant */
      if (!byBase[b] || s.length < byBase[b].length) byBase[b] = s;
    }
    const wanted = (typeof BROKER !== 'undefined') ? BROKER.all() : [];
    let mapped = 0;
    for (const want of wanted){
      if (this.bridge.symbols.has(want)){ this.alias[want] = want; mapped++; continue; }
      const hit = byBase[this.baseOf(want)];
      if (hit){ this.alias[want] = hit; mapped++; }
    }
    this.aliasCount = mapped;
  },

  /* the name to send to the broker for one of our internal names */
  brokerName(sym){
    if (!this.bridge) return sym;
    if (this.bridge.symbols.has(sym)) return sym;
    return this.alias[sym] || sym;
  },
  bridgeHas(sym){
    if (!this.bridge) return false;
    if (this.bridge.symbols.has(sym)) return true;
    return !!this.alias[sym] && this.bridge.symbols.has(this.alias[sym]);
  },

  /* ---------- routing ---------- */
  route(sym){
    if (typeof MarketSources !== 'undefined'){
      if (MarketSources.brokerSymbol(sym)) return { kind: 'bridge', addr: this.brokerName(sym) };
      if (MarketSources.allowed(sym)) return { kind: 'binance', addr: sym };
      return { kind: 'disabled', addr: sym };
    }
    if (typeof BROKER !== 'undefined' && BROKER.is(sym)){
      const f = BROKER.feedFor(sym);
      if (f) return f.kind === 'bridge' ? { kind: 'bridge', addr: this.brokerName(sym) } : f;
    }
    if (this.bridgeHas(sym)) return { kind: 'bridge', addr: this.brokerName(sym) };
    if (/USDT$/.test(sym)) return { kind: 'binance', addr: sym };
    return { kind: 'proxy', addr: sym };
  },

  /* ---------- candles ---------- */
  async klines(sym, tf, limit, options){
    const r = this.route(sym);
    if (r.kind === 'disabled') throw new Error(MarketSources.reason(sym));
    // Candle routing is not evidence of a fresh executable quote.
    if (r.kind === 'bridge'){
      const url = this.BRIDGE_URL + '/candles?symbol=' + encodeURIComponent(r.addr) + '&tf=' + tf + '&limit=' + (limit || 1000) + (options && options.from ? '&from=' + Math.floor(options.from) : '');
      const res = await fetch(url, options?.signal ? {signal:options.signal} : undefined);
      if (!res.ok) throw new Error('bridge HTTP ' + res.status);
      const j = await res.json();
      return (j.candles || []).map(k => ({
        rawTime: k[0], time: k[0] + TZ_OFF,
        open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5] || 0, quoteVol: 0,
      }));
    }
    if (r.kind === 'binance') return API.binanceKlines(r.addr, tf, limit);
    if (!this.apiReady) throw new Error('data service offline');
    const res = await fetch(this.apiBase + '/api/market/chart?symbol=' + encodeURIComponent(r.addr) + '&tf=' + encodeURIComponent(tf));
    if (!res.ok){
      let msg = 'HTTP ' + res.status;
      try { const j = await res.json(); if (j.error) msg = j.error; } catch(e){}
      throw new Error(msg);
    }
    const j = await res.json();
    if (j.meta && typeof MK !== 'undefined'){
      MK.meta[sym] = { currency: j.meta.currency, exchange: j.meta.exchange };
      if (j.meta.name && !MK.names[sym]) MK.names[sym] = j.meta.name;
    }
    let c = (j.candles || []).map(k => ({
      rawTime: k[0], time: k[0] + TZ_OFF,
      open: k[1], high: k[2], low: k[3], close: k[4], volume: k[5] || 0, quoteVol: 0,
    }));
    if (limit && c.length > limit) c = c.slice(c.length - limit);
    return c;
  },

  /* ---------- quotes for everything that is not a Binance stream ---------- */
  bridgeClock: null,
  bridgeTime(symbol, raw, now = Date.now() / 1000){
    const server = this.bridge?.server || '';
    if (!Number.isFinite(raw) || raw <= 0) return 0;
    if (!this.bridgeClock || this.bridgeClock.server !== server)
      this.bridgeClock = { server, offset: null, samples: {} };
    const clock = this.bridgeClock, prev = clock.samples[symbol];
    // JustMarkets documents GMT+2/+3 server time. Observed /quotes ticks on
    // this account carry that wall clock in an epoch field. Do not infer an
    // offset from one old quote: require a new tick advancing with our clock.
    // https://get.justmarkets.help/hc/en-us/articles/14206580923420
    const offsets = /^JustMarkets/i.test(server) ? [0, 7200, 10800] : [0];
    if (clock.offset == null && prev && now - prev.at >= 1 && now - prev.at <= 90 &&
        raw > prev.raw && raw - prev.raw <= now - prev.at + 5){
      const offset = offsets.find(v => now - (raw - v) >= 0 && now - (raw - v) < 30);
      if (offset != null) clock.offset = offset;
    }
    // Keep the first observation of a repeated tick, so simultaneous alias
    // requests cannot erase the evidence needed to observe its next advance.
    if (!prev || prev.raw !== raw) clock.samples[symbol] = { raw, at: now };
    return raw - (clock.offset ?? 0);
  },

  async quotes(symbols, options){
    const bridgeSyms = [], proxySyms = [], map = {};
    for (const s of symbols){
      const r = this.route(s);
      if (r.kind === 'bridge' || r.kind === 'proxy'){
        const list = r.kind === 'bridge' ? bridgeSyms : proxySyms;
        if (!list.includes(r.addr)) list.push(r.addr);
        (map[r.addr] || (map[r.addr] = [])).push(s);
      }
    }
    const out = [];
    if (bridgeSyms.length){
      try {
        const r = await fetch(this.BRIDGE_URL + '/quotes?symbols=' + encodeURIComponent(bridgeSyms.join(',')),options?.signal?{signal:options.signal}:undefined);
        if (r.ok){
          const j = await r.json();
          for (const q of j.quotes || []){
            const time = this.bridgeTime(q.symbol, q.time);
            for (const sym of map[q.symbol] || [q.symbol]) out.push({ ...q, time, symbol: sym, src: 'bridge' });
          }
        }else if(options?.strict)throw Error('Broker quotes HTTP '+r.status);
      } catch(e){if(options?.strict)throw e;}
    }
    if (proxySyms.length && this.apiReady){
      for (let i = 0; i < proxySyms.length; i += 40){
        const chunk = proxySyms.slice(i, i + 40);
        try {
          const r = await fetch(this.apiBase + '/api/market/quotes?symbols=' + encodeURIComponent(chunk.join(',')));
          if (!r.ok) continue;
          const j = await r.json();
          for (const q of j.quotes || [])
            for (const sym of map[q.symbol] || [q.symbol]) out.push({ ...q, symbol: sym, src: 'proxy' });
        } catch(e){}
      }
    }
    const valid = out.filter(q => Number.isFinite(q.last) && q.last > 0);
    for (const q of valid){
      // Publish price and its provenance together. A fresh timestamp must never
      // validate the previous cached price while its caller is still awaiting us.
      const cached = STORE.tickers.get(q.symbol) || {};
      Object.assign(cached, { last: q.last, bid: q.bid, ask: q.ask,
        spread: q.ask > 0 && q.bid > 0 ? q.ask - q.bid : null });
      STORE.tickers.set(q.symbol, cached);
      this.srcOf[q.symbol] = q.src;
      this.quoteTime[q.symbol] = Number.isFinite(q.time) && q.time > 0 ? q.time : 0;
    }
    return valid;
  },

  /* ---------- contract specifications from the broker ----------
     Lot sizes are not a detail. A strategy that "risks 0.05%" is fiction if the
     smallest trade your broker accepts risks 1.1%. These specs let the risk
     engine size in REAL lots and refuse trades the account cannot carry. */
  specs: {},
  account: null,
  async loadSpecs(symbols){
    if (!this.bridge) return null;
    const want = (symbols || []).filter(s => this.bridgeHas(s) && !this.specs[s]);
    if (!want.length) return this.specs;
    try {
      const back = {};
      for (const s2 of want) (back[this.brokerName(s2)] || (back[this.brokerName(s2)] = [])).push(s2);
      const r = await fetch(this.BRIDGE_URL + '/specs?symbols=' + encodeURIComponent(Object.keys(back).join(',')));
      if (!r.ok) throw new Error('Broker specifications HTTP ' + r.status);
      const j = await r.json();
      if (j.account) this.account = j.account;
      for (const [brokerSym, spec] of Object.entries(j.specs || {})){
        this.fixSpec(spec);
        this.specs[brokerSym] = spec;
        for (const sym of back[brokerSym] || []) this.specs[sym] = spec;
      }
      if (j.account) this.account = j.account;
      BUS.emit('feed');
    } catch(e){ console.warn('ASTRA could not load broker specifications:', e.message); }
    return this.specs;
  },
  specFor(sym){ return this.specs[sym] || this.specs[this.brokerName(sym)] || null; },
  /* Some share CFDs report a contract size (100) and a tick value (0.01 per 0.01)
     that contradict each other: one says a lot is 100 shares, the other 1 share.
     The bridge now also asks MetaTrader's own profit calculator what one lot earns
     per 1.0 of price (pointValue). For a contract priced in the account's own
     currency that number IS the contract size in money terms, so both fields are
     set from it and every part of ASTRA — bots, the Live Desk, the manual ticket,
     real-order sizing — values the trade the way the broker will. The raw
     figures are kept in spec.raw. A contract in another currency is left alone:
     it needs a currency conversion, which the bots still refuse. */
  fixSpec(spec){
    if (!spec || !(spec.pointValue > 0) || !(spec.tickSize > 0) || !(spec.contractSize > 0)) return spec;
    const acct = this.account && this.account.currency;
    if (!acct || !spec.currency || spec.currency !== acct) return spec;
    const byContract = spec.contractSize, byTick = spec.tickValue / spec.tickSize;
    const agree = v => Math.abs(v / spec.pointValue - 1) < 0.01;
    if (agree(byContract) && agree(byTick)) return spec;
    spec.raw = { contractSize: spec.contractSize, tickValue: spec.tickValue };
    spec.contractSize = spec.pointValue;
    spec.tickValue = spec.pointValue * spec.tickSize;
    spec.fixed = 'MetaTrader values one lot at ' + spec.pointValue + ' ' + acct + ' per 1.0 of price (it reported contract ' + byContract + ', tick value ' + spec.raw.tickValue + ')';
    return spec;
  },

  async search(q){
    if (typeof MarketSources !== 'undefined') return [];
    if (!this.apiReady) return [];
    try {
      const r = await fetch(this.apiBase + '/api/market/search?q=' + encodeURIComponent(q));
      if (!r.ok) return [];
      const j = await r.json();
      return j.results || [];
    } catch(e){ return []; }
  },

  /* ================= live-only mode =================
     Trading on a delayed price is genuinely dangerous: the number on screen is
     not the number you would be filled at. With this on, anything that is not on
     a real-time feed is hidden from the lists and refused by the bots outright —
     not merely warned about.

     A price counts as live only when it comes from your own MT5 terminal or from
     an exchange's real-time stream, AND the last tick is recent. Nothing else. */
  liveOnly: lsGet('astra_liveonly', true) !== false,

  setLiveOnly(on){
    this.liveOnly = !!on;
    lsSet('astra_liveonly', this.liveOnly);
    BUS.emit('feed');
    if (typeof toast === 'function')
      toast(this.liveOnly
        ? 'Live-only mode ON — delayed instruments are hidden and cannot be traded'
        : 'Live-only mode OFF — delayed instruments are shown again', this.liveOnly ? 'ok' : 'warn');
  },

  /* the single source of truth the rest of the app asks */
  isLive(sym){
    const src = this.srcOf[sym];
    if (src !== 'bridge' && src !== 'binance') return false;
    const t = this.quoteTime[sym];
    /* a stream that has gone quiet is not live either */
    const age = Date.now() / 1000 - t;
    return Number.isFinite(t) && t > 0 && age >= 0 && age < 180;
  },

  /* may this symbol be traded at all right now? */
  tradable(sym){
    if (typeof MarketSources !== 'undefined' && !MarketSources.executable(sym, this.srcOf[sym]))
      return { ok: false, why: MarketSources.reason(sym) };
    // The display toggle may show delayed markets; it cannot authorize entries.
    if (this.isLive(sym)) return { ok: true };
    const st = this.status(sym);
    const name = baseAsset(sym);
    /* the advice has to match the actual situation: a broker symbol needs the
       bridge, but a public-feed symbol is simply not something to trade live */
    if (st.label === '—')
      return { ok: false, why: name + ' has no live price at all — live-only mode refuses it.' +
        (this.bridge ? ' Use your broker’s own symbol for this market.' : ' Start the MT5 bridge.') };
    if (!this.bridge && (typeof BROKER !== 'undefined' && BROKER.is(sym)))
      return { ok: false, why: name + ' is ' + st.label.toLowerCase() +
        ' — live-only mode refuses it. Start START-MT5-Bridge.bat for live JustMarkets prices.' };
    return { ok: false, why: name + ' is ' + st.label.toLowerCase() +
      ' and is not on a real-time feed — live-only mode refuses it.' };
  },

  /* how much of the board is actually live right now */
  liveSummary(list){
    const syms = list || [...STORE.tickers.keys()];
    const live = syms.filter(s => this.isLive(s));
    return { total: syms.length, live: live.length, hidden: syms.length - live.length,
             bridge: !!this.bridge };
  },

  /* ---------- how fresh is this price, honestly ---------- */
  status(sym){
    if (typeof MarketSources !== 'undefined' && !MarketSources.allowed(sym))
      return { cls: 'flat', label: 'DISABLED', tip: MarketSources.reason(sym) };
    const src = this.srcOf[sym] || this.route(sym).kind;
    if (this.isLive(sym)) return { cls: 'live', label: 'LIVE',
      tip: src === 'bridge' ? 'Direct from your MT5 terminal' : 'Binance real-time stream' };
    const t = this.quoteTime[sym];
    if (!Number.isFinite(t) || t <= 0 || t > Date.now() / 1000)
      return { cls: 'flat', label: '—', tip: 'No valid quote timestamp yet' };
    const age = Date.now() / 1000 - t;
    if (src === 'bridge' || src === 'binance')
      return { cls: 'delay', label: 'STALE', tip: 'Last tick is ' + Math.round(age) + 's old — trading is blocked' };
    if (age < 180) return { cls: 'delay', label: 'DELAYED', tip: 'Public data is not a verified live execution feed' };
    if (age < 3600) return { cls: 'delay', label: 'DELAYED ' + Math.round(age / 60) + 'm', tip: 'Free feeds lag the exchange' };
    const hrs = age / 3600;
    return {
      cls: 'closed',
      label: 'CLOSED',
      tip: 'Market shut — last price ' + (hrs < 48 ? Math.round(hrs) + ' h' : Math.round(hrs / 24) + ' d') + ' ago',
    };
  },

  sourceLabel(){
    if (this.bridge) return 'MT5 · ' + (this.bridge.server || BROKER.name);
    if (this.apiReady) return this.apiBase ? 'DATA · ' + this.apiBase.replace(/^https?:\/\//, '') : 'DATA · local';
    return 'DATA OFFLINE';
  },
};
