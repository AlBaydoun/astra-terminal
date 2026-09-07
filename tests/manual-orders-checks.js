BROKER.init(); fixtureStorage = new Map();
Bots.refreshManualQuote = () => {}; Feed.loadSpecs = async () => {};
Feed.quotes = async () => []; ManualOrders.start = () => {};
const checks=[];
function test(name,run){ checks.push({name,run}); }
function assert(ok,why){ if(!ok) throw Error(why); }
function quote(price=2491, sym='ETHUSD.m', spread=0.2){
  Feed.srcOf[sym]='bridge'; Feed.quoteTime[sym]=Date.now()/1000;
  STORE.tickers.set(sym,{last:price,spread,bid:price-spread/2,ask:price+spread/2});
  return Bots.quoteFor(sym);
}
function reset(){
  fixtureSaveFails=false; fixtureStorage.clear(); PairRules.state=null; PairRules._cache=null;
  Bots.ledgers={manual:BotEngine.blank('manual')}; Bots.cfgs={manual:{}}; Bots.active='manual';
  Bots.manualSide=1; Bots.amtMode='value'; Bots.manualDraft=null; ManualOrders.error='';
  STORE.symbol='ETHUSD.m'; STORE.tf='1h';
  Feed.specs['ETHUSD.m']={contractSize:1,volumeMin:0.01,volumeStep:0.01,volumeMax:100,tickSize:0.01,tickValue:0.01};
  quote(); document.getElementById('botBody').removeAttribute('data-bot'); Bots.render();
}
function order(patch={}){
  return {id:crypto.randomUUID(),sym:'ETHUSD.m',type:'limit',dir:1,entry:2490.20,sl:2470,tp:2530,
    qty:0.4,tf:'1h',note:'Test instruction',createdAt:Date.now(),status:'waiting',...patch};
}
function queued(patch){ const o=order(patch); ManualOrders.save([o]); return o; }
function current(){ return ManualOrders.read()[0]; }
test('Buy limit waits above 2490.20 and fills only at or below it with the chosen SL/TP', () => {
  queued(); ManualOrders.process(); assert(current().status==='waiting','Entered early');
  quote(2490.20); ManualOrders.process(); assert(current().status==='waiting','Ignored spread/slippage');
  quote(2489.90); ManualOrders.process(); const p=Bots.ledgers.manual.open[0];
  assert(current().status==='filled' && p.entry<=2490.20,'Wrong buy fill');
  assert(p.sl===2470 && p.tp===2530 && p.qty===0.4,'Levels or quantity changed');
});
test('Sell limit waits below 2499.30 and fills only at or above it', () => {
  queued({dir:-1,entry:2499.30,sl:2520,tp:2470}); ManualOrders.process();
  assert(current().status==='waiting','Sell entered early'); quote(2500); ManualOrders.process();
  assert(current().status==='filled' && Bots.ledgers.manual.open[0].entry>=2499.30,'Wrong sell fill');
});
test('Buy and sell stop entries wait on the opposite side and use the actual gap price', () => {
  for(const dir of [1,-1]){
    Bots.ledgers.manual=BotEngine.blank('manual'); quote();
    ManualOrders.save([order({type:'stop',dir,entry:dir>0?2500:2480,sl:dir>0?2480:2500,tp:dir>0?2540:2450})]);
    ManualOrders.process(); assert(current().status==='waiting','Stop entered early');
    quote(dir>0?2502:2478); ManualOrders.process();
    const p=Bots.ledgers.manual.open[0]; assert(p && (p.entry-current().entry)*dir>0,'Gap filled at invented target');
  }
});
test('Missing or stale live prices never trigger, including after reload', () => {
  queued(); quote(2489); Feed.quoteTime['ETHUSD.m']=Date.now()/1000-181;
  ManualOrders.process(); assert(current().status==='waiting' && !Bots.ledgers.manual.open.length,'Stale fill');
  delete Feed.quoteTime['ETHUSD.m']; ManualOrders.process(); assert(current().status==='waiting','Missing timestamp filled');
});
test('Saved waiting order and levels restore into a new object and trigger once only', async () => {
  const o=queued(); assert(current()!==o && current().sl===2470 && current().tp===2530,'Serialization lost levels');
  quote(2489); await Promise.all([ManualOrders.poll(),ManualOrders.poll(),ManualOrders.exclusive(()=>ManualOrders.process())]);
  assert(Bots.ledgers.manual.open.length===1 && current().status==='filled','Duplicate or missing fill');
  ManualOrders.syncLedger(); ManualOrders.process(); assert(Bots.ledgers.manual.open.length===1,'Reload filled again');
});
test('Cancellation releases the instruction and it cannot execute later', async () => {
  const o=queued(); await ManualOrders.cancel(o.id); quote(2489); ManualOrders.process();
  assert(current().status==='cancelled' && !Bots.ledgers.manual.open.length,'Cancelled order executed');
});
test('A newly blocked pair is rejected at the trigger, including an alias', () => {
  queued(); PairRules.setManual('ETHUSD.s','block'); quote(2489); ManualOrders.process();
  assert(current().status==='rejected' && /Instrument permissions/.test(current().message),'Permission bypass');
});
test('Pause, maximum positions, correlation and daily loss each prevent a triggered entry', () => {
  for(const kind of ['paused','maxOpen','correlated','daily']){
    Bots.ledgers.manual=BotEngine.blank('manual'); Bots.cfgs.manual={};
    if(kind==='paused') Bots.cfgs.manual.paused=true;
    if(kind==='maxOpen') Bots.cfgs.manual.maxOpen=0;
    if(kind==='correlated') Bots.ledgers.manual.open=Array.from({length:2},()=>({sym:'BTCUSDT',entry:100,sl:99,dir:1,qty:1,fees:0}));
    if(kind==='daily') Bots.ledgers.manual.daily[BotEngine.dayKey()]={pnl:-200,fees:0};
    queued(); quote(2489); const count=Bots.ledgers.manual.open.length; ManualOrders.process();
    assert(current().status==='rejected' && Bots.ledgers.manual.open.length===count,kind+' bypassed');
  }
});
test('A second instruction cannot reuse equity committed by the first open position', () => {
  ManualOrders.save([order({qty:0.4,sl:2480}),order({qty:4,sl:2480})]);
  quote(2489); ManualOrders.process(); const orders=ManualOrders.read();
  assert(orders[0].status==='filled' && orders[1].status==='rejected','Used the same funds twice');
  assert(/position-value budget/.test(orders[1].message),'Wrong rejection: '+orders[1].message);
});
test('Broker minimum, step and maximum remain enforced at execution', () => {
  for(const qty of [0.001,101]){
    queued({qty}); quote(2489); ManualOrders.process(); assert(current().status==='rejected','Invalid broker size filled');
  }
  const d={...order(),amt:1000,lots:NaN,amtMode:'value'};
  const p=ManualOrders.preview(d,quote()); assert(p.gate && Math.abs(p.qty/0.01-Math.round(p.qty/0.01))<1e-8,'Preview ignores step');
});
test('A gap beyond the stop or target rejects the order without moving its levels', () => {
  for(const price of [2460,2540]){
    queued({type:'stop',entry:price<2491?2480:2500,dir:price<2491?-1:1,sl:price<2491?2500:2480,tp:price<2491?2470:2530});
    quote(price); ManualOrders.process(); assert(current().status==='rejected','Already crossed target filled');
  }
});
test('Queue save failure prevents a fill; interrupted processing is held for review', () => {
  queued(); quote(2489); fixtureSaveFails=true;
  let failed=false; try{ManualOrders.process();}catch(e){failed=true;}
  assert(failed && !Bots.ledgers.manual.open.length,'Mutated ledger before saving instruction');
  fixtureSaveFails=false; queued({status:'processing'}); ManualOrders.process();
  assert(current().status==='review' && !Bots.ledgers.manual.open.length,'Retried interrupted entry');
});
test('An unsuccessful trade-ledger save leaves the instruction held, never waiting again', () => {
  queued(); quote(2489); const save=BotEngine.save;
  BotEngine.save=()=>false;
  try{ManualOrders.process();assert(current().status==='review' && Bots.ledgers.manual.open.length===1,'Uncertain entry would retry');}
  finally{BotEngine.save=save;}
});
test('The form keeps its entry on refresh and quick SL/TP percentages use that entry', () => {
  const type=document.getElementById('mbOrderType'),entry=document.getElementById('mbEntry');
  type.value='limit'; type.dispatchEvent(new Event('change')); entry.value='2400'; entry.dispatchEvent(new Event('input'));
  document.querySelector('[data-mbpct="sl:1"]').click(); document.querySelector('[data-mbpct="tp:2"]').click();
  assert(+document.getElementById('mbSl').value===2376 && +document.getElementById('mbTp').value===2448,'Percentage used live price');
  for(let i=0;i<10;i++) Bots.render();
  assert(document.getElementById('mbEntry')===entry && entry.value==='2400' && type.value==='limit','Refresh lost entry');
});
test('Actual submit saves the displayed instruction; old ledger shape and keys stay intact', async () => {
  const shape=Object.keys(Bots.ledgers.manual).sort().join(',');
  document.getElementById('mbOrderType').value='limit';document.getElementById('mbEntry').value='2490.20';
  document.getElementById('mbSl').value='2470';document.getElementById('mbTp').value='2530';
  document.getElementById('mbAmt').value='1000';
  await ManualOrders.submit();
  assert(current().entry===2490.20 && current().sl===2470 && current().tp===2530,'Form not saved');
  assert(!Bots.ledgers.manual.open.length && Object.keys(Bots.ledgers.manual).sort().join(',')===shape,'Placement changed ledger');
  assert([...fixtureStorage.keys()].join(',')===ManualOrders.KEY,'Unexpected storage key');
});
test('A changed broker volume step rejects instead of changing the saved quantity', () => {
  queued({qty:0.41}); Feed.specs['ETHUSD.m'].volumeStep=0.1; quote(2489); ManualOrders.process();
  assert(current().status==='rejected' && /volume step changed/.test(current().message),'Quantity silently changed');
});
test('Manual market submission still opens, using the amount mode captured before waiting', async () => {
  const d={...order({entry:2491}),type:'market',amt:1000,lots:NaN,amtMode:'value'};
  Bots.amtMode='margin'; Feed.account={leverage:2000};
  try{await ManualOrders.exclusive(()=>Bots.manualMarketOpen(d));
    assert(Bots.ledgers.manual.open.length===1 && Bots.ledgers.manual.open[0].qty===0.4,'Market order changed size mode');}
  finally{Feed.account=null;}
});
test('A permission changed while a market request waits is rechecked before opening', async () => {
  const get=Feed.loadSpecs;
  Feed.loadSpecs=async()=>{fixtureStorage.set('astra_pairrules',JSON.stringify({auto:true,rules:{'ETHUSD.s':'block'}}));};
  try{await ManualOrders.exclusive(()=>Bots.manualMarketOpen({...order(),type:'market',amt:1000,lots:NaN,amtMode:'value'}));
    assert(!Bots.ledgers.manual.open.length && /Instrument permissions/.test(lastToast),'Used stale permissions');}
  finally{Feed.loadSpecs=get;}
});
test('Cloud sync excludes waiting instructions from both upload and restore', () => {
  assert(Sync.EXCLUDE.includes(ManualOrders.KEY),'Instructions would copy to another device');
  // applyState uses this same exclusion before any storage write; a pending-only
  // payload must be ignored. No actual storage API is reached by this test.
  queued(); const before=JSON.stringify(ManualOrders.read());
  Sync.applyState({[ManualOrders.KEY]:JSON.stringify({orders:[order({entry:1})]})});
  assert(JSON.stringify(ManualOrders.read())===before,'Cloud replaced local instruction');
});
test('The preview quotes the requested executable entry without changing the cost model', () => {
  const d={...order(),amt:1000,lots:NaN,amtMode:'value'},q=quote(),p=ManualOrders.preview(d,q);
  assert(p.gate && Math.abs(p.gate.fill-d.entry)<1e-8,'Preview exceeded limit');
  assert(p.gate.R.slippagePct===0.005 && p.gate.spread===q.spread,'Changed execution costs');
});
document.getElementById('run').onclick=async()=>{
  const out=document.getElementById('results'),lines=[];let failures=0;out.textContent='Running…';
  for(const c of checks){reset();try{await c.run();lines.push('PASS  '+c.name);}catch(e){failures++;lines.push('FAIL  '+c.name+' — '+e.message);console.error(c.name,e);}}
  out.textContent=lines.join('\n')+'\n\n'+(checks.length-failures)+'/'+checks.length+' passed.';
  ManualOrders.refresh();
};
