// Actual live ticket + arming code, memory-only state and a fake fetch broker. No network orders.
function liveTest(name,fn){test(name,async()=>{
  const saved={fetch:window.fetch,quotes:Feed.quotes,blocked:PairRules.blocked,confirm:window.confirm};
  const sent=[];let behavior='ok';
  const health={ok:true,trading:true,manualTickets:1,manualTicketSizing:2,margin_free:900,account:101,server:'Disposable broker',balance:1000,equity:1000,currency:'USD',magic:20260902};
  window.fetch=async(url,options={})=>{
    const path=new URL(url).pathname;
    if(options.method==='POST'){
      sent.push({path,body:JSON.parse(options.body)});
      if(behavior==='timeout')throw Error('Simulated timeout');
      return new Response(JSON.stringify({ok:true,ticket:55,volume:.02,price:101}));
    }
    if(path==='/health')return new Response(JSON.stringify(health));
    if(path==='/positions')return new Response(JSON.stringify({positions:[]}));
    if(path==='/manual-preview')return new Response(JSON.stringify({ok:true,previewId:'disposable-token',account:101,server:health.server,entry:101,lots:.02,sl:99,tp:104,risk:.4,margin:2,notional:20.2,reward:.6,currency:'USD'}));
    throw Error('Unexpected request '+path);
  };
  Feed.bridge={symbols:new Set(['ETHUSD.m']),account:101};Feed.quotes=async(syms)=>{
    for(const s of syms){Feed.srcOf[s]='bridge';Feed.quoteTime[s]=Date.now()/1000;STORE.tickers.set(s,{bid:100,ask:101,last:100});}return [];
  };PairRules.blocked=()=>false;
  Live.state=null;Live.book=null;const S=Live.load();S.linked=true;S.code='123456';S.startBalance=1000;S.caps={...Live.DEFAULT_CAPS,instruments:['ETHUSD.m']};Live.save();Live.bridge={...health,checked:Date.now()};
  Object.assign(LiveManual,{draft:{sym:'ETHUSD.m',side:'buy',lots:'',sl:'99',tp:'104',maxNotionalPct:100,maxCorrelated:2},busy:false,loading:false,uncertain:false,unlocked:false,preview:null,health:null,positions:[],revision:0});
  await Feed.quotes(['ETHUSD.m']);
  const arm=()=>{assert(Live.arm('liveManual',Live.load().caps,'LIVE trading bot').ok,'Could not arm disposable manual');assert(Live.goLive('liveManual','TRADE REAL MONEY').ok,'Could not enable disposable live');LiveManual.unlocked=true;};
  const mount=async()=>{Bots.active='liveManual';Bots.render();await LiveManual.refresh();await new Promise(r=>setTimeout(r,0));};
  try{await fn({sent,health,arm,mount,behavior:v=>behavior=v});}
  finally{window.fetch=saved.fetch;window.confirm=saved.confirm;Feed.quotes=saved.quotes;PairRules.blocked=saved.blocked;clearInterval(LiveManual.timer);LiveManual.timer=null;LiveManual.unlocked=false;}
});}
liveTest('Live clone mounts separately without touching the paper ledger',async({mount,sent})=>{const paper=JSON.stringify(Bots.ledgers.manual);await mount();assert(document.querySelector('#lmDesk'),'Live ticket missing');assert(!document.querySelector('[data-act="mopen"]')&&document.querySelector('#mbGo').dataset.lmAct==='preview','Paper submit handler leaked into live');assert(document.querySelector('#lmSend').disabled,'New ticket unlocked');assert(Bots.isPage(BOT_BY_ID.liveManual)&&!Bots.tradingBots().some(b=>b.id==='liveManual'),'Live manual could be scanned');assert(JSON.stringify(Bots.ledgers.manual)===paper&&!sent.length,'Opening page changed trades');});
liveTest('Manual live requires correct named arming and exact live phrase',async()=>{assert(!Live.arm('liveManual',Live.load().caps,'wrong').ok,'Wrong name armed');assert(Live.arm('liveManual',Live.load().caps,'LIVE trading bot').ok,'Named arm failed');assert(Live.load().armed.liveManual.mode==='shadow','Arm went directly live');assert(!Live.goLive('liveManual','yes').ok,'Wrong phrase enabled real trading');Live.bridge.trading=false;assert(!Live.goLive('liveManual','TRADE REAL MONEY').ok,'Read-only bridge enabled live');});
liveTest('Persisted live mode never unlocks a new page session',async({arm,mount})=>{arm();LiveManual.unlocked=false;await mount();assert(LiveManual.stateGate().includes('LOCKED'),'Persisted state unlocked ticket');});
liveTest('Read-only review calculates real-account preview without an order',async({mount,sent})=>{await mount();await LiveManual.calculate();assert(LiveManual.preview?.lots===.02,'Broker preview absent');assert(document.querySelector('#lmPreview').textContent.includes('0.40'),'Stop cash missing');assert(!sent.length&&document.querySelector('#lmSend').disabled,'Preview sent or unlocked');});
liveTest('Editing ticket invalidates review and preserves fields across workspace ticks',async({mount})=>{await mount();await LiveManual.calculate();const el=document.querySelector('[data-lm="sl"]');el.value='98';el.dispatchEvent(new Event('input'));Bots.render();assert(!LiveManual.preview&&document.querySelector('[data-lm="sl"]')===el&&el.value==='98','Tick replaced form or kept stale review');});
liveTest('Unapproved pair may be previewed but cannot send; stale quotes block review',async({mount,arm,sent})=>{await mount();arm();const S=Live.load();S.caps.instruments=[];Live.save();await LiveManual.calculate();assert(LiveManual.preview&&!sent.length,'Read-only preview unavailable');await LiveManual.send();assert(!sent.length,'Unapproved pair sent');Feed.quotes=async()=>{Feed.quoteTime['ETHUSD.m']=1;};await LiveManual.calculate();assert(!LiveManual.preview&&!sent.length,'Stale quote reviewed');});
liveTest('Double click sends one reviewed token only to the manual endpoint',async({mount,arm,sent})=>{await mount();arm();await LiveManual.calculate();await Promise.all([LiveManual.send(),LiveManual.send()]);assert(sent.length===1&&sent[0].path==='/manual-order'&&sent[0].body.previewId==='disposable-token','Duplicate or wrong endpoint');assert(!LiveManual.preview,'Submitted token left reusable');});
liveTest('Ambiguous submission locks ticket and cannot automatically retry',async({mount,arm,sent,behavior})=>{await mount();arm();await LiveManual.calculate();behavior('timeout');await LiveManual.send();await LiveManual.send();assert(sent.length===1&&LiveManual.uncertain&&!LiveManual.unlocked,'Uncertain submission retried');});
liveTest('Expired review cannot submit',async({mount,arm,sent})=>{await mount();arm();await LiveManual.calculate();LiveManual.preview.receivedAt-=26000;await LiveManual.send();assert(!sent.length,'Expired preview sent');});
liveTest('Account switch between review and submit blocks the order',async({mount,arm,sent,health})=>{await mount();arm();await LiveManual.calculate();health.account=202;await LiveManual.send();assert(!sent.length&&!LiveManual.unlocked,'Wrong account received order');});
liveTest('Unsaved live-limit edits cannot silently use older limits',async({mount,sent})=>{await mount();const e=document.querySelector('[data-lm="riskPct"]');e.value='3';e.dispatchEvent(new Event('input'));await LiveManual.calculate();assert(!LiveManual.preview&&LiveManual.message.includes('Save your changed'),'Unsaved risk silently ignored');assert(!sent.length,'Unsaved rules submitted');});
liveTest('A limit tightened in another window invalidates an older reviewed order',async({mount,arm,sent})=>{await mount();arm();await LiveManual.calculate();const S=Live.load();S.caps.maxLots=.01;Live.save();await LiveManual.send();assert(!sent.length,'Older limits bypassed tighter settings');});
liveTest('Uncertain submission stays visible after remounting the ticket',async({mount,arm,behavior})=>{await mount();arm();await LiveManual.calculate();behavior('timeout');await LiveManual.send();LiveManual.uncertain=false;document.getElementById('botBody').dataset.bot='';Bots.render();assert(LiveManual.uncertain&&document.querySelector('#lmSend').disabled,'Uncertain outcome forgotten');});
liveTest('Live position cards show broker levels and cannot close another bot’s trade',async({mount,sent})=>{await mount();LiveManual.positions=[{ticket:22,symbol:'ETHUSD.m',type:'buy',volume:.02,price_open:101,price_current:102,profit:.02,sl:99,tp:104,magic:20260902,comment:'ASTRA other'}];LiveManual.renderPositions();assert(document.querySelector('#lmPositions').textContent.includes('99.00'),'Broker stop missing');assert(!document.querySelector('[data-lm-close]'),'Other bot got close button');window.confirm=()=>true;await LiveManual.close(22);assert(!sent.length,'Other bot closed through direct action');});
liveTest('Live price labels preserve broker precision for forex stops',async()=>{assert(LiveManual.price(1.15892,5).includes('15892'),'Forex stop rounded to two decimals');assert(LiveManual.price(2441.25,2).endsWith('25'),'Metal/crypto decimals lost');});
liveTest('Shared live slider uses real USD equity and never opens a paper trade',async({mount,sent})=>{
  await mount();const paper=JSON.stringify(Bots.ledgers.manual);
  document.querySelector('[data-mbfund="25"]').click();
  assert(+document.querySelector('#mbAmt').value===250,'Used paper equity');
  const p=LiveManual.parameters();assert(+p.amount===250&&p.amountMode==='value','Dollar ceiling missing');
  assert(!sent.length&&JSON.stringify(Bots.ledgers.manual)===paper,'Slider traded');
  assert(document.querySelector('#mbFunds').textContent.includes('USD'),'Currency missing');
});
liveTest('Shared percentage controls use executable buy and sell prices and invalidate preview',async({mount})=>{
  await mount();await LiveManual.calculate();document.querySelector('[data-mbpct="sl:0.5"]').click();
  assert(!LiveManual.preview&&+LiveManual.draft.sl===100.495,'Buy stop wrong');
  document.querySelector('[data-mbside="-1"]').click();document.querySelector('[data-mbpct="tp:0.5"]').click();
  assert(+LiveManual.draft.tp===99.5&&LiveManual.draft.side==='sell','Sell target wrong');
});
liveTest('Older bridge cannot silently ignore the shared amount ceiling',async({mount,health,sent})=>{
  await mount();health.manualTicketSizing=undefined;document.querySelector('[data-mbfund="10"]').click();
  await LiveManual.calculate();assert(!LiveManual.preview&&!sent.length&&LiveManual.message.includes('Restart'),'Old bridge ignored amount');
});
liveTest('Live automation retains strategy qualification and stays independent from paper automation',async({mount,arm,sent})=>{
  await mount();arm();const a=LiveManual.automation();a.draft.source='candle';
  assert(await a.start()===false&&!a.running&&!sent.length,'Unqualified strategy started');
  assert(a.draft!==ManualAuto.draft&&a.seen!==ManualAuto.seen,'Paper and real automation share mutable state');
});
liveTest('Stopping live automation invalidates a reviewed request before it can send',async({mount,arm,sent})=>{
  await mount();arm();await LiveManual.calculate();LiveManual.automation().stop('Test stop');await LiveManual.send();
  assert(!sent.length&&!LiveManual.preview,'Stop left a live request available');
});
liveTest('Qualified live signal uses the guarded manual endpoint once and retains its identity',async({mount,arm,sent})=>{
  await mount();arm();const a=LiveManual.automation(),ready=Live.readiness;
  Feed.bridgeClock={offset:0};Live.readiness=()=>({ok:true});
  a.config={source:'candle',scope:'pair',direction:'both',allocation:5,entries:1,exits:'signal'};a.running=true;a.count=0;a.seen.clear();
  const row={sym:'ETHUSD.m',signal:{sym:'ETHUSD.m',dir:1,entry:100,sl:99,tp:104,atr:10,entryBar:Date.now()/1000,meta:{manualAutoSource:'candle'}}};
  try{await a.enter(row,a.revision);assert(sent.length===1&&sent[0].path==='/manual-order','Wrong real transport: '+LiveManual.message);
    assert(a.count===1&&!a.running,'Count did not stop real session');
    a.seen.clear();a.running=true;await a.enter(row,a.revision);assert(sent.length===1,'Saved signal repeated');
  }finally{a.stop();Live.readiness=ready;}
});
