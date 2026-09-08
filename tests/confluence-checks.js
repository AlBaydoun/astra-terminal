document.getElementById('run').addEventListener('click',async()=>{
  const output=document.getElementById('results'),button=document.getElementById('run');button.disabled=true;output.textContent='Loading captured candles…';
  const realNow=Date.now, realKlines=API.klines, realQuotes=Feed.quotes, realSpecs=Feed.loadSpecs;
  let count=0, failed=0;const log=[];
  const assert=(ok,why)=>{if(!ok)throw Error(why);};
  const test=async(name,fn)=>{try{await fn();count++;log.push('PASS '+name);}catch(e){failed++;log.push('FAIL '+name+': '+e.message);console.error(e);}output.textContent=log.join('\n');};
  try{
    const response=await fetch('../research/intraday-data.json');if(!response.ok)throw Error('Snapshot unavailable');const data=await response.json();
    const market=data.markets.find(m=>m.symbol==='XAUUSD.s');
    const bars=market.candles.slice(0,-1).map(b=>({rawTime:b[0],time:b[0],open:b[1],high:b[2],low:b[3],close:b[4],volume:b[5]}));
    const examples=[];
    for(let i=Confluence.warmup;i<bars.length && (!examples.some(x=>x.s.dir===1)||!examples.some(x=>x.s.dir===-1));i++){
      const s=Confluence.inspect(bars,i);if(s.dir&&!examples.some(x=>x.s.dir===s.dir)) examples.push({s,i,w:bars.slice(i-Confluence.warmup,i+1)});
    }
    assert(examples.length===2,'Expected real buy and sell examples');
    const example=examples[0], sym=market.symbol;
    const setup=()=>{
      ConfluenceScanner.cache.clear();ConfluenceScanner.rows=[];ConfluenceScanner.pending=null;
      MarketSources.brokerList=()=>[sym];MarketSources.allowed=()=>true;
      fixtureStorage=new Map();fixtureSaveFails=false;Bots.cfgs.confluence={...Confluence.defaults,paused:false,
        confluenceLimits:{...ConfluenceBot.defaultLimits(),maxOpen:1,maxPerSymbol:1,maxCorrelated:1,entriesPerDay:1,perTradeNotionalPct:100}};Bots.ledgers.confluence=BotEngine.blank('confluence');
      Feed.bridge={server:'JustMarkets-Live',symbols:new Set([sym])};Feed.bridgeClock={offset:7200};Feed.specs[sym]=market.spec;
      Date.now=()=>example.s.entryBar*1000-7200000+30000;
      API.klines=async()=>example.w;
      Feed.loadSpecs=async()=>Feed.specs;
      Feed.quotes=async()=>{
        STORE.tickers.set(sym,{last:example.s.entry,spread:example.s.entry*0.0001});
        Feed.srcOf[sym]='bridge';Feed.quoteTime[sym]=Date.now()/1000;return [];
      };
      PairRules.blocked=()=>false;MarketSources.executable=(s,src)=>src==='bridge';ConfluenceBot.revision++;ConfluenceBot.busy=false;ConfluenceBot.last=null;
    };
    await test('BUY and SELL use only 250 completed candles; future values cannot change either',()=>{
      for(const e of examples){
        const changed=e.w.map((b,i)=>i===e.w.length-1?{...b,close:b.close*2,high:b.high*3,low:b.low/3,volume:999999999}:b);
        assert(JSON.stringify(Confluence.inspect(changed))===JSON.stringify(e.s),'Forming candle leaked into signal');
        assert(e.s.checks.every(c=>c.ok)&&e.s.sl>0&&e.s.tp>0,'Invalid complete setup');
      }
    });
    await test('Missing activity, wrong timeframe, missing warmup and candle gaps refuse labels',()=>{
      const changed=example.w.map(b=>({...b}));changed[changed.length-2].volume=0;
      assert(!Confluence.inspect(changed).dir,'Zero activity allowed');
      assert(!Confluence.inspect(example.w,250,'1h').dir,'Wrong timeframe allowed');
      assert(!Confluence.inspect(example.w.slice(1)).dir,'Short warmup allowed');
      changed[250].rawTime+=900;assert(!Confluence.inspect(changed).dir,'Gap allowed');
    });
    await test('Actual overlay labels both directions on the closed candle, never the forming candle',()=>{
      Chart.settings.confluence.on=true;STORE.tf='15m';STORE.symbol=sym;
      for(const e of examples){ConfluenceOverlay.key='';const markers=ConfluenceOverlay.markers(e.w);
        assert(markers.length===1&&markers[0].time===e.w[249].time,'Wrong marker time');
        assert(markers[0].text==='ASTRA '+(e.s.dir>0?'BUY':'SELL'),'Wrong marker side');
      }
      Chart.settings.confluence.on=false;assert(!ConfluenceOverlay.markers(example.w).length,'Disabled overlay left markers');
    });
    await test('Entry expires after 90 seconds and refuses unverified clocks or chasing',()=>{
      setup();const q={price:example.s.entry};assert(!ConfluenceBot.entryReason(example.s,q),'Valid window refused');
      assert(ConfluenceBot.entryReason(example.s,q,Date.now()+61000).includes('expired'),'Old setup accepted');
      assert(ConfluenceBot.entryReason(example.s,{price:q.price+example.s.atr}).includes('chase'),'Chase accepted');
      Feed.bridgeClock.offset=null;assert(ConfluenceBot.entryReason(example.s,q).includes('clock'),'Unknown clock accepted');
    });
    await test('Shared bot dispatcher opens only a paper position with real lot/risk/notional ceilings',async()=>{
      setup();assert(await Bots.runBot(BOT_BY_ID.confluence),'No paper position: '+ConfluenceBot.last?.why);
      const p=Bots.ledgers.confluence.open[0];assert(p.riskCash<=50+1e-8,'Risk ceiling');assert(p.qty*p.entry<=10000+1e-8,'Notional ceiling');
      assert(p.lots>=market.spec.volumeMin&&p.lots<=market.spec.volumeMax,'Lot range');
      assert(Math.abs(p.lots/market.spec.volumeStep-Math.round(p.lots/market.spec.volumeStep))<1e-7,'Lot step');
      assert(p.timeLimitBars===12&&p.sl===example.s.sl&&p.tp===example.s.tp,'Saved levels/hold');
    });
    await test('Closing and reloading keeps levels and the once-per-day guard',async()=>{
      const L=BotEngine.load('confluence'),p=L.open[0];assert(p.sl===example.s.sl&&p.tp===example.s.tp,'Reload lost levels');
      BotEngine.close(L,ConfluenceBot.config(),p,p.entry,'test close');BotEngine.save('confluence',L);
      Bots.ledgers.confluence=BotEngine.load('confluence');assert(!await Bots.runBot(BOT_BY_ID.confluence),'Duplicate daily entry');
    });
    await test('Paused bot and Check setup only cannot create a position',async()=>{
      setup();Bots.cfgs.confluence.paused=true;assert(!await Bots.runBot(BOT_BY_ID.confluence),'Pause bypassed');
      Bots.cfgs.confluence.paused=false;assert(!await ConfluenceBot.run(BOT_BY_ID.confluence,true),'Check button entered');
      assert(!Bots.ledgers.confluence.open.length,'Unexpected entry');
    });
    await test('Pause during an outstanding candle request cancels that entry',async()=>{
      setup();let release;API.klines=()=>new Promise(r=>release=r);const pending=Bots.runBot(BOT_BY_ID.confluence);
      ConfluenceBot.setPaused(true);release(example.w);assert(!await pending,'In-flight pause bypassed');
    });
    await test('Prohibited instruments, disabled prices, stale prices and missing specs stay blocked',async()=>{
      for(const mode of ['blocked','disabled','stale','specs']){
        setup();if(mode==='blocked')PairRules.blocked=()=>true;
        if(mode==='disabled')MarketSources.executable=()=>false;
        if(mode==='specs'){Feed.specs={};Feed.loadSpecs=async()=>null;}
        if(mode==='stale'){const fresh=Feed.quotes;Feed.quotes=async()=>{await fresh();Feed.quoteTime[sym]-=181;return [];};}
        assert(!await Bots.runBot(BOT_BY_ID.confluence),mode+' guard bypassed');
      }
    });
    await test('Daily-loss and maximum-position guards remain enforced',async()=>{
      setup();const L=Bots.ledgers.confluence;L.daily[BotEngine.dayKey(Date.now())]={pnl:-201,fees:0};assert(!await Bots.runBot(BOT_BY_ID.confluence),'Daily loss bypassed');
      setup();assert(await Bots.runBot(BOT_BY_ID.confluence),'Fixture entry failed');
      Bots.ledgers.confluence.open[0].meta.brokerDay--;BotEngine.save('confluence',Bots.ledgers.confluence);
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Open limit bypassed');
    });
    await test('A failed save blocks further entries and leaves the pause setting unchanged',async()=>{
      setup();fixtureSaveFails=true;ConfluenceBot.setPaused(true);assert(!ConfluenceBot.config().paused,'Unsaved pause reported saved');
      await Bots.runBot(BOT_BY_ID.confluence);assert(BotEngine.unsaved.has(Bots.ledgers.confluence),'Failed ledger not flagged');
      const L=Bots.ledgers.confluence;L.open[0].meta.brokerDay--;assert(!await Bots.runBot(BOT_BY_ID.confluence),'Unsaved entry guard bypassed');
    });
    await test('Pause still permits stop protection using saved levels',async()=>{
      setup();await Bots.runBot(BOT_BY_ID.confluence);const L=Bots.ledgers.confluence,p=L.open[0];Bots.cfgs.confluence.paused=true;
      STORE.tickers.get(sym).last=p.sl-p.dir;await ConfluenceBot.manage();
      const saved=BotEngine.load('confluence');assert(!saved.open.length&&saved.closed[0].reason==='stop-loss','Pause stopped protection');
    });
    await test('A second tab re-reads saved entries and cannot duplicate the account',async()=>{
      setup();assert(await Bots.runBot(BOT_BY_ID.confluence),'First tab entry failed');
      Bots.ledgers.confluence=BotEngine.blank('confluence');
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Stale second tab duplicated entry');
      assert(Bots.ledgers.confluence.open.length===1,'Saved entry not restored');
    });
    await test('Another tab sees a saved pause despite an older running configuration',async()=>{
      setup();lsSet('astra_botcfg_confluence',{paused:true});
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Cross-tab pause ignored');
    });
    await test('New bot display includes both fees without rewriting a saved trade',async()=>{
      setup();await Bots.runBot(BOT_BY_ID.confluence);const L=Bots.ledgers.confluence,p=L.open[0];
      BotEngine.close(L,ConfluenceBot.config(),p,p.entry+example.s.dir,'test exit');
      const before=JSON.stringify(L),display=ConfluenceBot.displayLedger(L),t=display.closed[0];
      assert(JSON.stringify(L)===before,'Display rewrote the ledger');
      assert(Math.abs(t.pnl-(L.equity-L.startEquity))<0.001,'Opening fee omitted');
      assert(Math.abs(t.r-t.pnl/L.closed[0].meta.initialRisk)<1e-10,'Average R cost mismatch');
    });
    await test('The full 271-pair catalogue is scanned with six workers and cached until the next candle',async()=>{
      setup();const syms=Array.from({length:271},(_,i)=>'TEST'+String(i).padStart(3,'0')+'.s');
      MarketSources.brokerList=()=>syms;Feed.bridge.symbols=new Set(syms);
      let calls=0,active=0,peak=0;API.klines=async()=>{calls++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,0));active--;return example.w;};
      await ConfluenceScanner.scan();assert(calls===271&&ConfluenceScanner.rows.length===271,'Catalogue truncated');assert(peak<=6&&peak>1,'Unbounded or serial requests');
      await ConfluenceScanner.scan();assert(calls===271,'Repeated history fetch inside the same bar');
      const clock=Date.now;Date.now=()=>clock()+900000;await ConfluenceScanner.scan();assert(calls===542,'New bar did not refresh catalogue');
    });
    await test('Failed fresh data clears old signals and reports the exact pair',async()=>{
      setup();await ConfluenceScanner.scan();assert(ConfluenceScanner.rows[0].signal.dir,'Initial setup missing');
      API.klines=async()=>{throw Error('History unavailable for fixture');};await ConfluenceScanner.scan(true);
      const row=ConfluenceScanner.rows[0];assert(!row.signal&&row.status==='ERROR'&&row.why.includes('History unavailable'),'Old setup survived data failure');
    });
    const setupBoard=()=>{
      setup();const syms=['TESTA.s','TESTB.s'];MarketSources.brokerList=()=>syms;Feed.bridge.symbols=new Set(syms);
      for(const s of syms)Feed.specs[s]={...market.spec};
      Feed.quotes=async()=>{for(const s of syms){STORE.tickers.set(s,{last:example.s.entry,spread:example.s.entry*(s==='TESTA.s'?0.0002:0.0001)});Feed.srcOf[s]='bridge';Feed.quoteTime[s]=Date.now()/1000;}return [];};
      return syms;
    };
    await test('The bot selects the cheaper eligible pair; another pair can trade after it closes',async()=>{
      setupBoard();assert(await Bots.runBot(BOT_BY_ID.confluence),'Board entry failed');let L=Bots.ledgers.confluence;
      assert(L.open[0].sym==='TESTB.s','Rank did not prefer lower cost relative to ATR');
      BotEngine.close(L,ConfluenceBot.config(),L.open[0],example.s.entry,'test close');BotEngine.save('confluence',L);
      assert(await Bots.runBot(BOT_BY_ID.confluence),'Per-pair daily limit still blocked every other market');L=Bots.ledgers.confluence;
      assert(L.open[0].sym==='TESTA.s','Same pair traded twice');
    });
    await test('An unaffordable best-ranked pair is skipped and the next eligible pair is chosen',async()=>{
      setupBoard();Feed.specs['TESTB.s']={...market.spec,volumeMin:100,volumeMax:1000};
      assert(await Bots.runBot(BOT_BY_ID.confluence),'Affordable runner-up was skipped');
      assert(Bots.ledgers.confluence.open[0].sym==='TESTA.s','Invalid minimum lot accepted');
      assert(ConfluenceScanner.rows.find(r=>r.sym==='TESTB.s').status==='BLOCKED','Blocked reason not shown');
    });
    await test('Pausing the scanner blocks automatic entries but preserves existing position protection',async()=>{
      setup();lsSet('astra_botcfg_confluence',{paused:false,scannerOn:false});
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Scanner pause bypassed');
      assert(!Bots.ledgers.confluence.open.length,'Paused scanner placed entry');
    });
    await test('The actual bridge candle route forwards cancellation instead of leaving a hung fetch',async()=>{
      setup();const originalFetch=window.fetch,controller=new AbortController();let routed=false;
      try{
        window.fetch=(url,options)=>{
          assert(String(url).startsWith(Feed.BRIDGE_URL+'/candles?'),'Unexpected request');
          assert(options.signal===controller.signal,'Cancellation was not forwarded');routed=true;
          return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('test aborted')),{once:true}));
        };
        const pending=Feed.klines(sym,'15m',251,{signal:controller.signal});controller.abort();
        let cancelled=false;try{await pending;}catch(e){cancelled=e.message==='test aborted';}
        assert(routed&&cancelled,'Request did not cancel');
      }finally{window.fetch=originalFetch;}
    });
    const allowMany=()=>{
      setupBoard();
      ConfluenceBot.saveLimits(ConfluenceBot.defaultLimits());
      // Small disposable contracts make allocation, rather than a gold minimum lot, testable.
      for(const sym of MarketSources.brokerList())Feed.specs[sym]={...market.spec,contractSize:1,tickValue:market.spec.tickSize};
    };
    const laterSignal=(delta=900)=>{
      const clock=Date.now;Date.now=()=>clock()+delta*1000;
      API.klines=async()=>example.w.map(b=>({...b,rawTime:b.rawTime+delta,time:b.time+delta}));
      ConfluenceScanner.cache.clear();
    };
    await test('No count limits opens several ranked pairs in one scan with separate allocations',async()=>{
      allowMany();assert(await Bots.runBot(BOT_BY_ID.confluence),'Multi-entry scan did not trade');
      const L=Bots.ledgers.confluence;assert(L.open.length===2,'Only one pair opened');
      assert(L.open[0].sym==='TESTB.s','Cost ranking lost');
      for(const p of L.open)assert(p.qty*p.entry<=500+1e-8,'Per-trade allocation exceeded');
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Refresh duplicated a signal with unlimited counts');
      assert(ConfluenceBot.config().entriesPerDay===0,'Daily cap still enabled');
    });
    await test('Fresh signals can add positions in the same pair and day; reload cannot duplicate a signal',async()=>{
      allowMany();await Bots.runBot(BOT_BY_ID.confluence);laterSignal();
      assert(await Bots.runBot(BOT_BY_ID.confluence),'A new same-day signal was blocked');
      let L=BotEngine.load('confluence');assert(L.open.length===4,'Same-pair stacking was blocked');
      for(const p of L.open.slice())BotEngine.close(L,ConfluenceBot.config(),p,example.s.entry,'test exit');
      BotEngine.save('confluence',L);Bots.ledgers.confluence=BotEngine.blank('confluence');
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Closing and reloading duplicated the same signal');
    });
    await test('Saved open-position and related-position limits still stop a multi-entry batch',async()=>{
      allowMany();ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),maxOpen:1});await Bots.runBot(BOT_BY_ID.confluence);
      assert(Bots.ledgers.confluence.open.length===1,'Max-open bypassed within a batch');
      allowMany();ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),maxPerSymbol:1});await Bots.runBot(BOT_BY_ID.confluence);laterSignal();
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Per-pair open limit bypassed on a new signal');
      allowMany();const exposure=BotEngine.exposureKeys;
      try{BotEngine.exposureKeys=()=>['fixture-related'];ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),maxCorrelated:1});await Bots.runBot(BOT_BY_ID.confluence);
        assert(Bots.ledgers.confluence.open.length===1,'Related exposure bypassed in batch');
      }finally{BotEngine.exposureKeys=exposure;}
    });
    await test('A configurable daily count survives closed-history trimming and resets on a new broker day',async()=>{
      allowMany();ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),entriesPerDay:1});await Bots.runBot(BOT_BY_ID.confluence);
      let L=Bots.ledgers.confluence;for(const p of L.open.slice())BotEngine.close(L,ConfluenceBot.config(),p,example.s.entry,'test exit');
      L.closed=[];BotEngine.save('confluence',L);laterSignal();
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Trimmed history bypassed the daily count');
      const clock=Date.now;Date.now=()=>clock()+85500*1000;
      API.klines=async()=>example.w.map(b=>({...b,rawTime:b.rawTime+86400,time:b.time+86400}));ConfluenceScanner.cache.clear();
      assert(await Bots.runBot(BOT_BY_ID.confluence),'Daily count did not reset with broker day');
    });
    await test('Unlimited counts still share one equity budget and reserve open-stop losses',async()=>{
      allowMany();ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),maxNotionalPct:6});await Bots.runBot(BOT_BY_ID.confluence);
      let L=Bots.ledgers.confluence;assert(L.open.length===2,'Remaining allocation was not usable');
      assert(BotEngine.funds(L,BotEngine.rules(ConfluenceBot.config())).used<=600+1e-8,'Account equity reused in full');
      allowMany();ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),maxDailyLossPct:0.01});
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Aggregate stop-loss budget bypassed');
    });
    await test('Rule validation, failed saves and defaults never erase positions or silently raise limits',async()=>{
      allowMany();await Bots.runBot(BOT_BY_ID.confluence);const before=JSON.stringify(BotEngine.load('confluence'));
      for(const invalid of [{maxOpen:1.5},{riskPct:NaN},{maxNotionalPct:101},{entriesPerDay:-1},{perTradeNotionalPct:0}])
        assert(!ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),...invalid}),'Invalid preference accepted');
      fixtureSaveFails=true;assert(!ConfluenceBot.saveLimits({...ConfluenceBot.defaultLimits(),maxOpen:1}),'Failed save reported success');fixtureSaveFails=false;
      assert(ConfluenceBot.config().limits.maxOpen===0,'Failed save changed active rule');
      ConfluenceBot.saveLimits(ConfluenceBot.defaultLimits());assert(JSON.stringify(BotEngine.load('confluence'))===before,'Settings reset rewrote history');
      lsSet('astra_botcfg_confluence',{paused:false,confluenceLimits:{maxOpen:-1}});
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Corrupt saved limits allowed entry');
    });
    await test('An in-flight scan reads limits saved by another tab before opening',async()=>{
      allowMany();let release;const candles=API.klines;
      // Use a shared promise so both workers are released together.
      const pendingCandles=new Promise(r=>{release=r;});API.klines=()=>pendingCandles;
      const run=Bots.runBot(BOT_BY_ID.confluence);
      lsSet('astra_botcfg_confluence',{paused:false,confluenceLimits:{...ConfluenceBot.defaultLimits(),maxOpen:1}});
      release(await candles());await run;assert(Bots.ledgers.confluence.open.length===1,'Saved cross-tab limit ignored');
    });
    await test('A failed first fill save stops the rest of the batch',async()=>{
      allowMany();fixtureSaveFails=true;await Bots.runBot(BOT_BY_ID.confluence);
      assert(Bots.ledgers.confluence.open.length===1,'Batch continued after save failure');
      assert(BotEngine.unsaved.has(Bots.ledgers.confluence),'Unsaved position lost its guard');
    });
    await test('A daily loss lock is saved even without a fill and survives recovery and reload',async()=>{
      allowMany();const day=BotEngine.dayKey(Date.now()),L=Bots.ledgers.confluence;
      L.daily[day]={pnl:-201,fees:0};BotEngine.save('confluence',L);
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Daily loss did not stop entry');
      const saved=BotEngine.load('confluence');assert(saved.lockedUntil>Date.now(),'Rejection did not save the daily lock');
      saved.daily[day].pnl=0;BotEngine.save('confluence',saved);Bots.ledgers.confluence=BotEngine.blank('confluence');
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Recovery/reload removed daily lock');
    });
    await test('A per-trade allocation below the actual broker minimum refuses the entry',async()=>{
      setup();ConfluenceBot.saveLimits(ConfluenceBot.defaultLimits());
      assert(!await Bots.runBot(BOT_BY_ID.confluence),'Allocation was rounded up to an oversized lot');
      assert(ConfluenceScanner.rows[0].why.includes('Smallest broker size'),'Minimum-lot explanation missing');
    });
    // Draw the actual marker adapter over captured history for visual inspection.
    STORE.symbol=sym;STORE.tf='15m';Chart.settings.confluence.on=true;ConfluenceOverlay.key='';
    const shown=bars.slice(0,Math.max(...examples.map(e=>e.i))+40),markers=ConfluenceOverlay.markers(shown);
    if(window.confluenceSampleChart)window.confluenceSampleChart.remove();
    window.confluenceSampleChart=LightweightCharts.createChart(document.getElementById('sampleChart'),{autoSize:true,layout:{background:{color:'#101722'},textColor:'#ddd'},timeScale:{timeVisible:true}});
    const series=window.confluenceSampleChart.addCandlestickSeries();series.setData(shown);series.setMarkers(markers);
    window.confluenceSampleChart.timeScale().setVisibleRange({from:Math.min(...examples.map(e=>e.w[249].time))-900*20,to:Math.max(...examples.map(e=>e.w[249].time))+900*20});
    document.getElementById('sampleDetails').textContent='Captured gold candles: '+markers.length+' ASTRA labels. BUY and SELL occur only on completed candles. This sample is historical, not a live instruction.';
    output.textContent+='\n\n'+count+'/'+(count+failed)+' checks passed.';output.className=failed?'fail':'pass';
  }catch(e){output.textContent+='\nFAILED: '+e.message;console.error(e);}finally{Date.now=realNow;API.klines=realKlines;Feed.quotes=realQuotes;Feed.loadSpecs=realSpecs;button.disabled=false;fixtureSaveFails=false;}
});
