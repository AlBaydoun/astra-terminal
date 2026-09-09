document.getElementById('run').onclick=async()=>{
  const lines=[],test=async(name,fn)=>{try{await fn();lines.push('PASS '+name);}catch(e){lines.push('FAIL '+name+' — '+e.message);console.error(e);}document.getElementById('results').textContent=lines.join('\n');};
  const assert=(v,msg)=>{if(!v)throw Error(msg);},now=Date.now();
  const make=(title,url='https://www.cnbc.com/test',patch={})=>({title,url,source:'Test source',sourceId:'markets',publishedAt:now-60000,fetchedAt:now,stale:false,...patch});
  const base={checkedAt:now,sources:[{id:'markets',name:'Test source',url:'https://www.cnbc.com/rss',status:'ok',count:4,fetchedAt:now}],items:[make('CPI inflation report arrives'),make('Oil inventories change','https://www.cnbc.com/oil'),make('Routine banking application','https://www.federalreserve.gov/test',{sourceId:'fed'}),make('FOMC decision from last week','https://www.cnbc.com/old',{publishedAt:now-3*86400000})]};
  const realFetch=window.fetch;let response=base,offline=false;
  window.fetch=async()=>{if(offline)throw Error('fixture offline');return {ok:true,json:async()=>structuredClone(response)};};
  clearInterval(MarketNews.timer);clearInterval(MarketNews.ageTimer);Object.assign(MarketNews,{data:null,started:false,seen:new Set(),error:'',busy:false,filter:'all',query:'',muted:false});
  MarketNews.init();while(MarketNews.busy)await new Promise(r=>setTimeout(r,0));clearInterval(MarketNews.timer);clearInterval(MarketNews.ageTimer);
  await test('Recent macro headlines rank ahead of old headlines; routine releases are not high impact',()=>{
    assert(MarketNews.ranked()[0].title==='CPI inflation report arrives','Wrong lead');assert(MarketNews.classify(base.items[2]).impact===1,'Routine banking release raised false alarm');assert(document.querySelectorAll('.mnAlert').length===1,'Old FOMC became an alert');
  });
  await test('Commercial missile production and mortgage-rate stories do not become crisis alerts',()=>{
    assert(MarketNews.classify(make('Defense startup opens missile factory')).impact<3,'Factory became an attack');
    assert(MarketNews.classify(make('Demand for mortgages rises along with interest rates')).impact===2,'Mortgage demand became a policy decision');
    assert(MarketNews.classify(make('Central bank cuts interest rates')).impact===3,'Missed policy decision');
  });
  await test('Gold and currency reports reach their market filters; expired fetches stop being fresh',()=>{
    assert(MarketNews.classify(make('Gold bullion prices edge higher')).tags.includes('Gold'),'Gold story not tagged');
    assert(MarketNews.classify(make('Dollar and yen diverge')).tags.includes('FX'),'Currency story not tagged');
    assert(!MarketNews.fresh(make('FOMC decision',undefined,{fetchedAt:now-21*60000})),'Expired fetch remained fresh');
    assert(!MarketNews.fresh(make('FOMC decision',undefined,{fetchedAt:now+60000})),'Future fetch remained fresh');
  });
  await test('Search and market buttons filter real cards and survive rendering',()=>{
    document.querySelector('[data-filter="Energy"]').click();assert(document.querySelectorAll('.mnCard').length===1,'Energy filter wrong');
    const input=document.getElementById('mnSearch');input.value='missing';input.dispatchEvent(new Event('input'));assert(document.querySelector('.mnEmpty'),'No empty state');MarketNews.render();assert(input.value==='missing'&&MarketNews.filter==='Energy','Refresh lost filters');input.value='';input.dispatchEvent(new Event('input'));document.querySelector('[data-filter="all"]').click();
  });
  await test('Unknown dates and stale source caches are excluded from the alert desk',()=>{
    response={...base,items:[make('CPI inflation with no date',undefined,{publishedAt:null}),make('FOMC decision cached',undefined,{stale:true})]};MarketNews.data=response;MarketNews.render();assert(!document.querySelector('.mnAlert'),'Unverified time/source became alert');assert(document.getElementById('mnStories').textContent.includes('Publication time unavailable'),'Unknown date hidden');
  });
  await test('Headline markup and unsafe protocols are rendered harmlessly',()=>{
    const card=MarketNews.card(MarketNews.classify(make('<img src=x onerror=alert(1)> CPI','javascript:alert(1)')),0),el=document.createElement('div');el.innerHTML=card;assert(!el.querySelector('img')&&!el.querySelector('a'),'Injected markup or unsafe URL');assert(el.textContent.includes('<img'),'Headline text vanished');
  });
  await test('Refresh announces a new important story once, and mute suppresses pop-ups',async()=>{
    notifications=[];response={...base,items:[...base.items,make('New FOMC rate decision','https://www.cnbc.com/new')]};await MarketNews.refresh();assert(notifications.length===1,'No new-story alert');await MarketNews.refresh();assert(notifications.length===1,'Repeated alert');document.getElementById('mnMute').click();response.items.push(make('New tariff announcement','https://www.cnbc.com/newer'));await MarketNews.refresh();assert(notifications.length===1&&MarketNews.muted,'Mute failed');
  });
  await test('An outage retains headlines, clears fresh alerts, and reports unavailability; retry recovers',async()=>{
    offline=true;await MarketNews.refresh();assert(!document.querySelector('.mnAlert')&&document.getElementById('mnStatus').textContent.includes('unavailable'),'Outage falsely live');assert(document.querySelector('.mnCard'),'Lost cached headlines');offline=false;await MarketNews.refresh();assert(!MarketNews.error&&document.querySelector('.mnAlert'),'Retry did not recover');
  });
  await test('Expand and Restore toggle without destroying the search field',()=>{
    const input=document.getElementById('mnSearch');document.getElementById('mnExpand').click();assert(document.getElementById('bot-news').classList.contains('mnExpanded'),'Expand failed');document.getElementById('mnExpand').click();assert(!document.getElementById('bot-news').classList.contains('mnExpanded')&&input===document.getElementById('mnSearch'),'Restore rebuilt controls');
  });
  window.fetch=realFetch;document.getElementById('results').textContent+='\n\n'+lines.filter(x=>x.startsWith('PASS')).length+'/'+lines.length+' passed.';
};
