test('Manual positions use full cards, filter other accounts and avoid duplicate stop controls',()=>{
  const p=paperCard();Bots.active='manual';Bots.render();OpenTrades.stop();
  assert(document.querySelector('#manualPositions [data-ot="manual:'+p.id+'"]'),'Missing manual card');
  assert(!document.querySelector('#manualLedger [data-psl]'),'Duplicate stop editor');
  assert(document.querySelectorAll('#manualPositions .wsTradeSection').length===3,'Missing full controls');
});
test('New and closed trades preserve a surviving edited stop, ticket and keyboard focus',()=>{
  document.getElementById('bottomPanel').classList.remove('collapsed');
  const p=paperCard();Bots.active='manual';Bots.render();OpenTrades.stop();
  const input=document.querySelector('[data-otsl]'),ticket=document.querySelector('.mbForm');
  input.value='2477.25';input.focus();
  const L=Bots.ledgers.manual;L.open.push({...p,id:999});OpenTrades.refresh();OpenTrades.stop();
  assert(document.querySelectorAll('#manualPositions [data-ot]').length===2,'New trade missing');
  L.open=L.open.filter(x=>x.id!==999);OpenTrades.refresh();
  assert(document.querySelector('[data-otsl]')===input&&input.value==='2477.25'&&document.activeElement===input,'Edit lost on membership change: same='+String(document.querySelector('[data-otsl]')===input)+' value='+input.value+' focus='+document.activeElement.outerHTML.slice(0,150));
  assert(document.querySelector('.mbForm')===ticket,'Ticket replaced');
  L.open=[];OpenTrades.refresh();assert(!document.querySelector('[data-ot]')&&document.querySelector('.otEmpty'),'Last closed card left behind');
});
test('First new manual position appears from the empty state with working percentage controls',()=>{
  queued();quote(2489.9);ManualOrders.process();OpenTrades.refresh();OpenTrades.stop();
  const button=document.querySelector('[data-otpct$=":sl:0.5"]');button.click();
  assert(+document.querySelector('[data-otsl]').value>0,'New card not bound');
  assert(document.querySelector('.otBar'),'Sort controls missing after first entry');
});
test('A symbol in a trade opens its exact chart without bubbling into row actions',()=>{
  paperCard();let parentAction=false;
  document.querySelector('.otHead').addEventListener('click',()=>parentAction=true);
  document.querySelector('.otHead [data-pair-chart]').click();
  assert(STORE.symbol==='ETHUSD.m'&&!parentAction,'Pair selected wrong chart or triggered parent action');
});
test('Manual cards refresh saved levels, trailing controls and reduced size after management actions',async()=>{
  const p=paperCard();Bots.active='manual';Bots.render();OpenTrades.stop();
  await Bots.editPos('manual',p.id,{sl:2480,trail:{start:1,gap:0.5}});OpenTrades.refresh();
  assert(document.querySelector('[data-otsl]').value==='2480','Saved stop display stale');
  assert(document.querySelector('[data-ottrail]').textContent==='Update trail'&&!document.querySelector('[data-ottrailoff]').hidden,'Trail controls stale');
  await Bots.partialClose('manual',p.id,0.25);OpenTrades.refresh();OpenTrades.stop();
  assert(Math.abs(parseFloat(document.querySelector('[data-f="size"]').textContent)-0.3)<1e-8,'Reduced size display stale');
});
test('Chart Buy and Sell prepare the exact pair and side without submitting an order',()=>{
  const note=document.getElementById('mbNote');note.value='Same-pair draft';
  document.querySelector('[data-chart-ticket="-1"]').click();
  assert(Bots.manualSide===-1&&document.getElementById('mbSym').dataset.val==='ETHUSD.m','Wrong sell ticket');
  assert(document.getElementById('mbNote').value==='Same-pair draft','Same-pair draft erased');
  STORE.symbol='XAUUSD.m';document.querySelector('[data-chart-ticket="1"]').click();
  assert(Bots.manualSide===1&&document.getElementById('mbSym').dataset.val==='XAUUSD.m','Wrong buy ticket');
  assert(!document.getElementById('mbNote').value&&!document.getElementById('mbQty').value,'Old contract draft carried over');
  assert(!Bots.ledgers.manual.open.length,'Chart button placed a trade');
});
document.getElementById('demo').onclick=()=>{
  reset();queued();quote(2489.9);ManualOrders.process();
  queued({dir:-1,entry:2499.3,sl:2520,tp:2470,qty:0.2});quote(2500);ManualOrders.process();
  document.getElementById('bottomPanel').classList.remove('collapsed');
  Bots.active='manual';Bots.render();OpenTrades.refresh();OpenTrades.stop();
  document.getElementById('manualPositions').scrollIntoView();
};
const Popout={open(){return window.open('workspace-checks.html?relay=bots','astra_desk_relay_fixture','popup=yes,width=900,height=700');}};
test('A chart window hands the exact side and pair to a newly loaded manual window',async()=>{
  const previous=document.documentElement.dataset.panel;
  document.documentElement.dataset.panel='chart';
  let child;const original=Popout.open;
  Popout.open=function(){child=original();return child;};
  try{
    WorkspaceUI.openManual('ETHUSD.m',-1,'15m');assert(child,'Fixture popup was blocked');
    await new Promise((resolve,reject)=>{
      const deadline=Date.now()+8000;
      const timer=setInterval(()=>{
        try{
          const doc=child.document;
          if(doc.querySelector('#mbSym')?.dataset.val==='ETHUSD.m'&&doc.querySelector('.sideBtn.on')?.textContent==='SELL'&&doc.querySelector('#mbTf')?.value==='15m'){
            clearInterval(timer);resolve();
          }else if(Date.now()>deadline){clearInterval(timer);reject(Error('New-window ticket was not populated: '+doc.location.href+' · '+doc.readyState+' · '+doc.body?.innerText.slice(-350)));}
        }catch(e){clearInterval(timer);reject(e);}
      },50);
    });
  }finally{
    child?.close();WorkspaceUI.pendingWindows.delete(child);Popout.open=original;
    if(previous)document.documentElement.dataset.panel=previous;else delete document.documentElement.dataset.panel;
  }
});
if(new URLSearchParams(location.search).get('relay')==='bots'){
  reset();document.documentElement.dataset.panel='bots';
  window.opener?.postMessage({type:'astra-desk-ready'},location.origin);
}
