/* ASTRA Terminal — self-contained server.
   Serves the terminal itself AND the data service it needs:
     /api/market/quotes|chart|search   stocks (US + Europe), forex, commodities, indices
     /api/sync/push|pull               the private cloud sync of your whole terminal
   Zero dependencies — plain Node. Runs locally (START-ASTRA-Terminal.bat) and on
   Hostinger (Node 20+, entry file server/astra-api.cjs).
   Sync state lives OUTSIDE the app folder so a redeploy can never wipe it. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const getNews = require('./news.cjs').createService();
const getResearch = require('./research.cjs').createService();

const ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 8642;
const DATA_DIR = process.env.ASTRA_DATA_DIR || path.join(os.homedir(), 'astra-data');
const STATE_FILE = path.join(DATA_DIR, 'sync-state.json');

/* --- the single account ---------------------------------------------------
   The password is NEVER stored in this repository (it is public). It lives as a
   salted hash in your private data folder, written by:  node server/set-password.cjs
   Environment variables (ASTRA_USER / ASTRA_SALT / ASTRA_HASH) override it, which
   is how you configure it on a hosting panel. Without either, sync stays off and
   the terminal simply runs in offline mode. */
function account(){
  if (process.env.ASTRA_HASH)
    return { user: (process.env.ASTRA_USER || 'Baydoun').toLowerCase(),
             salt: process.env.ASTRA_SALT || '', hash: process.env.ASTRA_HASH };
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'auth.json'), 'utf8')); }
  catch(e){ return null; }
}
function checkAuth(u, p){
  const acc = account();
  if (!acc || !u || !p) return false;
  if (String(u).toLowerCase() !== String(acc.user).toLowerCase()) return false;
  const h = crypto.createHash('sha256').update(acc.salt + ':' + p).digest('hex');
  const a = Buffer.from(h), b = Buffer.from(String(acc.hash));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.cjs': 'text/javascript', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.json': 'application/json',
  '.md': 'text/plain; charset=utf-8', '.txt': 'text/plain; charset=utf-8' };

/* --- who may use this service ----------------------------------------------
   It listens on this computer only (ASTRA_HOST can widen that on a hosting panel),
   and its data routes answer only ASTRA's own pages: a web page from anywhere else
   is refused, so a site open in a browser tab cannot read or change anything here. */
const HOST = process.env.ASTRA_HOST || '127.0.0.1';
const LOCAL_ORIGIN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;
const EXTRA_ORIGINS = String(process.env.ASTRA_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
function originOk(o){ return !o || LOCAL_ORIGIN.test(o) || EXTRA_ORIGINS.includes(o); }
const CORS = {
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type',
};
/* wrong sync passwords: five in a row from one address, then a fifteen-minute wait */
const FAILS = new Map();
function locked(ip){ const f = FAILS.get(ip); return !!(f && f.until > Date.now()); }
function failed(ip){ const f = FAILS.get(ip) || { n: 0, until: 0 }; f.n++; if (f.n >= 5){ f.until = Date.now() + 15 * 60000; f.n = 0; } FAILS.set(ip, f); }

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const YH_HOSTS = ['https://query1.finance.yahoo.com', 'https://query2.finance.yahoo.com'];

const TF = {
  '1m':  { interval: '1m',  range: '5d' },
  '5m':  { interval: '5m',  range: '1mo' },
  '15m': { interval: '15m', range: '1mo' },
  '1h':  { interval: '1h',  range: '2y' },
  '4h':  { interval: '1h',  range: '2y', agg: 4 },
  '1d':  { interval: '1d',  range: '10y' },
  '1w':  { interval: '1wk', range: 'max' },
};

/* --- tiny cache so repeated polls do not hammer the source --- */
const cache = new Map();
function cacheGet(k, allowStale){
  const e = cache.get(k);
  if (!e) return null;
  if (e.exp > Date.now() || allowStale) return e.v;
  return null;                       // kept, so it can still serve as a fallback
}
function cacheSet(k, v, ttlMs){
  cache.set(k, { v, exp: Date.now() + ttlMs });
  if (cache.size > 400) cache.delete(cache.keys().next().value);
}

/* The public feed rate-limits bursts. Rather than failing the whole request we
   fall back to the last good answer — a slightly older price beats no price,
   and the terminal labels its age anyway. */
async function yahoo(pathq){
  const key = 'y:' + pathq;
  const hit = cacheGet(key);
  if (hit) return hit;
  let lastErr = null;
  for (const host of YH_HOSTS){
    try {
      const r = await fetch(host + pathq, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!r.ok) throw new Error('upstream ' + r.status);
      const j = await r.json();
      cacheSet(key, j, 15000);
      return j;
    } catch(e){ lastErr = e; }
  }
  const stale = cacheGet(key, true);
  if (stale) return stale;
  throw lastErr || new Error('upstream failed');
}

function aggregate(candles, factor){
  const out = [];
  const span = (candles.length > 1 ? candles[1][0] - candles[0][0] : 3600) * factor;
  let cur = null, bucket = -1;
  for (const c of candles){
    const b = Math.floor(c[0] / span);
    if (b !== bucket){ if (cur) out.push(cur); cur = [b * span, c[1], c[2], c[3], c[4], c[5]]; bucket = b; }
    else { cur[2] = Math.max(cur[2], c[2]); cur[3] = Math.min(cur[3], c[3]); cur[4] = c[4]; cur[5] += c[5]; }
  }
  if (cur) out.push(cur);
  return out;
}

function sendJSON(res, obj, status, maxAge){
  const body = JSON.stringify(obj);
  res.writeHead(status || 200, Object.assign({}, CORS, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'public, max-age=' + (maxAge == null ? 10 : maxAge),
  }));
  res.end(body);
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let d = '';
    req.on('data', c => { d += c; if (d.length > 4e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch(e){ reject(e); } });
    req.on('error', reject);
  });
}

