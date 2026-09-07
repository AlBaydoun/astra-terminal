'use strict';
BROKER.init();
const checks = [];
function test(name, run){ checks.push({ name, run }); }
function assert(ok, message){ if (!ok) throw new Error(message || 'Assertion failed'); }
function near(actual, expected, message){ assert(Math.abs(actual - expected) < 1e-7, (message || '') + ': ' + actual + ' != ' + expected); }
function ledger(){ return BotEngine.blank('test'); }
function signal(sym = 'BTCUSDT', entry = 100, sl = 99){
  return { sym, tf: '1h', dir: 1, entry, sl, tp: null, reasons: [], factors: {} };
}
// Any routine that normally saves now fails unless a test explicitly substitutes it.
const renderManual = Bots.render;
Bots.render = () => {};
function fresh(sym = 'BTCUSDT'){
  Feed.srcOf[sym] = 'binance'; Feed.quoteTime[sym] = Date.now() / 1000;
  Feed.liveOnly = true;
  return { price: 100, spread: 0, ageSec: 0 };
}
function spec(sym, patch){
  Feed.specs[sym] = Object.assign({ contractSize: 100, tickSize: 0.01, tickValue: 1,
    volumeMin: 0.01, volumeStep: 0.01, volumeMax: 100 }, patch || {});
}
test('Close stop cannot create a position worth more than the account', () => {
  const L = ledger(), q = fresh(), sig = signal('BTCUSDT', 100, 99.99999);
  const gate = BotEngine.check(L, {}, sig, q);
  assert(gate.ok, gate.reason);
  const p = BotEngine.open(L, { noLearn: true }, sig, q, gate);
  assert(p.qty * p.entry <= 10000 + 1e-8, 'Notional exceeded equity');
  assert(p.riskCash <= 50 + 1e-8, 'Risk exceeded 0.5%');
});
test('Position limits apply to direct entry and zero really means no entries', () => {
  const L = ledger(), q = fresh(), sig = signal();
  assert(!BotEngine.check(L, { maxOpen: 0 }, sig, q).ok, 'Zero limit bypassed');
  const gate = BotEngine.check(L, { maxOpen: 1 }, sig, q);
  assert(gate.ok, gate.reason);
  assert(BotEngine.open(L, { maxOpen: 1 }, sig, q, gate), 'First entry refused');
  assert(!BotEngine.open(L, { maxOpen: 1 }, sig, q, gate), 'Reused approval bypassed maximum');
  assert(L.open.length === 1, 'Too many entries');
});
test('Daily loss locks at equality and expires at UTC midnight', () => {
  const L = ledger(), q = fresh(), sig = signal(), cfg = { nowTs: Date.UTC(2026, 0, 2, 12) };
  BotEngine.replays.add(L); L.daily['2026-01-02'] = { pnl: -200, fees: 0 };
  assert(!BotEngine.check(L, cfg, sig, q).ok, 'Equality did not lock');
  assert(L.lockedUntil === Date.UTC(2026, 0, 3), 'Lock was not UTC midnight');
  cfg.nowTs = Date.UTC(2026, 0, 3);
  assert(BotEngine.check(L, cfg, sig, q).ok, 'Next simulated day did not unlock');
});
test('Daily budget includes fees, open partial losses and reserved stops', () => {
  const L = ledger(), q = fresh(), sig = signal();
  L.daily[BotEngine.dayKey()] = { pnl: -190, fees: 11 };
  assert(!BotEngine.check(L, {}, sig, q).ok, 'Fees bypassed daily loss');
  const L2 = ledger();
  L2.open.push({ sym: 'ETHUSDT', entry: 100, sl: 90, dir: 1, qty: 17, fees: 0, partialPnl: -1 });
  const gate = BotEngine.check(L2, {}, sig, q);
  assert(!gate.ok && /daily loss budget/.test(gate.reason), 'Open stops bypassed daily budget');
  L2.open[0].partialPnl = -201;
  assert(!BotEngine.check(L2, {}, sig, q).ok, 'Unfinished partial loss bypassed daily limit');
});
test('Aliases and related markets cannot bypass exposure limits', () => {
  const L = ledger(), q = fresh('XAUUSD.m'); spec('XAUUSD.m');
  L.open.push({ sym: 'XAUUSD.s', entry: 100, sl: 99, qty: 1, dir: 1 });
  assert(!BotEngine.check(L, {}, signal('XAUUSD.m'), q).ok, 'Broker suffix bypassed same market limit');
  const L2 = ledger();
  L2.open.push(...['ETHUSDT', 'SOLUSDT'].map(sym => ({ sym, entry: 100, sl: 99, qty: 1, dir: 1 })));
  const gate = BotEngine.check(L2, {}, signal(), fresh());
  assert(!gate.ok && /Related-exposure/.test(gate.reason), 'Crypto exposure limit bypassed');
  assert(BotEngine.exposureKeys('EURUSD.m').includes('fx:USD'), 'Missing USD exposure');
  assert(BotEngine.exposureKeys('GBPUSD.m').includes('fx:USD'), 'Missing correlated USD exposure');
  delete Feed.specs['XAUUSD.m'];
});
test('Missing, future, stale and delayed prices are refused even with bypass settings', () => {
  const sym = 'BTCUSDT', q = fresh(sym), sig = signal();
  for (const stamp of [undefined, 0, NaN, Date.now() / 1000 + 30, Date.now() / 1000 - 181]){
    Feed.quoteTime[sym] = stamp;
    assert(!Feed.isLive(sym), 'Timestamp treated as live: ' + stamp);
    assert(!BotEngine.check(ledger(), { allowDelayed: true, nowTs: 1 }, sig, q).ok, 'Saved setting bypassed freshness');
  }
  fresh(sym); Feed.srcOf[sym] = 'proxy'; Feed.liveOnly = false;
  assert(!Feed.tradable(sym).ok, 'Display switch enabled delayed trading');
  assert(!BotEngine.check(ledger(), { allowDelayed: true }, sig, q).ok, 'Delayed source accepted');
  fresh(sym);
  assert(!BotEngine.check(ledger(), {}, sig, { ...q, time: Date.now() / 1000 - 181 }).ok, 'Old quote object reused');
});
test('Delayed prices cannot trigger paper stop-loss or operator exits', () => {
  const L = ledger(), q = fresh(), sig = signal();
  const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
  Feed.quoteTime[sig.sym] = 0;
  BotEngine.step(L, {}, p, null, { price: 50 });
  BotEngine.close(L, {}, p, 50, 'operator');
  assert(L.open.length === 1 && !L.closed.length, 'Stale price closed a position');
  fresh();
});
test('Polling counts elapsed timeframe bars, not the number of price checks', () => {
  const L = ledger(), q = fresh(), sig = signal();
  const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
  p.entryTime = Date.now() - 120000;
  for (let i = 0; i < 250; i++) BotEngine.step(L, {}, p, null, q);
  assert(L.open.length === 1 && p.barsHeld === 0, 'Hourly position expired after a few minutes');
});
test('A paused bot still executes the stop on its existing paper position', async () => {
  const saved = { ledgers: Bots.ledgers, cfgs: Bots.cfgs, quote: Bots.quoteFor,
    scan: Bots.scanShouldRun, save: BotEngine.save, run: Bots.runBot };
  Bots.ledgers = {}; Bots.cfgs = {};
  for (const b of BOTS){ Bots.ledgers[b.id] = ledger(); Bots.cfgs[b.id] = { paused: true, noLearn: true }; }
  const L = Bots.ledgers.jdub, q = fresh(), sig = signal();
  BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
  Bots.quoteFor = () => ({ ...q, price: 98 }); Bots.scanShouldRun = () => false;
  BotEngine.save = () => {}; Bots.runBot = () => { throw new Error('Paused bot entered'); };
  try {
    await Bots.tick();
    assert(L.open.length === 0 && L.closed[0].reason === 'stop-loss', 'Pause disabled the stop');
  } finally {
    Bots.ledgers = saved.ledgers; Bots.cfgs = saved.cfgs; Bots.quoteFor = saved.quote;
    Bots.scanShouldRun = saved.scan; BotEngine.save = saved.save; Bots.runBot = saved.run;
  }
});
test('Run now respects the configured maximum before scanning', async () => {
  const allowed = Bots.allowed, save = BotEngine.save;
  const b = { id: 'test', name: 'Test', warmup: 1, signal(){ throw new Error('Should not evaluate'); } };
  Bots.ledgers.test = ledger(); Bots.ledgers.test.open.push({ id: 1 });
  Bots.cfgs.test = { maxOpen: 1 };
  Bots.allowed = () => ['BTCUSDT']; BotEngine.save = () => {};
  try { await Bots.runBot(b, true); assert(Bots.ledgers.test.open.length === 1, 'Run now bypassed maxOpen'); }
  finally { Bots.allowed = allowed; BotEngine.save = save; }
});
test('Manual stop edits cannot widen loss beyond the original risk', () => {
  const L = ledger(), q = fresh(), sig = signal(), quote = Bots.quoteFor;
  const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
  Bots.ledgers.test = L; Bots.cfgs.test = {}; Bots.quoteFor = () => q;
  try { Bots.editPos('test', p.id, { sl: 90 }); assert(p.sl === 99 && /risk limit/.test(lastToast), 'Stop edit bypassed risk'); }
  finally { Bots.quoteFor = quote; }
});
test('Exchange event timestamps are recorded and never overwrite connected broker prices', () => {
  const connect = Sock.prototype.connect, bridge = Feed.bridge;
  let onMsg;
  Sock.prototype.connect = function(){ onMsg = this.onMsg; };
  Feed.bridge = { symbols: new Set(['BTCUSD.m']) };
  STORE.tickers.set('BTCUSDT', { last: 99 }); STORE.tickers.set('BTCUSD.m', { last: 88 });
  Feed.srcOf['BTCUSD.m'] = 'bridge'; Feed.quoteTime['BTCUSD.m'] = 123;
  try {
    startGlobalStream();
    const stamp = Date.now();
    onMsg([{ s: 'BTCUSDT', c: '100', o: '99', h: '101', l: '98', v: '1', q: '100', E: stamp }]);
    near(Feed.quoteTime.BTCUSDT, stamp / 1000, 'Exchange event time');
    assert(Feed.isLive('BTCUSDT'), 'Exchange quote should be fresh');
    near(STORE.tickers.get('BTCUSD.m').last, 88, 'Broker quote overwritten');
    assert(Feed.srcOf['BTCUSD.m'] === 'bridge', 'Broker source overwritten');
    onMsg([{ s: 'BTCUSDT', c: '100', o: '99' }]);
    assert(!Feed.isLive('BTCUSDT'), 'Missing event time accepted');
  } finally { Sock.prototype.connect = connect; Feed.bridge = bridge; fresh(); }
});
test('Failed quote requests cannot relabel delayed prices as live', async () => {
  const fetchBefore = window.fetch, bridge = Feed.bridge;
  Feed.bridge = { symbols: new Set(['TEST']) };
  Feed.srcOf.TEST = 'proxy'; Feed.quoteTime.TEST = Date.now() / 1000;
  window.fetch = async () => ({ ok: false });
  try { await Feed.quotes(['TEST']); assert(Feed.srcOf.TEST === 'proxy' && !Feed.isLive('TEST'), 'Request relabelled an old quote'); }
  finally { window.fetch = fetchBefore; Feed.bridge = bridge; }
});
function history(){
  return Array.from({ length: 260 }, (_, i) => ({ rawTime: 1700000000 + i * 3600,
    time: 1700000000 + i * 3600, open: 100, high: 100.5, low: 99.5, close: 100, volume: 1 }));
}
test('Backtest stops a new trade on its entry candle and uses historical timestamps', async () => {
  const klines = API.klines, bars = history();
  bars[220] = { ...bars[220], high: 103, low: 98, close: 102 };
  API.klines = async () => bars;
  Feed.quoteTime.BTCUSDT = 0;
  const b = { id: 'test', defaults: { tf: '1h' }, warmup: 220,
    signal(w){ assert(w[w.length - 1].high === w[w.length - 1].open, 'Future high leaked');
      return w.length === 221 ? { ...signal(), tp: 102 } : null; } };
  try {
    const r = await Backtest.run(b, { sym: 'BTCUSDT' });
    assert(!r.error, r.error); assert(r.closed.length === 1, 'Expected one trade');
    assert(r.closed[0].reason === 'stop-loss', 'Entry candle stop skipped');
    near(r.closed[0].entryTime, bars[220].rawTime * 1000, 'Entry replay time');
    near(r.closed[0].exitTime, bars[220].rawTime * 1000, 'Exit replay time');
    assert(r.stats.maxDD > 0, 'First losing trade was missing from drawdown');
    assert(r.curve.every(p => p.t < Date.UTC(2024, 0, 1)), 'Real time leaked into history curve');
  } finally { API.klines = klines; fresh(); }
});
test('Short split histories and strategy exceptions produce explicit errors', async () => {
  const klines = API.klines, log = console.error; let logged = false;
  API.klines = async () => history();
  const b = { id: 'test', defaults: { tf: '1h' }, warmup: 220, signal(){ throw new Error('deliberate test failure'); } };
  console.error = (...args) => { logged = String(args[0]).includes('backtest strategy failed'); };
  try {
    const short = await Backtest.run(b, { sym: 'BTCUSDT', slice: 'first' });
    assert(short.error && /warm-up/.test(short.error), 'Short split not explained');
    const r = await Backtest.run(b, { sym: 'BTCUSDT' });
    assert(r.error && /deliberate test failure/.test(r.error) && logged, 'Strategy error was swallowed');
  } finally { API.klines = klines; console.error = log; }
});
test('Stop takes priority over target and an absent target stays absent', () => {
  const L = ledger(), q = fresh(), sig = signal();
  sig.tp = 102;
  const p = BotEngine.open(L, { noLearn: true }, sig, q, BotEngine.check(L, {}, sig, q));
  const rec = BotEngine.step(L, { noLearn: true }, p, { high: 103, low: 98, close: 100 }, q);
  assert(rec.reason === 'stop-loss' && rec.pnl < 0, 'Target won an ambiguous candle');
  const L2 = ledger(); sig.tp = null;
  const p2 = BotEngine.open(L2, {}, sig, q, BotEngine.check(L2, {}, sig, q));
  BotEngine.step(L2, {}, p2, null, { ...q, price: 101 });
  assert(L2.open.length === 1, 'Null target closed immediately');
});
test('Risk uses the current executable price, including unchanged costs', () => {
  const L = ledger(), q = fresh(), sig = signal('BTCUSDT', 99.01, 99);
  const gate = BotEngine.check(L, {}, sig, q);
  assert(gate.ok, gate.reason);
  const p = BotEngine.open(L, { noLearn: true }, sig, q, gate);
  BotEngine.close(L, { noLearn: true }, p, p.sl, 'stop-loss');
  assert(10000 - L.equity <= 50 + 1e-7, 'Total loss at stop exceeded cash risk');
});
test('Broker lot minimum, step and maximum are all enforced', () => {
  const sym = 'XAUUSD.m', q = fresh(sym); spec(sym, { volumeMax: 0.237 });
  const gate = BotEngine.check(ledger(), {}, signal(sym), q);
  assert(gate.ok, gate.reason); near(gate.lots, 0.23, 'Rounded broker maximum');
  near(gate.qty, 23, 'Contract units');
  spec(sym, { volumeMin: 1 });
  assert(!BotEngine.check(ledger(), {}, signal(sym), q).ok, 'Minimum lot must be refused');
  delete Feed.specs[sym];
  assert(!BotEngine.check(ledger(), {}, signal(sym), q).ok, 'Missing specifications must be refused');
  spec(sym, { volumeStep: 0 });
  assert(!BotEngine.check(ledger(), {}, signal(sym), q).ok, 'Invalid lot step must be refused');
  spec(sym, { tickValue: 0.0067 });
  assert(!BotEngine.check(ledger(), {}, signal(sym), q).ok, 'Unconverted contract value must be refused');
  delete Feed.specs[sym];
});
test('Typed amounts cannot bypass either ceiling', () => {
  const q = fresh(), sig = signal();
  sig.requestedQty = 1000;
  assert(!BotEngine.check(ledger(), {}, sig, q).ok, 'Typed amount bypassed risk');
  sig.sl = 99.999; sig.requestedQty = 101;
  const gate = BotEngine.check(ledger(), {}, sig, q);
  assert(!gate.ok && /position-value/.test(gate.reason), 'Typed amount bypassed notional');
  sig.requestedQty = 10;
  assert(BotEngine.check(ledger(), {}, sig, q).ok, 'Small explicit size should pass');
});
test('Brain reductions keep units, lots and risk in agreement', () => {
  const sym = 'XAUUSD.m'; spec(sym);
  const gate = BotEngine.check(ledger(), {}, signal(sym), fresh(sym));
  assert(gate.ok, gate.reason);
  const shrunk = BotEngine.shrink(gate, 0.6);
  assert(shrunk.ok, shrunk.reason);
  near(shrunk.qty, shrunk.lots * 100, 'Quantity agrees with lots');
  near(shrunk.riskCash, gate.riskCash * shrunk.qty / gate.qty, 'Risk agrees with units');
  assert(!BotEngine.shrink(gate, 0.001).ok, 'Reduction below minimum must be refused');
  delete Feed.specs[sym];
});
test('Manual preview and submitted paper order use the same approved size', async () => {
  const sym = 'BTCUSDT', q = fresh(sym);
  document.getElementById('fixture').innerHTML = '<input id="mbAmt" value="100"><input id="mbQty">' +
    '<input id="mbSl" value="99"><input id="mbTp"><input id="mbNote" value="test">' +
    '<input id="mbTf" value="1h"><button id="mbSym" data-val="BTCUSDT"></button>';
  const save = BotEngine.save, quote = Bots.quoteFor, liveQuote = Bots.liveQuote;
  BotEngine.save = () => {}; Bots.quoteFor = () => q; Bots.liveQuote = async () => q;
  Bots.ledgers.manual = ledger(); Bots.cfgs.manual = {}; Bots.manualSide = 1;
  try {
    const size = Bots.manualSize(sym, 100, 1);
    await Bots.manualOpen();
    const p = Bots.ledgers.manual.open[0];
    assert(p, lastToast); near(p.qty, size.qty, 'Preview quantity'); near(p.riskCash, size.riskCash, 'Preview risk');
    document.getElementById('mbAmt').value = '1000000';
    await Bots.manualOpen();
    assert(Bots.ledgers.manual.open.length === 1, 'Oversized manual order opened');
    assert(/Rejected/.test(lastToast), 'Rejection must be visible');
  } finally { BotEngine.save = save; Bots.quoteFor = quote; Bots.liveQuote = liveQuote; }
});
test('Manual partial exit: FX commission is 0.003%, indices and crypto are zero', () => {
  const save = BotEngine.save, quote = Bots.quoteFor;
  BotEngine.save = () => {};
  Bots.quoteFor = () => ({ price: 100, spread: 0, ageSec: 0 });
  try {
    for (const [sym, expected] of [['EURUSD.m', 0.00299985], ['US100.std', 0], ['BTCUSD.m', 0]]){
      fresh(sym); spec(sym, { contractSize: 1, tickValue: 0.01 });
      const L = ledger();
      L.open.push({ id: 1, sym, qty: 2, dir: 1, entry: 100, fees: 0 });
      Bots.ledgers.test = L; Bots.cfgs.test = {};
      Bots.partialClose('test', 1, 0.5);
      near(L.open[0].fees, expected, sym + ' commission');
      near(L.equity, 10000 - 0.005 - expected, sym + ' balance including configured slippage');
      assert(L.open[0].touched, 'Hand adjustment must remain flagged');
      delete Feed.specs[sym];
    }
  } finally { BotEngine.save = save; Bots.quoteFor = quote; }
});
test('Partial exits preserve broker steps and refuse splitting the minimum lot', () => {
  const sym = 'XAUUSD.m', L = ledger(); fresh(sym); spec(sym);
  const p = { sym, qty: 3, lots: 0.03, dir: 1, entry: 100, fees: 0 };
  L.open.push(p);
  const part = BotEngine.partialFill(L, {}, p, 0.5, 101);
  assert(part.ok, part.reason); near(part.qty, 1, 'One lot step closed'); near(p.lots, 0.02, 'Remaining lots');
  near(p.qty, 2, 'Remaining units');
  const small = { sym, qty: 1, lots: 0.01, dir: 1, entry: 100, fees: 0 };
  L.open.push(small);
  assert(!BotEngine.partialFill(L, {}, small, 0.5, 101).ok, 'Minimum lot split into unfillable pieces');
  delete Feed.specs[sym];
});
test('Both targets on one candle finish the remaining position', () => {
  const L = ledger(), q = fresh(), sig = { ...signal(), tp1: 101, tp: 102 };
  const p = BotEngine.open(L, { noLearn: true }, sig, q, BotEngine.check(L, {}, sig, q));
  const r = BotEngine.step(L, { noLearn: true }, p, { high: 103, low: 100, close: 102 }, q);
  assert(r && r.reason === 'target reached' && !L.open.length, 'Final target ignored after partial');
});
test('Equity does not charge fees twice or retain the old size after a partial exit', () => {
  const L = ledger(); L.equity = 9999;
  L.open.push({ entry: 100, last: 101, qty: 1, dir: 1, fees: 1, unreal: 19 });
  near(BotEngine.equityNow(L), 10000, 'Cash plus current gross floating P&L');
});
test('Malformed limits, missing values and wrong-side levels fail closed', () => {
  const q = fresh(), sig = signal();
  for (const cfg of [{ paused: true }, { maxOpen: NaN }, { risk: { riskPct: Infinity } }, { risk: { maxNotionalPct: 0 } }])
    assert(!BotEngine.check(ledger(), cfg, sig, q).ok, 'Invalid limits passed');
  for (const sl of [null, 0, NaN, Infinity, 101])
    assert(!BotEngine.check(ledger(), {}, { ...sig, sl }, q).ok, 'Invalid stop passed');
  assert(!BotEngine.check(ledger(), {}, { ...sig, tp: 90 }, q).ok, 'Wrong-side target passed');
  const L = ledger(); L.daily[BotEngine.dayKey()] = { pnl: NaN };
  assert(!BotEngine.check(L, {}, sig, q).ok, 'Invalid day P&L bypassed risk');
});
test('Feed labels never call a stale or delayed price live', () => {
  fresh(); Feed.quoteTime.BTCUSDT -= 181;
  assert(Feed.status('BTCUSDT').label === 'STALE', 'Stale badge incorrectly LIVE');
  fresh(); Feed.srcOf.BTCUSDT = 'proxy';
  assert(Feed.status('BTCUSDT').label === 'DELAYED', 'Public feed badge incorrectly LIVE');
  fresh();
});
test('A successful quote publishes matching price, timestamp and source together', async () => {
  const fetchBefore = window.fetch, bridge = Feed.bridge;
  Feed.bridge = { symbols: new Set(['TEST']) };
  const time = Date.now() / 1000;
  STORE.tickers.set('TEST', { last: 50 });
  window.fetch = async () => ({ ok: true, json: async () => ({ quotes: [{ symbol: 'TEST', last: 100, bid: 99, ask: 101, time }] }) });
  try {
    await Feed.quotes(['TEST']);
    near(STORE.tickers.get('TEST').last, 100, 'Published price');
    near(Feed.quoteTime.TEST, time, 'Published timestamp');
    assert(Feed.srcOf.TEST === 'bridge', 'Published source');
  } finally { window.fetch = fetchBefore; Feed.bridge = bridge; }
});
test('Broker suffix aliases retain the measured commission for every asset class', () => {
  for (const [sym, expected] of [['XAUUSD.s', 0.00003], ['EURUSD.s', 0.00003], ['WTI.s', 0.00003],
    ['US100.s', 0], ['BTCUSD.s', 0]]) near(BotEngine.commissionFrac(sym, BotEngine.RISK), expected, sym);
});
test('Strategy failures are recorded in the bot decisions and reported to the console', async () => {
  const saved = { allowed: Bots.allowed, save: BotEngine.save, klines: API.klines, log: console.error };
  const b = { id: 'test', name: 'Test', warmup: 1, signal(){ throw new Error('deliberate failure'); } };
  Bots.ledgers.test = ledger(); Bots.cfgs.test = { maxOpen: 1, tf: '1h' };
  Bots.allowed = () => ['BTCUSDT']; BotEngine.save = () => {}; API.klines = async () => history();
  let logged = false; console.error = text => { logged = /deliberate failure/.test(text); };
  try {
    await Bots.runBot(b, true);
    assert(logged && Bots.ledgers.test.decisions.some(d => d.kind === 'error' && /deliberate failure/.test(d.text)), 'Silent strategy error');
  } finally { Bots.allowed = saved.allowed; BotEngine.save = saved.save; API.klines = saved.klines; console.error = saved.log; }
});
test('Missing leverage cannot silently reinterpret a margin amount', () => {
  const account = Feed.account, mode = Bots.amtMode;
  Feed.account = null; Bots.amtMode = 'margin';
  try { assert(Bots.manualRequest('BTCUSDT', 100, { amt: 100, lots: NaN }).reason, 'Margin silently became position value'); }
  finally { Feed.account = account; Bots.amtMode = mode; }
});
test('A 10% first position leaves only 90% allocation, regardless of leverage', () => {
  const L = ledger(), q = fresh(), sig = { ...signal(), sl: 99.9, requestedQty: 10 };
  const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
  assert(p, 'First position refused');
  Bots.ledgers.manual = L; Bots.cfgs.manual = {};
  const account = Feed.account; Feed.account = { leverage: 2000 };
  try {
    const F = Bots.manualFunds();
    near(F.used, p.entry * p.qty, 'Reserve full position value');
    near(F.free, 10000 - p.entry * p.qty, 'Available allocation');
    const second = { ...signal('ETHUSDT', 100, 99.9), requestedQty: 100 };
    fresh('ETHUSDT');
    const gate = BotEngine.check(L, {}, second, q);
    assert(!gate.ok && /remaining position-value/.test(gate.reason), 'Second entry reused the whole account');
    BotEngine.partialFill(L, {}, p, 0.5, 100);
    assert(Bots.manualFunds().free > F.free, 'Partial exit did not release allocation');
  } finally { Feed.account = account; }
});
test('Broker wall clock converts only after an advancing tick; frozen quotes stay stale', () => {
  const bridge = Feed.bridge, clock = Feed.bridgeClock, now = Date.now() / 1000;
  Feed.bridge = { server: 'JustMarkets-Live', symbols: new Set() }; Feed.bridgeClock = null;
  try {
    near(Feed.bridgeTime('ETHUSD.s', now + 10800, now), now + 10800, 'One tick cannot establish offset');
    near(Feed.bridgeTime('ETHUSD.s', now + 10800, now + 5), now + 10800, 'Frozen tick cannot establish offset');
    near(Feed.bridgeTime('ETHUSD.s', now + 10806, now + 6), now + 6, 'Advancing tick establishes GMT+3');
    near(Feed.bridgeTime('ETHUSD.s', now + 10806, now + 200), now + 6, 'Old tick never receives a new timestamp');
    near(Feed.bridgeTime('EURUSD.s', now - 86400 + 10800, now + 200), now - 86400, 'Closed market remains old');
  } finally { Feed.bridge = bridge; Feed.bridgeClock = clock; }
});
test('A single broker quote and specification populate every requested alias', async () => {
  const bridge = Feed.bridge, alias = Feed.alias, fetchBefore = window.fetch;
  Feed.bridge = { symbols: new Set(['ETHUSD.s']) }; Feed.alias = { 'ETHUSD.m': 'ETHUSD.s' };
  const brokerSpec = { contractSize: 1, volumeMin: 0.01, volumeStep: 0.01, volumeMax: 100, tickValue: 0.01, tickSize: 0.01 };
  window.fetch = async url => ({ ok: true, json: async () => String(url).includes('/specs')
    ? { specs: { 'ETHUSD.s': brokerSpec } }
    : { quotes: [{ symbol: 'ETHUSD.s', last: 100, bid: 99.99, ask: 100.01, time: Date.now() / 1000 }] } });
  try {
    await Feed.quotes(['ETHUSD.m', 'ETHUSD.s']); await Feed.loadSpecs(['ETHUSD.m', 'ETHUSD.s']);
    for (const sym of ['ETHUSD.m', 'ETHUSD.s']){
      assert(Bots.quoteFor(sym)?.price === 100, 'Missing quote for ' + sym);
      assert(Feed.specFor(sym)?.volumeStep === 0.01, 'Missing specification for ' + sym);
    }
  } finally {
    Feed.bridge = bridge; Feed.alias = alias; window.fetch = fetchBefore;
    delete Feed.specs['ETHUSD.m']; delete Feed.specs['ETHUSD.s'];
  }
});
test('Saved stop and target survive serialization and the restored stop executes', () => {
  fixtureStorage = new Map();
  const L = ledger(), q = fresh(), sig = { ...signal(), tp: 102 };
  try {
    const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
    Bots.ledgers.test = L; Bots.cfgs.test = {};
    Bots.editPos('test', p.id, { sl: 99.5, tp: 103 });
    const restored = BotEngine.load('test'), saved = restored.open[0];
    assert(saved !== p && saved.sl === 99.5 && saved.tp === 103 && saved.touched, 'Saved levels or hand-adjustment flag lost');
    BotEngine.step(restored, { noLearn: true }, saved, null, { price: 99.4 });
    assert(restored.closed[0]?.reason === 'stop-loss', 'Restored stop did not execute');
  } finally { fixtureStorage = null; }
});
test('A failed save blocks new entries until the same ledger saves successfully', () => {
  const L = ledger(), q = fresh(); fixtureSaveFails = true;
  try {
    assert(BotEngine.save('test', L) === false, 'Save failure hidden');
    assert(/Save failed/.test(BotEngine.check(L, {}, signal(), q).reason), 'Unsaved ledger still accepts entries');
    fixtureSaveFails = false; fixtureStorage = new Map();
    assert(BotEngine.save('test', L), 'Retry did not save');
    assert(BotEngine.check(L, {}, signal(), q).ok, 'Successful save did not release lock');
  } finally { fixtureSaveFails = false; fixtureStorage = null; }
});
test('Repeated manual refreshes preserve the actual inputs, instrument, timeframe and focus', () => {
  const active = Bots.active, refresh = Bots.refreshManualQuote, quote = Bots.quoteFor;
  document.getElementById('fixture').innerHTML = '<div id="botBody"></div>';
  Bots.active = 'manual'; Bots.ledgers.manual = ledger(); Bots.cfgs.manual = {};
  Bots.refreshManualQuote = () => {}; Bots.quoteFor = () => fresh();
  try {
    renderManual.call(Bots);
    const pick = document.getElementById('mbSym'), note = document.getElementById('mbNote');
    pick.dataset.val = 'ETHUSD.m'; document.getElementById('mbTf').value = '4h';
    document.getElementById('mbSl').value = '90'; document.getElementById('mbTp').value = '110';
    note.value = 'keep this draft';
    for (let i = 0; i < 10; i++) renderManual.call(Bots);
    assert(document.getElementById('mbNote') === note && note.value === 'keep this draft', 'Input replaced');
    assert(pick.dataset.val === 'ETHUSD.m' && document.getElementById('mbTf').value === '4h', 'Selection reset');
    assert(document.getElementById('mbSl').value === '90' && document.getElementById('mbTp').value === '110', 'Levels reset');
  } finally { Bots.active = active; Bots.refreshManualQuote = refresh; Bots.quoteFor = quote; }
});
test('A long stop crossed between quotes exits at the observed price, not the old stop', () => {
  const L = ledger(), q = fresh(), sig = signal('BTCUSDT', 100, 95);
  const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
  const rec = BotEngine.step(L, { noLearn: true }, p, null, { price: 90 });
  near(rec.exit, 90 * (1 - BotEngine.RISK.slippagePct / 100), 'Long gap exit');
  assert(rec.sl === 95 && rec.reason === 'stop-loss', 'Saved stop or reason changed');
  assert(rec.pnl < -p.riskCash, 'Gap loss understated');
});

