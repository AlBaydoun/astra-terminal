// Exercise production sizing, authentication failure handling and rendered controls.
(async()=>{
const output=document.getElementById('results');let passed=0;
const assert=(v,m)=>{if(!v)throw Error(m);};
const check=async(name,fn)=>{await fn();output.textContent+='PASS '+name+'\n';passed++;};
LiveDesk.candidates=()=>[{b:BOTS[0],paused:false,cfg:{},ready:{met:6}}];
LiveDesk.runnable=()=>true;
LiveDesk.view=function(){return '<div class="ldWrap">'+this.moneyView(this.load())+this.fitView(this.load())+'</div>';};
Bots.lvAccount=()=>'';Bots.lvAudit=()=>'';Bots.lvStep3=()=>'';Bots.lvArmed=()=>'';
function reset(){
  for(const k of Object.keys(memory))delete memory[k];
  Live.state=null;Live.book=null;Live.load();Live.state.linked=true;Live.state.code='123456';Live.state.armed={example:{mode:'live',desk:true}};Live.save();
  Live.bridge={trading:true,balance:800,currency:'USD',leverage:2000};
  LiveDesk.state=LiveDesk.defaults();Object.assign(LiveDesk.state,{v:2,fix20261006:true,on:true,budget:{mode:'usd',value:400},bots:{mode:'manual',picked:['example']}});LiveDesk.save();
}
try{
reset();
await check('Minimum lot over $4 risk is rejected',()=>{const r=LiveDesk.size({sym:symbols[0],entry:2000,sl:1990});assert(!r.ok&&r.minRisk===10,'Minimum risk must be $10');});
await check('Higher chosen budget sizes down to broker step, not above risk',()=>{LiveDesk.state.riskPct=4;const r=LiveDesk.size({sym:symbols[0],entry:2000,sl:1990});assert(r.ok&&r.lots===0.01&&r.riskCash===10,'Expected 0.01 lot and $10 risk');});
await check('Fit preview obeys maximum lots',()=>{LiveDesk.state.riskPct=10;Live.load();Live.state.caps.maxLots=0.005;Live.save();const f=LiveDesk.fit();assert(f.rows.every(r=>!r.fits),'Preview must reject below-minimum lot ceiling');});
reset();
await check('Rejected session clears connection and pauses every live bot',()=>{Live.rejectSession();assert(!Live.load().linked&&!Live.state.code,'Code retained');assert(Live.state.armed.example.mode==='shadow','Bot still live');assert(Live.status().label==='NOT LINKED','Stale connected banner');});
await check('Unexpected bridge response cannot link',async()=>{Live.probe=async()=>Live.bridge;window.fetch=async()=>({status:500,json:async()=>({error:'failed'})});assert(!(await Live.link('123456')).ok&&!Live.load().linked,'Unexpected response linked');});
await check('Expected ticket-zero response links without enabling real trading',async()=>{window.fetch=async()=>({status:404,json:async()=>({error:'not_found'})});assert((await Live.link('123456')).ok,'Expected response rejected');assert(Live.load().armed.example.mode==='shadow','Link enabled trading');});
await check('One startup panel and one set of account ceilings',()=>{Bots.render();assert(document.querySelectorAll('#liveControl').length===1,'Missing startup');assert(document.querySelectorAll('[data-lvcap="maxOpen"]').length===1,'Duplicate limits');assert(document.querySelector('#liveControl #ldLiveInput'),'Go live outside centre');assert(document.querySelector('#liveControl #liveConnect'),'Connection outside centre');});
await check('Dollar risk input converts to equivalent percentage',()=>{const input=document.getElementById('ldRiskCash');input.value='8';input.dispatchEvent(new Event('change'));assert(LiveDesk.load().riskPct===2,'$8 / $400 must be 2%');assert(Live.load().armed.example.mode==='shadow','Changing risk started trading');});
await check('An order rejected for bad code invokes the session pause',async()=>{
 reset();const originalCheck=Live.check,originalSync=Live.sync;
 Live.check=()=>({ok:true,mode:'live',lots:0.01,sl:1990,tp:2020,desk:true});Live.sync=async()=>{};
 window.fetch=async()=>({ok:false,status:403,json:async()=>({error:'bad_code',message:'Wrong session code'})});
 try{const r=await Live.submit(BOTS[0],{sym:symbols[0],dir:1,entry:2000,sl:1990,tp:2020},{},{});assert(!r.ok&&!Live.load().linked&&Live.state.armed.example.mode==='shadow','Rejected order left live enabled');}
 finally{Live.check=originalCheck;Live.sync=originalSync;}
});
output.textContent+='\n'+passed+'/'+passed+' passed';
reset();Bots.render();
document.getElementById('badCodeDemo').onclick=()=>Live.rejectSession();
}catch(e){output.textContent+='FAIL '+e.stack;console.error(e);}
})();
