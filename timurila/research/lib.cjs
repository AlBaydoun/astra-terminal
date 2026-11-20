/* Timurila research library — shared by fetch.cjs and run.cjs.
   Read-only: it talks to the MT5 bridge's GET endpoints only and never sends an order. */
const fs = require('fs'), path = require('path');
const DATA = path.join(__dirname, 'data');
const BRIDGE = 'http://127.0.0.1:8644';

/* ---- what kind of market a broker symbol is (by name, never by MK.group) ---- */
const CRYPTO = /^(BTC|ETH|BCH|LTC|XRP|SOL|ADA|DOGE|DOT|LINK|AVAX|BNB|UNI|XLM|TRX|MATIC|ATOM|EOS|ETC|FIL|NEAR|APT|ARB|OP|SHIB|TON|SUI|AAVE|ALGO|XMR|XTZ|ZEC|DASH|NEO|IOTA|KSM|MANA|SAND|BAT|COMP|MKR|SNX|CRV|GRT|INJ|PEPE|WIF|BONK|TIA|SEI|RUNE|FTM|HBAR|ICP|VET|THETA|EGLD|AXS|ENJ|CHZ|1INCH|LRC|ZRX|OMG|QTUM|WAVES|ZIL|ONT|ICX|KAVA|CELO|ROSE|GALA|APE|LDO|STX|IMX|RNDR|FET|JUP|PYTH|ORDI|WLD)/;
const CCY = 'USD EUR GBP JPY CHF CAD AUD NZD SGD HKD CNH DKK NOK SEK PLN MXN ZAR TRY HUF CZK THB ILS RUB'.split(' ');
function base(sym){ return String(sym).replace(/\.(s|m|std|pro|ecn|raw)$/i, ''); }
function groupOf(sym){
  const b = base(sym);
  if (/^(XAU|XAG|XPT|XPD)[A-Z]{3}$/.test(b)) return 'metals';
  if (/^(WTI|BRENT|XNG|NGAS|UKOIL|USOIL|XBR|XTI|NATGAS)/.test(b)) return 'energy';
  if (b.length === 6 && CCY.includes(b.slice(0, 3)) && CCY.includes(b.slice(3))) return 'forex';
  if (CRYPTO.test(b) && /(USD|USDT|EUR|BTC|JPY|GBP|XAU)$/.test(b)) return 'crypto';
  if (b === sym) return 'shares';                                   /* share CFDs carry no suffix; checked after the kinds above */
  if (/\d/.test(b)) return 'indices';
  return 'other';
}

/* ---- data ---- */
const cache = {};
function file(sym, tf){ return path.join(DATA, sym.replace(/[^A-Za-z0-9._-]/g, '_') + '_' + tf + '.json'); }
function has(sym, tf){ return fs.existsSync(file(sym, tf)); }
function load(sym, tf){
  const k = sym + '|' + tf; if (cache[k]) return cache[k];
  const raw = JSON.parse(fs.readFileSync(file(sym, tf), 'utf8'));
  return cache[k] = raw.map(r => ({ t: r[0], o: r[1], h: r[2], l: r[3], c: r[4], v: r[5] })).filter(b => b.o > 0 && b.h > 0 && b.l > 0 && b.c > 0);
}
function meta(){ return JSON.parse(fs.readFileSync(path.join(DATA, 'meta.json'), 'utf8')); }

/* ---- indicators (arrays aligned with the candles) ---- */
function sma(a, n){ const out = new Array(a.length).fill(null); let s = 0; for (let i = 0; i < a.length; i++){ s += a[i]; if (i >= n) s -= a[i - n]; if (i >= n - 1) out[i] = s / n; } return out; }
function atr(c, n){ const out = new Array(c.length).fill(null); let a = null; for (let i = 0; i < c.length; i++){ const tr = i ? Math.max(c[i].h - c[i].l, Math.abs(c[i].h - c[i - 1].c), Math.abs(c[i].l - c[i - 1].c)) : c[i].h - c[i].l; a = a == null ? tr : (a * (n - 1) + tr) / n; if (i >= n) out[i] = a; } return out; }
function rsi(a, n){ const out = new Array(a.length).fill(null); let g = 0, l = 0; for (let i = 1; i < a.length; i++){ const d = a[i] - a[i - 1], up = Math.max(d, 0), dn = Math.max(-d, 0); if (i <= n){ g += up / n; l += dn / n; if (i === n) out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } else { g = (g * (n - 1) + up) / n; l = (l * (n - 1) + dn) / n; out[i] = 100 - 100 / (1 + g / (l || 1e-12)); } } return out; }
function highest(c, n, key){ const out = new Array(c.length).fill(null); for (let i = n - 1; i < c.length; i++){ let m = -Infinity; for (let k = i - n + 1; k <= i; k++) if (c[k][key] > m) m = c[k][key]; out[i] = m; } return out; }
function lowest(c, n, key){ const out = new Array(c.length).fill(null); for (let i = n - 1; i < c.length; i++){ let m = Infinity; for (let k = i - n + 1; k <= i; k++) if (c[k][key] < m) m = c[k][key]; out[i] = m; } return out; }

module.exports = { DATA, BRIDGE, base, groupOf, file, has, load, meta, sma, atr, rsi, highest, lowest };
