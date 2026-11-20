/* Timurila — core: the read-only link to the MT5 bridge, shared state, helpers.

   SAFETY: this file (and every other Timurila file) only ever sends GET requests to the
   bridge: /health, /quotes, /candles, /positions, /deals. There is no order path here.
   Real orders stay where they are today: in Classic, behind its four typed gates. */
const T = {
  BRIDGE: 'http://127.0.0.1:8644',
  online: false, health: null, symbols: [], quotes: {}, positions: [], deals: [],
  listeners: {},
  on(ev, fn){ (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
  /* true while nobody can see this page: a hidden tab, or — when Classic shows Timurila inside its own
     window — a room that is not the one on screen. Nothing is polled while hidden. */
  hidden(){ try { if (document.hidden) return true; const f = window.frameElement; return !!(f && f.offsetParent === null); } catch(e){ return document.hidden; } },
  emit(ev, a){ (this.listeners[ev] || []).forEach(fn => { try { fn(a); } catch(e){ console.error(e); } }); },

  /* One request to the bridge at a time. Classic talks to the same bridge and treats a single slow
     answer as "disconnected", so Timurila never opens more than one connection to it at once. */
  _queue: Promise.resolve(),
  get(path, ms = 9000){
    const run = async () => { const ac = new AbortController(), timer = setTimeout(() => ac.abort(), ms);
      try { const r = await fetch(this.BRIDGE + path, { signal: ac.signal, cache: 'no-store' }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
      finally { clearTimeout(timer); } };
    const p = this._queue.then(run, run); this._queue = p.catch(() => {}); return p;
  },

  /* ---- what kind of market a broker symbol is (by name) ---- */
  CCY: 'USD EUR GBP JPY CHF CAD AUD NZD SGD HKD CNH DKK NOK SEK PLN MXN ZAR TRY HUF CZK THB ILS RUB'.split(' '),
  CRYPTO: /^(BTC|ETH|BCH|LTC|XRP|SOL|ADA|DOGE|DOT|LINK|AVAX|BNB|UNI|XLM|TRX|MATIC|ATOM|EOS|ETC|FIL|NEAR|APT|ARB|OP|SHIB|TON|SUI|AAVE|ALGO|XMR|XTZ|ZEC|DASH|NEO|KSM|IOTA|MANA|SAND|COMP|MKR|GRT|INJ|PEPE|FTM|HBAR|ICP|VET|AXS|APE|LDO)/,
  base(sym){ return String(sym).replace(/\.(s|m|std|pro|ecn|raw)$/i, ''); },
  groupOf(sym){
    const b = this.base(sym);
    if (/^(XAU|XAG|XPT|XPD)[A-Z]{3}$/.test(b)) return 'metals';
    if (/^(WTI|BRENT|XNG|NGAS|UKOIL|USOIL|XBR|XTI|NATGAS)/.test(b)) return 'energy';
    if (b.length === 6 && this.CCY.includes(b.slice(0, 3)) && this.CCY.includes(b.slice(3))) return 'forex';
    if (this.CRYPTO.test(b) && /(USD|USDT|EUR|BTC|JPY|GBP|XAU)$/.test(b)) return 'crypto';
    if (b === sym) return 'shares';                 /* share CFDs carry no suffix; checked after the kinds above, which sometimes do not either */
    if (/\d/.test(b)) return 'indices';
    return 'other';
  },
  GROUPS: [['shares', 'Shares'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['indices', 'Indices'], ['metals', 'Metals'], ['energy', 'Energy']],
  groupName(g){ const x = this.GROUPS.find(a => a[0] === g); return x ? x[1] : 'Other'; },

  /* ---- numbers ---- */
  num(v, d){ return v == null || !isFinite(v) ? '–' : Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); },
  px(v, sym){ const q = this.quotes[sym]; return this.num(v, q && q.digits != null ? Math.min(q.digits, 5) : (v > 100 ? 2 : 5)); },
  signed(v, d, unit = ''){ if (v == null || !isFinite(v)) return '–'; return (v > 0 ? '+' : v < 0 ? '−' : '') + this.num(Math.abs(v), d) + unit; },
  cls(v){ return v > 0 ? 'up' : v < 0 ? 'down' : 'mute'; },
  esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },
  spreadPct(sym){ const q = this.quotes[sym]; if (!q || !(q.bid > 0) || !(q.ask > q.bid)) return null; return (q.ask - q.bid) / ((q.ask + q.bid) / 2) * 100; },

  /* ---- small maths (own copies, so nothing here depends on Classic's signatures) ---- */
  sma(a, n){ const o = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++){ s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) o[i] = s / n; } return o; },
  ema(a, n){ const o = new Array(a.length).fill(null), k = 2 / (n + 1); let e = null; for (let i = 0; i < a.length; i++){ e = e == null ? a[i] : a[i] * k + e * (1 - k); if (i >= n - 1) o[i] = e; } return o; },
  atr(c, n){ const o = new Array(c.length).fill(null); let a = null; for (let i = 0; i < c.length; i++){ const tr = i ? Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close)) : c[i].high - c[i].low; a = a == null ? tr : (a * (n - 1) + tr) / n; if (i >= n) o[i] = a; } return o; },
  adx(c, n){ let tr = 0, pd = 0, md = 0, ad = null, last = null;
    for (let i = 1; i < c.length; i++){ const up = c[i].high - c[i - 1].high, dn = c[i - 1].low - c[i].low, p = up > dn && up > 0 ? up : 0, m = dn > up && dn > 0 ? dn : 0;
      const t = Math.max(c[i].high - c[i].low, Math.abs(c[i].high - c[i - 1].close), Math.abs(c[i].low - c[i - 1].close));
      tr = tr - tr / n + t; pd = pd - pd / n + p; md = md - md / n + m;
      const pdi = 100 * pd / (tr || 1e-12), mdi = 100 * md / (tr || 1e-12), dx = 100 * Math.abs(pdi - mdi) / ((pdi + mdi) || 1e-12);
      ad = ad == null ? dx : (ad * (n - 1) + dx) / n; if (i >= 2 * n) last = { adx: ad, pdi, mdi }; }
    return last; },

  /* ---- candles ---- */
  candleCache: {},
  async candles(sym, tf, limit = 600){
    const k = sym + '|' + tf, hit = this.candleCache[k];
    if (hit && Date.now() - hit.at < 20000) return hit.c;
    const j = await this.get('/candles?symbol=' + encodeURIComponent(sym) + '&tf=' + tf + '&limit=' + limit, 15000);
    const c = (j.candles || []).map(r => ({ time: r[0], open: r[1], high: r[2], low: r[3], close: r[4], volume: r[5] || 0 })).filter(b => b.open > 0 && b.close > 0);
    this.candleCache[k] = { at: Date.now(), c };
    return c;
  },

  /* ---- polling ---- */
  async pollHealth(){
    try {
      const h = await this.get('/health', 6000);
      const first = !this.online; this.online = true; this.health = h;
      if (first || (h.symbols || []).length !== this.symbols.length){ this.symbols = h.symbols || []; this.emit('symbols'); this.pollQuotes(); this.pollAccount(); }
    } catch(e){ if (this.online !== false || !this.health){ this.online = false; } }
    this.emit('health');
  },
  async pollQuotes(){
    if (!this.online || this._q) return; this._q = true;
    try {
      for (let i = 0; i < this.symbols.length; i += 50){
        const j = await this.get('/quotes?symbols=' + encodeURIComponent(this.symbols.slice(i, i + 50).join(',')), 20000);
        for (const q of j.quotes || []) this.quotes[q.symbol] = q;
        this.emit('quotes');
      }
    } catch(e){ /* the next sweep tries again */ }
    this._q = false;
  },
  async pollAccount(){
    if (!this.online) return;
    try { const [p, d] = await Promise.all([this.get('/positions'), this.get('/deals?days=35')]); this.positions = p.positions || []; this.deals = d.deals || []; this.emit('account'); } catch(e){}
  },
  start(){
    this.pollHealth();
    setInterval(() => { if (!this.hidden()) this.pollHealth(); }, 10000);
    setInterval(() => { if (!this.hidden()) this.pollQuotes(); }, 45000);
    setInterval(() => { if (!this.hidden()) this.pollAccount(); }, 30000);
  },

  /* ---- saved choices ---- */
  load(k, def){ try { const v = localStorage.getItem('timurila_' + k); return v == null ? def : JSON.parse(v); } catch(e){ return def; } },
  save(k, v){ try { localStorage.setItem('timurila_' + k, JSON.stringify(v)); } catch(e){} },
  motion(){ return !(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches); },
};

/* shown inside Classic's window (?embed=1): Classic's dock is the navigation, so the rail steps aside */
try { if (new URLSearchParams(location.search).get('embed')) document.documentElement.classList.add('embed'); } catch(e){}

/* Classic's Patterns engine (js/chartpatterns.js) expects these two helpers. Timurila keeps its
   own copy of the settings so nothing here can change what Classic has saved. */
function lsGet(k, def){ return T.load('classic_' + k, def); }
function lsSet(k, v){ T.save('classic_' + k, v); return true; }
