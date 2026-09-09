test('Manual rules save and restore all budgets without touching history or another bot', async()=>{
  const L=Bots.ledgers.manual,before=JSON.stringify(L);
  Bots.cfgs.other={risk:{riskPct:0.25}};
  const v={...ManualRules.values(),riskPct:3,maxNotionalPct:500,maxDailyLossPct:15,maxOpen:80,maxPerSymbol:40,maxCorrelated:30,
    staleQuoteSec:60,maxSpreadManualPct:2,maxSpreadAtrPct:60,manualAutoStopAtr:2.3,manualFallbackPct:0.7,timeLimitBars:0};
  assert(await ManualRules.save(v),'Rules did not save');
  Bots.cfgs.manual={};ManualOrders.syncPreferences();
  const restored=ManualRules.values();
  for(const key of Object.keys(v))assert(restored[key]===v[key],'Rule lost: '+key);
  assert(Bots.manualCfg().timeLimitBars===Number.MAX_SAFE_INTEGER,'No time limit not applied');
  assert(JSON.stringify(Bots.ledgers.manual)===before && Bots.cfgs.other.risk.riskPct===0.25,'Changed history or another bot');
});
test('The minimum-lot refusal names cash requirements and accepts a deliberately enlarged manual budget', async()=>{
  const L=Bots.ledgers.manual;L.equity=L.startEquity=100;
  quote(2491);Feed.specs['ETHUSD.m'].volumeMin=0.1;
  const sig={sym:'ETHUSD.m',dir:1,entry:2491,sl:2470,manual:true};
  let gate=BotEngine.check(L,Bots.manualCfg(),sig,quote());
  assert(!gate.ok && /Minimum 0.1 lot needs/.test(gate.reason) && /Available:/.test(gate.reason),'No actionable explanation');
  assert(await ManualRules.save({...ManualRules.values(),riskPct:5,maxNotionalPct:300,maxDailyLossPct:20,minEquity:0}),'Failed to set budgets');
  gate=BotEngine.check(L,Bots.manualCfg(),sig,quote());
  assert(gate.ok && gate.lots===0.12,'Minimum lot did not become affordable: '+gate.reason);
  const p=BotEngine.open(L,Bots.manualCfg(),sig,quote(),gate);
  assert(p && p.qty*p.entry>100 && p.qty*p.entry<=300,'Leveraged ceiling did not apply');
  assert(Bots.manualFunds().free<300-p.qty*p.entry+0.01,'Allocation was replenished');
});
test('Saved manual rules apply again when a waiting entry triggers', async()=>{
  queued();
  await ManualRules.save({...ManualRules.values(),maxOpen:0});
  Bots.cfgs.manual={};ManualOrders.syncPreferences();quote(2489);ManualOrders.process();
  assert(current().status==='rejected' && /maximum of 0/.test(current().message),'Waiting entry bypassed saved rules');
});
test('Unlimited manual counts are explicit and do not disable budgets or stale-price guards', async()=>{
  await ManualRules.save({...ManualRules.values(),maxOpen:Number.MAX_SAFE_INTEGER,maxPerSymbol:Number.MAX_SAFE_INTEGER,maxCorrelated:Number.MAX_SAFE_INTEGER});
  assert(BotEngine.rules(Bots.manualCfg()).maxOpen===Number.MAX_SAFE_INTEGER,'Hidden count cap');
  queued();quote(2489);Feed.quoteTime['ETHUSD.m']-=181;ManualOrders.process();
  assert(!Bots.ledgers.manual.open.length,'Unlimited counts bypassed quote gate');
  const v=ManualRules.values();assert(v.riskPct===0.5&&v.maxNotionalPct===100,'Budgets changed');
});
test('Invalid rules and failed saves preserve the previous active configuration', async()=>{
  const before=JSON.stringify(Bots.cfgs.manual),err=console.error;console.error=()=>{};
  try{
    for(const patch of [{riskPct:NaN},{maxNotionalPct:Infinity},{maxOpen:1.5},{staleQuoteSec:181},{maxDailyLossPct:0}])
      assert(!await ManualRules.save({...ManualRules.values(),...patch}),'Invalid rules saved');
    fixtureSaveFails=true;
    assert(!await ManualRules.save({...ManualRules.values(),riskPct:9}),'Storage failure ignored');
    assert(JSON.stringify(Bots.cfgs.manual)===before,'Failed save changed active rules');
  }finally{fixtureSaveFails=false;console.error=err;}
});
test('Refreshing the manual workspace preserves the rule field and unfinished order',()=>{
  const field=document.getElementById('mr_riskPct'),stop=document.getElementById('mbSl');
  field.value='1.237';stop.value='2400';field.focus();
  Bots.render();Bots.render();
  assert(document.getElementById('mr_riskPct')===field&&field.value==='1.237'&&document.activeElement===field,'Replaced draft rule');
  assert(stop.value==='2400'&&ManualRules.values().riskPct===0.5,'Changed draft order or autosaved rules');
});
test('Wider manual stop edits require the saved option and preserve original risk history',async()=>{
  const L=Bots.ledgers.manual,q=quote(),sig={sym:'ETHUSD.m',dir:1,entry:q.price,sl:2470,manual:true,requestedQty:0.1};
  const p=BotEngine.open(L,Bots.manualCfg(),sig,q,BotEngine.check(L,Bots.manualCfg(),sig,q));
  BotEngine.save('manual',L);const initial=p.riskCash;
  await Bots.editPos('manual',p.id,{sl:2400});assert(Bots.ledgers.manual.open[0].sl===2470,'Widened without preference');
  await ManualRules.save({...ManualRules.values(),manualAllowWiderStop:true});
  await Bots.editPos('manual',p.id,{sl:2400});
  const changed=Bots.ledgers.manual.open[0];
  assert(changed.sl===2400&&changed.touched&&changed.riskCash===initial&&changed.slInit===2470,'Lost edit or original risk');
  await Bots.editPos('manual',p.id,{sl:1900});assert(Bots.ledgers.manual.open[0].sl===2400,'Wider-stop setting bypassed current risk');
});
test('A daily lock can be rechecked after raising the budget without erasing daily losses',async()=>{
  const L=Bots.ledgers.manual,day=BotEngine.dayKey();L.daily[day]={pnl:-250,fees:0};L.lockedUntil=Date.now()+60000;BotEngine.save('manual',L);
  await ManualRules.unlock();assert(Bots.ledgers.manual.lockedUntil>0,'Unlocked while still over budget');
  await ManualRules.save({...ManualRules.values(),maxDailyLossPct:5});await ManualRules.unlock();
  assert(Bots.ledgers.manual.lockedUntil===0&&Bots.ledgers.manual.daily[day].pnl===-250,'Lock not rechecked or history erased');
});
test('Automatic manual stop follows the saved multiplier and proportional spread guard',async()=>{
  const klines=API.klines;
  API.klines=async()=>Array.from({length:30},(_,i)=>({time:i,open:100,high:102,low:98,close:100,volume:1}));
  try{
    const before=await Bots.autoStop('ETHUSD.m','1h',100,0);
    await ManualRules.save({...ManualRules.values(),manualAutoStopAtr:3,maxSpreadAtrPct:10});
    const after=await Bots.autoStop('ETHUSD.m','1h',100,0);
    assert(Math.abs(after.dist-before.dist*2)<1e-8,'ATR multiplier ignored');
    const wide=await Bots.autoStop('ETHUSD.m','1h',100,2);assert(wide.dist===20,'Spread floor ignored saved rule');
  }finally{API.klines=klines;}
});
