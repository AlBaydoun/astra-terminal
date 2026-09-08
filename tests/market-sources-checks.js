window.addEventListener = savedAddEventListener;
const checks=[];
const assert=(ok,why)=>{if(!ok) throw Error(why);};
const test=(name,run)=>checks.push({name,run});
MarketSources.init(); MarketSources.ready=false;
const network = window.fetch;
function tick(sym,source='bridge',price=100){
  Feed.srcOf[sym]=source; Feed.quoteTime[sym]=Date.now()/1000;
  STORE.tickers.set(sym,{last:price,pct:1,spread:0.01});
  return {price,spread:0.01,ageSec:0,source};
}
function setup(){
  sourceMemory.clear(); Sock.stopAll(); wireSockets.length=0;
  MarketSources.state={binance:false}; MarketSources.revision++; MarketSources.ready=false;
  Feed.bridge={server:'JustMarkets-Live',symbols:new Set(['ETHUSD.s','EURUSD.s'])}; Feed.buildAliases();
  Feed.srcOf={}; Feed.quoteTime={}; Feed.specs={};
  Feed.specs['ETHUSD.m']={contractSize:1,volumeMin:0.01,volumeMax:100,volumeStep:0.01,tickValue:0.01,tickSize:0.01};
  STORE.universe=['BTCUSDT','ETHUSDT']; STORE.tickers.clear();
  tick('ETHUSD.m'); tick('ETHUSDT','binance'); tick('BTCUSDT','binance');
  Watch.list=['ETHUSDT','ETHUSD.m','AAPL','XAUUSD.m']; MK.monitored=[];
  PairRules.state=null; PairRules._cache=null; Feed.liveOnly=true;
  Bots.ledgers={manual:BotEngine.blank('manual')}; Bots.cfgs={manual:{}};
  window.fetch=network; MarketSources.render();
}
test('Missing, malformed and non-boolean settings default to Binance OFF',()=>{
  for(const value of [null,'broken','{"binance":"true"}','{"binance":1}','{}']){
    if(value===null) sourceMemory.delete(MarketSources.KEY); else sourceMemory.set(MarketSources.KEY,value);
    assert(!MarketSources.read().binance,'Unsafe default: '+value);
  }
});
test('Only this JustMarkets account supplies broker instruments, with suffix aliases deduplicated',()=>{
  assert(JSON.stringify(MarketSources.brokerList())===JSON.stringify(['ETHUSD.m','EURUSD.m']),'Wrong broker catalogue');
  for(const s of ['ETHUSDT','BTCUSDT','AAPL','EURUSD=X','XAUUSD.m']) assert(!MarketSources.allowed(s),'Visible unsupported '+s);
  assert(Feed.route('ETHUSD.m').kind==='bridge' && Feed.route('ETHUSD.m').addr==='ETHUSD.s','Wrong broker route');
  Feed.bridge.server='DifferentBroker'; assert(!MarketSources.allowed('ETHUSD.m'),'Wrong broker accepted');
});
test('Disconnected broker CFDs never fall back to Binance, even with Binance enabled',()=>{
  MarketSources.state.binance=true; Feed.bridge=null;
  assert(Feed.route('ETHUSD.m').kind==='disabled','Broker CFD became exchange spot');
  assert(Feed.route('ETHUSDT').kind==='binance','Explicit exchange choice unavailable');
});
test('OFF performs no Binance startup, candle or websocket request',async()=>{
  let requests=0; window.fetch=async()=>{requests++; throw Error('Network reached');};
  await bootMarketData(); startGlobalStream(); new Sock(['x'],()=>{},'test');
  try {await API.binanceKlines('BTCUSDT','1h',10);} catch(e){assert(/disabled/.test(e.message),'Wrong refusal');}
  assert(requests===0 && wireSockets.length===0 && STORE.universe.length===0,'Disabled connection started');
});
test('Turning OFF closes every stream and ignores a late websocket callback',async()=>{
  MarketSources.state.binance=true; let messages=0;
  new Sock(['one'],()=>messages++,'one'); new Sock(['two'],()=>messages++,'two');
  const callback=wireSockets[0].onmessage;
  await MarketSources.setBinance(false); callback({data:'{"data":{"price":100}}'});
  assert(wireSockets.length===2 && wireSockets.every(s=>s.closed) && messages===0,'Stream survived OFF');
  assert(Sock.instances.size===0 && !Feed.srcOf.ETHUSDT && !STORE.tickers.has('ETHUSDT'),'Disabled quote remained executable');
});
test('An in-flight Binance response cannot repopulate markets after OFF',async()=>{
  MarketSources.state.binance=true; let finish;
  window.fetch=()=>new Promise(resolve=>{finish=resolve;});
  const request=bootMarketData().then(()=>null,e=>e);
  await MarketSources.setBinance(false);
  finish({ok:true,json:async()=>[{symbol:'BTCUSDT',quoteVolume:'100',lastPrice:'100'}]});
  assert(await request instanceof Error,'Old response accepted');
  assert(STORE.universe.length===0 && !STORE.tickers.has('BTCUSDT'),'Old data republished');
});
test('Turning OFF during either kind of bot scan cancels it quietly',async()=>{
  const allowed=Bots.allowed, klines=API.klines, report=console.error;
  try {
    for(const rankAll of [false,true]){
      MarketSources.state.binance=true; let requests=0, errors=0;
      const bot={id:'cancel',name:'Cancel check',rankAll,warmup:1,signal(){throw Error('Disabled strategy ran');}};
      Bots.cfgs.cancel={tf:'15m',maxOpen:1}; Bots.ledgers.cancel=BotEngine.blank('cancel');
      Bots.allowed=()=>['BTCUSDT','ETHUSDT']; console.error=()=>errors++;
      API.klines=async()=>{requests++; MarketSources.state.binance=false; throw Error('Binance request cancelled');};
      await Bots.runBot(bot,false);
      assert(requests===1 && errors===0 && !Bots.ledgers.cancel.decisions.some(d=>d.kind==='error'),'Scan kept going after OFF');
    }
  } finally {Bots.allowed=allowed;API.klines=klines;console.error=report;}
});
test('The final entry gate refuses disabled cached prices and preserves broker sizing',()=>{
  const sig={sym:'ETHUSDT',dir:1,entry:100,sl:99,tp:102,tf:'1h'};
  const L=BotEngine.blank('test');
  assert(!BotEngine.check(L,{},sig,tick(sig.sym,'binance')).ok,'Disabled cached quote opened');
  sig.sym='ETHUSD.m'; const q=tick(sig.sym);
  assert(BotEngine.check(L,{},sig,q).ok,'Valid JustMarkets order refused');
  assert(!BotEngine.check(L,{},sig,{...q,source:'binance'}).ok,'CFD accepted exchange provenance');
});
test('A disabled source pauses exits without deleting the saved position or levels',()=>{
  MarketSources.state.binance=true; const L=BotEngine.blank('test');
  const q=tick('BTCUSDT','binance'), sig={sym:'BTCUSDT',dir:1,entry:100,sl:99,tp:102,tf:'1h'};
  const p=BotEngine.open(L,{},sig,q,BotEngine.check(L,{},sig,q)); assert(p,'Fixture failed to open');
  MarketSources.state.binance=false;
  BotEngine.step(L,{},p,null,{price:95}); BotEngine.close(L,{},p,95,'test');
  assert(!BotEngine.partialFill(L,{},p,0.5,95).ok,'Partial exit bypassed OFF');
  assert(L.open[0]===p && p.sl===99 && p.tp===102 && !L.closed.length,'Position changed while OFF');
});
test('Waiting exchange orders stay saved and cannot execute while disabled',()=>{
  ManualOrders.save([{id:'test',sym:'ETHUSDT',dir:1,type:'limit',entry:101,sl:99,tp:103,qty:0.1,tf:'1h',note:'kept',createdAt:Date.now(),status:'waiting'}]);
  ManualOrders.process();
  assert(ManualOrders.read()[0].status==='waiting' && !Bots.ledgers.manual.open.length,'Waiting instruction executed');
});
test('Search, watchlist, market browser, screener and bot scans hide disabled pairs',()=>{
  const spark=Watch.spark; Watch.spark=()=>{}; Watch.el=document.getElementById('watchBody');
  try {Watch.render();} finally {Watch.spark=spark;}
  SymbolSearch.render(''); MarketBrowser.renderTabs(); MarketBrowser.render(); Screener.rebuild();
  for(const id of ['watchBody','symList','mktList','scrTable']){
    const text=document.getElementById(id).textContent;
    assert(!/USDT|AAPL|XAUUSD/.test(text),id+' leaked unavailable market');
    assert(text.includes('ETH'),'Missing JustMarkets ETH in '+id);
  }
  assert(Bots.universe().every(s=>MarketSources.allowed(s)),'Bot universe bypassed switch');
  assert(Object.values(MarketFit.GROUPS).flatMap(g=>g.syms).every(s=>MarketSources.allowed(s)),'Study picker bypassed switch');
});
test('Settings button saves only its approved key, survives reload and respects failed saves',async()=>{
  sourceMemory.set('astra_bot_manual','history sentinel');
  const all24h=API.all24h; API.all24h=async()=>[];
  try {
    await MarketSources.setBinance(true);
    assert(MarketSources.read().binance && document.getElementById('binanceToggle').textContent==='Disable Binance','Enabled setting missing');
    MarketSources.state=MarketSources.read(); await MarketSources.setBinance(false);
    assert(!MarketSources.read().binance,'OFF not saved');
    const set=localStorage.setItem; localStorage.setItem=()=>{throw Error('Full');};
    const report=console.error; let reported=false; console.error=message=>{reported=/could not save/.test(message);};
    try {assert(!await MarketSources.setBinance(true) && !MarketSources.binanceOn() && reported,'Failed save changed state or hid its error');}
    finally {localStorage.setItem=set; console.error=report;}
    assert(sourceMemory.get('astra_bot_manual')==='history sentinel','History was rewritten');
    assert([...sourceMemory.keys()].every(k=>['astra_bot_manual',MarketSources.KEY].includes(k)),'Unexpected key');
  } finally {API.all24h=all24h;}
});
test('A monitored broker symbol can be removed without erasing hidden watchlist choices',()=>{
  const spark=Watch.spark; Watch.spark=()=>{}; Watch.el=document.getElementById('watchBody');
  Watch.list=['BTCUSDT']; MK.monitored=['ETHUSD.m'];
  try {
    Watch.render(); assert(document.getElementById('watchBody').textContent.includes('ETH'),'Monitored broker symbol missing');
    Watch.remove('ETHUSD.m');
    assert(!document.getElementById('watchBody').textContent.includes('ETH') && Watch.list.includes('BTCUSDT'),'Removal failed or hidden choice deleted');
  } finally {Watch.spark=spark;}
});
test('A change from another window disables this window and cloud sync excludes the switch',async()=>{
  MarketSources.state.binance=true; new Sock(['x'],()=>{},'test');
  localStorage.setItem(MarketSources.KEY,'{"binance":false}');
  window.dispatchEvent(new StorageEvent('storage',{key:MarketSources.KEY,newValue:'{"binance":false}'}));
  await Promise.resolve();
  assert(!MarketSources.binanceOn() && wireSockets.every(s=>s.closed),'Other window ignored');
  assert(!(MarketSources.KEY in Sync.collect()),'Cloud could re-enable Binance');
});
document.getElementById('run').onclick=async()=>{
  const out=document.getElementById('results'),lines=[];let failed=0;
  for(const t of checks){
    try {setup();await t.run();lines.push('PASS  '+t.name);}
    catch(e){failed++;lines.push('FAIL  '+t.name+'\n'+e.message);console.error(t.name,e);}
  }
  Sock.stopAll(); window.fetch=network;
  out.textContent=lines.join('\n')+'\n\n'+(checks.length-failed)+'/'+checks.length+' passed.';
};
