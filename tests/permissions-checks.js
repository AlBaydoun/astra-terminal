BROKER.init();
fixtureStorage = new Map();
const checks = [];
function assert(ok, why){ if (!ok) throw Error(why); }
function test(name, run){ checks.push({name, run}); }
function reset(){
  fixtureSaveFails = false; fixtureStorage.clear(); PairRules.state = null; PairRules._cache = null;
  Bots.ledgers = {manual: BotEngine.blank('manual')}; Bots.cfgs = {manual: {}};
}
test('Block applies to suffixes, case and crypto aliases; Allow replaces conflicting choices', () => {
  PairRules.setManual('ETHUSD.m', 'block');
  for (const s of ['ETHUSD', 'ethusd.M', 'ETHUSD.s', 'ETHUSDT']) assert(PairRules.blocked(s), s + ' escaped');
  PairRules.state.rules['ETHUSD.s'] = 'allow';
  assert(PairRules.blocked('ETHUSD.s'), 'Conflicting old choice escaped');
  PairRules.setManual('ETHUSD.s', 'allow');
  assert(!PairRules.blocked('ETHUSD.m') && Object.keys(PairRules.state.rules).length === 1, 'Allow did not replace aliases');
  PairRules.state = null;
  assert(PairRules.manualOf('ETHUSDT') === 'allow', 'Choice did not survive serialization');
});
test('Automatic history combines aliases; manual Allow overrides it until reset', () => {
  Bots.ledgers.manual.closed = Array.from({length:6}, (_, i) => ({sym:i%2 ? 'EURUSD.s' : 'EURUSD.m', pnl:-20, exitTime:1}));
  assert(PairRules.blocked('EURUSD'), 'History divided across aliases');
  PairRules.setManual('EURUSD.m', 'allow'); assert(!PairRules.blocked('EURUSD'), 'Explicit allow ignored');
  PairRules.setManual('EURUSD.s', null); assert(PairRules.blocked('EURUSD'), 'Automatic rule did not return');
  PairRules.setAuto(false); assert(!PairRules.blocked('EURUSD'), 'Automatic toggle ignored');
  PairRules.setManual('EURUSD.m', 'block'); assert(PairRules.blocked('EURUSD'), 'Manual block ignored with auto off');
});
test('Failed permission saves keep the previous choice and explain the failure', () => {
  PairRules.setManual('ETHUSD.m', 'block'); fixtureSaveFails = true;
  assert(!PairRules.setManual('ETHUSD.m', 'allow'), 'Failed save claimed success');
  assert(PairRules.blocked('ETHUSD.m') && /not saved/.test(lastToast), 'Unsaved allow replaced previous permission');
});
test('Final entry gate refuses a prohibited alias and names the new controls', () => {
  PairRules.setManual('BTCUSD.m', 'block');
  Feed.srcOf.BTCUSDT = 'binance'; Feed.quoteTime.BTCUSDT = Date.now()/1000;
  const gate = BotEngine.check(Bots.ledgers.manual, {}, {sym:'BTCUSDT',tf:'1h',dir:1,entry:100,sl:99}, {price:100,spread:0,ageSec:0});
  assert(!gate.ok && /Instrument permissions/.test(gate.reason), 'Gate did not identify the permission');
});
test('Page search survives redraws; buttons add, allow and remove an override', () => {
  Bots.active = 'permissions'; Bots.render();
  const input = document.getElementById('prSearch'); input.value = 'ETHUSD'; input.dispatchEvent(new Event('input'));
  for (let i=0;i<10;i++) Bots.render();
  assert(document.getElementById('prSearch') === input && input.value === 'ETHUSD', 'Search replaced');
  document.querySelector('[data-prblock]').click(); assert(PairRules.blocked('ETHUSD.m'), 'Block button failed');
  document.querySelector('[data-prallow]').click(); assert(!PairRules.blocked('ETHUSD.m'), 'Allow button failed');
  document.querySelector('[data-prauto]').click(); assert(PairRules.manualOf('ETHUSD.m') === null, 'Remove override failed');
  assert(PairRules.columns('ETHUSD').allowed.length === 1, 'Duplicate aliases shown');
});
document.getElementById('run').onclick = () => {
  const lines=[]; let failures=0;
  for (const c of checks){ reset(); try{ c.run(); lines.push('PASS  '+c.name); }
    catch(e){failures++;lines.push('FAIL  '+c.name+' — '+e.message);console.error(c.name,e);} }
  document.getElementById('results').textContent=lines.join('\n')+'\n\n'+(checks.length-failures)+'/'+checks.length+' passed.';
};
