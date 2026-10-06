const fs=require('fs');
const syms='US100.s US30.s US500.s DE40.s EU50.s FR40.s UK100.s AU200.s JP225.s XAUUSD.s XAGUSD.s EURUSD.s GBPUSD.s USDJPY.s AUDUSD.s USDCAD.s USDCHF.s EURJPY.s GBPJPY.s WTI.s BRENT.s BTCUSD.s ETHUSD.s SOLUSD.s'.split(' ');
const now=Math.floor(Date.now()/1000);
(async()=>{
  const q=await (await fetch('http://127.0.0.1:8644/quotes?symbols='+syms.join(','))).json();
  fs.mkdirSync(require('path').join(__dirname,'rdata'),{recursive:true}); fs.writeFileSync(require('path').join(__dirname,'rdata','quotes.json'),JSON.stringify(q));
  for(const s of syms){
    for(const [tf,days] of [['1h',730],['15m',365]]){
      try{
        const r=await fetch(`http://127.0.0.1:8644/candles?symbol=${s}&tf=${tf}&limit=60000&from=${now-days*86400}`);
        const j=await r.json(); const c=j.candles||[];
        fs.writeFileSync(require('path').join(__dirname,'rdata',`${s}_${tf}.json`),JSON.stringify(c));
        console.log(s,tf,c.length, c.length?new Date(c[0][0]*1000).toISOString().slice(0,10)+'→'+new Date(c[c.length-1][0]*1000).toISOString().slice(0,10):j.error);
      }catch(e){ console.log(s,tf,'ERR',e.message); }
    }
  }
})();
