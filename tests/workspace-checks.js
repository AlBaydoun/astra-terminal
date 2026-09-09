/* Exercises the shipped renderers against the same in-memory fixture as the
   manual-order suite. Never starts Bots.init() or loads the live path. */
const App = { setSymbol(sym){ STORE.symbol=sym; } };
document.querySelector('#botTabs [data-tab="bots"]').addEventListener('click',()=>Bots.render());
WorkspaceUI.init();
function paperCard(){
  queued(); quote(2489.9); ManualOrders.process();
  const p=Bots.ledgers.manual.open[0];
  assert(p,'Fixture did not enter');
  Bots.active='open'; Bots.render(); OpenTrades.stop();
  return p;
}
test('Grouped navigation includes every registry entry once and keeps future bots',()=>{
  BOTS.push({id:'future_fixture',name:'Future fixture'});
  try{
    Bots.wire();
    const ids=[...document.querySelectorAll('#botNav [data-bot]')].map(b=>b.dataset.bot);
    assert(ids.length===BOTS.length+1 && new Set(ids).size===ids.length,'Missing or duplicate destination');
    assert(document.querySelector('[data-bot="future_fixture"]').closest('section').textContent.includes('Strategy bots'),'New bot lost');
  }finally{ BOTS.pop(); Bots.wire(); }
});
test('Search filters pages, gives an empty state and survives a navigation rebuild',()=>{
  const search=document.getElementById('wsBotSearch');search.value='manual';search.dispatchEvent(new Event('input'));
  assert(document.querySelectorAll('#botNav [data-bot]:not([hidden])').length===1,'Search does not filter');
  Bots.wire();assert(document.getElementById('wsBotSearch').value==='manual','Search was erased');
  const input=document.getElementById('wsBotSearch');input.value='no-match-777';input.dispatchEvent(new Event('input'));
  assert(!document.querySelector('.wsNoResults').hidden,'Missing empty state');
  input.value='';input.dispatchEvent(new Event('input'));
});
test('Navigation through Open trades preserves an unfinished manual note and active page',()=>{
  const note=document.getElementById('mbNote');note.value='An unfinished note';
  document.querySelector('#wsToolbar [data-ws-bot="open"]').click();OpenTrades.stop();
  assert(Bots.active==='open'&&document.querySelector('#botNav [data-bot="open"]').getAttribute('aria-current')==='page','Active page out of sync');
  document.querySelector('#wsToolbar [data-ws-bot="manual"]').click();
  assert(document.getElementById('mbNote').value==='An unfinished note','Draft lost during navigation');
});
test('Expanded workspace restores and Escape leaves trading data unchanged',()=>{
  const before=JSON.stringify(Bots.ledgers);
  WorkspaceUI.expand(true);document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'}));
  assert(!document.getElementById('bot-bots').classList.contains('wsExpanded'),'Escape did not restore');
  document.getElementById('wsExpand').click();assert(document.getElementById('wsExpand').getAttribute('aria-pressed')==='true','Expand control failed');
  WorkspaceUI.expand(false);assert(JSON.stringify(Bots.ledgers)===before,'Navigation changed ledger');
});
test('Trade card separates protection, trailing and exit actions without losing controls',()=>{
  paperCard();
  assert(document.querySelectorAll('.otCard .wsTradeSection').length===3,'Missing trade sections');
  for(const key of ['otsl','ottp','otset','otbe','otts','ottg','ottrail','otpart','otclose'])
    assert(document.querySelector('[data-'+key+']'),'Missing '+key+' control');
});
test('Quote refresh moves the price graphic without replacing edited fields or applying them',()=>{
  const p=paperCard(),old=p.sl,input=document.querySelector('[data-otsl]');
  input.focus();input.value='2480.12';quote(2494);OpenTrades.refresh();
  assert(document.querySelector('[data-otsl]')===input&&input.value==='2480.12'&&document.activeElement===input,'Edited field replaced');
  assert(p.sl===old,'Draft stop applied without button');
  assert(document.querySelector('.wsPriceMap').textContent.includes('2494'),'Price graphic did not refresh');
});
test('Apply levels still calls the existing stop handler inside its new section',async()=>{
  const p=paperCard();document.querySelector('[data-otsl]').value='2480';
  const button=document.querySelector('[data-otset]'),edit=Bots.editPos;let pending;
  Bots.editPos=function(...args){pending=edit.apply(this,args);return pending;};
  // The original manual handler takes a writer lock and reloads a fresh ledger.
  try{button.click();await pending;}finally{Bots.editPos=edit;OpenTrades.stop();}
  const saved=Bots.ledgers.manual.open.find(x=>x.id===p.id);
  assert(saved.sl===2480&&saved.touched,'Protection edit failed: '+lastToast);
});
test('A trade chart shortcut selects its exact pair, restores the chart and cannot close a trade',()=>{
  const p=paperCard(),before=JSON.stringify(p);WorkspaceUI.expand(true);
  document.querySelector('.wsTradeLinks [data-ws-chart]').click();
  assert(STORE.symbol===p.sym&&!document.getElementById('bot-bots').classList.contains('wsExpanded'),'Chart link wrong');
  assert(JSON.stringify(p)===before,'Chart shortcut altered position');
});
test('Graphics handle short positions, missing targets, stale quotes and flat equity',()=>{
  const html=WorkspaceUI.priceMap({dir:-1,sl:110,entry:100,tp:null},{px:99,stale:true});
  assert(html.includes('Last / fallback')&&!html.includes('Target <b>0')&&!html.includes('NaN'),'Misleading missing/stale level');
  assert(WorkspaceUI.equity({equityCurve:[]})==='','Invented empty equity history');
  const flat=WorkspaceUI.equity({equityCurve:[{t:1000,eq:100},{t:2000,eq:100}]});
  assert(flat.includes('42.00')&&!flat.includes('NaN'),'Flat equity breaks graphic');
});
test('Manual settings expand without moving or replacing the order ticket',()=>{
  const ticket=document.querySelector('.mbForm'),rules=document.querySelector('.manualRules');
  assert(!rules.open,'Rules cover the initial ticket');rules.querySelector('summary').click();
  assert(rules.open&&document.querySelector('.mbForm')===ticket,'Settings replaced the ticket');
});
// Only UI testing timers are stopped; this file never starts any trading timer.
const runWorkspaceChecks=document.getElementById('run').onclick;
document.getElementById('run').onclick=async()=>{
  try{await runWorkspaceChecks();}finally{OpenTrades.stop();clearInterval(Bots.manualTimer);Bots.manualTimer=null;WorkspaceUI.expand(false);}
};