test('A short stop crossed between quotes exits at the observed price, not the old stop', () => {
  const L = ledger(), q = fresh(), sig = { ...signal('BTCUSDT', 100, 105), dir: -1 };
  const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
  const rec = BotEngine.step(L, { noLearn: true }, p, null, { price: 110 });
  near(rec.exit, 110 * (1 + BotEngine.RISK.slippagePct / 100), 'Short gap exit');
  assert(rec.sl === 105 && rec.reason === 'stop-loss', 'Saved stop or reason changed');
});

test('Candle gaps use the opening price; ordinary intrabar stops still use the stop', () => {
  for (const dir of [1, -1]) for (const gap of [false, true]){
    const L = ledger(), q = fresh(), sl = dir > 0 ? 95 : 105;
    const sig = { ...signal('BTCUSDT', 100, sl), dir };
    const p = BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q));
    const opening = gap ? (dir > 0 ? 90 : 110) : 100;
    const bar = { open: opening, high: 112, low: 88, close: 101 };
    const rec = BotEngine.step(L, { noLearn: true }, p, bar, { price: bar.close });
    near(rec.exit, (gap ? opening : sl) * (1 - dir * BotEngine.RISK.slippagePct / 100), 'Candle stop');
  }
});

test('A restored position keeps its stop and target but uses the first fresh price after a gap', () => {
  fixtureStorage = new Map();
  try {
    const L = ledger(), q = fresh(), sig = { ...signal('BTCUSDT', 100, 95), tp: 110 };
    BotEngine.open(L, {}, sig, q, BotEngine.check(L, {}, sig, q)); BotEngine.save('test', L);
    const restored = BotEngine.load('test');
    Feed.quoteTime.BTCUSDT = Date.now()/1000 - 181;
    BotEngine.step(restored, { noLearn: true }, restored.open[0], null, { price: 90 });
    assert(restored.open.length === 1, 'Stale quote executed during outage');
    fresh();
    const rec = BotEngine.step(restored, { noLearn: true }, restored.open[0], null, { price: 90 });
    near(rec.exit, 90 * (1 - BotEngine.RISK.slippagePct / 100), 'Restored gap exit');
    assert(rec.sl === 95 && rec.tp === 110, 'Saved levels overwritten');
  } finally { fixtureStorage = null; }
});

