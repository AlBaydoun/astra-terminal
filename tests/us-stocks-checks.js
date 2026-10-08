(()=>{
const out=document.getElementById('results');let n=0;
const check=(name,fn)=>{fn();n++;out.textContent+='PASS '+name+'\n';};
const assert=(v,msg)=>{if(!v)throw Error(msg);};
try{
 const c=Array.from({length:380},(_,i)=>{const close=100+i*.03+Math.sin(i/4);return {time:Date.UTC(2026,9,1,14)/1000+i*3600,open:close-.1,high:close+.5,low:close-.5,close,volume:100+i%20};});
 const A=Checker.prepare(c);
 check('ATR is supplied in price units',()=>assert(JSON.stringify(A.atr14)===JSON.stringify(IND.atr(c,14)),'ATR differs'));
 check('200-period SMA and 2-period RSI are supplied',()=>{assert(JSON.stringify(A.sma200)===JSON.stringify(IND.sma(A.close,200)),'SMA differs');assert(JSON.stringify(A.rsi2)===JSON.stringify(IND.rsi(A.close,2)),'RSI differs');});
 for(const b of BOTS)check(b.name+' evaluates closed candles without throwing',()=>{const r=b.signal(c,{});assert(Number.isFinite(r.dir),'No decision');});
 check('RSI event can detect both directions',()=>{const j=300;A.usReg[j]=true;A.ny.min[j]=660;A.rsi2[j-1]=50;A.rsi2[j]=5;A.sma200[j]=A.c[j].close-1;assert(Checker.EVENTS.find(e=>e.id==='usRsi2Buy').fn(A,j),'Missing buy');A.rsi2[j]=95;A.sma200[j]=A.c[j].close+1;assert(Checker.EVENTS.find(e=>e.id==='usRsi2Sell').fn(A,j),'Missing sell');});
 out.textContent+='\n'+n+'/'+n+' passed';
}catch(e){out.textContent+='FAIL '+e.stack;console.error(e);}
})();