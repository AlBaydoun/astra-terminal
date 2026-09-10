/* Broker transport and storage are disposable; execution uses shipped engine,
   manual writer lock and Confluence entry freshness checks. No live scripts. */
const MarketSources={allowed:()=>true,executable:()=>true,reason:()=> 'Source disabled',brokerList:()=>['ETHUSD.m']};
const baseReset=reset;
reset=function(){ManualAuto.stop();ManualAuto.busy=false;ManualAuto.seen.clear();baseReset();OpenTrades.stop();};
function autoFixture(patch={}){
  Feed.account={currency:'USD'};Feed.bridge={symbols:new Set(['ETHUSD.m'])};Feed.bridgeClock={offset:0};
  Feed.specs['ETHUSD.m'].currency='USD';
  ManualAuto.config={scope:'all',sym:'ETHUSD.m',direction:'both',allocation:5,entries:0,exits:'signal',sl:0.5,tp:1,...patch};
  ManualAuto.running=true;ManualAuto.count=0;ManualAuto.events=[];
  return {sym:'ETHUSD.m',signal:{sym:'ETHUSD.m',dir:1,tf:'15m',entry:2491,sl:2471,tp:2531,atr:10,entryBar:Date.now()/1000,meta:{},reasons:[]}};
}
test('Auto mode defaults stopped; choosing a price mode prepares a saved instruction without entering',()=>{
  assert(!ManualAuto.running,'Auto started itself');
  document.querySelector('[data-ma-price-type="limit"]').click();
  assert(document.getElementById('mbOrderType').value==='limit'&&!document.getElementById('mbEntry').disabled,'Limit mode not prepared');
  assert(!Bots.ledgers.manual.open.length&&!ManualOrders.read().length,'Mode selector submitted');
});
test('Confluence entry respects its per-trade ceiling and saves the automatic label and levels',async()=>{
  const row=autoFixture();await ManualAuto.enter(row,ManualAuto.revision);
  const p=Bots.ledgers.manual.open[0];assert(p,'No entry: '+ManualAuto.events[0]?.text);
  assert(p.entry*p.qty<=500 && p.lots>=0.01,'Allocation or minimum bypass');
  assert(p.model==='Manual Auto · Confluence'&&p.meta.manualAutoBar===row.signal.entryBar,'Automatic identity missing');
  assert(p.sl===2471&&p.tp===2531,'Signal exits changed');
  ManualOrders.syncLedger();assert(Bots.ledgers.manual.open[0].meta.manualAutoBar===row.signal.entryBar,'Identity lost in saved account');
});
test('Percent exits use the selected side and broker price step',async()=>{
  const row=autoFixture({exits:'percent'});row.signal.dir=-1;row.signal.sl=2511;row.signal.tp=2451;
  await ManualAuto.enter(row,ManualAuto.revision);const p=Bots.ledgers.manual.open[0];
  assert(p&&p.sl>p.entry&&p.tp<p.entry,'Sell exits inverted');
  assert(Math.abs(p.sl-2503.46)<0.011&&Math.abs(p.tp-2466.09)<0.011,'Percentage units wrong');
});
test('The same signal cannot repeat after closing, saving and losing session memory',async()=>{
  const row=autoFixture();await ManualAuto.enter(row,ManualAuto.revision);
  const L=Bots.ledgers.manual,p=L.open[0];BotEngine.close(L,Bots.manualCfg(),p,2491,'Fixture close');BotEngine.save('manual',L);
  ManualAuto.seen.clear();await ManualAuto.enter(row,ManualAuto.revision);
  assert(!Bots.ledgers.manual.open.length,'Repeated a completed signal');
});
test('Stop while a broker quote loads prevents the delayed entry',async()=>{
  const row=autoFixture(),load=Feed.loadSpecs;let finish,started;
  const ready=new Promise(r=>started=r);Feed.loadSpecs=()=>{started();return new Promise(r=>finish=r);};
  try{const pending=ManualAuto.enter(row,ManualAuto.revision);await ready;ManualAuto.stop();finish();await pending;
    assert(!Bots.ledgers.manual.open.length,'Entered after Stop');}finally{Feed.loadSpecs=load;}
});
test('A second window holding the session lock blocks Start without changing any ledger',async()=>{
  let release,held;const ready=new Promise(r=>held=r);
  const lock=navigator.locks.request('astra-manual-auto-session',async()=>{held();await new Promise(r=>release=r);});await ready;
  try{assert(await ManualAuto.start()===false&&!ManualAuto.running,'Competing session started');}finally{release();await lock;}
});
test('Start obtains a session lock, freezes the selected pair and Stop releases it',async()=>{
  const scan=ConfluenceScanner.scan;ConfluenceScanner.scan=async()=>[];
  try{assert(await ManualAuto.start(),'Did not start');document.getElementById('mbSym').dataset.val='XAUUSD.m';
    assert(ManualAuto.config.sym==='ETHUSD.m','Session retargeted');ManualAuto.stop();
    await navigator.locks.request('astra-manual-auto-session',{signal:AbortSignal.timeout(1000)},lock=>assert(lock,'Lock not released'));
  }finally{ConfluenceScanner.scan=scan;ManualAuto.stop();}
});
test('Pause, count, correlation, daily loss and blocked instruments all guard automatic entry',async()=>{
  for(const kind of ['pause','count','correlated','daily','pair']){
    reset();const row=autoFixture();
    if(kind==='pause')Bots.cfgs.manual.paused=true;
    if(kind==='count')Bots.cfgs.manual.maxOpen=0;
    if(kind==='correlated')Bots.cfgs.manual.maxCorrelated=0;
    if(kind==='daily')Bots.ledgers.manual.daily[BotEngine.dayKey()]={pnl:-200,fees:0};
    if(kind==='pair')PairRules.setManual('ETHUSD.m','block');
    await ManualAuto.enter(row,ManualAuto.revision);
    assert(!Bots.ledgers.manual.open.length,kind+' bypassed');
    if(kind==='daily'){ManualOrders.syncLedger();assert(Bots.ledgers.manual.lockedUntil>Date.now(),'Daily lock not saved');}
  }
});
test('Risk changes during quote loading apply at execution',async()=>{
  const row=autoFixture(),load=Feed.loadSpecs;
  Feed.loadSpecs=async()=>lsSet('astra_botcfg_manual',{paused:true});
  try{await ManualAuto.enter(row,ManualAuto.revision);assert(!Bots.ledgers.manual.open.length,'Used old manual rules');}finally{Feed.loadSpecs=load;}
});
test('Stale quotes, expired signals, disconnected sources and missing specs never enter',async()=>{
  for(const kind of ['stale','expired','source','spec']){
    reset();const row=autoFixture(),allowed=MarketSources.allowed;
    if(kind==='stale')Feed.quoteTime[row.sym]=Date.now()/1000-181;
    if(kind==='expired')row.signal.entryBar-=91;
    if(kind==='source')MarketSources.allowed=()=>false;
    if(kind==='spec')delete Feed.specs[row.sym];
    try{await ManualAuto.enter(row,ManualAuto.revision);assert(!Bots.ledgers.manual.open.length,kind+' entered');}finally{MarketSources.allowed=allowed;}
  }
});
test('A broker minimum larger than the per-entry budget stays blocked without raising it',async()=>{
  const row=autoFixture({allocation:0.01});await ManualAuto.enter(row,ManualAuto.revision);
  assert(!Bots.ledgers.manual.open.length,'Raised budget to force minimum');
});
test('Entry-count stop and save failure stop further entries while retaining a paper fill',async()=>{
  let row=autoFixture({entries:1});await ManualAuto.enter(row,ManualAuto.revision);
  assert(!ManualAuto.running&&Bots.ledgers.manual.open.length===1,'Count failed');
  reset();row=autoFixture();fixtureSaveFails=true;await ManualAuto.enter(row,ManualAuto.revision);
  assert(!ManualAuto.running&&Bots.ledgers.manual.open.length===1&&BotEngine.unsaved.has(Bots.ledgers.manual),'Lost unsaved fill or continued');fixtureSaveFails=false;
});
test('Later signals can add positions but cannot reuse already committed equity',async()=>{
  const row=autoFixture({allocation:5});row.signal.entryBar-=30;
  Bots.cfgs.manual={maxPerSymbol:10,maxCorrelated:10,risk:{maxNotionalPct:8}};
  await ManualAuto.enter(row,ManualAuto.revision);row.signal={...row.signal,entryBar:row.signal.entryBar+1};
  await ManualAuto.enter(row,ManualAuto.revision);
  const L=Bots.ledgers.manual;
  assert(L.open.length===2,'Did not allow later signals: '+ManualAuto.events[0]?.text);
  assert(L.open.reduce((n,p)=>n+p.qty*p.entry,0)<=800,'Reused committed equity');
  row.signal={...row.signal,entryBar:row.signal.entryBar+1};await ManualAuto.enter(row,ManualAuto.revision);
  assert(Bots.ledgers.manual.open.length===2,'Forced a minimum lot beyond the remaining budget');
});
test('Invalid allocation and counts cannot start an automatic session',async()=>{
  for(const patch of [{allocation:0},{allocation:101},{allocation:NaN},{entries:-1},{entries:1.5},{exits:'percent',sl:0,tp:1}]){
    assert(ManualAuto.valid({scope:'all',direction:'both',exits:'signal',allocation:5,entries:0,...patch}),'Accepted invalid rule '+JSON.stringify(patch));
  }
});
test('Scanner mode obeys selected pair and direction and does not start the separate Confluence bot',async()=>{
  const row=autoFixture({scope:'pair',direction:'sell'}),scan=ConfluenceScanner.scan,run=ConfluenceBot.run;
  ConfluenceScanner.scan=async()=>[row];ConfluenceBot.run=()=>{throw Error('Wrong account runner');};
  try{await ManualAuto.pulse();assert(!Bots.ledgers.manual.open.length,'Ignored direction');
    ManualAuto.config={...ManualAuto.config,direction:'both',sym:'XAUUSD.m'};await ManualAuto.pulse();assert(!Bots.ledgers.manual.open.length,'Ignored pair');
  }finally{ConfluenceScanner.scan=scan;ConfluenceBot.run=run;}
});
const autoRun=document.getElementById('run').onclick;
test('Signal catalogue includes strategy and scanner sources but excludes account pages',()=>{
  const ids=ManualAuto.sources().map(b=>b.id);
  assert(ids.includes('candle')&&ids.includes('scanner')&&ids.includes('confluence'),'Missing sources');
  assert(!ids.includes('manual')&&!ids.includes('liveManual')&&!ids.includes('dash'),'Account page became a source');
});
test('A selected source scans completed bars at its timeframe with higher confirmation and no other ledger writes',async()=>{
  autoFixture();const klines=API.klines,b=BOT_BY_ID.maMacd,signal=b.signal,requests=[];
  const original=JSON.stringify(Bots.ledgers.manual);
  API.klines=async(sym,tf)=>{requests.push(tf);return Array.from({length:350},(_,i)=>({rawTime:Date.now()/1000-(349-i)*300,open:2491,close:2491,high:2492,low:2490,volume:100}));};
  b.signal=(bars,cfg,L,higher)=>{assert(cfg.tf==='5m'&&higher.length===350,'Source settings lost');L.open.push({fake:true});return {dir:1,score:100,entry:2491,sl:2471,tp:2531,atr:10};};
  try{const rows=await ManualAuto.scan({source:b.id,scope:'all'},ManualAuto.revision);
    assert(rows[0].signal.meta.manualAutoSource===b.id&&requests.includes('5m')&&requests.includes('15m'),'Wrong adapter');
    assert(JSON.stringify(Bots.ledgers.manual)===original,'Signal mutated ledger');
    await ManualAuto.enter(rows[0],ManualAuto.revision);assert(Bots.ledgers.manual.open[0]?.tf==='5m','Entry lost timeframe');
  }finally{API.klines=klines;b.signal=signal;}
});
test('Sources deduplicate independently and retain their session guard after a reload',()=>{
  const row=autoFixture(),s={...row.signal,meta:{manualAutoSource:'jdub',manualAutoSession:'session1'}};
  const L=Bots.ledgers.manual;L.closed.push({sym:s.sym,meta:{manualAutoSource:'jdub',manualAutoSession:'session1',manualAutoBar:s.entryBar-60}});
  assert(ManualAuto.repeat(L,s),'Session repeated');
  assert(!ManualAuto.repeat(L,{...s,meta:{manualAutoSource:'candle'}}),'Unrelated source suppressed');
});
test('Signal-source failures remain visible and never become an entry',async()=>{
  autoFixture();const klines=API.klines;API.klines=async()=>{throw Error('Fixture broker unavailable');};
  try{const rows=await ManualAuto.scan({source:'candle',scope:'all'},ManualAuto.revision);assert(rows[0].status==='ERROR'&&rows[0].why.includes('Fixture broker unavailable')&&!rows[0].signal,'Failure swallowed');}
  finally{API.klines=klines;}
});
document.getElementById('run').onclick=async()=>{try{await autoRun();}finally{ManualAuto.stop();OpenTrades.stop();}};
