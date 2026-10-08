(async()=>{
 const out=document.getElementById('results');let n=0;
 const check=(name,value)=>{if(!value)throw Error(name);out.textContent+='PASS '+name+'\n';n++;};
 try{
  const a={ticket:1,position:7,symbol:'TEST',type:'sell',profit:12,commission:-1,swap:-2,fee:-.5,time:10};
  check('Net includes all returned charges',LiveExplorer.net(a)===8.5);
  const grouped=LiveExplorer.groups([a,{...a,ticket:2,profit:-3,time:20}], [{ticket:7}]);
  check('Partial closes stay one position',grouped.length===1&&grouped[0].deals.length===2&&grouped[0].open);
  check('Closing sell means original buy',grouped[0].side==='buy');
  check('Distinct positions remain distinct',LiveExplorer.groups([a,{...a,position:8}],[]).length===2);
  check('Empty history is supported',LiveExplorer.groups([],[]).length===0);
  out.textContent+='\n'+n+'/'+n+' passed. Below: actual broker read-only snapshot.\n';
  await LiveExplorer.refresh();
  if(LiveExplorer.error)throw Error(LiveExplorer.error);
 }catch(e){out.textContent+='FAIL '+e.message;console.error(e);}
})();
