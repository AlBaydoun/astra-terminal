/* ASTRA Terminal — config, shared state, helpers */
const CFG = {
  REST: ['https://api.binance.com', 'https://data-api.binance.vision'],
  WS: ['wss://stream.binance.com:9443/stream?streams=', 'wss://stream.binance.com:443/stream?streams='],
  DEFAULT_SYMBOL: 'BTCUSDT',
  DEFAULT_TF: '1h',
  TFS: [['1m','1m'],['5m','5m'],['15m','15m'],['1h','1H'],['4h','4H'],['1d','1D'],['1w','1W']],
  KLINE_LIMIT: 1000,
  WATCH_DEFAULT: ['BTCUSDT','ETHUSDT','SOLUSDT','BNBUSDT','XRPUSDT','DOGEUSDT','ADAUSDT','AVAXUSDT','LINKUSDT','DOTUSDT','LTCUSDT','TRXUSDT','SHIBUSDT','PEPEUSDT','NEARUSDT','SUIUSDT'],
  UP: '#2ebd85', DOWN: '#f6465d', ACCENT: '#00e5ff', ACCENT2: '#8b6cff',
};
const TZ_OFF = -new Date().getTimezoneOffset() * 60; // shift epoch so the chart axis shows local time

/* tiny event bus */
const BUS = {
  m: {},
  on(ev, fn){ (this.m[ev] = this.m[ev] || []).push(fn); },
  emit(ev, d){ (this.m[ev] || []).forEach(fn => { try { fn(d); } catch(e){ console.error(e); } }); }
};

/* central market store */
const STORE = {
  tickers: new Map(),   // symbol -> {last, open, high, low, vol, quoteVol, pct, count}
  universe: [],         // USDT symbols sorted by quote volume
  symbol: localStorage.getItem('astra_symbol') || CFG.DEFAULT_SYMBOL,
  tf: localStorage.getItem('astra_tf') || CFG.DEFAULT_TF,
  chartType: localStorage.getItem('astra_ctype') || 'candles',
  theme: localStorage.getItem('astra_theme') || 'dark',   // dark is the default
};
document.documentElement.dataset.theme = STORE.theme;

function lsGet(k, def){ try { const v = localStorage.getItem(k); return v == null ? def : JSON.parse(v); } catch(e){ return def; } }
function lsSet(k, v){ try { localStorage.setItem(k, JSON.stringify(v)); } catch(e){} }

/* formatting */
function fmtPrice(p){
  if (p == null || isNaN(p)) return '—';
  const a = Math.abs(p);
  if (a >= 1000) return p.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  if (a >= 1) return p.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 4});
  if (a === 0) return '0.00';
  const digs = Math.min(10, Math.max(4, 2 - Math.floor(Math.log10(a)) + 3));
  return p.toFixed(digs);
}
function fmtNum(n){
  if (n == null || isNaN(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e12) return (n/1e12).toFixed(2) + 'T';
  if (a >= 1e9)  return (n/1e9).toFixed(2) + 'B';
  if (a >= 1e6)  return (n/1e6).toFixed(2) + 'M';
  if (a >= 1e3)  return (n/1e3).toFixed(1) + 'K';
  return n.toFixed(2);
}
function fmtPct(p){ if (p == null || isNaN(p)) return '—'; return (p > 0 ? '+' : '') + p.toFixed(2) + '%'; }
function pctClass(p){ return p > 0 ? 'up' : p < 0 ? 'down' : 'flat'; }
/* short display label — crypto drops USDT, other markets get a readable ticker */
function baseAsset(sym){
  if (typeof MK !== 'undefined' && !MK.isCrypto(sym)) return MK.short(sym);
  return sym.replace(/USDT$/, '');
}
function esc(s){ return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

/* toasts + sound */
function toast(msg, kind){
  let host = document.getElementById('toasts');
  if (!host){ host = document.createElement('div'); host.id = 'toasts'; document.body.appendChild(host); }
  const t = document.createElement('div');
  t.className = 'toast ' + (kind || 'info');
  t.textContent = msg;
  host.appendChild(t);
  setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 450); }, 4200);
}
function beep(){
  try {
    const ctx = beep.ctx = beep.ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0 + i*0.18);
      g.gain.exponentialRampToValueAtTime(0.22, t0 + i*0.18 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + i*0.18 + 0.16);
      o.connect(g); g.connect(ctx.destination);
      o.start(t0 + i*0.18); o.stop(t0 + i*0.18 + 0.18);
    });
  } catch(e){}
}