test('The historical backtester applies the adverse opening gap with unchanged costs', async () => {
  const klines = API.klines;
  const candles = Array.from({length:250}, (_, i) => ({ rawTime:1700000000+i*3600,
    open:100, high:101, low:99, close:100, volume:10 }));
  candles[241] = {...candles[241], open:90, high:96, low:89, close:94};
  API.klines = async () => candles;
  try {
    const bot = { id:'gap-check', defaults:{tf:'1h'}, warmup:240,
      signal:w => w.length === 241 ? {dir:1,entry:100,sl:95,tp:110} : null };
    const result = await Backtest.run(bot,{sym:'BTCUSDT',tf:'1h'});
    assert(!result.error && result.closed.length === 1, result.error || 'Missing backtest trade');
    near(result.closed[0].exit, 90 * (1 - BotEngine.RISK.slippagePct / 100), 'Backtest gap');
    assert(result.closed[0].sl === 95, 'Backtest rewrote original stop');
  } finally { API.klines = klines; }
});

document.getElementById('run').onclick = async () => {
  const out = document.getElementById('results');
  out.textContent = 'Running…'; out.className = '';
  const lines = []; let failures = 0;
  for (const c of checks){
    try { await c.run(); lines.push('PASS  ' + c.name); }
    catch(e){ failures++; lines.push('FAIL  ' + c.name + '\n      ' + e.message); console.error(c.name, e); }
  }
  out.className = failures ? 'fail' : 'pass';
  out.textContent = lines.join('\n') + '\n\n' + (checks.length - failures) + '/' + checks.length + ' passed.';
  console.info('ASTRA risk checks: ' + (checks.length - failures) + '/' + checks.length + ' passed');
};