/* ---------------- market data ---------------- */
async function handleMarket(req, res, url){
  const p = url.pathname;

  if (p === '/api/market/quotes'){
    const symbols = (url.searchParams.get('symbols') || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 60);
    if (!symbols.length) return sendJSON(res, { quotes: [] });
    const out = [];
    for (let i = 0; i < symbols.length; i += 30){
      const chunk = symbols.slice(i, i + 30);
      const d = await yahoo('/v7/finance/spark?symbols=' + encodeURIComponent(chunk.join(',')) + '&range=1d&interval=1d');
      for (const r of (d && d.spark && d.spark.result) || []){
        const m = r.response && r.response[0] && r.response[0].meta;
        if (!m || typeof m.regularMarketPrice !== 'number') continue;
        const prev = typeof m.chartPreviousClose === 'number' ? m.chartPreviousClose
          : (typeof m.previousClose === 'number' ? m.previousClose : null);
        out.push({
          symbol: r.symbol, last: m.regularMarketPrice, prev,
          pct: prev ? (m.regularMarketPrice - prev) / prev * 100 : 0,
          high: m.regularMarketDayHigh != null ? m.regularMarketDayHigh : null,
          low: m.regularMarketDayLow != null ? m.regularMarketDayLow : null,
          currency: m.currency || '', exchange: m.fullExchangeName || m.exchangeName || '',
          time: m.regularMarketTime || null,
        });
      }
    }
    return sendJSON(res, { quotes: out }, 200, 10);
  }

  if (p === '/api/market/chart'){
    const symbol = (url.searchParams.get('symbol') || '').trim();
    const tf = url.searchParams.get('tf') || '1d';
    if (!symbol) return sendJSON(res, { error: 'missing_symbol' }, 400, 0);
    const cfg = TF[tf] || TF['1d'];
    const d = await yahoo('/v8/finance/chart/' + encodeURIComponent(symbol) +
      '?range=' + cfg.range + '&interval=' + cfg.interval + '&includePrePost=false');
    const r = d && d.chart && d.chart.result && d.chart.result[0];
    if (!r) return sendJSON(res, { error: (d && d.chart && d.chart.error && d.chart.error.description) || 'symbol_not_found' }, 404, 0);
    const ts = r.timestamp || [];
    const q = (r.indicators && r.indicators.quote && r.indicators.quote[0]) || {};
    let candles = [];
    for (let i = 0; i < ts.length; i++){
      const o = q.open && q.open[i], h = q.high && q.high[i], l = q.low && q.low[i], c = q.close && q.close[i];
      if (o == null || h == null || l == null || c == null) continue;
      candles.push([ts[i], o, h, l, c, (q.volume && q.volume[i]) || 0]);
    }
    if (cfg.agg) candles = aggregate(candles, cfg.agg);
    if (candles.length > 1200) candles = candles.slice(candles.length - 1200);
    const m = r.meta || {};
    return sendJSON(res, {
      candles,
      meta: { symbol: m.symbol || symbol, currency: m.currency || '',
        exchange: m.fullExchangeName || m.exchangeName || '',
        last: m.regularMarketPrice != null ? m.regularMarketPrice : null,
        prev: m.chartPreviousClose != null ? m.chartPreviousClose : null,
        name: m.longName || m.shortName || '' },
    }, 200, (tf === '1d' || tf === '1w') ? 120 : 20);
  }

  /* CoinGecko refuses some browser calls (and rate-limits them); go through here */
  if (p === '/api/market/gecko'){
    const q = url.searchParams.get('path') || '';
    if (!/^\/[A-Za-z0-9\/_.\-?=&,%]*$/.test(q)) return sendJSON(res, { error: 'bad_path' }, 400, 0);
    const key = 'g:' + q;
    const hit = cacheGet(key);
    if (hit) return sendJSON(res, hit, 200, 60);
    try {
      const r = await fetch('https://api.coingecko.com/api/v3' + q, { headers: { 'user-agent': UA, accept: 'application/json' } });
      if (!r.ok) throw new Error('gecko ' + r.status);
      const j = await r.json();
      cacheSet(key, j, 60000);
      return sendJSON(res, j, 200, 60);
    } catch(e){
      const stale = cacheGet(key, true);
      if (stale) return sendJSON(res, stale, 200, 30);
      return sendJSON(res, { error: String(e.message || e) }, 502, 0);
    }
  }

  if (p === '/api/market/search'){
    const q = (url.searchParams.get('q') || '').trim();
    if (q.length < 2) return sendJSON(res, { results: [] });
    const d = await yahoo('/v1/finance/search?q=' + encodeURIComponent(q) + '&quotesCount=20&newsCount=0&listsCount=0');
    const results = ((d && d.quotes) || [])
      .filter(x => x && x.symbol && ['EQUITY', 'ETF', 'INDEX', 'CURRENCY', 'FUTURE'].indexOf(x.quoteType) !== -1)
      .slice(0, 20)
      .map(x => ({ symbol: x.symbol, name: x.longname || x.shortname || x.symbol,
        type: x.quoteType, exchange: x.exchDisp || x.exchange || '' }));
    return sendJSON(res, { results }, 200, 300);
  }

  return sendJSON(res, { error: 'not_found' }, 404, 0);
}

