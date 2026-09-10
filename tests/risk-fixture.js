/* Only this test page loads these substitutes. Never read or write real ledgers. */
let fixtureStorage = null, fixtureSaveFails = false;
const lsGet = (key, fallback) => fixtureStorage?.has(key) ? JSON.parse(fixtureStorage.get(key)) : fallback;
const lsSet = (key, value) => {
  if (fixtureSaveFails) return false;
  if (!fixtureStorage) throw new Error('Test attempted a storage write');
  fixtureStorage.set(key, JSON.stringify(value)); return true;
};
const fmtNum = x => Number(x).toFixed(2);
const fmtPrice = x => String(x);
const baseAsset = x => x;
const esc = x => String(x);
const fmtPct = x => String(x) + '%';
const pctClass = x => x > 0 ? 'up' : x < 0 ? 'down' : 'flat';
// A property fallback lets ticket checks load the real lexical OpenTrades too.
globalThis.OpenTrades = { stop(){}, refresh(){}, bind(){}, view(){return '';} };
const BUS = { emit(){} };
const STORE = { tickers: new Map(), universe: [], symbol: 'BTCUSDT', tf: '1h' };
const Watch = { list: [] };
const MK = { monitored: [], group: s => /USDT$/.test(s) ? 'crypto' : 'fx' };
const MarketState = { of: () => ({}) };
let lastToast = '';
const toast = text => { lastToast = text; };
