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
      this.bridge = { account: j.account || '', server: j.server || '', symbols: new Set(j.symbols || []) };
      this.bridgeMisses = 0;
      if (!was){ toast('MT5 bridge connected — live broker prices' + (j.server ? ' (' + j.server + ')' : ''), 'ok'); BUS.emit('feed'); }
    } catch(e){
      this.bridgeMisses++;
      if (this.bridge){ this.bridge = null; toast('MT5 bridge disconnected — using public feeds', 'warn'); BUS.emit('feed'); }
    }
  },
  bridgeOn(){ return !!this.bridge; },
  bridgeHas(sym){ return !!(this.bridge && this.bridge.symbols.has(sym)); },

  /* ---------- routing ---------- */
  route(sym){
    if (typeof BROKER !== 'undefined' && BROKER.is(sym)){
      const f = BROKER.feedFor(sym);
      if (f) return f;
    }
    if (this.bridgeHas(sym)) return { kind: 'bridge', addr: sym };
    if (/USDT$/.test(sym)) return { kind: 'binance', addr: sym };
    return { kind: 'proxy', addr: sym };
  },

  /* ---------- candles ---------- */
  async klines(sym, tf, limit){
    const r = this.route(sym);
    this.srcOf[sym] = r.kind;
    if (r.kind === 'bridge'){
      const url = this.BRIDGE_URL + '/candles?symbol=' + encodeURIComponent(r.addr) + '&tf=' + tf + '&limit=' + (limit || 1000);
      const res = await fetch(url);
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
  async quotes(symbols){
    const bridgeSyms = [], proxySyms = [], map = {};
    for (const s of symbols){
      const r = this.route(s);
      this.srcOf[s] = r.kind;
      if (r.kind === 'bridge'){ bridgeSyms.push(r.addr); map[r.addr] = s; }
      else if (r.kind === 'proxy'){ proxySyms.push(r.addr); map[r.addr] = s; }
    }
    const out = [];
    if (bridgeSyms.length){
      try {
        const r = await fetch(this.BRIDGE_URL + '/quotes?symbols=' + encodeURIComponent(bridgeSyms.join(',')));
        if (r.ok){
          const j = await r.json();
          for (const q of j.quotes || []) out.push({ ...q, symbol: map[q.symbol] || q.symbol, src: 'bridge' });
        }
      } catch(e){}
    }
    if (proxySyms.length && this.apiReady){
      for (let i = 0; i < proxySyms.length; i += 40){
        const chunk = proxySyms.slice(i, i + 40);
        try {
          const r = await fetch(this.apiBase + '/api/market/quotes?symbols=' + encodeURIComponent(chunk.join(',')));
          if (!r.ok) continue;
          const j = await r.json();
          for (const q of j.quotes || []) out.push({ ...q, symbol: map[q.symbol] || q.symbol, src: 'proxy' });
        } catch(e){}
      }
    }
    for (const q of out) if (q.time) this.quoteTime[q.symbol] = q.time;
    return out;
  },

  async search(q){
    if (!this.apiReady) return [];
    try {
      const r = await fetch(this.apiBase + '/api/market/search?q=' + encodeURIComponent(q));
      if (!r.ok) return [];
      const j = await r.json();
      return j.results || [];
    } catch(e){ return []; }
  },

  /* ---------- how fresh is this price, honestly ---------- */
  status(sym){
    const src = this.srcOf[sym] || this.route(sym).kind;
    if (src === 'bridge') return { cls: 'live', label: 'LIVE', tip: 'Direct from your MT5 terminal' };
    if (src === 'binance') return { cls: 'live', label: 'LIVE', tip: 'Binance real-time stream' };
    const t = this.quoteTime[sym];
    if (!t) return { cls: 'flat', label: '—', tip: 'No quote yet' };
    const age = Math.max(0, Date.now() / 1000 - t);
    if (age < 180) return { cls: 'live', label: 'LIVE', tip: 'Updated ' + Math.round(age) + 's ago' };
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
