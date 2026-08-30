/* ASTRA Terminal — REST + WebSocket data layer (Binance public market data, CoinGecko, alternative.me) */
const API = {
  restIdx: 0,

  async fetchJSON(path){
    for (let i = 0; i < CFG.REST.length; i++){
      const base = CFG.REST[(this.restIdx + i) % CFG.REST.length];
      try {
        const r = await fetch(base + path);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        this.restIdx = (this.restIdx + i) % CFG.REST.length;
        return await r.json();
      } catch(e){ console.warn('REST failed on', base, e.message); }
    }
    throw new Error('all market data endpoints failed');
  },

  /* candles for ANY instrument — the Feed router picks bridge / Binance / data service */
  async klines(symbol, interval, limit){
    if (typeof Feed !== 'undefined') return Feed.klines(symbol, interval, limit);
    return this.binanceKlines(symbol, interval, limit);
  },

  async binanceKlines(symbol, interval, limit){
    const raw = await this.fetchJSON(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit || CFG.KLINE_LIMIT}`);
    return raw.map(k => ({
      rawTime: k[0] / 1000,
      time: k[0] / 1000 + TZ_OFF,
      open: +k[1], high: +k[2], low: +k[3], close: +k[4],
      volume: +k[5], quoteVol: +k[7],
    }));
  },

  async all24h(){ return this.fetchJSON('/api/v3/ticker/24hr'); },

  async gecko(path){
    const r = await fetch('https://api.coingecko.com/api/v3' + path);
    if (!r.ok) throw new Error('coingecko ' + r.status);
    return r.json();
  },

  async fearGreed(){
    const r = await fetch('https://api.alternative.me/fng/?limit=1');
    if (!r.ok) throw new Error('fng ' + r.status);
    return r.json();
  },
};

/* auto-reconnecting websocket around Binance combined streams */
class Sock {
  constructor(streams, onMsg, label){
    this.streams = streams; this.onMsg = onMsg; this.label = label || 'ws';
    this.idx = 0; this.tries = 0; this.closed = false;
    this.connect();
  }
  connect(){
    const url = CFG.WS[this.idx % CFG.WS.length] + this.streams.join('/');
    let ws;
    try { ws = this.ws = new WebSocket(url); }
    catch(e){ this.retry(); return; }
    ws.onopen = () => { this.tries = 0; BUS.emit('ws', { label: this.label, up: true }); };
    ws.onmessage = ev => {
      try { const m = JSON.parse(ev.data); this.onMsg(m.data || m, m.stream || ''); } catch(e){}
    };
    ws.onclose = () => { if (!this.closed) { BUS.emit('ws', { label: this.label, up: false }); this.retry(); } };
    ws.onerror = () => { try { ws.close(); } catch(e){} };
  }
  retry(){
    this.idx++;
    const wait = Math.min(30000, 1500 * Math.pow(2, this.tries++));
    this.timer = setTimeout(() => this.connect(), wait);
  }
  close(){
    this.closed = true;
    clearTimeout(this.timer);
    try { this.ws.onclose = null; this.ws.close(); } catch(e){}
  }
}

/* one-time market snapshot: builds the tradable USDT universe */
async function bootMarketData(){
  const all = await API.all24h();
  const uni = [];
  for (const t of all){
    if (!t.symbol.endsWith('USDT')) continue;
    if (/(UP|DOWN|BULL|BEAR)USDT$/.test(t.symbol)) continue;
    const q = +t.quoteVolume;
    if (!(q > 0)) continue;
    STORE.tickers.set(t.symbol, {
      last: +t.lastPrice, open: +t.openPrice, high: +t.highPrice, low: +t.lowPrice,
      vol: +t.volume, quoteVol: q, pct: +t.priceChangePercent, count: +t.count,
    });
    uni.push(t.symbol);
  }
  uni.sort((a, b) => STORE.tickers.get(b).quoteVol - STORE.tickers.get(a).quoteVol);
  STORE.universe = uni;
}

/* live prices for every symbol at once (1 message/second).
   Broker instruments backed by a Binance pair (BTCUSD.m …) tick in real time too. */
function startGlobalStream(){
  const alias = {};                       // binance pair -> broker symbol
  if (typeof BROKER !== 'undefined')
    for (const s of BROKER.all()){
      const i = BROKER.info(s);
      if (/USDT$/.test(i.feed)) (alias[i.feed] = alias[i.feed] || []).push(s);
    }
  new Sock(['!miniTicker@arr'], data => {
    if (!Array.isArray(data)) return;
    const changed = [];
    for (const m of data){
      const s = m.s;
      if (!s.endsWith('USDT')) continue;
      const t = STORE.tickers.get(s);
      const vals = { last: +m.c, open: +m.o, high: +m.h, low: +m.l, vol: +m.v, quoteVol: +m.q };
      vals.pct = vals.open ? (vals.last - vals.open) / vals.open * 100 : 0;
      if (t){ Object.assign(t, vals); changed.push(s); }
      for (const b of alias[s] || []){
        const bt = STORE.tickers.get(b) || {};
        Object.assign(bt, vals, { count: 0 });
        STORE.tickers.set(b, bt);
        if (typeof Feed !== 'undefined') Feed.srcOf[b] = 'binance';
        changed.push(b);
      }
    }
    if (changed.length) BUS.emit('tickers', changed);
  }, 'global');
}