/* ---------------- private sync ---------------- */
function loadState(){
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch(e){ return { state: null, updatedAt: 0 }; }
}
function saveState(obj){
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(obj));
}

async function handleSync(req, res, url){
  if (req.method !== 'POST') return sendJSON(res, { error: 'method_not_allowed' }, 405, 0);
  let body;
  try { body = await readBody(req); }
  catch(e){ return sendJSON(res, { error: 'bad_json' }, 400, 0); }
  if (!account()) return sendJSON(res, { error: 'sync_not_configured' }, 503, 0);
  const ip = req.socket.remoteAddress || '?';
  if (locked(ip)) return sendJSON(res, { error: 'too_many_attempts', message: 'Too many wrong passwords. Wait fifteen minutes.' }, 429, 0);
  if (!checkAuth(body.u, body.p)){ failed(ip); return sendJSON(res, { error: 'bad_credentials' }, 401, 0); }
  FAILS.delete(ip);

  if (url.pathname === '/api/sync/pull'){
    const s = loadState();
    return sendJSON(res, { state: s.state, updatedAt: s.updatedAt || 0 }, 200, 0);
  }
  if (url.pathname === '/api/sync/push'){
    if (typeof body.state !== 'object' || body.state === null)
      return sendJSON(res, { error: 'missing_state' }, 400, 0);
    const ts = Number(body.updatedAt) || Date.now();
    saveState({ state: body.state, updatedAt: ts });
    return sendJSON(res, { ok: true, updatedAt: ts }, 200, 0);
  }
  return sendJSON(res, { error: 'not_found' }, 404, 0);
}

/* ---------------- static app ---------------- */
function serveStatic(req, res, url){
  let p = decodeURIComponent(url.pathname);
  if (p === '/' || p === '') p = '/index.html';
  /* never the hidden folders and files (.git, .claude, .env …) */
  if (p.split(/[\\/]/).some(seg => seg.startsWith('.'))) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
  const file = path.normalize(path.join(ROOT, p));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) { res.writeHead(403); return res.end('forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err){ res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('not found'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
}

/* ---------------- server ---------------- */
http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
  const origin = req.headers.origin;
  if (origin && originOk(origin)){ res.setHeader('access-control-allow-origin', origin); res.setHeader('vary', 'Origin'); res.setHeader('access-control-allow-private-network', 'true'); }
  if (origin && !originOk(origin) && (url.pathname.startsWith('/api/') || req.method !== 'GET')){ res.writeHead(403, { 'content-type': 'application/json' }); return res.end('{"error":"forbidden_origin"}'); }
  try {
    if (req.method === 'OPTIONS'){ res.writeHead(204, CORS); return res.end(); }
    if (url.pathname === '/api/health') return sendJSON(res, { ok: true, service: 'astra', time: Date.now() }, 200, 0);
    if (url.pathname === '/api/news'){
      if(req.method!=='GET')return sendJSON(res,{error:'method_not_allowed'},405,0);
      return sendJSON(res,await getNews(),200,0);
    }
    if (url.pathname === '/api/research'){
      if(req.method!=='GET')return sendJSON(res,{error:'method_not_allowed'},405,0);
      return sendJSON(res,await getResearch(url.searchParams.get('ticker')),200,0);
    }
    if (url.pathname.startsWith('/api/market/')) return await handleMarket(req, res, url);
    if (url.pathname.startsWith('/api/sync/')) return await handleSync(req, res, url);
    return serveStatic(req, res, url);
  } catch(e){
    sendJSON(res, { error: String((e && e.message) || e) }, 502, 0);
  }
}).listen(PORT, HOST, () => {
  console.log('ASTRA terminal + data service on http://localhost:' + PORT + (HOST === '127.0.0.1' ? ' (this computer only)' : ' (listening on ' + HOST + ')'));
  console.log('sync state: ' + STATE_FILE);
});
