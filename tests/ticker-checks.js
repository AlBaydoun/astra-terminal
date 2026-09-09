document.getElementById('run').addEventListener('click',async()=>{
  const out=document.getElementById('results'),log=[];let pass=0,fail=0;
  const assert=(x,why)=>{if(!x)throw Error(why);};
  const test=async(name,fn)=>{try{await fn();pass++;log.push('PASS '+name);}catch(e){fail++;log.push('FAIL '+name+': '+e.message);console.error(e);}out.textContent=log.join('\n');};
  const realFetch=window.fetch,realQuotes=Feed.quotes,realNow=Date.now;
  fixtureStorage=new Map();Strip.el=document.getElementById('tickerStrip');
  const syms=Array.from({length:271},(_,i)=>'TEST'+String(i).padStart(3,'0')+'.s');
  Feed.bridge={server:'JustMarkets-Live',symbols:new Set(syms)};Feed.bridgeClock={offset:0};
  const now=Math.floor(realNow()/900000)*900000+30000;Date.now=()=>now;
  const signal={sym:syms[0],dir:1,near:1,score:100,entry:100,atr:2,entryBar:(now-30000)/1000,failed:[],meta:{brokerDay:Math.floor(now/86400000)}};
  MarketSources.brokerList=()=>syms;MarketSources.allowed=s=>syms.includes(s);MarketSources.executable=(s,source)=>syms.includes(s)&&source==='bridge';
  PairRules.blocked=()=>false;Feed.alias={};ConfluenceScanner.rows=[];
  const fresh=s=>{STORE.tickers.set(s,{last:100,open:95,spread:0.01});Feed.srcOf[s]='bridge';Feed.quoteTime[s]=now/1000;};
  syms.forEach(fresh);
  try{
    await test('All 271 canonical pairs occur once in the main loop, with repeated spotlight slots',()=>{
      Strip.build();const all=[...Strip.el.querySelectorAll('.tsGroup:not([aria-hidden]) [data-kind="all"]')];
      assert(all.length===271&&new Set(all.map(e=>e.dataset.sym)).size===271,'Catalogue omitted or duplicated');
      assert(Strip.el.querySelectorAll('.tsGroup:not([aria-hidden]) [data-kind="focus"]').length===55,'No repeated spotlights');
    });
    await test('Price updates preserve the animation track and its final instrument',()=>{
      const track=Strip.el.querySelector('.tsTrack'),last=Strip.el.querySelector('.tsGroup:not([aria-hidden]) [data-sym="TEST270.s"]');
      STORE.tickers.get(syms[0]).last=101;Strip.build();
      assert(track===Strip.el.querySelector('.tsTrack')&&last.isConnected,'Refresh restarted a long loop');
    });
    await test('Fresh Confluence setups rank above large swings and incomplete watch candidates',()=>{
      syms.forEach(fresh);const rows=new Map([
        [syms[0],{signal,status:'READY'}],
        [syms[1],{signal:{...signal,sym:syms[1],dir:0,near:-1,score:80,failed:['Pullback: waiting']},status:'WAIT'}],
        [syms[2],{move:{time:signal.entryBar-900,ratio:3},status:'WAIT'}],
      ]);
      const ranked=Strip.ranked([syms[2],syms[1],syms[0]].map(s=>Strip.item(s,rows)));
      assert(ranked.map(x=>x.badge).join('|')==='BUY SETUP|SELL WATCH|SWING 3.0×','Misleading priority or signal badge');
    });
    await test('Stale quotes, prohibited pairs, expired signals and account refusals cannot advertise an entry',()=>{
      const rows=new Map([[syms[0],{signal,status:'READY'}]]);
      Feed.quoteTime[syms[0]]-=181;assert(!Strip.item(syms[0],rows).badge.includes('BUY'),'Stale entry');fresh(syms[0]);
      PairRules.blocked=()=>true;assert(!Strip.item(syms[0],rows).badge.includes('BUY'),'Blocked pair entry');PairRules.blocked=()=>false;
      rows.get(syms[0]).signal={...signal,entryBar:signal.entryBar-100};assert(!Strip.item(syms[0],rows).badge.includes('BUY'),'Expired signal relabelled as watch');
      rows.get(syms[0]).signal=signal;rows.get(syms[0]).status='BLOCKED';rows.get(syms[0]).why='No free allocation';
      assert(Strip.item(syms[0],rows).badge==='BLOCKED','Account refusal advertised as a setup');
    });
    await test('Unknown day-open data stays unknown and disconnected catalogues remove every chip',()=>{
      STORE.tickers.get(syms[0]).open=null;assert(Strip.item(syms[0],new Map()).day===null,'Null treated as a zero move');
      MarketSources.brokerList=()=>[];Strip.build();assert(!Strip.el.querySelector('[data-sym]'),'Disconnected markets remain');MarketSources.brokerList=()=>syms;
    });
    await test('Full quote refresh uses all 271 pairs in batches of at most 40 with two workers',async()=>{
      let calls=0,peak=0,active=0,total=0;MK.applyQuotes=()=>{};
      Feed.quotes=async(batch,options)=>{calls++;total+=batch.length;assert(batch.length<=40&&options.signal,'Missing bounded/cancellable request');active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,0));active--;return batch.map(symbol=>({symbol}));};
      await Strip.refreshQuotes();assert(total===271&&calls===7&&peak===2,'Incomplete or unbounded quote refresh');
    });
    await test('Quote failures remain visible and release the refresh lock',async()=>{
      Feed.quotes=async()=>{throw Error('fixture quote failure');};await Strip.refreshQuotes();
      assert(Strip.el.title.includes('fixture quote failure')&&!Strip.busy,'Failed request swallowed or refresh stuck');
    });
    await test('The real Feed quote route reports HTTP errors and forwards cancellation for ticker requests',async()=>{
      Feed.quotes=realQuotes;const controller=new AbortController();let saw=false;
      window.fetch=async(url,options)=>{saw=String(url).includes('/quotes?')&&options.signal===controller.signal;return {ok:false,status:503};};
      let failed=false;try{await Feed.quotes([syms[0]],{signal:controller.signal,strict:true});}catch(e){failed=e.message.includes('503');}
      assert(saw&&failed,'Strict quote error or cancellation was lost');
    });
  }finally{window.fetch=realFetch;Feed.quotes=realQuotes;Date.now=realNow;out.textContent+='\n\n'+pass+'/'+(pass+fail)+' checks passed.';}
});
