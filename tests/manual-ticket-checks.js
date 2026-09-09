// Run the earlier pending-order checks in explicit exact-size mode too.
const ticketReset=reset;
reset=()=>{Feed.bridge=null;Feed.account=null;ticketReset();Bots.cfgs.manual.manualAutoFit=false;};
function gold(){
  Bots.cfgs.manual.manualAutoFit=true;STORE.symbol='XAUUSD.s';
  Feed.specs['XAUUSD.s']={contractSize:100,tickSize:0.01,tickValue:1,volumeMin:0.01,volumeStep:0.01,volumeMax:100,currency:'USD'};
  Feed.account={currency:'USD',leverage:100};quote(4400,'XAUUSD.s',0.26);
  document.getElementById('botBody').removeAttribute('data-bot');Bots.render();
  document.getElementById('mbAmt').value='100';document.getElementById('mbSl').value='4378';document.getElementById('mbTp').value='4422';
}
test('A small gold amount automatically becomes 0.01 lot with cash loss and profit displayed',()=>{
  gold();Bots.manualCalc(true);
  const plan=Bots.manualPreviewPlan;
  assert(plan.ok&&plan.gate.lots===0.01,plan.reason);
  assert(document.getElementById('mbQty').value==='0.01','Ticket size not updated');
  assert(plan.gate.riskCash<50&&plan.gate.notional<10000,'Budget exceeded');
  const text=document.getElementById('mbCalc').textContent;
  assert(text.includes('If the stop is hit')&&text.includes('If the target is hit')&&!text.includes('no target'),'Cash preview missing');
  assert(!document.getElementById('mbGo').disabled,'Fitted ticket disabled');
});
test('Both 0.5% buttons update the actual levels, size and profit/loss preview',()=>{
  gold();document.querySelector('[data-mbpct="sl:0.5"]').click();document.querySelector('[data-mbpct="tp:0.5"]').click();
  assert(+document.getElementById('mbSl').value===4378&&+document.getElementById('mbTp').value===4422,'Percentage levels incorrect');
  assert(Bots.manualPreviewPlan.ok&&Bots.manualPreviewPlan.gate.riskCash>22,'Risk estimate missing costs');
  assert(!document.getElementById('mbCalc').textContent.includes('no target'),'Missing cash target');
});
test('Oversized lots shrink to budgets and minimum-lot risk can tighten the draft stop',()=>{
  gold();document.getElementById('mbAmt').value='';document.getElementById('mbQty').value='10';Bots.manualCalc(true);
  assert(+document.getElementById('mbQty').value<=0.02,'Oversized lots remained');
  document.getElementById('mbSl').value='4200';Bots.manualCalc(true);
  assert(Bots.manualPreviewPlan.ok&&+document.getElementById('mbSl').value>4350,'Minimum risk did not fit stop');
  assert(Bots.manualPreviewPlan.gate.riskCash<=50+1e-8,'Risk ceiling bypassed');
});
test('Impossible minimum allocation stays blocked without increasing saved budgets',()=>{
  gold();Bots.cfgs.manual.risk={maxNotionalPct:10};Bots.manualCalc(true);
  assert(!Bots.manualPreviewPlan.ok&&document.getElementById('mbGo').disabled,'Unaffordable minimum entered');
  assert(Bots.cfgs.manual.risk.maxNotionalPct===10,'Raised saved budget');
});
test('Auto-fit market submission uses the fitted size and levels',async()=>{
  gold();const live=Bots.liveQuote;Bots.liveQuote=async()=>quote(4400,'XAUUSD.s',0.26);
  try{await ManualOrders.exclusive(()=>Bots.manualMarketOpen({sym:'XAUUSD.s',dir:1,tf:'15m',sl:4378,tp:4422,amt:100,lots:NaN,amtMode:'value',note:'ticket check'}));
    const p=Bots.ledgers.manual.open[0];assert(p&&p.lots===0.01&&p.sl===4378&&p.tp===4422,'Wrong actual paper fill: '+lastToast);
  }finally{Bots.liveQuote=live;}
});
function airf(){
  Bots.cfgs.manual.manualAutoFit=true;STORE.symbol='AIRF';Feed.account={currency:'USD',leverage:100};
  Feed.bridge={symbols:new Set(['AIRF','EURUSD.s'])};
  Feed.specs.AIRF={contractSize:100,tickSize:0.01,tickValue:0.01,volumeMin:0.01,volumeStep:0.01,volumeMax:100,currency:'EUR'};
  quote(1.16,'EURUSD.s',0.002);quote(11.65,'AIRF',0.02);
}
test('AIRF uses EUR/USD conversion rather than its misleading tick-value field',()=>{
  airf();const fx=ManualTicket.fx('AIRF');assert(Math.abs(fx.profit-1.159)<1e-10&&Math.abs(fx.loss-1.161)<1e-10,'Wrong bid/ask currency conversion');
  const plan=ManualTicket.fit(Bots.ledgers.manual,Bots.manualCfg(),{sym:'AIRF',dir:1,entry:11.65,sl:11.5,tp:12,requestedQty:1,manual:true},quote(11.65,'AIRF',0.02));
  assert(plan.ok&&plan.gate.lots===0.01,'AIRF sizing refused: '+plan.reason);
  assert(Math.abs(plan.gate.notional-plan.gate.fill*1.161)<1e-8,'EUR notional read as USD');
});
test('Converted partial, stop-risk, equity and final exit survive reload; old positions keep old accounting',()=>{
  airf();const L=Bots.ledgers.manual,q=quote(11.65,'AIRF',0.02),sig={sym:'AIRF',dir:1,entry:11.65,sl:11.5,tp:13,manual:true,requestedQty:2};
  let p=BotEngine.open(L,Bots.manualCfg(),sig,q,BotEngine.check(L,Bots.manualCfg(),sig,q));
  assert(p&&Math.abs(p.meta.accountFx.loss-1.161)<1e-10,'Conversion not saved');
  const entry=p.entry;BotEngine.save('manual',L);const restored=BotEngine.load('manual');p=restored.open[0];
  assert(Math.abs(BotDash.notional(p)-entry*2*1.161)<1e-8,'Dashboard value not converted');
  assert(Math.abs(BotEngine.remainingRisk(p,BotEngine.rules(Bots.manualCfg()))-(entry-11.5*(1-0.00005))*2*1.161)<1e-8,'Remaining stop risk not converted');
  p.last=12;assert(Math.abs(BotEngine.equityNow(restored)-10000-(12-entry)*2*1.159)<1e-8,'Wrong floating cash after restore');
  const part=BotEngine.partialFill(restored,Bots.manualCfg(),p,0.5,12);
  assert(part.ok&&Math.abs(part.pnl-(12*(1-0.00005)-entry)*1.159)<1e-8,'Wrong partial cash or physical lots');
  assert(p.lots===0.01&&p.qty===1,'Currency conversion changed lot units');
  const expected=part.pnl+(12.5*(1-0.00005)-entry)*1.159;
  const closed=BotEngine.close(restored,Bots.manualCfg(),p,12.5,'test');
  assert(Math.abs(closed.pnl-expected)<0.0001&&Math.abs(restored.equity-10000-expected)<1e-8,'Wrong final P&L');
  assert(BotEngine.cashPnl({meta:{}},10)===10,'Repriced old history');
});
test('AIRF at the exact spread-to-stop boundary is accepted; a truly smaller stop is rejected',()=>{
  airf();const q=quote(11.6,'AIRF',0.03),L=Bots.ledgers.manual,cfg=Bots.manualCfg();
  const plan=ManualTicket.fit(L,cfg,{sym:'AIRF',dir:1,entry:11.6,sl:11.542,tp:11.658,manual:true,requestedQty:7},q);
  assert(plan.ok,plan.reason);
  const bad=BotEngine.check(L,cfg,{...plan.sig,sl:11.49},q);
  assert(!bad.ok&&bad.reason.includes('Spread is'),'A genuinely excessive spread passed');
});
test('Inverse currency conversion and stale conversion quotes fail correctly',()=>{
  airf();Feed.bridge.symbols=new Set(['AIRF','USDJPY.s']);Feed.specs.AIRF.currency='JPY';quote(150,'USDJPY.s',0.02);
  const fx=ManualTicket.fx('AIRF');assert(Math.abs(fx.profit-1/150.01)<1e-12&&Math.abs(fx.loss-1/149.99)<1e-12,'Inverse conversion wrong');
  Feed.quoteTime['USDJPY.s']-=181;assert(ManualTicket.fx('AIRF')===null,'Stale conversion accepted');
});
test('Closed-market preview keeps cash estimates while the entry button stays disabled',()=>{
  gold();Feed.quoteTime['XAUUSD.s']-=181;Bots.manualCalc(true);
  assert(document.getElementById('mbGo').disabled,'Stale quote became executable');
  assert(document.getElementById('mbCalc').textContent.includes('Preview only')&&Bots.manualPreviewPlan.estimate.riskCash>0,'Lost last-price estimate');
});
test('Missing currency quotes keep the form usable and cash figures recover when FX arrives',()=>{
  gold();airf();document.getElementById('mbSym').dataset.val='AIRF';
  document.getElementById('mbQty').value='0.01';document.getElementById('mbSl').value='11.5';document.getElementById('mbTp').value='12';
  Feed.quoteTime['EURUSD.s']-=181;Bots.manualCalc(true);
  assert(document.getElementById('mbGo').disabled&&document.getElementById('mbCalc').textContent.includes('currency-conversion'),'Missing FX was not explained');
  quote(1.16,'EURUSD.s',0.002);Bots.manualCalc(true);
  assert(!document.getElementById('mbGo').disabled&&Bots.manualPreviewPlan.estimate.riskCash>0,'Preview did not recover');
});
test('An empty market stop still permits automatic stop calculation on submission',async()=>{
  gold();document.getElementById('mbSl').value='';Bots.manualCalc();
  assert(!document.getElementById('mbGo').disabled,'Disabled the automatic-stop path');
  const live=Bots.liveQuote,auto=Bots.autoStop;
  Bots.liveQuote=async()=>quote(4400,'XAUUSD.s',0.26);Bots.autoStop=async()=>({dist:22,why:'fixture ATR'});
  try{await ManualOrders.exclusive(()=>Bots.manualMarketOpen({sym:'XAUUSD.s',dir:1,tf:'15m',sl:NaN,tp:4422,amt:100,lots:NaN,amtMode:'value',note:''}));
    assert(Bots.ledgers.manual.open[0]?.sl===4378,'Automatic stop did not reach paper position');
  }finally{Bots.liveQuote=live;Bots.autoStop=auto;}
});
test('Changing Buy to Sell realigns both draft levels and the paper fill uses them',async()=>{
  gold();document.querySelector('[data-mbside="-1"]').click();
  const sl=+document.getElementById('mbSl').value,tp=+document.getElementById('mbTp').value;
  assert(sl>4400&&tp<4400,'Sell levels remained on the buy side');
  const live=Bots.liveQuote;Bots.liveQuote=async()=>quote(4400,'XAUUSD.s',0.26);
  try{await ManualOrders.exclusive(()=>Bots.manualMarketOpen({sym:'XAUUSD.s',dir:-1,tf:'15m',sl,tp,amt:NaN,lots:0.01,amtMode:'value',note:''}));
    const p=Bots.ledgers.manual.open[0];assert(p?.dir===-1&&p.sl===sl&&p.tp===tp,'Sell fill changed the fitted levels');
  }finally{Bots.liveQuote=live;}
});
test('An AIRF waiting instruction fits the minimum size and keeps FX accounting when triggered',async()=>{
  airf();document.getElementById('botBody').removeAttribute('data-bot');Bots.render();
  document.getElementById('mbSym').dataset.val='AIRF';document.getElementById('mbOrderType').value='limit';
  document.getElementById('mbEntry').value='11.6';document.getElementById('mbSl').value='11.2';document.getElementById('mbTp').value='12.2';
  document.getElementById('mbAmt').value='1';document.getElementById('mbQty').value='';
  await ManualOrders.submit();assert(current()?.qty===1&&current().sl===11.2&&current().tp===12.2,'Pending fitted instruction not saved');
  quote(11.58,'AIRF',0.02);ManualOrders.process();
  const p=Bots.ledgers.manual.open[0];assert(current().status==='filled'&&p.lots===0.01&&p.meta.accountFx.currency==='USD','Pending fill missed currency valuation');
});
test('The actual Open Trades cash panel and dashboard value use saved conversion rates',()=>{
  airf();const L=Bots.ledgers.manual,q=quote(11.65,'AIRF',0.02),cfg=Bots.manualCfg();
  const sig={sym:'AIRF',dir:1,entry:11.65,sl:11.5,tp:12,manual:true,requestedQty:2,tf:'15m'};
  const p=BotEngine.open(L,cfg,sig,q,BotEngine.check(L,cfg,sig,q)),row={bot:'manual',p};
  const live=OpenTrades.live(row);
  assert(Math.abs(live.value-p.entry*2*1.161)<1e-8&&Math.abs(live.unreal-(11.65-p.entry)*2*1.161)<1e-8,'Open Trades value or floating P&L not converted');
  const panel=document.createElement('div');panel.innerHTML=OpenTrades.calcLine(row);
  document.getElementById('botBody').append(panel);
  assert(panel.textContent.includes(fmtNum((11.5-p.entry)*2*1.161))&&panel.textContent.includes(fmtNum((12-p.entry)*2*1.159)),'Open Trades stop/target cash not converted');
  assert(Math.abs(BotDash.risked(p)-(p.entry-11.5)*2*1.161)<1e-8,'Dashboard risk not converted');
});
