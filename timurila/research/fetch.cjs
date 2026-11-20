/* Timurila research — step 1: copy history and spreads out of the MT5 bridge.
   Read-only (GET /health, /quotes, /candles). One request at a time with a pause,
   because the same bridge is serving the live terminal. Output: ./data (not committed). */
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function get(p){ const r = await fetch(L.BRIDGE + p); if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); }

(async () => {
  fs.mkdirSync(L.DATA, { recursive: true });
  const h = await get('/health');
  const syms = h.symbols || [];
  const groups = {}; for (const s of syms) (groups[L.groupOf(s)] = groups[L.groupOf(s)] || []).push(s);
  console.log('symbols', syms.length, Object.entries(groups).map(([g, a]) => g + ' ' + a.length).join(' · '));
  if (groups.other) console.log('unclassified:', groups.other.join(' '));

  const quotes = {};
  for (let i = 0; i < syms.length; i += 40){
    try { const q = await get('/quotes?symbols=' + encodeURIComponent(syms.slice(i, i + 40).join(',')));
      for (const x of q.quotes || []) quotes[x.symbol] = { bid: x.bid, ask: x.ask, last: x.last, time: x.time, digits: x.digits }; }
    catch(e){ console.log('quotes chunk failed', i, e.message); }
    await sleep(150);
  }
  fs.writeFileSync(path.join(L.DATA, 'meta.json'), JSON.stringify({ fetchedAt: Date.now(), server: h.server, symbols: syms, quotes }));
  console.log('quotes', Object.keys(quotes).length);

  const now = Math.floor(Date.now() / 1000), EPOCH = 946684800;
  let done = 0, empty = [];
  for (const s of syms){
    const g = L.groupOf(s);
    const jobs = [['1d', EPOCH]];
    if (g !== 'shares'){ jobs.push(['4h', EPOCH]); jobs.push(['1h', now - 730 * 86400]); }
    for (const [tf, from] of jobs){
      try { const j = await get('/candles?symbol=' + encodeURIComponent(s) + '&tf=' + tf + '&limit=60000&from=' + from);
        const c = j.candles || []; if (!c.length) empty.push(s + ' ' + tf);
        fs.writeFileSync(L.file(s, tf), JSON.stringify(c)); }
      catch(e){ empty.push(s + ' ' + tf + ' ' + e.message); }
      await sleep(40);
    }
    if (++done % 25 === 0) console.log(done + '/' + syms.length);
  }
  console.log('done', done, 'empty:', empty.length ? empty.join(', ') : 'none');
})().catch(e => { console.error('FAILED', e.message); process.exit(1); });
