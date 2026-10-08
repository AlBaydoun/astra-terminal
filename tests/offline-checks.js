(async()=>{
const out=document.getElementById('results');let n=0;
const assert=(v,m)=>{if(!v)throw Error(m);};const check=async(name,fn)=>{await fn();n++;out.textContent+='PASS '+name+'\n';};
const valid={ok:true,account:1,pendingOrders:0,positions:[{ticket:3,symbol:'XAUUSD.s',sl:4000,tp:4200}]};
try{
 await check('Broker-held stop and target accepted',()=>assert(LiveOffline.assess(valid).ok,'Protection missing'));
 await check('Missing stop never ready',()=>assert(!LiveOffline.assess({...valid,positions:[{sl:0,tp:4200}]}).ok,'No stop accepted'));
 await check('Missing target never ready',()=>assert(!LiveOffline.assess({...valid,positions:[{sl:4000,tp:0}]}).ok,'No target accepted'));
 await check('Pending orders require review',()=>assert(!LiveOffline.assess({...valid,pendingOrders:1}).ok,'Pending order ignored'));
 await check('Failed reads are not empty accounts',()=>{let failed=false;try{LiveOffline.assess({ok:true,account:1});}catch(e){failed=true;}assert(failed,'Unknown became empty');});
 await check('Preparation pauses before its read-only check',async()=>{window.fetch=async(url,opts)=>{assert(Live.paused,'Read before pause');assert(!opts.method,'Unexpected write');return {ok:true,json:async()=>valid};};assert((await LiveOffline.prepare()).ok,'Check failed');});
 await check('Network failure stays not ready',async()=>{window.fetch=async()=>{throw Error('offline');};assert(!(await LiveOffline.prepare()).ok,'Offline green');});
 await check('Uncertain order never ready',async()=>{Live.uncertainOrder=true;assert(!(await LiveOffline.prepare()).ok,'Uncertain green');Live.uncertainOrder=false;});
 out.textContent+='\n'+n+'/'+n+' passed';
 LiveOffline.result={...LiveOffline.assess(valid),at:Date.now()};document.getElementById('demo').innerHTML=LiveOffline.view();
 window.fetch=async()=>({ok:true,json:async()=>valid});
 document.getElementById('demo').addEventListener('click',async e=>{
   if(!e.target.closest('[data-act="lvoffline"]'))return;
   const pending=LiveOffline.prepare();
   document.getElementById('demo').innerHTML=LiveOffline.view();
   await pending;
   document.getElementById('demo').innerHTML=LiveOffline.view();
 });
}catch(e){out.textContent+='FAIL '+e.stack;console.error(e);}
})();
